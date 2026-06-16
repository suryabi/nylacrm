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
import csv
import io
import re

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Query, Response
from pydantic import BaseModel

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from utils.storage import put_object, get_object, delete_object
from utils.sm_helpers import (
    ensure_default_marketing_request_sm,
    get_attached_state_machine,
    get_initial_state,
    find_state,
    find_transition,
    find_transitions_from,
    user_can_trigger,
    apply_auto_assign,
    evaluate_guards,
    evaluate_required_fields,
    applicable_required_fields,
    _is_admin,
)
from models.marketing_request import (
    MarketingRequestCreate, CommentCreate, VersionCreate, ProductionSubmitRequest,
    StoredFile, FileVersion, RequestComment, ProductionSubmission,
    VersionComment, VersionCommentCreate,
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


def _slack_lead_line(doc: dict) -> str:
    """Build a '\nLead: ...' line for Slack messages when a lead is attached."""
    name = (doc.get("lead_name") or "").strip()
    company = (doc.get("lead_company") or "").strip()
    if company and name and company != name:
        return f"\n:bust_in_silhouette: Lead: {company} — {name}"
    label = company or name
    return f"\n:bust_in_silhouette: Lead: {label}" if label else ""


async def _can_delete_request(tenant_id: str, user: dict) -> bool:
    """Admin roles can always delete; other roles need the explicit
    `marketing_requests.delete` permission configured in Role Management."""
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
    return bool((perms.get("marketing_requests") or {}).get("delete"))


async def _can_edit_request(tenant_id: str, user: dict, request_doc: dict) -> bool:
    """Admins can always edit; the original requester can edit their own
    request; any other role needs the `marketing_requests.edit` permission."""
    if _is_admin(user):
        return True
    if request_doc.get("created_by") and request_doc.get("created_by") == user.get("id"):
        return True
    role_name = (user.get("role") or "").strip()
    if not role_name:
        return False
    role = await db.roles.find_one(
        {"tenant_id": tenant_id, "name": {"$regex": f"^{re.escape(role_name)}$", "$options": "i"}},
        {"_id": 0, "permissions": 1},
    )
    perms = (role or {}).get("permissions") or {}
    return bool((perms.get("marketing_requests") or {}).get("edit"))


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


@router.delete("/{request_id}/files/{file_id}")
async def delete_request_file(request_id: str, file_id: str, current_user: dict = Depends(get_current_user)):
    """Detach a logo/reference file from a request and best-effort remove the underlying object.

    Blocked once the request has been submitted for production (assets are locked).
    """
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    if doc.get("production"):
        raise HTTPException(400, "Files are locked — this request has been submitted for production.")

    set_doc: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    removed_name = None
    logo = doc.get("logo")
    if logo and logo.get("id") == file_id:
        set_doc["logo"] = None
        removed_name = logo.get("filename") or "logo"
    else:
        refs = doc.get("references") or []
        kept = [r for r in refs if r.get("id") != file_id]
        if len(kept) != len(refs):
            set_doc["references"] = kept
            removed_name = next((r.get("filename") for r in refs if r.get("id") == file_id), "file")
    if removed_name is None:
        raise HTTPException(404, "File is not attached to this request")

    comment = RequestComment(
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email") or "User",
        text=f"Removed attachment '{removed_name}'.",
        kind="system",
    ).model_dump()
    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": set_doc, "$push": {"comments": comment}},
    )

    # Best-effort cleanup of the underlying object + file record (never breaks the request).
    file_row = await _get_file(tenant_id, file_id)
    if file_row:
        try:
            await delete_object(file_row.get("path"))
        except Exception:
            logger.exception("Storage delete failed for marketing-request file %s", file_id)
        await db.marketing_request_files.delete_one({"id": file_id, "tenant_id": tenant_id})

    updated = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    return updated


