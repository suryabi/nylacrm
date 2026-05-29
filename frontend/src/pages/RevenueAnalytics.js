import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
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
  ArrowUpRight, Sparkles, CalendarRange, BarChart3,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// ── palette (Midnight Teal & Glass / investor-deck grade) ──
const C = {
  bg: '#050808',
  gold: '#D4AF37',
  copper: '#B87333',
  bone: '#E5E4D7',
  pos: '#10B981',
  neg: '#EF4444',
  txt: '#F8FAFC',
  sub: '#94A3B8',
  muted: '#475569',
};
const DONUT = ['#D4AF37', '#B87333', '#E5E4D7', '#8A9A5B', '#6B7F8C', '#475569', '#9C6B3F', '#C2B280'];

const FONT_HEAD = "'Cabinet Grotesk', 'Outfit', sans-serif";
const FONT_BODY = "'Satoshi', 'Manrope', sans-serif";
const FONT_DATA = "'JetBrains Mono', monospace";

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

// ───────────────────────── primitives ─────────────────────────
const Panel = ({ className = '', children, ...rest }) => (
  <div
    className={`border border-white/[0.08] bg-white/[0.02] transition-colors duration-300 hover:border-white/20 ${className}`}
    {...rest}
  >
    {children}
  </div>
);

const Label = ({ children }) => (
  <span className="text-[10px] tracking-[0.18em] uppercase font-semibold" style={{ color: C.sub, fontFamily: FONT_BODY }}>
    {children}
  </span>
);

function StyledSelect({ value, onValueChange, options, testid, placeholder }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        data-testid={testid}
        className="rounded-none border-white/10 bg-white/[0.02] text-slate-100 hover:border-white/25 focus:ring-1 focus:ring-[#D4AF37] focus:ring-offset-0 h-11 uppercase tracking-wider text-xs data-[placeholder]:text-slate-500"
        style={{ fontFamily: FONT_DATA }}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-none border-white/10 bg-[#080c0c] text-slate-200">
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            data-testid={testid ? `${testid}-${o.value}` : undefined}
            className="text-xs uppercase tracking-wider focus:bg-white/10 focus:text-[#D4AF37]"
            style={{ fontFamily: FONT_DATA }}
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      className="px-3.5 py-2.5 text-xs shadow-2xl"
      style={{
        background: 'rgba(5,8,8,0.92)', backdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.12)', fontFamily: FONT_DATA, color: C.txt,
      }}
    >
      <p className="mb-1.5 font-semibold tracking-wide" style={{ color: C.bone }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 leading-relaxed">
          <span className="inline-block h-2 w-2" style={{ background: p.color || p.fill }} />
          <span style={{ color: C.sub }}>{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums">{fullINR(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

const stagger = (i) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
});

// KPI card with gold top hairline
function KpiCard({ label, value, sub, icon: Icon, accent = C.gold, index = 0, testid }) {
  return (
    <motion.div {...stagger(index)} className="md:col-span-4">
      <Panel className="relative p-6 overflow-hidden h-full" data-testid={testid}>
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: accent, opacity: 0.7 }} />
        <div className="flex items-start justify-between">
          <Label>{label}</Label>
          {Icon && <Icon className="h-4 w-4" style={{ color: C.muted }} />}
        </div>
        <p
          className="mt-5 font-light tracking-tighter tabular-nums leading-none"
          style={{ fontFamily: FONT_HEAD, color: C.txt, fontSize: 'clamp(1.9rem,3vw,2.9rem)' }}
        >
          {value}
        </p>
        {sub && (
          <p className="mt-3 text-xs tracking-wide" style={{ color: C.sub, fontFamily: FONT_DATA }}>{sub}</p>
        )}
      </Panel>
    </motion.div>
  );
}

const Spinner = () => (
  <div className="flex justify-center py-28">
    <Loader2 className="h-7 w-7 animate-spin" style={{ color: C.gold }} />
  </div>
);

