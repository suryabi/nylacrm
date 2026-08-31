"""Stock Movement Log — read API for the per-SKU deduction/re-add ledger."""
from typing import Optional
from fastapi import APIRouter, Depends, Query

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user

router = APIRouter()


@router.get("")
async def list_stock_movements(
    sku_id: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(300, ge=1, le=1000),
    _user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id}
    if sku_id:
        q["sku_id"] = sku_id
    if direction in ("in", "out"):
        q["direction"] = direction
    if search:
        q["$or"] = [
            {"reference": {"$regex": search, "$options": "i"}},
            {"sku_name": {"$regex": search, "$options": "i"}},
            {"batch_code": {"$regex": search, "$options": "i"}},
        ]
    rows = await db.stock_movements.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return {"movements": rows, "count": len(rows)}
