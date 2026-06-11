import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import {
  Truck, Plus, Search, Pencil, Trash2, Loader2, Mail, Phone, MapPin, Clock, Receipt,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const emptyForm = {
  vendor_name: '', contact_person: '', phone: '', email: '', address: '',
  gstin: '', payment_terms: '', lead_time_days: '', is_active: true,
};

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteVendor, setDeleteVendor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const { data } = await axios.get(`${API}/inventory/vendors?${params}`, { headers: HEAD() });
      setVendors(data.vendors || []);
    } catch { toast.error('Failed to load vendors'); } finally { setLoading(false); }
  }, [search]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (v) => { setEditing(v); setForm({ ...emptyForm, ...v, lead_time_days: v.lead_time_days ?? '' }); setShowForm(true); };

  const save = async () => {
    if (!form.vendor_name.trim()) return toast.error('Vendor name is required');
    setSaving(true);
    try {
      const payload = {
        vendor_name: form.vendor_name, contact_person: form.contact_person || null,
        phone: form.phone || null, email: form.email || null, address: form.address || null,
        gstin: form.gstin || null, payment_terms: form.payment_terms || null,
        lead_time_days: form.lead_time_days === '' ? null : Number(form.lead_time_days),
        is_active: form.is_active,
      };
      if (editing) { await axios.put(`${API}/inventory/vendors/${editing.id}`, payload, { headers: HEAD() }); toast.success('Vendor updated'); }
      else { await axios.post(`${API}/inventory/vendors`, payload, { headers: HEAD() }); toast.success('Vendor created'); }
      setShowForm(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save'); } finally { setSaving(false); }
  };

  const doDelete = async () => {
    try { await axios.delete(`${API}/inventory/vendors/${deleteVendor.id}`, { headers: HEAD() }); toast.success('Vendor deleted'); setDeleteVendor(null); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed to delete'); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30" data-testid="vendors-page">
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-100 to-blue-100"><Truck className="h-6 w-6 text-indigo-600" /></div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800">Vendor Master</h1>
              <p className="text-muted-foreground text-sm">Suppliers for raw materials, packaging & branding</p>
            </div>
          </div>
          <Button onClick={openAdd} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg" data-testid="add-vendor-btn"><Plus className="w-4 h-4" /> Add Vendor</Button>
        </div>

        <Card className="p-4 border-0 bg-white/80 backdrop-blur shadow">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="vendor-search" />
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading && <div className="col-span-full p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>}
          {!loading && vendors.length === 0 && <div className="col-span-full p-8 text-center text-muted-foreground">No vendors yet. Use the Add Vendor button.</div>}
          {!loading && vendors.map(v => (
            <Card key={v.id} className="border-0 bg-white/90 backdrop-blur shadow hover:shadow-md transition-all" data-testid={`vendor-card-${v.id}`}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{v.vendor_name}</h3>
                    {v.contact_person && <p className="text-sm text-muted-foreground">{v.contact_person}</p>}
                  </div>
                  {v.is_active ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge> : <Badge variant="outline" className="text-slate-500">Inactive</Badge>}
                </div>
                <div className="space-y-1.5 text-sm text-slate-600">
                  {v.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" /> {v.phone}</div>}
                  {v.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-400" /> {v.email}</div>}
                  {v.address && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-slate-400" /> <span className="truncate">{v.address}</span></div>}
                  {v.gstin && <div className="flex items-center gap-2"><Receipt className="h-3.5 w-3.5 text-slate-400" /> <span className="font-mono text-xs">{v.gstin}</span></div>}
                  <div className="flex items-center gap-4 pt-1">
                    {v.lead_time_days != null && <span className="flex items-center gap-1 text-xs"><Clock className="h-3.5 w-3.5 text-slate-400" /> {v.lead_time_days}d lead</span>}
                    {v.payment_terms && <span className="text-xs text-slate-500">{v.payment_terms}</span>}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1 pt-1 border-t">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(v)} data-testid={`vendor-edit-${v.id}`}><Pencil className="h-4 w-4 text-slate-600" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteVendor(v)} data-testid={`vendor-delete-${v.id}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="vendor-form-dialog">
          <DialogHeader><DialogTitle>{editing ? 'Edit Vendor' : 'New Vendor'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Vendor Name *</Label><Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} data-testid="vendor-name-input" /></div>
              <div className="space-y-1.5"><Label>Contact Person</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>GSTIN</Label><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} placeholder="22AAAAA0000A1Z5" data-testid="vendor-gstin-input" /></div>
              <div className="space-y-1.5"><Label>Payment Terms</Label><Input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="e.g. Net 30" /></div>
              <div className="space-y-1.5"><Label>Lead Time (days)</Label><Input type="number" value={form.lead_time_days} onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="flex items-center justify-between rounded-lg border p-3"><span className="text-sm font-medium">Active</span><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} data-testid="vendor-active-switch" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="vendor-save-btn">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} {editing ? 'Save Changes' : 'Create Vendor'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteVendor} onOpenChange={(o) => !o && setDeleteVendor(null)}>
        <DialogContent className="max-w-md" data-testid="vendor-delete-dialog">
          <DialogHeader><DialogTitle>Delete Vendor</DialogTitle><DialogDescription>Delete <span className="font-semibold">{deleteVendor?.vendor_name}</span>? This also removes its item prices. This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteVendor(null)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700" onClick={doDelete} data-testid="vendor-delete-confirm">Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
