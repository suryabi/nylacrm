"""
Customer Complaints module.

Track customer complaints linked to a Lead / Account / Distributor, against one
or more SKUs, with details, photo attachments (object storage) and a threaded
update/comment log.

Routes (mounted under /api/complaints)
  GET    /                          → paginated list (filters)
  GET    /meta/options              → enums + assignable users
  GET    /meta/entity-search        → search leads/accounts/distributors
  POST   /                          → create
  GET    /{id}                      → detail
  PUT    /{id}                      → update (fields / status / priority / assignment)
  DELETE /{id}                      → delete (admin)
  POST   /{id}/comments             → add an update/comment
  POST   /{id}/photos               → upload photo(s)
  GET    /{id}/photos/{photo_id}    → download a photo (auth header)
  DELETE /{id}/photos/{photo_id}    → soft-delete a photo
"""
import io
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from openpyxl import Workbook, load_workbook
from pydantic import BaseModel, Field

from deps import get_current_user
from core.tenant import get_current_tenant_id
from services.object_storage import build_path, guess_content_type, put_object, get_object

router = APIRouter(prefix="/complaints", tags=["Customer Complaints"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _client[os.environ["DB_NAME"]]

STATUSES = ["open", "in_progress", "awaiting_customer", "resolved", "closed"]
PRIORITIES = ["low", "medium", "high", "urgent"]
# CATEGORIES removed — category field deprecated (legacy docs may still carry it)
LINK_TYPES = ["lead", "account", "distributor"]
DEPARTMENTS = [
    "Admin", "Sales", "Production", "Marketing", "Finance",
    "Distribution", "HR", "IT", "Operations", "Quality",
]
ADMIN_ROLES = {"ceo", "admin", "system admin", "director"}

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"}
MAX_PHOTO_BYTES = 15 * 1024 * 1024  # 15 MB per photo


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Schemas ──────────────────────────────────────────────────────────────
class AssigneeRef(BaseModel):
    id: Optional[str] = None
    name: str


class ComplaintCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    details: str = Field("", max_length=5000)
    link_type: Optional[str] = None
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    distributor_id: Optional[str] = None
    customer_name: Optional[str] = None
    sku_ids: List[str] = []
    sku_names: List[str] = []
    priority: str = "medium"
    departments: List[str] = []
    category: Optional[str] = None
    city: Optional[str] = None
    assignees: List[AssigneeRef] = []


class ComplaintUpdate(BaseModel):
    title: Optional[str] = None
    details: Optional[str] = None
    link_type: Optional[str] = None
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    distributor_id: Optional[str] = None
    customer_name: Optional[str] = None
    sku_ids: Optional[List[str]] = None
    sku_names: Optional[List[str]] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    departments: Optional[List[str]] = None
    category: Optional[str] = None
    city: Optional[str] = None
    assignees: Optional[List[AssigneeRef]] = None


class CommentCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


# ── Helpers ──────────────────────────────────────────────────────────────
async def _next_complaint_number(tenant_id: str) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"CMP-{year}-"
    count = await _db.customer_complaints.count_documents({
        "tenant_id": tenant_id,
        "complaint_number": {"$regex": f"^{prefix}"},
    })
    return f"{prefix}{count + 1:04d}"


def _public(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _is_admin(user: dict) -> bool:
    return (user.get("role") or "").strip().lower() in ADMIN_ROLES


# ── Meta ─────────────────────────────────────────────────────────────────
@router.get("/meta/options")
async def get_options(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    users = await _db.users.find(
        {"tenant_id": tenant_id, "is_active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "role": 1},
    ).sort("name", 1).to_list(500)
    cats = await _db.task_categories.find(
        {"tenant_id": tenant_id, "is_active": True}, {"_id": 0, "name": 1},
    ).sort([("sort_order", 1), ("name", 1)]).to_list(500)
    return {
        "statuses": STATUSES,
        "priorities": PRIORITIES,
        "link_types": LINK_TYPES,
        "departments": DEPARTMENTS,
        "categories": [c["name"] for c in cats],
        "users": users,
    }


@router.get("/meta/cities")
async def entity_cities(link_type: str, current_user: dict = Depends(get_current_user)):
    """Distinct cities for the given entity type, to power the city filter."""
    tenant_id = get_current_tenant_id()
    coll = {"account": _db.accounts, "lead": _db.leads}.get(link_type)
    if coll is None:
        return {"cities": []}
    cities = await coll.distinct("city", {"tenant_id": tenant_id, "city": {"$nin": [None, ""]}})
    return {"cities": sorted({c for c in cities if c})}


@router.get("/meta/filter-cities")
async def filter_cities(current_user: dict = Depends(get_current_user)):
    """Distinct cities present on existing complaints — used by the list-page city filter."""
    tenant_id = get_current_tenant_id()
    cities = await _db.customer_complaints.distinct(
        "city", {"tenant_id": tenant_id, "city": {"$nin": [None, ""]}}
    )
    return {"cities": sorted({c for c in cities if c})}


@router.get("/meta/entity-search")
async def entity_search(
    link_type: str,
    q: str = "",
    city: str = "",
    current_user: dict = Depends(get_current_user),
):
    """Search leads / accounts / distributors for linking a complaint.

    An optional `city` narrows leads/accounts to that city."""
    tenant_id = get_current_tenant_id()
    q = (q or "").strip()
    city = (city or "").strip()
    results = []
    if link_type == "lead":
        query = {"tenant_id": tenant_id}
        if city:
            query["city"] = city
        if q:
            query["$or"] = [
                {"company": {"$regex": q, "$options": "i"}},
                {"lead_id": {"$regex": q, "$options": "i"}},
                {"contact_person": {"$regex": q, "$options": "i"}},
            ]
        rows = await _db.leads.find(query, {"_id": 0}).limit(20).to_list(20)
        results = [{"id": r["id"], "name": r.get("company") or r.get("contact_person") or "Lead",
                    "city": r.get("city"),
                    "subtitle": " · ".join([x for x in [r.get("lead_id"), r.get("city")] if x])} for r in rows]
    elif link_type == "account":
        query = {"tenant_id": tenant_id}
        if city:
            query["city"] = city
        if q:
            query["$or"] = [
                {"account_name": {"$regex": q, "$options": "i"}},
                {"account_id": {"$regex": q, "$options": "i"}},
                {"contact_name": {"$regex": q, "$options": "i"}},
            ]
        rows = await _db.accounts.find(query, {"_id": 0}).limit(20).to_list(20)
        results = [{"id": r["id"], "name": r.get("account_name") or "Account",
                    "city": r.get("city"),
                    "subtitle": " · ".join([x for x in [r.get("account_id"), r.get("city")] if x])} for r in rows]
    elif link_type == "distributor":
        query = {"tenant_id": tenant_id}
        if q:
            query["$or"] = [
                {"distributor_name": {"$regex": q, "$options": "i"}},
                {"distributor_code": {"$regex": q, "$options": "i"}},
            ]
        rows = await _db.distributors.find(query, {"_id": 0}).limit(20).to_list(20)
        results = [{"id": r["id"], "name": r.get("distributor_name") or "Distributor",
                    "city": r.get("city"),
                    "subtitle": r.get("distributor_code") or ""} for r in rows]
    else:
        raise HTTPException(status_code=400, detail="Invalid link_type")
    return {"results": results}


# ── List / Create ──────────────────────────────────────────────────────────
def _build_list_query(
    tenant_id: str,
    status: Optional[str],
    priority: Optional[str],
    department: Optional[str],
    category: Optional[str],
    city: Optional[str],
    link_type: Optional[str],
    assigned_to: Optional[str],
    search: Optional[str],
) -> dict:
    query: dict = {"tenant_id": tenant_id}
    if status and status != "all":
        query["status"] = status
    if priority and priority != "all":
        query["priority"] = priority
    if category and category != "all":
        query["category"] = category
    if city and city != "all":
        query["city"] = city
    if link_type and link_type != "all":
        query["link_type"] = link_type
    and_clauses = []
    if department and department != "all":
        # departments is an array; also match legacy single `department` field
        and_clauses.append({"$or": [{"departments": department}, {"department": department}]})
    if assigned_to and assigned_to != "all":
        if assigned_to == "unassigned":
            and_clauses.append({"$and": [
                {"$or": [{"assignees": {"$size": 0}}, {"assignees": None}, {"assignees": {"$exists": False}}]},
                {"$or": [{"assigned_to": None}, {"assigned_to": ""}, {"assigned_to": {"$exists": False}}]},
            ]})
        else:
            and_clauses.append({"$or": [{"assignees.id": assigned_to}, {"assigned_to": assigned_to}]})
    if search:
        and_clauses.append({"$or": [
            {"title": {"$regex": search, "$options": "i"}},
            {"complaint_number": {"$regex": search, "$options": "i"}},
            {"customer_name": {"$regex": search, "$options": "i"}},
            {"sku_names": {"$regex": search, "$options": "i"}},
            {"departments": {"$regex": search, "$options": "i"}},
            {"department": {"$regex": search, "$options": "i"}},
            {"city": {"$regex": search, "$options": "i"}},
        ]})
    if and_clauses:
        query["$and"] = and_clauses
    return query


@router.get("")
async def list_complaints(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    department: Optional[str] = None,
    category: Optional[str] = None,
    city: Optional[str] = None,
    link_type: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    query = _build_list_query(tenant_id, status, priority, department, category, city, link_type, assigned_to, search)

    total = await _db.customer_complaints.count_documents(query)
    skip = (page - 1) * page_size
    # Light projection — omit heavy comment/photo arrays from the list.
    docs = await _db.customer_complaints.find(
        query, {"_id": 0, "comments": 0, "photos": 0}
    ).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)

    # attach counts
    ids = [d["id"] for d in docs]
    counts = {}
    if ids:
        agg = await _db.customer_complaints.find(
            {"id": {"$in": ids}}, {"_id": 0, "id": 1, "comments": 1, "photos": 1}
        ).to_list(len(ids))
        for a in agg:
            counts[a["id"]] = {
                "comment_count": len(a.get("comments") or []),
                "photo_count": len([p for p in (a.get("photos") or []) if not p.get("is_deleted")]),
            }
    for d in docs:
        d.update(counts.get(d["id"], {"comment_count": 0, "photo_count": 0}))

    return {
        "data": docs,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.post("")
async def create_complaint(body: ComplaintCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if body.link_type and body.link_type not in LINK_TYPES:
        raise HTTPException(status_code=400, detail="Invalid link_type")
    if body.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")
    departments = [d for d in (body.departments or []) if d in DEPARTMENTS]
    assignees = [{"id": a.id, "name": a.name} for a in (body.assignees or []) if a.name]

    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "complaint_number": await _next_complaint_number(tenant_id),
        "title": body.title.strip(),
        "details": body.details or "",
        "link_type": body.link_type,
        "lead_id": body.lead_id,
        "account_id": body.account_id,
        "distributor_id": body.distributor_id,
        "customer_name": body.customer_name,
        "sku_ids": body.sku_ids or [],
        "sku_names": body.sku_names or [],
        "priority": body.priority,
        "status": "open",
        "departments": departments,
        "department": departments[0] if departments else None,
        "category": (body.category or "").strip() or None,
        "city": (body.city or "").strip() or None,
        "assignees": assignees,
        "assigned_to": assignees[0]["id"] if assignees else None,
        "assigned_to_name": assignees[0]["name"] if assignees else None,
        "photos": [],
        "comments": [],
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name"),
        "created_at": now,
        "updated_at": now,
        "resolved_at": None,
        "closed_at": None,
    }
    await _db.customer_complaints.insert_one(doc)
    return _public(doc)


# ── Export / Import ──────────────────────────────────────────────────────
EXPORT_COLUMNS = [
    "Issue Number", "Title", "Details", "Customer", "Linked To",
    "City", "SKUs", "Department", "Category", "Priority", "Status",
    "Assignees", "Created At",
]


@router.get("/import-template")
async def import_template(current_user: dict = Depends(get_current_user)):
    """Download a blank .xlsx template with the correct header row plus a
    hidden `Instructions` sheet listing the valid enum values."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Issues"
    ws.append(EXPORT_COLUMNS)
    # Sample row (row 2) to guide the user
    ws.append([
        "(auto)", "Cap leaks on 500ml bottle", "Batch B123 shows visible seepage",
        "Empire Restaurant", "Account", "Bengaluru", "500ml PET",
        "Production, Quality", "Customer Complaint", "high", "open", "Priya Sharma, Arjun Rao", "",
    ])
    for i in range(1, len(EXPORT_COLUMNS) + 1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = 22

    ins = wb.create_sheet("Instructions")
    ins.append(["Field", "Required?", "Valid values / Notes"])
    ins.append(["Issue Number", "No", "Leave blank — auto-generated on import"])
    ins.append(["Title", "Yes", "Free text — row is skipped if empty"])
    ins.append(["Details", "No", "Free text description"])
    ins.append(["Customer", "No", "Free text (e.g. account/lead/distributor name)"])
    ins.append(["Linked To", "No", " / ".join(LINK_TYPES) + " — anything else is left blank"])
    ins.append(["City", "No", "Free text"])
    ins.append(["SKUs", "No", "Comma-separated list, e.g. '500ml PET, 1L PET'"])
    ins.append(["Department", "No", "Comma-separated: " + " / ".join(DEPARTMENTS) + " — invalid entries are dropped"])
    ins.append(["Category", "No", "A task category name (see Admin → Task Categories). Free text — stored as given"])
    ins.append(["Priority", "No", " / ".join(PRIORITIES) + " — invalid → 'medium'"])
    ins.append(["Status", "No", " / ".join(s.replace('_', ' ') for s in STATUSES) + " — invalid → 'open'"])
    ins.append(["Assignees", "No", "Comma-separated names"])
    ins.append(["Created At", "No", "Ignored — set automatically at import time"])
    for i in range(1, 4):
        ins.column_dimensions[ins.cell(row=1, column=i).column_letter].width = 30
    ins.column_dimensions["C"].width = 60

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="issues-import-template.xlsx"'},
    )


@router.get("/export")
async def export_complaints(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    department: Optional[str] = None,
    category: Optional[str] = None,
    city: Optional[str] = None,
    link_type: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Download the currently-filtered issues as an .xlsx spreadsheet."""
    tenant_id = get_current_tenant_id()
    query = _build_list_query(tenant_id, status, priority, department, category, city, link_type, assigned_to, search)
    docs = await _db.customer_complaints.find(
        query, {"_id": 0, "comments": 0, "photos": 0},
    ).sort("created_at", -1).to_list(10000)

    wb = Workbook()
    ws = wb.active
    ws.title = "Issues"
    ws.append(EXPORT_COLUMNS)
    for d in docs:
        departments = d.get("departments") or ([d["department"]] if d.get("department") else [])
        assignees = d.get("assignees") or ([{"name": d["assigned_to_name"]}] if d.get("assigned_to_name") else [])
        ws.append([
            d.get("complaint_number") or "",
            d.get("title") or "",
            d.get("details") or "",
            d.get("customer_name") or "",
            (d.get("link_type") or "").capitalize(),
            d.get("city") or "",
            ", ".join(d.get("sku_names") or []),
            ", ".join(departments),
            d.get("category") or "",
            (d.get("priority") or "").capitalize(),
            (d.get("status") or "").replace("_", " ").title(),
            ", ".join(a.get("name") or "" for a in assignees),
            d.get("created_at") or "",
        ])
    for i, _ in enumerate(EXPORT_COLUMNS, start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = 22

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"issues-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


def _norm(v) -> str:
    return str(v).strip() if v is not None else ""


def _match_ci(value: str, allowed: List[str]) -> Optional[str]:
    """Case-insensitive match against an allowed list; return canonical or None."""
    v = _norm(value).lower()
    if not v:
        return None
    for a in allowed:
        if a.lower() == v:
            return a
    return None


@router.post("/import")
async def import_complaints(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Bulk-create issues from an uploaded .xlsx spreadsheet.

    Columns are matched by header (case-insensitive). Only Title is required.
    Values that don't match the known enums (Category / Priority / Status /
    Department / Linked To) are left blank instead of rejecting the row.
    """
    tenant_id = get_current_tenant_id()
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        wb = load_workbook(io.BytesIO(raw), data_only=True, read_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read spreadsheet. Please upload a .xlsx file.")
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    try:
        header = [(_norm(h) or "").lower() for h in next(rows)]
    except StopIteration:
        raise HTTPException(status_code=400, detail="Spreadsheet is empty")

    col = {name: i for i, name in enumerate(header) if name}

    def cell(row, *names):
        for n in names:
            i = col.get(n.lower())
            if i is not None and i < len(row):
                v = row[i]
                if v is not None and _norm(v):
                    return _norm(v)
        return ""

    created = 0
    skipped = 0
    errors: List[str] = []
    now = _now()
    for idx, row in enumerate(rows, start=2):
        if row is None or all((v is None or _norm(v) == "") for v in row):
            continue
        title = cell(row, "title", "issue", "issue title", "summary")
        if not title:
            skipped += 1
            errors.append(f"Row {idx}: missing title")
            continue

        priority = _match_ci(cell(row, "priority"), PRIORITIES) or "medium"
        status = _match_ci(cell(row, "status"), STATUSES) or "open"
        # Also accept "in progress" (with a space) → "in_progress"
        status_raw = cell(row, "status").lower().replace(" ", "_")
        if status_raw in STATUSES:
            status = status_raw
        deps_raw = cell(row, "department", "departments")
        departments = [m for m in (_match_ci(p, DEPARTMENTS) for p in deps_raw.split(",")) if m] if deps_raw else []
        category_v = cell(row, "category") or None
        link_type_raw = cell(row, "linked to", "link type", "linked").lower()
        link_type_v = link_type_raw if link_type_raw in LINK_TYPES else None

        skus_raw = cell(row, "skus", "sku")
        sku_names = [s.strip() for s in skus_raw.split(",") if s.strip()] if skus_raw else []
        assignees_raw = cell(row, "assignees", "assigned to", "assigned", "assignee")
        assignees = [{"id": None, "name": n.strip()} for n in assignees_raw.split(",") if n.strip()] if assignees_raw else []

        doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "complaint_number": await _next_complaint_number(tenant_id),
            "title": title,
            "details": cell(row, "details", "description") or "",
            "link_type": link_type_v,
            "lead_id": None,
            "account_id": None,
            "distributor_id": None,
            "customer_name": cell(row, "customer", "customer name") or None,
            "sku_ids": [],
            "sku_names": sku_names,
            "priority": priority,
            "status": status,
            "departments": departments,
            "department": departments[0] if departments else None,
            "category": category_v,
            "city": cell(row, "city") or None,
            "assignees": assignees,
            "assigned_to": None,
            "assigned_to_name": assignees[0]["name"] if assignees else None,
            "photos": [],
            "comments": [],
            "created_by": current_user.get("id"),
            "created_by_name": current_user.get("name"),
            "created_at": now,
            "updated_at": now,
            "resolved_at": now if status == "resolved" else None,
            "closed_at": now if status == "closed" else None,
        }
        await _db.customer_complaints.insert_one(doc)
        created += 1

    return {"created": created, "skipped": skipped, "errors": errors[:20]}


@router.get("/{complaint_id}")
async def get_complaint(complaint_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    doc["photos"] = [p for p in (doc.get("photos") or []) if not p.get("is_deleted")]
    return doc


@router.put("/{complaint_id}")
async def update_complaint(complaint_id: str, body: ComplaintUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")

    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if "status" in updates and updates["status"] not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if "priority" in updates and updates["priority"] not in PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")
    if "departments" in updates:
        deps = [d for d in (updates.get("departments") or []) if d in DEPARTMENTS]
        updates["departments"] = deps
        updates["department"] = deps[0] if deps else None
    if "assignees" in updates:
        assignees = [a for a in (updates.get("assignees") or []) if a.get("name")]
        updates["assignees"] = assignees
        updates["assigned_to"] = assignees[0].get("id") if assignees else None
        updates["assigned_to_name"] = assignees[0].get("name") if assignees else None
    if "category" in updates:
        c = (updates.get("category") or "").strip() if updates.get("category") is not None else None
        updates["category"] = c or None
    if "city" in updates:
        c = (updates.get("city") or "").strip() if updates.get("city") is not None else None
        updates["city"] = c or None

    now = _now()
    updates["updated_at"] = now
    new_status = updates.get("status")
    if new_status == "resolved" and doc.get("status") != "resolved":
        updates["resolved_at"] = now
    if new_status == "closed" and doc.get("status") != "closed":
        updates["closed_at"] = now
    if new_status == "open" and doc.get("status") in ("closed", "resolved"):
        updates["reopened_at"] = now

    await _db.customer_complaints.update_one(
        {"id": complaint_id, "tenant_id": tenant_id}, {"$set": updates}
    )
    fresh = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id}, {"_id": 0})
    fresh["photos"] = [p for p in (fresh.get("photos") or []) if not p.get("is_deleted")]
    return fresh


@router.delete("/{complaint_id}")
async def delete_complaint(complaint_id: str, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can delete complaints")
    tenant_id = get_current_tenant_id()
    res = await _db.customer_complaints.delete_one({"id": complaint_id, "tenant_id": tenant_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {"message": "Complaint deleted"}


# ── Comments / updates ───────────────────────────────────────────────────
@router.post("/{complaint_id}/comments")
async def add_comment(complaint_id: str, body: CommentCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    comment = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.get("id"),
        "user_name": current_user.get("name"),
        "text": body.text.strip(),
        "created_at": _now(),
    }
    await _db.customer_complaints.update_one(
        {"id": complaint_id, "tenant_id": tenant_id},
        {"$push": {"comments": comment}, "$set": {"updated_at": _now()}},
    )
    return comment


# ── Photos ───────────────────────────────────────────────────────────────
@router.post("/{complaint_id}/photos")
async def upload_photos(
    complaint_id: str,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    doc = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")

    uploaded = []
    for f in files:
        content_type = f.content_type or guess_content_type(f.filename)
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {content_type}")
        data = await f.read()
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(status_code=400, detail=f"{f.filename} exceeds 15 MB")
        path = build_path(tenant_id, "complaints", f.filename or "photo.jpg")
        result = await put_object(path, data, content_type)
        photo = {
            "id": str(uuid.uuid4()),
            "storage_path": result["path"],
            "original_filename": f.filename,
            "content_type": content_type,
            "size": result.get("size", len(data)),
            "uploaded_by": current_user.get("id"),
            "uploaded_by_name": current_user.get("name"),
            "uploaded_at": _now(),
            "is_deleted": False,
        }
        uploaded.append(photo)

    await _db.customer_complaints.update_one(
        {"id": complaint_id, "tenant_id": tenant_id},
        {"$push": {"photos": {"$each": uploaded}}, "$set": {"updated_at": _now()}},
    )
    return {"photos": uploaded}


@router.get("/{complaint_id}/photos/{photo_id}")
async def download_photo(complaint_id: str, photo_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await _db.customer_complaints.find_one({"id": complaint_id, "tenant_id": tenant_id}, {"_id": 0, "photos": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Complaint not found")
    photo = next((p for p in (doc.get("photos") or []) if p.get("id") == photo_id and not p.get("is_deleted")), None)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    data, content_type = await get_object(photo["storage_path"])
    return Response(content=data, media_type=photo.get("content_type") or content_type)


@router.delete("/{complaint_id}/photos/{photo_id}")
async def delete_photo(complaint_id: str, photo_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    res = await _db.customer_complaints.update_one(
        {"id": complaint_id, "tenant_id": tenant_id, "photos.id": photo_id},
        {"$set": {"photos.$.is_deleted": True, "updated_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Photo not found")
    return {"message": "Photo removed"}
