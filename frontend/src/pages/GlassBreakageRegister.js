import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { GlassWater, Plus, Download, ShieldCheck, Pencil, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const EMPTY_FORM = {
  incident_at: '', location: '', batch_id: '', batch_code: '', production_details: '',
  cause: '', quantity_quarantined: 0, quantity_rejected: 0,
  cleaning_undertaken: '', inspection_performed: '', corrective_action: '',
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('session_token')}`,
  'Content-Type': 'application/json',
});

const fmtDT = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function GlassBreakageRegister() {
  const [entries, setEntries] = useState([]);
  const [canRelease, setCanRelease] = useState(false);
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState(null);
  const [releaseRemarks, setReleaseRemarks] = useState('');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/production/glass-breakage`, { headers: authHeaders() });
      const data = await res.json();
      setEntries(data.entries || []);
      setCanRelease(!!data.can_qa_release);
    } catch (e) {
      toast.error('Failed to load register');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/production/batches`, { headers: authHeaders() });
        const data = await res.json();
        setBatches((data.batches || data || []).slice(0, 200));
      } catch { /* batch list optional */ }
    })();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, incident_at: new Date().toISOString().slice(0, 16) });
    setShowForm(true);
  };

  const openEdit = (e) => {
    setEditing(e);
    setForm({
      incident_at: (e.incident_at || '').slice(0, 16), location: e.location || '',
      batch_id: e.batch_id || '', batch_code: e.batch_code || '', production_details: e.production_details || '',
      cause: e.cause || '', quantity_quarantined: e.quantity_quarantined || 0, quantity_rejected: e.quantity_rejected || 0,
      cleaning_undertaken: e.cleaning_undertaken || '', inspection_performed: e.inspection_performed || '',
      corrective_action: e.corrective_action || '',
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.incident_at || !form.location.trim() || !form.cause.trim()) {
      toast.error('Date & time, location and cause are required');
      return;
    }
    setSaving(true);
    try {
      const url = editing
        ? `${API_URL}/api/production/glass-breakage/${editing.id}`
        : `${API_URL}/api/production/glass-breakage`;
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...form,
          quantity_quarantined: parseInt(form.quantity_quarantined) || 0,
          quantity_rejected: parseInt(form.quantity_rejected) || 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Save failed');
      toast.success(editing ? 'Entry updated' : 'Breakage recorded');
      setShowForm(false);
      fetchEntries();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const doRelease = async () => {
    try {
      const res = await fetch(`${API_URL}/api/production/glass-breakage/${releaseTarget.id}/qa-release`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ remarks: releaseRemarks || null }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Release failed');
      toast.success('QA release authorized');
      setReleaseTarget(null);
      setReleaseRemarks('');
      fetchEntries();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const doDelete = async (entry) => {
    if (!window.confirm(`Delete register entry ${entry.register_no}?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/production/glass-breakage/${entry.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json()).detail || 'Delete failed');
      toast.success('Entry deleted');
      fetchEntries();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const doExport = async () => {
    try {
      const res = await fetch(`${API_URL}/api/production/glass-breakage/export`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'glass_breakage_register.xlsx';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const open = entries.filter((e) => e.status !== 'released');
  const totalRejected = entries.reduce((s, e) => s + (e.quantity_rejected || 0), 0);
  const totalQuarantined = entries.reduce((s, e) => s + (e.quantity_quarantined || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="glass-breakage-page">
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-50 to-sky-100 dark:from-cyan-950/40 dark:to-sky-900/30">
              <GlassWater className="h-6 w-6 text-cyan-700 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Glass Breakage Register</h1>
              <p className="text-muted-foreground">Record, investigate and QA-release every glass breakage incident</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={doExport} data-testid="gbr-export-btn">
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
            <Button onClick={openNew} data-testid="gbr-new-btn">
              <Plus className="w-4 h-4 mr-2" /> Record Breakage
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Incidents', value: entries.length, testid: 'gbr-stat-total' },
            { label: 'Pending QA Release', value: open.length, testid: 'gbr-stat-open' },
            { label: 'Bottles Quarantined', value: totalQuarantined, testid: 'gbr-stat-quarantined' },
            { label: 'Bottles Rejected', value: totalRejected, testid: 'gbr-stat-rejected' },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className="text-2xl font-bold tabular-nums" data-testid={s.testid}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading register…
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="gbr-empty">
                <GlassWater className="h-10 w-10 mx-auto mb-3 opacity-40" />
                No breakage incidents recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="gbr-table">
                  <thead>
                    <tr className="border-b bg-slate-50 dark:bg-slate-900/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Reg No</th>
                      <th className="px-4 py-3">Date & Time</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Batch / Production</th>
                      <th className="px-4 py-3">Cause</th>
                      <th className="px-4 py-3 text-right">Quarantined</th>
                      <th className="px-4 py-3 text-right">Rejected</th>
                      <th className="px-4 py-3">Cleaning</th>
                      <th className="px-4 py-3">Inspection</th>
                      <th className="px-4 py-3">Corrective Action</th>
                      <th className="px-4 py-3">QA Release</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-b hover:bg-slate-50/60 dark:hover:bg-slate-900/40 align-top" data-testid={`gbr-row-${e.register_no}`}>
                        <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">{e.register_no}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{fmtDT(e.incident_at)}</td>
                        <td className="px-4 py-3">{e.location}</td>
                        <td className="px-4 py-3">
                          {e.batch_code && <span className="font-mono text-xs font-semibold">{e.batch_code}</span>}
                          {e.production_details && <p className="text-xs text-muted-foreground max-w-[180px]">{e.production_details}</p>}
                          {!e.batch_code && !e.production_details && '—'}
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">{e.cause}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{e.quantity_quarantined || 0}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{e.quantity_rejected || 0}</td>
                        <td className="px-4 py-3 max-w-[180px] text-xs">{e.cleaning_undertaken || '—'}</td>
                        <td className="px-4 py-3 max-w-[180px] text-xs">{e.inspection_performed || '—'}</td>
                        <td className="px-4 py-3 max-w-[180px] text-xs">{e.corrective_action || '—'}</td>
                        <td className="px-4 py-3">
                          {e.status === 'released' ? (
                            <div>
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200" data-testid={`gbr-released-${e.register_no}`}>
                                <ShieldCheck className="h-3 w-3 mr-1" /> Released
                              </Badge>
                              <p className="text-[11px] text-muted-foreground mt-1">
                                {e.qa_release?.authorized_by_name}<br />{fmtDT(e.qa_release?.authorized_at)}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                                <AlertTriangle className="h-3 w-3 mr-1" /> Pending
                              </Badge>
                              {canRelease && (
                                <Button size="sm" variant="outline" className="h-7 text-xs block"
                                  onClick={() => setReleaseTarget(e)} data-testid={`gbr-release-btn-${e.register_no}`}>
                                  <ShieldCheck className="h-3 w-3 mr-1" /> Authorize
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(e)} data-testid={`gbr-edit-${e.register_no}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {canRelease && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => doDelete(e)} data-testid={`gbr-delete-${e.register_no}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="gbr-form-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.register_no}` : 'Record Glass Breakage'}</DialogTitle>
            <DialogDescription>Log the incident with cleaning, inspection and corrective action details.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Date & Time *</Label>
              <Input type="datetime-local" value={form.incident_at} onChange={(e) => setField('incident_at', e.target.value)} className="mt-1" data-testid="gbr-input-datetime" />
            </div>
            <div>
              <Label>Location *</Label>
              <Input placeholder="e.g. Bottling Line A, Warehouse Bay 2" value={form.location} onChange={(e) => setField('location', e.target.value)} className="mt-1" data-testid="gbr-input-location" />
            </div>
            <div>
              <Label>Production Batch</Label>
              <select
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.batch_id}
                onChange={(e) => {
                  const b = batches.find((x) => x.id === e.target.value);
                  setField('batch_id', e.target.value);
                  setField('batch_code', b?.batch_code || '');
                }}
                data-testid="gbr-input-batch"
              >
                <option value="">— No specific batch —</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.batch_code} {b.sku_name ? `· ${b.sku_name}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Production Details</Label>
              <Input placeholder="Shift, line, SKU etc." value={form.production_details} onChange={(e) => setField('production_details', e.target.value)} className="mt-1" data-testid="gbr-input-details" />
            </div>
            <div className="sm:col-span-2">
              <Label>Cause of Breakage *</Label>
              <Textarea rows={2} placeholder="What caused the breakage?" value={form.cause} onChange={(e) => setField('cause', e.target.value)} className="mt-1" data-testid="gbr-input-cause" />
            </div>
            <div>
              <Label>Quantity Quarantined</Label>
              <Input type="number" min="0" value={form.quantity_quarantined} onChange={(e) => setField('quantity_quarantined', e.target.value)} className="mt-1" data-testid="gbr-input-quarantined" />
            </div>
            <div>
              <Label>Quantity Rejected</Label>
              <Input type="number" min="0" value={form.quantity_rejected} onChange={(e) => setField('quantity_rejected', e.target.value)} className="mt-1" data-testid="gbr-input-rejected" />
            </div>
            <div className="sm:col-span-2">
              <Label>Cleaning Undertaken</Label>
              <Textarea rows={2} placeholder="Describe the clean-down performed" value={form.cleaning_undertaken} onChange={(e) => setField('cleaning_undertaken', e.target.value)} className="mt-1" data-testid="gbr-input-cleaning" />
            </div>
            <div className="sm:col-span-2">
              <Label>Inspection Performed</Label>
              <Textarea rows={2} placeholder="Area/equipment inspection details" value={form.inspection_performed} onChange={(e) => setField('inspection_performed', e.target.value)} className="mt-1" data-testid="gbr-input-inspection" />
            </div>
            <div className="sm:col-span-2">
              <Label>Corrective Action</Label>
              <Textarea rows={2} placeholder="Action taken to prevent recurrence" value={form.corrective_action} onChange={(e) => setField('corrective_action', e.target.value)} className="mt-1" data-testid="gbr-input-corrective" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} data-testid="gbr-save-btn">{saving ? 'Saving…' : editing ? 'Update Entry' : 'Record Entry'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QA Release dialog */}
      <Dialog open={!!releaseTarget} onOpenChange={(o) => !o && setReleaseTarget(null)}>
        <DialogContent className="sm:max-w-md" data-testid="gbr-release-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /> QA Release Authorization</DialogTitle>
            <DialogDescription>
              Authorize release for {releaseTarget?.register_no} — confirms cleaning, inspection and corrective action are satisfactory. Recorded under your name.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Remarks (optional)</Label>
            <Textarea rows={2} value={releaseRemarks} onChange={(e) => setReleaseRemarks(e.target.value)} className="mt-1" data-testid="gbr-release-remarks" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseTarget(null)}>Cancel</Button>
            <Button onClick={doRelease} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="gbr-release-confirm-btn">Authorize Release</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
