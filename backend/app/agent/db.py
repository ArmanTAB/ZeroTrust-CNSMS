from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure
from bson import ObjectId
from datetime import datetime
import logging
import bcrypt
from app.db import db
from app.config import settings
from pymongo import ReturnDocument
from typing import List, Optional, Dict, Any
logger = logging.getLogger(__name__)

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
        return_document=True
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

async def get_rules_for_user(user_id: str) -> list:
    """Get all rules that apply to a specific user"""
    # Get user details first to determine role and department
    user = await db.db.agent_users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return []
    
    # Find all active rules
    all_active_rules = await get_all_agent_rules({"isActive": True})
    
    # Filter rules applicable to user
    rules = []
    
    # Get rules for user, department, or role
    pipeline = [
        {"$match": {
            "$or": [
                {"appliesTo.users": {"$in": [ObjectId(user_id)]}},
                {"appliesTo.departments": {"$in": [user.get("department", ""), "ALL", "Any", "*"]}},
                {"appliesTo.roles": {"$in": [user.get("role", ""), "ALL", "Any", "*"]}}
            ],
            "isActive": True
        }},
        {"$sort": {"priority": -1}}
    ]
    
    rules = []
    async for rule in db.db.agent_rules.aggregate(pipeline):
        rule_dict = agent_rule_helper(rule)
        # Mark if rule directly applies to user
        if "appliesTo" in rule and "users" in rule["appliesTo"] and any(
            str(user_ref) == user_id or (hasattr(user_ref, '_id') and str(user_ref._id) == user_id)
            for user_ref in rule["appliesTo"]["users"]
        ):
            rule_dict["__userSpecific"] = True
        
        rules.append(rule_dict)
    
    return rules

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

# Complete Solution for Agent Logging Issues
async def log_agent_activity_batch(activities: list) -> dict:
    """Log multiple agent activities in a batch with improved field mapping and user email lookup"""
    if not activities:
        return {"success": False, "count": 0, "error": "No activities provided"}
    
    # Process each activity with detailed logging
    processed_activities = []
    skipped_activities = []
    
    for activity in activities:
        try:
            # Start with a new record for each activity
            processed_activity = {}
            
            # Process user ID (essential field)
            # Accept either userId or user_id to be flexible
            if "userId" in activity:
                user_id_value = activity["userId"]
                processed_activity["user_id"] = user_id_value
            elif "user_id" in activity:
                user_id_value = activity["user_id"]
                processed_activity["user_id"] = user_id_value
            else:
                # Skip activities without user ID
                skipped_activities.append(f"Missing user_id: {activity}")
                continue
            
            # Try to convert user_id to ObjectId if it's a string
            user_obj_id = None
            if isinstance(processed_activity["user_id"], str):
                try:
                    from bson.objectid import ObjectId
                    user_obj_id = ObjectId(processed_activity["user_id"])
                    processed_activity["user_id"] = user_obj_id
                except:
                    # If conversion fails, keep as string
                    user_obj_id = processed_activity["user_id"]
            else:
                user_obj_id = processed_activity["user_id"]
                
            # Look up user email from agent_users collection
            user_email = None
            if user_obj_id:
                try:
                    # Try to find user by ID
                    user_record = await db.db.agent_users.find_one({"_id": user_obj_id})
                    if user_record and "email" in user_record:
                        user_email = user_record["email"]
                        # Add email to processed activity
                        processed_activity["user_email"] = user_email
                except Exception as user_lookup_err:
                    logger.warning(f"Error looking up user email: {str(user_lookup_err)}")
            
            # Add timestamp if not provided
            if "timestamp" not in activity:
                processed_activity["timestamp"] = datetime.now()
            else:
                processed_activity["timestamp"] = activity["timestamp"]
                
            # Process type field - required for identifying agent logs
            if "type" in activity:
                processed_activity["type"] = activity["type"]
            else:
                processed_activity["type"] = "unknown"
                
            # Process resource field - what was accessed
            if "resource" in activity:
                processed_activity["resource"] = activity["resource"]
            else:
                processed_activity["resource"] = "unknown"
                
            # Process action field (block/allow)
            if "action" in activity:
                processed_activity["action"] = activity["action"]
                # Calculate blocked field based on action
                processed_activity["blocked"] = (activity["action"].lower() == "block")
            elif "blocked" in activity:
                processed_activity["blocked"] = bool(activity["blocked"])
                processed_activity["action"] = "block" if activity["blocked"] else "allow"
            else:
                processed_activity["action"] = "unknown"
                processed_activity["blocked"] = False
                
            # Copy other fields that might be useful
            for field in ["description", "ruleName", "deviceId", "ip_address"]:
                if field in activity:
                    processed_activity[field] = activity[field]
                    
            # Include a marker to identify these as agent logs
            processed_activity["source"] = "agent"
            
            processed_activities.append(processed_activity)
        except Exception as e:
            import traceback
            logger.error(f"Error processing activity: {str(e)}")
            logger.error(traceback.format_exc())
            logger.error(f"Problematic activity data: {activity}")
            skipped_activities.append(f"Error: {str(e)}, Activity: {activity}")
    
    # Skip batch if no valid activities
    if not processed_activities:
        return {
            "success": False, 
            "count": 0, 
            "error": f"No valid activities to log. Skipped: {len(skipped_activities)}"
        }
    
    try:
        # Insert activities into the access_logs collection
        result = await db.db.access_logs.insert_many(processed_activities)
        
        # Log details about the insertion
        logger.info(f"Successfully logged {len(result.inserted_ids)} agent activities")
        
        if skipped_activities:
            logger.warning(f"Skipped {len(skipped_activities)} invalid activities")
            logger.debug(f"Skipped activities details: {skipped_activities}")
        
        return {
            "success": True, 
            "count": len(result.inserted_ids),
            "skipped": len(skipped_activities)
        }
    except Exception as e:
        import traceback
        logger.error(f"Database error logging activities: {str(e)}")
        logger.error(traceback.format_exc())
        return {"success": False, "count": 0, "error": str(e)}

