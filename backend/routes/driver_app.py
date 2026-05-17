"""
Driver mobile-web app endpoints.

The Driver user logs in with their phone number and the system-generated
password set when their fleet record was created. Once logged in they can:
  • See today's APPROVED delivery schedules assigned to them.
  • Start a schedule (begins GPS pings) and end it (auto or manual).
  • Push GPS coordinates at the cadence configured under
    tenants.settings.gps_ping_interval_minutes.
  • Mark each individual stop as delivered (which also flips the underlying
    `distributor_deliveries.status` from 'scheduled' → 'delivered').

Distributor & admin live-tracking is served by a sibling endpoint that returns
all GPS pings + the latest position for a given schedule, so existing
DeliveryScheduleDetail pages can plot the driver on a Google Map.
"""
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta, date as _date
import logging
import re
import uuid

from database import db, get_tenant_db
from deps import get_current_user, verify_password, create_session
from core.tenant import get_current_tenant_id

router = APIRouter()
logger = logging.getLogger(__name__)

PHONE_DIGITS = re.compile(r"\D+")


def _normalise_phone(phone: str) -> str:
    digits = PHONE_DIGITS.sub("", phone or "")
    return digits[-10:] if len(digits) >= 10 else digits


# ============ AUTH ============================================================

class DriverLogin(BaseModel):
    phone: str = Field(..., min_length=1, max_length=20)
    password: str = Field(..., min_length=1)


@router.post("/login")
async def driver_login(payload: DriverLogin, response: Response):
    """Phone + password login for Driver-role users."""
    tdb = get_tenant_db()
    phone = _normalise_phone(payload.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    user_doc = await tdb.users.find_one({"role": "Driver", "phone": phone}, {"_id": 0})
    if not user_doc or not user_doc.get("password"):
        raise HTTPException(status_code=401, detail="Invalid mobile number or password")
    if not verify_password(payload.password, user_doc["password"]):
        raise HTTPException(status_code=401, detail="Invalid mobile number or password")
    if not user_doc.get("is_active", True):
        raise HTTPException(status_code=401, detail="Driver account is inactive")

    session_token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_doc["id"],
        "tenant_id": get_current_tenant_id(),
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "auth_method": "driver_phone",
    })
    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none",
        max_age=7 * 24 * 60 * 60, path="/",
    )
    user_doc.pop("password", None)
    return {"user": user_doc, "session_token": session_token}


def _ensure_driver(user: dict) -> str:
    """Make sure the caller is a Driver-role user. Returns the linked driver_id."""
    if user.get("role") != "Driver":
        raise HTTPException(status_code=403, detail="Driver access only")
    driver_id = user.get("driver_id")
    if not driver_id:
        raise HTTPException(status_code=403, detail="Driver account is not linked to a fleet record")
    return driver_id


# ============ SCHEDULES (driver view) ========================================

