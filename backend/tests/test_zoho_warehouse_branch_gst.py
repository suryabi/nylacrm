"""Regression: stock-out invoices must be booked under the Zoho Branch that
maps to the SOURCE warehouse (so the correct GSTIN/place-of-supply is applied).

Bug being guarded: a Delhi-warehouse stock-out produced an invoice with the
Hyderabad GSTIN because `branch_id` was never sent — Zoho fell back to the
org's primary branch.

These tests patch the Zoho HTTP + DB dependencies and assert:
  1. When the source warehouse has `zoho_branch_id`, the POST /invoices payload
     carries that `branch_id`.
  2. When the warehouse has NO `zoho_branch_id`, the push is blocked with
     ZohoBranchNotMappedError BEFORE any invoice is created in Zoho.
"""
import asyncio
from types import SimpleNamespace
from unittest.mock import patch, AsyncMock

import pytest

import services.zoho_service as zs


class _StopAfterPost(Exception):
    """Sentinel so we stop execution right after the POST /invoices call and
    don't need to mock the entire persistence chain that follows."""


def _make_delivery(loc_id="loc-delhi"):
    return {
        "id": "del-1",
        "delivery_number": "DEL-001",
        "delivery_date": "2026-06-15",
        "distributor_location_id": loc_id,
        "applied_credit_notes": [],
    }


def _make_items():
    return [{"sku_id": "sku-1", "sku_name": "Nyla 600", "quantity": 10, "batch_code": "B-001"}]


def _make_account():
    return {
        "id": "acc-1",
        "account_name": "Test Cust",
        "sku_pricing": [{"sku": "Nyla 600", "price_per_unit": 10}],
    }


def _patched_db(location_doc):
    """Build a db stand-in exposing only what create_invoice_for_delivery touches
    before/at the POST: zoho_invoice_mappings.find_one + distributor_locations.find_one."""
    db = SimpleNamespace()
    db.zoho_invoice_mappings = SimpleNamespace(find_one=AsyncMock(return_value=None))
    db.distributor_locations = SimpleNamespace(find_one=AsyncMock(return_value=location_doc))
    return db


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_invoice_payload_carries_source_warehouse_branch_id():
    captured = {}

    async def fake_zoho_request(method, path, *, tenant_id=None, json=None, **kw):
        if path == "/books/v3/invoices" and method == "POST":
            captured["payload"] = json
            raise _StopAfterPost()
        return {}

    loc = {"zoho_branch_id": "99999000000123", "zoho_branch_name": "Delhi Branch", "location_name": "Delhi"}

    with patch.object(zs, "is_zoho_configured", return_value=True), \
         patch.object(zs, "db", _patched_db(loc)), \
         patch.object(zs, "upsert_contact", AsyncMock(return_value="cust-1")), \
         patch.object(zs, "get_zoho_item_id", AsyncMock(return_value="item-1")), \
         patch.object(zs, "get_credentials", AsyncMock(return_value={})), \
         patch.object(zs, "_zoho_request", side_effect=fake_zoho_request):
        with pytest.raises(_StopAfterPost):
            _run(zs.create_invoice_for_delivery(
                tenant_id="t1", delivery=_make_delivery(), items=_make_items(), account=_make_account(),
            ))

    assert captured.get("payload"), "POST /invoices was never called"
    assert captured["payload"].get("branch_id") == "99999000000123", \
        f"branch_id missing/wrong on invoice payload: {captured['payload'].get('branch_id')}"


def test_unmapped_warehouse_blocks_push_before_zoho_write():
    calls = {"invoice_posts": 0}

    async def fake_zoho_request(method, path, *, tenant_id=None, json=None, **kw):
        if path == "/books/v3/invoices":
            calls["invoice_posts"] += 1
        return {}

    loc = {"zoho_branch_id": None, "location_name": "Delhi"}  # not mapped

    with patch.object(zs, "is_zoho_configured", return_value=True), \
         patch.object(zs, "db", _patched_db(loc)), \
         patch.object(zs, "upsert_contact", AsyncMock(return_value="cust-1")), \
         patch.object(zs, "get_zoho_item_id", AsyncMock(return_value="item-1")), \
         patch.object(zs, "get_credentials", AsyncMock(return_value={})), \
         patch.object(zs, "_zoho_request", side_effect=fake_zoho_request):
        with pytest.raises(zs.ZohoBranchNotMappedError):
            _run(zs.create_invoice_for_delivery(
                tenant_id="t1", delivery=_make_delivery(), items=_make_items(), account=_make_account(),
            ))

    assert calls["invoice_posts"] == 0, "No invoice should be created in Zoho when the warehouse is unmapped"
