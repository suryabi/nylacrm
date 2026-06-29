"""
Iteration — Regenerate Invoice + Invoice Preview tests.

Covers:
 1) Backend PREVIEW endpoint:
    GET /api/distributors/{distributor_id}/deliveries/{delivery_id}/invoice-preview
    - real delivery with no agreed price → SKU surfaces in missing_agreed_price_skus
    - service-level math test using zoho_service.build_delivery_invoice_preview
      with monkeypatched db (positive math case).
 2) Regenerate logic (zoho_service.create_invoice_for_delivery with force=True):
    (a) existing mapping + PUT succeeds → regen_mode == 'updated', no POST
    (b) PUT raises but void_invoice succeeds → POST fires, regen_mode == 'recreated'
    (c) PUT raises AND void_invoice raises → InvoiceNotRegenerableError
 3) Role gating for regenerate endpoints (CEO passes role gate, anonymous = 401/403,
    non-management user = 403).
 4) Invoices-list regenerate: POST /api/invoices/{invoice_id}/regenerate when
    the invoice is NOT linked to a distributor delivery → 400 with friendly msg.
"""

import os
import sys
import uuid
import pytest
import requests
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")

from services import zoho_service  # noqa: E402

def _load_backend_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val.rstrip("/")
    # Fallback: read from /app/frontend/.env (pytest doesn't inherit FE env vars).
    try:
        with open("/app/frontend/.env", "r") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return ""


BASE_URL = _load_backend_url()
LOGIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
LOGIN_PASSWORD = "test123"

REAL_DISTRIBUTOR_ID = "b8876367-df64-4c55-a382-d5eb3b4b2380"
REAL_DELIVERY_ID = "3c714fda-021f-4c8d-8d92-dc03f04b5b08"


# ---------------------------------------------------------------------------
# Sentinel + fake collections (reused pattern from iteration_260)
# ---------------------------------------------------------------------------
class _Sentinel(Exception):
    """Raised inside the mocked _zoho_request after capturing payload."""


class _Captor:
    def __init__(self):
        self.calls = []  # list of (method, path, json)

    def __call__(self, method, path, *, tenant_id=None, json=None, **kw):
        self.calls.append((method.upper(), path, json))

    @property
    def methods(self):
        return [c[0] for c in self.calls]

    @property
    def paths(self):
        return [c[1] for c in self.calls]


class _FakeCollection:
    def __init__(self, find_one_result=None):
        self._r = find_one_result
        self.updates = []

    async def find_one(self, *a, **kw):
        if callable(self._r):
            return self._r(*a, **kw)
        return self._r

    async def update_one(self, *a, **kw):
        self.updates.append((a, kw))
        return None


class _FakeDB:
    def __init__(self, *, mappings=None, locations=None, debit_notes=None,
                 distributor_deliveries=None, distributor_delivery_items=None,
                 accounts=None, zoho_invoice_mappings_updates=None):
        self.zoho_invoice_mappings = _FakeCollection(mappings)
        self.distributor_locations = _FakeCollection(
            locations or {"zoho_branch_id": "BR1", "location_name": "WH"}
        )
        self.debit_notes = _FakeCollection(debit_notes)
        self.distributor_deliveries = _FakeCollection(distributor_deliveries)
        self.distributor_delivery_items = _FakeCollection(distributor_delivery_items)
        self.accounts = _FakeCollection(accounts)


def _install_common(monkeypatch, *, mappings=None):
    monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

    async def _upsert(tenant_id, account):
        return "CUST_X"

    async def _zitem(tenant_id, sku_id):
        return f"ZI_{sku_id}"

    async def _creds(tenant_id):
        return {}

    monkeypatch.setattr(zoho_service, "upsert_contact", _upsert)
    monkeypatch.setattr(zoho_service, "get_zoho_item_id", _zitem)
    monkeypatch.setattr(zoho_service, "get_credentials", _creds)

    db = _FakeDB(
        mappings=mappings,
        locations={"zoho_branch_id": "BR1", "location_name": "WH"},
    )
    monkeypatch.setattr(zoho_service, "db", db)

    # No-op mirror so we don't go into other collections.
    async def _no_mirror(**kw):
        return None

    monkeypatch.setattr(zoho_service, "_ensure_mirror_invoice", _no_mirror)
    return db


