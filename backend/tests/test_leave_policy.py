"""Leave Policy API tests: seeding, RBAC, edit versioning, share, banner."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
TENANT = "nyla-air-water"
CEO_EMAIL = "admin@nylaairwater.earth"
NONADMIN_EMAIL = "creative.director@nylaairwater.earth"
PASSWORD = "test123"


def _login(email):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "X-Tenant-ID": TENANT})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def ceo():
    return _login(CEO_EMAIL)


@pytest.fixture(scope="module")
def nonadmin():
    return _login(NONADMIN_EMAIL)


class TestLeavePolicy:
    def test_get_policy_ceo_can_edit(self, ceo):
        r = ceo.get(f"{BASE_URL}/api/leave-policy")
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["can_edit"] is True
        assert j["title"] == "Company Leave & Holiday Policy – 2026"
        assert j["year"] == 2026
        assert set(j["locations"]) == {"Hyderabad", "Delhi", "Mumbai", "Goa", "Bengaluru"}
        assert len(j["structure"]) == 6
        assert j["structure"][0]["entitlement"].startswith("1.5 days per month")
        assert len(j["holidays"]) == 28
        # Sankranti/Pongal on 01-15
        h0115 = next(h for h in j["holidays"] if h["date"] == "2026-01-15")
        assert h0115["entries"]["Hyderabad"] == {"name": "Sankranti / Pongal", "type": "F"}
        assert h0115["entries"]["Bengaluru"] == {"name": "Makara Sankranti", "type": "V"}
        assert "Delhi" not in h0115["entries"]
        # Fixed by location: 10 for each of 5 cities
        fixed = j["fixed_by_location"]
        for loc in ["Hyderabad", "Delhi", "Mumbai", "Goa", "Bengaluru"]:
            assert len(fixed.get(loc, [])) == 10, f"{loc} fixed count = {len(fixed.get(loc, []))}"
        # Variable pool: Delhi contains those items
        delhi_pool_names = [x["name"] for x in j["variable_pool"]["Delhi"]]
        for n in ["Ambedkar Jayanti", "May Day", "Raksha Bandhan", "Maha Navami", "Guru Nanak Jayanti"]:
            assert n in delhi_pool_names, f"missing {n} in Delhi pool: {delhi_pool_names}"
        assert {s["title"] for s in j["sections"]} >= {"Variable Holiday Policy", "Annual Paid Leave Summary", "Compliance Note"}

    def test_get_policy_nonadmin_cannot_edit(self, nonadmin):
        r = nonadmin.get(f"{BASE_URL}/api/leave-policy")
        assert r.status_code == 200
        assert r.json()["can_edit"] is False

    def test_put_forbidden_for_nonadmin(self, nonadmin):
        payload = {"year": 2026, "title": "X", "locations": ["Hyderabad"], "structure": [], "holidays": [], "sections": []}
        r = nonadmin.put(f"{BASE_URL}/api/leave-policy", json=payload)
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text}"

    def test_edit_and_revert(self, ceo):
        # get current
        r = ceo.get(f"{BASE_URL}/api/leave-policy")
        cur = r.json()
        v0 = cur["version"]

        modified = {
            "year": cur["year"], "title": cur["title"], "locations": cur["locations"],
            "structure": [dict(s) for s in cur["structure"]],
            "structure_note": cur.get("structure_note") or "",
            "holidays": [{"id": h["id"], "date": h["date"], "day": h["day"], "entries": h.get("entries", {}), "note": h.get("note")} for h in cur["holidays"]],
            "variable_pool_extra": cur.get("variable_pool_extra") or {},
            "sections": cur["sections"],
        }
        original_entitlement = modified["structure"][0]["entitlement"]
        modified["structure"][0]["entitlement"] = "1.5 days per month = 18 days per year (test)"
        modified["holidays"].append({"date": "2026-12-31", "entries": {"Hyderabad": {"name": "ZZ Test Day", "type": "V"}}})

        r = ceo.put(f"{BASE_URL}/api/leave-policy", json=modified)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["version"] == v0 + 1
        assert j["structure"][0]["entitlement"].endswith("(test)")
        assert any(h["date"] == "2026-12-31" and h["entries"].get("Hyderabad", {}).get("name") == "ZZ Test Day" for h in j["holidays"])
        assert "ZZ Test Day" in [x["name"] for x in j["variable_pool"]["Hyderabad"]]

        # Revert
        modified["structure"][0]["entitlement"] = original_entitlement
        modified["holidays"] = [h for h in modified["holidays"] if h.get("date") != "2026-12-31"]
        r = ceo.put(f"{BASE_URL}/api/leave-policy", json=modified)
        assert r.status_code == 200
        j2 = r.json()
        assert not any(h["date"] == "2026-12-31" for h in j2["holidays"])
        assert j2["structure"][0]["entitlement"] == original_entitlement

    def test_share_requires_recipient(self, ceo):
        r = ceo.post(f"{BASE_URL}/api/leave-policy/share", json={"emails": [], "all_team": False})
        assert r.status_code == 400

    def test_share_single_recipient(self, ceo):
        r = ceo.post(f"{BASE_URL}/api/leave-policy/share", json={"emails": ["qa-test@example.com"], "all_team": False, "message": "QA test"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["recipients"] == 1

    def test_banner_today_iso(self, ceo):
        r = ceo.get(f"{BASE_URL}/api/leave-policy/banner")
        assert r.status_code == 200
        j = r.json()
        assert len(j["days"]) == 2
        from datetime import datetime
        from zoneinfo import ZoneInfo
        today = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
        assert j["days"][0]["date"] == today
        assert j["days"][0]["label"] == "today"


def teardown_module(module):
    """Cleanup any leftover test data."""
    try:
        s = _login(CEO_EMAIL)
        # ensure the ZZ Test Day is not present
        r = s.get(f"{BASE_URL}/api/leave-policy")
        if r.status_code == 200:
            cur = r.json()
            if any(h["date"] == "2026-12-31" and h.get("entries", {}).get("Hyderabad", {}).get("name") == "ZZ Test Day" for h in cur["holidays"]):
                modified = {
                    "year": cur["year"], "title": cur["title"], "locations": cur["locations"],
                    "structure": [dict(x) for x in cur["structure"]],
                    "structure_note": cur.get("structure_note") or "",
                    "holidays": [h for h in cur["holidays"] if not (h["date"] == "2026-12-31" and h.get("entries", {}).get("Hyderabad", {}).get("name") == "ZZ Test Day")],
                    "variable_pool_extra": cur.get("variable_pool_extra") or {},
                    "sections": cur["sections"],
                }
                s.put(f"{BASE_URL}/api/leave-policy", json=modified)
    except Exception:
        pass
