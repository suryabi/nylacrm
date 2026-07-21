"""
QC Station backend regression tests
Covers:
- Rejection Reasons visual config (color/icon/image) — CRUD
- QC Station session lifecycle: start → tap (+1/-1, floor at 0) → update crates → resume → submit → discard
- Submit validation (crates<=0), reason_id→name mapping, batch.total_rejected increase, session status=submitted
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://design-workflow-hub-11.preview.emergentagent.com").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"


# ────────────────────────────────
# Fixtures
# ────────────────────────────────
@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("session_token")
    assert token, "No session_token in login response"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def active_batch(client):
    """Pick a batch with at least one QC stage that has pending_crates > 0."""
    r = client.get(f"{BASE_URL}/api/production/batches", timeout=30)
    assert r.status_code == 200, r.text
    batches = r.json()
    for b in batches:
        if b.get("status") == "completed":
            continue
        sb = b.get("stage_balances") or {}
        for st in (b.get("qc_stages") or []):
            bal = sb.get(st["id"]) or {}
            if int(bal.get("pending") or 0) > 0:
                return {"batch": b, "stage": st}
    pytest.skip("No batch with a stage having pending>0 found")


# ────────────────────────────────
# Rejection Reasons — visual config
# ────────────────────────────────
class TestRejectionReasonsVisualConfig:
    def test_list_reasons(self, client):
        r = client.get(f"{BASE_URL}/api/production/rejection-reasons", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # Seeded reasons should each expose color and icon fields
        if data:
            for row in data:
                assert "color" in row
                assert "icon" in row

    def test_create_with_color_icon(self, client):
        name = f"TEST_QCS_{uuid.uuid4().hex[:6]}"
        payload = {
            "name": name,
            "description": "auto-test",
            "color": "#ef4444",
            "icon": "alert-triangle",
        }
        r = client.post(f"{BASE_URL}/api/production/rejection-reasons", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["name"] == name
        assert created["color"] == "#ef4444"
        assert created["icon"] == "alert-triangle"
        assert "id" in created

        # GET must show it with visual config persisted
        r2 = client.get(f"{BASE_URL}/api/production/rejection-reasons", timeout=30)
        row = next((x for x in r2.json() if x["id"] == created["id"]), None)
        assert row is not None
        assert row["color"] == "#ef4444"
        assert row["icon"] == "alert-triangle"

        # Cleanup
        client.delete(f"{BASE_URL}/api/production/rejection-reasons/{created['id']}", timeout=30)

    def test_update_color_icon_persists(self, client):
        name = f"TEST_QCS_{uuid.uuid4().hex[:6]}"
        r = client.post(
            f"{BASE_URL}/api/production/rejection-reasons",
            json={"name": name, "color": "#111827", "icon": "circle"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        try:
            r = client.put(
                f"{BASE_URL}/api/production/rejection-reasons/{rid}",
                json={"color": "#22c55e", "icon": "droplet"},
                timeout=30,
            )
            assert r.status_code == 200, r.text
            upd = r.json()
            assert upd["color"] == "#22c55e"
            assert upd["icon"] == "droplet"
            # Verify via GET
            r = client.get(f"{BASE_URL}/api/production/rejection-reasons", timeout=30)
            row = next((x for x in r.json() if x["id"] == rid), None)
            assert row and row["color"] == "#22c55e" and row["icon"] == "droplet"
        finally:
            client.delete(f"{BASE_URL}/api/production/rejection-reasons/{rid}", timeout=30)

    def test_create_duplicate_name_400(self, client):
        name = f"TEST_QCS_DUP_{uuid.uuid4().hex[:6]}"
        r = client.post(
            f"{BASE_URL}/api/production/rejection-reasons",
            json={"name": name, "color": "#334155", "icon": "circle"},
            timeout=30,
        )
        assert r.status_code == 200
        rid = r.json()["id"]
        try:
            r2 = client.post(
                f"{BASE_URL}/api/production/rejection-reasons",
                json={"name": name},
                timeout=30,
            )
            assert r2.status_code == 400
        finally:
            client.delete(f"{BASE_URL}/api/production/rejection-reasons/{rid}", timeout=30)


# ────────────────────────────────
# QC Sessions lifecycle
# ────────────────────────────────
class TestQCSessions:
    def test_start_session_invalid_batch(self, client):
        r = client.post(
            f"{BASE_URL}/api/production/qc-sessions",
            json={"batch_id": "nope-nope", "stage_id": "x"},
            timeout=30,
        )
        assert r.status_code == 404

    def test_start_session_invalid_stage(self, client, active_batch):
        b = active_batch["batch"]
        r = client.post(
            f"{BASE_URL}/api/production/qc-sessions",
            json={"batch_id": b["id"], "stage_id": "bogus"},
            timeout=30,
        )
        assert r.status_code == 400

    def test_full_lifecycle(self, client, active_batch):
        b = active_batch["batch"]
        stage = active_batch["stage"]

        # Also grab a rejection reason to tap
        rr = client.get(f"{BASE_URL}/api/production/rejection-reasons", timeout=30).json()
        assert rr, "Need at least one rejection reason to test tap"
        reason_id = rr[0]["id"]
        reason_name = rr[0]["name"]

        # Start
        r = client.post(
            f"{BASE_URL}/api/production/qc-sessions",
            json={"batch_id": b["id"], "stage_id": stage["id"], "crates_inspected": 0},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        sess = r.json()
        assert sess["status"] == "open"
        assert sess["batch_id"] == b["id"]
        assert sess["stage_id"] == stage["id"]
        sid = sess["id"]

        try:
            # Tap +1 twice
            for _ in range(2):
                r = client.patch(
                    f"{BASE_URL}/api/production/qc-sessions/{sid}/tap",
                    json={"reason_id": reason_id, "delta": 1},
                    timeout=30,
                )
                assert r.status_code == 200, r.text
            assert int(r.json()["counts"].get(reason_id, 0)) == 2

            # Tap -1 → decrement to 1
            r = client.patch(
                f"{BASE_URL}/api/production/qc-sessions/{sid}/tap",
                json={"reason_id": reason_id, "delta": -1},
                timeout=30,
            )
            assert r.status_code == 200
            assert int(r.json()["counts"].get(reason_id, 0)) == 1

            # Tap -1 twice more must floor at 0 (never negative)
            client.patch(f"{BASE_URL}/api/production/qc-sessions/{sid}/tap",
                         json={"reason_id": reason_id, "delta": -1}, timeout=30)
            r = client.patch(f"{BASE_URL}/api/production/qc-sessions/{sid}/tap",
                             json={"reason_id": reason_id, "delta": -1}, timeout=30)
            assert r.status_code == 200
            assert int(r.json()["counts"].get(reason_id, 0)) == 0

            # Set crates inspected
            r = client.patch(
                f"{BASE_URL}/api/production/qc-sessions/{sid}",
                json={"crates_inspected": 1},
                timeout=30,
            )
            assert r.status_code == 200
            assert r.json()["crates_inspected"] == 1

            # Resume: GET /active returns the same open session
            r = client.get(
                f"{BASE_URL}/api/production/qc-sessions/active",
                params={"batch_id": b["id"], "stage_id": stage["id"]},
                timeout=30,
            )
            assert r.status_code == 200
            active = r.json()
            assert active is not None and active["id"] == sid
            assert active["crates_inspected"] == 1

            # Tap once more so we have a rejection to record
            r = client.patch(
                f"{BASE_URL}/api/production/qc-sessions/{sid}/tap",
                json={"reason_id": reason_id, "delta": 1},
                timeout=30,
            )
            assert r.status_code == 200

            # Capture batch total_rejected before submit
            b_before = client.get(f"{BASE_URL}/api/production/batches/{b['id']}", timeout=30).json()
            before_total = int(b_before.get("total_rejected") or 0)

            # Submit
            r = client.post(f"{BASE_URL}/api/production/qc-sessions/{sid}/submit", timeout=30)
            assert r.status_code == 200, r.text
            payload = r.json()
            assert payload.get("total_rejected") == 1
            batch_after = payload.get("batch") or {}
            assert int(batch_after.get("total_rejected") or 0) == before_total + 1

            # Session must be flagged submitted (via active lookup — should NOT return it now)
            r = client.get(
                f"{BASE_URL}/api/production/qc-sessions/active",
                params={"batch_id": b["id"], "stage_id": stage["id"]},
                timeout=30,
            )
            assert r.status_code == 200
            assert r.json() in (None, {}, [])

            # A follow-up submit call must 400 (already submitted)
            r = client.post(f"{BASE_URL}/api/production/qc-sessions/{sid}/submit", timeout=30)
            assert r.status_code == 400

            # Verify inspection record uses the reason NAME (not id) — inspections stored in tdb.inspections
            hist = client.get(f"{BASE_URL}/api/production/batches/{b['id']}/history", timeout=30).json()
            inspections = hist.get("inspections") or []
            assert inspections, "Expected an inspection record after submit"
            last = inspections[0]  # sorted desc
            entries = last.get("entries") or []
            names = []
            for e in entries:
                for rej in (e.get("rejections") or []):
                    names.append(rej.get("reason"))
            assert reason_name in names, f"Reason name {reason_name} not in inspection rejections {names}"

        finally:
            # Cleanup: if still open (rare path), discard it
            client.delete(f"{BASE_URL}/api/production/qc-sessions/{sid}", timeout=30)

    def test_submit_rejected_without_crates(self, client, active_batch):
        b = active_batch["batch"]
        stage = active_batch["stage"]
        r = client.post(
            f"{BASE_URL}/api/production/qc-sessions",
            json={"batch_id": b["id"], "stage_id": stage["id"], "crates_inspected": 0},
            timeout=30,
        )
        assert r.status_code == 200
        sid = r.json()["id"]
        try:
            r = client.post(f"{BASE_URL}/api/production/qc-sessions/{sid}/submit", timeout=30)
            assert r.status_code == 400
        finally:
            client.delete(f"{BASE_URL}/api/production/qc-sessions/{sid}", timeout=30)

    def test_discard_session(self, client, active_batch):
        b = active_batch["batch"]
        stage = active_batch["stage"]
        r = client.post(
            f"{BASE_URL}/api/production/qc-sessions",
            json={"batch_id": b["id"], "stage_id": stage["id"]},
            timeout=30,
        )
        assert r.status_code == 200
        sid = r.json()["id"]
        r = client.delete(f"{BASE_URL}/api/production/qc-sessions/{sid}", timeout=30)
        assert r.status_code == 200
        # Should be gone
        r = client.delete(f"{BASE_URL}/api/production/qc-sessions/{sid}", timeout=30)
        assert r.status_code == 404
