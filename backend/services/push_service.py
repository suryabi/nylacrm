"""Expo push notifications for the companion mobile app.

Native Expo apps register their device push token (an "ExponentPushToken[...]").
We persist tokens per user in the `push_tokens` collection and fan out
notifications to them via Expo's push service (https://exp.host) — no API key
required. Everything here is best-effort and never raises to the caller.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from database import db

logger = logging.getLogger("push")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_expo_token(token: str) -> bool:
    t = (token or "").strip()
    return t.startswith("ExponentPushToken[") or t.startswith("ExpoPushToken[")


async def register_token(tenant_id: str, user_id: str, token: str, platform: str = "unknown", device: str | None = None) -> bool:
    """Upsert a device push token for a user (idempotent on the token)."""
    token = (token or "").strip()
    if not token or not user_id:
        return False
    await db.push_tokens.update_one(
        {"token": token},
        {"$set": {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "token": token,
            "platform": platform,
            "device": device,
            "updated_at": _now(),
        }, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
    return True


async def unregister_token(token: str) -> bool:
    token = (token or "").strip()
    if not token:
        return False
    res = await db.push_tokens.delete_one({"token": token})
    return res.deleted_count > 0


async def _tokens_for_users(tenant_id: str, user_ids) -> list[str]:
    ids = sorted({uid for uid in (user_ids or []) if uid})
    if not ids:
        return []
    rows = await db.push_tokens.find(
        {"tenant_id": tenant_id, "user_id": {"$in": ids}},
        {"_id": 0, "token": 1},
    ).to_list(length=None)
    return sorted({r["token"] for r in rows if is_expo_token(r.get("token", ""))})


async def send_expo_push(tokens: list[str], title: str, body: str = "", data: dict | None = None) -> None:
    """Send a push to a list of Expo tokens (batched by 100). Best-effort."""
    tokens = [t for t in (tokens or []) if is_expo_token(t)]
    if not tokens:
        return
    messages = [{
        "to": t,
        "title": title,
        "body": body,
        "sound": "default",
        "data": data or {},
    } for t in tokens]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0)) as client:
            for i in range(0, len(messages), 100):
                batch = messages[i:i + 100]
                resp = await client.post(EXPO_PUSH_URL, json=batch, headers={"Content-Type": "application/json"})
                if resp.status_code >= 400:
                    logger.warning("Expo push failed status=%s body=%s", resp.status_code, resp.text[:300])
    except Exception:
        logger.exception("send_expo_push failed")


async def send_push_to_users(tenant_id: str, user_ids, *, title: str, body: str = "", data: dict | None = None) -> None:
    """Resolve users → device tokens → send. Best-effort."""
    try:
        tokens = await _tokens_for_users(tenant_id, user_ids)
        await send_expo_push(tokens, title, body, data)
    except Exception:
        logger.exception("send_push_to_users failed")
