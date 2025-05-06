# backend/app/auth/routes.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import datetime, timedelta
from jose import JWTError, jwt
from typing import Annotated, Optional
from ..config import settings
from .utils import (
    verify_password, create_access_token, get_user_by_email, create_user,
    verify_user_email, resend_verification_email, request_password_reset,
    reset_password
)
from .models import (
    UserCreate, UserLogin, User, Token, UserInDB, 
    VerificationRequest, ResendVerificationRequest,
    PasswordResetRequest, ResetPasswordRequest
)
from ..db import db
import logging
from .totp import generate_totp_secret, verify_totp, disable_totp, is_totp_enabled

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["authentication"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]):
    """Get current user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await get_user_by_email(email)
    if user is None:
        raise credentials_exception
    
    return User(
        id=user["_id"],
        email=user["email"],
        full_name=user["full_name"],
        role=user["role"],
        created_at=user["created_at"],
        last_login=user.get("last_login"),
        is_active=user["is_active"],
        is_verified=user.get("is_verified", False)
    )

@router.post("/register", response_model=User)
async def register(user_data: UserCreate):
    """Register new user"""
    # Check if user already exists
    existing_user = await get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create user
    user = await create_user(user_data)
    
    return User(
        id=user["_id"],
        email=user["email"],
        full_name=user["full_name"],
        role=user["role"],
        created_at=user["created_at"],
        is_active=user["is_active"],
        is_verified=user.get("is_verified", False)
    )

@router.post("/token", response_model=Token)
async def login_for_access_token(form_data: Annotated[OAuth2PasswordRequestForm, Depends()]):
    """Login and get access token"""
    user = await get_user_by_email(form_data.username)
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is verified
    if not user.get("is_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email before logging in."
        )
    
    # Check if 2FA is enabled
    if user.get("totp_enabled", False):
        # Extract the token from the password field or another field
        # In a real implementation, you'd want a separate field for the token
        # For now, we'll check if there's a token in the OAuth form
        totp_token = None
        for param in form_data.scopes:  # Using scopes field to pass the token
            if param.startswith("totp:"):
                totp_token = param.split(":", 1)[1]
                break
        
        if not totp_token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="2FA token required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Verify the token
        is_valid = await verify_totp(str(user["_id"]), totp_token)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid 2FA token",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    # Update last login
    await db.db.users.update_one(
        {"email": form_data.username},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["email"], "user_id": str(user["_id"])},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

# Add an additional endpoint for 2FA authentication
@router.post("/login/2fa-check", response_model=dict)
async def check_2fa_required(login_data: dict):
    """Check if 2FA is required for login"""
    email = login_data.get("email")
    password = login_data.get("password")
    
    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required"
        )
    
    user = await get_user_by_email(email)
    if not user or not verify_password(password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Check if user is verified
    if not user.get("is_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email before logging in."
        )
    
    # Check if 2FA is enabled
    totp_enabled = user.get("totp_enabled", False)
    
    return {
        "totp_required": totp_enabled,
        "email": email,
        "user_id": str(user["_id"]) if totp_enabled else None
    }

@router.get("/me", response_model=User)
async def read_users_me(current_user: Annotated[User, Depends(get_current_user)]):
    """Get current user info"""
    return current_user

@router.post("/verify-email")
async def verify_email(verification_data: VerificationRequest):
    """Verify user email with verification code"""
    result = await verify_user_email(verification_data.email, verification_data.code)
    
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["message"]
        )
    
    return {"status": "success", "message": result["message"]}

@router.post("/resend-verification")
async def resend_verification(resend_data: ResendVerificationRequest):
    """Resend verification email"""
    result = await resend_verification_email(resend_data.email)
    
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["message"]
        )
    
    return {"status": "success", "message": result["message"]}

@router.get("/verification-status/{email}")
async def get_verification_status(email: str):
    """Check if a user's email is verified"""
    user = await get_user_by_email(email)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return {
        "is_verified": user.get("is_verified", False),
        "email": user["email"]
    }
    
@router.get("/check-email/{email}")
async def check_email_exists(email: str):
    """Check if an email already exists in the system"""
    user = await get_user_by_email(email)
    
    if user:
        return {"exists": True}
    else:
        return {"exists": False}

@router.post("/request-password-reset")
async def request_password_reset_route(reset_data: PasswordResetRequest):
    """Request a password reset code via email"""
    result = await request_password_reset(reset_data.email)
    
    # Always return success for security reasons
    # Even if the email doesn't exist in our system
    return {"status": "success", "message": "If your email is registered, a password reset code has been sent"}

@router.post("/reset-password")
async def reset_password_route(reset_data: ResetPasswordRequest):
    """Reset password using reset code and new password"""
    result = await reset_password(
        reset_data.email, 
        reset_data.code, 
        reset_data.new_password
    )
    
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["message"]
        )
    
    return {"status": "success", "message": result["message"]}

# TOTP 2FA endpoints
@router.post("/totp/setup", response_model=dict)
async def setup_totp(current_user: Annotated[User, Depends(get_current_user)]):
    """Generate a new TOTP secret and return setup details"""
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled for this user"
        )
    
    try:
        logger.info(f"Setting up TOTP for user ID: {current_user.id}, type: {type(current_user.id)}")
        
        totp_setup = await generate_totp_secret(current_user.id)
        logger.info(f"TOTP setup result: {totp_setup is not None}")
        if totp_setup:
            logger.info(f"TOTP setup contains keys: {list(totp_setup.keys())}")
        
        return {
            "status": "success",
            "message": "TOTP setup initiated",
            "data": totp_setup  # This should contain the QR code and secret
        }
    except Exception as e:
        logger.error(f"Error setting up TOTP: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to setup TOTP: {str(e)}"
        )

@router.post("/totp/verify", response_model=dict)
async def verify_totp_token(
    current_user: Annotated[User, Depends(get_current_user)],
    token_data: dict
):
    """Verify a TOTP token and enable 2FA"""
    token = token_data.get("token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token is required"
        )
    
    is_valid = await verify_totp(current_user.id, token)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token"
        )
    
    return {
        "status": "success",
        "message": "TOTP verified and enabled",
        "totp_enabled": True
    }

@router.post("/totp/disable", response_model=dict)
async def disable_totp_auth(current_user: Annotated[User, Depends(get_current_user)]):
    """Disable TOTP for a user"""
    logger.info(f"Disable TOTP request for user ID: {current_user.id}")
    
    try:
        # Check if 2FA is enabled for the user
        is_enabled = await is_totp_enabled(current_user.id)
        
        if not is_enabled:
            logger.warning(f"2FA is not enabled for user {current_user.id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="2FA is not enabled for this user"
            )
        
        # Attempt to disable 2FA
        success = await disable_totp(current_user.id)
        
        if not success:
            logger.error(f"Failed to disable TOTP for user {current_user.id}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to disable TOTP"
            )
        
        logger.info(f"Successfully disabled TOTP for user {current_user.id}")
        
        return {
            "status": "success",
            "message": "TOTP disabled",
            "totp_enabled": False
        }
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error disabling TOTP: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to disable TOTP: {str(e)}"
        )

@router.get("/totp/status", response_model=dict)
async def get_totp_status(current_user: Annotated[User, Depends(get_current_user)]):
    """Check if TOTP is enabled for a user"""
    is_enabled = await is_totp_enabled(current_user.id)
    return {
        "totp_enabled": is_enabled
    }