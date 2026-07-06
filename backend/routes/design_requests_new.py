"""Design Requests - New — State-Machine-driven lifecycle router.

This module is fully driven by the State Machine attached to the
"design_requests_new" workflow. The SM defines:
  - the list of states (keys, labels, colors, initial, terminal)
  - the transitions between them (action_key + action_label + from/to states)
  - auto-assign side-effects (user / department / role) per transition
  - permission gates per transition (allowed_role_keys / allowed_department_ids / requestor_only)

A default SM is auto-seeded on first access if none is attached.

Endpoints (prefix `/design-requests-new`):
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
import base64

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Query, Response
from pydantic import BaseModel

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from utils.storage import put_object, get_object, delete_object
from utils.sm_helpers import (
    ensure_default_design_requests_new_sm,
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
    augment_doc_for_guards,
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
    """Generate DRN-YYYY-NNNN per tenant."""
    year = datetime.now(timezone.utc).year
    prefix = f"DRN-{year}-"
    latest = await db.design_requests_new.find_one(
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
    return await db.design_requests_new_files.find_one(
        {"id": file_id, "tenant_id": tenant_id}, {"_id": 0}
    )


async def _stored_files_from_ids(tenant_id: str, file_ids: List[str]) -> List[dict]:
    if not file_ids:
        return []
    rows = await db.design_requests_new_files.find(
        {"id": {"$in": file_ids}, "tenant_id": tenant_id}, {"_id": 0}
    ).to_list(len(file_ids))
    return [StoredFile(**r).model_dump() for r in rows]


async def _resolve_sm(tenant_id: str) -> dict:
    """Get the SM attached to marketing_requests, or seed a default if none exists."""
    return await ensure_default_design_requests_new_sm(tenant_id)


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


async def _resolve_type_by_name(tenant_id: str, name: str) -> Optional[dict]:
    """Find an (active) request type by name (case-insensitive), seeding defaults first."""
    from routes.marketing_request_masters import _seed_default_types
    await _seed_default_types(tenant_id)
    return await db.marketing_request_types.find_one(
        {"tenant_id": tenant_id,
         "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
         "is_active": {"$ne": False}},
        {"_id": 0},
    )


async def _resolve_dept_by_name(tenant_id: str, name: str, fallback_kind: str = "fulfilment") -> Optional[dict]:
    """Find an (active) department by name (case-insensitive), seeding defaults first.
    Falls back to any active department of `fallback_kind`, then any active department."""
    from routes.marketing_request_masters import _seed_default_departments
    await _seed_default_departments(tenant_id)
    dept = await db.master_departments.find_one(
        {"tenant_id": tenant_id,
         "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
         "is_active": {"$ne": False}},
        {"_id": 0},
    )
    if not dept:
        dept = await db.master_departments.find_one(
            {"tenant_id": tenant_id, "kind": fallback_kind, "is_active": {"$ne": False}}, {"_id": 0}
        )
    if not dept:
        dept = await db.master_departments.find_one(
            {"tenant_id": tenant_id, "is_active": {"$ne": False}}, {"_id": 0}
        )
    return dept


async def _ingest_bytes_as_file(tenant_id: str, current_user: dict, filename: str,
                                data: bytes, content_type: str) -> dict:
    """Persist raw bytes to object storage + a marketing_request_files record.
    Mirrors the `/upload` endpoint so the file is downloadable via `/files/{id}`.
    Returns the file record dict."""
    file_id = str(uuid.uuid4())
    safe_name = (filename or "upload.bin").replace("/", "_")
    path = f"nyla-crm/{tenant_id}/design-requests-new/{file_id}/{safe_name}"
    meta = await put_object(path, data, content_type or "application/octet-stream")
    doc = {
        "id": file_id,
        "tenant_id": tenant_id,
        "filename": safe_name,
        "path": meta.get("path") or path,
        "size": meta.get("size") or len(data),
        "content_type": content_type,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": current_user.get("id"),
        "uploaded_by_name": current_user.get("name") or current_user.get("email"),
    }
    await db.design_requests_new_files.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _insert_request_doc(
    tenant_id: str, current_user: dict, *, type_doc: dict, dept_doc: dict,
    requested_due_date: str, requirement_details: str, lead: Optional[dict] = None,
    logo_doc: Optional[dict] = None, ref_docs: Optional[List[dict]] = None,
    title: Optional[str] = None, additional_comments: Optional[str] = None,
    is_urgent: bool = False, short_timeline_reason: Optional[str] = None,
    social_media_links: Optional[List[str]] = None, file_links: Optional[List[str]] = None,
) -> dict:
    """Build + insert a marketing request document (single source of truth for creation).
    Seeds the SM initial state, records status history, posts a Slack notification."""
    sm = await _resolve_sm(tenant_id)
    initial = get_initial_state(sm)
    if not initial:
        raise HTTPException(500, "Attached state machine has no initial state")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "request_number": await _next_request_number(tenant_id),
        "tenant_id": tenant_id,
        "title": (title or type_doc["name"]),
        "request_type_id": type_doc["id"],
        "request_type_name": type_doc["name"],
        "assigned_department_id": dept_doc["id"],
        "assigned_department_name": dept_doc["name"],
        "assigned_user_id": None,
        "assigned_user_name": None,
        "assigned_role": None,
        "lead_id": lead.get("id") if lead else None,
        "lead_name": (lead.get("contact_person") or lead.get("name") or lead.get("company")) if lead else None,
        "lead_company": lead.get("company") if lead else None,
        "requested_due_date": requested_due_date,
        "requirement_details": requirement_details,
        "design_lead_time_days": int(type_doc.get("design_lead_time_days") or 0),
        "production_lead_time_days": int(type_doc.get("production_lead_time_days") or 0),
        "short_timeline_reason": short_timeline_reason,
        "is_urgent": bool(is_urgent),
        "logo": logo_doc,
        "references": ref_docs or [],
        "social_media_links": social_media_links or [],
        "file_links": file_links or [],
        "additional_comments": additional_comments,
        "state_machine_id": sm["id"],
        "state_machine_name": sm.get("name"),
        "current_state_key": initial["key"],
        "current_state_label": initial.get("label") or initial["key"],
        "current_state_color": initial.get("color") or "#94a3b8",
        "status_key": initial["key"],
        "status_name": initial.get("label") or initial["key"],
        "status_history": [{
            "state_key": initial["key"],
            "state_label": initial.get("label") or initial["key"],
            "state_color": initial.get("color") or "#94a3b8",
            "entered_at": now,
            "by_user_id": current_user.get("id"),
            "by_user_name": current_user.get("name") or current_user.get("email"),
        }],
        "versions": [],
        "comments": [],
        "production": None,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name") or current_user.get("email"),
        "created_at": now,
        "updated_at": now,
    }
    doc["comments"].append(RequestComment(
        user_id=current_user.get("id"),
        user_name=current_user.get("name") or "User",
        text=f"Request {doc['request_number']} created. State: {doc['current_state_label']}.",
        kind="system",
    ).model_dump())
    await db.design_requests_new.insert_one(doc)
    doc.pop("_id", None)

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
    return bool((perms.get("design_requests_new") or {}).get("delete"))


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
    return bool((perms.get("design_requests_new") or {}).get("edit"))


async def _enrich_requestor_city(rows, tenant_id: str):
    """Attach the requestor's city and the associated lead's city (each with a
    3-letter code and the city's ribbon colour configured in Locations Master)
    to each request row."""
    if not rows:
        return rows
    # Build a name -> {color, code} map from the cities master (case-insensitive).
    # master_cities is a global master collection (not tenant-scoped).
    color_by_city = {}
    async for c in db.master_cities.find(
        {}, {"_id": 0, "name": 1, "color": 1, "code": 1}
    ):
        nm = (c.get("name") or "").strip().lower()
        if nm:
            color_by_city[nm] = {"color": c.get("color"), "code": c.get("code")}

    def _color_for(city):
        return color_by_city.get((city or "").strip().lower(), {}).get("color")

    # Requestor city (from the user who raised the request).
    ids = list({r.get("created_by") for r in rows if r.get("created_by")})
    city_by_id = {}
    if ids:
        async for u in db.users.find(
            {"id": {"$in": ids}, "tenant_id": tenant_id}, {"_id": 0, "id": 1, "city": 1}
        ):
            city_by_id[u["id"]] = u.get("city")

    # Associated lead city (shown on the Kanban corner ribbon).
    lead_ids = list({r.get("lead_id") for r in rows if r.get("lead_id")})
    city_by_lead = {}
    if lead_ids:
        async for l in db.leads.find(
            {"id": {"$in": lead_ids}, "tenant_id": tenant_id}, {"_id": 0, "id": 1, "city": 1}
        ):
            city_by_lead[l["id"]] = l.get("city")

    # Request-type default icon — shown on cards when a request has no image of its own.
    type_ids = list({r.get("request_type_id") for r in rows if r.get("request_type_id")})
    icon_by_type = {}
    if type_ids:
        async for t in db.marketing_request_types.find(
            {"id": {"$in": type_ids}, "tenant_id": tenant_id}, {"_id": 0, "id": 1, "icon_file_id": 1}
        ):
            if t.get("icon_file_id"):
                icon_by_type[t["id"]] = f"/api/design-requests-new/files/{t['icon_file_id']}"

    # Terminal-state lookup per state machine — {sm_id: {state_key: is_terminal}}.
    sm_ids = list({r.get("state_machine_id") for r in rows if r.get("state_machine_id")})
    terminal_by_sm = {}
    if sm_ids:
        async for sm in db.state_machines.find(
            {"id": {"$in": sm_ids}, "tenant_id": tenant_id}, {"_id": 0, "id": 1, "states": 1}
        ):
            terminal_by_sm[sm["id"]] = {
                s.get("key"): bool(s.get("is_terminal")) for s in (sm.get("states") or [])
            }

    # Fallback map: union of terminal flags across the tenant's design_requests_new
    # workflow(s). Old/migrated requests can carry a stale state_machine_id (or a
    # state key absent from it); we still resolve terminality via the live workflow.
    fallback_terminal = {}
    async for sm in db.state_machines.find(
        {"tenant_id": tenant_id, "applied_to": "design_requests_new"}, {"_id": 0, "states": 1}
    ):
        for s in (sm.get("states") or []):
            if s.get("key") is not None and (s.get("key") not in fallback_terminal or s.get("is_terminal")):
                fallback_terminal[s.get("key")] = bool(s.get("is_terminal"))

    for r in rows:
        city = city_by_id.get(r.get("created_by"))
        r["created_by_city"] = city
        r["created_by_city_color"] = _color_for(city)
        lead_city = city_by_lead.get(r.get("lead_id"))
        r["lead_city"] = lead_city
        r["lead_city_color"] = _color_for(lead_city)
        r["request_type_icon_url"] = icon_by_type.get(r.get("request_type_id"))
        own = terminal_by_sm.get(r.get("state_machine_id"), {})
        key = r.get("current_state_key")
        r["current_state_is_terminal"] = own[key] if key in own else fallback_terminal.get(key, False)
    return rows


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
        path = f"{lead_id}/design-requests-new/{file_id}/{safe_name}"
    else:
        path = f"nyla-crm/{tenant_id}/design-requests-new/{file_id}/{safe_name}"

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
    await db.design_requests_new_files.insert_one(doc)
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
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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
    await db.design_requests_new.update_one(
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
        await db.design_requests_new_files.delete_one({"id": file_id, "tenant_id": tenant_id})

    updated = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    return updated


@router.delete("/{request_id}")
async def delete_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Permanently delete a design (marketing) request and all its attached files.

    Guarded by RBAC: admin roles always; other roles need the explicit
    `marketing_requests.delete` permission.
    """
    tenant_id = get_current_tenant_id()
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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
        rows = await db.design_requests_new_files.find(
            {"id": {"$in": list(file_ids)}, "tenant_id": tenant_id}, {"_id": 0, "path": 1}
        ).to_list(len(file_ids))
        for row in rows:
            if row.get("path"):
                try:
                    await delete_object(row["path"])
                except Exception:
                    logger.exception("Storage delete failed for path %s during request delete", row.get("path"))
        await db.design_requests_new_files.delete_many({"id": {"$in": list(file_ids)}, "tenant_id": tenant_id})

    await db.design_requests_new.delete_one({"id": request_id, "tenant_id": tenant_id})
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

    logo_doc = None
    if payload.logo_file_id:
        f = await _get_file(tenant_id, payload.logo_file_id)
        if f:
            logo_doc = StoredFile(**f).model_dump()
    ref_docs = await _stored_files_from_ids(tenant_id, payload.reference_file_ids or [])

    return await _insert_request_doc(
        tenant_id, current_user,
        type_doc=type_doc, dept_doc=dept_doc,
        requested_due_date=payload.requested_due_date,
        requirement_details=payload.requirement_details,
        lead=lead, logo_doc=logo_doc, ref_docs=ref_docs,
        title=payload.title, additional_comments=payload.additional_comments,
        is_urgent=bool(payload.is_urgent), short_timeline_reason=payload.short_timeline_reason,
        social_media_links=payload.social_media_links, file_links=payload.file_links,
    )


# ──────────────────────────────────────────────────────────────
# Convenience creators — auto-create a design request from a Lead / Bottle Preview
# ──────────────────────────────────────────────────────────────
NECK_TAGS_TYPE = "Neck Tags"
BOTTLE_SAMPLE_TYPE = "Request Physical Sample"
BOTTLE_DESIGN_TYPE = "Request Bottle Design Concept"
DEFAULT_DESIGN_DEPT = "Design"


def _min_due_date(type_doc: dict) -> str:
    """Earliest allowable due date (today + design + production lead time)."""
    days = int(type_doc.get("design_lead_time_days") or 0) + int(type_doc.get("production_lead_time_days") or 0)
    return (date.today() + timedelta(days=days)).isoformat()


def _decode_data_url(data: str) -> bytes:
    """Decode a base64 image payload (with or without a `data:` URL prefix)."""
    if not data:
        raise HTTPException(400, "Empty image data")
    if "," in data and data.strip().lower().startswith("data:"):
        data = data.split(",", 1)[1]
    try:
        return base64.b64decode(data)
    except Exception:
        raise HTTPException(400, "Invalid base64 image data")


class BottleSampleRequestCreate(BaseModel):
    image_data: str                       # composite/clean design (data URL or base64 PNG)
    lead_id: Optional[str] = None
    customer_name: Optional[str] = None
    bottle_template_name: Optional[str] = None
    logo_size_mm: Optional[int] = None
    additional_comments: Optional[str] = None
    is_urgent: Optional[bool] = False


@router.post("/from-lead/{lead_id}/neck-tags")
async def create_neck_tag_request(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Auto-create a 'Neck Tags' design request for a lead, attaching the lead's logo."""
    return await _create_lead_logo_request(
        lead_id, current_user,
        type_name=NECK_TAGS_TYPE,
        title_prefix="Neck Tags",
        action_label="neck tags",
    )


@router.post("/from-lead/{lead_id}/bottle-design")
async def create_bottle_design_request(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Auto-create a 'Bottle Designs - No Samples Required' design request for a lead,
    attaching the lead's logo."""
    return await _create_lead_logo_request(
        lead_id, current_user,
        type_name=BOTTLE_DESIGN_TYPE,
        title_prefix="Bottle Design",
        action_label="a bottle design",
    )


async def _create_lead_logo_request(lead_id: str, current_user: dict, *,
                                     type_name: str, title_prefix: str, action_label: str) -> dict:
    """Shared creator for lead-driven design requests that reuse the lead's saved logo.
    Blocks when the lead has no logo (logo is mandatory)."""
    tenant_id = get_current_tenant_id()
    lead = await db.leads.find_one({"id": lead_id, "tenant_id": tenant_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")

    storage_path = lead.get("logo_storage_path")
    if not storage_path:
        raise HTTPException(400, f"This lead has no logo yet. Upload a logo on the lead first, then request {action_label}.")

    # Pull the lead's logo bytes from the same (top-level) object storage used to save it.
    try:
        from object_storage import get_object as _lead_get
        logo_bytes, ct = _lead_get(storage_path)
    except Exception as e:
        logger.exception("Failed to load lead logo for design request")
        raise HTTPException(502, f"Could not load the lead's logo: {e}")

    content_type = lead.get("logo_content_type") or ct or "image/png"
    company = lead.get("company") or "Lead"
    file_rec = await _ingest_bytes_as_file(
        tenant_id, current_user, f"{company}-logo.png", logo_bytes, content_type
    )
    logo_doc = StoredFile(**file_rec).model_dump()

    type_doc = await _resolve_type_by_name(tenant_id, type_name)
    if not type_doc:
        raise HTTPException(500, f"'{type_name}' request type is not configured")
    dept_doc = await _resolve_dept_by_name(tenant_id, DEFAULT_DESIGN_DEPT)
    if not dept_doc:
        raise HTTPException(500, "No design/fulfilment department is configured")

    details = (
        f"{title_prefix} requested for lead “{company}”"
        f"{(' (' + lead.get('lead_id') + ')') if lead.get('lead_id') else ''}. "
        "The lead's logo is attached to this request."
    )
    return await _insert_request_doc(
        tenant_id, current_user,
        type_doc=type_doc, dept_doc=dept_doc,
        requested_due_date=_min_due_date(type_doc),
        requirement_details=details,
        lead=lead, logo_doc=logo_doc,
        title=f"{title_prefix} — {company}",
    )


@router.post("/from-lead/{lead_id}/bottle-sample")
async def create_lead_bottle_sample_request(
    lead_id: str,
    file: UploadFile = File(...),
    attach_bottle_design: bool = Form(False),
    current_user: dict = Depends(get_current_user),
):
    """Create a 'Request Physical Sample' request for a lead. The ORIGINAL logo must be
    uploaded (PDF or ZIP). Optionally also attach the lead's saved bottle design(s) so the
    design/production team follows the approved design pattern."""
    tenant_id = get_current_tenant_id()
    lead = await db.leads.find_one({"id": lead_id, "tenant_id": tenant_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead not found")

    fname = (file.filename or "").strip()
    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
    if ext not in ("pdf", "zip"):
        raise HTTPException(400, "Please upload the original logo as a PDF or ZIP file.")

    data = await file.read()
    if not data:
        raise HTTPException(400, "The uploaded file is empty.")

    company = lead.get("company") or "Lead"
    file_rec = await _ingest_bytes_as_file(
        tenant_id, current_user, fname, data,
        file.content_type or ("application/pdf" if ext == "pdf" else "application/zip"),
    )
    logo_doc = StoredFile(**file_rec).model_dump()

    # Optionally attach the lead's saved bottle design(s) as references.
    ref_docs = []
    if attach_bottle_design:
        designs = lead.get("bottle_designs") or []
        from object_storage import get_object as _os_get
        for i, d in enumerate(designs):
            path = d.get("clean_storage_path") or d.get("image_storage_path")
            if not path:
                continue
            try:
                img_bytes, ict = _os_get(path)
            except Exception:
                logger.warning("Could not load saved bottle design %s for sample request", d.get("id"))
                continue
            drec = await _ingest_bytes_as_file(
                tenant_id, current_user,
                f"{company}-bottle-design-{i + 1}.png", img_bytes, ict or "image/png",
            )
            ref_docs.append(StoredFile(**drec).model_dump())

    type_doc = await _resolve_type_by_name(tenant_id, BOTTLE_SAMPLE_TYPE)
    if not type_doc:
        raise HTTPException(500, f"'{BOTTLE_SAMPLE_TYPE}' request type is not configured")
    dept_doc = await _resolve_dept_by_name(tenant_id, DEFAULT_DESIGN_DEPT)
    if not dept_doc:
        raise HTTPException(500, "No design/fulfilment department is configured")

    details = (
        f"Physical bottle sample requested for lead “{company}”"
        f"{(' (' + lead.get('lead_id') + ')') if lead.get('lead_id') else ''}. "
        f"The original logo ({ext.upper()}) is attached to this request."
    )
    if ref_docs:
        details += (
            f" The client-approved bottle design is also attached — "
            f"the design/production team must follow the same design pattern shown in the attached design."
        )
    return await _insert_request_doc(
        tenant_id, current_user,
        type_doc=type_doc, dept_doc=dept_doc,
        requested_due_date=_min_due_date(type_doc),
        requirement_details=details,
        lead=lead, logo_doc=logo_doc, ref_docs=ref_docs,
        title=f"Bottle Sample — {company}",
    )


@router.post("/from-bottle-design")
async def create_bottle_sample_request(payload: BottleSampleRequestCreate, current_user: dict = Depends(get_current_user)):
    """Auto-create a 'Bottle Designs - Physical Samples Required' design request from
    the Bottle Preview, attaching the composed design image as a reference file.
    Links the lead when one is provided."""
    tenant_id = get_current_tenant_id()

    lead = None
    if payload.lead_id:
        lead = await db.leads.find_one({"id": payload.lead_id, "tenant_id": tenant_id}, {"_id": 0})
        if not lead:
            raise HTTPException(400, "Lead not found")

    image_bytes = _decode_data_url(payload.image_data)
    customer = (payload.customer_name or (lead.get("company") if lead else None) or "Customer").strip()
    file_rec = await _ingest_bytes_as_file(
        tenant_id, current_user, f"{customer}-bottle-design.png", image_bytes, "image/png"
    )
    ref_doc = StoredFile(**file_rec).model_dump()

    type_doc = await _resolve_type_by_name(tenant_id, BOTTLE_SAMPLE_TYPE)
    if not type_doc:
        raise HTTPException(500, f"'{BOTTLE_SAMPLE_TYPE}' request type is not configured")
    dept_doc = await _resolve_dept_by_name(tenant_id, DEFAULT_DESIGN_DEPT)
    if not dept_doc:
        raise HTTPException(500, "No design/fulfilment department is configured")

    parts = [f"Physical bottle sample requested for “{customer}”."]
    if payload.bottle_template_name:
        parts.append(f"Bottle: {payload.bottle_template_name}.")
    if payload.logo_size_mm:
        parts.append(f"Logo size: {payload.logo_size_mm}×{payload.logo_size_mm} mm.")
    parts.append("The approved bottle-preview design is attached to this request.")
    details = " ".join(parts)

    return await _insert_request_doc(
        tenant_id, current_user,
        type_doc=type_doc, dept_doc=dept_doc,
        requested_due_date=_min_due_date(type_doc),
        requirement_details=details,
        lead=lead, ref_docs=[ref_doc],
        title=f"Bottle Sample — {customer}",
        additional_comments=payload.additional_comments,
        is_urgent=bool(payload.is_urgent),
    )



@router.put("/{request_id}")
@router.patch("/{request_id}")
async def update_request(request_id: str, payload: MarketingRequestCreate, current_user: dict = Depends(get_current_user)):
    """Edit an existing design/marketing request. Allowed for the original
    requester and admins/managers with the `marketing_requests.edit`
    permission, at any state. State-machine progress, versions, comments and
    production are preserved — only the request's descriptive fields change."""
    tenant_id = get_current_tenant_id()
    existing = await db.design_requests_new.find_one(
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
    await db.design_requests_new.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": update, "$push": {"comments": sys_comment}},
    )
    doc = await db.design_requests_new.find_one(
        {"id": request_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    return doc


# ──────────────────────────────────────────────────────────────
# Quick toggle — flag/unflag a request as URGENT without a full edit
# ──────────────────────────────────────────────────────────────
class UrgentUpdate(BaseModel):
    is_urgent: bool


class CdrLinkUpdate(BaseModel):
    cdr_link: Optional[str] = None


@router.patch("/{request_id}/cdr-link")
async def set_request_cdr_link(request_id: str, payload: CdrLinkUpdate, current_user: dict = Depends(get_current_user)):
    """Set/clear the CorelDRAW (CDR) file link on a design request. This link is
    copied onto Print Requests created from the (Final Approved) design request."""
    tenant_id = get_current_tenant_id()
    link = (payload.cdr_link or "").strip() or None
    res = await db.design_requests_new.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {"cdr_link": link, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found")
    return {"ok": True, "cdr_link": link}


@router.patch("/{request_id}/urgent")
async def set_request_urgent(request_id: str, payload: UrgentUpdate, current_user: dict = Depends(get_current_user)):
    """Flag or unflag a design/marketing request as urgent. Allowed for the
    original requester and admins/managers with edit permission."""
    tenant_id = get_current_tenant_id()
    existing = await db.design_requests_new.find_one(
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
    await db.design_requests_new.update_one(
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
    doc = await db.design_requests_new.find_one(
        {"id": request_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    return doc
def _build_requests_query(tenant_id, current_user, queue, search, state_key, request_type_id, assigned_department_id, created_by, lead_id=None):
    """Shared Mongo query builder for the list + export endpoints."""
    q: dict = {"tenant_id": tenant_id}
    if lead_id:
        q["lead_id"] = lead_id
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
    lead_id: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    no_limit: bool = False,
    sort: str = "-created_at",
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    page = max(page, 1)

    q = _build_requests_query(tenant_id, current_user, queue, search, state_key, request_type_id, assigned_department_id, created_by, lead_id=lead_id)

    total = await db.design_requests_new.count_documents(q)
    sort_field = sort.lstrip("-+")
    sort_dir = -1 if sort.startswith("-") else 1

    # Board/Kanban needs every matching request (no pagination cap).
    if no_limit:
        rows = await db.design_requests_new.find(q, {"_id": 0}).sort(sort_field, sort_dir).to_list(2000)
        await _enrich_requestor_city(rows, tenant_id)
        return {"items": rows, "total": total, "page": 1, "limit": total, "pages": 1}

    limit = max(min(limit, 100), 1)
    rows = await db.design_requests_new.find(q, {"_id": 0}).sort(sort_field, sort_dir).skip((page - 1) * limit).limit(limit).to_list(limit)
    await _enrich_requestor_city(rows, tenant_id)
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
        await db.design_requests_new.update_one(
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
    rows = await db.design_requests_new.find(q, {"_id": 0}).sort(sort_field, sort_dir).to_list(5000)

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
    async for row in db.design_requests_new.aggregate(pipeline):
        total += row["n"]
        if row["_id"] in by_state:
            by_state[row["_id"]] = row["n"]
        else:
            # state was deleted from SM but doc still references it
            by_state[row["_id"] or "_unknown"] = row["n"]

    # My queues
    my_raised = await db.design_requests_new.count_documents(
        {"tenant_id": tenant_id, "created_by": current_user.get("id")}
    )
    user_depts = _user_departments_lower(current_user)
    user_role = (current_user.get("role") or "").strip()
    assigned_or = [{"assigned_user_id": current_user.get("id")}]
    if user_depts:
        assigned_or.append({"assigned_department_name": {"$regex": f"^({'|'.join(user_depts)})$", "$options": "i"}})
    if user_role:
        assigned_or.append({"assigned_role": {"$regex": f"^{user_role}$", "$options": "i"}})
    my_assigned = await db.design_requests_new.count_documents({"tenant_id": tenant_id, "$or": assigned_or})

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
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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
    await _enrich_requestor_city([doc], tenant_id)
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

    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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

    await db.design_requests_new.update_one(
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
    doc = await db.design_requests_new.find_one(
        {"id": request_id, "tenant_id": tenant_id}, {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Request not found")

    sm = await _resolve_sm(tenant_id)
    transitions = find_transitions_from(sm, doc.get("current_state_key") or "")
    guard_doc = await augment_doc_for_guards(doc, tenant_id)
    out = []
    for t in transitions:
        allowed = await user_can_trigger(t, current_user, tenant_id, doc.get("created_by"))
        target_state = find_state(sm, t.get("to_state") or "")
        guards_ok, block_reasons = evaluate_guards(t.get("guards"), guard_doc)
        req_fields = applicable_required_fields(t.get("required_fields"), guard_doc)
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
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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
    guard_doc = await augment_doc_for_guards(doc, tenant_id)
    guards_ok, guard_reasons = evaluate_guards(transition.get("guards"), guard_doc)
    if not guards_ok:
        raise HTTPException(400, " ".join(guard_reasons) or "This action is blocked by a workflow rule.")

    # Required-field gate — capture new data (e.g. neck-tag quantity).
    fields_ok, field_errors, captured = evaluate_required_fields(
        transition.get("required_fields"), guard_doc, payload.field_data,
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

    await db.design_requests_new.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": set_doc,
         "$push": {"comments": timeline_event, "status_history": history_entry}},
    )
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})

    # Notify the resolved assignee(s) — in-app + email — when this transition
    # opts in via "Notify assignee". Best-effort; never breaks the transition.
    if transition.get("notify_assignee") and assign.get("assignee_user_ids"):
        try:
            actor_id = current_user.get("id")
            recipients = [uid for uid in assign["assignee_user_ids"] if uid and uid != actor_id]
            if recipients:
                base = os.environ.get("APP_BASE_URL", "").rstrip("/")
                link = f"{base}/design-requests-new/{request_id}"
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

    # Configurable per-transition notifications (channels + template + recipients).
    try:
        from utils.sm_notify import dispatch_transition_notifications
        base = os.environ.get("APP_BASE_URL", "").rstrip("/")
        link = f"{base}/design-requests-new/{request_id}"
        from_state = find_state(sm, transition.get("from_state") or "") or {}
        vars_map = {
            "request_number": doc.get("request_number") or "",
            "title": doc.get("title") or "",
            "action": transition.get("action_label") or transition.get("action_key") or "",
            "from_state": from_state.get("label") or transition.get("from_state") or "",
            "to_state": target_state.get("label") or target_state["key"],
            "actor_name": current_user.get("name") or current_user.get("email") or "Someone",
            "requestor_name": doc.get("created_by_name") or "",
            "assignee_name": assign.get("assignee_label") or doc.get("assigned_user_name") or "",
            "comment": payload.comment or "",
            "link": link,
        }
        await dispatch_transition_notifications(
            tenant_id, transition, doc, assign,
            actor=current_user, vars_map=vars_map, link=link,
            entity_type="marketing_request", entity_id=request_id,
            category="approval",
        )
    except Exception:
        logger.exception("Transition notification dispatch failed for marketing request")

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
    res = await db.design_requests_new.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$push": {"comments": event},
         "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Request not found")
    if (payload.kind or "comment") == "comment":
        try:
            parent = await db.design_requests_new.find_one(
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
                    link=f"/design-requests-new/{request_id}",
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
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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

    await db.design_requests_new.update_one(
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
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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

    await db.design_requests_new.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {"versions": versions, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    # @-mention notifications on the per-version thread — ping referenced users
    # (minus the author). Best-effort; never blocks the comment.
    try:
        from utils.mentions import extract_mentions
        from utils.notify import notify_users
        mention_ids = [uid for uid in extract_mentions(comment.get("text") or "") if uid != current_user.get("id")]
        if mention_ids:
            await notify_users(
                tenant_id=tenant_id,
                user_ids=mention_ids,
                title=f"{comment['user_name']} mentioned you",
                body=f"{doc.get('request_number')} — {version.get('version_name','')} comment",
                link=f"/design-requests-new/{request_id}",
                kind="mention",
                category="mention",
                entity_type="marketing_request",
                entity_id=request_id,
            )
    except Exception:
        logger.exception("Mention notification failed for marketing request version comment")
    return comment


@router.post("/{request_id}/versions/{version_id}/approve")
async def approve_version(request_id: str, version_id: str, current_user: dict = Depends(get_current_user)):
    """Approve a single work version. Only one version can be approved at a time —
    approving one automatically clears approval on the others."""
    tenant_id = get_current_tenant_id()
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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
    await db.design_requests_new.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {
            "versions": versions,
            "approved_version_id": version_id,
            "approved_version_name": target.get("version_name"),
            "updated_at": now,
         },
         "$push": {"comments": timeline}},
    )
    return await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})


@router.post("/{request_id}/versions/{version_id}/unapprove")
async def unapprove_version(request_id: str, version_id: str, current_user: dict = Depends(get_current_user)):
    """Revert approval on a version, leaving no version approved."""
    tenant_id = get_current_tenant_id()
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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
    await db.design_requests_new.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": set_doc, "$push": {"comments": timeline}},
    )
    return await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})


@router.delete("/{request_id}/versions/{version_id}")
async def delete_version(request_id: str, version_id: str, current_user: dict = Depends(get_current_user)):
    """Permanently delete a work version and all its attached files.

    - Blocked once the request has been submitted for production (assets are locked).
    - If the deleted version was currently approved, the request's approved_version is cleared.
    - Underlying storage objects + file rows are best-effort removed.
    """
    tenant_id = get_current_tenant_id()
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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
        rows = await db.design_requests_new_files.find(
            {"id": {"$in": file_ids}, "tenant_id": tenant_id}, {"_id": 0, "path": 1}
        ).to_list(len(file_ids))
        for row in rows:
            if row.get("path"):
                try:
                    await delete_object(row["path"])
                except Exception:
                    logger.exception("Storage delete failed for path %s during version delete", row.get("path"))
        await db.design_requests_new_files.delete_many({"id": {"$in": file_ids}, "tenant_id": tenant_id})

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
    await db.design_requests_new.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": set_doc, "$push": {"comments": timeline}},
    )
    return await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
@router.post("/{request_id}/production-submit")
async def submit_for_production(request_id: str, payload: ProductionSubmitRequest, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
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

    await db.design_requests_new.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {"production": sub, "updated_at": datetime.now(timezone.utc).isoformat()},
         "$push": {"comments": RequestComment(
             user_id=current_user.get("id"),
             user_name=current_user.get("name") or "User",
             text=f"Submitted for production to {delivery_dept['name']} — qty {payload.quantity_required}.",
             kind="system",
         ).model_dump()}},
    )
    doc = await db.design_requests_new.find_one({"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    return doc


# ──────────────────────────────────────────────────────────────
# One-time migration: Marketing Requests → Design Requests - New
# ──────────────────────────────────────────────────────────────
# MR state_key → DRN state_key. Keys are identical today (identity map); edit
# here if the two workflows ever diverge.
_MIGRATION_STATE_MAP = {
    "submitted": "submitted",
    "inputs_needed": "inputs_needed",
    "in_progress": "in_progress",
    "in_review": "in_review",
    "approved_internal": "approved_internal",
    "final_approved": "final_approved",
    "production_in_progress": "production_in_progress",
    "production_completed": "production_completed",
}

# Bookkeeping fields that must NOT be copied verbatim (re-derived below).
_MR_SKIP_FIELDS = {
    "_id", "id", "current_state_key", "current_state_label", "current_state_color",
    "state_machine_id", "state_machine_name",
}


def _collect_file_dicts(node, acc: dict):
    """Recursively gather every embedded file record (a dict carrying both a
    string 'id' and a string 'path') anywhere in a request document — covers
    logo, references, versions[].files and production.final_approved_files."""
    if isinstance(node, dict):
        if isinstance(node.get("id"), str) and isinstance(node.get("path"), str):
            acc[node["id"]] = node
        for v in node.values():
            _collect_file_dicts(v, acc)
    elif isinstance(node, list):
        for v in node:
            _collect_file_dicts(v, acc)


@router.post("/migrate-from-marketing")
async def migrate_from_marketing(commit: bool = Query(False), current_user: dict = Depends(get_current_user)):
    """Idempotent migration of THIS tenant's Marketing Requests into the
    Design Requests - New module. Dry-run by default; pass ?commit=true to write.
    Admin only. Originals in `marketing_requests` are left untouched. Re-running
    is safe — records already migrated (matched by migrated_from_marketing_request_id)
    are skipped."""
    tenant_id = get_current_tenant_id()
    if not _is_admin(current_user):
        raise HTTPException(403, "Only administrators can run the migration.")

    sm = await _resolve_sm(tenant_id)
    sm_states = {s.get("key"): s for s in (sm.get("states") or [])}
    fallback_key = "submitted" if "submitted" in sm_states else next(iter(sm_states), "submitted")

    sources = await db.marketing_requests.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(5000)
    already = 0
    to_migrate = []            # list of (new_doc, [file_dicts])
    unmapped_states: dict = {}
    now = datetime.now(timezone.utc).isoformat()

    for mr in sources:
        exists = await db.design_requests_new.find_one(
            {"tenant_id": tenant_id, "migrated_from_marketing_request_id": mr["id"]},
            {"_id": 0, "id": 1},
        )
        if exists:
            already += 1
            continue

        old_key = mr.get("current_state_key")
        new_key = _MIGRATION_STATE_MAP.get(old_key, old_key)
        if new_key not in sm_states:
            unmapped_states[old_key] = unmapped_states.get(old_key, 0) + 1
            new_key = fallback_key
        st = sm_states.get(new_key, {})

        new_doc = {k: v for k, v in mr.items() if k not in _MR_SKIP_FIELDS}
        new_doc.update({
            "id": str(uuid.uuid4()),
            "state_machine_id": sm.get("id"),
            "state_machine_name": sm.get("name"),
            "current_state_key": new_key,
            "current_state_label": st.get("label", new_key),
            "current_state_color": st.get("color"),
            # DRN-only fields (MR has no lead linkage / board rank)
            "board_rank": mr.get("board_rank"),
            "is_urgent": bool(mr.get("is_urgent", False)),
            "lead_id": mr.get("lead_id"),
            "lead_name": mr.get("lead_name"),
            "lead_company": mr.get("lead_company"),
            "status_history": mr.get("status_history") or [{
                "at": now, "from_state": None, "to_state": new_key,
                "to_state_label": st.get("label", new_key),
                "by": current_user.get("id"), "by_name": current_user.get("name"),
                "note": f"Migrated from Marketing Request {mr.get('request_number')}",
            }],
            "migrated_from_marketing_request_id": mr["id"],
            "migrated_from_request_number": mr.get("request_number"),
            "migrated_at": now,
        })
        files: dict = {}
        _collect_file_dicts(mr, files)
        to_migrate.append((new_doc, list(files.values())))

    file_ids = {f["id"] for _, fs in to_migrate for f in fs}
    state_breakdown: dict = {}
    for d, _ in to_migrate:
        state_breakdown[d["current_state_key"]] = state_breakdown.get(d["current_state_key"], 0) + 1

    summary = {
        "dry_run": not commit,
        "tenant_id": tenant_id,
        "source_total": len(sources),
        "already_migrated": already,
        "to_migrate": len(to_migrate),
        "files_to_copy": len(file_ids),
        "unmapped_states": unmapped_states,
        "state_breakdown": state_breakdown,
        "preview": [
            {"request_number": d.get("request_number"), "type": d.get("request_type_name"),
             "state": d["current_state_key"], "files": len(fs)}
            for d, fs in to_migrate[:15]
        ],
    }

    if not commit:
        return summary

    # Commit — copy file metadata first (idempotent), then insert docs.
    copied_files = 0
    for _, fs in to_migrate:
        for f in fs:
            src = await db.marketing_request_files.find_one({"id": f["id"]}, {"_id": 0})
            row = dict(src) if src else dict(f)
            row.setdefault("tenant_id", tenant_id)
            res = await db.design_requests_new_files.update_one(
                {"id": f["id"], "tenant_id": tenant_id},
                {"$setOnInsert": row},
                upsert=True,
            )
            if res.upserted_id is not None:
                copied_files += 1

    docs = [d for d, _ in to_migrate]
    inserted = 0
    if docs:
        result = await db.design_requests_new.insert_many(docs)
        inserted = len(result.inserted_ids)

    summary.update({"migrated": inserted, "files_copied": copied_files})
    return summary
