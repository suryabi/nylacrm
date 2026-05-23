"""Google Drive Shared-Drive storage backend.

Designed as a drop-in alternative to `utils.object_storage` (Emergent Object
Storage). Same public surface — `put_object`, `get_object`, `delete_object` —
so callers don't care which backend is active.

Per-tenant config lives in MongoDB collection `google_drive_config`:
  {
    tenant_id: str,
    enabled: bool,
    service_account_json: dict,   # the full JSON key
    shared_drive_id: str,         # the Shared Drive root ID
    folder_prefix: str | None,    # optional subfolder e.g. "nyla-crm"
    team_email: str | None,
    updated_at, updated_by
  }

Files are stored using a logical `path` that we map onto a Drive folder hierarchy:
   path "marketing-requests/MR-2026-0006/logo.png"  →
        <shared_drive>/marketing-requests/MR-2026-0006/logo.png (auto-creating folders)

We then persist the resulting `file_id` in a small cache collection so subsequent
get/delete calls don't need to re-walk the folder tree by name.
"""
import io
import logging
from typing import Optional, Tuple, Dict, Any

from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload
from googleapiclient.errors import HttpError
from google.oauth2 import service_account

from database import db

logger = logging.getLogger(__name__)

# Read+Write+Delete on any drive the service account can access (including
# shared drives shared with it).
SCOPES = ["https://www.googleapis.com/auth/drive"]

_service_cache: Dict[str, Any] = {}


# ─────────────────────────────────────────────────────────────────────────────
# Config helpers
# ─────────────────────────────────────────────────────────────────────────────
async def get_drive_config(tenant_id: str) -> Optional[dict]:
    return await db.google_drive_config.find_one({"tenant_id": tenant_id}, {"_id": 0})


def _build_service(sa_json: dict):
    creds = service_account.Credentials.from_service_account_info(sa_json, scopes=SCOPES)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


async def _service_for_tenant(tenant_id: str):
    """Cached Drive service per tenant. Re-built if config changes."""
    cfg = await get_drive_config(tenant_id)
    if not cfg or not cfg.get("enabled") or not cfg.get("service_account_json") or not cfg.get("shared_drive_id"):
        return None, None
    key = f"{tenant_id}:{cfg.get('updated_at')}"
    svc = _service_cache.get(key)
    if not svc:
        svc = _build_service(cfg["service_account_json"])
        _service_cache.clear()  # only cache one at a time
        _service_cache[key] = svc
    return svc, cfg


# ─────────────────────────────────────────────────────────────────────────────
# Folder pathing
# ─────────────────────────────────────────────────────────────────────────────
async def _find_or_create_folder(svc, drive_id: str, parent_id: str, name: str) -> str:
    """Find a folder named `name` directly under `parent_id` in the shared drive,
    or create it. Returns the folder ID."""
    safe = name.replace("'", "\\'")
    q = (
        f"name = '{safe}' and "
        f"'{parent_id}' in parents and "
        f"mimeType = 'application/vnd.google-apps.folder' and "
        f"trashed = false"
    )
    resp = svc.files().list(
        q=q,
        spaces="drive",
        fields="files(id, name)",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
        corpora="drive",
        driveId=drive_id,
    ).execute()
    files = resp.get("files", [])
    if files:
        return files[0]["id"]
    new = svc.files().create(
        body={
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id],
        },
        fields="id",
        supportsAllDrives=True,
    ).execute()
    return new["id"]


async def _resolve_folder_path(svc, drive_id: str, root_id: str, segments: list[str]) -> str:
    parent_id = root_id
    for seg in segments:
        if not seg:
            continue
        parent_id = await _find_or_create_folder(svc, drive_id, parent_id, seg)
    return parent_id


async def ensure_lead_folder(tenant_id: str, lead_id: str) -> Optional[str]:
    """Ensure a dedicated folder exists for this lead under the tenant's
    folder_prefix (or shared-drive root). Returns the folder ID. Lookups +
    creations are idempotent and cached in `google_drive_folders`.

    Returns None silently if Drive isn't configured for this tenant — so the
    caller (lead creation) never breaks when Drive is off.
    """
    if not lead_id:
        return None
    cached = await db.google_drive_folders.find_one(
        {"tenant_id": tenant_id, "kind": "lead", "ref_id": lead_id},
        {"_id": 0, "folder_id": 1},
    )
    if cached and cached.get("folder_id"):
        return cached["folder_id"]
    svc, cfg = await _service_for_tenant(tenant_id)
    if not svc:
        return None
    drive_id = cfg["shared_drive_id"]
    prefix = (cfg.get("folder_prefix") or "").strip("/")
    segments = ([prefix] if prefix else []) + [lead_id]
    folder_id = await _resolve_folder_path(svc, drive_id, drive_id, segments)
    await db.google_drive_folders.update_one(
        {"tenant_id": tenant_id, "kind": "lead", "ref_id": lead_id},
        {"$set": {
            "tenant_id": tenant_id,
            "kind": "lead",
            "ref_id": lead_id,
            "folder_id": folder_id,
            "shared_drive_id": drive_id,
            "folder_prefix": prefix,
        }},
        upsert=True,
    )
    return folder_id


