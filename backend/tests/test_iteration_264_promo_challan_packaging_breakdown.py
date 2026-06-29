"""Iteration 264 — Promotional Stock-Out Zoho Delivery Challan packaging breakdown.

Scope (backend, mocked Zoho):
 1. `zoho_service.create_delivery_challan_for_promo_dispatch` builds line_items
    such that:
      * For an item with packaging_units=12 (multi-bottle pack), quantity=24,
        packages=2, packaging_type_name='Crate-12' → name contains
        '2 × Crate-12 = 24 bottles' and quantity==24 (bottles).
      * For an item with packaging_units=1 (single-bottle), quantity=5 →
        name contains '5 bottles' and quantity==5.
    Verified by monkeypatching `_zoho_request` (capture POST to /deliverychallans
    then sentinel-raise) plus the supporting Zoho helpers and the mongo
    collections used inside the function.
 2. `routes.promo_dispatch._push_promo_dispatch_to_zoho` forwards `packages`
    and `packaging_units` into `items_for_zoho` so the challan builder can
    compute the breakdown — verified by patching the symbol that
    `_push_promo_dispatch_to_zoho` calls and capturing its `items` kwarg.
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest


class _Sentinel(Exception):
    """Raised by the fake _zoho_request after capturing the payload, so the
    rest of `create_delivery_challan_for_promo_dispatch` (address sync, doc
    persistence, etc.) is short-circuited without hitting more I/O."""


def _build_mock_db():
    """A minimal stand-in for the module-level `db` used inside zoho_service:
    only the two collection methods that fire before the captured POST.
    """
    invoice_mappings = type("Coll", (), {
        "find_one": AsyncMock(return_value=None),
        "update_one": AsyncMock(return_value=None),
    })()
    distributor_locations = type("Coll", (), {
        "find_one": AsyncMock(return_value=None),
    })()
    return type("FakeDB", (), {
        "zoho_invoice_mappings": invoice_mappings,
        "distributor_locations": distributor_locations,
    })()


# ---------------------------------------------------------------------------
# 1. Packaging breakdown in the line_item NAME and bottle QUANTITY
# ---------------------------------------------------------------------------
def test_promo_challan_name_includes_packaging_breakdown():
    """Multi-bottle pack: name = '<SKU> · 2 × Crate-12 = 24 bottles · …', qty=24."""
    from services import zoho_service as zs

    captured: dict = {}

    async def fake_zoho_request(method, path, *, tenant_id, json):
        captured["method"] = method
        captured["path"] = path
        captured["json"] = json
        raise _Sentinel("captured")

    async def fake_upsert_contact(_t, _a):
        return "ZC-TEST-CRATE"

    async def fake_get_item_id(_t, _s):
        return "ZI-TEST-CRATE"

    async def _runner():
        with patch.object(zs, "_zoho_request", side_effect=fake_zoho_request), \
             patch.object(zs, "upsert_contact", side_effect=fake_upsert_contact), \
             patch.object(zs, "get_zoho_item_id", side_effect=fake_get_item_id), \
             patch.object(zs, "is_zoho_configured", return_value=True), \
             patch.object(zs, "get_credentials", new=AsyncMock(return_value={})), \
             patch.object(zs, "db", _build_mock_db()):
            with pytest.raises(_Sentinel):
                await zs.create_delivery_challan_for_promo_dispatch(
                    tenant_id="t1",
                    dispatch={
                        "id": "promo-crate",
                        "challan_number": "DC-CRATE-1",
                        "delivery_date": "2026-02-06",
                        "contact_name": "Promo Test",
                        "contact_company": "Acme",
                        "promo_reason": "Brand Sampling",
                        "delivery_address": "Addr A",
                    },
                    items=[{
                        "sku_id": "s1",
                        "sku_name": "Nyla 600",
                        # quantity is in BOTTLES (24 bottles = 2 crates × 12)
                        "quantity": 24,
                        "unit_price": 5.0,
                        "batch_code": "B-1",
                        "packaging_units": 12,
                        "packages": 2,
                        "packaging_type_name": "Crate-12",
                    }],
                    distributor={"id": "dist-1", "distributor_name": "DistCo"},
                )

    asyncio.run(_runner())

    body = captured.get("json")
    assert body, "POST payload was not captured"
    assert captured["path"].endswith("/deliverychallans"), captured["path"]

    lis = body["line_items"]
    assert len(lis) == 1
    li = lis[0]

    # Bottle-level quantity in the challan QTY column (NOT crates).
    assert li["quantity"] == 24.0, f"expected qty=24 bottles, got {li['quantity']!r}"

    # Packaging+bottles breakdown in the display name.
    name = li["name"]
    assert "2 × Crate-12 = 24 bottles" in name, name
    assert "Nyla 600" in name, name  # base SKU name preserved
    assert "Batch B-1" in name, name  # batch still present
    # Promo banner preserved on every line.
    assert "Not for Sale" in name, name


def test_promo_challan_name_singleton_pack_uses_plain_bottles():
    """upp == 1 (no multi-bottle pack): name should contain '5 bottles' (no '×')."""
    from services import zoho_service as zs

    captured: dict = {}

    async def fake_zoho_request(method, path, *, tenant_id, json):
        captured["json"] = json
        captured["path"] = path
        raise _Sentinel("captured")

    async def _runner():
        with patch.object(zs, "_zoho_request", side_effect=fake_zoho_request), \
             patch.object(zs, "upsert_contact", new=AsyncMock(return_value="ZC")), \
             patch.object(zs, "get_zoho_item_id", new=AsyncMock(return_value="ZI")), \
             patch.object(zs, "is_zoho_configured", return_value=True), \
             patch.object(zs, "get_credentials", new=AsyncMock(return_value={})), \
             patch.object(zs, "db", _build_mock_db()):
            with pytest.raises(_Sentinel):
                await zs.create_delivery_challan_for_promo_dispatch(
                    tenant_id="t1",
                    dispatch={
                        "id": "promo-single",
                        "challan_number": "DC-SINGLE-1",
                        "delivery_date": "2026-02-06",
                        "contact_name": "Promo Single",
                        "delivery_address": "Addr B",
                    },
                    items=[{
                        "sku_id": "s2",
                        "sku_name": "Nyla 1L",
                        "quantity": 5,
                        "unit_price": 50.0,
                        "packaging_units": 1,   # no multi-bottle pack
                        "packages": 5,
                        "packaging_type_name": "Bottle",
                    }],
                    distributor={"id": "dist-1", "distributor_name": "DistCo"},
                )

    asyncio.run(_runner())

    li = captured["json"]["line_items"][0]
    assert li["quantity"] == 5.0, li
    name = li["name"]
    # Plain "<n> bottles", no '×' breakdown for single-bottle packs.
    assert "5 bottles" in name, name
    assert "×" not in name, f"singleton pack should not include × symbol: {name}"
    assert "Nyla 1L" in name


def test_promo_challan_name_falls_back_when_packaging_type_missing():
    """packaging_units>1 but packaging_type_name missing → fall back to
    '<upp>-bottle pack' label and still print '<packages> × … = <bottles>'."""
    from services import zoho_service as zs

    captured: dict = {}

    async def fake_zoho_request(method, path, *, tenant_id, json):
        captured["json"] = json
        raise _Sentinel("captured")

    async def _runner():
        with patch.object(zs, "_zoho_request", side_effect=fake_zoho_request), \
             patch.object(zs, "upsert_contact", new=AsyncMock(return_value="ZC")), \
             patch.object(zs, "get_zoho_item_id", new=AsyncMock(return_value="ZI")), \
             patch.object(zs, "is_zoho_configured", return_value=True), \
             patch.object(zs, "get_credentials", new=AsyncMock(return_value={})), \
             patch.object(zs, "db", _build_mock_db()):
            with pytest.raises(_Sentinel):
                await zs.create_delivery_challan_for_promo_dispatch(
                    tenant_id="t1",
                    dispatch={"id": "p3", "challan_number": "DC-3",
                              "contact_name": "X", "delivery_address": "A"},
                    items=[{
                        "sku_id": "s3", "sku_name": "Nyla 250",
                        "quantity": 24, "unit_price": 1.0,
                        "packaging_units": 12, "packages": 2,
                        # packaging_type_name intentionally absent.
                    }],
                    distributor={"id": "d", "distributor_name": "DistCo"},
                )

    asyncio.run(_runner())
    li = captured["json"]["line_items"][0]
    assert li["quantity"] == 24.0
    name = li["name"]
    # Fallback label: "<upp>-bottle pack"
    assert "2 × 12-bottle pack = 24 bottles" in name, name


def test_promo_challan_packages_derived_when_not_supplied():
    """If `packages` is not supplied but packaging_units is, the function
    derives packages = bottles // upp so the breakdown still prints."""
    from services import zoho_service as zs

    captured: dict = {}

    async def fake_zoho_request(method, path, *, tenant_id, json):
        captured["json"] = json
        raise _Sentinel("captured")

    async def _runner():
        with patch.object(zs, "_zoho_request", side_effect=fake_zoho_request), \
             patch.object(zs, "upsert_contact", new=AsyncMock(return_value="ZC")), \
             patch.object(zs, "get_zoho_item_id", new=AsyncMock(return_value="ZI")), \
             patch.object(zs, "is_zoho_configured", return_value=True), \
             patch.object(zs, "get_credentials", new=AsyncMock(return_value={})), \
             patch.object(zs, "db", _build_mock_db()):
            with pytest.raises(_Sentinel):
                await zs.create_delivery_challan_for_promo_dispatch(
                    tenant_id="t1",
                    dispatch={"id": "p4", "challan_number": "DC-4",
                              "contact_name": "Y", "delivery_address": "A"},
                    items=[{
                        "sku_id": "s4", "sku_name": "Nyla 500",
                        "quantity": 36, "unit_price": 1.0,
                        "packaging_units": 12,
                        "packaging_type_name": "Crate-12",
                        # packages intentionally absent → must derive 36/12 = 3
                    }],
                    distributor={"id": "d", "distributor_name": "DistCo"},
                )

    asyncio.run(_runner())
    li = captured["json"]["line_items"][0]
    assert li["quantity"] == 36.0
    assert "3 × Crate-12 = 36 bottles" in li["name"], li["name"]


