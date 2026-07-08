"""Per-account (customer) Zoho Books ledger / statement of accounts.

Pulls the customer's official Statement of Accounts live from Zoho Books as a
PDF, and exposes a WhatsApp share (signed public link) built on the existing
document-sharing framework.

Mounted under /api/accounts:
  GET  /accounts/{account_id}/statement/status   — connection + link state
  GET  /accounts/{account_id}/statement/pdf       — live Zoho statement PDF
  POST /accounts/{account_id}/statement/share-link — signed public link + wa.me
"""
from __future__ import annotations

import io
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from services import zoho_service, share_service

logger = logging.getLogger("account_ledger")
router = APIRouter()

DOC_TYPE = "account_statement"


async def _get_account(tenant_id: str, account_id: str) -> dict:
    acc = await db.accounts.find_one(
        {"id": account_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not acc:
        acc = await db.accounts.find_one(
            {"account_id": account_id, "tenant_id": tenant_id}, {"_id": 0}
        )
    if not acc:
        raise HTTPException(404, "Account not found")
    return acc


def _account_name(acc: dict) -> str:
    return acc.get("account_name") or acc.get("name") or "Customer"


def _statement_filename(acc: dict) -> str:
    safe = "".join(c for c in _account_name(acc) if c.isalnum() or c in (" ", "-", "_")).strip().replace(" ", "_")
    return f"statement_{safe or 'customer'}.pdf"


# ── Share resolver: pulls the live PDF from Zoho for the public signed link ──
async def _resolve_account_statement(tenant_id: str, document_id: str, context: dict):
    acc = await _get_account(tenant_id, document_id)
    contact_id = (acc.get("zoho_contact_id") or "").strip()
    if not contact_id:
        raise HTTPException(400, "This account is not linked to a Zoho customer.")

    async def fetch_pdf() -> bytes:
        return await zoho_service.get_contact_statement_pdf(tenant_id, contact_id)

    return {
        "title": f"Statement of Accounts — {_account_name(acc)}",
        "filename": _statement_filename(acc),
        "content_type": "application/pdf",
        "fetch_pdf": fetch_pdf,
    }


share_service.register_resolver(DOC_TYPE, _resolve_account_statement)


@router.get("/{account_id}/statement/status")
async def statement_status(account_id: str, current_user: dict = Depends(get_current_user)):
    """Lightweight state so the UI can decide what to render without downloading
    the PDF: is Zoho connected for this tenant, and is this account linked?"""
    tenant_id = get_current_tenant_id()
    acc = await _get_account(tenant_id, account_id)
    creds = await db.zoho_credentials.find_one(
        {"tenant_id": tenant_id}, {"_id": 0, "connection_status": 1}
    )
    zoho_connected = bool(creds) and (creds.get("connection_status") != "expired")
    contact_id = (acc.get("zoho_contact_id") or "").strip()

    # Best-effort WhatsApp destination number from the account / its contacts
    phone = (acc.get("phone") or acc.get("delivery_contact_phone") or "").strip()
    if not phone:
        contact = await db.entity_contacts.find_one(
            {"tenant_id": tenant_id, "parent_type": "account", "parent_id": account_id,
             "phone": {"$nin": [None, ""]}},
            {"_id": 0, "phone": 1},
        )
        if contact:
            phone = (contact.get("phone") or "").strip()

    return {
        "account_id": account_id,
        "account_name": _account_name(acc),
        "zoho_connected": zoho_connected,
        "zoho_connection_status": (creds or {}).get("connection_status") if creds else None,
        "linked": bool(contact_id),
        "zoho_contact_id": contact_id or None,
        "phone": phone or None,
    }


@router.get("/{account_id}/statement/pdf")
async def statement_pdf(account_id: str, current_user: dict = Depends(get_current_user)):
    """Live customer Statement of Accounts PDF, straight from Zoho Books."""
    tenant_id = get_current_tenant_id()
    acc = await _get_account(tenant_id, account_id)
    contact_id = (acc.get("zoho_contact_id") or "").strip()
    if not contact_id:
        raise HTTPException(400, "This account is not linked to a Zoho customer. Link it from the account's Zoho action first.")
    try:
        pdf_bytes = await zoho_service.get_contact_statement_pdf(tenant_id, contact_id)
    except RuntimeError as e:
        # not connected / refresh token missing
        raise HTTPException(409, str(e))
    except zoho_service.ZohoApiError as e:
        logger.warning("Zoho statement fetch failed for account %s: %s", account_id, e)
        raise HTTPException(502, "Zoho Books could not return this customer's statement right now.")
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{_statement_filename(acc)}"'},
    )


@router.post("/{account_id}/statement/share-link")
async def statement_share_link(account_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """Create a short-lived signed public link to the customer's statement PDF
    and return a ready-to-use WhatsApp deep link."""
    tenant_id = get_current_tenant_id()
    acc = await _get_account(tenant_id, account_id)
    contact_id = (acc.get("zoho_contact_id") or "").strip()
    if not contact_id:
        raise HTTPException(400, "This account is not linked to a Zoho customer.")

    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    base_url = (body or {}).get("base_url") or str(request.base_url)

    link = await share_service.create_share_link(
        tenant_id=tenant_id,
        document_type=DOC_TYPE,
        document_id=account_id,
        context={},
        title=f"Statement of Accounts — {_account_name(acc)}",
        filename=_statement_filename(acc),
        created_by=current_user.get("id"),
        content_type="application/pdf",
        ttl_days=7,
    )
    public_url = share_service.build_public_url(base_url, link["token"])

    phone = (acc.get("phone") or acc.get("delivery_contact_phone") or "").strip()
    digits = "".join(c for c in phone if c.isdigit())
    message = (
        f"Hello {_account_name(acc)}, please find your statement of accounts here: {public_url}"
    )
    from urllib.parse import quote
    wa_link = (f"https://wa.me/{digits}?text={quote(message)}" if digits
               else f"https://wa.me/?text={quote(message)}")

    await share_service.log_share_event(
        tenant_id=tenant_id, document_type=DOC_TYPE, document_id=account_id,
        channel="whatsapp", recipient={"phone": phone}, status="link_created",
        link_id=link["id"], sent_by=current_user.get("id"),
        sent_by_name=current_user.get("name"),
    )

    return {"public_url": public_url, "whatsapp_url": wa_link, "expires_at": link["expires_at"]}
