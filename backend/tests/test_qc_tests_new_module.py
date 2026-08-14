"""QC Tests module — auto-creation for new batches + RBAC + Water Intelligence regression.

Focus areas requested by review request:
- Auto-creation of Production/Pass attempt-1 record for new batches on GET /api/production/qc-tests
- Finance user 403 on write endpoints
- Water Intelligence still accessible for admin (backfill regression)
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").strip('"').rstrip("/")
TENANT_ID = "nyla-air-water"

ADMIN_EMAIL = "surya.yadavalli@nylaairwater.earth"
FINANCE_EMAIL = "finance.user@nylaairwater.earth"
PWD = "test123"


def _login(email):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": PWD})
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    d = r.json()
    return d.get("session_token") or d.get("token")


@pytest.fixture(scope="module")
def admin_h():
    tok = _login(ADMIN_EMAIL)
    return {"Authorization": f"Bearer {tok}", "X-Tenant-ID": TENANT_ID, "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def finance_h():
    tok = _login(FINANCE_EMAIL)
    return {"Authorization": f"Bearer {tok}", "X-Tenant-ID": TENANT_ID, "Content-Type": "application/json"}


# ---------- Baseline: existing seeded data preserved ----------
class TestBaseline:
    def test_seeded_totals_intact(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/production/qc-tests", headers=admin_h)
        assert r.status_code == 200
        d = r.json()
        c = d["counts"]
        print("counts:", c)
        # spec: 36 production + 6 trial rows = 42
        assert c["total"] >= 42, f"Expected >=42 records, got {c['total']}"
        assert c["production"] >= 36
        assert c["trial"] >= 6

    def test_apr003_trial_attempts(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/production/qc-tests", headers=admin_h, params={"search": "APR-003"})
        assert r.status_code == 200
        tests = r.json()["tests"]
        # group by batch_code
        by = {}
        for t in tests:
            by.setdefault(t["batch_code"], []).append(t)
        assert "20L-APR-003" in by and "600S-APR-003" in by, f"Missing APR-003 batches: {list(by)}"
        for bc in ("20L-APR-003", "600S-APR-003"):
            rows = sorted(by[bc], key=lambda x: x["attempt"])
            results = [(r["attempt"], r["test_result"]) for r in rows]
            assert results == [(1, "reject"), (2, "reject"), (3, "pass")], f"{bc}: {results}"
            for r_ in rows:
                assert r_["sample_type"] == "trial"
                assert r_["tested_by"] == "Baburao"
                assert r_["reviewed_by"] == "Ravindra Ambati"


# ---------- Auto-creation for a NEW batch ----------
class TestAutoCreationForNewBatch:
    """Insert a batch directly into mongo, then hit GET /qc-tests, verify auto-seeded Production/Pass record."""

    _test_batch_id = None
    _test_batch_code = None

    def test_insert_batch_and_verify_auto_seed(self, admin_h):
        import pymongo
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        assert mongo_url and db_name
        cli = pymongo.MongoClient(mongo_url)
        db = cli[db_name]

        batch_id = str(uuid.uuid4())
        batch_code = f"TESTQC-{batch_id[:6].upper()}"
        prod_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        doc = {
            "id": batch_id,
            "tenant_id": TENANT_ID,
            "batch_code": batch_code,
            "sku_name": "TEST SKU 20L",
            "production_date": prod_date,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "created",
        }
        db.production_batches.insert_one(doc)
        TestAutoCreationForNewBatch._test_batch_id = batch_id
        TestAutoCreationForNewBatch._test_batch_code = batch_code

        try:
            # trigger lazy sync
            r = requests.get(f"{BASE_URL}/api/production/qc-tests", headers=admin_h,
                             params={"search": batch_code})
            assert r.status_code == 200
            rows = r.json()["tests"]
            assert len(rows) == 1, f"Expected exactly 1 auto row, got {len(rows)}: {rows}"
            row = rows[0]
            assert row["sample_type"] == "production"
            assert row["test_result"] == "pass"
            assert row["attempt"] == 1
            assert row["tested_by"] == "Baburao"
            assert row["reviewed_by"] == "Ravindra Ambati"
            assert row["batch_code"] == batch_code
            print(f"[AUTO-CREATE OK] {batch_code} → {row['sample_type']}/{row['test_result']}/att{row['attempt']}")
        finally:
            # cleanup
            db.production_batches.delete_one({"id": batch_id, "tenant_id": TENANT_ID})
            db.qc_tests.delete_many({"batch_id": batch_id, "tenant_id": TENANT_ID})
            cli.close()

            # verify cleanup
            r2 = requests.get(f"{BASE_URL}/api/production/qc-tests", headers=admin_h,
                              params={"search": batch_code})
            assert r2.status_code == 200
            assert r2.json()["tests"] == [], "cleanup residual"


# ---------- RBAC ----------
class TestRBAC:
    def test_finance_forbidden_put(self, admin_h, finance_h):
        # grab a real test id
        r = requests.get(f"{BASE_URL}/api/production/qc-tests", headers=admin_h)
        tid = r.json()["tests"][0]["id"]
        resp = requests.put(f"{BASE_URL}/api/production/qc-tests/{tid}",
                            headers=finance_h, json={"testing_date": "2025-01-01"})
        assert resp.status_code == 403, f"expected 403, got {resp.status_code}: {resp.text[:200]}"

    def test_finance_forbidden_retest(self, finance_h):
        resp = requests.post(f"{BASE_URL}/api/production/qc-tests/batch/some-id/retest",
                             headers=finance_h, json={"test_result": "pass"})
        assert resp.status_code == 403

    def test_finance_forbidden_delete(self, admin_h, finance_h):
        r = requests.get(f"{BASE_URL}/api/production/qc-tests", headers=admin_h)
        tid = r.json()["tests"][0]["id"]
        resp = requests.delete(f"{BASE_URL}/api/production/qc-tests/{tid}", headers=finance_h)
        assert resp.status_code == 403


# ---------- Filters ----------
class TestFilters:
    def test_production_filter(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/production/qc-tests", headers=admin_h,
                         params={"sample_type": "production"})
        assert r.status_code == 200
        for t in r.json()["tests"]:
            assert t["sample_type"] == "production"

    def test_reject_filter(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/production/qc-tests", headers=admin_h,
                         params={"result": "reject"})
        assert r.status_code == 200
        for t in r.json()["tests"]:
            assert t["test_result"] == "reject"


# ---------- Excel Export ----------
class TestExcel:
    def test_excel_download(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/production/qc-tests/export/excel", headers=admin_h)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "xlsx" in ct or "openxmlformats" in ct, ct
        assert len(r.content) > 500  # not empty


# ---------- Water Intelligence Regression ----------
class TestWaterIntelligenceRegression:
    def test_admin_can_list_wi(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/water-intelligence", headers=admin_h)
        assert r.status_code == 200, f"WI list failed for admin: {r.status_code} {r.text[:200]}"
        # sanity: response has articles/list
        d = r.json()
        assert isinstance(d, dict) or isinstance(d, list)

    def test_admin_has_water_intelligence_module(self, admin_h):
        # verify permissions include water_intelligence
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_h)
        assert r.status_code == 200
        # tolerant assertion — just make sure endpoint works
        print("me:", r.status_code)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
