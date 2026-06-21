from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from typing import List, Annotated, Optional
from datetime import datetime, timedelta
from ..auth.routes import get_current_user
from ..auth.models import User
from .models import AccessLogCreate, AccessLog, AccessDecision
from .utils import (
    evaluate_access_request, log_access_attempt, 
    get_access_logs, get_access_statistics,
    create_drive_access_request, get_drive_access_requests,
    update_drive_access_request
)
import logging
from ..common.alerts import get_recent_alerts, generate_sample_alerts
from ..db import db
from bson import ObjectId

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/access", tags=["access"])

@router.post("/request", response_model=AccessDecision)
async def request_access(access_data: AccessLogCreate):
    """
    Request access to a resource.
    This endpoint evaluates the access request but does not log it.
    """
    # Set timestamp if not provided
    if not access_data.timestamp:
        access_data.timestamp = datetime.utcnow()
    
    # Evaluate request using Zero Trust principles
    decision = await evaluate_access_request(access_data)
    
    return decision

@router.post("/log", response_model=dict)
async def log_access(access_data: AccessLogCreate):
    """
    Log an access attempt and return the decision.
    This endpoint evaluates the access request and logs it.
    """
    # Set timestamp if not provided
    if not access_data.timestamp:
        access_data.timestamp = datetime.utcnow()
    
    # Evaluate request
    decision = await evaluate_access_request(access_data)
    
    # Log the access attempt
    log = await log_access_attempt(access_data, decision)
    
    return {
        "access_granted": decision.access_granted,
        "reason": decision.reason,
        "risk_level": decision.risk_level,
        "log_id": log["_id"]
    }

@router.get("/logs", response_model=List[AccessLog])
async def get_access_log_entries(
    current_user: Annotated[User, Depends(get_current_user)],
    device_id: Optional[str] = None,
    user_id: Optional[str] = None,
    resource: Optional[str] = None,
    access_granted: Optional[bool] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    log_type: Optional[str] = None,  # New parameter for filtering by log type
    skip: int = 0,
    limit: int = 100
):
    """Get access logs with optional filtering"""
    
    # Build query for regular access logs
    query = {}
    
    if device_id:
        query["device_id"] = device_id
    
    if user_id:
        query["user_id"] = user_id
    
    if resource:
        query["resource"] = {"$regex": resource, "$options": "i"}  # Case-insensitive search
    
    if access_granted is not None:
        query["access_granted"] = access_granted
    
    # Time range filter
    if start_time or end_time:
        time_query = {}
        if start_time:
            time_query["$gte"] = start_time
        if end_time:
            time_query["$lte"] = end_time
        query["timestamp"] = time_query
    
    # Specific for agent logs
    agent_query = {}
    
    # Apply common filters to agent query
    if resource:
        agent_query["resource"] = {"$regex": resource, "$options": "i"}
    
    if start_time or end_time:
        agent_query["timestamp"] = query.get("timestamp", {}).copy()
    
    # Special user_id handling for agent logs (agent logs use ObjectId for userId)
    if user_id:
        try:
            agent_query["userId"] = ObjectId(user_id)
        except:
            agent_query["userId"] = user_id
    
    # Device ID for agent logs
    if device_id:
        agent_query["deviceId"] = device_id
    
    # Access granted filter for agent logs is based on "action" field
    if access_granted is not None:
        if access_granted:
            agent_query["action"] = {"$ne": "block"}  # Not blocked = allowed
        else:
            agent_query["action"] = "block"  # Blocked = denied
    
    logs = []
    
    # Determine which type of logs to fetch based on log_type parameter
    if log_type == "agent":
        # Only fetch agent logs
        agent_logs = await fetch_agent_logs(agent_query, skip, limit)
        logs = agent_logs
    elif log_type == "access":
        # Only fetch regular access logs
        access_logs = await fetch_regular_logs(query, skip, limit)
        logs = access_logs
    else:
        # Fetch both types, respecting pagination
        access_logs = await fetch_regular_logs(query, 0, limit)
        agent_logs = await fetch_agent_logs(agent_query, 0, limit)
        
        # Combine and sort by timestamp
        combined_logs = access_logs + agent_logs
        combined_logs.sort(key=lambda x: x.get("timestamp", datetime.min), reverse=True)
        
        # Apply pagination to combined results
        logs = combined_logs[skip:skip + limit]
    
    return logs

