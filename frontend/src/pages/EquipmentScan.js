import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Wrench, RefreshCw, CalendarX2, XCircle, Factory, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { ParamCaptureDialog } from '../components/MaintenanceParams';
import { ScanInstructions } from '../components/ScanInstructions';
import StaffScanLogin from '../components/StaffScanLogin';
import { saveStaffSession, clearStaffSession, scanAuthHeaders } from '../lib/staffSession';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function EquipmentScan() {
  const { equipmentId } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true });
  const [reloadKey, setReloadKey] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [doneTask, setDoneTask] = useState({});
  const [capture, setCapture] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/maintenance/equipment-scan/${equipmentId}`, { headers: scanAuthHeaders() });
        if (res.status === 401) { clearStaffSession(); setState({ needLogin: true }); return; }
        if (res.status === 403) { setState({ error: (await res.json()).detail || 'Access denied' }); return; }
        const data = await res.json();
        if (!res.ok) { setState({ error: data.detail || 'Unknown equipment QR' }); return; }
        if (data.scheduled_today && data.token && !data.per_run && !(data.post_run || []).length) { navigate(`/maintenance-scan/${data.token}`, { replace: true }); return; }
        setState(data);
      } catch { setState({ error: 'Could not reach the server' }); }
    })();
  }, [equipmentId, navigate, reloadKey]);

  const clearRun = async (values) => {
    if ((state.per_run?.maintenance_parameters || []).length && values === undefined) { setCapture({ ...state.per_run, _kind: 'pre' }); return; }
    setCapture(null);
    setClearing(true);
    try {
      let pos = {};
      if (state.geofence?.required) {
        const p = await new Promise((r) => navigator.geolocation?.getCurrentPosition((x) => r({ lat: x.coords.latitude, lng: x.coords.longitude }), () => r(null), { enableHighAccuracy: true, timeout: 10000 }) || r(null));
        if (!p) throw new Error('Location access is required — allow GPS to record maintenance here.');
        pos = p;
      }
      const res = await fetch(`${API_URL}/api/maintenance/pre-production/${equipmentId}/clear`, {
        method: 'POST', headers: scanAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ...pos, parameter_values: values || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Could not save');
      toast.success('Cleared for the next production run');
      setState((s) => ({ ...s, per_run: { ...s.per_run, cleared: true, can_tick: false, record: { performed_by: d.record.performed_by, completed_at: d.record.completed_at } } }));
    } catch (e) { toast.error(e.message); } finally { setClearing(false); }
  };

  const completePost = async (t, values) => {
    if ((t.maintenance_parameters || []).length && values === undefined) { setCapture({ ...t, _kind: 'post' }); return; }
    setCapture(null);
    setDoneTask((d) => ({ ...d, [t.task_id]: 'busy' }));
    try {
      const res = await fetch(`${API_URL}/api/maintenance/pre-production/post/${t.task_id}/complete`, {
        method: 'POST', headers: scanAuthHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ parameter_values: values || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Could not save');
      toast.success(`After-run maintenance recorded for batch ${t.batch_code}`);
      setState((s) => ({ ...s, post_run: s.post_run.map((x) => (x.task_id === t.task_id ? { ...x, cleared: true, can_tick: false, record: { performed_by: d.record.performed_by, completed_at: d.record.completed_at } } : x)) }));
    } catch (e) { toast.error(e.message); } finally { setDoneTask((d) => ({ ...d, [t.task_id]: null })); }
  };

  if (state.needLogin) {
    return <StaffScanLogin scanRef={{ equipment_id: equipmentId }}
      onLogin={(m, tok) => { saveStaffSession(m, tok); setState({ loading: true }); setReloadKey((k) => k + 1); }} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center p-4 pt-8" data-testid="equipment-scan-page">
      <ParamCaptureDialog item={capture} onCancel={() => setCapture(null)} onSubmit={(vals) => (capture._kind === 'post' ? completePost(capture, vals) : clearRun(vals))} />
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-2 text-slate-700">
          <div className="p-2 rounded-lg bg-[#002FA7] text-white"><Wrench className="h-5 w-5" /></div>
          <div>
            <p className="font-bold leading-tight">Equipment Maintenance</p>
            <p className="text-xs text-muted-foreground">Equipment QR check-in</p>
          </div>
        </div>
        {state.loading && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Checking equipment QR…
          </CardContent></Card>
        )}
        {state.error && (
          <Card><CardContent className="py-8 text-center" data-testid="eqscan-error">
            <XCircle className="h-8 w-8 mx-auto text-red-500 mb-2" /><p className="font-medium">{state.error}</p>
          </CardContent></Card>
        )}
        {!state.loading && !state.needLogin && !state.error && (
          <>
            <Card><CardContent className="p-4 space-y-1" data-testid="eqscan-equipment-info">
              <p className="font-bold text-lg">{state.equipment_name}</p>
              <p className="text-xs text-muted-foreground">{state.equipment_type}</p>
              {state.location && <p className="text-sm text-muted-foreground">{state.location}</p>}
            </CardContent></Card>
            {state.per_run && (
              <Card className={state.per_run.cleared ? 'border-emerald-300' : 'border-amber-400'}><CardContent className="p-4 space-y-3" data-testid="eqscan-per-run">
                <div className="flex items-center gap-2">
                  <Factory className={`h-5 w-5 ${state.per_run.cleared ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <div>
                    <p className="font-bold">Before every production run</p>
                    <p className="text-xs text-muted-foreground">{state.per_run.all_skus ? 'Required before every batch' : `Required before batches of: ${state.per_run.sku_names.join(', ')}`}</p>
                  </div>
                </div>
                {state.per_run.cleared ? (
                  <p className="text-sm text-emerald-700 flex items-center gap-1" data-testid="eqscan-per-run-cleared"><CheckCircle2 className="h-4 w-4" /> Cleared for the next run by {state.per_run.record?.performed_by} · {(state.per_run.record?.completed_at || '').slice(0, 16).replace('T', ' ')}</p>
                ) : state.per_run.can_tick ? (
                  <Button className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-bold" onClick={() => clearRun()} disabled={clearing} data-testid="eqscan-per-run-clear-btn">
                    {clearing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Cleared — ready for next production run
                  </Button>
                ) : (
                  <p className="text-sm text-slate-500">Pending — only assigned staff{state.per_run.assigned_staff?.length ? ` (${state.per_run.assigned_staff.map((x) => x.name).join(', ')})` : ''} can clear this.</p>
                )}
                {state.scheduled_today && state.token && (
                  <Button variant="outline" className="w-full" onClick={() => navigate(`/maintenance-scan/${state.token}`)} data-testid="eqscan-go-scheduled">
                    Today's scheduled maintenance check-in <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
              </CardContent></Card>
            )}
            {(state.post_run || []).map((t) => (
              <Card key={t.task_id} className={t.cleared ? 'border-emerald-300' : 'border-sky-400'}><CardContent className="p-4 space-y-2" data-testid={`eqscan-post-run-${t.task_id}`}>
                <div className="flex items-center gap-2">
                  <Factory className={`h-5 w-5 ${t.cleared ? 'text-emerald-600' : 'text-sky-600'}`} />
                  <div>
                    <p className="font-bold">After production run — batch {t.batch_code}</p>
                    <p className="text-xs text-muted-foreground">{t.batch_sku_name ? `${t.batch_sku_name} · ` : ''}run started {(t.run_started_at || '').slice(0, 16).replace('T', ' ')}</p>
                  </div>
                </div>
                {t.cleared ? (
                  <p className="text-sm text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Done by {t.record?.performed_by} · {(t.record?.completed_at || '').slice(0, 16).replace('T', ' ')}</p>
                ) : t.can_tick ? (
                  <Button className="w-full h-12 bg-sky-600 hover:bg-sky-700 text-white font-bold" onClick={() => completePost(t)} disabled={doneTask[t.task_id] === 'busy'} data-testid={`eqscan-post-run-done-${t.task_id}`}>
                    {doneTask[t.task_id] === 'busy' ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} After-run maintenance done
                  </Button>
                ) : (
                  <p className="text-sm text-slate-500">Pending — only assigned staff can record this.</p>
                )}
              </CardContent></Card>
            ))}
            {!state.scheduled_today && <Card className="border-amber-300"><CardContent className="py-8 text-center space-y-2" data-testid="eqscan-not-scheduled">
              <CalendarX2 className="h-10 w-10 mx-auto text-amber-500" />
              <p className="font-bold text-lg">{state.message || 'No maintenance is scheduled for today.'}</p>
              {state.next_due && <p className="text-sm text-muted-foreground">Next scheduled maintenance: <span className="font-semibold">{state.next_due}</span></p>}
            </CardContent></Card>}
            <ScanInstructions equipmentId={state.equipment_id} maintenance={state.maintenance_instructions}
              replacement={state.replacement_instructions} files={state.instruction_files || []} />
          </>
        )}
      </div>
    </div>
  );
}
