"""
Credit Notes Routes
Auto-generated from approved returns, applied to deliveries
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from pydantic import BaseModel, Field
from fastapi import UploadFile, File, Form
from fastapi.responses import Response

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from models.credit_note import CreditNote, CreditNoteApplication
from utils.storage import put_object, get_object

router = APIRouter(tags=["Credit Notes"])
logger = logging.getLogger(__name__)


# ==========================================
# Standalone Credit Issuance to Customer
# (independent of any delivery)
# ==========================================

ISSUANCE_APPROVER_ROLES = {'ceo', 'system admin', 'admin'}


class CreditIssuanceCreate(BaseModel):
    reason: str = Field(..., min_length=1)
    issuance_method: str = Field(..., min_length=1)  # cash | bank_transfer | store_credit | cheque | other
    reference: Optional[str] = None
    attachment_path: Optional[str] = None
    attachment_filename: Optional[str] = None


class CreditIssuanceReject(BaseModel):
    rejection_reason: str = Field(..., min_length=1)


class CreditIssuanceMarkIssued(BaseModel):
    issued_to: Optional[str] = None
    issuance_date: Optional[str] = None  # YYYY-MM-DD; defaults to today


def _is_issuance_approver(user: dict) -> bool:
    return (user.get('role') or '').strip().lower() in ISSUANCE_APPROVER_ROLES


async def _get_credit_note_or_404(tenant_id: str, distributor_id: str, credit_note_id: str) -> dict:
    cn = await db.credit_notes.find_one(
        {"id": credit_note_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not cn:
        raise HTTPException(status_code=404, detail="Credit note not found")
    return cn


async def _recalculate_credit_note_status(tenant_id: str, credit_note_id: str):
    """Recompute applied/balance/status for a credit note based on current
    delivery applications + approved (non-cancelled) standalone issuances.
    Standalone issuances reduce the balance from the moment they are approved.

    Also propagates the status change to the linked customer return so the
    Returns list shows `credit_issued` once the credit note is fully drained,
    and reverts to `approved` if the issuance is later cancelled — matching
    the delivery-application behaviour in apply_credit_note_to_delivery /
    revert_credit_note_application.
    """
    cn = await db.credit_notes.find_one({"id": credit_note_id, "tenant_id": tenant_id}, {"_id": 0})
    if not cn:
        return
    delivery_applied = sum(app.get('amount_applied', 0) for app in (cn.get('applications') or []))
    issuances = await db.credit_note_issuances.find(
        {"tenant_id": tenant_id, "credit_note_id": credit_note_id,
         "status": {"$in": ["approved", "issued"]}},
        {"_id": 0, "amount": 1}
    ).to_list(500)
    issuance_applied = sum(i.get('amount', 0) for i in issuances)
    total_applied = round(delivery_applied + issuance_applied, 2)
    original = cn.get('original_amount', 0) or 0
    balance = round(max(0, original - total_applied), 2)
    if total_applied <= 0:
        status = "pending"
    elif balance <= 0.001:
        status = "fully_applied"
    else:
        status = "partially_applied"
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.credit_notes.update_one(
        {"id": credit_note_id, "tenant_id": tenant_id},
        {"$set": {
            "applied_amount": total_applied,
            "balance_amount": balance,
            "status": status,
            "updated_at": now_iso,
        }}
    )

    # Propagate to the linked return:
    #   - fully_applied with all issuances "issued"  → credit_issued (final)
    #   - fully_applied with some issuance still in "approved" but not yet
    #     handed over → direct_payment_approved (intermediate)
    #   - rolled back (less than fully_applied) → revert to approved
    return_id = cn.get('return_id')
    if not return_id:
        return
    ret = await db.customer_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id},
        {"_id": 0, "status": 1}
    )
    if not ret:
        return
    return_status = ret.get('status')

    # Are any approved-but-not-issued issuances still pending physical handover?
    has_unissued_approved = await db.credit_note_issuances.find_one(
        {"tenant_id": tenant_id, "credit_note_id": credit_note_id, "status": "approved"},
        {"_id": 0, "id": 1}
    ) is not None

    if status == "fully_applied":
        # All credit committed. Decide between direct_payment_approved vs credit_issued.
        target_status = "direct_payment_approved" if has_unissued_approved else "credit_issued"
        if return_status != target_status and return_status not in ("settled",):
            update_set: dict = {
                "status": target_status,
                "credit_note_id": credit_note_id,
                "credit_note_number": cn.get('credit_note_number'),
                "updated_at": now_iso,
            }
            if target_status == "credit_issued":
                update_set["credit_issued_at"] = now_iso
            else:
                # entering intermediate state — clear any previously-set issued timestamp
                update_set["credit_issued_at"] = None
            await db.customer_returns.update_one(
                {"id": return_id, "tenant_id": tenant_id},
                {"$set": update_set},
            )
            logger.info(
                f"Return {cn.get('return_number')} → {target_status} "
                f"(CN {cn.get('credit_note_number')} fully applied)"
            )
    elif return_status in ("credit_issued", "direct_payment_approved"):
        # CN no longer fully applied — revert
        await db.customer_returns.update_one(
            {"id": return_id, "tenant_id": tenant_id},
            {"$set": {
                "status": "approved",
                "credit_issued_to_delivery_id": None,
                "credit_issued_to_delivery_number": None,
                "credit_issued_at": None,
                "updated_at": now_iso,
            }}
        )
        logger.info(
            f"Return {cn.get('return_number')} reverted to approved (CN {cn.get('credit_note_number')} no longer fully applied)"
        )


@router.post("/{distributor_id}/credit-notes/{credit_note_id}/issuances/upload-attachment")
async def upload_issuance_attachment(
    distributor_id: str,
    credit_note_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload an optional attachment for a credit-note issuance request."""
    tenant_id = get_current_tenant_id()
    cn = await _get_credit_note_or_404(tenant_id, distributor_id, credit_note_id)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Attachment too large (max 10 MB)")
    safe_name = (file.filename or "attachment").replace("/", "_").replace("\\", "_")
    storage_path = (
        f"nyla-crm/credit-note-issuances/{distributor_id}/{credit_note_id}/"
        f"{uuid.uuid4()}-{safe_name}"
    )
    await put_object(storage_path, contents, file.content_type or "application/octet-stream")
    logger.info(
        f"Uploaded issuance attachment for CN {cn.get('credit_note_number')} "
        f"({len(contents)} bytes) by {current_user['email']}"
    )
    return {
        "attachment_path": storage_path,
        "attachment_filename": safe_name,
        "size": len(contents)
    }


