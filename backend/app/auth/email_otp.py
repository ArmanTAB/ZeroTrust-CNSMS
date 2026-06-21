import random
import string
from datetime import datetime, timedelta
from ..db import db
from ..common.email_utils import send_otp_email
import logging
from bson.objectid import ObjectId

logger = logging.getLogger(__name__)

# OTP expiry time in minutes
OTP_EXPIRY_MINUTES = 10

def generate_otp(length=6):
    """Generate a random numeric OTP code"""
    return ''.join(random.choices(string.digits, k=length))

async def generate_email_otp(user_id: str) -> str:
    """Generate a new email OTP for a user"""
    logger.info(f"Generating email OTP for user ID: {user_id}")
    
    try:
        # Convert string ID to ObjectId
        user_id_obj = ObjectId(user_id)
        
        # Get user from database
        user = await db.db.users.find_one({"_id": user_id_obj})
        
        if not user:
            logger.error(f"User not found with ID: {user_id_obj}")
            raise ValueError(f"User not found: {user_id}")
        
        # Generate a random 6-digit OTP
        otp = generate_otp(6)
        expiry_time = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)
        
        # Update user document with OTP information
        await db.db.users.update_one(
            {"_id": user_id_obj},
            {"$set": {
                "email_otp": otp,
                "email_otp_expiry": expiry_time,
                "email_otp_created_at": datetime.utcnow()
            }}
        )
        
        # Send OTP via email
        sent = send_otp_email(
            recipient_email=user["email"],
            otp_code=otp,
            full_name=user["full_name"]
        )
        
        if not sent:
            logger.error(f"Failed to send OTP email to {user['email']}")
        
        return otp
    except Exception as e:
        logger.error(f"Error generating email OTP: {str(e)}", exc_info=True)
        raise

async def verify_email_otp(user_id: str, otp: str) -> bool:
    """Verify an email OTP for a user"""
    logger.info(f"Verifying email OTP for user ID: {user_id}")
    
    try:
        # Convert string ID to ObjectId
        user_id_obj = ObjectId(user_id)
        
        # Get user from database
        user = await db.db.users.find_one({"_id": user_id_obj})
        
        if not user:
            logger.error(f"User not found with ID: {user_id_obj}")
            return False
        
        # Get stored OTP and expiry time
        stored_otp = user.get("email_otp")
        expiry_time = user.get("email_otp_expiry")
        
        if not stored_otp or not expiry_time:
            logger.error(f"No OTP found for user: {user_id}")
            return False
        
        # Check if OTP has expired
        now = datetime.utcnow()
        if now > expiry_time:
            logger.warning(f"OTP has expired for user: {user_id}")
            return False
        
        # Verify OTP
        if otp != stored_otp:
            logger.warning(f"Invalid OTP provided for user: {user_id}")
            return False
        
        # OTP is valid, clear it from the database and mark as verified
        await db.db.users.update_one(
            {"_id": user_id_obj},
            {"$set": {
                "email_otp": None,
                "email_otp_expiry": None,
                "email_otp_verified": True,
                "email_otp_verified_at": now
            }}
        )
        
        return True
    except Exception as e:
        logger.error(f"Error verifying email OTP: {str(e)}", exc_info=True)
        return False

async def disable_email_otp(user_id: str) -> bool:
    """Disable email OTP for a user"""
    try:
        # Convert string ID to ObjectId
        user_id_obj = ObjectId(user_id)
        
        # Update the user to disable email OTP
        result = await db.db.users.update_one(
            {"_id": user_id_obj},
            {"$set": {
                "email_otp_enabled": False,
                "email_otp": None,
                "email_otp_expiry": None
            }}
        )
        
        return result.modified_count > 0
    except Exception as e:
        logger.error(f"Error disabling email OTP: {str(e)}", exc_info=True)
        return False

async def is_email_otp_enabled(user_id: str) -> bool:
    """Check if email OTP is enabled for a user"""
    try:
        # Convert string ID to ObjectId
        user_id_obj = ObjectId(user_id)
        
        # Get user from database
        user = await db.db.users.find_one({"_id": user_id_obj})
        
        if not user:
            return False
        
        return user.get("email_otp_enabled", False)
    except Exception as e:
        logger.error(f"Error checking if email OTP is enabled: {str(e)}", exc_info=True)
        return False