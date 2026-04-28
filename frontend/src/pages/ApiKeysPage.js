import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Checkbox } from '../components/ui/checkbox';
import { Plus, KeyRound, Copy, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const headers = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token') || ''}`,
});

const METHOD_COLORS = {
  GET: 'bg-sky-100 text-sky-800 border-sky-200',
  POST: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PUT: 'bg-amber-100 text-amber-800 border-amber-200',
  DELETE: 'bg-rose-100 text-rose-800 border-rose-200',
  PATCH: 'bg-violet-100 text-violet-800 border-violet-200',
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealKey, setRevealKey] = useState(null);
  const [revokeId, setRevokeId] = useState(null);
  const [editKey, setEditKey] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [kRes, eRes] = await Promise.all([
        axios.get(`${API_URL}/api/api-keys`, { headers: headers() }),
        axios.get(`${API_URL}/api/api-keys/available-endpoints`, { headers: headers() }),
      ]);
      setKeys(Array.isArray(kRes.data) ? kRes.data : []);
      setAvailable(Array.isArray(eRes.data) ? eRes.data : []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (name, ids) => {
    try {
      const res = await axios.post(`${API_URL}/api/api-keys`,
        { name, allowed_endpoint_ids: ids },
        { headers: headers() });
      setRevealKey(res.data);
      setRevealOpen(true);
      setCreateOpen(false);
      toast.success('API key created');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create key');
    }
  };

  const handleToggleActive = async (k) => {
    try {
      await axios.put(`${API_URL}/api/api-keys/${k.id}`,
        { is_active: !k.is_active },
        { headers: headers() });
      toast.success(`API key ${k.is_active ? 'deactivated' : 'activated'}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update key');
    }
  };

  const handleUpdate = async (id, name, ids) => {
    try {
      await axios.put(`${API_URL}/api/api-keys/${id}`,
        { name, allowed_endpoint_ids: ids },
        { headers: headers() });
      toast.success('API key updated');
      setEditKey(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update key');
    }
  };

  const handleRevoke = async () => {
    if (!revokeId) return;
    try {
      await axios.delete(`${API_URL}/api/api-keys/${revokeId}`, { headers: headers() });
      toast.success('API key revoked');
      setRevokeId(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to revoke key');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="api-keys-page">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-slate-700" />
            API Keys
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Issue API keys to external integration partners. Each key grants access to a specific list of endpoints.
            Keys are shown only once at creation time and cannot be retrieved later.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="create-api-key-btn">
          <Plus className="h-4 w-4 mr-2" />
          New API Key
        </Button>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Active Keys</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading...</div>
          ) : keys.length === 0 ? (
            <div className="p-12 text-center">
              <KeyRound className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <div className="text-sm text-slate-500">No API keys yet. Create one to give an external partner access.</div>
            </div>
          ) : (
            <div className="divide-y">
              {keys.map((k) => (
                <div key={k.id} className="p-5 flex items-start justify-between gap-6 hover:bg-slate-50/60" data-testid={`api-key-row-${k.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-medium text-slate-900 truncate">{k.name}</div>
                      {k.is_active ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">Inactive</Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mb-3">{k.key_prefix}{'•'.repeat(20)}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(k.allowed_endpoints || []).map((ep, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 text-xs border rounded-md px-2 py-0.5 bg-white">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${METHOD_COLORS[ep.method] || 'bg-slate-100'}`}>
                            {ep.method}
                          </span>
                          <span className="text-slate-700 font-mono">{ep.path_pattern}</span>
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-slate-400 mt-3 flex gap-4">
                      <span>Created {k.created_at?.slice(0, 10)} by {k.created_by_name || '—'}</span>
                      <span>Last used: {k.last_used_at ? k.last_used_at.slice(0, 19).replace('T', ' ') : 'never'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={k.is_active}
                      onCheckedChange={() => handleToggleActive(k)}
                      data-testid={`toggle-active-${k.id}`}
                    />
                    <Button variant="outline" size="sm" onClick={() => setEditKey(k)} data-testid={`edit-key-${k.id}`}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setRevokeId(k.id)} data-testid={`revoke-key-${k.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        available={available}
        onSubmit={handleCreate}
      />

      <CreateKeyDialog
        open={!!editKey}
        onOpenChange={(o) => !o && setEditKey(null)}
        available={available}
        editing={editKey}
        onSubmit={(name, ids) => handleUpdate(editKey.id, name, ids)}
      />

      <RevealKeyDialog open={revealOpen} onOpenChange={setRevealOpen} payload={revealKey} />

      <AlertDialog open={!!revokeId} onOpenChange={(o) => !o && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API key?</AlertDialogTitle>
            <AlertDialogDescription>
              The key will stop working immediately. Any external integration using this key will start failing with 401. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} className="bg-rose-600 hover:bg-rose-700" data-testid="confirm-revoke-btn">
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateKeyDialog({ open, onOpenChange, available, onSubmit, editing }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (open) {
      setName(editing?.name || '');
      setSelected(editing ? (editing.allowed_endpoints || []).map((e) => e.id).filter(Boolean) : []);
    }
  }, [open, editing]);

  const toggle = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (selected.length === 0) {
      toast.error('Select at least one endpoint');
      return;
    }
    onSubmit(name.trim(), selected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit API Key' : 'Create new API Key'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update the integration name and allowed endpoints. The key value itself cannot be changed; revoke and re-issue if needed.'
              : 'The key will be displayed only once after creation. Copy it and share it securely with the partner.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div>
            <Label htmlFor="key-name">Integration name *</Label>
            <Input
              id="key-name"
              data-testid="key-name-input"
              placeholder="e.g. BriefingIQ"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Allowed endpoints *</Label>
            <div className="mt-2 border rounded-md divide-y max-h-72 overflow-y-auto" data-testid="endpoint-list">
              {available.map((ep) => (
                <label key={ep.id} className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50">
                  <Checkbox
                    checked={selected.includes(ep.id)}
                    onCheckedChange={() => toggle(ep.id)}
                    data-testid={`endpoint-checkbox-${ep.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${METHOD_COLORS[ep.method] || 'bg-slate-100'}`}>
                        {ep.method}
                      </span>
                      <span className="font-mono text-xs text-slate-700">{ep.path_pattern}</span>
                      <span className="text-sm text-slate-900 font-medium">{ep.label}</span>
                    </div>
                    {ep.description && <div className="text-xs text-slate-500 mt-0.5">{ep.description}</div>}
                  </div>
                </label>
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-1.5">{selected.length} selected</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} data-testid="save-key-btn">{editing ? 'Save Changes' : 'Generate Key'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevealKeyDialog({ open, onOpenChange, payload }) {
  const [copied, setCopied] = useState(false);
  if (!payload) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed — please select and copy manually');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" /> API Key created
          </DialogTitle>
          <DialogDescription>
            Copy and store this key securely now. <strong>It will not be shown again.</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2 text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>One-time display.</strong> If you lose this key, revoke it and create a new one. Anyone with this key can call the allowed endpoints on behalf of <strong>{payload.name}</strong>.
            </div>
          </div>
          <div>
            <Label className="text-xs">Your API key</Label>
            <div className="mt-1.5 flex gap-2">
              <Input readOnly value={payload.key} className="font-mono text-sm" data-testid="reveal-key-input" />
              <Button variant="outline" onClick={copy} data-testid="copy-key-btn">
                <Copy className="h-4 w-4 mr-1.5" /> {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          <div className="bg-slate-50 border rounded-md p-3 text-xs text-slate-700 space-y-2">
            <div className="font-medium text-slate-900">Usage examples</div>
            <pre className="bg-white border rounded p-2 overflow-x-auto text-[11px]">{`curl -X POST "$API/api/accounts/{ACCOUNT_ID}/invoices" \\
  -H "X-API-Key: ${payload.key.slice(0, 16)}..." \\
  -H "Content-Type: application/json" \\
  -d @invoice.json`}</pre>
            <div>or use <code className="bg-white border rounded px-1 py-0.5">Authorization: Bearer {payload.key.slice(0, 12)}...</code></div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} data-testid="close-reveal-btn">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
