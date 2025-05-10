import base64
import os
import logging
import email
from email.mime.text import MIMEText
from datetime import datetime
from .gmail_oauth import get_gmail_service
import json

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
        """Get all emails related to Google Drive share requests (language-independent)"""
        if not self.service:
            logger.error("Not authenticated with Gmail")
            raise Exception("Not authenticated with Gmail")
                
        try:
            # Search only by sender, not by subject text (which will be in different languages)
            query = 'from:drive-shares-dm-noreply@google.com OR from:drive-shares-noreply@google.com'
            logger.info(f"Searching Gmail with language-independent query: {query}")
            
            results = self.service.users().messages().list(
                userId='me',
                q=query
            ).execute()
                
            messages = results.get('messages', [])
            
            if not messages:
                logger.info("No Drive share emails found")
                return []
                    
            logger.info(f"Found {len(messages)} Drive share emails")
                    
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
                
                # Log full message details for debugging
                logger.info(f"Email ID: {message['id']}")
                logger.info(f"Subject: {subject}")
                logger.info(f"Body preview: {body[:100]}...")
                
                # Extract folder name using patterns that work across languages
                # 1. Look for text in quotes in the subject line
                folder_name = ''
                import re
                
                # Try to extract name in quotes from subject (works in many languages)
                quotes_match = re.search(r'"([^"]+)"', subject)
                if quotes_match:
                    folder_name = quotes_match.group(1)
                    logger.info(f"Extracted folder name from quotes: '{folder_name}'")
                
                # If no folder name from quotes, try to extract from specific patterns in the body
                if not folder_name:
                    # Try to find folder name patterns in any language
                    # Look for patterns like "HR" with formatting/structure that appears in sharing emails
                    folder_patterns = [
                        r'\bHR\b',                         # Common HR folder
                        r'\bFinance\b',                    # Common Finance folder
                        r'\bИТ\b',                         # IT in Russian
                        r'\bФинансы\b',                    # Finance in Russian
                        r'\bОтдел кадров\b',               # HR in Russian
                        r'\b[A-Za-zА-Яа-я0-9_\-\s]{1,30}\b' # Generic name pattern (fallback)
                    ]
                    
                    for pattern in folder_patterns:
                        matches = re.search(pattern, body)
                        if matches:
                            folder_name = matches.group(0)
                            logger.info(f"Extracted folder name from body pattern: '{folder_name}'")
                            break
                
                # Extract requester email - language independent using email pattern
                requester = ''
                email_pattern = r'[\w\.-]+@[\w\.-]+\.\w+'
                
                # First search in known areas of the message
                email_matches = re.findall(email_pattern, body)
                
                if email_matches:
                    # Filter out known system emails and Google addresses
                    for email in email_matches:
                        if (email != 'drive-shares-dm-noreply@google.com' and
                            'noreply' not in email and
                            'no-reply' not in email and
                            'google.com' not in email):
                            requester = email
                            logger.info(f"Extracted requester from email pattern: '{requester}'")
                            break
                
                # If still no requester, try to extract from the message structure
                if not requester:
                    # Extract from Google's typical format - even in different languages
                    # Often followed by "запрашивает доступ" (Russian) or "requested access" (English)
                    access_patterns = [
                        r'(\S+@\S+\.\S+)\s+запрашивает\s+доступ',   # Russian pattern
                        r'(\S+@\S+\.\S+)\s+requests\s+access',       # English pattern
                        r'(\S+@\S+\.\S+)\s+requested\s+access',      # Another English variant
                        r'(\S+@\S+\.\S+)\s+demande\s+',              # French pattern
                        r'(\S+@\S+\.\S+)\s+solicita\s+',             # Spanish/Portuguese pattern
                    ]
                    
                    for pattern in access_patterns:
                        matches = re.search(pattern, body)
                        if matches:
                            requester = matches.group(1)
                            logger.info(f"Extracted requester from language pattern: '{requester}'")
                            break
                
                # Special case - extract from the email visual structure
                # This is very specific to Google's email format but works across languages
                if not requester:
                    lines = body.split('\n')
                    for i, line in enumerate(lines):
                        if '@' in line and i > 0 and i < len(lines) - 1:
                            # If this line contains an email and is near the top of the email
                            email_match = re.search(email_pattern, line)
                            if email_match:
                                requester = email_match.group(0)
                                logger.info(f"Extracted requester from email structure: '{requester}'")
                                break
                
                # If we couldn't identify them from the content, fallback to using the complete
                # information from the headers
                if not folder_name:
                    # Extract from the subject line by removing common prefixes in different languages
                    subject_clean = subject
                    prefixes_to_remove = [
                        'Запрос доступа к файлу',  # Russian: "Access request to file"
                        'Запрос доступа к папке',  # Russian: "Access request to folder" 
                        'Share request for',       # English
                        'Access request for',      # English 
                        'Demande d\'accès à',      # French
                        'Solicitud de acceso a',   # Spanish
                    ]
                    
                    for prefix in prefixes_to_remove:
                        if subject.startswith(prefix):
                            subject_clean = subject[len(prefix):].strip()
                            break
                    
                    if subject_clean and subject_clean != subject:
                        # Remove quotes if present
                        subject_clean = subject_clean.strip('"')
                        folder_name = subject_clean
                        logger.info(f"Extracted folder name from cleaned subject: '{folder_name}'")
                
                # Only add if we have minimal information
                if folder_name or requester:
                    # If we're missing folder name, use a placeholder with the subject
                    if not folder_name:
                        folder_name = f"Unknown Folder ({subject[:20]}...)" if len(subject) > 20 else f"Unknown Folder ({subject})"
                    
                    # If we're missing requester, use a placeholder
                    if not requester:
                        requester = "Unknown Requester"
                    
                    share_requests.append({
                        'message_id': message['id'],
                        'subject': subject,
                        'date': date,
                        'folder_name': folder_name,
                        'requester': requester,
                        'body_preview': body[:200] + '...' if len(body) > 200 else body
                    })
                    
                    logger.info(f"Added request: Folder '{folder_name}' from '{requester}'")
                else:
                    # Log the failure case for debugging
                    logger.warning(f"Could not extract folder name or requester from message {message['id']}")
                    logger.warning(f"Subject: {subject}")
                    logger.warning(f"Body preview: {body[:100]}...")
                    
                    # Still add the message with placeholder data so we don't miss anything
                    share_requests.append({
                        'message_id': message['id'],
                        'subject': subject,
                        'date': date,
                        'folder_name': f"Unknown Folder ({subject[:20]}...)" if len(subject) > 20 else f"Unknown Folder ({subject})",
                        'requester': "Unknown Requester",
                        'body_preview': body[:200] + '...' if len(body) > 200 else body
                    })
                
            logger.info(f"Processed {len(share_requests)} valid Drive share emails")
            return share_requests
                
        except Exception as e:
            logger.error(f"Error fetching Drive share emails: {str(e)}")
            raise Exception(f"Failed to fetch Drive share emails: {str(e)}")

    # Add an enhanced debug method with message content
    def debug_gmail_content(self, include_body=False):
        """Debug function to print details of recent emails with optional body content"""
        if not self.service:
            logger.error("Not authenticated with Gmail")
            raise Exception("Not authenticated with Gmail")
                
        try:
            # Get most recent messages
            results = self.service.users().messages().list(
                userId='me',
                maxResults=10
            ).execute()
                
            messages = results.get('messages', [])
            
            if not messages:
                logger.info("No emails found")
                return []
                    
            logger.info(f"Found {len(messages)} recent emails. Examining...")
            
            email_details = []
                
            for message in messages:
                # If include_body is True, get full message, otherwise just get metadata
                format_type = 'full' if include_body else 'metadata'
                headers_to_get = ['Subject', 'From', 'Date']
                
                msg = self.service.users().messages().get(
                    userId='me', 
                    id=message['id'],
                    format=format_type,
                    metadataHeaders=headers_to_get if format_type == 'metadata' else None
                ).execute()
                    
                # Parse message details
                headers = msg['payload']['headers']
                subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No subject')
                sender = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown sender')
                date = next((h['value'] for h in headers if h['name'] == 'Date'), 'Unknown date')
                
                email_detail = {
                    "id": message['id'],
                    "subject": subject,
                    "from": sender,
                    "date": date
                }
                
                # Extract body if requested
                if include_body:
                    body = ''
                    if 'parts' in msg['payload']:
                        for part in msg['payload']['parts']:
                            if part['mimeType'] == 'text/plain':
                                if 'data' in part['body']:
                                    body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                    elif 'body' in msg['payload'] and 'data' in msg['payload']['body']:
                        body = base64.urlsafe_b64decode(msg['payload']['body']['data']).decode('utf-8')
                    
                    email_detail['body'] = body
                    
                logger.info(f"Email: Subject: {subject} | From: {sender} | Date: {date}")
                email_details.append(email_detail)
                
            return email_details
                
        except Exception as e:
            logger.error(f"Error debugging Gmail content: {str(e)}")
            return []
        
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