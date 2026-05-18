"""
Admin → Fleet → Drivers CRUD.

Trimmed-essentials model agreed with the user:
  full_name, phone (unique per tenant), license_number (unique per tenant),
  status, notes.

Multi-tenant aware via TenantDB. Restricted to CEO / Director / Admin / System Admin.

Driver user provisioning
========================
When a driver is added to the fleet we also auto-create a `users` row with
role='Driver' so they can log in to the driver mobile app with their phone
number + a one-time system-generated password. The plain password is returned
ONCE in the create / regenerate responses so the admin can share it with the
driver. We do NOT persist it; only the bcrypt hash is stored on the user row.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
import re
import uuid
import secrets
import string

from database import get_tenant_db
from deps import get_current_user, hash_password
from core.tenant import get_current_tenant_id

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


def _generate_password(length: int = 8) -> str:
    """Generate a short, easy-to-share password (letters+digits, no ambiguous chars)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # drop I, O, 0, 1
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _driver_synthetic_email(phone: str, tenant_id: str) -> str:
    """Driver users don't have a real email — synthesise one so the existing
    `users` schema (and its EmailStr field) doesn't reject them."""
    safe_tenant = re.sub(r"[^a-z0-9-]", "", (tenant_id or "default").lower()) or "default"
    return f"driver+{phone}@{safe_tenant}.drivers.local"


async def _provision_driver_user(driver: dict, tenant_id: str, current_user: dict) -> str:
    """Create a `users` row with role='Driver' tied to this driver_id.
    Returns the plaintext one-time password (caller must surface it once)."""
    tdb = get_tenant_db()
    phone = driver["phone"]
    # If a driver-role user already exists for this phone in this tenant, just rotate the password.
    existing = await tdb.users.find_one({"role": "Driver", "phone": phone}, {"_id": 0, "id": 1})
    plain = _generate_password()
    now = datetime.now(timezone.utc).isoformat()
    if existing:
        await tdb.users.update_one(
            {"id": existing["id"]},
            {"$set": {
                "password": hash_password(plain),
                "driver_id": driver["id"],
                "name": driver["full_name"],
                "is_active": driver.get("status") == "active",
                "force_password_change": False,
                "updated_at": now,
            }}
        )
        return plain
    user_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "email": _driver_synthetic_email(phone, tenant_id),
        "name": driver["full_name"],
        "role": "Driver",
        "department": "Distribution",
        "phone": phone,
        "city": driver.get("city"),
        "is_active": driver.get("status") == "active",
        "driver_id": driver["id"],
        "password": hash_password(plain),
        "force_password_change": False,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
        "provisioned_via": "fleet_driver",
    }
    await tdb.users.insert_one(user_doc)
    return plain


class DriverBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=120)
    phone: str = Field(..., min_length=1, max_length=20)
    license_number: str = Field(..., min_length=1, max_length=32)
    city: Optional[str] = Field(default=None, max_length=80)
    status: str = "active"
    notes: Optional[str] = None


class DriverCreate(DriverBase):
    pass


class DriverUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=20)
    license_number: Optional[str] = Field(default=None, max_length=32)
    city: Optional[str] = Field(default=None, max_length=80)
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
            {"city": {"$regex": s, "$options": "i"}},
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
        "city": (payload.city or "").strip() or None,
        "status": payload.status,
        "notes": (payload.notes or "").strip() or None,
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
    }
    await tdb.drivers.insert_one(doc)

    # Auto-provision Driver login (mobile no. + one-time password)
    tenant_id = get_current_tenant_id()
    try:
        login_password = await _provision_driver_user(doc, tenant_id, current_user)
    except Exception as e:
        # Driver record was saved; surface a soft warning so admin can regenerate later
        login_password = None
        notes_warn = f"WARN: driver user provisioning failed: {e}"
        await tdb.drivers.update_one({"id": doc["id"]}, {"$set": {"provisioning_error": notes_warn}})

    out = {k: v for k, v in doc.items() if k != "_id"}
    if login_password:
        out["login_password"] = login_password  # ONE-TIME — admin must copy now
        out["login_username"] = doc["phone"]
    return out


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
    if payload.city is not None:
        update_doc["city"] = payload.city.strip() or None
    if payload.notes is not None:
        update_doc["notes"] = payload.notes.strip() or None

    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await tdb.drivers.update_one({"id": driver_id}, {"$set": update_doc})

    # Sync the linked Driver user row (name / phone / city / active flag).
    if any(k in update_doc for k in ("full_name", "phone", "city", "status")):
        user_sync: dict = {}
        if "full_name" in update_doc:
            user_sync["name"] = update_doc["full_name"]
        if "phone" in update_doc:
            user_sync["phone"] = update_doc["phone"]
            # Synthetic email tracks phone — keep them in step so uniqueness holds.
            user_sync["email"] = _driver_synthetic_email(update_doc["phone"], get_current_tenant_id())
        if "city" in update_doc:
            user_sync["city"] = update_doc["city"]
        if "status" in update_doc:
            user_sync["is_active"] = update_doc["status"] == "active"
        user_sync["updated_at"] = update_doc["updated_at"]
        await tdb.users.update_one(
            {"driver_id": driver_id, "role": "Driver"},
            {"$set": user_sync}
        )

    return await tdb.drivers.find_one({"id": driver_id}, {"_id": 0})


