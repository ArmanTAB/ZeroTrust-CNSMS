# backend/app/access/routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Annotated, Optional
from datetime import datetime, timedelta
from ..auth.routes import get_current_user
from ..auth.models import User
from .models import AccessLogCreate, AccessLog, AccessDecision
from .utils import (
    evaluate_access_request, log_access_attempt, 
    get_access_logs, get_access_statistics
)
import logging
from ..common.alerts import get_recent_alerts, generate_sample_alerts

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

@router.post("/google-drive", response_model=AccessDecision)
async def request_google_drive_access(
    access_data: AccessLogCreate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """
    Request access to Google Drive folder.
    This evaluates the request based on Zero Trust principles and 
    grants/denies access based on device trust level and user permissions.
    """
    # Set timestamp if not provided
    if not access_data.timestamp:
        access_data.timestamp = datetime.utcnow()
    
    # Extract folder ID from resource
    # Assuming resource is in format "google-drive:folder:{folder_id}"
    parts = access_data.resource.split(":")
    if len(parts) != 3 or parts[0] != "google-drive" or parts[1] != "folder":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid resource format for Google Drive access"
        )
    
    folder_id = parts[2]
    
    # Evaluate request using Zero Trust principles
    decision = await evaluate_access_request(access_data)
    
    # If access is granted, you would actually grant access in Google Drive
    # We'll skip the actual Google Drive integration for now
    if decision.access_granted:
        # Add to decision context
        decision.context["folder_id"] = folder_id
        
        # For now, we'll just log that access was granted
        logger.info(f"Access granted to Google Drive folder {folder_id} for user {current_user.email}")
    
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