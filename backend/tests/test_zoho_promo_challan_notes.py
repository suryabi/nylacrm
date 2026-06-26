"""Verify the Promo Dispatch delivery-challan NOTES are condensed to <=2 lines
so the printed Zoho challan fits on one page. Mocks Zoho HTTP + DB and captures
the POST /deliverychallans payload."""
import asyncio
from types import SimpleNamespace
from unittest.mock import patch, AsyncMock

import pytest
import services.zoho_service as zs


class _StopAfterPost(Exception):
    pass


def _dispatch(**over):
    d = {
        "id": "pd-1", "challan_number": "PROMO-001", "delivery_date": "2026-06-15",
        "contact_name": "Ravi Kumar", "contact_company": "Cafe Bloom",
        "contact_phone": "+91 99999 88888", "promo_reason": "Sampling",
        "vehicle_number": "KA01AB1234", "driver_name": "Suresh",
        "remarks": "Handle with care", "source_zoho_branch_id": "",
    }
    d.update(over)
    return d


def _capture_notes(dispatch):
    captured = {}

    async def fake_zoho_request(method, path, *, tenant_id=None, json=None, **kw):
        if path == "/books/v3/deliverychallans" and method == "POST":
            captured["payload"] = json
            raise _StopAfterPost()
        return {}

    db = SimpleNamespace()
    db.zoho_invoice_mappings = SimpleNamespace(find_one=AsyncMock(return_value=None))
    db.distributor_locations = SimpleNamespace(find_one=AsyncMock(return_value=None))

    items = [{"sku_id": "sku-1", "sku_name": "Nyla 600", "quantity": 6, "unit_price": 10}]
    distributor = {"id": "dist-1", "distributor_name": "Brian", "legal_entity_name": "Brian LLP"}

    with patch.object(zs, "is_zoho_configured", return_value=True), \
         patch.object(zs, "db", db), \
         patch.object(zs, "upsert_contact", AsyncMock(return_value="cust-1")), \
         patch.object(zs, "get_zoho_item_id", AsyncMock(side_effect=lambda t, sku: f"zoho-{sku}")), \
         patch.object(zs, "_zoho_request", side_effect=fake_zoho_request):
        with pytest.raises(_StopAfterPost):
            asyncio.get_event_loop().run_until_complete(
                zs.create_delivery_challan_for_promo_dispatch(
                    tenant_id="t1", dispatch=dispatch, items=items, distributor=distributor))
    return captured["payload"]["notes"]


def test_full_promo_notes_is_two_lines():
    notes = _capture_notes(_dispatch())
    lines = notes.split("\n")
    print("NOTES:\n", notes)
    assert len(lines) == 2, f"expected 2 lines, got {len(lines)}: {lines!r}"
    assert "NOT FOR SALE" in lines[0]
    # all recipient details collapsed onto a single line
    assert lines[1].startswith("Recipient: Ravi Kumar (Cafe Bloom)")
    for token in ("Ph:", "Reason:", "Vehicle:", "Driver:", "Remarks:"):
        assert token in lines[1]


def test_minimal_promo_notes_still_two_lines():
    notes = _capture_notes(_dispatch(contact_company=None, contact_phone=None,
                                     promo_reason=None, vehicle_number=None,
                                     driver_name=None, remarks=None))
    lines = notes.split("\n")
    assert len(lines) == 2, f"expected 2 lines, got {lines!r}"
    assert lines[1] == "Recipient: Ravi Kumar"
