"""Admin masters for the Marketing Request module.

Three thin routers in one file (cohesive):
  - /master-departments
  - /marketing-request-types
  - /marketing-request-statuses

Each router auto-seeds tenant defaults on first GET so the module is usable
out-of-the-box without a one-time migration step.
"""
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user

from models.marketing_request import (
    MarketingRequestType, MarketingRequestTypeCreate, MarketingRequestTypeUpdate,
    MarketingRequestStatus, MarketingRequestStatusUpdate,
    MasterDepartment, MasterDepartmentCreate, MasterDepartmentUpdate,
    LIFECYCLE_STATUSES, DEFAULT_REQUEST_TYPES, DEFAULT_DEPARTMENTS,
)


# ╔══════════════════════════════════════════════════════════════╗
# ║                    DEPARTMENTS MASTER                          ║
# ╚══════════════════════════════════════════════════════════════╝
departments_router = APIRouter()


async def _seed_default_departments(tenant_id: str) -> None:
    existing = await db.master_departments.count_documents({"tenant_id": tenant_id})
    if existing > 0:
        return
    docs = []
    for d in DEFAULT_DEPARTMENTS:
        doc = MasterDepartment(tenant_id=tenant_id, is_default=True, **d).model_dump()
        docs.append(doc)
    if docs:
        await db.master_departments.insert_many(docs)


@departments_router.get("")
async def list_departments(
    include_inactive: bool = False,
    kind: str = Query(None, description="Filter by kind: general | fulfilment | delivery"),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    await _seed_default_departments(tenant_id)
    q: dict = {"tenant_id": tenant_id}
    if not include_inactive:
        q["is_active"] = True
    if kind:
        q["kind"] = kind
    items = await db.master_departments.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    return {"departments": items, "count": len(items)}


@departments_router.post("")
async def create_department(payload: MasterDepartmentCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = MasterDepartment(tenant_id=tenant_id, **payload.model_dump()).model_dump()
    await db.master_departments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@departments_router.patch("/{dept_id}")
async def update_department(dept_id: str, payload: MasterDepartmentUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.master_departments.update_one({"id": dept_id, "tenant_id": tenant_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Department not found")
    doc = await db.master_departments.find_one({"id": dept_id, "tenant_id": tenant_id}, {"_id": 0})
    return doc


@departments_router.delete("/{dept_id}")
async def delete_department(dept_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    res = await db.master_departments.delete_one({"id": dept_id, "tenant_id": tenant_id, "is_default": {"$ne": True}})
    if res.deleted_count == 0:
        raise HTTPException(400, "Department not found, or is a seeded default (deactivate it instead).")
    return {"ok": True}


# ╔══════════════════════════════════════════════════════════════╗
# ║                MARKETING REQUEST TYPES MASTER                  ║
# ╚══════════════════════════════════════════════════════════════╝
types_router = APIRouter()


async def _seed_default_types(tenant_id: str) -> None:
    existing = await db.marketing_request_types.count_documents({"tenant_id": tenant_id})
    if existing > 0:
        return
    docs = []
    for t in DEFAULT_REQUEST_TYPES:
        doc = MarketingRequestType(tenant_id=tenant_id, is_default=True, **t).model_dump()
        docs.append(doc)
    if docs:
        await db.marketing_request_types.insert_many(docs)


@types_router.get("")
async def list_types(include_inactive: bool = False, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    await _seed_default_types(tenant_id)
    q: dict = {"tenant_id": tenant_id}
    if not include_inactive:
        q["is_active"] = True
    items = await db.marketing_request_types.find(q, {"_id": 0}).sort("name", 1).to_list(200)
    return {"types": items, "count": len(items)}


@types_router.post("")
async def create_type(payload: MarketingRequestTypeCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = MarketingRequestType(tenant_id=tenant_id, **payload.model_dump()).model_dump()
    await db.marketing_request_types.insert_one(doc)
    doc.pop("_id", None)
    return doc


@types_router.patch("/{type_id}")
async def update_type(type_id: str, payload: MarketingRequestTypeUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.marketing_request_types.update_one({"id": type_id, "tenant_id": tenant_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Type not found")
    doc = await db.marketing_request_types.find_one({"id": type_id, "tenant_id": tenant_id}, {"_id": 0})
    return doc


@types_router.delete("/{type_id}")
async def delete_type(type_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    res = await db.marketing_request_types.delete_one({"id": type_id, "tenant_id": tenant_id, "is_default": {"$ne": True}})
    if res.deleted_count == 0:
        raise HTTPException(400, "Type not found, or is a seeded default (deactivate it instead).")
    return {"ok": True}


# ╔══════════════════════════════════════════════════════════════╗
# ║             MARKETING REQUEST STATUSES MASTER                  ║
# ╚══════════════════════════════════════════════════════════════╝
# Statuses are mostly canonical (the lifecycle keys are immutable) — admin can
# only rename the display label and recolour the badge. Sequence is fixed so
# the workflow contract is preserved.
statuses_router = APIRouter()


async def _seed_default_statuses(tenant_id: str) -> None:
    existing = await db.marketing_request_statuses.count_documents({"tenant_id": tenant_id})
    if existing > 0:
        return
    docs: List[dict] = []
    for s in LIFECYCLE_STATUSES:
        docs.append(MarketingRequestStatus(tenant_id=tenant_id, **s).model_dump())
    if docs:
        await db.marketing_request_statuses.insert_many(docs)


@statuses_router.get("")
async def list_statuses(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    await _seed_default_statuses(tenant_id)
    items = await db.marketing_request_statuses.find({"tenant_id": tenant_id}, {"_id": 0}).sort("sequence", 1).to_list(50)
    return {"statuses": items, "count": len(items)}


@statuses_router.patch("/{status_id}")
async def update_status(status_id: str, payload: MarketingRequestStatusUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.marketing_request_statuses.update_one(
        {"id": status_id, "tenant_id": tenant_id}, {"$set": upd}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Status not found")
    doc = await db.marketing_request_statuses.find_one({"id": status_id, "tenant_id": tenant_id}, {"_id": 0})
    return doc
