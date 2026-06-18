import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  Printer, Plus, Pencil, Trash2, Loader2, ArrowLeft, Building2, GripVertical,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenantConfig } from '../context/TenantConfigContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const ADMIN_ROLES = ['ceo', 'director', 'admin', 'system admin', 'system_admin', 'tenant_admin'];

export default function PrintRequestSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasActionPermission } = useTenantConfig();
  const canManage = ADMIN_ROLES.includes((user?.role || '').trim().toLowerCase()) || hasActionPermission('print_request_statuses', 'view');

  const [statuses, setStatuses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  // status dialog
  const [stDialog, setStDialog] = useState(false);
  const [stEditing, setStEditing] = useState(null);
  const [stForm, setStForm] = useState({ name: '', color: '#94a3b8', order: 0, is_initial: false, is_terminal: false, is_active: true });
  const [savingSt, setSavingSt] = useState(false);

  // vendor dialog
  const [vnDialog, setVnDialog] = useState(false);
  const [vnEditing, setVnEditing] = useState(null);
  const [vnForm, setVnForm] = useState({ name: '', contact_person: '', phone: '', email: '', is_active: true });
  const [savingVn, setSavingVn] = useState(false);

  const [del, setDel] = useState(null); // { type, item }
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, v] = await Promise.all([
        axios.get(`${API}/print-request-statuses?include_inactive=true`, { headers: HEAD() }),
        axios.get(`${API}/print-vendors?include_inactive=true`, { headers: HEAD() }),
      ]);
      setStatuses(s.data?.statuses || []);
      setVendors(v.data?.vendors || []);
    } catch (e) {
      toast.error('Failed to load print settings');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (canManage) load(); }, [canManage, load]);

  // ── status handlers ──
  const openStCreate = () => { setStEditing(null); setStForm({ name: '', color: '#94a3b8', order: (statuses.length + 1), is_initial: false, is_terminal: false, is_active: true }); setStDialog(true); };
  const openStEdit = (s) => { setStEditing(s); setStForm({ name: s.name, color: s.color || '#94a3b8', order: s.order || 0, is_initial: !!s.is_initial, is_terminal: !!s.is_terminal, is_active: s.is_active !== false }); setStDialog(true); };
  const saveSt = async () => {
    if (!stForm.name.trim()) { toast.error('Name is required'); return; }
    setSavingSt(true);
    try {
      const payload = { ...stForm, name: stForm.name.trim(), order: Number(stForm.order) || 0 };
      if (stEditing) await axios.patch(`${API}/print-request-statuses/${stEditing.id}`, payload, { headers: HEAD() });
      else await axios.post(`${API}/print-request-statuses`, payload, { headers: HEAD() });
      toast.success('Status saved'); setStDialog(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save'); } finally { setSavingSt(false); }
  };
  const toggleStActive = async (s) => {
    try { await axios.patch(`${API}/print-request-statuses/${s.id}`, { is_active: !(s.is_active !== false) }, { headers: HEAD() }); load(); }
    catch (e) { toast.error('Failed to update'); }
  };

  // ── vendor handlers ──
  const openVnCreate = () => { setVnEditing(null); setVnForm({ name: '', contact_person: '', phone: '', email: '', is_active: true }); setVnDialog(true); };
  const openVnEdit = (v) => { setVnEditing(v); setVnForm({ name: v.name, contact_person: v.contact_person || '', phone: v.phone || '', email: v.email || '', is_active: v.is_active !== false }); setVnDialog(true); };
  const saveVn = async () => {
    if (!vnForm.name.trim()) { toast.error('Vendor name is required'); return; }
    setSavingVn(true);
    try {
      const payload = { ...vnForm, name: vnForm.name.trim() };
      if (vnEditing) await axios.patch(`${API}/print-vendors/${vnEditing.id}`, payload, { headers: HEAD() });
      else await axios.post(`${API}/print-vendors`, payload, { headers: HEAD() });
      toast.success('Vendor saved'); setVnDialog(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save'); } finally { setSavingVn(false); }
  };
  const toggleVnActive = async (v) => {
    try { await axios.patch(`${API}/print-vendors/${v.id}`, { is_active: !(v.is_active !== false) }, { headers: HEAD() }); load(); }
    catch (e) { toast.error('Failed to update'); }
  };

  const confirmDelete = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      const base = del.type === 'status' ? 'print-request-statuses' : 'print-vendors';
      await axios.delete(`${API}/${base}/${del.item.id}`, { headers: HEAD() });
      toast.success('Deleted'); setDel(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Could not delete'); } finally { setDeleting(false); }
  };

  if (!canManage) {
    return (
      <div className="p-6 max-w-3xl mx-auto" data-testid="print-settings-no-access">
        <Card className="border border-slate-200 rounded-xl"><CardContent className="p-10 text-center text-slate-500">You don&apos;t have permission to manage print settings.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6" data-testid="print-settings-page">
      <Button variant="ghost" size="sm" onClick={() => navigate('/print-requests')} data-testid="print-settings-back"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Print Requests</Button>

      <div className="flex items-start gap-3.5">
        <div className="hidden sm:flex h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white items-center justify-center shadow-md shadow-emerald-600/20 shrink-0"><Printer className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Print Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Configure the print request status flow and your print vendors.</p>
        </div>
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <Tabs defaultValue="statuses">
          <TabsList>
            <TabsTrigger value="statuses" data-testid="print-tab-statuses">Statuses</TabsTrigger>
            <TabsTrigger value="vendors" data-testid="print-tab-vendors">Vendors</TabsTrigger>
          </TabsList>

          {/* Statuses */}
          <TabsContent value="statuses" className="space-y-3 mt-4">
            <div className="flex justify-end">
              <Button onClick={openStCreate} className="bg-emerald-600 hover:bg-emerald-700" data-testid="print-add-status"><Plus className="h-4 w-4 mr-2" /> Add Status</Button>
            </div>
            <Card className="border border-slate-100 rounded-xl">
              <CardContent className="p-0 divide-y divide-slate-50">
                {statuses.map((s) => (
                  <div key={s.id} className={`flex items-center gap-3 p-3.5 ${s.is_active === false ? 'opacity-50' : ''}`} data-testid={`print-status-row-${s.id}`}>
                    <GripVertical className="h-4 w-4 text-slate-300 shrink-0" />
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{s.name}</span>
                        {s.is_initial && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200">Initial</Badge>}
                        {s.is_terminal && <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200">Terminal</Badge>}
                        {s.is_default && <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-400 border-slate-200">Default</Badge>}
                      </div>
                      <span className="text-[11px] text-slate-400">Order {s.order}</span>
                    </div>
                    <Switch checked={s.is_active !== false} onCheckedChange={() => toggleStActive(s)} data-testid={`print-status-active-${s.id}`} />
                    <Button variant="ghost" size="sm" onClick={() => openStEdit(s)} data-testid={`print-status-edit-${s.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDel({ type: 'status', item: s })} disabled={s.is_default} className="text-red-500 hover:text-red-700 hover:bg-red-50" title={s.is_default ? 'Default — deactivate instead' : 'Delete'} data-testid={`print-status-delete-${s.id}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Vendors */}
          <TabsContent value="vendors" className="space-y-3 mt-4">
            <div className="flex justify-end">
              <Button onClick={openVnCreate} className="bg-emerald-600 hover:bg-emerald-700" data-testid="print-add-vendor"><Plus className="h-4 w-4 mr-2" /> Add Vendor</Button>
            </div>
            <Card className="border border-slate-100 rounded-xl">
              <CardContent className="p-0 divide-y divide-slate-50">
                {vendors.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">No vendors yet. Add your print vendors here.</div>
                ) : vendors.map((v) => (
                  <div key={v.id} className={`flex items-center gap-3 p-3.5 ${v.is_active === false ? 'opacity-50' : ''}`} data-testid={`print-vendor-row-${v.id}`}>
                    <Building2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-slate-800">{v.name}</span>
                      <div className="text-[11px] text-slate-400">{[v.contact_person, v.phone, v.email].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    <Switch checked={v.is_active !== false} onCheckedChange={() => toggleVnActive(v)} data-testid={`print-vendor-active-${v.id}`} />
                    <Button variant="ghost" size="sm" onClick={() => openVnEdit(v)} data-testid={`print-vendor-edit-${v.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDel({ type: 'vendor', item: v })} className="text-red-500 hover:text-red-700 hover:bg-red-50" data-testid={`print-vendor-delete-${v.id}`}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Status dialog */}
      <Dialog open={stDialog} onOpenChange={(o) => { if (!o && !savingSt) setStDialog(false); }}>
        <DialogContent className="max-w-md" data-testid="print-status-dialog">
          <DialogHeader><DialogTitle>{stEditing ? 'Edit Status' : 'Add Status'}</DialogTitle><DialogDescription>Define a step in the print status flow.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5"><Label>Name</Label><Input value={stForm.name} onChange={(e) => setStForm({ ...stForm, name: e.target.value })} placeholder="e.g. Dispatched" data-testid="print-status-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Color</Label><Input type="color" value={stForm.color} onChange={(e) => setStForm({ ...stForm, color: e.target.value })} className="h-10 p-1" data-testid="print-status-color" /></div>
              <div className="space-y-1.5"><Label>Order</Label><Input type="number" value={stForm.order} onChange={(e) => setStForm({ ...stForm, order: e.target.value })} data-testid="print-status-order" /></div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"><Label className="text-sm">Initial status</Label><Switch checked={stForm.is_initial} onCheckedChange={(v) => setStForm({ ...stForm, is_initial: v })} /></div>
            <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"><Label className="text-sm">Terminal (final) status</Label><Switch checked={stForm.is_terminal} onCheckedChange={(v) => setStForm({ ...stForm, is_terminal: v })} /></div>
            <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"><Label className="text-sm">Active</Label><Switch checked={stForm.is_active} onCheckedChange={(v) => setStForm({ ...stForm, is_active: v })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStDialog(false)} disabled={savingSt}>Cancel</Button>
            <Button onClick={saveSt} disabled={savingSt} className="bg-emerald-600 hover:bg-emerald-700" data-testid="print-status-save">{savingSt ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor dialog */}
      <Dialog open={vnDialog} onOpenChange={(o) => { if (!o && !savingVn) setVnDialog(false); }}>
        <DialogContent className="max-w-md" data-testid="print-vendor-dialog">
          <DialogHeader><DialogTitle>{vnEditing ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle><DialogDescription>Print vendor contact details.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5"><Label>Vendor name</Label><Input value={vnForm.name} onChange={(e) => setVnForm({ ...vnForm, name: e.target.value })} placeholder="e.g. Acme Print House" data-testid="print-vendor-name" /></div>
            <div className="space-y-1.5"><Label>Contact person</Label><Input value={vnForm.contact_person} onChange={(e) => setVnForm({ ...vnForm, contact_person: e.target.value })} data-testid="print-vendor-contact" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Phone</Label><Input value={vnForm.phone} onChange={(e) => setVnForm({ ...vnForm, phone: e.target.value })} data-testid="print-vendor-phone" /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input value={vnForm.email} onChange={(e) => setVnForm({ ...vnForm, email: e.target.value })} data-testid="print-vendor-email" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVnDialog(false)} disabled={savingVn}>Cancel</Button>
            <Button onClick={saveVn} disabled={savingVn} className="bg-emerald-600 hover:bg-emerald-700" data-testid="print-vendor-save">{savingVn ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!del} onOpenChange={(o) => { if (!o && !deleting) setDel(null); }}>
        <DialogContent className="max-w-md" data-testid="print-settings-delete-dialog">
          <DialogHeader><DialogTitle>Delete &quot;{del?.item?.name}&quot;?</DialogTitle><DialogDescription>This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)} disabled={deleting}>Cancel</Button>
            <Button onClick={confirmDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700" data-testid="print-settings-delete-confirm">{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
