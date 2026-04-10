import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Package, Plus, Search, Filter, ChevronDown, Loader2,
  Factory, Boxes, Calendar, FlaskConical, ArrowRight, X,
  ShieldCheck, Tag,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('session_token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

const STATUS_MAP = {
  created: { label: 'Created', color: 'bg-slate-100 text-slate-700' },
  in_qc: { label: 'In QC', color: 'bg-blue-100 text-blue-700' },
  in_labeling: { label: 'Labeling', color: 'bg-purple-100 text-purple-700' },
  in_final_qc: { label: 'Final QC', color: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
};

export default function ProductionBatches() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [skus, setSkus] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

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
    return true;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6" data-testid="production-batches-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100">
            <Factory className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">Production Batches</h1>
            <p className="text-sm text-slate-500">Create and manage production batches</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
          data-testid="create-batch-btn"
        >
          <Plus size={16} /> New Batch
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Batches', value: stats.total_batches || 0, icon: Package, color: 'text-slate-600' },
          { label: 'Active', value: stats.active_batches || 0, icon: FlaskConical, color: 'text-blue-600' },
          { label: 'Completed', value: stats.completed_batches || 0, icon: ShieldCheck, color: 'text-emerald-600' },
          { label: 'Total Crates', value: (stats.total_crates_produced || 0).toLocaleString(), icon: Boxes, color: 'text-purple-600' },
          { label: 'QC Routes', value: stats.qc_routes_configured || 0, icon: ArrowRight, color: 'text-amber-600' },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <s.icon className={`w-5 h-5 ${s.color}`} />
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">{s.label}</p>
              <p className="text-lg font-bold text-slate-800">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
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
          className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
          data-testid="batch-status-filter"
        >
          <option value="">All Status</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

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
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
              data-testid={`batch-card-${batch.id}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 mb-0.5">
                      <span className="text-sm font-semibold text-slate-900">{batch.batch_code}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Tag size={11} /> {batch.sku_name}</span>
                      <span className="flex items-center gap-1"><Calendar size={11} /> {batch.production_date}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  {batch.ph_value && <PhBadge value={batch.ph_value} />}
                  <div>
                    <p className="text-lg font-bold text-slate-800">{batch.total_crates?.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Crates</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-800">{batch.total_bottles?.toLocaleString()}</p>
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
    setForm(p => ({ ...p, sku_id: skuId, sku_name: sku?.sku_name || '' }));
    if (skuId) checkQCRoute(skuId);
    else setHasQCRoute(null);
  };

  const handleSubmit = async () => {
    if (!form.sku_id) { toast.error('Select an SKU'); return; }
    if (!form.batch_code.trim()) { toast.error('Batch code is required'); return; }
    if (!form.total_crates || parseInt(form.total_crates) <= 0) { toast.error('Total crates must be > 0'); return; }
    if (!form.bottles_per_crate || parseInt(form.bottles_per_crate) <= 0) { toast.error('Bottles per crate must be > 0'); return; }

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
              <label className="text-xs text-slate-500 font-medium mb-1 block">Bottles per Crate *</label>
              <input type="number" value={form.bottles_per_crate} onChange={e => setForm(p => ({ ...p, bottles_per_crate: e.target.value }))}
                placeholder="48" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" data-testid="batch-bpc-input" />
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
