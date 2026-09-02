"""Maintenance sheets: per-equipment printable QR calendars, date-locked QR scanning,
camera-captured timestamped photos, immutable records with correction audit trail."""
import base64
import io
import os
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import qrcode
from PIL import Image, ImageDraw
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from services.object_storage import build_path, put_object, get_object

router = APIRouter()

IST = ZoneInfo("Asia/Kolkata")
FREQ_LABELS = {1: "Daily", 2: "Alternate Days", 7: "Weekly", 10: "Every 10 Days",
               14: "Fortnightly", 30: "Monthly", 90: "Quarterly"}


def _freq_label(days):
    return FREQ_LABELS.get(days, f"Every {days} Days" if days else "No Schedule")


def _month_bounds(month: str):
    try:
        start = datetime.strptime(month + "-01", "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "month must be YYYY-MM")
    nxt = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return start, nxt - timedelta(days=1)


def _scheduled_dates(freq_days: int, anchor: Optional[str], month: str) -> list:
    start, end = _month_bounds(month)
    if not freq_days:
        return []
    if freq_days == 1:
        base = start
        if anchor:
            a = datetime.strptime(anchor[:10], "%Y-%m-%d").date()
            if a > end:
                return []
            base = max(start, a)
        return [(base + timedelta(days=i)).isoformat() for i in range((end - base).days + 1)]
    a = datetime.strptime(anchor[:10], "%Y-%m-%d").date() if anchor else start
    if a > end:
        return []
    if a < start:
        k = ((start - a).days + freq_days - 1) // freq_days
        a = a + timedelta(days=k * freq_days)
    out = []
    while a <= end:
        out.append(a.isoformat())
        a += timedelta(days=freq_days)
    return out


def _qr_data_uri(url: str) -> str:
    qr = qrcode.QRCode(box_size=4, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _stamp_photo(content: bytes, stamp_text: str) -> bytes:
    img = Image.open(io.BytesIO(content)).convert("RGB")
    if img.width > 1600:
        ratio = 1600 / img.width
        img = img.resize((1600, int(img.height * ratio)))
    draw = ImageDraw.Draw(img)
    font_size = max(16, img.width // 45)
    try:
        from PIL import ImageFont
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except Exception:
        font = None
    bbox = draw.textbbox((0, 0), stamp_text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad = 8
    x, y = img.width - tw - pad * 2 - 10, img.height - th - pad * 2 - 10
    draw.rectangle([x, y, x + tw + pad * 2, y + th + pad * 2], fill=(0, 0, 0))
    draw.text((x + pad, y + pad - bbox[1]), stamp_text, fill=(255, 220, 60), font=font)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=85)
    return out.getvalue()


async def _get_equipment(tenant_id: str, equipment_id: str) -> dict:
    eq = await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0})
    if not eq:
        raise HTTPException(404, "Equipment not found")
    return eq


# ── Printable sheet ──────────────────────────────────────────────────────────
@router.get("/equipment/{equipment_id}/sheet")
async def maintenance_sheet(equipment_id: str, month: str = Query(...), origin: str = Query(...),
                            current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    eq = await _get_equipment(tenant_id, equipment_id)
    freq = eq.get("maintenance_frequency_days")
    if not freq:
        raise HTTPException(400, "This equipment has no maintenance frequency set")
    anchor = eq.get("maintenance_start_date") or eq.get("last_maintenance_date")
    sched = set(_scheduled_dates(freq, anchor, month))
    start, end = _month_bounds(month)

    slots = {s["date"]: s for s in await db.maintenance_slots.find(
        {"tenant_id": tenant_id, "equipment_id": equipment_id,
         "date": {"$gte": start.isoformat(), "$lte": end.isoformat()}}, {"_id": 0}).to_list(400)}
    for d in sched:
        if d not in slots:
            slot = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "equipment_id": equipment_id,
                    "date": d, "token": uuid.uuid4().hex, "submitted": False,
                    "created_at": datetime.now(timezone.utc).isoformat()}
            await db.maintenance_slots.insert_one({**slot})
            slot.pop("_id", None)
            slots[d] = slot

    days = []
    cur = start
    while cur <= end:
        d = cur.isoformat()
        entry = {"date": d, "day": cur.day, "weekday": cur.weekday(), "scheduled": d in sched}
        if d in sched:
            entry["qr"] = _qr_data_uri(f"{origin.rstrip('/')}/maintenance-scan/{slots[d]['token']}")
        days.append(entry)
        cur += timedelta(days=1)

    location = " › ".join(x for x in [eq.get("facility_name"), eq.get("floor_name"), eq.get("area_name")] if x)
    return {"equipment": {"id": eq["id"], "name": eq["name"], "type": eq.get("equipment_type_name"),
                          "make": eq.get("make_brand"), "model": eq.get("model_spec"), "location": location},
            "month": month, "month_label": start.strftime("%B %Y").upper(),
            "frequency_label": _freq_label(freq), "lead_blanks": start.weekday(), "days": days}


# ── Profile: schedule, upcoming, records ─────────────────────────────────────
@router.get("/equipment/{equipment_id}/profile")
async def maintenance_profile(equipment_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    eq = await _get_equipment(tenant_id, equipment_id)
    freq = eq.get("maintenance_frequency_days")
    anchor = eq.get("maintenance_start_date") or eq.get("last_maintenance_date")
    today = datetime.now(IST).date()
    upcoming = []
    if freq:
        for m in [today.strftime("%Y-%m"), (today.replace(day=28) + timedelta(days=4)).replace(day=1).strftime("%Y-%m")]:
            upcoming += [d for d in _scheduled_dates(freq, anchor, m) if d >= today.isoformat()]
        upcoming = upcoming[:10]
    records = await db.maintenance_records.find(
        {"tenant_id": tenant_id, "equipment_id": equipment_id}, {"_id": 0}).sort("scheduled_date", -1).to_list(200)
    n_done = sum(1 for r in records if r["status"] == "completed")
    return {"equipment": {"id": eq["id"], "name": eq["name"], "type": eq.get("equipment_type_name")},
            "frequency_days": freq, "frequency_label": _freq_label(freq),
            "maintenance_start_date": eq.get("maintenance_start_date"),
            "last_maintenance_date": eq.get("last_maintenance_date"),
            "next_maintenance_due": eq.get("next_maintenance_due"),
            "upcoming_dates": upcoming, "records": records,
            "stats": {"total": len(records), "completed": n_done, "incomplete": len(records) - n_done}}


# ── QR scan flow ─────────────────────────────────────────────────────────────
async def _slot_by_token(tenant_id: str, token: str) -> dict:
    slot = await db.maintenance_slots.find_one({"tenant_id": tenant_id, "token": token}, {"_id": 0})
    if not slot:
        raise HTTPException(404, "Unknown QR code")
    return slot


@router.get("/scan/{token}")
async def scan_status(token: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    slot = await _slot_by_token(tenant_id, token)
    eq = await _get_equipment(tenant_id, slot["equipment_id"])
    today = datetime.now(IST).date().isoformat()
    base = {"equipment_name": eq["name"], "equipment_id": eq["id"],
            "equipment_type": eq.get("equipment_type_name"), "scheduled_date": slot["date"], "today": today}
    if slot["date"] != today:
        return {**base, "valid": False, "message": "This QR code is not valid for today."}
    if slot.get("submitted"):
        rec = await db.maintenance_records.find_one({"tenant_id": tenant_id, "slot_id": slot["id"]}, {"_id": 0})
        return {**base, "valid": True, "already_submitted": True, "record": rec}
    return {**base, "valid": True, "already_submitted": False}


@router.post("/scan/{token}/photo")
async def scan_photo(token: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    slot = await _slot_by_token(tenant_id, token)
    today = datetime.now(IST)
    if slot["date"] != today.date().isoformat():
        raise HTTPException(400, "This QR code is not valid for today.")
    if slot.get("submitted"):
        raise HTTPException(409, "Maintenance for this date is already submitted")
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(400, "Photo too large (max 15 MB)")
    stamp = today.strftime("%d-%b-%Y %H:%M:%S IST")
    try:
        stamped = _stamp_photo(content, stamp)
    except Exception:
        raise HTTPException(400, "Invalid image")
    pid = str(uuid.uuid4())
    path = build_path(tenant_id, "maintenance_photos", f"{pid}.jpg")
    await put_object(path, stamped, "image/jpeg")
    meta = {"id": pid, "filename": f"MAINT_{slot['date']}_{pid[:6]}.jpg", "storage_path": path,
            "captured_at": today.isoformat(), "captured_by": current_user.get("name") or current_user.get("email")}
    await db.maintenance_slots.update_one({"tenant_id": tenant_id, "id": slot["id"]},
                                          {"$push": {"pending_photos": meta}})
    return meta


class SubmitBody(BaseModel):
    status: str  # completed | incomplete
    remarks: Optional[str] = None
    photo_ids: List[str] = []


@router.post("/scan/{token}/submit")
async def scan_submit(token: str, body: SubmitBody, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if body.status not in ("completed", "incomplete"):
        raise HTTPException(400, "status must be completed or incomplete")
    slot = await _slot_by_token(tenant_id, token)
    now = datetime.now(IST)
    if slot["date"] != now.date().isoformat():
        raise HTTPException(400, "This QR code is not valid for today.")
    if slot.get("submitted"):
        raise HTTPException(409, "Maintenance for this date is already submitted and cannot be edited")
    eq = await _get_equipment(tenant_id, slot["equipment_id"])
    photos = [p for p in slot.get("pending_photos") or [] if p["id"] in set(body.photo_ids)]
    rec = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "slot_id": slot["id"],
           "equipment_id": eq["id"], "equipment_name": eq["name"],
           "scheduled_date": slot["date"], "status": body.status,
           "performed_by": current_user.get("name") or current_user.get("email"),
           "performed_by_id": current_user.get("id"),
           "completed_at": now.isoformat(), "photos": photos,
           "remarks": (body.remarks or "").strip() or None, "corrections": [],
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.maintenance_records.insert_one({**rec})
    rec.pop("_id", None)
    await db.maintenance_slots.update_one({"tenant_id": tenant_id, "id": slot["id"]},
                                          {"$set": {"submitted": True}, "$unset": {"pending_photos": ""}})
    if body.status == "completed":
        freq = eq.get("maintenance_frequency_days")
        upd = {"last_maintenance_date": slot["date"]}
        if freq:
            nxt = datetime.strptime(slot["date"], "%Y-%m-%d") + timedelta(days=freq)
            upd["next_maintenance_due"] = nxt.strftime("%Y-%m-%d")
        await db.equipment_master.update_one({"tenant_id": tenant_id, "id": eq["id"]}, {"$set": upd})
    return rec


# ── Corrections (audit trail, original stays immutable) ──────────────────────
class CorrectionBody(BaseModel):
    note: str
    corrected_status: Optional[str] = None  # completed | incomplete


@router.post("/records/{record_id}/correction")
async def add_correction(record_id: str, body: CorrectionBody, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if not body.note.strip():
        raise HTTPException(400, "Correction note is required")
    if body.corrected_status and body.corrected_status not in ("completed", "incomplete"):
        raise HTTPException(400, "corrected_status must be completed or incomplete")
    corr = {"id": str(uuid.uuid4()), "note": body.note.strip(),
            "corrected_status": body.corrected_status,
            "corrected_by": current_user.get("name") or current_user.get("email"),
            "corrected_at": datetime.now(IST).isoformat()}
    res = await db.maintenance_records.update_one({"tenant_id": tenant_id, "id": record_id},
                                                  {"$push": {"corrections": corr}})
    if res.matched_count == 0:
        raise HTTPException(404, "Record not found")
    return corr


@router.get("/records/{record_id}/photos/{photo_id}")
async def record_photo(record_id: str, photo_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    rec = await db.maintenance_records.find_one({"tenant_id": tenant_id, "id": record_id}, {"_id": 0, "photos": 1})
    if not rec:
        raise HTTPException(404, "Record not found")
    meta = next((p for p in rec.get("photos") or [] if p["id"] == photo_id), None)
    if not meta:
        raise HTTPException(404, "Photo not found")
    data, _ct = await get_object(meta["storage_path"])
    return Response(content=data, media_type="image/jpeg",
                    headers={"Content-Disposition": f'inline; filename="{meta["filename"]}"'})
