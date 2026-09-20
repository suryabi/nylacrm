import React from 'react';
import { Layers } from 'lucide-react';
import { TileShell, KpiDeck, Kpi, SkuTable, Footer, fmtCrates, fmtDate, fmtDateFull, stateOf, kpiTone } from './tileBits';

export const BrandGroupTile = ({ group }) => {
  const critical = group.low_stock;
  const state = stateOf(critical, group.next_order_urgency);
  const noStock = group.shared_skus.length === 0;
  const shortfall = critical ? group.expected_crates - group.stock_crates : 0;
  // Soonest expected order first; members without a forecast last (A–Z).
  const members = [...group.members].sort((a, b) => (a.expected_next_order_date ? 0 : 1) - (b.expected_next_order_date ? 0 : 1) || (a.expected_next_order_date || '').localeCompare(b.expected_next_order_date || '') || (a.account_name || '').localeCompare(b.account_name || ''));
  const membersLabel = group.members.length === group.total_members ? `${group.total_members} members` : `${group.members.length} of ${group.total_members} members`;
  return (
    <TileShell state={state} group title={group.name} alertLabel="Short"
      subtitle={<><span data-testid={`group-members-count-${group.group_id}`}>{membersLabel}</span>{group.code && <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">{group.code}</span>}</>}
      testId={`group-tile-${group.group_id}`} extra={{ 'data-priority': group.priority ? 'true' : 'false' }}
      avatar={<div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${critical ? 'bg-rose-700 text-white' : 'bg-violet-100 text-violet-700'}`}><Layers className="h-4 w-4" /></div>}>

      <KpiDeck state={state} testId={`group-stats-${group.group_id}`} urgencyValue={group.next_order_urgency}>
        <Kpi label="Next order" value={fmtDate(group.expected_next_order_date)} tone={kpiTone(state, !!group.expected_next_order_date)} testId={`group-next-order-${group.group_id}`} sub={`${group.members_ordering} of ${group.members.length} ordering`} />
        <Kpi label="Expected all (crates)" value={fmtCrates(group.expected_crates)} tone={kpiTone(state, group.expected_crates != null)} testId={`group-expected-crates-${group.group_id}`} />
        <Kpi label="Shared in hand (crates)" value={noStock ? '0' : fmtCrates(group.stock_crates)} tone={noStock ? 'text-slate-400' : critical ? 'text-rose-700' : 'text-slate-900'}
          testId={`group-stock-total-${group.group_id}`} pill={critical ? `\u2212${fmtCrates(shortfall)}` : null} />
      </KpiDeck>

      <SkuTable skus={group.shared_skus} state={state} prefix="group-sku" emptyText="No shared SKU" emptyTestId={`group-stock-none-${group.group_id}`} />

      <div className="mt-3 flex-1 border-t border-slate-100 pt-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_7.5rem] gap-3 px-2.5 text-[10px] uppercase tracking-wider text-violet-700">
          <span>Members</span>
          <span className="text-right font-medium normal-case tracking-normal text-slate-400">last order</span>
          <span className="text-right font-medium normal-case tracking-normal text-slate-400">next order</span>
        </div>
        <ul className="mt-1.5 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100" data-testid={`group-member-list-${group.group_id}`}>
          {members.map((m) => (
            <li key={m.account_id} className="grid grid-cols-[minmax(0,1fr)_7.5rem_7.5rem] items-center gap-3 px-2.5 py-1.5 text-xs transition-colors odd:bg-white even:bg-slate-50/70 hover:bg-violet-50/50" data-testid={`group-member-${m.account_id}`}
              title={`${m.account_name}${m.city ? ` · ${m.city}` : ''}`}>
              <span className="flex min-w-0 items-center gap-2 text-slate-700">
                <span className={`h-2 w-2 shrink-0 rounded-full ${m.low_stock ? 'bg-rose-700' : m.expected_next_order_date ? 'bg-emerald-700' : 'bg-slate-300'}`} />
                <span className={`min-w-0 truncate ${m.low_stock ? 'text-rose-700' : ''}`}>{m.account_name}</span>
              </span>
              <span className="whitespace-nowrap text-right tabular-nums text-slate-500" data-testid={`group-member-last-${m.account_id}`}>
                {m.last_order_date ? <><span className="text-slate-700">{fmtCrates(m.last_order_crates)}</span><span className="mx-1 text-slate-300">/</span>{fmtDateFull(m.last_order_date)}</> : '\u2014'}
              </span>
              <span className={`whitespace-nowrap text-right tabular-nums ${m.low_stock ? 'font-medium text-rose-700' : m.expected_next_order_date ? 'text-emerald-700' : 'text-slate-400'}`} data-testid={`group-member-next-${m.account_id}`}>
                {m.expected_next_order_date ? <><span>{fmtCrates(m.expected_crates)}</span><span className={`mx-1 ${m.low_stock ? 'text-rose-300' : 'text-emerald-300'}`}>/</span>{fmtDateFull(m.expected_next_order_date)}</> : '\u2014'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Footer rows={[
        { label: 'Last orders', value: group.last_order_date
          ? <><span data-testid={`group-last-orders-${group.group_id}`}>{fmtCrates(group.last_orders_crates)}</span><span className="mx-1.5 font-normal text-slate-300">/</span><span data-testid={`group-last-order-date-${group.group_id}`}>{fmtDateFull(group.last_order_date)}</span></>
          : <span data-testid={`group-last-orders-${group.group_id}`}>{'\u2014'}</span> },
        { label: 'Recent history', value: <span data-testid={`group-history-${group.group_id}`}>{group.history_orders ? <>{fmtCrates(group.history_crates)}<span className="mx-2 font-normal text-slate-300">·</span>{group.history_orders} orders</> : '\u2014'}</span> },
      ]} />
    </TileShell>
  );
};
