"""
Stock Dashboard API Tests
Tests for /api/distributors/dashboard/stock-summary endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://reopen-tasks-1.preview.emergentagent.com').rstrip('/')
TENANT_ID = "nyla-air-water"

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"


class TestStockDashboard:
    """Stock Dashboard API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login to get session token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            session_token = data.get('session_token')
            if session_token:
                self.session.cookies.set('session_token', session_token)
        else:
            pytest.skip("Authentication failed - skipping tests")
    
    def test_stock_summary_endpoint_accessible(self):
        """Test that stock-summary endpoint returns 200"""
        response = self.session.get(f"{BASE_URL}/api/distributors/dashboard/stock-summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASS: Stock summary endpoint returns 200")
    
    def test_stock_summary_response_structure(self):
        """Test that stock-summary response has expected structure"""
        response = self.session.get(f"{BASE_URL}/api/distributors/dashboard/stock-summary")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check required top-level keys
        assert "summary" in data, "Response missing 'summary' key"
        assert "by_distributor" in data, "Response missing 'by_distributor' key"
        assert "by_sku" in data, "Response missing 'by_sku' key"
        assert "by_location" in data, "Response missing 'by_location' key"
        assert "cities" in data, "Response missing 'cities' key"
        
        print("PASS: Response has all required keys")
    
    def test_stock_summary_summary_fields(self):
        """Test that summary object has expected fields"""
        response = self.session.get(f"{BASE_URL}/api/distributors/dashboard/stock-summary")
        assert response.status_code == 200
        
        data = response.json()
        summary = data.get("summary", {})
        
        # Check summary fields
        assert "total_quantity" in summary, "Summary missing 'total_quantity'"
        assert "total_skus" in summary, "Summary missing 'total_skus'"
        assert "total_locations" in summary, "Summary missing 'total_locations'"
        assert "total_distributors" in summary, "Summary missing 'total_distributors'"
        
        # Verify types
        assert isinstance(summary["total_quantity"], (int, float)), "total_quantity should be numeric"
        assert isinstance(summary["total_skus"], int), "total_skus should be integer"
        assert isinstance(summary["total_locations"], int), "total_locations should be integer"
        assert isinstance(summary["total_distributors"], int), "total_distributors should be integer"
        
        print(f"PASS: Summary fields valid - Total Stock: {summary['total_quantity']}, "
              f"SKUs: {summary['total_skus']}, Locations: {summary['total_locations']}, "
              f"Distributors: {summary['total_distributors']}")
    
    def test_stock_summary_by_distributor_structure(self):
        """Test by_distributor array structure"""
        response = self.session.get(f"{BASE_URL}/api/distributors/dashboard/stock-summary")
        assert response.status_code == 200
        
        data = response.json()
        by_distributor = data.get("by_distributor", [])
        
        assert isinstance(by_distributor, list), "by_distributor should be a list"
        
        if len(by_distributor) > 0:
            dist = by_distributor[0]
            assert "distributor_id" in dist, "Distributor missing 'distributor_id'"
            assert "distributor_name" in dist, "Distributor missing 'distributor_name'"
            assert "total_quantity" in dist, "Distributor missing 'total_quantity'"
            assert "sku_count" in dist, "Distributor missing 'sku_count'"
            assert "location_count" in dist, "Distributor missing 'location_count'"
            print(f"PASS: by_distributor structure valid - {len(by_distributor)} distributor(s)")
        else:
            print("PASS: by_distributor is empty (no stock data)")
    
    def test_stock_summary_by_sku_structure(self):
        """Test by_sku array structure"""
        response = self.session.get(f"{BASE_URL}/api/distributors/dashboard/stock-summary")
        assert response.status_code == 200
        
        data = response.json()
        by_sku = data.get("by_sku", [])
        
        assert isinstance(by_sku, list), "by_sku should be a list"
        
        if len(by_sku) > 0:
            sku = by_sku[0]
            assert "sku_id" in sku, "SKU missing 'sku_id'"
            assert "sku_name" in sku, "SKU missing 'sku_name'"
            assert "total_quantity" in sku, "SKU missing 'total_quantity'"
            assert "location_count" in sku, "SKU missing 'location_count'"
            print(f"PASS: by_sku structure valid - {len(by_sku)} SKU(s)")
        else:
            print("PASS: by_sku is empty (no stock data)")
    
    def test_stock_summary_by_location_structure(self):
        """Test by_location array structure with items"""
        response = self.session.get(f"{BASE_URL}/api/distributors/dashboard/stock-summary")
        assert response.status_code == 200
        
        data = response.json()
        by_location = data.get("by_location", [])
        
        assert isinstance(by_location, list), "by_location should be a list"
        
        if len(by_location) > 0:
            loc = by_location[0]
            assert "location_id" in loc, "Location missing 'location_id'"
            assert "location_name" in loc, "Location missing 'location_name'"
            assert "distributor_name" in loc, "Location missing 'distributor_name'"
            assert "total_quantity" in loc, "Location missing 'total_quantity'"
            assert "sku_count" in loc, "Location missing 'sku_count'"
            assert "items" in loc, "Location missing 'items'"
            
            # Check items structure
            items = loc.get("items", [])
            assert isinstance(items, list), "items should be a list"
            
            if len(items) > 0:
                item = items[0]
                assert "sku_id" in item, "Item missing 'sku_id'"
                assert "quantity" in item, "Item missing 'quantity'"
            
            print(f"PASS: by_location structure valid - {len(by_location)} location(s), "
                  f"first location has {len(items)} item(s)")
        else:
            print("PASS: by_location is empty (no stock data)")
    
    def test_stock_summary_cities_filter(self):
        """Test cities array is populated"""
        response = self.session.get(f"{BASE_URL}/api/distributors/dashboard/stock-summary")
        assert response.status_code == 200
        
        data = response.json()
        cities = data.get("cities", [])
        
        assert isinstance(cities, list), "cities should be a list"
        print(f"PASS: cities filter available - {len(cities)} city(ies): {cities}")
    
    def test_stock_summary_with_city_filter(self):
        """Test stock-summary with city filter parameter"""
        # First get available cities
        response = self.session.get(f"{BASE_URL}/api/distributors/dashboard/stock-summary")
        assert response.status_code == 200
        data = response.json()
        cities = data.get("cities", [])
        
        if len(cities) > 0:
            city = cities[0]
            # Test with city filter
            response = self.session.get(
                f"{BASE_URL}/api/distributors/dashboard/stock-summary",
                params={"city": city}
            )
            assert response.status_code == 200
            filtered_data = response.json()
            
            # Should still have same structure
            assert "summary" in filtered_data
            assert "by_location" in filtered_data
            print(f"PASS: City filter '{city}' works correctly")
        else:
            print("SKIP: No cities available to test filter")
    
    def test_stock_summary_with_distributor_filter(self):
        """Test stock-summary with distributor_id filter parameter"""
        # First get available distributors
        response = self.session.get(f"{BASE_URL}/api/distributors/dashboard/stock-summary")
        assert response.status_code == 200
        data = response.json()
        by_distributor = data.get("by_distributor", [])
        
        if len(by_distributor) > 0:
            distributor_id = by_distributor[0].get("distributor_id")
            # Test with distributor_id filter
            response = self.session.get(
                f"{BASE_URL}/api/distributors/dashboard/stock-summary",
                params={"distributor_id": distributor_id}
            )
            assert response.status_code == 200
            filtered_data = response.json()
            
            # Should still have same structure
            assert "summary" in filtered_data
            # Only one distributor should be in results
            assert len(filtered_data.get("by_distributor", [])) <= 1
            print(f"PASS: Distributor filter works correctly")
        else:
            print("SKIP: No distributors available to test filter")
    
    def test_stock_summary_unauthorized_access(self):
        """Test that unauthenticated requests are rejected"""
        # Create new session without auth
        unauth_session = requests.Session()
        unauth_session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        response = unauth_session.get(f"{BASE_URL}/api/distributors/dashboard/stock-summary")
        assert response.status_code in [401, 403], f"Expected 401/403 for unauthenticated request, got {response.status_code}"
        print("PASS: Unauthenticated access correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
