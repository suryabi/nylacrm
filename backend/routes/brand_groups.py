"""Brand Groups — a shared branding shared by several customer accounts
(e.g. a franchisor and its franchisees). A customer-type child SKU may point at
a brand group instead of a single account; every member account can then
receive / hold / order that branded stock.

Mounted at /api/brand-groups.
"""
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import db, get_tenant_db
from deps import get_current_user

router = APIRouter()
MANAGE_ROLES = {"CEO", "Admin", "System Admin"}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _require_manage(user: dict):
    if user.get("role") not in MANAGE_ROLES:
        raise HTTPException(403, "Only CEO / Admin / System Admin can manage brand groups.")


class BrandGroupIn(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    account_ids: List[str] = []
    is_active: bool = True


class BrandGroupUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    account_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None


async def _accounts(tdb, ids: List[str]) -> list:
    if not ids:
        return []
    rows = await tdb.accounts.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "account_name": 1, "account_id": 1, "city": 1}).to_list(len(ids))
    found = {r["id"] for r in rows}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(404, f"Account(s) not found: {', '.join(missing[:3])}")
    return rows


async def _decorate(tdb, group: dict) -> dict:
    accts = await tdb.accounts.find({"id": {"$in": group.get("account_ids") or []}},
                                    {"_id": 0, "id": 1, "account_name": 1, "account_id": 1, "city": 1}).to_list(1000)
    by_id = {a["id"]: a for a in accts}
    group["accounts"] = [by_id[i] for i in group.get("account_ids") or [] if i in by_id]
    group["child_sku_count"] = await tdb.child_skus.count_documents({"brand_group_id": group["id"]})
    return group


@router.get("/accounts")
async def brand_group_account_options(current_user: dict = Depends(get_current_user)):
    """Lightweight active-account list for the member picker."""
    tdb = get_tenant_db()
    rows = await tdb.accounts.find({"status": {"$in": ["active", None]}},
                                   {"_id": 0, "id": 1, "account_name": 1, "account_id": 1, "city": 1}).sort("account_name", 1).to_list(5000)
    return {"accounts": rows}


@router.get("")
async def list_brand_groups(include_inactive: bool = False, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    q = {} if include_inactive else {"is_active": {"$ne": False}}
    groups = await tdb.brand_groups.find(q, {"_id": 0}).sort("name", 1).to_list(1000)
    return {"brand_groups": [await _decorate(tdb, g) for g in groups]}


@router.post("")
async def create_brand_group(payload: BrandGroupIn, current_user: dict = Depends(get_current_user)):
    _require_manage(current_user)
    tdb = get_tenant_db()
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    if await tdb.brand_groups.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}}):
        raise HTTPException(400, f"Brand group '{name}' already exists")
    code = (payload.code or "").strip().upper() or "".join(w[0] for w in name.split()[:4]).upper()
    if await tdb.brand_groups.find_one({"code": code}):
        raise HTTPException(400, f"Code '{code}' is already in use")
    await _accounts(tdb, payload.account_ids)
    doc = {"id": str(uuid.uuid4()), "name": name, "code": code, "description": payload.description,
           "account_ids": list(dict.fromkeys(payload.account_ids)), "is_active": payload.is_active,
           "created_by": current_user.get("id"), "created_at": _now(), "updated_at": _now()}
    await tdb.brand_groups.insert_one(dict(doc))
    return await _decorate(tdb, doc)


