"""
Primary Shipments / Stock Receipt API Tests
Tests the CRUD operations and workflow for distributor shipments:
- Create shipment with items
- Read shipment details
- Status transitions: draft -> confirmed -> in_transit -> delivered
- Cancel and delete shipments
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_ID = "nyla-air-water"

# Test data - known distributor from context
TEST_DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"

@pytest.fixture(scope="module")
def auth_session():
    """Create authenticated session for all tests"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "X-Tenant-ID": TENANT_ID
    })
    
    # Login
    login_response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        }
    )
    
    if login_response.status_code != 200:
        pytest.skip(f"Login failed: {login_response.text}")
    
    # Get session token from response and set as cookie
    data = login_response.json()
    session_token = data.get('session_token')
    if session_token:
        session.cookies.set('session_token', session_token)
    
    return session


@pytest.fixture(scope="module")
def distributor_data(auth_session):
    """Fetch distributor data including locations"""
    response = auth_session.get(f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}")
    
    if response.status_code != 200:
        pytest.skip(f"Distributor not found: {response.text}")
    
    data = response.json()
    return data


@pytest.fixture(scope="module")
def skus_list(auth_session):
    """Fetch available SKUs for shipment items"""
    response = auth_session.get(f"{BASE_URL}/api/master-skus")
    
    if response.status_code != 200:
        pytest.skip(f"Could not fetch SKUs: {response.text}")
    
    data = response.json()
    skus = data.get('skus', data) if isinstance(data, dict) else data
    
    if not skus or len(skus) == 0:
        pytest.skip("No SKUs available for testing")
    
    return skus


class TestShipmentsCRUD:
    """Tests for Primary Shipment CRUD operations"""
    
    created_shipment_id = None
    
    def test_list_shipments_for_distributor(self, auth_session, distributor_data):
        """Test listing shipments for a distributor"""
        response = auth_session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "shipments" in data
        assert "total" in data
        assert isinstance(data['shipments'], list)
        
        print(f"Found {data['total']} existing shipments for distributor")
    
    def test_create_shipment_requires_location(self, auth_session, distributor_data, skus_list):
        """Test that shipment creation requires a valid location"""
        # Get first available location
        locations = distributor_data.get('locations', [])
        if not locations:
            pytest.skip("No locations available for distributor - need to add one first")
        
        location = locations[0]
        sku = skus_list[0]
        
        shipment_data = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "distributor_location_id": "invalid-location-id",  # Invalid
            "shipment_date": "2026-01-15",
            "items": [
                {
                    "sku_id": sku.get('id'),
                    "quantity": 10,
                    "unit_price": 100.0
                }
            ]
        }
        
        response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments",
            json=shipment_data
        )
        
        # Should fail with 400 for invalid location
        assert response.status_code == 400, f"Expected 400 for invalid location, got {response.status_code}"
        print("Correctly rejected invalid location")
    
    def test_create_shipment_requires_items(self, auth_session, distributor_data):
        """Test that shipment creation requires at least one item"""
        locations = distributor_data.get('locations', [])
        if not locations:
            pytest.skip("No locations available")
        
        location = locations[0]
        
        shipment_data = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "distributor_location_id": location['id'],
            "shipment_date": "2026-01-15",
            "items": []  # Empty items
        }
        
        response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments",
            json=shipment_data
        )
        
        assert response.status_code == 400, f"Expected 400 for empty items, got {response.status_code}"
        assert "item" in response.text.lower() or "required" in response.text.lower()
        print("Correctly rejected shipment with no items")
    
    def test_create_shipment_success(self, auth_session, distributor_data, skus_list):
        """Test successful shipment creation"""
        locations = distributor_data.get('locations', [])
        if not locations:
            pytest.skip("No locations available")
        
        location = locations[0]
        sku = skus_list[0]
        
        shipment_data = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "distributor_location_id": location['id'],
            "shipment_date": "2026-01-15",
            "expected_delivery_date": "2026-01-17",
            "reference_number": "TEST-PO-001",
            "vehicle_number": "KA-01-AB-1234",
            "driver_name": "Test Driver",
            "driver_contact": "+91 9876543210",
            "remarks": "Test shipment for automated testing",
            "items": [
                {
                    "sku_id": sku.get('id'),
                    "sku_name": sku.get('name') or sku.get('sku_name'),
                    "quantity": 10,
                    "unit_price": 100.0,
                    "discount_percent": 5.0,
                    "tax_percent": 18.0
                }
            ]
        }
        
        response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments",
            json=shipment_data
        )
        
        assert response.status_code == 200, f"Shipment creation failed: {response.text}"
        
        data = response.json()
        
        # Verify shipment data
        assert "id" in data
        assert "shipment_number" in data
        assert data['shipment_number'].startswith('SHP-')
        assert data['status'] == 'draft'
        assert data['distributor_location_id'] == location['id']
        assert data['shipment_date'] == "2026-01-15"
        assert data['total_quantity'] == 10
        
        # Verify amount calculations
        # gross = 10 * 100 = 1000
        # discount = 1000 * 5% = 50
        # taxable = 1000 - 50 = 950
        # tax = 950 * 18% = 171
        # net = 950 + 171 = 1121
        assert data['total_gross_amount'] == 1000.0
        assert data['total_discount_amount'] == 50.0
        assert data['total_net_amount'] == 1121.0
        
        # Store for other tests
        TestShipmentsCRUD.created_shipment_id = data['id']
        
        print(f"Created shipment {data['shipment_number']} with ID {data['id']}")
        print(f"Total amount: {data['total_net_amount']}")
    
    def test_get_shipment_detail(self, auth_session):
        """Test fetching shipment detail with items"""
        if not TestShipmentsCRUD.created_shipment_id:
            pytest.skip("No shipment created")
        
        response = auth_session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{TestShipmentsCRUD.created_shipment_id}"
        )
        
        assert response.status_code == 200, f"Failed to get shipment: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "id" in data
        assert "shipment_number" in data
        assert "items" in data
        assert isinstance(data['items'], list)
        assert len(data['items']) >= 1
        
        # Verify item data
        item = data['items'][0]
        assert "sku_id" in item
        assert "quantity" in item
        assert "unit_price" in item
        assert "net_amount" in item
        
        print(f"Shipment detail fetched: {data['shipment_number']} with {len(data['items'])} items")


