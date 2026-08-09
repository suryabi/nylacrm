"""Event Journeys — comprehensive marketing event management:
multi-day schedules, stakeholders (internal/external), project plan with
dependencies + file uploads, budget planning, and in-app notifications."""
import os
import uuid
import logging
from datetime import datetime, timezone, date as date_cls, timedelta
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse, Response
from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db
from utils.sm_helpers import (
    ensure_default_event_budget_sm, find_transition, find_state, user_can_trigger,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/events", tags=["Event Journeys"])

UPLOAD_DIR = "/app/backend/uploads/event_tasks"
BUDGET_UPLOAD_DIR = "/app/backend/uploads/event_budget"
MAX_FILE_MB = 15
TASK_STATUSES = ["not_started", "in_progress", "blocked", "done"]
EVENT_STATUSES = ["planned", "in_progress", "completed", "cancelled"]
DEFAULT_SCOPES = ["Photography", "Videos", "Standee Vendor", "Artwork", "Printing", "Coordination"]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class DaySchedule(BaseModel):
    date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class EventIn(BaseModel):
    name: str
    event_type: Optional[str] = None
    status: str = "planned"
    location: Optional[str] = None
    budget: Optional[float] = None
    expected_attendees: Optional[int] = None
    description: Optional[str] = None
    requirements: List[str] = []
    date_from: str
    date_to: str
    day_schedules: List[DaySchedule] = []


class StakeholderIn(BaseModel):
    is_internal: bool = False
    user_id: Optional[str] = None
    company_name: Optional[str] = None
    contact_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    scopes: List[str] = []
    notes: Optional[str] = None


class TaskIn(BaseModel):
    name: str
    description: Optional[str] = None
    owner_type: Optional[str] = None       # 'stakeholder' | 'user'
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    depends_on: List[str] = []
    status: str = "not_started"


class BudgetItemIn(BaseModel):
    category: str
    description: Optional[str] = None
    planned_amount: float = 0
    approved_amount: Optional[float] = None
    actual_amount: Optional[float] = None
    vendor: Optional[str] = None


class BudgetTransitionIn(BaseModel):
    action_key: str
    comment: Optional[str] = None
    line_approvals: List[dict] = []  # [{id, approved_amount}]


async def _get_event(tenant_id: str, event_id: str) -> dict:
    ev = await db.event_journeys.find_one({"tenant_id": tenant_id, "id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "Event not found")
    return ev


def _progress(tasks: list) -> int:
    if not tasks:
        return 0
    done = sum(1 for t in tasks if t.get("status") == "done")
    return round(done * 100 / len(tasks))


async def _notify(tenant_id: str, user_id: Optional[str], title: str, body: str, link: str,
                  entity_id: str, dedupe_key: Optional[str] = None, entity_type: str = "event_task"):
    if not user_id:
        return
    if dedupe_key:
        exists = await db.notifications.find_one(
            {"tenant_id": tenant_id, "user_id": user_id, "entity_type": entity_type, "entity_id": entity_id,
             "category": dedupe_key})
        if exists:
            return
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "user_id": user_id,
        "title": title, "body": body, "link": link, "kind": "info", "category": dedupe_key or "event",
        "entity_type": entity_type, "entity_id": entity_id, "is_read": False, "created_at": _now(),
    })


async def _task_owner_user_id(tenant_id: str, task: dict) -> Optional[str]:
    if task.get("owner_type") == "user":
        return task.get("owner_id")
    if task.get("owner_type") == "stakeholder":
        sh = await db.event_stakeholders.find_one(
            {"tenant_id": tenant_id, "id": task.get("owner_id")}, {"_id": 0, "user_id": 1})
        return (sh or {}).get("user_id")
    return None


async def _generate_reminders(tenant_id: str, event: dict, tasks: list):
    """Lazy reminders: due within 2 days or overdue → one in-app notification per task per day."""
    today = _today()
    soon = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d")
    for t in tasks:
        if t.get("status") == "done" or not t.get("end_date"):
            continue
        uid = await _task_owner_user_id(tenant_id, t)
        if not uid:
            continue
        link = f"/events/{event['id']}"
        if t["end_date"] < today:
            await _notify(tenant_id, uid, f"Overdue: {t['name']}",
                          f"Task for event '{event['name']}' was due {t['end_date']}.",
                          link, t["id"], dedupe_key=f"overdue:{today}")
        elif t["end_date"] <= soon:
            await _notify(tenant_id, uid, f"Due soon: {t['name']}",
                          f"Task for event '{event['name']}' is due {t['end_date']}.",
                          link, t["id"], dedupe_key=f"duesoon:{today}")


# ── Events ────────────────────────────────────────────────────

@router.get("")
async def list_events(current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    events = await db.event_journeys.find({"tenant_id": tenant_id}, {"_id": 0}).sort("date_from", -1).to_list(500)
    for ev in events:
        tasks = await db.event_tasks.find({"tenant_id": tenant_id, "event_id": ev["id"]}, {"_id": 0, "status": 1, "end_date": 1}).to_list(1000)
        ev["task_count"] = len(tasks)
        ev["progress"] = _progress(tasks)
        today = _today()
        ev["overdue_tasks"] = sum(1 for t in tasks if t.get("status") != "done" and (t.get("end_date") or "9999") < today)
        ev["stakeholder_count"] = await db.event_stakeholders.count_documents({"tenant_id": tenant_id, "event_id": ev["id"]})
    return {"events": events, "scopes": DEFAULT_SCOPES}


@router.post("")
async def create_event(data: EventIn, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if not data.name.strip():
        raise HTTPException(400, "Event name is required")
    if data.date_to < data.date_from:
        raise HTTPException(400, "End date cannot be before start date")
    if data.status not in EVENT_STATUSES:
        raise HTTPException(400, "Invalid status")
    doc = data.dict()
    doc["day_schedules"] = [d.dict() for d in data.day_schedules]
    doc.update({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name") or current_user.get("email"),
        "created_at": _now(), "updated_at": _now(),
    })
    await db.event_journeys.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


def _budget_state(ev: dict) -> str:
    return ev.get("budget_state") or "draft"


async def _budget_transitions_for_user(sm: dict, ev: dict, current_user: dict, tenant_id: str) -> list:
    kinds = {a.get("key"): a.get("kind", "neutral") for a in sm.get("actions") or []}
    state = _budget_state(ev)
    out = []
    for t in sm.get("transitions") or []:
        if (t.get("from_state") or None) != state:
            continue
        if not await user_can_trigger(t, current_user, tenant_id, ev.get("created_by")):
            continue
        out.append({
            "action_key": t.get("action_key"),
            "label": t.get("action_label") or t.get("action_key"),
            "kind": kinds.get(t.get("action_key"), "neutral"),
            "comment_required": bool(t.get("comment_required")),
            "to_state": t.get("to_state"),
        })
    return out


@router.get("/{event_id}")
async def get_event_detail(event_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    ev = await _get_event(tenant_id, event_id)
    stakeholders = await db.event_stakeholders.find({"tenant_id": tenant_id, "event_id": event_id}, {"_id": 0}).to_list(200)
    tasks = await db.event_tasks.find({"tenant_id": tenant_id, "event_id": event_id}, {"_id": 0}).sort("start_date", 1).to_list(1000)
    budget_items = await db.event_budget_items.find({"tenant_id": tenant_id, "event_id": event_id}, {"_id": 0}).to_list(500)
    await _generate_reminders(tenant_id, ev, tasks)
    sm = await ensure_default_event_budget_sm(tenant_id)
    b_state = _budget_state(ev)
    state_def = find_state(sm, b_state) or {"key": b_state, "label": b_state.replace("_", " ").title()}
    ev.update({
        "stakeholders": stakeholders,
        "tasks": tasks,
        "budget_items": budget_items,
        "progress": _progress(tasks),
        "budget_planned_total": sum(b.get("planned_amount") or 0 for b in budget_items),
        "budget_approved_total": sum(b.get("approved_amount") or 0 for b in budget_items),
        "budget_actual_total": sum(b.get("actual_amount") or 0 for b in budget_items),
        "budget_state": b_state,
        "budget_state_label": state_def.get("label"),
        "budget_state_color": state_def.get("color"),
        "budget_transitions": await _budget_transitions_for_user(sm, ev, current_user, tenant_id),
        "budget_history": ev.get("budget_history") or [],
        "scopes": DEFAULT_SCOPES,
    })
    return ev


@router.put("/{event_id}")
async def update_event(event_id: str, data: EventIn, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    await _get_event(tenant_id, event_id)
    updates = data.dict()
    updates["day_schedules"] = [d.dict() for d in data.day_schedules]
    updates["updated_at"] = _now()
    await db.event_journeys.update_one({"tenant_id": tenant_id, "id": event_id}, {"$set": updates})
    return await _get_event(tenant_id, event_id)


@router.delete("/{event_id}")
async def delete_event(event_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    await _get_event(tenant_id, event_id)
    await db.event_journeys.delete_one({"tenant_id": tenant_id, "id": event_id})
    await db.event_stakeholders.delete_many({"tenant_id": tenant_id, "event_id": event_id})
    await db.event_tasks.delete_many({"tenant_id": tenant_id, "event_id": event_id})
    await db.event_budget_items.delete_many({"tenant_id": tenant_id, "event_id": event_id})
    return {"deleted": True}


# ── Stakeholders ─────────────────────────────────────────────

@router.post("/{event_id}/stakeholders")
async def add_stakeholder(event_id: str, data: StakeholderIn, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    await _get_event(tenant_id, event_id)
    if not data.contact_name.strip():
        raise HTTPException(400, "Contact name is required")
    doc = data.dict()
    doc.update({"id": str(uuid.uuid4()), "tenant_id": tenant_id, "event_id": event_id, "created_at": _now()})
    await db.event_stakeholders.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/{event_id}/stakeholders/{sid}")
async def update_stakeholder(event_id: str, sid: str, data: StakeholderIn, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    res = await db.event_stakeholders.update_one(
        {"tenant_id": tenant_id, "event_id": event_id, "id": sid}, {"$set": data.dict()})
    if res.matched_count == 0:
        raise HTTPException(404, "Stakeholder not found")
    return await db.event_stakeholders.find_one({"tenant_id": tenant_id, "id": sid}, {"_id": 0})


@router.delete("/{event_id}/stakeholders/{sid}")
async def delete_stakeholder(event_id: str, sid: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    res = await db.event_stakeholders.delete_one({"tenant_id": tenant_id, "event_id": event_id, "id": sid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Stakeholder not found")
    return {"deleted": True}


# ── Plan tasks ───────────────────────────────────────────────

async def _check_dependencies(tenant_id: str, event_id: str, task: dict, new_status: str):
    if new_status in ("in_progress", "done") and task.get("depends_on"):
        deps = await db.event_tasks.find(
            {"tenant_id": tenant_id, "event_id": event_id, "id": {"$in": task["depends_on"]}},
            {"_id": 0, "name": 1, "status": 1}).to_list(100)
        pending = [d["name"] for d in deps if d.get("status") != "done"]
        if pending:
            raise HTTPException(400, f"Blocked by incomplete dependencies: {', '.join(pending)}")


@router.post("/{event_id}/tasks")
async def add_task(event_id: str, data: TaskIn, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    ev = await _get_event(tenant_id, event_id)
    if not data.name.strip():
        raise HTTPException(400, "Task name is required")
    if data.status not in TASK_STATUSES:
        raise HTTPException(400, "Invalid status")
    if data.start_date and data.end_date and data.end_date < data.start_date:
        raise HTTPException(400, "Task end date cannot be before start date")
    doc = data.dict()
    doc.update({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "event_id": event_id,
        "files": [], "created_at": _now(), "updated_at": _now(),
    })
    await _check_dependencies(tenant_id, event_id, doc, data.status)
    await db.event_tasks.insert_one(dict(doc))
    doc.pop("_id", None)
    uid = await _task_owner_user_id(tenant_id, doc)
    if uid and uid != current_user.get("id"):
        await _notify(tenant_id, uid, f"New event task: {data.name}",
                      f"You've been assigned a task for event '{ev['name']}'"
                      + (f" due {data.end_date}" if data.end_date else "") + ".",
                      f"/events/{event_id}", doc["id"])
    return doc


@router.put("/{event_id}/tasks/{tid}")
async def update_task(event_id: str, tid: str, data: TaskIn, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    ev = await _get_event(tenant_id, event_id)
    task = await db.event_tasks.find_one({"tenant_id": tenant_id, "event_id": event_id, "id": tid}, {"_id": 0})
    if not task:
        raise HTTPException(404, "Task not found")
    if data.status not in TASK_STATUSES:
        raise HTTPException(400, "Invalid status")
    if tid in data.depends_on:
        raise HTTPException(400, "A task cannot depend on itself")
    if data.start_date and data.end_date and data.end_date < data.start_date:
        raise HTTPException(400, "Task end date cannot be before start date")
    merged = {**task, **data.dict()}
    if data.status != task.get("status"):
        await _check_dependencies(tenant_id, event_id, merged, data.status)
    updates = data.dict()
    updates["updated_at"] = _now()
    await db.event_tasks.update_one({"tenant_id": tenant_id, "event_id": event_id, "id": tid}, {"$set": updates})
    new_owner = await _task_owner_user_id(tenant_id, updates | {"owner_type": data.owner_type, "owner_id": data.owner_id})
    old_owner = await _task_owner_user_id(tenant_id, task)
    if new_owner and new_owner != old_owner and new_owner != current_user.get("id"):
        await _notify(tenant_id, new_owner, f"Event task assigned: {data.name}",
                      f"You've been assigned a task for event '{ev['name']}'.",
                      f"/events/{event_id}", tid)
    return await db.event_tasks.find_one({"tenant_id": tenant_id, "id": tid}, {"_id": 0})


@router.delete("/{event_id}/tasks/{tid}")
async def delete_task(event_id: str, tid: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    res = await db.event_tasks.delete_one({"tenant_id": tenant_id, "event_id": event_id, "id": tid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Task not found")
    await db.event_tasks.update_many(
        {"tenant_id": tenant_id, "event_id": event_id}, {"$pull": {"depends_on": tid}})
    return {"deleted": True}


# ── Task files ───────────────────────────────────────────────

@router.post("/{event_id}/tasks/{tid}/files")
async def upload_task_file(event_id: str, tid: str, file: UploadFile = File(...),
                           current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    task = await db.event_tasks.find_one({"tenant_id": tenant_id, "event_id": event_id, "id": tid}, {"_id": 0, "id": 1})
    if not task:
        raise HTTPException(404, "Task not found")
    content = await file.read()
    if len(content) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large (max {MAX_FILE_MB} MB)")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_id = str(uuid.uuid4())
    safe_name = os.path.basename(file.filename or "file")
    path = os.path.join(UPLOAD_DIR, f"{file_id}_{safe_name}")
    with open(path, "wb") as fh:
        fh.write(content)
    meta = {"id": file_id, "filename": safe_name, "size": len(content),
            "content_type": file.content_type,
            "uploaded_by": current_user.get("name") or current_user.get("email"),
            "uploaded_at": _now()}
    await db.event_tasks.update_one(
        {"tenant_id": tenant_id, "event_id": event_id, "id": tid},
        {"$push": {"files": meta}, "$set": {"updated_at": _now()}})
    return meta


@router.get("/{event_id}/tasks/{tid}/files/{file_id}")
async def download_task_file(event_id: str, tid: str, file_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    task = await db.event_tasks.find_one({"tenant_id": tenant_id, "event_id": event_id, "id": tid}, {"_id": 0, "files": 1})
    if not task:
        raise HTTPException(404, "Task not found")
    meta = next((f for f in task.get("files", []) if f["id"] == file_id), None)
    if not meta:
        raise HTTPException(404, "File not found")
    path = os.path.join(UPLOAD_DIR, f"{file_id}_{meta['filename']}")
    if not os.path.exists(path):
        raise HTTPException(404, "File missing from storage")
    return FileResponse(path, filename=meta["filename"], media_type=meta.get("content_type") or "application/octet-stream")


@router.delete("/{event_id}/tasks/{tid}/files/{file_id}")
async def delete_task_file(event_id: str, tid: str, file_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    task = await db.event_tasks.find_one({"tenant_id": tenant_id, "event_id": event_id, "id": tid}, {"_id": 0, "files": 1})
    if not task:
        raise HTTPException(404, "Task not found")
    meta = next((f for f in task.get("files", []) if f["id"] == file_id), None)
    if not meta:
        raise HTTPException(404, "File not found")
    path = os.path.join(UPLOAD_DIR, f"{file_id}_{meta['filename']}")
    if os.path.exists(path):
        os.remove(path)
    await db.event_tasks.update_one(
        {"tenant_id": tenant_id, "event_id": event_id, "id": tid},
        {"$pull": {"files": {"id": file_id}}, "$set": {"updated_at": _now()}})
    return {"deleted": True}


# ── Budget items ─────────────────────────────────────────────

@router.post("/{event_id}/budget-items")
async def add_budget_item(event_id: str, data: BudgetItemIn, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    ev = await _get_event(tenant_id, event_id)
    if _budget_state(ev) != "draft":
        raise HTTPException(409, f"Budget is locked ({_budget_state(ev).replace('_', ' ')}). Reopen to draft to add lines.")
    if not data.category.strip():
        raise HTTPException(400, "Category is required")
    doc = data.dict()
    doc.update({"id": str(uuid.uuid4()), "tenant_id": tenant_id, "event_id": event_id, "created_at": _now()})
    await db.event_budget_items.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/{event_id}/budget-items/{bid}")
async def update_budget_item(event_id: str, bid: str, data: BudgetItemIn, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    ev = await _get_event(tenant_id, event_id)
    existing = await db.event_budget_items.find_one({"tenant_id": tenant_id, "event_id": event_id, "id": bid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Budget item not found")
    state = _budget_state(ev)
    if state == "pending_approval":
        raise HTTPException(409, "Budget is pending approval — lines are locked.")
    updates = data.dict()
    if state == "approved":
        # Only the actual amount may be recorded once approved.
        for k in ("category", "description", "vendor", "planned_amount"):
            if updates.get(k) != existing.get(k):
                raise HTTPException(409, "Budget is approved — only the actual amount can be recorded. Reopen the budget to change plans.")
        updates = {"actual_amount": updates.get("actual_amount")}
    elif state == "rejected":
        raise HTTPException(409, "Budget was rejected — reopen it as draft to make changes.")
    else:
        updates.pop("approved_amount", None)  # approved amount is set via the approval workflow
    await db.event_budget_items.update_one(
        {"tenant_id": tenant_id, "event_id": event_id, "id": bid}, {"$set": updates})
    return await db.event_budget_items.find_one({"tenant_id": tenant_id, "id": bid}, {"_id": 0})


@router.delete("/{event_id}/budget-items/{bid}")
async def delete_budget_item(event_id: str, bid: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    ev = await _get_event(tenant_id, event_id)
    if _budget_state(ev) != "draft":
        raise HTTPException(409, f"Budget is locked ({_budget_state(ev).replace('_', ' ')}). Reopen to draft to delete lines.")
    res = await db.event_budget_items.delete_one({"tenant_id": tenant_id, "event_id": event_id, "id": bid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Budget item not found")
    return {"deleted": True}


# ── Budget line files (vendor bills / invoices) ──────────────

@router.post("/{event_id}/budget-items/{bid}/files")
async def upload_budget_file(event_id: str, bid: str, file: UploadFile = File(...),
                             current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    item = await db.event_budget_items.find_one({"tenant_id": tenant_id, "event_id": event_id, "id": bid}, {"_id": 0, "id": 1})
    if not item:
        raise HTTPException(404, "Budget item not found")
    content = await file.read()
    if len(content) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large (max {MAX_FILE_MB} MB)")
    os.makedirs(BUDGET_UPLOAD_DIR, exist_ok=True)
    file_id = str(uuid.uuid4())
    safe_name = os.path.basename(file.filename or "file")
    with open(os.path.join(BUDGET_UPLOAD_DIR, f"{file_id}_{safe_name}"), "wb") as fh:
        fh.write(content)
    meta = {"id": file_id, "filename": safe_name, "size": len(content),
            "content_type": file.content_type,
            "uploaded_by": current_user.get("name") or current_user.get("email"),
            "uploaded_at": _now()}
    await db.event_budget_items.update_one(
        {"tenant_id": tenant_id, "event_id": event_id, "id": bid}, {"$push": {"files": meta}})
    return meta


@router.get("/{event_id}/budget-items/{bid}/files/{file_id}")
async def download_budget_file(event_id: str, bid: str, file_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    item = await db.event_budget_items.find_one({"tenant_id": tenant_id, "event_id": event_id, "id": bid}, {"_id": 0, "files": 1})
    if not item:
        raise HTTPException(404, "Budget item not found")
    meta = next((f for f in item.get("files", []) if f["id"] == file_id), None)
    if not meta:
        raise HTTPException(404, "File not found")
    path = os.path.join(BUDGET_UPLOAD_DIR, f"{file_id}_{meta['filename']}")
    if not os.path.exists(path):
        raise HTTPException(404, "File missing from storage")
    return FileResponse(path, filename=meta["filename"], media_type=meta.get("content_type") or "application/octet-stream")


@router.delete("/{event_id}/budget-items/{bid}/files/{file_id}")
async def delete_budget_file(event_id: str, bid: str, file_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    item = await db.event_budget_items.find_one({"tenant_id": tenant_id, "event_id": event_id, "id": bid}, {"_id": 0, "files": 1})
    if not item:
        raise HTTPException(404, "Budget item not found")
    meta = next((f for f in item.get("files", []) if f["id"] == file_id), None)
    if not meta:
        raise HTTPException(404, "File not found")
    path = os.path.join(BUDGET_UPLOAD_DIR, f"{file_id}_{meta['filename']}")
    if os.path.exists(path):
        os.remove(path)
    await db.event_budget_items.update_one(
        {"tenant_id": tenant_id, "event_id": event_id, "id": bid}, {"$pull": {"files": {"id": file_id}}})
    return {"deleted": True}


# ── Post-event report (PDF) ──────────────────────────────────

@router.get("/{event_id}/report")
async def event_report_pdf(event_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    ev = await _get_event(tenant_id, event_id)
    tasks = await db.event_tasks.find({"tenant_id": tenant_id, "event_id": event_id}, {"_id": 0}).to_list(1000)
    items = await db.event_budget_items.find({"tenant_id": tenant_id, "event_id": event_id}, {"_id": 0}).to_list(500)
    stakeholders = await db.event_stakeholders.find({"tenant_id": tenant_id, "event_id": event_id}, {"_id": 0}).to_list(200)
    pdf = _build_event_report_pdf(ev, tasks, items, stakeholders,
                                  generated_by=current_user.get("name") or current_user.get("email"))
    safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in ev["name"])[:60]
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{safe} - Event Report.pdf"'})


def _build_event_report_pdf(ev, tasks, items, stakeholders, generated_by):
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    import utils.pdf_generator as pg

    reg = getattr(pg, "_REGULAR_FONT", "Helvetica")
    bold = getattr(pg, "_BOLD_FONT", "Helvetica-Bold")
    ink = colors.HexColor("#0f172a")
    muted = colors.HexColor("#64748b")
    line = colors.HexColor("#e2e8f0")
    accent = colors.HexColor("#0e7490")

    def P(text, size=9, font=reg, color=ink, leading=None, align=0):
        return Paragraph(str(text), ParagraphStyle(
            "p", fontName=font, fontSize=size, textColor=color,
            leading=leading or size + 3, alignment=align))

    def money(n):
        return f"Rs {float(n or 0):,.0f}"

    story = []
    logo_path = "/app/backend/assets/nyla-logo.png"
    header_cells = [[P("POST-EVENT REPORT", 8, bold, muted), ""]]
    if os.path.exists(logo_path):
        img = Image(logo_path)
        ratio = img.imageWidth / float(img.imageHeight or 1)
        img.drawHeight = 14 * mm
        img.drawWidth = 14 * mm * ratio
        header = Table([[img, P("Nyla Air Water", 13, bold), P("POST-EVENT REPORT", 9, bold, muted, align=2)]],
                       colWidths=[22 * mm, 90 * mm, 68 * mm])
    else:
        header = Table([[P("Nyla Air Water", 13, bold), P("POST-EVENT REPORT", 9, bold, muted, align=2)]],
                       colWidths=[112 * mm, 68 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                ("LINEBELOW", (0, 0), (-1, -1), 0.8, accent),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story += [header, Spacer(1, 6 * mm)]

    story.append(P(ev["name"], 16, bold))
    dates = ev.get("date_from", "")
    if ev.get("date_to") and ev["date_to"] != ev.get("date_from"):
        dates += f"  →  {ev['date_to']}"
    meta_bits = [b for b in [ev.get("event_type"), dates, ev.get("location"),
                             f"Status: {(ev.get('status') or '').replace('_', ' ').title()}"] if b]
    story += [Spacer(1, 1.5 * mm), P("   ·   ".join(meta_bits), 9, reg, muted), Spacer(1, 5 * mm)]

    # KPI strip
    done = sum(1 for t in tasks if t.get("status") == "done")
    overdue = sum(1 for t in tasks if t.get("status") != "done" and (t.get("end_date") or "") and t["end_date"] < datetime.now(timezone.utc).date().isoformat())
    progress = round(done * 100 / len(tasks)) if tasks else 0
    planned_t = sum(i.get("planned_amount") or 0 for i in items)
    approved_t = sum(i.get("approved_amount") or 0 for i in items)
    actual_t = sum(i.get("actual_amount") or 0 for i in items)
    variance_t = actual_t - (approved_t if approved_t else planned_t)
    kpis = [("Task Completion", f"{progress}%  ({done}/{len(tasks)})"),
            ("Overdue Tasks", str(overdue)),
            ("Budget Planned", money(planned_t)),
            ("Budget Approved", money(approved_t)),
            ("Actual Spend", money(actual_t)),
            ("Variance", ("+" if variance_t > 0 else "") + money(variance_t).replace("Rs ", "Rs "))]
    kpi_tbl = Table([[P(k.upper(), 6.5, bold, muted) for k, _ in kpis],
                     [P(v, 11, bold, colors.HexColor("#b91c1c") if (k == "Variance" and variance_t > 0) or (k == "Overdue Tasks" and overdue > 0) else ink) for k, v in kpis]],
                    colWidths=[30 * mm] * 6)
    kpi_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, line), ("INNERGRID", (0, 0), (-1, -1), 0.6, line),
        ("TOPPADDING", (0, 0), (-1, 0), 5), ("BOTTOMPADDING", (0, 1), (-1, 1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story += [kpi_tbl, Spacer(1, 6 * mm)]

    # Budget breakdown
    story.append(P("Budget — Spend vs Approved", 11, bold, accent))
    story.append(Spacer(1, 2 * mm))
    b_state = (ev.get("budget_state") or "draft").replace("_", " ").title()
    story.append(P(f"Approval status: {b_state}", 8.5, reg, muted))
    story.append(Spacer(1, 2 * mm))
    rows = [[P(h, 8, bold, muted) for h in ["Category", "Vendor", "Planned", "Approved", "Actual", "Variance", "Bills"]]]
    for i in items:
        base = i.get("approved_amount") if i.get("approved_amount") is not None else (i.get("planned_amount") or 0)
        var = (i.get("actual_amount") - base) if i.get("actual_amount") is not None else None
        rows.append([
            P(i.get("category") or "—", 8.5), P(i.get("vendor") or "—", 8.5),
            P(money(i.get("planned_amount")), 8.5, align=2),
            P(money(i.get("approved_amount")) if i.get("approved_amount") is not None else "—", 8.5, align=2),
            P(money(i.get("actual_amount")) if i.get("actual_amount") is not None else "—", 8.5, align=2),
            P(("+" if var and var > 0 else "") + money(var) if var is not None else "—", 8.5,
              bold if var else reg, colors.HexColor("#b91c1c") if var and var > 0 else (colors.HexColor("#047857") if var and var < 0 else ink), align=2),
            P(str(len(i.get("files") or [])), 8.5, align=1),
        ])
    rows.append([P("TOTAL", 8.5, bold), "", P(money(planned_t), 8.5, bold, align=2),
                 P(money(approved_t), 8.5, bold, align=2), P(money(actual_t), 8.5, bold, align=2),
                 P(("+" if variance_t > 0 else "") + money(variance_t), 8.5, bold,
                   colors.HexColor("#b91c1c") if variance_t > 0 else colors.HexColor("#047857"), align=2), ""])
    bt = Table(rows, colWidths=[38 * mm, 30 * mm, 24 * mm, 24 * mm, 24 * mm, 26 * mm, 14 * mm], repeatRows=1)
    bt.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, accent), ("LINEABOVE", (0, -1), (-1, -1), 0.8, line),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]))
    story += [bt, Spacer(1, 6 * mm)]

    # Task completion breakdown
    story.append(P("Plan — Task Completion", 11, bold, accent))
    story.append(Spacer(1, 2 * mm))
    if tasks:
        trows = [[P(h, 8, bold, muted) for h in ["Task", "Owner", "End Date", "Status"]]]
        status_lbl = {"not_started": "Not Started", "in_progress": "In Progress", "blocked": "Blocked", "done": "Done"}
        for t in tasks:
            is_over = t.get("status") != "done" and (t.get("end_date") or "") and t["end_date"] < datetime.now(timezone.utc).date().isoformat()
            trows.append([P(t.get("name") or "—", 8.5), P(t.get("owner_name") or "—", 8.5),
                          P((t.get("end_date") or "—") + ("  (overdue)" if is_over else ""), 8.5,
                            reg, colors.HexColor("#b91c1c") if is_over else ink),
                          P(status_lbl.get(t.get("status"), t.get("status")), 8.5,
                            bold if t.get("status") == "done" else reg,
                            colors.HexColor("#047857") if t.get("status") == "done" else ink)])
        tt = Table(trows, colWidths=[76 * mm, 40 * mm, 36 * mm, 28 * mm], repeatRows=1)
        tt.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, 0), 0.8, accent),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(tt)
    else:
        story.append(P("No plan tasks were recorded for this event.", 8.5, reg, muted))
    story.append(Spacer(1, 6 * mm))

    # Stakeholders summary
    if stakeholders:
        story.append(P("Stakeholders", 11, bold, accent))
        story.append(Spacer(1, 2 * mm))
        parts = []
        for s in stakeholders:
            who = s.get("contact_name") or "—"
            if s.get("company_name"):
                who += f" ({s['company_name']})"
            elif s.get("is_internal"):
                who += " (Internal)"
            if s.get("scopes"):
                who += " — " + ", ".join(s["scopes"])
            parts.append(who)
        story.append(P(" · ".join(parts), 8.5, reg, muted))
        story.append(Spacer(1, 6 * mm))

    # Approval history
    hist = ev.get("budget_history") or []
    if hist:
        story.append(P("Budget Approval Trail", 11, bold, accent))
        story.append(Spacer(1, 2 * mm))
        for h in hist:
            when = (h.get("at") or "")[:16].replace("T", " ")
            txt = f"{h.get('action_label')} — {h.get('by_name')} · {when}"
            if h.get("comment"):
                txt += f' · "{h["comment"]}"'
            story.append(P(txt, 8, reg, muted))
        story.append(Spacer(1, 5 * mm))

    story.append(P(f"Generated by {generated_by} on {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')}", 7.5, reg, muted))

    buf = BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                      topMargin=14 * mm, bottomMargin=14 * mm, title=f"{ev['name']} — Event Report").build(story)
    return buf.getvalue()


# ── Budget approval workflow (state machine driven) ──────────

@router.post("/{event_id}/budget/transition")
async def budget_transition(event_id: str, data: BudgetTransitionIn, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    ev = await _get_event(tenant_id, event_id)
    sm = await ensure_default_event_budget_sm(tenant_id)
    current = _budget_state(ev)
    t = find_transition(sm, current, data.action_key)
    if not t or (t.get("from_state") or None) != current:
        raise HTTPException(400, f"Action '{data.action_key}' is not available from state '{current}'.")
    if not await user_can_trigger(t, current_user, tenant_id, ev.get("created_by")):
        raise HTTPException(403, "You don't have permission to perform this action.")
    if t.get("comment_required") and not (data.comment or "").strip():
        raise HTTPException(400, "A comment is required for this action.")
    items = await db.event_budget_items.find({"tenant_id": tenant_id, "event_id": event_id}, {"_id": 0}).to_list(500)
    if data.action_key == "submit" and not items:
        raise HTTPException(400, "Add at least one budget line before submitting for approval.")
    if data.action_key == "approve":
        approvals = {a.get("id"): a.get("approved_amount") for a in (data.line_approvals or [])}
        for it in items:
            amt = approvals.get(it["id"])
            if amt is None:
                amt = it.get("approved_amount") if it.get("approved_amount") is not None else (it.get("planned_amount") or 0)
            try:
                amt = float(amt)
            except (TypeError, ValueError):
                raise HTTPException(400, f"Invalid approved amount for '{it.get('category')}'.")
            if amt < 0:
                raise HTTPException(400, "Approved amounts cannot be negative.")
            await db.event_budget_items.update_one(
                {"tenant_id": tenant_id, "event_id": event_id, "id": it["id"]},
                {"$set": {"approved_amount": amt}})
    entry = {
        "id": str(uuid.uuid4()),
        "action_key": data.action_key,
        "action_label": t.get("action_label") or data.action_key,
        "from_state": current,
        "to_state": t["to_state"],
        "comment": (data.comment or "").strip() or None,
        "by": current_user.get("id"),
        "by_name": current_user.get("name") or current_user.get("email"),
        "at": _now(),
    }
    await db.event_journeys.update_one(
        {"tenant_id": tenant_id, "id": event_id},
        {"$set": {"budget_state": t["to_state"], "updated_at": _now()},
         "$push": {"budget_history": entry}})
    link = f"/events/{event_id}"
    actor = current_user.get("name") or current_user.get("email")
    if data.action_key == "submit":
        approvers = await db.users.find(
            {"tenant_id": tenant_id, "role": "Director"}, {"_id": 0, "id": 1, "email": 1}).to_list(100)
        planned_total = sum(b.get("planned_amount") or 0 for b in items)
        base_url = (os.environ.get("APP_BASE_URL") or "").rstrip("/")
        for u in approvers:
            if u["id"] != current_user.get("id"):
                await _notify(tenant_id, u["id"], f"Budget approval needed: {ev['name']}",
                              f"{actor} submitted the event budget (₹{planned_total:,.0f} planned) for approval.",
                              link, event_id, entity_type="event_budget")
                if u.get("email"):
                    try:
                        from utils.email_sender import send_email
                        lines_html = "".join(
                            f"<tr><td style='padding:4px 10px;border-bottom:1px solid #e2e8f0'>{b.get('category')}</td>"
                            f"<td style='padding:4px 10px;border-bottom:1px solid #e2e8f0'>{b.get('vendor') or '—'}</td>"
                            f"<td style='padding:4px 10px;border-bottom:1px solid #e2e8f0;text-align:right'>₹{(b.get('planned_amount') or 0):,.0f}</td></tr>"
                            for b in items)
                        open_link = f"<p><a href='{base_url}{link}' style='color:#0e7490'>Open the event to review &amp; approve</a></p>" if base_url else f"<p>Open <strong>Marketing → Events → {ev['name']} → Budget</strong> to review &amp; approve.</p>"
                        html = (
                            f"<h2 style='color:#0e7490;margin-bottom:4px'>Budget approval needed</h2>"
                            f"<p><strong>{actor}</strong> submitted the budget for event <strong>{ev['name']}</strong> "
                            f"({ev.get('date_from')}{' → ' + ev['date_to'] if ev.get('date_to') and ev['date_to'] != ev.get('date_from') else ''}).</p>"
                            f"<table style='border-collapse:collapse;font-size:14px'>"
                            f"<tr><th style='padding:4px 10px;text-align:left;border-bottom:2px solid #0e7490'>Category</th>"
                            f"<th style='padding:4px 10px;text-align:left;border-bottom:2px solid #0e7490'>Vendor</th>"
                            f"<th style='padding:4px 10px;text-align:right;border-bottom:2px solid #0e7490'>Planned</th></tr>"
                            f"{lines_html}"
                            f"<tr><td style='padding:6px 10px;font-weight:bold'>Total</td><td></td>"
                            f"<td style='padding:6px 10px;text-align:right;font-weight:bold'>₹{planned_total:,.0f}</td></tr></table>"
                            f"{open_link}")
                        await send_email(u["email"], f"Approval needed: {ev['name']} budget (₹{planned_total:,.0f})", html)
                    except Exception:
                        logging.getLogger("event_journeys").exception("Budget approval email failed")
    elif data.action_key in ("approve", "reject") and ev.get("created_by") and ev["created_by"] != current_user.get("id"):
        verb = "approved" if data.action_key == "approve" else "rejected"
        body = f"{actor} {verb} the budget for event '{ev['name']}'."
        if data.action_key == "reject" and entry["comment"]:
            body += f" Reason: {entry['comment']}"
        await _notify(tenant_id, ev["created_by"], f"Event budget {verb}: {ev['name']}",
                      body, link, event_id, entity_type="event_budget")
    return await get_event_detail(event_id, current_user)
