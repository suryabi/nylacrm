"""
Iteration 260 — Zoho line-item PERCENTAGE discount fix.

Background:
A 100% discount on a stock-out invoice line was being read by Zoho as a flat ₹100
off (because we sent `discount: 100` as a bare number with the invoice-level
`discount_type='entity_level'`). Fix: send each line discount as a percentage
STRING like "100%" / "0%", and set the invoice payload to
`discount_type='item_level'` + `is_discount_before_tax=True`.

This test monkeypatches `_zoho_request` to CAPTURE the outgoing invoice payload
(then raise a sentinel to short-circuit any downstream mirror/mapping DB writes),
and asserts on the captured payload only — Zoho is not actually called.

Mirror checks for `create_invoice_for_shipment` (stock-in) which received the
same fix, and a regression test that a Missing Bottle Recovery line (which has
no `discount` field) is still accepted.
"""

import os
import sys
import pytest
import requests

sys.path.insert(0, "/app/backend")

from services import zoho_service  # noqa: E402


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


# ──────────────────────────────────────────────────────────────────────────────
# Shared monkeypatch helpers
# ──────────────────────────────────────────────────────────────────────────────

class _Sentinel(Exception):
    """Raised inside the mocked _zoho_request after we've captured the payload."""


class _FakeCollection:
    def __init__(self, find_one_result=None):
        self._find_one_result = find_one_result

    async def find_one(self, *args, **kwargs):
        # If the caller passed a callable per-collection result, support it.
        if callable(self._find_one_result):
            return self._find_one_result(*args, **kwargs)
        return self._find_one_result


class _FakeDB:
    def __init__(self, *, mappings=None, locations=None, debit_notes=None):
        # zoho_invoice_mappings: None  → not yet synced (forces fresh push).
        self.zoho_invoice_mappings = _FakeCollection(mappings)
        # distributor_locations: provide a Zoho branch id so the branch-guard passes.
        self.distributor_locations = _FakeCollection(locations)
        # debit_notes: not used in this test (no applied_debit_notes by default).
        self.debit_notes = _FakeCollection(debit_notes)


def _install_common_stubs(monkeypatch, captured: dict, *, db=None):
    """Stub every external dep so create_invoice_for_{delivery,shipment} runs
    purely on in-memory data and captures the first POST /books/v3/invoices
    payload before raising _Sentinel.
    """

    # is_zoho_configured → True so the early-exit doesn't fire.
    monkeypatch.setattr(zoho_service, "is_zoho_configured", lambda: True)

    async def _fake_upsert_contact(tenant_id, account):
        return "CUST_123"

    async def _fake_get_zoho_item_id(tenant_id, sku_id):
        return f"ZITEM_{sku_id or 'na'}"

    async def _fake_get_credentials(tenant_id):
        return {}

    monkeypatch.setattr(zoho_service, "upsert_contact", _fake_upsert_contact)
    monkeypatch.setattr(zoho_service, "get_zoho_item_id", _fake_get_zoho_item_id)
    monkeypatch.setattr(zoho_service, "get_credentials", _fake_get_credentials)

    # Default DB stub (callers can override).
    if db is None:
        db = _FakeDB(
            mappings=None,
            locations={"zoho_branch_id": "BR1", "location_name": "WH"},
        )
    monkeypatch.setattr(zoho_service, "db", db)

    # CAPTURE the outgoing payload on the first POST /books/v3/invoices.
    async def _fake_zoho_request(method, path, *, tenant_id=None, json=None, **kw):
        if method.upper() == "POST" and path == "/books/v3/invoices":
            captured["method"] = method
            captured["path"] = path
            captured["json"] = json
            raise _Sentinel("captured")
        # Anything else (status flip, item lookups via real API, etc.) shouldn't fire
        # because we stubbed the helpers above — but be safe.
        return {}

    monkeypatch.setattr(zoho_service, "_zoho_request", _fake_zoho_request)


# ──────────────────────────────────────────────────────────────────────────────
# Stock-out (delivery) tests
# ──────────────────────────────────────────────────────────────────────────────