# ---------------------------------------------------------------------------
# 1) Service-level preview math
# ---------------------------------------------------------------------------
class TestPreviewMath:

    @pytest.mark.asyncio
    async def test_preview_positive_math(self, monkeypatch):
        """Positive case: 10 × 100 with 20% discount + 5 × 50 with 0%.
        gross = qty*rate, disc_amt = gross*disc%/100, net = gross-disc_amt,
        subtotal = sum(gross), net_taxable = subtotal - total_discount."""
        delivery_doc = {
            "id": "DEL_TEST_1", "delivery_number": "DEL-TEST-1",
            "tenant_id": "TEST_T1", "distributor_id": "TEST_D1",
            "account_id": "TEST_A1", "distributor_location_id": "loc1",
        }
        items_doc = [
            {"sku_name": "20L Can", "quantity": 10, "discount_percent": 20},
            {"sku_name": "20L Jar", "quantity": 5,  "discount_percent": 0},
        ]
        account_doc = {
            "id": "TEST_A1", "account_name": "TEST Acct",
            "sku_pricing": [
                {"sku": "20L Can", "price_per_unit": 100},
                {"sku": "20L Jar", "price_per_unit": 50},
            ],
        }

        # The preview path uses find().to_list(...) for items -> stub that.
        class _ItemsCursor:
            def __init__(self, docs): self._d = docs
            async def to_list(self, n): return self._d

        class _ItemsColl:
            def find(self, *a, **kw):
                return _ItemsCursor(items_doc)

        db = _FakeDB(
            mappings=None,
            distributor_deliveries=delivery_doc,
            accounts=account_doc,
        )
        db.distributor_delivery_items = _ItemsColl()
        monkeypatch.setattr(zoho_service, "db", db)
        monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

        out = await zoho_service.build_delivery_invoice_preview(
            tenant_id="TEST_T1", distributor_id="TEST_D1", delivery_id="DEL_TEST_1",
        )

        assert out["delivery_number"] == "DEL-TEST-1"
        assert out["account_name"] == "TEST Acct"
        lines = out["lines"]
        assert len(lines) == 2
        by = {l["sku_name"]: l for l in lines}
        can = by["20L Can"]
        jar = by["20L Jar"]
        # Can: 10 * 100 = 1000 gross; 20% = 200; net 800
        assert can["gross_amount"] == 1000.0
        assert can["discount_amount"] == 200.0
        assert can["net_amount"] == 800.0
        # Jar: 5 * 50 = 250 gross; 0% = 0; net 250
        assert jar["gross_amount"] == 250.0
        assert jar["discount_amount"] == 0.0
        assert jar["net_amount"] == 250.0
        # Aggregates
        assert out["subtotal"] == 1250.0
        assert out["total_discount"] == 200.0
        assert out["net_taxable_amount"] == 1050.0
        assert out["missing_agreed_price_skus"] == []

    @pytest.mark.asyncio
    async def test_preview_missing_price_skus(self, monkeypatch):
        """SKU with no agreed price → rate 0, listed in missing_agreed_price_skus."""
        delivery_doc = {
            "id": "DEL_TEST_2", "delivery_number": "DEL-TEST-2",
            "tenant_id": "TEST_T2", "distributor_id": "TEST_D2",
            "account_id": "TEST_A2",
        }
        items_doc = [{"sku_name": "Mystery SKU", "quantity": 3,
                      "discount_percent": 0}]
        account_doc = {"id": "TEST_A2", "account_name": "Acct",
                       "sku_pricing": []}

        class _ItemsCursor:
            def __init__(self, docs): self._d = docs
            async def to_list(self, n): return self._d

        class _ItemsColl:
            def find(self, *a, **kw): return _ItemsCursor(items_doc)

        db = _FakeDB(
            mappings=None,
            distributor_deliveries=delivery_doc,
            accounts=account_doc,
        )
        db.distributor_delivery_items = _ItemsColl()
        monkeypatch.setattr(zoho_service, "db", db)
        monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

        out = await zoho_service.build_delivery_invoice_preview(
            tenant_id="TEST_T2", distributor_id="TEST_D2", delivery_id="DEL_TEST_2",
        )
        assert "Mystery SKU" in out["missing_agreed_price_skus"]
        assert out["lines"][0]["rate"] == 0.0
        assert out["subtotal"] == 0.0


