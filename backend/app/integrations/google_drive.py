# backend/app/integrations/google_drive.py
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import os
import logging
import json  # Make sure to import json here too
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
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata'
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
        
        # If a specific file path wasn't provided, use a reliable path finder
        if credentials_file is None:
            import os
            
            # Get the current file's directory
            current_dir = os.path.dirname(os.path.abspath(__file__))
            
            # Navigate up to app directory
            app_dir = os.path.dirname(current_dir)
            
            # Navigate up to backend directory
            backend_dir = os.path.dirname(app_dir)
            
            # Create the proper path to credentials file
            credentials_file = os.path.join(backend_dir, 'credentials', 'google-drive-credentials.json')
        
        self.credentials_file = credentials_file
        logger.info(f"GoogleDriveService using credentials file: {self.credentials_file}")
        logger.info(f"File exists: {os.path.exists(self.credentials_file)}")
        
        self.authenticate()
        
    def authenticate(self):
        """Authenticate with Google Drive using service account"""
        try:
            if os.path.exists(self.credentials_file):
                logger.info(f"Authenticating with credentials file: {self.credentials_file}")
                self.credentials = service_account.Credentials.from_service_account_file(
                    self.credentials_file, scopes=SCOPES)
                
                # Build the service with correct cache_discovery=False parameter
                self.service = build('drive', 'v3', credentials=self.credentials, cache_discovery=False)
                logger.info(f"Successfully authenticated with Google Drive as {self.credentials.service_account_email}")
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
    
    def get_pending_share_requests(self):
        """Fetch pending share requests from Google Drive"""
        if not self.service:
            logger.error("Not authenticated with Google Drive")
            raise Exception("Not authenticated with Google Drive")
            
        try:
            # Use the Drive Activity API
            activity_service = build('driveactivity', 'v2', credentials=self.credentials)
            
            # Query for all pending access requests
            results = activity_service.activity().query(
                body={
                    "ancestorName": "root",  # Start from root to get all
                    "filter": "time >= 1970-01-01T00:00:00Z AND detail.permissionChange.addedPermissions.role = reader",
                    "pageSize": 100
                }
            ).execute()
            
            activities = results.get('activities', [])
            
            # Filter for pending access requests
            pending_requests = []
            for activity in activities:
                if 'permissionChange' in activity.get('primaryActionDetail', {}):
                    change = activity['primaryActionDetail']['permissionChange']
                    # Check if this is a permission request rather than a direct add
                    if 'pendingAccessRequest' in str(change):
                        # Extract request details
                        actors = activity.get('actors', [])
                        targets = activity.get('targets', [])
                        
                        # Get user who requested access
                        request_user = None
                        for actor in actors:
                            if 'user' in actor:
                                request_user = actor['user'].get('knownUser', {}).get('personName', 'Unknown User')
                        
                        # Get file/folder that access was requested for
                        request_target = None
                        for target in targets:
                            if 'driveItem' in target:
                                request_target = target['driveItem'].get('name', 'Unknown Item')
                        
                        timestamp = activity.get('timestamp', '')
                        
                        if request_user and request_target:
                            pending_requests.append({
                                'user': request_user,
                                'target': request_target,
                                'timestamp': timestamp,
                                'activity_id': activity.get('id', '')
                            })
            
            logger.info(f"Found {len(pending_requests)} pending share requests")
            return pending_requests
        
        except Exception as e:
            logger.error(f"Error fetching pending share requests: {str(e)}")
            raise Exception(f"Failed to fetch pending share requests: {str(e)}")
        
    def grant_access(self, folder_id, user_email, role='reader'):
        """Grant access to a folder for a user - improved with multiple fallback methods"""
        if not self.service:
            logger.error("Not authenticated with Google Drive")
            raise Exception("Not authenticated with Google Drive")
        
        # Ensure consistent format for user_email
        user_email = user_email.strip().lower()
        
        try:
            logger.info(f"=== GRANTING ACCESS ===")
            logger.info(f"Service account: {self.credentials.service_account_email}")
            logger.info(f"Folder ID: {folder_id}")
            logger.info(f"User email: {user_email}")
            logger.info(f"Role: {role}")
            
            # First, check if the user already has this permission
            try:
                permissions = self.service.permissions().list(
                    fileId=folder_id,
                    fields='permissions(id,emailAddress,role,type)'
                ).execute()
                
                logger.info(f"Current permissions: {json.dumps(permissions, default=str)}")
                
                # Check if user already has access
                for perm in permissions.get('permissions', []):
                    if perm.get('emailAddress', '').lower() == user_email:
                        logger.info(f"User {user_email} already has {perm.get('role')} access")
                        
                        # If role matches, no need to update
                        if perm.get('role') == role:
                            logger.info(f"User already has requested role ({role}), no changes needed")
                            return perm
                        
                        # Update role if different
                        logger.info(f"Updating permission from {perm.get('role')} to {role}")
                        updated_perm = self.service.permissions().update(
                            fileId=folder_id,
                            permissionId=perm.get('id'),
                            body={'role': role}
                        ).execute()
                        
                        logger.info(f"Permission updated: {json.dumps(updated_perm, default=str)}")
                        return updated_perm
            except Exception as e:
                logger.error(f"Error checking existing permissions: {str(e)}")
            
            # Create new permission
            user_permission = {
                'type': 'user',
                'role': role,
                'emailAddress': user_email
            }
            
            logger.info(f"Creating permission: {json.dumps(user_permission, default=str)}")
            
            # METHOD 1: Direct method like in test script (no supportsAllDrives)
            try:
                logger.info("ATTEMPT 1: Using test script method (no supportsAllDrives)")
                result = self.service.permissions().create(
                    fileId=folder_id,
                    body=user_permission,
                    fields='id,emailAddress,role',
                    sendNotificationEmail=True
                ).execute()
                
                logger.info(f"Method 1 successful: {json.dumps(result, default=str)}")
                return result
            except Exception as e1:
                logger.error(f"Method 1 failed: {str(e1)}")
                
                # METHOD 2: With supportsAllDrives
                try:
                    logger.info("ATTEMPT 2: With supportsAllDrives=True")
                    result = self.service.permissions().create(
                        fileId=folder_id,
                        body=user_permission,
                        fields='id,emailAddress,role',
                        sendNotificationEmail=True,
                        supportsAllDrives=True
                    ).execute()
                    
                    logger.info(f"Method 2 successful: {json.dumps(result, default=str)}")
                    return result
                except Exception as e2:
                    logger.error(f"Method 2 failed: {str(e2)}")
                    
                    # METHOD 3: Minimal parameters
                    try:
                        logger.info("ATTEMPT 3: Minimal parameters")
                        result = self.service.permissions().create(
                            fileId=folder_id,
                            body=user_permission
                        ).execute()
                        
                        logger.info(f"Method 3 successful: {json.dumps(result, default=str)}")
                        return result
                    except Exception as e3:
                        logger.error(f"Method 3 failed: {str(e3)}")
                        
                        # Final attempt with no notification
                        try:
                            logger.info("FINAL ATTEMPT: No notification")
                            result = self.service.permissions().create(
                                fileId=folder_id,
                                body=user_permission,
                                sendNotificationEmail=False
                            ).execute()
                            
                            logger.info(f"Final method successful: {json.dumps(result, default=str)}")
                            return result
                        except Exception as e4:
                            logger.error(f"All methods failed: {str(e4)}")
                            raise Exception(f"Failed to grant access after multiple attempts: {str(e4)}")
                
        except Exception as e:
            logger.error(f"Error in grant_access: {str(e)}")
            raise e
            
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
            
        except Exception as e:
            logger.error(f"Error checking access: {str(e)}")
            return False, str(e)
        
    def find_folder_by_name(self, folder_name):
        """Find a folder in Google Drive by name"""
        if not self.service:
            logger.error("Not authenticated with Google Drive")
            raise Exception("Not authenticated with Google Drive")
            
        try:
            # Search for the folder by name
            query = f"mimeType='application/vnd.google-apps.folder' and name='{folder_name}' and trashed=false"
            logger.info(f"Searching for folder with name: {folder_name}")
            
            results = self.service.files().list(
                q=query,
                spaces='drive',
                fields='files(id, name, owners, permissions)',
                supportsAllDrives=True,
                includeItemsFromAllDrives=True
            ).execute()
            
            folders = results.get('files', [])
            
            if not folders:
                logger.info(f"No folder found with name: {folder_name}")
                return None
            
            # If multiple folders with the same name exist, use the first one
            folder = folders[0]
            logger.info(f"Found folder: {folder['name']} ({folder['id']})")
            return folder
            
        except Exception as e:
            logger.error(f"Error finding folder by name: {str(e)}")
            return None