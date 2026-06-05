"""Marketing Requests — State-Machine-driven lifecycle router.

This module is fully driven by the State Machine attached to the
"marketing_requests" workflow. The SM defines:
  - the list of states (keys, labels, colors, initial, terminal)
  - the transitions between them (action_key + action_label + from/to states)
  - auto-assign side-effects (user / department / role) per transition
  - permission gates per transition (allowed_role_keys / allowed_department_ids / requestor_only)

A default SM is auto-seeded on first access if none is attached.

Endpoints (prefix `/marketing-requests`):
  POST   /upload                          upload a single file → returns file handle
  GET    /files/{file_id}                 download a file
  POST   /                                create a request (initial state from SM)
  GET    /                                list (with queue + search + filters + paging)
  GET    /counts                          per-state counts (state_key → count)
  GET    /{id}                            detail
  PATCH  /{id}                            edit a few mutable header fields
  GET    /{id}/available-transitions      list of transitions the current user can trigger
  POST   /{id}/transition                 trigger an action_key (validates + applies auto-assign + comment)
  POST   /{id}/comments                   add a comment
  POST   /{id}/versions                   add a work version (files + links + notes)
  POST   /{id}/production-submit          attach a production payload (does NOT change state)
"""
from datetime import datetime, timezone, date, timedelta
from typing import List, Optional
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Query, Response
from pydantic import BaseModel

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from utils.storage import put_object, get_object
from utils.sm_helpers import (
    ensure_default_marketing_request_sm,
    get_attached_state_machine,
    get_initial_state,
    find_state,
    find_transition,
    find_transitions_from,
    user_can_trigger,
    apply_auto_assign,
)
from models.marketing_request import (
    MarketingRequestCreate, CommentCreate, VersionCreate, ProductionSubmitRequest,
    StoredFile, FileVersion, RequestComment, ProductionSubmission,
)
from routes.slack import post_event_message as slack_post_event
from utils.notify import notify_users
import os

logger = logging.getLogger(__name__)
router = APIRouter()


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────
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


async def _resolve_sm(tenant_id: str) -> dict:
    """Get the SM attached to marketing_requests, or seed a default if none exists."""
    return await ensure_default_marketing_request_sm(tenant_id)


def _user_departments_lower(user: dict) -> List[str]:
    d = user.get("department") or []
    if isinstance(d, str):
        d = [d]
    return [str(x).strip().lower() for x in d if x]


# ──────────────────────────────────────────────────────────────
# File upload (re-usable across logo, references, version files)
# ──────────────────────────────────────────────────────────────
@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    lead_id: Optional[str] = Query(None, description="Optional human-readable Lead ID to scope upload under that lead's Drive folder"),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    file_id = str(uuid.uuid4())
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file")
    safe_name = (file.filename or "upload.bin").replace("/", "_")
    if lead_id:
        try:
            from utils.google_drive_storage import ensure_lead_folder
            await ensure_lead_folder(tenant_id, lead_id)
        except Exception:
            pass
        path = f"{lead_id}/marketing-requests/{file_id}/{safe_name}"
    else:
        path = f"nyla-crm/{tenant_id}/marketing-requests/{file_id}/{safe_name}"

    try:
        meta = await put_object(path, raw, file.content_type or "application/octet-stream")
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
        data, ctype = await get_object(row["path"])
    except Exception as e:
        raise HTTPException(502, f"Storage fetch failed: {e}")
    headers = {"Content-Disposition": f'inline; filename="{row.get("filename", "file")}"'}
    return Response(content=data, media_type=row.get("content_type") or ctype or "application/octet-stream", headers=headers)