# ---------------------------------------------------------------------------
# 2. routes/promo_dispatch.py forwards packages + packaging_units
# ---------------------------------------------------------------------------
def test_push_promo_dispatch_to_zoho_forwards_packaging_fields():
    """_push_promo_dispatch_to_zoho must hand the challan builder the
    `packages`, `packaging_units` and `packaging_type_name` keys so the line
    name + bottle-qty breakdown can be computed downstream."""
    from routes import promo_dispatch as pd

    captured: dict = {}

    async def fake_create_challan(*, tenant_id, dispatch, items, distributor):
        captured["tenant_id"] = tenant_id
        captured["dispatch"] = dispatch
        captured["items"] = items
        captured["distributor"] = distributor
        # Return a fake mapping so the caller can persist sync metadata.
        return {"zoho_invoice_id": "ZD-FAKE-1",
                "zoho_invoice_number": "DC-Z-FAKE-1"}

    fake_coll = type("Coll", (), {
        "update_one": AsyncMock(return_value=None),
    })()

    items_in = [{
        "sku_id": "s1",
        "sku_name": "Nyla 600",
        "quantity": 24,           # bottles
        "unit_price": 5.0,
        "batch_code": "B-1",
        "packaging_type_id": "pt-crate-12",
        "packaging_type_name": "Crate-12",
        "packaging_units": 12,
        "packages": 2,
        "units_per_package": 12,
    }]

    async def _runner():
        with patch.object(
            pd, "create_delivery_challan_for_promo_dispatch",
            side_effect=fake_create_challan,
        ):
            res = await pd._push_promo_dispatch_to_zoho(
                tenant_id="t1",
                dispatch_id="d1",
                dispatch={"id": "d1", "challan_number": "DC-1",
                          "contact_name": "X", "delivery_address": "A"},
                items=items_in,
                distributor={"id": "dist-1", "distributor_name": "DistCo"},
                coll=fake_coll,
            )
            return res

    res = asyncio.run(_runner())
    assert res["status"] == "synced", res

    forwarded = captured["items"]
    assert len(forwarded) == 1
    fwd = forwarded[0]
    # The exact keys the builder needs:
    assert fwd["packages"] == 2, fwd
    assert fwd["packaging_units"] == 12, fwd
    assert fwd["packaging_type_name"] == "Crate-12", fwd
    assert fwd["sku_id"] == "s1"
    assert fwd["quantity"] == 24
    # And the persistence write happened.
    fake_coll.update_one.assert_awaited()  # type: ignore[attr-defined]


