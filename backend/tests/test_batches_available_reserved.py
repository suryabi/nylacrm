"""Regression: /batches-available must subtract RESERVED stock.

Stock committed to OPEN Stock Out / Promotional Stock-Out orders (which share
the `distributor_deliveries` pipeline) must NOT be offered again in the batch
picker. The picker should show available = on-hand − reserved.
"""
import asyncio
import uuid
import pytest

from database import db
from routes.distributor_stock_transfers import _reserved_qty_by_batch


@pytest.mark.asyncio
async def test_reserved_qty_by_batch_sums_open_orders():
    tenant = "test-reserve-tenant"
    loc_id = f"loc-{uuid.uuid4()}"
    sku = f"sku-{uuid.uuid4()}"
    batch_a = f"batch-a-{uuid.uuid4()}"
    batch_b = f"batch-b-{uuid.uuid4()}"

    # 3 deliveries from this location for this SKU.
    open_del = {"id": f"d-{uuid.uuid4()}", "tenant_id": tenant,
                "distributor_location_id": loc_id, "status": "confirmed"}
    promo_del = {"id": f"d-{uuid.uuid4()}", "tenant_id": tenant,
                 "distributor_location_id": loc_id, "status": "draft", "is_promo": True}
    done_del = {"id": f"d-{uuid.uuid4()}", "tenant_id": tenant,
                "distributor_location_id": loc_id, "status": "completed"}  # released

    await db.distributor_deliveries.insert_many([open_del, promo_del, done_del])
    await db.distributor_delivery_items.insert_many([
        {"tenant_id": tenant, "delivery_id": open_del["id"], "sku_id": sku, "batch_id": batch_a, "quantity": 10},
        {"tenant_id": tenant, "delivery_id": promo_del["id"], "sku_id": sku, "batch_id": batch_a, "quantity": 5},
        {"tenant_id": tenant, "delivery_id": promo_del["id"], "sku_id": sku, "batch_id": batch_b, "quantity": 3},
        # completed delivery — must NOT count toward reserved
        {"tenant_id": tenant, "delivery_id": done_del["id"], "sku_id": sku, "batch_id": batch_a, "quantity": 100},
    ])

    try:
        reserved = await _reserved_qty_by_batch(tenant, loc_id, sku)
        assert reserved.get(batch_a) == 15, reserved   # 10 (open) + 5 (promo draft)
        assert reserved.get(batch_b) == 3, reserved
        assert sum(reserved.values()) == 18  # completed (100) excluded

        # No open orders at an unrelated location → empty reservation map.
        empty = await _reserved_qty_by_batch(tenant, f"loc-{uuid.uuid4()}", sku)
        assert empty == {}
    finally:
        await db.distributor_deliveries.delete_many({"tenant_id": tenant})
        await db.distributor_delivery_items.delete_many({"tenant_id": tenant})
