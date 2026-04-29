"""
Master Request Types — admin-managed catalog of marketing request categories
(Neck Tag, 24-Bottle Brand, Standee, Video, etc.).
Multi-tenant. Read = any auth user; write = Admin / CEO / System Admin.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid

from database import get_tenant_db
from deps import get_current_user

router = APIRouter()

ADMIN_ROLES = {"Admin", "System Admin", "CEO"}


def _admin_only(user: dict):
    if user.get("role") not in ADMIN_ROLES:
        raise HTTPException(403, "Admin access required")


class MasterRequestTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    default_priority: str = "medium"
    default_due_offset_days: Optional[int] = 7
    icon: Optional[str] = None
    color: Optional[str] = "indigo"
    is_active: bool = True
    sort_order: int = 0


class MasterRequestTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_priority: Optional[str] = None
    default_due_offset_days: Optional[int] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


@router.get("")
async def list_request_types(
    include_inactive: bool = False,
    current_user: dict = Depends(get_current_user),
):
    tdb = get_tenant_db()
    q = {} if include_inactive else {"is_active": True}
    rows = await tdb.master_request_types.find(q, {"_id": 0}).sort([("sort_order", 1), ("name", 1)]).to_list(500)
    return rows


@router.post("")
async def create_request_type(payload: MasterRequestTypeCreate, current_user: dict = Depends(get_current_user)):
    _admin_only(current_user)
    tdb = get_tenant_db()
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    await tdb.master_request_types.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{type_id}")
async def update_request_type(type_id: str, payload: MasterRequestTypeUpdate, current_user: dict = Depends(get_current_user)):
    _admin_only(current_user)
    tdb = get_tenant_db()
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await tdb.master_request_types.update_one({"id": type_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Request type not found")
    doc = await tdb.master_request_types.find_one({"id": type_id}, {"_id": 0})
    return doc


@router.delete("/{type_id}")
async def delete_request_type(type_id: str, current_user: dict = Depends(get_current_user)):
    _admin_only(current_user)
    tdb = get_tenant_db()
    # Soft delete — preserve historical references
    res = await tdb.master_request_types.update_one(
        {"id": type_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Request type not found")
    return {"ok": True}
