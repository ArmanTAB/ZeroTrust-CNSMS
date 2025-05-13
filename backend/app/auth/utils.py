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
from ..common.email_utils import send_verification_email, send_password_reset_email
from ..common.twilio_utils import send_verification_sms, send_verification_whatsapp
from .models import TwoFactorMethod

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

async def request_password_reset(email: str):
    """Request a password reset and send reset code email"""
    # Find the user
    user = await get_user_by_email(email)
    if not user:
        # For security reasons, we'll pretend the email was sent
        return {"success": True, "message": "If your email is registered, a password reset code has been sent"}
    
    # Generate reset code
    reset_code = generate_verification_code(settings.VERIFICATION_CODE_LENGTH)
    now = datetime.utcnow()
    
    # Update user with reset code
    await db.db.users.update_one(
        {"email": email},
        {"$set": {
            "password_reset_code": reset_code,
            "password_reset_sent_at": now
        }}
    )
    
    # Send reset email
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
    """Reset user password using the reset code"""
    # Find the user
    user = await get_user_by_email(email)
    if not user:
        return {"success": False, "message": "User not found"}
    
    # Check reset code
    if user.get("password_reset_code") != code:
        return {"success": False, "message": "Invalid reset code"}
    
    # Check if code has expired
    if user.get("password_reset_sent_at"):
        sent_at = user["password_reset_sent_at"]
        expiry_time = sent_at + timedelta(hours=settings.VERIFICATION_CODE_EXPIRY_HOURS)
        if datetime.utcnow() > expiry_time:
            return {"success": False, "message": "Reset code has expired"}
    
    # Update password
    hashed_password = get_password_hash(new_password)
    
    await db.db.users.update_one(
        {"email": email},
        {"$set": {
            "hashed_password": hashed_password,
            "password_reset_code": None
        }}
    )
    
    return {"success": True, "message": "Password reset successfully"}

# NEW 2FA/TWILIO FUNCTIONS BELOW

async def setup_phone_verification(user_id: str, phone_number: str, method: TwoFactorMethod):
    """Set up phone verification for SMS or WhatsApp"""
    # Generate verification code
    verification_code = generate_verification_code(settings.VERIFICATION_CODE_LENGTH)
    now = datetime.utcnow()
    
    # Update user with verification code
    update_data = {
        "phone_number": phone_number,
        "twilio_verification_code": verification_code,
        "twilio_verification_sent_at": now
    }
    
    # Convert string ID to ObjectId
    user_id_obj = ObjectId(user_id)
    
    # Update database
    await db.db.users.update_one(
        {"_id": user_id_obj},
        {"$set": update_data}
    )
    
    # Send verification code based on method
    if method == TwoFactorMethod.SMS:
        success = send_verification_sms(phone_number, verification_code)
    elif method == TwoFactorMethod.WHATSAPP:
        success = send_verification_whatsapp(phone_number, verification_code)
    else:
        return False
    
    return success

async def verify_phone_number(user_id: str, phone_number: str, code: str, method: TwoFactorMethod):
    """Verify a phone number using the provided verification code"""
    # Convert string ID to ObjectId
    user_id_obj = ObjectId(user_id)
    
    # Find the user
    user = await db.db.users.find_one({"_id": user_id_obj})
    if not user:
        return {"success": False, "message": "User not found"}
    
    # Check if phone number matches
    if user.get("phone_number") != phone_number:
        return {"success": False, "message": "Phone number does not match"}
    
    # Check if already verified
    if user.get("phone_verified", False):
        return {"success": True, "message": "Phone already verified"}
    
    # Check verification code
    if user.get("twilio_verification_code") != code:
        return {"success": False, "message": "Invalid verification code"}
    
    # Check if code has expired
    if user.get("twilio_verification_sent_at"):
        sent_at = user["twilio_verification_sent_at"]
        expiry_time = sent_at + timedelta(hours=settings.VERIFICATION_CODE_EXPIRY_HOURS)
        if datetime.utcnow() > expiry_time:
            return {"success": False, "message": "Verification code has expired"}
    
    # Set appropriate 2FA method flag
    update_data = {
        "phone_verified": True,
        "twilio_verification_code": None,
    }
    
    if method == TwoFactorMethod.SMS:
        update_data["sms_enabled"] = True
        update_data["preferred_2fa_method"] = TwoFactorMethod.SMS
    elif method == TwoFactorMethod.WHATSAPP:
        update_data["whatsapp_enabled"] = True
        update_data["preferred_2fa_method"] = TwoFactorMethod.WHATSAPP
    
    # Update the user
    await db.db.users.update_one(
        {"_id": user_id_obj},
        {"$set": update_data}
    )
    
    return {"success": True, "message": f"{method} verification successful"}

