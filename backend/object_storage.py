"""Durable object storage helper (Emergent Object Storage).

Replaces ephemeral local-disk storage for uploaded images (lead/account logos,
bottle-preview designs) so files survive production redeploys/restarts.
"""
import os
import uuid
import logging
import requests

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "nyla-crm"  # prefix all paths to isolate this app's bucket namespace

_storage_key = None


def init_storage():
    """Initialise (once) and cache a session-scoped storage key."""
    global _storage_key
    if _storage_key:
        return _storage_key
    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        raise RuntimeError("EMERGENT_LLM_KEY is not configured")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": emergent_key}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    logger.info("Object storage initialised")
    return _storage_key


def _headers(content_type=None):
    h = {"X-Storage-Key": init_storage()}
    if content_type:
        h["Content-Type"] = content_type
    return h


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload bytes to `path`. Retries once with a fresh key on 403 (stale key)."""
    global _storage_key
    for attempt in range(2):
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers=_headers(content_type),
            data=data,
            timeout=120,
        )
        if resp.status_code == 403 and attempt == 0:
            _storage_key = None
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError("put_object failed")


def get_object(path: str):
    """Download bytes from `path`. Returns (content_bytes, content_type)."""
    global _storage_key
    for attempt in range(2):
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers=_headers(),
            timeout=60,
        )
        if resp.status_code == 403 and attempt == 0:
            _storage_key = None
            continue
        resp.raise_for_status()
        return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
    raise RuntimeError("get_object failed")


def store_image(prefix: str, data: bytes, content_type: str = "image/png", ext: str = "png") -> str:
    """Upload image bytes under `{APP_NAME}/{prefix}/{uuid}.{ext}`.

    Returns the canonical storage path (as reported by storage) to persist in the DB.
    """
    path = f"{APP_NAME}/{prefix}/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, content_type or "application/octet-stream")
    return result.get("path", path)
