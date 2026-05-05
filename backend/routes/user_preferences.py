"""User preferences (per-user UI preferences like home widget order, etc.)."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List

from deps import get_current_user
from database import db


router = APIRouter()


# ════════════════════════════════════════════════════════════════════
# Home page widget order (per-user)
# ════════════════════════════════════════════════════════════════════
DEFAULT_HOME_WIDGET_ORDER = ["meetings", "followups"]
HOME_WIDGET_IDS = set(DEFAULT_HOME_WIDGET_ORDER)


class HomeWidgetOrderPayload(BaseModel):
    order: List[str]


@router.get("/preferences/home-widget-order")
async def get_home_widget_order(current_user: dict = Depends(get_current_user)):
    """Return the saved home-widget order for the current user.
    Falls back to default when unset; merges in any newly-introduced widgets at the end.
    """
    user_id = (current_user or {}).get("id")
    doc = await db.user_preferences.find_one(
        {"user_id": user_id, "key": "home_widget_order"},
        {"_id": 0},
    )
    saved = (doc or {}).get("order") or []
    valid = [w for w in saved if w in HOME_WIDGET_IDS]
    for w in DEFAULT_HOME_WIDGET_ORDER:
        if w not in valid:
            valid.append(w)
    return {"order": valid, "is_default": not saved}


@router.put("/preferences/home-widget-order")
async def update_home_widget_order(
    payload: HomeWidgetOrderPayload,
    current_user: dict = Depends(get_current_user),
):
    """Upsert the home-widget order for the current user."""
    if not payload.order:
        raise HTTPException(status_code=400, detail="order must be a non-empty list")

    cleaned: List[str] = []
    seen: set = set()
    for w in payload.order:
        if w in HOME_WIDGET_IDS and w not in seen:
            cleaned.append(w)
            seen.add(w)
    for w in DEFAULT_HOME_WIDGET_ORDER:
        if w not in seen:
            cleaned.append(w)

    user_id = (current_user or {}).get("id")
    await db.user_preferences.update_one(
        {"user_id": user_id, "key": "home_widget_order"},
        {
            "$set": {
                "user_id": user_id,
                "key": "home_widget_order",
                "order": cleaned,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )
    return {"order": cleaned, "is_default": False}
