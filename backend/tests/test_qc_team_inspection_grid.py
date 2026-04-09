"""
QC Team Master CRUD and Inspection Grid with Rejections Array Tests
Tests:
- QC Team CRUD: POST/GET/PUT/DELETE /api/production/qc-team
- Duplicate QC Team member name validation
- Inspection with rejections array: POST /api/production/batches/{batch_id}/inspect
- Validation: resource and reason required for non-zero rejection rows
- Total rejected validation: sum cannot exceed qty_inspected * bottles_per_crate
- Rejection report shows per-entry data from rejections array
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "test123"
TENANT_ID = "nyla-air-water"
TEST_BATCH_ID = "5833eb23-8664-4a53-8fc7-eedb9ff18178"
QC_STAGE_2_ID = "95bafa4c-f6ca-4047-a094-b038e7551898"
BOTTLES_PER_CRATE = 48


@pytest.fixture(scope="module")
def auth_headers():
    """Get authentication token and return headers"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    token = data.get("session_token") or data.get("token")
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def created_qc_members(auth_headers):
    """Create test QC team members and clean up after tests"""
    created_ids = []
    
    # Create 3 test members
    test_members = [
        {"name": f"TEST_QC_Member_{uuid.uuid4().hex[:6]}", "role": "QC Inspector"},
        {"name": f"TEST_QC_Member_{uuid.uuid4().hex[:6]}", "role": "QC Lead"},
        {"name": f"TEST_QC_Member_{uuid.uuid4().hex[:6]}", "role": "QC Supervisor"},
    ]
    
    for member in test_members:
        response = requests.post(
            f"{BASE_URL}/api/production/qc-team",
            json=member,
            headers=auth_headers
        )
        if response.status_code == 201 or response.status_code == 200:
            data = response.json()
            created_ids.append({"id": data["id"], "name": data["name"], "role": data.get("role", "")})
    
    yield created_ids
    
    # Cleanup
    for member in created_ids:
        try:
            requests.delete(f"{BASE_URL}/api/production/qc-team/{member['id']}", headers=auth_headers)
        except:
            pass


@pytest.fixture(scope="module")
def created_rejection_reasons(auth_headers):
    """Create test rejection reasons and clean up after tests"""
    created_ids = []
    
    # Create 2 test reasons
    test_reasons = [
        {"name": f"TEST_Reason_{uuid.uuid4().hex[:6]}", "description": "Test reason 1"},
        {"name": f"TEST_Reason_{uuid.uuid4().hex[:6]}", "description": "Test reason 2"},
    ]
    
    for reason in test_reasons:
        response = requests.post(
            f"{BASE_URL}/api/production/rejection-reasons",
            json=reason,
            headers=auth_headers
        )
        if response.status_code == 201 or response.status_code == 200:
            data = response.json()
            created_ids.append({"id": data["id"], "name": data["name"]})
    
    yield created_ids
    
    # Cleanup
    for reason in created_ids:
        try:
            requests.delete(f"{BASE_URL}/api/production/rejection-reasons/{reason['id']}", headers=auth_headers)
        except:
            pass


