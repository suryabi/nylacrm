"""
Marketing Requests — independent lifecycle module raised by Sales,
fulfilled by Marketing (with the ability to reassign across departments).

Lifecycle (extended):
  submitted → in_progress_marketing → internal_review → sent_to_sales
  → client_review (if approval_type == 'client') → approved
  → quantity_confirmation → production_ready → sent_for_printing → completed
  (rejected is a side-exit state reachable from any stage)

Multi-tenant. Mirrors Tasks structure but stays in its own collection so
both modules can evolve independently.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
import uuid
import logging
import secrets

from database import get_tenant_db
from deps import get_current_user

router = APIRouter()
public_router = APIRouter()  # registered without auth for client-facing endpoints
logger = logging.getLogger(__name__)

# Extended lifecycle statuses
LIFECYCLE_STATUSES = [
    "submitted",
    "in_progress_marketing",
    "internal_review",
    "sent_to_sales",
    "client_review",
    "approved",
    "quantity_confirmation",
    "production_ready",
    "sent_for_printing",
    "completed",
    "rejected",
]

# Valid forward-transition map (rejected reachable from everywhere)
ALLOWED_TRANSITIONS: Dict[str, List[str]] = {
    "submitted":             ["in_progress_marketing", "rejected"],
    "in_progress_marketing": ["internal_review", "rejected"],
    "internal_review":       ["sent_to_sales", "in_progress_marketing", "rejected"],
    "sent_to_sales":         ["client_review", "approved", "in_progress_marketing", "rejected"],
    "client_review":         ["approved", "in_progress_marketing", "rejected"],
    "approved":              ["quantity_confirmation", "rejected"],
    "quantity_confirmation": ["production_ready", "rejected"],
    "production_ready":      ["sent_for_printing", "rejected"],
    "sent_for_printing":     ["completed", "rejected"],
    "completed":             [],
    "rejected":              ["submitted"],  # reopen
}

# Ownership — who's the next actor on each status
NEXT_ACTION_OWNER = {
    "submitted":             "Marketing",
    "in_progress_marketing": "Marketing",
    "internal_review":       "Marketing Manager",
    "sent_to_sales":         "Sales",
    "client_review":         "Client",
    "approved":              "Sales",
    "quantity_confirmation": "Sales",
    "production_ready":      "Production",
    "sent_for_printing":     "Production",
    "completed":             "—",
    "rejected":              "Requester",
}

# Legacy statuses we might see in existing rows
LEGACY_STATUS_MAP = {
    "created":     "submitted",
    "assigned":    "submitted",
    "in_progress": "in_progress_marketing",
    "review":      "internal_review",
}

ACTIVITY_KIND_STATUS = "status_change"
ACTIVITY_KIND_ASSIGN = "assignment"
ACTIVITY_KIND_COMMENT = "comment"
ACTIVITY_KIND_FILE = "file"
ACTIVITY_KIND_LINK = "link"
ACTIVITY_KIND_LEAD = "lead_link"
ACTIVITY_KIND_OPTION = "design_option"
ACTIVITY_KIND_CLIENT = "client_action"


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
    title: Optional[str] = None
    description: Optional[str] = None
    request_type_id: Optional[str] = None
    custom_request_type: Optional[str] = None  # used when user picks "Other"
    priority: str = "medium"
    due_date: Optional[str] = None
    assigned_to_department: Optional[str] = "Marketing"
    assigned_to: Optional[str] = None  # Optional initially — auto-routed if empty
    lead_ids: List[str] = []
    account_id: Optional[str] = None
    input_files: List[FileRef] = []
    reference_links: List[ExternalLink] = []
    approval_type: str = "internal"  # "internal" | "client"


class MarketingRequestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    request_type_id: Optional[str] = None
    custom_request_type: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    assigned_to_department: Optional[str] = None
    assigned_to: Optional[str] = None
    lead_ids: Optional[List[str]] = None
    rejection_reason: Optional[str] = None
    approval_type: Optional[str] = None


class AdvanceStatus(BaseModel):
    to_status: str
    comment: Optional[str] = None
    rejection_reason: Optional[str] = None


class DesignOptionCreate(BaseModel):
    label: Optional[str] = None
    notes: Optional[str] = None
    files: List[FileRef] = []
    image_urls: List[str] = []


class DesignOptionUpdate(BaseModel):
    label: Optional[str] = None
    notes: Optional[str] = None
    image_urls: Optional[List[str]] = None


class OptionComment(BaseModel):
    text: str


class ClientApprove(BaseModel):
    comment: Optional[str] = None


class ClientRequestChanges(BaseModel):
    comment: str


class ClientSelectOption(BaseModel):
    option_id: str
    comment: Optional[str] = None


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

    # Normalise legacy statuses so the new UI always gets the new values
    cur_status = doc.get("status")
    if cur_status in LEGACY_STATUS_MAP:
        doc["status"] = LEGACY_STATUS_MAP[cur_status]
    doc.setdefault("approval_type", "internal")
    doc.setdefault("design_options", [])

    # Next action owner — for the UI to display prominently
    doc["next_action_owner"] = NEXT_ACTION_OWNER.get(doc.get("status"), "—")

    if doc.get("request_type_id"):
        rt = await tdb.master_request_types.find_one({"id": doc["request_type_id"]}, {"_id": 0, "name": 1, "color": 1, "icon": 1})
        if rt:
            doc["request_type_name"] = rt.get("name")
            doc["request_type_color"] = rt.get("color")
            doc["request_type_icon"] = rt.get("icon")
    elif doc.get("custom_request_type"):
        # Custom "Other" type — surface it under the same key the UI reads
        doc["request_type_name"] = doc["custom_request_type"]
    lead_ids = doc.get("lead_ids") or []
    if lead_ids:
        leads = await tdb.leads.find(
            {"id": {"$in": lead_ids}},
            {"_id": 0, "id": 1, "name": 1, "company": 1, "contact_name": 1}
        ).to_list(50)
        # Normalise to {id, name (company), company_name (contact)} for a predictable UI shape
        doc["leads_summary"] = [
            {
                "id": ld.get("id"),
                "name": ld.get("company") or ld.get("name") or ld.get("contact_name") or "Untitled Lead",
                "company_name": ld.get("contact_name") or ld.get("name") or "",
            }
            for ld in leads
        ]
        # Convenience: surface the first lead's customer name for the list view
        if doc["leads_summary"]:
            doc["customer_name"] = doc["leads_summary"][0]["name"]
    return doc


# ───────────────────────── Routes ─────────────────────────

@router.post("")
async def create_marketing_request(payload: MarketingRequestCreate, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()

    # Either a master request type OR a custom "Other" type must be supplied
    rt = None
    if payload.request_type_id:
        rt = await tdb.master_request_types.find_one({"id": payload.request_type_id, "is_active": True}, {"_id": 0})
        if not rt:
            raise HTTPException(400, "Invalid or inactive request type")
    elif not (payload.custom_request_type and payload.custom_request_type.strip()):
        raise HTTPException(400, "Request type is required")

    type_label = (rt.get("name") if rt else (payload.custom_request_type or "").strip()) or "Other"

    # Derive a sensible title when one isn't provided
    derived_title = (payload.title or "").strip()
    if not derived_title:
        # Try to enrich with first linked lead's company/name
        lead_label = ""
        if payload.lead_ids:
            ld = await tdb.leads.find_one(
                {"id": payload.lead_ids[0]},
                {"_id": 0, "name": 1, "company": 1, "contact_name": 1},
            )
            if ld:
                lead_label = ld.get("company") or ld.get("name") or ld.get("contact_name") or ""
        derived_title = f"{type_label}{(' — ' + lead_label) if lead_label else ''}"

    # Auto-route to Marketing department if no assignee specified
    assignee_name = None
    if payload.assigned_to:
        u = await tdb.users.find_one({"id": payload.assigned_to}, {"_id": 0, "name": 1, "department": 1})
        assignee_name = u.get("name") if u else None

    now_iso = datetime.now(timezone.utc).isoformat()
    initial_status = "submitted"

    doc = {
        "id": str(uuid.uuid4()),
        "title": derived_title,
        "description": payload.description,
        "request_type_id": payload.request_type_id,
        "custom_request_type": (payload.custom_request_type or "").strip() or None,
        "priority": payload.priority,
        "status": initial_status,
        "approval_type": payload.approval_type if payload.approval_type in ("internal", "client") else "internal",
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
        "design_options": [],
        "client_share_token": None,
        "client_feedback": None,
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
        "text": f":bell: *Marketing request created* — {derived_title}",
        "attachments": [{
            "color": "#6366f1",
            "fields": [
                {"title": "Type", "value": type_label, "short": True},
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

    for field in ("title", "description", "request_type_id", "priority", "due_date", "lead_ids", "rejection_reason", "approval_type"):
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
    # Merge legacy status rows into the new buckets for accurate totals
    for legacy, new in LEGACY_STATUS_MAP.items():
        legacy_count = await tdb.marketing_requests.count_documents({"status": legacy})
        counts[new] = counts.get(new, 0) + legacy_count
    total = await tdb.marketing_requests.count_documents({})
    overdue = await tdb.marketing_requests.count_documents({
        "due_date": {"$lt": datetime.now(timezone.utc).date().isoformat()},
        "status": {"$nin": ["completed", "rejected"]},
    })
    return {"total": total, "by_status": counts, "overdue": overdue}



# ───────────────────────── Workflow: advance status ─────────────────────────

@router.post("/{req_id}/advance")
async def advance_status(req_id: str, payload: AdvanceStatus, current_user: dict = Depends(get_current_user)):
    """Validate-and-advance the request through the workflow pipeline."""
    tdb = get_tenant_db()
    doc = await tdb.marketing_requests.find_one({"id": req_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Marketing request not found")

    current = doc.get("status")
    # Map legacy status so transitions work on old rows
    current = LEGACY_STATUS_MAP.get(current, current)

    target = payload.to_status
    if target not in LIFECYCLE_STATUSES:
        raise HTTPException(400, f"Invalid target status. Must be one of {LIFECYCLE_STATUSES}")

    allowed = ALLOWED_TRANSITIONS.get(current, [])
    # Special-case: if approval_type == 'internal' and current is sent_to_sales, client_review is skipped;
    # still allow jumping to 'approved' (already in the map).
    if doc.get("approval_type") == "internal" and current == "sent_to_sales" and target == "client_review":
        raise HTTPException(400, "Approval type is 'internal' — client_review is disabled for this request")

    if target not in allowed and target != current:
        raise HTTPException(400, f"Cannot transition from '{current}' to '{target}'. Allowed: {allowed}")

    updates: Dict[str, Any] = {"status": target, "updated_at": datetime.now(timezone.utc).isoformat()}
    if target == "completed":
        updates["completed_at"] = updates["updated_at"]
    if target == "rejected":
        updates["rejection_reason"] = (payload.rejection_reason or payload.comment or "No reason provided")

    push: Dict[str, Any] = {"activity": _activity(ACTIVITY_KIND_STATUS, current_user, from_status=current, to_status=target, comment=payload.comment)}
    if payload.comment:
        push = {"activity": {"$each": [
            _activity(ACTIVITY_KIND_STATUS, current_user, from_status=current, to_status=target, comment=payload.comment),
        ]}}

    await tdb.marketing_requests.update_one({"id": req_id}, {"$set": updates, "$push": push})
    refreshed = await tdb.marketing_requests.find_one({"id": req_id}, {"_id": 0})
    return await _enrich_request(tdb, refreshed)


# ───────────────────────── Design options (versioned) ─────────────────────────

@router.post("/{req_id}/options")
async def add_design_option(req_id: str, payload: DesignOptionCreate, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    doc = await tdb.marketing_requests.find_one({"id": req_id}, {"_id": 0, "design_options": 1})
    if not doc:
        raise HTTPException(404, "Marketing request not found")

    existing = doc.get("design_options") or []
    next_version = (max([o.get("version", 0) for o in existing]) + 1) if existing else 1
    now_iso = datetime.now(timezone.utc).isoformat()

    option = {
        "id": str(uuid.uuid4()),
        "version": next_version,
        "label": payload.label or f"Option v{next_version}",
        "notes": payload.notes,
        "files": [f.model_dump() if hasattr(f, "model_dump") else f for f in (payload.files or [])],
        "image_urls": payload.image_urls or [],
        "selected": False,
        "comments": [],
        "created_by": current_user["id"],
        "created_by_name": current_user.get("name"),
        "created_at": now_iso,
    }

    await tdb.marketing_requests.update_one(
        {"id": req_id},
        {
            "$push": {
                "design_options": option,
                "activity": _activity(ACTIVITY_KIND_OPTION, current_user, action="added", option_id=option["id"], version=next_version),
            },
            "$set": {"updated_at": now_iso},
        },
    )
    return option


@router.put("/{req_id}/options/{option_id}")
async def update_design_option(req_id: str, option_id: str, payload: DesignOptionUpdate, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    set_ops = {}
    if payload.label is not None:
        set_ops["design_options.$.label"] = payload.label
    if payload.notes is not None:
        set_ops["design_options.$.notes"] = payload.notes
    if payload.image_urls is not None:
        set_ops["design_options.$.image_urls"] = payload.image_urls
    if not set_ops:
        return {"ok": True}
    set_ops["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = await tdb.marketing_requests.update_one(
        {"id": req_id, "design_options.id": option_id},
        {"$set": set_ops},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Option not found")
    return {"ok": True}


@router.post("/{req_id}/options/{option_id}/select")
async def select_design_option(req_id: str, option_id: str, current_user: dict = Depends(get_current_user)):
    """Mark one option as 'selected' and clear others."""
    tdb = get_tenant_db()
    doc = await tdb.marketing_requests.find_one({"id": req_id}, {"_id": 0, "design_options": 1})
    if not doc:
        raise HTTPException(404, "Marketing request not found")
    options = doc.get("design_options") or []
    found = any(o.get("id") == option_id for o in options)
    if not found:
        raise HTTPException(404, "Option not found")
    new_options = [{**o, "selected": o.get("id") == option_id} for o in options]
    now_iso = datetime.now(timezone.utc).isoformat()
    await tdb.marketing_requests.update_one(
        {"id": req_id},
        {
            "$set": {"design_options": new_options, "updated_at": now_iso},
            "$push": {"activity": _activity(ACTIVITY_KIND_OPTION, current_user, action="selected", option_id=option_id)},
        },
    )
    return {"ok": True}


@router.post("/{req_id}/options/{option_id}/comments")
async def add_option_comment(req_id: str, option_id: str, payload: OptionComment, current_user: dict = Depends(get_current_user)):
    tdb = get_tenant_db()
    comment = {
        "id": str(uuid.uuid4()),
        "text": payload.text,
        "by_id": current_user["id"],
        "by_name": current_user.get("name"),
        "at": datetime.now(timezone.utc).isoformat(),
    }
    res = await tdb.marketing_requests.update_one(
        {"id": req_id, "design_options.id": option_id},
        {
            "$push": {"design_options.$.comments": comment, "activity": _activity(ACTIVITY_KIND_COMMENT, current_user, option_id=option_id)},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Option not found")
    return comment


# ───────────────────────── Client share link ─────────────────────────

@router.post("/{req_id}/share-link")
async def generate_share_link(req_id: str, current_user: dict = Depends(get_current_user)):
    """Generate (or return existing) public share token so the client can view & approve."""
    tdb = get_tenant_db()
    doc = await tdb.marketing_requests.find_one({"id": req_id}, {"_id": 0, "client_share_token": 1})
    if not doc:
        raise HTTPException(404, "Marketing request not found")
    token = doc.get("client_share_token") or secrets.token_urlsafe(24)
    if not doc.get("client_share_token"):
        await tdb.marketing_requests.update_one(
            {"id": req_id},
            {
                "$set": {"client_share_token": token, "updated_at": datetime.now(timezone.utc).isoformat()},
                "$push": {"activity": _activity(ACTIVITY_KIND_CLIENT, current_user, action="share_link_created")},
            },
        )
    return {"token": token, "public_path": f"/public/marketing-requests/{token}"}


# ───────────────────────── Public (client-facing, unauthenticated) ─────────────────────────

def _public_safe(doc: dict) -> dict:
    """Return a trimmed, client-facing projection."""
    return {
        "id": doc.get("id"),
        "title": doc.get("title"),
        "description": doc.get("description"),
        "request_type_name": doc.get("request_type_name") or doc.get("custom_request_type"),
        "status": LEGACY_STATUS_MAP.get(doc.get("status"), doc.get("status")),
        "approval_type": doc.get("approval_type", "internal"),
        "priority": doc.get("priority"),
        "due_date": doc.get("due_date"),
        "design_options": [
            {
                "id": o.get("id"),
                "version": o.get("version"),
                "label": o.get("label"),
                "notes": o.get("notes"),
                "files": o.get("files") or [],
                "image_urls": o.get("image_urls") or [],
                "selected": bool(o.get("selected")),
            }
            for o in (doc.get("design_options") or [])
        ],
        "client_feedback": doc.get("client_feedback"),
        "customer_name": doc.get("customer_name"),
    }


@public_router.get("/public/marketing-requests/{token}")
async def public_view_request(token: str):
    """Unauthenticated: client opens the share link to review designs."""
    tdb = get_tenant_db()
    doc = await tdb.marketing_requests.find_one({"client_share_token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Link not found or expired")
    await _enrich_request(tdb, doc)
    return _public_safe(doc)


@public_router.post("/public/marketing-requests/{token}/approve")
async def public_approve(token: str, payload: ClientApprove):
    tdb = get_tenant_db()
    doc = await tdb.marketing_requests.find_one({"client_share_token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Link not found or expired")
    now_iso = datetime.now(timezone.utc).isoformat()
    feedback = {"decision": "approve", "comment": payload.comment, "at": now_iso}
    await tdb.marketing_requests.update_one(
        {"id": doc["id"]},
        {
            "$set": {
                "client_feedback": feedback,
                "status": "approved",
                "updated_at": now_iso,
            },
            "$push": {"activity": {
                "id": str(uuid.uuid4()),
                "kind": ACTIVITY_KIND_CLIENT,
                "action": "approved",
                "comment": payload.comment,
                "by_name": "Client",
                "at": now_iso,
            }},
        },
    )
    return {"ok": True, "status": "approved"}


@public_router.post("/public/marketing-requests/{token}/request-changes")
async def public_request_changes(token: str, payload: ClientRequestChanges):
    tdb = get_tenant_db()
    doc = await tdb.marketing_requests.find_one({"client_share_token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Link not found or expired")
    now_iso = datetime.now(timezone.utc).isoformat()
    feedback = {"decision": "request_changes", "comment": payload.comment, "at": now_iso}
    await tdb.marketing_requests.update_one(
        {"id": doc["id"]},
        {
            "$set": {
                "client_feedback": feedback,
                "status": "in_progress_marketing",
                "updated_at": now_iso,
            },
            "$push": {"activity": {
                "id": str(uuid.uuid4()),
                "kind": ACTIVITY_KIND_CLIENT,
                "action": "request_changes",
                "comment": payload.comment,
                "by_name": "Client",
                "at": now_iso,
            }},
        },
    )
    return {"ok": True, "status": "in_progress_marketing"}


@public_router.post("/public/marketing-requests/{token}/select-option")
async def public_select_option(token: str, payload: ClientSelectOption):
    tdb = get_tenant_db()
    doc = await tdb.marketing_requests.find_one({"client_share_token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Link not found or expired")
    options = doc.get("design_options") or []
    if not any(o.get("id") == payload.option_id for o in options):
        raise HTTPException(404, "Option not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    new_options = [{**o, "selected": o.get("id") == payload.option_id} for o in options]
    feedback = {
        "decision": "select_option",
        "option_id": payload.option_id,
        "comment": payload.comment,
        "at": now_iso,
    }
    await tdb.marketing_requests.update_one(
        {"id": doc["id"]},
        {
            "$set": {
                "design_options": new_options,
                "client_feedback": feedback,
                "status": "approved",
                "updated_at": now_iso,
            },
            "$push": {"activity": {
                "id": str(uuid.uuid4()),
                "kind": ACTIVITY_KIND_CLIENT,
                "action": "selected_option",
                "option_id": payload.option_id,
                "comment": payload.comment,
                "by_name": "Client",
                "at": now_iso,
            }},
        },
    )
    return {"ok": True, "status": "approved", "selected_option_id": payload.option_id}
