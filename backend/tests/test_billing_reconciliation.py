"""
Test Billing & Reconciliation Module
Tests for:
- GET /api/distributors/{id}/billing/summary - Billing summary with counts
- POST /api/distributors/{id}/reconciliations/calculate - Preview reconciliation
- POST /api/distributors/{id}/reconciliations - Create reconciliation
- GET /api/distributors/{id}/reconciliations - List reconciliations
- POST /api/distributors/{id}/reconciliations/{id}/confirm - Confirm and generate note
- GET /api/distributors/{id}/debit-credit-notes - List notes
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
TENANT_ID = "nyla-air-water"

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        headers={"X-Tenant-ID": TENANT_ID}
    )
    if response.status_code == 200:
        data = response.json()
        # Try session_token first, then access_token
        return data.get("session_token") or data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


class TestBillingSummary:
    """Test GET /api/distributors/{id}/billing/summary"""
    
    def test_billing_summary_returns_200(self, auth_headers):
        """Test billing summary endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/billing/summary",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Billing summary returned 200")
    
    def test_billing_summary_has_required_fields(self, auth_headers):
        """Test billing summary has all required fields"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/billing/summary",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        required_fields = [
            "billing_configs",
            "unreconciled_deliveries",
            "net_balance",
            "pending_credit_amount"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
            print(f"✓ Field '{field}' present: {data[field]}")
    
    def test_billing_summary_has_distributor_info(self, auth_headers):
        """Test billing summary includes distributor info"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/billing/summary",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "distributor" in data, "Missing distributor info"
        print(f"✓ Distributor info present: {data.get('distributor')}")
    
    def test_billing_summary_invalid_distributor(self, auth_headers):
        """Test billing summary with invalid distributor returns 404"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/invalid-id-12345/billing/summary",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Invalid distributor returns 404")


class TestReconciliationCalculate:
    """Test POST /api/distributors/{id}/reconciliations/calculate"""
    
    def test_calculate_reconciliation_returns_200(self, auth_headers):
        """Test calculate reconciliation endpoint returns 200"""
        # Use a date range that might have deliveries
        today = datetime.now()
        period_start = (today - timedelta(days=90)).strftime("%Y-%m-%d")
        period_end = today.strftime("%Y-%m-%d")
        
        response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations/calculate",
            headers=auth_headers,
            json={
                "period_start": period_start,
                "period_end": period_end
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Calculate reconciliation returned 200")
    
    def test_calculate_reconciliation_response_structure(self, auth_headers):
        """Test calculate reconciliation response has correct structure"""
        today = datetime.now()
        period_start = (today - timedelta(days=90)).strftime("%Y-%m-%d")
        period_end = today.strftime("%Y-%m-%d")
        
        response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations/calculate",
            headers=auth_headers,
            json={
                "period_start": period_start,
                "period_end": period_end
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields in response
        required_fields = ["period_start", "period_end", "total_deliveries"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ Response structure valid")
        print(f"  - Period: {data.get('period_start')} to {data.get('period_end')}")
        print(f"  - Total deliveries: {data.get('total_deliveries')}")
        
        # If there are deliveries, check for calculation fields
        if data.get('total_deliveries', 0) > 0:
            calc_fields = [
                "total_quantity",
                "total_provisional_amount",
                "total_actual_gross_amount",
                "total_difference",
                "items"
            ]
            for field in calc_fields:
                assert field in data, f"Missing calculation field: {field}"
            print(f"  - Total quantity: {data.get('total_quantity')}")
            print(f"  - Total difference: {data.get('total_difference')}")
            print(f"  - Settlement type: {data.get('settlement_type')}")
    
    def test_calculate_reconciliation_no_deliveries(self, auth_headers):
        """Test calculate reconciliation with date range having no deliveries"""
        # Use a date range in the past that likely has no deliveries
        response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations/calculate",
            headers=auth_headers,
            json={
                "period_start": "2020-01-01",
                "period_end": "2020-01-31"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should return 0 deliveries
        assert data.get('total_deliveries') == 0, f"Expected 0 deliveries, got {data.get('total_deliveries')}"
        print(f"✓ No deliveries returns correct response")


class TestReconciliationCRUD:
    """Test reconciliation CRUD operations"""
    
    def test_list_reconciliations_returns_200(self, auth_headers):
        """Test list reconciliations endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ List reconciliations returned 200")
    
    def test_list_reconciliations_response_structure(self, auth_headers):
        """Test list reconciliations response has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "reconciliations" in data, "Missing 'reconciliations' field"
        assert "total" in data, "Missing 'total' field"
        assert "page" in data, "Missing 'page' field"
        
        print(f"✓ Response structure valid")
        print(f"  - Total reconciliations: {data.get('total')}")
        print(f"  - Page: {data.get('page')}")
        
        # Check reconciliation structure if any exist
        if data.get('reconciliations'):
            rec = data['reconciliations'][0]
            rec_fields = ["id", "reconciliation_number", "period_start", "period_end", "status"]
            for field in rec_fields:
                assert field in rec, f"Missing reconciliation field: {field}"
            print(f"  - First reconciliation: {rec.get('reconciliation_number')}")
    
    def test_list_reconciliations_with_status_filter(self, auth_headers):
        """Test list reconciliations with status filter"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations?status=draft",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All returned reconciliations should have draft status
        for rec in data.get('reconciliations', []):
            assert rec.get('status') == 'draft', f"Expected draft status, got {rec.get('status')}"
        
        print(f"✓ Status filter works correctly")


