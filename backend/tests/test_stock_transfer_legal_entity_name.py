"""Regression: Zoho invoices/challans for inter-warehouse stock transfers must
bill to the distributor's LEGAL ENTITY NAME.

upsert_contact derives the Zoho `company_name` (the bold Bill-To heading on a
tax invoice) from `gst_legal_name`, and the Display Name (`contact_name`) from
`gst_trade_name`. So the transfer code must pass:
    gst_legal_name = legal_entity_name   (→ invoice legal name)
    gst_trade_name = distributor_name     (→ display / dedup key)

We capture the dict passed to `upsert_contact` and short-circuit (raise) right
after, so the test never touches Zoho or the DB.
"""
from unittest.mock import patch
import pytest

from services import zoho_service


class _Stop(Exception):
    pass


DEST = {
    "id": "dist-1",
    "distributor_name": "Bangalore (Godamwale)",
    "legal_entity_name": "Jaitra Wellness Private Limited",
    "gstin": "29AAFCJ4820K1ZB",
}
TRANSFER = {
    "id": "legal-entity-test-1", "transfer_number": "ST-TEST-LEGAL",
    "items": [{"sku_id": "s1", "sku_name": "Nyla 750ml", "packaging_type_name": "Carton",
               "quantity": 10, "quantity_units": 150, "rate": 100, "batch_code": "B1"}],
    "dest_gstin": "29AAFCJ4820K1ZB", "source_gstin": "36AAFCJ4820K1ZG",
}


async def _noop_find(*args, **kwargs):
    return None


async def _run_capture(fn_name):
    captured = {}

    async def _fake_upsert(tenant_id, account):
        captured["account"] = account
        raise _Stop()

    with patch.object(zoho_service, "is_zoho_configured", return_value=True), \
         patch.object(zoho_service, "upsert_contact", side_effect=_fake_upsert), \
         patch.object(zoho_service.db.zoho_invoice_mappings, "find_one", side_effect=_noop_find):
        fn = getattr(zoho_service, fn_name)
        try:
            await fn(tenant_id="t1", transfer=TRANSFER, dest_distributor=DEST)
        except _Stop:
            pass
    return captured.get("account")


@pytest.mark.asyncio
async def test_stock_transfer_docs_bill_to_legal_entity():
    # Delivery Challan (same-PAN, same-GSTIN inter-branch move).
    acct = await _run_capture("create_delivery_challan_for_stock_transfer")
    assert acct["gst_legal_name"] == "Jaitra Wellness Private Limited"
    assert acct["gst_trade_name"] == "Bangalore (Godamwale)"

    # Tax Invoice (same-PAN, different-GSTIN inter-branch move).
    acct = await _run_capture("create_invoice_for_stock_transfer")
    assert acct["gst_legal_name"] == "Jaitra Wellness Private Limited"
    assert acct["gst_trade_name"] == "Bangalore (Godamwale)"
