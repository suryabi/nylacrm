"""Reusable comment + @-mention helpers shared across entity discussion threads
(Accounts, Meetings, Leads, Tasks, …).

Comments store the body in the `text` field with inline `@[Display Name](user-id)`
chips (inserted by the frontend `MentionTextarea`). `notify_comment_mentions`
parses those chips and pings every referenced user (minus the author) via the
shared notification preference matrix (`category="mention"`).
"""
import uuid
import logging
from datetime import datetime, timezone

from utils.mentions import extract_mentions
from utils.notify import notify_users

logger = logging.getLogger(__name__)


def build_comment(entity_field: str, entity_id: str, text: str, current_user: dict) -> dict:
    """Build a normalized comment document. The caller is responsible for the
    actual insert (so each route keeps its own db/tdb + tenant convention)."""
    return {
        "id": str(uuid.uuid4()),
        entity_field: entity_id,
        "text": (text or "").strip(),
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name") or current_user.get("email") or "User",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


async def notify_comment_mentions(
    *,
    tenant_id: str,
    text: str,
    current_user: dict,
    link: str,
    title: str,
    body: str,
    entity_type: str,
    entity_id: str,
    extra_ids=None,
):
    """Best-effort: notify every user @-mentioned in `text` (plus any ids in
    `extra_ids`, e.g. a task's explicit mentions array), excluding the author.
    Never raises — a notification failure must never break the comment."""
    try:
        author = current_user.get("id")
        ids = set(extract_mentions(text or ""))
        if extra_ids:
            ids.update(uid for uid in extra_ids if uid)
        mention_ids = [uid for uid in ids if uid and uid != author]
        if mention_ids:
            await notify_users(
                tenant_id=tenant_id,
                user_ids=mention_ids,
                title=title,
                body=body,
                link=link,
                kind="mention",
                category="mention",
                entity_type=entity_type,
                entity_id=entity_id,
            )
    except Exception:
        logger.exception("Mention notification failed for %s %s", entity_type, entity_id)
