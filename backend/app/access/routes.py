# backend/app/access/routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from typing import List, Annotated, Optional
from datetime import datetime, timedelta
from ..auth.routes import get_current_user
from ..auth.models import User
from .models import AccessLogCreate, AccessLog, AccessDecision
from .utils import (
    evaluate_access_request, log_access_attempt, 
    get_access_logs, get_access_statistics,
    create_drive_access_request, get_drive_access_requests,
    update_drive_access_request
)
import logging
from ..common.alerts import get_recent_alerts, generate_sample_alerts
from ..db import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/access", tags=["access"])

@router.post("/request", response_model=AccessDecision)
async def request_access(access_data: AccessLogCreate):
    """
    Request access to a resource.
    This endpoint evaluates the access request but does not log it.
    """
    # Set timestamp if not provided
    if not access_data.timestamp:
        access_data.timestamp = datetime.utcnow()
    
    # Evaluate request using Zero Trust principles
    decision = await evaluate_access_request(access_data)
    
    return decision

@router.post("/log", response_model=dict)
async def log_access(access_data: AccessLogCreate):
    """
    Log an access attempt and return the decision.
    This endpoint evaluates the access request and logs it.
    """
    # Set timestamp if not provided
    if not access_data.timestamp:
        access_data.timestamp = datetime.utcnow()
    
    # Evaluate request
    decision = await evaluate_access_request(access_data)
    
    # Log the access attempt
    log = await log_access_attempt(access_data, decision)
    
    return {
        "access_granted": decision.access_granted,
        "reason": decision.reason,
        "risk_level": decision.risk_level,
        "log_id": log["_id"]
    }

@router.get("/logs", response_model=List[AccessLog])
async def get_access_log_entries(
    current_user: Annotated[User, Depends(get_current_user)],
    device_id: Optional[str] = None,
    user_id: Optional[str] = None,
    resource: Optional[str] = None,
    access_granted: Optional[bool] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100
):
    """Get access logs with optional filtering"""
    logs = await get_access_logs(
        device_id=device_id,
        user_id=user_id,
        resource=resource,
        access_granted=access_granted,
        start_time=start_time,
        end_time=end_time,
        skip=skip,
        limit=limit
    )
    
    return logs

@router.get("/statistics", response_model=dict)
async def get_access_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    days: int = 7
):
    """Get statistics about access attempts"""
    start_time = datetime.utcnow() - timedelta(days=days)
    end_time = datetime.utcnow()
    
    stats = await get_access_statistics(start_time, end_time)
    
    return stats

@router.get("/activity", response_model=list)
async def get_access_activity(
    current_user: Annotated[User, Depends(get_current_user)],
    days: int = 7
):
    """Get access activity stats by day of week for the last N days"""
    # Вычисляем дату начала периода
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    # Получаем все логи за указанный период
    logs = await get_access_logs(
        start_time=start_date,
        end_time=end_date,
        skip=0,
        limit=1000  # Увеличиваем лимит, чтобы получить все логи
    )
    
    # Создаем словарь для хранения статистики по дням недели
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    activity_data = {day: {"allowed": 0, "denied": 0} for day in day_names}
    
    # Анализируем каждый лог и обновляем статистику
    for log in logs:
        # Обрабатываем timestamp, который может быть строкой или datetime объектом
        timestamp = log["timestamp"]
        if isinstance(timestamp, str):
            # Если строка, попробуем преобразовать в datetime
            try:
                log_date = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                # Если не удалось преобразовать, попробуем другой формат
                try:
                    log_date = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S.%f")
                except ValueError:
                    try:
                        log_date = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S")
                    except ValueError:
                        # Если всё равно не удалось, пропускаем этот лог
                        continue
        else:
            # Если это уже объект datetime, используем его
            log_date = timestamp
        
        # Получаем день недели (0 = Monday, 6 = Sunday)
        day_index = log_date.weekday()
        day_of_week = day_names[day_index]
        
        # Обновляем статистику
        if log.get("access_granted", False):
            activity_data[day_of_week]["allowed"] += 1
        else:
            activity_data[day_of_week]["denied"] += 1
    
    # Преобразуем словарь в список объектов для отправки на фронтенд
    result = [
        {"day": day, "allowed": activity_data[day]["allowed"], "denied": activity_data[day]["denied"]}
        for day in day_names
    ]
    
    return result

@router.get("/alerts", response_model=List[dict])
async def get_security_alerts(
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = 5,
    resolved: bool = False
):
    """Get recent security alerts"""
    # Generate sample alerts if none exist
    await generate_sample_alerts()
    
    alerts = await get_recent_alerts(limit, resolved)
    return alerts

