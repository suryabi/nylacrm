"""
QC Live Board enhancements (iteration 336):
 1. Reject alert flow — qc-settings alert_emails CRUD + threshold cross → reject_alert_sent=true (idempotent)
 2. Shift report PDF (today + empty-day)
 3. QC reason trends endpoint shape
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://design-workflow-hub-11.preview.emergentagent.com").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    token = r.json().get("session_token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def active_batch(client):
    r = client.get(f"{BASE_URL}/api/production/batches", timeout=30)
    assert r.status_code == 200
    for b in r.json():
        if b.get("status") == "completed":
            continue
        sb = b.get("stage_balances") or {}
        for st in (b.get("qc_stages") or []):
            bal = sb.get(st["id"]) or {}
            if int(bal.get("pending") or 0) > 0:
                return {"batch": b, "stage": st}
    pytest.skip("No batch with pending>0 stage found")


# ────────────────────────────────
# QC settings — alert_emails
# ────────────────────────────────
class TestQCSettingsAlertEmails:
    def test_get_settings_shape(self, client):
        r = client.get(f"{BASE_URL}/api/production/qc-settings", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "acceptable_reject_rate_pct" in data
        assert "idle_alert_minutes" in data
        assert "alert_emails" in data
        assert isinstance(data["alert_emails"], list)

    def test_update_alert_emails_persists(self, client):
        # Snapshot originals so we can restore
        orig = client.get(f"{BASE_URL}/api/production/qc-settings", timeout=30).json()
        try:
            emails = ["TEST_alert1@example.com", "TEST_alert2@example.com"]
            r = client.put(
                f"{BASE_URL}/api/production/qc-settings",
                json={
                    "acceptable_reject_rate_pct": 5.0,
                    "idle_alert_minutes": 10,
                    "alert_emails": emails,
                },
                timeout=30,
            )
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["alert_emails"] == emails
            assert d["acceptable_reject_rate_pct"] == 5.0
            assert d["idle_alert_minutes"] == 10
            # Re-fetch
            r2 = client.get(f"{BASE_URL}/api/production/qc-settings", timeout=30).json()
            assert r2["alert_emails"] == emails
        finally:
            client.put(f"{BASE_URL}/api/production/qc-settings", json=orig, timeout=30)

    def test_update_strips_and_ignores_empty_emails(self, client):
        orig = client.get(f"{BASE_URL}/api/production/qc-settings", timeout=30).json()
        try:
            r = client.put(
                f"{BASE_URL}/api/production/qc-settings",
                json={"alert_emails": [" a@b.com ", "", "  ", "c@d.com"]},
                timeout=30,
            )
            assert r.status_code == 200
            assert r.json()["alert_emails"] == ["a@b.com", "c@d.com"]
        finally:
            client.put(f"{BASE_URL}/api/production/qc-settings", json=orig, timeout=30)


# ────────────────────────────────
# Reject alert threshold flow
# ────────────────────────────────
class TestRejectAlertFlow:
    def test_alert_fires_once_on_threshold_cross(self, client, active_batch):
        b = active_batch["batch"]
        stage = active_batch["stage"]
        # Ensure threshold 5% is in force
        orig = client.get(f"{BASE_URL}/api/production/qc-settings", timeout=30).json()
        client.put(
            f"{BASE_URL}/api/production/qc-settings",
            json={"acceptable_reject_rate_pct": 5.0, "idle_alert_minutes": 10, "alert_emails": []},
            timeout=30,
        )

        # Grab first reason
        rr = client.get(f"{BASE_URL}/api/production/rejection-reasons", timeout=30).json()
        assert rr
        reason_id = rr[0]["id"]

        # Start session with crates=1
        r = client.post(
            f"{BASE_URL}/api/production/qc-sessions",
            json={"batch_id": b["id"], "stage_id": stage["id"], "crates_inspected": 1},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        sid = r.json()["id"]

        try:
            import time

            # Tap 3 rejections
            for _ in range(3):
                r = client.patch(
                    f"{BASE_URL}/api/production/qc-sessions/{sid}/tap",
                    json={"reason_id": reason_id, "delta": 1},
                    timeout=30,
                )
                assert r.status_code == 200, r.text

            # Allow background task to complete
            time.sleep(2.0)

            # Read session via active lookup (full doc incl reject_alert_sent)
            mine = client.get(
                f"{BASE_URL}/api/production/qc-sessions/active",
                params={"batch_id": b["id"], "stage_id": stage["id"]},
                timeout=30,
            ).json()
            assert mine and mine.get("id") == sid
            # Reject rate = 3/(1*12)*100 = 25% > 5% → flag should be set
            assert mine.get("reject_alert_sent") is True, f"reject_alert_sent should be True, got {mine}"
            first_alert_at = mine.get("reject_alert_at")
            assert first_alert_at

            # Verify live board also reflects over_threshold
            live = client.get(f"{BASE_URL}/api/production/qc-sessions/live", timeout=30).json()
            live_row = next((s for s in live.get("sessions", []) if s["id"] == sid), None)
            assert live_row is not None
            assert live_row.get("over_threshold") is True
            assert live_row.get("reject_rate_pct", 0) > 5.0

            # Tap once more — flag & timestamp must not change (idempotent)
            r = client.patch(
                f"{BASE_URL}/api/production/qc-sessions/{sid}/tap",
                json={"reason_id": reason_id, "delta": 1},
                timeout=30,
            )
            assert r.status_code == 200
            time.sleep(2.0)
            mine2 = client.get(
                f"{BASE_URL}/api/production/qc-sessions/active",
                params={"batch_id": b["id"], "stage_id": stage["id"]},
                timeout=30,
            ).json()
            assert mine2 and mine2.get("reject_alert_sent") is True
            assert mine2.get("reject_alert_at") == first_alert_at, "Alert timestamp must be immutable after first send"

        finally:
            client.delete(f"{BASE_URL}/api/production/qc-sessions/{sid}", timeout=30)
            client.put(f"{BASE_URL}/api/production/qc-settings", json=orig, timeout=30)


# ────────────────────────────────
# Shift report PDF
# ────────────────────────────────
class TestShiftReport:
    def test_shift_report_today_returns_pdf(self, client):
        r = client.get(f"{BASE_URL}/api/production/qc-shift-report", timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 500
        assert 'attachment' in (r.headers.get("content-disposition") or "").lower()

    def test_shift_report_empty_day(self, client):
        r = client.get(f"{BASE_URL}/api/production/qc-shift-report?date=2020-01-01", timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        # Try extracting text to verify "No inspections recorded" content
        try:
            import pdfplumber
            import io

            with pdfplumber.open(io.BytesIO(r.content)) as pdf:
                text = "\n".join(p.extract_text() or "" for p in pdf.pages)
            assert "No inspections recorded" in text
        except ImportError:
            # pdfplumber not installed → skip text assertion
            pass


# ────────────────────────────────
# Trends endpoint
# ────────────────────────────────
class TestReasonTrends:
    def test_trends_shape(self, client):
        r = client.get(f"{BASE_URL}/api/production/qc-reason-trends", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "date" in d
        assert "trends" in d
        assert isinstance(d["trends"], list)
        for t in d["trends"]:
            assert set(["reason", "color", "total", "hourly"]).issubset(t.keys())
            assert isinstance(t["hourly"], list)
            assert len(t["hourly"]) == 24
            assert all(isinstance(x, int) for x in t["hourly"])
            assert t["total"] == sum(t["hourly"])
            assert t["total"] > 0

    def test_trends_pick_up_open_session_counts(self, client, active_batch):
        """An open session's counts should be added to the current UTC hour bucket."""
        import time
        from datetime import datetime, timezone

        b = active_batch["batch"]
        stage = active_batch["stage"]
        rr = client.get(f"{BASE_URL}/api/production/rejection-reasons", timeout=30).json()
        reason = rr[0]
        # baseline
        before = client.get(f"{BASE_URL}/api/production/qc-reason-trends", timeout=30).json()
        before_row = next((t for t in before["trends"] if t["reason"] == reason["name"]), None)
        before_hour = datetime.now(timezone.utc).hour
        before_val = (before_row or {}).get("hourly", [0] * 24)[before_hour]

        # start session and tap 2
        r = client.post(
            f"{BASE_URL}/api/production/qc-sessions",
            json={"batch_id": b["id"], "stage_id": stage["id"], "crates_inspected": 0},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        try:
            for _ in range(2):
                client.patch(
                    f"{BASE_URL}/api/production/qc-sessions/{sid}/tap",
                    json={"reason_id": reason["id"], "delta": 1},
                    timeout=30,
                )
            time.sleep(0.5)
            after = client.get(f"{BASE_URL}/api/production/qc-reason-trends", timeout=30).json()
            after_row = next((t for t in after["trends"] if t["reason"] == reason["name"]), None)
            assert after_row is not None
            after_hour = datetime.now(timezone.utc).hour
            # Compare at the same hour (in case hour rolled — very unlikely, but be safe)
            if after_hour == before_hour:
                assert after_row["hourly"][before_hour] >= before_val + 2
        finally:
            client.delete(f"{BASE_URL}/api/production/qc-sessions/{sid}", timeout=30)


# ────────────────────────────────
# Batch history (drilldown data source)
# ────────────────────────────────
class TestBatchHistory:
    def test_history_shape(self, client, active_batch):
        b = active_batch["batch"]
        r = client.get(f"{BASE_URL}/api/production/batches/{b['id']}/history", timeout=30)
        assert r.status_code == 200
        d = r.json()
        # Common history keys — allow either 'inspections' or a nested shape
        assert isinstance(d, dict)
        # Some codebases return {"inspections": [...], "batch": {...}}
        assert "inspections" in d or "history" in d or "batch" in d