# ──────────────────────────────────────────────────────────────
# Create a request — initial state comes from the attached SM
# ──────────────────────────────────────────────────────────────
@router.post("")
@router.post("/")
async def create_request(payload: MarketingRequestCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()

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

    # Optional lead this request is raised for
    lead = None
    if payload.lead_id:
        lead = await db.leads.find_one({"id": payload.lead_id, "tenant_id": tenant_id}, {"_id": 0})
        if not lead:
            raise HTTPException(400, "Lead not found")

    # Lead-time guardrail
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
            f"({required_days} days → earliest {earliest}). Provide a `short_timeline_reason` to proceed.",
        )

    # State machine — seed default if none attached
    sm = await _resolve_sm(tenant_id)
    initial = get_initial_state(sm)
    if not initial:
        raise HTTPException(500, "Attached state machine has no initial state")

    logo_doc = None
    if payload.logo_file_id:
        f = await _get_file(tenant_id, payload.logo_file_id)
        if f:
            logo_doc = StoredFile(**f).model_dump()
    ref_docs = await _stored_files_from_ids(tenant_id, payload.reference_file_ids or [])

    doc = {
        "id": str(uuid.uuid4()),
        "request_number": await _next_request_number(tenant_id),
        "tenant_id": tenant_id,
        "title": (payload.title or type_doc["name"]),
        "request_type_id": type_doc["id"],
        "request_type_name": type_doc["name"],
        "assigned_department_id": dept_doc["id"],
        "assigned_department_name": dept_doc["name"],
        "assigned_user_id": None,
        "assigned_user_name": None,
        "assigned_role": None,
        "lead_id": payload.lead_id,
        "lead_name": (lead.get("contact_person") or lead.get("name") or lead.get("company")) if lead else None,
        "lead_company": lead.get("company") if lead else None,
        "requested_due_date": payload.requested_due_date,
        "requirement_details": payload.requirement_details,
        "design_lead_time_days": int(type_doc.get("design_lead_time_days") or 0),
        "production_lead_time_days": int(type_doc.get("production_lead_time_days") or 0),
        "short_timeline_reason": payload.short_timeline_reason,
        "logo": logo_doc,
        "references": ref_docs,
        "social_media_links": payload.social_media_links or [],
        "file_links": payload.file_links or [],
        "additional_comments": payload.additional_comments,
        # SM-driven state
        "state_machine_id": sm["id"],
        "state_machine_name": sm.get("name"),
        "current_state_key": initial["key"],
        "current_state_label": initial.get("label") or initial["key"],
        "current_state_color": initial.get("color") or "#94a3b8",
        # Legacy aliases for back-compat (frontend may still reference these)
        "status_key": initial["key"],
        "status_name": initial.get("label") or initial["key"],
        "versions": [],
        "comments": [],
        "production": None,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name") or current_user.get("email"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    doc["comments"].append(RequestComment(
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or "User",
        text=f"Request {doc['request_number']} created. State: {doc['current_state_label']}.",
        kind="system",
    ).model_dump())
    await db.marketing_requests.insert_one(doc)
    doc.pop("_id", None)

    # Slack notification (best-effort)
    try:
        await slack_post_event(
            tenant_id=tenant_id,
            event_type="marketing_request_created",
            text=(
                f":memo: *New marketing request* `{doc['request_number']}` — {doc['title']}\n"
                f"Type: {doc['request_type_name']} · Assigned to: {doc['assigned_department_name']}\n"
                f"Requested due: {doc['requested_due_date']} · Raised by: {doc['created_by_name']}"
            ),
        )
    except Exception:
        logger.exception("Slack notification failed for new marketing request")
    return doc


