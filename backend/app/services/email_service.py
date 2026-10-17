# app/services/email_service.py
"""
Sends transactional emails via Gmail SMTP.
All sends are fire-and-forget — failures are logged, never raised,
so a flaky email cannot crash account creation or the API response.
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings


def _send(to_email: str, subject: str, html: str) -> bool:
    """Core SMTP send. Returns True on success, False on any failure."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print(f"[Email] SMTP not configured — would have sent '{subject}' to {to_email}")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        print(f"[Email] Sent '{subject}' to {to_email}")
        return True
    except Exception as e:
        print(f"[Email] Failed to send '{subject}' to {to_email}: {e}")
        return False


def send_account_setup_email(to_email: str, full_name: str, token: str) -> bool:
    """
    Sent when admin creates a new account.
    The user has no password yet — this link is how they set one.
    Token expires in 48 hours.
    """
    link = f"{settings.FRONTEND_URL}/set-password?token={token}"
    html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #F8F9FA; padding: 32px 16px; margin: 0; color: #111111;">
      <div style="max-width: 520px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
        <div style="height: 4px; background: #D62828;"></div>
        <div style="padding: 32px 32px 28px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px; font-size: 22px; font-weight: 700; color: #111111; letter-spacing: -0.02em;">Alpha Education Network</h2>
            <span style="font-size: 11px; font-weight: 700; color: #6B7280; letter-spacing: 0.08em; text-transform: uppercase;">SmartEdu LMS</span>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; color: #111111; margin: 0 0 12px;">Welcome, {full_name}</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #4B5563; margin: 0 0 20px;">
            Your account has been created on the <strong>SmartEdu Learning Management System</strong>. Please click the button below to set your password and access your portal:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="{link}"
               style="background: #111111; color: #FFFFFF; padding: 13px 30px; border-radius: 8px;
                      text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block; letter-spacing: 0.02em;">
              Set My Password
            </a>
          </div>
          <p style="font-size: 12px; line-height: 1.5; color: #9CA3AF; margin: 24px 0 0; border-top: 1px solid #F3F4F6; paddingTop: 16px;">
            This link is valid for <strong>48 hours</strong>. If you did not expect this invitation, you can safely ignore this email.
          </p>
        </div>
      </div>
    </body>
    </html>
    """
    return _send(to_email, "Welcome to SmartEdu — Set your password", html)


def send_password_reset_email(to_email: str, full_name: str, token: str) -> bool:
    """
    Sent when a user clicks 'Forgot password?'.
    Token expires in 30 minutes.
    """
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #F8F9FA; padding: 32px 16px; margin: 0; color: #111111;">
      <div style="max-width: 520px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
        <div style="height: 4px; background: #D62828;"></div>
        <div style="padding: 32px 32px 28px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px; font-size: 22px; font-weight: 700; color: #111111; letter-spacing: -0.02em;">Alpha Education Network</h2>
            <span style="font-size: 11px; font-weight: 700; color: #6B7280; letter-spacing: 0.08em; text-transform: uppercase;">SmartEdu LMS</span>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; color: #111111; margin: 0 0 12px;">Reset Your Password</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #4B5563; margin: 0 0 20px;">
            Hi {full_name}, we received a request to reset your SmartEdu account password. Click the button below to choose a new password:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="{link}"
               style="background: #111111; color: #FFFFFF; padding: 13px 30px; border-radius: 8px;
                      text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block; letter-spacing: 0.02em;">
              Reset My Password
            </a>
          </div>
          <p style="font-size: 12px; line-height: 1.5; color: #9CA3AF; margin: 24px 0 0; border-top: 1px solid #F3F4F6; padding-top: 16px;">
            This link is valid for <strong>30 minutes</strong>. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
          </p>
        </div>
      </div>
    </body>
    </html>
    """
    return _send(to_email, "Reset your SmartEdu password", html)


def send_enrollment_notification(to_email: str, full_name: str, course_name: str, course_code: str) -> bool:
    """Sent to a student when an admin enrolls them in a course."""
    link = f"{settings.FRONTEND_URL}/login"
    html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #F8F9FA; padding: 32px 16px; margin: 0; color: #111111;">
      <div style="max-width: 520px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
        <div style="height: 4px; background: #D62828;"></div>
        <div style="padding: 32px 32px 28px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="margin: 0 0 6px; font-size: 22px; font-weight: 700; color: #111111; letter-spacing: -0.02em;">Alpha Education Network</h2>
            <span style="font-size: 11px; font-weight: 700; color: #6B7280; letter-spacing: 0.08em; text-transform: uppercase;">SmartEdu LMS</span>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; color: #111111; margin: 0 0 12px;">Course Enrollment Confirmation</h3>
          <p style="font-size: 14px; line-height: 1.6; color: #4B5563; margin: 0 0 16px;">
            Hi {full_name}, you have been officially enrolled in the following course:
          </p>
          <div style="background: #F8F9FA; border: 1px solid #E5E7EB; padding: 16px 18px; border-radius: 8px; margin: 16px 0 24px;">
            <strong style="font-size: 15px; color: #111111;">{course_name}</strong><br>
            <span style="font-size: 12px; color: #6B7280; font-family: monospace;">Course Code: {course_code}</span>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="{link}"
               style="background: #111111; color: #FFFFFF; padding: 12px 28px; border-radius: 8px;
                      text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block;">
              Go to Student Portal
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
    """
    return _send(to_email, f"Enrolled in {course_name} — SmartEdu", html)