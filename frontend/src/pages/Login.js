import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const NYLA_LOGO = 'https://customer-assets.emergentagent.com/job_pipeline-master-14/artifacts/6tqxvtds_WhatsApp%20Image%202026-02-04%20at%2011.26.46%20PM.jpeg';
const MOUNTAIN_BG = 'https://images.unsplash.com/photo-1761589951732-2795cd6ecdbf?crop=entropy&cs=srgb&fm=jpg&q=85';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@nyla.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen flex" data-testid="login-page">
      {/* Left side - Misty Mountains Background */}
      <div 
        className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden"
      >
        {/* Misty Mountains Background */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${MOUNTAIN_BG})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
        
        {/* Dark overlay for better text visibility */}
        <div className="absolute inset-0 bg-black/30" />
        
        <div className="relative z-10 text-center px-8">
          {/* Circular Logo */}
          <div className="h-32 w-32 rounded-full bg-white p-2 shadow-2xl mb-6 mx-auto overflow-hidden">
            <img src={NYLA_LOGO} alt="Nyla Air Water" className="w-full h-full object-cover rounded-full" />
          </div>
          <h1 className="text-4xl font-light text-white mb-4 drop-shadow-lg">Sales CRM</h1>
          <p className="text-lg text-white/90 font-light drop-shadow">Track leads, close deals, grow revenue</p>
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
            <h2 className="text-3xl font-semibold text-foreground mb-2" data-testid="login-form-title">
              {showRegister ? 'Create Account' : 'Welcome Back'}
            </h2>
            <p className="text-muted-foreground">
              {showRegister ? 'Register for a new account' : 'Sign in to your account'}
            </p>
          </div>

          {!showRegister ? (
            <form onSubmit={handleLogin} className="space-y-6" data-testid="login-form">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    data-testid="login-email-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    data-testid="login-password-input"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                data-testid="login-submit-button"
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          ) : (
            <RegisterForm onBack={() => setShowRegister(false)} />
          )}

          <div className="text-center">
            <button
              onClick={() => setShowRegister(!showRegister)}
              className="text-sm text-primary hover:underline"
              data-testid="toggle-register-button"
            >
              {showRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </button>
          </div>

          {/* Demo credentials hint */}
          <div className="mt-8 p-4 bg-muted/50 rounded-lg border border-border">
            <p className="text-xs text-muted-foreground text-center mb-2 font-semibold">Demo Accounts:</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="text-center">Admin: <span className="font-mono">admin@nyla.com</span> / admin123</p>
              <p className="text-center">Karanabir (VP): <span className="font-mono">karanabir.gulati@nyla.com</span> / karanabir123</p>
              <p className="text-center">Priya (Sales): <span className="font-mono">priya.sales@nyla.com</span> / priya123</p>
            </div>
          </div>
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
