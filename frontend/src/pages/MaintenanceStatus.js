import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { AlertDigestCard } from '../components/AlertDigestCard';
import { toast } from 'sonner';
import { CalendarCheck2, ChevronLeft, ChevronRight, Mail, Building2, CheckCircle2, XCircle, CircleDashed, CircleAlert } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` });

const STATUS_META = {
  completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
  incomplete: { label: 'Incomplete', cls: 'bg-amber-100 text-amber-800 border-amber-200', icon: CircleAlert },
  missed: { label: 'MISSED', cls: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: CircleDashed },
  upcoming: { label: 'Upcoming', cls: 'bg-blue-50 text-blue-600 border-blue-200', icon: CircleDashed },
};

const StatusChip = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.pending;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${m.cls}`}>
      <Icon className="h-3.5 w-3.5" />{m.label}
    </span>
  );
};

export default function MaintenanceStatus() {
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/maintenance/daily-status?date=${d}`, { headers: authHeaders() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail || 'Failed to load');
      setData(j);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(day); }, [day, load]);

  const shiftDay = (n) => {
    const d = new Date(day + 'T00:00:00');
    d.setDate(d.getDate() + n);
    setDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  const sendDigest = async () => {
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/maintenance/daily-digest/send?date=${day}`, { method: 'POST', headers: authHeaders() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail || 'Failed to send');
      toast.success(j.sent ? `Report emailed to ${j.emails} admin(s)` : `Not sent — ${j.reason}`);
    } catch (e) { toast.error(e.message); } finally { setSending(false); }
  };

  const t = data?.totals || {};

  return (
    <div className="p-4 sm:p-6 space-y-4" data-testid="maintenance-status-page">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarCheck2 className="h-6 w-6 text-emerald-600" />Daily Maintenance Status</h1>
          <p className="text-sm text-muted-foreground">Pick a day to see every scheduled equipment check, grouped by facility, floor and area</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDay(-1)} data-testid="ms-prev-day"><ChevronLeft className="h-4 w-4" /></Button>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-9 w-44" data-testid="ms-date-input" />
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDay(1)} data-testid="ms-next-day"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" className="h-9" onClick={sendDigest} disabled={sending} data-testid="ms-send-digest">
            <Mail className="h-4 w-4 mr-2" />{sending ? 'Sending…' : 'Email This Report'}
          </Button>
        </div>
      </div>

      <AlertDigestCard day={day} />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[['Scheduled', t.scheduled, 'text-slate-800'], ['Completed', t.completed, 'text-emerald-600'],
          ['Incomplete', t.incomplete, 'text-amber-600'], ['Missed', t.missed, 'text-red-600'],
          ['Pending', (t.pending || 0) + (t.upcoming || 0), 'text-slate-500']].map(([label, v, cls]) => (
          <div key={label} className="rounded-xl border bg-white dark:bg-slate-900 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${cls}`} data-testid={`ms-total-${label.toLowerCase()}`}>{v ?? 0}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground px-1">Loading…</p>
      ) : !data || data.facilities.length === 0 ? (
        <div className="rounded-xl border bg-white dark:bg-slate-900 p-10 text-center text-muted-foreground" data-testid="ms-empty">
          No maintenance was scheduled on {day}.
        </div>
      ) : (
        data.facilities.map((fac) => (
          <div key={fac.name} className="rounded-xl border bg-white dark:bg-slate-900 overflow-hidden" data-testid={`ms-facility-${fac.name.replace(/\s/g, '-')}`}>
            <div className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5">
              <Building2 className="h-4 w-4" />
              <span className="font-semibold text-sm">{fac.name}</span>
              {fac.missed > 0 && <Badge className="bg-red-500 hover:bg-red-500 text-white ml-2">{fac.missed} need attention</Badge>}
            </div>
            {fac.floors.map((fl) => (
              <div key={fl.name} className="border-t border-slate-100 dark:border-slate-800">
                {fl.areas.map((ar) => (
                  <div key={ar.name} className="px-4 py-3 border-t first:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{fl.name} › {ar.name}</span>
                      <span className={`text-xs font-semibold ${ar.missed ? 'text-red-600' : 'text-emerald-600'}`}>
                        {ar.completed}/{ar.equipment.length} done{ar.missed ? ` · ${ar.missed} need attention` : ''}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {ar.equipment.map((e) => (
                        <div key={e.equipment_id} className={`flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-sm ${e.status === 'missed' ? 'bg-red-50 dark:bg-red-950/30' : 'bg-slate-50 dark:bg-slate-800/50'}`} data-testid={`ms-eq-${e.name.replace(/\s/g, '-')}`}>
                          <span className="font-semibold min-w-[180px]">{e.name}</span>
                          <span className="text-xs text-muted-foreground">{e.type || ''}</span>
                          <span className="ml-auto flex items-center gap-3">
                            {e.performed_by && <span className="text-xs text-slate-600 dark:text-slate-300">{e.performed_by}{e.time ? ` · ${e.time}` : ''}</span>}
                            {e.remarks && <span className="text-xs italic text-slate-400 max-w-[200px] truncate" title={e.remarks}>“{e.remarks}”</span>}
                            <StatusChip status={e.status} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))
      )}
      <p className="text-[11px] text-muted-foreground">A consolidated report email with this exact breakdown is sent automatically to admins every day at 9 PM IST. Facilities and areas with missed checks are listed first.</p>
    </div>
  );
}
