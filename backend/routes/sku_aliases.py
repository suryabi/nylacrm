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


class AliasUpsert(BaseModel):
    alias_value: str
    alias_type: str            # 'code' | 'name'
    target_sku_id: str
    target_sku_name: Optional[str] = None


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
    """Scan every invoice line item and return the distinct identifiers that do
    NOT resolve to a current master SKU (after applying existing aliases),
    grouped with usage counts, revenue + unit impact, and a few sample
    invoices (sorted by revenue impact, descending)."""
    _ensure_admin(current_user)
    tdb = get_tdb()
    resolver = await build_sku_resolver(tdb)

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

    agg: dict = {}
    async for inv in tdb.invoices.find(
        {"$or": [{"items.0": {"$exists": True}}, {"line_items.0": {"$exists": True}}]},
        {"_id": 0, "invoice_no": 1, "invoice_number": 1, "items": 1, "line_items": 1},
    ):
        inv_no = inv.get("invoice_no") or inv.get("invoice_number") or ""
        for it in (inv.get("items") or inv.get("line_items") or []):
            if not isinstance(it, dict):
                continue
            key = resolver.unmapped_key(it)
            if not key:
                continue
            atype, value = key
            entry = agg.setdefault(
                f"{atype}::{value}",
                {"alias_value": value, "alias_type": atype, "count": 0,
                 "revenue": 0.0, "units": 0.0, "sample_invoices": []},
            )
            entry["count"] += 1
            entry["revenue"] += _line_value(it)
            entry["units"] += _num(it.get("quantity"))
            if inv_no and inv_no not in entry["sample_invoices"] and len(entry["sample_invoices"]) < 5:
                entry["sample_invoices"].append(inv_no)

    for e in agg.values():
        e["revenue"] = round(e["revenue"], 2)
        e["units"] = round(e["units"], 2)

    unmapped = sorted(agg.values(), key=lambda e: e["revenue"], reverse=True)
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
    return {"ok": True, "id": alias_id, "target_sku_name": target["sku_name"]}


@router.delete("/{alias_id}")
async def delete_sku_alias(alias_id: str, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tdb = get_tdb()
    res = await tdb.sku_aliases.delete_one({"id": alias_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Alias not found.")
    return {"ok": True}
