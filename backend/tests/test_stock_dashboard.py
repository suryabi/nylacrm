"""
Stock Dashboard API Tests
Tests for GET /api/distributors/{id}/stock-dashboard endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

# Test credentials from test_credentials.md
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"
DISTRIBUTOR_ID = "d091204f-e04f-46f2-b9a9-d92d9f89b528"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"X-Tenant-ID": TENANT_ID}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    # Login returns session_token, not token
    token = data.get("session_token") or data.get("token")
    assert token, f"No token in response: {data}"
    return token


@pytest.fixture(scope="module")
def api_headers(auth_token):
    """Headers for authenticated requests"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestStockDashboardAPI:
    """Tests for Stock Dashboard endpoint"""
    
    def test_stock_dashboard_returns_200(self, api_headers):
        """Test that stock dashboard endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=api_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Stock dashboard endpoint returns 200")
    
    def test_stock_dashboard_has_required_fields(self, api_headers):
        """Test that response has all required top-level fields"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required top-level fields
        required_fields = ["distributor_id", "distributor_name", "generated_at", "totals", "bottle_tracking", "sku_count", "skus"]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        print(f"✓ Response has all required fields: {required_fields}")
    
    def test_stock_dashboard_totals_structure(self, api_headers):
        """Test that totals object has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        totals = data.get("totals", {})
        required_total_fields = ["stock_received", "stock_delivered", "stock_at_hand", "customer_returns", "factory_returns", "pct_stock_at_hand"]
        
        for field in required_total_fields:
            assert field in totals, f"Missing totals field: {field}"
        
        print(f"✓ Totals has all required fields: {required_total_fields}")
        print(f"  - Stock Received: {totals.get('stock_received')}")
        print(f"  - Stock Delivered: {totals.get('stock_delivered')}")
        print(f"  - Customer Returns: {totals.get('customer_returns')}")
        print(f"  - Factory Returns: {totals.get('factory_returns')}")
        print(f"  - Stock at Hand: {totals.get('stock_at_hand')}")
        print(f"  - % Stock at Hand: {totals.get('pct_stock_at_hand')}")
    
    def test_stock_dashboard_bottle_tracking_structure(self, api_headers):
        """Test that bottle_tracking object has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        bottle_tracking = data.get("bottle_tracking", {})
        required_bt_fields = ["empty_reusable", "damaged", "expired", "pending_factory_return"]
        
        for field in required_bt_fields:
            assert field in bottle_tracking, f"Missing bottle_tracking field: {field}"
        
        print(f"✓ Bottle tracking has all required fields: {required_bt_fields}")
        print(f"  - Empty/Reusable: {bottle_tracking.get('empty_reusable')}")
        print(f"  - Damaged: {bottle_tracking.get('damaged')}")
        print(f"  - Expired: {bottle_tracking.get('expired')}")
        print(f"  - Pending Factory Return: {bottle_tracking.get('pending_factory_return')}")
    
    def test_stock_dashboard_skus_array(self, api_headers):
        """Test that skus array exists and has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        skus = data.get("skus", [])
        assert isinstance(skus, list), "skus should be a list"
        
        sku_count = data.get("sku_count", 0)
        assert len(skus) == sku_count, f"SKU count mismatch: {len(skus)} vs {sku_count}"
        
        print(f"✓ SKUs array has {len(skus)} items matching sku_count")
    
    def test_stock_dashboard_sku_item_structure(self, api_headers):
        """Test that each SKU item has all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        skus = data.get("skus", [])
        if len(skus) == 0:
            pytest.skip("No SKUs in response to validate")
        
        required_sku_fields = [
            "sku_id", "sku_name", "stock_received", "stock_delivered",
            "customer_returns", "factory_returns", "stock_at_hand",
            "pct_stock_at_hand", "weekly_avg_deliveries", "days_of_stock"
        ]
        
        for sku in skus:
            for field in required_sku_fields:
                assert field in sku, f"SKU {sku.get('sku_name', 'unknown')} missing field: {field}"
        
        print(f"✓ All {len(skus)} SKUs have required fields")
        
        # Print SKU details
        for sku in skus:
            print(f"  - {sku.get('sku_name')}: Received={sku.get('stock_received')}, Delivered={sku.get('stock_delivered')}, At Hand={sku.get('stock_at_hand')}")
    
    def test_stock_dashboard_sku_has_return_breakdowns(self, api_headers):
        """Test that SKUs have customer_returns_breakdown and factory_returns_breakdown"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        skus = data.get("skus", [])
        if len(skus) == 0:
            pytest.skip("No SKUs in response to validate")
        
        for sku in skus:
            assert "customer_returns_breakdown" in sku, f"SKU {sku.get('sku_name')} missing customer_returns_breakdown"
            assert "factory_returns_breakdown" in sku, f"SKU {sku.get('sku_name')} missing factory_returns_breakdown"
            
            # Check breakdown structure
            cr_breakdown = sku.get("customer_returns_breakdown", {})
            assert "empty_reusable" in cr_breakdown, "customer_returns_breakdown missing empty_reusable"
            assert "damaged" in cr_breakdown, "customer_returns_breakdown missing damaged"
            assert "expired" in cr_breakdown, "customer_returns_breakdown missing expired"
            
            fr_breakdown = sku.get("factory_returns_breakdown", {})
            assert "empty_reusable" in fr_breakdown, "factory_returns_breakdown missing empty_reusable"
            assert "damaged" in fr_breakdown, "factory_returns_breakdown missing damaged"
            assert "expired" in fr_breakdown, "factory_returns_breakdown missing expired"
        
        print(f"✓ All SKUs have return breakdown structures")
    
    def test_stock_dashboard_data_consistency(self, api_headers):
        """Test that totals match sum of SKU values"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers=api_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        totals = data.get("totals", {})
        skus = data.get("skus", [])
        
        # Calculate sums from SKUs
        sum_received = sum(sku.get("stock_received", 0) for sku in skus)
        sum_delivered = sum(sku.get("stock_delivered", 0) for sku in skus)
        sum_at_hand = sum(sku.get("stock_at_hand", 0) for sku in skus)
        sum_cust_returns = sum(sku.get("customer_returns", 0) for sku in skus)
        sum_factory_returns = sum(sku.get("factory_returns", 0) for sku in skus)
        
        # Verify totals match
        assert totals.get("stock_received") == sum_received, f"stock_received mismatch: {totals.get('stock_received')} vs {sum_received}"
        assert totals.get("stock_delivered") == sum_delivered, f"stock_delivered mismatch: {totals.get('stock_delivered')} vs {sum_delivered}"
        assert totals.get("stock_at_hand") == sum_at_hand, f"stock_at_hand mismatch: {totals.get('stock_at_hand')} vs {sum_at_hand}"
        assert totals.get("customer_returns") == sum_cust_returns, f"customer_returns mismatch: {totals.get('customer_returns')} vs {sum_cust_returns}"
        assert totals.get("factory_returns") == sum_factory_returns, f"factory_returns mismatch: {totals.get('factory_returns')} vs {sum_factory_returns}"
        
        print(f"✓ Totals are consistent with SKU sums")
    
    def test_stock_dashboard_invalid_distributor(self, api_headers):
        """Test that invalid distributor ID returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/invalid-distributor-id/stock-dashboard",
            headers=api_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Invalid distributor returns 404")
    
    def test_stock_dashboard_unauthorized(self):
        """Test that unauthenticated request returns 401"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/stock-dashboard",
            headers={"X-Tenant-ID": TENANT_ID}
        )
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Unauthenticated request returns {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
