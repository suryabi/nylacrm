"""
Object Storage Utility for Emergent Platform
Handles file uploads, downloads, and storage for PDFs and other files
"""
import os
import logging
import requests
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "nyla-crm"

# Module-level storage key - initialized once and reused
_storage_key: Optional[str] = None


def init_storage() -> str:
    """
    Initialize storage and get a session-scoped storage key.
    Call ONCE at startup. Returns a reusable storage_key.
    """
    global _storage_key
    
    if _storage_key:
        return _storage_key
    
    if not EMERGENT_KEY:
        raise ValueError("EMERGENT_LLM_KEY not set in environment")
    
    try:
        resp = requests.post(
            f"{STORAGE_URL}/init",
            json={"emergent_key": EMERGENT_KEY},
            timeout=30
        )
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        logger.info("Object storage initialized successfully")
        return _storage_key
    except requests.RequestException as e:
        logger.error(f"Failed to initialize object storage: {e}")
        raise


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """
    Upload a file to object storage.
    
    Args:
        path: Storage path (no leading slash), e.g., "nyla-crm/pdfs/note.pdf"
        data: File content as bytes
        content_type: MIME type, e.g., "application/pdf"
    
    Returns:
        dict with {"path": "...", "size": 123, "etag": "..."}
    """
    key = init_storage()
    
    try:
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={
                "X-Storage-Key": key,
                "Content-Type": content_type
            },
            data=data,
            timeout=120
        )
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"Uploaded file to {path}, size: {result.get('size', 'unknown')}")
        return result
    except requests.RequestException as e:
        logger.error(f"Failed to upload file to {path}: {e}")
        raise


def get_object(path: str) -> Tuple[bytes, str]:
    """
    Download a file from object storage.
    
    Args:
        path: Storage path to download
    
    Returns:
        Tuple of (content_bytes, content_type)
    """
    key = init_storage()
    
    try:
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60
        )
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "application/octet-stream")
        return resp.content, content_type
    except requests.RequestException as e:
        logger.error(f"Failed to download file from {path}: {e}")
        raise


def upload_pdf(filename: str, pdf_bytes: bytes, subfolder: str = "debit-credit-notes") -> dict:
    """
    Convenience function to upload a PDF file.
    
    Args:
        filename: Name for the file (e.g., "CN-2026-0001.pdf")
        pdf_bytes: PDF content as bytes
        subfolder: Subfolder under app name
    
    Returns:
        dict with storage path and metadata
    """
    path = f"{APP_NAME}/{subfolder}/{filename}"
    return put_object(path, pdf_bytes, "application/pdf")


def download_pdf(path: str) -> bytes:
    """
    Convenience function to download a PDF file.
    
    Args:
        path: Full storage path
    
    Returns:
        PDF content as bytes
    """
    content, _ = get_object(path)
    return content