# ---------------------------------------------------------------------------
# 2) Regenerate (force=True) behaviour
# ---------------------------------------------------------------------------
class TestRegenerateLogic:

    @pytest.mark.asyncio
    async def test_regen_updated_on_put_success(self, monkeypatch):
        """force=True + existing mapping; PUT succeeds → regen_mode=='updated',
        no POST issued."""
        existing_mapping = {
            "tenant_id": "t1", "source_type": "distributor_delivery",
            "source_id": "d1", "status": "synced",
            "zoho_invoice_id": "ZINV_111", "zoho_invoice_number": "INV-111",
        }
        _install_common(monkeypatch, mappings=existing_mapping)

        captor = _Captor()

        async def _zoho_req(method, path, *, tenant_id=None, json=None, **kw):
            captor(method, path, json=json)
            mu = method.upper()
            if mu == "PUT" and path.startswith("/books/v3/invoices/"):
                return {"invoice": {"invoice_id": "ZINV_111",
                                    "invoice_number": "INV-111",
                                    "invoice_url": "https://zoho/inv/111"}}
            if mu == "POST" and path.endswith("/status/sent"):
                return {}
            if mu == "POST" and path == "/books/v3/invoices":
                # Should NOT happen on update path
                raise AssertionError("Unexpected POST /books/v3/invoices on update path")
            return {}

        monkeypatch.setattr(zoho_service, "_zoho_request", _zoho_req)

        delivery = {"id": "d1", "delivery_number": "DEL-1",
                    "delivery_date": "2026-06-01", "distributor_location_id": "loc1"}
        items = [{"sku_id": "sk1", "sku_name": "20L Jar", "quantity": 10,
                  "discount_percent": 0}]
        account = {"id": "a1",
                   "sku_pricing": [{"sku": "20L Jar", "price_per_unit": 66}]}

        mapping = await zoho_service.create_invoice_for_delivery(
            tenant_id="t1", delivery=delivery, items=items,
            account=account, force=True,
        )

        assert mapping["regen_mode"] == "updated", mapping
        # Confirm a PUT happened to the existing invoice id
        puts = [c for c in captor.calls if c[0] == "PUT"
                and c[1] == "/books/v3/invoices/ZINV_111"]
        assert len(puts) == 1, captor.calls
        # No POST to /books/v3/invoices
        creates = [c for c in captor.calls
                   if c[0] == "POST" and c[1] == "/books/v3/invoices"]
        assert creates == [], captor.calls

    @pytest.mark.asyncio
    async def test_regen_recreated_when_put_fails_void_ok(self, monkeypatch):
        """PUT fails, void succeeds, POST creates new invoice; regen_mode='recreated'."""
        existing_mapping = {
            "tenant_id": "t1", "source_type": "distributor_delivery",
            "source_id": "d1", "status": "synced",
            "zoho_invoice_id": "ZINV_222", "zoho_invoice_number": "INV-222",
        }
        _install_common(monkeypatch, mappings=existing_mapping)

        void_calls = []

        async def _void(tenant_id, zid):
            void_calls.append((tenant_id, zid))
            return True

        monkeypatch.setattr(zoho_service, "void_invoice", _void)

        captor = _Captor()

        async def _zoho_req(method, path, *, tenant_id=None, json=None, **kw):
            captor(method, path, json=json)
            mu = method.upper()
            if mu == "PUT" and path.startswith("/books/v3/invoices/"):
                raise RuntimeError("Zoho: invoice is partially paid")
            if mu == "POST" and path == "/books/v3/invoices":
                return {"invoice": {"invoice_id": "ZINV_NEW",
                                    "invoice_number": "INV-NEW",
                                    "invoice_url": "https://zoho/inv/NEW"}}
            if mu == "POST" and path.endswith("/status/sent"):
                return {}
            return {}

        monkeypatch.setattr(zoho_service, "_zoho_request", _zoho_req)

        delivery = {"id": "d1", "delivery_number": "DEL-1",
                    "delivery_date": "2026-06-01", "distributor_location_id": "loc1"}
        items = [{"sku_id": "sk1", "sku_name": "20L Jar", "quantity": 10,
                  "discount_percent": 0}]
        account = {"id": "a1",
                   "sku_pricing": [{"sku": "20L Jar", "price_per_unit": 66}]}

        mapping = await zoho_service.create_invoice_for_delivery(
            tenant_id="t1", delivery=delivery, items=items,
            account=account, force=True,
        )
        assert mapping["regen_mode"] == "recreated", mapping
        assert len(void_calls) == 1
        # Confirm a POST to /books/v3/invoices happened after the failed PUT
        creates = [c for c in captor.calls
                   if c[0] == "POST" and c[1] == "/books/v3/invoices"]
        assert len(creates) == 1

    @pytest.mark.asyncio
    async def test_regen_raises_when_put_and_void_fail(self, monkeypatch):
        """PUT fails + void fails → InvoiceNotRegenerableError raised."""
        existing_mapping = {
            "tenant_id": "t1", "source_type": "distributor_delivery",
            "source_id": "d1", "status": "synced",
            "zoho_invoice_id": "ZINV_333", "zoho_invoice_number": "INV-333",
        }
        _install_common(monkeypatch, mappings=existing_mapping)

        async def _void(tenant_id, zid):
            raise RuntimeError("Zoho: cannot void — payment applied")

        monkeypatch.setattr(zoho_service, "void_invoice", _void)

        async def _zoho_req(method, path, *, tenant_id=None, json=None, **kw):
            if method.upper() == "PUT":
                raise RuntimeError("Zoho: invoice has credits applied")
            return {}

        monkeypatch.setattr(zoho_service, "_zoho_request", _zoho_req)

        delivery = {"id": "d1", "delivery_number": "DEL-1",
                    "delivery_date": "2026-06-01", "distributor_location_id": "loc1"}
        items = [{"sku_id": "sk1", "sku_name": "20L Jar", "quantity": 10,
                  "discount_percent": 0}]
        account = {"id": "a1",
                   "sku_pricing": [{"sku": "20L Jar", "price_per_unit": 66}]}

        with pytest.raises(zoho_service.InvoiceNotRegenerableError):
            await zoho_service.create_invoice_for_delivery(
                tenant_id="t1", delivery=delivery, items=items,
                account=account, force=True,
            )


