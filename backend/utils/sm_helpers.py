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


async def apply_auto_assign(transition: dict, tenant_id: str, requestor_id: Optional[str] = None) -> dict:
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
    elif mode == "requestor":
        # Assign back to the person who raised the request (the doc creator).
        if not requestor_id:
            return result
        u = await db.users.find_one({"id": requestor_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
        if not u:
            return result
        result["assigned_user_id"] = u.get("id")
        result["assigned_user_name"] = u.get("name") or u.get("email")
        result["assignee_user_ids"] = [u["id"]]
        result["assignee_label"] = f"{result['assigned_user_name']} (requestor)"
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


# ─────────────────────────────────────────────────────────────────────────────
# Generic guard / required-field engine (reusable across any workflow SM).
#
# Two concepts live on each transition:
#   - guards          → boolean preconditions evaluated against the EXISTING
#                       document (e.g. "references count >= 2"). Block the
#                       transition if they fail.
#   - required_fields → NEW data captured at transition time (e.g. neck-tag qty).
#
# Both support an optional `applies_when` filter so a rule only fires for
# certain documents (e.g. request_type_name in ["Neck Tags"]).
# ─────────────────────────────────────────────────────────────────────────────

# Per-workflow catalog of fields a rule can reference. Drives the builder UI.
FIELD_REGISTRY = {
    "marketing_requests": [
        {"key": "references", "label": "Reference files", "type": "file_list"},
        {"key": "logo", "label": "Logo", "type": "file"},
        {"key": "social_media_links", "label": "Social media links", "type": "string_list"},
        {"key": "file_links", "label": "File links", "type": "string_list"},
        {"key": "versions", "label": "Work versions", "type": "list"},
        {"key": "requirement_details", "label": "Requirement details", "type": "text"},
        {"key": "additional_comments", "label": "Additional comments", "type": "text"},
        {"key": "short_timeline_reason", "label": "Short timeline reason", "type": "text"},
        {"key": "requested_due_date", "label": "Requested due date", "type": "date"},
        {"key": "request_type_name", "label": "Request type", "type": "enum"},
        {"key": "assigned_department_name", "label": "Assigned department", "type": "enum"},
        {"key": "lead_id", "label": "Linked lead", "type": "text"},
        {"key": "production.quantity_required", "label": "Production quantity", "type": "number"},
        {"key": "approved_versions", "label": "Approved work versions", "type": "list"},
        {"key": "lead.status", "label": "Linked lead — status", "type": "enum"},
        {"key": "lead.logo_url", "label": "Linked lead — logo", "type": "text"},
        {"key": "lead.city", "label": "Linked lead — city", "type": "text"},
    ],
    "delivery_orders": [
        {"key": "items", "label": "Order line items", "type": "list"},
        {"key": "recipient_type", "label": "Recipient type", "type": "enum"},
        {"key": "requested_date", "label": "Requested delivery date", "type": "date"},
        {"key": "delivery_city", "label": "Delivery city", "type": "text"},
        {"key": "total_value", "label": "Total indicative value", "type": "number"},
        {"key": "notes", "label": "Notes", "type": "text"},
    ],
}

# "Design Requests - New" reuses the same field set as Design Requests (marketing_requests).
FIELD_REGISTRY["design_requests_new"] = list(FIELD_REGISTRY["marketing_requests"])


# Operators valid for each field type. Each carries `needs_value` so the UI
# knows whether to render a value input.
OPERATORS_BY_TYPE = {
    "file": [
        {"key": "exists", "label": "is uploaded", "needs_value": False},
        {"key": "not_exists", "label": "is missing", "needs_value": False},
    ],
    "file_list": [
        {"key": "count_gte", "label": "has at least (N)", "needs_value": True},
        {"key": "count_lte", "label": "has at most (N)", "needs_value": True},
        {"key": "not_empty", "label": "has any", "needs_value": False},
        {"key": "is_empty", "label": "is empty", "needs_value": False},
    ],
    "string_list": [
        {"key": "count_gte", "label": "has at least (N)", "needs_value": True},
        {"key": "count_lte", "label": "has at most (N)", "needs_value": True},
        {"key": "not_empty", "label": "has any", "needs_value": False},
        {"key": "is_empty", "label": "is empty", "needs_value": False},
    ],
    "list": [
        {"key": "count_gte", "label": "has at least (N)", "needs_value": True},
        {"key": "count_lte", "label": "has at most (N)", "needs_value": True},
        {"key": "not_empty", "label": "has any", "needs_value": False},
        {"key": "is_empty", "label": "is empty", "needs_value": False},
    ],
    "number": [
        {"key": "gte", "label": "≥", "needs_value": True},
        {"key": "gt", "label": ">", "needs_value": True},
        {"key": "lte", "label": "≤", "needs_value": True},
        {"key": "lt", "label": "<", "needs_value": True},
        {"key": "eq", "label": "=", "needs_value": True},
        {"key": "ne", "label": "≠", "needs_value": True},
        {"key": "exists", "label": "is set", "needs_value": False},
    ],
    "text": [
        {"key": "not_empty", "label": "is filled in", "needs_value": False},
        {"key": "is_empty", "label": "is empty", "needs_value": False},
        {"key": "contains", "label": "contains", "needs_value": True},
        {"key": "eq", "label": "equals", "needs_value": True},
    ],
    "enum": [
        {"key": "in", "label": "is one of", "needs_value": True},
        {"key": "not_in", "label": "is not one of", "needs_value": True},
        {"key": "eq", "label": "equals", "needs_value": True},
        {"key": "ne", "label": "not equals", "needs_value": True},
    ],
    "date": [
        {"key": "not_empty", "label": "is set", "needs_value": False},
        {"key": "before", "label": "is before", "needs_value": True},
        {"key": "after", "label": "is after", "needs_value": True},
    ],
}

# Field types valid for required-field capture (NEW data collected on transition).
REQUIRED_FIELD_TYPES = ["text", "number", "date", "select"]


def _resolve_path(doc: dict, path: str):
    cur = doc
    for part in (path or "").split("."):
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _count(v) -> int:
    if v is None:
        return 0
    if isinstance(v, (list, tuple, str)):
        return len(v)
    return 1


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _apply_op(val, op: str, target) -> bool:
    if op == "exists":
        return val not in (None, "", [], {})
    if op == "not_exists":
        return val in (None, "", [], {})
    if op == "is_empty":
        return not val
    if op == "not_empty":
        return bool(val)
    if op == "count_gte":
        return _count(val) >= int(_num(target) or 0)
    if op == "count_lte":
        return _count(val) <= int(_num(target) or 0)
    if op in ("eq", "ne"):
        # numeric compare when both look numeric, else string compare
        a, b = _num(val), _num(target)
        if a is not None and b is not None:
            return (a == b) if op == "eq" else (a != b)
        return (str(val) == str(target)) if op == "eq" else (str(val) != str(target))
    if op in ("gt", "gte", "lt", "lte"):
        a, b = _num(val), _num(target)
        if a is None or b is None:
            return False
        return {"gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]
    if op == "contains":
        return str(target or "") in str(val or "")
    if op == "in":
        return val in (target or [])
    if op == "not_in":
        return val not in (target or [])
    if op == "before":
        return bool(val) and str(val) < str(target)
    if op == "after":
        return bool(val) and str(val) > str(target)
    return True  # unknown operator → don't block


def applies_when(rule_when: Optional[dict], doc: dict) -> bool:
    """A rule fires only when every field in `applies_when` matches the doc.
    Value may be a scalar or a list (membership). Empty/None = always applies."""
    if not rule_when:
        return True
    for field, allowed in rule_when.items():
        val = _resolve_path(doc, field)
        if isinstance(allowed, list):
            if val not in allowed:
                return False
        elif val != allowed:
            return False
    return True


def evaluate_guards(guards: Optional[dict], doc: dict):
    """Return (passed: bool, reasons: List[str]) for a transition's guard block."""
    if not guards:
        return True, []
    conditions = guards.get("conditions") or []
    match = (guards.get("match") or "all").lower()
    results, reasons = [], []
    for c in conditions:
        if not applies_when(c.get("applies_when"), doc):
            continue
        val = _resolve_path(doc, c.get("field") or "")
        ok = _apply_op(val, c.get("op") or "", c.get("value"))
        results.append(ok)
        if not ok:
            reasons.append(
                c.get("message")
                or f"Requires: {c.get('field')} {c.get('op')} {c.get('value')}"
            )
    if not results:
        return True, []
    passed = all(results) if match == "all" else any(results)
    if passed:
        return True, []
    return False, reasons


def applicable_required_fields(required_fields: Optional[list], doc: dict) -> list:
    """Filter a transition's required_fields down to those that apply to this doc."""
    out = []
    for f in (required_fields or []):
        if applies_when(f.get("applies_when"), doc):
            out.append(f)
    return out


def evaluate_required_fields(required_fields: Optional[list], doc: dict, data: Optional[dict]):
    """Validate captured field data. Returns (ok, errors, cleaned_values)."""
    data = data or {}
    errors, cleaned = [], {}
    for f in applicable_required_fields(required_fields, doc):
        key = f.get("key")
        label = f.get("label") or key
        ftype = f.get("type") or "text"
        required = f.get("required", True)
        raw = data.get(key)
        if raw in (None, "", []):
            if required:
                errors.append(f"{label} is required.")
            continue
        if ftype == "number":
            num = _num(raw)
            if num is None:
                errors.append(f"{label} must be a number.")
                continue
            if f.get("min") is not None and num < float(f["min"]):
                errors.append(f"{label} must be ≥ {f['min']}.")
            if f.get("max") is not None and num > float(f["max"]):
                errors.append(f"{label} must be ≤ {f['max']}.")
            cleaned[key] = num
        elif ftype == "select":
            opts = f.get("options") or []
            if opts and raw not in opts:
                errors.append(f"{label} must be one of: {', '.join(map(str, opts))}.")
            else:
                cleaned[key] = raw
        else:
            cleaned[key] = raw
    return (len(errors) == 0), errors, cleaned


# ─────────────────────────────────────────────────────────────────────────────
# Derived fields for guards. Some business rules need conditions that aren't
# stored directly on the document — e.g. "has an APPROVED version" or an
# attribute of the linked lead. We compute those on the fly and merge them into
# a copy of the doc before the guard engine runs. `_resolve_path` already walks
# dotted keys, so nested data (lead.status, lead.logo_url…) is guardable.
# ─────────────────────────────────────────────────────────────────────────────
_LEAD_GUARD_FIELDS = {"_id": 0, "status": 1, "city": 1, "company": 1, "logo_url": 1, "priority": 1}


async def augment_doc_for_guards(doc: dict, tenant_id: str) -> dict:
    """Return a copy of `doc` enriched with derived, guardable fields:
      - approved_versions : work versions whose is_approved flag is set
      - lead              : attributes of the linked lead (status, city, logo…)
    Safe for any workflow — irrelevant keys simply resolve to empty values."""
    d = dict(doc)
    versions = d.get("versions") or []
    d["approved_versions"] = [
        v for v in versions if isinstance(v, dict) and v.get("is_approved")
    ]
    lead_id = d.get("lead_id")
    if lead_id:
        d["lead"] = await db.leads.find_one(
            {"id": lead_id, "tenant_id": tenant_id}, _LEAD_GUARD_FIELDS
        ) or {}
    else:
        d["lead"] = {}
    return d


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

async def ensure_default_design_requests_new_sm(tenant_id: str) -> dict:
    """If no state machine is attached to `design_requests_new` for this tenant,
    seed a default one (reuses the Marketing Request lifecycle template). Returns the attached SM."""
    sm = await get_attached_state_machine(tenant_id, "design_requests_new")
    if sm:
        return sm
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": "Design Requests - New Lifecycle (default)",
        "code": "DRN_DEFAULT_v1",
        "description": "Auto-seeded default lifecycle for Design Requests - New. Edit or clone in Admin → State Machines.",
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
        "applied_to": ["design_requests_new"],
        "created_at": now,
        "updated_at": now,
        "created_by": "system",
        "updated_by": "system",
    }
    await db.state_machines.insert_one(doc)
    doc.pop("_id", None)
    return doc





# ─────────────────────────────────────────────────────────────────────────────
# Default Delivery Order lifecycle — seeded on first list call.
# Approval = "both": a reporting-manager task is raised on submit (handled in the
# delivery_orders route) AND the approve/reject transitions are role-gated here.
# On entering `approved`, the route auto-creates a DRAFT promotional stock-out
# for the distributor that covers the delivery city.
# ─────────────────────────────────────────────────────────────────────────────
_APPROVER_ROLES = [
    "CEO", "Director", "Vice President", "National Sales Head",
    "Regional Sales Manager", "Head of Business", "Admin", "System Admin",
]

_DEFAULT_DO_STATES = [
    {"key": "draft",            "label": "Draft",            "color": "#94a3b8", "is_initial": True,  "is_terminal": False},
    {"key": "pending_approval", "label": "Pending Approval", "color": "#f59e0b", "is_initial": False, "is_terminal": False},
    {"key": "approved",         "label": "Approved",         "color": "#10b981", "is_initial": False, "is_terminal": False},
    {"key": "placed",           "label": "Order Placed",     "color": "#0ea5e9", "is_initial": False, "is_terminal": False},
    {"key": "rejected",         "label": "Rejected",         "color": "#ef4444", "is_initial": False, "is_terminal": True},
    {"key": "cancelled",        "label": "Cancelled",        "color": "#6b7280", "is_initial": False, "is_terminal": True},
    {"key": "fulfilled",        "label": "Fulfilled",        "color": "#16a34a", "is_initial": False, "is_terminal": True},
]

_DEFAULT_DO_ACTIONS = [
    {"key": "submit",         "label": "Submit for Approval", "kind": "neutral",  "description": "Send the delivery order for approval."},
    {"key": "approve",        "label": "Approve",             "kind": "positive", "description": "Approve the delivery order."},
    {"key": "reject",         "label": "Reject",              "kind": "negative", "description": "Reject the delivery order."},
    {"key": "place_order",    "label": "Place Order",         "kind": "positive", "description": "Place the order — auto-creates a draft promotional stock-out at the servicing distributor."},
    {"key": "cancel",         "label": "Cancel",              "kind": "negative", "description": "Cancel the delivery order."},
    {"key": "mark_fulfilled", "label": "Mark Fulfilled",      "kind": "positive", "description": "Mark the order as fulfilled."},
    {"key": "reopen",         "label": "Reopen as Draft",     "kind": "neutral",  "description": "Reopen a rejected order for editing."},
]

_DEFAULT_DO_TRANSITIONS = [
    {"action_key": "submit",         "action_label": "Submit for Approval", "from_state": "draft",            "to_state": "pending_approval", "requestor_only": True},
    {"action_key": "approve",        "action_label": "Approve",             "from_state": "pending_approval", "to_state": "approved",         "allowed_role_keys": list(_APPROVER_ROLES)},
    {"action_key": "reject",         "action_label": "Reject",              "from_state": "pending_approval", "to_state": "rejected",         "allowed_role_keys": list(_APPROVER_ROLES), "comment_required": True},
    {"action_key": "place_order",    "action_label": "Place Order",         "from_state": "approved",         "to_state": "placed",           "allowed_role_keys": list(_APPROVER_ROLES)},
    {"action_key": "cancel",         "action_label": "Cancel",              "from_state": "draft",            "to_state": "cancelled"},
    {"action_key": "cancel",         "action_label": "Cancel",              "from_state": "pending_approval", "to_state": "cancelled"},
    {"action_key": "mark_fulfilled", "action_label": "Mark Fulfilled",      "from_state": "placed",           "to_state": "fulfilled",        "allowed_role_keys": list(_APPROVER_ROLES)},
    {"action_key": "reopen",         "action_label": "Reopen as Draft",     "from_state": "rejected",         "to_state": "draft",            "requestor_only": True},
]


async def ensure_default_delivery_order_sm(tenant_id: str) -> dict:
    """If no state machine is attached to `delivery_orders` for this tenant,
    seed a default one. Returns the attached SM."""
    sm = await get_attached_state_machine(tenant_id, "delivery_orders")
    if sm:
        return sm
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": "Delivery Order Lifecycle (default)",
        "code": "DO_DEFAULT_v1",
        "description": "Auto-seeded default lifecycle for Delivery Orders. Edit or clone in Admin → State Machines.",
        "states": [dict(s) for s in _DEFAULT_DO_STATES],
        "actions": [dict(a) for a in _DEFAULT_DO_ACTIONS],
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
            for t in _DEFAULT_DO_TRANSITIONS
        ],
        "applied_to": ["delivery_orders"],
        "created_at": now,
        "updated_at": now,
        "created_by": "system",
        "updated_by": "system",
    }
    await db.state_machines.insert_one(doc)
    doc.pop("_id", None)
    return doc
