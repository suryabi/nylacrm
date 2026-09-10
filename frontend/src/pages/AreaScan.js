import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { LayoutGrid, RefreshCw, XCircle, CheckCircle2, Camera, UserCheck, MapPin, CalendarX2, Lock, ExternalLink } from 'lucide-react';
import StaffScanLogin from '../components/StaffScanLogin';
import { getStaffSession, saveStaffSession, clearStaffSession, scanAuthHeaders } from '../lib/staffSession';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const getPosition = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
});

const StateBadge = ({ it }) => {
  if (it.state === 'done') return <Badge className={`${it.record?.status === 'completed' ? 'bg-emerald-600' : 'bg-amber-500'} text-[10px]`}>{it.record?.status === 'completed' ? 'Done' : 'Incomplete'}</Badge>;
  if (it.state === 'due') return <Badge className="bg-[#002FA7] text-[10px]">Due today</Badge>;
  if (it.state === 'photo_required') return <Badge className="bg-red-600 text-[10px]"><Camera className="h-3 w-3 mr-1" />Needs photo</Badge>;
  if (it.state === 'not_assigned') return <Badge variant="outline" className="text-[10px] text-slate-500"><Lock className="h-3 w-3 mr-1" />Assigned to others</Badge>;
  return <Badge variant="outline" className="text-[10px] text-slate-400">Not scheduled</Badge>;
};

