import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Loader2, Truck } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';

const API = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, withCredentials: true });

export default function VendorTypes() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null); // {mode, item}
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/vendor-types`, authHeaders());
      setItems(data.items || []);
    } catch (e) { toast.error('Failed to load vendor types'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())
    || (i.code || '').toLowerCase().includes(search.toLowerCase()));

  const onDelete = async () => {
    const it = confirmDel;
    try {
      await axios.delete(`${API}/api/vendor-types/${it.id}`, authHeaders());
      toast.success(`Deleted "${it.name}"`);
      setConfirmDel(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  return (
    <div className="mx-auto max-w-5xl p-6" data-testid="vendor-types-page">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Truck className="h-6 w-6 text-indigo-600" /> Vendor Types
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">Categorise vendors (e.g. Raw Material Supplier, Logistics Partner). Used across the Accounting &amp; procurement flows.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">All Vendor Types</h2>
            <p className="text-xs text-slate-400">{filtered.length} {filtered.length === 1 ? 'type' : 'types'}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-44 pl-8" data-testid="vendor-type-search" />
            </div>
            <Button onClick={() => setDialog({ mode: 'create' })} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-vendor-type-btn">
              <Plus className="mr-1.5 h-4 w-4" /> Add Vendor Type
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400" data-testid="vendor-type-empty">No vendor types yet — click “Add Vendor Type” to create the first one.</div>
        ) : (
          <table className="w-full text-sm" data-testid="vendor-type-table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="p-3 text-left font-medium">Name</th>
                <th className="p-3 text-left font-medium">Code</th>
                <th className="p-3 text-left font-medium">Description</th>
                <th className="p-3 text-center font-medium">Status</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="group border-b border-slate-100 hover:bg-slate-50" data-testid={`vendor-type-row-${it.id}`}>
                  <td className={`p-3 font-medium ${it.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{it.name}</td>
                  <td className="p-3 text-slate-500">{it.code || '—'}</td>
                  <td className="p-3 text-slate-500">{it.description || '—'}</td>
                  <td className="p-3 text-center">
                    <Badge variant="outline" className={it.is_active ? 'border-emerald-200 text-emerald-700' : 'text-slate-400'}>{it.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDialog({ mode: 'edit', item: it })} data-testid={`edit-vendor-type-${it.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => setConfirmDel(it)} data-testid={`delete-vendor-type-${it.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog && (
        <VendorTypeFormDialog
          dialog={dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }}
        />
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent data-testid="vendor-type-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDel?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This removes the vendor type. Vendors already using it will keep the stored value.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={onDelete} data-testid="confirm-delete-vendor-type-btn">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VendorTypeFormDialog({ dialog, onClose, onSaved }) {
  const editing = dialog.mode === 'edit';
  const it = dialog.item || {};
  const [form, setForm] = useState({
    name: it.name || '', code: it.code || '', description: it.description || '', is_active: it.is_active !== false,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await axios.patch(`${API}/api/vendor-types/${it.id}`, form, authHeaders());
        toast.success('Updated');
      } else {
        await axios.post(`${API}/api/vendor-types`, form, authHeaders());
        toast.success('Created');
      }
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="vendor-type-form-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit' : 'Add'} Vendor Type</DialogTitle>
          <DialogDescription>Configure a vendor category value.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus data-testid="vendor-type-form-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Code</Label>
              <Input value={form.code} onChange={(e) => set('code', e.target.value)} data-testid="vendor-type-form-code" />
            </div>
            <div className="flex items-end gap-2 pb-1.5">
              <Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} data-testid="vendor-type-form-active" />
              <Label className="text-xs text-slate-600">Active</Label>
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} data-testid="vendor-type-form-description" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="vendor-type-form-save-btn">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
