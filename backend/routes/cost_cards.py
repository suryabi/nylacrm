"""
Cost Card Module — Global master price list per City + SKU.
Serves as default base price for all distributors.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Query
from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


class CostCardCreate(BaseModel):
    sku_id: str
    sku_name: Optional[str] = None
    city: str
    cost_per_unit: float


class CostCardUpdate(BaseModel):
    cost_per_unit: float


class CostCardBulkItem(BaseModel):
    id: Optional[str] = None
    sku_id: str
    sku_name: Optional[str] = None
    city: str
    cost_per_unit: float


ADMIN_ROLES = ['CEO', 'Director', 'Admin', 'System Admin', 'Vice President', 'National Sales Head']


@router.get("")
async def list_cost_cards(
    city: Optional[str] = None,
    sku_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all cost card entries with optional filters."""
    tenant_id = get_current_tenant_id()
    query = {"tenant_id": tenant_id}
    if city and city != "all":
        query["city"] = city
    if sku_id and sku_id != "all":
        query["sku_id"] = sku_id

    docs = await db.cost_cards.find(query, {"_id": 0}).sort([("city", 1), ("sku_name", 1)]).to_list(10000)

    # Distinct cities and skus for filter dropdowns
    all_docs = await db.cost_cards.find({"tenant_id": tenant_id}, {"_id": 0, "city": 1, "sku_id": 1, "sku_name": 1}).to_list(50000)
    cities = sorted(set(d["city"] for d in all_docs if d.get("city")))
    sku_map = {}
    for d in all_docs:
        if d.get("sku_id") and d["sku_id"] not in sku_map:
            sku_map[d["sku_id"]] = d.get("sku_name", d["sku_id"])
    skus = [{"id": k, "name": v} for k, v in sorted(sku_map.items(), key=lambda x: x[1])]

    return {"cost_cards": docs, "total": len(docs), "cities": cities, "skus": skus}


@router.post("")
async def create_cost_card(
    data: CostCardCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a single cost card entry."""
    if current_user.get('role') not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()

    existing = await db.cost_cards.find_one({
        "tenant_id": tenant_id, "sku_id": data.sku_id, "city": data.city
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Cost card already exists for {data.city} + {data.sku_name or data.sku_id}")

    sku_name = data.sku_name
    if not sku_name:
        sku = await db.skus.find_one({"id": data.sku_id}, {"_id": 0, "name": 1})
        sku_name = sku.get("name") if sku else data.sku_id

    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "sku_id": data.sku_id,
        "sku_name": sku_name,
        "city": data.city,
        "cost_per_unit": round(data.cost_per_unit, 2),
        "created_at": now,
        "updated_at": now,
        "updated_by": current_user.get("id"),
        "updated_by_name": current_user.get("name"),
    }
    await db.cost_cards.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{card_id}")
async def update_cost_card(
    card_id: str,
    data: CostCardUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update cost per unit for a single entry."""
    if current_user.get('role') not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()

    result = await db.cost_cards.update_one(
        {"id": card_id, "tenant_id": tenant_id},
        {"$set": {
            "cost_per_unit": round(data.cost_per_unit, 2),
            "updated_at": now,
            "updated_by": current_user.get("id"),
            "updated_by_name": current_user.get("name"),
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cost card not found")

    updated = await db.cost_cards.find_one({"id": card_id}, {"_id": 0})
    return updated


@router.delete("/{card_id}")
async def delete_cost_card(card_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a cost card entry."""
    if current_user.get('role') not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    result = await db.cost_cards.delete_one({"id": card_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cost card not found")
    return {"message": "Cost card deleted"}


@router.put("/bulk/save")
async def bulk_save_cost_cards(
    items: List[CostCardBulkItem],
    current_user: dict = Depends(get_current_user)
):
    """Bulk upsert cost card entries (for spreadsheet-style save)."""
    if current_user.get('role') not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")

    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()

    created = 0
    updated = 0

    for item in items:
        sku_name = item.sku_name
        if not sku_name:
            sku = await db.skus.find_one({"id": item.sku_id}, {"_id": 0, "name": 1})
            sku_name = sku.get("name") if sku else item.sku_id

        if item.id:
            # Update existing
            await db.cost_cards.update_one(
                {"id": item.id, "tenant_id": tenant_id},
                {"$set": {
                    "cost_per_unit": round(item.cost_per_unit, 2),
                    "updated_at": now,
                    "updated_by": current_user.get("id"),
                    "updated_by_name": current_user.get("name"),
                }}
            )
            updated += 1
        else:
            # Check for existing by city+sku
            existing = await db.cost_cards.find_one({
                "tenant_id": tenant_id, "sku_id": item.sku_id, "city": item.city
            })
            if existing:
                await db.cost_cards.update_one(
                    {"id": existing["id"]},
                    {"$set": {
                        "cost_per_unit": round(item.cost_per_unit, 2),
                        "updated_at": now,
                        "updated_by": current_user.get("id"),
                        "updated_by_name": current_user.get("name"),
                    }}
                )
                updated += 1
            else:
                doc = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "sku_id": item.sku_id,
                    "sku_name": sku_name,
                    "city": item.city,
                    "cost_per_unit": round(item.cost_per_unit, 2),
                    "created_at": now,
                    "updated_at": now,
                    "updated_by": current_user.get("id"),
                    "updated_by_name": current_user.get("name"),
                }
                await db.cost_cards.insert_one(doc)
                created += 1

    return {"message": f"{created} created, {updated} updated", "created": created, "updated": updated}


@router.get("/for-distributor/{distributor_id}")
async def get_cost_cards_for_distributor(
    distributor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get effective cost cards for a distributor (global defaults, overridden by distributor margins)."""
    tenant_id = get_current_tenant_id()

    # Get distributor's coverage cities
    coverage = await db.distributor_operating_coverage.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id, "status": "active"},
        {"_id": 0, "city": 1}
    ).to_list(500)
    cities = [c["city"] for c in coverage]

    if not cities:
        return {"cost_cards": [], "total": 0}

    # Global cost cards for these cities
    cards = await db.cost_cards.find(
        {"tenant_id": tenant_id, "city": {"$in": cities}},
        {"_id": 0}
    ).sort([("city", 1), ("sku_name", 1)]).to_list(10000)

    # Get distributor-specific margin overrides
    margins = await db.distributor_margin_matrix.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id, "status": "active"},
        {"_id": 0, "city": 1, "sku_id": 1, "base_price": 1}
    ).to_list(5000)
    override_map = {f"{m['city']}_{m['sku_id']}": m.get("base_price") for m in margins}

    for card in cards:
        key = f"{card['city']}_{card['sku_id']}"
        override = override_map.get(key)
        card["has_override"] = override is not None
        card["effective_price"] = override if override is not None else card["cost_per_unit"]

    return {"cost_cards": cards, "total": len(cards)}
