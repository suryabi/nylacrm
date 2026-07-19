import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Wallet, AlertCircle, ReceiptText, TrendingUp, TrendingDown } from 'lucide-react';
import { fmtINR, compactINR, pctDelta } from './dashUtils';

const Delta = ({ value, invert }) => {
  if (value === null || value === undefined || !isFinite(value)) return null;
  const good = invert ? value < 0 : value >= 0;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums ${good ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon className="h-3.5 w-3.5" />
      {value >= 0 ? '+' : ''}{value.toFixed(1)}% vs prev
    </span>
  );
};

const Card = ({ i, testId, label, icon: Icon, iconClass, value, sub, delta, invertDelta, alert, onClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.06, duration: 0.35 }}
    data-testid={testId}
    onClick={onClick}
    className={`relative rounded-xl border bg-card p-4 flex flex-col gap-2 ${alert ? 'alert-ring' : 'border-border'} ${onClick ? 'cursor-pointer hover:bg-muted/40 transition-colors' : ''}`}
  >
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className={`h-7 w-7 rounded-lg flex items-center justify-center ${iconClass}`}>
        <Icon className="h-4 w-4" />
      </span>
    </div>
    <div className="text-2xl font-semibold tracking-tight tabular-nums" title={fmtINR(value)}>{compactINR(value)}</div>
    <div className="flex items-center justify-between min-h-[16px]">
      <span className="text-xs text-muted-foreground tabular-nums">{sub}</span>
      {delta !== undefined && <Delta value={delta} invert={invertDelta} />}
    </div>
  </motion.div>
);

export const DashKpis = ({ kpis, onUntaggedClick, onBillsClick }) => {
  if (!kpis) return null;
  const prev = kpis.prev;
  const inDelta = prev ? pctDelta(kpis.money_in.total, prev.credit.total) : null;
  const outDelta = prev ? pctDelta(kpis.money_out.total, prev.debit.total) : null;
  const prevNet = prev ? prev.credit.total - prev.debit.total : null;
  const netDelta = prev ? pctDelta(kpis.net, prevNet) : null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" data-testid="acc-dash-kpis">
      <Card i={0} testId="kpi-money-in" label="Money In" icon={ArrowUpRight} iconClass="bg-emerald-100 text-emerald-700"
        value={kpis.money_in.total} sub={`${kpis.money_in.count} transactions`} delta={inDelta} />
      <Card i={1} testId="kpi-money-out" label="Money Out" icon={ArrowDownRight} iconClass="bg-red-100 text-red-700"
        value={kpis.money_out.total} sub={`${kpis.money_out.count} transactions`} delta={outDelta} invertDelta />
      <Card i={2} testId="kpi-net-flow" label="Net Cash Flow" icon={Wallet} iconClass="bg-slate-800 text-white"
        value={kpis.net} sub={kpis.net >= 0 ? 'Surplus' : 'Deficit'} delta={netDelta} />
      <Card i={3} testId="kpi-bills-pending" label="Bills Pending" icon={ReceiptText} iconClass="bg-amber-100 text-amber-700"
        value={kpis.bills_pending.total} sub={`${kpis.bills_pending.count} awaiting bills`} onClick={onBillsClick} />
      <Card i={4} testId="kpi-untagged" label="Untagged" icon={AlertCircle} iconClass="bg-orange-100 text-orange-700"
        value={kpis.untagged.total} sub={`${kpis.untagged.count} need tagging`} alert={kpis.untagged.count > 0} onClick={onUntaggedClick} />
    </div>
  );
};
