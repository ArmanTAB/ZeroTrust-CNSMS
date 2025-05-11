# backend/app/access/google_drive_routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Body, Query
from typing import List, Annotated, Optional
from datetime import datetime
import json  # Add this import!
from ..auth.routes import get_current_user
from ..auth.models import User
from .models import AccessLogCreate, AccessDecision, DriveAccessRequest, AccessRequestStatus
from .utils import evaluate_access_request, log_access_attempt
from ..integrations.google_drive import GoogleDriveService, SCOPES
from ..db import db
import logging
from bson.objectid import ObjectId
from google.oauth2 import service_account
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/access/google-drive", tags=["google-drive"])

@router.get("/folders", response_model=List[dict])
async def list_google_drive_folders(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """List available Google Drive folders for the current user"""
    try:
        # Get Google Drive service
        drive_service = GoogleDriveService.get_instance()
        
        # Try to get real folders from Google Drive
        try:
            # First attempt to get folders directly from the API
            real_folders = drive_service.list_folders()
            
            # Convert to response format
            folders = []
            for folder in real_folders:
                # Check if folder is in our mapping database
                db_folder = await db.db.folder_mappings.find_one({"folder_id": folder["id"]})
                
                # If folder doesn't exist in DB, add it with default sensitivity
                if not db_folder:
                    db_folder = {
                        "folder_id": folder["id"],
                        "name": folder["name"],
                        "sensitivity": "internal"  # Default sensitivity
                    }
                    await db.db.folder_mappings.insert_one(db_folder)
                
                # Check if user has pending requests for this folder
                pending_request = await db.db.drive_access_requests.find_one({
                    "user_id": str(current_user.id),
                    "folder_id": folder["id"],
                    "status": "pending"
                })
                
                # Build response object
                folders.append({
                    "id": folder["id"],
                    "name": folder["name"],
                    "sensitivity": db_folder.get("sensitivity", "internal"),
                    "hasPendingRequest": pending_request is not None
                })
            
            return folders
            
        except Exception as e:
            logger.error(f"Error getting folders from Google Drive: {str(e)}")
            # Fall back to database folders if Google Drive API fails
            cursor = db.db.folder_mappings.find({})
            folders = []
            
            async for folder in cursor:
                # Check if user has pending requests for this folder
                pending_request = await db.db.drive_access_requests.find_one({
                    "user_id": str(current_user.id),
                    "folder_id": folder["folder_id"],
                    "status": "pending"
                })
                
                folders.append({
                    "id": folder["folder_id"],
                    "name": folder["name"],
                    "sensitivity": folder["sensitivity"],
                    "hasPendingRequest": pending_request is not None
                })
            
            return folders
    except Exception as e:
        logger.error(f"Error listing Google Drive folders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing Google Drive folders: {str(e)}"
        )

@router.post("", response_model=dict)
async def request_google_drive_access(
    access_data: AccessLogCreate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """
    Request access to Google Drive folder.
    This creates a pending access request for admin approval.
    """
    logger.info(f"Processing Google Drive access request from {current_user.email}")
    
    # Set timestamp if not provided
    if not access_data.timestamp:
        access_data.timestamp = datetime.utcnow()
    
    # Extract folder ID from resource
    # Assuming resource is in format "google-drive:folder:{folder_id}"
    parts = access_data.resource.split(":")
    if len(parts) != 3 or parts[0] != "google-drive" or parts[1] != "folder":
        logger.error(f"Invalid resource format: {access_data.resource}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid resource format for Google Drive access"
        )
    
    folder_id = parts[2]
    logger.info(f"Request for folder ID: {folder_id}")
    
    # Get folder name from the database
    folder = await db.db.folder_mappings.find_one({"folder_id": folder_id})
    folder_name = folder["name"] if folder else "Unknown Folder"
    
    # Check if user already has access to this folder
    try:
        drive_service = GoogleDriveService.get_instance()
        has_access, role = drive_service.check_access(folder_id, current_user.email)
        
        if has_access:
            # User already has access, no need to request
            return {
                "status": "success",
                "message": f"You already have {role} access to this folder",
                "folder_id": folder_id,
                "access_granted": True
            }
    except Exception as e:
        logger.error(f"Error checking existing access: {str(e)}")
        # Continue with the request process
    
    # Check if a request already exists
    existing_request = await db.db.drive_access_requests.find_one({
        "user_id": str(current_user.id),
        "folder_id": folder_id,
        "status": "pending"
    })
    
    if existing_request:
        logger.info(f"Found existing pending request: {existing_request['_id']}")
        return {
            "status": "pending",
            "message": "You already have a pending access request for this folder",
            "folder_id": folder_id,
            "request_id": str(existing_request["_id"]),
            "access_granted": False
        }
    
    # Create new access request
    try:
        request_data = {
            "user_id": str(current_user.id),
            "user_email": current_user.email,
            "folder_id": folder_id,
            "folder_name": folder_name,
            "device_id": access_data.device_id,
            "device_ip": access_data.ip_address,
            "request_time": datetime.utcnow(),
            "status": "pending",
            "decision_time": None,
            "decision_by": None,
            "reason": None
        }
        
        # Make sure the collection exists
        collections = await db.db.list_collection_names()
        if 'drive_access_requests' not in collections:
            await db.db.create_collection('drive_access_requests')
        
        result = await db.db.drive_access_requests.insert_one(request_data)
        request_id = str(result.inserted_id)
        
        # Log the access attempt with denied status (pending approval)
        access_decision = AccessDecision(
            access_granted=False,
            reason="Access request is pending approval",
            risk_level=50.0,
            context={"folder_id": folder_id, "request_status": "pending"}
        )
        await log_access_attempt(access_data, access_decision)
        
        return {
            "status": "pending",
            "message": "Access request has been submitted and is pending approval",
            "folder_id": folder_id,
            "request_id": request_id,
            "access_granted": False
        }
    except Exception as e:
        logger.error(f"Error creating access request: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating access request: {str(e)}"
        )

@router.get("/requests", response_model=List[dict])
async def list_drive_access_requests(
    current_user: Annotated[User, Depends(get_current_user)],
    status: Optional[str] = None,
    folder_id: Optional[str] = None
):
    """List Google Drive access requests"""
    # Check if user has admin privileges or is requesting their own requests
    is_admin = current_user.role in ["admin", "security_analyst"]
    
    # Build query
    query = {}
    if status:
        query["status"] = status
    if folder_id:
        query["folder_id"] = folder_id
    
    # For non-admins, only show their own requests
    if not is_admin:
        query["user_id"] = str(current_user.id)
    
    # Get requests from database
    requests = []
    try:
        logger.info(f"Searching for requests with query: {query}")
        cursor = db.db.drive_access_requests.find(query).sort("request_time", -1)
        
        async for request in cursor:
            request["id"] = str(request["_id"])
            request.pop("_id", None)
            requests.append(request)
        
        logger.info(f"Found {len(requests)} access requests matching query")
        return requests
    except Exception as e:
        logger.error(f"Error retrieving access requests: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving access requests: {str(e)}"
        )

# In backend/app/access/google_drive_routes.py

@router.post("/requests/{request_id}/approve")
async def approve_drive_access(
    request_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    reason: Optional[dict] = Body(None)
):
    """Approve a Google Drive access request and grant access in Google Drive"""
    # Log start of approval process
    start_time = datetime.utcnow()
    logger.info(f"=== APPROVAL PROCESS STARTED at {start_time} ===")
    logger.info(f"Request ID: {request_id}")
    logger.info(f"Approver: {current_user.email}")
    
    # Check permissions
    if current_user.role not in ["admin", "security_analyst"]:
        logger.warning(f"Permission denied: {current_user.email} attempted to approve request {request_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to approve access requests"
        )
    
    # Extract reason if provided
    reason_text = reason.get("reason") if reason else None
    
    try:
        # Step 1: Get the request from the database
        request = await db.db.drive_access_requests.find_one({"_id": ObjectId(request_id)})
        if not request:
            logger.error(f"Request {request_id} not found in database")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Access request not found"
            )
        
        logger.info(f"Found request: {json.dumps(request, default=str)}")
        
        # Step 2: Check if request is still pending
        if request["status"] != "pending":
            logger.warning(f"Request {request_id} has status {request['status']}, not 'pending'")
            return {
                "status": "warning",
                "message": f"This request has already been {request['status']}",
                "request": {
                    "id": request_id,
                    "status": request["status"],
                    "decision_time": request.get("decision_time"),
                    "decision_by": request.get("decision_by"),
                    "reason": request.get("reason")
                }
            }
        
        # Step 3: Extract folder_id and user_email from request
        folder_id = request.get("folder_id")
        user_email = request.get("user_email")
        
        if not folder_id or not user_email:
            logger.error(f"Missing folder_id or user_email in request: {request}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing folder_id or user_email in request"
            )
        
        # Step 4: Fix the credentials path
        import os
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        
        # FIXED PATH: Find the backend directory by navigating up from the current file
        # Get the current file's directory
        current_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Navigate up to app directory
        app_dir = os.path.dirname(current_dir)
        
        # Navigate up to backend directory
        backend_dir = os.path.dirname(app_dir)
        
        # Create the proper path to credentials file
        credentials_file = os.path.join(backend_dir, 'credentials', 'google-drive-credentials.json')
        
        # Log the path for debugging
        logger.info(f"Credentials file path: {credentials_file}")
        logger.info(f"File exists: {os.path.exists(credentials_file)}")
        
        # Create credentials
        credentials = service_account.Credentials.from_service_account_file(
            credentials_file, scopes=['https://www.googleapis.com/auth/drive']
        )
        
        # Build service
        service = build('drive', 'v3', credentials=credentials)
        
        logger.info(f"Authenticated as: {credentials.service_account_email}")
        logger.info(f"Granting access to folder {folder_id} for user {user_email}")
        
        # Create permission
        user_permission = {
            'type': 'user',
            'role': 'reader',
            'emailAddress': user_email
        }
        
        # Create permission in Google Drive
        drive_result = None
        drive_error = None
        try:
            drive_result = service.permissions().create(
                fileId=folder_id,
                body=user_permission,
                fields='id,emailAddress,role',
                sendNotificationEmail=True
            ).execute()
            
            logger.info(f"Permission created: {json.dumps(drive_result, default=str)}")
        except Exception as e:
            logger.error(f"Error creating permission in Google Drive: {str(e)}")
            drive_error = str(e)
            # Note: We continue with the request approval even if Drive permission fails
        
        # Step 5: Update the request in the database
        now = datetime.utcnow()
        update_result = await db.db.drive_access_requests.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {
                "status": "approved",
                "decision_time": now,
                "decision_by": str(current_user.id),
                "decision_by_email": current_user.email,
                "reason": reason_text
            }}
        )
        
        logger.info(f"Database update result: modified_count={update_result.modified_count}")
        
        # If using Gmail integration, handle Gmail response
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
        
        # Calculate elapsed time
        end_time = datetime.utcnow()
        elapsed_time = (end_time - start_time).total_seconds()
        logger.info(f"=== APPROVAL PROCESS COMPLETED in {elapsed_time} seconds ===")
        
        # Prepare response
        response = {
            "status": "success",
            "message": f"Access request approved for {user_email}",
            "request": updated_request,
            "drive_access_granted": drive_result is not None,
            "elapsed_time": elapsed_time
        }
        
        if drive_result:
            response["drive_result"] = drive_result
        
        if drive_error:
            response["drive_error"] = drive_error
            response["message"] = f"Request approved but error granting Drive access: {drive_error}"
        
        return response
        
    except Exception as e:
        logger.error(f"Error in approve_drive_access: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error approving access request: {str(e)}"
        )

