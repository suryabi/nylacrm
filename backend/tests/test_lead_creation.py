"""
Test Lead Creation Bug Fix
Bug: Lead creation was failing because user's territory 'All India' was being used as region 
     but backend requires valid regions (North India, South India, West India, East India)
Fix: Added validation to ensure region is a valid value before submission
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Valid regions that the backend accepts
VALID_REGIONS = ['North India', 'South India', 'West India', 'East India']

class TestLeadCreation:
    """Test lead creation with region validation fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@nylaairwater.earth",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.session_token = data['session_token']
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.session_token}"
        }
        self.created_lead_ids = []
        yield
        # Cleanup created leads
        for lead_id in self.created_lead_ids:
            try:
                requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=self.headers)
            except:
                pass
    
    def test_create_lead_with_valid_region(self):
        """Test creating lead with valid region (South India) - should succeed"""
        unique_suffix = str(uuid.uuid4())[:6]
        lead_data = {
            "company": f"TEST_ValidRegion_{unique_suffix}",
            "contact_person": "Test Contact",
            "email": f"test_{unique_suffix}@example.com",
            "phone": "+919876543210",
            "category": "Restaurant",
            "tier": "Tier 1",
            "city": "Bengaluru",
            "state": "Karnataka",
            "country": "India",
            "region": "South India",  # Valid region
            "status": "new",
            "source": "Website",
            "priority": "medium"
        }
        
        response = requests.post(f"{BASE_URL}/api/leads", json=lead_data, headers=self.headers)
        
        assert response.status_code == 200, f"Lead creation failed: {response.text}"
        
        data = response.json()
        assert data['company'] == lead_data['company']
        assert data['region'] == "South India"
        assert data['city'] == "Bengaluru"
        assert data['state'] == "Karnataka"
        assert 'id' in data
        assert 'lead_id' in data  # Unique formatted ID
        
        self.created_lead_ids.append(data['id'])
        print(f"Successfully created lead with ID: {data['id']}, lead_id: {data['lead_id']}")
    
    def test_create_lead_without_region_fails(self):
        """Test that creating lead without region fails with validation error"""
        unique_suffix = str(uuid.uuid4())[:6]
        lead_data = {
            "company": f"TEST_NoRegion_{unique_suffix}",
            "city": "Mumbai",
            "state": "Maharashtra",
            "country": "India"
            # region is missing - should fail
        }
        
        response = requests.post(f"{BASE_URL}/api/leads", json=lead_data, headers=self.headers)
        
        # Backend should reject lead without region
        assert response.status_code == 422, f"Expected 422 for missing region, got {response.status_code}"
        print(f"Correctly rejected lead without region: {response.json()}")
    
    def test_create_lead_with_empty_region_fails(self):
        """Test that creating lead with empty region fails"""
        unique_suffix = str(uuid.uuid4())[:6]
        lead_data = {
            "company": f"TEST_EmptyRegion_{unique_suffix}",
            "city": "Delhi",
            "state": "Delhi",
            "country": "India",
            "region": ""  # Empty region
        }
        
        response = requests.post(f"{BASE_URL}/api/leads", json=lead_data, headers=self.headers)
        
        # Empty string should be rejected as region is required
        # Depending on implementation, could be 422 or 400
        assert response.status_code in [400, 422], f"Expected validation error for empty region, got {response.status_code}"
        print(f"Correctly rejected lead with empty region: {response.json()}")
    
    def test_create_lead_with_all_valid_regions(self):
        """Test creating leads with each valid region"""
        region_city_state = {
            "North India": ("New Delhi", "Delhi"),
            "South India": ("Chennai", "Tamil Nadu"),
            "West India": ("Mumbai", "Maharashtra"),
            "East India": ("Kolkata", "West Bengal")
        }
        
        for region, (city, state) in region_city_state.items():
            unique_suffix = str(uuid.uuid4())[:6]
            lead_data = {
                "company": f"TEST_{region.replace(' ', '')}_{unique_suffix}",
                "city": city,
                "state": state,
                "country": "India",
                "region": region,
                "status": "new"
            }
            
            response = requests.post(f"{BASE_URL}/api/leads", json=lead_data, headers=self.headers)
            
            assert response.status_code == 200, f"Failed to create lead for {region}: {response.text}"
            
            data = response.json()
            assert data['region'] == region
            self.created_lead_ids.append(data['id'])
            print(f"Created lead for {region} successfully")
    
    def test_create_lead_and_verify_in_list(self):
        """Test that newly created lead appears in the leads list"""
        unique_suffix = str(uuid.uuid4())[:6]
        company_name = f"TEST_ListVerify_{unique_suffix}"
        
        lead_data = {
            "company": company_name,
            "contact_person": "List Test Contact",
            "city": "Hyderabad",
            "state": "Telangana",
            "country": "India",
            "region": "South India",
            "status": "new"
        }
        
        # Create lead
        create_response = requests.post(f"{BASE_URL}/api/leads", json=lead_data, headers=self.headers)
        assert create_response.status_code == 200, f"Lead creation failed: {create_response.text}"
        
        created_lead = create_response.json()
        lead_id = created_lead['id']
        self.created_lead_ids.append(lead_id)
        
        # Verify lead appears in list
        list_response = requests.get(f"{BASE_URL}/api/leads", headers=self.headers)
        assert list_response.status_code == 200
        
        leads = list_response.json()
        lead_ids = [lead['id'] for lead in leads]
        assert lead_id in lead_ids, f"Created lead {lead_id} not found in leads list"
        print(f"Lead {lead_id} successfully appears in leads list")
    
    def test_create_lead_with_all_required_fields(self):
        """Test creating lead with company, region, state, city (all required)"""
        unique_suffix = str(uuid.uuid4())[:6]
        
        lead_data = {
            "company": f"TEST_AllRequired_{unique_suffix}",
            "region": "West India",
            "state": "Gujarat",
            "city": "Ahmedabad",
            "country": "India"
        }
        
        response = requests.post(f"{BASE_URL}/api/leads", json=lead_data, headers=self.headers)
        
        assert response.status_code == 200, f"Lead creation failed: {response.text}"
        
        data = response.json()
        assert data['company'] == lead_data['company']
        assert data['region'] == lead_data['region']
        assert data['state'] == lead_data['state']
        assert data['city'] == lead_data['city']
        
        self.created_lead_ids.append(data['id'])
        print(f"Lead created with all required fields: {data['lead_id']}")