class TestReconciliationCreate:
    """Test creating reconciliation"""
    
    @pytest.fixture
    def created_reconciliation_id(self, auth_headers):
        """Create a reconciliation for testing and return its ID"""
        today = datetime.now()
        period_start = (today - timedelta(days=30)).strftime("%Y-%m-%d")
        period_end = today.strftime("%Y-%m-%d")
        
        # First check if there are deliveries
        calc_response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations/calculate",
            headers=auth_headers,
            json={
                "period_start": period_start,
                "period_end": period_end
            }
        )
        
        if calc_response.status_code == 200:
            calc_data = calc_response.json()
            if calc_data.get('total_deliveries', 0) > 0:
                # Create reconciliation
                response = requests.post(
                    f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations",
                    headers=auth_headers,
                    json={
                        "period_start": period_start,
                        "period_end": period_end,
                        "remarks": "TEST_reconciliation_for_testing"
                    }
                )
                if response.status_code == 200:
                    rec_id = response.json().get('id')
                    yield rec_id
                    # Cleanup - delete the reconciliation
                    requests.delete(
                        f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations/{rec_id}",
                        headers=auth_headers
                    )
                    return
        
        yield None
    
    def test_create_reconciliation_no_deliveries(self, auth_headers):
        """Test creating reconciliation with no deliveries returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations",
            headers=auth_headers,
            json={
                "period_start": "2020-01-01",
                "period_end": "2020-01-31",
                "remarks": "TEST_no_deliveries"
            }
        )
        # Should return 400 because no deliveries in that period
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print(f"✓ Create reconciliation with no deliveries returns 400")


class TestReconciliationConfirm:
    """Test confirming reconciliation and generating debit/credit note"""
    
    def test_confirm_nonexistent_reconciliation(self, auth_headers):
        """Test confirming non-existent reconciliation returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations/invalid-id-12345/confirm",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✓ Confirm non-existent reconciliation returns 404")


class TestDebitCreditNotes:
    """Test GET /api/distributors/{id}/debit-credit-notes"""
    
    def test_list_notes_returns_200(self, auth_headers):
        """Test list debit/credit notes endpoint returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/debit-credit-notes",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ List debit/credit notes returned 200")
    
    def test_list_notes_response_structure(self, auth_headers):
        """Test list notes response has correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/debit-credit-notes",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "notes" in data, "Missing 'notes' field"
        assert "total" in data, "Missing 'total' field"
        
        print(f"✓ Response structure valid")
        print(f"  - Total notes: {data.get('total')}")
        
        # Check note structure if any exist
        if data.get('notes'):
            note = data['notes'][0]
            note_fields = ["id", "note_number", "note_type", "amount", "status"]
            for field in note_fields:
                assert field in note, f"Missing note field: {field}"
            print(f"  - First note: {note.get('note_number')} ({note.get('note_type')})")
    
    def test_list_notes_with_type_filter(self, auth_headers):
        """Test list notes with type filter"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/debit-credit-notes?note_type=debit",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All returned notes should be debit type
        for note in data.get('notes', []):
            assert note.get('note_type') == 'debit', f"Expected debit type, got {note.get('note_type')}"
        
        print(f"✓ Type filter works correctly")
    
    def test_list_notes_with_status_filter(self, auth_headers):
        """Test list notes with status filter"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/debit-credit-notes?status=pending",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All returned notes should have pending status
        for note in data.get('notes', []):
            assert note.get('status') == 'pending', f"Expected pending status, got {note.get('status')}"
        
        print(f"✓ Status filter works correctly")


