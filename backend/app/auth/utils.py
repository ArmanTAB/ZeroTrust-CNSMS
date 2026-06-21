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
from ..common.email_utils import send_verification_email, send_password_reset_email

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

async def get_user_by_email(email: str):
    user = await db.db.users.find_one({"email": email})
    if user:
        user["_id"] = str(user["_id"])
    return user

def generate_verification_code(length=6):
    return ''.join(random.choices(string.digits, k=length))

async def create_user(user_data):
    hashed_password = get_password_hash(user_data.password)
    verification_code = generate_verification_code(settings.VERIFICATION_CODE_LENGTH)
    now = datetime.utcnow()

    user_in_db = {
        "email": user_data.email,
        "hashed_password": hashed_password,
        "full_name": user_data.full_name,
        "role": user_data.role,
        "created_at": now,
        "is_active": True,
        "is_verified": False,
        "verification_code": verification_code,
        "verification_sent_at": now
    }

    result = await db.db.users.insert_one(user_in_db)
    user_in_db["_id"] = str(result.inserted_id)

    send_verification_email(
        recipient_email=user_data.email,
        verification_code=verification_code,
        full_name=user_data.full_name
    )

    return user_in_db

async def verify_user_email(email: str, code: str):
    user = await get_user_by_email(email)
    if not user:
        return {"success": False, "message": "User not found"}

    if user.get("is_verified", False):
        return {"success": True, "message": "Email already verified"}

    if user.get("verification_code") != code:
        return {"success": False, "message": "Invalid verification code"}

    if user.get("verification_sent_at"):
        sent_at = user["verification_sent_at"]
        expiry_time = sent_at + timedelta(hours=settings.VERIFICATION_CODE_EXPIRY_HOURS)
        if datetime.utcnow() > expiry_time:
            return {"success": False, "message": "Verification code has expired"}

    await db.db.users.update_one(
        {"email": email},
        {"$set": {"is_verified": True, "verification_code": None}}
    )

    return {"success": True, "message": "Email verified successfully"}

async def resend_verification_email(email: str):
    user = await get_user_by_email(email)
    if not user:
        return {"success": False, "message": "User not found"}

    if user.get("is_verified", False):
        return {"success": False, "message": "Email already verified"}

    verification_code = generate_verification_code(settings.VERIFICATION_CODE_LENGTH)
    now = datetime.utcnow()

    await db.db.users.update_one(
        {"email": email},
        {"$set": {
            "verification_code": verification_code,
            "verification_sent_at": now
        }}
    )

    email_sent = send_verification_email(
        recipient_email=email,
        verification_code=verification_code,
        full_name=user["full_name"]
    )

    if email_sent:
        return {"success": True, "message": "Verification email sent successfully"}
    else:
        return {"success": False, "message": "Failed to send verification email"}

async def request_password_reset(email: str):
    user = await get_user_by_email(email)
    if not user:
        # Don't reveal whether the email exists
        return {"success": True, "message": "If your email is registered, a password reset code has been sent"}

    reset_code = generate_verification_code(settings.VERIFICATION_CODE_LENGTH)
    now = datetime.utcnow()

    await db.db.users.update_one(
        {"email": email},
        {"$set": {
            "password_reset_code": reset_code,
            "password_reset_sent_at": now
        }}
    )

    email_sent = send_password_reset_email(
        recipient_email=email,
        reset_code=reset_code,
        full_name=user["full_name"]
    )

    if email_sent:
        return {"success": True, "message": "Password reset code sent successfully"}
    else:
        return {"success": False, "message": "Failed to send password reset code"}

async def reset_password(email: str, code: str, new_password: str):
    user = await get_user_by_email(email)
    if not user:
        return {"success": False, "message": "User not found"}

    if user.get("password_reset_code") != code:
        return {"success": False, "message": "Invalid reset code"}

    if user.get("password_reset_sent_at"):
        sent_at = user["password_reset_sent_at"]
        expiry_time = sent_at + timedelta(hours=settings.VERIFICATION_CODE_EXPIRY_HOURS)
        if datetime.utcnow() > expiry_time:
            return {"success": False, "message": "Reset code has expired"}

    hashed_password = get_password_hash(new_password)

    await db.db.users.update_one(
        {"email": email},
        {"$set": {
            "hashed_password": hashed_password,
            "password_reset_code": None
        }}
    )

    return {"success": True, "message": "Password reset successfully"}
