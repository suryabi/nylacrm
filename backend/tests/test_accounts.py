"""
Test cases for Accounts feature:
- Convert Lead to Account functionality
- Account CRUD operations
- SKU pricing update
- Integration with Lead Detail page
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@nylaairwater.earth"
TEST_PASSWORD = "admin123"

# Known won lead IDs for testing conversion (from context)
WON_LEAD_IDS = [
    "a271ce87-a4ed-40bc-8780-b5f3c0529e0c",  # LEAD_17
    "2cde6cf5-fae9-4652-b685-0ce26e6530b5"   # OCEA-MUM-L26-003
]

# Already converted lead/account (from context)
CONVERTED_LEAD_ID = "6f6b975e-289a-416d-8d62-ce44cdf759f9"
EXISTING_ACCOUNT_ID = "TOOP-HYD-A26-001"


@pytest.fixture(scope="module")
def session():
    """Get authenticated session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    
    # Login to get session
    login_response = s.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    
    if login_response.status_code != 200:
        pytest.skip(f"Authentication failed: {login_response.text}")
    
    # Session cookie is automatically handled by requests.Session
    return s


class TestAccountsListAPI:
    """Test GET /api/accounts - Accounts listing endpoint"""
    
    def test_get_accounts_list(self, session):
        """GET /api/accounts should return paginated accounts list"""
        response = session.get(f"{BASE_URL}/api/accounts")
        assert response.status_code == 200
        
        data = response.json()
        assert "data" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data
        assert isinstance(data["data"], list)
        print(f"✓ Accounts list returned {data['total']} total accounts")
    
    def test_get_accounts_with_pagination(self, session):
        """GET /api/accounts with page and page_size params"""
        response = session.get(f"{BASE_URL}/api/accounts?page=1&page_size=10")
        assert response.status_code == 200
        
        data = response.json()
        assert data["page"] == 1
        assert data["page_size"] == 10
        print(f"✓ Pagination works: page {data['page']} of {data['total_pages']}")
    
    def test_get_accounts_with_search(self, session):
        """GET /api/accounts with search parameter"""
        response = session.get(f"{BASE_URL}/api/accounts?search=TOOP")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data["data"], list)
        print(f"✓ Search filter returned {len(data['data'])} accounts")
    
    def test_get_accounts_with_type_filter(self, session):
        """GET /api/accounts with account_type filter"""
        response = session.get(f"{BASE_URL}/api/accounts?account_type=Tier%201")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data["data"], list)
        print(f"✓ Type filter returned {len(data['data'])} Tier 1 accounts")