class TestEndToEndReconciliationFlow:
    """Test the complete reconciliation flow"""
    
    def test_full_reconciliation_flow(self, auth_headers):
        """Test the complete flow: calculate -> create -> list -> confirm"""
        today = datetime.now()
        period_start = (today - timedelta(days=60)).strftime("%Y-%m-%d")
        period_end = today.strftime("%Y-%m-%d")
        
        # Step 1: Calculate reconciliation preview
        print("\n--- Step 1: Calculate Reconciliation Preview ---")
        calc_response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations/calculate",
            headers=auth_headers,
            json={
                "period_start": period_start,
                "period_end": period_end
            }
        )
        assert calc_response.status_code == 200, f"Calculate failed: {calc_response.text}"
        calc_data = calc_response.json()
        print(f"✓ Calculate returned: {calc_data.get('total_deliveries')} deliveries")
        
        if calc_data.get('total_deliveries', 0) == 0:
            print("⚠ No deliveries found - skipping create/confirm steps")
            print("  Note: To test full flow, create deliveries with 'delivered' status first")
            return
        
        # Step 2: Create reconciliation
        print("\n--- Step 2: Create Reconciliation ---")
        create_response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations",
            headers=auth_headers,
            json={
                "period_start": period_start,
                "period_end": period_end,
                "remarks": "TEST_e2e_reconciliation"
            }
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        rec_data = create_response.json()
        rec_id = rec_data.get('id')
        print(f"✓ Created reconciliation: {rec_data.get('reconciliation_number')}")
        print(f"  - Total difference: {rec_data.get('total_difference')}")
        print(f"  - Settlement type: {rec_data.get('settlement_type')}")
        
        # Step 3: List reconciliations and verify it appears
        print("\n--- Step 3: Verify in List ---")
        list_response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations",
            headers=auth_headers
        )
        assert list_response.status_code == 200
        list_data = list_response.json()
        rec_ids = [r.get('id') for r in list_data.get('reconciliations', [])]
        assert rec_id in rec_ids, "Created reconciliation not found in list"
        print(f"✓ Reconciliation appears in list")
        
        # Step 4: Confirm reconciliation (generates debit/credit note)
        print("\n--- Step 4: Confirm Reconciliation ---")
        confirm_response = requests.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations/{rec_id}/confirm",
            headers=auth_headers
        )
        assert confirm_response.status_code == 200, f"Confirm failed: {confirm_response.text}"
        confirm_data = confirm_response.json()
        print(f"✓ Confirmed reconciliation")
        print(f"  - Final settlement: {confirm_data.get('final_settlement_amount')}")
        print(f"  - Settlement type: {confirm_data.get('settlement_type')}")
        print(f"  - Note ID: {confirm_data.get('note_id')}")
        
        # Step 5: Verify debit/credit note was created
        if confirm_data.get('note_id'):
            print("\n--- Step 5: Verify Debit/Credit Note ---")
            notes_response = requests.get(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/debit-credit-notes",
                headers=auth_headers
            )
            assert notes_response.status_code == 200
            notes_data = notes_response.json()
            note_ids = [n.get('id') for n in notes_data.get('notes', [])]
            assert confirm_data.get('note_id') in note_ids, "Generated note not found in list"
            print(f"✓ Debit/Credit note appears in list")
        
        print("\n✓ Full reconciliation flow completed successfully!")


class TestAuthenticationRequired:
    """Test that endpoints require authentication"""
    
    def test_billing_summary_requires_auth(self):
        """Test billing summary requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/billing/summary",
            headers={"X-Tenant-ID": TENANT_ID}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Billing summary requires authentication")
    
    def test_reconciliations_requires_auth(self):
        """Test reconciliations endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations",
            headers={"X-Tenant-ID": TENANT_ID}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Reconciliations requires authentication")
    
    def test_debit_credit_notes_requires_auth(self):
        """Test debit/credit notes endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/debit-credit-notes",
            headers={"X-Tenant-ID": TENANT_ID}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Debit/credit notes requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
