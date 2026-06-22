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
  BarChart3, GitCompareArrows, IndianRupee, Gauge,
  Scale, ChevronDown, AlertTriangle,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// ───────────────────────── Chart palette (app theme) ─────────────────────────
const CHART = { cyan: '#059669', aqua: '#0d9488', purple: '#0284c7', magenta: '#7c3aed', blue: '#0ea5e9' };
const DONUT = ['#059669', '#0d9488', '#0284c7', '#7c3aed', '#d97706', '#dc2626',
  '#0891b2', '#9333ea', '#2563eb', '#16a34a', '#ca8a04', '#db2777'];
const GRID = 'rgba(15,23,42,0.07)';
const AXIS = '#64748B';
const POS = '#059669';   // emerald
const NEG = '#e11d48';   // rose

const GLASS = 'bg-white border border-slate-200 rounded-2xl shadow-sm';

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

// Annual Run Rate = selected-period gross annualized to a full year.
// Named periods use a fixed multiplier (month → ×12); custom / all-time
// annualize from the actual number of days in the resolved window.
const ARR_FACTORS = {
  this_week: 52, last_week: 52, this_month: 12, last_month: 12,
  this_quarter: 4, this_year: 1, last_year: 1,
};
function arrFactor(timeFilter, fromISO, toISO) {
  if (ARR_FACTORS[timeFilter]) return ARR_FACTORS[timeFilter];
  if (fromISO && toISO) {
    const days = (new Date(toISO) - new Date(fromISO)) / 86400000 + 1;
    return days > 0 ? 365 / days : 0;
  }
  return 0;
}

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

