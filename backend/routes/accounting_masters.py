"""
Accounting Masters Routes
Configurable master data for the Accounting module. One collection
(`accounting_masters`) serves every master type; Expense Category supports an
arbitrary-depth hierarchy (parent_id), all other types are single-level.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone
import uuid
import re
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id
from models.accounting_master import (
    MASTER_TYPES, HIERARCHICAL_TYPES, DEFAULT_EXPENSE_TYPES, LEGACY_EXPENSE_TYPES,
    DEFAULT_SEEDS, EXPENSE_CATEGORY_TREE,
    AccountingMasterCreate, AccountingMasterUpdate,
)

router = APIRouter(prefix="/accounting", tags=["Accounting Masters"])
logger = logging.getLogger(__name__)

COLL = "accounting_masters"
ADMIN_ROLES = {"CEO", "Director", "System Admin", "Admin", "Vice President", "Head of Business"}


def _require_admin(user: dict):
    if user.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can configure accounting masters")


def _validate_type(master_type: str):
    if master_type not in MASTER_TYPES:
        raise HTTPException(status_code=404, detail=f"Unknown master type '{master_type}'")


async def _seed_type(tenant_id: str, user_id: str, master_type: str):
    """One-time idempotent seed of a master type's standard values."""
    defaults = DEFAULT_SEEDS.get(master_type)
    if not defaults:
        return
    existing = await db[COLL].count_documents({"tenant_id": tenant_id, "master_type": master_type})
    if existing:
        return
    now = datetime.now(timezone.utc).isoformat()
    docs = [{
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "master_type": master_type,
        "name": n, "code": None, "description": None, "parent_id": None,
        "is_active": True, "sort_order": i, "gstin": None, "email": None, "phone": None,
        "linked_user_id": None, "created_at": now, "updated_at": now, "created_by": user_id,
    } for i, n in enumerate(defaults)]
    await db[COLL].insert_many(docs)


async def _reconcile_expense_types(tenant_id: str, user_id: str):
    """One-time swap of the legacy short expense-type defaults to the
    authoritative list. Guarded so it only runs while NONE of the new
    canonical names exist yet — it never deletes user-created values."""
    names = set()
    async for r in db[COLL].find({"tenant_id": tenant_id, "master_type": "expense_type"}, {"_id": 0, "name": 1}):
        names.add(r.get("name"))
    if any(n in names for n in DEFAULT_EXPENSE_TYPES):
        return  # already on the authoritative list
    # Remove only the known legacy auto-defaults, then install the full list.
    await db[COLL].delete_many({
        "tenant_id": tenant_id, "master_type": "expense_type",
        "name": {"$in": LEGACY_EXPENSE_TYPES},
    })
    now = datetime.now(timezone.utc).isoformat()
    docs = [{
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "master_type": "expense_type",
        "name": n, "code": None, "description": None, "parent_id": None,
        "is_active": True, "sort_order": i, "gstin": None, "email": None, "phone": None,
        "linked_user_id": None, "created_at": now, "updated_at": now, "created_by": user_id,
    } for i, n in enumerate(DEFAULT_EXPENSE_TYPES)]
    if docs:
        await db[COLL].insert_many(docs)


async def _seed_expense_categories(tenant_id: str, user_id: str):
    """One-time seed of the 3-level Expense Category tree.

    Duplicate-aware: at each level it REUSES an existing node with the same
    (name, parent) instead of creating a second one — so it merges cleanly with
    any pre-existing categories. Runs once per tenant (guarded by a marker), so
    it never re-adds items the user later removes."""
    marker = await db["accounting_seed_markers"].find_one(
        {"tenant_id": tenant_id, "key": "expense_category_v1"}
    )
    if marker:
        return
    now = datetime.now(timezone.utc).isoformat()

    async def _get_or_create(name: str, parent_id, order: int) -> str:
        existing = await db[COLL].find_one({
            "tenant_id": tenant_id, "master_type": "expense_category",
            "parent_id": parent_id, "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
        }, {"_id": 0, "id": 1})
        if existing:
            return existing["id"]
        new_id = str(uuid.uuid4())
        await db[COLL].insert_one({
            "id": new_id, "tenant_id": tenant_id, "master_type": "expense_category",
            "name": name, "code": None, "description": None, "parent_id": parent_id,
            "is_active": True, "sort_order": order, "gstin": None, "email": None, "phone": None,
            "linked_user_id": None, "created_at": now, "updated_at": now, "created_by": user_id,
        })
        return new_id

    for ci, (cat, subs) in enumerate(EXPENSE_CATEGORY_TREE.items()):
        cat_id = await _get_or_create(cat, None, ci)
        for si, (sub, items) in enumerate(subs.items()):
            sub_id = await _get_or_create(sub, cat_id, si)
            for ii, item in enumerate(items):
                await _get_or_create(item, sub_id, ii)

    await db["accounting_seed_markers"].insert_one({
        "tenant_id": tenant_id, "key": "expense_category_v1", "created_at": now,
    })


async def _seed_all(tenant_id: str, user_id: str):
    """Seed every master type that has a default list (idempotent)."""
    for mt in DEFAULT_SEEDS:
        if mt == "expense_type":
            await _reconcile_expense_types(tenant_id, user_id)
        else:
            await _seed_type(tenant_id, user_id, mt)
    await _seed_expense_categories(tenant_id, user_id)


def _level_of(node_id, parent_map):
    """Compute hierarchy depth (0-based) by walking parents; cycle-safe."""
    level, cur, seen = 0, parent_map.get(node_id), set()
    while cur and cur not in seen:
        seen.add(cur)
        level += 1
        cur = parent_map.get(cur)
    return level


