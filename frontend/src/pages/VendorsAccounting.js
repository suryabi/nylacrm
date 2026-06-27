import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Loader2, Building2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';

const API = process.env.REACT_APP_BACKEND_URL;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, withCredentials: true });

export default function VendorsAccounting() {
  const [items, setItems] = useState([]);
  const [vendorTypes, setVendorTypes] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, vt, loc] = await Promise.all([
        axios.get(`${API}/api/accounting/vendors`, auth()),
        axios.get(`${API}/api/vendor-types`, auth()),
        axios.get(`${API}/api/master-locations/flat`, auth()),
      ]);
      setItems(v.data.items || []);
      setVendorTypes((vt.data.items || []).filter((t) => t.is_active));
      setCities(loc.data.cities || []);
    } catch (e) { toast.error('Failed to load vendors'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((i) => [i.name, i.vendor_code, i.vendor_type, i.city, i.gstin]
    .some((f) => (f || '').toLowerCase().includes(search.toLowerCase())));

  const onDelete = async () => {
    try {
      await axios.delete(`${API}/api/accounting/vendors/${confirmDel.id}`, auth());
      toast.success(`Deleted "${confirmDel.name}"`); setConfirmDel(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  return (
    <div className="mx-auto max-w-6xl p-6" data-testid="vendors-page">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Building2 className="h-6 w-6 text-indigo-600" /> Vendors
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">Master list of suppliers and service providers with tax, contact and banking details.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <p className="text-xs text-slate-400">{filtered.length} vendor{filtered.length === 1 ? '' : 's'}</p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-52 pl-8" data-testid="vendor-search" />
            </div>
            <Button onClick={() => setDialog({ mode: 'create' })} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-vendor-btn">
              <Plus className="mr-1.5 h-4 w-4" /> Add Vendor
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400" data-testid="vendor-empty">No vendors yet — click “Add Vendor”.</div>
        ) : (
          <table className="w-full text-sm" data-testid="vendor-table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="p-3 text-left font-medium">Name</th>
                <th className="p-3 text-left font-medium">Type</th>
                <th className="p-3 text-left font-medium">GSTIN</th>
                <th className="p-3 text-left font-medium">City</th>
                <th className="p-3 text-left font-medium">Contact</th>
                <th className="p-3 text-center font-medium">Status</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="group border-b border-slate-100 hover:bg-slate-50" data-testid={`vendor-row-${it.id}`}>
                  <td className={`p-3 font-medium ${it.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{it.name}<div className="text-xs text-slate-400">{it.vendor_code || ''}</div></td>
                  <td className="p-3 text-slate-500">{it.vendor_type || '—'}</td>
                  <td className="p-3 text-slate-500">{it.gstin || '—'}</td>
                  <td className="p-3 text-slate-500">{it.city || '—'}</td>
                  <td className="p-3 text-slate-500">{it.contact_person || it.email || it.phone || '—'}</td>
                  <td className="p-3 text-center"><Badge variant="outline" className={it.is_active ? 'border-emerald-200 text-emerald-700' : 'text-slate-400'}>{it.is_active ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDialog({ mode: 'edit', item: it })} data-testid={`edit-vendor-${it.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => setConfirmDel(it)} data-testid={`delete-vendor-${it.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialog && <VendorForm dialog={dialog} vendorTypes={vendorTypes} cities={cities} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); }} />}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent data-testid="vendor-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDel?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the vendor record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={onDelete} data-testid="confirm-delete-vendor-btn">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }) {
  return <div><Label className="text-xs text-slate-600">{label}</Label>{children}</div>;
}

function VendorForm({ dialog, vendorTypes, cities, onClose, onSaved }) {
  const editing = dialog.mode === 'edit';
  const it = dialog.item || {};
  const [f, setF] = useState({
    name: it.name || '', vendor_code: it.vendor_code || '', vendor_type: it.vendor_type || '',
    gstin: it.gstin || '', pan: it.pan || '', contact_person: it.contact_person || '',
    email: it.email || '', phone: it.phone || '', billing_address: it.billing_address || '',
    city: it.city || '', state: it.state || '', payment_terms: it.payment_terms || '',
    bank_account_no: it.bank_account_no || '', bank_ifsc: it.bank_ifsc || '', bank_name: it.bank_name || '',
    msme_no: it.msme_no || '', tds_applicable: !!it.tds_applicable, is_active: it.is_active !== false, notes: it.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.name.trim()) { toast.error('Vendor name is required'); return; }
    setSaving(true);
    try {
      if (editing) await axios.patch(`${API}/api/accounting/vendors/${it.id}`, f, auth());
      else await axios.post(`${API}/api/accounting/vendors`, f, auth());
      toast.success(editing ? 'Updated' : 'Created'); onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="vendor-form-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit' : 'Add'} Vendor</DialogTitle>
          <DialogDescription>Capture full vendor details for accounting &amp; procurement.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name *"><Input value={f.name} onChange={(e) => set('name', e.target.value)} data-testid="vendor-form-name" /></Field>
          <Field label="Vendor Code"><Input value={f.vendor_code} onChange={(e) => set('vendor_code', e.target.value)} data-testid="vendor-form-code" /></Field>
          <Field label="Vendor Type">
            <Select value={f.vendor_type || undefined} onValueChange={(v) => set('vendor_type', v)}>
              <SelectTrigger data-testid="vendor-form-type"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>{vendorTypes.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Payment Terms"><Input value={f.payment_terms} onChange={(e) => set('payment_terms', e.target.value)} placeholder="e.g. Net 30" data-testid="vendor-form-terms" /></Field>
          <Field label="GSTIN"><Input value={f.gstin} onChange={(e) => set('gstin', e.target.value)} data-testid="vendor-form-gstin" /></Field>
          <Field label="PAN"><Input value={f.pan} onChange={(e) => set('pan', e.target.value)} data-testid="vendor-form-pan" /></Field>
          <Field label="Contact Person"><Input value={f.contact_person} onChange={(e) => set('contact_person', e.target.value)} /></Field>
          <Field label="Email"><Input value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="City (from Admin Locations)">
            <Input list="vendor-cities" value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="Type to search" data-testid="vendor-form-city" />
            <datalist id="vendor-cities">{cities.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </Field>
          <Field label="State"><Input value={f.state} onChange={(e) => set('state', e.target.value)} /></Field>
          <Field label="MSME / Udyam No."><Input value={f.msme_no} onChange={(e) => set('msme_no', e.target.value)} /></Field>
          <Field label="Bank A/c No."><Input value={f.bank_account_no} onChange={(e) => set('bank_account_no', e.target.value)} /></Field>
          <Field label="IFSC"><Input value={f.bank_ifsc} onChange={(e) => set('bank_ifsc', e.target.value)} /></Field>
          <Field label="Bank Name"><Input value={f.bank_name} onChange={(e) => set('bank_name', e.target.value)} /></Field>
          <div className="col-span-2"><Field label="Billing Address"><Textarea rows={2} value={f.billing_address} onChange={(e) => set('billing_address', e.target.value)} /></Field></div>
          <div className="col-span-2"><Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field></div>
          <div className="flex items-center gap-2"><Switch checked={f.tds_applicable} onCheckedChange={(v) => set('tds_applicable', v)} data-testid="vendor-form-tds" /><Label className="text-xs">TDS Applicable</Label></div>
          <div className="flex items-center gap-2"><Switch checked={f.is_active} onCheckedChange={(v) => set('is_active', v)} data-testid="vendor-form-active" /><Label className="text-xs">Active</Label></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="vendor-form-save-btn">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
