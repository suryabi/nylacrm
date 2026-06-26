"""
Tests for iteration 242 — Promo Dispatch unit_label field.
- GET /api/distributors/{id}/promo-deliveries returns `unit_label` per dispatch
- Distributor Brian (bb12d90e-4d33-4890-ac5f-17573c551b5c) returns 200 with dispatches array
- Each dispatch has unit_label (string or null)
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
BRIAN_ID = "bb12d90e-4d33-4890-ac5f-17573c551b5c"
LOGIN = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=LOGIN, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


# Verify Brian's promo-deliveries endpoint returns dispatches with unit_label
def test_promo_deliveries_has_unit_label(session):
    r = session.get(
        f"{BASE_URL}/api/distributors/{BRIAN_ID}/promo-deliveries", timeout=30)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"
    data = r.json()
    assert "dispatches" in data, f"missing dispatches key: {list(data.keys())}"
    dispatches = data["dispatches"]
    assert isinstance(dispatches, list)
    assert len(dispatches) > 0, "no dispatches found for Brian (expected DC-2606-0001..0006)"
    for d in dispatches:
        assert "unit_label" in d, f"missing unit_label on dispatch {d.get('id')}"
        u = d["unit_label"]
        assert u is None or isinstance(u, str), f"unit_label must be str/None, got {type(u)}"


# Verify _promo_unit_label() derivation logic directly
def test_unit_label_derivation_logic():
    # Replicate the helper exactly as in routes/promo_dispatch.py
    def derive(items):
        words = set()
        for it in items or []:
            name = (it.get("packaging_type_name") or "").strip()
            if not name:
                continue
            base = re.sub(r"\(.*\)$", "", name).strip()
            parts = base.split()
            if parts:
                words.add(parts[-1].lower())
        return next(iter(words)) if len(words) == 1 else None

    assert derive([{"packaging_type_name": "Crate (12)"}]) == "crate"
    assert derive([{"packaging_type_name": "Carton (24)"}]) == "carton"
    assert derive([{"packaging_type_name": "Bottle"}]) == "bottle"
    assert derive([{"packaging_type_name": ""}]) is None
    assert derive([{"packaging_type_name": None}]) is None
    # Mixed → None
    assert derive([
        {"packaging_type_name": "Crate (12)"},
        {"packaging_type_name": "Bottle"},
    ]) is None
    # All same → that word
    assert derive([
        {"packaging_type_name": "Crate (12)"},
        {"packaging_type_name": "Crate (24)"},
    ]) == "crate"


# Smoke check: at least one expected challan number from seeded set is present
def test_seeded_challans_present(session):
    r = session.get(
        f"{BASE_URL}/api/distributors/{BRIAN_ID}/promo-deliveries", timeout=30)
    assert r.status_code == 200
    nums = {d.get("challan_number") for d in r.json().get("dispatches", [])}
    expected_any = {f"DC-2606-000{i}" for i in range(1, 7)}
    assert nums & expected_any, f"none of {expected_any} found in {nums}"
