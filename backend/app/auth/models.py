from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    SECURITY_ANALYST = "security_analyst"
    NETWORK_ADMIN = "network_admin"
    VIEWER = "viewer"

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.VIEWER

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserInDB(BaseModel):
    id: str = Field(alias="_id")
    email: EmailStr
    hashed_password: str
    full_name: str
    role: UserRole
    created_at: datetime
    last_login: Optional[datetime] = None
    is_active: bool = True
    is_verified: bool = False  # New field for email verification
    verification_code: Optional[str] = None  # Store verification code
    verification_sent_at: Optional[datetime] = None  # Track when verification was sent
    password_reset_code: Optional[str] = None  # Store password reset code
    password_reset_sent_at: Optional[datetime] = None  # Track when reset code was sent
    
    model_config = {
        "populate_by_name": True
    }

class User(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: UserRole
    created_at: datetime
    last_login: Optional[datetime] = None
    is_active: bool = True
    is_verified: bool = False  # New field for email verification

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    email: Optional[str] = None
    user_id: Optional[str] = None

# Email verification models
class VerificationRequest(BaseModel):
    email: EmailStr
    code: str
    
class ResendVerificationRequest(BaseModel):
    email: EmailStr

# Password reset models
class PasswordResetRequest(BaseModel):
    email: EmailStr
    
class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str