from datetime import datetime
from typing import List, Optional
from enum import Enum
from pydantic import BaseModel, Field, EmailStr

class AgentUserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"

class AgentUser(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    firstName: str
    lastName: str
    email: EmailStr
    password: Optional[str] = None  # Not returned in responses
    hashed_password: Optional[str] = None  # Stored in DB
    role: AgentUserRole = AgentUserRole.USER
    department: Optional[str] = None
    position: Optional[str] = None
    isActive: bool = True
    createdAt: datetime = Field(default_factory=datetime.now)
    lastLogin: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class AgentUserCreate(BaseModel):
    firstName: str
    lastName: str
    email: EmailStr
    password: str
    role: AgentUserRole = AgentUserRole.USER
    department: Optional[str] = None
    position: Optional[str] = None
    isActive: bool = True

class AgentUserUpdate(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None  # Optional for updates
    role: Optional[AgentUserRole] = None
    department: Optional[str] = None
    position: Optional[str] = None
    isActive: Optional[bool] = None

class AgentUserResponse(BaseModel):
    id: str = Field(..., alias="_id")
    firstName: str
    lastName: str
    email: EmailStr
    role: AgentUserRole
    department: Optional[str] = None
    position: Optional[str] = None
    isActive: bool
    createdAt: datetime
    lastLogin: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class AgentRuleType(str, Enum):
    BLOCK = "block"
    ALLOW = "allow"

class Resources(BaseModel):
    websites: List[str] = []
    applications: List[str] = []
    files: List[str] = []

class TimeRestrictions(BaseModel):
    enabled: bool = False
    startTime: str = "09:00"
    endTime: str = "17:00"
    days: List[int] = [1, 2, 3, 4, 5]  # Monday to Friday

class Conditions(BaseModel):
    timeRestrictions: Optional[TimeRestrictions] = None

class AppliesToField(BaseModel):
    users: List[str] = []
    departments: List[str] = []
    roles: List[str] = []

class AgentRule(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: str
    description: Optional[str] = None
    type: AgentRuleType
    resources: Resources
    appliesTo: AppliesToField
    conditions: Optional[Conditions] = None
    priority: int = 10
    isActive: bool = True
    createdAt: datetime = Field(default_factory=datetime.now)
    createdBy: Optional[str] = None
    updatedAt: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class AgentRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    type: AgentRuleType
    resources: Resources
    appliesTo: AppliesToField
    conditions: Optional[Conditions] = None
    priority: int = 10
    isActive: bool = True

class AgentRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[AgentRuleType] = None
    resources: Optional[Resources] = None
    appliesTo: Optional[AppliesToField] = None
    conditions: Optional[Conditions] = None
    priority: Optional[int] = None
    isActive: Optional[bool] = None

class AgentRuleResponse(BaseModel):
    id: str = Field(..., alias="_id")
    name: str
    description: Optional[str] = None
    type: AgentRuleType
    resources: Resources
    appliesTo: AppliesToField
    conditions: Optional[Conditions] = None
    priority: int
    isActive: bool
    createdAt: datetime
    createdBy: Optional[str] = None
    updatedAt: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class AgentActivityType(str, Enum):
    NETWORK = "network"
    PROCESS = "process"
    FILE = "file"

class AgentActivity(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    userId: str
    deviceId: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)
    type: AgentActivityType
    resource: str
    blocked: bool
    ruleName: Optional[str] = None
    description: str

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class AgentActivityCreate(BaseModel):
    userId: str
    deviceId: Optional[str] = None
    type: AgentActivityType
    resource: str
    action: str  # "block" or "allow"
    ruleName: Optional[str] = None
    description: str
    timestamp: Optional[datetime] = None

class AgentLoginResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user: Optional[AgentUserResponse] = None
    error: Optional[str] = None