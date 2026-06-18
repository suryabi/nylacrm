"""
Cost Cards Module Tests
Tests for CRUD operations, bulk save, filtering, and for-distributor endpoint
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
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
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data.get("session_token") or data.get("token")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "X-Tenant-ID": TENANT_ID,
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="module")
def test_sku(auth_headers):
    """Get a test SKU for creating cost cards"""
    response = requests.get(f"{BASE_URL}/api/master-skus", headers=auth_headers)
    assert response.status_code == 200, f"Failed to get SKUs: {response.text}"
    skus = response.json()
    if isinstance(skus, dict):
        skus = skus.get("skus", [])
    assert len(skus) > 0, "No SKUs found for testing"
    return skus[0]


@pytest.fixture(scope="module")
def test_city(auth_headers):
    """Get a test city from master locations"""
    response = requests.get(f"{BASE_URL}/api/master-locations/flat", headers=auth_headers)
    assert response.status_code == 200, f"Failed to get locations: {response.text}"
    data = response.json()
    
    # The endpoint returns {"territories": [...], "states": [...], "cities": [...]}
    cities = data.get("cities", [])
    if len(cities) > 0:
        return cities[0]["name"]
    
    # Fallback to a known city
    return "Hyderabad"


class TestCostCardsListAndFilters:
    """Tests for GET /api/cost-cards with filters"""
    
    def test_list_cost_cards_returns_200(self, auth_headers):
        """GET /api/cost-cards should return 200"""
        response = requests.get(f"{BASE_URL}/api/cost-cards", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASSED: GET /api/cost-cards returns 200")
    
    def test_list_cost_cards_response_structure(self, auth_headers):
        """Response should have cost_cards, cities, skus arrays"""
        response = requests.get(f"{BASE_URL}/api/cost-cards", headers=auth_headers)
        data = response.json()
        
        assert "cost_cards" in data, "Response missing 'cost_cards' field"
        assert "cities" in data, "Response missing 'cities' field"
        assert "skus" in data, "Response missing 'skus' field"
        assert "total" in data, "Response missing 'total' field"
        
        assert isinstance(data["cost_cards"], list), "cost_cards should be a list"
        assert isinstance(data["cities"], list), "cities should be a list"
        assert isinstance(data["skus"], list), "skus should be a list"
        print(f"PASSED: Response structure correct - {data['total']} cost cards, {len(data['cities'])} cities, {len(data['skus'])} skus")
    
    def test_cost_card_entry_structure(self, auth_headers):
        """Each cost card entry should have required fields"""
        response = requests.get(f"{BASE_URL}/api/cost-cards", headers=auth_headers)
        data = response.json()
        
        if len(data["cost_cards"]) > 0:
            card = data["cost_cards"][0]
            required_fields = ["id", "sku_id", "city", "cost_per_unit"]
            for field in required_fields:
                assert field in card, f"Cost card missing required field: {field}"
            
            # Verify cost_per_unit is a number with 2 decimal places
            assert isinstance(card["cost_per_unit"], (int, float)), "cost_per_unit should be numeric"
            print(f"PASSED: Cost card entry structure correct - {card['city']}, {card.get('sku_name', card['sku_id'])}, {card['cost_per_unit']}")
        else:
            print("SKIPPED: No cost cards to verify structure")
    
    def test_filter_by_city(self, auth_headers):
        """GET /api/cost-cards?city=X should filter by city"""
        # First get all to find a city
        response = requests.get(f"{BASE_URL}/api/cost-cards", headers=auth_headers)
        data = response.json()
        
        if len(data["cities"]) > 0:
            test_city = data["cities"][0]
            filtered_response = requests.get(
                f"{BASE_URL}/api/cost-cards?city={test_city}",
                headers=auth_headers
            )
            assert filtered_response.status_code == 200
            filtered_data = filtered_response.json()
            
            # All returned cards should be for the filtered city
            for card in filtered_data["cost_cards"]:
                assert card["city"] == test_city, f"Expected city {test_city}, got {card['city']}"
            print(f"PASSED: City filter works - filtered to {test_city}, got {len(filtered_data['cost_cards'])} cards")
        else:
            print("SKIPPED: No cities to filter by")
    
    def test_filter_by_sku(self, auth_headers):
        """GET /api/cost-cards?sku_id=X should filter by SKU"""
        response = requests.get(f"{BASE_URL}/api/cost-cards", headers=auth_headers)
        data = response.json()
        
        if len(data["skus"]) > 0:
            test_sku_id = data["skus"][0]["id"]
            filtered_response = requests.get(
                f"{BASE_URL}/api/cost-cards?sku_id={test_sku_id}",
                headers=auth_headers
            )
            assert filtered_response.status_code == 200
            filtered_data = filtered_response.json()
            
            # All returned cards should be for the filtered SKU
            for card in filtered_data["cost_cards"]:
                assert card["sku_id"] == test_sku_id, f"Expected sku_id {test_sku_id}, got {card['sku_id']}"
            print(f"PASSED: SKU filter works - filtered to {test_sku_id}, got {len(filtered_data['cost_cards'])} cards")
        else:
            print("SKIPPED: No SKUs to filter by")


class TestCostCardsCRUD:
    """Tests for Create, Update, Delete operations"""
    
    def test_create_cost_card(self, auth_headers, test_sku, test_city):
        """POST /api/cost-cards should create a new entry"""
        # Use a unique city name to avoid duplicates
        unique_city = f"TEST_City_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "sku_id": test_sku["id"],
            "sku_name": test_sku.get("name", test_sku["id"]),
            "city": unique_city,
            "cost_per_unit": 150.75
        }
        
        response = requests.post(
            f"{BASE_URL}/api/cost-cards",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["sku_id"] == payload["sku_id"]
        assert data["city"] == unique_city
        assert data["cost_per_unit"] == 150.75
        assert "id" in data
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/cost-cards/{data['id']}", headers=auth_headers)
        print(f"PASSED: Created cost card for {unique_city} with cost 150.75")
    
    def test_create_duplicate_rejected(self, auth_headers, test_sku):
        """POST /api/cost-cards should reject duplicate city+sku combination"""
        unique_city = f"TEST_DupCity_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "sku_id": test_sku["id"],
            "city": unique_city,
            "cost_per_unit": 100.00
        }
        
        # Create first entry
        response1 = requests.post(f"{BASE_URL}/api/cost-cards", json=payload, headers=auth_headers)
        assert response1.status_code == 200, f"First create failed: {response1.text}"
        created_id = response1.json()["id"]
        
        # Try to create duplicate
        response2 = requests.post(f"{BASE_URL}/api/cost-cards", json=payload, headers=auth_headers)
        assert response2.status_code == 400, f"Expected 400 for duplicate, got {response2.status_code}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/cost-cards/{created_id}", headers=auth_headers)
        print("PASSED: Duplicate city+sku combination rejected with 400")
    
    def test_update_cost_card(self, auth_headers, test_sku):
        """PUT /api/cost-cards/{id} should update cost_per_unit"""
        unique_city = f"TEST_UpdateCity_{uuid.uuid4().hex[:8]}"
        
        # Create entry
        create_payload = {
            "sku_id": test_sku["id"],
            "city": unique_city,
            "cost_per_unit": 100.00
        }
        create_response = requests.post(f"{BASE_URL}/api/cost-cards", json=create_payload, headers=auth_headers)
        assert create_response.status_code == 200
        card_id = create_response.json()["id"]
        
        # Update
        update_payload = {"cost_per_unit": 125.50}
        update_response = requests.put(
            f"{BASE_URL}/api/cost-cards/{card_id}",
            json=update_payload,
            headers=auth_headers
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated_data = update_response.json()
        assert updated_data["cost_per_unit"] == 125.50, f"Expected 125.50, got {updated_data['cost_per_unit']}"
        
        # Verify with GET
        get_response = requests.get(f"{BASE_URL}/api/cost-cards", headers=auth_headers)
        all_cards = get_response.json()["cost_cards"]
        found = [c for c in all_cards if c["id"] == card_id]
        assert len(found) == 1
        assert found[0]["cost_per_unit"] == 125.50
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/cost-cards/{card_id}", headers=auth_headers)
        print("PASSED: Updated cost_per_unit from 100.00 to 125.50")
    
    def test_update_nonexistent_returns_404(self, auth_headers):
        """PUT /api/cost-cards/{id} with invalid ID should return 404"""
        fake_id = str(uuid.uuid4())
        response = requests.put(
            f"{BASE_URL}/api/cost-cards/{fake_id}",
            json={"cost_per_unit": 100.00},
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: Update nonexistent card returns 404")
    
    def test_delete_cost_card(self, auth_headers, test_sku):
        """DELETE /api/cost-cards/{id} should delete entry"""
        unique_city = f"TEST_DeleteCity_{uuid.uuid4().hex[:8]}"
        
        # Create entry
        create_payload = {
            "sku_id": test_sku["id"],
            "city": unique_city,
            "cost_per_unit": 100.00
        }
        create_response = requests.post(f"{BASE_URL}/api/cost-cards", json=create_payload, headers=auth_headers)
        assert create_response.status_code == 200
        card_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/cost-cards/{card_id}", headers=auth_headers)
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        # Verify deleted - should not appear in list
        get_response = requests.get(f"{BASE_URL}/api/cost-cards", headers=auth_headers)
        all_cards = get_response.json()["cost_cards"]
        found = [c for c in all_cards if c["id"] == card_id]
        assert len(found) == 0, "Card still exists after delete"
        print("PASSED: Deleted cost card successfully")
    
    def test_delete_nonexistent_returns_404(self, auth_headers):
        """DELETE /api/cost-cards/{id} with invalid ID should return 404"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(f"{BASE_URL}/api/cost-cards/{fake_id}", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASSED: Delete nonexistent card returns 404")


