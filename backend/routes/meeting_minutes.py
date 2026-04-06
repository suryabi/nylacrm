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
from database import db
import uuid
from typing import Optional

router = APIRouter(prefix="/meeting-minutes", tags=["meeting-minutes"])

VALID_PERIODICITIES = ["weekly", "monthly", "quarterly", "adhoc"]
VALID_PURPOSES = ["sales", "production", "general", "finance", "administration", "investors", "marketing"]
VALID_ACTION_STATUSES = ["open", "in_progress", "done"]


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
            "due_date": item.get("due_date", ""),
            "status": item.get("status", "open") if item.get("status") in VALID_ACTION_STATUSES else "open",
        }
        if ai["description"]:
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
                clean_items = []
                for item in val:
                    ai = {
                        "id": item.get("id") or str(uuid.uuid4()),
                        "description": item.get("description", ""),
                        "assignee_id": item.get("assignee_id", ""),
                        "assignee_name": item.get("assignee_name", ""),
                        "due_date": item.get("due_date", ""),
                        "status": item.get("status", "open") if item.get("status") in VALID_ACTION_STATUSES else "open",
                    }
                    if ai["description"]:
                        clean_items.append(ai)
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

    updated = await db.meeting_minutes.find_one({"id": meeting_id, "tenant_id": tenant_id}, {"_id": 0})
    return updated


@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    result = await db.meeting_minutes.delete_one({"id": meeting_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return {"message": "Meeting deleted"}
