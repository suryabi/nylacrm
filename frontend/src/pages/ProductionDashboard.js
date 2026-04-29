import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Factory, Package, Boxes, Truck, AlertTriangle, ShieldCheck,
  Loader2, ArrowRight, ArrowDown, ChevronRight, Droplets,
  IndianRupee, Tags, Layers,
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

const stageColors = {
  qc: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', bar: 'bg-amber-400', icon: ShieldCheck },
  labeling: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', bar: 'bg-violet-400', icon: Package },
  final_qc: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', bar: 'bg-emerald-400', icon: ShieldCheck },
};

// Subtle, compact tile inspired by the GOP Coverage card — soft surface, tinted icon dot,
// eyebrow label, tabular number. Each tile accepts an accent color for the icon halo.
function SummaryCard({ label, value, icon: Icon, accent = 'slate', sub, onClick }) {
  const accents = {
    slate:   { ring: 'bg-slate-500/10',   icon: 'text-slate-500',   value: 'text-slate-900 dark:text-white' },
    amber:   { ring: 'bg-amber-500/10',   icon: 'text-amber-600',   value: 'text-amber-700 dark:text-amber-400' },
    emerald: { ring: 'bg-emerald-500/10', icon: 'text-emerald-600', value: 'text-emerald-700 dark:text-emerald-400' },
    indigo:  { ring: 'bg-indigo-500/10',  icon: 'text-indigo-600',  value: 'text-indigo-700 dark:text-indigo-400' },
    rose:    { ring: 'bg-rose-500/10',    icon: 'text-rose-600',    value: 'text-rose-600 dark:text-rose-400' },
    teal:    { ring: 'bg-teal-500/10',    icon: 'text-teal-600',    value: 'text-teal-700 dark:text-teal-400' },
  };
  const a = accents[accent] || accents.slate;
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm transition-all ${onClick ? 'cursor-pointer hover:bg-white dark:hover:bg-slate-900/70 hover:border-slate-300 dark:hover:border-slate-600' : ''}`}
      onClick={onClick}
      data-testid={`summary-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className={`shrink-0 h-9 w-9 rounded-lg flex items-center justify-center ${a.ring}`}>
        <Icon className={`h-4 w-4 ${a.icon}`} />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <p className={`text-lg sm:text-xl font-semibold tabular-nums ${a.value}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

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
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:shadow-lg transition-shadow" data-testid={`sku-pipeline-${sku.sku_id}`}>
      {/* SKU Header */}
      <div className="flex items-start sm:items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0">
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
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex-1 min-w-[110px] cursor-pointer hover:shadow-md transition-shadow" onClick={() => navToFiltered('unallocated')}>
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
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 flex-1 min-w-[110px] cursor-pointer hover:shadow-md transition-shadow" onClick={() => navToFiltered('warehouse_ready')}>
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

        <ArrowRight className="w-4 h-4 text-indigo-300 flex-shrink-0 hidden lg:block" />

        {/* Transferred to Warehouse */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 flex-1 min-w-[110px] cursor-pointer hover:shadow-md transition-shadow" onClick={() => navToFiltered('transferred')}>
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
        {/* Unallocated */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 w-full">
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
        {stages.length > 0 && <ArrowDown className="w-4 h-4 text-slate-300 mx-auto my-1" />}
        {stages.map((stage, i) => (
          <StageNode key={stage.id} name={stage.name} type={stage.type} data={sku.stages[stage.name]} total={total} isLast={i === stages.length - 1} vertical />
        ))}
        <ArrowDown className="w-4 h-4 text-slate-300 mx-auto my-1" />
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 w-full">
          <div className="flex items-center gap-1.5 mb-2">
            <Truck className="w-3 h-3 text-teal-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600">Warehouse Ready</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-lg font-black tabular-nums text-teal-700">{sku.total_passed_final}</span>
            <span className="text-[9px] text-teal-400">crates</span>
          </div>
          <div className="h-1.5 bg-teal-100 rounded-full overflow-hidden mt-1">
            <div className="h-full rounded-full bg-teal-500 transition-all duration-500"
              style={{ width: `${total > 0 ? Math.round((sku.total_passed_final / total) * 100) : 0}%` }} />
          </div>
        </div>
      </div>

      {sku.total_rejected > 0 && (
        <div className="mt-3 flex items-center gap-2 px-1">
          <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />
          <span className="text-[10px] text-red-500 font-medium">
            {sku.total_rejected} bottles rejected
            {sku.rejection_cost > 0 && <span className="ml-1 text-rose-600 font-semibold">&middot; {inr(sku.rejection_cost)}</span>}
          </span>
        </div>
      )}
    </div>
  );
}

// Compact horizontal bar list — used for "By Reason" / "By Stage" rejection-cost breakdowns.
function RejectionBreakdown({ title, items, icon: Icon, accentText, accentBar }) {
  const top = (items || []).slice(0, 5);
  const max = top.length ? Math.max(...top.map((i) => i.cost || 0)) : 0;
  if (!top.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${accentText}`} />
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h4>
      </div>
      <div className="space-y-2">
        {top.map((it) => {
          const label = it.reason || it.stage || it.sku_name || '—';
          const pct = max > 0 ? Math.round(((it.cost || 0) / max) * 100) : 0;
          return (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-700 truncate" title={label}>{label}</span>
                <span className={`tabular-nums font-semibold ${accentText}`}>{inr(it.cost)}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${accentBar} rounded-full`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
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

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="production-dashboard">
      {/* Header + Time Filter */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <Factory className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700" />
            <h1 className="text-xl sm:text-2xl font-black text-slate-800">Production Overview</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 ml-8 sm:ml-10">
            Stock at every stage by SKU &middot; Window: <span className="font-semibold text-slate-600">{activeLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 ml-8 sm:ml-0">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden sm:block">Time Period</label>
          <select
            value={timeFilter}
            onChange={(e) => onChangeTimeFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-w-[160px]"
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
          {/* Summary Cards — compact, GOP-style */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3">
            <SummaryCard label="SKUs" value={summary.total_skus || 0} icon={Package} accent="slate" />
            <SummaryCard label="Batches" value={summary.total_batches || 0} icon={Boxes} accent="slate" sub={`${summary.active_batches || 0} active`}
              onClick={() => navigate('/production-batches')} />
            <SummaryCard label="Total Crates" value={summary.total_crates || 0} icon={Boxes} accent="slate"
              onClick={() => navigate('/production-batches')} />
            <SummaryCard label="Unallocated" value={summary.unallocated_crates || 0} icon={Boxes} accent="slate"
              onClick={() => navigate('/production-batches?stage=unallocated')} />
            <SummaryCard label="In QC Stages" value={(summary.total_crates || 0) - (summary.unallocated_crates || 0) - (summary.ready_for_warehouse || 0)} icon={ShieldCheck} accent="amber"
              onClick={() => navigate('/production-batches?stage=in_qc')} />
            <SummaryCard label="Warehouse Ready" value={summary.ready_for_warehouse || 0} icon={Truck} accent="teal" sub="bottles"
              onClick={() => navigate('/production-batches?stage=warehouse_ready')} />
            <SummaryCard label="Transferred" value={summary.transferred_to_warehouse || 0} icon={Factory} accent="indigo" sub="bottles"
              onClick={() => navigate('/production-batches?stage=transferred')} />
            <SummaryCard label="Rejected" value={summary.total_rejected || 0} icon={AlertTriangle} accent="rose" sub="bottles"
              onClick={() => navigate('/rejection-report')} />
          </div>

          {/* Rejection Cost Metrics — second row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <SummaryCard
              label="Rejection Cost"
              value={inr(summary.total_rejection_cost || 0)}
              icon={IndianRupee}
              accent="rose"
              sub={`${summary.rejection_events || 0} events`}
              onClick={() => navigate('/rejection-report')}
            />
            <SummaryCard
              label="Unmapped Events"
              value={summary.rejection_unmapped || 0}
              icon={AlertTriangle}
              accent="amber"
              sub={summary.rejection_unmapped > 0 ? 'Configure mappings' : 'All mapped'}
              onClick={() => navigate('/production/rejection-cost-config')}
            />
            <SummaryCard
              label="Rejection Rate"
              value={(() => {
                const totalBottles = (summary.total_crates || 0) * 0; // placeholder; actual ratio per stage
                const rejected = summary.total_rejected || 0;
                if (!summary.total_crates) return '0%';
                // approximate rate: rejected bottles / total bottles
                // bottles_per_crate not in summary; approximate via skus
                let totalCapacity = 0;
                (skus || []).forEach((s) => { totalCapacity += (s.total_bottles || 0); });
                if (!totalCapacity) return '0%';
                return `${((rejected / totalCapacity) * 100).toFixed(2)}%`;
              })()}
              icon={ShieldCheck}
              accent="emerald"
              sub="rejected / produced"
            />
            <SummaryCard
              label="Top Costly SKU"
              value={(breakdown.top_skus && breakdown.top_skus[0]?.sku_name) || '—'}
              icon={Tags}
              accent="indigo"
              sub={breakdown.top_skus && breakdown.top_skus[0] ? inr(breakdown.top_skus[0].rejection_cost) : '—'}
            />
          </div>

          {/* Rejection Breakdown — compact bar lists (only when data exists) */}
          {(summary.total_rejection_cost || 0) > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
              <RejectionBreakdown
                title="Cost by Reason"
                items={breakdown.by_reason}
                icon={AlertTriangle}
                accentText="text-rose-600"
                accentBar="bg-rose-400"
              />
              <RejectionBreakdown
                title="Cost by Stage"
                items={breakdown.by_stage}
                icon={Layers}
                accentText="text-amber-600"
                accentBar="bg-amber-400"
              />
              <RejectionBreakdown
                title="Top SKUs"
                items={(breakdown.top_skus || []).map((s) => ({ ...s, cost: s.rejection_cost }))}
                icon={Tags}
                accentText="text-indigo-600"
                accentBar="bg-indigo-400"
              />
            </div>
          )}

          {/* SKU Pipelines */}
          {skus.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center">
              <Factory className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No production batches in the selected window</p>
              <p className="text-xs text-slate-400 mt-1">Try a wider time period or create a new batch</p>
              <button onClick={() => navigate('/production-batches')}
                className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
                data-testid="go-to-batches-btn">
                Go to Production Batches
              </button>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {skus.map(sku => (
                <SKUPipeline key={sku.sku_id} sku={sku} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
