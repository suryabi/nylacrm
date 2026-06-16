"""
Notification settings — tenant-wide (admin/CEO) + per-user opt-outs.

Two layers of control:
  1. **Tenant matrix** (admin/CEO only): for each role × category, whether the
     CRM is allowed to send a notification at all. Also a single global kill
     switch (`enabled`) that turns the whole module off.
  2. **User overrides** (each user): within the categories their role allows,
     a user may opt out of any individual category.

The `notify_users` utility consults this config before inserting an in-app
notification or sending an email — so a single source of truth governs every
trigger point in the codebase.
"""

import os
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter(tags=["Notification Settings"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _client[os.environ["DB_NAME"]]


# All notification categories the CRM knows about. The tenant matrix is keyed
# on this list, and the UI renders one column per category.
CATEGORIES: List[Dict[str, str]] = [
    {"key": "task",                "label": "Tasks",                  "desc": "Task assigned / due tomorrow / overdue."},
    {"key": "lead",                "label": "Leads",                  "desc": "Lead assigned, status change (Won/Lost), reassignment."},
    {"key": "account",             "label": "Accounts",               "desc": "Account assignment, first order milestone, payment overdue."},
    {"key": "approval",            "label": "Approvals",              "desc": "Expense / pricing / marketing waiting on you + decisions back to requester."},
    {"key": "stock_transfer",      "label": "Stock Transfers",        "desc": "Stock-in / stock-out shipments awaiting acceptance."},
    {"key": "return",              "label": "Returns",                "desc": "Returns raised / approved / disputed."},
    {"key": "meeting",             "label": "Meetings",               "desc": "Meeting scheduled / rescheduled / cancelled."},
    {"key": "design_request",     "label": "Design Requests",        "desc": "Design / marketing request status updates."},
    {"key": "print_request",      "label": "Print Requests",         "desc": "Print request status updates."},
    {"key": "mention",            "label": "@-mentions",             "desc": "Someone @-mentions you in a note or comment."},
]
CATEGORY_KEYS = {c["key"] for c in CATEGORIES}

ADMIN_ROLES = {"CEO", "Director", "Admin", "System Admin"}


# ── Schemas ──────────────────────────────────────────────────────────────
class TenantNotificationSettings(BaseModel):
    enabled: bool = True
    # role_name -> { category_key -> bool }
    role_matrix: Dict[str, Dict[str, bool]] = {}


class TenantSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    role_matrix: Optional[Dict[str, Dict[str, bool]]] = None


class UserPrefsUpdate(BaseModel):
    # category_key -> bool (True = user wants to receive)
    categories: Dict[str, bool]


def _require_admin(user: dict):
    if (user.get("role") or "") not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin or CEO access required")


async def get_tenant_settings(tenant_id: str) -> dict:
    """Return the tenant's notification settings doc, creating defaults on
    first read (all roles allowed for every category, kill-switch on)."""
    doc = await _db.notification_tenant_settings.find_one(
        {"tenant_id": tenant_id}, {"_id": 0},
    )
    if doc:
        return doc
    doc = {
        "tenant_id": tenant_id,
        "enabled": True,
        "role_matrix": {},  # empty matrix = default-allow for every (role, category)
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await _db.notification_tenant_settings.insert_one(dict(doc))
    return doc


@router.get("/notification-settings/categories")
async def list_categories(_=Depends(get_current_user)):
    return CATEGORIES


@router.get("/notification-settings/tenant")
async def read_tenant_settings(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    return await get_tenant_settings(tenant_id)


@router.put("/notification-settings/tenant")
async def update_tenant_settings(
    payload: TenantSettingsUpdate,
    current_user: dict = Depends(get_current_user),
):
    _require_admin(current_user)
    tenant_id = get_current_tenant_id()
    await get_tenant_settings(tenant_id)  # ensure exists
    update: dict = {}
    if payload.enabled is not None:
        update["enabled"] = bool(payload.enabled)
    if payload.role_matrix is not None:
        # Sanitize — only keep known category keys.
        cleaned: Dict[str, Dict[str, bool]] = {}
        for role, cats in (payload.role_matrix or {}).items():
            cleaned[role] = {k: bool(v) for k, v in (cats or {}).items() if k in CATEGORY_KEYS}
        update["role_matrix"] = cleaned
    if update:
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await _db.notification_tenant_settings.update_one(
            {"tenant_id": tenant_id}, {"$set": update},
        )
    return await get_tenant_settings(tenant_id)


@router.get("/notification-settings/me")
async def read_my_prefs(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    prefs = await _db.notification_user_prefs.find_one(
        {"tenant_id": tenant_id, "user_id": current_user["id"]},
        {"_id": 0},
    ) or {"categories": {}}
    tenant = await get_tenant_settings(tenant_id)
    role = current_user.get("role") or ""
    role_cfg = (tenant.get("role_matrix") or {}).get(role, {})
    # Effective allow = tenant.enabled AND role_cfg (default True) AND user prefs (default True)
    effective: Dict[str, bool] = {}
    for c in CATEGORIES:
        k = c["key"]
        role_allowed = role_cfg.get(k, True)
        user_optin = (prefs.get("categories") or {}).get(k, True)
        effective[k] = bool(tenant.get("enabled", True)) and bool(role_allowed) and bool(user_optin)
    return {
        "tenant_enabled": tenant.get("enabled", True),
        "role": role,
        "role_matrix": role_cfg,
        "user_prefs": prefs.get("categories") or {},
        "effective": effective,
    }


@router.put("/notification-settings/me")
async def update_my_prefs(
    payload: UserPrefsUpdate,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    cats = {k: bool(v) for k, v in (payload.categories or {}).items() if k in CATEGORY_KEYS}
    await _db.notification_user_prefs.update_one(
        {"tenant_id": tenant_id, "user_id": current_user["id"]},
        {"$set": {"categories": cats, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "categories": cats}


# ── Public helper consumed by notify_users ────────────────────────────────
async def is_category_allowed(tenant_id: str, user: dict, category: str) -> bool:
    """Three-layer check: tenant kill-switch → role matrix → user opt-out.
    Defaults to True at every layer so existing notification calls keep
    working once this module ships (no silent muting)."""
    tenant = await get_tenant_settings(tenant_id)
    if not tenant.get("enabled", True):
        return False
    role = (user or {}).get("role") or ""
    role_cfg = (tenant.get("role_matrix") or {}).get(role, {})
    if not role_cfg.get(category, True):
        return False
    prefs = await _db.notification_user_prefs.find_one(
        {"tenant_id": tenant_id, "user_id": user["id"]},
        {"_id": 0, "categories": 1},
    )
    if prefs and not (prefs.get("categories") or {}).get(category, True):
        return False
    return True
