"""
Credit Notes Routes
Auto-generated from approved returns, applied to deliveries
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from models.credit_note import CreditNote, CreditNoteApplication

router = APIRouter(tags=["Credit Notes"])
logger = logging.getLogger(__name__)


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
    
    logger.info(f"Created credit note {credit_note_number} for return {return_doc.get('return_number')} amount ₹{total_credit}")
    
    return credit_note.model_dump()


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
    
    logger.info(f"Applied ₹{amount_to_apply} from credit note {credit_note.get('credit_note_number')} to delivery {delivery_number}")
    
    return {
        "credit_note_id": credit_note_id,
        "credit_note_number": credit_note.get("credit_note_number"),
        "amount_applied": amount_to_apply,
        "remaining_balance": round(max(0, new_balance), 2)
    }
