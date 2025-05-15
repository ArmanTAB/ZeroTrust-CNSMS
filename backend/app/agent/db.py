from app.db import db
from pymongo import ReturnDocument
from bson import ObjectId
from datetime import datetime
import bcrypt
from typing import List, Optional, Dict, Any

# Helper functions for agent module
def agent_user_helper(user) -> dict:
    if user:
        return {
            "_id": str(user["_id"]),
            "firstName": user.get("firstName", ""),
            "lastName": user.get("lastName", ""),
            "email": user.get("email", ""),
            "role": user.get("role", "user"),
            "department": user.get("department", ""),
            "position": user.get("position", ""),
            "isActive": user.get("isActive", True),
            "createdAt": user.get("createdAt", datetime.now()),
            "lastLogin": user.get("lastLogin")
        }
    return None

def agent_rule_helper(rule) -> dict:
    if rule:
        return {
            "_id": str(rule["_id"]),
            "name": rule.get("name", ""),
            "description": rule.get("description", ""),
            "type": rule.get("type", "block"),
            "resources": {
                "websites": rule.get("resources", {}).get("websites", []),
                "applications": rule.get("resources", {}).get("applications", []),
                "files": rule.get("resources", {}).get("files", [])
            },
            "appliesTo": {
                "users": [str(user_id) if isinstance(user_id, ObjectId) else user_id 
                          for user_id in rule.get("appliesTo", {}).get("users", [])],
                "departments": rule.get("appliesTo", {}).get("departments", []),
                "roles": rule.get("appliesTo", {}).get("roles", [])
            },
            "conditions": rule.get("conditions", {}),
            "priority": rule.get("priority", 10),
            "isActive": rule.get("isActive", True),
            "createdAt": rule.get("createdAt", datetime.now()),
            "createdBy": str(rule["createdBy"]) if rule.get("createdBy") else None,
            "updatedAt": rule.get("updatedAt")
        }
    return None

# Database operations for Agent Users
async def create_agent_user(user_data: dict) -> dict:
    """Create a new agent user"""
    # Hash the password for secure storage
    if "password" in user_data:
        hashed_password = bcrypt.hashpw(user_data["password"].encode('utf-8'), bcrypt.gensalt())
        user_data["hashed_password"] = hashed_password.decode('utf-8')
        del user_data["password"]
    
    user_data["createdAt"] = datetime.now()
    
    # Insert the user into the database
    result = await db.db.agent_users.insert_one(user_data)
    
    # Get and return the created user (without hashed_password)
    created_user = await db.db.agent_users.find_one({"_id": result.inserted_id})
    created_user = agent_user_helper(created_user)
    
    return created_user

async def get_all_agent_users() -> List[dict]:
    """Get all agent users"""
    users = []
    async for user in db.db.agent_users.find():
        users.append(agent_user_helper(user))
    return users

async def get_agent_user(user_id: str) -> dict:
    """Get a specific agent user by ID"""
    user = await db.db.agent_users.find_one({"_id": ObjectId(user_id)})
    return agent_user_helper(user) if user else None

async def get_agent_user_by_email(email: str) -> dict:
    """Get a specific agent user by email"""
    user = await db.db.agent_users.find_one({"email": email})
    return user

async def update_agent_user(user_id: str, data: dict) -> dict:
    """Update an agent user"""
    # Hash the password if it's being updated
    if "password" in data and data["password"]:
        hashed_password = bcrypt.hashpw(data["password"].encode('utf-8'), bcrypt.gensalt())
        data["hashed_password"] = hashed_password.decode('utf-8')
        del data["password"]
    
    # Get current user data to avoid overwriting fields that aren't being updated
    current_user = await db.db.agent_users.find_one({"_id": ObjectId(user_id)})
    
    # Check if changing email, make sure it's not already in use
    if "email" in data and data["email"] != current_user.get("email", ""):
        existing_user = await db.db.agent_users.find_one({"email": data["email"]})
        if existing_user:
            return None  # Email already in use
    
    # Update the user
    updated_user = await db.db.agent_users.find_one_and_update(
        {"_id": ObjectId(user_id)},
        {"$set": data},
        return_document=ReturnDocument.AFTER
    )
    
    return agent_user_helper(updated_user)

async def delete_agent_user(user_id: str) -> bool:
    """Delete an agent user"""
    result = await db.db.agent_users.delete_one({"_id": ObjectId(user_id)})
    return result.deleted_count > 0

