"""
Platform Admin API Tests

Tests for the Platform Admin dashboard endpoints:
- /api/platform-admin/stats - Platform statistics
- /api/platform-admin/tenants - List all tenants
- /api/platform-admin/tenants/{id} - Get tenant details
- /api/platform-admin/tenants/{id}/toggle-status - Enable/disable tenant
- /api/platform-admin/tenants/{id}/extend-trial - Extend trial
- /api/platform-admin/tenants/{id}/upgrade - Change subscription plan

Access Control:
- Platform admin (surya.yadavalli@gmail.com) should have access
- Regular admin (admin@nylaairwater.earth) should get 403
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
PLATFORM_ADMIN_CREDS = {
    "email": "surya.yadavalli@nylaairwater.earth",
    "password": "surya123",
    "tenant_id": "nyla-air-water"
}

REGULAR_ADMIN_CREDS = {
    "email": "admin@nylaairwater.earth", 
    "password": "admin123",
    "tenant_id": "nyla-air-water"
}


@pytest.fixture(scope="module")
def platform_admin_token():
    """Get authentication token for platform admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", 
        json={
            "email": PLATFORM_ADMIN_CREDS["email"],
            "password": PLATFORM_ADMIN_CREDS["password"]
        },
        headers={"X-Tenant-ID": PLATFORM_ADMIN_CREDS["tenant_id"]}
    )
    if response.status_code == 200:
        token = response.json().get("session_token")
        print(f"Platform admin login successful: {PLATFORM_ADMIN_CREDS['email']}")
        return token
    else:
        print(f"Platform admin login failed: {response.status_code} - {response.text}")
        pytest.skip(f"Platform admin login failed: {response.status_code}")


