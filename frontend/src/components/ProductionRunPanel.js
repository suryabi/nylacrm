import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { CheckCircle2, Circle, Play, Square, FlaskConical, ClipboardCheck, Lock, FileText, ShieldAlert, RefreshCw, Undo2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const H = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` } });
const STEPS = [
  { key: 'pre_checklist', label: 'Pre-production checklist' }, { key: 'pre_qc', label: 'Quality parameters' },
  { key: 'production', label: 'Production' }, { key: 'output', label: 'Output' },
  { key: 'post_checklist', label: 'Post-production checklist' }, { key: 'close', label: 'Close' },
];
const fmt = (s) => (s || '').slice(0, 16).replace('T', ' ');
const err = (e) => e.response?.data?.detail || e.message;

const OverrideBox = ({ value, onChange, label }) => (
  <div className="mt-2 pt-2 border-t border-rose-200">
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" checked={!!value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} className="mt-0.5 h-4 w-4" data-testid="run-override-checkbox" />
      <span className="text-xs font-medium text-rose-700 flex items-center gap-1"><ShieldAlert size={12} /> {label} (CEO / System Admin) — reason required, admins notified</span>
    </label>
    {value.enabled && <input value={value.reason || ''} onChange={(e) => onChange({ ...value, reason: e.target.value })} placeholder="Reason *" className="mt-2 w-full text-xs border border-rose-200 rounded-md px-2 py-1.5" data-testid="run-override-reason" />}
  </div>
);

const ChecklistRows = ({ items, onTick, onUntick, busy }) => (
  <ul className="divide-y rounded-lg border bg-white">
    {items.map((it) => (
      <li key={it.id} className="flex items-start gap-3 px-3 py-2 text-sm" data-testid={`run-check-${it.id}`}>
        {busy[it.id] ? <RefreshCw size={16} className="mt-0.5 animate-spin text-emerald-600" />
          : it.cleared ? <button onClick={() => it.can_undo && onUntick(it)} title={it.can_undo ? 'Undo' : ''} disabled={!it.can_undo} data-testid={`run-check-undo-${it.id}`}><CheckCircle2 size={18} className="text-emerald-600" /></button>
          : it.can_tick ? <button onClick={() => onTick(it)} data-testid={`run-check-tick-${it.id}`}><Circle size={18} className="text-slate-400 hover:text-emerald-600" /></button>
          : <Lock size={16} className="mt-0.5 text-slate-400" />}
        <div className="flex-1 min-w-0">
          <span className={`inline-block mr-1 px-1 rounded text-[10px] font-bold ${it.kind === 'post' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'}`}>{it.kind === 'post' ? 'AFTER RUN' : 'BEFORE RUN'}</span>
          <span className="font-medium">{it.name}</span>{it.kind === 'post' && it.batch_code && <span className="text-slate-500 text-xs"> · after batch {it.batch_code}</span>}
          <p className="text-xs text-slate-500">
            {it.cleared ? <span className="text-emerald-700">Done by {it.record?.performed_by} · {fmt(it.record?.completed_at)}{it.can_undo ? ' · click to undo' : ''}</span>
              : it.can_tick ? 'Pending — click the circle to record it now' : `Pending — assigned staff${it.assigned_staff?.length ? ` (${it.assigned_staff.map((s) => s.name).join(', ')})` : ''} must record via QR`}
          </p>
        </div>
      </li>
    ))}
    {items.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">No equipment configured for this step.</li>}
  </ul>
);

