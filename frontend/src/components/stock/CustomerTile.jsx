import React from 'react';
import { TileShell, KpiDeck, Kpi, SkuTable, Footer, fmtCrates, fmtDate, fmtDateFull, stateOf, kpiTone } from './tileBits';

export const CustomerTile = ({ tile }) => {
  const hasOrder = tile.last_order_date != null;
  const noStock = tile.child_skus.length === 0;
  const initials = (tile.account_name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const critical = tile.low_stock;
  const state = stateOf(critical, tile.next_order_urgency);
  const shortfall = critical ? tile.expected_crates - tile.stock_crates : 0;
  const hasForecast = !!tile.expected_next_order_date;
  return (
    <TileShell state={state} title={tile.account_name} subtitle={tile.city || tile.account_code} alertLabel="Short"
      testId={`customer-tile-${tile.account_id}`} extra={{ 'data-priority': tile.priority ? 'true' : 'false' }}
      avatar={<div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-medium tracking-wide ${critical ? 'bg-rose-700 text-white' : 'bg-[#002FA7]/10 text-[#002FA7]'}`}>{initials}</div>}>
      <KpiDeck state={state} testId={`next-order-date-${tile.account_id}`} urgencyValue={tile.next_order_urgency} title={tile.forecast_basis}>
        <Kpi label="Next order" value={hasForecast ? fmtDate(tile.expected_next_order_date) : '\u2014'} tone={kpiTone(state, hasForecast)} sub={tile.sample_orders ? `${tile.sample_orders} order${tile.sample_orders === 1 ? '' : 's'} sampled` : 'no orders yet'} />
        <Kpi label="Expected (crates)" value={fmtCrates(tile.expected_crates)} tone={kpiTone(state, tile.expected_crates != null)} testId={`expected-crates-${tile.account_id}`} />
        <Kpi label="In hand (crates)" value={noStock ? '0' : fmtCrates(tile.stock_crates)} tone={noStock ? 'text-slate-400' : critical ? 'text-rose-700' : 'text-slate-900'}
          testId={`stock-total-${tile.account_id}`} extra={critical ? { 'data-shortfall': shortfall } : {}} pill={critical ? `\u2212${fmtCrates(shortfall)}` : null} />
        {critical && <span className="sr-only" data-testid={`low-stock-badge-${tile.account_id}`}>short by {fmtCrates(shortfall)} crates</span>}
      </KpiDeck>

      <div className="flex-1">
        <SkuTable skus={tile.child_skus} state={state} prefix="stock-sku" emptyText="No SKU ordered yet" emptyTestId={`stock-none-${tile.account_id}`} />
      </div>

      <Footer rows={[{ label: 'Order frequency', value: <span title={tile.frequency_basis || ''} data-testid={`order-frequency-${tile.account_id}`}>{tile.order_frequency_days != null ? `every ${tile.order_frequency_days} days` : '\u2014'}</span> },
        { label: 'Last order', value: hasOrder ? (
        <><span data-testid={`last-order-qty-${tile.account_id}`}>{fmtCrates(tile.last_order_crates)}</span><span className="mx-1.5 font-normal text-slate-300">/</span><span data-testid={`last-order-date-${tile.account_id}`}>{fmtDateFull(tile.last_order_date)}</span></>
      ) : <span data-testid={`last-order-qty-${tile.account_id}`}>{'\u2014'}</span> }]} />
    </TileShell>
  );
};
