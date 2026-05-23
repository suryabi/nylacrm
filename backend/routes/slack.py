"""Slack integration — tenant-scoped Bot config + events/interactivity webhooks.

A tenant admin connects their Slack workspace by saving:
  - bot_token (xoxb-...)
  - signing_secret (for webhook signature verification)
  - channel mappings: event_type → channel_id

The CRM then pushes notifications to the mapped Slack channel for specific
business events. v1 only wires `marketing_request_*` events; new event types
can be added by registering them in `EVENT_TYPES` below.

Endpoints (prefix `/slack`):
  GET    /config                 fetch the tenant's current Slack config (admin)
  PUT    /config                 save / update bot_token + signing_secret + mappings
  GET    /channels               list channels visible to the bot (uses bot_token)
  POST   /test                   send a test message to a channel
  POST   /events                 Slack Events API webhook (URL verification + events)
  POST   /interactivity          Slack interactive components (buttons, slash cmds)

DB collections:
  slack_config — one row per tenant with bot_token, signing_secret, mappings.
"""
import hmac
import hashlib
import logging
import time
import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Event types that the CRM can push to Slack. The key is what's stored in the
# tenant's mapping; the label is what the Settings UI shows.
EVENT_TYPES: Dict[str, str] = {
    "marketing_request_created": "Marketing Request — created",
    "marketing_request_status_changed": "Marketing Request — status changed",
    "marketing_request_commented": "Marketing Request — new comment",
}


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic payloads
# ─────────────────────────────────────────────────────────────────────────────
class ChannelMapping(BaseModel):
    event_type: str
    channel_id: str
    channel_name: Optional[str] = None
    enabled: bool = True


class SlackConfigPayload(BaseModel):
    bot_token: Optional[str] = None
    signing_secret: Optional[str] = None
    default_channel_id: Optional[str] = None
    default_channel_name: Optional[str] = None
    mappings: Optional[List[ChannelMapping]] = None
    enabled: Optional[bool] = None


class SlackTestPayload(BaseModel):
    channel_id: str
    message: Optional[str] = "Hello from your CRM 👋 — Slack integration is working."


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _mask_token(tok: Optional[str]) -> Optional[str]:
    if not tok:
        return None
    if len(tok) <= 10:
        return "***"
    return f"{tok[:6]}…{tok[-4:]}"


async def _get_config(tenant_id: str) -> Optional[dict]:
    return await db.slack_config.find_one({"tenant_id": tenant_id}, {"_id": 0})


async def get_channel_for_event(tenant_id: str, event_type: str) -> Optional[str]:
    """Resolve which Slack channel a given event should be posted to.
    Order: explicit mapping → default_channel_id → None (skip)."""
    cfg = await _get_config(tenant_id)
    if not cfg or not cfg.get("enabled", True):
        return None
    if not cfg.get("bot_token"):
        return None
    for m in cfg.get("mappings") or []:
        if m.get("event_type") == event_type and m.get("enabled", True):
            return m.get("channel_id")
    return cfg.get("default_channel_id")


async def post_event_message(
    tenant_id: str,
    event_type: str,
    text: str,
    blocks: Optional[list] = None,
) -> Optional[str]:
    """Post a message to the tenant's mapped channel for the given event.
    Returns the Slack message ts on success, None if skipped/failed."""
    cfg = await _get_config(tenant_id)
    if not cfg or not cfg.get("enabled", True) or not cfg.get("bot_token"):
        return None
    channel_id = await get_channel_for_event(tenant_id, event_type)
    if not channel_id:
        return None
    try:
        client = WebClient(token=cfg["bot_token"])
        resp = client.chat_postMessage(channel=channel_id, text=text, blocks=blocks or None)
        return resp.get("ts")
    except SlackApiError as e:
        logger.warning("Slack post failed for tenant=%s event=%s: %s", tenant_id, event_type, e.response.get("error"))
    except Exception:
        logger.exception("Slack post crashed for tenant=%s event=%s", tenant_id, event_type)
    return None


def _verify_signature(signing_secret: str, timestamp: str, body: bytes, signature: str) -> bool:
    if not signing_secret or not timestamp or not signature:
        return False
    # Reject replays beyond 5 minutes
    try:
        if abs(time.time() - int(timestamp)) > 60 * 5:
            return False
    except ValueError:
        return False
    base = f"v0:{timestamp}:{body.decode('utf-8')}".encode("utf-8")
    computed = "v0=" + hmac.new(signing_secret.encode("utf-8"), base, hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, signature)