@router.get("/{distributor_id}/credit-notes/{credit_note_id}/issuances/{issuance_id}/attachment")
async def download_issuance_attachment(
    distributor_id: str,
    credit_note_id: str,
    issuance_id: str,
    current_user: dict = Depends(get_current_user)
):
    tenant_id = get_current_tenant_id()
    issuance = await db.credit_note_issuances.find_one(
        {"id": issuance_id, "tenant_id": tenant_id,
         "distributor_id": distributor_id, "credit_note_id": credit_note_id},
        {"_id": 0}
    )
    if not issuance or not issuance.get("attachment_path"):
        raise HTTPException(status_code=404, detail="Attachment not found")
    content, content_type = await get_object(issuance["attachment_path"])
    headers = {
        "Content-Disposition": f'attachment; filename="{issuance.get("attachment_filename") or "attachment"}"'
    }
    return Response(content=content, media_type=content_type, headers=headers)


@router.get("/{distributor_id}/credit-notes/{credit_note_id}/issuances")
async def list_credit_issuances(
    distributor_id: str,
    credit_note_id: str,
    current_user: dict = Depends(get_current_user)
):
    tenant_id = get_current_tenant_id()
    await _get_credit_note_or_404(tenant_id, distributor_id, credit_note_id)
    issuances = await db.credit_note_issuances.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id,
         "credit_note_id": credit_note_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"issuances": issuances, "total": len(issuances)}


