# backend/app/auth/utils.py
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
from passlib.context import CryptContext
from ..config import settings
from ..db import db
import uuid
from bson.objectid import ObjectId

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

async def create_user(user_data):
    """Create new user"""
    hashed_password = get_password_hash(user_data.password)
    user_in_db = {
        "email": user_data.email,
        "hashed_password": hashed_password,
        "full_name": user_data.full_name,
        "role": user_data.role,
        "created_at": datetime.utcnow(),
        "is_active": True
    }
    
    result = await db.db.users.insert_one(user_in_db)
    user_in_db["_id"] = str(result.inserted_id)
    return user_in_db