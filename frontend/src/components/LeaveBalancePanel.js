import React from 'react';
import { Card } from './ui/card';
import { Wallet, ArrowRightLeft, Clock, PartyPopper, UserCheck, CalendarCheck, Info } from 'lucide-react';

const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const n = (x) => (Number.isInteger(x) ? x : Number(x).toFixed(1));

const Stat = ({ label, value, sub, tone = 'slate', testid }) => {
  const tones = { blue: 'from-[#002FA7] to-blue-600 text-white', emerald: 'from-emerald-500 to-teal-600 text-white', amber: 'from-amber-400 to-orange-500 text-white', slate: 'from-slate-100 to-slate-200 text-slate-800' };
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${tones[tone]} p-4 shadow-sm`} data-testid={testid}>
      <p className={`text-[11px] uppercase tracking-widest font-semibold ${tone === 'slate' ? 'text-slate-500' : 'opacity-80'}`}>{label}</p>
      <p className="text-3xl font-black leading-tight mt-1">{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${tone === 'slate' ? 'text-slate-500' : 'opacity-85'}`}>{sub}</p>}
    </div>
  );
};

// "My Leave Balance" — computed server-side from the Leave & Holiday Policy.
export const LeaveBalancePanel = ({ balance: b, compact = false }) => {
  if (!b) return null;
  const sc = b.sick_casual; const v = b.variable;
  const pct = Math.min(100, Math.round(((sc.used + sc.pending) / (sc.annual + sc.carry_forward || 1)) * 100));
  return (
    <Card className={`border-0 bg-white/90 backdrop-blur-xl shadow-lg shadow-slate-200/50 rounded-2xl ${compact ? 'p-4' : 'p-5 lg:p-6'}`} data-testid="leave-balance-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2"><Wallet className="h-5 w-5 text-[#002FA7]" /> My leave balance · {b.year}</h2>
        <div className="text-xs text-slate-500 flex items-center gap-1" data-testid="leave-balance-manager">
          <UserCheck className="h-3.5 w-3.5" />
          {b.reporting_manager ? <>Requests go to <b className="text-slate-700">{b.reporting_manager.name}</b>{b.reporting_manager.title ? ` (${b.reporting_manager.title})` : ''}</> : <span className="text-amber-700">No reporting manager set — requests go to Admin/CEO</span>}
        </div>
      </div>
      <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
        <Stat label="Sick / Casual available" value={n(sc.available)} sub={`of ${n(sc.annual + sc.carry_forward)} this year`} tone="blue" testid="balance-available" />
        <Stat label="Used · Pending" value={`${n(sc.used)} · ${n(sc.pending)}`} sub={`accrued so far ${n(sc.accrued_to_date)} (1.5 / month)`} tone="slate" testid="balance-used" />
        <Stat label="Carried forward" value={n(sc.carry_forward)} sub={`max ${n(sc.carry_cap)} from ${b.year - 1}`} tone="emerald" testid="balance-carry" />
        <Stat label="Variable holidays left" value={`${v.available} / ${v.total}`} sub={b.city ? `${b.city} pool · ${v.pool.length} options` : 'set your city to pick'} tone="amber" testid="balance-variable" />
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-[11px] text-slate-500 mb-1"><span>Sick / Casual usage</span><span>{pct}%</span></div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-[#002FA7] transition-all" style={{ width: `${pct}%` }} /></div>
      </div>
      {!compact && (
        <div className="mt-4 grid sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3" data-testid="balance-upcoming-holidays">
            <p className="font-semibold text-rose-800 flex items-center gap-1 mb-1"><PartyPopper className="h-3.5 w-3.5" /> Next fixed holidays{b.city ? ` · ${b.city}` : ''}</p>
            {b.upcoming_holidays.length ? <ul className="space-y-0.5 text-rose-900">{b.upcoming_holidays.map((h) => <li key={h.date}><b>{fmt(h.date)}</b> — {h.name}</li>)}</ul> : <p className="text-rose-700/70">No more fixed holidays this year{b.city ? '' : ' (city not set)'}.</p>}
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3" data-testid="balance-variable-pool">
            <p className="font-semibold text-amber-800 flex items-center gap-1 mb-1"><CalendarCheck className="h-3.5 w-3.5" /> Variable holiday pool · pick {v.total}</p>
            {v.pool.length ? <p className="text-amber-900 leading-relaxed">{v.pool.map((x) => `${x.name} (${fmt(x.date)})${v.taken_dates.includes(x.date) ? ' ✓' : ''}`).join(' · ')}</p> : <p className="text-amber-700/70">Set your work location to see your pool.</p>}
          </div>
          <p className="sm:col-span-2 text-[11px] text-slate-500 flex items-start gap-1"><Info className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Leave days are counted as working days — Sundays and your city's fixed holidays are skipped. Up to {n(sc.carry_cap)} unused Sick/Casual days carry into next year. Unpaid leave used this year: {n(b.unpaid_used)}.</p>
        </div>
      )}
      {compact && <p className="mt-2 text-[11px] text-slate-500 flex items-center gap-1"><Clock className="h-3 w-3" /> Sundays & fixed holidays are not counted. <ArrowRightLeft className="h-3 w-3 ml-1" /> Carry forward max {n(sc.carry_cap)}.</p>}
    </Card>
  );
};

export default LeaveBalancePanel;
