"""Regression tests for the delivery-schedule QR code in the driver PDF.

Both the driver schedule PDF and the combined bundle PDF are produced by
`_build_schedule_pdf`, so testing it covers both download paths.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes.distributor_delivery_schedules import _build_schedule_pdf, _maps_qr_flowable

DIST = {"distributor_name": "Test Dist", "distributor_code": "DIST-0001"}


def _schedule(lat, lng):
    return {
        "schedule_date": "2026-06-19",
        "vehicle": {}, "driver": {},
        "deliveries": [{
            "customer_name": "ACME Cafe", "delivery_number": "DEL-1",
            "delivery_address": {
                "address_line1": "12 Road", "city": "Hyderabad",
                "state": "TS", "pincode": "500001", "lat": lat, "lng": lng,
            },
            "items": [{"sku_name": "500ml", "quantity": 10, "packaging_label": "Crate"}],
        }],
    }


def test_qr_flowable_with_valid_coords():
    assert _maps_qr_flowable(17.385, 78.486) is not None


def test_qr_flowable_omitted_when_missing_or_zero():
    assert _maps_qr_flowable(None, None) is None
    assert _maps_qr_flowable(0, 0) is None
    assert _maps_qr_flowable("abc", "def") is None


def test_pdf_includes_qr_when_coords_present():
    with_qr = _build_schedule_pdf(_schedule(17.385, 78.486), DIST)
    no_qr = _build_schedule_pdf(_schedule(None, None), DIST)
    assert with_qr[:5] == b"%PDF-"
    assert no_qr[:5] == b"%PDF-"
    # The embedded QR image makes the PDF meaningfully larger.
    assert len(with_qr) > len(no_qr) + 2000


def test_pdf_builds_without_coords():
    # Must never raise for accounts that have no GPS coordinates.
    pdf = _build_schedule_pdf(_schedule(None, None), DIST)
    assert pdf[:5] == b"%PDF-"
