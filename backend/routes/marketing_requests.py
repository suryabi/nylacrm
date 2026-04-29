"""
Marketing Requests — independent lifecycle module raised by Sales,
fulfilled by Marketing (with the ability to reassign across departments).

Lifecycle: created → assigned → in_progress → review → completed | rejected
Multi-tenant. Mirrors Tasks structure but stays in its own collection so
both modules can evolve independently.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
import uuid
import logging

from database import get_tenant_db
from deps import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

LIFECYCLE_STATUSES = ["created", "assigned", "in_progress", "review", "completed", "rejected"]
ACTIVITY_KIND_STATUS = "status_change"
ACTIVITY_KIND_ASSIGN = "assignment"
ACTIVITY_KIND_COMMENT = "comment"
ACTIVITY_KIND_FILE = "file"
ACTIVITY_KIND_LINK = "link"
ACTIVITY_KIND_LEAD = "lead_link"


# ───────────────────────── Models ─────────────────────────

class FileRef(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    url: str
    size: Optional[int] = None
    mime_type: Optional[str] = None
    kind: str = "input"  # 'input' (from requester) or 'output' (from marketing)
    uploaded_by: Optional[str] = None
    uploaded_by_name: Optional[str] = None
    uploaded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ExternalLink(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    url: str
    kind: str = "output"  # 'reference' or 'output'
    added_by: Optional[str] = None
    added_by_name: Optional[str] = None
    added_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MarketingRequestCreate(BaseModel):
    title: str
    description: Optional[str] = None
    request_type_id: str
    priority: str = "medium"
    due_date: Optional[str] = None
    assigned_to_department: Optional[str] = "Marketing"
    assigned_to: Optional[str] = None  # Optional initially — auto-routed if empty
    lead_ids: List[str] = []
    account_id: Optional[str] = None
    input_files: List[FileRef] = []
    reference_links: List[ExternalLink] = []


class MarketingRequestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    request_type_id: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    assigned_to_department: Optional[str] = None
    assigned_to: Optional[str] = None
    lead_ids: Optional[List[str]] = None
    rejection_reason: Optional[str] = None


class CommentCreate(BaseModel):
    text: str


class FileAttach(BaseModel):
    name: str
    url: str
    size: Optional[int] = None
    mime_type: Optional[str] = None
    kind: str = "input"  # 'input' | 'output' | 'reference'


class LinkAttach(BaseModel):
    label: str
    url: str
    kind: str = "output"


# ───────────────────────── Helpers ─────────────────────────

async def _send_slack_notification(tdb, payload: Dict[str, Any]):
    """Best-effort outgoing Slack webhook — never blocks the user action."""
    try:
        settings = await tdb.tenant_settings.find_one({"_id": 0} if False else {}, {"_id": 0, "slack_webhook_url": 1, "app_base_url": 1}) or {}
        webhook = settings.get("slack_webhook_url")
        if not webhook:
            return
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(webhook, json=payload)
    except Exception as e:
        logger.warning(f"Slack notification failed silently: {e}")


def _activity(kind: str, by: dict, **extra) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "by_id": by.get("id"),
        "by_name": by.get("name"),
        "at": datetime.now(timezone.utc).isoformat(),
        **extra,
    }


async def _enrich_request(tdb, doc: dict) -> dict:
    """Attach derived names — request_type label, lead snippets — for UI ease."""
    if not doc:
        return doc
    if doc.get("request_type_id"):
        rt = await tdb.master_request_types.find_one({"id": doc["request_type_id"]}, {"_id": 0, "name": 1, "color": 1, "icon": 1})
        if rt:
            doc["request_type_name"] = rt.get("name")
            doc["request_type_color"] = rt.get("color")
            doc["request_type_icon"] = rt.get("icon")
    lead_ids = doc.get("lead_ids") or []
    if lead_ids:
        leads = await tdb.leads.find({"id": {"$in": lead_ids}}, {"_id": 0, "id": 1, "name": 1, "company_name": 1}).to_list(50)
        doc["leads_summary"] = leads
    return doc


# ───────────────────────── Routes ─────────────────────────

@router.post("")
async def create_marketing_request(payload: MarketingRequestCreate, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()

    # Validate type
    rt = await tdb.master_request_types.find_one({"id": payload.request_type_id, "is_active": True}, {"_id": 0})
    if not rt:
        raise HTTPException(400, "Invalid or inactive request type")

    # Auto-route to Marketing department if no assignee specified
    assignee_name = None
    if payload.assigned_to:
        u = await tdb.users.find_one({"id": payload.assigned_to}, {"_id": 0, "name": 1, "department": 1})
        assignee_name = u.get("name") if u else None

    now_iso = datetime.now(timezone.utc).isoformat()
    initial_status = "assigned" if payload.assigned_to else "created"

    doc = {
        "id": str(uuid.uuid4()),
        "title": payload.title,
        "description": payload.description,
        "request_type_id": payload.request_type_id,
        "priority": payload.priority,
        "status": initial_status,
        "due_date": payload.due_date,
        "assigned_to_department": payload.assigned_to_department or "Marketing",
        "assigned_to": payload.assigned_to,
        "assigned_to_name": assignee_name,
        "lead_ids": payload.lead_ids,
        "account_id": payload.account_id,
        "input_files": [f.model_dump() if hasattr(f, "model_dump") else f for f in (payload.input_files or [])],
        "output_files": [],
        "reference_links": [lk.model_dump() if hasattr(lk, "model_dump") else lk for lk in (payload.reference_links or [])],
        "output_links": [],
        "rejection_reason": None,
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name"),
        "created_at": now_iso,
        "updated_at": now_iso,
        "completed_at": None,
        "comments": [],
        "activity": [_activity(ACTIVITY_KIND_STATUS, current_user, from_status=None, to_status=initial_status)],
    }

    await tdb.marketing_requests.insert_one(doc)
    doc.pop("_id", None)

    # Async-ish Slack notification (best-effort)
    await _send_slack_notification(tdb, {
        "text": f":bell: *Marketing request created* — {payload.title}",
        "attachments": [{
            "color": "#6366f1",
            "fields": [
                {"title": "Type", "value": rt.get("name"), "short": True},
                {"title": "Priority", "value": payload.priority, "short": True},
                {"title": "Requester", "value": current_user.get("name", "—"), "short": True},
                {"title": "Department", "value": doc["assigned_to_department"], "short": True},
            ],
        }],
    })

    return await _enrich_request(tdb, doc)


@router.get("")
async def list_marketing_requests(
    status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    department: Optional[str] = None,
    request_type_id: Optional[str] = None,
    lead_id: Optional[str] = None,
    created_by: Optional[str] = None,
    limit: int = Query(200, le=1000),
    current_user: dict = Depends(get_current_user),
):
    tdb = get_tenant_db()
    q: Dict[str, Any] = {}
    if status:
        statuses = status.split(",")
        q["status"] = {"$in": statuses}
    if assigned_to:
        q["assigned_to"] = assigned_to
    if department:
        q["assigned_to_department"] = department
    if request_type_id:
        q["request_type_id"] = request_type_id
    if lead_id:
        q["lead_ids"] = lead_id
    if created_by:
        q["created_by"] = created_by

    rows = await tdb.marketing_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    for r in rows:
        await _enrich_request(tdb, r)
    return rows


@router.get("/{req_id}")
async def get_marketing_request(req_id: str, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    doc = await tdb.marketing_requests.find_one({"id": req_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Marketing request not found")
    return await _enrich_request(tdb, doc)


@router.put("/{req_id}")
async def update_marketing_request(req_id: str, payload: MarketingRequestUpdate, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    doc = await tdb.marketing_requests.find_one({"id": req_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Marketing request not found")

    updates: Dict[str, Any] = {}
    activity_entries = []

    if payload.status is not None:
        if payload.status not in LIFECYCLE_STATUSES:
            raise HTTPException(400, f"Invalid status. Must be one of {LIFECYCLE_STATUSES}")
        if payload.status != doc.get("status"):
            updates["status"] = payload.status
            activity_entries.append(_activity(ACTIVITY_KIND_STATUS, current_user, from_status=doc.get("status"), to_status=payload.status))
            if payload.status == "completed":
                updates["completed_at"] = datetime.now(timezone.utc).isoformat()
            if payload.status == "rejected" and payload.rejection_reason:
                updates["rejection_reason"] = payload.rejection_reason

    if payload.assigned_to is not None and payload.assigned_to != doc.get("assigned_to"):
        u = await tdb.users.find_one({"id": payload.assigned_to}, {"_id": 0, "name": 1, "department": 1})
        updates["assigned_to"] = payload.assigned_to
        updates["assigned_to_name"] = u.get("name") if u else None
        # If reassigning auto-bump status if still in 'created'
        if doc.get("status") == "created":
            updates["status"] = "assigned"
            activity_entries.append(_activity(ACTIVITY_KIND_STATUS, current_user, from_status="created", to_status="assigned"))
        activity_entries.append(_activity(
            ACTIVITY_KIND_ASSIGN, current_user,
            from_user_id=doc.get("assigned_to"),
            from_user_name=doc.get("assigned_to_name"),
            to_user_id=payload.assigned_to,
            to_user_name=u.get("name") if u else None,
        ))

    if payload.assigned_to_department is not None and payload.assigned_to_department != doc.get("assigned_to_department"):
        updates["assigned_to_department"] = payload.assigned_to_department
        activity_entries.append(_activity(
            ACTIVITY_KIND_ASSIGN, current_user,
            from_department=doc.get("assigned_to_department"),
            to_department=payload.assigned_to_department,
        ))
        # Reset assigned_to when department changes if assignee is no longer in that dept
        if payload.assigned_to is None and doc.get("assigned_to"):
            assignee = await tdb.users.find_one({"id": doc.get("assigned_to")}, {"_id": 0, "department": 1})
            if assignee and assignee.get("department") != payload.assigned_to_department:
                updates["assigned_to"] = None
                updates["assigned_to_name"] = None

    for field in ("title", "description", "request_type_id", "priority", "due_date", "lead_ids", "rejection_reason"):
        val = getattr(payload, field, None)
        if val is not None:
            updates[field] = val

    if not updates and not activity_entries:
        return await _enrich_request(tdb, doc)

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    push_block = {}
    if activity_entries:
        push_block["activity"] = {"$each": activity_entries}

    update_op: Dict[str, Any] = {"$set": updates}
    if push_block:
        update_op["$push"] = push_block

    await tdb.marketing_requests.update_one({"id": req_id}, update_op)

    refreshed = await tdb.marketing_requests.find_one({"id": req_id}, {"_id": 0})

    # Slack on status change
    if "status" in updates:
        await _send_slack_notification(tdb, {
            "text": f":arrows_counterclockwise: *Marketing request status → {updates['status']}* — {refreshed.get('title')}",
            "attachments": [{
                "color": "#0ea5e9" if updates["status"] == "completed" else "#f59e0b",
                "fields": [
                    {"title": "Updated by", "value": current_user.get("name", "—"), "short": True},
                    {"title": "Assignee", "value": refreshed.get("assigned_to_name") or "—", "short": True},
                ],
            }],
        })

    return await _enrich_request(tdb, refreshed)


@router.delete("/{req_id}")
async def delete_marketing_request(req_id: str, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    res = await tdb.marketing_requests.delete_one({"id": req_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Marketing request not found")
    return {"ok": True}


# ───────────────────────── Comments ─────────────────────────

@router.post("/{req_id}/comments")
async def add_comment(req_id: str, payload: CommentCreate, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    doc = await tdb.marketing_requests.find_one({"id": req_id}, {"_id": 0, "id": 1})
    if not doc:
        raise HTTPException(404, "Marketing request not found")
    comment = {
        "id": str(uuid.uuid4()),
        "text": payload.text,
        "by_id": current_user["id"],
        "by_name": current_user.get("name"),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    await tdb.marketing_requests.update_one(
        {"id": req_id},
        {
            "$push": {
                "comments": comment,
                "activity": _activity(ACTIVITY_KIND_COMMENT, current_user, comment_id=comment["id"]),
            },
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    return comment


# ───────────────────────── Files & Links ─────────────────────────

@router.post("/{req_id}/files")
async def attach_file(req_id: str, payload: FileAttach, current_user: dict = Depends(get_current_user)):
    if payload.kind not in ("input", "output", "reference"):
        raise HTTPException(400, "kind must be 'input', 'output', or 'reference'")
    tdb = get_tenant_db()
    file_doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "url": payload.url,
        "size": payload.size,
        "mime_type": payload.mime_type,
        "kind": payload.kind,
        "uploaded_by": current_user["id"],
        "uploaded_by_name": current_user.get("name"),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    target_field = "output_files" if payload.kind == "output" else "input_files"
    res = await tdb.marketing_requests.update_one(
        {"id": req_id},
        {
            "$push": {
                target_field: file_doc,
                "activity": _activity(ACTIVITY_KIND_FILE, current_user, file_kind=payload.kind, file_name=payload.name),
            },
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Marketing request not found")
    return file_doc


@router.delete("/{req_id}/files/{file_id}")
async def detach_file(req_id: str, file_id: str, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    await tdb.marketing_requests.update_one(
        {"id": req_id},
        {
            "$pull": {"input_files": {"id": file_id}, "output_files": {"id": file_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    return {"ok": True}


@router.post("/{req_id}/links")
async def attach_link(req_id: str, payload: LinkAttach, current_user: dict = Depends(get_current_user)):
    if payload.kind not in ("reference", "output"):
        raise HTTPException(400, "kind must be 'reference' or 'output'")
    tdb = get_tenant_db()
    link_doc = {
        "id": str(uuid.uuid4()),
        "label": payload.label,
        "url": payload.url,
        "kind": payload.kind,
        "added_by": current_user["id"],
        "added_by_name": current_user.get("name"),
        "added_at": datetime.now(timezone.utc).isoformat(),
    }
    target_field = "output_links" if payload.kind == "output" else "reference_links"
    res = await tdb.marketing_requests.update_one(
        {"id": req_id},
        {
            "$push": {
                target_field: link_doc,
                "activity": _activity(ACTIVITY_KIND_LINK, current_user, link_kind=payload.kind, label=payload.label),
            },
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Marketing request not found")
    return link_doc


@router.delete("/{req_id}/links/{link_id}")
async def detach_link(req_id: str, link_id: str, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    await tdb.marketing_requests.update_one(
        {"id": req_id},
        {
            "$pull": {"reference_links": {"id": link_id}, "output_links": {"id": link_id}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    return {"ok": True}


# ───────────────────────── Helpers / lookups ─────────────────────────

@router.get("/lookups/departments")
async def list_departments(current_user: dict = Depends(get_current_user)):
    """Distinct departments derived from users + designations."""
    tdb = get_tenant_db()
    user_depts = await tdb.users.distinct("department")
    desig_depts = await tdb.designations.distinct("department")
    merged = sorted({(d or "").strip() for d in (user_depts or []) + (desig_depts or []) if d})
    if "Marketing" not in merged:
        merged.append("Marketing")
    return merged


@router.get("/lookups/users-by-department")
async def users_by_department(department: str, current_user: dict = Depends(get_current_user)):
    """Active users in the given department for the assignee dropdown."""
    tdb = get_tenant_db()
    # Case-insensitive match on department
    users = await tdb.users.find(
        {"department": {"$regex": f"^{department}$", "$options": "i"}, "active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1, "department": 1},
    ).sort("name", 1).to_list(500)
    return users


@router.get("/summary/dashboard")
async def request_dashboard(current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    counts = {}
    for s in LIFECYCLE_STATUSES:
        counts[s] = await tdb.marketing_requests.count_documents({"status": s})
    total = await tdb.marketing_requests.count_documents({})
    overdue = await tdb.marketing_requests.count_documents({
        "due_date": {"$lt": datetime.now(timezone.utc).date().isoformat()},
        "status": {"$nin": ["completed", "rejected"]},
    })
    return {"total": total, "by_status": counts, "overdue": overdue}
