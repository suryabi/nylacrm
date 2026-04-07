"""
Meeting Minutes Module
- CRUD for meeting entries with minutes (bullet points) and action items
- Filters by month, year, purpose, periodicity, participant
- Full edit history tracking
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from deps import get_current_user
from core.tenant import get_current_tenant_id
from database import db, get_tenant_db
import uuid
from typing import Optional

router = APIRouter(prefix="/meeting-minutes", tags=["meeting-minutes"])

VALID_PERIODICITIES = ["weekly", "monthly", "quarterly", "adhoc"]
VALID_PURPOSES = ["sales", "production", "general", "finance", "administration", "investors", "marketing"]
VALID_ACTION_STATUSES = ["open", "in_progress", "done"]

# Map meeting action status to task status
_STATUS_MAP = {"open": "open", "in_progress": "in_progress", "done": "closed"}


async def _create_tasks_for_action_items(action_items, meeting_id, meeting_title, current_user, tenant_id, now_iso):
    """Auto-create tasks in tasks_v2 for each action item using tenant-aware database."""
    tdb = get_tenant_db()
    for ai in action_items:
        if ai.get("task_id"):
            continue  # already linked
        count = await tdb.tasks_v2.count_documents({})
        task_number = f"TASK-{count + 1:05d}"
        assignees = [ai["assignee_id"]] if ai.get("assignee_id") else []
        assignees_data = []
        if assignees:
            assignees_data = [{"id": ai["assignee_id"], "name": ai.get("assignee_name", "")}]

        task = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "task_number": task_number,
            "title": ai["description"],
            "description": f"Auto-created from meeting: {meeting_title}",
            "severity": "medium",
            "status": "open",
            "department_id": "",
            "assignees": assignees,
            "assignees_data": assignees_data,
            "milestone_id": None,
            "labels": [],
            "due_date": ai.get("due_date", ""),
            "due_time": None,
            "reminder_date": None,
            "linked_entity_type": "meeting",
            "linked_entity_id": meeting_id,
            "watchers": [current_user.get("id")],
            "created_by": current_user.get("id"),
            "created_by_name": current_user.get("name"),
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await tdb.tasks_v2.insert_one(task)
        task.pop("_id", None)
        ai["task_id"] = task["id"]
        ai["task_number"] = task_number


@router.get("")
async def list_meetings(
    month: Optional[int] = None,
    year: Optional[int] = None,
    periodicity: Optional[str] = None,
    purpose: Optional[str] = None,
    participant: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    query = {"tenant_id": tenant_id}

    if month and year:
        start = f"{year}-{month:02d}-01"
        end = f"{year + 1}-01-01" if month == 12 else f"{year}-{month + 1:02d}-01"
        query["date"] = {"$gte": start, "$lt": end}
    elif year:
        query["date"] = {"$gte": f"{year}-01-01", "$lt": f"{year + 1}-01-01"}

    if periodicity:
        query["periodicity"] = periodicity

    if purpose:
        purposes = [p.strip() for p in purpose.split(",") if p.strip()]
        if purposes:
            query["purpose"] = {"$in": purposes}

    if participant:
        query["participants.id"] = participant

    meetings = await db.meeting_minutes.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return meetings


@router.get("/{meeting_id}")
async def get_meeting(meeting_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    meeting = await db.meeting_minutes.find_one(
        {"id": meeting_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Enrich action items: check if linked tasks were modified externally
    tdb = get_tenant_db()
    for ai in meeting.get("action_items", []):
        ai["task_modified"] = False
        if ai.get("task_id"):
            task = await tdb.tasks_v2.find_one({"id": ai["task_id"]}, {"_id": 0, "created_at": 1, "updated_at": 1})
            if task and task.get("updated_at") and task.get("created_at") and task["updated_at"] != task["created_at"]:
                ai["task_modified"] = True

    return meeting


@router.post("")
async def create_meeting(data: dict, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()

    if not data.get("date"):
        raise HTTPException(status_code=400, detail="Date is required")

    periodicity = data.get("periodicity", "adhoc").lower()
    if periodicity not in VALID_PERIODICITIES:
        periodicity = "adhoc"

    purpose = data.get("purpose", [])
    if isinstance(purpose, str):
        purpose = [purpose]
    purpose = [p for p in purpose if p in VALID_PURPOSES]

    participants = data.get("participants", [])
    minutes = data.get("minutes", [])
    if isinstance(minutes, str):
        minutes = [m.strip() for m in minutes.split("\n") if m.strip()]

    action_items = []
    for item in data.get("action_items", []):
        ai = {
            "id": str(uuid.uuid4()),
            "description": item.get("description", ""),
            "assignee_id": item.get("assignee_id", ""),
            "assignee_name": item.get("assignee_name", ""),
            "due_date": "",
            "status": "open",
        }
        if ai["description"]:
            if not ai["assignee_id"]:
                raise HTTPException(status_code=400, detail=f"Assignee is required for action item: {ai['description'][:50]}")
            action_items.append(ai)

    now_iso = datetime.now(timezone.utc).isoformat()
    meeting = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "date": data["date"],
        "periodicity": periodicity,
        "purpose": purpose,
        "title": data.get("title", ""),
        "participants": participants,
        "minutes": minutes,
        "action_items": action_items,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name", ""),
        "created_at": now_iso,
        "updated_at": now_iso,
        "updated_by": current_user.get("id"),
        "updated_by_name": current_user.get("name", ""),
        "edit_history": [],
    }

    await db.meeting_minutes.insert_one(meeting)
    meeting.pop("_id", None)

    # Auto-create tasks for action items
    await _create_tasks_for_action_items(action_items, meeting["id"], meeting["title"], current_user, tenant_id, now_iso)

    # Update action_items with task_ids
    if any(a.get("task_id") for a in action_items):
        await db.meeting_minutes.update_one(
            {"id": meeting["id"], "tenant_id": tenant_id},
            {"$set": {"action_items": action_items}}
        )

    return meeting


@router.put("/{meeting_id}")
async def update_meeting(meeting_id: str, data: dict, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    existing = await db.meeting_minutes.find_one({"id": meeting_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Meeting not found")

    now_iso = datetime.now(timezone.utc).isoformat()

    edit_entry = {
        "edited_by": current_user.get("id"),
        "edited_by_name": current_user.get("name", ""),
        "edited_at": now_iso,
    }

    update_fields = {}
    allowed = ["date", "periodicity", "purpose", "title", "participants", "minutes", "action_items"]

    for field in allowed:
        if field in data:
            val = data[field]
            if field == "periodicity":
                val = val.lower() if isinstance(val, str) else "adhoc"
                if val not in VALID_PERIODICITIES:
                    val = "adhoc"
            elif field == "purpose":
                if isinstance(val, str):
                    val = [val]
                val = [p for p in val if p in VALID_PURPOSES]
            elif field == "minutes":
                if isinstance(val, str):
                    val = [m.strip() for m in val.split("\n") if m.strip()]
            elif field == "action_items":
                # Build lookup of existing action items and check task modification
                existing_ai_map = {}
                tdb = get_tenant_db()
                for eai in existing.get("action_items", []):
                    if eai.get("id"):
                        eai_modified = False
                        if eai.get("task_id"):
                            task = await tdb.tasks_v2.find_one({"id": eai["task_id"]}, {"_id": 0, "created_at": 1, "updated_at": 1})
                            if task and task.get("updated_at") and task.get("created_at") and task["updated_at"] != task["created_at"]:
                                eai_modified = True
                        existing_ai_map[eai["id"]] = {"data": eai, "task_modified": eai_modified}

                clean_items = []
                # First, preserve all task-modified items from existing data
                submitted_ids = set()
                for item in val:
                    item_id = item.get("id", "")
                    submitted_ids.add(item_id)

                    # If this item exists and its task was modified externally, use original data
                    if item_id and item_id in existing_ai_map and existing_ai_map[item_id]["task_modified"]:
                        clean_items.append(existing_ai_map[item_id]["data"])
                        continue

                    ai = {
                        "id": item.get("id") or str(uuid.uuid4()),
                        "description": item.get("description", ""),
                        "assignee_id": item.get("assignee_id", ""),
                        "assignee_name": item.get("assignee_name", ""),
                        "due_date": "",
                        "status": "open",
                    }
                    # Preserve task_id and task_number from existing items
                    if item_id and item_id in existing_ai_map:
                        ai["task_id"] = existing_ai_map[item_id]["data"].get("task_id")
                        ai["task_number"] = existing_ai_map[item_id]["data"].get("task_number")
                    elif item.get("task_id"):
                        ai["task_id"] = item["task_id"]
                        ai["task_number"] = item.get("task_number")

                    if ai["description"]:
                        if not ai["assignee_id"]:
                            raise HTTPException(status_code=400, detail=f"Assignee is required for action item: {ai['description'][:50]}")
                        clean_items.append(ai)

                # Ensure task-modified items that weren't submitted are still preserved (can't delete them)
                for eid, einfo in existing_ai_map.items():
                    if eid not in submitted_ids and einfo["task_modified"]:
                        clean_items.append(einfo["data"])

                val = clean_items
            update_fields[field] = val

    update_fields["updated_at"] = now_iso
    update_fields["updated_by"] = current_user.get("id")
    update_fields["updated_by_name"] = current_user.get("name", "")

    await db.meeting_minutes.update_one(
        {"id": meeting_id, "tenant_id": tenant_id},
        {
            "$set": update_fields,
            "$push": {"edit_history": edit_entry},
        },
    )

    # Auto-create tasks for new action items (only those without task_id)
    if "action_items" in update_fields:
        new_items = [a for a in update_fields["action_items"] if not a.get("task_id")]
        if new_items:
            meeting_title = update_fields.get("title") or existing.get("title", "Meeting")
            await _create_tasks_for_action_items(new_items, meeting_id, meeting_title, current_user, tenant_id, now_iso)
            # Update action_items with task_ids
            await db.meeting_minutes.update_one(
                {"id": meeting_id, "tenant_id": tenant_id},
                {"$set": {"action_items": update_fields["action_items"]}}
            )

    updated = await db.meeting_minutes.find_one({"id": meeting_id, "tenant_id": tenant_id}, {"_id": 0})
    return updated


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    result = await db.meeting_minutes.delete_one({"id": meeting_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"message": "Meeting deleted"}
