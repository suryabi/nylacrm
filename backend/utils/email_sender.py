"""Best-effort transactional email sender (Resend).

Email is a best-effort side-channel (like the existing Slack notifications): it
never raises to the caller. Sends via Resend using the already-configured
RESEND_API_KEY + SENDER_EMAIL.

Required env vars:
    RESEND_API_KEY   Resend API key
    SENDER_EMAIL     verified From address (e.g. noreply@nylaairwater.earth)
"""
import os
import asyncio
import logging

logger = logging.getLogger("email_sender")


def _send_resend_sync(to: str, subject: str, html: str) -> None:
    import resend

    resend.api_key = os.environ["RESEND_API_KEY"]
    sender = os.environ.get("SENDER_EMAIL") or "onboarding@resend.dev"
    resend.Emails.send({
        "from": sender,
        "to": [to],
        "subject": subject,
        "html": html,
    })


async def send_email(to: str, subject: str, html: str, text: str = None) -> bool:
    """Send an email best-effort via Resend. Returns True if accepted."""
    if not to:
        return False
    if not os.environ.get("RESEND_API_KEY"):
        logger.info("Email not sent (RESEND_API_KEY not configured): %s", subject)
        return False
    try:
        await asyncio.to_thread(_send_resend_sync, to, subject, html)
        return True
    except Exception:
        logger.exception("Email send failed to %s", to)
        return False
