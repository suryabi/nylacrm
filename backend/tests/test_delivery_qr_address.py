"""
Tests for the "delivery bundle & challan must ALWAYS show address + Google
Maps QR" bug fix. Covers:
  1. Individual promo challan PDF — HTTP 200, application/pdf, embedded
     Image XObjects (logo + QR).
  2. Address-missing guard on the challan PDF — temp promo doc with no
     address anywhere → PDF still builds (HTTP 200).
  3. Schedule bundle driver-sheet — exercised by directly calling
     `_enrich_schedule` + `_build_schedule_pdf` (the HTTP endpoint resolves
     the distributor from a distributor-portal user, not a CEO).
  4. Promo recipient address resolution (bundle) — temp promo whose only
     address sits on the contact / `delivery_address` string must NOT
     show '—'; the bundle PDF must include a QR for it.
  5. Regression — a regular non-promo account-based delivery still
     resolves its address from the account and the bundle PDF still
     builds.

All temp ids are prefixed `qa-` and cleaned up at the end.
"""
import os
import sys
import uuid
import asyncio
import pytest
import requests

# Ensure /app/backend is importable so we can hit _enrich_schedule directly
sys.path.insert(0, "/app/backend")
# Load backend .env explicitly — `pytest` doesn't pick up shell exports of
# quoted values reliably.
from dotenv import load_dotenv  # noqa: E402
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://accounting-inbox.preview.emergentagent.com").rstrip("/")
TENANT_ID = "nyla-air-water"
CEO_EMAIL = "surya.yadavalli@nylaairwater.earth"
CEO_PASSWORD = "test123"

EXISTING_DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
EXISTING_PROMO_ID       = "9d4d2c0b-f37a-41b2-b0b3-6889950c2910"
EXISTING_SCHEDULE_ID    = "e2ec4623-7f5e-4020-91a7-8b0ae9f3b9a1"
EXISTING_SCHEDULE_DIST  = "b8876367-df64-4c55-a382-d5eb3b4b2380"


# ----------------------------------------------------------------------------
# Helpers / fixtures
# ----------------------------------------------------------------------------

@pytest.fixture(scope="module")
def ceo_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": CEO_EMAIL, "password": CEO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"CEO login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def motor_db_factory():
    """Returns a callable that builds a fresh AsyncIOMotorClient bound to the
    *current* event loop. Each test creates its own loop, so we must build
    the client inside that loop, not at module scope."""
    def _make():
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        return client[os.environ["DB_NAME"]]
    return _make