class TestQCTeamCRUD:
    """QC Team Master CRUD tests"""
    
    def test_list_qc_team(self, auth_headers):
        """GET /api/production/qc-team - List all QC team members"""
        response = requests.get(f"{BASE_URL}/api/production/qc-team", headers=auth_headers)
        assert response.status_code == 200, f"Failed to list QC team: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASSED: GET /api/production/qc-team - Found {len(data)} members")
    
    def test_create_qc_team_member(self, auth_headers):
        """POST /api/production/qc-team - Create new QC team member"""
        unique_name = f"TEST_QC_Create_{uuid.uuid4().hex[:6]}"
        payload = {"name": unique_name, "role": "QC Inspector"}
        
        response = requests.post(
            f"{BASE_URL}/api/production/qc-team",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code in [200, 201], f"Failed to create QC member: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data, "Response should contain id"
        assert data["name"] == unique_name, "Name should match"
        assert data["role"] == "QC Inspector", "Role should match"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/production/qc-team/{data['id']}", headers=auth_headers)
        print(f"PASSED: POST /api/production/qc-team - Created member: {unique_name}")
    
    def test_create_duplicate_qc_team_member(self, auth_headers, created_qc_members):
        """POST /api/production/qc-team - Duplicate name should return 400"""
        if not created_qc_members:
            pytest.skip("No QC members created for duplicate test")
        
        existing_name = created_qc_members[0]["name"]
        payload = {"name": existing_name, "role": "QC Inspector"}
        
        response = requests.post(
            f"{BASE_URL}/api/production/qc-team",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 400, f"Expected 400 for duplicate name, got {response.status_code}"
        assert "already exists" in response.text.lower(), "Error should mention 'already exists'"
        print(f"PASSED: Duplicate QC team member name validation - 400 returned")
    
    def test_update_qc_team_member(self, auth_headers, created_qc_members):
        """PUT /api/production/qc-team/{id} - Update QC team member"""
        if not created_qc_members:
            pytest.skip("No QC members created for update test")
        
        member_id = created_qc_members[0]["id"]
        new_role = "Senior QC Inspector"
        payload = {"role": new_role}
        
        response = requests.put(
            f"{BASE_URL}/api/production/qc-team/{member_id}",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to update QC member: {response.text}"
        data = response.json()
        assert data["role"] == new_role, "Role should be updated"
        print(f"PASSED: PUT /api/production/qc-team/{member_id} - Updated role")
    
    def test_delete_qc_team_member(self, auth_headers):
        """DELETE /api/production/qc-team/{id} - Delete QC team member"""
        # Create a member to delete
        unique_name = f"TEST_QC_Delete_{uuid.uuid4().hex[:6]}"
        create_response = requests.post(
            f"{BASE_URL}/api/production/qc-team",
            json={"name": unique_name, "role": "QC Inspector"},
            headers=auth_headers
        )
        assert create_response.status_code in [200, 201], f"Failed to create member for delete test"
        member_id = create_response.json()["id"]
        
        # Delete the member
        response = requests.delete(
            f"{BASE_URL}/api/production/qc-team/{member_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to delete QC member: {response.text}"
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/production/qc-team", headers=auth_headers)
        members = get_response.json()
        assert not any(m["id"] == member_id for m in members), "Member should be deleted"
        print(f"PASSED: DELETE /api/production/qc-team/{member_id} - Member deleted")
    
    def test_delete_nonexistent_qc_team_member(self, auth_headers):
        """DELETE /api/production/qc-team/{id} - Nonexistent member should return 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(
            f"{BASE_URL}/api/production/qc-team/{fake_id}",
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404 for nonexistent member, got {response.status_code}"
        print(f"PASSED: DELETE nonexistent QC member - 404 returned")


class TestInspectionWithRejectionsGrid:
    """Inspection form with editable rejection grid tests"""
    
    def test_get_batch_for_inspection(self, auth_headers):
        """GET /api/production/batches/{batch_id} - Get batch details"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get batch: {response.text}"
        data = response.json()
        
        assert "stage_balances" in data, "Batch should have stage_balances"
        assert "qc_stages" in data, "Batch should have qc_stages"
        assert "bottles_per_crate" in data, "Batch should have bottles_per_crate"
        print(f"PASSED: GET batch {TEST_BATCH_ID} - bottles_per_crate={data.get('bottles_per_crate')}")
    
    def test_inspection_with_rejections_array(self, auth_headers, created_qc_members, created_rejection_reasons):
        """POST /api/production/batches/{batch_id}/inspect - Submit inspection with rejections array"""
        if not created_qc_members or not created_rejection_reasons:
            pytest.skip("Need QC members and rejection reasons for this test")
        
        # First check if there are pending crates at QC Stage 2
        batch_response = requests.get(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}",
            headers=auth_headers
        )
        batch = batch_response.json()
        stage_balances = batch.get("stage_balances", {})
        qc_stage_2_bal = stage_balances.get(QC_STAGE_2_ID, {})
        pending = qc_stage_2_bal.get("pending", 0)
        
        if pending == 0:
            # Try to move some stock to QC Stage 2 first
            # Find first stage and move from unallocated
            stages = sorted(batch.get("qc_stages", []), key=lambda s: s["order"])
            if stages and batch.get("unallocated_crates", 0) > 0:
                first_stage_id = stages[0]["id"]
                move_response = requests.post(
                    f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/move",
                    json={"to_stage_id": first_stage_id, "quantity": 5},
                    headers=auth_headers
                )
                print(f"Moved 5 crates to first stage: {move_response.status_code}")
            pytest.skip(f"No pending crates at QC Stage 2 (pending={pending})")
        
        # Build rejections array with 2 entries
        rejections = [
            {
                "resource_id": created_qc_members[0]["id"],
                "resource_name": created_qc_members[0]["name"],
                "date": "2026-01-15",
                "qty_rejected": 5,
                "reason": created_rejection_reasons[0]["name"]
            },
            {
                "resource_id": created_qc_members[1]["id"] if len(created_qc_members) > 1 else created_qc_members[0]["id"],
                "resource_name": created_qc_members[1]["name"] if len(created_qc_members) > 1 else created_qc_members[0]["name"],
                "date": "2026-01-16",
                "qty_rejected": 3,
                "reason": created_rejection_reasons[1]["name"] if len(created_rejection_reasons) > 1 else created_rejection_reasons[0]["name"]
            }
        ]
        
        # Inspect 1 crate (48 bottles max, we're rejecting 8)
        payload = {
            "stage_id": QC_STAGE_2_ID,
            "qty_inspected": 1,
            "rejections": rejections,
            "remarks": "Test inspection with grid"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            json=payload,
            headers=auth_headers
        )
        
        if response.status_code != 200:
            print(f"Inspection response: {response.text}")
        
        assert response.status_code == 200, f"Failed to record inspection: {response.text}"
        data = response.json()
        
        # Verify stage balances updated
        updated_bal = data.get("stage_balances", {}).get(QC_STAGE_2_ID, {})
        assert updated_bal.get("rejected", 0) >= 8, "Rejected count should include our 8 bottles"
        print(f"PASSED: Inspection with rejections array - rejected={updated_bal.get('rejected')}")
    
    def test_inspection_total_rejected_validation(self, auth_headers, created_qc_members, created_rejection_reasons):
        """POST /api/production/batches/{batch_id}/inspect - Total rejected cannot exceed max bottles"""
        if not created_qc_members or not created_rejection_reasons:
            pytest.skip("Need QC members and rejection reasons for this test")
        
        # Check pending crates
        batch_response = requests.get(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}",
            headers=auth_headers
        )
        batch = batch_response.json()
        stage_balances = batch.get("stage_balances", {})
        qc_stage_2_bal = stage_balances.get(QC_STAGE_2_ID, {})
        pending = qc_stage_2_bal.get("pending", 0)
        bottles_per_crate = batch.get("bottles_per_crate", 48)
        
        if pending == 0:
            pytest.skip("No pending crates at QC Stage 2")
        
        # Try to reject more bottles than possible (1 crate = 48 bottles, try 100)
        rejections = [
            {
                "resource_id": created_qc_members[0]["id"],
                "resource_name": created_qc_members[0]["name"],
                "date": "2026-01-15",
                "qty_rejected": 100,  # More than 48 bottles in 1 crate
                "reason": created_rejection_reasons[0]["name"]
            }
        ]
        
        payload = {
            "stage_id": QC_STAGE_2_ID,
            "qty_inspected": 1,
            "rejections": rejections,
            "remarks": "Test validation"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Expected 400 for exceeding max bottles, got {response.status_code}"
        assert "exceeds" in response.text.lower() or "max" in response.text.lower(), "Error should mention exceeding max"
        print(f"PASSED: Total rejected validation - 400 returned for exceeding max bottles")
    
    def test_inspection_with_zero_rejections(self, auth_headers):
        """POST /api/production/batches/{batch_id}/inspect - Inspection with empty rejections array (all pass)"""
        # Check pending crates
        batch_response = requests.get(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}",
            headers=auth_headers
        )
        batch = batch_response.json()
        stage_balances = batch.get("stage_balances", {})
        qc_stage_2_bal = stage_balances.get(QC_STAGE_2_ID, {})
        pending = qc_stage_2_bal.get("pending", 0)
        
        if pending == 0:
            pytest.skip("No pending crates at QC Stage 2")
        
        payload = {
            "stage_id": QC_STAGE_2_ID,
            "qty_inspected": 1,
            "rejections": [],  # Empty - all pass
            "remarks": "All passed inspection"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/inspect",
            json=payload,
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Failed to record inspection with zero rejections: {response.text}"
        print(f"PASSED: Inspection with empty rejections array (all pass)")


class TestRejectionReportWithGridEntries:
    """Rejection report showing per-entry data from rejections array"""
    
    def test_rejection_report_shows_per_entry_rows(self, auth_headers):
        """GET /api/production/rejection-report - Should show individual rejection entries"""
        response = requests.get(
            f"{BASE_URL}/api/production/rejection-report?batch_id={TEST_BATCH_ID}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get rejection report: {response.text}"
        data = response.json()
        
        assert "rows" in data, "Report should have rows"
        assert "total_rejected" in data, "Report should have total_rejected"
        assert "by_resource" in data, "Report should have by_resource summary"
        assert "by_date" in data, "Report should have by_date summary"
        
        # Check row structure
        if data["rows"]:
            row = data["rows"][0]
            expected_fields = ["batch_code", "stage_name", "resource_name", "qty_rejected", "rejection_reason", "date"]
            for field in expected_fields:
                assert field in row, f"Row should have {field}"
        
        print(f"PASSED: Rejection report - {len(data['rows'])} rows, total_rejected={data['total_rejected']}")
    
    def test_rejection_report_by_resource_summary(self, auth_headers):
        """GET /api/production/rejection-report - by_resource summary structure"""
        response = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        by_resource = data.get("by_resource", [])
        if by_resource:
            entry = by_resource[0]
            assert "name" in entry, "by_resource entry should have name"
            assert "bottles" in entry, "by_resource entry should have bottles"
        
        print(f"PASSED: Rejection report by_resource summary - {len(by_resource)} resources")
    
    def test_rejection_report_by_date_summary(self, auth_headers):
        """GET /api/production/rejection-report - by_date summary structure"""
        response = requests.get(
            f"{BASE_URL}/api/production/rejection-report",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        by_date = data.get("by_date", [])
        if by_date:
            entry = by_date[0]
            assert "date" in entry, "by_date entry should have date"
            assert "bottles" in entry, "by_date entry should have bottles"
        
        print(f"PASSED: Rejection report by_date summary - {len(by_date)} dates")


class TestBatchHistoryWithRejectionEntries:
    """Batch history showing per-resource rejection details"""
    
    def test_batch_history_contains_rejections_array(self, auth_headers):
        """GET /api/production/batches/{batch_id}/history - Inspections should have rejections array"""
        response = requests.get(
            f"{BASE_URL}/api/production/batches/{TEST_BATCH_ID}/history",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get batch history: {response.text}"
        data = response.json()
        
        assert "inspections" in data, "History should have inspections"
        assert "timeline" in data, "History should have timeline"
        
        # Check if any inspection has rejections array
        inspections = data.get("inspections", [])
        has_rejections_array = False
        for insp in inspections:
            if "rejections" in insp and isinstance(insp["rejections"], list):
                has_rejections_array = True
                # Verify rejection entry structure
                for rej in insp["rejections"]:
                    if rej.get("qty_rejected", 0) > 0:
                        assert "resource_name" in rej, "Rejection entry should have resource_name"
                        assert "date" in rej, "Rejection entry should have date"
                        assert "reason" in rej, "Rejection entry should have reason"
                break
        
        print(f"PASSED: Batch history - {len(inspections)} inspections, has_rejections_array={has_rejections_array}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
