import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import * as Icons from 'lucide-react';
import { Loader2, ChevronLeft, Minus, Check, Factory, ArrowRight, MoveRight, RotateCcw, X, Search, LayoutGrid, Layers, LogOut, UserCircle2 } from 'lucide-react';
import QCKioskLogin from '../components/qc/QCKioskLogin';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

function iconComponent(name) {
  if (!name) return Icons.Circle;
  const pascal = name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  return Icons[pascal] || Icons.Circle;
}

// Statuses where a batch still has QC work happening.
const ACTIVE_STATUSES = ['in_qc', 'in_labeling', 'in_final_qc', 'created'];

const STATUS_META = {
  created:     { label: 'Created',    cls: 'bg-slate-100 text-slate-600' },
  in_qc:       { label: 'In QC',      cls: 'bg-blue-50 text-blue-600' },
  in_labeling: { label: 'Labeling',   cls: 'bg-violet-50 text-violet-600' },
  in_final_qc: { label: 'Final QC',   cls: 'bg-amber-50 text-amber-700' },
};

// Distinct, high-contrast palette assigned deterministically per SKU.
const SKU_PALETTE = [
  { bg: '#0ea5e9', soft: '#e0f2fe', text: '#0369a1' },
  { bg: '#8b5cf6', soft: '#ede9fe', text: '#6d28d9' },
  { bg: '#10b981', soft: '#d1fae5', text: '#047857' },
  { bg: '#f59e0b', soft: '#fef3c7', text: '#b45309' },
  { bg: '#ef4444', soft: '#fee2e2', text: '#b91c1c' },
  { bg: '#ec4899', soft: '#fce7f3', text: '#be185d' },
  { bg: '#14b8a6', soft: '#ccfbf1', text: '#0f766e' },
  { bg: '#6366f1', soft: '#e0e7ff', text: '#4338ca' },
  { bg: '#84cc16', soft: '#ecfccb', text: '#4d7c0f' },
  { bg: '#f97316', soft: '#ffedd5', text: '#c2410c' },
];

function skuColor(key) {
  const s = String(key || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SKU_PALETTE[h % SKU_PALETTE.length];
}

// Short SKU code: prefer the batch_code prefix (e.g. "600S-APR-002" → "600S",
// "B660-180726-201" → "B660"); else derive volume+variant from the SKU name.
function skuCode(b) {
  const bc = b.batch_code || b.batch_number || '';
  const m = bc.match(/^([A-Za-z0-9]+)-/);
  if (m) return m[1].toUpperCase();
  const name = (b.sku_name || '').toString();
  const vol = name.match(/(\d+\s?(?:ml|l|L|ltr))/i);
  const variant = (name.match(/silver|gold|premium|platinum|classic|blue/i) || [''])[0];
  if (vol) return (vol[1].replace(/\s/g, '') + (variant ? variant[0].toUpperCase() : '')).toUpperCase();
  return (name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4) || 'SKU').toUpperCase();
}

// Crates awaiting QC action for a batch: pending at any stage + (unallocated
// still to enter, for freshly created batches). Used to float busy batches up.
function waitingCrates(b) {
  const bal = b.stage_balances || {};
  const pending = Object.values(bal).reduce((a, s) => a + ((s && s.pending) || 0), 0);
  const unalloc = b.status === 'created' ? (b.unallocated_crates || 0) : 0;
  return pending + unalloc;
}

