# backend/app/auth/utils.py
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from ..config import settings
from ..db import db
import uuid
from bson.objectid import ObjectId
import random
import string
from ..common.email_utils import send_verification_email

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    """Generate password hash"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

async def get_user_by_email(email: str):
    """Get user by email"""
    user = await db.db.users.find_one({"email": email})
    if user:
        user["_id"] = str(user["_id"])
    return user

def generate_verification_code(length=6):
    """Generate a random verification code"""
    # Generate a random string of digits
    return ''.join(random.choices(string.digits, k=length))

async def create_user(user_data):
    """Create new user"""
    hashed_password = get_password_hash(user_data.password)
    
    # Generate verification code
    verification_code = generate_verification_code(settings.VERIFICATION_CODE_LENGTH)
    now = datetime.utcnow()
    
    user_in_db = {
        "email": user_data.email,
        "hashed_password": hashed_password,
        "full_name": user_data.full_name,
        "role": user_data.role,
        "created_at": now,
        "is_active": True,
        "is_verified": False,  # User starts unverified
        "verification_code": verification_code,
        "verification_sent_at": now
    }
    
    result = await db.db.users.insert_one(user_in_db)
    user_in_db["_id"] = str(result.inserted_id)
    
    # Send verification email
    send_verification_email(
        recipient_email=user_data.email,
        verification_code=verification_code,
        full_name=user_data.full_name
    )
    
    return user_in_db

async def verify_user_email(email: str, code: str):
    """Verify user email with verification code"""
    # Find the user
    user = await get_user_by_email(email)
    if not user:
        return {"success": False, "message": "User not found"}
    
    # Check if already verified
    if user.get("is_verified", False):
        return {"success": True, "message": "Email already verified"}
        
    # Check verification code
    if user.get("verification_code") != code:
        return {"success": False, "message": "Invalid verification code"}
    
    # Check if code has expired
    if user.get("verification_sent_at"):
        sent_at = user["verification_sent_at"]
        expiry_time = sent_at + timedelta(hours=settings.VERIFICATION_CODE_EXPIRY_HOURS)
        if datetime.utcnow() > expiry_time:
            return {"success": False, "message": "Verification code has expired"}
    
    # Update user as verified
    await db.db.users.update_one(
        {"email": email},
        {"$set": {"is_verified": True, "verification_code": None}}
    )
    
    return {"success": True, "message": "Email verified successfully"}

async def resend_verification_email(email: str):
    """Resend verification email to user"""
    # Find the user
    user = await get_user_by_email(email)
    if not user:
        return {"success": False, "message": "User not found"}
    
    # Check if already verified
    if user.get("is_verified", False):
        return {"success": False, "message": "Email already verified"}
    
    # Generate new verification code
    verification_code = generate_verification_code(settings.VERIFICATION_CODE_LENGTH)
    now = datetime.utcnow()
    
    # Update user with new code
    await db.db.users.update_one(
        {"email": email},
        {"$set": {
            "verification_code": verification_code,
            "verification_sent_at": now
        }}
    )
    
    # Send verification email
    email_sent = send_verification_email(
        recipient_email=email,
        verification_code=verification_code,
        full_name=user["full_name"]
    )
    
    if email_sent:
        return {"success": True, "message": "Verification email sent successfully"}
    else:
        return {"success": False, "message": "Failed to send verification email"}