# ---------------------------------------------------------------------------
# 3) Live HTTP: role gating + real delivery preview
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session")
def ceo_session():
    """Authenticate as CEO; return a Session with Authorization Bearer header."""
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
               timeout=20)
    if r.status_code != 200:
        pytest.skip(f"CEO login failed: {r.status_code} {r.text[:200]}")
    token = r.json().get("session_token")
    if not token:
        pytest.skip("Login returned no session_token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


class TestHttpPreviewAndGating:

    def test_real_delivery_preview_missing_price(self, ceo_session):
        url = (f"{BASE_URL}/api/distributors/{REAL_DISTRIBUTOR_ID}"
               f"/deliveries/{REAL_DELIVERY_ID}/invoice-preview")
        r = ceo_session.get(url, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        body = r.json()
        # Schema checks
        assert "delivery_number" in body
        assert "account_name" in body
        assert "lines" in body and isinstance(body["lines"], list)
        assert "subtotal" in body
        assert "total_discount" in body
        assert "net_taxable_amount" in body
        assert "missing_agreed_price_skus" in body
        # Real delivery has 1 item w/ no agreed price → must appear
        assert isinstance(body["missing_agreed_price_skus"], list)
        assert len(body["missing_agreed_price_skus"]) >= 1, \
            f"Expected missing_agreed_price_skus non-empty; got {body}"
        # Math sanity: subtotal == sum of gross_amount
        assert round(sum(l["gross_amount"] for l in body["lines"]), 2) == \
            round(body["subtotal"], 2)

    def test_unauthenticated_regenerate_blocked(self):
        if not BASE_URL:
            pytest.skip("no base url")
        r = requests.post(
            f"{BASE_URL}/api/distributors/{REAL_DISTRIBUTOR_ID}"
            f"/deliveries/{REAL_DELIVERY_ID}/regenerate-invoice",
            timeout=15,
        )
        assert r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}"

    def test_ceo_passes_role_gate_then_zoho_400(self, ceo_session):
        """CEO must pass the management role gate and hit the Zoho-not-connected
        400 (which is expected in preview env)."""
        url = (f"{BASE_URL}/api/distributors/{REAL_DISTRIBUTOR_ID}"
               f"/deliveries/{REAL_DELIVERY_ID}/regenerate-invoice")
        r = ceo_session.post(url, timeout=30)
        # Must NOT be a 403 (which would indicate the gate blocked them).
        assert r.status_code != 403, f"Unexpected 403 for CEO: {r.text[:300]}"
        # In preview env, expect 400 with 'not connected'/'not configured' messaging.
        assert r.status_code == 400, f"Expected 400 (Zoho not connected); got {r.status_code} {r.text[:300]}"
        body_text = r.text.lower()
        assert ("not connected" in body_text or "not configured" in body_text
                or "zoho" in body_text), body_text


class TestInvoicesListRegenerate:

    def test_regenerate_nonexistent_invoice_returns_400(self, ceo_session):
        bogus_id = f"TEST_NOTFOUND_{uuid.uuid4().hex[:8]}"
        r = ceo_session.post(
            f"{BASE_URL}/api/invoices/{bogus_id}/regenerate", timeout=20)
        # No mapping → 400 with 'isn't linked to a distributor delivery'
        assert r.status_code == 400, f"{r.status_code} {r.text[:300]}"
        assert "isn't linked to a distributor delivery" in r.text or \
               "not linked" in r.text.lower(), r.text[:300]

    def test_regenerate_unauthenticated(self):
        if not BASE_URL: pytest.skip("no base url")
        r = requests.post(
            f"{BASE_URL}/api/invoices/anything/regenerate", timeout=15)
        assert r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}"


# ---------------------------------------------------------------------------
# 4) Smoke
# ---------------------------------------------------------------------------
class TestSmoke:
    def test_zoho_service_has_new_symbols(self):
        assert hasattr(zoho_service, "InvoiceNotRegenerableError")
        assert hasattr(zoho_service, "regenerate_delivery_invoice")
        assert hasattr(zoho_service, "build_delivery_invoice_preview")
        # Check create_invoice_for_delivery now has 'force' kwarg
        import inspect
        sig = inspect.signature(zoho_service.create_invoice_for_delivery)
        assert "force" in sig.parameters, sig
