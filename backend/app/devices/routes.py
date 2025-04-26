# backend/app/devices/routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Annotated, Optional
from datetime import datetime, timedelta
from ..auth.routes import get_current_user
from ..auth.models import User
from .models import DeviceCreate, DeviceUpdate, Device, DeviceStatus
from .utils import (
    register_device, get_device_by_id, update_device, 
    set_device_status, calculate_device_risk_score, get_all_devices
)
import logging

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