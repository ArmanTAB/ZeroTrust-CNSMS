# backend/app/agent/routes.py - Fixed Import
from fastapi import APIRouter, Depends, HTTPException, Query, Body, Path, status
from typing import List, Optional
import logging
from datetime import datetime, timedelta
from bson import ObjectId

# Fix the import path for the auth module
from app.auth.router import get_current_user  # Changed from app.auth.auth import get_current_user

from app.agent.models import (
    AgentUser, AgentUserCreate, AgentUserUpdate, AgentUserResponse,
    AgentRule, AgentRuleCreate, AgentRuleUpdate, AgentRuleResponse,
    AgentActivity, AgentActivityCreate, AgentLoginResponse
)
from app.agent.db import (
    create_agent_user, get_all_agent_users, get_agent_user, update_agent_user, delete_agent_user,
    update_agent_user_status, create_agent_rule, get_all_agent_rules, get_agent_rule,
    update_agent_rule, delete_agent_rule, get_rules_for_user, log_agent_activity,
    log_agent_activities_batch, get_agent_activities, get_agent_statistics
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
    user_dict = user.model_dump()
    created_user = await create_agent_user(user_dict)
    
    if not created_user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user"
        )
    
    return created_user

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
    isActive: bool = Body(...)
):
    """Update an agent user's active status"""
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

# Agent Activity endpoints
@router.post("/activities/", response_model=dict)
async def log_activity(
    activity: AgentActivityCreate = Body(...)
):
    """Log an agent activity"""
    activity_dict = activity.model_dump()
    logged_activity = await log_agent_activity(activity_dict)
    
    if not logged_activity:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to log activity"
        )
    
    return {"success": True, "activity": logged_activity}

@router.post("/logs/batch", response_model=dict)
async def log_activities_batch(
    logs: List[AgentActivityCreate] = Body(..., embed=True)
):
    """Log multiple agent activities in a batch"""
    if not logs:
        return {"success": False, "error": "No logs provided"}
    
    activities = [log.model_dump() for log in logs]
    result = await log_agent_activities_batch(activities)
    
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
    """Get agent activities with optional filtering"""
    # Build filter query
    filters = {}
    if user_id:
        try:
            filters["userId"] = ObjectId(user_id)
        except:
            filters["userId"] = user_id
            
    if device_id:
        filters["deviceId"] = device_id
    if blocked is not None:
        filters["blocked"] = blocked
    if type:
        filters["type"] = type
        
    activities = await get_agent_activities(filters, limit)
    return activities[skip : skip + limit]

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