@router.post("/{driver_id}/regenerate-password")
async def regenerate_driver_password(driver_id: str, current_user: dict = Depends(get_current_user)):
    """Re-issue a one-time password for the driver. Returned ONCE; not stored in plain."""
    _ensure_admin(current_user)
    tdb = get_tenant_db()
    driver = await tdb.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    tenant_id = get_current_tenant_id()
    new_password = await _provision_driver_user(driver, tenant_id, current_user)
    return {
        "driver_id": driver_id,
        "login_username": driver.get("phone"),
        "login_password": new_password,
    }


class SetDriverPasswordPayload(BaseModel):
    password: str = Field(..., min_length=4, max_length=64)


@router.post("/{driver_id}/set-password")
async def set_driver_password(
    driver_id: str,
    payload: SetDriverPasswordPayload,
    current_user: dict = Depends(get_current_user),
):
    """Admin/CEO sets a custom password for the driver. Useful when the driver
    can't (or won't) memorise the system-generated string. The password is
    stored only as a bcrypt hash; we don't echo it back."""
    _ensure_admin(current_user)
    tdb = get_tenant_db()
    driver = await tdb.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    tenant_id = get_current_tenant_id()
    phone = driver["phone"]
    now = datetime.now(timezone.utc).isoformat()

    # If a driver user doesn't yet exist (legacy fleet rows), create one with
    # the supplied password instead of a random one.
    existing = await tdb.users.find_one({"role": "Driver", "phone": phone}, {"_id": 0, "id": 1})
    if existing:
        await tdb.users.update_one(
            {"id": existing["id"]},
            {"$set": {
                "password": hash_password(payload.password),
                "driver_id": driver["id"],
                "name": driver["full_name"],
                "is_active": driver.get("status") == "active",
                "updated_at": now,
            }}
        )
    else:
        user_doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "email": _driver_synthetic_email(phone, tenant_id),
            "name": driver["full_name"],
            "role": "Driver",
            "department": "Distribution",
            "phone": phone,
            "city": driver.get("city"),
            "is_active": driver.get("status") == "active",
            "driver_id": driver["id"],
            "password": hash_password(payload.password),
            "force_password_change": False,
            "created_at": now,
            "updated_at": now,
            "created_by": current_user.get("id"),
            "provisioned_via": "fleet_driver_manual_password",
        }
        await tdb.users.insert_one(user_doc)

    return {"driver_id": driver_id, "login_username": phone, "updated": True}


@router.delete("/{driver_id}")
async def delete_driver(driver_id: str, current_user: dict = Depends(get_current_user)):
    _ensure_admin(current_user)
    tdb = get_tenant_db()
    r = await tdb.drivers.delete_one({"id": driver_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    # Remove the linked driver-role user as well so the phone number can be re-used.
    await tdb.users.delete_many({"driver_id": driver_id, "role": "Driver"})
    return {"deleted": True, "id": driver_id}


@router.get("/meta/options")
async def get_driver_options(current_user: dict = Depends(get_current_user)):
    """Static options the form needs (statuses)."""
    return {"statuses": ALLOWED_STATUSES}
