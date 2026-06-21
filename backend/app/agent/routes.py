from fastapi import APIRouter, Depends, HTTPException, Query, Body, Path, status
from typing import List, Optional
import logging
from datetime import datetime, timedelta
from bson import ObjectId
from app.db import db
from app.auth.routes import get_current_user  # Correctly import from routes, not router

from app.agent.models import (
    AgentUser, AgentUserCreate, AgentUserUpdate, AgentUserResponse,
    AgentRule, AgentRuleCreate, AgentRuleUpdate, AgentRuleResponse,
    AgentActivity, AgentActivityCreate, AgentLoginResponse
)
from app.agent.db import (
    create_agent_user, get_all_agent_users, get_agent_user, update_agent_user, delete_agent_user,
    update_agent_user_status, create_agent_rule, get_all_agent_rules, get_agent_rule,
    update_agent_rule, delete_agent_rule, get_rules_for_user, log_agent_activity,
    log_agent_activities_batch, get_agent_activities, get_agent_statistics,
    get_agent_user_by_email, update_agent_user_last_login, log_agent_activity_batch, 
    register_agent_device, get_agent_activities_from_access_logs 
)
from app.agent.auth import authenticate_agent_user, create_agent_token

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/agent",
    tags=["Agent Management"],
    responses={404: {"description": "Not found"}},
)

# Authentication endpoints for agent
@router.post("/auth/login", response_model=AgentLoginResponse)
async def agent_login(email: str = Body(...), password: str = Body(...)):
    """Agent login endpoint"""
    logger.info(f"Agent login attempt: {email}")
    try:
        user = await authenticate_agent_user(email, password)
        
        if not user:
            return {"success": False, "error": "Invalid credentials"}
        
        # Create access token
        token = create_agent_token(user["_id"])
        
        # Format user object for response
        user_response = AgentUserResponse(
            _id=user["_id"],
            firstName=user.get("firstName", ""),
            lastName=user.get("lastName", ""),
            email=user["email"],
            role=user.get("role", "user"),
            department=user.get("department", ""),
            position=user.get("position", ""),
            isActive=user.get("isActive", True),
            createdAt=user.get("createdAt", datetime.now()),
            lastLogin=user.get("lastLogin")
        )
        
        return {"success": True, "token": token, "user": user_response}
    except Exception as e:
        logger.error(f"Agent login error: {str(e)}")
        return {"success": False, "error": "Authentication failed"}

# Agent User endpoints
@router.post("/users/", response_model=AgentUserResponse)
async def create_user(user: AgentUserCreate):
    """Create a new agent user"""
    # For simplicity, we'll skip the authorization check for this example
    # In production, you'd want to check if the current user has permission
    
    # Check if email already exists
    existing_user = await get_agent_user_by_email(user.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    user_dict = user.dict()
    created_user = await create_agent_user(user_dict)
    
    if not created_user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user"
        )
    
    return created_user

# Rule endpoints
@router.get("/rules/user/{user_id}", response_model=List[AgentRuleResponse])
async def read_rules_for_user(
    user_id: str = Path(..., description="The ID of the user to get rules for")
):
    """Get all rules that apply to a specific user"""
    rules = await get_rules_for_user(user_id)
    return rules

# Activity logging endpoints
@router.post("/logs/batch", response_model=dict)
async def log_activities_batch(
    logs: List[AgentActivityCreate] = Body(..., embed=True)
):
    """Log multiple agent activities in a batch"""
    if not logs:
        return {"success": False, "error": "No logs provided"}
    
    activities = [log.dict() for log in logs]
    result = await log_agent_activity_batch(activities)
    
    return result

