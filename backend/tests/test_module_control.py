"""Backend tests for two-layer module control (platform_modules and modules)."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://design-workflow-hub-11.preview.emergentagent.com').rstrip('/')


def login(email, password, tenant=None):
    s = requests.Session()
    headers = {"Content-Type": "application/json"}
    if tenant:
        headers["X-Tenant-ID"] = tenant
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, headers=headers)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    if tenant:
        s.headers["X-Tenant-ID"] = tenant
    return s


class TestModuleControl:
    def test_1_demo_ceo_can_toggle_modules(self):
        s = login("surya.yadavalli@demo-co.com", "demo123", tenant="demo-co")
        # disable bottle_preview
        r = s.put(f"{BASE_URL}/api/tenants/current/config", json={"modules": {"bottle_preview": False}})
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
        # verify persisted
        g = s.get(f"{BASE_URL}/api/tenants/current/config")
        assert g.status_code == 200
        modules = g.json().get("modules", {})
        assert modules.get("bottle_preview") is False, f"bottle_preview not persisted: {modules}"
        # restore
        r2 = s.put(f"{BASE_URL}/api/tenants/current/config", json={"modules": {"bottle_preview": True}})
        assert r2.status_code == 200

    def test_2_demo_ceo_cannot_set_platform_modules(self):
        s = login("surya.yadavalli@demo-co.com", "demo123", tenant="demo-co")
        r = s.put(f"{BASE_URL}/api/tenants/current/config", json={"platform_modules": {"leads": False}})
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_3_super_admin_can_set_platform_modules(self):
        s = login("surya.yadavalli@nylaairwater.earth", "test123", tenant="nyla-air-water")
        r = s.put(f"{BASE_URL}/api/platform-admin/tenants/demo-co", json={"platform_modules": {"gamma_generator": False}})
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
        g = s.get(f"{BASE_URL}/api/platform-admin/tenants/demo-co")
        assert g.status_code == 200
        pm = g.json().get("platform_modules", {})
        assert pm.get("gamma_generator") is False, f"platform_modules not persisted: {pm}"
        # NOTE: cleanup done separately after frontend test

    def test_4_non_admin_cannot_save_modules(self):
        s = login("creative.director@nylaairwater.earth", "test123", tenant="nyla-air-water")
        r = s.put(f"{BASE_URL}/api/tenants/current/config", json={"modules": {"leads": True}})
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_5_cleanup_restore_platform_modules(self):
        """Restore platform_modules for demo-co to empty so gamma_generator re-enabled."""
        s = login("surya.yadavalli@nylaairwater.earth", "test123", tenant="nyla-air-water")
        r = s.put(f"{BASE_URL}/api/platform-admin/tenants/demo-co", json={"platform_modules": {}})
        assert r.status_code == 200
