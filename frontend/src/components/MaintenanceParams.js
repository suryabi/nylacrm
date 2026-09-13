import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Gauge, Plus, Trash2, Camera, X, AlertTriangle, ImageIcon } from 'lucide-react';
import { scanAuthHeaders } from '../lib/staffSession';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const outOfRange = (p, v) => v != null && v !== '' && ((p.min != null && v < p.min) || (p.max != null && v > p.max));
export const PARAM_TYPES = [{ v: 'number', l: 'Number' }, { v: 'text', l: 'Text box' }, { v: 'radio', l: 'Options (radio · pick one)' }, { v: 'checkbox', l: 'Options (checkbox · pick many)' }];
const ptype = (p) => p.type || 'number';
const isChoice = (p) => ['radio', 'checkbox'].includes(ptype(p));

// Frontend state → API payload: {key: value} or {key: {value, photo_ids}} when photos attached.
export const toParamPayload = (values) => Object.fromEntries(Object.entries(values || {}).map(([k, v]) => {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) return [k, { value: v.value ?? null, photo_ids: (v.photos || []).map((p) => p.id) }];
  return [k, v ?? null];
}));
const val = (v) => (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v ? v.value : v);
const chosen = (p, v) => { const x = val(v); return x == null || x === '' ? [] : (Array.isArray(x) ? x : [x]); };
const photosOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v.photos || [] : []);

// One-line human summary of a captured parameter row (records, checklist rows).
export const formatParam = (p) => {
  const v = p.value;
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
  const s = Array.isArray(v) ? v.join(', ') : String(v);
  return `${p.name}: ${s}${p.unit ? ' ' + p.unit : ''}${p.in_range === false ? ' ⚠' : ''}${(p.photos || []).length ? ` (${p.photos.length} photo)` : ''}`;
};
export const formatParams = (ps) => (ps || []).map(formatParam).filter(Boolean).join(' · ');

// Which required inputs are still missing (value or option photo) — mirrors backend validation.
export const missingParams = (params, values) => params.filter((p) => {
  const v = values[p.key];
  const c = chosen(p, v);
  if (isChoice(p)) {
    if (c.some((l) => (p.options || []).find((o) => o.label === l)?.photo_required) && !photosOf(v).length) return true;
    return p.required !== false && !c.length;
  }
  const x = val(v);
  return p.required !== false && (x == null || x === '');
});

// Live camera capture → timestamp-burned JPEG → uploaded against the equipment; returns photo meta.
const LiveCamera = ({ equipmentId, onCaptured, testid }) => {
  const videoRef = useRef(null); const streamRef = useRef(null);
  const [on, setOn] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream; setOn(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 100);
    } catch { toast.error('Camera access denied or unavailable. Photos must be captured live — gallery uploads are not allowed.'); }
  };
  const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setOn(false); };
  const snap = () => {
    const video = videoRef.current; if (!video?.videoWidth) return;
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(video, 0, 0);
    const ts = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const fs = Math.max(18, Math.round(c.width * 0.03)); ctx.font = `bold ${fs}px Arial`; const pad = fs * 0.6; const tw = ctx.measureText(ts).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(c.width - tw - pad * 2, c.height - fs - pad * 1.8, tw + pad * 2, fs + pad * 1.8);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'bottom'; ctx.fillText(ts, c.width - tw - pad, c.height - pad * 0.9);
    c.toBlob(async (blob) => {
      if (!blob) return; setBusy(true);
      try {
        const fd = new FormData(); fd.append('file', blob, 'capture.jpg');
        const res = await fetch(`${API_URL}/api/maintenance/equipment/${equipmentId}/param-photo`, { method: 'POST', headers: scanAuthHeaders(), body: fd });
        if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
        onCaptured({ ...(await res.json()), preview: c.toDataURL('image/jpeg', 0.6) }); stop();
      } catch (e) { toast.error(e.message); } finally { setBusy(false); }
    }, 'image/jpeg', 0.85);
  };
  if (!on) return <Button type="button" size="sm" variant="outline" onClick={start} className="h-8 text-xs" data-testid={`${testid}-camera`}><Camera className="h-3.5 w-3.5 mr-1" /> Take live photo</Button>;
  return (
    <div className="rounded-md overflow-hidden border bg-black">
      <video ref={videoRef} playsInline muted className="w-full max-h-48 object-contain" data-testid={`${testid}-video`} />
      <div className="flex gap-2 p-2 bg-slate-900">
        <Button type="button" size="sm" onClick={snap} disabled={busy} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-8" data-testid={`${testid}-snap`}><Camera className="h-3.5 w-3.5 mr-1" /> {busy ? 'Uploading…' : 'Capture'}</Button>
        <Button type="button" size="sm" variant="secondary" onClick={stop} className="h-8">Cancel</Button>
      </div>
    </div>
  );
};