class TestShipmentWorkflow:
    """Tests for shipment status workflow: draft -> confirmed -> in_transit -> delivered"""
    
    workflow_shipment_id = None
    
    @pytest.fixture(autouse=True)
    def setup_workflow_shipment(self, auth_session, distributor_data, skus_list):
        """Create a fresh shipment for workflow testing"""
        if TestShipmentWorkflow.workflow_shipment_id:
            return
        
        locations = distributor_data.get('locations', [])
        if not locations:
            pytest.skip("No locations available")
        
        location = locations[0]
        sku = skus_list[0]
        
        shipment_data = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "distributor_location_id": location['id'],
            "shipment_date": "2026-01-16",
            "items": [
                {
                    "sku_id": sku.get('id'),
                    "quantity": 5,
                    "unit_price": 200.0,
                    "tax_percent": 18.0
                }
            ]
        }
        
        response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments",
            json=shipment_data
        )
        
        if response.status_code == 200:
            data = response.json()
            TestShipmentWorkflow.workflow_shipment_id = data['id']
            print(f"Created workflow test shipment: {data['shipment_number']}")
    
    def test_confirm_shipment(self, auth_session):
        """Test confirming a draft shipment"""
        if not TestShipmentWorkflow.workflow_shipment_id:
            pytest.skip("No workflow shipment created")
        
        response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{TestShipmentWorkflow.workflow_shipment_id}/confirm"
        )
        
        assert response.status_code == 200, f"Confirm failed: {response.text}"
        
        data = response.json()
        assert data.get('status') == 'confirmed'
        
        print(f"Shipment confirmed: {data.get('message')}")
    
    def test_confirm_already_confirmed_fails(self, auth_session):
        """Test that confirming an already confirmed shipment fails"""
        if not TestShipmentWorkflow.workflow_shipment_id:
            pytest.skip("No workflow shipment")
        
        # Try to confirm again
        response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{TestShipmentWorkflow.workflow_shipment_id}/confirm"
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("Correctly rejected double confirmation")
    
    def test_dispatch_shipment(self, auth_session):
        """Test dispatching (marking in transit) a confirmed shipment"""
        if not TestShipmentWorkflow.workflow_shipment_id:
            pytest.skip("No workflow shipment")
        
        response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{TestShipmentWorkflow.workflow_shipment_id}/dispatch"
        )
        
        assert response.status_code == 200, f"Dispatch failed: {response.text}"
        
        data = response.json()
        assert data.get('status') == 'in_transit'
        
        print(f"Shipment dispatched: {data.get('message')}")
    
    def test_dispatch_already_dispatched_fails(self, auth_session):
        """Test that dispatching an already in_transit shipment fails"""
        if not TestShipmentWorkflow.workflow_shipment_id:
            pytest.skip("No workflow shipment")
        
        response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{TestShipmentWorkflow.workflow_shipment_id}/dispatch"
        )
        
        assert response.status_code == 400
        print("Correctly rejected double dispatch")
    
    def test_deliver_shipment(self, auth_session):
        """Test marking shipment as delivered"""
        if not TestShipmentWorkflow.workflow_shipment_id:
            pytest.skip("No workflow shipment")
        
        response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{TestShipmentWorkflow.workflow_shipment_id}/deliver"
        )
        
        assert response.status_code == 200, f"Deliver failed: {response.text}"
        
        data = response.json()
        assert data.get('status') == 'delivered'
        
        print(f"Shipment delivered: {data.get('message')}")
    
    def test_verify_delivered_status(self, auth_session):
        """Verify shipment status is delivered after the workflow"""
        if not TestShipmentWorkflow.workflow_shipment_id:
            pytest.skip("No workflow shipment")
        
        response = auth_session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{TestShipmentWorkflow.workflow_shipment_id}"
        )
        
        assert response.status_code == 200
        
        data = response.json()
        assert data['status'] == 'delivered'
        assert data.get('delivered_at') is not None
        assert data.get('actual_delivery_date') is not None
        
        print(f"Verified shipment status: {data['status']}, delivered at: {data.get('delivered_at')}")


