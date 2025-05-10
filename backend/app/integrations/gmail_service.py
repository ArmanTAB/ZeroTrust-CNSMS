import base64
import os
import logging
import email
from email.mime.text import MIMEText
from datetime import datetime
from .gmail_oauth import get_gmail_service

logger = logging.getLogger(__name__)

class GmailService:
    """Service for interacting with Gmail API"""
    
    _instance = None
    
    @classmethod
    def get_instance(cls):
        """Get singleton instance of GmailService"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def __init__(self):
        """Initialize Gmail service"""
        self.service = None
        # Change the path to your new JSON key file
        self.credentials_file = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
            'credentials', 
            'google-drive-credentials.json'  # Change this to your new file name
        )
        self.authenticate()
        
    def authenticate(self):
        """Authenticate with Gmail using OAuth2"""
        try:
            self.service = get_gmail_service()
            if self.service:
                logger.info("Successfully authenticated with Gmail")
                return True
            else:
                logger.error("Failed to authenticate with Gmail")
                return False
        except Exception as e:
            logger.error(f"Error authenticating with Gmail: {str(e)}")
            return False
    
    # Make sure to fix the indentation in mark_message_read method
    def mark_message_read(self, message_id):
        """Mark a Gmail message as read"""
        if not self.service:
            logger.error("Not authenticated with Gmail")
            raise Exception("Not authenticated with Gmail")
            
        try:
            # Remove the 'UNREAD' label
            self.service.users().messages().modify(
                userId='me',
                id=message_id,
                body={'removeLabelIds': ['UNREAD']}
            ).execute()
            
            logger.info(f"Marked message {message_id} as read")
            return True
        except Exception as e:
            logger.error(f"Error marking message as read: {str(e)}")
            raise Exception(f"Failed to mark message as read: {str(e)}")

    def get_drive_share_requests(self):
        """Get all emails related to Google Drive share requests"""
        if not self.service:
            logger.error("Not authenticated with Gmail")
            raise Exception("Not authenticated with Gmail")
                
        try:
            # Use the exact sender email that appears in your emails
            query = 'from:drive-shares-dm-noreply@google.com subject:"Share request for"'
            logger.info(f"Searching Gmail with query: {query}")
            
            results = self.service.users().messages().list(
                userId='me',
                q=query
            ).execute()
                
            messages = results.get('messages', [])
            
            if not messages:
                logger.info("No Drive share request emails found")
                return []
                
            logger.info(f"Found {len(messages)} Drive share request emails")
                
            share_requests = []
            for message in messages:
                msg = self.service.users().messages().get(
                    userId='me', 
                    id=message['id'],
                    format='full'
                ).execute()
                    
                # Parse message details
                headers = msg['payload']['headers']
                subject = next((h['value'] for h in headers if h['name'] == 'Subject'), '')
                date = next((h['value'] for h in headers if h['name'] == 'Date'), '')
                    
                # Extract email body content
                body = ''
                if 'parts' in msg['payload']:
                    for part in msg['payload']['parts']:
                        if part['mimeType'] == 'text/plain':
                            if 'data' in part['body']:
                                body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                elif 'body' in msg['payload'] and 'data' in msg['payload']['body']:
                    body = base64.urlsafe_b64decode(msg['payload']['body']['data']).decode('utf-8')
                    
                # Extract folder name from subject
                # Subject format: 'Share request for "FolderName"'
                folder_name = ''
                if 'Share request for "' in subject:
                    folder_name = subject.replace('Share request for "', '').replace('"', '')
                
                # Extract requester from body
                # Body format typically includes: "email@example.com requests access to an item:"
                requester = ''
                for line in body.split('\n'):
                    if 'requests access to an item:' in line:
                        requester = line.split('requests access to an item:')[0].strip()
                        break
                
                # Only add if we have both folder name and requester
                if folder_name and requester:
                    logger.info(f"Found request for folder '{folder_name}' from '{requester}'")
                    share_requests.append({
                        'message_id': message['id'],
                        'subject': subject,
                        'date': date,
                        'folder_name': folder_name,
                        'requester': requester,
                        'body': body[:200] + '...' if len(body) > 200 else body  # Truncate long bodies
                    })
                else:
                    logger.warning(f"Could not extract folder name or requester from message {message['id']}")
                
            logger.info(f"Processed {len(share_requests)} valid Drive share request emails")
            return share_requests
            
        except Exception as e:
            logger.error(f"Error fetching Drive share request emails: {str(e)}")
            raise Exception(f"Failed to fetch Drive share request emails: {str(e)}")
        
    async def respond_to_share_request(self, message_id, approved=False, user_email=None, folder_id=None):
        """Respond to a Google Drive share request from Gmail"""
        if not self.service:
            logger.error("Not authenticated with Gmail")
            raise Exception("Not authenticated with Gmail")
            
        try:
            logger.info(f"=== RESPONDING TO GMAIL SHARE REQUEST ===")
            logger.info(f"Message ID: {message_id}")
            logger.info(f"Approved: {approved}")
            logger.info(f"User email: {user_email}")
            logger.info(f"Folder ID: {folder_id}")
            
            # 1. First mark the message as read (to remove from pending)
            self.mark_message_read(message_id)
            logger.info(f"Message {message_id} marked as read")
            
            result = {
                "status": "success",
                "message_marked_read": True
            }
            
            # 2. If approved, grant access in Google Drive
            if approved and user_email and folder_id:
                try:
                    logger.info(f"Granting Drive access to {user_email} for folder {folder_id}")
                    
                    from .google_drive import GoogleDriveService
                    drive_service = GoogleDriveService.get_instance()
                    permission_result = drive_service.grant_access(folder_id, user_email, "reader")
                    
                    logger.info(f"Permission result: {json.dumps(permission_result, default=str)}")
                    
                    result["drive_access_granted"] = True
                    result["permission_result"] = permission_result
                except Exception as e:
                    logger.error(f"Error granting Drive access: {str(e)}")
                    result["drive_access_granted"] = False
                    result["drive_error"] = str(e)
            
            return result
        except Exception as e:
            logger.error(f"Error responding to share request: {str(e)}")
            raise Exception(f"Failed to respond to share request: {str(e)}")