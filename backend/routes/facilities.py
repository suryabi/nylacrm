"""Facilities (Admin) — organization-owned facilities with photos/documents,
Google address, contacts, and a Facility → Floors → Areas hierarchy."""
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from services.object_storage import build_path, put_object, get_object, delete_object

router = APIRouter()

ADMIN_ROLES = {"ceo", "admin", "system admin", "system_admin", "director", "tenant_admin"}
MAX_FILE_MB = 15
CATEGORIES = {"photo", "document"}
TYPE_PREFIX = {"photo": "PHOT", "document": "DOCU"}
FACILITY_TYPES = ["Factory", "Warehouse", "Administration Office", "Guest House", "Retail Outlet", "Other"]


def _require_admin(user: dict):
    if (user.get("role") or "").lower() not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin access required")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _file_basename(facility_name: str, category: str) -> str:
    """PHOT_/DOCU_ + facility name (first 3 words), spaces → underscores."""
    words = (facility_name or "facility").strip().split()
    if len(words) > 3:
        words = words[:3]
    name_part = re.sub(r"[^A-Za-z0-9_]", "", "_".join(words))
    return f"{TYPE_PREFIX[category]}_{name_part}"


def _next_serial(attachments: list, base: str) -> int:
    top = 0
    for f in attachments or []:
        m = re.match(rf"^{re.escape(base)}_(\d+)\.", f.get("filename") or "")
        if m:
            top = max(top, int(m.group(1)))
    return top + 1


class FacilityIn(BaseModel):
    facility_name: str
    facility_type: str
    google_address: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    notes: Optional[str] = None


class NameIn(BaseModel):
    name: str


