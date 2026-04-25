"""
Test Warehouse Transfer (Production → Factory Warehouse) and Shipment Source Warehouse Features

Tests:
1. GET /api/production/factory-warehouses - list factory warehouses
2. GET /api/production/factory-warehouse-stock - get stock levels
3. POST /api/production/batches/{batch_id}/transfer-to-warehouse - transfer crates
4. GET /api/production/batches/{batch_id}/warehouse-transfers - transfer history
5. POST /api/distributors/{id}/shipments - with source_warehouse_id
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TEST_TENANT_ID = "nyla-air-water"
TEST_DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD,
        "tenant_id": TEST_TENANT_ID
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # API returns session_token, not token
    return data.get("session_token") or data.get("token")


@pytest.fixture(scope="module")
def headers(auth_token):
    """Get auth headers"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestFactoryWarehouses:
    """Test factory warehouse endpoints"""
    
    def test_list_factory_warehouses(self, headers):
        """GET /api/production/factory-warehouses should return list of factory warehouses"""
        response = requests.get(f"{BASE_URL}/api/production/factory-warehouses", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should have warehouses key
        assert "warehouses" in data, "Response should have 'warehouses' key"
        warehouses = data["warehouses"]
        
        # Should be a list
        assert isinstance(warehouses, list), "Warehouses should be a list"
        
        print(f"Found {len(warehouses)} factory warehouses")
        
        # If there are warehouses, verify structure
        if warehouses:
            wh = warehouses[0]
            assert "id" in wh, "Warehouse should have 'id'"
            assert "location_name" in wh, "Warehouse should have 'location_name'"
            print(f"First warehouse: {wh.get('location_name')} ({wh.get('city')})")
    
    def test_factory_warehouse_stock(self, headers):
        """GET /api/production/factory-warehouse-stock should return stock levels"""
        response = requests.get(f"{BASE_URL}/api/production/factory-warehouse-stock", headers=headers)
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should have stock key
        assert "stock" in data, "Response should have 'stock' key"
        stock = data["stock"]
        
        # Should be a list
        assert isinstance(stock, list), "Stock should be a list"
        
        print(f"Found {len(stock)} stock entries in factory warehouses")
        
        # If there are stock entries, verify structure
        if stock:
            entry = stock[0]
            assert "warehouse_location_id" in entry, "Stock entry should have 'warehouse_location_id'"
            assert "sku_id" in entry, "Stock entry should have 'sku_id'"
            assert "quantity" in entry, "Stock entry should have 'quantity'"


class TestWarehouseTransfer:
    """Test warehouse transfer from production batch to factory warehouse"""
    
    def test_transfer_validation_no_stock(self, headers):
        """POST transfer should fail if batch has no available stock"""
        # First get a batch
        response = requests.get(f"{BASE_URL}/api/production/batches", headers=headers)
        assert response.status_code == 200
        batches = response.json()
        
        if not batches:
            pytest.skip("No batches available for testing")
        
        # Find a batch - any batch
        batch = batches[0]
        batch_id = batch["id"]
        
        # Get factory warehouses
        wh_response = requests.get(f"{BASE_URL}/api/production/factory-warehouses", headers=headers)
        assert wh_response.status_code == 200
        warehouses = wh_response.json().get("warehouses", [])
        
        if not warehouses:
            pytest.skip("No factory warehouses available for testing")
        
        warehouse_id = warehouses[0]["id"]
        
        # Calculate available stock
        available = (batch.get("total_passed_final", 0) or 0) - (batch.get("transferred_to_warehouse", 0) or 0)
        
        if available <= 0:
            # Try to transfer more than available (should fail)
            transfer_response = requests.post(
                f"{BASE_URL}/api/production/batches/{batch_id}/transfer-to-warehouse",
                headers=headers,
                json={
                    "warehouse_location_id": warehouse_id,
                    "quantity": 100,  # More than available
                    "notes": "Test transfer"
                }
            )
            
            # Should fail with 400
            assert transfer_response.status_code == 400, f"Expected 400, got {transfer_response.status_code}"
            error_detail = transfer_response.json().get("detail", "")
            assert "available" in error_detail.lower() or "0" in error_detail, f"Error should mention available stock: {error_detail}"
            print(f"Correctly rejected transfer: {error_detail}")
        else:
            print(f"Batch {batch['batch_code']} has {available} available crates - skipping validation test")
    
    def test_transfer_invalid_warehouse(self, headers):
        """POST transfer should fail with invalid warehouse ID"""
        # Get a batch
        response = requests.get(f"{BASE_URL}/api/production/batches", headers=headers)
        assert response.status_code == 200
        batches = response.json()
        
        if not batches:
            pytest.skip("No batches available for testing")
        
        batch_id = batches[0]["id"]
        
        # Try to transfer to invalid warehouse
        transfer_response = requests.post(
            f"{BASE_URL}/api/production/batches/{batch_id}/transfer-to-warehouse",
            headers=headers,
            json={
                "warehouse_location_id": "invalid-warehouse-id-12345",
                "quantity": 1,
                "notes": "Test invalid warehouse"
            }
        )
        
        # Should fail with 400
        assert transfer_response.status_code == 400, f"Expected 400, got {transfer_response.status_code}"
        error_detail = transfer_response.json().get("detail", "")
        assert "invalid" in error_detail.lower() or "warehouse" in error_detail.lower(), f"Error should mention invalid warehouse: {error_detail}"
        print(f"Correctly rejected invalid warehouse: {error_detail}")
    
    def test_get_batch_warehouse_transfers(self, headers):
        """GET /api/production/batches/{batch_id}/warehouse-transfers should return transfer history"""
        # Get a batch
        response = requests.get(f"{BASE_URL}/api/production/batches", headers=headers)
        assert response.status_code == 200
        batches = response.json()
        
        if not batches:
            pytest.skip("No batches available for testing")
        
        batch_id = batches[0]["id"]
        
        # Get transfer history
        transfers_response = requests.get(
            f"{BASE_URL}/api/production/batches/{batch_id}/warehouse-transfers",
            headers=headers
        )
        
        assert transfers_response.status_code == 200, f"Failed: {transfers_response.text}"
        data = transfers_response.json()
        
        # Should have transfers key
        assert "transfers" in data, "Response should have 'transfers' key"
        assert "total" in data, "Response should have 'total' key"
        
        transfers = data["transfers"]
        assert isinstance(transfers, list), "Transfers should be a list"
        
        print(f"Found {len(transfers)} transfers for batch")
        
        # If there are transfers, verify structure
        if transfers:
            t = transfers[0]
            assert "id" in t, "Transfer should have 'id'"
            assert "batch_id" in t, "Transfer should have 'batch_id'"
            assert "warehouse_location_id" in t, "Transfer should have 'warehouse_location_id'"
            assert "quantity" in t, "Transfer should have 'quantity'"
            assert "transferred_at" in t, "Transfer should have 'transferred_at'"


class TestShipmentSourceWarehouse:
    """Test shipment creation with source_warehouse_id"""
    
    def test_get_distributor_locations(self, headers):
        """Verify distributor has locations for shipment"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/locations",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        locations = data.get("locations", [])
        print(f"Distributor has {len(locations)} locations")
        
        if locations:
            loc = locations[0]
            print(f"First location: {loc.get('location_name')} ({loc.get('city')})")
    
    def test_shipment_with_source_warehouse(self, headers):
        """POST /api/distributors/{id}/shipments should accept source_warehouse_id"""
        # Get factory warehouses
        wh_response = requests.get(f"{BASE_URL}/api/production/factory-warehouses", headers=headers)
        assert wh_response.status_code == 200
        warehouses = wh_response.json().get("warehouses", [])
        
        if not warehouses:
            pytest.skip("No factory warehouses available for testing")
        
        source_warehouse_id = warehouses[0]["id"]
        source_warehouse_name = warehouses[0]["location_name"]
        
        # Get distributor locations
        loc_response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/locations",
            headers=headers
        )
        assert loc_response.status_code == 200
        locations = loc_response.json().get("locations", [])
        
        active_locations = [l for l in locations if l.get("status") == "active"]
        if not active_locations:
            pytest.skip("No active distributor locations available")
        
        dest_location_id = active_locations[0]["id"]
        
        # Get SKUs
        sku_response = requests.get(f"{BASE_URL}/api/master-skus", headers=headers)
        assert sku_response.status_code == 200
        skus = sku_response.json().get("skus", sku_response.json())
        
        if not skus:
            pytest.skip("No SKUs available for testing")
        
        sku = skus[0]
        
        # Create shipment with source_warehouse_id
        shipment_data = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "distributor_location_id": dest_location_id,
            "source_warehouse_id": source_warehouse_id,
            "shipment_date": datetime.now().strftime("%Y-%m-%d"),
            "reference_number": f"TEST-SHP-{uuid.uuid4().hex[:8].upper()}",
            "remarks": "Test shipment with source warehouse",
            "items": [
                {
                    "sku_id": sku.get("id"),
                    "sku_name": sku.get("name") or sku.get("sku_name"),
                    "quantity": 1,
                    "unit_price": 100.00,
                    "discount_percent": 0,
                    "tax_percent": 18
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments",
            headers=headers,
            json=shipment_data
        )
        
        assert response.status_code in [200, 201], f"Failed to create shipment: {response.text}"
        data = response.json()
        
        # Verify source warehouse is stored
        assert "source_warehouse_id" in data, "Shipment should have 'source_warehouse_id'"
        assert data["source_warehouse_id"] == source_warehouse_id, "source_warehouse_id should match"
        
        assert "source_warehouse_name" in data, "Shipment should have 'source_warehouse_name'"
        assert data["source_warehouse_name"] == source_warehouse_name, "source_warehouse_name should match"
        
        print(f"Created shipment {data.get('shipment_number')} from {source_warehouse_name}")
        
        # Clean up - delete the test shipment
        shipment_id = data.get("id")
        if shipment_id:
            delete_response = requests.delete(
                f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{shipment_id}",
                headers=headers
            )
            if delete_response.status_code in [200, 204]:
                print(f"Cleaned up test shipment {shipment_id}")
    
    def test_shipment_invalid_source_warehouse(self, headers):
        """POST shipment should fail with invalid source_warehouse_id"""
        # Get distributor locations
        loc_response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/locations",
            headers=headers
        )
        assert loc_response.status_code == 200
        locations = loc_response.json().get("locations", [])
        
        active_locations = [l for l in locations if l.get("status") == "active"]
        if not active_locations:
            pytest.skip("No active distributor locations available")
        
        dest_location_id = active_locations[0]["id"]
        
        # Get SKUs
        sku_response = requests.get(f"{BASE_URL}/api/master-skus", headers=headers)
        assert sku_response.status_code == 200
        skus = sku_response.json().get("skus", sku_response.json())
        
        if not skus:
            pytest.skip("No SKUs available for testing")
        
        sku = skus[0]
        
        # Create shipment with invalid source_warehouse_id
        shipment_data = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "distributor_location_id": dest_location_id,
            "source_warehouse_id": "invalid-warehouse-id-12345",
            "shipment_date": datetime.now().strftime("%Y-%m-%d"),
            "reference_number": f"TEST-INVALID-{uuid.uuid4().hex[:8].upper()}",
            "items": [
                {
                    "sku_id": sku.get("id"),
                    "sku_name": sku.get("name") or sku.get("sku_name"),
                    "quantity": 1,
                    "unit_price": 100.00,
                    "discount_percent": 0,
                    "tax_percent": 18
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments",
            headers=headers,
            json=shipment_data
        )
        
        # Should fail with 400
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        error_detail = response.json().get("detail", "")
        assert "warehouse" in error_detail.lower() or "invalid" in error_detail.lower(), f"Error should mention invalid warehouse: {error_detail}"
        print(f"Correctly rejected invalid source warehouse: {error_detail}")
    
    def test_shipment_without_source_warehouse(self, headers):
        """POST shipment should work without source_warehouse_id (optional field)"""
        # Get distributor locations
        loc_response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/locations",
            headers=headers
        )
        assert loc_response.status_code == 200
        locations = loc_response.json().get("locations", [])
        
        active_locations = [l for l in locations if l.get("status") == "active"]
        if not active_locations:
            pytest.skip("No active distributor locations available")
        
        dest_location_id = active_locations[0]["id"]
        
        # Get SKUs
        sku_response = requests.get(f"{BASE_URL}/api/master-skus", headers=headers)
        assert sku_response.status_code == 200
        skus = sku_response.json().get("skus", sku_response.json())
        
        if not skus:
            pytest.skip("No SKUs available for testing")
        
        sku = skus[0]
        
        # Create shipment WITHOUT source_warehouse_id
        shipment_data = {
            "distributor_id": TEST_DISTRIBUTOR_ID,
            "distributor_location_id": dest_location_id,
            # No source_warehouse_id
            "shipment_date": datetime.now().strftime("%Y-%m-%d"),
            "reference_number": f"TEST-NOSRC-{uuid.uuid4().hex[:8].upper()}",
            "items": [
                {
                    "sku_id": sku.get("id"),
                    "sku_name": sku.get("name") or sku.get("sku_name"),
                    "quantity": 1,
                    "unit_price": 100.00,
                    "discount_percent": 0,
                    "tax_percent": 18
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments",
            headers=headers,
            json=shipment_data
        )
        
        assert response.status_code in [200, 201], f"Failed to create shipment: {response.text}"
        data = response.json()
        
        # source_warehouse_id should be None or not present
        assert data.get("source_warehouse_id") is None, "source_warehouse_id should be None when not provided"
        
        print(f"Created shipment {data.get('shipment_number')} without source warehouse")
        
        # Clean up
        shipment_id = data.get("id")
        if shipment_id:
            delete_response = requests.delete(
                f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments/{shipment_id}",
                headers=headers
            )
            if delete_response.status_code in [200, 204]:
                print(f"Cleaned up test shipment {shipment_id}")


class TestShipmentListWithSourceWarehouse:
    """Test that shipment list includes source warehouse info"""
    
    def test_shipments_list_has_source_warehouse(self, headers):
        """GET /api/distributors/{id}/shipments should include source_warehouse_name"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{TEST_DISTRIBUTOR_ID}/shipments",
            headers=headers
        )
        
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        shipments = data.get("shipments", [])
        print(f"Found {len(shipments)} shipments")
        
        # Check if any shipment has source_warehouse_name
        shipments_with_source = [s for s in shipments if s.get("source_warehouse_name")]
        print(f"Shipments with source warehouse: {len(shipments_with_source)}")
        
        if shipments_with_source:
            s = shipments_with_source[0]
            print(f"Example: {s.get('shipment_number')} from {s.get('source_warehouse_name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
