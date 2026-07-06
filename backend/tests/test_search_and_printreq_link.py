"""
Tests for two fixes:
1) Design Requests free-form search should not 500 on regex special characters.
2) GET /api/print-requests should support source_request_ids filter to list
   print requests linked to given design request IDs.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

CREDS = {"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"}
LEAD_ID = "20c97966-ab07-4428-893f-cd5633393eee"
DESIGN_REQ_ID = "3761de64-c0c7-42b7-adaf-a15c8a17e2e9"  # MR-2026-0020
EXPECTED_PRINT_NUMBER = "PR-2026-0003"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=CREDS, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


# ---------- Design Requests free-form search ----------
class TestDesignRequestsSearch:
    @pytest.mark.parametrize("term", ["Neck", "DRN", "DRN-2026"])
    def test_normal_terms_return_200(self, client, term):
        r = client.get(f"{BASE_URL}/api/design-requests-new", params={"search": term}, timeout=30)
        assert r.status_code == 200, f"{term}: {r.status_code} {r.text[:200]}"
        data = r.json()
        # response shape: {items: [...], total: n} or list
        if isinstance(data, dict):
            assert "items" in data or "results" in data or "data" in data

    @pytest.mark.parametrize("term", ["(", "\\", "(unclosed", ")", "[]", "*", "+", "?", ".*"])
    def test_special_characters_do_not_500(self, client, term):
        r = client.get(f"{BASE_URL}/api/design-requests-new", params={"search": term}, timeout=30)
        assert r.status_code == 200, f"search={term!r} returned {r.status_code}: {r.text[:200]}"


# ---------- Print Requests source_request_ids filter ----------
class TestPrintRequestsSourceFilter:
    def test_source_request_ids_returns_linked(self, client):
        r = client.get(
            f"{BASE_URL}/api/print-requests",
            params={"source_request_ids": DESIGN_REQ_ID, "limit": 100},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:200]
        payload = r.json()
        items = payload.get("items", payload) if isinstance(payload, dict) else payload
        # find PR-2026-0003
        numbers = [it.get("print_number") for it in items]
        assert EXPECTED_PRINT_NUMBER in numbers, f"expected {EXPECTED_PRINT_NUMBER} in {numbers}"
        pr = next(it for it in items if it.get("print_number") == EXPECTED_PRINT_NUMBER)
        assert pr.get("source_marketing_request_id") == DESIGN_REQ_ID
        # status should be On Hold per problem statement
        status_name = pr.get("status_name") or (pr.get("status") or {}).get("name")
        assert status_name and "hold" in status_name.lower(), f"unexpected status: {status_name}"

    def test_unknown_source_id_returns_empty(self, client):
        r = client.get(
            f"{BASE_URL}/api/print-requests",
            params={"source_request_ids": "00000000-0000-0000-0000-000000000000"},
            timeout=30,
        )
        assert r.status_code == 200
        payload = r.json()
        items = payload.get("items", payload) if isinstance(payload, dict) else payload
        assert items == [] or len(items) == 0


# ---------- Cross-check design request list scoped to the lead ----------
class TestLeadDesignRequests:
    def test_lead_design_requests_contains_mr_2026_0020(self, client):
        r = client.get(
            f"{BASE_URL}/api/design-requests-new",
            params={"lead_id": LEAD_ID, "limit": 100},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:200]
        payload = r.json()
        items = payload.get("items", payload) if isinstance(payload, dict) else payload
        numbers = [it.get("request_number") for it in items]
        assert "MR-2026-0020" in numbers, f"MR-2026-0020 missing from lead's design requests: {numbers}"
