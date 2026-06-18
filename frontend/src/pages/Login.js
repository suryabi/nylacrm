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
import { Mail, Lock, Loader2, Building2, ArrowRight, BarChart3, Users, TrendingUp, Target, PieChart, Zap, Factory, Truck, Megaphone, Package, Boxes, ShieldCheck, Sparkles, Receipt } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Decide where to send a user after login based on their role/department.
// Dedicated teams land directly in their own module; everyone else → Sales home.
const landingRouteFor = (u) => {
  if (!u) return '/home';
  if (u.role === 'Driver') return '/driver/schedules';
  if (u.role === 'Distributor') return '/distributor-home';
  const depts = Array.isArray(u.department)
    ? u.department.map((d) => (d || '').toLowerCase())
    : [(u.department || '').toLowerCase()];
  // Marketing-only users go straight to the Marketing module (Design Requests).
  if (depts.includes('marketing') && !depts.includes('sales')) return '/marketing-requests';
  return '/home';
};

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
  
  // Auto-populate test credentials in preview/test environment
  const isTestEnv = API_URL?.includes('preview.emergentagent.com') || API_URL?.includes('localhost');
  const defaultEmail = isTestEnv ? 'surya.yadavalli@nylaairwater.earth' : '';
  const defaultPassword = isTestEnv ? 'test123' : '';
  
  const [email, setEmail] = useState(rememberedEmail || defaultEmail);
  const [password, setPassword] = useState(defaultPassword);
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
      navigate(landingRouteFor(user), { replace: true });
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
        navigate(landingRouteFor(userData), { replace: true });
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
      {/* Left side - CRM Illustration Panel */}
      <div 
        className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}
      >
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }} />
        
        {/* Ambient glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px]" style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }} />

        <div className="relative z-10 px-16 max-w-lg w-full">
          <RotatingHero />
        </div>
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


// ─────────────────────────────────────────────────────────────────────────────
// RotatingHero — auto-cycles through Sales / Production / Distribution / Marketing.
// All copy is intentionally generic so any business can use this product.
// ─────────────────────────────────────────────────────────────────────────────
const HERO_SLIDES = [
  {
    id: 'sales',
    label: 'Sales',
    accent: '#10b981',
    accentDot: 'bg-emerald-400',
    bars: [40, 65, 45, 80, 55, 70, 90],
    highlightIdx: [3, 6],
    barColor: '#10b981',
    cardLabel: 'Revenue Pipeline',
    delta: '+24%',
    headline: 'Sales, end to end.',
    sub: 'Track leads, manage pipelines and close deals faster — with full visibility into every stage.',
    metrics: [
      { pos: 'top-right', icon: TrendingUp, color: 'emerald', value: '127', label: 'Deals Won' },
      { pos: 'bottom-left', icon: Users, color: 'blue', value: '2,840', label: 'Contacts' },
      { pos: 'top-left-chip', icon: Target, color: 'amber', text: '94% hit rate' },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    accent: '#f59e0b',
    accentDot: 'bg-amber-400',
    bars: [55, 70, 60, 85, 75, 90, 95],
    highlightIdx: [3, 5, 6],
    barColor: '#f59e0b',
    cardLabel: 'QC Throughput',
    delta: '98.6%',
    headline: 'Production, in control.',
    sub: 'Run batches, log QC at every stage and catch defects before they ship — one source of truth.',
    metrics: [
      { pos: 'top-right', icon: ShieldCheck, color: 'amber', value: '38', label: 'Batches Passed' },
      { pos: 'bottom-left', icon: Boxes, color: 'blue', value: '14', label: 'SKUs Active' },
      { pos: 'top-left-chip', icon: Target, color: 'cyan', text: '0.4% reject rate' },
    ],
  },
  {
    id: 'distribution',
    label: 'Distribution',
    accent: '#3b82f6',
    accentDot: 'bg-blue-400',
    bars: [35, 50, 45, 65, 70, 60, 85],
    highlightIdx: [3, 4, 6],
    barColor: '#3b82f6',
    cardLabel: 'Stock Movement',
    delta: '+12%',
    headline: 'Distribution, transparent.',
    sub: 'Stock, deliveries and settlements wired together end-to-end — distributors get their own portal.',
    metrics: [
      { pos: 'top-right', icon: Truck, color: 'blue', value: '412', label: 'Deliveries / wk' },
      { pos: 'bottom-left', icon: Package, color: 'emerald', value: '12.4k', label: 'Units in Stock' },
      { pos: 'top-left-chip', icon: Target, color: 'cyan', text: '96% on-time' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    accent: '#d946ef',
    accentDot: 'bg-fuchsia-400',
    bars: [30, 55, 70, 60, 80, 75, 95],
    highlightIdx: [4, 6],
    barColor: '#d946ef',
    cardLabel: 'Campaign Reach',
    delta: '+31%',
    headline: 'Marketing, on plan.',
    sub: 'Campaigns, requests and content calendar — all in sync with sales, no spreadsheet juggling.',
    metrics: [
      { pos: 'top-right', icon: Megaphone, color: 'fuchsia', value: '2.4k', label: 'Reach / wk' },
      { pos: 'bottom-left', icon: Sparkles, color: 'cyan', value: '18', label: 'Active Posts' },
      { pos: 'top-left-chip', icon: Zap, color: 'amber', text: '6 open requests' },
    ],
  },
];

const COLOR_TINTS = {
  emerald: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  blue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  amber: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  fuchsia: { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400' },
  cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  violet: { bg: 'bg-violet-500/20', text: 'text-violet-400' },
};

const POS_CLASS = {
  'top-right': 'absolute -top-6 -right-4',
  'bottom-left': 'absolute -bottom-5 -left-6',
  'top-left-chip': 'absolute top-12 -left-12',
};

function FloatingMetric({ metric }) {
  const Icon = metric.icon;
  const tint = COLOR_TINTS[metric.color] || COLOR_TINTS.blue;
  if (metric.pos === 'top-left-chip') {
    return (
      <motion.div
        className={`${POS_CLASS[metric.pos]} bg-white/[0.08] backdrop-blur-sm rounded-xl border border-white/10 px-3 py-2`}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ delay: 0.25, type: 'spring' }}
      >
        <div className="flex items-center gap-1.5">
          <div className={`w-6 h-6 rounded-md ${tint.bg} flex items-center justify-center`}>
            <Icon size={11} className={tint.text} />
          </div>
          <span className="text-[10px] text-slate-300 font-medium">{metric.text}</span>
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div
      className={`${POS_CLASS[metric.pos]} bg-white/[0.08] backdrop-blur-sm rounded-xl border border-white/10 px-4 py-3`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: metric.pos === 'top-right' ? 0.1 : 0.18, type: 'spring' }}
    >
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg ${tint.bg} flex items-center justify-center`}>
          <Icon size={14} className={tint.text} />
        </div>
        <div>
          <div className="text-white text-sm font-bold">{metric.value}</div>
          <div className="text-[9px] text-slate-400 uppercase tracking-wider">{metric.label}</div>
        </div>
      </div>
    </motion.div>
  );
}

function RotatingHero() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % HERO_SLIDES.length), 5000);
    return () => clearInterval(t);
  }, [paused]);

  const slide = HERO_SLIDES[index];

  return (
    <div
      className="w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="rotating-hero"
    >
      {/* Module label tab */}
      <div className="flex justify-center mb-6">
        <AnimatePresence mode="wait">
          <motion.span
            key={`label-${slide.id}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-[10px] uppercase tracking-[0.18em] text-slate-300 font-medium"
            data-testid={`hero-module-label-${slide.id}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${slide.accentDot}`} />
            {slide.label}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Card cluster */}
      <div className="relative mb-12 flex justify-center min-h-[200px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={`card-${slide.id}`}
            className="w-56 h-40 bg-white/[0.07] backdrop-blur-sm rounded-2xl border border-white/10 p-5 relative"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45 }}
          >
            {/* Mini bar chart */}
            <div className="flex items-end gap-2 h-20 mb-3">
              {slide.bars.map((h, i) => (
                <motion.div
                  key={`${slide.id}-${i}`}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${h}%`,
                    background: slide.highlightIdx.includes(i) ? slide.barColor : 'rgba(148,163,184,0.3)',
                  }}
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ delay: 0.2 + i * 0.05, duration: 0.35 }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                {slide.cardLabel}
              </span>
              <span className="text-xs font-semibold" style={{ color: slide.accent }}>
                {slide.delta}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Metrics rerender as a group when the slide changes (key-based remount) */}
        {slide.metrics.map((m) => (
          <FloatingMetric key={`${slide.id}-${m.pos}`} metric={m} />
        ))}
      </div>

      {/* Headline + sub */}
      <div className="text-center min-h-[140px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={`text-${slide.id}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            <h2 className="text-3xl font-bold text-white tracking-tight leading-tight">
              {slide.headline}
            </h2>
            <p className="text-slate-400 mt-4 text-sm leading-relaxed max-w-sm mx-auto">
              {slide.sub}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 mt-6">
        {HERO_SLIDES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => { setIndex(i); setPaused(true); setTimeout(() => setPaused(false), 8000); }}
            aria-label={`Show ${s.label}`}
            data-testid={`hero-dot-${s.id}`}
            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-white/80' : 'w-1.5 bg-white/30 hover:bg-white/50'}`}
          />
        ))}
      </div>

      {/* Static feature pills (cover all modules + cross-cutting) */}
      <div className="flex flex-wrap justify-center gap-2 mt-8">
        {[
          { icon: BarChart3, label: 'Sales', tint: 'text-emerald-400' },
          { icon: Factory, label: 'Production & QC', tint: 'text-amber-400' },
          { icon: Truck, label: 'Distribution', tint: 'text-blue-400' },
          { icon: Megaphone, label: 'Marketing', tint: 'text-fuchsia-400' },
          { icon: Receipt, label: 'Reports', tint: 'text-violet-400' },
          { icon: Sparkles, label: 'AI Assistant', tint: 'text-cyan-400' },
        ].map(({ icon: Icon, label, tint }) => (
          <span
            key={label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[11px] text-slate-300 font-medium"
          >
            <Icon size={11} className={tint} /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}
