from twilio.rest import Client
from ..config import settings
import logging

logger = logging.getLogger(__name__)

def get_twilio_client():
    """Get the Twilio client instance"""
    try:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        return client
    except Exception as e:
        logger.error(f"Failed to initialize Twilio client: {str(e)}")
        return None

def send_verification_sms(phone_number: str, verification_code: str) -> bool:
    """Send verification code via SMS"""
    try:
        client = get_twilio_client()
        if not client:
            return False

        message = client.messages.create(
            body=f"Your Zero Trust Security verification code is: {verification_code}",
            from_=settings.TWILIO_PHONE_NUMBER,
            to=phone_number
        )
        
        logger.info(f"SMS verification sent to {phone_number}, SID: {message.sid}")
        return True
    except Exception as e:
        logger.error(f"Failed to send SMS verification: {str(e)}")
        return False

def send_verification_whatsapp(phone_number: str, verification_code: str) -> bool:
    """Send verification code via WhatsApp"""
    try:
        client = get_twilio_client()
        if not client:
            return False

        # For WhatsApp, the number format should be 'whatsapp:+1234567890'
        whatsapp_number = f"whatsapp:{phone_number}"
        from_whatsapp = f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}"
        
        message = client.messages.create(
            body=f"Your Zero Trust Security verification code is: {verification_code}",
            from_=from_whatsapp,
            to=whatsapp_number
        )
        
        logger.info(f"WhatsApp verification sent to {phone_number}, SID: {message.sid}")
        return True
    except Exception as e:
        logger.error(f"Failed to send WhatsApp verification: {str(e)}")
        return False