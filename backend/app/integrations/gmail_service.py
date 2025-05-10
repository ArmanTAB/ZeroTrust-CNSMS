from google.oauth2 import service_account
from googleapiclient.discovery import build
import base64
import os
import logging
import email
from email.mime.text import MIMEText
from datetime import datetime

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
    
    def get_drive_share_requests(self):
        """Get all emails related to Google Drive share requests"""
        if not self.service:
            logger.error("Not authenticated with Gmail")
            raise Exception("Not authenticated with Gmail")
            
        try:
            # Search for Drive share request emails
            query = 'from:drive-shares-dm-noreply@google.com subject:"Share request for"'
            results = self.service.users().messages().list(
                userId='me',
                q=query
            ).execute()
            
            messages = results.get('messages', [])
            
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
                # This is simplified - you might need more logic to handle different message formats
                body = ''
                if 'parts' in msg['payload']:
                    for part in msg['payload']['parts']:
                        if part['mimeType'] == 'text/plain':
                            body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                elif 'body' in msg['payload'] and 'data' in msg['payload']['body']:
                    body = base64.urlsafe_b64decode(msg['payload']['body']['data']).decode('utf-8')
                
                # Extract folder/file name and requester from subject/body
                folder_name = subject.replace('Share request for "', '').replace('"', '')
                requester = ''
                for line in body.split('\n'):
                    if 'requesting access' in line:
                        requester = line.split('(')[0].strip()
                        break
                
                share_requests.append({
                    'message_id': message['id'],
                    'subject': subject,
                    'date': date,
                    'folder_name': folder_name,
                    'requester': requester,
                    'body': body
                })
            
            logger.info(f"Found {len(share_requests)} Drive share request emails")
            return share_requests
        
        except Exception as e:
            logger.error(f"Error fetching Drive share request emails: {str(e)}")
            raise Exception(f"Failed to fetch Drive share request emails: {str(e)}")
        
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