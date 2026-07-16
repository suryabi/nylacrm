"""Retrospective categorization of Generic transaction lines into customer-specific
child SKUs — for Stock In (shipments), Stock Transfers and Stock Out (deliveries).

Rules (per user decisions, Jul 2026):
  • Only Generic (unclassified) lines can be categorized, into ACTIVE customer-type
    child SKUs of the same parent SKU. For deliveries the child must be branded
    for the delivery's account.
  • Partial quantities allowed — the line splits into two lines with amounts
    prorated; transaction totals, quantities and movement history are preserved.
  • Stock effect: delivered Stock In / completed Transfers move whatever Generic
    qty is still on hand at the DESTINATION warehouse into the child bucket
    (capped at what's available, batch-aware), recorded as a Branding Entry
    (BRD- audit trail). Stock Out relabels only (stock already left the network).
  • Roles: CEO / Admin / System Admin.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import db, get_tenant_db
from core.tenant import get_current_tenant_id
from deps import get_current_user
from .branding_entries import _next_entry_number, _load_location, _stock_coll_and_base

router = APIRouter()

ALLOWED_ROLES = ("CEO", "Admin", "System Admin")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_role(user: dict):
    if user.get("role") not in ALLOWED_ROLES:
        raise HTTPException(403, "Only CEO / Admin can retrospectively categorize transactions.")


async def _resolve_customer_child(tenant_id: str, child_sku_id: str, sku_id: str,
                                  account_id: Optional[str] = None) -> dict:
    child = await db.child_skus.find_one(
        {"id": child_sku_id, "tenant_id": tenant_id}, {"_id": 0})
    if not child:
        raise HTTPException(404, "Child SKU not found")
    if child.get("parent_sku_id") != sku_id:
        raise HTTPException(400, f"Child SKU '{child.get('child_sku_name')}' does not belong to this line's parent SKU.")
    if child.get("is_active") is False:
        raise HTTPException(400, f"Child SKU '{child.get('child_sku_name')}' is inactive.")
    if child.get("child_type") != "customer":
        raise HTTPException(400, "Only customer-specific child SKUs can be used for retrospective categorization.")
    if account_id and child.get("customer_account_id") != account_id:
        raise HTTPException(
            400,
            f"Child SKU '{child.get('child_sku_name')}' is branded for a different customer than this delivery's account.",
        )
    return child


def _audit_fields(user: dict) -> dict:
    return {
        "retro_categorized": True,
        "retro_categorized_at": _now_iso(),
        "retro_categorized_by": user.get("id"),
        "retro_categorized_by_name": user.get("name") or user.get("email"),
    }


def _validate_qty(qty: Optional[int], line_units: int, packaging_units: Optional[int]) -> int:
    """Normalise/validate the categorization quantity (base units). None = full line."""
    if qty is None:
        return line_units
    qty = int(qty)
    if qty <= 0 or qty > line_units:
        raise HTTPException(400, f"Quantity must be between 1 and {line_units} units.")
    upp = int(packaging_units or 1)
    if qty != line_units and upp > 1 and qty % upp != 0:
        raise HTTPException(400, f"Quantity must be a multiple of the line's package size ({upp} units).")
    return qty


async def _move_generic_to_child(tenant_id: str, user: dict, location_id: str, sku_id: str,
                                 child: dict, qty_units: int, batch_id: Optional[str],
                                 note: str):
    """Move up to qty_units of Generic on-hand stock at a warehouse into the child
    bucket (batch-restricted when the line carries a batch, else FIFO). Capped at
    what's still available. Writes a Branding Entry for audit when anything moved.
    Returns (moved_units, entry_number|None)."""
    loc = await _load_location(tenant_id, location_id)
    coll, base = _stock_coll_and_base(loc, tenant_id)
    from_q = {**base, "sku_id": sku_id, "child_sku_id": {"$in": [None]}, "quantity": {"$gt": 0}}
    if batch_id:
        from_q["batch_id"] = batch_id
    from_rows = await coll.find(from_q, {"_id": 0}).sort("created_at", 1).to_list(500)

    now = _now_iso()
    remaining = qty_units
    moves = []
    for r in from_rows:
        if remaining <= 0:
            break
        take = min(remaining, int(r.get("quantity") or 0))
        if take <= 0:
            continue
        remaining -= take
        row_batch = r.get("batch_id")
        await coll.update_one(
            {**base, "sku_id": sku_id,
             "batch_id": row_batch if row_batch else {"$in": [None]},
             "child_sku_id": {"$in": [None]}},
            {"$inc": {"quantity": -take}, "$set": {"updated_at": now}},
        )
        to_key = {**base, "sku_id": sku_id,
                  "batch_id": row_batch if row_batch else {"$in": [None]},
                  "child_sku_id": child["id"]}
        on_insert = {k: v for k, v in r.items()
                     if k not in ("quantity", "updated_at", "child_sku_id", "child_sku_name", "child_sku_code", "id")}
        on_insert.update({
            "id": str(uuid.uuid4()),
            "child_sku_id": child["id"],
            "child_sku_name": child.get("child_sku_name"),
            "child_sku_code": child.get("child_sku_code"),
            "created_at": now,
        })
        await coll.update_one(
            to_key,
            {"$inc": {"quantity": take}, "$setOnInsert": on_insert, "$set": {"updated_at": now}},
            upsert=True,
        )
        moves.append({"batch_id": row_batch, "batch_code": r.get("batch_code"), "quantity": take})

    moved = qty_units - remaining
    if moved <= 0:
        return 0, None

    sku = await db.master_skus.find_one({"id": sku_id}, {"_id": 0, "sku_name": 1})
    entry = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "entry_number": await _next_entry_number(tenant_id),
        "warehouse_location_id": location_id,
        "warehouse_name": loc.get("location_name"),
        "is_factory": bool(loc.get("is_factory")),
        "sku_id": sku_id,
        "sku_name": (sku or {}).get("sku_name"),
        "from_child_sku_id": None,
        "from_child_sku_name": None,
        "to_child_sku_id": child["id"],
        "to_child_sku_name": child.get("child_sku_name"),
        "quantity": moved,
        "moves": moves,
        "notes": note,
        "source": "retro_categorization",
        "created_by": user.get("id"),
        "created_by_name": user.get("name") or user.get("email"),
        "created_at": now,
    }
    await db.branding_entries.insert_one(dict(entry))
    return moved, entry["entry_number"]


@router.get("/eligible-children")
async def eligible_children(
    sku_id: str = Query(...),
    account_id: Optional[str] = Query(None),
    distributor_id: Optional[str] = Query(
        None,
        description="Destination distributor — when set (and no account_id), children are "
                    "filtered to accounts ASSIGNED to this distributor."),
    current_user: dict = Depends(get_current_user),
):
    """Active customer-type child SKUs for a parent SKU, scoped to one account
    (deliveries) or to the destination distributor's assigned accounts
    (stock in / transfers)."""
    _ = current_user
    tenant_id = get_current_tenant_id()
    q = {"tenant_id": tenant_id, "parent_sku_id": sku_id, "child_type": "customer",
         "is_active": {"$ne": False}}
    if account_id:
        q["customer_account_id"] = account_id
    rows = await db.child_skus.find(
        q, {"_id": 0, "id": 1, "child_sku_name": 1, "child_sku_code": 1,
            "customer_account_id": 1, "customer_account_name": 1},
    ).to_list(500)

    # Enrich with the customer account's city (display only).
    acct_ids = list({r.get("customer_account_id") for r in rows if r.get("customer_account_id")})
    acct_map = {}
    if acct_ids:
        acct_map = {a["id"]: a for a in await db.accounts.find(
            {"tenant_id": tenant_id, "id": {"$in": acct_ids}},
            {"_id": 0, "id": 1, "city": 1, "account_name": 1},
        ).to_list(len(acct_ids) + 1)}
    for r in rows:
        a = acct_map.get(r.get("customer_account_id")) or {}
        r["account_city"] = a.get("city")
        if not r.get("customer_account_name"):
            r["customer_account_name"] = a.get("account_name")

    distributor_name = None
    filtered_by_distributor = False
    if distributor_id and not account_id:
        assigned = await db.account_distributor_assignments.find(
            {"tenant_id": tenant_id, "distributor_id": distributor_id, "status": "active"},
            {"_id": 0, "account_id": 1},
        ).to_list(2000)
        assigned_ids = {a["account_id"] for a in assigned}
        rows = [r for r in rows if r.get("customer_account_id") in assigned_ids]
        filtered_by_distributor = True
        dist = await db.distributors.find_one(
            {"id": distributor_id, "tenant_id": tenant_id}, {"_id": 0, "distributor_name": 1})
        distributor_name = (dist or {}).get("distributor_name")

    rows.sort(key=lambda c: (c.get("child_sku_name") or "").lower())
    return {"children": rows, "distributor_name": distributor_name,
            "filtered_by_distributor": filtered_by_distributor}


# ─────────────────────────── Stock In (shipment) ───────────────────────────

class ShipmentItemCategorize(BaseModel):
    distributor_id: str
    shipment_id: str
    item_id: str
    child_sku_id: str
    quantity: Optional[int] = None  # base units; None = full line


@router.post("/shipment-item")
async def categorize_shipment_item(payload: ShipmentItemCategorize,
                                   current_user: dict = Depends(get_current_user)):
    _require_role(current_user)
    tenant_id = get_current_tenant_id()

    shipment = await db.distributor_shipments.find_one(
        {"id": payload.shipment_id, "tenant_id": tenant_id, "distributor_id": payload.distributor_id})
    if not shipment:
        raise HTTPException(404, "Shipment not found")
    if (shipment.get("status") or "") in ("cancelled", "reversed"):
        raise HTTPException(400, "Cancelled / reversed shipments cannot be categorized.")

    item = await db.distributor_shipment_items.find_one(
        {"id": payload.item_id, "shipment_id": payload.shipment_id, "tenant_id": tenant_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Shipment item not found")
    if item.get("child_sku_id"):
        raise HTTPException(400, "This line is already categorized.")

    child = await _resolve_customer_child(tenant_id, payload.child_sku_id, item["sku_id"])
    line_units = int(item.get("quantity") or 0)
    qty = _validate_qty(payload.quantity, line_units, item.get("packaging_units"))
    split = qty < line_units

    recv = item.get("received_quantity")
    if split and recv is not None and int(recv) != line_units:
        raise HTTPException(400, "This line has a receipt discrepancy — categorize the full line instead of splitting.")

    now = _now_iso()
    upp = int(item.get("packaging_units") or 1)

    def _amounts(doc: dict) -> dict:
        quantity = doc.get("quantity", 0)
        unit_price = doc.get("unit_price", 0) or 0
        discount_percent = doc.get("discount_percent", 0) or 0
        tax_percent = doc.get("tax_percent", 0) or 0
        gross = quantity * unit_price
        disc = round(gross * discount_percent / 100, 2)
        taxable = gross - disc
        tax = round(taxable * tax_percent / 100, 2)
        return {**doc, "gross_amount": round(gross, 2), "discount_amount": disc,
                "taxable_amount": round(taxable, 2), "tax_amount": tax,
                "net_amount": round(taxable + tax, 2)}

    child_fields = {
        "child_sku_id": child["id"],
        "child_sku_name": child.get("child_sku_name"),
        **_audit_fields(current_user),
    }

    if split:
        rest = line_units - qty
        # New categorized line
        new_item = {k: v for k, v in item.items() if k != "id"}
        new_item.update({"id": str(uuid.uuid4()), "quantity": qty, **child_fields,
                         "retro_split_from_item_id": item["id"]})
        if upp > 1:
            new_item["packages"] = qty // upp
        if recv is not None:
            new_item["received_quantity"] = qty
        new_item = _amounts(new_item)
        await db.distributor_shipment_items.insert_one(dict(new_item))
        # Shrink original line
        orig_updates = {"quantity": rest, "updated_at": now}
        if upp > 1:
            orig_updates["packages"] = rest // upp
        if recv is not None:
            orig_updates["received_quantity"] = rest
        orig_updates.update({k: v for k, v in _amounts({**item, "quantity": rest}).items()
                             if k in ("gross_amount", "discount_amount", "taxable_amount", "tax_amount", "net_amount")})
        await db.distributor_shipment_items.update_one(
            {"id": item["id"], "tenant_id": tenant_id}, {"$set": orig_updates})
    else:
        await db.distributor_shipment_items.update_one(
            {"id": item["id"], "tenant_id": tenant_id},
            {"$set": {**child_fields, "updated_at": now}})

    # Stock effect — only when the destination already received the stock.
    moved, entry_number = 0, None
    if (shipment.get("status") or "") in ("delivered", "partially_delivered"):
        moved, entry_number = await _move_generic_to_child(
            tenant_id, current_user, shipment["distributor_location_id"], item["sku_id"],
            child, qty, item.get("batch_id"),
            note=f"Retro categorization of Stock In {shipment.get('shipment_number')} — {item.get('sku_name')}",
        )

    return {
        "message": "Line categorized.",
        "split": split,
        "categorized_units": qty,
        "stock_moved_units": moved,
        "branding_entry_number": entry_number,
        "child_sku_name": child.get("child_sku_name"),
    }


# ─────────────────────────── Stock Out (delivery) ───────────────────────────

class DeliveryItemCategorize(BaseModel):
    distributor_id: str
    delivery_id: str
    item_id: str
    child_sku_id: str
    quantity: Optional[int] = None  # base units; None = full line


_DELIVERY_PRORATE_FIELDS = (
    "gross_amount", "discount_amount", "taxable_amount", "tax_amount", "net_amount",
    "margin_amount", "price_premium_payable", "factory_distributor_adjustment",
)


@router.post("/delivery-item")
async def categorize_delivery_item(payload: DeliveryItemCategorize,
                                   current_user: dict = Depends(get_current_user)):
    _require_role(current_user)
    tenant_id = get_current_tenant_id()

    delivery = await db.distributor_deliveries.find_one(
        {"id": payload.delivery_id, "tenant_id": tenant_id, "distributor_id": payload.distributor_id})
    if not delivery:
        raise HTTPException(404, "Delivery not found")
    if (delivery.get("status") or "") in ("cancelled", "reversed"):
        raise HTTPException(400, "Cancelled / reversed deliveries cannot be categorized.")

    item = await db.distributor_delivery_items.find_one(
        {"id": payload.item_id, "delivery_id": payload.delivery_id, "tenant_id": tenant_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Delivery item not found")
    if item.get("child_sku_id"):
        raise HTTPException(400, "This line is already categorized.")

    # The child MUST be branded for THIS delivery's account.
    child = await _resolve_customer_child(
        tenant_id, payload.child_sku_id, item["sku_id"], account_id=delivery.get("account_id"))
    line_units = int(item.get("quantity") or 0)
    qty = _validate_qty(payload.quantity, line_units, item.get("packaging_units"))
    split = qty < line_units

    now = _now_iso()
    upp = int(item.get("packaging_units") or 1)
    child_fields = {
        "child_sku_id": child["id"],
        "child_sku_name": child.get("child_sku_name"),
        **_audit_fields(current_user),
    }

    # If the delivery has NOT been delivered yet, its stock deduction is still
    # pending and will target this line's classification — so the matching
    # Generic on-hand must move into the branded bucket NOW, otherwise the
    # deduction later misses the (non-existent) branded row.
    stock_moved, entry_no = 0, None
    delivered_statuses = ("delivered", "complete", "completed")
    if (delivery.get("status") or "") not in delivered_statuses:
        loc_id = delivery.get("distributor_location_id")
        if not loc_id:
            raise HTTPException(400, "Delivery has no source warehouse — cannot move stock.")
        loc = await _load_location(tenant_id, loc_id)
        coll, base = _stock_coll_and_base(loc, tenant_id)
        avail_q = {**base, "sku_id": item["sku_id"], "child_sku_id": {"$in": [None]}, "quantity": {"$gt": 0}}
        if item.get("batch_id"):
            avail_q["batch_id"] = item["batch_id"]
        avail_rows = await coll.find(avail_q, {"_id": 0, "quantity": 1}).to_list(500)
        available = sum(int(r.get("quantity") or 0) for r in avail_rows)
        if available < qty:
            raise HTTPException(400, (
                f"Only {available} Generic units on-hand at the source warehouse"
                f"{' for this batch' if item.get('batch_id') else ''} — cannot categorize "
                f"{qty} units before the delivery is completed."))
        stock_moved, entry_no = await _move_generic_to_child(
            tenant_id, current_user, loc_id, item["sku_id"], child, qty,
            item.get("batch_id"),
            f"Retro categorization (pre-delivery) for {delivery.get('delivery_number')}")

    if split:
        rest = line_units - qty
        ratio = qty / line_units
        new_item = {k: v for k, v in item.items() if k != "id"}
        new_item.update({"id": str(uuid.uuid4()), "quantity": qty, **child_fields,
                         "retro_split_from_item_id": item["id"]})
        orig_updates = {"quantity": rest, "updated_at": now}
        if upp > 1:
            new_item["packages"] = qty // upp
            orig_updates["packages"] = rest // upp
        for f in _DELIVERY_PRORATE_FIELDS:
            v = item.get(f)
            if isinstance(v, (int, float)):
                part = round(v * ratio, 2)
                new_item[f] = part
                orig_updates[f] = round(v - part, 2)
        await db.distributor_delivery_items.insert_one(dict(new_item))
        await db.distributor_delivery_items.update_one(
            {"id": item["id"], "tenant_id": tenant_id}, {"$set": orig_updates})
    else:
        await db.distributor_delivery_items.update_one(
            {"id": item["id"], "tenant_id": tenant_id},
            {"$set": {**child_fields, "updated_at": now}})

    # Delivered → relabel only (stock already left the network).
    # Undelivered → the matching Generic on-hand was moved to the branded bucket above.
    return {
        "message": "Line categorized.",
        "split": split,
        "categorized_units": qty,
        "stock_moved_units": stock_moved,
        "branding_entry_number": entry_no,
        "child_sku_name": child.get("child_sku_name"),
    }


# ─────────────────────────── Stock Transfer ───────────────────────────

class TransferItemCategorize(BaseModel):
    transfer_id: str
    item_index: int
    child_sku_id: str
    quantity: Optional[int] = None  # base units; None = full line


@router.post("/transfer-item")
async def categorize_transfer_item(payload: TransferItemCategorize,
                                   current_user: dict = Depends(get_current_user)):
    _require_role(current_user)
    tenant_id = get_current_tenant_id()

    transfer = await db.distributor_stock_transfers.find_one(
        {"id": payload.transfer_id, "tenant_id": tenant_id})
    if not transfer:
        raise HTTPException(404, "Stock transfer not found")
    if (transfer.get("status") or "") != "completed":
        raise HTTPException(400, "Only completed transfers can be retrospectively categorized.")

    items = list(transfer.get("items") or [])
    if payload.item_index < 0 or payload.item_index >= len(items):
        raise HTTPException(404, "Transfer item not found")
    item = items[payload.item_index]
    if item.get("child_sku_id"):
        raise HTTPException(400, "This line is already categorized.")

    child = await _resolve_customer_child(tenant_id, payload.child_sku_id, item["sku_id"])
    upp = int(item.get("units_per_package") or 1)
    line_units = int(item.get("quantity_units") or (int(item.get("quantity") or 0) * upp))
    qty = _validate_qty(payload.quantity, line_units, upp)
    split = qty < line_units

    now = _now_iso()
    child_fields = {
        "child_sku_id": child["id"],
        "child_sku_name": child.get("child_sku_name"),
        **_audit_fields(current_user),
    }
    rate = float(item.get("rate") or 0)

    if split:
        rest = line_units - qty
        new_item = dict(item)
        new_item.update({
            **child_fields,
            "quantity": qty // upp,
            "quantity_units": qty,
            "line_total": round((qty // upp) * rate, 2),
        })
        item.update({
            "quantity": rest // upp,
            "quantity_units": rest,
            "line_total": round((rest // upp) * rate, 2),
        })
        items.insert(payload.item_index + 1, new_item)
    else:
        item.update(child_fields)

    await db.distributor_stock_transfers.update_one(
        {"id": payload.transfer_id, "tenant_id": tenant_id},
        {"$set": {"items": items, "updated_at": now}})

    # Stock effect — transfers move stock at creation, so the destination holds it.
    moved, entry_number = await _move_generic_to_child(
        tenant_id, current_user, transfer["dest_location_id"], item["sku_id"],
        child, qty, item.get("batch_id"),
        note=f"Retro categorization of Stock Transfer {transfer.get('transfer_number')} — {item.get('sku_name')}",
    )

    return {
        "message": "Line categorized.",
        "split": split,
        "categorized_units": qty,
        "stock_moved_units": moved,
        "branding_entry_number": entry_number,
        "child_sku_name": child.get("child_sku_name"),
    }
