import React from 'react';
import { Row, TileShell, StatsBlock, SkuList, fmtCrates, fmtDate } from './tileBits';

export const CustomerTile = ({ tile }) => {
  const hasOrder = tile.last_order_date != null;
  const noStock = tile.child_skus.length === 0;
  const initials = (tile.account_name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const critical = tile.low_stock;
  const tone = critical ? 'text-rose-700' : tile.next_order_urgency === 'green' ? 'text-emerald-700' : 'text-slate-800';
  const shortfall = critical ? tile.expected_crates - tile.stock_crates : 0;
  const hasForecast = !!tile.expected_next_order_date;
  return (
    <TileShell critical={critical} accent="border-slate-200" title={tile.account_name} subtitle={tile.city || tile.account_code} alertTitle="Cannot cover next order"
      testId={`customer-tile-${tile.account_id}`} extra={{ 'data-priority': tile.priority ? 'true' : 'false' }}
      icon={<div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${critical ? 'bg-rose-700 text-white' : 'bg-[#002FA7]/10 text-[#002FA7]'}`}>{initials}</div>}>
      <StatsBlock critical={critical} urgency={tile.next_order_urgency} testId={`next-order-date-${tile.account_id}`} urgencyValue={tile.next_order_urgency} title={tile.forecast_basis}>
        <Row label="Next order" value={hasForecast ? fmtDate(tile.expected_next_order_date) : '\u2014'} tone={hasForecast ? tone : 'text-slate-300'} strong={critical} />
        <Row label="Expected" value={fmtCrates(tile.expected_crates)} sub={tile.expected_crates != null ? 'cr' : ''} tone={tile.expected_crates != null ? tone : 'text-slate-300'} strong={critical} testId={`expected-crates-${tile.account_id}`} />
        <Row label="In hand" value={noStock ? '\u2014' : fmtCrates(tile.stock_crates)} sub={noStock ? '' : 'cr'} tone={noStock ? 'text-slate-300' : critical ? 'text-rose-700' : 'text-slate-900'} strong={critical}
          testId={`stock-total-${tile.account_id}`} extra={critical ? { 'data-shortfall': shortfall } : {}} note={critical ? `\u2212${fmtCrates(shortfall)}` : null} />
        {critical && <span className="sr-only" data-testid={`low-stock-badge-${tile.account_id}`}>short by {fmtCrates(shortfall)} crates</span>}
      </StatsBlock>

      <div className="mt-4 flex-1">
        <SkuList skus={tile.child_skus} critical={critical} prefix="stock-sku" emptyText="No branded SKU" emptyTestId={`stock-none-${tile.account_id}`} />
      </div>

      <div className="mt-4 flex items-center justify-between whitespace-nowrap border-t border-slate-100 pt-3 text-sm text-slate-500">
        <span>Last order</span>
        {hasOrder ? (
          <span className="tabular-nums text-slate-700">
            <span data-testid={`last-order-qty-${tile.account_id}`}>{fmtCrates(tile.last_order_crates)} cr</span>
            <span className="mx-2 text-slate-300">·</span>
            <span data-testid={`last-order-date-${tile.account_id}`}>{fmtDate(tile.last_order_date)}</span>
          </span>
        ) : <span data-testid={`last-order-qty-${tile.account_id}`}>{'\u2014'}</span>}
      </div>
    </TileShell>
  );
};
