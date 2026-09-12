"""Maintenance sheets: per-equipment printable QR calendars, date-locked QR scanning,
camera-captured timestamped photos, immutable records with correction audit trail."""
import base64
import io
import logging
import os
import random
import uuid
from datetime import datetime, timedelta, timezone, date
from zoneinfo import ZoneInfo

import qrcode
from PIL import Image, ImageDraw
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user, get_user_or_factory_staff
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


def _scheduled_dates_range(freq_days: int, anchor: Optional[str], start, end) -> list:
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


def _scheduled_dates(freq_days: int, anchor: Optional[str], month: str) -> list:
    start, end = _month_bounds(month)
    return _scheduled_dates_range(freq_days, anchor, start, end)


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


INVALID_QR_MSG = "This QR code is not valid for today's maintenance."
NOT_ASSIGNED_MSG = "Only assigned maintenance staff can record maintenance for this equipment."


def _haversine_m(lat1, lon1, lat2, lon2) -> float:
    import math
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def _geofence_ctx(tenant_id: str, eq: dict):
    """Return {'required': bool, 'radius': int, 'facility': {...}} for this equipment."""
    s = await db.maintenance_settings.find_one({"tenant_id": tenant_id}, {"_id": 0})
    if not (s or {}).get("geofence_enabled"):
        return {"required": False}
    fac = None
    if eq.get("facility_id"):
        fac = await db.facilities.find_one({"tenant_id": tenant_id, "id": eq["facility_id"]},
                                           {"_id": 0, "facility_name": 1, "latitude": 1, "longitude": 1})
    if not fac or fac.get("latitude") is None or fac.get("longitude") is None:
        return {"required": False}
    return {"required": True, "radius": int(s.get("geofence_radius_m") or 200), "facility": fac}


async def _geofence_alert(tenant_id: str, eq: dict, current_user: dict, staff_name, dist, radius, facility_name):
    """Best-effort email/in-app alert to admins when a geofence block happens."""
    try:
        from utils.notify import notify_users
        admins = await db.users.find({"tenant_id": tenant_id}, {"_id": 0, "id": 1, "role": 1}).to_list(500)
        admin_ids = [u["id"] for u in admins if (u.get("role") or "").lower() in ADMIN_ROLES]
        admin_ids += [x["id"] for x in await _supervisors_for(tenant_id, eq)]
        who = staff_name or current_user.get("name") or current_user.get("email")
        await notify_users(
            tenant_id, admin_ids,
            title=f"Geo-fence blocked: {eq['name']}",
            body=(f"{who} tried to record maintenance for '{eq['name']}' from ~{int(dist)} m away "
                  f"(allowed: {radius} m of {facility_name}) at {datetime.now(IST).strftime('%d %b %Y %H:%M IST')}. "
                  f"The submission was blocked."),
            kind="alert", entity_type="equipment", entity_id=eq["id"], send_email_too=True)
    except Exception:
        logging.getLogger(__name__).warning("Geofence alert notification failed", exc_info=True)


def _is_admin(user: dict) -> bool:
    return not user.get("is_factory_staff") and (user.get("role") or "").lower() in ADMIN_ROLES


async def _enforce_geofence(tenant_id: str, eq: dict, current_user: dict, lat, lng, staff_name=None):
    """Admins bypass. Returns geo audit dict (or None). Blocks + emails team when outside radius."""
    ctx = await _geofence_ctx(tenant_id, eq)
    if not ctx["required"]:
        return None
    is_admin = _is_admin(current_user)
    if lat is None or lng is None:
        if is_admin:
            return None
        raise HTTPException(403, "Location access is required — enable GPS/location to record maintenance at this facility.")
    dist = _haversine_m(lat, lng, ctx["facility"]["latitude"], ctx["facility"]["longitude"])
    if dist > ctx["radius"] and not is_admin:
        await _geofence_alert(tenant_id, eq, current_user, staff_name, dist, ctx["radius"], ctx["facility"]["facility_name"])
        raise HTTPException(403, f"You must be within {ctx['radius']} m of {ctx['facility']['facility_name']} to record maintenance (you are ~{int(dist)} m away). The team has been notified.")
    return {"lat": lat, "lng": lng, "distance_m": round(dist, 1)}


async def _supervisors_for(tenant_id: str, eq: dict) -> list:
    """Equipment supervisors, falling back to the supervisors of its area."""
    if eq.get("supervisor_ids"):
        return eq.get("supervisors") or []
    if not eq.get("area_id"):
        return []
    fac = await db.facilities.find_one({"tenant_id": tenant_id, "floors.areas.id": eq["area_id"]}, {"_id": 0, "floors": 1})
    for fl in (fac or {}).get("floors") or []:
        for a in fl.get("areas") or []:
            if a.get("id") == eq["area_id"]:
                return a.get("supervisors") or []
    return []


async def _is_supervisor(tenant_id: str, eq: dict, user: dict) -> bool:
    if user.get("is_factory_staff"):
        return False
    return any(x.get("id") == user.get("id") for x in await _supervisors_for(tenant_id, eq))


def _actor_kind(user: dict, staff) -> str:
    if staff:
        return "factory_staff"
    return "admin" if _is_admin(user) else "supervisor"


async def _resolve_staff(tenant_id: str, eq: dict, current_user: dict, staff_member_id):
    """Identify the factory staff member performing maintenance (Face/PIN verified client-side).
    Admin app users and the equipment's supervisors may act without a staff identity."""
    if current_user.get("is_factory_staff"):
        staff_member_id = current_user["id"]
    is_admin = _is_admin(current_user)
    if not staff_member_id:
        if is_admin or await _is_supervisor(tenant_id, eq, current_user):
            return None
        raise HTTPException(403, "Verify your identity with Face ID or PIN first")
    m = await db.qc_team.find_one({"tenant_id": tenant_id, "id": staff_member_id},
                                  {"_id": 0, "id": 1, "name": 1, "role": 1})
    if not m:
        raise HTTPException(403, "Unknown factory staff member")
    ids = eq.get("maintenance_staff_ids") or []
    if ids and m["id"] not in ids and not is_admin:
        raise HTTPException(403, NOT_ASSIGNED_MSG)
    return m


async def _ensure_photo_assignments(tenant_id: str, equipment_id: str, month: str, n_required):
    """Randomly mark min(N, scheduled) slots in the month as photo-required (never disclosed on the sheet)."""
    if not n_required or n_required <= 0:
        return
    start, end = _month_bounds(month)
    slots = await db.maintenance_slots.find(
        {"tenant_id": tenant_id, "equipment_id": equipment_id,
         "date": {"$gte": start.isoformat(), "$lte": end.isoformat()}},
        {"_id": 0, "id": 1, "date": 1, "photo_required": 1, "submitted": 1}).to_list(400)
    assigned = sum(1 for s in slots if s.get("photo_required"))
    need = min(int(n_required), len(slots)) - assigned
    if need <= 0:
        return
    today = datetime.now(IST).date().isoformat()
    future = [s for s in slots if not s.get("photo_required") and not s.get("submitted") and s["date"] >= today]
    others = [s for s in slots if not s.get("photo_required") and s not in future]
    pool = future if len(future) >= need else future + others
    pick = random.sample(pool, min(need, len(pool)))
    if pick:
        await db.maintenance_slots.update_many(
            {"tenant_id": tenant_id, "id": {"$in": [s["id"] for s in pick]}},
            {"$set": {"photo_required": True}})


async def _get_equipment(tenant_id: str, equipment_id: str) -> dict:
    eq = await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0})
    if not eq:
        raise HTTPException(404, "Equipment not found")
    return eq


