import React from 'react';
import { Layers } from 'lucide-react';
import { Row, TileShell, StatsBlock, SkuList, fmtCrates, fmtDate } from './tileBits';

const Th = ({ children, right }) => <th className={`whitespace-nowrap pb-2 text-xs font-medium uppercase tracking-wide text-slate-400 ${right ? 'pl-3 text-right' : 'text-left'}`}>{children}</th>;

export const BrandGroupTile = ({ group }) => {
  const critical = group.low_stock;
  const noStock = group.shared_skus.length === 0;
  const tone = critical ? 'text-rose-700' : group.next_order_urgency === 'green' ? 'text-emerald-700' : 'text-slate-800';
  const shortfall = critical ? group.expected_crates - group.stock_crates : 0;
  const membersLabel = group.members.length === group.total_members ? `${group.total_members} members` : `${group.members.length} of ${group.total_members} members`;
  return (
    <TileShell critical={critical} accent="border-violet-200" title={group.name} alertTitle="Shared stock cannot cover members' next orders"
      subtitle={<span data-testid={`group-members-count-${group.group_id}`}>{membersLabel}{group.code ? ` · ${group.code}` : ''}</span>}
      testId={`group-tile-${group.group_id}`} extra={{ 'data-priority': group.priority ? 'true' : 'false' }}
      icon={<div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${critical ? 'bg-rose-700 text-white' : 'bg-violet-100 text-violet-700'}`}><Layers className="h-5 w-5" /></div>}>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(15rem,2fr)_3fr]">
        <div>
          <StatsBlock critical={critical} urgency={group.next_order_urgency} testId={`group-stats-${group.group_id}`} urgencyValue={group.next_order_urgency}>
            <Row label="Next order" value={fmtDate(group.expected_next_order_date)} tone={group.expected_next_order_date ? tone : 'text-slate-300'} strong={critical} testId={`group-next-order-${group.group_id}`} />
            <Row label="Expected (all)" value={fmtCrates(group.expected_crates)} sub={group.expected_crates != null ? 'cr' : ''} tone={group.expected_crates != null ? tone : 'text-slate-300'} strong={critical} testId={`group-expected-crates-${group.group_id}`} />
            <Row label="Shared in hand" value={noStock ? '\u2014' : fmtCrates(group.stock_crates)} sub={noStock ? '' : 'cr'} tone={noStock ? 'text-slate-300' : critical ? 'text-rose-700' : 'text-slate-900'} strong={critical}
              testId={`group-stock-total-${group.group_id}`} note={critical ? `\u2212${fmtCrates(shortfall)}` : null} />
          </StatsBlock>
          <div className="mt-4">
            <SkuList skus={group.shared_skus} critical={critical} prefix="group-sku" emptyText="No shared SKU" emptyTestId={`group-stock-none-${group.group_id}`} />
          </div>
          <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm text-slate-500">
            <div className="flex items-center justify-between whitespace-nowrap">
              <span>Last orders</span>
              <span className="tabular-nums text-slate-700">
                {group.last_order_date ? (<><span data-testid={`group-last-orders-${group.group_id}`}>{fmtCrates(group.last_orders_crates)} cr</span><span className="mx-2 text-slate-300">·</span><span data-testid={`group-last-order-date-${group.group_id}`}>{fmtDate(group.last_order_date)}</span></>)
                  : <span data-testid={`group-last-orders-${group.group_id}`}>{'\u2014'}</span>}
              </span>
            </div>
            <div className="flex items-center justify-between whitespace-nowrap">
              <span>Recent history</span>
              <span className="tabular-nums text-slate-700" data-testid={`group-history-${group.group_id}`}>{group.history_orders ? <>{fmtCrates(group.history_crates)} cr<span className="mx-2 text-slate-300">·</span>{group.history_orders} orders</> : '\u2014'}</span>
            </div>
          </div>
        </div>

        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm" data-testid={`group-member-list-${group.group_id}`}>
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Member</Th>
                <Th right>Last order</Th>
                <Th right>Next order</Th>
                <Th right>Expected</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {group.members.map((m) => (
                <tr key={m.account_id} data-testid={`group-member-${m.account_id}`}>
                  <td className="py-2 pr-3 align-top">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.low_stock ? 'bg-rose-700' : m.expected_next_order_date ? 'bg-emerald-700' : 'bg-slate-300'}`} />
                      <div className="min-w-0 [overflow-wrap:anywhere]">
                        <div className="font-medium text-slate-800">{m.account_name}</div>
                        <div className="text-xs text-slate-400">{[m.city, m.own_skus > 0 ? `${m.own_skus} own SKU` : null].filter(Boolean).join(' · ') || '\u00a0'}{m.own_skus > 0 && <span className="sr-only" data-testid={`group-member-own-${m.account_id}`}>+{m.own_skus} own</span>}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right align-top tabular-nums text-slate-700" data-testid={`group-member-last-${m.account_id}`}>
                    {m.last_order_date ? <><span className="font-medium">{fmtCrates(m.last_order_crates)} cr</span><div className="text-xs text-slate-400">{fmtDate(m.last_order_date)}</div></> : '\u2014'}
                  </td>
                  <td className={`whitespace-nowrap py-2 pl-3 text-right align-top tabular-nums ${m.low_stock ? 'font-semibold text-rose-700' : m.expected_next_order_date ? 'text-emerald-700' : 'text-slate-400'}`}>{fmtDate(m.expected_next_order_date)}</td>
                  <td className={`whitespace-nowrap py-2 pl-3 text-right align-top tabular-nums ${m.low_stock ? 'font-semibold text-rose-700' : 'text-slate-700'}`}>{m.expected_crates != null ? <>{fmtCrates(m.expected_crates)} <span className="text-xs text-slate-400">cr</span></> : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </TileShell>
  );
};
