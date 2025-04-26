# backend/app/devices/utils.py
from datetime import datetime
from ..db import db
from .models import DeviceCreate, DeviceUpdate, DeviceStatus
import logging
from ..common.alerts import record_security_alert

logger = logging.getLogger(__name__)

async def register_device(device_data: DeviceCreate):
    """Register a new device in the system"""
    now = datetime.utcnow()
    
    if not existing_device and not device_data.is_trusted:
        await record_security_alert(
            alert_type="new_device",
            title="New untrusted device connected",
            description=f"New device {device_data.hostname} ({device_data.device_type}) with IP {device_data.ip_address}",
            severity="medium",
            source_ip=device_data.ip_address,
            device_id=device_data.device_id
    )
    
    # Check if device already exists
    existing_device = await db.db.devices.find_one({"device_id": device_data.device_id})
    
    if existing_device:
        # Update last_seen field
        await db.db.devices.update_one(
            {"device_id": device_data.device_id},
            {"$set": {
                "last_seen": now,
                "ip_address": device_data.ip_address,
                "hostname": device_data.hostname,
                "system_info": device_data.system_info
            }}
        )
        existing_device["last_seen"] = now
        mongo_id = str(existing_device["_id"])
        existing_device["id"] = mongo_id  # Добавляем поле id
        existing_device.pop("_id", None)  # Удаляем поле _id
        return existing_device
    
    # Create new device record
    device_in_db = {
        "device_id": device_data.device_id,
        "device_type": device_data.device_type,
        "ip_address": device_data.ip_address,
        "mac_address": device_data.mac_address,
        "os_type": device_data.os_type,
        "hostname": device_data.hostname,
        "is_trusted": device_data.is_trusted,
        "system_info": device_data.system_info,
        "registered_at": now,
        "last_seen": now,
        "risk_score": 0.0,
        "status": DeviceStatus.ACTIVE,
        "vulnerabilities": [],
        "compliance_status": {}
    }
    
    result = await db.db.devices.insert_one(device_in_db)
    mongo_id = str(result.inserted_id)
    device_in_db["id"] = mongo_id  # Добавляем поле id
    # НЕ добавляем поле _id, оно не нужно в ответе
    
    logger.info(f"New device registered: {device_in_db['device_id']} ({device_in_db['device_type']})")
    return device_in_db

async def get_device_by_id(device_id: str):
    """Get device by its unique ID"""
    device = await db.db.devices.find_one({"device_id": device_id})
    if device:
        device["id"] = str(device["_id"])
        device.pop("_id", None)
    return device

async def update_device(device_id: str, update_data: DeviceUpdate):
    """Update device information"""
    update_fields = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if update_fields:
        update_fields["last_seen"] = datetime.utcnow()
        
        result = await db.db.devices.update_one(
            {"device_id": device_id},
            {"$set": update_fields}
        )
        
        if result.modified_count:
            logger.info(f"Device updated: {device_id}")
            return await get_device_by_id(device_id)
        
    return None

async def set_device_status(device_id: str, status: DeviceStatus):
    """Update device status"""
    result = await db.db.devices.update_one(
        {"device_id": device_id},
        {"$set": {"status": status, "last_seen": datetime.utcnow()}}
    )
    
    if result.modified_count:
        logger.info(f"Device status updated: {device_id} -> {status}")
        return True
    
    return False

async def calculate_device_risk_score(device_id: str):
    """Calculate risk score for a device based on various factors"""
    device = await get_device_by_id(device_id)
    if not device:
        return None
    
    # Base risk score
    risk_score = 0.0
    
    # Check if device is trusted
    if not device.get("is_trusted", True):
        risk_score += 30.0
    
    # Check OS type (example: higher risk for older OS)
    os_type = device.get("os_type", "").lower()
    if "windows xp" in os_type or "windows 7" in os_type:
        risk_score += 25.0
    elif "windows 8" in os_type:
        risk_score += 15.0
    
    # Check device type
    device_type = device.get("device_type")
    if device_type == "byod":
        risk_score += 20.0
    elif device_type == "iot":
        risk_score += 15.0
    
    # Check vulnerabilities
    vulnerabilities = device.get("vulnerabilities", [])
    risk_score += len(vulnerabilities) * 10.0
    
    # Cap risk score at 100
    risk_score = min(risk_score, 100.0)
    
    # Update device risk score
    await db.db.devices.update_one(
        {"device_id": device_id},
        {"$set": {"risk_score": risk_score}}
    )
    
    return risk_score

async def get_all_devices(skip: int = 0, limit: int = 100):
    """Get all devices with pagination"""
    devices = []
    cursor = db.db.devices.find().skip(skip).limit(limit)
    
    async for device in cursor:
        device["id"] = str(device["_id"])
        device.pop("_id", None)
        devices.append(device)
    
    return devices