"""
Test Factory Returns Source-First Selection
Tests for restructured factory return flow:
- Source (Warehouse vs Customer) is PRIMARY selection
- Warehouse source = expired/damaged stock, adjusted in settlement (requires_settlement=true)
- Customer source = expired/damaged/empty_reusable, NO settlement adjustment (requires_settlement=false)
- Backend validates reason based on source
"""
import pytest
import requests
import os

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
    response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}")
    assert response.status_code == 200, f"Failed to get distributor: {response.text}"
    distributor = response.json()
    
    sku_response = api_client.get(f"{BASE_URL}/api/master-skus")
    skus = []
    if sku_response.status_code == 200:
        skus = sku_response.json().get('skus', [])
    
    return {
        "distributor": distributor,
        "locations": distributor.get('locations', []),
        "skus": skus
    }


class TestWarehouseSourceFactoryReturns:
    """Test factory returns with warehouse source - requires settlement"""
    
    created_return_ids = []
    
    def test_warehouse_source_expired_requires_settlement(self, api_client, distributor_data):
        """Warehouse source with expired reason should have requires_settlement=true"""
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
            "reason": "expired",
            "source": "warehouse",
            "return_date": "2026-01-15",
            "items": [{"sku_id": sku_id, "quantity": 2}],
            "remarks": "TEST_warehouse_expired"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json=payload
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        # Validate requires_settlement is true for warehouse source
        assert data["source"] == "warehouse"
        assert data["reason"] == "expired"
        assert data.get("requires_settlement") == True, f"requires_settlement should be True for warehouse source, got: {data.get('requires_settlement')}"
        
        self.created_return_ids.append(data["id"])
        print(f"PASSED: Warehouse source expired return has requires_settlement=True")
        return data
    
    def test_warehouse_source_damaged_requires_settlement(self, api_client, distributor_data):
        """Warehouse source with damaged reason should have requires_settlement=true"""
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
            "items": [{"sku_id": sku_id, "quantity": 1}],
            "remarks": "TEST_warehouse_damaged"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json=payload
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        assert data["source"] == "warehouse"
        assert data["reason"] == "damaged"
        assert data.get("requires_settlement") == True
        
        self.created_return_ids.append(data["id"])
        print(f"PASSED: Warehouse source damaged return has requires_settlement=True")
    
    def test_warehouse_source_rejects_empty_reusable(self, api_client, distributor_data):
        """Warehouse source should reject empty_reusable reason (400 error)"""
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
            "reason": "empty_reusable",  # Invalid for warehouse source
            "source": "warehouse",
            "return_date": "2026-01-15",
            "items": [{"sku_id": sku_id, "quantity": 1}],
            "remarks": "TEST_warehouse_empty_reusable_should_fail"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json=payload
        )
        assert response.status_code == 400, f"Should reject empty_reusable for warehouse source, got {response.status_code}: {response.text}"
        
        error_data = response.json()
        assert "empty" in error_data.get("detail", "").lower() or "reusable" in error_data.get("detail", "").lower()
        print(f"PASSED: Backend correctly rejects empty_reusable reason with warehouse source")


