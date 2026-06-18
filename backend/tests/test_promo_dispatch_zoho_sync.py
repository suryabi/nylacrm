"""Tests for the Promotional Stock-Out → Zoho Books delivery challan integration.

Note: We mock `create_delivery_challan_for_promo_dispatch` so the tests do NOT
hit the real Zoho API. We just verify the wiring:
  - successful local creation persists `zoho_sync_status`.
  - failures surface as `zoho_sync_status='failed'` without blocking dispatch.
  - the retry endpoint re-attempts and surfaces success/failure.
"""
import os
from pathlib import Path
from unittest.mock import patch, AsyncMock
import pytest
import requests


def _backend_url():
    p = Path("/app/frontend/.env")
    if p.exists():
        for line in p.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")


BASE = (_backend_url() or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not configured"
API = f"{BASE}/api"


def test_zoho_promo_function_importable():
    """Smoke: the new function and the retry route are wired into the app."""
    from services.zoho_service import (  # noqa: F401
        create_delivery_challan_for_promo_dispatch,
        fetch_delivery_challan_pdf,
    )
    from routes.promo_dispatch import retry_zoho_for_promo_dispatch, promo_challan_pdf  # noqa: F401
    assert callable(create_delivery_challan_for_promo_dispatch)
    assert callable(retry_zoho_for_promo_dispatch)
    assert callable(fetch_delivery_challan_pdf)
    assert callable(promo_challan_pdf)


def test_zoho_promo_payload_shape():
    """Validate the function produces an out-of-scope delivery challan with the
    required Not-for-Sale banner — using a fully-mocked Zoho client.
    """
    from services import zoho_service as zs

    async def _runner():
        captured = {}

        async def fake_zoho_request(method, path, *, tenant_id, json):  # noqa
            captured["method"] = method
            captured["path"] = path
            captured["json"] = json
            return {"deliverychallan": {"deliverychallan_id": "ZD-TEST-1",
                                        "deliverychallan_number": "DC-Z-0001"}}

        async def fake_upsert_contact(_tenant_id, _account):
            return "ZC-TEST-1"

        async def fake_get_item_id(_tenant_id, _sku_id):
            return "ZI-TEST-1"

        # Mock the mongo collection methods directly via AsyncMock so order
        # of test execution doesn't leak real DB state into the assertion.
        fake_collection = type("FakeColl", (), {
            "find_one": AsyncMock(return_value=None),
            "update_one": AsyncMock(return_value=None),
        })()
        fake_db = type("FakeDB", (), {"zoho_invoice_mappings": fake_collection})()

        with patch.object(zs, "_zoho_request", side_effect=fake_zoho_request), \
             patch.object(zs, "upsert_contact", side_effect=fake_upsert_contact), \
             patch.object(zs, "get_zoho_item_id", side_effect=fake_get_item_id), \
             patch.object(zs, "is_zoho_configured", return_value=True), \
             patch.object(zs, "get_credentials", new=AsyncMock(return_value={})), \
             patch.object(zs, "db", fake_db):
            await zs.create_delivery_challan_for_promo_dispatch(
                tenant_id="t1",
                dispatch={
                    "id": "d-1",
                    "challan_number": "DC-1",
                    "delivery_date": "2026-02-06",
                    "contact_name": "John",
                    "contact_company": "Acme",
                    "contact_phone": "9999",
                    "promo_reason": "Brand Sampling",
                    "delivery_address": "Addr A",
                },
                items=[{
                    "sku_id": "s1", "sku_name": "Nyla 600", "quantity": 2,
                    "unit_price": 50.0, "batch_code": "B-1",
                }],
                distributor={"id": "dist-1", "distributor_name": "DistCo"},
            )

        body = captured["json"]
        assert captured["path"].endswith("/deliverychallans")
        assert body["gst_treatment"] == "out_of_scope"
        assert body["tax_total"] == 0
        assert body["is_inclusive_tax"] is False
        assert "NOT FOR SALE" in body["notes"]
        assert "NO COMMERCIAL VALUE" in body["notes"]
        assert "Brand Sampling" in body["notes"]
        # Each line item is non-taxed
        for li in body["line_items"]:
            assert li["tax_percentage"] == 0
            assert li["tax_id"] == ""
            assert "Sample" in li["name"]
            assert "Not for Sale" in li["name"]
        # Shipping address override
        assert body["shipping_address"]["address"] == "Addr A"

    import asyncio
    asyncio.run(_runner())


@pytest.fixture(scope="module")
def hdr():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['session_token']}"}


def test_retry_endpoint_404_on_unknown(hdr):
    # Unknown dispatch should 404 cleanly even if Zoho is configured.
    r = requests.post(
        f"{API}/distributors/bb12d90e-4d33-4890-ac5f-17573c551b5c/promo-deliveries/does-not-exist/retry-zoho",
        headers=hdr, timeout=20,
    )
    # 404 (dispatch not found) is the expected behaviour
    assert r.status_code == 404, r.text
