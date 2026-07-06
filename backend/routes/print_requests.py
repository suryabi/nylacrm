"""Print Request module.

A print request is created from a Final-Approved design (marketing) request and
moves through a tenant-configurable linear status flow.

Routes (mounted at /print-requests):
  GET    /                          list (filters, pagination, sort)
  GET    /{id}                      fetch one
  POST   /                          create from a design request
  PATCH  /{id}                      edit quantity / due date / notes / assignment / vendor
  PATCH  /{id}/status               change status (records history)
  DELETE /{id}                      delete (admin or print_requests.delete)
"""
import logging
import re
import uuid
from datetime import datetime, timezone, date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from utils.sm_helpers import _is_admin

from models.print_request import (
    PrintRequestCreate, PrintRequestUpdate, PrintStatusChange, PrintStoredFile,
)
from routes.print_masters import seed_default_statuses

try:
    from routes.slack import post_event_message as slack_post_event
except Exception:  # pragma: no cover
    slack_post_event = None

logger = logging.getLogger(__name__)
router = APIRouter()

# A print request can be raised once the design is Final Approved, and onwards.
FINAL_APPROVED_STATES = {"final_approved", "production_in_progress", "production_completed"}


# ──────────────────────────────── helpers ────────────────────────────────
async def _next_print_number(tenant_id: str) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"PR-{year}-"
    latest = await db.print_requests.find_one(
        {"tenant_id": tenant_id, "print_number": {"$regex": f"^{prefix}"}},
        {"_id": 0, "print_number": 1},
        sort=[("print_number", -1)],
    )
    next_num = 1
    if latest and latest.get("print_number"):
        try:
            next_num = int(latest["print_number"].split("-")[-1]) + 1
        except (ValueError, IndexError):
            pass
    return f"{prefix}{next_num:04d}"


def _slim_file(f: dict) -> dict:
    return PrintStoredFile(
        id=f.get("id"),
        filename=f.get("filename") or "file",
        path=f.get("path") or "",
        size=f.get("size") or 0,
        content_type=f.get("content_type"),
    ).model_dump()


async def _initial_status(tenant_id: str) -> Optional[dict]:
    await seed_default_statuses(tenant_id)
    active = await db.print_request_statuses.find(
        {"tenant_id": tenant_id, "is_active": {"$ne": False}}, {"_id": 0}
    ).sort("order", 1).to_list(200)
    if not active:
        return None
    for s in active:
        if s.get("is_initial"):
            return s
    return active[0]


async def _ensure_submitted_status(tenant_id: str) -> Optional[dict]:
    """Return the tenant's 'Submitted' print status, creating it if missing.
    Print Requests raised from Customer Branding start in this status."""
    await seed_default_statuses(tenant_id)
    existing = await db.print_request_statuses.find_one(
        {"tenant_id": tenant_id, "name": "Submitted"}, {"_id": 0}
    )
    if existing:
        return existing
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": "Submitted",
        "color": "#3b82f6",
        "order": 0,
        "is_initial": False,
        "is_terminal": False,
        "is_default": False,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.print_request_statuses.insert_one(dict(doc))
    return doc


def _slack_lead_line(doc: dict) -> str:
    name = (doc.get("lead_name") or "").strip()
    company = (doc.get("lead_company") or "").strip()
    if company and name and company != name:
        return f"\n:bust_in_silhouette: Lead: {company} — {name}"
    label = company or name
    return f"\n:bust_in_silhouette: Lead: {label}" if label else ""


async def _can_delete(tenant_id: str, user: dict) -> bool:
    if _is_admin(user):
        return True
    role_name = (user.get("role") or "").strip()
    if not role_name:
        return False
    role = await db.roles.find_one(
        {"tenant_id": tenant_id, "name": {"$regex": f"^{re.escape(role_name)}$", "$options": "i"}},
        {"_id": 0, "permissions": 1},
    )
    perms = (role or {}).get("permissions") or {}
    return bool((perms.get("print_requests") or {}).get("delete"))


# ──────────────────────────────── list ────────────────────────────────
async def _lead_ids_in_city(tenant_id: str, city: str) -> List[str]:
    """Lead UUIDs whose city matches (case-insensitive)."""
    rx = {"$regex": f"^{re.escape(city.strip())}$", "$options": "i"}
    ids = []
    async for l in db.leads.find({"tenant_id": tenant_id, "city": rx}, {"_id": 0, "id": 1}):
        ids.append(l["id"])
    return ids


