import React, { useEffect, useState } from 'react';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Factory, Search } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Equipment form block: "must be cleared before every production run" + SKU scope.
const VARIANTS = {
  pre: { flag: 'per_run_maintenance', ids: 'per_run_sku_ids', title: 'Before every production run', help: 'Must be cleared (e.g. cleaned) before a production batch can be created. Blocks batch creation until done.', color: 'amber', testid: 'eq-per-run' },
  post: { flag: 'post_run_maintenance', ids: 'post_run_sku_ids', title: 'After every production run', help: 'Cleanup / maintenance to record after each batch. Tracked per batch; the next run of a matching SKU is blocked until done.', color: 'sky', testid: 'eq-post-run' },
};

export const PerRunMaintenanceFields = ({ enabled, skuIds, onChange, variant = 'pre' }) => {
  const V = VARIANTS[variant];
  const [skus, setSkus] = useState([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    fetch(`${API_URL}/api/master-skus`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSkus((Array.isArray(d) ? d : d.skus || []).map((s) => ({ id: s.id, name: s.sku_name || s.name, code: s.sku_code }))))
      .catch(() => setSkus([]));
  }, []);
  const sel = new Set(skuIds || []);
  const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); onChange({ [V.ids]: [...n] }); };
  const list = skus.filter((s) => !q || `${s.name} ${s.code || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className={`sm:col-span-2 rounded-lg border p-3 space-y-2 ${V.color === 'sky' ? 'border-sky-200 bg-sky-50/50' : 'border-amber-200 bg-amber-50/50'}`} data-testid={`${V.testid}-block`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Factory className={`h-4 w-4 ${V.color === 'sky' ? 'text-sky-700' : 'text-amber-700'}`} />
          <div>
            <Label className="font-semibold">{V.title}</Label>
            <p className="text-[11px] text-muted-foreground">{V.help}</p>
          </div>
        </div>
        <Switch checked={!!enabled} onCheckedChange={(v) => onChange({ [V.flag]: v })} data-testid={`${V.testid}-switch`} />
      </div>
      {enabled && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-700">Applies to SKUs · {sel.size === 0 ? 'ALL SKUs' : `${sel.size} selected`}</p>
            {sel.size > 0 && <button type="button" className="text-[11px] underline" onClick={() => onChange({ [V.ids]: [] })} data-testid={`${V.testid}-all-skus`}>Apply to all SKUs</button>}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKUs…" className="pl-8 h-8 text-sm bg-white" data-testid={`${V.testid}-sku-search`} />
          </div>
          <div className="max-h-[160px] overflow-y-auto rounded-md border bg-white divide-y">
            {list.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-slate-50" data-testid={`${V.testid}-sku-${s.id}`}>
                <Checkbox checked={sel.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                <span className="flex-1 truncate">{s.name}</span>
                {s.code && <span className="text-[11px] text-slate-400">{s.code}</span>}
              </label>
            ))}
            {list.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No SKUs</p>}
          </div>
          <p className="text-[11px] text-muted-foreground">Leave none selected to require this for <b>every</b> batch regardless of SKU.</p>
        </div>
      )}
    </div>
  );
};

export default PerRunMaintenanceFields;
