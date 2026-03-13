"""
Lead Scoring Model API Tests
Tests for /api/scoring/* endpoints including:
- Scoring model retrieval and seeding
- Category CRUD operations
- Tier CRUD operations
- Account scoring
- Portfolio matrix
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
TENANT_ID = "nyla-air-water"

# Test credentials - CEO user with admin access
TEST_USER = {
    "email": "surya.yadavalli@nylaairwater.earth",
    "password": "surya123"
}

# Test account ID
TEST_ACCOUNT_ID = "2a03a944-2b5b-419a-94f0-859f35693c3e"


class TestLeadScoringModel:
    """Test Lead Scoring Model API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get auth cookie"""
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        # Login to get auth cookie
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json=TEST_USER
        )
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        # Store scoring model state for cleanup
        self.created_categories = []
        
        yield
        
        # Cleanup - delete test categories
        for cat_id in self.created_categories:
            try:
                self.session.delete(f"{BASE_URL}/api/scoring/categories/{cat_id}")
            except:
                pass
    
    # ==================== SCORING MODEL TESTS ====================
    
    def test_get_scoring_model(self):
        """Test GET /api/scoring/model - retrieves scoring model"""
        response = self.session.get(f"{BASE_URL}/api/scoring/model")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Model should have an id"
        assert "name" in data, "Model should have a name"
        assert "categories" in data, "Model should have categories array"
        assert "total_weight" in data, "Model should have total_weight"
        print(f"✓ Scoring model retrieved: {data['name']}, {len(data.get('categories', []))} categories, {data['total_weight']} total weight")
    
    def test_seed_default_model(self):
        """Test POST /api/scoring/seed-default-model - seeds default categories"""
        # First check if model already has categories
        model_response = self.session.get(f"{BASE_URL}/api/scoring/model")
        model = model_response.json()
        
        if model.get('categories') and len(model['categories']) > 0:
            print(f"✓ Model already has {len(model['categories'])} categories - seeding not needed")
            # Verify default categories exist
            categories = model['categories']
            assert len(categories) == 5, f"Expected 5 default categories, got {len(categories)}"
            
            category_names = [c['name'] for c in categories]
            expected_names = ['Volume Potential', 'Margin Potential', 'Brand Prestige', 'Guest Influence', 'Sustainability Alignment']
            for name in expected_names:
                assert name in category_names, f"Expected category '{name}' not found"
            
            # Verify total weight is 100
            assert model['total_weight'] == 100, f"Expected total weight 100, got {model['total_weight']}"
            return
        
        # Seed default model
        response = self.session.post(f"{BASE_URL}/api/scoring/seed-default-model")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert len(data.get('categories', [])) == 5, f"Expected 5 categories, got {len(data.get('categories', []))}"
        assert data.get('total_weight') == 100, f"Expected total weight 100, got {data.get('total_weight')}"
        print(f"✓ Default model seeded with 5 categories totaling 100 weight")
    
    # ==================== CATEGORY CRUD TESTS ====================
    
    def test_create_category(self):
        """Test POST /api/scoring/categories - creates new category"""
        # First get current total weight
        model_response = self.session.get(f"{BASE_URL}/api/scoring/model")
        model = model_response.json()
        current_total = model.get('total_weight', 0)
        
        if current_total >= 100:
            print(f"✓ Weight limit reached ({current_total}/100) - skipping category creation test")
            pytest.skip("Weight limit reached, cannot create new category")
        
        available_weight = 100 - current_total
        test_weight = min(available_weight, 10)
        
        new_category = {
            "name": f"TEST_Category_{uuid.uuid4().hex[:8]}",
            "description": "Test category for automated testing",
            "weight": test_weight,
            "is_numeric": False
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/scoring/categories",
            json=new_category
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('name') == new_category['name'], "Category name mismatch"
        assert data.get('weight') == test_weight, "Category weight mismatch"
        assert 'id' in data, "Category should have an id"
        
        self.created_categories.append(data['id'])
        print(f"✓ Category created: {data['name']} with {data['weight']} weight")
    
    def test_create_category_weight_validation(self):
        """Test weight validation - cannot exceed 100 total"""
        # This should fail if trying to add more than available weight
        oversized_category = {
            "name": "TEST_Oversized_Category",
            "description": "Should fail due to weight limit",
            "weight": 150,  # Way over the limit
            "is_numeric": False
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/scoring/categories",
            json=oversized_category
        )
        
        assert response.status_code == 400, f"Expected 400 for weight exceeded, got {response.status_code}"
        print(f"✓ Weight validation working - rejected oversized category")
    
    def test_update_category(self):
        """Test PUT /api/scoring/categories/{id} - updates category"""
        # Get existing categories
        model_response = self.session.get(f"{BASE_URL}/api/scoring/model")
        model = model_response.json()
        categories = model.get('categories', [])
        
        if not categories:
            pytest.skip("No categories to update")
        
        category = categories[0]
        original_name = category['name']
        
        update_data = {
            "description": f"Updated description at {uuid.uuid4().hex[:8]}"
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/scoring/categories/{category['id']}",
            json=update_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Category '{original_name}' updated successfully")
    
    def test_delete_category(self):
        """Test DELETE /api/scoring/categories/{id} - deletes category"""
        # First create a test category to delete
        model_response = self.session.get(f"{BASE_URL}/api/scoring/model")
        model = model_response.json()
        current_total = model.get('total_weight', 0)
        
        if current_total >= 100:
            pytest.skip("Weight limit reached, cannot test deletion")
        
        # Create temp category
        temp_category = {
            "name": f"TEST_Delete_{uuid.uuid4().hex[:8]}",
            "description": "Will be deleted",
            "weight": min(5, 100 - current_total),
            "is_numeric": False
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/scoring/categories",
            json=temp_category
        )
        
        if create_response.status_code != 200:
            pytest.skip("Could not create category for deletion test")
        
        category_id = create_response.json()['id']
        
        # Now delete it
        delete_response = self.session.delete(
            f"{BASE_URL}/api/scoring/categories/{category_id}"
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        data = delete_response.json()
        assert 'message' in data, "Should have delete message"
        print(f"✓ Category deleted successfully")
    
    # ==================== TIER CRUD TESTS ====================
    
    def test_add_tier_to_category(self):
        """Test POST /api/scoring/categories/{id}/tiers - adds tier"""
        # Get existing category
        model_response = self.session.get(f"{BASE_URL}/api/scoring/model")
        model = model_response.json()
        categories = model.get('categories', [])
        
        if not categories:
            pytest.skip("No categories for tier test")
        
        category = categories[0]
        
        new_tier = {
            "label": f"TEST_Tier_{uuid.uuid4().hex[:8]}",
            "description": "Test tier for automated testing",
            "score": min(5, category['weight'])  # Score within category weight
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/scoring/categories/{category['id']}/tiers",
            json=new_tier
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get('label') == new_tier['label'], "Tier label mismatch"
        assert 'id' in data, "Tier should have an id"
        print(f"✓ Tier '{data['label']}' added to category '{category['name']}'")
    
    def test_tier_score_validation(self):
        """Test tier score cannot exceed category weight"""
        model_response = self.session.get(f"{BASE_URL}/api/scoring/model")
        model = model_response.json()
        categories = model.get('categories', [])
        
        if not categories:
            pytest.skip("No categories for tier validation test")
        
        category = categories[0]
        
        invalid_tier = {
            "label": "TEST_Invalid_Tier",
            "description": "Should fail - score exceeds weight",
            "score": category['weight'] + 100  # Way over category weight
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/scoring/categories/{category['id']}/tiers",
            json=invalid_tier
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid score, got {response.status_code}"
        print(f"✓ Tier score validation working - rejected oversized score")
    
    def test_update_tier(self):
        """Test PUT /api/scoring/categories/{cat_id}/tiers/{tier_id} - updates tier"""
        model_response = self.session.get(f"{BASE_URL}/api/scoring/model")
        model = model_response.json()
        categories = model.get('categories', [])
        
        if not categories or not categories[0].get('tiers'):
            pytest.skip("No tiers to update")
        
        category = categories[0]
        tier = category['tiers'][0]
        
        update_data = {
            "description": f"Updated tier description {uuid.uuid4().hex[:8]}"
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/scoring/categories/{category['id']}/tiers/{tier['id']}",
            json=update_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Tier '{tier['label']}' updated successfully")
    
    def test_delete_tier(self):
        """Test DELETE /api/scoring/categories/{cat_id}/tiers/{tier_id} - deletes tier"""
        model_response = self.session.get(f"{BASE_URL}/api/scoring/model")
        model = model_response.json()
        categories = model.get('categories', [])
        
        if not categories:
            pytest.skip("No categories for tier deletion test")
        
        category = categories[0]
        
        # Create a tier to delete
        temp_tier = {
            "label": f"TEST_Delete_Tier_{uuid.uuid4().hex[:8]}",
            "description": "Will be deleted",
            "score": 1
        }
        
        create_response = self.session.post(
            f"{BASE_URL}/api/scoring/categories/{category['id']}/tiers",
            json=temp_tier
        )
        
        if create_response.status_code != 200:
            pytest.skip("Could not create tier for deletion test")
        
        tier_id = create_response.json()['id']
        
        # Delete it
        delete_response = self.session.delete(
            f"{BASE_URL}/api/scoring/categories/{category['id']}/tiers/{tier_id}"
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        print(f"✓ Tier deleted successfully")
    
    # ==================== ACCOUNT SCORING TESTS ====================
    
    def test_get_account_score_unscored(self):
        """Test GET /api/scoring/accounts/{id}/score - unscored account"""
        response = self.session.get(
            f"{BASE_URL}/api/scoring/accounts/{TEST_ACCOUNT_ID}/score"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'account_id' in data, "Should have account_id"
        # Account might be scored or unscored
        if data.get('scored'):
            print(f"✓ Account is scored: {data.get('total_score')}/100 - {data.get('quadrant')}")
        else:
            print(f"✓ Account is not yet scored")
    
    def test_score_account(self):
        """Test POST /api/scoring/accounts/{id}/score - scores an account"""
        # First get the scoring model to get tier IDs
        model_response = self.session.get(f"{BASE_URL}/api/scoring/model")
        model = model_response.json()
        categories = model.get('categories', [])
        
        if not categories:
            pytest.skip("No categories configured for scoring")
        
        # Build category_scores dict - select first tier from each category
        category_scores = {}
        for category in categories:
            tiers = category.get('tiers', [])
            if tiers:
                # Select the highest scoring tier
                sorted_tiers = sorted(tiers, key=lambda t: t.get('score', 0), reverse=True)
                category_scores[category['id']] = sorted_tiers[0]['id']
        
        if not category_scores:
            pytest.skip("No tiers available for scoring")
        
        response = self.session.post(
            f"{BASE_URL}/api/scoring/accounts/{TEST_ACCOUNT_ID}/score",
            json={"category_scores": category_scores}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'total_score' in data, "Should have total_score"
        assert 'quadrant' in data, "Should have quadrant"
        assert data['quadrant'] in ['Stars', 'Showcase', 'Plough Horses', 'Puzzles'], f"Invalid quadrant: {data['quadrant']}"
        print(f"✓ Account scored: {data['total_score']}/100 - Quadrant: {data['quadrant']}")
    
    def test_get_account_score_after_scoring(self):
        """Test GET /api/scoring/accounts/{id}/score - after scoring"""
        response = self.session.get(
            f"{BASE_URL}/api/scoring/accounts/{TEST_ACCOUNT_ID}/score"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # After previous test, account should be scored
        if data.get('scored'):
            assert 'total_score' in data, "Should have total_score"
            assert 'quadrant' in data, "Should have quadrant"
            assert 'category_scores' in data, "Should have category_scores breakdown"
            print(f"✓ Account score retrieved: {data['total_score']}/100 - {data['quadrant']}")
        else:
            print(f"✓ Account not scored (scoring test may have been skipped)")
    
    # ==================== PORTFOLIO MATRIX TESTS ====================
    
    def test_get_portfolio_matrix(self):
        """Test GET /api/scoring/portfolio-matrix - returns matrix data"""
        response = self.session.get(f"{BASE_URL}/api/scoring/portfolio-matrix")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'matrix' in data, "Should have matrix data"
        assert 'summary' in data, "Should have summary"
        
        matrix = data['matrix']
        assert 'Stars' in matrix, "Should have Stars quadrant"
        assert 'Showcase' in matrix, "Should have Showcase quadrant"
        assert 'Plough Horses' in matrix, "Should have Plough Horses quadrant"
        assert 'Puzzles' in matrix, "Should have Puzzles quadrant"
        
        summary = data['summary']
        print(f"✓ Portfolio matrix retrieved: Stars={summary.get('stars', 0)}, Showcase={summary.get('showcase', 0)}, Plough Horses={summary.get('plough_horses', 0)}, Puzzles={summary.get('puzzles', 0)}, Total={summary.get('total_scored', 0)}")
    
    def test_get_all_account_scores(self):
        """Test GET /api/scoring/accounts/scores - returns all scored accounts"""
        response = self.session.get(f"{BASE_URL}/api/scoring/accounts/scores")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'accounts' in data, "Should have accounts array"
        assert 'total' in data, "Should have total count"
        print(f"✓ All account scores retrieved: {data['total']} scored accounts")
    
    def test_filter_accounts_by_quadrant(self):
        """Test GET /api/scoring/accounts/scores?quadrant=Stars - filters by quadrant"""
        response = self.session.get(
            f"{BASE_URL}/api/scoring/accounts/scores",
            params={"quadrant": "Stars"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        accounts = data.get('accounts', [])
        
        # All returned accounts should be in Stars quadrant
        for account in accounts:
            quadrant = account.get('scoring', {}).get('quadrant')
            assert quadrant == 'Stars', f"Expected Stars quadrant, got {quadrant}"
        
        print(f"✓ Filtered accounts by Stars quadrant: {len(accounts)} accounts")
    
    # ==================== AUTHORIZATION TESTS ====================
    
    def test_unauthorized_access(self):
        """Test that unauthenticated requests are rejected"""
        # Create new session without login
        new_session = requests.Session()
        new_session.headers.update({
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID
        })
        
        response = new_session.get(f"{BASE_URL}/api/scoring/model")
        
        # Should require authentication
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print(f"✓ Unauthenticated access correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
