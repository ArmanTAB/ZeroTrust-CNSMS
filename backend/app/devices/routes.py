# backend/app/devices/routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from typing import List, Annotated, Optional
from datetime import datetime, timedelta
from ..auth.routes import get_current_user
from ..auth.models import User
from .models import DeviceCreate, DeviceUpdate, Device, DeviceStatus
from .utils import (
    register_device, get_device_by_id, update_device, 
    set_device_status, calculate_device_risk_score, get_all_devices,
    get_device_risk_history_data, add_device_risk_history_record  # Added import here
)
import logging
from ..db import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/devices", tags=["devices"])

@router.post("/register", response_model=Device)
async def register_new_device(device_data: DeviceCreate):
    """Register a new device in the system or update existing one"""
    device = await register_device(device_data)
    return device

@router.get("/", response_model=List[Device])
async def list_devices(
    current_user: Annotated[User, Depends(get_current_user)],
    skip: int = 0, 
    limit: int = 100,
    device_type: Optional[str] = None,
    status: Optional[str] = None,
    is_trusted: Optional[bool] = None
):
    """Get all devices with optional filtering"""
    devices = await get_all_devices(skip, limit)
    
    # Apply filters if provided
    if device_type:
        devices = [d for d in devices if d["device_type"] == device_type]
    
    if status:
        devices = [d for d in devices if d["status"] == status]
    
    if is_trusted is not None:
        devices = [d for d in devices if d["is_trusted"] == is_trusted]
    
    return devices

@router.get("/statistics", response_model=dict)
async def get_device_statistics(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get device statistics for dashboard"""
    all_devices = await get_all_devices()
    
    # Calculate statistics
    stats = {
        "total": len(all_devices),
        "active": len([d for d in all_devices if d["status"] == DeviceStatus.ACTIVE]),
        "inactive": len([d for d in all_devices if d["status"] == DeviceStatus.INACTIVE]),
        "quarantined": len([d for d in all_devices if d["status"] == DeviceStatus.QUARANTINED]),
        "blocked": len([d for d in all_devices if d["status"] == DeviceStatus.BLOCKED]),
        "pending": len([d for d in all_devices if d["status"] == DeviceStatus.PENDING]),
        "trusted": len([d for d in all_devices if d.get("is_trusted", False)]),
        "untrusted": len([d for d in all_devices if not d.get("is_trusted", True)]),
        "risk_distribution": {
            "low": len([d for d in all_devices if d.get("risk_score", 0) <= 30]),
            "medium": len([d for d in all_devices if 30 < d.get("risk_score", 0) <= 70]),
            "high": len([d for d in all_devices if d.get("risk_score", 0) > 70])
        }
    }
    
    return stats

@router.get("/{device_id}", response_model=Device)
async def get_device(
    device_id: str, 
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get a specific device by ID"""
    device = await get_device_by_id(device_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device with ID {device_id} not found"
        )
    return device

@router.put("/{device_id}", response_model=Device)
async def update_device_info(
    device_id: str, 
    update_data: DeviceUpdate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Update device information"""
    # Verify device exists
    device = await get_device_by_id(device_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device with ID {device_id} not found"
        )
    
    # Update device
    updated_device = await update_device(device_id, update_data)
    if not updated_device:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update device"
        )
    
    return updated_device

@router.put("/{device_id}/status")
async def update_device_status(
    device_id: str, 
    status_data: dict,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Update device status (active, inactive, quarantined, blocked)"""
    try:
        status_value = status_data.get("status")
        status_enum = DeviceStatus(status_value)
    except (ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status value. Must be one of: {[s.value for s in DeviceStatus]}"
        )
    
    # Verify device exists
    device = await get_device_by_id(device_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device with ID {device_id} not found"
        )
    
    # Update status
    result = await set_device_status(device_id, status_enum)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update device status"
        )
    
    return {"status": "success", "device_id": device_id, "new_status": status_enum}

@router.get("/{device_id}/risk", response_model=dict)
async def get_device_risk(
    device_id: str, 
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Get and calculate current risk score for a device"""
    # Verify device exists
    device = await get_device_by_id(device_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device with ID {device_id} not found"
        )
    
    # Calculate risk score
    risk_score = await calculate_device_risk_score(device_id)
    
    return {
        "device_id": device_id, 
        "risk_score": risk_score,
        "risk_level": "high" if risk_score > 70 else "medium" if risk_score > 30 else "low",
        "timestamp": datetime.utcnow()
    }

@router.get("/{device_id}/risk-history", response_model=List[dict])
async def get_device_risk_history(
    device_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    days: int = 7
):
    """Get historical risk scores for a device"""
    # Verify device exists
    device = await get_device_by_id(device_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device with ID {device_id} not found"
        )
    
    # Get risk history from utility function
    risk_history = await get_device_risk_history_data(device_id, days)
    
    return risk_history

@router.post("/{device_id}/risk-history", status_code=status.HTTP_201_CREATED)
async def add_risk_history_record(
    device_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    risk_data: dict = Body(..., example={"risk_score": 75, "timestamp": "2025-04-20T14:30:00"})
):
    """Add a record to a device's risk history
    
    Use this endpoint to manually add risk records.
    You can specify a date in the past to create historical data.
    """
    # Verify device exists
    device = await get_device_by_id(device_id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device with ID {device_id} not found"
        )
    
    # Validate data
    risk_score = risk_data.get("risk_score")
    timestamp_str = risk_data.get("timestamp")
    
    if risk_score is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="risk_score is required"
        )
    
    if not isinstance(risk_score, (int, float)) or risk_score < 0 or risk_score > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="risk_score must be a number between 0 and 100"
        )
    
    # Process timestamp
    timestamp = None
    if timestamp_str:
        try:
            timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid timestamp format. Use ISO 8601 (e.g., 2025-04-20T14:30:00)"
            )
    else:
        timestamp = datetime.utcnow()
    
    # Add risk history record using the properly imported function
    result = await add_device_risk_history_record(device_id, risk_score, timestamp)
    
    return {"status": "success", "message": "Risk history record created", "record_id": result}