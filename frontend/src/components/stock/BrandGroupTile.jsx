import React from 'react';
import { AlertTriangle, Layers } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (iso) => {
  if (!iso) return '\u2014';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
};
const fmt = (v) => Number(v || 0).toLocaleString('en-IN');
const fmtCrates = (v) => (v == null ? '\u2014' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }));

const Row = ({ label, value, sub, tone = 'text-slate-800', strong = false, testId, note }) => (
  <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
    <span className="text-[11px] text-slate-400">{label}</span>
    <span className="text-right">
      {note && <span className="mr-2 text-[11px] font-medium text-rose-700">{note}</span>}
      <span className={`text-base tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${tone}`} data-testid={testId}>{value}</span>
      {sub && <span className="ml-1 text-[11px] text-slate-400">{sub}</span>}
    </span>
  </div>
);

export const BrandGroupTile = ({ group }) => {
  const critical = group.low_stock;
  const noStock = group.shared_skus.length === 0;
  const tone = critical ? 'text-rose-700' : group.next_order_urgency === 'green' ? 'text-emerald-700' : 'text-slate-800';
  const shortfall = critical ? group.expected_crates - group.stock_crates : 0;
  return (
    <div className={`group relative flex min-h-[15rem] flex-col rounded-xl border bg-white p-4 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md ${critical ? 'border-rose-300' : 'border-violet-200'}`}
      data-testid={`group-tile-${group.group_id}`} data-priority={group.priority ? 'true' : 'false'}>
      <div className="flex items-center gap-2.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${critical ? 'bg-rose-700 text-white' : 'bg-violet-100 text-violet-700'}`}><Layers className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-tight text-slate-900" title={group.name} data-testid={`group-name-${group.group_id}`}>{group.name}</h3>
          <p className="truncate text-[11px] leading-tight text-slate-400" data-testid={`group-members-count-${group.group_id}`}>
            {group.members.length === group.total_members ? `${group.total_members} members` : `${group.members.length} of ${group.total_members} members`}{group.code ? ` · ${group.code}` : ''}
          </p>
        </div>
        {critical && <AlertTriangle className="h-4 w-4 shrink-0 text-rose-700" title="Shared stock cannot cover members' next orders" data-testid={`group-priority-badge-${group.group_id}`} />}
      </div>

      <div className={`mt-3 space-y-1.5 rounded-lg px-3 py-2.5 ${critical ? 'bg-rose-50' : group.next_order_urgency === 'green' ? 'bg-emerald-50/60' : 'bg-violet-50/60'}`} data-testid={`group-stats-${group.group_id}`} data-urgency={group.next_order_urgency || ''}>
        <Row label="Next order" value={fmtDate(group.expected_next_order_date)} tone={group.expected_next_order_date ? tone : 'text-slate-300'} strong={critical} testId={`group-next-order-${group.group_id}`} />
        <Row label="Expected (all)" value={fmtCrates(group.expected_crates)} sub={group.expected_crates != null ? 'cr' : ''} tone={group.expected_crates != null ? tone : 'text-slate-300'} strong={critical} testId={`group-expected-crates-${group.group_id}`} />
        <Row label="Shared in hand" value={noStock ? '\u2014' : fmtCrates(group.stock_crates)} sub={noStock ? '' : 'cr'} tone={noStock ? 'text-slate-300' : critical ? 'text-rose-700' : 'text-slate-900'} strong={critical}
          testId={`group-stock-total-${group.group_id}`} note={critical ? `\u2212${fmtCrates(shortfall)}` : null} />
      </div>

      <div className="mt-3">
        {noStock ? (
          <p className="text-[11px] text-slate-400" data-testid={`group-stock-none-${group.group_id}`}>No shared SKU</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {group.shared_skus.map((sk) => (
              <li key={sk.child_sku_id} className="flex items-center justify-between gap-3 py-1.5" data-testid={`group-sku-${sk.child_sku_id}`}>
                <span className="min-w-0 truncate text-xs text-slate-600" title={`${sk.child_sku_name} · ${fmt(sk.stock_in_hand)} units${sk.warehouses?.length ? ' · ' + sk.warehouses.map((w) => `${w.location_name} ${fmt(w.quantity)}`).join(', ') : ''}`}>{sk.child_sku_name}</span>
                <span className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${critical ? 'font-semibold text-rose-700' : sk.stock_in_hand > 0 ? 'text-slate-800' : 'text-slate-400'}`} data-testid={`group-sku-qty-${sk.child_sku_id}`}>{fmtCrates(sk.stock_crates)}<span className="ml-0.5 text-[10px] text-slate-400">cr</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="mt-3 flex-1 divide-y divide-slate-100 border-t border-slate-100" data-testid={`group-member-list-${group.group_id}`}>
        {group.members.map((m) => (
          <li key={m.account_id} className="flex items-center justify-between gap-3 py-1.5 whitespace-nowrap" data-testid={`group-member-${m.account_id}`}>
            <span className="min-w-0 flex items-center gap-1.5 truncate text-xs text-slate-600" title={`${m.account_name}${m.own_skus ? ` · ${m.own_skus} own SKU` : ''}${m.expected_next_order_date ? ` · next ${fmtDate(m.expected_next_order_date)} · ${fmtCrates(m.expected_crates)} cr` : ''}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.low_stock ? 'bg-rose-700' : m.expected_next_order_date ? 'bg-emerald-700' : 'bg-slate-300'}`} />
              <span className="truncate">{m.account_name}</span>
              {m.own_skus > 0 && <span className="shrink-0 rounded bg-slate-100 px-1 py-px text-[9px] font-medium text-slate-500" data-testid={`group-member-own-${m.account_id}`}>+{m.own_skus} own</span>}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-slate-500" data-testid={`group-member-last-${m.account_id}`}>
              {m.last_order_date ? <>{fmtCrates(m.last_order_crates)} cr <span className="mx-1 text-slate-300">·</span> {fmtDate(m.last_order_date)}</> : '\u2014'}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between whitespace-nowrap border-t border-slate-100 pt-2 text-[11px] text-slate-400">
        <span>Last orders</span>
        {group.last_order_date ? (
          <span className="tabular-nums">
            <span data-testid={`group-last-orders-${group.group_id}`}>{fmtCrates(group.last_orders_crates)} cr</span>
            <span className="mx-1.5 text-slate-300">·</span>
            <span data-testid={`group-last-order-date-${group.group_id}`}>{fmtDate(group.last_order_date)}</span>
          </span>
        ) : <span data-testid={`group-last-orders-${group.group_id}`}>{'\u2014'}</span>}
      </div>
      <div className="mt-1 flex items-center justify-between whitespace-nowrap text-[11px] text-slate-400">
        <span>Recent history</span>
        <span className="tabular-nums" data-testid={`group-history-${group.group_id}`}>{group.history_orders ? <>{fmtCrates(group.history_crates)} cr <span className="mx-1 text-slate-300">·</span> {group.history_orders} orders</> : '\u2014'}</span>
      </div>
    </div>
  );
};
