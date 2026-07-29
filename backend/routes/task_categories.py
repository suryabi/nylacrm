"""
Task Categories master — Admin-managed list used to categorise internal tasks
(the "Tasks - Internal" module, formerly Issues). Tenant-scoped.
Seeded once per tenant with a starter set; fully editable afterwards.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter(prefix="/task-categories", tags=["Task Categories"])
logger = logging.getLogger(__name__)

COLL = "task_categories"
ADMIN_ROLES = {"CEO", "Director", "System Admin", "Admin", "Vice President", "Head of Business"}

DEFAULT_TASK_CATEGORIES = [
    "Payment Issue",
    "Customer Issue",
    "Delivery & Logistics",
    "Production Issue",
    "Water Quality",
    "Product Quality",
    "Future Enhancement",
    "Future Product",
    "Process Improvement",
    "Cost Cutting Initiative",
    "Quality",
    "Stock & Inventory",
]

# v1 starter set — replaced by the list above; removed on sync when unused.
LEGACY_DEFAULTS = [
    "Customer Complaint",
    "Internal Task",
    "Quality Check",
    "Improvement",
    "Maintenance",
    "Follow-up",
]


class TaskCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


class TaskCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


def _require_admin(user: dict):
    if user.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can configure task categories")


async def _seed_defaults(tenant_id: str, user_id: str):
    """Idempotent: ensures the standard category set exists, and drops legacy
    v1 defaults that are not referenced by any task."""
    now = datetime.now(timezone.utc).isoformat()
    existing = await db[COLL].find({"tenant_id": tenant_id}, {"_id": 0, "name": 1}).to_list(1000)
    existing_names = {(r.get("name") or "").strip().lower() for r in existing}

    missing = [n for n in DEFAULT_TASK_CATEGORIES if n.lower() not in existing_names]
    if missing:
        docs = [{
            "id": str(uuid.uuid4()), "tenant_id": tenant_id,
            "name": n, "description": None,
            "is_active": True, "sort_order": DEFAULT_TASK_CATEGORIES.index(n),
            "created_at": now, "updated_at": now, "created_by": user_id,
        } for n in missing]
        await db[COLL].insert_many(docs)

    for legacy in LEGACY_DEFAULTS:
        if legacy.lower() in existing_names:
            in_use = await db.customer_complaints.find_one(
                {"tenant_id": tenant_id, "category": {"$regex": f"^{legacy}$", "$options": "i"}},
                {"_id": 1},
            )
            if not in_use:
                await db[COLL].delete_one({
                    "tenant_id": tenant_id,
                    "name": {"$regex": f"^{legacy}$", "$options": "i"},
                })


@router.get("")
async def list_task_categories(
    include_inactive: bool = True,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    await _seed_defaults(tenant_id, current_user.get("id"))
    query = {"tenant_id": tenant_id}
    if not include_inactive:
        query["is_active"] = True
    rows = await db[COLL].find(query, {"_id": 0}).sort([("sort_order", 1), ("name", 1)]).to_list(1000)
    return {"items": rows}


@router.post("")
async def create_task_category(
    payload: TaskCategoryCreate,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    dup = await db[COLL].find_one({
        "tenant_id": tenant_id,
        "name": {"$regex": f"^{name}$", "$options": "i"},
    })
    if dup:
        raise HTTPException(status_code=400, detail=f"'{name}' already exists")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "tenant_id": tenant_id,
        "name": name, "description": payload.description,
        "is_active": payload.is_active, "sort_order": payload.sort_order,
        "created_at": now, "updated_at": now, "created_by": current_user.get("id"),
    }
    await db[COLL].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/{item_id}")
async def update_task_category(
    item_id: str,
    payload: TaskCategoryUpdate,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    existing = await db[COLL].find_one({"id": item_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Task category not found")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        nm = (updates["name"] or "").strip()
        if not nm:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        dup = await db[COLL].find_one({
            "tenant_id": tenant_id, "id": {"$ne": item_id},
            "name": {"$regex": f"^{nm}$", "$options": "i"},
        })
        if dup:
            raise HTTPException(status_code=400, detail=f"'{nm}' already exists")
        updates["name"] = nm

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[COLL].update_one({"id": item_id, "tenant_id": tenant_id}, {"$set": updates})
    updated = await db[COLL].find_one({"id": item_id, "tenant_id": tenant_id}, {"_id": 0})
    return updated


@router.delete("/{item_id}")
async def delete_task_category(
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    existing = await db[COLL].find_one({"id": item_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Task category not found")
    await db[COLL].delete_one({"id": item_id, "tenant_id": tenant_id})
    return {"ok": True, "deleted": item_id}