# Google Drive access endpoints

@router.post("/google-drive", response_model=AccessDecision)
async def request_google_drive_access(
    access_data: AccessLogCreate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """
    Request access to Google Drive folder.
    This evaluates the request based on Zero Trust principles and 
    also creates a pending access request for admin approval.
    """
    from bson.objectid import ObjectId
    
    logger.info(f"Processing new Google Drive access request from {current_user.email}")
    
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
    logger.info(f"Folder name: {folder_name}, Found in DB: {folder is not None}")
    
    # Evaluate request using Zero Trust principles
    decision = await evaluate_access_request(access_data)
    
    # Ensure the drive_access_requests collection exists
    collections = await db.db.list_collection_names()
    if 'drive_access_requests' not in collections:
        logger.info("Creating drive_access_requests collection as it doesn't exist")
        await db.db.create_collection('drive_access_requests')
    
    # Create an access request record regardless of the decision
    try:
        # Directly create the request document without using helper function
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
        
        # First check if a request already exists
        existing_request = await db.db.drive_access_requests.find_one({
            "user_id": str(current_user.id),
            "folder_id": folder_id,
            "status": "pending"
        })
        
        if existing_request:
            logger.info(f"Found existing request: {existing_request['_id']}")
            request_id = str(existing_request["_id"])
        else:
            # Insert the new request
            result = await db.db.drive_access_requests.insert_one(request_data)
            request_id = str(result.inserted_id)
            logger.info(f"Created new access request with ID: {request_id}")
            
            # Verify the request was saved
            check = await db.db.drive_access_requests.find_one({"_id": result.inserted_id})
            if check:
                logger.info(f"Successfully verified request exists with ID: {request_id}")
            else:
                logger.error(f"Failed to verify request after creation: {request_id}")
    except Exception as e:
        logger.error(f"Error creating access request: {str(e)}")
        # Log the full error traceback
        import traceback
        logger.error(traceback.format_exc())
    
    # Adjust the decision - we'll always return "pending" initially
    decision.access_granted = False
    decision.reason = "Access request has been submitted and is pending approval."
    decision.context["folder_id"] = folder_id
    decision.context["request_status"] = "pending"
    
    # Log the access attempt
    log = await log_access_attempt(access_data, decision)
    
    return decision

@router.get("/google-drive/folders", response_model=List[dict])
async def list_google_drive_folders(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """List available Google Drive folders for the current user"""
    try:
        # For now, just get the folder mappings from the database
        # Later we'll integrate with the actual Google Drive API
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
        
# Замените функцию list_drive_access_requests в backend/app/access/routes.py

@router.get("/google-drive/requests", response_model=List[dict])
async def list_drive_access_requests(
    current_user: Annotated[User, Depends(get_current_user)],
    status: Optional[str] = None,
    folder_id: Optional[str] = None
):
    """List Google Drive access requests"""
    # Build query
    query = {}
    if status:
        query["status"] = status
    if folder_id:
        query["folder_id"] = folder_id
    
    # For non-admins, only show their own requests
    if current_user.role not in ["admin", "security_analyst"]:
        query["user_id"] = str(current_user.id)
    
    # Get requests directly from database
    requests = []
    try:
        cursor = db.db.drive_access_requests.find(query).sort("request_time", -1)
        
        async for request in cursor:
            request["id"] = str(request["_id"])
            request.pop("_id", None)
            requests.append(request)
    except Exception as e:
        logger.error(f"Error retrieving access requests: {str(e)}")
    
    logger.info(f"Found {len(requests)} requests matching query {query}")
    return requests

@router.post("/google-drive/requests/{request_id}/approve")
async def approve_drive_access(
    request_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    reason: Optional[dict] = Body(None)
):
    """Approve a Google Drive access request"""
    # Check if user has admin privileges
    if current_user.role not in ["admin", "security_analyst"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to approve access requests"
        )
    
    # Extract reason string if provided
    reason_text = reason.get("reason") if reason else None
    
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
    
    # Grant actual access in Google Drive (implement this part with the Google Drive API)
    try:
        # This would be where you call the Google Drive API to share the folder
        # with the user's email
        pass
    except Exception as e:
        logger.error(f"Error granting Google Drive access: {str(e)}")
        # We'll still return success since the request was approved
    
    return {
        "status": "success",
        "message": f"Access request approved for {updated_request['user_email']}",
        "request": updated_request
    }

@router.post("/google-drive/requests/{request_id}/reject")
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