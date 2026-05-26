"""Distributor → Stock Transfers (inter-warehouse stock movement).

Endpoints (mounted at `/distributor/stock-transfers`):
  GET    /                  list transfers (filters: distributor_id, sku_id, status, date range, search)
  GET    /eligible-sources  list warehouses with positive stock (used by the create form)
  GET    /eligible-targets  list warehouses the user can transfer INTO
  POST   /                  create a transfer → applies inventory move + pushes a Zoho doc
  GET    /{id}              detail
  POST   /{id}/retry-zoho   re-attempt the Zoho push for a transfer that failed it

Rules:
  • Stock is deducted from source and added to destination atomically (within a
    Mongo transaction-style sequence — failures roll back the move).
  • Zoho document type:
       - Delivery Challan   iff (source AND dest distributors are both self-managed)
                            AND  (source.gstin == dest.gstin), both present.
       - Tax Invoice        otherwise — re-uses the existing `create_invoice_for_delivery`
                            shape but is generated from this transfer.
  • Source and destination distributor locations must belong to the same tenant.
  • Quantities per SKU must be > 0 and ≤ available stock at the source.
"""
from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from services.zoho_service import (
    create_delivery_challan_for_stock_transfer,
    create_invoice_for_delivery,
    fetch_delivery_challan_pdf,
    fetch_invoice_pdf,
    is_zoho_configured,
    MissingZohoMappingError,
    MissingAgreedPriceError,
    AccountNotLinkedToZohoError,
)
from utils.eway_bill import build_eway_bill_payload

logger = logging.getLogger(__name__)
router = APIRouter()


# ──────────────────────────────────────────────────────────────
# Pydantic models
# ──────────────────────────────────────────────────────────────
class TransferItem(BaseModel):
    sku_id: str
    sku_name: Optional[str] = None
    # Packaging-type captured from the SKU's packaging_config.stock_out catalog.
    # The user enters quantity in WHOLE PACKAGES (e.g. 5 crates), not units/bottles.
    packaging_type_id: Optional[str] = None
    packaging_type_name: str  # "Crate - 12", "Carton - 6", etc.
    units_per_package: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0, description="Number of packages (crates / cartons) to transfer")
    # NOTE: Per-package rate is auto-derived from the destination distributor's
    # commercials (distributor_margin_matrix.transfer_price × units_per_package).
    # Any client-supplied value here is ignored — the server is the source of truth.
    rate: float = 0.0


class StockTransferCreate(BaseModel):
    source_distributor_id: str
    source_location_id: str
    dest_distributor_id: str
    dest_location_id: str
    items: List[TransferItem]
    transfer_date: Optional[str] = None  # ISO date — defaults to today
    notes: Optional[str] = None
    vehicle_number: Optional[str] = None


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────
async def _next_transfer_number(tenant_id: str) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"ST-{year}-"
    latest = await db.distributor_stock_transfers.find_one(
        {"tenant_id": tenant_id, "transfer_number": {"$regex": f"^{prefix}"}},
        {"_id": 0, "transfer_number": 1},
        sort=[("transfer_number", -1)],
    )
    next_num = 1
    if latest and latest.get("transfer_number"):
        try:
            next_num = int(latest["transfer_number"].split("-")[-1]) + 1
        except (ValueError, IndexError):
            pass
    return f"{prefix}{next_num:04d}"