async def fetch_regular_logs(query, skip, limit):
    logs = []
    cursor = db.db.access_logs.find({
        **query,
        # Ensure we only get standard access logs (with device_id field)
        "device_id": {"$exists": True}
    }).sort("timestamp", -1).skip(skip).limit(limit)
    
    async for log in cursor:
        # Convert _id to id for consistent API
        log["id"] = str(log["_id"])
        log.pop("_id", None)
        log["log_type"] = "access"  # Add log_type field
        logs.append(log)
    
    return logs

async def fetch_agent_logs(query, skip, limit):
    logs = []
    cursor = db.db.access_logs.find({
        **query,
        # Ensure we only get agent logs (with type field)
        "type": {"$exists": True}
    }).sort("timestamp", -1).skip(skip).limit(limit)
    
    async for log in cursor:
        # Standardize the structure to match AccessLog model
        standardized_log = {
            "id": str(log["_id"]),
            "device_id": log.get("device_id") or log.get("deviceId", "unknown_device"),
            "user_id": str(log["user_id"]) if log.get("user_id") else 
                      (str(log["userId"]) if log.get("userId") else None),
            "ip_address": log.get("ip_address", "N/A"),
            "user_agent": log.get("user_agent", "Agent Software"),
            "resource": log["resource"],
            "timestamp": log["timestamp"],
            "access_type": "agent",  # Use static value to avoid validation errors
            "context": {
                "agent_type": log.get("type"),
                "rule_name": log.get("ruleName")
            },
            "access_granted": log.get("action") != "block",  # Convert action to access_granted
            "reason": log.get("description", ""),  # Ensure reason is not None
            "risk_level": 0,  # Default risk level
            "decision_factors": [],
            "log_type": "agent"  # Add log_type field
        }
        logs.append(standardized_log)
    
    return logs

async def fetch_regular_logs(query, skip, limit):
    logs = []
    cursor = db.db.access_logs.find({
        **query,
        # Ensure we only get standard access logs (with device_id field)
        "device_id": {"$exists": True}
    }).sort("timestamp", -1).skip(skip).limit(limit)
    
    async for log in cursor:
        # Convert _id to id for consistent API
        log["id"] = str(log["_id"])
        log.pop("_id", None)
        log["log_type"] = "access"  # Add log_type field
        logs.append(log)
    
    return logs

# Modify the fetch_agent_logs function in backend/app/access/routes.py to include user email lookup