# ──────────────────────────────────────────────────────────────
# List + counts (queues are simple filters; state filter via query)
# ──────────────────────────────────────────────────────────────
@router.get("")
@router.get("/")
async def list_requests(
    queue: str = "all",
    search: Optional[str] = None,
    state_key: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    sort: str = "-created_at",
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    page = max(page, 1)
    limit = max(min(limit, 100), 1)

    q: dict = {"tenant_id": tenant_id}
    if queue == "my_raised":
        q["created_by"] = current_user.get("id")
    elif queue == "my_assigned":
        # Either directly assigned, or my role/department was auto-assigned
        user_depts = _user_departments_lower(current_user)
        user_role = (current_user.get("role") or "").strip()
        ors: list = [{"assigned_user_id": current_user.get("id")}]
        if user_depts:
            # match by case-insensitive department name
            ors.append({"assigned_department_name": {"$regex": f"^({'|'.join(user_depts)})$", "$options": "i"}})
        if user_role:
            ors.append({"assigned_role": {"$regex": f"^{user_role}$", "$options": "i"}})
        q["$or"] = ors
    if state_key:
        q["current_state_key"] = state_key
    if search:
        s = {"$regex": search, "$options": "i"}
        text_ors = [
            {"request_number": s}, {"title": s}, {"request_type_name": s},
            {"requirement_details": s},
        ]
        if "$or" in q:
            q = {"$and": [q, {"$or": text_ors}]}
        else:
            q["$or"] = text_ors

    total = await db.marketing_requests.count_documents(q)
    sort_field = sort.lstrip("-+")
    sort_dir = -1 if sort.startswith("-") else 1
    rows = await db.marketing_requests.find(q, {"_id": 0}).sort(sort_field, sort_dir).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {
        "items": rows, "total": total, "page": page, "limit": limit,
        "pages": (total + limit - 1) // limit if total else 0,
    }


@router.get("/counts")
async def state_counts(current_user: dict = Depends(get_current_user)):
    """Return total count + per-state-key counts + per-queue counts."""
    tenant_id = get_current_tenant_id()
    sm = await _resolve_sm(tenant_id)
    state_keys = [s["key"] for s in (sm.get("states") or [])]

    pipeline = [
        {"$match": {"tenant_id": tenant_id}},
        {"$group": {"_id": "$current_state_key", "n": {"$sum": 1}}},
    ]
    by_state = {s: 0 for s in state_keys}
    total = 0
    async for row in db.marketing_requests.aggregate(pipeline):
        total += row["n"]
        if row["_id"] in by_state:
            by_state[row["_id"]] = row["n"]
        else:
            # state was deleted from SM but doc still references it
            by_state[row["_id"] or "_unknown"] = row["n"]

    # My queues
    my_raised = await db.marketing_requests.count_documents(
        {"tenant_id": tenant_id, "created_by": current_user.get("id")}
    )
    user_depts = _user_departments_lower(current_user)
    user_role = (current_user.get("role") or "").strip()
    assigned_or = [{"assigned_user_id": current_user.get("id")}]
    if user_depts:
        assigned_or.append({"assigned_department_name": {"$regex": f"^({'|'.join(user_depts)})$", "$options": "i"}})
    if user_role:
        assigned_or.append({"assigned_role": {"$regex": f"^{user_role}$", "$options": "i"}})
    my_assigned = await db.marketing_requests.count_documents({"tenant_id": tenant_id, "$or": assigned_or})

    return {
        "total": total,
        "by_state": by_state,
        "queues": {"my_raised": my_raised, "my_assigned": my_assigned, "all": total},
        "states": sm.get("states") or [],
        "state_machine_id": sm["id"],
        "state_machine_name": sm.get("name"),
    }


# ──────────────────────────────────────────────────────────────
# State machine surface — for the detail page
# ──────────────────────────────────────────────────────────────
@router.get("/state-machine")
async def get_state_machine(current_user: dict = Depends(get_current_user)):
    """Return the SM currently attached to marketing_requests (auto-seeds if missing)."""
    tenant_id = get_current_tenant_id()
    sm = await _resolve_sm(tenant_id)
    return sm


# ──────────────────────────────────────────────────────────────
# Detail
# ──────────────────────────────────────────────────────────────
@router.get("/{request_id}")
async def get_request(request_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    return doc


@router.get("/{request_id}/available-transitions")
async def available_transitions(request_id: str, current_user: dict = Depends(get_current_user)):
    """Return the set of transitions the current user can trigger from this request's current state."""
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"_id": 0, "current_state_key": 1, "state_machine_id": 1, "created_by": 1},
    )
    if not doc:
        raise HTTPException(404, "Request not found")

    sm = await _resolve_sm(tenant_id)
    transitions = find_transitions_from(sm, doc.get("current_state_key") or "")
    out = []
    for t in transitions:
        allowed = await user_can_trigger(t, current_user, tenant_id, doc.get("created_by"))
        target_state = find_state(sm, t.get("to_state") or "")
        out.append({
            "action_key": t.get("action_key"),
            "action_label": t.get("action_label") or t.get("action_key"),
            "from_state": t.get("from_state"),
            "to_state": t.get("to_state"),
            "to_state_label": (target_state or {}).get("label") or t.get("to_state"),
            "to_state_color": (target_state or {}).get("color"),
            "comment_required": bool(t.get("comment_required")),
            "auto_assign_mode": t.get("auto_assign_mode"),
            "requestor_only": bool(t.get("requestor_only")),
            "allowed": allowed,
        })
    return {"current_state_key": doc.get("current_state_key"), "transitions": out}


# ──────────────────────────────────────────────────────────────
# Transition — SM drives validation, auto-assign, side-effects
# ──────────────────────────────────────────────────────────────
class TransitionRequest(BaseModel):
    action_key: str
    comment: Optional[str] = None


