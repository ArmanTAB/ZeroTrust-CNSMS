# backend/app/access/models.py
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class AccessType(str, Enum):
    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    ADMIN = "admin"
    EXECUTE = "execute"

class AccessBase(BaseModel):
    device_id: str
    user_id: Optional[str] = None
    ip_address: str
    user_agent: str
    resource: str
    timestamp: datetime
    access_type: AccessType
    context: Dict[str, Any] = {}

class AccessLogCreate(AccessBase):
    pass

class AccessDecision(BaseModel):
    access_granted: bool
    reason: Optional[str] = None
    risk_level: float = 0.0
    context: Dict[str, Any] = {}

class AccessLogInDB(AccessBase):
    id: str = Field(alias="_id")
    access_granted: bool
    reason: Optional[str] = None
    risk_level: float = 0.0
    decision_factors: List[Dict[str, Any]] = []
    
    model_config = {
        "populate_by_name": True
    }

class AccessLog(AccessBase):
    id: str
    access_granted: bool
    reason: Optional[str] = None
    risk_level: float = 0.0
    decision_factors: List[Dict[str, Any]] = []
    
class AlertType(str, Enum):
    LOGIN_FAILURE = "login_failure"
    UNAUTHORIZED_ACCESS = "unauthorized_access"
    NEW_DEVICE = "new_device"
    SYSTEM_UPDATE = "system_update"
    UNUSUAL_ACTIVITY = "unusual_activity"

class SecurityAlert(BaseModel):
    id: str
    alert_type: AlertType
    title: str
    description: str
    severity: str  # high, medium, low
    source_ip: Optional[str] = None
    device_id: Optional[str] = None
    user_id: Optional[str] = None
    timestamp: datetime
    resolved: bool = False

class AccessRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class DriveAccessRequest(BaseModel):
    id: Optional[str] = None
    user_id: str
    user_email: str
    folder_id: str
    folder_name: str
    device_id: Optional[str] = None
    device_ip: Optional[str] = None
    request_time: datetime
    status: AccessRequestStatus = AccessRequestStatus.PENDING
    decision_time: Optional[datetime] = None
    decision_by: Optional[str] = None
    reason: Optional[str] = None