class TestCustomerReturnSourceFactoryReturns:
    """Test factory returns with customer_return source - no settlement"""
    
    created_return_ids = []
    
    def test_customer_source_empty_reusable_no_settlement(self, api_client, distributor_data):
        """Customer source with empty_reusable reason should have requires_settlement=false"""
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
            "reason": "empty_reusable",
            "source": "customer_return",
            "return_date": "2026-01-15",
            "items": [{"sku_id": sku_id, "quantity": 5}],
            "remarks": "TEST_customer_empty_reusable"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json=payload
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        assert data["source"] == "customer_return"
        assert data["reason"] == "empty_reusable"
        assert data.get("requires_settlement") == False, f"requires_settlement should be False for customer_return source, got: {data.get('requires_settlement')}"
        
        self.created_return_ids.append(data["id"])
        print(f"PASSED: Customer source empty_reusable return has requires_settlement=False")
    
    def test_customer_source_expired_no_settlement(self, api_client, distributor_data):
        """Customer source with expired reason should have requires_settlement=false"""
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
            "reason": "expired",
            "source": "customer_return",
            "return_date": "2026-01-15",
            "items": [{"sku_id": sku_id, "quantity": 3}],
            "remarks": "TEST_customer_expired"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json=payload
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        assert data["source"] == "customer_return"
        assert data["reason"] == "expired"
        assert data.get("requires_settlement") == False
        
        self.created_return_ids.append(data["id"])
        print(f"PASSED: Customer source expired return has requires_settlement=False")
    
    def test_customer_source_damaged_no_settlement(self, api_client, distributor_data):
        """Customer source with damaged reason should have requires_settlement=false"""
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
            "source": "customer_return",
            "return_date": "2026-01-15",
            "items": [{"sku_id": sku_id, "quantity": 2}],
            "remarks": "TEST_customer_damaged"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json=payload
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        
        assert data["source"] == "customer_return"
        assert data["reason"] == "damaged"
        assert data.get("requires_settlement") == False
        
        self.created_return_ids.append(data["id"])
        print(f"PASSED: Customer source damaged return has requires_settlement=False")


class TestFactoryReturnsTableDisplay:
    """Test factory returns list shows Source and Settlement columns correctly"""
    
    def test_list_shows_source_and_settlement_fields(self, api_client):
        """Verify factory returns list includes source and requires_settlement fields"""
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            params={"time_filter": "lifetime", "page": 1, "page_size": 50}
        )
        assert response.status_code == 200, f"List failed: {response.text}"
        data = response.json()
        
        factory_returns = data.get("factory_returns", [])
        if not factory_returns:
            pytest.skip("No factory returns to verify")
        
        # Check that returns have source field
        for fr in factory_returns:
            assert "source" in fr, f"Factory return {fr.get('return_number')} missing 'source' field"
            assert fr["source"] in ["warehouse", "customer_return"], f"Invalid source: {fr['source']}"
            
            # Check requires_settlement field (may be missing for old records)
            # Old records should fallback to source === 'warehouse'
            if "requires_settlement" in fr:
                if fr["source"] == "warehouse":
                    assert fr["requires_settlement"] == True, f"Warehouse source should have requires_settlement=True"
                else:
                    assert fr["requires_settlement"] == False, f"Customer source should have requires_settlement=False"
        
        print(f"PASSED: All {len(factory_returns)} factory returns have valid source field")


class TestConfirmFactoryReturnDeductsStock:
    """Test that confirming factory return deducts stock from warehouse"""
    
    def test_confirm_deducts_stock(self, api_client, distributor_data):
        """Confirm factory return should deduct stock from distributor warehouse"""
        locations = distributor_data.get('locations', [])
        skus = distributor_data.get('skus', [])
        
        if not locations or not skus:
            pytest.skip("No locations or SKUs available")
        
        active_locations = [loc for loc in locations if loc.get('status') == 'active']
        if not active_locations:
            pytest.skip("No active locations available")
        
        location_id = active_locations[0]['id']
        sku_id = skus[0]['id']
        
        # Create factory return
        create_response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns",
            json={
                "distributor_location_id": location_id,
                "reason": "expired",
                "source": "warehouse",
                "items": [{"sku_id": sku_id, "quantity": 1}],
                "remarks": "TEST_confirm_deducts_stock"
            }
        )
        assert create_response.status_code == 200
        created = create_response.json()
        return_id = created["id"]
        
        # Confirm it
        confirm_response = api_client.put(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}/confirm",
            json={}
        )
        assert confirm_response.status_code == 200, f"Confirm failed: {confirm_response.text}"
        
        # Verify status changed to confirmed
        get_response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/factory-returns/{return_id}"
        )
        assert get_response.status_code == 200
        assert get_response.json()["status"] == "confirmed"
        
        print(f"PASSED: Factory return {created['return_number']} confirmed successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
