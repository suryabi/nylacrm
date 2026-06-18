"""Document Sharing Framework — resolvers for Zoho-backed documents.

Registers `delivery_invoice` (tax invoice / challan for a distributor delivery)
and `stock_transfer_doc` (invoice / challan for an inter-warehouse transfer).

Imported once at startup (from routes/sharing.py) so the resolvers register.
The driver-bundle resolver lives in routes/distributor_delivery_schedules.py.
"""
from __future__ import annotations

import logging
from fastapi import HTTPException

from database import db
from services import share_service
from services.zoho_service import fetch_invoice_pdf, fetch_delivery_challan_pdf

logger = logging.getLogger("share_resolvers")


async def _account_recipients(tenant_id: str, account_id: str) -> list:
    """Best-effort recipients for a delivery's account. Accounts carry phone
    numbers (great for WhatsApp later) and sometimes no email — the share
    dialog lets the user type the email when needed."""
    if not account_id:
        return []
    acct = await db.accounts.find_one(
        {"id": account_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not acct:
        return []
    out = []
    if acct.get("contact_name") or acct.get("contact_number"):
        out.append({
            "name": acct.get("contact_name") or acct.get("account_name"),
            "email": "",
            "phone": acct.get("contact_number") or "",
            "role": "Account contact",
        })
    if acct.get("delivery_contact_name") or acct.get("delivery_contact_phone"):
        out.append({
            "name": acct.get("delivery_contact_name") or "Delivery contact",
            "email": "",
            "phone": acct.get("delivery_contact_phone") or "",
            "role": "Delivery contact",
        })
    return out


async def _resolve_delivery_invoice(tenant_id: str, document_id: str, context: dict) -> dict:
    """document_id = delivery_id. Shares the delivery's Zoho tax invoice (or the
    delivery challan for promotional stock-outs)."""
    delivery = await db.distributor_deliveries.find_one(
        {"id": document_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not delivery:
        raise HTTPException(404, "Delivery not found")

    is_promo = bool(delivery.get("is_promo"))
    if is_promo:
        challan_id = delivery.get("zoho_doc_id")
        if not challan_id or delivery.get("zoho_sync_status") != "synced":
            raise HTTPException(400, "This delivery's challan has not been synced to Zoho yet.")
        number = delivery.get("zoho_doc_number") or delivery.get("challan_number") or document_id
        title = f"Delivery Challan {number}"

        async def _fetch():
            pdf, _ = await fetch_delivery_challan_pdf(tenant_id, challan_id)
            return pdf
    else:
        invoice_id = delivery.get("zoho_invoice_id")
        if not invoice_id:
            raise HTTPException(400, "No Zoho invoice has been generated for this delivery yet.")
        number = delivery.get("zoho_invoice_number") or document_id
        title = f"Invoice {number}"

        async def _fetch():
            pdf, _ = await fetch_invoice_pdf(tenant_id, invoice_id)
            return pdf

    recipients = await _account_recipients(tenant_id, delivery.get("account_id"))
    return {
        "title": title,
        "filename": f"{number}.pdf",
        "fetch_pdf": _fetch,
        "suggested_recipients": recipients,
    }


async def _resolve_stock_transfer_doc(tenant_id: str, document_id: str, context: dict) -> dict:
    """document_id = transfer_id. Shares the transfer's Zoho invoice or challan."""
    transfer = await db.distributor_stock_transfers.find_one(
        {"id": document_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not transfer:
        raise HTTPException(404, "Stock transfer not found")
    zoho_id = transfer.get("zoho_invoice_id")
    if not zoho_id or transfer.get("zoho_status") != "synced":
        raise HTTPException(400, "This transfer's document has not been synced to Zoho yet.")

    doc_type = transfer.get("zoho_doc_type") or "invoice"
    number = transfer.get("zoho_invoice_number") or transfer.get("transfer_number") or document_id
    is_challan = doc_type == "delivery_challan"
    title = f"{'Delivery Challan' if is_challan else 'Invoice'} {number}"

    async def _fetch():
        if is_challan:
            pdf, _ = await fetch_delivery_challan_pdf(tenant_id, zoho_id)
        else:
            pdf, _ = await fetch_invoice_pdf(tenant_id, zoho_id)
        return pdf

    # Recipient: destination distributor's contacts.
    recipients = []
    dest = await db.distributors.find_one(
        {"id": transfer.get("dest_distributor_id"), "tenant_id": tenant_id}, {"_id": 0}
    ) or {}
    if dest.get("primary_contact_email") or dest.get("primary_contact_mobile"):
        recipients.append({
            "name": dest.get("primary_contact_name") or dest.get("distributor_name"),
            "email": dest.get("primary_contact_email") or "",
            "phone": dest.get("primary_contact_mobile") or "",
            "role": "Destination distributor",
        })
    return {
        "title": title,
        "filename": f"{number}.pdf",
        "fetch_pdf": _fetch,
        "suggested_recipients": recipients,
    }


import base64
from services import recipient_providers as rp


async def _resolve_lead_proposal(tenant_id: str, document_id: str, context: dict) -> dict:
    """document_id = lead_id. Shares the lead's APPROVED proposal document."""
    proposal = await db.lead_proposals.find_one(
        {"lead_id": document_id, "tenant_id": tenant_id}, {"_id": 0}
    ) or await db.lead_proposals.find_one({"lead_id": document_id}, {"_id": 0})
    if not proposal:
        raise HTTPException(404, "No proposal found for this lead.")
    if proposal.get("status") and proposal.get("status") != "approved":
        raise HTTPException(400, "Only an approved proposal can be shared.")
    file_data = proposal.get("file_data")
    if not file_data:
        raise HTTPException(400, "Proposal file is empty.")
    filename = proposal.get("file_name") or "proposal.pdf"
    content_type = proposal.get("content_type") or "application/pdf"

    async def _fetch():
        return base64.b64decode(file_data)

    return {
        "title": f"Proposal — {filename}",
        "filename": filename,
        "content_type": content_type,
        "fetch_pdf": _fetch,
        "suggested_recipients": [],
    }


# ── Recipient resolvers (To / CC / candidate pool) ─────────────────────────
async def _rcpt_delivery_invoice(tenant_id, document_id, context, current_user):
    delivery = await db.distributor_deliveries.find_one(
        {"id": document_id, "tenant_id": tenant_id}, {"_id": 0, "account_id": 1})
    to = await rp.account_contacts(tenant_id, (delivery or {}).get("account_id")) if delivery else []
    return {"to": to, "cc": [], "candidates": to}


async def _rcpt_stock_transfer_doc(tenant_id, document_id, context, current_user):
    transfer = await db.distributor_stock_transfers.find_one(
        {"id": document_id, "tenant_id": tenant_id}, {"_id": 0, "dest_distributor_id": 1})
    to = await rp.distributor_contacts(tenant_id, (transfer or {}).get("dest_distributor_id")) if transfer else []
    return {"to": to, "cc": [], "candidates": to}


async def _rcpt_lead_proposal(tenant_id, document_id, context, current_user):
    """To = the lead's contacts; CC = manager (via cc_manager policy). Preserves
    the old proposal email's default subject + signed message body."""
    lead = await db.leads.find_one({"id": document_id, "tenant_id": tenant_id}, {"_id": 0})
    to = await rp.lead_contacts(tenant_id, document_id)
    extra = []
    if lead and lead.get("converted_to_account"):
        extra = await rp.account_contacts(tenant_id, lead["converted_to_account"])

    u = current_user or {}
    company = (lead or {}).get("company") or "your company"
    default_message = (
        f"Dear Sir/Madam,\n\n"
        f"Please find attached the proposal for {company}. We look forward to your "
        f"feedback and the opportunity to serve you.\n\n"
        f"If you have any questions or need further information, please feel free to reach out.\n\n"
        f"Best Regards,\n{u.get('name') or ''}\n{u.get('phone') or u.get('mobile') or ''}\n{u.get('email') or ''}"
    )
    return {
        "to": to, "cc": [], "candidates": to + extra,
        "default_subject": "Nyla Air Water - Proposal for review",
        "default_message": default_message,
    }


share_service.register_resolver("delivery_invoice", _resolve_delivery_invoice)
share_service.register_resolver("stock_transfer_doc", _resolve_stock_transfer_doc)
share_service.register_resolver("lead_proposal", _resolve_lead_proposal)

share_service.register_recipient_resolver(
    "delivery_invoice", _rcpt_delivery_invoice,
    label="Delivery Invoice", description="Tax invoice / challan for a distributor delivery.",
    sources=["Account contacts", "Delivery contact"], default_cc_manager=False,
)
share_service.register_recipient_resolver(
    "stock_transfer_doc", _rcpt_stock_transfer_doc,
    label="Stock Transfer Document", description="Invoice / challan for an inter-warehouse transfer.",
    sources=["Destination distributor contacts"], default_cc_manager=False,
)
share_service.register_recipient_resolver(
    "lead_proposal", _rcpt_lead_proposal,
    label="Lead Proposal", description="Proposal document shared with a lead/customer.",
    sources=["Lead contacts", "Account contacts"], default_cc_manager=True,
)
