"""State-machine transition notifications.

Resolves a transition's notification rules into concrete recipients and
dispatches them across the configured channels. In-app and email send for real;
WhatsApp / SMS / Push are configured but no-op (logged) until those integrations
are wired. Everything here is best-effort and never raises to the caller.
"""
import os
import re
import logging
from typing import Optional

from database import db
from utils.notify import notify_users
from utils.email_sender import send_email
from utils.sm_helpers import resolve_department_name

logger = logging.getLogger("sm_notify")

# Channels that actually deliver today vs. configured-but-pending.
LIVE_CHANNELS = {"in_app", "email"}
PENDING_CHANNELS = {"whatsapp", "sms", "push"}
ALL_CHANNELS = LIVE_CHANNELS | PENDING_CHANNELS

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")


def render(text: str, vars_map: dict) -> str:
    if not text:
        return text or ""
    return _PLACEHOLDER_RE.sub(lambda m: str(vars_map.get(m.group(1), "")), text)


async def _users_by_role(tenant_id: str, role: str):
    if not role:
        return []
    rows = await db.users.find(
        {"tenant_id": tenant_id, "role": role}, {"_id": 0, "id": 1}
    ).to_list(length=None)
    return [r["id"] for r in rows]


async def _users_by_department(tenant_id: str, dept_id: str):
    if not dept_id:
        return []
    name = await resolve_department_name(tenant_id, dept_id) or dept_id
    rows = await db.users.find(
        {"tenant_id": tenant_id, "department": name}, {"_id": 0, "id": 1}
    ).to_list(length=None)
    return [r["id"] for r in rows]


async def resolve_recipients(tenant_id: str, recipients: list, doc: dict, assign: dict) -> set:
    """Turn a rule's recipient specs into a concrete set of user_ids.

    Each spec is {type, value?} where type ∈
    requestor | assignee | watchers | role | department | user.
    """
    ids: set = set()
    assign = assign or {}
    for spec in (recipients or []):
        if not isinstance(spec, dict):
            continue
        rtype = (spec.get("type") or "").strip()
        val = spec.get("value")
        try:
            if rtype == "requestor":
                if doc.get("created_by"):
                    ids.add(doc["created_by"])
            elif rtype == "assignee":
                for uid in (assign.get("assignee_user_ids") or []):
                    if uid:
                        ids.add(uid)
                if doc.get("assigned_user_id"):
                    ids.add(doc["assigned_user_id"])
            elif rtype == "watchers":
                for uid in (doc.get("watcher_user_ids") or doc.get("watchers") or []):
                    if isinstance(uid, str):
                        ids.add(uid)
            elif rtype == "role":
                for uid in await _users_by_role(tenant_id, val):
                    ids.add(uid)
            elif rtype == "department":
                for uid in await _users_by_department(tenant_id, val):
                    ids.add(uid)
            elif rtype == "user":
                if val:
                    ids.add(val)
        except Exception:
            logger.exception("resolve_recipients: failed for spec %s", spec)
    return ids


async def dispatch_transition_notifications(
    tenant_id: str,
    transition: dict,
    doc: dict,
    assign: dict,
    *,
    actor: dict,
    vars_map: dict,
    link: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    category: str = "approval",
):
    """For each notification rule on the transition, resolve recipients, render
    the template and deliver across the rule's channels. Best-effort."""
    rules = transition.get("notifications") or []
    if not rules:
        return

    actor_id = (actor or {}).get("id")
    default_subject = vars_map.get("default_subject") or f"{vars_map.get('request_number', '')}: {vars_map.get('to_state', '')}"
    default_body = vars_map.get("default_body") or (
        f"\"{vars_map.get('title', '')}\" — {vars_map.get('action', 'updated')} "
        f"to '{vars_map.get('to_state', '')}' by {vars_map.get('actor_name', 'someone')}."
    )

    # Cache templates for this dispatch.
    tpl_cache: dict = {}

    for rule in rules:
        if not isinstance(rule, dict):
            continue
        channels = [c for c in (rule.get("channels") or []) if c in ALL_CHANNELS]
        if not channels:
            continue
        recipients = await resolve_recipients(tenant_id, rule.get("recipients"), doc, assign)
        recipients = {uid for uid in recipients if uid and uid != actor_id}
        if not recipients:
            continue

        # Resolve template.
        subject, body = default_subject, default_body
        tpl_id = rule.get("template_id")
        if tpl_id:
            tpl = tpl_cache.get(tpl_id)
            if tpl is None:
                tpl = await db.notification_templates.find_one(
                    {"id": tpl_id, "tenant_id": tenant_id}, {"_id": 0}
                ) or {}
                tpl_cache[tpl_id] = tpl
            if tpl:
                subject = render(tpl.get("subject") or default_subject, vars_map)
                body = render(tpl.get("body") or default_body, vars_map)

        recipient_list = sorted(recipients)

        # ── Live channels: in-app + email ──────────────────────────────────
        want_in_app = "in_app" in channels
        want_email = "email" in channels
        try:
            if want_in_app:
                await notify_users(
                    tenant_id,
                    recipient_list,
                    title=subject,
                    body=body,
                    link=link,
                    kind="workflow_notification",
                    entity_type=entity_type,
                    entity_id=entity_id,
                    send_email_too=want_email,
                    category=category,
                )
            elif want_email:
                # Email only — bypass the in-app insert.
                users = await db.users.find(
                    {"id": {"$in": recipient_list}, "tenant_id": tenant_id},
                    {"_id": 0, "email": 1},
                ).to_list(length=None)
                html = (
                    f"<div style=\"font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;\">"
                    f"<h2 style=\"margin:0 0 8px;font-size:18px;\">{subject}</h2>"
                    f"<p style=\"margin:0 0 16px;color:#334155;font-size:14px;line-height:1.5;\">{body}</p>"
                    + (f"<a href=\"{link}\" style=\"display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;\">Open</a>" if link else "")
                    + "</div>"
                )
                text = f"{subject}\n\n{body}" + (f"\n\nOpen: {link}" if link else "")
                for u in users:
                    if u.get("email"):
                        await send_email(to=u["email"], subject=subject, html=html, text=text)
        except Exception:
            logger.exception("dispatch_transition_notifications: live channel send failed")

        # ── Pending channels: log only until integrated ────────────────────
        pending = [c for c in channels if c in PENDING_CHANNELS]
        if pending:
            logger.info(
                "Notification channel(s) %s pending integration — skipped for %s recipients on transition '%s'",
                pending, len(recipient_list), transition.get("action_key"),
            )
