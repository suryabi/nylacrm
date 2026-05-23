"""Google Drive Settings — per-tenant service account + shared drive config.

Endpoints (prefix `/google-drive`):
  GET    /config      — fetch the masked config + status
  PUT    /config      — save service account JSON + shared drive ID
  POST   /test        — verify the service account can reach the shared drive
  GET    /usage       — count of files we've uploaded under this tenant
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from googleapiclient.errors import HttpError

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from utils import google_drive_storage as drive

logger = logging.getLogger(__name__)
router = APIRouter()


class DriveConfigPayload(BaseModel):
    # Accept either a JSON object or a JSON string
    service_account_json: Optional[Any] = None
    shared_drive_id: Optional[str] = None
    folder_prefix: Optional[str] = None
    enabled: Optional[bool] = None


def _is_admin(user: dict) -> bool:
    role = (user.get("role") or "").lower()
    return role in ("ceo", "admin", "system_admin", "tenant_admin")


def _mask_sa(sa: Optional[dict]) -> Optional[dict]:
    if not sa:
        return None
    return {
        "client_email": sa.get("client_email"),
        "project_id": sa.get("project_id"),
        "private_key_id": (sa.get("private_key_id") or "")[:6] + "…",
        "type": sa.get("type"),
    }


@router.get("/config")
async def get_config(current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can view Google Drive settings")
    tenant_id = get_current_tenant_id()
    cfg = await drive.get_drive_config(tenant_id) or {}
    return {
        "tenant_id": tenant_id,
        "enabled": bool(cfg.get("enabled")),
        "shared_drive_id": cfg.get("shared_drive_id"),
        "folder_prefix": cfg.get("folder_prefix"),
        "service_account_masked": _mask_sa(cfg.get("service_account_json")),
        "has_service_account": bool(cfg.get("service_account_json")),
        "drive_meta": cfg.get("drive_meta"),
        "updated_at": cfg.get("updated_at"),
    }


@router.put("/config")
async def put_config(payload: DriveConfigPayload, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can update Google Drive settings")
    tenant_id = get_current_tenant_id()
    existing = await drive.get_drive_config(tenant_id) or {}
    new_doc: Dict[str, Any] = {**existing, "tenant_id": tenant_id}

    if payload.service_account_json is not None:
        sa = payload.service_account_json
        if isinstance(sa, str):
            try:
                sa = json.loads(sa)
            except json.JSONDecodeError:
                raise HTTPException(400, "service_account_json is not valid JSON")
        if not isinstance(sa, dict) or not sa.get("client_email") or not sa.get("private_key"):
            raise HTTPException(400, "service_account_json must include client_email and private_key")
        new_doc["service_account_json"] = sa

    if payload.shared_drive_id is not None:
        sid = payload.shared_drive_id.strip()
        if sid:
            new_doc["shared_drive_id"] = sid
    if payload.folder_prefix is not None:
        new_doc["folder_prefix"] = payload.folder_prefix.strip() or None
    if payload.enabled is not None:
        new_doc["enabled"] = bool(payload.enabled)

    # If both pieces are present, verify before saving. Surfaces bad creds early.
    if new_doc.get("service_account_json") and new_doc.get("shared_drive_id"):
        try:
            meta = drive.test_connection(new_doc["service_account_json"], new_doc["shared_drive_id"])
            new_doc["drive_meta"] = {
                "id": meta["drive"].get("id"),
                "name": meta["drive"].get("name"),
                "client_email": meta.get("client_email"),
            }
        except HttpError as e:
            raise HTTPException(400, f"Google Drive verification failed: {e.reason or str(e)}")
        except Exception as e:
            raise HTTPException(400, f"Google Drive verification failed: {e}")

    new_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    new_doc["updated_by"] = current_user.get("id")
    await db.google_drive_config.update_one(
        {"tenant_id": tenant_id}, {"$set": new_doc}, upsert=True
    )
    cfg = await drive.get_drive_config(tenant_id) or {}
    return {
        "ok": True,
        "enabled": bool(cfg.get("enabled")),
        "drive_meta": cfg.get("drive_meta"),
        "service_account_masked": _mask_sa(cfg.get("service_account_json")),
        "shared_drive_id": cfg.get("shared_drive_id"),
        "folder_prefix": cfg.get("folder_prefix"),
    }


@router.post("/test")
async def test_connection(current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can test Google Drive")
    tenant_id = get_current_tenant_id()
    cfg = await drive.get_drive_config(tenant_id)
    if not cfg or not cfg.get("service_account_json") or not cfg.get("shared_drive_id"):
        raise HTTPException(400, "Google Drive is not configured yet.")
    try:
        meta = drive.test_connection(cfg["service_account_json"], cfg["shared_drive_id"])
        return {
            "ok": True,
            "drive": meta["drive"],
            "sample_files": meta.get("sample_files", []),
            "client_email": meta.get("client_email"),
        }
    except HttpError as e:
        raise HTTPException(400, f"Google Drive test failed: {e.reason or str(e)}")
    except Exception as e:
        raise HTTPException(400, f"Google Drive test failed: {e}")


@router.get("/usage")
async def usage(current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can view Drive usage")
    tenant_id = get_current_tenant_id()
    count = await db.google_drive_files.count_documents({"tenant_id": tenant_id})
    folders = await db.google_drive_folders.count_documents({"tenant_id": tenant_id})
    return {"tenant_id": tenant_id, "files_uploaded": count, "folders_created": folders}


@router.post("/backfill-lead-folders")
async def backfill_lead_folders(current_user: dict = Depends(get_current_user)):
    """One-time helper: ensure every existing lead in this tenant has a Drive
    folder (so historical leads work the same as newly-created ones). Idempotent
    — safe to re-run."""
    if not _is_admin(current_user):
        raise HTTPException(403, "Only admins can run the backfill")
    tenant_id = get_current_tenant_id()
    cfg = await drive.get_drive_config(tenant_id)
    if not cfg or not cfg.get("enabled") or not cfg.get("service_account_json"):
        raise HTTPException(400, "Google Drive is not configured / enabled.")

    cursor = db.leads.find(
        {"tenant_id": tenant_id, "lead_id": {"$ne": None}},
        {"_id": 0, "id": 1, "lead_id": 1, "drive_folder_id": 1},
    )
    created = 0
    skipped = 0
    errors = 0
    async for lead in cursor:
        if lead.get("drive_folder_id"):
            skipped += 1
            continue
        try:
            folder_id = await drive.ensure_lead_folder(tenant_id, lead["lead_id"])
            if folder_id:
                await db.leads.update_one(
                    {"id": lead["id"], "tenant_id": tenant_id},
                    {"$set": {"drive_folder_id": folder_id}},
                )
                created += 1
            else:
                skipped += 1
        except Exception:
            logger.exception("Backfill failed for lead %s", lead.get("lead_id"))
            errors += 1
    return {"ok": True, "created": created, "skipped": skipped, "errors": errors}
