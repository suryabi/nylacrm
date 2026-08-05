import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { CreditCard, Users, Loader2, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export default function Billing() {
  const { user } = useAuth();
  const isAdmin = ['admin', 'ceo', 'system admin', 'director', 'owner'].includes((user?.role || '').toLowerCase());
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    axios.get(`${API}/billing/info`, { headers: HEAD() })
      .then((r) => setInfo(r.data))
      .catch(() => toast.error('Failed to load billing info'))
      .finally(() => setLoading(false));
  }, []);

  const upgrade = async () => {
    setPaying(true);
    try {
      const res = await axios.post(`${API}/billing/checkout`, { origin_url: window.location.origin }, { headers: HEAD() });
      window.location.href = res.data.checkout_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to start checkout');
      setPaying(false);
    }
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!info) return null;

  const statusBadge = info.subscription_active
    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200" data-testid="billing-status-badge">Active</Badge>
    : info.trial_expired
      ? <Badge className="bg-rose-100 text-rose-700 border-rose-200" data-testid="billing-status-badge">Trial expired</Badge>
      : info.is_trial
        ? <Badge className="bg-amber-100 text-amber-700 border-amber-200" data-testid="billing-status-badge">Trial · {info.trial_days_left} days left</Badge>
        : <Badge variant="outline" data-testid="billing-status-badge">Free</Badge>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6" data-testid="billing-page">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="h-6 w-6" /> Billing &amp; Plan</h1>
        <p className="text-sm text-muted-foreground mt-1">Simple per-user pricing. Pay only for active team members.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg capitalize">{info.subscription_active ? 'Pro Plan' : info.is_trial ? 'Free Trial' : 'No Plan'}</CardTitle>
            {statusBadge}
          </div>
          {info.subscription_active && info.subscription_valid_until && (
            <CardDescription>Paid until {new Date(info.subscription_valid_until).toLocaleDateString()}</CardDescription>
          )}
          {info.trial_expired && (
            <CardDescription className="text-rose-600 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Your trial has ended — upgrade to keep using the workspace.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Active users</p>
              <p className="text-2xl font-bold mt-1" data-testid="billing-seats">{info.seats}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Price per user</p>
              <p className="text-2xl font-bold mt-1">${info.price_per_seat}<span className="text-sm font-normal text-muted-foreground">/{info.cycle_days} days</span></p>
            </div>
            <div className="rounded-lg border p-4 bg-primary/5 border-primary/20">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Your total</p>
              <p className="text-2xl font-bold mt-1 text-primary" data-testid="billing-total">${info.total_per_cycle}</p>
            </div>
          </div>

          <ul className="text-sm text-muted-foreground space-y-1.5">
            {['All modules included — Sales, Distribution, Production & QC', 'Unlimited records, roles & custom terminology', 'Priority support'].map((f) => (
              <li key={f} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> {f}</li>
            ))}
          </ul>

          {isAdmin ? (
            <Button className="w-full" size="lg" onClick={upgrade} disabled={paying} data-testid="billing-upgrade-btn">
              {paying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {info.subscription_active ? `Extend ${info.cycle_days} days — $${info.total_per_cycle}` : `Upgrade now — $${info.total_per_cycle}`}
            </Button>
          ) : (
            <p className="text-sm text-center text-muted-foreground">Contact your workspace admin to manage billing.</p>
          )}
          <p className="text-[11px] text-center text-muted-foreground">Secure payment via Stripe. Test mode: use card 4242 4242 4242 4242.</p>
        </CardContent>
      </Card>
    </div>
  );
}
