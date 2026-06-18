"""Tests for the E-way Bill JSON payload builder.

Verifies the GSTN single-row schema is populated correctly for representative
scenarios: intra-state (CGST+SGST), inter-state (IGST), missing GSTIN/HSN,
and the ₹50,000 threshold flag.
"""
from __future__ import annotations

from utils.eway_bill import build_eway_bill_payload, DEFAULT_HSN_CODE, DEFAULT_GST_PERCENT


def _make_transfer(items, *, vehicle="KA01AB1234", doc_type="invoice", transfer_no="ST-2026-9001"):
    return {
        "id": "tr_" + transfer_no,
        "transfer_number": transfer_no,
        "transfer_date": "2026-02-15",
        "zoho_doc_type": doc_type,
        "vehicle_number": vehicle,
        "items": items,
    }


def _make_dist(name, gstin, legal_name=None):
    return {
        "distributor_name": name,
        "legal_entity_name": legal_name or name,
        "gstin": gstin,
        "is_self_managed": True,
    }


def _make_loc(name, city, state, pincode, addr1="Plot 1", gstin=None):
    return {
        "location_name": name,
        "city": city,
        "state": state,
        "pincode": pincode,
        "address_line_1": addr1,
        "address_line_2": "",
        "gstin": gstin,
    }


def test_intra_state_splits_cgst_sgst():
    """Same state code on source & dest GSTINs → CGST + SGST (no IGST)."""
    transfer = _make_transfer([{
        "sku_id": "sku1", "sku_name": "Nyla 600ml",
        "packaging_type_name": "Crate-12", "units_per_package": 12,
        "quantity": 100, "quantity_units": 1200,
        "rate": 480.0, "rate_per_bottle": 40.0,
    }])
    src_dist = _make_dist("Acme", "29AAAAA0000A1Z5")
    dst_dist = _make_dist("Acme", "29AAAAA0000A1Z5")
    src_loc = _make_loc("WH-BLR", "Bangalore", "Karnataka", "560001")
    dst_loc = _make_loc("WH-MYS", "Mysore", "Karnataka", "570001")
    skus = {"sku1": {"id": "sku1", "hsn_code": "22011010", "gst_percent": 18}}

    out = build_eway_bill_payload(transfer, src_dist, dst_dist, src_loc, dst_loc, skus)
    p = out["payload"]
    m = out["meta"]
    assert m["is_inter_state"] is False
    assert p["cgstValue"] > 0 and p["sgstValue"] > 0
    assert p["igstValue"] == 0.0
    # 1200 × 40 = 48000 taxable, 18% split → 9% CGST + 9% SGST = 4320 + 4320
    assert p["totalValue"] == 48000.0
    assert p["cgstValue"] == 4320.0
    assert p["sgstValue"] == 4320.0
    assert p["totInvValue"] == 56640.0


def test_inter_state_uses_igst():
    """Different state codes → full GST as IGST."""
    transfer = _make_transfer([{
        "sku_id": "sku1", "sku_name": "Nyla 600ml",
        "packaging_type_name": "Crate-12", "units_per_package": 12,
        "quantity": 100, "quantity_units": 1200,
        "rate": 480.0, "rate_per_bottle": 40.0,
    }])
    src_dist = _make_dist("Acme", "29AAAAA0000A1Z5")  # Karnataka
    dst_dist = _make_dist("Acme", "27AAAAA0000A1Z5")  # Maharashtra
    src_loc = _make_loc("WH-BLR", "Bangalore", "Karnataka", "560001")
    dst_loc = _make_loc("WH-MUM", "Mumbai", "Maharashtra", "400001")
    skus = {"sku1": {"id": "sku1", "hsn_code": "22011010", "gst_percent": 18}}

    out = build_eway_bill_payload(transfer, src_dist, dst_dist, src_loc, dst_loc, skus)
    p = out["payload"]
    m = out["meta"]
    assert m["is_inter_state"] is True
    assert p["cgstValue"] == 0 and p["sgstValue"] == 0
    assert p["igstValue"] == 8640.0  # 18% of 48000
    assert p["totInvValue"] == 56640.0
    assert p["fromStateCode"] == 29
    assert p["toStateCode"] == 27


def test_threshold_flag():
    """`required` flips when grand total crosses ₹50,000."""
    items_small = [{
        "sku_id": "sku1", "sku_name": "Nyla", "packaging_type_name": "Crate-12",
        "units_per_package": 12, "quantity": 10, "quantity_units": 120,
        "rate": 1200.0, "rate_per_bottle": 100.0,
    }]
    items_large = [{
        "sku_id": "sku1", "sku_name": "Nyla", "packaging_type_name": "Crate-12",
        "units_per_package": 12, "quantity": 50, "quantity_units": 600,
        "rate": 1200.0, "rate_per_bottle": 100.0,
    }]
    src_dist = _make_dist("Acme", "29AAAAA0000A1Z5")
    dst_dist = _make_dist("Acme", "29AAAAA0000A1Z5")
    src_loc = _make_loc("S", "BLR", "KA", "560001")
    dst_loc = _make_loc("D", "MYS", "KA", "570001")
    skus = {"sku1": {"id": "sku1", "hsn_code": "22011010", "gst_percent": 18}}

    small = build_eway_bill_payload(_make_transfer(items_small), src_dist, dst_dist, src_loc, dst_loc, skus)
    large = build_eway_bill_payload(_make_transfer(items_large), src_dist, dst_dist, src_loc, dst_loc, skus)
    # 120 × 100 = 12000 taxable + 2160 GST = 14160 → below 50k
    assert small["meta"]["required"] is False
    # 600 × 100 = 60000 taxable + 10800 GST = 70800 → above 50k
    assert large["meta"]["required"] is True


