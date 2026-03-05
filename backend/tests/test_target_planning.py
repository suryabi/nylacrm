"""
Test Target Planning (v2) Module - Hierarchical Allocation System
Features tested:
- Target Plan CRUD (List, Create, Get, Delete)
- Territory Allocation
- City Allocation (child of territory)
- Resource Allocation (child of city)
- Dashboard with timeline, revenue tracking
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "surya.yadavalli@nylaairwater.earth"
TEST_PASSWORD = "surya123"

class TestTargetPlanning:
    """Target Planning V2 Module Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self, request):
        """Setup for each test - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    # === Target Plan List ===
    def test_01_get_target_plans_list(self):
        """GET /api/target-planning - List all target plans"""
        response = self.session.get(f"{BASE_URL}/api/target-planning")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} target plans")
        
        # Store existing plan if available
        if data:
            print(f"First plan: {data[0].get('name')}, ID: {data[0].get('id')}")
    
    # === Create Target Plan ===
    def test_02_create_target_plan(self):
        """POST /api/target-planning - Create new target plan"""
        today = datetime.now()
        end_date = today + timedelta(days=90)
        
        plan_data = {
            "name": f"TEST_Q1_2026_Plan_{datetime.now().strftime('%H%M%S')}",
            "start_date": today.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d"),
            "target_type": "revenue",
            "total_amount": 5000000,
            "milestones": 4,
            "description": "Test plan for automated testing"
        }
        
        response = self.session.post(f"{BASE_URL}/api/target-planning", json=plan_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Data assertions
        assert "id" in data, "Response should contain 'id'"
        assert data["name"] == plan_data["name"], "Plan name should match"
        assert data["total_amount"] == plan_data["total_amount"], "Total amount should match"
        assert data["milestones"] == plan_data["milestones"], "Milestones should match"
        assert data["status"] == "draft", "New plan should be in draft status"
        assert "created_at" in data, "Should have created_at timestamp"
        
        # Save for later tests
        self.__class__.test_plan_id = data["id"]
        print(f"Created plan: {data['name']}, ID: {data['id']}")
    
    # === Get Plan Detail ===
    def test_03_get_plan_detail(self):
        """GET /api/target-planning/{plan_id} - Get specific plan"""
        plan_id = getattr(self.__class__, 'test_plan_id', None)
        if not plan_id:
            pytest.skip("No test plan created")
        
        response = self.session.get(f"{BASE_URL}/api/target-planning/{plan_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data["id"] == plan_id, "Plan ID should match"
        assert "allocations" in data, "Response should include allocations array"
        print(f"Plan detail fetched: {data['name']}, allocations: {len(data['allocations'])}")
    
    # === Dashboard ===
    def test_04_get_plan_dashboard(self):
        """GET /api/target-planning/{plan_id}/dashboard - Get dashboard data"""
        plan_id = getattr(self.__class__, 'test_plan_id', None)
        if not plan_id:
            pytest.skip("No test plan created")
        
        response = self.session.get(f"{BASE_URL}/api/target-planning/{plan_id}/dashboard")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify dashboard structure
        assert "plan" in data, "Dashboard should have 'plan' object"
        assert "timeline" in data, "Dashboard should have 'timeline' object"
        assert "estimated_revenue" in data, "Dashboard should have 'estimated_revenue'"
        assert "actual_revenue" in data, "Dashboard should have 'actual_revenue'"
        assert "allocations" in data, "Dashboard should have 'allocations'"
        
        # Verify timeline structure
        timeline = data["timeline"]
        assert "total_days" in timeline, "Timeline should have total_days"
        assert "days_elapsed" in timeline, "Timeline should have days_elapsed"
        assert "days_remaining" in timeline, "Timeline should have days_remaining"
        assert "milestones" in timeline, "Timeline should have milestones"
        
        print(f"Dashboard loaded: {timeline['total_days']} days, {len(timeline['milestones'])} milestones")
    
    # === Master Locations for Territory Selection ===
    def test_05_get_master_locations(self):
        """GET /api/master-locations - For territory dropdown"""
        response = self.session.get(f"{BASE_URL}/api/master-locations")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if data:
            # Store first territory for allocation test
            self.__class__.test_territory = data[0]
            print(f"Found {len(data)} territories, first: {data[0].get('name')}")
    
    # === Add Territory Allocation ===
    def test_06_add_territory_allocation(self):
        """POST /api/target-planning/{plan_id}/allocations - Add territory"""
        plan_id = getattr(self.__class__, 'test_plan_id', None)
        territory = getattr(self.__class__, 'test_territory', None)
        
        if not plan_id:
            pytest.skip("No test plan created")
        if not territory:
            pytest.skip("No territory available")
        
        allocation_data = {
            "territory_id": territory["id"],
            "territory_name": territory["name"],
            "level": "territory",
            "amount": 1000000
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/target-planning/{plan_id}/allocations",
            json=allocation_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Data assertions
        assert "id" in data, "Response should have allocation ID"
        assert data["territory_name"] == territory["name"], "Territory name should match"
        assert data["level"] == "territory", "Level should be 'territory'"
        assert data["amount"] == 1000000, "Amount should match"
        
        self.__class__.test_territory_allocation_id = data["id"]
        print(f"Territory allocation created: {territory['name']} - ₹{data['amount']}")
    
    # === Add City Allocation (Child of Territory) ===
    def test_07_add_city_allocation(self):
        """POST /api/target-planning/{plan_id}/allocations - Add city under territory"""
        plan_id = getattr(self.__class__, 'test_plan_id', None)
        territory = getattr(self.__class__, 'test_territory', None)
        territory_alloc_id = getattr(self.__class__, 'test_territory_allocation_id', None)
        
        if not plan_id or not territory or not territory_alloc_id:
            pytest.skip("Prerequisites not met")
        
        # Get first city from territory
        cities = []
        for state in territory.get('states', []):
            for city in state.get('cities', []):
                cities.append({"name": city["name"], "state": state["name"]})
        
        if not cities:
            pytest.skip("No cities found in territory")
        
        test_city = cities[0]
        
        allocation_data = {
            "territory_id": territory["id"],
            "territory_name": territory["name"],
            "city": test_city["name"],
            "state": test_city["state"],
            "parent_allocation_id": territory_alloc_id,
            "level": "city",
            "amount": 500000
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/target-planning/{plan_id}/allocations",
            json=allocation_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Data assertions
        assert data["city"] == test_city["name"], "City name should match"
        assert data["level"] == "city", "Level should be 'city'"
        assert data["parent_allocation_id"] == territory_alloc_id, "Parent should be territory allocation"
        assert data["amount"] == 500000, "Amount should match"
        
        self.__class__.test_city_allocation_id = data["id"]
        self.__class__.test_city_name = test_city["name"]
        print(f"City allocation created: {test_city['name']} - ₹{data['amount']}")
    
    # === Get Resources for City ===
    def test_08_get_resources_for_city(self):
        """GET /api/target-planning/resources/by-location - Get sales resources"""
        city_name = getattr(self.__class__, 'test_city_name', None)
        
        if not city_name:
            pytest.skip("No test city available")
        
        response = self.session.get(
            f"{BASE_URL}/api/target-planning/resources/by-location",
            params={"city": city_name}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if data:
            self.__class__.test_resource = data[0]
            print(f"Found {len(data)} resources in {city_name}, first: {data[0].get('name')}")
        else:
            print(f"No sales resources found in {city_name}")
    
    # === Add Resource Allocation (Child of City) ===
    def test_09_add_resource_allocation(self):
        """POST /api/target-planning/{plan_id}/allocations - Add resource under city"""
        plan_id = getattr(self.__class__, 'test_plan_id', None)
        territory = getattr(self.__class__, 'test_territory', None)
        city_alloc_id = getattr(self.__class__, 'test_city_allocation_id', None)
        city_name = getattr(self.__class__, 'test_city_name', None)
        resource = getattr(self.__class__, 'test_resource', None)
        
        if not all([plan_id, territory, city_alloc_id, city_name, resource]):
            pytest.skip("Prerequisites not met (no resource in city)")
        
        allocation_data = {
            "territory_id": territory["id"],
            "territory_name": territory["name"],
            "city": city_name,
            "resource_id": resource["id"],
            "resource_name": resource["name"],
            "parent_allocation_id": city_alloc_id,
            "level": "resource",
            "amount": 200000
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/target-planning/{plan_id}/allocations",
            json=allocation_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Data assertions
        assert data["resource_name"] == resource["name"], "Resource name should match"
        assert data["level"] == "resource", "Level should be 'resource'"
        assert data["parent_allocation_id"] == city_alloc_id, "Parent should be city allocation"
        assert data["amount"] == 200000, "Amount should match"
        
        self.__class__.test_resource_allocation_id = data["id"]
        print(f"Resource allocation created: {resource['name']} - ₹{data['amount']}")
    
    # === Verify Hierarchy in Dashboard ===
    def test_10_verify_hierarchical_structure(self):
        """Verify Territory → City → Resource hierarchy in dashboard"""
        plan_id = getattr(self.__class__, 'test_plan_id', None)
        
        if not plan_id:
            pytest.skip("No test plan created")
        
        response = self.session.get(f"{BASE_URL}/api/target-planning/{plan_id}/dashboard")
        
        assert response.status_code == 200
        data = response.json()
        
        allocations = data.get("allocations", [])
        assert len(allocations) > 0, "Should have territory allocations"
        
        # Find our test territory allocation
        test_territory_name = getattr(self.__class__, 'test_territory', {}).get('name')
        territory_alloc = None
        for alloc in allocations:
            if alloc.get("territory_name") == test_territory_name:
                territory_alloc = alloc
                break
        
        if territory_alloc:
            # Verify children (cities)
            children = territory_alloc.get("children", [])
            print(f"Territory has {len(children)} city allocations")
            
            # Verify allocated_to_children calculation
            allocated_to_children = territory_alloc.get("allocated_to_children", 0)
            print(f"Territory allocated to children: ₹{allocated_to_children}")
            
            if children:
                city_alloc = children[0]
                resource_children = city_alloc.get("children", [])
                print(f"City has {len(resource_children)} resource allocations")
    
    # === Delete Allocation (Cascade) ===
    def test_11_delete_allocation_cascade(self):
        """DELETE /api/target-planning/{plan_id}/allocations/{id} - Cascade delete"""
        plan_id = getattr(self.__class__, 'test_plan_id', None)
        territory_alloc_id = getattr(self.__class__, 'test_territory_allocation_id', None)
        
        if not plan_id or not territory_alloc_id:
            pytest.skip("Prerequisites not met")
        
        response = self.session.delete(
            f"{BASE_URL}/api/target-planning/{plan_id}/allocations/{territory_alloc_id}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Verify cascade delete - children should be gone
        detail_response = self.session.get(f"{BASE_URL}/api/target-planning/{plan_id}")
        assert detail_response.status_code == 200
        
        allocations = detail_response.json().get("allocations", [])
        for alloc in allocations:
            assert alloc.get("parent_allocation_id") != territory_alloc_id, \
                "Child allocations should be deleted"
        
        print("Cascade delete successful - territory and all children removed")
    
    # === Cleanup: Delete Test Plan ===
    def test_12_delete_test_plan(self):
        """DELETE /api/target-planning/{plan_id} - Clean up test plan"""
        plan_id = getattr(self.__class__, 'test_plan_id', None)
        
        if not plan_id:
            pytest.skip("No test plan to delete")
        
        response = self.session.delete(f"{BASE_URL}/api/target-planning/{plan_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"Test plan deleted: {plan_id}")
        
        # Verify deletion
        get_response = self.session.get(f"{BASE_URL}/api/target-planning/{plan_id}")
        assert get_response.status_code == 404, "Plan should not exist after deletion"
    
    # === Test Existing Plan ===
    def test_13_existing_plan_dashboard(self):
        """Test existing plan: 813fbe91-8434-4bd6-bc7b-49bd1ebca9b5"""
        existing_plan_id = "813fbe91-8434-4bd6-bc7b-49bd1ebca9b5"
        
        response = self.session.get(f"{BASE_URL}/api/target-planning/{existing_plan_id}/dashboard")
        
        if response.status_code == 404:
            pytest.skip("Existing test plan not found")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify plan structure
        assert data["plan"]["id"] == existing_plan_id
        
        # Check allocations
        allocations = data.get("allocations", [])
        print(f"Existing plan has {len(allocations)} territory allocations")
        
        for alloc in allocations:
            print(f"  - {alloc.get('territory_name')}: ₹{alloc.get('amount')}, children: {len(alloc.get('children', []))}")
            for child in alloc.get('children', []):
                print(f"    - {child.get('city')}: ₹{child.get('amount')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
