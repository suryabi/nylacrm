"""
Performance Tracker Feature Tests
Tests for:
1. Next Month Pipeline tile (dynamic month name)
2. Account Metrics with display_value (avg sales → estimated → manual override)
3. Account value override POST/DELETE endpoints
4. Leads Targeting Next Month navigation params
5. Pipeline status rows navigation
6. Revenue override fields in save endpoint
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"
PLAN_ID = "813fbe91-8434-4bd6-bc7b-49bd1ebca9b5"
BENGALURU_RESOURCE_IDS = "0ac4067e-e75e-4b24-8016-c3b5b6759bc3,a4abf0ac-3dd3-432e-b5d5-af08e5bf8da1"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "tenant_id": TENANT_ID},
        headers={"Content-Type": "application/json", "X-Tenant-ID": TENANT_ID}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # Login returns session_token not token
    token = data.get("session_token") or data.get("token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    """Headers with auth"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestPerformanceGenerateEndpoint:
    """Test /api/performance/generate endpoint returns correct structure"""
    
    def test_generate_returns_next_month_pipeline_fields(self, headers):
        """Verify generate endpoint returns next_month, next_month_pipeline_value, next_month_leads_count"""
        response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": PLAN_ID,
                "resource_id": BENGALURU_RESOURCE_IDS,
                "month": 3,
                "year": 2026
            },
            headers=headers
        )
        assert response.status_code == 200, f"Generate failed: {response.text}"
        data = response.json()
        
        # Verify pipeline structure exists
        assert "pipeline" in data, "Missing pipeline in response"
        pipeline = data["pipeline"]
        
        # Verify next month fields exist
        assert "next_month" in pipeline, "Missing pipeline.next_month"
        assert "next_month_pipeline_value" in pipeline, "Missing pipeline.next_month_pipeline_value"
        assert "next_month_leads_count" in pipeline, "Missing pipeline.next_month_leads_count"
        assert "next_year" in pipeline, "Missing pipeline.next_year"
        
        # For March 2026, next month should be April (4)
        assert pipeline["next_month"] == 4, f"Expected next_month=4 for March, got {pipeline['next_month']}"
        assert pipeline["next_year"] == 2026, f"Expected next_year=2026, got {pipeline['next_year']}"
        
        # Values should be numbers
        assert isinstance(pipeline["next_month_pipeline_value"], (int, float)), "next_month_pipeline_value should be numeric"
        assert isinstance(pipeline["next_month_leads_count"], int), "next_month_leads_count should be int"
        
        print(f"✓ Next month pipeline: {pipeline['next_month_leads_count']} leads, ₹{pipeline['next_month_pipeline_value']}")
    
    def test_generate_returns_account_display_value(self, headers):
        """Verify accounts have display_value field (avg_sales → estimated_value → manual_value)"""
        response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": PLAN_ID,
                "resource_id": BENGALURU_RESOURCE_IDS,
                "month": 3,
                "year": 2026
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify accounts structure
        assert "accounts" in data, "Missing accounts in response"
        accounts = data["accounts"]
        
        assert "existing_accounts" in accounts, "Missing existing_accounts"
        assert "new_accounts" in accounts, "Missing new_accounts"
        
        # Check structure of account objects (if any exist)
        for acc_list_name in ["existing_accounts", "new_accounts"]:
            acc_list = accounts.get(acc_list_name, [])
            for acc in acc_list[:3]:  # Check first 3
                assert "id" in acc, f"Account missing id in {acc_list_name}"
                assert "name" in acc, f"Account missing name in {acc_list_name}"
                assert "display_value" in acc, f"Account missing display_value in {acc_list_name}"
                assert "avg_sales" in acc, f"Account missing avg_sales in {acc_list_name}"
                assert "estimated_value" in acc, f"Account missing estimated_value in {acc_list_name}"
                # manual_value can be None
                assert "manual_value" in acc, f"Account missing manual_value key in {acc_list_name}"
                
                print(f"✓ Account {acc['name']}: display_value=₹{acc['display_value']}, avg_sales=₹{acc['avg_sales']}, estimated=₹{acc['estimated_value']}, manual={acc['manual_value']}")
        
        print(f"✓ Existing accounts: {accounts['existing_count']}, New accounts: {accounts['new_onboarded']}")
    
    def test_generate_returns_pipeline_by_status(self, headers):
        """Verify pipeline.by_status for clickable rows"""
        response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": PLAN_ID,
                "resource_id": BENGALURU_RESOURCE_IDS,
                "month": 3,
                "year": 2026
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        pipeline = data.get("pipeline", {})
        by_status = pipeline.get("by_status", [])
        
        # Each status row should have status, count, value
        for row in by_status:
            assert "status" in row, "Status row missing status field"
            assert "count" in row, "Status row missing count field"
            assert "value" in row, "Status row missing value field"
            print(f"✓ Pipeline status: {row['status']} - {row['count']} leads, ₹{row['value']}")


