import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarOff, PartyPopper, UserMinus, ChevronRight } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const TYPE = { F: { label: 'Fixed holiday', cls: 'bg-rose-100 text-rose-800 border-rose-200' }, V: { label: 'Variable holiday', cls: 'bg-amber-100 text-amber-800 border-amber-200' } };
const LEAVE = { casual: 'Casual', sick: 'Sick', earned: 'Earned', unpaid: 'Unpaid' };

const DayBlock = ({ d }) => {
  if (!d.holidays.length && !d.on_leave.length) return null;
  const grouped = d.holidays.reduce((acc, h) => { const k = `${h.name}|${h.type}`; (acc[k] = acc[k] || { ...h, locations: [] }).locations.push(h.location); return acc; }, {});
  return (
    <div className="flex-1 min-w-[260px] space-y-2" data-testid={`leave-banner-${d.label}`}>
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{d.label} · {d.day}, {new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
      {Object.values(grouped).map((h, i) => (
        <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${TYPE[h.type]?.cls || 'bg-slate-100'}`} data-testid={`leave-banner-holiday-${d.label}-${i}`}>
          <PartyPopper className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="text-sm leading-tight"><b>{h.name}</b> <span className="text-xs opacity-80">· {TYPE[h.type]?.label}</span><p className="text-xs opacity-80">{h.locations.join(', ')}</p></div>
        </div>
      ))}
      {d.on_leave.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2" data-testid={`leave-banner-leaves-${d.label}`}>
          <p className="text-xs font-semibold text-sky-900 flex items-center gap-1"><UserMinus className="h-3.5 w-3.5" /> On leave ({d.on_leave.length})</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {d.on_leave.map((u) => <li key={u.user_id} className="text-xs bg-white border border-sky-200 rounded-full px-2 py-0.5 text-sky-900"><b>{u.name}</b>{u.city ? ` · ${u.city}` : ''} <span className="text-sky-600">· {LEAVE[u.leave_type] || u.leave_type}{u.start_date !== u.end_date ? ` till ${new Date(u.end_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

// Dashboard banner: who is on leave + fixed/variable holidays for today and tomorrow.
export const LeaveHolidayBanner = () => {
  const [data, setData] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    fetch(`${API_URL}/api/leave-policy/banner`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null));
  }, []);
  if (!data?.has_items) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4" data-testid="leave-holiday-banner">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm font-bold text-slate-800 flex items-center gap-2"><CalendarOff className="h-4 w-4 text-[#002FA7]" /> Leave & holidays — today and tomorrow</p>
        <button onClick={() => navigate('/company-documents?tab=leave')} className="text-xs font-semibold text-[#002FA7] hover:underline flex items-center gap-0.5" data-testid="leave-banner-policy-link">Leave policy <ChevronRight className="h-3 w-3" /></button>
      </div>
      <div className="flex flex-wrap gap-4">{data.days.map((d) => <DayBlock key={d.label} d={d} />)}</div>
    </div>
  );
};

export default LeaveHolidayBanner;
