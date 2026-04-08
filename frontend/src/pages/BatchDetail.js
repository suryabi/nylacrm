import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';
import {
  ArrowLeft, Package, Calendar, Factory, Boxes, Tag,
  Loader2, FlaskConical, Paintbrush, ShieldCheck, Edit2,
  Trash2, ArrowRight, CheckCircle2, XCircle,
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

const STAGE_TYPE_CONFIG = {
  qc: { icon: FlaskConical, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  labeling: { icon: Paintbrush, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  final_qc: { icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};

export default function BatchDetail() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBatch = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/production/batches/${batchId}`, { headers: getAuthHeaders() });
      setBatch(res.data);
    } catch {
      toast.error('Failed to load batch');
      navigate('/production-batches');
    } finally {
      setLoading(false);
    }
  }, [batchId, navigate]);

  useEffect(() => { fetchBatch(); }, [fetchBatch]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this batch? This action cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/production/batches/${batchId}`, { headers: getAuthHeaders() });
      toast.success('Batch deleted');
      navigate('/production-batches');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
    </div>
  );

  if (!batch) return null;

  const st = STATUS_MAP[batch.status] || STATUS_MAP.created;
  const stages = (batch.qc_stages || []).sort((a, b) => a.order - b.order);
  const balances = batch.stage_balances || {};

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6" data-testid="batch-detail-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production-batches')}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors" data-testid="back-btn">
          <ArrowLeft size={18} className="text-slate-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">{batch.batch_code}</h1>
            <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium ${st.color}`}>{st.label}</span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{batch.sku_name}</p>
        </div>
        <div className="flex items-center gap-2">
          {batch.status === 'created' && (
            <button onClick={handleDelete}
              className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1.5 transition-colors" data-testid="delete-batch-btn">
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Batch Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Production Date', value: batch.production_date, icon: Calendar },
          { label: 'Total Crates', value: batch.total_crates?.toLocaleString(), icon: Boxes },
          { label: 'Bottles/Crate', value: batch.bottles_per_crate, icon: Package },
          { label: 'Total Bottles', value: batch.total_bottles?.toLocaleString(), icon: Package },
          { label: 'Unallocated', value: batch.unallocated_crates?.toLocaleString(), icon: Boxes },
          { label: 'Production Line', value: batch.production_line || '-', icon: Factory },
        ].map((item, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <item.icon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">{item.label}</span>
            </div>
            <p className="text-lg font-bold text-slate-800">{item.value}</p>
          </div>
        ))}
      </div>

      {/* QC Stage Flow */}
      {stages.length > 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-5 flex items-center gap-2">
            <FlaskConical size={16} className="text-blue-500" /> QC Stage Flow
          </h2>
          {/* Visual Flow */}
          <div className="flex items-center gap-2 flex-wrap mb-6">
            <div className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-200">
              <p className="text-[10px] text-slate-400 uppercase">Production</p>
              <p className="text-sm font-bold text-slate-800">{batch.total_crates} crates</p>
            </div>
            {stages.map((stage) => {
              const config = STAGE_TYPE_CONFIG[stage.stage_type] || STAGE_TYPE_CONFIG.qc;
              const bal = balances[stage.id] || {};
              const Icon = config.icon;
              return (
                <React.Fragment key={stage.id}>
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                  <div className={`px-3 py-2 rounded-lg border ${config.bg} ${config.border}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={12} className={config.color} />
                      <p className="text-[10px] text-slate-500 uppercase">{stage.name}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div title="Received">
                        <p className="text-sm font-bold text-slate-800">{bal.received || 0}</p>
                        <p className="text-[8px] text-slate-400">RECV</p>
                      </div>
                      <div title="Passed">
                        <p className="text-sm font-bold text-emerald-600">{bal.passed || 0}</p>
                        <p className="text-[8px] text-emerald-500">PASS</p>
                      </div>
                      <div title="Rejected">
                        <p className="text-sm font-bold text-red-600">{bal.rejected || 0}</p>
                        <p className="text-[8px] text-red-500">REJ</p>
                      </div>
                      <div title="Pending">
                        <p className="text-sm font-bold text-amber-600">{bal.pending || 0}</p>
                        <p className="text-[8px] text-amber-500">PEND</p>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
              <p className="text-[10px] text-emerald-500 uppercase">Delivery Ready</p>
              <p className="text-sm font-bold text-emerald-700">{batch.total_passed_final || 0} crates</p>
            </div>
          </div>

          {/* Stage Detail Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-slate-400 uppercase border-b border-slate-100">
                  <th className="text-left py-2 px-3">Stage</th>
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-right py-2 px-3">Received</th>
                  <th className="text-right py-2 px-3">Passed</th>
                  <th className="text-right py-2 px-3">Rejected</th>
                  <th className="text-right py-2 px-3">Pending</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage) => {
                  const bal = balances[stage.id] || {};
                  const config = STAGE_TYPE_CONFIG[stage.stage_type] || STAGE_TYPE_CONFIG.qc;
                  return (
                    <tr key={stage.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-medium text-slate-800">{stage.name}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${config.color} ${config.bg}`}>
                          {stage.stage_type === 'qc' ? 'QC' : stage.stage_type === 'labeling' ? 'Label' : 'Final'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">{bal.received || 0}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-emerald-600">{bal.passed || 0}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-red-600">{bal.rejected || 0}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-amber-600">{bal.pending || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400 mb-0.5">Unallocated</p>
              <p className="text-lg font-bold text-slate-800">{batch.unallocated_crates || 0}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-xs text-red-400 mb-0.5">Total Rejected</p>
              <p className="text-lg font-bold text-red-600">{batch.total_rejected || 0}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <p className="text-xs text-emerald-400 mb-0.5">Delivery Ready</p>
              <p className="text-lg font-bold text-emerald-600">{batch.total_passed_final || 0}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
          <FlaskConical className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-amber-700 font-medium">No QC Route Configured</p>
          <p className="text-xs text-amber-600 mt-1">Configure a QC route for SKU "{batch.sku_name}" to start tracking quality control stages</p>
        </div>
      )}

      {/* Batch Notes */}
      {batch.notes && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-xs text-slate-400 uppercase tracking-wider mb-2">Notes</h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{batch.notes}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-slate-400 flex items-center gap-4">
        <span>Created by {batch.created_by_name}</span>
        <span>Created {new Date(batch.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
