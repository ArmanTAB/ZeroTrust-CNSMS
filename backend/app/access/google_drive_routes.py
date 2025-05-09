# backend/app/access/google_drive_routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import List, Annotated, Optional
from datetime import datetime
from ..auth.routes import get_current_user
from ..auth.models import User
from .models import AccessLogCreate, AccessDecision, DriveAccessRequest, AccessRequestStatus
from .utils import evaluate_access_request, log_access_attempt, update_drive_access_request
from ..integrations.google_drive import GoogleDriveService
from ..db import db
import logging
from bson.objectid import ObjectId

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
                
                # Build response object
                folders.append({
                    "id": folder["id"],
                    "name": folder["name"],
                    "sensitivity": db_folder.get("sensitivity", "internal")
                })
            
            return folders
        except Exception as e:
            logger.error(f"Error getting folders from Google Drive: {str(e)}")
            # Fall back to database folders if Google Drive API fails
            cursor = db.db.folder_mappings.find({})
            folders = []
            
            async for folder in cursor:
                folders.append({
                    "id": folder["folder_id"],
                    "name": folder["name"],
                    "sensitivity": folder["sensitivity"]
                })
            
            return folders
    except Exception as e:
        logger.error(f"Error listing Google Drive folders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing Google Drive folders: {str(e)}"
        )

@router.post("", response_model=AccessDecision)
async def request_google_drive_access(
    access_data: AccessLogCreate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """
    Request access to Google Drive folder.
    This evaluates the request based on Zero Trust principles and 
    also creates a pending access request for admin approval.
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
            decision = AccessDecision(
                access_granted=True,
                reason=f"You already have {role} access to this folder",
                risk_level=0.0,
                context={"folder_id": folder_id, "existing_role": role}
            )
            
            # Log the access attempt
            await log_access_attempt(access_data, decision)
            
            return decision
    except Exception as e:
        logger.error(f"Error checking existing access: {str(e)}")
        # Continue with the request process
    
    # Evaluate request using Zero Trust principles
    decision = await evaluate_access_request(access_data)
    
    # Create an access request record regardless of the decision
    try:
        # Check if a request already exists
        existing_request = await db.db.drive_access_requests.find_one({
            "user_id": str(current_user.id),
            "folder_id": folder_id,
            "status": AccessRequestStatus.PENDING
        })
        
        if existing_request:
            logger.info(f"Found existing request: {existing_request['_id']}")
            request_id = str(existing_request["_id"])
        else:
            # Create new request
            request_data = {
                "user_id": str(current_user.id),
                "user_email": current_user.email,
                "folder_id": folder_id,
                "folder_name": folder_name,
                "device_id": access_data.device_id,
                "device_ip": access_data.ip_address,
                "request_time": datetime.utcnow(),
                "status": AccessRequestStatus.PENDING,
                "decision_time": None,
                "decision_by": None,
                "reason": None
            }
            
            result = await db.db.drive_access_requests.insert_one(request_data)
            request_id = str(result.inserted_id)
            logger.info(f"Created new access request with ID: {request_id}")
    except Exception as e:
        logger.error(f"Error creating access request: {str(e)}")
        request_id = None
    
    # Adjust the decision - we'll always return "pending" initially
    decision.access_granted = False
    decision.reason = "Access request has been submitted and is pending approval."
    decision.context["folder_id"] = folder_id
    decision.context["request_status"] = "pending"
    
    # Log the access attempt
    await log_access_attempt(access_data, decision)
    
    return decision

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
        cursor = db.db.drive_access_requests.find(query).sort("request_time", -1)
        
        async for request in cursor:
            request["id"] = str(request["_id"])
            request.pop("_id", None)
            requests.append(request)
    except Exception as e:
        logger.error(f"Error retrieving access requests: {str(e)}")
    
    return requests

@router.post("/requests/{request_id}/approve")
async def approve_drive_access(
    request_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    reason: Optional[dict] = Body(None)
):
    """Approve a Google Drive access request and grant access in Google Drive"""
    # Check if user has admin privileges
    if current_user.role not in ["admin", "security_analyst"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to approve access requests"
        )
    
    # Extract reason string if provided
    reason_text = reason.get("reason") if reason else None
    
    # Get the request details
    request = await db.db.drive_access_requests.find_one({"_id": ObjectId(request_id)})
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access request not found"
        )
    
    # Update the request status
    updated_request = await update_drive_access_request(
        request_id=request_id,
        status="approved",
        decision_by=str(current_user.id),
        reason=reason_text
    )
    
    if not updated_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access request not found"
        )
    
    # Grant actual access in Google Drive
    success = False
    error_message = None
    try:
        drive_service = GoogleDriveService.get_instance()
        
        # Check if user already has access
        has_access, _ = drive_service.check_access(
            request["folder_id"], 
            request["user_email"]
        )
        
        if not has_access:
            # Grant access with reader role
            drive_service.grant_access(
                request["folder_id"],
                request["user_email"],
                role="reader"  # Default to reader role
            )
        
        success = True
    except Exception as e:
        logger.error(f"Error granting Google Drive access: {str(e)}")
        error_message = str(e)
        # We'll still return success since the request was approved
        # But include the error in the response
    
    response = {
        "status": "success",
        "message": f"Access request approved for {updated_request['user_email']}",
        "request": updated_request,
        "drive_access_granted": success
    }
    
    if error_message:
        response["drive_error"] = error_message
    
    return response

@router.post("/requests/{request_id}/reject")
async def reject_drive_access(
    request_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    reason: Optional[dict] = Body(None)
):
    """Reject a Google Drive access request"""
    # Check if user has admin privileges
    if current_user.role not in ["admin", "security_analyst"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to reject access requests"
        )
    
    # Extract reason string if provided
    reason_text = reason.get("reason") if reason else None
    
    # Update the request status
    updated_request = await update_drive_access_request(
        request_id=request_id,
        status="rejected",
        decision_by=str(current_user.id),
        reason=reason_text
    )
    
    if not updated_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access request not found"
        )
    
    return {
        "status": "success",
        "message": f"Access request rejected for {updated_request['user_email']}",
        "request": updated_request
    }

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
        drive_service = GoogleDriveService.get_instance()
        success = drive_service.sync_folder_mappings()
        
        if success:
            return {
                "status": "success",
                "message": "Google Drive folders synchronized successfully"
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to synchronize Google Drive folders"
            )
    except Exception as e:
        logger.error(f"Error syncing Google Drive folders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error syncing Google Drive folders: {str(e)}"
        )