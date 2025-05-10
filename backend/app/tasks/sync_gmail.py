import asyncio
import logging
from datetime import datetime
from ..db import db
from ..integrations.gmail_service import GmailService
from bson.objectid import ObjectId

logger = logging.getLogger(__name__)

async def sync_gmail_share_requests():
    """Sync Google Drive share requests from Gmail"""
    try:
        # Get Gmail service
        gmail_service = GmailService.get_instance()
        
        # Get share requests from Gmail
        gmail_requests = gmail_service.get_drive_share_requests()
        logger.info(f"Found {len(gmail_requests)} share requests in Gmail")
        
        # Process each request
        created_count = 0
        for req in gmail_requests:
            # Extract data
            folder_name = req.get('folder_name')
            requester = req.get('requester')
            message_id = req.get('message_id')
            date = req.get('date')
            
            # Skip if essential data is missing
            if not folder_name or not requester:
                logger.warning(f"Skipping request with missing data: {req}")
                continue
                
            # Try to find the folder in our mappings
            folder = await db.db.folder_mappings.find_one({"name": folder_name})
            
            # If not found by exact name, try case-insensitive search
            if not folder:
                cursor = db.db.folder_mappings.find({})
                async for f in cursor:
                    if f["name"].lower() == folder_name.lower():
                        folder = f
                        break
            
            folder_id = folder.get('folder_id') if folder else None
            
            # If folder not found, create a placeholder
            if not folder_id:
                logger.info(f"Creating placeholder for folder: {folder_name}")
                folder_id = f"placeholder_{folder_name.lower().replace(' ', '_')}"
                
                # Create a placeholder mapping
                await db.db.folder_mappings.insert_one({
                    "folder_id": folder_id,
                    "name": folder_name,
                    "sensitivity": "confidential",  # Default sensitivity
                    "is_placeholder": True,
                    "created_at": datetime.utcnow()
                })
                logger.info(f"Created placeholder mapping for folder: {folder_name}")
            
            # Check if request already exists
            existing_request = await db.db.drive_access_requests.find_one({
                "$or": [
                    {"folder_id": folder_id, "user_email": requester, "status": "pending"},
                    {"external_id": message_id}
                ]
            })
            
            if existing_request:
                logger.info(f"Request already exists for folder '{folder_name}' from '{requester}'")
                continue
            
            # Create new request
            request_data = {
                "user_id": None,  # Will be filled if user exists
                "user_email": requester,
                "folder_id": folder_id,
                "folder_name": folder_name,
                "request_time": datetime.utcnow(),
                "status": "pending",
                "source": "gmail",
                "external_id": message_id,
                "decision_time": None,
                "decision_by": None,
                "reason": None
            }
            
            # Try to find user by email
            user = await db.db.users.find_one({"email": requester})
            if user:
                request_data["user_id"] = str(user["_id"])
            
            # Make sure the drive_access_requests collection exists
            collections = await db.db.list_collection_names()
            if 'drive_access_requests' not in collections:
                await db.db.create_collection('drive_access_requests')
            
            result = await db.db.drive_access_requests.insert_one(request_data)
            created_count += 1
            logger.info(f"Created new access request from Gmail: {str(result.inserted_id)}")
        
        logger.info(f"Successfully synced {len(gmail_requests)} Gmail requests, created {created_count} new requests")
        return {
            "status": "success",
            "total_found": len(gmail_requests),
            "new_created": created_count
        }
    except Exception as e:
        logger.error(f"Error syncing Gmail share requests: {str(e)}")
        return {
            "status": "error",
            "message": str(e)
        }