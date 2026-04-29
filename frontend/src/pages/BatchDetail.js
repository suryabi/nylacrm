import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import {
  ArrowLeft, Package, Calendar, Boxes, Tag,
  Loader2, FlaskConical, Paintbrush, ShieldCheck,
  Trash2, ArrowRight, MoveRight, ClipboardCheck,
  Clock, User, AlertTriangle, ChevronDown, ChevronUp, Plus, Warehouse, Send, Pencil,
} from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

const STATUS_MAP = {
  created: { label: 'Created', color: 'bg-slate-100 text-slate-700' },
  in_qc: { label: 'In QC', color: 'bg-blue-100 text-blue-700' },
  in_labeling: { label: 'Labeling', color: 'bg-purple-100 text-purple-700' },
  in_final_qc: { label: 'Final QC', color: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
};

/* ── Inspection Records Table (collapsible) ── */
function InspectionRecordsTable({ stageInspections, stageId, startEditInspection }) {
  const [showRecords, setShowRecords] = useState(false);
  return (
    <div className="border-t border-slate-100">
      <button onClick={() => setShowRecords(!showRecords)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50/50 transition-colors text-left"
        data-testid={`toggle-insp-records-${stageId}`}>
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
          Inspection Records ({stageInspections.length})
        </span>
        {showRecords ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
      </button>
      {showRecords && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-[9px] text-slate-500 uppercase tracking-wider">
                <th className="text-left px-3 py-1.5 font-medium">Date</th>
                <th className="text-left px-3 py-1.5 font-medium">Resource</th>
                <th className="text-center px-3 py-1.5 font-medium">Crates</th>
                <th className="text-center px-3 py-1.5 font-medium">Rejected</th>
                <th className="text-left px-3 py-1.5 font-medium">Reason</th>
                <th className="text-left px-3 py-1.5 font-medium">By</th>
                <th className="text-right px-3 py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stageInspections.map((insp) => {
                const inspEntries = insp.entries || [];
                return inspEntries.length > 0 ? inspEntries.map((entry, ei) => (
                  <tr key={`${insp.id}-${ei}`} className="hover:bg-slate-50/50" data-testid={`insp-record-${insp.id}`}>
                    <td className="px-3 py-1.5 text-slate-600">{entry.date}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{entry.resource_name}</td>
                    <td className="px-3 py-1.5 text-center font-semibold text-slate-800">{entry.qty_inspected}</td>
                    <td className="px-3 py-1.5 text-center">
                      {(entry.rejections || []).reduce((s, r) => s + (r.qty_rejected || 0), 0) > 0
                        ? <span className="text-red-600 font-semibold">{(entry.rejections || []).reduce((s, r) => s + (r.qty_rejected || 0), 0)}</span>
                        : <span className="text-emerald-600">0</span>}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">
                      {(entry.rejections || []).filter(r => r.qty_rejected > 0).map(r => r.reason).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-slate-400">{ei === 0 ? (insp.inspected_by_name || '') : ''}</td>
                    <td className="px-3 py-1.5 text-right">
                      {ei === 0 && (
                        <button onClick={() => startEditInspection(insp)}
                          className="px-2 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1 ml-auto"
                          data-testid={`edit-insp-${insp.id}`}>
                          <Pencil size={9} /> Edit
                        </button>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr key={insp.id} className="hover:bg-slate-50/50" data-testid={`insp-record-${insp.id}`}>
                    <td className="px-3 py-1.5 text-slate-600">{new Date(insp.inspected_at || insp.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-700">{insp.inspected_by_name}</td>
                    <td className="px-3 py-1.5 text-center font-semibold text-slate-800">{insp.qty_inspected}</td>
                    <td className="px-3 py-1.5 text-center">
                      {insp.qty_rejected > 0 ? <span className="text-red-600 font-semibold">{insp.qty_rejected}</span> : <span className="text-emerald-600">0</span>}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">—</td>
                    <td className="px-3 py-1.5 text-slate-400">{insp.inspected_by_name}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button onClick={() => startEditInspection(insp)}
                        className="px-2 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1 ml-auto"
                        data-testid={`edit-insp-${insp.id}`}>
                        <Pencil size={9} /> Edit
                      </button>
                    </td>
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
  const [rejFilter, setRejFilter] = useState({ resource: '', date: '', reason: '', stage: '' });
  const [costMappings, setCostMappings] = useState([]);
  const [skuCogs, setSkuCogs] = useState({});

  const fetchBatch = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const [bRes, hRes, rrRes, qtRes] = await Promise.allSettled([
        axios.get(`${API_URL}/production/batches/${batchId}`, { headers }),
        axios.get(`${API_URL}/production/batches/${batchId}/history`, { headers }),
        axios.get(`${API_URL}/production/rejection-reasons`, { headers }),
        axios.get(`${API_URL}/production/qc-team`, { headers }),
      ]);
      if (bRes.status === 'fulfilled') {
        setBatch(bRes.value.data);
        const skuId = bRes.value.data?.sku_id;
        if (skuId) {
          try {
            const [skuRes, mapRes] = await Promise.allSettled([
              axios.get(`${API_URL}/master-skus`, { headers }),
              axios.get(`${API_URL}/production/rejection-cost-mappings?sku_id=${encodeURIComponent(skuId)}`, { headers }),
            ]);
            if (skuRes.status === 'fulfilled') {
              const me = (skuRes.value.data?.skus || []).find((s) => s.id === skuId);
              setSkuCogs(me?.cogs_components_values || {});
            }
            if (mapRes.status === 'fulfilled') setCostMappings(mapRes.value.data || []);
          } catch { /* ignore */ }
        }
      }
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
  const totalBottles = batch.total_bottles || 0;
  const totalRej = batch.total_rejected || 0;
  const overallRejPct = totalBottles > 0 ? ((totalRej / totalBottles) * 100).toFixed(1) : '0.0';
  const overallPassPct = totalBottles > 0 ? (((totalBottles - totalRej) / totalBottles) * 100).toFixed(1) : '100.0';
  const phVal = batch.ph_value;
  const phColor = phVal ? (phVal <= 7 ? 'text-teal-600' : phVal <= 8 ? 'text-sky-600' : 'text-blue-600') : '';
  const phBg = phVal ? (phVal <= 7 ? 'bg-teal-50 border-teal-200' : phVal <= 8 ? 'bg-sky-50 border-sky-200' : 'bg-blue-50 border-blue-200') : '';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-4" data-testid="batch-detail-page">
      <Breadcrumbs items={[
        { label: 'Production', href: '/production' },
        { label: 'Batches', href: '/production-batches' },
        { label: batch.batch_code || 'Detail' },
      ]} />
      {/* Header */}
      <div className="flex items-start sm:items-center gap-2 sm:gap-3">
        <button onClick={() => navigate('/production-batches')} className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg flex-shrink-0" data-testid="back-btn">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-slate-800">{batch.batch_code}</h1>
            <span className={`px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-medium ${st.color}`}>{st.label}</span>
            {phVal && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold border ${phBg} ${phColor}`} data-testid="ph-badge">
                pH {phVal}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">{batch.sku_name}</p>
        </div>
        {batch.status === 'created' && (
          <button onClick={handleDelete} className="px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1 sm:gap-1.5 flex-shrink-0" data-testid="delete-batch-btn">
            <Trash2 size={14} /> <span className="hidden sm:inline">Delete</span>
          </button>
        )}
      </div>

      {/* Info Tiles — Tasks-style with icon + label top, large value */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: 'Production Date', value: batch.production_date, icon: Calendar },
          { label: 'Total Crates', value: batch.total_crates?.toLocaleString(), icon: Boxes },
          { label: 'Bottles/Crate', value: batch.bottles_per_crate, icon: Package },
          { label: 'Total Bottles', value: batch.total_bottles?.toLocaleString(), icon: Package },
          { label: 'Unallocated', value: batch.unallocated_crates?.toLocaleString(), icon: Boxes },
        ].map((item, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-lg p-3.5 hover:shadow-sm transition-shadow">
            <div className="flex items-center gap-1.5 mb-1.5">
              <item.icon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{item.label}</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      {/* ── Two-Column: Pipeline left, Rejections right ── */}
      {stages.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT: Pipeline */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-3">
            {/* Summary Tiles — matching info tile style */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Boxes className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Unallocated</span>
                </div>
                <p className="text-xl font-bold text-slate-900">{batch.unallocated_crates || 0}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">crates</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-[10px] text-red-500 uppercase tracking-wider font-medium">Total Rejected</span>
                </div>
                <p className="text-xl font-bold text-red-700">{totalRej}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">bottles {totalBottles > 0 && <span className="text-red-500">({overallRejPct}%)</span>}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Package className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] text-emerald-600 uppercase tracking-wider font-medium">Warehouse Ready</span>
                </div>
                <p className="text-xl font-bold text-emerald-700">{batch.total_passed_final || 0}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">bottles</p>
                {(batch.transferred_to_warehouse || 0) > 0 && (
                  <p className="text-[10px] text-teal-500 mt-0.5">{batch.transferred_to_warehouse} transferred</p>
                )}
              </div>
              {/* Quality tile */}
              <div className="bg-white border border-slate-200 rounded-lg p-3.5 hover:shadow-sm transition-shadow" data-testid="overall-pass-reject-bar">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Quality</span>
                </div>
                {totalBottles > 0 ? (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xl font-bold text-emerald-700">{overallPassPct}%</span>
                      <span className="text-sm font-bold text-red-600">{overallRejPct}%</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-emerald-600">pass</span>
                      <span className="text-[10px] text-red-500">rej</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex mt-1.5">
                      <div className="bg-emerald-600 h-full" style={{ width: `${overallPassPct}%` }} />
                      <div className="bg-red-600 h-full" style={{ width: `${overallRejPct}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="text-lg text-slate-300">—</p>
                )}
              </div>
            </div>

            {/* Stage Cards */}
            {stages.map((stage, idx) => {
              const cfg = STAGE_CFG[stage.stage_type] || STAGE_CFG.qc;
              const bal = balances[stage.id] || {};
              const Icon = cfg.icon;
              const isFirst = idx === 0;
              const prevStage = idx > 0 ? stages[idx - 1] : null;
              const prevBal = prevStage ? (balances[prevStage.id] || {}) : null;
              const canReceive = isFirst ? (batch.unallocated_crates || 0) > 0 : (prevBal?.passed || 0) > 0;
              const canInspect = (bal.pending || 0) > 0;
              const stageInspections = (history.inspections || []).filter(i => i.stage_id === stage.id);

              return (
                <StageCard
                  key={stage.id} stage={stage} cfg={cfg} Icon={Icon} bal={bal}
                  isFirst={isFirst} canReceive={canReceive} canInspect={canInspect}
                  sourceLabel={isFirst ? 'Unallocated' : prevStage?.name}
                  sourceQty={isFirst ? (batch.unallocated_crates || 0) : (prevBal?.passed || 0)}
                  batchId={batchId} bottlesPerCrate={batch.bottles_per_crate || 1}
                  rejectionReasons={rejectionReasons} qcTeam={qcTeam} onUpdate={fetchBatch}
                  stageInspections={stageInspections}
                />
              );
            })}
          </div>

          {/* RIGHT: Rejection Summary + Activity */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-3">
            <RejectionPanel history={history} batch={batch} showRejections={showRejections} setShowRejections={setShowRejections} rejFilter={rejFilter} setRejFilter={setRejFilter} />
            {/* Activity Log */}
            {history.timeline?.length > 0 && (
              <ActivityLog history={history} showHistory={showHistory} setShowHistory={setShowHistory} />
            )}
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
          <FlaskConical className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-amber-700 font-medium">No QC Route Configured</p>
          <p className="text-xs text-amber-600 mt-1">Configure a QC route for "{batch.sku_name}" to start tracking</p>
        </div>
      )}

      {/* Warehouse Transfer Section */}
      <WarehouseTransferSection batch={batch} batchId={batchId} onUpdate={fetchBatch} />

      <div className="text-xs text-slate-400 flex items-center gap-4">
        <span>Created by {batch.created_by_name}</span>
        <span>{new Date(batch.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}


/* ─── Stage Card with Move & Inspect actions ─── */

function StageCard({ stage, cfg, Icon, bal, isFirst, canReceive, canInspect, sourceLabel, sourceQty, batchId, bottlesPerCrate, rejectionReasons, qcTeam, onUpdate, stageInspections }) {
  const [showMove, setShowMove] = useState(false);
  const [showInspect, setShowInspect] = useState(false);
  const [editingInspection, setEditingInspection] = useState(null);
  const [moveQty, setMoveQty] = useState('');
  const [moveNotes, setMoveNotes] = useState('');
  const [inspRemarks, setInspRemarks] = useState('');
  const emptyRejItem = () => ({ qty_rejected: '', reason: '' });
  const emptyEntry = () => ({ resource_id: '', resource_name: '', date: new Date().toISOString().slice(0, 10), qty_inspected: '', rejItems: [emptyRejItem()] });
  const [entries, setEntries] = useState([emptyEntry()]);
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
    // Build entries for the API
    const apiEntries = entries.map(e => ({
      resource_id: e.resource_id,
      resource_name: e.resource_name,
      date: e.date,
      qty_inspected: parseInt(e.qty_inspected) || 0,
      rejections: e.rejItems.filter(r => parseInt(r.qty_rejected) > 0).map(r => ({
        qty_rejected: parseInt(r.qty_rejected) || 0,
        reason: r.reason,
      })),
    }));

    // Validate
    for (const e of apiEntries) {
      if (!e.resource_name) { toast.error('Select a resource for all entries'); return; }
      if (!e.date) { toast.error('Date is required'); return; }
      if (e.qty_inspected <= 0) { toast.error('Crates inspected must be > 0'); return; }
      for (const r of e.rejections) {
        if (!r.reason) { toast.error('Select a reason for all rejection rows'); return; }
      }
      const entryRejTotal = e.rejections.reduce((s, r) => s + r.qty_rejected, 0);
      const maxBottles = e.qty_inspected * (bottlesPerCrate || 1);
      if (entryRejTotal > maxBottles) { toast.error(`Rejected (${entryRejTotal}) exceeds ${maxBottles} for ${e.resource_name}`); return; }
    }

    const totalCrates = apiEntries.reduce((s, e) => s + e.qty_inspected, 0);
    if (totalCrates > (bal.pending || 0)) { toast.error(`Total crates (${totalCrates}) exceeds ${bal.pending} pending`); return; }

    setSaving(true);
    try {
      await axios.post(`${API_URL}/production/batches/${batchId}/inspect`, {
        stage_id: stage.id, entries: apiEntries, remarks: inspRemarks,
      }, { headers: getAuthHeaders() });
      toast.success(`Inspection recorded at ${stage.name}`);
      setShowInspect(false);
      setInspRemarks('');
      setEntries([emptyEntry()]);
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Inspection failed');
    } finally { setSaving(false); }
  };

  const startEditInspection = (insp) => {
    const inspEntries = (insp.entries || []).map(e => ({
      resource_id: e.resource_id || '',
      resource_name: e.resource_name || '',
      date: e.date || '',
      qty_inspected: String(e.qty_inspected || ''),
      rejItems: (e.rejections || []).length > 0
        ? e.rejections.map(r => ({ qty_rejected: String(r.qty_rejected || ''), reason: r.reason || '' }))
        : [emptyRejItem()],
    }));
    setEntries(inspEntries.length > 0 ? inspEntries : [emptyEntry()]);
    setInspRemarks(insp.remarks || '');
    setEditingInspection(insp);
    setShowInspect(true);
    setShowMove(false);
  };

  const handleUpdateInspection = async () => {
    const apiEntries = entries.map(e => ({
      resource_id: e.resource_id, resource_name: e.resource_name, date: e.date,
      qty_inspected: parseInt(e.qty_inspected) || 0,
      rejections: e.rejItems.filter(r => parseInt(r.qty_rejected) > 0).map(r => ({ qty_rejected: parseInt(r.qty_rejected) || 0, reason: r.reason })),
    }));
    for (const e of apiEntries) {
      if (!e.resource_name) { toast.error('Select a resource'); return; }
      if (e.qty_inspected <= 0) { toast.error('Crates must be > 0'); return; }
      for (const r of e.rejections) { if (!r.reason) { toast.error('Select reason for all rejections'); return; } }
    }
    setSaving(true);
    try {
      await axios.put(`${API_URL}/production/batches/${batchId}/inspections/${editingInspection.id}`, {
        stage_id: stage.id, entries: apiEntries, remarks: inspRemarks,
      }, { headers: getAuthHeaders() });
      toast.success('Inspection updated');
      setShowInspect(false); setEditingInspection(null); setEntries([emptyEntry()]); setInspRemarks('');
      onUpdate();
    } catch (err) { toast.error(err.response?.data?.detail || 'Update failed'); }
    finally { setSaving(false); }
  };

  const updateEntry = (idx, field, value) => {
    setEntries(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === 'resource_id') {
        const member = (qcTeam || []).find(m => m.id === value);
        next[idx].resource_name = member ? member.name : '';
      }
      return next;
    });
  };
  const addEntry = () => setEntries(prev => [...prev, emptyEntry()]);
  const removeEntry = (idx) => setEntries(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyEntry()]);

  const updateRejItem = (entryIdx, rejIdx, field, value) => {
    setEntries(prev => {
      const next = [...prev];
      const items = [...next[entryIdx].rejItems];
      items[rejIdx] = { ...items[rejIdx], [field]: value };
      next[entryIdx] = { ...next[entryIdx], rejItems: items };
      return next;
    });
  };
  const addRejItem = (entryIdx) => {
    setEntries(prev => {
      const next = [...prev];
      next[entryIdx] = { ...next[entryIdx], rejItems: [...next[entryIdx].rejItems, emptyRejItem()] };
      return next;
    });
  };
  const removeRejItem = (entryIdx, rejIdx) => {
    setEntries(prev => {
      const next = [...prev];
      const items = next[entryIdx].rejItems;
      next[entryIdx] = { ...next[entryIdx], rejItems: items.length > 1 ? items.filter((_, i) => i !== rejIdx) : [emptyRejItem()] };
      return next;
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" data-testid={`stage-card-${stage.id}`}>
      {/* Stage Header — monochrome */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-3 sm:px-4 py-2.5 gap-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">{stage.name}</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
            {stage.stage_type === 'qc' ? 'QC' : stage.stage_type === 'labeling' ? 'Labeling' : 'Final QC'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canReceive && (
            <button onClick={() => { setShowMove(!showMove); setShowInspect(false); }}
              className="px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1 transition-colors"
              data-testid={`move-to-${stage.id}`}>
              <MoveRight size={12} /> Receive
            </button>
          )}
          {canInspect && (
            <button onClick={() => { setShowInspect(!showInspect); setShowMove(false); }}
              className="px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1 transition-colors"
              data-testid={`inspect-${stage.id}`}>
              <ClipboardCheck size={12} /> Inspect
            </button>
          )}
        </div>
      </div>

      {/* Balance Row with % */}
      {(() => {
        const received = bal.received || 0;
        const rejected = bal.rejected || 0;
        const stageBottles = received * (bottlesPerCrate || 1);
        const rejPct = stageBottles > 0 ? ((rejected / stageBottles) * 100).toFixed(1) : null;
        const passPct = stageBottles > 0 ? (((stageBottles - rejected) / stageBottles) * 100).toFixed(1) : null;
        return (
        <>
          <div className="grid grid-cols-4 divide-x divide-slate-100">
            {[
              { label: 'Received', unit: 'crates', value: received, cls: 'text-slate-800', pct: null },
              { label: 'Pending', unit: 'crates', value: bal.pending || 0, cls: 'text-amber-600', pct: null },
              { label: 'Passed', unit: 'crates', value: bal.passed || 0, cls: 'text-emerald-700', pct: passPct, pctCls: 'text-emerald-600' },
              { label: 'Rejected', unit: 'bottles', value: rejected, cls: 'text-red-700', pct: rejPct, pctCls: 'text-red-600' },
            ].map((c, i) => (
              <div key={i} className="py-2 sm:py-2.5 px-2 sm:px-3 text-center">
                <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase tracking-wider">{c.label}</p>
                <p className={`text-lg font-bold ${c.cls}`}>{c.value}</p>
                <p className="text-[9px] text-slate-300">{c.unit}</p>
                {c.pct && received > 0 && <p className={`text-[10px] font-semibold ${c.pctCls}`}>{c.pct}%</p>}
              </div>
            ))}
          </div>
          {received > 0 && rejected > 0 && (
            <div className="px-3 pb-1.5">
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="bg-emerald-600 h-full" style={{ width: `${passPct || 0}%` }} />
                <div className="bg-red-600 h-full" style={{ width: `${rejPct || 0}%` }} />
              </div>
            </div>
          )}
        </>
        );
      })()}

      {/* Past Inspections — collapsible table */}
      {(stageInspections || []).length > 0 && (
        <InspectionRecordsTable stageInspections={stageInspections} stageId={stage.id} startEditInspection={startEditInspection} />
      )}

      {/* Move Form */}
      {showMove && (
        <div className="px-3 sm:px-5 py-3 sm:py-4 bg-blue-50/50 border-t border-blue-100 space-y-3">
          <p className="text-xs text-blue-700 font-medium">Move from <span className="font-bold">{sourceLabel}</span> ({sourceQty} available)</p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 sm:gap-3">
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
            <div className="flex gap-2">
              <button onClick={handleMove} disabled={saving}
                className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap"
                data-testid={`move-submit-${stage.id}`}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <MoveRight size={13} />} Move
              </button>
              <button onClick={() => setShowMove(false)} className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Inspection Form — Hierarchical: Entry (Resource + Date + Crates) → Rejection Items (Count + Reason) */}
      {showInspect && (() => {
        const totalCrates = entries.reduce((s, e) => s + (parseInt(e.qty_inspected) || 0), 0);
        const totalRejected = entries.reduce((s, e) => s + e.rejItems.reduce((rs, r) => rs + (parseInt(r.qty_rejected) || 0), 0), 0);
        const totalBottles = entries.reduce((s, e) => s + ((parseInt(e.qty_inspected) || 0) * (bottlesPerCrate || 1)), 0);
        const passedBottles = Math.max(0, totalBottles - totalRejected);
        return (
        <div className="px-3 sm:px-5 py-4 sm:py-5 bg-emerald-50/50 border-t border-emerald-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-xs sm:text-sm text-emerald-700 font-medium">{editingInspection ? 'Edit inspection' : 'Record inspection'} at <span className="font-bold">{stage.name}</span> <span className="text-slate-400 font-normal">({bal.pending || 0} pending, {bottlesPerCrate} b/c)</span></p>
            <button onClick={addEntry}
              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg flex items-center gap-1.5 transition-colors self-start sm:self-auto"
              data-testid={`add-entry-${stage.id}`}>
              <Plus size={12} /> Add Entry
            </button>
          </div>

          {/* Entry Cards */}
          <div className="space-y-3">
            {entries.map((entry, eIdx) => {
              const eCrates = parseInt(entry.qty_inspected) || 0;
              const eBottles = eCrates * (bottlesPerCrate || 1);
              const eRejected = entry.rejItems.reduce((s, r) => s + (parseInt(r.qty_rejected) || 0), 0);
              const ePassed = Math.max(0, eBottles - eRejected);
              return (
              <div key={eIdx} className="bg-white border border-slate-200 rounded-xl overflow-hidden" data-testid={`entry-card-${eIdx}`}>
                {/* Entry Header: Resource + Date + Crates */}
                <div className="p-3 bg-slate-50/80 border-b border-slate-200">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-end">
                    <div className="sm:col-span-4">
                      <label className="text-[10px] text-slate-500 mb-1 block font-medium uppercase tracking-wider">Resource</label>
                      <Select value={entry.resource_id || ""} onValueChange={v => updateEntry(eIdx, 'resource_id', v)}>
                        <SelectTrigger className="h-10 text-sm border-slate-200 bg-white" data-testid={`entry-resource-${eIdx}`}>
                          <SelectValue placeholder="Select resource..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(qcTeam || []).map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-[10px] text-slate-500 mb-1 block font-medium uppercase tracking-wider">Date</label>
                      <input type="date" value={entry.date} onChange={e => updateEntry(eIdx, 'date', e.target.value)}
                        className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm bg-white" data-testid={`entry-date-${eIdx}`} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[10px] text-slate-500 mb-1 block font-medium uppercase tracking-wider">Crates Inspected</label>
                      <input type="number" value={entry.qty_inspected} onChange={e => updateEntry(eIdx, 'qty_inspected', e.target.value)}
                        min="1" placeholder="0"
                        className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm text-right bg-white" data-testid={`entry-crates-${eIdx}`} />
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-3 pb-0.5">
                      {eCrates > 0 && (
                        <div className="text-xs">
                          <span className="text-red-500 font-medium">{eRejected}</span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span className="text-emerald-600 font-bold">{ePassed}</span>
                          <span className="text-slate-300 text-[10px] ml-1">rej/pass</span>
                        </div>
                      )}
                    </div>
                    <div className="sm:col-span-1 flex justify-end pb-0.5">
                      <button onClick={() => removeEntry(eIdx)} className="p-2 hover:bg-red-50 rounded-lg transition-colors" data-testid={`entry-remove-${eIdx}`}>
                        <Trash2 size={14} className="text-slate-300 hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Rejection Items Sub-Grid */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Rejection Details</label>
                    <button onClick={() => addRejItem(eIdx)}
                      className="px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded flex items-center gap-1 transition-colors"
                      data-testid={`add-rej-${eIdx}`}>
                      <Plus size={9} /> Add Rejection
                    </button>
                  </div>
                  <div className="space-y-2">
                    {entry.rejItems.map((rej, rIdx) => {
                      const qty = parseInt(rej.qty_rejected) || 0;
                      const reason = rej.reason || '';
                      let cost = 0;
                      let mapped = false;
                      if (qty > 0 && reason) {
                        const m = costMappings.find((mm) => mm.sku_id === batch?.sku_id && mm.stage_name === stage.name && mm.reason_name === reason);
                        if (m) {
                          mapped = true;
                          const unit = (m.impacted_component_keys || []).reduce((s, k) => s + (parseFloat(skuCogs[k]) || 0), 0);
                          cost = unit * qty;
                        }
                      }
                      return (
                      <div key={rIdx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3" data-testid={`rej-item-${eIdx}-${rIdx}`}>
                        <div className="w-full sm:w-28">
                          <input type="number" value={rej.qty_rejected} onChange={e => updateRejItem(eIdx, rIdx, 'qty_rejected', e.target.value)}
                            min="0" placeholder="Count"
                            className="w-full h-9 px-3 border border-slate-200 rounded-md text-sm text-right text-red-600 font-medium bg-white" data-testid={`rej-qty-${eIdx}-${rIdx}`} />
                        </div>
                        <div className="flex-1">
                          <Select value={rej.reason || ""} onValueChange={v => updateRejItem(eIdx, rIdx, 'reason', v)}>
                            <SelectTrigger className="h-9 text-sm border-slate-200 bg-white" data-testid={`rej-reason-${eIdx}-${rIdx}`}>
                              <SelectValue placeholder="Select reason..." />
                            </SelectTrigger>
                            <SelectContent>
                              {(rejectionReasons || []).map(r => (
                                <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {qty > 0 && reason && (
                          <div className="text-xs whitespace-nowrap min-w-[120px] text-right" data-testid={`rej-cost-${eIdx}-${rIdx}`}>
                            {mapped ? (
                              <span className="font-semibold text-rose-700">₹{cost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            ) : (
                              <span className="text-amber-600 italic" title="No mapping configured for this Stage × Reason. Configure under Production → Rejection Cost Config.">— not mapped</span>
                            )}
                          </div>
                        )}
                        <button onClick={() => removeRejItem(eIdx, rIdx)} className="p-1.5 hover:bg-red-50 rounded transition-colors self-end sm:self-auto" data-testid={`rej-remove-${eIdx}-${rIdx}`}>
                          <Trash2 size={12} className="text-slate-300 hover:text-red-400" />
                        </button>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          {/* Totals Bar */}
          <div className="flex items-center gap-6 bg-white border border-slate-200 rounded-xl p-3 text-sm">
            <span className="text-slate-500">Totals:</span>
            <span className="text-slate-700 font-medium">{totalCrates} crates</span>
            <span className="text-red-500 font-medium">{totalRejected} rejected</span>
            <span className="text-emerald-600 font-bold">{passedBottles.toLocaleString()} passed</span>
          </div>

          <div className="max-w-md">
            <label className="text-xs text-slate-500 mb-1.5 block font-medium">Remarks</label>
            <input value={inspRemarks} onChange={e => setInspRemarks(e.target.value)}
              placeholder="Optional remarks" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={editingInspection ? handleUpdateInspection : handleInspect} disabled={saving}
              className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center gap-2 transition-colors"
              data-testid={`insp-submit-${stage.id}`}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />} {editingInspection ? 'Update Inspection' : 'Submit Inspection'}
            </button>
            <button onClick={() => { setShowInspect(false); setEditingInspection(null); setEntries([emptyEntry()]); }} className="px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}


function WarehouseTransferSection({ batch, batchId, onUpdate }) {
  const [factoryWarehouses, setFactoryWarehouses] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingTransfers, setLoadingTransfers] = useState(false);

  const available = (batch?.total_passed_final || 0) - (batch?.transferred_to_warehouse || 0);
  const bottlesPerCrate = batch?.bottles_per_crate || 1;
  const availableCrates = Math.floor(available / bottlesPerCrate);

  useEffect(() => {
    const headers = getAuthHeaders();
    axios.get(`${API_URL}/production/factory-warehouses`, { headers })
      .then(res => {
        const whs = res.data.warehouses || [];
        setFactoryWarehouses(whs);
        // Auto-select if only 1, or pick default
        if (whs.length === 1) {
          setSelectedWarehouse(whs[0].id);
        } else {
          const defaultWh = whs.find(w => w.is_default);
          if (defaultWh) setSelectedWarehouse(defaultWh.id);
        }
      })
      .catch(() => {});
    // Fetch transfer history
    setLoadingTransfers(true);
    axios.get(`${API_URL}/production/batches/${batchId}/warehouse-transfers`, { headers })
      .then(res => setTransfers(res.data.transfers || []))
      .catch(() => {})
      .finally(() => setLoadingTransfers(false));
  }, [batchId]);

  const handleTransfer = async () => {
    const qty = parseInt(transferQty);
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
    if (qty > available) { toast.error(`Only ${available} crates available`); return; }
    if (!selectedWarehouse) { toast.error('Select a factory warehouse'); return; }
    try {
      setSaving(true);
      const headers = getAuthHeaders();
      await axios.post(`${API_URL}/production/batches/${batchId}/transfer-to-warehouse`, {
        warehouse_location_id: selectedWarehouse, quantity: qty, notes: transferNotes,
      }, { headers });
      toast.success(`${qty} bottles transferred to warehouse`);
      setTransferQty(''); setTransferNotes(''); setShowTransfer(false);
      onUpdate();
      // Refresh transfers
      const tRes = await axios.get(`${API_URL}/production/batches/${batchId}/warehouse-transfers`, { headers });
      setTransfers(tRes.data.transfers || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Transfer failed');
    } finally { setSaving(false); }
  };

  if ((batch?.total_passed_final || 0) === 0 && transfers.length === 0) return null;

  return (
    <div className="bg-white border border-teal-200 rounded-xl overflow-hidden" data-testid="warehouse-transfer-section">
      <div className="bg-teal-50 border-b border-teal-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Warehouse size={16} className="text-teal-600" />
          <h3 className="text-sm font-semibold text-teal-800">Transfer to Master Warehouse</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-teal-600">
            <span className="font-medium">{available}</span> bottles ({availableCrates} crates) available
            {(batch?.transferred_to_warehouse || 0) > 0 && (
              <span className="text-teal-500 ml-2">({batch.transferred_to_warehouse} bottles transferred)</span>
            )}
          </div>
          {available > 0 && (
            <button
              onClick={() => setShowTransfer(!showTransfer)}
              className="px-3 py-1.5 text-xs font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5"
              data-testid="transfer-to-warehouse-btn"
            >
              <Send size={12} /> Transfer to Master Warehouse
            </button>
          )}
        </div>
      </div>

      {showTransfer && (
        <div className="p-4 border-b border-teal-100 bg-teal-50/30 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Master Warehouse *</label>
              {factoryWarehouses.length > 1 ? (
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger className="h-10" data-testid="transfer-warehouse-select">
                    <SelectValue placeholder="Select master warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {factoryWarehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.location_name} ({w.city}) {w.is_default ? '★' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-10 flex items-center px-3 border border-slate-200 rounded-lg bg-slate-50 text-sm text-slate-700">
                  {factoryWarehouses[0]?.location_name} ({factoryWarehouses[0]?.city})
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Bottles to Transfer * (max {available})</label>
              <input
                type="number" min="1" max={available} value={transferQty}
                onChange={e => setTransferQty(e.target.value)}
                placeholder={`1 - ${available}`}
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                data-testid="transfer-qty-input"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Notes</label>
              <input
                value={transferNotes} onChange={e => setTransferNotes(e.target.value)}
                placeholder="Optional notes"
                className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleTransfer} disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5"
              data-testid="transfer-submit-btn"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Confirm Transfer
            </button>
            <button onClick={() => setShowTransfer(false)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {/* Transfer History */}
      {transfers.length > 0 && (
        <div className="p-4">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Transfer History</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="text-left p-2 font-medium">Date</th>
                  <th className="text-left p-2 font-medium">Warehouse</th>
                  <th className="text-right p-2 font-medium">Bottles</th>
                  <th className="text-right p-2 font-medium">Crates</th>
                  <th className="text-left p-2 font-medium">By</th>
                  <th className="text-left p-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map(t => {
                  const bpc = batch?.bottles_per_crate || 1;
                  const crates = Math.floor(t.quantity / bpc);
                  const remainder = t.quantity % bpc;
                  return (
                    <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="p-2 text-xs text-slate-600">{new Date(t.transferred_at).toLocaleDateString()}</td>
                      <td className="p-2 text-xs font-medium text-slate-700">{t.warehouse_name}</td>
                      <td className="p-2 text-xs font-bold text-teal-700 text-right">{t.quantity}</td>
                      <td className="p-2 text-xs text-slate-600 text-right">
                        {crates}{remainder > 0 && <span className="text-slate-400"> +{remainder}b</span>}
                      </td>
                      <td className="p-2 text-xs text-slate-500">{t.transferred_by_name}</td>
                      <td className="p-2 text-xs text-slate-400">{t.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {transfers.length === 0 && !showTransfer && (
        <div className="p-6 text-center text-xs text-slate-400">
          No transfers yet. Use the Transfer button to move warehouse-ready stock to a master warehouse.
        </div>
      )}
    </div>
  );
}


/* ─── Rejection Panel (Right Sidebar) ─── */

function RejectionPanel({ history, batch, showRejections, setShowRejections, rejFilter, setRejFilter }) {
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

  if (rejEntries.length === 0) return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
      <p className="text-sm text-slate-400">No rejections recorded yet</p>
    </div>
  );

  const totalRej = rejEntries.reduce((s, e) => s + (e.qty_rejected || 0), 0);
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
  const bpc = batch?.bottles_per_crate || 1;

  return (
    <div className="bg-white border border-slate-200 rounded-lg" data-testid="rejection-summary-section">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-500" />
            <span className="text-sm font-semibold text-slate-800">Rejections</span>
            <span className="text-xs text-slate-400">{rejEntries.length} records</span>
          </div>
          <span className="text-xl font-bold text-red-700" data-testid="rej-metric-total">{totalRej}</span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3 border-b border-slate-100">
        {topResource.length > 0 && (
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1.5">By Resource</p>
            <div className="space-y-1.5">
              {topResource.slice(0, 4).map(([name, count], i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 truncate mr-2">{name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-red-400 rounded-full" style={{ width: `${(count / totalRej) * 100}%` }} /></div>
                    <span className="text-xs font-bold text-red-600 tabular-nums w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {topReason.length > 0 && (
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1.5">By Reason</p>
            <div className="space-y-1.5">
              {topReason.slice(0, 4).map(([name, count], i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 truncate mr-2">{name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-amber-400 rounded-full" style={{ width: `${(count / totalRej) * 100}%` }} /></div>
                    <span className="text-xs font-bold text-amber-600 tabular-nums w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <button onClick={() => setShowRejections(!showRejections)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
        data-testid="toggle-rejections">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Detail View</span>
        {showRejections ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
      </button>

      {showRejections && (
        <div className="px-4 pb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2" data-testid="rej-filters">
            <Select value={rejFilter.resource || ""} onValueChange={v => setRejFilter(p => ({ ...p, resource: v === "__all__" ? "" : v }))}>
              <SelectTrigger className="h-8 text-xs border-slate-200" data-testid="rej-filter-resource"><SelectValue placeholder="Resource" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">All</SelectItem>{[...uniqueResources].sort().map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={rejFilter.reason || ""} onValueChange={v => setRejFilter(p => ({ ...p, reason: v === "__all__" ? "" : v }))}>
              <SelectTrigger className="h-8 text-xs border-slate-200" data-testid="rej-filter-reason"><SelectValue placeholder="Reason" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">All</SelectItem>{[...uniqueReasons].sort().map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={rejFilter.stage || ""} onValueChange={v => setRejFilter(p => ({ ...p, stage: v === "__all__" ? "" : v }))}>
              <SelectTrigger className="h-8 text-xs border-slate-200" data-testid="rej-filter-stage"><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">All</SelectItem>{[...uniqueStages].sort().map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={rejFilter.date || ""} onValueChange={v => setRejFilter(p => ({ ...p, date: v === "__all__" ? "" : v }))}>
              <SelectTrigger className="h-8 text-xs border-slate-200" data-testid="rej-filter-date"><SelectValue placeholder="Date" /></SelectTrigger>
              <SelectContent><SelectItem value="__all__">All</SelectItem>{[...uniqueDates].sort().map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr className="bg-slate-700 text-white text-[9px] uppercase tracking-wider">
                  <th className="text-left px-3 py-2 font-medium">Resource</th>
                  <th className="text-left px-3 py-2 font-medium">Stage</th>
                  <th className="text-center px-3 py-2 font-medium">Rej</th>
                  <th className="text-left px-3 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => (
                  <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} border-b border-slate-50`} data-testid={`rej-summary-${idx}`}>
                    <td className="px-3 py-2"><div className="font-medium text-slate-700">{e.resource_name}</div><div className="text-[9px] text-slate-400">{e.date}</div></td>
                    <td className="px-3 py-2 text-slate-500">{e.stage_name}</td>
                    <td className="px-3 py-2 text-center"><span className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 text-[10px] font-bold text-white bg-red-600 rounded">{e.qty_rejected}</span></td>
                    <td className="px-3 py-2 text-amber-700">{e.reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-slate-700 text-white font-medium text-[10px]"><td colSpan={2} className="px-3 py-2 text-right">{filtered.length} records</td><td className="px-3 py-2 text-center font-bold">{filteredTotal}</td><td></td></tr></tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Activity Log (Right Sidebar) ─── */

function ActivityLog({ history, showHistory, setShowHistory }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <button onClick={() => setShowHistory(!showHistory)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
        data-testid="toggle-history">
        <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Clock size={14} className="text-slate-400" /> Activity ({history.timeline.length})
        </span>
        {showHistory ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
      </button>
      {showHistory && (
        <div className="px-4 pb-4 space-y-2.5 max-h-80 overflow-y-auto">
          {history.timeline.map((item, i) => (
            <div key={item.id || i} className="flex items-start gap-2 text-xs">
              <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                item.type === 'movement' ? 'bg-blue-50' : item.qty_rejected > 0 ? 'bg-red-50' : 'bg-emerald-50'
              }`}>
                {item.type === 'movement' ? <MoveRight size={10} className="text-blue-600" /> :
                  item.qty_rejected > 0 ? <AlertTriangle size={10} className="text-red-500" /> : <ClipboardCheck size={10} className="text-emerald-600" />}
              </div>
              <div className="flex-1 min-w-0">
                {item.type === 'movement' ? (
                  <p className="text-slate-700"><span className="font-medium">{item.quantity} crates</span> moved to <span className="font-medium">{item.to_stage_name}</span></p>
                ) : (
                  <div className="text-slate-700">
                    <p><span className="font-medium">{item.qty_inspected} crates</span> at <span className="font-medium">{item.stage_name}</span>
                    {(!item.qty_rejected || item.qty_rejected === 0) && <> &mdash; <span className="text-emerald-600">passed</span></>}
                    {item.qty_rejected > 0 && <> &mdash; <span className="text-red-500">{item.qty_rejected} rej</span></>}
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
  );
}