export const ProductionRunPanel = ({ batch, onUpdate }) => {
  const [data, setData] = useState(null);
  const [values, setValues] = useState({});
  const [ov, setOv] = useState({ enabled: false, reason: '' });
  const [crates, setCrates] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => axios.get(`${API_URL}/api/production/run/${batch.id}`, H()).then(({ data: d }) => {
    setData(d);
    if (d.run?.pre_qc?.values) setValues(d.run.pre_qc.values);
  }).catch((e) => toast.error(err(e))), [batch.id]);
  useEffect(() => { load(); }, [load, batch.status]);
  if (!data) return null;

  const { run, checklist, params, post_tasks, is_elevated } = data;
  const status = data.batch.status;
  const stepIdx = status === 'planned' ? (run.pre_qc?.passed || run.pre_qc?.override ? 2 : (checklist?.all_clear ? 1 : 0)) : status === 'in_production' ? 3 : status === 'post_checklist' ? 4 : 6;
  const refresh = async () => { await load(); onUpdate?.(); };
  const act = async (fn, ok) => { setSaving(true); try { await fn(); toast.success(ok); await refresh(); setOv({ enabled: false, reason: '' }); } catch (e) { toast.error(err(e)); await load(); } finally { setSaving(false); } };
  const ovBody = { override: ov.enabled, override_reason: ov.reason };

  const tick = (it) => act(() => axios.post(`${API_URL}/api/maintenance/pre-production/${it.kind === 'post' ? `post/${it.task_id}/complete` : `${it.id}/clear`}`, {}, H()), `${it.name} recorded`);
  const untick = (it) => act(() => axios.post(`${API_URL}/api/maintenance/pre-production/${it.kind === 'post' ? `post/${it.task_id}/undo` : `${it.id}/undo`}`, {}, H()), `${it.name} undone`);
  const postItems = (post_tasks || []).map((t) => ({ id: t.id, task_id: t.id, kind: 'post', name: t.equipment_name, cleared: t.status === 'completed', can_tick: t.status !== 'completed', can_undo: t.status === 'completed' && !t.consumed_by_batch_id, record: { performed_by: t.performed_by, completed_at: t.completed_at } }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-4" data-testid="production-run-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-slate-800 flex items-center gap-2"><Play size={16} className="text-blue-600" /> Production Run</h2>
        {run.closed_at && <a href={`${API_URL}/api/production/run/${batch.id}/report.pdf`} target="_blank" rel="noreferrer" onClick={async (e) => { e.preventDefault(); const r = await axios.get(`${API_URL}/api/production/run/${batch.id}/report.pdf`, { ...H(), responseType: 'blob' }); window.open(URL.createObjectURL(r.data), '_blank'); }}
          className="text-xs font-semibold text-blue-700 hover:underline flex items-center gap-1" data-testid="run-report-link"><FileText size={14} /> Batch Run Report (PDF)</a>}
      </div>
      <ol className="flex flex-wrap gap-1.5" data-testid="run-stepper">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${i < stepIdx ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : i === stepIdx ? 'bg-blue-600 border-blue-600 text-white font-semibold' : 'bg-slate-50 border-slate-200 text-slate-400'}`} data-testid={`run-step-${s.key}`}>
            {i < stepIdx ? <CheckCircle2 size={12} /> : <span className="w-3 text-center">{i + 1}</span>} {s.label}
          </li>
        ))}
      </ol>

      {status === 'planned' && (
        <>
          <section className="space-y-2" data-testid="run-pre-checklist">
            <p className="text-sm font-semibold flex items-center gap-1"><ClipboardCheck size={14} className="text-amber-600" /> 1 · Pre-production equipment checklist {checklist?.all_clear ? <span className="text-emerald-700 text-xs">— complete</span> : <span className="text-amber-700 text-xs">— {checklist?.pending.length} pending</span>}</p>
            <ChecklistRows items={[...(checklist?.items || []), ...(checklist?.post_items || [])]} onTick={tick} onUntick={untick} busy={busy} />
          </section>
          <section className="space-y-2" data-testid="run-pre-qc">
            <p className="text-sm font-semibold flex items-center gap-1"><FlaskConical size={14} className="text-violet-600" /> 2 · Pre-production quality parameters
              {run.pre_qc && (run.pre_qc.passed ? <span className="text-emerald-700 text-xs">— recorded by {run.pre_qc.recorded_by}, in range</span> : run.pre_qc.override ? <span className="text-rose-700 text-xs">— out of range, overridden</span> : <span className="text-rose-700 text-xs">— out of range</span>)}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {params.params.map((p) => (
                <label key={p.key} className="text-xs">
                  <span className="text-slate-600 font-medium">{p.name}{p.unit ? ` (${p.unit})` : ''}{p.required ? ' *' : ''}</span>
                  <Input type="number" step="any" value={values[p.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value === '' ? null : parseFloat(e.target.value) }))} className="h-9 mt-0.5" data-testid={`run-param-${p.key}`} />
                  <span className="text-[10px] text-slate-400">{p.min ?? '–'} – {p.max ?? '–'}</span>
                </label>
              ))}
            </div>
            {run.pre_qc?.out_of_range?.length > 0 && <p className="text-xs text-rose-700" data-testid="run-param-out">Out of range: {run.pre_qc.out_of_range.join('; ')}</p>}
            {run.pre_qc && !run.pre_qc.passed && is_elevated && <OverrideBox value={ov} onChange={setOv} label="Accept out-of-range values" />}
            <Button size="sm" variant="outline" disabled={saving} onClick={() => act(() => axios.post(`${API_URL}/api/production/run/${batch.id}/params`, { values, ...ovBody }, H()), 'Quality parameters recorded')} data-testid="run-save-params">Save parameters</Button>
          </section>
          <section className="pt-2 border-t" data-testid="run-start-section">
            {(!checklist?.all_clear || !(run.pre_qc?.passed || run.pre_qc?.override)) && is_elevated && !(run.pre_qc && !run.pre_qc.passed) && <OverrideBox value={ov} onChange={setOv} label="Start despite pending checks" />}
            <Button className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold" disabled={saving} onClick={() => act(() => axios.post(`${API_URL}/api/production/run/${batch.id}/start`, ovBody, H()), 'Production started')} data-testid="run-start-btn"><Play size={14} className="mr-1" /> 3 · Start Production</Button>
          </section>
        </>
      )}

      {status === 'in_production' && (
        <section className="space-y-2" data-testid="run-stop-section">
          <p className="text-sm text-slate-600">Started by <b>{run.started_by}</b> at {fmt(run.started_at)} UTC.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <label className="text-xs"><span className="font-medium text-slate-600">Crates produced *</span><Input type="number" min="1" value={crates} onChange={(e) => setCrates(e.target.value)} className="h-9 mt-0.5" data-testid="run-crates-input" /></label>
            <label className="text-xs sm:col-span-2"><span className="font-medium text-slate-600">Notes</span><Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 mt-0.5" data-testid="run-output-notes" /></label>
          </div>
          {crates && <p className="text-xs text-slate-500">= {(parseInt(crates || 0) * (data.batch.bottles_per_crate || 0)).toLocaleString()} bottles</p>}
          <Button className="bg-rose-600 hover:bg-rose-700 text-white font-bold" disabled={saving || !crates} onClick={() => act(() => axios.post(`${API_URL}/api/production/run/${batch.id}/stop`, { total_crates: parseInt(crates), notes }, H()), 'Production stopped — output captured')} data-testid="run-stop-btn"><Square size={14} className="mr-1" /> 4 · Stop Production & capture output</Button>
        </section>
      )}

      {status === 'post_checklist' && (
        <section className="space-y-2" data-testid="run-post-section">
          <p className="text-sm text-slate-600">Output: <b>{data.batch.total_crates}</b> crates · {data.batch.total_bottles} bottles · stopped by {run.stopped_by} at {fmt(run.stopped_at)} UTC.</p>
          <p className="text-sm font-semibold flex items-center gap-1"><ClipboardCheck size={14} className="text-sky-600" /> 5 · Post-production equipment checklist</p>
          <ChecklistRows items={postItems} onTick={tick} onUntick={untick} busy={busy} />
          {postItems.some((i) => !i.cleared) && is_elevated && <OverrideBox value={ov} onChange={setOv} label="Close with pending cleanups" />}
          <Button className="bg-slate-900 hover:bg-slate-800 text-white font-bold" disabled={saving} onClick={() => act(() => axios.post(`${API_URL}/api/production/run/${batch.id}/close`, ovBody, H()), 'Batch closed — report generated & team notified')} data-testid="run-close-btn"><CheckCircle2 size={14} className="mr-1" /> 6 · Close Production Batch</Button>
        </section>
      )}

      {run.closed_at && (
        <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1" data-testid="run-summary">
          <span>Started {fmt(run.started_at)} by {run.started_by}</span><span>Stopped {fmt(run.stopped_at)} by {run.stopped_by}</span><span>Closed {fmt(run.closed_at)} by {run.closed_by}</span>
          {run.pre_qc && <span>Parameters: {Object.entries(run.pre_qc.values || {}).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`).join(', ')}</span>}
          {(run.start_override || run.close_override || run.pre_qc?.override) && <span className="text-rose-700 font-semibold flex items-center gap-1"><Undo2 size={12} /> overrides applied</span>}
        </div>
      )}
    </div>
  );
};

export default ProductionRunPanel;
