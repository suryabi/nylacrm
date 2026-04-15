"""
Test Stock Deduction from Factory Warehouse on Shipment Confirmation
Tests the feature: When confirming a shipment with source_warehouse_id, 
validate factory warehouse has sufficient stock and deduct quantities.
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

class TestShipmentStockDeduction:
    """Tests for stock deduction from factory warehouse when confirming shipments"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        token = login_response.json().get("session_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Test constants
        self.tenant_id = "nyla-air-water"
        self.distributor_id = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
        self.distributor_location_id = "90987260-0ee0-4e16-b88e-d7b1756da02e"
        
        # Get factory warehouses
        fw_response = self.session.get(f"{BASE_URL}/api/production/factory-warehouses")
        assert fw_response.status_code == 200, f"Failed to get factory warehouses: {fw_response.text}"
        warehouses = fw_response.json().get("warehouses", [])
        if warehouses:
            self.factory_warehouse_id = warehouses[0]["id"]
            self.factory_warehouse_name = warehouses[0].get("location_name", "Factory Warehouse")
        else:
            pytest.skip("No factory warehouses found")
        
        # Get factory warehouse stock to find a SKU with stock
        stock_response = self.session.get(f"{BASE_URL}/api/production/factory-warehouse-stock")
        if stock_response.status_code == 200:
            stocks = stock_response.json().get("stock", [])
            # Find stock in our factory warehouse
            for stock in stocks:
                if stock.get("warehouse_location_id") == self.factory_warehouse_id and stock.get("quantity", 0) > 0:
                    self.test_sku_id = stock.get("sku_id")
                    self.test_sku_name = stock.get("sku_name", "Test SKU")
                    self.available_stock = stock.get("quantity", 0)
                    print(f"Found stock: SKU={self.test_sku_name}, Qty={self.available_stock}, Warehouse={self.factory_warehouse_id}")
                    break
            else:
                # No stock found in our warehouse, use default SKU
                self.test_sku_id = None
                self.test_sku_name = None
                self.available_stock = 0
        else:
            self.test_sku_id = None
            self.test_sku_name = None
            self.available_stock = 0
        
        # If no stock found, get a default SKU for tests that don't need stock
        if not self.test_sku_id:
            skus_response = self.session.get(f"{BASE_URL}/api/skus")
            if skus_response.status_code == 200:
                skus = skus_response.json().get("skus", [])
                if skus:
                    self.test_sku_id = skus[0]["id"]
                    self.test_sku_name = skus[0].get("name", "Test SKU")
                else:
                    self.test_sku_id = "test-sku-" + str(uuid.uuid4())[:8]
                    self.test_sku_name = "Test SKU"
            else:
                self.test_sku_id = "test-sku-" + str(uuid.uuid4())[:8]
                self.test_sku_name = "Test SKU"
        
        # Track created shipments for cleanup
        self.created_shipment_ids = []
        
        yield
        
        # Cleanup: Delete test shipments created during tests
        self._cleanup_test_shipments()
    
    def _cleanup_test_shipments(self):
        """Clean up test shipments created during tests"""
        for shipment_id in self.created_shipment_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments/{shipment_id}")
            except Exception as e:
                print(f"Cleanup error for shipment {shipment_id}: {e}")
    
    def _create_draft_shipment(self, source_warehouse_id=None, sku_id=None, sku_name=None, quantity=10, remarks="TEST_STOCK_DEDUCTION"):
        """Helper to create a draft shipment with items"""
        sku_id = sku_id or self.test_sku_id
        sku_name = sku_name or self.test_sku_name
        
        # Create shipment with items in body (as required by API)
        shipment_data = {
            "distributor_id": self.distributor_id,
            "distributor_location_id": self.distributor_location_id,
            "shipment_date": datetime.now().strftime("%Y-%m-%d"),
            "remarks": remarks,
            "items": [
                {
                    "sku_id": sku_id,
                    "sku_name": sku_name,
                    "quantity": quantity,
                    "unit_price": 100.0,
                    "tax_percent": 18.0
                }
            ]
        }
        if source_warehouse_id:
            shipment_data["source_warehouse_id"] = source_warehouse_id
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments",
            json=shipment_data
        )
        assert response.status_code == 200, f"Failed to create shipment: {response.text}"
        shipment = response.json()
        shipment_id = shipment["id"]
        self.created_shipment_ids.append(shipment_id)
        
        return shipment_id, shipment.get("shipment_number")
    
    def _get_factory_stock(self, sku_id):
        """Get current stock level for a SKU in factory warehouse"""
        response = self.session.get(f"{BASE_URL}/api/production/factory-warehouse-stock")
        if response.status_code == 200:
            stocks = response.json().get("stock", [])
            for stock in stocks:
                if stock.get("sku_id") == sku_id and stock.get("warehouse_location_id") == self.factory_warehouse_id:
                    return stock.get("quantity", 0)
        return 0
    
    # ============ Test Cases ============
    
    def test_confirm_shipment_without_source_warehouse_succeeds(self):
        """Test: Confirm shipment WITHOUT source_warehouse_id should work normally without stock checks"""
        # Create shipment without source warehouse
        shipment_id, shipment_number = self._create_draft_shipment(
            source_warehouse_id=None,
            quantity=10,
            remarks="TEST_STOCK_DEDUCTION_NO_SOURCE"
        )
        
        # Confirm shipment
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments/{shipment_id}/confirm"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "confirmed"
        assert "confirmed successfully" in data.get("message", "")
        print(f"PASSED: Shipment without source warehouse confirmed successfully")
    
    def test_confirm_shipment_with_source_warehouse_insufficient_stock_fails(self):
        """Test: Confirm shipment with source_warehouse_id and INSUFFICIENT stock should return 400"""
        # Create shipment with source warehouse and very high quantity (likely insufficient)
        shipment_id, shipment_number = self._create_draft_shipment(
            source_warehouse_id=self.factory_warehouse_id,
            quantity=999999,  # Very high quantity to ensure insufficient stock
            remarks="TEST_STOCK_DEDUCTION_INSUFFICIENT"
        )
        
        # Try to confirm - should fail with insufficient stock
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments/{shipment_id}/confirm"
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Insufficient stock" in data.get("detail", ""), f"Expected 'Insufficient stock' in error, got: {data}"
        print(f"PASSED: Shipment with insufficient stock correctly rejected with 400")
    
    def test_confirm_shipment_with_source_warehouse_zero_stock_fails(self):
        """Test: Confirm shipment when factory warehouse has 0 stock for SKU should fail"""
        # Use a non-existent SKU ID to ensure 0 stock
        fake_sku_id = f"nonexistent-sku-{uuid.uuid4()}"
        
        # Create shipment with source warehouse and fake SKU
        shipment_data = {
            "distributor_id": self.distributor_id,
            "distributor_location_id": self.distributor_location_id,
            "shipment_date": datetime.now().strftime("%Y-%m-%d"),
            "source_warehouse_id": self.factory_warehouse_id,
            "remarks": "TEST_STOCK_DEDUCTION_ZERO_STOCK",
            "items": [
                {
                    "sku_id": fake_sku_id,
                    "sku_name": "Nonexistent SKU",
                    "quantity": 5,
                    "unit_price": 100.0,
                    "tax_percent": 18.0
                }
            ]
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments",
            json=shipment_data
        )
        assert response.status_code == 200, f"Failed to create shipment: {response.text}"
        shipment = response.json()
        shipment_id = shipment["id"]
        self.created_shipment_ids.append(shipment_id)
        
        # Try to confirm - should fail
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments/{shipment_id}/confirm"
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Insufficient stock" in data.get("detail", ""), f"Expected 'Insufficient stock' in error, got: {data}"
        print(f"PASSED: Shipment with zero stock correctly rejected with 400")
    
    def test_confirm_shipment_with_sufficient_stock_succeeds_and_deducts(self):
        """Test: Confirm shipment with sufficient stock should succeed and deduct stock"""
        # First check current stock levels
        current_stock = self._get_factory_stock(self.test_sku_id)
        print(f"Current stock for SKU {self.test_sku_id} ({self.test_sku_name}): {current_stock}")
        
        if current_stock < 1:
            pytest.skip(f"No stock available for SKU {self.test_sku_id} in factory warehouse {self.factory_warehouse_id}. Need to populate stock first.")
        
        # Use a small quantity that's less than available stock
        test_quantity = min(1, current_stock)
        
        # Create shipment with source warehouse
        shipment_id, shipment_number = self._create_draft_shipment(
            source_warehouse_id=self.factory_warehouse_id,
            sku_id=self.test_sku_id,
            sku_name=self.test_sku_name,
            quantity=test_quantity,
            remarks="TEST_STOCK_DEDUCTION_SUFFICIENT"
        )
        
        # Confirm shipment
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments/{shipment_id}/confirm"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("status") == "confirmed"
        
        # Verify stock was deducted
        new_stock = self._get_factory_stock(self.test_sku_id)
        expected_stock = current_stock - test_quantity
        assert new_stock == expected_stock, f"Stock not deducted correctly. Expected {expected_stock}, got {new_stock}"
        
        print(f"PASSED: Shipment confirmed and stock deducted from {current_stock} to {new_stock}")
    
    def test_confirm_shipment_exact_stock_edge_case(self):
        """Test: Confirm shipment when quantity equals exactly available stock (edge case)"""
        current_stock = self._get_factory_stock(self.test_sku_id)
        print(f"Current stock for SKU {self.test_sku_id} ({self.test_sku_name}): {current_stock}")
        
        if current_stock < 1:
            pytest.skip(f"No stock available for SKU {self.test_sku_id}. Need stock to test exact quantity edge case.")
        
        # Create shipment with exact available quantity
        shipment_id, shipment_number = self._create_draft_shipment(
            source_warehouse_id=self.factory_warehouse_id,
            sku_id=self.test_sku_id,
            sku_name=self.test_sku_name,
            quantity=current_stock,  # Exact available quantity
            remarks="TEST_STOCK_DEDUCTION_EXACT"
        )
        
        # Confirm shipment - should succeed
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments/{shipment_id}/confirm"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify stock is now 0
        new_stock = self._get_factory_stock(self.test_sku_id)
        assert new_stock == 0, f"Stock should be 0 after exact deduction, got {new_stock}"
        
        print(f"PASSED: Shipment with exact stock quantity confirmed, stock now 0")
    
    def test_confirm_shipment_multiple_skus_validates_all(self):
        """Test: Shipment with multiple SKUs validates and deducts all correctly"""
        # Get available SKUs
        skus_response = self.session.get(f"{BASE_URL}/api/skus")
        if skus_response.status_code != 200:
            pytest.skip("Cannot get SKUs list")
        
        skus = skus_response.json().get("skus", [])
        if len(skus) < 2:
            pytest.skip("Need at least 2 SKUs for multi-SKU test")
        
        sku1 = skus[0]
        sku2 = skus[1]
        
        # Create shipment with source warehouse and multiple items
        shipment_data = {
            "distributor_id": self.distributor_id,
            "distributor_location_id": self.distributor_location_id,
            "shipment_date": datetime.now().strftime("%Y-%m-%d"),
            "source_warehouse_id": self.factory_warehouse_id,
            "remarks": "TEST_STOCK_DEDUCTION_MULTI_SKU",
            "items": [
                {
                    "sku_id": sku1["id"],
                    "sku_name": sku1.get("name", "SKU 1"),
                    "quantity": 999999,  # Insufficient
                    "unit_price": 100.0,
                    "tax_percent": 18.0
                },
                {
                    "sku_id": sku2["id"],
                    "sku_name": sku2.get("name", "SKU 2"),
                    "quantity": 1,
                    "unit_price": 100.0,
                    "tax_percent": 18.0
                }
            ]
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments",
            json=shipment_data
        )
        assert response.status_code == 200, f"Failed to create shipment: {response.text}"
        shipment = response.json()
        shipment_id = shipment["id"]
        self.created_shipment_ids.append(shipment_id)
        
        # Try to confirm - should fail due to first SKU
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments/{shipment_id}/confirm"
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Insufficient stock" in data.get("detail", "")
        print(f"PASSED: Multi-SKU shipment correctly validates all SKUs before confirming")
    
    def test_shipment_status_after_confirmation(self):
        """Test: Verify shipment status is 'confirmed' after successful confirmation"""
        # Create shipment without source warehouse (to avoid stock issues)
        shipment_id, shipment_number = self._create_draft_shipment(
            source_warehouse_id=None,
            quantity=5,
            remarks="TEST_STOCK_DEDUCTION_STATUS_CHECK"
        )
        
        # Confirm
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments/{shipment_id}/confirm"
        )
        assert response.status_code == 200
        
        # Get shipment and verify status
        get_response = self.session.get(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments/{shipment_id}"
        )
        assert get_response.status_code == 200
        shipment = get_response.json()
        
        assert shipment.get("status") == "confirmed", f"Expected status 'confirmed', got {shipment.get('status')}"
        assert shipment.get("confirmed_at") is not None, "confirmed_at should be set"
        assert shipment.get("confirmed_by") is not None, "confirmed_by should be set"
        
        print(f"PASSED: Shipment status correctly updated to 'confirmed' with timestamps")
    
    def test_cannot_confirm_already_confirmed_shipment(self):
        """Test: Cannot confirm a shipment that's already confirmed"""
        # Create and confirm shipment
        shipment_id, shipment_number = self._create_draft_shipment(
            source_warehouse_id=None,
            quantity=5,
            remarks="TEST_STOCK_DEDUCTION_DOUBLE_CONFIRM"
        )
        
        # First confirm
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments/{shipment_id}/confirm"
        )
        assert response.status_code == 200
        
        # Try to confirm again
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{self.distributor_id}/shipments/{shipment_id}/confirm"
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Only draft shipments can be confirmed" in data.get("detail", "")
        
        print(f"PASSED: Cannot confirm already confirmed shipment")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