class TestShipmentCancel:
    """Tests for shipment cancellation"""
    
    cancel_shipment_id = None
    
    def test_create_and_cancel_draft_shipment(self, auth_session, distributor_data, skus_list):
        """Test cancelling a draft shipment"""
        locations = distributor_data.get('locations', [])
        if not locations:
            pytest.skip("No locations available")
        
        location = locations[0]
        sku = skus_list[0]
        
        # Create a shipment for cancellation
        shipment_data = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "distributor_location_id": location['id'],
            "shipment_date": "2026-01-17",
            "items": [
                {
                    "sku_id": sku.get('id'),
                    "quantity": 2,
                    "unit_price": 50.0
                }
            ]
        }
        
        create_response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments",
            json=shipment_data
        )
        
        assert create_response.status_code == 200
        created = create_response.json()
        shipment_id = created['id']
        
        # Cancel the shipment
        cancel_response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{shipment_id}/cancel"
        )
        
        assert cancel_response.status_code == 200, f"Cancel failed: {cancel_response.text}"
        
        # Verify status
        get_response = auth_session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{shipment_id}"
        )
        
        assert get_response.status_code == 200
        data = get_response.json()
        assert data['status'] == 'cancelled'
        
        print(f"Shipment {created['shipment_number']} cancelled successfully")
    
    def test_delete_draft_shipment(self, auth_session, distributor_data, skus_list):
        """Test deleting a draft shipment"""
        locations = distributor_data.get('locations', [])
        if not locations:
            pytest.skip("No locations available")
        
        location = locations[0]
        sku = skus_list[0]
        
        # Create a shipment for deletion
        shipment_data = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "distributor_location_id": location['id'],
            "shipment_date": "2026-01-18",
            "items": [
                {
                    "sku_id": sku.get('id'),
                    "quantity": 1,
                    "unit_price": 25.0
                }
            ]
        }
        
        create_response = auth_session.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments",
            json=shipment_data
        )
        
        assert create_response.status_code == 200
        created = create_response.json()
        shipment_id = created['id']
        
        # Delete the shipment
        delete_response = auth_session.delete(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{shipment_id}"
        )
        
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        # Verify it's gone
        get_response = auth_session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{shipment_id}"
        )
        
        assert get_response.status_code == 404
        
        print(f"Shipment {created['shipment_number']} deleted successfully")


class TestShipmentsListAndSummary:
    """Tests for shipment listing and summary endpoints"""
    
    def test_list_all_shipments(self, auth_session):
        """Test listing all shipments across distributors"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/shipments/all")
        
        assert response.status_code == 200, f"List all failed: {response.text}"
        
        data = response.json()
        assert "shipments" in data
        assert "total" in data
        assert "page" in data
        
        print(f"Total shipments across all distributors: {data['total']}")
    
    def test_shipments_summary(self, auth_session):
        """Test shipments summary endpoint"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/shipments/summary")
        
        assert response.status_code == 200, f"Summary failed: {response.text}"
        
        data = response.json()
        assert "total" in data
        assert "by_status" in data
        
        by_status = data['by_status']
        assert "draft" in by_status
        assert "confirmed" in by_status
        assert "in_transit" in by_status
        assert "delivered" in by_status
        
        print(f"Shipments summary: total={data['total']}, by_status={by_status}")
    
    def test_list_shipments_filtered_by_status(self, auth_session):
        """Test listing shipments filtered by status"""
        response = auth_session.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments?status=delivered"
        )
        
        assert response.status_code == 200
        
        data = response.json()
        shipments = data.get('shipments', [])
        
        # All returned shipments should have 'delivered' status
        for shipment in shipments:
            assert shipment.get('status') == 'delivered', f"Got non-delivered shipment: {shipment.get('status')}"
        
        print(f"Found {len(shipments)} delivered shipments")


# Cleanup fixture to delete test shipments after all tests
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_shipments(request, auth_session):
    """Cleanup test shipments after all tests complete"""
    yield
    
    # Delete created test shipments
    shipment_ids_to_delete = []
    
    if TestShipmentsCRUD.created_shipment_id:
        shipment_ids_to_delete.append(TestShipmentsCRUD.created_shipment_id)
    
    if TestShipmentWorkflow.workflow_shipment_id:
        shipment_ids_to_delete.append(TestShipmentWorkflow.workflow_shipment_id)
    
    for shipment_id in shipment_ids_to_delete:
        try:
            # Try to delete - may fail if already deleted or status changed
            auth_session.delete(
                f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{shipment_id}"
            )
        except:
            pass
    
    print(f"Cleanup: Attempted to clean up {len(shipment_ids_to_delete)} test shipments")
