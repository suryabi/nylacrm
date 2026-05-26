"""Tests for the auto-resolve rate flow on Distributor Stock Transfers.

We exercise the helper `_resolve_per_bottle_rate` against a seeded
`distributor_margin_matrix` collection so we know the rate-lookup logic
returns the correct entry under various date and city scenarios.
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db  # noqa: E402
from routes.distributor_stock_transfers import (  # noqa: E402
    _qualifies_for_challan,
    _resolve_per_bottle_rate,
)


TENANT_ID = f"test_tenant_{uuid.uuid4().hex[:8]}"
DIST_ID = f"test_dist_{uuid.uuid4().hex[:8]}"
SKU_ID = f"test_sku_{uuid.uuid4().hex[:8]}"


async def _seed(entries: list[dict]):
    await db.distributor_margin_matrix.delete_many({"tenant_id": TENANT_ID})
    if entries:
        await db.distributor_margin_matrix.insert_many(entries)


async def _cleanup():
    await db.distributor_margin_matrix.delete_many({"tenant_id": TENANT_ID})


def _entry(**overrides) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "tenant_id": TENANT_ID,
        "distributor_id": DIST_ID,
        "city": "Bangalore",
        "sku_id": SKU_ID,
        "sku_name": "Nyla 600ml",
        "base_price": 20.0,
        "margin_type": "percentage",
        "margin_value": 10.0,
        "transfer_price": 18.0,
        "active_from": "2024-01-01",
        "active_to": None,
        "status": "active",
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio(loop_scope="session")
async def test_resolves_active_entry():
    await _seed([_entry()])
    try:
        res = await _resolve_per_bottle_rate(TENANT_ID, DIST_ID, "Bangalore", SKU_ID, "2025-06-15")
        assert res is not None
        assert res["rate_per_bottle"] == 18.0
        assert res["transfer_price"] == 18.0
    finally:
        await _cleanup()


@pytest.mark.asyncio(loop_scope="session")
async def test_city_match_case_insensitive():
    await _seed([_entry(city="Bangalore")])
    try:
        res = await _resolve_per_bottle_rate(TENANT_ID, DIST_ID, "bangalore", SKU_ID, "2025-06-15")
        assert res is not None
        assert res["rate_per_bottle"] == 18.0
    finally:
        await _cleanup()


@pytest.mark.asyncio(loop_scope="session")
async def test_returns_none_for_unknown_city():
    await _seed([_entry()])
    try:
        res = await _resolve_per_bottle_rate(TENANT_ID, DIST_ID, "Chennai", SKU_ID, "2025-06-15")
        assert res is None
    finally:
        await _cleanup()


@pytest.mark.asyncio(loop_scope="session")
async def test_returns_none_when_no_active_entry():
    await _seed([])
    try:
        res = await _resolve_per_bottle_rate(TENANT_ID, DIST_ID, "Bangalore", SKU_ID, "2025-06-15")
        assert res is None
    finally:
        await _cleanup()


@pytest.mark.asyncio(loop_scope="session")
async def test_date_range_excludes_expired():
    await _seed([_entry(active_from="2024-01-01", active_to="2024-12-31")])
    try:
        res = await _resolve_per_bottle_rate(TENANT_ID, DIST_ID, "Bangalore", SKU_ID, "2025-06-15")
        assert res is None
    finally:
        await _cleanup()


@pytest.mark.asyncio(loop_scope="session")
async def test_picks_most_recent_active_entry():
    await _seed([
        _entry(transfer_price=15.0, active_from="2024-01-01", active_to="2025-12-31"),
        _entry(transfer_price=22.0, active_from="2026-01-01", active_to=None),
    ])
    try:
        res = await _resolve_per_bottle_rate(TENANT_ID, DIST_ID, "Bangalore", SKU_ID, "2026-06-15")
        assert res["rate_per_bottle"] == 22.0
    finally:
        await _cleanup()


@pytest.mark.asyncio(loop_scope="session")
async def test_falls_back_to_base_price_when_no_transfer_price():
    await _seed([_entry(transfer_price=None, base_price=25.0)])
    try:
        res = await _resolve_per_bottle_rate(TENANT_ID, DIST_ID, "Bangalore", SKU_ID, "2025-06-15")
        assert res is not None
        assert res["rate_per_bottle"] == 25.0
    finally:
        await _cleanup()


@pytest.mark.asyncio(loop_scope="session")
async def test_ignores_inactive_entries():
    await _seed([_entry(status="inactive")])
    try:
        res = await _resolve_per_bottle_rate(TENANT_ID, DIST_ID, "Bangalore", SKU_ID, "2025-06-15")
        assert res is None
    finally:
        await _cleanup()


# ──────────────────────────────────────────────────────────────
# Delivery-Challan vs Invoice decision (per Indian GST rules)
# ──────────────────────────────────────────────────────────────
SELF = {"is_self_managed": True}
THIRD = {"is_self_managed": False}


def test_challan_when_same_gstin_self_managed():
    """Both self-managed + identical GSTIN → Delivery Challan."""
    src = {**SELF, "gstin": "29ABCDE1234F1Z5"}
    dst = {**SELF, "gstin": "29ABCDE1234F1Z5"}
    assert _qualifies_for_challan(src, dst, {}, {}) is True


def test_invoice_when_same_pan_but_different_gstin():
    """Same legal entity, different state registrations (different GSTIN) → Invoice.

    This is the behavior change requested 2026-05-27: PAN-only matching used to
    qualify for a Delivery Challan, but the user clarified that inter-state
    branches with different GSTINs need a Tax Invoice instead.
    """
    src = {**SELF, "gstin": "29ABCDE1234F1Z5"}  # Karnataka
    dst = {**SELF, "gstin": "27ABCDE1234F1Z5"}  # Maharashtra (same PAN ABCDE1234F)
    assert _qualifies_for_challan(src, dst, {}, {}) is False


def test_invoice_when_one_party_not_self_managed():
    src = {**SELF, "gstin": "29ABCDE1234F1Z5"}
    dst = {**THIRD, "gstin": "29ABCDE1234F1Z5"}
    assert _qualifies_for_challan(src, dst, {}, {}) is False


def test_invoice_when_gstin_missing():
    src = {**SELF, "gstin": ""}
    dst = {**SELF, "gstin": "29ABCDE1234F1Z5"}
    assert _qualifies_for_challan(src, dst, {}, {}) is False


def test_challan_uses_location_gstin_override():
    """Location-level GSTIN takes precedence over the parent distributor's."""
    src_dist = {**SELF, "gstin": "29ABCDE1234F1Z5"}
    dst_dist = {**SELF, "gstin": "27ABCDE1234F1Z5"}
    src_loc = {"gstin": "33ABCDE1234F1Z5"}  # overrides parent
    dst_loc = {"gstin": "33ABCDE1234F1Z5"}  # overrides parent
    assert _qualifies_for_challan(src_dist, dst_dist, src_loc, dst_loc) is True


def test_gstin_match_is_case_insensitive():
    src = {**SELF, "gstin": "29abcde1234f1z5"}
    dst = {**SELF, "gstin": "29ABCDE1234F1Z5"}
    assert _qualifies_for_challan(src, dst, {}, {}) is True
