import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ClipboardCheck, CheckCircle2, AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('session_token')}` });

// Shown inside Create Production Batch: per-run equipment that must be cleared for this SKU.
export const PreProductionGate = ({ skuId, isElevated, override, onOverrideChange, onStatus }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!skuId) { setData(null); onStatus?.(null); return; }
    setLoading(true);
    axios.get(`${API_URL}/api/maintenance/pre-production`, { params: { sku_id: skuId }, headers: authHeaders() })
      .then(({ data: d }) => { setData(d); onStatus?.(d); })
      .catch(() => { setData(null); onStatus?.(null); })
      .finally(() => setLoading(false));
  }, [skuId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!skuId) return null;
  if (loading) return <div className="text-xs text-slate-500 flex items-center gap-1"><RefreshCw size={12} className="animate-spin" /> Checking pre-production checklist…</div>;
  if (!data || data.items.length === 0) return null;

  const pending = data.pending.length;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${pending ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`} data-testid="pre-production-gate">
      <div className="flex items-center gap-2 mb-1.5">
        {pending ? <AlertTriangle size={16} className="text-amber-600" /> : <ClipboardCheck size={16} className="text-emerald-600" />}
        <p className={`text-sm font-semibold ${pending ? 'text-amber-800' : 'text-emerald-800'}`} data-testid="pre-production-gate-title">
          {pending ? `Pre-production checklist: ${pending} of ${data.items.length} pending` : `Pre-production checklist complete (${data.items.length})`}
        </p>
      </div>
      <ul className="space-y-1">
        {data.items.map((it) => (
          <li key={it.id} className="flex items-start gap-2 text-xs" data-testid={`pre-production-item-${it.id}`}>
            {it.cleared ? <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" /> : <span className="mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-amber-500 shrink-0" />}
            <div className="flex-1 min-w-0">
              <span className="font-medium text-slate-800">{it.name}</span>
              {it.location && <span className="text-slate-500"> · {it.location}</span>}
              {it.cleared ? <span className="text-emerald-700"> — cleared by {it.record.performed_by} · {(it.record.completed_at || '').slice(0, 16).replace('T', ' ')}</span>
                : <span className="text-amber-700"> — pending</span>}
            </div>
          </li>
        ))}
      </ul>
      {pending > 0 && (
        <p className="text-[11px] text-amber-800 mt-2">Batch creation is blocked until staff clear these via the equipment QR or the Pre-Production Checklist QR.</p>
      )}
      {pending > 0 && isElevated && (
        <div className="mt-2 pt-2 border-t border-amber-200">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={!!override.enabled} onChange={(e) => onOverrideChange({ ...override, enabled: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600" data-testid="pre-production-override-checkbox" />
            <span className="text-xs font-medium text-rose-700 flex items-center gap-1"><ShieldAlert size={12} /> Override checklist (CEO / System Admin) — reason required, admins will be notified</span>
          </label>
          {override.enabled && (
            <input type="text" value={override.reason || ''} onChange={(e) => onOverrideChange({ ...override, reason: e.target.value })}
              placeholder="Reason for overriding the pre-production checklist *"
              className="mt-2 w-full text-xs border border-rose-200 bg-white rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-400" data-testid="pre-production-override-reason" />
          )}
        </div>
      )}
    </div>
  );
};

export default PreProductionGate;
