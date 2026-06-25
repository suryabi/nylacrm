"""
Return Reasons Routes
Manage return reason masters for customer returns
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from models.tenant import (
    ReturnReason, ReturnReasonCreate, ReturnReasonUpdate,
    DEFAULT_RETURN_REASONS, DEFAULT_DEBIT_REASONS
)

router = APIRouter(tags=["Return Reasons"])
logger = logging.getLogger(__name__)


@router.get("")
async def list_return_reasons(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    category: Optional[str] = Query(None, description="Filter by category"),
    applies_to: Optional[str] = Query(None, description="Filter by applicability — 'customer' or 'distributor'"),
    note_type: Optional[str] = Query(None, description="Filter by note type — 'credit' or 'debit'"),
    current_user: dict = Depends(get_current_user)
):
    """List all return reasons for the current tenant"""
    tenant_id = get_current_tenant_id()

    # Auto-seed default DEBIT reasons for tenants that were initialized before
    # debit reasons existed (one-time, idempotent).
    if note_type == 'debit':
        has_debit = await db.return_reasons.count_documents({"tenant_id": tenant_id, "note_type": "debit"})
        if has_debit == 0:
            now = datetime.now(timezone.utc)
            seed = []
            for rd in DEFAULT_DEBIT_REASONS:
                seed.append(ReturnReason(tenant_id=tenant_id, created_by=current_user.get("id"),
                                         created_at=now, updated_at=now, **rd).model_dump())
            if seed:
                await db.return_reasons.insert_many(seed)

    query = {"tenant_id": tenant_id}

    if is_active is not None:
        query["is_active"] = is_active
    
    if category:
        query["category"] = category

    if note_type:
        # Match the requested note_type OR legacy rows with no note_type (→ credit).
        if note_type == 'credit':
            query["$and"] = query.get("$and", []) + [{"$or": [
                {"note_type": "credit"},
                {"note_type": {"$exists": False}},
                {"note_type": None},
            ]}]
        else:
            query["note_type"] = note_type

    if applies_to:
        # Match reasons that include the requested side OR have no applies_to set
        # (legacy data) — those default to 'customer' for backwards compatibility.
        if applies_to == 'customer':
            query["$or"] = [
                {"applies_to": "customer"},
                {"applies_to": {"$exists": False}},
                {"applies_to": []},
            ]
        else:
            query["applies_to"] = applies_to
    
    reasons = await db.return_reasons.find(
        query,
        {"_id": 0}
    ).sort("display_order", 1).to_list(100)

    # Backfill default `applies_to` on response so the frontend can rely on it
    for r in reasons:
        if not r.get("applies_to"):
            r["applies_to"] = ["customer"]
        if not r.get("note_type"):
            r["note_type"] = "credit"
    
    return {"reasons": reasons, "total": len(reasons)}


@router.get("/categories")
async def get_return_categories(
    current_user: dict = Depends(get_current_user)
):
    """Get available return reason categories"""
    categories = [
        {
            "value": "empty_reusable",
            "label": "Empty/Reusable",
            "description": "Empty bottles to be returned to factory for reuse",
            "color": "#10B981"
        },
        {
            "value": "expired",
            "label": "Expired",
            "description": "Expired stock to be returned to factory for disposal",
            "color": "#F59E0B"
        },
        {
            "value": "damaged",
            "label": "Damaged",
            "description": "Damaged stock to be returned to factory",
            "color": "#EF4444"
        },
        {
            "value": "promotional",
            "label": "Promotional/FOC",
            "description": "Free of cost or promotional items",
            "color": "#6B7280"
        },
        {
            "value": "unused_refundable",
            "label": "Unused Stock - Refundable",
            "description": "Unsold, sellable stock returned by the customer/distributor — eligible for credit/refund",
            "color": "#0891B2"
        },
        {
            "value": "unused_non_refundable",
            "label": "Unused Stock - Non-Refundable",
            "description": "Unsold stock returned but not eligible for credit/refund",
            "color": "#64748B"
        }
    ]
    return {"categories": categories}


@router.get("/credit-types")
async def get_credit_types(
    current_user: dict = Depends(get_current_user)
):
    """Get available credit calculation types"""
    credit_types = [
        {
            "value": "sku_return_credit",
            "label": "SKU Return Credit",
            "description": "Uses return_credit_per_unit from Account SKU Pricing"
        },
        {
            "value": "full_price",
            "label": "Full Price",
            "description": "100% of original selling price"
        },
        {
            "value": "percentage",
            "label": "Percentage",
            "description": "Configurable percentage of selling price"
        },
        {
            "value": "no_credit",
            "label": "No Credit",
            "description": "No credit given (₹0)"
        }
    ]
    return {"credit_types": credit_types}


@router.get("/{reason_id}")
async def get_return_reason(
    reason_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific return reason"""
    tenant_id = get_current_tenant_id()
    
    reason = await db.return_reasons.find_one(
        {"id": reason_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    if not reason:
        raise HTTPException(status_code=404, detail="Return reason not found")
    
    return reason


@router.post("")
async def create_return_reason(
    data: ReturnReasonCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new return reason"""
    tenant_id = get_current_tenant_id()
    
    # Check for duplicate reason_code
    existing = await db.return_reasons.find_one({
        "tenant_id": tenant_id,
        "reason_code": data.reason_code.upper()
    })
    
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Return reason with code '{data.reason_code}' already exists"
        )
    
    # Create the reason — spread all fields so newly-added ones (note_type,
    # applies_to, …) are never silently dropped.
    payload = data.model_dump()
    payload["reason_code"] = data.reason_code.upper()
    reason = ReturnReason(
        tenant_id=tenant_id,
        created_by=current_user.get('id'),
        **payload
    )
    
    await db.return_reasons.insert_one(reason.model_dump())
    
    logger.info(f"Created return reason {reason.reason_code} for tenant {tenant_id}")
    
    return {"message": "Return reason created", "reason": reason.model_dump()}


@router.put("/{reason_id}")
async def update_return_reason(
    reason_id: str,
    data: ReturnReasonUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a return reason"""
    tenant_id = get_current_tenant_id()
    
    reason = await db.return_reasons.find_one(
        {"id": reason_id, "tenant_id": tenant_id}
    )
    
    if not reason:
        raise HTTPException(status_code=404, detail="Return reason not found")
    
    # Build update dict
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.return_reasons.update_one(
        {"id": reason_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    updated = await db.return_reasons.find_one(
        {"id": reason_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    
    logger.info(f"Updated return reason {reason_id} for tenant {tenant_id}")
    
    return {"message": "Return reason updated", "reason": updated}


@router.delete("/{reason_id}")
async def delete_return_reason(
    reason_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a return reason (soft delete by deactivating)"""
    tenant_id = get_current_tenant_id()
    
    reason = await db.return_reasons.find_one(
        {"id": reason_id, "tenant_id": tenant_id}
    )
    
    if not reason:
        raise HTTPException(status_code=404, detail="Return reason not found")
    
    if reason.get("is_system"):
        raise HTTPException(
            status_code=400, 
            detail="System return reasons cannot be deleted. You can deactivate them instead."
        )
    
    # Check if reason is used in any returns
    used_in_returns = await db.customer_returns.count_documents({
        "tenant_id": tenant_id,
        "items.reason_id": reason_id
    })
    
    if used_in_returns > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: This reason is used in {used_in_returns} return(s). Deactivate it instead."
        )
    
    # Hard delete since not used
    await db.return_reasons.delete_one({"id": reason_id, "tenant_id": tenant_id})
    
    logger.info(f"Deleted return reason {reason_id} for tenant {tenant_id}")
    
    return {"message": "Return reason deleted"}


@router.post("/initialize-defaults")
async def initialize_default_reasons(
    current_user: dict = Depends(get_current_user)
):
    """Initialize default return reasons for the tenant (admin only)"""
    tenant_id = get_current_tenant_id()
    
    # Check if already initialized
    existing_count = await db.return_reasons.count_documents({"tenant_id": tenant_id})
    
    if existing_count > 0:
        return {"message": "Return reasons already exist", "count": existing_count}
    
    # Create default reasons (credit + debit)
    created = []
    for reason_data in (DEFAULT_RETURN_REASONS + DEFAULT_DEBIT_REASONS):
        reason = ReturnReason(
            tenant_id=tenant_id,
            **reason_data,
            created_by=current_user.get('id')
        )
        await db.return_reasons.insert_one(reason.model_dump())
        created.append(reason.reason_code)
    
    logger.info(f"Initialized {len(created)} default return reasons for tenant {tenant_id}")
    
    return {"message": f"Created {len(created)} default return reasons", "reasons": created}


@router.post("/reorder")
async def reorder_return_reasons(
    order: List[dict],  # [{"id": "...", "display_order": 1}, ...]
    current_user: dict = Depends(get_current_user)
):
    """Reorder return reasons"""
    tenant_id = get_current_tenant_id()
    
    for item in order:
        await db.return_reasons.update_one(
            {"id": item["id"], "tenant_id": tenant_id},
            {"$set": {"display_order": item["display_order"]}}
        )
    
    return {"message": "Return reasons reordered"}