@router.post("/requests/{request_id}/reject")
async def reject_drive_access(
    request_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    reason: Optional[dict] = Body(None)
):
    """Reject a Google Drive access request"""
    # Log start of rejection process
    start_time = datetime.utcnow()
    logger.info(f"=== REJECTION PROCESS STARTED at {start_time} ===")
    logger.info(f"Request ID: {request_id}")
    logger.info(f"Rejector: {current_user.email}")
    
    # Check permissions
    if current_user.role not in ["admin", "security_analyst"]:
        logger.warning(f"Permission denied: {current_user.email} attempted to reject request {request_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to reject access requests"
        )
    
    # Extract reason if provided
    reason_text = reason.get("reason") if reason else None
    
    try:
        # Step 1: Get the request from the database
        request = await db.db.drive_access_requests.find_one({"_id": ObjectId(request_id)})
        if not request:
            logger.error(f"Request {request_id} not found in database")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Access request not found"
            )
        
        logger.info(f"Found request: {json.dumps(request, default=str)}")
        
        # Step 2: Check if request is still pending
        if request["status"] != "pending":
            logger.warning(f"Request {request_id} has status {request['status']}, not 'pending'")
            return {
                "status": "warning",
                "message": f"This request has already been {request['status']}",
                "request": {
                    "id": request_id,
                    "status": request["status"],
                    "decision_time": request.get("decision_time"),
                    "decision_by": request.get("decision_by"),
                    "reason": request.get("reason")
                }
            }
        
        # Step 3: Update the request in the database
        now = datetime.utcnow()
        update_result = await db.db.drive_access_requests.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {
                "status": "rejected",
                "decision_time": now,
                "decision_by": str(current_user.id),
                "decision_by_email": current_user.email,
                "reason": reason_text
            }}
        )
        
        logger.info(f"Database update result: modified_count={update_result.modified_count}")
        
        # Step 4: If using Gmail integration, handle Gmail response
        if request.get("source") == "gmail" and request.get("external_id"):
            try:
                from ..integrations.gmail_service import GmailService
                gmail_service = GmailService.get_instance()
                await gmail_service.respond_to_share_request(
                    message_id=request["external_id"],
                    approved=False
                )
                logger.info(f"Gmail message marked as read for rejected request: {request.get('external_id')}")
            except Exception as gmail_error:
                logger.error(f"Gmail response failed: {str(gmail_error)}")
        
        # Get the updated request
        updated_request = await db.db.drive_access_requests.find_one({"_id": ObjectId(request_id)})
        if updated_request:
            updated_request["id"] = str(updated_request["_id"])
            updated_request.pop("_id", None)
        
        # Calculate elapsed time
        end_time = datetime.utcnow()
        elapsed_time = (end_time - start_time).total_seconds()
        logger.info(f"=== REJECTION PROCESS COMPLETED in {elapsed_time} seconds ===")
        
        # Prepare response
        response = {
            "status": "success",
            "message": f"Access request rejected for {request.get('user_email')}",
            "request": updated_request,
            "elapsed_time": elapsed_time
        }
        
        return response
        
    except Exception as e:
        logger.error(f"Error in reject_drive_access: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error rejecting access request: {str(e)}"
        )

