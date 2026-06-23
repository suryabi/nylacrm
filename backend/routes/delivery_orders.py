"""Delivery Orders — promotional stock-out request module.

Accessible from Sales, Production and Distribution. A user raises a Delivery
Order against a Lead / Account / Contact / Employee, picks SKUs + their
Promotional Stock-Out packaging options and quantities, and submits it for
approval. The order follows a state-machine lifecycle (workflow_key
`delivery_orders`). On approval, a DRAFT promotional stock-out is auto-created
for the distributor that covers the delivery city.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from deps import get_current_user
from database import db
from core.tenant import get_current_tenant_id
from utils.sm_helpers import (
    ensure_default_delivery_order_sm, find_transition, find_transitions_from,
    find_state, get_initial_state, user_can_trigger, apply_auto_assign,
    evaluate_guards, evaluate_required_fields,
)
from routes.distributors import normalize_city, is_distributor_admin

logger = logging.getLogger(__name__)
router = APIRouter()

RECIPIENT_TYPES = ("lead", "account", "contact", "employee")


# ───────────────────────── models ─────────────────────────
class DeliveryOrderItem(BaseModel):
    sku_id: str
    sku_name: Optional[str] = None
    quantity: int
    unit_price: float = 0  # indicative value per unit
    packaging_type_id: Optional[str] = None
    packaging_type_name: Optional[str] = None
    units_per_package: Optional[int] = None


class DeliveryAddress(BaseModel):
    line1: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    formatted_address: Optional[str] = None


class DeliveryOrderCreate(BaseModel):
    recipient_type: str
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    employee_id: Optional[str] = None
    requested_date: Optional[str] = None
    reason: Optional[str] = None           # promo reason (required to fulfil)
    delivery_address: DeliveryAddress
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    delivery_instructions: Optional[str] = None
    notes: Optional[str] = None
    items: List[DeliveryOrderItem]


class DeliveryOrderUpdate(BaseModel):
    requested_date: Optional[str] = None
    reason: Optional[str] = None
    delivery_address: Optional[DeliveryAddress] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    delivery_instructions: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[List[DeliveryOrderItem]] = None


class TransitionRequest(BaseModel):
    action_key: str
    comment: Optional[str] = None
    field_data: Optional[dict] = None


# ───────────────────────── helpers ─────────────────────────
async def _next_order_number(tenant_id: str) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"DO-{year}-"
    count = await db.delivery_orders.count_documents(
        {"tenant_id": tenant_id, "order_number": {"$regex": f"^{prefix}"}})
    return f"{prefix}{count + 1:04d}"


async def _resolve_recipient(tenant_id: str, data) -> dict:
    """Snapshot recipient name/company/phone and a default delivery context."""
    rt = (data.recipient_type or "").lower()
    if rt not in RECIPIENT_TYPES:
        raise HTTPException(400, f"recipient_type must be one of {RECIPIENT_TYPES}")
    snap = {"recipient_type": rt, "recipient_name": None, "recipient_company": None,
            "recipient_phone": None, "recipient_email": None}
    if rt == "lead":
        if not data.lead_id:
            raise HTTPException(400, "lead_id is required")
        r = await db.leads.find_one({"id": data.lead_id, "tenant_id": tenant_id}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Lead not found")
        snap.update(recipient_name=r.get("contact_person") or r.get("name") or r.get("company"),
                    recipient_company=r.get("company"), recipient_phone=r.get("phone"),
                    recipient_email=r.get("email"))
    elif rt == "account":
        if not data.account_id:
            raise HTTPException(400, "account_id is required")
        r = await db.accounts.find_one({"id": data.account_id, "tenant_id": tenant_id}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Account not found")
        snap.update(recipient_name=r.get("name") or r.get("account_name"),
                    recipient_company=r.get("name") or r.get("account_name"),
                    recipient_phone=r.get("phone"), recipient_email=r.get("email"))
    elif rt == "contact":
        if not data.contact_id:
            raise HTTPException(400, "contact_id is required")
        r = await db.contacts.find_one({"id": data.contact_id, "tenant_id": tenant_id}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Contact not found")
        snap.update(recipient_name=r.get("name"), recipient_company=r.get("company"),
                    recipient_phone=r.get("phone"), recipient_email=r.get("email"))
    elif rt == "employee":
        if not data.employee_id:
            raise HTTPException(400, "employee_id is required")
        r = await db.users.find_one({"id": data.employee_id, "tenant_id": tenant_id}, {"_id": 0, "password": 0})
        if not r:
            raise HTTPException(404, "Employee not found")
        snap.update(recipient_name=r.get("name"), recipient_company=r.get("department"),
                    recipient_phone=r.get("phone"), recipient_email=r.get("email"))
    return snap


def _doc_total(items: List[DeliveryOrderItem]) -> float:
    return round(sum((i.quantity or 0) * (i.unit_price or 0) for i in items), 2)


async def _create_approval_task(tenant_id: str, order: dict, requester: dict):
    """Raise a task for the requester's reporting manager (approval-by-manager
    leg of the 'both' approval model). Best-effort — never blocks submission."""
    try:
        tdb_users = db.users
        approver = None
        mgr_id = requester.get("reporting_manager_id") or requester.get("manager_id")
        if mgr_id:
            approver = await tdb_users.find_one({"id": mgr_id, "tenant_id": tenant_id}, {"_id": 0, "id": 1, "name": 1})
        if not approver:
            return
        now = datetime.now(timezone.utc).isoformat()
        await db.tasks.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "title": f"Approve Delivery Order {order['order_number']}",
            "description": f"{requester.get('name', 'A team member')} raised delivery order "
                           f"{order['order_number']} for {order.get('recipient_name') or 'a recipient'} "
                           f"(₹{order.get('total_value', 0):,.0f}). Review and approve/reject.",
            "status": "open",
            "priority": "high",
            "assignees": [approver["id"]],
            "assignees_data": [{"id": approver["id"], "name": approver.get("name", "")}],
            "watchers": [requester["id"], approver["id"]],
            "related_type": "delivery_order",
            "related_id": order["id"],
            "created_by": requester["id"],
            "created_at": now,
            "updated_at": now,
        })
    except Exception:
        logger.exception("Failed to create delivery-order approval task")


async def _resolve_distributor_for_city(tenant_id: str, city: Optional[str]):
    """Find the distributor whose operating coverage includes `city`
    (alias-aware), then pick a sensible source location."""
    if not city:
        return None, None, "No delivery city on the order."
    target = normalize_city(city)
    cov_rows = await db.distributor_operating_coverage.find(
        {"tenant_id": tenant_id}, {"_id": 0, "distributor_id": 1, "city": 1}).to_list(2000)
    dist_id = None
    for c in cov_rows:
        if normalize_city(c.get("city")) == target:
            dist_id = c.get("distributor_id")
            break
    if not dist_id:
        return None, None, f"No distributor covers '{city}'."
    # prefer a non-factory active location in the same city, else first active non-factory
    locs = await db.distributor_locations.find(
        {"tenant_id": tenant_id, "distributor_id": dist_id}, {"_id": 0}).to_list(200)
    active = [l for l in locs if (l.get("status") or "active") == "active" and not l.get("is_factory")]
    chosen = next((l for l in active if normalize_city(l.get("city")) == target), None) \
        or (active[0] if active else (locs[0] if locs else None))
    if not chosen:
        return dist_id, None, "Distributor has no location to dispatch from."
    return dist_id, chosen["id"], None


async def _pick_distributor_location(tenant_id: str, dist_id: str, city: Optional[str]):
    """Pick a sensible non-factory active location for a distributor, preferring
    one in `city`."""
    locs = await db.distributor_locations.find(
        {"tenant_id": tenant_id, "distributor_id": dist_id}, {"_id": 0}).to_list(200)
    active = [l for l in locs if (l.get("status") or "active") == "active" and not l.get("is_factory")]
    target = normalize_city(city) if city else None
    chosen = (next((l for l in active if target and normalize_city(l.get("city")) == target), None)
              or (active[0] if active else (locs[0] if locs else None)))
    return chosen["id"] if chosen else None


async def _resolve_distributor_for_order(tenant_id: str, order: dict):
    """Resolve the servicing distributor + location for a delivery order.

    Priority: (1) if the recipient is an Account with an active distributor
    assignment, use the assigned distributor (primary first) + its location;
    (2) otherwise fall back to matching the delivery city against distributor
    operating coverage."""
    city = (order.get("delivery_address") or {}).get("city") or order.get("delivery_city")
    if order.get("recipient_type") == "account" and order.get("account_id"):
        assigns = await db.account_distributor_assignments.find(
            {"tenant_id": tenant_id, "account_id": order["account_id"]}, {"_id": 0}).to_list(50)
        active = [a for a in assigns if (a.get("status") or "active") == "active"]
        active.sort(key=lambda a: (not a.get("is_primary", False)))  # primary first
        if active:
            a = active[0]
            dist_id = a.get("distributor_id")
            loc_id = a.get("distributor_location_id") or await _pick_distributor_location(
                tenant_id, dist_id, a.get("servicing_city") or city)
            if dist_id and loc_id:
                return dist_id, loc_id, None
            if dist_id and not loc_id:
                return dist_id, None, "Assigned distributor has no location to dispatch from."
    return await _resolve_distributor_for_city(tenant_id, city)


async def _auto_create_draft_promo(tenant_id: str, order: dict, current_user: dict) -> dict:
    """On approval, create a DRAFT promotional stock-out for the distributor
    that covers the delivery city. Best-effort; returns a status dict."""
    from routes.promo_dispatch import create_promo_dispatch
    from models.distributor import PromoDeliveryCreate, PromoDeliveryItemCreate

    city = (order.get("delivery_address") or {}).get("city")
    dist_id, loc_id, err = await _resolve_distributor_for_order(tenant_id, order)
    if err or not loc_id:
        return {"status": "failed", "error": err or "Could not resolve a distributor location."}

    # Recipient mapping → promo supports contact/lead/employee. For an account,
    # use its first linked contact.
    rt = order.get("recipient_type")
    lead_id = order.get("lead_id")
    contact_id = order.get("contact_id")
    employee_id = order.get("employee_id")
    if rt == "account":
        c = await db.contacts.find_one(
            {"tenant_id": tenant_id, "account_id": order.get("account_id")}, {"_id": 0, "id": 1})
        if not c:
            return {"status": "failed", "error": "Account has no linked contact to receive a promo stock-out. "
                                                  "Add a contact to the account, or fulfil manually."}
        rt, contact_id = "contact", c["id"]

    reason = order.get("reason")
    if not reason:
        rdoc = await db.promo_reasons.find_one({"tenant_id": tenant_id, "is_active": True}, {"_id": 0, "name": 1})
        reason = (rdoc or {}).get("name")
    if not reason:
        return {"status": "failed", "error": "No promotional reason available. Configure one in Admin → Promo Reasons."}

    items = [PromoDeliveryItemCreate(
        sku_id=i["sku_id"], sku_name=i.get("sku_name"), quantity=i["quantity"],
        unit_price=i.get("unit_price", 0), packaging_type_id=i.get("packaging_type_id"),
        packaging_type_name=i.get("packaging_type_name"), units_per_package=i.get("units_per_package"),
    ) for i in order.get("items", [])]

    payload = PromoDeliveryCreate(
        distributor_location_id=loc_id, recipient_type=rt, lead_id=lead_id,
        contact_id=contact_id, employee_id=employee_id,
        delivery_date=order.get("requested_date") or datetime.now(timezone.utc).date().isoformat(),
        reason=reason, delivery_address=(order.get("delivery_address") or {}).get("formatted_address"),
        remarks=f"Auto-created from Delivery Order {order['order_number']}.",
        items=items, as_draft=True,
    )
    try:
        res = await create_promo_dispatch(dist_id, payload, current_user)
        d = res.get("dispatch") or {}
        dist = await db.distributors.find_one({"id": dist_id, "tenant_id": tenant_id}, {"_id": 0, "distributor_name": 1, "name": 1})
        return {"status": "created", "distributor_id": dist_id,
                "distributor_name": (dist or {}).get("distributor_name") or (dist or {}).get("name"),
                "promo_id": d.get("id"), "challan_number": d.get("challan_number"),
                "promo_status": d.get("status") or "draft"}
    except HTTPException as exc:
        return {"status": "failed", "error": f"{exc.detail}"}
    except Exception as exc:
        logger.exception("Auto-create draft promo failed")
        return {"status": "failed", "error": str(exc)[:300]}


def _public(order: dict) -> dict:
    order.pop("_id", None)
    return order


# ───────────────────────── endpoints ─────────────────────────
@router.post("/delivery-orders")
async def create_delivery_order(data: DeliveryOrderCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    if not data.items:
        raise HTTPException(400, "At least one line item is required.")
    if not data.requested_date:
        raise HTTPException(400, "Delivery date is required.")
    for it in data.items:
        if not it.quantity or it.quantity <= 0:
            raise HTTPException(400, "Quantity must be greater than zero for every line.")
    sm = await ensure_default_delivery_order_sm(tenant_id)
    initial = get_initial_state(sm)
    snap = await _resolve_recipient(tenant_id, data)
    now = datetime.now(timezone.utc).isoformat()
    order = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "order_number": await _next_order_number(tenant_id),
        "recipient_type": snap["recipient_type"],
        "lead_id": data.lead_id, "account_id": data.account_id,
        "contact_id": data.contact_id, "employee_id": data.employee_id,
        "recipient_name": snap["recipient_name"], "recipient_company": snap["recipient_company"],
        "recipient_phone": snap["recipient_phone"], "recipient_email": snap["recipient_email"],
        "requested_date": data.requested_date,
        "reason": data.reason,
        "delivery_address": data.delivery_address.model_dump(),
        "delivery_city": data.delivery_address.city,
        "contact_name": data.contact_name or snap["recipient_name"],
        "contact_phone": data.contact_phone or snap["recipient_phone"],
        "delivery_instructions": data.delivery_instructions,
        "notes": data.notes,
        "items": [i.model_dump() for i in data.items],
        "total_value": _doc_total(data.items),
        "current_state_key": initial["key"],
        "current_state_label": initial.get("label") or initial["key"],
        "current_state_color": initial.get("color") or "#94a3b8",
        "fulfillment_status": None,
        "status_history": [{
            "state_key": initial["key"], "state_label": initial.get("label") or initial["key"],
            "state_color": initial.get("color"), "entered_at": now,
            "by_user_id": current_user.get("id"), "by_user_name": current_user.get("name"),
        }],
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("name") or current_user.get("email"),
        "created_at": now, "updated_at": now,
    }
    await db.delivery_orders.insert_one(order)
    return _public(order)


@router.get("/delivery-orders")
async def list_delivery_orders(
    state_key: Optional[str] = Query(None),
    recipient_type: Optional[str] = Query(None),
    lead_id: Optional[str] = Query(None),
    account_id: Optional[str] = Query(None),
    mine: bool = Query(False),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    tenant_id = get_current_tenant_id()
    await ensure_default_delivery_order_sm(tenant_id)
    q = {"tenant_id": tenant_id}
    if state_key:
        q["current_state_key"] = state_key
    if recipient_type:
        q["recipient_type"] = recipient_type
    if lead_id:
        q["lead_id"] = lead_id
    if account_id:
        q["account_id"] = account_id
    if mine:
        q["created_by"] = current_user.get("id")
    if search:
        q["$or"] = [
            {"order_number": {"$regex": search, "$options": "i"}},
            {"recipient_name": {"$regex": search, "$options": "i"}},
            {"delivery_city": {"$regex": search, "$options": "i"}},
        ]
    rows = await db.delivery_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"orders": rows, "total": len(rows)}


@router.get("/delivery-orders/counts")
async def delivery_order_counts(current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    sm = await ensure_default_delivery_order_sm(tenant_id)
    state_keys = [s["key"] for s in (sm.get("states") or [])]
    agg = db.delivery_orders.aggregate([
        {"$match": {"tenant_id": tenant_id}},
        {"$group": {"_id": "$current_state_key", "n": {"$sum": 1}}},
    ])
    by_state = {s: 0 for s in state_keys}
    async for r in agg:
        by_state[r["_id"]] = r["n"]
    return {"counts": by_state}


@router.get("/delivery-orders/{order_id}")
async def get_delivery_order(order_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    order = await db.delivery_orders.find_one({"id": order_id, "tenant_id": tenant_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Delivery order not found")
    # Mirror the linked promo stock-out's live fulfillment status (read-only).
    if order.get("promo_dispatch_id"):
        promo = await db.distributor_deliveries.find_one(
            {"id": order["promo_dispatch_id"], "tenant_id": tenant_id},
            {"_id": 0, "status": 1, "challan_number": 1, "delivery_number": 1})
        if promo:
            live = promo.get("status")
            if live and live != order.get("fulfillment_status"):
                await db.delivery_orders.update_one(
                    {"id": order_id, "tenant_id": tenant_id}, {"$set": {"fulfillment_status": live}})
                order["fulfillment_status"] = live
            if not order.get("promo_challan_number"):
                order["promo_challan_number"] = promo.get("challan_number") or promo.get("delivery_number")
    return order


@router.put("/delivery-orders/{order_id}")
async def update_delivery_order(order_id: str, data: DeliveryOrderUpdate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    order = await db.delivery_orders.find_one({"id": order_id, "tenant_id": tenant_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Delivery order not found")
    state = order.get("current_state_key")
    upd = data.model_dump(exclude_unset=True)
    is_owner_or_admin = order.get("created_by") == current_user.get("id") or is_distributor_admin(current_user)
    # After approval the requester/admin may set ONLY the requested delivery date.
    if state == "approved":
        if set(upd.keys()) - {"requested_date"}:
            raise HTTPException(400, "An approved order can only have its delivery date set.")
        if not is_owner_or_admin:
            raise HTTPException(403, "Only the requester or an admin can set the delivery date.")
        upd["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.delivery_orders.update_one({"id": order_id, "tenant_id": tenant_id}, {"$set": upd})
        return await db.delivery_orders.find_one({"id": order_id, "tenant_id": tenant_id}, {"_id": 0})
    if state != "draft":
        raise HTTPException(400, "Only a draft delivery order can be edited.")
    if not is_owner_or_admin:
        raise HTTPException(403, "Only the requester or an admin can edit this order.")
    if "items" in upd and upd["items"] is not None:
        if not upd["items"]:
            raise HTTPException(400, "At least one line item is required.")
        upd["total_value"] = round(sum((i.get("quantity") or 0) * (i.get("unit_price") or 0) for i in upd["items"]), 2)
    if "delivery_address" in upd and upd["delivery_address"] is not None:
        upd["delivery_city"] = upd["delivery_address"].get("city")
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.delivery_orders.update_one({"id": order_id, "tenant_id": tenant_id}, {"$set": upd})
    return await db.delivery_orders.find_one({"id": order_id, "tenant_id": tenant_id}, {"_id": 0})


@router.delete("/delivery-orders/{order_id}")
async def delete_delivery_order(order_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    order = await db.delivery_orders.find_one({"id": order_id, "tenant_id": tenant_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Delivery order not found")
    if order.get("current_state_key") != "draft":
        raise HTTPException(400, "Only a draft delivery order can be deleted.")
    if order.get("created_by") != current_user.get("id") and not is_distributor_admin(current_user):
        raise HTTPException(403, "Only the requester or an admin can delete this order.")
    await db.delivery_orders.delete_one({"id": order_id, "tenant_id": tenant_id})
    return {"ok": True}


@router.get("/delivery-orders/{order_id}/available-transitions")
async def available_transitions(order_id: str, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    order = await db.delivery_orders.find_one({"id": order_id, "tenant_id": tenant_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Delivery order not found")
    sm = await ensure_default_delivery_order_sm(tenant_id)
    out = []
    for t in find_transitions_from(sm, order.get("current_state_key") or ""):
        if not await user_can_trigger(t, current_user, tenant_id, order.get("created_by")):
            continue
        target = find_state(sm, t.get("to_state") or "")
        out.append({
            "action_key": t.get("action_key"),
            "action_label": t.get("action_label") or t.get("action_key"),
            "to_state": t.get("to_state"),
            "to_state_label": (target or {}).get("label") or t.get("to_state"),
            "comment_required": bool(t.get("comment_required")),
            "kind": next((a.get("kind") for a in (sm.get("actions") or []) if a.get("key") == t.get("action_key")), "neutral"),
        })
    return {"current_state_key": order.get("current_state_key"), "transitions": out}


@router.post("/delivery-orders/{order_id}/transition")
async def trigger_transition(order_id: str, payload: TransitionRequest, current_user: dict = Depends(get_current_user)):
    tenant_id = get_current_tenant_id()
    order = await db.delivery_orders.find_one({"id": order_id, "tenant_id": tenant_id}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Delivery order not found")
    sm = await ensure_default_delivery_order_sm(tenant_id)
    current_key = order.get("current_state_key") or ""
    transition = find_transition(sm, current_key, payload.action_key)
    if not transition:
        raise HTTPException(400, f"No transition for '{payload.action_key}' from '{current_key}'.")
    if not await user_can_trigger(transition, current_user, tenant_id, order.get("created_by")):
        raise HTTPException(403, "You don't have permission to trigger this action.")
    if transition.get("comment_required") and not (payload.comment and payload.comment.strip()):
        raise HTTPException(400, "A comment is required for this action.")
    ok, reasons = evaluate_guards(transition.get("guards"), order)
    if not ok:
        raise HTTPException(400, " ".join(reasons) or "Blocked by a workflow rule.")
    fok, ferrors, captured = evaluate_required_fields(transition.get("required_fields"), order, payload.field_data)
    if not fok:
        raise HTTPException(400, " ".join(ferrors) or "Required information is missing.")
    target = find_state(sm, transition.get("to_state") or "")
    if not target:
        raise HTTPException(400, "Target state not found.")

    now = datetime.now(timezone.utc).isoformat()
    set_doc = {
        "current_state_key": target["key"],
        "current_state_label": target.get("label") or target["key"],
        "current_state_color": target.get("color"),
        "updated_at": now,
    }

    history = {
        "state_key": target["key"], "state_label": target.get("label") or target["key"],
        "state_color": target.get("color"), "entered_at": now,
        "by_user_id": current_user.get("id"), "by_user_name": current_user.get("name"),
        "comment": payload.comment,
    }
    await db.delivery_orders.update_one(
        {"id": order_id, "tenant_id": tenant_id},
        {"$set": set_doc, "$push": {"status_history": history}})

    # Approval-by-manager task on submit (the 'both' model).
    if target["key"] == "pending_approval":
        requester = await db.users.find_one({"id": order.get("created_by"), "tenant_id": tenant_id}, {"_id": 0})
        if requester:
            await _create_approval_task(tenant_id, {**order, **set_doc}, requester)

    # Placing the order auto-creates a DRAFT promotional stock-out at the
    # servicing distributor (account assignment first, else delivery-city coverage).
    promo_result = None
    if payload.action_key == "place_order":
        promo_result = await _auto_create_draft_promo(tenant_id, {**order, **set_doc}, current_user)
        if promo_result.get("status") == "created":
            await db.delivery_orders.update_one(
                {"id": order_id, "tenant_id": tenant_id},
                {"$set": {
                    "promo_dispatch_id": promo_result.get("promo_id"),
                    "promo_challan_number": promo_result.get("challan_number"),
                    "promo_distributor_id": promo_result.get("distributor_id"),
                    "promo_distributor_name": promo_result.get("distributor_name"),
                    "fulfillment_status": promo_result.get("promo_status") or "draft",
                    "updated_at": now,
                }})

    updated = await db.delivery_orders.find_one({"id": order_id, "tenant_id": tenant_id}, {"_id": 0})
    return {"ok": True, "order": updated, "promo": promo_result}



# ───────────────────── Migration: Free Trial expenses → Delivery Orders ─────────────────────
_MIGRATION_ROLES = {"CEO", "Director", "Vice President", "Admin", "System Admin"}


@router.get("/admin/migrate-free-trial-expenses/preview")
async def preview_free_trial_migration(current_user: dict = Depends(get_current_user)):
    """Count how many lead/account Free Trial expense requests are eligible to
    migrate into Delivery Orders for the current tenant (non-destructive)."""
    if current_user.get("role") not in _MIGRATION_ROLES:
        raise HTTPException(403, "Only CEO/Director/Admin can run this migration.")
    tenant_id = get_current_tenant_id()
    eligible = already = no_items = not_in_tenant = 0
    async for exp in db.expense_requests.find(
            {"entity_type": {"$in": ["lead", "account"]}, "expense_type": "free_trial"}):
        if exp.get("migrated_to_delivery_order_id"):
            already += 1
            continue
        if not (exp.get("sku_items") or []):
            no_items += 1
            continue
        et, eid = exp.get("entity_type"), exp.get("entity_id")
        if et == "lead":
            ent = await db.leads.find_one({"id": eid, "tenant_id": tenant_id}, {"_id": 0, "id": 1})
        else:
            ent = await db.accounts.find_one(
                {"$or": [{"id": eid}, {"account_id": eid}], "tenant_id": tenant_id}, {"_id": 0, "id": 1})
        if not ent:
            not_in_tenant += 1
            continue
        eligible += 1
    return {"eligible": eligible, "already_migrated": already,
            "skipped_no_items": no_items, "skipped_not_in_tenant": not_in_tenant}


@router.post("/admin/migrate-free-trial-expenses")
async def migrate_free_trial_expenses(current_user: dict = Depends(get_current_user)):
    """One-time, idempotent migration: convert lead/account **Free Trial** expense
    requests (which carry SKU stock) into Delivery Orders. Monetary expense types
    are intentionally left untouched. Safe to re-run."""
    if current_user.get("role") not in _MIGRATION_ROLES:
        raise HTTPException(403, "Only CEO/Director/Admin can run this migration.")
    tenant_id = get_current_tenant_id()
    sm = await ensure_default_delivery_order_sm(tenant_id)
    state_meta = {s["key"]: s for s in (sm.get("states") or [])}
    created = 0
    skipped: List[dict] = []
    async for exp in db.expense_requests.find(
            {"entity_type": {"$in": ["lead", "account"]}, "expense_type": "free_trial"}):
        if exp.get("migrated_to_delivery_order_id"):
            skipped.append({"id": exp.get("id"), "reason": "already migrated"})
            continue
        sku_items = exp.get("sku_items") or []
        if not sku_items:
            skipped.append({"id": exp.get("id"), "reason": "no SKU items"})
            continue
        et, eid = exp.get("entity_type"), exp.get("entity_id")
        if et == "lead":
            ent = await db.leads.find_one({"id": eid, "tenant_id": tenant_id}, {"_id": 0})
        else:
            ent = await db.accounts.find_one(
                {"$or": [{"id": eid}, {"account_id": eid}], "tenant_id": tenant_id}, {"_id": 0})
        if not ent:
            skipped.append({"id": exp.get("id"), "reason": f"{et} not in this tenant"})
            continue
        if et == "lead":
            rname = ent.get("contact_person") or ent.get("name") or ent.get("company")
            rcompany, rphone, remail = ent.get("company"), ent.get("phone"), ent.get("email")
            lead_id, account_id = ent["id"], None
        else:
            rname = ent.get("account_name") or ent.get("name")
            rcompany, rphone, remail = rname, ent.get("contact_number") or ent.get("phone"), ent.get("email")
            lead_id, account_id = None, ent.get("id")
        city = exp.get("entity_city") or ent.get("city")
        items = [{
            "sku_id": s.get("sku_id"), "sku_name": s.get("sku_name"),
            "quantity": int(s.get("quantity") or 0), "unit_price": float(s.get("minimum_landing_price") or 0),
            "packaging_type_id": None, "packaging_type_name": None, "units_per_package": None,
        } for s in sku_items]
        d = exp.get("approval_date") or exp.get("created_at")
        req_date = str(d)[:10] if d else None
        st = exp.get("status") or "draft"
        if st not in state_meta:
            st = "draft"
        meta = state_meta.get(st) or state_meta.get("draft") or {}
        days = exp.get("free_trial_days")
        now = datetime.now(timezone.utc).isoformat()
        order = {
            "id": str(uuid.uuid4()), "tenant_id": tenant_id,
            "order_number": await _next_order_number(tenant_id),
            "recipient_type": et, "lead_id": lead_id, "account_id": account_id,
            "contact_id": None, "employee_id": None,
            "recipient_name": rname, "recipient_company": rcompany,
            "recipient_phone": rphone, "recipient_email": remail,
            "requested_date": req_date,
            "reason": f"Free Trial ({days} days)" if days else "Free Trial",
            "delivery_address": {"line1": None, "city": city, "state": None, "pincode": None,
                                 "lat": None, "lng": None, "formatted_address": None},
            "delivery_city": city,
            "contact_name": rname, "contact_phone": rphone, "delivery_instructions": None,
            "notes": f"Migrated from Free Trial expense request {exp.get('id')}."
                     + (f" {exp.get('description')}" if exp.get('description') else ""),
            "items": items,
            "total_value": round(sum(i["quantity"] * i["unit_price"] for i in items), 2),
            "current_state_key": st, "current_state_label": meta.get("label") or st,
            "current_state_color": meta.get("color") or "#94a3b8",
            "fulfillment_status": None,
            "status_history": [{
                "state_key": st, "state_label": meta.get("label") or st, "state_color": meta.get("color"),
                "entered_at": now, "by_user_id": exp.get("user_id"), "by_user_name": exp.get("user_name"),
                "comment": "Migrated from Free Trial expense request.",
            }],
            "created_by": exp.get("user_id"), "created_by_name": exp.get("user_name"),
            "created_at": exp.get("created_at") or now, "updated_at": now,
            "migrated_from_expense_id": exp.get("id"),
        }
        await db.delivery_orders.insert_one(order)
        await db.expense_requests.update_one(
            {"id": exp.get("id")},
            {"$set": {"migrated_to_delivery_order_id": order["id"], "migrated_at": now}})
        created += 1
    return {"created": created, "skipped": skipped, "skipped_count": len(skipped)}
