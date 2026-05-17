"""
Distributor → Daily Delivery Schedules.

The Distributor user creates a schedule for a date, assigns a Vehicle + Driver
(filtered by the distributor's city), then attaches confirmed `distributor_deliveries`
to it in dispatch order. Confirming the schedule moves the underlying deliveries
from `confirmed` → `scheduled`. A driver-friendly PDF can be downloaded.

Multi-tenant aware. Only callable by users with role 'Distributor' linked to a
distributor record (`user.distributor_id`).
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import List, Optional
from datetime import datetime, timezone, date as _date, timedelta
from pydantic import BaseModel, Field
import io
import uuid
import logging

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter()
logger = logging.getLogger(__name__)


def _resolve_distributor_id(current_user: dict) -> str:
    distributor_id = current_user.get('distributor_id')
    if not distributor_id:
        raise HTTPException(
            status_code=403,
            detail="Your user account is not linked to a distributor."
        )
    return distributor_id


async def _get_distributor_city(distributor_id: str, tenant_id: str) -> Optional[str]:
    dist = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0, "city": 1, "billing_address": 1, "registered_address": 1, "distributor_name": 1}
    )
    if not dist:
        return None
    return (
        dist.get("city")
        or (dist.get("billing_address") or {}).get("city")
        or (dist.get("registered_address") or {}).get("city")
    )


# ============ Fleet pickers (vehicles / drivers filtered by distributor's city) ============

@router.get("/fleet/vehicles")
async def list_distributor_fleet_vehicles(current_user: dict = Depends(get_current_user)):
    """Active vehicles in the distributor's city. Used by the schedule create dialog."""
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    city = await _get_distributor_city(distributor_id, tenant_id)
    q: dict = {"tenant_id": tenant_id, "status": "active"}
    if city:
        q["city"] = {"$regex": f"^{city}$", "$options": "i"}
    vehicles = await db.vehicles.find(q, {"_id": 0}).sort("registration_number", 1).to_list(500)
    return {"city": city, "vehicles": vehicles}


@router.get("/fleet/drivers")
async def list_distributor_fleet_drivers(current_user: dict = Depends(get_current_user)):
    """Active drivers in the distributor's city. Used by the schedule create dialog."""
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    city = await _get_distributor_city(distributor_id, tenant_id)
    q: dict = {"tenant_id": tenant_id, "status": "active"}
    if city:
        q["city"] = {"$regex": f"^{city}$", "$options": "i"}
    drivers = await db.drivers.find(q, {"_id": 0}).sort("full_name", 1).to_list(500)
    return {"city": city, "drivers": drivers}


# ============ Delivery Schedules ============

ALLOWED_SCHEDULE_STATUSES = {"draft", "confirmed", "cancelled"}


class ScheduleCreate(BaseModel):
    schedule_date: str = Field(..., description="YYYY-MM-DD")
    vehicle_id: Optional[str] = None
    driver_id: Optional[str] = None
    notes: Optional[str] = None


class ScheduleUpdate(BaseModel):
    schedule_date: Optional[str] = None
    vehicle_id: Optional[str] = None
    driver_id: Optional[str] = None
    notes: Optional[str] = None
    # Ordered list of distributor_deliveries.id — sets the full dispatch order.
    delivery_ids: Optional[List[str]] = None


class AttachDeliveriesPayload(BaseModel):
    delivery_ids: List[str] = Field(default_factory=list)


