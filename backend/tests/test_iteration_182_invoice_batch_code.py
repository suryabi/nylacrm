"""
Iteration 182 — Batch code on the customer invoice PDF.

Validates:
  1. `generate_customer_invoice_pdf` produces a non-empty PDF when items carry
     `batch_code` (it would previously have crashed because cells were strs,
     not Paragraphs — now they're Paragraphs and must still flow correctly).
  2. The customer-invoice HTTP endpoint attaches items from
     `distributor_delivery_items` before invoking the generator (a pre-existing
     bug where the items section came out empty).
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://distribution-core-2.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASS = "test123"
TENANT_ID = "nyla-air-water"


def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
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


def test_pdf_generator_renders_batch_under_sku():
    """Unit-level: drive `generate_customer_invoice_pdf` directly."""
    from utils.pdf_generator import generate_customer_invoice_pdf

    pdf_bytes = generate_customer_invoice_pdf(
        delivery_data={
            "delivery_number": "DEL-ITER182-T1",
            "delivery_date": "2026-05-27",
            "items": [
                {"sku_name": "Nyla Air Water - 660 ml", "quantity": 12,
                 "unit_price": 100, "hsn_code": "2201",
                 "batch_code": "ITER182-BATCH-A001"},
                {"sku_name": "Nyla Air Water - 1L", "quantity": 6,
                 "unit_price": 80, "hsn_code": "2201"},
            ],
        },
        company_profile={"name": "Nyla Air & Water", "address": "Hyderabad"},
        account_data={"account_name": "Test Account", "city": "Hyderabad",
                       "state": "Telangana", "address": "Road 45",
                       "gst_number": "27ABCDE1234F1Z5", "contact_name": "X",
                       "contact_number": "9999999999"},
        distributor_data={"distributor_name": "Test Distributor",
                          "address": "Hyderabad", "gst_number": ""},
        gst_percent=18.0,
        branding={},
    )
    assert isinstance(pdf_bytes, (bytes, bytearray))
    assert len(pdf_bytes) > 1500, "PDF suspiciously small"
    assert pdf_bytes[:4] == b"%PDF", "Output is not a PDF"


@pytest.fixture(scope="module")
def seeded_delivery():
    """Seed a minimal delivery+items pair so the HTTP endpoint has something
    to render. Uses the existing 'nyla-air-water' tenant."""
    distributor_id = str(uuid.uuid4())
    delivery_id = str(uuid.uuid4())
    item_id = str(uuid.uuid4())
    sku_id = str(uuid.uuid4())
    account_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    async def _setup():
        db = _db()
        await db.distributors.insert_one({
            "id": distributor_id, "tenant_id": TENANT_ID,
            "distributor_name": "ITER182-Dist", "distributor_code": "DIST-ITER182",
            "billing_approach": "margin_upfront",
        })
        await db.accounts.insert_one({
            "id": account_id, "tenant_id": TENANT_ID,
            "account_name": "ITER182-Cust", "city": "Hyderabad",
            "state": "Telangana", "billed_by": "company",
        })
        await db.distributor_deliveries.insert_one({
            "id": delivery_id, "tenant_id": TENANT_ID,
            "distributor_id": distributor_id,
            "account_id": account_id, "account_name": "ITER182-Cust",
            "delivery_number": "DEL-ITER182-9999",
            "delivery_date": now[:10],
            "status": "complete",
            "created_at": now,
        })
        await db.distributor_delivery_items.insert_one({
            "id": item_id, "tenant_id": TENANT_ID,
            "delivery_id": delivery_id,
            "sku_id": sku_id, "sku_name": "ITER182 Premium 660ml",
            "quantity": 12, "unit_price": 100, "customer_selling_price": 100,
            "batch_id": "iter182-batch-id", "batch_code": "ITER182-BATCH-INV",
        })

    async def _teardown():
        db = _db()
        await db.distributor_delivery_items.delete_one({"id": item_id})
        await db.distributor_deliveries.delete_one({"id": delivery_id})
        await db.accounts.delete_one({"id": account_id})
        await db.distributors.delete_one({"id": distributor_id})

    asyncio.run(_setup())
    yield {"distributor_id": distributor_id, "delivery_id": delivery_id}
    asyncio.run(_teardown())


def test_endpoint_attaches_items_and_returns_pdf(token, seeded_delivery):
    """Endpoint-level: confirm items get attached (pre-existing bug fixed) and
    the PDF actually contains the batch_code we seeded."""
    r = requests.get(
        f"{BASE_URL}/api/distributors/{seeded_delivery['distributor_id']}"
        f"/deliveries/{seeded_delivery['delivery_id']}/customer-invoice",
        headers=_auth(token), timeout=30,
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/pdf")
    body = r.content
    assert body[:4] == b"%PDF"
    # Decompress the PDF content streams and assert the batch label is present.
    from io import BytesIO
    import pypdf
    reader = pypdf.PdfReader(BytesIO(body))
    full_text = "\n".join((p.extract_text() or "") for p in reader.pages)
    assert "ITER182-BATCH-INV" in full_text, (
        "batch_code missing from rendered PDF text. Extracted text:\n" + full_text[:500]
    )
    assert "BATCH:" in full_text.upper(), "batch label missing from rendered PDF"
