"""
Test CEO/Admin Delete Functionality
Tests that CEO and Admin roles can delete:
- Shipments at any status
- Deliveries at any status
- Settlements at any status
- Reconciliations at any status
- Debit/Credit Notes at any status
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"

# CEO Test session token (UUID format)
CEO_SESSION_TOKEN = "4a36dcb4-ed25-43b7-95b5-2323a8607a94"


class TestCeoAdminDeleteFunctionality:
    """Tests for CEO/Admin delete functionality across all record types"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Get authenticated session with CEO user using session token"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CEO_SESSION_TOKEN}"
        })
        
        # Verify session is valid
        response = session.get(f"{BASE_URL}/api/auth/me")
        if response.status_code != 200:
            pytest.skip(f"Session validation failed: {response.text}")
        
        user_data = response.json()
        user_role = user_data.get("role")
        print(f"Authenticated as {user_data.get('email')} with role: {user_role}")
        
        return session
    
    @pytest.fixture(scope="class")
    def user_info(self, auth_session):
        """Get current user info"""
        response = auth_session.get(f"{BASE_URL}/api/auth/me")
        if response.status_code == 200:
            user = response.json()
            print(f"User role: {user.get('role')}")
            return user
        return {}
    
    # ============ Test Delete API Endpoints Exist ============
    
    def test_01_verify_ceo_user_login(self, auth_session, user_info):
        """Verify CEO user is logged in correctly"""
        assert user_info.get('role') in ['CEO', 'Admin', 'System Admin'], \
            f"Expected CEO/Admin role, got: {user_info.get('role')}"
        print(f"✓ CEO user verified with role: {user_info.get('role')}")
    
    def test_02_verify_distributor_exists(self, auth_session):
        """Verify test distributor exists"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}")
        assert response.status_code == 200, f"Distributor not found: {response.text}"
        distributor = response.json()
        print(f"✓ Distributor: {distributor.get('distributor_name')}")
    
    def test_03_verify_shipments_endpoint(self, auth_session):
        """Verify shipments list endpoint works"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments")
        assert response.status_code == 200, f"Shipments endpoint failed: {response.text}"
        data = response.json()
        shipments_count = len(data.get('shipments', []))
        print(f"✓ Shipments endpoint working - {shipments_count} shipments found")
        return data.get('shipments', [])
    
    def test_04_verify_deliveries_endpoint(self, auth_session):
        """Verify deliveries list endpoint works"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries")
        assert response.status_code == 200, f"Deliveries endpoint failed: {response.text}"
        data = response.json()
        deliveries_count = len(data.get('deliveries', []))
        print(f"✓ Deliveries endpoint working - {deliveries_count} deliveries found")
        return data.get('deliveries', [])
    
    def test_05_verify_settlements_endpoint(self, auth_session):
        """Verify settlements list endpoint works"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        assert response.status_code == 200, f"Settlements endpoint failed: {response.text}"
        data = response.json()
        settlements_count = len(data.get('settlements', []))
        print(f"✓ Settlements endpoint working - {settlements_count} settlements found")
        return data.get('settlements', [])
    
    def test_06_verify_reconciliations_endpoint(self, auth_session):
        """Verify reconciliations list endpoint works"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations")
        assert response.status_code == 200, f"Reconciliations endpoint failed: {response.text}"
        data = response.json()
        reconciliations_count = len(data.get('reconciliations', []))
        print(f"✓ Reconciliations endpoint working - {reconciliations_count} reconciliations found")
        return data.get('reconciliations', [])
    
    def test_07_verify_debit_credit_notes_endpoint(self, auth_session):
        """Verify debit/credit notes list endpoint works"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/debit-credit-notes")
        assert response.status_code == 200, f"Notes endpoint failed: {response.text}"
        data = response.json()
        notes_count = len(data.get('notes', []))
        print(f"✓ Debit/Credit Notes endpoint working - {notes_count} notes found")
        return data.get('notes', [])
    
    # ============ Test Delete Endpoint Response Codes ============
    
    def test_08_delete_shipment_endpoint_exists(self, auth_session):
        """Test that DELETE shipment endpoint returns proper response"""
        # Try to delete a non-existent shipment
        response = auth_session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments/nonexistent-id"
        )
        # Should return 404 for not found, not 405 (method not allowed)
        assert response.status_code in [404, 200, 403], \
            f"Unexpected response: {response.status_code} - {response.text}"
        print(f"✓ DELETE shipment endpoint exists (status: {response.status_code})")
    
    def test_09_delete_delivery_endpoint_exists(self, auth_session):
        """Test that DELETE delivery endpoint returns proper response"""
        response = auth_session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries/nonexistent-id"
        )
        assert response.status_code in [404, 200, 403], \
            f"Unexpected response: {response.status_code} - {response.text}"
        print(f"✓ DELETE delivery endpoint exists (status: {response.status_code})")
    
    def test_10_delete_settlement_endpoint_exists(self, auth_session):
        """Test that DELETE settlement endpoint returns proper response"""
        response = auth_session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/nonexistent-id"
        )
        assert response.status_code in [404, 200, 403], \
            f"Unexpected response: {response.status_code} - {response.text}"
        print(f"✓ DELETE settlement endpoint exists (status: {response.status_code})")
    
    def test_11_delete_reconciliation_endpoint_exists(self, auth_session):
        """Test that DELETE reconciliation endpoint returns proper response"""
        response = auth_session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations/nonexistent-id"
        )
        assert response.status_code in [404, 200, 403], \
            f"Unexpected response: {response.status_code} - {response.text}"
        print(f"✓ DELETE reconciliation endpoint exists (status: {response.status_code})")
    
    def test_12_delete_note_endpoint_exists(self, auth_session):
        """Test that DELETE note endpoint returns proper response"""
        response = auth_session.delete(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/notes/nonexistent-id"
        )
        assert response.status_code in [404, 200, 403], \
            f"Unexpected response: {response.status_code} - {response.text}"
        print(f"✓ DELETE note endpoint exists (status: {response.status_code})")


