"""Equipment Master & Maintenance Management — production equipment hierarchy,
maintenance/replacement schedules and vendor associations."""
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Query
from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/production/equipment", tags=["Equipment Master"])

DEFAULT_TYPES = ["Filters", "Pumps", "Air Water Generators", "RO/Membrane Systems",
                 "UV Systems", "Ozone Systems", "Filling Machines", "Compressors", "Chillers"]


class EquipmentTypeIn(BaseModel):
    name: str
    description: Optional[str] = None


class VendorAssociation(BaseModel):
    vendor_id: str
    vendor_name: Optional[str] = None
    preferred: bool = False
    lead_time_days: Optional[int] = None
    last_purchase_price: Optional[float] = None
    vendor_part_code: Optional[str] = None
    contact_details: Optional[str] = None
    amc_details: Optional[str] = None


class EquipmentIn(BaseModel):
    name: str
    equipment_type_id: str
    make_brand: Optional[str] = None
    model_spec: Optional[str] = None
    maintenance_frequency_days: Optional[int] = None
    replacement_frequency_days: Optional[int] = None
    procurement_lead_time_days: Optional[int] = None
    last_maintenance_date: Optional[str] = None   # YYYY-MM-DD
    next_maintenance_due: Optional[str] = None
    last_replacement_date: Optional[str] = None
    next_replacement_due: Optional[str] = None
    expected_life: Optional[str] = None
    min_stock_level: Optional[int] = None
    remarks: Optional[str] = None
    vendors: List[VendorAssociation] = []


class LogDateBody(BaseModel):
    date: Optional[str] = None  # YYYY-MM-DD, default today
    remarks: Optional[str] = None
    photo_ids: List[str] = []


async def _log_photos_meta(tenant_id: str, equipment_id: str, photo_ids: List[str]) -> list:
    """Resolve uploaded attachment ids into embedded log-photo references."""
    if not photo_ids:
        return []
    eq = await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0, "attachments": 1})
    by_id = {f["id"]: f for f in (eq or {}).get("attachments", [])}
    return [{"id": pid, "filename": by_id[pid]["filename"]} for pid in photo_ids if pid in by_id]


def _add_days(date_str: Optional[str], days: Optional[int]) -> Optional[str]:
    if not date_str or not days:
        return None
    try:
        return (datetime.fromisoformat(date_str[:10]) + timedelta(days=days)).strftime("%Y-%m-%d")
    except ValueError:
        return None


def _compute_dues(doc: dict):
    """Fill next-due dates from last date + frequency when not explicitly set."""
    if not doc.get("next_maintenance_due"):
        doc["next_maintenance_due"] = _add_days(doc.get("last_maintenance_date"), doc.get("maintenance_frequency_days"))
    if not doc.get("next_replacement_due"):
        doc["next_replacement_due"] = _add_days(doc.get("last_replacement_date"), doc.get("replacement_frequency_days"))


# ── Equipment Types (parent master) ──────────────────────────

