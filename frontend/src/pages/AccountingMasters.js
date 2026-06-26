import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown, Search, Loader2,
  Layers, Wallet, Building2, Target, Briefcase, CreditCard, Truck, Users,
  MapPin, BookMarked, CheckCircle2, FolderTree, CornerDownRight,
} from 'lucide-react';
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

const ICONS = {
  expense_type: Wallet, expense_category: FolderTree, department: Building2,
  cost_center: Target, project_business_unit: Briefcase, payment_source: CreditCard,
  vendor: Truck, employee: Users, city_location: MapPin, budget_head: BookMarked,
  approval_category: CheckCircle2,
};

export default function AccountingMasters() {
  const [types, setTypes] = useState([]);
  const [active, setActive] = useState('expense_type');
  const [items, setItems] = useState([]);
  const [hierarchical, setHierarchical] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [dialog, setDialog] = useState(null); // {mode, item, parent}
  const [confirmDel, setConfirmDel] = useState(null);

  const loadTypes = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/accounting/masters`, authHeaders());
      setTypes(data.types || []);
    } catch (e) { toast.error('Failed to load accounting masters'); }
  }, []);

  const loadItems = useCallback(async (type) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/accounting/masters/${type}`, authHeaders());
      setItems(data.items || []);
      setHierarchical(!!data.hierarchical);
    } catch (e) { toast.error('Failed to load records'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTypes(); }, [loadTypes]);
  useEffect(() => { loadItems(active); }, [active, loadItems]);

  const activeMeta = types.find((t) => t.key === active);
  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())
    || (i.code || '').toLowerCase().includes(search.toLowerCase()));

  const refresh = () => { loadItems(active); loadTypes(); };

  const onDelete = async () => {
    const it = confirmDel;
    try {
      await axios.delete(`${API}/api/accounting/masters/${active}/${it.id}`, authHeaders());
      toast.success(`Deleted "${it.name}"`);
      setConfirmDel(null); refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Delete failed'); }
  };

  // ── render flat table rows or recursive tree rows ──
  const renderTree = (parentId = null, depth = 0) => {
    const children = filtered.filter((i) => (i.parent_id || null) === parentId);
    return children.map((node) => {
      const kids = items.filter((i) => i.parent_id === node.id);
      const isOpen = expanded[node.id] !== false; // default open
      return (
        <React.Fragment key={node.id}>
          <div
            className="group flex items-center gap-2 border-b border-slate-100 py-2.5 pr-3 transition-colors hover:bg-slate-50"
            style={{ paddingLeft: `${12 + depth * 24}px` }}
            data-testid={`master-row-${node.id}`}
          >
            {kids.length > 0 ? (
              <button onClick={() => setExpanded((p) => ({ ...p, [node.id]: !isOpen }))} className="text-slate-400 hover:text-slate-700">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : <span className="inline-block w-4">{depth > 0 && <CornerDownRight className="h-3.5 w-3.5 text-slate-300" />}</span>}
            <div className="min-w-0 flex-1">
              <span className={`text-sm font-medium ${node.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{node.name}</span>
              {node.code && <span className="ml-2 text-xs text-slate-400">{node.code}</span>}
              {depth === 0 && <Badge variant="outline" className="ml-2 text-[10px]">L0</Badge>}
            </div>
            {!node.is_active && <Badge variant="outline" className="text-[10px] text-slate-400">Inactive</Badge>}
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" title="Add sub-item"
                onClick={() => setDialog({ mode: 'create', parent: node })} data-testid={`add-child-${node.id}`}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit"
                onClick={() => setDialog({ mode: 'edit', item: node })} data-testid={`edit-${node.id}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" title="Delete"
                onClick={() => setConfirmDel(node)} data-testid={`delete-${node.id}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {kids.length > 0 && isOpen && renderTree(node.id, depth + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="mx-auto max-w-7xl p-6" data-testid="accounting-masters-page">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Layers className="h-6 w-6 text-indigo-600" /> Accounting · Masters
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">Configure the master data that categorises every accounting transaction. Expense Categories support multi-level drill-down.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* Master type list */}
        <div className="rounded-xl border border-slate-200 bg-white p-2" data-testid="master-type-list">
          {types.map((t) => {
            const Icon = ICONS[t.key] || Layers;
            const on = t.key === active;
            return (
              <button key={t.key} onClick={() => { setActive(t.key); setSearch(''); }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${on ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                data-testid={`master-type-${t.key}`}>
                <Icon className={`h-4 w-4 ${on ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span className="flex-1 truncate">{t.label}</span>
                {t.hierarchical && <FolderTree className="h-3 w-3 text-slate-300" title="Multi-level" />}
                <Badge variant="outline" className="text-[10px]">{t.count}</Badge>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800">{activeMeta?.label}</h2>
              <p className="text-xs text-slate-400">{hierarchical ? 'Drill down to any depth — add sub-categories within each item.' : 'Single-level master list.'}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-44 pl-8" data-testid="master-search" />
              </div>
              <Button onClick={() => setDialog({ mode: 'create' })} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-master-btn">
                <Plus className="mr-1.5 h-4 w-4" /> Add {hierarchical ? 'Category' : ''}
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400" data-testid="master-empty">No records yet — click “Add” to create the first one.</div>
          ) : hierarchical ? (
            <div data-testid="master-tree">{renderTree(null, 0)}</div>
          ) : (
            <table className="w-full text-sm" data-testid="master-table">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="p-3 text-left font-medium">Name</th>
                  <th className="p-3 text-left font-medium">Code</th>
                  {active === 'vendor' && <th className="p-3 text-left font-medium">GSTIN</th>}
                  {active === 'vendor' && <th className="p-3 text-left font-medium">Contact</th>}
                  <th className="p-3 text-left font-medium">Description</th>
                  <th className="p-3 text-center font-medium">Status</th>
                  <th className="p-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.id} className="group border-b border-slate-100 hover:bg-slate-50" data-testid={`master-row-${it.id}`}>
                    <td className={`p-3 font-medium ${it.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{it.name}</td>
                    <td className="p-3 text-slate-500">{it.code || '—'}</td>
                    {active === 'vendor' && <td className="p-3 text-slate-500">{it.gstin || '—'}</td>}
                    {active === 'vendor' && <td className="p-3 text-slate-500">{it.email || it.phone || '—'}</td>}
                    <td className="p-3 text-slate-500">{it.description || '—'}</td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className={it.is_active ? 'border-emerald-200 text-emerald-700' : 'text-slate-400'}>{it.is_active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDialog({ mode: 'edit', item: it })} data-testid={`edit-${it.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => setConfirmDel(it)} data-testid={`delete-${it.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {dialog && (
        <MasterFormDialog
          masterType={active} masterLabel={activeMeta?.label} hierarchical={hierarchical}
          dialog={dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }}
        />
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent data-testid="delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDel?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This removes the master value. {hierarchical && 'Sub-items must be removed first.'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={onDelete} data-testid="confirm-delete-btn">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MasterFormDialog({ masterType, masterLabel, hierarchical, dialog, onClose, onSaved }) {
  const editing = dialog.mode === 'edit';
  const it = dialog.item || {};
  const [form, setForm] = useState({
    name: it.name || '', code: it.code || '', description: it.description || '',
    is_active: it.is_active !== false, gstin: it.gstin || '', email: it.email || '', phone: it.phone || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const body = { ...form };
      if (!editing && dialog.parent) body.parent_id = dialog.parent.id;
      if (editing) {
        await axios.patch(`${API}/api/accounting/masters/${masterType}/${it.id}`, body, authHeaders());
        toast.success('Updated');
      } else {
        await axios.post(`${API}/api/accounting/masters/${masterType}`, body, authHeaders());
        toast.success('Created');
      }
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="master-form-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit' : 'Add'} {masterLabel}</DialogTitle>
          <DialogDescription>
            {dialog.parent ? <>Adding a sub-item under <b>{dialog.parent.name}</b></>
              : hierarchical ? 'Creating a top-level category' : `Configure a ${masterLabel?.toLowerCase()} value`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus data-testid="form-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Code</Label>
              <Input value={form.code} onChange={(e) => set('code', e.target.value)} data-testid="form-code" />
            </div>
            <div className="flex items-end gap-2 pb-1.5">
              <Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} data-testid="form-active" />
              <Label className="text-xs text-slate-600">Active</Label>
            </div>
          </div>
          {masterType === 'vendor' && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">GSTIN</Label><Input value={form.gstin} onChange={(e) => set('gstin', e.target.value)} data-testid="form-gstin" /></div>
              <div><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
              <div className="col-span-2"><Label className="text-xs">Email</Label><Input value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
            </div>
          )}
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} data-testid="form-description" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="form-save-btn">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