const Empty = ({ children, testid }) => (
  <Panel className="p-16 text-center" data-testid={testid}>
    <BarChart3 className="h-10 w-10 mx-auto mb-4" style={{ color: C.muted }} />
    <p style={{ color: C.sub, fontFamily: FONT_BODY }}>{children}</p>
  </Panel>
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
  const dimLabel = GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label;
  const chartData = useMemo(
    () => groups.map((g) => ({ name: g.label, revenue: g.revenue, gross: g.gross, count: g.count })),
    [groups]
  );

  return (
    <div className="space-y-8">
      {/* Filter bar */}
      <FilterBar>
        <div className="flex flex-col sm:flex-row gap-4 sm:items-end flex-wrap">
          <div className="min-w-[200px]">
            <Label>Group by</Label>
            <div className="mt-2">
              <StyledSelect value={groupBy} onValueChange={setGroupBy} options={GROUP_BY_OPTIONS} testid="ra-groupby-select" />
            </div>
          </div>
          <div className="min-w-[180px]">
            <Label>Time period</Label>
            <div className="mt-2">
              <StyledSelect value={timeFilter} onValueChange={setTimeFilter} options={TIME_FILTERS} testid="ra-timefilter-select" />
            </div>
          </div>
          {timeFilter === 'custom' && (
            <>
              <DateField label="From" value={fromDate} onChange={setFromDate} testid="ra-from-date" />
              <DateField label="To" value={toDate} onChange={setToDate} testid="ra-to-date" />
            </>
          )}
        </div>
      </FilterBar>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <KpiCard index={0} label="Net Revenue" value={formatCurrency(total)} icon={ArrowUpRight}
              sub={`Gross ${formatCurrency(data?.total_gross)}`} testid="ra-total-revenue" />
            <KpiCard index={1} label="Invoices" value={(data?.total_invoice_count || 0).toLocaleString('en-IN')}
              icon={Receipt} accent={C.copper} sub="Billed in period" testid="ra-total-invoices" />
            <KpiCard index={2} label="Segments" value={(data?.raw_group_count || 0).toLocaleString('en-IN')}
              icon={Layers} accent={C.bone} sub={`By ${dimLabel}`} testid="ra-total-groups" />
          </div>

          {groups.length === 0 ? (
            <Empty testid="ra-empty">No revenue recorded for the selected period.</Empty>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Main bar chart */}
                <motion.div {...stagger(3)} className="lg:col-span-8">
                  <Panel className="p-6" data-testid="ra-bar-chart">
                    <ChartHeader title={`Revenue by ${dimLabel}`} note={`Top ${chartData.length}`} />
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 56, top: 8 }}>
                        <defs>
                          <linearGradient id="goldBar" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#8A6D1F" />
                            <stop offset="100%" stopColor="#D4AF37" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" horizontal={false} />
                        <XAxis type="number" tickFormatter={compactAxis} axisLine={false} tickLine={false}
                          tick={{ fill: C.sub, fontSize: 11, fontFamily: FONT_DATA }} />
                        <YAxis type="category" dataKey="name" width={150} axisLine={false} tickLine={false}
                          tick={{ fill: C.bone, fontSize: 12, fontFamily: FONT_BODY }} interval={0} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(212,175,55,0.06)' }} />
                        <Bar dataKey="revenue" name="Net Revenue" fill="url(#goldBar)" radius={[0, 3, 3, 0]} barSize={22}>
                          <LabelList dataKey="revenue" position="right" formatter={formatCurrency}
                            style={{ fill: C.sub, fontSize: 11, fontFamily: FONT_DATA }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                </motion.div>

                {/* Donut */}
                <motion.div {...stagger(4)} className="lg:col-span-4">
                  <Panel className="p-6 h-full" data-testid="ra-pie-chart">
                    <ChartHeader title="Revenue Share" />
                    <div className="relative">
                      <ResponsiveContainer width="100%" height={400}>
                        <PieChart>
                          <Pie data={chartData} dataKey="revenue" nameKey="name" cx="50%" cy="50%"
                            innerRadius={88} outerRadius={130} paddingAngle={2} stroke="none">
                            {chartData.map((e, i) => <Cell key={i} fill={DONUT[i % DONUT.length]} />)}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[10px] tracking-[0.18em] uppercase" style={{ color: C.muted, fontFamily: FONT_BODY }}>Total</span>
                        <span className="mt-1 font-light tracking-tighter" style={{ fontFamily: FONT_HEAD, color: C.txt, fontSize: '1.5rem' }}>
                          {formatCurrency(total)}
                        </span>
                      </div>
                    </div>
                  </Panel>
                </motion.div>
              </div>

              {/* Table */}
              <motion.div {...stagger(5)}>
                <Panel data-testid="ra-table">
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontFamily: FONT_BODY }}>
                      <thead>
                        <tr className="border-b border-white/10">
                          <Th className="w-12">#</Th>
                          <Th>{dimLabel}</Th>
                          <Th right>Net Revenue</Th>
                          <Th right>Gross</Th>
                          <Th right>Invoices</Th>
                          <Th right>Share</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((g, i) => (
                          <tr key={g.label} className="group border-b border-white/[0.05] transition-colors hover:bg-white/[0.04]">
                            <Td className="tabular-nums" style={{ color: C.muted, fontFamily: FONT_DATA }}>{String(i + 1).padStart(2, '0')}</Td>
                            <Td>
                              <span className="inline-flex items-center gap-2.5" style={{ color: C.txt }}>
                                <span className="h-2.5 w-2.5 shrink-0" style={{ background: DONUT[i % DONUT.length] }} />
                                {g.label}
                              </span>
                            </Td>
                            <Td right className="font-semibold tabular-nums" style={{ color: C.gold, fontFamily: FONT_DATA }}>{formatCurrency(g.revenue)}</Td>
                            <Td right className="tabular-nums" style={{ color: C.sub, fontFamily: FONT_DATA }}>{formatCurrency(g.gross)}</Td>
                            <Td right className="tabular-nums" style={{ color: C.sub, fontFamily: FONT_DATA }}>{g.count}</Td>
                            <Td right className="tabular-nums" style={{ color: C.sub, fontFamily: FONT_DATA }}>{total ? ((g.revenue / total) * 100).toFixed(1) : '0.0'}%</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </motion.div>
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
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) years.push({ value: String(y), label: String(y) });
  const monthOpts = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));

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
  const chartData = useMemo(
    () => rows.map((r) => ({ name: r.label, A: r.a_revenue, B: r.b_revenue })),
    [rows]
  );
  const delta = data?.delta || 0;
  const up = delta >= 0;
  const dimLabel = GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label;

  return (
    <div className="space-y-8">
      <FilterBar>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <PeriodField label="Period A — Month" value={String(aMonth)} onChange={(v) => setAMonth(Number(v))} options={monthOpts} testid="ra-cmp-a-month" />
          <PeriodField label="Year" value={String(aYear)} onChange={(v) => setAYear(Number(v))} options={years} testid="ra-cmp-a-year" />
          <PeriodField label="Period B — Month" value={String(bMonth)} onChange={(v) => setBMonth(Number(v))} options={monthOpts} testid="ra-cmp-b-month" />
          <PeriodField label="Year" value={String(bYear)} onChange={(v) => setBYear(Number(v))} options={years} testid="ra-cmp-b-year" />
          <PeriodField label="Group by" value={groupBy} onChange={setGroupBy} options={GROUP_BY_OPTIONS} testid="ra-cmp-groupby" />
        </div>
      </FilterBar>

      {loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <KpiCard index={0} label={aLabel} value={formatCurrency(data?.period_a?.total)} accent={C.sub} icon={CalendarRange} sub="Baseline period" testid="ra-cmp-a-total" />
            <KpiCard index={1} label={bLabel} value={formatCurrency(data?.period_b?.total)} accent={C.gold} icon={CalendarRange} sub="Comparison period" testid="ra-cmp-b-total" />
            <motion.div {...stagger(2)} className="md:col-span-4">
              <Panel className="relative p-6 h-full overflow-hidden" data-testid="ra-cmp-delta">
                <div className="absolute inset-x-0 top-0 h-px" style={{ background: up ? C.pos : C.neg, opacity: 0.8 }} />
                <div className="flex items-start justify-between">
                  <Label>Change (MoM)</Label>
                  {up ? <TrendingUp className="h-4 w-4" style={{ color: C.pos }} /> : <TrendingDown className="h-4 w-4" style={{ color: C.neg }} />}
                </div>
                <p className="mt-5 font-light tracking-tighter tabular-nums leading-none"
                  style={{ fontFamily: FONT_HEAD, color: up ? C.pos : C.neg, fontSize: 'clamp(1.9rem,3vw,2.9rem)' }}>
                  {up ? '+' : ''}{formatCurrency(delta)}
                </p>
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums"
                  style={{ color: up ? C.pos : C.neg, fontFamily: FONT_DATA }}>
                  {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {up ? '+' : ''}{data?.delta_pct ?? 0}%
                </p>
              </Panel>
            </motion.div>
          </div>

          {rows.length === 0 ? (
            <Empty testid="ra-cmp-empty">No revenue found for either period.</Empty>
          ) : (
            <>
              <motion.div {...stagger(3)}>
                <Panel className="p-6" data-testid="ra-cmp-chart">
                  <ChartHeader title={`${aLabel} vs ${bLabel}`} note={`by ${dimLabel}`} legend={[
                    { name: aLabel, color: C.sub }, { name: bLabel, color: C.gold },
                  ]} />
                  <ResponsiveContainer width="100%" height={440}>
                    <BarChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 56 }} barGap={4}>
                      <defs>
                        <linearGradient id="cmpB" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#D4AF37" />
                          <stop offset="100%" stopColor="#8A6D1F" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} angle={-22} textAnchor="end" interval={0} height={64}
                        tick={{ fill: C.sub, fontSize: 11, fontFamily: FONT_BODY }} />
                      <YAxis tickFormatter={compactAxis} axisLine={false} tickLine={false}
                        tick={{ fill: C.sub, fontSize: 11, fontFamily: FONT_DATA }} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(212,175,55,0.06)' }} />
                      <Bar dataKey="A" name={aLabel} fill={C.sub} radius={[2, 2, 0, 0]} barSize={16} fillOpacity={0.55} />
                      <Bar dataKey="B" name={bLabel} fill="url(#cmpB)" radius={[2, 2, 0, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>
              </motion.div>

              <motion.div {...stagger(4)}>
                <Panel data-testid="ra-cmp-table">
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ fontFamily: FONT_BODY }}>
                      <thead>
                        <tr className="border-b border-white/10">
                          <Th>{dimLabel}</Th>
                          <Th right>{aLabel}</Th>
                          <Th right>{bLabel}</Th>
                          <Th right>Change</Th>
                          <Th right>%</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const rUp = r.delta >= 0;
                          return (
                            <tr key={r.label} className="border-b border-white/[0.05] transition-colors hover:bg-white/[0.04]">
                              <Td style={{ color: C.txt }}>{r.label}</Td>
                              <Td right className="tabular-nums" style={{ color: C.sub, fontFamily: FONT_DATA }}>{formatCurrency(r.a_revenue)}</Td>
                              <Td right className="font-semibold tabular-nums" style={{ color: C.gold, fontFamily: FONT_DATA }}>{formatCurrency(r.b_revenue)}</Td>
                              <Td right className="tabular-nums font-medium" style={{ color: rUp ? C.pos : C.neg, fontFamily: FONT_DATA }}>{rUp ? '+' : ''}{formatCurrency(r.delta)}</Td>
                              <Td right className="tabular-nums" style={{ color: rUp ? C.pos : C.neg, fontFamily: FONT_DATA }}>{rUp ? '+' : ''}{r.delta_pct}%</Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </motion.div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── small shared bits ──
const FilterBar = ({ children }) => (
  <div className="sticky top-0 z-30 -mx-6 lg:-mx-8 px-6 lg:px-8 py-4 border-b border-white/10"
    style={{ background: 'rgba(5,8,8,0.72)', backdropFilter: 'blur(16px)' }}>
    {children}
  </div>
);

const DateField = ({ label, value, onChange, testid }) => (
  <div>
    <Label>{label}</Label>
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}
      className="mt-2 block h-11 w-full rounded-none border border-white/10 bg-white/[0.02] px-3 text-xs text-slate-100 outline-none focus:border-[#D4AF37] [color-scheme:dark]"
      style={{ fontFamily: FONT_DATA }} />
  </div>
);

const PeriodField = ({ label, value, onChange, options, testid }) => (
  <div>
    <Label>{label}</Label>
    <div className="mt-2">
      <StyledSelect value={value} onValueChange={onChange} options={options} testid={testid} />
    </div>
  </div>
);

const ChartHeader = ({ title, note, legend }) => (
  <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
    <h3 className="text-base font-medium tracking-tight" style={{ fontFamily: FONT_HEAD, color: C.txt }}>{title}</h3>
    <div className="flex items-center gap-4">
      {legend && legend.map((l) => (
        <span key={l.name} className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: C.sub, fontFamily: FONT_DATA }}>
          <span className="h-2 w-2" style={{ background: l.color }} />{l.name}
        </span>
      ))}
      {note && <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: C.muted, fontFamily: FONT_DATA }}>{note}</span>}
    </div>
  </div>
);

