from datetime import datetime
from typing import Optional, List
from ..db import db

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