async def fetch_agent_logs(query, skip, limit):
    """Fetch agent logs with email lookup for users"""
    logs = []
    cursor = db.db.access_logs.find({
        **query,
        # Ensure we only get agent logs (with type field)
        "type": {"$exists": True}
    }).sort("timestamp", -1).skip(skip).limit(limit)
    
    # Gather all unique user IDs for batch lookup
    user_ids = set()
    temp_logs = []
    
    async for log in cursor:
        temp_logs.append(log)
        
        # Extract user ID (handling different possible formats)
        user_id = None
        if "userId" in log and log["userId"]:
            user_id = log["userId"]
        elif "user_id" in log and log["user_id"]:
            user_id = log["user_id"]
            
        if user_id:
            # Convert to string if it's an ObjectId
            if isinstance(user_id, ObjectId):
                user_id = str(user_id)
            # Add to set of IDs to look up
            user_ids.add(user_id)
    
    # Look up all user emails in a single batch query
    user_email_map = {}
    if user_ids:
        try:
            # Convert string IDs back to ObjectId for querying
            object_ids = []
            for user_id in user_ids:
                try:
                    object_ids.append(ObjectId(user_id))
                except:
                    # Skip IDs that can't be converted
                    pass
                    
            if object_ids:
                # Fetch users in a single query
                users_cursor = db.db.agent_users.find({"_id": {"$in": object_ids}})
                
                async for user in users_cursor:
                    if "email" in user:
                        user_email_map[str(user["_id"])] = user["email"]
                        
            logger.debug(f"Found {len(user_email_map)} user emails for logs")
        except Exception as e:
            logger.error(f"Error fetching user emails: {e}")
    
    # Process all logs with the user info we retrieved
    for log in temp_logs:
        # Standardize the structure to match AccessLog model
        standardized_log = {
            "id": str(log["_id"]),
            "device_id": log.get("device_id") or log.get("deviceId", "unknown_device"),
            "user_id": str(log["user_id"]) if log.get("user_id") else 
                      (str(log["userId"]) if log.get("userId") else None),
            "ip_address": log.get("ip_address", "N/A"),
            "user_agent": log.get("user_agent", "Agent Software"),
            "resource": log["resource"],
            "timestamp": log["timestamp"],
            "access_type": "agent",  # Use static value to avoid validation errors
            "context": {
                "agent_type": log.get("type"),
                "rule_name": log.get("ruleName")
            },
            "access_granted": log.get("action") != "block",  # Convert action to access_granted
            "reason": log.get("description", ""),  # Ensure reason is not None
            "risk_level": 0,  # Default risk level
            "decision_factors": [],
            "log_type": "agent"  # Add log_type field
        }
        
        # Add user email if already in the log
        if "user_email" in log:
            standardized_log["user_email"] = log["user_email"]
        # Or look it up from our batch query results
        elif standardized_log["user_id"] in user_email_map:
            standardized_log["user_email"] = user_email_map[standardized_log["user_id"]]
            
        logs.append(standardized_log)
    
    return logs

async def fetch_regular_logs(query, skip, limit):
    """Fetch regular access logs with email lookup for users"""
    logs = []
    cursor = db.db.access_logs.find({
        **query,
        # Ensure we only get standard access logs (with device_id field)
        "device_id": {"$exists": True}
    }).sort("timestamp", -1).skip(skip).limit(limit)
    
    # Gather all unique user IDs for batch lookup
    user_ids = set()
    temp_logs = []
    
    async for log in cursor:
        temp_logs.append(log)
        
        if "user_id" in log and log["user_id"]:
            user_id = log["user_id"]
            # Convert to string if it's an ObjectId
            if isinstance(user_id, ObjectId):
                user_id = str(user_id)
            # Add to set of IDs to look up
            user_ids.add(user_id)
    
    # Look up all user emails in a single batch query
    user_email_map = {}
    if user_ids:
        try:
            # Convert string IDs back to ObjectId for querying
            object_ids = []
            for user_id in user_ids:
                try:
                    object_ids.append(ObjectId(user_id))
                except:
                    # Skip IDs that can't be converted
                    pass
                    
            if object_ids:
                # Try to find emails in both users and agent_users collections
                for collection_name in ["users", "agent_users"]:
                    users_cursor = db.db[collection_name].find({"_id": {"$in": object_ids}})
                    
                    async for user in users_cursor:
                        if "email" in user:
                            user_email_map[str(user["_id"])] = user["email"]
                        
            logger.debug(f"Found {len(user_email_map)} user emails for logs")
        except Exception as e:
            logger.error(f"Error fetching user emails: {e}")
    
    # Process all logs with the user info we retrieved
    for log in temp_logs:
        # Convert _id to id for consistent API
        log_dict = {
            "id": str(log["_id"]),
            "log_type": "access",  # Add log_type field
        }
        
        # Copy all fields except _id
        for key, value in log.items():
            if key != "_id":
                log_dict[key] = value
        
        # Add user email if already in the log
        if "user_email" in log:
            log_dict["user_email"] = log["user_email"]
        # Or look it up from our batch query results
        elif "user_id" in log_dict and log_dict["user_id"]:
            user_id_str = str(log_dict["user_id"])
            if user_id_str in user_email_map:
                log_dict["user_email"] = user_email_map[user_id_str]
            
        logs.append(log_dict)
    
    return logs

