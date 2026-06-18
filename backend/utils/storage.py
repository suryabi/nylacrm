"""Unified storage dispatcher.

Routes `put_object` / `get_object` / `delete_object` to either Google Drive
(if the tenant has configured & enabled it) or Emergent Object Storage
(the legacy backend) as a fallback.

This module is async-only because Drive's tenant lookup requires DB. The
existing object_storage.py is sync-only, so we run it in a threadpool via
`asyncio.to_thread`.

Existing call sites that already use `utils.object_storage` synchronously
continue to work unchanged — those keep talking to Emergent storage. Newly
written callers should `from utils.storage import put_object, get_object, ...`
and get the dispatching behavior.
"""
import asyncio
import logging
from typing import Tuple

from core.tenant import get_current_tenant_id
from utils import object_storage as _legacy
from utils import google_drive_storage as _drive

logger = logging.getLogger(__name__)


async def _drive_enabled(tenant_id: str) -> bool:
    cfg = await _drive.get_drive_config(tenant_id)
    return bool(cfg and cfg.get("enabled") and cfg.get("service_account_json") and cfg.get("shared_drive_id"))


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    tenant_id = get_current_tenant_id()
    if tenant_id and await _drive_enabled(tenant_id):
        try:
            return await _drive.put_object(tenant_id, path, data, content_type)
        except Exception:
            logger.exception("Drive put_object failed; falling back to Emergent storage for %s", path)
    return await asyncio.to_thread(_legacy.put_object, path, data, content_type)


async def get_object(path: str) -> Tuple[bytes, str]:
    tenant_id = get_current_tenant_id()
    if tenant_id and await _drive_enabled(tenant_id):
        try:
            return await _drive.get_object(tenant_id, path)
        except FileNotFoundError:
            # File might exist on legacy storage (pre-migration). Try fallback.
            pass
        except Exception:
            logger.exception("Drive get_object failed; falling back to Emergent storage for %s", path)
    return await asyncio.to_thread(_legacy.get_object, path)


async def delete_object(path: str) -> bool:
    tenant_id = get_current_tenant_id()
    if tenant_id and await _drive_enabled(tenant_id):
        try:
            return await _drive.delete_object(tenant_id, path)
        except Exception:
            logger.exception("Drive delete_object failed; trying Emergent storage for %s", path)
    return await asyncio.to_thread(_legacy.delete_object, path)


# Convenience helpers mirroring the legacy module's PDF shortcuts.
APP_NAME = _legacy.APP_NAME


async def upload_pdf(filename: str, pdf_bytes: bytes, subfolder: str = "debit-credit-notes") -> dict:
    path = f"{APP_NAME}/{subfolder}/{filename}"
    return await put_object(path, pdf_bytes, "application/pdf")


async def download_pdf(path: str) -> bytes:
    content, _ = await get_object(path)
    return content
