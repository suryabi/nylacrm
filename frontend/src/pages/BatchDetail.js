import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import {
  ArrowLeft, Package, Calendar, Boxes,
  Loader2, FlaskConical, Paintbrush, ShieldCheck,
  Trash2, MoveRight, ClipboardCheck,
  Clock, User, AlertTriangle, ChevronDown, ChevronUp, Plus, Send,
} from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';

const API = process.env.REACT_APP_BACKEND_URL + '/api';
function hdrs() {
  return { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

const STATUS_MAP = {
  created: { label: 'Created', cls: 'bg-slate-100 text-slate-600' },
  in_qc: { label: 'In QC', cls: 'bg-blue-50 text-blue-700' },
  in_labeling: { label: 'Labeling', cls: 'bg-violet-50 text-violet-700' },
  in_final_qc: { label: 'Final QC', cls: 'bg-amber-50 text-amber-700' },
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700' },
};

/* pH color helper */
function phColor(v) {
  if (v <= 7) return { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' };
  if (v <= 8) return { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' };
  return { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' };
}

export default function BatchDetail() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);
  const [history, setHistory] = useState({ timeline: [] });
  const [rejectionReasons, setRejectionReasons] = useState([]);
  const [qcTeam, setQcTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showRejections, setShowRejections] = useState(false);
  const [rejFilter, setRejFilter] = useState({ resource: '', date: '', reason: '', stage: '' });

  const fetchBatch = useCallback(async () => {
    try {
      const h = hdrs();
      const [bRes, hRes, rrRes, qtRes] = await Promise.allSettled([
        axios.get(`${API}/production/batches/${batchId}`, { headers: h }),
        axios.get(`${API}/production/batches/${batchId}/history`, { headers: h }),
        axios.get(`${API}/production/rejection-reasons`, { headers: h }),
        axios.get(`${API}/production/qc-team`, { headers: h }),
      ]);
      if (bRes.status === 'fulfilled') setBatch(bRes.value.data);
      else { toast.error('Batch not found'); navigate('/production-batches'); return; }
      if (hRes.status === 'fulfilled') setHistory(hRes.value.data);
      if (rrRes.status === 'fulfilled') setRejectionReasons(rrRes.value.data);
      if (qtRes.status === 'fulfilled') setQcTeam(qtRes.value.data);
    } finally { setLoading(false); }
  }, [batchId, navigate]);

  useEffect(() => { fetchBatch(); }, [fetchBatch]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this batch?')) return;
    try {
      await axios.delete(`${API}/production/batches/${batchId}`, { headers: hdrs() });
      toast.success('Batch deleted');
      navigate('/production-batches');
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed to delete'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  if (!batch) return null;

  const st = STATUS_MAP[batch.status] || STATUS_MAP.created;
  const stages = (batch.qc_stages || []).sort((a, b) => a.order - b.order);
  const balances = batch.stage_balances || {};
  const totalBottles = batch.total_bottles || 0;
  const totalRej = batch.total_rejected || 0;
  const rejPct = totalBottles > 0 ? ((totalRej / totalBottles) * 100).toFixed(1) : '0.0';
  const passPct = totalBottles > 0 ? (((totalBottles - totalRej) / totalBottles) * 100).toFixed(1) : '100.0';

  // Build rejection entries
  const rejEntries = [];
  (history.inspections || []).filter(i => i.qty_rejected > 0).forEach(i => {
    const entries = i.entries || [];
    if (entries.length > 0) {
      entries.forEach(entry => {
        (entry.rejections || []).filter(r => r.qty_rejected > 0).forEach(r => {
          rejEntries.push({ resource_name: entry.resource_name, date: entry.date, qty_inspected: entry.qty_inspected, qty_rejected: r.qty_rejected, reason: r.reason, stage_name: i.stage_name });
        });
      });
    } else {
      const rejs = i.rejections || [];
      if (rejs.length > 0) {
        rejs.filter(r => r.qty_rejected > 0).forEach(r => {
          rejEntries.push({ resource_name: r.resource_name, date: r.date, qty_inspected: r.qty_inspected || i.qty_inspected, qty_rejected: r.qty_rejected, reason: r.reason || '', stage_name: i.stage_name });
        });
      } else if (i.qty_rejected > 0) {
        rejEntries.push({ resource_name: i.inspected_by_name, date: (i.inspected_at || '').slice(0, 10), qty_inspected: i.qty_inspected, qty_rejected: i.qty_rejected, reason: i.rejection_reason || '', stage_name: i.stage_name });
      }
    }
  });

  const byResource = {}, byReason = {}, byStage = {};
  const uniqueDates = new Set(), uniqueResources = new Set(), uniqueReasons = new Set(), uniqueStages = new Set();
  rejEntries.forEach(e => {
    byResource[e.resource_name] = (byResource[e.resource_name] || 0) + e.qty_rejected;
    byReason[e.reason] = (byReason[e.reason] || 0) + e.qty_rejected;
    byStage[e.stage_name] = (byStage[e.stage_name] || 0) + e.qty_rejected;
    if (e.date) uniqueDates.add(e.date);
    if (e.resource_name) uniqueResources.add(e.resource_name);
    if (e.reason) uniqueReasons.add(e.reason);
    if (e.stage_name) uniqueStages.add(e.stage_name);
  });
  const topResource = Object.entries(byResource).sort((a, b) => b[1] - a[1]);
  const topReason = Object.entries(byReason).sort((a, b) => b[1] - a[1]);

  const filtered = rejEntries.filter(e => {
    if (rejFilter.resource && e.resource_name !== rejFilter.resource) return false;
    if (rejFilter.date && e.date !== rejFilter.date) return false;
    if (rejFilter.reason && e.reason !== rejFilter.reason) return false;
    if (rejFilter.stage && e.stage_name !== rejFilter.stage) return false;
    return true;
  });
  const filteredTotal = filtered.reduce((s, e) => s + (e.qty_rejected || 0), 0);
  const bpc = batch.bottles_per_crate || 1;
  const ph = batch.ph_value ? phColor(batch.ph_value) : null;

  return (
    <div className="p-3 sm:p-5 lg:p-6 max-w-[1600px] mx-auto space-y-3" data-testid="batch-detail-page">
      <Breadcrumbs items={[
        { label: 'Production', href: '/production' },
        { label: 'Batches', href: '/production-batches' },
        { label: batch.batch_code || 'Detail' },
      ]} />

      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/production-batches')} className="p-1.5 hover:bg-slate-100 rounded-md" data-testid="back-btn">
          <ArrowLeft size={16} className="text-slate-500" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">{batch.batch_code}</h1>
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
          {ph && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${ph.bg} ${ph.text}`} data-testid="ph-badge">
              <span className={`w-1.5 h-1.5 rounded-full ${ph.dot}`} />
              pH {batch.ph_value}
            </span>
          )}
          <span className="text-xs text-slate-400 truncate">{batch.sku_name}</span>
        </div>
        {batch.status === 'created' && (
          <button onClick={handleDelete} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md" data-testid="delete-batch-btn">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* ── Compact Info Row ── */}
      <div className="flex items-center gap-1 text-xs overflow-x-auto pb-1" data-testid="batch-info-row">
        {[
          { icon: Calendar, label: batch.production_date },
          { icon: Boxes, label: `${batch.total_crates?.toLocaleString()} crates` },
          { icon: Package, label: `${bpc} b/c` },
          { icon: Package, label: `${totalBottles.toLocaleString()} bottles` },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md whitespace-nowrap">
            <item.icon size={11} className="text-slate-400 flex-shrink-0" />
            <span className="text-slate-700 font-medium">{item.label}</span>
          </div>
        ))}
        {(batch.unallocated_crates || 0) > 0 && (
          <div className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-md whitespace-nowrap">
            <Boxes size={11} className="text-amber-500 flex-shrink-0" />
            <span className="text-amber-700 font-medium">{batch.unallocated_crates} unallocated</span>
          </div>
        )}
      </div>

      {/* ── Overall Quality Slim Bar ── */}
      {totalBottles > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-md" data-testid="overall-pass-reject-bar">
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider whitespace-nowrap">Quality</span>
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${passPct}%` }} />
            <div className="bg-red-400 h-full transition-all" style={{ width: `${rejPct}%` }} />
          </div>
          <span className="text-[10px] font-semibold text-emerald-600 whitespace-nowrap">{passPct}%</span>
          <span className="text-[10px] text-slate-300">|</span>
          <span className="text-[10px] font-semibold text-red-500 whitespace-nowrap">{rejPct}% rej</span>
          <span className="text-[10px] text-slate-300">|</span>
          <span className="text-[10px] text-slate-400 whitespace-nowrap">{totalRej} / {totalBottles.toLocaleString()}</span>
        </div>
      )}

      {/* ── Two-Column: Stages (Left) + Rejection/Activity (Right) ── */}
      {stages.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* LEFT: QC Pipeline + Summary */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-2">
            {/* Summary chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-md">
                <span className="text-[10px] text-slate-400">Unalloc</span>
                <span className="text-xs font-bold text-slate-700">{batch.unallocated_crates || 0}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-red-200 rounded-md">
                <span className="text-[10px] text-red-400">Rejected</span>
                <span className="text-xs font-bold text-red-600">{totalRej}</span>
                {totalBottles > 0 && <span className="text-[10px] text-red-400">({rejPct}%)</span>}
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-emerald-200 rounded-md">
                <span className="text-[10px] text-emerald-400">Warehouse Ready</span>
                <span className="text-xs font-bold text-emerald-600">{batch.total_passed_final || 0}</span>
                {(batch.transferred_to_warehouse || 0) > 0 && <span className="text-[10px] text-slate-400">({batch.transferred_to_warehouse} moved)</span>}
              </div>
            </div>

            {/* Stage Cards */}
            {stages.map((stage, idx) => {
              const bal = balances[stage.id] || {};
              const isFirst = idx === 0;
              const prevStage = idx > 0 ? stages[idx - 1] : null;
              const prevBal = prevStage ? (balances[prevStage.id] || {}) : null;
              const canReceive = isFirst ? (batch.unallocated_crates || 0) > 0 : (prevBal?.passed || 0) > 0;
              const canInspect = (bal.pending || 0) > 0;
              return (
                <StageCard key={stage.id} stage={stage} bal={bal} isFirst={isFirst}
                  canReceive={canReceive} canInspect={canInspect}
                  sourceLabel={isFirst ? 'Unallocated' : prevStage?.name}
                  sourceQty={isFirst ? (batch.unallocated_crates || 0) : (prevBal?.passed || 0)}
                  batchId={batchId} bottlesPerCrate={bpc}
                  rejectionReasons={rejectionReasons} qcTeam={qcTeam} onUpdate={fetchBatch} />
              );
            })}
          </div>

          {/* RIGHT: Rejection Summary + Activity */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-2">
            {/* Rejection Summary */}
            {rejEntries.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-md" data-testid="rejection-summary-section">
                <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={13} className="text-red-500" />
                    <span className="text-xs font-semibold text-slate-800">Rejections</span>
                    <span className="text-[10px] text-slate-400">{rejEntries.length} records</span>
                  </div>
                  <span className="text-sm font-bold text-red-600" data-testid="rej-metric-total">{totalRej}</span>
                </div>

                {/* Compact breakdown */}
                <div className="px-3 py-2 space-y-2 border-b border-slate-100">
                  {topResource.length > 0 && (
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">By Resource</span>
                      <div className="mt-1 space-y-1">
                        {topResource.slice(0, 3).map(([name, count], i) => (
                          <div key={i} className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-600 truncate mr-2">{name}</span>
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-red-400 rounded-full" style={{ width: `${(count / totalRej) * 100}%` }} />
                              </div>
                              <span className="text-red-600 font-semibold tabular-nums w-6 text-right">{count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {topReason.length > 0 && (
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">By Reason</span>
                      <div className="mt-1 space-y-1">
                        {topReason.slice(0, 3).map(([name, count], i) => (
                          <div key={i} className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-600 truncate mr-2">{name}</span>
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(count / totalRej) * 100}%` }} />
                              </div>
                              <span className="text-amber-600 font-semibold tabular-nums w-6 text-right">{count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Expandable detail */}
                <button onClick={() => setShowRejections(!showRejections)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                  data-testid="toggle-rejections">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Detail View</span>
                  {showRejections ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
                </button>

                {showRejections && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="grid grid-cols-2 gap-1.5" data-testid="rej-filters">
                      <Select value={rejFilter.resource || ""} onValueChange={v => setRejFilter(p => ({ ...p, resource: v === "__all__" ? "" : v }))}>
                        <SelectTrigger className="h-7 text-[10px] border-slate-200" data-testid="rej-filter-resource"><SelectValue placeholder="Resource" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All</SelectItem>
                          {[...uniqueResources].sort().map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={rejFilter.reason || ""} onValueChange={v => setRejFilter(p => ({ ...p, reason: v === "__all__" ? "" : v }))}>
                        <SelectTrigger className="h-7 text-[10px] border-slate-200" data-testid="rej-filter-reason"><SelectValue placeholder="Reason" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All</SelectItem>
                          {[...uniqueReasons].sort().map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={rejFilter.stage || ""} onValueChange={v => setRejFilter(p => ({ ...p, stage: v === "__all__" ? "" : v }))}>
                        <SelectTrigger className="h-7 text-[10px] border-slate-200" data-testid="rej-filter-stage"><SelectValue placeholder="Stage" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All</SelectItem>
                          {[...uniqueStages].sort().map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={rejFilter.date || ""} onValueChange={v => setRejFilter(p => ({ ...p, date: v === "__all__" ? "" : v }))}>
                        <SelectTrigger className="h-7 text-[10px] border-slate-200" data-testid="rej-filter-date"><SelectValue placeholder="Date" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All</SelectItem>
                          {[...uniqueDates].sort().map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="max-h-64 overflow-y-auto border border-slate-200 rounded">
                      <table className="w-full text-[11px]">
                        <thead className="sticky top-0">
                          <tr className="bg-slate-700 text-white text-[9px] uppercase tracking-wider">
                            <th className="text-left px-2 py-1.5 font-medium">Resource</th>
                            <th className="text-left px-2 py-1.5 font-medium">Stage</th>
                            <th className="text-center px-2 py-1.5 font-medium">Rej</th>
                            <th className="text-left px-2 py-1.5 font-medium">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((e, idx) => (
                            <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} border-b border-slate-50`} data-testid={`rej-summary-${idx}`}>
                              <td className="px-2 py-1.5">
                                <div className="text-slate-700 font-medium">{e.resource_name}</div>
                                <div className="text-[9px] text-slate-400">{e.date}</div>
                              </td>
                              <td className="px-2 py-1.5 text-slate-500">{e.stage_name}</td>
                              <td className="px-2 py-1.5 text-center">
                                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold text-white bg-red-500 rounded">{e.qty_rejected}</span>
                              </td>
                              <td className="px-2 py-1.5">
                                <span className="text-[10px] text-amber-700">{e.reason || '-'}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-700 text-white font-medium text-[10px]">
                            <td colSpan={2} className="px-2 py-1.5 text-right">{filtered.length} records</td>
                            <td className="px-2 py-1.5 text-center font-bold">{filteredTotal}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Activity Log */}
            {history.timeline?.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-md">
                <button onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
                  data-testid="toggle-history">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Clock size={12} className="text-slate-400" /> Activity ({history.timeline.length})
                  </span>
                  {showHistory ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
                </button>
                {showHistory && (
                  <div className="px-3 pb-3 space-y-2 max-h-80 overflow-y-auto">
                    {history.timeline.map((item, i) => (
                      <div key={item.id || i} className="flex items-start gap-2 text-[11px]">
                        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                          item.type === 'movement' ? 'bg-blue-50' : item.qty_rejected > 0 ? 'bg-red-50' : 'bg-emerald-50'
                        }`}>
                          {item.type === 'movement' ? <MoveRight size={10} className="text-blue-600" /> :
                            item.qty_rejected > 0 ? <AlertTriangle size={10} className="text-red-500" /> : <ClipboardCheck size={10} className="text-emerald-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          {item.type === 'movement' ? (
                            <p className="text-slate-700"><span className="font-medium">{item.quantity}</span> crates to <span className="font-medium">{item.to_stage_name}</span></p>
                          ) : (
                            <div className="text-slate-700">
                              <p><span className="font-medium">{item.qty_inspected}</span> crates at <span className="font-medium">{item.stage_name}</span>
                              {(!item.qty_rejected || item.qty_rejected === 0) && <> &mdash; <span className="text-emerald-600">passed</span></>}
                              {item.qty_rejected > 0 && <> &mdash; <span className="text-red-500">{item.qty_rejected} rejected</span></>}
                              </p>
                              {item.entries?.length > 0 && (
                                <div className="mt-0.5 ml-2 space-y-0.5">
                                  {item.entries.map((entry, ei) => (
                                    <div key={ei}>
                                      <p className="text-slate-500">{entry.resource_name} &mdash; {entry.qty_inspected}c</p>
                                      {entry.rejections?.filter(r => r.qty_rejected > 0).map((r, ri) => (
                                        <p key={ri} className="text-slate-400 ml-2"><span className="text-red-500 font-medium">{r.qty_rejected}</span> {r.reason}</p>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {!item.entries && item.rejections?.length > 0 && (
                                <div className="mt-0.5 ml-2 space-y-0.5">
                                  {item.rejections.filter(r => r.qty_rejected > 0).map((r, ri) => (
                                    <p key={ri} className="text-slate-400">{r.resource_name}: <span className="text-red-500">{r.qty_rejected}</span> {r.reason}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <p className="text-[10px] text-slate-300 mt-0.5">{item.moved_by_name || item.inspected_by_name} &middot; {new Date(item.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* No rejections placeholder */}
            {rejEntries.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-md p-4 text-center">
                <p className="text-xs text-slate-400">No rejections recorded yet</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-center">
          <FlaskConical className="w-6 h-6 text-amber-400 mx-auto mb-1" />
          <p className="text-sm text-amber-700 font-medium">No QC Route Configured</p>
          <p className="text-xs text-amber-600 mt-0.5">Configure a QC route for "{batch.sku_name}" to start tracking</p>
        </div>
      )}

      {/* Warehouse Transfer */}
      <WarehouseTransferSection batch={batch} batchId={batchId} onUpdate={fetchBatch} />

      <div className="text-[10px] text-slate-300 flex items-center gap-3">
        <span>Created by {batch.created_by_name}</span>
        <span>{new Date(batch.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   Stage Card — Compact, monochrome design
   ═══════════════════════════════════════════════ */

const STAGE_ICON = { qc: FlaskConical, labeling: Paintbrush, final_qc: ShieldCheck };

function StageCard({ stage, bal, isFirst, canReceive, canInspect, sourceLabel, sourceQty, batchId, bottlesPerCrate, rejectionReasons, qcTeam, onUpdate }) {
  const [showMove, setShowMove] = useState(false);
  const [showInspect, setShowInspect] = useState(false);
  const [moveQty, setMoveQty] = useState('');
  const [moveNotes, setMoveNotes] = useState('');
  const [inspRemarks, setInspRemarks] = useState('');
  const emptyRejItem = () => ({ qty_rejected: '', reason: '' });
  const emptyEntry = () => ({ resource_id: '', resource_name: '', date: new Date().toISOString().slice(0, 10), qty_inspected: '', rejItems: [emptyRejItem()] });
  const [entries, setEntries] = useState([emptyEntry()]);
  const [saving, setSaving] = useState(false);

  const Icon = STAGE_ICON[stage.stage_type] || FlaskConical;
  const received = bal.received || 0;
  const pending = bal.pending || 0;
  const passed = bal.passed || 0;
  const rejected = bal.rejected || 0;
  const stageBottles = received * (bottlesPerCrate || 1);
  const stageRejPct = stageBottles > 0 ? ((rejected / stageBottles) * 100).toFixed(1) : null;
  const stagePassPct = stageBottles > 0 ? (((stageBottles - rejected) / stageBottles) * 100).toFixed(1) : null;

  const handleMove = async () => {
    const qty = parseInt(moveQty);
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
    if (qty > sourceQty) { toast.error(`Only ${sourceQty} available`); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/production/batches/${batchId}/move`, { to_stage_id: stage.id, quantity: qty, notes: moveNotes }, { headers: hdrs() });
      toast.success(`${qty} crates moved to ${stage.name}`);
      setShowMove(false); setMoveQty(''); setMoveNotes('');
      onUpdate();
    } catch (err) { toast.error(err.response?.data?.detail || 'Move failed'); }
    finally { setSaving(false); }
  };

  const handleInspect = async () => {
    const apiEntries = entries.map(e => ({
      resource_id: e.resource_id, resource_name: e.resource_name, date: e.date,
      qty_inspected: parseInt(e.qty_inspected) || 0,
      rejections: e.rejItems.filter(r => parseInt(r.qty_rejected) > 0).map(r => ({ qty_rejected: parseInt(r.qty_rejected) || 0, reason: r.reason })),
    }));
    for (const e of apiEntries) {
      if (!e.resource_name) { toast.error('Select a resource for all entries'); return; }
      if (!e.date) { toast.error('Date is required'); return; }
      if (e.qty_inspected <= 0) { toast.error('Crates inspected must be > 0'); return; }
      for (const r of e.rejections) { if (!r.reason) { toast.error('Select a reason for all rejection rows'); return; } }
      const entryRejTotal = e.rejections.reduce((s, r) => s + r.qty_rejected, 0);
      if (entryRejTotal > e.qty_inspected * (bottlesPerCrate || 1)) { toast.error(`Rejected exceeds max for ${e.resource_name}`); return; }
    }
    const totalCrates = apiEntries.reduce((s, e) => s + e.qty_inspected, 0);
    if (totalCrates > (bal.pending || 0)) { toast.error(`Total crates exceeds ${bal.pending} pending`); return; }

    setSaving(true);
    try {
      await axios.post(`${API}/production/batches/${batchId}/inspect`, { stage_id: stage.id, entries: apiEntries, remarks: inspRemarks }, { headers: hdrs() });
      toast.success(`Inspection recorded at ${stage.name}`);
      setShowInspect(false); setInspRemarks(''); setEntries([emptyEntry()]);
      onUpdate();
    } catch (err) { toast.error(err.response?.data?.detail || 'Inspection failed'); }
    finally { setSaving(false); }
  };

  const updateEntry = (idx, field, value) => {
    setEntries(prev => { const next = [...prev]; next[idx] = { ...next[idx], [field]: value };
      if (field === 'resource_id') { const m = (qcTeam || []).find(m => m.id === value); next[idx].resource_name = m ? m.name : ''; }
      return next;
    });
  };
  const addEntry = () => setEntries(prev => [...prev, emptyEntry()]);
  const removeEntry = (idx) => setEntries(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyEntry()]);
  const updateRejItem = (eIdx, rIdx, field, value) => {
    setEntries(prev => { const next = [...prev]; const items = [...next[eIdx].rejItems]; items[rIdx] = { ...items[rIdx], [field]: value }; next[eIdx] = { ...next[eIdx], rejItems: items }; return next; });
  };
  const addRejItem = (eIdx) => { setEntries(prev => { const next = [...prev]; next[eIdx] = { ...next[eIdx], rejItems: [...next[eIdx].rejItems, emptyRejItem()] }; return next; }); };
  const removeRejItem = (eIdx, rIdx) => { setEntries(prev => { const next = [...prev]; const items = next[eIdx].rejItems; next[eIdx] = { ...next[eIdx], rejItems: items.length > 1 ? items.filter((_, i) => i !== rIdx) : [emptyRejItem()] }; return next; }); };

  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden" data-testid={`stage-card-${stage.id}`}>
      {/* Stage header row */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Icon size={13} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-800">{stage.name}</span>
          <span className="text-[9px] text-slate-400 font-medium uppercase">{stage.stage_type === 'qc' ? 'QC' : stage.stage_type === 'labeling' ? 'Label' : 'Final'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {canReceive && (
            <button onClick={() => { setShowMove(!showMove); setShowInspect(false); }}
              className="px-2 py-1 text-[10px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded flex items-center gap-1 transition-colors"
              data-testid={`move-to-${stage.id}`}>
              <MoveRight size={10} /> Receive
            </button>
          )}
          {canInspect && (
            <button onClick={() => { setShowInspect(!showInspect); setShowMove(false); }}
              className="px-2 py-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded flex items-center gap-1 transition-colors"
              data-testid={`inspect-${stage.id}`}>
              <ClipboardCheck size={10} /> Inspect
            </button>
          )}
        </div>
      </div>

      {/* Balance row — compact horizontal */}
      <div className="flex items-center divide-x divide-slate-100">
        {[
          { label: 'RECV', val: received, cls: 'text-slate-700' },
          { label: 'PEND', val: pending, cls: pending > 0 ? 'text-amber-600' : 'text-slate-400' },
          { label: 'PASS', val: passed, cls: passed > 0 ? 'text-emerald-600' : 'text-slate-400', pct: stagePassPct, pctCls: 'text-emerald-500' },
          { label: 'REJ', val: rejected, cls: rejected > 0 ? 'text-red-600' : 'text-slate-400', pct: stageRejPct, pctCls: 'text-red-500', unit: 'bottles' },
        ].map((c, i) => (
          <div key={i} className="flex-1 py-2 px-2 text-center">
            <p className="text-[8px] text-slate-400 font-medium tracking-wider">{c.label}</p>
            <p className={`text-sm font-bold tabular-nums ${c.cls}`}>{c.val}</p>
            {c.pct && received > 0 && <p className={`text-[9px] font-semibold ${c.pctCls}`}>{c.pct}%</p>}
          </div>
        ))}
      </div>

      {/* Quality micro-bar */}
      {received > 0 && rejected > 0 && (
        <div className="px-3 pb-1.5">
          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden flex">
            <div className="bg-emerald-400 h-full" style={{ width: `${stagePassPct || 0}%` }} />
            <div className="bg-red-400 h-full" style={{ width: `${stageRejPct || 0}%` }} />
          </div>
        </div>
      )}

      {/* Move Form */}
      {showMove && (
        <div className="px-3 py-2.5 bg-slate-50 border-t border-slate-100 space-y-2">
          <p className="text-[10px] text-slate-500">Move from <span className="font-semibold text-slate-700">{sourceLabel}</span> ({sourceQty} available)</p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[9px] text-slate-400 mb-0.5 block">Crates</label>
              <input type="number" value={moveQty} onChange={e => setMoveQty(e.target.value)} max={sourceQty}
                placeholder={`Max ${sourceQty}`} className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs" data-testid={`move-qty-${stage.id}`} />
            </div>
            <div className="flex-1">
              <label className="text-[9px] text-slate-400 mb-0.5 block">Notes</label>
              <input value={moveNotes} onChange={e => setMoveNotes(e.target.value)} placeholder="Optional"
                className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs" />
            </div>
            <button onClick={handleMove} disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded disabled:opacity-50 flex items-center gap-1"
              data-testid={`move-submit-${stage.id}`}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <MoveRight size={11} />} Move
            </button>
            <button onClick={() => setShowMove(false)} className="px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-100 rounded">Cancel</button>
          </div>
        </div>
      )}

      {/* Inspection Form */}
      {showInspect && (() => {
        const tc = entries.reduce((s, e) => s + (parseInt(e.qty_inspected) || 0), 0);
        const tr = entries.reduce((s, e) => s + e.rejItems.reduce((rs, r) => rs + (parseInt(r.qty_rejected) || 0), 0), 0);
        const tb = entries.reduce((s, e) => s + ((parseInt(e.qty_inspected) || 0) * (bottlesPerCrate || 1)), 0);
        const tp = Math.max(0, tb - tr);
        const rp = tb > 0 ? ((tr / tb) * 100).toFixed(1) : '0.0';
        const pp = tb > 0 ? ((tp / tb) * 100).toFixed(1) : '100.0';
        return (
        <div className="border-t border-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
            <div>
              <span className="text-xs font-semibold text-slate-800">Record Inspection</span>
              <span className="text-[10px] text-slate-400 ml-2">{pending} pending &middot; {bottlesPerCrate} b/c</span>
            </div>
            <button onClick={addEntry} className="px-2 py-1 text-[10px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded flex items-center gap-1"
              data-testid={`add-entry-${stage.id}`}><Plus size={10} /> Entry</button>
          </div>

          {/* Live stats */}
          {tc > 0 && (
            <div className="px-3 py-1.5 bg-white border-b border-slate-100 flex items-center gap-3 flex-wrap text-[10px]" data-testid={`inspect-stats-${stage.id}`}>
              <span className="text-slate-500"><span className="font-bold text-slate-700">{tc}</span> crates</span>
              <span className="text-slate-500"><span className="font-bold text-slate-700">{tb}</span> bottles</span>
              <span className="text-red-500"><span className="font-bold">{tr}</span> rej ({rp}%)</span>
              <span className="text-emerald-600"><span className="font-bold">{tp}</span> pass ({pp}%)</span>
              <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden flex min-w-[40px]">
                <div className="bg-emerald-400 h-full" style={{ width: `${pp}%` }} />
                <div className="bg-red-400 h-full" style={{ width: `${rp}%` }} />
              </div>
            </div>
          )}

          {/* Entry Cards */}
          <div className="p-2.5 space-y-2">
            {entries.map((entry, eIdx) => {
              const ec = parseInt(entry.qty_inspected) || 0;
              const eb = ec * (bottlesPerCrate || 1);
              const er = entry.rejItems.reduce((s, r) => s + (parseInt(r.qty_rejected) || 0), 0);
              const epct = eb > 0 ? (((eb - er) / eb) * 100).toFixed(0) : null;
              return (
              <div key={eIdx} className="border border-slate-200 rounded bg-white" data-testid={`entry-card-${eIdx}`}>
                <div className="px-2.5 py-2 border-b border-slate-50">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <User size={9} /> Entry {entries.length > 1 && `#${eIdx + 1}`}
                    </span>
                    <button onClick={() => removeEntry(eIdx)} className="p-1 hover:bg-red-50 rounded group" data-testid={`entry-remove-${eIdx}`}>
                      <Trash2 size={11} className="text-slate-300 group-hover:text-red-500" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] text-slate-400 mb-0.5 block">Resource</label>
                      <Select value={entry.resource_id || ""} onValueChange={v => updateEntry(eIdx, 'resource_id', v)}>
                        <SelectTrigger className="h-8 text-xs border-slate-200" data-testid={`entry-resource-${eIdx}`}><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>{(qcTeam || []).map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-400 mb-0.5 block">Date</label>
                      <input type="date" value={entry.date} onChange={e => updateEntry(eIdx, 'date', e.target.value)}
                        className="w-full h-8 px-2 border border-slate-200 rounded text-xs" data-testid={`entry-date-${eIdx}`} />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-400 mb-0.5 block">Crates</label>
                      <input type="number" value={entry.qty_inspected} onChange={e => updateEntry(eIdx, 'qty_inspected', e.target.value)}
                        min="1" placeholder="0" className="w-full h-8 px-2 border border-slate-200 rounded text-xs text-right font-medium" data-testid={`entry-crates-${eIdx}`} />
                    </div>
                  </div>
                  {ec > 0 && (
                    <div className="flex items-center gap-2 mt-1.5 text-[9px]">
                      <span className="text-slate-400">{eb}b</span>
                      <span className="text-red-500">{er} rej</span>
                      <span className="text-emerald-600">{Math.max(0, eb - er)} pass</span>
                      {epct !== null && <span className={`font-bold px-1 py-0.5 rounded text-[8px] ${parseFloat(epct) >= 95 ? 'bg-emerald-50 text-emerald-600' : parseFloat(epct) >= 80 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>{epct}%</span>}
                    </div>
                  )}
                </div>

                {/* Rejections */}
                <div className="px-2.5 py-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">Rejections</span>
                    <button onClick={() => addRejItem(eIdx)} className="text-[9px] text-red-500 hover:text-red-700 font-medium flex items-center gap-0.5" data-testid={`add-rej-${eIdx}`}>
                      <Plus size={8} /> Row
                    </button>
                  </div>
                  <div className="space-y-1">
                    {entry.rejItems.map((rej, rIdx) => (
                      <div key={rIdx} className="flex items-center gap-1.5" data-testid={`rej-item-${eIdx}-${rIdx}`}>
                        <input type="number" value={rej.qty_rejected} onChange={e => updateRejItem(eIdx, rIdx, 'qty_rejected', e.target.value)}
                          min="0" placeholder="Qty" className="w-16 h-7 px-2 border border-slate-200 rounded text-xs text-center text-red-600 font-semibold" data-testid={`rej-qty-${eIdx}-${rIdx}`} />
                        <div className="flex-1">
                          <Select value={rej.reason || ""} onValueChange={v => updateRejItem(eIdx, rIdx, 'reason', v)}>
                            <SelectTrigger className="h-7 text-xs border-slate-200" data-testid={`rej-reason-${eIdx}-${rIdx}`}><SelectValue placeholder="Reason..." /></SelectTrigger>
                            <SelectContent>{(rejectionReasons || []).map(r => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <button onClick={() => removeRejItem(eIdx, rIdx)} className="p-1 hover:bg-red-50 rounded group" data-testid={`rej-remove-${eIdx}-${rIdx}`}>
                          <Trash2 size={10} className="text-slate-300 group-hover:text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
            <input value={inspRemarks} onChange={e => setInspRemarks(e.target.value)} placeholder="Remarks..."
              className="flex-1 border border-slate-200 rounded px-2 py-1.5 text-xs" />
            <button onClick={handleInspect} disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded disabled:opacity-50 flex items-center gap-1"
              data-testid={`insp-submit-${stage.id}`}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <ClipboardCheck size={11} />} Submit
            </button>
            <button onClick={() => { setShowInspect(false); setEntries([emptyEntry()]); }} className="px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-100 rounded">Cancel</button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}


/* ═══════════════════════════════════════════════
   Warehouse Transfer Section
   ═══════════════════════════════════════════════ */

function WarehouseTransferSection({ batch, batchId, onUpdate }) {
  const [factoryWarehouses, setFactoryWarehouses] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const available = (batch?.total_passed_final || 0) - (batch?.transferred_to_warehouse || 0);
  const bpc = batch?.bottles_per_crate || 1;

  useEffect(() => {
    const h = hdrs();
    axios.get(`${API}/production/factory-warehouses`, { headers: h })
      .then(res => {
        const whs = res.data.warehouses || [];
        setFactoryWarehouses(whs);
        if (whs.length === 1) setSelectedWarehouse(whs[0].id);
        else { const d = whs.find(w => w.is_default); if (d) setSelectedWarehouse(d.id); }
      }).catch(() => {});
    axios.get(`${API}/production/batches/${batchId}/warehouse-transfers`, { headers: h })
      .then(res => setTransfers(res.data.transfers || [])).catch(() => {});
  }, [batchId]);

  const handleTransfer = async () => {
    const qty = parseInt(transferQty);
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
    if (qty > available) { toast.error(`Only ${available} available`); return; }
    if (!selectedWarehouse) { toast.error('Select a warehouse'); return; }
    try {
      setSaving(true);
      await axios.post(`${API}/production/batches/${batchId}/transfer-to-warehouse`, {
        warehouse_location_id: selectedWarehouse, quantity: qty, notes: transferNotes,
      }, { headers: hdrs() });
      toast.success(`${qty} bottles transferred`);
      setShowTransfer(false); setTransferQty(''); setTransferNotes('');
      onUpdate();
      const res = await axios.get(`${API}/production/batches/${batchId}/warehouse-transfers`, { headers: hdrs() });
      setTransfers(res.data.transfers || []);
    } catch (err) { toast.error(err.response?.data?.detail || 'Transfer failed'); }
    finally { setSaving(false); }
  };

  if (available <= 0 && transfers.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-md" data-testid="warehouse-transfer-section">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Send size={13} className="text-teal-500" />
          <span className="text-xs font-semibold text-slate-800">Warehouse Transfer</span>
          <span className="text-[10px] text-slate-400">{available} bottles available</span>
        </div>
        {available > 0 && (
          <button onClick={() => setShowTransfer(!showTransfer)}
            className="px-2 py-1 text-[10px] font-medium bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors flex items-center gap-1"
            data-testid="transfer-to-warehouse-btn">
            <Send size={10} /> Transfer
          </button>
        )}
      </div>

      {showTransfer && (
        <div className="p-3 bg-slate-50 border-b border-slate-100 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-slate-400 mb-0.5 block font-medium">Warehouse</label>
              {factoryWarehouses.length > 1 ? (
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger className="h-8 text-xs" data-testid="transfer-warehouse-select"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{factoryWarehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.location_name} ({w.city})</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <div className="h-8 flex items-center px-2 border border-slate-200 rounded bg-white text-xs text-slate-700">{factoryWarehouses[0]?.location_name}</div>
              )}
            </div>
            <div>
              <label className="text-[9px] text-slate-400 mb-0.5 block font-medium">Bottles (max {available})</label>
              <input type="number" min="1" max={available} value={transferQty} onChange={e => setTransferQty(e.target.value)}
                placeholder={`1-${available}`} className="w-full h-8 border border-slate-200 rounded px-2 text-xs" data-testid="transfer-qty-input" />
            </div>
            <div>
              <label className="text-[9px] text-slate-400 mb-0.5 block font-medium">Notes</label>
              <input value={transferNotes} onChange={e => setTransferNotes(e.target.value)} placeholder="Optional"
                className="w-full h-8 border border-slate-200 rounded px-2 text-xs" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleTransfer} disabled={saving}
              className="px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
              data-testid="transfer-submit-btn">
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Confirm
            </button>
            <button onClick={() => setShowTransfer(false)} className="px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-100 rounded">Cancel</button>
          </div>
        </div>
      )}

      {transfers.length > 0 && (
        <div className="p-3">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] text-slate-400 uppercase tracking-wider">
                <th className="text-left p-1.5 font-medium">Date</th>
                <th className="text-left p-1.5 font-medium">Warehouse</th>
                <th className="text-right p-1.5 font-medium">Bottles</th>
                <th className="text-right p-1.5 font-medium">Crates</th>
                <th className="text-left p-1.5 font-medium">By</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map(t => {
                const crates = Math.floor(t.quantity / bpc);
                const rem = t.quantity % bpc;
                return (
                  <tr key={t.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="p-1.5 text-slate-600">{new Date(t.transferred_at).toLocaleDateString()}</td>
                    <td className="p-1.5 font-medium text-slate-700">{t.warehouse_name}</td>
                    <td className="p-1.5 font-bold text-teal-700 text-right">{t.quantity}</td>
                    <td className="p-1.5 text-slate-500 text-right">{crates}{rem > 0 && <span className="text-slate-400">+{rem}b</span>}</td>
                    <td className="p-1.5 text-slate-400">{t.transferred_by_name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
