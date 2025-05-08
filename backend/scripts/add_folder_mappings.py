# backend/scripts/add_folder_mappings.py
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get MongoDB URI from environment variables
MONGODB_URL = os.getenv("MONGODB_URL")
DB_NAME = "zero_trust_db"  # Adjust if your database name is different

async def add_folder_mappings():
    print(f"Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    try:
        # Check connection
        await client.admin.command('ping')
        print("Successfully connected to MongoDB")
        
        # Check if the collection exists before dropping
        collections = await db.list_collection_names()
        if 'folder_mappings' in collections:
            await db.folder_mappings.drop()
            print("Dropped existing folder_mappings collection")
        
        mappings = [
            {"folder_id": "1zH31q0wcQsQsvn8qTR_NFqs1fjr2tfET", "name": "HR", "sensitivity": "confidential"},
            {"folder_id": "1tiAonmzgiWn59zbKinvOpUr", "name": "Finance", "sensitivity": "critical"},
            {"folder_id": "1A7Pr4QqF9zWk7mTSzCC9lkliQiy3xK9p", "name": "IT", "sensitivity": "admin"},
            {"folder_id": "1vYfVfB7EnV2hk0RkHBr841DIRk07", "name": "General", "sensitivity": "internal"}
        ]
        
        # Create the collection and add mappings
        for mapping in mappings:
            result = await db.folder_mappings.insert_one(mapping)
            print(f"Added mapping for {mapping['name']} folder")
            
        # Verify the mappings were added
        count = await db.folder_mappings.count_documents({})
        print(f"Total mappings added: {count}")
        
    except Exception as e:
        print(f"Error occurred: {str(e)}")
    finally:
        # Close the connection
        client.close()
        print("MongoDB connection closed")

if __name__ == "__main__":
    asyncio.run(add_folder_mappings())