@router.get("/schedules")
async def list_driver_schedules(
    on_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Approved schedules assigned to the current driver. Defaults to today + tomorrow."""
    driver_id = _ensure_driver(current_user)
    tenant_id = get_current_tenant_id()

    q: dict = {
        "tenant_id": tenant_id,
        "driver_id": driver_id,
        "status": {"$in": ["approved", "in_progress", "completed"]},
    }
    if on_date:
        q["schedule_date"] = on_date
    else:
        today = datetime.now(timezone.utc).date()
        q["schedule_date"] = {"$gte": today.isoformat(), "$lte": (today + timedelta(days=1)).isoformat()}

    schedules = await db.distributor_delivery_schedules.find(q, {"_id": 0}).sort([
        ("schedule_date", 1), ("created_at", 1)
    ]).to_list(200)

    # Lightweight enrichment: distributor name, vehicle reg, delivery counts.
    distributor_ids = list({s.get("distributor_id") for s in schedules if s.get("distributor_id")})
    distributors_by_id = {}
    if distributor_ids:
        async for d in db.distributors.find(
            {"id": {"$in": distributor_ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "distributor_name": 1, "city": 1}
        ):
            distributors_by_id[d["id"]] = d

    vehicle_ids = list({s.get("vehicle_id") for s in schedules if s.get("vehicle_id")})
    vehicles_by_id = {}
    if vehicle_ids:
        async for v in db.vehicles.find(
            {"id": {"$in": vehicle_ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "registration_number": 1, "vehicle_name": 1}
        ):
            vehicles_by_id[v["id"]] = v

    for s in schedules:
        s["distributor"] = distributors_by_id.get(s.get("distributor_id"))
        s["vehicle"] = vehicles_by_id.get(s.get("vehicle_id"))
        delv_ids = s.get("delivery_ids") or []
        s["delivery_count"] = len(delv_ids)
        if delv_ids:
            done = await db.distributor_deliveries.count_documents({
                "tenant_id": tenant_id, "id": {"$in": delv_ids}, "status": "delivered"
            })
            s["completed_count"] = done
        else:
            s["completed_count"] = 0

    return {"schedules": schedules, "total": len(schedules)}


async def _enrich_driver_schedule(schedule: dict, tenant_id: str) -> dict:
    """Pull stops (deliveries) in dispatch order with customer/address info."""
    ids = schedule.get("delivery_ids") or []
    deliveries: List[dict] = []
    if ids:
        rows = await db.distributor_deliveries.find(
            {"id": {"$in": ids}, "tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(len(ids))
        by_id = {r["id"]: r for r in rows}
        account_ids = list({r.get("account_id") for r in rows if r.get("account_id")})
        accounts_by_id = {}
        if account_ids:
            async for a in db.accounts.find(
                {"id": {"$in": account_ids}, "tenant_id": tenant_id},
                {"_id": 0, "id": 1, "account_name": 1, "billing_address": 1, "delivery_address": 1,
                 "contact_number": 1, "delivery_contact_phone": 1}
            ):
                accounts_by_id[a["id"]] = a

        def _addr_from(src):
            if not isinstance(src, dict):
                return None
            line1 = src.get("address_line1") or src.get("address_line_1") or ""
            line2 = src.get("address_line2") or src.get("address_line_2") or ""
            city = src.get("city") or ""
            state = src.get("state") or ""
            pincode = src.get("pincode") or src.get("zip") or ""
            return {
                "address_line1": line1 or None,
                "address_line2": line2 or None,
                "city": city or None,
                "state": state or None,
                "pincode": pincode or None,
                "lat": src.get("lat") or src.get("latitude"),
                "lng": src.get("lng") or src.get("longitude"),
                "formatted": ", ".join([p for p in (line1, line2, city, state, pincode) if p]) or None,
            }

        for did in ids:
            r = by_id.get(did)
            if not r:
                continue
            acct = accounts_by_id.get(r.get("account_id")) or {}
            dlv_addr = r.get("delivery_address")
            addr = _addr_from(dlv_addr) if isinstance(dlv_addr, dict) else None
            if not addr or not addr.get("formatted"):
                addr = _addr_from(acct.get("delivery_address")) or _addr_from(acct.get("billing_address"))
            phone = (r.get("contact_phone") or r.get("delivery_contact_phone")
                     or acct.get("delivery_contact_phone") or acct.get("contact_number"))
            deliveries.append({
                "id": r.get("id"),
                "delivery_number": r.get("delivery_number"),
                "status": r.get("status"),
                "customer_name": r.get("account_name") or r.get("customer_name") or acct.get("account_name"),
                "delivery_address": addr or {},
                "contact_phone": phone,
                "delivered_at": r.get("delivered_at"),
            })
    schedule["deliveries"] = deliveries
    return schedule


@router.get("/schedules/{schedule_id}")
async def get_driver_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    driver_id = _ensure_driver(current_user)
    tenant_id = get_current_tenant_id()
    s = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "driver_id": driver_id},
        {"_id": 0}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found or not assigned to you")
    return await _enrich_driver_schedule(s, tenant_id)


@router.post("/schedules/{schedule_id}/start")
async def start_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    """Start the delivery run. Flips status approved → in_progress and arms GPS pings."""
    driver_id = _ensure_driver(current_user)
    tenant_id = get_current_tenant_id()
    s = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "driver_id": driver_id}, {"_id": 0}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if s.get("status") not in ("approved", "in_progress"):
        raise HTTPException(status_code=400, detail=f"Cannot start a {s.get('status')} schedule")
    now = datetime.now(timezone.utc).isoformat()
    await db.distributor_delivery_schedules.update_one(
        {"id": schedule_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "in_progress",
            "started_at": s.get("started_at") or now,
            "tracking_active": True,
            "updated_at": now,
        }}
    )
    updated = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    return await _enrich_driver_schedule(updated, tenant_id)


@router.post("/schedules/{schedule_id}/end")
async def end_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    """Manual end. Stops GPS tracking; schedule marked completed."""
    driver_id = _ensure_driver(current_user)
    tenant_id = get_current_tenant_id()
    s = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "driver_id": driver_id}, {"_id": 0}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if s.get("status") not in ("in_progress", "approved"):
        raise HTTPException(status_code=400, detail=f"Cannot end a {s.get('status')} schedule")
    now = datetime.now(timezone.utc).isoformat()
    await db.distributor_delivery_schedules.update_one(
        {"id": schedule_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "completed",
            "ended_at": now,
            "tracking_active": False,
            "updated_at": now,
        }}
    )
    updated = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    return await _enrich_driver_schedule(updated, tenant_id)


class StopCompletePayload(BaseModel):
    notes: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


@router.post("/schedules/{schedule_id}/stops/{delivery_id}/complete")
async def complete_stop(
    schedule_id: str,
    delivery_id: str,
    payload: StopCompletePayload,
    current_user: dict = Depends(get_current_user),
):
    """Mark an individual stop as delivered. Updates underlying stock-out delivery
    status and, if it was the last pending stop, auto-completes the schedule."""
    driver_id = _ensure_driver(current_user)
    tenant_id = get_current_tenant_id()
    s = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "driver_id": driver_id}, {"_id": 0}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if delivery_id not in (s.get("delivery_ids") or []):
        raise HTTPException(status_code=400, detail="Delivery is not part of this schedule")

    delv = await db.distributor_deliveries.find_one(
        {"id": delivery_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not delv:
        raise HTTPException(status_code=404, detail="Delivery not found")
    if delv.get("status") == "delivered":
        return {"already_delivered": True, "delivery_id": delivery_id}

    now = datetime.now(timezone.utc).isoformat()
    await db.distributor_deliveries.update_one(
        {"id": delivery_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "delivered",
            "delivered_at": now,
            "delivered_by": driver_id,
            "delivery_notes": payload.notes,
            "delivered_lat": payload.lat,
            "delivered_lng": payload.lng,
            "updated_at": now,
        }}
    )

    # If every stop on this schedule is delivered, auto-complete the schedule.
    all_ids = s.get("delivery_ids") or []
    pending = await db.distributor_deliveries.count_documents({
        "tenant_id": tenant_id, "id": {"$in": all_ids}, "status": {"$ne": "delivered"}
    })
    auto_completed = False
    if pending == 0:
        await db.distributor_delivery_schedules.update_one(
            {"id": schedule_id, "tenant_id": tenant_id},
            {"$set": {
                "status": "completed",
                "ended_at": now,
                "tracking_active": False,
                "updated_at": now,
            }}
        )
        auto_completed = True

    return {"delivery_id": delivery_id, "auto_completed_schedule": auto_completed}


# ============ TRACKING =======================================================

class GPSPing(BaseModel):
    schedule_id: str
    lat: float
    lng: float
    accuracy_m: Optional[float] = None
    speed_kmh: Optional[float] = None
    heading: Optional[float] = None
    recorded_at: Optional[str] = None  # ISO; defaults to server time


@router.post("/tracking/ping")
async def push_gps_ping(payload: GPSPing, current_user: dict = Depends(get_current_user)):
    """Driver pushes a coordinate point. Stored in `driver_tracking_pings`."""
    driver_id = _ensure_driver(current_user)
    tenant_id = get_current_tenant_id()
    # Validate the schedule belongs to this driver and is in_progress
    s = await db.distributor_delivery_schedules.find_one(
        {"id": payload.schedule_id, "tenant_id": tenant_id, "driver_id": driver_id},
        {"_id": 0, "status": 1, "distributor_id": 1}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found for this driver")
    if s.get("status") not in ("in_progress", "approved"):
        raise HTTPException(status_code=400, detail="Tracking is not active for this schedule")

    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "schedule_id": payload.schedule_id,
        "distributor_id": s.get("distributor_id"),
        "driver_id": driver_id,
        "lat": payload.lat,
        "lng": payload.lng,
        "accuracy_m": payload.accuracy_m,
        "speed_kmh": payload.speed_kmh,
        "heading": payload.heading,
        "recorded_at": payload.recorded_at or now.isoformat(),
        "received_at": now.isoformat(),
    }
    await db.driver_tracking_pings.insert_one(doc)
    return {"ok": True, "ping_id": doc["id"]}


@router.get("/tracking/settings")
async def get_tracking_settings(current_user: dict = Depends(get_current_user)):
    """Tenant-configured GPS ping interval for the Driver app."""
    _ensure_driver(current_user)
    tenant_id = get_current_tenant_id()
    t = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0, "settings": 1})
    interval = ((t or {}).get("settings") or {}).get("gps_ping_interval_minutes") or 5
    return {"gps_ping_interval_minutes": int(interval)}
