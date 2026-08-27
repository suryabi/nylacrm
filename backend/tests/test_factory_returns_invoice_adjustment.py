"""
Test Factory Returns Stock-In invoice adjustment flow (Zoho CN)
- GET /api/distributors/{id}/stock-in-options
- POST factory-returns with warehouse source requires stock_in_shipment_id (400 otherwise)
- POST factory-returns with valid stock_in_shipment_id creates return, requires_settlement=False, invoice_adjustment=None
- Confirm hook triggers invoice_adjustment (failed in preview — Zoho not configured)
- PUT adjust-invoice retry endpoint
- Settlement preview no longer includes factory returns
- Settlement create sets total_factory_return_credit=0 and factory_return_ids=[]
- POST detach-factory-returns for seeded settlement
- customer_return source doesn't need stock_in_shipment_id
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timezone
from pymongo import MongoClient

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
TENANT = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
DIST_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"  # Brian
LOC_ID = "5fff767e-7aed-4a36-b805-313ac286963d"    # Bangalore Warehouse
SKU_ID = "20d525e8-c4af-4f40-965a-549dcd50c0a9"    # Nyla 600 ml Silver (1434 avail)

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
mc = MongoClient(MONGO_URL)
mdb = mc[DB_NAME]


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": EMAIL, "password": PASSWORD},
                      headers={"X-Tenant-ID": TENANT})
    assert r.status_code == 200, r.text
    t = r.json().get("session_token") or r.json().get("token")
    assert t
    return t


@pytest.fixture(scope="module")
def api(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {token}",
                      "X-Tenant-ID": TENANT})
    return s


@pytest.fixture(scope="module")
def shipment_id(api):
    r = api.get(f"{BASE_URL}/api/distributors/{DIST_ID}/stock-in-options")
    assert r.status_code == 200, r.text
    ships = r.json().get("shipments", [])
    assert ships, "No shipments returned"
    return ships[0]["id"]


def _cleanup(fr_ids=None, settlement_ids=None):
    if fr_ids:
        mdb.distributor_factory_returns.delete_many({"id": {"$in": fr_ids}, "tenant_id": TENANT})
    if settlement_ids:
        mdb.distributor_settlements.delete_many({"id": {"$in": settlement_ids}, "tenant_id": TENANT})


class TestStockInOptions:
    def test_stock_in_options_shape(self, api):
        r = api.get(f"{BASE_URL}/api/distributors/{DIST_ID}/stock-in-options")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "shipments" in data
        assert isinstance(data["shipments"], list)
        assert len(data["shipments"]) > 0
        s = data["shipments"][0]
        for k in ["id", "shipment_number", "status"]:
            assert k in s
        # zoho_invoice_number key must be present (value may be None if not synced)
        assert "zoho_invoice_number" in s
        assert s["status"] in ["confirmed", "in_transit", "delivered"]


class TestFactoryReturnCreation:
    def test_warehouse_source_requires_stockin(self, api):
        """POST without stock_in_shipment_id should be rejected with 400"""
        payload = {
            "distributor_location_id": LOC_ID,
            "source": "warehouse",
            "reason": "expired",
            "items": [{"sku_id": SKU_ID, "quantity": 1}],
            "remarks": "TEST_no_stockin"
        }
        r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns", json=payload)
        assert r.status_code == 400, r.text
        assert "Stock-In" in r.text or "stock-in" in r.text.lower()

    def test_warehouse_source_with_valid_stockin(self, api, shipment_id):
        payload = {
            "distributor_location_id": LOC_ID,
            "source": "warehouse",
            "reason": "expired",
            "stock_in_shipment_id": shipment_id,
            "items": [{"sku_id": SKU_ID, "quantity": 1}],
            "remarks": "TEST_with_stockin"
        }
        r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns", json=payload)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["stock_in_shipment_id"] == shipment_id
        assert doc.get("stock_in_shipment_number")
        assert doc["requires_settlement"] is False
        assert doc.get("invoice_adjustment") is None
        assert doc["status"] == "draft"
        _cleanup(fr_ids=[doc["id"]])

    def test_customer_return_no_stockin_needed(self, api):
        """customer_return source should work WITHOUT stock_in_shipment_id."""
        # first ensure there is customer-returned qty available; if not, skip
        r_stock = api.get(f"{BASE_URL}/api/distributors/{DIST_ID}/available-stock")
        assert r_stock.status_code == 200
        rows = r_stock.json().get("available_stock", [])
        cust_pending = next((x for x in rows if (x.get("customer_pending_factory") or 0) > 0), None)
        if not cust_pending:
            pytest.skip("No customer_pending_factory stock available at Brian for customer_return source")
        payload = {
            "distributor_location_id": LOC_ID,
            "source": "customer_return",
            "reason": "expired",
            "items": [{"sku_id": cust_pending["sku_id"], "quantity": 1}],
            "remarks": "TEST_cust_ret"
        }
        r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns", json=payload)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["source"] == "customer_return"
        assert doc.get("stock_in_shipment_id") is None
        _cleanup(fr_ids=[doc["id"]])


class TestConfirmInvoiceAdjustment:
    def test_confirm_triggers_invoice_adjustment(self, api, shipment_id):
        # Create draft
        payload = {
            "distributor_location_id": LOC_ID,
            "source": "warehouse",
            "reason": "expired",
            "stock_in_shipment_id": shipment_id,
            "items": [{"sku_id": SKU_ID, "quantity": 1}],
            "remarks": "TEST_confirm_adj"
        }
        r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns", json=payload)
        assert r.status_code == 200, r.text
        fr_id = r.json()["id"]

        # Confirm
        r2 = api.put(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns/{fr_id}/confirm", json={})
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body["status"] == "confirmed"
        adj = body.get("invoice_adjustment")
        assert adj is not None, "invoice_adjustment must be present for warehouse source"
        # Expected FAILED in preview: no Zoho invoice mapping OR zoho not configured
        assert adj["status"] == "failed", f"Expected 'failed' in preview, got: {adj}"
        assert adj.get("error")
        # Verify persisted
        r3 = api.get(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns/{fr_id}")
        assert r3.status_code == 200
        stored = r3.json().get("invoice_adjustment") or {}
        assert stored.get("status") == "failed"
        _cleanup(fr_ids=[fr_id])


class TestAdjustInvoiceRetry:
    def test_retry_requires_confirmed(self, api, shipment_id):
        # Draft return
        payload = {
            "distributor_location_id": LOC_ID,
            "source": "warehouse",
            "reason": "expired",
            "stock_in_shipment_id": shipment_id,
            "items": [{"sku_id": SKU_ID, "quantity": 1}],
            "remarks": "TEST_retry_draft"
        }
        r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns", json=payload)
        fr_id = r.json()["id"]
        r2 = api.put(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns/{fr_id}/adjust-invoice",
                     json={})
        assert r2.status_code == 400, r2.text
        _cleanup(fr_ids=[fr_id])

    def test_retry_confirmed_returns_result(self, api, shipment_id):
        payload = {
            "distributor_location_id": LOC_ID,
            "source": "warehouse",
            "reason": "damaged",
            "stock_in_shipment_id": shipment_id,
            "items": [{"sku_id": SKU_ID, "quantity": 1}],
            "remarks": "TEST_retry_ok"
        }
        r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns", json=payload)
        fr_id = r.json()["id"]
        api.put(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns/{fr_id}/confirm", json={})
        r2 = api.put(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns/{fr_id}/adjust-invoice",
                     json={})
        assert r2.status_code == 200, r2.text
        adj = r2.json().get("invoice_adjustment")
        assert adj is not None
        assert adj["status"] in ("failed", "applied")  # preview: expect failed
        _cleanup(fr_ids=[fr_id])

    def test_retry_can_link_shipment(self, api, shipment_id):
        # Simulate a legacy return with no stock_in_shipment_id by seeding directly
        # (but easier: create with linked, then blank it via mongo)
        payload = {
            "distributor_location_id": LOC_ID,
            "source": "warehouse",
            "reason": "expired",
            "stock_in_shipment_id": shipment_id,
            "items": [{"sku_id": SKU_ID, "quantity": 1}],
            "remarks": "TEST_legacy_relink"
        }
        r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns", json=payload)
        fr_id = r.json()["id"]
        api.put(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns/{fr_id}/confirm", json={})
        # Blank the shipment link to mimic legacy
        mdb.distributor_factory_returns.update_one(
            {"id": fr_id, "tenant_id": TENANT},
            {"$set": {"stock_in_shipment_id": None, "stock_in_shipment_number": None}})
        # Retry with a stock_in_shipment_id supplied
        r2 = api.put(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns/{fr_id}/adjust-invoice",
                     json={"stock_in_shipment_id": shipment_id})
        assert r2.status_code == 200, r2.text
        # Confirm shipment was linked
        stored = mdb.distributor_factory_returns.find_one({"id": fr_id})
        assert stored.get("stock_in_shipment_id") == shipment_id
        _cleanup(fr_ids=[fr_id])


class TestSettlementNoFactoryReturns:
    def test_settlement_preview_excludes_factory_returns(self, api, shipment_id):
        """Even after creating & confirming a warehouse factory return in-period,
        the settlement preview must show zero factory returns."""
        now = datetime.now(timezone.utc)
        month, year = now.month, now.year
        # Create + confirm a warehouse return dated today
        payload = {
            "distributor_location_id": LOC_ID,
            "source": "warehouse",
            "reason": "expired",
            "stock_in_shipment_id": shipment_id,
            "return_date": now.strftime("%Y-%m-%d"),
            "items": [{"sku_id": SKU_ID, "quantity": 1}],
            "remarks": "TEST_preview_exclude"
        }
        r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns", json=payload)
        fr_id = r.json()["id"]
        api.put(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns/{fr_id}/confirm", json={})

        # Call settlement preview
        r2 = api.get(f"{BASE_URL}/api/distributors/{DIST_ID}/settlement-preview",
                     params={"month": month, "year": year})
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data.get("factory_returns") == [], f"factory_returns should be empty, got {data.get('factory_returns')}"
        assert data.get("summary", {}).get("total_factory_returns", 0) == 0
        assert data.get("summary", {}).get("total_factory_return_amount", 0) == 0
        _cleanup(fr_ids=[fr_id])

    def test_settlement_create_no_factory_return_credit(self, api, shipment_id):
        """Create a settlement and ensure total_factory_return_credit=0, factory_return_ids=[]"""
        # Determine an available period with deliveries. Try current month first;
        # if 400 (no unsettled data), skip.
        now = datetime.now(timezone.utc)
        # last month
        if now.month == 1:
            m, y = 12, now.year - 1
        else:
            m, y = now.month - 1, now.year
        period_start = f"{y}-{m:02d}-01"
        # last day
        import calendar
        last = calendar.monthrange(y, m)[1]
        period_end = f"{y}-{m:02d}-{last:02d}"

        # Seed a factory return in-period (already confirmed) — it should still not affect settlement
        payload = {
            "distributor_location_id": LOC_ID,
            "source": "warehouse",
            "reason": "expired",
            "stock_in_shipment_id": shipment_id,
            "return_date": period_start,
            "items": [{"sku_id": SKU_ID, "quantity": 1}],
            "remarks": "TEST_settlement_exclude"
        }
        r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns", json=payload)
        fr_id = r.json()["id"]
        api.put(f"{BASE_URL}/api/distributors/{DIST_ID}/factory-returns/{fr_id}/confirm", json={})

        r2 = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/settlements",
                      json={"distributor_id": DIST_ID,
                            "period_type": "monthly",
                            "period_start": period_start,
                            "period_end": period_end,
                            "remarks": "TEST"})
        if r2.status_code == 400:
            # No unsettled deliveries → cannot verify create path; still preview verified above
            _cleanup(fr_ids=[fr_id])
            pytest.skip(f"No unsettled data for {period_start}..{period_end}: {r2.text}")
        assert r2.status_code == 200, r2.text
        s = r2.json()
        assert s.get("total_factory_return_credit", 0) == 0
        assert s.get("factory_return_ids", []) == []
        assert s.get("total_factory_returns", 0) == 0
        _cleanup(fr_ids=[fr_id], settlement_ids=[s["id"]])


class TestDetachFactoryReturns:
    def test_detach_success(self, api):
        # Seed a settlement doc with factory_return_ids + credit>0
        sid = str(uuid.uuid4())
        seed = {
            "id": sid,
            "tenant_id": TENANT,
            "settlement_number": f"TEST-SET-{sid[:6]}",
            "distributor_id": DIST_ID,
            "distributor_name": "Brian",
            "period_type": "monthly",
            "period_start": "2025-11-01",
            "period_end": "2025-11-30",
            "total_factory_return_credit": 500.0,
            "factory_return_ids": ["fake-fr-1", "fake-fr-2"],
            "total_factory_returns": 2,
            "adjustments": 800.0,
            "final_payout": 800.0,
            "status": "draft",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        mdb.distributor_settlements.insert_one(seed.copy())
        try:
            r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/settlements/{sid}/detach-factory-returns")
            assert r.status_code == 200, r.text
            data = r.json()
            assert data.get("detached_credit") == 500.0
            assert set(data.get("detached_factory_return_ids", [])) == {"fake-fr-1", "fake-fr-2"}
            assert data.get("new_final_payout") == 300.0
            # Verify DB
            doc = mdb.distributor_settlements.find_one({"id": sid})
            assert doc["total_factory_return_credit"] == 0
            assert doc["factory_return_ids"] == []
            assert doc["total_factory_returns"] == 0
            assert doc["adjustments"] == 300.0
            assert doc["final_payout"] == 300.0
            assert doc.get("detached_factory_return_credit") == 500.0
            assert doc.get("factory_returns_detached_at")
        finally:
            _cleanup(settlement_ids=[sid])

    def test_detach_400_no_factory_returns(self, api):
        sid = str(uuid.uuid4())
        seed = {
            "id": sid, "tenant_id": TENANT,
            "settlement_number": f"TEST-EMPTY-{sid[:6]}",
            "distributor_id": DIST_ID, "distributor_name": "Brian",
            "period_start": "2025-11-01", "period_end": "2025-11-30",
            "total_factory_return_credit": 0,
            "factory_return_ids": [], "status": "draft",
            "adjustments": 0, "final_payout": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        mdb.distributor_settlements.insert_one(seed.copy())
        try:
            r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/settlements/{sid}/detach-factory-returns")
            assert r.status_code == 400, r.text
            assert "no factory returns" in r.text.lower() or "no factory" in r.text.lower()
        finally:
            _cleanup(settlement_ids=[sid])

    def test_detach_400_when_paid(self, api):
        sid = str(uuid.uuid4())
        seed = {
            "id": sid, "tenant_id": TENANT,
            "settlement_number": f"TEST-PAID-{sid[:6]}",
            "distributor_id": DIST_ID, "distributor_name": "Brian",
            "period_start": "2025-11-01", "period_end": "2025-11-30",
            "total_factory_return_credit": 100.0,
            "factory_return_ids": ["x"], "status": "paid",
            "adjustments": 100.0, "final_payout": 100.0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        mdb.distributor_settlements.insert_one(seed.copy())
        try:
            r = api.post(f"{BASE_URL}/api/distributors/{DIST_ID}/settlements/{sid}/detach-factory-returns")
            assert r.status_code == 400, r.text
            assert "paid" in r.text.lower()
        finally:
            _cleanup(settlement_ids=[sid])


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
