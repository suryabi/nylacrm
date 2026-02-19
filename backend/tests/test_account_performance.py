"""
Test Account Performance Report API - /api/reports/account-performance
Tests the new Account Performance feature similar to Resource Performance dashboard
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAccountPerformanceAPI:
    """Test suite for Account Performance Report API"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication for all tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get session
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@nylaairwater.earth", "password": "admin123"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Get session token from cookie or response
        if login_response.cookies.get('session_token'):
            self.session.cookies.set('session_token', login_response.cookies.get('session_token'))
        elif login_response.json().get('session_token'):
            self.session.headers.update({
                "Authorization": f"Bearer {login_response.json().get('session_token')}"
            })
    
    def test_account_performance_endpoint_exists(self):
        """Test that the account performance endpoint is accessible"""
        response = self.session.get(f"{BASE_URL}/api/reports/account-performance")
        assert response.status_code == 200, f"Endpoint returned {response.status_code}: {response.text}"
        print(f"SUCCESS: Account Performance endpoint exists and returns 200")
    
    def test_account_performance_response_structure(self):
        """Test that API returns correct response structure"""
        response = self.session.get(f"{BASE_URL}/api/reports/account-performance")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check top-level structure
        assert 'accounts' in data, "Response missing 'accounts' field"
        assert 'summary' in data, "Response missing 'summary' field"
        
        # Check summary structure
        summary = data['summary']
        assert 'total_gross' in summary, "Summary missing 'total_gross'"
        assert 'total_net' in summary, "Summary missing 'total_net'"
        assert 'total_bottle_credit' in summary, "Summary missing 'total_bottle_credit'"
        assert 'total_outstanding' in summary, "Summary missing 'total_outstanding'"
        assert 'total_overdue' in summary, "Summary missing 'total_overdue'"
        assert 'account_count' in summary, "Summary missing 'account_count'"
        
        print(f"SUCCESS: Response structure is correct")
        print(f"  - Accounts: {len(data['accounts'])} records")
        print(f"  - Summary: {summary}")
    
    def test_account_performance_account_data_structure(self):
        """Test that each account in response has required fields"""
        response = self.session.get(f"{BASE_URL}/api/reports/account-performance")
        assert response.status_code == 200
        
        data = response.json()
        
        if len(data['accounts']) > 0:
            account = data['accounts'][0]
            
            required_fields = [
                'account_id', 'account_name', 'account_type', 
                'city', 'state', 'territory',
                'gross_invoice_total', 'net_invoice_total', 
                'bottle_credit', 'contribution_pct',
                'outstanding_balance', 'overdue_amount', 
                'last_payment_amount'
            ]
            
            for field in required_fields:
                assert field in account, f"Account missing required field: {field}"
            
            print(f"SUCCESS: Account data has all required fields")
            print(f"  Sample account: {account['account_name']} ({account['account_id']})")
            print(f"  - Gross Invoice: {account['gross_invoice_total']}")
            print(f"  - Net Invoice: {account['net_invoice_total']}")
            print(f"  - Bottle Credit: {account['bottle_credit']}")
            print(f"  - Contribution %: {account['contribution_pct']}")
            print(f"  - Outstanding: {account['outstanding_balance']}")
            print(f"  - Overdue: {account['overdue_amount']}")
            print(f"  - Last Payment: {account['last_payment_amount']}")
        else:
            print("INFO: No accounts found - structure tests skipped (valid scenario)")
    
    def test_time_filter_this_month(self):
        """Test time filter - this_month"""
        response = self.session.get(
            f"{BASE_URL}/api/reports/account-performance",
            params={"time_filter": "this_month"}
        )
        assert response.status_code == 200
        print(f"SUCCESS: time_filter=this_month works")
    
    def test_time_filter_lifetime(self):
        """Test time filter - lifetime"""
        response = self.session.get(
            f"{BASE_URL}/api/reports/account-performance",
            params={"time_filter": "lifetime"}
        )
        assert response.status_code == 200
        print(f"SUCCESS: time_filter=lifetime works")
    
    def test_time_filter_this_quarter(self):
        """Test time filter - this_quarter"""
        response = self.session.get(
            f"{BASE_URL}/api/reports/account-performance",
            params={"time_filter": "this_quarter"}
        )
        assert response.status_code == 200
        print(f"SUCCESS: time_filter=this_quarter works")
    
    def test_time_filter_last_6_months(self):
        """Test time filter - last_6_months"""
        response = self.session.get(
            f"{BASE_URL}/api/reports/account-performance",
            params={"time_filter": "last_6_months"}
        )
        assert response.status_code == 200
        print(f"SUCCESS: time_filter=last_6_months works")
    
    def test_territory_filter(self):
        """Test territory filter"""
        response = self.session.get(
            f"{BASE_URL}/api/reports/account-performance",
            params={"territory": "South India"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # If accounts exist with South India territory, they should be filtered
        for acc in data['accounts']:
            if acc.get('territory'):
                assert acc['territory'] == 'South India', f"Account {acc['account_id']} has wrong territory"
        
        print(f"SUCCESS: territory filter works, found {len(data['accounts'])} accounts")
    
    def test_state_filter(self):
        """Test state filter"""
        response = self.session.get(
            f"{BASE_URL}/api/reports/account-performance",
            params={"state": "Telangana"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # Verify filtered results
        for acc in data['accounts']:
            if acc.get('state'):
                assert acc['state'] == 'Telangana', f"Account {acc['account_id']} has wrong state"
        
        print(f"SUCCESS: state filter works, found {len(data['accounts'])} accounts")
    
    def test_city_filter(self):
        """Test city filter"""
        response = self.session.get(
            f"{BASE_URL}/api/reports/account-performance",
            params={"city": "Hyderabad"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # Verify filtered results
        for acc in data['accounts']:
            if acc.get('city'):
                assert acc['city'] == 'Hyderabad', f"Account {acc['account_id']} has wrong city"
        
        print(f"SUCCESS: city filter works, found {len(data['accounts'])} accounts")
    
    def test_account_type_filter(self):
        """Test account_type filter"""
        response = self.session.get(
            f"{BASE_URL}/api/reports/account-performance",
            params={"account_type": "Tier 1"}
        )
        assert response.status_code == 200
        
        data = response.json()
        # Verify filtered results
        for acc in data['accounts']:
            if acc.get('account_type'):
                assert acc['account_type'] == 'Tier 1', f"Account {acc['account_id']} has wrong type"
        
        print(f"SUCCESS: account_type filter works, found {len(data['accounts'])} accounts")
    
    def test_combined_filters(self):
        """Test multiple filters combined"""
        response = self.session.get(
            f"{BASE_URL}/api/reports/account-performance",
            params={
                "time_filter": "this_month",
                "territory": "South India",
                "state": "Telangana",
                "city": "Hyderabad"
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        print(f"SUCCESS: Combined filters work, found {len(data['accounts'])} accounts")
    
    def test_contribution_percentage_calculation(self):
        """Test that contribution percentage is calculated correctly"""
        response = self.session.get(f"{BASE_URL}/api/reports/account-performance")
        assert response.status_code == 200
        
        data = response.json()
        
        # Sum all contribution percentages - should be <= 100 (may be less if no invoices)
        total_contribution = sum(acc.get('contribution_pct', 0) for acc in data['accounts'])
        
        # If there are accounts with gross revenue, total should be ~100%
        # If no invoices, total can be 0%
        assert total_contribution <= 100.01, f"Total contribution {total_contribution}% exceeds 100%"
        
        print(f"SUCCESS: Contribution % total = {total_contribution}%")
    
    def test_unauthenticated_access_denied(self):
        """Test that unauthenticated requests are denied"""
        # Create new session without auth
        unauth_session = requests.Session()
        response = unauth_session.get(f"{BASE_URL}/api/reports/account-performance")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"SUCCESS: Unauthenticated access properly denied (401)")
    
    def test_accounts_sorted_by_gross_revenue(self):
        """Test that accounts are sorted by gross invoice total descending"""
        response = self.session.get(f"{BASE_URL}/api/reports/account-performance")
        assert response.status_code == 200
        
        data = response.json()
        accounts = data['accounts']
        
        if len(accounts) > 1:
            for i in range(len(accounts) - 1):
                current = accounts[i].get('gross_invoice_total', 0)
                next_val = accounts[i + 1].get('gross_invoice_total', 0)
                assert current >= next_val, f"Accounts not sorted: {current} < {next_val}"
            print(f"SUCCESS: Accounts sorted by gross_invoice_total descending")
        else:
            print("INFO: Less than 2 accounts, sort verification skipped")


class TestAccountsPrerequisite:
    """Verify accounts exist for testing"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "admin@nylaairwater.earth", "password": "admin123"}
        )
        assert login_response.status_code == 200
        
        if login_response.cookies.get('session_token'):
            self.session.cookies.set('session_token', login_response.cookies.get('session_token'))
        elif login_response.json().get('session_token'):
            self.session.headers.update({
                "Authorization": f"Bearer {login_response.json().get('session_token')}"
            })
    
    def test_accounts_exist(self):
        """Check that accounts exist in the system"""
        response = self.session.get(f"{BASE_URL}/api/accounts")
        assert response.status_code == 200
        
        data = response.json()
        account_count = data.get('total', 0)
        
        print(f"INFO: System has {account_count} accounts")
        
        if account_count > 0:
            print("  Accounts:")
            for acc in data.get('data', [])[:5]:  # Show first 5
                print(f"    - {acc['account_name']} ({acc['account_id']})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