// Inline inputs for capturing values against an equipment's parameter definitions (typed).
export const ParamInputs = ({ params, values, onChange, equipmentId, testid = 'param' }) => {
  const set = (p, patch) => onChange({ ...values, [p.key]: patch });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid={`${testid}-inputs`}>
      {params.map((p) => {
        const v = values[p.key]; const t = ptype(p);
        const label = <span className="font-medium text-slate-700">{p.name}{p.unit ? ` (${p.unit})` : ''}{p.required !== false ? ' *' : ''}</span>;
        if (t === 'number') {
          const bad = outOfRange(p, v);
          return (
            <label key={p.key} className="text-xs">{label}
              <Input type="number" step="any" inputMode="decimal" value={v ?? ''} onChange={(e) => set(p, e.target.value === '' ? null : parseFloat(e.target.value))} className={`h-10 mt-0.5 ${bad ? 'border-rose-400 bg-rose-50' : ''}`} data-testid={`${testid}-${p.key}`} />
              <span className={`text-[10px] ${bad ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{bad ? 'Out of range · ' : ''}{p.min ?? '–'} – {p.max ?? '–'}</span>
            </label>
          );
        }
        if (t === 'text') {
          return <label key={p.key} className="text-xs sm:col-span-2">{label}<Input value={v ?? ''} onChange={(e) => set(p, e.target.value)} className="h-10 mt-0.5" placeholder="Type here…" data-testid={`${testid}-${p.key}`} /></label>;
        }
        const sel = chosen(p, v); const photos = photosOf(v);
        const needPhoto = sel.some((l) => (p.options || []).find((o) => o.label === l)?.photo_required);
        const toggle = (l) => {
          const next = t === 'radio' ? l : (sel.includes(l) ? sel.filter((x) => x !== l) : [...sel, l]);
          set(p, { value: t === 'radio' ? next : (next.length ? next : null), photos });
        };
        return (
          <div key={p.key} className="text-xs sm:col-span-2 rounded-lg border border-slate-200 p-2.5 space-y-2" data-testid={`${testid}-${p.key}`}>
            {label}
            <div className="flex flex-wrap gap-1.5">
              {(p.options || []).map((o) => {
                const active = sel.includes(o.label);
                return (
                  <button type="button" key={o.label} onClick={() => toggle(o.label)} data-testid={`${testid}-${p.key}-opt-${slug(o.label)}`} aria-pressed={active}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium flex items-center gap-1 transition-colors ${active ? (o.alert ? 'bg-rose-600 border-rose-600 text-white' : 'bg-[#002FA7] border-[#002FA7] text-white') : 'bg-white border-slate-300 text-slate-700 hover:border-slate-500'}`}>
                    <span className={`inline-block h-3 w-3 border ${t === 'radio' ? 'rounded-full' : 'rounded-sm'} ${active ? 'bg-white border-white' : 'border-slate-400'}`} />
                    {o.label}{o.photo_required && <Camera className="h-3 w-3 opacity-70" />}{o.alert && <AlertTriangle className="h-3 w-3 opacity-70" />}
                  </button>
                );
              })}
            </div>
            {needPhoto && (
              <div className="space-y-1.5">
                <p className={`text-[11px] font-semibold flex items-center gap-1 ${photos.length ? 'text-emerald-700' : 'text-amber-700'}`} data-testid={`${testid}-${p.key}-photo-hint`}><Camera className="h-3 w-3" /> {photos.length ? `${photos.length} live photo attached` : 'Live photo required for this option'}</p>
                <div className="flex flex-wrap gap-2 items-start">
                  {photos.map((ph) => (
                    <div key={ph.id} className="relative"><img src={ph.preview} alt="" className="h-16 w-20 object-cover rounded border" />
                      <button type="button" onClick={() => set(p, { value: val(v), photos: photos.filter((x) => x.id !== ph.id) })} className="absolute -top-1.5 -right-1.5 bg-white rounded-full border p-0.5 text-slate-500"><X className="h-3 w-3" /></button></div>
                  ))}
                  {equipmentId ? <LiveCamera equipmentId={equipmentId} onCaptured={(ph) => set(p, { value: val(v), photos: [...photos, ph] })} testid={`${testid}-${p.key}`} /> : <span className="text-[11px] text-rose-600">Photo capture unavailable here</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Modal used by tick-style flows (area / checklist / run panel): collect values, then call onSubmit(payload).
export const ParamCaptureDialog = ({ item, onSubmit, onCancel }) => {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  const params = item.maintenance_parameters || [];
  const missing = missingParams(params, values);
  const submit = async () => { setBusy(true); try { await onSubmit(toParamPayload(values)); } finally { setBusy(false); } };
  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="param-capture-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-[#002FA7]" /> {item.name}</DialogTitle>
          <DialogDescription>Record the readings and observations for this maintenance. Out-of-range values and alert options are flagged to supervisors.</DialogDescription>
        </DialogHeader>
        <ParamInputs params={params} values={values} onChange={setValues} equipmentId={item.equipment_id || item.id} testid="capture" />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} data-testid="capture-cancel">Cancel</Button>
          <Button onClick={submit} disabled={busy || missing.length > 0} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="capture-submit">Save & mark complete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Thumbnails for photos stored on a captured parameter row (authenticated fetch).
export const ParamPhotoThumbs = ({ recordId, photos }) => {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    const made = [];
    (photos || []).forEach((p) => fetch(`${API_URL}/api/maintenance/records/${recordId}/photos/${p.id}`, { headers: scanAuthHeaders() })
      .then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => { const u = URL.createObjectURL(b); made.push(u); setUrls((s) => ({ ...s, [p.id]: u })); }).catch(() => {}));
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [recordId, photos]);
  if (!(photos || []).length) return null;
  return <div className="flex flex-wrap gap-1.5 mt-1">{photos.map((p) => urls[p.id] ? <a key={p.id} href={urls[p.id]} target="_blank" rel="noreferrer"><img src={urls[p.id]} alt={p.filename} className="h-14 w-20 object-cover rounded border" /></a> : <div key={p.id} className="h-14 w-20 bg-slate-100 animate-pulse rounded flex items-center justify-center"><ImageIcon className="h-4 w-4 text-slate-300" /></div>)}</div>;
};

// Read-only list of captured parameters for a record (profile history, checklist rows).
export const ParamSummary = ({ record, testid }) => {
  const rows = (record?.parameters || []).filter((p) => formatParam(p));
  if (!rows.length) return null;
  return (
    <div className="space-y-1" data-testid={testid}>
      {rows.map((p) => (
        <div key={p.key} className={`text-xs ${p.in_range === false ? 'text-rose-700 font-medium' : 'text-violet-700'}`}>
          {formatParam(p)}
          {(p.photos || []).length > 0 && record?.id && <ParamPhotoThumbs recordId={record.id} photos={p.photos} />}
        </div>
      ))}
    </div>
  );
};

const OptionRows = ({ options, onChange, testid }) => (
  <div className="space-y-1">
    <div className="grid grid-cols-12 gap-2 px-1 text-[10px] font-semibold text-slate-500 uppercase"><span className="col-span-6">Option</span><span className="col-span-3 text-center">Photo required</span><span className="col-span-2 text-center">Alert</span><span /></div>
    {(options || []).map((o, i) => (
      <div key={i} className="grid grid-cols-12 gap-2 items-center px-1" data-testid={`${testid}-opt-${i}`}>
        <Input value={o.label} onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="h-8 col-span-6" placeholder="e.g. Leaking" data-testid={`${testid}-opt-label-${i}`} />
        <select value={o.photo_required ? 'yes' : 'no'} onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, photo_required: e.target.value === 'yes' } : x)))} className="h-8 col-span-3 rounded-md border border-input bg-background px-2 text-xs" data-testid={`${testid}-opt-photo-${i}`}><option value="no">No</option><option value="yes">Yes</option></select>
        <select value={o.alert ? 'yes' : 'no'} onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, alert: e.target.value === 'yes' } : x)))} className="h-8 col-span-2 rounded-md border border-input bg-background px-2 text-xs" data-testid={`${testid}-opt-alert-${i}`}><option value="no">No</option><option value="yes">Yes</option></select>
        <button type="button" onClick={() => onChange(options.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600 justify-self-center"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    ))}
    <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...(options || []), { label: '', photo_required: false, alert: false }])} className="h-7 text-xs" data-testid={`${testid}-opt-add`}><Plus className="h-3 w-3 mr-1" /> Add option</Button>
  </div>
);