async def _enrich_schedule(schedule: dict, tenant_id: str) -> dict:
    """Decorate a schedule with vehicle/driver labels and the full delivery list (in order)."""
    if schedule.get("vehicle_id"):
        v = await db.vehicles.find_one(
            {"id": schedule["vehicle_id"], "tenant_id": tenant_id},
            {"_id": 0, "registration_number": 1, "vehicle_name": 1, "vehicle_type": 1}
        )
        schedule["vehicle"] = v
    if schedule.get("driver_id"):
        d = await db.drivers.find_one(
            {"id": schedule["driver_id"], "tenant_id": tenant_id},
            {"_id": 0, "full_name": 1, "phone": 1, "license_number": 1}
        )
        schedule["driver"] = d

    ids = schedule.get("delivery_ids") or []
    deliveries: List[dict] = []
    if ids:
        rows = await db.distributor_deliveries.find(
            {"id": {"$in": ids}, "tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(len(ids))
        by_id = {r["id"]: r for r in rows}
        for did in ids:
            r = by_id.get(did)
            if not r:
                continue
            # Trim the delivery doc to what the schedule UI / PDF needs
            items = []
            for line in r.get("items", []) or []:
                items.append({
                    "sku_name": line.get("sku_name") or line.get("sku") or line.get("name"),
                    "quantity": line.get("quantity") or line.get("delivered_quantity") or 0,
                })
            deliveries.append({
                "id": r.get("id"),
                "delivery_number": r.get("delivery_number"),
                "status": r.get("status"),
                "account_id": r.get("account_id"),
                "customer_name": r.get("customer_name") or r.get("account_name"),
                "delivery_address": r.get("delivery_address") or {},
                "contact_phone": r.get("contact_phone") or r.get("delivery_contact_phone"),
                "items": items,
            })
    schedule["deliveries"] = deliveries
    return schedule


@router.post("")
async def create_schedule(payload: ScheduleCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)

    # Validate date
    try:
        _date.fromisoformat(payload.schedule_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="schedule_date must be in YYYY-MM-DD format")

    if payload.vehicle_id:
        v = await db.vehicles.find_one({"id": payload.vehicle_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
        if not v:
            raise HTTPException(status_code=404, detail="Vehicle not found")
    if payload.driver_id:
        d = await db.drivers.find_one({"id": payload.driver_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
        if not d:
            raise HTTPException(status_code=404, detail="Driver not found")

    now = datetime.now(timezone.utc).isoformat()
    schedule = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "schedule_date": payload.schedule_date,
        "vehicle_id": payload.vehicle_id,
        "driver_id": payload.driver_id,
        "delivery_ids": [],
        "status": "draft",
        "notes": (payload.notes or "").strip() or None,
        "created_at": now,
        "created_by": current_user.get("id"),
        "confirmed_at": None,
        "confirmed_by": None,
    }
    await db.distributor_delivery_schedules.insert_one(schedule)
    schedule.pop("_id", None)
    return await _enrich_schedule(schedule, tenant_id)


@router.get("")
async def list_schedules(
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)

    q: dict = {"tenant_id": tenant_id, "distributor_id": distributor_id}
    if status:
        q["status"] = status
    if from_date or to_date:
        date_q: dict = {}
        if from_date:
            date_q["$gte"] = from_date
        if to_date:
            date_q["$lte"] = to_date
        q["schedule_date"] = date_q

    schedules = await db.distributor_delivery_schedules.find(q, {"_id": 0}).sort([
        ("schedule_date", -1), ("created_at", -1)
    ]).to_list(500)

    # Light enrichment — just labels + delivery_count, NOT every delivery doc
    for s in schedules:
        if s.get("vehicle_id"):
            v = await db.vehicles.find_one(
                {"id": s["vehicle_id"], "tenant_id": tenant_id},
                {"_id": 0, "registration_number": 1, "vehicle_name": 1}
            )
            s["vehicle"] = v
        if s.get("driver_id"):
            d = await db.drivers.find_one(
                {"id": s["driver_id"], "tenant_id": tenant_id},
                {"_id": 0, "full_name": 1}
            )
            s["driver"] = d
        s["delivery_count"] = len(s.get("delivery_ids") or [])

    return {"schedules": schedules, "total": len(schedules)}


@router.get("/eligible-deliveries")
async def list_eligible_deliveries(current_user: dict = Depends(get_current_user)):
    """Deliveries that can still be attached to a schedule: status == 'confirmed'
    AND not already referenced by any non-cancelled schedule."""
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)

    # Find delivery ids already attached to an active schedule
    busy_ids: set = set()
    async for s in db.distributor_delivery_schedules.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id, "status": {"$ne": "cancelled"}},
        {"_id": 0, "delivery_ids": 1}
    ):
        for did in s.get("delivery_ids") or []:
            busy_ids.add(did)

    q: dict = {
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "status": "confirmed",
    }
    deliveries = await db.distributor_deliveries.find(q, {"_id": 0}).sort("delivery_number", 1).to_list(2000)
    eligible = [d for d in deliveries if d.get("id") not in busy_ids]

    # Trim payload
    trimmed = [{
        "id": d.get("id"),
        "delivery_number": d.get("delivery_number"),
        "customer_name": d.get("customer_name") or d.get("account_name"),
        "account_id": d.get("account_id"),
        "delivery_address": d.get("delivery_address") or {},
        "contact_phone": d.get("contact_phone") or d.get("delivery_contact_phone"),
        "items_count": len(d.get("items") or []),
        "total_quantity": sum((line.get("quantity") or 0) for line in (d.get("items") or [])),
    } for d in eligible]

    return {"deliveries": trimmed, "total": len(trimmed)}


@router.get("/{schedule_id}")
async def get_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    s = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return await _enrich_schedule(s, tenant_id)


@router.put("/{schedule_id}")
async def update_schedule(schedule_id: str, payload: ScheduleUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    existing = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if existing.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled schedules cannot be edited")

    update_doc: dict = {}
    if payload.schedule_date is not None:
        try:
            _date.fromisoformat(payload.schedule_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="schedule_date must be in YYYY-MM-DD format")
        update_doc["schedule_date"] = payload.schedule_date
    if payload.vehicle_id is not None:
        if payload.vehicle_id:
            v = await db.vehicles.find_one({"id": payload.vehicle_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
            if not v:
                raise HTTPException(status_code=404, detail="Vehicle not found")
        update_doc["vehicle_id"] = payload.vehicle_id or None
    if payload.driver_id is not None:
        if payload.driver_id:
            d = await db.drivers.find_one({"id": payload.driver_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
            if not d:
                raise HTTPException(status_code=404, detail="Driver not found")
        update_doc["driver_id"] = payload.driver_id or None
    if payload.notes is not None:
        update_doc["notes"] = payload.notes.strip() or None

    if payload.delivery_ids is not None:
        # Reorder / set the full list. Validate every id is owned by this distributor.
        ids = list(payload.delivery_ids)
        if ids:
            count = await db.distributor_deliveries.count_documents({
                "tenant_id": tenant_id, "distributor_id": distributor_id, "id": {"$in": ids}
            })
            if count != len(set(ids)):
                raise HTTPException(status_code=400, detail="One or more delivery ids are invalid for this distributor")
        update_doc["delivery_ids"] = ids

    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.distributor_delivery_schedules.update_one(
        {"id": schedule_id, "tenant_id": tenant_id},
        {"$set": update_doc}
    )
    s = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id},
        {"_id": 0}
    )
    return await _enrich_schedule(s, tenant_id)


@router.post("/{schedule_id}/attach-deliveries")
async def attach_deliveries(
    schedule_id: str,
    payload: AttachDeliveriesPayload,
    current_user: dict = Depends(get_current_user),
):
    """Append given delivery_ids to the schedule (dedup, validates ownership)."""
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    existing = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if existing.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled schedules cannot be edited")

    new_ids = [d for d in payload.delivery_ids if d]
    if not new_ids:
        raise HTTPException(status_code=400, detail="No delivery_ids provided")

    # Validate ownership + status
    rows = await db.distributor_deliveries.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id, "id": {"$in": new_ids}},
        {"_id": 0, "id": 1, "status": 1}
    ).to_list(len(new_ids))
    found_ids = {r["id"] for r in rows}
    missing = set(new_ids) - found_ids
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown / cross-distributor delivery ids: {sorted(missing)}")
    bad_status = [r["id"] for r in rows if r.get("status") not in ("confirmed", "scheduled")]
    if bad_status:
        raise HTTPException(status_code=400, detail=f"Only confirmed deliveries can be attached. Invalid: {bad_status}")

    # Ensure no other active schedule owns these
    other = await db.distributor_delivery_schedules.find_one(
        {
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "id": {"$ne": schedule_id},
            "status": {"$ne": "cancelled"},
            "delivery_ids": {"$in": new_ids},
        },
        {"_id": 0, "id": 1}
    )
    if other:
        raise HTTPException(status_code=400, detail="One or more deliveries are already attached to another active schedule")

    current = list(existing.get("delivery_ids") or [])
    merged = current + [d for d in new_ids if d not in current]

    # If the schedule is already confirmed, immediately mark new deliveries as `scheduled`.
    if existing.get("status") == "confirmed":
        await db.distributor_deliveries.update_many(
            {"tenant_id": tenant_id, "id": {"$in": [d for d in new_ids if d not in current]}, "status": "confirmed"},
            {"$set": {"status": "scheduled", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )

    await db.distributor_delivery_schedules.update_one(
        {"id": schedule_id, "tenant_id": tenant_id},
        {"$set": {"delivery_ids": merged, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    s = await db.distributor_delivery_schedules.find_one({"id": schedule_id, "tenant_id": tenant_id}, {"_id": 0})
    return await _enrich_schedule(s, tenant_id)


@router.post("/{schedule_id}/detach-delivery/{delivery_id}")
async def detach_delivery(
    schedule_id: str,
    delivery_id: str,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    existing = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if existing.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Cancelled schedules cannot be edited")

    ids = [d for d in (existing.get("delivery_ids") or []) if d != delivery_id]
    await db.distributor_delivery_schedules.update_one(
        {"id": schedule_id, "tenant_id": tenant_id},
        {"$set": {"delivery_ids": ids, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    # If schedule was confirmed and the delivery was already in `scheduled` state,
    # revert it back to `confirmed` so it can be re-attached to another schedule.
    if existing.get("status") == "confirmed":
        await db.distributor_deliveries.update_one(
            {"tenant_id": tenant_id, "id": delivery_id, "status": "scheduled"},
            {"$set": {"status": "confirmed", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )

    s = await db.distributor_delivery_schedules.find_one({"id": schedule_id, "tenant_id": tenant_id}, {"_id": 0})
    return await _enrich_schedule(s, tenant_id)


@router.post("/{schedule_id}/confirm")
async def confirm_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    existing = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if existing.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Only draft schedules can be confirmed")
    if not existing.get("delivery_ids"):
        raise HTTPException(status_code=400, detail="Add at least one delivery before confirming the schedule")
    if not existing.get("vehicle_id") or not existing.get("driver_id"):
        raise HTTPException(status_code=400, detail="Vehicle and Driver must be assigned before confirming")

    now = datetime.now(timezone.utc).isoformat()
    await db.distributor_delivery_schedules.update_one(
        {"id": schedule_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "confirmed",
            "confirmed_at": now,
            "confirmed_by": current_user.get("id"),
            "updated_at": now,
        }}
    )
    # Move underlying deliveries: confirmed → scheduled
    await db.distributor_deliveries.update_many(
        {"tenant_id": tenant_id, "id": {"$in": existing["delivery_ids"]}, "status": "confirmed"},
        {"$set": {"status": "scheduled", "updated_at": now}}
    )

    s = await db.distributor_delivery_schedules.find_one({"id": schedule_id, "tenant_id": tenant_id}, {"_id": 0})
    return await _enrich_schedule(s, tenant_id)


@router.post("/{schedule_id}/cancel")
async def cancel_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    existing = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if existing.get("status") == "cancelled":
        return existing
    now = datetime.now(timezone.utc).isoformat()
    await db.distributor_delivery_schedules.update_one(
        {"id": schedule_id, "tenant_id": tenant_id},
        {"$set": {"status": "cancelled", "cancelled_at": now, "updated_at": now}}
    )
    # Revert any `scheduled` underlying deliveries back to `confirmed`
    if existing.get("delivery_ids"):
        await db.distributor_deliveries.update_many(
            {"tenant_id": tenant_id, "id": {"$in": existing["delivery_ids"]}, "status": "scheduled"},
            {"$set": {"status": "confirmed", "updated_at": now}}
        )
    s = await db.distributor_delivery_schedules.find_one({"id": schedule_id, "tenant_id": tenant_id}, {"_id": 0})
    return await _enrich_schedule(s, tenant_id)


@router.delete("/{schedule_id}")
async def delete_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    existing = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if existing.get("status") not in ("draft", "cancelled"):
        raise HTTPException(status_code=400, detail="Only draft or cancelled schedules can be deleted")
    await db.distributor_delivery_schedules.delete_one({"id": schedule_id, "tenant_id": tenant_id})
    return {"deleted": True, "id": schedule_id}


# ============ PDF =================================================================

@router.get("/{schedule_id}/pdf")
async def download_schedule_pdf(schedule_id: str, current_user: dict = Depends(get_current_user)):
    """Generate a driver-friendly delivery sheet PDF for a CONFIRMED schedule."""
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    s = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if s.get("status") != "confirmed":
        raise HTTPException(status_code=400, detail="PDF is only available for confirmed schedules")

    s = await _enrich_schedule(s, tenant_id)
    dist = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0, "distributor_name": 1, "distributor_code": 1}
    ) or {}

    pdf_bytes = _build_schedule_pdf(s, dist)
    filename = f"delivery-schedule-{s.get('schedule_date')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


def _build_schedule_pdf(schedule: dict, dist: dict) -> bytes:
    """Build the delivery sheet using ReportLab. Minimal, driver-friendly layout."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=14 * mm, rightMargin=14 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
        title=f"Delivery Schedule {schedule.get('schedule_date')}"
    )
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=18, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=11, textColor=colors.grey, spaceAfter=10)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=10, leading=13)
    small = ParagraphStyle("small", parent=styles["BodyText"], fontSize=9, leading=11, textColor=colors.grey)

    story = []
    story.append(Paragraph(f"Delivery Schedule — {schedule.get('schedule_date')}", h1))
    story.append(Paragraph(
        f"{dist.get('distributor_name') or 'Distributor'} ({dist.get('distributor_code') or ''})", h2
    ))

    v = schedule.get("vehicle") or {}
    d = schedule.get("driver") or {}
    info = [
        [Paragraph("<b>Vehicle</b>", body),
         Paragraph(f"{v.get('registration_number') or '—'} <font color='grey'>· {v.get('vehicle_name') or v.get('vehicle_type') or ''}</font>", body)],
        [Paragraph("<b>Driver</b>", body),
         Paragraph(f"{d.get('full_name') or '—'} <font color='grey'>· {d.get('phone') or ''}</font>", body)],
        [Paragraph("<b>Total stops</b>", body),
         Paragraph(str(len(schedule.get("deliveries") or [])), body)],
    ]
    t = Table(info, colWidths=[35 * mm, None])
    t.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 8 * mm))

    # Stops table
    header = [
        Paragraph("<b>#</b>", body),
        Paragraph("<b>Customer · Phone</b>", body),
        Paragraph("<b>Address</b>", body),
        Paragraph("<b>Items</b>", body),
    ]
    rows = [header]
    for idx, delv in enumerate(schedule.get("deliveries") or [], start=1):
        addr = delv.get("delivery_address") or {}
        addr_str = ", ".join([x for x in (
            addr.get("address_line1"), addr.get("address_line2"),
            addr.get("city"), addr.get("state"), addr.get("pincode")
        ) if x]) or "—"
        items_str = "<br/>".join([
            f"{(it.get('sku_name') or '—')} — <b>{it.get('quantity') or 0}</b>"
            for it in (delv.get("items") or [])
        ]) or "—"
        rows.append([
            Paragraph(str(idx), body),
            Paragraph(
                f"<b>{delv.get('customer_name') or '—'}</b><br/>"
                f"<font color='grey'>{delv.get('contact_phone') or ''}</font><br/>"
                f"<font color='grey' size='8'>{delv.get('delivery_number') or ''}</font>",
                body
            ),
            Paragraph(addr_str, body),
            Paragraph(items_str, body),
        ])
    stops = Table(rows, colWidths=[10 * mm, 55 * mm, 65 * mm, None], repeatRows=1)
    stops.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.grey),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(stops)
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        f"Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}", small
    ))

    doc.build(story)
    return buf.getvalue()


# ============ Quick-date helper for the UI =====================================

@router.get("/meta/quick-dates")
async def get_quick_dates(current_user: dict = Depends(get_current_user)):
    """Returns today/tomorrow ISO dates for the schedule create dialog."""
    _resolve_distributor_id(current_user)  # auth-gate
    today = datetime.now(timezone.utc).date()
    return {
        "today": today.isoformat(),
        "tomorrow": (today + timedelta(days=1)).isoformat(),
    }
