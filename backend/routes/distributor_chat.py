"""
Distributor ↔ Supplier (factory) chat.

Model:
  • One thread per distributor — every message is keyed by `distributor_id`
  • Two sides: 'distributor' (the distributor user) and 'supplier' (factory admins)
  • Text-only messages, polled on page navigation (no realtime)

Collection: `distributor_chat_messages`
Schema:
  id, tenant_id, distributor_id, sender_id, sender_email, sender_role,
  sender_side ('distributor' | 'supplier'),
  message, created_at,
  read_by_supplier (bool), read_by_distributor (bool)

Endpoints (mounted at /api/distributor-chat):
  GET    /threads                                — supplier view: list of distributor threads + unread counts
  GET    /distributors/{distributor_id}/messages — fetch the thread
  POST   /distributors/{distributor_id}/messages — send a message
  POST   /distributors/{distributor_id}/mark-read— mark all unread (on caller's side) as read
  GET    /unread-count                           — quick badge count for the floating button
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter()
logger = logging.getLogger(__name__)


SUPPLIER_ROLES = {"CEO", "Admin", "Distribution Manager", "Distribution Admin", "System Admin"}


def _is_supplier(user: dict) -> bool:
    return (user or {}).get("role") in SUPPLIER_ROLES


def _is_distributor(user: dict) -> bool:
    return (user or {}).get("role") == "Distributor"


def _side(user: dict) -> str:
    return "supplier" if _is_supplier(user) else "distributor"


def _ensure_thread_access(user: dict, distributor_id: str) -> None:
    """Allow suppliers (admin roles) for any distributor; distributors only their own."""
    if _is_supplier(user):
        return
    if _is_distributor(user) and user.get("distributor_id") == distributor_id:
        return
    raise HTTPException(status_code=403, detail="Not authorised to access this chat thread")


# ---------- thread list (supplier home card) ----------

@router.get("/distributor-chat/threads")
async def list_threads(current_user: dict = Depends(get_current_user)):
    """Supplier-only: list all distributor threads with last message + unread count."""
    if not _is_supplier(current_user):
        raise HTTPException(status_code=403, detail="Supplier access only")

    tenant_id = get_current_tenant_id()

    # Aggregate: latest message + counts per distributor
    pipeline = [
        {"$match": {"tenant_id": tenant_id}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$distributor_id",
            "last_message": {"$first": "$message"},
            "last_message_at": {"$first": "$created_at"},
            "last_sender_side": {"$first": "$sender_side"},
            "total": {"$sum": 1},
            "unread_for_supplier": {
                "$sum": {"$cond": [
                    {"$and": [
                        {"$eq": ["$sender_side", "distributor"]},
                        {"$ne": ["$read_by_supplier", True]}
                    ]}, 1, 0
                ]}
            },
        }},
        {"$sort": {"last_message_at": -1}},
    ]
    rows = await db.distributor_chat_messages.aggregate(pipeline).to_list(500)

    # Enrich with distributor name
    dist_ids = [r["_id"] for r in rows if r.get("_id")]
    distributors = await db.distributors.find(
        {"id": {"$in": dist_ids}, "tenant_id": tenant_id},
        {"_id": 0, "id": 1, "distributor_name": 1, "distributor_code": 1}
    ).to_list(500) if dist_ids else []
    by_id = {d["id"]: d for d in distributors}

    threads = []
    for r in rows:
        d = by_id.get(r["_id"], {})
        threads.append({
            "distributor_id": r["_id"],
            "distributor_name": d.get("distributor_name") or "Unknown",
            "distributor_code": d.get("distributor_code"),
            "last_message": r.get("last_message"),
            "last_message_at": r.get("last_message_at"),
            "last_sender_side": r.get("last_sender_side"),
            "total_messages": r.get("total", 0),
            "unread_count": r.get("unread_for_supplier", 0),
        })

    total_unread = sum(t["unread_count"] for t in threads)
    return {"threads": threads, "total_unread": total_unread}


# ---------- unread count for floating button ----------

@router.get("/distributor-chat/unread-count")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()

    if _is_supplier(current_user):
        count = await db.distributor_chat_messages.count_documents({
            "tenant_id": tenant_id,
            "sender_side": "distributor",
            "$or": [{"read_by_supplier": {"$exists": False}}, {"read_by_supplier": False}],
        })
        return {"unread_count": count, "side": "supplier"}

    if _is_distributor(current_user):
        distributor_id = current_user.get("distributor_id")
        if not distributor_id:
            return {"unread_count": 0, "side": "distributor"}
        count = await db.distributor_chat_messages.count_documents({
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "sender_side": "supplier",
            "$or": [{"read_by_distributor": {"$exists": False}}, {"read_by_distributor": False}],
        })
        return {"unread_count": count, "side": "distributor"}

    return {"unread_count": 0, "side": "other"}


# ---------- thread messages ----------

@router.get("/distributor-chat/distributors/{distributor_id}/messages")
async def list_messages(
    distributor_id: str,
    limit: int = Query(200, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    _ensure_thread_access(current_user, distributor_id)
    tenant_id = get_current_tenant_id()
    messages = await (
        db.distributor_chat_messages
        .find({"tenant_id": tenant_id, "distributor_id": distributor_id}, {"_id": 0})
        .sort("created_at", 1)
        .limit(limit)
        .to_list(limit)
    )
    return {"messages": messages, "count": len(messages)}


@router.post("/distributor-chat/distributors/{distributor_id}/messages")
async def send_message(
    distributor_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user),
):
    _ensure_thread_access(current_user, distributor_id)
    tenant_id = get_current_tenant_id()

    text = ((payload or {}).get("message") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message text is required")
    if len(text) > 4000:
        raise HTTPException(status_code=400, detail="Message too long (max 4000 chars)")

    # Verify the distributor exists (avoid orphan threads)
    distributor = await db.distributors.find_one(
        {"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0, "distributor_name": 1}
    )
    if not distributor:
        raise HTTPException(status_code=404, detail="Distributor not found")

    side = _side(current_user)
    now = datetime.now(timezone.utc).isoformat()
    msg = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "distributor_id": distributor_id,
        "sender_id": current_user.get("id"),
        "sender_email": current_user.get("email"),
        "sender_role": current_user.get("role"),
        "sender_name": current_user.get("name") or current_user.get("email"),
        "sender_side": side,
        "message": text,
        "created_at": now,
        # Sender's own side is implicitly "read"; the other side gets the unread flag
        "read_by_supplier": side == "supplier",
        "read_by_distributor": side == "distributor",
    }
    await db.distributor_chat_messages.insert_one(msg)
    msg.pop("_id", None)
    return {"message": "sent", "data": msg}


@router.post("/distributor-chat/distributors/{distributor_id}/mark-read")
async def mark_read(
    distributor_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Mark messages in this thread, sent BY the other side, as read."""
    _ensure_thread_access(current_user, distributor_id)
    tenant_id = get_current_tenant_id()

    if _is_supplier(current_user):
        update_field = "read_by_supplier"
        other_side = "distributor"
    else:
        update_field = "read_by_distributor"
        other_side = "supplier"

    res = await db.distributor_chat_messages.update_many(
        {
            "tenant_id": tenant_id,
            "distributor_id": distributor_id,
            "sender_side": other_side,
            "$or": [{update_field: {"$exists": False}}, {update_field: False}],
        },
        {"$set": {update_field: True}},
    )
    return {"marked_read": res.modified_count}
