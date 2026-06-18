"""Document Sharing Framework — API (Phase 1.5: signed links + email + To/CC).

Endpoints (mounted under /api/share):
  GET  /share/recipients   — full RecipientPlan {to, cc, candidates, policy}
  POST /share              — share a document via email (To + CC lists)
  GET  /share/history      — share events for a document
  GET  /share/d/{token}    — PUBLIC signed download (no auth; token is the key)
  GET  /share/policies                 — list doc-type recipient policies (admin)
  PUT  /share/policies/{document_type}  — upsert a doc-type policy (admin)
"""
from __future__ import annotations

import io
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from services import share_service
import services.share_resolvers  # noqa: F401 — registers delivery_invoice / stock_transfer_doc / lead_proposal

logger = logging.getLogger("sharing")
router = APIRouter()

ADMIN_ROLES = {"CEO", "Director", "Admin", "System Admin"}


def _require_admin(user: dict):
    if (user.get("role") or "") not in ADMIN_ROLES:
        raise HTTPException(403, "Admin or CEO access required to manage sharing recipients.")


class Recipient(BaseModel):
    name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    role: Optional[str] = ""
    source: Optional[str] = ""


class ShareRequest(BaseModel):
    document_type: str
    document_id: str
    context: Optional[dict] = None
    channel: str = "email"
    to: List[Recipient] = []
    cc: List[Recipient] = []
    bcc: List[Recipient] = []
    subject: Optional[str] = None
    message: Optional[str] = None
    attach_pdf: bool = True
    base_url: Optional[str] = None


class PolicyUpdate(BaseModel):
    default_to: List[Recipient] = []
    default_cc: List[Recipient] = []
    default_bcc: List[Recipient] = []
    cc_manager: bool = False
    locked: List[str] = []


@router.get("/recipients")
async def get_share_recipients(
    document_type: str,
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Full RecipientPlan (To / CC / candidate pool / policy) for a document."""
    tenant_id = get_current_tenant_id()
    try:
        resolved = await share_service.resolve_document(tenant_id, document_type, document_id, {})
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e))
    plan = await share_service.resolve_recipient_plan(
        tenant_id, document_type, document_id, {}, current_user
    )
    return {"title": resolved.get("title"), **plan}


@router.post("")
async def share_document(req: ShareRequest, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if req.channel != "email":
        raise HTTPException(400, "Only email sharing is available right now. WhatsApp is coming soon.")

    to_emails = [r.email.strip() for r in req.to if r.email and r.email.strip()]
    cc_emails = [r.email.strip() for r in req.cc if r.email and r.email.strip()]
    bcc_emails = [r.email.strip() for r in req.bcc if r.email and r.email.strip()]
    if not to_emails:
        raise HTTPException(400, "At least one recipient (To) email address is required.")

    try:
        resolved = await share_service.resolve_document(
            tenant_id, req.document_type, req.document_id, req.context or {}
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e))

    title = resolved["title"]
    filename = resolved["filename"]
    content_type = resolved.get("content_type") or "application/pdf"

    link = await share_service.create_share_link(
        tenant_id=tenant_id,
        document_type=req.document_type,
        document_id=req.document_id,
        context=req.context or {},
        title=title,
        filename=filename,
        content_type=content_type,
        created_by=current_user.get("id"),
    )
    public_url = share_service.build_public_url(req.base_url, link["token"])

    pdf_bytes = None
    if req.attach_pdf:
        try:
            pdf_bytes = await resolved["fetch_pdf"]()
        except HTTPException as e:
            raise e
        except Exception as e:
            logger.warning("share: failed to render PDF for attachment (%s); sending link only. %s", title, e)
            pdf_bytes = None

    sender_name = current_user.get("name") or current_user.get("email") or "Nyla Air & Water"
    subject = req.subject or title
    ok, provider_id, error = await share_service.send_via_email(
        to_emails=to_emails,
        cc_emails=cc_emails,
        bcc_emails=bcc_emails,
        subject=subject,
        title=title,
        message=req.message or "",
        link=public_url,
        pdf_bytes=pdf_bytes,
        filename=filename,
        sender_name=sender_name,
        content_type=content_type,
    )

    await share_service.log_share_event(
        tenant_id=tenant_id,
        document_type=req.document_type,
        document_id=req.document_id,
        channel="email",
        recipient={"to": to_emails, "cc": cc_emails, "bcc": bcc_emails},
        status="sent" if ok else "failed",
        link_id=link["id"],
        provider_message_id=provider_id,
        error=error,
        sent_by=current_user.get("id"),
        sent_by_name=sender_name,
    )

    if not ok:
        raise HTTPException(502, f"Failed to send email: {error}")
    recipients_label = ", ".join(to_emails)
    return {
        "ok": True,
        "message": f"{title} sent to {recipients_label}" + (f" (cc {len(cc_emails)})" if cc_emails else ""),
        "share_link": public_url,
        "provider_message_id": provider_id,
    }


@router.get("/history")
async def get_share_history(
    document_type: str,
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    events = await db.share_events.find(
        {"tenant_id": tenant_id, "document_type": document_type, "document_id": document_id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)
    return {"events": events}


# ── Admin: per-document-type recipient policies ────────────────────────────
@router.get("/policies")
async def list_policies(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    out = []
    for meta in share_service.document_types_meta():
        policy = await share_service.get_policy(tenant_id, meta["document_type"])
        out.append({**meta, "policy": policy})
    return {"document_types": out}


@router.put("/policies/{document_type}")
async def update_policy(
    document_type: str, body: PolicyUpdate, current_user: dict = Depends(get_current_user)
):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    try:
        policy = await share_service.upsert_policy(
            tenant_id, document_type,
            {
                "default_to": [r.dict() for r in body.default_to],
                "default_cc": [r.dict() for r in body.default_cc],
                "default_bcc": [r.dict() for r in body.default_bcc],
                "cc_manager": body.cc_manager,
                "locked": body.locked,
            },
            current_user,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "policy": policy}


@router.get("/d/{token}")
async def public_download(token: str):
    """PUBLIC signed download — the token is the credential. No auth header."""
    link = await share_service.get_valid_link(token)
    if not link:
        raise HTTPException(404, "This share link is invalid or has expired.")
    try:
        resolved = await share_service.resolve_document(
            link["tenant_id"], link["document_type"], link["document_id"], link.get("context") or {}
        )
        pdf_bytes = await resolved["fetch_pdf"]()
    except HTTPException as e:
        raise e
    except Exception:
        logger.exception("share: public download failed for token")
        raise HTTPException(502, "The document could not be generated right now. Please try again later.")

    await share_service.record_download(token)
    filename = link.get("filename") or "document.pdf"
    media_type = link.get("content_type") or "application/pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
