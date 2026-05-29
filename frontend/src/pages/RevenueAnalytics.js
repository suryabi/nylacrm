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
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import {
  Loader2, TrendingUp, TrendingDown, Receipt, Layers,
  BarChart3, GitCompareArrows, IndianRupee,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Palette aligned with the app's emerald/teal theme.
const ACCENT = '#0d9488';        // teal-600 (primary bars)
const SERIES = ['#0d9488', '#10b981', '#0891b2', '#14b8a6', '#22c55e', '#0ea5e9', '#6366f1', '#64748b'];
const POS = '#059669';           // emerald-600
const NEG = '#e11d48';           // rose-600

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

const GRID = 'hsl(var(--border))';
const AXIS = 'hsl(var(--muted-foreground))';

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}
          <span className="ml-auto pl-3 font-semibold tabular-nums text-foreground">{fullINR(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

function StatCard({ label, value, sub, icon: Icon, tone = 'teal', testid }) {
  const tones = {
    teal: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  };
  return (
    <Card className="p-5" data-testid={testid}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-foreground font-heading">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

const Spinner = () => (
  <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div>
);

const Empty = ({ children, testid }) => (
  <Card className="p-14 text-center" data-testid={testid}>
    <BarChart3 className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" />
    <p className="text-sm text-muted-foreground">{children}</p>
  </Card>
);

const FieldLabel = ({ children }) => (
  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{children}</label>
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
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
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
          <div>
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
              <div>
                <FieldLabel>From</FieldLabel>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} data-testid="ra-from-date" />
              </div>
              <div>
                <FieldLabel>To</FieldLabel>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} data-testid="ra-to-date" />
              </div>
            </>
          )}
        </div>
      </Card>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Gross Revenue" value={formatCurrency(totalGross)} sub={`Net ${formatCurrency(total)}`} icon={IndianRupee} tone="teal" testid="ra-total-revenue" />
            <StatCard label="Invoices" value={(data?.total_invoice_count || 0).toLocaleString('en-IN')} sub="Billed in period" icon={Receipt} tone="emerald" testid="ra-total-invoices" />
            <StatCard label="Segments" value={(data?.raw_group_count || 0).toLocaleString('en-IN')} sub={`By ${dimLabel}`} icon={Layers} tone="slate" testid="ra-total-groups" />
          </div>

          {groups.length === 0 ? (
            <Empty testid="ra-empty">No revenue recorded for the selected period.</Empty>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
                <Card className="p-5 lg:col-span-3" data-testid="ra-bar-chart">
                  <h3 className="mb-4 text-base font-semibold text-foreground font-heading">Revenue by {dimLabel}</h3>
                  <ResponsiveContainer width="100%" height={380}>
                    <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 64 }} barCategoryGap="28%">
                      <defs>
                        <linearGradient id="raBarH" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#0f766e" />
                          <stop offset="100%" stopColor="#2dd4bf" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={compactAxis} axisLine={false} tickLine={false} tick={{ fill: AXIS, fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={140} axisLine={false} tickLine={false} tick={{ fill: AXIS, fontSize: 12 }} interval={0} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }} />
                      <Bar dataKey="gross" name="Gross Revenue" fill="url(#raBarH)" radius={[6, 6, 6, 6]} maxBarSize={34}
                        background={{ fill: 'hsl(var(--muted))', radius: 6, fillOpacity: 0.5 }}>
                        <LabelList dataKey="gross" position="right" formatter={formatCurrency}
                          style={{ fill: AXIS, fontSize: 11, fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card className="p-5 lg:col-span-2" data-testid="ra-pie-chart">
                  <h3 className="mb-4 text-base font-semibold text-foreground font-heading">Revenue Share</h3>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={380}>
                      <PieChart>
                        <Pie data={chartData} dataKey="gross" nameKey="name" cx="50%" cy="50%" innerRadius={82} outerRadius={120} paddingAngle={2} cornerRadius={5} stroke="none">
                          {chartData.map((e, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xs text-muted-foreground">Gross Total</span>
                      <span className="mt-0.5 text-xl font-semibold tracking-tight text-foreground font-heading">{formatCurrency(totalGross)}</span>
                    </div>
                  </div>
                </Card>
              </div>

              <Card className="overflow-hidden p-0" data-testid="ra-table">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="px-4 py-3 text-left font-medium">#</th>
                        <th className="px-4 py-3 text-left font-medium">{dimLabel}</th>
                        <th className="px-4 py-3 text-right font-medium">Gross Revenue</th>
                        <th className="px-4 py-3 text-right font-medium">Net</th>
                        <th className="px-4 py-3 text-right font-medium">Invoices</th>
                        <th className="px-4 py-3 text-right font-medium">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((g, i) => (
                        <tr key={g.label} className="border-b border-border/60 transition-colors hover:bg-muted/50">
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: SERIES[i % SERIES.length] }} />
                            {g.label}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{formatCurrency(g.gross)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatCurrency(g.revenue)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{g.count}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{totalGross ? ((g.gross / totalGross) * 100).toFixed(1) : '0.0'}%</td>
                        </tr>
                      ))}
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
    <div>
      <FieldLabel>{label}</FieldLabel>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger data-testid={testid}><SelectValue /></SelectTrigger>
        <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  const yearSel = (label, value, onChange, testid) => (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger data-testid={testid}><SelectValue /></SelectTrigger>
        <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {monthSel('Period A — Month', aMonth, setAMonth, 'ra-cmp-a-month')}
          {yearSel('Year', aYear, setAYear, 'ra-cmp-a-year')}
          {monthSel('Period B — Month', bMonth, setBMonth, 'ra-cmp-b-month')}
          {yearSel('Year', bYear, setBYear, 'ra-cmp-b-year')}
          <div>
            <FieldLabel>Group by</FieldLabel>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger data-testid="ra-cmp-groupby"><SelectValue /></SelectTrigger>
              <SelectContent>{GROUP_BY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label={aLabel} value={formatCurrency(data?.period_a?.total)} sub="Baseline period" icon={IndianRupee} tone="slate" testid="ra-cmp-a-total" />
            <StatCard label={bLabel} value={formatCurrency(data?.period_b?.total)} sub="Comparison period" icon={IndianRupee} tone="teal" testid="ra-cmp-b-total" />
            <Card className="p-5" data-testid="ra-cmp-delta">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Change (MoM)</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${up ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'}`}>
                  {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums font-heading" style={{ color: up ? POS : NEG }}>
                {up ? '+' : ''}{formatCurrency(delta)}
              </p>
              <Badge variant="outline" className={`mt-2 ${up ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'}`}>
                {up ? '+' : ''}{data?.delta_pct ?? 0}% vs {aLabel}
              </Badge>
            </Card>
          </div>

          {rows.length === 0 ? (
            <Empty testid="ra-cmp-empty">No revenue found for either period.</Empty>
          ) : (
            <>
              <Card className="p-5" data-testid="ra-cmp-chart">
                <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
                  <h3 className="text-base font-semibold text-foreground font-heading">{aLabel} vs {bLabel} — by {dimLabel}</h3>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" />{aLabel}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCENT }} />{bLabel}</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData} margin={{ left: 8, right: 8, bottom: 50 }} barGap={6} barCategoryGap="24%">
                    <defs>
                      <linearGradient id="raCmpB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2dd4bf" />
                        <stop offset="100%" stopColor="#0f766e" />
                      </linearGradient>
                      <linearGradient id="raCmpA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#cbd5e1" />
                        <stop offset="100%" stopColor="#94a3b8" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} angle={-22} textAnchor="end" interval={0} height={60} tick={{ fill: AXIS, fontSize: 11 }} />
                    <YAxis tickFormatter={compactAxis} axisLine={false} tickLine={false} tick={{ fill: AXIS, fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.4 }} />
                    <Bar dataKey="A" name={aLabel} fill="url(#raCmpA)" radius={[6, 6, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="B" name={bLabel} fill="url(#raCmpB)" radius={[6, 6, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="overflow-hidden p-0" data-testid="ra-cmp-table">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="px-4 py-3 text-left font-medium">{dimLabel}</th>
                        <th className="px-4 py-3 text-right font-medium">{aLabel}</th>
                        <th className="px-4 py-3 text-right font-medium">{bLabel}</th>
                        <th className="px-4 py-3 text-right font-medium">Change</th>
                        <th className="px-4 py-3 text-right font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const rUp = r.delta >= 0;
                        return (
                          <tr key={r.label} className="border-b border-border/60 transition-colors hover:bg-muted/50">
                            <td className="px-4 py-3 font-medium text-foreground">{r.label}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatCurrency(r.a_revenue)}</td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">{formatCurrency(r.b_revenue)}</td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums" style={{ color: rUp ? POS : NEG }}>{rUp ? '+' : ''}{formatCurrency(r.delta)}</td>
                            <td className="px-4 py-3 text-right tabular-nums" style={{ color: rUp ? POS : NEG }}>{rUp ? '+' : ''}{r.delta_pct}%</td>
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
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-700 shadow-sm">
          <BarChart3 className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Revenue Analytics</h1>
          <p className="text-sm text-muted-foreground">Invoice revenue by city, category, SKU, territory &amp; state — with month-over-month comparison.</p>
        </div>
      </div>

      <Tabs defaultValue="breakdown">
        <TabsList className="mb-6">
          <TabsTrigger value="breakdown" data-testid="ra-tab-breakdown"><BarChart3 className="mr-2 h-4 w-4" /> Breakdown</TabsTrigger>
          <TabsTrigger value="compare" data-testid="ra-tab-compare"><GitCompareArrows className="mr-2 h-4 w-4" /> Compare Months</TabsTrigger>
        </TabsList>
        <TabsContent value="breakdown"><BreakdownView /></TabsContent>
        <TabsContent value="compare"><CompareView /></TabsContent>
      </Tabs>
    </div>
  );
}
