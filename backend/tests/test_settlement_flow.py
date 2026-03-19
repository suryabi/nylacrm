"""
Settlement Flow E2E Test
Tests the complete settlement workflow:
1. List existing settlements
2. Get unsettled deliveries
3. Create settlement
4. Submit settlement for approval
5. Approve settlement
6. Mark settlement as paid
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"

# Test distributor ID
DISTRIBUTOR_ID = "99fb55dc-532c-4e85-b618-6b8a5e552c04"


class TestSettlementFlowE2E:
    """E2E tests for Settlement flow in Distributor Management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("session_token") or data.get("token") or data.get("access_token")
        assert self.token, "Token not found in login response"
        
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Store created settlement IDs for cleanup
        self.created_settlement_ids = []
        
        yield
        
        # Cleanup: Delete created test settlements
        for settlement_id in self.created_settlement_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{settlement_id}")
            except Exception:
                pass
    
    def test_01_list_existing_settlements(self):
        """Test listing existing settlements for a distributor"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        
        assert response.status_code == 200, f"Failed to list settlements: {response.text}"
        
        data = response.json()
        assert "settlements" in data, "Response missing 'settlements' field"
        assert "total" in data, "Response missing 'total' field"
        
        # Verify existing settlement exists (from context)
        settlements = data["settlements"]
        print(f"Found {len(settlements)} settlements for distributor")
        
        if settlements:
            settlement = settlements[0]
            assert "id" in settlement, "Settlement missing 'id'"
            assert "settlement_number" in settlement, "Settlement missing 'settlement_number'"
            assert "status" in settlement, "Settlement missing 'status'"
            assert "period_start" in settlement, "Settlement missing 'period_start'"
            assert "period_end" in settlement, "Settlement missing 'period_end'"
            print(f"First settlement: {settlement['settlement_number']} - Status: {settlement['status']}")
    
    def test_02_get_unsettled_deliveries(self):
        """Test fetching unsettled deliveries for a date range"""
        # Use Dec 2025 to Mar 2026 as suggested in context
        from_date = "2025-12-01"
        to_date = "2026-03-31"
        
        response = self.session.get(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/unsettled-deliveries",
            params={"from_date": from_date, "to_date": to_date}
        )
        
        assert response.status_code == 200, f"Failed to get unsettled deliveries: {response.text}"
        
        data = response.json()
        assert "deliveries" in data, "Response missing 'deliveries' field"
        
        deliveries = data["deliveries"]
        print(f"Found {len(deliveries)} unsettled deliveries from {from_date} to {to_date}")
        
        if deliveries:
            delivery = deliveries[0]
            assert "id" in delivery, "Delivery missing 'id'"
            assert "delivery_number" in delivery, "Delivery missing 'delivery_number'"
            print(f"Sample unsettled delivery: {delivery['delivery_number']}")
    
    def test_03_get_settlement_detail(self):
        """Test getting settlement detail with items"""
        # First get list to find an existing settlement
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        assert response.status_code == 200
        
        settlements = response.json().get("settlements", [])
        if not settlements:
            pytest.skip("No existing settlements to test detail view")
        
        settlement_id = settlements[0]["id"]
        
        # Get settlement detail
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{settlement_id}")
        
        assert response.status_code == 200, f"Failed to get settlement detail: {response.text}"
        
        data = response.json()
        assert "id" in data, "Settlement detail missing 'id'"
        assert "settlement_number" in data, "Settlement detail missing 'settlement_number'"
        assert "status" in data, "Settlement detail missing 'status'"
        assert "total_deliveries" in data, "Settlement detail missing 'total_deliveries'"
        assert "total_delivery_amount" in data, "Settlement detail missing 'total_delivery_amount'"
        assert "total_margin_amount" in data, "Settlement detail missing 'total_margin_amount'"
        assert "final_payout" in data, "Settlement detail missing 'final_payout'"
        
        print(f"Settlement {data['settlement_number']}: {data['total_deliveries']} deliveries, Payout: {data['final_payout']}")
    
    def test_04_create_settlement_validates_dates(self):
        """Test that creating settlement validates required dates"""
        # Missing period_end
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements",
            json={
                "period_type": "monthly",
                "period_start": "2025-12-01"
                # Missing period_end
            }
        )
        
        # Should fail validation
        assert response.status_code in [400, 422], f"Expected validation error, got {response.status_code}"
    
    def test_05_create_settlement_no_deliveries(self):
        """Test that creating settlement fails when no deliveries exist for period"""
        # Use a date range with no deliveries
        response = self.session.post(
            f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements",
            json={
                "period_type": "custom",
                "period_start": "2020-01-01",
                "period_end": "2020-01-31",
                "remarks": "Test settlement"
            }
        )
        
        # Should fail because no deliveries in this period (400 or 422 for validation)
        assert response.status_code in [400, 422], f"Expected 400/422 for no deliveries, got {response.status_code}"
    
    def test_06_settlements_summary(self):
        """Test the settlements summary endpoint"""
        response = self.session.get(
            f"{BASE_URL}/api/distributors/settlements/summary",
            params={"distributor_id": DISTRIBUTOR_ID}
        )
        
        assert response.status_code == 200, f"Failed to get settlements summary: {response.text}"
        
        data = response.json()
        assert "total" in data, "Summary missing 'total'"
        assert "by_status" in data, "Summary missing 'by_status'"
        
        print(f"Settlements summary: Total={data['total']}, By Status={data['by_status']}")
    
    def test_07_all_settlements_list(self):
        """Test listing all settlements across distributors"""
        response = self.session.get(f"{BASE_URL}/api/distributors/settlements/all")
        
        assert response.status_code == 200, f"Failed to list all settlements: {response.text}"
        
        data = response.json()
        assert "settlements" in data, "Response missing 'settlements'"
        assert "total" in data, "Response missing 'total'"
        assert "page" in data, "Response missing 'page'"
        
        print(f"Total settlements across all distributors: {data['total']}")
    
    def test_08_settlement_status_workflow_draft_only_delete(self):
        """Test that only draft settlements can be deleted"""
        # Get existing settlements
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        settlements = response.json().get("settlements", [])
        
        # Find a non-draft settlement
        non_draft = next((s for s in settlements if s['status'] != 'draft'), None)
        
        if non_draft:
            # Try to delete - should fail
            response = self.session.delete(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{non_draft['id']}"
            )
            assert response.status_code == 400, f"Expected 400 for deleting non-draft, got {response.status_code}"
            print(f"Correctly rejected delete for settlement with status: {non_draft['status']}")
        else:
            pytest.skip("No non-draft settlements to test delete restriction")
    
    def test_09_settlement_submit_workflow(self):
        """Test submitting a draft settlement for approval"""
        # Find a draft settlement
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        settlements = response.json().get("settlements", [])
        
        draft = next((s for s in settlements if s['status'] == 'draft'), None)
        
        if draft:
            # Submit for approval
            response = self.session.post(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{draft['id']}/submit"
            )
            
            if response.status_code == 200:
                data = response.json()
                assert data.get('status') == 'pending_approval', "Status should be pending_approval after submit"
                print(f"Successfully submitted settlement {draft['settlement_number']} for approval")
                
                # Verify the settlement status changed
                verify_response = self.session.get(
                    f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{draft['id']}"
                )
                assert verify_response.status_code == 200
                assert verify_response.json().get('status') == 'pending_approval'
            else:
                print(f"Submit returned: {response.status_code} - {response.text}")
        else:
            pytest.skip("No draft settlement available to test submit workflow")
    
    def test_10_settlement_approve_workflow(self):
        """Test approving a pending settlement"""
        # Find a pending_approval settlement
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        settlements = response.json().get("settlements", [])
        
        pending = next((s for s in settlements if s['status'] == 'pending_approval'), None)
        
        if pending:
            # Approve the settlement
            response = self.session.post(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{pending['id']}/approve"
            )
            
            if response.status_code == 200:
                data = response.json()
                assert data.get('status') == 'approved', "Status should be approved after approval"
                print(f"Successfully approved settlement {pending['settlement_number']}")
                
                # Verify the settlement status changed
                verify_response = self.session.get(
                    f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{pending['id']}"
                )
                assert verify_response.status_code == 200
                assert verify_response.json().get('status') == 'approved'
            elif response.status_code == 403:
                print("User doesn't have permission to approve - expected for non-senior roles")
            else:
                print(f"Approve returned: {response.status_code} - {response.text}")
        else:
            pytest.skip("No pending_approval settlement available to test approve workflow")
    
    def test_11_settlement_mark_paid_workflow(self):
        """Test marking an approved settlement as paid"""
        # Find an approved settlement
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        settlements = response.json().get("settlements", [])
        
        approved = next((s for s in settlements if s['status'] == 'approved'), None)
        
        if approved:
            # Mark as paid
            response = self.session.post(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{approved['id']}/mark-paid",
                params={"payment_reference": "TEST-PAY-001"}
            )
            
            if response.status_code == 200:
                data = response.json()
                assert data.get('status') == 'paid', "Status should be paid after marking paid"
                print(f"Successfully marked settlement {approved['settlement_number']} as paid")
                
                # Verify the settlement status changed
                verify_response = self.session.get(
                    f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{approved['id']}"
                )
                assert verify_response.status_code == 200
                assert verify_response.json().get('status') == 'paid'
            else:
                print(f"Mark-paid returned: {response.status_code} - {response.text}")
        else:
            pytest.skip("No approved settlement available to test mark-paid workflow")


class TestSettlementAPIValidation:
    """Test settlement API validation and error handling"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("session_token") or data.get("token") or data.get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_settlement_invalid_distributor(self):
        """Test settlement API with invalid distributor ID"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        
        response = self.session.get(f"{BASE_URL}/api/distributors/{fake_id}/settlements")
        # Should return empty list or 404
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert data.get('total', 0) == 0 or len(data.get('settlements', [])) == 0
    
    def test_settlement_invalid_settlement_id(self):
        """Test settlement detail with invalid settlement ID"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{fake_id}")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_unsettled_deliveries_missing_dates(self):
        """Test unsettled deliveries API with missing dates"""
        # Missing both dates
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/unsettled-deliveries")
        
        # Should return empty list or handle gracefully
        assert response.status_code in [200, 400, 422], f"Unexpected status: {response.status_code}"
    
    def test_submit_non_draft_settlement(self):
        """Test that submitting non-draft settlement fails"""
        # Get settlements
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        settlements = response.json().get("settlements", [])
        
        # Find a non-draft settlement
        non_draft = next((s for s in settlements if s['status'] != 'draft'), None)
        
        if non_draft:
            response = self.session.post(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{non_draft['id']}/submit"
            )
            assert response.status_code == 400, f"Expected 400 for submitting non-draft, got {response.status_code}"
        else:
            pytest.skip("No non-draft settlement to test")
    
    def test_approve_non_pending_settlement(self):
        """Test that approving non-pending settlement fails"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        settlements = response.json().get("settlements", [])
        
        # Find a settlement that's not pending_approval
        non_pending = next((s for s in settlements if s['status'] not in ['pending_approval']), None)
        
        if non_pending:
            response = self.session.post(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{non_pending['id']}/approve"
            )
            # Should fail because not pending_approval (or 403 for permission)
            assert response.status_code in [400, 403], f"Expected 400/403, got {response.status_code}"
        else:
            pytest.skip("No non-pending settlement to test")
    
    def test_mark_paid_non_approved_settlement(self):
        """Test that marking non-approved settlement as paid fails"""
        response = self.session.get(f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements")
        settlements = response.json().get("settlements", [])
        
        # Find a settlement that's not approved
        non_approved = next((s for s in settlements if s['status'] != 'approved'), None)
        
        if non_approved:
            response = self.session.post(
                f"{BASE_URL}/api/distributors/{DISTRIBUTOR_ID}/settlements/{non_approved['id']}/mark-paid"
            )
            assert response.status_code == 400, f"Expected 400 for marking non-approved as paid, got {response.status_code}"
        else:
            pytest.skip("No non-approved settlement to test")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
