"""In-app notifications + best-effort email, used to alert assignees that an
action is needed (so they don't have to poll the board).

A notification is stored per-recipient in the `notifications` collection and,
when possible, also emailed. Everything here is best-effort and must never raise
to the caller.
"""
import uuid
import logging
from datetime import datetime, timezone

from database import db
from utils.email_sender import send_email

logger = logging.getLogger("notify")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def notify_users(
    tenant_id: str,
    user_ids,
    *,
    title: str,
    body: str = "",
    link: str = None,
    kind: str = "assignment",
    entity_type: str = None,
    entity_id: str = None,
    send_email_too: bool = True,
    # `category` is what the tenant+user preference matrix is keyed on. Pick
    # one of the keys from `routes.notification_settings.CATEGORIES` (`task`,
    # `lead`, `approval`, `design_request`, …). When omitted we use `kind` as
    # a best-effort key — keeps older call-sites working but means they
    # bypass the preference gate gracefully.
    category: str = None,
):
    """Create in-app notifications for the given users and optionally email them.

    `user_ids` may contain duplicates / Nones — they are de-duped and cleaned.
    Each recipient is checked against the tenant kill-switch, role matrix and
    their own per-category opt-outs (see `routes.notification_settings`).
    """
    ids = sorted({uid for uid in (user_ids or []) if uid})
    if not ids:
        return

    try:
        users = await db.users.find(
            {"id": {"$in": ids}, "tenant_id": tenant_id},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1},
        ).to_list(length=None)
    except Exception:
        logger.exception("notify_users: failed to load users")
        users = [{"id": uid} for uid in ids]

    # Filter by tenant + role + user preferences. Falls open (allow) on any
    # error so a settings table glitch never silences notifications.
    cat = (category or kind or "").strip()
    if cat:
        try:
            from routes.notification_settings import is_category_allowed
            allowed_users = []
            for u in users:
                try:
                    if await is_category_allowed(tenant_id, u, cat):
                        allowed_users.append(u)
                except Exception:
                    logger.exception("notify_users: preference gate errored — allowing user %s", u.get("id"))
                    allowed_users.append(u)
            users = allowed_users
        except Exception:
            logger.exception("notify_users: could not import preference gate; allowing all")
    allowed_ids = {u["id"] for u in users}
    if not allowed_ids:
        return

    now = _now()
    docs = [{
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "user_id": uid,
        "title": title,
        "body": body,
        "link": link,
        "kind": kind,
        "category": cat or None,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "is_read": False,
        "created_at": now,
    } for uid in ids if uid in allowed_ids]

    try:
        if docs:
            await db.notifications.insert_many(docs)
    except Exception:
        logger.exception("notify_users: failed to insert notifications")

    if not send_email_too:
        return

    html = f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">
      <h2 style="margin:0 0 8px;font-size:18px;">{title}</h2>
      <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.5;">{body}</p>
      {f'<a href="{link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;">Open</a>' if link else ''}
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">This is an automated notification — action may be required.</p>
    </div>
    """
    text = f"{title}\n\n{body}" + (f"\n\nOpen: {link}" if link else "")
    for u in users:
        email = u.get("email")
        if email:
            await send_email(to=email, subject=title, html=html, text=text)
