"""Best-effort transactional email sender.

Tries Google Workspace / generic SMTP first (if SMTP_* env vars are set), then
falls back to Resend (if RESEND_API_KEY is set). All sending is non-blocking and
never raises to the caller — email is a best-effort side-channel, exactly like
the existing Slack notifications.

Required env vars for SMTP (e.g. Google Workspace via an App Password):
    SMTP_HOST       e.g. smtp.gmail.com
    SMTP_PORT       e.g. 587   (STARTTLS)
    SMTP_USER       a Workspace mailbox, e.g. notifications@yourdomain.com
    SMTP_PASSWORD   a Google App Password (needs 2-Step Verification on the account)
    SENDER_EMAIL    (optional) From address; defaults to SMTP_USER
"""
import os
import asyncio
import logging
import smtplib
from email.message import EmailMessage

logger = logging.getLogger("email_sender")


def smtp_configured() -> bool:
    return bool(
        os.environ.get("SMTP_HOST")
        and os.environ.get("SMTP_USER")
        and os.environ.get("SMTP_PASSWORD")
    )


def _send_smtp_sync(to: str, subject: str, html: str, text: str) -> None:
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ["SMTP_USER"]
    pwd = os.environ["SMTP_PASSWORD"]
    sender = os.environ.get("SENDER_EMAIL") or user

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text or "Please view this message in an HTML-capable email client.")
    if html:
        msg.add_alternative(html, subtype="html")

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=20) as server:
            server.login(user, pwd)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.login(user, pwd)
            server.send_message(msg)


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
    """Send an email best-effort. Returns True if a provider accepted it."""
    if not to:
        return False
    try:
        if smtp_configured():
            await asyncio.to_thread(_send_smtp_sync, to, subject, html, text)
            return True
        if os.environ.get("RESEND_API_KEY"):
            await asyncio.to_thread(_send_resend_sync, to, subject, html)
            return True
        logger.info("Email not sent (no SMTP/Resend configured): %s", subject)
        return False
    except Exception:
        logger.exception("Email send failed to %s", to)
        return False
