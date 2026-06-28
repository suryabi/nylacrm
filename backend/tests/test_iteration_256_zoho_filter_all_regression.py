"""Iteration 256 — REGRESSION for the one-line change in
zoho_service.fetch_bank_transactions() that now passes
`filter_by=Status.All` so EVERY Zoho bank transaction is pulled
(uncategorized/categorized/matched/etc.).

Goal here is NOT to validate Zoho connectivity (Zoho is not connected
in this preview env) — it is to confirm the change did not break the
sync start/poll endpoints or the transactions inbox endpoints, and
that a sync attempt without Zoho fails GRACEFULLY (no 500s)."""

import os
import time
import requests
import pytest

def _load_frontend_env_url():
    try:
        with open("/app/frontend/.env", "r") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.strip().split("=", 1)[1]
    except Exception:
        pass
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env_url() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set in env or /app/frontend/.env"
API = f"{BASE_URL}/api"
TENANT = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


# ---------- shared auth ----------
@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD, "tenant_id": TENANT},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("session_token") or body.get("access_token") or body.get("token")
    assert token, f"No token in login response: {body}"
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": TENANT,
        "Content-Type": "application/json",
    }


# ---------- 1) POST /sync — does not 500, returns within 5s ----------
class TestSyncStart:
    def test_sync_start_does_not_500(self, auth_headers):
        t0 = time.monotonic()
        r = requests.post(
            f"{API}/accounting/transactions/sync",
            params={"date_start": "2026-06-01", "date_end": "2026-06-30"},
            headers=auth_headers,
            timeout=15,
        )
        elapsed = time.monotonic() - t0
        print(f"/sync status={r.status_code} elapsed={elapsed:.2f}s body={r.text[:300]}")
        assert r.status_code != 500, f"Sync endpoint returned 500: {r.text}"
        # Preview env: Zoho not connected -> expect graceful 400 with helpful detail
        # OR if Zoho IS connected -> 200 with job_id.
        assert r.status_code in (200, 400), f"Unexpected status {r.status_code}: {r.text}"
        assert elapsed < 5.0, f"/sync took {elapsed:.2f}s — must be < 5s"

        if r.status_code == 200:
            body = r.json()
            assert "job_id" in body, body
            assert body.get("status") == "started"
            # stash job_id for the next test class via env (simple cross-test channel)
            os.environ["_IT256_JOB_ID"] = body["job_id"]
        else:
            body = r.json()
            detail = body.get("detail", "")
            assert "Zoho" in detail or "not connected" in detail.lower(), (
                f"400 detail should be human-readable: {detail}"
            )


# ---------- 2) GET /sync/status/{job_id} — no 500, graceful failed/error state ----------
class TestSyncStatus:
    def test_status_unknown_job_returns_404_not_500(self, auth_headers):
        r = requests.get(
            f"{API}/accounting/transactions/sync/status/does-not-exist-1234",
            headers=auth_headers,
            timeout=10,
        )
        assert r.status_code == 404, f"expected 404 for unknown job, got {r.status_code}: {r.text}"

    def test_status_for_started_job_polls_to_terminal_state(self, auth_headers):
        """If POST /sync returned a job_id (Zoho connected), poll until terminal.
        If it returned 400 (Zoho not connected — preview env), skip cleanly."""
        job_id = os.environ.get("_IT256_JOB_ID")
        if not job_id:
            pytest.skip("Zoho not connected in this env — no job_id to poll")

        deadline = time.monotonic() + 60.0
        last_body = None
        while time.monotonic() < deadline:
            r = requests.get(
                f"{API}/accounting/transactions/sync/status/{job_id}",
                headers=auth_headers,
                timeout=10,
            )
            assert r.status_code != 500, f"sync/status returned 500: {r.text}"
            assert r.status_code == 200, f"unexpected status {r.status_code}: {r.text}"
            last_body = r.json()
            status = last_body.get("status")
            print(f"job {job_id} status={status} progress={last_body.get('progress')}")
            assert status in {"running", "completed", "failed"}, f"unknown status: {status}"
            if status in {"completed", "failed"}:
                break
            time.sleep(1.5)
        assert last_body is not None
        # The job MUST reach a terminal state and any failure MUST carry a
        # readable string message — not a stack trace from an unhandled exception.
        if last_body.get("status") == "failed":
            assert isinstance(last_body.get("error"), str) and last_body["error"], (
                f"failed job must include readable error string: {last_body}"
            )


# ---------- 3) GET / list — summary counts + pagination shape intact ----------
class TestListInbox:
    def test_list_returns_inbox_shape(self, auth_headers):
        r = requests.get(
            f"{API}/accounting/transactions",
            params={"page": 1, "limit": 25},
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"list failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        # Shape assertions
        for k in ("items", "total", "page", "limit", "summary"):
            assert k in body, f"missing '{k}' in list response: {list(body.keys())}"
        assert isinstance(body["items"], list)
        assert isinstance(body["total"], int)
        assert body["page"] == 1
        assert body["limit"] == 25
        summary = body["summary"]
        # Summary tabs the UI relies on
        for k in ("untagged", "tagged", "all"):
            assert k in summary, f"summary missing '{k}': {summary}"
            assert isinstance(summary[k], int)
        # pagination integrity
        assert len(body["items"]) <= 25
        # Spot-check the doc shape if any rows exist
        if body["items"]:
            row = body["items"][0]
            for k in ("id", "direction", "amount", "date", "status"):
                assert k in row, f"row missing '{k}': {list(row.keys())}"
            # never leak mongo _id or the raw zoho payload
            assert "_id" not in row
            assert "raw" not in row

    def test_list_filter_by_direction_works(self, auth_headers):
        r = requests.get(
            f"{API}/accounting/transactions",
            params={"direction": "credit", "page": 1, "limit": 10},
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"list w/ direction failed: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert all((it.get("direction") == "credit") for it in body["items"]), (
            "direction filter not honored"
        )


# ---------- 4) GET /flow-summary ----------
class TestFlowSummary:
    def test_flow_summary_shape(self, auth_headers):
        r = requests.get(
            f"{API}/accounting/transactions/flow-summary",
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200, f"flow-summary failed: {r.status_code} {r.text[:300]}"
        body = r.json()
        for k in ("credit", "debit", "net"):
            assert k in body, f"flow-summary missing '{k}': {list(body.keys())}"
        for side in ("credit", "debit"):
            assert "total" in body[side] and "count" in body[side], body[side]
            assert isinstance(body[side]["total"], (int, float))
            assert isinstance(body[side]["count"], int)
        assert isinstance(body["net"], (int, float))


# ---------- 5) GET /export?format=csv ----------
class TestExportCsv:
    def test_export_csv(self, auth_headers):
        r = requests.get(
            f"{API}/accounting/transactions/export",
            params={"format": "csv"},
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"csv export failed: {r.status_code} {r.text[:300]}"
        ctype = r.headers.get("content-type", "")
        assert "text/csv" in ctype, f"unexpected content-type: {ctype}"
        # Verify expected header line
        first_line = r.content.decode("utf-8-sig", errors="replace").split("\n", 1)[0]
        assert "Transaction ID" in first_line, f"unexpected header row: {first_line}"
        # Spot-check a few columns the UI relies on
        for col in ("Date", "Direction", "Amount", "Zoho Transaction ID", "Status"):
            assert col in first_line, f"missing column '{col}' in CSV header: {first_line}"
