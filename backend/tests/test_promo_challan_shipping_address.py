"""Regression tests for the Zoho promotional Delivery Challan shipping-address fix.

Covers the production bug (Radisson Blu, DC-2606-0013) where Zoho rejected the
promo delivery-challan push with:
    {"code":15,"message":"Please ensure that the \"shipping_address\" has less than 100 characters."}

Two guarantees:
  1. `_zoho_shipping_address` clips every sub-field < 100 chars AND removes the
     duplicated outlet name (the address line repeating the attention/recipient).
  2. `create_delivery_challan_for_promo_dispatch` recovers from a spurious Zoho
     code-15 address rejection by retrying WITHOUT the inline shipping_address
     (recipient still captured in `notes`), so the sync no longer hard-fails.
"""
import asyncio
import types
import pytest

import services.zoho_service as zs
from services.zoho_service import (
    _zoho_shipping_address,
    _is_zoho_address_length_error,
    ZohoApiError,
)

RADISSON_ATTN = "Radisson Blu Marina Hotel, Delhi Connaught Place"
RADISSON_ADDR = (
    "Radisson Blu Marina Hotel, Delhi Connaught Place "
    "G-59 Connaught Circus, Connaught Place, New Delhi, Delhi 110001"
)


def test_all_subfields_under_100():
    out = _zoho_shipping_address(
        attention=RADISSON_ATTN, address=RADISSON_ADDR,
        city="New Delhi", state="Delhi", zip="110001", phone="+91 11 4690 9090",
    )
    for k, v in out.items():
        assert len(str(v)) < 100, f"{k} is {len(str(v))} chars (>= 100)"


def test_dedupes_repeated_outlet_name():
    out = _zoho_shipping_address(attention=RADISSON_ATTN, address=RADISSON_ADDR)
    # address should no longer start with the repeated outlet name
    assert not out["address"].lower().startswith(RADISSON_ATTN.lower())
    assert "G-59 Connaught Circus" in out["address"]


def test_extreme_length_still_clipped():
    out = _zoho_shipping_address(
        attention="X" * 250, address="Y" * 400, street2="Z" * 400,
        city="C" * 250, state="S" * 250, zip="Z" * 50,
    )
    for k, v in out.items():
        assert len(str(v)) < 100, f"{k} overflowed"


def test_error_detector():
    hit = ZohoApiError(400, "x", {
        "code": 15,
        "message": 'Please ensure that the "shipping_address" has less than 100 characters.',
    })
    assert _is_zoho_address_length_error(hit) is True
    # billing variant
    bill = ZohoApiError(400, "x", {
        "code": 15, "message": 'Please ensure that the "billing_address" has less than 100 characters.',
    })
    assert _is_zoho_address_length_error(bill) is True
    # unrelated 400
    other = ZohoApiError(400, "x", {"code": 36, "message": "Invalid value for customer_id"})
    assert _is_zoho_address_length_error(other) is False
    # non-400
    not400 = ZohoApiError(404, "not found", {"code": 15, "message": "100 characters address"})
    assert _is_zoho_address_length_error(not400) is False


def test_resilient_post_retries_without_address(monkeypatch):
    """First POST raises code-15 -> helper retries WITHOUT the inline address."""
    calls = []

    async def fake_request(method, path, *, tenant_id, json=None, **kw):
        calls.append(json)
        if len(calls) == 1:
            raise ZohoApiError(400, "addr too long", {
                "code": 15,
                "message": 'Please ensure that the "shipping_address" has less than 100 characters.',
            })
        return {"deliverychallan": {"deliverychallan_id": "Z1", "deliverychallan_number": "DC-00099"}}

    monkeypatch.setattr(zs, "_zoho_request", fake_request)

    payload = {
        "customer_id": "c1",
        "shipping_address": {"address": "long stuff", "attention": "Recipient"},
        "billing_address": {"address": "x"},
        "notes": "Recipient: Radisson Blu",
    }
    res = asyncio.get_event_loop().run_until_complete(
        zs._post_deliverychallan_resilient("t1", payload, "DC-2606-0013")
    )
    assert res["deliverychallan"]["deliverychallan_id"] == "Z1"
    assert len(calls) == 2
    # 2nd attempt must have dropped both inline address blocks
    assert "shipping_address" not in calls[1]
    assert "billing_address" not in calls[1]
    assert calls[1]["notes"] == "Recipient: Radisson Blu"