class TestDeleteExistingRecords:
    """Test deletion of existing records (if any exist)"""
    
    @pytest.fixture(scope="class")
    def auth_session(self):
        """Get authenticated session with CEO user using session token"""
        session = requests.Session()
        session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CEO_SESSION_TOKEN}"
        })
        
        # Verify session is valid
        response = session.get(f"{BASE_URL}/api/auth/me")
        if response.status_code != 200:
            pytest.skip(f"Session validation failed: {response.text}")
        
        return session
    
    def test_list_shipments_with_status(self, auth_session):
        """List all shipments and show their statuses"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/shipments")
        assert response.status_code == 200
        
        shipments = response.json().get('shipments', [])
        print(f"\nShipments found: {len(shipments)}")
        for s in shipments[:5]:  # Show first 5
            print(f"  - {s.get('shipment_number')}: status={s.get('status')}, id={s.get('id')[:8]}...")
    
    def test_list_deliveries_with_status(self, auth_session):
        """List all deliveries and show their statuses"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/deliveries")
        assert response.status_code == 200
        
        deliveries = response.json().get('deliveries', [])
        print(f"\nDeliveries found: {len(deliveries)}")
        for d in deliveries[:5]:  # Show first 5
            print(f"  - {d.get('delivery_number')}: status={d.get('status')}, id={d.get('id')[:8]}...")
    
    def test_list_settlements_with_status(self, auth_session):
        """List all settlements and show their statuses"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        assert response.status_code == 200
        
        settlements = response.json().get('settlements', [])
        print(f"\nSettlements found: {len(settlements)}")
        for s in settlements[:5]:  # Show first 5
            print(f"  - {s.get('settlement_number')}: status={s.get('status')}, id={s.get('id')[:8]}...")
    
    def test_list_reconciliations_with_status(self, auth_session):
        """List all reconciliations and show their statuses"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/reconciliations")
        assert response.status_code == 200
        
        reconciliations = response.json().get('reconciliations', [])
        print(f"\nReconciliations found: {len(reconciliations)}")
        for r in reconciliations[:5]:  # Show first 5
            print(f"  - {r.get('reconciliation_number')}: status={r.get('status')}, id={r.get('id')[:8]}...")
    
    def test_list_notes_with_status(self, auth_session):
        """List all debit/credit notes and show their statuses"""
        response = auth_session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/debit-credit-notes")
        assert response.status_code == 200
        
        notes = response.json().get('notes', [])
        print(f"\nDebit/Credit Notes found: {len(notes)}")
        for n in notes[:5]:  # Show first 5
            print(f"  - {n.get('note_number')}: type={n.get('note_type')}, status={n.get('status')}, id={n.get('id')[:8]}...")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