@router.post("/{distributor_id}/credit-notes/{credit_note_id}/issuances")
async def create_credit_issuance(
    distributor_id: str,
    credit_note_id: str,
    data: CreditIssuanceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Submit a request to issue credit directly to the customer
    (standalone, not tied to a delivery). The ENTIRE current balance is issued
    in one go — partial issuances are not supported. Goes to approval queue."""
    tenant_id = get_current_tenant_id()
    cn = await _get_credit_note_or_404(tenant_id, distributor_id, credit_note_id)

    if cn.get('status') == 'cancelled':
        raise HTTPException(status_code=400, detail="Credit note is cancelled")

    # Block duplicate requests if there is already one pending or approved
    open_issuance = await db.credit_note_issuances.find_one(
        {"tenant_id": tenant_id, "credit_note_id": credit_note_id,
         "status": {"$in": ["pending_approval", "approved"]}},
        {"_id": 0, "id": 1, "status": 1}
    )
    if open_issuance:
        raise HTTPException(
            status_code=400,
            detail=f"An issuance is already {open_issuance['status'].replace('_', ' ')} for this credit note"
        )

    balance = float(cn.get('balance_amount') or 0)
    if balance <= 0.001:
        raise HTTPException(status_code=400, detail="Credit note has no balance available to issue")

    now = datetime.now(timezone.utc).isoformat()
    issuance = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "credit_note_id": credit_note_id,
        "credit_note_number": cn.get('credit_note_number'),
        "return_id": cn.get('return_id'),
        "return_number": cn.get('return_number'),
        "account_id": cn.get('account_id'),
        "account_name": cn.get('account_name'),
        "amount": round(balance, 2),
        "reason": data.reason,
        "issuance_method": data.issuance_method,
        "reference": data.reference,
        "attachment_path": data.attachment_path,
        "attachment_filename": data.attachment_filename,
        "status": "pending_approval",
        "rejection_reason": None,
        "approved_by": None, "approved_by_name": None, "approved_at": None,
        "issued_to": None, "issued_at": None, "issued_by": None, "issued_by_name": None,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get('id'),
        "created_by_name": current_user.get('name', current_user.get('email')),
    }
    await db.credit_note_issuances.insert_one(issuance)
    issuance.pop('_id', None)
    logger.info(
        f"Submitted full-balance credit issuance ₹{balance} on CN {cn.get('credit_note_number')} "
        f"by {current_user['email']} ({data.issuance_method})"
    )
    return issuance


async def _get_issuance_or_404(tenant_id: str, distributor_id: str, credit_note_id: str, issuance_id: str) -> dict:
    issuance = await db.credit_note_issuances.find_one(
        {"id": issuance_id, "tenant_id": tenant_id,
         "distributor_id": distributor_id, "credit_note_id": credit_note_id},
        {"_id": 0}
    )
    if not issuance:
        raise HTTPException(status_code=404, detail="Issuance not found")
    return issuance


@router.post("/{distributor_id}/credit-notes/{credit_note_id}/issuances/{issuance_id}/approve")
async def approve_credit_issuance(
    distributor_id: str,
    credit_note_id: str,
    issuance_id: str,
    current_user: dict = Depends(get_current_user)
):
    if not _is_issuance_approver(current_user):
        raise HTTPException(status_code=403, detail="Only CEO / System Admin can approve credit issuances")
    tenant_id = get_current_tenant_id()
    issuance = await _get_issuance_or_404(tenant_id, distributor_id, credit_note_id, issuance_id)
    if issuance.get('status') != 'pending_approval':
        raise HTTPException(status_code=400, detail=f"Issuance is in '{issuance.get('status')}' state")

    now = datetime.now(timezone.utc).isoformat()
    await db.credit_note_issuances.update_one(
        {"id": issuance_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "approved",
            "approved_by": current_user.get('id'),
            "approved_by_name": current_user.get('name', current_user.get('email')),
            "approved_at": now,
            "updated_at": now,
        }}
    )
    await _recalculate_credit_note_status(tenant_id, credit_note_id)
    logger.info(
        f"Approved credit issuance {issuance_id} (₹{issuance.get('amount')}) by {current_user['email']}"
    )
    return {"status": "approved"}


@router.post("/{distributor_id}/credit-notes/{credit_note_id}/issuances/{issuance_id}/reject")
async def reject_credit_issuance(
    distributor_id: str,
    credit_note_id: str,
    issuance_id: str,
    data: CreditIssuanceReject,
    current_user: dict = Depends(get_current_user)
):
    if not _is_issuance_approver(current_user):
        raise HTTPException(status_code=403, detail="Only CEO / System Admin can reject credit issuances")
    tenant_id = get_current_tenant_id()
    issuance = await _get_issuance_or_404(tenant_id, distributor_id, credit_note_id, issuance_id)
    if issuance.get('status') != 'pending_approval':
        raise HTTPException(status_code=400, detail=f"Issuance is in '{issuance.get('status')}' state")
    now = datetime.now(timezone.utc).isoformat()
    await db.credit_note_issuances.update_one(
        {"id": issuance_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "rejected",
            "rejection_reason": data.rejection_reason,
            "approved_by": current_user.get('id'),
            "approved_by_name": current_user.get('name', current_user.get('email')),
            "approved_at": now,
            "updated_at": now,
        }}
    )
    logger.info(f"Rejected credit issuance {issuance_id} by {current_user['email']}: {data.rejection_reason}")
    return {"status": "rejected"}


@router.post("/{distributor_id}/credit-notes/{credit_note_id}/issuances/{issuance_id}/mark-issued")
async def mark_credit_issuance_issued(
    distributor_id: str,
    credit_note_id: str,
    issuance_id: str,
    data: CreditIssuanceMarkIssued,
    current_user: dict = Depends(get_current_user)
):
    """Records the actual physical handover of the credit to the customer.
    Approval must already have occurred. Balance reduction happens at approval,
    so this is purely an audit/handover record."""
    tenant_id = get_current_tenant_id()
    issuance = await _get_issuance_or_404(tenant_id, distributor_id, credit_note_id, issuance_id)
    if issuance.get('status') != 'approved':
        raise HTTPException(status_code=400, detail="Issuance must be approved before being marked as issued")
    now = datetime.now(timezone.utc).isoformat()
    issuance_date = data.issuance_date or datetime.now(timezone.utc).strftime('%Y-%m-%d')
    await db.credit_note_issuances.update_one(
        {"id": issuance_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "issued",
            "issued_to": data.issued_to,
            "issued_at": issuance_date,
            "issued_by": current_user.get('id'),
            "issued_by_name": current_user.get('name', current_user.get('email')),
            "updated_at": now,
        }}
    )
    # Recalculate so the linked return transitions from direct_payment_approved
    # → credit_issued now that the physical handover is recorded.
    await _recalculate_credit_note_status(tenant_id, credit_note_id)

    # Record the refund in Zoho Books so the Zoho credit note auto-closes
    # when its balance reaches 0. Best-effort: don't fail the local flow.
    try:
        from services.zoho_service import record_credit_note_refund_in_zoho, is_zoho_configured
        if is_zoho_configured():
            cn = await db.credit_notes.find_one(
                {"id": credit_note_id, "tenant_id": tenant_id},
                {"_id": 0}
            )
            issuance_doc = await db.credit_note_issuances.find_one(
                {"id": issuance_id, "tenant_id": tenant_id},
                {"_id": 0}
            )
            if cn and issuance_doc:
                refund = await record_credit_note_refund_in_zoho(
                    tenant_id=tenant_id, credit_note=cn, issuance=issuance_doc
                )
                if refund:
                    await db.credit_note_issuances.update_one(
                        {"id": issuance_id, "tenant_id": tenant_id},
                        {"$set": {
                            "zoho_refund_id": refund.get("creditnote_refund_id"),
                            "zoho_refund_date": refund.get("date"),
                            "zoho_refund_synced_at": now,
                        }},
                    )
    except Exception as zoho_err:
        logger.warning(
            f"Failed to record Zoho refund for issuance {issuance_id} "
            f"on credit note {credit_note_id}: {zoho_err}"
        )

    logger.info(f"Marked credit issuance {issuance_id} as issued on {issuance_date} by {current_user['email']}")
    return {"status": "issued", "issued_at": issuance_date}


@router.post("/{distributor_id}/credit-notes/{credit_note_id}/issuances/{issuance_id}/cancel")
async def cancel_credit_issuance(
    distributor_id: str,
    credit_note_id: str,
    issuance_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Cancel a pending issuance. Creator or CEO/System Admin only."""
    tenant_id = get_current_tenant_id()
    issuance = await _get_issuance_or_404(tenant_id, distributor_id, credit_note_id, issuance_id)
    if issuance.get('status') not in ('pending_approval', 'approved'):
        raise HTTPException(status_code=400, detail=f"Cannot cancel issuance in '{issuance.get('status')}' state")
    is_creator = (issuance.get('created_by') == current_user.get('id'))
    if not (_is_issuance_approver(current_user) or is_creator):
        raise HTTPException(status_code=403, detail="Only the creator or CEO / System Admin can cancel")
    now = datetime.now(timezone.utc).isoformat()
    await db.credit_note_issuances.update_one(
        {"id": issuance_id, "tenant_id": tenant_id},
        {"$set": {"status": "cancelled", "updated_at": now}}
    )
    # If was approved, restoring the balance is automatic via recompute
    await _recalculate_credit_note_status(tenant_id, credit_note_id)
    logger.info(f"Cancelled credit issuance {issuance_id} by {current_user['email']}")
    return {"status": "cancelled"}


async def generate_credit_note_number(tenant_id: str) -> str:
    """Generate unique credit note number"""
    year = datetime.now().year
    
    latest = await db.credit_notes.find_one(
        {"tenant_id": tenant_id, "credit_note_number": {"$regex": f"^CN-{year}-"}},
        sort=[("credit_note_number", -1)]
    )
    
    if latest:
        try:
            last_num = int(latest["credit_note_number"].split("-")[-1])
            new_num = last_num + 1
        except (ValueError, IndexError):
            new_num = 1
    else:
        new_num = 1
    
    return f"CN-{year}-{new_num:04d}"


async def create_credit_note_from_return(
    tenant_id: str,
    distributor_id: str,
    return_doc: dict,
    created_by: str = None
) -> dict:
    """Create a credit note from an approved return"""
    
    # Check if credit note already exists for this return
    existing = await db.credit_notes.find_one({
        "tenant_id": tenant_id,
        "return_id": return_doc.get("id")
    })
    
    if existing:
        logger.info(f"Credit note already exists for return {return_doc.get('return_number')}")
        return existing
    
    credit_note_number = await generate_credit_note_number(tenant_id)
    total_credit = return_doc.get("total_credit", 0)
    
    credit_note = CreditNote(
        tenant_id=tenant_id,
        distributor_id=distributor_id,
        credit_note_number=credit_note_number,
        return_id=return_doc.get("id"),
        return_number=return_doc.get("return_number"),
        account_id=return_doc.get("account_id"),
        account_name=return_doc.get("account_name"),
        original_amount=total_credit,
        applied_amount=0,
        balance_amount=total_credit,
        status="pending",
        credit_note_date=datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        created_by=created_by
    )
    
    await db.credit_notes.insert_one(credit_note.model_dump())
    
    # Update the return document with credit note reference
    await db.customer_returns.update_one(
        {"id": return_doc.get("id"), "tenant_id": tenant_id},
        {"$set": {
            "credit_note_id": credit_note.id,
            "credit_note_number": credit_note_number,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Created credit note {credit_note_number} for return {return_doc.get('return_number')} amount ₹{total_credit}")

    # ── Push to Zoho Books — DEFERRED ──────────────────────────────────────
    # Zoho India GST mandates that every credit note must reference an invoice
    # (error 12069 otherwise). At the moment the customer-return credit-note
    # is created, we usually don't have a Zoho invoice id yet — the CN gets
    # applied to a future delivery, which is when an invoice is generated in
    # Zoho. So we DEFER the Zoho push to that point (see `apply_credit_notes_to_zoho_invoice`
    # which lazily creates + applies the Zoho CN when the local CN is applied
    # to a delivery whose Zoho invoice id is known).
    logger.info(
        f"Local credit note {credit_note_number} created; Zoho push deferred until "
        f"this CN is applied to a delivery (so we can bind it to the Zoho invoice)."
    )

    return credit_note.model_dump()


@router.post("/{distributor_id}/credit-notes/{credit_note_id}/retry-zoho-push")
async def retry_zoho_push(
    distributor_id: str,
    credit_note_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Retry pushing a previously-failed credit note to Zoho Books.

    Use this after fixing the underlying cause (re-connecting Zoho with the
    correct scopes, fixing missing SKU mappings, etc.). Idempotent — if the CN
    is already synced, returns the existing mapping.
    """
    tenant_id = get_current_tenant_id()

    cn = await db.credit_notes.find_one(
        {"id": credit_note_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0},
    )
    if not cn:
        raise HTTPException(status_code=404, detail="Credit note not found")

    if cn.get("zoho_creditnote_id"):
        return {
            "ok": True,
            "already_synced": True,
            "zoho_creditnote_id": cn.get("zoho_creditnote_id"),
            "zoho_creditnote_number": cn.get("zoho_creditnote_number"),
            "zoho_creditnote_url": cn.get("zoho_creditnote_url"),
        }

    return_id = cn.get("return_id")
    if not return_id:
        raise HTTPException(status_code=400, detail="Credit note has no originating return; cannot push to Zoho.")

    return_doc = await db.customer_returns.find_one(
        {"id": return_id, "tenant_id": tenant_id},
        {"_id": 0},
    )
    if not return_doc:
        raise HTTPException(status_code=404, detail="Originating return not found")

    account = await db.accounts.find_one(
        {"$or": [
            {"id": return_doc.get("account_id")},
            {"account_id": return_doc.get("account_id")},
        ], "tenant_id": tenant_id},
        {"_id": 0},
    )
    if not account:
        raise HTTPException(status_code=400, detail="Customer account not found for this return")

    # Zoho India GST: a credit note MUST be bound to an invoice. Find a delivery
    # that this CN has been applied to AND whose Zoho invoice has been pushed —
    # use its Zoho invoice id as the credit-note's reference.
    delivery_with_invoice = await db.distributor_deliveries.find_one(
        {
            "tenant_id": tenant_id,
            "applied_credit_notes.credit_note_id": credit_note_id,
            "zoho_invoice_id": {"$exists": True, "$ne": None},
        },
        {"_id": 0, "zoho_invoice_id": 1, "delivery_number": 1},
    )
    zoho_invoice_id = (delivery_with_invoice or {}).get("zoho_invoice_id")
    if not zoho_invoice_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "This credit note hasn't been applied to a Zoho-synced delivery yet. "
                "Zoho India GST requires every credit note to reference an invoice. "
                "Apply this CN to a delivery first — it will be pushed to Zoho automatically at that moment."
            ),
        )

    try:
        from services.zoho_service import (
            create_credit_note_for_return,
            is_zoho_configured,
            AccountNotLinkedToZohoError,
        )
        if not is_zoho_configured():
            raise HTTPException(status_code=400, detail="Zoho Books integration is not configured.")

        try:
            mapping = await create_credit_note_for_return(
                tenant_id=tenant_id,
                return_doc=return_doc,
                account=account,
                reference_invoice_id=zoho_invoice_id,
            )
        except AccountNotLinkedToZohoError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # Mirror Zoho ids onto the local credit_note doc (and the return doc is
        # already stamped by create_credit_note_for_return).
        await db.credit_notes.update_one(
            {"id": credit_note_id, "tenant_id": tenant_id},
            {"$set": {
                "zoho_creditnote_id": mapping.get("zoho_creditnote_id"),
                "zoho_creditnote_number": mapping.get("zoho_creditnote_number"),
                "zoho_creditnote_url": mapping.get("zoho_creditnote_url"),
                "zoho_synced_at": mapping.get("synced_at"),
            }},
        )

        return {
            "ok": True,
            "already_synced": False,
            "zoho_creditnote_id": mapping.get("zoho_creditnote_id"),
            "zoho_creditnote_number": mapping.get("zoho_creditnote_number"),
            "zoho_creditnote_url": mapping.get("zoho_creditnote_url"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"retry_zoho_push: failed to push CN {credit_note_id} to Zoho: {e}")
        raise HTTPException(status_code=400, detail=f"Zoho push failed: {e}")


@router.get("/{distributor_id}/credit-notes")
async def list_credit_notes(
    distributor_id: str,
    account_id: Optional[str] = Query(None, description="Filter by account"),
    status: Optional[str] = Query(None, description="Filter by status"),
    has_balance: Optional[bool] = Query(None, description="Filter to only those with balance > 0"),
    current_user: dict = Depends(get_current_user)
):
    """List all credit notes for a distributor"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    
    if account_id:
        query["account_id"] = account_id
    
    if status:
        query["status"] = status
    
    if has_balance:
        query["balance_amount"] = {"$gt": 0}
    
    credit_notes = await db.credit_notes.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    # Calculate summary
    total_original = sum(cn.get("original_amount", 0) for cn in credit_notes)
    total_applied = sum(cn.get("applied_amount", 0) for cn in credit_notes)
    total_balance = sum(cn.get("balance_amount", 0) for cn in credit_notes)
    
    return {
        "credit_notes": credit_notes,
        "total": len(credit_notes),
        "summary": {
            "total_original": round(total_original, 2),
            "total_applied": round(total_applied, 2),
            "total_balance": round(total_balance, 2)
        }
    }


@router.get("/{distributor_id}/credit-notes/for-account/{account_id}")
async def get_available_credit_notes_for_account(
    distributor_id: str,
    account_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all credit notes with available balance for an account (for applying to deliveries)"""
    tenant_id = get_current_tenant_id()
    
    credit_notes = await db.credit_notes.find(
        {
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "account_id": account_id,
            "balance_amount": {"$gt": 0},
            "status": {"$in": ["pending", "partially_applied"]}
        },
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)  # Oldest first for FIFO application

    # Backfill Zoho deep-link from the originating customer_return for any CNs
    # that were synced before the credit_notes collection started carrying these
    # fields. This is idempotent and cheap (only runs for missing ones).
    missing_zoho = [cn for cn in credit_notes if cn.get("return_id") and not cn.get("zoho_creditnote_url")]
    if missing_zoho:
        return_ids = list({cn["return_id"] for cn in missing_zoho})
        returns = await db.customer_returns.find(
            {"id": {"$in": return_ids}, "tenant_id": tenant_id, "zoho_creditnote_url": {"$exists": True, "$ne": None}},
            {"_id": 0, "id": 1, "zoho_creditnote_id": 1, "zoho_creditnote_number": 1, "zoho_creditnote_url": 1}
        ).to_list(len(return_ids))
        returns_by_id = {r["id"]: r for r in returns}
        now_iso = datetime.now(timezone.utc).isoformat()
        for cn in missing_zoho:
            r = returns_by_id.get(cn.get("return_id"))
            if not r or not r.get("zoho_creditnote_url"):
                continue
            cn["zoho_creditnote_id"] = r.get("zoho_creditnote_id")
            cn["zoho_creditnote_number"] = r.get("zoho_creditnote_number")
            cn["zoho_creditnote_url"] = r.get("zoho_creditnote_url")
            # Persist for future fetches
            try:
                await db.credit_notes.update_one(
                    {"id": cn.get("id"), "tenant_id": tenant_id},
                    {"$set": {
                        "zoho_creditnote_id": r.get("zoho_creditnote_id"),
                        "zoho_creditnote_number": r.get("zoho_creditnote_number"),
                        "zoho_creditnote_url": r.get("zoho_creditnote_url"),
                        "zoho_synced_at": now_iso,
                    }}
                )
            except Exception as e:
                logger.warning(f"Failed to backfill zoho ids on credit_note {cn.get('id')}: {e}")

    total_available = sum(cn.get("balance_amount", 0) for cn in credit_notes)
    
    return {
        "credit_notes": credit_notes,
        "total_available": round(total_available, 2),
        "count": len(credit_notes)
    }


@router.get("/{distributor_id}/credit-notes/{credit_note_id}")
async def get_credit_note(
    distributor_id: str,
    credit_note_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific credit note"""
    tenant_id = get_current_tenant_id()
    
    credit_note = await db.credit_notes.find_one(
        {"id": credit_note_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    
    if not credit_note:
        raise HTTPException(status_code=404, detail="Credit note not found")
    
    return credit_note


@router.post("/{distributor_id}/credit-notes/{credit_note_id}/cancel")
async def cancel_credit_note(
    distributor_id: str,
    credit_note_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Cancel a credit note (only if not applied)"""
    tenant_id = get_current_tenant_id()
    
    credit_note = await db.credit_notes.find_one(
        {"id": credit_note_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not credit_note:
        raise HTTPException(status_code=404, detail="Credit note not found")
    
    if credit_note.get("applied_amount", 0) > 0:
        raise HTTPException(status_code=400, detail="Cannot cancel: Credit note has been partially or fully applied")
    
    await db.credit_notes.update_one(
        {"id": credit_note_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "cancelled",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"Cancelled credit note {credit_note.get('credit_note_number')}")
    
    return {"message": "Credit note cancelled", "status": "cancelled"}


@router.delete("/{distributor_id}/credit-notes/{credit_note_id}")
async def delete_credit_note(
    distributor_id: str,
    credit_note_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a credit note - CEO/Admin only"""
    tenant_id = get_current_tenant_id()
    user_role = current_user.get('role', '').lower()
    
    if user_role not in ['ceo', 'admin', 'system admin']:
        raise HTTPException(status_code=403, detail="Only CEO and Admin can delete credit notes")
    
    credit_note = await db.credit_notes.find_one(
        {"id": credit_note_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    
    if not credit_note:
        raise HTTPException(status_code=404, detail="Credit note not found")
    
    if credit_note.get("applied_amount", 0) > 0:
        raise HTTPException(status_code=400, detail="Cannot delete: Credit note has been partially or fully applied to deliveries")
    
    await db.credit_notes.delete_one({"id": credit_note_id, "tenant_id": tenant_id})
    
    logger.info(f"Deleted credit note {credit_note.get('credit_note_number')} (status: {credit_note.get('status')}) by {current_user['email']}")
    
    return {"message": f"Credit note {credit_note.get('credit_note_number')} deleted"}



async def apply_credit_note_to_delivery(
    tenant_id: str,
    credit_note_id: str,
    delivery_id: str,
    delivery_number: str,
    amount_to_apply: float,
    applied_by: str = None
) -> dict:
    """Apply a credit note to a delivery (internal function)"""
    
    credit_note = await db.credit_notes.find_one(
        {"id": credit_note_id, "tenant_id": tenant_id}
    )
    
    if not credit_note:
        raise HTTPException(status_code=404, detail="Credit note not found")
    
    balance = credit_note.get("balance_amount", 0)
    
    if amount_to_apply > balance:
        raise HTTPException(
            status_code=400, 
            detail=f"Amount to apply (₹{amount_to_apply}) exceeds available balance (₹{balance})"
        )
    
    # Create application record
    application = CreditNoteApplication(
        delivery_id=delivery_id,
        delivery_number=delivery_number,
        amount_applied=amount_to_apply,
        applied_at=datetime.now(timezone.utc).isoformat(),
        applied_by=applied_by
    )
    
    # Update credit note
    new_applied = credit_note.get("applied_amount", 0) + amount_to_apply
    new_balance = credit_note.get("original_amount", 0) - new_applied
    
    new_status = "pending"
    if new_balance <= 0:
        new_status = "fully_applied"
    elif new_applied > 0:
        new_status = "partially_applied"
    
    await db.credit_notes.update_one(
        {"id": credit_note_id, "tenant_id": tenant_id},
        {
            "$set": {
                "applied_amount": round(new_applied, 2),
                "balance_amount": round(max(0, new_balance), 2),
                "status": new_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            },
            "$push": {
                "applications": application.model_dump()
            }
        }
    )
    
    # Update the related return status to "credit_issued" when credit note is fully applied
    return_id = credit_note.get("return_id")
    if new_status == "fully_applied" and return_id:
        await db.customer_returns.update_one(
            {"id": return_id, "tenant_id": tenant_id},
            {"$set": {
                "status": "credit_issued",
                "credit_note_id": credit_note_id,
                "credit_note_number": credit_note.get("credit_note_number"),
                "credit_issued_to_delivery_id": delivery_id,
                "credit_issued_to_delivery_number": delivery_number,
                "credit_issued_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        logger.info(f"Updated return {credit_note.get('return_number')} status to credit_issued for delivery {delivery_number}")
    
    logger.info(f"Applied ₹{amount_to_apply} from credit note {credit_note.get('credit_note_number')} to delivery {delivery_number}")
    
    return {
        "credit_note_id": credit_note_id,
        "credit_note_number": credit_note.get("credit_note_number"),
        "return_id": credit_note.get("return_id"),
        "return_number": credit_note.get("return_number"),
        "amount_applied": amount_to_apply,
        "remaining_balance": round(max(0, new_balance), 2)
    }



async def revert_credit_note_application(
    tenant_id: str,
    delivery_id: str,
    delivery_number: str
) -> list:
    """
    Revert all credit note applications for a cancelled delivery.
    Returns the credit notes to their previous state and reverts return status to 'approved'.
    """
    reverted_notes = []
    
    # Find all credit notes that have applications for this delivery
    credit_notes = await db.credit_notes.find(
        {
            "tenant_id": tenant_id,
            "applications.delivery_id": delivery_id
        }
    ).to_list(100)
    
    for cn in credit_notes:
        # Find the application for this delivery
        applications = cn.get("applications", [])
        delivery_applications = [app for app in applications if app.get("delivery_id") == delivery_id]
        
        total_reverted = sum(app.get("amount_applied", 0) for app in delivery_applications)
        
        if total_reverted > 0:
            # Remove the application entries for this delivery
            remaining_applications = [app for app in applications if app.get("delivery_id") != delivery_id]
            
            # Recalculate amounts
            new_applied = cn.get("applied_amount", 0) - total_reverted
            new_balance = cn.get("original_amount", 0) - new_applied
            
            # Determine new status
            if new_applied <= 0:
                new_status = "pending"
            elif new_balance <= 0:
                new_status = "fully_applied"
            else:
                new_status = "partially_applied"
            
            # Update credit note
            await db.credit_notes.update_one(
                {"id": cn.get("id"), "tenant_id": tenant_id},
                {"$set": {
                    "applied_amount": round(max(0, new_applied), 2),
                    "balance_amount": round(max(0, new_balance), 2),
                    "status": new_status,
                    "applications": remaining_applications,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            # If credit note status changed from fully_applied, revert return status to approved
            if cn.get("status") == "fully_applied" and new_status != "fully_applied":
                if cn.get("return_id"):
                    await db.customer_returns.update_one(
                        {"id": cn.get("return_id"), "tenant_id": tenant_id},
                        {"$set": {
                            "status": "approved",
                            "credit_issued_to_delivery_id": None,
                            "credit_issued_to_delivery_number": None,
                            "credit_issued_at": None,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    logger.info(f"Reverted return {cn.get('return_number')} status to approved")
            
            reverted_notes.append({
                "credit_note_id": cn.get("id"),
                "credit_note_number": cn.get("credit_note_number"),
                "return_id": cn.get("return_id"),
                "return_number": cn.get("return_number"),
                "amount_reverted": round(total_reverted, 2),
                "new_balance": round(max(0, new_balance), 2)
            })
            
            logger.info(f"Reverted ₹{total_reverted} from credit note {cn.get('credit_note_number')} for cancelled delivery {delivery_number}")
    
    return reverted_notes
