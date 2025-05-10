# backend/scripts/setup_gmail_auth.py
import os
import sys
from pathlib import Path

# Add the parent directory to sys.path
sys.path.append(str(Path(__file__).parent.parent))

from app.integrations.gmail_oauth import get_gmail_service

if __name__ == "__main__":
    print("Setting up Gmail OAuth authentication...")
    service = get_gmail_service()
    if service:
        print("Successfully authenticated with Gmail!")
        # Try listing some messages to verify it works
        try:
            results = service.users().messages().list(userId='me', maxResults=5).execute()
            messages = results.get('messages', [])
            print(f"Found {len(messages)} messages")
        except Exception as e:
            print(f"Error listing messages: {str(e)}")
    else:
        print("Failed to authenticate with Gmail.")