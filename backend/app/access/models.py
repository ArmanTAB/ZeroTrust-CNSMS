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