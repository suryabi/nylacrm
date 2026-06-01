"""Admin → SKU Aliases.

Maps an OLD SKU identifier (a retired external code, e.g. `B500`, or a stale
denormalized line-item name, e.g. `Nyla - 600 ml / Silver`) to a CURRENT master
SKU. Aliases are applied at read-time by `services.sku_resolver`, so historical
invoices / deliveries consolidate under the current SKU everywhere (Revenue
Analytics, SKU Performance, Invoices) WITHOUT rewriting the source documents.

Restricted to CEO / Director / Admin / System Admin.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel

from database import get_tenant_db
from deps import get_current_user
from services.sku_resolver import build_sku_resolver

router = APIRouter()

ALLOWED_ROLES = {"CEO", "Director", "Admin", "System Admin"}


def get_tdb():
    return get_tenant_db()


def _ensure_admin(current_user: dict) -> None:
    role = (current_user.get("role") or "").strip()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO / Director / Admin can manage SKU aliases.")


# ── Cross-module source configuration ───────────────────────────────────────
# Every collection that can carry a (possibly retired) SKU reference, grouped
# into a human "module" bucket the frontend renders as a badge.
#   TOP   : doc carries sku_id + sku_name at the root
#   ITEMS : doc carries items[] line rows (invoices also carry line_items[])
#   EMBED : doc carries an embedded, name-first pricing array
TOP_SOURCES = [
    ("production_batches", "production"),
    ("production_batch_deletions", "production"),
    ("qc_routes", "production"),
    ("rejection_cost_mappings", "production"),
    ("cost_cards", "production"),
    ("distributor_delivery_items", "distribution"),
    ("distributor_shipment_items", "distribution"),
    ("distributor_manual_stock_entries", "distribution"),
    ("distributor_margin_matrix", "distribution"),
    ("distributor_billing_config", "distribution"),
    ("distributor_stock", "stock"),
    ("factory_warehouse_stock", "stock"),
    ("warehouse_transfers", "stock"),
    ("target_allocations_v2", "targets"),
]
ITEMS_SOURCES = [
    ("customer_returns", "returns"),
    ("distributor_stock_transfers", "distribution"),
]
EMBED_SOURCES = [
    # (collection, array_field, name_field, module)
    ("accounts", "sku_pricing", "sku", "accounts"),
    ("leads", "proposed_sku_pricing", "sku", "leads"),
    ("sampling_trials", "sku_plans", "sku", "leads"),
]


def _num(v) -> float:
    if v is None:
        return 0.0
    try:
        return float(str(v).replace('%', '').replace(',', '').strip())
    except (TypeError, ValueError):
        return 0.0


def _line_value(it: dict) -> float:
    if it.get('net_amount') is not None:
        return _num(it.get('net_amount'))
    if it.get('gross_amount') is not None:
        return _num(it.get('gross_amount'))
    qty = _num(it.get('quantity'))
    rate = _num(it.get('rate'))
    disc = _num(it.get('discount_percent') or it.get('discount'))
    if disc > 100:
        disc = disc / 100.0
    return qty * rate * max(0.0, 1.0 - disc / 100.0)


class AliasUpsert(BaseModel):
    alias_value: str
    alias_type: str            # 'code' | 'name'
    target_sku_id: str
    target_sku_name: Optional[str] = None
    apply_to_records: bool = True  # physically re-point matching records


async def _current_skus(tdb):
    masters = await tdb.master_skus.find(
        {}, {"_id": 0, "id": 1, "sku_name": 1, "external_sku_id": 1, "is_active": 1}
    ).to_list(2000)
    skus = [
        {"id": m.get("id"), "sku_name": m.get("sku_name"),
         "external_sku_id": m.get("external_sku_id"), "is_active": m.get("is_active", True)}
        for m in masters if m.get("id") and m.get("sku_name")
    ]
    skus.sort(key=lambda s: (s.get("sku_name") or "").lower())
    return skus


async def _rewrite_identifier(tdb, resolver, atype: str, value: str,
                              target_id: str, target_name: str) -> dict:
    """Physically re-point every record whose CURRENTLY-UNMAPPED identifier
    equals (atype, value) to the target SKU — sets `sku_id` + `sku_name`
    (top/items) or `sku_id` + the name field (embedded pricing). `resolver`
    MUST be built BEFORE the alias for this identifier is written, so these
    records still register as unmapped and therefore get matched.

    Returns {"total": int, "by_module": {module: count}}.
    """
    cmp = (value or "").strip().lower()

    def _matches(item) -> bool:
        k = resolver.unmapped_key(item)
        return bool(k) and k[0] == atype and (k[1] or "").strip().lower() == cmp

    by_module: dict = {}

    def _tally(module, n):
        if n:
            by_module[module] = by_module.get(module, 0) + n

    # ── TOP collections — collect matching _ids, then one update_many each ──
    for col, module in TOP_SOURCES:
        ids = []
        async for d in getattr(tdb, col).find(
            {"$or": [{"sku_id": {"$exists": True}}, {"sku_name": {"$exists": True}}]},
            {"_id": 1, "sku_id": 1, "sku_name": 1},
        ):
            if _matches({"sku_id": d.get("sku_id"), "sku_name": d.get("sku_name")}):
                ids.append(d["_id"])
        if ids:
            await getattr(tdb, col).update_many(
                {"_id": {"$in": ids}},
                {"$set": {"sku_id": target_id, "sku_name": target_name}},
            )
            _tally(module, len(ids))

    # ── Invoices — items[] and/or line_items[] ──
    async for d in tdb.invoices.find(
        {"$or": [{"items.0": {"$exists": True}}, {"line_items.0": {"$exists": True}}]},
        {"_id": 1, "items": 1, "line_items": 1},
    ):
        upd, changed = {}, 0
        for arr_name in ("items", "line_items"):
            arr = d.get(arr_name)
            if not isinstance(arr, list):
                continue
            new_arr, arr_changed = [], False
            for it in arr:
                if isinstance(it, dict) and _matches(it):
                    new_arr.append({**it, "sku_id": target_id, "sku_name": target_name})
                    arr_changed = True
                    changed += 1
                else:
                    new_arr.append(it)
            if arr_changed:
                upd[arr_name] = new_arr
        if upd:
            await tdb.invoices.update_one({"_id": d["_id"]}, {"$set": upd})
            _tally("invoices", changed)

    # ── Other items[] collections ──
    for col, module in ITEMS_SOURCES:
        async for d in getattr(tdb, col).find(
            {"items.0": {"$exists": True}}, {"_id": 1, "items": 1},
        ):
            arr = d.get("items") or []
            if not isinstance(arr, list):
                continue
            new_arr, changed = [], 0
            for it in arr:
                if isinstance(it, dict) and _matches(it):
                    new_arr.append({**it, "sku_id": target_id, "sku_name": target_name})
                    changed += 1
                else:
                    new_arr.append(it)
            if changed:
                await getattr(tdb, col).update_one(
                    {"_id": d["_id"]}, {"$set": {"items": new_arr}})
                _tally(module, changed)

    # ── Embedded name-first pricing arrays ──
    for col, arr_name, field, module in EMBED_SOURCES:
        async for d in getattr(tdb, col).find(
            {f"{arr_name}.0": {"$exists": True}}, {"_id": 1, arr_name: 1},
        ):
            arr = d.get(arr_name) or []
            if not isinstance(arr, list):
                continue
            new_arr, changed = [], 0
            for it in arr:
                if isinstance(it, dict) and _matches(it):
                    new_arr.append({**it, "sku_id": target_id, field: target_name})
                    changed += 1
                else:
                    new_arr.append(it)
            if changed:
                await getattr(tdb, col).update_one(
                    {"_id": d["_id"]}, {"$set": {arr_name: new_arr}})
                _tally(module, changed)

    return {"total": sum(by_module.values()), "by_module": by_module}


@router.get("")
async def list_sku_aliases(current_user: dict = Depends(get_current_user)):
    """List existing aliases + the current SKU master (for mapping dropdowns)."""
    _ensure_admin(current_user)
    tdb = get_tdb()
    aliases = await tdb.sku_aliases.find({}, {"_id": 0}).to_list(10000)
    aliases.sort(key=lambda a: (a.get("alias_value") or "").lower())
    return {"aliases": aliases, "skus": await _current_skus(tdb)}


@router.get("/unmapped")
async def list_unmapped_skus(current_user: dict = Depends(get_current_user)):
    """Scan every SKU-bearing record across the system — invoices, production,
    distribution, stock, accounts, leads, returns & targets — and return the
    distinct identifiers that do NOT resolve to a current master SKU (after
    applying existing aliases), grouped with a per-module breakdown, usage
    counts, invoice revenue/unit impact and sample invoices (sorted by usage,
    then revenue, descending)."""
    _ensure_admin(current_user)
    tdb = get_tdb()
    resolver = await build_sku_resolver(tdb)

    agg: dict = {}

    def _add(item, module, *, revenue=0.0, units=0.0, sample=None):
        key = resolver.unmapped_key(item)
        if not key:
            return
        atype, value = key
        entry = agg.setdefault(
            f"{atype}::{value}",
            {"alias_value": value, "alias_type": atype, "count": 0,
             "revenue": 0.0, "units": 0.0, "sample_invoices": [], "sources": {}},
        )
        entry["count"] += 1
        entry["sources"][module] = entry["sources"].get(module, 0) + 1
        entry["revenue"] += revenue
        entry["units"] += units
        if sample and sample not in entry["sample_invoices"] and len(entry["sample_invoices"]) < 5:
            entry["sample_invoices"].append(sample)

    # 1) Invoices (carry revenue + units + sample invoice numbers)
    async for inv in tdb.invoices.find(
        {"$or": [{"items.0": {"$exists": True}}, {"line_items.0": {"$exists": True}}]},
        {"_id": 0, "invoice_no": 1, "invoice_number": 1, "items": 1, "line_items": 1},
    ):
        inv_no = inv.get("invoice_no") or inv.get("invoice_number") or ""
        for it in (inv.get("items") or inv.get("line_items") or []):
            if isinstance(it, dict):
                _add(it, "invoices", revenue=_line_value(it),
                     units=_num(it.get("quantity")), sample=(inv_no or None))

    # 2) Top-level sku_id/sku_name collections
    for col, module in TOP_SOURCES:
        async for d in getattr(tdb, col).find(
            {"$or": [{"sku_id": {"$exists": True}}, {"sku_name": {"$exists": True}}]},
            {"_id": 0, "sku_id": 1, "sku_name": 1},
        ):
            _add({"sku_id": d.get("sku_id"), "sku_name": d.get("sku_name")}, module)

    # 3) Other items[] collections
    for col, module in ITEMS_SOURCES:
        async for d in getattr(tdb, col).find(
            {"items.0": {"$exists": True}}, {"_id": 0, "items": 1},
        ):
            for it in (d.get("items") or []):
                if isinstance(it, dict):
                    _add(it, module)

    # 4) Embedded name-first pricing arrays
    for col, arr_name, _field, module in EMBED_SOURCES:
        async for d in getattr(tdb, col).find(
            {f"{arr_name}.0": {"$exists": True}}, {"_id": 0, arr_name: 1},
        ):
            for it in (d.get(arr_name) or []):
                if isinstance(it, dict):
                    _add(it, module)

    for e in agg.values():
        e["revenue"] = round(e["revenue"], 2)
        e["units"] = round(e["units"], 2)

    unmapped = sorted(agg.values(), key=lambda e: (e["count"], e["revenue"]), reverse=True)
    return {"unmapped": unmapped, "skus": await _current_skus(tdb)}


@router.post("")
async def upsert_sku_alias(payload: AliasUpsert, current_user: dict = Depends(get_current_user)):
    """Create or update an alias (unique per alias_value + alias_type)."""
    _ensure_admin(current_user)
    tdb = get_tdb()

    alias_value = (payload.alias_value or "").strip()
    alias_type = (payload.alias_type or "").strip().lower()
    if not alias_value or alias_type not in ("code", "name"):
        raise HTTPException(status_code=400, detail="alias_value and alias_type ('code'|'name') are required.")

    target = await tdb.master_skus.find_one(
        {"id": payload.target_sku_id}, {"_id": 0, "id": 1, "sku_name": 1}
    )
    if not target:
        raise HTTPException(status_code=404, detail="target_sku_id not found in current SKU master.")

    # Build the resolver BEFORE writing the alias, so the physical rewrite can
    # still detect records carrying this (still-unmapped) identifier.
    resolver = await build_sku_resolver(tdb)

    now = datetime.now(timezone.utc).isoformat()
    existing = await tdb.sku_aliases.find_one({"alias_value": alias_value, "alias_type": alias_type})
    if existing:
        await tdb.sku_aliases.update_one(
            {"id": existing["id"]},
            {"$set": {"target_sku_id": target["id"], "target_sku_name": target["sku_name"], "updated_at": now}},
        )
        alias_id = existing["id"]
    else:
        alias_id = str(uuid.uuid4())
        await tdb.sku_aliases.insert_one({
            "id": alias_id,
            "alias_value": alias_value,
            "alias_type": alias_type,
            "target_sku_id": target["id"],
            "target_sku_name": target["sku_name"],
            "created_at": now,
            "updated_at": now,
        })

    rewrite = {"total": 0, "by_module": {}}
    if payload.apply_to_records:
        rewrite = await _rewrite_identifier(
            tdb, resolver, alias_type, alias_value, target["id"], target["sku_name"]
        )

    return {"ok": True, "id": alias_id, "target_sku_name": target["sku_name"], "rewrite": rewrite}


@router.delete("/{alias_id}")
async def delete_sku_alias(alias_id: str, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tdb = get_tdb()
    res = await tdb.sku_aliases.delete_one({"id": alias_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Alias not found.")
    return {"ok": True}
