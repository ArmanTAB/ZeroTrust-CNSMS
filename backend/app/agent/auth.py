from datetime import datetime, timedelta
import bcrypt
from jose import jwt
import logging

from app.agent.db import get_agent_user_by_email, update_agent_user_last_login
from app.config import settings

logger = logging.getLogger(__name__)

async def authenticate_agent_user(email: str, password: str):
    """Authenticate an agent user"""
    # Get user by email
    user = await get_agent_user_by_email(email)
    
    if not user:
        logger.warning(f"Authentication failed: User not found - {email}")
        return None
    
    # Check if user is active
    if not user.get("isActive", True):
        logger.warning(f"Authentication failed: User is inactive - {email}")
        return None
    
    # Verify password
    if not verify_password(password, user.get("hashed_password", "")):
        logger.warning(f"Authentication failed: Invalid password - {email}")
        return None
    
    # Update last login
    user_id = str(user["_id"])
    await update_agent_user_last_login(user_id)
    
    # Return user without password
    user["_id"] = user_id
    if "hashed_password" in user:
        del user["hashed_password"]
        
    return user

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False

def create_agent_token(user_id: str, expires_delta: timedelta = None):
    """Create access token for agent user"""
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"sub": str(user_id), "exp": expire, "type": "agent"}
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    
    return encoded_jwt