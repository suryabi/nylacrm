"""
Test Rejection Features:
1. Rejection Reasons Master Data CRUD
2. Rejection Report API with filters
3. Batch Detail rejection summary
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"
TEST_BATCH_ID = "5833eb23-8664-4a53-8fc7-eedb9ff18178"
QC_STAGE_2_ID = "95bafa4c-f6ca-4047-a094-b038e7551898"


class TestRejectionFeatures:
    """Test rejection reasons master data and rejection report"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate and get token"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "tenant_id": TENANT_ID
        })
        
        if login_response.status_code == 200:
            data = login_response.json()
            token = data.get("session_token") or data.get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
        
        self.created_reason_ids = []
        yield
        
        # Cleanup: delete created rejection reasons
        for reason_id in self.created_reason_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/production/rejection-reasons/{reason_id}")
            except:
                pass
    
    # ─────────────────────────────────────────────────────────────
    # Rejection Reasons CRUD Tests
    # ─────────────────────────────────────────────────────────────
    
    def test_list_rejection_reasons(self):
        """GET /api/production/rejection-reasons - List all rejection reasons"""
        response = self.session.get(f"{BASE_URL}/api/production/rejection-reasons")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list response"
        print(f"✓ List rejection reasons: {len(data)} reasons found")
    
    def test_create_rejection_reason(self):
        """POST /api/production/rejection-reasons - Create a new rejection reason"""
        payload = {
            "name": "TEST_Contamination",
            "description": "Water contamination detected during QC"
        }
        response = self.session.post(f"{BASE_URL}/api/production/rejection-reasons", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain id"
        assert data["name"] == payload["name"], "Name should match"
        assert data["description"] == payload["description"], "Description should match"
        
        self.created_reason_ids.append(data["id"])
        print(f"✓ Created rejection reason: {data['id']}")
        return data["id"]
    
    def test_create_rejection_reason_duplicate_name(self):
        """POST /api/production/rejection-reasons - Duplicate name should return 400"""
        # First create a reason
        payload = {"name": "TEST_DuplicateTest", "description": "Test"}
        response1 = self.session.post(f"{BASE_URL}/api/production/rejection-reasons", json=payload)
        assert response1.status_code == 200
        self.created_reason_ids.append(response1.json()["id"])
        
        # Try to create with same name
        response2 = self.session.post(f"{BASE_URL}/api/production/rejection-reasons", json=payload)
        assert response2.status_code == 400, f"Expected 400 for duplicate, got {response2.status_code}"
        assert "already exists" in response2.json().get("detail", "").lower()
        print("✓ Duplicate name validation works")
    
    def test_update_rejection_reason(self):
        """PUT /api/production/rejection-reasons/{id} - Update a rejection reason"""
        # First create
        create_payload = {"name": "TEST_ToUpdate", "description": "Original"}
        create_response = self.session.post(f"{BASE_URL}/api/production/rejection-reasons", json=create_payload)
        assert create_response.status_code == 200
        reason_id = create_response.json()["id"]
        self.created_reason_ids.append(reason_id)
        
        # Update
        update_payload = {"name": "TEST_Updated", "description": "Updated description"}
        update_response = self.session.put(f"{BASE_URL}/api/production/rejection-reasons/{reason_id}", json=update_payload)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"
        
        data = update_response.json()
        assert data["name"] == update_payload["name"]
        assert data["description"] == update_payload["description"]
        print(f"✓ Updated rejection reason: {reason_id}")
    
    def test_delete_rejection_reason(self):
        """DELETE /api/production/rejection-reasons/{id} - Delete a rejection reason"""
        # First create
        create_payload = {"name": "TEST_ToDelete", "description": "Will be deleted"}
        create_response = self.session.post(f"{BASE_URL}/api/production/rejection-reasons", json=create_payload)
        assert create_response.status_code == 200
        reason_id = create_response.json()["id"]
        
        # Delete
        delete_response = self.session.delete(f"{BASE_URL}/api/production/rejection-reasons/{reason_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        # Verify deleted
        get_response = self.session.get(f"{BASE_URL}/api/production/rejection-reasons")
        reasons = get_response.json()
        assert not any(r["id"] == reason_id for r in reasons), "Reason should be deleted"
        print(f"✓ Deleted rejection reason: {reason_id}")
    
    def test_delete_nonexistent_reason(self):
        """DELETE /api/production/rejection-reasons/{id} - Nonexistent should return 404"""
        response = self.session.delete(f"{BASE_URL}/api/production/rejection-reasons/nonexistent-id-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Delete nonexistent returns 404")
    
    # ─────────────────────────────────────────────────────────────
    # Rejection Report API Tests
    # ─────────────────────────────────────────────────────────────
    
    def test_rejection_report_no_filters(self):
        """GET /api/production/rejection-report - Get report without filters"""
        response = self.session.get(f"{BASE_URL}/api/production/rejection-report")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "rows" in data, "Response should contain 'rows'"
        assert "total_rejected" in data, "Response should contain 'total_rejected'"
        assert "by_resource" in data, "Response should contain 'by_resource'"
        assert "by_date" in data, "Response should contain 'by_date'"
        
        assert isinstance(data["rows"], list)
        assert isinstance(data["total_rejected"], int)
        assert isinstance(data["by_resource"], list)
        assert isinstance(data["by_date"], list)
        
        print(f"✓ Rejection report: {len(data['rows'])} rows, {data['total_rejected']} total rejected")
    
    def test_rejection_report_with_batch_filter(self):
        """GET /api/production/rejection-report?batch_id=... - Filter by batch"""
        response = self.session.get(f"{BASE_URL}/api/production/rejection-report?batch_id={TEST_BATCH_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # All rows should be for the specified batch
        for row in data["rows"]:
            assert row["batch_id"] == TEST_BATCH_ID, f"Row batch_id should be {TEST_BATCH_ID}"
        
        print(f"✓ Rejection report filtered by batch: {len(data['rows'])} rows")
    
    def test_rejection_report_with_date_filter(self):
        """GET /api/production/rejection-report?date_from=...&date_to=... - Filter by date range"""
        response = self.session.get(f"{BASE_URL}/api/production/rejection-report?date_from=2025-01-01&date_to=2026-12-31")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"✓ Rejection report filtered by date: {len(data['rows'])} rows")
    
    def test_rejection_report_with_stage_type_filter(self):
        """GET /api/production/rejection-report?stage_type=qc - Filter by stage type"""
        response = self.session.get(f"{BASE_URL}/api/production/rejection-report?stage_type=qc")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # All rows should be for qc stage type
        for row in data["rows"]:
            assert row["stage_type"] == "qc", f"Row stage_type should be 'qc'"
        
        print(f"✓ Rejection report filtered by stage_type=qc: {len(data['rows'])} rows")
    
    def test_rejection_report_row_structure(self):
        """Verify rejection report row structure"""
        response = self.session.get(f"{BASE_URL}/api/production/rejection-report")
        assert response.status_code == 200
        
        data = response.json()
        if data["rows"]:
            row = data["rows"][0]
            expected_fields = ["id", "batch_id", "batch_code", "sku_name", "stage_name", 
                              "stage_type", "date", "resource_name", "resource_id",
                              "qty_inspected", "qty_rejected", "rejection_reason", "remarks"]
            for field in expected_fields:
                assert field in row, f"Row should contain '{field}'"
            print(f"✓ Rejection report row structure verified")
        else:
            print("✓ No rejection rows to verify structure (empty report)")
    
    def test_rejection_report_by_resource_structure(self):
        """Verify by_resource summary structure"""
        response = self.session.get(f"{BASE_URL}/api/production/rejection-report")
        assert response.status_code == 200
        
        data = response.json()
        for item in data["by_resource"]:
            assert "name" in item, "by_resource item should have 'name'"
            assert "bottles" in item, "by_resource item should have 'bottles'"
        print(f"✓ by_resource structure verified: {len(data['by_resource'])} resources")
    
    def test_rejection_report_by_date_structure(self):
        """Verify by_date summary structure"""
        response = self.session.get(f"{BASE_URL}/api/production/rejection-report")
        assert response.status_code == 200
        
        data = response.json()
        for item in data["by_date"]:
            assert "date" in item, "by_date item should have 'date'"
            assert "bottles" in item, "by_date item should have 'bottles'"
        print(f"✓ by_date structure verified: {len(data['by_date'])} dates")
    
    # ─────────────────────────────────────────────────────────────
    # Batch History with Rejection Summary Tests
    # ─────────────────────────────────────────────────────────────
    
    def test_batch_history_contains_inspections(self):
        """GET /api/production/batches/{id}/history - Should contain inspections with rejection data"""
        response = self.session.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/history")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "inspections" in data, "History should contain 'inspections'"
        assert "timeline" in data, "History should contain 'timeline'"
        
        # Check inspection structure
        for insp in data.get("inspections", []):
            assert "qty_rejected" in insp, "Inspection should have qty_rejected"
            assert "rejection_reason" in insp, "Inspection should have rejection_reason"
            assert "inspected_by_name" in insp, "Inspection should have inspected_by_name"
            assert "inspected_at" in insp, "Inspection should have inspected_at"
            assert "stage_name" in insp, "Inspection should have stage_name"
        
        print(f"✓ Batch history: {len(data.get('inspections', []))} inspections")
    
    # ─────────────────────────────────────────────────────────────
    # Integration: Create inspection with rejection reason from master
    # ─────────────────────────────────────────────────────────────
    
    def test_inspection_with_rejection_reason_from_master(self):
        """Create inspection using rejection reason from master data"""
        # First create a rejection reason
        reason_payload = {"name": "TEST_IntegrationReason", "description": "For integration test"}
        reason_response = self.session.post(f"{BASE_URL}/api/production/rejection-reasons", json=reason_payload)
        assert reason_response.status_code == 200
        reason_id = reason_response.json()["id"]
        self.created_reason_ids.append(reason_id)
        
        # Get batch to check if there are pending crates at QC Stage 2
        batch_response = self.session.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}")
        assert batch_response.status_code == 200
        batch = batch_response.json()
        
        stage_balances = batch.get("stage_balances", {})
        qc_stage_2_balance = stage_balances.get(QC_STAGE_2_ID, {})
        pending = qc_stage_2_balance.get("pending", 0)
        
        if pending > 0:
            # Do an inspection with rejection using the master reason
            inspect_payload = {
                "stage_id": QC_STAGE_2_ID,
                "qty_inspected": 1,
                "qty_rejected": 2,  # 2 bottles rejected
                "rejection_reason": reason_payload["name"],  # Use the reason name
                "remarks": "Integration test inspection"
            }
            inspect_response = self.session.post(
                f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
                json=inspect_payload
            )
            assert inspect_response.status_code == 200, f"Inspection failed: {inspect_response.text}"
            
            # Verify the rejection reason is recorded
            history_response = self.session.get(f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/history")
            assert history_response.status_code == 200
            history = history_response.json()
            
            # Find our inspection
            found = False
            for insp in history.get("inspections", []):
                if insp.get("rejection_reason") == reason_payload["name"]:
                    found = True
                    break
            
            assert found, "Inspection with rejection reason should be in history"
            print("✓ Inspection with master rejection reason recorded successfully")
        else:
            print(f"✓ Skipped inspection test - no pending crates at QC Stage 2 (pending={pending})")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