def test_resilient_post_passes_through_other_errors(monkeypatch):
    async def fake_request(method, path, *, tenant_id, json=None, **kw):
        raise ZohoApiError(400, "bad customer", {"code": 36, "message": "Invalid customer_id"})

    monkeypatch.setattr(zs, "_zoho_request", fake_request)
    with pytest.raises(ZohoApiError):
        asyncio.get_event_loop().run_until_complete(
            zs._post_deliverychallan_resilient("t1", {"shipping_address": {"a": "b"}}, "DC-1")
        )


def test_set_shipping_address_puts_recipient_fields(monkeypatch):
    """Deliver-To is set via the dedicated /address/shipping endpoint with the
    recipient (lead/contact) fields — never the warehouse/customer address."""
    captured = {}

    async def fake_request(method, path, *, tenant_id, json=None, **kw):
        captured["method"] = method
        captured["path"] = path
        captured["body"] = json
        return {"code": 0, "message": "success"}

    monkeypatch.setattr(zs, "_zoho_request", fake_request)
    addr = _zoho_shipping_address(
        attention=RADISSON_ATTN, address=RADISSON_ADDR,
        city="New Delhi", state="Delhi", zip="110001", phone="+91 11 4690 9090",
    )
    ok = asyncio.get_event_loop().run_until_complete(
        zs._set_deliverychallan_shipping_address("t1", "Z123", addr, ref="DC-2606-0013")
    )
    assert ok is True
    assert captured["method"] == "PUT"
    assert captured["path"] == "/books/v3/deliverychallans/Z123/address/shipping"
    body = captured["body"]
    assert body["city"] == "New Delhi"
    assert body["attention"] == RADISSON_ATTN
    assert "G-59 Connaught Circus" in body["address"]
    # every field stays < 100 chars
    assert all(len(str(v)) < 100 for v in body.values())


def test_set_shipping_address_skips_when_empty(monkeypatch):
    async def fake_request(*a, **k):
        raise AssertionError("should not call Zoho when address is empty")

    monkeypatch.setattr(zs, "_zoho_request", fake_request)
    ok = asyncio.get_event_loop().run_until_complete(
        zs._set_deliverychallan_shipping_address("t1", "Z123", {"country": "India"})
    )
    assert ok is False


def test_void_invoice_success(monkeypatch):
    captured = {}

    async def fake_request(method, path, *, tenant_id, **kw):
        captured["method"] = method
        captured["path"] = path
        return {"code": 0, "message": "The invoice has been marked as void."}

    monkeypatch.setattr(zs, "_zoho_request", fake_request)
    ok = asyncio.get_event_loop().run_until_complete(zs.void_invoice("t1", "INV9"))
    assert ok is True
    assert captured["method"] == "POST"
    assert captured["path"] == "/books/v3/invoices/INV9/status/void"


def test_void_invoice_idempotent(monkeypatch):
    # 404 (already gone) and "already void" are both treated as success.
    async def fake_404(*a, **k):
        raise ZohoApiError(404, "not found", {"code": 1003, "message": "Invoice not found"})

    async def fake_already(*a, **k):
        raise ZohoApiError(400, "x", {"code": 36015, "message": "Invoice is already marked as void."})

    monkeypatch.setattr(zs, "_zoho_request", fake_404)
    assert asyncio.get_event_loop().run_until_complete(zs.void_invoice("t1", "INV9")) is True
    monkeypatch.setattr(zs, "_zoho_request", fake_already)
    assert asyncio.get_event_loop().run_until_complete(zs.void_invoice("t1", "INV9")) is True


def test_void_invoice_noop_without_id():
    assert asyncio.get_event_loop().run_until_complete(zs.void_invoice("t1", "")) is True


def test_void_invoice_raises_on_other_error(monkeypatch):
    async def fake(*a, **k):
        raise ZohoApiError(500, "boom", {"code": 9001, "message": "server error"})

    monkeypatch.setattr(zs, "_zoho_request", fake)
    with pytest.raises(ZohoApiError):
        asyncio.get_event_loop().run_until_complete(zs.void_invoice("t1", "INV9"))