async def _load_distributor(tenant_id: str, distributor_id: str) -> dict:
    doc = await db.distributors.find_one({"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(400, f"Distributor {distributor_id} not found")
    return doc


async def _load_location(tenant_id: str, location_id: str) -> dict:
    doc = await db.distributor_locations.find_one({"id": location_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(400, f"Distributor location {location_id} not found")
    return doc


def _extract_pan(gstin: Optional[str]) -> str:
    """Return the 10-character PAN embedded in a GSTIN (positions 3-12).
    Returns '' if the GSTIN is missing or shorter than 12 chars.

    Indian GSTIN format: <2-digit state code><10-char PAN><1-char entity><'Z'><checksum>.
    Two branches of the SAME legal entity registered in different states share
    the same PAN but have different state-code prefixes — so PAN matching is
    the correct proxy for "same legal entity".
    """
    s = (gstin or "").strip().upper()
    return s[2:12] if len(s) >= 12 else ""


def _qualifies_for_challan(src_distributor: dict, dst_distributor: dict,
                           src_location: dict, dst_location: dict) -> bool:
    """Per Indian GST: a Delivery Challan is appropriate iff both warehouses are
    *self-managed* (same legal entity) AND share the EXACT SAME GSTIN.

    A company holding different GSTINs in different states is treated as different
    GST registrations for compliance purposes — inter-state branch transfers between
    those registrations require a Tax Invoice, NOT a Delivery Challan. So we compare
    full GSTINs, not just the PAN portion.
    """
    if not (src_distributor.get("is_self_managed") and dst_distributor.get("is_self_managed")):
        return False
    # Effective GSTIN — location-level override falls back to parent distributor.
    src_gstin = (src_location.get("gstin") or src_distributor.get("gstin") or "").strip().upper()
    dst_gstin = (dst_location.get("gstin") or dst_distributor.get("gstin") or "").strip().upper()
    if not src_gstin or not dst_gstin:
        return False
    return src_gstin == dst_gstin


async def _adjust_distributor_stock(tenant_id: str, distributor_id: str, location_id: str,
                                     item: TransferItem, delta_units: int, *,
                                     distributor_name: str, location_name: str):
    """Add/subtract `delta_units` (bottles) in `distributor_stock` for (distributor, location, sku)."""
    now = datetime.now(timezone.utc).isoformat()
    res = await db.distributor_stock.update_one(
        {
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "distributor_location_id": location_id,
            "sku_id": item.sku_id,
        },
        {
            "$inc": {"quantity": delta_units},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "distributor_id": distributor_id,
                "distributor_location_id": location_id,
                "sku_id": item.sku_id,
                "sku_name": item.sku_name,
                "distributor_name": distributor_name,
                "location_name": location_name,
                "created_at": now,
            },
            "$set": {"updated_at": now},
        },
        upsert=True,
    )
    return res


async def _adjust_factory_stock(tenant_id: str, warehouse_location_id: str,
                                 item: TransferItem, delta_units: int, *,
                                 warehouse_name: str):
    """Add/subtract `delta_units` (bottles) in `factory_warehouse_stock` for the warehouse + sku.

    Mirrors how Production QC writes to this collection (warehouse_location_id +
    sku_id is the natural key; `quantity` is bottle-level). `bottles_per_crate`
    is best-effort populated from the transfer item's `units_per_package`.
    """
    now = datetime.now(timezone.utc).isoformat()
    res = await db.factory_warehouse_stock.update_one(
        {
            "tenant_id": tenant_id,
            "warehouse_location_id": warehouse_location_id,
            "sku_id": item.sku_id,
        },
        {
            "$inc": {"quantity": delta_units},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "warehouse_location_id": warehouse_location_id,
                "warehouse_name": warehouse_name,
                "sku_id": item.sku_id,
                "sku_name": item.sku_name,
                "bottles_per_crate": int(item.units_per_package) if item.units_per_package else None,
                "created_at": now,
            },
            "$set": {"updated_at": now},
        },
        upsert=True,
    )
    return res


async def _adjust_stock_for_location(tenant_id: str, location: dict, item: TransferItem,
                                      delta_units: int, *, distributor_name: str):
    """Dispatch to the correct stock collection based on `location.is_factory`."""
    if location.get("is_factory"):
        return await _adjust_factory_stock(
            tenant_id, location["id"], item, delta_units,
            warehouse_name=location.get("location_name") or "",
        )
    return await _adjust_distributor_stock(
        tenant_id, location["distributor_id"], location["id"], item, delta_units,
        distributor_name=distributor_name, location_name=location.get("location_name") or "",
    )


async def _read_source_stock(tenant_id: str, source_loc: dict, sku_ids: list) -> dict:
    """Return `{sku_id: {sku_id, sku_name, quantity}}` for the source warehouse,
    pulling from either `factory_warehouse_stock` or `distributor_stock` based on
    whether the source location is a factory warehouse."""
    if source_loc.get("is_factory"):
        rows = await db.factory_warehouse_stock.find(
            {
                "tenant_id": tenant_id,
                "warehouse_location_id": source_loc["id"],
                "sku_id": {"$in": sku_ids},
            },
            {"_id": 0, "sku_id": 1, "sku_name": 1, "quantity": 1},
        ).to_list(len(sku_ids) + 1)
    else:
        rows = await db.distributor_stock.find(
            {
                "tenant_id": tenant_id,
                "distributor_id": source_loc["distributor_id"],
                "distributor_location_id": source_loc["id"],
                "sku_id": {"$in": sku_ids},
            },
            {"_id": 0, "sku_id": 1, "sku_name": 1, "quantity": 1},
        ).to_list(len(sku_ids) + 1)
    return {r["sku_id"]: r for r in rows}


async def _resolve_per_bottle_rate(
    tenant_id: str,
    sku_id: str,
) -> Optional[dict]:
    """Look up the per-bottle rate for a Stock Transfer from `master_skus.base_price`.

    Stock transfers are pure logistics (internal moves OR Schedule-I supplies
    between distinct GSTINs of the same legal entity) — NO margin is involved.
    The price used for the Tax Invoice / Delivery Challan / E-way Bill is the
    SKU's company-wide list price (`base_price`), set on the SKU master record.

    Returns `{rate_per_bottle, source: 'master_sku.base_price', sku_id, sku_name}`
    or None if no base_price is set.
    """
    if not sku_id:
        return None
    sku = await db.master_skus.find_one(
        {"id": sku_id},
        {"_id": 0, "id": 1, "sku_name": 1, "base_price": 1},
    )
    if not sku:
        return None
    base_price = sku.get("base_price")
    if base_price is None:
        return None
    try:
        bp = float(base_price)
    except (TypeError, ValueError):
        return None
    if bp <= 0:
        return None
    return {
        "rate_per_bottle": bp,
        "base_price": bp,
        "source": "master_sku.base_price",
        "sku_id": sku.get("id"),
        "sku_name": sku.get("sku_name"),
    }


# ──────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────
@router.get("/resolve-rate")
async def resolve_transfer_rate(
    sku_id: str = Query(...),
    units_per_package: int = Query(..., gt=0),
    current_user: dict = Depends(get_current_user),
):
    """Look up the per-bottle rate for a Stock Transfer line from `master_skus.base_price`.

    Stock Transfers have NO margin — the price is the SKU's company-wide
    base/list price, used for the Tax Invoice / Delivery Challan value and
    E-way Bill consignment valuation.

    Returns `{ ok, rate_per_bottle, rate_per_package, details }` or
    `{ ok:false, reason }` so the UI can render a clear "Set the SKU base_price"
    error and block save.
    """
    _ = current_user
    tenant_id = get_current_tenant_id()
    found = await _resolve_per_bottle_rate(tenant_id, sku_id)
    if not found:
        sku_doc = await db.master_skus.find_one({"id": sku_id}, {"_id": 0, "sku_name": 1}) or {}
        return {
            "ok": False,
            "reason": (
                f"No Base Price set for SKU '{sku_doc.get('sku_name') or sku_id}'. "
                "Set it under Settings → SKU Management (it's the company-wide list "
                "price used for Stock Transfer invoicing — no margin)."
            ),
        }
    rate_per_pkg = round(float(found["rate_per_bottle"]) * int(units_per_package), 2)
    return {
        "ok": True,
        "rate_per_bottle": round(float(found["rate_per_bottle"]), 4),
        "rate_per_package": rate_per_pkg,
        "details": found,
    }


@router.get("/warehouse-stock-overview")
async def warehouse_stock_overview(current_user: dict = Depends(get_current_user)):
    """Cross-collection warehouse stock overview (safety dashboard).

    Aggregates `distributor_stock` + `factory_warehouse_stock` keyed by warehouse
    so admins can see every location's on-hand in one table. Flags rows whose
    stock lives in the *wrong* collection (e.g. factory stock saved against a
    distributor warehouse) and surfaces orphan rows pointing at deleted locations.
    """
    tenant_id = get_current_tenant_id()

    locs = await db.distributor_locations.find(
        {"tenant_id": tenant_id, "status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "distributor_id": 1, "location_name": 1, "is_factory": 1,
         "city": 1, "state": 1, "gstin": 1},
    ).to_list(2000)
    loc_by_id = {loc["id"]: loc for loc in locs}

    dist_ids = list({loc.get("distributor_id") for loc in locs if loc.get("distributor_id")})
    dists = {d["id"]: d for d in await db.distributors.find(
        {"tenant_id": tenant_id, "id": {"$in": dist_ids}},
        {"_id": 0, "id": 1, "distributor_name": 1, "is_self_managed": 1},
    ).to_list(len(dist_ids) + 1)} if dist_ids else {}

    d_rows = await db.distributor_stock.find(
        {"tenant_id": tenant_id, "quantity": {"$gt": 0}},
        {"_id": 0, "distributor_location_id": 1, "sku_id": 1, "sku_name": 1, "quantity": 1},
    ).to_list(20000)
    f_rows = await db.factory_warehouse_stock.find(
        {"tenant_id": tenant_id, "quantity": {"$gt": 0}},
        {"_id": 0, "warehouse_location_id": 1, "sku_id": 1, "sku_name": 1, "quantity": 1,
         "bottles_per_crate": 1},
    ).to_list(20000)

    warehouses: dict = {}
    orphans: list = []
    factory_total = 0
    distributor_total = 0

    def _bucket_for(lid: str, loc: dict) -> dict:
        return warehouses.setdefault(lid, {
            "location_id": lid,
            "location_name": loc.get("location_name"),
            "distributor_name": (dists.get(loc.get("distributor_id")) or {}).get("distributor_name"),
            "is_factory": bool(loc.get("is_factory")),
            "city": loc.get("city"), "state": loc.get("state"), "gstin": loc.get("gstin"),
            "items_distributor": [], "items_factory": [], "total_bottles": 0,
        })

    for r in d_rows:
        lid = r.get("distributor_location_id")
        loc = loc_by_id.get(lid)
        if not loc:
            orphans.append({
                "collection": "distributor_stock", "sku_id": r.get("sku_id"),
                "sku_name": r.get("sku_name"), "bottles": int(r.get("quantity") or 0),
                "hint": f"row points at unknown location_id={lid}",
            })
            continue
        b = _bucket_for(lid, loc)
        b["items_distributor"].append({
            "sku_id": r.get("sku_id"), "sku_name": r.get("sku_name"),
            "bottles": int(r.get("quantity") or 0),
        })
        b["total_bottles"] += int(r.get("quantity") or 0)
        distributor_total += int(r.get("quantity") or 0)
        if loc.get("is_factory"):
            b.setdefault("warnings", []).append(
                f"SKU '{r.get('sku_name')}' has {int(r.get('quantity') or 0)} bottles in distributor_stock "
                "but this warehouse is marked Factory — expected factory_warehouse_stock."
            )

    for r in f_rows:
        lid = r.get("warehouse_location_id")
        loc = loc_by_id.get(lid)
        if not loc:
            orphans.append({
                "collection": "factory_warehouse_stock", "sku_id": r.get("sku_id"),
                "sku_name": r.get("sku_name"), "bottles": int(r.get("quantity") or 0),
                "hint": f"row points at unknown location_id={lid}",
            })
            continue
        b = _bucket_for(lid, loc)
        b["items_factory"].append({
            "sku_id": r.get("sku_id"), "sku_name": r.get("sku_name"),
            "bottles": int(r.get("quantity") or 0),
            "bottles_per_crate": r.get("bottles_per_crate"),
        })
        b["total_bottles"] += int(r.get("quantity") or 0)
        factory_total += int(r.get("quantity") or 0)
        if not loc.get("is_factory"):
            b.setdefault("warnings", []).append(
                f"SKU '{r.get('sku_name')}' has {int(r.get('quantity') or 0)} bottles in factory_warehouse_stock "
                "but this warehouse is NOT marked Factory — expected distributor_stock."
            )

    # Include empty warehouses
    for lid, loc in loc_by_id.items():
        _bucket_for(lid, loc)

    rows_out = sorted(
        warehouses.values(),
        key=lambda r: (not r["is_factory"], r.get("distributor_name") or "", r.get("location_name") or ""),
    )

    return {
        "warehouses": rows_out,
        "orphans": orphans,
        "totals": {
            "factory_bottles": factory_total,
            "distributor_bottles": distributor_total,
            "grand_bottles": factory_total + distributor_total,
            "warehouse_count": len(rows_out),
            "orphan_rows": len(orphans),
        },
    }


@router.get("/location-stock")
async def get_location_stock(
    location_id: str = Query(..., description="Source warehouse location id"),
    current_user: dict = Depends(get_current_user),
):
    """Return per-SKU on-hand stock (bottles) for a warehouse, transparently
    pulling from `factory_warehouse_stock` if it's a factory warehouse,
    otherwise from `distributor_stock`. Used by the New Stock Transfer dialog
    so the source picker can show availability per SKU regardless of kind.
    """
    tenant_id = get_current_tenant_id()
    loc = await _load_location(tenant_id, location_id)
    if loc.get("is_factory"):
        rows = await db.factory_warehouse_stock.find(
            {"tenant_id": tenant_id, "warehouse_location_id": location_id},
            {"_id": 0, "sku_id": 1, "sku_name": 1, "quantity": 1},
        ).to_list(2000)
    else:
        rows = await db.distributor_stock.find(
            {
                "tenant_id": tenant_id,
                "distributor_id": loc.get("distributor_id"),
                "distributor_location_id": location_id,
            },
            {"_id": 0, "sku_id": 1, "sku_name": 1, "quantity": 1},
        ).to_list(2000)
    return {"stock": rows, "is_factory": bool(loc.get("is_factory"))}


@router.get("/eligible-sources")
async def list_eligible_sources(current_user: dict = Depends(get_current_user)):
    """Return warehouses (factory + distributor) with positive stock for at least one SKU.

    Aggregates from BOTH stock collections:
      • `distributor_stock`         → regular distributor warehouses (`is_factory=false`)
      • `factory_warehouse_stock`   → factory / master warehouses    (`is_factory=true`)

    Each row carries `source_kind ∈ ('distributor', 'factory')` so the UI can
    badge and the create-transfer flow can route the inventory deduction.
    """
    tenant_id = get_current_tenant_id()

    # 1) Distributor warehouse stock
    rows_d = [r async for r in db.distributor_stock.aggregate([
        {"$match": {"tenant_id": tenant_id, "quantity": {"$gt": 0}}},
        {"$group": {"_id": {"d": "$distributor_id", "l": "$distributor_location_id"},
                    "distributor_name": {"$first": "$distributor_name"},
                    "location_name": {"$first": "$location_name"},
                    "total_qty": {"$sum": "$quantity"}}},
    ])]

    # 2) Factory warehouse stock
    rows_f = [r async for r in db.factory_warehouse_stock.aggregate([
        {"$match": {"tenant_id": tenant_id, "quantity": {"$gt": 0}}},
        {"$group": {"_id": "$warehouse_location_id",
                    "warehouse_name": {"$first": "$warehouse_name"},
                    "total_qty": {"$sum": "$quantity"}}},
    ])]

    # Collect every location_id we'll need to enrich (gstin / parent distributor)
    loc_ids = list({r["_id"]["l"] for r in rows_d if r["_id"].get("l")}
                   | {r["_id"] for r in rows_f if r["_id"]})
    locs = {loc["id"]: loc for loc in await db.distributor_locations.find(
        {"tenant_id": tenant_id, "id": {"$in": loc_ids}},
        {"_id": 0, "id": 1, "distributor_id": 1, "location_name": 1, "gstin": 1, "is_factory": 1, "city": 1, "state": 1},
    ).to_list(len(loc_ids) + 1)} if loc_ids else {}

    dist_ids = list({r["_id"]["d"] for r in rows_d if r["_id"].get("d")}
                    | {locs[r["_id"]]["distributor_id"] for r in rows_f if r["_id"] in locs})
    dists = {d["id"]: d for d in await db.distributors.find(
        {"tenant_id": tenant_id, "id": {"$in": dist_ids}},
        {"_id": 0, "id": 1, "distributor_name": 1, "is_self_managed": 1, "gstin": 1},
    ).to_list(len(dist_ids) + 1)} if dist_ids else {}

    out: dict = {}  # keyed by location_id to dedupe when the same warehouse has rows in BOTH collections
    for row in rows_d:
        lid = row["_id"]["l"]
        d = dists.get(row["_id"]["d"], {})
        loc = locs.get(lid, {})
        gstin = (loc.get("gstin") or d.get("gstin") or "").strip().upper() or None
        bucket = out.setdefault(lid, {
            "source_kind": "factory" if loc.get("is_factory") else "distributor",
            "distributor_id": row["_id"]["d"],
            "location_id": lid,
            "distributor_name": row.get("distributor_name"),
            "location_name": row.get("location_name"),
            "total_qty": 0,
            "is_self_managed": bool(d.get("is_self_managed")),
            "is_factory": bool(loc.get("is_factory")),
            "gstin": gstin,
            "pan": _extract_pan(gstin) or None,
        })
        bucket["total_qty"] += int(row.get("total_qty") or 0)
    for row in rows_f:
        lid = row["_id"]
        loc = locs.get(lid, {})
        if not loc:
            continue  # surfaced via /warehouse-stock-overview orphans
        d = dists.get(loc.get("distributor_id"), {})
        gstin = (loc.get("gstin") or d.get("gstin") or "").strip().upper() or None
        bucket = out.setdefault(lid, {
            "source_kind": "factory",
            "distributor_id": loc.get("distributor_id"),
            "location_id": lid,
            "distributor_name": d.get("distributor_name"),
            "location_name": row.get("warehouse_name") or loc.get("location_name"),
            "total_qty": 0,
            "is_self_managed": bool(d.get("is_self_managed")),
            "is_factory": True,
            "gstin": gstin,
            "pan": _extract_pan(gstin) or None,
        })
        bucket["total_qty"] += int(row.get("total_qty") or 0)
        # Promote source_kind to 'factory' if this warehouse is actually a factory
        # (the distributor_stock leg may have created the bucket first with kind='distributor').
        if loc.get("is_factory"):
            bucket["source_kind"] = "factory"
            bucket["is_factory"] = True

    rows_out = sorted(out.values(),
                      key=lambda r: (r.get("distributor_name") or "", r.get("location_name") or ""))
    return {"sources": rows_out}


@router.get("/eligible-targets")
async def list_eligible_targets(
    exclude_location_id: Optional[str] = Query(None, description="Source location id to exclude"),
    current_user: dict = Depends(get_current_user),
):
    """Return ALL distributor and factory warehouses across the tenant (minus the source)."""
    tenant_id = get_current_tenant_id()
    locs = await db.distributor_locations.find(
        {"tenant_id": tenant_id, "status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "distributor_id": 1, "location_name": 1, "location_code": 1, "city": 1, "state": 1, "gstin": 1, "is_factory": 1},
    ).to_list(2000)

    dist_ids = list({loc["distributor_id"] for loc in locs if loc.get("distributor_id")})
    dists = {d["id"]: d for d in await db.distributors.find(
        {"tenant_id": tenant_id, "id": {"$in": dist_ids}},
        {"_id": 0, "id": 1, "distributor_name": 1, "is_self_managed": 1, "gstin": 1},
    ).to_list(len(dist_ids) + 1)}

    out = []
    for loc in locs:
        if exclude_location_id and loc.get("id") == exclude_location_id:
            continue
        d = dists.get(loc.get("distributor_id"), {})
        gstin = (loc.get("gstin") or d.get("gstin") or "").strip().upper() or None
        out.append({
            "location_id": loc.get("id"),
            "location_name": loc.get("location_name"),
            "location_code": loc.get("location_code"),
            "city": loc.get("city"),
            "state": loc.get("state"),
            "distributor_id": loc.get("distributor_id"),
            "distributor_name": d.get("distributor_name"),
            "is_self_managed": bool(d.get("is_self_managed")),
            "is_factory": bool(loc.get("is_factory")),
            "gstin": gstin,
            "pan": _extract_pan(gstin) or None,
        })
    return {"targets": out}


@router.get("/")
@router.get("")
async def list_stock_transfers(
    distributor_id: Optional[str] = None,
    sku_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    page = max(page, 1)
    limit = max(min(limit, 100), 1)

    q: dict = {"tenant_id": tenant_id}
    if distributor_id:
        q["$or"] = [{"source_distributor_id": distributor_id}, {"dest_distributor_id": distributor_id}]
    if sku_id:
        q["items.sku_id"] = sku_id
    if status:
        q["status"] = status
    if search:
        text_or = [
            {"transfer_number": {"$regex": search, "$options": "i"}},
            {"source_distributor_name": {"$regex": search, "$options": "i"}},
            {"dest_distributor_name": {"$regex": search, "$options": "i"}},
            {"source_location_name": {"$regex": search, "$options": "i"}},
            {"dest_location_name": {"$regex": search, "$options": "i"}},
        ]
        if "$or" in q:
            q = {"$and": [q, {"$or": text_or}]}
        else:
            q["$or"] = text_or

    total = await db.distributor_stock_transfers.count_documents(q)
    rows = await db.distributor_stock_transfers.find(q, {"_id": 0}) \
        .sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {
        "items": rows, "total": total, "page": page, "limit": limit,
        "pages": (total + limit - 1) // limit if total else 0,
    }


@router.get("/{transfer_id}")
async def get_stock_transfer(transfer_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.distributor_stock_transfers.find_one(
        {"id": transfer_id, "tenant_id": tenant_id}, {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Stock transfer not found")
    return doc


@router.post("/")
@router.post("")
async def create_stock_transfer(payload: StockTransferCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()

    if payload.source_location_id == payload.dest_location_id:
        raise HTTPException(400, "Source and destination warehouses must be different.")
    if not payload.items:
        raise HTTPException(400, "At least one item is required.")

    # Resolve all four entities up-front so we can fail-fast on bad IDs.
    src_dist = await _load_distributor(tenant_id, payload.source_distributor_id)
    dst_dist = await _load_distributor(tenant_id, payload.dest_distributor_id)
    src_loc = await _load_location(tenant_id, payload.source_location_id)
    dst_loc = await _load_location(tenant_id, payload.dest_location_id)
    if src_loc.get("distributor_id") != payload.source_distributor_id:
        raise HTTPException(400, "Source location does not belong to source distributor.")
    if dst_loc.get("distributor_id") != payload.dest_distributor_id:
        raise HTTPException(400, "Destination location does not belong to destination distributor.")

    # ── Block third-party (different PAN) transfers EARLY — they must go via Stock In ──
    # Stock Transfer is for internal logistics only (same legal entity OR strictly
    # no-margin moves). Real partner sales with margin must be raised as a Stock In
    # primary shipment so distributor commission / settlement is tracked correctly.
    src_pan = _extract_pan(src_loc.get("gstin") or src_dist.get("gstin"))
    dst_pan = _extract_pan(dst_loc.get("gstin") or dst_dist.get("gstin"))
    if src_pan and dst_pan and src_pan != dst_pan:
        raise HTTPException(
            400,
            f"Stock Transfer is for internal logistics only — source PAN ({src_pan}) "
            f"differs from destination PAN ({dst_pan}). This is a sale to a third-party "
            "distributor: raise it via Distributors → Stock In so commission / settlement "
            "and the contracted margin are applied correctly.",
        )

    # ── Stock availability check (in raw units; storage is bottles-level) ──
    # The source warehouse may be either a regular distributor warehouse
    # (`distributor_stock`) or a factory warehouse (`factory_warehouse_stock`).
    sku_ids = [it.sku_id for it in payload.items]
    stock_map = await _read_source_stock(tenant_id, src_loc, sku_ids)
    avail = {sku_id: int(r.get("quantity") or 0) for sku_id, r in stock_map.items()}
    sku_name_lookup = {sku_id: r.get("sku_name") for sku_id, r in stock_map.items()}
    insufficient = []
    for it in payload.items:
        a_units = avail.get(it.sku_id, 0)
        avail_pkgs = a_units // it.units_per_package if it.units_per_package > 0 else 0
        if it.quantity > avail_pkgs:
            insufficient.append(
                f"{(it.sku_name or sku_name_lookup.get(it.sku_id) or it.sku_id)}: "
                f"requested {it.quantity} {it.packaging_type_name}, "
                f"available {avail_pkgs} {it.packaging_type_name}"
            )
    if insufficient:
        raise HTTPException(400, "Insufficient stock at source. " + "; ".join(insufficient))

    # ── Decide Zoho document type ──
    challan_eligible = _qualifies_for_challan(src_dist, dst_dist, src_loc, dst_loc)
    zoho_doc_type = "delivery_challan" if challan_eligible else "invoice"

    # ── Auto-resolve per-package rate from the SKU master's `base_price` ──
    # Stock transfers have NO margin involved — the invoice / challan value is
    # the SKU's company-wide list price (Schedule-I / Rule 30 compliant). Any
    # client-supplied `rate` is ignored.
    resolved_rates: dict = {}  # sku_id -> {rate_per_bottle, rate_per_package, details}
    missing_pricing: list[str] = []
    for it in payload.items:
        resolved = await _resolve_per_bottle_rate(tenant_id, it.sku_id)
        if not resolved:
            missing_pricing.append(it.sku_name or sku_name_lookup.get(it.sku_id) or it.sku_id)
        else:
            resolved_rates[it.sku_id] = {
                **resolved,
                "rate_per_package": round(float(resolved["rate_per_bottle"]) * int(it.units_per_package), 2),
            }
    if missing_pricing:
        raise HTTPException(
            400,
            "No Base Price set on these SKUs: " + ", ".join(missing_pricing)
            + ". Set the per-bottle Base Price under Settings → SKU Management before "
              "creating this transfer (it's the no-margin list price used for Stock "
              "Transfer invoicing and E-way Bill valuation).",
        )

    # ── Build transfer doc (status=draft until inventory + Zoho both succeed) ──
    now = datetime.now(timezone.utc).isoformat()
    transfer_id = str(uuid.uuid4())
    transfer_number = await _next_transfer_number(tenant_id)
    items_doc = []
    for it in payload.items:
        quantity_units = int(it.quantity) * int(it.units_per_package)
        rinfo = resolved_rates[it.sku_id]
        per_pkg_rate = float(rinfo["rate_per_package"])
        items_doc.append({
            "sku_id": it.sku_id,
            "sku_name": it.sku_name or sku_name_lookup.get(it.sku_id),
            "packaging_type_id": it.packaging_type_id,
            "packaging_type_name": it.packaging_type_name,
            "units_per_package": int(it.units_per_package),
            "quantity": int(it.quantity),               # in packages (crates / cartons)
            "quantity_units": quantity_units,           # bottles / raw units (for stock storage)
            "rate": per_pkg_rate,                       # per-package rate (auto from master_skus.base_price)
            "rate_per_bottle": round(float(rinfo["rate_per_bottle"]), 4),
            "rate_source": "master_sku.base_price",
            "rate_source_entry_id": None,
            "line_total": round(int(it.quantity) * per_pkg_rate, 2),
        })
    transfer_doc = {
        "id": transfer_id,
        "tenant_id": tenant_id,
        "transfer_number": transfer_number,
        "transfer_date": (payload.transfer_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"))[:10],
        "source_distributor_id": payload.source_distributor_id,
        "source_distributor_name": src_dist.get("distributor_name"),
        "source_location_id": payload.source_location_id,
        "source_location_name": src_loc.get("location_name"),
        "source_kind": "factory" if src_loc.get("is_factory") else "distributor",
        "source_is_factory": bool(src_loc.get("is_factory")),
        "source_gstin": (src_loc.get("gstin") or src_dist.get("gstin") or "").strip().upper() or None,
        "source_pan": _extract_pan(src_loc.get("gstin") or src_dist.get("gstin")) or None,
        "source_is_self_managed": bool(src_dist.get("is_self_managed")),
        "dest_distributor_id": payload.dest_distributor_id,
        "dest_distributor_name": dst_dist.get("distributor_name"),
        "dest_location_id": payload.dest_location_id,
        "dest_location_name": dst_loc.get("location_name"),
        "dest_kind": "factory" if dst_loc.get("is_factory") else "distributor",
        "dest_is_factory": bool(dst_loc.get("is_factory")),
        "dest_gstin": (dst_loc.get("gstin") or dst_dist.get("gstin") or "").strip().upper() or None,
        "dest_pan": _extract_pan(dst_loc.get("gstin") or dst_dist.get("gstin")) or None,
        "dest_is_self_managed": bool(dst_dist.get("is_self_managed")),
        "items": items_doc,
        "total_packages": sum(it["quantity"] for it in items_doc),
        "total_units": sum(it["quantity_units"] for it in items_doc),
        "total_value": round(sum(it["line_total"] for it in items_doc), 2),
        "notes": payload.notes,
        "vehicle_number": payload.vehicle_number,
        "zoho_doc_type": zoho_doc_type,
        "zoho_status": "pending",
        "zoho_invoice_id": None,
        "zoho_invoice_number": None,
        "zoho_invoice_url": None,
        "zoho_error": None,
        "status": "draft",
        "created_at": now,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name") or current_user.get("email"),
        "updated_at": now,
    }

    # ── Apply inventory movement (units-level) — routes per-location to either
    #     distributor_stock OR factory_warehouse_stock based on `is_factory`. ──
    moved_lines = []
    src_name = src_dist.get("distributor_name") or ""
    dst_name = dst_dist.get("distributor_name") or ""
    try:
        for it in payload.items:
            units = int(it.quantity) * int(it.units_per_package)
            await _adjust_stock_for_location(
                tenant_id, src_loc, it, -units, distributor_name=src_name,
            )
            await _adjust_stock_for_location(
                tenant_id, dst_loc, it, units, distributor_name=dst_name,
            )
            moved_lines.append((it, units))
    except Exception as e:
        # Roll back whatever moved
        logger.exception("Inventory move failed; rolling back partial transfer")
        for (it, units) in moved_lines:
            await _adjust_stock_for_location(tenant_id, src_loc, it, units, distributor_name=src_name)
            await _adjust_stock_for_location(tenant_id, dst_loc, it, -units, distributor_name=dst_name)
        raise HTTPException(500, f"Failed to move stock; rolled back. ({e})")

    transfer_doc["status"] = "completed"
    await db.distributor_stock_transfers.insert_one(dict(transfer_doc))
    transfer_doc.pop("_id", None)

    # ── Zoho push (best-effort; non-fatal — user can retry via /retry-zoho) ──
    await _try_push_to_zoho(transfer_doc, src_dist, dst_dist)
    refreshed = await db.distributor_stock_transfers.find_one(
        {"id": transfer_id, "tenant_id": tenant_id}, {"_id": 0},
    )
    return refreshed


async def _try_push_to_zoho(transfer_doc: dict, src_dist: dict, dst_dist: dict) -> None:
    """Attempt the Zoho push and persist outcome on the transfer doc."""
    tenant_id = transfer_doc["tenant_id"]
    transfer_id = transfer_doc["id"]
    zoho_doc_type = transfer_doc["zoho_doc_type"]

    set_doc: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    try:
        if not is_zoho_configured():
            raise RuntimeError("Zoho Books is not configured for this environment.")

        if zoho_doc_type == "delivery_challan":
            mapping = await create_delivery_challan_for_stock_transfer(
                tenant_id=tenant_id, transfer=transfer_doc, dest_distributor=dst_dist,
            )
        else:
            # Build a synthetic "delivery" + "account" payload so we can reuse the
            # invoice builder. The destination distributor is the customer; rates
            # come from per-line `rate` on the transfer items.
            synthetic_delivery = {
                "id": transfer_doc["id"],
                "delivery_number": transfer_doc["transfer_number"],
                "delivery_date": transfer_doc["transfer_date"],
                "applied_credit_notes": [],
            }
            synthetic_account = {
                "id": dst_dist.get("id"),
                "account_name": dst_dist.get("distributor_name") or dst_dist.get("legal_entity_name"),
                "legal_entity_name": dst_dist.get("legal_entity_name"),
                "gstin": dst_dist.get("gstin"),
                "primary_contact_name": dst_dist.get("primary_contact_name"),
                "primary_contact_email": dst_dist.get("primary_contact_email"),
                "primary_contact_mobile": dst_dist.get("primary_contact_mobile"),
                "billing_address": dst_dist.get("billing_address"),
                "delivery_address": dst_dist.get("registered_address"),
                "zoho_contact_id": dst_dist.get("zoho_contact_id"),
                "payment_terms_days": 0,
                "sku_pricing": [
                    {"sku": it["sku_name"], "price_per_unit": it["rate"]} for it in transfer_doc["items"]
                ],
            }
            # Pass package-level qty to Zoho so the invoice reads "5 Crate-12" not "60 bottles".
            items_for_invoice = [
                {
                    "sku_id": it["sku_id"],
                    "sku_name": f"{it['sku_name']} · {it.get('packaging_type_name', '')}".strip(' ·'),
                    "quantity": it["quantity"],
                }
                for it in transfer_doc["items"]
            ]
            mapping = await create_invoice_for_delivery(
                tenant_id=tenant_id,
                delivery=synthetic_delivery,
                items=items_for_invoice,
                account=synthetic_account,
            )

        set_doc.update({
            "zoho_status": "synced",
            "zoho_invoice_id": mapping.get("zoho_invoice_id"),
            "zoho_invoice_number": mapping.get("zoho_invoice_number"),
            "zoho_invoice_url": mapping.get("zoho_invoice_url"),
            "zoho_doc_type": mapping.get("zoho_doc_type") or zoho_doc_type,
            "zoho_error": None,
        })
    except (MissingZohoMappingError, MissingAgreedPriceError, AccountNotLinkedToZohoError) as e:
        set_doc.update({"zoho_status": "failed", "zoho_error": str(e)})
        logger.warning(f"Zoho push skipped for stock transfer {transfer_doc.get('transfer_number')}: {e}")
    except Exception as e:
        set_doc.update({"zoho_status": "failed", "zoho_error": str(e)})
        logger.exception(f"Zoho push failed for stock transfer {transfer_doc.get('transfer_number')}")
    await db.distributor_stock_transfers.update_one(
        {"id": transfer_id, "tenant_id": tenant_id}, {"$set": set_doc},
    )


@router.post("/{transfer_id}/retry-zoho")
async def retry_zoho_push(transfer_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.distributor_stock_transfers.find_one(
        {"id": transfer_id, "tenant_id": tenant_id}, {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Stock transfer not found")
    if doc.get("zoho_status") == "synced":
        return {"ok": True, "already_synced": True, "transfer": doc}
    src_dist = await _load_distributor(tenant_id, doc["source_distributor_id"])
    dst_dist = await _load_distributor(tenant_id, doc["dest_distributor_id"])
    await _try_push_to_zoho(doc, src_dist, dst_dist)
    refreshed = await db.distributor_stock_transfers.find_one(
        {"id": transfer_id, "tenant_id": tenant_id}, {"_id": 0},
    )
    return {"ok": True, "transfer": refreshed}



@router.get("/{transfer_id}/eway-bill")
async def get_eway_bill_payload(transfer_id: str, current_user: dict = Depends(get_current_user)):
    """Return a ready-to-upload GSTN E-way Bill JSON payload for this transfer.

    Response shape:
      {
        "transfer_number": "ST-2026-0007",
        "required": true,                       # True iff grand total > ₹50,000
        "is_inter_state": false,
        "warnings": ["…"],                      # missing GSTIN / pincode / HSN / vehicle
        "totals": {taxable, cgst, sgst, igst, grand_total},
        "payload": { …GSTN single-row payload… },
        "bulk_payload": { "version": "1.0.0123", "billLists": [ payload ] }
      }

    The bulk_payload is what gets uploaded to https://ewaybill.nic.in (Bulk Upload).
    """
    tenant_id = get_current_tenant_id()
    transfer = await db.distributor_stock_transfers.find_one(
        {"id": transfer_id, "tenant_id": tenant_id}, {"_id": 0},
    )
    if not transfer:
        raise HTTPException(404, "Stock transfer not found")

    src_dist = await _load_distributor(tenant_id, transfer["source_distributor_id"])
    dst_dist = await _load_distributor(tenant_id, transfer["dest_distributor_id"])
    src_loc = await _load_location(tenant_id, transfer["source_location_id"])
    dst_loc = await _load_location(tenant_id, transfer["dest_location_id"])

    sku_ids = [it.get("sku_id") for it in transfer.get("items", []) if it.get("sku_id")]
    sku_rows = await db.master_skus.find(
        {"id": {"$in": sku_ids}},
        {"_id": 0, "id": 1, "sku_name": 1, "hsn_code": 1, "gst_percent": 1, "tax_percent": 1},
    ).to_list(len(sku_ids) + 1) if sku_ids else []
    skus_by_id = {r["id"]: r for r in sku_rows}

    built = build_eway_bill_payload(transfer, src_dist, dst_dist, src_loc, dst_loc, skus_by_id)
    payload = built["payload"]
    meta = built["meta"]

    return {
        "transfer_number": transfer.get("transfer_number"),
        "required": meta["required"],
        "is_inter_state": meta["is_inter_state"],
        "src_state_code": meta["src_state_code"],
        "dst_state_code": meta["dst_state_code"],
        "warnings": meta["warnings"],
        "totals": meta["totals"],
        "payload": payload,
        # GSTN bulk-upload wrapper — same JSON, wrapped in an array.
        "bulk_payload": {"version": "1.0.0123", "billLists": [payload]},
    }


@router.get("/{transfer_id}/zoho-pdf")
async def download_zoho_pdf(transfer_id: str, current_user: dict = Depends(get_current_user)):
    """Stream the official Zoho Books PDF (Invoice or Delivery Challan) for this transfer.

    Resolves the correct Zoho endpoint from the persisted `zoho_doc_type` on
    the transfer doc — invoices go to `/invoices/{id}` and challans to
    `/deliverychallans/{id}`. Returns a `Content-Disposition: attachment`
    response so the browser triggers a file download.
    """
    _ = current_user
    tenant_id = get_current_tenant_id()
    transfer = await db.distributor_stock_transfers.find_one(
        {"id": transfer_id, "tenant_id": tenant_id},
        {"_id": 0, "zoho_invoice_id": 1, "zoho_doc_type": 1,
         "zoho_status": 1, "transfer_number": 1},
    )
    if not transfer:
        raise HTTPException(404, "Stock transfer not found")
    zoho_id = transfer.get("zoho_invoice_id")
    if not zoho_id:
        raise HTTPException(
            400,
            "This transfer hasn't been synced to Zoho yet. "
            "Wait for the Zoho push to succeed (or retry it) before downloading the PDF.",
        )

    doc_type = transfer.get("zoho_doc_type") or "invoice"
    try:
        if doc_type == "delivery_challan":
            pdf_bytes, doc_number = await fetch_delivery_challan_pdf(tenant_id, zoho_id)
            filename = f"DC-{doc_number}.pdf"
        else:
            pdf_bytes, doc_number = await fetch_invoice_pdf(tenant_id, zoho_id)
            filename = f"INV-{doc_number}.pdf"
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("Zoho PDF download failed")
        raise HTTPException(502, f"Zoho PDF download failed: {e}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

