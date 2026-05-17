import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, Truck, Phone, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

/**
 * Driver mobile-web login.
 * Drivers authenticate with mobile number + system-generated password.
 * On success we hydrate AuthContext using the standard /auth/me call.
 */
export default function DriverLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      // Already logged in — route them based on role.
      if (user.role === 'Driver') {
        navigate('/driver/schedules', { replace: true });
      } else if (user.role === 'Distributor') {
        navigate('/distributor-home', { replace: true });
      } else {
        navigate('/home', { replace: true });
      }
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const tenant = new URLSearchParams(location.search).get('tenant');
    if (tenant) localStorage.setItem('selectedTenant', tenant);
  }, [location.search]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const tenant = localStorage.getItem('selectedTenant') || 'nyla-air-water';
      const { data } = await axios.post(
        `${API_URL}/driver/login`,
        { phone, password },
        { withCredentials: true, headers: { 'X-Tenant-ID': tenant } }
      );
      if (data?.session_token) {
        localStorage.setItem('token', data.session_token);
      }
      toast.success(`Welcome ${data.user?.name || 'Driver'}`);
      // Force AuthContext to re-hydrate by navigating with a full reload.
      window.location.href = '/driver/schedules';
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4" data-testid="driver-login-page">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-200 p-7">
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center mb-3">
            <Truck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Driver Login</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in with your mobile number</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-500">Mobile Number</Label>
            <div className="relative mt-1.5">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9+\-\s]/g, ''))}
                placeholder="9876543210"
                inputMode="numeric"
                autoComplete="tel"
                className="pl-9 font-mono h-12"
                required
                data-testid="driver-login-phone"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-500">Password</Label>
            <div className="relative mt-1.5">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="System-generated password"
                className="pl-9 h-12"
                autoComplete="current-password"
                required
                data-testid="driver-login-password"
              />
            </div>
          </div>
          <Button type="submit" disabled={loading} className="w-full h-12" data-testid="driver-login-submit">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Signing in…</> : 'Sign In'}
          </Button>
          <p className="text-xs text-slate-400 text-center pt-2">
            Don't have a password? Ask your distributor/admin to share the one generated for you.
          </p>
        </form>
      </div>
    </div>
  );
}
