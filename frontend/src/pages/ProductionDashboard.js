import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Factory, Package, Boxes, Truck, AlertTriangle, ShieldCheck,
  Loader2, ArrowRight, ArrowDown, ChevronRight, Droplets,
  IndianRupee, Tags, Layers, Activity, Sparkles,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const TIME_FILTERS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'lifetime', label: 'Lifetime' },
];

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const num = (n) => (Number(n) || 0).toLocaleString();

// ─────────────────────────────────────────────────────────────────────────
// Hero tile — same theme as Account GOP Metrics (gradient bg, blurred halo,
// decorative icon, big tabular-nums number, soft border, hover lift).
// ─────────────────────────────────────────────────────────────────────────
const ACCENTS = {
  indigo:  { grad: 'from-indigo-50 via-indigo-50/50 to-white dark:from-indigo-950/40 dark:via-indigo-950/20 dark:to-slate-900', icon: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10', halo: 'bg-indigo-500/10' },
  emerald: { grad: 'from-emerald-50 via-emerald-50/50 to-white dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-slate-900', icon: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10', halo: 'bg-emerald-500/10' },
  amber:   { grad: 'from-amber-50 via-amber-50/50 to-white dark:from-amber-950/40 dark:via-amber-950/20 dark:to-slate-900', icon: 'text-amber-600 dark:text-amber-400 bg-amber-500/10', halo: 'bg-amber-500/10' },
  sky:     { grad: 'from-sky-50 via-sky-50/50 to-white dark:from-sky-950/40 dark:via-sky-950/20 dark:to-slate-900', icon: 'text-sky-600 dark:text-sky-400 bg-sky-500/10', halo: 'bg-sky-500/10' },
  rose:    { grad: 'from-rose-50 via-rose-50/50 to-white dark:from-rose-950/40 dark:via-rose-950/20 dark:to-slate-900', icon: 'text-rose-600 dark:text-rose-400 bg-rose-500/10', halo: 'bg-rose-500/10' },
  violet:  { grad: 'from-violet-50 via-violet-50/50 to-white dark:from-violet-950/40 dark:via-violet-950/20 dark:to-slate-900', icon: 'text-violet-600 dark:text-violet-400 bg-violet-500/10', halo: 'bg-violet-500/10' },
  teal:    { grad: 'from-teal-50 via-teal-50/50 to-white dark:from-teal-950/40 dark:via-teal-950/20 dark:to-slate-900', icon: 'text-teal-600 dark:text-teal-400 bg-teal-500/10', halo: 'bg-teal-500/10' },
  slate:   { grad: 'from-slate-50 via-slate-50/50 to-white dark:from-slate-900 dark:via-slate-900/50 dark:to-slate-900', icon: 'text-slate-600 dark:text-slate-400 bg-slate-500/10', halo: 'bg-slate-500/10' },
};

function HeroTile({ label, value, sub, icon: Icon, accent = 'slate', onClick, dataTestId }) {
  const a = ACCENTS[accent] || ACCENTS.slate;
  return (
    <div
      className={`relative group rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-gradient-to-br ${a.grad} p-4 sm:p-5 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lg ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      data-testid={dataTestId}
    >
      {/* Decorative blurred halo */}
      <div className={`absolute -top-6 -right-6 h-24 w-24 rounded-full ${a.halo} blur-2xl opacity-40 transition-opacity group-hover:opacity-60`} />

      <div className="flex items-start justify-between gap-2 relative">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        </div>
        <div className={`shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ${a.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3 relative">
        <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums truncate" title={typeof value === 'string' ? value : undefined}>
          {value}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// Compact secondary stat — for less prominent metrics, all in one tidy row
function MiniStat({ label, value, sub, accent = 'slate', onClick, dataTestId }) {
  const a = ACCENTS[accent] || ACCENTS.slate;
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/40 backdrop-blur-sm transition-all ${onClick ? 'cursor-pointer hover:bg-white dark:hover:bg-slate-900/70 hover:border-slate-300 dark:hover:border-slate-600' : ''}`}
      onClick={onClick}
      data-testid={dataTestId}
    >
      <div className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center ${a.icon}`}>
        <span className="h-2 w-2 rounded-full bg-current opacity-80" />
      </div>
      <div className="min-w-0 leading-tight flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-white truncate">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Stage palette — softer, more harmonious. One accent per stage type.
// ─────────────────────────────────────────────────────────────────────────
const stageColors = {
  qc: { bg: 'bg-amber-50/70', border: 'border-amber-200/70', text: 'text-amber-700', bar: 'bg-amber-400', icon: ShieldCheck },
  labeling: { bg: 'bg-violet-50/70', border: 'border-violet-200/70', text: 'text-violet-700', bar: 'bg-violet-400', icon: Package },
  final_qc: { bg: 'bg-emerald-50/70', border: 'border-emerald-200/70', text: 'text-emerald-700', bar: 'bg-emerald-400', icon: ShieldCheck },
};

function StageNode({ name, type, data, total, isLast, vertical }) {
  const cfg = stageColors[type] || stageColors.qc;
  const pending = data?.pending || 0;
  const passed = data?.passed || 0;
  const rejected = data?.rejected || 0;
  const inStage = pending + passed;
  const pct = total > 0 ? Math.round((inStage / total) * 100) : 0;

  return (
    <>
      <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3 ${vertical ? 'w-full' : 'flex-1 min-w-[110px]'} transition-all hover:shadow-md`}>
        <div className="flex items-center gap-1.5 mb-2">
          <cfg.icon className={`w-3 h-3 ${cfg.text}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.text} truncate`}>{name}</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-black tabular-nums text-slate-800">{inStage}</span>
            <span className="text-[9px] text-slate-400">crates</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${cfg.bar} transition-all duration-500`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px]">
            {pending > 0 && <span className="text-amber-600">Pending: {pending}</span>}
            {passed > 0 && <span className="text-emerald-600">Passed: {passed}</span>}
            {rejected > 0 && <span className="text-red-500">Rej: {rejected}</span>}
          </div>
        </div>
      </div>
      {!isLast && (
        vertical
          ? <ArrowDown className="w-4 h-4 text-slate-300 mx-auto my-1 flex-shrink-0" />
          : <ArrowRight className="w-4 h-4 text-slate-300 mx-1 flex-shrink-0" />
      )}
    </>
  );
}

function SKUPipeline({ sku }) {
  const stages = sku.stage_order || [];
  const total = sku.total_crates || 1;
  const navigate = useNavigate();

  const navToFiltered = (stage) => {
    const params = new URLSearchParams();
    params.set('sku_id', sku.sku_id);
    if (stage) params.set('stage', stage);
    navigate(`/production-batches?${params.toString()}`);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:shadow-md transition-shadow" data-testid={`sku-pipeline-${sku.sku_id}`}>
      {/* SKU Header */}
      <div className="flex items-start sm:items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Droplets className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-slate-800 truncate">{sku.sku_name}</h3>
            <p className="text-[10px] sm:text-xs text-slate-400">
              {sku.batch_count} batch{sku.batch_count !== 1 ? 'es' : ''} &middot; {sku.total_crates.toLocaleString()} crates
              {sku.rejection_cost > 0 && <span className="ml-1.5 text-rose-500 font-semibold">&middot; {inr(sku.rejection_cost)} loss</span>}
            </p>
          </div>
        </div>
        <button onClick={() => navToFiltered('')}
          className="text-[10px] sm:text-xs text-primary hover:underline flex items-center gap-0.5 flex-shrink-0 whitespace-nowrap" data-testid={`view-batches-${sku.sku_id}`}>
          View <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Desktop: Horizontal Pipeline */}
      <div className="hidden md:flex items-stretch gap-0">
        {/* Unallocated */}
        <div className="flex items-center gap-0 flex-1 min-w-0">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex-1 min-w-[110px] cursor-pointer hover:shadow-md transition-shadow" onClick={() => navToFiltered('unallocated')}>
            <div className="flex items-center gap-1.5 mb-2">
              <Boxes className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unallocated</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-lg font-black tabular-nums text-slate-800">{sku.unallocated_crates}</span>
              <span className="text-[9px] text-slate-400">crates</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
              <div className="h-full rounded-full bg-slate-400 transition-all duration-500"
                style={{ width: `${total > 0 ? Math.round((sku.unallocated_crates / total) * 100) : 0}%` }} />
            </div>
          </div>
          {stages.length > 0 && <ArrowRight className="w-4 h-4 text-slate-300 mx-1 flex-shrink-0" />}
        </div>
        {stages.map((stage, i) => (
          <div key={stage.id} className="flex items-center gap-0 flex-1 min-w-0">
            <StageNode name={stage.name} type={stage.type} data={sku.stages[stage.name]} total={total} isLast={i === stages.length - 1} />
          </div>
        ))}
        <ArrowRight className="w-4 h-4 text-slate-300 mx-1 flex-shrink-0" />
        <div className="rounded-xl border border-teal-200/70 bg-teal-50/70 p-3 flex-1 min-w-[110px] cursor-pointer hover:shadow-md transition-shadow" onClick={() => navToFiltered('warehouse_ready')}>
          <div className="flex items-center gap-1.5 mb-2">
            <Truck className="w-3 h-3 text-teal-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600">Wh. Ready</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-black tabular-nums text-teal-700">{(sku.total_passed_final || 0) - (sku.transferred_to_warehouse || 0)}</span>
            <span className="text-[9px] text-teal-400">bottles</span>
          </div>
          <div className="h-1.5 bg-teal-100 rounded-full overflow-hidden mt-1">
            <div className="h-full rounded-full bg-teal-500 transition-all duration-500"
              style={{ width: `${total > 0 ? Math.round((((sku.total_passed_final || 0) - (sku.transferred_to_warehouse || 0)) / total) * 100) : 0}%` }} />
          </div>
        </div>

        <ArrowRight className="w-4 h-4 text-indigo-300 flex-shrink-0 hidden lg:block mx-1" />

        {/* Transferred to Warehouse */}
        <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/70 p-3 flex-1 min-w-[110px] cursor-pointer hover:shadow-md transition-shadow" onClick={() => navToFiltered('transferred')}>
          <div className="flex items-center gap-1.5 mb-2">
            <Factory className="w-3 h-3 text-indigo-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Transferred</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-black tabular-nums text-indigo-700">{sku.transferred_to_warehouse || 0}</span>
            <span className="text-[9px] text-indigo-400">bottles</span>
          </div>
          <div className="h-1.5 bg-indigo-100 rounded-full overflow-hidden mt-1">
            <div className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${total > 0 ? Math.round(((sku.transferred_to_warehouse || 0) / total) * 100) : 0}%` }} />
          </div>
        </div>
      </div>

      {/* Mobile: Vertical Pipeline */}
      <div className="flex md:hidden flex-col items-stretch gap-0">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 w-full">
          <div className="flex items-center gap-1.5 mb-2">
            <Boxes className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unallocated</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-black tabular-nums text-slate-800">{sku.unallocated_crates}</span>
            <span className="text-[9px] text-slate-400">crates</span>
          </div>
        </div>
        {stages.length > 0 && <ArrowDown className="w-4 h-4 text-slate-300 mx-auto my-1" />}
        {stages.map((stage, i) => (
          <StageNode key={stage.id} name={stage.name} type={stage.type} data={sku.stages[stage.name]} total={total} isLast={i === stages.length - 1} vertical />
        ))}
        <ArrowDown className="w-4 h-4 text-slate-300 mx-auto my-1" />
        <div className="rounded-xl border border-teal-200/70 bg-teal-50/70 p-3 w-full">
          <div className="flex items-center gap-1.5 mb-2">
            <Truck className="w-3 h-3 text-teal-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600">Warehouse Ready</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-black tabular-nums text-teal-700">{sku.total_passed_final}</span>
            <span className="text-[9px] text-teal-400">crates</span>
          </div>
        </div>
      </div>

      {sku.total_rejected > 0 && (
        <div className="mt-3 flex items-center gap-2 px-1">
          <AlertTriangle className="w-3 h-3 text-rose-400 flex-shrink-0" />
          <span className="text-[10px] text-rose-500 font-medium">
            {sku.total_rejected} bottles rejected
            {sku.rejection_cost > 0 && <span className="ml-1 text-rose-600 font-semibold">&middot; {inr(sku.rejection_cost)}</span>}
          </span>
        </div>
      )}
    </div>
  );
}

// Compact horizontal bar list — used for "By Reason" / "By Stage" rejection-cost breakdowns.
// Calmer tones — single rose accent across all bars (matches GOP aesthetic).
function RejectionBreakdown({ title, items, icon: Icon, accent = 'rose' }) {
  const top = (items || []).slice(0, 5);
  const max = top.length ? Math.max(...top.map((i) => i.cost || 0)) : 0;
  const a = ACCENTS[accent] || ACCENTS.rose;
  if (!top.length) return null;
  return (
    <div className={`relative rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-gradient-to-br ${a.grad} p-4 sm:p-5 overflow-hidden`}>
      <div className={`absolute -top-6 -right-6 h-24 w-24 rounded-full ${a.halo} blur-2xl opacity-40`} />
      <div className="flex items-center gap-2 mb-4 relative">
        <div className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center ${a.icon}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h4>
      </div>
      <div className="space-y-2.5 relative">
        {top.map((it) => {
          const label = it.reason || it.stage || it.sku_name || '—';
          const pct = max > 0 ? Math.round(((it.cost || 0) / max) * 100) : 0;
          return (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-slate-700 dark:text-slate-200 truncate" title={label}>{label}</span>
                <span className="tabular-nums font-semibold text-slate-900 dark:text-white">{inr(it.cost)}</span>
              </div>
              <div className="h-1.5 bg-slate-200/60 dark:bg-slate-700/60 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${a.icon.split(' ').find((c) => c.startsWith('bg-'))?.replace('/10', '') || 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeading({ icon: Icon, title, hint, accent = 'slate' }) {
  const a = ACCENTS[accent] || ACCENTS.slate;
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center ${a.icon}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">{title}</h2>
        {hint && <span className="text-[11px] text-muted-foreground hidden sm:inline">· {hint}</span>}
      </div>
    </div>
  );
}

export default function ProductionDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [timeFilter, setTimeFilter] = useState(() => localStorage.getItem('production_dashboard_tf') || 'this_month');

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/production/dashboard`, {
        headers: getAuthHeaders(),
        params: { time_filter: timeFilter },
      });
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load production dashboard');
    } finally {
      setLoading(false);
    }
  }, [timeFilter]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const onChangeTimeFilter = (val) => {
    setTimeFilter(val);
    localStorage.setItem('production_dashboard_tf', val);
  };

  const summary = data?.summary || {};
  const skus = data?.skus || [];
  const breakdown = data?.rejection_breakdown || {};
  const activeLabel = TIME_FILTERS.find((t) => t.value === timeFilter)?.label || 'This Month';

  // Computed KPIs
  const totalBottles = skus.reduce((acc, s) => acc + (s.total_bottles || 0), 0);
  const rejRatePct = totalBottles > 0 ? ((summary.total_rejected || 0) / totalBottles) * 100 : 0;
  const inQc = (summary.total_crates || 0) - (summary.unallocated_crates || 0) - (summary.ready_for_warehouse || 0);
  const topSku = breakdown.top_skus && breakdown.top_skus[0];
  const showCostBreakdown = (summary.total_rejection_cost || 0) > 0;

  return (
    <div className="space-y-6 sm:space-y-7" data-testid="production-dashboard">
      {/* ── Header + Time Filter ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow-sm">
              <Factory className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight">Production Overview</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 ml-13 mt-1">
            Stock at every stage by SKU
            <span className="mx-2 text-slate-300">·</span>
            <span className="text-slate-600 dark:text-slate-300">Window: <span className="font-semibold">{activeLabel}</span></span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground hidden sm:block">Time Period</label>
          <select
            value={timeFilter}
            onChange={(e) => onChangeTimeFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-w-[160px] shadow-sm"
            data-testid="production-dashboard-time-filter"
          >
            {TIME_FILTERS.map((tf) => <option key={tf.value} value={tf.value}>{tf.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[40vh]">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* ── Section 1: STOCK FLOW (4 hero tiles) ──────────────────── */}
          <section>
            <SectionHeading icon={Activity} title="Stock Flow" hint="Crates in motion across the factory" accent="sky" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <HeroTile
                label="Total Crates"
                value={num(summary.total_crates)}
                sub={`${num(summary.total_batches)} batches · ${num(summary.active_batches)} active`}
                icon={Boxes}
                accent="sky"
                onClick={() => navigate('/production-batches')}
                dataTestId="summary-total-crates"
              />
              <HeroTile
                label="Unallocated"
                value={num(summary.unallocated_crates)}
                sub="crates awaiting QC"
                icon={Boxes}
                accent="slate"
                onClick={() => navigate('/production-batches?stage=unallocated')}
                dataTestId="summary-unallocated"
              />
              <HeroTile
                label="In QC Stages"
                value={num(inQc)}
                sub="crates being inspected"
                icon={ShieldCheck}
                accent="amber"
                onClick={() => navigate('/production-batches?stage=in_qc')}
                dataTestId="summary-in-qc-stages"
              />
              <HeroTile
                label="Warehouse Ready"
                value={num(summary.ready_for_warehouse)}
                sub={`${num(summary.transferred_to_warehouse)} bottles transferred`}
                icon={Truck}
                accent="emerald"
                onClick={() => navigate('/production-batches?stage=warehouse_ready')}
                dataTestId="summary-warehouse-ready"
              />
            </div>
          </section>

          {/* ── Section 2: QUALITY & COST IMPACT (4 hero tiles) ───────── */}
          <section>
            <SectionHeading icon={AlertTriangle} title="Quality & Cost Impact" hint="Rejections and the rupee cost they carry" accent="rose" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <HeroTile
                label="Rejected Bottles"
                value={num(summary.total_rejected)}
                sub={`${rejRatePct.toFixed(2)}% of produced`}
                icon={AlertTriangle}
                accent="rose"
                onClick={() => navigate('/rejection-report')}
                dataTestId="summary-rejected"
              />
              <HeroTile
                label="Rejection Cost"
                value={inr(summary.total_rejection_cost)}
                sub={`${num(summary.rejection_events)} rejection events`}
                icon={IndianRupee}
                accent="rose"
                onClick={() => navigate('/rejection-report')}
                dataTestId="summary-rejection-cost"
              />
              <HeroTile
                label="Unmapped Events"
                value={num(summary.rejection_unmapped)}
                sub={(summary.rejection_unmapped || 0) > 0 ? 'Configure mappings →' : 'All events mapped'}
                icon={Sparkles}
                accent="amber"
                onClick={() => navigate('/production/rejection-cost-config')}
                dataTestId="summary-unmapped-events"
              />
              <HeroTile
                label="Top Costly SKU"
                value={topSku ? topSku.sku_name : '—'}
                sub={topSku ? inr(topSku.rejection_cost) : 'No rejection cost recorded'}
                icon={Tags}
                accent="indigo"
                dataTestId="summary-top-costly-sku"
              />
            </div>
          </section>

          {/* ── Section 3: AT-A-GLANCE — secondary mini stats ─────────── */}
          <section>
            <SectionHeading icon={Layers} title="At a Glance" accent="slate" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
              <MiniStat label="SKUs" value={num(summary.total_skus)} accent="indigo" dataTestId="mini-skus" />
              <MiniStat label="Batches" value={num(summary.total_batches)} sub={`${num(summary.active_batches)} active`} accent="sky" onClick={() => navigate('/production-batches')} dataTestId="mini-batches" />
              <MiniStat label="Total Bottles" value={num(totalBottles)} accent="slate" dataTestId="mini-total-bottles" />
              <MiniStat label="Transferred" value={num(summary.transferred_to_warehouse)} sub="bottles" accent="violet" onClick={() => navigate('/production-batches?stage=transferred')} dataTestId="mini-transferred" />
              <MiniStat label="Rejection Rate" value={`${rejRatePct.toFixed(2)}%`} sub="rejected / produced" accent="rose" dataTestId="mini-rejection-rate" />
            </div>
          </section>

          {/* ── Section 4: REJECTION COST BREAKDOWN ───────────────────── */}
          {showCostBreakdown && (
            <section>
              <SectionHeading icon={IndianRupee} title="Rejection Cost Breakdown" hint="Top 5 contributors per dimension" accent="rose" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                <RejectionBreakdown title="By Reason"  items={breakdown.by_reason} icon={AlertTriangle} accent="rose" />
                <RejectionBreakdown title="By Stage"   items={breakdown.by_stage}  icon={Layers}        accent="amber" />
                <RejectionBreakdown title="Top SKUs"   items={(breakdown.top_skus || []).map((s) => ({ ...s, cost: s.rejection_cost }))} icon={Tags} accent="indigo" />
              </div>
            </section>
          )}

          {/* ── Section 5: SKU PIPELINES ──────────────────────────────── */}
          <section>
            <SectionHeading icon={Droplets} title="SKU Pipelines" hint={`${skus.length} ${skus.length === 1 ? 'SKU' : 'SKUs'} in the selected window`} accent="slate" />
            {skus.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center">
                <Factory className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No production batches in this window</p>
                <p className="text-xs text-slate-400 mt-1">Try a wider time period or create a new batch</p>
                <button onClick={() => navigate('/production-batches')}
                  className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
                  data-testid="go-to-batches-btn">
                  Go to Production Batches
                </button>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {skus.map((sku) => (
                  <SKUPipeline key={sku.sku_id} sku={sku} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
