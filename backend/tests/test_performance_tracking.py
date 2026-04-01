"""
Performance Tracking Module Tests
Tests for monthly performance tracking endpoints:
- GET /api/performance/target-plans
- GET /api/performance/resources-for-plan/{plan_id}
- GET /api/performance/generate
- POST /api/performance/save
- POST /api/performance/{id}/submit
- POST /api/performance/{id}/approve
- POST /api/performance/{id}/return
- GET /api/performance/comparison
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_ID = "nyla-air-water"

# Test credentials from test_credentials.md
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"

# Test data from review_request
TARGET_PLAN_ID = "2c224a54-8977-4e4a-9943-92e7da8b1b9e"
RESOURCE_ID = "cf4b8ac2-459d-4089-a2ba-de599f7f7407"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token - returns session_token field"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"X-Tenant-ID": TENANT_ID, "Content-Type": "application/json"}
    )
    if response.status_code == 200:
        data = response.json()
        # Auth returns session_token, not token
        token = data.get("session_token") or data.get("token")
        if token:
            return token
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def headers(auth_token):
    """Headers with auth token and tenant ID"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestPerformanceTargetPlans:
    """Tests for GET /api/performance/target-plans"""
    
    def test_get_target_plans_success(self, headers):
        """Should return list of target plans"""
        response = requests.get(f"{BASE_URL}/api/performance/target-plans", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check if we have at least one plan
        if len(data) > 0:
            plan = data[0]
            assert "id" in plan, "Plan should have id"
            assert "name" in plan, "Plan should have name"
            print(f"Found {len(data)} target plans")
            print(f"First plan: {plan.get('name')} (ID: {plan.get('id')})")
    
    def test_get_target_plans_unauthenticated(self):
        """Should return 401 without auth"""
        response = requests.get(
            f"{BASE_URL}/api/performance/target-plans",
            headers={"X-Tenant-ID": TENANT_ID}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestPerformanceResourcesForPlan:
    """Tests for GET /api/performance/resources-for-plan/{plan_id}"""
    
    def test_get_resources_for_plan_success(self, headers):
        """Should return resources allocated to a plan"""
        response = requests.get(
            f"{BASE_URL}/api/performance/resources-for-plan/{TARGET_PLAN_ID}",
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            resource = data[0]
            assert "resource_id" in resource, "Resource should have resource_id"
            assert "resource_name" in resource, "Resource should have resource_name"
            print(f"Found {len(data)} resources for plan {TARGET_PLAN_ID}")
            for r in data[:3]:
                print(f"  - {r.get('resource_name')} ({r.get('resource_id')})")
    
    def test_get_resources_for_invalid_plan(self, headers):
        """Should return empty list for non-existent plan"""
        fake_plan_id = str(uuid.uuid4())
        response = requests.get(
            f"{BASE_URL}/api/performance/resources-for-plan/{fake_plan_id}",
            headers=headers
        )
        # Should return 200 with empty list, not 404
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"


class TestPerformanceGenerate:
    """Tests for GET /api/performance/generate"""
    
    def test_generate_performance_success(self, headers):
        """Should generate performance metrics for a resource"""
        response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": TARGET_PLAN_ID,
                "resource_id": RESOURCE_ID,
                "month": 3,
                "year": 2026
            },
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check required top-level fields
        assert "resource_id" in data, "Should have resource_id"
        assert "resource_name" in data, "Should have resource_name"
        assert "month" in data, "Should have month"
        assert "year" in data, "Should have year"
        assert "plan_id" in data, "Should have plan_id"
        assert "monthly_target" in data, "Should have monthly_target"
        
        # Check revenue metrics
        assert "revenue" in data, "Should have revenue section"
        revenue = data["revenue"]
        assert "achieved" in revenue, "Revenue should have achieved"
        assert "target" in revenue, "Revenue should have target"
        assert "achievement_pct" in revenue, "Revenue should have achievement_pct"
        assert "from_new_accounts" in revenue, "Revenue should have from_new_accounts"
        assert "from_existing_accounts" in revenue, "Revenue should have from_existing_accounts"
        
        # Check accounts metrics
        assert "accounts" in data, "Should have accounts section"
        accounts = data["accounts"]
        assert "existing_count" in accounts, "Accounts should have existing_count"
        assert "new_onboarded" in accounts, "Accounts should have new_onboarded"
        assert "existing_accounts" in accounts, "Accounts should have existing_accounts list"
        assert "new_accounts" in accounts, "Accounts should have new_accounts list"
        
        # Check pipeline metrics
        assert "pipeline" in data, "Should have pipeline section"
        pipeline = data["pipeline"]
        assert "current_value" in pipeline, "Pipeline should have current_value"
        assert "current_count" in pipeline, "Pipeline should have current_count"
        assert "next_month_value" in pipeline, "Pipeline should have next_month_value"
        assert "coverage_ratio" in pipeline, "Pipeline should have coverage_ratio"
        
        # Check collections metrics
        assert "collections" in data, "Should have collections section"
        collections = data["collections"]
        assert "total_outstanding" in collections, "Collections should have total_outstanding"
        assert "aging" in collections, "Collections should have aging"
        assert "outstanding_ratio" in collections, "Collections should have outstanding_ratio"
        
        # Check activities metrics
        assert "activities" in data, "Should have activities section"
        activities = data["activities"]
        assert "visits" in activities, "Activities should have visits"
        assert "calls" in activities, "Activities should have calls"
        assert "follow_ups" in activities, "Activities should have follow_ups"
        
        # Check calculated KPIs
        assert "calculated" in data, "Should have calculated section"
        calculated = data["calculated"]
        assert "achievement_pct" in calculated, "Calculated should have achievement_pct"
        assert "pipeline_coverage" in calculated, "Calculated should have pipeline_coverage"
        assert "outstanding_ratio" in calculated, "Calculated should have outstanding_ratio"
        
        print(f"Generated metrics for {data.get('resource_name')}:")
        print(f"  Target: {data.get('monthly_target')}")
        print(f"  Revenue Achieved: {revenue.get('achieved')}")
        print(f"  Achievement %: {revenue.get('achievement_pct')}%")
        print(f"  Existing Accounts: {accounts.get('existing_count')}")
        print(f"  New Accounts: {accounts.get('new_onboarded')}")
        print(f"  Pipeline Value: {pipeline.get('current_value')}")
        print(f"  Outstanding: {collections.get('total_outstanding')}")
        print(f"  Visits: {activities.get('visits')}, Calls: {activities.get('calls')}")
    
    def test_generate_performance_invalid_plan(self, headers):
        """Should return 404 for non-existent plan"""
        fake_plan_id = str(uuid.uuid4())
        response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": fake_plan_id,
                "resource_id": RESOURCE_ID,
                "month": 3,
                "year": 2026
            },
            headers=headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_generate_performance_missing_params(self, headers):
        """Should return 422 for missing required params"""
        response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={"plan_id": TARGET_PLAN_ID},  # Missing resource_id, month, year
            headers=headers
        )
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"


