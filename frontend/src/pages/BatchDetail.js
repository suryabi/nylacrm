import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import {
  ArrowLeft, Package, Calendar, Factory, Boxes, Tag,
  Loader2, FlaskConical, Paintbrush, ShieldCheck,
  Trash2, ArrowRight, MoveRight, ClipboardCheck,
  Clock, User, AlertTriangle, ChevronDown, ChevronUp, Plus,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('session_token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

const STATUS_MAP = {
  created: { label: 'Created', color: 'bg-slate-100 text-slate-700' },
  in_qc: { label: 'In QC', color: 'bg-blue-100 text-blue-700' },
  in_labeling: { label: 'Labeling', color: 'bg-purple-100 text-purple-700' },
  in_final_qc: { label: 'Final QC', color: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
};

const STAGE_CFG = {
  qc: { icon: FlaskConical, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  labeling: { icon: Paintbrush, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700' },
  final_qc: { icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
};

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

  const fetchBatch = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const [bRes, hRes, rrRes, qtRes] = await Promise.allSettled([
        axios.get(`${API_URL}/production/batches/${batchId}`, { headers }),
        axios.get(`${API_URL}/production/batches/${batchId}/history`, { headers }),
        axios.get(`${API_URL}/production/rejection-reasons`, { headers }),
        axios.get(`${API_URL}/production/qc-team`, { headers }),
      ]);
      if (bRes.status === 'fulfilled') setBatch(bRes.value.data);
      else { toast.error('Batch not found'); navigate('/production-batches'); return; }
      if (hRes.status === 'fulfilled') setHistory(hRes.value.data);
      if (rrRes.status === 'fulfilled') setRejectionReasons(rrRes.value.data);
      if (qtRes.status === 'fulfilled') setQcTeam(qtRes.value.data);
    } finally {
      setLoading(false);
    }
  }, [batchId, navigate]);

  useEffect(() => { fetchBatch(); }, [fetchBatch]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this batch?')) return;
    try {
      await axios.delete(`${API_URL}/production/batches/${batchId}`, { headers: getAuthHeaders() });
      toast.success('Batch deleted');
      navigate('/production-batches');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  if (!batch) return null;

  const st = STATUS_MAP[batch.status] || STATUS_MAP.created;
  const stages = (batch.qc_stages || []).sort((a, b) => a.order - b.order);
  const balances = batch.stage_balances || {};

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6" data-testid="batch-detail-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production-batches')} className="p-2 hover:bg-slate-100 rounded-lg" data-testid="back-btn">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">{batch.batch_code}</h1>
            <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium ${st.color}`}>{st.label}</span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{batch.sku_name}</p>
        </div>
        {batch.status === 'created' && (
          <button onClick={handleDelete} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1.5" data-testid="delete-batch-btn">
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Production Date', value: batch.production_date, icon: Calendar },
          { label: 'Total Crates', value: batch.total_crates?.toLocaleString(), icon: Boxes },
          { label: 'Bottles/Crate', value: batch.bottles_per_crate, icon: Package },
          { label: 'Total Bottles', value: batch.total_bottles?.toLocaleString(), icon: Package },
          { label: 'Unallocated', value: batch.unallocated_crates?.toLocaleString(), icon: Boxes },
          { label: 'Line', value: batch.production_line || '-', icon: Factory },
        ].map((item, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1"><item.icon className="w-3.5 h-3.5 text-slate-400" /><span className="text-[10px] text-slate-400 uppercase tracking-wider">{item.label}</span></div>
            <p className="text-lg font-bold text-slate-800">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Stage Cards — the core of Phase 2 */}
      {stages.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FlaskConical size={16} className="text-blue-500" /> QC Pipeline
          </h2>

          {/* Summary Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-0.5">Unallocated</p>
              <p className="text-2xl font-bold text-slate-800">{batch.unallocated_crates || 0}</p>
              <p className="text-[9px] text-slate-300">crates</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-xs text-red-400 mb-0.5">Total Rejected</p>
              <p className="text-2xl font-bold text-red-600">{batch.total_rejected || 0}</p>
              <p className="text-[9px] text-red-300">bottles</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="text-xs text-emerald-400 mb-0.5">Delivery Ready</p>
              <p className="text-2xl font-bold text-emerald-600">{batch.total_passed_final || 0}</p>
              <p className="text-[9px] text-emerald-300">crates</p>
            </div>
          </div>

          {/* Stage-by-stage cards */}
          {stages.map((stage, idx) => {
            const cfg = STAGE_CFG[stage.stage_type] || STAGE_CFG.qc;
            const bal = balances[stage.id] || {};
            const Icon = cfg.icon;
            const isFirst = idx === 0;
            const prevStage = idx > 0 ? stages[idx - 1] : null;
            const prevBal = prevStage ? (balances[prevStage.id] || {}) : null;
            const canReceive = isFirst ? (batch.unallocated_crates || 0) > 0 : (prevBal?.passed || 0) > 0;
            const canInspect = (bal.pending || 0) > 0;

            return (
              <StageCard
                key={stage.id}
                stage={stage}
                cfg={cfg}
                Icon={Icon}
                bal={bal}
                isFirst={isFirst}
                canReceive={canReceive}
                canInspect={canInspect}
                sourceLabel={isFirst ? 'Unallocated' : prevStage?.name}
                sourceQty={isFirst ? (batch.unallocated_crates || 0) : (prevBal?.passed || 0)}
                batchId={batchId}
                bottlesPerCrate={batch.bottles_per_crate || 1}
                rejectionReasons={rejectionReasons}
                qcTeam={qcTeam}
                onUpdate={fetchBatch}
              />
            );
          })}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
          <FlaskConical className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-amber-700 font-medium">No QC Route Configured</p>
          <p className="text-xs text-amber-600 mt-1">Configure a QC route for "{batch.sku_name}" to start tracking</p>
        </div>
      )}

      {/* Rejection Summary Table */}
      {history.inspections?.some(i => i.qty_rejected > 0) && (() => {
        // Flatten rejection entries from all inspections
        const rejEntries = [];
        history.inspections.filter(i => i.qty_rejected > 0).forEach(i => {
          const entries = i.rejections || [];
          if (entries.length > 0) {
            entries.filter(e => e.qty_rejected > 0).forEach(e => {
              rejEntries.push({ ...e, stage_name: i.stage_name, remarks: i.remarks, inspId: i.id });
            });
          } else {
            // Legacy format
            rejEntries.push({
              resource_name: i.inspected_by_name, date: (i.inspected_at || '').slice(0, 10),
              qty_rejected: i.qty_rejected, reason: i.rejection_reason || '',
              stage_name: i.stage_name, remarks: i.remarks, inspId: i.id,
            });
          }
        });
        const totalRej = rejEntries.reduce((s, e) => s + (e.qty_rejected || 0), 0);
        return (
        <div className="bg-white border border-slate-200 rounded-xl">
          <button onClick={() => setShowRejections(!showRejections)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors rounded-xl"
            data-testid="toggle-rejections">
            <span className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" /> Rejection Summary ({rejEntries.length} records, {totalRej} bottles)
            </span>
            {showRejections ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </button>
          {showRejections && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-200">
                    {['Resource', 'Date', 'Stage', 'Bottles Rejected', 'Reason', 'Remarks'].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rejEntries.map((e, idx) => (
                    <tr key={idx} className="hover:bg-slate-50" data-testid={`rej-summary-${idx}`}>
                      <td className="px-4 py-2 text-slate-700 font-medium whitespace-nowrap">{e.resource_name}</td>
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{e.date}</td>
                      <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{e.stage_name}</td>
                      <td className="px-4 py-2 font-bold text-red-600 text-center">{e.qty_rejected}</td>
                      <td className="px-4 py-2 text-slate-600">{e.reason || '-'}</td>
                      <td className="px-4 py-2 text-slate-400">{e.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-xs">
                    <td colSpan={3} className="px-4 py-2 text-right text-slate-600">Total</td>
                    <td className="px-4 py-2 text-red-600 text-center">{totalRej}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        );
      })()}

      {/* Activity Timeline */}
      {history.timeline?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <button onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors rounded-xl"
            data-testid="toggle-history">
            <span className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Clock size={16} className="text-slate-400" /> Activity Log ({history.timeline.length})
            </span>
            {showHistory ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </button>
          {showHistory && (
            <div className="px-5 pb-5 space-y-3 max-h-96 overflow-y-auto">
              {history.timeline.map((item, i) => (
                <div key={item.id || i} className="flex items-start gap-3 text-xs">
                  <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    item.type === 'movement' ? 'bg-blue-100' : item.qty_rejected > 0 ? 'bg-red-100' : 'bg-emerald-100'
                  }`}>
                    {item.type === 'movement' ? <MoveRight size={11} className="text-blue-600" /> :
                      item.qty_rejected > 0 ? <AlertTriangle size={11} className="text-red-600" /> : <ClipboardCheck size={11} className="text-emerald-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {item.type === 'movement' ? (
                      <p className="text-slate-700"><span className="font-medium">{item.quantity} crates</span> moved to <span className="font-medium">{item.to_stage_name}</span></p>
                    ) : (
                      <div className="text-slate-700">
                        <p>Inspected <span className="font-medium">{item.qty_inspected} crates</span> at <span className="font-medium">{item.stage_name}</span>
                        {(!item.qty_rejected || item.qty_rejected === 0) && <> &mdash; <span className="text-emerald-600">all passed</span></>}
                        {item.qty_rejected > 0 && <> &mdash; <span className="text-red-600">{item.qty_rejected} bottles rejected</span></>}
                        </p>
                        {item.rejections && item.rejections.length > 0 && (
                          <div className="mt-1 ml-2 space-y-0.5">
                            {item.rejections.filter(r => r.qty_rejected > 0).map((r, ri) => (
                              <p key={ri} className="text-xs text-slate-500">
                                {r.resource_name} ({r.date}): <span className="text-red-500 font-medium">{r.qty_rejected} bottles</span> &mdash; {r.reason}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 text-slate-400">
                      <User size={10} /> {item.moved_by_name || item.inspected_by_name}
                      <span>&middot;</span>
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-slate-400 flex items-center gap-4">
        <span>Created by {batch.created_by_name}</span>
        <span>{new Date(batch.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}


/* ─── Stage Card with Move & Inspect actions ─── */

function StageCard({ stage, cfg, Icon, bal, isFirst, canReceive, canInspect, sourceLabel, sourceQty, batchId, bottlesPerCrate, rejectionReasons, qcTeam, onUpdate }) {
  const [showMove, setShowMove] = useState(false);
  const [showInspect, setShowInspect] = useState(false);
  const [moveQty, setMoveQty] = useState('');
  const [moveNotes, setMoveNotes] = useState('');
  const [inspQty, setInspQty] = useState('');
  const [inspRemarks, setInspRemarks] = useState('');
  const emptyRow = () => ({ resource_id: '', resource_name: '', date: new Date().toISOString().slice(0, 10), qty_rejected: '', reason: '' });
  const [rejRows, setRejRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);

  const handleMove = async () => {
    const qty = parseInt(moveQty);
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
    if (qty > sourceQty) { toast.error(`Only ${sourceQty} available`); return; }
    setSaving(true);
    try {
      await axios.post(`${API_URL}/production/batches/${batchId}/move`, {
        to_stage_id: stage.id, quantity: qty, notes: moveNotes,
      }, { headers: getAuthHeaders() });
      toast.success(`${qty} crates moved to ${stage.name}`);
      setShowMove(false); setMoveQty(''); setMoveNotes('');
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Move failed');
    } finally { setSaving(false); }
  };

  const handleInspect = async () => {
    const insp = parseInt(inspQty);
    if (!insp || insp <= 0) { toast.error('Crates inspected must be > 0'); return; }
    if (insp > (bal.pending || 0)) { toast.error(`Only ${bal.pending} crates pending`); return; }

    // Build rejections array — filter out empty rows
    const rejections = rejRows
      .filter(r => parseInt(r.qty_rejected) > 0)
      .map(r => ({
        resource_id: r.resource_id,
        resource_name: r.resource_name,
        date: r.date,
        qty_rejected: parseInt(r.qty_rejected) || 0,
        reason: r.reason,
      }));

    // Validate entries
    for (const r of rejections) {
      if (!r.resource_name) { toast.error('Select a resource for all rejection rows'); return; }
      if (!r.date) { toast.error('Date is required for all rejection rows'); return; }
      if (!r.reason) { toast.error('Select a reason for all rejection rows'); return; }
    }

    const totalRej = rejections.reduce((s, r) => s + r.qty_rejected, 0);
    const maxBottles = insp * (bottlesPerCrate || 1);
    if (totalRej > maxBottles) { toast.error(`Total rejected (${totalRej}) exceeds max ${maxBottles} bottles`); return; }

    setSaving(true);
    try {
      await axios.post(`${API_URL}/production/batches/${batchId}/inspect`, {
        stage_id: stage.id, qty_inspected: insp, rejections, remarks: inspRemarks,
      }, { headers: getAuthHeaders() });
      toast.success(`Inspection recorded at ${stage.name}`);
      setShowInspect(false);
      setInspQty(''); setInspRemarks('');
      setRejRows([emptyRow()]);
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Inspection failed');
    } finally { setSaving(false); }
  };

  const updateRejRow = (idx, field, value) => {
    setRejRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      // Auto-fill resource_name when resource_id is selected
      if (field === 'resource_id') {
        const member = (qcTeam || []).find(m => m.id === value);
        next[idx].resource_name = member ? member.name : '';
      }
      return next;
    });
  };

  const addRejRow = () => setRejRows(prev => [...prev, emptyRow()]);
  const removeRejRow = (idx) => setRejRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyRow()]);

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${cfg.border}`} data-testid={`stage-card-${stage.id}`}>
      {/* Stage Header */}
      <div className={`flex items-center justify-between px-5 py-3 ${cfg.bg}`}>
        <div className="flex items-center gap-2.5">
          <Icon size={16} className={cfg.color} />
          <span className="text-sm font-semibold text-slate-800">{stage.name}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${cfg.badge}`}>
            {stage.stage_type === 'qc' ? 'QC' : stage.stage_type === 'labeling' ? 'Labeling' : 'Final QC'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canReceive && (
            <button onClick={() => { setShowMove(!showMove); setShowInspect(false); }}
              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg flex items-center gap-1 transition-colors"
              data-testid={`move-to-${stage.id}`}>
              <MoveRight size={12} /> Receive Stock
            </button>
          )}
          {canInspect && (
            <button onClick={() => { setShowInspect(!showInspect); setShowMove(false); }}
              className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg flex items-center gap-1 transition-colors"
              data-testid={`inspect-${stage.id}`}>
              <ClipboardCheck size={12} /> Record Inspection
            </button>
          )}
        </div>
      </div>

      {/* Balance Row */}
      <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
        {[
          { label: 'Received', unit: 'crates', value: bal.received || 0, cls: 'text-slate-800' },
          { label: 'Pending', unit: 'crates', value: bal.pending || 0, cls: 'text-amber-600' },
          { label: 'Passed', unit: 'crates', value: bal.passed || 0, cls: 'text-emerald-600' },
          { label: 'Rejected', unit: 'bottles', value: bal.rejected || 0, cls: 'text-red-600' },
        ].map((c, i) => (
          <div key={i} className="py-3 px-4 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">{c.label}</p>
            <p className={`text-xl font-bold ${c.cls}`}>{c.value}</p>
            <p className="text-[9px] text-slate-300 mt-0.5">{c.unit}</p>
          </div>
        ))}
      </div>

      {/* Move Form */}
      {showMove && (
        <div className="px-5 py-4 bg-blue-50/50 border-t border-blue-100 space-y-3">
          <p className="text-xs text-blue-700 font-medium">Move crates from <span className="font-bold">{sourceLabel}</span> ({sourceQty} available)</p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 mb-1 block">Quantity (crates)</label>
              <input type="number" value={moveQty} onChange={e => setMoveQty(e.target.value)} max={sourceQty}
                placeholder={`Max ${sourceQty}`} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid={`move-qty-${stage.id}`} />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 mb-1 block">Notes (optional)</label>
              <input value={moveNotes} onChange={e => setMoveNotes(e.target.value)}
                placeholder="Optional notes" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <button onClick={handleMove} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
              data-testid={`move-submit-${stage.id}`}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <MoveRight size={13} />} Move
            </button>
            <button onClick={() => setShowMove(false)} className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Inspection Form — Editable Grid */}
      {showInspect && (
        <div className="px-5 py-4 bg-emerald-50/50 border-t border-emerald-100 space-y-3">
          <p className="text-xs text-emerald-700 font-medium">Record inspection at <span className="font-bold">{stage.name}</span> ({bal.pending || 0} crates pending, {bottlesPerCrate} bottles/crate)</p>
          <div className="w-48">
            <label className="text-[10px] text-slate-500 mb-1 block">Crates Inspected *</label>
            <input type="number" value={inspQty} onChange={e => setInspQty(e.target.value)}
              max={bal.pending || 0} placeholder={`Max ${bal.pending || 0}`}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid={`insp-qty-${stage.id}`} />
          </div>

          {/* Rejection Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Rejection Records</label>
              <button onClick={addRejRow}
                className="px-2.5 py-1 text-[10px] font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md flex items-center gap-1"
                data-testid={`add-rej-row-${stage.id}`}>
                <Plus size={10} /> Add
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="text-left px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium" style={{minWidth: '160px'}}>Resource *</th>
                    <th className="text-left px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium" style={{minWidth: '130px'}}>Date *</th>
                    <th className="text-left px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium" style={{minWidth: '90px'}}>Bottles *</th>
                    <th className="text-left px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium" style={{minWidth: '160px'}}>Reason *</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {rejRows.map((row, idx) => (
                    <tr key={idx} data-testid={`rej-grid-row-${idx}`}>
                      <td className="px-2 py-1.5">
                        <select value={row.resource_id} onChange={e => updateRejRow(idx, 'resource_id', e.target.value)}
                          className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs" data-testid={`rej-resource-${idx}`}>
                          <option value="">Select...</option>
                          {(qcTeam || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="date" value={row.date} onChange={e => updateRejRow(idx, 'date', e.target.value)}
                          className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs" data-testid={`rej-date-${idx}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" value={row.qty_rejected} onChange={e => updateRejRow(idx, 'qty_rejected', e.target.value)}
                          min="0" placeholder="0"
                          className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs text-red-600 font-medium" data-testid={`rej-qty-${idx}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <select value={row.reason} onChange={e => updateRejRow(idx, 'reason', e.target.value)}
                          className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs" data-testid={`rej-reason-${idx}`}>
                          <option value="">Select...</option>
                          {(rejectionReasons || []).map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-1.5">
                        <button onClick={() => removeRejRow(idx)} className="p-1 hover:bg-red-50 rounded" data-testid={`rej-remove-${idx}`}>
                          <Trash2 size={11} className="text-slate-300 hover:text-red-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {inspQty && (
              <p className="text-[9px] text-slate-400 mt-1">
                Total rejected: {rejRows.reduce((s, r) => s + (parseInt(r.qty_rejected) || 0), 0)} bottles
                (max {(parseInt(inspQty) || 0) * (bottlesPerCrate || 1)})
              </p>
            )}
          </div>

          <div>
            <label className="text-[10px] text-slate-500 mb-1 block">Remarks</label>
            <input value={inspRemarks} onChange={e => setInspRemarks(e.target.value)}
              placeholder="Optional remarks" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleInspect} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
              data-testid={`insp-submit-${stage.id}`}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <ClipboardCheck size={13} />} Submit Inspection
            </button>
            <button onClick={() => { setShowInspect(false); setRejRows([emptyRow()]); }} className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