@router.delete("/{request_id}")
async def delete_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Permanently delete a design (marketing) request and all its attached files.

    Guarded by RBAC: admin roles always; other roles need the explicit
    `marketing_requests.delete` permission.
    """
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    if not await _can_delete_request(tenant_id, current_user):
        raise HTTPException(403, "You don't have permission to delete design requests.")

    # Collect every file id attached to this request (logo, references, version files).
    file_ids: set = set()
    logo = doc.get("logo")
    if logo and logo.get("id"):
        file_ids.add(logo["id"])
    for r in (doc.get("references") or []):
        if r.get("id"):
            file_ids.add(r["id"])
    for v in (doc.get("versions") or []):
        for f in (v.get("files") or []):
            if f.get("id"):
                file_ids.add(f["id"])

    # Best-effort: remove the underlying objects from storage, then the file records.
    if file_ids:
        rows = await db.marketing_request_files.find(
            {"id": {"$in": list(file_ids)}, "tenant_id": tenant_id}, {"_id": 0, "path": 1}
        ).to_list(len(file_ids))
        for row in rows:
            if row.get("path"):
                try:
                    await delete_object(row["path"])
                except Exception:
                    logger.exception("Storage delete failed for path %s during request delete", row.get("path"))
        await db.marketing_request_files.delete_many({"id": {"$in": list(file_ids)}, "tenant_id": tenant_id})

    await db.marketing_requests.delete_one({"id": request_id, "tenant_id": tenant_id})
    return {"deleted": True, "id": request_id}


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
        "is_urgent": bool(payload.is_urgent),
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
        # Structured status history for time-in-status auditing
        "status_history": [{
            "state_key": initial["key"],
            "state_label": initial.get("label") or initial["key"],
            "state_color": initial.get("color") or "#94a3b8",
            "entered_at": datetime.now(timezone.utc).isoformat(),
            "by_user_id": current_user.get("id"),
            "by_user_name": current_user.get("name") or current_user.get("email"),
        }],
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
                f"{':red_circle: *URGENT* — ' if doc.get('is_urgent') else ''}"
                f":memo: *New marketing request* `{doc['request_number']}` — {doc['title']}\n"
                f"Type: {doc['request_type_name']} · Assigned to: {doc['assigned_department_name']}\n"
                f"Requested due: {doc['requested_due_date']} · Raised by: {doc['created_by_name']}"
                + _slack_lead_line(doc)
            ),
        )
    except Exception:
        logger.exception("Slack notification failed for new marketing request")
    return doc


@router.put("/{request_id}")
@router.patch("/{request_id}")
async def update_request(request_id: str, payload: MarketingRequestCreate, current_user: dict = Depends(get_current_user)):
    """Edit an existing design/marketing request. Allowed for the original
    requester and admins/managers with the `marketing_requests.edit`
    permission, at any state. State-machine progress, versions, comments and
    production are preserved — only the request's descriptive fields change."""
    tenant_id = get_current_tenant_id()
    existing = await db.marketing_requests.find_one(
        {"id": request_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(404, "Request not found")
    if not await _can_edit_request(tenant_id, current_user, existing):
        raise HTTPException(403, "You don't have permission to edit this request")

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

    lead = None
    if payload.lead_id:
        lead = await db.leads.find_one({"id": payload.lead_id, "tenant_id": tenant_id}, {"_id": 0})
        if not lead:
            raise HTTPException(400, "Lead not found")

    # Same lead-time guardrail as creation
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

    logo_doc = None
    if payload.logo_file_id:
        f = await _get_file(tenant_id, payload.logo_file_id)
        if f:
            logo_doc = StoredFile(**f).model_dump()
    ref_docs = await _stored_files_from_ids(tenant_id, payload.reference_file_ids or [])

    update = {
        "title": (payload.title or type_doc["name"]),
        "request_type_id": type_doc["id"],
        "request_type_name": type_doc["name"],
        "assigned_department_id": dept_doc["id"],
        "assigned_department_name": dept_doc["name"],
        "lead_id": payload.lead_id,
        "lead_name": (lead.get("contact_person") or lead.get("name") or lead.get("company")) if lead else None,
        "lead_company": lead.get("company") if lead else None,
        "requested_due_date": payload.requested_due_date,
        "requirement_details": payload.requirement_details,
        "design_lead_time_days": int(type_doc.get("design_lead_time_days") or 0),
        "production_lead_time_days": int(type_doc.get("production_lead_time_days") or 0),
        "short_timeline_reason": payload.short_timeline_reason,
        "is_urgent": bool(payload.is_urgent),
        "logo": logo_doc,
        "references": ref_docs,
        "social_media_links": payload.social_media_links or [],
        "file_links": payload.file_links or [],
        "additional_comments": payload.additional_comments,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    sys_comment = RequestComment(
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or "User",
        text=f"Request details edited by {current_user.get('name') or current_user.get('email')}.",
        kind="system",
    ).model_dump()
    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": update, "$push": {"comments": sys_comment}},
    )
    doc = await db.marketing_requests.find_one(
        {"id": request_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    return doc


# ──────────────────────────────────────────────────────────────
# Quick toggle — flag/unflag a request as URGENT without a full edit
# ──────────────────────────────────────────────────────────────
class UrgentUpdate(BaseModel):
    is_urgent: bool


@router.patch("/{request_id}/urgent")
async def set_request_urgent(request_id: str, payload: UrgentUpdate, current_user: dict = Depends(get_current_user)):
    """Flag or unflag a design/marketing request as urgent. Allowed for the
    original requester and admins/managers with edit permission."""
    tenant_id = get_current_tenant_id()
    existing = await db.marketing_requests.find_one(
        {"id": request_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(404, "Request not found")
    if not await _can_edit_request(tenant_id, current_user, existing):
        raise HTTPException(403, "You don't have permission to change this request")

    is_urgent = bool(payload.is_urgent)
    sys_comment = RequestComment(
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or "User",
        text=(f"Marked as URGENT by {current_user.get('name') or current_user.get('email')}."
              if is_urgent else
              f"Urgent flag removed by {current_user.get('name') or current_user.get('email')}."),
        kind="system",
    ).model_dump()
    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {"is_urgent": is_urgent, "updated_at": datetime.now(timezone.utc).isoformat()},
         "$push": {"comments": sys_comment}},
    )
    if is_urgent:
        try:
            await slack_post_event(
                tenant_id=tenant_id,
                event_type="marketing_request_urgent",
                text=(f":red_circle: *URGENT* design request `{existing.get('request_number')}` — "
                      f"{existing.get('title')} (assigned to {existing.get('assigned_department_name')})"),
            )
        except Exception:
            logger.exception("Slack notification failed for urgent flag")
    doc = await db.marketing_requests.find_one(
        {"id": request_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    return doc
def _build_requests_query(tenant_id, current_user, queue, search, state_key, request_type_id, assigned_department_id, created_by):
    """Shared Mongo query builder for the list + export endpoints."""
    q: dict = {"tenant_id": tenant_id}
    if queue == "my_raised":
        q["created_by"] = current_user.get("id")
    elif queue == "my_assigned":
        # Either directly assigned, or my role/department was auto-assigned
        user_depts = _user_departments_lower(current_user)
        user_role = (current_user.get("role") or "").strip()
        ors: list = [{"assigned_user_id": current_user.get("id")}]
        if user_depts:
            ors.append({"assigned_department_name": {"$regex": f"^({'|'.join(user_depts)})$", "$options": "i"}})
        if user_role:
            ors.append({"assigned_role": {"$regex": f"^{user_role}$", "$options": "i"}})
        q["$or"] = ors
    # Explicit filters (AND with the queue/search clauses)
    if request_type_id:
        q["request_type_id"] = request_type_id
    if assigned_department_id:
        q["assigned_department_id"] = assigned_department_id
    if created_by:
        q["created_by"] = created_by
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
    return q


@router.get("")
@router.get("/")
async def list_requests(
    queue: str = "all",
    search: Optional[str] = None,
    state_key: Optional[str] = None,
    request_type_id: Optional[str] = None,
    assigned_department_id: Optional[str] = None,
    created_by: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    no_limit: bool = False,
    sort: str = "-created_at",
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    page = max(page, 1)

    q = _build_requests_query(tenant_id, current_user, queue, search, state_key, request_type_id, assigned_department_id, created_by)

    total = await db.marketing_requests.count_documents(q)
    sort_field = sort.lstrip("-+")
    sort_dir = -1 if sort.startswith("-") else 1

    # Board/Kanban needs every matching request (no pagination cap).
    if no_limit:
        rows = await db.marketing_requests.find(q, {"_id": 0}).sort(sort_field, sort_dir).to_list(2000)
        return {"items": rows, "total": total, "page": 1, "limit": total, "pages": 1}

    limit = max(min(limit, 100), 1)
    rows = await db.marketing_requests.find(q, {"_id": 0}).sort(sort_field, sort_dir).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {
        "items": rows, "total": total, "page": page, "limit": limit,
        "pages": (total + limit - 1) // limit if total else 0,
    }


class BoardReorder(BaseModel):
    state_key: Optional[str] = None
    ordered_ids: List[str] = []


@router.post("/board-reorder")
async def board_reorder(payload: BoardReorder, current_user: dict = Depends(get_current_user)):
    """Persist the team-wide priority order of requests within a Kanban column.
    `ordered_ids` is the full top-to-bottom order for one state column."""
    tenant_id = get_current_tenant_id()
    if not payload.ordered_ids:
        return {"ok": True, "count": 0}
    for idx, rid in enumerate(payload.ordered_ids):
        await db.marketing_requests.update_one(
            {"id": rid, "tenant_id": tenant_id},
            {"$set": {"board_rank": idx}},
        )
    return {"ok": True, "count": len(payload.ordered_ids)}


@router.get("/export")
async def export_requests(
    queue: str = "all",
    search: Optional[str] = None,
    state_key: Optional[str] = None,
    request_type_id: Optional[str] = None,
    assigned_department_id: Optional[str] = None,
    created_by: Optional[str] = None,
    sort: str = "-created_at",
    current_user: dict = Depends(get_current_user),
):
    """Export the currently-filtered requests as CSV (all matching rows)."""
    tenant_id = get_current_tenant_id()
    q = _build_requests_query(tenant_id, current_user, queue, search, state_key, request_type_id, assigned_department_id, created_by)
    sort_field = sort.lstrip("-+")
    sort_dir = -1 if sort.startswith("-") else 1
    rows = await db.marketing_requests.find(q, {"_id": 0}).sort(sort_field, sort_dir).to_list(5000)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Request #", "Type", "State", "Assigned Team", "Assigned To",
        "Lead", "Requested Due Date", "Raised By", "Created At", "Requirement Details",
    ])
    for r in rows:
        assigned_to = r.get("assigned_user_name") or (f"Role: {r['assigned_role']}" if r.get("assigned_role") else "")
        writer.writerow([
            r.get("request_number", ""),
            r.get("request_type_name", ""),
            r.get("current_state_label") or r.get("current_state_key", ""),
            r.get("assigned_department_name", ""),
            assigned_to,
            r.get("lead_company") or r.get("lead_name") or "",
            r.get("requested_due_date", ""),
            r.get("created_by_name", ""),
            (r.get("created_at", "") or "")[:10],
            (r.get("requirement_details") or "").replace("\n", " ").strip(),
        ])

    filename = f"marketing-requests-{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
    # Backfill status history for requests created before history tracking existed.
    if not doc.get("status_history"):
        doc["status_history"] = [{
            "state_key": doc.get("current_state_key"),
            "state_label": doc.get("current_state_label") or doc.get("current_state_key"),
            "state_color": doc.get("current_state_color") or "#94a3b8",
            "entered_at": doc.get("created_at"),
            "by_user_id": doc.get("created_by"),
            "by_user_name": doc.get("created_by_name"),
            "backfilled": True,
        }]
    return doc


class EstimatedDateUpdate(BaseModel):
    estimated_finished_date: Optional[str] = None  # ISO date (YYYY-MM-DD) or null to clear


@router.patch("/{request_id}/estimated-date")
async def set_estimated_finished_date(
    request_id: str,
    payload: EstimatedDateUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Set/clear the team's estimated finished date for a request."""
    tenant_id = get_current_tenant_id()
    value = (payload.estimated_finished_date or "").strip() or None
    if value:
        try:
            value = date.fromisoformat(value[:10]).isoformat()
        except ValueError:
            raise HTTPException(400, "estimated_finished_date must be an ISO date (YYYY-MM-DD)")

    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")

    user_name = current_user.get("name") or current_user.get("email") or "User"
    note = (
        f"Estimated finish date set to {value}" if value
        else "Estimated finish date cleared"
    )
    audit = RequestComment(
        user_id=current_user.get("id"),
        user_name=user_name,
        text=note,
        kind="system",
    ).model_dump()

    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {
            "$set": {
                "estimated_finished_date": value,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            "$push": {"comments": audit},
        },
    )
    return {"estimated_finished_date": value}


@router.get("/{request_id}/available-transitions")
async def available_transitions(request_id: str, current_user: dict = Depends(get_current_user)):
    """Return the set of transitions the current user can trigger from this request's current state."""
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one(
        {"id": request_id, "tenant_id": tenant_id}, {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Request not found")

    sm = await _resolve_sm(tenant_id)
    transitions = find_transitions_from(sm, doc.get("current_state_key") or "")
    out = []
    for t in transitions:
        allowed = await user_can_trigger(t, current_user, tenant_id, doc.get("created_by"))
        target_state = find_state(sm, t.get("to_state") or "")
        guards_ok, block_reasons = evaluate_guards(t.get("guards"), doc)
        req_fields = applicable_required_fields(t.get("required_fields"), doc)
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
            "guards_ok": guards_ok,
            "block_reasons": block_reasons,
            "required_fields": req_fields,
        })
    return {"current_state_key": doc.get("current_state_key"), "transitions": out}


# ──────────────────────────────────────────────────────────────
# Transition — SM drives validation, auto-assign, side-effects
# ──────────────────────────────────────────────────────────────
class TransitionRequest(BaseModel):
    action_key: str
    comment: Optional[str] = None
    field_data: Optional[dict] = None


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

    # Guard gate — preconditions on existing data (e.g. "≥ 2 reference files").
    guards_ok, guard_reasons = evaluate_guards(transition.get("guards"), doc)
    if not guards_ok:
        raise HTTPException(400, " ".join(guard_reasons) or "This action is blocked by a workflow rule.")

    # Required-field gate — capture new data (e.g. neck-tag quantity).
    fields_ok, field_errors, captured = evaluate_required_fields(
        transition.get("required_fields"), doc, payload.field_data,
    )
    if not fields_ok:
        raise HTTPException(400, " ".join(field_errors) or "Required information is missing.")

    target_state = find_state(sm, transition.get("to_state") or "")
    if not target_state:
        raise HTTPException(400, f"Target state '{transition.get('to_state')}' not found in SM")

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

    # Persist captured field values keyed by action (generic transition_data map).
    if captured:
        existing_td = doc.get("transition_data") or {}
        existing_td[payload.action_key] = {
            **captured,
            "_captured_at": datetime.now(timezone.utc).isoformat(),
            "_captured_by": current_user.get("name") or current_user.get("email"),
        }
        set_doc["transition_data"] = existing_td

    timeline_lines = [
        payload.comment or f"{transition.get('action_label') or transition['action_key']} → {target_state.get('label') or target_state['key']}",
    ]
    if captured:
        # Render captured values using the field labels.
        label_by_key = {f.get("key"): f.get("label") or f.get("key") for f in (transition.get("required_fields") or [])}
        captured_str = "; ".join(f"{label_by_key.get(k, k)}: {v}" for k, v in captured.items())
        if captured_str:
            timeline_lines.append(f"Captured — {captured_str}")
    if assign.get("assignee_label"):
        timeline_lines.append(f"Auto-assigned to {assign['assignee_label']}.")

    timeline_event = RequestComment(
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email") or "User",
        text="\n".join(timeline_lines),
        kind="status_change",
    ).model_dump()

    history_entry = {
        "state_key": target_state["key"],
        "state_label": target_state.get("label") or target_state["key"],
        "state_color": target_state.get("color") or "#94a3b8",
        "entered_at": datetime.now(timezone.utc).isoformat(),
        "by_user_id": current_user.get("id"),
        "by_user_name": current_user.get("name") or current_user.get("email") or "User",
    }

    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": set_doc,
         "$push": {"comments": timeline_event, "status_history": history_entry}},
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
                + _slack_lead_line(doc)
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
                {"_id": 0, "request_number": 1, "title": 1, "lead_name": 1, "lead_company": 1},
            )
            if parent:
                await slack_post_event(
                    tenant_id=tenant_id,
                    event_type="marketing_request_commented",
                    text=(
                        f":speech_balloon: *{parent.get('request_number')}* — {parent.get('title','')}\n"
                        f"New comment by {event['user_name']}:\n_{event['text']}_"
                        + _slack_lead_line(parent)
                    ),
                )
        except Exception:
            logger.exception("Slack notification failed for marketing request comment")

        # @-mention notifications — parse the comment body for inline
        # `@[Name](user-id)` chips inserted by the frontend MentionTextarea
        # and ping every referenced user (minus the author).
        try:
            from utils.mentions import extract_mentions
            from utils.notify import notify_users
            mention_ids = [uid for uid in extract_mentions(event.get("text") or "") if uid != current_user.get("id")]
            if mention_ids and parent:
                await notify_users(
                    tenant_id=tenant_id,
                    user_ids=mention_ids,
                    title=f"{event['user_name']} mentioned you",
                    body=f"{parent.get('request_number')} — {parent.get('title','')[:80]}",
                    link=f"/marketing-requests/{request_id}",
                    kind="mention",
                    category="mention",
                    entity_type="marketing_request",
                    entity_id=request_id,
                )
        except Exception:
            logger.exception("Mention notification failed for marketing request comment")
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

    # Server-assigned sequential version number — never trust client input,
    # so concurrent/duplicate names can't cause confusion.
    existing = doc.get("versions") or []
    next_no = max([(v.get("version_no") or 0) for v in existing], default=0) + 1
    if next_no <= len(existing):
        next_no = len(existing) + 1

    files = await _stored_files_from_ids(tenant_id, payload.file_ids or [])
    version = FileVersion(
        version_no=next_no,
        version_name=f"V{next_no}",
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


def _find_version(versions: list, version_id: str) -> Optional[dict]:
    for v in versions:
        if v.get("id") == version_id:
            return v
    return None


@router.post("/{request_id}/versions/{version_id}/comments")
async def add_version_comment(request_id: str, version_id: str, payload: VersionCommentCreate, current_user: dict = Depends(get_current_user)):
    """Append a comment to a specific work version's discussion thread."""
    tenant_id = get_current_tenant_id()
    if not (payload.text and payload.text.strip()):
        raise HTTPException(400, "Comment text is required")
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    versions = doc.get("versions") or []
    version = _find_version(versions, version_id)
    if not version:
        raise HTTPException(404, "Version not found")

    comment = VersionComment(
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or current_user.get("email") or "User",
        text=payload.text.strip(),
    ).model_dump()
    version.setdefault("comments_thread", []).append(comment)

    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {"versions": versions, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return comment


@router.post("/{request_id}/versions/{version_id}/approve")
async def approve_version(request_id: str, version_id: str, current_user: dict = Depends(get_current_user)):
    """Approve a single work version. Only one version can be approved at a time —
    approving one automatically clears approval on the others."""
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    versions = doc.get("versions") or []
    target = _find_version(versions, version_id)
    if not target:
        raise HTTPException(404, "Version not found")

    now = datetime.now(timezone.utc).isoformat()
    user_name = current_user.get("name") or current_user.get("email") or "User"
    for v in versions:
        if v.get("id") == version_id:
            v["is_approved"] = True
            v["approved_by"] = current_user.get("id")
            v["approved_by_name"] = user_name
            v["approved_at"] = now
        else:
            v["is_approved"] = False
            v["approved_by"] = None
            v["approved_by_name"] = None
            v["approved_at"] = None

    timeline = RequestComment(
        user_id=current_user.get("id"), user_name=user_name,
        text=f"Approved work version {target.get('version_name')}.", kind="system",
    ).model_dump()
    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {
            "versions": versions,
            "approved_version_id": version_id,
            "approved_version_name": target.get("version_name"),
            "updated_at": now,
         },
         "$push": {"comments": timeline}},
    )
    return await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})


@router.post("/{request_id}/versions/{version_id}/unapprove")
async def unapprove_version(request_id: str, version_id: str, current_user: dict = Depends(get_current_user)):
    """Revert approval on a version, leaving no version approved."""
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    versions = doc.get("versions") or []
    target = _find_version(versions, version_id)
    if not target:
        raise HTTPException(404, "Version not found")

    now = datetime.now(timezone.utc).isoformat()
    user_name = current_user.get("name") or current_user.get("email") or "User"
    target["is_approved"] = False
    target["approved_by"] = None
    target["approved_by_name"] = None
    target["approved_at"] = None

    set_doc = {"versions": versions, "updated_at": now}
    if doc.get("approved_version_id") == version_id:
        set_doc["approved_version_id"] = None
        set_doc["approved_version_name"] = None

    timeline = RequestComment(
        user_id=current_user.get("id"), user_name=user_name,
        text=f"Reverted approval of work version {target.get('version_name')}.", kind="system",
    ).model_dump()
    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": set_doc, "$push": {"comments": timeline}},
    )
    return await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})


