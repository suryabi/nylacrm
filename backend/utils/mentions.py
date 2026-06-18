"""@-mention parsing + notification helper.

Mentions are stored inline in the comment body as `@[Display Name](user-id)`.
The frontend `MentionTextarea` inserts that exact shape when the user picks a
name from the autocomplete; the renderer turns them into pretty pills on
display. This module gives the comment endpoints a one-liner to pull the
mentioned user-ids and fire the notification.
"""

import re
from typing import List

# Matches @[Display Name](user-id). Display name may contain spaces; user-id
# is restricted to UUID-safe chars so we don't accidentally swallow markdown.
_MENTION_RE = re.compile(r"@\[([^\]]+)\]\(([A-Za-z0-9_\-]+)\)")


def extract_mentions(text: str) -> List[str]:
    """Return a de-duplicated list of user ids referenced by `@[name](id)`
    chips inside the body. Order-preserving. Empty list for None/empty input."""
    if not text:
        return []
    seen, out = set(), []
    for _name, uid in _MENTION_RE.findall(text):
        if uid and uid not in seen:
            seen.add(uid)
            out.append(uid)
    return out


def mentions_to_plain(text: str) -> str:
    """Render `@[name](id)` chips as `@name` for email/Slack delivery where
    HTML-y chips would look broken."""
    if not text:
        return text or ""
    return _MENTION_RE.sub(lambda m: f"@{m.group(1)}", text)
