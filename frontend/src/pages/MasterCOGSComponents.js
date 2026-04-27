import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Plus, Trash2, Pencil, Calculator, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import AppBreadcrumb from '../components/AppBreadcrumb';
import { useAuth } from '../context/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const EDIT_ROLES = ['system admin', 'ceo', 'director'];
const slug = (s) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export default function MasterCOGSComponents() {
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const canEdit = EDIT_ROLES.includes(role);

  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [form, setForm] = useState({ label: '', unit: 'rupee', sort_order: 99, is_active: true });
  const [keyOverride, setKeyOverride] = useState(''); // optional explicit key

  const headers = useMemo(() => {
    const t = localStorage.getItem('token');
    return { Authorization: `Bearer ${t}` };
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/master/cogs-components`, { headers });
      setComponents(res.data.components || []);
    } catch (err) {
      toast.error('Failed to load COGS components');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const openCreate = () => {
    setEditing(null);
    setForm({ label: '', unit: 'rupee', sort_order: (components.length + 1), is_active: true });
    setKeyOverride('');
    setShowDialog(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({ label: c.label, unit: c.unit, sort_order: c.sort_order, is_active: c.is_active });
    setKeyOverride(c.key);
    setShowDialog(true);
  };

  const submit = async () => {
    if (!form.label.trim()) {
      toast.error('Label is required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${API}/master/cogs-components/${editing.id}`,
          { label: form.label, sort_order: Number(form.sort_order) || 99, is_active: form.is_active },
          { headers });
        toast.success('Component updated');
      } else {
        const key = (keyOverride || slug(form.label)) || `comp_${Date.now()}`;
        await axios.post(`${API}/master/cogs-components`,
          { key, label: form.label, unit: form.unit, sort_order: Number(form.sort_order) || 99, is_active: form.is_active },
          { headers });
        toast.success('Component added');
      }
      setShowDialog(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c) => {
    if (!canEdit) return;
    try {
      await axios.put(`${API}/master/cogs-components/${c.id}`, { is_active: !c.is_active }, { headers });
      load();
    } catch (err) {
      toast.error('Toggle failed');
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await axios.delete(`${API}/master/cogs-components/${confirmDelete.id}`, { headers });
      toast.success(`Deleted "${confirmDelete.label}"`);
      setConfirmDelete(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Delete failed');
    }
  };

  const activeCount = components.filter((c) => c.is_active).length;
  const rupeeCount = components.filter((c) => c.is_active && c.unit === 'rupee').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6" data-testid="master-cogs-components-page">
      <AppBreadcrumb />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
            <Calculator className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">
              COGS Components
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Configure which input columns appear in the COGS Calculator. Sum of active ₹ components = Total COGS.
            </p>
          </div>
        </div>
        {canEdit && (
          <Button onClick={openCreate} data-testid="add-component-btn" className="gap-2">
            <Plus className="h-4 w-4" /> Add Component
          </Button>
        )}
      </div>

      {/* Compact tile (matches GOP tile aesthetic) */}
      <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm">
        <div className="shrink-0 h-9 w-9 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600">
          <Calculator className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Active Components</p>
          <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5">
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{activeCount}</span>
            <span className="text-muted-foreground"> active</span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{rupeeCount}</span>
            <span className="text-muted-foreground"> contribute to Total COGS (₹)</span>
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="w-24">Unit</TableHead>
                <TableHead className="w-32 text-center">In Total COGS</TableHead>
                <TableHead className="w-32 text-center">Active</TableHead>
                {canEdit && <TableHead className="w-32 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canEdit ? 7 : 6} className="text-center py-12 text-muted-foreground italic">
                    No components yet — defaults will load on first refresh.
                  </TableCell>
                </TableRow>
              ) : (
                components.map((c) => (
                  <TableRow key={c.id} data-testid={`component-row-${c.key}`} className={c.is_active ? '' : 'opacity-60'}>
                    <TableCell className="text-muted-foreground tabular-nums">{c.sort_order}</TableCell>
                    <TableCell className="font-medium">
                      {c.label}
                      {c.is_system && (
                        <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 align-middle">
                          system
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.key}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        c.unit === 'rupee'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70 dark:bg-emerald-900/20 dark:text-emerald-400'
                          : 'bg-amber-50 text-amber-700 border border-amber-200/70 dark:bg-amber-900/20 dark:text-amber-400'
                      }`}>
                        {c.unit === 'rupee' ? '₹' : '%'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {c.unit === 'rupee' && c.is_active ? (
                        <span className="text-emerald-600 text-sm font-medium">Yes</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={c.is_active}
                        onCheckedChange={() => toggleActive(c)}
                        disabled={!canEdit}
                        data-testid={`toggle-active-${c.key}`}
                      />
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(c)} data-testid={`edit-${c.key}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:text-rose-700"
                            onClick={() => setConfirmDelete(c)}
                            disabled={c.is_system}
                            title={c.is_system ? 'System components cannot be deleted (toggle Active off instead)' : 'Delete'}
                            data-testid={`delete-${c.key}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Component' : 'Add COGS Component'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update label, sort order, or active status.'
                : 'New components show up as editable columns in the COGS Calculator.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Label *</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Quality Testing Cost"
                data-testid="component-label-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))} disabled={!!editing}>
                  <SelectTrigger data-testid="component-unit-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rupee">₹ Amount (contributes to Total COGS)</SelectItem>
                    <SelectItem value="percent">% Percentage</SelectItem>
                  </SelectContent>
                </Select>
                {editing && <p className="text-[10px] text-muted-foreground">Unit can't be changed after creation.</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  data-testid="component-sort-input"
                />
              </div>
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label>Key (auto-generated from label)</Label>
                <Input
                  value={keyOverride || slug(form.label)}
                  onChange={(e) => setKeyOverride(e.target.value)}
                  placeholder={slug(form.label) || 'unique_key'}
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">Used as the field name in the COGS Calculator. Must be unique.</p>
              </div>
            )}
            <label className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <span className="text-sm">Active (visible in COGS Calculator)</span>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} data-testid="component-save-btn">
              {saving ? 'Saving…' : editing ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmDelete?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The column and any saved values for this component will be removed everywhere. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-rose-600 hover:bg-rose-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
