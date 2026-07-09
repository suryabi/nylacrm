"""Mobile app support endpoints (companion native Expo app for drivers + distributors).

All endpoints are tenant-aware (X-Tenant-ID header handled by middleware) and
reuse the existing bcrypt + `user_sessions` session-token auth. The native app
authenticates once via /mobile/login and then sends the returned token as
`Authorization: Bearer <token>` on every request.

Mounted under /api/mobile:
  POST /mobile/login              — unified login (email OR phone) → token + role + home_screen
  GET  /mobile/me                 — current user + role + home_screen
  POST /mobile/logout             — invalidate the session token
  POST /mobile/push/register      — register this device's Expo push token
  POST /mobile/push/unregister    — remove a device push token
  GET  /mobile/sync               — role-based delta sync (?since=<iso>) for offline caching
"""
from __future__ import annotations

import re
import uuid
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from database import db, get_tenant_db
from deps import get_current_user, verify_password
from core.tenant import get_current_tenant_id
from services import push_service

router = APIRouter()
logger = logging.getLogger("mobile")

SESSION_DAYS = 7
_PHONE_DIGITS = re.compile(r"\D+")


def _normalise_phone(phone: str) -> str:
    digits = _PHONE_DIGITS.sub("", phone or "")
    return digits[-10:] if len(digits) >= 10 else digits


def _home_screen(user: dict) -> str:
    if (user.get("role") or "") == "Driver":
        return "driver"
    if user.get("distributor_id"):
        return "distributor"
    return "staff"


def _public_user(user: dict) -> dict:
    u = {k: v for k, v in user.items() if k not in ("password", "_id")}
    u["home_screen"] = _home_screen(user)
    return u


async def _create_session(user_id: str, tenant_id: str) -> tuple[str, str]:
    token = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "tenant_id": tenant_id,
        "session_token": token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "auth_method": "mobile",
    })
    return token, expires_at.isoformat()


class MobileLogin(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=120, description="email or phone")
    password: str = Field(..., min_length=1)


@router.post("/login")
async def mobile_login(payload: MobileLogin, response: Response):
    """Unified login for the native app. Email → staff/distributor user; a
    phone number → Driver-role user. Same error for any failure (no enumeration)."""
    tenant_id = get_current_tenant_id()
    tdb = get_tenant_db()
    ident = (payload.identifier or "").strip()
    invalid = HTTPException(status_code=401, detail="Invalid credentials")

    user_doc = None
    if "@" in ident:
        user_doc = await tdb.users.find_one({"email": ident.lower()}, {"_id": 0})
    else:
        phone = _normalise_phone(ident)
        if phone:
            user_doc = await tdb.users.find_one({"role": "Driver", "phone": phone}, {"_id": 0})

    if not user_doc or not user_doc.get("password"):
        raise invalid
    if not verify_password(payload.password, user_doc["password"]):
        raise invalid
    if not user_doc.get("is_active", True):
        raise HTTPException(status_code=403, detail="Your account is inactive. Contact your administrator.")

    token, _ = await _create_session(user_doc["id"], tenant_id)
    # Cookie is optional for native clients but harmless for web reuse.
    response.set_cookie(
        key="session_token", value=token,
        httponly=True, secure=True, samesite="none",
        max_age=SESSION_DAYS * 24 * 60 * 60, path="/",
    )
    return {"token": token, "role": user_doc.get("role"), "user": _public_user(user_doc)}


@router.get("/me")
async def mobile_me(current_user: dict = Depends(get_current_user)):
    return {"role": current_user.get("role"), "user": _public_user(current_user)}


@router.post("/logout")
async def mobile_logout(request: Request, response: Response, current_user: dict = Depends(get_current_user)):
    auth = request.headers.get("Authorization", "")
    token = auth.split(" ", 1)[1].strip() if auth.startswith("Bearer ") else request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ── Push tokens ──────────────────────────────────────────────────────────────
class PushToken(BaseModel):
    token: str = Field(..., min_length=1)
    platform: str = Field("unknown", max_length=20)
    device: str | None = Field(None, max_length=120)


@router.post("/push/register")
async def push_register(payload: PushToken, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    ok = await push_service.register_token(
        tenant_id, current_user["id"], payload.token, payload.platform, payload.device
    )
    return {"ok": ok}


@router.post("/push/unregister")
async def push_unregister(payload: PushToken, current_user: dict = Depends(get_current_user)):
    ok = await push_service.unregister_token(payload.token)
    return {"ok": ok}


# ── Delta sync (offline caching) ──────────────────────────────────────────────
def _changed_since(since: str | None) -> dict:
    if not since:
        return {}
    return {"$or": [{"updated_at": {"$gte": since}}, {"created_at": {"$gte": since}}]}


@router.get("/sync")
async def mobile_sync(since: str | None = None, current_user: dict = Depends(get_current_user)):
    """Return records changed since `since` (ISO-8601) for the caller's role, plus
    `server_time` to use as the next cursor. Omit `since` for a full snapshot.

    Note: delta relies on `updated_at`/`created_at` on the records; a record with
    neither is only returned on a full (no-since) sync."""
    tenant_id = get_current_tenant_id()
    server_time = datetime.now(timezone.utc).isoformat()
    delta = _changed_since(since)
    out: dict = {"role": current_user.get("role"), "server_time": server_time}

    # Notifications (both roles)
    notif_q = {"tenant_id": tenant_id, "user_id": current_user["id"]}
    if since:
        notif_q["created_at"] = {"$gte": since}
    out["notifications"] = await db.notifications.find(
        notif_q, {"_id": 0}
    ).sort("created_at", -1).to_list(200)

    role = current_user.get("role")
    if role == "Driver" and current_user.get("driver_id"):
        q = {"tenant_id": tenant_id, "driver_id": current_user["driver_id"],
             "status": {"$in": ["approved", "in_progress", "completed"]}}
        if delta:
            q.update(delta)
        out["schedules"] = await db.distributor_delivery_schedules.find(
            q, {"_id": 0}
        ).sort("schedule_date", 1).to_list(200)
    elif current_user.get("distributor_id"):
        q = {"tenant_id": tenant_id, "distributor_id": current_user["distributor_id"]}
        if delta:
            q.update(delta)
        out["deliveries"] = await db.distributor_deliveries.find(
            q, {"_id": 0}
        ).sort("created_at", -1).to_list(300)

    return out
