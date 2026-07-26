"""Universal admin bulk-delete endpoint.

Admins can delete many rows from a whitelisted collection with a single call.
The endpoint is intentionally narrow: only known collections are allowed,
every query is tenant-scoped, and only the id field is used for matching.

Route: POST /api/admin/bulk-delete
Body : {"collection": "leads", "ids": ["...", "..."]}
Role : admin-only (CEO / Admin / Director / System Admin)
"""
import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from core.tenant import get_current_tenant_id
from deps import get_current_user

router = APIRouter(prefix="/admin", tags=["Admin · Bulk"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _client[os.environ["DB_NAME"]]

# Map API-friendly collection keys → actual MongoDB collection names.
# Only whitelisted keys can be bulk-deleted from.
COLLECTIONS = {
    "leads": "leads",
    "accounts": "accounts",
    "contacts": "contacts",
    "users": "users",
    "distributors": "distributors",
    "master_skus": "master_skus",
    "complaints": "customer_complaints",
    "business_categories": "business_categories",
    "contact_categories": "contact_categories",
    "lead_statuses": "lead_statuses",
    "master_territories": "master_territories",
    "master_states": "master_states",
    "master_cities": "master_cities",
}

# These master collections are shared across tenants — do NOT scope by tenant_id.
GLOBAL_COLLECTIONS = {
    "master_skus",
    "business_categories",
    "lead_statuses",
    "master_territories",
    "master_states",
    "master_cities",
}

ADMIN_ROLES = {"ceo", "admin", "system admin", "system_admin", "director", "tenant_admin"}


class BulkDeleteBody(BaseModel):
    collection: str = Field(..., min_length=1)
    ids: List[str] = Field(..., min_length=1)


def _is_admin(user: dict) -> bool:
    return (user.get("role") or "").strip().lower() in ADMIN_ROLES


@router.post("/bulk-delete")
async def bulk_delete(body: BulkDeleteBody, current_user: dict = Depends(get_current_user)):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can bulk-delete")
    coll_name = COLLECTIONS.get(body.collection)
    if not coll_name:
        raise HTTPException(status_code=400, detail=f"Unsupported collection: {body.collection}")
    if len(body.ids) > 500:
        raise HTTPException(status_code=400, detail="Cannot delete more than 500 rows at once")

    tenant_id = get_current_tenant_id()

    # Self-safety for users: never let an admin delete their own account here.
    if body.collection == "users":
        my_id = current_user.get("id")
        if my_id and my_id in body.ids:
            raise HTTPException(status_code=400, detail="You cannot delete your own user account")

    query = {"id": {"$in": body.ids}}
    if body.collection not in GLOBAL_COLLECTIONS:
        query["tenant_id"] = tenant_id

    result = await _db[coll_name].delete_many(query)
    return {"deleted": result.deleted_count, "requested": len(body.ids)}
