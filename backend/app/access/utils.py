# backend/app/access/utils.py
from .models import AccessLogCreate, AccessDecision
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from ..db import db
from ..devices.utils import get_device_by_id, calculate_device_risk_score
from ..common.alerts import record_security_alert
import logging
import json

logger = logging.getLogger(__name__)

async def evaluate_access_request(access_data: AccessLogCreate) -> AccessDecision:
    """
    Evaluate an access request using Zero Trust principles.
    Returns an AccessDecision with the determination.
    """
    # Default decision (deny by default)
    decision = AccessDecision(
        access_granted=False,
        reason="Default deny policy",
        risk_level=50.0,
        context={}
    )
    
    # Get device information
    device = await get_device_by_id(access_data.device_id)
    if not device:
        decision.reason = f"Unknown device: {access_data.device_id}"
        decision.risk_level = 100.0
        return decision
    
    # Check if device is blocked or quarantined
    if device["status"] in ["blocked", "quarantined"]:
        decision.reason = f"Device is {device['status']}"
        decision.risk_level = 100.0
        return decision
    
    # Calculate current device risk score
    risk_score = await calculate_device_risk_score(access_data.device_id)
    decision.risk_level = risk_score
    decision.context["device_risk_score"] = risk_score
    
    # Parse resource to determine sensitivity
    resource_sensitivity = determine_resource_sensitivity(access_data.resource)
    decision.context["resource_sensitivity"] = resource_sensitivity
    
    # Check access type against resource sensitivity
    if is_access_type_allowed(access_data.access_type, resource_sensitivity):
        # Allow access if risk is acceptable for the resource
        max_allowed_risk = get_max_allowed_risk(resource_sensitivity)
        if risk_score <= max_allowed_risk:
            decision.access_granted = True
            decision.reason = "Access granted based on risk assessment"
        else:
            decision.reason = f"Risk score too high for resource: {risk_score} > {max_allowed_risk}"
    else:
        decision.reason = f"Access type {access_data.access_type} not allowed for resource sensitivity {resource_sensitivity}"
    
    return decision

async def get_folder_sensitivity(folder_id: str) -> str:
    """Get the sensitivity level for a Google Drive folder from the database"""
    # Look up in the folder_mappings collection
    mapping = await db.db.folder_mappings.find_one({"folder_id": folder_id})
    
    if mapping:
        return mapping.get("sensitivity", "confidential")
    
    # Default to confidential if not found
    return "confidential"

def determine_resource_sensitivity(resource: str) -> str:
    """Determine the sensitivity level of a resource"""
    # These would be more sophisticated in a real system
    if resource.startswith("/api/public"):
        return "public"
    elif resource.startswith("/api/finance") or resource.startswith("/database"):
        return "critical"
    elif resource.startswith("/internal/admin"):
        return "admin"
    elif resource.startswith("/api/hr"):
        return "confidential"
    
    # Add support for Google Drive folders
    elif resource.startswith("google-drive:folder:"):
        folder_id = resource.split(":")[-1]
        # Here you could look up the folder sensitivity in a configuration
        # For example, HR folders might be "confidential"
        folder_mappings = {
            "hr_folder_id": "confidential",
            "finance_folder_id": "critical", 
            "it_folder_id": "admin",
            "general_folder_id": "internal"
        }
        
        # Default to confidential for unmapped folders
        return folder_mappings.get(folder_id, "confidential")
    
    else:
        return "internal"  # Default sensitivity level

def is_access_type_allowed(access_type: str, resource_sensitivity: str) -> bool:
    """Check if the access type is allowed for the resource sensitivity"""
    # Map of allowed access types per sensitivity level
    access_map = {
        "public": ["read"],
        "internal": ["read", "write"],
        "confidential": ["read", "write"],
        "critical": ["read", "write"],
        "admin": ["read", "write", "delete", "admin", "execute"]
    }
    
    return access_type.lower() in access_map.get(resource_sensitivity, [])

def get_max_allowed_risk(resource_sensitivity: str) -> float:
    """Get the maximum allowed risk score for a resource sensitivity"""
    # Map of maximum allowed risk per sensitivity level
    risk_map = {
        "public": 70.0,
        "internal": 50.0,
        "confidential": 30.0,
        "critical": 20.0,
        "admin": 10.0
    }
    
    return risk_map.get(resource_sensitivity, 0.0)