@router.get("/types")
async def list_types(current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    types = await db.equipment_types.find({"tenant_id": tenant_id}, {"_id": 0}).sort("name", 1).to_list(500)
    counts = {}
    for t in types:
        counts[t["id"]] = await db.equipment_master.count_documents({"tenant_id": tenant_id, "equipment_type_id": t["id"]})
        t["equipment_count"] = counts[t["id"]]
    return {"types": types}


@router.post("/types")
async def create_type(data: EquipmentTypeIn, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    if not data.name.strip():
        raise HTTPException(400, "Type name is required")
    dup = await db.equipment_types.find_one({"tenant_id": tenant_id, "name": {"$regex": f"^{data.name.strip()}$", "$options": "i"}})
    if dup:
        raise HTTPException(409, f"Equipment type '{data.name}' already exists")
    doc = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": data.name.strip(),
           "description": data.description, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.equipment_types.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/types/seed-defaults")
async def seed_default_types(current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    existing = {t["name"].lower() for t in await db.equipment_types.find({"tenant_id": tenant_id}, {"_id": 0, "name": 1}).to_list(500)}
    created = 0
    for name in DEFAULT_TYPES:
        if name.lower() not in existing:
            await db.equipment_types.insert_one({"id": str(uuid.uuid4()), "tenant_id": tenant_id, "name": name,
                                                 "description": None, "created_at": datetime.now(timezone.utc).isoformat()})
            created += 1
    return {"created": created}


@router.put("/types/{type_id}")
async def update_type(type_id: str, data: EquipmentTypeIn, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    res = await db.equipment_types.update_one(
        {"tenant_id": tenant_id, "id": type_id},
        {"$set": {"name": data.name.strip(), "description": data.description}})
    if res.matched_count == 0:
        raise HTTPException(404, "Type not found")
    await db.equipment_master.update_many(
        {"tenant_id": tenant_id, "equipment_type_id": type_id},
        {"$set": {"equipment_type_name": data.name.strip()}})
    return await db.equipment_types.find_one({"tenant_id": tenant_id, "id": type_id}, {"_id": 0})


@router.delete("/types/{type_id}")
async def delete_type(type_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    n = await db.equipment_master.count_documents({"tenant_id": tenant_id, "equipment_type_id": type_id})
    if n > 0:
        raise HTTPException(409, f"Cannot delete: {n} equipment item(s) belong to this type")
    res = await db.equipment_types.delete_one({"tenant_id": tenant_id, "id": type_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Type not found")
    return {"deleted": True}


# ── Equipment / Components (child master) ────────────────────

async def _hydrate_vendors(tenant_id: str, vendors: List[VendorAssociation]) -> list:
    out = []
    for v in vendors:
        d = v.dict()
        if not d.get("vendor_name"):
            vend = await db.inventory_vendors.find_one({"tenant_id": tenant_id, "id": v.vendor_id}, {"_id": 0, "vendor_name": 1})
            d["vendor_name"] = (vend or {}).get("vendor_name") or v.vendor_id
        out.append(d)
    return out


@router.get("")
async def list_equipment(
    equipment_type_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id}
    if equipment_type_id:
        q["equipment_type_id"] = equipment_type_id
    if search:
        q["$or"] = [{"name": {"$regex": search, "$options": "i"}},
                    {"make_brand": {"$regex": search, "$options": "i"}},
                    {"model_spec": {"$regex": search, "$options": "i"}}]
    items = await db.equipment_master.find(q, {"_id": 0}).sort([("equipment_type_name", 1), ("name", 1)]).to_list(2000)
    return {"equipment": items}


@router.post("")
async def create_equipment(data: EquipmentIn, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    if not data.name.strip():
        raise HTTPException(400, "Equipment name is required")
    etype = await db.equipment_types.find_one({"tenant_id": tenant_id, "id": data.equipment_type_id}, {"_id": 0, "name": 1})
    if not etype:
        raise HTTPException(400, "Equipment type not found")
    doc = data.dict()
    doc["vendors"] = await _hydrate_vendors(tenant_id, data.vendors)
    _compute_dues(doc)
    doc.update({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id,
        "equipment_type_name": etype["name"], "is_active": True,
        "maintenance_log": [], "replacement_log": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.equipment_master.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{equipment_id}")
async def update_equipment(equipment_id: str, data: EquipmentIn, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    existing = await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Equipment not found")
    etype = await db.equipment_types.find_one({"tenant_id": tenant_id, "id": data.equipment_type_id}, {"_id": 0, "name": 1})
    if not etype:
        raise HTTPException(400, "Equipment type not found")
    updates = data.dict()
    updates["vendors"] = await _hydrate_vendors(tenant_id, data.vendors)
    _compute_dues(updates)
    updates["equipment_type_name"] = etype["name"]
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.equipment_master.update_one({"tenant_id": tenant_id, "id": equipment_id}, {"$set": updates})
    return await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0})


@router.delete("/{equipment_id}")
async def delete_equipment(equipment_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    res = await db.equipment_master.delete_one({"tenant_id": tenant_id, "id": equipment_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Equipment not found")
    return {"deleted": True}


@router.post("/{equipment_id}/log-maintenance")
async def log_maintenance(equipment_id: str, body: LogDateBody, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    eq = await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0})
    if not eq:
        raise HTTPException(404, "Equipment not found")
    date = body.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    next_due = _add_days(date, eq.get("maintenance_frequency_days"))
    entry = {"date": date, "remarks": body.remarks, "by": current_user.get("name") or current_user.get("email"),
             "photos": await _log_photos_meta(tenant_id, equipment_id, body.photo_ids),
             "at": datetime.now(timezone.utc).isoformat()}
    await db.equipment_master.update_one(
        {"tenant_id": tenant_id, "id": equipment_id},
        {"$set": {"last_maintenance_date": date, "next_maintenance_due": next_due,
                  "updated_at": datetime.now(timezone.utc).isoformat()},
         "$push": {"maintenance_log": entry}})
    return await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0})


@router.post("/{equipment_id}/log-replacement")
async def log_replacement(equipment_id: str, body: LogDateBody, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    eq = await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0})
    if not eq:
        raise HTTPException(404, "Equipment not found")
    date = body.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    next_due = _add_days(date, eq.get("replacement_frequency_days"))
    entry = {"date": date, "remarks": body.remarks, "by": current_user.get("name") or current_user.get("email"),
             "photos": await _log_photos_meta(tenant_id, equipment_id, body.photo_ids),
             "at": datetime.now(timezone.utc).isoformat()}
    await db.equipment_master.update_one(
        {"tenant_id": tenant_id, "id": equipment_id},
        {"$set": {"last_replacement_date": date, "next_replacement_due": next_due,
                  "updated_at": datetime.now(timezone.utc).isoformat()},
         "$push": {"replacement_log": entry}})
    return await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0})


# ── Attachments (photos, certifications, quotations, documents) ──
import os
from fastapi import UploadFile, File, Form
from fastapi.responses import FileResponse

EQ_UPLOAD_DIR = "/app/backend/uploads/equipment_docs"
EQ_MAX_FILE_MB = 15
EQ_CATEGORIES = {"photo", "certification", "quotation", "document"}
EQ_TYPE_PREFIX = {"photo": "PHOT", "certification": "CERT", "quotation": "VEND", "document": "OTHE"}


def _eq_file_basename(equipment_name: str, category: str) -> str:
    """TYPE_Equipment_Name (first 3 words if longer), spaces → underscores."""
    import re as _re
    words = (equipment_name or "equipment").strip().split()
    if len(words) > 3:
        words = words[:3]
    name_part = _re.sub(r"[^A-Za-z0-9_]", "", "_".join(words).replace(" ", "_"))
    return f"{EQ_TYPE_PREFIX[category]}_{name_part}"


def _next_serial(attachments: list, base: str) -> int:
    """Per equipment + doc-type serial: max existing serial for this base + 1."""
    import re as _re
    top = 0
    for f in attachments or []:
        m = _re.match(rf"^{_re.escape(base)}_(\d+)\.", f.get("filename") or "")
        if m:
            top = max(top, int(m.group(1)))
    return top + 1


@router.post("/{equipment_id}/files")
async def upload_equipment_file(equipment_id: str, file: UploadFile = File(...),
                                category: str = Form("document"),
                                current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    eq = await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id},
                                            {"_id": 0, "id": 1, "name": 1, "attachments": 1})
    if not eq:
        raise HTTPException(404, "Equipment not found")
    if category not in EQ_CATEGORIES:
        raise HTTPException(400, f"Invalid category — use one of {sorted(EQ_CATEGORIES)}")
    content = await file.read()
    if len(content) > EQ_MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large (max {EQ_MAX_FILE_MB} MB)")
    os.makedirs(EQ_UPLOAD_DIR, exist_ok=True)
    file_id = str(uuid.uuid4())
    original_name = os.path.basename(file.filename or "file")
    ext = os.path.splitext(original_name)[1].lower()
    base = _eq_file_basename(eq.get("name"), category)
    serial = _next_serial(eq.get("attachments"), base)
    safe_name = f"{base}_{serial:02d}{ext}"
    with open(os.path.join(EQ_UPLOAD_DIR, f"{file_id}_{safe_name}"), "wb") as fh:
        fh.write(content)
    meta = {"id": file_id, "filename": safe_name, "original_filename": original_name,
            "size": len(content),
            "content_type": file.content_type, "category": category,
            "uploaded_by": current_user.get("name") or current_user.get("email"),
            "uploaded_at": datetime.now(timezone.utc).isoformat()}
    await db.equipment_master.update_one(
        {"tenant_id": tenant_id, "id": equipment_id},
        {"$push": {"attachments": meta},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    return meta


@router.get("/{equipment_id}/files/{file_id}")
async def download_equipment_file(equipment_id: str, file_id: str,
                                  current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    eq = await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0, "attachments": 1})
    if not eq:
        raise HTTPException(404, "Equipment not found")
    meta = next((f for f in eq.get("attachments", []) if f["id"] == file_id), None)
    if not meta:
        raise HTTPException(404, "File not found")
    path = os.path.join(EQ_UPLOAD_DIR, f"{file_id}_{meta['filename']}")
    if not os.path.exists(path):
        raise HTTPException(404, "File missing from storage")
    return FileResponse(path, filename=meta["filename"],
                        media_type=meta.get("content_type") or "application/octet-stream")


@router.delete("/{equipment_id}/files/{file_id}")
async def delete_equipment_file(equipment_id: str, file_id: str,
                                current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    eq = await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0, "attachments": 1})
    if not eq:
        raise HTTPException(404, "Equipment not found")
    meta = next((f for f in eq.get("attachments", []) if f["id"] == file_id), None)
    if not meta:
        raise HTTPException(404, "File not found")
    path = os.path.join(EQ_UPLOAD_DIR, f"{file_id}_{meta['filename']}")
    if os.path.exists(path):
        os.remove(path)
    await db.equipment_master.update_one(
        {"tenant_id": tenant_id, "id": equipment_id},
        {"$pull": {"attachments": {"id": file_id}},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"deleted": True}