@router.get("")
async def list_facilities(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    rows = await db.facilities.find({"tenant_id": tenant_id}, {"_id": 0}).sort("facility_name", 1).to_list(500)
    return {"facilities": rows, "facility_types": FACILITY_TYPES}


@router.post("")
async def create_facility(payload: FacilityIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    doc = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, **payload.dict(),
           "floors": [], "attachments": [],
           "created_by": current_user.get("name"), "created_at": _now(), "updated_at": _now()}
    await db.facilities.insert_one({**doc})
    doc.pop("_id", None)
    return doc


@router.put("/{facility_id}")
async def update_facility(facility_id: str, payload: FacilityIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    r = await db.facilities.update_one({"tenant_id": tenant_id, "id": facility_id},
                                       {"$set": {**payload.dict(), "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Facility not found")
    return {"ok": True}


@router.delete("/{facility_id}")
async def delete_facility(facility_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    fac = await db.facilities.find_one({"tenant_id": tenant_id, "id": facility_id}, {"_id": 0, "attachments": 1})
    if not fac:
        raise HTTPException(404, "Facility not found")
    for meta in fac.get("attachments") or []:
        if meta.get("storage_path"):
            try:
                await delete_object(meta["storage_path"])
            except Exception:
                pass
    await db.facilities.delete_one({"tenant_id": tenant_id, "id": facility_id})
    return {"ok": True}


# ── Floors & Areas ───────────────────────────────────────────────────────────
@router.post("/{facility_id}/floors")
async def add_floor(facility_id: str, payload: NameIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    floor = {"id": str(uuid.uuid4()), "name": payload.name.strip(), "areas": []}
    r = await db.facilities.update_one({"tenant_id": tenant_id, "id": facility_id},
                                       {"$push": {"floors": floor}, "$set": {"updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Facility not found")
    return floor


@router.put("/{facility_id}/floors/{floor_id}")
async def rename_floor(facility_id: str, floor_id: str, payload: NameIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    r = await db.facilities.update_one(
        {"tenant_id": tenant_id, "id": facility_id, "floors.id": floor_id},
        {"$set": {"floors.$.name": payload.name.strip(), "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Floor not found")
    return {"ok": True}


@router.delete("/{facility_id}/floors/{floor_id}")
async def delete_floor(facility_id: str, floor_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    r = await db.facilities.update_one({"tenant_id": tenant_id, "id": facility_id},
                                       {"$pull": {"floors": {"id": floor_id}}, "$set": {"updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Facility not found")
    return {"ok": True}


@router.post("/{facility_id}/floors/{floor_id}/areas")
async def add_area(facility_id: str, floor_id: str, payload: NameIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    area = {"id": str(uuid.uuid4()), "name": payload.name.strip()}
    r = await db.facilities.update_one(
        {"tenant_id": tenant_id, "id": facility_id, "floors.id": floor_id},
        {"$push": {"floors.$.areas": area}, "$set": {"updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Floor not found")
    return area


@router.delete("/{facility_id}/floors/{floor_id}/areas/{area_id}")
async def delete_area(facility_id: str, floor_id: str, area_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    r = await db.facilities.update_one(
        {"tenant_id": tenant_id, "id": facility_id, "floors.id": floor_id},
        {"$pull": {"floors.$.areas": {"id": area_id}}, "$set": {"updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Floor not found")
    return {"ok": True}


# ── Files (photos & documents) ───────────────────────────────────────────────
@router.post("/{facility_id}/files")
async def upload_facility_file(facility_id: str, file: UploadFile = File(...),
                               category: str = Form("document"),
                               current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    fac = await db.facilities.find_one({"tenant_id": tenant_id, "id": facility_id},
                                       {"_id": 0, "facility_name": 1, "attachments": 1})
    if not fac:
        raise HTTPException(404, "Facility not found")
    if category not in CATEGORIES:
        raise HTTPException(400, "Invalid category — use photo or document")
    content = await file.read()
    if len(content) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large (max {MAX_FILE_MB} MB)")
    original_name = os.path.basename(file.filename or "file")
    ext = os.path.splitext(original_name)[1].lower()
    base = _file_basename(fac.get("facility_name"), category)
    serial = _next_serial(fac.get("attachments"), base)
    safe_name = f"{base}_{serial:02d}{ext}"
    storage_path = build_path(tenant_id, "facility_docs", safe_name)
    await put_object(storage_path, content, file.content_type or "application/octet-stream")
    meta = {"id": str(uuid.uuid4()), "filename": safe_name, "original_filename": original_name,
            "size": len(content), "storage_path": storage_path,
            "content_type": file.content_type, "category": category,
            "uploaded_by": current_user.get("name") or current_user.get("email"),
            "uploaded_at": _now()}
    await db.facilities.update_one({"tenant_id": tenant_id, "id": facility_id},
                                   {"$push": {"attachments": meta}, "$set": {"updated_at": _now()}})
    return meta


@router.get("/{facility_id}/files/{file_id}")
async def download_facility_file(facility_id: str, file_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    fac = await db.facilities.find_one({"tenant_id": tenant_id, "id": facility_id}, {"_id": 0, "attachments": 1})
    if not fac:
        raise HTTPException(404, "Facility not found")
    meta = next((f for f in fac.get("attachments") or [] if f.get("id") == file_id), None)
    if not meta:
        raise HTTPException(404, "File not found")
    data, ctype = await get_object(meta["storage_path"])
    return Response(content=data, media_type=meta.get("content_type") or ctype or "application/octet-stream",
                    headers={"Content-Disposition": f'inline; filename="{meta["filename"]}"'})


@router.delete("/{facility_id}/files/{file_id}")
async def delete_facility_file(facility_id: str, file_id: str, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    fac = await db.facilities.find_one({"tenant_id": tenant_id, "id": facility_id}, {"_id": 0, "attachments": 1})
    if not fac:
        raise HTTPException(404, "Facility not found")
    meta = next((f for f in fac.get("attachments") or [] if f.get("id") == file_id), None)
    if not meta:
        raise HTTPException(404, "File not found")
    if meta.get("storage_path"):
        try:
            await delete_object(meta["storage_path"])
        except Exception:
            pass
    await db.facilities.update_one({"tenant_id": tenant_id, "id": facility_id},
                                   {"$pull": {"attachments": {"id": file_id}}, "$set": {"updated_at": _now()}})
    return {"ok": True}
