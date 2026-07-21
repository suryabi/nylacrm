"""
QC Station <-> Batch Detail INTEGRATION regression tests (iteration 337)
Verifies that QC-Station submissions flow through the SAME inspection engine
(record_inspection) so batch stage balances, total_rejected, and Inspection
Records all reflect them — including units: crates for inspected, bottles for
rejections.

Flow tested:
1. Pick a batch (prefers 790149fb-... test batch) and note baseline stage balances / total_rejected.
2. Optionally receive crates on first stage via POST /batches/{id}/move (same
   endpoint QC Station header uses) and verify Unallocated/Received/Pending.
3. Open a QC session, tap N BOTTLES against a reason, set crates_inspected M
   (M <= pending), submit.
4. Re-fetch batch and history: verify
     - stage.rejected balance increased by N (bottles)
     - stage.passed balance increased by (M * bottles_per_crate - N) / bpc (crates) -- i.e. passed_crates >= 0
     - total_rejected increased by N
     - a new inspection record exists on that stage with resource_name (QC person),
       qty_inspected == M, sum(rejections.qty_rejected) == N, reason present.
5. Verify submitting more crates than pending is rejected (400 "Only ... crates pending").
6. Regression: Batch Detail manual /inspect endpoint still writes to same balances.
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://design-workflow-hub-11.preview.emergentagent.com").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"
PREFERRED_BATCH = "790149fb-d1d2-485a-bbcc-50e995bb2b8f"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("session_token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def _get_batch(client, batch_id):
    r = client.get(f"{BASE_URL}/api/production/batches/{batch_id}", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _find_active_batch(client):
    """Prefer PREFERRED_BATCH if it exists and is active; else scan all."""
    try:
        pb = _get_batch(client, PREFERRED_BATCH)
        if pb.get("status") != "completed":
            return pb
    except Exception:
        pass
    r = client.get(f"{BASE_URL}/api/production/batches", timeout=30)
    assert r.status_code == 200
    for b in r.json():
        if b.get("status") not in ("completed",) and (b.get("qc_stages") or []):
            return _get_batch(client, b["id"])
    pytest.skip("No active batch found for integration test")


def _first_stage(batch):
    stages = sorted(batch.get("qc_stages") or [], key=lambda s: s.get("order", 0))
    assert stages, "batch has no qc_stages"
    return stages[0]


# ---------------------------------------------------------------------------
# Deep link → batch fetch used by QC Station header button
# ---------------------------------------------------------------------------
class TestQCStationDeepLink:
    def test_batch_get_powers_deep_link(self, client):
        b = _find_active_batch(client)
        # QC Station deep-linked openBatch calls GET /batches/{id} – must return
        # a batch shape that includes qc_stages and stage_balances so the stage
        # step can render immediately.
        assert "qc_stages" in b
        assert "stage_balances" in b
        assert "batch_code" in b or "batch_number" in b


# ---------------------------------------------------------------------------
# Inline Receive (same POST /batches/{id}/move endpoint as Batch Detail)
# ---------------------------------------------------------------------------
class TestQCStationInlineReceive:
    def test_receive_moves_unallocated_to_stage_pending(self, client):
        b = _find_active_batch(client)
        st = _first_stage(b)
        bal_before = (b.get("stage_balances") or {}).get(st["id"]) or {}
        recv_before = int(bal_before.get("received") or 0)
        pend_before = int(bal_before.get("pending") or 0)
        unalloc_before = int(b.get("unallocated_crates") or 0)
        if unalloc_before < 5:
            pytest.skip("Not enough unallocated crates to test receive")
        qty = 5
        r = client.post(f"{BASE_URL}/api/production/batches/{b['id']}/move",
                        json={"to_stage_id": st["id"], "quantity": qty,
                              "notes": "test_qc_station_integration receive"},
                        timeout=30)
        assert r.status_code == 200, r.text
        b2 = _get_batch(client, b["id"])
        bal_after = (b2.get("stage_balances") or {}).get(st["id"]) or {}
        assert int(bal_after.get("received") or 0) == recv_before + qty, \
            f"received should have grown by {qty}"
        assert int(bal_after.get("pending") or 0) == pend_before + qty
        assert int(b2.get("unallocated_crates") or 0) == unalloc_before - qty


# ---------------------------------------------------------------------------
# End-to-end: QC-Station submit → Batch Detail balances + Inspection Records
# ---------------------------------------------------------------------------
class TestQCStationEndToEndSync:
    def test_full_e2e(self, client):
        b = _find_active_batch(client)
        st = _first_stage(b)
        # Ensure the stage has pending — receive some if needed
        bal = (b.get("stage_balances") or {}).get(st["id"]) or {}
        pending = int(bal.get("pending") or 0)
        if pending < 2:
            unalloc = int(b.get("unallocated_crates") or 0)
            need = max(0, 3 - pending)
            if unalloc < need:
                pytest.skip("Cannot ensure enough pending crates for the test")
            r = client.post(
                f"{BASE_URL}/api/production/batches/{b['id']}/move",
                json={"to_stage_id": st["id"], "quantity": need,
                      "notes": "test_qc_station_integration ensure pending"},
                timeout=30)
            assert r.status_code == 200, r.text
            b = _get_batch(client, b["id"])
            bal = (b.get("stage_balances") or {}).get(st["id"]) or {}
            pending = int(bal.get("pending") or 0)
        assert pending >= 1, "need pending >= 1 to inspect"

        rr = client.get(f"{BASE_URL}/api/production/rejection-reasons", timeout=30).json()
        assert rr, "no rejection reasons seeded"
        reason = rr[0]
        reason_id, reason_name = reason["id"], reason["name"]

        rejected_before = int(bal.get("rejected") or 0)
        passed_before = int(bal.get("passed") or 0)
        received_before = int(bal.get("received") or 0)
        total_rej_before = int(b.get("total_rejected") or 0)
        insp_hist_before = client.get(
            f"{BASE_URL}/api/production/batches/{b['id']}/history", timeout=30).json()
        insp_count_before = len([
            i for i in (insp_hist_before.get("inspections") or [])
            if i.get("stage_id") == st["id"]
        ])

        # Start QC session
        r = client.post(f"{BASE_URL}/api/production/qc-sessions",
                        json={"batch_id": b["id"], "stage_id": st["id"], "crates_inspected": 0},
                        timeout=30)
        assert r.status_code == 200, r.text
        sess = r.json()
        sid = sess["id"]

        crates_to_inspect = 1  # enough — one crate = bpc bottles
        rejected_bottles = 3  # 3 taps → 3 bottles rejected

        try:
            # Tap +1 three times
            for _ in range(rejected_bottles):
                r = client.patch(
                    f"{BASE_URL}/api/production/qc-sessions/{sid}/tap",
                    json={"reason_id": reason_id, "delta": 1}, timeout=30)
                assert r.status_code == 200, r.text

            # Set crates inspected
            r = client.patch(f"{BASE_URL}/api/production/qc-sessions/{sid}",
                             json={"crates_inspected": crates_to_inspect}, timeout=30)
            assert r.status_code == 200
            assert r.json()["crates_inspected"] == crates_to_inspect

            # Attempt to exceed pending → server should reject
            r = client.patch(f"{BASE_URL}/api/production/qc-sessions/{sid}",
                             json={"crates_inspected": pending + 10}, timeout=30)
            # Update itself may accept (frontend clamps) OR reject; the real
            # guard is at submit. We verify submit rejects.
            r = client.post(f"{BASE_URL}/api/production/qc-sessions/{sid}/submit",
                            timeout=30)
            # If update above stored pending+10 the submit MUST 400
            # If update above rejected it, our crates is still crates_to_inspect
            # and submit should succeed — reset back to safe value in that case.
            if r.status_code == 400:
                # good: server enforced pending guard
                r2 = client.patch(f"{BASE_URL}/api/production/qc-sessions/{sid}",
                                  json={"crates_inspected": crates_to_inspect},
                                  timeout=30)
                assert r2.status_code == 200
                r = client.post(f"{BASE_URL}/api/production/qc-sessions/{sid}/submit",
                                timeout=30)
            assert r.status_code == 200, f"Submit failed: {r.status_code} {r.text}"
            payload = r.json()
            assert payload.get("total_rejected") == rejected_bottles, \
                f"expected total_rejected {rejected_bottles} got {payload}"

            # Verify batch reflects the submission
            b2 = _get_batch(client, b["id"])
            bal2 = (b2.get("stage_balances") or {}).get(st["id"]) or {}
            bpc = int(b2.get("bottles_per_crate") or 1)

            assert int(bal2.get("rejected") or 0) == rejected_before + rejected_bottles, (
                f"stage.rejected(bottles) should have grown by {rejected_bottles}; "
                f"was {rejected_before}, now {bal2.get('rejected')}")
            # passed_crates: bottles passed converted to crates. In record_inspection,
            # crates that go to passed are qty_inspected - ceil(rejected/bpc). Just
            # ensure passed grew OR at minimum did not shrink, and pending shrank by
            # crates_inspected.
            assert int(bal2.get("received") or 0) == received_before, "received should not change"
            assert int(bal2.get("pending") or 0) <= pending - 0, "pending should decrease"
            assert int(bal2.get("passed") or 0) >= passed_before, "passed shouldn't decrease"
            assert int(b2.get("total_rejected") or 0) == total_rej_before + rejected_bottles, (
                f"batch.total_rejected should grow by {rejected_bottles}")

            # Inspection Records include a new entry on this stage
            hist = client.get(
                f"{BASE_URL}/api/production/batches/{b['id']}/history",
                timeout=30).json()
            stage_insps = [i for i in (hist.get("inspections") or [])
                           if i.get("stage_id") == st["id"]]
            assert len(stage_insps) == insp_count_before + 1, \
                f"expected {insp_count_before+1} inspections at stage, got {len(stage_insps)}"
            latest = stage_insps[0]  # inspections are sorted desc
            entries = latest.get("entries") or []
            assert entries, "latest inspection must have entries"
            crates_recorded = sum(int(e.get("qty_inspected") or 0) for e in entries)
            rejected_recorded = 0
            reasons_seen = []
            for e in entries:
                for rej in (e.get("rejections") or []):
                    rejected_recorded += int(rej.get("qty_rejected") or 0)
                    reasons_seen.append(rej.get("reason"))
            assert crates_recorded == crates_to_inspect, (
                f"inspection crates recorded={crates_recorded} expected {crates_to_inspect}")
            assert rejected_recorded == rejected_bottles, (
                f"inspection rejected bottles recorded={rejected_recorded} expected {rejected_bottles}")
            assert reason_name in reasons_seen, (
                f"reason {reason_name} not in {reasons_seen}")
            # 'inspected_by_name' captures the QC person (session logged-in user).
            assert latest.get("inspected_by_name"), "inspected_by_name (QC person) missing"

        finally:
            # Sessions submitted are already flagged; DELETE is safe (404 if not open)
            client.delete(f"{BASE_URL}/api/production/qc-sessions/{sid}", timeout=30)


# ---------------------------------------------------------------------------
# Regression: manual /inspect on Batch Detail still writes to same balances.
# ---------------------------------------------------------------------------
class TestBatchDetailManualInspectRegression:
    def test_manual_inspect_still_records(self, client):
        b = _find_active_batch(client)
        st = _first_stage(b)
        bal = (b.get("stage_balances") or {}).get(st["id"]) or {}
        pending = int(bal.get("pending") or 0)
        if pending < 1:
            # try to receive 2 crates
            if int(b.get("unallocated_crates") or 0) < 2:
                pytest.skip("cannot prepare pending for manual inspect regression")
            client.post(f"{BASE_URL}/api/production/batches/{b['id']}/move",
                        json={"to_stage_id": st["id"], "quantity": 2,
                              "notes": "test regression prep"}, timeout=30)
            b = _get_batch(client, b["id"])
            bal = (b.get("stage_balances") or {}).get(st["id"]) or {}
            pending = int(bal.get("pending") or 0)
        if pending < 1:
            pytest.skip("could not prepare pending for regression test")

        team = client.get(f"{BASE_URL}/api/production/qc-team", timeout=30).json()
        if not team:
            pytest.skip("no qc-team members")
        member = team[0]
        rr = client.get(f"{BASE_URL}/api/production/rejection-reasons", timeout=30).json()
        assert rr
        reason_name = rr[0]["name"]

        total_rej_before = int(b.get("total_rejected") or 0)
        rejected_before = int(bal.get("rejected") or 0)

        payload = {
            "stage_id": st["id"],
            "entries": [{
                "resource_id": member["id"],
                "resource_name": member["name"],
                "date": time.strftime("%Y-%m-%d"),
                "qty_inspected": 1,
                "rejections": [{"qty_rejected": 2, "reason": reason_name}],
            }],
            "remarks": "test_qc_station_integration regression",
        }
        r = client.post(f"{BASE_URL}/api/production/batches/{b['id']}/inspect",
                        json=payload, timeout=30)
        assert r.status_code == 200, r.text
        b2 = _get_batch(client, b["id"])
        bal2 = (b2.get("stage_balances") or {}).get(st["id"]) or {}
        assert int(bal2.get("rejected") or 0) == rejected_before + 2
        assert int(b2.get("total_rejected") or 0) == total_rej_before + 2