class TestAccountDetailAPI:
    """Test GET /api/accounts/:id - Account detail endpoint"""
    
    def test_get_existing_account(self, session):
        """GET /api/accounts/:id should return account details"""
        response = session.get(f"{BASE_URL}/api/accounts/{EXISTING_ACCOUNT_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "account_id" in data
        assert "account_name" in data
        assert "city" in data
        assert "state" in data
        assert "lead_id" in data
        assert data["account_id"] == EXISTING_ACCOUNT_ID
        print(f"✓ Account {data['account_id']} found: {data['account_name']}")
        return data
    
    def test_get_nonexistent_account(self, session):
        """GET /api/accounts/:id with invalid ID should return 404"""
        response = session.get(f"{BASE_URL}/api/accounts/NONEXISTENT-123")
        assert response.status_code == 404
        print("✓ Non-existent account correctly returns 404")


class TestConvertLeadToAccount:
    """Test POST /api/accounts/convert-lead - Convert won lead to account"""
    
    def test_convert_already_converted_lead_fails(self, session):
        """Converting an already-converted lead should fail with 400"""
        response = session.post(f"{BASE_URL}/api/accounts/convert-lead", json={
            "lead_id": CONVERTED_LEAD_ID
        })
        
        assert response.status_code == 400
        data = response.json()
        assert "already converted" in data.get("detail", "").lower()
        print("✓ Already converted lead correctly rejected")
    
    def test_convert_nonexistent_lead_fails(self, session):
        """Converting a non-existent lead should fail with 404"""
        response = session.post(f"{BASE_URL}/api/accounts/convert-lead", json={
            "lead_id": "00000000-0000-0000-0000-000000000000"
        })
        
        assert response.status_code == 404
        print("✓ Non-existent lead correctly returns 404")
    
    def test_convert_won_lead_success(self, session):
        """Converting a won lead should create account and return it"""
        # First find a won lead that hasn't been converted
        leads_response = session.get(f"{BASE_URL}/api/leads?status=won&page_size=50")
        if leads_response.status_code != 200:
            pytest.skip("Could not fetch leads list")
        
        leads_data = leads_response.json()
        won_leads = leads_data.get("data", [])
        
        # Find a won lead that hasn't been converted
        unconverted_lead = None
        for lead in won_leads:
            if not lead.get("converted_to_account"):
                unconverted_lead = lead
                break
        
        if not unconverted_lead:
            pytest.skip("No unconverted won leads available for testing")
        
        lead_id = unconverted_lead["id"]
        company = unconverted_lead.get("company", "Unknown")
        
        # Convert the lead to account
        response = session.post(f"{BASE_URL}/api/accounts/convert-lead", json={
            "lead_id": lead_id
        })
        
        assert response.status_code == 200
        
        data = response.json()
        assert "account_id" in data
        assert "account_name" in data
        assert data["lead_id"] == unconverted_lead.get("lead_id") or data["lead_id"] == lead_id
        
        # Verify account_id format: NAME4-CITY-AYY-SEQ
        account_id = data["account_id"]
        parts = account_id.split("-")
        assert len(parts) == 4, f"Account ID should have 4 parts: {account_id}"
        assert parts[2].startswith("A"), f"Third part should start with 'A': {account_id}"
        
        print(f"✓ Lead converted to account: {account_id}")
        
        # Verify lead is marked as converted
        lead_response = session.get(f"{BASE_URL}/api/leads/{lead_id}")
        assert lead_response.status_code == 200
        lead_data = lead_response.json()
        assert lead_data.get("converted_to_account") == True
        assert lead_data.get("account_id") == account_id
        print(f"✓ Lead {lead_id} marked as converted with account_id {account_id}")
        
        # Store account_id for cleanup
        return account_id


class TestAccountUpdate:
    """Test PUT /api/accounts/:id - Update account endpoint"""
    
    def test_update_account_basic_fields(self, session):
        """PUT /api/accounts/:id should update basic fields"""
        # Get existing account
        get_response = session.get(f"{BASE_URL}/api/accounts/{EXISTING_ACCOUNT_ID}")
        if get_response.status_code != 200:
            pytest.skip(f"Account {EXISTING_ACCOUNT_ID} not found")
        
        original_data = get_response.json()
        original_contact_name = original_data.get("contact_name", "")
        
        # Update contact name
        test_contact_name = f"TEST_Contact_{uuid.uuid4().hex[:6]}"
        update_response = session.put(f"{BASE_URL}/api/accounts/{EXISTING_ACCOUNT_ID}", json={
            "contact_name": test_contact_name
        })
        
        assert update_response.status_code == 200
        updated_data = update_response.json()
        assert updated_data.get("contact_name") == test_contact_name
        print(f"✓ Account contact_name updated to: {test_contact_name}")
        
        # Revert change
        session.put(f"{BASE_URL}/api/accounts/{EXISTING_ACCOUNT_ID}", json={
            "contact_name": original_contact_name or None
        })
    
    def test_update_account_sku_pricing(self, session):
        """PUT /api/accounts/:id should update SKU pricing array"""
        # Get existing account
        get_response = session.get(f"{BASE_URL}/api/accounts/{EXISTING_ACCOUNT_ID}")
        if get_response.status_code != 200:
            pytest.skip(f"Account {EXISTING_ACCOUNT_ID} not found")
        
        original_data = get_response.json()
        original_sku_pricing = original_data.get("sku_pricing", [])
        
        # Update SKU pricing
        test_sku_pricing = [
            {"sku": "20L Premium", "price_per_unit": 150.0, "return_bottle_credit": 10.0},
            {"sku": "20L Regular", "price_per_unit": 120.0, "return_bottle_credit": 8.0}
        ]
        
        update_response = session.put(f"{BASE_URL}/api/accounts/{EXISTING_ACCOUNT_ID}", json={
            "sku_pricing": test_sku_pricing
        })
        
        assert update_response.status_code == 200
        updated_data = update_response.json()
        
        # Verify SKU pricing was updated
        assert "sku_pricing" in updated_data
        assert len(updated_data["sku_pricing"]) == 2
        
        # Verify data integrity
        sku_names = [sku["sku"] for sku in updated_data["sku_pricing"]]
        assert "20L Premium" in sku_names
        assert "20L Regular" in sku_names
        
        print(f"✓ SKU pricing updated with {len(updated_data['sku_pricing'])} items")
        
        # Revert change
        session.put(f"{BASE_URL}/api/accounts/{EXISTING_ACCOUNT_ID}", json={
            "sku_pricing": original_sku_pricing
        })
    
    def test_update_account_type(self, session):
        """PUT /api/accounts/:id should update account_type"""
        get_response = session.get(f"{BASE_URL}/api/accounts/{EXISTING_ACCOUNT_ID}")
        if get_response.status_code != 200:
            pytest.skip(f"Account {EXISTING_ACCOUNT_ID} not found")
        
        original_type = get_response.json().get("account_type")
        
        # Update type
        update_response = session.put(f"{BASE_URL}/api/accounts/{EXISTING_ACCOUNT_ID}", json={
            "account_type": "Tier 1"
        })
        
        assert update_response.status_code == 200
        updated_data = update_response.json()
        assert updated_data.get("account_type") == "Tier 1"
        print("✓ Account type updated to Tier 1")
        
        # Revert change
        session.put(f"{BASE_URL}/api/accounts/{EXISTING_ACCOUNT_ID}", json={
            "account_type": original_type
        })


class TestAccountInvoices:
    """Test GET /api/accounts/:id/invoices - Account invoices endpoint"""
    
    def test_get_account_invoices(self, session):
        """GET /api/accounts/:id/invoices should return invoice data"""
        response = session.get(f"{BASE_URL}/api/accounts/{EXISTING_ACCOUNT_ID}/invoices")
        assert response.status_code == 200
        
        data = response.json()
        assert "invoices" in data
        assert "total_amount" in data
        assert "paid_amount" in data
        assert "outstanding" in data
        assert isinstance(data["invoices"], list)
        print(f"✓ Invoice endpoint returned {len(data['invoices'])} invoices")


class TestAccountNavigationInSidebar:
    """Verify Accounts nav is properly configured (check via API response)"""
    
    def test_auth_me_returns_role(self, session):
        """GET /api/auth/me should return user with role for nav permissions"""
        response = session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        
        data = response.json()
        assert "role" in data
        print(f"✓ User role returned: {data['role']}")


class TestLeadDetailShowsConvertButton:
    """Verify lead detail properly shows conversion status"""
    
    def test_won_lead_shows_conversion_fields(self, session):
        """Won leads should have converted_to_account and account_id fields"""
        # Get converted lead
        response = session.get(f"{BASE_URL}/api/leads/{CONVERTED_LEAD_ID}")
        
        if response.status_code != 200:
            pytest.skip(f"Lead {CONVERTED_LEAD_ID} not found")
        
        data = response.json()
        assert data.get("status") == "won" or data.get("status") == "closed_won"
        assert "converted_to_account" in data
        assert data.get("converted_to_account") == True
        assert "account_id" in data
        print(f"✓ Converted lead shows account_id: {data.get('account_id')}")
    
    def test_unconverted_won_lead_structure(self, session):
        """Unconverted won leads should have converted_to_account=false or missing"""
        leads_response = session.get(f"{BASE_URL}/api/leads?status=won&page_size=10")
        if leads_response.status_code != 200:
            pytest.skip("Could not fetch won leads")
        
        leads_data = leads_response.json()
        unconverted = [l for l in leads_data.get("data", []) if not l.get("converted_to_account")]
        
        if unconverted:
            lead = unconverted[0]
            assert lead.get("converted_to_account", False) == False
            print(f"✓ Found unconverted won lead: {lead.get('lead_id', lead.get('id'))}")
        else:
            print("✓ All won leads are already converted (acceptable)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
