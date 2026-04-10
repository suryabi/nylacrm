import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Factory, Package, Boxes, Truck, AlertTriangle, ShieldCheck,
  Loader2, ArrowRight, ChevronRight, Droplets,
} from 'lucide-react';
import { PhBadge } from './ProductionBatches';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem('session_token')}`,
    'X-Tenant-ID': localStorage.getItem('tenant_id'),
  };
}

// Stage type → color config
const stageColors = {
  qc: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', bar: 'bg-amber-400', icon: ShieldCheck },
  labeling: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', bar: 'bg-violet-400', icon: Package },
  final_qc: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', bar: 'bg-emerald-400', icon: ShieldCheck },
};

function SummaryCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className={`rounded-xl border p-5 ${color}`} data-testid={`summary-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold opacity-60">{label}</span>
        <Icon className="w-4 h-4 opacity-40" />
      </div>
      <p className="text-2xl font-black tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs mt-1 opacity-50">{sub}</p>}
    </div>
  );
}

function StageNode({ name, type, data, total, isLast }) {
  const cfg = stageColors[type] || stageColors.qc;
  const pending = data?.pending || 0;
  const passed = data?.passed || 0;
  const rejected = data?.rejected || 0;
  const inStage = pending + passed;
  const pct = total > 0 ? Math.round((inStage / total) * 100) : 0;

  return (
    <div className="flex items-center gap-0 flex-1 min-w-0">
      <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3 flex-1 min-w-[120px] transition-all hover:shadow-md`}>
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
          <div className="flex gap-2 text-[9px]">
            {pending > 0 && <span className="text-amber-600">Pending: {pending}</span>}
            {passed > 0 && <span className="text-emerald-600">Passed: {passed}</span>}
            {rejected > 0 && <span className="text-red-500">Rej: {rejected}</span>}
          </div>
        </div>
      </div>
      {!isLast && <ArrowRight className="w-4 h-4 text-slate-300 mx-1 flex-shrink-0" />}
    </div>
  );
}

function SKUPipeline({ sku, onNavigate }) {
  const stages = sku.stage_order || [];
  const total = sku.total_crates || 1;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg transition-shadow" data-testid={`sku-pipeline-${sku.sku_id}`}>
      {/* SKU Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
            <Droplets className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">{sku.sku_name}</h3>
            <p className="text-xs text-slate-400">{sku.batch_count} batch{sku.batch_count !== 1 ? 'es' : ''} &middot; {sku.total_crates.toLocaleString()} total crates</p>
          </div>
        </div>
        <button onClick={onNavigate}
          className="text-xs text-primary hover:underline flex items-center gap-1" data-testid={`view-batches-${sku.sku_id}`}>
          View Batches <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Pipeline Flow */}
      <div className="flex items-stretch gap-0">
        {/* Unallocated Node */}
        <div className="flex items-center gap-0 flex-1 min-w-0">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex-1 min-w-[120px]">
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

        {/* QC Stage Nodes */}
        {stages.map((stage, i) => (
          <StageNode
            key={stage.id}
            name={stage.name}
            type={stage.type}
            data={sku.stages[stage.name]}
            total={total}
            isLast={i === stages.length - 1}
          />
        ))}

        {/* Ready for Warehouse */}
        <ArrowRight className="w-4 h-4 text-slate-300 mx-1 flex-shrink-0" />
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 flex-1 min-w-[120px]">
          <div className="flex items-center gap-1.5 mb-2">
            <Truck className="w-3 h-3 text-teal-600" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600">Ready for Warehouse</span>
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

      {/* Rejection bar at bottom */}
      {sku.total_rejected > 0 && (
        <div className="mt-3 flex items-center gap-2 px-1">
          <AlertTriangle className="w-3 h-3 text-red-400" />
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

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/production/dashboard`, { headers: getAuthHeaders() });
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load production dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const summary = data?.summary || {};
  const skus = data?.skus || [];

  return (
    <div className="space-y-6" data-testid="production-dashboard">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Factory className="w-7 h-7 text-slate-700" />
          <h1 className="text-2xl font-black text-slate-800">Production Overview</h1>
        </div>
        <p className="text-sm text-slate-400 ml-10">Factory stock at every stage, by SKU</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <SummaryCard label="SKUs" value={summary.total_skus} icon={Package} color="bg-white border-slate-200 text-slate-800" />
        <SummaryCard label="Batches" value={summary.total_batches} icon={Boxes} color="bg-white border-slate-200 text-slate-800" sub={`${summary.active_batches} active`} />
        <SummaryCard label="Total Crates" value={summary.total_crates} icon={Boxes} color="bg-white border-slate-200 text-slate-800" />
        <SummaryCard label="Unallocated" value={summary.unallocated_crates} icon={Boxes} color="bg-slate-50 border-slate-200 text-slate-600" />
        <SummaryCard label="In QC Stages" value={(summary.total_crates || 0) - (summary.unallocated_crates || 0) - (summary.ready_for_warehouse || 0)} icon={ShieldCheck} color="bg-amber-50 border-amber-200 text-amber-700" />
        <SummaryCard label="Ready for Warehouse" value={summary.ready_for_warehouse} icon={Truck} color="bg-teal-50 border-teal-200 text-teal-700" />
        <SummaryCard label="Rejected" value={summary.total_rejected} icon={AlertTriangle} color="bg-red-50 border-red-200 text-red-600" sub="bottles" />
      </div>

      {/* SKU Pipelines */}
      {skus.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Factory className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No production batches yet</p>
          <p className="text-xs text-slate-400 mt-1">Create your first batch to see the stock flow here</p>
          <button onClick={() => navigate('/production-batches')}
            className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
            data-testid="go-to-batches-btn">
            Go to Production Batches
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {skus.map(sku => (
            <SKUPipeline
              key={sku.sku_id}
              sku={sku}
              onNavigate={() => navigate('/production-batches')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
