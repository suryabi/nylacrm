"""
Admin → Fleet → Drivers CRUD.

Trimmed-essentials model agreed with the user:
  full_name, phone (unique per tenant), license_number (unique per tenant),
  status, notes.

Multi-tenant aware via TenantDB. Restricted to CEO / Director / Admin / System Admin.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import re
import uuid

from database import get_tenant_db
from deps import get_current_user

router = APIRouter()

ALLOWED_ROLES = {"CEO", "Director", "Admin", "System Admin"}
ALLOWED_STATUSES = ["active", "on_leave", "inactive"]

# Loose Indian phone normaliser — strip everything except digits, keep last 10.
PHONE_DIGITS = re.compile(r"\D+")


def _ensure_admin(current_user: dict) -> None:
    role = (current_user.get("role") or "").strip()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO / Director / Admin / System Admin can manage drivers.")


def _normalise_phone(phone: str) -> str:
    digits = PHONE_DIGITS.sub("", phone or "")
    return digits[-10:] if len(digits) >= 10 else digits


def _normalise_license(lic: str) -> str:
    return (lic or "").strip().upper().replace(" ", "")


class DriverBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=120)
    phone: str = Field(..., min_length=1, max_length=20)
    license_number: str = Field(..., min_length=1, max_length=32)
    status: str = "active"
    notes: Optional[str] = None


class DriverCreate(DriverBase):
    pass


class DriverUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=20)
    license_number: Optional[str] = Field(default=None, max_length=32)
    status: Optional[str] = None
    notes: Optional[str] = None


@router.get("")
async def list_drivers(
    search: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    _ensure_admin(current_user)
    tdb = get_tenant_db()

    q: dict = {}
    if status:
        q["status"] = status
    if search:
        s = search.strip()
        q["$or"] = [
            {"full_name": {"$regex": s, "$options": "i"}},
            {"phone": {"$regex": s, "$options": "i"}},
            {"license_number": {"$regex": s, "$options": "i"}},
            {"notes": {"$regex": s, "$options": "i"}},
        ]

    drivers = await tdb.drivers.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"drivers": drivers, "total": len(drivers)}


@router.post("")
async def create_driver(payload: DriverCreate, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    if payload.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {ALLOWED_STATUSES}")

    tdb = get_tenant_db()
    phone = _normalise_phone(payload.phone)
    if len(phone) < 10:
        raise HTTPException(status_code=400, detail="phone must contain at least 10 digits")
    license_num = _normalise_license(payload.license_number)
    if not license_num:
        raise HTTPException(status_code=400, detail="license_number is required")
    full_name = (payload.full_name or "").strip()
    if not full_name:
        raise HTTPException(status_code=400, detail="full_name is required")

    if await tdb.drivers.find_one({"phone": phone}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail=f"A driver with phone {phone} already exists")
    if await tdb.drivers.find_one({"license_number": license_num}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail=f"A driver with license {license_num} already exists")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "full_name": full_name,
        "phone": phone,
        "license_number": license_num,
        "status": payload.status,
        "notes": (payload.notes or "").strip() or None,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
    }
    await tdb.drivers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/{driver_id}")
async def update_driver(driver_id: str, payload: DriverUpdate, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tdb = get_tenant_db()

    existing = await tdb.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Driver not found")

    update_doc: dict = {}
    if payload.full_name is not None:
        nm = payload.full_name.strip()
        if not nm:
            raise HTTPException(status_code=400, detail="full_name cannot be blank")
        update_doc["full_name"] = nm
    if payload.phone is not None:
        new_phone = _normalise_phone(payload.phone)
        if len(new_phone) < 10:
            raise HTTPException(status_code=400, detail="phone must contain at least 10 digits")
        if new_phone != existing.get("phone"):
            if await tdb.drivers.find_one({"phone": new_phone}, {"_id": 0, "id": 1}):
                raise HTTPException(status_code=409, detail=f"A driver with phone {new_phone} already exists")
        update_doc["phone"] = new_phone
    if payload.license_number is not None:
        new_lic = _normalise_license(payload.license_number)
        if not new_lic:
            raise HTTPException(status_code=400, detail="license_number cannot be blank")
        if new_lic != existing.get("license_number"):
            if await tdb.drivers.find_one({"license_number": new_lic}, {"_id": 0, "id": 1}):
                raise HTTPException(status_code=409, detail=f"A driver with license {new_lic} already exists")
        update_doc["license_number"] = new_lic
    if payload.status is not None:
        if payload.status not in ALLOWED_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {ALLOWED_STATUSES}")
        update_doc["status"] = payload.status
    if payload.notes is not None:
        update_doc["notes"] = payload.notes.strip() or None

    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await tdb.drivers.update_one({"id": driver_id}, {"$set": update_doc})
    return await tdb.drivers.find_one({"id": driver_id}, {"_id": 0})


@router.delete("/{driver_id}")
async def delete_driver(driver_id: str, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tdb = get_tenant_db()
    r = await tdb.drivers.delete_one({"id": driver_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"deleted": True, "id": driver_id}


@router.get("/meta/options")
async def get_driver_options(current_user: dict = Depends(get_current_user)):
    """Static options the form needs (statuses)."""
    return {"statuses": ALLOWED_STATUSES}