@router.post("/{request_id}/transition")
async def trigger_transition(request_id: str, payload: TransitionRequest, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")

    sm = await _resolve_sm(tenant_id)
    current_key = doc.get("current_state_key") or ""
    transition = find_transition(sm, current_key, payload.action_key)
    if not transition:
        raise HTTPException(400, f"No transition for action '{payload.action_key}' from state '{current_key}'")

    # Permission gate
    if not await user_can_trigger(transition, current_user, tenant_id, doc.get("created_by")):
        raise HTTPException(403, "You don't have permission to trigger this action.")
    if transition.get("comment_required") and not (payload.comment and payload.comment.strip()):
        raise HTTPException(400, "A comment is required for this transition.")

    target_state = find_state(sm, transition.get("to_state") or "")
    if not target_state:
        raise HTTPException(500, f"Target state '{transition.get('to_state')}' not found in SM")

    # Apply auto-assign
    assign = await apply_auto_assign(transition, tenant_id, doc.get("created_by"))

    set_doc = {
        "current_state_key": target_state["key"],
        "current_state_label": target_state.get("label") or target_state["key"],
        "current_state_color": target_state.get("color"),
        "status_key": target_state["key"],
        "status_name": target_state.get("label") or target_state["key"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    # Overwrite assignment when this transition specifies one
    if transition.get("auto_assign_mode"):
        set_doc["assigned_user_id"] = assign["assigned_user_id"]
        set_doc["assigned_user_name"] = assign["assigned_user_name"]
        if assign["assigned_department_id"]:
            set_doc["assigned_department_id"] = assign["assigned_department_id"]
            set_doc["assigned_department_name"] = assign["assigned_department_name"]
        set_doc["assigned_role"] = assign["assigned_role"]

    timeline_lines = [
        payload.comment or f"{transition.get('action_label') or transition['action_key']} → {target_state.get('label') or target_state['key']}",
    ]
    if assign.get("assignee_label"):
        timeline_lines.append(f"Auto-assigned to {assign['assignee_label']}.")

    timeline_event = RequestComment(
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email") or "User",
        text="\n".join(timeline_lines),
        kind="status_change",
    ).model_dump()

    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": set_doc, "$push": {"comments": timeline_event}},
    )
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})

    # Notify the resolved assignee(s) — in-app + email — when this transition
    # opts in via "Notify assignee". Best-effort; never breaks the transition.
    if transition.get("notify_assignee") and assign.get("assignee_user_ids"):
        try:
            actor_id = current_user.get("id")
            recipients = [uid for uid in assign["assignee_user_ids"] if uid and uid != actor_id]
            if recipients:
                base = os.environ.get("APP_BASE_URL", "").rstrip("/")
                link = f"{base}/marketing-requests/{request_id}"
                state_label = target_state.get("label") or target_state["key"]
                actor = current_user.get("name") or current_user.get("email") or "Someone"
                await notify_users(
                    tenant_id,
                    recipients,
                    title=f"{doc.get('request_number')}: assigned to you",
                    body=(
                        f"\"{doc.get('title', '')}\" moved to '{state_label}' and was assigned to you "
                        f"by {actor}. Action may be required."
                    ),
                    link=link,
                    kind="marketing_request_assignment",
                    entity_type="marketing_request",
                    entity_id=request_id,
                )
        except Exception:
            logger.exception("Assignee notification failed for marketing request transition")

    # Slack notification (best-effort)
    try:
        await slack_post_event(
            tenant_id=tenant_id,
            event_type="marketing_request_status_changed",
            text=(
                f":arrows_counterclockwise: *{doc['request_number']}* "
                f"→ *{target_state.get('label') or target_state['key']}*\n"
                f"{doc.get('title','')} · by {current_user.get('name') or current_user.get('email')}"
                + (f"\n_Auto-assigned to {assign['assignee_label']}_" if assign.get("assignee_label") else "")
                + (f"\n_{payload.comment}_" if payload.comment else "")
            ),
        )
    except Exception:
        logger.exception("Slack notification failed for marketing request transition")

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
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found")
    if (payload.kind or "comment") == "comment":
        try:
            parent = await db.marketing_requests.find_one(
                {"id": request_id, "tenant_id": tenant_id},
                {"_id": 0, "request_number": 1, "title": 1},
            )
            if parent:
                await slack_post_event(
                    tenant_id=tenant_id,
                    event_type="marketing_request_commented",
                    text=(
                        f":speech_balloon: *{parent.get('request_number')}* — {parent.get('title','')}\n"
                        f"New comment by {event['user_name']}:\n_{event['text']}_"
                    ),
                )
        except Exception:
            logger.exception("Slack notification failed for marketing request comment")
    return event


# ──────────────────────────────────────────────────────────────
# Versions — work files (versioned)
# ──────────────────────────────────────────────────────────────
@router.post("/{request_id}/versions")
async def add_version(request_id: str, payload: VersionCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")

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
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return version


# ──────────────────────────────────────────────────────────────
# Production submission — records the payload; state changes are SM-driven
# ──────────────────────────────────────────────────────────────
@router.post("/{request_id}/production-submit")
async def submit_for_production(request_id: str, payload: ProductionSubmitRequest, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")

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
        {"$set": {"production": sub, "updated_at": datetime.now(timezone.utc).isoformat()},
         "$push": {"comments": RequestComment(
             user_id=current_user.get("id"),
             user_name=current_user.get("name") or "User",
             text=f"Submitted for production to {delivery_dept['name']} — qty {payload.quantity_required}.",
             kind="system",
         ).model_dump()}},
    )
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    return doc