const Th = ({ children, right, className = '' }) => (
  <th className={`px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${right ? 'text-right' : 'text-left'} ${className}`}
    style={{ color: C.sub, fontFamily: FONT_BODY }}>
    {children}
  </th>
);
const Td = ({ children, right, className = '', style }) => (
  <td className={`px-5 py-3.5 text-sm ${right ? 'text-right' : 'text-left'} ${className}`} style={style}>{children}</td>
);

// ───────────────────────── page ─────────────────────────
const TABS = [
  { id: 'breakdown', label: 'Breakdown', icon: BarChart3 },
  { id: 'compare', label: 'Compare Months', icon: CalendarRange },
];

export default function RevenueAnalytics() {
  const [tab, setTab] = useState('breakdown');

  return (
    <div className="-m-4 lg:-m-6 min-h-[calc(100vh-2rem)] px-6 lg:px-8 pb-16"
      style={{ background: C.bg, color: C.txt, fontFamily: FONT_BODY }} data-testid="revenue-analytics-page">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="pt-8 pb-6 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Sparkles className="h-3.5 w-3.5" style={{ color: C.gold }} />
            <span className="text-[10px] tracking-[0.22em] uppercase font-semibold" style={{ color: C.gold, fontFamily: FONT_BODY }}>
              Executive Intelligence
            </span>
          </div>
          <h1 className="font-medium tracking-tighter leading-none"
            style={{ fontFamily: FONT_HEAD, color: C.txt, fontSize: 'clamp(2rem,4vw,3rem)' }}>
            Revenue Analytics
          </h1>
          <p className="mt-3 text-sm max-w-xl" style={{ color: C.sub }}>
            Invoice revenue across cities, categories, SKUs, territories &amp; states — with month-over-month performance.
          </p>
        </div>
      </motion.div>

      {/* Underline tabs */}
      <div className="flex items-center gap-8 border-b border-white/10 mb-8" data-testid="analytics-mode-tabs">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`ra-tab-${t.id}`}
              className="relative flex items-center gap-2 pb-4 pt-1 text-base transition-colors duration-200"
              style={{ fontFamily: FONT_HEAD, color: active ? C.gold : C.sub }}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {active && (
                <motion.span layoutId="ra-tab-underline" className="absolute -bottom-px left-0 right-0 h-0.5"
                  style={{ background: C.gold }} />
              )}
            </button>
          );
        })}
      </div>

      {tab === 'breakdown' ? <BreakdownView /> : <CompareView />}
    </div>
  );
}
