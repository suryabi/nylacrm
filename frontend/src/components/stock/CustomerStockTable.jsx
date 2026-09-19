import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Store } from 'lucide-react';
import { fmtCrates, fmtDate } from './tileBits';

const statusOf = (t) => {
  if (t.low_stock) return { label: 'Short', cls: 'bg-rose-700 text-white' };
  if (t.next_order_urgency === 'green') return { label: 'Covered', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
  if (!t.child_skus.length) return { label: 'No branded SKU', cls: 'bg-slate-100 text-slate-500' };
  return { label: 'No orders', cls: 'bg-slate-100 text-slate-500' };
};
const tone = (t) => (t.low_stock ? 'text-rose-700 font-semibold' : t.next_order_urgency === 'green' ? 'text-emerald-700' : 'text-slate-700');

const Th = ({ children, right, className = '' }) => (
  <th className={`whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${right ? 'text-right' : 'text-left'} ${className}`}>{children}</th>
);

const DistributorBlock = ({ name, rows, open, onToggle }) => {
  const short = rows.filter((r) => r.low_stock).length;
  const inHand = rows.reduce((s, r) => s + (r.stock_crates || 0), 0);
  const expected = rows.reduce((s, r) => s + (r.expected_crates || 0), 0);
  const key = (name || 'unassigned').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <>
      <tr className="cursor-pointer select-none bg-slate-50/90 hover:bg-slate-100/80" onClick={onToggle} data-testid={`cst-dist-${key}`} data-open={open ? 'true' : 'false'}>
        <td colSpan={4} className="px-3 py-2.5">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
            {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
            <Store className="h-4 w-4 text-[#002FA7]" /> {name}
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">{rows.length} customer{rows.length === 1 ? '' : 's'}</span>
            {short > 0 && <span className="rounded-full bg-rose-700 px-2 py-0.5 text-[11px] font-semibold text-white" data-testid={`cst-dist-short-${key}`}>{short} short</span>}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-bold tabular-nums text-slate-900" data-testid={`cst-dist-inhand-${key}`}>{fmtCrates(inHand)} <span className="text-xs font-medium text-slate-400">cr</span></td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sm font-bold tabular-nums text-slate-900" data-testid={`cst-dist-expected-${key}`}>{fmtCrates(expected)} <span className="text-xs font-medium text-slate-400">cr</span></td>
        <td colSpan={3} />
      </tr>
      {open && rows.map((t) => {
        const st = statusOf(t);
        return (
          <tr key={t.account_id} className={`border-t border-slate-100 text-sm hover:bg-slate-50/60 ${t.low_stock ? 'bg-rose-50/40' : ''}`} data-testid={`cst-row-${t.account_id}`}>
            <td className="px-3 py-2.5 pl-10 align-top">
              <div className="font-medium text-slate-900 [overflow-wrap:anywhere]">{t.account_name}</div>
              <div className="text-xs text-slate-400">{t.city || t.account_code || '\u00a0'}</div>
            </td>
            <td className="px-3 py-2.5 align-top text-xs">
              {(t.brand_group_names || []).length ? t.brand_group_names.map((g) => <span key={g} className="mr-1 inline-block rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 font-medium text-violet-700">{g}</span>) : <span className="text-slate-300">—</span>}
            </td>
            <td className="px-3 py-2.5 align-top">
              {t.child_skus.length === 0 ? <span className="text-xs text-slate-400">No branded SKU</span> : (
                <ul className="space-y-0.5">
                  {t.child_skus.map((s) => (
                    <li key={s.child_sku_id} className="flex items-center justify-between gap-3 text-xs [overflow-wrap:anywhere]">
                      <span className="text-slate-700">{s.child_sku_name}{s.shared && <span className="ml-1.5 rounded border border-violet-200 bg-violet-50 px-1 py-px text-[10px] font-medium text-violet-700">shared</span>}</span>
                      <span className={`shrink-0 tabular-nums ${s.stock_in_hand > 0 ? 'text-slate-800' : 'text-slate-400'}`}>{fmtCrates(s.stock_crates)} cr</span>
                    </li>
                  ))}
                </ul>
              )}
            </td>
            <td className="px-3 py-2.5 align-top">
              <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`} data-testid={`cst-status-${t.account_id}`}>{st.label}</span>
            </td>
            <td className={`whitespace-nowrap px-3 py-2.5 text-right align-top tabular-nums ${t.low_stock ? 'text-rose-700 font-semibold' : t.child_skus.length ? 'text-slate-900' : 'text-slate-400'}`} data-testid={`cst-inhand-${t.account_id}`}>
              {t.child_skus.length ? fmtCrates(t.stock_crates) : '0'} <span className="text-xs font-normal text-slate-400">cr</span>
              {t.low_stock && <span className="ml-1.5 rounded bg-rose-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">−{fmtCrates(t.expected_crates - t.stock_crates)}</span>}
            </td>
            <td className={`whitespace-nowrap px-3 py-2.5 text-right align-top tabular-nums ${tone(t)}`} data-testid={`cst-expected-${t.account_id}`}>{t.expected_crates != null ? <>{fmtCrates(t.expected_crates)} <span className="text-xs font-normal text-slate-400">cr</span></> : '—'}</td>
            <td className={`whitespace-nowrap px-3 py-2.5 text-right align-top tabular-nums ${tone(t)}`} data-testid={`cst-next-${t.account_id}`}>{fmtDate(t.expected_next_order_date)}</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right align-top tabular-nums text-slate-700" data-testid={`cst-last-${t.account_id}`}>
              {t.last_order_date ? <><span className="font-medium">{fmtCrates(t.last_order_crates)} cr</span><span className="mx-1.5 text-slate-300">·</span>{fmtDate(t.last_order_date)}</> : '—'}
            </td>
            <td className="px-3 py-2.5 align-top text-xs text-slate-500 [overflow-wrap:anywhere]">{t.last_order_distributor || '—'}</td>
          </tr>
        );
      })}
    </>
  );
};

export const CustomerStockTable = ({ tiles }) => {
  const [closed, setClosed] = useState({});
  const blocks = useMemo(() => {
    const by = new Map();
    tiles.forEach((t) => {
      const k = t.distributor_name || 'Unassigned';
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(t);
    });
    return [...by.entries()].sort(([a], [b]) => (a === 'Unassigned') - (b === 'Unassigned') || a.localeCompare(b));
  }, [tiles]);
  if (!blocks.length) return <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500" data-testid="cst-empty">No customers match the current filters.</div>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-white shadow-sm" data-testid="cst-table-wrap">
      <table className="w-full min-w-[1100px] text-left" data-testid="cst-table">
        <thead className="border-b border-slate-200 bg-white">
          <tr>
            <Th className="w-[22%]">Customer</Th>
            <Th>Brand group</Th>
            <Th className="w-[22%]">Branded SKUs · in hand</Th>
            <Th>Status</Th>
            <Th right>In hand</Th>
            <Th right>Expected</Th>
            <Th right>Next order</Th>
            <Th right>Last order</Th>
            <Th>Last order via</Th>
          </tr>
        </thead>
        <tbody>
          {blocks.map(([name, rows]) => (
            <DistributorBlock key={name} name={name} rows={rows} open={!closed[name]} onToggle={() => setClosed((c) => ({ ...c, [name]: !c[name] }))} />
          ))}
        </tbody>
      </table>
    </div>
  );
};
