# backend/scripts/check_drive_access_requests.py
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from datetime import datetime
from bson.objectid import ObjectId

# Load environment variables
load_dotenv()

# Get MongoDB URI from environment variables
MONGODB_URL = os.getenv("MONGODB_URL")
DB_NAME = "zero_trust_db"  # Adjust if your database name is different

async def check_drive_access_requests():
    print(f"Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    try:
        # Check connection
        await client.admin.command('ping')
        print("Successfully connected to MongoDB")
        
        # Check collections
        collections = await db.list_collection_names()
        print(f"Available collections: {collections}")
        
        # Check if the drive_access_requests collection exists
        if 'drive_access_requests' not in collections:
            print("Collection 'drive_access_requests' does not exist. Creating it now.")
            # Create the collection
            await db.create_collection('drive_access_requests')
            print("Created 'drive_access_requests' collection")
        else:
            print("Collection 'drive_access_requests' exists.")
            
            # Check documents in the collection
            count = await db.drive_access_requests.count_documents({})
            print(f"Total access requests: {count}")
            
            # List all requests
            requests = await db.drive_access_requests.find({}).to_list(length=100)
            print("\nCurrent access requests:")
            for req in requests:
                print(f"ID: {req['_id']}, User: {req.get('user_email')}, Folder: {req.get('folder_name')}, Status: {req.get('status')}")
            
            # Create a sample request if needed
            if count == 0:
                print("\nCreating a sample access request...")
                sample_request = {
                    "user_id": "test_user_id",
                    "user_email": "test@example.com",
                    "folder_id": "1zH31q0wcQsQsvn8qTR_NFqs1fjr2tfET",
                    "folder_name": "HR",
                    "device_id": "test_device_id",
                    "device_ip": "127.0.0.1",
                    "request_time": datetime.utcnow(),
                    "status": "pending",
                    "decision_time": None,
                    "decision_by": None,
                    "reason": None
                }
                
                result = await db.drive_access_requests.insert_one(sample_request)
                print(f"Created sample request with ID: {result.inserted_id}")
        
    except Exception as e:
        print(f"Error occurred: {str(e)}")
    finally:
        # Close the connection
        client.close()
        print("MongoDB connection closed")

if __name__ == "__main__":
    asyncio.run(check_drive_access_requests())