import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import {
  Loader2, TrendingUp, TrendingDown, Receipt, Layers,
  BarChart3, GitCompareArrows, IndianRupee,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// ───────────────────────── Neon palette ─────────────────────────
const NEON = { cyan: '#00F0FF', aqua: '#00D2FF', purple: '#B026FF', magenta: '#FF00FF', blue: '#38BDF8' };
const DONUT = ['#00F0FF', '#B026FF', '#FF00FF', '#00D2FF', '#38BDF8', '#A855F7',
  '#22D3EE', '#E879F9', '#0EA5E9', '#7C3AED', '#2DD4BF', '#F472B6'];
const GRID = 'rgba(255,255,255,0.06)';
const AXIS = '#64748B';
const POS = '#34d399';   // neon emerald
const NEG = '#fb7185';   // neon rose

const GLASS = 'bg-[#101427]/60 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_8px_32px_rgba(0,0,0,0.5)]';

const GROUP_BY_OPTIONS = [
  { value: 'city', label: 'City' },
  { value: 'business_category', label: 'Business Category' },
  { value: 'sku', label: 'SKU' },
  { value: 'territory', label: 'Territory' },
  { value: 'state', label: 'State' },
];
const TIME_FILTERS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'all_time', label: 'All Time' },
  { value: 'custom', label: 'Custom Range' },
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const fullINR = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
function formatCurrency(value) {
  const num = Math.round(value || 0);
  const a = Math.abs(num);
  if (a >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  if (a >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
  if (a >= 1000) return '₹' + (num / 1000).toFixed(1) + 'K';
  return '₹' + num.toLocaleString('en-IN');
}
const compactAxis = (v) =>
  '₹' + new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v || 0);

const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

// Shared shadcn overrides for the dark glass surface
const SELECT_TRIGGER = 'border-white/10 bg-white/5 text-white backdrop-blur-md focus:ring-2 focus:ring-[#00F0FF]/40 data-[placeholder]:text-slate-400';
const SELECT_CONTENT = 'border-white/10 bg-[#0c1024]/95 text-slate-100 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.7)]';
const SELECT_ITEM = 'text-slate-200 focus:bg-white/10 focus:text-white';
const INPUT_DARK = 'border-white/10 bg-white/5 text-white placeholder:text-slate-500 backdrop-blur-md focus-visible:ring-2 focus-visible:ring-[#00F0FF]/40';

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0c1024]/85 px-3.5 py-2.5 text-xs shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <p className="mb-1.5 font-medium text-white">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-300">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill, boxShadow: `0 0 8px ${p.color || p.fill}` }} />
          {p.name}
          <span className="ml-auto pl-4 font-mono font-semibold tabular-nums text-white">{fullINR(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

// ───────────────────────── KPI tile ─────────────────────────
function StatCard({ label, value, sub, icon: Icon, gradient = 'cyan', testid }) {
  const grads = {
    cyan: 'from-[#00F0FF]/20 to-[#00D2FF]/[0.04]',
    purple: 'from-[#B026FF]/20 to-[#FF00FF]/[0.04]',
    teal: 'from-[#00F0FF]/18 to-[#38BDF8]/[0.04]',
  };
  const glow = { cyan: NEON.cyan, purple: NEON.purple, teal: NEON.aqua }[gradient];
  return (
    <div
      data-testid={testid}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${grads[gradient]} p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1`}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-30 blur-2xl transition-opacity duration-300 group-hover:opacity-50" style={{ background: glow }} />
      <div className="relative flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">{label}</span>
        {Icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5" style={{ color: glow }}>
            <Icon className="h-[18px] w-[18px]" style={{ filter: `drop-shadow(0 0 8px ${glow})` }} />
          </span>
        )}
      </div>
      <p className="relative mt-4 font-mono text-3xl font-semibold tracking-tighter tabular-nums text-white md:text-[2.15rem]" style={{ textShadow: `0 0 20px ${glow}55` }}>{value}</p>
      {sub && <p className="relative mt-1.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

const Spinner = () => (
  <div className="flex justify-center py-28">
    <Loader2 className="h-7 w-7 animate-spin text-[#00F0FF]" style={{ filter: 'drop-shadow(0 0 8px #00F0FF)' }} />
  </div>
);

const Empty = ({ children, testid }) => (
  <div className={`${GLASS} p-16 text-center`} data-testid={testid}>
    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
      <BarChart3 className="h-6 w-6 text-slate-500" />
    </span>
    <p className="text-sm text-slate-400">{children}</p>
  </div>
);

const FieldLabel = ({ children }) => (
  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">{children}</label>
);

const SectionTitle = ({ children }) => (
  <h3 className="font-heading text-base font-medium tracking-tight text-white">{children}</h3>
);

const ChartDefs = () => (
  <defs>
    <linearGradient id="raBarH" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor={NEON.cyan} />
      <stop offset="100%" stopColor={NEON.purple} />
    </linearGradient>
    <linearGradient id="raCmpA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={NEON.cyan} stopOpacity={1} />
      <stop offset="100%" stopColor={NEON.aqua} stopOpacity={0.25} />
    </linearGradient>
    <linearGradient id="raCmpB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={NEON.purple} stopOpacity={1} />
      <stop offset="100%" stopColor={NEON.magenta} stopOpacity={0.25} />
    </linearGradient>
    <filter id="raNeonGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.4" result="b" />
      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>
);

// ───────────────────────── Breakdown ─────────────────────────
function BreakdownView() {
  const [groupBy, setGroupBy] = useState('city');
  const [timeFilter, setTimeFilter] = useState('this_month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const fetchData = useCallback(async () => {
    if (timeFilter === 'custom' && (!fromDate || !toDate)) return;
    setLoading(true);
    try {
      const params = { time_filter: timeFilter, group_by: groupBy, top_n: 12 };
      if (timeFilter === 'custom') { params.from_date = fromDate; params.to_date = toDate; }
      const res = await axios.get(`${API_URL}/reports/revenue-analytics`, { ...authHeaders(), params });
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load revenue analytics');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [groupBy, timeFilter, fromDate, toDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const groups = data?.groups || [];
  const total = data?.total_revenue || 0;
  const totalGross = data?.total_gross || 0;
  const dimLabel = GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label;
  const chartData = useMemo(
    () => groups.map((g) => ({ name: g.label, revenue: g.revenue, gross: g.gross, count: g.count })),
    [groups]
  );

  return (
    <div className="space-y-6 duration-500 animate-in fade-in-50">
      <div className={`${GLASS} flex flex-wrap items-end gap-3 p-4`}>
        <div className="min-w-[170px] flex-1">
          <FieldLabel>Group by</FieldLabel>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className={SELECT_TRIGGER} data-testid="ra-groupby-select"><SelectValue /></SelectTrigger>
            <SelectContent className={SELECT_CONTENT}>
              {GROUP_BY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className={SELECT_ITEM} data-testid={`ra-groupby-select-${o.value}`}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[170px] flex-1">
          <FieldLabel>Time period</FieldLabel>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className={SELECT_TRIGGER} data-testid="ra-timefilter-select"><SelectValue /></SelectTrigger>
            <SelectContent className={SELECT_CONTENT}>
              {TIME_FILTERS.map((o) => <SelectItem key={o.value} value={o.value} className={SELECT_ITEM}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {timeFilter === 'custom' && (
          <>
            <div className="min-w-[150px] flex-1">
              <FieldLabel>From</FieldLabel>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={INPUT_DARK} data-testid="ra-from-date" />
            </div>
            <div className="min-w-[150px] flex-1">
              <FieldLabel>To</FieldLabel>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={INPUT_DARK} data-testid="ra-to-date" />
            </div>
          </>
        )}
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 gap-4 duration-500 animate-in fade-in-50 slide-in-from-bottom-2 sm:grid-cols-3 md:gap-6">
            <StatCard label="Gross Revenue" value={formatCurrency(totalGross)} sub={`Net ${formatCurrency(total)}`} icon={IndianRupee} gradient="cyan" testid="ra-total-revenue" />
            <StatCard label="Invoices" value={(data?.total_invoice_count || 0).toLocaleString('en-IN')} sub="Billed in period" icon={Receipt} gradient="purple" testid="ra-total-invoices" />
            <StatCard label="Segments" value={(data?.raw_group_count || 0).toLocaleString('en-IN')} sub={`By ${dimLabel}`} icon={Layers} gradient="teal" testid="ra-total-groups" />
          </div>

          {groups.length === 0 ? (
            <Empty testid="ra-empty">No revenue recorded for the selected period.</Empty>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className={`${GLASS} p-6 xl:col-span-7`} data-testid="ra-bar-chart">
                  <div className="mb-5 flex items-baseline justify-between">
                    <SectionTitle>Revenue by {dimLabel}</SectionTitle>
                    <span className="text-xs text-slate-500">Gross</span>
                  </div>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 70 }} barCategoryGap="30%">
                      <ChartDefs />
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={compactAxis} axisLine={false} tickLine={false} tick={{ fill: AXIS, fontSize: 12 }} dy={6} />
                      <YAxis type="category" dataKey="name" width={140} axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 12 }} interval={0} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="gross" name="Gross Revenue" fill="url(#raBarH)" filter="url(#raNeonGlow)" radius={[0, 5, 5, 0]} maxBarSize={28}>
                        <LabelList dataKey="gross" position="right" formatter={formatCurrency}
                          style={{ fill: '#cbd5e1', fontSize: 11, fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className={`${GLASS} p-6 xl:col-span-5`} data-testid="ra-pie-chart">
                  <SectionTitle>Revenue Share</SectionTitle>
                  <div className="relative mt-2">
                    <ResponsiveContainer width="100%" height={380}>
                      <PieChart>
                        <Pie data={chartData} dataKey="gross" nameKey="name" cx="50%" cy="50%" innerRadius={78} outerRadius={116} paddingAngle={2} cornerRadius={4} stroke="none">
                          {chartData.map((e, i) => <Cell key={i} fill={DONUT[i % DONUT.length]} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[11px] uppercase tracking-[0.1em] text-slate-400">Gross Total</span>
                      <span className="mt-1 font-mono text-2xl font-semibold tracking-tighter text-white" style={{ textShadow: '0 0 18px rgba(0,240,255,0.45)' }}>{formatCurrency(totalGross)}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
                    {chartData.slice(0, 6).map((e, i) => (
                      <span key={e.name} className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="h-2 w-2 rounded-full" style={{ background: DONUT[i % DONUT.length], boxShadow: `0 0 7px ${DONUT[i % DONUT.length]}` }} />
                        <span className="max-w-[120px] truncate">{e.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className={`${GLASS} overflow-hidden p-0`} data-testid="ra-table">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-slate-400">
                        <th className="px-5 py-3.5 text-left font-semibold">#</th>
                        <th className="px-5 py-3.5 text-left font-semibold">{dimLabel}</th>
                        <th className="px-5 py-3.5 text-right font-semibold">Gross Revenue</th>
                        <th className="px-5 py-3.5 text-right font-semibold">Net</th>
                        <th className="px-5 py-3.5 text-right font-semibold">Invoices</th>
                        <th className="px-5 py-3.5 text-left font-semibold">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g, i) => {
                        const share = totalGross ? (g.gross / totalGross) * 100 : 0;
                        return (
                          <tr key={g.label} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.04]">
                            <td className="px-5 py-4 font-mono tabular-nums text-slate-500">{i + 1}</td>
                            <td className="px-5 py-4 font-medium text-slate-100">
                              <span className="mr-2.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: DONUT[i % DONUT.length], boxShadow: `0 0 7px ${DONUT[i % DONUT.length]}` }} />
                              {g.label}
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-semibold tabular-nums text-white">{formatCurrency(g.gross)}</td>
                            <td className="px-5 py-4 text-right font-mono tabular-nums text-slate-400">{formatCurrency(g.revenue)}</td>
                            <td className="px-5 py-4 text-right font-mono tabular-nums text-slate-400">{g.count}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2.5">
                                <div className="h-1.5 w-full max-w-[90px] overflow-hidden rounded-full bg-white/10">
                                  <div className="h-full rounded-full bg-gradient-to-r from-[#00F0FF] to-[#B026FF] shadow-[0_0_8px_rgba(0,240,255,0.5)]" style={{ width: `${Math.max(share, 2)}%` }} />
                                </div>
                                <span className="w-10 text-right font-mono text-xs tabular-nums text-slate-400">{share.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ───────────────────────── Compare ─────────────────────────
function CompareView() {
  const now = new Date();
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) years.push(y);

  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const [aYear, setAYear] = useState(prevMonthYear);
  const [aMonth, setAMonth] = useState(prevMonth);
  const [bYear, setBYear] = useState(now.getFullYear());
  const [bMonth, setBMonth] = useState(now.getMonth() + 1);
  const [groupBy, setGroupBy] = useState('city');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        period_a_year: aYear, period_a_month: aMonth,
        period_b_year: bYear, period_b_month: bMonth, group_by: groupBy, top_n: 12,
      };
      const res = await axios.get(`${API_URL}/reports/revenue-compare`, { ...authHeaders(), params });
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load comparison');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [aYear, aMonth, bYear, bMonth, groupBy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rows = data?.rows || [];
  const aLabel = `${MONTHS[aMonth - 1]?.slice(0, 3)} ${aYear}`;
  const bLabel = `${MONTHS[bMonth - 1]?.slice(0, 3)} ${bYear}`;
  const chartData = useMemo(() => rows.map((r) => ({ name: r.label, A: r.a_revenue, B: r.b_revenue })), [rows]);
  const delta = data?.delta || 0;
  const up = delta >= 0;
  const dimLabel = GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label;

  const monthSel = (label, value, onChange, testid) => (
    <div className="min-w-[130px] flex-1">
      <FieldLabel>{label}</FieldLabel>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className={SELECT_TRIGGER} data-testid={testid}><SelectValue /></SelectTrigger>
        <SelectContent className={SELECT_CONTENT}>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)} className={SELECT_ITEM}>{m}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  const yearSel = (label, value, onChange, testid) => (
    <div className="min-w-[100px] flex-1">
      <FieldLabel>{label}</FieldLabel>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className={SELECT_TRIGGER} data-testid={testid}><SelectValue /></SelectTrigger>
        <SelectContent className={SELECT_CONTENT}>{years.map((y) => <SelectItem key={y} value={String(y)} className={SELECT_ITEM}>{y}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6 duration-500 animate-in fade-in-50">
      <div className={`${GLASS} flex flex-wrap items-end gap-3 p-4`}>
        {monthSel('Period A — Month', aMonth, setAMonth, 'ra-cmp-a-month')}
        {yearSel('Year', aYear, setAYear, 'ra-cmp-a-year')}
        {monthSel('Period B — Month', bMonth, setBMonth, 'ra-cmp-b-month')}
        {yearSel('Year', bYear, setBYear, 'ra-cmp-b-year')}
        <div className="min-w-[150px] flex-1">
          <FieldLabel>Group by</FieldLabel>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className={SELECT_TRIGGER} data-testid="ra-cmp-groupby"><SelectValue /></SelectTrigger>
            <SelectContent className={SELECT_CONTENT}>{GROUP_BY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className={SELECT_ITEM}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 gap-4 duration-500 animate-in fade-in-50 slide-in-from-bottom-2 sm:grid-cols-3 md:gap-6">
            <StatCard label={`${aLabel} · Baseline`} value={formatCurrency(data?.period_a?.total)} sub="Baseline period" icon={IndianRupee} gradient="teal" testid="ra-cmp-a-total" />
            <StatCard label={`${bLabel} · Current`} value={formatCurrency(data?.period_b?.total)} sub="Comparison period" icon={IndianRupee} gradient="purple" testid="ra-cmp-b-total" />
            <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#101427]/70 p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1" data-testid="ra-cmp-delta">
              <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-30 blur-2xl" style={{ background: up ? POS : NEG }} />
              <div className="relative flex items-start justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">Change (MoM)</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5" style={{ color: up ? POS : NEG }}>
                  {up ? <TrendingUp className="h-[18px] w-[18px]" style={{ filter: `drop-shadow(0 0 8px ${POS})` }} /> : <TrendingDown className="h-[18px] w-[18px]" style={{ filter: `drop-shadow(0 0 8px ${NEG})` }} />}
                </span>
              </div>
              <p className="relative mt-4 font-mono text-3xl font-semibold tracking-tighter tabular-nums md:text-[2.15rem]" style={{ color: up ? POS : NEG, textShadow: `0 0 20px ${up ? POS : NEG}66` }}>
                {up ? '+' : ''}{formatCurrency(delta)}
              </p>
              <span className="relative mt-2 inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium" style={{ color: up ? POS : NEG, borderColor: `${up ? POS : NEG}55`, background: `${up ? POS : NEG}1a` }}>
                {up ? '+' : ''}{data?.delta_pct ?? 0}% vs {aLabel}
              </span>
            </div>
          </div>

          {rows.length === 0 ? (
            <Empty testid="ra-cmp-empty">No revenue found for either period.</Empty>
          ) : (
            <>
              <div className={`${GLASS} p-6`} data-testid="ra-cmp-chart">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <SectionTitle>{aLabel} vs {bLabel} — by {dimLabel}</SectionTitle>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: NEON.cyan, boxShadow: `0 0 7px ${NEON.cyan}` }} />{aLabel}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: NEON.purple, boxShadow: `0 0 7px ${NEON.purple}` }} />{bLabel}</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData} margin={{ left: 8, right: 8, bottom: 50 }} barGap={6} barCategoryGap="26%">
                    <ChartDefs />
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} angle={-22} textAnchor="end" interval={0} height={60} tick={{ fill: '#94A3B8', fontSize: 11 }} dy={6} />
                    <YAxis tickFormatter={compactAxis} axisLine={false} tickLine={false} tick={{ fill: AXIS, fontSize: 11 }} dx={-6} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="A" name={aLabel} fill="url(#raCmpA)" filter="url(#raNeonGlow)" radius={[5, 5, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="B" name={bLabel} fill="url(#raCmpB)" filter="url(#raNeonGlow)" radius={[5, 5, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className={`${GLASS} overflow-hidden p-0`} data-testid="ra-cmp-table">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.03] text-[11px] uppercase tracking-wider text-slate-400">
                        <th className="px-5 py-3.5 text-left font-semibold">{dimLabel}</th>
                        <th className="px-5 py-3.5 text-right font-semibold">{aLabel}</th>
                        <th className="px-5 py-3.5 text-right font-semibold">{bLabel}</th>
                        <th className="px-5 py-3.5 text-right font-semibold">Change</th>
                        <th className="px-5 py-3.5 text-right font-semibold">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const rUp = r.delta >= 0;
                        return (
                          <tr key={r.label} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.04]">
                            <td className="px-5 py-4 font-medium text-slate-100">{r.label}</td>
                            <td className="px-5 py-4 text-right font-mono tabular-nums text-slate-400">{formatCurrency(r.a_revenue)}</td>
                            <td className="px-5 py-4 text-right font-mono font-semibold tabular-nums text-white">{formatCurrency(r.b_revenue)}</td>
                            <td className="px-5 py-4 text-right font-mono font-medium tabular-nums" style={{ color: rUp ? POS : NEG }}>{rUp ? '+' : ''}{formatCurrency(r.delta)}</td>
                            <td className="px-5 py-4 text-right font-mono tabular-nums" style={{ color: rUp ? POS : NEG }}>{rUp ? '+' : ''}{r.delta_pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ───────────────────────── page ─────────────────────────
export default function RevenueAnalytics() {
  return (
    <div className="relative min-h-[calc(100vh-6rem)] overflow-hidden rounded-3xl bg-[#080B1F] p-5 text-white [color-scheme:dark] sm:p-7 md:p-9" data-testid="revenue-analytics-page">
      {/* Blurred neon backdrop orbs */}
      <div aria-hidden className="pointer-events-none absolute -left-[10%] -top-[12%] h-[42vw] w-[42vw] rounded-full bg-[#B026FF] opacity-20 blur-[130px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-[12%] -right-[10%] h-[42vw] w-[42vw] rounded-full bg-[#00F0FF] opacity-[0.14] blur-[130px]" />
      <div aria-hidden className="pointer-events-none absolute left-[38%] top-[28%] h-[24vw] w-[24vw] rounded-full bg-[#FF00FF] opacity-10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1400px]">
        <div className="mb-8 flex flex-col gap-4 duration-500 animate-in fade-in-50 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#00F0FF] to-[#B026FF] shadow-[0_0_20px_rgba(0,240,255,0.5)]">
              <BarChart3 className="h-6 w-6 text-[#080B1F]" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-white md:text-3xl">Revenue Analytics</h1>
              <p className="mt-0.5 text-sm text-slate-400">Invoice revenue by city, category, SKU, territory &amp; state — with month-over-month comparison.</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="breakdown">
          <TabsList className="mb-6 inline-flex h-auto gap-1 rounded-xl border border-white/10 bg-[#101427]/70 p-1 backdrop-blur-md">
            <TabsTrigger
              value="breakdown"
              data-testid="ra-tab-breakdown"
              className="rounded-lg px-4 py-2 font-medium text-slate-400 transition-all duration-200 hover:text-white data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-[0_0_14px_rgba(0,240,255,0.18)]"
            >
              <BarChart3 className="mr-2 h-4 w-4" /> Breakdown
            </TabsTrigger>
            <TabsTrigger
              value="compare"
              data-testid="ra-tab-compare"
              className="rounded-lg px-4 py-2 font-medium text-slate-400 transition-all duration-200 hover:text-white data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-[0_0_14px_rgba(176,38,255,0.2)]"
            >
              <GitCompareArrows className="mr-2 h-4 w-4" /> Compare Months
            </TabsTrigger>
          </TabsList>
          <TabsContent value="breakdown"><BreakdownView /></TabsContent>
          <TabsContent value="compare"><CompareView /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