@router.get("/activities/", response_model=List[AgentActivity])
async def read_activities(
    skip: int = 0,
    limit: int = 50,
    user_id: Optional[str] = None,
    device_id: Optional[str] = None,
    blocked: Optional[bool] = None,
    type: Optional[str] = None
):
    """Get agent activities with optional filtering - Fixed to use access_logs collection"""
    # Build filter query for access_logs collection where agent logs are actually stored
    filters = {}
    
    # Filter for agent logs only (they have 'type' field and 'source' = 'agent')
    filters["source"] = "agent"
    filters["type"] = {"$exists": True}
    
    if user_id:
        # Agent logs store user_id as either ObjectId or string
        try:
            filters["user_id"] = ObjectId(user_id)
        except:
            filters["user_id"] = user_id
            
    if device_id:
        # Agent logs use 'device_id' field
        filters["device_id"] = device_id
        
    if blocked is not None:
        # Agent logs use 'action' field, convert blocked boolean to action
        if blocked:
            filters["action"] = "block"
        else:
            filters["action"] = {"$ne": "block"}
            
    if type:
        filters["type"] = type
        
    activities = await get_agent_activities_from_access_logs(filters, skip, limit)
    
    # Convert to AgentActivity models to ensure validation
    validated_activities = []
    for activity in activities:
        try:
            # Ensure user_id is a string (already converted in the db function)
            user_id_value = activity.get("user_id")
            if user_id_value is None:
                user_id_value = ""
            
            # Create AgentActivity model with proper field mapping
            validated_activity = AgentActivity(
                id=activity.get("id"),
                userId=str(user_id_value),  # Ensure string conversion
                deviceId=activity.get("device_id"),  
                timestamp=activity.get("timestamp", datetime.now()),
                type=activity.get("type", "process"),
                resource=activity.get("resource", ""),
                blocked=activity.get("action") == "block",  # Convert action to blocked
                ruleName=activity.get("ruleName"),
                description=activity.get("description", "")
            )
            validated_activities.append(validated_activity)
        except Exception as e:
            logger.error(f"Error validating activity: {e}")
            logger.error(f"Activity data: {activity}")
            continue
    
    logger.info(f"Successfully validated {len(validated_activities)} activities")
    return validated_activities

# Device registration endpoint
@router.post("/devices/register", response_model=dict)
async def register_device(
    device_data: dict = Body(...)
):
    """Register an agent device"""
    result = await register_agent_device(device_data)
    return result

@router.get("/statistics", response_model=dict)
async def read_statistics():
    """Get agent statistics"""
    try:
        stats = await get_agent_statistics()
        return stats
    except Exception as e:
        logger.error(f"Error getting statistics: {str(e)}")
        # Return default stats if there's an error
        return {
            "users": {
                "total": 0,
                "active": 0,
                "inactive": 0
            },
            "rules": {
                "total": 0,
                "allow": 0,
                "block": 0,
                "active": 0,
                "inactive": 0
            },
            "activities": {
                "total": 0,
                "allowed": 0,
                "blocked": 0
            }
        }

@router.get("/users/", response_model=List[AgentUserResponse])
async def read_users(
    skip: int = 0, 
    limit: int = 100
):
    """Get all agent users"""
    users = await get_all_agent_users()
    return users[skip : skip + limit]

@router.get("/users/{user_id}", response_model=AgentUserResponse)
async def read_user(
    user_id: str = Path(..., description="The ID of the user to get")
):
    """Get a specific agent user"""
    user = await get_agent_user(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user

@router.put("/users/{user_id}", response_model=AgentUserResponse)
async def update_user(
    user_id: str = Path(..., description="The ID of the user to update"),
    user: AgentUserUpdate = Body(...)
):
    """Update an agent user"""
    user_dict = {k: v for k, v in user.model_dump().items() if v is not None}
    updated_user = await update_agent_user(user_id, user_dict)
    
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found or email already in use"
        )
    
    return updated_user

@router.delete("/users/{user_id}", response_model=dict)
async def delete_user(
    user_id: str = Path(..., description="The ID of the user to delete")
):
    """Delete an agent user"""
    deleted = await delete_agent_user(user_id)
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return {"success": True, "message": "User deleted"}

@router.patch("/users/{user_id}/status", response_model=AgentUserResponse)
async def update_user_status(
    user_id: str = Path(..., description="The ID of the user to update"),
    status_data: dict = Body(...),  # Changed from direct isActive parameter to a dictionary
):
    """Update an agent user's active status"""
    # Extract isActive from the request body
    if "isActive" not in status_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="isActive field is required in the request body"
        )
    
    isActive = status_data["isActive"]
    
    # Validate isActive is a boolean
    if not isinstance(isActive, bool):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="isActive must be a boolean value"
        )
    
    updated_user = await update_agent_user_status(user_id, isActive)
    
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return updated_user