class TestAccountValueOverrideEndpoints:
    """Test POST/DELETE /api/performance/account-value-override"""
    
    def test_create_account_value_override(self, headers):
        """POST /api/performance/account-value-override creates override"""
        test_account_id = "test-acc-override-001"
        test_value = 50000
        
        response = requests.post(
            f"{BASE_URL}/api/performance/account-value-override",
            json={
                "account_id": test_account_id,
                "value": test_value,
                "plan_id": PLAN_ID
            },
            headers=headers
        )
        assert response.status_code == 200, f"Create override failed: {response.text}"
        data = response.json()
        assert "message" in data, "Response missing message"
        print(f"✓ Created account value override: {data}")
    
    def test_delete_account_value_override(self, headers):
        """DELETE /api/performance/account-value-override removes override"""
        test_account_id = "test-acc-override-001"
        
        response = requests.delete(
            f"{BASE_URL}/api/performance/account-value-override",
            params={
                "account_id": test_account_id,
                "plan_id": PLAN_ID
            },
            headers=headers
        )
        assert response.status_code == 200, f"Delete override failed: {response.text}"
        data = response.json()
        assert "message" in data, "Response missing message"
        print(f"✓ Deleted account value override: {data}")
    
    def test_override_validation_requires_fields(self, headers):
        """POST without required fields should fail"""
        # Missing account_id
        response = requests.post(
            f"{BASE_URL}/api/performance/account-value-override",
            json={"value": 1000, "plan_id": PLAN_ID},
            headers=headers
        )
        assert response.status_code == 400, "Should fail without account_id"
        
        # Missing value
        response = requests.post(
            f"{BASE_URL}/api/performance/account-value-override",
            json={"account_id": "test", "plan_id": PLAN_ID},
            headers=headers
        )
        assert response.status_code == 400, "Should fail without value"
        
        # Missing plan_id
        response = requests.post(
            f"{BASE_URL}/api/performance/account-value-override",
            json={"account_id": "test", "value": 1000},
            headers=headers
        )
        assert response.status_code == 400, "Should fail without plan_id"
        
        print("✓ Validation correctly rejects incomplete requests")


