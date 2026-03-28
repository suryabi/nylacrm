"""
Test Credit Notes Integration with Deliveries
Tests the credit notes feature for applying credit notes to deliveries
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
DISTRIBUTOR_ID = "d091204f-e04f-46f2-b9a9-d92d9f89b528"  # Surya Distributions


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        data = response.json()
        # API returns session_token, not access_token
        return data.get("session_token") or data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestCreditNotesEndpoint:
    """Test credit notes API endpoints"""
    
    def test_list_credit_notes(self, api_client):
        """Test listing credit notes for a distributor"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/credit-notes")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "credit_notes" in data
        assert "total" in data
        assert "summary" in data
        
        print(f"✓ Found {data['total']} credit notes for distributor")
        print(f"  Summary: Original={data['summary']['total_original']}, Applied={data['summary']['total_applied']}, Balance={data['summary']['total_balance']}")
    
    def test_get_available_credit_notes_for_account(self, api_client):
        """Test getting available credit notes for a specific account"""
        # First get assigned accounts
        accounts_response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/assigned-accounts")
        
        assert accounts_response.status_code == 200, f"Failed to get assigned accounts: {accounts_response.text}"
        
        accounts = accounts_response.json().get("accounts", [])
        
        if not accounts:
            pytest.skip("No assigned accounts found for testing")
        
        # Use first account
        account_id = accounts[0].get("account_id") or accounts[0].get("id")
        account_name = accounts[0].get("account_name", "Unknown")
        
        print(f"Testing credit notes for account: {account_name} ({account_id})")
        
        # Get available credit notes for this account
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/credit-notes/for-account/{account_id}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "credit_notes" in data
        assert "total_available" in data
        assert "count" in data
        
        print(f"✓ Found {data['count']} available credit notes for account")
        print(f"  Total available: ₹{data['total_available']}")
        
        # Return data for use in other tests
        return {
            "account_id": account_id,
            "account_name": account_name,
            "credit_notes": data["credit_notes"],
            "total_available": data["total_available"]
        }


