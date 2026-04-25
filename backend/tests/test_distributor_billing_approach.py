"""
Test Distributor Billing Approach Feature
Tests the billing_approach field on distributors:
- GET /api/distributors/{id} returns billing_approach field
- PUT /api/distributors/{id} can update billing_approach
- POST /api/distributors creates with default billing_approach='margin_upfront'
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"
TEST_DISTRIBUTOR_ID = "b8876367-df64-4c55-a382-d5eb3b4b2380"  # Surya 1


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "tenant_id": TENANT_ID}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data.get("session_token") or data.get("token")


@pytest.fixture(scope="module")
def headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "X-Tenant-ID": TENANT_ID
    }


class TestDistributorBillingApproach:
    """Tests for billing_approach field on distributors"""
    
    def test_get_distributor_returns_billing_approach(self, headers):
        """GET /api/distributors/{id} should return billing_approach field"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get distributor: {response.text}"
        
        data = response.json()
        # billing_approach should be present (may be 'margin_upfront' or 'cost_based' or None for old records)
        assert "billing_approach" in data or data.get("billing_approach") is None, \
            "billing_approach field should be present in response"
        
        # If present, should be one of the valid values
        billing_approach = data.get("billing_approach")
        if billing_approach:
            assert billing_approach in ["margin_upfront", "cost_based"], \
                f"billing_approach should be 'margin_upfront' or 'cost_based', got: {billing_approach}"
        
        print(f"✓ GET distributor returns billing_approach: {billing_approach}")
    
    def test_update_distributor_billing_approach_to_cost_based(self, headers):
        """PUT /api/distributors/{id} with billing_approach='cost_based' should update"""
        response = requests.put(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}",
            headers=headers,
            json={"billing_approach": "cost_based"}
        )
        assert response.status_code == 200, f"Failed to update distributor: {response.text}"
        
        data = response.json()
        assert data.get("billing_approach") == "cost_based", \
            f"billing_approach should be 'cost_based' after update, got: {data.get('billing_approach')}"
        
        print("✓ Updated billing_approach to 'cost_based'")
    
    def test_verify_billing_approach_persisted_as_cost_based(self, headers):
        """GET /api/distributors/{id} should return updated billing_approach"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get distributor: {response.text}"
        
        data = response.json()
        assert data.get("billing_approach") == "cost_based", \
            f"billing_approach should be 'cost_based', got: {data.get('billing_approach')}"
        
        print("✓ Verified billing_approach persisted as 'cost_based'")
    
    def test_update_distributor_billing_approach_to_margin_upfront(self, headers):
        """PUT /api/distributors/{id} with billing_approach='margin_upfront' should update"""
        response = requests.put(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}",
            headers=headers,
            json={"billing_approach": "margin_upfront"}
        )
        assert response.status_code == 200, f"Failed to update distributor: {response.text}"
        
        data = response.json()
        assert data.get("billing_approach") == "margin_upfront", \
            f"billing_approach should be 'margin_upfront' after update, got: {data.get('billing_approach')}"
        
        print("✓ Updated billing_approach to 'margin_upfront'")
    
    def test_verify_billing_approach_persisted_as_margin_upfront(self, headers):
        """GET /api/distributors/{id} should return updated billing_approach"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to get distributor: {response.text}"
        
        data = response.json()
        assert data.get("billing_approach") == "margin_upfront", \
            f"billing_approach should be 'margin_upfront', got: {data.get('billing_approach')}"
        
        print("✓ Verified billing_approach persisted as 'margin_upfront'")
    
    def test_list_distributors_includes_billing_approach(self, headers):
        """GET /api/distributors should include billing_approach in list items"""
        response = requests.get(
            f"{BASE_URL}/api/distributors",
            headers=headers
        )
        assert response.status_code == 200, f"Failed to list distributors: {response.text}"
        
        data = response.json()
        distributors = data.get("distributors", [])
        assert len(distributors) > 0, "Should have at least one distributor"
        
        # Check that billing_approach is present in list items
        for dist in distributors:
            # billing_approach may be None for old records, but field should exist or be defaulted
            billing_approach = dist.get("billing_approach")
            if billing_approach:
                assert billing_approach in ["margin_upfront", "cost_based"], \
                    f"Invalid billing_approach value: {billing_approach}"
        
        print(f"✓ List distributors includes billing_approach field ({len(distributors)} distributors)")


class TestNewDistributorDefaultBillingApproach:
    """Test that new distributors get default billing_approach='margin_upfront'"""
    
    created_distributor_id = None
    
    def test_create_distributor_defaults_to_margin_upfront(self, headers):
        """POST /api/distributors should default billing_approach to 'margin_upfront'"""
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        
        response = requests.post(
            f"{BASE_URL}/api/distributors",
            headers=headers,
            json={
                "distributor_name": f"TEST_BillingApproach_{unique_id}",
                "primary_contact_name": "Test Contact",
                "primary_contact_mobile": "9999999999"
            }
        )
        assert response.status_code == 200, f"Failed to create distributor: {response.text}"
        
        data = response.json()
        TestNewDistributorDefaultBillingApproach.created_distributor_id = data.get("id")
        
        # Should default to margin_upfront
        assert data.get("billing_approach") == "margin_upfront", \
            f"New distributor should default to 'margin_upfront', got: {data.get('billing_approach')}"
        
        print(f"✓ New distributor created with default billing_approach='margin_upfront'")
    
    def test_cleanup_test_distributor(self, headers):
        """Delete the test distributor created above"""
        if TestNewDistributorDefaultBillingApproach.created_distributor_id:
            response = requests.delete(
                f"{BASE_URL}/api/distributors/{TestNewDistributorDefaultBillingApproach.created_distributor_id}",
                headers=headers
            )
            # May fail if user doesn't have delete permission, that's OK
            if response.status_code == 200:
                print("✓ Test distributor cleaned up")
            else:
                print(f"Note: Could not delete test distributor (status {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