class TestDeliveryInvoicePercentDiscount:
    """zoho_service.create_invoice_for_delivery — line discount must be 'N%'."""

    @pytest.mark.asyncio
    async def test_delivery_invoice_uses_item_level_percent_discount(self, monkeypatch):
        captured: dict = {}
        _install_common_stubs(monkeypatch, captured)

        delivery = {
            "id": "d1",
            "delivery_number": "DEL-1",
            "delivery_date": "2026-06-01",
            "distributor_location_id": "loc1",
        }
        # 180 units × ₹66 with 100% discount → must end up as line discount '100%'.
        # The other line at 0% must serialize as '0%' (NOT bare 0).
        items = [
            {"sku_id": "sku_can", "sku_name": "20L Can",  "quantity": 180, "discount_percent": 100},
            {"sku_id": "sku_jar", "sku_name": "20L Jar",  "quantity":  50, "discount_percent": 0},
        ]
        account = {
            "id": "acc1",
            "sku_pricing": [
                {"sku": "20L Jar", "price_per_unit": 66},
                {"sku": "20L Can", "price_per_unit": 66},
            ],
        }

        with pytest.raises(_Sentinel):
            await zoho_service.create_invoice_for_delivery(
                tenant_id="t1", delivery=delivery, items=items, account=account,
            )

        payload = captured.get("json")
        assert payload is not None, "POST /books/v3/invoices payload was not captured"

        # Invoice-level fix
        assert payload.get("discount_type") == "item_level", (
            f"Expected discount_type='item_level', got {payload.get('discount_type')!r}"
        )
        assert payload.get("is_discount_before_tax") is True, (
            "Expected is_discount_before_tax=True so Zoho applies the % BEFORE GST"
        )

        # Branch wired through
        assert payload.get("branch_id") == "BR1"

        # Line-item fix — discount is a percentage STRING, not a bare number.
        lines = payload.get("line_items") or []
        assert len(lines) == 2, f"Expected 2 line items, got {len(lines)}: {lines}"

        by_name = {(li.get("name") or "").strip(): li for li in lines}
        can = by_name["20L Can"]
        jar = by_name["20L Jar"]

        # 100% line
        assert can.get("discount") == "100%", (
            f"20L Can discount must be the string '100%', got {can.get('discount')!r}"
        )
        assert isinstance(can.get("discount"), str), (
            "20L Can discount must be a STRING (Zoho reads bare numbers as flat ₹)"
        )
        # 0% line
        assert jar.get("discount") == "0%", (
            f"20L Jar discount must be the string '0%', got {jar.get('discount')!r}"
        )
        assert isinstance(jar.get("discount"), str)

        # Sanity: rate + quantity preserved
        assert float(can["rate"]) == 66.0
        assert float(can["quantity"]) == 180.0
        assert float(jar["rate"]) == 66.0
        assert float(jar["quantity"]) == 50.0


    @pytest.mark.asyncio
    async def test_delivery_invoice_handles_fractional_percent(self, monkeypatch):
        """A 12.5% discount must serialize as '12.5%' (g formatter, no trailing zero)."""
        captured: dict = {}
        _install_common_stubs(monkeypatch, captured)

        delivery = {
            "id": "d2", "delivery_number": "DEL-2", "delivery_date": "2026-06-01",
            "distributor_location_id": "loc1",
        }
        items = [{"sku_id": "sku_jar", "sku_name": "20L Jar", "quantity": 10, "discount_percent": 12.5}]
        account = {"sku_pricing": [{"sku": "20L Jar", "price_per_unit": 66}]}

        with pytest.raises(_Sentinel):
            await zoho_service.create_invoice_for_delivery(
                tenant_id="t1", delivery=delivery, items=items, account=account,
            )

        line = captured["json"]["line_items"][0]
        assert line["discount"] == "12.5%", f"Got {line['discount']!r}"


    @pytest.mark.asyncio
    async def test_delivery_invoice_missing_discount_percent_defaults_to_0pct(self, monkeypatch):
        """If discount_percent is absent on the item, the line discount becomes '0%'."""
        captured: dict = {}
        _install_common_stubs(monkeypatch, captured)

        delivery = {
            "id": "d3", "delivery_number": "DEL-3", "delivery_date": "2026-06-01",
            "distributor_location_id": "loc1",
        }
        items = [{"sku_id": "sku_jar", "sku_name": "20L Jar", "quantity": 5}]  # no discount_percent
        account = {"sku_pricing": [{"sku": "20L Jar", "price_per_unit": 66}]}

        with pytest.raises(_Sentinel):
            await zoho_service.create_invoice_for_delivery(
                tenant_id="t1", delivery=delivery, items=items, account=account,
            )

        line = captured["json"]["line_items"][0]
        assert line["discount"] == "0%"


    @pytest.mark.asyncio
    async def test_delivery_debit_note_recovery_line_has_no_discount_field(self, monkeypatch):
        """Regression: appended 'Missing Bottle Recovery' lines must NOT have a
        'discount' field — with invoice-level discount_type='item_level' the
        absent field defaults to 0 in Zoho. Adding 100 here would be read as
        flat ₹100 off the recovery line."""
        captured: dict = {}

        # debit_notes.find_one returns a partial-application doc so the
        # "Missing Bottle Recovery" line is appended.
        def _dn_find_one(*args, **kwargs):
            return {
                "id": "dn1",
                "debit_note_number": "DN-1",
                "items": [{"sku_id": "sku_jar", "sku_name": "20L Jar",
                           "quantity": 1, "rate_per_unit": 100}],
                "original_amount": 1000,  # > amount_applied → partial branch
            }

        db = _FakeDB(
            mappings=None,
            locations={"zoho_branch_id": "BR1", "location_name": "WH"},
        )
        db.debit_notes = _FakeCollection(_dn_find_one)
        _install_common_stubs(monkeypatch, captured, db=db)

        delivery = {
            "id": "d4", "delivery_number": "DEL-4", "delivery_date": "2026-06-01",
            "distributor_location_id": "loc1",
            "applied_debit_notes": [
                {"debit_note_id": "dn1", "debit_note_number": "DN-1", "amount_applied": 250}
            ],
        }
        items = [{"sku_id": "sku_jar", "sku_name": "20L Jar", "quantity": 10,
                  "discount_percent": 0}]
        account = {"sku_pricing": [{"sku": "20L Jar", "price_per_unit": 66}]}

        with pytest.raises(_Sentinel):
            await zoho_service.create_invoice_for_delivery(
                tenant_id="t1", delivery=delivery, items=items, account=account,
            )

        lines = captured["json"]["line_items"]
        # First line = regular SKU, second line = Missing Bottle Recovery
        assert len(lines) == 2, f"Expected 2 lines (1 SKU + 1 recovery), got {lines}"
        recovery = lines[1]
        assert "Missing Bottle Recovery" in (recovery.get("name") or "")
        assert "discount" not in recovery, (
            f"Recovery line must NOT carry a 'discount' field, got {recovery!r}"
        )
        # And it didn't break the invoice-level fix either.
        assert captured["json"]["discount_type"] == "item_level"
        assert captured["json"]["is_discount_before_tax"] is True


