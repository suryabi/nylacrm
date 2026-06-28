"""
Accounting entities — standalone Vendors and Employees masters (richer than the
old single-field accounting_masters entries). Tenant-scoped. Cities are NOT
stored as a separate master; the frontend sources them from Admin → Locations
(/api/master-locations/flat) and stores the chosen city name here.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter(prefix="/accounting", tags=["Accounting Entities"])
logger = logging.getLogger(__name__)

VENDOR_COLL = "accounting_vendors"
EMPLOYEE_COLL = "accounting_employees"
ADMIN_ROLES = {"CEO", "Director", "System Admin", "Admin", "Vice President", "Head of Business"}


def _require_admin(user: dict):
    if user.get("role") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Only admins can manage this record")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _normalize_vendor_payload(payload: "VendorIn") -> dict:
    """Assign IDs to new contacts, mirror primary contact + structured address
    into the legacy flat fields so older list/search consumers keep working."""
    doc = payload.model_dump()
    contacts = doc.get("contacts") or []
    for c in contacts:
        if not c.get("id"):
            c["id"] = str(uuid.uuid4())
    # ensure at most one primary; if none flagged, treat the first as primary
    primaries = [c for c in contacts if c.get("is_primary")]
    if contacts and not primaries:
        contacts[0]["is_primary"] = True
        primaries = [contacts[0]]
    doc["contacts"] = contacts
    if primaries:
        p = primaries[0]
        doc["contact_person"] = p.get("name") or doc.get("contact_person")
        doc["email"] = p.get("email") or doc.get("email")
        doc["phone"] = p.get("phone") or doc.get("phone")
    addr = doc.get("address") or {}
    if addr.get("city") and not doc.get("city"):
        doc["city"] = addr.get("city")
    if addr.get("state") and not doc.get("state"):
        doc["state"] = addr.get("state")
    if addr.get("formatted_address") and not doc.get("billing_address"):
        doc["billing_address"] = addr.get("formatted_address")
    return doc


# ---------------- Vendors ----------------

class VendorContact(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    is_primary: bool = False


class VendorAddress(BaseModel):
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    formatted_address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class VendorIn(BaseModel):
    name: str
    vendor_code: Optional[str] = None
    vendor_type: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    # legacy single-contact fields (kept for back-compat with older rows)
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    # new multi-contact list (preferred)
    contacts: List[VendorContact] = []
    # billing address — text kept for back-compat, structured address preferred
    billing_address: Optional[str] = None
    address: Optional[VendorAddress] = None
    city: Optional[str] = None
    state: Optional[str] = None
    payment_terms: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_holder: Optional[str] = None
    bank_branch: Optional[str] = None
    upi_id: Optional[str] = None
    msme_no: Optional[str] = None
    tds_applicable: bool = False
    is_active: bool = True
    notes: Optional[str] = None


@router.get("/vendors")
async def list_vendors(include_inactive: bool = True, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    query = {"tenant_id": tenant_id}
    if not include_inactive:
        query["is_active"] = True
    rows = await db[VENDOR_COLL].find(query, {"_id": 0}).sort("name", 1).to_list(5000)
    return {"items": rows}


@router.post("/vendors")
async def create_vendor(payload: VendorIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Vendor name is required")
    dup = await db[VENDOR_COLL].find_one({"tenant_id": tenant_id, "name": {"$regex": f"^{name}$", "$options": "i"}})
    if dup:
        raise HTTPException(status_code=400, detail=f"Vendor '{name}' already exists")
    doc = _normalize_vendor_payload(payload)
    doc.update({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": name,
        "created_at": _now(), "updated_at": _now(), "created_by": current_user.get("id"),
    })
    await db[VENDOR_COLL].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/vendors/{item_id}")
async def update_vendor(item_id: str, payload: VendorIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    existing = await db[VENDOR_COLL].find_one({"id": item_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Vendor not found")
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Vendor name is required")
    dup = await db[VENDOR_COLL].find_one({
        "tenant_id": tenant_id, "id": {"$ne": item_id},
        "name": {"$regex": f"^{name}$", "$options": "i"},
    })
    if dup:
        raise HTTPException(status_code=400, detail=f"Vendor '{name}' already exists")
    updates = _normalize_vendor_payload(payload)
    updates["name"] = name
    updates["updated_at"] = _now()
    await db[VENDOR_COLL].update_one({"id": item_id, "tenant_id": tenant_id}, {"$set": updates})
    return await db[VENDOR_COLL].find_one({"id": item_id, "tenant_id": tenant_id}, {"_id": 0})


@router.delete("/vendors/{item_id}")
async def delete_vendor(item_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    existing = await db[VENDOR_COLL].find_one({"id": item_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Vendor not found")
    await db[VENDOR_COLL].delete_one({"id": item_id, "tenant_id": tenant_id})
    return {"ok": True, "deleted": item_id}


# ---------------- Employees ----------------

class EmployeeIn(BaseModel):
    full_name: str
    employee_code: Optional[str] = None
    linked_user_id: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    date_of_joining: Optional[str] = None
    pan: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_name: Optional[str] = None
    reporting_manager: Optional[str] = None
    city: Optional[str] = None
    is_active: bool = True
    notes: Optional[str] = None


@router.get("/employees")
async def list_employees(include_inactive: bool = True, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    query = {"tenant_id": tenant_id}
    if not include_inactive:
        query["is_active"] = True
    rows = await db[EMPLOYEE_COLL].find(query, {"_id": 0}).sort("full_name", 1).to_list(5000)
    return {"items": rows}


@router.post("/employees")
async def create_employee(payload: EmployeeIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    name = (payload.full_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Employee name is required")
    if payload.employee_code:
        dup = await db[EMPLOYEE_COLL].find_one({
            "tenant_id": tenant_id,
            "employee_code": {"$regex": f"^{payload.employee_code.strip()}$", "$options": "i"},
        })
        if dup:
            raise HTTPException(status_code=400, detail=f"Employee code '{payload.employee_code}' already exists")
    doc = payload.model_dump()
    doc.update({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "full_name": name,
        "created_at": _now(), "updated_at": _now(), "created_by": current_user.get("id"),
    })
    await db[EMPLOYEE_COLL].insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/employees/{item_id}")
async def update_employee(item_id: str, payload: EmployeeIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    existing = await db[EMPLOYEE_COLL].find_one({"id": item_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found")
    name = (payload.full_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Employee name is required")
    if payload.employee_code:
        dup = await db[EMPLOYEE_COLL].find_one({
            "tenant_id": tenant_id, "id": {"$ne": item_id},
            "employee_code": {"$regex": f"^{payload.employee_code.strip()}$", "$options": "i"},
        })
        if dup:
            raise HTTPException(status_code=400, detail=f"Employee code '{payload.employee_code}' already exists")
    updates = payload.model_dump()
    updates["full_name"] = name
    updates["updated_at"] = _now()
    await db[EMPLOYEE_COLL].update_one({"id": item_id, "tenant_id": tenant_id}, {"$set": updates})
    return await db[EMPLOYEE_COLL].find_one({"id": item_id, "tenant_id": tenant_id}, {"_id": 0})


@router.delete("/employees/{item_id}")
async def delete_employee(item_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    existing = await db[EMPLOYEE_COLL].find_one({"id": item_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found")
    await db[EMPLOYEE_COLL].delete_one({"id": item_id, "tenant_id": tenant_id})
    return {"ok": True, "deleted": item_id}
