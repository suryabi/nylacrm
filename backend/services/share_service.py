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
# document_type -> async resolver(tenant_id, document_id, context, current_user) -> RecipientPlan
_RECIPIENT_RESOLVERS: dict = {}
# document_type -> {label, description, sources, default_cc_manager}
_DOC_TYPE_META: dict = {}


def register_resolver(document_type: str, fn) -> None:
    """Register a document (PDF) resolver. Called by domain modules at import."""
    _RESOLVERS[document_type] = fn
    logger.info("share_service: registered resolver for %s", document_type)


def register_recipient_resolver(
    document_type: str, fn, *, label: str, description: str = "",
    sources: list | None = None, default_cc_manager: bool = False,
) -> None:
    """Register a recipient resolver + document-type metadata (used by the
    admin policy screen). fn(tenant_id, document_id, context, current_user)
    returns {to, cc, candidates}."""
    _RECIPIENT_RESOLVERS[document_type] = fn
    _DOC_TYPE_META[document_type] = {
        "document_type": document_type,
        "label": label,
        "description": description,
        "sources": sources or [],
        "default_cc_manager": default_cc_manager,
    }
    logger.info("share_service: registered recipient resolver for %s", document_type)


def document_types_meta() -> list:
    return [_DOC_TYPE_META[k] for k in sorted(_DOC_TYPE_META.keys())]


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
    content_type: str = "application/pdf",
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
        "content_type": content_type,
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
# Recipient plans (To / CC) + per-document-type policy config
# ──────────────────────────────────────────────────────────────────────────
def _dedupe_by_email(items: list) -> list:
    seen, out = set(), []
    for r in items:
        email = (r.get("email") or "").strip().lower()
        key = email or f"phone:{(r.get('phone') or '').strip()}"
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


async def get_policy(tenant_id: str, document_type: str) -> dict:
    """The tenant's configured recipient policy for a document type (or
    defaults). cc_manager defaults to the resolver's declared default."""
    meta = _DOC_TYPE_META.get(document_type, {})
    saved = await db.share_recipient_policies.find_one(
        {"tenant_id": tenant_id, "document_type": document_type}, {"_id": 0}
    ) or {}
    cc_manager = saved.get("cc_manager")
    if cc_manager is None:
        cc_manager = meta.get("default_cc_manager", False)
    return {
        "document_type": document_type,
        "default_to": saved.get("default_to", []),
        "default_cc": saved.get("default_cc", []),
        "default_bcc": saved.get("default_bcc", []),
        "cc_manager": bool(cc_manager),
        "locked": saved.get("locked", []),
    }


async def upsert_policy(tenant_id: str, document_type: str, data: dict, user: dict) -> dict:
    if document_type not in _DOC_TYPE_META:
        raise ValueError(f"Unknown document type '{document_type}'.")
    update = {
        "tenant_id": tenant_id,
        "document_type": document_type,
        "default_to": data.get("default_to", []),
        "default_cc": data.get("default_cc", []),
        "default_bcc": data.get("default_bcc", []),
        "cc_manager": bool(data.get("cc_manager", False)),
        "locked": [str(x).strip().lower() for x in (data.get("locked") or []) if str(x).strip()],
        "updated_at": _now().isoformat(),
        "updated_by": (user or {}).get("id"),
    }
    await db.share_recipient_policies.update_one(
        {"tenant_id": tenant_id, "document_type": document_type},
        {"$set": update}, upsert=True,
    )
    return await get_policy(tenant_id, document_type)


async def resolve_recipient_plan(
    tenant_id: str, document_type: str, document_id: str,
    context: dict | None, current_user: dict,
) -> dict:
    """Build the full RecipientPlan {to, cc, candidates, policy} for a document:
    the per-module resolver supplies dynamic To/CC/candidates, then the tenant's
    configured policy (default To/CC, cc_manager, locked) is merged in."""
    fn = _RECIPIENT_RESOLVERS.get(document_type)
    base = {"to": [], "cc": [], "candidates": []}
    if fn:
        try:
            base = await fn(tenant_id, document_id, context or {}, current_user) or base
        except Exception:
            logger.exception("share_service: recipient resolver failed for %s", document_type)

    from services import recipient_providers as rp
    policy = await get_policy(tenant_id, document_type)

    to = list(base.get("to") or [])
    cc = list(base.get("cc") or [])
    bcc = list(base.get("bcc") or [])
    candidates = list(base.get("candidates") or []) + to + cc

    # Configured tenant defaults.
    for r in policy["default_to"]:
        to.append({**r, "source": "configured", "role": r.get("role") or "Configured"})
    for r in policy["default_cc"]:
        cc.append({**r, "source": "configured", "role": r.get("role") or "Configured"})
    for r in policy["default_bcc"]:
        bcc.append({**r, "source": "configured", "role": r.get("role") or "Configured"})

    # Manager CC (per-document-type, configurable).
    if policy["cc_manager"]:
        mgr = await rp.reporting_manager(tenant_id, current_user)
        cc = mgr + rp.self_recipient(current_user) + cc

    to = _dedupe_by_email(to)
    cc = _dedupe_by_email(cc)
    bcc = _dedupe_by_email(bcc)
    to_emails = {(r.get("email") or "").strip().lower() for r in to if r.get("email")}
    cc = [r for r in cc if (r.get("email") or "").strip().lower() not in to_emails]
    cc_emails = to_emails | {(r.get("email") or "").strip().lower() for r in cc if r.get("email")}
    bcc = [r for r in bcc if (r.get("email") or "").strip().lower() not in cc_emails]
    candidates = _dedupe_by_email(candidates + cc)

    return {
        "to": to,
        "cc": cc,
        "bcc": bcc,
        "candidates": candidates,
        "default_subject": base.get("default_subject"),
        "default_message": base.get("default_message"),
        "policy": {
            "allow_manual_add": True,
            "allow_remove": True,
            "min_to": 1,
            "locked": policy["locked"],
            "cc_manager": policy["cc_manager"],
        },
    }


