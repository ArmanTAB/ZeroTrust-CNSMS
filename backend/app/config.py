import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    APP_NAME: str = "Zero Trust Security Management System"
    MONGODB_URL: str = os.getenv("MONGODB_URL", "")
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "your-secret-key")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Email configuration
    EMAIL_HOST: str = os.getenv("EMAIL_HOST", "smtp.gmail.com") 
    EMAIL_PORT: int = int(os.getenv("EMAIL_PORT", "465"))
    EMAIL_SENDER: str = os.getenv("EMAIL_SENDER", "")
    EMAIL_PASSWORD: str = os.getenv("EMAIL_PASSWORD", "")
    
    # Verification settings
    VERIFICATION_CODE_LENGTH: int = 6
    VERIFICATION_CODE_EXPIRY_HOURS: int = 24
    
settings = Settings()