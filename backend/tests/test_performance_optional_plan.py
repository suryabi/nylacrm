"""
Test Performance Tracker - Optional Plan and Leads Navigation Features
Tests:
1. GET /api/performance/all-sales-resources - returns resources with territory/city info
2. GET /api/performance/generate - works WITHOUT plan_id (target=0)
3. GET /api/performance/generate - works WITH plan_id (target from plan)
4. GET /api/leads - accepts target_closure_month and target_closure_year params
5. GET /api/leads - accepts comma-separated assigned_to values
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


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # Login returns session_token not token
    token = data.get("session_token") or data.get("token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def headers(auth_token):
    """Get headers with auth token and tenant"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestAllSalesResources:
    """Test GET /api/performance/all-sales-resources endpoint"""
    
    def test_all_sales_resources_returns_200(self, headers):
        """Test endpoint returns 200 status"""
        response = requests.get(
            f"{BASE_URL}/api/performance/all-sales-resources",
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_all_sales_resources_returns_list(self, headers):
        """Test endpoint returns a list of resources"""
        response = requests.get(
            f"{BASE_URL}/api/performance/all-sales-resources",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
    
    def test_all_sales_resources_structure(self, headers):
        """Test each resource has required fields: resource_id, resource_name, territory_id, city"""
        response = requests.get(
            f"{BASE_URL}/api/performance/all-sales-resources",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            resource = data[0]
            assert "resource_id" in resource, f"Missing resource_id in {resource}"
            assert "resource_name" in resource, f"Missing resource_name in {resource}"
            assert "territory_id" in resource, f"Missing territory_id in {resource}"
            assert "city" in resource, f"Missing city in {resource}"
            print(f"Sample resource: {resource}")


class TestGenerateWithoutPlan:
    """Test GET /api/performance/generate without plan_id (optional plan)"""
    
    def test_generate_without_plan_returns_200(self, headers):
        """Test generate works without plan_id"""
        # First get a resource ID
        res_response = requests.get(
            f"{BASE_URL}/api/performance/all-sales-resources",
            headers=headers
        )
        assert res_response.status_code == 200
        resources = res_response.json()
        
        if len(resources) == 0:
            pytest.skip("No resources available for testing")
        
        resource_id = resources[0]["resource_id"]
        
        # Generate without plan_id
        response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "resource_id": resource_id,
                "month": 1,
                "year": 2026
            },
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_generate_without_plan_target_is_zero(self, headers):
        """Test generate without plan returns target=0"""
        res_response = requests.get(
            f"{BASE_URL}/api/performance/all-sales-resources",
            headers=headers
        )
        resources = res_response.json()
        
        if len(resources) == 0:
            pytest.skip("No resources available for testing")
        
        resource_id = resources[0]["resource_id"]
        
        response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "resource_id": resource_id,
                "month": 1,
                "year": 2026
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Without plan, target should be 0
        assert "revenue" in data, f"Missing revenue in response: {data.keys()}"
        assert data["revenue"]["target"] == 0, f"Expected target=0 without plan, got {data['revenue']['target']}"
        print(f"Generate without plan - target: {data['revenue']['target']}")


class TestGenerateWithPlan:
    """Test GET /api/performance/generate with plan_id"""
    
    def test_generate_with_plan_returns_200(self, headers):
        """Test generate works with plan_id"""
        # Get resources for the plan
        res_response = requests.get(
            f"{BASE_URL}/api/performance/resources-for-plan/{PLAN_ID}",
            headers=headers
        )
        
        if res_response.status_code != 200 or len(res_response.json()) == 0:
            # Fallback to all-sales-resources
            res_response = requests.get(
                f"{BASE_URL}/api/performance/all-sales-resources",
                headers=headers
            )
        
        resources = res_response.json()
        if len(resources) == 0:
            pytest.skip("No resources available for testing")
        
        resource_id = resources[0].get("resource_id") or resources[0].get("id")
        
        response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "resource_id": resource_id,
                "plan_id": PLAN_ID,
                "month": 1,
                "year": 2026
            },
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_generate_with_plan_has_target(self, headers):
        """Test generate with plan returns target from plan (may be 0 if no allocation)"""
        res_response = requests.get(
            f"{BASE_URL}/api/performance/resources-for-plan/{PLAN_ID}",
            headers=headers
        )
        
        if res_response.status_code != 200 or len(res_response.json()) == 0:
            res_response = requests.get(
                f"{BASE_URL}/api/performance/all-sales-resources",
                headers=headers
            )
        
        resources = res_response.json()
        if len(resources) == 0:
            pytest.skip("No resources available for testing")
        
        resource_id = resources[0].get("resource_id") or resources[0].get("id")
        
        response = requests.get(
            f"{BASE_URL}/api/performance/generate",
            params={
                "resource_id": resource_id,
                "plan_id": PLAN_ID,
                "month": 1,
                "year": 2026
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "revenue" in data
        assert "target" in data["revenue"]
        # Target can be 0 if resource has no allocation in plan, but field must exist
        print(f"Generate with plan - target: {data['revenue']['target']}")


class TestLeadsTargetClosureFilter:
    """Test GET /api/leads with target_closure_month and target_closure_year params"""
    
    def test_leads_accepts_target_closure_params(self, headers):
        """Test leads endpoint accepts target_closure_month and target_closure_year"""
        response = requests.get(
            f"{BASE_URL}/api/leads",
            params={
                "target_closure_month": 5,
                "target_closure_year": 2026,
                "page": 1,
                "page_size": 10
            },
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_leads_returns_paginated_response(self, headers):
        """Test leads with target_closure returns proper paginated response"""
        response = requests.get(
            f"{BASE_URL}/api/leads",
            params={
                "target_closure_month": 5,
                "target_closure_year": 2026,
                "page": 1,
                "page_size": 10
            },
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "data" in data, f"Missing 'data' in response: {data.keys()}"
        assert "total" in data, f"Missing 'total' in response: {data.keys()}"
        assert "page" in data, f"Missing 'page' in response: {data.keys()}"
        assert "total_pages" in data, f"Missing 'total_pages' in response: {data.keys()}"
        
        print(f"Leads with target_closure filter - total: {data['total']}, page: {data['page']}")


class TestLeadsAssignedToMultiple:
    """Test GET /api/leads with comma-separated assigned_to values"""
    
    def test_leads_accepts_comma_separated_assigned_to(self, headers):
        """Test leads endpoint accepts comma-separated assigned_to values"""
        # Get some user IDs
        users_response = requests.get(
            f"{BASE_URL}/api/users",
            headers=headers
        )
        
        if users_response.status_code != 200 or len(users_response.json()) < 2:
            pytest.skip("Need at least 2 users for this test")
        
        users = users_response.json()
        user_ids = [u["id"] for u in users[:2]]
        assigned_to_param = ",".join(user_ids)
        
        response = requests.get(
            f"{BASE_URL}/api/leads",
            params={
                "assigned_to": assigned_to_param,
                "page": 1,
                "page_size": 10
            },
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Leads with multiple assigned_to - total: {data['total']}")


class TestCombinedFilters:
    """Test combined filters: target_closure + assigned_to"""
    
    def test_leads_combined_filters(self, headers):
        """Test leads with both target_closure and assigned_to filters"""
        # Get a user ID
        users_response = requests.get(
            f"{BASE_URL}/api/users",
            headers=headers
        )
        
        if users_response.status_code != 200 or len(users_response.json()) == 0:
            pytest.skip("No users available for testing")
        
        users = users_response.json()
        user_id = users[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/leads",
            params={
                "target_closure_month": 5,
                "target_closure_year": 2026,
                "assigned_to": user_id,
                "page": 1,
                "page_size": 10
            },
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Leads with combined filters - total: {data['total']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
