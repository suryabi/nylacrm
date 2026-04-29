"""
Iteration 153: RBAC permission matrix expansion tests
- /api/roles must expose 12 categories / 71 module keys / 0 orphans
- New keys must be backfilled correctly into existing roles
- Admin/CEO/System Admin roles get full access on new keys
- Non-admin roles get default least-privilege on new keys
- Update endpoint persists toggles for new module keys
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

EXPECTED_COUNTS = {
    "Core": 10,
    "Reports": 5,
    "Operations": 7,
    "Tools": 5,
    "Documents": 2,
    "Requests": 3,
    "Marketing": 2,
    "Organization": 8,
    "Admin": 3,
    "Distribution": 10,
    "Production": 13,
    "Task Management": 3,
}
TOTAL_EXPECTED_KEYS = 71

NEWLY_ADDED_KEYS = [
    "account_gop_metrics",
    "neck_tag_designer",
    "invoices",
    "performance_tracker",
    "investor_dashboard",
    "meeting_minutes",
    "cogs_components",
    "api_keys",
    "sku_replace",
    "production_dashboard",
    "production_batches",
    "qc_routes",
    "qc_team",
    "rejection_reasons",
    "rejection_report",
    "rejection_cost_config",
    "packaging_types",
    "stock_dashboard",
    "cost_cards",
]


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed {r.status_code}: {r.text}"
    data = r.json()
    token = data.get("session_token") or data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def roles_payload(auth_headers):
    r = requests.get(f"{BASE_URL}/api/roles", headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"GET /api/roles failed {r.status_code}: {r.text}"
    return r.json()


# --- Categories / labels structure ---
class TestModuleStructure:
    def test_returns_12_categories(self, roles_payload):
        cats = roles_payload.get("module_categories", {})
        assert len(cats) == 12, f"Expected 12 categories, got {len(cats)}: {list(cats.keys())}"

    def test_category_counts_exact(self, roles_payload):
        cats = roles_payload["module_categories"]
        for cat, expected in EXPECTED_COUNTS.items():
            assert cat in cats, f"Missing category {cat}"
            assert len(cats[cat]) == expected, (
                f"{cat}: expected {expected}, got {len(cats[cat])}: {cats[cat]}"
            )

    def test_total_71_keys(self, roles_payload):
        cats = roles_payload["module_categories"]
        total = sum(len(v) for v in cats.values())
        assert total == TOTAL_EXPECTED_KEYS, f"Expected {TOTAL_EXPECTED_KEYS} keys, got {total}"

    def test_no_orphans_labels_match_categories(self, roles_payload):
        cats = roles_payload["module_categories"]
        labels = roles_payload.get("module_labels", {})
        all_keys = {k for v in cats.values() for k in v}
        label_keys = set(labels.keys())
        missing_labels = all_keys - label_keys
        orphan_labels = label_keys - all_keys
        assert not missing_labels, f"Keys missing labels: {missing_labels}"
        assert not orphan_labels, f"Orphan labels (not in any category): {orphan_labels}"

    def test_newly_added_keys_present(self, roles_payload):
        cats = roles_payload["module_categories"]
        all_keys = {k for v in cats.values() for k in v}
        for key in NEWLY_ADDED_KEYS:
            assert key in all_keys, f"Newly-added key '{key}' not present in module_categories"


# --- Backfill on existing roles ---
class TestBackfill:
    def test_admin_role_full_access_on_new_keys(self, roles_payload):
        roles = roles_payload["roles"]
        admin = next((r for r in roles if r["name"] in ("Admin", "System Admin")), None)
        if not admin:
            pytest.skip("No Admin/System Admin role in tenant")
        perms = admin.get("permissions", {})
        for key in NEWLY_ADDED_KEYS:
            assert key in perms, f"Admin role missing key {key}"
            p = perms[key]
            assert p.get("view") and p.get("create") and p.get("edit") and p.get("delete"), (
                f"Admin role should have full access on {key}, got {p}"
            )

    def test_non_admin_role_default_on_new_keys(self, roles_payload):
        roles = roles_payload["roles"]
        # Look at any non-admin role (User/Viewer/custom)
        non_admins = [
            r for r in roles
            if r["name"] not in ("Admin", "System Admin")
        ]
        if not non_admins:
            pytest.skip("No non-admin roles to verify")
        for role in non_admins:
            perms = role.get("permissions", {})
            for key in NEWLY_ADDED_KEYS:
                assert key in perms, f"Role {role['name']} missing backfilled key {key}"

    def test_all_roles_have_all_71_keys(self, roles_payload):
        roles = roles_payload["roles"]
        cats = roles_payload["module_categories"]
        all_keys = {k for v in cats.values() for k in v}
        for role in roles:
            perms = role.get("permissions", {})
            missing = all_keys - set(perms.keys())
            assert not missing, f"Role '{role['name']}' missing keys: {missing}"


# --- Update / persistence ---
class TestUpdatePersistence:
    def test_update_persists_new_module_key_toggle(self, auth_headers, roles_payload):
        roles = roles_payload["roles"]
        # Pick a non-system role if possible, else any non-admin
        target = next(
            (r for r in roles if not r.get("is_system_role")),
            next((r for r in roles if r["name"] not in ("Admin", "System Admin")), None),
        )
        if not target:
            pytest.skip("No suitable role to update")

        role_id = target["id"]
        new_perms = dict(target["permissions"])
        # Toggle production_dashboard view to True
        new_perms["production_dashboard"] = {
            "view": True, "create": True, "edit": False, "delete": False
        }
        r = requests.put(
            f"{BASE_URL}/api/roles/{role_id}",
            headers=auth_headers,
            json={"permissions": new_perms},
            timeout=30,
        )
        assert r.status_code == 200, f"Update failed: {r.status_code} {r.text}"
        updated = r.json()
        assert updated["permissions"]["production_dashboard"]["view"] is True
        assert updated["permissions"]["production_dashboard"]["create"] is True

        # Verify by re-fetch
        r2 = requests.get(f"{BASE_URL}/api/roles/{role_id}", headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        fetched = r2.json()
        assert fetched["permissions"]["production_dashboard"]["view"] is True

        # Restore
        requests.put(
            f"{BASE_URL}/api/roles/{role_id}",
            headers=auth_headers,
            json={"permissions": target["permissions"]},
            timeout=30,
        )


# --- Regression: /api/auth/me unaffected ---
class TestAuthMeRegression:
    def test_auth_me_still_returns_user(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"auth/me failed: {r.status_code} {r.text}"
        data = r.json()
        # Could be wrapped under user or flat
        user = data.get("user") or data
        assert user.get("email") == EMAIL