async def log_access_attempt(access_data: AccessLogCreate, decision: AccessDecision):
    """Log an access attempt in the database"""
    now = datetime.utcnow()
    
    if not decision.access_granted:
    # Если доступ запрещен, создаем оповещение
        await record_security_alert(
            alert_type="unauthorized_access",
            title="Unauthorized access attempt",
            description=f"Attempted access to {access_data.resource} from IP {access_data.ip_address}",
            severity="medium",
            source_ip=access_data.ip_address,
            device_id=access_data.device_id,
            user_id=access_data.user_id
        )
    
    # Create access log entry
    access_log = {
        "device_id": access_data.device_id,
        "user_id": access_data.user_id,
        "ip_address": access_data.ip_address,
        "user_agent": access_data.user_agent,
        "resource": access_data.resource,
        "timestamp": access_data.timestamp,
        "access_type": access_data.access_type,
        "context": access_data.context,
        "access_granted": decision.access_granted,
        "reason": decision.reason,
        "risk_level": decision.risk_level,
        "decision_factors": [
            {"factor": "device_risk", "value": decision.context.get("device_risk_score", 0)},
            {"factor": "resource_sensitivity", "value": decision.context.get("resource_sensitivity", "unknown")}
        ]
    }
    
    result = await db.db.access_logs.insert_one(access_log)
    # Преобразуем _id в id для соответствия модели
    access_log["id"] = str(result.inserted_id)
    # Не добавляем поле _id в ответ
    
    log_level = logging.WARNING if not decision.access_granted else logging.INFO
    logger.log(log_level, f"Access {'allowed' if decision.access_granted else 'denied'}: {access_data.device_id} -> {access_data.resource}")
    
    return access_log

async def get_access_logs(
    device_id: str = None,
    user_id: str = None,
    resource: str = None,
    access_granted: bool = None,
    start_time: datetime = None,
    end_time: datetime = None,
    skip: int = 0,
    limit: int = 100
):
    """Query access logs with filters"""
    query = {}
    
    if device_id:
        query["device_id"] = device_id
    
    if user_id:
        query["user_id"] = user_id
    
    if resource:
        query["resource"] = {"$regex": resource}
    
    if access_granted is not None:
        query["access_granted"] = access_granted
    
    # Time range filter
    if start_time or end_time:
        time_query = {}
        if start_time:
            time_query["$gte"] = start_time
        if end_time:
            time_query["$lte"] = end_time
        query["timestamp"] = time_query
    
    logs = []
    cursor = db.db.access_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit)
    
    async for log in cursor:
        # Преобразуем _id в id для соответствия модели
        log["id"] = str(log["_id"])
        log.pop("_id", None)  # Удаляем _id
        logs.append(log)
    
    return logs

async def get_access_statistics(start_time: datetime = None, end_time: datetime = None):
    """Get statistics about access attempts"""
    if not start_time:
        start_time = datetime.utcnow() - timedelta(days=7)
    
    if not end_time:
        end_time = datetime.utcnow()
    
    pipeline = [
        {
            "$match": {
                "timestamp": {"$gte": start_time, "$lte": end_time}
            }
        },
        {
            "$group": {
                "_id": "$access_granted",
                "count": {"$sum": 1}
            }
        }
    ]
    
    results = await db.db.access_logs.aggregate(pipeline).to_list(length=None)
    
    # Process results
    stats = {
        "total": sum(r["count"] for r in results),
        "allowed": 0,
        "denied": 0,
        "time_range": {
            "start": start_time,
            "end": end_time
        }
    }
    
    for r in results:
        if r["_id"] is True:
            stats["allowed"] = r["count"]
        else:
            stats["denied"] = r["count"]
    
    return stats

async def record_security_alert(
    alert_type: str,
    title: str,
    description: str,
    severity: str,
    source_ip: Optional[str] = None,
    device_id: Optional[str] = None,
    user_id: Optional[str] = None
):
    """Записать оповещение безопасности в базу данных"""
    alert = {
        "alert_type": alert_type,
        "title": title,
        "description": description,
        "severity": severity,
        "source_ip": source_ip,
        "device_id": device_id,
        "user_id": user_id,
        "timestamp": datetime.utcnow(),
        "resolved": False
    }
    
    result = await db.db.security_alerts.insert_one(alert)
    alert["id"] = str(result.inserted_id)
    alert.pop("_id", None)
    
    return alert

async def get_recent_alerts(limit: int = 5, resolved: bool = False) -> List[dict]:
    """Получить последние оповещения безопасности"""
    query = {"resolved": resolved}
    
    alerts = []
    cursor = db.db.security_alerts.find(query).sort("timestamp", -1).limit(limit)
    
    async for alert in cursor:
        alert["id"] = str(alert["_id"])
        alert.pop("_id", None)
        alerts.append(alert)
    
    return alerts

# Функция для генерации тестовых оповещений, если их нет в базе
async def generate_sample_alerts():
    """Создать несколько тестовых оповещений, если в базе ничего нет"""
    count = await db.db.security_alerts.count_documents({})
    
    if count == 0:
        # Создаем несколько тестовых оповещений
        await record_security_alert(
            alert_type="login_failure",
            title="Multiple login failures detected",
            description="5 failed login attempts from IP 192.168.1.25",
            severity="high",
            source_ip="192.168.1.25"
        )
        
        await record_security_alert(
            alert_type="new_device",
            title="New device connected",
            description="Unrecognized device with high risk score",
            severity="medium",
            device_id="test-device-003"
        )
        
        await record_security_alert(
            alert_type="system_update",
            title="System update available",
            description="Security patch available for 12 devices",
            severity="low"
        )