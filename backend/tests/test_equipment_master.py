"""Backend tests for Equipment Master & Maintenance module + light regression on Glass Breakage."""
import os
import uuid
from datetime import datetime, timedelta
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://design-workflow-hub-11.preview.emergentagent.com").rstrip("/")
TENANT = "nyla-air-water"
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

HEADERS_BASE = {"Content-Type": "application/json", "X-Tenant-ID": TENANT}


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update(HEADERS_BASE)
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("session_token") or r.json().get("access_token")
    assert tok, f"No token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session")
def vendor_id(session):
    r = session.get(f"{BASE_URL}/api/inventory/vendors")
    assert r.status_code == 200, r.text
    data = r.json()
    vendors = data.get("vendors") or data.get("items") or (data if isinstance(data, list) else [])
    if vendors:
        return vendors[0]["id"]
    # Create one
    payload = {"vendor_name": f"TEST_Vendor_{uuid.uuid4().hex[:6]}", "contact_person": "Tester",
               "phone": "9999999999", "email": "test@vendor.com"}
    rc = session.post(f"{BASE_URL}/api/inventory/vendors", json=payload)
    assert rc.status_code in (200, 201), rc.text
    return rc.json()["id"]


# tracker for cleanup
_created = {"types": [], "equipment": []}


@pytest.fixture(scope="session", autouse=True)
def cleanup(session):
    yield
    for eid in _created["equipment"]:
        try:
            session.delete(f"{BASE_URL}/api/production/equipment/{eid}")
        except Exception:
            pass
    for tid in _created["types"]:
        try:
            session.delete(f"{BASE_URL}/api/production/equipment/types/{tid}")
        except Exception:
            pass


