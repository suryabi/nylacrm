"""
Iteration 183 — Same-GSTIN stock transfer Delivery Challan must NOT carry GST.

Per Indian GST law, intra-entity stock movement (same legal entity, same GSTIN)
isn't a taxable supply — the delivery challan is the only document required and
should print without any CGST/SGST/IGST rows. Earlier the line items were sent
to Zoho without any explicit tax override, so Zoho would inherit the SKU
master's GST rate (18%) and print it on the challan PDF.

This test mocks the outbound Zoho HTTP call and asserts:
  • Each line item carries explicit zero-tax flags (tax_id, tax_percentage=0).
  • The document payload pins `is_inclusive_tax=False`, `tax_total=0`,
    `gst_treatment="out_of_scope"`.
  • `challan_type="others"` (unchanged).
"""
import os
import asyncio
import pytest
from unittest.mock import AsyncMock, patch
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")


def test_branch_transfer_challan_payload_zeroes_gst():
    from services import zoho_service

    captured: dict = {}

    async def _fake_request(method, path, *, tenant_id, json=None, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["payload"] = json
        return {
            "deliverychallan": {
                "deliverychallan_id": "fake-zoho-id-1",
                "deliverychallan_number": "DC-00001",
            }
        }

    async def _run():
        with patch.object(zoho_service, "_zoho_request", side_effect=_fake_request), \
             patch.object(zoho_service, "is_zoho_configured", return_value=True), \
             patch.object(zoho_service, "get_zoho_item_id", new=AsyncMock(return_value="zoho-item-1")), \
             patch.object(zoho_service, "upsert_contact", new=AsyncMock(return_value="zoho-contact-1")), \
             patch.object(zoho_service, "get_credentials", new=AsyncMock(return_value={})), \
             patch.object(zoho_service.db.zoho_invoice_mappings, "find_one", new=AsyncMock(return_value=None)), \
             patch.object(zoho_service.db.zoho_invoice_mappings, "update_one", new=AsyncMock()):
            await zoho_service.create_delivery_challan_for_stock_transfer(
                tenant_id="t1",
                transfer={
                    "id": "tr-1", "transfer_number": "TRF-001",
                    "transfer_date": "2026-05-27",
                    "source_distributor_name": "Self Co (Hyderabad)",
                    "source_location_name": "Hyderabad WH",
                    "dest_distributor_name": "Self Co (Hyderabad)",
                    "dest_location_name": "Madhapur WH",
                    "items": [
                        {"sku_id": "sku-1", "sku_name": "Nyla 660ml",
                         "packaging_type_name": "Crate-12",
                         "quantity": 100, "rate": 1200,
                         "batch_code": "BATCH-ITER183-A"},
                    ],
                },
                dest_distributor={
                    "id": "dest-d-1", "distributor_name": "Self Co",
                    "gstin": "36AABCS1429R1Z0",
                },
            )

    asyncio.run(_run())

    p = captured["payload"]
    assert p["challan_type"] == "others"
    # Document-level guarantees
    assert p["is_inclusive_tax"] is False
    assert p["gst_treatment"] == "out_of_scope"
    assert p["tax_total"] == 0

    # Every line item zeros out tax
    assert len(p["line_items"]) == 1
    li = p["line_items"][0]
    assert li["tax_id"] == ""
    assert li["tax_percentage"] == 0
    assert li["item_tax_preferences"] == []
    # Batch code is still embedded in the line name (regression check)
    assert "Batch BATCH-ITER183-A" in li["name"]
    # Rate & quantity preserved
    assert li["quantity"] == 100.0
    assert li["rate"] == 1200.0
