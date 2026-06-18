"""
External Billing Entry (EBE) service.

When an account is billed directly by a third-party distributor
(`account.billed_by == 'distributor'`), we do NOT push a tax invoice to Zoho —
collections, outstandings and aging are the distributor's responsibility. But
to keep our analytics (account performance, SKU performance, revenue
trends) consistent we still record the transaction as an "External Billing
Entry" in the same `invoices` collection.

EBE numbering format: `EXT_00001`, `EXT_00002`, ... — per-tenant sequence.

Created during `complete_delivery` when applicable, and on-demand via the
backfill endpoint for historical deliveries.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from database import db

logger = logging.getLogger(__name__)

EBE_PREFIX = "EXT_"
EBE_PAD = 5      # → EXT_00001
EBE_SEQ_KEY = "external_billing_entry"


async def _next_ebe_number(tenant_id: str) -> str:
    """Per-tenant monotonically-increasing sequence. Uses the same `counters`
    pattern the rest of the app uses (atomic `$inc` upsert)."""
    doc = await db.counters.find_one_and_update(
        {"tenant_id": tenant_id, "key": EBE_SEQ_KEY},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    # find_one_and_update with return_document=True returns the post-update doc
    if doc is None:
        # Defensive: race with another upsert. Re-read.
        doc = await db.counters.find_one({"tenant_id": tenant_id, "key": EBE_SEQ_KEY})
    seq = (doc or {}).get("seq", 1)
    return f"{EBE_PREFIX}{seq:0{EBE_PAD}d}"


async def get_existing_ebe(tenant_id: str, delivery_id: str) -> Optional[dict]:
    """Return the EBE invoice row for a delivery, if one already exists."""
    return await db.invoices.find_one({
        "tenant_id": tenant_id,
        "source": "external_billing",
        "source_type": "distributor_delivery",
        "source_id": delivery_id,
    }, {"_id": 0})


async def generate_external_billing_entry(
    tenant_id: str,
    delivery: dict,
    account: dict,
    distributor: Optional[dict] = None,
    items: Optional[list[dict]] = None,
) -> Optional[dict]:
    """Create (or return the existing) EBE row for a completed delivery.

    Idempotent on `(tenant_id, source_type='distributor_delivery', source_id)`.
    Returns the EBE row dict (with `invoice_number`, etc.). Returns None when
    the account is not billed by a distributor (no-op for safety, callers
    should still gate on `account.billed_by`).
    """
    if (account.get("billed_by") or "company") != "distributor":
        return None

    existing = await get_existing_ebe(tenant_id, delivery["id"])
    if existing:
        return existing

    if items is None:
        items = await db.distributor_delivery_items.find(
            {"tenant_id": tenant_id, "delivery_id": delivery["id"]},
            {"_id": 0},
        ).to_list(500)

    # Pricing — read agreed rates from `account.sku_pricing` so analytics line
    # up with what's stored on every other invoice.
    agreed_prices: dict[str, float] = {}
    for p in (account.get("sku_pricing") or []):
        name_key = (p.get("sku") or p.get("sku_name") or "").strip().lower()
        if name_key:
            try:
                agreed_prices[name_key] = float(p.get("price_per_unit") or p.get("unit_price") or 0)
            except (TypeError, ValueError):
                pass

    items_list = []
    for it in items:
        name = (it.get("sku_name") or it.get("sku_code") or "").strip()
        qty = float(it.get("quantity") or 0)
        rate = agreed_prices.get(name.lower(), float(
            it.get("customer_selling_price") or it.get("unit_price") or 0
        ))
        net = qty * rate
        items_list.append({
            "sku_name": name,
            "sku_id": it.get("sku_id"),
            "quantity": qty,
            "bottles": qty,
            "rate": rate,
            "net_amount": net,
            "line_total": net,
            # batch lineage — printed on the EBE PDF + carried for traceability
            "batch_id": it.get("batch_id"),
            "batch_code": it.get("batch_code"),
        })

    gross_total = sum(i["net_amount"] for i in items_list)
    now = datetime.now(timezone.utc).isoformat()
    invoice_number = await _next_ebe_number(tenant_id)

    ebe_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "account_id": account.get("id"),
        "account_name": account.get("account_name") or account.get("name"),
        "invoice_no": invoice_number,
        "invoice_number": invoice_number,
        "invoice_date": (delivery.get("delivered_at") or delivery.get("delivery_date") or now)[:10],
        "gross_invoice_value": gross_total,
        "net_invoice_value": gross_total,
        # No outstanding / payment tracking by design — the distributor
        # handles collections.
        "outstanding": 0.0,
        "items": items_list,
        "source": "external_billing",
        "source_type": "distributor_delivery",
        "source_id": delivery.get("id"),
        "distributor_id": delivery.get("distributor_id"),
        "distributor_name": (distributor or {}).get("distributor_name") or delivery.get("distributor_name"),
        "delivery_number": delivery.get("delivery_number"),
        "billed_by": "distributor",       # explicit so reports can filter
        "updated_at": now,
    }
    await db.invoices.update_one(
        {"tenant_id": tenant_id, "source_type": "distributor_delivery",
         "source_id": delivery.get("id"), "source": "external_billing"},
        # `created_at` only on insert; `$set` would conflict on a re-call
        # (MongoDB 40 — same field in two operators).
        {"$set": ebe_doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    logger.info(
        f"Generated External Billing Entry {invoice_number} for delivery "
        f"{delivery.get('delivery_number')} (account "
        f"{account.get('account_name')})"
    )
    # Persist the EBE number on the delivery so the UI can surface it without
    # an extra round-trip.
    await db.distributor_deliveries.update_one(
        {"id": delivery["id"], "tenant_id": tenant_id},
        {"$set": {
            "external_billing_entry_number": invoice_number,
            "external_billing_entry_id": ebe_doc["id"],
            "updated_at": now,
        }},
    )
    return ebe_doc
