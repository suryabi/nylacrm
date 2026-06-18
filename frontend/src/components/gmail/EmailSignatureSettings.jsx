import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, PenLine, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { useTenantConfig } from '../../context/TenantConfigContext';
import { useAuth } from '../../context/AuthContext';
import SignatureEditor from './SignatureEditor';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const PLACEHOLDERS = [
  { key: 'name', label: 'Name' },
  { key: 'title', label: 'Title' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'department', label: 'Department' },
];

// Constrain logo images so they don't blow up in recipients' inboxes.
const normalizeImgs = (html) =>
  (html || '').replace(/<img(?![^>]*\bstyle=)([^>]*?)>/gi,
    '<img$1 style="max-width:160px;height:auto;display:block;margin-top:8px;">');

// Fill placeholders for the live preview using the signed-in admin's own details.
const resolvePreview = (html, user) => {
  const title = user?.designation || user?.role || '';
  const map = {
    name: user?.name || 'Your Name',
    title: title || 'Your Title',
    designation: title || 'Your Title',
    role: user?.role || '',
    phone: user?.phone || '+91 00000 00000',
    email: user?.email || 'you@company.com',
    department: user?.department || '',
  };
  return (html || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k.toLowerCase() in map ? map[k.toLowerCase()] : m));
};

export default function EmailSignatureSettings() {
  const { branding } = useTenantConfig();
  const { user } = useAuth();
  const logoUrl = branding?.logo_url || '';
  const [html, setHtml] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/gmail/signature/template`, { headers: authHeaders() });
      setHtml(res.data?.html || '');
      setEnabled(res.data?.enabled ?? false);
    } catch {
      toast.error('Could not load the signature');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/gmail/signature/template`,
        { html: normalizeImgs(html), enabled },
        { headers: authHeaders() });
      toast.success('Company email signature saved');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to save signature');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="email-signature-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PenLine className="h-4 w-4 text-rose-600" /> Company Email Signature</CardTitle>
        <CardDescription>
          Design one company-wide signature here. It auto-appends to every user's outgoing emails and replies — they can't change the design. Use the placeholder buttons and each sender's own details (name, title, phone) are filled in automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2">
              <Label htmlFor="sig-enabled" className="text-sm font-medium">Enable signature on outgoing emails</Label>
              <Switch id="sig-enabled" checked={enabled} onCheckedChange={setEnabled} data-testid="signature-enabled-toggle" />
            </div>

            <SignatureEditor value={html} onChange={setHtml} logoUrl={logoUrl} placeholders={PLACEHOLDERS} />

            {!logoUrl && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-600">
                <Info className="h-3 w-3" /> No company logo found — upload one in the Branding tab to insert it here.
              </p>
            )}

            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Live preview (using your details)</p>
              <div
                className="rounded-lg border bg-white p-3 text-sm text-slate-800 [&_img]:max-w-[160px] [&_img]:h-auto"
                data-testid="signature-preview"
                dangerouslySetInnerHTML={{ __html: resolvePreview(html, user) || '<span class="text-slate-400">Nothing yet — design your signature above.</span>' }}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="signature-save">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save signature
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
