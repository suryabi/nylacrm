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
    DEFAULT_RETURN_REASONS
)

router = APIRouter(tags=["Return Reasons"])
logger = logging.getLogger(__name__)


@router.get("")
async def list_return_reasons(
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    category: Optional[str] = Query(None, description="Filter by category"),
    current_user: dict = Depends(get_current_user)
):
    """List all return reasons for the current tenant"""
    tenant_id = get_current_tenant_id()
    
    query = {"tenant_id": tenant_id}
    
    if is_active is not None:
        query["is_active"] = is_active
    
    if category:
        query["category"] = category
    
    reasons = await db.return_reasons.find(
        query,
        {"_id": 0}
    ).sort("display_order", 1).to_list(100)
    
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
    
    # Create the reason
    reason = ReturnReason(
        tenant_id=tenant_id,
        reason_code=data.reason_code.upper(),
        reason_name=data.reason_name,
        description=data.description,
        category=data.category,
        credit_type=data.credit_type,
        credit_percentage=data.credit_percentage,
        return_to_factory=data.return_to_factory,
        requires_inspection=data.requires_inspection,
        display_order=data.display_order,
        color=data.color,
        created_by=current_user.get('id')
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
    
    # Create default reasons
    created = []
    for reason_data in DEFAULT_RETURN_REASONS:
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
