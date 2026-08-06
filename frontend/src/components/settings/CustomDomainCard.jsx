import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Globe, Loader2, RefreshCw, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useTenantConfig } from '../../context/TenantConfigContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const STATUS_BADGES = {
  verified: { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2, label: 'Verified' },
  pending: { cls: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock, label: 'Pending DNS' },
  unresolvable: { cls: 'bg-rose-100 text-rose-700 border-rose-200', icon: XCircle, label: 'Not resolving' },
};

export const CustomDomainCard = () => {
  const { tenantConfig, refreshConfig } = useTenantConfig();
  const [domain, setDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState(null);

  const runCheck = async () => {
    setChecking(true);
    try {
      const r = await axios.get(`${API_URL}/api/tenants/current/custom-domain/status`, { headers: HEAD() });
      setCheck(r.data);
    } catch (e) { /* silent */ } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    setDomain(tenantConfig?.custom_domain || '');
    if (tenantConfig?.custom_domain) runCheck();
    else setCheck(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantConfig?.custom_domain]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await axios.put(`${API_URL}/api/tenants/current/custom-domain`, { domain }, { headers: HEAD() });
      toast.success(res.data.custom_domain ? `Domain linked: ${res.data.custom_domain}` : 'Custom domain removed');
      refreshConfig();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save domain');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="custom-domain-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Globe className="h-5 w-5" /> Custom Domain</CardTitle>
        <CardDescription>
          Run this workspace on your own URL (e.g. crm.yourcompany.com). Visitors on that domain go
          straight to your branded login — no workspace selector.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="crm.yourcompany.com"
            data-testid="custom-domain-input"
          />
          <Button onClick={save} disabled={saving} data-testid="custom-domain-save-btn">
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Save
          </Button>
        </div>
        {check && check.status !== 'none' && (() => {
          const meta = STATUS_BADGES[check.status] || STATUS_BADGES.pending;
          const Icon = meta.icon;
          return (
            <div className="flex flex-wrap items-center gap-2" data-testid="custom-domain-status-row">
              <Badge variant="outline" className={`${meta.cls} gap-1`} data-testid="custom-domain-status-badge">
                <Icon className="h-3.5 w-3.5" /> {meta.label}
              </Badge>
              {check.status !== 'verified' && (
                <span className="text-xs text-muted-foreground">
                  {check.status === 'unresolvable'
                    ? 'Domain has no DNS records yet.'
                    : `Resolves elsewhere — point a CNAME to ${check.expected_host}.`}
                </span>
              )}
              {check.checked_at && (
                <span className="text-[11px] text-muted-foreground">Checked {new Date(check.checked_at).toLocaleTimeString()}</span>
              )}
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={runCheck} disabled={checking} data-testid="custom-domain-recheck-btn">
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${checking ? 'animate-spin' : ''}`} /> Check again
              </Button>
            </div>
          );
        })()}
        <div className="rounded-lg bg-slate-50 border p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-slate-700">DNS setup</p>
          <p>1. Add a CNAME record for your domain pointing to {check?.expected_host || "this platform's hostname"}.</p>
          <p>2. The platform host must also be configured to accept your domain (contact your platform administrator).</p>
          <p>3. Leave the field empty and save to unlink the domain.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default CustomDomainCard;