@router.delete("/{request_id}/versions/{version_id}")
async def delete_version(request_id: str, version_id: str, current_user: dict = Depends(get_current_user)):
    """Permanently delete a work version and all its attached files.

    - Blocked once the request has been submitted for production (assets are locked).
    - If the deleted version was currently approved, the request's approved_version is cleared.
    - Underlying storage objects + file rows are best-effort removed.
    """
    tenant_id = get_current_tenant_id()
    doc = await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    if doc.get("production"):
        raise HTTPException(400, "Versions are locked — this request has been submitted for production.")

    versions = doc.get("versions") or []
    target = _find_version(versions, version_id)
    if not target:
        raise HTTPException(404, "Version not found")

    # Collect file ids on this version and best-effort wipe storage + DB rows.
    file_ids = [f.get("id") for f in (target.get("files") or []) if f.get("id")]
    if file_ids:
        rows = await db.marketing_request_files.find(
            {"id": {"$in": file_ids}, "tenant_id": tenant_id}, {"_id": 0, "path": 1}
        ).to_list(len(file_ids))
        for row in rows:
            if row.get("path"):
                try:
                    await delete_object(row["path"])
                except Exception:
                    logger.exception("Storage delete failed for path %s during version delete", row.get("path"))
        await db.marketing_request_files.delete_many({"id": {"$in": file_ids}, "tenant_id": tenant_id})

    remaining = [v for v in versions if v.get("id") != version_id]
    now = datetime.now(timezone.utc).isoformat()
    set_doc: dict = {"versions": remaining, "updated_at": now}
    if doc.get("approved_version_id") == version_id:
        set_doc["approved_version_id"] = None
        set_doc["approved_version_name"] = None

    user_name = current_user.get("name") or current_user.get("email") or "User"
    timeline = RequestComment(
        user_id=current_user.get("id"), user_name=user_name,
        text=f"Deleted work version {target.get('version_name')} and {len(file_ids)} attached file(s).",
        kind="system",
    ).model_dump()
    await db.marketing_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": set_doc, "$push": {"comments": timeline}},
    )
    return await db.marketing_requests.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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
