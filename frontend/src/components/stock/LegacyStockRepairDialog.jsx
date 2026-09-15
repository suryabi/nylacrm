import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Loader2, Wand2, History, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const fmt = (v) => Number(v || 0).toLocaleString('en-IN');

const BASIS_LABEL = {
  history: { text: 'from inbound history', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  latest_batch: { text: 'latest batch (no history)', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function BatchSelect({ row, value, onChange, extraBatches, onLoadAll }) {
  const options = useMemo(() => {
    const seen = new Set();
    const out = [];
    row.suggestions.forEach((s) => { if (!seen.has(s.batch_id)) { seen.add(s.batch_id); out.push({ ...s, group: 'history' }); } });
    (extraBatches || []).forEach((b) => { if (!seen.has(b.batch_id)) { seen.add(b.batch_id); out.push({ ...b, group: 'all' }); } });
    if (row.suggested_batch_id && !seen.has(row.suggested_batch_id)) {
      out.push({ batch_id: row.suggested_batch_id, batch_code: row.suggested_batch_code, production_date: null, group: 'all' });
    }
    return out;
  }, [row, extraBatches]);
  return (
    <div className="flex items-center gap-1.5">
      <select
        className="h-8 min-w-[190px] rounded-md border border-slate-300 bg-white px-2 text-xs"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        data-testid={`legacy-batch-select-${row.key}`}
      >
        <option value="">— pick a batch —</option>
        {options.map((o) => (
          <option key={o.batch_id} value={o.batch_id}>
            {o.batch_code}{o.production_date ? ` · ${o.production_date}` : ''}{o.group === 'history' ? ` · in: ${fmt(o.qty_in)}` : ''}
          </option>
        ))}
      </select>
      {!extraBatches && row.sku_batch_count > options.length && (
        <button type="button" className="text-[11px] text-sky-700 underline whitespace-nowrap" onClick={onLoadAll} data-testid={`legacy-load-all-${row.key}`}>
          all {row.sku_batch_count}
        </button>
      )}
    </div>
  );
}

export const LegacyStockRepairDialog = ({ open, onOpenChange, onApplied }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [picks, setPicks] = useState({});
  const [selected, setSelected] = useState({});
  const [allBatches, setAllBatches] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [view, setView] = useState('rows');
  const [history, setHistory] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/distributor/legacy-stock`, { headers: HEAD() });
      setData(res.data);
      const p = {}; const s = {};
      (res.data.rows || []).forEach((r) => { p[r.key] = r.suggested_batch_id || ''; s[r.key] = !!r.suggested_batch_id; });
      setPicks(p); setSelected(s);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load legacy stock');
    } finally { setLoading(false); }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/distributor/legacy-stock/history`, { headers: HEAD() });
      setHistory(res.data.logs || []);
    } catch (e) { setHistory([]); }
  }, []);

  useEffect(() => { if (open) { setLastResult(null); setView('rows'); load(); } }, [open, load]);

  const loadAllBatches = async (skuId) => {
    if (allBatches[skuId]) return;
    try {
      const res = await axios.get(`${API_URL}/api/distributor/legacy-stock/batches?sku_id=${skuId}`, { headers: HEAD() });
      setAllBatches((p) => ({ ...p, [skuId]: res.data.batches || [] }));
    } catch (e) { toast.error('Could not load batches for this SKU'); }
  };

  const rows = data?.rows || [];
  const plan = rows.filter((r) => selected[r.key] && picks[r.key]).map((r) => ({
    row: r,
    batch_id: picks[r.key],
    batch_code: [...r.suggestions, ...(allBatches[r.sku_id] || [])].find((b) => b.batch_id === picks[r.key])?.batch_code || r.suggested_batch_code || picks[r.key],
  }));
  const planUnits = plan.reduce((s, p) => s + p.row.quantity, 0);
  const allSelectable = rows.filter((r) => picks[r.key]);
  const allChecked = allSelectable.length > 0 && allSelectable.every((r) => selected[r.key]);

  const apply = async () => {
    setApplying(true);
    try {
      const res = await axios.post(`${API_URL}/api/distributor/legacy-stock/assign`, {
        assignments: plan.map((p) => ({ location_id: p.row.location_id, sku_id: p.row.sku_id, child_sku_id: p.row.child_sku_id || null, batch_id: p.batch_id })),
      }, { headers: HEAD() });
      setLastResult(res.data);
      if (res.data.failed) toast.warning(`${res.data.succeeded} assigned, ${res.data.failed} failed`);
      else toast.success(`${fmt(res.data.assigned_units)} units now carry a batch (${res.data.succeeded} row${res.data.succeeded === 1 ? '' : 's'})`);
      setConfirming(false);
      await load();
      onApplied?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Assignment failed');
    } finally { setApplying(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-hidden flex flex-col" data-testid="legacy-stock-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-rose-600" /> Legacy Stock Repair
            {data && <Badge variant="outline" className="ml-1 border-rose-200 bg-rose-50 text-rose-700" data-testid="legacy-stock-count">{rows.length} rows · {fmt(data.total_units)} units · {data.warehouses} warehouses</Badge>}
          </DialogTitle>
          <DialogDescription>
            Stock rows with no batch. The suggested batch comes from what was actually received at that warehouse (production transfers, stock-in, inbound transfers) — oldest first. Quantities never change; only the batch label moves.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b pb-2">
          <div className="flex gap-1">
            <Button size="sm" variant={view === 'rows' ? 'default' : 'ghost'} onClick={() => setView('rows')} data-testid="legacy-view-rows">Legacy rows</Button>
            <Button size="sm" variant={view === 'history' ? 'default' : 'ghost'} onClick={() => { setView('history'); loadHistory(); }} data-testid="legacy-view-history"><History className="h-4 w-4 mr-1" /> History</Button>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} data-testid="legacy-refresh-btn"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        </div>

        {lastResult?.results?.some((r) => !r.ok) && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700" data-testid="legacy-result-errors">
            {lastResult.results.filter((r) => !r.ok).map((r) => <div key={r.key}>{r.key.split('|')[1].slice(0, 8)}… — {r.error}</div>)}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {view === 'history' ? (
            history === null ? <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
              : history.length === 0 ? <div className="py-10 text-center text-sm text-slate-500" data-testid="legacy-history-empty">No batch assignments yet.</div>
                : (
                  <table className="w-full text-xs" data-testid="legacy-history-table">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr><th className="p-2 text-left">When</th><th className="p-2 text-left">Warehouse</th><th className="p-2 text-left">SKU</th><th className="p-2 text-left">Classification</th><th className="p-2 text-right">Units</th><th className="p-2 text-left">Batch</th><th className="p-2 text-left">By</th></tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="border-t">
                          <td className="p-2 whitespace-nowrap">{h.created_at ? new Date(h.created_at).toLocaleString() : '—'}</td>
                          <td className="p-2">{h.warehouse_name}</td><td className="p-2">{h.sku_name}</td>
                          <td className="p-2">{h.child_sku_name || 'Generic'}</td>
                          <td className="p-2 text-right font-mono">{fmt(h.quantity)}</td>
                          <td className="p-2 font-mono">{h.batch_code}</td><td className="p-2">{h.created_by_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
          ) : loading && !data ? (
            <div className="py-10 text-center text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Scanning warehouses…</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center" data-testid="legacy-stock-empty">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">No legacy stock — every stock row carries a batch.</p>
            </div>
          ) : (
            <table className="w-full text-xs" data-testid="legacy-stock-table">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2 w-8"><Checkbox checked={allChecked} onCheckedChange={(c) => { const s = {}; allSelectable.forEach((r) => { s[r.key] = !!c; }); setSelected((p) => ({ ...p, ...s })); }} data-testid="legacy-select-all" /></th>
                  <th className="p-2 text-left">Warehouse</th>
                  <th className="p-2 text-left">SKU</th>
                  <th className="p-2 text-left">Classification</th>
                  <th className="p-2 text-right">Units</th>
                  <th className="p-2 text-left">Assign to batch</th>
                  <th className="p-2 text-left">Basis</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const basis = BASIS_LABEL[r.suggestion_basis];
                  return (
                    <tr key={r.key} className="border-t hover:bg-slate-50" data-testid={`legacy-row-${r.key}`}>
                      <td className="p-2"><Checkbox checked={!!selected[r.key]} disabled={!picks[r.key]} onCheckedChange={(c) => setSelected((p) => ({ ...p, [r.key]: !!c }))} data-testid={`legacy-select-${r.key}`} /></td>
                      <td className="p-2">
                        <div className="font-medium text-slate-800">{r.location_name}</div>
                        <div className="text-[10px] text-slate-500">{r.is_factory ? 'Factory' : r.distributor_name || 'Distributor'}</div>
                      </td>
                      <td className="p-2 text-slate-800">{r.sku_name}</td>
                      <td className="p-2 text-slate-600">{r.child_sku_name}</td>
                      <td className="p-2 text-right font-mono font-semibold">{fmt(r.quantity)}</td>
                      <td className="p-2">
                        <BatchSelect row={r} value={picks[r.key]} extraBatches={allBatches[r.sku_id]}
                          onLoadAll={() => loadAllBatches(r.sku_id)}
                          onChange={(v) => { setPicks((p) => ({ ...p, [r.key]: v })); setSelected((p) => ({ ...p, [r.key]: !!v })); }} />
                      </td>
                      <td className="p-2">
                        {basis ? <Badge variant="outline" className={basis.cls}>{basis.text}</Badge>
                          : <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3 w-3" /> no batches for this SKU</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {view === 'rows' && rows.length > 0 && (
          <DialogFooter className="border-t pt-3 flex items-center sm:justify-between">
            <span className="text-xs text-slate-600" data-testid="legacy-plan-summary">{plan.length} row{plan.length === 1 ? '' : 's'} selected · {fmt(planUnits)} units</span>
            <Button onClick={() => setConfirming(true)} disabled={plan.length === 0} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="legacy-assign-btn">
              <Wand2 className="h-4 w-4 mr-1.5" /> Assign batches ({plan.length})
            </Button>
          </DialogFooter>
        )}

        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="legacy-confirm-dialog">
            <DialogHeader>
              <DialogTitle>Confirm batch assignment</DialogTitle>
              <DialogDescription>{plan.length} row{plan.length === 1 ? '' : 's'} · {fmt(planUnits)} units. Quantities stay the same; the rows below will carry these batch numbers.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 text-left">Warehouse</th><th className="p-2 text-left">SKU</th><th className="p-2 text-right">Units</th><th className="p-2 text-left">→ Batch</th></tr></thead>
                <tbody>
                  {plan.map((p) => (
                    <tr key={p.row.key} className="border-t">
                      <td className="p-2">{p.row.location_name}</td>
                      <td className="p-2">{p.row.sku_name}{p.row.child_sku_id ? ` · ${p.row.child_sku_name}` : ''}</td>
                      <td className="p-2 text-right font-mono">{fmt(p.row.quantity)}</td>
                      <td className="p-2 font-mono font-semibold text-emerald-700">{p.batch_code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={applying} data-testid="legacy-confirm-cancel">Cancel</Button>
              <Button onClick={apply} disabled={applying} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="legacy-confirm-apply">
                {applying ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Assigning…</> : `Assign ${fmt(planUnits)} units`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default LegacyStockRepairDialog;
