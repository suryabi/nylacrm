import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Factory, Package, Boxes, Truck, AlertTriangle, ShieldCheck,
  Loader2, ArrowRight, ArrowDown, ChevronRight, Droplets, Calendar, IndianRupee,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const TIME_FILTERS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'lifetime', label: 'Lifetime' },
];

const fmtINR = (n) => {
  const num = Number(n) || 0;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  };
}

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

function SKUPipeline({ sku, onNavigate }) {
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
            <p className="text-[10px] sm:text-xs text-slate-400">{sku.batch_count} batch{sku.batch_count !== 1 ? 'es' : ''} &middot; {sku.total_crates.toLocaleString()} crates</p>
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
          <span className="text-[10px] text-red-500 font-medium">{sku.total_rejected} bottles rejected across all stages</span>
        </div>
      )}
    </div>
  );
}

export default function ProductionDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [timeFilter, setTimeFilter] = useState(() => localStorage.getItem('production_dashboard_time_filter') || 'this_month');

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

  useEffect(() => {
    localStorage.setItem('production_dashboard_time_filter', timeFilter);
    fetchDashboard();
  }, [fetchDashboard, timeFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const summary = data?.summary || {};
  const skus = data?.skus || [];
  const breakdown = data?.rejection_breakdown || { by_reason: [], by_stage: [], top_skus: [] };
  const hasRejectionCost = (summary.rejection_events || 0) > 0;

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="production-dashboard">
      {/* Header + Time Filter */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <Factory className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700" />
            <h1 className="text-xl sm:text-2xl font-black text-slate-800">Production Overview</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 ml-8 sm:ml-10">Factory stock at every stage, by SKU</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-end">
          <Calendar className="w-4 h-4 text-slate-500" />
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="h-9 w-[170px] rounded-xl bg-white border-slate-200" data-testid="time-filter">
              <SelectValue placeholder="This Month" />
            </SelectTrigger>
            <SelectContent className="rounded-xl max-h-72">
              {TIME_FILTERS.map(tf => (
                <SelectItem key={tf.value} value={tf.value} className="rounded-lg" data-testid={`time-filter-option-${tf.value}`}>{tf.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards — compact, GOP-style */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3">
        <SummaryCard label="SKUs" value={summary.total_skus} icon={Package} accent="slate" />
        <SummaryCard label="Batches" value={summary.total_batches} icon={Boxes} accent="slate" sub={`${summary.active_batches} active`}
          onClick={() => navigate('/production-batches')} />
        <SummaryCard label="Total Crates" value={summary.total_crates} icon={Boxes} accent="slate"
          onClick={() => navigate('/production-batches')} />
        <SummaryCard label="Unallocated" value={summary.unallocated_crates} icon={Boxes} accent="slate"
          onClick={() => navigate('/production-batches?stage=unallocated')} />
        <SummaryCard label="In QC Stages" value={(summary.total_crates || 0) - (summary.unallocated_crates || 0) - (summary.ready_for_warehouse || 0)} icon={ShieldCheck} accent="amber"
          onClick={() => navigate('/production-batches?stage=in_qc')} />
        <SummaryCard label="Warehouse Ready" value={summary.ready_for_warehouse} icon={Truck} accent="teal" sub="bottles"
          onClick={() => navigate('/production-batches?stage=warehouse_ready')} />
        <SummaryCard label="Transferred" value={summary.transferred_to_warehouse || 0} icon={Factory} accent="indigo" sub="bottles"
          onClick={() => navigate('/production-batches?stage=transferred')} />
        <SummaryCard label="Rejected" value={summary.total_rejected} icon={AlertTriangle} accent="rose" sub="bottles"
          onClick={() => navigate('/production-batches?stage=rejected')} />
      </div>

      {/* Rejection Cost Metrics — only when there are rejection events in range */}
      {hasRejectionCost && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5" data-testid="rejection-metrics-section">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm sm:text-base font-bold text-slate-800">Rejection Insights</h2>
              <span className="text-[10px] sm:text-xs text-slate-400">{TIME_FILTERS.find(t => t.value === timeFilter)?.label}</span>
            </div>
            <button onClick={() => navigate('/rejection-report')}
              className="text-[10px] sm:text-xs text-primary hover:underline flex items-center gap-0.5"
              data-testid="rejection-report-link">
              Full Report <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
            <SummaryCard label="Total Rejected" value={summary.total_rejected} icon={AlertTriangle} accent="rose" sub="bottles" />
            <SummaryCard label="Total Cost" value={fmtINR(summary.total_rejection_cost)} icon={IndianRupee} accent="rose" />
            <SummaryCard label="Events" value={summary.rejection_events} icon={Boxes} accent="slate" />
            <SummaryCard label="Unmapped" value={summary.rejection_unmapped} icon={AlertTriangle} accent="amber"
              sub={summary.rejection_unmapped > 0 ? 'configure cost mapping' : 'all mapped'}
              onClick={summary.rejection_unmapped > 0 ? () => navigate('/production/rejection-cost-config') : undefined} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            <BreakdownList title="By Reason" items={breakdown.by_reason} keyName="reason" testId="rejection-by-reason" />
            <BreakdownList title="By Stage" items={breakdown.by_stage} keyName="stage" testId="rejection-by-stage" />
            <TopSKUList items={breakdown.top_skus} testId="rejection-top-skus" />
          </div>
        </div>
      )}

      {/* SKU Pipelines */}
      {skus.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center">
          <Factory className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No production batches in this period</p>
          <p className="text-xs text-slate-400 mt-1">Try a wider time filter or create a new batch</p>
          <button onClick={() => navigate('/production-batches')}
            className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
            data-testid="go-to-batches-btn">
            Go to Production Batches
          </button>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {skus.map(sku => (
            <SKUPipeline key={sku.sku_id} sku={sku} onNavigate={() => navigate('/production-batches')} />
          ))}
        </div>
      )}
    </div>
  );
}

function BreakdownList({ title, items, keyName, testId }) {
  const max = Math.max(...(items.map(i => i.cost) || [0]), 1);
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3" data-testid={testId}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">No data</p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 5).map((it, idx) => (
            <li key={idx} className="space-y-0.5">
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-xs text-slate-700 truncate">{it[keyName] || '—'}</span>
                <span className="text-xs font-semibold tabular-nums text-rose-600 shrink-0">{fmtINR(it.cost)}</span>
              </div>
              <div className="h-1 bg-white rounded-full overflow-hidden">
                <div className="h-full bg-rose-400" style={{ width: `${Math.round((it.cost / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopSKUList({ items, testId }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3" data-testid={testId}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">Top Costly SKUs</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">No data</p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 5).map((it, idx) => (
            <li key={idx} className="flex justify-between items-baseline gap-2">
              <div className="min-w-0">
                <p className="text-xs text-slate-700 truncate">{it.sku_name}</p>
                <p className="text-[10px] text-slate-400">{it.total_rejected} bottles</p>
              </div>
              <span className="text-xs font-semibold tabular-nums text-rose-600 shrink-0">{fmtINR(it.rejection_cost)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
