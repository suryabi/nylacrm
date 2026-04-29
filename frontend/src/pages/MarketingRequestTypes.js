import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Plus, Tag, Trash2, Edit3, Loader2, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const COLOR_OPTS = ['indigo', 'sky', 'amber', 'rose', 'emerald', 'violet', 'teal', 'slate'];

const COLOR_BADGE = {
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  sky: 'bg-sky-100 text-sky-700 border-sky-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  rose: 'bg-rose-100 text-rose-700 border-rose-200',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  violet: 'bg-violet-100 text-violet-700 border-violet-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function MarketingRequestTypes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/master-request-types`, { params: { include_inactive: true } });
      setRows(data || []);
    } catch { toast.error('Failed to load request types'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const onDelete = async (id) => {
    if (!window.confirm('Deactivate this request type? Existing requests using it remain unchanged.')) return;
    try {
      await axios.delete(`${API}/master-request-types/${id}`);
      toast.success('Request type deactivated');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Failed'); }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5" data-testid="mr-types-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Marketing Request Types</h1>
            <p className="text-xs sm:text-sm text-slate-500">Define the catalog of request types Sales can raise (Neck Tag, Standee, Video, …)</p>
          </div>
        </div>
        <Button onClick={() => setEdit({})} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-type-btn">
          <Plus className="h-4 w-4 mr-1.5" /> New Type
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <Tag className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No request types defined yet</p>
            <Button variant="outline" className="mt-4" onClick={() => setEdit({})} data-testid="empty-create-btn">
              <Plus className="h-4 w-4 mr-1.5" /> Create first type
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="mr-types-table">
            <thead className="bg-slate-50 border-b">
              <tr>
                {['Name', 'Default Priority', 'Default Due (days)', 'Sort', 'Active', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50" data-testid={`mr-type-row-${r.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={COLOR_BADGE[r.color] || COLOR_BADGE.indigo}>{r.name}</Badge>
                      {r.description && <span className="text-xs text-slate-400 truncate max-w-[280px]">{r.description}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-700">{r.default_priority || 'medium'}</td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums">{r.default_due_offset_days ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums">{r.sort_order ?? 0}</td>
                  <td className="px-4 py-3">
                    {r.is_active ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(r)} data-testid={`edit-${r.id}`}><Edit3 className="h-3.5 w-3.5" /></Button>
                    {r.is_active && <Button size="sm" variant="ghost" onClick={() => onDelete(r.id)} className="text-rose-600" data-testid={`del-${r.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {edit && <TypeEditor row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function TypeEditor({ row, onClose, onSaved }) {
  const isEdit = !!row?.id;
  const [form, setForm] = useState({
    name: row?.name || '',
    description: row?.description || '',
    default_priority: row?.default_priority || 'medium',
    default_due_offset_days: row?.default_due_offset_days ?? 7,
    color: row?.color || 'indigo',
    sort_order: row?.sort_order ?? 0,
    is_active: row?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, default_due_offset_days: parseInt(form.default_due_offset_days, 10) || 0, sort_order: parseInt(form.sort_order, 10) || 0 };
      if (isEdit) await axios.put(`${API}/master-request-types/${row.id}`, payload);
      else await axios.post(`${API}/master-request-types`, payload);
      toast.success(isEdit ? 'Type updated' : 'Type created');
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg" data-testid="type-editor">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'New'} Request Type</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Neck Tag Design" data-testid="type-form-name" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Default Priority</Label>
              <Select value={form.default_priority} onValueChange={(v) => setForm((p) => ({ ...p, default_priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Default Due Offset (days)</Label>
              <Input type="number" value={form.default_due_offset_days} onChange={(e) => setForm((p) => ({ ...p, default_due_offset_days: e.target.value }))} />
            </div>
            <div>
              <Label>Color</Label>
              <Select value={form.color} onValueChange={(v) => setForm((p) => ({ ...p, color: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLOR_OPTS.map((c) => <SelectItem key={c} value={c}><span className="capitalize">{c}</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
            <Label className="cursor-pointer" onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="type-form-submit">
            {saving ? 'Saving…' : (isEdit ? 'Save' : 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
