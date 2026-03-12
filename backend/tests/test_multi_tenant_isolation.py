"""
Multi-Tenant Data Isolation Tests

This test suite verifies that the TenantCollection and TenantDB wrappers
properly filter all queries by tenant_id, ensuring complete data isolation
between tenants.

Test Credentials:
- Tenant 1 (nyla-air-water): admin@nylaairwater.earth / admin123
- Tenant 2 (acme-corp): john@acme.com / test123

Expected Data:
- nyla-air-water: 68 leads, 23 users, 6 accounts
- acme-corp: 0 leads, 1 user, 0 accounts
"""

import pytest
import requests
import os

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Tenant configurations
TENANT_1 = {
    "tenant_id": "nyla-air-water",
    "email": "admin@nylaairwater.earth",
    "password": "admin123",
    "expected_leads_min": 50,  # At least 50 leads
    "expected_users_min": 10,  # At least 10 users
    "expected_accounts_min": 3,  # At least 3 accounts
}

TENANT_2 = {
    "tenant_id": "acme-corp",
    "email": "john@acme.com",
    "password": "test123",
    "expected_leads_max": 5,  # Very few or no leads
    "expected_users_max": 3,  # Very few users
    "expected_accounts_max": 2,  # Very few or no accounts
}


class TestMultiTenantLogin:
    """Test login functionality for both tenants"""
    
    def test_tenant1_login_success(self):
        """Test login for tenant 1 (nyla-air-water)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_1["email"], "password": TENANT_1["password"]},
            headers={"X-Tenant-ID": TENANT_1["tenant_id"]}
        )
        print(f"Tenant 1 Login Response: {response.status_code}")
        print(f"Response: {response.text[:500] if response.text else 'No content'}")
        
        assert response.status_code == 200, f"Login failed for tenant 1: {response.text}"
        data = response.json()
        assert "user" in data, "User not in response"
        assert "session_token" in data, "Session token not in response"
        print(f"Tenant 1 Login SUCCESS - User: {data['user'].get('name', data['user'].get('email'))}")
    
    def test_tenant2_login_success(self):
        """Test login for tenant 2 (acme-corp)"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_2["email"], "password": TENANT_2["password"]},
            headers={"X-Tenant-ID": TENANT_2["tenant_id"]}
        )
        print(f"Tenant 2 Login Response: {response.status_code}")
        print(f"Response: {response.text[:500] if response.text else 'No content'}")
        
        assert response.status_code == 200, f"Login failed for tenant 2: {response.text}"
        data = response.json()
        assert "user" in data, "User not in response"
        assert "session_token" in data, "Session token not in response"
        print(f"Tenant 2 Login SUCCESS - User: {data['user'].get('name', data['user'].get('email'))}")
    
    def test_cross_tenant_login_fails(self):
        """Verify tenant 1 user cannot login with tenant 2 header"""
        # Try to login tenant 1 user with tenant 2 header - should fail
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_1["email"], "password": TENANT_1["password"]},
            headers={"X-Tenant-ID": TENANT_2["tenant_id"]}  # Wrong tenant
        )
        print(f"Cross-tenant login attempt: {response.status_code}")
        
        # Should fail because user doesn't exist in that tenant
        assert response.status_code == 401, f"Cross-tenant login should fail: {response.text}"
        print("Cross-tenant login correctly rejected")


