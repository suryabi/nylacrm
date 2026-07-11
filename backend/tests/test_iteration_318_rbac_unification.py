"""
Iteration 318: RBAC unification tests
- /api/roles must expose ~107 module keys covering all new modules
- New keys (mail, email_templates, notification_settings, proposal_template, fleet_*,
  batch_genealogy, vendor_types, reversals_log, *_integration, state_machines,
  notification_templates, share_recipients, accounting_*, delivery_orders,
  knowledge_base, customer_returns, stock_transfers, platform_admin) must be present
- Backfill: Admin/CEO/System Admin get full access; non-admin roles get default perms
- MODULE_LABELS must have entries for every key in MODULE_CATEGORIES
- Regression: GET /api/roles returns 200 with prior structure
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
EMAIL = "surya.yadavalli@nylaairwater.earth"
PASSWORD = "test123"

# New module keys introduced in this iteration (RBAC unification)
NEW_KEYS = [
    "mail",
    "email_templates",
    "notification_settings",
    "proposal_template",
    "fleet_vehicles",
    "fleet_drivers",
    "batch_genealogy",
    "vendor_types",
    "reversals_log",
    "zoho_integration",
    "slack_integration",
    "google_drive_integration",
    "state_machines",
    "notification_templates",
    "share_recipients",
    "accounting_transactions",
    "accounting_masters",
    "accounting_income_masters",
    "accounting_vendors",
    "accounting_employees",
    "delivery_orders",
    "knowledge_base",
    "customer_returns",
    "stock_transfers",
    "platform_admin",
]

# New categories introduced
NEW_CATEGORIES = [
    "Fleet",
    "Integrations",
    "Communication",
    "Presentation",
    "Accounting",
    "Sales Operations Extras",
]


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed {r.status_code}: {r.text}"
    data = r.json()
    token = (
        data.get("session_token") or data.get("token") or data.get("access_token")
    )
    assert token, f"No token in login response: {data}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def roles_payload(auth_headers):
    r = requests.get(f"{BASE_URL}/api/roles", headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"GET /api/roles failed {r.status_code}: {r.text}"
    return r.json()


# --- Structure / module registry ---
class TestModuleRegistry:
    def test_response_has_roles_categories_labels(self, roles_payload):
        assert "roles" in roles_payload
        assert "module_categories" in roles_payload
        assert "module_labels" in roles_payload
        assert isinstance(roles_payload["roles"], list) and len(roles_payload["roles"]) > 0

    def test_total_module_keys_at_least_107(self, roles_payload):
        labels = roles_payload["module_labels"]
        assert len(labels) >= 107, f"Expected >=107 module labels, got {len(labels)}"

    def test_all_new_keys_in_module_labels(self, roles_payload):
        labels = roles_payload["module_labels"]
        missing = [k for k in NEW_KEYS if k not in labels]
        assert not missing, f"Missing new module keys in module_labels: {missing}"

    def test_new_categories_present(self, roles_payload):
        cats = roles_payload["module_categories"]
        missing = [c for c in NEW_CATEGORIES if c not in cats]
        assert not missing, f"Missing new categories: {missing}"

    def test_new_keys_placed_in_categories(self, roles_payload):
        cats = roles_payload["module_categories"]
        all_keys_in_cats = {k for v in cats.values() for k in v}
        missing = [k for k in NEW_KEYS if k not in all_keys_in_cats]
        assert not missing, f"New keys not placed in any category: {missing}"

    def test_no_orphans_labels_match_categories(self, roles_payload):
        cats = roles_payload["module_categories"]
        labels = roles_payload["module_labels"]
        cat_keys = {k for v in cats.values() for k in v}
        label_keys = set(labels.keys())
        missing_labels = cat_keys - label_keys
        assert not missing_labels, f"Category keys missing labels: {missing_labels}"

    def test_expected_category_contents(self, roles_payload):
        cats = roles_payload["module_categories"]
        # Spot check that new categories contain expected keys
        assert "mail" in cats.get("Communication", [])
        assert "email_templates" in cats.get("Communication", [])
        assert "notification_settings" in cats.get("Communication", [])
        assert "proposal_template" in cats.get("Presentation", [])
        assert "fleet_vehicles" in cats.get("Fleet", [])
        assert "fleet_drivers" in cats.get("Fleet", [])
        assert "zoho_integration" in cats.get("Integrations", [])
        assert "share_recipients" in cats.get("Integrations", [])
        assert "notification_templates" in cats.get("Integrations", [])
        assert "accounting_transactions" in cats.get("Accounting", [])
        assert "accounting_vendors" in cats.get("Accounting", [])
        assert "delivery_orders" in cats.get("Sales Operations Extras", [])
        assert "customer_returns" in cats.get("Sales Operations Extras", [])
        assert "batch_genealogy" in cats.get("Production", [])
        assert "vendor_types" in cats.get("Admin", [])
        assert "reversals_log" in cats.get("Admin", [])
        assert "platform_admin" in cats.get("Admin", [])
        assert "stock_transfers" in cats.get("Distribution", [])


# --- Backfill behavior for existing roles ---
class TestBackfill:
    def test_admin_role_full_access_on_new_keys(self, roles_payload):
        roles = roles_payload["roles"]
        admin = next(
            (r for r in roles if r["name"] in ("Admin", "CEO", "System Admin")), None
        )
        assert admin is not None, "No Admin/CEO/System Admin role found for tenant"
        perms = admin["permissions"]
        for key in NEW_KEYS:
            assert key in perms, f"Admin role missing backfilled key: {key}"
            p = perms[key]
            assert p.get("view") and p.get("create") and p.get("edit") and p.get("delete"), (
                f"Admin role should have full access on '{key}', got {p}"
            )

    def test_non_admin_role_has_all_new_keys(self, roles_payload):
        roles = roles_payload["roles"]
        non_admins = [
            r for r in roles if r["name"] not in ("Admin", "CEO", "System Admin")
        ]
        if not non_admins:
            pytest.skip("No non-admin roles in tenant")
        for role in non_admins:
            perms = role.get("permissions", {})
            missing = [k for k in NEW_KEYS if k not in perms]
            assert not missing, f"Role '{role['name']}' missing new keys: {missing}"

    def test_all_roles_have_every_category_key(self, roles_payload):
        roles = roles_payload["roles"]
        cats = roles_payload["module_categories"]
        all_keys = {k for v in cats.values() for k in v}
        for role in roles:
            perms = role.get("permissions", {})
            missing = all_keys - set(perms.keys())
            assert not missing, f"Role '{role['name']}' missing keys after backfill: {sorted(missing)}"

    def test_permissions_structure_intact(self, roles_payload):
        # Every permission entry must have keys view/create/edit/delete as bools
        for role in roles_payload["roles"]:
            for key, perm in role["permissions"].items():
                for attr in ("view", "create", "edit", "delete"):
                    assert attr in perm, f"Role '{role['name']}' key '{key}' missing '{attr}'"
                    assert isinstance(perm[attr], bool), (
                        f"Role '{role['name']}' key '{key}' attr '{attr}' not bool: {perm[attr]!r}"
                    )


# --- Regression / prior structure ---
class TestRegression:
    def test_roles_have_expected_fields(self, roles_payload):
        for role in roles_payload["roles"]:
            for f in ("id", "name", "permissions", "tenant_id", "is_system_role"):
                assert f in role, f"Role missing field '{f}': {role.get('name')}"

    def test_no_mongo_id_leak(self, roles_payload):
        for role in roles_payload["roles"]:
            assert "_id" not in role, f"Mongo _id leaked in role {role.get('name')}"

    def test_prior_core_keys_still_present(self, roles_payload):
        labels = roles_payload["module_labels"]
        # Sample of pre-existing keys
        for k in ("home", "dashboard", "leads", "pipeline", "accounts", "contacts",
                  "tenant_settings", "team", "task_management"):
            assert k in labels, f"Prior key '{k}' missing from module_labels"

    def test_auth_me_ok(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        user = data.get("user") or data
        assert user.get("email") == EMAIL