// Shared shadcn overrides for the light surface
const SELECT_TRIGGER = 'border-slate-200 bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 data-[placeholder]:text-slate-400';
const SELECT_CONTENT = 'border-slate-200 bg-white text-slate-700 shadow-lg';
const SELECT_ITEM = 'text-slate-700 focus:bg-emerald-50 focus:text-emerald-700';
const INPUT_LIGHT = 'border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500';

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-slate-800">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}
          <span className="ml-auto pl-4 font-mono font-semibold tabular-nums text-slate-900">{fullINR(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

// ───────────────────────── KPI tile ─────────────────────────
function StatCard({ label, value, sub, icon: Icon, gradient = 'cyan', testid }) {
  const accents = {
    cyan: { tile: 'from-emerald-100 to-teal-100', icon: 'text-emerald-600', ring: 'hover:border-emerald-200' },
    purple: { tile: 'from-sky-100 to-blue-100', icon: 'text-sky-600', ring: 'hover:border-sky-200' },
    teal: { tile: 'from-teal-100 to-emerald-100', icon: 'text-teal-600', ring: 'hover:border-teal-200' },
    magenta: { tile: 'from-violet-100 to-purple-100', icon: 'text-violet-600', ring: 'hover:border-violet-200' },
  };
  const a = accents[gradient] || accents.cyan;
  return (
    <div
      data-testid={testid}
      className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${a.ring}`}
    >
      <div className="relative flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">{label}</span>
        {Icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${a.tile}`}>
            <Icon className={`h-[18px] w-[18px] ${a.icon}`} />
          </span>
        )}
      </div>
      <p className="relative mt-4 font-mono text-3xl font-semibold tracking-tight tabular-nums text-slate-900 md:text-[2.15rem]">{value}</p>
      {sub && <p className="relative mt-1.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

const Spinner = () => (
  <div className="flex justify-center py-28">
    <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
  </div>
);

const Empty = ({ children, testid }) => (
  <div className={`${GLASS} p-16 text-center`} data-testid={testid}>
    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
      <BarChart3 className="h-6 w-6 text-slate-400" />
    </span>
    <p className="text-sm text-slate-500">{children}</p>
  </div>
);

const FieldLabel = ({ children }) => (
  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{children}</label>
);

const SectionTitle = ({ children }) => (
  <h3 className="text-base font-semibold tracking-tight text-slate-800">{children}</h3>
);

const ChartDefs = () => (
  <defs>
    <linearGradient id="raBarH" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor={CHART.cyan} />
      <stop offset="100%" stopColor={CHART.aqua} />
    </linearGradient>
    <linearGradient id="raCmpA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={CHART.cyan} stopOpacity={1} />
      <stop offset="100%" stopColor={CHART.aqua} stopOpacity={0.35} />
    </linearGradient>
    <linearGradient id="raCmpB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={CHART.purple} stopOpacity={1} />
      <stop offset="100%" stopColor={CHART.blue} stopOpacity={0.35} />
    </linearGradient>
  </defs>
);

// ─────────── Revenue Reconciliation (Gross → SKU Performance bridge) ───────────
const RecRow = ({ label, hint, value, accent }) => (
  <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50">
    <div className="min-w-0">
      <p className={`text-sm font-medium ${accent || 'text-slate-700'}`}>{label}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-800">{fullINR(value)}</span>
  </div>
);

function ReconciliationPanel({ timeFilter, fromDate, toDate }) {
  const [open, setOpen] = useState(true);
  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (timeFilter === 'custom' && (!fromDate || !toDate)) return;
    setLoading(true);
    try {
      const params = { time_filter: timeFilter };
      if (timeFilter === 'custom') { params.from_date = fromDate; params.to_date = toDate; }
      const res = await axios.get(`${API_URL}/reports/revenue-reconciliation`, { ...authHeaders(), params });
      setRec(res.data);
    } catch (e) {
      setRec(null);
    } finally {
      setLoading(false);
    }
  }, [timeFilter, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={`${GLASS} overflow-hidden`} data-testid="ra-reconciliation">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-slate-50"
        data-testid="ra-reconciliation-toggle"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100">
            <Scale className="h-[18px] w-[18px] text-emerald-600" />
          </span>
          <div>
            <SectionTitle>Revenue Reconciliation</SectionTitle>
            <p className="text-xs text-slate-500">How Gross ties out to SKU Performance — every rupee accounted for</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-slate-200 px-5 py-5">
          {loading || !rec ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" /></div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <RecRow label="Product line revenue" accent="text-emerald-700"
                  hint='Sum of SKU line items — matches the SKU Performance "Achieved" total'
                  value={rec.product_line_revenue} />
                <RecRow label="+ Tax & other charges"
                  hint="GST / shipping / round-off carried on invoices (not attributable to a SKU)"
                  value={rec.tax_and_charges} />
                <RecRow label="+ Invoices without SKU lines"
                  hint={`${rec.invoices_without_sku_lines_count} invoice(s) billed with no product line (e.g. External Billing Entries)`}
                  value={rec.invoices_without_sku_lines} />
                {Math.abs(rec.unidentified_line_revenue) >= 1 && (
                  <RecRow label="+ Lines without a SKU identifier"
                    hint="Line items carrying neither a SKU code nor a name"
                    value={rec.unidentified_line_revenue} />
                )}
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">= Gross Revenue (Revenue Analytics)</p>
                <span className="shrink-0 font-mono text-base font-bold tabular-nums text-emerald-700"
                  data-testid="ra-rec-gross">{fullINR(rec.gross)}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-sm">
                <span className="text-slate-500">Less Credit Notes&nbsp;
                  <span className="font-mono text-slate-600">{fullINR(rec.credit_notes)}</span>
                </span>
                <span className="text-slate-600">Net Revenue&nbsp;
                  <span className="ml-1 font-mono text-base font-semibold text-slate-900">{fullINR(rec.net)}</span>
                </span>
              </div>
              {rec.unmapped_line_revenue >= 1 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800" data-testid="ra-rec-unmapped">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{fullINR(rec.unmapped_line_revenue)} of product revenue ({rec.unmapped_identifier_count} old/unmapped SKU{rec.unmapped_identifier_count === 1 ? '' : 's'}) is shown under retired names. Map them in <span className="font-semibold">Tenant Settings → SKU Aliases</span> for clean per-SKU reporting (this does not change the totals above).</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
  const arr = arrFactor(timeFilter, data?.from, data?.to) * totalGross;
  const arrSub = ARR_FACTORS[timeFilter]
    ? `${TIME_FILTERS.find((o) => o.value === timeFilter)?.label} gross × ${ARR_FACTORS[timeFilter]}`
    : 'Annualized from period';
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
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={INPUT_LIGHT} data-testid="ra-from-date" />
            </div>
            <div className="min-w-[150px] flex-1">
              <FieldLabel>To</FieldLabel>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={INPUT_LIGHT} data-testid="ra-to-date" />
            </div>
          </>
        )}
      </div>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 gap-4 duration-500 animate-in fade-in-50 slide-in-from-bottom-2 sm:grid-cols-2 lg:grid-cols-4 md:gap-6">
            <StatCard label="Gross Revenue" value={formatCurrency(totalGross)} sub={`Net ${formatCurrency(total)}`} icon={IndianRupee} gradient="cyan" testid="ra-total-revenue" />
            <StatCard label="Annual Run Rate" value={formatCurrency(arr)} sub={arrSub} icon={Gauge} gradient="magenta" testid="ra-arr" />
            <StatCard label="Invoices" value={(data?.total_invoice_count || 0).toLocaleString('en-IN')} sub="Billed in period" icon={Receipt} gradient="purple" testid="ra-total-invoices" />
            <StatCard label="Segments" value={(data?.raw_group_count || 0).toLocaleString('en-IN')} sub={`By ${dimLabel}`} icon={Layers} gradient="teal" testid="ra-total-groups" />
          </div>

          <ReconciliationPanel timeFilter={timeFilter} fromDate={fromDate} toDate={toDate} />

          {groups.length === 0 ? (
            <Empty testid="ra-empty">No revenue recorded for the selected period.</Empty>
          ) : (
            <>
              <div className={`${GLASS} overflow-hidden p-0`} data-testid="ra-table">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
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
                          <tr key={g.label} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50">
                            <td className="px-5 py-4 font-mono tabular-nums text-slate-400">{i + 1}</td>
                            <td className="px-5 py-4 font-medium text-slate-800">
                              <span className="mr-2.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: DONUT[i % DONUT.length] }} />
                              {g.label}
                            </td>
                            <td className="px-5 py-4 text-right font-mono font-semibold tabular-nums text-slate-900">{formatCurrency(g.gross)}</td>
                            <td className="px-5 py-4 text-right font-mono tabular-nums text-slate-500">{formatCurrency(g.revenue)}</td>
                            <td className="px-5 py-4 text-right font-mono tabular-nums text-slate-500">{g.count}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2.5">
                                <div className="h-1.5 w-full max-w-[90px] overflow-hidden rounded-full bg-slate-100">
                                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${Math.max(share, 2)}%` }} />
                                </div>
                                <span className="w-10 text-right font-mono text-xs tabular-nums text-slate-500">{share.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <div className={`${GLASS} p-6 xl:col-span-7`} data-testid="ra-bar-chart">
                  <div className="mb-5 flex items-baseline justify-between">
                    <SectionTitle>Revenue by {dimLabel}</SectionTitle>
                    <span className="text-xs text-slate-400">Gross</span>
                  </div>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 70 }} barCategoryGap="30%">
                      <ChartDefs />
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={compactAxis} axisLine={false} tickLine={false} tick={{ fill: AXIS, fontSize: 12 }} dy={6} />
                      <YAxis type="category" dataKey="name" width={140} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12 }} interval={0} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
                      <Bar dataKey="gross" name="Gross Revenue" fill="url(#raBarH)" radius={[0, 5, 5, 0]} maxBarSize={28}>
                        <LabelList dataKey="gross" position="right" formatter={formatCurrency}
                          style={{ fill: '#475569', fontSize: 11, fontWeight: 600 }} />
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
                      <span className="text-[11px] uppercase tracking-[0.1em] text-slate-500">Gross Total</span>
                      <span className="mt-1 font-mono text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(totalGross)}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
                    {chartData.slice(0, 6).map((e, i) => (
                      <span key={e.name} className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="h-2 w-2 rounded-full" style={{ background: DONUT[i % DONUT.length] }} />
                        <span className="max-w-[120px] truncate">{e.name}</span>
                      </span>
                    ))}
                  </div>
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
            <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md" data-testid="ra-cmp-delta">
              <div className="relative flex items-start justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">Change (MoM)</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: up ? POS : NEG, background: `${up ? POS : NEG}14` }}>
                  {up ? <TrendingUp className="h-[18px] w-[18px]" /> : <TrendingDown className="h-[18px] w-[18px]" />}
                </span>
              </div>
              <p className="relative mt-4 font-mono text-3xl font-semibold tracking-tight tabular-nums md:text-[2.15rem]" style={{ color: up ? POS : NEG }} data-testid="ra-cmp-delta-pct">
                {up ? '+' : ''}{data?.delta_pct ?? 0}%
              </p>
              <span className="relative mt-2 inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium" style={{ color: up ? POS : NEG, borderColor: `${up ? POS : NEG}40`, background: `${up ? POS : NEG}12` }} data-testid="ra-cmp-delta-amount">
                {up ? '+' : ''}{formatCurrency(delta)} vs {aLabel}
              </span>
            </div>
          </div>

          {rows.length === 0 ? (
            <Empty testid="ra-cmp-empty">No revenue found for either period.</Empty>
          ) : (
            <>
              <div className={`${GLASS} overflow-hidden p-0`} data-testid="ra-cmp-table">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
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
                          <tr key={r.label} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50">
                            <td className="px-5 py-4 font-medium text-slate-800">{r.label}</td>
                            <td className="px-5 py-4 text-right font-mono tabular-nums text-slate-500">{formatCurrency(r.a_revenue)}</td>
                            <td className="px-5 py-4 text-right font-mono font-semibold tabular-nums text-slate-900">{formatCurrency(r.b_revenue)}</td>
                            <td className="px-5 py-4 text-right font-mono font-medium tabular-nums" style={{ color: rUp ? POS : NEG }}>{rUp ? '+' : ''}{formatCurrency(r.delta)}</td>
                            <td className="px-5 py-4 text-right font-mono tabular-nums" style={{ color: rUp ? POS : NEG }}>{rUp ? '+' : ''}{r.delta_pct}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={`${GLASS} p-6`} data-testid="ra-cmp-chart">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <SectionTitle>{aLabel} vs {bLabel} — by {dimLabel}</SectionTitle>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART.cyan }} />{aLabel}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART.purple }} />{bLabel}</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData} margin={{ left: 8, right: 8, bottom: 50 }} barGap={6} barCategoryGap="26%">
                    <ChartDefs />
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} angle={-22} textAnchor="end" interval={0} height={60} tick={{ fill: '#475569', fontSize: 11 }} dy={6} />
                    <YAxis tickFormatter={compactAxis} axisLine={false} tickLine={false} tick={{ fill: AXIS, fontSize: 11 }} dx={-6} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
                    <Bar dataKey="A" name={aLabel} fill="url(#raCmpA)" radius={[5, 5, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="B" name={bLabel} fill="url(#raCmpB)" radius={[5, 5, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
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
    <div className="relative min-h-[calc(100vh-6rem)] overflow-hidden rounded-3xl bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 p-5 sm:p-7 md:p-9" data-testid="revenue-analytics-page">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />

      <div className="relative z-10 mx-auto max-w-[1400px]">
        <div className="mb-8 flex flex-col gap-4 duration-500 animate-in fade-in-50 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100">
              <BarChart3 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800 md:text-3xl">Revenue Analytics</h1>
              <p className="mt-0.5 text-sm text-slate-500">Invoice revenue by city, category, SKU, territory &amp; state — with month-over-month comparison.</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="breakdown">
          <TabsList className="mb-6 inline-flex h-auto gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <TabsTrigger
              value="breakdown"
              data-testid="ra-tab-breakdown"
              className="rounded-lg px-4 py-2 font-medium text-slate-500 transition-all duration-200 hover:text-slate-800 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
            >
              <BarChart3 className="mr-2 h-4 w-4" /> Breakdown
            </TabsTrigger>
            <TabsTrigger
              value="compare"
              data-testid="ra-tab-compare"
              className="rounded-lg px-4 py-2 font-medium text-slate-500 transition-all duration-200 hover:text-slate-800 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
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
