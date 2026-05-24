"""State Machine — tenant-scoped reusable workflow definitions.

A state machine is a named collection of:
  - States: list of {key, label, color, is_initial, is_terminal}
  - Transitions: list of {action_key, action_label, from_state, to_state,
                          auto_department_ids, auto_role_keys, auto_user_ids}
  - Applied to: list of workflow keys (e.g., "marketing_requests", "leads")

Phase A only — this module persists the definitions and exposes CRUD.
Workflow runtime consumption (auto-assign on transition, replace hardcoded
status lists) ships in Phase B.

Routes (prefix `/state-machines`):
  GET    /                    list
  POST   /                    create
  GET    /{id}                read one
  PUT    /{id}                update
  DELETE /{id}                delete
  POST   /{id}/clone          clone with new name
  GET    /actions/catalog     controlled vocab for action keys
  GET    /workflows/catalog   list of workflows that can attach a state machine
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Controlled-vocab action keys. The label can be overridden per-transition,
# but the key normalises the underlying intent (so workflow code can branch on
# `action_key == 'approve'` regardless of what the customer labelled it).
ACTION_CATALOG = [
    {"key": "submit", "label": "Submit"},
    {"key": "start_working", "label": "Start Working"},
    {"key": "send_for_review", "label": "Send for Internal Review"},
    {"key": "approve", "label": "Approve"},
    {"key": "request_changes", "label": "Request Changes"},
    {"key": "submit_for_final_approval", "label": "Submit for Final Approval"},
    {"key": "final_approve", "label": "Final Approve"},
    {"key": "reject", "label": "Reject"},
    {"key": "reopen", "label": "Reopen"},
    {"key": "cancel", "label": "Cancel"},
    {"key": "close", "label": "Close"},
    {"key": "reassign", "label": "Reassign"},
    {"key": "escalate", "label": "Escalate"},
    {"key": "on_hold", "label": "Put On Hold"},
    {"key": "resume", "label": "Resume"},
    {"key": "custom", "label": "Custom (free text)"},
]

# Workflows that can attach a state machine (Phase B will start consuming these).
WORKFLOW_CATALOG = [
    {"key": "marketing_requests", "label": "Marketing Requests"},
    {"key": "leads", "label": "Leads"},
    {"key": "tasks", "label": "Tasks"},
    {"key": "production_qc", "label": "Production QC"},
    {"key": "credit_notes", "label": "Debit / Credit Notes"},
    {"key": "settlements", "label": "Distributor Settlements"},
    {"key": "customer_returns", "label": "Customer Returns"},
]


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────────────
class State(BaseModel):
    key: str
    label: str
    color: Optional[str] = None  # hex or tailwind token
    is_initial: bool = False
    is_terminal: bool = False


class Transition(BaseModel):
    action_key: str  # one of ACTION_CATALOG.key (or "custom")
    action_label: Optional[str] = None  # override / display text
    from_state: Optional[str] = None  # None = initial transition
    to_state: str
    auto_department_ids: List[str] = Field(default_factory=list)
    auto_role_keys: List[str] = Field(default_factory=list)
    auto_user_ids: List[str] = Field(default_factory=list)
    notify_all: bool = True  # always notify every matched assignee
    comment_required: bool = False


class StateMachineCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    states: List[State] = Field(default_factory=list)
    transitions: List[Transition] = Field(default_factory=list)
    applied_to: List[str] = Field(default_factory=list)


class StateMachineUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    states: Optional[List[State]] = None
    transitions: Optional[List[Transition]] = None
    applied_to: Optional[List[str]] = None


def _is_admin(user: dict) -> bool:
    role = (user.get("role") or "").lower()
    return role in ("ceo", "admin", "system_admin", "tenant_admin")


def _validate(states: List[State], transitions: List[Transition]):
    state_keys = {s.key for s in states}
    if not states:
        raise HTTPException(400, "State machine must have at least one state")
    initial_count = sum(1 for s in states if s.is_initial)
    if initial_count > 1:
        raise HTTPException(400, "Only one state may be marked as initial")
    seen_pairs = set()
    valid_action_keys = {a["key"] for a in ACTION_CATALOG}
    for idx, t in enumerate(transitions):
        if t.action_key not in valid_action_keys:
            raise HTTPException(400, f"Transition #{idx + 1}: unknown action_key '{t.action_key}'")
        if t.to_state not in state_keys:
            raise HTTPException(400, f"Transition #{idx + 1}: to_state '{t.to_state}' is not in states")
        if t.from_state and t.from_state not in state_keys:
            raise HTTPException(400, f"Transition #{idx + 1}: from_state '{t.from_state}' is not in states")
        pair = (t.action_key, t.from_state or "__initial__")
        if pair in seen_pairs:
            raise HTTPException(400, f"Duplicate transition for action '{t.action_key}' from state '{t.from_state or '(initial)'}'")
        seen_pairs.add(pair)


# ─────────────────────────────────────────────────────────────────────────────
# Catalog endpoints
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/actions/catalog")
async def actions_catalog(current_user: dict = Depends(get_current_user)):
    return {"actions": ACTION_CATALOG}


@router.get("/workflows/catalog")
async def workflows_catalog(current_user: dict = Depends(get_current_user)):
    return {"workflows": WORKFLOW_CATALOG}


# ─────────────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/")
async def list_state_machines(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    cursor = db.state_machines.find({"tenant_id": tenant_id}, {"_id": 0}).sort("name", 1)
    return await cursor.to_list(length=200)


@router.post("/")
async def create_state_machine(payload: StateMachineCreate, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can create state machines")
    tenant_id = get_current_tenant_id()
    _validate(payload.states, payload.transitions)
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": payload.name.strip(),
        "code": (payload.code or "").strip() or None,
        "description": payload.description or "",
        "states": [s.model_dump() for s in payload.states],
        "transitions": [t.model_dump() for t in payload.transitions],
        "applied_to": list(set(payload.applied_to or [])),
        "created_at": now,
        "created_by": current_user.get("id"),
        "updated_at": now,
        "updated_by": current_user.get("id"),
    }
    await db.state_machines.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/{sm_id}")
async def get_state_machine(sm_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await db.state_machines.find_one({"id": sm_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "State machine not found")
    return doc


@router.put("/{sm_id}")
async def update_state_machine(sm_id: str, payload: StateMachineUpdate, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can update state machines")
    tenant_id = get_current_tenant_id()
    existing = await db.state_machines.find_one({"id": sm_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "State machine not found")
    data = payload.model_dump(exclude_unset=True)
    if "states" in data or "transitions" in data:
        new_states = [State(**s) for s in (data.get("states") or existing.get("states") or [])]
        new_trans = [Transition(**t) for t in (data.get("transitions") or existing.get("transitions") or [])]
        _validate(new_states, new_trans)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["updated_by"] = current_user.get("id")
    if "applied_to" in data and data["applied_to"] is not None:
        data["applied_to"] = list(set(data["applied_to"]))
    await db.state_machines.update_one({"id": sm_id, "tenant_id": tenant_id}, {"$set": data})
    doc = await db.state_machines.find_one({"id": sm_id, "tenant_id": tenant_id}, {"_id": 0})
    return doc


@router.delete("/{sm_id}")
async def delete_state_machine(sm_id: str, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can delete state machines")
    tenant_id = get_current_tenant_id()
    res = await db.state_machines.delete_one({"id": sm_id, "tenant_id": tenant_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "State machine not found")
    return {"ok": True}


@router.post("/{sm_id}/clone")
async def clone_state_machine(sm_id: str, payload: dict, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can clone state machines")
    tenant_id = get_current_tenant_id()
    src = await db.state_machines.find_one({"id": sm_id, "tenant_id": tenant_id}, {"_id": 0})
    if not src:
        raise HTTPException(404, "State machine not found")
    new_name = (payload.get("name") or f"{src['name']} (copy)").strip()
    now = datetime.now(timezone.utc).isoformat()
    new_doc = {
        **src,
        "id": str(uuid.uuid4()),
        "name": new_name,
        "code": None,
        "applied_to": [],  # cloned copies start un-attached
        "created_at": now,
        "updated_at": now,
        "created_by": current_user.get("id"),
        "updated_by": current_user.get("id"),
    }
    await db.state_machines.insert_one(new_doc)
    new_doc.pop("_id", None)
    return new_doc
