import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging
from ..config import settings

logger = logging.getLogger(__name__)

def send_verification_email(recipient_email: str, verification_code: str, full_name: str):
    """Send verification email with the verification code"""
    try:
        sender_email = settings.EMAIL_SENDER
        password = settings.EMAIL_PASSWORD
        
        message = MIMEMultipart("alternative")
        message["Subject"] = "Verify Your Zero Trust Security Account"
        message["From"] = sender_email
        message["To"] = recipient_email
        
        # Create the plain-text and HTML version of your message
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
        
        html = f"""
        <html>
        <body>
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
                <div style="background-color: #3b82f6; padding: 15px; border-radius: 5px 5px 0 0; text-align: center;">
                    <h2 style="color: white; margin: 0;">Zero Trust Security</h2>
                </div>
                <div style="padding: 20px;">
                    <p>Hello <b>{full_name}</b>,</p>
                    <p>Thank you for registering for Zero Trust Security Management System.</p>
                    <p>Your verification code is:</p>
                    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; letter-spacing: 5px; font-weight: bold;">
                        {verification_code}
                    </div>
                    <p>Please enter this code on the verification page to activate your account.</p>
                    <p>This code will expire in 24 hours.</p>
                    <p>If you did not create an account, please ignore this email.</p>
                    <p>Regards,<br>Zero Trust Security Team</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Turn these into plain/html MIMEText objects
        part1 = MIMEText(text, "plain")
        part2 = MIMEText(html, "html")
        
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
    """Send password reset email with reset code"""
    try:
        sender_email = settings.EMAIL_SENDER
        password = settings.EMAIL_PASSWORD
        
        message = MIMEMultipart("alternative")
        message["Subject"] = "Reset Your Zero Trust Security Password"
        message["From"] = sender_email
        message["To"] = recipient_email
        
        # Create the plain-text and HTML version of your message
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
        
        html = f"""
        <html>
        <body>
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
                <div style="background-color: #3b82f6; padding: 15px; border-radius: 5px 5px 0 0; text-align: center;">
                    <h2 style="color: white; margin: 0;">Zero Trust Security</h2>
                </div>
                <div style="padding: 20px;">
                    <p>Hello <b>{full_name}</b>,</p>
                    <p>We received a request to reset your password for Zero Trust Security Management System.</p>
                    <p>Your password reset code is:</p>
                    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; letter-spacing: 5px; font-weight: bold;">
                        {reset_code}
                    </div>
                    <p>Please enter this code on the reset password page to set a new password.</p>
                    <p>This code will expire in 24 hours.</p>
                    <p>If you did not request a password reset, please ignore this email or contact support.</p>
                    <p>Regards,<br>Zero Trust Security Team</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Turn these into plain/html MIMEText objects
        part1 = MIMEText(text, "plain")
        part2 = MIMEText(html, "html")
        
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