# ── Equipment Types ─────────────────────────
class TestTypes:
    def test_seed_defaults_idempotent(self, session):
        r1 = session.post(f"{BASE_URL}/api/production/equipment/types/seed-defaults")
        assert r1.status_code == 200, r1.text
        # 2nd call should create 0
        r2 = session.post(f"{BASE_URL}/api/production/equipment/types/seed-defaults")
        assert r2.status_code == 200
        assert r2.json()["created"] == 0
        # Verify 9 defaults present
        rl = session.get(f"{BASE_URL}/api/production/equipment/types")
        names = {t["name"] for t in rl.json()["types"]}
        for expected in ["Filters", "Pumps", "Air Water Generators", "RO/Membrane Systems",
                         "UV Systems", "Ozone Systems", "Filling Machines", "Compressors", "Chillers"]:
            assert expected in names, f"Missing default type: {expected}"

    def test_create_type_and_duplicate(self, session):
        name = f"TEST_Type_{uuid.uuid4().hex[:6]}"
        r = session.post(f"{BASE_URL}/api/production/equipment/types", json={"name": name, "description": "desc"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == name
        assert "id" in d
        _created["types"].append(d["id"])
        # duplicate (case-insensitive)
        r2 = session.post(f"{BASE_URL}/api/production/equipment/types", json={"name": name.lower()})
        assert r2.status_code == 409, f"Expected 409, got {r2.status_code}: {r2.text}"

    def test_update_type_denormalizes_to_equipment(self, session):
        # Create type
        n1 = f"TEST_Rename_{uuid.uuid4().hex[:6]}"
        rt = session.post(f"{BASE_URL}/api/production/equipment/types", json={"name": n1})
        tid = rt.json()["id"]
        _created["types"].append(tid)
        # Create equipment under it
        re = session.post(f"{BASE_URL}/api/production/equipment", json={"name": f"TEST_EQ_{uuid.uuid4().hex[:6]}", "equipment_type_id": tid})
        assert re.status_code == 200, re.text
        eid = re.json()["id"]
        _created["equipment"].append(eid)
        assert re.json()["equipment_type_name"] == n1
        # Rename type
        n2 = n1 + "_v2"
        ru = session.put(f"{BASE_URL}/api/production/equipment/types/{tid}", json={"name": n2})
        assert ru.status_code == 200
        assert ru.json()["name"] == n2
        # Verify equipment_type_name updated
        rg = session.get(f"{BASE_URL}/api/production/equipment", params={"equipment_type_id": tid})
        items = [e for e in rg.json()["equipment"] if e["id"] == eid]
        assert items and items[0]["equipment_type_name"] == n2

    def test_delete_type_blocked_when_equipment_exists(self, session):
        n = f"TEST_DelBlocked_{uuid.uuid4().hex[:6]}"
        tid = session.post(f"{BASE_URL}/api/production/equipment/types", json={"name": n}).json()["id"]
        _created["types"].append(tid)
        eid = session.post(f"{BASE_URL}/api/production/equipment", json={"name": f"TEST_child_{uuid.uuid4().hex[:6]}", "equipment_type_id": tid}).json()["id"]
        _created["equipment"].append(eid)
        rd = session.delete(f"{BASE_URL}/api/production/equipment/types/{tid}")
        assert rd.status_code == 409, f"Expected 409, got {rd.status_code}: {rd.text}"

    def test_delete_empty_type_succeeds(self, session):
        n = f"TEST_DelEmpty_{uuid.uuid4().hex[:6]}"
        tid = session.post(f"{BASE_URL}/api/production/equipment/types", json={"name": n}).json()["id"]
        rd = session.delete(f"{BASE_URL}/api/production/equipment/types/{tid}")
        assert rd.status_code == 200, rd.text
        assert rd.json()["deleted"] is True


# ── Equipment CRUD ─────────────────────────
class TestEquipment:
    @pytest.fixture(scope="class")
    def type_id(self, session):
        n = f"TEST_ETypeCRUD_{uuid.uuid4().hex[:6]}"
        tid = session.post(f"{BASE_URL}/api/production/equipment/types", json={"name": n}).json()["id"]
        _created["types"].append(tid)
        return tid

    def test_create_auto_computes_next_due(self, session, type_id):
        today = datetime.utcnow().strftime("%Y-%m-%d")
        payload = {
            "name": f"TEST_5MicronFilter_{uuid.uuid4().hex[:6]}",
            "equipment_type_id": type_id,
            "make_brand": "Acme",
            "model_spec": "F-500",
            "maintenance_frequency_days": 30,
            "replacement_frequency_days": 180,
            "last_maintenance_date": today,
            "last_replacement_date": today,
        }
        r = session.post(f"{BASE_URL}/api/production/equipment", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        _created["equipment"].append(d["id"])
        expected_maint = (datetime.fromisoformat(today) + timedelta(days=30)).strftime("%Y-%m-%d")
        expected_repl = (datetime.fromisoformat(today) + timedelta(days=180)).strftime("%Y-%m-%d")
        assert d["next_maintenance_due"] == expected_maint
        assert d["next_replacement_due"] == expected_repl
        assert d["equipment_type_name"]
        assert d["maintenance_log"] == []

    def test_create_invalid_type(self, session):
        r = session.post(f"{BASE_URL}/api/production/equipment", json={"name": "TEST_bad", "equipment_type_id": "nonexistent-id-xyz"})
        assert r.status_code == 400

    def test_list_filter_and_search(self, session, type_id):
        unique = uuid.uuid4().hex[:6]
        name = f"TEST_Searchable_{unique}"
        eid = session.post(f"{BASE_URL}/api/production/equipment", json={"name": name, "equipment_type_id": type_id, "make_brand": "SearchBrand"}).json()["id"]
        _created["equipment"].append(eid)
        # search
        r = session.get(f"{BASE_URL}/api/production/equipment", params={"search": unique})
        items = r.json()["equipment"]
        assert any(e["id"] == eid for e in items)
        # filter
        r2 = session.get(f"{BASE_URL}/api/production/equipment", params={"equipment_type_id": type_id})
        assert all(e["equipment_type_id"] == type_id for e in r2.json()["equipment"])

    def test_update_equipment(self, session, type_id):
        eid = session.post(f"{BASE_URL}/api/production/equipment", json={"name": f"TEST_Upd_{uuid.uuid4().hex[:6]}", "equipment_type_id": type_id}).json()["id"]
        _created["equipment"].append(eid)
        r = session.put(f"{BASE_URL}/api/production/equipment/{eid}", json={
            "name": "TEST_Upd_v2", "equipment_type_id": type_id, "make_brand": "NewBrand",
            "maintenance_frequency_days": 15, "last_maintenance_date": "2026-01-01",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["make_brand"] == "NewBrand"
        assert d["next_maintenance_due"] == "2026-01-16"


# ── Vendor associations ─────────────────
class TestVendorAssoc:
    def test_create_with_vendor_hydrates_name(self, session, vendor_id):
        n = f"TEST_ETypeVend_{uuid.uuid4().hex[:6]}"
        tid = session.post(f"{BASE_URL}/api/production/equipment/types", json={"name": n}).json()["id"]
        _created["types"].append(tid)
        payload = {
            "name": f"TEST_EqVend_{uuid.uuid4().hex[:6]}",
            "equipment_type_id": tid,
            "vendors": [{
                "vendor_id": vendor_id,
                "preferred": True,
                "lead_time_days": 7,
                "last_purchase_price": 1250.50,
                "vendor_part_code": "PART-001",
                "contact_details": "9000000000",
                "amc_details": "AMC until 2027",
            }],
        }
        r = session.post(f"{BASE_URL}/api/production/equipment", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        _created["equipment"].append(d["id"])
        assert len(d["vendors"]) == 1
        v = d["vendors"][0]
        assert v["vendor_id"] == vendor_id
        assert v["vendor_name"] and v["vendor_name"] != vendor_id  # hydrated
        assert v["preferred"] is True
        assert v["lead_time_days"] == 7
        assert v["last_purchase_price"] == 1250.50
        assert v["vendor_part_code"] == "PART-001"
        assert v["contact_details"] == "9000000000"
        assert v["amc_details"] == "AMC until 2027"


# ── Log maintenance/replacement ─────────
class TestLogging:
    def test_log_maintenance_recomputes_next_due(self, session):
        n = f"TEST_LogType_{uuid.uuid4().hex[:6]}"
        tid = session.post(f"{BASE_URL}/api/production/equipment/types", json={"name": n}).json()["id"]
        _created["types"].append(tid)
        eid = session.post(f"{BASE_URL}/api/production/equipment", json={
            "name": f"TEST_LogEq_{uuid.uuid4().hex[:6]}", "equipment_type_id": tid,
            "maintenance_frequency_days": 30, "replacement_frequency_days": 90,
        }).json()["id"]
        _created["equipment"].append(eid)
        log_date = "2026-01-10"
        r = session.post(f"{BASE_URL}/api/production/equipment/{eid}/log-maintenance", json={"date": log_date, "remarks": "Filter changed"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["last_maintenance_date"] == log_date
        assert d["next_maintenance_due"] == "2026-02-09"
        assert len(d["maintenance_log"]) == 1
        assert d["maintenance_log"][0]["date"] == log_date
        assert d["maintenance_log"][0]["by"]
        # replacement
        r2 = session.post(f"{BASE_URL}/api/production/equipment/{eid}/log-replacement", json={"date": log_date})
        d2 = r2.json()
        assert d2["last_replacement_date"] == log_date
        assert d2["next_replacement_due"] == "2026-04-10"
        assert len(d2["replacement_log"]) == 1


# ── Glass Breakage regression ───────────
class TestGlassBreakageRegression:
    def test_list_endpoint(self, session):
        r = session.get(f"{BASE_URL}/api/production/glass-breakage")
        assert r.status_code == 200, r.text
        # response may be a list, {items: []}, or {breakages: []}
        d = r.json()
        assert isinstance(d, (list, dict))