@router.get("/statistics", response_model=dict)
async def get_access_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    days: int = 7
):
    """Get statistics about access attempts"""
    start_time = datetime.utcnow() - timedelta(days=days)
    end_time = datetime.utcnow()
    
    stats = await get_access_statistics(start_time, end_time)
    
    return stats

@router.get("/activity", response_model=list)
async def get_access_activity(
    current_user: Annotated[User, Depends(get_current_user)],
    days: int = 7
):
    """Get access activity stats by day of week for the last N days"""
    # Calculate the start date for the period
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    # Create a dictionary to store activity data by day
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    activity_data = {day: {"allowed": 0, "denied": 0} for day in day_names}
    
    # 1. Get regular access logs
    logs = await get_access_logs(
        start_time=start_date,
        end_time=end_date,
        skip=0,
        limit=1000  # Increased limit to ensure we get all logs
    )
    
    # Process regular access logs
    for log in logs:
        # Convert timestamp to datetime if it's a string
        timestamp = log["timestamp"]
        if isinstance(timestamp, str):
            try:
                log_date = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                try:
                    log_date = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S.%f")
                except ValueError:
                    try:
                        log_date = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%S")
                    except ValueError:
                        continue
        else:
            log_date = timestamp
        
        # Skip if outside the date range
        if log_date < start_date or log_date > end_date:
            continue
            
        # Get day of week (0 = Monday, 6 = Sunday)
        day_index = log_date.weekday()
        day_of_week = day_names[day_index]
        
        # Update statistics
        if log.get("access_granted", False):
            activity_data[day_of_week]["allowed"] += 1
        else:
            activity_data[day_of_week]["denied"] += 1
    
    # 2. Now also get Google Drive access requests
    try:
        drive_requests_cursor = db.db.drive_access_requests.find({
            "request_time": {"$gte": start_date, "$lte": end_date}
        })
        
        async for req in drive_requests_cursor:
            # Get timestamp
            request_time = req.get("request_time")
            if not request_time:
                continue
                
            # Get day of week
            day_index = request_time.weekday()
            day_of_week = day_names[day_index]
            
            # Update statistics based on status
            if req.get("status") == "approved":
                activity_data[day_of_week]["allowed"] += 1
            elif req.get("status") in ["rejected", "pending"]:
                # Count pending as denied for visualization purposes
                activity_data[day_of_week]["denied"] += 1
    except Exception as e:
        logger.error(f"Error processing drive access requests: {str(e)}")
    
    # Convert dictionary to list format for frontend
    result = [
        {"day": day, "allowed": activity_data[day]["allowed"], "denied": activity_data[day]["denied"]}
        for day in day_names
    ]
    
    return result

@router.get("/alerts", response_model=List[dict])
async def get_security_alerts(
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = 5,
    resolved: bool = False
):
    """Get recent security alerts"""
    # Generate sample alerts if none exist
    await generate_sample_alerts()
    
    alerts = await get_recent_alerts(limit, resolved)
    return alerts

# Google Drive access endpoints

