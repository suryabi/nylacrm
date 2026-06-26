"""Verify that applied missing-bottle DEBIT NOTES are pushed as TAXABLE line
items (with a Zoho item_id so GST applies) on the delivery invoice payload.
Mocks the Zoho HTTP + DB so we can inspect POST /invoices line_items."""
import asyncio
from types import SimpleNamespace
from unittest.mock import patch, AsyncMock

import pytest
import services.zoho_service as zs


class _StopAfterPost(Exception):
    pass


def _delivery(applied_debit_notes):
    return {
        "id": "del-1",
        "delivery_number": "DEL-001",
        "delivery_date": "2026-06-15",
        "distributor_location_id": "loc-delhi",
        "applied_credit_notes": [],
        "applied_debit_notes": applied_debit_notes,
    }


def _items():
    return [{"sku_id": "sku-1", "sku_name": "Nyla 600", "quantity": 10, "batch_code": "B-001"}]


def _account():
    return {"id": "acc-1", "account_name": "Test Cust",
            "sku_pricing": [{"sku": "Nyla 600", "price_per_unit": 10}]}


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _capture_payload(applied_dns, debit_note_doc):
    captured = {}

    async def fake_zoho_request(method, path, *, tenant_id=None, json=None, **kw):
        if path == "/books/v3/invoices" and method == "POST":
            captured["payload"] = json
            raise _StopAfterPost()
        return {}

    db = SimpleNamespace()
    db.zoho_invoice_mappings = SimpleNamespace(find_one=AsyncMock(return_value=None))
    db.distributor_locations = SimpleNamespace(find_one=AsyncMock(return_value={
        "zoho_branch_id": "99999000000123", "location_name": "Delhi"}))
    db.debit_notes = SimpleNamespace(find_one=AsyncMock(return_value=debit_note_doc))

    with patch.object(zs, "is_zoho_configured", return_value=True), \
         patch.object(zs, "db", db), \
         patch.object(zs, "upsert_contact", AsyncMock(return_value="cust-1")), \
         patch.object(zs, "get_zoho_item_id", AsyncMock(side_effect=lambda t, sku: f"zoho-{sku}")), \
         patch.object(zs, "get_credentials", AsyncMock(return_value={})), \
         patch.object(zs, "_zoho_request", side_effect=fake_zoho_request):
        with pytest.raises(_StopAfterPost):
            _run(zs.create_invoice_for_delivery(
                tenant_id="t1", delivery=_delivery(applied_dns), items=_items(), account=_account()))
    return captured.get("payload")


def test_full_debit_note_adds_per_sku_taxable_lines():
    dn = {
        "id": "dn-1", "debit_note_number": "DN-2026-0001", "original_amount": 60.0,
        "items": [{"sku_id": "sku-x", "sku_name": "Nyla 330", "quantity": 3, "rate_per_unit": 20.0}],
    }
    applied = [{"debit_note_id": "dn-1", "debit_note_number": "DN-2026-0001", "amount_applied": 60.0}]
    payload = _capture_payload(applied, dn)
    lines = payload["line_items"]
    # 1 delivery line + 1 debit-note line
    dn_lines = [l for l in lines if "DN-2026-0001" in (l.get("description") or "")]
    assert len(dn_lines) == 1, f"expected 1 DN line, got {lines}"
    dl = dn_lines[0]
    assert dl["item_id"] == "zoho-sku-x", "DN line must carry SKU item_id for GST"
    assert dl["quantity"] == 3 and dl["rate"] == 20.0
    print("FULL OK:", dl)


def test_partial_debit_note_adds_single_taxable_line():
    dn = {
        "id": "dn-2", "debit_note_number": "DN-2026-0002", "original_amount": 100.0,
        "items": [{"sku_id": "sku-y", "sku_name": "Nyla 600", "quantity": 5, "rate_per_unit": 20.0}],
    }
    applied = [{"debit_note_id": "dn-2", "debit_note_number": "DN-2026-0002", "amount_applied": 40.0}]
    payload = _capture_payload(applied, dn)
    lines = payload["line_items"]
    dn_lines = [l for l in lines if "DN-2026-0002" in (l.get("name") or "")]
    assert len(dn_lines) == 1, f"expected 1 partial DN line, got {lines}"
    dl = dn_lines[0]
    assert dl["item_id"] == "zoho-sku-y", "partial DN line still uses a SKU item_id for GST"
    assert dl["quantity"] == 1 and dl["rate"] == 40.0
    print("PARTIAL OK:", dl)
