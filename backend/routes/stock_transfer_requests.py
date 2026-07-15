"""Stock Transfer Requests — request → approval → fulfillment workflow in front
of the existing stock transfer flow.

Flow (per user decisions, Jul 2026):
  • Requesters (roles granted `stock_transfer_requests.create` in Roles &
    Permissions settings) raise a request with DESTINATION + SKUs + quantities
    in base units. No batches, no source — the warehouse team handles those.
  • Approvers = anyone who can create stock transfers (`stock_transfers.create`
    permission, falling back to the transfer module's hardcoded role list).
  • On an approved request the warehouse initiates a normal transfer (existing
    flow, quantities editable, batches picked there). The transfer create
    endpoint links back via `request_id` and marks the request fulfilled.
  • Bell notifications: approvers on new request; requester on approve/reject/fulfil.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from database import db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from utils.notify import notify_users

router = APIRouter()

_ADMIN_ROLES = {"CEO", "Admin", "System Admin"}
# Mirrors the hardcoded nav role list for the Stock Transfers module.
_FALLBACK_TRANSFER_ROLES = {"CEO", "Director", "Vice President", "National Sales Head",
                            "Regional Sales Manager", "Admin", "System Admin"}

REQUESTS_LINK = "/distributor/stock-transfers?tab=requests"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _role_perm(tenant_id: str, role_name: str, module: str, action: str):
    """True/False when the role has an explicit entry for the module; None otherwise."""
    doc = await db.roles.find_one(
        {"tenant_id": tenant_id, "name": role_name}, {"_id": 0, "permissions": 1})
    if not doc:
        return None
    mod = (doc.get("permissions") or {}).get(module)
    if mod is None:
        return None
    return bool(mod.get(action))


async def _can_request(tenant_id: str, user: dict) -> bool:
    if user.get("role") in _ADMIN_ROLES:
        return True
    return bool(await _role_perm(tenant_id, user.get("role"), "stock_transfer_requests", "create"))


async def _can_approve(tenant_id: str, user: dict) -> bool:
    """Anyone who can currently create stock transfers."""
    role = user.get("role")
    if role in _ADMIN_ROLES:
        return True
    explicit = await _role_perm(tenant_id, role, "stock_transfers", "create")
    if explicit is not None:
        return explicit
    return role in _FALLBACK_TRANSFER_ROLES


async def _approver_user_ids(tenant_id: str) -> list:
    role_docs = await db.roles.find(
        {"tenant_id": tenant_id}, {"_id": 0, "name": 1, "permissions": 1}).to_list(300)
    explicit = {}
    for r in role_docs:
        mod = (r.get("permissions") or {}).get("stock_transfers")
        if mod is not None:
            explicit[r["name"]] = bool(mod.get("create"))
    allowed = set(_ADMIN_ROLES)
    allowed |= {n for n, ok in explicit.items() if ok}
    allowed |= {n for n in _FALLBACK_TRANSFER_ROLES if n not in explicit}
    users = await db.users.find(
        {"tenant_id": tenant_id, "role": {"$in": list(allowed)}}, {"_id": 0, "id": 1},
    ).to_list(500)
    return [u["id"] for u in users]


async def _next_request_number(tenant_id: str) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"STR-{year}-"
    n = await db.stock_transfer_requests.count_documents(
        {"tenant_id": tenant_id, "request_number": {"$regex": f"^{prefix}"}})
    return f"{prefix}{n + 1:04d}"


class RequestItem(BaseModel):
    sku_id: str
    sku_name: Optional[str] = None
    quantity_units: int = Field(..., gt=0, description="Requested quantity in base units")
    note: Optional[str] = None


class RequestCreate(BaseModel):
    dest_location_id: str
    items: List[RequestItem]
    reason: Optional[str] = None


class ActionIn(BaseModel):
    remark: Optional[str] = None


@router.get("/my-permissions")
async def my_permissions(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    return {
        "can_request": await _can_request(tenant_id, current_user),
        "can_approve": await _can_approve(tenant_id, current_user),
    }


@router.get("")
@router.get("/")
async def list_requests(
    status: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id}
    if status:
        q["status"] = status
    if not await _can_approve(tenant_id, current_user):
        q["requested_by"] = current_user["id"]
    rows = await db.stock_transfer_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    pending = await db.stock_transfer_requests.count_documents(
        {"tenant_id": tenant_id, "status": "pending"})
    return {"requests": rows, "pending_count": pending}


@router.post("")
@router.post("/")
async def create_request(payload: RequestCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if not await _can_request(tenant_id, current_user):
        raise HTTPException(403, "Your role is not allowed to raise stock transfer requests. "
                                 "Ask an admin to grant it under Settings → Roles & Permissions.")
    if not payload.items:
        raise HTTPException(400, "At least one SKU line is required.")
    dest = await db.distributor_locations.find_one(
        {"id": payload.dest_location_id, "tenant_id": tenant_id, "status": {"$ne": "inactive"}},
        {"_id": 0, "id": 1, "location_name": 1, "distributor_id": 1})
    if not dest:
        raise HTTPException(404, "Destination warehouse not found")

    sku_ids = list({it.sku_id for it in payload.items})
    sku_map = {s["id"]: s for s in await db.master_skus.find(
        {"id": {"$in": sku_ids}}, {"_id": 0, "id": 1, "sku_name": 1}).to_list(len(sku_ids) + 1)}
    for it in payload.items:
        if it.sku_id not in sku_map:
            raise HTTPException(400, f"SKU {it.sku_id} not found")
        it.sku_name = sku_map[it.sku_id].get("sku_name")

    now = _now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "request_number": await _next_request_number(tenant_id),
        "dest_location_id": dest["id"],
        "dest_location_name": dest.get("location_name"),
        "items": [it.dict() for it in payload.items],
        "reason": payload.reason or None,
        "status": "pending",
        "requested_by": current_user["id"],
        "requested_by_name": current_user.get("name") or current_user.get("email"),
        "created_at": now,
        "updated_at": now,
    }
    await db.stock_transfer_requests.insert_one(dict(doc))
    doc.pop("_id", None)

    items_summary = ", ".join(f"{it.sku_name} × {it.quantity_units}" for it in payload.items[:4])
    approvers = [uid for uid in await _approver_user_ids(tenant_id) if uid != current_user["id"]]
    await notify_users(
        tenant_id, approvers,
        title=f"Stock transfer request {doc['request_number']}",
        body=f"{doc['requested_by_name']} requested {items_summary} → {dest.get('location_name')}",
        link=REQUESTS_LINK, kind="approval", category="approval",
        entity_type="stock_transfer_request", entity_id=doc["id"],
    )
    return doc


async def _load_pending(tenant_id: str, request_id: str) -> dict:
    doc = await db.stock_transfer_requests.find_one(
        {"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    if doc.get("status") != "pending":
        raise HTTPException(400, f"Request is already {doc.get('status')}.")
    return doc


@router.post("/{request_id}/approve")
async def approve_request(request_id: str, payload: ActionIn,
                          current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if not await _can_approve(tenant_id, current_user):
        raise HTTPException(403, "You are not allowed to approve stock transfer requests.")
    doc = await _load_pending(tenant_id, request_id)
    now = _now_iso()
    await db.stock_transfer_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {"status": "approved", "approved_by": current_user["id"],
                  "approved_by_name": current_user.get("name") or current_user.get("email"),
                  "approved_at": now, "approval_remark": payload.remark or None,
                  "updated_at": now}})
    await notify_users(
        tenant_id, [doc["requested_by"]],
        title=f"Request {doc['request_number']} approved",
        body=f"Approved by {current_user.get('name') or current_user.get('email')}"
             + (f" — {payload.remark}" if payload.remark else ""),
        link=REQUESTS_LINK, kind="approval", category="approval",
        entity_type="stock_transfer_request", entity_id=request_id,
    )
    return {"message": "approved"}


@router.post("/{request_id}/reject")
async def reject_request(request_id: str, payload: ActionIn,
                         current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if not await _can_approve(tenant_id, current_user):
        raise HTTPException(403, "You are not allowed to reject stock transfer requests.")
    doc = await _load_pending(tenant_id, request_id)
    now = _now_iso()
    await db.stock_transfer_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {"status": "rejected", "rejected_by": current_user["id"],
                  "rejected_by_name": current_user.get("name") or current_user.get("email"),
                  "rejected_at": now, "rejection_remark": payload.remark or None,
                  "updated_at": now}})
    await notify_users(
        tenant_id, [doc["requested_by"]],
        title=f"Request {doc['request_number']} rejected",
        body=f"Rejected by {current_user.get('name') or current_user.get('email')}"
             + (f" — {payload.remark}" if payload.remark else ""),
        link=REQUESTS_LINK, kind="approval", category="approval",
        entity_type="stock_transfer_request", entity_id=request_id,
    )
    return {"message": "rejected"}


@router.post("/{request_id}/cancel")
async def cancel_request(request_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    doc = await _load_pending(tenant_id, request_id)
    if doc.get("requested_by") != current_user["id"] and current_user.get("role") not in _ADMIN_ROLES:
        raise HTTPException(403, "Only the requester can cancel this request.")
    now = _now_iso()
    await db.stock_transfer_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {"status": "cancelled", "cancelled_by": current_user["id"],
                  "cancelled_at": now, "updated_at": now}})
    return {"message": "cancelled"}


async def mark_request_fulfilled(tenant_id: str, request_id: str, transfer_doc: dict, user: dict):
    """Called by the transfer create endpoint after a transfer fulfils a request."""
    doc = await db.stock_transfer_requests.find_one(
        {"id": request_id, "tenant_id": tenant_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Linked stock transfer request not found")
    if doc.get("status") != "approved":
        raise HTTPException(400, f"Linked request is {doc.get('status')} — only approved requests can be fulfilled.")
    now = _now_iso()
    await db.stock_transfer_requests.update_one(
        {"id": request_id, "tenant_id": tenant_id},
        {"$set": {"status": "fulfilled", "transfer_id": transfer_doc.get("id"),
                  "transfer_number": transfer_doc.get("transfer_number"),
                  "fulfilled_by": user.get("id"),
                  "fulfilled_by_name": user.get("name") or user.get("email"),
                  "fulfilled_at": now, "updated_at": now}})
    await notify_users(
        tenant_id, [doc["requested_by"]],
        title=f"Request {doc['request_number']} fulfilled",
        body=f"Stock transfer {transfer_doc.get('transfer_number')} was created for your request.",
        link=REQUESTS_LINK, kind="approval", category="approval",
        entity_type="stock_transfer_request", entity_id=request_id,
    )
