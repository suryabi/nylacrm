import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { useTenantConfig } from '../context/TenantConfigContext';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import {
  Loader2, TrendingUp, TrendingDown, Receipt, Layers,
  BarChart3, GitCompareArrows, IndianRupee, ArrowUpRight,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Brand-driven palette. `--primary` is set from the tenant's branding.primary_color,
// so using it (and a ramp derived from it) keeps the dashboard matched to the brand theme.
const PRIMARY = 'hsl(var(--primary))';
const GRID = 'hsl(var(--border))';
const AXIS = 'hsl(var(--muted-foreground))';
const COMPARE_A = '#94a3b8';     // neutral slate (baseline period)
const POS = '#059669';           // emerald-600
const NEG = '#e11d48';           // rose-600

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hexToHSL(hex) {
  let h = (hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return { h: 174, s: 84, l: 30 };
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, sat = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      default: hue = (r - g) / d + 4;
    }
    hue *= 60;
  }
  return { h: Math.round(hue), s: Math.round(sat * 100), l: Math.round(l * 100) };
}
// Cohesive monochromatic-to-analogous ramp from the brand color for multi-segment charts.
function brandRamp(hex, n) {
  const base = hexToHSL(hex);
  const startL = base.l < 34 ? base.l + 6 : base.l - 6;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0 : i / (n - 1);
    const hh = Math.round((base.h + t * 16) % 360);
    const ss = Math.round(clamp(base.s - t * 8, 38, 95));
    const ll = Math.round(clamp(startL + t * 32, 26, 76));
    out.push(`hsl(${hh} ${ss}% ${ll}%)`);
  }
  return out;
}

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

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-heading font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}
          <span className="ml-auto pl-4 font-semibold tabular-nums text-foreground">{fullINR(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

// ───────────────────────── KPI tile ─────────────────────────
function StatCard({ label, value, sub, icon: Icon, accent = false, testid }) {
  return (
    <Card
      data-testid={testid}
      className={`group relative flex flex-col justify-between rounded-xl border-border/60 bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${accent ? 'border-t-2 border-t-primary' : ''}`}
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        {Icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <p className="mt-4 font-heading text-3xl font-semibold tracking-tighter tabular-nums text-foreground md:text-[2.1rem]">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

const Spinner = () => (
  <div className="flex justify-center py-28"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
);

const Empty = ({ children, testid }) => (
  <Card className="rounded-xl border-dashed border-border/60 bg-card p-16 text-center" data-testid={testid}>
    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
      <BarChart3 className="h-6 w-6 text-muted-foreground/50" />
    </span>
    <p className="text-sm text-muted-foreground">{children}</p>
  </Card>
);

const FieldLabel = ({ children }) => (
  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{children}</label>
);

const SectionTitle = ({ children }) => (
  <h3 className="font-heading text-base font-medium tracking-tight text-foreground">{children}</h3>
);

// ───────────────────────── Breakdown ─────────────────────────
function BreakdownView() {
  const { branding } = useTenantConfig();
  const series = useMemo(() => brandRamp(branding?.primary_color || '#0d9488', 12), [branding]);
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
        <div className="min-w-[170px] flex-1">
          <FieldLabel>Group by</FieldLabel>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger data-testid="ra-groupby-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GROUP_BY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} data-testid={`ra-groupby-select-${o.value}`}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[170px] flex-1">
          <FieldLabel>Time period</FieldLabel>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger data-testid="ra-timefilter-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIME_FILTERS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {timeFilter === 'custom' && (
          <>
            <div className="min-w-[150px] flex-1">
              <FieldLabel>From</FieldLabel>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} data-testid="ra-from-date" />
            </div>
            <div className="min-w-[150px] flex-1">
              <FieldLabel>To</FieldLabel>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} data-testid="ra-to-date" />
            </div>
          </>
        )}
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
            <StatCard label="Gross Revenue" value={formatCurrency(totalGross)} sub={`Net ${formatCurrency(total)}`} icon={IndianRupee} accent testid="ra-total-revenue" />
            <StatCard label="Invoices" value={(data?.total_invoice_count || 0).toLocaleString('en-IN')} sub="Billed in period" icon={Receipt} testid="ra-total-invoices" />
            <StatCard label="Segments" value={(data?.raw_group_count || 0).toLocaleString('en-IN')} sub={`By ${dimLabel}`} icon={Layers} testid="ra-total-groups" />
          </div>

          {groups.length === 0 ? (
            <Empty testid="ra-empty">No revenue recorded for the selected period.</Empty>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <Card className="rounded-xl border-border/60 p-6 xl:col-span-7" data-testid="ra-bar-chart">
                  <div className="mb-5 flex items-baseline justify-between">
                    <SectionTitle>Revenue by {dimLabel}</SectionTitle>
                    <span className="text-xs text-muted-foreground">Gross</span>
                  </div>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 64 }} barCategoryGap="30%">
                      <defs>
                        <linearGradient id="raBarH" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.78} />
                          <stop offset="100%" stopColor={PRIMARY} stopOpacity={1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={GRID} strokeOpacity={0.5} strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={compactAxis} axisLine={false} tickLine={false} tick={{ fill: AXIS, fontSize: 12 }} dy={6} />
                      <YAxis type="category" dataKey="name" width={140} axisLine={false} tickLine={false} tick={{ fill: AXIS, fontSize: 12 }} interval={0} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.45 }} />
                      <Bar dataKey="gross" name="Gross Revenue" fill="url(#raBarH)" radius={[0, 4, 4, 0]} maxBarSize={30}>
                        <LabelList dataKey="gross" position="right" formatter={formatCurrency}
                          style={{ fill: AXIS, fontSize: 11, fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card className="rounded-xl border-border/60 p-6 xl:col-span-5" data-testid="ra-pie-chart">
                  <SectionTitle>Revenue Share</SectionTitle>
                  <div className="relative mt-2">
                    <ResponsiveContainer width="100%" height={380}>
                      <PieChart>
                        <Pie data={chartData} dataKey="gross" nameKey="name" cx="50%" cy="50%" innerRadius={78} outerRadius={116} paddingAngle={2} cornerRadius={4} stroke="none">
                          {chartData.map((e, i) => <Cell key={i} fill={series[i % series.length]} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Gross Total</span>
                      <span className="mt-1 font-heading text-2xl font-semibold tracking-tighter text-foreground">{formatCurrency(totalGross)}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
                    {chartData.slice(0, 6).map((e, i) => (
                      <span key={e.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ background: series[i % series.length] }} />
                        <span className="max-w-[120px] truncate">{e.name}</span>
                      </span>
                    ))}
                  </div>
                </Card>
              </div>

              <Card className="overflow-hidden rounded-xl border-border/60 p-0" data-testid="ra-table">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
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
                          <tr key={g.label} className="border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30">
                            <td className="px-5 py-4 tabular-nums text-muted-foreground">{i + 1}</td>
                            <td className="px-5 py-4 font-medium text-foreground">
                              <span className="mr-2.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: series[i % series.length] }} />
                              {g.label}
                            </td>
                            <td className="px-5 py-4 text-right font-semibold tabular-nums text-foreground">{formatCurrency(g.gross)}</td>
                            <td className="px-5 py-4 text-right tabular-nums text-muted-foreground">{formatCurrency(g.revenue)}</td>
                            <td className="px-5 py-4 text-right tabular-nums text-muted-foreground">{g.count}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2.5">
                                <div className="h-1.5 w-full max-w-[90px] overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(share, 2)}%` }} />
                                </div>
                                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{share.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
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
        <SelectTrigger data-testid={testid}><SelectValue /></SelectTrigger>
        <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  const yearSel = (label, value, onChange, testid) => (
    <div className="min-w-[100px] flex-1">
      <FieldLabel>{label}</FieldLabel>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger data-testid={testid}><SelectValue /></SelectTrigger>
        <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
        {monthSel('Period A — Month', aMonth, setAMonth, 'ra-cmp-a-month')}
        {yearSel('Year', aYear, setAYear, 'ra-cmp-a-year')}
        {monthSel('Period B — Month', bMonth, setBMonth, 'ra-cmp-b-month')}
        {yearSel('Year', bYear, setBYear, 'ra-cmp-b-year')}
        <div className="min-w-[150px] flex-1">
          <FieldLabel>Group by</FieldLabel>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger data-testid="ra-cmp-groupby"><SelectValue /></SelectTrigger>
            <SelectContent>{GROUP_BY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
            <StatCard label={`${aLabel} · Baseline`} value={formatCurrency(data?.period_a?.total)} sub="Baseline period" icon={IndianRupee} testid="ra-cmp-a-total" />
            <StatCard label={`${bLabel} · Current`} value={formatCurrency(data?.period_b?.total)} sub="Comparison period" icon={IndianRupee} accent testid="ra-cmp-b-total" />
            <Card className="group flex flex-col justify-between rounded-xl border-border/60 bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" data-testid="ra-cmp-delta">
              <div className="flex items-start justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Change (MoM)</span>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${up ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                  {up ? <TrendingUp className="h-[18px] w-[18px]" /> : <TrendingDown className="h-[18px] w-[18px]" />}
                </span>
              </div>
              <p className="mt-4 font-heading text-3xl font-semibold tracking-tighter tabular-nums md:text-[2.1rem]" style={{ color: up ? POS : NEG }}>
                {up ? '+' : ''}{formatCurrency(delta)}
              </p>
              <Badge variant="outline" className={`mt-2 w-fit gap-1 ${up ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>
                <ArrowUpRight className={`h-3 w-3 ${up ? '' : 'rotate-90'}`} />
                {up ? '+' : ''}{data?.delta_pct ?? 0}% vs {aLabel}
              </Badge>
            </Card>
          </div>

          {rows.length === 0 ? (
            <Empty testid="ra-cmp-empty">No revenue found for either period.</Empty>
          ) : (
            <>
              <Card className="rounded-xl border-border/60 p-6" data-testid="ra-cmp-chart">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <SectionTitle>{aLabel} vs {bLabel} — by {dimLabel}</SectionTitle>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COMPARE_A }} />{aLabel}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIMARY }} />{bLabel}</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData} margin={{ left: 8, right: 8, bottom: 50 }} barGap={6} barCategoryGap="26%">
                    <CartesianGrid stroke={GRID} strokeOpacity={0.5} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} angle={-22} textAnchor="end" interval={0} height={60} tick={{ fill: AXIS, fontSize: 11 }} dy={6} />
                    <YAxis tickFormatter={compactAxis} axisLine={false} tickLine={false} tick={{ fill: AXIS, fontSize: 11 }} dx={-6} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.45 }} />
                    <Bar dataKey="A" name={aLabel} fill={COMPARE_A} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="B" name={bLabel} fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="overflow-hidden rounded-xl border-border/60 p-0" data-testid="ra-cmp-table">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground">
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
                          <tr key={r.label} className="border-b border-border/40 transition-colors last:border-0 hover:bg-muted/30">
                            <td className="px-5 py-4 font-medium text-foreground">{r.label}</td>
                            <td className="px-5 py-4 text-right tabular-nums text-muted-foreground">{formatCurrency(r.a_revenue)}</td>
                            <td className="px-5 py-4 text-right font-semibold tabular-nums text-foreground">{formatCurrency(r.b_revenue)}</td>
                            <td className="px-5 py-4 text-right font-medium tabular-nums" style={{ color: rUp ? POS : NEG }}>{rUp ? '+' : ''}{formatCurrency(r.delta)}</td>
                            <td className="px-5 py-4 text-right tabular-nums" style={{ color: rUp ? POS : NEG }}>{rUp ? '+' : ''}{r.delta_pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
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
    <div className="mx-auto max-w-[1400px] p-1 sm:p-2" data-testid="revenue-analytics-page">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <BarChart3 className="h-[22px] w-[22px]" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Revenue Analytics</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Invoice revenue by city, category, SKU, territory &amp; state — with month-over-month comparison.</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="breakdown">
        <TabsList className="mb-6 h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="breakdown"
            data-testid="ra-tab-breakdown"
            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-muted-foreground transition-colors data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <BarChart3 className="mr-2 h-4 w-4" /> Breakdown
          </TabsTrigger>
          <TabsTrigger
            value="compare"
            data-testid="ra-tab-compare"
            className="rounded-none border-b-2 border-transparent px-1 py-3 font-medium text-muted-foreground transition-colors data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <GitCompareArrows className="mr-2 h-4 w-4" /> Compare Months
          </TabsTrigger>
        </TabsList>
        <TabsContent value="breakdown"><BreakdownView /></TabsContent>
        <TabsContent value="compare"><CompareView /></TabsContent>
      </Tabs>
    </div>
  );
}
