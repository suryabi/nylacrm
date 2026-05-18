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
from .distributor_delivery_schedules import _enrich_schedule

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
                "tenant_id": tenant_id, "id": {"$in": delv_ids}, "status": {"$in": ["delivered", "complete"]}
            })
            s["completed_count"] = done
        else:
            s["completed_count"] = 0

    return {"schedules": schedules, "total": len(schedules)}


async def _enrich_driver_schedule(schedule: dict, tenant_id: str) -> dict:
    """Pull stops (deliveries) in dispatch order with customer/address/contact
    info AND the SKU line items (with crate counts) the driver must hand over.

    Re-uses the distributor-side enrichment so the driver always sees the
    same SKUs/crate counts the distributor agreed when approving the schedule.
    On top of that we add `delivered_at` per stop (used by the UI to render
    "Delivered at HH:MM" once a stop is marked complete).
    """
    enriched = await _enrich_schedule(schedule, tenant_id)
    deliveries = enriched.get("deliveries") or []
    if deliveries:
        ids = [d["id"] for d in deliveries if d.get("id")]
        delivered_at_by_id: dict = {}
        async for r in db.distributor_deliveries.find(
            {"id": {"$in": ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "delivered_at": 1}
        ):
            delivered_at_by_id[r["id"]] = r.get("delivered_at")
        for d in deliveries:
            d["delivered_at"] = delivered_at_by_id.get(d.get("id"))
    return enriched




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
    # Bump all attached deliveries (not yet delivered) into `on_the_way` so the
    # stock-out screen and distributor dashboard reflect the live state.
    delv_ids = s.get("delivery_ids") or []
    if delv_ids:
        await db.distributor_deliveries.update_many(
            {
                "tenant_id": tenant_id,
                "id": {"$in": delv_ids},
                "status": {"$in": ["delivery_scheduled", "scheduled", "delivery_assigned", "confirmed"]},
            },
            {"$set": {"status": "on_the_way", "updated_at": now}}
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
    if delv.get("status") in ("delivered", "complete"):
        return {"already_delivered": True, "delivery_id": delivery_id}

    now = datetime.now(timezone.utc).isoformat()
    await db.distributor_deliveries.update_one(
        {"id": delivery_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "complete",
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
        "tenant_id": tenant_id, "id": {"$in": all_ids}, "status": {"$nin": ["delivered", "complete"]}
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
