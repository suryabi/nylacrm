import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Gauge, Plus, Trash2 } from 'lucide-react';

const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const outOfRange = (p, v) => v != null && v !== '' && ((p.min != null && v < p.min) || (p.max != null && v > p.max));

// Inline inputs for capturing values against an equipment's parameter definitions.
export const ParamInputs = ({ params, values, onChange, testid = 'param' }) => (
  <div className="grid grid-cols-2 gap-2" data-testid={`${testid}-inputs`}>
    {params.map((p) => {
      const v = values[p.key];
      const bad = outOfRange(p, v);
      return (
        <label key={p.key} className="text-xs">
          <span className="font-medium text-slate-700">{p.name}{p.unit ? ` (${p.unit})` : ''}{p.required !== false ? ' *' : ''}</span>
          <Input type="number" step="any" inputMode="decimal" value={v ?? ''} onChange={(e) => onChange({ ...values, [p.key]: e.target.value === '' ? null : parseFloat(e.target.value) })}
            className={`h-10 mt-0.5 ${bad ? 'border-rose-400 bg-rose-50' : ''}`} data-testid={`${testid}-${p.key}`} />
          <span className={`text-[10px] ${bad ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{bad ? 'Out of range · ' : ''}{p.min ?? '–'} – {p.max ?? '–'}</span>
        </label>
      );
    })}
  </div>
);

// Modal used by tick-style flows (area / checklist / run panel): collect values, then call onSubmit(values).
export const ParamCaptureDialog = ({ item, onSubmit, onCancel }) => {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  const params = item.maintenance_parameters || [];
  const missing = params.filter((p) => p.required !== false && (values[p.key] == null));
  const submit = async () => { setBusy(true); try { await onSubmit(values); } finally { setBusy(false); } };
  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm" data-testid="param-capture-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Gauge className="h-5 w-5 text-[#002FA7]" /> {item.name}</DialogTitle>
          <DialogDescription>Enter the readings taken during this maintenance. Values outside the limits are flagged to supervisors.</DialogDescription>
        </DialogHeader>
        <ParamInputs params={params} values={values} onChange={setValues} testid="capture" />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} data-testid="capture-cancel">Cancel</Button>
          <Button onClick={submit} disabled={busy || missing.length > 0} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="capture-submit">Save & mark complete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Equipment form editor: which parameters to capture on maintenance completion.
export const MaintenanceParamsFields = ({ params, onChange }) => {
  const rows = params || [];
  const upd = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch, key: patch.name != null ? (slug(patch.name) || r.key) : r.key } : r)));
  return (
    <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3 space-y-2" data-testid="eq-params-block">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-1"><Gauge className="h-4 w-4 text-[#002FA7]" /> Parameters to capture on completion</p>
          <p className="text-[11px] text-muted-foreground">Staff enter these readings when marking maintenance complete (e.g. pressure, temperature, TDS). Limits flag out-of-range values.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, { key: '', name: '', unit: '', min: null, max: null, required: true }])} data-testid="eq-param-add"><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
      </div>
      {rows.length > 0 && (
        <div className="rounded-md border divide-y bg-white">
          <div className="grid grid-cols-12 gap-2 px-2 py-1 text-[10px] font-semibold text-slate-500 uppercase"><span className="col-span-4">Name</span><span className="col-span-2">Unit</span><span className="col-span-2">Min</span><span className="col-span-2">Max</span><span className="col-span-1">Req.</span><span /></div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 px-2 py-1.5 items-center" data-testid={`eq-param-row-${i}`}>
              <Input value={r.name} onChange={(e) => upd(i, { name: e.target.value })} className="h-8 col-span-4" placeholder="e.g. Pressure" data-testid={`eq-param-name-${i}`} />
              <Input value={r.unit || ''} onChange={(e) => upd(i, { unit: e.target.value })} className="h-8 col-span-2" placeholder="bar" data-testid={`eq-param-unit-${i}`} />
              <Input type="number" step="any" value={r.min ?? ''} onChange={(e) => upd(i, { min: e.target.value === '' ? null : parseFloat(e.target.value) })} className="h-8 col-span-2" data-testid={`eq-param-min-${i}`} />
              <Input type="number" step="any" value={r.max ?? ''} onChange={(e) => upd(i, { max: e.target.value === '' ? null : parseFloat(e.target.value) })} className="h-8 col-span-2" data-testid={`eq-param-max-${i}`} />
              <input type="checkbox" checked={r.required !== false} onChange={(e) => upd(i, { required: e.target.checked })} className="h-4 w-4 col-span-1 justify-self-center" />
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600 justify-self-center" data-testid={`eq-param-remove-${i}`}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
