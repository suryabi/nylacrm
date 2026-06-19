import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { LayoutTemplate, Plus, Trash2, Loader2, ExternalLink } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

/**
 * Admin-only manager for the CRM's Gamma template registry.
 * Templates are referenced by their Gamma ID (paste the deck link or ID).
 */
export default function GammaTemplateManager({ onChanged }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [idOrUrl, setIdOrUrl] = useState('');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    axios.get(`${API}/gamma/templates`, { headers: HEAD() })
      .then((r) => { setTemplates(r.data.templates || []); setCanManage(!!r.data.can_manage); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (open) load(); }, [open]);

  // Hidden entirely for non-admins.
  if (!canManage && templates.length >= 0 && !open) {
    // still allow the button only when canManage; otherwise render nothing
  }
  if (!canManage) return null;

  const add = async () => {
    if (!name.trim() || !idOrUrl.trim()) { toast.error('Name and Gamma link/ID are required'); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/gamma/templates`, { name, gamma_id_or_url: idOrUrl, description: desc }, { headers: HEAD() });
      setName(''); setIdOrUrl(''); setDesc('');
      toast.success('Template added');
      load();
      onChanged && onChanged();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to add template');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await axios.delete(`${API}/gamma/templates/${id}`, { headers: HEAD() });
      load();
      onChanged && onChanged();
    } catch (e) {
      toast.error('Failed to delete template');
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="gamma-manage-templates-btn">
        <LayoutTemplate className="h-4 w-4 mr-1.5" /> Manage Templates
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="gamma-templates-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LayoutTemplate className="h-5 w-5 text-indigo-600" /> My Gamma Templates</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add form */}
            <div className="rounded-lg border p-3 space-y-2.5 bg-slate-50/60">
              <div className="space-y-1.5">
                <Label className="text-xs">Template name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Branded Sales Proposal" data-testid="template-name-input" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Gamma link or ID</Label>
                <Input value={idOrUrl} onChange={(e) => setIdOrUrl(e.target.value)} placeholder="https://gamma.app/docs/… or g_xxxxxxxx" data-testid="template-id-input" />
                <p className="text-[11px] text-muted-foreground">Paste the link of a <strong>single-page</strong> Gamma from your workspace.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description (optional)</Label>
                <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="When to use this template" data-testid="template-desc-input" />
              </div>
              <Button onClick={add} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700" data-testid="template-add-btn">
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />} Add template
              </Button>
            </div>

            {/* List */}
            <div className="space-y-2">
              {loading ? (
                <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No templates yet.</p>
              ) : templates.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-2 border rounded-lg p-2.5" data-testid={`template-row-${t.id}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{t.gamma_id}</p>
                    {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive h-8 w-8 shrink-0" onClick={() => remove(t.id)} data-testid={`template-delete-${t.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
