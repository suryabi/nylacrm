"""
Test Customer Invoice PDF Generation
Tests the customer-invoice endpoint for delivery PDF generation with GST
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://distribution-columns.preview.emergentagent.com')

class TestCustomerInvoice:
    """Customer Invoice PDF Generation Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "surya.yadavalli@nylaairwater.earth",
            "password": "test123"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip("Authentication failed")
    
    def test_customer_invoice_endpoint_exists(self):
        """Test that customer-invoice endpoint exists and returns PDF for delivered delivery"""
        # First get a distributor
        dist_response = self.session.get(f"{BASE_URL}/api/distributors")
        assert dist_response.status_code == 200
        
        distributors = dist_response.json().get("distributors", [])
        assert len(distributors) > 0, "No distributors found"
        
        # Find Brian distributor
        brian = next((d for d in distributors if "Brian" in d.get("distributor_name", "")), None)
        if not brian:
            brian = distributors[0]
        
        distributor_id = brian.get("id")
        
        # Get deliveries for this distributor
        deliveries_response = self.session.get(f"{BASE_URL}/api/distributors/{distributor_id}/deliveries")
        assert deliveries_response.status_code == 200
        
        deliveries = deliveries_response.json().get("deliveries", [])
        
        # Find a delivered delivery
        delivered = next((d for d in deliveries if d.get("status") == "delivered"), None)
        
        if delivered:
            delivery_id = delivered.get("id")
            
            # Test customer-invoice endpoint
            invoice_response = self.session.get(
                f"{BASE_URL}/api/distributors/{distributor_id}/deliveries/{delivery_id}/customer-invoice"
            )
            
            assert invoice_response.status_code == 200, f"Expected 200, got {invoice_response.status_code}"
            assert invoice_response.headers.get("content-type") == "application/pdf", "Expected PDF content type"
            
            # Check content-disposition header
            content_disposition = invoice_response.headers.get("content-disposition", "")
            assert "attachment" in content_disposition, "Expected attachment disposition"
            assert ".pdf" in content_disposition, "Expected PDF filename"
            
            print(f"PASS: Customer invoice PDF generated successfully for delivery {delivered.get('delivery_number')}")
            print(f"Content-Disposition: {content_disposition}")
        else:
            pytest.skip("No delivered deliveries found to test invoice generation")
    
    def test_customer_invoice_returns_404_for_invalid_delivery(self):
        """Test that customer-invoice returns 404 for non-existent delivery"""
        # Get a distributor
        dist_response = self.session.get(f"{BASE_URL}/api/distributors")
        distributors = dist_response.json().get("distributors", [])
        
        if distributors:
            distributor_id = distributors[0].get("id")
            
            # Try to get invoice for non-existent delivery
            invoice_response = self.session.get(
                f"{BASE_URL}/api/distributors/{distributor_id}/deliveries/non-existent-id/customer-invoice"
            )
            
            assert invoice_response.status_code == 404, f"Expected 404, got {invoice_response.status_code}"
            print("PASS: Returns 404 for non-existent delivery")
        else:
            pytest.skip("No distributors found")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