class TestLeadCreationRequiredFields:
    """Test that required field validation works properly"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get session token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@nylaairwater.earth",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        self.session_token = data['session_token']
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.session_token}"
        }
    
    def test_missing_company_fails(self):
        """Test that missing company field causes validation error"""
        lead_data = {
            "city": "Mumbai",
            "state": "Maharashtra",
            "region": "West India",
            "country": "India"
            # company is missing
        }
        
        response = requests.post(f"{BASE_URL}/api/leads", json=lead_data, headers=self.headers)
        
        assert response.status_code == 422, f"Expected 422 for missing company, got {response.status_code}"
        print("Correctly rejected lead without company name")
    
    def test_missing_city_fails(self):
        """Test that missing city field causes validation error"""
        unique_suffix = str(uuid.uuid4())[:6]
        lead_data = {
            "company": f"TEST_NoCity_{unique_suffix}",
            "state": "Maharashtra",
            "region": "West India",
            "country": "India"
            # city is missing
        }
        
        response = requests.post(f"{BASE_URL}/api/leads", json=lead_data, headers=self.headers)
        
        assert response.status_code == 422, f"Expected 422 for missing city, got {response.status_code}"
        print("Correctly rejected lead without city")
    
    def test_missing_state_fails(self):
        """Test that missing state field causes validation error"""
        unique_suffix = str(uuid.uuid4())[:6]
        lead_data = {
            "company": f"TEST_NoState_{unique_suffix}",
            "city": "Mumbai",
            "region": "West India",
            "country": "India"
            # state is missing
        }
        
        response = requests.post(f"{BASE_URL}/api/leads", json=lead_data, headers=self.headers)
        
        assert response.status_code == 422, f"Expected 422 for missing state, got {response.status_code}"
        print("Correctly rejected lead without state")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
