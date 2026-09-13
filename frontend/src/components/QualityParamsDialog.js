import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { FlaskConical, Plus, Trash2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const H = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Admin: pre-production quality parameters (name, unit, min, max) — tenant default or per SKU.
export const QualityParamsDialog = ({ open, onOpenChange }) => {
  const [skus, setSkus] = useState([]);
  const [skuId, setSkuId] = useState('');
  const [rows, setRows] = useState([]);
  const [source, setSource] = useState('');

  useEffect(() => {
    if (!open) return;
    axios.get(`${API_URL}/api/master-skus`, H()).then(({ data }) => setSkus((Array.isArray(data) ? data : data.skus || []).map((s) => ({ id: s.id, name: s.sku_name || s.name })))).catch(() => {});
  }, [open]);
  useEffect(() => {
    if (!open) return;
    axios.get(`${API_URL}/api/production/run/params`, { ...H(), params: skuId ? { sku_id: skuId } : {} })
      .then(({ data }) => { setRows(data.params.map((p) => ({ ...p }))); setSource(data.source); }).catch((e) => toast.error(e.response?.data?.detail || e.message));
  }, [open, skuId]);

  const upd = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch, key: patch.name != null ? slug(patch.name) || x.key : x.key } : x)));
  const save = async () => {
    const params = rows.filter((r) => r.name?.trim()).map((r) => ({ key: r.key || slug(r.name), name: r.name.trim(), unit: r.unit || '', min: r.min === '' || r.min == null ? null : Number(r.min), max: r.max === '' || r.max == null ? null : Number(r.max), required: r.required !== false }));
    try {
      await axios.put(`${API_URL}/api/production/run/params`, { sku_id: skuId || null, params }, H());
      toast.success(skuId ? 'SKU parameters saved' : 'Default parameters saved');
      onOpenChange(false);
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="quality-params-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5 text-violet-600" /> Pre-production Quality Parameters</DialogTitle>
          <DialogDescription>Values captured before "Start Production". Out-of-range values block the start unless CEO / System Admin override with a reason.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">Scope:</span>
          <select value={skuId} onChange={(e) => setSkuId(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm" data-testid="quality-params-scope">
            <option value="">Tenant default (all SKUs)</option>
            {skus.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="text-[11px] text-slate-400">{source === 'sku' ? 'SKU-specific' : source === 'default' ? 'using tenant default' : 'built-in defaults'}</span>
        </div>
        <div className="rounded-lg border divide-y">
          <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[11px] font-semibold text-slate-500 uppercase"><span className="col-span-4">Parameter</span><span className="col-span-2">Unit</span><span className="col-span-2">Min</span><span className="col-span-2">Max</span><span className="col-span-1">Req.</span><span /></div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 px-3 py-1.5 items-center" data-testid={`quality-param-row-${i}`}>
              <Input value={r.name} onChange={(e) => upd(i, { name: e.target.value })} className="h-8 col-span-4" placeholder="e.g. Conductivity" data-testid={`quality-param-name-${i}`} />
              <Input value={r.unit || ''} onChange={(e) => upd(i, { unit: e.target.value })} className="h-8 col-span-2" placeholder="µS/cm" />
              <Input type="number" step="any" value={r.min ?? ''} onChange={(e) => upd(i, { min: e.target.value })} className="h-8 col-span-2" data-testid={`quality-param-min-${i}`} />
              <Input type="number" step="any" value={r.max ?? ''} onChange={(e) => upd(i, { max: e.target.value })} className="h-8 col-span-2" data-testid={`quality-param-max-${i}`} />
              <input type="checkbox" checked={r.required !== false} onChange={(e) => upd(i, { required: e.target.checked })} className="h-4 w-4 col-span-1 justify-self-center" />
              <button onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600 justify-self-center" data-testid={`quality-param-remove-${i}`}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setRows((r) => [...r, { key: '', name: '', unit: '', min: null, max: null, required: true }])} data-testid="quality-param-add"><Plus size={14} className="mr-1" /> Add parameter</Button>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} data-testid="quality-params-save">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QualityParamsDialog;