async def update_agent_user_status(user_id: str, is_active: bool) -> dict:
    """Update an agent user's active status"""
    updated_user = await db.db.agent_users.find_one_and_update(
        {"_id": ObjectId(user_id)},
        {"$set": {"isActive": is_active}},
        return_document=ReturnDocument.AFTER
    )
    
    return agent_user_helper(updated_user)

async def update_agent_user_last_login(user_id: str) -> dict:
    """Update an agent user's last login time"""
    updated_user = await db.db.agent_users.find_one_and_update(
        {"_id": ObjectId(user_id)},
        {"$set": {"lastLogin": datetime.now()}},
        return_document=ReturnDocument.AFTER
    )
    
    return agent_user_helper(updated_user)

# Database operations for Agent Rules
async def create_agent_rule(rule_data: dict) -> dict:
    """Create a new agent rule"""
    if "createdBy" in rule_data and rule_data["createdBy"]:
        rule_data["createdBy"] = ObjectId(rule_data["createdBy"])
        
    # Convert any user IDs to ObjectId
    if "appliesTo" in rule_data and "users" in rule_data["appliesTo"]:
        try:
            rule_data["appliesTo"]["users"] = [
                ObjectId(user_id) if isinstance(user_id, str) and len(user_id) == 24 else user_id
                for user_id in rule_data["appliesTo"]["users"]
            ]
        except Exception:
            # If we can't convert to ObjectId, leave as is
            pass
            
    rule_data["createdAt"] = datetime.now()
    
    # Insert the rule into the database
    result = await db.db.agent_rules.insert_one(rule_data)
    
    # Get and return the created rule
    created_rule = await db.db.agent_rules.find_one({"_id": result.inserted_id})
    created_rule = agent_rule_helper(created_rule)
    
    return created_rule

async def get_all_agent_rules(filters: Dict[str, Any] = None) -> List[dict]:
    """Get all agent rules with optional filtering"""
    query = filters or {}
    rules = []
    async for rule in db.db.agent_rules.find(query):
        rules.append(agent_rule_helper(rule))
    return rules

async def get_agent_rule(rule_id: str) -> dict:
    """Get a specific agent rule by ID"""
    rule = await db.db.agent_rules.find_one({"_id": ObjectId(rule_id)})
    return agent_rule_helper(rule) if rule else None

async def update_agent_rule(rule_id: str, data: dict) -> dict:
    """Update an agent rule"""
    data["updatedAt"] = datetime.now()
    
    # Convert any user IDs to ObjectId
    if "appliesTo" in data and "users" in data["appliesTo"]:
        try:
            data["appliesTo"]["users"] = [
                ObjectId(user_id) if isinstance(user_id, str) and len(user_id) == 24 else user_id
                for user_id in data["appliesTo"]["users"]
            ]
        except Exception:
            # If we can't convert to ObjectId, leave as is
            pass
            
    # Update the rule
    updated_rule = await db.db.agent_rules.find_one_and_update(
        {"_id": ObjectId(rule_id)},
        {"$set": data},
        return_document=ReturnDocument.AFTER
    )
    
    return agent_rule_helper(updated_rule)

async def delete_agent_rule(rule_id: str) -> bool:
    """Delete an agent rule"""
    result = await db.db.agent_rules.delete_one({"_id": ObjectId(rule_id)})
    return result.deleted_count > 0

async def get_rules_for_user(user_id: str) -> List[dict]:
    """Get all rules that apply to a specific user"""
    # Get user details first to determine role and department
    user = await get_agent_user(user_id)
    if not user:
        return []
    
    rules = []
    
    # Find all active rules
    all_active_rules = await get_all_agent_rules({"isActive": True})
    
    # Filter rules that apply to this user
    for rule in all_active_rules:
        # Check if rule applies directly to this user
        user_specific = user_id in rule.get("appliesTo", {}).get("users", [])
        
        # Check if rule applies to user's department
        department_applies = (
            user.get("department") in rule.get("appliesTo", {}).get("departments", []) or
            "All" in rule.get("appliesTo", {}).get("departments", []) or
            "*" in rule.get("appliesTo", {}).get("departments", [])
        )
        
        # Check if rule applies to user's role
        role_applies = (
            user.get("role") in rule.get("appliesTo", {}).get("roles", []) or
            "All" in rule.get("appliesTo", {}).get("roles", []) or
            "*" in rule.get("appliesTo", {}).get("roles", [])
        )
        
        # Add a flag to mark rules directly assigned to the user
        if user_specific:
            rule["__userSpecific"] = True
            
        # Add rule if it applies to the user
        if user_specific or (department_applies and role_applies):
            rules.append(rule)
    
    # Sort rules by priority (higher first)
    rules.sort(key=lambda r: r.get("priority", 0), reverse=True)
    
    return rules

