# test_approve_request.py
import asyncio
import os
from google.oauth2 import service_account
from googleapiclient.discovery import build
import logging
import json
from datetime import datetime
from bson.objectid import ObjectId

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MongoDB connection (adjust as needed)
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure

# Modify with your MongoDB URL
MONGODB_URL = "mongodb+srv://zt_admin:ZZteeGtWYMVPKNaq@cluster0.f2qts.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
DB_NAME = "zero_trust_db"

# Service account configuration
CREDENTIALS_FILE = 'credentials/google-drive-credentials.json'
SCOPES = ['https://www.googleapis.com/auth/drive']

# Test request ID (replace with an actual pending request ID from your database)
TEST_REQUEST_ID = "681f958a0f47483762a13814"

async def test_approve_request():
    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    try:
        # Get the request from the database
        request = await db.drive_access_requests.find_one({"_id": ObjectId(TEST_REQUEST_ID)})
        if not request:
            logger.error(f"Request {TEST_REQUEST_ID} not found")
            return
        
        logger.info(f"Found request: {json.dumps(request, default=str)}")
        
        # Authenticate with Google Drive
        credentials = service_account.Credentials.from_service_account_file(
            CREDENTIALS_FILE, scopes=SCOPES)
        
        service = build('drive', 'v3', credentials=credentials)
        
        logger.info(f"Authenticated as: {credentials.service_account_email}")
        
        # Extract request details
        folder_id = request.get("folder_id")
        user_email = request.get("user_email")
        
        logger.info(f"Granting access to folder {folder_id} for user {user_email}")
        
        # Create permission
        user_permission = {
            'type': 'user',
            'role': 'reader',
            'emailAddress': user_email
        }
        
        result = service.permissions().create(
            fileId=folder_id,
            body=user_permission,
            fields='id,emailAddress,role',
            sendNotificationEmail=True
        ).execute()
        
        logger.info(f"Permission created: {result}")
        
        # Update the request in the database
        now = datetime.utcnow()
        update_result = await db.drive_access_requests.update_one(
            {"_id": ObjectId(TEST_REQUEST_ID)},
            {"$set": {
                "status": "approved",
                "decision_time": now,
                "decision_by": "test_script",
                "decision_by_email": "test_script@example.com",
                "reason": "Test approval"
            }}
        )
        
        logger.info(f"Database update result: {update_result.modified_count}")
        
        logger.info("Test completed successfully!")
    except Exception as e:
        logger.error(f"Test failed: {str(e)}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(test_approve_request())