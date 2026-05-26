"""E-way Bill JSON payload builder (GSTN bulk-upload schema v1.03).

Threshold for E-way Bill generation in India:
  • Any movement of goods of consignment value > ₹50,000 (single transfer).
  • Applies to both intra-state and inter-state movements (states may exempt
    intra-state movements below the threshold).

This builder returns a single-row payload — the GSTN portal also accepts a bulk
upload with `eWayBillList[]`. We expose the single-row dict and let the caller
wrap it if needed.

Reference schema fields (https://docs.ewaybillgst.gov.in/):
  supplyType        : "O" outward / "I" inward
  subSupplyType     : "1" Supply, "5" Branch Transfer, ...
  docType           : "INV" Invoice, "CHL" Delivery Challan, "BIL" Bill of Supply
  docNo, docDate    : doc no + DD/MM/YYYY
  fromGstin/toGstin : 15-char GSTIN (URP for unregistered)
  fromTrdName, fromAddr1, fromAddr2, fromPlace, fromPincode, fromStateCode
  actFromStateCode  : actual dispatch state code (often = fromStateCode)
  ...to* counterparts
  transactionType   : 1 Regular / 2 Bill-To-Ship-To / 3 Bill-From-Dispatch-From / 4 Combo
  itemList[]        : product rows
  totalValue        : sum of taxable amounts
  cgstValue, sgstValue, igstValue, cessValue, cessNonAdvolValue
  totInvValue       : grand total
  transMode         : "1" Road / "2" Rail / "3" Air / "4" Ship
  vehicleNo         : alphanumeric, no spaces
  transDistance     : km (integer 0-4000)
"""
from __future__ import annotations

from typing import Optional


# ─── Defaults (kept centralised so admin can later override per-tenant) ───────
# HSN 22011010 = "Mineral & aerated waters not sweetened or flavoured — Packaged".
DEFAULT_HSN_CODE = "22011010"
# Bottled drinking water → 18% GST (most common slab). Override per-SKU.
DEFAULT_GST_PERCENT = 18.0
# Branch transfer between same legal entity → Supply (1) for Invoice case; for
# Delivery Challan transfers use "5" (Branch Transfer) which the caller can pick.
DEFAULT_SUB_SUPPLY_TYPE_INVOICE = "1"
DEFAULT_SUB_SUPPLY_TYPE_CHALLAN = "5"


def _state_code_from_gstin(gstin: Optional[str]) -> Optional[str]:
    """First 2 digits of a 15-char GSTIN encode the state."""
    s = (gstin or "").strip().upper()
    return s[:2] if len(s) >= 2 and s[:2].isdigit() else None


def _format_doc_date(iso_date: Optional[str]) -> str:
    """Convert ISO YYYY-MM-DD to DD/MM/YYYY (GSTN expected format)."""
    if not iso_date:
        return ""
    s = iso_date[:10]
    try:
        y, m, d = s.split("-")
        return f"{d}/{m}/{y}"
    except ValueError:
        return s


def _clean_vehicle(no: Optional[str]) -> str:
    return (no or "").replace(" ", "").replace("-", "").upper()[:20]


