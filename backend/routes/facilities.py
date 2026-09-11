"""Facilities (Admin) — organization-owned facilities with photos/documents,
Google address, contacts, and a Facility → Floors → Areas hierarchy."""
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List

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


def _clean_part(text: str, max_words: int = 3) -> str:
    words = (text or "").strip().split()[:max_words]
    return re.sub(r"[^A-Za-z0-9_]", "", "_".join(words))


def _file_basename(facility_name: str, category: str, floor_name: str = None, area_name: str = None) -> str:
    """PHOT_/DOCU_ + facility (3 words) [+ floor + area], spaces → underscores."""
    parts = [TYPE_PREFIX[category], _clean_part(facility_name or "facility")]
    if floor_name:
        parts.append(_clean_part(floor_name, 2))
    if area_name:
        parts.append(_clean_part(area_name, 2))
    return "_".join(p for p in parts if p)


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
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    notes: Optional[str] = None


class GeofenceSettingsIn(BaseModel):
    geofence_enabled: bool
    geofence_radius_m: int


@router.get("/geofence-settings")
async def get_geofence_settings(current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    s = await db.maintenance_settings.find_one({"tenant_id": tenant_id}, {"_id": 0})
    return {"geofence_enabled": bool((s or {}).get("geofence_enabled")),
            "geofence_radius_m": int((s or {}).get("geofence_radius_m") or 200)}


@router.put("/geofence-settings")
async def set_geofence_settings(payload: GeofenceSettingsIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    if payload.geofence_radius_m < 10 or payload.geofence_radius_m > 100000:
        raise HTTPException(400, "Radius must be between 10 and 100000 meters")
    await db.maintenance_settings.update_one(
        {"tenant_id": tenant_id},
        {"$set": {"geofence_enabled": payload.geofence_enabled,
                  "geofence_radius_m": payload.geofence_radius_m,
                  "updated_by": current_user.get("name"), "updated_at": _now()}},
        upsert=True)
    return {"ok": True}


class NameIn(BaseModel):
    name: str


class CodeIn(BaseModel):
    code: str


def _norm_code(c: str) -> str:
    c = re.sub(r"[^A-Za-z0-9]", "", c or "").upper()[:6]
    if not c:
        raise HTTPException(400, "Code must contain 1-6 letters/numbers")
    return c


@router.put("/{facility_id}/code")
async def set_facility_code(facility_id: str, payload: CodeIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    code = _norm_code(payload.code)
    dup = await db.facilities.find_one({"tenant_id": tenant_id, "code": code, "id": {"$ne": facility_id}}, {"_id": 0, "id": 1})
    if dup:
        raise HTTPException(400, f"Code {code} is already used by another facility")
    r = await db.facilities.update_one({"tenant_id": tenant_id, "id": facility_id},
                                       {"$set": {"code": code, "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Facility not found")
    return {"ok": True, "code": code}


@router.put("/{facility_id}/floors/{floor_id}/code")
async def set_floor_code(facility_id: str, floor_id: str, payload: CodeIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    code = _norm_code(payload.code)
    fac = await db.facilities.find_one({"tenant_id": tenant_id, "id": facility_id}, {"_id": 0, "floors": 1})
    if not fac:
        raise HTTPException(404, "Facility not found")
    if any(fl.get("code") == code and fl.get("id") != floor_id for fl in fac.get("floors") or []):
        raise HTTPException(400, f"Code {code} is already used by another floor in this facility")
    r = await db.facilities.update_one(
        {"tenant_id": tenant_id, "id": facility_id, "floors.id": floor_id},
        {"$set": {"floors.$.code": code, "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Floor not found")
    return {"ok": True, "code": code}


@router.put("/{facility_id}/floors/{floor_id}/areas/{area_id}/code")
async def set_area_code(facility_id: str, floor_id: str, area_id: str, payload: CodeIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    code = _norm_code(payload.code)
    fac = await db.facilities.find_one({"tenant_id": tenant_id, "id": facility_id}, {"_id": 0, "floors": 1})
    if not fac:
        raise HTTPException(404, "Facility not found")
    floor = next((fl for fl in fac.get("floors") or [] if fl.get("id") == floor_id), None)
    if not floor:
        raise HTTPException(404, "Floor not found")
    if any(a.get("code") == code and a.get("id") != area_id for a in floor.get("areas") or []):
        raise HTTPException(400, f"Code {code} is already used by another area on this floor")
    r = await db.facilities.update_one(
        {"tenant_id": tenant_id, "id": facility_id},
        {"$set": {"floors.$[f].areas.$[a].code": code, "updated_at": _now()}},
        array_filters=[{"f.id": floor_id}, {"a.id": area_id}])
    if r.matched_count == 0:
        raise HTTPException(404, "Area not found")
    return {"ok": True, "code": code}


class AreaSupervisorsIn(BaseModel):
    user_ids: List[str] = []


@router.put("/{facility_id}/floors/{floor_id}/areas/{area_id}/supervisors")
async def set_area_supervisors(facility_id: str, floor_id: str, area_id: str, payload: AreaSupervisorsIn,
                               current_user: dict = Depends(get_current_user)):
    """Team members supervising every equipment in this area (equipment without its own supervisor inherits these)."""
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    from routes.equipment_master import _team_users
    sups = await _team_users(tenant_id, payload.user_ids)
    r = await db.facilities.update_one(
        {"tenant_id": tenant_id, "id": facility_id},
        {"$set": {"floors.$[f].areas.$[a].supervisor_ids": [x["id"] for x in sups],
                  "floors.$[f].areas.$[a].supervisors": sups, "updated_at": _now()}},
        array_filters=[{"f.id": floor_id}, {"a.id": area_id}])
    if r.matched_count == 0:
        raise HTTPException(404, "Area not found")
    return {"ok": True, "supervisors": sups}


@router.get("")
async def list_facilities(current_user: dict = Depends(get_current_user)):
    _ = current_user  # read-only listing available to all authenticated users (used by Equipment Master)
    from routes.equipment_master import _ensure_codes
    tenant_id = get_current_tenant_id()
    await _ensure_codes(tenant_id)
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
                               floor_id: Optional[str] = Form(None),
                               area_id: Optional[str] = Form(None),
                               current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    fac = await db.facilities.find_one({"tenant_id": tenant_id, "id": facility_id},
                                       {"_id": 0, "facility_name": 1, "attachments": 1, "floors": 1})
    if not fac:
        raise HTTPException(404, "Facility not found")
    if category not in CATEGORIES:
        raise HTTPException(400, "Invalid category — use photo or document")
    floor_name = area_name = None
    if floor_id:
        floor = next((f for f in fac.get("floors") or [] if f.get("id") == floor_id), None)
        if not floor:
            raise HTTPException(404, "Floor not found")
        floor_name = floor.get("name")
        if area_id:
            area = next((a for a in floor.get("areas") or [] if a.get("id") == area_id), None)
            if not area:
                raise HTTPException(404, "Area not found")
            area_name = area.get("name")
    content = await file.read()
    if len(content) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large (max {MAX_FILE_MB} MB)")
    original_name = os.path.basename(file.filename or "file")
    ext = os.path.splitext(original_name)[1].lower()
    base = _file_basename(fac.get("facility_name"), category, floor_name, area_name)
    serial = _next_serial(fac.get("attachments"), base)
    safe_name = f"{base}_{serial:02d}{ext}"
    storage_path = build_path(tenant_id, "facility_docs", safe_name)
    await put_object(storage_path, content, file.content_type or "application/octet-stream")
    meta = {"id": str(uuid.uuid4()), "filename": safe_name, "original_filename": original_name,
            "size": len(content), "storage_path": storage_path,
            "content_type": file.content_type, "category": category,
            "floor_id": floor_id or None, "area_id": area_id or None,
            "floor_name": floor_name, "area_name": area_name,
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
