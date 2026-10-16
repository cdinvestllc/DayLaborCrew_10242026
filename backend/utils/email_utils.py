import resend
import asyncio
import os
import logging

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')


async def send_email(to: str, subject: str, html: str) -> bool:
    try:
        params = {"from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html}
        await asyncio.to_thread(resend.Emails.send, params)
        return True
    except Exception as e:
        logger.error(f"Email send failed: {e}")
        return False


async def send_welcome_email(name: str, email: str, role: str):
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#050A30;padding:40px;border-radius:12px">
      <h1 style="color:#7EC8E3;font-size:28px;margin-bottom:8px">Welcome to TheDayLaborers!</h1>
      <p style="color:#fff;font-size:16px">Hi {name},</p>
      <p style="color:#ccc">Your account as a <strong style="color:#7EC8E3">{role.title()}</strong> has been created successfully.</p>
      <p style="color:#ccc">You have a <strong style="color:#FFD700">30-day free trial</strong> to explore the platform.</p>
      <a href="https://thedaylaborers.com" style="display:inline-block;background:#0000FF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px">Get Started</a>
      <p style="color:#666;margin-top:32px;font-size:12px">TheDayLaborers &mdash; A Blue Collar ME Company</p>
    </div>
    """
    await send_email(email, "Welcome to TheDayLaborers!", html)


async def send_job_notification_email(crew_email: str, crew_name: str, job_title: str, pay_rate: float, location: str):
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#050A30;padding:40px;border-radius:12px">
      <h1 style="color:#FFD700;font-size:24px">New Job Available!</h1>
      <p style="color:#fff">Hi {crew_name},</p>
      <p style="color:#ccc">A new job matching your skills is available:</p>
      <div style="background:#000C66;border-radius:8px;padding:20px;margin:16px 0">
        <h2 style="color:#7EC8E3;margin:0 0 8px">{job_title}</h2>
        <p style="color:#fff;margin:4px 0">Pay Rate: <strong>${pay_rate}/hr</strong></p>
        <p style="color:#fff;margin:4px 0">Location: {location}</p>
      </div>
      <a href="https://thedaylaborers.com/crew/dashboard" style="display:inline-block;background:#0000FF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">View Job</a>
    </div>
    """
    await send_email(crew_email, f"New Job: {job_title}", html)


async def send_job_completion_email(contractor_email: str, contractor_name: str, job_title: str):
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#050A30;padding:40px;border-radius:12px">
      <h1 style="color:#10B981;font-size:24px">Job Completed!</h1>
      <p style="color:#fff">Hi {contractor_name},</p>
      <p style="color:#ccc">Your job <strong style="color:#7EC8E3">{job_title}</strong> has been marked as complete by the crew.</p>
      <p style="color:#ccc">Please verify completion from your dashboard.</p>
      <a href="https://thedaylaborers.com/contractor/dashboard" style="display:inline-block;background:#0000FF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Verify Completion</a>
    </div>
    """
    await send_email(contractor_email, f"Job Completed: {job_title}", html)


async def send_subscription_email(email: str, name: str, plan: str, end_date: str):
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#050A30;padding:40px;border-radius:12px">
      <h1 style="color:#10B981;font-size:24px">Subscription Activated!</h1>
      <p style="color:#fff">Hi {name},</p>
      <p style="color:#ccc">Your <strong style="color:#7EC8E3">{plan.title()}</strong> subscription is now active.</p>
      <p style="color:#ccc">Access expires: <strong>{end_date}</strong></p>
      <a href="https://thedaylaborers.com" style="display:inline-block;background:#0000FF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Go to Dashboard</a>
    </div>
    """
    await send_email(email, "Subscription Activated - TheDayLaborers", html)


async def send_bulk_email_to_users(users: list, subject: str, body: str) -> dict:
    """Send bulk email to a list of users. Returns sent/failed counts."""
    sent = 0
    failed = 0
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#050A30;padding:40px;border-radius:12px">
      <h2 style="color:#7EC8E3;font-size:22px">{subject}</h2>
      <div style="color:#ccc;font-size:15px;line-height:1.6;white-space:pre-wrap">{body}</div>
      <p style="color:#666;margin-top:32px;font-size:12px">TheDayLaborers &mdash; A Blue Collar ME Company</p>
    </div>
    """
    for user in users:
        success = await send_email(user["email"], subject, html)
        if success:
            sent += 1
        else:
            failed += 1
    return {"sent": sent, "failed": failed}


async def send_password_reset_email(email: str, name: str, token: str):
    frontend_url = os.environ.get("FRONTEND_URL", "https://crew-workforce.preview.emergentagent.com")
    reset_url = f"{frontend_url}/auth?mode=reset&token={token}"
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#050A30;padding:40px;border-radius:12px">
      <h1 style="color:#7EC8E3;font-size:24px;margin-bottom:8px">Reset Your Password</h1>
      <p style="color:#fff">Hi {name},</p>
      <p style="color:#ccc">You requested a password reset for your TheDayLaborers account.</p>
      <p style="color:#ccc">Click the button below to set a new password. This link expires in <strong style="color:#FFD700">2 hours</strong>.</p>
      <a href="{reset_url}" style="display:inline-block;background:#0000FF;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px;font-size:16px">Reset Password</a>
      <p style="color:#666;margin-top:24px;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
      <p style="color:#666;margin-top:32px;font-size:12px">TheDayLaborers &mdash; A Blue Collar ME Company</p>
    </div>
    """
    await send_email(email, "Reset Your Password – TheDayLaborers", html)


async def send_job_cancelled_email(crew_email: str, crew_name: str, job_title: str, reason: str = ""):
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#050A30;padding:40px;border-radius:12px">
      <h1 style="color:#EF4444;font-size:24px;margin-bottom:8px">Job Update</h1>
      <p style="color:#fff">Hi {crew_name},</p>
      <p style="color:#ccc">The job <strong style="color:#7EC8E3">{job_title}</strong> has been updated by the contractor.</p>
      {f'<p style="color:#ccc">Reason: {reason}</p>' if reason else ''}
      <p style="color:#ccc">Please check the app for other available jobs in your area.</p>
      <a href="https://crew-workforce.preview.emergentagent.com/crew/dashboard" style="display:inline-block;background:#0000FF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px">Find More Jobs</a>
      <p style="color:#666;margin-top:32px;font-size:12px">TheDayLaborers &mdash; A Blue Collar ME Company</p>
    </div>
    """
    await send_email(crew_email, f"Job Update: {job_title}", html)


async def send_verified_contractor_email(email: str, name: str, company_name: str, fee: float):
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#050A30;padding:40px;border-radius:12px">
      <div style="text-align:center;margin-bottom:28px">
        <div style="display:inline-block;background:#10B981;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;text-align:center">&#10003;</div>
      </div>
      <h1 style="color:#10B981;font-size:26px;margin-bottom:8px;text-align:center">You Are Now a Verified Contractor!</h1>
      <p style="color:#fff;font-size:16px">Hi {name},</p>
      <p style="color:#ccc;font-size:15px;line-height:1.6">
        Congratulations! <strong style="color:#7EC8E3">{company_name or name}</strong> is now officially listed as a
        <strong style="color:#10B981">Verified Contractor</strong> on TheDayLaborers.
      </p>
      <div style="background:#000C66;border-radius:10px;padding:20px;margin:20px 0">
        <p style="color:#7EC8E3;font-weight:bold;margin:0 0 8px">What this means for you:</p>
        <ul style="color:#ccc;margin:0;padding-left:20px;line-height:2">
          <li>Your profile appears on the public <em>Find Verified Contractors</em> page</li>
          <li>A <strong style="color:#10B981">Verified</strong> badge is displayed on your profile</li>
          <li>Property owners, apartments and homeowners can find you directly</li>
          <li>No expiry &mdash; your status is permanent unless revoked</li>
        </ul>
      </div>
      <p style="color:#ccc;font-size:14px">One-time verification fee paid: <strong style="color:#FFD700">${fee:.2f}</strong></p>
      <div style="text-align:center;margin-top:24px">
        <a href="https://thedaylaborers.com/verified-contractors" style="display:inline-block;background:#0000FF;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:16px">View Your Verified Listing</a>
      </div>
      <p style="color:#666;margin-top:36px;font-size:12px;text-align:center">TheDayLaborers &mdash; A Blue Collar ME Company</p>
    </div>
    """
    await send_email(email, "You Are a Verified Contractor — TheDayLaborers", html)


async def send_revoke_verified_email(email: str, name: str, company_name: str, note: str = ""):
    html = f"""
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#050A30;padding:40px;border-radius:12px">
      <h1 style="color:#EF4444;font-size:24px;margin-bottom:8px">Verified Status Update</h1>
      <p style="color:#fff">Hi {name},</p>
      <p style="color:#ccc;line-height:1.6">
        Your <strong style="color:#7EC8E3">Verified Contractor</strong> status for
        <strong>{company_name or name}</strong> has been removed by an administrator.
      </p>
      {f'<div style="background:#1a0000;border-left:4px solid #EF4444;border-radius:6px;padding:14px;margin:16px 0"><p style="color:#fca5a5;margin:0"><strong>Reason:</strong> {note}</p></div>' if note else ''}
      <p style="color:#ccc;font-size:14px;line-height:1.6">
        If you believe this is a mistake or have questions, please reply to this email or contact support.
      </p>
      <a href="https://thedaylaborers.com/contractor/dashboard" style="display:inline-block;background:#0000FF;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px">Go to Dashboard</a>
      <p style="color:#666;margin-top:32px;font-size:12px">TheDayLaborers &mdash; A Blue Collar ME Company</p>
    </div>
    """
    await send_email(email, "Verified Contractor Status Removed — TheDayLaborers", html)
