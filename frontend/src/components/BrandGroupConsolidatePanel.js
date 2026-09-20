import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { ArrowLeft, Check, Loader2, Merge } from 'lucide-react';
import { Button } from './ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const fmt = (v) => Number(v || 0).toLocaleString('en-IN');

// One parent SKU: pick the child to keep, run the merge.
const ParentBlock = ({ group, parent, onDone }) => {
  const [keep, setKeep] = useState(parent.suggested_keep);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const others = parent.children.filter((c) => c.child_sku_id !== keep);
  const keeper = parent.children.find((c) => c.child_sku_id === keep);
  const run = async () => {
    if (!window.confirm(`Consolidate ${others.length} child SKU(s) into "${keeper?.child_sku_name}" for ${parent.parent_sku_name}?\n\nStock of the others moves into it (Branding Entries) and they are deactivated.`)) return;
    setBusy(true);
    try {
      const r = await axios.post(`${API}/brand-groups/${group.id}/consolidate`, { parent_sku_id: parent.parent_sku_id, keep_child_sku_id: keep }, { withCredentials: true });
      setResult(r.data);
      if (r.data.ok) toast.success(`${parent.parent_sku_name}: ${fmt(r.data.moved_units)} bottles moved, ${r.data.deactivated.length} SKU(s) retired`);
      else toast.error('Some stock could not be moved — see details');
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Consolidation failed'); }
    setBusy(false);
  };
  return (
    <div className="rounded-lg border border-slate-200" data-testid={`consolidate-parent-${parent.parent_sku_id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
        <span className="text-sm font-semibold text-slate-900">{parent.parent_sku_name}</span>
        {!parent.needs_consolidation
          ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700" data-testid={`consolidate-ok-${parent.parent_sku_id}`}>Already one shared SKU</span>
          : <span className="text-[11px] text-slate-500">{parent.children.filter((c) => !c.shared).length} individual child SKU(s) to merge</span>}
      </div>
      {result ? (
        <div className="space-y-1.5 px-3 py-2.5 text-xs" data-testid={`consolidate-result-${parent.parent_sku_id}`}>
          <p className="text-emerald-700"><Check className="mr-1 inline h-3.5 w-3.5" />Shared SKU: <b>{result.keep.child_sku_name}</b>{result.keep.promoted_from && <span className="text-slate-500"> (promoted from {result.keep.promoted_from})</span>}</p>
          {result.moved.map((m, i) => <p key={i} className="text-slate-600">Moved {fmt(m.quantity)} bottles of {m.child_sku_name} @ {m.location_name} · {m.entry_number}</p>)}
          {result.deactivated.map((d) => <p key={d.child_sku_id} className="text-slate-500">Retired {d.child_sku_name} ({d.customer_account_name})</p>)}
          {result.errors.map((e, i) => <p key={i} className="text-rose-700">{e.child_sku_name} @ {e.location_name}: {e.detail}</p>)}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {parent.children.map((c) => {
              const on = c.child_sku_id === keep;
              return (
                <li key={c.child_sku_id}>
                  <button type="button" onClick={() => setKeep(c.child_sku_id)} disabled={!parent.needs_consolidation} data-testid={`consolidate-keep-${c.child_sku_id}`} aria-pressed={on}
                    className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm transition-colors ${on ? 'bg-violet-50/70' : 'hover:bg-slate-50'}`}>
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300'}`}>{on && <Check className="h-3 w-3" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-900">{c.child_sku_name}</span>
                        {c.shared && <span className="rounded border border-violet-200 bg-violet-50 px-1 py-px text-[10px] text-violet-700">shared</span>}
                        {on && parent.needs_consolidation && <span className="rounded bg-violet-600 px-1.5 py-px text-[10px] font-medium text-white">keep → becomes shared</span>}
                      </span>
                      <span className="block text-[11px] text-slate-500">{c.shared ? 'Group-wide' : c.customer_account_name}{c.stock.length ? ` · ${c.stock.map((s) => `${s.location_name} ${fmt(s.quantity)}`).join(', ')}` : ' · no stock'}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-slate-700">{fmt(c.stock_total)}<span className="ml-1 text-[10px] text-slate-400">btl</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
          {parent.needs_consolidation && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
              <span>{others.length} SKU(s) → moved into <b>{keeper?.child_sku_name}</b> and retired</span>
              <Button size="sm" onClick={run} disabled={busy || !keep} className="bg-violet-700 text-white hover:bg-violet-800" data-testid={`consolidate-run-${parent.parent_sku_id}`}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Merge className="mr-1 h-3.5 w-3.5" />} Consolidate
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const BrandGroupConsolidatePanel = ({ group, onBack, onChanged }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/brand-groups/${group.id}/consolidation-preview`, { withCredentials: true });
      setData(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to load'); }
    setLoading(false);
  }, [group.id]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-3" data-testid="brand-group-consolidate-panel">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack} data-testid="consolidate-back-btn"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">Consolidate child SKUs · {group.name}</h3>
          <p className="text-[11px] text-slate-500">Pick the child SKU each parent should keep. It becomes the group's shared SKU; the other members' stock is moved into it (logged as Branding Entries, batch-aware) and their individual SKUs are deactivated.</p>
        </div>
      </div>
      {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        : !data?.parents?.length ? <div className="rounded-lg border py-8 text-center text-sm text-slate-500" data-testid="consolidate-empty">No member of this group has a customer child SKU yet.</div>
          : data.parents.map((p) => <ParentBlock key={p.parent_sku_id} group={group} parent={p} onDone={onChanged} />)}
    </div>
  );
};