class TestPerformanceSaveSubmitApproveReturn:
    """Tests for save/submit/approve/return workflow"""
    
    @pytest.fixture(scope="class")
    def saved_record_id(self, headers):
        """Save a performance record and return its ID"""
        # First generate metrics to get current data
        gen_response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": TARGET_PLAN_ID,
                "resource_id": RESOURCE_ID,
                "month": 1,  # Use January to avoid conflicts
                "year": 2026
            },
            headers=headers
        )
        if gen_response.status_code != 200:
            pytest.skip(f"Could not generate metrics: {gen_response.text}")
        
        metrics = gen_response.json()
        
        # Save the record
        save_payload = {
            "plan_id": TARGET_PLAN_ID,
            "resource_id": RESOURCE_ID,
            "month": 1,
            "year": 2026,
            "resource_name": metrics.get("resource_name", "Test Resource"),
            "status": "draft",
            "support_needed": ["Pricing", "Logistics"],
            "remarks": "Test remarks for performance tracking",
            "manual_revenue": 50000,
            "manual_visits": 10,
            "manual_calls": 20,
            "revenue_achieved": metrics.get("revenue", {}).get("achieved", 0),
            "monthly_target": metrics.get("revenue", {}).get("target", 0),
            "achievement_pct": metrics.get("revenue", {}).get("achievement_pct", 0),
            "existing_accounts": metrics.get("accounts", {}).get("existing_count", 0),
            "new_accounts": metrics.get("accounts", {}).get("new_onboarded", 0),
            "pipeline_value": metrics.get("pipeline", {}).get("current_value", 0),
            "total_outstanding": metrics.get("collections", {}).get("total_outstanding", 0),
            "visits": metrics.get("activities", {}).get("visits", 0),
            "calls": metrics.get("activities", {}).get("calls", 0),
        }
        
        response = requests.post(
            f"{BASE_URL}/api/performance/save",
            json=save_payload,
            headers=headers
        )
        assert response.status_code == 200, f"Save failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "id" in data, "Save response should have id"
        assert data.get("status") == "draft", "Status should be draft"
        
        print(f"Saved performance record: {data.get('id')}")
        return data["id"]
    
    def test_save_performance_success(self, headers, saved_record_id):
        """Should save performance record successfully"""
        # Record already saved in fixture
        assert saved_record_id is not None, "Record ID should exist"
        print(f"Record saved with ID: {saved_record_id}")
    
    def test_submit_performance_success(self, headers, saved_record_id):
        """Should submit performance record for review"""
        response = requests.post(
            f"{BASE_URL}/api/performance/{saved_record_id}/submit",
            headers=headers
        )
        assert response.status_code == 200, f"Submit failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should have message"
        print(f"Submitted record: {data.get('message')}")
    
    def test_return_performance_success(self, headers, saved_record_id):
        """Should return performance record for corrections"""
        response = requests.post(
            f"{BASE_URL}/api/performance/{saved_record_id}/return",
            json={"comments": "Please update the revenue figures"},
            headers=headers
        )
        assert response.status_code == 200, f"Return failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should have message"
        print(f"Returned record: {data.get('message')}")
    
    def test_resubmit_after_return(self, headers, saved_record_id):
        """Should be able to resubmit after return"""
        response = requests.post(
            f"{BASE_URL}/api/performance/{saved_record_id}/submit",
            headers=headers
        )
        assert response.status_code == 200, f"Resubmit failed: {response.status_code} - {response.text}"
        print("Resubmitted record successfully")
    
    def test_approve_performance_success(self, headers, saved_record_id):
        """Should approve submitted performance record"""
        response = requests.post(
            f"{BASE_URL}/api/performance/{saved_record_id}/approve",
            json={"comments": "Approved - good performance"},
            headers=headers
        )
        assert response.status_code == 200, f"Approve failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should have message"
        print(f"Approved record: {data.get('message')}")
    
    def test_cannot_edit_approved_record(self, headers, saved_record_id):
        """Should not be able to edit an approved record"""
        save_payload = {
            "plan_id": TARGET_PLAN_ID,
            "resource_id": RESOURCE_ID,
            "month": 1,
            "year": 2026,
            "resource_name": "Test Resource",
            "status": "draft",
            "remarks": "Trying to edit approved record",
        }
        
        response = requests.post(
            f"{BASE_URL}/api/performance/save",
            json=save_payload,
            headers=headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Correctly prevented editing approved record")
    
    def test_submit_invalid_record(self, headers):
        """Should return 400 for non-existent record"""
        fake_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/performance/{fake_id}/submit",
            headers=headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
    
    def test_approve_invalid_record(self, headers):
        """Should return 400 for non-existent record"""
        fake_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/performance/{fake_id}/approve",
            json={},
            headers=headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"


class TestPerformanceComparison:
    """Tests for GET /api/performance/comparison"""
    
    def test_get_comparison_success(self, headers):
        """Should return month-on-month comparison data"""
        response = requests.get(
            f"{BASE_URL}/api/performance/comparison",
            params={
                "resource_id": RESOURCE_ID,
                "plan_id": TARGET_PLAN_ID,
                "months": 3
            },
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "resource_id" in data, "Should have resource_id"
        assert "months" in data, "Should have months array"
        
        months = data["months"]
        assert isinstance(months, list), "Months should be a list"
        assert len(months) <= 3, "Should have at most 3 months"
        
        if len(months) > 0:
            month_data = months[0]
            assert "month" in month_data, "Month data should have month"
            assert "year" in month_data, "Month data should have year"
            assert "label" in month_data, "Month data should have label"
            assert "revenue_achieved" in month_data, "Month data should have revenue_achieved"
            assert "monthly_target" in month_data, "Month data should have monthly_target"
            assert "achievement_pct" in month_data, "Month data should have achievement_pct"
            assert "new_accounts" in month_data, "Month data should have new_accounts"
            assert "pipeline_value" in month_data, "Month data should have pipeline_value"
            assert "total_outstanding" in month_data, "Month data should have total_outstanding"
            assert "visits" in month_data, "Month data should have visits"
            assert "calls" in month_data, "Month data should have calls"
            
            print(f"Comparison data for {len(months)} months:")
            for m in months:
                print(f"  {m.get('label')}: Revenue={m.get('revenue_achieved')}, Target={m.get('monthly_target')}, Achievement={m.get('achievement_pct')}%")
    
    def test_comparison_missing_params(self, headers):
        """Should return 422 for missing required params"""
        response = requests.get(
            f"{BASE_URL}/api/performance/comparison",
            params={"resource_id": RESOURCE_ID},  # Missing plan_id
            headers=headers
        )
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"


class TestPerformanceSaveValidation:
    """Tests for save endpoint validation"""
    
    def test_save_missing_required_fields(self, headers):
        """Should return 400 for missing required fields"""
        response = requests.post(
            f"{BASE_URL}/api/performance/save",
            json={"remarks": "Missing required fields"},
            headers=headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Should have error detail"
        print(f"Validation error: {data.get('detail')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
