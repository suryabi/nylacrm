"""Document Sharing Framework — API (Phase 1: signed links + email).

Endpoints (mounted under /api/share):
  GET  /share/recipients   — suggested recipients for a document (authed)
  POST /share              — share a document via a channel (authed)
  GET  /share/history      — share events for a document (authed)
  GET  /share/d/{token}    — PUBLIC signed download (no auth; token is the key)
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
import services.share_resolvers  # noqa: F401 — registers delivery_invoice + stock_transfer_doc

logger = logging.getLogger("sharing")
router = APIRouter()


class Recipient(BaseModel):
    name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    role: Optional[str] = ""


class ShareRequest(BaseModel):
    document_type: str
    document_id: str
    context: Optional[dict] = None
    channel: str = "email"               # Phase 1: email only
    recipient: Recipient
    subject: Optional[str] = None
    message: Optional[str] = None
    attach_pdf: bool = True              # attach the PDF in addition to the link
    base_url: Optional[str] = None       # frontend's REACT_APP_BACKEND_URL (env-correct link)


@router.get("/recipients")
async def get_share_recipients(
    document_type: str,
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Suggested recipients (name/email/phone) for a document."""
    tenant_id = get_current_tenant_id()
    try:
        resolved = await share_service.resolve_document(tenant_id, document_type, document_id, {})
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {
        "title": resolved.get("title"),
        "recipients": resolved.get("suggested_recipients") or [],
    }


@router.post("")
async def share_document(req: ShareRequest, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if req.channel != "email":
        raise HTTPException(400, "Only email sharing is available right now. WhatsApp is coming soon.")
    if not (req.recipient and req.recipient.email):
        raise HTTPException(400, "A recipient email address is required.")

    # Resolve the document (cheap — does not render the PDF yet).
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

    # Create the signed public link.
    link = await share_service.create_share_link(
        tenant_id=tenant_id,
        document_type=req.document_type,
        document_id=req.document_id,
        context=req.context or {},
        title=title,
        filename=filename,
        created_by=current_user.get("id"),
    )
    public_url = share_service.build_public_url(req.base_url, link["token"])

    # Render the PDF only if we're attaching it.
    pdf_bytes = None
    if req.attach_pdf:
        try:
            pdf_bytes = await resolved["fetch_pdf"]()
        except HTTPException as e:
            raise e
        except Exception as e:
            logger.warning("share: failed to render PDF for attachment (%s); sending link only. %s", title, e)
            pdf_bytes = None  # fall back to link-only

    sender_name = current_user.get("name") or current_user.get("email") or "Nyla Air & Water"
    subject = req.subject or title
    ok, provider_id, error = await share_service.send_via_email(
        to_email=req.recipient.email,
        subject=subject,
        title=title,
        message=req.message or "",
        link=public_url,
        pdf_bytes=pdf_bytes,
        filename=filename,
        sender_name=sender_name,
    )

    await share_service.log_share_event(
        tenant_id=tenant_id,
        document_type=req.document_type,
        document_id=req.document_id,
        channel="email",
        recipient=req.recipient.dict(),
        status="sent" if ok else "failed",
        link_id=link["id"],
        provider_message_id=provider_id,
        error=error,
        sent_by=current_user.get("id"),
        sent_by_name=sender_name,
    )

    if not ok:
        raise HTTPException(502, f"Failed to send email: {error}")
    return {
        "ok": True,
        "message": f"{title} sent to {req.recipient.email}",
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
    except Exception as e:
        logger.exception("share: public download failed for token")
        raise HTTPException(502, "The document could not be generated right now. Please try again later.")

    await share_service.record_download(token)
    filename = link.get("filename") or "document.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
