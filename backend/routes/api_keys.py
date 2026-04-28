"""
API Keys for external integration partners.

- Per-tenant, per-partner. Each key has a list of allowed endpoints (method + path pattern).
- Created keys are hashed (sha256) before storage; full key shown only once on creation.
- Auth via `X-API-Key: ak_live_...` OR `Authorization: Bearer ak_live_...`.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import hashlib
import secrets
import uuid
import re

from database import db
from deps import get_current_user
from core.tenant import get_current_tenant_id

router = APIRouter()


# ============= AVAILABLE ENDPOINTS CATALOG =============
# Curated list of endpoints partners can be granted access to. Add to this
# list as we expose more APIs to external partners.
AVAILABLE_ENDPOINTS = [
    {
        "id": "create_account_invoice",
        "method": "POST",
        "path_pattern": "/api/accounts/{account_id}/invoices",
        "label": "Create Account Invoice",
        "description": "Create an invoice for an account from external system payload.",
    },
    {
        "id": "update_account_invoice",
        "method": "PUT",
        "path_pattern": "/api/accounts/{account_id}/invoices/{invoice_no}",
        "label": "Update Account Invoice",
        "description": "Update an existing invoice from external system payload.",
    },
    {
        "id": "get_account_invoices",
        "method": "GET",
        "path_pattern": "/api/accounts/{account_id}/invoices",
        "label": "List Account Invoices",
        "description": "List all invoices for an account.",
    },
    {
        "id": "list_master_skus",
        "method": "GET",
        "path_pattern": "/api/master-skus",
        "label": "List Master SKUs",
        "description": "Fetch SKU master data including external_sku_id mapping.",
    },
    {
        "id": "list_accounts",
        "method": "GET",
        "path_pattern": "/api/accounts",
        "label": "List Accounts",
        "description": "Fetch list of accounts (with filters).",
    },
]

ENDPOINT_LOOKUP = {e["id"]: e for e in AVAILABLE_ENDPOINTS}


# ============= MODELS =============

class AllowedEndpoint(BaseModel):
    method: str
    path_pattern: str


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120, description="Human label for the partner / integration")
    allowed_endpoint_ids: List[str] = Field(default_factory=list, description="IDs from AVAILABLE_ENDPOINTS")


class ApiKeyUpdate(BaseModel):
    name: Optional[str] = None
    allowed_endpoint_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None


# ============= HELPERS =============

def _generate_key() -> str:
    """Returns ak_live_<48-char-hex> — high entropy."""
    return f"ak_live_{secrets.token_hex(24)}"


def _hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _key_prefix(key: str) -> str:
    """First 12 chars for display: 'ak_live_8f3c'."""
    return key[:12]


def _resolve_endpoints(ids: List[str]) -> List[dict]:
    out = []
    for eid in ids:
        meta = ENDPOINT_LOOKUP.get(eid)
        if not meta:
            raise HTTPException(status_code=400, detail=f"Unknown endpoint id: '{eid}'")
        out.append({
            "id": meta["id"],
            "method": meta["method"],
            "path_pattern": meta["path_pattern"],
            "label": meta["label"],
        })
    return out


def _can_manage(user: dict) -> bool:
    role = (user or {}).get("role", "") or ""
    return role in {"System Admin", "CEO", "Director", "admin", "Admin"}


def _serialize_for_list(doc: dict) -> dict:
    return {
        "id": doc.get("id"),
        "name": doc.get("name"),
        "key_prefix": doc.get("key_prefix"),
        "allowed_endpoints": doc.get("allowed_endpoints", []),
        "is_active": doc.get("is_active", True),
        "created_at": doc.get("created_at"),
        "created_by": doc.get("created_by"),
        "created_by_name": doc.get("created_by_name"),
        "last_used_at": doc.get("last_used_at"),
    }


# ============= AUTH HELPER (used by deps.py) =============

def _path_matches(path_pattern: str, request_path: str) -> bool:
    """Convert '/api/accounts/{account_id}/invoices' to regex and match."""
    regex = re.sub(r"\{[^/}]+\}", r"[^/]+", path_pattern.rstrip("/"))
    return bool(re.fullmatch(regex, request_path.rstrip("/")))


async def authenticate_api_key(request: Request) -> Optional[dict]:
    """Authenticate an inbound request via API key. Returns a synthetic user dict or None."""
    raw = request.headers.get("X-API-Key") or request.headers.get("x-api-key")
    if not raw:
        auth = request.headers.get("Authorization") or ""
        if auth.startswith("Bearer ") and "ak_live_" in auth:
            raw = auth.split(" ", 1)[1].strip()
    if not raw or not raw.startswith("ak_live_"):
        return None

    key_doc = await db.api_keys.find_one(
        {"key_hash": _hash_key(raw), "is_active": True},
        {"_id": 0}
    )
    if not key_doc:
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")

    # Endpoint authorization
    method = request.method.upper()
    path = request.url.path
    allowed = key_doc.get("allowed_endpoints") or []
    if not any(
        ep.get("method", "").upper() == method and _path_matches(ep.get("path_pattern", ""), path)
        for ep in allowed
    ):
        raise HTTPException(
            status_code=403,
            detail=f"API key does not have permission for {method} {path}",
        )

    # Update last_used_at (fire-and-forget)
    try:
        await db.api_keys.update_one(
            {"id": key_doc["id"]},
            {"$set": {"last_used_at": datetime.now(timezone.utc).isoformat()}},
        )
    except Exception:
        pass

    # Pin tenant context to the key's tenant
    from core.tenant import set_current_tenant
    set_current_tenant(key_doc.get("tenant_id"))

    return {
        "id": f"apikey:{key_doc['id']}",
        "name": f"API Key: {key_doc.get('name')}",
        "role": "api",
        "email": None,
        "is_api_key": True,
        "api_key_id": key_doc["id"],
        "api_key_name": key_doc.get("name"),
        "tenant_id": key_doc.get("tenant_id"),
    }


# ============= ROUTES =============

@router.get("/available-endpoints")
async def list_available_endpoints(current_user: dict = Depends(get_current_user)):
    """Catalog of endpoints that can be granted to API keys."""
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="Only System Admin / CEO / Director can manage API keys")
    return AVAILABLE_ENDPOINTS


@router.get("")
async def list_api_keys(current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="Only System Admin / CEO / Director can manage API keys")
    tenant_id = get_current_tenant_id()
    docs = await db.api_keys.find({"tenant_id": tenant_id}, {"_id": 0, "key_hash": 0}).sort("created_at", -1).to_list(500)
    return [_serialize_for_list(d) for d in docs]


@router.post("")
async def create_api_key(payload: ApiKeyCreate, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="Only System Admin / CEO / Director can manage API keys")
    tenant_id = get_current_tenant_id()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not payload.allowed_endpoint_ids:
        raise HTTPException(status_code=400, detail="At least one allowed endpoint is required")

    # Reject duplicate names per tenant
    existing = await db.api_keys.find_one({"tenant_id": tenant_id, "name": name}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=400, detail=f"API key with name '{name}' already exists")

    allowed = _resolve_endpoints(payload.allowed_endpoint_ids)
    raw_key = _generate_key()
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": name,
        "key_prefix": _key_prefix(raw_key),
        "key_hash": _hash_key(raw_key),
        "allowed_endpoints": allowed,
        "is_active": True,
        "created_at": now,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name"),
        "last_used_at": None,
    }
    await db.api_keys.insert_one(dict(doc))
    return {
        **_serialize_for_list(doc),
        "key": raw_key,  # shown ONLY ONCE on creation
        "warning": "Copy this key now. It will not be shown again. Store it securely (env var) on the partner side.",
    }


@router.put("/{key_id}")
async def update_api_key(key_id: str, payload: ApiKeyUpdate, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="Only System Admin / CEO / Director can manage API keys")
    tenant_id = get_current_tenant_id()
    existing = await db.api_keys.find_one({"id": key_id, "tenant_id": tenant_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="API key not found")

    update = {}
    if payload.name is not None:
        nm = payload.name.strip()
        if not nm:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        # duplicate name check
        dup = await db.api_keys.find_one(
            {"tenant_id": tenant_id, "name": nm, "id": {"$ne": key_id}},
            {"_id": 0, "id": 1},
        )
        if dup:
            raise HTTPException(status_code=400, detail=f"API key with name '{nm}' already exists")
        update["name"] = nm
    if payload.allowed_endpoint_ids is not None:
        if not payload.allowed_endpoint_ids:
            raise HTTPException(status_code=400, detail="At least one allowed endpoint is required")
        update["allowed_endpoints"] = _resolve_endpoints(payload.allowed_endpoint_ids)
    if payload.is_active is not None:
        update["is_active"] = payload.is_active

    if update:
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        update["updated_by"] = current_user.get("id")
        await db.api_keys.update_one({"id": key_id, "tenant_id": tenant_id}, {"$set": update})

    refreshed = await db.api_keys.find_one({"id": key_id, "tenant_id": tenant_id}, {"_id": 0, "key_hash": 0})
    return _serialize_for_list(refreshed)


@router.delete("/{key_id}")
async def revoke_api_key(key_id: str, current_user: dict = Depends(get_current_user)):
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="Only System Admin / CEO / Director can manage API keys")
    tenant_id = get_current_tenant_id()
    result = await db.api_keys.delete_one({"id": key_id, "tenant_id": tenant_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"message": "API key revoked"}
