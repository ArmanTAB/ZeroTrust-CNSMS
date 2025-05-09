# backend/scripts/init_drive_folders.py
import asyncio
import sys
import os
from pathlib import Path
import logging
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

# Add the parent directory to sys.path to import app modules
sys.path.append(str(Path(__file__).parent.parent))

# Import the Google Drive service
from app.integrations.google_drive import GoogleDriveService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Get MongoDB URI from environment variables
MONGODB_URL = os.getenv("MONGODB_URL")
DB_NAME = "zero_trust_db"  # Adjust if your database name is different

# Define the folder mappings with sensitivity levels
SAMPLE_FOLDERS = [
    {"name": "HR", "sensitivity": "confidential"},
    {"name": "Finance", "sensitivity": "critical"},
    {"name": "IT", "sensitivity": "admin"},
    {"name": "General", "sensitivity": "internal"}
]

async def init_drive_folders():
    print("Initializing Google Drive folders...")
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]
    
    try:
        # Check connection
        await client.admin.command('ping')
        logger.info("Successfully connected to MongoDB")
        
        # Initialize Google Drive service
        drive_service = GoogleDriveService.get_instance()
        if not drive_service.service:
            logger.error("Failed to initialize Google Drive service")
            return
        
        logger.info("Successfully initialized Google Drive service")
        
        # Get folders from Google Drive
        try:
            google_folders = drive_service.list_folders()
            logger.info(f"Found {len(google_folders)} folders in Google Drive")
            
            # Check if folder_mappings collection exists
            collections = await db.list_collection_names()
            if 'folder_mappings' in collections:
                logger.info("Folder mappings collection exists, checking entries...")
                count = await db.folder_mappings.count_documents({})
                logger.info(f"Found {count} existing folder mappings")
                
                if count > 0 and input("Do you want to clear existing folder mappings? (y/n): ").lower() == 'y':
                    await db.folder_mappings.drop()
                    logger.info("Cleared existing folder mappings")
            
            # Create folder_mappings collection if it doesn't exist
            if 'folder_mappings' not in await db.list_collection_names():
                await db.create_collection('folder_mappings')
                logger.info("Created folder_mappings collection")
            
            # Process each Google Drive folder
            for folder in google_folders:
                folder_id = folder['id']
                folder_name = folder['name']
                
                # Check if folder already exists in mapping
                existing = await db.folder_mappings.find_one({"folder_id": folder_id})
                
                if existing:
                    logger.info(f"Folder {folder_name} ({folder_id}) already mapped with sensitivity: {existing.get('sensitivity')}")
                    continue
                
                # Try to match with sample folders
                sensitivity = "internal"  # Default sensitivity
                for sample in SAMPLE_FOLDERS:
                    if sample["name"].lower() in folder_name.lower():
                        sensitivity = sample["sensitivity"]
                        break
                
                # Insert folder mapping
                await db.folder_mappings.insert_one({
                    "folder_id": folder_id,
                    "name": folder_name,
                    "sensitivity": sensitivity,
                    "last_sync": datetime.utcnow()
                })
                
                logger.info(f"Added mapping for {folder_name} folder with sensitivity: {sensitivity}")
            
            # If no Google Drive folders were found or mapped, create sample folders in Google Drive
            if len(google_folders) == 0:
                logger.warning("No folders found in Google Drive. Do you want to create sample folders?")
                create_samples = input("Create sample folders in Google Drive? (y/n): ").lower() == 'y'
                
                if create_samples:
                    logger.info("Creating sample folders in Google Drive...")
                    
                    for sample in SAMPLE_FOLDERS:
                        try:
                            # Create folder in Google Drive
                            file_metadata = {
                                'name': sample["name"],
                                'mimeType': 'application/vnd.google-apps.folder'
                            }
                            folder = drive_service.service.files().create(
                                body=file_metadata,
                                fields='id'
                            ).execute()
                            
                            folder_id = folder.get('id')
                            
                            # Add to mapping
                            await db.folder_mappings.insert_one({
                                "folder_id": folder_id,
                                "name": sample["name"],
                                "sensitivity": sample["sensitivity"],
                                "last_sync": datetime.utcnow()
                            })
                            
                            logger.info(f"Created folder {sample['name']} ({folder_id}) with sensitivity: {sample['sensitivity']}")
                        except Exception as e:
                            logger.error(f"Error creating folder {sample['name']}: {str(e)}")
            
            # Verify the folder mappings
            count = await db.folder_mappings.count_documents({})
            logger.info(f"Total folder mappings: {count}")
            
            if count > 0:
                # Print all mappings
                cursor = db.folder_mappings.find({})
                async for mapping in cursor:
                    logger.info(f"  - {mapping['name']} ({mapping['folder_id']}): {mapping['sensitivity']}")
            
        except Exception as e:
            logger.error(f"Error processing Google Drive folders: {str(e)}")
        
        # Check or create drive_access_requests collection
        if 'drive_access_requests' not in await db.list_collection_names():
            await db.create_collection('drive_access_requests')
            logger.info("Created drive_access_requests collection")
        
        # Print summary
        logger.info("\nSummary:")
        for collection_name in ['folder_mappings', 'drive_access_requests']:
            count = await db.get_collection(collection_name).count_documents({})
            logger.info(f"  - {collection_name}: {count} documents")
        
        logger.info("\nGoogle Drive integration is now set up!")
        
    except Exception as e:
        logger.error(f"Error initializing Google Drive folders: {str(e)}")
    finally:
        # Close the MongoDB connection
        client.close()
        logger.info("MongoDB connection closed")

if __name__ == "__main__":
    asyncio.run(init_drive_folders())