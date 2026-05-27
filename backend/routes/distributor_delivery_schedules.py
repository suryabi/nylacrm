"""
Distributor → Daily Delivery Schedules.

The Distributor user creates a schedule for a date, assigns a Vehicle + Driver
(filtered by the distributor's city), then attaches confirmed `distributor_deliveries`
to it in dispatch order. Confirming the schedule moves the underlying deliveries
from `confirmed` → `scheduled`. A driver-friendly PDF can be downloaded.

Multi-tenant aware. Only callable by users with role 'Distributor' linked to a
distributor record (`user.distributor_id`).
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
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

import os
import httpx

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


async def _get_distributor_cities(distributor_id: str, tenant_id: str) -> list:
    """Return EVERY city associated with the distributor — primary `city`,
    billing/registered address cities, AND every active row in
    `distributor_operating_coverage`. This is what the Fleet picker should
    match against so vehicles/drivers in any city the distributor actually
    operates in are visible (not just the head-office city).

    De-duplicated, case-folded for comparison but original casings preserved.
    """
    primary = await _get_distributor_city(distributor_id, tenant_id)
    coverage_rows = await db.distributor_operating_coverage.find(
        {"tenant_id": tenant_id, "distributor_id": distributor_id, "status": "active"},
        {"_id": 0, "city": 1},
    ).to_list(500)

    seen: set = set()
    out: list = []
    for c in ([primary] + [r.get("city") for r in coverage_rows]):
        if not c:
            continue
        key = c.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(c.strip())
    return out


# ============ Distance helpers (Google Maps Distance Matrix) ==================

def _address_to_query(addr) -> Optional[str]:
    if not addr:
        return None
    if isinstance(addr, str):
        s = addr.strip()
        return s or None
    if not isinstance(addr, dict):
        return None
    parts = [
        addr.get("address_line1") or addr.get("address_line_1") or addr.get("line1"),
        addr.get("address_line2") or addr.get("address_line_2") or addr.get("line2"),
        addr.get("city"),
        addr.get("state"),
        addr.get("pincode") or addr.get("zip"),
    ]
    q = ", ".join([p for p in parts if p])
    return q or None


async def _get_factory_address(tenant_id: str) -> Optional[str]:
    """Returns the factory address. Configured under tenants.settings.factory_address."""
    t = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0, "settings": 1})
    if not t:
        return None
    fa = (t.get("settings") or {}).get("factory_address")
    if isinstance(fa, dict):
        return _address_to_query(fa)
    if isinstance(fa, str) and fa.strip():
        return fa.strip()
    return None


async def _get_distributor_origin(distributor_id: str, tenant_id: str) -> Optional[str]:
    """Distributor's default/primary location → address string for Distance Matrix origin."""
    loc = await db.distributor_locations.find_one(
        {"distributor_id": distributor_id, "tenant_id": tenant_id, "is_default": True},
        {"_id": 0}
    )
    if not loc:
        loc = await db.distributor_locations.find_one(
            {"distributor_id": distributor_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
    if not loc:
        return None
    return _address_to_query({
        "address_line1": loc.get("address_line_1") or loc.get("address_line1"),
        "address_line2": loc.get("address_line_2") or loc.get("address_line2"),
        "city": loc.get("city"),
        "state": loc.get("state"),
        "pincode": loc.get("pincode"),
    })


async def _distance_matrix(origins: List[str], destinations: List[str]) -> Optional[dict]:
    """Use the modern Google Maps Routes API (computeRouteMatrix) since the legacy
    Distance Matrix endpoint is no longer enabled by default for new projects.
    Returns a parsed result list (one element per origin×destination pair) or None on failure."""
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not api_key or not origins or not destinations:
        return None
    url = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
    body = {
        "origins": [{"waypoint": {"address": o}} for o in origins],
        "destinations": [{"waypoint": {"address": d}} for d in destinations],
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_UNAWARE",
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration,status,condition",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(url, headers=headers, json=body)
            r.raise_for_status()
            return r.json()  # list of {originIndex, destinationIndex, distanceMeters, duration, ...}
    except Exception as e:
        logger.warning(f"Google Routes API failed: {e}")
        return None


# ============ Fleet pickers (vehicles / drivers filtered by distributor's city) ============

def _city_match_clause(cities) -> Optional[dict]:
    """Build a Mongo filter that matches records in ANY of the given cities OR
    records with no city assigned (None / missing / blank). Vehicles & drivers
    without a city are treated as "available everywhere" so admins aren't
    forced to re-edit every record after adding a distributor.

    Accepts either a single city string (legacy) or a list of cities.
    Returns None if `cities` is empty / falsy (i.e. no filter needed at all).
    """
    if isinstance(cities, str):
        cities = [cities]
    cities = [c for c in (cities or []) if c]
    if not cities:
        return None
    city_regexes = [{"city": {"$regex": f"^{c}$", "$options": "i"}} for c in cities]
    return {
        "$or": city_regexes + [
            {"city": None},
            {"city": ""},
            {"city": {"$exists": False}},
        ]
    }


@router.get("/fleet/vehicles")
async def list_distributor_fleet_vehicles(current_user: dict = Depends(get_current_user)):
    """Active vehicles available to the distributor.

    Filter is inclusive: a vehicle is shown if its `city` matches ANY city the
    distributor operates in (primary city OR an active row in
    `distributor_operating_coverage`) OR if no city is set on the vehicle.
    This avoids the foot-gun where vehicles in a city listed under operating
    coverage are invisible because only the head-office `city` was being
    matched.
    """
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    cities = await _get_distributor_cities(distributor_id, tenant_id)
    q: dict = {"tenant_id": tenant_id, "status": "active"}
    city_clause = _city_match_clause(cities)
    if city_clause:
        q.update(city_clause)
    vehicles = await db.vehicles.find(q, {"_id": 0}).sort("registration_number", 1).to_list(500)
    # For UI labels we still surface the primary city (first in the list)
    primary_city = cities[0] if cities else None
    return {"city": primary_city, "cities": cities, "vehicles": vehicles}


@router.get("/fleet/drivers")
async def list_distributor_fleet_drivers(current_user: dict = Depends(get_current_user)):
    """Active drivers available to the distributor.

    Same inclusive matching as `/fleet/vehicles`: matches against the
    distributor's primary city + every active operating-coverage city, and
    also includes drivers with no city assigned.
    """
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    cities = await _get_distributor_cities(distributor_id, tenant_id)
    q: dict = {"tenant_id": tenant_id, "status": "active"}
    city_clause = _city_match_clause(cities)
    if city_clause:
        q.update(city_clause)
    drivers = await db.drivers.find(q, {"_id": 0}).sort("full_name", 1).to_list(500)
    primary_city = cities[0] if cities else None
    return {"city": primary_city, "cities": cities, "drivers": drivers}


# ============ Delivery Schedules ============

ALLOWED_SCHEDULE_STATUSES = {"draft", "confirmed", "approved", "cancelled"}


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

        # Bulk-fetch line items + accounts in two queries to avoid N+1
        items_by_delivery: dict = {}
        sku_ids: set = set()
        async for it in db.distributor_delivery_items.find(
            {"delivery_id": {"$in": ids}, "tenant_id": tenant_id},
            {"_id": 0, "delivery_id": 1, "sku_id": 1, "sku_name": 1, "sku_code": 1, "quantity": 1, "unit_price": 1}
        ):
            items_by_delivery.setdefault(it["delivery_id"], []).append(it)
            if it.get("sku_id"):
                sku_ids.add(it["sku_id"])

        # Pull SKU packaging info to compute crates from raw unit quantities.
        # Each SKU stores `packaging_config.stock_out` — pick the entry marked
        # `is_default=True` (fallback: first entry). `units_per_package` tells us
        # how many bottles fit in one crate / pack — drivers care about crates,
        # not bottles, so we report packaging units everywhere.
        sku_packaging: dict = {}
        if sku_ids:
            async for s in db.master_skus.find(
                {"id": {"$in": list(sku_ids)}},
                {"_id": 0, "id": 1, "packaging_config": 1}
            ):
                pkgs = ((s.get("packaging_config") or {}).get("stock_out") or [])
                if not pkgs:
                    continue
                pkg = next((p for p in pkgs if p.get("is_default")), pkgs[0])
                sku_packaging[s["id"]] = {
                    "units_per_package": int(pkg.get("units_per_package") or 0) or None,
                    "packaging_type_name": pkg.get("packaging_type_name") or "Crate",
                }

        account_ids = list({r.get("account_id") for r in rows if r.get("account_id")})
        accounts_by_id: dict = {}
        if account_ids:
            async for a in db.accounts.find(
                {"id": {"$in": account_ids}, "tenant_id": tenant_id},
                {"_id": 0, "id": 1, "account_name": 1, "billing_address": 1, "delivery_address": 1,
                 "contact_number": 1, "delivery_contact_phone": 1, "delivery_contact_name": 1,
                 "billed_by": 1}
            ):
                accounts_by_id[a["id"]] = a

        def _addr_from(src):
            if not isinstance(src, dict):
                return None
            line1 = src.get("address_line1") or src.get("address_line_1") or src.get("line1") or ""
            line2 = src.get("address_line2") or src.get("address_line_2") or src.get("line2") or ""
            city = src.get("city") or ""
            state = src.get("state") or ""
            pincode = src.get("pincode") or src.get("zip") or ""
            if not (line1 or line2 or city or state or pincode):
                return None
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

            # Customer name precedence: delivery.account_name → account.account_name → "Unknown"
            customer_name = r.get("account_name") or r.get("customer_name") or acct.get("account_name") or "Unknown"
            # Address precedence: delivery.delivery_address (if non-empty dict) → account.delivery_address → account.billing_address
            dlv_addr = r.get("delivery_address")
            addr = _addr_from(dlv_addr) if isinstance(dlv_addr, dict) else None
            if not addr:
                addr = _addr_from(acct.get("delivery_address")) or _addr_from(acct.get("billing_address"))
            # Delivery contact — the on-ground person the driver should call.
            # Prefer the delivery row's override, fall back to the account.
            delivery_contact_name = (
                r.get("delivery_contact_name")
                or acct.get("delivery_contact_name")
            )
            delivery_contact_phone = (
                r.get("delivery_contact_phone")
                or acct.get("delivery_contact_phone")
            )
            # Legacy "contact_phone" — broadest fallback. Kept for backward
            # compatibility with any UI that still reads it.
            phone = (
                r.get("contact_phone")
                or delivery_contact_phone
                or acct.get("contact_number")
            )

            # Items — convert raw bottle counts into packaging units (crates).
            raw_items = items_by_delivery.get(did) or r.get("items") or []
            items = []
            total_packages = 0
            total_units = 0
            for line in raw_items:
                qty_units = int(line.get("quantity") or line.get("delivered_quantity") or 0)
                total_units += qty_units
                pkg_info = sku_packaging.get(line.get("sku_id")) or {}
                upp = pkg_info.get("units_per_package")
                pkg_label = pkg_info.get("packaging_type_name") or "Crate"
                if upp and upp > 0:
                    # Round UP — partial crates ship as a full crate
                    pkg_count = -(-qty_units // upp)
                else:
                    pkg_count = qty_units  # fallback: treat each unit as one package
                total_packages += pkg_count
                items.append({
                    "sku_name": line.get("sku_name") or line.get("sku_code") or "Item",
                    "quantity_units": qty_units,
                    "quantity": pkg_count,
                    "packaging_label": pkg_label,
                    "units_per_package": upp,
                })

            deliveries.append({
                "id": r.get("id"),
                "delivery_number": r.get("delivery_number"),
                "status": r.get("status"),
                "account_id": r.get("account_id"),
                "customer_name": customer_name,
                "delivery_address": addr or {},
                "contact_phone": phone,
                "delivery_contact_name": delivery_contact_name,
                "delivery_contact_phone": delivery_contact_phone,
                "items": items,
                "total_quantity": total_packages,
                "total_units": total_units,
                # Zoho identifiers — populated after schedule confirmation. Surfaced
                # on the stop card so users can download/view the official invoice.
                "zoho_invoice_id": r.get("zoho_invoice_id"),
                "zoho_invoice_number": r.get("zoho_invoice_number"),
                "zoho_invoice_url": r.get("zoho_invoice_url"),
                # Hides Zoho UI when the account is billed by a third-party distributor.
                "account_billed_by": (acct.get("billed_by") or "company"),
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

    # New schedules drop to the bottom of the day's list by default. We pick
    # `max(priority_order) + 1` so the user can still drag them up.
    last_for_day = await db.distributor_delivery_schedules.find_one(
        {"tenant_id": tenant_id, "distributor_id": distributor_id, "schedule_date": payload.schedule_date},
        {"_id": 0, "priority_order": 1},
        sort=[("priority_order", -1)],
    )
    next_order = (last_for_day or {}).get("priority_order", -1) + 1 if last_for_day else 0

    schedule = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "schedule_date": payload.schedule_date,
        "vehicle_id": payload.vehicle_id,
        "driver_id": payload.driver_id,
        "delivery_ids": [],
        "status": "draft",
        "priority_order": next_order,
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
        ("schedule_date", -1),
        ("priority_order", 1),
        ("created_at", 1),
    ]).to_list(500)

    # Light enrichment — labels, delivery_count, AND total crate count so the
    # row card can show "8 crates" before the user expands the detail.
    # Crate total = ceil(quantity / units_per_package) summed across all line
    # items for every delivery in the schedule. We do it in two bulk queries
    # to avoid N+1.
    all_delivery_ids: List[str] = []
    for s in schedules:
        all_delivery_ids.extend(s.get("delivery_ids") or [])

    crate_total_by_delivery: dict[str, int] = {}
    if all_delivery_ids:
        # Pull line items
        items_by_delivery: dict[str, list] = {}
        sku_ids: set[str] = set()
        async for it in db.distributor_delivery_items.find(
            {"delivery_id": {"$in": all_delivery_ids}, "tenant_id": tenant_id},
            {"_id": 0, "delivery_id": 1, "sku_id": 1, "quantity": 1}
        ):
            items_by_delivery.setdefault(it["delivery_id"], []).append(it)
            if it.get("sku_id"):
                sku_ids.add(it["sku_id"])
        # Pull SKU packaging info
        sku_upp: dict[str, int] = {}
        if sku_ids:
            async for sku in db.master_skus.find(
                {"id": {"$in": list(sku_ids)}},
                {"_id": 0, "id": 1, "packaging_config": 1}
            ):
                pkgs = ((sku.get("packaging_config") or {}).get("stock_out") or [])
                if not pkgs:
                    continue
                pkg = next((p for p in pkgs if p.get("is_default")), pkgs[0])
                upp = int(pkg.get("units_per_package") or 0)
                if upp > 0:
                    sku_upp[sku["id"]] = upp
        for did, lines in items_by_delivery.items():
            total = 0
            for ln in lines:
                qty = int(ln.get("quantity") or 0)
                upp = sku_upp.get(ln.get("sku_id"))
                total += (-(-qty // upp)) if upp and upp > 0 else qty
            crate_total_by_delivery[did] = total

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
        s["total_crates"] = sum(crate_total_by_delivery.get(did, 0) for did in (s.get("delivery_ids") or []))
        if "priority_order" not in s:
            s["priority_order"] = 0

    return {"schedules": schedules, "total": len(schedules)}


class ReorderPayload(BaseModel):
    schedule_date: str
    schedule_ids: List[str]


@router.post("/reorder")
async def reorder_schedules(payload: ReorderPayload, current_user: dict = Depends(get_current_user)):
    """Persist the priority order of schedules for a given date. The list as
    sent (top→bottom) becomes `priority_order` 0, 1, 2, … so the next
    `list_schedules` call returns them in the same order.

    Only schedules belonging to the calling distributor on that date are
    touched; foreign ids in the payload are silently ignored."""
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    if not payload.schedule_ids:
        return {"updated": 0}
    try:
        _date.fromisoformat(payload.schedule_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="schedule_date must be in YYYY-MM-DD format")

    now = datetime.now(timezone.utc).isoformat()
    updated = 0
    for idx, sid in enumerate(payload.schedule_ids):
        res = await db.distributor_delivery_schedules.update_one(
            {"id": sid, "tenant_id": tenant_id, "distributor_id": distributor_id, "schedule_date": payload.schedule_date},
            {"$set": {"priority_order": idx, "updated_at": now}}
        )
        if res.modified_count or res.matched_count:
            updated += 1
    return {"updated": updated}


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

    # Pull related accounts in one go for address fallback
    account_ids = list({d.get("account_id") for d in eligible if d.get("account_id")})
    accounts_by_id: dict = {}
    if account_ids:
        async for a in db.accounts.find(
            {"id": {"$in": account_ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "account_name": 1, "billing_address": 1, "delivery_address": 1,
             "contact_number": 1, "delivery_contact_phone": 1}
        ):
            accounts_by_id[a["id"]] = a

    # Bulk-fetch item counts + SKU packaging to compute crate totals.
    # We compute packages-per-line and sum, NOT total_bottles/units_per_package
    # of the whole delivery (different SKUs may have different crate sizes).
    item_stats: dict = {}
    line_skus: dict = {}  # delivery_id -> list of {sku_id, quantity}
    if eligible:
        elig_ids = [d["id"] for d in eligible]
        async for it in db.distributor_delivery_items.find(
            {"delivery_id": {"$in": elig_ids}, "tenant_id": tenant_id},
            {"_id": 0, "delivery_id": 1, "quantity": 1, "sku_id": 1}
        ):
            line_skus.setdefault(it["delivery_id"], []).append({
                "sku_id": it.get("sku_id"),
                "quantity": int(it.get("quantity") or 0),
            })
            s = item_stats.setdefault(it["delivery_id"], {"count": 0, "qty_units": 0})
            s["count"] += 1
            s["qty_units"] += int(it.get("quantity") or 0)

    # SKU packaging lookup
    sku_ids = list({sku_line["sku_id"] for lines in line_skus.values() for sku_line in lines if sku_line.get("sku_id")})
    sku_packaging: dict = {}
    if sku_ids:
        async for s in db.master_skus.find(
            {"id": {"$in": sku_ids}},
            {"_id": 0, "id": 1, "packaging_config": 1}
        ):
            pkgs = ((s.get("packaging_config") or {}).get("stock_out") or [])
            if pkgs:
                pkg = next((p for p in pkgs if p.get("is_default")), pkgs[0])
                sku_packaging[s["id"]] = int(pkg.get("units_per_package") or 0) or None

    def _addr_brief(src):
        if not isinstance(src, dict):
            return {}
        return {
            "address_line1": src.get("address_line1") or src.get("address_line_1"),
            "city": src.get("city"),
            "state": src.get("state"),
            "pincode": src.get("pincode"),
        }

    trimmed = []
    for d in eligible:
        acct = accounts_by_id.get(d.get("account_id")) or {}
        addr = d.get("delivery_address") if isinstance(d.get("delivery_address"), dict) and d.get("delivery_address") else None
        if not addr or not any(addr.values()):
            addr = acct.get("delivery_address") or acct.get("billing_address")
        stats = item_stats.get(d["id"], {"count": 0, "qty_units": 0})
        # Compute total packages by summing each line's packages (round-up).
        total_packages = 0
        for sku_line in line_skus.get(d["id"], []):
            upp = sku_packaging.get(sku_line.get("sku_id"))
            qty = sku_line["quantity"]
            total_packages += (-(-qty // upp)) if (upp and upp > 0) else qty
        trimmed.append({
            "id": d.get("id"),
            "delivery_number": d.get("delivery_number"),
            "customer_name": d.get("account_name") or d.get("customer_name") or acct.get("account_name"),
            "account_id": d.get("account_id"),
            "delivery_address": _addr_brief(addr),
            "contact_phone": d.get("contact_phone") or d.get("delivery_contact_phone") or acct.get("delivery_contact_phone") or acct.get("contact_number"),
            "items_count": stats["count"] or len(d.get("items") or []),
            "total_quantity": total_packages or stats["qty_units"] or d.get("total_quantity") or 0,
        })

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
    if existing.get("status") in ("cancelled", "approved"):
        raise HTTPException(status_code=400, detail=f"{existing.get('status').title()} schedules cannot be edited")

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
    if existing.get("status") in ("cancelled", "approved"):
        raise HTTPException(status_code=400, detail=f"{existing.get('status').title()} schedules cannot be edited")

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
    bad_status = [r["id"] for r in rows if r.get("status") not in ("confirmed", "scheduled", "delivery_assigned")]
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
    newly_added = [d for d in new_ids if d not in current]
    now_iso = datetime.now(timezone.utc).isoformat()

    # Status flow side-effects for newly attached deliveries:
    #   - If schedule is already APPROVED → bump straight to `delivery_scheduled`.
    #   - Otherwise (draft/confirmed schedule) → mark as `delivery_assigned` so
    #     the stock-out screen surfaces "attached to schedule" state.
    if newly_added:
        target_status = "delivery_scheduled" if existing.get("status") == "approved" else "delivery_assigned"
        await db.distributor_deliveries.update_many(
            {"tenant_id": tenant_id, "id": {"$in": newly_added}, "status": "confirmed"},
            {"$set": {"status": target_status, "updated_at": now_iso}}
        )
        # If schedule is approved, also lift any deliveries that were only `delivery_assigned`
        if existing.get("status") == "approved":
            await db.distributor_deliveries.update_many(
                {"tenant_id": tenant_id, "id": {"$in": newly_added}, "status": "delivery_assigned"},
                {"$set": {"status": "delivery_scheduled", "updated_at": now_iso}}
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
    if existing.get("status") in ("cancelled", "approved"):
        raise HTTPException(status_code=400, detail=f"{existing.get('status').title()} schedules cannot be edited")

    ids = [d for d in (existing.get("delivery_ids") or []) if d != delivery_id]
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.distributor_delivery_schedules.update_one(
        {"id": schedule_id, "tenant_id": tenant_id},
        {"$set": {"delivery_ids": ids, "updated_at": now_iso}}
    )

    # Revert the detached delivery's status back to `confirmed` so it can be
    # re-attached elsewhere. We accept any of the intermediate states the
    # schedule could have advanced it to.
    await db.distributor_deliveries.update_one(
        {
            "tenant_id": tenant_id,
            "id": delivery_id,
            "status": {"$in": ["delivery_assigned", "delivery_scheduled", "scheduled"]},
        },
        {"$set": {"status": "confirmed", "updated_at": now_iso}}
    )

    s = await db.distributor_delivery_schedules.find_one({"id": schedule_id, "tenant_id": tenant_id}, {"_id": 0})
    return await _enrich_schedule(s, tenant_id)


@router.post("/{schedule_id}/confirm")
async def confirm_schedule(schedule_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Move schedule from `draft` → `confirmed`. Stock-out statuses are NOT changed
    here — that happens on the subsequent `approve` step (the user wanted a
    two-step submit-then-approve workflow before the driver actually leaves).

    Zoho Books invoices are generated at THIS step (one per attached delivery)
    so the invoice link is ready by the time the driver starts the run.
    """
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
            "confirmed_by_name": current_user.get("full_name") or current_user.get("name") or current_user.get("email"),
            "updated_at": now,
        }}
    )

    # Schedule Zoho invoice push for every delivery attached to this schedule.
    # We swallow ZohoPushSkippedError (non-factory warehouse, account not linked,
    # etc.) so the schedule confirmation never fails because of an integration
    # issue on a single delivery. The retry endpoint surfaces specific errors.
    delivery_ids = existing.get("delivery_ids") or []

    async def _safe_zoho_sync_all():
        from services.zoho_service import sync_delivery_to_zoho, ZohoPushSkippedError
        for did in delivery_ids:
            try:
                # Skip deliveries that already have an invoice on Zoho.
                d = await db.distributor_deliveries.find_one(
                    {"id": did, "tenant_id": tenant_id},
                    {"_id": 0, "zoho_invoice_id": 1}
                )
                if d and d.get("zoho_invoice_id"):
                    continue
                await sync_delivery_to_zoho(tenant_id, distributor_id, did)
            except ZohoPushSkippedError as skip:
                logger.info(f"Zoho push skipped for delivery {did}: {skip}")
            except Exception:
                logger.exception(f"Zoho sync background task failed for delivery {did}")

    try:
        background_tasks.add_task(_safe_zoho_sync_all)
    except Exception as e:
        logger.warning(f"Failed to schedule Zoho sync for schedule {schedule_id}: {e}")

    s = await db.distributor_delivery_schedules.find_one({"id": schedule_id, "tenant_id": tenant_id}, {"_id": 0})
    return await _enrich_schedule(s, tenant_id)


@router.post("/{schedule_id}/approve")
async def approve_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    """Move schedule from `confirmed` → `approved`. Underlying stock-outs move
    from `confirmed` → `scheduled` at this step. Approver name + timestamp are
    recorded for the driver PDF header."""
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    existing = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if existing.get("status") != "confirmed":
        raise HTTPException(status_code=400, detail="Only confirmed schedules can be approved")
    if not existing.get("delivery_ids"):
        raise HTTPException(status_code=400, detail="No deliveries on this schedule to approve")

    now = datetime.now(timezone.utc).isoformat()
    approver_name = (
        current_user.get("full_name")
        or current_user.get("name")
        or current_user.get("email")
        or "Unknown approver"
    )
    await db.distributor_delivery_schedules.update_one(
        {"id": schedule_id, "tenant_id": tenant_id},
        {"$set": {
            "status": "approved",
            "approved_at": now,
            "approved_by": current_user.get("id"),
            "approved_by_name": approver_name,
            "updated_at": now,
        }}
    )
    # Move underlying deliveries to `delivery_scheduled`. We accept legacy
    # `confirmed`/`scheduled` rows AND the new `delivery_assigned` state.
    await db.distributor_deliveries.update_many(
        {
            "tenant_id": tenant_id,
            "id": {"$in": existing["delivery_ids"]},
            "status": {"$in": ["confirmed", "delivery_assigned", "scheduled"]},
        },
        {"$set": {"status": "delivery_scheduled", "updated_at": now}}
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
    # Revert any non-terminal underlying deliveries back to `confirmed` so they
    # can be re-attached elsewhere.
    if existing.get("delivery_ids"):
        await db.distributor_deliveries.update_many(
            {
                "tenant_id": tenant_id,
                "id": {"$in": existing["delivery_ids"]},
                "status": {"$in": ["scheduled", "delivery_scheduled", "delivery_assigned", "on_the_way"]},
            },
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
    if s.get("status") not in ("confirmed", "approved"):
        raise HTTPException(status_code=400, detail="PDF is only available for confirmed or approved schedules")

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


@router.get("/{schedule_id}/bundle-pdf")
async def download_schedule_bundle_pdf(
    schedule_id: str,
    inline: bool = True,
    current_user: dict = Depends(get_current_user),
):
    """Combined PDF for a schedule: page 1 = the driver schedule sheet,
    pages 2..N = one page per attached Zoho invoice. Useful when the
    distributor wants to hand the driver a single printed bundle.

    Query params:
        inline=true  → Content-Disposition: inline (default; opens in browser
                        and is what the front-end uses for the Print action).
        inline=false → attachment (forces download).
    """
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    s = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if s.get("status") not in ("confirmed", "approved", "in_progress", "completed"):
        raise HTTPException(
            status_code=400,
            detail="Bundle PDF is only available once the schedule has been confirmed."
        )

    s = await _enrich_schedule(s, tenant_id)
    dist = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id},
        {"_id": 0, "distributor_name": 1, "distributor_code": 1}
    ) or {}

    # 1) Driver schedule sheet (always page 1).
    schedule_pdf = _build_schedule_pdf(s, dist)

    # 2) Per-delivery Zoho invoices. Best-effort: invoices that fail to
    #    fetch (no zoho_invoice_id, fetch error, distributor-billed account)
    #    are skipped and recorded in a warnings header on the response.
    from services.zoho_service import fetch_invoice_pdf, ZohoApiError
    invoice_pdfs: list[bytes] = []
    skipped: list[str] = []
    for delv in (s.get("deliveries") or []):
        zoho_id = delv.get("zoho_invoice_id")
        label = delv.get("customer_name") or delv.get("delivery_number") or delv.get("id")
        if not zoho_id:
            # Either it's distributor-billed (no Zoho invoice expected) or
            # the Zoho push failed/hasn't run yet.
            if (delv.get("account_billed_by") or "company") == "distributor":
                skipped.append(f"{label} (distributor-billed)")
            else:
                skipped.append(f"{label} (no invoice yet)")
            continue
        try:
            pdf_bytes, _ = await fetch_invoice_pdf(tenant_id, zoho_id)
            invoice_pdfs.append(pdf_bytes)
        except ZohoApiError as e:
            logger.warning(f"Bundle: skipping invoice {zoho_id} for {label}: Zoho {e.status_code} — {e.message[:200] if e.message else ''}")
            skipped.append(f"{label} (Zoho {e.status_code})")
        except Exception as e:
            logger.warning(f"Bundle: skipping invoice {zoho_id} for {label}: {e}")
            skipped.append(f"{label} (fetch failed)")

    # 3) Stitch them together with pypdf.
    from pypdf import PdfReader, PdfWriter
    writer = PdfWriter()
    for source_bytes in [schedule_pdf, *invoice_pdfs]:
        try:
            reader = PdfReader(io.BytesIO(source_bytes))
            for page in reader.pages:
                writer.add_page(page)
        except Exception as e:
            logger.warning(f"Bundle: failed to read a source PDF, skipping it. {e}")

    out = io.BytesIO()
    writer.write(out)
    out.seek(0)

    filename = f"delivery-bundle-{s.get('schedule_date')}.pdf"
    disposition = "inline" if inline else "attachment"
    return StreamingResponse(
        out,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            # Surface skipped stops so the UI (or future automation) can warn the user.
            "X-Bundle-Schedule-Pages": "1",
            "X-Bundle-Invoice-Pages": str(len(invoice_pdfs)),
            "X-Bundle-Skipped": ("; ".join(skipped).encode("ascii", "replace").decode("ascii")) if skipped else "",
        },
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
    info_rows = [
        [Paragraph("<b>Vehicle</b>", body),
         Paragraph(f"{v.get('registration_number') or '—'} <font color='grey'>· {v.get('vehicle_name') or v.get('vehicle_type') or ''}</font>", body)],
        [Paragraph("<b>Driver</b>", body),
         Paragraph(f"{d.get('full_name') or '—'} <font color='grey'>· {d.get('phone') or ''}</font>", body)],
        [Paragraph("<b>Total stops</b>", body),
         Paragraph(str(len(schedule.get("deliveries") or [])), body)],
    ]
    # Approver line (only on approved schedules)
    if schedule.get("approved_at"):
        try:
            approved_dt = datetime.fromisoformat(str(schedule["approved_at"]).replace("Z", "+00:00"))
            stamp = approved_dt.strftime("%d %b %Y, %H:%M UTC")
        except Exception:
            stamp = str(schedule.get("approved_at"))
        approver = schedule.get("approved_by_name") or "—"
        info_rows.append([
            Paragraph("<b>Approved by</b>", body),
            Paragraph(f"{approver} <font color='grey'>· {stamp}</font>", body),
        ])

    t = Table(info_rows, colWidths=[35 * mm, None])
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
        Paragraph("<b>Customer · Delivery contact</b>", body),
        Paragraph("<b>Address</b>", body),
        Paragraph("<b>Crates / packages</b>", body),
    ]
    rows = [header]
    for idx, delv in enumerate(schedule.get("deliveries") or [], start=1):
        addr = delv.get("delivery_address") or {}
        addr_str = (addr.get("formatted") or ", ".join([x for x in (
            addr.get("address_line1"), addr.get("address_line2"),
            addr.get("city"), addr.get("state"), addr.get("pincode")
        ) if x])) or "—"
        items_lines = []
        for it in (delv.get("items") or []):
            pkg = it.get("packaging_label") or "Crate"
            items_lines.append(
                f"{(it.get('sku_name') or '—')} — <b>{it.get('quantity') or 0}</b> "
                f"<font color='grey' size='8'>{pkg}</font>"
            )
        items_str = "<br/>".join(items_lines) or "—"

        # Delivery contact block: prefer dedicated delivery_contact_* (the
        # on-ground person), fall back to the legacy `contact_phone`.
        dc_name = delv.get("delivery_contact_name")
        dc_phone = delv.get("delivery_contact_phone") or delv.get("contact_phone")
        contact_lines = [f"<b>{delv.get('customer_name') or '—'}</b>"]
        if dc_name or dc_phone:
            contact_bits = []
            if dc_name:
                contact_bits.append(f"<font color='#1f2937'>{dc_name}</font>")
            if dc_phone:
                contact_bits.append(f"<font color='#1f2937'>{dc_phone}</font>")
            contact_lines.append(" · ".join(contact_bits))
        if delv.get("delivery_number"):
            contact_lines.append(
                f"<font color='grey' size='8'>{delv.get('delivery_number')}</font>"
            )

        rows.append([
            Paragraph(str(idx), body),
            Paragraph("<br/>".join(contact_lines), body),
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


# ============ Distance computation =============================================

@router.get("/{schedule_id}/distance")
async def compute_schedule_distance(schedule_id: str, current_user: dict = Depends(get_current_user)):
    """Computes the full route distance: distributor → stop1 → stop2 → ... → stopN → factory.
    Uses Google Maps Distance Matrix. Returns per-leg + total km. Graceful degradation if a
    leg's address is missing or the API call fails."""
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    s = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")

    s = await _enrich_schedule(s, tenant_id)
    distributor_origin = await _get_distributor_origin(distributor_id, tenant_id)
    api_key_present = bool(os.environ.get("GOOGLE_MAPS_API_KEY"))

    # Build round-trip route: distributor warehouse → stop 1 → ... → stop N → distributor warehouse.
    # The driver always returns to the same warehouse, so total km includes the
    # outbound first leg AND the return-to-base last leg.
    stops: List[dict] = []
    if distributor_origin:
        stops.append({"label": "Distributor warehouse", "address": distributor_origin})
    for delv in s.get("deliveries") or []:
        stops.append({
            "label": delv.get("customer_name") or "Stop",
            "delivery_id": delv.get("id"),
            "address": _address_to_query(delv.get("delivery_address")),
        })
    if distributor_origin and s.get("deliveries"):
        stops.append({"label": "Back to warehouse", "address": distributor_origin, "is_return": True})

    warnings: List[str] = []
    if not api_key_present:
        warnings.append("Google Maps API key not configured.")
    if not distributor_origin:
        warnings.append("Distributor primary location address missing — distance cannot be measured. Set it in distributor settings.")

    legs: List[dict] = []
    total_km = 0.0

    for i in range(len(stops) - 1):
        origin = stops[i].get("address")
        dest = stops[i + 1].get("address")
        leg = {
            "from": stops[i].get("label"),
            "to": stops[i + 1].get("label"),
            "to_delivery_id": stops[i + 1].get("delivery_id"),
            "km": None,
            "duration_min": None,
            "status": "skipped",
        }
        if not api_key_present:
            leg["status"] = "no_api_key"
            legs.append(leg)
            continue
        if not origin or not dest:
            leg["status"] = "address_missing"
            legs.append(leg)
            continue
        data = await _distance_matrix([origin], [dest])
        if not data or not isinstance(data, list) or not data:
            leg["status"] = "api_error"
            legs.append(leg)
            continue
        try:
            elem = data[0]  # one origin × one destination
            if elem.get("status") and elem["status"].get("code"):
                # Non-OK status from Routes API
                leg["status"] = "api_error"
                legs.append(leg)
                continue
            distance_m = elem.get("distanceMeters")
            duration_s = elem.get("duration")  # string like "1234s"
            if distance_m is None:
                leg["status"] = elem.get("condition", "no_route").lower()
                legs.append(leg)
                continue
            leg["km"] = round(distance_m / 1000.0, 1)
            if isinstance(duration_s, str) and duration_s.endswith("s"):
                try:
                    leg["duration_min"] = round(int(duration_s[:-1]) / 60.0)
                except ValueError:
                    pass
            leg["status"] = "ok"
            total_km += leg["km"]
        except Exception as e:
            logger.warning(f"Failed to parse Routes API row: {e}")
            leg["status"] = "api_error"
        legs.append(leg)

    return {
        "legs": legs,
        "total_km": round(total_km, 1),
        "warnings": warnings,
        "distributor_origin": distributor_origin,
    }


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


# ============ Live tracking (Distributor & Admin view) =========================
@router.get("/{schedule_id}/tracking")
async def get_schedule_tracking(
    schedule_id: str,
    since: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Return GPS breadcrumbs for a schedule. Visible to:
      • the owning Distributor user,
      • any tenant admin / non-Driver role with a Distribution context.
    Optional `since` (ISO timestamp) returns only newer points (polling-friendly)."""
    tenant_id = get_current_tenant_id()
    role = (current_user.get("role") or "").strip()

    # Authorise — owning distributor OR admin-ish role.
    s = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")

    if role == "Distributor":
        if current_user.get("distributor_id") != s.get("distributor_id"):
            raise HTTPException(status_code=403, detail="Not your schedule")
    elif role == "Driver":
        if current_user.get("driver_id") != s.get("driver_id"):
            raise HTTPException(status_code=403, detail="Not your schedule")
    # Other roles (CEO/Director/Admin/System Admin/Sales/etc.) can read tracking.

    q: dict = {"tenant_id": tenant_id, "schedule_id": schedule_id}
    if since:
        q["recorded_at"] = {"$gt": since}
    pings = await db.driver_tracking_pings.find(
        q, {"_id": 0, "id": 1, "lat": 1, "lng": 1, "recorded_at": 1, "speed_kmh": 1, "heading": 1}
    ).sort("recorded_at", 1).to_list(2000)

    latest = pings[-1] if pings else None
    # Fetch GPS interval for client polling cadence.
    t = await db.tenants.find_one({"tenant_id": tenant_id}, {"_id": 0, "settings": 1})
    interval = ((t or {}).get("settings") or {}).get("gps_ping_interval_minutes") or 5

    return {
        "schedule_id": schedule_id,
        "status": s.get("status"),
        "tracking_active": bool(s.get("tracking_active")) and s.get("status") == "in_progress",
        "started_at": s.get("started_at"),
        "ended_at": s.get("ended_at"),
        "gps_ping_interval_minutes": int(interval),
        "pings": pings,
        "latest": latest,
        "total": len(pings),
    }



# ============ Route optimisation (nearest-neighbour heuristic) =================

class OptimizeRoutePayload(BaseModel):
    apply: bool = False  # when True, persist the new delivery_ids order


@router.post("/{schedule_id}/optimize-route")
async def optimize_route(
    schedule_id: str,
    payload: OptimizeRoutePayload,
    current_user: dict = Depends(get_current_user),
):
    """Greedy nearest-neighbour over Google Routes distance matrix.

    Starts at the distributor's primary warehouse and at each step picks the
    UNVISITED stop closest to the current position. Returns the suggested order
    (with total km before/after) and, if `apply=true` and the schedule is
    editable, persists the new order to `delivery_ids`.

    Falls back gracefully when the API key or a stop address is missing — those
    stops are appended in their original order at the end.
    """
    tenant_id = get_current_tenant_id()
    distributor_id = _resolve_distributor_id(current_user)
    s = await db.distributor_delivery_schedules.find_one(
        {"id": schedule_id, "tenant_id": tenant_id, "distributor_id": distributor_id},
        {"_id": 0}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if payload.apply and s.get("status") in ("approved", "in_progress", "completed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Cannot reorder a {s.get('status')} schedule")
    if not s.get("delivery_ids"):
        raise HTTPException(status_code=400, detail="No deliveries attached to this schedule")

    enriched = await _enrich_schedule(s, tenant_id)
    origin = await _get_distributor_origin(distributor_id, tenant_id)
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")

    stops = [
        {
            "delivery_id": d["id"],
            "label": d.get("customer_name") or "Stop",
            "address": _address_to_query(d.get("delivery_address")),
        }
        for d in enriched.get("deliveries") or []
    ]
    original_order = [stop["delivery_id"] for stop in stops]

    warnings: List[str] = []
    if not api_key:
        warnings.append("Google Maps API key not configured — route was not optimised.")
    if not origin:
        warnings.append("Distributor primary location address missing — set it in distributor settings.")

    # Without an API key OR origin we can't compute anything meaningful — bail
    # out keeping the original order (no error, just a warning).
    if not api_key or not origin:
        return {
            "original_order": original_order,
            "optimized_order": original_order,
            "original_total_km": None,
            "optimized_total_km": None,
            "savings_km": None,
            "applied": False,
            "warnings": warnings,
        }

    # Address-having stops we can plug into the matrix; the rest get appended in
    # their original sequence at the end of the optimised list.
    addressed = [stop for stop in stops if stop["address"]]
    unaddressed = [stop for stop in stops if not stop["address"]]
    if unaddressed:
        warnings.append(f"{len(unaddressed)} stop(s) missing addresses — kept in original order at the end.")

    # Compute the full N+1 × N+1 matrix (warehouse + every addressed stop) in
    # ONE Routes API call. Free tier allows up to 25×25; for now we keep this
    # simple and assume a tenant won't push past that on a single delivery run.
    points = [origin] + [stop["address"] for stop in addressed]
    matrix_raw = await _distance_matrix(points, points)
    if not matrix_raw or not isinstance(matrix_raw, list):
        warnings.append("Distance Matrix API call failed — route was not optimised.")
        return {
            "original_order": original_order,
            "optimized_order": original_order,
            "original_total_km": None,
            "optimized_total_km": None,
            "savings_km": None,
            "applied": False,
            "warnings": warnings,
        }

    n = len(points)
    INF = float("inf")
    dist = [[INF] * n for _ in range(n)]
    for elem in matrix_raw:
        oi = elem.get("originIndex")
        di = elem.get("destinationIndex")
        if oi is None or di is None:
            continue
        m = elem.get("distanceMeters")
        if m is None:
            continue
        dist[oi][di] = m / 1000.0

    def total_km(order_indices: List[int]) -> float:
        """Round-trip total km: warehouse → stops in order → warehouse."""
        if not order_indices:
            return 0.0
        prev = 0  # warehouse
        total = 0.0
        for idx in order_indices:
            d = dist[prev][idx]
            if d == INF:
                return float("inf")
            total += d
            prev = idx
        # back to warehouse
        d_back = dist[prev][0]
        if d_back == INF:
            return float("inf")
        return total + d_back

    # Original order's km (only for the addressed subset, mirrors what the
    # optimiser will produce — fair apples-to-apples comparison).
    original_indices = list(range(1, n))  # stops are at indices 1..n-1 in input order
    original_total = total_km(original_indices)

    # Greedy nearest-neighbour
    unvisited = set(range(1, n))
    current = 0  # warehouse
    optimised_indices: List[int] = []
    while unvisited:
        best, best_d = None, INF
        for v in unvisited:
            if dist[current][v] < best_d:
                best, best_d = v, dist[current][v]
        if best is None:
            break
        optimised_indices.append(best)
        unvisited.remove(best)
        current = best
    optimised_total = total_km(optimised_indices)

    # Safety: nearest-neighbour can produce a route worse than the original. If
    # that happens we keep the original order so the UI never offers to swap to
    # a longer path.
    if original_total != float("inf") and optimised_total > original_total:
        optimised_indices = original_indices
        optimised_total = original_total
        warnings.append("Original order was already shorter than the heuristic — kept as-is.")

    # Map matrix indices back to delivery_ids; unaddressed stops trail at the end.
    optimised_order = [addressed[i - 1]["delivery_id"] for i in optimised_indices]
    optimised_order.extend(stop["delivery_id"] for stop in unaddressed)

    applied = False
    if payload.apply and optimised_order != original_order:
        await db.distributor_delivery_schedules.update_one(
            {"id": schedule_id, "tenant_id": tenant_id},
            {"$set": {
                "delivery_ids": optimised_order,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        applied = True

    def _km(v):
        return None if v in (None, float("inf")) else round(v, 1)

    return {
        "original_order": original_order,
        "optimized_order": optimised_order,
        "original_total_km": _km(original_total),
        "optimized_total_km": _km(optimised_total),
        "savings_km": _km(original_total - optimised_total) if (original_total != float("inf") and optimised_total != float("inf")) else None,
        "applied": applied,
        "warnings": warnings,
    }

