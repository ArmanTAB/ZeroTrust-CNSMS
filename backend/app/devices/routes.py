# backend/app/devices/routes.py
import socket
import subprocess
import re
import platform
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from typing import List, Annotated, Optional
from datetime import datetime, timedelta
from ..auth.routes import get_current_user
from ..auth.models import User
from .models import DeviceCreate, DeviceUpdate, Device, DeviceStatus, DeviceType
from .utils import (
    register_device, get_device_by_id, update_device, 
    set_device_status, calculate_device_risk_score, get_all_devices,
    get_device_risk_history_data, add_device_risk_history_record
)
import logging
from ..db import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/devices", tags=["devices"])

# IMPORTANT: Scan network route MUST be BEFORE any routes with path parameters like /{device_id}
@router.get("/scan-network", response_model=List[dict])
async def scan_network():
    """Scan the network to discover devices"""
    found_devices = []
    
    # Get local IP address
    def get_my_ip():
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(('10.255.255.255', 1))
            IP = s.getsockname()[0]
        except Exception:
            IP = '127.0.0.1'
        finally:
            s.close()
        return IP

    # Get IP range for scanning
    def get_ip_range():
        my_ip = get_my_ip()
        # Extract first three octets
        ip_parts = my_ip.split('.')
        base_ip = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}"
        return base_ip

    # Get hostname by IP
    def get_hostname(ip):
        try:
            return socket.gethostbyaddr(ip)[0]
        except:
            return "Unknown"

    # Guess device type based on hostname
    def guess_device_type(hostname):
        hostname = hostname.lower()
        if any(word in hostname for word in ['phone', 'iphone', 'android', 'mobile']):
            return DeviceType.MOBILE
        elif any(word in hostname for word in ['laptop', 'notebook']):
            return DeviceType.LAPTOP
        elif any(word in hostname for word in ['server', 'nas', 'cloud']):
            return DeviceType.SERVER
        elif any(word in hostname for word in ['router', 'gateway', 'ap', 'switch']):
            return DeviceType.NETWORK
        elif any(word in hostname for word in ['tv', 'roku', 'firestick', 'chromecast', 'camera']):
            return DeviceType.IOT
        return DeviceType.WORKSTATION  # Default

    # Guess OS type based on hostname
    def guess_os_type(hostname):
        hostname = hostname.lower()
        if any(word in hostname for word in ['win', 'windows', 'microsoft']):
            return "Windows"
        elif any(word in hostname for word in ['mac', 'apple', 'iphone', 'ipad']):
            return "Apple"
        elif any(word in hostname for word in ['android', 'pixel', 'galaxy']):
            return "Android"
        elif any(word in hostname for word in ['linux', 'ubuntu', 'debian']):
            return "Linux"
        return "Unknown OS"

    # Perform scan asynchronously
    async def scan():
        base_ip = get_ip_range()
        logger.info(f"Scanning network range: {base_ip}.0/24")
        
        # Use ARP scan via system command
        try:
            if platform.system() == 'Windows':
                result = subprocess.run(['arp', '-a'], capture_output=True, text=True)
            else:
                result = subprocess.run(['arp', '-a'], capture_output=True, text=True)
            output = result.stdout
        except Exception as e:
            logger.error(f"Error running ARP command: {e}")
            return []
        
        # Parse ARP output
        devices = []
        ip_pattern = re.compile(rf"{re.escape(base_ip)}\.\d+")
        
        for line in output.splitlines():
            if base_ip in line:
                ip_match = ip_pattern.search(line)
                if ip_match:
                    ip = ip_match.group(0)
                    
                    # Extract MAC address
                    mac_match = re.search(r'([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})', line)
                    if not mac_match:
                        continue
                    
                    mac = mac_match.group(0).replace('-', ':').lower()
                    
                    # Create device info
                    hostname = get_hostname(ip)
                    device_id = mac.replace(':', '')
                    device_type = guess_device_type(hostname)
                    
                    # Check if device already exists in DB
                    existing_device = await get_device_by_id(device_id)
                    
                    device_info = {
                        "device_id": device_id,
                        "ip_address": ip,
                        "mac_address": mac,
                        "hostname": hostname,
                        "device_type": device_type,
                        "os_type": guess_os_type(hostname),
                        "is_trusted": False,  # Default to untrusted
                        "system_info": {
                            "detection_method": "network_scan",
                            "scan_time": datetime.utcnow().isoformat()
                        },
                        "already_registered": existing_device is not None
                    }
                    devices.append(device_info)
                    logger.info(f"Found device: {hostname} ({ip}) - {mac}")
        
        return devices
    
    # Execute scan
    found_devices = await scan()
    
    return found_devices

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
    
    # Add risk history record
    result = await add_device_risk_history_record(device_id, risk_score, timestamp)
    
    return {"status": "success", "message": "Risk history record created", "record_id": result}