"""Admin masters for the Print Request module.

Two thin routers in one file:
  - /print-request-statuses  (tenant-configurable linear status flow)
  - /print-vendors           (print vendors directory)

Statuses auto-seed tenant defaults on first GET so the module is usable
out-of-the-box.
"""
from fastapi import APIRouter, Depends, HTTPException

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from utils.sm_helpers import _is_admin

from models.print_request import (
    PrintRequestStatus, PrintRequestStatusCreate, PrintRequestStatusUpdate,
    PrintVendor, PrintVendorCreate, PrintVendorUpdate,
    DEFAULT_PRINT_STATUSES,
)


def _require_admin(user: dict) -> None:
    """Block non-admin tenant users from mutating Print masters."""
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required to manage Print masters.")


# ╔══════════════════════════════════════════════════════════════╗
# ║                 PRINT REQUEST STATUS MASTER                   ║
# ╚══════════════════════════════════════════════════════════════╝
statuses_router = APIRouter()


async def seed_default_statuses(tenant_id: str) -> None:
    """Self-healing seed: add any default status missing (matched by name)."""
    existing = await db.print_request_statuses.find(
        {"tenant_id": tenant_id}, {"_id": 0, "name": 1}
    ).to_list(200)
    existing_names = {(s.get("name") or "").strip().lower() for s in existing}
    docs = []
    for s in DEFAULT_PRINT_STATUSES:
        if (s.get("name") or "").strip().lower() in existing_names:
            continue
        docs.append(PrintRequestStatus(tenant_id=tenant_id, is_default=True, **s).model_dump())
    if docs:
        await db.print_request_statuses.insert_many(docs)


@statuses_router.get("")
async def list_statuses(include_inactive: bool = False, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    await seed_default_statuses(tenant_id)
    q: dict = {"tenant_id": tenant_id}
    if not include_inactive:
        q["is_active"] = {"$ne": False}
    items = await db.print_request_statuses.find(q, {"_id": 0}).sort("order", 1).to_list(200)
    return {"statuses": items, "count": len(items)}


@statuses_router.post("")
async def create_status(payload: PrintRequestStatusCreate, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    doc = PrintRequestStatus(tenant_id=tenant_id, **payload.model_dump()).model_dump()
    await db.print_request_statuses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@statuses_router.patch("/{status_id}")
async def update_status(status_id: str, payload: PrintRequestStatusUpdate, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.print_request_statuses.update_one({"id": status_id, "tenant_id": tenant_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Status not found")
    return await db.print_request_statuses.find_one({"id": status_id, "tenant_id": tenant_id}, {"_id": 0})


@statuses_router.delete("/{status_id}")
async def delete_status(status_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    res = await db.print_request_statuses.delete_one(
        {"id": status_id, "tenant_id": tenant_id, "is_default": {"$ne": True}}
    )
    if res.deleted_count == 0:
        raise HTTPException(400, "Status not found, or is a seeded default (deactivate it instead).")
    return {"ok": True}


# ╔══════════════════════════════════════════════════════════════╗
# ║                       PRINT VENDOR MASTER                     ║
# ╚══════════════════════════════════════════════════════════════╝
vendors_router = APIRouter()


@vendors_router.get("")
async def list_vendors(include_inactive: bool = False, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    q: dict = {"tenant_id": tenant_id}
    if not include_inactive:
        q["is_active"] = {"$ne": False}
    items = await db.print_vendors.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    return {"vendors": items, "count": len(items)}


@vendors_router.post("")
async def create_vendor(payload: PrintVendorCreate, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    doc = PrintVendor(tenant_id=tenant_id, **payload.model_dump()).model_dump()
    await db.print_vendors.insert_one(doc)
    doc.pop("_id", None)
    return doc


@vendors_router.patch("/{vendor_id}")
async def update_vendor(vendor_id: str, payload: PrintVendorUpdate, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.print_vendors.update_one({"id": vendor_id, "tenant_id": tenant_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Vendor not found")
    return await db.print_vendors.find_one({"id": vendor_id, "tenant_id": tenant_id}, {"_id": 0})


@vendors_router.delete("/{vendor_id}")
async def delete_vendor(vendor_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    res = await db.print_vendors.delete_one({"id": vendor_id, "tenant_id": tenant_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Vendor not found")
    return {"ok": True}
