import pyotp
import qrcode
import base64
import io
from datetime import datetime
from ..db import db
from .models import User
from typing import Optional, Dict, Any
import logging
from bson.objectid import ObjectId

logger = logging.getLogger(__name__)

async def generate_totp_secret(user_id: str) -> Dict[str, Any]:
    """Generate a new TOTP secret for a user"""
    logger.info(f"Starting generate_totp_secret for user ID: {user_id}")
    
    # Generate a random secret key
    secret = pyotp.random_base32()
    logger.info(f"Generated secret: {secret}")
    
    # Create a TOTP object
    totp = pyotp.TOTP(secret)
    
    try:
        # Convert string ID to ObjectId
        from bson.objectid import ObjectId
        user_id_obj = ObjectId(user_id)
        
        # Get user from database
        logger.info(f"Looking up user with ID: {user_id_obj}")
        user = await db.db.users.find_one({"_id": user_id_obj})
        
        if not user:
            logger.error(f"User not found with ID: {user_id_obj}")
            raise ValueError(f"User not found: {user_id}")
        
        logger.info(f"Found user: {user.get('email')}")
        user_email = user.get("email", "user")
        
        # Generate the provisioning URI for QR code
        issuer_name = "Zero Trust Security"
        provisioning_uri = totp.provisioning_uri(name=user_email, issuer_name=issuer_name)
        logger.info(f"Generated provisioning URI: {provisioning_uri}")
        
        # Generate QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(provisioning_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Save the QR code as base64
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        qr_code_base64 = base64.b64encode(buffer.getvalue()).decode()
        logger.info(f"Generated QR code base64 (length: {len(qr_code_base64)})")
        
        # Update user document with TOTP secret (not activated yet)
        await db.db.users.update_one(
            {"_id": user_id_obj},
            {"$set": {
                "totp_secret": secret,
                "totp_enabled": False,
                "totp_verified": False,
                "totp_created_at": datetime.utcnow()
            }}
        )
        
        result = {
            "secret": secret,
            "qr_code": qr_code_base64,
            "issuer": issuer_name,
            "account": user_email
        }
        logger.info("Successfully generated TOTP setup data")
        return result
    except Exception as e:
        logger.error(f"Error in generate_totp_secret: {str(e)}", exc_info=True)
        raise

async def verify_totp(user_id: str, token: str) -> bool:
    """Verify a TOTP token against the user's secret"""
    logger.info(f"Verifying TOTP for user ID: {user_id}")
    
    try:
        # Convert string ID to ObjectId
        from bson.objectid import ObjectId
        user_id_obj = ObjectId(user_id)
        
        # Get user from database
        logger.info(f"Looking up user with ID: {user_id_obj}")
        user = await db.db.users.find_one({"_id": user_id_obj})
        
        if not user:
            logger.error(f"User not found with ID: {user_id_obj}")
            return False
        
        logger.info(f"Found user: {user.get('email')}")
        
        # Get the TOTP secret
        secret = user.get("totp_secret")
        if not secret:
            logger.error(f"TOTP secret not found for user: {user_id}")
            return False
        
        logger.info(f"Got TOTP secret, verifying token: {token}")
        
        # Verify the token
        totp = pyotp.TOTP(secret)
        is_valid = totp.verify(token)
        
        logger.info(f"Token verification result: {is_valid}")
        
        # If this is the first verification, mark as verified and enabled
        if is_valid and not user.get("totp_verified", False):
            logger.info(f"First valid verification, marking TOTP as enabled for user: {user_id}")
            await db.db.users.update_one(
                {"_id": user_id_obj},
                {"$set": {
                    "totp_verified": True,
                    "totp_enabled": True,
                    "totp_verified_at": datetime.utcnow()
                }}
            )
        
        return is_valid
    except Exception as e:
        logger.error(f"Error in verify_totp: {str(e)}", exc_info=True)
        return False

async def disable_totp(user_id: str) -> bool:
    """Disable TOTP for a user"""
    try:
        # Convert string ID to ObjectId
        user_id_obj = ObjectId(user_id)
        logger.info(f"Disabling TOTP for user ID: {user_id_obj}")
        
        result = await db.db.users.update_one(
            {"_id": user_id_obj},
            {"$set": {
                "totp_enabled": False,
            }}
        )
        
        success = result.modified_count > 0
        logger.info(f"TOTP disable result: {success}, modified count: {result.modified_count}")
        return success
    except Exception as e:
        logger.error(f"Error in disable_totp: {str(e)}", exc_info=True)
        return False

async def is_totp_enabled(user_id: str) -> bool:
    """Check if TOTP is enabled for a user"""
    logger.info(f"Checking if TOTP is enabled for user ID: {user_id}")
    
    try:
        # Convert string ID to ObjectId
        user_id_obj = ObjectId(user_id)
        logger.info(f"Converted to ObjectId: {user_id_obj}")
        
        # Get user from database
        user = await db.db.users.find_one({"_id": user_id_obj})
        
        if not user:
            logger.error(f"User not found with ID: {user_id_obj}")
            return False
        
        # Log the totp_enabled value for debugging
        totp_enabled = user.get("totp_enabled", False)
        logger.info(f"TOTP enabled value from database: {totp_enabled}")
        
        return totp_enabled
    except Exception as e:
        logger.error(f"Error in is_totp_enabled: {str(e)}", exc_info=True)
        return False