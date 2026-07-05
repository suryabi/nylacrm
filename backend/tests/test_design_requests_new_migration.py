"""Backend sanity for the Marketing Requests -> Design Requests - New migration.

Verifies (from review_request):
  * Counts endpoint reports all=20
  * Listing carries migrated_from_marketing_request_id + repointed SM name
  * Migrated request's /available-transitions returns 200 (proves SM repoint)
  * Re-running POST /migrate-from-marketing (dry-run) is idempotent: to_migrate=0, already_migrated=19
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
ADMIN_PASSWORD = "test123"


@pytest.fixture(scope="module")
def admin_client():
    """Session with X-Tenant-ID + Bearer token for the CEO admin."""
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "X-Tenant-ID": "nyla-air-water",
    })
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("session_token") or r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response keys={list(r.json().keys())}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# --- counts ---------------------------------------------------------------
class TestCountsAndListing:
    def test_counts_all_20(self, admin_client):
        r = admin_client.get(f"{API}/design-requests-new/counts")
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        # counts.all should now be 20 (1 seed + 19 migrated)
        all_ct = data.get("all") if "all" in data else (data.get("queues") or {}).get("all")
        assert all_ct == 20, f"expected all=20, got {all_ct} :: {data}"

    def test_list_has_migrated_records(self, admin_client):
        r = admin_client.get(f"{API}/design-requests-new", params={"queue": "all", "no_limit": "true"})
        assert r.status_code == 200, r.text[:200]
        payload = r.json()
        items = payload.get("items") if isinstance(payload, dict) else payload
        assert isinstance(items, list)
        assert len(items) >= 20, f"expected >=20 rows, got {len(items)}"
        migrated = [x for x in items if x.get("migrated_from_marketing_request_id")]
        assert len(migrated) == 19, f"expected 19 migrated rows, got {len(migrated)}"
        # every migrated row must carry the new lifecycle SM name
        bad_sm = [x for x in migrated if (x.get("state_machine_name") or "") != "Design Requests - New Lifecycle (default)"]
        assert not bad_sm, f"rows with wrong state_machine_name: {[b.get('request_number') for b in bad_sm][:5]}"
        # migrated MR-2026-xxxx numbering preserved
        mr_numbered = [x for x in migrated if str(x.get("request_number", "")).startswith("MR-2026-")]
        assert len(mr_numbered) == 19, f"expected 19 MR-2026-xxxx numbers, got {len(mr_numbered)}"

    def test_available_transitions_on_migrated(self, admin_client):
        r = admin_client.get(f"{API}/design-requests-new", params={"queue": "all", "no_limit": "true"})
        items = (r.json().get("items") if isinstance(r.json(), dict) else r.json())
        migrated = [x for x in items if x.get("migrated_from_marketing_request_id")]
        assert migrated, "no migrated rows to test"
        # Try up to 3 migrated ids in case some are in a terminal state
        checked = 0
        for m in migrated[:3]:
            r2 = admin_client.get(f"{API}/design-requests-new/{m['id']}/available-transitions")
            assert r2.status_code == 200, f"transitions failed for {m.get('request_number')}: {r2.status_code} {r2.text[:200]}"
            body = r2.json()
            assert "transitions" in body or isinstance(body, list), f"unexpected transitions payload: {body}"
            checked += 1
        assert checked >= 1


# --- idempotency ---------------------------------------------------------
class TestMigrationIdempotent:
    def test_dry_run_reports_zero_to_migrate(self, admin_client):
        r = admin_client.post(f"{API}/design-requests-new/migrate-from-marketing")
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert data.get("dry_run") is True
        assert data.get("already_migrated") == 19, f"already_migrated={data.get('already_migrated')} :: {data}"
        assert data.get("to_migrate") == 0, f"to_migrate={data.get('to_migrate')} :: {data}"


# --- rbac ---------------------------------------------------------------
class TestMigrationRBAC:
    def test_distributor_forbidden(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": "nyla-air-water"})
        r = s.post(f"{API}/auth/login", json={"email": "john.distributor@test.com", "password": "nyladist##"})
        if r.status_code != 200:
            pytest.skip("distributor login unavailable")
        tok = r.json().get("session_token") or r.json().get("token")
        if not tok:
            pytest.skip("no token")
        s.headers.update({"Authorization": f"Bearer {tok}"})
        r2 = s.post(f"{API}/design-requests-new/migrate-from-marketing")
        assert r2.status_code == 403, f"expected 403 for non-admin, got {r2.status_code}: {r2.text[:200]}"
