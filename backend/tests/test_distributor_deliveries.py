"""
Distributor-to-Account Delivery API Tests
Tests for the delivery module that records deliveries from distributors to end customer accounts
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data
DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"  # Test distributor


TENANT_ID = "nyla-air-water"  # Required for authentication


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        },
        headers={"X-Tenant-ID": TENANT_ID}
    )
    if response.status_code == 200:
        return response.json().get("session_token")
    print(f"Auth failed: {response.status_code} - {response.text}")
    pytest.skip("Authentication failed - skipping tests")


@pytest.fixture(scope="module")
def authenticated_client(auth_token):
    """Session with auth header and tenant"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json",
        "X-Tenant-ID": TENANT_ID
    })
    # Also set the session token as cookie
    session.cookies.set("session_token", auth_token)
    return session


@pytest.fixture(scope="module")
def distributor_info(authenticated_client):
    """Get distributor details including locations"""
    response = authenticated_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}")
    if response.status_code != 200:
        pytest.skip(f"Failed to get distributor info: {response.status_code}")
    return response.json()


@pytest.fixture(scope="module")
def sku_info(authenticated_client):
    """Get available SKUs"""
    response = authenticated_client.get(f"{BASE_URL}/api/master-skus")
    if response.status_code == 200:
        skus = response.json().get('skus', response.json())
        if skus and len(skus) > 0:
            return skus[0]  # Return first SKU
    pytest.skip("No SKUs available for testing")


@pytest.fixture(scope="module")
def assigned_accounts(authenticated_client):
    """Get accounts assigned to this distributor"""
    response = authenticated_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/assigned-accounts")
    if response.status_code == 200:
        return response.json().get('accounts', [])
    return []


