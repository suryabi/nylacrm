import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';
import {
  ArrowRight, Plus, Loader2, X, GripVertical, Trash2,
  ShieldCheck, Tag as TagIcon, Settings, FlaskConical, Paintbrush,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('session_token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

const STAGE_TYPES = [
  { value: 'qc', label: 'QC Stage', icon: FlaskConical, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'labeling', label: 'Labeling', icon: Paintbrush, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'final_qc', label: 'Final QC', icon: ShieldCheck, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
];

export default function QCRouteConfig() {
  const [routes, setRoutes] = useState([]);
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRoute, setEditingRoute] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const [routeRes, skuRes] = await Promise.allSettled([
        axios.get(`${API_URL}/production/qc-routes`, { headers }),
        axios.get(`${API_URL}/master-skus`, { headers }),
      ]);
      if (routeRes.status === 'fulfilled') setRoutes(routeRes.value.data);
      if (skuRes.status === 'fulfilled') {
        const skuList = skuRes.value.data.skus || skuRes.value.data;
        setSkus(Array.isArray(skuList) ? skuList.filter(s => s.is_active !== false) : []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (routeId) => {
    if (!window.confirm('Delete this QC route?')) return;
    try {
      await axios.delete(`${API_URL}/production/qc-routes/${routeId}`, { headers: getAuthHeaders() });
      toast.success('QC route deleted');
      fetchData();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const assignedSkuIds = routes.map(r => r.sku_id);
  const availableSkus = skus.filter(s => !assignedSkuIds.includes(s.id));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6" data-testid="qc-routes-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100">
            <ArrowRight className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">QC Route Configuration</h1>
            <p className="text-sm text-slate-500">Define quality control flows for each SKU</p>
          </div>
        </div>
        <button
          onClick={() => { setEditingRoute(null); setShowForm(true); }}
          disabled={availableSkus.length === 0}
          className="px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          data-testid="add-qc-route-btn"
        >
          <Plus size={16} /> Add QC Route
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Settings className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">How QC Routes Work</p>
          <p className="text-blue-700 text-xs">Each SKU can have a different quality control flow. Define the stages stock must pass through from production to final delivery readiness. Stages can be QC checkpoints, labeling, or final QC.</p>
        </div>
      </div>

      {/* Routes List */}
      <div className="space-y-4">
        {routes.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
            <ArrowRight className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 mb-1">No QC routes configured</p>
            <p className="text-xs text-slate-400">Add a QC route to define quality control stages for your SKUs</p>
          </div>
        ) : routes.map(route => (
          <div key={route.id} className="bg-white border border-slate-200 rounded-xl p-5" data-testid={`qc-route-${route.id}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <TagIcon className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-900">{route.sku_name}</span>
                {!route.is_active && <span className="text-[10px] text-red-500 font-medium">INACTIVE</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditingRoute(route); setShowForm(true); }}
                  className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" data-testid={`edit-route-${route.id}`}>
                  Edit
                </button>
                <button onClick={() => handleDelete(route.id)}
                  className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors" data-testid={`delete-route-${route.id}`}>
                  Delete
                </button>
              </div>
            </div>
            {/* Stage Flow Visualization */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-medium text-slate-600 border border-slate-200">
                Production
              </div>
              {route.stages?.sort((a, b) => a.order - b.order).map((stage, i) => {
                const stConfig = STAGE_TYPES.find(t => t.value === stage.stage_type) || STAGE_TYPES[0];
                return (
                  <React.Fragment key={stage.id}>
                    <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                    <div className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${stConfig.color}`}>
                      {stage.name}
                    </div>
                  </React.Fragment>
                );
              })}
              <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
              <div className="px-3 py-1.5 rounded-lg bg-emerald-50 text-xs font-medium text-emerald-700 border border-emerald-200">
                Ready for Delivery
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Form Modal */}
      {showForm && (
        <QCRouteFormModal
          route={editingRoute}
          skus={editingRoute ? skus : availableSkus}
          onClose={() => { setShowForm(false); setEditingRoute(null); }}
          onSuccess={() => { setShowForm(false); setEditingRoute(null); fetchData(); }}
        />
      )}
    </div>
  );
}

function QCRouteFormModal({ route, skus, onClose, onSuccess }) {
  const isEdit = !!route;
  const [form, setForm] = useState({
    sku_id: route?.sku_id || '',
    sku_name: route?.sku_name || '',
    stages: route?.stages?.sort((a, b) => a.order - b.order) || [],
    is_active: route?.is_active !== false,
  });
  const [saving, setSaving] = useState(false);

  const addStage = (type) => {
    const count = form.stages.filter(s => s.stage_type === type).length;
    const config = STAGE_TYPES.find(t => t.value === type);
    const name = type === 'qc' ? `QC Stage ${count + 1}` : config?.label || type;
    setForm(p => ({
      ...p,
      stages: [...p.stages, { id: crypto.randomUUID(), name, stage_type: type, order: p.stages.length + 1, description: '' }],
    }));
  };

  const removeStage = (idx) => {
    setForm(p => ({
      ...p,
      stages: p.stages.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })),
    }));
  };

  const updateStage = (idx, field, value) => {
    setForm(p => ({
      ...p,
      stages: p.stages.map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }));
  };

  const handleSubmit = async () => {
    if (!isEdit && !form.sku_id) { toast.error('Select an SKU'); return; }
    if (form.stages.length === 0) { toast.error('Add at least one stage'); return; }

    setSaving(true);
    try {
      if (isEdit) {
        await axios.put(`${API_URL}/production/qc-routes/${route.id}`, {
          stages: form.stages,
          is_active: form.is_active,
        }, { headers: getAuthHeaders() });
        toast.success('QC route updated');
      } else {
        const sku = skus.find(s => s.id === form.sku_id);
        await axios.post(`${API_URL}/production/qc-routes`, {
          sku_id: form.sku_id,
          sku_name: sku?.sku_name || form.sku_name,
          stages: form.stages,
          is_active: form.is_active,
        }, { headers: getAuthHeaders() });
        toast.success('QC route created');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">{isEdit ? 'Edit QC Route' : 'Create QC Route'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {!isEdit && (
            <div>
              <label className="text-xs text-slate-500 font-medium mb-1 block">SKU *</label>
              <select value={form.sku_id} onChange={e => {
                const sku = skus.find(s => s.id === e.target.value);
                setForm(p => ({ ...p, sku_id: e.target.value, sku_name: sku?.sku_name || '' }));
              }} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white" data-testid="route-sku-select">
                <option value="">Select SKU</option>
                {skus.map(s => <option key={s.id} value={s.id}>{s.sku_name} ({s.category})</option>)}
              </select>
            </div>
          )}
          {isEdit && (
            <div className="bg-slate-50 rounded-lg p-3">
              <span className="text-xs text-slate-400 uppercase">SKU</span>
              <p className="text-sm font-medium text-slate-800">{route.sku_name}</p>
            </div>
          )}

          {/* Stages */}
          <div>
            <label className="text-xs text-slate-500 font-medium mb-2 block">Stages (in order)</label>
            <div className="space-y-2 mb-3">
              {form.stages.map((stage, i) => {
                const stConfig = STAGE_TYPES.find(t => t.value === stage.stage_type) || STAGE_TYPES[0];
                return (
                  <div key={stage.id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    <GripVertical className="w-4 h-4 text-slate-300 shrink-0" />
                    <span className="text-xs font-bold text-slate-400 w-5">{i + 1}</span>
                    <div className={`px-2 py-0.5 rounded text-[10px] font-medium border ${stConfig.color}`}>
                      {stConfig.label}
                    </div>
                    <input
                      value={stage.name}
                      onChange={e => updateStage(i, 'name', e.target.value)}
                      className="flex-1 border border-slate-200 rounded px-2 py-1.5 text-sm bg-white"
                      placeholder="Stage name"
                    />
                    <button onClick={() => removeStage(i)} className="text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              {form.stages.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-3">No stages added yet</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => addStage('qc')}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 flex items-center gap-1 transition-colors">
                <Plus size={12} /> QC Stage
              </button>
              <button onClick={() => addStage('labeling')}
                className="px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 flex items-center gap-1 transition-colors">
                <Plus size={12} /> Labeling
              </button>
              <button onClick={() => addStage('final_qc')}
                className="px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 flex items-center gap-1 transition-colors">
                <Plus size={12} /> Final QC
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
            data-testid="route-submit-btn">
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {isEdit ? 'Update Route' : 'Create Route'}
          </button>
        </div>
      </div>
    </div>
  );
}
