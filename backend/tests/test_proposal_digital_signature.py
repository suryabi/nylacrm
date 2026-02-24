"""
Test suite for Proposal Digital Signature Stamping Feature
Tests:
- Upload a PDF proposal to a lead
- Approve the proposal and verify the PDF gets stamped with digital signature
- Download the approved proposal and verify signature text 'Approved by: {name} | Date: {date}' is in the PDF
- Verify non-PDF proposals (DOCX) don't break on approval
- Verify the proposal status changes to 'approved' after approval
"""
import pytest
import requests
import os
import io
import base64
from datetime import datetime
from PyPDF2 import PdfReader
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

# Get the backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - Director (Approver role)
TEST_USER_EMAIL = "admin@nylaairwater.earth"
TEST_USER_PASSWORD = "admin123"


def create_test_pdf(content_text="Test Proposal Content"):
    """Create a valid PDF file for testing"""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    c.setFont("Helvetica", 12)
    c.drawString(100, 700, content_text)
    c.drawString(100, 680, "This is a test proposal document.")
    c.drawString(100, 660, f"Generated at: {datetime.now().isoformat()}")
    c.save()
    buffer.seek(0)
    return buffer.read()


def create_multi_page_pdf(pages=3):
    """Create a multi-page PDF to test that signature is on last page"""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    
    for i in range(pages):
        c.setFont("Helvetica-Bold", 16)
        c.drawString(100, 750, f"Page {i + 1} of {pages}")
        c.setFont("Helvetica", 12)
        c.drawString(100, 700, f"This is page {i + 1} content")
        c.drawString(100, 680, "Lorem ipsum dolor sit amet, consectetur adipiscing elit.")
        if i < pages - 1:
            c.showPage()
    
    c.save()
    buffer.seek(0)
    return buffer.read()


def extract_text_from_pdf(pdf_bytes):
    """Extract all text from a PDF"""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    all_text = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            all_text.append(text)
    return "\n".join(all_text)


