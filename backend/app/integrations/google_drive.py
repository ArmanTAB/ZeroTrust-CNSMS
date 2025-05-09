# backend/app/integrations/google_drive.py
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import os
import logging
from ..db import db
from datetime import datetime
from bson.objectid import ObjectId

# Configure logging
logger = logging.getLogger(__name__)

# Define scopes needed for Drive access
SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly',
          'https://www.googleapis.com/auth/drive.file']

class GoogleDriveService:
    """Service for interacting with Google Drive API"""
    
    _instance = None
    
    @classmethod
    def get_instance(cls, credentials_file=None):
        """Get singleton instance of GoogleDriveService"""
        if cls._instance is None:
            cls._instance = cls(credentials_file)
        return cls._instance
    
    def __init__(self, credentials_file=None):
        """Initialize Google Drive service with credentials"""
        self.credentials = None
        self.service = None
        self.credentials_file = credentials_file or os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
            'credentials', 
            'google-drive-credentials.json'
        )
        self.authenticate()
        
    def authenticate(self):
        """Authenticate with Google Drive using service account"""
        try:
            if os.path.exists(self.credentials_file):
                logger.info(f"Authenticating with credentials file: {self.credentials_file}")
                self.credentials = service_account.Credentials.from_service_account_file(
                    self.credentials_file, scopes=SCOPES)
                
                # Build the service
                if self.credentials:
                    self.service = build('drive', 'v3', credentials=self.credentials)
                    logger.info("Successfully authenticated with Google Drive")
                    return True
            else:
                logger.error(f"Credentials file not found: {self.credentials_file}")
        except Exception as e:
            logger.error(f"Failed to authenticate with Google Drive: {str(e)}")
        
        return False
    
    def list_folders(self):
        """List all folders in the Drive"""
        if not self.service:
            logger.error("Not authenticated with Google Drive")
            raise Exception("Not authenticated with Google Drive")
            
        try:
            results = self.service.files().list(
                q="mimeType='application/vnd.google-apps.folder' and trashed=false",
                fields="files(id, name, owners)"
            ).execute()
            
            logger.info(f"Found {len(results.get('files', []))} folders in Google Drive")
            return results.get('files', [])
        except HttpError as e:
            logger.error(f"Error listing folders: {str(e)}")
            raise Exception(f"Failed to list folders: {str(e)}")
    
    def check_access(self, folder_id, user_email):
        """Check if a user has access to a specific folder"""
        if not self.service:
            logger.error("Not authenticated with Google Drive")
            raise Exception("Not authenticated with Google Drive")
            
        try:
            # Get permissions for the folder
            permissions = self.service.permissions().list(
                fileId=folder_id,
                fields="permissions(id, emailAddress, role, type)"
            ).execute()
            
            # Check if user email is in permissions
            for perm in permissions.get('permissions', []):
                if perm.get('emailAddress') == user_email:
                    logger.info(f"User {user_email} has {perm.get('role')} access to folder {folder_id}")
                    return True, perm.get('role')
                    
            # If we get here, user doesn't have direct permission
            logger.info(f"User {user_email} does not have access to folder {folder_id}")
            return False, None
            
        except HttpError as e:
            logger.error(f"Error checking access: {str(e)}")
            return False, str(e)
    
    def grant_access(self, folder_id, user_email, role='reader'):
        """Grant access to a folder for a user"""
        if not self.service:
            logger.error("Not authenticated with Google Drive")
            raise Exception("Not authenticated with Google Drive")
            
        try:
            user_permission = {
                'type': 'user',
                'role': role,
                'emailAddress': user_email
            }
            
            result = self.service.permissions().create(
                fileId=folder_id,
                body=user_permission,
                fields='id',
                sendNotificationEmail=True
            ).execute()
            
            logger.info(f"Granted {role} access to {user_email} for folder {folder_id}")
            return result
        except HttpError as e:
            logger.error(f"Error granting access: {str(e)}")
            raise Exception(f"Failed to grant access: {str(e)}")
    
    def revoke_access(self, folder_id, user_email):
        """Revoke access to a folder for a user"""
        if not self.service:
            logger.error("Not authenticated with Google Drive")
            raise Exception("Not authenticated with Google Drive")
            
        try:
            # First, find the permission ID for this user
            permissions = self.service.permissions().list(
                fileId=folder_id,
                fields="permissions(id, emailAddress)"
            ).execute()
            
            permission_id = None
            for perm in permissions.get('permissions', []):
                if perm.get('emailAddress') == user_email:
                    permission_id = perm.get('id')
                    break
            
            if not permission_id:
                logger.warning(f"No permission found for {user_email} on folder {folder_id}")
                return False
                
            # Revoke the permission
            self.service.permissions().delete(
                fileId=folder_id,
                permissionId=permission_id
            ).execute()
            
            logger.info(f"Revoked access for {user_email} to folder {folder_id}")
            return True
        except HttpError as e:
            logger.error(f"Error revoking access: {str(e)}")
            raise Exception(f"Failed to revoke access: {str(e)}")
    
    def sync_folder_mappings(self):
        """Synchronize folder information with the database"""
        try:
            folders = self.list_folders()
            
            for folder in folders:
                # Check if folder exists in DB
                existing = db.db.folder_mappings.find_one({"folder_id": folder['id']})
                
                if existing:
                    # Update existing record
                    db.db.folder_mappings.update_one(
                        {"folder_id": folder['id']},
                        {"$set": {
                            "name": folder['name'],
                            "last_sync": datetime.utcnow()
                        }}
                    )
                else:
                    # Create new record with default sensitivity
                    db.db.folder_mappings.insert_one({
                        "folder_id": folder['id'],
                        "name": folder['name'],
                        "sensitivity": "internal",  # Default sensitivity
                        "last_sync": datetime.utcnow()
                    })
            
            logger.info(f"Synchronized {len(folders)} folders with database")
            return True
        except Exception as e:
            logger.error(f"Error syncing folder mappings: {str(e)}")
            return False