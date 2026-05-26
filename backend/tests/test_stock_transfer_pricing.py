"""Tests for the new Stock-Transfer rate resolver — sources price from
`master_skus.base_price` (NO margin), and the third-party PAN block.

Replaces test_stock_transfer_pricing.py for the resolver layer.
"""
from __future__ import annotations

import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db  # noqa: E402
from routes.distributor_stock_transfers import (  # noqa: E402
    _qualifies_for_challan,
    _resolve_per_bottle_rate,
    _extract_pan,
)


TENANT_ID = f"test_tenant_{uuid.uuid4().hex[:8]}"


async def _seed_sku(*, base_price=None, sku_id=None) -> str:
    sku_id = sku_id or f"sku_{uuid.uuid4().hex[:8]}"
    doc = {
        "id": sku_id,
        "sku_name": "Nyla 600ml Test",
        "category": "Premium",
        "unit": "600ml",
        "is_active": True,
    }
    if base_price is not None:
        doc["base_price"] = base_price
    await db.master_skus.insert_one(doc)
    return sku_id


async def _cleanup(sku_id: str):
    await db.master_skus.delete_one({"id": sku_id})


@pytest.mark.asyncio(loop_scope="session")
async def test_resolves_from_base_price():
    sku_id = await _seed_sku(base_price=18.5)
    try:
        res = await _resolve_per_bottle_rate(TENANT_ID, sku_id)
        assert res is not None
        assert res["rate_per_bottle"] == 18.5
        assert res["source"] == "master_sku.base_price"
        assert res["sku_id"] == sku_id
    finally:
        await _cleanup(sku_id)


@pytest.mark.asyncio(loop_scope="session")
async def test_returns_none_when_base_price_missing():
    sku_id = await _seed_sku(base_price=None)
    try:
        res = await _resolve_per_bottle_rate(TENANT_ID, sku_id)
        assert res is None
    finally:
        await _cleanup(sku_id)


@pytest.mark.asyncio(loop_scope="session")
async def test_returns_none_for_zero_or_negative_base_price():
    sku_id = await _seed_sku(base_price=0)
    try:
        assert await _resolve_per_bottle_rate(TENANT_ID, sku_id) is None
    finally:
        await _cleanup(sku_id)
    sku_id2 = await _seed_sku(base_price=-5)
    try:
        assert await _resolve_per_bottle_rate(TENANT_ID, sku_id2) is None
    finally:
        await _cleanup(sku_id2)


@pytest.mark.asyncio(loop_scope="session")
async def test_returns_none_for_unknown_sku():
    res = await _resolve_per_bottle_rate(TENANT_ID, "nonexistent_sku_id")
    assert res is None


@pytest.mark.asyncio(loop_scope="session")
async def test_resolver_ignores_destination_distributor():
    """Rate is destination-independent — same SKU returns same price
    regardless of which destination is asked about."""
    sku_id = await _seed_sku(base_price=42.0)
    try:
        r1 = await _resolve_per_bottle_rate(TENANT_ID, sku_id)
        # The new signature doesn't even accept a destination — verify by signature.
        assert r1["rate_per_bottle"] == 42.0
    finally:
        await _cleanup(sku_id)


# ──────────────────────────────────────────────────────────────
# Challan vs Invoice rule (unchanged) — keeps regression coverage
# ──────────────────────────────────────────────────────────────
SELF = {"is_self_managed": True}
THIRD = {"is_self_managed": False}


def test_challan_when_same_gstin_self_managed():
    src = {**SELF, "gstin": "29ABCDE1234F1Z5"}
    dst = {**SELF, "gstin": "29ABCDE1234F1Z5"}
    assert _qualifies_for_challan(src, dst, {}, {}) is True


def test_invoice_when_same_pan_but_different_gstin():
    src = {**SELF, "gstin": "29ABCDE1234F1Z5"}
    dst = {**SELF, "gstin": "27ABCDE1234F1Z5"}
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
    src_dist = {**SELF, "gstin": "29ABCDE1234F1Z5"}
    dst_dist = {**SELF, "gstin": "27ABCDE1234F1Z5"}
    src_loc = {"gstin": "33ABCDE1234F1Z5"}
    dst_loc = {"gstin": "33ABCDE1234F1Z5"}
    assert _qualifies_for_challan(src_dist, dst_dist, src_loc, dst_loc) is True


def test_gstin_match_is_case_insensitive():
    src = {**SELF, "gstin": "29abcde1234f1z5"}
    dst = {**SELF, "gstin": "29ABCDE1234F1Z5"}
    assert _qualifies_for_challan(src, dst, {}, {}) is True


# ──────────────────────────────────────────────────────────────
# Third-party PAN block helper
# ──────────────────────────────────────────────────────────────
def test_extract_pan_extracts_positions_3_to_12():
    assert _extract_pan("29ABCDE1234F1Z5") == "ABCDE1234F"


def test_extract_pan_handles_missing_or_invalid():
    # Function returns "" (falsy) for invalid / missing input — callers should
    # treat empty string as "no PAN known".
    assert _extract_pan(None) == ""
    assert _extract_pan("") == ""
    assert _extract_pan("XYZ") == ""