@router.post("/google-drive", response_model=AccessDecision)
async def request_google_drive_access(
    access_data: AccessLogCreate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """
    Request access to Google Drive folder.
    This evaluates the request based on Zero Trust principles and 
    also creates a pending access request for admin approval.
    """
    from bson.objectid import ObjectId
    
    logger.info(f"Processing new Google Drive access request from {current_user.email}")
    
    # Set timestamp if not provided
    if not access_data.timestamp:
        access_data.timestamp = datetime.utcnow()
    
    # Extract folder ID from resource
    # Assuming resource is in format "google-drive:folder:{folder_id}"
    parts = access_data.resource.split(":")
    if len(parts) != 3 or parts[0] != "google-drive" or parts[1] != "folder":
        logger.error(f"Invalid resource format: {access_data.resource}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid resource format for Google Drive access"
        )
    
    folder_id = parts[2]
    logger.info(f"Request for folder ID: {folder_id}")
    
    # Get folder name from the database
    folder = await db.db.folder_mappings.find_one({"folder_id": folder_id})
    folder_name = folder["name"] if folder else "Unknown Folder"
    logger.info(f"Folder name: {folder_name}, Found in DB: {folder is not None}")
    
    # Evaluate request using Zero Trust principles
    decision = await evaluate_access_request(access_data)
    
    # Ensure the drive_access_requests collection exists
    collections = await db.db.list_collection_names()
    if 'drive_access_requests' not in collections:
        logger.info("Creating drive_access_requests collection as it doesn't exist")
        await db.db.create_collection('drive_access_requests')
    
    # Create an access request record regardless of the decision
    try:
        # Directly create the request document without using helper function
        request_data = {
            "user_id": str(current_user.id),
            "user_email": current_user.email,
            "folder_id": folder_id,
            "folder_name": folder_name,
            "device_id": access_data.device_id,
            "device_ip": access_data.ip_address,
            "request_time": datetime.utcnow(),
            "status": "pending",
            "decision_time": None,
            "decision_by": None,
            "reason": None
        }
        
        # First check if a request already exists
        existing_request = await db.db.drive_access_requests.find_one({
            "user_id": str(current_user.id),
            "folder_id": folder_id,
            "status": "pending"
        })
        
        if existing_request:
            logger.info(f"Found existing request: {existing_request['_id']}")
            request_id = str(existing_request["_id"])
        else:
            # Insert the new request
            result = await db.db.drive_access_requests.insert_one(request_data)
            request_id = str(result.inserted_id)
            logger.info(f"Created new access request with ID: {request_id}")
            
            # Verify the request was saved
            check = await db.db.drive_access_requests.find_one({"_id": result.inserted_id})
            if check:
                logger.info(f"Successfully verified request exists with ID: {request_id}")
            else:
                logger.error(f"Failed to verify request after creation: {request_id}")
    except Exception as e:
        logger.error(f"Error creating access request: {str(e)}")
        # Log the full error traceback
        import traceback
        logger.error(traceback.format_exc())
    
    # Adjust the decision - we'll always return "pending" initially
    decision.access_granted = False
    decision.reason = "Access request has been submitted and is pending approval."
    decision.context["folder_id"] = folder_id
    decision.context["request_status"] = "pending"
    
    # Log the access attempt
    log = await log_access_attempt(access_data, decision)
    
    return decision

@router.get("/google-drive/folders", response_model=List[dict])
async def list_google_drive_folders(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """List available Google Drive folders for the current user"""
    try:
        # For now, just get the folder mappings from the database
        # Later we'll integrate with the actual Google Drive API
        cursor = db.db.folder_mappings.find({})
        folders = []
        
        async for folder in cursor:
            folders.append({
                "id": folder["folder_id"],
                "name": folder["name"],
                "sensitivity": folder["sensitivity"]
            })
        
        return folders
    except Exception as e:
        logger.error(f"Error listing Google Drive folders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing Google Drive folders: {str(e)}"
        )
        
# Замените функцию list_drive_access_requests в backend/app/access/routes.py

@router.get("/google-drive/requests", response_model=List[dict])
async def list_drive_access_requests(
    current_user: Annotated[User, Depends(get_current_user)],
    status: Optional[str] = None,
    folder_id: Optional[str] = None
):
    """List Google Drive access requests"""
    # Build query
    query = {}
    if status:
        query["status"] = status
    if folder_id:
        query["folder_id"] = folder_id
    
    # For non-admins, only show their own requests
    if current_user.role not in ["admin", "security_analyst"]:
        query["user_id"] = str(current_user.id)
    
    # Get requests directly from database
    requests = []
    try:
        cursor = db.db.drive_access_requests.find(query).sort("request_time", -1)
        
        async for request in cursor:
            request["id"] = str(request["_id"])
            request.pop("_id", None)
            requests.append(request)
    except Exception as e:
        logger.error(f"Error retrieving access requests: {str(e)}")
    
    logger.info(f"Found {len(requests)} requests matching query {query}")
    return requests

@router.post("/google-drive/requests/{request_id}/approve")
async def approve_drive_access(
    request_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    reason: Optional[dict] = Body(None)
):
    """Approve a Google Drive access request"""
    # Check if user has admin privileges
    if current_user.role not in ["admin", "security_analyst"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to approve access requests"
        )
    
    # Extract reason string if provided
    reason_text = reason.get("reason") if reason else None
    
    # Update the request status
    updated_request = await update_drive_access_request(
        request_id=request_id,
        status="approved",
        decision_by=str(current_user.id),
        reason=reason_text
    )
    
    if not updated_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access request not found"
        )
    
    # Grant actual access in Google Drive (implement this part with the Google Drive API)
    try:
        # This would be where you call the Google Drive API to share the folder
        # with the user's email
        pass
    except Exception as e:
        logger.error(f"Error granting Google Drive access: {str(e)}")
        # We'll still return success since the request was approved
    
    return {
        "status": "success",
        "message": f"Access request approved for {updated_request['user_email']}",
        "request": updated_request
    }

@router.post("/google-drive/requests/{request_id}/reject")
async def reject_drive_access(
    request_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    reason: Optional[dict] = Body(None)
):
    """Reject a Google Drive access request"""
    # Check if user has admin privileges
    if current_user.role not in ["admin", "security_analyst"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to reject access requests"
        )
    
    # Extract reason string if provided
    reason_text = reason.get("reason") if reason else None
    
    # Update the request status
    updated_request = await update_drive_access_request(
        request_id=request_id,
        status="rejected",
        decision_by=str(current_user.id),
        reason=reason_text
    )
    
    if not updated_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access request not found"
        )
    
    return {
        "status": "success",
        "message": f"Access request rejected for {updated_request['user_email']}",
        "request": updated_request
    }
    