async def get_agent_activities(filters: dict = None, limit: int = 50) -> List[dict]:
    """Get agent activities with optional filtering - Updated to use access_logs"""
    # Add source filter to only get agent logs
    if filters is None:
        filters = {}
    
    filters["source"] = "agent"
    filters["type"] = {"$exists": True}
    
    # Use the new function that queries the correct collection
    return await get_agent_activities_from_access_logs(filters, 0, limit)

async def register_agent_device(device_data: dict) -> dict:
    """Register an agent device"""
    # Convert userId to ObjectId if it's a string
    if "userId" in device_data and isinstance(device_data["userId"], str):
        try:
            device_data["user"] = ObjectId(device_data["userId"])
            # Remove userId field as we use 'user' in the schema
            del device_data["userId"]
        except:
            pass
            
    # Check if device already exists
    existing = None
    if "deviceId" in device_data:
        existing = await db.db.devices.find_one({"deviceId": device_data["deviceId"]})
    
    if existing:
        # Update existing device
        update_data = {
            "lastConnected": datetime.now(),
            "ipAddress": device_data.get("ipAddress", existing.get("ipAddress")),
            "macAddress": device_data.get("macAddress", existing.get("macAddress")),
            "osType": device_data.get("osType", existing.get("osType")),
            "osVersion": device_data.get("osVersion", existing.get("osVersion")),
        }
        
        updated = await db.db.devices.update_one(
            {"_id": existing["_id"]},
            {"$set": update_data}
        )
        
        if updated.modified_count:
            existing = await db.db.devices.find_one({"_id": existing["_id"]})
            return {"success": True, "deviceId": str(existing["_id"])}
        else:
            return {"success": False, "error": "Failed to update device"}
    else:
        # Add registration timestamp
        device_data["registeredAt"] = datetime.now()
        device_data["lastConnected"] = datetime.now()
        
        result = await db.db.devices.insert_one(device_data)
        return {"success": True, "deviceId": str(result.inserted_id)}

async def get_agent_statistics() -> dict:
    """Get agent statistics"""
    try:
        # User statistics - use db.db instead of just db
        total_users = await db.db.agent_users.count_documents({})
        active_users = await db.db.agent_users.count_documents({"isActive": True})
        inactive_users = await db.db.agent_users.count_documents({"isActive": False})
        
        # Rule statistics
        total_rules = await db.db.agent_rules.count_documents({})
        allow_rules = await db.db.agent_rules.count_documents({"type": "allow"})
        block_rules = await db.db.agent_rules.count_documents({"type": "block"})
        active_rules = await db.db.agent_rules.count_documents({"isActive": True})
        inactive_rules = await db.db.agent_rules.count_documents({"isActive": False})
        
        # Activity statistics - query access_logs where agent logs are stored
        total_activities = await db.db.access_logs.count_documents({"source": "agent"})
        allowed_activities = await db.db.access_logs.count_documents({"source": "agent", "action": {"$ne": "block"}})
        blocked_activities = await db.db.access_logs.count_documents({"source": "agent", "action": "block"})
        
        logger.info(f"Statistics: Users: {total_users}, Rules: {total_rules}, Activities: {total_activities}")
        
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
    except Exception as e:
        logger.error(f"Error getting agent statistics: {str(e)}")
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
    
async def get_agent_activities_from_access_logs(filters: dict = None, skip: int = 0, limit: int = 50) -> List[dict]:
    """Get agent activities from access_logs collection where they are actually stored"""
    query = filters or {}
    activities = []
    
    try:
        logger.info(f"Querying access_logs with filters: {query}, skip: {skip}, limit: {limit}")
        
        # Query the access_logs collection where agent logs are stored
        cursor = db.db.access_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        
        async for activity in cursor:
            if activity:
                # Convert ObjectId to string for user_id
                user_id_value = activity.get("user_id")
                if isinstance(user_id_value, ObjectId):
                    user_id_str = str(user_id_value)
                else:
                    user_id_str = user_id_value
                
                # Convert the document to match expected format
                activity_dict = {
                    "id": str(activity["_id"]),
                    "user_id": user_id_str,  # Ensure it's a string
                    "device_id": activity.get("device_id"),
                    "timestamp": activity.get("timestamp"),
                    "type": activity.get("type"),
                    "resource": activity.get("resource"),
                    "action": activity.get("action"),
                    "blocked": activity.get("action") == "block",
                    "ruleName": activity.get("ruleName"),
                    "description": activity.get("description"),
                    "user_email": activity.get("user_email"),  # Include user email if available
                }
                
                activities.append(activity_dict)
                
        logger.info(f"Found {len(activities)} agent activities")
                
    except Exception as e:
        logger.error(f"Error fetching agent activities from access_logs: {str(e)}")
    
    return activities