@router.post("/sync-folders")
async def sync_google_drive_folders(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Sync Google Drive folders with the database"""
    # Check if user has admin privileges
    if current_user.role not in ["admin", "security_analyst"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to sync folders"
        )
    
    try:
        # Get Google Drive service instance
        drive_service = GoogleDriveService.get_instance()
        
        # Get folders from Google Drive API
        folders = drive_service.list_folders()
        
        # Create a list to track synced folders
        synced_folders = []
        
        # Loop through each folder and update or create in database
        for folder in folders:
            folder_id = folder["id"]
            folder_name = folder["name"]
            
            # Check if folder exists in DB
            existing = await db.db.folder_mappings.find_one({"folder_id": folder_id})
            
            if existing:
                # Update existing record
                await db.db.folder_mappings.update_one(
                    {"folder_id": folder_id},
                    {"$set": {
                        "name": folder_name,
                        "last_sync": datetime.utcnow()
                    }}
                )
                
                logger.info(f"Updated existing folder: {folder_name} ({folder_id})")
            else:
                # Determine sensitivity based on folder name
                sensitivity = "internal"  # Default sensitivity
                folder_name_lower = folder_name.lower()
                
                # Simple name-based mapping
                if "hr" in folder_name_lower or "human resources" in folder_name_lower:
                    sensitivity = "confidential"
                elif "finance" in folder_name_lower or "accounting" in folder_name_lower:
                    sensitivity = "critical"  
                elif "admin" in folder_name_lower or "it" in folder_name_lower or "security" in folder_name_lower:
                    sensitivity = "admin"
                
                # Create new record
                await db.db.folder_mappings.insert_one({
                    "folder_id": folder_id,
                    "name": folder_name,
                    "sensitivity": sensitivity,
                    "last_sync": datetime.utcnow()
                })
                
                logger.info(f"Added new folder: {folder_name} ({folder_id}) with sensitivity: {sensitivity}")
            
            # Add to synced folders list
            synced_folders.append({
                "id": folder_id,
                "name": folder_name
            })
        
        logger.info(f"Successfully synchronized {len(synced_folders)} folders with database")
        
        return {
            "status": "success",
            "message": f"Synchronized {len(synced_folders)} folders with database",
            "folders": synced_folders
        }
    except Exception as e:
        logger.error(f"Error syncing Google Drive folders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error syncing Google Drive folders: {str(e)}"
        )
        
@router.get("/check-requests", response_model=dict)
async def check_user_folder_requests(
    current_user: Annotated[User, Depends(get_current_user)],
    folder_id: str = Query(..., description="The Google Drive folder ID to check"),
):
    """Check if the current user has pending requests for a specific folder"""
    try:
        # Find any pending requests for this user and folder
        request = await db.db.drive_access_requests.find_one({
            "user_id": str(current_user.id),
            "folder_id": folder_id
        })
        
        if request:
            return {
                "has_request": True,
                "status": request["status"],
                "request_id": str(request["_id"]),
                "request_time": request["request_time"],
                "folder_name": request["folder_name"]
            }
        else:
            return {
                "has_request": False
            }
    except Exception as e:
        logger.error(f"Error checking folder requests: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking folder requests: {str(e)}"
        )

@router.get("/folder/{folder_id}", response_model=dict)
async def get_folder_details(
    folder_id: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get detailed information about a specific Google Drive folder"""
    try:
        # Check database for folder mapping
        db_folder = await db.db.folder_mappings.find_one({"folder_id": folder_id})
        
        # Try to get real-time details from Google Drive
        drive_service = GoogleDriveService.get_instance()
        try:
            folder_details = drive_service.get_folder_details(folder_id)
            
            # Enhance with data from our database
            if db_folder:
                folder_details["sensitivity"] = db_folder.get("sensitivity", "internal")
            else:
                folder_details["sensitivity"] = "internal"
            
            # Check if user has pending requests
            pending_request = await db.db.drive_access_requests.find_one({
                "user_id": str(current_user.id),
                "folder_id": folder_id,
                "status": "pending"
            })
            
            folder_details["has_pending_request"] = pending_request is not None
            
            return folder_details
        except Exception as e:
            logger.error(f"Error getting folder details from Google Drive: {str(e)}")
            
            # Fall back to database folder
            if db_folder:
                # Check for pending request
                pending_request = await db.db.drive_access_requests.find_one({
                    "user_id": str(current_user.id),
                    "folder_id": folder_id,
                    "status": "pending"
                })
                
                return {
                    "id": db_folder["folder_id"],
                    "name": db_folder["name"],
                    "sensitivity": db_folder["sensitivity"],
                    "error": str(e),
                    "data_source": "database",
                    "has_pending_request": pending_request is not None
                }
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Folder not found: {folder_id}"
                )
    except Exception as e:
        logger.error(f"Error getting folder details: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting folder details: {str(e)}"
        )

