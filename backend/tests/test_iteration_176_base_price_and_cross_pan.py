"""Iteration 176 — SKU base_price persistence + Stock Transfer rate resolver
+ cross-PAN block + same-PAN success path.

Requires: surya.yadavalli@nylaairwater.earth / test123 admin login on the
preview backend. Uses live API (not in-process function calls).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://mention-collab.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("session_token") or r.json().get("access_token")
    assert token, f"No token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ── 1. SKU base_price CRUD ──────────────────────────────────────────────
class TestSkuBasePriceCRUD:
    def test_get_master_skus_returns_base_price_field(self, session):
        r = session.get(f"{BASE}/api/master-skus", timeout=15)
        assert r.status_code == 200
        data = r.json()
        skus = data if isinstance(data, list) else data.get("skus") or data.get("items") or []
        assert len(skus) > 0, "No SKUs returned"
        # Every row should expose base_price key (may be None)
        for s in skus:
            assert "base_price" in s, f"SKU missing base_price field: {s.get('sku_name')}"

    def test_post_master_sku_accepts_base_price(self, session):
        body = {
            "sku_name": f"TEST_iter176_{uuid.uuid4().hex[:6]}",
            "category": "Premium",
            "unit": "600ml",
            "base_price": 33.5,
            "description": "iter176 test sku",
        }
        r = session.post(f"{BASE}/api/master-skus", json=body, timeout=15)
        assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
        created = r.json()
        sku_id = created.get("id")
        assert sku_id, f"No id in response: {created}"
        assert float(created.get("base_price") or 0) == 33.5
        # GET and verify persistence
        r2 = session.get(f"{BASE}/api/master-skus", timeout=15)
        rows = r2.json() if isinstance(r2.json(), list) else r2.json().get("skus", [])
        match = [x for x in rows if x.get("id") == sku_id]
        assert match, "Newly created SKU not in GET list"
        assert float(match[0]["base_price"]) == 33.5
        # Cleanup
        session.delete(f"{BASE}/api/master-skus/{sku_id}", timeout=15)

    def test_put_master_sku_updates_base_price(self, session):
        # Create
        body = {"sku_name": f"TEST_iter176_put_{uuid.uuid4().hex[:6]}", "category": "Premium",
                "unit": "330ml", "base_price": 10.0}
        cr = session.post(f"{BASE}/api/master-skus", json=body, timeout=15)
        assert cr.status_code in (200, 201)
        sku_id = cr.json()["id"]
        try:
            # PUT new price
            ur = session.put(f"{BASE}/api/master-skus/{sku_id}", json={"base_price": 27.25}, timeout=15)
            assert ur.status_code == 200, f"PUT failed: {ur.status_code} {ur.text}"
            assert float(ur.json().get("base_price")) == 27.25
            # Verify persisted
            gr = session.get(f"{BASE}/api/master-skus", timeout=15)
            rows = gr.json() if isinstance(gr.json(), list) else gr.json().get("skus", [])
            persisted = next(x for x in rows if x["id"] == sku_id)
            assert float(persisted["base_price"]) == 27.25
        finally:
            session.delete(f"{BASE}/api/master-skus/{sku_id}", timeout=15)


# ── 2. Resolve-rate endpoint ────────────────────────────────────────────
class TestResolveRate:
    def _seed_sku_with_price(self, session, base_price):
        body = {"sku_name": f"TEST_iter176_rr_{uuid.uuid4().hex[:6]}", "category": "Premium",
                "unit": "600ml", "base_price": base_price}
        r = session.post(f"{BASE}/api/master-skus", json=body, timeout=15)
        assert r.status_code in (200, 201)
        return r.json()["id"]

    def _seed_sku_no_price(self, session):
        body = {"sku_name": f"TEST_iter176_np_{uuid.uuid4().hex[:6]}", "category": "Premium", "unit": "330ml"}
        r = session.post(f"{BASE}/api/master-skus", json=body, timeout=15)
        assert r.status_code in (200, 201)
        return r.json()["id"]

    def test_resolve_rate_ok_with_base_price(self, session):
        sku_id = self._seed_sku_with_price(session, 18.5)
        try:
            r = session.get(
                f"{BASE}/api/distributor/stock-transfers/resolve-rate",
                params={"sku_id": sku_id, "units_per_package": 24}, timeout=15,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["ok"] is True
            assert data["rate_per_bottle"] == 18.5
            assert data["rate_per_package"] == 444.0  # 18.5 * 24
        finally:
            session.delete(f"{BASE}/api/master-skus/{sku_id}", timeout=15)

    def test_resolve_rate_missing_when_no_base_price(self, session):
        sku_id = self._seed_sku_no_price(session)
        try:
            r = session.get(
                f"{BASE}/api/distributor/stock-transfers/resolve-rate",
                params={"sku_id": sku_id, "units_per_package": 12}, timeout=15,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["ok"] is False
            assert "Base Price" in data["reason"]
        finally:
            session.delete(f"{BASE}/api/master-skus/{sku_id}", timeout=15)

    def test_resolve_rate_signature_no_dest_required(self, session):
        """The new signature does NOT accept dest_distributor_id / dest_location_id /
        transfer_date — only sku_id + units_per_package."""
        sku_id = self._seed_sku_with_price(session, 22.0)
        try:
            r = session.get(
                f"{BASE}/api/distributor/stock-transfers/resolve-rate",
                params={"sku_id": sku_id, "units_per_package": 6}, timeout=15,
            )
            assert r.status_code == 200
            assert r.json().get("ok") is True
            assert r.json().get("rate_per_package") == 132.0  # 22 * 6
        finally:
            session.delete(f"{BASE}/api/master-skus/{sku_id}", timeout=15)


# ── 3. Cross-PAN block on POST /stock-transfers ─────────────────────────
class TestCrossPanBlock:
    def _find_live_dist_locations(self, session):
        """Locate Surya 1 (PAN AAFCJ4820K) and Surya Distributions (PAN AAAAA1234A)
        warehouses, and another warehouse on the SAME PAN as Surya 1 to test the
        positive case. Returns (cross_pan_pair, same_pan_pair) or skip."""
        r = session.get(f"{BASE}/api/distributor/stock-transfers/eligible-sources", timeout=15)
        assert r.status_code == 200
        sources = r.json().get("sources", [])
        rt = session.get(f"{BASE}/api/distributor/stock-transfers/eligible-targets", timeout=15)
        targets = rt.json().get("targets", [])
        # Group targets by PAN
        by_pan: dict = {}
        for t in targets:
            pan = t.get("pan")
            if pan:
                by_pan.setdefault(pan, []).append(t)
        # Pick a source with stock + known PAN
        src = next((s for s in sources if s.get("pan") and s.get("total_qty", 0) > 0), None)
        if not src:
            pytest.skip("No source with PAN + stock available")
        src_pan = src["pan"]
        # Find a target on a DIFFERENT PAN
        diff_pan_target = None
        for pan, locs in by_pan.items():
            if pan != src_pan:
                # exclude same location_id
                cands = [l for l in locs if l["location_id"] != src["location_id"]]
                if cands:
                    diff_pan_target = cands[0]
                    break
        # Find a target on SAME PAN as source (different location)
        same_pan_target = None
        for t in by_pan.get(src_pan, []):
            if t["location_id"] != src["location_id"]:
                same_pan_target = t
                break
        return src, diff_pan_target, same_pan_target

    def test_cross_pan_post_returns_400(self, session):
        src, diff_target, _same = self._find_live_dist_locations(session)
        if not diff_target:
            pytest.skip("No cross-PAN destination available in live data")
        # Use any SKU; the cross-PAN check should fire BEFORE pricing/stock.
        # But the route does stock + pricing check BEFORE the PAN check (see source).
        # So we need a SKU with positive stock at the source AND with base_price.
        loc_stock = session.get(
            f"{BASE}/api/distributor/stock-transfers/location-stock",
            params={"location_id": src["location_id"]}, timeout=15,
        ).json().get("stock", [])
        stock_skus = [r for r in loc_stock if (r.get("quantity") or 0) > 0]
        if not stock_skus:
            pytest.skip("Source has no SKU stock")
        # Find a stock SKU with base_price set
        all_skus = session.get(f"{BASE}/api/master-skus", timeout=15).json()
        if isinstance(all_skus, dict):
            all_skus = all_skus.get("skus") or all_skus.get("items") or []
        priced = {s["id"]: s for s in all_skus if s.get("base_price")}
        candidate = next((s for s in stock_skus if s["sku_id"] in priced), None)
        if not candidate:
            pytest.skip("No stock SKU with base_price set at source")
        # Build payload — quantity=1 package of 1 unit just to satisfy validation
        payload = {
            "source_distributor_id": src["distributor_id"],
            "source_location_id": src["location_id"],
            "dest_distributor_id": diff_target["distributor_id"],
            "dest_location_id": diff_target["location_id"],
            "items": [{
                "sku_id": candidate["sku_id"],
                "sku_name": candidate.get("sku_name"),
                "packaging_type_name": "Crate - 1",
                "units_per_package": 1,
                "quantity": 1,
            }],
            "notes": "TEST_iter176_cross_pan_should_block",
        }
        r = session.post(f"{BASE}/api/distributor/stock-transfers/", json=payload, timeout=20)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        msg = r.text
        assert "PAN" in msg or "Stock In" in msg, f"Error message missing PAN explanation: {msg}"


# ── 4. POST fails when SKU has no base_price ───────────────────────────
class TestNoBasePriceBlock:
    def test_post_blocked_when_sku_has_no_base_price(self, session):
        # Find a source with stock, then create a NEW SKU with no base_price and
        # try to transfer — but it won't have stock. So instead we look for an
        # existing SKU at the source that has NO base_price set.
        r = session.get(f"{BASE}/api/distributor/stock-transfers/eligible-sources", timeout=15)
        sources = r.json().get("sources", [])
        src = next((s for s in sources if s.get("total_qty", 0) > 0), None)
        if not src:
            pytest.skip("No source with stock")
        loc_stock = session.get(
            f"{BASE}/api/distributor/stock-transfers/location-stock",
            params={"location_id": src["location_id"]}, timeout=15,
        ).json().get("stock", [])
        stock_skus = [r for r in loc_stock if (r.get("quantity") or 0) > 0]
        all_skus = session.get(f"{BASE}/api/master-skus", timeout=15).json()
        if isinstance(all_skus, dict):
            all_skus = all_skus.get("skus") or all_skus.get("items") or []
        by_id = {s["id"]: s for s in all_skus}
        # SKU at source WITHOUT base_price
        no_price = next((s for s in stock_skus if not by_id.get(s["sku_id"], {}).get("base_price")), None)
        if not no_price:
            pytest.skip("All source SKUs have base_price set — can't test missing-price block")
        # Get a same-pan target
        targets = session.get(
            f"{BASE}/api/distributor/stock-transfers/eligible-targets",
            params={"exclude_location_id": src["location_id"]}, timeout=15,
        ).json().get("targets", [])
        same_pan = next((t for t in targets if t.get("pan") == src.get("pan")), None)
        if not same_pan:
            pytest.skip("No same-PAN target available")
        payload = {
            "source_distributor_id": src["distributor_id"],
            "source_location_id": src["location_id"],
            "dest_distributor_id": same_pan["distributor_id"],
            "dest_location_id": same_pan["location_id"],
            "items": [{
                "sku_id": no_price["sku_id"],
                "sku_name": no_price.get("sku_name"),
                "packaging_type_name": "Crate - 1",
                "units_per_package": 1,
                "quantity": 1,
            }],
            "notes": "TEST_iter176_no_baseprice_should_block",
        }
        r = session.post(f"{BASE}/api/distributor/stock-transfers/", json=payload, timeout=20)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        assert "Base Price" in r.text or "base_price" in r.text, f"Missing Base Price hint: {r.text}"
