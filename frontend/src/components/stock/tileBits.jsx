import React from 'react';
import { AlertTriangle } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmt = (v) => Number(v || 0).toLocaleString('en-IN');
export const fmtCrates = (v) => (v == null ? '\u2014' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }));
// Day + 3-letter month, no year (e.g. "15 Oct").
export const fmtDate = (iso) => {
  if (!iso) return '\u2014';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
};

export const Row = ({ label, value, sub, tone = 'text-slate-800', strong = false, testId, extra, note }) => (
  <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
    <span className="text-sm text-slate-500">{label}</span>
    <span className="text-right">
      {note && <span className="mr-2 text-sm font-medium text-rose-700">{note}</span>}
      <span className={`text-xl tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${tone}`} data-testid={testId} {...extra}>{value}</span>
      {sub && <span className="ml-1 text-sm text-slate-400">{sub}</span>}
    </span>
  </div>
);

export const TileShell = ({ critical, accent, icon, title, subtitle, alertTitle, testId, extra, children }) => (
  <div className={`group relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md ${critical ? 'border-rose-300' : accent}`} data-testid={testId} {...extra}>
    <div className="flex items-center gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold leading-tight text-slate-900 [overflow-wrap:anywhere]" data-testid={`${testId.replace('-tile-', '-name-')}`}>{title}</h3>
        <p className="text-sm leading-tight text-slate-500">{subtitle || '\u00a0'}</p>
      </div>
      {critical && <AlertTriangle className="h-5 w-5 shrink-0 text-rose-700" title={alertTitle} data-testid={`${testId.replace(/^(\w+)-tile-/, '$1-priority-badge-')}`} />}
    </div>
    {children}
  </div>
);

export const StatsBlock = ({ critical, urgency, testId, urgencyValue, title, children }) => (
  <div className={`mt-4 space-y-2 rounded-xl px-4 py-3 ${critical ? 'bg-rose-50' : urgency === 'green' ? 'bg-emerald-50/60' : 'bg-slate-50'}`} data-testid={testId} data-urgency={urgencyValue || ''} title={title || ''}>
    {children}
  </div>
);

export const SkuList = ({ skus, critical, prefix, emptyText, emptyTestId }) => (
  skus.length === 0 ? (
    <p className="text-sm text-slate-400" data-testid={emptyTestId}>{emptyText}</p>
  ) : (
    <ul className="divide-y divide-slate-100">
      {skus.map((sk) => (
        <li key={sk.child_sku_id} className="flex items-center justify-between gap-4 py-2" data-testid={`${prefix}-${sk.child_sku_id}`}>
          <span className="min-w-0 flex flex-wrap items-center gap-2 text-sm text-slate-700 [overflow-wrap:anywhere]" title={`${fmt(sk.stock_in_hand)} units${sk.warehouses?.length ? ' · ' + sk.warehouses.map((w) => `${w.location_name} ${fmt(w.quantity)}`).join(', ') : ''}`}>
            <span>{sk.child_sku_name}</span>
            {sk.shared && <span className="rounded bg-violet-100 px-1.5 py-px text-[11px] font-medium text-violet-700" data-testid={`shared-tag-${sk.child_sku_id}`}>shared</span>}
            {sk.warehouses?.length > 0 && <span className="text-xs text-slate-400">{sk.warehouses.map((w) => `${w.location_name} ${fmtCrates(w.quantity / (sk.units_per_crate || 1))}`).join(' · ')}</span>}
          </span>
          <span className={`shrink-0 whitespace-nowrap text-base tabular-nums ${critical ? 'font-semibold text-rose-700' : sk.stock_in_hand > 0 ? 'text-slate-800' : 'text-slate-400'}`} data-testid={`${prefix}-qty-${sk.child_sku_id}`}>{fmtCrates(sk.stock_crates)}<span className="ml-1 text-xs text-slate-400">cr</span></span>
        </li>
      ))}
    </ul>
  )
);