export default function AreaScan() {
  const { areaId } = useParams();
  const [state, setState] = useState({ loading: true });
  const [staff, setStaff] = useState(getStaffSession);
  const [selected, setSelected] = useState([]);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/maintenance/area-scan/${areaId}`, { headers: scanAuthHeaders() });
      if (res.status === 401) { clearStaffSession(); setStaff(null); setState({ needLogin: true }); return; }
      const data = await res.json();
      if (!res.ok) { setState({ error: data.detail || 'Unknown area QR' }); return; }
      setState(data);
      setSelected(data.equipment.filter((e) => e.can_tick).map((e) => e.id));
    } catch { setState({ error: 'Could not reach the server' }); }
  }, [areaId]);

  useEffect(() => { load(); }, [load]);

  const staffLogin = (m, tok) => { setStaff(saveStaffSession(m, tok)); setState({ loading: true }); load(); };
  const staffLogout = () => {
    const s = getStaffSession();
    if (s?.token) fetch(`${API_URL}/api/maintenance/staff-auth/logout`, { method: 'POST', headers: { 'X-Staff-Token': s.token } }).catch(() => {});
    clearStaffSession(); setStaff(null); setState({ loading: true }); load();
  };

  const complete = async () => {
    if (selected.length === 0) { toast.error('Tick at least one equipment'); return; }
    setSubmitting(true);
    try {
      let pos = null;
      if (state.geofence?.required) {
        pos = await getPosition();
        if (!pos) { toast.error('Location access is required — allow GPS/location to record maintenance here.'); setSubmitting(false); return; }
      }
      const res = await fetch(`${API_URL}/api/maintenance/area-scan/${areaId}/complete`, {
        method: 'POST', headers: scanAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ equipment_ids: selected, remarks: remarks || null, lat: pos?.lat ?? null, lng: pos?.lng ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not save');
      setResult(data);
      toast.success(`${data.completed.length} maintenance record${data.completed.length === 1 ? '' : 's'} saved`);
      setRemarks('');
      await load();
    } catch (e) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  if (state.needLogin) return <StaffScanLogin scanRef={{ area_id: areaId }} onLogin={staffLogin} />;

  const Shell = ({ children }) => (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center p-4 pt-8" data-testid="area-scan-page">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-2 text-slate-700">
          <div className="p-2 rounded-lg bg-[#002FA7] text-white"><LayoutGrid className="h-5 w-5" /></div>
          <div>
            <p className="font-bold leading-tight">Area Maintenance</p>
            <p className="text-xs text-muted-foreground">Tick equipment and complete in one go</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );

  if (state.loading) return <Shell><Card><CardContent className="py-10 text-center text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading area…</CardContent></Card></Shell>;
  if (state.error) return <Shell><Card><CardContent className="py-8 text-center" data-testid="area-scan-error"><XCircle className="h-8 w-8 mx-auto text-red-500 mb-2" /><p className="font-medium">{state.error}</p></CardContent></Card></Shell>;

  const tickable = state.equipment.filter((e) => e.can_tick);
  const allOn = tickable.length > 0 && tickable.every((e) => selected.includes(e.id));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Shell>
      <Card><CardContent className="p-4 space-y-1" data-testid="area-scan-info">
        <p className="font-bold text-xl uppercase tracking-wide">{state.area_name}</p>
        <p className="text-sm text-muted-foreground">{[state.facility_name, state.floor_name].filter(Boolean).join(' › ')}</p>
        <div className="flex gap-2 pt-1 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#002FA7] font-semibold" data-testid="area-summary-due">{state.summary.due} due</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold" data-testid="area-summary-done">{state.summary.done} done</span>
          {state.summary.photo_required > 0 && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold">{state.summary.photo_required} need photo</span>}
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">{state.summary.total} equipment</span>
        </div>
      </CardContent></Card>

      {(staff || state.actor?.is_admin) && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="area-staff-chip">
          <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-sm flex-1 truncate">Recording as <span className="font-bold">{staff?.name || state.actor?.name}</span>{state.actor?.is_admin ? <span className="text-xs text-muted-foreground"> · admin</span> : null}</p>
          {staff && <button onClick={staffLogout} className="text-xs font-semibold text-emerald-700 hover:underline shrink-0" data-testid="area-staff-switch">Switch</button>}
        </div>
      )}
      {state.geofence?.required && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2" data-testid="area-geofence-chip">
          <MapPin className="h-4 w-4 text-[#002FA7] shrink-0" />
          <p className="text-xs text-blue-800">Geo-fenced — you must be within <span className="font-bold">{state.geofence.radius} m</span> of <span className="font-bold">{state.geofence.facility_name}</span>.</p>
        </div>
      )}

      {result && (
        <Card className="border-emerald-300"><CardContent className="p-4 space-y-1" data-testid="area-complete-result">
          <p className="font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> {result.completed.length} completed</p>
          {result.completed.map((c) => <p key={c.id} className="text-xs text-muted-foreground">✔ {c.name}</p>)}
          {result.skipped.length > 0 && <p className="font-semibold text-amber-700 text-sm pt-1">{result.skipped.length} skipped</p>}
          {result.skipped.map((c) => <p key={c.id} className="text-xs text-amber-700">• {c.name} — {c.reason}</p>)}
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0" data-testid="area-equipment-list">
        {tickable.length > 0 && (
          <label className="flex items-center gap-3 px-4 py-3 border-b bg-slate-50 cursor-pointer">
            <Checkbox checked={allOn} onCheckedChange={(v) => setSelected(v ? tickable.map((e) => e.id) : [])} data-testid="area-select-all" />
            <span className="text-sm font-semibold">Select all due ({tickable.length})</span>
          </label>
        )}
        {state.equipment.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground"><CalendarX2 className="h-8 w-8 mx-auto mb-2 opacity-40" />No equipment mapped to this area.</p>}
        {state.equipment.map((it) => (
          <div key={it.id} className={`flex items-start gap-3 px-4 py-3 border-b last:border-0 ${it.can_tick ? '' : 'opacity-80'}`} data-testid={`area-eq-${it.id}`}>
            {it.can_tick ? (
              <Checkbox className="mt-0.5" checked={selected.includes(it.id)} onCheckedChange={() => toggle(it.id)} data-testid={`area-eq-check-${it.id}`} />
            ) : (
              <span className="mt-0.5 h-4 w-4 shrink-0 flex items-center justify-center">
                {it.state === 'done' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <span className="h-4 w-4 rounded border border-slate-200 bg-slate-100 block" />}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm truncate">{it.name}</p>
                <StateBadge it={it} />
              </div>
              <p className="text-xs text-muted-foreground">{[it.type, it.frequency_label].filter(Boolean).join(' · ')}</p>
              {it.state === 'done' && it.record && <p className="text-xs text-emerald-700">By {it.record.performed_by} · {(it.record.completed_at || '').slice(11, 16)}</p>}
              {it.state === 'not_scheduled' && it.next_due && <p className="text-xs text-muted-foreground">Next due {it.next_due}</p>}
              {it.state === 'not_assigned' && it.assigned_staff?.length > 0 && <p className="text-xs text-slate-500">Assigned to {it.assigned_staff.map((s) => s.name).join(', ')}</p>}
              {it.state === 'photo_required' && it.token && (
                <Link to={`/maintenance-scan/${it.token}`} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline mt-0.5" data-testid={`area-eq-open-${it.id}`}>
                  Needs photo → open equipment check-in <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        ))}
      </CardContent></Card>

      {tickable.length > 0 && (
        <Card><CardContent className="p-4 space-y-3">
          <Textarea placeholder="Remarks for all ticked equipment (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} data-testid="area-remarks" />
          <Button className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={complete} disabled={submitting || selected.length === 0} data-testid="area-complete-btn">
            {submitting ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Mark {selected.length} as Maintenance Complete
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">One locked record is saved per equipment. For an incomplete or photo-inspection check-in, use that equipment's own QR.</p>
        </CardContent></Card>
      )}
    </Shell>
  );
}