def _pdf_image_count(data: bytes) -> int:
    """Count embedded image XObjects in a PDF — used to verify a QR was drawn.

    Per the spec: ``data.count(b'/Image') >= 2`` (logo + QR) OR
    ``b'/Subtype /Image'`` present. We return the *maximum* of the two counts
    so a caller can assert >= 1 (QR present) or >= 2 (logo + QR)."""
    return max(data.count(b"/Subtype /Image"), data.count(b"/Image") // 2 if data.count(b"/Image") else 0)


def _pdf_has_embedded_image(data: bytes) -> bool:
    """True when the PDF contains at least one image XObject (logo or QR)."""
    return b"/Subtype /Image" in data or data.count(b"/Image") >= 2


def _looks_like_pdf(data: bytes) -> bool:
    return data[:4] == b"%PDF"


# ----------------------------------------------------------------------------
# 1. Existing promo challan PDF — must contain logo + QR
# ----------------------------------------------------------------------------

class TestPromoChallanPdf:

    def test_challan_pdf_returns_pdf_with_qr(self, ceo_session):
        url = f"{BASE_URL}/api/distributors/{EXISTING_DISTRIBUTOR_ID}/promo-deliveries/{EXISTING_PROMO_ID}/challan-pdf"
        r = ceo_session.get(url, timeout=60)
        assert r.status_code == 200, f"challan-pdf status={r.status_code}, body[:200]={r.content[:200]!r}"
        assert "application/pdf" in r.headers.get("content-type", "").lower()
        assert _looks_like_pdf(r.content), "Response is not a valid PDF (missing %PDF header)"
        # Per spec: data.count(b'/Image') >= 2 (logo + QR) OR b'/Subtype /Image' present.
        # The existing promo has a contact_address (Bengaluru) so the QR MUST be drawn.
        assert _pdf_has_embedded_image(r.content), (
            f"Expected at least one embedded image XObject (Google-Maps QR). "
            f"/Image count={r.content.count(b'/Image')}, "
            f"/Subtype /Image count={r.content.count(b'/Subtype /Image')}. "
            f"Bug: QR likely not drawn for an address-only (no lat/lng) recipient."
        )


# ----------------------------------------------------------------------------
# 2. Address-missing guard — challan PDF must still build, not crash
# ----------------------------------------------------------------------------

class TestChallanAddressMissingGuard:

    def test_challan_pdf_with_no_address_still_builds(self, ceo_session, motor_db_factory):
        """Insert a stripped-down promo doc with NO address anywhere and ensure
        the challan-pdf endpoint still returns 200 + a real PDF (with the
        bold-red ADDRESS MISSING guard, which we can't OCR — we assert via
        successful PDF generation)."""
        async def setup_and_run():
            motor_db = motor_db_factory()
            promo_id = f"qa-{uuid.uuid4()}"
            item_id  = f"qa-{uuid.uuid4()}"
            doc = {
                "id": promo_id,
                "tenant_id": TENANT_ID,
                "distributor_id": EXISTING_DISTRIBUTOR_ID,
                "is_promo": True,
                "status": "draft",
                "challan_number": f"QA-NO-ADDR-{promo_id[-6:]}",
                "challan_date": "2026-01-01",
                "contact_name": "Bug Test Promo Contact",
                "contact_company": "QA Co",
                "contact_phone": "9999999999",
                # NO contact_address / NO delivery_address / NO recipient_shipping_address
                "contact_address": None,
                "delivery_address": None,
                "recipient_shipping_address": {},
                "purpose": "Sampling",
                "total_quantity": 1,
                "total_value": 10.0,
                "zoho_sync_status": "pending",   # NOT 'synced' → we hit local PDF path
            }
            line = {
                "id": item_id,
                "tenant_id": TENANT_ID,
                "delivery_id": promo_id,
                "sku_id": "qa-sku",
                "sku_name": "QA Test SKU",
                "sku_code": "QA-SKU-001",
                "quantity": 1,
                "unit_price": 10.0,
            }
            await motor_db.distributor_deliveries.insert_one(doc)
            await motor_db.distributor_delivery_items.insert_one(line)
            return promo_id, item_id

        async def teardown(promo_id, item_id):
            motor_db = motor_db_factory()
            await motor_db.distributor_delivery_items.delete_one({"id": item_id, "tenant_id": TENANT_ID})
            await motor_db.distributor_deliveries.delete_one({"id": promo_id, "tenant_id": TENANT_ID})

        loop = asyncio.new_event_loop()
        try:
            promo_id, item_id = loop.run_until_complete(setup_and_run())
            try:
                url = f"{BASE_URL}/api/distributors/{EXISTING_DISTRIBUTOR_ID}/promo-deliveries/{promo_id}/challan-pdf"
                r = ceo_session.get(url, timeout=60)
                assert r.status_code == 200, (
                    f"challan-pdf with no address must NOT crash. Got {r.status_code}: {r.content[:200]!r}"
                )
                assert _looks_like_pdf(r.content), "Response is not a valid PDF"
                # No QR is expected — but the PDF must still build (with the
                # red 'ADDRESS MISSING' guard text). We can't OCR the text;
                # asserting 200 + valid PDF header is enough per spec.
            finally:
                loop.run_until_complete(teardown(promo_id, item_id))
        finally:
            loop.close()


# ----------------------------------------------------------------------------
# 3. Schedule bundle (existing) — _enrich_schedule + _build_schedule_pdf
# ----------------------------------------------------------------------------

class TestScheduleBundleDriverSheet:

    def test_existing_schedule_enrich_and_pdf(self, motor_db_factory):
        async def run():
            import routes.distributor_delivery_schedules as S
            motor_db = motor_db_factory()
            S.db = motor_db
            s = await motor_db.distributor_delivery_schedules.find_one(
                {"id": EXISTING_SCHEDULE_ID, "tenant_id": TENANT_ID}, {"_id": 0})
            assert s, f"Schedule {EXISTING_SCHEDULE_ID} not found"
            dist = await motor_db.distributors.find_one(
                {"id": EXISTING_SCHEDULE_DIST, "tenant_id": TENANT_ID}, {"_id": 0})
            assert dist, f"Distributor {EXISTING_SCHEDULE_DIST} not found"
            enriched = await S._enrich_schedule(s, TENANT_ID)
            return enriched, dist, S

        loop = asyncio.new_event_loop()
        try:
            enriched, dist, S = loop.run_until_complete(run())
        finally:
            loop.close()

        deliveries = enriched.get("deliveries") or []
        assert len(deliveries) > 0, "Expected at least one stop on the existing test schedule"

        # Every stop must have a resolvable address (NOT '—').
        for i, stop in enumerate(deliveries):
            addr = stop.get("delivery_address") or {}
            has_formatted = bool(addr.get("formatted"))
            has_line_city = bool(addr.get("address_line1") and addr.get("city"))
            assert has_formatted or has_line_city, (
                f"Stop #{i} (delivery_id={stop.get('id')}) resolved to an EMPTY address "
                f"— bundle would show '—'. Address dict: {addr!r}"
            )

        # Build the PDF (use module function — distributor doc is passed in)
        pdf_bytes = S._build_schedule_pdf(enriched, dist)
        assert _looks_like_pdf(pdf_bytes), "Schedule PDF is not a valid PDF"
        assert _pdf_has_embedded_image(pdf_bytes), (
            f"Schedule PDF expected to embed at least one image XObject (Maps QR per stop). "
            f"/Image count={pdf_bytes.count(b'/Image')}, "
            f"/Subtype /Image count={pdf_bytes.count(b'/Subtype /Image')}. "
            f"Bug: QRs likely not drawn for stops without lat/lng."
        )


# ----------------------------------------------------------------------------
# 4. Promo recipient address resolution (bundle) — temp promo whose only
#    address sits on the contact + delivery_address string. Bundle must
#    resolve a non-empty address and embed a QR.
# ----------------------------------------------------------------------------

class TestPromoRecipientAddressResolution:

    def test_promo_recipient_address_resolves_in_bundle(self, motor_db_factory):
        async def run():
            import routes.distributor_delivery_schedules as S
            motor_db = motor_db_factory()
            S.db = motor_db

            # Find an existing contact that has SOME address (city) — we'll
            # point our promo at it to exercise the recipient-address path.
            contact = await motor_db.contacts.find_one(
                {"tenant_id": TENANT_ID, "$or": [{"city": {"$ne": None, "$ne": ""}}, {"delivery_address.city": {"$ne": None, "$ne": ""}}]},
                {"_id": 0})
            if not contact:
                pytest.skip("No contact with an address found to seed promo recipient test")

            promo_id = f"qa-{uuid.uuid4()}"
            sched_id = f"qa-{uuid.uuid4()}"
            item_id  = f"qa-{uuid.uuid4()}"

            promo_doc = {
                "id": promo_id,
                "tenant_id": TENANT_ID,
                "distributor_id": EXISTING_SCHEDULE_DIST,
                "is_promo": True,
                "status": "draft",
                "recipient_type": "contact",
                "contact_id": contact["id"],
                "contact_name": contact.get("name") or f"{contact.get('first_name','')} {contact.get('last_name','')}".strip(),
                # plain string address — the resolver must fall back to this when
                # the dict / account lookup yields nothing
                "delivery_address": "MG Road, Bengaluru, Karnataka 560001",
                "challan_number": f"QA-PROMO-{promo_id[-6:]}",
                "total_quantity": 1,
                "total_value": 50.0,
            }
            item_doc = {
                "id": item_id,
                "tenant_id": TENANT_ID,
                "delivery_id": promo_id,
                "sku_id": "qa-sku",
                "sku_name": "QA Promo SKU",
                "sku_code": "QA-PR-001",
                "quantity": 1,
                "unit_price": 50.0,
            }
            sched_doc = {
                "id": sched_id,
                "tenant_id": TENANT_ID,
                "distributor_id": EXISTING_SCHEDULE_DIST,
                "schedule_date": "2026-01-01",
                "delivery_ids": [promo_id],
                "status": "draft",
                "priority_order": 999,
            }
            await motor_db.distributor_deliveries.insert_one(promo_doc)
            await motor_db.distributor_delivery_items.insert_one(item_doc)
            await motor_db.distributor_delivery_schedules.insert_one(sched_doc)

            try:
                enriched = await S._enrich_schedule(sched_doc, TENANT_ID)
                deliveries = enriched.get("deliveries") or []
                assert len(deliveries) == 1
                stop = deliveries[0]
                addr = stop.get("delivery_address") or {}
                # The address must NOT be empty — that's the whole bug.
                assert addr, "Resolved address dict is empty — bundle would show '—'"
                has_text = bool(
                    addr.get("formatted")
                    or addr.get("city")
                    or addr.get("address_line1")
                )
                assert has_text, (
                    f"Resolved address has no usable text — bundle would show '—'. Got {addr!r}"
                )

                dist = await motor_db.distributors.find_one(
                    {"id": EXISTING_SCHEDULE_DIST, "tenant_id": TENANT_ID}, {"_id": 0}) or {}
                pdf_bytes = S._build_schedule_pdf(enriched, dist)
                assert _looks_like_pdf(pdf_bytes), "Schedule PDF is not a valid PDF"
                assert _pdf_has_embedded_image(pdf_bytes), (
                    "Expected at least one image XObject (QR) in the bundle PDF for a promo stop with an address"
                )
            finally:
                await motor_db.distributor_delivery_items.delete_one({"id": item_id, "tenant_id": TENANT_ID})
                await motor_db.distributor_deliveries.delete_one({"id": promo_id, "tenant_id": TENANT_ID})
                await motor_db.distributor_delivery_schedules.delete_one({"id": sched_id, "tenant_id": TENANT_ID})

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(run())
        finally:
            loop.close()


# ----------------------------------------------------------------------------
# 5. Regression — account-based non-promo delivery still resolves and builds
# ----------------------------------------------------------------------------

class TestRegularAccountDeliveryRegression:

    def test_account_delivery_resolves_and_pdf_builds(self, motor_db_factory):
        async def run():
            import routes.distributor_delivery_schedules as S
            motor_db = motor_db_factory()
            S.db = motor_db

            account = await motor_db.accounts.find_one(
                {"tenant_id": TENANT_ID,
                 "$or": [
                     {"delivery_address.city": {"$ne": None, "$ne": ""}},
                     {"billing_address.city": {"$ne": None, "$ne": ""}},
                 ]},
                {"_id": 0})
            if not account:
                pytest.skip("No account with delivery/billing address found for regression test")

            promo_id = f"qa-{uuid.uuid4()}"
            sched_id = f"qa-{uuid.uuid4()}"
            item_id  = f"qa-{uuid.uuid4()}"

            delivery_doc = {
                "id": promo_id,                       # reuse id var; this is a regular delivery
                "tenant_id": TENANT_ID,
                "distributor_id": EXISTING_SCHEDULE_DIST,
                "is_promo": False,
                "status": "draft",
                "account_id": account["id"],
                "account_name": account.get("account_name"),
                "delivery_number": f"QA-DLV-{promo_id[-6:]}",
                "total_quantity": 1,
                "total_value": 100.0,
            }
            item_doc = {
                "id": item_id,
                "tenant_id": TENANT_ID,
                "delivery_id": promo_id,
                "sku_id": "qa-sku",
                "sku_name": "QA Regular SKU",
                "sku_code": "QA-RG-001",
                "quantity": 2,
                "unit_price": 50.0,
            }
            sched_doc = {
                "id": sched_id,
                "tenant_id": TENANT_ID,
                "distributor_id": EXISTING_SCHEDULE_DIST,
                "schedule_date": "2026-01-02",
                "delivery_ids": [promo_id],
                "status": "draft",
                "priority_order": 999,
            }
            await motor_db.distributor_deliveries.insert_one(delivery_doc)
            await motor_db.distributor_delivery_items.insert_one(item_doc)
            await motor_db.distributor_delivery_schedules.insert_one(sched_doc)
            try:
                enriched = await S._enrich_schedule(sched_doc, TENANT_ID)
                stop = (enriched.get("deliveries") or [None])[0]
                assert stop, "No delivery returned in enriched schedule"
                addr = stop.get("delivery_address") or {}
                assert (addr.get("formatted") or addr.get("city") or addr.get("address_line1")), (
                    f"Regression: regular account delivery resolved to empty address. Got {addr!r}, "
                    f"account.delivery_address={account.get('delivery_address')!r}, "
                    f"account.billing_address={account.get('billing_address')!r}"
                )
                dist = await motor_db.distributors.find_one(
                    {"id": EXISTING_SCHEDULE_DIST, "tenant_id": TENANT_ID}, {"_id": 0}) or {}
                pdf_bytes = S._build_schedule_pdf(enriched, dist)
                assert _looks_like_pdf(pdf_bytes), "Regression: bundle PDF is not a valid PDF"
            finally:
                await motor_db.distributor_delivery_items.delete_one({"id": item_id, "tenant_id": TENANT_ID})
                await motor_db.distributor_deliveries.delete_one({"id": promo_id, "tenant_id": TENANT_ID})
                await motor_db.distributor_delivery_schedules.delete_one({"id": sched_id, "tenant_id": TENANT_ID})

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(run())
        finally:
            loop.close()