# ──────────────────────────────────────────────────────────────────────────────
# Stock-in (shipment) tests — same fix mirror
# ──────────────────────────────────────────────────────────────────────────────

class TestShipmentInvoicePercentDiscount:
    """zoho_service.create_invoice_for_shipment — line discount must be 'N%'."""

    @pytest.mark.asyncio
    async def test_shipment_invoice_uses_item_level_percent_discount(self, monkeypatch):
        captured: dict = {}
        _install_common_stubs(monkeypatch, captured)

        shipment = {
            "id": "s1",
            "shipment_number": "SH-1",
            "shipment_date": "2026-06-02",
            "source_warehouse_id": "wh1",
        }
        items = [
            {"sku_id": "sku_can", "sku_name": "20L Can", "quantity": 180,
             "unit_price": 66, "discount_percent": 100},
            {"sku_id": "sku_jar", "sku_name": "20L Jar", "quantity": 20,
             "unit_price": 66, "discount_percent": 0},
        ]
        distributor = {
            "id": "dist1",
            "distributor_name": "Acme",
            "legal_entity_name": "Acme Pvt Ltd",
            "gstin": "29AAAAA0000A1Z5",
        }

        with pytest.raises(_Sentinel):
            await zoho_service.create_invoice_for_shipment(
                tenant_id="t1", shipment=shipment, items=items, distributor=distributor,
            )

        payload = captured["json"]
        assert payload["discount_type"] == "item_level"
        assert payload["is_discount_before_tax"] is True
        assert payload["branch_id"] == "BR1"

        lines = payload["line_items"]
        assert len(lines) == 2
        by_name = {(li.get("name") or "").strip(): li for li in lines}
        assert by_name["20L Can"]["discount"] == "100%"
        assert by_name["20L Jar"]["discount"] == "0%"
        assert isinstance(by_name["20L Can"]["discount"], str)
        assert isinstance(by_name["20L Jar"]["discount"], str)


# ──────────────────────────────────────────────────────────────────────────────
# Backend smoke — make sure the import didn't break the server.
# ──────────────────────────────────────────────────────────────────────────────

class TestBackendSmoke:
    def test_backend_root_responds(self):
        if not BASE_URL:
            pytest.skip("REACT_APP_BACKEND_URL not set")
        # Try a couple of low-cost endpoints; either should be 2xx/3xx/401.
        r = requests.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code < 500, f"/api/ returned {r.status_code}: {r.text[:200]}"

    def test_zoho_service_imports_cleanly(self):
        # Just re-import to ensure no syntax/runtime errors leaked in.
        import importlib
        import services.zoho_service as zs
        importlib.reload(zs)
        assert hasattr(zs, "create_invoice_for_delivery")
        assert hasattr(zs, "create_invoice_for_shipment")
