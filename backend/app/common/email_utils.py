import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging
from pathlib import Path
from ..config import settings

logger = logging.getLogger(__name__)

# Path to the email templates
TEMPLATE_DIR = Path(__file__).parent.parent.parent / "email_templates"

def load_template(template_name):
    """Load an email template from the templates directory"""
    try:
        template_path = TEMPLATE_DIR / template_name
        with open(template_path, 'r', encoding='utf-8') as file:
            return file.read()
    except Exception as e:
        logger.error(f"Failed to load email template {template_name}: {str(e)}")
        # Return a basic fallback template if loading fails
        return """
        <html>
        <body>
            <h2>Zero Trust Security</h2>
            <p>Hello {{full_name}},</p>
            <p>Your code is: {{code}}</p>
            <p>Regards,<br>Zero Trust Security Team</p>
        </body>
        </html>
        """

def send_verification_email(recipient_email: str, verification_code: str, full_name: str):
    """Send verification email with the verification code using custom template"""
    try:
        sender_email = settings.EMAIL_SENDER
        password = settings.EMAIL_PASSWORD
        
        message = MIMEMultipart("alternative")
        message["Subject"] = "Verify Your Zero Trust Security Account"
        message["From"] = sender_email
        message["To"] = recipient_email
        
        # Load the HTML template
        html_template = load_template("verification_email.html")
        
        # Replace placeholders with actual values
        html_content = html_template.replace("{{full_name}}", full_name)
        html_content = html_content.replace("{{verification_code}}", verification_code)
        
        # Create plain text version as fallback
        text = f"""
        Hello {full_name},
        
        Thank you for registering for Zero Trust Security Management System.
        
        Your verification code is: {verification_code}
        
        Please enter this code on the verification page to activate your account.
        
        This code will expire in 24 hours.
        
        If you did not create an account, please ignore this email.
        
        Regards,
        Zero Trust Security Team
        """
        
        # Turn these into plain/html MIMEText objects
        part1 = MIMEText(text, "plain")
        part2 = MIMEText(html_content, "html")
        
        # Add HTML/plain-text parts to MIMEMultipart message
        message.attach(part1)
        message.attach(part2)
        
        # Create secure connection with server and send email
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.EMAIL_HOST, settings.EMAIL_PORT, context=context) as server:
            server.login(sender_email, password)
            server.sendmail(sender_email, recipient_email, message.as_string())
            
        logger.info(f"Verification email sent to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send verification email: {str(e)}")
        return False

def send_password_reset_email(recipient_email: str, reset_code: str, full_name: str):
    """Send password reset email with reset code using custom template"""
    try:
        sender_email = settings.EMAIL_SENDER
        password = settings.EMAIL_PASSWORD
        
        message = MIMEMultipart("alternative")
        message["Subject"] = "Reset Your Zero Trust Security Password"
        message["From"] = sender_email
        message["To"] = recipient_email
        
        # Load the HTML template
        html_template = load_template("password_reset_email.html")
        
        # Replace placeholders with actual values
        html_content = html_template.replace("{{full_name}}", full_name)
        html_content = html_content.replace("{{reset_code}}", reset_code)
        
        # Create plain text version as fallback
        text = f"""
        Hello {full_name},
        
        We received a request to reset your password for Zero Trust Security Management System.
        
        Your password reset code is: {reset_code}
        
        Please enter this code on the reset password page to set a new password.
        
        This code will expire in 24 hours.
        
        If you did not request a password reset, please ignore this email or contact support.
        
        Regards,
        Zero Trust Security Team
        """
        
        # Turn these into plain/html MIMEText objects
        part1 = MIMEText(text, "plain")
        part2 = MIMEText(html_content, "html")
        
        # Add HTML/plain-text parts to MIMEMultipart message
        message.attach(part1)
        message.attach(part2)
        
        # Create secure connection with server and send email
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.EMAIL_HOST, settings.EMAIL_PORT, context=context) as server:
            server.login(sender_email, password)
            server.sendmail(sender_email, recipient_email, message.as_string())
            
        logger.info(f"Password reset email sent to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send password reset email: {str(e)}")
        return False
    
def send_otp_email(recipient_email: str, otp_code: str, full_name: str):
    """Send OTP email with the verification code using custom template"""
    try:
        sender_email = settings.EMAIL_SENDER
        password = settings.EMAIL_PASSWORD
        
        message = MIMEMultipart("alternative")
        message["Subject"] = "Your OTP Code for Zero Trust Security"
        message["From"] = sender_email
        message["To"] = recipient_email
        
        # Load the HTML template
        html_template = load_template("otp_email.html")
        
        # Replace placeholders with actual values
        html_content = html_template.replace("{{full_name}}", full_name)
        html_content = html_content.replace("{{otp_code}}", otp_code)
        
        # Create plain text version as fallback
        text = f"""
        Hello {full_name},
        
        You are receiving this email because you are trying to log in to your Zero Trust Security account.
        
        Your verification code is: {otp_code}
        
        This code will expire in 10 minutes.
        
        If you did not request this code, please ignore this email or contact support immediately as your account may be at risk.
        
        Regards,
        Zero Trust Security Team
        """
        
        # Turn these into plain/html MIMEText objects
        part1 = MIMEText(text, "plain")
        part2 = MIMEText(html_content, "html")
        
        # Add HTML/plain-text parts to MIMEMultipart message
        message.attach(part1)
        message.attach(part2)
        
        # Create secure connection with server and send email
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.EMAIL_HOST, settings.EMAIL_PORT, context=context) as server:
            server.login(sender_email, password)
            server.sendmail(sender_email, recipient_email, message.as_string())
            
        logger.info(f"OTP email sent to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP email: {str(e)}")
        return False