# ──────────────────────────────────────────────────────────────────────────
# Email channel (Resend — already configured; supports attachments)
# ──────────────────────────────────────────────────────────────────────────
def _send_email_sync(to_list, subject, html, attachments=None, cc=None, bcc=None):
    import resend
    resend.api_key = os.environ["RESEND_API_KEY"]
    sender = os.environ.get("SENDER_EMAIL") or "onboarding@resend.dev"
    params = {"from": sender, "to": to_list, "subject": subject, "html": html}
    if attachments:
        params["attachments"] = attachments
    if cc:
        params["cc"] = cc
    if bcc:
        params["bcc"] = bcc
    return resend.Emails.send(params)


def _email_html(*, title: str, message: str, link: str, sender_name: str, message_is_html: bool = False) -> str:
    if message_is_html:
        # Rich-text body from the composer (already HTML). Render as-is inside a
        # styled wrapper so author formatting (bold, lists, links) is preserved.
        msg_block = (
            f'<div style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">{message}</div>'
            if (message or "").strip() else ''
        )
    else:
        msg_html = (message or "").replace("\n", "<br>")
        msg_block = (
            f'<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">{msg_html}</p>'
            if msg_html else ''
        )
    return f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;max-width:560px;">
      <h2 style="margin:0 0 12px;font-size:18px;">{title}</h2>
      {msg_block}
      <a href="{link}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;">Download document</a>
      <p style="margin:18px 0 0;color:#64748b;font-size:12px;line-height:1.5;">The document is also attached to this email. This download link expires in 7 days.</p>
      <p style="margin:14px 0 0;color:#94a3b8;font-size:12px;">Shared by {sender_name} · Nyla Air &amp; Water</p>
    </div>
    """


async def send_via_email(
    *, to_emails: list, cc_emails: list | None, bcc_emails: list | None = None,
    subject: str, title: str, message: str, link: str,
    pdf_bytes: bytes | None, filename: str, sender_name: str, content_type: str = "application/pdf",
    message_is_html: bool = False,
) -> tuple[bool, str | None, str | None]:
    """Send the document via email (link + optional attachment) to multiple To +
    CC + BCC recipients. Returns (ok, provider_message_id, error)."""
    if not os.environ.get("RESEND_API_KEY"):
        return False, None, "Email service not configured (RESEND_API_KEY missing)."
    to_emails = [e for e in (to_emails or []) if e]
    cc_emails = [e for e in (cc_emails or []) if e and e not in to_emails]
    _seen = set(to_emails) | set(cc_emails)
    bcc_emails = [e for e in (bcc_emails or []) if e and e not in _seen]
    if not to_emails:
        return False, None, "At least one recipient email is required."
    attachments = None
    if pdf_bytes:
        attachments = [{
            "filename": filename,
            "content": base64.b64encode(pdf_bytes).decode("ascii"),
            "content_type": content_type or "application/pdf",
        }]
    html = _email_html(title=title, message=message, link=link, sender_name=sender_name, message_is_html=message_is_html)
    try:
        res = await asyncio.to_thread(
            _send_email_sync, to_emails, subject, html, attachments, cc_emails or None, bcc_emails or None)
        return True, (res or {}).get("id"), None
    except Exception as e:
        logger.exception("share_service: email send failed to %s", to_emails)
        return False, None, str(e)[:300]


def build_public_url(base_url: str | None, token: str) -> str:
    """Build the absolute public download URL. Prefer the caller-supplied base
    (the frontend's REACT_APP_BACKEND_URL), then the request's ingress host,
    then APP_BASE_URL env, else a relative path."""
    from core.tenant import get_current_base_url
    base = (base_url or get_current_base_url() or "").strip().rstrip("/")
    path = f"/api/share/d/{token}"
    if base.startswith("http://") or base.startswith("https://"):
        return f"{base}{path}"
    return path
