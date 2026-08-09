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
from fastapi.responses import FileResponse
from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/events", tags=["Event Journeys"])

UPLOAD_DIR = "/app/backend/uploads/event_tasks"
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
    actual_amount: Optional[float] = None
    vendor: Optional[str] = None


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
                  entity_id: str, dedupe_key: Optional[str] = None):
    if not user_id:
        return
    if dedupe_key:
        exists = await db.notifications.find_one(
            {"tenant_id": tenant_id, "user_id": user_id, "entity_type": "event_task", "entity_id": entity_id,
             "category": dedupe_key})
        if exists:
            return
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "user_id": user_id,
        "title": title, "body": body, "link": link, "kind": "info", "category": dedupe_key or "event",
        "entity_type": "event_task", "entity_id": entity_id, "is_read": False, "created_at": _now(),
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


@router.get("/{event_id}")
async def get_event_detail(event_id: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    ev = await _get_event(tenant_id, event_id)
    stakeholders = await db.event_stakeholders.find({"tenant_id": tenant_id, "event_id": event_id}, {"_id": 0}).to_list(200)
    tasks = await db.event_tasks.find({"tenant_id": tenant_id, "event_id": event_id}, {"_id": 0}).sort("start_date", 1).to_list(1000)
    budget_items = await db.event_budget_items.find({"tenant_id": tenant_id, "event_id": event_id}, {"_id": 0}).to_list(500)
    await _generate_reminders(tenant_id, ev, tasks)
    ev.update({
        "stakeholders": stakeholders,
        "tasks": tasks,
        "budget_items": budget_items,
        "progress": _progress(tasks),
        "budget_planned_total": sum(b.get("planned_amount") or 0 for b in budget_items),
        "budget_actual_total": sum(b.get("actual_amount") or 0 for b in budget_items),
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
    await _get_event(tenant_id, event_id)
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
    res = await db.event_budget_items.update_one(
        {"tenant_id": tenant_id, "event_id": event_id, "id": bid}, {"$set": data.dict()})
    if res.matched_count == 0:
        raise HTTPException(404, "Budget item not found")
    return await db.event_budget_items.find_one({"tenant_id": tenant_id, "id": bid}, {"_id": 0})


@router.delete("/{event_id}/budget-items/{bid}")
async def delete_budget_item(event_id: str, bid: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    tenant_id = get_current_tenant_id()
    res = await db.event_budget_items.delete_one({"tenant_id": tenant_id, "event_id": event_id, "id": bid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Budget item not found")
    return {"deleted": True}
