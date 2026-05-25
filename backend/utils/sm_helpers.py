"""State Machine helpers — runtime consumption.

Provides:
  - get_attached_state_machine(tenant_id, workflow_key) — fetch the SM attached to a workflow.
  - ensure_default_marketing_request_sm(tenant_id) — seed a sensible default SM if none exists.
  - find_transition(sm, current_state_key, action_key) — locate the transition record.
  - user_can_trigger(transition, user) — permission gate.
  - apply_auto_assign(transition, tenant_id) — resolve who the doc should be assigned to.
"""
from datetime import datetime, timezone
from typing import Optional, List
import uuid

from database import db


_ADMIN_ROLES = {"ceo", "director", "system admin", "system_admin", "admin", "tenant_admin"}


def _is_admin(user: dict) -> bool:
    return (user.get("role") or "").strip().lower() in _ADMIN_ROLES


async def get_attached_state_machine(tenant_id: str, workflow_key: str) -> Optional[dict]:
    """Return the first state machine attached to `workflow_key` for this tenant."""
    return await db.state_machines.find_one(
        {"tenant_id": tenant_id, "applied_to": workflow_key},
        {"_id": 0},
    )


def get_initial_state(sm: dict) -> Optional[dict]:
    """Return the state marked `is_initial`, else the first state."""
    states = sm.get("states") or []
    for s in states:
        if s.get("is_initial"):
            return s
    return states[0] if states else None


def find_state(sm: dict, state_key: str) -> Optional[dict]:
    for s in sm.get("states") or []:
        if s.get("key") == state_key:
            return s
    return None


def find_transition(sm: dict, current_state_key: str, action_key: str) -> Optional[dict]:
    """Find a transition matching the current state + action_key.
    Treats from_state == None / '' as 'any state' (initial-only)."""
    for t in sm.get("transitions") or []:
        if t.get("action_key") != action_key:
            continue
        from_state = t.get("from_state") or None
        if from_state in (None, "", current_state_key):
            return t
    return None


def find_transitions_from(sm: dict, current_state_key: str) -> List[dict]:
    """Return all transitions whose `from_state` matches current (or is open/initial)."""
    out = []
    for t in sm.get("transitions") or []:
        from_state = t.get("from_state") or None
        if from_state == current_state_key or (from_state in (None, "") and current_state_key == get_initial_state(sm).get("key")):
            out.append(t)
    return out


async def user_can_trigger(transition: dict, user: dict, tenant_id: str, doc_created_by: Optional[str] = None) -> bool:
    """Check role/department/requestor permission gates on a transition.
    Admins always bypass."""
    if _is_admin(user):
        return True
    if transition.get("requestor_only") and doc_created_by:
        return user.get("id") == doc_created_by
    allowed_roles = [r.lower() for r in (transition.get("allowed_role_keys") or []) if r]
    allowed_depts = [d for d in (transition.get("allowed_department_ids") or []) if d]
    # If no gates set → anyone can trigger
    if not allowed_roles and not allowed_depts:
        return True
    user_role = (user.get("role") or "").strip().lower()
    if user_role and user_role in allowed_roles:
        return True
    user_depts = user.get("department") or []
    if isinstance(user_depts, str):
        user_depts = [user_depts]
    user_depts_lower = {str(d).strip().lower() for d in user_depts if d}
    for dept_id in allowed_depts:
        # Allow matching by id-style string (department name stored in SM)
        if str(dept_id).strip().lower() in user_depts_lower:
            return True
        # Resolve id → name via master_departments
        name = await resolve_department_name(tenant_id, dept_id)
        if name and name.lower() in user_depts_lower:
            return True
    return False


async def resolve_department_name(tenant_id: str, dept_id: str) -> Optional[str]:
    if not dept_id:
        return None
    doc = await db.master_departments.find_one({"id": dept_id, "tenant_id": tenant_id}, {"_id": 0, "name": 1})
    return (doc or {}).get("name")


