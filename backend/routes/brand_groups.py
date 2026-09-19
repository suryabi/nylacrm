"""Brand Groups — a shared branding shared by several customer accounts
(e.g. a franchisor and its franchisees). A customer-type child SKU may point at
a brand group instead of a single account; every member account can then
receive / hold / order that branded stock.

Mounted at /api/brand-groups.
"""
import uuid
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
