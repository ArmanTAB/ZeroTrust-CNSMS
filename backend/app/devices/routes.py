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
@router.get("/scan-network", response_model=List[dict])
async def scan_network():
    """Scan network to find devices using nmap with specified path and fallbacks"""
    import os
    import socket
    import subprocess
    import re
    import platform
    import asyncio
    import uuid
    from datetime import datetime
    
    base_ip = get_ip_range()
    logger.info(f"Scanning network range: {base_ip}.0/24")
    
    devices = []
    found_device_ids = set()  # To track already found devices
    
    # First try nmap scan if available
    try:
        import nmap
        
        # Run the scan in a separate thread to avoid blocking
        def run_nmap_scan():
            try:
                # Explicitly specify the nmap path for Windows
                # Try common installation paths
                nmap_paths = [
                    "C:\\Program Files (x86)\\Nmap\\nmap.exe",
                    "C:\\Program Files\\Nmap\\nmap.exe",
                ]
                
                nm = None
                for path in nmap_paths:
                    if os.path.exists(path):
                        logger.info(f"Found nmap at: {path}")
                        nm = nmap.PortScanner(nmap_search_path=[path])
                        break
                
                if nm is None:
                    logger.error("nmap executable not found in common paths. Using fallback methods.")
                    return []
                
                # Perform a ping scan (-sn) to discover hosts without port scanning
                scan_result = nm.scan(hosts=f"{base_ip}.0/24", arguments="-sn")
                
                discovered_devices = []
                
                # Process scan results
                for host in nm.all_hosts():
                    try:
                        # Get hostname if available
                        hostname = nm[host].hostname() or "Unknown"
                        if not hostname or hostname == "":
                            hostname = "Unknown"
                        
                        # Try to determine MAC address from scan results
                        mac = None
                        if 'addresses' in nm[host] and 'mac' in nm[host]['addresses']:
                            mac = nm[host]['addresses']['mac']
                        else:
                            # Generate a deterministic MAC if we can't find the real one
                            ip_parts = [int(part) for part in host.split('.')]
                            mac = f"02:00:{ip_parts[0]:02x}:{ip_parts[1]:02x}:{ip_parts[2]:02x}:{ip_parts[3]:02x}"
                        
                        # Create device ID from MAC
                        device_id = mac.replace(':', '').lower()
                        
                        # Create device info
                        device_info = {
                            "device_id": device_id,
                            "ip_address": host,
                            "mac_address": mac,
                            "hostname": hostname,
                            "device_type": guess_device_type(hostname),
                            "os_type": guess_os_type(hostname),
                            "is_trusted": False,
                            "system_info": {
                                "detection_method": "nmap_scan",
                                "scan_time": datetime.utcnow().isoformat(),
                            }
                        }
                        
                        discovered_devices.append(device_info)
                        logger.info(f"Found device via nmap: {hostname} ({host}) - {mac}")
                    except Exception as e:
                        logger.error(f"Error processing nmap result for host {host}: {str(e)}")
                
                return discovered_devices
            except Exception as e:
                logger.error(f"Error in nmap scan: {str(e)}")
                return []
        
        # Try nmap scan first
        loop = asyncio.get_event_loop()
        discovered_devices = await loop.run_in_executor(None, run_nmap_scan)
        
        # If nmap scan found devices, process them
        if discovered_devices:
            # Check which devices are already registered
            for device in discovered_devices:
                if device["device_id"] in found_device_ids:
                    continue
                    
                found_device_ids.add(device["device_id"])
                existing_device = await get_device_by_id(device["device_id"])
                device["already_registered"] = existing_device is not None
                devices.append(device)
    
    except ImportError:
        logger.error("python-nmap is not installed. Using fallback methods.")
    except Exception as e:
        logger.error(f"Error with nmap scan: {str(e)}. Using fallback methods.")
    
    # If no devices found by nmap, try ARP scan
    if not devices:
        logger.info("Nmap scan failed or found no devices. Falling back to ARP scan.")
        
        # Try ARP scan
        try:
            # Run the arp -a command which is available on Windows
            loop = asyncio.get_event_loop()
            
            def run_arp():
                try:
                    result = subprocess.run(['arp', '-a'], capture_output=True, text=True)
                    return result.stdout
                except Exception as e:
                    logger.error(f"Error running ARP command: {str(e)}")
                    return ""
            
            arp_output = await loop.run_in_executor(None, run_arp)
            
            # Parse ARP output to find devices
            ip_pattern = re.compile(rf"{re.escape(base_ip)}\.\d+")
            mac_pattern = re.compile(r'([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})')
            
            for line in arp_output.splitlines():
                ip_match = ip_pattern.search(line)
                mac_match = mac_pattern.search(line)
                
                if ip_match and mac_match:
                    ip = ip_match.group(0)
                    mac = mac_match.group(0).replace('-', ':').lower()
                    device_id = mac.replace(':', '')
                    
                    # Skip if already found
                    if device_id in found_device_ids:
                        continue
                    
                    found_device_ids.add(device_id)
                    
                    # Try to get hostname
                    def get_host_name():
                        try:
                            return socket.gethostbyaddr(ip)[0]
                        except:
                            return "Unknown"
                    
                    hostname = await loop.run_in_executor(None, get_host_name)
                    
                    # Check if device exists in DB
                    existing_device = await get_device_by_id(device_id)
                    
                    # Create device info
                    device_info = {
                        "device_id": device_id,
                        "ip_address": ip,
                        "mac_address": mac,
                        "hostname": hostname,
                        "device_type": guess_device_type(hostname),
                        "os_type": guess_os_type(hostname),
                        "is_trusted": False,
                        "system_info": {
                            "detection_method": "arp_scan",
                            "scan_time": datetime.utcnow().isoformat()
                        },
                        "already_registered": existing_device is not None
                    }
                    devices.append(device_info)
                    logger.info(f"Added device via ARP scan: {hostname} ({ip}) - {mac}")
        except Exception as e:
            logger.error(f"Error in ARP scan: {str(e)}")
    
    # If still no devices, try port scan
    if not devices:
        logger.info("ARP scan found no devices. Falling back to port scan.")
        
        # Port scan common addresses and ports
        common_ports = [80, 443, 22, 445, 139, 8080, 21, 25, 53, 3389, 5000, 8443, 8888]
        
        # Scan the entire subnet instead of just common IPs
        async def check_host(ip):
            try:
                # Try to connect to common ports with a short timeout
                for port in common_ports:
                    loop = asyncio.get_event_loop()
                    
                    def try_connect():
                        try:
                            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                            s.settimeout(0.1)  # 100ms timeout for faster scanning
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
                            
                            # Try to get hostname
                            hostname = "Unknown"
                            try:
                                def get_host_name():
                                    try:
                                        return socket.gethostbyaddr(ip)[0]
                                    except:
                                        return "Unknown"
                                
                                hostname = await loop.run_in_executor(None, get_host_name)
                            except Exception as e:
                                logger.debug(f"Hostname lookup failed for {ip}: {str(e)}")
                            
                            # Generate a MAC address - we'll use a better algorithm
                            # The MAC will be based on the IP but also include the subnet
                            # to avoid conflicts if scanning multiple networks
                            ip_parts = [int(part) for part in ip.split('.')]
                            subnet_part = ip_parts[2]  # Use third octet as part of identifier
                            pseudo_mac = f"02:{subnet_part:02x}:{ip_parts[0]:02x}:{ip_parts[1]:02x}:{ip_parts[2]:02x}:{ip_parts[3]:02x}"
                            
                            device_id = pseudo_mac.replace(':', '')
                            
                            # Skip if already found
                            if device_id in found_device_ids:
                                return
                            
                            found_device_ids.add(device_id)
                            
                            # Determine device type from port and hostname
                            device_type = DeviceType.WORKSTATION  # Default
                            
                            if port == 80 or port == 443 or port == 8080:
                                # Try to detect router or network device
                                if ip_parts[3] < 20 or hostname.lower() in ["router", "gateway", "modem", "switch", "xiaomi", "huawei", "tplink", "asus", "netgear"]:
                                    device_type = DeviceType.NETWORK
                            elif port == 22:
                                if hostname.lower() in ["server", "centos", "ubuntu", "debian", "linux"]:
                                    device_type = DeviceType.SERVER
                            elif port == 445 or port == 139:
                                device_type = DeviceType.WORKSTATION  # File sharing - likely a PC
                            elif port == 5000 or port == 8443 or port == 8888:
                                if "cam" in hostname.lower() or "dvr" in hostname.lower():
                                    device_type = DeviceType.IOT
                            
                            # Guess OS
                            os_type = "Unknown OS"
                            hostname_lower = hostname.lower()
                            if "win" in hostname_lower or "pc" in hostname_lower:
                                os_type = "Windows"
                            elif "mac" in hostname_lower or "apple" in hostname_lower or "iphone" in hostname_lower:
                                os_type = "Apple"
                            elif "android" in hostname_lower or "phone" in hostname_lower:
                                os_type = "Android"
                            elif "linux" in hostname_lower or "ubuntu" in hostname_lower or "debian" in hostname_lower:
                                os_type = "Linux"
                            
                            # Check if device exists in DB
                            existing_device = await get_device_by_id(device_id)
                            
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
        
        # Use semaphore to limit concurrency and prevent overloading
        semaphore = asyncio.Semaphore(50)  # Limit concurrent scans
        
        async def bounded_check_host(ip_suffix):
            async with semaphore:
                ip = f"{base_ip}.{ip_suffix}"
                await check_host(ip)
        
        # Create bounded tasks for all IPs in the subnet
        bounded_tasks = [bounded_check_host(i) for i in range(1, 255)]
        
        # Run tasks in batches
        for i in range(0, len(bounded_tasks), 50):
            batch = bounded_tasks[i:i+50]
            await asyncio.gather(*batch)
    
    # Always add current device info as a reliable fallback
    try:
        # Get current device info
        my_ip = get_my_ip()
        hostname = socket.gethostname()
        
        # Try to get real MAC address
        mac = ':'.join(['{:02x}'.format((uuid.getnode() >> elements) & 0xff) 
                       for elements in range(0,8*6,8)][::-1])
        
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
                    "scan_time": datetime.utcnow().isoformat(),
                    "platform": platform.platform(),
                    "python_version": platform.python_version()
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