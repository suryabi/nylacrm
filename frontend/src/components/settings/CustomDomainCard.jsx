import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Globe, Loader2 } from 'lucide-react';
import { useTenantConfig } from '../../context/TenantConfigContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export const CustomDomainCard = () => {
  const { tenantConfig, refreshConfig } = useTenantConfig();
  const [domain, setDomain] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDomain(tenantConfig?.custom_domain || ''); }, [tenantConfig]);

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
        <div className="rounded-lg bg-slate-50 border p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-slate-700">DNS setup</p>
          <p>1. Add a CNAME record for your domain pointing to this platform's hostname.</p>
          <p>2. The platform host must also be configured to accept your domain (contact your platform administrator).</p>
          <p>3. Leave the field empty and save to unlink the domain.</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default CustomDomainCard;