# Agent Rule endpoints
@router.post("/rules/", response_model=AgentRuleResponse)
async def create_rule(
    rule: AgentRuleCreate = Body(...)
):
    """Create a new agent rule"""
    rule_dict = rule.model_dump()
    
    created_rule = await create_agent_rule(rule_dict)
    
    if not created_rule:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create rule"
        )
    
    return created_rule

@router.get("/rules/", response_model=List[AgentRuleResponse])
async def read_rules(
    skip: int = 0, 
    limit: int = 100,
    type: Optional[str] = None,
    active: Optional[bool] = None
):
    """Get all agent rules with optional filtering"""
    # Build filter query
    filters = {}
    if type:
        filters["type"] = type
    if active is not None:
        filters["isActive"] = active
        
    rules = await get_all_agent_rules(filters)
    return rules[skip : skip + limit]

@router.get("/rules/{rule_id}", response_model=AgentRuleResponse)
async def read_rule(
    rule_id: str = Path(..., description="The ID of the rule to get")
):
    """Get a specific agent rule"""
    rule = await get_agent_rule(rule_id)
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )
    return rule

@router.put("/rules/{rule_id}", response_model=AgentRuleResponse)
async def update_rule(
    rule_id: str = Path(..., description="The ID of the rule to update"),
    rule: AgentRuleUpdate = Body(...)
):
    """Update an agent rule"""
    rule_dict = {k: v for k, v in rule.model_dump().items() if v is not None}
    updated_rule = await update_agent_rule(rule_id, rule_dict)
    
    if not updated_rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )
    
    return updated_rule

@router.delete("/rules/{rule_id}", response_model=dict)
async def delete_rule(
    rule_id: str = Path(..., description="The ID of the rule to delete")
):
    """Delete an agent rule"""
    deleted = await delete_agent_rule(rule_id)
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found"
        )
    
    return {"success": True, "message": "Rule deleted"}

@router.get("/rules/user/{user_id}", response_model=List[AgentRuleResponse])
async def read_rules_for_user(
    user_id: str = Path(..., description="The ID of the user to get rules for")
):
    """Get all rules that apply to a specific user"""
    rules = await get_rules_for_user(user_id)
    return rules


@router.post("/logs/batch", response_model=dict)
async def log_activities_batch(
    logs: List[AgentActivityCreate] = Body(..., embed=True)
):
    """Log multiple agent activities in a batch with improved validation and error handling"""
    if not logs:
        return {"success": False, "count": 0, "error": "No logs provided"}
    
    try:
        # Log the number of activities received and a sample for debugging
        logger.info(f"Received {len(logs)} agent activities to log")
        if logs:
            logger.debug(f"Sample activity: {logs[0].dict()}")
        
        # Validate each activity before processing
        validated_logs = []
        validation_errors = []
        
        for i, log in enumerate(logs):
            try:
                # Add additional validation if needed
                if not log.userId:
                    raise ValueError("Missing userId")
                if not log.type:
                    raise ValueError("Missing activity type")
                if not log.resource:
                    raise ValueError("Missing resource information")
                
                # Convert to dict - this validates against the model
                log_dict = log.dict()
                
                # Add to validated logs
                validated_logs.append(log_dict)
            except Exception as validation_error:
                error_msg = f"Validation error in log #{i}: {str(validation_error)}"
                logger.warning(error_msg)
                validation_errors.append(error_msg)
        
        # Only process if we have valid logs
        if not validated_logs:
            logger.error(f"No valid logs to process. Errors: {validation_errors}")
            return {
                "success": False, 
                "error": "All logs failed validation", 
                "validation_errors": validation_errors
            }
        
        # Process validated logs
        activities = [log for log in validated_logs]
        result = await log_agent_activity_batch(activities)
        
        # Add validation info to the result
        if validation_errors:
            result["validation_errors"] = validation_errors
            result["total_received"] = len(logs)
            result["valid_processed"] = len(validated_logs)
        
        return result
    except Exception as e:
        logger.error(f"Unexpected error in log_activities_batch: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False, 
            "error": f"Server error: {str(e)}", 
            "count": 0
        }


@router.get("/statistics", response_model=dict)
async def read_statistics():
    """Get agent statistics"""
    stats = await get_agent_statistics()
    return stats

# Add missing function for user lookup by email
async def get_agent_user_by_email(email: str):
    """Get a specific agent user by email"""
    from app.agent.db import get_agent_user_by_email as db_get_agent_user_by_email
    return await db_get_agent_user_by_email(email)