@router.get("/summary", response_model=dict)
async def get_access_requests_summary(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get a summary of access requests by status"""
    # Check if user has admin privileges
    is_admin = current_user.role in ["admin", "security_analyst"]
    
    if not is_admin:
        # For regular users, just return their own request counts
        query_base = {"user_id": str(current_user.id)}
    else:
        # For admins, count all requests
        query_base = {}
    
    try:
        # Count requests by status
        pending_count = await db.db.drive_access_requests.count_documents({**query_base, "status": "pending"})
        approved_count = await db.db.drive_access_requests.count_documents({**query_base, "status": "approved"})
        rejected_count = await db.db.drive_access_requests.count_documents({**query_base, "status": "rejected"})
        total_count = await db.db.drive_access_requests.count_documents(query_base)
        
        # Get most recent pending requests for admins
        recent_pending = []
        if is_admin and pending_count > 0:
            cursor = db.db.drive_access_requests.find(
                {"status": "pending"}
            ).sort("request_time", -1).limit(5)
            
            async for req in cursor:
                req["id"] = str(req["_id"])
                req.pop("_id", None)
                recent_pending.append(req)
        
        return {
            "total": total_count,
            "pending": pending_count,
            "approved": approved_count,
            "rejected": rejected_count,
            "recent_pending": recent_pending if is_admin else []
        }
    except Exception as e:
        logger.error(f"Error getting access requests summary: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting access requests summary: {str(e)}"
        )
    
@router.get("/sync-share-requests", response_model=dict)
async def sync_google_drive_share_requests(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Sync Google Drive share requests with our system"""
    # Check if user has admin privileges
    if current_user.role not in ["admin", "security_analyst"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to sync share requests"
        )
    
    try:
        # Method 1: Try to get requests via Drive API
        drive_service = GoogleDriveService.get_instance()
        drive_requests = []
        
        try:
            drive_requests = drive_service.get_pending_share_requests()
        except Exception as e:
            logger.error(f"Error getting share requests via Drive API: {str(e)}")
        
        # Method 2: Get share requests via Gmail
        gmail_requests = []
        try:
            from ..integrations.gmail_service import GmailService
            gmail_service = GmailService.get_instance()
            gmail_requests = gmail_service.get_drive_share_requests()
        except Exception as e:
            logger.error(f"Error getting share requests via Gmail: {str(e)}")
        
        # Combine and de-duplicate requests
        all_requests = []
        processed_folders = set()
        
        # Process Drive API requests
        for req in drive_requests:
            folder_id = req.get('target', {}).get('id')
            if folder_id and folder_id not in processed_folders:
                processed_folders.add(folder_id)
                all_requests.append({
                    'source': 'drive_api',
                    'folder_id': folder_id,
                    'folder_name': req.get('target', {}).get('name', 'Unknown'),
                    'requester': req.get('user', {}).get('emailAddress', 'Unknown'),
                    'timestamp': req.get('timestamp'),
                    'request_id': req.get('activity_id')
                })
        
        # Process Gmail requests
        for req in gmail_requests:
            folder_name = req.get('folder_name')
            requester = req.get('requester')
            
            # Try to find the folder in our mapping
            folder = await db.db.folder_mappings.find_one({"name": folder_name})
            folder_id = folder.get('folder_id') if folder else None
            
            if folder_id and folder_id not in processed_folders:
                processed_folders.add(folder_id)
                all_requests.append({
                    'source': 'gmail',
                    'folder_id': folder_id,
                    'folder_name': folder_name,
                    'requester': requester,
                    'timestamp': req.get('date'),
                    'message_id': req.get('message_id')
                })
        
        # Create access requests in our system for each share request
        created_count = 0
        for req in all_requests:
            # Skip if we can't identify the folder or requester
            if not req.get('folder_id') or not req.get('requester'):
                continue
                
            # Try to find user by email
            user_email = req.get('requester')
            user = await db.db.users.find_one({"email": user_email})
            user_id = str(user["_id"]) if user else None
            
            # Check if request already exists
            existing_request = await db.db.drive_access_requests.find_one({
                "folder_id": req.get('folder_id'),
                "user_email": user_email,
                "status": "pending"
            })
            
            if not existing_request:
                # Create new request
                request_data = {
                    "user_id": user_id,
                    "user_email": user_email,
                    "folder_id": req.get('folder_id'),
                    "folder_name": req.get('folder_name'),
                    "request_time": datetime.utcnow(),
                    "status": "pending",
                    "source": req.get('source'),
                    "external_id": req.get('request_id') or req.get('message_id'),
                    "decision_time": None,
                    "decision_by": None,
                    "reason": None
                }
                
                await db.db.drive_access_requests.insert_one(request_data)
                created_count += 1
        
        return {
            "status": "success",
            "message": f"Synced {len(all_requests)} share requests, created {created_count} new requests",
            "total_found": len(all_requests),
            "new_created": created_count
        }
        
    except Exception as e:
        logger.error(f"Error syncing Google Drive share requests: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error syncing share requests: {str(e)}"
        )
        
@router.post("/sync-gmail-requests", response_model=dict)
async def sync_gmail_share_requests(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Sync Google Drive share requests from Gmail"""
    # Check if user has admin privileges
    if current_user.role not in ["admin", "security_analyst"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to sync share requests"
        )
    
    try:
        logger.info("Starting Gmail share request sync...")
        from ..tasks.sync_gmail import sync_gmail_share_requests as sync_func
        result = await sync_func()
        
        if result["status"] == "success":
            logger.info(f"Gmail sync completed successfully: {result}")
            return {
                "status": "success",
                "message": f"Synced {result['total_found']} Gmail requests, created {result['new_created']} new requests",
                "total_found": result["total_found"],
                "new_created": result["new_created"]
            }
        else:
            logger.error(f"Gmail sync failed: {result}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result["message"]
            )
    except Exception as e:
        logger.error(f"Error syncing Gmail share requests: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error syncing Gmail share requests: {str(e)}"
        )
        
@router.post("/scan-drive-folders", response_model=dict)
async def scan_drive_folders(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Scan Google Drive for folders and update placeholders with real IDs"""
    # Check if user has admin privileges
    if current_user.role not in ["admin", "security_analyst"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to scan folders"
        )
    
    try:
        # Get Google Drive service
        drive_service = GoogleDriveService.get_instance()
        
        # Get all folders from Google Drive
        folders = drive_service.list_folders()
        logger.info(f"Found {len(folders)} folders in Google Drive")
        
        # Get all folder mappings from the database
        all_mappings = []
        cursor = db.db.folder_mappings.find({})
        async for mapping in cursor:
            all_mappings.append(mapping)
        
        # Track updates
        updated_count = 0
        total_folders = len(folders)
        
        # Process each Drive folder
        for drive_folder in folders:
            folder_id = drive_folder["id"]
            folder_name = drive_folder["name"]
            
            # Check if we have any placeholders with matching names
            for mapping in all_mappings:
                if mapping.get("is_placeholder", False) and mapping["name"].lower() == folder_name.lower():
                    # Update the placeholder with the real ID
                    await db.db.folder_mappings.update_one(
                        {"_id": mapping["_id"]},
                        {"$set": {
                            "folder_id": folder_id,
                            "is_placeholder": False,
                            "last_sync": datetime.utcnow()
                        }}
                    )
                    
                    # Also update any pending requests using this placeholder
                    placeholder_id = mapping["folder_id"]
                    await db.db.drive_access_requests.update_many(
                        {"folder_id": placeholder_id, "status": "pending"},
                        {"$set": {
                            "folder_id": folder_id,
                            "is_placeholder": False
                        }}
                    )
                    
                    logger.info(f"Updated placeholder '{mapping['name']}' to real ID: {folder_id}")
                    updated_count += 1
                    break
        
        return {
            "status": "success",
            "message": f"Scanned {total_folders} folders, updated {updated_count} placeholders",
            "total_folders": total_folders,
            "updated_count": updated_count
        }
    except Exception as e:
        logger.error(f"Error scanning Drive folders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error scanning Drive folders: {str(e)}"
        )
        
@router.post("/requests/{request_id}/direct-approve")
async def direct_approve_access(
    request_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    reason: Optional[dict] = Body(None)
):
    """Approve a Google Drive access request using direct approval method"""
    # Check if user has admin privileges
    if current_user.role not in ["admin", "security_analyst"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to approve access requests"
        )
    
    # Extract reason text if provided
    reason_text = reason.get("reason") if reason else None
    
    # Import the direct approval method
    from .direct_approval import direct_approval
    
    # Call the direct approval method that uses the same approach as the test script
    result = await direct_approval(
        request_id=request_id,
        decision_by=str(current_user.id),
        decision_by_email=current_user.email,
        reason=reason_text
    )
    
    # If the direct approval method returns an error, raise an HTTP exception
    if result.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("message", "Unknown error")
        )
    
    # Return the result directly
    return result