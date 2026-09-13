import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Factory, Play, RefreshCw, UserCheck, CheckCircle2, ShieldAlert, Tag, ArrowRight } from 'lucide-react';
import StaffScanLogin from '../components/StaffScanLogin';
import { getStaffSession, saveStaffSession, clearStaffSession, scanAuthHeaders, hasAppSession } from '../lib/staffSession';
import { Button } from '../components/ui/button';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const STATUS = { planned: 'Pre-production checklist', in_production: 'In production', post_checklist: 'Post-production checklist' };

// "Start Production" QR landing: Face/PIN (production operators) or app login → pick SKU → run wizard.
export default function StartProductionScan() {
  const { tenantId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [staff, setStaff] = useState(getStaffSession);
  const [state, setState] = useState({ loading: true });
  const [skuId, setSkuId] = useState('');
  const [busy, setBusy] = useState(false);
  const done = params.get('done');

  const load = useCallback(async () => {
    localStorage.setItem('start_production_tenant', tenantId);
    const h = scanAuthHeaders({ 'X-Tenant-ID': tenantId });
    if (!hasAppSession() && !h['X-Staff-Token']) { setState({ needLogin: true }); return; }
    try {
      const [s, a] = await Promise.all([fetch(`${API_URL}/api/production/run/skus`, { headers: h }), fetch(`${API_URL}/api/production/run/active`, { headers: h })]);
      if (s.status === 401) { clearStaffSession(); setStaff(null); setState({ needLogin: true }); return; }
      const sd = await s.json();
      if (!s.ok) { setState({ error: sd.detail || 'Could not load SKUs', forbidden: s.status === 403 }); return; }
      setState({ skus: sd.skus || [], runs: a.ok ? (await a.json()).runs || [] : [] });
    } catch { setState({ error: 'Could not reach the server' }); }
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const staffLogin = (m, tok) => { setStaff(saveStaffSession(m, tok)); setState({ loading: true }); load(); };
  const staffLogout = () => {
    const s = getStaffSession();
    if (s?.token) fetch(`${API_URL}/api/maintenance/staff-auth/logout`, { method: 'POST', headers: { 'X-Staff-Token': s.token } }).catch(() => {});
    clearStaffSession(); setStaff(null); setState({ loading: true }); load();
  };
  const initiate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/production/run/initiate`, { method: 'POST', headers: scanAuthHeaders({ 'Content-Type': 'application/json', 'X-Tenant-ID': tenantId }), body: JSON.stringify({ sku_id: skuId }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Could not initiate the run');
      toast.success(`Run ${d.batch_code} initiated — complete the pre-production checklist`);
      navigate(`/production-run/${d.batch_id}`);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  if (state.needLogin) return <StaffScanLogin scanRef={{ start_production: tenantId }} equipmentName="Start Production" onLogin={staffLogin} />;
  const appUser = hasAppSession() && !staff;
  const sku = (state.skus || []).find((s) => s.id === skuId);

  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center p-4 pt-8" data-testid="start-production-page">
      <div className="w-full max-w-md space-y-4">
        <div className="rounded-2xl bg-[#002FA7] text-white px-5 py-4 shadow-md">
          <p className="text-[11px] uppercase tracking-widest text-blue-200 font-semibold flex items-center gap-1"><Factory className="h-3.5 w-3.5" /> Production</p>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight mt-0.5">Start Production</h1>
          <p className="text-xs text-blue-100 mt-1">Pick the SKU → pre-production checklist → start → stop → post checklist → batch created.</p>
        </div>
        {(staff || appUser) && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="start-production-actor-chip">
            <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-sm flex-1 truncate">Signed in as <span className="font-bold">{staff?.name || 'app user'}</span>{staff ? <span className="text-xs text-muted-foreground"> · Factory Staff</span> : null}</p>
            {staff && <button onClick={staffLogout} className="text-xs font-semibold text-emerald-700 hover:underline shrink-0" data-testid="start-production-staff-switch">Switch</button>}
          </div>
        )}
        {done && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 flex items-start gap-2" data-testid="start-production-done">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
            <div><p className="text-sm font-bold text-emerald-900">Production batch {done} created</p><p className="text-xs text-emerald-800">Run report generated and the team notified. Start another batch below when ready.</p></div>
          </div>
        )}
        {state.loading && <div className="text-center py-8 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>}
        {state.error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-2" data-testid="start-production-error">
            <ShieldAlert className="h-5 w-5 text-rose-600 mt-0.5" />
            <div><p className="text-sm font-bold text-rose-900">{state.forbidden ? 'Not a production operator' : 'Something went wrong'}</p><p className="text-xs text-rose-800">{state.error}</p>
              {staff && <button onClick={staffLogout} className="mt-1 text-xs font-semibold text-rose-700 underline">Sign in as someone else</button>}</div>
          </div>
        )}
        {state.runs?.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2" data-testid="start-production-active-runs">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Runs in progress</p>
            {state.runs.map((r) => (
              <button key={r.id} onClick={() => navigate(`/production-run/${r.id}`)} className="w-full flex items-center gap-3 rounded-lg bg-white border border-amber-200 px-3 py-2 text-left hover:border-amber-400" data-testid={`start-production-resume-${r.id}`}>
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{r.batch_code} · {r.sku_name}</p><p className="text-[11px] text-slate-500">{STATUS[r.status] || r.status} · by {r.created_by_name}</p></div>
                <span className="text-xs font-bold text-[#002FA7] flex items-center gap-1">Resume <ArrowRight className="h-3.5 w-3.5" /></span>
              </button>
            ))}
          </div>
        )}
        {state.skus && (
          <div className="rounded-xl border bg-white shadow-sm p-4 space-y-3" data-testid="start-production-form">
            <p className="text-sm font-bold text-slate-800 flex items-center gap-2"><Tag className="h-4 w-4 text-[#002FA7]" /> Which SKU are you producing?</p>
            <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
              {state.skus.map((s) => (
                <button key={s.id} onClick={() => setSkuId(s.id)} aria-pressed={skuId === s.id} data-testid={`start-production-sku-${s.id}`}
                  className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${skuId === s.id ? 'border-[#002FA7] bg-blue-50 ring-1 ring-[#002FA7]' : 'border-slate-200 hover:border-slate-400'}`}>
                  <p className="text-sm font-semibold text-slate-800">{s.sku_name}</p>
                  <p className="text-[11px] text-slate-500">{[s.sku_code, s.category].filter(Boolean).join(' · ')}</p>
                </button>
              ))}
              {state.skus.length === 0 && <p className="text-xs text-muted-foreground">No active SKUs configured.</p>}
            </div>
            <Button className="w-full bg-[#002FA7] hover:bg-blue-800 text-white font-bold h-12 text-base" disabled={!skuId || busy} onClick={initiate} data-testid="start-production-submit">
              <Play className="h-4 w-4 mr-2" /> {busy ? 'Initiating…' : `Initiate batch${sku ? ` · ${sku.sku_name}` : ''}`}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">Batch code and date are generated automatically — editable when the batch is created at the end of the run.</p>
          </div>
        )}
      </div>
    </div>
  );
}