// Equipment form editor: which parameters to capture on maintenance completion.
export const MaintenanceParamsFields = ({ params, onChange }) => {
  const rows = params || [];
  const upd = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch, key: patch.name != null ? (slug(patch.name) || r.key) : r.key } : r)));
  return (
    <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3 space-y-2" data-testid="eq-params-block">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-1"><Gauge className="h-4 w-4 text-[#002FA7]" /> Parameters to capture on completion</p>
          <p className="text-[11px] text-muted-foreground">Staff fill these when marking maintenance complete: numbers (with limits), text, or options with radio/checkbox — options can require a live photo and/or alert supervisors.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, { key: '', name: '', type: 'number', unit: '', min: null, max: null, required: true, options: [] }])} data-testid="eq-param-add"><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="rounded-md border bg-white p-2 space-y-2" data-testid={`eq-param-row-${i}`}>
          <div className="grid grid-cols-12 gap-2 items-center">
            <Input value={r.name} onChange={(e) => upd(i, { name: e.target.value })} className="h-8 col-span-5" placeholder="Parameter name, e.g. Pressure" data-testid={`eq-param-name-${i}`} />
            <select value={ptype(r)} onChange={(e) => upd(i, { type: e.target.value, options: isChoice({ type: e.target.value }) ? (r.options?.length ? r.options : [{ label: '', photo_required: false, alert: false }]) : [] })} className="h-8 col-span-4 rounded-md border border-input bg-background px-2 text-xs" data-testid={`eq-param-type-${i}`}>
              {PARAM_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
            <label className="col-span-2 text-[11px] flex items-center gap-1 justify-center"><input type="checkbox" checked={r.required !== false} onChange={(e) => upd(i, { required: e.target.checked })} className="h-4 w-4" data-testid={`eq-param-required-${i}`} /> Req.</label>
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600 justify-self-center" data-testid={`eq-param-remove-${i}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          {ptype(r) === 'number' && (
            <div className="grid grid-cols-12 gap-2 items-center">
              <Input value={r.unit || ''} onChange={(e) => upd(i, { unit: e.target.value })} className="h-8 col-span-4" placeholder="Unit (bar, °C)" data-testid={`eq-param-unit-${i}`} />
              <Input type="number" step="any" value={r.min ?? ''} onChange={(e) => upd(i, { min: e.target.value === '' ? null : parseFloat(e.target.value) })} className="h-8 col-span-4" placeholder="Min" data-testid={`eq-param-min-${i}`} />
              <Input type="number" step="any" value={r.max ?? ''} onChange={(e) => upd(i, { max: e.target.value === '' ? null : parseFloat(e.target.value) })} className="h-8 col-span-4" placeholder="Max" data-testid={`eq-param-max-${i}`} />
            </div>
          )}
          {isChoice(r) && <OptionRows options={r.options || []} onChange={(options) => upd(i, { options })} testid={`eq-param-${i}`} />}
        </div>
      ))}
    </div>
  );
};
