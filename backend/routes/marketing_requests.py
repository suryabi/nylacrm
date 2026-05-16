"""Marketing Requests — lifecycle router.

Endpoints (prefix `/marketing-requests`):
  POST   /upload                       upload a single file → returns file_id (re-usable)
  GET    /files/{file_id}              download a previously-uploaded file
  POST   /                             create a request
  GET    /                             list (with queue, search, filters, paging)
  GET    /{id}                         detail
  PATCH  /{id}                         edit a few mutable header fields (Sales rep, draft state)
  POST   /{id}/status                  change status (validates allowed transitions)
  POST   /{id}/comments                add a comment
  POST   /{id}/versions                add a work-version (Marketing)
  POST   /{id}/production-submit       submit for production (after final_approved)
  POST   /{id}/production-status       mark production in-progress / completed (Delivery)
  GET    /counts                       per-queue counts (sidebar badges)
"""
from datetime import datetime, timezone, date, timedelta
from typing import List, Optional
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Query, Response

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from utils.object_storage import put_object, get_object
from models.marketing_request import (
    MarketingRequest, MarketingRequestCreate, StatusChangeRequest,
    CommentCreate, VersionCreate, ProductionSubmitRequest,
    StoredFile, FileVersion, RequestComment, ProductionSubmission,
    LIFECYCLE_STATUSES,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────
_STATUS_BY_KEY = {s["key"]: s for s in LIFECYCLE_STATUSES}

# Allowed lifecycle transitions. Empty set means "terminal".
ALLOWED_TRANSITIONS = {
    "submitted":              {"inputs_needed", "in_progress"},
    "inputs_needed":          {"in_progress", "submitted"},
    "in_progress":            {"inputs_needed", "in_review"},
    "in_review":              {"in_progress", "approved_internal"},
    "approved_internal":      {"in_progress", "final_approved"},
    "final_approved":         {"production_in_progress"},  # via production-submit
    "production_in_progress": {"production_completed"},
    "production_completed":   set(),
}


def _user_departments(user: dict) -> List[str]:
    """Return the user's department list (always lower-cased)."""
    d = user.get("department")
    if not d:
        return []
    if isinstance(d, list):
        return [str(x).strip().lower() for x in d if x]
    return [str(d).strip().lower()]


def _user_in_dept(user: dict, dept_name: str) -> bool:
    if not dept_name:
        return False
    return dept_name.strip().lower() in _user_departments(user)


def _is_admin(user: dict) -> bool:
    role = (user.get("role") or "").lower()
    return any(t in role for t in ("ceo", "admin", "director", "vp", "national sales head"))


async def _next_request_number(tenant_id: str) -> str:
    """Generate MR-YYYY-NNNN per tenant."""
    year = datetime.now(timezone.utc).year
    prefix = f"MR-{year}-"
    latest = await db.marketing_requests.find_one(
        {"tenant_id": tenant_id, "request_number": {"$regex": f"^{prefix}"}},
        {"_id": 0, "request_number": 1},
        sort=[("request_number", -1)],
    )
    next_num = 1
    if latest and latest.get("request_number"):
        try:
            next_num = int(latest["request_number"].split("-")[-1]) + 1
        except (ValueError, IndexError):
            pass
    return f"{prefix}{next_num:04d}"


async def _get_file(tenant_id: str, file_id: str) -> Optional[dict]:
    return await db.marketing_request_files.find_one(
        {"id": file_id, "tenant_id": tenant_id}, {"_id": 0}
    )


async def _stored_files_from_ids(tenant_id: str, file_ids: List[str]) -> List[dict]:
    if not file_ids:
        return []
    rows = await db.marketing_request_files.find(
        {"id": {"$in": file_ids}, "tenant_id": tenant_id}, {"_id": 0}
    ).to_list(len(file_ids))
    return [StoredFile(**r).model_dump() for r in rows]


# ──────────────────────────────────────────────────────────────
# File upload (re-usable across logo, references, version files)
# ──────────────────────────────────────────────────────────────
@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a single file into object storage and return its handle.

    The caller then references the returned `file_id` when creating a request,
    adding a version, etc. This lets the form do many parallel uploads while
    the create-request payload stays small.
    """
    tenant_id = get_current_tenant_id()
    file_id = str(uuid.uuid4())
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    safe_name = (file.filename or "upload.bin").replace("/", "_")
    path = f"nyla-crm/{tenant_id}/marketing-requests/{file_id}/{safe_name}"

    try:
        meta = put_object(path, raw, file.content_type or "application/octet-stream")
    except Exception as e:
        logger.error(f"Object-storage upload failed: {e}")
        raise HTTPException(502, f"Storage upload failed: {e}")

    doc = {
        "id": file_id,
        "tenant_id": tenant_id,
        "filename": safe_name,
        "path": meta.get("path") or path,
        "size": meta.get("size") or len(raw),
        "content_type": file.content_type,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user.get("id"),
        "uploaded_by_name": current_user.get("name") or current_user.get("email"),
    }
    await db.marketing_request_files.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/files/{file_id}")
async def download_file(file_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    row = await _get_file(tenant_id, file_id)
    if not row:
        raise HTTPException(404, "File not found")
    try:
        data, ctype = get_object(row["path"])
    except Exception as e:
        raise HTTPException(502, f"Storage fetch failed: {e}")
    headers = {"Content-Disposition": f'inline; filename="{row.get("filename", "file")}"'}
    return Response(content=data, media_type=row.get("content_type") or ctype or "application/octet-stream", headers=headers)


# ──────────────────────────────────────────────────────────────
# Create a request
# ──────────────────────────────────────────────────────────────
@router.post("")
async def create_request(payload: MarketingRequestCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()

    # Resolve type + department for denormalised display
    type_doc = await db.marketing_request_types.find_one(
        {"id": payload.request_type_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not type_doc:
        raise HTTPException(400, "Request type not found")
    dept_doc = await db.master_departments.find_one(
        {"id": payload.assigned_department_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not dept_doc:
        raise HTTPException(400, "Assigned department not found")

    # Lead-time guardrail — block if requested_due_date is too soon AND no
    # short-timeline reason supplied.
    try:
        due = date.fromisoformat(payload.requested_due_date[:10])
    except ValueError:
        raise HTTPException(400, "requested_due_date must be ISO date (YYYY-MM-DD)")
    required_days = int(type_doc.get("design_lead_time_days") or 0) + int(type_doc.get("production_lead_time_days") or 0)
    earliest = date.today() + timedelta(days=required_days)
    if due < earliest and not (payload.short_timeline_reason and payload.short_timeline_reason.strip()):
        raise HTTPException(
            400,
            f"Requested due date {due} is earlier than the minimum lead time "
            f"({required_days} days → earliest {earliest}). Please provide a "
            f"`short_timeline_reason` to proceed.",
        )

    # Stitch attached files (uploaded ahead of time)
    logo_doc = None
    if payload.logo_file_id:
        f = await _get_file(tenant_id, payload.logo_file_id)
        if f:
            logo_doc = StoredFile(**f).model_dump()
    ref_docs = await _stored_files_from_ids(tenant_id, payload.reference_file_ids or [])

    req = MarketingRequest(
        tenant_id=tenant_id,
        request_number=await _next_request_number(tenant_id),
        title=(payload.title or type_doc["name"]),
        request_type_id=type_doc["id"],
        request_type_name=type_doc["name"],
        assigned_department_id=dept_doc["id"],
        assigned_department_name=dept_doc["name"],
        requested_due_date=payload.requested_due_date,
        requirement_details=payload.requirement_details,
        design_lead_time_days=int(type_doc.get("design_lead_time_days") or 0),
        production_lead_time_days=int(type_doc.get("production_lead_time_days") or 0),
        short_timeline_reason=payload.short_timeline_reason,
        logo=logo_doc,
        references=ref_docs,
        social_media_links=payload.social_media_links,
        file_links=payload.file_links,
        additional_comments=payload.additional_comments,
        status_key="submitted",
        status_name="Submitted",
        created_by=current_user.get("id"),
        created_by_name=current_user.get("name") or current_user.get("email"),
    )
    doc = req.model_dump()
    # Seed the timeline with a "submitted" event
    doc["comments"].append(RequestComment(
        user_id=current_user.get("id"), user_name=current_user.get("name") or "User",
        text=f"Request {doc['request_number']} created.", kind="system",
    ).model_dump())
    await db.marketing_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ──────────────────────────────────────────────────────────────
# List + counts
# ──────────────────────────────────────────────────────────────
QUEUE_FILTERS = {
    # Sales-facing
    "my_requests":           {"_kind": "by_user"},                  # created_by = me
    "my_inputs_needed":      {"_kind": "by_user", "status_key": "inputs_needed"},
    "my_in_progress":        {"_kind": "by_user", "status_key": {"$in": ["in_progress", "in_review", "approved_internal"]}},
    "my_approved":           {"_kind": "by_user", "status_key": "final_approved"},
    "my_sent_for_production":{"_kind": "by_user", "status_key": {"$in": ["production_in_progress", "production_completed"]}},
    # Marketing-facing (by assigned dept)
    "new_requests":          {"_kind": "by_dept", "status_key": "submitted"},
    "inputs_needed":         {"_kind": "by_dept", "status_key": "inputs_needed"},
    "in_progress":           {"_kind": "by_dept", "status_key": "in_progress"},
    "in_review":             {"_kind": "by_dept", "status_key": "in_review"},
    "approved_internal":     {"_kind": "by_dept", "status_key": "approved_internal"},
    "final_approved":        {"_kind": "by_dept", "status_key": "final_approved"},
    # Delivery-facing
    "ready_for_production":  {"_kind": "by_delivery_dept", "status_key": "final_approved"},
    "production_pending":    {"_kind": "by_delivery_dept", "production.production_status": "pending"},
    "production_in_progress":{"_kind": "by_delivery_dept", "status_key": "production_in_progress"},
    "production_completed":  {"_kind": "by_delivery_dept", "status_key": "production_completed"},
    # All (admin / debugging)
    "all":                   {},
}


def _build_query(tenant_id: str, user: dict, queue: str, search: Optional[str], status_key: Optional[str]) -> dict:
    q: dict = {"tenant_id": tenant_id}
    cfg = QUEUE_FILTERS.get(queue or "my_requests") or {}
    kind = cfg.get("_kind")
    user_depts = _user_departments(user)
    user_id = user.get("id")

    if kind == "by_user":
        q["created_by"] = user_id
    elif kind == "by_dept":
        # User must be in one of the assigned-dept names
        if user_depts:
            q["assigned_department_name"] = {
                "$in": [d for d in [u.title() for u in user_depts] + [u for u in user_depts]]
            }
    elif kind == "by_delivery_dept":
        if user_depts:
            q["production.assigned_delivery_department_name"] = {
                "$in": [d for d in [u.title() for u in user_depts] + [u for u in user_depts]]
            }
    # Apply per-queue extra filters (status_key, production.production_status)
    for k, v in cfg.items():
        if k == "_kind":
            continue
        q[k] = v
    # Optional explicit status filter on top
    if status_key:
        q["status_key"] = status_key
    # Text search across number/title
    if search:
        q["$or"] = [
            {"request_number": {"$regex": search, "$options": "i"}},
            {"title": {"$regex": search, "$options": "i"}},
        ]
    return q


@router.get("")
async def list_requests(
    queue: str = "my_requests",
    search: Optional[str] = None,
    status_key: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    sort: str = "-created_at",
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    page = max(page, 1)
    limit = max(min(limit, 100), 1)
    q = _build_query(tenant_id, current_user, queue, search, status_key)
    total = await db.marketing_requests.count_documents(q)
    sort_field = sort.lstrip("-+")
    sort_dir = -1 if sort.startswith("-") else 1
    rows = await db.marketing_requests.find(q, {"_id": 0}).sort(sort_field, sort_dir).skip((page-1)*limit).limit(limit).to_list(limit)
    return {
        "items": rows, "total": total, "page": page, "limit": limit,
        "pages": (total + limit - 1) // limit if total else 0,
    }


@router.get("/counts")
async def queue_counts(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    counts: dict = {}
    for queue in QUEUE_FILTERS:
        if queue == "all":
            continue
        try:
            q = _build_query(tenant_id, current_user, queue, None, None)
            counts[queue] = await db.marketing_requests.count_documents(q)
        except Exception:
            counts[queue] = 0
    return {"counts": counts}


# ──────────────────────────────────────────────────────────────
# Detail / edit
# ──────────────────────────────────────────────────────────────
@router.get("/{request_id}")
async def get_request(request_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    return doc


# ──────────────────────────────────────────────────────────────
# Status transition
# ──────────────────────────────────────────────────────────────
@router.post("/{request_id}/status")
async def change_status(request_id: str, payload: StatusChangeRequest, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")

    current_key = doc.get("status_key") or "submitted"
    target_key = payload.status_key
    if target_key not in _STATUS_BY_KEY:
        raise HTTPException(400, f"Unknown status key: {target_key}")
    allowed = ALLOWED_TRANSITIONS.get(current_key) or set()
    # Allow admin to override
    if target_key not in allowed and not _is_admin(current_user):
        raise HTTPException(400, f"Cannot transition from {current_key} → {target_key}. Allowed: {sorted(allowed)}")

    # Permission gate by role/dept:
    # - "final_approved" can only be set by the requestor or an admin (Sales rep confirms after external sign-off)
    # - Marketing-only transitions: inputs_needed, in_progress, in_review, approved_internal — must be in Marketing dept (or admin)
    if target_key == "final_approved" and current_user.get("id") != doc.get("created_by") and not _is_admin(current_user):
        raise HTTPException(403, "Only the request raiser (or an admin) can mark a request as Final Approved.")
    if target_key in {"inputs_needed", "in_progress", "in_review", "approved_internal"}:
        if not (_is_admin(current_user) or _user_in_dept(current_user, doc.get("assigned_department_name") or "")):
            raise HTTPException(403, "Only members of the assigned department (or admin) can change this status.")

    status_doc = _STATUS_BY_KEY[target_key]
    timeline_event = RequestComment(
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email") or "User",
        text=(payload.comment or f"Status changed to {status_doc['name']}"),
        kind="status_change",
    ).model_dump()

    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {
            "status_key": target_key,
            "status_name": status_doc["name"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
         "$push": {"comments": timeline_event}}
    )
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    return doc


# ──────────────────────────────────────────────────────────────
# Comments
# ──────────────────────────────────────────────────────────────
@router.post("/{request_id}/comments")
async def add_comment(request_id: str, payload: CommentCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    event = RequestComment(
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email") or "User",
        text=payload.text,
        kind=payload.kind or "comment",
    ).model_dump()
    res = await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$push": {"comments": event},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found")
    return event


# ──────────────────────────────────────────────────────────────
# Versions — Marketing uploads work files (versioned)
# ──────────────────────────────────────────────────────────────
@router.post("/{request_id}/versions")
async def add_version(request_id: str, payload: VersionCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    if not (_is_admin(current_user) or _user_in_dept(current_user, doc.get("assigned_department_name") or "")):
        raise HTTPException(403, "Only members of the assigned department (or admin) can upload work versions.")

    files = await _stored_files_from_ids(tenant_id, payload.file_ids or [])
    version = FileVersion(
        version_name=payload.version_name,
        files=[StoredFile(**f) for f in files],
        links=payload.links or [],
        comments=payload.comments,
        uploaded_by=current_user.get("id"),
        uploaded_by_name=current_user.get("name") or current_user.get("email") or "User",
    ).model_dump()

    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$push": {"versions": version},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return version


# ──────────────────────────────────────────────────────────────
# Production submission (after final_approved)
# ──────────────────────────────────────────────────────────────
@router.post("/{request_id}/production-submit")
async def submit_for_production(request_id: str, payload: ProductionSubmitRequest, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    if doc.get("status_key") != "final_approved":
        raise HTTPException(400, "Request must be in Final Approved status to submit for production.")
    if current_user.get("id") != doc.get("created_by") and not _is_admin(current_user) \
            and not _user_in_dept(current_user, doc.get("assigned_department_name") or ""):
        raise HTTPException(403, "Only the requestor, assigned-dept member or admin can submit for production.")

    delivery_dept = await db.master_departments.find_one(
        {"id": payload.assigned_delivery_department_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not delivery_dept:
        raise HTTPException(400, "Delivery department not found")

    files = await _stored_files_from_ids(tenant_id, payload.final_approved_file_ids or [])
    sub = ProductionSubmission(
        submitted_by=current_user.get("id"),
        submitted_by_name=current_user.get("name") or current_user.get("email") or "User",
        quantity_required=payload.quantity_required,
        requested_production_date=payload.requested_production_date,
        assigned_delivery_department_id=delivery_dept["id"],
        assigned_delivery_department_name=delivery_dept["name"],
        production_notes=payload.production_notes,
        final_approved_files=[StoredFile(**f) for f in files],
        final_approved_links=payload.final_approved_links or [],
        production_status="pending",
    ).model_dump()

    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {
            "production": sub,
            "status_key": "production_in_progress",
            "status_name": "Production In Progress",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        "$push": {"comments": RequestComment(
            user_id=current_user.get("id"),
            user_name=current_user.get("name") or "User",
            text=f"Submitted for production to {delivery_dept['name']} — qty {payload.quantity_required}.",
            kind="system",
        ).model_dump()}}
    )
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    return doc


@router.post("/{request_id}/production-status")
async def update_production_status(request_id: str, payload: StatusChangeRequest, current_user: dict = Depends(get_current_user)):
    """Delivery team toggles production_in_progress / production_completed."""
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    if not doc.get("production"):
        raise HTTPException(400, "Production not yet submitted for this request.")
    target = payload.status_key
    if target not in {"production_in_progress", "production_completed"}:
        raise HTTPException(400, "Production status must be production_in_progress or production_completed")
    delivery_dept_name = doc["production"].get("assigned_delivery_department_name") or ""
    if not (_is_admin(current_user) or _user_in_dept(current_user, delivery_dept_name)):
        raise HTTPException(403, "Only members of the delivery department (or admin) can update production status.")
    status_doc = _STATUS_BY_KEY[target]
    set_doc = {
        "status_key": target,
        "status_name": status_doc["name"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "production.production_status": "completed" if target == "production_completed" else "in_progress",
    }
    if target == "production_completed":
        set_doc["production.production_completed_at"] = datetime.now(timezone.utc).isoformat()
        set_doc["production.production_completed_by"] = current_user.get("id")
        set_doc["production.production_completed_by_name"] = current_user.get("name") or "User"
    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": set_doc,
         "$push": {"comments": RequestComment(
             user_id=current_user.get("id"),
             user_name=current_user.get("name") or "User",
             text=(payload.comment or f"Production status → {status_doc['name']}"),
             kind="status_change",
         ).model_dump()}}
    )
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    return doc
