# New file: backend/app/integrations/google_drive.py
from google.oauth2 import service_account
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import os

# Define scopes needed for Drive access
SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly',
          'https://www.googleapis.com/auth/drive.file']

class GoogleDriveService:
    def __init__(self):
        self.credentials = None
        self.service = None
        
    def authenticate(self, credentials_file=None, token_file=None):
        """Authenticate with Google Drive using OAuth2"""
        if credentials_file and os.path.exists(credentials_file):
            # Use service account for server-side auth
            self.credentials = service_account.Credentials.from_service_account_file(
                credentials_file, scopes=SCOPES)
        else:
            # Use OAuth2 for user auth
            if token_file and os.path.exists(token_file):
                with open(token_file, 'r') as token:
                    self.credentials = Credentials.from_authorized_user_info(
                        json.load(token), SCOPES)
                    
        # Build the service
        if self.credentials and (self.credentials.valid or self.credentials.refresh_token):
            if self.credentials.expired and self.credentials.refresh_token:
                self.credentials.refresh(Request())
            self.service = build('drive', 'v3', credentials=self.credentials)
            return True
        return False
    
    def list_folders(self):
        """List all folders in the Drive"""
        if not self.service:
            raise Exception("Not authenticated")
            
        results = self.service.files().list(
            q="mimeType='application/vnd.google-apps.folder'",
            fields="files(id, name, owners)"
        ).execute()
        
        return results.get('files', [])
    
    def check_access(self, folder_id, user_email):
        """Check if a user has access to a specific folder"""
        if not self.service:
            raise Exception("Not authenticated")
            
        try:
            # Get permissions for the folder
            permissions = self.service.permissions().list(
                fileId=folder_id,
                fields="permissions(id, emailAddress, role, type)"
            ).execute()
            
            # Check if user email is in permissions
            for perm in permissions.get('permissions', []):
                if perm.get('emailAddress') == user_email:
                    return True, perm.get('role')
                    
            # If we get here, user doesn't have direct permission
            return False, None
            
        except Exception as e:
            return False, str(e)
    
    def grant_access(self, folder_id, user_email, role='reader'):
        """Grant access to a folder for a user"""
        if not self.service:
            raise Exception("Not authenticated")
            
        user_permission = {
            'type': 'user',
            'role': role,
            'emailAddress': user_email
        }
        
        return self.service.permissions().create(
            fileId=folder_id,
            body=user_permission,
            fields='id'
        ).execute()