# ── Printable sheet (weekly, Monday → Sunday) ────────────────────────────────
@router.get("/equipment/{equipment_id}/sheet")
async def maintenance_sheet(equipment_id: str, origin: str = Query(...),
                            week: Optional[str] = Query(None, description="Any date (YYYY-MM-DD) inside the week"),
                            month: Optional[str] = Query(None),
                            current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    eq = await _get_equipment(tenant_id, equipment_id)
    freq = eq.get("maintenance_frequency_days")
    if not freq:
        raise HTTPException(400, "This equipment has no maintenance frequency set")
    anchor = eq.get("maintenance_start_date") or eq.get("last_maintenance_date")

    if week:
        try:
            ref = datetime.strptime(week[:10], "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(400, "week must be YYYY-MM-DD")
        start = ref - timedelta(days=ref.weekday())  # Monday
        end = start + timedelta(days=6)              # Sunday
    elif month:
        start, end = _month_bounds(month)
    else:
        raise HTTPException(400, "Provide week (YYYY-MM-DD) or month (YYYY-MM)")
    sched = set(_scheduled_dates_range(freq, anchor, start, end))

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
    for m in {start.strftime("%Y-%m"), end.strftime("%Y-%m")}:
        await _ensure_photo_assignments(tenant_id, equipment_id, m, eq.get("photo_inspections_per_month"))

    days = []
    cur = start
    while cur <= end:
        d = cur.isoformat()
        entry = {"date": d, "day": cur.day, "weekday": cur.weekday(), "scheduled": d in sched,
                 "day_label": cur.strftime("%d %b %Y"), "weekday_label": cur.strftime("%A")}
        if d in sched:
            entry["qr"] = _qr_data_uri(f"{origin.rstrip('/')}/maintenance-scan/{slots[d]['token']}")
        days.append(entry)
        cur += timedelta(days=1)

    location = " › ".join(x for x in [eq.get("facility_name"), eq.get("floor_name"), eq.get("area_name")] if x)
    if week:
        label = f"{start.strftime('%d %b')} – {end.strftime('%d %b %Y')}".upper()
    else:
        label = start.strftime("%B %Y").upper()
    return {"equipment": {"id": eq["id"], "name": eq["name"], "type": eq.get("equipment_type_name"),
                          "make": eq.get("make_brand"), "model": eq.get("model_spec"), "location": location},
            "mode": "week" if week else "month",
            "week_start": start.isoformat(), "week_end": end.isoformat(),
            "month": start.strftime("%Y-%m"), "month_label": label,
            "frequency_label": _freq_label(freq), "lead_blanks": 0 if week else start.weekday(), "days": days}


# ── Permanent equipment QR sticker ───────────────────────────────────────────
@router.get("/equipment/{equipment_id}/sticker")
async def equipment_sticker(equipment_id: str, origin: str = Query(...),
                            current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    eq = await _get_equipment(tenant_id, equipment_id)
    qr = _qr_data_uri(f"{origin.rstrip('/')}/equipment-scan/{eq['id']}")
    return {"qr": qr, "id": eq["id"], "code": eq.get("equipment_code") or eq["id"][:8].upper(),
            "name": eq["name"], "type": eq.get("equipment_type_name"),
            "make": eq.get("make_brand"), "model": eq.get("model_spec"),
            "facility": eq.get("facility_name"), "floor": eq.get("floor_name"),
            "area": eq.get("area_name"),
            "frequency_label": _freq_label(eq.get("maintenance_frequency_days"))}


@router.get("/equipment-scan/{equipment_id}")
async def equipment_scan_resolve(equipment_id: str, current_user: dict = Depends(get_user_or_factory_staff)):
    """Permanent sticker QR → resolve today's maintenance slot token (if scheduled)."""
    _ = current_user
    tenant_id = get_current_tenant_id()
    eq = await _get_equipment(tenant_id, equipment_id)
    location = " › ".join(x for x in [eq.get("facility_name"), eq.get("floor_name"), eq.get("area_name")] if x)
    base = {"equipment_id": eq["id"], "equipment_name": eq["name"],
            "equipment_type": eq.get("equipment_type_name"), "location": location,
            "maintenance_instructions": eq.get("maintenance_instructions") or "",
            "replacement_instructions": eq.get("replacement_instructions") or "",
            "instruction_files": [
                {"id": f.get("id"), "filename": f.get("filename"), "content_type": f.get("content_type")}
                for f in (eq.get("attachments") or []) if f.get("category") == "instruction"]}
    if eq.get("per_run_maintenance"):
        base["per_run"] = await _per_run_item(tenant_id, eq, current_user)
    freq = eq.get("maintenance_frequency_days")
    if not freq:
        return {**base, "scheduled_today": False, "message": "No maintenance frequency set for this equipment."}
    anchor = eq.get("maintenance_start_date") or eq.get("last_maintenance_date")
    today = datetime.now(IST).date()
    sched_today = today.isoformat() in _scheduled_dates_range(freq, anchor, today, today)
    nxt = _scheduled_dates_range(freq, anchor, today, today + timedelta(days=120))
    next_due = next((d for d in nxt if d > today.isoformat()), None)
    if not sched_today:
        return {**base, "scheduled_today": False, "next_due": next_due,
                "message": "No maintenance is scheduled for this equipment today."}
    slot = await db.maintenance_slots.find_one(
        {"tenant_id": tenant_id, "equipment_id": eq["id"], "date": today.isoformat()}, {"_id": 0})
    if not slot:
        slot = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "equipment_id": eq["id"],
                "date": today.isoformat(), "token": uuid.uuid4().hex, "submitted": False,
                "created_at": datetime.now(timezone.utc).isoformat()}
        await db.maintenance_slots.insert_one({**slot})
        await _ensure_photo_assignments(tenant_id, eq["id"], today.strftime("%Y-%m"),
                                        eq.get("photo_inspections_per_month"))
    return {**base, "scheduled_today": True, "token": slot["token"], "next_due": next_due}


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
    month = today.strftime("%Y-%m")
    m_start, m_end = _month_bounds(month)
    month_slots = await db.maintenance_slots.find(
        {"tenant_id": tenant_id, "equipment_id": equipment_id,
         "date": {"$gte": m_start.isoformat(), "$lte": m_end.isoformat()}},
        {"_id": 0, "photo_required": 1, "submitted": 1}).to_list(400)
    photo_assigned = sum(1 for s in month_slots if s.get("photo_required"))
    photo_done = sum(1 for s in month_slots if s.get("photo_required") and s.get("submitted"))
    return {"equipment": {"id": eq["id"], "name": eq["name"], "type": eq.get("equipment_type_name")},
            "frequency_days": freq, "frequency_label": _freq_label(freq),
            "maintenance_start_date": eq.get("maintenance_start_date"),
            "last_maintenance_date": eq.get("last_maintenance_date"),
            "next_maintenance_due": eq.get("next_maintenance_due"),
            "upcoming_dates": upcoming, "records": records,
            "photo_inspection": {"per_month": eq.get("photo_inspections_per_month"),
                                 "assigned_this_month": photo_assigned, "done_this_month": photo_done},
            "stats": {"total": len(records), "completed": n_done, "incomplete": len(records) - n_done}}


# ── QR scan flow ─────────────────────────────────────────────────────────────
async def _slot_by_token(tenant_id: str, token: str) -> dict:
    slot = await db.maintenance_slots.find_one({"tenant_id": tenant_id, "token": token}, {"_id": 0})
    if not slot:
        raise HTTPException(404, "Unknown QR code")
    return slot


@router.get("/scan/{token}")
async def scan_status(token: str, current_user: dict = Depends(get_user_or_factory_staff)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    slot = await _slot_by_token(tenant_id, token)
    eq = await _get_equipment(tenant_id, slot["equipment_id"])
    today = datetime.now(IST).date().isoformat()
    base = {"equipment_name": eq["name"], "equipment_id": eq["id"],
            "equipment_type": eq.get("equipment_type_name"), "scheduled_date": slot["date"], "today": today,
            "maintenance_instructions": eq.get("maintenance_instructions") or "",
            "replacement_instructions": eq.get("replacement_instructions") or "",
            "instruction_files": [
                {"id": f.get("id"), "filename": f.get("filename"), "content_type": f.get("content_type")}
                for f in (eq.get("attachments") or []) if f.get("category") == "instruction"]}
    if slot["date"] != today:
        return {**base, "valid": False, "message": INVALID_QR_MSG}
    is_admin = _is_admin(current_user)
    is_sup = not is_admin and await _is_supervisor(tenant_id, eq, current_user)
    geo_ctx = await _geofence_ctx(tenant_id, eq)
    extra = {"assigned_staff_ids": eq.get("maintenance_staff_ids") or [],
             "assigned_staff": [{"id": s.get("id"), "name": s.get("name"), "role": s.get("role")}
                                for s in eq.get("maintenance_staff") or []],
             "supervisors": await _supervisors_for(tenant_id, eq),
             "staff_verification_required": not (is_admin or is_sup), "admin_bypass": is_admin,
             "supervisor_bypass": is_sup, "actor_name": current_user.get("name") or current_user.get("email"),
             "geofence": ({"required": True, "radius": geo_ctx["radius"],
                           "facility_name": geo_ctx["facility"]["facility_name"]}
                          if geo_ctx["required"] else {"required": False})}
    if slot.get("submitted"):
        recs = await db.maintenance_records.find(
            {"tenant_id": tenant_id, "slot_id": slot["id"]}, {"_id": 0}).sort("created_at", 1).to_list(50)
        return {**base, **extra, "valid": True, "already_submitted": True,
                "record": recs[-1] if recs else None, "records": recs, "can_log_another": True}
    return {**base, **extra, "valid": True, "already_submitted": False, "photo_required": bool(slot.get("photo_required"))}


@router.post("/scan/{token}/photo")
async def scan_photo(token: str, file: UploadFile = File(...), staff_member_id: Optional[str] = Form(None),
                     current_user: dict = Depends(get_user_or_factory_staff)):
    tenant_id = get_current_tenant_id()
    slot = await _slot_by_token(tenant_id, token)
    today = datetime.now(IST)
    if slot["date"] != today.date().isoformat():
        raise HTTPException(400, INVALID_QR_MSG)
    eq = await _get_equipment(tenant_id, slot["equipment_id"])
    staff = await _resolve_staff(tenant_id, eq, current_user, staff_member_id or None)
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
            "captured_at": today.isoformat(),
            "captured_by": (staff or {}).get("name") or current_user.get("name") or current_user.get("email")}
    await db.maintenance_slots.update_one({"tenant_id": tenant_id, "id": slot["id"]},
                                          {"$push": {"pending_photos": meta}})
    return meta


class SubmitBody(BaseModel):
    status: str  # completed | incomplete
    remarks: Optional[str] = None
    photo_ids: List[str] = []
    staff_member_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


@router.post("/scan/{token}/submit")
async def scan_submit(token: str, body: SubmitBody, current_user: dict = Depends(get_user_or_factory_staff)):
    tenant_id = get_current_tenant_id()
    if body.status not in ("completed", "incomplete"):
        raise HTTPException(400, "status must be completed or incomplete")
    slot = await _slot_by_token(tenant_id, token)
    now = datetime.now(IST)
    if slot["date"] != now.date().isoformat():
        raise HTTPException(400, INVALID_QR_MSG)
    eq = await _get_equipment(tenant_id, slot["equipment_id"])
    staff = await _resolve_staff(tenant_id, eq, current_user, body.staff_member_id)
    geo = await _enforce_geofence(tenant_id, eq, current_user, body.lat, body.lng,
                                  staff_name=(staff or {}).get("name"))
    prior = await db.maintenance_records.count_documents({"tenant_id": tenant_id, "slot_id": slot["id"]})
    photos = [p for p in slot.get("pending_photos") or [] if p["id"] in set(body.photo_ids)]
    if slot.get("photo_required") and not photos and prior == 0:
        raise HTTPException(400, "Photo inspection required today — capture at least one live photo before submitting.")
    rec = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "slot_id": slot["id"],
           "equipment_id": eq["id"], "equipment_name": eq["name"],
           "scheduled_date": slot["date"], "status": body.status, "attempt": prior + 1,
           "performed_by": (staff or {}).get("name") or current_user.get("name") or current_user.get("email"),
           "performed_by_id": (staff or {}).get("id") or current_user.get("id"),
           "performed_by_role": (staff or {}).get("role"),
           "performed_via": _actor_kind(current_user, staff),
           "verified_by_user": current_user.get("name") or current_user.get("email"),
           "geo": geo,
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


# ── Factory Staff scan sign-in (public: no app login needed on personal phones) ─
STAFF_SESSION_HOURS = 12


class StaffLoginBody(BaseModel):
    token: Optional[str] = None
    equipment_id: Optional[str] = None
    area_id: Optional[str] = None
    pre_production: Optional[str] = None   # tenant id (printed in the checklist QR)
    descriptor: Optional[List[float]] = None
    member_id: Optional[str] = None
    pin: Optional[str] = None


async def _area_ctx(tenant_id: Optional[str], area_id: str):
    """Facility/floor/area names for an area id (tenant optional for public lookups)."""
    q = {"floors.areas.id": area_id}
    if tenant_id:
        q["tenant_id"] = tenant_id
    fac = await db.facilities.find_one(q, {"_id": 0, "id": 1, "tenant_id": 1, "facility_name": 1, "floors": 1,
                                          "latitude": 1, "longitude": 1})
    if not fac:
        raise HTTPException(404, "Unknown area QR")
    for fl in fac.get("floors") or []:
        for a in fl.get("areas") or []:
            if a.get("id") == area_id:
                return {"tenant_id": fac["tenant_id"], "facility_id": fac["id"], "facility_name": fac["facility_name"],
                        "floor_id": fl.get("id"), "floor_name": fl.get("name"), "area_id": area_id, "area_name": a.get("name")}
    raise HTTPException(404, "Unknown area QR")


async def _scan_ref(token: Optional[str], equipment_id: Optional[str], area_id: Optional[str] = None,
                    pre_production: Optional[str] = None) -> dict:
    """Resolve a QR reference (daily slot token, sticker equipment id, area id or pre-production checklist) to an equipment-like dict."""
    if pre_production:
        eqs = await db.equipment_master.find({"tenant_id": pre_production, "per_run_maintenance": True},
                                             {"_id": 0, "maintenance_staff_ids": 1}).to_list(1000)
        if not eqs:
            raise HTTPException(404, "No pre-production equipment configured")
        ids = sorted({sid for e in eqs for sid in (e.get("maintenance_staff_ids") or [])})
        return {"id": f"prerun:{pre_production}", "tenant_id": pre_production, "name": "Pre-Production Checklist",
                "maintenance_staff_ids": ids}
    if area_id:
        ctx = await _area_ctx(None, area_id)
        eqs = await db.equipment_master.find({"tenant_id": ctx["tenant_id"], "area_id": area_id},
                                             {"_id": 0, "maintenance_staff_ids": 1}).to_list(1000)
        ids = sorted({sid for e in eqs for sid in (e.get("maintenance_staff_ids") or [])})
        return {"id": area_id, "tenant_id": ctx["tenant_id"], "name": f"{ctx['area_name']} (area)",
                "maintenance_staff_ids": ids}
    if token:
        slot = await db.maintenance_slots.find_one({"token": token}, {"_id": 0, "tenant_id": 1, "equipment_id": 1})
        if slot:
            equipment_id = slot["equipment_id"]
            eq = await db.equipment_master.find_one({"tenant_id": slot["tenant_id"], "id": equipment_id}, {"_id": 0})
            if eq:
                return eq
    elif equipment_id:
        eq = await db.equipment_master.find_one({"id": equipment_id}, {"_id": 0})
        if eq:
            return eq
    raise HTTPException(404, "Unknown QR code")


def _staff_pool_query(eq: dict) -> dict:
    q = {"tenant_id": eq["tenant_id"]}
    if eq.get("maintenance_staff_ids"):
        q["id"] = {"$in": eq["maintenance_staff_ids"]}
    return q


@router.get("/staff-auth/roster")
async def staff_auth_roster(token: Optional[str] = Query(None), equipment_id: Optional[str] = Query(None),
                            area_id: Optional[str] = Query(None), pre_production: Optional[str] = Query(None)):
    """Names of staff who may sign in for this QR (assigned staff only, when assignments exist)."""
    eq = await _scan_ref(token, equipment_id, area_id, pre_production)
    members = await db.qc_team.find(_staff_pool_query(eq), {"_id": 0, "id": 1, "name": 1, "role": 1,
                                                            "pin_hash": 1, "face_descriptors": 1}).sort("name", 1).to_list(500)
    return {"equipment_name": eq["name"],
            "face_available": any(m.get("face_descriptors") for m in members),
            "members": [{"id": m["id"], "name": m["name"], "role": m.get("role") or "",
                         "has_pin": bool(m.get("pin_hash")), "has_face": bool(m.get("face_descriptors"))} for m in members]}


@router.post("/staff-auth/login")
async def staff_auth_login(body: StaffLoginBody, request: Request):
    """Face (server-side match) or PIN sign-in for Factory Staff → short-lived X-Staff-Token."""
    import bcrypt
    from deps import check_login_lockout, record_login_failure, clear_login_failures, get_client_ip
    from routes.face_auth import _distance, FACE_MATCH_THRESHOLD, SECOND_BEST_MARGIN
    eq = await _scan_ref(body.token, body.equipment_id, body.area_id, body.pre_production)
    ip = get_client_ip(request)
    ident = f"staff:{body.member_id or eq['id']}"
    await check_login_lockout(ident, ip)
    members = await db.qc_team.find(_staff_pool_query(eq), {"_id": 0, "id": 1, "name": 1, "role": 1,
                                                            "pin_hash": 1, "face_descriptors": 1}).to_list(500)
    member = None
    if body.descriptor is not None:
        if len(body.descriptor) != 128:
            raise HTTPException(400, "Invalid face signature")
        best, best_d, second_d = None, float("inf"), float("inf")
        for m in members:
            d = min((_distance(body.descriptor, ref) for ref in m.get("face_descriptors") or [] if len(ref) == 128),
                    default=float("inf"))
            if d < best_d:
                second_d, best_d, best = best_d, d, m
            elif d < second_d:
                second_d = d
        if not best or best_d > FACE_MATCH_THRESHOLD or (second_d - best_d) < SECOND_BEST_MARGIN:
            await record_login_failure(ident, ip)
            raise HTTPException(401, "Face not recognized — try again or use your PIN")
        member = best
    elif body.member_id and body.pin:
        m = next((x for x in members if x["id"] == body.member_id), None)
        if not m or not m.get("pin_hash"):
            raise HTTPException(400, "No PIN set for this member")
        if not bcrypt.checkpw(body.pin.encode(), m["pin_hash"].encode()):
            await record_login_failure(ident, ip)
            raise HTTPException(401, "Incorrect PIN")
        member = m
    else:
        raise HTTPException(400, "Provide a face signature or member_id + pin")
    await clear_login_failures(ident, ip)
    now = datetime.now(timezone.utc)
    sess = {"token": uuid.uuid4().hex + uuid.uuid4().hex, "tenant_id": eq["tenant_id"], "member_id": member["id"],
            "created_at": now.isoformat(), "expires_at": (now + timedelta(hours=STAFF_SESSION_HOURS)).isoformat(),
            "via": "face" if body.descriptor is not None else "pin", "ip": ip}
    await db.factory_staff_sessions.insert_one({**sess})
    return {"staff_token": sess["token"], "expires_at": sess["expires_at"],
            "member": {"id": member["id"], "name": member["name"], "role": member.get("role") or ""}}


@router.post("/staff-auth/logout")
async def staff_auth_logout(request: Request):
    token = (request.headers.get("X-Staff-Token") or "").strip()
    if token:
        await db.factory_staff_sessions.delete_one({"token": token})
    return {"ok": True}


# ── Area QR: stickers, scan listing, bulk completion ─────────────────────────
@router.get("/areas/stickers")
async def area_stickers(origin: str = Query(...), area_id: Optional[str] = Query(None),
                        current_user: dict = Depends(get_current_user)):
    """Printable QR per area (facility › floor › area) with equipment counts."""
    _ = current_user
    tenant_id = get_current_tenant_id()
    counts = {}
    async for row in db.equipment_master.aggregate([
            {"$match": {"tenant_id": tenant_id, "area_id": {"$nin": [None, ""]}}},
            {"$group": {"_id": "$area_id", "n": {"$sum": 1},
                        "sched": {"$sum": {"$cond": [{"$gt": ["$maintenance_frequency_days", 0]}, 1, 0]}}}}]):
        counts[row["_id"]] = row
    out = []
    facs = await db.facilities.find({"tenant_id": tenant_id}, {"_id": 0, "id": 1, "facility_name": 1, "floors": 1}).to_list(200)
    for fac in facs:
        for fl in fac.get("floors") or []:
            for a in fl.get("areas") or []:
                if area_id and a.get("id") != area_id:
                    continue
                c = counts.get(a.get("id"), {})
                out.append({"area_id": a["id"], "area_name": a.get("name"), "floor_name": fl.get("name"),
                            "facility_name": fac["facility_name"], "equipment_count": c.get("n", 0),
                            "scheduled_count": c.get("sched", 0),
                            "qr": _qr_data_uri(f"{origin.rstrip('/')}/area-scan/{a['id']}")})
    return {"areas": out}


async def _today_slot(tenant_id: str, eq: dict, today_iso: str) -> dict:
    slot = await db.maintenance_slots.find_one({"tenant_id": tenant_id, "equipment_id": eq["id"], "date": today_iso}, {"_id": 0})
    if not slot:
        slot = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "equipment_id": eq["id"], "date": today_iso,
                "token": uuid.uuid4().hex, "submitted": False, "created_at": datetime.now(timezone.utc).isoformat()}
        await db.maintenance_slots.insert_one({**slot})
        await _ensure_photo_assignments(tenant_id, eq["id"], today_iso[:7], eq.get("photo_inspections_per_month"))
        slot = await db.maintenance_slots.find_one({"tenant_id": tenant_id, "id": slot["id"]}, {"_id": 0}) or slot
    return slot


def _is_due_today(eq: dict, today) -> bool:
    freq = eq.get("maintenance_frequency_days")
    if not freq:
        return False
    anchor = eq.get("maintenance_start_date") or eq.get("last_maintenance_date")
    return today.isoformat() in _scheduled_dates_range(freq, anchor, today, today)


async def _can_act(tenant_id: str, eq: dict, actor: dict) -> bool:
    if _is_admin(actor):
        return True
    if actor.get("is_factory_staff"):
        ids = eq.get("maintenance_staff_ids") or []
        return not ids or actor["id"] in ids
    return await _is_supervisor(tenant_id, eq, actor)


@router.get("/area-scan/{area_id}")
async def area_scan(area_id: str, current_user: dict = Depends(get_user_or_factory_staff)):
    """Area QR → every equipment in the area with today's maintenance state and tick-ability for this actor."""
    tenant_id = get_current_tenant_id()
    ctx = await _area_ctx(tenant_id, area_id)
    today = datetime.now(IST).date()
    eqs = await db.equipment_master.find({"tenant_id": tenant_id, "area_id": area_id}, {"_id": 0}).sort("name", 1).to_list(1000)
    items = []
    for eq in eqs:
        it = {"id": eq["id"], "name": eq["name"], "type": eq.get("equipment_type_name"),
              "assigned_staff": [{"id": x.get("id"), "name": x.get("name")} for x in eq.get("maintenance_staff") or []],
              "frequency_label": _freq_label(eq.get("maintenance_frequency_days")) if eq.get("maintenance_frequency_days") else None,
              "can_tick": False}
        if not _is_due_today(eq, today):
            nxt = _scheduled_dates_range(eq["maintenance_frequency_days"], eq.get("maintenance_start_date") or eq.get("last_maintenance_date"),
                                         today, today + timedelta(days=120)) if eq.get("maintenance_frequency_days") else []
            it.update({"state": "not_scheduled", "next_due": next((d for d in nxt if d > today.isoformat()), None)})
        else:
            slot = await _today_slot(tenant_id, eq, today.isoformat())
            it["token"] = slot["token"]
            if slot.get("submitted"):
                rec = await db.maintenance_records.find_one({"tenant_id": tenant_id, "slot_id": slot["id"]}, {"_id": 0},
                                                            sort=[("created_at", -1)])
                it.update({"state": "done",
                           "can_undo": bool(rec and rec.get("performed_via") == "area_qr" and rec.get("performed_by_id") == current_user.get("id")),
                           "record": {"status": (rec or {}).get("status"), "performed_by": (rec or {}).get("performed_by"),
                                      "completed_at": (rec or {}).get("completed_at"), "via": (rec or {}).get("performed_via")}})
            elif slot.get("photo_required"):
                it["state"] = "photo_required"
            elif not await _can_act(tenant_id, eq, current_user):
                it["state"] = "not_assigned"
            else:
                it.update({"state": "due", "can_tick": True})
        items.append(it)
    geo = await _geofence_ctx(tenant_id, {"facility_id": ctx["facility_id"]})
    return {**ctx, "today": today.isoformat(), "equipment": items,
            "actor": {"name": current_user.get("name") or current_user.get("email"), "is_admin": _is_admin(current_user),
                      "is_factory_staff": bool(current_user.get("is_factory_staff")),
                      "is_supervisor": not _is_admin(current_user) and not current_user.get("is_factory_staff")},
            "geofence": ({"required": True, "radius": geo["radius"], "facility_name": geo["facility"]["facility_name"]}
                         if geo["required"] else {"required": False}),
            "summary": {"total": len(items), "due": sum(1 for i in items if i["state"] == "due"),
                        "done": sum(1 for i in items if i["state"] == "done"),
                        "photo_required": sum(1 for i in items if i["state"] == "photo_required")}}


class AreaCompleteBody(BaseModel):
    equipment_ids: List[str]
    remarks: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class AreaTickBody(BaseModel):
    equipment_id: str
    lat: Optional[float] = None
    lng: Optional[float] = None


async def _area_tick_one(tenant_id: str, ctx: dict, eq: dict, current_user: dict, geo, remarks=None) -> dict:
    """Save one 'completed' record for `eq` (today) from the area page. Returns {ok} or {skipped reason}."""
    now = datetime.now(IST)
    today = now.date()
    if not _is_due_today(eq, today):
        return {"id": eq["id"], "name": eq["name"], "reason": "Not scheduled today"}
    slot = await _today_slot(tenant_id, eq, today.isoformat())
    if slot.get("submitted"):
        return {"id": eq["id"], "name": eq["name"], "reason": "Already recorded today"}
    if slot.get("photo_required"):
        return {"id": eq["id"], "name": eq["name"], "reason": "Photo inspection required — use the equipment QR", "token": slot["token"]}
    try:
        staff = await _resolve_staff(tenant_id, eq, current_user, None)
    except HTTPException as ex:
        return {"id": eq["id"], "name": eq["name"], "reason": ex.detail}
    rec = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "slot_id": slot["id"],
           "equipment_id": eq["id"], "equipment_name": eq["name"], "scheduled_date": slot["date"],
           "status": "completed", "attempt": 1,
           "performed_by": (staff or {}).get("name") or current_user.get("name") or current_user.get("email"),
           "performed_by_id": (staff or {}).get("id") or current_user.get("id"),
           "performed_by_role": (staff or {}).get("role"),
           "performed_via": "area_qr", "actor_kind": _actor_kind(current_user, staff),
           "area_id": ctx["area_id"], "area_name": ctx["area_name"],
           "verified_by_user": current_user.get("name") or current_user.get("email"),
           "geo": geo, "completed_at": now.isoformat(), "photos": [],
           "remarks": (remarks or "").strip() or None, "corrections": [],
           "prev_dates": {"last_maintenance_date": eq.get("last_maintenance_date"),
                          "next_maintenance_due": eq.get("next_maintenance_due")},
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.maintenance_records.insert_one({**rec})
    await db.maintenance_slots.update_one({"tenant_id": tenant_id, "id": slot["id"]}, {"$set": {"submitted": True}})
    upd = {"last_maintenance_date": slot["date"]}
    if eq.get("maintenance_frequency_days"):
        upd["next_maintenance_due"] = (today + timedelta(days=eq["maintenance_frequency_days"])).isoformat()
    await db.equipment_master.update_one({"tenant_id": tenant_id, "id": eq["id"]}, {"$set": upd})
    rec.pop("_id", None)
    return {"id": eq["id"], "name": eq["name"], "performed_by": rec["performed_by"], "record": rec}


async def _area_geo(tenant_id, ctx, eq, current_user, lat, lng):
    staff_name = current_user.get("name") if current_user.get("is_factory_staff") else None
    return await _enforce_geofence(tenant_id, {**eq, "facility_id": ctx["facility_id"]}, current_user, lat, lng, staff_name=staff_name)


@router.post("/area-scan/{area_id}/tick")
async def area_tick(area_id: str, body: AreaTickBody, current_user: dict = Depends(get_user_or_factory_staff)):
    """Checkbox ticked → save the completed record immediately."""
    tenant_id = get_current_tenant_id()
    ctx = await _area_ctx(tenant_id, area_id)
    eq = await db.equipment_master.find_one({"tenant_id": tenant_id, "area_id": area_id, "id": body.equipment_id}, {"_id": 0})
    if not eq:
        raise HTTPException(404, "Equipment not found in this area")
    geo = await _area_geo(tenant_id, ctx, eq, current_user, body.lat, body.lng)
    res = await _area_tick_one(tenant_id, ctx, eq, current_user, geo)
    if res.get("reason"):
        raise HTTPException(409, res["reason"])
    return res


@router.post("/area-scan/{area_id}/untick")
async def area_untick(area_id: str, body: AreaTickBody, current_user: dict = Depends(get_user_or_factory_staff)):
    """Undo: delete a record you created today from this area page; slot reopens; audit entry kept."""
    tenant_id = get_current_tenant_id()
    ctx = await _area_ctx(tenant_id, area_id)
    today = datetime.now(IST).date().isoformat()
    actor_id = current_user.get("id")
    rec = await db.maintenance_records.find_one(
        {"tenant_id": tenant_id, "equipment_id": body.equipment_id, "scheduled_date": today,
         "performed_via": "area_qr", "performed_by_id": actor_id}, {"_id": 0}, sort=[("created_at", -1)])
    if not rec:
        raise HTTPException(409, "Only records you saved today from this area page can be undone")
    await db.maintenance_records.delete_one({"tenant_id": tenant_id, "id": rec["id"]})
    remaining = await db.maintenance_records.count_documents({"tenant_id": tenant_id, "slot_id": rec["slot_id"]})
    if remaining == 0:
        await db.maintenance_slots.update_one({"tenant_id": tenant_id, "id": rec["slot_id"]}, {"$set": {"submitted": False}})
    prev = rec.get("prev_dates") or {}
    await db.equipment_master.update_one({"tenant_id": tenant_id, "id": body.equipment_id},
                                         {"$set": {"last_maintenance_date": prev.get("last_maintenance_date"),
                                                   "next_maintenance_due": prev.get("next_maintenance_due")}})
    await db.maintenance_audit.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "action": "area_qr_undo",
        "equipment_id": body.equipment_id, "equipment_name": rec.get("equipment_name"),
        "area_id": area_id, "area_name": ctx["area_name"], "scheduled_date": today,
        "record_id": rec["id"], "record_completed_at": rec.get("completed_at"),
        "by_id": actor_id, "by_name": current_user.get("name") or current_user.get("email"),
        "via": "factory_staff" if current_user.get("is_factory_staff") else "admin",
        "at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True, "equipment_id": body.equipment_id}


@router.post("/area-scan/{area_id}/complete")
async def area_complete(area_id: str, body: AreaCompleteBody, current_user: dict = Depends(get_user_or_factory_staff)):
    """Bulk 'Maintenance Complete' for several equipment — one immutable record per equipment."""
    tenant_id = get_current_tenant_id()
    ctx = await _area_ctx(tenant_id, area_id)
    if not body.equipment_ids:
        raise HTTPException(400, "Select at least one equipment")
    eqs = await db.equipment_master.find({"tenant_id": tenant_id, "area_id": area_id, "id": {"$in": body.equipment_ids}},
                                         {"_id": 0}).to_list(1000)
    if not eqs:
        raise HTTPException(400, "None of the selected equipment belongs to this area")
    geo = await _area_geo(tenant_id, ctx, eqs[0], current_user, body.lat, body.lng)
    results = [await _area_tick_one(tenant_id, ctx, eq, current_user, geo, body.remarks) for eq in eqs]
    return {"completed": [{k: r[k] for k in ("id", "name", "performed_by")} for r in results if not r.get("reason")],
            "skipped": [r for r in results if r.get("reason")]}


# ── Pre-production (per production run) maintenance ─────────────────────────
async def _sku_names(tenant_id: str, ids: list) -> list:
    if not ids:
        return []
    rows = await db.master_skus.find({"tenant_id": tenant_id, "id": {"$in": ids}}, {"_id": 0, "id": 1, "sku_name": 1, "name": 1}).to_list(500)
    by = {r["id"]: r.get("sku_name") or r.get("name") for r in rows}
    return [by.get(i, "?") for i in ids]


async def _open_clearance(tenant_id: str, equipment_id: str):
    return await db.maintenance_records.find_one(
        {"tenant_id": tenant_id, "equipment_id": equipment_id, "trigger": "per_run", "status": "completed",
         "consumed_by_batch_id": None}, {"_id": 0}, sort=[("created_at", -1)])


async def _per_run_item(tenant_id: str, eq: dict, actor: dict, sku_id: Optional[str] = None) -> dict:
    rec = await _open_clearance(tenant_id, eq["id"])
    sku_ids = eq.get("per_run_sku_ids") or []
    can = await _can_act(tenant_id, eq, actor)
    return {"id": eq["id"], "name": eq["name"], "type": eq.get("equipment_type_name"),
            "location": " › ".join(x for x in [eq.get("facility_name"), eq.get("floor_name"), eq.get("area_name")] if x),
            "sku_names": await _sku_names(tenant_id, sku_ids), "all_skus": not sku_ids,
            "applies": (not sku_ids) or (sku_id in sku_ids) if sku_id else True,
            "assigned_staff": [{"id": x.get("id"), "name": x.get("name")} for x in eq.get("maintenance_staff") or []],
            "cleared": bool(rec),
            "record": {"id": rec["id"], "performed_by": rec.get("performed_by"), "completed_at": rec.get("completed_at")} if rec else None,
            "can_tick": can and not rec,
            "can_undo": bool(rec and rec.get("performed_by_id") == actor.get("id")),
            "not_assigned": not can}


async def pre_production_status(tenant_id: str, sku_id: Optional[str], actor: dict) -> dict:
    """Checklist for the next production run of `sku_id` (or every per-run equipment when no SKU given)."""
    eqs = await db.equipment_master.find({"tenant_id": tenant_id, "per_run_maintenance": True}, {"_id": 0}).sort("name", 1).to_list(1000)
    items = [await _per_run_item(tenant_id, eq, actor, sku_id) for eq in eqs]
    if sku_id:
        items = [i for i in items if i["applies"]]
    pending = [i for i in items if not i["cleared"]]
    return {"items": items, "pending": pending, "all_clear": not pending, "sku_id": sku_id}


@router.get("/pre-production")
async def pre_production_get(sku_id: Optional[str] = Query(None), current_user: dict = Depends(get_user_or_factory_staff)):
    tenant_id = get_current_tenant_id()
    data = await pre_production_status(tenant_id, sku_id, current_user)
    geo_required = await db.maintenance_settings.find_one({"tenant_id": tenant_id}, {"_id": 0, "geofence_enabled": 1}) or {}
    return {**data, "actor": {"name": current_user.get("name") or current_user.get("email"), "is_admin": _is_admin(current_user),
                              "is_factory_staff": bool(current_user.get("is_factory_staff"))},
            "geofence_enabled": bool(geo_required.get("geofence_enabled"))}


@router.get("/pre-production/sticker")
async def pre_production_sticker(origin: str = Query(...), current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    n = await db.equipment_master.count_documents({"tenant_id": tenant_id, "per_run_maintenance": True})
    return {"equipment_count": n, "qr": _qr_data_uri(f"{origin.rstrip('/')}/pre-production-scan/{tenant_id}")}


class GeoBody(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None


@router.post("/pre-production/{equipment_id}/clear")
async def pre_production_clear(equipment_id: str, body: GeoBody = GeoBody(), current_user: dict = Depends(get_user_or_factory_staff)):
    """Record a per-run clearance (valid until the next production batch of an applicable SKU consumes it)."""
    tenant_id = get_current_tenant_id()
    eq = await _get_equipment(tenant_id, equipment_id)
    if not eq.get("per_run_maintenance"):
        raise HTTPException(400, "This equipment is not marked 'before every production run'")
    if await _open_clearance(tenant_id, equipment_id):
        raise HTTPException(409, "Already cleared for the next production run")
    staff_name = current_user.get("name") if current_user.get("is_factory_staff") else None
    geo = await _enforce_geofence(tenant_id, eq, current_user, body.lat, body.lng, staff_name=staff_name)
    staff = await _resolve_staff(tenant_id, eq, current_user, None)
    now = datetime.now(IST)
    rec = {"id": str(uuid.uuid4()), "tenant_id": tenant_id, "slot_id": None, "trigger": "per_run",
           "equipment_id": eq["id"], "equipment_name": eq["name"], "scheduled_date": now.date().isoformat(),
           "status": "completed", "attempt": 1,
           "performed_by": (staff or {}).get("name") or current_user.get("name") or current_user.get("email"),
           "performed_by_id": (staff or {}).get("id") or current_user.get("id"),
           "performed_by_role": (staff or {}).get("role"),
           "performed_via": "pre_production", "actor_kind": _actor_kind(current_user, staff),
           "verified_by_user": current_user.get("name") or current_user.get("email"),
           "geo": geo, "completed_at": now.isoformat(), "photos": [], "remarks": None, "corrections": [],
           "consumed_by_batch_id": None, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.maintenance_records.insert_one({**rec})
    await db.equipment_master.update_one({"tenant_id": tenant_id, "id": eq["id"]}, {"$set": {"last_maintenance_date": now.date().isoformat()}})
    rec.pop("_id", None)
    return {"ok": True, "record": rec}


@router.post("/pre-production/{equipment_id}/undo")
async def pre_production_undo(equipment_id: str, current_user: dict = Depends(get_user_or_factory_staff)):
    """Undo your own clearance while no batch has consumed it."""
    tenant_id = get_current_tenant_id()
    rec = await _open_clearance(tenant_id, equipment_id)
    if not rec or rec.get("performed_by_id") != current_user.get("id"):
        raise HTTPException(409, "Only your own un-consumed clearance can be undone")
    await db.maintenance_records.delete_one({"tenant_id": tenant_id, "id": rec["id"]})
    await db.maintenance_audit.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "action": "pre_production_undo",
        "equipment_id": equipment_id, "equipment_name": rec.get("equipment_name"), "record_id": rec["id"],
        "record_completed_at": rec.get("completed_at"), "by_id": current_user.get("id"),
        "by_name": current_user.get("name") or current_user.get("email"),
        "via": "factory_staff" if current_user.get("is_factory_staff") else "admin",
        "at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True}


async def consume_pre_production(tenant_id: str, sku_id: str, batch: dict) -> list:
    """Link every open clearance applicable to this SKU to the new batch; returns the snapshot stored on the batch."""
    eqs = await db.equipment_master.find({"tenant_id": tenant_id, "per_run_maintenance": True}, {"_id": 0, "id": 1, "name": 1, "per_run_sku_ids": 1}).to_list(1000)
    snap = []
    for eq in eqs:
        ids = eq.get("per_run_sku_ids") or []
        if ids and sku_id not in ids:
            continue
        rec = await _open_clearance(tenant_id, eq["id"])
        if not rec:
            continue
        await db.maintenance_records.update_one({"tenant_id": tenant_id, "id": rec["id"]},
                                                {"$set": {"consumed_by_batch_id": batch["id"], "consumed_by_batch_code": batch.get("batch_code"),
                                                          "consumed_at": datetime.now(timezone.utc).isoformat()}})
        snap.append({"equipment_id": eq["id"], "equipment_name": eq["name"], "record_id": rec["id"],
                     "performed_by": rec.get("performed_by"), "completed_at": rec.get("completed_at")})
    return snap


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
async def record_photo(record_id: str, photo_id: str, current_user: dict = Depends(get_user_or_factory_staff)):
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


# ── Missed-day alerts ────────────────────────────────────────────────────────
ADMIN_ROLES = {"ceo", "admin", "system admin", "system_admin", "director", "tenant_admin"}


async def check_missed_maintenance() -> dict:
    """One summary alert + email per tenant covering every slot that passed with no QR check-in."""
    from utils.notify import notify_users
    from utils.email_sender import send_email
    today = datetime.now(IST).date().isoformat()
    missed = await db.maintenance_slots.find(
        {"date": {"$lt": today}, "submitted": {"$ne": True}, "missed_notified": {"$ne": True}},
        {"_id": 0}).sort("date", 1).to_list(2000)
    if not missed:
        return {"missed_slots": 0, "alerts_sent": 0}

    by_tenant = {}
    for s in missed:
        by_tenant.setdefault(s["tenant_id"], {}).setdefault(s["equipment_id"], []).append(s)

    alerts = 0
    for tenant_id, by_eq in by_tenant.items():
        items = []
        for equipment_id, slots in by_eq.items():
            # transfer photo-inspection duty from missed days to a random future slot in the same month
            for s in slots:
                if not s.get("photo_required"):
                    continue
                m_end = _month_bounds(s["date"][:7])[1]
                cand = await db.maintenance_slots.find(
                    {"tenant_id": tenant_id, "equipment_id": equipment_id, "submitted": {"$ne": True},
                     "photo_required": {"$ne": True}, "date": {"$gte": today, "$lte": m_end.isoformat()}},
                    {"_id": 0, "id": 1}).to_list(200)
                if cand:
                    promoted = random.choice(cand)
                    await db.maintenance_slots.update_one({"tenant_id": tenant_id, "id": promoted["id"]},
                                                          {"$set": {"photo_required": True}})
            eq = await db.equipment_master.find_one({"tenant_id": tenant_id, "id": equipment_id}, {"_id": 0})
            dates = sorted(s["date"] for s in slots)
            items.append({
                "supervisor_ids": [x["id"] for x in await _supervisors_for(tenant_id, eq)] if eq else [],
                "photo_missed": any(s.get("photo_required") for s in slots),
                "name": (eq or {}).get("name") or "Deleted equipment",
                "loc": " › ".join(x for x in [(eq or {}).get("facility_name"), (eq or {}).get("floor_name"),
                                              (eq or {}).get("area_name")] if x),
                "dates": dates,
                "shown": ", ".join(dates[:6]) + (f" (+{len(dates) - 6} more)" if len(dates) > 6 else ""),
            })
        items.sort(key=lambda i: (i["loc"], i["name"]))

        admins = await db.users.find({"tenant_id": tenant_id}, {"_id": 0, "id": 1, "role": 1, "email": 1}).to_list(500)
        admin_users = [u for u in admins if (u.get("role") or "").lower() in ADMIN_ROLES]
        n_slots = sum(len(i["dates"]) for i in items)
        subject = f"⚠ Missed maintenance: {len(items)} equipment, {n_slots} missed day(s)"
        try:
            await notify_users(
                tenant_id, [u["id"] for u in admin_users],
                title=subject,
                body="; ".join(f"{i['name']} ({i['shown']})" for i in items[:8])
                     + (f"; +{len(items) - 8} more" if len(items) > 8 else "")
                     + ". Open Equipment Master to review.",
                link="/equipment-master", kind="alert", category="approval",
                entity_type="equipment", send_email_too=False)
        except Exception:
            pass
        html = _missed_summary_html(items, today)
        for u in admin_users:
            if u.get("email"):
                try:
                    await send_email(to=u["email"], subject=subject, html=html, text=subject)
                except Exception:
                    logging.getLogger("maintenance_missed").exception("missed summary email failed for %s", u.get("email"))
        alerts += 1
        # Supervisors get a summary limited to their own equipment/areas (admins already got everything).
        admin_id_set = {u["id"] for u in admin_users}
        sup_ids = sorted({sid for i in items for sid in i["supervisor_ids"]} - admin_id_set)
        for sid in sup_ids:
            mine = [i for i in items if sid in i["supervisor_ids"]]
            sup = await db.users.find_one({"tenant_id": tenant_id, "id": sid}, {"_id": 0, "id": 1, "email": 1})
            if not sup:
                continue
            sub = f"⚠ Missed maintenance (your equipment): {len(mine)} equipment, {sum(len(i['dates']) for i in mine)} missed day(s)"
            try:
                await notify_users(tenant_id, [sid], title=sub,
                                   body="; ".join(f"{i['name']} ({i['shown']})" for i in mine[:8]) + ". Open Equipment Master to review.",
                                   link="/equipment-master", kind="alert", category="approval", entity_type="equipment", send_email_too=False)
                if sup.get("email"):
                    await send_email(to=sup["email"], subject=sub, html=_missed_summary_html(mine, today), text=sub)
            except Exception:
                logging.getLogger("maintenance_missed").exception("supervisor summary failed for %s", sid)
        await db.maintenance_slots.update_many(
            {"tenant_id": tenant_id, "id": {"$in": [s["id"] for slots in by_eq.values() for s in slots]}},
            {"$set": {"missed_notified": True, "missed_notified_at": datetime.now(timezone.utc).isoformat()}})
    return {"missed_slots": len(missed), "equipment": sum(len(v) for v in by_tenant.values()), "alerts_sent": alerts}


def _missed_summary_html(items: list, today: str) -> str:
    cell = "padding:6px 10px;font-size:12px;border-bottom:1px solid #e2e8f0;vertical-align:top"
    photo_tag = " <span style='color:#b91c1c;font-weight:normal'>📷 photo inspection missed</span>"
    rows = "".join(
        f"<tr><td style='{cell};font-weight:bold'>{i['name']}{photo_tag if i.get('photo_missed') else ''}</td>"
        f"<td style='{cell};color:#475569'>{i['loc'] or '—'}</td>"
        f"<td style='{cell};color:#b91c1c'>{i['shown']}</td>"
        f"<td style='{cell};text-align:center'>{len(i['dates'])}</td></tr>" for i in items)
    return f"""
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;max-width:720px">
  <h2 style="margin:0 0 4px;font-size:18px">Missed Maintenance Summary — {today}</h2>
  <p style="margin:0 0 12px;color:#334155;font-size:14px">{len(items)} equipment had scheduled maintenance with no QR check-in.</p>
  <table style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0">
    <tr>
      <th style='text-align:left;padding:6px 10px;font-size:11px;color:#64748b'>EQUIPMENT</th>
      <th style='text-align:left;padding:6px 10px;font-size:11px;color:#64748b'>LOCATION</th>
      <th style='text-align:left;padding:6px 10px;font-size:11px;color:#64748b'>MISSED DATE(S)</th>
      <th style='text-align:center;padding:6px 10px;font-size:11px;color:#64748b'>DAYS</th>
    </tr>
    {rows}
  </table>
  <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Open each equipment's Maintenance profile in Equipment Master to review or log a catch-up record. One summary is sent per check — not one email per equipment.</p>
</div>"""


@router.post("/missed-check")
async def run_missed_check(current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").lower() not in ADMIN_ROLES:
        raise HTTPException(403, "Admin access required")
    return await check_missed_maintenance()


async def missed_maintenance_scheduler():
    """Runs shortly after startup, then every 6 hours (flag makes alerts once-only)."""
    import asyncio
    import logging
    log = logging.getLogger("maintenance_missed")
    await asyncio.sleep(30)
    while True:
        try:
            res = await check_missed_maintenance()
            if res["missed_slots"]:
                log.info(f"Missed-maintenance check: {res}")
        except Exception:
            log.exception("Missed-maintenance check failed")
        await asyncio.sleep(6 * 3600)


# ── Compliance scores (month or Mon–Sun week) ────────────────────────────────
@router.get("/compliance")
async def maintenance_compliance(month: Optional[str] = Query(None), start: Optional[str] = Query(None),
                                 end: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    if start and end:
        try:
            s = datetime.strptime(start, "%Y-%m-%d").date()
            e = datetime.strptime(end, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(400, "start/end must be YYYY-MM-DD")
        if e < s:
            raise HTTPException(400, "end must be on or after start")
        label = f"{s.strftime('%d %b')} – {e.strftime('%d %b %Y')}"
    elif month:
        s, e = _month_bounds(month)
        label = s.strftime("%B %Y")
    else:
        raise HTTPException(400, "Provide month (YYYY-MM) or start & end (YYYY-MM-DD)")
    period = {"start": s.isoformat(), "end": e.isoformat(), "label": label}
    today = datetime.now(IST).date().isoformat()
    cutoff = min(e.isoformat(), today)

    slots = await db.maintenance_slots.find(
        {"tenant_id": tenant_id, "date": {"$gte": s.isoformat(), "$lte": cutoff}},
        {"_id": 0, "id": 1, "equipment_id": 1, "date": 1, "submitted": 1, "photo_required": 1}).to_list(5000)
    if not slots:
        return {"month": label, "period": period, "overall": None, "equipment": [], "areas": []}

    rec_by_slot = {}
    async for r in db.maintenance_records.find(
            {"tenant_id": tenant_id, "scheduled_date": {"$gte": s.isoformat(), "$lte": cutoff}},
            {"_id": 0, "slot_id": 1, "status": 1, "corrections": 1}):
        status = r["status"]
        for c in r.get("corrections") or []:
            if c.get("corrected_status"):
                status = c["corrected_status"]
        rec_by_slot[r["slot_id"]] = status

    eq_ids = list({s["equipment_id"] for s in slots})
    eq_map = {e["id"]: e for e in await db.equipment_master.find(
        {"tenant_id": tenant_id, "id": {"$in": eq_ids}},
        {"_id": 0, "id": 1, "name": 1, "equipment_type_name": 1,
         "facility_name": 1, "floor_name": 1, "area_name": 1}).to_list(2000)}

    per_eq, per_area = {}, {}
    for s in slots:
        eq = eq_map.get(s["equipment_id"])
        if not eq:
            continue
        st = rec_by_slot.get(s["id"])
        bucket = per_eq.setdefault(s["equipment_id"], {"due": 0, "completed": 0, "incomplete": 0, "missed": 0})
        bucket["due"] += 1
        if st == "completed":
            bucket["completed"] += 1
        elif st == "incomplete":
            bucket["incomplete"] += 1
        else:
            bucket["missed"] += 1
        area_key = " › ".join(x for x in [eq.get("facility_name"), eq.get("floor_name"), eq.get("area_name")] if x) or "No location set"
        ab = per_area.setdefault(area_key, {"due": 0, "completed": 0, "equipment_ids": set()})
        ab["due"] += 1
        ab["equipment_ids"].add(eq["id"])
        if st == "completed":
            ab["completed"] += 1

    equipment_rows = []
    for eq_id, b in per_eq.items():
        eq = eq_map[eq_id]
        score = round(b["completed"] / b["due"] * 100) if b["due"] else None
        equipment_rows.append({"equipment_id": eq_id, "name": eq["name"], "type": eq.get("equipment_type_name"),
                               "location": " › ".join(x for x in [eq.get("facility_name"), eq.get("floor_name"), eq.get("area_name")] if x) or None,
                               **b, "score": score})
    equipment_rows.sort(key=lambda x: (x["score"] if x["score"] is not None else 999, x["name"]))

    area_rows = [{"area": k, "due": v["due"], "completed": v["completed"],
                  "equipment_count": len(v["equipment_ids"]),
                  "score": round(v["completed"] / v["due"] * 100) if v["due"] else None}
                 for k, v in per_area.items()]
    area_rows.sort(key=lambda x: (x["score"] if x["score"] is not None else 999, x["area"]))

    total_due = sum(b["due"] for b in per_eq.values())
    total_done = sum(b["completed"] for b in per_eq.values())
    overall = {"due": total_due, "completed": total_done,
               "score": round(total_done / total_due * 100) if total_due else None}
    return {"month": label, "period": period, "as_of": cutoff, "overall": overall, "equipment": equipment_rows, "areas": area_rows}


# ── Daily maintenance status (view + 9 PM digest email) ──────────────────────
async def _daily_status(tenant_id: str, date_str: str) -> dict:
    """All equipment scheduled on date_str, grouped Facility › Floor › Area."""
    d = date.fromisoformat(date_str)
    today = datetime.now(IST).date().isoformat()
    eqs = await db.equipment_master.find(
        {"tenant_id": tenant_id, "maintenance_frequency_days": {"$gt": 0}},
        {"_id": 0, "id": 1, "name": 1, "equipment_type_name": 1,
         "maintenance_frequency_days": 1, "maintenance_start_date": 1, "last_maintenance_date": 1,
         "facility_name": 1, "floor_name": 1, "area_name": 1}).to_list(3000)
    recs = {}
    async for r in db.maintenance_records.find(
            {"tenant_id": tenant_id, "scheduled_date": date_str},
            {"_id": 0, "equipment_id": 1, "status": 1, "performed_by": 1,
             "completed_at": 1, "corrections": 1, "remarks": 1}):
        st = r["status"]
        for c in r.get("corrections") or []:
            if c.get("corrected_status"):
                st = c["corrected_status"]
        recs[r["equipment_id"]] = {**r, "status": st}

    facilities, totals = {}, {"scheduled": 0, "completed": 0, "incomplete": 0, "missed": 0, "pending": 0}
    for eq in eqs:
        anchor = eq.get("maintenance_start_date") or eq.get("last_maintenance_date")
        if date_str not in _scheduled_dates_range(eq["maintenance_frequency_days"], anchor, d, d):
            continue
        r = recs.get(eq["id"])
        if r:
            status = r["status"]
            done_time = (r.get("completed_at") or "")[11:16]
        elif date_str < today:
            status, done_time = "missed", None
        elif date_str == today:
            status, done_time = "pending", None
        else:
            status, done_time = "upcoming", None
        totals["scheduled"] += 1
        totals[status if status in totals else "pending"] = totals.get(status, 0) + 1
        fac = eq.get("facility_name") or "No facility assigned"
        flo = eq.get("floor_name") or "No floor"
        area = eq.get("area_name") or "No area"
        node = (facilities.setdefault(fac, {"name": fac, "floors": {}})["floors"]
                .setdefault(flo, {"name": flo, "areas": {}})["areas"]
                .setdefault(area, {"name": area, "equipment": [], "completed": 0, "missed": 0}))
        node["equipment"].append({
            "equipment_id": eq["id"], "name": eq["name"], "type": eq.get("equipment_type_name"),
            "status": status, "performed_by": (r or {}).get("performed_by"),
            "time": done_time, "remarks": (r or {}).get("remarks")})
        if status == "completed":
            node["completed"] += 1
        elif status in ("missed", "incomplete"):
            node["missed"] += 1

    out_facilities = []
    for fac in facilities.values():
        floors = []
        for fl in fac["floors"].values():
            areas = list(fl["areas"].values())
            for a in areas:
                a["equipment"].sort(key=lambda x: x["name"])
            areas.sort(key=lambda a: (-a["missed"], a["name"]))
            floors.append({"name": fl["name"], "areas": areas,
                           "missed": sum(a["missed"] for a in areas)})
        floors.sort(key=lambda f: (-f["missed"], f["name"]))
        out_facilities.append({"name": fac["name"], "floors": floors,
                               "missed": sum(f["missed"] for f in floors)})
    out_facilities.sort(key=lambda f: (-f["missed"], f["name"]))
    return {"date": date_str, "totals": totals, "facilities": out_facilities}


@router.get("/daily-status")
async def daily_status(date_q: str = Query(..., alias="date"), current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").lower() not in ADMIN_ROLES:
        raise HTTPException(403, "Not authorized to view maintenance status")
    try:
        date.fromisoformat(date_q)
    except ValueError:
        raise HTTPException(400, "date must be YYYY-MM-DD")
    return await _daily_status(get_current_tenant_id(), date_q)


def _digest_html(status: dict) -> str:
    t = status["totals"]
    chip = ("<span style='display:inline-block;padding:2px 10px;border-radius:10px;font-size:12px;"
            "font-weight:bold;margin-right:6px;{s}'>{v}</span>")
    rows = []
    for fac in status["facilities"]:
        rows.append(f"<tr><td colspan='4' style='background:#1e2b3c;color:#fff;padding:7px 10px;"
                    f"font-size:13px;font-weight:bold'>{fac['name']}</td></tr>")
        for fl in fac["floors"]:
            for ar in fl["areas"]:
                warn = " ⚠" if ar["missed"] else ""
                rows.append(f"<tr><td colspan='4' style='background:#eef2f7;padding:6px 10px;font-size:12px;"
                            f"font-weight:bold;color:#334155'>{fl['name']} › {ar['name']}"
                            f" — {ar['completed']}/{len(ar['equipment'])} done{warn}</td></tr>")
                for e in ar["equipment"]:
                    if e["status"] == "completed":
                        st = "<span style='color:#047857;font-weight:bold'>✔ Completed</span>"
                        who = f"{e['performed_by'] or ''} · {e['time'] or ''}"
                    elif e["status"] == "incomplete":
                        st = "<span style='color:#b45309;font-weight:bold'>◐ Incomplete</span>"
                        who = f"{e['performed_by'] or ''} · {e['time'] or ''}"
                    elif e["status"] == "missed":
                        st = "<span style='color:#b91c1c;font-weight:bold'>✘ MISSED</span>"
                        who = "—"
                    else:
                        st = "<span style='color:#64748b'>Pending</span>"
                        who = "—"
                    rows.append(f"<tr><td style='padding:5px 10px;font-size:12px;border-bottom:1px solid #e2e8f0'>{e['name']}</td>"
                                f"<td style='padding:5px 10px;font-size:12px;border-bottom:1px solid #e2e8f0'>{e['type'] or ''}</td>"
                                f"<td style='padding:5px 10px;font-size:12px;border-bottom:1px solid #e2e8f0'>{st}</td>"
                                f"<td style='padding:5px 10px;font-size:12px;border-bottom:1px solid #e2e8f0'>{who}</td></tr>")
    return f"""
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;max-width:720px">
  <h2 style="margin:0 0 4px;font-size:18px">Daily Maintenance Report — {status['date']}</h2>
  <p style="margin:0 0 12px">
    {chip.format(s='background:#dcfce7;color:#047857', v=str(t.get('completed', 0)) + ' completed')}
    {chip.format(s='background:#fef3c7;color:#b45309', v=str(t.get('incomplete', 0)) + ' incomplete')}
    {chip.format(s='background:#fee2e2;color:#b91c1c', v=str(t.get('missed', 0)) + ' missed')}
    {chip.format(s='background:#e2e8f0;color:#334155', v=str(t.get('pending', 0)) + ' pending')}
  </p>
  <table style="border-collapse:collapse;width:100%;border:1px solid #e2e8f0">
    <tr>
      <th style='text-align:left;padding:6px 10px;font-size:11px;color:#64748b'>EQUIPMENT</th>
      <th style='text-align:left;padding:6px 10px;font-size:11px;color:#64748b'>TYPE</th>
      <th style='text-align:left;padding:6px 10px;font-size:11px;color:#64748b'>STATUS</th>
      <th style='text-align:left;padding:6px 10px;font-size:11px;color:#64748b'>DONE BY · TIME</th>
    </tr>
    {''.join(rows)}
  </table>
  <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Areas with ⚠ have missed or incomplete maintenance and need attention. Automated daily report — sent at 9 PM IST.</p>
</div>"""


async def send_daily_digest(tenant_id: str, date_str: str, force: bool = False) -> dict:
    from utils.email_sender import send_email
    from utils.notify import notify_users
    if not force:
        already = await db.maintenance_daily_digest.find_one({"tenant_id": tenant_id, "date": date_str})
        if already:
            return {"sent": False, "reason": "already sent"}
    status = await _daily_status(tenant_id, date_str)
    if not status["totals"]["scheduled"]:
        return {"sent": False, "reason": "nothing scheduled"}
    admins = await db.users.find({"tenant_id": tenant_id}, {"_id": 0, "id": 1, "role": 1, "email": 1}).to_list(500)
    admin_users = [u for u in admins if (u.get("role") or "").lower() in ADMIN_ROLES]
    t = status["totals"]
    subject = (f"Daily Maintenance Report {date_str} — {t.get('completed', 0)} done, "
               f"{t.get('missed', 0)} missed, {t.get('incomplete', 0)} incomplete")
    html = _digest_html(status)
    emails_sent = 0
    for u in admin_users:
        if u.get("email"):
            try:
                await send_email(to=u["email"], subject=subject, html=html, text=subject)
                emails_sent += 1
            except Exception:
                logging.getLogger("maintenance_digest").exception("digest email failed for %s", u.get("email"))
    try:
        await notify_users(tenant_id, [u["id"] for u in admin_users],
                           title=subject,
                           body="Open the Daily Maintenance Status view for the full area-wise breakdown.",
                           link="/maintenance-status", kind="alert", category="approval",
                           send_email_too=False)
    except Exception:
        pass
    await db.maintenance_daily_digest.update_one(
        {"tenant_id": tenant_id, "date": date_str},
        {"$set": {"sent_at": datetime.now(timezone.utc).isoformat(), "emails": emails_sent}}, upsert=True)
    return {"sent": True, "emails": emails_sent, "totals": t}


@router.post("/daily-digest/send")
async def trigger_daily_digest(date_q: Optional[str] = Query(None, alias="date"),
                               current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").lower() not in ADMIN_ROLES:
        raise HTTPException(403, "Admin access required")
    d = date_q or datetime.now(IST).date().isoformat()
    return await send_daily_digest(get_current_tenant_id(), d, force=True)


async def daily_digest_scheduler():
    """Sends one consolidated maintenance email per tenant per day at 9 PM IST."""
    import asyncio
    log = logging.getLogger("maintenance_digest")
    while True:
        now = datetime.now(IST)
        target = now.replace(hour=21, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        await asyncio.sleep((target - now).total_seconds())
        try:
            today = datetime.now(IST).date().isoformat()
            tenant_ids = await db.equipment_master.distinct(
                "tenant_id", {"maintenance_frequency_days": {"$gt": 0}})
            for tid in tenant_ids:
                try:
                    res = await send_daily_digest(tid, today)
                    log.info("daily digest %s %s: %s", tid, today, res)
                except Exception:
                    log.exception("daily digest failed for tenant %s", tid)
        except Exception:
            log.exception("daily digest scheduler iteration failed")
