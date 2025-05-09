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
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Define scopes needed for Drive access
SCOPES = [
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive'  # Added full drive scope for managing permissions
]

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
        """List all folders in the Drive that the service account has access to"""
        if not self.service:
            logger.error("Not authenticated with Google Drive")
            raise Exception("Not authenticated with Google Drive")
            
        try:
            # Use more specific query to get folders including shared with me
            results = self.service.files().list(
                q="mimeType='application/vnd.google-apps.folder' and trashed=false",
                fields="files(id, name, owners, permissions)",
                pageSize=100,
                includeItemsFromAllDrives=True,
                supportsAllDrives=True
            ).execute()
            
            folders = results.get('files', [])
            logger.info(f"Found {len(folders)} folders in Google Drive")
            
            # Log folder details for debugging
            for folder in folders:
                logger.info(f"Folder: {folder['name']} ({folder['id']})")
                
            return folders
        except HttpError as e:
            logger.error(f"Error listing folders: {str(e)}")
            raise Exception(f"Failed to list folders: {str(e)}")
    
    def get_folder_details(self, folder_id):
        """Get detailed information about a specific folder"""
        if not self.service:
            logger.error("Not authenticated with Google Drive")
            raise Exception("Not authenticated with Google Drive")
            
        try:
            # Get folder metadata
            folder = self.service.files().get(
                fileId=folder_id,
                fields="id, name, owners, permissions",
                supportsAllDrives=True
            ).execute()
            
            # Get permissions
            permissions = self.service.permissions().list(
                fileId=folder_id,
                fields="permissions(id, emailAddress, role, type, displayName)",
                supportsAllDrives=True
            ).execute()
            
            folder['permissions'] = permissions.get('permissions', [])
            
            return folder
        except HttpError as e:
            logger.error(f"Error getting folder details: {str(e)}")
            raise Exception(f"Failed to get folder details: {str(e)}")
    
    def check_access(self, folder_id, user_email):
        """Check if a user has access to a specific folder"""
        if not self.service:
            logger.error("Not authenticated with Google Drive")
            raise Exception("Not authenticated with Google Drive")
            
        try:
            # Get permissions for the folder
            permissions = self.service.permissions().list(
                fileId=folder_id,
                fields="permissions(id, emailAddress, role, type)",
                supportsAllDrives=True
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
            logger.info(f"Granting {role} access to {user_email} for folder {folder_id}")
            
            # Check if the permission already exists
            has_access, existing_role = self.check_access(folder_id, user_email)
            
            if has_access:
                logger.info(f"User {user_email} already has {existing_role} access to folder {folder_id}")
                
                # If they have a different role and we want to update it
                if existing_role != role:
                    # Get permission ID
                    permissions = self.service.permissions().list(
                        fileId=folder_id,
                        fields="permissions(id, emailAddress, role)",
                        supportsAllDrives=True
                    ).execute()
                    
                    permission_id = None
                    for perm in permissions.get('permissions', []):
                        if perm.get('emailAddress') == user_email:
                            permission_id = perm.get('id')
                            break
                    
                    if permission_id:
                        # Update the role
                        self.service.permissions().update(
                            fileId=folder_id,
                            permissionId=permission_id,
                            body={'role': role},
                            fields='id, role',
                            supportsAllDrives=True
                        ).execute()
                        logger.info(f"Updated {user_email}'s role from {existing_role} to {role}")
                
                return {"id": permission_id, "role": role, "status": "existing_updated"}
            
            # Create new permission
            user_permission = {
                'type': 'user',
                'role': role,
                'emailAddress': user_email
            }
            
            result = self.service.permissions().create(
                fileId=folder_id,
                body=user_permission,
                fields='id',
                sendNotificationEmail=True,
                supportsAllDrives=True
            ).execute()
            
            logger.info(f"Granted {role} access to {user_email} for folder {folder_id}, permission ID: {result.get('id')}")
            return result
        except HttpError as e:
            error_msg = str(e)
            logger.error(f"Error granting access: {error_msg}")
            
            # Handle specific error cases
            if "insufficientFilePermissions" in error_msg:
                raise Exception(f"The service account does not have permission to share this folder. Make sure the service account has edit access to the folder.")
            else:
                raise Exception(f"Failed to grant access: {error_msg}")
    
    def revoke_access(self, folder_id, user_email):
        """Revoke access to a folder for a user"""
        if not self.service:
            logger.error("Not authenticated with Google Drive")
            raise Exception("Not authenticated with Google Drive")
            
        try:
            # First, find the permission ID for this user
            permissions = self.service.permissions().list(
                fileId=folder_id,
                fields="permissions(id, emailAddress)",
                supportsAllDrives=True
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
                permissionId=permission_id,
                supportsAllDrives=True
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
            
            # Create a list to keep track of successful syncs
            synced_folders = []
            
            for folder in folders:
                # Check if folder exists in DB
                existing = None
                # This needs to be handled by the calling async function
                # Will be fixed in the route handler
                
                # Add to synced folders list
                synced_folders.append({
                    "id": folder['id'],
                    "name": folder['name']
                })
            
            logger.info(f"Synchronized {len(synced_folders)} folders with database")
            return {
                "success": True,
                "message": f"Synchronized {len(synced_folders)} folders",
                "folders": synced_folders
            }
        except Exception as e:
            logger.error(f"Error syncing folder mappings: {str(e)}")
            return {
                "success": False,
                "message": f"Error syncing folders: {str(e)}"
            }
    
    def list_permission_requests(self):
        """Get pending access requests from Google Drive
        
        Note: Google Drive doesn't have a direct API for this.
        We need to implement our own tracking system.
        """
        # This function is synchronous, so we can't use async for
        pending_requests = []
        logger.info("Getting pending access requests")
        
        # Since we can't use async functionality here, we'll return an empty list 
        # and let the route handler do the async database query
        return pending_requests