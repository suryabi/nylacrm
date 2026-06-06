import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Tag, Plus, Pencil, Trash2, Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const ADMIN_ROLES = ['ceo', 'director', 'admin', 'system admin', 'system_admin', 'tenant_admin'];
const EMPTY = { name: '', design_lead_time_days: 7, production_lead_time_days: 7, is_active: true };

export default function MarketingRequestTypeMasters() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes((user?.role || '').trim().toLowerCase());

  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = creating, else type being edited
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/marketing-request-types?include_inactive=true`, { headers: HEAD() });
      setTypes(data?.types || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load request types');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name || '',
      design_lead_time_days: t.design_lead_time_days ?? 0,
      production_lead_time_days: t.production_lead_time_days ?? 0,
      is_active: t.is_active !== false,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const payload = {
      name: form.name.trim(),
      design_lead_time_days: Number(form.design_lead_time_days) || 0,
      production_lead_time_days: Number(form.production_lead_time_days) || 0,
      is_active: !!form.is_active,
    };
    setSaving(true);
    try {
      if (editing) {
        await axios.patch(`${API}/marketing-request-types/${editing.id}`, payload, { headers: HEAD() });
        toast.success('Request type updated');
      } else {
        await axios.post(`${API}/marketing-request-types`, payload, { headers: HEAD() });
        toast.success('Request type added');
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  const toggleActive = async (t) => {
    try {
      await axios.patch(`${API}/marketing-request-types/${t.id}`, { is_active: !(t.is_active !== false) }, { headers: HEAD() });
      setTypes(prev => prev.map(x => x.id === t.id ? { ...x, is_active: !(t.is_active !== false) } : x));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update');
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/marketing-request-types/${toDelete.id}`, { headers: HEAD() });
      toast.success('Request type deleted');
      setToDelete(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not delete (seeded defaults can only be deactivated).');
    } finally { setDeleting(false); }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-3xl mx-auto" data-testid="mr-types-no-access">
        <Card className="border border-slate-200 rounded-xl">
          <CardContent className="p-10 text-center text-slate-500">
            You don't have permission to manage request types. Contact your administrator.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6" data-testid="mr-types-page">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/marketing-requests')} data-testid="mr-types-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Design Requests
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="hidden sm:flex h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Design Request Types</h1>
            <p className="text-sm text-slate-500 mt-1">Manage the request types and their default lead times used when raising a new design request.</p>
          </div>
        </div>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 shrink-0" data-testid="mr-types-add-btn">
          <Plus className="h-4 w-4 mr-2" /> Add Type
        </Button>
      </div>

      {/* List */}
      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)] overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
          ) : (
            <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100" data-testid="mr-types-mobile">
              {types.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No request types yet. Add your first one.</div>
              ) : types.map((t) => (
                <div key={t.id} className={`p-4 space-y-3 ${t.is_active === false ? 'opacity-60' : ''}`} data-testid={`mr-type-card-${t.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Tag className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span className="font-medium text-slate-800 truncate">{t.name}</span>
                      {t.is_default && <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200 shrink-0">Default</Badge>}
                    </div>
                    <Switch checked={t.is_active !== false} onCheckedChange={() => toggleActive(t)} data-testid={`mr-type-active-${t.id}`} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Design {t.design_lead_time_days}d · Production {t.production_lead_time_days}d</span>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEdit(t)} data-testid={`mr-type-edit-${t.id}`}>
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setToDelete(t)}
                        className="text-red-500 border-red-200 hover:text-red-700 hover:bg-red-50"
                        disabled={t.is_default}
                        data-testid={`mr-type-delete-${t.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Table for md+ */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                    <TableHead className="font-semibold text-xs sm:text-sm text-muted-foreground">Name</TableHead>
                    <TableHead className="font-semibold text-xs sm:text-sm text-muted-foreground">Design Lead (days)</TableHead>
                    <TableHead className="font-semibold text-xs sm:text-sm text-muted-foreground">Production Lead (days)</TableHead>
                    <TableHead className="font-semibold text-xs sm:text-sm text-muted-foreground">Active</TableHead>
                    <TableHead className="font-semibold text-xs sm:text-sm text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="p-12 text-center text-sm text-muted-foreground">No request types yet. Add your first one.</TableCell></TableRow>
                  ) : types.map((t) => (
                    <TableRow key={t.id} className={`border-b border-slate-50 ${t.is_active === false ? 'opacity-60' : ''}`} data-testid={`mr-type-row-${t.id}`}>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <Tag className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span className="font-medium text-slate-800">{t.name}</span>
                          {t.is_default && <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200">Default</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-600">{t.design_lead_time_days}d</TableCell>
                      <TableCell className="py-3 text-sm text-slate-600">{t.production_lead_time_days}d</TableCell>
                      <TableCell className="py-3">
                        <Switch checked={t.is_active !== false} onCheckedChange={() => toggleActive(t)} data-testid={`mr-type-active-table-${t.id}`} />
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(t)} data-testid={`mr-type-edit-table-${t.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setToDelete(t)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            disabled={t.is_default}
                            title={t.is_default ? 'Seeded defaults can only be deactivated' : 'Delete'}
                            data-testid={`mr-type-delete-table-${t.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o && !saving) setDialogOpen(false); }}>
        <DialogContent className="max-w-md" data-testid="mr-type-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Request Type' : 'Add Request Type'}</DialogTitle>
            <DialogDescription>Define the type name and its default lead times.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="rt-name">Name</Label>
              <Input id="rt-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Bottle Designs" data-testid="mr-type-name-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rt-design">Design lead (days)</Label>
                <Input id="rt-design" type="number" min={0} value={form.design_lead_time_days} onChange={(e) => setForm({ ...form, design_lead_time_days: e.target.value })} data-testid="mr-type-design-input" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rt-prod">Production lead (days)</Label>
                <Input id="rt-prod" type="number" min={0} value={form.production_lead_time_days} onChange={(e) => setForm({ ...form, production_lead_time_days: e.target.value })} data-testid="mr-type-prod-input" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
              <Label htmlFor="rt-active" className="text-sm text-slate-700">Active</Label>
              <Switch id="rt-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} data-testid="mr-type-active-toggle" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="mr-type-save-btn">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent data-testid="mr-type-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{toDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This request type will be permanently removed. Existing requests already using it are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700" data-testid="mr-type-delete-confirm">
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