# Database operations for Agent Activities
async def log_agent_activity(activity_data: dict) -> dict:
    """Log an agent activity"""
    # Convert action to blocked flag
    if "action" in activity_data:
        activity_data["blocked"] = activity_data["action"].lower() == "block"
        del activity_data["action"]
    
    # Add timestamp if not provided
    if "timestamp" not in activity_data:
        activity_data["timestamp"] = datetime.now()
    
    # Convert user ID to ObjectId
    if "userId" in activity_data and isinstance(activity_data["userId"], str):
        activity_data["userId"] = ObjectId(activity_data["userId"])
    
    # Insert activity
    result = await db.db.agent_activities.insert_one(activity_data)
    
    # Get and return the created activity
    created_activity = await db.db.agent_activities.find_one({"_id": result.inserted_id})
    
    if created_activity:
        created_activity["_id"] = str(created_activity["_id"])
        if isinstance(created_activity.get("userId"), ObjectId):
            created_activity["userId"] = str(created_activity["userId"])
    
    return created_activity

async def log_agent_activities_batch(activities: List[dict]) -> dict:
    """Log multiple agent activities in a batch"""
    if not activities:
        return {"success": False, "count": 0, "error": "No activities provided"}
    
    # Process each activity
    processed_activities = []
    for activity in activities:
        # Convert action to blocked flag
        if "action" in activity:
            activity["blocked"] = activity["action"].lower() == "block"
            del activity["action"]
        
        # Add timestamp if not provided
        if "timestamp" not in activity:
            activity["timestamp"] = datetime.now()
        
        # Convert user ID to ObjectId
        if "userId" in activity and isinstance(activity["userId"], str):
            try:
                activity["userId"] = ObjectId(activity["userId"])
            except:
                pass  # Keep as string if not a valid ObjectId
        
        processed_activities.append(activity)
    
    # Insert activities
    result = await db.db.agent_activities.insert_many(processed_activities)
    
    return {"success": True, "count": len(result.inserted_ids)}

async def get_agent_activities(filters: Dict[str, Any] = None, limit: int = 50) -> List[dict]:
    """Get agent activities with optional filtering"""
    query = filters or {}
    activities = []
    
    cursor = db.db.agent_activities.find(query).sort("timestamp", -1).limit(limit)
    
    async for activity in cursor:
        if activity:
            activity["_id"] = str(activity["_id"])
            if isinstance(activity.get("userId"), ObjectId):
                activity["userId"] = str(activity["userId"])
            activities.append(activity)
    
    return activities

async def get_agent_statistics() -> dict:
    """Get agent statistics"""
    # User statistics
    total_users = await db.db.agent_users.count_documents({})
    active_users = await db.db.agent_users.count_documents({"isActive": True})
    inactive_users = await db.db.agent_users.count_documents({"isActive": False})
    
    # Rule statistics
    total_rules = await db.db.agent_rules.count_documents({})
    allow_rules = await db.db.agent_rules.count_documents({"type": "allow"})
    block_rules = await db.db.agent_rules.count_documents({"type": "block"})
    active_rules = await db.db.agent_rules.count_documents({"isActive": True})
    inactive_rules = await db.db.agent_rules.count_documents({"isActive": False})
    
    # Activity statistics
    total_activities = await db.db.agent_activities.count_documents({})
    allowed_activities = await db.db.agent_activities.count_documents({"blocked": False})
    blocked_activities = await db.db.agent_activities.count_documents({"blocked": True})
    
    return {
        "users": {
            "total": total_users,
            "active": active_users,
            "inactive": inactive_users
        },
        "rules": {
            "total": total_rules,
            "allow": allow_rules,
            "block": block_rules,
            "active": active_rules,
            "inactive": inactive_rules
        },
        "activities": {
            "total": total_activities,
            "allowed": allowed_activities,
            "blocked": blocked_activities
        }
    }