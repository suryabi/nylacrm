"""Branding Entries (Model C, Phase 2 of the parent/child SKU hierarchy).

A Branding Entry reclassifies on-hand warehouse stock between classifications
of the SAME parent SKU — typically Generic (unbranded) → a customer-branded
child SKU after labels are applied. It never changes total on-hand quantity,
only the classification split. NO approval is required (per business decision).

Endpoints (mounted at `/branding-entries`):
  GET  /stock-breakdown   per-classification on-hand for (warehouse, sku)
  GET  /                  list entries (audit trail)
  POST /                  create an entry → moves qty between classifications
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import db, get_tenant_db
from core.tenant import get_current_tenant_id
from deps import get_current_user

router = APIRouter()


class BrandingEntryCreate(BaseModel):
    warehouse_location_id: str
    sku_id: str
    # None = Generic (unbranded) on either side
    from_child_sku_id: Optional[str] = None
    to_child_sku_id: Optional[str] = None
    quantity: int = Field(..., gt=0, description="Bottles to reclassify")
    notes: Optional[str] = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _next_entry_number(tenant_id: str) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"BRD-{year}-"
    latest = await db.branding_entries.find_one(
        {"tenant_id": tenant_id, "entry_number": {"$regex": f"^{prefix}"}},
        {"_id": 0, "entry_number": 1},
        sort=[("entry_number", -1)],
    )
    next_num = 1
    if latest and latest.get("entry_number"):
        try:
            next_num = int(latest["entry_number"].split("-")[-1]) + 1
        except (ValueError, IndexError):
            pass
    return f"{prefix}{next_num:04d}"


async def _load_location(tenant_id: str, location_id: str) -> dict:
    loc = await db.distributor_locations.find_one(
        {"id": location_id, "tenant_id": tenant_id}, {"_id": 0},
    )
    if not loc:
        raise HTTPException(400, "Warehouse location not found")
    return loc


def _stock_coll_and_base(loc: dict, tenant_id: str):
    """Return (collection, base_query) routed by warehouse kind."""
    if loc.get("is_factory"):
        return db.factory_warehouse_stock, {
            "tenant_id": tenant_id, "warehouse_location_id": loc["id"],
        }
    return db.distributor_stock, {
        "tenant_id": tenant_id,
        "distributor_id": loc.get("distributor_id"),
        "distributor_location_id": loc["id"],
    }


async def account_ref_set(tenant_id: str, account_id) -> set:
    """All identifiers that may reference an account on a child SKU:
    its UUID `id`, its business code `account_id`, and the source `lead_id`
    (children created before a lead→account conversion keep the lead's id).
    Makes branded-stock account matching resilient to reference drift."""
    if not account_id:
        return set()
    acc = await db.accounts.find_one(
        {"tenant_id": tenant_id, "$or": [{"id": account_id}, {"account_id": account_id}]},
        {"_id": 0, "id": 1, "account_id": 1, "lead_id": 1},
    )
    refs = {account_id}
    if acc:
        refs |= {v for v in (acc.get("id"), acc.get("account_id"), acc.get("lead_id")) if v}
    return refs


async def _resolve_child(tdb, child_sku_id: str, sku_id: str) -> dict:
    child = await tdb.child_skus.find_one({"id": child_sku_id}, {"_id": 0})
    if not child:
        raise HTTPException(404, "Child SKU not found")
    if child.get("parent_sku_id") != sku_id:
        raise HTTPException(400, f"Child SKU '{child.get('child_sku_name')}' does not belong to the selected parent SKU.")
    if child.get("is_active") is False:
        raise HTTPException(400, f"Child SKU '{child.get('child_sku_name')}' is inactive.")
    return child


@router.get("/stock-breakdown")
async def stock_breakdown(
    warehouse_location_id: str = Query(...),
    sku_id: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Per-classification on-hand (bottles) for a SKU at a warehouse.
    Rows: `{child_sku_id (None=Generic), child_sku_name, quantity}`."""
    _ = current_user
    tenant_id = get_current_tenant_id()
    loc = await _load_location(tenant_id, warehouse_location_id)
    coll, base = _stock_coll_and_base(loc, tenant_id)
    rows = await coll.find(
        {**base, "sku_id": sku_id},
        {"_id": 0, "child_sku_id": 1, "child_sku_name": 1, "quantity": 1, "batch_id": 1, "batch_code": 1},
    ).to_list(500)
    agg: dict = {}
    for r in rows:
        k = r.get("child_sku_id") or None
        b = agg.setdefault(k, {
            "child_sku_id": k,
            "child_sku_name": r.get("child_sku_name"),
            "quantity": 0,
        })
        b["quantity"] += int(r.get("quantity") or 0)
    out = sorted(agg.values(), key=lambda x: (x["child_sku_id"] is not None, x.get("child_sku_name") or ""))
    return {"breakdown": out, "is_factory": bool(loc.get("is_factory"))}


@router.get("/")
@router.get("")
async def list_branding_entries(
    warehouse_location_id: Optional[str] = None,
    sku_id: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    tenant_id = get_current_tenant_id()
    page = max(page, 1)
    limit = max(min(limit, 100), 1)
    q: dict = {"tenant_id": tenant_id}
    if warehouse_location_id:
        q["warehouse_location_id"] = warehouse_location_id
    if sku_id:
        q["sku_id"] = sku_id
    total = await db.branding_entries.count_documents(q)
    rows = await db.branding_entries.find(q, {"_id": 0}) \
        .sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {"items": rows, "total": total, "page": page, "limit": limit,
            "pages": (total + limit - 1) // limit if total else 0}


@router.post("/")
@router.post("")
async def create_branding_entry(payload: BrandingEntryCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()

    from_id = payload.from_child_sku_id or None
    to_id = payload.to_child_sku_id or None
    if from_id == to_id:
        raise HTTPException(400, "Source and target classifications must be different.")

    loc = await _load_location(tenant_id, payload.warehouse_location_id)
    sku = await db.master_skus.find_one({"id": payload.sku_id}, {"_id": 0, "id": 1, "sku_name": 1, "allows_child_skus": 1})
    if not sku:
        raise HTTPException(404, "SKU not found")

    from_child = await _resolve_child(tdb, from_id, payload.sku_id) if from_id else None
    to_child = await _resolve_child(tdb, to_id, payload.sku_id) if to_id else None

    coll, base = _stock_coll_and_base(loc, tenant_id)
    from_q = {**base, "sku_id": payload.sku_id,
              "child_sku_id": from_id if from_id else {"$in": [None]}}
    from_rows = await coll.find(from_q, {"_id": 0}).sort("created_at", 1).to_list(500)
    available = sum(int(r.get("quantity") or 0) for r in from_rows)
    if payload.quantity > available:
        src_label = from_child.get("child_sku_name") if from_child else "Generic"
        raise HTTPException(
            400,
            f"Insufficient {src_label} stock of '{sku.get('sku_name')}' at "
            f"'{loc.get('location_name')}': requested {payload.quantity} bottles, available {available}.",
        )

    now = _now_iso()
    # Deduct FIFO across the source rows, crediting the matching (batch-aware)
    # target row for each slice so batch lineage is preserved.
    remaining = payload.quantity
    moves = []
    for r in from_rows:
        if remaining <= 0:
            break
        take = min(remaining, int(r.get("quantity") or 0))
        if take <= 0:
            continue
        remaining -= take
        await coll.update_one(
            {**base, "sku_id": payload.sku_id,
             "batch_id": r.get("batch_id") if r.get("batch_id") else {"$in": [None]},
             "child_sku_id": from_id if from_id else {"$in": [None]}},
            {"$inc": {"quantity": -take}, "$set": {"updated_at": now}},
        )
        to_key = {**base, "sku_id": payload.sku_id,
                  "batch_id": r.get("batch_id") if r.get("batch_id") else {"$in": [None]},
                  "child_sku_id": to_id if to_id else {"$in": [None]}}
        on_insert = {k: v for k, v in r.items() if k not in ("quantity", "updated_at", "child_sku_id", "child_sku_name", "child_sku_code", "id")}
        on_insert.update({
            "id": str(uuid.uuid4()),
            "child_sku_id": to_id,
            "child_sku_name": to_child.get("child_sku_name") if to_child else None,
            "child_sku_code": to_child.get("child_sku_code") if to_child else None,
            "created_at": now,
        })
        await coll.update_one(
            to_key,
            {"$inc": {"quantity": take}, "$setOnInsert": on_insert, "$set": {"updated_at": now}},
            upsert=True,
        )
        moves.append({"batch_id": r.get("batch_id"), "batch_code": r.get("batch_code"), "quantity": take})

    entry = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "entry_number": await _next_entry_number(tenant_id),
        "warehouse_location_id": payload.warehouse_location_id,
        "warehouse_name": loc.get("location_name"),
        "is_factory": bool(loc.get("is_factory")),
        "sku_id": payload.sku_id,
        "sku_name": sku.get("sku_name"),
        "from_child_sku_id": from_id,
        "from_child_sku_name": from_child.get("child_sku_name") if from_child else None,
        "to_child_sku_id": to_id,
        "to_child_sku_name": to_child.get("child_sku_name") if to_child else None,
        "quantity": payload.quantity,
        "moves": moves,
        "notes": payload.notes or "",
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name") or current_user.get("email"),
        "created_at": now,
    }
    await db.branding_entries.insert_one(dict(entry))
    entry.pop("_id", None)
    return entry
