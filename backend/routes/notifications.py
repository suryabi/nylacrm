"""Per-user in-app notification center (bell)."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

logger = logging.getLogger("notifications")
router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("")
async def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(20, le=100),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    uid = current_user.get("id")
    q = {"tenant_id": tenant_id, "user_id": uid}
    if unread_only:
        q["is_read"] = False
    items = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(length=limit)
    unread = await db.notifications.count_documents({"tenant_id": tenant_id, "user_id": uid, "is_read": False})
    return {"notifications": items, "unread_count": unread}


@router.get("/unread-count")
async def unread_count(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    unread = await db.notifications.count_documents(
        {"tenant_id": tenant_id, "user_id": current_user.get("id"), "is_read": False}
    )
    return {"unread_count": unread}


@router.post("/{notif_id}/read")
async def mark_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    await db.notifications.update_one(
        {"id": notif_id, "tenant_id": tenant_id, "user_id": current_user.get("id")},
        {"$set": {"is_read": True, "read_at": _now()}},
    )
    return {"success": True}


@router.post("/read-all")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    res = await db.notifications.update_many(
        {"tenant_id": tenant_id, "user_id": current_user.get("id"), "is_read": False},
        {"$set": {"is_read": True, "read_at": _now()}},
    )
    return {"success": True, "updated": res.modified_count}
