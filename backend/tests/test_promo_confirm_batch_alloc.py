"""Backend pytest for the batch FIFO auto-allocation fix in
POST /api/distributors/{distributor_id}/promo-deliveries/{dispatch_id}/confirm.

Bug: confirming a DRAFT promo stock-out at a batch-tracked warehouse failed with
"Insufficient stock ... need 1, available 0" when the line items were
batch-less (auto-created from a Delivery Order). The fix auto-allocates batches
FIFO (reservation-aware) and rewrites the delivery_items.

Tests verify:
  1. happy path on batch-tracked source: batch-less qty 6 -> FIFO split QB1:5 + QB2:1
  2. reservation-aware shortfall: second over-demand draft returns
     "need 5, available 2." (not 0)
  3. regression: non-batch-tracked source still works (no allocation attempted)
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


# ---- env / config ----------------------------------------------------------
load_dotenv("/app/backend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get(
    "REACT_APP_BACKEND_URL") else "https://category-unify.preview.emergentagent.com"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
TENANT = "nyla-air-water"

CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
CEO_PASSWORD = "test123"

QA_DIST = "qa-dist-1"
QA_LOC_BATCH = "qa-wh-1"          # track_batches=True
QA_LOC_PLAIN = "qa-wh-2"          # track_batches=False (regression)
QA_LOC_FACTORY = "qa-factory-1"   # required by problem statement (existence only)


# ---- helpers ---------------------------------------------------------------
def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


async def _db():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


async def _cleanup():
    db = await _db()
    # Wipe everything qa-* we may have created across runs.
    await db.distributors.delete_many({"tenant_id": TENANT, "id": QA_DIST})
    await db.distributor_locations.delete_many(
        {"tenant_id": TENANT, "id": {"$in": [QA_LOC_BATCH, QA_LOC_PLAIN, QA_LOC_FACTORY]}})
    await db.distributor_stock.delete_many(
        {"tenant_id": TENANT, "distributor_id": QA_DIST})
    # Delete deliveries (and their items) tagged with our distributor.
    delivery_ids = await db.distributor_deliveries.distinct(
        "id", {"tenant_id": TENANT, "distributor_id": QA_DIST})
    if delivery_ids:
        await db.distributor_delivery_items.delete_many(
            {"tenant_id": TENANT, "delivery_id": {"$in": delivery_ids}})
        await db.distributor_deliveries.delete_many(
            {"tenant_id": TENANT, "id": {"$in": delivery_ids}})


async def _setup_common():
    """Distributor + 1 factory + 1 batch-tracked + 1 plain warehouse."""
    db = await _db()
    now = datetime.now(timezone.utc).isoformat()
    await db.distributors.insert_one({
        "id": QA_DIST, "tenant_id": TENANT,
        "distributor_name": "QA Test Distributor",
        "distributor_code": "QA-1", "status": "active",
        "created_at": now, "updated_at": now,
    })
    await db.distributor_locations.insert_many([
        {"id": QA_LOC_FACTORY, "tenant_id": TENANT, "distributor_id": QA_DIST,
         "location_name": "QA Factory", "is_factory": True,
         "track_batches": False, "is_default": False, "status": "active",
         "created_at": now, "updated_at": now},
        {"id": QA_LOC_BATCH, "tenant_id": TENANT, "distributor_id": QA_DIST,
         "location_name": "QA Batch WH", "is_factory": False,
         "track_batches": True, "is_default": True, "status": "active",
         "created_at": now, "updated_at": now},
        {"id": QA_LOC_PLAIN, "tenant_id": TENANT, "distributor_id": QA_DIST,
         "location_name": "QA Plain WH", "is_factory": False,
         "track_batches": False, "is_default": False, "status": "active",
         "created_at": now, "updated_at": now},
    ])


async def _pick_sku_id() -> tuple[str, str]:
    db = await _db()
    sku = await db.master_skus.find_one({}, {"_id": 0, "id": 1, "sku_name": 1})
    assert sku, "no master_skus seeded"
    return sku["id"], sku.get("sku_name") or "QA SKU"


async def _seed_batch_stock(sku_id: str):
    db = await _db()
    await db.distributor_stock.insert_many([
        {"id": str(uuid.uuid4()), "tenant_id": TENANT,
         "distributor_id": QA_DIST, "distributor_location_id": QA_LOC_BATCH,
         "sku_id": sku_id, "batch_id": "QB1", "batch_code": "QB1",
         "quantity": 5, "created_at": "2026-01-01T00:00:00+00:00"},
        {"id": str(uuid.uuid4()), "tenant_id": TENANT,
         "distributor_id": QA_DIST, "distributor_location_id": QA_LOC_BATCH,
         "sku_id": sku_id, "batch_id": "QB2", "batch_code": "QB2",
         "quantity": 3, "created_at": "2026-02-01T00:00:00+00:00"},
    ])


async def _seed_plain_stock(sku_id: str):
    db = await _db()
    await db.distributor_stock.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": TENANT,
        "distributor_id": QA_DIST, "distributor_location_id": QA_LOC_PLAIN,
        "sku_id": sku_id, "batch_id": None, "batch_code": None,
        "quantity": 10, "created_at": "2026-01-01T00:00:00+00:00",
    })


async def _create_draft_promo(loc_id: str, sku_id: str, sku_name: str,
                              qty: int) -> str:
    """Insert a draft promo distributor_delivery + 1 batch-less item. Returns id."""
    db = await _db()
    did = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    challan = f"QA-CH-{did[:8]}"
    await db.distributor_deliveries.insert_one({
        "id": did, "tenant_id": TENANT,
        "is_promo": True, "status": "draft",
        "distributor_id": QA_DIST, "distributor_name": "QA Test Distributor",
        "distributor_location_id": loc_id, "is_factory": False,
        "delivery_number": challan, "challan_number": challan,
        "promo_reason": "Sampling",
        "total_quantity": qty, "total_indicative_value": qty * 100,
        "created_at": now, "updated_at": now,
    })
    await db.distributor_delivery_items.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": TENANT, "delivery_id": did,
        "sku_id": sku_id, "sku_name": sku_name, "sku_code": None,
        "quantity": qty, "unit_price": 100.0,
        "batch_id": None, "batch_code": None,
        "line_value": qty * 100.0,
    })
    return did


async def _fetch_items(did: str) -> list:
    db = await _db()
    return await db.distributor_delivery_items.find(
        {"tenant_id": TENANT, "delivery_id": did}, {"_id": 0}).to_list(100)


async def _fetch_delivery(did: str) -> dict:
    db = await _db()
    return await db.distributor_deliveries.find_one(
        {"tenant_id": TENANT, "id": did}, {"_id": 0}) or {}


# ---- fixtures --------------------------------------------------------------
@pytest.fixture(scope="module")
def session() -> requests.Session:
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": CEO_EMAIL, "password": CEO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module", autouse=True)
def db_state():
    asyncio.run(_cleanup())
    asyncio.run(_setup_common())
    yield
    asyncio.run(_cleanup())


@pytest.fixture(scope="module")
def sku() -> tuple[str, str]:
    return asyncio.run(_pick_sku_id())


# ---- tests -----------------------------------------------------------------
def test_1_batchless_draft_auto_allocates_fifo(session, sku):
    """Confirm a batch-less qty=6 draft at a batch-tracked source. Expect 200
    and items rewritten to QB1 qty 5 + QB2 qty 1, status confirmed."""
    sku_id, sku_name = sku
    asyncio.run(_seed_batch_stock(sku_id))
    did = asyncio.run(_create_draft_promo(QA_LOC_BATCH, sku_id, sku_name, 6))

    r = session.post(
        f"{BASE_URL}/api/distributors/{QA_DIST}/promo-deliveries/{did}/confirm",
        timeout=30)
    assert r.status_code == 200, f"expected 200; got {r.status_code} body={r.text}"
    body = r.json()
    assert "confirmed" in (body.get("message") or "").lower(), body

    # DB assertions: items split FIFO and persisted.
    items = asyncio.run(_fetch_items(did))
    assert len(items) == 2, items
    by_batch = {it["batch_id"]: it for it in items}
    assert "QB1" in by_batch and "QB2" in by_batch, by_batch
    assert by_batch["QB1"]["quantity"] == 5
    assert by_batch["QB2"]["quantity"] == 1
    assert by_batch["QB1"]["line_value"] == 500.0
    assert by_batch["QB2"]["line_value"] == 100.0
    assert by_batch["QB1"]["batch_code"] == "QB1"
    assert by_batch["QB2"]["batch_code"] == "QB2"
    # sku_id preserved on both lines.
    for it in items:
        assert it["sku_id"] == sku_id

    d = asyncio.run(_fetch_delivery(did))
    assert d.get("status") == "confirmed", d


def test_2_reservation_aware_shortfall(session, sku):
    """A second batch-less draft qty=5 on the same warehouse must report
    'need 5, available 2.' because the previously-confirmed promo reserves 6
    of the 8 total available batched units."""
    sku_id, sku_name = sku
    did = asyncio.run(_create_draft_promo(QA_LOC_BATCH, sku_id, sku_name, 5))

    r = session.post(
        f"{BASE_URL}/api/distributors/{QA_DIST}/promo-deliveries/{did}/confirm",
        timeout=30)
    assert r.status_code == 400, f"expected 400; got {r.status_code} body={r.text}"
    detail = (r.json() or {}).get("detail") or ""
    assert "need 5" in detail, f"detail must say 'need 5': {detail!r}"
    assert "available 2" in detail, f"detail must say 'available 2': {detail!r}"
    assert "available 0" not in detail, f"must NOT say 'available 0': {detail!r}"

    # Items must remain batch-less (no rewrite when allocation fails).
    items = asyncio.run(_fetch_items(did))
    assert len(items) == 1
    assert items[0].get("batch_id") in (None, "")

    d = asyncio.run(_fetch_delivery(did))
    assert d.get("status") == "draft", d


def test_3_regression_non_batch_location(session, sku):
    """Non-batch-tracked warehouse: confirm a batch-less qty=3 draft and
    ensure (a) HTTP 200 and (b) no batch_id added to the line item."""
    sku_id, sku_name = sku
    asyncio.run(_seed_plain_stock(sku_id))
    did = asyncio.run(_create_draft_promo(QA_LOC_PLAIN, sku_id, sku_name, 3))

    r = session.post(
        f"{BASE_URL}/api/distributors/{QA_DIST}/promo-deliveries/{did}/confirm",
        timeout=30)
    assert r.status_code == 200, f"expected 200; got {r.status_code} body={r.text}"

    items = asyncio.run(_fetch_items(did))
    assert len(items) == 1, items
    assert items[0]["quantity"] == 3
    # Line untouched - no batch allocation on a non-batch source.
    assert items[0].get("batch_id") in (None, "")
    assert items[0].get("batch_code") in (None, "")

    d = asyncio.run(_fetch_delivery(did))
    assert d.get("status") == "confirmed", d
