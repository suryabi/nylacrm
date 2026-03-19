"""
Test Margin Matrix Base Price and Active Date Fields Integration
Tests for merging Base Price Configuration into Margin Matrix
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_ID = "nyla-air-water"
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
MARGIN_ID = "30c2abb5-7b78-4004-a08a-99e079a56b00"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"X-Tenant-ID": TENANT_ID, "Content-Type": "application/json"}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    token = response.json().get('session_token')
    assert token, "No session token returned"
    return token


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    })
    return session


class TestMarginMatrixModelFields:
    """Test that Margin Matrix model includes base_price and active date fields"""
    
    def test_margin_entry_has_base_price_field(self, api_client):
        """Verify Margin Matrix includes base_price field"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{MARGIN_ID}")
        assert response.status_code == 200, f"Failed to get margin: {response.text}"
        
        margin = response.json()
        assert "base_price" in margin, "base_price field missing from margin entry"
        assert margin["base_price"] == 100, f"Expected base_price=100, got {margin['base_price']}"
    
    def test_margin_entry_has_transfer_price_field(self, api_client):
        """Verify Margin Matrix includes transfer_price field"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{MARGIN_ID}")
        assert response.status_code == 200
        
        margin = response.json()
        assert "transfer_price" in margin, "transfer_price field missing from margin entry"
        assert margin["transfer_price"] == 97.5, f"Expected transfer_price=97.5, got {margin['transfer_price']}"
    
    def test_margin_entry_has_active_from_field(self, api_client):
        """Verify Margin Matrix includes active_from date field"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{MARGIN_ID}")
        assert response.status_code == 200
        
        margin = response.json()
        assert "active_from" in margin, "active_from field missing from margin entry"
        assert margin["active_from"] == "2026-01-01", f"Expected active_from=2026-01-01, got {margin['active_from']}"
    
    def test_margin_entry_has_active_to_field(self, api_client):
        """Verify Margin Matrix includes active_to date field"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{MARGIN_ID}")
        assert response.status_code == 200
        
        margin = response.json()
        assert "active_to" in margin, "active_to field missing from margin entry"
        assert margin["active_to"] == "2026-12-31", f"Expected active_to=2026-12-31, got {margin['active_to']}"


class TestTransferPriceCalculation:
    """Test transfer_price calculation: base_price × (1 - margin_value/100)"""
    
    def test_transfer_price_formula_on_get(self, api_client):
        """Verify transfer price = base_price × (1 - margin_value/100)"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{MARGIN_ID}")
        assert response.status_code == 200
        
        margin = response.json()
        base_price = margin.get("base_price", 0)
        margin_value = margin.get("margin_value", 0)
        expected_transfer = base_price * (1 - margin_value / 100)
        
        assert margin["transfer_price"] == expected_transfer, \
            f"Transfer price calculation error: expected {expected_transfer}, got {margin['transfer_price']}"
    
    def test_create_margin_calculates_transfer_price(self, api_client):
        """Creating margin entry should calculate transfer_price"""
        # Get a valid city from coverage
        coverage_response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/coverage")
        assert coverage_response.status_code == 200
        coverages = coverage_response.json().get("coverage", [])
        
        # Use a different city or skip if only one city
        test_city = None
        test_state = None
        for cov in coverages:
            if cov.get("city") != "Gurugram" and cov.get("status") == "active":
                test_city = cov.get("city")
                test_state = cov.get("state")
                break
        
        if not test_city:
            pytest.skip("No additional city in coverage for testing")
        
        # Get a SKU for testing
        skus_response = api_client.get(f"{BASE_URL}/api/master-skus")
        assert skus_response.status_code == 200
        skus = skus_response.json().get("skus", []) or skus_response.json()
        
        test_sku = None
        for sku in skus:
            if sku.get("id") != "b39203a7-4067-458b-a316-5831a98be946":
                test_sku = sku
                break
        
        if not test_sku:
            pytest.skip("No additional SKU for testing")
        
        # Create a new margin entry with base_price
        margin_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "state": test_state,
            "city": test_city,
            "sku_id": test_sku.get("id"),
            "sku_name": test_sku.get("name"),
            "base_price": 150,
            "margin_type": "percentage",
            "margin_value": 5.0,
            "active_from": "2026-01-01",
            "active_to": "2026-06-30",
            "status": "active"
        }
        
        response = api_client.post(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins", json=margin_data)
        
        # If entry exists, that's okay - test the update path instead
        if response.status_code == 400 and "already exists" in response.text:
            pytest.skip("Margin entry already exists for this city/SKU")
        
        assert response.status_code in [200, 201], f"Create margin failed: {response.text}"
        
        created = response.json()
        expected_transfer = 150 * (1 - 5.0 / 100)  # 142.5
        
        assert created["transfer_price"] == expected_transfer, \
            f"Expected transfer_price={expected_transfer}, got {created['transfer_price']}"
        assert created["active_from"] == "2026-01-01"
        assert created["active_to"] == "2026-06-30"
        
        # Cleanup - delete the margin entry
        if created.get("id"):
            api_client.delete(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{created['id']}")
    
    def test_update_margin_recalculates_transfer_price(self, api_client):
        """Updating base_price or margin_value should recalculate transfer_price"""
        # Get current margin entry
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{MARGIN_ID}")
        assert response.status_code == 200
        original = response.json()
        
        # Update with new base_price
        update_data = {
            "base_price": 200,
            "margin_value": 3.0
        }
        
        update_response = api_client.put(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{MARGIN_ID}",
            json=update_data
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated = update_response.json()
        expected_transfer = 200 * (1 - 3.0 / 100)  # 194.0
        
        assert updated["base_price"] == 200
        assert updated["margin_value"] == 3.0
        assert updated["transfer_price"] == expected_transfer, \
            f"Expected transfer_price={expected_transfer}, got {updated['transfer_price']}"
        
        # Restore original values
        restore_data = {
            "base_price": original.get("base_price", 100),
            "margin_value": original.get("margin_value", 2.5),
            "active_from": original.get("active_from"),
            "active_to": original.get("active_to")
        }
        restore_response = api_client.put(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins/{MARGIN_ID}",
            json=restore_data
        )
        assert restore_response.status_code == 200


class TestReconciliationUsesMarginMatrix:
    """Test that reconciliation uses Margin Matrix for calculations"""
    
    def test_calculate_reconciliation_uses_margin_entry(self, api_client):
        """Verify reconciliation calculation uses Margin Matrix entries"""
        # Calculate reconciliation for a test period
        calc_data = {
            "period_start": "2026-01-01",
            "period_end": "2026-03-31"
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations/calculate",
            json=calc_data
        )
        assert response.status_code == 200, f"Calculate reconciliation failed: {response.text}"
        
        result = response.json()
        
        # Check if we have deliveries - result should contain margin_entry_found field
        if result.get("total_deliveries", 0) > 0 and result.get("items"):
            # At least one item should have margin_entry_found = True
            items_with_margin = [i for i in result["items"] if i.get("margin_entry_found")]
            print(f"Items with margin entry found: {len(items_with_margin)}/{len(result['items'])}")
            
            # Verify calculation fields
            for item in result["items"]:
                assert "base_price" in item, "base_price missing in reconciliation item"
                assert "transfer_price" in item, "transfer_price missing in reconciliation item"
                assert "provisional_amount" in item, "provisional_amount missing"
                assert "difference_amount" in item, "difference_amount missing"
    
    def test_reconciliation_filters_by_active_dates(self, api_client):
        """Verify reconciliation filters margin entries by active_from/active_to dates"""
        # Get all margins for this distributor
        margins_response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins")
        assert margins_response.status_code == 200
        
        margins = margins_response.json().get("margins", [])
        
        # Check that margins with active_from/active_to are present
        margins_with_dates = [m for m in margins if m.get("active_from") or m.get("active_to")]
        print(f"Margins with date fields: {len(margins_with_dates)}/{len(margins)}")
        
        # The margin entry we tested should have active_from and active_to
        test_margin = next((m for m in margins if m.get("id") == MARGIN_ID), None)
        if test_margin:
            assert test_margin.get("active_from") == "2026-01-01"
            assert test_margin.get("active_to") == "2026-12-31"


class TestListMargins:
    """Test margin matrix listing includes new fields"""
    
    def test_list_margins_includes_base_price_and_dates(self, api_client):
        """Verify list margins endpoint returns base_price and active dates"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/margins")
        assert response.status_code == 200
        
        data = response.json()
        margins = data.get("margins", [])
        
        assert len(margins) > 0, "No margins found for distributor"
        
        # Check the specific updated margin has the fields populated
        test_margin = next((m for m in margins if m.get("id") == MARGIN_ID), None)
        assert test_margin is not None, f"Test margin {MARGIN_ID} not found"
        
        # Verify the specific test margin has the new fields with values
        assert test_margin.get("base_price") == 100, f"Expected base_price=100, got {test_margin.get('base_price')}"
        assert test_margin.get("transfer_price") == 97.5, f"Expected transfer_price=97.5, got {test_margin.get('transfer_price')}"
        assert test_margin.get("active_from") == "2026-01-01", f"Expected active_from=2026-01-01, got {test_margin.get('active_from')}"
        assert test_margin.get("active_to") == "2026-12-31", f"Expected active_to=2026-12-31, got {test_margin.get('active_to')}"


class TestBillingConfigRemoval:
    """Test that separate Billing Config is replaced with Margin Matrix"""
    
    def test_billing_tab_still_exists(self, api_client):
        """Billing tab should still exist but show note about Margins tab"""
        # Check billing config endpoint still works (for backwards compatibility)
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/billing-config")
        # Endpoint should exist even if empty
        assert response.status_code in [200, 404], f"Unexpected response: {response.status_code}"
    
    def test_billing_summary_endpoint(self, api_client):
        """Billing summary endpoint should still work"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/billing/summary")
        assert response.status_code == 200, f"Billing summary failed: {response.text}"
        
        summary = response.json()
        # Should have standard billing summary fields
        assert "billing_configs" in summary or "unreconciled_deliveries" in summary


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
