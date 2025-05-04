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
    """Scan network to find devices using methods that work in restricted environments"""
    base_ip = get_ip_range()
    logger.info(f"Scanning network range: {base_ip}.0/24")
    
    devices = []
    found_device_ids = set()  # To track already found devices
    
    # Method 1: Simple socket connection test for common network devices
    common_ports = [80, 443, 22, 445, 139, 8080, 21, 25, 53]  # HTTP, HTTPS, SSH, SMB, etc.
    common_ips = [1, 2, 3, 4, 5, 10, 20, 30, 100, 200, 250, 254]  # Common IP addresses in networks
    
    async def check_host(ip):
        try:
            # Try to connect to common ports with a short timeout
            for port in common_ports:
                # Use a regular, synchronous socket in an executor to avoid blocking
                loop = asyncio.get_event_loop()
                
                def try_connect():
                    try:
                        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        s.settimeout(0.2)  # 200ms timeout
                        result = s.connect_ex((ip, port))
                        s.close()
                        return result == 0  # True if connection succeeded
                    except Exception as e:
                        logger.debug(f"Socket connect error for {ip}:{port} - {str(e)}")
                        return False
                
                # Run the connection attempt in a thread pool
                try:
                    is_active = await loop.run_in_executor(None, try_connect)
                    if is_active:
                        logger.info(f"Found active host at {ip} on port {port}")
                        
                        # Generate a deterministic MAC address based on IP
                        ip_parts = [int(part) for part in ip.split('.')]
                        pseudo_mac = f"02:00:{ip_parts[0]:02x}:{ip_parts[1]:02x}:{ip_parts[2]:02x}:{ip_parts[3]:02x}"
                        
                        device_id = pseudo_mac.replace(':', '')
                        
                        # Skip if already found
                        if device_id in found_device_ids:
                            return
                        
                        found_device_ids.add(device_id)
                        
                        # Try to get hostname (safely)
                        hostname = "Unknown"
                        try:
                            # Use socket in executor to get hostname
                            def get_host_name():
                                try:
                                    return socket.gethostbyaddr(ip)[0]
                                except:
                                    return "Unknown"
                            
                            hostname = await loop.run_in_executor(None, get_host_name)
                        except Exception as e:
                            logger.debug(f"Hostname lookup failed for {ip}: {str(e)}")
                        
                        # Check if device exists in DB
                        existing_device = await get_device_by_id(device_id)
                        
                        # Determine device type from hostname and port
                        device_type = DeviceType.WORKSTATION  # Default
                        if port == 80 or port == 443 or port == 8080:
                            if ip_parts[3] < 20:  # Low IP often indicates network equipment
                                device_type = DeviceType.NETWORK
                        elif port == 445 or port == 139:
                            device_type = DeviceType.WORKSTATION  # File sharing - likely a PC
                        
                        # Guess OS
                        os_type = "Unknown OS"
                        if "win" in hostname.lower():
                            os_type = "Windows"
                        elif "mac" in hostname.lower() or "apple" in hostname.lower():
                            os_type = "Apple"
                        
                        # Create device info
                        device_info = {
                            "device_id": device_id,
                            "ip_address": ip,
                            "mac_address": pseudo_mac,
                            "hostname": hostname,
                            "device_type": device_type,
                            "os_type": os_type,
                            "is_trusted": False,
                            "system_info": {
                                "detection_method": "port_scan",
                                "scan_time": datetime.utcnow().isoformat(),
                                "open_port": port,
                                "note": "MAC address is deterministically generated from IP"
                            },
                            "already_registered": existing_device is not None
                        }
                        devices.append(device_info)
                        logger.info(f"Added device via port scan: {hostname} ({ip}) - {pseudo_mac} - Port {port} open")
                        break  # Found an open port, no need to check more
                except Exception as e:
                    logger.debug(f"Executor error for {ip}:{port} - {str(e)}")
        except Exception as e:
            logger.error(f"Error checking host {ip}: {str(e)}")
    
    # Create tasks for IPs to check
    tasks = []
    for i in common_ips:
        ip = f"{base_ip}.{i}"
        tasks.append(check_host(ip))
    
    # Run all tasks concurrently
    await asyncio.gather(*tasks)
    
    # Always add current device info as a reliable fallback
    try:
        # Get current device info
        my_ip = get_my_ip()
        hostname = socket.gethostname()
        
        # Generate a deterministic MAC for consistency
        ip_parts = [int(part) for part in my_ip.split('.')]
        mac = f"02:00:{ip_parts[0]:02x}:{ip_parts[1]:02x}:{ip_parts[2]:02x}:{ip_parts[3]:02x}"
        
        device_id = mac.replace(':', '')
        
        # Skip if already found
        if device_id not in found_device_ids:
            found_device_ids.add(device_id)
            
            # Check if device exists in DB
            existing_device = await get_device_by_id(device_id)
            
            # Create device info for current device
            device_info = {
                "device_id": device_id,
                "ip_address": my_ip,
                "mac_address": mac,
                "hostname": hostname,
                "device_type": DeviceType.WORKSTATION,
                "os_type": f"{platform.system()}",
                "is_trusted": True,  # Current device is trusted
                "system_info": {
                    "detection_method": "current_device",
                    "scan_time": datetime.utcnow().isoformat()
                },
                "already_registered": existing_device is not None
            }
            devices.append(device_info)
            logger.info(f"Added current device: {hostname} ({my_ip}) - {mac}")
    except Exception as e:
        logger.error(f"Error getting current device info: {str(e)}")
    
    # If no devices found, add a placeholder for the local machine
    if not devices:
        try:
            # Last resort fallback - add localhost
            my_ip = "127.0.0.1"
            hostname = "localhost"
            mac = "02:00:7f:00:00:01"  # Deterministic for 127.0.0.1
            device_id = mac.replace(':', '')
            
            device_info = {
                "device_id": device_id,
                "ip_address": my_ip,
                "mac_address": mac,
                "hostname": hostname,
                "device_type": DeviceType.WORKSTATION,
                "os_type": f"{platform.system()}",
                "is_trusted": True,
                "system_info": {
                    "detection_method": "fallback",
                    "scan_time": datetime.utcnow().isoformat()
                },
                "already_registered": False
            }
            devices.append(device_info)
            logger.info(f"Added fallback device: {hostname} ({my_ip}) - {mac}")
        except Exception as e:
            logger.error(f"Error adding fallback device: {str(e)}")
    
    return devices

# Helper function to asynchronously get hostname
async def get_hostname(ip):
    try:
        # Run the hostname lookup in a thread pool since socket.gethostbyaddr is blocking
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: socket.gethostbyaddr(ip)[0])
    except Exception as e:
        # Log specific error for debugging
        logger.debug(f"Hostname lookup failed for {ip}: {str(e)}")
        return "Unknown"

# Helper functions from the original code
def get_ip_range():
    my_ip = get_my_ip()
    # Extract first three octets
    ip_parts = my_ip.split('.')
    base_ip = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}"
    return base_ip

def get_my_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

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