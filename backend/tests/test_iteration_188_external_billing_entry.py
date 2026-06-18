"""
Iteration 188 — External Billing Entry (EBE) for distributor-billed accounts.

When `account.billed_by == 'distributor'`, completing a delivery:
  • Does NOT push a Zoho invoice (verified by the existing gate).
  • Generates an entry in `invoices` with `source = 'external_billing'` and
    invoice_number = "EXT_00001" (per-tenant monotonic sequence).
  • Persists `external_billing_entry_number` + id on the delivery row.
  • The PDF endpoint renders an "EXTERNAL BILLING ENTRY" PDF (no GST rows,
    not-a-tax-invoice banner) and reuses the same number.
  • Idempotent — re-completing or re-downloading must not duplicate.

The backfill endpoint generates EBEs for historical completed deliveries.
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone
from io import BytesIO

import pytest
import requests
import pypdf
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://supply-chain-sync-3.preview.emergentagent.com",
).rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"
TENANT_ID = "nyla-air-water"


def _login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code}")
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def token():
    return _login()


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def _db():
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def scenario():
    """Seed:
    - 1 distributor with 1 distributor warehouse
    - 1 SKU
    - 1 account with `billed_by='distributor'`
    - 1 delivery in `delivery_scheduled` status w/ 1 line item
    Sufficient stock available via a delivered shipment.
    """
    distributor_id = str(uuid.uuid4())
    location_id = str(uuid.uuid4())
    sku_id = str(uuid.uuid4())
    account_id = str(uuid.uuid4())
    delivery_id = str(uuid.uuid4())
    item_id = str(uuid.uuid4())
    shipment_id = str(uuid.uuid4())
    shipment_item_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    async def _setup():
        db = _db()
        await db.distributors.insert_one({
            "id": distributor_id, "tenant_id": TENANT_ID,
            "distributor_name": "ITER188 Dist", "distributor_code": "DIST-ITER188",
            "billing_approach": "margin_upfront",
        })
        await db.distributor_locations.insert_one({
            "id": location_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "location_name": "ITER188 WH", "city": "Hyderabad",
            "is_factory": False, "track_batches": False, "status": "active",
        })
        await db.master_skus.insert_one({
            "id": sku_id, "tenant_id": TENANT_ID,
            "sku_name": "ITER188 660ml", "category": "test", "is_active": True,
        })
        await db.accounts.insert_one({
            "id": account_id, "tenant_id": TENANT_ID,
            "account_name": "ITER188 Cust", "city": "Hyderabad", "state": "Telangana",
            "billed_by": "distributor",          # the trigger
            "sku_pricing": [{"sku_id": sku_id, "sku_name": "ITER188 660ml",
                              "unit_price": 100, "price_per_unit": 100,
                              "packaging_units": 12}],
            "distributor_assignments": [{"distributor_id": distributor_id, "is_primary": True}],
        })
        await db.distributor_shipments.insert_one({
            "id": shipment_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "distributor_location_id": location_id,
            "shipment_number": "SHP-ITER188-001",
            "status": "delivered",
            "shipment_date": now[:10], "delivered_at": now, "created_at": now,
        })
        await db.distributor_shipment_items.insert_one({
            "id": shipment_item_id, "tenant_id": TENANT_ID,
            "shipment_id": shipment_id,
            "sku_id": sku_id, "sku_name": "ITER188 660ml",
            "quantity": 240, "received_quantity": 240, "unit_price": 80,
        })
        await db.distributor_deliveries.insert_one({
            "id": delivery_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "distributor_location_id": location_id,
            "account_id": account_id, "account_name": "ITER188 Cust",
            "delivery_number": "DEL-ITER188-1",
            "delivery_date": now[:10],
            "status": "delivery_scheduled",
            "created_at": now,
        })
        await db.distributor_delivery_items.insert_one({
            "id": item_id, "tenant_id": TENANT_ID,
            "delivery_id": delivery_id,
            "sku_id": sku_id, "sku_name": "ITER188 660ml",
            "quantity": 24, "packaging_units": 12,
            "unit_price": 100, "customer_selling_price": 100,
        })

    async def _teardown():
        db = _db()
        await db.invoices.delete_many({
            "tenant_id": TENANT_ID,
            "source_id": delivery_id,
            "source": "external_billing",
        })
        await db.counters.delete_one({"tenant_id": TENANT_ID, "key": "external_billing_entry"})
        await db.distributor_delivery_items.delete_one({"id": item_id})
        await db.distributor_deliveries.delete_one({"id": delivery_id})
        await db.distributor_shipment_items.delete_one({"id": shipment_item_id})
        await db.distributor_shipments.delete_one({"id": shipment_id})
        await db.accounts.delete_one({"id": account_id})
        await db.master_skus.delete_one({"id": sku_id})
        await db.distributor_locations.delete_one({"id": location_id})
        await db.distributors.delete_one({"id": distributor_id})

    asyncio.run(_setup())
    yield {
        "distributor_id": distributor_id,
        "location_id": location_id,
        "sku_id": sku_id,
        "account_id": account_id,
        "delivery_id": delivery_id,
    }
    asyncio.run(_teardown())


class TestExternalBillingEntry:

    def test_complete_delivery_creates_ebe(self, token, scenario):
        r = requests.post(
            f"{BASE_URL}/api/distributors/{scenario['distributor_id']}/deliveries/"
            f"{scenario['delivery_id']}/complete",
            headers=_auth(token), timeout=20,
        )
        assert r.status_code == 200, r.text
        # Verify EBE row written to `invoices`
        async def _read():
            db = _db()
            inv = await db.invoices.find_one({
                "tenant_id": TENANT_ID,
                "source_id": scenario["delivery_id"],
                "source": "external_billing",
            }, {"_id": 0})
            delivery = await db.distributor_deliveries.find_one(
                {"id": scenario["delivery_id"]}, {"_id": 0}
            )
            return inv, delivery
        invoice, delivery = asyncio.run(_read())
        assert invoice is not None, "EBE row was not created"
        assert invoice["source"] == "external_billing"
        assert invoice["invoice_number"].startswith("EXT_"), invoice["invoice_number"]
        # Outstanding/aging must NOT be tracked.
        assert invoice["outstanding"] == 0
        # Stamped on the delivery for UI surfacing
        assert delivery.get("external_billing_entry_number") == invoice["invoice_number"]

    def test_ebe_pdf_renders_with_no_gst_rows(self, token, scenario):
        r = requests.get(
            f"{BASE_URL}/api/distributors/{scenario['distributor_id']}/deliveries/"
            f"{scenario['delivery_id']}/customer-invoice",
            headers=_auth(token), timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("application/pdf")
        body = r.content
        reader = pypdf.PdfReader(BytesIO(body))
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        assert "EXTERNAL BILLING ENTRY" in text, text[:500]
        assert "NOT a tax invoice" in text or "not a tax invoice" in text.lower(), text[:500]
        assert "CGST" not in text and "SGST" not in text, "GST rows must not appear on EBE"
        # The same EXT_ number must appear on the PDF
        assert "EXT_" in text

    def test_complete_delivery_is_idempotent(self, token, scenario):
        """A re-complete (e.g., double-click) must NOT generate a second EBE."""
        async def _count():
            db = _db()
            return await db.invoices.count_documents({
                "tenant_id": TENANT_ID,
                "source_id": scenario["delivery_id"],
                "source": "external_billing",
            })
        # The first complete already happened in test_complete_delivery_creates_ebe.
        count_before = asyncio.run(_count())
        # Re-completing should be a no-op (already complete status).
        r = requests.post(
            f"{BASE_URL}/api/distributors/{scenario['distributor_id']}/deliveries/"
            f"{scenario['delivery_id']}/complete",
            headers=_auth(token), timeout=20,
        )
        # Either a 200 (idempotent) or a 400 (already complete) — either way,
        # the count must not increase.
        count_after = asyncio.run(_count())
        assert count_after == count_before, f"EBE was duplicated: {count_before} → {count_after}"


@pytest.fixture
def historical_scenario():
    """A historical completed delivery for a distributor-billed account, with
    no EBE yet — for the backfill endpoint."""
    distributor_id = str(uuid.uuid4())
    location_id = str(uuid.uuid4())
    sku_id = str(uuid.uuid4())
    account_id = str(uuid.uuid4())
    delivery_id = str(uuid.uuid4())
    item_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    async def _setup():
        db = _db()
        await db.distributors.insert_one({
            "id": distributor_id, "tenant_id": TENANT_ID,
            "distributor_name": "ITER188 Backfill", "distributor_code": "DIST-ITER188B",
            "billing_approach": "margin_upfront",
        })
        await db.distributor_locations.insert_one({
            "id": location_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "location_name": "ITER188B WH", "city": "Hyderabad",
            "is_factory": False, "status": "active",
        })
        await db.master_skus.insert_one({
            "id": sku_id, "tenant_id": TENANT_ID,
            "sku_name": "ITER188B SKU", "is_active": True,
        })
        await db.accounts.insert_one({
            "id": account_id, "tenant_id": TENANT_ID,
            "account_name": "ITER188B Cust", "city": "Hyderabad",
            "billed_by": "distributor",
            "sku_pricing": [{"sku_id": sku_id, "sku_name": "ITER188B SKU",
                              "price_per_unit": 90, "packaging_units": 12}],
        })
        # Pre-completed delivery from "before" the EBE feature existed.
        await db.distributor_deliveries.insert_one({
            "id": delivery_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "distributor_location_id": location_id,
            "account_id": account_id, "account_name": "ITER188B Cust",
            "delivery_number": "DEL-ITER188B-OLD",
            "delivery_date": "2026-01-15",
            "status": "complete", "completed_at": "2026-01-15T10:00:00+00:00",
            "created_at": "2026-01-15T09:00:00+00:00",
        })
        await db.distributor_delivery_items.insert_one({
            "id": item_id, "tenant_id": TENANT_ID,
            "delivery_id": delivery_id,
            "sku_id": sku_id, "sku_name": "ITER188B SKU",
            "quantity": 12, "packaging_units": 12, "unit_price": 90,
        })

    async def _teardown():
        db = _db()
        await db.invoices.delete_many({"source_id": delivery_id})
        await db.distributor_delivery_items.delete_one({"id": item_id})
        await db.distributor_deliveries.delete_one({"id": delivery_id})
        await db.accounts.delete_one({"id": account_id})
        await db.master_skus.delete_one({"id": sku_id})
        await db.distributor_locations.delete_one({"id": location_id})
        await db.distributors.delete_one({"id": distributor_id})

    asyncio.run(_setup())
    yield {"distributor_id": distributor_id, "delivery_id": delivery_id}
    asyncio.run(_teardown())


def test_backfill_generates_ebe_for_historical_delivery(token, historical_scenario):
    r = requests.post(
        f"{BASE_URL}/api/distributors/{historical_scenario['distributor_id']}/external-billing/backfill",
        headers=_auth(token), timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] >= 1, body

    # Idempotency — second call creates nothing new
    r2 = requests.post(
        f"{BASE_URL}/api/distributors/{historical_scenario['distributor_id']}/external-billing/backfill",
        headers=_auth(token), timeout=30,
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["created"] == 0

    async def _check():
        db = _db()
        inv = await db.invoices.find_one({
            "source_id": historical_scenario["delivery_id"],
            "source": "external_billing",
        }, {"_id": 0})
        return inv
    inv = asyncio.run(_check())
    assert inv is not None
    assert inv["invoice_number"].startswith("EXT_")
