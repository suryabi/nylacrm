"""
Admin → Fleet → Vehicles CRUD.

Trimmed-essentials model agreed with the user:
  registration_number (unique per tenant), vehicle_type, status, notes.

Multi-tenant aware via TenantDB. Restricted to CEO / Director / Admin / System Admin.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import uuid

from database import get_tenant_db
from deps import get_current_user

router = APIRouter()

ALLOWED_ROLES = {"CEO", "Director", "Admin", "System Admin"}
ALLOWED_VEHICLE_TYPES = ["Truck", "Van", "Mini-truck", "Two-wheeler", "Tempo", "Other"]
ALLOWED_STATUSES = ["active", "under_maintenance", "retired"]


def _ensure_admin(current_user: dict) -> None:
    role = (current_user.get("role") or "").strip()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=403, detail="Only CEO / Director / Admin / System Admin can manage vehicles.")


class VehicleBase(BaseModel):
    registration_number: str = Field(..., min_length=1, max_length=32)
    vehicle_name: Optional[str] = Field(default=None, max_length=80)
    vehicle_type: str
    city: Optional[str] = Field(default=None, max_length=80)
    status: str = "active"
    notes: Optional[str] = None


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    registration_number: Optional[str] = Field(default=None, max_length=32)
    vehicle_name: Optional[str] = Field(default=None, max_length=80)
    vehicle_type: Optional[str] = None
    city: Optional[str] = Field(default=None, max_length=80)
    status: Optional[str] = None
    notes: Optional[str] = None


def _normalise_reg(reg: str) -> str:
    return (reg or "").strip().upper().replace(" ", "")


@router.get("")
async def list_vehicles(
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
            {"registration_number": {"$regex": s, "$options": "i"}},
            {"vehicle_name": {"$regex": s, "$options": "i"}},
            {"vehicle_type": {"$regex": s, "$options": "i"}},
            {"city": {"$regex": s, "$options": "i"}},
            {"notes": {"$regex": s, "$options": "i"}},
        ]

    vehicles = await tdb.vehicles.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return {"vehicles": vehicles, "total": len(vehicles)}


@router.post("")
async def create_vehicle(payload: VehicleCreate, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    if payload.vehicle_type not in ALLOWED_VEHICLE_TYPES:
        raise HTTPException(status_code=400, detail=f"vehicle_type must be one of {ALLOWED_VEHICLE_TYPES}")
    if payload.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {ALLOWED_STATUSES}")

    tdb = get_tenant_db()
    reg = _normalise_reg(payload.registration_number)
    if not reg:
        raise HTTPException(status_code=400, detail="registration_number is required")

    if await tdb.vehicles.find_one({"registration_number": reg}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=409, detail=f"Vehicle {reg} already exists")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "registration_number": reg,
        "vehicle_name": (payload.vehicle_name or "").strip() or None,
        "vehicle_type": payload.vehicle_type,
        "city": (payload.city or "").strip() or None,
        "status": payload.status,
        "notes": (payload.notes or "").strip() or None,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
    }
    await tdb.vehicles.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/{vehicle_id}")
async def update_vehicle(vehicle_id: str, payload: VehicleUpdate, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tdb = get_tenant_db()

    existing = await tdb.vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    update_doc: dict = {}
    if payload.registration_number is not None:
        new_reg = _normalise_reg(payload.registration_number)
        if not new_reg:
            raise HTTPException(status_code=400, detail="registration_number cannot be blank")
        if new_reg != existing.get("registration_number"):
            dup = await tdb.vehicles.find_one({"registration_number": new_reg}, {"_id": 0, "id": 1})
            if dup:
                raise HTTPException(status_code=409, detail=f"Vehicle {new_reg} already exists")
        update_doc["registration_number"] = new_reg
    if payload.vehicle_type is not None:
        if payload.vehicle_type not in ALLOWED_VEHICLE_TYPES:
            raise HTTPException(status_code=400, detail=f"vehicle_type must be one of {ALLOWED_VEHICLE_TYPES}")
        update_doc["vehicle_type"] = payload.vehicle_type
    if payload.vehicle_name is not None:
        update_doc["vehicle_name"] = payload.vehicle_name.strip() or None
    if payload.city is not None:
        update_doc["city"] = payload.city.strip() or None
    if payload.status is not None:
        if payload.status not in ALLOWED_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {ALLOWED_STATUSES}")
        update_doc["status"] = payload.status
    if payload.notes is not None:
        update_doc["notes"] = payload.notes.strip() or None

    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await tdb.vehicles.update_one({"id": vehicle_id}, {"$set": update_doc})
    return await tdb.vehicles.find_one({"id": vehicle_id}, {"_id": 0})


@router.delete("/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tdb = get_tenant_db()
    r = await tdb.vehicles.delete_one({"id": vehicle_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"deleted": True, "id": vehicle_id}


@router.get("/meta/options")
async def get_vehicle_options(current_user: dict = Depends(get_current_user)):
    """Static options the form needs (vehicle types, statuses)."""
    return {
        "vehicle_types": ALLOWED_VEHICLE_TYPES,
        "statuses": ALLOWED_STATUSES,
    }
