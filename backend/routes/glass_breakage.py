"""Glass Breakage Register — production compliance log (HACCP glass control)."""
import uuid
import logging
from io import BytesIO
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db
from utils.excel_branding import brand_workbook

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/production/glass-breakage", tags=["Glass Breakage Register"])

QA_RELEASE_ROLES = {"ceo", "system admin", "admin", "director", "vice president",
                    "production manager", "qa manager", "qc manager", "quality manager"}


def _can_qa_release(user: dict) -> bool:
    return (user.get("role") or "").strip().lower() in QA_RELEASE_ROLES


class GlassBreakageCreate(BaseModel):
    incident_at: str  # ISO datetime of the breakage
    location: str
    batch_id: Optional[str] = None
    batch_code: Optional[str] = None
    production_details: Optional[str] = None
    cause: str
    quantity_quarantined: int = 0
    quantity_rejected: int = 0
    cleaning_undertaken: Optional[str] = None
    inspection_performed: Optional[str] = None
    corrective_action: Optional[str] = None


class GlassBreakageUpdate(BaseModel):
    incident_at: Optional[str] = None
    location: Optional[str] = None
    batch_id: Optional[str] = None
    batch_code: Optional[str] = None
    production_details: Optional[str] = None
    cause: Optional[str] = None
    quantity_quarantined: Optional[int] = None
    quantity_rejected: Optional[int] = None
    cleaning_undertaken: Optional[str] = None
    inspection_performed: Optional[str] = None
    corrective_action: Optional[str] = None


class QAReleaseBody(BaseModel):
    remarks: Optional[str] = None


_INDEX_READY = False


async def _ensure_index():
    global _INDEX_READY
    if not _INDEX_READY:
        await db.glass_breakage_register.create_index(
            [("tenant_id", 1), ("register_no", 1)], unique=True)
        _INDEX_READY = True


async def _next_register_no(tenant_id: str) -> str:
    """Atomic per-tenant sequence — immune to deletions and concurrent creates."""
    from pymongo import ReturnDocument
    key = f"glass_breakage_{tenant_id}"
    doc = await db.counters.find_one_and_update(
        {"_id": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    seq = doc["seq"]
    if seq == 1:
        # First use: skip past any legacy count-based numbers already issued.
        legacy = await db.glass_breakage_register.count_documents({"tenant_id": tenant_id})
        if legacy:
            doc = await db.counters.find_one_and_update(
                {"_id": key}, {"$max": {"seq": legacy + 1}}, return_document=ReturnDocument.AFTER)
            seq = doc["seq"]
    return f"GBR-{seq:04d}"


@router.get("")
async def list_entries(
    status: Optional[str] = Query(None, description="open | released"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    _ = current_user
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id}
    if status:
        q["status"] = status
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59" if len(date_to) == 10 else date_to
        q["incident_at"] = rng
    entries = await db.glass_breakage_register.find(q, {"_id": 0}).sort("incident_at", -1).to_list(1000)
    return {"entries": entries, "can_qa_release": _can_qa_release(current_user)}


@router.post("")
async def create_entry(data: GlassBreakageCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if not data.location.strip():
        raise HTTPException(400, "Location is required")
    if not data.cause.strip():
        raise HTTPException(400, "Cause of breakage is required")
    if data.quantity_quarantined < 0 or data.quantity_rejected < 0:
        raise HTTPException(400, "Quantities cannot be negative")
    await _ensure_index()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "register_no": await _next_register_no(tenant_id),
        **data.dict(),
        "status": "open",
        "qa_release": None,
        "reported_by": current_user.get("id"),
        "reported_by_name": current_user.get("name") or current_user.get("email"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.glass_breakage_register.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{entry_id}")
async def update_entry(entry_id: str, data: GlassBreakageUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    entry = await db.glass_breakage_register.find_one({"tenant_id": tenant_id, "id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.get("status") == "released" and not _can_qa_release(current_user):
        raise HTTPException(403, "Entry is QA-released; only QA/managers can amend it.")
    updates = data.dict(exclude_unset=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.glass_breakage_register.update_one({"tenant_id": tenant_id, "id": entry_id}, {"$set": updates})
    return await db.glass_breakage_register.find_one({"tenant_id": tenant_id, "id": entry_id}, {"_id": 0})


@router.delete("/{entry_id}")
async def delete_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if not _can_qa_release(current_user):
        raise HTTPException(403, "Only QA/managers can delete register entries.")
    res = await db.glass_breakage_register.delete_one({"tenant_id": tenant_id, "id": entry_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Entry not found")
    return {"deleted": True}


@router.post("/{entry_id}/qa-release")
async def qa_release(entry_id: str, body: QAReleaseBody, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if not _can_qa_release(current_user):
        raise HTTPException(403, "Your role is not authorized to give QA release.")
    entry = await db.glass_breakage_register.find_one({"tenant_id": tenant_id, "id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.get("status") == "released":
        raise HTTPException(400, "Entry is already QA-released.")
    qa = {
        "authorized_by": current_user.get("id"),
        "authorized_by_name": current_user.get("name") or current_user.get("email"),
        "authorized_at": datetime.now(timezone.utc).isoformat(),
        "remarks": body.remarks,
    }
    await db.glass_breakage_register.update_one(
        {"tenant_id": tenant_id, "id": entry_id},
        {"$set": {"status": "released", "qa_release": qa, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return await db.glass_breakage_register.find_one({"tenant_id": tenant_id, "id": entry_id}, {"_id": 0})


@router.get("/export")
async def export_register(current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    entries = await db.glass_breakage_register.find({"tenant_id": tenant_id}, {"_id": 0}).sort("incident_at", -1).to_list(5000)
    wb = Workbook()
    ws = wb.active
    ws.title = "Glass Breakage Register"
    headers = ["Reg No", "Date & Time", "Location", "Batch / Production Details", "Cause of Breakage",
               "Qty Quarantined", "Qty Rejected", "Cleaning Undertaken", "Inspection Performed",
               "Corrective Action", "QA Release", "Authorized By", "Authorized At", "Reported By"]
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill(start_color="003048", end_color="003048", fill_type="solid")
    for e in entries:
        batch = " — ".join([x for x in [e.get("batch_code"), e.get("production_details")] if x])
        qa = e.get("qa_release") or {}
        ws.append([
            e.get("register_no"), e.get("incident_at"), e.get("location"), batch, e.get("cause"),
            e.get("quantity_quarantined") or 0, e.get("quantity_rejected") or 0,
            e.get("cleaning_undertaken"), e.get("inspection_performed"), e.get("corrective_action"),
            "Released" if e.get("status") == "released" else "Pending",
            qa.get("authorized_by_name"), qa.get("authorized_at"), e.get("reported_by_name"),
        ])
    widths = [10, 20, 18, 28, 26, 14, 12, 26, 26, 28, 12, 20, 20, 18]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w
    brand_workbook(wb)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"glass_breakage_register_{datetime.now(timezone.utc).strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )
