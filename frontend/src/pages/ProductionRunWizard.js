import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ParamCaptureDialog } from '../components/MaintenanceParams';
import { ChecklistRows, OverrideBox, fmt } from '../components/ProductionRunPanel';
import { ArrowLeft, CheckCircle2, ClipboardCheck, Play, Square, PackageCheck, RefreshCw, XCircle, Timer, Tag } from 'lucide-react';
import { scanAuthHeaders, getStaffSession, hasAppSession } from '../lib/staffSession';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const H = () => ({ headers: scanAuthHeaders() });
// Staff phone (Start Production QR) has no app session → navigate within the public flow.
const staffMode = () => !hasAppSession() && !!getStaffSession();
const homePath = () => (staffMode() ? `/start-production/${localStorage.getItem('start_production_tenant')}` : '/production-batches');
const err = (e) => e.response?.data?.detail || e.message;
const STEPS = [
  { key: 'pre', label: 'Pre-Production Checklist', icon: ClipboardCheck },
  { key: 'start', label: 'Start Production', icon: Play },
  { key: 'stop', label: 'Stop Production', icon: Square },
  { key: 'post', label: 'Post-Production Checklist', icon: ClipboardCheck },
  { key: 'create', label: 'Create Production Batch', icon: PackageCheck },
];

const Stepper = ({ idx }) => (
  <ol className="grid grid-cols-5 gap-1" data-testid="wizard-stepper">
    {STEPS.map((s, i) => {
      const state = i < idx ? 'done' : i === idx ? 'active' : 'todo';
      const Icon = state === 'done' ? CheckCircle2 : s.icon;
      return (
        <li key={s.key} className="flex flex-col items-center text-center gap-1" data-testid={`wizard-step-${s.key}`} data-state={state}>
          <div className={`h-9 w-9 rounded-full flex items-center justify-center border-2 ${state === 'done' ? 'bg-emerald-600 border-emerald-600 text-white' : state === 'active' ? 'bg-[#002FA7] border-[#002FA7] text-white shadow-lg shadow-blue-200' : 'bg-white border-slate-200 text-slate-400'}`}><Icon size={16} /></div>
          <span className={`text-[10px] sm:text-xs leading-tight ${state === 'active' ? 'font-bold text-[#002FA7]' : state === 'done' ? 'text-emerald-700' : 'text-slate-400'}`}>{s.label}</span>
        </li>
      );
    })}
  </ol>
);

const Elapsed = ({ since }) => {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return <span className="font-mono text-2xl font-bold text-slate-800 tabular-nums" data-testid="wizard-elapsed">{p(Math.floor(s / 3600))}:{p(Math.floor((s % 3600) / 60))}:{p(s % 60)}</span>;
};

const Progress = ({ done, total }) => (
  <div className="flex items-center gap-3">
    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${total ? (done / total) * 100 : 100}%` }} /></div>
    <span className="text-xs font-semibold text-slate-600" data-testid="wizard-progress">{done}/{total} done</span>
  </div>
);

export default function ProductionRunWizard() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [ov, setOv] = useState({ enabled: false, reason: '' });
  const [crates, setCrates] = useState('');
  const [notes, setNotes] = useState('');
  const [finalForm, setFinalForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [capture, setCapture] = useState(null);

  const load = useCallback(() => axios.get(`${API_URL}/api/production/run/${batchId}`, H()).then(({ data: d }) => {
    setData(d);
    if (d.batch.status === 'created' || d.run?.closed_at) navigate(staffMode() ? `${homePath()}?done=${encodeURIComponent(d.batch.batch_code)}` : `/production-batches/${batchId}`, { replace: true });
  }).catch((e) => { toast.error(err(e)); navigate(homePath(), { replace: true }); }), [batchId, navigate]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (data?.batch.status === 'post_checklist' && !finalForm) {
      setFinalForm({ batch_code: data.batch.batch_code, production_date: data.batch.production_date, total_crates: String(data.batch.total_crates || ''), bottles_per_crate: String(data.batch.bottles_per_crate || ''), notes: data.run.output_notes || '' });
    }
  }, [data, finalForm]);

  if (!data) return <div className="p-8 text-sm text-slate-500 flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading production run…</div>;

  const { run, checklist, post_tasks, is_elevated, batch } = data;
  const status = batch.status;
  const stepIdx = status === 'planned' ? (checklist?.all_clear ? 1 : 0) : status === 'in_production' ? 2 : 3;
  const act = async (fn, ok) => { setSaving(true); try { const r = await fn(); toast.success(ok); await load(); setOv({ enabled: false, reason: '' }); return r; } catch (e) { toast.error(err(e)); await load(); } finally { setSaving(false); } };
  const ovBody = { override: ov.enabled, override_reason: ov.reason };

  const tick = (it, values) => {
    if ((it.maintenance_parameters || []).length && values === undefined) { setCapture(it); return; }
    setCapture(null);
    return act(() => axios.post(`${API_URL}/api/maintenance/pre-production/${it.kind === 'post' ? `post/${it.task_id}/complete` : `${it.id}/clear`}`, { parameter_values: values || null }, H()), `${it.name} recorded`);
  };
  const untick = (it) => act(() => axios.post(`${API_URL}/api/maintenance/pre-production/${it.kind === 'post' ? `post/${it.task_id}/undo` : `${it.id}/undo`}`, {}, H()), `${it.name} undone`);
  const preItems = [...(checklist?.items || []), ...(checklist?.post_items || [])];
  const postItems = (post_tasks || []).map((t) => ({ id: t.id, task_id: t.id, kind: 'post', name: t.equipment_name, equipment_id: t.equipment_id, maintenance_parameters: t.maintenance_parameters || [], cleared: t.status === 'completed', can_tick: t.status !== 'completed', can_undo: t.status === 'completed' && !t.consumed_by_batch_id, record: { id: t.record_id, performed_by: t.performed_by, completed_at: t.completed_at, parameters: t.parameters || [] } }));
  const postPending = postItems.filter((i) => !i.cleared).length;

  const cancel = async () => {
    if (!window.confirm(`Cancel this production run (${batch.batch_code})? The draft batch will be removed.`)) return;
    try { await axios.post(`${API_URL}/api/production/run/${batchId}/cancel`, {}, H()); toast.success('Production run cancelled'); navigate(homePath()); } catch (e) { toast.error(err(e)); }
  };
  const createBatch = () => act(async () => {
    await axios.post(`${API_URL}/api/production/run/${batchId}/close`, { ...ovBody, batch_code: finalForm.batch_code, production_date: finalForm.production_date, total_crates: parseInt(finalForm.total_crates), bottles_per_crate: parseInt(finalForm.bottles_per_crate), notes: finalForm.notes }, H());
    navigate(staffMode() ? `${homePath()}?done=${encodeURIComponent(finalForm.batch_code)}` : `/production-batches/${batchId}`);
  }, 'Production batch created — run report generated & team notified');

  return (
    <div className="max-w-4xl mx-auto space-y-6 px-3 sm:px-4 pt-4 pb-12" data-testid="production-run-wizard">
      <ParamCaptureDialog item={capture} onCancel={() => setCapture(null)} onSubmit={(vals) => tick(capture, vals)} />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={() => navigate(homePath())} className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1" data-testid="wizard-back"><ArrowLeft size={14} /> {staffMode() ? 'Start Production' : 'Production Batches'}</button>
        <button onClick={cancel} className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1" data-testid="wizard-cancel-run"><XCircle size={14} /> Cancel run</button>
      </div>
      <div className="rounded-2xl bg-[#002FA7] text-white px-5 py-4 shadow-md">
        <p className="text-[11px] uppercase tracking-widest text-blue-200 font-semibold">Production Run · {batch.batch_code}</p>
        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-0.5 flex items-center gap-2" data-testid="wizard-sku-name"><Tag size={20} className="text-blue-200" /> {batch.sku_name}</h1>
        <p className="text-xs text-blue-100 mt-1">{batch.production_date} · {batch.bottles_per_crate} bottles / crate · initiated by {batch.created_by_name}</p>
      </div>
      <Stepper idx={stepIdx} />

      {status === 'planned' && (
        <section className="rounded-xl border bg-white shadow-sm p-4 sm:p-5 space-y-4" data-testid="wizard-pre-section">
          <div>
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><ClipboardCheck size={18} className="text-amber-600" /> Pre-Production Checklist</h2>
            <p className="text-xs text-slate-500 mt-0.5">Equipment maintenance configured as “Before Production” for <b>{batch.sku_name}</b>. Tick each item and capture its parameters.</p>
          </div>
          <Progress done={preItems.filter((i) => i.cleared).length} total={preItems.length} />
          <ChecklistRows items={preItems} onTick={tick} onUntick={untick} busy={{}} />
          <div className="pt-3 border-t">
            {!checklist?.all_clear && <p className="text-xs text-amber-700 font-medium" data-testid="wizard-start-blocked">Start Production unlocks once all mandatory checklist activities are completed ({checklist?.pending.length} pending).</p>}
            {!checklist?.all_clear && is_elevated && <OverrideBox value={ov} onChange={setOv} label="Start despite pending checks" />}
            <Button className="mt-3 w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 px-6" disabled={saving || (!checklist?.all_clear && !(ov.enabled && ov.reason.trim()))}
              onClick={() => act(() => axios.post(`${API_URL}/api/production/run/${batchId}/start`, ovBody, H()), 'Production started')} data-testid="wizard-start-btn"><Play size={16} className="mr-2" /> Start Production</Button>
          </div>
        </section>
      )}

      {status === 'in_production' && (
        <section className="rounded-xl border bg-white shadow-sm p-4 sm:p-5 space-y-4" data-testid="wizard-production-section">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><Timer size={18} className="text-sky-600" /> Production in progress</h2>
              <p className="text-xs text-slate-500 mt-0.5">Started by <b>{run.started_by}</b> at {fmt(run.started_at)} UTC</p>
            </div>
            <Elapsed since={run.started_at} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-3 border-t">
            <label className="text-xs"><span className="font-medium text-slate-600">Crates produced *</span><Input type="number" min="1" value={crates} onChange={(e) => setCrates(e.target.value)} className="h-10 mt-0.5" data-testid="wizard-crates-input" /></label>
            <label className="text-xs sm:col-span-2"><span className="font-medium text-slate-600">Notes</span><Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-10 mt-0.5" data-testid="wizard-output-notes" /></label>
          </div>
          {crates && <p className="text-xs text-slate-500">= {(parseInt(crates || 0) * (batch.bottles_per_crate || 0)).toLocaleString()} bottles</p>}
          <Button className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-bold h-11 px-6" disabled={saving || !crates || parseInt(crates) <= 0}
            onClick={() => act(() => axios.post(`${API_URL}/api/production/run/${batchId}/stop`, { total_crates: parseInt(crates), notes }, H()), 'Production stopped — continue with the post-production checklist')} data-testid="wizard-stop-btn"><Square size={16} className="mr-2" /> Stop Production</Button>
        </section>
      )}

      {status === 'post_checklist' && finalForm && (
        <>
          <section className="rounded-xl border bg-white shadow-sm p-4 sm:p-5 space-y-4" data-testid="wizard-post-section">
            <div>
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><ClipboardCheck size={18} className="text-sky-600" /> Post-Production Checklist</h2>
              <p className="text-xs text-slate-500 mt-0.5">Equipment maintenance configured as “After Production”. Production ran {fmt(run.started_at)} → {fmt(run.stopped_at)} UTC · {batch.total_crates} crates captured.</p>
            </div>
            <Progress done={postItems.length - postPending} total={postItems.length} />
            <ChecklistRows items={postItems} onTick={tick} onUntick={untick} busy={{}} />
          </section>
          <section className="rounded-xl border-2 border-[#002FA7]/20 bg-white shadow-sm p-4 sm:p-5 space-y-4" data-testid="wizard-create-section">
            <h2 className="font-bold text-slate-800 flex items-center gap-2"><PackageCheck size={18} className="text-[#002FA7]" /> Create Production Batch</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs"><span className="font-medium text-slate-600">Batch code</span><Input value={finalForm.batch_code} onChange={(e) => setFinalForm({ ...finalForm, batch_code: e.target.value })} className="h-10 mt-0.5 font-mono" data-testid="wizard-final-code" /></label>
              <label className="text-xs"><span className="font-medium text-slate-600">Production date</span><Input type="date" value={finalForm.production_date} onChange={(e) => setFinalForm({ ...finalForm, production_date: e.target.value })} className="h-10 mt-0.5" data-testid="wizard-final-date" /></label>
              <label className="text-xs"><span className="font-medium text-slate-600">Crates produced *</span><Input type="number" min="1" value={finalForm.total_crates} onChange={(e) => setFinalForm({ ...finalForm, total_crates: e.target.value })} className="h-10 mt-0.5" data-testid="wizard-final-crates" />
                <span className="text-[10px] text-slate-400">= {(parseInt(finalForm.total_crates || 0) * parseInt(finalForm.bottles_per_crate || 0)).toLocaleString()} bottles</span></label>
              <label className="text-xs"><span className="font-medium text-slate-600">Bottles per crate *</span><Input type="number" min="1" value={finalForm.bottles_per_crate} onChange={(e) => setFinalForm({ ...finalForm, bottles_per_crate: e.target.value })} className="h-10 mt-0.5" data-testid="wizard-final-bpc" /></label>
              <label className="text-xs"><span className="font-medium text-slate-600">Notes</span><Input value={finalForm.notes} onChange={(e) => setFinalForm({ ...finalForm, notes: e.target.value })} className="h-10 mt-0.5" data-testid="wizard-final-notes" /></label>
            </div>
            {postPending > 0 && <p className="text-xs text-amber-700 font-medium" data-testid="wizard-create-blocked">Complete the {postPending} pending post-production activit{postPending > 1 ? 'ies' : 'y'} to create the batch.</p>}
            {postPending > 0 && is_elevated && <OverrideBox value={ov} onChange={setOv} label="Create with pending cleanups" />}
            <Button className="w-full sm:w-auto bg-[#002FA7] hover:bg-blue-800 text-white font-bold h-11 px-6" disabled={saving || !finalForm.batch_code.trim() || !(parseInt(finalForm.total_crates) > 0) || !(parseInt(finalForm.bottles_per_crate) > 0) || (postPending > 0 && !(ov.enabled && ov.reason.trim()))}
              onClick={createBatch} data-testid="wizard-create-btn"><CheckCircle2 size={16} className="mr-2" /> Create Production Batch</Button>
          </section>
        </>
      )}
    </div>
  );
}
