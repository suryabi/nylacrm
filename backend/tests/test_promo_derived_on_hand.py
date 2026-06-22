"""Regression test for the promo Stock-Out 'Insufficient stock' false-positive.

Production bug (Goa, single-location distributor): the promo guard summed
`distributor_stock` rows scoped to the location, which were missing/negative
for legacy distributors, yielding e.g. -720 on-hand and blocking the dispatch
even though the dashboard (received - delivered, distributor-wide) showed
thousands available.

This test seeds a single-location distributor whose legacy delivered shipments
lack a `distributor_location_id` and asserts `_derived_on_hand_by_sku` returns
the distributor-wide received - delivered figure (matching the dashboard).
"""
import asyncio
import uuid
import pytest

from database import db
from routes.promo_dispatch import _derived_on_hand_by_sku


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_derived_on_hand_single_location_distributor_wide():
    tenant = f"test-{uuid.uuid4().hex[:8]}"
    dist_id = str(uuid.uuid4())
    loc_id = str(uuid.uuid4())
    sku_id = str(uuid.uuid4())
    ship_id = str(uuid.uuid4())
    del_id = str(uuid.uuid4())

    async def seed_and_check():
        # One non-factory location → single_location path (distributor-wide).
        await db.distributor_locations.insert_one({
            "id": loc_id, "tenant_id": tenant, "distributor_id": dist_id,
            "is_factory": False, "status": "active",
        })
        # Delivered shipment (received 3600). NOTE: legacy → no distributor_location_id.
        await db.distributor_shipments.insert_one({
            "id": ship_id, "tenant_id": tenant, "distributor_id": dist_id,
            "status": "delivered",
        })
        await db.distributor_shipment_items.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": tenant, "shipment_id": ship_id,
            "sku_id": sku_id, "quantity": 3600,
        })
        # Completed delivery (delivered out 852). Also legacy → no location id.
        await db.distributor_deliveries.insert_one({
            "id": del_id, "tenant_id": tenant, "distributor_id": dist_id,
            "status": "completed",
        })
        await db.distributor_delivery_items.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": tenant, "delivery_id": del_id,
            "sku_id": sku_id, "quantity": 852,
        })
        # Negative/stale distributor_stock row (the source of the -720 bug).
        await db.distributor_stock.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": tenant, "distributor_id": dist_id,
            "distributor_location_id": loc_id, "sku_id": sku_id, "quantity": -720,
        })

        derived = await _derived_on_hand_by_sku(tenant, dist_id, loc_id, [sku_id])
        return derived

    async def cleanup():
        for coll in [db.distributor_locations, db.distributor_shipments,
                     db.distributor_shipment_items, db.distributor_deliveries,
                     db.distributor_delivery_items, db.distributor_stock]:
            await coll.delete_many({"tenant_id": tenant})

    try:
        derived = _run(seed_and_check())
        # Dashboard-consistent: 3600 received - 852 delivered = 2748.
        assert derived.get(sku_id) == 2748, f"expected 2748, got {derived.get(sku_id)}"
        # The guard takes max(stock_row=-720, derived=2748) = 2748 → passes for need=12.
        on_hand = max(-720, derived.get(sku_id, 0))
        assert on_hand == 2748
        assert on_hand - 0 >= 12  # need 12 crates → available
    finally:
        _run(cleanup())