class TestLeadsDataIsolation:
    """Test that leads are properly isolated between tenants"""
    
    @pytest.fixture
    def tenant1_session(self):
        """Get session token for tenant 1"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_1["email"], "password": TENANT_1["password"]},
            headers={"X-Tenant-ID": TENANT_1["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 1: {response.text}")
        return response.json()["session_token"]
    
    @pytest.fixture
    def tenant2_session(self):
        """Get session token for tenant 2"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_2["email"], "password": TENANT_2["password"]},
            headers={"X-Tenant-ID": TENANT_2["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 2: {response.text}")
        return response.json()["session_token"]
    
    def test_tenant1_sees_own_leads(self, tenant1_session):
        """Tenant 1 should see their own leads (many leads)"""
        response = requests.get(
            f"{BASE_URL}/api/leads",
            headers={
                "X-Tenant-ID": TENANT_1["tenant_id"],
                "Authorization": f"Bearer {tenant1_session}"
            }
        )
        print(f"Tenant 1 Leads Response: {response.status_code}")
        
        assert response.status_code == 200, f"Failed to get leads: {response.text}"
        data = response.json()
        
        total_leads = data.get("total", len(data.get("data", [])))
        print(f"Tenant 1 (nyla-air-water) Leads Count: {total_leads}")
        
        assert total_leads >= TENANT_1["expected_leads_min"], \
            f"Tenant 1 should have at least {TENANT_1['expected_leads_min']} leads, got {total_leads}"
        print(f"PASS - Tenant 1 has {total_leads} leads")
    
    def test_tenant2_sees_own_leads(self, tenant2_session):
        """Tenant 2 should see their own leads (few or no leads)"""
        response = requests.get(
            f"{BASE_URL}/api/leads",
            headers={
                "X-Tenant-ID": TENANT_2["tenant_id"],
                "Authorization": f"Bearer {tenant2_session}"
            }
        )
        print(f"Tenant 2 Leads Response: {response.status_code}")
        
        assert response.status_code == 200, f"Failed to get leads: {response.text}"
        data = response.json()
        
        total_leads = data.get("total", len(data.get("data", [])))
        print(f"Tenant 2 (acme-corp) Leads Count: {total_leads}")
        
        assert total_leads <= TENANT_2["expected_leads_max"], \
            f"Tenant 2 should have at most {TENANT_2['expected_leads_max']} leads, got {total_leads}"
        print(f"PASS - Tenant 2 has {total_leads} leads (isolated)")
    
    def test_leads_count_difference(self, tenant1_session, tenant2_session):
        """Verify significant difference in leads count between tenants"""
        # Get tenant 1 leads
        response1 = requests.get(
            f"{BASE_URL}/api/leads",
            headers={
                "X-Tenant-ID": TENANT_1["tenant_id"],
                "Authorization": f"Bearer {tenant1_session}"
            }
        )
        data1 = response1.json()
        tenant1_leads = data1.get("total", len(data1.get("data", [])))
        
        # Get tenant 2 leads
        response2 = requests.get(
            f"{BASE_URL}/api/leads",
            headers={
                "X-Tenant-ID": TENANT_2["tenant_id"],
                "Authorization": f"Bearer {tenant2_session}"
            }
        )
        data2 = response2.json()
        tenant2_leads = data2.get("total", len(data2.get("data", [])))
        
        print(f"Leads Comparison - Tenant 1: {tenant1_leads}, Tenant 2: {tenant2_leads}")
        
        # There should be a significant difference
        assert tenant1_leads != tenant2_leads, \
            "Both tenants have same lead count - data may not be properly isolated!"
        
        print(f"PASS - Leads are isolated: Tenant 1 has {tenant1_leads}, Tenant 2 has {tenant2_leads}")


class TestUsersDataIsolation:
    """Test that users are properly isolated between tenants"""
    
    @pytest.fixture
    def tenant1_session(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_1["email"], "password": TENANT_1["password"]},
            headers={"X-Tenant-ID": TENANT_1["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 1: {response.text}")
        return response.json()["session_token"]
    
    @pytest.fixture
    def tenant2_session(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_2["email"], "password": TENANT_2["password"]},
            headers={"X-Tenant-ID": TENANT_2["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 2: {response.text}")
        return response.json()["session_token"]
    
    def test_tenant1_sees_own_users(self, tenant1_session):
        """Tenant 1 should see their own users"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={
                "X-Tenant-ID": TENANT_1["tenant_id"],
                "Authorization": f"Bearer {tenant1_session}"
            }
        )
        print(f"Tenant 1 Users Response: {response.status_code}")
        
        assert response.status_code == 200, f"Failed to get users: {response.text}"
        data = response.json()
        users_count = len(data) if isinstance(data, list) else len(data.get("users", data.get("data", [])))
        print(f"Tenant 1 (nyla-air-water) Users Count: {users_count}")
        
        assert users_count >= TENANT_1["expected_users_min"], \
            f"Tenant 1 should have at least {TENANT_1['expected_users_min']} users, got {users_count}"
        print(f"PASS - Tenant 1 has {users_count} users")
    
    def test_tenant2_sees_own_users(self, tenant2_session):
        """Tenant 2 should see their own users"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={
                "X-Tenant-ID": TENANT_2["tenant_id"],
                "Authorization": f"Bearer {tenant2_session}"
            }
        )
        print(f"Tenant 2 Users Response: {response.status_code}")
        
        assert response.status_code == 200, f"Failed to get users: {response.text}"
        data = response.json()
        users_count = len(data) if isinstance(data, list) else len(data.get("users", data.get("data", [])))
        print(f"Tenant 2 (acme-corp) Users Count: {users_count}")
        
        assert users_count <= TENANT_2["expected_users_max"], \
            f"Tenant 2 should have at most {TENANT_2['expected_users_max']} users, got {users_count}"
        print(f"PASS - Tenant 2 has {users_count} users (isolated)")
    
    def test_users_count_difference(self, tenant1_session, tenant2_session):
        """Verify user counts differ between tenants"""
        # Get tenant 1 users
        response1 = requests.get(
            f"{BASE_URL}/api/users",
            headers={
                "X-Tenant-ID": TENANT_1["tenant_id"],
                "Authorization": f"Bearer {tenant1_session}"
            }
        )
        data1 = response1.json()
        tenant1_users = len(data1) if isinstance(data1, list) else len(data1.get("users", data1.get("data", [])))
        
        # Get tenant 2 users
        response2 = requests.get(
            f"{BASE_URL}/api/users",
            headers={
                "X-Tenant-ID": TENANT_2["tenant_id"],
                "Authorization": f"Bearer {tenant2_session}"
            }
        )
        data2 = response2.json()
        tenant2_users = len(data2) if isinstance(data2, list) else len(data2.get("users", data2.get("data", [])))
        
        print(f"Users Comparison - Tenant 1: {tenant1_users}, Tenant 2: {tenant2_users}")
        
        assert tenant1_users != tenant2_users, \
            "Both tenants have same user count - data may not be properly isolated!"
        
        print(f"PASS - Users are isolated: Tenant 1 has {tenant1_users}, Tenant 2 has {tenant2_users}")


class TestAccountsDataIsolation:
    """Test that accounts are properly isolated between tenants"""
    
    @pytest.fixture
    def tenant1_session(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_1["email"], "password": TENANT_1["password"]},
            headers={"X-Tenant-ID": TENANT_1["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 1: {response.text}")
        return response.json()["session_token"]
    
    @pytest.fixture
    def tenant2_session(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_2["email"], "password": TENANT_2["password"]},
            headers={"X-Tenant-ID": TENANT_2["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 2: {response.text}")
        return response.json()["session_token"]
    
    def test_tenant1_sees_own_accounts(self, tenant1_session):
        """Tenant 1 should see their own accounts"""
        response = requests.get(
            f"{BASE_URL}/api/accounts",
            headers={
                "X-Tenant-ID": TENANT_1["tenant_id"],
                "Authorization": f"Bearer {tenant1_session}"
            }
        )
        print(f"Tenant 1 Accounts Response: {response.status_code}")
        
        assert response.status_code == 200, f"Failed to get accounts: {response.text}"
        data = response.json()
        accounts_count = data.get("total", len(data.get("data", [])))
        print(f"Tenant 1 (nyla-air-water) Accounts Count: {accounts_count}")
        
        assert accounts_count >= TENANT_1["expected_accounts_min"], \
            f"Tenant 1 should have at least {TENANT_1['expected_accounts_min']} accounts, got {accounts_count}"
        print(f"PASS - Tenant 1 has {accounts_count} accounts")
    
    def test_tenant2_sees_own_accounts(self, tenant2_session):
        """Tenant 2 should see their own accounts"""
        response = requests.get(
            f"{BASE_URL}/api/accounts",
            headers={
                "X-Tenant-ID": TENANT_2["tenant_id"],
                "Authorization": f"Bearer {tenant2_session}"
            }
        )
        print(f"Tenant 2 Accounts Response: {response.status_code}")
        
        assert response.status_code == 200, f"Failed to get accounts: {response.text}"
        data = response.json()
        accounts_count = data.get("total", len(data.get("data", [])))
        print(f"Tenant 2 (acme-corp) Accounts Count: {accounts_count}")
        
        assert accounts_count <= TENANT_2["expected_accounts_max"], \
            f"Tenant 2 should have at most {TENANT_2['expected_accounts_max']} accounts, got {accounts_count}"
        print(f"PASS - Tenant 2 has {accounts_count} accounts (isolated)")


class TestActivitiesDataIsolation:
    """Test that activities are properly isolated between tenants"""
    
    @pytest.fixture
    def tenant1_session(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_1["email"], "password": TENANT_1["password"]},
            headers={"X-Tenant-ID": TENANT_1["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 1: {response.text}")
        return response.json()["session_token"]
    
    @pytest.fixture
    def tenant2_session(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_2["email"], "password": TENANT_2["password"]},
            headers={"X-Tenant-ID": TENANT_2["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 2: {response.text}")
        return response.json()["session_token"]
    
    def test_tenant1_sees_own_activities(self, tenant1_session):
        """Tenant 1 should see activities for their leads"""
        # First get a lead ID from tenant 1
        leads_response = requests.get(
            f"{BASE_URL}/api/leads?page_size=1",
            headers={
                "X-Tenant-ID": TENANT_1["tenant_id"],
                "Authorization": f"Bearer {tenant1_session}"
            }
        )
        
        if leads_response.status_code != 200:
            pytest.skip(f"Cannot get leads: {leads_response.text}")
        
        leads_data = leads_response.json()
        if not leads_data.get("data"):
            pytest.skip("No leads found for tenant 1")
        
        lead_id = leads_data["data"][0]["id"]
        
        # Get activities for that lead
        response = requests.get(
            f"{BASE_URL}/api/leads/{lead_id}/activities",
            headers={
                "X-Tenant-ID": TENANT_1["tenant_id"],
                "Authorization": f"Bearer {tenant1_session}"
            }
        )
        
        print(f"Tenant 1 Activities Response: {response.status_code}")
        # Just verify we can get activities (endpoint works)
        assert response.status_code == 200, f"Failed to get activities: {response.text}"
        print(f"PASS - Tenant 1 can access activities for their leads")


class TestTasksDataIsolation:
    """Test that tasks are properly isolated between tenants"""
    
    @pytest.fixture
    def tenant1_session(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_1["email"], "password": TENANT_1["password"]},
            headers={"X-Tenant-ID": TENANT_1["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 1: {response.text}")
        return response.json()["session_token"]
    
    @pytest.fixture
    def tenant2_session(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_2["email"], "password": TENANT_2["password"]},
            headers={"X-Tenant-ID": TENANT_2["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 2: {response.text}")
        return response.json()["session_token"]
    
    def test_tenant1_sees_own_tasks(self, tenant1_session):
        """Tenant 1 should see their own tasks"""
        response = requests.get(
            f"{BASE_URL}/api/tasks",
            headers={
                "X-Tenant-ID": TENANT_1["tenant_id"],
                "Authorization": f"Bearer {tenant1_session}"
            }
        )
        print(f"Tenant 1 Tasks Response: {response.status_code}")
        
        # Just verify endpoint works for tenant 1
        assert response.status_code == 200, f"Failed to get tasks: {response.text}"
        data = response.json()
        tasks_count = len(data) if isinstance(data, list) else len(data.get("tasks", data.get("data", [])))
        print(f"Tenant 1 Tasks Count: {tasks_count}")
        print(f"PASS - Tenant 1 tasks endpoint working")
    
    def test_tenant2_sees_own_tasks(self, tenant2_session):
        """Tenant 2 should see their own tasks"""
        response = requests.get(
            f"{BASE_URL}/api/tasks",
            headers={
                "X-Tenant-ID": TENANT_2["tenant_id"],
                "Authorization": f"Bearer {tenant2_session}"
            }
        )
        print(f"Tenant 2 Tasks Response: {response.status_code}")
        
        assert response.status_code == 200, f"Failed to get tasks: {response.text}"
        data = response.json()
        tasks_count = len(data) if isinstance(data, list) else len(data.get("tasks", data.get("data", [])))
        print(f"Tenant 2 Tasks Count: {tasks_count}")
        print(f"PASS - Tenant 2 tasks endpoint working")


class TestCrossDataAccessPrevention:
    """Test that tenants cannot access each other's specific resources"""
    
    @pytest.fixture
    def tenant1_session(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_1["email"], "password": TENANT_1["password"]},
            headers={"X-Tenant-ID": TENANT_1["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 1: {response.text}")
        return response.json()["session_token"]
    
    @pytest.fixture
    def tenant1_lead_id(self, tenant1_session):
        """Get a specific lead ID from tenant 1"""
        response = requests.get(
            f"{BASE_URL}/api/leads?page_size=1",
            headers={
                "X-Tenant-ID": TENANT_1["tenant_id"],
                "Authorization": f"Bearer {tenant1_session}"
            }
        )
        if response.status_code != 200 or not response.json().get("data"):
            pytest.skip("Cannot get leads from tenant 1")
        return response.json()["data"][0]["id"]
    
    @pytest.fixture
    def tenant2_session(self):
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_2["email"], "password": TENANT_2["password"]},
            headers={"X-Tenant-ID": TENANT_2["tenant_id"]}
        )
        if response.status_code != 200:
            pytest.skip(f"Cannot login to tenant 2: {response.text}")
        return response.json()["session_token"]
    
    def test_tenant2_cannot_access_tenant1_lead(self, tenant2_session, tenant1_lead_id):
        """Tenant 2 should not be able to access tenant 1's specific lead"""
        response = requests.get(
            f"{BASE_URL}/api/leads/{tenant1_lead_id}",
            headers={
                "X-Tenant-ID": TENANT_2["tenant_id"],
                "Authorization": f"Bearer {tenant2_session}"
            }
        )
        
        print(f"Cross-tenant lead access attempt: {response.status_code}")
        
        # Should return 404 (not found in tenant 2's data)
        assert response.status_code == 404, \
            f"Tenant 2 should NOT be able to access tenant 1's lead! Got: {response.status_code}"
        
        print(f"PASS - Tenant 2 cannot access tenant 1's lead (404)")


# Summary test to run first
class TestDataIsolationSummary:
    """Summary test to get counts for both tenants"""
    
    def test_data_isolation_summary(self):
        """Get and compare data counts for both tenants"""
        print("\n" + "="*60)
        print("MULTI-TENANT DATA ISOLATION SUMMARY")
        print("="*60)
        
        results = {"tenant1": {}, "tenant2": {}}
        
        # Login to tenant 1
        t1_login = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_1["email"], "password": TENANT_1["password"]},
            headers={"X-Tenant-ID": TENANT_1["tenant_id"]}
        )
        
        if t1_login.status_code == 200:
            t1_token = t1_login.json()["session_token"]
            
            # Get tenant 1 leads
            leads = requests.get(
                f"{BASE_URL}/api/leads",
                headers={"X-Tenant-ID": TENANT_1["tenant_id"], "Authorization": f"Bearer {t1_token}"}
            )
            if leads.status_code == 200:
                results["tenant1"]["leads"] = leads.json().get("total", 0)
            
            # Get tenant 1 users
            users = requests.get(
                f"{BASE_URL}/api/users",
                headers={"X-Tenant-ID": TENANT_1["tenant_id"], "Authorization": f"Bearer {t1_token}"}
            )
            if users.status_code == 200:
                data = users.json()
                results["tenant1"]["users"] = len(data) if isinstance(data, list) else len(data.get("data", []))
            
            # Get tenant 1 accounts
            accounts = requests.get(
                f"{BASE_URL}/api/accounts",
                headers={"X-Tenant-ID": TENANT_1["tenant_id"], "Authorization": f"Bearer {t1_token}"}
            )
            if accounts.status_code == 200:
                results["tenant1"]["accounts"] = accounts.json().get("total", 0)
        else:
            results["tenant1"]["login_error"] = t1_login.text
        
        # Login to tenant 2
        t2_login = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TENANT_2["email"], "password": TENANT_2["password"]},
            headers={"X-Tenant-ID": TENANT_2["tenant_id"]}
        )
        
        if t2_login.status_code == 200:
            t2_token = t2_login.json()["session_token"]
            
            # Get tenant 2 leads
            leads = requests.get(
                f"{BASE_URL}/api/leads",
                headers={"X-Tenant-ID": TENANT_2["tenant_id"], "Authorization": f"Bearer {t2_token}"}
            )
            if leads.status_code == 200:
                results["tenant2"]["leads"] = leads.json().get("total", 0)
            
            # Get tenant 2 users
            users = requests.get(
                f"{BASE_URL}/api/users",
                headers={"X-Tenant-ID": TENANT_2["tenant_id"], "Authorization": f"Bearer {t2_token}"}
            )
            if users.status_code == 200:
                data = users.json()
                results["tenant2"]["users"] = len(data) if isinstance(data, list) else len(data.get("data", []))
            
            # Get tenant 2 accounts
            accounts = requests.get(
                f"{BASE_URL}/api/accounts",
                headers={"X-Tenant-ID": TENANT_2["tenant_id"], "Authorization": f"Bearer {t2_token}"}
            )
            if accounts.status_code == 200:
                results["tenant2"]["accounts"] = accounts.json().get("total", 0)
        else:
            results["tenant2"]["login_error"] = t2_login.text
        
        # Print summary
        print(f"\nTenant 1 (nyla-air-water):")
        print(f"  - Leads:    {results['tenant1'].get('leads', 'ERROR')}")
        print(f"  - Users:    {results['tenant1'].get('users', 'ERROR')}")
        print(f"  - Accounts: {results['tenant1'].get('accounts', 'ERROR')}")
        
        print(f"\nTenant 2 (acme-corp):")
        print(f"  - Leads:    {results['tenant2'].get('leads', 'ERROR')}")
        print(f"  - Users:    {results['tenant2'].get('users', 'ERROR')}")
        print(f"  - Accounts: {results['tenant2'].get('accounts', 'ERROR')}")
        
        print("\n" + "="*60)
        
        # Verify isolation
        if "login_error" not in results["tenant1"] and "login_error" not in results["tenant2"]:
            t1_leads = results["tenant1"].get("leads", 0)
            t2_leads = results["tenant2"].get("leads", 0)
            t1_users = results["tenant1"].get("users", 0)
            t2_users = results["tenant2"].get("users", 0)
            
            print(f"\nISOLATION CHECK:")
            print(f"  Leads:    {'ISOLATED' if t1_leads != t2_leads else 'POTENTIAL ISSUE!'}")
            print(f"  Users:    {'ISOLATED' if t1_users != t2_users else 'POTENTIAL ISSUE!'}")
            print("="*60)
            
            # The test passes if data is different between tenants
            assert t1_leads != t2_leads or t1_users != t2_users, \
                "Data counts are identical between tenants - possible isolation issue!"
        
        assert "login_error" not in results["tenant1"], f"Tenant 1 login failed: {results['tenant1'].get('login_error')}"
        assert "login_error" not in results["tenant2"], f"Tenant 2 login failed: {results['tenant2'].get('login_error')}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
