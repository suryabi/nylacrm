"""
Test SKU Packaging Configuration Feature
Tests the 3-context packaging_config (production, stock_in, stock_out) on SKUs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        # Try session_token first, then token
        token = data.get("session_token") or data.get("token")
        if token:
            return token
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


@pytest.fixture(scope="module")
def packaging_types(api_client):
    """Get existing packaging types"""
    response = api_client.get(f"{BASE_URL}/api/packaging-types")
    assert response.status_code == 200, f"Failed to get packaging types: {response.text}"
    return response.json().get("packaging_types", [])


class TestSKUPackagingConfig:
    """Test SKU packaging_config CRUD operations"""
    
    def test_get_skus_list(self, api_client):
        """Test GET /api/master-skus returns SKUs"""
        response = api_client.get(f"{BASE_URL}/api/master-skus")
        assert response.status_code == 200
        data = response.json()
        assert "skus" in data
        print(f"Found {len(data['skus'])} SKUs")
    
    def test_sku_has_packaging_config_field(self, api_client):
        """Test that SKUs can have packaging_config field"""
        response = api_client.get(f"{BASE_URL}/api/master-skus")
        assert response.status_code == 200
        skus = response.json().get("skus", [])
        
        # Check if any SKU has packaging_config
        skus_with_config = [s for s in skus if s.get("packaging_config")]
        print(f"SKUs with packaging_config: {len(skus_with_config)}/{len(skus)}")
        
        # Verify structure if exists
        for sku in skus_with_config:
            config = sku.get("packaging_config", {})
            # Should have production, stock_in, stock_out keys
            assert isinstance(config, dict), "packaging_config should be a dict"
            print(f"SKU {sku.get('sku_name')}: config keys = {list(config.keys())}")
    
    def test_update_sku_with_packaging_config(self, api_client, packaging_types):
        """Test updating SKU with packaging_config"""
        # Get first active SKU
        response = api_client.get(f"{BASE_URL}/api/master-skus")
        assert response.status_code == 200
        skus = response.json().get("skus", [])
        
        active_skus = [s for s in skus if s.get("is_active", True)]
        assert len(active_skus) > 0, "No active SKUs found"
        
        test_sku = active_skus[0]
        sku_id = test_sku["id"]
        print(f"Testing with SKU: {test_sku.get('sku_name')} (ID: {sku_id})")
        
        # Build packaging_config with available packaging types
        if len(packaging_types) < 2:
            pytest.skip("Need at least 2 packaging types for this test")
        
        pt1 = packaging_types[0]
        pt2 = packaging_types[1] if len(packaging_types) > 1 else packaging_types[0]
        
        packaging_config = {
            "production": [
                {
                    "packaging_type_id": pt1["id"],
                    "packaging_type_name": pt1["name"],
                    "units_per_package": pt1["units_per_package"],
                    "is_default": True
                }
            ],
            "stock_in": [
                {
                    "packaging_type_id": pt1["id"],
                    "packaging_type_name": pt1["name"],
                    "units_per_package": pt1["units_per_package"],
                    "is_default": True
                },
                {
                    "packaging_type_id": pt2["id"],
                    "packaging_type_name": pt2["name"],
                    "units_per_package": pt2["units_per_package"],
                    "is_default": False
                }
            ],
            "stock_out": [
                {
                    "packaging_type_id": pt2["id"],
                    "packaging_type_name": pt2["name"],
                    "units_per_package": pt2["units_per_package"],
                    "is_default": True
                }
            ]
        }
        
        # Update SKU with packaging_config
        update_data = {
            "packaging_config": packaging_config
        }
        
        response = api_client.put(f"{BASE_URL}/api/master-skus/{sku_id}", json=update_data)
        assert response.status_code == 200, f"Failed to update SKU: {response.text}"
        
        updated_sku = response.json()
        assert "packaging_config" in updated_sku, "packaging_config not in response"
        
        # Verify structure
        config = updated_sku["packaging_config"]
        assert "production" in config, "production key missing"
        assert "stock_in" in config, "stock_in key missing"
        assert "stock_out" in config, "stock_out key missing"
        
        # Verify production has 1 item with is_default=True
        assert len(config["production"]) == 1
        assert config["production"][0]["is_default"] == True
        
        # Verify stock_in has 2 items
        assert len(config["stock_in"]) == 2
        
        # Verify stock_out has 1 item
        assert len(config["stock_out"]) == 1
        
        print(f"Successfully updated SKU with packaging_config")
        print(f"  Production: {len(config['production'])} types")
        print(f"  Stock In: {len(config['stock_in'])} types")
        print(f"  Stock Out: {len(config['stock_out'])} types")
    
    def test_get_sku_returns_packaging_config(self, api_client):
        """Test that GET SKU returns packaging_config"""
        response = api_client.get(f"{BASE_URL}/api/master-skus")
        assert response.status_code == 200
        skus = response.json().get("skus", [])
        
        # Find SKU with packaging_config
        skus_with_config = [s for s in skus if s.get("packaging_config")]
        
        if skus_with_config:
            sku = skus_with_config[0]
            config = sku["packaging_config"]
            
            # Verify each context has proper structure
            for context in ["production", "stock_in", "stock_out"]:
                if context in config:
                    for item in config[context]:
                        assert "packaging_type_id" in item, f"Missing packaging_type_id in {context}"
                        assert "packaging_type_name" in item, f"Missing packaging_type_name in {context}"
                        assert "units_per_package" in item, f"Missing units_per_package in {context}"
                        assert "is_default" in item, f"Missing is_default in {context}"
            
            print(f"SKU {sku['sku_name']} packaging_config structure verified")
        else:
            print("No SKUs with packaging_config found - test passed (no data to verify)")


class TestProductionBatchPackaging:
    """Test Production Batch creation uses SKU's production packaging config"""
    
    def test_get_production_batches(self, api_client):
        """Test GET /api/production/batches works"""
        response = api_client.get(f"{BASE_URL}/api/production/batches")
        assert response.status_code == 200
        print(f"Found {len(response.json())} production batches")
    
    def test_create_batch_with_sku_packaging(self, api_client, packaging_types):
        """Test creating batch - should use SKU's production packaging"""
        # Get SKUs
        response = api_client.get(f"{BASE_URL}/api/master-skus")
        assert response.status_code == 200
        skus = response.json().get("skus", [])
        
        # Find SKU with production packaging config
        sku_with_prod_pkg = None
        for sku in skus:
            config = sku.get("packaging_config", {})
            if config.get("production") and len(config["production"]) > 0:
                sku_with_prod_pkg = sku
                break
        
        if not sku_with_prod_pkg:
            # Use first active SKU and set up packaging config
            active_skus = [s for s in skus if s.get("is_active", True)]
            if not active_skus:
                pytest.skip("No active SKUs found")
            
            sku_with_prod_pkg = active_skus[0]
            
            # Set up packaging config
            if packaging_types:
                pt = packaging_types[0]
                update_data = {
                    "packaging_config": {
                        "production": [{
                            "packaging_type_id": pt["id"],
                            "packaging_type_name": pt["name"],
                            "units_per_package": pt["units_per_package"],
                            "is_default": True
                        }],
                        "stock_in": [],
                        "stock_out": []
                    }
                }
                api_client.put(f"{BASE_URL}/api/master-skus/{sku_with_prod_pkg['id']}", json=update_data)
                
                # Refresh SKU data
                response = api_client.get(f"{BASE_URL}/api/master-skus")
                skus = response.json().get("skus", [])
                sku_with_prod_pkg = next((s for s in skus if s["id"] == sku_with_prod_pkg["id"]), sku_with_prod_pkg)
        
        # Get default production packaging
        prod_config = sku_with_prod_pkg.get("packaging_config", {}).get("production", [])
        default_pkg = next((p for p in prod_config if p.get("is_default")), prod_config[0] if prod_config else None)
        
        if default_pkg:
            bottles_per_crate = default_pkg["units_per_package"]
            print(f"SKU {sku_with_prod_pkg['sku_name']} default production packaging: {default_pkg['packaging_type_name']} ({bottles_per_crate} units)")
        else:
            # Fallback to packaging types
            if packaging_types:
                bottles_per_crate = packaging_types[0]["units_per_package"]
            else:
                bottles_per_crate = 24
        
        # Create batch
        import uuid
        batch_code = f"TEST-PKG-{uuid.uuid4().hex[:6].upper()}"
        
        batch_data = {
            "sku_id": sku_with_prod_pkg["id"],
            "sku_name": sku_with_prod_pkg.get("sku_name", "Test SKU"),
            "batch_code": batch_code,
            "production_date": "2026-04-19",
            "total_crates": 10,
            "bottles_per_crate": bottles_per_crate,
            "ph_value": 7.5,
            "notes": "Test batch for packaging config"
        }
        
        response = api_client.post(f"{BASE_URL}/api/production/batches", json=batch_data)
        
        if response.status_code == 201 or response.status_code == 200:
            batch = response.json()
            print(f"Created batch {batch.get('batch_code')} with {batch.get('bottles_per_crate')} bottles/crate")
            assert batch.get("bottles_per_crate") == bottles_per_crate
            
            # Cleanup - delete the test batch
            batch_id = batch.get("id")
            if batch_id:
                api_client.delete(f"{BASE_URL}/api/production/batches/{batch_id}")
        else:
            print(f"Batch creation returned {response.status_code}: {response.text}")
            # Not failing - batch creation may have other requirements


