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
from routes.distributor_stock_transfers import _resolve_per_bottle_rate  # noqa: E402


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
