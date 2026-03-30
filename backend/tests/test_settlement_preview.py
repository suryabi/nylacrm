"""
Test Settlement Preview Endpoint
Tests the new GET /api/distributors/{id}/settlement-preview endpoint
that returns deliveries, credit_notes, factory_returns with summary
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_ID = "nyla-air-water"
DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
        headers={"X-Tenant-ID": TENANT_ID}
    )
    if response.status_code == 200:
        data = response.json()
        # API returns session_token, not access_token
        return data.get("session_token") or data.get("access_token")
    pytest.skip("Authentication failed")

@pytest.fixture
def api_client(auth_token):
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    })
    return session


class TestSettlementPreviewEndpoint:
    """Tests for GET /api/distributors/{id}/settlement-preview"""
    
    def test_settlement_preview_returns_200(self, api_client):
        """Test that settlement-preview endpoint returns 200 with valid params"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlement-preview",
            params={"month": 1, "year": 2026}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASSED: Settlement preview endpoint returns 200")
    
    def test_settlement_preview_response_structure(self, api_client):
        """Test that response has correct structure with deliveries, credit_notes, factory_returns, summary"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlement-preview",
            params={"month": 1, "year": 2026}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level keys
        assert "deliveries" in data, "Response missing 'deliveries' key"
        assert "credit_notes" in data, "Response missing 'credit_notes' key"
        assert "factory_returns" in data, "Response missing 'factory_returns' key"
        assert "summary" in data, "Response missing 'summary' key"
        
        # Check deliveries is a list
        assert isinstance(data["deliveries"], list), "deliveries should be a list"
        
        # Check credit_notes is a list
        assert isinstance(data["credit_notes"], list), "credit_notes should be a list"
        
        # Check factory_returns is a list
        assert isinstance(data["factory_returns"], list), "factory_returns should be a list"
        
        print("PASSED: Response has correct structure with deliveries, credit_notes, factory_returns, summary")
    
    def test_settlement_preview_summary_fields(self, api_client):
        """Test that summary contains all required fields"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlement-preview",
            params={"month": 1, "year": 2026}
        )
        assert response.status_code == 200
        data = response.json()
        summary = data.get("summary", {})
        
        # Check summary fields
        required_fields = [
            "total_deliveries",
            "total_delivery_amount",
            "total_credit_notes",
            "total_credit_note_amount",
            "total_factory_returns",
            "total_factory_return_amount"
        ]
        
        for field in required_fields:
            assert field in summary, f"Summary missing '{field}' field"
        
        # Check types
        assert isinstance(summary["total_deliveries"], int), "total_deliveries should be int"
        assert isinstance(summary["total_credit_notes"], int), "total_credit_notes should be int"
        assert isinstance(summary["total_factory_returns"], int), "total_factory_returns should be int"
        assert isinstance(summary["total_delivery_amount"], (int, float)), "total_delivery_amount should be numeric"
        assert isinstance(summary["total_credit_note_amount"], (int, float)), "total_credit_note_amount should be numeric"
        assert isinstance(summary["total_factory_return_amount"], (int, float)), "total_factory_return_amount should be numeric"
        
        print(f"PASSED: Summary has all required fields: {summary}")
    
    def test_settlement_preview_different_months(self, api_client):
        """Test settlement preview for different months"""
        for month in [1, 6, 12]:
            response = api_client.get(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlement-preview",
                params={"month": month, "year": 2025}
            )
            assert response.status_code == 200, f"Failed for month {month}"
        print("PASSED: Settlement preview works for different months")
    
    def test_settlement_preview_invalid_distributor(self, api_client):
        """Test settlement preview with invalid distributor ID"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/invalid-id-12345/settlement-preview",
            params={"month": 1, "year": 2026}
        )
        # Should return 200 with empty data or 404
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"PASSED: Invalid distributor returns {response.status_code}")
    
    def test_settlement_preview_missing_params(self, api_client):
        """Test settlement preview without required params"""
        # Missing month
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlement-preview",
            params={"year": 2026}
        )
        assert response.status_code == 422, f"Expected 422 for missing month, got {response.status_code}"
        
        # Missing year
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlement-preview",
            params={"month": 1}
        )
        assert response.status_code == 422, f"Expected 422 for missing year, got {response.status_code}"
        
        print("PASSED: Missing params return 422 validation error")


class TestSettlementPreviewDataIntegrity:
    """Tests for data integrity in settlement preview"""
    
    def test_deliveries_have_items(self, api_client):
        """Test that deliveries include items array"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlement-preview",
            params={"month": 1, "year": 2026}
        )
        assert response.status_code == 200
        data = response.json()
        
        # If there are deliveries, check they have items
        for delivery in data.get("deliveries", []):
            assert "items" in delivery, "Delivery missing 'items' field"
            assert isinstance(delivery["items"], list), "Delivery items should be a list"
        
        print(f"PASSED: {len(data.get('deliveries', []))} deliveries checked for items field")
    
    def test_credit_notes_have_required_fields(self, api_client):
        """Test that credit notes have required fields"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlement-preview",
            params={"month": 1, "year": 2026}
        )
        assert response.status_code == 200
        data = response.json()
        
        # If there are credit notes, check required fields
        for cn in data.get("credit_notes", []):
            assert "id" in cn, "Credit note missing 'id'"
            # Check for amount field (could be original_amount or total_amount)
            has_amount = "original_amount" in cn or "total_amount" in cn or "amount" in cn
            assert has_amount, "Credit note missing amount field"
        
        print(f"PASSED: {len(data.get('credit_notes', []))} credit notes checked")
    
    def test_factory_returns_have_required_fields(self, api_client):
        """Test that factory returns have required fields"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlement-preview",
            params={"month": 1, "year": 2026}
        )
        assert response.status_code == 200
        data = response.json()
        
        # If there are factory returns, check required fields
        for fr in data.get("factory_returns", []):
            assert "id" in fr, "Factory return missing 'id'"
            assert "total_credit_amount" in fr or "return_number" in fr, "Factory return missing key fields"
        
        print(f"PASSED: {len(data.get('factory_returns', []))} factory returns checked")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