async def _build_list_query(
    tenant_id: str, search: Optional[str], city: Optional[str],
    status_id: Optional[str], status_ids: Optional[str],
    vendor_id: Optional[str], assigned_department_id: Optional[str],
    include_status: bool = True,
) -> dict:
    q: dict = {"tenant_id": tenant_id}
    if include_status:
        ids = [s.strip() for s in (status_ids or "").split(",") if s.strip()]
        if ids:
            q["status_id"] = {"$in": ids}
        elif status_id:
            q["status_id"] = status_id
    if vendor_id:
        q["vendor_id"] = vendor_id
    if assigned_department_id:
        q["assigned_department_id"] = assigned_department_id
    if city:
        lead_ids = await _lead_ids_in_city(tenant_id, city)
        q["lead_id"] = {"$in": lead_ids or ["__none__"]}
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        q["$or"] = [
            {"print_number": rx}, {"source_request_number": rx},
            {"lead_company": rx}, {"lead_name": rx}, {"source_title": rx},
            {"vendor_name": rx},
        ]
    return q


async def _attach_lead_city(items: List[dict], tenant_id: str):
    lead_ids = list({it.get("lead_id") for it in items if it.get("lead_id")})
    city_by_lead = {}
    if lead_ids:
        async for l in db.leads.find(
            {"id": {"$in": lead_ids}, "tenant_id": tenant_id}, {"_id": 0, "id": 1, "city": 1}
        ):
            city_by_lead[l["id"]] = l.get("city")
    for it in items:
        it["lead_city"] = city_by_lead.get(it.get("lead_id"))


