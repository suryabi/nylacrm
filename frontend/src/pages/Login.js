import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { Mail, Lock, Loader2, Building2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const NYLA_LOGO = 'https://customer-assets.emergentagent.com/job_pipeline-master-14/artifacts/6tqxvtds_WhatsApp%20Image%202026-02-04%20at%2011.26.46%20PM.jpeg';
const MOUNTAIN_BG = 'https://customer-assets.emergentagent.com/job_502e229f-6a7a-4839-9c1b-794f252b0a40/artifacts/xww990sj_WhatsApp%20Image%202026-03-13%20at%201.29.28%20AM.jpeg';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { login, user, loading: authLoading } = useAuth();
  
  // Get tenant from URL query param
  const tenantFromUrl = searchParams.get('tenant');
  
  // Check for remembered email
  const rememberedEmail = localStorage.getItem('rememberedEmail') || '';
  const rememberedTenant = localStorage.getItem('selectedTenant') || 'nyla-air-water';
  const [email, setEmail] = useState(rememberedEmail || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(!!rememberedEmail);
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(tenantFromUrl || rememberedTenant);
  const [loadingTenants, setLoadingTenants] = useState(true);
  
  // Tenant-specific info
  const [tenantInfo, setTenantInfo] = useState(null);
  const [loadingTenantInfo, setLoadingTenantInfo] = useState(false);
  
  const errorMessage = location.state?.error;
  
  // Fetch tenant info when tenant changes
  useEffect(() => {
    const fetchTenantInfo = async () => {
      if (!selectedTenant) return;
      
      setLoadingTenantInfo(true);
      try {
        const response = await axios.get(`${API_URL}/api/tenants/info/${selectedTenant}`);
        setTenantInfo(response.data);
      } catch (error) {
        // Tenant not found - use defaults
        setTenantInfo(null);
      } finally {
        setLoadingTenantInfo(false);
      }
    };
    
    fetchTenantInfo();
  }, [selectedTenant]);
  
  // Fetch available tenants for testing
  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const response = await fetch(`${API_URL}/api/tenants/public-list`);
        if (response.ok) {
          const data = await response.json();
          setTenants(data);
        } else {
          // Fallback to default
          setTenants([{ tenant_id: 'nyla-air-water', name: 'Nyla Air Water' }]);
        }
      } catch (error) {
        setTenants([{ tenant_id: 'nyla-air-water', name: 'Nyla Air Water' }]);
      } finally {
        setLoadingTenants(false);
      }
    };
    fetchTenants();
  }, []);
  
  // Redirect to home if user is already authenticated (not during login process)
  useEffect(() => {
    if (user && !authLoading && !loading) {
      navigate('/home', { replace: true });
    }
  }, [user, authLoading, loading, navigate]);
  
  // Check for inactivity logout message
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('reason') === 'inactivity') {
      toast.info('You were logged out due to inactivity');
    }
  }, [location.search]);

  const handleTenantChange = (value) => {
    setSelectedTenant(value);
    localStorage.setItem('selectedTenant', value);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (loading) return; // Prevent double submission
    
    setLoading(true);
    
    try {
      // Save or remove remembered email
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
      
      // Store selected tenant for API calls
      localStorage.setItem('selectedTenant', selectedTenant);
      
      const userData = await login(email, password, selectedTenant);
      
      if (userData) {
        // Small delay to ensure state is synced before redirect
        await new Promise(resolve => setTimeout(resolve, 100));
        // Use navigate with replace to prevent back button issues
        navigate('/home', { replace: true });
      } else {
        toast.error('Login failed - no user data received');
        setLoading(false);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Login failed. Please check your credentials.';
      toast.error(errorMsg);
      setLoading(false);
    }
  };

  const handleGoogleWorkspaceLogin = () => {
    // Use tenant's Google Workspace SSO
    const clientId = process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) {
      toast.error('Google OAuth is not configured');
      return;
    }
    
    // Store tenant for callback
    localStorage.setItem('selectedTenant', selectedTenant);
    localStorage.setItem('googleWorkspaceLogin', 'true');
    
    const redirectUri = window.location.origin + '/auth/callback';
    const scope = 'email profile openid';
    const responseType = 'code';
    
    // If tenant has specific domain, add hd parameter for domain hint
    const domain = tenantInfo?.auth_config?.google_workspace_domain;
    
    let authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=${responseType}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline`;
    
    if (domain) {
      authUrl += `&hd=${encodeURIComponent(domain)}`;
    }
    
    window.location.href = authUrl;
  };

  // Get branding from tenant info
  const branding = tenantInfo?.branding || {};
  const authConfig = tenantInfo?.auth_config || {};
  const showGoogleWorkspace = authConfig.google_workspace_enabled;
  const googleDomain = authConfig.google_workspace_domain;

  // Show loading only during initial auth check
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      {/* Left side - Background Image */}
      <div 
        className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden"
      >
        {/* Background Image */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${MOUNTAIN_BG})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-8"
        >
          <div className="text-center">
            {/* Show tenant name if available */}
            {tenantInfo && (
              <p className="text-sm text-muted-foreground mb-2">
                Signing in to <span className="font-medium text-foreground">{tenantInfo.name}</span>
              </p>
            )}
            <h2 className="text-3xl font-semibold text-foreground mb-2" data-testid="login-form-title">
              {showRegister ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="text-muted-foreground">
              {showRegister ? 'Register for a new account' : 'Sign in to your account'}
            </p>
            
            {tenantInfo?.is_trial && (
              <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs">
                Trial • Ends {new Date(tenantInfo.trial_ends_at).toLocaleDateString()}
              </div>
            )}
            
            {errorMessage && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{errorMessage}</p>
              </div>
            )}
          </div>

          {!showRegister ? (
            <div className="space-y-6" data-testid="login-form">
              {/* Google Workspace Login - Show first if enabled */}
              {showGoogleWorkspace && (
                <>
                  <Button
                    type="button"
                    variant="default"
                    className="w-full h-14 text-base"
                    onClick={handleGoogleWorkspaceLogin}
                    data-testid="google-workspace-login-button"
                  >
                    <svg className="mr-3 h-6 w-6" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google Workspace
                  </Button>
                  {googleDomain && (
                    <p className="text-xs text-center text-muted-foreground -mt-3">
                      For @{googleDomain} accounts
                    </p>
                  )}
                  
                  {authConfig.allow_password_login !== false && (
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-4 bg-background text-muted-foreground">Or use password</span>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {/* Password Login Form */}
              {authConfig.allow_password_login !== false && (
                <form onSubmit={handleLogin} className="space-y-4">
                  {/* Tenant Selector (for testing) */}
                  {tenants.length > 1 && !tenantFromUrl && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <Label className="text-amber-800 flex items-center gap-2 mb-2">
                        <Building2 className="h-4 w-4" />
                        Select Organization (Testing Mode)
                      </Label>
                      <Select value={selectedTenant} onValueChange={handleTenantChange}>
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Select organization" />
                        </SelectTrigger>
                        <SelectContent>
                          {tenants.map((tenant) => (
                            <SelectItem key={tenant.tenant_id} value={tenant.tenant_id}>
                              {tenant.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      className="h-12"
                    />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter password"
                      required
                      className="h-12"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="remember-me" 
                      checked={rememberMe}
                      onCheckedChange={setRememberMe}
                    />
                    <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                      Remember me
                    </Label>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full h-12">
                    {loading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              )}
              
              {/* Only show regular Google if Workspace not enabled */}
              {!showGoogleWorkspace && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 bg-background text-muted-foreground">Or</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="default"
                    className="w-full h-14 text-base"
                    onClick={handleGoogleWorkspaceLogin}
                    data-testid="google-login-button"
                  >
                    <svg className="mr-3 h-6 w-6" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google
                  </Button>
                </>
              )}
              
              {/* Create Workspace Link */}
              <p className="text-center text-sm text-muted-foreground pt-4">
                Don't have a workspace?{' '}
                <Link to="/register" className="text-primary hover:underline font-medium">
                  Create one
                </Link>
              </p>
            </div>
          ) : (
            <RegisterForm onBack={() => setShowRegister(false)} />
          )}
        </motion.div>
      </div>
    </div>
  );
}

function RegisterForm({ onBack }) {
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'sales_rep',
    phone: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(formData);
      toast.success('Account created! Please sign in.');
      onBack();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="register-form">
      <div className="space-y-2">
        <Label htmlFor="reg-name">Full Name</Label>
        <Input
          id="reg-name"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          required
          data-testid="register-name-input"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-email">Email</Label>
        <Input
          id="reg-email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({...formData, email: e.target.value})}
          required
          data-testid="register-email-input"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-password">Password</Label>
        <Input
          id="reg-password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({...formData, password: e.target.value})}
          required
          data-testid="register-password-input"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-phone">Phone (optional)</Label>
        <Input
          id="reg-phone"
          value={formData.phone}
          onChange={(e) => setFormData({...formData, phone: e.target.value})}
          data-testid="register-phone-input"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading} data-testid="register-submit-button">
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...</> : 'Create Account'}
      </Button>
    </form>
  );
}
