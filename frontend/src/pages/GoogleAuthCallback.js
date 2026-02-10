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
        // Exchange code for user session
        const response = await axios.post(
          `${API_URL}/auth/google-callback`,
          { code },
          { withCredentials: true }
        );

        // Success - user logged in
        toast.success('Logged in successfully!');
        navigate('/dashboard');
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
