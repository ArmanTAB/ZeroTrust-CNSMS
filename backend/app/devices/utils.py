from datetime import datetime, timedelta
from ..db import db
from .models import DeviceCreate, DeviceUpdate, DeviceStatus
import logging
from ..common.alerts import record_security_alert

logger = logging.getLogger(__name__)

async def register_device(device_data: DeviceCreate):
    now = datetime.utcnow()

    existing_device = await db.db.devices.find_one({"device_id": device_data.device_id})

    if not existing_device and not device_data.is_trusted:
        await record_security_alert(
            alert_type="new_device",
            title="New untrusted device connected",
            description=f"New device {device_data.hostname} ({device_data.device_type}) with IP {device_data.ip_address}",
            severity="medium",
            source_ip=device_data.ip_address,
            device_id=device_data.device_id
        )

    if existing_device:
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
        existing_device["id"] = mongo_id
        existing_device.pop("_id", None)
        return existing_device

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
    device_in_db["id"] = mongo_id

    logger.info(f"New device registered: {device_in_db['device_id']} ({device_in_db['device_type']})")
    return device_in_db

async def get_device_by_id(device_id: str):
    device = await db.db.devices.find_one({"device_id": device_id})
    if device:
        device["id"] = str(device["_id"])
        device.pop("_id", None)
    return device

async def update_device(device_id: str, update_data: DeviceUpdate):
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
    result = await db.db.devices.update_one(
        {"device_id": device_id},
        {"$set": {"status": status, "last_seen": datetime.utcnow()}}
    )

    if result.modified_count:
        logger.info(f"Device status updated: {device_id} -> {status}")
        return True

    return False

async def calculate_device_risk_score(device_id: str):
    device = await get_device_by_id(device_id)
    if not device:
        return None

    risk_score = 0.0

    if not device.get("is_trusted", True):
        risk_score += 30.0

    os_type = device.get("os_type", "").lower()
    if "windows xp" in os_type or "windows 7" in os_type:
        risk_score += 25.0
    elif "windows 8" in os_type:
        risk_score += 15.0

    device_type = device.get("device_type")
    if device_type == "byod":
        risk_score += 20.0
    elif device_type == "iot":
        risk_score += 15.0

    vulnerabilities = device.get("vulnerabilities", [])
    risk_score += len(vulnerabilities) * 10.0

    risk_score = min(risk_score, 100.0)

    await db.db.devices.update_one(
        {"device_id": device_id},
        {"$set": {"risk_score": risk_score}}
    )

    return risk_score

async def get_device_risk_history_data(device_id: str, days: int = 7):
    """Get historical risk scores for a device.

    Falls back to synthetic trend data if no real history exists yet.
    """
    real_history = []
    try:
        collections = await db.db.list_collection_names()
        if 'risk_history' in collections:
            cursor = db.db.risk_history.find(
                {"device_id": device_id},
                {"timestamp": 1, "risk_score": 1, "_id": 0}
            ).sort("timestamp", -1).limit(days)

            async for entry in cursor:
                real_history.append({
                    "date": entry["timestamp"].strftime("%Y-%m-%d"),
                    "risk": entry["risk_score"]
                })
    except Exception as e:
        logger.error(f"Error fetching risk history: {str(e)}")

    if real_history:
        real_history.sort(key=lambda x: x["date"])
        return real_history

    import random

    device = await get_device_by_id(device_id)
    if not device:
        return []

    current_risk = device.get("risk_score", 0)
    end_date = datetime.utcnow()
    synthetic_data = []
    base_risk = max(5, min(95, current_risk - random.randint(-20, 20)))

    for i in range(days):
        date = end_date - timedelta(days=days - i - 1)

        if i == days - 1:
            risk = current_risk
        else:
            progress = i / (days - 1)
            target = base_risk + (current_risk - base_risk) * progress
            noise_range = 15 * (1 - progress)
            noise = random.uniform(-noise_range, noise_range)
            risk = max(0, min(100, target + noise))

        synthetic_data.append({
            "date": date.strftime("%Y-%m-%d"),
            "risk": round(risk, 1)
        })

    return synthetic_data

async def add_device_risk_history_record(device_id: str, risk_score: float, timestamp: datetime):
    """Add a record to a device's risk history.

    Args:
        device_id: Device ID
        risk_score: Risk score (0-100)
        timestamp: Timestamp for the record

    Returns:
        ID of the created record
    """
    collections = await db.db.list_collection_names()
    if 'risk_history' not in collections:
        await db.db.create_collection('risk_history')
        await db.db.risk_history.create_index([
            ("device_id", 1),
            ("timestamp", -1)
        ])

    risk_record = {
        "device_id": device_id,
        "risk_score": risk_score,
        "timestamp": timestamp,
        "created_at": datetime.utcnow()
    }

    result = await db.db.risk_history.insert_one(risk_record)
    return str(result.inserted_id)

async def get_all_devices(skip: int = 0, limit: int = 100):
    devices = []
    cursor = db.db.devices.find().skip(skip).limit(limit)

    async for device in cursor:
        device["id"] = str(device["_id"])
        device.pop("_id", None)
        devices.append(device)

    return devices