class TestDeliveriesAPIEndpoints:
    """Test delivery API endpoints exist and return proper responses"""
    
    def test_list_deliveries_endpoint(self, authenticated_client):
        """Test that list deliveries endpoint exists"""
        response = authenticated_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "deliveries" in data, "Response should contain 'deliveries' key"
        assert "total" in data, "Response should contain 'total' key"
        print(f"Found {data['total']} existing deliveries")
    
    def test_deliveries_summary_endpoint(self, authenticated_client):
        """Test deliveries summary endpoint"""
        response = authenticated_client.get(f"{BASE_URL}/api/distributors/deliveries/summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "total" in data or "by_status" in data, "Summary should contain stats"
        print(f"Deliveries summary: {data}")
    
    def test_all_deliveries_endpoint(self, authenticated_client):
        """Test list all deliveries endpoint with filters"""
        response = authenticated_client.get(f"{BASE_URL}/api/distributors/deliveries/all")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "deliveries" in data, "Response should contain 'deliveries' key"
        print(f"Total deliveries across all distributors: {data.get('total', len(data.get('deliveries', [])))}")
    
    def test_assigned_accounts_endpoint(self, authenticated_client):
        """Test assigned accounts for delivery endpoint"""
        response = authenticated_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/assigned-accounts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "accounts" in data, "Response should contain 'accounts' key"
        accounts = data['accounts']
        print(f"Found {len(accounts)} assigned accounts for delivery")
        
        # Print account info if available
        for acc in accounts[:3]:  # Show first 3
            print(f"  - {acc.get('company', acc.get('name', 'Unknown'))} ({acc.get('city', 'N/A')})")


class TestDeliveryWorkflow:
    """Test full delivery workflow: create, confirm, complete"""
    
    @pytest.fixture
    def test_delivery(self, authenticated_client, distributor_info, sku_info, assigned_accounts):
        """Create a test delivery for workflow testing"""
        # Check if we have accounts assigned
        if not assigned_accounts:
            pytest.skip("No accounts assigned to this distributor - cannot test delivery creation")
        
        # Get first assigned account
        account = assigned_accounts[0]
        
        # Get distributor location
        locations = distributor_info.get('locations', [])
        if not locations:
            pytest.skip("No locations available for this distributor")
        
        location = locations[0]
        
        delivery_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "distributor_location_id": location['id'],
            "account_id": account['id'],
            "delivery_date": datetime.now().strftime("%Y-%m-%d"),
            "reference_number": f"TEST-DEL-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "vehicle_number": "TEST-VH-001",
            "driver_name": "Test Driver",
            "driver_contact": "9999999999",
            "remarks": "Test delivery for automated testing",
            "items": [
                {
                    "sku_id": sku_info['id'],
                    "sku_name": sku_info.get('name', 'Test SKU'),
                    "quantity": 10,
                    "unit_price": 100.0,
                    "discount_percent": 0,
                    "tax_percent": 18
                }
            ]
        }
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=delivery_data
        )
        
        if response.status_code != 200:
            pytest.skip(f"Failed to create test delivery: {response.status_code} - {response.text}")
        
        delivery = response.json()
        print(f"Created test delivery: {delivery.get('delivery_number')}")
        
        yield delivery
        
        # Cleanup - try to delete if still in draft
        if delivery.get('status') == 'draft':
            authenticated_client.delete(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery['id']}")
    
    def test_create_delivery_with_items(self, authenticated_client, distributor_info, sku_info, assigned_accounts):
        """Test creating a delivery with items"""
        if not assigned_accounts:
            pytest.skip("No accounts assigned to this distributor")
        
        account = assigned_accounts[0]
        locations = distributor_info.get('locations', [])
        if not locations:
            pytest.skip("No locations available")
        
        location = locations[0]
        
        delivery_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "distributor_location_id": location['id'],
            "account_id": account['id'],
            "delivery_date": datetime.now().strftime("%Y-%m-%d"),
            "reference_number": f"TEST-CREATE-{datetime.now().strftime('%H%M%S')}",
            "items": [
                {
                    "sku_id": sku_info['id'],
                    "sku_name": sku_info.get('name', 'Test SKU'),
                    "quantity": 5,
                    "unit_price": 200.0,
                    "discount_percent": 5,
                    "tax_percent": 18
                }
            ]
        }
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=delivery_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify delivery created
        assert "id" in data, "Delivery should have ID"
        assert "delivery_number" in data, "Delivery should have delivery_number"
        assert data.get('status') == 'draft', "New delivery should be in draft status"
        
        # Verify item calculations
        assert "items" in data or "total_quantity" in data, "Delivery should have items or totals"
        assert data.get('total_quantity', 0) > 0, "Should have total quantity"
        assert data.get('total_net_amount', 0) > 0, "Should have total net amount"
        
        print(f"Created delivery {data['delivery_number']}")
        print(f"  Status: {data['status']}")
        print(f"  Total Qty: {data.get('total_quantity')}")
        print(f"  Total Amount: {data.get('total_net_amount')}")
        
        # Verify amount calculation
        # Expected: 5 * 200 = 1000 gross, - 5% = 950 taxable, + 18% tax = 1121
        expected_gross = 5 * 200  # 1000
        expected_discount = expected_gross * 0.05  # 50
        expected_taxable = expected_gross - expected_discount  # 950
        expected_tax = expected_taxable * 0.18  # 171
        expected_net = expected_taxable + expected_tax  # 1121
        
        actual_net = data.get('total_net_amount', 0)
        # Allow small rounding difference
        assert abs(actual_net - expected_net) < 1, f"Expected net ~{expected_net}, got {actual_net}"
        
        # Cleanup
        authenticated_client.delete(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{data['id']}")
    
    def test_get_delivery_detail(self, authenticated_client, test_delivery):
        """Test getting delivery details"""
        delivery_id = test_delivery['id']
        
        response = authenticated_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data['id'] == delivery_id, "Should return correct delivery"
        assert "items" in data, "Detail should include items"
        assert len(data['items']) > 0, "Should have at least one item"
        
        # Check item has margin info
        item = data['items'][0]
        print(f"Delivery item: {item.get('sku_name')}")
        print(f"  Quantity: {item.get('quantity')}")
        print(f"  Net Amount: {item.get('net_amount')}")
        print(f"  Margin Type: {item.get('margin_type', 'N/A')}")
        print(f"  Margin Value: {item.get('margin_value', 'N/A')}")
        print(f"  Margin Amount: {item.get('margin_amount', 'N/A')}")
    
    def test_confirm_delivery(self, authenticated_client, test_delivery):
        """Test confirming a draft delivery"""
        delivery_id = test_delivery['id']
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}/confirm"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get('status') == 'confirmed', "Status should be confirmed"
        print(f"Delivery confirmed: {data.get('message')}")
        
        # Update fixture data
        test_delivery['status'] = 'confirmed'
    
    def test_complete_delivery(self, authenticated_client, test_delivery):
        """Test completing a delivery (stock deduction)"""
        delivery_id = test_delivery['id']
        
        # Ensure it's confirmed first
        if test_delivery.get('status') == 'draft':
            authenticated_client.post(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}/confirm"
            )
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}/complete"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get('status') == 'delivered', "Status should be delivered"
        print(f"Delivery completed: {data.get('message')}")
        
        # Update fixture data
        test_delivery['status'] = 'delivered'


