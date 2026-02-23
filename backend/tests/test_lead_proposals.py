"""
Test suite for Lead Proposals Module
Tests:
- GET /api/leads/{lead_id}/proposal - Get current proposal
- POST /api/leads/{lead_id}/proposal - Upload proposal
- GET /api/leads/{lead_id}/proposal/download - Download proposal
- DELETE /api/leads/{lead_id}/proposal - Delete proposal
- PUT /api/leads/{lead_id}/proposal/review - Review proposal
"""
import pytest
import requests
import os
import io
import base64

# Get the backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - Director (Approver role)
TEST_USER_EMAIL = "admin@nylaairwater.earth"
TEST_USER_PASSWORD = "admin123"

# Non-approver credentials for permission testing
SALES_REP_EMAIL = "bengaluru.sales1@nylaairwater.earth"
SALES_REP_PASSWORD = "Nyla2026!"


class TestLeadProposals:
    """Test cases for Lead Proposals CRUD and review workflow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and authenticate"""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        # Login and get session
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        self.user = login_response.json().get('user')
        self.session_token = login_response.json().get('session_token')
        self.session.headers.update({'Authorization': f'Bearer {self.session_token}'})
        
        # Get a lead to test with
        leads_response = self.session.get(f"{BASE_URL}/api/leads?page_size=1")
        if leads_response.status_code == 200 and leads_response.json().get('data'):
            self.test_lead_id = leads_response.json()['data'][0]['id']
        else:
            # Create a test lead if none exist
            lead_data = {
                "company": "TEST_Proposal_Company",
                "city": "Bengaluru",
                "state": "Karnataka",
                "region": "South India",
                "status": "new"
            }
            create_response = self.session.post(f"{BASE_URL}/api/leads", json=lead_data)
            assert create_response.status_code == 200, f"Lead creation failed: {create_response.text}"
            self.test_lead_id = create_response.json()['id']
        
        yield
        
        # Cleanup - delete any test proposal
        try:
            self.session.delete(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
        except:
            pass

    # ============= GET PROPOSAL TESTS =============
    
    def test_get_proposal_no_proposal(self):
        """GET /api/leads/{lead_id}/proposal - returns null when no proposal exists"""
        # First ensure no proposal exists
        self.session.delete(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
        
        response = self.session.get(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'proposal' in data
        assert data['proposal'] is None
    
    def test_get_proposal_invalid_lead(self):
        """GET /api/leads/{lead_id}/proposal - returns 404 for invalid lead"""
        response = self.session.get(f"{BASE_URL}/api/leads/invalid-lead-id-12345/proposal")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"

    # ============= UPLOAD PROPOSAL TESTS =============
    
    def test_upload_proposal_pdf(self):
        """POST /api/leads/{lead_id}/proposal - upload PDF proposal"""
        # Create a test PDF content
        pdf_content = b'%PDF-1.4 test content for proposal upload'
        
        # Prepare multipart form data
        files = {
            'file': ('test_proposal.pdf', pdf_content, 'application/pdf')
        }
        
        # Remove Content-Type header for multipart
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        
        data = response.json()
        assert 'proposal' in data
        assert data['proposal']['file_name'] == 'test_proposal.pdf'
        assert data['proposal']['status'] == 'pending_review'
        assert data['proposal']['version'] == 1
        assert data['proposal']['uploaded_by'] == self.user['id']
        print(f"SUCCESS: Uploaded PDF proposal v{data['proposal']['version']}")

    def test_upload_proposal_docx(self):
        """POST /api/leads/{lead_id}/proposal - upload DOCX proposal"""
        # Create minimal DOCX content
        docx_content = b'PK\x03\x04 test docx content'
        
        files = {
            'file': ('test_proposal.docx', docx_content, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert data['proposal']['document_type'] == 'docx'
        print(f"SUCCESS: Uploaded DOCX proposal")

    def test_upload_proposal_invalid_type(self):
        """POST /api/leads/{lead_id}/proposal - reject invalid file types"""
        # Try to upload a text file
        files = {
            'file': ('test.txt', b'Some text content', 'text/plain')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert 'Only PDF and DOC/DOCX' in response.json().get('detail', '')
        print("SUCCESS: Invalid file type rejected")

    def test_upload_proposal_exceeds_size_limit(self):
        """POST /api/leads/{lead_id}/proposal - reject files > 5MB"""
        # Create content larger than 5MB
        large_content = b'x' * (6 * 1024 * 1024)  # 6 MB
        
        files = {
            'file': ('large_proposal.pdf', large_content, 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert '5 MB' in response.json().get('detail', '')
        print("SUCCESS: File size limit enforced")

    def test_upload_proposal_replaces_existing(self):
        """POST /api/leads/{lead_id}/proposal - new upload replaces old and increments version"""
        # First upload
        files = {
            'file': ('proposal_v1.pdf', b'%PDF-1.4 version 1', 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        response1 = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        assert response1.status_code == 200
        v1 = response1.json()['proposal']['version']
        
        # Second upload should replace
        files = {
            'file': ('proposal_v2.pdf', b'%PDF-1.4 version 2', 'application/pdf')
        }
        response2 = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        assert response2.status_code == 200
        data = response2.json()
        assert data['proposal']['version'] == v1 + 1
        assert data['proposal']['file_name'] == 'proposal_v2.pdf'
        print(f"SUCCESS: Version incremented from {v1} to {data['proposal']['version']}")

    # ============= DOWNLOAD PROPOSAL TESTS =============
    
    def test_download_proposal(self):
        """GET /api/leads/{lead_id}/proposal/download - download proposal with file data"""
        # First upload a proposal
        pdf_content = b'%PDF-1.4 downloadable content'
        files = {
            'file': ('downloadable.pdf', pdf_content, 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        assert upload_response.status_code == 200
        
        # Now download
        response = self.session.get(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/download")
        assert response.status_code == 200, f"Download failed: {response.text}"
        
        data = response.json()
        assert 'proposal' in data
        assert 'file_data' in data['proposal']
        assert data['proposal']['file_name'] == 'downloadable.pdf'
        
        # Verify file data is base64 encoded
        decoded = base64.b64decode(data['proposal']['file_data'])
        assert decoded == pdf_content
        print("SUCCESS: Downloaded proposal with correct file data")

    def test_download_proposal_not_found(self):
        """GET /api/leads/{lead_id}/proposal/download - 404 when no proposal exists"""
        # Delete any existing proposal
        self.session.delete(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
        
        response = self.session.get(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/download")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: Download returns 404 for non-existent proposal")

    # ============= DELETE PROPOSAL TESTS =============
    
    def test_delete_proposal_by_uploader(self):
        """DELETE /api/leads/{lead_id}/proposal - uploader can delete when pending_review"""
        # Upload a proposal
        files = {
            'file': ('to_delete.pdf', b'%PDF-1.4 to delete', 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        assert upload_response.status_code == 200
        
        # Delete the proposal
        response = self.session.delete(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
        assert response.status_code == 200, f"Delete failed: {response.text}"
        assert 'deleted' in response.json().get('message', '').lower()
        
        # Verify it's deleted
        get_response = self.session.get(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
        assert get_response.json()['proposal'] is None
        print("SUCCESS: Proposal deleted by uploader")

    def test_delete_proposal_not_pending_fails(self):
        """DELETE /api/leads/{lead_id}/proposal - cannot delete if not pending_review"""
        # Upload a proposal
        files = {
            'file': ('approved.pdf', b'%PDF-1.4 approved', 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        # Approve the proposal (user is Director - approver role)
        review_response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "approved", "comment": "Looks good"}
        )
        assert review_response.status_code == 200
        
        # Try to delete approved proposal
        response = self.session.delete(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert 'Pending Review' in response.json().get('detail', '')
        print("SUCCESS: Cannot delete non-pending proposal")

    # ============= REVIEW PROPOSAL TESTS =============
    
    def test_review_approve_proposal(self):
        """PUT /api/leads/{lead_id}/proposal/review - approve proposal"""
        # Upload a proposal
        files = {
            'file': ('to_approve.pdf', b'%PDF-1.4 to approve', 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        # Approve (Director role can approve)
        response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "approved", "comment": "Great proposal!"}
        )
        
        assert response.status_code == 200, f"Approve failed: {response.text}"
        data = response.json()
        assert data['proposal']['status'] == 'approved'
        assert data['proposal']['reviewed_by'] == self.user['id']
        assert len(data['proposal']['review_comments']) > 0
        print("SUCCESS: Proposal approved")

    def test_review_reject_proposal(self):
        """PUT /api/leads/{lead_id}/proposal/review - reject proposal"""
        # Upload a proposal
        files = {
            'file': ('to_reject.pdf', b'%PDF-1.4 to reject', 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        # Reject
        response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "rejected", "comment": "Not suitable for this client"}
        )
        
        assert response.status_code == 200, f"Reject failed: {response.text}"
        data = response.json()
        assert data['proposal']['status'] == 'rejected'
        print("SUCCESS: Proposal rejected")

    def test_review_request_changes(self):
        """PUT /api/leads/{lead_id}/proposal/review - request changes"""
        # Upload a proposal
        files = {
            'file': ('needs_changes.pdf', b'%PDF-1.4 needs changes', 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        # Request changes
        response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "changes_requested", "comment": "Please update pricing section"}
        )
        
        assert response.status_code == 200, f"Request changes failed: {response.text}"
        data = response.json()
        assert data['proposal']['status'] == 'changes_requested'
        print("SUCCESS: Changes requested")

    def test_upload_revised_proposal(self):
        """POST /api/leads/{lead_id}/proposal - revised proposal gets 'revised' status"""
        # Upload initial proposal
        files = {
            'file': ('initial.pdf', b'%PDF-1.4 initial', 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        # Request changes
        self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "changes_requested", "comment": "Please revise"}
        )
        
        # Upload revised version
        files = {
            'file': ('revised.pdf', b'%PDF-1.4 revised', 'application/pdf')
        }
        response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data['proposal']['status'] == 'revised'
        assert data['proposal']['version'] >= 2
        print(f"SUCCESS: Revised proposal uploaded with status 'revised', version {data['proposal']['version']}")

    def test_review_invalid_action(self):
        """PUT /api/leads/{lead_id}/proposal/review - invalid action returns 400"""
        # Upload a proposal
        files = {
            'file': ('test.pdf', b'%PDF-1.4 test', 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        # Try invalid action
        response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "invalid_action", "comment": "Test"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("SUCCESS: Invalid review action rejected")


class TestProposalPermissions:
    """Test permission checks for proposal operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup sessions for both approver and non-approver users"""
        # Login as approver (Director)
        self.approver_session = requests.Session()
        login_response = self.approver_session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
        )
        assert login_response.status_code == 200
        self.approver_token = login_response.json().get('session_token')
        self.approver_session.headers.update({'Authorization': f'Bearer {self.approver_token}'})
        self.approver_user = login_response.json().get('user')
        
        # Get a lead
        leads_response = self.approver_session.get(f"{BASE_URL}/api/leads?page_size=1")
        if leads_response.status_code == 200 and leads_response.json().get('data'):
            self.test_lead_id = leads_response.json()['data'][0]['id']
        else:
            # Create test lead
            lead_data = {
                "company": "TEST_Permission_Company",
                "city": "Bengaluru",
                "state": "Karnataka",
                "region": "South India",
                "status": "new"
            }
            create_response = self.approver_session.post(f"{BASE_URL}/api/leads", json=lead_data)
            self.test_lead_id = create_response.json()['id']
        
        yield
        
        # Cleanup
        try:
            self.approver_session.delete(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
        except:
            pass
    
    def test_non_approver_cannot_review(self):
        """Non-approver roles cannot review proposals"""
        # Login as sales rep (non-approver)
        sales_session = requests.Session()
        login_response = sales_session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SALES_REP_EMAIL, "password": SALES_REP_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip("Sales rep user not available for testing")
        
        sales_token = login_response.json().get('session_token')
        sales_session.headers.update({'Authorization': f'Bearer {sales_token}'})
        
        # Upload a proposal as approver
        files = {
            'file': ('test.pdf', b'%PDF-1.4 test', 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.approver_token}'}
        
        requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        # Try to review as non-approver
        response = sales_session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "approved", "comment": "Approved"}
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("SUCCESS: Non-approver cannot review proposal")

    def test_non_uploader_cannot_delete(self):
        """Only uploader can delete pending proposal"""
        # Login as sales rep
        sales_session = requests.Session()
        login_response = sales_session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": SALES_REP_EMAIL, "password": SALES_REP_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip("Sales rep user not available for testing")
        
        sales_token = login_response.json().get('session_token')
        sales_session.headers.update({'Authorization': f'Bearer {sales_token}'})
        
        # Upload a proposal as approver
        files = {
            'file': ('test.pdf', b'%PDF-1.4 test', 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.approver_token}'}
        
        requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        # Try to delete as different user
        response = sales_session.delete(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("SUCCESS: Non-uploader cannot delete proposal")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
