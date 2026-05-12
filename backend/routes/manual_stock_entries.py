"""
Manual Stock Entries — for self-managed distributors only.

Self-managed distributors don't receive shipments from the factory; they
procure/produce their own stock. This module lets them manually add stock to
their default warehouse location, with an optional batch number, and tracks
every entry as an auditable draft → confirmed → (optionally) cancelled record.

Endpoints (mounted at /api/distributors prefix):
  GET    /{distributor_id}/manual-stock              — list entries (paginated)
  POST   /{distributor_id}/manual-stock              — create draft
  PUT    /{distributor_id}/manual-stock/{entry_id}   — edit (only while draft)
  POST   /{distributor_id}/manual-stock/{entry_id}/confirm
  POST   /{distributor_id}/manual-stock/{entry_id}/cancel
  DELETE /{distributor_id}/manual-stock/{entry_id}   — delete (only while draft)

Lifecycle:
  draft     → entry recorded; stock NOT yet added
  confirmed → stock added to distributor_stock at the default location
  cancelled → if confirmed, stock is reversed; if draft, just marked cancelled
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from routes.distributors import can_manage_distributor_data

router = APIRouter()
logger = logging.getLogger(__name__)


# --------- helpers ---------

async def _get_distributor_or_404(distributor_id: str, tenant_id: str) -> dict:
    dist = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0})
    if not dist:
        raise HTTPException(status_code=404, detail="Distributor not found")
    # Locations live in a separate collection — pull them so _default_location_id can resolve.
    dist["locations"] = await db.distributor_locations.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0}
    ).to_list(50)
    return dist


def _ensure_self_managed(distributor: dict) -> None:
    if not distributor.get("is_self_managed"):
        raise HTTPException(
            status_code=400,
            detail="Manual stock entries are only available for self-managed distributors. "
                   "Stock for non-self-managed distributors flows in through factory shipments.",
        )


def _default_location_id(distributor: dict) -> tuple[str, str]:
    locations = distributor.get("locations") or []
    if not locations:
        raise HTTPException(status_code=400, detail="Distributor has no warehouse locations configured.")
    # Pick the default flagged location; fall back to the first one
    default = next((loc for loc in locations if loc.get("is_default")), None) or locations[0]
    return default["id"], default.get("location_name") or default.get("city") or "Warehouse"


async def _apply_stock_delta(
    *, tenant_id: str, distributor_id: str, location_id: str, location_name: Optional[str],
    distributor_name: Optional[str], sku_id: str, sku_name: Optional[str], sku_code: Optional[str], delta: int
) -> None:
    """Upsert distributor_stock by the given (signed) delta."""
    now = datetime.now(timezone.utc).isoformat()
    await db.distributor_stock.update_one(
        {
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "distributor_location_id": location_id,
            "sku_id": sku_id,
        },
        {
            "$inc": {"quantity": int(delta)},
            "$set": {
                "sku_name": sku_name,
                "sku_code": sku_code,
                "distributor_name": distributor_name,
                "location_name": location_name,
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "distributor_id": distributor_id,
                "distributor_location_id": location_id,
                "sku_id": sku_id,
                "created_at": now,
            },
        },
        upsert=True,
    )


# --------- list ---------

@router.get("/{distributor_id}/manual-stock")
async def list_manual_stock_entries(
    distributor_id: str,
    status: Optional[str] = Query(None, description="draft | confirmed | cancelled"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised to view this distributor's stock entries")
    tenant_id = get_current_tenant_id()
    distributor = await _get_distributor_or_404(distributor_id, tenant_id)
    _ensure_self_managed(distributor)

    q = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    if status:
        q["status"] = status

    total = await db.distributor_manual_stock_entries.count_documents(q)
    entries = await (
        db.distributor_manual_stock_entries.find(q, {"_id": 0})
        .sort([("entry_date", -1), ("created_at", -1)])
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(page_size)
    )
    return {
        "entries": entries,
        "total": total,
        "page": page,
        "page_size": page_size,
        "summary": {
            "draft": await db.distributor_manual_stock_entries.count_documents({**q, "status": "draft"}),
            "confirmed": await db.distributor_manual_stock_entries.count_documents({**q, "status": "confirmed"}),
            "cancelled": await db.distributor_manual_stock_entries.count_documents({**q, "status": "cancelled"}),
        },
    }


# --------- create ---------

@router.post("/{distributor_id}/manual-stock")
async def create_manual_stock_entry(
    distributor_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised to create stock entries for this distributor")
    tenant_id = get_current_tenant_id()
    distributor = await _get_distributor_or_404(distributor_id, tenant_id)
    _ensure_self_managed(distributor)

    sku_id = (payload or {}).get("sku_id")
    quantity = int((payload or {}).get("quantity") or 0)
    if not sku_id:
        raise HTTPException(status_code=400, detail="sku_id is required")
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity must be > 0")

    sku = await db.master_skus.find_one({"id": sku_id}, {"_id": 0})
    if not sku:
        raise HTTPException(status_code=400, detail="SKU not found")

    location_id, location_name = _default_location_id(distributor)
    now = datetime.now(timezone.utc).isoformat()

    entry = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "distributor_name": distributor.get("distributor_name"),
        "distributor_location_id": location_id,
        "distributor_location_name": location_name,
        "sku_id": sku_id,
        "sku_name": sku.get("name") or sku.get("sku_name"),
        "sku_code": sku.get("sku_code"),
        "quantity": quantity,
        "batch_number": (payload.get("batch_number") or "").strip() or None,
        "entry_date": (payload.get("entry_date") or now[:10]),
        "remarks": (payload.get("remarks") or "").strip() or None,
        "status": "draft",
        "created_at": now,
        "created_by": current_user.get("id"),
        "created_by_email": current_user.get("email"),
        "updated_at": now,
    }
    await db.distributor_manual_stock_entries.insert_one(entry)
    entry.pop("_id", None)
    logger.info(
        f"Manual stock entry created for {distributor.get('distributor_name')} "
        f"(qty {quantity} of {entry['sku_name']}) by {current_user.get('email')}"
    )
    return {"message": "Stock entry created as Draft", "entry": entry}


# --------- edit (draft only) ---------

@router.put("/{distributor_id}/manual-stock/{entry_id}")
async def update_manual_stock_entry(
    distributor_id: str,
    entry_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    distributor = await _get_distributor_or_404(distributor_id, tenant_id)
    _ensure_self_managed(distributor)

    entry = await db.distributor_manual_stock_entries.find_one(
        {"id": entry_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Stock entry not found")
    if entry.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Only draft entries can be edited")

    update: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}

    if "quantity" in payload:
        qty = int(payload.get("quantity") or 0)
        if qty <= 0:
            raise HTTPException(status_code=400, detail="quantity must be > 0")
        update["quantity"] = qty

    if "sku_id" in payload and payload["sku_id"] and payload["sku_id"] != entry.get("sku_id"):
        sku = await db.master_skus.find_one({"id": payload["sku_id"]}, {"_id": 0})
        if not sku:
            raise HTTPException(status_code=400, detail="SKU not found")
        update["sku_id"] = sku["id"]
        update["sku_name"] = sku.get("name") or sku.get("sku_name")
        update["sku_code"] = sku.get("sku_code")

    for k in ("batch_number", "entry_date", "remarks"):
        if k in payload:
            val = payload[k]
            if isinstance(val, str):
                val = val.strip() or None
            update[k] = val

    await db.distributor_manual_stock_entries.update_one(
        {"id": entry_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"$set": update},
    )
    refreshed = await db.distributor_manual_stock_entries.find_one(
        {"id": entry_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    return {"message": "Stock entry updated", "entry": refreshed}


# --------- confirm (draft -> confirmed, adds stock) ---------

@router.post("/{distributor_id}/manual-stock/{entry_id}/confirm")
async def confirm_manual_stock_entry(
    distributor_id: str,
    entry_id: str,
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    distributor = await _get_distributor_or_404(distributor_id, tenant_id)
    _ensure_self_managed(distributor)

    entry = await db.distributor_manual_stock_entries.find_one(
        {"id": entry_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Stock entry not found")
    if entry.get("status") != "draft":
        raise HTTPException(status_code=400, detail=f"Only draft entries can be confirmed (current: {entry.get('status')})")

    now = datetime.now(timezone.utc).isoformat()

    await _apply_stock_delta(
        tenant_id=tenant_id,
        distributor_id=distributor_id,
        location_id=entry["distributor_location_id"],
        location_name=entry.get("distributor_location_name"),
        distributor_name=entry.get("distributor_name"),
        sku_id=entry["sku_id"],
        sku_name=entry.get("sku_name"),
        sku_code=entry.get("sku_code"),
        delta=int(entry["quantity"]),
    )

    await db.distributor_manual_stock_entries.update_one(
        {"id": entry_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"$set": {
            "status": "confirmed",
            "confirmed_at": now,
            "confirmed_by": current_user.get("id"),
            "confirmed_by_email": current_user.get("email"),
            "updated_at": now,
        }},
    )
    logger.info(f"Manual stock entry {entry_id} confirmed by {current_user.get('email')}")
    return {"message": f"Stock entry confirmed. {entry['quantity']} units added to {entry.get('distributor_location_name')}.", "status": "confirmed"}


# --------- cancel ---------

@router.post("/{distributor_id}/manual-stock/{entry_id}/cancel")
async def cancel_manual_stock_entry(
    distributor_id: str,
    entry_id: str,
    payload: Optional[dict] = None,
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    distributor = await _get_distributor_or_404(distributor_id, tenant_id)
    _ensure_self_managed(distributor)

    entry = await db.distributor_manual_stock_entries.find_one(
        {"id": entry_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Stock entry not found")
    if entry.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Already cancelled")

    now = datetime.now(timezone.utc).isoformat()
    reason = ((payload or {}).get("reason") or "").strip()

    # If it was confirmed, reverse the stock add. Block if current on-hand can't cover the reversal.
    if entry.get("status") == "confirmed":
        on_hand_doc = await db.distributor_stock.find_one(
            {
                "tenant_id": tenant_id,
                "distributor_id": distributor_id,
                "distributor_location_id": entry["distributor_location_id"],
                "sku_id": entry["sku_id"],
            },
            {"_id": 0, "quantity": 1},
        )
        on_hand = int((on_hand_doc or {}).get("quantity") or 0)
        if on_hand < int(entry["quantity"]):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot cancel — current on-hand stock ({on_hand}) is less than the entry quantity "
                    f"({entry['quantity']}). The stock has likely already been delivered out. "
                    "Adjust manually or contact the Distribution Manager."
                ),
            )
        await _apply_stock_delta(
            tenant_id=tenant_id,
            distributor_id=distributor_id,
            location_id=entry["distributor_location_id"],
            location_name=entry.get("distributor_location_name"),
            distributor_name=entry.get("distributor_name"),
            sku_id=entry["sku_id"],
            sku_name=entry.get("sku_name"),
            sku_code=entry.get("sku_code"),
            delta=-int(entry["quantity"]),
        )

    await db.distributor_manual_stock_entries.update_one(
        {"id": entry_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": now,
            "cancelled_by": current_user.get("id"),
            "cancelled_by_email": current_user.get("email"),
            "cancellation_reason": reason or None,
            "updated_at": now,
        }},
    )
    return {"message": "Stock entry cancelled", "status": "cancelled"}


# --------- delete (draft only) ---------

@router.delete("/{distributor_id}/manual-stock/{entry_id}")
async def delete_manual_stock_entry(
    distributor_id: str,
    entry_id: str,
    current_user: dict = Depends(get_current_user),
):
    if not can_manage_distributor_data(current_user, distributor_id):
        raise HTTPException(status_code=403, detail="Not authorised")
    tenant_id = get_current_tenant_id()
    distributor = await _get_distributor_or_404(distributor_id, tenant_id)
    _ensure_self_managed(distributor)

    entry = await db.distributor_manual_stock_entries.find_one(
        {"id": entry_id, "tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0}
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Stock entry not found")
    if entry.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Only draft entries can be deleted — confirmed entries must be cancelled instead.")

    await db.distributor_manual_stock_entries.delete_one(
        {"id": entry_id, "tenant_id": tenant_id, "distributor_id": distributor_id}
    )
    return {"message": "Draft entry deleted"}