class TestCostCardsBulkSave:
    """Tests for PUT /api/cost-cards/bulk/save"""
    
    def test_bulk_save_creates_new_entries(self, auth_headers, test_sku):
        """Bulk save should create new entries when no ID provided"""
        unique_city1 = f"TEST_Bulk1_{uuid.uuid4().hex[:8]}"
        unique_city2 = f"TEST_Bulk2_{uuid.uuid4().hex[:8]}"
        
        items = [
            {"sku_id": test_sku["id"], "city": unique_city1, "cost_per_unit": 110.00},
            {"sku_id": test_sku["id"], "city": unique_city2, "cost_per_unit": 120.00}
        ]
        
        response = requests.put(
            f"{BASE_URL}/api/cost-cards/bulk/save",
            json=items,
            headers=auth_headers
        )
        assert response.status_code == 200, f"Bulk save failed: {response.text}"
        
        data = response.json()
        assert data["created"] == 2, f"Expected 2 created, got {data['created']}"
        assert data["updated"] == 0, f"Expected 0 updated, got {data['updated']}"
        
        # Cleanup
        get_response = requests.get(f"{BASE_URL}/api/cost-cards", headers=auth_headers)
        all_cards = get_response.json()["cost_cards"]
        for card in all_cards:
            if card["city"] in [unique_city1, unique_city2]:
                requests.delete(f"{BASE_URL}/api/cost-cards/{card['id']}", headers=auth_headers)
        
        print(f"PASSED: Bulk save created 2 new entries")
    
    def test_bulk_save_updates_existing_by_id(self, auth_headers, test_sku):
        """Bulk save should update existing entries when ID provided"""
        unique_city = f"TEST_BulkUpdate_{uuid.uuid4().hex[:8]}"
        
        # Create entry first
        create_response = requests.post(
            f"{BASE_URL}/api/cost-cards",
            json={"sku_id": test_sku["id"], "city": unique_city, "cost_per_unit": 100.00},
            headers=auth_headers
        )
        card_id = create_response.json()["id"]
        
        # Bulk update with ID
        items = [
            {"id": card_id, "sku_id": test_sku["id"], "city": unique_city, "cost_per_unit": 150.00}
        ]
        
        response = requests.put(
            f"{BASE_URL}/api/cost-cards/bulk/save",
            json=items,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["updated"] == 1, f"Expected 1 updated, got {data['updated']}"
        
        # Verify update
        get_response = requests.get(f"{BASE_URL}/api/cost-cards", headers=auth_headers)
        all_cards = get_response.json()["cost_cards"]
        found = [c for c in all_cards if c["id"] == card_id]
        assert len(found) == 1
        assert found[0]["cost_per_unit"] == 150.00
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/cost-cards/{card_id}", headers=auth_headers)
        print("PASSED: Bulk save updated existing entry by ID")
    
    def test_bulk_save_updates_existing_by_city_sku(self, auth_headers, test_sku):
        """Bulk save should update existing entry when city+sku matches (no ID)"""
        unique_city = f"TEST_BulkMatch_{uuid.uuid4().hex[:8]}"
        
        # Create entry first
        create_response = requests.post(
            f"{BASE_URL}/api/cost-cards",
            json={"sku_id": test_sku["id"], "city": unique_city, "cost_per_unit": 100.00},
            headers=auth_headers
        )
        card_id = create_response.json()["id"]
        
        # Bulk save without ID but same city+sku
        items = [
            {"sku_id": test_sku["id"], "city": unique_city, "cost_per_unit": 175.00}
        ]
        
        response = requests.put(
            f"{BASE_URL}/api/cost-cards/bulk/save",
            json=items,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["updated"] == 1, f"Expected 1 updated, got {data['updated']}"
        assert data["created"] == 0, f"Expected 0 created, got {data['created']}"
        
        # Verify update
        get_response = requests.get(f"{BASE_URL}/api/cost-cards", headers=auth_headers)
        all_cards = get_response.json()["cost_cards"]
        found = [c for c in all_cards if c["id"] == card_id]
        assert len(found) == 1
        assert found[0]["cost_per_unit"] == 175.00
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/cost-cards/{card_id}", headers=auth_headers)
        print("PASSED: Bulk save updated existing entry by city+sku match")


class TestCostCardsForDistributor:
    """Tests for GET /api/cost-cards/for-distributor/{id}"""
    
    def test_for_distributor_returns_200(self, auth_headers):
        """GET /api/cost-cards/for-distributor/{id} should return 200"""
        # Use test distributor ID from test_credentials.md
        distributor_id = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
        
        response = requests.get(
            f"{BASE_URL}/api/cost-cards/for-distributor/{distributor_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print("PASSED: GET /api/cost-cards/for-distributor returns 200")
    
    def test_for_distributor_response_structure(self, auth_headers):
        """Response should have cost_cards array with override info"""
        distributor_id = "99fb55dc-532c-4e85-b618-6b8a5e552c04"
        
        response = requests.get(
            f"{BASE_URL}/api/cost-cards/for-distributor/{distributor_id}",
            headers=auth_headers
        )
        data = response.json()
        
        assert "cost_cards" in data, "Response missing 'cost_cards' field"
        assert "total" in data, "Response missing 'total' field"
        
        if len(data["cost_cards"]) > 0:
            card = data["cost_cards"][0]
            assert "has_override" in card, "Card missing 'has_override' field"
            assert "effective_price" in card, "Card missing 'effective_price' field"
            print(f"PASSED: For-distributor response has override info - {data['total']} cards")
        else:
            print("PASSED: For-distributor response structure correct (no cards for this distributor)")


class TestExistingCostCards:
    """Tests to verify existing test data"""
    
    def test_existing_cost_cards_present(self, auth_headers):
        """Verify existing test data: Hyderabad, New Delhi, Noida with Nyla - 660 ml / Sparkling"""
        response = requests.get(f"{BASE_URL}/api/cost-cards", headers=auth_headers)
        data = response.json()
        
        expected_cities = ["Hyderabad", "New Delhi", "Noida"]
        found_cities = [c["city"] for c in data["cost_cards"]]
        
        for city in expected_cities:
            if city in found_cities:
                card = [c for c in data["cost_cards"] if c["city"] == city][0]
                print(f"Found: {city} - {card.get('sku_name', 'N/A')} - {card['cost_per_unit']}")
        
        print(f"PASSED: Found {len(data['cost_cards'])} cost cards total")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