def _is_admin(user: dict) -> bool:
    role = (user.get("role") or "").lower()
    return role in ("ceo", "admin", "system_admin", "tenant_admin")


# ─────────────────────────────────────────────────────────────────────────────
# Config CRUD (tenant admin)
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/config")
async def get_slack_config(current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can view Slack settings")
    tenant_id = get_current_tenant_id()
    cfg = await _get_config(tenant_id) or {}
    return {
        "tenant_id": tenant_id,
        "enabled": cfg.get("enabled", False),
        "bot_token_masked": _mask_token(cfg.get("bot_token")),
        "has_bot_token": bool(cfg.get("bot_token")),
        "has_signing_secret": bool(cfg.get("signing_secret")),
        "default_channel_id": cfg.get("default_channel_id"),
        "default_channel_name": cfg.get("default_channel_name"),
        "mappings": cfg.get("mappings") or [],
        "team": cfg.get("team"),  # auto-populated team info from auth.test
        "event_types": [{"key": k, "label": v} for k, v in EVENT_TYPES.items()],
        "updated_at": cfg.get("updated_at"),
    }


@router.put("/config")
async def put_slack_config(payload: SlackConfigPayload, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can update Slack settings")
    tenant_id = get_current_tenant_id()
    existing = await _get_config(tenant_id) or {}
    now_iso = datetime.now(timezone.utc).isoformat()
    new_doc = {**existing}
    if payload.bot_token is not None and payload.bot_token.strip():
        new_doc["bot_token"] = payload.bot_token.strip()
    if payload.signing_secret is not None and payload.signing_secret.strip():
        new_doc["signing_secret"] = payload.signing_secret.strip()
    if payload.default_channel_id is not None:
        new_doc["default_channel_id"] = payload.default_channel_id.strip() or None
        new_doc["default_channel_name"] = (payload.default_channel_name or "").strip() or None
    if payload.mappings is not None:
        new_doc["mappings"] = [m.model_dump() for m in payload.mappings]
    if payload.enabled is not None:
        new_doc["enabled"] = bool(payload.enabled)
    new_doc["tenant_id"] = tenant_id
    new_doc["updated_at"] = now_iso
    new_doc["updated_by"] = current_user.get("id")

    # Best-effort: call auth.test to capture team info / surface invalid tokens early
    if new_doc.get("bot_token"):
        try:
            test = WebClient(token=new_doc["bot_token"]).auth_test()
            new_doc["team"] = {
                "team_id": test.get("team_id"),
                "team": test.get("team"),
                "bot_user_id": test.get("user_id"),
                "url": test.get("url"),
            }
            if new_doc.get("enabled") is None:
                new_doc["enabled"] = True
        except SlackApiError as e:
            raise HTTPException(400, f"Slack auth.test failed: {e.response.get('error')}")

    await db.slack_config.update_one(
        {"tenant_id": tenant_id},
        {"$set": new_doc},
        upsert=True,
    )
    cfg = await _get_config(tenant_id) or {}
    return {
        "ok": True,
        "team": cfg.get("team"),
        "enabled": cfg.get("enabled", False),
        "default_channel_id": cfg.get("default_channel_id"),
        "default_channel_name": cfg.get("default_channel_name"),
        "mappings": cfg.get("mappings") or [],
    }


@router.get("/channels")
async def list_slack_channels(current_user: dict = Depends(get_current_user)):
    """List public + private channels the bot is a member of (or can see)."""
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can browse Slack channels")
    tenant_id = get_current_tenant_id()
    cfg = await _get_config(tenant_id)
    if not cfg or not cfg.get("bot_token"):
        raise HTTPException(400, "Slack is not configured. Save a bot token first.")
    try:
        client = WebClient(token=cfg["bot_token"])
        out: List[dict] = []
        cursor = None
        for _ in range(5):  # bound at 5 pages (~1000 channels)
            kwargs = {"types": "public_channel,private_channel", "limit": 200}
            if cursor:
                kwargs["cursor"] = cursor
            resp = client.conversations_list(**kwargs)
            for ch in resp.get("channels", []) or []:
                out.append({
                    "id": ch.get("id"),
                    "name": ch.get("name"),
                    "is_private": bool(ch.get("is_private")),
                    "is_member": bool(ch.get("is_member")),
                })
            cursor = (resp.get("response_metadata") or {}).get("next_cursor") or None
            if not cursor:
                break
        out.sort(key=lambda c: (not c["is_member"], c["name"] or ""))
        return {"channels": out}
    except SlackApiError as e:
        raise HTTPException(400, f"Slack channels.list failed: {e.response.get('error')}")


@router.post("/test")
async def slack_send_test(payload: SlackTestPayload, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can send test messages")
    tenant_id = get_current_tenant_id()
    cfg = await _get_config(tenant_id)
    if not cfg or not cfg.get("bot_token"):
        raise HTTPException(400, "Slack is not configured.")
    try:
        WebClient(token=cfg["bot_token"]).chat_postMessage(
            channel=payload.channel_id,
            text=payload.message or "Hello from your CRM 👋",
        )
        return {"ok": True}
    except SlackApiError as e:
        raise HTTPException(400, f"Slack chat.postMessage failed: {e.response.get('error')}")


# ─────────────────────────────────────────────────────────────────────────────
# Webhooks (no auth — verified via Slack signature against the tenant's secret)
# ─────────────────────────────────────────────────────────────────────────────
async def _resolve_tenant_for_slack_payload(team_id: Optional[str]) -> Optional[dict]:
    """Pick the tenant config whose stored team.team_id matches the inbound
    Slack payload. Falls back to the sole config if only one exists."""
    if team_id:
        cfg = await db.slack_config.find_one({"team.team_id": team_id}, {"_id": 0})
        if cfg:
            return cfg
    # Fallback for single-tenant setups
    docs = await db.slack_config.find({}, {"_id": 0}).to_list(2)
    if len(docs) == 1:
        return docs[0]
    return None


@router.post("/events")
async def slack_events(request: Request):
    """Slack Events API webhook. Handles URL verification challenge + events.

    Signature is verified against the tenant's signing_secret. We look up the
    tenant by `team_id` inside the payload (Events API includes it).
    """
    raw = await request.body()
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")
    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")

    # URL verification challenge — Slack pings this once when you configure
    # the Request URL. Respond with the challenge token unmodified.
    if payload.get("type") == "url_verification":
        return Response(content=payload.get("challenge", ""), media_type="text/plain")

    team_id = payload.get("team_id") or (payload.get("team") or {}).get("id")
    cfg = await _resolve_tenant_for_slack_payload(team_id)
    if not cfg or not cfg.get("signing_secret"):
        # Cannot verify — refuse silently to avoid leaking tenant existence
        return {"ok": True}
    if not _verify_signature(cfg["signing_secret"], timestamp, raw, signature):
        raise HTTPException(401, "Invalid signature")

    if payload.get("type") == "event_callback":
        event = payload.get("event", {}) or {}
        etype = event.get("type")
        # Persist for later inspection / two-way handling
        await db.slack_event_log.insert_one({
            "tenant_id": cfg.get("tenant_id"),
            "team_id": team_id,
            "event_type": etype,
            "channel": event.get("channel"),
            "user": event.get("user"),
            "text": event.get("text"),
            "ts": event.get("ts"),
            "thread_ts": event.get("thread_ts"),
            "raw": event,
            "received_at": datetime.now(timezone.utc).isoformat(),
        })
        # Auto-acknowledge @mentions so users see we're listening.
        if etype == "app_mention":
            try:
                WebClient(token=cfg.get("bot_token")).chat_postMessage(
                    channel=event.get("channel"),
                    thread_ts=event.get("ts"),
                    text=(
                        "Got it. The Nyla CRM is logging this mention against your tenant. "
                        "Two-way actions (e.g. status updates on a marketing request) coming soon."
                    ),
                )
            except Exception:
                logger.exception("Slack auto-ack failed")
    return {"ok": True}


@router.post("/interactivity")
async def slack_interactivity(request: Request):
    """Slack interactive components webhook (buttons, modals, shortcuts).
    Body is form-encoded with a `payload=<urlencoded-json>` field."""
    raw = await request.body()
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")
    try:
        form = dict(item.split("=", 1) for item in raw.decode("utf-8").split("&") if "=" in item)
        from urllib.parse import unquote_plus
        payload = json.loads(unquote_plus(form.get("payload", "{}")))
    except Exception:
        raise HTTPException(400, "Invalid interactivity payload")

    team_id = (payload.get("team") or {}).get("id")
    cfg = await _resolve_tenant_for_slack_payload(team_id)
    if not cfg or not cfg.get("signing_secret"):
        return {"ok": True}
    if not _verify_signature(cfg["signing_secret"], timestamp, raw, signature):
        raise HTTPException(401, "Invalid signature")

    await db.slack_event_log.insert_one({
        "tenant_id": cfg.get("tenant_id"),
        "team_id": team_id,
        "event_type": f"interactivity:{payload.get('type')}",
        "raw": payload,
        "received_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}
