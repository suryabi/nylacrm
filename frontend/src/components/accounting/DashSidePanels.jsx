import React from 'react';
import { Landmark, Truck, UserRound } from 'lucide-react';
import { fmtINR, compactINR } from './dashUtils';

const RankList = ({ title, subtitle, icon: Icon, items, testId, barClass }) => {
  const max = Math.max(...(items || []).map((i) => i.total), 1);
  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid={testId}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold leading-none">{title}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      {(!items || items.length === 0) ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No data in this period</p>
      ) : (
        <div className="space-y-3">
          {items.slice(0, 6).map((it, idx) => (
            <div key={it.id || it.name || idx} className="group">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{it.name}</span>
                <span className="font-semibold tabular-nums shrink-0" title={fmtINR(it.total)}>{compactINR(it.total)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${barClass}`} style={{ width: `${(it.total / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const DashSidePanels = ({ topVendors, topPayees, bankAccounts }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div className="rounded-xl border border-border bg-card p-5" data-testid="acc-dash-banks">
      <div className="flex items-center gap-2 mb-4">
        <Landmark className="h-4 w-4 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold leading-none">Bank Accounts</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">In / out / net per account</p>
        </div>
      </div>
      {(!bankAccounts || bankAccounts.length === 0) ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No data in this period</p>
      ) : (
        <div className="space-y-3">
          {bankAccounts.map((b) => (
            <div key={b.id || b.name} className="rounded-lg border border-border/70 p-3">
              <div className="text-sm font-medium truncate">{b.name}</div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs tabular-nums">
                <div><span className="text-muted-foreground block">In</span><span className="text-emerald-700 font-semibold">{compactINR(b.credit)}</span></div>
                <div><span className="text-muted-foreground block">Out</span><span className="text-red-700 font-semibold">{compactINR(b.debit)}</span></div>
                <div><span className="text-muted-foreground block">Net</span><span className={`font-semibold ${b.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{compactINR(b.net)}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    <RankList title="Top Vendors" subtitle="Highest spend, tagged vendors" icon={Truck}
      items={topVendors} testId="acc-dash-top-vendors" barClass="bg-red-500/80" />
    <RankList title="Top Payees" subtitle="Highest money-out recipients" icon={UserRound}
      items={topPayees} testId="acc-dash-top-payees" barClass="bg-orange-500/80" />
  </div>
);
