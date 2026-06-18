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
    page: int = Query(1, ge=1),
    status: str = Query(None),          # 'unread' | 'read' | None/all
    category: str = Query(None),        # one of notification_settings.CATEGORIES keys
    search: str = Query(None),          # matches title/body
    current_user: dict = Depends(get_current_user),
):
    """Paginated, filterable notification feed. Powers both the bell popover
    (default page=1, limit=20) and the full-page inbox (with filters)."""
    import re as _re
    tenant_id = get_current_tenant_id()
    uid = current_user.get("id")
    q = {"tenant_id": tenant_id, "user_id": uid}
    if unread_only or status == "unread":
        q["is_read"] = False
    elif status == "read":
        q["is_read"] = True
    if category:
        q["category"] = category
    if search and search.strip():
        rx = {"$regex": _re.escape(search.strip()), "$options": "i"}
        q["$or"] = [{"title": rx}, {"body": rx}]

    total = await db.notifications.count_documents(q)
    skip = (page - 1) * limit
    items = (
        await db.notifications.find(q, {"_id": 0})
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(length=limit)
    )
    unread = await db.notifications.count_documents(
        {"tenant_id": tenant_id, "user_id": uid, "is_read": False}
    )
    pages = (total + limit - 1) // limit if limit else 1
    return {
        "notifications": items,
        "unread_count": unread,
        "total": total,
        "page": page,
        "pages": max(pages, 1),
        "limit": limit,
    }


@router.get("/categories")
async def list_notification_categories(current_user: dict = Depends(get_current_user)):
    """Category keys + labels for the inbox filter dropdown."""
    try:
        from routes.notification_settings import CATEGORIES
        return [{"key": c["key"], "label": c["label"]} for c in CATEGORIES]
    except Exception:
        return []


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


@router.delete("/{notif_id}")
async def delete_notification(notif_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a single notification belonging to the current user."""
    tenant_id = get_current_tenant_id()
    res = await db.notifications.delete_one(
        {"id": notif_id, "tenant_id": tenant_id, "user_id": current_user.get("id")}
    )
    return {"success": res.deleted_count > 0, "deleted": res.deleted_count}


@router.delete("")
async def bulk_delete_notifications(
    category: str = Query(None),     # e.g. 'approval' to clear pending-approval alerts
    status: str = Query(None),       # 'read' | 'unread' | None (all)
    search: str = Query(None),       # match title/body
    current_user: dict = Depends(get_current_user),
):
    """Bulk-delete the current user's notifications matching the given filters.
    Always scoped to (tenant_id, user_id) so a user can only clear their own."""
    import re as _re
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id, "user_id": current_user.get("id")}
    if category:
        q["category"] = category
    if status == "unread":
        q["is_read"] = False
    elif status == "read":
        q["is_read"] = True
    if search and search.strip():
        rx = {"$regex": _re.escape(search.strip()), "$options": "i"}
        q["$or"] = [{"title": rx}, {"body": rx}]
    res = await db.notifications.delete_many(q)
    return {"success": True, "deleted": res.deleted_count}
