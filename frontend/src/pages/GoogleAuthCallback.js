import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function GoogleAuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const processOAuthCallback = async () => {
      // Get authorization code from URL
      const params = new URLSearchParams(location.search);
      const code = params.get('code');

      if (!code) {
        toast.error('Authentication failed');
        navigate('/login');
        return;
      }

      try {
        // Get the tenant that was selected before OAuth redirect
        const selectedTenant = localStorage.getItem('selectedTenant') || 'nyla-air-water';
        
        // Exchange code for user session - send redirect_uri to match what was used in auth request
        const redirectUri = window.location.origin + '/auth/callback';
        const response = await axios.post(
          `${API_URL}/auth/google-callback`,
          { code, redirect_uri: redirectUri },
          { 
            withCredentials: true,
            headers: {
              'X-Tenant-ID': selectedTenant
            }
          }
        );

        // Store session token in localStorage for iPad/Safari compatibility
        if (response.data.session_token) {
          localStorage.setItem('token', response.data.session_token);
        }

        // Force full page reload so AuthProvider re-initializes with the new token
        window.location.href = '/home';
      } catch (error) {
        console.error('OAuth error:', error);
        const errorMsg = error.response?.data?.detail || 'Authentication failed';
        navigate('/login', { state: { error: errorMsg } });
      }
    };

    processOAuthCallback();
  }, [location, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  );
}
