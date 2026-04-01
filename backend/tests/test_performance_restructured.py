"""
Test Performance Tracker Restructured Features:
1. Lead model with target_closure_month/year fields
2. Performance /generate endpoint returns restructured data:
   - revenue.lifetime, revenue.this_month, revenue.from_new_accounts
   - pipeline.by_status, pipeline.total_value, pipeline.next_month_leads_count
   - accounts from accounts collection (not leads)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"


class TestPerformanceRestructured:
    """Test restructured Performance Tracker API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        login_data = login_response.json()
        token = login_data.get("session_token") or login_data.get("token")
        if not token:
            pytest.skip("No token in login response")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token
        
        # Get a target plan and resource for testing
        plans_response = self.session.get(f"{BASE_URL}/api/performance/target-plans")
        if plans_response.status_code == 200 and plans_response.json():
            self.plan_id = plans_response.json()[0].get("id")
            
            # Get resources for this plan
            resources_response = self.session.get(f"{BASE_URL}/api/performance/resources-for-plan/{self.plan_id}")
            if resources_response.status_code == 200 and resources_response.json():
                self.resource_id = resources_response.json()[0].get("resource_id")
            else:
                self.resource_id = None
        else:
            self.plan_id = None
            self.resource_id = None
    
    # ============ LEAD MODEL TESTS ============
    
    def test_lead_update_with_target_closure_fields(self):
        """Test that lead update API accepts target_closure_month and target_closure_year"""
        # First get a lead to update
        leads_response = self.session.get(f"{BASE_URL}/api/leads?page=1&page_size=1")
        assert leads_response.status_code == 200, f"Failed to get leads: {leads_response.text}"
        
        leads_data = leads_response.json()
        if not leads_data.get("data"):
            pytest.skip("No leads available for testing")
        
        lead_id = leads_data["data"][0]["id"]
        
        # Update lead with target closure fields
        update_data = {
            "target_closure_month": 2,  # February
            "target_closure_year": 2026
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/leads/{lead_id}", json=update_data)
        assert update_response.status_code == 200, f"Failed to update lead: {update_response.text}"
        
        # Verify the update persisted
        get_response = self.session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert get_response.status_code == 200
        
        lead_data = get_response.json()
        assert lead_data.get("target_closure_month") == 2, "target_closure_month not persisted"
        assert lead_data.get("target_closure_year") == 2026, "target_closure_year not persisted"
        
        print("✓ Lead update with target_closure_month/year works correctly")
    
    # ============ PERFORMANCE GENERATE TESTS ============
    
    def test_performance_generate_returns_revenue_structure(self):
        """Test /api/performance/generate returns revenue.lifetime, revenue.this_month, revenue.from_new_accounts"""
        if not self.plan_id or not self.resource_id:
            pytest.skip("No plan or resource available for testing")
        
        response = self.session.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": self.plan_id,
                "resource_id": self.resource_id,
                "month": 1,
                "year": 2026
            }
        )
        
        assert response.status_code == 200, f"Generate failed: {response.text}"
        data = response.json()
        
        # Check revenue structure
        assert "revenue" in data, "Missing 'revenue' key in response"
        revenue = data["revenue"]
        
        assert "lifetime" in revenue, "Missing 'revenue.lifetime'"
        assert "this_month" in revenue, "Missing 'revenue.this_month'"
        assert "from_new_accounts" in revenue, "Missing 'revenue.from_new_accounts'"
        assert "target" in revenue, "Missing 'revenue.target'"
        assert "achievement_pct" in revenue, "Missing 'revenue.achievement_pct'"
        
        # Verify types
        assert isinstance(revenue["lifetime"], (int, float)), "revenue.lifetime should be numeric"
        assert isinstance(revenue["this_month"], (int, float)), "revenue.this_month should be numeric"
        assert isinstance(revenue["from_new_accounts"], (int, float)), "revenue.from_new_accounts should be numeric"
        
        print(f"✓ Revenue structure correct: lifetime={revenue['lifetime']}, this_month={revenue['this_month']}, from_new_accounts={revenue['from_new_accounts']}")
    
    def test_performance_generate_returns_pipeline_structure(self):
        """Test /api/performance/generate returns pipeline.by_status, pipeline.total_value, pipeline.next_month_leads_count"""
        if not self.plan_id or not self.resource_id:
            pytest.skip("No plan or resource available for testing")
        
        response = self.session.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": self.plan_id,
                "resource_id": self.resource_id,
                "month": 1,
                "year": 2026
            }
        )
        
        assert response.status_code == 200, f"Generate failed: {response.text}"
        data = response.json()
        
        # Check pipeline structure
        assert "pipeline" in data, "Missing 'pipeline' key in response"
        pipeline = data["pipeline"]
        
        assert "by_status" in pipeline, "Missing 'pipeline.by_status'"
        assert "total_value" in pipeline, "Missing 'pipeline.total_value'"
        assert "total_count" in pipeline, "Missing 'pipeline.total_count'"
        assert "next_month_leads_count" in pipeline, "Missing 'pipeline.next_month_leads_count'"
        assert "next_month_pipeline_value" in pipeline, "Missing 'pipeline.next_month_pipeline_value'"
        assert "coverage_ratio" in pipeline, "Missing 'pipeline.coverage_ratio'"
        
        # Verify by_status is a list
        assert isinstance(pipeline["by_status"], list), "pipeline.by_status should be a list"
        
        # If there are status entries, verify structure
        if pipeline["by_status"]:
            status_entry = pipeline["by_status"][0]
            assert "status" in status_entry, "Status entry missing 'status' field"
            assert "count" in status_entry, "Status entry missing 'count' field"
            assert "value" in status_entry, "Status entry missing 'value' field"
        
        print(f"✓ Pipeline structure correct: total_value={pipeline['total_value']}, total_count={pipeline['total_count']}, by_status has {len(pipeline['by_status'])} entries")
    
    def test_performance_generate_returns_accounts_from_accounts_collection(self):
        """Test /api/performance/generate returns accounts from accounts collection (not leads)"""
        if not self.plan_id or not self.resource_id:
            pytest.skip("No plan or resource available for testing")
        
        response = self.session.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": self.plan_id,
                "resource_id": self.resource_id,
                "month": 1,
                "year": 2026
            }
        )
        
        assert response.status_code == 200, f"Generate failed: {response.text}"
        data = response.json()
        
        # Check accounts structure
        assert "accounts" in data, "Missing 'accounts' key in response"
        accounts = data["accounts"]
        
        assert "existing_count" in accounts, "Missing 'accounts.existing_count'"
        assert "existing_accounts" in accounts, "Missing 'accounts.existing_accounts'"
        assert "new_onboarded" in accounts, "Missing 'accounts.new_onboarded'"
        assert "new_accounts" in accounts, "Missing 'accounts.new_accounts'"
        
        # Verify types
        assert isinstance(accounts["existing_count"], int), "accounts.existing_count should be int"
        assert isinstance(accounts["existing_accounts"], list), "accounts.existing_accounts should be list"
        assert isinstance(accounts["new_onboarded"], int), "accounts.new_onboarded should be int"
        assert isinstance(accounts["new_accounts"], list), "accounts.new_accounts should be list"
        
        print(f"✓ Accounts structure correct: existing_count={accounts['existing_count']}, new_onboarded={accounts['new_onboarded']}")
    
    def test_pipeline_excludes_certain_statuses(self):
        """Test that pipeline excludes won, active_customer, not_qualified, lost statuses"""
        if not self.plan_id or not self.resource_id:
            pytest.skip("No plan or resource available for testing")
        
        response = self.session.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": self.plan_id,
                "resource_id": self.resource_id,
                "month": 1,
                "year": 2026
            }
        )
        
        assert response.status_code == 200, f"Generate failed: {response.text}"
        data = response.json()
        
        pipeline = data.get("pipeline", {})
        by_status = pipeline.get("by_status", [])
        
        excluded_statuses = ["won", "active_customer", "not_qualified", "lost"]
        
        for entry in by_status:
            status = entry.get("status", "")
            assert status not in excluded_statuses, f"Pipeline should not include '{status}' status"
        
        print(f"✓ Pipeline correctly excludes won/active_customer/not_qualified/lost statuses")
    
    def test_performance_generate_endpoint_exists(self):
        """Test that /api/performance/generate endpoint exists and responds"""
        if not self.plan_id or not self.resource_id:
            pytest.skip("No plan or resource available for testing")
        
        response = self.session.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": self.plan_id,
                "resource_id": self.resource_id,
                "month": 1,
                "year": 2026
            }
        )
        
        assert response.status_code == 200, f"Generate endpoint failed: {response.status_code} - {response.text}"
        
        data = response.json()
        
        # Verify all main sections exist
        required_sections = ["revenue", "accounts", "pipeline", "collections", "activities", "calculated"]
        for section in required_sections:
            assert section in data, f"Missing '{section}' section in response"
        
        print(f"✓ Performance generate endpoint returns all required sections")
    
    def test_lead_create_with_target_closure_fields(self):
        """Test that lead create API accepts target_closure_month and target_closure_year"""
        # Create a test lead with target closure fields
        lead_data = {
            "company": "TEST_TargetClosure_Company",
            "city": "Mumbai",
            "state": "Maharashtra",
            "region": "West India",
            "country": "India",
            "status": "new",
            "target_closure_month": 3,  # March
            "target_closure_year": 2026
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/leads", json=lead_data)
        assert create_response.status_code in [200, 201], f"Failed to create lead: {create_response.text}"
        
        created_lead = create_response.json()
        lead_id = created_lead.get("id")
        
        # Verify the fields were saved
        get_response = self.session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert get_response.status_code == 200
        
        lead = get_response.json()
        assert lead.get("target_closure_month") == 3, "target_closure_month not saved on create"
        assert lead.get("target_closure_year") == 2026, "target_closure_year not saved on create"
        
        # Cleanup - delete the test lead
        self.session.delete(f"{BASE_URL}/api/leads/{lead_id}")
        
        print("✓ Lead create with target_closure_month/year works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
