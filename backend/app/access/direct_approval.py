# backend/app/access/direct_approval.py
import os
from datetime import datetime
from bson.objectid import ObjectId
from google.oauth2 import service_account
from googleapiclient.discovery import build
import logging
import json

logger = logging.getLogger(__name__)

# Using the same scopes and flow as the test script
SCOPES = ['https://www.googleapis.com/auth/drive']

async def direct_approval(request_id, decision_by, decision_by_email, reason=None):
    """
    Direct approval implementation based on test_service_account.py
    This uses the same working flow as the test script to approve access
    """
    logger.info(f"=== DIRECT APPROVAL PROCESS STARTED ===")
    logger.info(f"Request ID: {request_id}")
    logger.info(f"Approver: {decision_by_email}")
    
    from ..db import db
    
    try:
        # Get the request from the database
        request = await db.db.drive_access_requests.find_one({"_id": ObjectId(request_id)})
        if not request:
            logger.error(f"Request {request_id} not found")
            return {
                "status": "error",
                "message": "Request not found"
            }
        
        logger.info(f"Found request: {json.dumps(request, default=str)}")
        
        # Verify request is pending
        if request.get("status") != "pending":
            logger.warning(f"Request {request_id} is not pending (status: {request.get('status')})")
            return {
                "status": "warning",
                "message": f"Request is not pending (status: {request.get('status')})"
            }
        
        # Extract request details
        folder_id = request.get("folder_id")
        user_email = request.get("user_email")
        
        if not folder_id or not user_email:
            logger.error(f"Missing folder_id or user_email in request")
            return {
                "status": "error",
                "message": "Missing folder_id or user_email in request"
            }
            
        # Find credentials file
        current_dir = os.path.dirname(os.path.abspath(__file__))
        app_dir = os.path.dirname(current_dir) 
        backend_dir = os.path.dirname(app_dir)
        credentials_file = os.path.join(backend_dir, 'credentials', 'google-drive-credentials.json')
        
        # Log file details
        logger.info(f"Using credentials file: {credentials_file}")
        logger.info(f"File exists: {os.path.exists(credentials_file)}")
        
        # Authenticate with Google Drive - using same flow as test script
        credentials = service_account.Credentials.from_service_account_file(
            credentials_file, scopes=SCOPES)
        
        service = build('drive', 'v3', credentials=credentials)
        
        logger.info(f"Authenticated as: {credentials.service_account_email}")
        logger.info(f"Granting access to folder {folder_id} for user {user_email}")
        
        # Create permission with minimal parameters (simpler than the complex attempts in the original code)
        user_permission = {
            'type': 'user',
            'role': 'reader',
            'emailAddress': user_email
        }

        # Simplified permission creation - just like in the test script
        result = service.permissions().create(
            fileId=folder_id,
            body=user_permission,
            fields='id,emailAddress,role',
            sendNotificationEmail=True
        ).execute()
        
        logger.info(f"Permission created: {json.dumps(result, default=str)}")
        
        # Update the request in the database
        now = datetime.utcnow()
        update_result = await db.db.drive_access_requests.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {
                "status": "approved",
                "decision_time": now,
                "decision_by": decision_by,
                "decision_by_email": decision_by_email,
                "reason": reason
            }}
        )
        
        logger.info(f"Database update result: {update_result.modified_count}")
        
        # Handle Gmail response for Gmail-sourced requests
        if request.get("source") == "gmail" and request.get("external_id"):
            try:
                from ..integrations.gmail_service import GmailService
                gmail_service = GmailService.get_instance()
                await gmail_service.respond_to_share_request(
                    message_id=request["external_id"],
                    approved=True,
                    user_email=user_email,
                    folder_id=folder_id
                )
                logger.info(f"Gmail response updated for message: {request.get('external_id')}")
            except Exception as gmail_error:
                logger.error(f"Gmail response failed: {str(gmail_error)}")
        
        # Get the updated request
        updated_request = await db.db.drive_access_requests.find_one({"_id": ObjectId(request_id)})
        if updated_request:
            updated_request["id"] = str(updated_request["_id"])
            updated_request.pop("_id", None)
        
        return {
            "status": "success",
            "message": f"Access request approved for {user_email}",
            "drive_result": result,
            "request": updated_request
        }
        
    except Exception as e:
        logger.error(f"Error in direct approval: {str(e)}", exc_info=True)
        return {
            "status": "error",
            "message": f"Approval failed: {str(e)}"
        }