def build_eway_bill_payload(
    transfer: dict,
    src_distributor: dict,
    dst_distributor: dict,
    src_location: dict,
    dst_location: dict,
    skus_by_id: dict,
) -> dict:
    """Return a single-row E-way Bill JSON payload + computed totals + warnings.

    `skus_by_id` is a `{sku_id: master_sku_doc}` map used to source HSN code and
    GST rate. When fields are missing we fall back to DEFAULT_HSN_CODE /
    DEFAULT_GST_PERCENT and emit warnings the caller can surface to the UI.
    """
    warnings: list[str] = []

    doc_type = "INV" if transfer.get("zoho_doc_type") == "invoice" else "CHL"
    sub_supply = DEFAULT_SUB_SUPPLY_TYPE_INVOICE if doc_type == "INV" else DEFAULT_SUB_SUPPLY_TYPE_CHALLAN

    src_gstin = (src_location.get("gstin") or src_distributor.get("gstin") or "").strip().upper()
    dst_gstin = (dst_location.get("gstin") or dst_distributor.get("gstin") or "").strip().upper()
    src_state_code = _state_code_from_gstin(src_gstin) or ""
    dst_state_code = _state_code_from_gstin(dst_gstin) or ""

    if not src_gstin:
        warnings.append("Source warehouse has no GSTIN — fill the GSTIN on the distributor or location before uploading to GSTN.")
    if not dst_gstin:
        warnings.append("Destination warehouse has no GSTIN — fill the GSTIN on the distributor or location before uploading to GSTN.")
    if not src_location.get("pincode"):
        warnings.append(f"Source warehouse '{src_location.get('location_name')}' has no PIN code — required by GSTN.")
    if not dst_location.get("pincode"):
        warnings.append(f"Destination warehouse '{dst_location.get('location_name')}' has no PIN code — required by GSTN.")

    is_inter_state = bool(src_state_code and dst_state_code and src_state_code != dst_state_code)

    item_list = []
    total_taxable = 0.0
    total_cgst = 0.0
    total_sgst = 0.0
    total_igst = 0.0

    for idx, it in enumerate(transfer.get("items", []), start=1):
        sku_doc = skus_by_id.get(it.get("sku_id")) or {}
        hsn = sku_doc.get("hsn_code") or DEFAULT_HSN_CODE
        if not sku_doc.get("hsn_code"):
            warnings.append(f"SKU '{it.get('sku_name') or it.get('sku_id')}' has no HSN — using default {DEFAULT_HSN_CODE}.")
        gst_percent = float(sku_doc.get("gst_percent") or sku_doc.get("tax_percent") or DEFAULT_GST_PERCENT)
        if not (sku_doc.get("gst_percent") or sku_doc.get("tax_percent")):
            warnings.append(f"SKU '{it.get('sku_name') or it.get('sku_id')}' has no GST rate — using default {DEFAULT_GST_PERCENT}%.")

        # On the transfer, quantity is in PACKAGES, rate is per-package.
        # For E-way Bill GSTN expects bottle-level quantity + unit. So we
        # report quantity in raw units (`quantity_units` = packages × units_per_package)
        # with qtyUnit "NOS" (number of items) which is the safe default.
        qty_units = int(it.get("quantity_units") or (int(it.get("quantity", 0)) * int(it.get("units_per_package", 1))))
        rate_per_bottle = float(it.get("rate_per_bottle") or (float(it.get("rate", 0)) / max(int(it.get("units_per_package", 1)), 1)))
        taxable = round(qty_units * rate_per_bottle, 2)

        if is_inter_state:
            cgst_rate, sgst_rate, igst_rate = 0.0, 0.0, gst_percent
            cgst_val, sgst_val = 0.0, 0.0
            igst_val = round(taxable * igst_rate / 100, 2)
        else:
            half = round(gst_percent / 2, 2)
            cgst_rate, sgst_rate, igst_rate = half, half, 0.0
            cgst_val = round(taxable * cgst_rate / 100, 2)
            sgst_val = round(taxable * sgst_rate / 100, 2)
            igst_val = 0.0

        item_list.append({
            "productName": it.get("sku_name") or "",
            "productDesc": f"{it.get('quantity', 0)} {it.get('packaging_type_name', '')} of {it.get('sku_name', '')}".strip(),
            "hsnCode": str(hsn),
            "quantity": qty_units,
            "qtyUnit": "NOS",
            "cgstRate": cgst_rate,
            "sgstRate": sgst_rate,
            "igstRate": igst_rate,
            "cessRate": 0.0,
            "cessNonAdvol": 0.0,
            "taxableAmount": taxable,
        })

        total_taxable += taxable
        total_cgst += cgst_val
        total_sgst += sgst_val
        total_igst += igst_val

    total_inv_value = round(total_taxable + total_cgst + total_sgst + total_igst, 2)

    payload = {
        "supplyType": "O",
        "subSupplyType": sub_supply,
        "docType": doc_type,
        "docNo": transfer.get("transfer_number") or "",
        "docDate": _format_doc_date(transfer.get("transfer_date")),
        # Bill From + Dispatch From (same here)
        "fromGstin": src_gstin or "URP",
        "fromTrdName": src_distributor.get("legal_entity_name") or src_distributor.get("distributor_name") or "",
        "fromAddr1": src_location.get("address_line_1") or "",
        "fromAddr2": src_location.get("address_line_2") or "",
        "fromPlace": src_location.get("city") or "",
        "fromPincode": int(src_location.get("pincode")) if str(src_location.get("pincode") or "").isdigit() else 0,
        "fromStateCode": int(src_state_code) if src_state_code.isdigit() else 0,
        "actFromStateCode": int(src_state_code) if src_state_code.isdigit() else 0,
        # Bill To + Ship To (same here)
        "toGstin": dst_gstin or "URP",
        "toTrdName": dst_distributor.get("legal_entity_name") or dst_distributor.get("distributor_name") or "",
        "toAddr1": dst_location.get("address_line_1") or "",
        "toAddr2": dst_location.get("address_line_2") or "",
        "toPlace": dst_location.get("city") or "",
        "toPincode": int(dst_location.get("pincode")) if str(dst_location.get("pincode") or "").isdigit() else 0,
        "toStateCode": int(dst_state_code) if dst_state_code.isdigit() else 0,
        "actToStateCode": int(dst_state_code) if dst_state_code.isdigit() else 0,
        "transactionType": 1,
        "itemList": item_list,
        "totalValue": round(total_taxable, 2),
        "cgstValue": round(total_cgst, 2),
        "sgstValue": round(total_sgst, 2),
        "igstValue": round(total_igst, 2),
        "cessValue": 0.0,
        "cessNonAdvolValue": 0.0,
        "totInvValue": total_inv_value,
        "transMode": "1",  # Road
        "transDistance": 0,
        "transporterId": "",
        "transporterName": "",
        "transDocNo": "",
        "transDocDate": "",
        "vehicleNo": _clean_vehicle(transfer.get("vehicle_number")),
        "vehicleType": "R",
    }

    if not transfer.get("vehicle_number"):
        warnings.append("Vehicle number not set on this transfer — required by GSTN before generating the E-way Bill.")

    meta = {
        "required": total_inv_value > 50000.0,
        "is_inter_state": is_inter_state,
        "src_state_code": src_state_code,
        "dst_state_code": dst_state_code,
        "warnings": warnings,
        "totals": {
            "taxable": round(total_taxable, 2),
            "cgst": round(total_cgst, 2),
            "sgst": round(total_sgst, 2),
            "igst": round(total_igst, 2),
            "grand_total": total_inv_value,
        },
    }
    return {"payload": payload, "meta": meta}
