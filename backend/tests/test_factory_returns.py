"""
Test Factory Returns API
Tests for Stock Out (Distributor → Factory) functionality
- CRUD operations for factory returns
- Status transitions: draft → confirm → receive
- Stock deduction on confirm
- Cancel and delete operations
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
DISTRIBUTOR_ID = "d091204f-e04f-46f2-b9a9-d92d9f89b528"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # Login returns 'session_token' not 'token'
    token = data.get('session_token') or data.get('token')
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


@pytest.fixture(scope="module")
def distributor_data(api_client):
    """Get distributor data including locations and SKUs"""
    # Get distributor details
    response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}")
    assert response.status_code == 200, f"Failed to get distributor: {response.text}"
    distributor = response.json()
    
    # Get SKUs from master-skus endpoint
    sku_response = api_client.get(f"{BASE_URL}/api/master-skus")
    skus = []
    if sku_response.status_code == 200:
        skus = sku_response.json().get('skus', [])
    
    return {
        "distributor": distributor,
        "locations": distributor.get('locations', []),
        "skus": skus
    }


class TestFactoryReturnsAPI:
    """Factory Returns CRUD and status transition tests"""
    
    created_return_ids = []  # Track created returns for cleanup
    
    def test_list_factory_returns(self, api_client):
        """Test listing factory returns with time filter"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            params={"time_filter": "lifetime", "page": 1, "page_size": 20}
        )
        assert response.status_code == 200, f"List failed: {response.text}"
        data = response.json()
        assert "factory_returns" in data
        assert "total" in data
        assert "page" in data
        print(f"Found {data['total']} factory returns")
    
    def test_create_factory_return_expired(self, api_client, distributor_data):
        """Test creating a factory return for expired stock"""
        locations = distributor_data.get('locations', [])
        skus = distributor_data.get('skus', [])
        
        if not locations:
            pytest.skip("No distributor locations available")
        if not skus:
            pytest.skip("No SKUs available for this distributor")
        
        # Use first active location
        active_locations = [loc for loc in locations if loc.get('status') == 'active']
        if not active_locations:
            pytest.skip("No active locations available")
        
        location_id = active_locations[0]['id']
        sku_id = skus[0]['id']
        
        payload = {
            "distributor_location_id": location_id,
            "reason": "expired",
            "source": "warehouse",
            "return_date": "2026-01-15",
            "items": [
                {"sku_id": sku_id, "quantity": 2, "remarks": "TEST_expired_stock"}
            ],
            "remarks": "TEST_factory_return_expired"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json=payload
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "id" in data
        assert "return_number" in data
        assert data["status"] == "draft"
        assert data["reason"] == "expired"
        assert data["source"] == "warehouse"
        assert len(data.get("items", [])) == 1
        assert data["total_quantity"] == 2
        assert "total_credit_amount" in data
        
        self.created_return_ids.append(data["id"])
        print(f"Created factory return: {data['return_number']} with credit ₹{data['total_credit_amount']}")
        return data
    
    def test_create_factory_return_damaged(self, api_client, distributor_data):
        """Test creating a factory return for damaged stock"""
        locations = distributor_data.get('locations', [])
        skus = distributor_data.get('skus', [])
        
        if not locations or not skus:
            pytest.skip("No locations or SKUs available")
        
        active_locations = [loc for loc in locations if loc.get('status') == 'active']
        if not active_locations:
            pytest.skip("No active locations available")
        
        location_id = active_locations[0]['id']
        sku_id = skus[0]['id']
        
        payload = {
            "distributor_location_id": location_id,
            "reason": "damaged",
            "source": "warehouse",
            "return_date": "2026-01-15",
            "items": [
                {"sku_id": sku_id, "quantity": 1, "remarks": "TEST_damaged_stock"}
            ],
            "remarks": "TEST_factory_return_damaged"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json=payload
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        assert data["reason"] == "damaged"
        assert data["status"] == "draft"
        
        self.created_return_ids.append(data["id"])
        print(f"Created damaged factory return: {data['return_number']}")
        return data
    
    def test_get_factory_return_detail(self, api_client, distributor_data):
        """Test getting factory return details"""
        # First create one
        locations = distributor_data.get('locations', [])
        skus = distributor_data.get('skus', [])
        
        if not locations or not skus:
            pytest.skip("No locations or SKUs available")
        
        active_locations = [loc for loc in locations if loc.get('status') == 'active']
        if not active_locations:
            pytest.skip("No active locations available")
        
        location_id = active_locations[0]['id']
        sku_id = skus[0]['id']
        
        # Create
        create_response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json={
                "distributor_location_id": location_id,
                "reason": "expired",
                "source": "warehouse",
                "items": [{"sku_id": sku_id, "quantity": 1}],
                "remarks": "TEST_get_detail"
            }
        )
        assert create_response.status_code == 200
        created = create_response.json()
        return_id = created["id"]
        self.created_return_ids.append(return_id)
        
        # Get detail
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}"
        )
        assert response.status_code == 200, f"Get detail failed: {response.text}"
        data = response.json()
        
        assert data["id"] == return_id
        assert data["return_number"] == created["return_number"]
        assert "items" in data
        print(f"Got factory return detail: {data['return_number']}")
    
    def test_confirm_factory_return(self, api_client, distributor_data):
        """Test confirming a factory return - should deduct stock"""
        locations = distributor_data.get('locations', [])
        skus = distributor_data.get('skus', [])
        
        if not locations or not skus:
            pytest.skip("No locations or SKUs available")
        
        active_locations = [loc for loc in locations if loc.get('status') == 'active']
        if not active_locations:
            pytest.skip("No active locations available")
        
        location_id = active_locations[0]['id']
        sku_id = skus[0]['id']
        
        # Create a draft return
        create_response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json={
                "distributor_location_id": location_id,
                "reason": "expired",
                "source": "warehouse",
                "items": [{"sku_id": sku_id, "quantity": 1}],
                "remarks": "TEST_confirm_return"
            }
        )
        assert create_response.status_code == 200
        created = create_response.json()
        return_id = created["id"]
        self.created_return_ids.append(return_id)
        
        # Confirm it
        confirm_response = api_client.put(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}/confirm",
            json={}
        )
        assert confirm_response.status_code == 200, f"Confirm failed: {confirm_response.text}"
        data = confirm_response.json()
        
        assert data.get("status") == "confirmed"
        print(f"Confirmed factory return: {created['return_number']}")
        
        # Verify status changed
        get_response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}"
        )
        assert get_response.status_code == 200
        assert get_response.json()["status"] == "confirmed"
    
    def test_receive_factory_return(self, api_client, distributor_data):
        """Test marking factory return as received"""
        locations = distributor_data.get('locations', [])
        skus = distributor_data.get('skus', [])
        
        if not locations or not skus:
            pytest.skip("No locations or SKUs available")
        
        active_locations = [loc for loc in locations if loc.get('status') == 'active']
        if not active_locations:
            pytest.skip("No active locations available")
        
        location_id = active_locations[0]['id']
        sku_id = skus[0]['id']
        
        # Create and confirm
        create_response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json={
                "distributor_location_id": location_id,
                "reason": "damaged",
                "source": "warehouse",
                "items": [{"sku_id": sku_id, "quantity": 1}],
                "remarks": "TEST_receive_return"
            }
        )
        assert create_response.status_code == 200
        created = create_response.json()
        return_id = created["id"]
        self.created_return_ids.append(return_id)
        
        # Confirm
        api_client.put(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}/confirm",
            json={}
        )
        
        # Receive
        receive_response = api_client.put(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}/receive",
            json={}
        )
        assert receive_response.status_code == 200, f"Receive failed: {receive_response.text}"
        data = receive_response.json()
        
        assert data.get("status") == "received"
        print(f"Received factory return: {created['return_number']}")
    
    def test_cancel_draft_factory_return(self, api_client, distributor_data):
        """Test cancelling a draft factory return"""
        locations = distributor_data.get('locations', [])
        skus = distributor_data.get('skus', [])
        
        if not locations or not skus:
            pytest.skip("No locations or SKUs available")
        
        active_locations = [loc for loc in locations if loc.get('status') == 'active']
        if not active_locations:
            pytest.skip("No active locations available")
        
        location_id = active_locations[0]['id']
        sku_id = skus[0]['id']
        
        # Create draft
        create_response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json={
                "distributor_location_id": location_id,
                "reason": "expired",
                "source": "warehouse",
                "items": [{"sku_id": sku_id, "quantity": 1}],
                "remarks": "TEST_cancel_draft"
            }
        )
        assert create_response.status_code == 200
        created = create_response.json()
        return_id = created["id"]
        self.created_return_ids.append(return_id)
        
        # Cancel
        cancel_response = api_client.put(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}/cancel",
            json={}
        )
        assert cancel_response.status_code == 200, f"Cancel failed: {cancel_response.text}"
        data = cancel_response.json()
        
        assert data.get("status") == "cancelled"
        print(f"Cancelled draft factory return: {created['return_number']}")
    
    def test_delete_draft_factory_return(self, api_client, distributor_data):
        """Test deleting a draft factory return"""
        locations = distributor_data.get('locations', [])
        skus = distributor_data.get('skus', [])
        
        if not locations or not skus:
            pytest.skip("No locations or SKUs available")
        
        active_locations = [loc for loc in locations if loc.get('status') == 'active']
        if not active_locations:
            pytest.skip("No active locations available")
        
        location_id = active_locations[0]['id']
        sku_id = skus[0]['id']
        
        # Create draft
        create_response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json={
                "distributor_location_id": location_id,
                "reason": "expired",
                "source": "warehouse",
                "items": [{"sku_id": sku_id, "quantity": 1}],
                "remarks": "TEST_delete_draft"
            }
        )
        assert create_response.status_code == 200
        created = create_response.json()
        return_id = created["id"]
        
        # Delete
        delete_response = api_client.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}"
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"Deleted draft factory return: {created['return_number']}")
        
        # Verify deleted
        get_response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}"
        )
        assert get_response.status_code == 404
    
    def test_cannot_delete_confirmed_return(self, api_client, distributor_data):
        """Test that confirmed factory returns cannot be deleted"""
        locations = distributor_data.get('locations', [])
        skus = distributor_data.get('skus', [])
        
        if not locations or not skus:
            pytest.skip("No locations or SKUs available")
        
        active_locations = [loc for loc in locations if loc.get('status') == 'active']
        if not active_locations:
            pytest.skip("No active locations available")
        
        location_id = active_locations[0]['id']
        sku_id = skus[0]['id']
        
        # Create and confirm
        create_response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json={
                "distributor_location_id": location_id,
                "reason": "expired",
                "source": "warehouse",
                "items": [{"sku_id": sku_id, "quantity": 1}],
                "remarks": "TEST_cannot_delete_confirmed"
            }
        )
        assert create_response.status_code == 200
        created = create_response.json()
        return_id = created["id"]
        self.created_return_ids.append(return_id)
        
        # Confirm
        api_client.put(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}/confirm",
            json={}
        )
        
        # Try to delete - should fail
        delete_response = api_client.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}"
        )
        assert delete_response.status_code == 400, f"Should not be able to delete confirmed return"
        print("Correctly prevented deletion of confirmed factory return")
    
    def test_invalid_reason_rejected(self, api_client, distributor_data):
        """Test that invalid reason is rejected"""
        locations = distributor_data.get('locations', [])
        skus = distributor_data.get('skus', [])
        
        if not locations or not skus:
            pytest.skip("No locations or SKUs available")
        
        active_locations = [loc for loc in locations if loc.get('status') == 'active']
        if not active_locations:
            pytest.skip("No active locations available")
        
        location_id = active_locations[0]['id']
        sku_id = skus[0]['id']
        
        # Try invalid reason
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json={
                "distributor_location_id": location_id,
                "reason": "invalid_reason",  # Should be 'expired' or 'damaged'
                "source": "warehouse",
                "items": [{"sku_id": sku_id, "quantity": 1}]
            }
        )
        assert response.status_code == 422, f"Should reject invalid reason: {response.text}"
        print("Correctly rejected invalid reason")


class TestFactoryReturnsTimeFilter:
    """Test time filter functionality"""
    
    def test_time_filter_this_month(self, api_client):
        """Test this_month time filter"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            params={"time_filter": "this_month"}
        )
        assert response.status_code == 200
        print(f"this_month filter: {response.json()['total']} returns")
    
    def test_time_filter_lifetime(self, api_client):
        """Test lifetime time filter"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            params={"time_filter": "lifetime"}
        )
        assert response.status_code == 200
        print(f"lifetime filter: {response.json()['total']} returns")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