def test_delivery_challan_doc_type():
    """`zoho_doc_type='delivery_challan'` → docType='CHL' and subSupplyType='5' (Branch Transfer)."""
    transfer = _make_transfer(
        [{
            "sku_id": "sku1", "sku_name": "Nyla", "packaging_type_name": "Crate-12",
            "units_per_package": 12, "quantity": 1, "quantity_units": 12,
            "rate": 120.0, "rate_per_bottle": 10.0,
        }],
        doc_type="delivery_challan",
    )
    src_dist = _make_dist("Acme", "29AAAAA0000A1Z5")
    dst_dist = _make_dist("Acme", "29AAAAA0000A1Z5")
    src_loc = _make_loc("S", "BLR", "KA", "560001")
    dst_loc = _make_loc("D", "MYS", "KA", "570001")
    skus = {"sku1": {"id": "sku1", "hsn_code": "22011010", "gst_percent": 18}}

    out = build_eway_bill_payload(transfer, src_dist, dst_dist, src_loc, dst_loc, skus)
    assert out["payload"]["docType"] == "CHL"
    assert out["payload"]["subSupplyType"] == "5"


def test_missing_hsn_emits_warning_and_defaults():
    transfer = _make_transfer([{
        "sku_id": "sku1", "sku_name": "Nyla", "packaging_type_name": "Crate-12",
        "units_per_package": 12, "quantity": 1, "quantity_units": 12,
        "rate": 120.0, "rate_per_bottle": 10.0,
    }])
    src_dist = _make_dist("Acme", "29AAAAA0000A1Z5")
    dst_dist = _make_dist("Acme", "29AAAAA0000A1Z5")
    src_loc = _make_loc("S", "BLR", "KA", "560001")
    dst_loc = _make_loc("D", "MYS", "KA", "570001")
    skus = {"sku1": {"id": "sku1"}}  # no hsn_code, no gst_percent

    out = build_eway_bill_payload(transfer, src_dist, dst_dist, src_loc, dst_loc, skus)
    p = out["payload"]
    assert p["itemList"][0]["hsnCode"] == DEFAULT_HSN_CODE
    assert p["itemList"][0]["cgstRate"] + p["itemList"][0]["sgstRate"] == DEFAULT_GST_PERCENT
    warnings = " | ".join(out["meta"]["warnings"])
    assert "HSN" in warnings
    assert "GST rate" in warnings


def test_missing_gstin_pincode_vehicle_warnings():
    transfer = _make_transfer(
        [{
            "sku_id": "sku1", "sku_name": "Nyla", "packaging_type_name": "Crate-12",
            "units_per_package": 12, "quantity": 1, "quantity_units": 12,
            "rate": 120.0, "rate_per_bottle": 10.0,
        }],
        vehicle="",
    )
    src_dist = _make_dist("Acme", "")
    dst_dist = _make_dist("Acme", "")
    src_loc = _make_loc("S", "BLR", "KA", "")
    dst_loc = _make_loc("D", "MYS", "KA", "")
    skus = {"sku1": {"id": "sku1", "hsn_code": "22011010", "gst_percent": 18}}

    out = build_eway_bill_payload(transfer, src_dist, dst_dist, src_loc, dst_loc, skus)
    warnings = " | ".join(out["meta"]["warnings"])
    assert "GSTIN" in warnings
    assert "PIN" in warnings
    assert "Vehicle" in warnings
    assert out["payload"]["fromGstin"] == "URP"
    assert out["payload"]["toGstin"] == "URP"


def test_location_gstin_overrides_distributor_gstin():
    transfer = _make_transfer([{
        "sku_id": "sku1", "sku_name": "Nyla", "packaging_type_name": "Crate-12",
        "units_per_package": 12, "quantity": 1, "quantity_units": 12,
        "rate": 120.0, "rate_per_bottle": 10.0,
    }])
    src_dist = _make_dist("Acme", "29AAAAA0000A1Z5")  # parent: Karnataka
    dst_dist = _make_dist("Acme", "29AAAAA0000A1Z5")
    src_loc = _make_loc("WH-CHN", "Chennai", "TN", "600001", gstin="33AAAAA0000A1Z5")
    dst_loc = _make_loc("WH-MYS", "Mysore", "KA", "570001", gstin="29AAAAA0000A1Z5")
    skus = {"sku1": {"id": "sku1", "hsn_code": "22011010", "gst_percent": 18}}

    out = build_eway_bill_payload(transfer, src_dist, dst_dist, src_loc, dst_loc, skus)
    assert out["payload"]["fromGstin"] == "33AAAAA0000A1Z5"
    assert out["payload"]["fromStateCode"] == 33
    assert out["meta"]["is_inter_state"] is True


def test_doc_date_format_is_dd_mm_yyyy():
    transfer = _make_transfer([{
        "sku_id": "sku1", "sku_name": "Nyla", "packaging_type_name": "Crate-12",
        "units_per_package": 12, "quantity": 1, "quantity_units": 12,
        "rate": 120.0, "rate_per_bottle": 10.0,
    }])
    transfer["transfer_date"] = "2026-02-15"
    src_dist = _make_dist("Acme", "29AAAAA0000A1Z5")
    dst_dist = _make_dist("Acme", "29AAAAA0000A1Z5")
    src_loc = _make_loc("S", "BLR", "KA", "560001")
    dst_loc = _make_loc("D", "MYS", "KA", "570001")
    skus = {"sku1": {"id": "sku1", "hsn_code": "22011010", "gst_percent": 18}}

    out = build_eway_bill_payload(transfer, src_dist, dst_dist, src_loc, dst_loc, skus)
    assert out["payload"]["docDate"] == "15/02/2026"
