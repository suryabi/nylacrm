import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';
import { Plus, Edit2, Check, X, Trash2, RefreshCw, PackagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token') || localStorage.getItem('session_token') || ''}`,
});

const STATUS_STYLES = {
  draft: 'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
};

const todayISO = () => new Date().toISOString().split('T')[0];
const emptyForm = () => ({
  sku_id: '',
  quantity: '',
  batch_number: '',
  entry_date: todayISO(),
  remarks: '',
});

export default function StockEntriesTab({ distributorId, skus = [] }) {
  const { user } = useAuth();
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ draft: 0, confirmed: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const canManage = !!user && (
    ['CEO', 'Admin', 'System Admin', 'Distributor'].includes(user.role)
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const { data } = await axios.get(
        `${API_URL}/api/distributors/${distributorId}/manual-stock`,
        { headers: authHeaders(), params }
      );
      setEntries(data.entries || []);
      setSummary(data.summary || { draft: 0, confirmed: 0, cancelled: 0 });
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to load stock entries';
      // Suppress "self-managed only" toast — the tab is hidden in that case
      if (!String(detail).includes('self-managed')) toast.error(detail);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [distributorId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditingEntry(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (entry) => {
    setEditingEntry(entry);
    setForm({
      sku_id: entry.sku_id,
      quantity: String(entry.quantity),
      batch_number: entry.batch_number || '',
      entry_date: entry.entry_date || todayISO(),
      remarks: entry.remarks || '',
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.sku_id) { toast.error('Please pick an SKU'); return; }
    const q = Number(form.quantity);
    if (!Number.isFinite(q) || q <= 0) { toast.error('Quantity must be greater than zero'); return; }
    setSaving(true);
    try {
      const body = {
        sku_id: form.sku_id,
        quantity: q,
        batch_number: form.batch_number || null,
        entry_date: form.entry_date || todayISO(),
        remarks: form.remarks || null,
      };
      if (editingEntry) {
        await axios.put(
          `${API_URL}/api/distributors/${distributorId}/manual-stock/${editingEntry.id}`,
          body,
          { headers: authHeaders() }
        );
        toast.success('Entry updated');
      } else {
        await axios.post(
          `${API_URL}/api/distributors/${distributorId}/manual-stock`,
          body,
          { headers: authHeaders() }
        );
        toast.success('Stock entry created as Draft');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const confirmEntry = async (entry) => {
    try {
      await axios.post(
        `${API_URL}/api/distributors/${distributorId}/manual-stock/${entry.id}/confirm`,
        {},
        { headers: authHeaders() }
      );
      toast.success(`Stock confirmed — ${entry.quantity} units added`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to confirm');
    }
  };

  const deleteDraft = async (entry) => {
    if (!window.confirm(`Delete this draft entry for ${entry.sku_name}?`)) return;
    try {
      await axios.delete(
        `${API_URL}/api/distributors/${distributorId}/manual-stock/${entry.id}`,
        { headers: authHeaders() }
      );
      toast.success('Draft deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const runCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await axios.post(
        `${API_URL}/api/distributors/${distributorId}/manual-stock/${cancelTarget.id}/cancel`,
        { reason: cancelReason || null },
        { headers: authHeaders() }
      );
      toast.success(
        cancelTarget.status === 'confirmed'
          ? `Cancelled — ${cancelTarget.quantity} units reversed from stock`
          : 'Cancelled'
      );
      setCancelTarget(null);
      setCancelReason('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to cancel');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="stock-entries-tab">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-emerald-600" />
              Manual Stock Entries
            </CardTitle>
            <CardDescription>
              Record stock added to your default warehouse outside of factory shipments — for self-managed distributors only.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Refresh
            </Button>
            {canManage && (
              <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700" data-testid="add-stock-entry-btn">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Stock
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary tiles */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryTile label="Draft" value={summary.draft} color="amber" />
            <SummaryTile label="Confirmed" value={summary.confirmed} color="emerald" />
            <SummaryTile label="Cancelled" value={summary.cancelled} color="slate" />
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <Label className="text-sm">Show:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48" data-testid="stock-entries-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entries</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm" data-testid="stock-entries-table">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">SKU</th>
                  <th className="text-right p-3 font-medium">Qty</th>
                  <th className="text-left p-3 font-medium">Batch</th>
                  <th className="text-left p-3 font-medium">Remarks</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium w-48">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" className="p-8 text-center"><RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan="7" className="p-8 text-center text-muted-foreground">No stock entries yet. Click <strong>Add Stock</strong> to record your first entry.</td></tr>
                ) : entries.map((e, idx) => (
                  <tr key={e.id} className={`border-b ${idx % 2 === 1 ? 'bg-muted/20' : ''}`} data-testid={`entry-row-${e.id}`}>
                    <td className="p-3 text-muted-foreground">{e.entry_date}</td>
                    <td className="p-3">
                      <div className="font-medium">{e.sku_name}</div>
                      {e.sku_code && <div className="text-xs text-muted-foreground">{e.sku_code}</div>}
                    </td>
                    <td className="p-3 text-right tabular-nums font-semibold">{e.quantity}</td>
                    <td className="p-3 text-muted-foreground">{e.batch_number || '—'}</td>
                    <td className="p-3 text-muted-foreground max-w-xs truncate">{e.remarks || '—'}</td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className={STATUS_STYLES[e.status] || ''}>
                        {e.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          {e.status === 'draft' && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(e)} title="Edit">
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" onClick={() => confirmEntry(e)} className="bg-emerald-600 hover:bg-emerald-700 h-8" data-testid={`confirm-${e.id}`}>
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Confirm
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteDraft(e)} className="text-red-600" title="Delete draft">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {e.status === 'confirmed' && (
                            <Button size="sm" variant="outline" onClick={() => setCancelTarget(e)} className="text-amber-700" data-testid={`cancel-${e.id}`}>
                              <X className="h-3.5 w-3.5 mr-1" />
                              Cancel
                            </Button>
                          )}
                          {e.status === 'cancelled' && e.cancellation_reason && (
                            <span className="text-xs text-muted-foreground italic">{e.cancellation_reason}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" data-testid="stock-entry-dialog">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Edit Stock Entry' : 'Add Stock Entry'}</DialogTitle>
            <DialogDescription>
              Stock is added to your <strong>default warehouse</strong>. Save first as a Draft, then click Confirm to lock it in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm">SKU *</Label>
              <Select value={form.sku_id} onValueChange={(v) => setForm({ ...form, sku_id: v })}>
                <SelectTrigger data-testid="entry-sku-select"><SelectValue placeholder="Select SKU" /></SelectTrigger>
                <SelectContent>
                  {skus.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name || s.sku_name}{s.sku_code ? ` (${s.sku_code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Quantity *</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="e.g. 100"
                  data-testid="entry-qty"
                />
              </div>
              <div>
                <Label className="text-sm">Entry Date *</Label>
                <Input
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">Batch Number (optional)</Label>
              <Input
                value={form.batch_number}
                onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
                placeholder="e.g. BATCH-2026-001"
                data-testid="entry-batch"
              />
            </div>
            <div>
              <Label className="text-sm">Remarks (optional)</Label>
              <Textarea
                rows={2}
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="Source, vendor, internal reference…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="entry-save-btn">
              {saving ? 'Saving…' : (editingEntry ? 'Update' : 'Save as Draft')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) { setCancelTarget(null); setCancelReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel stock entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.status === 'confirmed' ? (
                <>This will <strong>reverse {cancelTarget.quantity} units of {cancelTarget?.sku_name}</strong> from your on-hand stock. The entry will be marked cancelled.</>
              ) : (
                <>This draft entry will be marked cancelled.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label className="text-sm">Reason (optional)</Label>
            <Textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why is this being cancelled?" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep entry</AlertDialogCancel>
            <AlertDialogAction onClick={runCancel} disabled={cancelling} className="bg-red-600 hover:bg-red-700">
              {cancelling ? 'Cancelling…' : 'Cancel entry'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryTile({ label, value, color }) {
  const colors = {
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[color]}`}>
      <p className="text-xs uppercase tracking-wide font-medium">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