export default function QCStation() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [step, setStep] = useState('batch');    // batch | stage | capture
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [batch, setBatch] = useState(null);
  const [stage, setStage] = useState(null);
  const [session, setSession] = useState(null);
  const [crates, setCrates] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [receiveQty, setReceiveQty] = useState({});   // stageId -> qty input
  const [receiving, setReceiving] = useState(null);   // stageId being moved
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [skuFilter, setSkuFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('sku');       // 'sku' | 'status'
  const [operator, setOperator] = useState(() => {
    try { return JSON.parse(localStorage.getItem('qc_operator') || 'null'); } catch { return null; }
  });
  const deepLinked = useRef(false);

  const fetchInit = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([
        axios.get(`${API_URL}/production/batches`, { headers: getAuthHeaders() }),
        axios.get(`${API_URL}/production/rejection-reasons`, { headers: getAuthHeaders() }),
      ]);
      setBatches((b.data || []).filter(x => ACTIVE_STATUSES.includes(x.status)));
      setReasons(r.data || []);
    } catch {
      toast.error('Failed to load QC data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInit(); }, [fetchInit]);

  const openBatch = async (b) => {
    try {
      const { data } = await axios.get(`${API_URL}/production/batches/${b.id}`, { headers: getAuthHeaders() });
      setBatch(data);
      setStep('stage');
      return data;
    } catch {
      toast.error('Failed to open batch');
      return null;
    }
  };

  const refreshBatch = async () => {
    if (!batch) return null;
    try {
      const { data } = await axios.get(`${API_URL}/production/batches/${batch.id}`, { headers: getAuthHeaders() });
      setBatch(data);
      return data;
    } catch { return null; }
  };

  // Deep link from Batch Detail: /qc-station?batch=<id>
  useEffect(() => {
    const bid = searchParams.get('batch');
    if (bid && !deepLinked.current && !loading) {
      deepLinked.current = true;
      openBatch({ id: bid });
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const balFor = (b, stageId) => (b?.stage_balances?.[stageId]) || {};
  const pendingFor = (b, stageId) => balFor(b, stageId).pending || 0;

  // Where do crates come from for this stage, and how many are available?
  const receiveSource = (b, st) => {
    const stages = [...(b.qc_stages || [])].sort((a, x) => a.order - x.order);
    if (stages.length && st.id === stages[0].id) {
      return { label: 'Unallocated', available: b.unallocated_crates || 0 };
    }
    const prev = [...stages].filter(s => s.order < st.order).pop();
    if (!prev) return { label: 'Unallocated', available: b.unallocated_crates || 0 };
    return { label: `${prev.name} (passed)`, available: balFor(b, prev.id).passed || 0 };
  };

  const receiveCrates = async (st) => {
    const qty = parseInt(receiveQty[st.id] || '0', 10);
    if (!qty || qty <= 0) { toast.error('Enter a quantity'); return; }
    setReceiving(st.id);
    try {
      await axios.post(`${API_URL}/production/batches/${batch.id}/move`,
        { to_stage_id: st.id, quantity: qty, notes: 'Received via QC Station' },
        { headers: getAuthHeaders() });
      toast.success(`${qty} crates received at ${st.name}`);
      setReceiveQty(p => ({ ...p, [st.id]: '' }));
      await refreshBatch();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to receive crates');
    } finally {
      setReceiving(null);
    }
  };

  const openStage = async (st) => {
    setStage(st);
    const opParam = operator ? `&qc_operator_id=${operator.id}` : '';
    try {
      const { data: active } = await axios.get(
        `${API_URL}/production/qc-sessions/active?batch_id=${batch.id}&stage_id=${st.id}${opParam}`,
        { headers: getAuthHeaders() }
      );
      if (active) {
        setSession(active);
        setCrates(active.crates_inspected || 0);
      } else {
        const { data } = await axios.post(`${API_URL}/production/qc-sessions`,
          { batch_id: batch.id, stage_id: st.id, crates_inspected: 0,
            qc_operator_id: operator?.id, qc_operator_name: operator?.name },
          { headers: getAuthHeaders() });
        setSession(data);
        setCrates(0);
      }
      setStep('capture');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not start session');
    }
  };

  const saveCrates = async (val) => {
    const pending = pendingFor(batch, stage?.id);
    const v = Math.min(Math.max(0, val), pending || 0);
    if (val > pending) toast.warning(`Only ${pending} crates pending at ${stage?.name}`);
    setCrates(v);
    if (!session) return;
    try {
      const { data } = await axios.patch(`${API_URL}/production/qc-sessions/${session.id}`,
        { crates_inspected: v }, { headers: getAuthHeaders() });
      setSession(data);
    } catch { /* silent — retried on next change */ }
  };

  const tap = async (reasonId, delta) => {
    if (!session) return;
    // Optimistic update
    setSession(prev => {
      const counts = { ...(prev.counts || {}) };
      counts[reasonId] = Math.max(0, (counts[reasonId] || 0) + delta);
      return { ...prev, counts };
    });
    try {
      const { data } = await axios.patch(`${API_URL}/production/qc-sessions/${session.id}/tap`,
        { reason_id: reasonId, delta }, { headers: getAuthHeaders() });
      setSession(data);
    } catch {
      toast.error('Tap not saved — retrying');
      fetchInit();
    }
  };

  const totalRejected = session ? Object.values(session.counts || {}).reduce((a, b) => a + b, 0) : 0;

  const submit = async () => {
    if (crates <= 0) { toast.error('Set crates inspected first'); return; }
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API_URL}/production/qc-sessions/${session.id}/submit`, {}, { headers: getAuthHeaders() });
      toast.success(`Inspection saved — ${data.total_rejected} rejected`);
      resetAll();
      fetchInit();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const discard = async () => {
    if (!session) { resetAll(); return; }
    if (!window.confirm('Discard this QC session without saving?')) return;
    try { await axios.delete(`${API_URL}/production/qc-sessions/${session.id}`, { headers: getAuthHeaders() }); } catch { /* ok */ }
    resetAll();
  };

  const resetAll = () => { setStep('batch'); setBatch(null); setStage(null); setSession(null); setCrates(0); };

  const logout = () => {
    localStorage.removeItem('qc_operator');
    setOperator(null);
    resetAll();
  };

  if (loading) return <div className="flex items-center justify-center h-[70vh]"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  // Kiosk gate: require a QC operator (face/PIN) before anything else.
  if (!operator) return <QCKioskLogin onLogin={setOperator} />;

  // Small operator bar shown on every step.
  const OperatorBar = () => (
    <div className="flex items-center justify-end mb-3">
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-2 pr-1 py-1" data-testid="qc-operator-bar">
        <UserCircle2 size={18} className="text-emerald-500" />
        <span className="text-sm font-semibold text-slate-700" data-testid="qc-operator-name">{operator.name}</span>
        <button onClick={logout} className="ml-1 w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center" title="Logout" data-testid="qc-logout-btn">
          <LogOut size={14} className="text-red-500" />
        </button>
      </div>
    </div>
  );

  // ── STEP 1: Batch selection (filters · grouping · SKU colour-coding) ──
  if (step === 'batch') {
    const skuOptions = Array.from(new Map(batches.map(b => [b.sku_id || b.sku_name, b.sku_name])).entries());
    const q = search.trim().toLowerCase();
    const filtered = batches.filter(b => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (skuFilter !== 'all' && (b.sku_id || b.sku_name) !== skuFilter) return false;
      if (q && !(`${b.batch_code || b.batch_number || ''} ${b.sku_name || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });

    // Build groups
    const groups = {};
    filtered.forEach(b => {
      const key = groupBy === 'sku' ? (b.sku_id || b.sku_name || 'Other') : (b.status || 'other');
      (groups[key] = groups[key] || []).push(b);
    });
    // Float batches with crates waiting for QC to the top of each group
    Object.values(groups).forEach(list => list.sort((a, x) => waitingCrates(x) - waitingCrates(a)));
    const groupKeys = Object.keys(groups).sort((a, x) => groups[x].length - groups[a].length);

    // SKU legend (distinct SKUs currently shown)
    const legend = Array.from(new Map(filtered.map(b => [b.sku_id || b.sku_name, b])).values());

    const BatchCard = (b) => {
      const c = skuColor(b.sku_id || b.sku_name);
      const code = skuCode(b);
      const waiting = waitingCrates(b);
      const sm = STATUS_META[b.status] || { label: (b.status || '').replace(/_/g, ' '), cls: 'bg-slate-100 text-slate-600' };
      return (
        <button key={b.id} onClick={() => openBatch(b)}
          className="group bg-white border border-slate-200 rounded-2xl p-3 text-left hover:shadow-md hover:border-slate-300 transition-all active:scale-[0.98] flex items-stretch gap-3 overflow-hidden"
          style={{ borderLeft: `5px solid ${c.bg}` }}
          data-testid={`qc-batch-${b.id}`}>
          {/* SKU code tile */}
          <div className="flex flex-col items-center justify-center rounded-xl px-2.5 py-2 min-w-[3.5rem] flex-shrink-0"
            style={{ backgroundColor: c.soft }} data-testid={`qc-sku-tile-${b.id}`}>
            <span className="text-sm font-extrabold leading-none" style={{ color: c.text }}>{code}</span>
            <span className="text-[8px] uppercase tracking-wider mt-1 opacity-70" style={{ color: c.text }}>SKU</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-bold text-slate-800 truncate">{b.batch_code || b.batch_number || 'Batch'}</span>
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${sm.cls}`}>{sm.label}</span>
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">{b.sku_name}</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-[11px] text-slate-400">{(b.qc_stages || []).length} stages · {b.total_crates || b.total_produced || 0} crates{b.production_date ? ` · ${b.production_date}` : ''}</p>
              {waiting > 0 && (
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0" data-testid={`qc-waiting-${b.id}`}>
                  {waiting} waiting
                </span>
              )}
            </div>
          </div>
        </button>
      );
    };

    return (
      <div className="p-4 sm:p-8 max-w-[1300px] mx-auto" data-testid="qc-station-batch-step">
        <OperatorBar />
        <div className="mb-5">
          <h1 className="text-3xl font-bold tracking-tight text-slate-800">QC Station</h1>
          <p className="text-slate-500 mt-1">Select a batch to start capturing rejections</p>
        </div>

        {/* Filters + grouping toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-5" data-testid="qc-batch-filters">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search batch code or SKU…"
              className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm" data-testid="qc-batch-search" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white" data-testid="qc-status-filter">
            <option value="all">All statuses</option>
            {ACTIVE_STATUSES.map(s => <option key={s} value={s}>{(STATUS_META[s] || {}).label || s}</option>)}
          </select>
          <select value={skuFilter} onChange={e => setSkuFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white max-w-[200px]" data-testid="qc-sku-filter">
            <option value="all">All SKUs</option>
            {skuOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <div className="flex items-center bg-slate-100 rounded-xl p-1" data-testid="qc-groupby-toggle">
            <button onClick={() => setGroupBy('sku')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${groupBy === 'sku' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
              data-testid="qc-groupby-sku">
              <LayoutGrid size={13} /> By SKU
            </button>
            <button onClick={() => setGroupBy('status')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${groupBy === 'status' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
              data-testid="qc-groupby-status">
              <Layers size={13} /> By Stage
            </button>
          </div>
        </div>

        {/* SKU colour legend */}
        {legend.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5 px-1" data-testid="qc-sku-legend">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">SKU colours:</span>
            {legend.map(b => {
              const c = skuColor(b.sku_id || b.sku_name);
              return (
                <span key={b.sku_id || b.sku_name} className="flex items-center gap-1.5" data-testid={`qc-legend-${skuCode(b)}`}>
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: c.bg }} />
                  <span className="text-[11px] font-bold" style={{ color: c.text }}>{skuCode(b)}</span>
                  <span className="text-[11px] text-slate-500">{b.sku_name}</span>
                </span>
              );
            })}
          </div>
        )}

        {batches.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-10 text-center">
            <Factory className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <p className="text-slate-700 font-medium">No active batches in QC</p>
            <p className="text-sm text-slate-500 mt-1">Batches appear here once they enter a QC stage</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-10 text-center" data-testid="qc-no-match">
            <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-600 font-medium">No batches match your filters</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupKeys.map(key => {
              const list = groups[key];
              const first = list[0];
              const isSku = groupBy === 'sku';
              const c = isSku ? skuColor(key) : null;
              const headLabel = isSku ? (first.sku_name || 'Other') : ((STATUS_META[key] || {}).label || key.replace(/_/g, ' '));
              return (
                <div key={key} data-testid={`qc-group-${key}`}>
                  <div className="flex items-center gap-2 mb-2.5">
                    {isSku ? (
                      <span className="text-[11px] font-extrabold px-2 py-1 rounded-lg" style={{ backgroundColor: c.soft, color: c.text }}>{skuCode(first)}</span>
                    ) : (
                      <Layers size={15} className="text-slate-400" />
                    )}
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{headLabel}</h2>
                    <span className="text-xs text-slate-400 font-medium">({list.length})</span>
                    <div className="flex-1 h-px bg-slate-100 ml-2" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {list.map(BatchCard)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── STEP 2: Stage selection (mirrors the batch's stage flow) ──
  if (step === 'stage') {
    const stages = [...(batch.qc_stages || [])].sort((a, b) => a.order - b.order);
    return (
      <div className="p-4 sm:p-8 max-w-[1000px] mx-auto" data-testid="qc-station-stage-step">
        <OperatorBar />
        <button onClick={resetAll} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4" data-testid="qc-back-to-batches">
          <ChevronLeft size={16} /> Batches
        </button>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{batch.batch_code || batch.batch_number || batch.sku_name}</h1>
            <p className="text-slate-500">{batch.sku_name} · pick the QC stage</p>
          </div>
          <div className="bg-slate-100 rounded-xl px-4 py-2 text-center" data-testid="qc-unallocated">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Unallocated</p>
            <p className="text-xl font-extrabold text-slate-800">{batch.unallocated_crates || 0} <span className="text-xs font-medium text-slate-400">crates</span></p>
          </div>
        </div>
        <div className="space-y-4 mt-6">
          {stages.map(st => {
            const bal = balFor(batch, st.id);
            const pending = bal.pending || 0;
            const src = receiveSource(batch, st);
            const canInspect = pending > 0;
            return (
              <div key={st.id} className={`bg-white border rounded-2xl p-5 transition-all ${canInspect ? 'border-slate-200 hover:border-slate-800 hover:shadow-md' : 'border-slate-200 opacity-95'}`} data-testid={`qc-stage-${st.id}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xl font-bold text-slate-800">{st.name}</p>
                    <p className="text-sm text-slate-500 capitalize">{(st.stage_type || '').replace(/_/g, ' ')}</p>
                  </div>
                  {canInspect ? (
                    <button onClick={() => openStage(st)}
                      className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold flex items-center gap-2 active:scale-95"
                      data-testid={`qc-inspect-stage-${st.id}`}>
                      Inspect <ArrowRight size={16} />
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No crates pending — receive crates first</span>
                  )}
                </div>
                {/* Stage flow balances — same numbers as Batch Detail */}
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {[
                    { label: 'Received', value: bal.received || 0, unit: 'crates', cls: 'text-slate-700' },
                    { label: 'Pending', value: pending, unit: 'crates', cls: 'text-amber-600' },
                    { label: 'Passed', value: bal.passed || 0, unit: 'crates', cls: 'text-emerald-600' },
                    { label: 'Rejected', value: bal.rejected || 0, unit: 'bottles', cls: 'text-red-600' },
                  ].map(m => (
                    <div key={m.label} className="bg-slate-50 rounded-xl px-2 py-2 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{m.label}</p>
                      <p className={`text-lg font-extrabold ${m.cls}`}>{m.value}</p>
                      <p className="text-[9px] text-slate-400">{m.unit}</p>
                    </div>
                  ))}
                </div>
                {/* Inline receive — same move endpoint as Batch Detail */}
                {src.available > 0 && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap bg-blue-50/60 border border-blue-100 rounded-xl px-3 py-2.5" data-testid={`qc-receive-panel-${st.id}`}>
                    <MoveRight size={14} className="text-blue-500 flex-shrink-0" />
                    <span className="text-xs text-blue-700 font-medium">Receive from {src.label} ({src.available} available)</span>
                    <input type="number" min="1" max={src.available} placeholder={`Max ${src.available}`}
                      value={receiveQty[st.id] || ''}
                      onChange={e => setReceiveQty(p => ({ ...p, [st.id]: e.target.value }))}
                      className="w-24 border border-blue-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                      data-testid={`qc-receive-qty-${st.id}`} />
                    <button onClick={() => receiveCrates(st)} disabled={receiving === st.id}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1 active:scale-95"
                      data-testid={`qc-receive-btn-${st.id}`}>
                      {receiving === st.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Receive
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── STEP 3: Capture ──
  return (
    <div className="p-3 sm:p-6 max-w-[1300px] mx-auto" data-testid="qc-station-capture-step">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={async () => { await refreshBatch(); setStep('stage'); }} className="p-2 rounded-lg hover:bg-slate-100" data-testid="qc-back-to-stages">
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 leading-tight">{batch.batch_code || batch.batch_number || batch.sku_name || 'Batch'} · {stage.name}</h1>
            <p className="text-sm text-slate-500">{batch.sku_name} · <span className="text-amber-600 font-medium">{pendingFor(batch, stage.id)} crates pending</span> at this stage</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full" data-testid="qc-capture-operator">
            <UserCircle2 size={13} /> {operator.name}
          </span>
          <button onClick={discard} className="text-sm text-slate-400 hover:text-red-500 flex items-center gap-1" data-testid="qc-discard">
            <X size={15} /> Discard
          </button>
        </div>
      </div>

      {/* Crates inspected stepper */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5 flex items-center justify-between" data-testid="qc-crates-panel">
        <div>
          <p className="text-sm font-semibold text-slate-700">Crates inspected</p>
          <p className="text-xs text-slate-400">This session · each tile tap below = 1 rejected bottle</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => saveCrates(crates - 1)} className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center active:scale-95" data-testid="qc-crates-minus">
            <Minus size={18} className="text-slate-600" />
          </button>
          <input
            type="number" value={crates}
            onChange={e => saveCrates(parseInt(e.target.value || '0', 10))}
            className="w-20 text-center text-2xl font-bold text-slate-800 border border-slate-200 rounded-xl py-1"
            data-testid="qc-crates-input"
          />
          <button onClick={() => saveCrates(crates + 1)} className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center active:scale-95" data-testid="qc-crates-plus">
            <Icons.Plus size={18} className="text-white" />
          </button>
        </div>
      </div>

      {/* Reason tiles */}
      {reasons.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <p className="text-slate-700 font-medium">No rejection reasons configured</p>
          <p className="text-sm text-slate-500 mt-1">Ask an admin to add reasons with colours/icons</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="qc-reason-tiles">
          {reasons.map(r => {
            const count = session?.counts?.[r.id] || 0;
            const Ico = iconComponent(r.icon);
            return (
              <div key={r.id} className="relative select-none" data-testid={`qc-tile-${r.id}`}>
                <button
                  onClick={() => tap(r.id, 1)}
                  className="w-full aspect-square rounded-3xl flex flex-col items-center justify-center gap-2 shadow-sm hover:shadow-lg transition-all active:scale-95 overflow-hidden relative"
                  style={{ backgroundColor: r.color || '#334155' }}
                  data-testid={`qc-tile-tap-${r.id}`}
                >
                  {r.image ? (
                    <img src={r.image} alt={r.name} className="absolute inset-0 w-full h-full object-cover opacity-90" />
                  ) : (
                    <Ico size={48} className="text-white drop-shadow" />
                  )}
                  <span className="relative z-10 text-white font-semibold text-sm text-center px-2 drop-shadow bg-black/20 rounded-md" style={r.image ? { backgroundColor: 'rgba(0,0,0,0.45)' } : {}}>
                    {r.name}
                  </span>
                  {count > 0 && (
                    <span className="absolute top-2 right-2 z-20 min-w-[2rem] h-8 px-1.5 rounded-full bg-white text-slate-900 text-lg font-extrabold flex items-center justify-center shadow-md" data-testid={`qc-count-${r.id}`}>
                      {count}
                    </span>
                  )}
                </button>
                {count > 0 && (
                  <button
                    onClick={() => tap(r.id, -1)}
                    className="absolute bottom-2 left-2 z-20 w-9 h-9 rounded-full bg-white/95 border border-slate-200 flex items-center justify-center shadow hover:bg-white active:scale-90"
                    data-testid={`qc-minus-${r.id}`}
                    title="Undo one"
                  >
                    <Minus size={16} className="text-slate-700" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky submit bar */}
      <div className="sticky bottom-0 -mx-3 sm:-mx-6 mt-6 bg-white/95 backdrop-blur border-t border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 z-40" data-testid="qc-submit-bar">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Rejected bottles</p>
            <p className="text-2xl font-extrabold text-red-600" data-testid="qc-total-rejected">{totalRejected}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Crates</p>
            <p className="text-2xl font-extrabold text-slate-800">{crates}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setSession(s => ({ ...s, counts: {} })); }}
            className="hidden" aria-hidden />
          <button onClick={submit} disabled={submitting || crates <= 0}
            className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 disabled:opacity-50 active:scale-95"
            data-testid="qc-submit-btn">
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Submit Inspection
          </button>
        </div>
      </div>
    </div>
  );
}