async def send_2fa_code(user_id: str, method: TwoFactorMethod):
    """Send a 2FA code to the user via their preferred method"""
    # Convert string ID to ObjectId
    user_id_obj = ObjectId(user_id)
    
    # Find the user
    user = await db.db.users.find_one({"_id": user_id_obj})
    if not user:
        return {"success": False, "message": "User not found"}
    
    # Generate verification code
    verification_code = generate_verification_code(settings.VERIFICATION_CODE_LENGTH)
    now = datetime.utcnow()
    
    # Update database with the new code
    await db.db.users.update_one(
        {"_id": user_id_obj},
        {"$set": {
            "twilio_verification_code": verification_code,
            "twilio_verification_sent_at": now
        }}
    )
    
    # Send code based on method
    if method == TwoFactorMethod.SMS:
        if not user.get("phone_number"):
            return {"success": False, "message": "Phone number not set"}
        success = send_verification_sms(user["phone_number"], verification_code)
    elif method == TwoFactorMethod.WHATSAPP:
        if not user.get("phone_number"):
            return {"success": False, "message": "Phone number not set"}
        success = send_verification_whatsapp(user["phone_number"], verification_code)
    else:
        return {"success": False, "message": f"Unsupported 2FA method: {method}"}
    
    if success:
        return {"success": True, "message": f"Verification code sent via {method}"}
    else:
        return {"success": False, "message": f"Failed to send verification code via {method}"}

async def verify_twilio_2fa_code(user_id: str, code: str):
    """Verify a Twilio 2FA code (SMS or WhatsApp)"""
    # Convert string ID to ObjectId
    user_id_obj = ObjectId(user_id)
    
    # Find the user
    user = await db.db.users.find_one({"_id": user_id_obj})
    if not user:
        return False
    
    # Check verification code
    if user.get("twilio_verification_code") != code:
        return False
    
    # Check if code has expired
    if user.get("twilio_verification_sent_at"):
        sent_at = user["twilio_verification_sent_at"]
        expiry_time = sent_at + timedelta(hours=1)  # 1-hour expiry for 2FA codes
        if datetime.utcnow() > expiry_time:
            return False
    
    # Clear the verification code
    await db.db.users.update_one(
        {"_id": user_id_obj},
        {"$set": {"twilio_verification_code": None}}
    )
    
    return True

async def update_preferred_2fa_method(user_id: str, method: TwoFactorMethod):
    """Update the user's preferred 2FA method"""
    # Convert string ID to ObjectId
    user_id_obj = ObjectId(user_id)
    
    # Check if the method is enabled for the user
    user = await db.db.users.find_one({"_id": user_id_obj})
    if not user:
        return {"success": False, "message": "User not found"}
    
    if method == TwoFactorMethod.TOTP and not user.get("totp_enabled", False):
        return {"success": False, "message": "TOTP is not enabled for this user"}
    
    if method == TwoFactorMethod.SMS and not user.get("sms_enabled", False):
        return {"success": False, "message": "SMS is not enabled for this user"}
    
    if method == TwoFactorMethod.WHATSAPP and not user.get("whatsapp_enabled", False):
        return {"success": False, "message": "WhatsApp is not enabled for this user"}
    
    # Update preferred method
    await db.db.users.update_one(
        {"_id": user_id_obj},
        {"$set": {"preferred_2fa_method": method}}
    )
    
    return {"success": True, "message": f"Preferred 2FA method updated to {method}"}

async def disable_2fa_method(user_id: str, method: TwoFactorMethod):
    """Disable a specific 2FA method for the user"""
    # Convert string ID to ObjectId
    user_id_obj = ObjectId(user_id)
    
    # Prepare update based on method
    update_data = {}
    if method == TwoFactorMethod.TOTP:
        update_data["totp_enabled"] = False
        update_data["totp_secret"] = None
    elif method == TwoFactorMethod.SMS:
        update_data["sms_enabled"] = False
    elif method == TwoFactorMethod.WHATSAPP:
        update_data["whatsapp_enabled"] = False
    else:
        return {"success": False, "message": f"Unsupported 2FA method: {method}"}
    
    # If we're disabling the preferred method, reset preferred method to NONE
    user = await db.db.users.find_one({"_id": user_id_obj})
    if user and user.get("preferred_2fa_method") == method:
        # Find another enabled method
        if method != TwoFactorMethod.TOTP and user.get("totp_enabled", False):
            update_data["preferred_2fa_method"] = TwoFactorMethod.TOTP
        elif method != TwoFactorMethod.SMS and user.get("sms_enabled", False):
            update_data["preferred_2fa_method"] = TwoFactorMethod.SMS
        elif method != TwoFactorMethod.WHATSAPP and user.get("whatsapp_enabled", False):
            update_data["preferred_2fa_method"] = TwoFactorMethod.WHATSAPP
        else:
            update_data["preferred_2fa_method"] = TwoFactorMethod.NONE
    
    # Update the user
    await db.db.users.update_one(
        {"_id": user_id_obj},
        {"$set": update_data}
    )
    
    return {"success": True, "message": f"{method} has been disabled"}