@router.get("")
@router.get("/")
async def list_print_requests(
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    status_id: Optional[str] = None,
    status_ids: Optional[str] = None,
    city: Optional[str] = None,
    vendor_id: Optional[str] = None,
    assigned_department_id: Optional[str] = None,
    sort: str = "-created_at",
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    q = await _build_list_query(tenant_id, search, city, status_id, status_ids, vendor_id, assigned_department_id)

    field = sort[1:] if sort.startswith("-") else sort
    direction = -1 if sort.startswith("-") else 1

    total = await db.print_requests.count_documents(q)
    page = max(1, int(page))
    limit = max(1, min(100, int(limit)))
    items = await (
        db.print_requests.find(q, {"_id": 0})
        .sort(field, direction)
        .skip((page - 1) * limit)
        .limit(limit)
        .to_list(limit)
    )
    await _attach_lead_city(items, tenant_id)
    pages = (total + limit - 1) // limit
    return {"items": items, "total": total, "page": page, "pages": pages, "limit": limit}


@router.get("/facets")
async def print_request_facets(
    search: Optional[str] = None,
    city: Optional[str] = None,
    vendor_id: Optional[str] = None,
    assigned_department_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Per-status counts (for the metric tiles) + the list of lead cities available
    to filter by. Counts respect search/city/vendor filters but NOT the status
    selection, so the tiles always reflect the full breakdown."""
    tenant_id = get_current_tenant_id()
    q = await _build_list_query(
        tenant_id, search, city, None, None, vendor_id, assigned_department_id, include_status=False
    )
    status_counts: dict = {}
    total = 0
    async for row in db.print_requests.aggregate([
        {"$match": q}, {"$group": {"_id": "$status_id", "count": {"$sum": 1}}},
    ]):
        status_counts[row["_id"] or "__none"] = row["count"]
        total += row["count"]

    lead_ids = await db.print_requests.distinct("lead_id", {"tenant_id": tenant_id})
    lead_ids = [lid for lid in lead_ids if lid]
    cities = set()
    if lead_ids:
        async for l in db.leads.find(
            {"id": {"$in": lead_ids}, "tenant_id": tenant_id}, {"_id": 0, "city": 1}
        ):
            if l.get("city"):
                cities.add(l["city"])
    return {"status_counts": status_counts, "total": total, "cities": sorted(cities)}


@router.get("/export")
async def export_print_requests(
    search: Optional[str] = None,
    status_id: Optional[str] = None,
    status_ids: Optional[str] = None,
    city: Optional[str] = None,
    vendor_id: Optional[str] = None,
    assigned_department_id: Optional[str] = None,
    sort: str = "-created_at",
    current_user: dict = Depends(get_current_user),
):
    """CSV export of the print requests matching the current filters (no pagination)."""
    import csv
    import io
    from fastapi.responses import StreamingResponse

    tenant_id = get_current_tenant_id()
    q = await _build_list_query(tenant_id, search, city, status_id, status_ids, vendor_id, assigned_department_id)
    field = sort[1:] if sort.startswith("-") else sort
    direction = -1 if sort.startswith("-") else 1
    rows = await db.print_requests.find(q, {"_id": 0}).sort(field, direction).to_list(10000)
    await _attach_lead_city(rows, tenant_id)

    def fmt_date(v):
        return (v or "")[:10] if isinstance(v, str) else ""

    columns = [
        ("Print #", "print_number"),
        ("Source Design #", "source_request_number"),
        ("Title", lambda r: r.get("source_title") or r.get("request_type_name") or ""),
        ("Lead", lambda r: r.get("lead_company") or r.get("lead_name") or ""),
        ("City", "lead_city"),
        ("Status", "status_name"),
        ("Initial Order Qty", lambda r: r.get("initial_order_quantity") or r.get("quantity") or ""),
        ("Initial Monthly Qty", "starting_monthly_volume"),
        ("Total Monthly Volume (Future Potential)", "total_monthly_volume"),
        ("Requested Delivery Date", lambda r: fmt_date(r.get("requested_due_date"))),
        ("Vendor", "vendor_name"),
        ("Production Team", "assigned_department_name"),
        ("Created By", "created_by_name"),
        ("Created At", lambda r: fmt_date(r.get("created_at"))),
    ]

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([c[0] for c in columns])
    for r in rows:
        writer.writerow([
            (c[1](r) if callable(c[1]) else r.get(c[1])) if (callable(c[1]) or r.get(c[1]) is not None) else ""
            for c in columns
        ])
    buf.seek(0)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=print_requests_{stamp}.csv"},
    )


@router.get("/{print_id}")
async def get_print_request(print_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.print_requests.find_one({"id": print_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Print request not found")
    return doc


# ──────────────────────────────── create ────────────────────────────────
@router.post("")
@router.post("/")
async def create_print_request(payload: PrintRequestCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()

    mr = await db.design_requests_new.find_one(
        {"id": payload.marketing_request_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not mr:
        mr = await db.marketing_requests.find_one(
            {"id": payload.marketing_request_id, "tenant_id": tenant_id}, {"_id": 0}
        )
    if not mr:
        raise HTTPException(404, "Design request not found")
    # A print request can be raised once the design request reaches a terminal
    # state of its state machine (fallback: the legacy Final-Approved set).
    cur_key = mr.get("current_state_key")
    is_terminal = False
    if mr.get("state_machine_id"):
        sm = await db.state_machines.find_one(
            {"id": mr["state_machine_id"], "tenant_id": tenant_id}, {"_id": 0, "states": 1}
        )
        if sm:
            is_terminal = any(
                s.get("key") == cur_key and s.get("is_terminal") for s in (sm.get("states") or [])
            )
    if not is_terminal and cur_key not in FINAL_APPROVED_STATES:
        raise HTTPException(400, "Print requests can only be created once the design request reaches a terminal (final) state.")

    order_qty = payload.initial_order_quantity if payload.initial_order_quantity is not None else payload.quantity
    if order_qty is None or int(order_qty) <= 0:
        raise HTTPException(400, "Initial order quantity must be a positive number")
    if payload.starting_monthly_volume is None:
        raise HTTPException(400, "Starting monthly volume (initial monthly quantity) is required")
    try:
        date.fromisoformat(payload.requested_due_date[:10])
    except (ValueError, TypeError):
        raise HTTPException(400, "requested_due_date must be an ISO date (YYYY-MM-DD)")

    # Approved design = the approved work version's files/links (fallback: production final files)
    approved_files: List[dict] = []
    approved_links: List[str] = []
    approved_version_no = None
    approved_version_id = None
    for v in (mr.get("versions") or []):
        if v.get("is_approved"):
            approved_version_id = v.get("id")
            approved_version_no = v.get("version_no")
            approved_files = [_slim_file(f) for f in (v.get("files") or []) if f.get("id")]
            approved_links = list(v.get("links") or [])
            break
    if not approved_files:
        prod = mr.get("production") or {}
        approved_files = [_slim_file(f) for f in (prod.get("final_approved_files") or []) if f.get("id")]
        approved_links = list(prod.get("final_approved_links") or [])

    dept = None
    if payload.assigned_department_id:
        dept = await db.master_departments.find_one(
            {"id": payload.assigned_department_id, "tenant_id": tenant_id}, {"_id": 0}
        )
        if not dept:
            raise HTTPException(400, "Assigned production team not found")
    vendor = None
    if payload.vendor_id:
        vendor = await db.print_vendors.find_one(
            {"id": payload.vendor_id, "tenant_id": tenant_id}, {"_id": 0}
        )
        if not vendor:
            raise HTTPException(400, "Vendor not found")

    # Account + Customer Branding association (resolved via the source lead)
    account = None
    lead_uuid = mr.get("lead_id")
    if lead_uuid:
        lead_doc = await db.leads.find_one(
            {"id": lead_uuid, "tenant_id": tenant_id}, {"_id": 0, "id": 1, "lead_id": 1}
        )
        or_ids = [x for x in [lead_uuid, (lead_doc or {}).get("lead_id")] if x]
        if or_ids:
            account = await db.accounts.find_one(
                {"tenant_id": tenant_id, "lead_id": {"$in": or_ids}}, {"_id": 0}
            )
    cdr_link = (mr.get("cdr_link") or "").strip() or None
    if cdr_link and cdr_link not in approved_links:
        approved_links = approved_links + [cdr_link]

    status = await _ensure_submitted_status(tenant_id)
    now = datetime.now(timezone.utc).isoformat()
    user_name = current_user.get("name") or current_user.get("email") or "User"

    doc = {
        "id": str(uuid.uuid4()),
        "print_number": await _next_print_number(tenant_id),
        "tenant_id": tenant_id,
        # source design request
        "source_marketing_request_id": mr["id"],
        "source_request_number": mr.get("request_number"),
        "source_title": mr.get("title"),
        "request_type_name": mr.get("request_type_name"),
        # lead (auto-captured)
        "lead_id": mr.get("lead_id"),
        "lead_name": mr.get("lead_name"),
        "lead_company": mr.get("lead_company"),
        # approved design (auto-captured)
        "approved_version_id": approved_version_id,
        "approved_version_no": approved_version_no,
        "approved_design_files": approved_files,
        "approved_design_links": approved_links,
        # account + customer-branding association
        "account_id": (account.get("id") if account else None),
        "account_name": (account.get("account_name") if account else None),
        "customer_branding_lead_id": lead_uuid,
        # CDR file link copied from the associated design request
        "cdr_link": cdr_link,
        # captured inputs
        "quantity": int(order_qty),
        "initial_order_quantity": int(order_qty),
        "total_monthly_volume": payload.total_monthly_volume,
        "starting_monthly_volume": payload.starting_monthly_volume,
        "requested_due_date": payload.requested_due_date[:10],
        "notes": (payload.notes or None),
        # assignment
        "assigned_department_id": dept["id"] if dept else None,
        "assigned_department_name": dept["name"] if dept else None,
        "vendor_id": vendor["id"] if vendor else None,
        "vendor_name": vendor["name"] if vendor else None,
        # status
        "status_id": status["id"] if status else None,
        "status_name": status["name"] if status else "New",
        "status_color": (status.get("color") if status else "#94a3b8"),
        "status_history": [{
            "status_id": status["id"] if status else None,
            "status_name": status["name"] if status else "New",
            "timestamp": now,
            "user_id": current_user.get("id"),
            "user_name": user_name,
            "note": "Print request created",
        }],
        "created_by": current_user.get("id"),
        "created_by_name": user_name,
        "created_at": now,
        "updated_at": now,
    }
    await db.print_requests.insert_one(doc)
    doc.pop("_id", None)

    if slack_post_event:
        try:
            await slack_post_event(
                tenant_id=tenant_id,
                event_type="print_request_created",
                text=(
                    f":printer: *New print request* `{doc['print_number']}`\n"
                    f"From design `{doc['source_request_number']}` · Qty: {doc['quantity']} · Due: {doc['requested_due_date']}"
                    + (f"\nVendor: {doc['vendor_name']}" if doc.get("vendor_name") else "")
                    + _slack_lead_line(doc)
                ),
            )
        except Exception:
            logger.exception("Slack notification failed for new print request")
    return doc


# ──────────────────────────────── update ────────────────────────────────
@router.patch("/{print_id}")
async def update_print_request(print_id: str, payload: PrintRequestUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.print_requests.find_one({"id": print_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Print request not found")

    upd: dict = {}
    if payload.initial_order_quantity is not None:
        if int(payload.initial_order_quantity) <= 0:
            raise HTTPException(400, "Initial order quantity must be a positive number")
        upd["initial_order_quantity"] = int(payload.initial_order_quantity)
        upd["quantity"] = int(payload.initial_order_quantity)
    elif payload.quantity is not None:
        if int(payload.quantity) <= 0:
            raise HTTPException(400, "Quantity must be a positive number")
        upd["quantity"] = int(payload.quantity)
    if payload.total_monthly_volume is not None:
        upd["total_monthly_volume"] = float(payload.total_monthly_volume)
    if payload.starting_monthly_volume is not None:
        upd["starting_monthly_volume"] = float(payload.starting_monthly_volume)
    if payload.requested_due_date is not None:
        try:
            upd["requested_due_date"] = date.fromisoformat(payload.requested_due_date[:10]).isoformat()
        except (ValueError, TypeError):
            raise HTTPException(400, "requested_due_date must be an ISO date (YYYY-MM-DD)")
    if payload.notes is not None:
        upd["notes"] = payload.notes or None
    if payload.assigned_department_id is not None:
        if payload.assigned_department_id == "":
            upd["assigned_department_id"] = None
            upd["assigned_department_name"] = None
        else:
            dept = await db.master_departments.find_one(
                {"id": payload.assigned_department_id, "tenant_id": tenant_id}, {"_id": 0}
            )
            if not dept:
                raise HTTPException(400, "Assigned production team not found")
            upd["assigned_department_id"] = dept["id"]
            upd["assigned_department_name"] = dept["name"]
    if payload.vendor_id is not None:
        if payload.vendor_id == "":
            upd["vendor_id"] = None
            upd["vendor_name"] = None
        else:
            vendor = await db.print_vendors.find_one(
                {"id": payload.vendor_id, "tenant_id": tenant_id}, {"_id": 0}
            )
            if not vendor:
                raise HTTPException(400, "Vendor not found")
            upd["vendor_id"] = vendor["id"]
            upd["vendor_name"] = vendor["name"]

    if not upd:
        raise HTTPException(400, "Nothing to update")
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.print_requests.update_one({"id": print_id, "tenant_id": tenant_id}, {"$set": upd})
    return await db.print_requests.find_one({"id": print_id, "tenant_id": tenant_id}, {"_id": 0})


# ──────────────────────────────── status change ────────────────────────────────
@router.patch("/{print_id}/status")
async def change_status(print_id: str, payload: PrintStatusChange, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.print_requests.find_one({"id": print_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Print request not found")
    status = await db.print_request_statuses.find_one(
        {"id": payload.status_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not status:
        raise HTTPException(400, "Status not found")

    now = datetime.now(timezone.utc).isoformat()
    user_name = current_user.get("name") or current_user.get("email") or "User"
    history_entry = {
        "status_id": status["id"],
        "status_name": status["name"],
        "timestamp": now,
        "user_id": current_user.get("id"),
        "user_name": user_name,
        "note": (payload.note or None),
    }
    await db.print_requests.update_one(
        {"id": print_id, "tenant_id": tenant_id},
        {
            "$set": {
                "status_id": status["id"],
                "status_name": status["name"],
                "status_color": status.get("color") or "#94a3b8",
                "updated_at": now,
            },
            "$push": {"status_history": history_entry},
        },
    )
    updated = await db.print_requests.find_one({"id": print_id, "tenant_id": tenant_id}, {"_id": 0})

    if slack_post_event:
        try:
            await slack_post_event(
                tenant_id=tenant_id,
                event_type="print_request_status_changed",
                text=(
                    f":printer: *{updated['print_number']}* → *{status['name']}*\n"
                    f"by {user_name}"
                    + (f"\n_{payload.note}_" if payload.note else "")
                    + _slack_lead_line(updated)
                ),
            )
        except Exception:
            logger.exception("Slack notification failed for print request status change")
    return updated


# ──────────────────────────────── delete ────────────────────────────────
@router.delete("/{print_id}")
async def delete_print_request(print_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.print_requests.find_one({"id": print_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Print request not found")
    if not await _can_delete(tenant_id, current_user):
        raise HTTPException(403, "You don't have permission to delete print requests.")
    # Note: approved design files are shared references owned by the source design
    # request, so we do NOT delete them from storage here.
    await db.print_requests.delete_one({"id": print_id, "tenant_id": tenant_id})
    return {"deleted": True, "id": print_id}