class TestDeliveryValidation:
    """Test delivery validation and error handling"""
    
    def test_create_delivery_without_account(self, authenticated_client, distributor_info):
        """Test that delivery requires valid account"""
        locations = distributor_info.get('locations', [])
        if not locations:
            pytest.skip("No locations available")
        
        delivery_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "distributor_location_id": locations[0]['id'],
            "account_id": "invalid-account-id",
            "delivery_date": datetime.now().strftime("%Y-%m-%d"),
            "items": [{"sku_id": "test", "quantity": 1, "unit_price": 100}]
        }
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=delivery_data
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid account, got {response.status_code}"
        print(f"Correctly rejected invalid account: {response.json().get('detail')}")
    
    def test_create_delivery_without_items(self, authenticated_client, distributor_info, assigned_accounts):
        """Test that delivery requires at least one item"""
        if not assigned_accounts:
            pytest.skip("No accounts assigned")
        
        locations = distributor_info.get('locations', [])
        if not locations:
            pytest.skip("No locations available")
        
        delivery_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "distributor_location_id": locations[0]['id'],
            "account_id": assigned_accounts[0]['id'],
            "delivery_date": datetime.now().strftime("%Y-%m-%d"),
            "items": []  # Empty items
        }
        
        response = authenticated_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=delivery_data
        )
        
        assert response.status_code == 400, f"Expected 400 for empty items, got {response.status_code}"
        print(f"Correctly rejected empty items: {response.json().get('detail')}")
    
    def test_delivery_not_found(self, authenticated_client):
        """Test 404 for non-existent delivery"""
        response = authenticated_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/non-existent-id"
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestDeliveryCancellation:
    """Test delivery cancellation and deletion"""
    
    def test_cancel_delivery(self, authenticated_client, distributor_info, sku_info, assigned_accounts):
        """Test cancelling a delivery"""
        if not assigned_accounts:
            pytest.skip("No accounts assigned")
        
        locations = distributor_info.get('locations', [])
        if not locations:
            pytest.skip("No locations available")
        
        # Create a delivery
        delivery_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "distributor_location_id": locations[0]['id'],
            "account_id": assigned_accounts[0]['id'],
            "delivery_date": datetime.now().strftime("%Y-%m-%d"),
            "items": [{"sku_id": sku_info['id'], "quantity": 1, "unit_price": 100}]
        }
        
        create_response = authenticated_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=delivery_data
        )
        
        if create_response.status_code != 200:
            pytest.skip("Failed to create delivery for cancel test")
        
        delivery = create_response.json()
        
        # Cancel it
        response = authenticated_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery['id']}/cancel"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get('status') == 'cancelled', "Status should be cancelled"
        print(f"Delivery cancelled successfully")
    
    def test_delete_draft_delivery(self, authenticated_client, distributor_info, sku_info, assigned_accounts):
        """Test deleting a draft delivery"""
        if not assigned_accounts:
            pytest.skip("No accounts assigned")
        
        locations = distributor_info.get('locations', [])
        if not locations:
            pytest.skip("No locations available")
        
        # Create a delivery
        delivery_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "distributor_location_id": locations[0]['id'],
            "account_id": assigned_accounts[0]['id'],
            "delivery_date": datetime.now().strftime("%Y-%m-%d"),
            "items": [{"sku_id": sku_info['id'], "quantity": 1, "unit_price": 100}]
        }
        
        create_response = authenticated_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=delivery_data
        )
        
        if create_response.status_code != 200:
            pytest.skip("Failed to create delivery for delete test")
        
        delivery = create_response.json()
        
        # Delete it
        response = authenticated_client.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery['id']}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"Delivery deleted successfully")
        
        # Verify it's gone
        get_response = authenticated_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery['id']}"
        )
        assert get_response.status_code == 404, "Deleted delivery should return 404"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
