# backend/app/devices/models.py
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class DeviceType(str, Enum):
    WORKSTATION = "workstation"
    LAPTOP = "laptop"
    SERVER = "server"
    MOBILE = "mobile"
    IOT = "iot"
    NETWORK = "network"
    BYOD = "byod"

class DeviceStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    QUARANTINED = "quarantined"
    BLOCKED = "blocked"
    PENDING = "pending"

class DeviceBase(BaseModel):
    device_id: str
    device_type: DeviceType
    ip_address: str
    mac_address: str
    os_type: str
    hostname: str
    is_trusted: bool = True
    system_info: Dict[str, Any] = {}

class DeviceCreate(DeviceBase):
    pass

class DeviceUpdate(BaseModel):
    ip_address: Optional[str] = None
    os_type: Optional[str] = None
    hostname: Optional[str] = None
    is_trusted: Optional[bool] = None
    system_info: Optional[Dict[str, Any]] = None
    status: Optional[DeviceStatus] = None

class DeviceStatusUpdate(BaseModel):
    status: DeviceStatus

class DeviceInDB(DeviceBase):
    id: str = Field(alias="_id")
    registered_at: datetime
    last_seen: datetime
    risk_score: float = 0.0
    status: DeviceStatus = DeviceStatus.ACTIVE
    vulnerabilities: List[Dict[str, Any]] = []
    compliance_status: Dict[str, bool] = {}
    
    model_config = {
        "populate_by_name": True
    }

class Device(DeviceBase):
    id: str
    registered_at: datetime
    last_seen: datetime
    risk_score: float = 0.0
    status: DeviceStatus = DeviceStatus.ACTIVE
    vulnerabilities: List[Dict[str, Any]] = []
    compliance_status: Dict[str, bool] = {}