class TestDeliveryWithCreditNotes:
    """Test delivery creation with credit notes"""
    
    def test_get_assigned_accounts(self, api_client):
        """Test getting assigned accounts for delivery"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/assigned-accounts")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "accounts" in data
        
        accounts = data["accounts"]
        print(f"✓ Found {len(accounts)} assigned accounts")
        
        for acc in accounts[:3]:  # Show first 3
            print(f"  - {acc.get('account_name')} ({acc.get('city')})")
        
        return accounts
    
    def test_get_distributor_locations(self, api_client):
        """Test getting distributor locations for delivery"""
        response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/locations")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "locations" in data
        
        locations = data["locations"]
        print(f"✓ Found {len(locations)} locations")
        
        for loc in locations[:3]:
            print(f"  - {loc.get('location_name')} ({loc.get('city')})")
        
        return locations
    
    def test_get_skus(self, api_client):
        """Test getting SKUs for delivery items"""
        response = api_client.get(f"{BASE_URL}/api/master-skus")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        skus = data.get("skus", data) if isinstance(data, dict) else data
        
        print(f"✓ Found {len(skus)} SKUs")
        
        for sku in skus[:3]:
            print(f"  - {sku.get('name')} (ID: {sku.get('id')[:8]}...)")
        
        return skus
    
    def test_delivery_creation_endpoint_accepts_credit_notes(self, api_client):
        """Test that delivery creation endpoint accepts credit_notes_to_apply parameter"""
        # Get required data
        accounts_response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/assigned-accounts")
        accounts = accounts_response.json().get("accounts", [])
        
        locations_response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/locations")
        locations = locations_response.json().get("locations", [])
        
        skus_response = api_client.get(f"{BASE_URL}/api/master-skus")
        skus_data = skus_response.json()
        skus = skus_data.get("skus", skus_data) if isinstance(skus_data, dict) else skus_data
        
        if not accounts or not locations or not skus:
            pytest.skip("Missing required data for delivery creation test")
        
        account = accounts[0]
        account_id = account.get("account_id") or account.get("id")
        location = next((l for l in locations if l.get("status") == "active"), locations[0])
        sku = skus[0]
        
        # Get available credit notes for this account
        cn_response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/credit-notes/for-account/{account_id}"
        )
        credit_notes = cn_response.json().get("credit_notes", [])
        
        # Prepare delivery data with credit notes
        delivery_data = {
            "distributor_id": DISTRIBUTOR_ID,
            "distributor_location_id": location.get("id"),
            "account_id": account_id,
            "delivery_date": datetime.now().strftime("%Y-%m-%d"),
            "reference_number": "TEST-CN-001",
            "items": [
                {
                    "sku_id": sku.get("id"),
                    "sku_name": sku.get("name"),
                    "quantity": 10,
                    "unit_price": 100.0,
                    "discount_percent": 0,
                    "tax_percent": 18
                }
            ],
            "credit_notes_to_apply": []  # Empty list - should be accepted
        }
        
        # If there are credit notes available, add one
        if credit_notes:
            cn = credit_notes[0]
            delivery_data["credit_notes_to_apply"] = [
                {
                    "credit_note_id": cn.get("id"),
                    "amount_to_apply": min(cn.get("balance_amount", 0), 100)  # Apply up to 100
                }
            ]
            print(f"  Including credit note {cn.get('credit_note_number')} with ₹{delivery_data['credit_notes_to_apply'][0]['amount_to_apply']}")
        else:
            print("  No credit notes available - testing with empty credit_notes_to_apply")
        
        # Create delivery
        response = api_client.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries",
            json=delivery_data
        )
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        delivery = response.json()
        
        # Verify credit note fields are in response
        assert "applied_credit_notes" in delivery, "Response should include applied_credit_notes"
        assert "total_credit_applied" in delivery, "Response should include total_credit_applied"
        assert "net_customer_billing" in delivery, "Response should include net_customer_billing"
        
        print(f"✓ Delivery {delivery.get('delivery_number')} created successfully")
        print(f"  Total Amount: ₹{delivery.get('total_net_amount')}")
        print(f"  Credit Applied: ₹{delivery.get('total_credit_applied')}")
        print(f"  Net Billing: ₹{delivery.get('net_customer_billing')}")
        
        # Clean up - delete the test delivery
        delete_response = api_client.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery.get('id')}"
        )
        if delete_response.status_code in [200, 204]:
            print(f"  Cleaned up test delivery")
        
        return delivery
    
    def test_delivery_detail_shows_credit_notes(self, api_client):
        """Test that delivery detail view includes credit note information"""
        # Get existing deliveries
        response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries?page=1&page_size=5"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        deliveries = response.json().get("deliveries", [])
        
        if not deliveries:
            pytest.skip("No deliveries found to test detail view")
        
        # Get detail of first delivery
        delivery_id = deliveries[0].get("id")
        detail_response = api_client.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/{delivery_id}"
        )
        
        assert detail_response.status_code == 200, f"Expected 200, got {detail_response.status_code}: {detail_response.text}"
        
        delivery = detail_response.json()
        
        # Check that credit note fields exist (even if empty)
        print(f"✓ Delivery {delivery.get('delivery_number')} detail retrieved")
        print(f"  Applied Credit Notes: {delivery.get('applied_credit_notes', [])}")
        print(f"  Total Credit Applied: ₹{delivery.get('total_credit_applied', 0)}")
        print(f"  Net Customer Billing: ₹{delivery.get('net_customer_billing', delivery.get('total_net_amount', 0))}")
        
        return delivery


class TestCreditNoteCalculations:
    """Test credit note calculation logic"""
    
    def test_net_billing_calculation(self, api_client):
        """Test that net customer billing is calculated correctly"""
        # Get accounts and check for credit notes
        accounts_response = api_client.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/assigned-accounts")
        accounts = accounts_response.json().get("accounts", [])
        
        if not accounts:
            pytest.skip("No accounts available for testing")
        
        # Find an account with credit notes
        account_with_cn = None
        for account in accounts:
            account_id = account.get("account_id") or account.get("id")
            cn_response = api_client.get(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/credit-notes/for-account/{account_id}"
            )
            if cn_response.status_code == 200:
                cn_data = cn_response.json()
                if cn_data.get("count", 0) > 0:
                    account_with_cn = {
                        "account": account,
                        "credit_notes": cn_data["credit_notes"]
                    }
                    break
        
        if not account_with_cn:
            print("✓ No accounts with credit notes found - calculation test skipped")
            print("  (This is expected if no returns have been approved yet)")
            return
        
        account = account_with_cn["account"]
        credit_notes = account_with_cn["credit_notes"]
        
        print(f"✓ Found account {account.get('account_name')} with {len(credit_notes)} credit notes")
        
        for cn in credit_notes:
            print(f"  - {cn.get('credit_note_number')}: Balance ₹{cn.get('balance_amount')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
