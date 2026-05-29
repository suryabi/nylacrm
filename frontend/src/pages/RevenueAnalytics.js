import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  BarChart3, Loader2, TrendingUp, TrendingDown, IndianRupee,
  Receipt, Layers, GitCompareArrows,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const GROUP_BY_OPTIONS = [
  { value: 'city', label: 'City' },
  { value: 'business_category', label: 'Business Category' },
  { value: 'sku', label: 'SKU' },
  { value: 'territory', label: 'Territory' },
  { value: 'state', label: 'State' },
];

// Mirrors the windows the backend _window() resolver supports.
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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Cohesive ocean / teal palette to match the app's deep-teal chrome.
const CHART_COLORS = [
  '#0891B2', '#0E7490', '#0D9488', '#10B981', '#6366F1',
  '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6',
  '#3B82F6', '#84CC16', '#F97316', '#A855F7', '#06B6D4',
];

function formatCurrency(value) {
  const num = Math.round(value || 0);
  if (Math.abs(num) >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  if (Math.abs(num) >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
  return '₹' + num.toLocaleString('en-IN');
}

function authHeaders() {
  const token = localStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-sm shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <p className="font-semibold text-slate-900 dark:text-slate-100">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-slate-600 dark:text-slate-300">
          <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: p.color || p.fill }} />
          {p.name}: <span className="font-semibold">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

function StatCard({ icon: Icon, label, value, accent, sub, testid }) {
  return (
    <Card className="p-5" data-testid={testid}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </Card>
  );
}

// ───────────────────────────── Breakdown tab ─────────────────────────────
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
      const params = { time_filter: timeFilter, group_by: groupBy, top_n: 15 };
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
  const chartData = useMemo(
    () => groups.map((g) => ({ name: g.label, revenue: g.revenue, gross: g.gross, count: g.count })),
    [groups]
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Group by</label>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger data-testid="ra-groupby-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GROUP_BY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} data-testid={`ra-groupby-${o.value}`}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Time period</label>
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger data-testid="ra-timefilter-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIME_FILTERS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {timeFilter === 'custom' && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">From</label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} data-testid="ra-from-date" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">To</label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} data-testid="ra-to-date" />
              </div>
            </>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-cyan-600" /></div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={IndianRupee} label="Net Revenue" value={formatCurrency(total)}
              accent="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"
              sub={`Gross ${formatCurrency(data?.total_gross)}`} testid="ra-total-revenue" />
            <StatCard icon={Receipt} label="Invoices" value={(data?.total_invoice_count || 0).toLocaleString('en-IN')}
              accent="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" testid="ra-total-invoices" />
            <StatCard icon={Layers} label="Groups" value={(data?.raw_group_count || 0).toLocaleString('en-IN')}
              accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              sub={`by ${GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label}`} testid="ra-total-groups" />
          </div>

          {groups.length === 0 ? (
            <Card className="p-12 text-center text-slate-500" data-testid="ra-empty">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              No revenue found for the selected period.
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Bar chart */}
              <Card className="p-5 lg:col-span-3" data-testid="ra-bar-chart">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">
                  Revenue by {GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label}
                </h3>
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={formatCurrency} fontSize={11} stroke="#94a3b8" />
                    <YAxis type="category" dataKey="name" width={130} fontSize={11} stroke="#64748b" interval={0} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(8,145,178,0.06)' }} />
                    <Bar dataKey="revenue" name="Net Revenue" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* Pie / share */}
              <Card className="p-5 lg:col-span-2" data-testid="ra-pie-chart">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">Revenue Share</h3>
                <ResponsiveContainer width="100%" height={380}>
                  <PieChart>
                    <Pie data={chartData} dataKey="revenue" nameKey="name" cx="50%" cy="50%"
                      innerRadius={60} outerRadius={120} paddingAngle={2}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}

          {/* Table */}
          {groups.length > 0 && (
            <Card className="p-0 overflow-hidden" data-testid="ra-table">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                    <tr>
                      <th className="text-left font-medium px-4 py-3">#</th>
                      <th className="text-left font-medium px-4 py-3">{GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label}</th>
                      <th className="text-right font-medium px-4 py-3">Net Revenue</th>
                      <th className="text-right font-medium px-4 py-3">Gross</th>
                      <th className="text-right font-medium px-4 py-3">Invoices</th>
                      <th className="text-right font-medium px-4 py-3">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {groups.map((g, i) => (
                      <tr key={g.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                          <span className="inline-block h-2.5 w-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                          {g.label}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(g.revenue)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(g.gross)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{g.count}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{total ? ((g.revenue / total) * 100).toFixed(1) : '0.0'}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ───────────────────────────── Compare tab ─────────────────────────────
function CompareView() {
  const now = new Date();
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) years.push(y);

  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-indexed previous month
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
        period_b_year: bYear, period_b_month: bMonth,
        group_by: groupBy, top_n: 15,
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
  const chartData = useMemo(
    () => rows.map((r) => ({ name: r.label, [aLabel]: r.a_revenue, [bLabel]: r.b_revenue })),
    [rows, aLabel, bLabel]
  );
  const delta = data?.delta || 0;
  const up = delta >= 0;

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Period A — Month</label>
            <Select value={String(aMonth)} onValueChange={(v) => setAMonth(Number(v))}>
              <SelectTrigger data-testid="ra-cmp-a-month"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Period A — Year</label>
            <Select value={String(aYear)} onValueChange={(v) => setAYear(Number(v))}>
              <SelectTrigger data-testid="ra-cmp-a-year"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Period B — Month</label>
            <Select value={String(bMonth)} onValueChange={(v) => setBMonth(Number(v))}>
              <SelectTrigger data-testid="ra-cmp-b-month"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Period B — Year</label>
            <Select value={String(bYear)} onValueChange={(v) => setBYear(Number(v))}>
              <SelectTrigger data-testid="ra-cmp-b-year"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Group by</label>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger data-testid="ra-cmp-groupby"><SelectValue /></SelectTrigger>
              <SelectContent>{GROUP_BY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-cyan-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={IndianRupee} label={aLabel} value={formatCurrency(data?.period_a?.total)}
              accent="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" testid="ra-cmp-a-total" />
            <StatCard icon={IndianRupee} label={bLabel} value={formatCurrency(data?.period_b?.total)}
              accent="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" testid="ra-cmp-b-total" />
            <Card className="p-5" data-testid="ra-cmp-delta">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">Change</p>
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${up ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'}`}>
                  {up ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                </div>
              </div>
              <p className={`mt-3 text-2xl font-bold tracking-tight ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {up ? '+' : ''}{formatCurrency(delta)}
              </p>
              <Badge variant="secondary" className={`mt-1 ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {up ? '+' : ''}{data?.delta_pct ?? 0}% MoM
              </Badge>
            </Card>
          </div>

          {rows.length === 0 ? (
            <Card className="p-12 text-center text-slate-500" data-testid="ra-cmp-empty">
              <GitCompareArrows className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              No revenue found for either period.
            </Card>
          ) : (
            <>
              <Card className="p-5" data-testid="ra-cmp-chart">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-4">
                  {aLabel} vs {bLabel} — by {GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label}
                </h3>
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={chartData} margin={{ left: 12, right: 12, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={11} stroke="#64748b" angle={-25} textAnchor="end" interval={0} height={60} />
                    <YAxis tickFormatter={formatCurrency} fontSize={11} stroke="#94a3b8" />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(8,145,178,0.06)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey={aLabel} fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={bLabel} fill="#0891B2" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-0 overflow-hidden" data-testid="ra-cmp-table">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                      <tr>
                        <th className="text-left font-medium px-4 py-3">{GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label}</th>
                        <th className="text-right font-medium px-4 py-3">{aLabel}</th>
                        <th className="text-right font-medium px-4 py-3">{bLabel}</th>
                        <th className="text-right font-medium px-4 py-3">Change</th>
                        <th className="text-right font-medium px-4 py-3">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {rows.map((r) => {
                        const rUp = r.delta >= 0;
                        return (
                          <tr key={r.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{r.label}</td>
                            <td className="px-4 py-3 text-right text-slate-500">{formatCurrency(r.a_revenue)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(r.b_revenue)}</td>
                            <td className={`px-4 py-3 text-right font-medium ${rUp ? 'text-emerald-600' : 'text-rose-600'}`}>{rUp ? '+' : ''}{formatCurrency(r.delta)}</td>
                            <td className={`px-4 py-3 text-right ${rUp ? 'text-emerald-600' : 'text-rose-600'}`}>{rUp ? '+' : ''}{r.delta_pct}%</td>
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

export default function RevenueAnalytics() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto" data-testid="revenue-analytics-page">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-cyan-600 to-teal-700 flex items-center justify-center shadow-sm">
          <BarChart3 className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Revenue Analytics</h1>
          <p className="text-sm text-slate-500">Invoice revenue by city, category, SKU, territory & state — with month-over-month comparison.</p>
        </div>
      </div>

      <Tabs defaultValue="breakdown">
        <TabsList className="mb-6">
          <TabsTrigger value="breakdown" data-testid="ra-tab-breakdown">
            <BarChart3 className="h-4 w-4 mr-2" /> Breakdown
          </TabsTrigger>
          <TabsTrigger value="compare" data-testid="ra-tab-compare">
            <GitCompareArrows className="h-4 w-4 mr-2" /> Compare Months
          </TabsTrigger>
        </TabsList>
        <TabsContent value="breakdown"><BreakdownView /></TabsContent>
        <TabsContent value="compare"><CompareView /></TabsContent>
      </Tabs>
    </div>
  );
}
