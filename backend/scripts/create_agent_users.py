# backend/scripts/create_agent_users.py
"""
Script to create initial agent users and rules in the database.
This ensures proper initial setup for the agent application.
"""

import asyncio
import logging
import sys
import os
from datetime import datetime
import bcrypt
from pymongo import MongoClient
from bson import ObjectId

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# MongoDB connection info
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb+srv://zt_admin:ZZteeGtWYMVPKNaq@cluster0.f2qts.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0")
DB_NAME = "zero_trust_db"

def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

async def create_agent_users():
    """Create initial agent users"""
    try:
        # Connect to MongoDB
        client = MongoClient(MONGODB_URL)
        db = client[DB_NAME]
        
        # Check if collections exist, create them if not
        if "agent_users" not in db.list_collection_names():
            logger.info("Creating 'agent_users' collection")
            db.create_collection("agent_users")
        
        if "agent_rules" not in db.list_collection_names():
            logger.info("Creating 'agent_rules' collection")
            db.create_collection("agent_rules")
        
        if "agent_activities" not in db.list_collection_names():
            logger.info("Creating 'agent_activities' collection")
            db.create_collection("agent_activities")
        
        # Define initial users
        initial_users = [
            {
                "firstName": "Admin",
                "lastName": "User",
                "email": "admin@example.com",
                "hashed_password": hash_password("password"),
                "role": "admin",
                "department": "IT",
                "position": "Administrator",
                "isActive": True,
                "createdAt": datetime.now()
            },
            {
                "firstName": "Manager",
                "lastName": "User",
                "email": "manager@example.com",
                "hashed_password": hash_password("password"),
                "role": "manager",
                "department": "Management",
                "position": "Team Leader",
                "isActive": True,
                "createdAt": datetime.now()
            },
            {
                "firstName": "Regular",
                "lastName": "User",
                "email": "user@example.com",
                "hashed_password": hash_password("password"),
                "role": "user",
                "department": "Marketing",
                "position": "Marketing Specialist",
                "isActive": True,
                "createdAt": datetime.now()
            },
            {
                "firstName": "Inactive",
                "lastName": "User",
                "email": "inactive@example.com",
                "hashed_password": hash_password("password"),
                "role": "user",
                "department": "Sales",
                "position": "Sales Representative",
                "isActive": False,
                "createdAt": datetime.now()
            }
        ]
        
        # Insert users if they don't exist
        users_collection = db.agent_users
        created_users = []
        
        for user in initial_users:
            existing_user = users_collection.find_one({"email": user["email"]})
            if not existing_user:
                logger.info(f"Creating user: {user['email']}")
                result = users_collection.insert_one(user)
                user_id = result.inserted_id
                user_with_id = {**user, "_id": user_id}
                created_users.append(user_with_id)
            else:
                logger.info(f"User already exists: {user['email']}")
                created_users.append(existing_user)
        
        # Define initial rules
        initial_rules = [
            {
                "name": "Block Social Media",
                "description": "Block access to social media websites",
                "type": "block",
                "resources": {
                    "websites": [
                        "facebook.com",
                        "twitter.com",
                        "instagram.com",
                        "tiktok.com",
                        "pinterest.com",
                        "reddit.com",
                        "tumblr.com"
                    ],
                    "applications": [],
                    "files": []
                },
                "appliesTo": {
                    "users": [],
                    "departments": ["Marketing", "Sales"],
                    "roles": ["user"]
                },
                "conditions": {
                    "timeRestrictions": {
                        "enabled": True,
                        "startTime": "09:00",
                        "endTime": "17:00",
                        "days": [1, 2, 3, 4, 5]
                    }
                },
                "priority": 50,
                "isActive": True,
                "createdAt": datetime.now(),
                "createdBy": None
            },
            {
                "name": "Allow Essential Websites",
                "description": "Allow access to essential websites like Google, Microsoft",
                "type": "allow",
                "resources": {
                    "websites": [
                        "google.com",
                        "microsoft.com",
                        "office.com",
                        "github.com",
                        "stackoverflow.com"
                    ],
                    "applications": [],
                    "files": []
                },
                "appliesTo": {
                    "users": [],
                    "departments": ["All"],
                    "roles": ["All"]
                },
                "conditions": {
                    "timeRestrictions": {
                        "enabled": False,
                        "startTime": "00:00",
                        "endTime": "23:59",
                        "days": [0, 1, 2, 3, 4, 5, 6]
                    }
                },
                "priority": 100,
                "isActive": True,
                "createdAt": datetime.now(),
                "createdBy": None
            },
            {
                "name": "Allow Development Tools",
                "description": "Allow access to development tools and applications",
                "type": "allow",
                "resources": {
                    "websites": [],
                    "applications": [
                        "code.exe",
                        "vscode.exe",
                        "devenv.exe",
                        "python.exe",
                        "node.exe",
                        "npm.exe"
                    ],
                    "files": []
                },
                "appliesTo": {
                    "users": [],
                    "departments": ["IT"],
                    "roles": ["All"]
                },
                "conditions": {
                    "timeRestrictions": {
                        "enabled": False,
                        "startTime": "00:00",
                        "endTime": "23:59",
                        "days": [0, 1, 2, 3, 4, 5, 6]
                    }
                },
                "priority": 90,
                "isActive": True,
                "createdAt": datetime.now(),
                "createdBy": None
            },
            {
                "name": "Block Gaming Sites and Applications",
                "description": "Block access to gaming websites and applications",
                "type": "block",
                "resources": {
                    "websites": [
                        "steampowered.com",
                        "epicgames.com",
                        "twitch.tv",
                        "xbox.com",
                        "playstation.com",
                        "blizzard.com",
                        "ea.com"
                    ],
                    "applications": [
                        "steam.exe",
                        "epicgameslauncher.exe",
                        "battlenet.exe",
                        "origin.exe"
                    ],
                    "files": []
                },
                "appliesTo": {
                    "users": [],
                    "departments": ["All"],
                    "roles": ["user"]
                },
                "conditions": {
                    "timeRestrictions": {
                        "enabled": True,
                        "startTime": "09:00",
                        "endTime": "17:00",
                        "days": [1, 2, 3, 4, 5]
                    }
                },
                "priority": 60,
                "isActive": True,
                "createdAt": datetime.now(),
                "createdBy": None
            },
            {
                "name": "Personal Rule for Regular User",
                "description": "Allow specific resources for Regular User",
                "type": "allow",
                "resources": {
                    "websites": [
                        "linkedin.com",
                        "marketing-tools.com"
                    ],
                    "applications": [],
                    "files": []
                },
                "appliesTo": {
                    "users": [],  # Will be filled with Regular User ID
                    "departments": [],
                    "roles": []
                },
                "conditions": {
                    "timeRestrictions": {
                        "enabled": False,
                        "startTime": "00:00",
                        "endTime": "23:59",
                        "days": [0, 1, 2, 3, 4, 5, 6]
                    }
                },
                "priority": 80,
                "isActive": True,
                "createdAt": datetime.now(),
                "createdBy": None
            },
            {
                "name": "Protect System Directories",
                "description": "Block access to sensitive system directories",
                "type": "block",
                "resources": {
                    "websites": [],
                    "applications": [],
                    "files": [
                        "C:\\Windows\\System32",
                        "/etc/",
                        "/var/",
                        "/bin/"
                    ]
                },
                "appliesTo": {
                    "users": [],
                    "departments": ["All"],
                    "roles": ["user"]
                },
                "conditions": {
                    "timeRestrictions": {
                        "enabled": False,
                        "startTime": "00:00",
                        "endTime": "23:59",
                        "days": [0, 1, 2, 3, 4, 5, 6]
                    }
                },
                "priority": 95,
                "isActive": True,
                "createdAt": datetime.now(),
                "createdBy": None
            }
        ]
        
        # Find the Regular User to add to the personal rule
        regular_user = next((user for user in created_users if user["email"] == "user@example.com"), None)
        if regular_user:
            # Add Regular User's ID to the personal rule
            for rule in initial_rules:
                if rule["name"] == "Personal Rule for Regular User":
                    rule["appliesTo"]["users"] = [regular_user["_id"]]
                    rule["createdBy"] = regular_user["_id"]
        
        # Insert rules if they don't exist
        rules_collection = db.agent_rules
        for rule in initial_rules:
            existing_rule = rules_collection.find_one({"name": rule["name"]})
            if not existing_rule:
                logger.info(f"Creating rule: {rule['name']}")
                rules_collection.insert_one(rule)
            else:
                logger.info(f"Rule already exists: {rule['name']}")
        
        logger.info("Successfully created initial agent users and rules")
        
    except Exception as e:
        logger.error(f"Error creating agent users and rules: {str(e)}")
        raise e
    finally:
        client.close()

async def main():
    """Main function to run the script"""
    await create_agent_users()

if __name__ == "__main__":
    # Run the script
    asyncio.run(main())