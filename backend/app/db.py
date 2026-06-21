from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure
from .config import settings
import logging

logger = logging.getLogger(__name__)

class Database:
    client = None
    db = None

db = Database()

async def connect_to_mongo():
    """Connect to MongoDB Atlas"""
    try:
        db.client = AsyncIOMotorClient(settings.MONGODB_URL)
        db.db = db.client.zero_trust_db
        # Проверка соединения
        await db.client.admin.command('ping')
        logger.info("Successfully connected to MongoDB Atlas")
    except ConnectionFailure:
        logger.error("Failed to connect to MongoDB Atlas")
        raise

async def close_mongo_connection():
    """Close MongoDB connection"""
    if db.client:
        db.client.close()
        logger.info("MongoDB connection closed")