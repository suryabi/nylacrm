import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, PenLine } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { useTenantConfig } from '../../context/TenantConfigContext';
import SignatureEditor from './SignatureEditor';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Constrain logo images so they don't blow up in recipients' inboxes.
const normalizeImgs = (html) =>
  (html || '').replace(/<img(?![^>]*\bstyle=)([^>]*?)>/gi,
    '<img$1 style="max-width:160px;height:auto;display:block;margin-top:8px;">');

export default function SignatureSettingsDialog({ open, onOpenChange }) {
  const { branding } = useTenantConfig();
  const logoUrl = branding?.logo_url || '';
  const [html, setHtml] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/gmail/signature`, { headers: authHeaders() });
      setHtml(res.data?.html || '');
      setEnabled(res.data?.enabled ?? false);
    } catch {
      toast.error('Could not load your signature');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/gmail/signature`,
        { html: normalizeImgs(html), enabled },
        { headers: authHeaders() });
      toast.success('Signature saved');
      onOpenChange(false);
    } catch {
      toast.error('Failed to save signature');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="signature-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PenLine className="h-4 w-4 text-rose-600" /> Email signature</DialogTitle>
          <DialogDescription>
            Automatically added to the bottom of new emails and replies. You can still edit or remove it before sending.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2">
              <Label htmlFor="sig-enabled" className="text-sm font-medium">Append signature to outgoing emails</Label>
              <Switch id="sig-enabled" checked={enabled} onCheckedChange={setEnabled} data-testid="signature-enabled-toggle" />
            </div>
            <SignatureEditor value={html} onChange={setHtml} logoUrl={logoUrl} />
            {!logoUrl && (
              <p className="text-[11px] text-amber-600">No company logo found in branding — ask an admin to upload a logo in Company Settings to insert it here.</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="signature-cancel">Cancel</Button>
          <Button onClick={save} disabled={saving || loading} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="signature-save">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
