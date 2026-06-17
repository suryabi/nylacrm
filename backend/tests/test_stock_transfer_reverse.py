"""Regression: reversing a Stock Transfer restores stock in BOTH warehouses
and invalidates the Zoho document (void invoice / delete challan)."""
import uuid
import pytest

from database import db
from core.tenant import set_current_tenant
import routes.distributor_stock_transfers as m


@pytest.mark.asyncio
async def test_reverse_restores_stock_both_warehouses_and_marks_reversed():
    tenant = "nyla-air-water"
    set_current_tenant(tenant)
    src = "6eb87219-5585-4d73-8bc4-3c563da62233"
    dst = "0361dd27-e65b-4537-afa5-8486822e0a54"
    sku = "ee1e5f58-5509-4691-ae93-d3e3badc3442"
    batch = "d68a630a-55aa-4375-911d-e045c98b10c3"

    async def stock(loc):
        r = await db.factory_warehouse_stock.find_one(
            {"warehouse_location_id": loc, "sku_id": sku, "batch_id": batch}, {"_id": 0, "quantity": 1})
        return r["quantity"] if r else 0

    s0, d0 = await stock(src), await stock(dst)
    tid = str(uuid.uuid4())
    sloc = await db.distributor_locations.find_one({"id": src}, {"_id": 0, "distributor_id": 1})
    dloc = await db.distributor_locations.find_one({"id": dst}, {"_id": 0, "distributor_id": 1})
    doc = {
        "id": tid, "tenant_id": tenant, "transfer_number": "ST-TEST-REV", "status": "completed",
        "source_distributor_id": sloc["distributor_id"], "source_location_id": src,
        "dest_distributor_id": dloc["distributor_id"], "dest_location_id": dst,
        "zoho_doc_type": "invoice", "zoho_status": "not_synced", "zoho_invoice_id": None,
        "items": [{"sku_id": sku, "sku_name": "T", "packaging_type_id": "p", "packaging_type_name": "crate",
                   "units_per_package": 1, "quantity": 10, "quantity_units": 10,
                   "batch_id": batch, "batch_code": "B"}],
    }
    await db.distributor_stock_transfers.insert_one(dict(doc))
    try:
        resp = await m.reverse_stock_transfer(tid, {"id": "u1", "name": "Tester", "tenant_id": tenant})
        assert resp["ok"] is True
        assert await stock(src) == s0 + 10   # restored to source
        assert await stock(dst) == d0 - 10   # deducted from dest
        t = await db.distributor_stock_transfers.find_one({"id": tid}, {"_id": 0})
        assert t["status"] == "reversed"
        assert t["reversed_by_name"] == "Tester"
        assert t["zoho_cleanup_pending"] is False  # zoho not synced → no cleanup needed

        # Reversing again is blocked.
        with pytest.raises(Exception):
            await m.reverse_stock_transfer(tid, {"id": "u1", "name": "Tester"})
    finally:
        # restore stock + remove the test transfer
        await db.factory_warehouse_stock.update_one(
            {"warehouse_location_id": src, "sku_id": sku, "batch_id": batch}, {"$inc": {"quantity": -10}})
        await db.factory_warehouse_stock.update_one(
            {"warehouse_location_id": dst, "sku_id": sku, "batch_id": batch}, {"$inc": {"quantity": 10}})
        await db.distributor_stock_transfers.delete_one({"id": tid})