@router.get("/agent-logs", response_model=List[dict])
async def get_agent_logs(
    current_user: Annotated[User, Depends(get_current_user)],
    resource: Optional[str] = None,
    action: Optional[str] = None,
    type: Optional[str] = None,
    user_id: Optional[str] = None,
    device_id: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100
):
    """Get agent logs with optional filtering"""
    # Build filter query
    query = {}
    
    # Ensure we only get agent logs by checking for the existence of the 'type' field
    query["type"] = {"$exists": True}
    
    if type:
        query["type"] = type
    
    if device_id:
        query["deviceId"] = device_id
    
    if user_id:
        try:
            query["userId"] = ObjectId(user_id)
        except:
            query["userId"] = user_id
    
    if resource:
        query["resource"] = {"$regex": resource, "$options": "i"}
    
    if action:
        query["action"] = action
    
    # Add time range filter
    if start_time or end_time:
        time_query = {}
        if start_time:
            time_query["$gte"] = start_time
        if end_time:
            time_query["$lte"] = end_time
        query["timestamp"] = time_query
    
    # Add more logging for debugging
    logger.info(f"Agent logs query: {query}")
    
    logs = []
    try:
        cursor = db.db.access_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        
        async for log in cursor:
            log_dict = {
                "id": str(log["_id"]),
                "type": log.get("type", "unknown"),
                "resource": log.get("resource", ""),
                "action": log.get("action", "unknown"),
                "description": log.get("description", ""),
                "ruleName": log.get("ruleName"),
                "timestamp": log.get("timestamp", datetime.utcnow()),
                "userId": str(log["userId"]) if log.get("userId") else None,
                "deviceId": log.get("deviceId"),
                # Additional fields for client compatibility
                "log_type": "agent"
            }
            logs.append(log_dict)
            
        logger.info(f"Found {len(logs)} agent logs")
        
    except Exception as e:
        logger.error(f"Error fetching agent logs: {str(e)}")
        # Return empty list if there's an error
        return []
    
    return logs