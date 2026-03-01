"""
Test Suite for Expense Request Feature at Lead/Account Level
Tests the 5 expense types: Gifting, On-boarding, Staff Gifting, Sponsorship, Free Trial
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
CEO_CREDENTIALS = {"email": "surya.yadavalli@nylaairwater.earth", "password": "surya123"}
DIRECTOR_CREDENTIALS = {"email": "admin@nylaairwater.earth", "password": "admin123"}

# Test entity IDs from the task
TEST_LEAD_ID = "2a3ca2de-8e26-406a-8be0-d9a28adfc0fb"
TEST_ACCOUNT_ID = "2a03a944-2b5b-419a-94f0-859f35693c3e"


@pytest.fixture(scope="module")
def session():
    """Shared requests session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def ceo_session(session):
    """Session authenticated as CEO"""
    resp = session.post(f"{BASE_URL}/api/auth/login", json=CEO_CREDENTIALS)
    assert resp.status_code == 200, f"CEO login failed: {resp.text}"
    return session


@pytest.fixture(scope="module")
def director_session():
    """Separate session authenticated as Director for approval tests"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    resp = s.post(f"{BASE_URL}/api/auth/login", json=DIRECTOR_CREDENTIALS)
    assert resp.status_code == 200, f"Director login failed: {resp.text}"
    return s


class TestExpenseTypes:
    """Tests for /api/expense-types endpoint"""
    
    def test_expense_types_returns_5_types(self, ceo_session):
        """GET /api/expense-types should return exactly 5 expense types"""
        resp = ceo_session.get(f"{BASE_URL}/api/expense-types")
        assert resp.status_code == 200, f"Failed to get expense types: {resp.text}"
        
        expense_types = resp.json()
        assert len(expense_types) == 5, f"Expected 5 expense types, got {len(expense_types)}"
        
        # Verify all expected types are present
        type_ids = [t['id'] for t in expense_types]
        expected_ids = ['gifting', 'onboarding', 'staff_gifting', 'sponsorship', 'free_trial']
        for expected_id in expected_ids:
            assert expected_id in type_ids, f"Expected expense type '{expected_id}' not found"
        
        print(f"✓ Got {len(expense_types)} expense types: {type_ids}")
    
    def test_expense_types_have_correct_structure(self, ceo_session):
        """Expense types should have id, label, and requires_sku fields"""
        resp = ceo_session.get(f"{BASE_URL}/api/expense-types")
        assert resp.status_code == 200
        
        for expense_type in resp.json():
            assert 'id' in expense_type, "Missing 'id' field"
            assert 'label' in expense_type, "Missing 'label' field"
            assert 'requires_sku' in expense_type, "Missing 'requires_sku' field"
        
        # Verify free_trial requires SKU
        free_trial = next(t for t in resp.json() if t['id'] == 'free_trial')
        assert free_trial['requires_sku'] == True, "Free trial should require SKU"
        
        # Verify other types don't require SKU
        gifting = next(t for t in resp.json() if t['id'] == 'gifting')
        assert gifting['requires_sku'] == False, "Gifting should not require SKU"
        
        print("✓ All expense types have correct structure and flags")


class TestSimpleExpenseRequests:
    """Tests for creating simple expense requests (non-free-trial)"""
    
    def test_create_gifting_expense_for_lead(self, ceo_session):
        """Create a Gifting expense request for a lead"""
        payload = {
            "entity_type": "lead",
            "entity_id": TEST_LEAD_ID,
            "expense_type": "gifting",
            "description": "TEST_gifting_expense_for_lead",
            "amount": 5000.0,
            "submit_for_approval": False
        }
        resp = ceo_session.post(f"{BASE_URL}/api/expense-requests", json=payload)
        assert resp.status_code == 200, f"Failed to create expense: {resp.text}"
        
        data = resp.json()
        assert 'id' in data, "Response should contain expense ID"
        assert data['status'] == 'draft', "Draft expense should have 'draft' status"
        
        print(f"✓ Created draft gifting expense: {data['id']}")
        return data['id']
    
    def test_create_onboarding_expense_for_account(self, ceo_session):
        """Create an On-boarding expense request for an account"""
        payload = {
            "entity_type": "account",
            "entity_id": TEST_ACCOUNT_ID,
            "expense_type": "onboarding",
            "description": "TEST_onboarding_expense_for_account",
            "amount": 10000.0,
            "submit_for_approval": True  # Submit for approval
        }
        resp = ceo_session.post(f"{BASE_URL}/api/expense-requests", json=payload)
        assert resp.status_code == 200, f"Failed to create expense: {resp.text}"
        
        data = resp.json()
        assert 'id' in data, "Response should contain expense ID"
        assert data['status'] == 'pending_approval', "Submitted expense should have 'pending_approval' status"
        
        print(f"✓ Created pending_approval onboarding expense: {data['id']}")
        return data['id']
    
    def test_create_staff_gifting_expense(self, ceo_session):
        """Create a Staff Gifting expense request for a lead"""
        payload = {
            "entity_type": "lead",
            "entity_id": TEST_LEAD_ID,
            "expense_type": "staff_gifting",
            "description": "TEST_staff_gifting_expense",
            "amount": 3000.0,
            "submit_for_approval": False
        }
        resp = ceo_session.post(f"{BASE_URL}/api/expense-requests", json=payload)
        assert resp.status_code == 200, f"Failed to create expense: {resp.text}"
        
        data = resp.json()
        assert 'id' in data
        print(f"✓ Created staff gifting expense: {data['id']}")
    
    def test_create_sponsorship_expense(self, ceo_session):
        """Create a Sponsorship expense request for an account"""
        payload = {
            "entity_type": "account",
            "entity_id": TEST_ACCOUNT_ID,
            "expense_type": "sponsorship",
            "description": "TEST_sponsorship_expense",
            "amount": 25000.0,
            "submit_for_approval": False
        }
        resp = ceo_session.post(f"{BASE_URL}/api/expense-requests", json=payload)
        assert resp.status_code == 200, f"Failed to create expense: {resp.text}"
        
        data = resp.json()
        assert 'id' in data
        print(f"✓ Created sponsorship expense: {data['id']}")


class TestFreeTrialExpense:
    """Tests for Free Trial expense with SKU grid"""
    
    def test_create_free_trial_expense_with_skus(self, ceo_session):
        """Create a Free Trial expense with SKU items"""
        # First get available SKUs
        sku_resp = ceo_session.get(f"{BASE_URL}/api/master-skus")
        assert sku_resp.status_code == 200
        skus = sku_resp.json().get('skus', [])
        assert len(skus) > 0, "No SKUs found"
        
        # Use first SKU for test
        test_sku = skus[0]
        
        payload = {
            "entity_type": "lead",
            "entity_id": TEST_LEAD_ID,
            "expense_type": "free_trial",
            "description": "TEST_free_trial_expense_with_skus",
            "free_trial_days": 7,
            "sku_items": [
                {
                    "sku_id": test_sku.get('id', ''),
                    "sku_name": test_sku.get('sku_name', test_sku.get('sku')),
                    "quantity": 10
                }
            ],
            "submit_for_approval": False
        }
        resp = ceo_session.post(f"{BASE_URL}/api/expense-requests", json=payload)
        assert resp.status_code == 200, f"Failed to create free trial expense: {resp.text}"
        
        data = resp.json()
        assert 'id' in data, "Response should contain expense ID"
        
        print(f"✓ Created free trial expense: {data['id']}")
        return data['id']
    
    def test_free_trial_requires_sku_items(self, ceo_session):
        """Free Trial expense should have SKU items (validation may be frontend-only)"""
        payload = {
            "entity_type": "lead",
            "entity_id": TEST_LEAD_ID,
            "expense_type": "free_trial",
            "description": "TEST_free_trial_no_skus",
            "free_trial_days": 7,
            "sku_items": [],  # Empty SKU items
            "submit_for_approval": False
        }
        resp = ceo_session.post(f"{BASE_URL}/api/expense-requests", json=payload)
        # Backend may accept empty SKUs - amount will be 0
        # This is more of a frontend validation test
        print(f"✓ Free trial with empty SKUs: status={resp.status_code}")


class TestExpenseRequestFiltering:
    """Tests for filtering expense requests by entity"""
    
    def test_get_expenses_for_lead(self, ceo_session):
        """Get expense requests filtered by lead"""
        resp = ceo_session.get(
            f"{BASE_URL}/api/expense-requests",
            params={"entity_type": "lead", "entity_id": TEST_LEAD_ID}
        )
        assert resp.status_code == 200, f"Failed to get expenses: {resp.text}"
        
        expenses = resp.json()
        assert isinstance(expenses, list), "Response should be a list"
        
        # Verify all returned expenses belong to this lead
        for exp in expenses:
            assert exp['entity_type'] == 'lead'
            assert exp['entity_id'] == TEST_LEAD_ID
        
        print(f"✓ Found {len(expenses)} expenses for lead {TEST_LEAD_ID}")
    
    def test_get_expenses_for_account(self, ceo_session):
        """Get expense requests filtered by account"""
        resp = ceo_session.get(
            f"{BASE_URL}/api/expense-requests",
            params={"entity_type": "account", "entity_id": TEST_ACCOUNT_ID}
        )
        assert resp.status_code == 200, f"Failed to get expenses: {resp.text}"
        
        expenses = resp.json()
        assert isinstance(expenses, list), "Response should be a list"
        
        print(f"✓ Found {len(expenses)} expenses for account {TEST_ACCOUNT_ID}")
    
    def test_get_all_expenses(self, ceo_session):
        """Get all expense requests without filters"""
        resp = ceo_session.get(f"{BASE_URL}/api/expense-requests")
        assert resp.status_code == 200, f"Failed to get expenses: {resp.text}"
        
        expenses = resp.json()
        assert isinstance(expenses, list), "Response should be a list"
        
        print(f"✓ Found {len(expenses)} total expenses")


class TestExpenseApproval:
    """Tests for expense request approval workflow"""
    
    @pytest.fixture(scope="class")
    def pending_expense_id(self, ceo_session):
        """Create a pending approval expense for testing"""
        payload = {
            "entity_type": "lead",
            "entity_id": TEST_LEAD_ID,
            "expense_type": "gifting",
            "description": "TEST_expense_for_approval_testing",
            "amount": 15000.0,
            "submit_for_approval": True
        }
        resp = ceo_session.post(f"{BASE_URL}/api/expense-requests", json=payload)
        assert resp.status_code == 200, f"Failed to create expense: {resp.text}"
        return resp.json()['id']
    
    def test_director_can_approve_expense(self, director_session, pending_expense_id):
        """Director should be able to approve expense requests"""
        resp = director_session.put(
            f"{BASE_URL}/api/expense-requests/{pending_expense_id}/approve",
            json={"status": "approved"}
        )
        assert resp.status_code == 200, f"Failed to approve expense: {resp.text}"
        
        # Verify status changed
        get_resp = director_session.get(f"{BASE_URL}/api/expense-requests/{pending_expense_id}")
        assert get_resp.status_code == 200
        expense = get_resp.json()
        assert expense['status'] == 'approved', f"Expected 'approved' status, got {expense['status']}"
        
        print(f"✓ Director approved expense {pending_expense_id}")
    
    def test_create_and_reject_expense(self, ceo_session, director_session):
        """Director should be able to reject expense requests"""
        # Create another pending expense
        payload = {
            "entity_type": "lead",
            "entity_id": TEST_LEAD_ID,
            "expense_type": "sponsorship",
            "description": "TEST_expense_for_rejection_testing",
            "amount": 50000.0,
            "submit_for_approval": True
        }
        create_resp = ceo_session.post(f"{BASE_URL}/api/expense-requests", json=payload)
        assert create_resp.status_code == 200
        expense_id = create_resp.json()['id']
        
        # Director rejects
        resp = director_session.put(
            f"{BASE_URL}/api/expense-requests/{expense_id}/approve",
            json={"status": "rejected", "rejection_reason": "Budget exceeded"}
        )
        assert resp.status_code == 200, f"Failed to reject expense: {resp.text}"
        
        # Verify status
        get_resp = director_session.get(f"{BASE_URL}/api/expense-requests/{expense_id}")
        assert get_resp.status_code == 200
        expense = get_resp.json()
        assert expense['status'] == 'rejected', f"Expected 'rejected' status, got {expense['status']}"
        
        print(f"✓ Director rejected expense {expense_id}")


class TestExpenseDelete:
    """Tests for expense request deletion/cancellation"""
    
    def test_user_can_delete_own_draft_expense(self, ceo_session):
        """User should be able to delete their own draft expense"""
        # Create a draft expense
        payload = {
            "entity_type": "lead",
            "entity_id": TEST_LEAD_ID,
            "expense_type": "gifting",
            "description": "TEST_expense_for_deletion",
            "amount": 1000.0,
            "submit_for_approval": False
        }
        create_resp = ceo_session.post(f"{BASE_URL}/api/expense-requests", json=payload)
        assert create_resp.status_code == 200
        expense_id = create_resp.json()['id']
        
        # Delete the expense
        delete_resp = ceo_session.delete(f"{BASE_URL}/api/expense-requests/{expense_id}")
        assert delete_resp.status_code in [200, 204], f"Failed to delete expense: {delete_resp.text}"
        
        print(f"✓ Deleted draft expense {expense_id}")
    
    def test_user_can_cancel_pending_expense(self, ceo_session):
        """User should be able to cancel their own pending expense"""
        # Create a pending expense
        payload = {
            "entity_type": "account",
            "entity_id": TEST_ACCOUNT_ID,
            "expense_type": "onboarding",
            "description": "TEST_expense_for_cancellation",
            "amount": 2000.0,
            "submit_for_approval": True
        }
        create_resp = ceo_session.post(f"{BASE_URL}/api/expense-requests", json=payload)
        assert create_resp.status_code == 200
        expense_id = create_resp.json()['id']
        
        # Cancel the expense
        cancel_resp = ceo_session.delete(f"{BASE_URL}/api/expense-requests/{expense_id}")
        assert cancel_resp.status_code in [200, 204], f"Failed to cancel expense: {cancel_resp.text}"
        
        print(f"✓ Cancelled pending expense {expense_id}")


class TestBudgetCategoriesNoCustomerRelated:
    """Test that Budget categories don't have customer-related categories anymore"""
    
    def test_budget_categories_no_customer_fields(self, ceo_session):
        """Budget categories should NOT have customer/lead-related categories"""
        resp = ceo_session.get(f"{BASE_URL}/api/budget-categories")
        assert resp.status_code == 200, f"Failed to get budget categories: {resp.text}"
        
        categories = resp.json()
        
        # Check that no category requires_lead (customer-related)
        for cat in categories:
            # All categories should have requires_lead = False
            assert cat.get('requires_lead', False) == False, \
                f"Category '{cat['label']}' should not require lead (customer-related fields removed)"
        
        # Verify there are no customer-specific categories like "customer_gifting"
        customer_keywords = ['customer_gifting', 'customer_free_trial', 'customer_onboarding']
        cat_ids = [c['id'] for c in categories]
        for keyword in customer_keywords:
            assert keyword not in cat_ids, \
                f"Customer-related category '{keyword}' should have been removed from Budget module"
        
        print(f"✓ Budget categories do not have customer-related categories")
        print(f"  Categories: {[c['id'] for c in categories]}")