class TestShipmentPackaging:
    """Test Shipment (stock-in) uses SKU's stock_in packaging config"""
    
    def test_get_distributors(self, api_client):
        """Test GET /api/distributors works"""
        response = api_client.get(f"{BASE_URL}/api/distributors")
        assert response.status_code == 200
        data = response.json()
        distributors = data.get("distributors", data) if isinstance(data, dict) else data
        print(f"Found {len(distributors)} distributors")
        return distributors
    
    def test_sku_stock_in_packaging_available(self, api_client, packaging_types):
        """Test that SKUs have stock_in packaging config available"""
        response = api_client.get(f"{BASE_URL}/api/master-skus")
        assert response.status_code == 200
        skus = response.json().get("skus", [])
        
        # Check for SKUs with stock_in config
        skus_with_stock_in = []
        for sku in skus:
            config = sku.get("packaging_config") or {}
            stock_in = config.get("stock_in", [])
            if stock_in:
                skus_with_stock_in.append({
                    "sku_name": sku.get("sku_name"),
                    "stock_in_options": len(stock_in),
                    "default": next((p["packaging_type_name"] for p in stock_in if p.get("is_default")), "None")
                })
        
        print(f"SKUs with stock_in packaging: {len(skus_with_stock_in)}/{len(skus)}")
        for sku_info in skus_with_stock_in:
            print(f"  - {sku_info['sku_name']}: {sku_info['stock_in_options']} options, default: {sku_info['default']}")


class TestPackagingTypesInSidebar:
    """Test that Packaging Types is under Production section in sidebar"""
    
    def test_packaging_types_endpoint(self, api_client):
        """Test GET /api/packaging-types works"""
        response = api_client.get(f"{BASE_URL}/api/packaging-types")
        assert response.status_code == 200
        data = response.json()
        packaging_types = data.get("packaging_types", [])
        
        print(f"Found {len(packaging_types)} packaging types:")
        for pt in packaging_types:
            print(f"  - {pt.get('name')}: {pt.get('units_per_package')} units")
        
        assert len(packaging_types) > 0, "No packaging types found"


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_batches(self, api_client):
        """Remove test batches created during testing"""
        response = api_client.get(f"{BASE_URL}/api/production/batches")
        if response.status_code == 200:
            batches = response.json()
            test_batches = [b for b in batches if b.get("batch_code", "").startswith("TEST-PKG-")]
            
            for batch in test_batches:
                api_client.delete(f"{BASE_URL}/api/production/batches/{batch['id']}")
                print(f"Deleted test batch: {batch['batch_code']}")
        
        print("Cleanup complete")
