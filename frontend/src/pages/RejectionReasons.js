import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, X, Check } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

export default function RejectionReasons() {
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  const fetchReasons = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/production/rejection-reasons`, { headers: getAuthHeaders() });
      setReasons(data);
    } catch {
      toast.error('Failed to load rejection reasons');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReasons(); }, [fetchReasons]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${API_URL}/production/rejection-reasons/${editing}`, form, { headers: getAuthHeaders() });
        toast.success('Reason updated');
      } else {
        await axios.post(`${API_URL}/production/rejection-reasons`, form, { headers: getAuthHeaders() });
        toast.success('Reason added');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', description: '' });
      fetchReasons();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this rejection reason?')) return;
    try {
      await axios.delete(`${API_URL}/production/rejection-reasons/${id}`, { headers: getAuthHeaders() });
      toast.success('Reason deleted');
      fetchReasons();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const openEdit = (r) => {
    setEditing(r.id);
    setForm({ name: r.name, description: r.description || '' });
    setShowForm(true);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto space-y-6" data-testid="rejection-reasons-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Rejection Reasons</h1>
          <p className="text-sm text-slate-500 mt-0.5">Master list of rejection reasons used during QC inspections</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', description: '' }); }}
          className="px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1.5"
          data-testid="add-reason-btn">
          <Plus size={14} /> Add Reason
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-800">{editing ? 'Edit' : 'New'} Rejection Reason</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Contamination" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="reason-name-input" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Description</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional description" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="reason-desc-input" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
              data-testid="reason-save-btn">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {editing ? 'Update' : 'Save'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); }}
              className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg flex items-center gap-1.5">
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {reasons.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-amber-700 font-medium">No rejection reasons configured</p>
          <p className="text-xs text-amber-600 mt-1">Add reasons so inspectors can select them during QC checks</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Description</th>
                <th className="text-right px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reasons.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors" data-testid={`reason-row-${r.id}`}>
                  <td className="px-5 py-3 font-medium text-slate-800">{r.name}</td>
                  <td className="px-5 py-3 text-slate-500">{r.description || '-'}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-slate-100 rounded-lg" data-testid={`edit-reason-${r.id}`}>
                        <Pencil size={13} className="text-slate-400" />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg" data-testid={`delete-reason-${r.id}`}>
                        <Trash2 size={13} className="text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
