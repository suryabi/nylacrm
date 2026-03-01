"""
Travel Request Module Tests
Tests for:
- Create travel request (draft and submit for approval)
- Get travel requests list
- 15-day advance policy check
- Approval workflow for CEO/Director
- Lead selection for customer visits
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestTravelRequestAPI:
    """Test travel request API endpoints"""
    
    @pytest.fixture(scope='class')
    def ceo_session(self):
        """Login as CEO and get session with cookies"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "surya123"
        })
        if response.status_code == 200:
            data = response.json()
            session_token = data.get('session_token')
            if session_token:
                # Set session cookie
                session.cookies.set('session_id', session_token)
            return session
        pytest.skip("CEO login failed - skipping CEO tests")
    
    @pytest.fixture(scope='class')
    def director_session(self):
        """Login as Director and get session with cookies"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@nylaairwater.earth",
            "password": "admin123"
        })
        if response.status_code == 200:
            data = response.json()
            session_token = data.get('session_token')
            if session_token:
                session.cookies.set('session_id', session_token)
            return session
        pytest.skip("Director login failed - skipping Director tests")
    
    def test_get_travel_purposes(self, ceo_session):
        """Test GET /api/travel-requests/purposes returns all 5 purposes"""
        response = ceo_session.get(f"{BASE_URL}/api/travel-requests/purposes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        purposes = response.json()
        assert isinstance(purposes, list)
        assert len(purposes) == 5, f"Expected 5 purposes, got {len(purposes)}"
        
        # Verify purpose values
        purpose_values = [p['value'] for p in purposes]
        expected_values = ['lead_customer_visits', 'distribution', 'manufacturing', 'team_visit', 'vendor_visits']
        for val in expected_values:
            assert val in purpose_values, f"Missing purpose: {val}"
        print(f"✓ Travel purposes API returns {len(purposes)} purposes")
    
    def test_create_travel_request_draft(self, ceo_session):
        """Test creating travel request as draft"""
        # Use dates more than 15 days in future
        departure = (datetime.now() + timedelta(days=20)).strftime('%Y-%m-%d')
        return_date = (datetime.now() + timedelta(days=22)).strftime('%Y-%m-%d')
        
        payload = {
            "from_location": "TEST_Hyderabad",
            "to_location": "TEST_Mumbai",
            "departure_date": departure,
            "return_date": return_date,
            "is_flexible": False,
            "purpose": "team_visit",
            "tentative_budget": 15000,
            "budget_breakdown": {
                "travel": 8000,
                "accommodation": 4000,
                "local_transport": 1500,
                "meals": 1000,
                "others": 500
            },
            "additional_notes": "Test travel request draft",
            "submit_for_approval": False
        }
        
        response = ceo_session.post(f"{BASE_URL}/api/travel-requests", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['status'] == 'draft', f"Expected draft status, got {data['status']}"
        assert data['from_location'] == 'TEST_Hyderabad'
        assert data['to_location'] == 'TEST_Mumbai'
        assert data['purpose'] == 'team_visit'
        assert data['tentative_budget'] == 15000
        assert 'id' in data
        print(f"✓ Created draft travel request: {data['id']}")
        return data['id']
    
    def test_create_travel_request_submit_for_approval(self, director_session):
        """Test creating travel request and submitting for approval"""
        departure = (datetime.now() + timedelta(days=25)).strftime('%Y-%m-%d')
        return_date = (datetime.now() + timedelta(days=28)).strftime('%Y-%m-%d')
        
        payload = {
            "from_location": "TEST_Chennai",
            "to_location": "TEST_Bengaluru",
            "departure_date": departure,
            "return_date": return_date,
            "is_flexible": True,
            "flexible_window": 3,
            "flexibility_notes": "Can adjust by up to 3 days",
            "purpose": "distribution",
            "tentative_budget": 20000,
            "budget_breakdown": {
                "travel": 10000,
                "accommodation": 5000,
                "local_transport": 2500,
                "meals": 1500,
                "others": 1000
            },
            "additional_notes": "Test travel request for approval",
            "submit_for_approval": True
        }
        
        response = director_session.post(f"{BASE_URL}/api/travel-requests", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['status'] == 'pending_approval', f"Expected pending_approval status, got {data['status']}"
        assert data['is_flexible'] == True
        assert data['flexible_window'] == 3
        print(f"✓ Created travel request for approval: {data['id']}")
        return data['id']
    
    def test_15_day_policy_short_notice_without_explanation(self, ceo_session):
        """Test 15-day policy: short notice without explanation should fail"""
        # Departure in 5 days (short notice)
        departure = (datetime.now() + timedelta(days=5)).strftime('%Y-%m-%d')
        return_date = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
        
        payload = {
            "from_location": "TEST_Delhi",
            "to_location": "TEST_Kolkata",
            "departure_date": departure,
            "return_date": return_date,
            "purpose": "vendor_visits",
            "tentative_budget": 12000,
            "submit_for_approval": True  # Submitting for approval triggers validation
            # No short_notice_explanation
        }
        
        response = ceo_session.post(f"{BASE_URL}/api/travel-requests", json=payload)
        # Should fail with 400 due to missing explanation
        assert response.status_code == 400, f"Expected 400 for short notice without explanation, got {response.status_code}"
        error_detail = response.json().get('detail', '')
        assert 'short notice' in error_detail.lower() or 'explanation' in error_detail.lower(), \
            f"Expected error about short notice explanation, got: {error_detail}"
        print("✓ Short notice travel without explanation correctly rejected")
    
    def test_15_day_policy_short_notice_with_explanation(self, ceo_session):
        """Test 15-day policy: short notice with valid explanation should succeed"""
        departure = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
        return_date = (datetime.now() + timedelta(days=9)).strftime('%Y-%m-%d')
        
        payload = {
            "from_location": "TEST_Delhi_ShortNotice",
            "to_location": "TEST_Kolkata",
            "departure_date": departure,
            "return_date": return_date,
            "purpose": "vendor_visits",
            "tentative_budget": 12000,
            "short_notice_explanation": "Urgent vendor meeting scheduled due to supply chain disruption requiring immediate attention.",
            "submit_for_approval": True
        }
        
        response = ceo_session.post(f"{BASE_URL}/api/travel-requests", json=payload)
        assert response.status_code == 200, f"Expected 200 for short notice with explanation, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['is_short_notice'] == True, "Expected is_short_notice to be True"
        assert data['status'] == 'pending_approval'
        print(f"✓ Short notice travel with explanation accepted: {data['id']}")
        return data['id']
    
    def test_create_travel_with_leads(self, director_session):
        """Test creating travel request with lead/customer visits purpose and selected leads"""
        departure = (datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d')
        return_date = (datetime.now() + timedelta(days=32)).strftime('%Y-%m-%d')
        
        payload = {
            "from_location": "TEST_Hyderabad",
            "to_location": "TEST_Pune",
            "departure_date": departure,
            "return_date": return_date,
            "purpose": "lead_customer_visits",
            "selected_leads": [
                {
                    "lead_id": "TEST_LEAD_001",
                    "lead_name": "Test Company Alpha",
                    "city": "Pune",
                    "estimated_deal_value": 500000
                },
                {
                    "lead_id": "TEST_LEAD_002",
                    "lead_name": "Test Company Beta",
                    "city": "Pune",
                    "estimated_deal_value": 300000
                }
            ],
            "tentative_budget": 18000,
            "budget_breakdown": {
                "travel": 9000,
                "accommodation": 5000,
                "local_transport": 2000,
                "meals": 1500,
                "others": 500
            },
            "submit_for_approval": True
        }
        
        response = director_session.post(f"{BASE_URL}/api/travel-requests", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data['purpose'] == 'lead_customer_visits'
        assert len(data['selected_leads']) == 2
        assert data['opportunity_size'] == 800000  # 500000 + 300000
        print(f"✓ Created travel request with leads, opportunity size: ₹{data['opportunity_size']}")
        return data['id']
    
    def test_get_travel_requests_list(self, ceo_session):
        """Test GET /api/travel-requests returns list"""
        response = ceo_session.get(f"{BASE_URL}/api/travel-requests")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET travel requests returns {len(data)} requests")
        
        # Verify structure of returned data
        if len(data) > 0:
            req = data[0]
            assert 'id' in req
            assert 'from_location' in req
            assert 'to_location' in req
            assert 'status' in req
            assert 'user_name' in req
            print(f"✓ Travel request structure validated")
    
    def test_approval_workflow(self, ceo_session, director_session):
        """Test full approval workflow: create -> approve"""
        # First create a request as Director
        departure = (datetime.now() + timedelta(days=40)).strftime('%Y-%m-%d')
        return_date = (datetime.now() + timedelta(days=42)).strftime('%Y-%m-%d')
        
        payload = {
            "from_location": "TEST_Mumbai_Approval",
            "to_location": "TEST_Ahmedabad",
            "departure_date": departure,
            "return_date": return_date,
            "purpose": "manufacturing",
            "tentative_budget": 25000,
            "submit_for_approval": True
        }
        
        response = director_session.post(f"{BASE_URL}/api/travel-requests", json=payload)
        assert response.status_code == 200
        request_id = response.json()['id']
        print(f"✓ Created travel request for approval workflow test: {request_id}")
        
        # Now approve as CEO
        approve_response = ceo_session.put(
            f"{BASE_URL}/api/travel-requests/{request_id}/approve",
            json={"status": "approved"}
        )
        assert approve_response.status_code == 200, f"Approval failed: {approve_response.text}"
        
        # Verify status changed
        get_response = ceo_session.get(f"{BASE_URL}/api/travel-requests/{request_id}")
        assert get_response.status_code == 200
        updated_req = get_response.json()
        assert updated_req['status'] == 'approved', f"Expected approved status, got {updated_req['status']}"
        assert updated_req['approved_by_name'] is not None
        print(f"✓ Travel request approved by {updated_req['approved_by_name']}")
    
    def test_rejection_workflow(self, ceo_session, director_session):
        """Test rejection workflow with reason"""
        departure = (datetime.now() + timedelta(days=45)).strftime('%Y-%m-%d')
        return_date = (datetime.now() + timedelta(days=47)).strftime('%Y-%m-%d')
        
        payload = {
            "from_location": "TEST_Reject_Location",
            "to_location": "TEST_RejectDest",
            "departure_date": departure,
            "return_date": return_date,
            "purpose": "team_visit",
            "tentative_budget": 50000,
            "submit_for_approval": True
        }
        
        response = director_session.post(f"{BASE_URL}/api/travel-requests", json=payload)
        assert response.status_code == 200
        request_id = response.json()['id']
        
        # Reject as CEO
        reject_response = ceo_session.put(
            f"{BASE_URL}/api/travel-requests/{request_id}/approve",
            json={
                "status": "rejected",
                "rejection_reason": "Budget exceeds allocated limits for this quarter"
            }
        )
        assert reject_response.status_code == 200, f"Rejection failed: {reject_response.text}"
        
        # Verify rejection
        get_response = ceo_session.get(f"{BASE_URL}/api/travel-requests/{request_id}")
        updated_req = get_response.json()
        assert updated_req['status'] == 'rejected'
        assert 'Budget exceeds' in updated_req['rejection_reason']
        print(f"✓ Travel request rejected with reason")
    
    def test_get_pending_approvals_count(self, ceo_session):
        """Test pending approvals count for CEO/Director"""
        response = ceo_session.get(f"{BASE_URL}/api/travel-requests/pending-approvals/count")
        assert response.status_code == 200
        data = response.json()
        assert 'count' in data
        assert isinstance(data['count'], int)
        print(f"✓ Pending approvals count: {data['count']}")


class TestTravelRequestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture(scope='class')
    def ceo_session(self):
        session = requests.Session()
        response = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "surya123"
        })
        if response.status_code == 200:
            data = response.json()
            session_token = data.get('session_token')
            if session_token:
                session.cookies.set('session_id', session_token)
            return session
        return None
    
    def test_cleanup_test_requests(self, ceo_session):
        """Note: Test data with TEST_ prefix should be cleaned up manually or via admin"""
        if not ceo_session:
            pytest.skip("No session for cleanup")
        
        response = ceo_session.get(f"{BASE_URL}/api/travel-requests")
        
        if response.status_code == 200:
            requests_list = response.json()
            test_requests = [r for r in requests_list if 'TEST_' in r.get('from_location', '')]
            print(f"Note: {len(test_requests)} test travel requests exist with TEST_ prefix")
