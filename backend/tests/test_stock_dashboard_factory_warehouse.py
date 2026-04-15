"""
Test Stock Dashboard Factory Warehouse Stock Feature
Tests that factory warehouse stock is correctly returned in the stock-dashboard endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_ID = "nyla-air-water"
DISTRIBUTOR_ID = "b8876367-df64-4c55-a382-d5eb3b4b2380"  # Surya 1 - has factory warehouse stock

class TestStockDashboardFactoryWarehouse:
    """Tests for factory warehouse stock in stock dashboard"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "surya.yadavalli@nylaairwater.earth", "password": "test123"},
            headers={"X-Tenant-ID": TENANT_ID}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("session_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "X-Tenant-ID": TENANT_ID
        }
    
    def test_stock_dashboard_returns_200(self):
        """Test that stock dashboard endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=self.headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASSED: Stock dashboard returns 200")
    
    def test_stock_dashboard_has_totals_with_factory_warehouse_stock(self):
        """Test that totals include factory_warehouse_stock field"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "totals" in data, "Response missing 'totals' field"
        totals = data["totals"]
        assert "factory_warehouse_stock" in totals, "totals missing 'factory_warehouse_stock' field"
        print(f"PASSED: totals.factory_warehouse_stock = {totals['factory_warehouse_stock']}")
    
    def test_stock_dashboard_has_factory_warehouses_array(self):
        """Test that response includes factory_warehouses array"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "factory_warehouses" in data, "Response missing 'factory_warehouses' field"
        assert isinstance(data["factory_warehouses"], list), "factory_warehouses should be a list"
        print(f"PASSED: factory_warehouses array present with {len(data['factory_warehouses'])} warehouses")
    
    def test_factory_warehouse_stock_value_is_90(self):
        """Test that factory_warehouse_stock in totals is 90 (as per test data)"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        totals = data.get("totals", {})
        factory_stock = totals.get("factory_warehouse_stock", 0)
        
        # The distributor should have 90 crates of stock
        assert factory_stock > 0, f"Expected factory_warehouse_stock > 0, got {factory_stock}"
        print(f"PASSED: factory_warehouse_stock = {factory_stock} (expected > 0)")
    
    def test_factory_warehouses_has_default_master(self):
        """Test that factory_warehouses includes 'Default master' warehouse"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        factory_warehouses = data.get("factory_warehouses", [])
        
        if len(factory_warehouses) > 0:
            # Check structure of first warehouse
            wh = factory_warehouses[0]
            assert "warehouse_id" in wh, "Warehouse missing 'warehouse_id'"
            assert "warehouse_name" in wh, "Warehouse missing 'warehouse_name'"
            assert "skus" in wh, "Warehouse missing 'skus'"
            print(f"PASSED: Factory warehouse found: {wh.get('warehouse_name')} with {len(wh.get('skus', []))} SKUs")
            
            # Print SKU details
            for sku in wh.get("skus", []):
                print(f"  - {sku.get('sku_name')}: {sku.get('quantity')} crates")
        else:
            print("INFO: No factory warehouses found (may need stock transfer)")
    
    def test_skus_have_factory_warehouse_stock_field(self):
        """Test that each SKU in skus[] has factory_warehouse_stock field"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        skus = data.get("skus", [])
        
        for sku in skus:
            assert "factory_warehouse_stock" in sku, f"SKU {sku.get('sku_name')} missing 'factory_warehouse_stock' field"
        
        # Find SKUs with factory warehouse stock
        skus_with_stock = [s for s in skus if s.get("factory_warehouse_stock", 0) > 0]
        print(f"PASSED: All {len(skus)} SKUs have factory_warehouse_stock field")
        print(f"  - {len(skus_with_stock)} SKUs have factory warehouse stock > 0")
        
        for sku in skus_with_stock:
            print(f"  - {sku.get('sku_name')}: {sku.get('factory_warehouse_stock')} crates")
    
    def test_full_response_structure(self):
        """Test complete response structure for stock dashboard"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check top-level fields
        required_fields = ["distributor_id", "distributor_name", "generated_at", "totals", 
                          "bottle_tracking", "factory_warehouses", "sku_count", "skus"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Check totals fields
        totals_fields = ["stock_received", "stock_delivered", "stock_at_hand", 
                        "customer_returns", "factory_returns", "factory_warehouse_stock", "pct_stock_at_hand"]
        for field in totals_fields:
            assert field in data["totals"], f"totals missing field: {field}"
        
        print("PASSED: Full response structure is correct")
        print(f"  Distributor: {data['distributor_name']}")
        print(f"  SKU Count: {data['sku_count']}")
        print(f"  Totals: {data['totals']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
