# backend/scripts/check_database.py
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from datetime import datetime
from bson.objectid import ObjectId

# Load environment variables
load_dotenv()

# Get MongoDB URI from environment variables
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DB_NAME = "zero_trust_db"  # Adjust if your database name is different

async def check_database():
    print(f"Connecting to MongoDB at {MONGODB_URL}...")
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    try:
        # Check connection
        await client.admin.command('ping')
        print(f"Successfully connected to MongoDB database: {DB_NAME}")
        
        # Check collections
        collections = await db.list_collection_names()
        print(f"\nAvailable collections ({len(collections)}):")
        for col in collections:
            count = await db.get_collection(col).count_documents({})
            print(f"- {col}: {count} documents")
        
        # Check drive_access_requests collection specifically
        if 'drive_access_requests' in collections:
            print("\nDrive access requests collection exists.")
            
            # Count documents
            count = await db.drive_access_requests.count_documents({})
            print(f"Total access requests: {count}")
            
            # List all documents
            if count > 0:
                print("\nExisting requests:")
                cursor = db.drive_access_requests.find({})
                async for doc in cursor:
                    print(f"- ID: {doc['_id']}, User: {doc.get('user_email')}, Folder: {doc.get('folder_name')}, Status: {doc.get('status')}")
            else:
                print("No access requests found in the collection.")
                
                # Create a test request
                print("\nCreating a test access request...")
                test_request = {
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
                
                result = await db.drive_access_requests.insert_one(test_request)
                print(f"Created test request with ID: {result.inserted_id}")
        else:
            print("\nDrive access requests collection does NOT exist.")
            print("Creating 'drive_access_requests' collection...")
            
            # Create the collection
            await db.create_collection('drive_access_requests')
            
            # Create a test document
            test_request = {
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
            
            result = await db.drive_access_requests.insert_one(test_request)
            print(f"Created test request with ID: {result.inserted_id}")
        
    except Exception as e:
        print(f"Error occurred: {str(e)}")
    finally:
        # Close the connection
        client.close()
        print("\nMongoDB connection closed")

if __name__ == "__main__":
    asyncio.run(check_database())