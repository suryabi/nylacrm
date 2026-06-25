"""Notification Templates — tenant-scoped, admin-managed message templates used
by State Machine transition notifications (and, later, other notification
sources). A template carries a {{placeholder}}-aware subject + body. The page
can be enhanced later with per-channel (email / sms / whatsapp) bodies.

Routes (prefix `/notification-templates`):
  GET    /            list
  POST   /            create   (admin)
  PUT    /{id}        update   (admin)
  DELETE /{id}        delete   (admin)
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Placeholders that templates may reference (surfaced in the UI as hints).
TEMPLATE_VARIABLES = [
    {"key": "request_number", "label": "Document number"},
    {"key": "title", "label": "Document title"},
    {"key": "action", "label": "Action performed"},
    {"key": "from_state", "label": "Previous state"},
    {"key": "to_state", "label": "New state"},
    {"key": "actor_name", "label": "Who performed the action"},
    {"key": "requestor_name", "label": "Requestor / creator name"},
    {"key": "assignee_name", "label": "Assigned-to name"},
    {"key": "comment", "label": "Comment entered at transition"},
    {"key": "link", "label": "Link to open the document"},
]

_ADMIN_ROLES = {"ceo", "admin", "system_admin", "tenant_admin", "director"}


def _is_admin(user: dict) -> bool:
    return (user.get("role") or "").strip().lower() in _ADMIN_ROLES


class TemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=140)
    description: Optional[str] = Field("", max_length=500)
    subject: str = Field("", max_length=500)
    body: str = ""


class TemplateCreate(TemplateBase):
    pass


class TemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=140)
    description: Optional[str] = Field(None, max_length=500)
    subject: Optional[str] = Field(None, max_length=500)
    body: Optional[str] = None


def _clean(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


@router.get("")
async def list_templates(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    rows = await db.notification_templates.find(
        {"tenant_id": tenant_id}, {"_id": 0}
    ).sort("updated_at", -1).to_list(500)
    return {"templates": rows, "variables": TEMPLATE_VARIABLES}


@router.post("")
async def create_template(payload: TemplateCreate, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can manage notification templates")
    tenant_id = get_current_tenant_id()
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": payload.name.strip(),
        "description": (payload.description or "").strip(),
        "subject": payload.subject or "",
        "body": payload.body or "",
        "created_by": current_user.get("id"),
        "created_at": now,
        "updated_at": now,
    }
    await db.notification_templates.insert_one(doc)
    return _clean(doc)


@router.put("/{template_id}")
async def update_template(template_id: str, payload: TemplateUpdate, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can manage notification templates")
    tenant_id = get_current_tenant_id()
    existing = await db.notification_templates.find_one({"id": template_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Template not found")
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "name" in update:
        update["name"] = update["name"].strip()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.notification_templates.update_one({"id": template_id, "tenant_id": tenant_id}, {"$set": update})
    after = await db.notification_templates.find_one({"id": template_id, "tenant_id": tenant_id}, {"_id": 0})
    return _clean(after)


@router.delete("/{template_id}")
async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can manage notification templates")
    tenant_id = get_current_tenant_id()
    res = await db.notification_templates.delete_one({"id": template_id, "tenant_id": tenant_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Template not found")
    return {"ok": True}
