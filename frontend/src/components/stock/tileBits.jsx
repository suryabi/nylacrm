import React from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmt = (v) => Number(v || 0).toLocaleString('en-IN');
export const fmtCrates = (v) => (v == null ? '\u2014' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }));
// Day + 3-letter month, no year (e.g. "15 Oct").
export const fmtDate = (iso) => {
  if (!iso) return '\u2014';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
};
// Last-order format: "18-Sep-2026".
export const fmtDateFull = (iso) => {
  if (!iso) return '\u2014';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
};

// state: 'critical' | 'covered' | 'neutral'
export const stateOf = (critical, urgency) => (critical ? 'critical' : urgency === 'green' ? 'covered' : 'neutral');
const DECK = {
  critical: 'bg-rose-50/70 border-rose-200 divide-rose-200/70',
  covered: 'bg-emerald-50/40 border-emerald-200/70 divide-emerald-200/50',
  neutral: 'bg-slate-50/80 border-slate-200/70 divide-slate-200/70',
};
const VALUE = { critical: 'text-rose-700', covered: 'text-emerald-700', neutral: 'text-slate-900' };

export const TileShell = ({ state, group = false, title, subtitle, avatar, alertLabel, testId, extra, children }) => (
  <div className={`relative flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-md ${
    state === 'critical' ? 'border-rose-300 ring-1 ring-rose-200/80 bg-gradient-to-b from-rose-50/30 to-white'
      : group ? 'border-violet-200/90 hover:border-violet-300 bg-gradient-to-b from-violet-50/25 to-white'
        : 'border-slate-200/90 hover:border-slate-300'}`} data-testid={testId} {...extra}>
    <div className="flex items-start gap-3.5">
      {avatar}
      <div className="min-w-0 flex-1 pr-2">
        <h3 className="truncate text-sm font-medium leading-snug text-slate-900" title={typeof title === 'string' ? title : undefined} data-testid={testId.replace('-tile-', '-name-')}>{title}</h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">{subtitle || '\u00a0'}</p>
      </div>
      {state === 'critical' && <span className="sr-only" data-testid={testId.replace(/^(\w+)-tile-/, '$1-priority-badge-')}>{alertLabel}</span>}
    </div>
    {children}
  </div>
);

export const Kpi = ({ label, value, unit, tone, testId, extra, pill, sub }) => (
  <div className="min-w-0 px-3 first:pl-0 last:pr-0">
    <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
    <p className="mt-1 flex items-baseline gap-1 whitespace-nowrap">
      <span className={`text-base font-medium tabular-nums ${tone}`} data-testid={testId} {...extra}>{value}</span>
      {unit && <span className="text-xs font-medium text-slate-400">{unit}</span>}
      {pill && <span className="ml-1.5 inline-flex items-center rounded bg-rose-700 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">{pill}</span>}
    </p>
    {sub && <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-400">{sub}</p>}
  </div>
);

export const KpiDeck = ({ state, testId, urgencyValue, title, children }) => (
  <div className={`mt-3 grid grid-cols-3 divide-x rounded-xl border p-3 ${DECK[state]}`} data-testid={testId} data-urgency={urgencyValue || ''} title={title || ''}>
    {children}
  </div>
);
export const kpiTone = (state, hasValue) => (hasValue ? VALUE[state] : 'text-slate-300');

export const SkuTable = ({ skus, state, prefix, emptyText, emptyTestId, showOwner = false }) => (
  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-0.5">
    {skus.length === 0 ? (
      <p className="py-2 text-xs text-slate-400" data-testid={emptyTestId}>{emptyText}</p>
    ) : skus.map((sk) => (
      <div key={sk.child_sku_id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0" data-testid={`${prefix}-${sk.child_sku_id}`}>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-800 [overflow-wrap:anywhere]">
            <span>{sk.child_sku_name}</span>
            {sk.shared && <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700" data-testid={`shared-tag-${sk.child_sku_id}`}>shared</span>}
            {!sk.shared && !sk.generic && sk.owner_name && showOwner && <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700" data-testid={`own-tag-${sk.child_sku_id}`}>own · {sk.owner_name}</span>}
            {sk.generic && <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700" data-testid={`generic-tag-${sk.sku_id}`}>{sk.scope === 'distributor' ? 'generic · at distributor' : 'generic · all warehouses'}</span>}
            {sk.reserved_crates > 0 && <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500" title="Committed to open Stock-Out orders" data-testid={`reserved-tag-${sk.child_sku_id}`}>{fmtCrates(sk.reserved_crates)} reserved</span>}
          </p>
          {sk.warehouses?.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              {sk.warehouses.map((w) => <span key={w.location_id || w.location_name} className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-600">{w.location_name} · {fmtCrates(w.quantity / (sk.units_per_crate || 1))}</span>)}
            </p>
          )}
        </div>
        <span className={`shrink-0 whitespace-nowrap text-right text-xs font-medium tabular-nums ${state === 'critical' ? 'text-rose-700' : sk.stock_in_hand > 0 ? 'text-slate-900' : 'text-slate-400'}`} data-testid={`${prefix}-qty-${sk.child_sku_id}`}>
          {fmtCrates(sk.stock_crates)}
        </span>
      </div>
    ))}
  </div>
);

export const Footer = ({ rows }) => (
  <div className="mt-3 space-y-1 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
    {rows.map((r) => (
      <div key={r.label} className="flex items-center justify-between gap-3 whitespace-nowrap">
        <span>{r.label}</span>
        <span className="tabular-nums text-slate-700">{r.value}</span>
      </div>
    ))}
  </div>
);
