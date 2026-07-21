import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import * as Icons from 'lucide-react';
import { Loader2, ChevronLeft, Minus, Check, Factory, ArrowRight, PackageCheck, RotateCcw, X } from 'lucide-react';

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

export default function QCStation() {
  const [step, setStep] = useState('batch');    // batch | stage | capture
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [batch, setBatch] = useState(null);
  const [stage, setStage] = useState(null);
  const [session, setSession] = useState(null);
  const [crates, setCrates] = useState(0);
  const [submitting, setSubmitting] = useState(false);

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
    } catch {
      toast.error('Failed to open batch');
    }
  };

  const pendingFor = (b, stageId) => (b.stage_balances?.[stageId]?.pending) || 0;

  const openStage = async (st) => {
    setStage(st);
    // Resume an open session if one exists, else start fresh
    try {
      const { data: active } = await axios.get(
        `${API_URL}/production/qc-sessions/active?batch_id=${batch.id}&stage_id=${st.id}`,
        { headers: getAuthHeaders() }
      );
      if (active) {
        setSession(active);
        setCrates(active.crates_inspected || 0);
      } else {
        const { data } = await axios.post(`${API_URL}/production/qc-sessions`,
          { batch_id: batch.id, stage_id: st.id, crates_inspected: 0 }, { headers: getAuthHeaders() });
        setSession(data);
        setCrates(0);
      }
      setStep('capture');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not start session');
    }
  };

  const saveCrates = async (val) => {
    const v = Math.max(0, val);
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

  if (loading) return <div className="flex items-center justify-center h-[70vh]"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  // ── STEP 1: Batch selection ──
  if (step === 'batch') {
    return (
      <div className="p-4 sm:p-8 max-w-[1200px] mx-auto" data-testid="qc-station-batch-step">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-slate-800">QC Station</h1>
          <p className="text-slate-500 mt-1">Select a batch to start capturing rejections</p>
        </div>
        {batches.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-10 text-center">
            <Factory className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <p className="text-slate-700 font-medium">No active batches in QC</p>
            <p className="text-sm text-slate-500 mt-1">Batches appear here once they enter a QC stage</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {batches.map(b => (
              <button key={b.id} onClick={() => openBatch(b)}
                className="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-slate-800 hover:shadow-md transition-all active:scale-[0.98]"
                data-testid={`qc-batch-${b.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-bold text-slate-800">{b.batch_number || 'Batch'}</span>
                  <span className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{(b.status || '').replace(/_/g, ' ')}</span>
                </div>
                <p className="text-sm text-slate-600 truncate">{b.sku_name}</p>
                <p className="text-xs text-slate-400 mt-2">{(b.qc_stages || []).length} stages · {b.total_crates || b.total_produced || 0} crates</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── STEP 2: Stage selection ──
  if (step === 'stage') {
    const stages = [...(batch.qc_stages || [])].sort((a, b) => a.order - b.order);
    return (
      <div className="p-4 sm:p-8 max-w-[1000px] mx-auto" data-testid="qc-station-stage-step">
        <button onClick={resetAll} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4" data-testid="qc-back-to-batches">
          <ChevronLeft size={16} /> Batches
        </button>
        <h1 className="text-2xl font-bold text-slate-800">{batch.batch_number}</h1>
        <p className="text-slate-500 mb-6">{batch.sku_name} · pick the QC stage</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {stages.map(st => {
            const pending = pendingFor(batch, st.id);
            return (
              <button key={st.id} onClick={() => openStage(st)}
                className="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-slate-800 hover:shadow-md transition-all active:scale-[0.98] flex items-center justify-between"
                data-testid={`qc-stage-${st.id}`}>
                <div>
                  <p className="text-xl font-bold text-slate-800">{st.name}</p>
                  <p className="text-sm text-slate-500 capitalize mt-0.5">{(st.stage_type || '').replace(/_/g, ' ')}</p>
                  <p className="text-xs text-slate-400 mt-2">{pending} crates pending</p>
                </div>
                <ArrowRight className="text-slate-300" />
              </button>
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
          <button onClick={() => setStep('stage')} className="p-2 rounded-lg hover:bg-slate-100" data-testid="qc-back-to-stages">
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 leading-tight">{batch.batch_number || batch.sku_name || 'Batch'} · {stage.name}</h1>
            <p className="text-sm text-slate-500">{batch.sku_name}</p>
          </div>
        </div>
        <button onClick={discard} className="text-sm text-slate-400 hover:text-red-500 flex items-center gap-1" data-testid="qc-discard">
          <X size={15} /> Discard
        </button>
      </div>

      {/* Crates inspected stepper */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-5 flex items-center justify-between" data-testid="qc-crates-panel">
        <div>
          <p className="text-sm font-semibold text-slate-700">Crates inspected</p>
          <p className="text-xs text-slate-400">This session</p>
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
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Total rejected</p>
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
