import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { fmtINR, compactINR, monthLabel } from './dashUtils';

const GlassTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const credit = payload.find((p) => p.dataKey === 'credit')?.value || 0;
  const debit = payload.find((p) => p.dataKey === 'debit')?.value || 0;
  return (
    <div className="rounded-lg border border-white/40 bg-white/75 backdrop-blur-md px-3 py-2 shadow-lg text-xs">
      <div className="font-semibold mb-1">{monthLabel(label)}</div>
      <div className="flex items-center gap-2 text-emerald-700 tabular-nums">In&nbsp;&nbsp;{fmtINR(credit)}</div>
      <div className="flex items-center gap-2 text-red-700 tabular-nums">Out {fmtINR(debit)}</div>
      <div className="border-t border-slate-200 mt-1 pt-1 font-semibold tabular-nums">Net {fmtINR(credit - debit)}</div>
    </div>
  );
};

export const DashTrendChart = ({ monthly }) => (
  <div className="rounded-xl border border-border bg-card p-5" data-testid="acc-dash-trend-chart">
    <div className="flex items-baseline justify-between mb-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Cash Flow Trend</h2>
        <p className="text-xs text-muted-foreground">Money in vs money out, by month</p>
      </div>
    </div>
    {(!monthly || monthly.length === 0) ? (
      <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">No transactions in this period</div>
    ) : (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} axisLine={false} tickLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis tickFormatter={compactINR} axisLine={false} tickLine={false} width={64}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip content={<GlassTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
          <Legend formatter={(v) => (v === 'credit' ? 'Money In' : 'Money Out')} iconType="circle" iconSize={8}
            wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="credit" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="debit" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    )}
  </div>
);
