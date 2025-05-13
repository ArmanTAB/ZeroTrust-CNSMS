from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    SECURITY_ANALYST = "security_analyst"
    NETWORK_ADMIN = "network_admin"
    VIEWER = "viewer"

class TwoFactorMethod(str, Enum):
    NONE = "none"
    TOTP = "totp"
    SMS = "sms"
    WHATSAPP = "whatsapp"

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.VIEWER
    phone_number: Optional[str] = None

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
    is_verified: bool = False  # Email verification
    phone_number: Optional[str] = None
    phone_verified: bool = False
    verification_code: Optional[str] = None  # Email verification code
    verification_sent_at: Optional[datetime] = None  # Email verification sent
    password_reset_code: Optional[str] = None  # Password reset code
    password_reset_sent_at: Optional[datetime] = None  # Password reset sent
    totp_secret: Optional[str] = None
    totp_enabled: bool = False
    totp_verified: bool = False
    totp_created_at: Optional[datetime] = None
    totp_verified_at: Optional[datetime] = None
    sms_enabled: bool = False
    whatsapp_enabled: bool = False
    twilio_verification_code: Optional[str] = None
    twilio_verification_sent_at: Optional[datetime] = None
    preferred_2fa_method: TwoFactorMethod = TwoFactorMethod.NONE
    
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
    is_verified: bool = False  # Email verification
    phone_number: Optional[str] = None
    phone_verified: bool = False
    totp_enabled: bool = False
    sms_enabled: bool = False
    whatsapp_enabled: bool = False
    preferred_2fa_method: TwoFactorMethod = TwoFactorMethod.NONE

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
    
class LoginWithTOTP(BaseModel):
    email: EmailStr
    password: str
    totp_token: Optional[str] = None
    
class PhoneVerificationRequest(BaseModel):
    phone_number: str
    method: TwoFactorMethod  # SMS or WhatsApp

class PhoneVerificationVerify(BaseModel):
    phone_number: str
    code: str
    method: TwoFactorMethod  # SMS or WhatsApp

class TwoFactorMethodUpdate(BaseModel):
    method: TwoFactorMethod