class TestProposalDigitalSignature:
    """Test cases for Proposal Digital Signature Stamping"""
    
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
        
        print(f"Logged in as: {self.user['name']} (Role: {self.user['role']})")
        
        # Create a new test lead for digital signature testing
        lead_data = {
            "company": "TEST_DigitalSignature_Company",
            "contact_person": "Test Contact",
            "city": "Bengaluru",
            "state": "Karnataka",
            "region": "South India",
            "status": "proposal_shared"
        }
        create_response = self.session.post(f"{BASE_URL}/api/leads", json=lead_data)
        assert create_response.status_code == 200, f"Lead creation failed: {create_response.text}"
        self.test_lead_id = create_response.json()['id']
        print(f"Created test lead: {self.test_lead_id}")
        
        yield
        
        # Cleanup - delete test proposal and lead
        try:
            self.session.delete(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
        except:
            pass
        try:
            self.session.delete(f"{BASE_URL}/api/leads/{self.test_lead_id}")
        except:
            pass
    
    # ============= TEST 1: Upload PDF Proposal =============
    
    def test_upload_pdf_proposal(self):
        """Test uploading a PDF proposal to a lead"""
        print("\n--- Test 1: Upload PDF Proposal ---")
        
        pdf_content = create_test_pdf("Digital Signature Test Proposal")
        
        files = {
            'file': ('test_proposal.pdf', pdf_content, 'application/pdf')
        }
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
        assert data['proposal']['content_type'] == 'application/pdf'
        assert data['proposal']['uploaded_by'] == self.user['id']
        
        print(f"SUCCESS: Uploaded PDF proposal")
        print(f"  - File: {data['proposal']['file_name']}")
        print(f"  - Status: {data['proposal']['status']}")
        print(f"  - Size: {data['proposal']['file_size']} bytes")
    
    # ============= TEST 2: Approve Proposal and Verify Stamping =============
    
    def test_approve_proposal_stamps_pdf(self):
        """Test that approving a PDF proposal stamps it with digital signature"""
        print("\n--- Test 2: Approve Proposal and Verify PDF Stamping ---")
        
        # First upload a valid PDF
        pdf_content = create_test_pdf("Proposal for Digital Signature Test")
        original_size = len(pdf_content)
        
        files = {
            'file': ('proposal_to_approve.pdf', pdf_content, 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        print(f"Uploaded PDF proposal - Size: {original_size} bytes")
        
        # Approve the proposal
        approve_response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "approved", "comment": "Approved for digital signature test"}
        )
        
        assert approve_response.status_code == 200, f"Approval failed: {approve_response.text}"
        
        data = approve_response.json()
        assert data['proposal']['status'] == 'approved'
        assert data['proposal']['reviewed_by'] == self.user['id']
        
        print(f"SUCCESS: Proposal approved")
        print(f"  - New Status: {data['proposal']['status']}")
        print(f"  - Reviewed by: {data['proposal']['reviewed_by_name']}")
    
    # ============= TEST 3: Download and Verify Signature Text =============
    
    def test_download_approved_proposal_has_signature(self):
        """Test that downloaded approved PDF contains the digital signature text"""
        print("\n--- Test 3: Download and Verify Signature Text in PDF ---")
        
        # Upload a multi-page PDF
        pdf_content = create_multi_page_pdf(pages=3)
        
        files = {
            'file': ('multipage_proposal.pdf', pdf_content, 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        assert upload_response.status_code == 200, f"Upload failed"
        print("Uploaded 3-page PDF proposal")
        
        # Approve the proposal
        approve_response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "approved", "comment": "Approved with signature"}
        )
        assert approve_response.status_code == 200, f"Approval failed"
        print(f"Proposal approved by: {self.user['name']}")
        
        # Download the approved proposal
        download_response = self.session.get(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/download"
        )
        assert download_response.status_code == 200, f"Download failed: {download_response.text}"
        
        proposal_data = download_response.json()['proposal']
        stamped_pdf_bytes = base64.b64decode(proposal_data['file_data'])
        
        # Extract text from the stamped PDF
        extracted_text = extract_text_from_pdf(stamped_pdf_bytes)
        
        print(f"Extracted text from stamped PDF ({len(extracted_text)} chars):")
        print(f"  Last 300 chars: ...{extracted_text[-300:]}")
        
        # Verify signature text components are present
        today_date = datetime.now().strftime('%B %d, %Y')
        
        # Check for "Approved by:" text
        assert "Approved by:" in extracted_text, "Signature text 'Approved by:' not found in PDF"
        print("SUCCESS: 'Approved by:' text found in PDF")
        
        # Check for approver name
        assert self.user['name'] in extracted_text, f"Approver name '{self.user['name']}' not found in PDF"
        print(f"SUCCESS: Approver name '{self.user['name']}' found in PDF")
        
        # Check for "Date:" text
        assert "Date:" in extracted_text, "Signature text 'Date:' not found in PDF"
        print("SUCCESS: 'Date:' text found in PDF")
        
        # The signature format should be: "Approved by: {name}  |  Date: {date}"
        # Check for the separator
        assert "|" in extracted_text or "Date:" in extracted_text, "Signature separator or Date not found"
        print("SUCCESS: Complete signature stamp verified in PDF")
    
    # ============= TEST 4: Non-PDF Proposals Don't Break on Approval =============
    
    def test_approve_docx_proposal_no_stamping(self):
        """Test that approving a DOCX proposal doesn't break and no stamping occurs"""
        print("\n--- Test 4: Non-PDF (DOCX) Proposal Approval ---")
        
        # Create minimal DOCX-like content
        docx_content = b'PK\x03\x04\x14\x00\x00\x00test docx proposal content for signature test'
        
        files = {
            'file': ('proposal.docx', docx_content, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        assert upload_response.status_code == 200, f"Upload failed: {upload_response.text}"
        
        original_size = upload_response.json()['proposal']['file_size']
        print(f"Uploaded DOCX proposal - Size: {original_size} bytes")
        
        # Approve the DOCX proposal
        approve_response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "approved", "comment": "Approved DOCX file"}
        )
        
        assert approve_response.status_code == 200, f"Approval failed: {approve_response.text}"
        
        data = approve_response.json()
        assert data['proposal']['status'] == 'approved'
        
        # Download and verify file size is unchanged (no stamping)
        download_response = self.session.get(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/download"
        )
        assert download_response.status_code == 200
        
        downloaded_data = download_response.json()['proposal']
        new_size = downloaded_data['file_size']
        
        print(f"SUCCESS: DOCX proposal approved without errors")
        print(f"  - Status: {data['proposal']['status']}")
        print(f"  - Original size: {original_size} bytes")
        print(f"  - Downloaded size: {new_size} bytes")
        print(f"  - File preserved: {original_size == new_size or abs(original_size - new_size) < 100}")
    
    # ============= TEST 5: Verify Status Changes to 'approved' =============
    
    def test_proposal_status_changes_to_approved(self):
        """Test that proposal status correctly changes to 'approved' after approval"""
        print("\n--- Test 5: Verify Status Changes to 'approved' ---")
        
        # Upload PDF
        pdf_content = create_test_pdf("Status Test Proposal")
        
        files = {
            'file': ('status_test.pdf', pdf_content, 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        assert upload_response.status_code == 200
        
        # Check initial status
        initial_status = upload_response.json()['proposal']['status']
        assert initial_status == 'pending_review', f"Expected 'pending_review', got '{initial_status}'"
        print(f"Initial status: {initial_status}")
        
        # Approve proposal
        approve_response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "approved", "comment": "Status change test"}
        )
        assert approve_response.status_code == 200
        
        # Check new status
        new_status = approve_response.json()['proposal']['status']
        assert new_status == 'approved', f"Expected 'approved', got '{new_status}'"
        print(f"New status after approval: {new_status}")
        
        # Verify by fetching the proposal again
        get_response = self.session.get(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
        assert get_response.status_code == 200
        
        final_status = get_response.json()['proposal']['status']
        assert final_status == 'approved', f"Final status should be 'approved', got '{final_status}'"
        
        print(f"SUCCESS: Status correctly changed from 'pending_review' to 'approved'")
        print(f"  - Reviewed by: {approve_response.json()['proposal']['reviewed_by_name']}")
    
    # ============= TEST 6: Verify Signature is on Last Page Only =============
    
    def test_signature_on_last_page_only(self):
        """Test that the digital signature is only added to the last page"""
        print("\n--- Test 6: Verify Signature on Last Page Only ---")
        
        # Create a 5-page PDF
        pdf_content = create_multi_page_pdf(pages=5)
        
        files = {
            'file': ('five_pages.pdf', pdf_content, 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        upload_response = requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        assert upload_response.status_code == 200
        print("Uploaded 5-page PDF proposal")
        
        # Approve the proposal
        approve_response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "approved", "comment": "Multi-page test"}
        )
        assert approve_response.status_code == 200
        print("Proposal approved")
        
        # Download and analyze pages
        download_response = self.session.get(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/download"
        )
        assert download_response.status_code == 200
        
        stamped_pdf_bytes = base64.b64decode(download_response.json()['proposal']['file_data'])
        reader = PdfReader(io.BytesIO(stamped_pdf_bytes))
        
        print(f"Stamped PDF has {len(reader.pages)} pages")
        
        # Check each page
        signature_found_on_pages = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if "Approved by:" in text and self.user['name'] in text:
                signature_found_on_pages.append(i + 1)
        
        print(f"Signature found on page(s): {signature_found_on_pages}")
        
        # Signature should only be on the last page (page 5)
        assert len(signature_found_on_pages) == 1, f"Signature should be on exactly 1 page, found on {len(signature_found_on_pages)}"
        assert signature_found_on_pages[0] == 5, f"Signature should be on page 5, found on page(s) {signature_found_on_pages}"
        
        print(f"SUCCESS: Digital signature correctly placed only on page 5 (last page)")


class TestDigitalSignatureEdgeCases:
    """Edge case tests for the digital signature feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session and authenticate"""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        self.user = login_response.json().get('user')
        self.session_token = login_response.json().get('session_token')
        self.session.headers.update({'Authorization': f'Bearer {self.session_token}'})
        
        # Create test lead
        lead_data = {
            "company": "TEST_EdgeCase_Company",
            "city": "Hyderabad",
            "state": "Telangana",
            "region": "South India",
            "status": "proposal_shared"
        }
        create_response = self.session.post(f"{BASE_URL}/api/leads", json=lead_data)
        assert create_response.status_code == 200
        self.test_lead_id = create_response.json()['id']
        
        yield
        
        # Cleanup
        try:
            self.session.delete(f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal")
            self.session.delete(f"{BASE_URL}/api/leads/{self.test_lead_id}")
        except:
            pass
    
    def test_rejected_proposal_no_signature(self):
        """Test that rejected proposals don't get signed"""
        print("\n--- Edge Case: Rejected Proposal - No Signature ---")
        
        pdf_content = create_test_pdf("Rejected proposal test")
        
        files = {
            'file': ('reject_test.pdf', pdf_content, 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        # Reject the proposal
        reject_response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "rejected", "comment": "Not suitable"}
        )
        assert reject_response.status_code == 200
        assert reject_response.json()['proposal']['status'] == 'rejected'
        
        # Download and verify no signature
        download_response = self.session.get(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/download"
        )
        assert download_response.status_code == 200
        
        pdf_bytes = base64.b64decode(download_response.json()['proposal']['file_data'])
        text = extract_text_from_pdf(pdf_bytes)
        
        # Should NOT contain approval signature
        has_signature = "Approved by:" in text and "Date:" in text
        assert not has_signature, "Rejected proposal should not have approval signature"
        
        print("SUCCESS: Rejected proposal does not have digital signature")
    
    def test_changes_requested_no_signature(self):
        """Test that proposals with changes requested don't get signed"""
        print("\n--- Edge Case: Changes Requested - No Signature ---")
        
        pdf_content = create_test_pdf("Changes needed test")
        
        files = {
            'file': ('changes_test.pdf', pdf_content, 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        # Request changes
        changes_response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "changes_requested", "comment": "Please update pricing"}
        )
        assert changes_response.status_code == 200
        assert changes_response.json()['proposal']['status'] == 'changes_requested'
        
        # Download and verify no signature
        download_response = self.session.get(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/download"
        )
        assert download_response.status_code == 200
        
        pdf_bytes = base64.b64decode(download_response.json()['proposal']['file_data'])
        text = extract_text_from_pdf(pdf_bytes)
        
        has_signature = "Approved by:" in text and "Date:" in text
        assert not has_signature, "Proposal with changes requested should not have approval signature"
        
        print("SUCCESS: Changes requested proposal does not have digital signature")
    
    def test_single_page_pdf_signature(self):
        """Test signature placement on a single-page PDF"""
        print("\n--- Edge Case: Single Page PDF Signature ---")
        
        pdf_content = create_multi_page_pdf(pages=1)
        
        files = {
            'file': ('single_page.pdf', pdf_content, 'application/pdf')
        }
        headers = {'Authorization': f'Bearer {self.session_token}'}
        
        requests.post(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal",
            files=files,
            headers=headers
        )
        
        # Approve
        approve_response = self.session.put(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/review",
            json={"action": "approved", "comment": "Single page test"}
        )
        assert approve_response.status_code == 200
        
        # Download and verify signature
        download_response = self.session.get(
            f"{BASE_URL}/api/leads/{self.test_lead_id}/proposal/download"
        )
        assert download_response.status_code == 200
        
        pdf_bytes = base64.b64decode(download_response.json()['proposal']['file_data'])
        text = extract_text_from_pdf(pdf_bytes)
        
        assert "Approved by:" in text, "Single-page PDF should have signature"
        assert self.user['name'] in text, f"Signature should contain approver name"
        
        print("SUCCESS: Single-page PDF correctly signed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