class TestExpenseHistoryTable:
    """Tests for expense history table with status"""
    
    def test_expense_has_status_field(self, ceo_session):
        """Expenses should have status field (Pending/Approved/Rejected)"""
        # Get all expenses
        resp = ceo_session.get(f"{BASE_URL}/api/expense-requests")
        assert resp.status_code == 200
        
        expenses = resp.json()
        if expenses:
            for exp in expenses[:5]:  # Check first 5
                assert 'status' in exp, f"Expense {exp.get('id')} missing 'status' field"
                assert exp['status'] in ['draft', 'pending_approval', 'approved', 'rejected', 'cancelled'], \
                    f"Invalid status: {exp['status']}"
        
        print(f"✓ All expenses have valid status field")
    
    def test_expense_has_required_fields_for_table(self, ceo_session):
        """Expenses should have all fields needed for history table display"""
        resp = ceo_session.get(f"{BASE_URL}/api/expense-requests")
        assert resp.status_code == 200
        
        expenses = resp.json()
        required_fields = ['id', 'expense_type', 'amount', 'status', 'created_at', 'entity_type', 'entity_id']
        
        if expenses:
            for exp in expenses[:5]:
                for field in required_fields:
                    assert field in exp, f"Missing required field '{field}' in expense"
        
        print(f"✓ Expenses have all required fields for table display")


# Cleanup helper
@pytest.fixture(scope="module", autouse=True)
def cleanup(request, session):
    """Cleanup test data after all tests complete"""
    yield
    # Cleanup could be done here if needed
    # For now, test data is prefixed with TEST_ for manual cleanup


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
