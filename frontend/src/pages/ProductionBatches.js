import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Package, Plus, Search, Filter, ChevronDown, Loader2,
  Factory, Boxes, Calendar, FlaskConical, ArrowRight, X,
  ShieldCheck, Tag, Truck, AlertTriangle,
} from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

const STATUS_MAP = {
  created: { label: 'Created', color: 'bg-slate-100 text-slate-700' },
  in_qc: { label: 'In QC', color: 'bg-blue-100 text-blue-700' },
  in_labeling: { label: 'Labeling', color: 'bg-purple-100 text-purple-700' },
  in_final_qc: { label: 'Final QC', color: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
};

const STAGE_FILTERS = {
  unallocated: { label: 'Unallocated', color: 'bg-slate-100 text-slate-700', icon: Boxes },
  in_qc: { label: 'In QC Stages', color: 'bg-amber-100 text-amber-700', icon: ShieldCheck },
  warehouse_ready: { label: 'Warehouse Ready', color: 'bg-teal-100 text-teal-700', icon: Truck },
  transferred: { label: 'Transferred to Warehouse', color: 'bg-indigo-100 text-indigo-700', icon: Factory },
  rejected: { label: 'Has Rejections', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
};

export default function ProductionBatches() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [skus, setSkus] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [stageFilter, setStageFilter] = useState(searchParams.get('stage') || '');
  const [skuFilter, setSkuFilter] = useState(searchParams.get('sku_id') || '');
  const [showCreate, setShowCreate] = useState(false);

  // Sync filters to URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (statusFilter) params.set('status', statusFilter);
    if (stageFilter) params.set('stage', stageFilter);
    if (skuFilter) params.set('sku_id', skuFilter);
    setSearchParams(params, { replace: true });
  }, [search, statusFilter, stageFilter, skuFilter, setSearchParams]);

  const fetchData = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const [batchRes, skuRes, statsRes] = await Promise.allSettled([
        axios.get(`${API_URL}/production/batches`, { headers }),
        axios.get(`${API_URL}/master-skus`, { headers }),
        axios.get(`${API_URL}/production/stats`, { headers }),
      ]);
      if (batchRes.status === 'fulfilled') setBatches(batchRes.value.data);
      if (skuRes.status === 'fulfilled') {
        const skuList = skuRes.value.data.skus || skuRes.value.data;
        setSkus(Array.isArray(skuList) ? skuList.filter(s => s.is_active !== false) : []);
      }
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = batches.filter(b => {
    if (search && !b.batch_code?.toLowerCase().includes(search.toLowerCase()) && !b.sku_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && b.status !== statusFilter) return false;
    if (skuFilter && b.sku_id !== skuFilter) return false;
    if (stageFilter) {
      if (stageFilter === 'unallocated' && !(b.unallocated_crates > 0)) return false;
      if (stageFilter === 'in_qc') {
        const inStages = (b.qc_stages || []).some(s => {
          const bal = b.stage_balances?.[s.id] || {};
          return (bal.pending || 0) + (bal.passed || 0) > 0;
        });
        if (!inStages) return false;
      }
      if (stageFilter === 'warehouse_ready' && !(b.total_passed_final > 0)) return false;
      if (stageFilter === 'transferred' && !((b.transferred_to_warehouse || 0) > 0)) return false;
      if (stageFilter === 'rejected' && !(b.total_rejected > 0)) return false;
    }
    return true;
  });

  const clearFilters = () => {
    setStatusFilter('');
    setStageFilter('');
    setSkuFilter('');
    setSearch('');
  };

  const hasActiveFilter = statusFilter || stageFilter || skuFilter;

  // Get unique SKU list from batches for the filter dropdown
  const skuOptions = [...new Map(batches.map(b => [b.sku_id, { id: b.sku_id, name: b.sku_name }])).values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const activeSkuName = skuFilter ? (skuOptions.find(s => s.id === skuFilter)?.name || skuFilter) : '';

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6" data-testid="production-batches-page">
      <Breadcrumbs items={[
        { label: 'Production', href: '/production' },
        { label: 'Batches' },
      ]} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100">
            <Factory className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">Production Batches</h1>
            <p className="text-xs sm:text-sm text-slate-500">Create and manage production batches</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-1.5 sm:gap-2 transition-colors"
          data-testid="create-batch-btn"
        >
          <Plus size={14} /> New Batch
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {[
          { label: 'Total Batches', value: stats.total_batches || 0, icon: Package, color: 'text-slate-600' },
          { label: 'Active', value: stats.active_batches || 0, icon: FlaskConical, color: 'text-blue-600' },
          { label: 'Completed', value: stats.completed_batches || 0, icon: ShieldCheck, color: 'text-emerald-600' },
          { label: 'Total Crates', value: (stats.total_crates_produced || 0).toLocaleString(), icon: Boxes, color: 'text-purple-600' },
          { label: 'QC Routes', value: stats.qc_routes_configured || 0, icon: ArrowRight, color: 'text-amber-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <s.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${s.color} flex-shrink-0`} />
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider truncate">{s.label}</p>
              <p className="text-base sm:text-lg font-bold text-slate-800">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search batch code or SKU..."
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
            data-testid="batch-search"
          />
        </div>
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 outline-none flex-shrink-0"
          data-testid="batch-status-filter"
        >
          <option value="">All Status</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select
          value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 outline-none flex-shrink-0"
          data-testid="batch-stage-filter"
        >
          <option value="">All Stages</option>
          {Object.entries(STAGE_FILTERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select
          value={skuFilter} onChange={e => setSkuFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 outline-none flex-shrink-0 max-w-[200px]"
          data-testid="batch-sku-filter"
        >
          <option value="">All SKUs</option>
          {skuOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {hasActiveFilter && (
          <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" data-testid="clear-filters-btn">
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Active Filter Banner */}
      {hasActiveFilter && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2 rounded-lg border bg-slate-50 border-slate-200" data-testid="active-filter-banner">
          <Filter size={14} className="text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-500">Filters:</span>
          {skuFilter && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
              SKU: {activeSkuName}
              <button onClick={() => setSkuFilter('')} className="hover:text-blue-900"><X size={12} /></button>
            </span>
          )}
          {stageFilter && STAGE_FILTERS[stageFilter] && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${STAGE_FILTERS[stageFilter].color}`}>
              {React.createElement(STAGE_FILTERS[stageFilter].icon, { size: 12 })}
              {STAGE_FILTERS[stageFilter].label}
              <button onClick={() => setStageFilter('')}><X size={12} /></button>
            </span>
          )}
          {statusFilter && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
              Status: {STATUS_MAP[statusFilter]?.label || statusFilter}
              <button onClick={() => setStatusFilter('')}><X size={12} /></button>
            </span>
          )}
          <span className="text-xs text-slate-400 ml-1">({filtered.length} batches)</span>
          <button onClick={clearFilters} className="ml-auto text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
            <X size={12} /> Clear all
          </button>
        </div>
      )}

      {/* Batch List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
            <Factory className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 mb-1">No batches found</p>
            <p className="text-xs text-slate-400">Create your first production batch to get started</p>
          </div>
        ) : filtered.map(batch => {
          const st = STATUS_MAP[batch.status] || STATUS_MAP.created;
          const stageCount = batch.qc_stages?.length || 0;
          return (
            <div
              key={batch.id}
              onClick={() => navigate(`/production-batches/${batch.id}`)}
              className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
              data-testid={`batch-card-${batch.id}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{batch.batch_code}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1"><Tag size={11} /> {batch.sku_name}</span>
                      <span className="flex items-center gap-1"><Calendar size={11} /> {batch.production_date}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-6 ml-13 sm:ml-0">
                  {batch.ph_value && <PhBadge value={batch.ph_value} />}
                  <div className="text-center">
                    <p className="text-base sm:text-lg font-bold text-slate-800">{batch.total_crates?.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Crates</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base sm:text-lg font-bold text-slate-800">{batch.total_bottles?.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Bottles</p>
                  </div>
                  {stageCount > 0 && (
                    <div>
                      <p className="text-lg font-bold text-blue-600">{stageCount}</p>
                      <p className="text-[10px] text-slate-400 uppercase">QC Stages</p>
                    </div>
                  )}
                  <ChevronDown className="w-4 h-4 text-slate-300 -rotate-90" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Batch Modal */}
      {showCreate && (
        <CreateBatchModal
          skus={skus}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); fetchData(); }}
        />
      )}
    </div>
  );
}

function CreateBatchModal({ skus, onClose, onSuccess }) {
  const [form, setForm] = useState({
    sku_id: '', sku_name: '', batch_code: '', production_date: new Date().toISOString().split('T')[0],
    total_crates: '', bottles_per_crate: '', ph_value: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [hasQCRoute, setHasQCRoute] = useState(null);
  const [packagingTypes, setPackagingTypes] = useState([]);

  useEffect(() => {
    axios.get(`${API_URL}/packaging-types`, { headers: getAuthHeaders() })
      .then(res => setPackagingTypes(res.data.packaging_types || []))
      .catch(() => {});
  }, []);

  const checkQCRoute = async (skuId) => {
    try {
      await axios.get(`${API_URL}/production/qc-routes/by-sku/${skuId}`, { headers: getAuthHeaders() });
      setHasQCRoute(true);
    } catch {
      setHasQCRoute(false);
    }
  };

  const handleSKUChange = (skuId) => {
    const sku = skus.find(s => s.id === skuId);
    // Auto-fill default production packaging from SKU config
    const prodPkg = (sku?.packaging_config?.production || []);
    const defaultPkg = prodPkg.find(p => p.is_default) || prodPkg[0];
    const bpc = defaultPkg?.units_per_package || '';
    setForm(p => ({ ...p, sku_id: skuId, sku_name: sku?.sku_name || '', bottles_per_crate: bpc ? String(bpc) : '' }));
    if (skuId) checkQCRoute(skuId);
    else setHasQCRoute(null);
  };

  const handleSubmit = async () => {
    if (!form.sku_id) { toast.error('Select an SKU'); return; }
    if (!form.batch_code.trim()) { toast.error('Batch code is required'); return; }
    if (!form.total_crates || parseInt(form.total_crates) <= 0) { toast.error('Total crates must be > 0'); return; }
    if (!form.bottles_per_crate || parseInt(form.bottles_per_crate) <= 0) { toast.error('Select a packaging type'); return; }

    setSaving(true);
    try {
      await axios.post(`${API_URL}/production/batches`, {
        ...form,
        total_crates: parseInt(form.total_crates),
        bottles_per_crate: parseInt(form.bottles_per_crate),
        ph_value: form.ph_value ? parseFloat(form.ph_value) : null,
      }, { headers: getAuthHeaders() });
      toast.success('Batch created successfully');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create batch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Create Production Batch</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs text-slate-500 font-medium mb-1 block">SKU *</label>
            <select value={form.sku_id} onChange={e => handleSKUChange(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white" data-testid="batch-sku-select">
              <option value="">Select SKU</option>
              {skus.map(s => <option key={s.id} value={s.id}>{s.sku_name} ({s.category})</option>)}
            </select>
            {hasQCRoute === false && (
              <p className="mt-1 text-xs text-amber-600">No QC route configured for this SKU. Configure one in QC Routes.</p>
            )}
            {hasQCRoute === true && (
              <p className="mt-1 text-xs text-emerald-600">QC route configured for this SKU.</p>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium mb-1 block">Batch Code *</label>
            <input value={form.batch_code} onChange={e => setForm(p => ({ ...p, batch_code: e.target.value }))}
              placeholder="e.g. BATCH-2026-0408-A" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" data-testid="batch-code-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Production Date *</label>
              <input type="date" value={form.production_date} onChange={e => setForm(p => ({ ...p, production_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" data-testid="batch-date-input" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">pH Value</label>
              <select value={form.ph_value} onChange={e => setForm(p => ({ ...p, ph_value: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white" data-testid="batch-ph-select">
                <option value="">Select pH</option>
                <option value="7.5">7.5</option>
                <option value="8.5">8.5</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Total Crates *</label>
              <input type="number" value={form.total_crates} onChange={e => setForm(p => ({ ...p, total_crates: e.target.value }))}
                placeholder="500" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" data-testid="batch-crates-input" />
            </div>
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">Packaging Type *</label>
              {(() => {
                const selectedSku = skus.find(s => s.id === form.sku_id);
                const skuProdPkg = selectedSku?.packaging_config?.production || [];
                const options = skuProdPkg.length > 0 ? skuProdPkg : packagingTypes.map(pt => ({ packaging_type_name: pt.name, units_per_package: pt.units_per_package }));
                return (
                  <select value={form.bottles_per_crate}
                    onChange={e => setForm(p => ({ ...p, bottles_per_crate: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white" data-testid="batch-bpc-input">
                    <option value="">Select packaging</option>
                    {options.map((opt, i) => (
                      <option key={i} value={opt.units_per_package}>{opt.packaging_type_name} ({opt.units_per_package} units)</option>
                    ))}
                  </select>
                );
              })()}
            </div>
          </div>
          {form.total_crates && form.bottles_per_crate && (
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <span className="text-sm text-blue-700 font-medium">
                Total: {(parseInt(form.total_crates || 0) * parseInt(form.bottles_per_crate || 0)).toLocaleString()} bottles
              </span>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 font-medium mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2} placeholder="Optional notes..." className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-y" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
            data-testid="batch-submit-btn">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create Batch
          </button>
        </div>
      </div>
    </div>
  );
}


function PhBadge({ value }) {
  if (!value) return null;
  // pH 6-10 range visualization; 7.5 = slightly alkaline (teal), 8.5 = more alkaline (blue)
  const pct = ((value - 6) / 4) * 100; // 6-10 mapped to 0-100%
  const color = value <= 7.5 ? '#14b8a6' : '#3b82f6';
  const bg = value <= 7.5 ? 'bg-teal-50 border-teal-200' : 'bg-blue-50 border-blue-200';
  const text = value <= 7.5 ? 'text-teal-700' : 'text-blue-700';
  return (
    <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border ${bg}`} data-testid="ph-badge">
      <div className="flex flex-col items-center">
        <span className={`text-sm font-bold tabular-nums ${text}`}>{value}</span>
        <span className="text-[8px] text-slate-400 uppercase tracking-wider leading-none">pH</span>
      </div>
      <div className="w-16 h-2.5 rounded-full bg-gradient-to-r from-amber-400 via-teal-400 to-blue-500 relative overflow-hidden">
        <div
          className="absolute top-[-1px] w-3 h-3 rounded-full bg-white border-2 shadow-sm"
          style={{ left: `calc(${pct}% - 6px)`, borderColor: color }}
        />
      </div>
    </div>
  );
}

export { PhBadge };
