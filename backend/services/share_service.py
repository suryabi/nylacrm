"""Document Sharing Framework — Phase 1 (signed links + email).

Reusable across the whole app: any module registers a *resolver* for its
document type, and the share API + signed public-link endpoint work for it
without further changes. See /app/memory/SHARE_FRAMEWORK_DESIGN.md.

A resolver, given (tenant_id, document_id, context), returns a `ResolvedDoc`:
    {
      "title": str,                 # human label, e.g. "Invoice INV-00017"
      "filename": str,              # e.g. "INV-00017.pdf"
      "fetch_pdf": async () -> bytes,   # LAZY — only called when bytes are needed
      "suggested_recipients": [ {name, email, phone, role} ],
    }

Everything here is tenant-scoped via the explicit `tenant_id` passed in (the
public download endpoint has no auth context, so resolvers must never rely on
a context-var tenant).
"""
from __future__ import annotations

import os
import base64
import logging
import secrets
import asyncio
from datetime import datetime, timezone, timedelta

from database import db

logger = logging.getLogger("share_service")

# document_type -> async resolver(tenant_id, document_id, context) -> ResolvedDoc
_RESOLVERS: dict = {}


def register_resolver(document_type: str, fn) -> None:
    """Register a document resolver. Called by domain modules at import time."""
    _RESOLVERS[document_type] = fn
    logger.info("share_service: registered resolver for %s", document_type)


def supported_types() -> list:
    return sorted(_RESOLVERS.keys())


async def resolve_document(tenant_id: str, document_type: str, document_id: str, context: dict | None = None) -> dict:
    fn = _RESOLVERS.get(document_type)
    if not fn:
        raise ValueError(f"No share resolver registered for document type '{document_type}'.")
    resolved = await fn(tenant_id, document_id, context or {})
    if not resolved or not resolved.get("fetch_pdf"):
        raise ValueError("Document could not be resolved for sharing.")
    return resolved


# ──────────────────────────────────────────────────────────────────────────
# Signed links
# ──────────────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


async def create_share_link(
    *, tenant_id: str, document_type: str, document_id: str, context: dict | None,
    title: str, filename: str, created_by: str | None,
    ttl_days: int = 7, max_downloads: int | None = None,
) -> dict:
    """Create a short-lived signed link record. The token IS the credential for
    the public download endpoint — no auth header required."""
    token = secrets.token_urlsafe(32)
    now = _now()
    doc = {
        "id": secrets.token_hex(12),
        "token": token,
        "tenant_id": tenant_id,
        "document_type": document_type,
        "document_id": document_id,
        "context": context or {},
        "title": title,
        "filename": filename,
        "created_by": created_by,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=ttl_days)).isoformat(),
        "max_downloads": max_downloads,
        "download_count": 0,
        "revoked": False,
    }
    await db.share_links.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def get_valid_link(token: str) -> dict | None:
    """Return the link record iff it exists, isn't revoked, hasn't expired and
    hasn't exceeded its download cap. Otherwise None."""
    link = await db.share_links.find_one({"token": token}, {"_id": 0})
    if not link or link.get("revoked"):
        return None
    try:
        if _now() > datetime.fromisoformat(link["expires_at"]):
            return None
    except Exception:
        return None
    cap = link.get("max_downloads")
    if cap is not None and int(link.get("download_count") or 0) >= int(cap):
        return None
    return link


async def record_download(token: str) -> None:
    await db.share_links.update_one(
        {"token": token},
        {"$inc": {"download_count": 1}, "$set": {"last_downloaded_at": _now().isoformat()}},
    )


# ──────────────────────────────────────────────────────────────────────────
# Audit
# ──────────────────────────────────────────────────────────────────────────
async def log_share_event(
    *, tenant_id: str, document_type: str, document_id: str, channel: str,
    recipient: dict, status: str, link_id: str | None = None,
    provider_message_id: str | None = None, error: str | None = None,
    sent_by: str | None = None, sent_by_name: str | None = None,
) -> str:
    event = {
        "id": secrets.token_hex(12),
        "tenant_id": tenant_id,
        "document_type": document_type,
        "document_id": document_id,
        "channel": channel,
        "recipient": recipient,
        "status": status,
        "link_id": link_id,
        "provider_message_id": provider_message_id,
        "error": error,
        "sent_by": sent_by,
        "sent_by_name": sent_by_name,
        "created_at": _now().isoformat(),
    }
    try:
        await db.share_events.insert_one(dict(event))
    except Exception:
        logger.exception("share_service: failed to write share event")
    return event["id"]


# ──────────────────────────────────────────────────────────────────────────
# Email channel (Resend — already configured; supports attachments)
# ──────────────────────────────────────────────────────────────────────────
def _send_email_sync(to_list, subject, html, attachments=None, cc=None):
    import resend
    resend.api_key = os.environ["RESEND_API_KEY"]
    sender = os.environ.get("SENDER_EMAIL") or "onboarding@resend.dev"
    params = {"from": sender, "to": to_list, "subject": subject, "html": html}
    if attachments:
        params["attachments"] = attachments
    if cc:
        params["cc"] = cc
    return resend.Emails.send(params)


def _email_html(*, title: str, message: str, link: str, sender_name: str) -> str:
    msg_html = (message or "").replace("\n", "<br>")
    return f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;max-width:560px;">
      <h2 style="margin:0 0 12px;font-size:18px;">{title}</h2>
      {f'<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">{msg_html}</p>' if msg_html else ''}
      <a href="{link}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;">Download document</a>
      <p style="margin:18px 0 0;color:#64748b;font-size:12px;line-height:1.5;">The document is also attached to this email. This download link expires in 7 days.</p>
      <p style="margin:14px 0 0;color:#94a3b8;font-size:12px;">Shared by {sender_name} · Nyla Air &amp; Water</p>
    </div>
    """


async def send_via_email(
    *, to_email: str, subject: str, title: str, message: str, link: str,
    pdf_bytes: bytes | None, filename: str, sender_name: str, cc: list | None = None,
) -> tuple[bool, str | None, str | None]:
    """Send the document via email (link + optional PDF attachment).
    Returns (ok, provider_message_id, error)."""
    if not os.environ.get("RESEND_API_KEY"):
        return False, None, "Email service not configured (RESEND_API_KEY missing)."
    if not to_email:
        return False, None, "Recipient email is required."
    attachments = None
    if pdf_bytes:
        attachments = [{
            "filename": filename,
            "content": base64.b64encode(pdf_bytes).decode("ascii"),
            "content_type": "application/pdf",
        }]
    html = _email_html(title=title, message=message, link=link, sender_name=sender_name)
    try:
        res = await asyncio.to_thread(_send_email_sync, [to_email], subject, html, attachments, cc)
        return True, (res or {}).get("id"), None
    except Exception as e:
        logger.exception("share_service: email send failed to %s", to_email)
        return False, None, str(e)[:300]


def build_public_url(base_url: str | None, token: str) -> str:
    """Build the absolute public download URL. Prefer the caller-supplied base
    (the frontend's REACT_APP_BACKEND_URL, so it's environment-correct), then
    APP_BASE_URL env, else a relative path."""
    base = (base_url or os.environ.get("APP_BASE_URL") or "").strip().rstrip("/")
    path = f"/api/share/d/{token}"
    if base.startswith("http://") or base.startswith("https://"):
        return f"{base}{path}"
    return path
