import os
import sys
from pathlib import Path
import base64

# Add the parent directory to sys.path
sys.path.append(str(Path(__file__).parent.parent))

from app.integrations.gmail_oauth import get_gmail_service

def list_recent_emails(max_results=20):
    """List recent emails and try to identify Google Drive share requests"""
    print("Getting Gmail service...")
    service = get_gmail_service()
    
    if not service:
        print("Failed to authenticate with Gmail")
        return
    
    print("Successfully authenticated with Gmail")
    
    # List messages
    try:
        results = service.users().messages().list(userId='me', maxResults=max_results).execute()
        messages = results.get('messages', [])
        
        if not messages:
            print("No messages found.")
            return
        
        print(f"Found {len(messages)} messages. Checking details...")
        
        drive_related_emails = []
        
        for message in messages:
            msg = service.users().messages().get(userId='me', id=message['id'], format='full').execute()
            
            # Extract headers
            headers = msg['payload']['headers']
            subject = next((h['value'] for h in headers if h['name'] == 'Subject'), '')
            from_email = next((h['value'] for h in headers if h['name'] == 'From'), '')
            date = next((h['value'] for h in headers if h['name'] == 'Date'), '')
            
            # Print basic info for all emails
            print(f"\nMessage ID: {message['id']}")
            print(f"From: {from_email}")
            print(f"Subject: {subject}")
            print(f"Date: {date}")
            
            # Check if related to Google Drive
            if 'drive' in from_email.lower() or 'drive' in subject.lower():
                print("*** GOOGLE DRIVE RELATED EMAIL ***")
                drive_related_emails.append({
                    'id': message['id'],
                    'from': from_email,
                    'subject': subject,
                    'date': date
                })
                
                # Try to extract body
                body = ""
                if 'parts' in msg['payload']:
                    for part in msg['payload']['parts']:
                        if part['mimeType'] == 'text/plain':
                            if 'data' in part['body']:
                                body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                                print("Body excerpt: " + body[:200] + "..." if len(body) > 200 else body)
                elif 'body' in msg['payload'] and 'data' in msg['payload']['body']:
                    body = base64.urlsafe_b64decode(msg['payload']['body']['data']).decode('utf-8')
                    print("Body excerpt: " + body[:200] + "..." if len(body) > 200 else body)
        
        print("\n\n=== SUMMARY OF GOOGLE DRIVE RELATED EMAILS ===")
        if drive_related_emails:
            for idx, email in enumerate(drive_related_emails):
                print(f"{idx+1}. From: {email['from']} - Subject: {email['subject']}")
        else:
            print("No Google Drive related emails found.")
            
        print("\nTry the following search query in your code:")
        print("from:drive-shares-noreply@google.com OR from:drive-shares-dm-noreply@google.com OR subject:\"google drive\"")
            
    except Exception as e:
        print(f"Error listing messages: {str(e)}")

if __name__ == "__main__":
    list_recent_emails(30)  # Check the 30 most recent emails