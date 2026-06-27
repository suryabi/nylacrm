"""
Vendor Types master — Admin-managed, single-level list used to categorise
vendors (e.g. Raw Material Supplier, Logistics Partner). Tenant-scoped.
Seeded once per tenant with a standard set; fully editable afterwards.
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

router = APIRouter(prefix="/vendor-types", tags=["Vendor Types"])
logger = logging.getLogger(__name__)

COLL = "vendor_types"
ADMIN_ROLES = {"CEO", "Director", "System Admin", "Admin", "Vice President", "Head of Business"}

DEFAULT_VENDOR_TYPES = [
    "Raw Material Supplier",
    "Packaging Supplier",
    "Manufacturing Supplier",
    "Logistics Partner",
    "Warehouse Provider",
    "Marketing Agency",
    "Software Vendor",
    "IT Vendor",
    "Consultant",
    "Contractor",
    "Service Provider",
    "Utility Provider",
    "Government Department",
    "Financial Institution",
    "Travel Agency",
    "Hotel",
    "Event Organizer",
]


class VendorTypeCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


class VendorTypeUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


def _require_admin(user: dict):
    if user.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can configure vendor types")


async def _seed_defaults(tenant_id: str, user_id: str):
    """One-time idempotent seed of the standard vendor types."""
    existing = await db[COLL].count_documents({"tenant_id": tenant_id})
    if existing:
        return
    now = datetime.now(timezone.utc).isoformat()
    docs = [{
        "id": str(uuid.uuid4()), "tenant_id": tenant_id,
        "name": n, "code": None, "description": None,
        "is_active": True, "sort_order": i,
        "created_at": now, "updated_at": now, "created_by": user_id,
    } for i, n in enumerate(DEFAULT_VENDOR_TYPES)]
    await db[COLL].insert_many(docs)


@router.get("")
async def list_vendor_types(
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
async def create_vendor_type(
    payload: VendorTypeCreate,
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
        "name": name, "code": payload.code, "description": payload.description,
        "is_active": payload.is_active, "sort_order": payload.sort_order,
        "created_at": now, "updated_at": now, "created_by": current_user.get("id"),
    }
    await db[COLL].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/{item_id}")
async def update_vendor_type(
    item_id: str,
    payload: VendorTypeUpdate,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    existing = await db[COLL].find_one({"id": item_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Vendor type not found")

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
async def delete_vendor_type(
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    existing = await db[COLL].find_one({"id": item_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Vendor type not found")
    await db[COLL].delete_one({"id": item_id, "tenant_id": tenant_id})
    return {"ok": True, "deleted": item_id}
