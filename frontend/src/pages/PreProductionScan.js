import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Factory, RefreshCw, XCircle, CheckCircle2, UserCheck, Lock, Undo2 } from 'lucide-react';
import StaffScanLogin from '../components/StaffScanLogin';
import { getStaffSession, saveStaffSession, clearStaffSession, scanAuthHeaders } from '../lib/staffSession';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const getPosition = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
});

// Pre-Production Checklist QR page: every "before every run" equipment; tick = cleared for the next batch.
export default function PreProductionScan() {
  const { tenantId } = useParams();
  const [state, setState] = useState({ loading: true });
  const [staff, setStaff] = useState(getStaffSession);
  const [busy, setBusy] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/maintenance/pre-production`, { headers: scanAuthHeaders({ 'X-Tenant-ID': tenantId }) });
      if (res.status === 401) { clearStaffSession(); setStaff(null); setState({ needLogin: true }); return; }
      const data = await res.json();
      if (!res.ok) { setState({ error: data.detail || 'Could not load checklist' }); return; }
      setState(data);
    } catch { setState({ error: 'Could not reach the server' }); }
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const staffLogin = (m, tok) => { setStaff(saveStaffSession(m, tok)); setState({ loading: true }); load(); };
  const staffLogout = () => {
    const s = getStaffSession();
    if (s?.token) fetch(`${API_URL}/api/maintenance/staff-auth/logout`, { method: 'POST', headers: { 'X-Staff-Token': s.token } }).catch(() => {});
    clearStaffSession(); setStaff(null); setState({ loading: true }); load();
  };

  const post = async (path, body) => {
    const res = await fetch(`${API_URL}/api/maintenance/pre-production/${path}`, {
      method: 'POST', headers: scanAuthHeaders({ 'Content-Type': 'application/json', 'X-Tenant-ID': tenantId }), body: JSON.stringify(body || {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Could not save');
    return data;
  };

  const tick = async (it) => {
    setBusy((b) => ({ ...b, [it.id]: true }));
    try {
      let pos = {};
      if (state.geofence_enabled) { const p = await getPosition(); if (!p) throw new Error('Location access is required — allow GPS to record maintenance here.'); pos = p; }
      const r = await post(`${it.id}/clear`, pos);
      setState((s) => ({ ...s, items: s.items.map((e) => (e.id === it.id ? { ...e, cleared: true, can_tick: false, can_undo: true, record: { performed_by: r.record.performed_by, completed_at: r.record.completed_at } } : e)) }));
      toast.success(`${it.name} — cleared for the next production run`, { description: 'Untick to undo' });
    } catch (e) { toast.error(e.message); load(); } finally { setBusy((b) => ({ ...b, [it.id]: false })); }
  };
  const untick = async (it) => {
    setBusy((b) => ({ ...b, [it.id]: true }));
    try {
      await post(`${it.id}/undo`);
      setState((s) => ({ ...s, items: s.items.map((e) => (e.id === it.id ? { ...e, cleared: false, can_tick: !e.not_assigned, can_undo: false, record: null } : e)) }));
      toast(`${it.name} — clearance removed`, { icon: <Undo2 className="h-4 w-4" /> });
    } catch (e) { toast.error(e.message); load(); } finally { setBusy((b) => ({ ...b, [it.id]: false })); }
  };

  if (state.needLogin) return <StaffScanLogin scanRef={{ pre_production: tenantId }} equipmentName="Pre-Production Checklist" onLogin={staffLogin} />;

  const Shell = ({ children }) => (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center p-4 pt-8" data-testid="pre-production-page">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center gap-2 text-slate-700">
          <div className="p-2 rounded-lg bg-amber-600 text-white"><Factory className="h-5 w-5" /></div>
          <div><p className="font-bold leading-tight">Pre-Production Checklist</p><p className="text-xs text-muted-foreground">Clear each equipment before the next production run</p></div>
        </div>
        {children}
      </div>
    </div>
  );
  if (state.loading) return <Shell><Card><CardContent className="py-10 text-center text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading…</CardContent></Card></Shell>;
  if (state.error) return <Shell><Card><CardContent className="py-8 text-center" data-testid="pre-production-error"><XCircle className="h-8 w-8 mx-auto text-red-500 mb-2" /><p className="font-medium">{state.error}</p></CardContent></Card></Shell>;

  const cleared = state.items.filter((i) => i.cleared).length;
  return (
    <Shell>
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="pre-production-actor-chip">
        <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <p className="text-sm flex-1 truncate">Recording as <span className="font-bold">{staff?.name || state.actor?.name}</span>{!staff && state.actor?.is_admin ? <span className="text-xs text-muted-foreground"> · admin</span> : null}</p>
        {staff && <button onClick={staffLogout} className="text-xs font-semibold text-emerald-700 hover:underline shrink-0" data-testid="pre-production-staff-switch">Switch</button>}
      </div>
      <Card><CardContent className="p-0" data-testid="pre-production-list">
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-slate-50">
          <p className="text-xs text-slate-600"><span className="font-semibold">Tick = cleared instantly.</span> Untick your own tick to undo.</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cleared === state.items.length && state.items.length ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`} data-testid="pre-production-progress">{cleared}/{state.items.length} cleared</span>
        </div>
        {state.items.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">No equipment is marked "before every production run".</p>}
        {state.items.map((it) => (
          <div key={it.id} className={`flex items-start gap-3 px-4 py-3 border-b last:border-0 ${it.can_tick || it.can_undo ? '' : 'opacity-80'}`} data-testid={`pre-production-item-${it.id}`}>
            {busy[it.id] ? <RefreshCw className="mt-0.5 h-4 w-4 animate-spin text-emerald-600 shrink-0" />
              : it.can_tick || it.can_undo ? (
                <Checkbox className="mt-0.5 h-5 w-5 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600" checked={it.cleared}
                  onCheckedChange={() => (it.cleared ? untick(it) : tick(it))} data-testid={`pre-production-check-${it.id}`} />
              ) : (
                <span className="mt-0.5 h-5 w-5 shrink-0 flex items-center justify-center">
                  {it.cleared ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <span className="h-4 w-4 rounded border border-slate-200 bg-slate-100 block" />}
                </span>
              )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm truncate">{it.name}</p>
                {it.cleared ? <Badge className="bg-emerald-600 text-[10px]">Cleared</Badge>
                  : it.not_assigned ? <Badge variant="outline" className="text-[10px] text-slate-500"><Lock className="h-3 w-3 mr-1" />Assigned to others</Badge>
                  : <Badge className="bg-amber-500 text-[10px]">Pending</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{[it.type, it.location].filter(Boolean).join(' · ')}</p>
              <p className="text-[11px] text-slate-500">{it.all_skus ? 'Every SKU' : `SKUs: ${it.sku_names.join(', ')}`}</p>
              {it.cleared && it.record && <p className="text-xs text-emerald-700">By {it.record.performed_by} · {(it.record.completed_at || '').slice(0, 16).replace('T', ' ')}{it.can_undo ? ' · untick to undo' : ''}</p>}
              {it.not_assigned && !it.cleared && it.assigned_staff?.length > 0 && <p className="text-xs text-slate-500">Assigned to {it.assigned_staff.map((s) => s.name).join(', ')}</p>}
            </div>
          </div>
        ))}
      </CardContent></Card>
      <p className="text-[11px] text-muted-foreground text-center">A clearance stays valid until the next production batch of a matching SKU is created, which links it to that batch.</p>
    </Shell>
  );
}