async def apply_auto_assign(transition: dict, tenant_id: str) -> dict:
    """Resolve the auto-assign target into concrete user/department/role names.
    Returns a dict with keys: assigned_user_id, assigned_user_name, assigned_department_id,
    assigned_department_name, assigned_role, assignee_user_ids (for notifications).
    All keys are None / [] when no auto-assign is configured."""
    result = {
        "assigned_user_id": None,
        "assigned_user_name": None,
        "assigned_department_id": None,
        "assigned_department_name": None,
        "assigned_role": None,
        "assignee_user_ids": [],
        "assignee_label": None,
    }
    mode = transition.get("auto_assign_mode")
    if not mode:
        return result
    if mode == "user":
        uid = transition.get("auto_assign_user_id")
        if not uid:
            return result
        u = await db.users.find_one({"id": uid, "tenant_id": tenant_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
        if not u:
            return result
        result["assigned_user_id"] = u.get("id")
        result["assigned_user_name"] = u.get("name") or u.get("email")
        result["assignee_user_ids"] = [u["id"]]
        result["assignee_label"] = result["assigned_user_name"]
    elif mode == "department":
        did = transition.get("auto_assign_department_id")
        if not did:
            return result
        name = await resolve_department_name(tenant_id, did) or did
        result["assigned_department_id"] = did
        result["assigned_department_name"] = name
        # Notify everyone whose department list includes this department name
        cursor = db.users.find(
            {"tenant_id": tenant_id, "department": name},
            {"_id": 0, "id": 1},
        )
        ids = [u["id"] async for u in cursor]
        result["assignee_user_ids"] = ids
        result["assignee_label"] = f"{name} (department)"
    elif mode == "role":
        role = transition.get("auto_assign_role")
        if not role:
            return result
        result["assigned_role"] = role
        cursor = db.users.find(
            {"tenant_id": tenant_id, "role": role},
            {"_id": 0, "id": 1},
        )
        ids = [u["id"] async for u in cursor]
        result["assignee_user_ids"] = ids
        result["assignee_label"] = f"{role} (role)"
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Default Marketing Request lifecycle — seeded on first list call.
# ─────────────────────────────────────────────────────────────────────────────
_DEFAULT_MR_STATES = [
    {"key": "submitted",                "label": "Submitted",            "color": "#94a3b8", "is_initial": True,  "is_terminal": False},
    {"key": "inputs_needed",            "label": "Inputs Needed",        "color": "#f59e0b", "is_initial": False, "is_terminal": False},
    {"key": "in_progress",              "label": "In Progress",          "color": "#3b82f6", "is_initial": False, "is_terminal": False},
    {"key": "in_review",                "label": "In Review",            "color": "#a855f7", "is_initial": False, "is_terminal": False},
    {"key": "approved_internal",        "label": "Approved (Internal)",  "color": "#6366f1", "is_initial": False, "is_terminal": False},
    {"key": "final_approved",           "label": "Final Approved",       "color": "#10b981", "is_initial": False, "is_terminal": False},
    {"key": "production_in_progress",   "label": "Production In Progress","color":"#f97316", "is_initial": False, "is_terminal": False},
    {"key": "production_completed",     "label": "Production Completed", "color": "#16a34a", "is_initial": False, "is_terminal": True},
]

_DEFAULT_MR_ACTIONS = [
    {"key": "start_working",             "label": "Start Working",             "kind": "positive", "description": "Begin or resume work on the request."},
    {"key": "request_changes",           "label": "Request Changes",           "kind": "negative", "description": "Ask the requestor for clarifications or revisions."},
    {"key": "resume",                    "label": "Resume Work",               "kind": "positive", "description": "Resume after inputs were provided."},
    {"key": "send_for_review",           "label": "Send for Internal Review",  "kind": "neutral",  "description": "Route the work to internal reviewers."},
    {"key": "approve",                   "label": "Internal Approve",          "kind": "positive", "description": "Internal approval from the design / marketing team."},
    {"key": "submit_for_final_approval", "label": "Send to Requestor",         "kind": "neutral",  "description": "Hand off to the requestor for final sign-off."},
    {"key": "final_approve",             "label": "Final Approve",             "kind": "positive", "description": "Requestor's final approval — work is locked."},
    {"key": "close",                     "label": "Mark Completed",            "kind": "positive", "description": "Mark the request as completed."},
    {"key": "reopen",                    "label": "Reopen",                    "kind": "neutral",  "description": "Reopen a completed request."},
]

_DEFAULT_MR_TRANSITIONS = [
    {"action_key": "start_working",            "action_label": "Start Working",          "from_state": "submitted",         "to_state": "in_progress"},
    {"action_key": "request_changes",          "action_label": "Request Inputs",         "from_state": "submitted",         "to_state": "inputs_needed"},
    {"action_key": "resume",                   "action_label": "Resume Work",            "from_state": "inputs_needed",     "to_state": "in_progress"},
    {"action_key": "send_for_review",          "action_label": "Send for Internal Review","from_state":"in_progress",       "to_state": "in_review"},
    {"action_key": "request_changes",          "action_label": "Request Changes",        "from_state": "in_review",         "to_state": "in_progress"},
    {"action_key": "approve",                  "action_label": "Internal Approve",       "from_state": "in_review",         "to_state": "approved_internal"},
    {"action_key": "submit_for_final_approval","action_label": "Send to Requestor",      "from_state": "approved_internal", "to_state": "approved_internal"},
    {"action_key": "final_approve",            "action_label": "Final Approve",          "from_state": "approved_internal", "to_state": "final_approved", "requestor_only": True},
    {"action_key": "request_changes",          "action_label": "Request Revisions",      "from_state": "approved_internal", "to_state": "in_progress",     "requestor_only": True},
    {"action_key": "start_working",            "action_label": "Start Production",       "from_state": "final_approved",    "to_state": "production_in_progress"},
    {"action_key": "close",                    "action_label": "Mark Completed",         "from_state": "production_in_progress", "to_state": "production_completed"},
    {"action_key": "reopen",                   "action_label": "Reopen",                 "from_state": "production_completed",   "to_state": "production_in_progress"},
]


async def ensure_default_marketing_request_sm(tenant_id: str) -> dict:
    """If no state machine is attached to `marketing_requests` for this tenant,
    seed a default one. Returns the attached SM."""
    sm = await get_attached_state_machine(tenant_id, "marketing_requests")
    if sm:
        return sm
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": "Marketing Request Lifecycle (default)",
        "code": "MR_DEFAULT_v1",
        "description": "Auto-seeded default lifecycle for Marketing Requests. Edit or clone in Admin → State Machines.",
        "states": [dict(s) for s in _DEFAULT_MR_STATES],
        "actions": [dict(a) for a in _DEFAULT_MR_ACTIONS],
        "transitions": [
            {
                "auto_assign_mode": None,
                "auto_assign_user_id": None,
                "auto_assign_department_id": None,
                "auto_assign_role": None,
                "notify_all": True,
                "comment_required": False,
                "allowed_role_keys": [],
                "allowed_department_ids": [],
                "requestor_only": False,
                **t,
            }
            for t in _DEFAULT_MR_TRANSITIONS
        ],
        "applied_to": ["marketing_requests"],
        "created_at": now,
        "updated_at": now,
        "created_by": "system",
        "updated_by": "system",
    }
    await db.state_machines.insert_one(doc)
    doc.pop("_id", None)
    return doc