class TestSaveEndpointRevenueOverrides:
    """Test /api/performance/save endpoint with revenue override fields"""
    
    def test_save_with_revenue_overrides(self, headers):
        """Save endpoint accepts revenue override fields"""
        # Use a single resource for save
        single_resource = BENGALURU_RESOURCE_IDS.split(",")[0]
        
        response = requests.post(
            f"{BASE_URL}/api/performance/save",
            json={
                "plan_id": PLAN_ID,
                "resource_id": single_resource,
                "month": 3,
                "year": 2026,
                "resource_name": "Test Resource",
                "status": "draft",
                "support_needed": [],
                "remarks": "Test save with revenue overrides",
                "revenue_lifetime_override": 100000,
                "revenue_this_month_override": 25000,
                "revenue_new_accounts_override": 5000,
                "revenue_achieved": 20000,
                "monthly_target": 50000,
                "achievement_pct": 40,
                "existing_accounts": 10,
                "new_accounts": 2,
                "pipeline_value": 75000,
                "total_outstanding": 15000,
                "visits": 20,
                "calls": 50
            },
            headers=headers
        )
        assert response.status_code == 200, f"Save failed: {response.text}"
        data = response.json()
        assert "id" in data, "Response missing id"
        assert data.get("status") == "draft", f"Expected draft status, got {data.get('status')}"
        print(f"✓ Saved performance record with revenue overrides: {data['id']}")
        
        # Verify the overrides are returned in generate
        gen_response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "plan_id": PLAN_ID,
                "resource_id": single_resource,
                "month": 3,
                "year": 2026
            },
            headers=headers
        )
        assert gen_response.status_code == 200
        gen_data = gen_response.json()
        
        saved_record = gen_data.get("saved_record", {})
        if saved_record:
            assert saved_record.get("revenue_lifetime_override") == 100000, "Lifetime override not saved"
            assert saved_record.get("revenue_this_month_override") == 25000, "This month override not saved"
            assert saved_record.get("revenue_new_accounts_override") == 5000, "New accounts override not saved"
            print("✓ Revenue overrides correctly persisted and returned")


class TestComparisonEndpoint:
    """Test /api/performance/comparison endpoint"""
    
    def test_comparison_returns_months_data(self, headers):
        """Comparison endpoint returns month-on-month data"""
        response = requests.get(
            f"{BASE_URL}/api/performance/comparison",
            params={
                "resource_id": BENGALURU_RESOURCE_IDS,
                "plan_id": PLAN_ID,
                "months": 3,
                "month": 3,
                "year": 2026
            },
            headers=headers
        )
        assert response.status_code == 200, f"Comparison failed: {response.text}"
        data = response.json()
        
        assert "months" in data, "Missing months in response"
        months = data["months"]
        assert len(months) == 3, f"Expected 3 months, got {len(months)}"
        
        for m in months:
            assert "month" in m, "Month data missing month field"
            assert "year" in m, "Month data missing year field"
            assert "label" in m, "Month data missing label field"
            assert "revenue_achieved" in m, "Month data missing revenue_achieved"
            assert "monthly_target" in m, "Month data missing monthly_target"
            print(f"✓ Comparison month: {m['label']} - Revenue: ₹{m['revenue_achieved']}, Target: ₹{m['monthly_target']}")


class TestResourcesForPlan:
    """Test /api/performance/resources-for-plan endpoint"""
    
    def test_get_resources_for_plan(self, headers):
        """Get resources allocated to a plan"""
        response = requests.get(
            f"{BASE_URL}/api/performance/resources-for-plan/{PLAN_ID}",
            headers=headers
        )
        assert response.status_code == 200, f"Get resources failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        
        # Check for Bengaluru resources
        bengaluru_resources = [r for r in data if r.get("city") == "Bengaluru"]
        print(f"✓ Found {len(data)} resources, {len(bengaluru_resources)} in Bengaluru")
        
        for r in bengaluru_resources[:3]:
            assert "resource_id" in r, "Resource missing resource_id"
            assert "resource_name" in r, "Resource missing resource_name"
            print(f"  - {r.get('resource_name')} ({r.get('resource_id')[:8]}...)")


class TestTargetPlans:
    """Test /api/performance/target-plans endpoint"""
    
    def test_get_target_plans(self, headers):
        """Get available target plans"""
        response = requests.get(
            f"{BASE_URL}/api/performance/target-plans",
            headers=headers
        )
        assert response.status_code == 200, f"Get plans failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should have at least one plan"
        
        # Find our test plan
        test_plan = next((p for p in data if p.get("id") == PLAN_ID), None)
        assert test_plan is not None, f"Test plan {PLAN_ID} not found"
        print(f"✓ Found test plan: {test_plan.get('name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
