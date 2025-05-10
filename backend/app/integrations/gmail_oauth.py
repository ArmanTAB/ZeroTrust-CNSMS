import os
import pickle
import logging
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

# Define the scopes you need
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 
          'https://www.googleapis.com/auth/gmail.modify']

def get_gmail_service():
    """
    Get an authorized Gmail API service instance using OAuth2.
    This will open a browser for user authorization if needed.
    """
    creds = None
    # The token.pickle file stores the user's access and refresh tokens
    token_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        'credentials',
        'gmail-token.pickle'
    )
    
    credentials_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        'credentials',
        'gmail-oauth-credentials.json'
    )
    
    # Check if token file exists
    if os.path.exists(token_path):
        with open(token_path, 'rb') as token:
            creds = pickle.load(token)
    
    # If there are no valid credentials, let the user log in
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                logger.error(f"Error refreshing token: {str(e)}")
                creds = None
        
        if not creds:
            if not os.path.exists(credentials_path):
                logger.error(f"Credentials file not found: {credentials_path}")
                return None
                
            flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
            creds = flow.run_local_server(port=0)
            
            # Save the credentials for the next run
            with open(token_path, 'wb') as token:
                pickle.dump(creds, token)
    
    try:
        # Return the Gmail API service
        return build('gmail', 'v1', credentials=creds)
    except Exception as e:
        logger.error(f"Error building Gmail service: {str(e)}")
        return None