@router.get("/masters")
async def masters_summary(current_user: dict = Depends(get_current_user)):
    """List master types + counts so the UI can render the module overview."""
    tenant_id = get_current_tenant_id()
    await _seed_all(tenant_id, current_user.get("id"))
    counts = {}
    pipeline = [{"$match": {"tenant_id": tenant_id}},
                {"$group": {"_id": "$master_type", "n": {"$sum": 1}}}]
    async for row in db[COLL].aggregate(pipeline):
        counts[row["_id"]] = row["n"]
    return {"types": [
        {"key": k, "label": v["label"], "hierarchical": v["hierarchical"], "count": counts.get(k, 0)}
        for k, v in MASTER_TYPES.items()
    ]}


@router.get("/masters/{master_type}")
async def list_masters(
    master_type: str,
    include_inactive: bool = Query(True),
    current_user: dict = Depends(get_current_user),
):
    _validate_type(master_type)
    tenant_id = get_current_tenant_id()
    if master_type == "expense_type":
        await _reconcile_expense_types(tenant_id, current_user.get("id"))
    elif master_type == "expense_category":
        await _seed_expense_categories(tenant_id, current_user.get("id"))
    else:
        await _seed_type(tenant_id, current_user.get("id"), master_type)

    query = {"tenant_id": tenant_id, "master_type": master_type}
    if not include_inactive:
        query["is_active"] = True
    rows = await db[COLL].find(query, {"_id": 0}).sort([("sort_order", 1), ("name", 1)]).to_list(5000)

    if master_type in HIERARCHICAL_TYPES:
        parent_map = {r["id"]: r.get("parent_id") for r in rows}
        child_ids = {r.get("parent_id") for r in rows if r.get("parent_id")}
        for r in rows:
            r["level"] = _level_of(r["id"], parent_map)
            r["has_children"] = r["id"] in child_ids
    return {"master_type": master_type, "hierarchical": master_type in HIERARCHICAL_TYPES, "items": rows}


@router.post("/masters/{master_type}")
async def create_master(
    master_type: str,
    payload: AccountingMasterCreate,
    current_user: dict = Depends(get_current_user),
):
    _validate_type(master_type)
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()

    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    parent_id = payload.parent_id if master_type in HIERARCHICAL_TYPES else None
    if parent_id:
        parent = await db[COLL].find_one({"id": parent_id, "tenant_id": tenant_id, "master_type": master_type})
        if not parent:
            raise HTTPException(status_code=400, detail="Parent not found for this master type")

    # Unique name within the same parent scope
    dup = await db[COLL].find_one({
        "tenant_id": tenant_id, "master_type": master_type,
        "name": {"$regex": f"^{name}$", "$options": "i"}, "parent_id": parent_id,
    })
    if dup:
        raise HTTPException(status_code=400, detail=f"'{name}' already exists at this level")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "master_type": master_type,
        "name": name, "code": payload.code, "description": payload.description,
        "parent_id": parent_id, "is_active": payload.is_active, "sort_order": payload.sort_order,
        "gstin": payload.gstin, "email": payload.email, "phone": payload.phone,
        "linked_user_id": payload.linked_user_id,
        "created_at": now, "updated_at": now, "created_by": current_user.get("id"),
    }
    await db[COLL].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/masters/{master_type}/{item_id}")
async def update_master(
    master_type: str,
    item_id: str,
    payload: AccountingMasterUpdate,
    current_user: dict = Depends(get_current_user),
):
    _validate_type(master_type)
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()

    existing = await db[COLL].find_one({"id": item_id, "tenant_id": tenant_id, "master_type": master_type})
    if not existing:
        raise HTTPException(status_code=404, detail="Master record not found")

    updates = payload.model_dump(exclude_unset=True)
    if master_type not in HIERARCHICAL_TYPES:
        updates.pop("parent_id", None)

    # Prevent a node from becoming its own ancestor
    if "parent_id" in updates and updates["parent_id"]:
        new_parent = updates["parent_id"]
        if new_parent == item_id:
            raise HTTPException(status_code=400, detail="A category cannot be its own parent")
        all_rows = await db[COLL].find(
            {"tenant_id": tenant_id, "master_type": master_type}, {"_id": 0, "id": 1, "parent_id": 1}).to_list(5000)
        pmap = {r["id"]: r.get("parent_id") for r in all_rows}
        cur, seen = new_parent, set()
        while cur and cur not in seen:
            if cur == item_id:
                raise HTTPException(status_code=400, detail="Cannot move a category under its own descendant")
            seen.add(cur)
            cur = pmap.get(cur)

    if "name" in updates:
        nm = (updates["name"] or "").strip()
        if not nm:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        updates["name"] = nm

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[COLL].update_one({"id": item_id, "tenant_id": tenant_id}, {"$set": updates})
    updated = await db[COLL].find_one({"id": item_id, "tenant_id": tenant_id}, {"_id": 0})
    return updated


@router.delete("/masters/{master_type}/{item_id}")
async def delete_master(
    master_type: str,
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    _validate_type(master_type)
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()

    existing = await db[COLL].find_one({"id": item_id, "tenant_id": tenant_id, "master_type": master_type})
    if not existing:
        raise HTTPException(status_code=404, detail="Master record not found")

    if master_type in HIERARCHICAL_TYPES:
        child = await db[COLL].find_one({"tenant_id": tenant_id, "master_type": master_type, "parent_id": item_id})
        if child:
            raise HTTPException(status_code=400, detail="Remove or reassign the sub-items before deleting this category")

    await db[COLL].delete_one({"id": item_id, "tenant_id": tenant_id})
    return {"ok": True, "deleted": item_id}
