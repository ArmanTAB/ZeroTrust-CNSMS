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