@pytest.fixture(scope="module")
def regular_admin_token():
    """Get authentication token for regular admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login",
        json={
            "email": REGULAR_ADMIN_CREDS["email"],
            "password": REGULAR_ADMIN_CREDS["password"]
        },
        headers={"X-Tenant-ID": REGULAR_ADMIN_CREDS["tenant_id"]}
    )
    if response.status_code == 200:
        token = response.json().get("session_token")
        print(f"Regular admin login successful: {REGULAR_ADMIN_CREDS['email']}")
        return token
    else:
        print(f"Regular admin login failed: {response.status_code} - {response.text}")
        pytest.skip(f"Regular admin login failed: {response.status_code}")


class TestAccessControl:
    """Test access control - platform admin vs regular admin"""

    def test_regular_admin_denied_stats(self, regular_admin_token):
        """Regular admin should get 403 on /stats"""
        response = requests.get(
            f"{BASE_URL}/api/platform-admin/stats",
            headers={"Authorization": f"Bearer {regular_admin_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("PASS: Regular admin denied access to /stats (403)")

    def test_regular_admin_denied_tenants_list(self, regular_admin_token):
        """Regular admin should get 403 on /tenants"""
        response = requests.get(
            f"{BASE_URL}/api/platform-admin/tenants",
            headers={"Authorization": f"Bearer {regular_admin_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("PASS: Regular admin denied access to /tenants (403)")

    def test_regular_admin_denied_tenant_details(self, regular_admin_token):
        """Regular admin should get 403 on /tenants/{id}"""
        response = requests.get(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water",
            headers={"Authorization": f"Bearer {regular_admin_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("PASS: Regular admin denied access to tenant details (403)")

    def test_unauthenticated_denied(self):
        """Unauthenticated requests should get 401/403"""
        response = requests.get(f"{BASE_URL}/api/platform-admin/stats")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"PASS: Unauthenticated request denied ({response.status_code})")


class TestPlatformAdminStats:
    """Test /api/platform-admin/stats endpoint"""

    def test_get_platform_stats(self, platform_admin_token):
        """Platform admin can get platform statistics"""
        response = requests.get(
            f"{BASE_URL}/api/platform-admin/stats",
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Validate response structure
        assert "total_tenants" in data, "Missing total_tenants field"
        assert "active_tenants" in data, "Missing active_tenants field"
        assert "trial_tenants" in data, "Missing trial_tenants field"
        assert "total_users" in data, "Missing total_users field"
        
        # Validate data types
        assert isinstance(data["total_tenants"], int), "total_tenants should be int"
        assert isinstance(data["active_tenants"], int), "active_tenants should be int"
        assert data["total_tenants"] >= 0, "total_tenants should be >= 0"
        
        print(f"PASS: Platform stats returned - {data['total_tenants']} tenants, {data['active_tenants']} active")


class TestTenantsList:
    """Test /api/platform-admin/tenants endpoint"""

    def test_list_all_tenants(self, platform_admin_token):
        """Platform admin can list all tenants"""
        response = requests.get(
            f"{BASE_URL}/api/platform-admin/tenants",
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "tenants" in data, "Missing tenants array"
        assert "total" in data, "Missing total count"
        assert isinstance(data["tenants"], list), "tenants should be a list"
        
        # Verify structure of tenant objects
        if len(data["tenants"]) > 0:
            tenant = data["tenants"][0]
            assert "tenant_id" in tenant, "Tenant missing tenant_id"
            assert "name" in tenant, "Tenant missing name"
            assert "is_active" in tenant, "Tenant missing is_active"
        
        print(f"PASS: Listed {len(data['tenants'])} tenants (total: {data['total']})")

    def test_list_tenants_with_search(self, platform_admin_token):
        """Platform admin can search tenants"""
        response = requests.get(
            f"{BASE_URL}/api/platform-admin/tenants?search=nyla",
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Should find nyla-air-water tenant
        tenant_ids = [t["tenant_id"] for t in data["tenants"]]
        assert "nyla-air-water" in tenant_ids, "Should find nyla-air-water tenant"
        print(f"PASS: Search 'nyla' returned {len(data['tenants'])} tenants including nyla-air-water")

    def test_list_tenants_with_status_filter(self, platform_admin_token):
        """Platform admin can filter tenants by status"""
        response = requests.get(
            f"{BASE_URL}/api/platform-admin/tenants?status=active",
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # All returned tenants should be active
        for tenant in data["tenants"]:
            assert tenant.get("is_active") == True, f"Tenant {tenant.get('tenant_id')} should be active"
        
        print(f"PASS: Status filter 'active' returned {len(data['tenants'])} active tenants")


class TestTenantDetails:
    """Test /api/platform-admin/tenants/{id} endpoint"""

    def test_get_tenant_details(self, platform_admin_token):
        """Platform admin can get full tenant details"""
        response = requests.get(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water",
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Validate full tenant structure
        assert data["tenant_id"] == "nyla-air-water", "Wrong tenant returned"
        assert "stats" in data, "Missing stats object"
        assert "admins" in data, "Missing admins list"
        
        # Validate stats
        stats = data["stats"]
        assert "user_count" in stats, "Missing user_count in stats"
        assert "lead_count" in stats, "Missing lead_count in stats"
        assert "account_count" in stats, "Missing account_count in stats"
        
        print(f"PASS: Tenant details returned - {stats['user_count']} users, {stats['lead_count']} leads")

    def test_get_nonexistent_tenant(self, platform_admin_token):
        """Get nonexistent tenant should return 404"""
        response = requests.get(
            f"{BASE_URL}/api/platform-admin/tenants/nonexistent-tenant-xyz",
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print("PASS: Nonexistent tenant returns 404")


class TestTenantActions:
    """Test tenant management actions"""

    def test_toggle_tenant_status(self, platform_admin_token):
        """Platform admin can toggle tenant status"""
        # Get current status
        response = requests.get(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water",
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200
        original_status = response.json().get("is_active", True)
        
        # Toggle status
        response = requests.post(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water/toggle-status",
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "is_active" in data, "Missing is_active in response"
        assert data["is_active"] == (not original_status), "Status should be toggled"
        
        # Toggle back to original
        response = requests.post(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water/toggle-status",
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200
        final_data = response.json()
        assert final_data["is_active"] == original_status, "Status should be restored"
        
        print(f"PASS: Toggle status works - toggled from {original_status} to {not original_status} and back")

    def test_extend_trial(self, platform_admin_token):
        """Platform admin can extend trial period"""
        response = requests.post(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water/extend-trial",
            json={"days": 7},
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "trial_ends_at" in data, "Missing trial_ends_at in response"
        assert "message" in data, "Missing message in response"
        assert "7 days" in data["message"], "Message should mention 7 days"
        
        print(f"PASS: Trial extended - new end date: {data['trial_ends_at']}")

    def test_upgrade_plan(self, platform_admin_token):
        """Platform admin can change subscription plan"""
        # Get original plan
        response = requests.get(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water",
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200
        original_plan = response.json().get("subscription_plan", "trial")
        
        # Upgrade to professional
        response = requests.post(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water/upgrade",
            json={"plan": "professional"},
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["subscription_plan"] == "professional", "Plan should be professional"
        
        # Restore original plan
        response = requests.post(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water/upgrade",
            json={"plan": original_plan or "trial"},
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200
        
        print(f"PASS: Upgrade plan works - upgraded to professional, restored to {original_plan}")

    def test_upgrade_invalid_plan(self, platform_admin_token):
        """Invalid plan should return 400"""
        response = requests.post(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water/upgrade",
            json={"plan": "invalid-plan"},
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("PASS: Invalid plan returns 400")


class TestTenantUpdate:
    """Test /api/platform-admin/tenants/{id} PUT endpoint"""

    def test_update_tenant_branding(self, platform_admin_token):
        """Platform admin can update tenant branding"""
        response = requests.put(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water",
            json={
                "branding": {
                    "app_name": "Test Update App Name",
                    "tagline": "Test Tagline"
                }
            },
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("branding", {}).get("app_name") == "Test Update App Name", "Branding should be updated"
        
        # Restore original branding
        response = requests.put(
            f"{BASE_URL}/api/platform-admin/tenants/nyla-air-water",
            json={
                "branding": {
                    "app_name": "Nyla Air Water",
                    "tagline": "Pure Water, Pure Air"
                }
            },
            headers={"Authorization": f"Bearer {platform_admin_token}"}
        )
        assert response.status_code == 200
        
        print("PASS: Update tenant branding works")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