async def get_lead_folder_id(tenant_id: str, lead_id: str) -> Optional[str]:
    """Return the Drive folder ID for the lead, if any (without creating)."""
    cached = await db.google_drive_folders.find_one(
        {"tenant_id": tenant_id, "kind": "lead", "ref_id": lead_id},
        {"_id": 0, "folder_id": 1},
    )
    return cached.get("folder_id") if cached else None


# ─────────────────────────────────────────────────────────────────────────────
# Public API — drop-in for utils.object_storage
# ─────────────────────────────────────────────────────────────────────────────
async def put_object(tenant_id: str, path: str, data: bytes, content_type: str) -> dict:
    svc, cfg = await _service_for_tenant(tenant_id)
    if not svc:
        raise RuntimeError("Google Drive is not configured for this tenant.")
    drive_id = cfg["shared_drive_id"]
    prefix = (cfg.get("folder_prefix") or "").strip("/")
    parts = [p for p in path.split("/") if p]
    if prefix:
        parts = [prefix] + parts
    if not parts:
        raise ValueError("Empty storage path")
    file_name = parts[-1]
    folder_segments = parts[:-1]
    parent_id = await _resolve_folder_path(svc, drive_id, drive_id, folder_segments)
    media = MediaIoBaseUpload(io.BytesIO(data), mimetype=content_type, resumable=True)
    file = svc.files().create(
        body={"name": file_name, "parents": [parent_id]},
        media_body=media,
        fields="id, name, size, mimeType, webViewLink",
        supportsAllDrives=True,
    ).execute()
    # Persist mapping for fast retrieval
    await db.google_drive_files.update_one(
        {"tenant_id": tenant_id, "path": path},
        {"$set": {
            "tenant_id": tenant_id,
            "path": path,
            "file_id": file["id"],
            "name": file.get("name"),
            "size": int(file.get("size", 0)) if file.get("size") else len(data),
            "mime_type": file.get("mimeType", content_type),
            "drive_view_link": file.get("webViewLink"),
        }},
        upsert=True,
    )
    return {
        "path": path,
        "file_id": file["id"],
        "size": len(data),
        "etag": file["id"],
        "drive_view_link": file.get("webViewLink"),
    }


async def get_object(tenant_id: str, path: str) -> Tuple[bytes, str]:
    svc, _ = await _service_for_tenant(tenant_id)
    if not svc:
        raise RuntimeError("Google Drive is not configured for this tenant.")
    cached = await db.google_drive_files.find_one(
        {"tenant_id": tenant_id, "path": path}, {"_id": 0, "file_id": 1, "mime_type": 1}
    )
    if not cached:
        raise FileNotFoundError(f"Drive file not found for path: {path}")
    request = svc.files().get_media(fileId=cached["file_id"], supportsAllDrives=True)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buf.getvalue(), cached.get("mime_type", "application/octet-stream")


async def delete_object(tenant_id: str, path: str) -> bool:
    svc, _ = await _service_for_tenant(tenant_id)
    if not svc:
        return False
    cached = await db.google_drive_files.find_one(
        {"tenant_id": tenant_id, "path": path}, {"_id": 0, "file_id": 1}
    )
    if not cached:
        return True  # idempotent
    try:
        svc.files().delete(fileId=cached["file_id"], supportsAllDrives=True).execute()
    except HttpError as e:
        if e.resp.status not in (404, 410):
            logger.warning("Drive delete failed for %s: %s", path, e)
            return False
    await db.google_drive_files.delete_one({"tenant_id": tenant_id, "path": path})
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Connection test (used by the Settings UI)
# ─────────────────────────────────────────────────────────────────────────────
def test_connection(sa_json: dict, shared_drive_id: str) -> dict:
    """Verify the service account can see the Shared Drive. Returns drive metadata
    on success; raises a descriptive HttpError on failure."""
    svc = _build_service(sa_json)
    drv = svc.drives().get(driveId=shared_drive_id, fields="id, name, createdTime").execute()
    # Also list a few files to confirm read access
    files = svc.files().list(
        corpora="drive",
        driveId=shared_drive_id,
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
        pageSize=5,
        fields="files(id, name, mimeType)",
    ).execute()
    return {
        "drive": drv,
        "sample_files": files.get("files", []),
        "client_email": sa_json.get("client_email"),
    }
