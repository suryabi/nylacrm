import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers, Store } from 'lucide-react';
import { fmtCrates, fmtDate } from './tileBits';

const COLS = 7;
const slug = (s) => (s || 'unassigned').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const statusOf = (t) => {
  if (t.low_stock) return { label: 'Short', cls: 'bg-rose-700 text-white' };
  if (t.next_order_urgency === 'green') return { label: 'Covered', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
  if (!t.child_skus.length) return { label: 'No branded SKU', cls: 'bg-slate-100 text-slate-500' };
  return { label: 'No orders', cls: 'bg-slate-100 text-slate-500' };
};
const tone = (t) => (t.low_stock ? 'text-rose-700 font-semibold' : t.next_order_urgency === 'green' ? 'text-emerald-700' : 'text-slate-700');
const uniqueInHand = (rows) => [...new Map(rows.flatMap((r) => r.child_skus).map((s) => [s.child_sku_id, s])).values()].reduce((s, sk) => s + (sk.stock_crates || 0), 0);
const expectedOf = (rows) => rows.reduce((s, r) => s + (r.expected_crates || 0), 0);

const Th = ({ children, right, className = '' }) => (
  <th className={`whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${right ? 'text-right' : 'text-left'} ${className}`}>{children}</th>
);
const Crates = ({ v, testId, cls = 'text-slate-900', unitCls = 'text-slate-400' }) => (
  <td className={`whitespace-nowrap px-3 py-2.5 text-right text-sm font-bold tabular-nums ${cls}`} data-testid={testId}>{fmtCrates(v)} <span className={`text-xs font-medium ${unitCls}`}>cr</span></td>
);

// Collapsible header row (distributor or brand group) with roll-up totals.
const HeaderRow = ({ level, icon, name, rows, unit, open, onToggle, testKey, extraCls = '' }) => {
  const short = rows.filter((r) => r.low_stock).length;
  const top = level === 0;
  return (
    <tr className={`cursor-pointer select-none ${extraCls}`} onClick={onToggle} data-testid={`${testKey}`} data-open={open ? 'true' : 'false'}>
      <td colSpan={3} className={`px-3 ${top ? 'py-3' : 'py-2.5 pl-10'}`}>
        <span className={`inline-flex flex-wrap items-center gap-2 ${top ? 'text-base font-semibold text-white' : 'text-sm font-bold text-violet-800'}`}>
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${top ? 'bg-white/15' : ''}`}>{open ? <ChevronDown className={`h-4 w-4 ${top ? 'text-white' : 'text-slate-400'}`} /> : <ChevronRight className={`h-4 w-4 ${top ? 'text-white' : 'text-slate-400'}`} />}</span>
          {icon} {name}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${top ? 'bg-white/15 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'}`}>{rows.length} {unit}{rows.length === 1 ? '' : 's'}</span>
          {short > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${top ? 'bg-rose-500 text-white' : 'bg-rose-700 text-white'}`} data-testid={`${testKey}-short`}>{short} short</span>}
          {top && !open && <span className="text-xs font-normal text-white/70">click to expand</span>}
        </span>
      </td>
      <Crates v={uniqueInHand(rows)} testId={`${testKey}-inhand`} cls={top ? 'text-white' : 'text-slate-900'} unitCls={top ? 'text-white/60' : 'text-slate-400'} />
      <Crates v={expectedOf(rows)} testId={`${testKey}-expected`} cls={top ? 'text-white' : 'text-slate-900'} unitCls={top ? 'text-white/60' : 'text-slate-400'} />
      <td colSpan={COLS - 5} className={top ? 'text-right pr-4 text-xs text-white/70' : ''}>{top ? 'In hand · Expected' : ''}</td>
    </tr>
  );
};

const CustomerRow = ({ t, indent }) => {
  const st = statusOf(t);
  return (
    <tr className={`border-t border-slate-100 text-sm hover:bg-slate-50/60 ${t.low_stock ? 'bg-rose-50/40' : ''}`} data-testid={`cst-row-${t.account_id}`}>
      <td className={`px-3 py-2.5 align-top ${indent === 2 ? 'pl-[4.5rem]' : 'pl-10'}`}>
        <div className="font-medium text-slate-900 [overflow-wrap:anywhere]">{t.account_name}</div>
        <div className="text-xs text-slate-400">{t.city || t.account_code || '\u00a0'}</div>
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
    </tr>
  );
};

const DistributorBlock = ({ name, rows, closed, toggle }) => {
  const dKey = `cst-dist-${slug(name)}`;
  const groups = new Map();
  const singles = [];
  rows.forEach((t) => {
    const g = (t.brand_group_names || [])[0];
    if (g) { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(t); } else singles.push(t);
  });
  const open = !closed[dKey];
  return (
    <>
      <HeaderRow level={0} icon={<Store className="h-4 w-4 text-white" />} name={name} rows={rows} unit="customer" open={open} onToggle={() => toggle(dKey)} testKey={dKey} extraCls="bg-[#002FA7] hover:bg-[#00268a] border-t-4 border-white" />
      {open && [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([g, members]) => {
        const gKey = `${dKey}-group-${slug(g)}`;
        const gOpen = !closed[gKey];
        return (
          <React.Fragment key={g}>
            <HeaderRow level={1} icon={<Layers className="h-4 w-4 text-violet-600" />} name={g} rows={members} unit="member" open={gOpen} onToggle={() => toggle(gKey)} testKey={gKey} extraCls="border-t border-violet-100 bg-violet-50/40 hover:bg-violet-50/70" />
            {gOpen && members.map((t) => <CustomerRow key={t.account_id} t={t} indent={2} />)}
          </React.Fragment>
        );
      })}
      {open && singles.map((t) => <CustomerRow key={t.account_id} t={t} indent={1} />)}
    </>
  );
};

export const CustomerStockTable = ({ tiles }) => {
  const [closed, setClosed] = useState({});
  const toggle = (k) => setClosed((c) => ({ ...c, [k]: !c[k] }));
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
      <table className="w-full min-w-[960px] text-left" data-testid="cst-table">
        <thead className="border-b border-slate-200 bg-white">
          <tr>
            <Th className="w-[30%]">Customer</Th>
            <Th className="w-[26%]">Branded SKUs · in hand</Th>
            <Th>Status</Th>
            <Th right>In hand</Th>
            <Th right>Expected</Th>
            <Th right>Next order</Th>
            <Th right>Last order</Th>
          </tr>
        </thead>
        <tbody>
          {blocks.map(([name, rows]) => <DistributorBlock key={name} name={name} rows={rows} closed={closed} toggle={toggle} />)}
        </tbody>
      </table>
    </div>
  );
};