def test_push_promo_dispatch_to_zoho_falls_back_to_units_per_package():
    """Older promo lines may only carry `units_per_package` (no `packaging_units`).
    `_push_promo_dispatch_to_zoho` must still forward a usable
    `packaging_units` value to the builder."""
    from routes import promo_dispatch as pd

    captured: dict = {}

    async def fake_create_challan(*, tenant_id, dispatch, items, distributor):
        captured["items"] = items
        return {"zoho_invoice_id": "ZD-X"}

    fake_coll = type("Coll", (), {"update_one": AsyncMock(return_value=None)})()

    async def _runner():
        with patch.object(
            pd, "create_delivery_challan_for_promo_dispatch",
            side_effect=fake_create_challan,
        ):
            await pd._push_promo_dispatch_to_zoho(
                tenant_id="t1",
                dispatch_id="d2",
                dispatch={"id": "d2", "challan_number": "DC-2",
                          "contact_name": "X", "delivery_address": "A"},
                items=[{
                    "sku_id": "s2", "sku_name": "Nyla 1L",
                    "quantity": 24, "unit_price": 1.0,
                    "units_per_package": 12,   # legacy key only
                    "packages": 2,
                    "packaging_type_name": "Crate-12",
                }],
                distributor={"id": "d", "distributor_name": "DistCo"},
                coll=fake_coll,
            )

    asyncio.run(_runner())
    fwd = captured["items"][0]
    assert fwd["packaging_units"] == 12, fwd  # filled from units_per_package
    assert fwd["packages"] == 2
    assert fwd["packaging_type_name"] == "Crate-12"