@router.put("/{group_id}")
async def update_brand_group(group_id: str, payload: BrandGroupUpdate, current_user: dict = Depends(get_current_user)):
    _require_manage(current_user)
    tdb = get_tenant_db()
    existing = await tdb.brand_groups.find_one({"id": group_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Brand group not found")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "name" in update:
        update["name"] = update["name"].strip()
        if await tdb.brand_groups.find_one({"name": {"$regex": f"^{update['name']}$", "$options": "i"}, "id": {"$ne": group_id}}):
            raise HTTPException(400, f"Brand group '{update['name']}' already exists")
    if "code" in update:
        update["code"] = update["code"].strip().upper()
        if await tdb.brand_groups.find_one({"code": update["code"], "id": {"$ne": group_id}}):
            raise HTTPException(400, f"Code '{update['code']}' is already in use")
    if "account_ids" in update:
        await _accounts(tdb, update["account_ids"])
        update["account_ids"] = list(dict.fromkeys(update["account_ids"]))
    update["updated_at"] = _now()
    await tdb.brand_groups.update_one({"id": group_id}, {"$set": update})
    if "name" in update:
        await tdb.child_skus.update_many({"brand_group_id": group_id},
                                         {"$set": {"brand_group_name": update["name"], "customer_account_name": update["name"]}})
    return await _decorate(tdb, await tdb.brand_groups.find_one({"id": group_id}, {"_id": 0}))


@router.delete("/{group_id}")
async def delete_brand_group(group_id: str, current_user: dict = Depends(get_current_user)):
    _require_manage(current_user)
    tdb = get_tenant_db()
    used = await tdb.child_skus.count_documents({"brand_group_id": group_id})
    if used:
        raise HTTPException(400, f"{used} child SKU(s) use this brand group — reassign or deactivate them first.")
    res = await tdb.brand_groups.delete_one({"id": group_id})
    if not res.deleted_count:
        raise HTTPException(404, "Brand group not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Shared resolver: which account ids may use a given child SKU.
# ---------------------------------------------------------------------------
async def child_account_ids_map(tenant_id: str, children: list) -> dict:
    """{child_id: set(account ids)} — the owner account plus every member of
    the child's brand group (if any)."""
    group_ids = list({c.get("brand_group_id") for c in children if c.get("brand_group_id")})
    groups = {}
    if group_ids:
        async for g in db.brand_groups.find({"tenant_id": tenant_id, "id": {"$in": group_ids}}, {"_id": 0, "id": 1, "account_ids": 1}):
            groups[g["id"]] = set(g.get("account_ids") or [])
    out = {}
    for c in children:
        ids = set()
        if c.get("customer_account_id"):
            ids.add(c["customer_account_id"])
        ids |= groups.get(c.get("brand_group_id"), set())
        out[c["id"]] = ids
    return out


async def account_child_filter(tenant_id: str, acct_refs: set) -> dict:
    """Mongo filter selecting customer-type child SKUs usable by any of `acct_refs`
    (direct owner OR via brand-group membership)."""
    refs = list(acct_refs)
    group_ids = await db.brand_groups.distinct("id", {"tenant_id": tenant_id, "account_ids": {"$in": refs}, "is_active": {"$ne": False}})
    ors = [{"customer_account_id": {"$in": refs}}]
    if group_ids:
        ors.append({"brand_group_id": {"$in": group_ids}})
    return {"$or": ors}


# ── Consolidate members' individual child SKUs into one shared child ─────────
class ConsolidateIn(BaseModel):
    parent_sku_id: str
    keep_child_sku_id: str
    notes: Optional[str] = None


async def _member_children(tdb, group: dict, parent_sku_id: Optional[str] = None) -> list:
    """Active customer child SKUs owned individually by a group member, plus the group's shared ones."""
    from routes.branding_entries import account_ref_set
    from core.tenant import get_current_tenant_id
    tenant_id = get_current_tenant_id()
    refs = set()
    for aid in group.get("account_ids") or []:
        refs |= await account_ref_set(tenant_id, aid)
    q = {"child_type": "customer", "is_active": {"$ne": False},
         "$or": [{"customer_account_id": {"$in": sorted(refs)}}, {"brand_group_id": group["id"]}]}
    if parent_sku_id:
        q["parent_sku_id"] = parent_sku_id
    return await tdb.child_skus.find(q, {"_id": 0}).to_list(1000)


async def _stock_by_location(tenant_id: str, child_ids: list) -> dict:
    """{child_sku_id: [{location_id, location_name, quantity}]} across distributor + factory stock."""
    out = {cid: [] for cid in child_ids}
    for coll, loc_field in ((db.distributor_stock, "distributor_location_id"), (db.factory_warehouse_stock, "warehouse_location_id")):
        agg = defaultdict(int)
        async for r in coll.find({"tenant_id": tenant_id, "child_sku_id": {"$in": child_ids}, "quantity": {"$gt": 0}},
                                 {"_id": 0, "child_sku_id": 1, loc_field: 1, "quantity": 1}):
            agg[(r["child_sku_id"], r.get(loc_field))] += int(r.get("quantity") or 0)
        loc_ids = [l for (_, l) in agg if l]
        names = {l["id"]: l.get("location_name") async for l in db.distributor_locations.find({"id": {"$in": loc_ids}}, {"_id": 0, "id": 1, "location_name": 1})}
        for (cid, lid), q in agg.items():
            out[cid].append({"location_id": lid, "location_name": names.get(lid) or "Warehouse", "quantity": q})
    return out


@router.get("/{group_id}/consolidation-preview")
async def consolidation_preview(group_id: str, current_user: dict = Depends(get_current_user)):
    _require_manage(current_user)
    from core.tenant import get_current_tenant_id
    tdb = get_tenant_db()
    group = await tdb.brand_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(404, "Brand group not found")
    children = await _member_children(tdb, group)
    stock = await _stock_by_location(get_current_tenant_id(), [c["id"] for c in children])
    by_parent = defaultdict(list)
    for c in children:
        by_parent[c["parent_sku_id"]].append({
            "child_sku_id": c["id"], "child_sku_name": c.get("child_sku_name"), "child_sku_code": c.get("child_sku_code"),
            "customer_account_id": c.get("customer_account_id"), "customer_account_name": c.get("customer_account_name"),
            "shared": bool(c.get("brand_group_id")), "stock": stock.get(c["id"], []),
            "stock_total": sum(s["quantity"] for s in stock.get(c["id"], [])),
        })
    parents = {p["id"]: p.get("sku_name") async for p in db.master_skus.find({"id": {"$in": list(by_parent)}}, {"_id": 0, "id": 1, "sku_name": 1})}
    out = []
    for pid, kids in by_parent.items():
        kids.sort(key=lambda k: (not k["shared"], -k["stock_total"], (k["child_sku_name"] or "").lower()))
        shared = [k for k in kids if k["shared"]]
        out.append({"parent_sku_id": pid, "parent_sku_name": parents.get(pid), "children": kids,
                    "suggested_keep": (shared[0] if shared else kids[0])["child_sku_id"],
                    "needs_consolidation": any(not k["shared"] for k in kids)})
    out.sort(key=lambda p: (p["parent_sku_name"] or "").lower())
    return {"group": {"id": group["id"], "name": group.get("name"), "code": group.get("code")}, "parents": out}


@router.post("/{group_id}/consolidate")
async def consolidate(group_id: str, payload: ConsolidateIn, current_user: dict = Depends(get_current_user)):
    """Promote `keep_child_sku_id` to the group's shared child; move every other member child's stock
    into it (Branding Entry per warehouse, batch-aware FIFO) and deactivate the emptied children."""
    _require_manage(current_user)
    from core.tenant import get_current_tenant_id
    from routes.branding_entries import BrandingEntryCreate, create_branding_entry
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    group = await tdb.brand_groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(404, "Brand group not found")
    children = await _member_children(tdb, group, payload.parent_sku_id)
    keep = next((c for c in children if c["id"] == payload.keep_child_sku_id), None)
    if not keep:
        raise HTTPException(400, "The child SKU to keep must belong to a member of this group (or already be shared by it).")
    others = [c for c in children if c["id"] != keep["id"]]
    now = _now()
    keep_note = None
    if keep.get("brand_group_id") != group["id"]:
        keep_note = keep.get("customer_account_name")
        await tdb.child_skus.update_one({"id": keep["id"]}, {"$set": {
            "brand_group_id": group["id"], "brand_group_name": group.get("name"),
            "customer_account_id": None, "customer_account_name": group.get("name"),
            "promoted_from_account_id": keep.get("customer_account_id"), "promoted_from_account_name": keep.get("customer_account_name"),
            "updated_at": now}})
    stock = await _stock_by_location(tenant_id, [c["id"] for c in others])
    moved, deactivated, errors = [], [], []
    for c in others:
        ok = True
        for s in stock.get(c["id"], []):
            try:
                entry = await create_branding_entry(BrandingEntryCreate(
                    warehouse_location_id=s["location_id"], sku_id=payload.parent_sku_id,
                    from_child_sku_id=c["id"], to_child_sku_id=keep["id"], quantity=s["quantity"],
                    notes=f"Consolidated into shared SKU '{keep.get('child_sku_name')}' for brand group {group.get('name')}" + (f" — {payload.notes}" if payload.notes else "")),
                    current_user)
                moved.append({"child_sku_id": c["id"], "child_sku_name": c.get("child_sku_name"), "location_id": s["location_id"],
                              "location_name": s["location_name"], "quantity": s["quantity"], "entry_number": entry.get("entry_number")})
            except HTTPException as e:
                ok = False
                errors.append({"child_sku_id": c["id"], "child_sku_name": c.get("child_sku_name"), "location_name": s["location_name"], "detail": e.detail})
        if ok:
            await tdb.child_skus.update_one({"id": c["id"]}, {"$set": {
                "is_active": False, "consolidated_into_child_sku_id": keep["id"], "consolidated_into_child_sku_name": keep.get("child_sku_name"),
                "consolidated_at": now, "consolidated_by": current_user.get("id"), "updated_at": now}})
            deactivated.append({"child_sku_id": c["id"], "child_sku_name": c.get("child_sku_name"), "customer_account_name": c.get("customer_account_name")})
    await tdb.brand_groups.update_one({"id": group_id}, {"$push": {"consolidations": {
        "parent_sku_id": payload.parent_sku_id, "keep_child_sku_id": keep["id"], "keep_child_sku_name": keep.get("child_sku_name"),
        "promoted_from": keep_note, "moved": moved, "deactivated": [d["child_sku_id"] for d in deactivated], "errors": errors,
        "by": current_user.get("id"), "at": now}}, "$set": {"updated_at": now}})
    return {"ok": not errors, "keep": {"child_sku_id": keep["id"], "child_sku_name": keep.get("child_sku_name"), "promoted_from": keep_note},
            "moved": moved, "moved_units": sum(m["quantity"] for m in moved), "deactivated": deactivated, "errors": errors}
