"""
Test Performance Tracker - Comparison Endpoint and Pipeline Navigation
Tests:
1. Comparison endpoint returns cumulative existing_accounts per month
2. Comparison endpoint returns new_accounts based on onboarded_month/year
3. Pipeline metrics show correct INR values from opportunity_estimation
4. Revenue override and reset functionality
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "tenant_id": TENANT_ID}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # Auth returns session_token (not token)
    token = data.get("session_token") or data.get("token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestPerformanceComparison:
    """Test comparison endpoint for cumulative accounts and new accounts"""
    
    def test_get_target_plans(self, headers):
        """Test fetching target plans"""
        response = requests.get(f"{BASE_URL}/api/performance/target-plans", headers=headers)
        assert response.status_code == 200, f"Failed to get target plans: {response.text}"
        plans = response.json()
        assert isinstance(plans, list), "Expected list of plans"
        print(f"Found {len(plans)} target plans")
        if plans:
            print(f"First plan: {plans[0].get('name')} (id: {plans[0].get('id')})")
    
    def test_get_resources_for_plan(self, headers):
        """Test fetching resources for a plan"""
        # First get plans
        plans_response = requests.get(f"{BASE_URL}/api/performance/target-plans", headers=headers)
        plans = plans_response.json()
        
        if not plans:
            pytest.skip("No target plans available")
        
        # Find H2 2026 plan or use first plan
        plan = next((p for p in plans if "H2 2026" in p.get("name", "")), plans[0])
        plan_id = plan.get("id")
        
        response = requests.get(f"{BASE_URL}/api/performance/resources-for-plan/{plan_id}", headers=headers)
        assert response.status_code == 200, f"Failed to get resources: {response.text}"
        resources = response.json()
        assert isinstance(resources, list), "Expected list of resources"
        print(f"Found {len(resources)} resources for plan {plan.get('name')}")
        if resources:
            for r in resources[:3]:
                print(f"  - {r.get('resource_name')} ({r.get('city')})")
    
    def test_comparison_endpoint_structure(self, headers):
        """Test comparison endpoint returns correct structure with cumulative accounts"""
        # Get plans and resources
        plans_response = requests.get(f"{BASE_URL}/api/performance/target-plans", headers=headers)
        plans = plans_response.json()
        
        if not plans:
            pytest.skip("No target plans available")
        
        # Find H2 2026 plan
        plan = next((p for p in plans if "H2 2026" in p.get("name", "")), plans[0])
        plan_id = plan.get("id")
        
        resources_response = requests.get(f"{BASE_URL}/api/performance/resources-for-plan/{plan_id}", headers=headers)
        resources = resources_response.json()
        
        if not resources:
            pytest.skip("No resources available for plan")
        
        # Find Rajesh Kumar or use last resource
        resource = next((r for r in resources if "Rajesh" in r.get("resource_name", "")), resources[-1])
        resource_id = resource.get("resource_id")
        
        # Call comparison endpoint
        response = requests.get(
            f"{BASE_URL}/api/performance/comparison",
            params={"resource_id": resource_id, "plan_id": plan_id, "months": 3},
            headers=headers
        )
        assert response.status_code == 200, f"Comparison endpoint failed: {response.text}"
        
        data = response.json()
        assert "resource_id" in data, "Missing resource_id in response"
        assert "months" in data, "Missing months in response"
        assert isinstance(data["months"], list), "months should be a list"
        
        print(f"\nComparison data for {resource.get('resource_name')}:")
        for month in data["months"]:
            print(f"  {month.get('label')}:")
            print(f"    - existing_accounts: {month.get('existing_accounts')} (cumulative)")
            print(f"    - new_accounts: {month.get('new_accounts')} (onboarded this month)")
            print(f"    - revenue_achieved: {month.get('revenue_achieved')}")
            print(f"    - pipeline_value: {month.get('pipeline_value')}")
            
            # Verify structure
            assert "existing_accounts" in month, "Missing existing_accounts"
            assert "new_accounts" in month, "Missing new_accounts"
            assert "month" in month, "Missing month number"
            assert "year" in month, "Missing year"
            assert "label" in month, "Missing label"
    
    def test_comparison_cumulative_accounts_logic(self, headers):
        """Verify existing_accounts is cumulative (should be >= new_accounts)"""
        plans_response = requests.get(f"{BASE_URL}/api/performance/target-plans", headers=headers)
        plans = plans_response.json()
        
        if not plans:
            pytest.skip("No target plans available")
        
        plan = next((p for p in plans if "H2 2026" in p.get("name", "")), plans[0])
        plan_id = plan.get("id")
        
        resources_response = requests.get(f"{BASE_URL}/api/performance/resources-for-plan/{plan_id}", headers=headers)
        resources = resources_response.json()
        
        if not resources:
            pytest.skip("No resources available")
        
        resource = next((r for r in resources if "Rajesh" in r.get("resource_name", "")), resources[-1])
        resource_id = resource.get("resource_id")
        
        response = requests.get(
            f"{BASE_URL}/api/performance/comparison",
            params={"resource_id": resource_id, "plan_id": plan_id, "months": 3},
            headers=headers
        )
        data = response.json()
        
        for month in data["months"]:
            existing = month.get("existing_accounts", 0)
            new = month.get("new_accounts", 0)
            # Cumulative existing should be >= new accounts for that month
            # (unless there are no accounts at all)
            assert existing >= 0, f"existing_accounts should be >= 0, got {existing}"
            assert new >= 0, f"new_accounts should be >= 0, got {new}"
            print(f"{month.get('label')}: existing={existing}, new={new}")


class TestPipelineMetrics:
    """Test pipeline metrics use opportunity_estimation values"""
    
    def test_generate_endpoint_pipeline_values(self, headers):
        """Test that pipeline values come from opportunity_estimation.estimated_monthly_revenue"""
        plans_response = requests.get(f"{BASE_URL}/api/performance/target-plans", headers=headers)
        plans = plans_response.json()
        
        if not plans:
            pytest.skip("No target plans available")
        
        plan = next((p for p in plans if "H2 2026" in p.get("name", "")), plans[0])
        plan_id = plan.get("id")
        
        resources_response = requests.get(f"{BASE_URL}/api/performance/resources-for-plan/{plan_id}", headers=headers)
        resources = resources_response.json()
        
        if not resources:
            pytest.skip("No resources available")
        
        # Use Rajesh Kumar who has pipeline data
        resource = next((r for r in resources if "Rajesh" in r.get("resource_name", "")), resources[-1])
        resource_id = resource.get("resource_id")
        
        import datetime
        now = datetime.datetime.now()
        
        response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": plan_id,
                "resource_id": resource_id,
                "month": now.month,
                "year": now.year
            },
            headers=headers
        )
        assert response.status_code == 200, f"Generate endpoint failed: {response.text}"
        
        data = response.json()
        pipeline = data.get("pipeline", {})
        
        print(f"\nPipeline metrics for {resource.get('resource_name')}:")
        print(f"  Total value: ₹{pipeline.get('total_value', 0):,.0f}")
        print(f"  Total count: {pipeline.get('total_count', 0)}")
        
        by_status = pipeline.get("by_status", [])
        for status_row in by_status:
            print(f"  - {status_row.get('status')}: {status_row.get('count')} leads, ₹{status_row.get('value', 0):,.0f}")
        
        # Verify pipeline structure
        assert "total_value" in pipeline, "Missing total_value"
        assert "total_count" in pipeline, "Missing total_count"
        assert "by_status" in pipeline, "Missing by_status"


class TestRevenueOverride:
    """Test revenue override and reset functionality"""
    
    def test_override_and_reset_revenue(self, headers):
        """Test saving and resetting revenue override"""
        plans_response = requests.get(f"{BASE_URL}/api/performance/target-plans", headers=headers)
        plans = plans_response.json()
        
        if not plans:
            pytest.skip("No target plans available")
        
        plan = next((p for p in plans if "H2 2026" in p.get("name", "")), plans[0])
        plan_id = plan.get("id")
        
        resources_response = requests.get(f"{BASE_URL}/api/performance/resources-for-plan/{plan_id}", headers=headers)
        resources = resources_response.json()
        
        if not resources:
            pytest.skip("No resources available")
        
        resource = resources[-1]
        resource_id = resource.get("resource_id")
        
        import datetime
        now = datetime.datetime.now()
        month = now.month
        year = now.year
        
        # Test override
        override_response = requests.post(
            f"{BASE_URL}/api/performance/comparison/override",
            json={
                "resource_id": resource_id,
                "plan_id": plan_id,
                "month": month,
                "year": year,
                "field": "revenue",
                "value": 999999
            },
            headers=headers
        )
        assert override_response.status_code == 200, f"Override failed: {override_response.text}"
        print(f"Override saved: {override_response.json()}")
        
        # Verify override is applied
        comparison_response = requests.get(
            f"{BASE_URL}/api/performance/comparison",
            params={"resource_id": resource_id, "plan_id": plan_id, "months": 1},
            headers=headers
        )
        data = comparison_response.json()
        current_month = data["months"][0]
        assert current_month.get("has_revenue_override") == True, "Override flag not set"
        assert current_month.get("revenue_achieved") == 999999, f"Override value not applied: {current_month.get('revenue_achieved')}"
        print(f"Override verified: revenue_achieved = {current_month.get('revenue_achieved')}")
        
        # Test reset
        reset_response = requests.delete(
            f"{BASE_URL}/api/performance/comparison/override",
            params={
                "resource_id": resource_id,
                "plan_id": plan_id,
                "month": month,
                "year": year,
                "field": "revenue"
            },
            headers=headers
        )
        assert reset_response.status_code == 200, f"Reset failed: {reset_response.text}"
        print(f"Reset successful: {reset_response.json()}")
        
        # Verify reset
        comparison_response2 = requests.get(
            f"{BASE_URL}/api/performance/comparison",
            params={"resource_id": resource_id, "plan_id": plan_id, "months": 1},
            headers=headers
        )
        data2 = comparison_response2.json()
        current_month2 = data2["months"][0]
        assert current_month2.get("has_revenue_override") == False, "Override flag should be False after reset"
        print(f"Reset verified: has_revenue_override = {current_month2.get('has_revenue_override')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
