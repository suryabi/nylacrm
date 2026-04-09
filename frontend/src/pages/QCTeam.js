import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, Users, X, Check } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('session_token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

export default function QCTeam() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', role: '' });
  const [saving, setSaving] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/production/qc-team`, { headers: getAuthHeaders() });
      setMembers(data);
    } catch {
      toast.error('Failed to load QC team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${API_URL}/production/qc-team/${editing}`, form, { headers: getAuthHeaders() });
        toast.success('Member updated');
      } else {
        await axios.post(`${API_URL}/production/qc-team`, form, { headers: getAuthHeaders() });
        toast.success('Member added');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', role: '' });
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this QC team member?')) return;
    try {
      await axios.delete(`${API_URL}/production/qc-team/${id}`, { headers: getAuthHeaders() });
      toast.success('Member deleted');
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete');
    }
  };

  const openEdit = (m) => {
    setEditing(m.id);
    setForm({ name: m.name, role: m.role || '' });
    setShowForm(true);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto space-y-6" data-testid="qc-team-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">QC Team</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage QC inspection team members</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', role: '' }); }}
          className="px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1.5"
          data-testid="add-member-btn">
          <Plus size={14} /> Add Member
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-800">{editing ? 'Edit' : 'New'} QC Team Member</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Ravi Kumar" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="member-name-input" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Role</label>
              <input value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                placeholder="e.g. QC Inspector, QC Lead" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="member-role-input" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
              data-testid="member-save-btn">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {editing ? 'Update' : 'Save'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); }}
              className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg flex items-center gap-1.5">
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <Users className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-amber-700 font-medium">No QC team members configured</p>
          <p className="text-xs text-amber-600 mt-1">Add team members who perform quality inspections</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Role</th>
                <th className="text-right px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors" data-testid={`member-row-${m.id}`}>
                  <td className="px-5 py-3 font-medium text-slate-800">{m.name}</td>
                  <td className="px-5 py-3 text-slate-500">{m.role || '-'}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-slate-100 rounded-lg" data-testid={`edit-member-${m.id}`}>
                        <Pencil size={13} className="text-slate-400" />
                      </button>
                      <button onClick={() => handleDelete(m.id)} className="p-1.5 hover:bg-red-50 rounded-lg" data-testid={`delete-member-${m.id}`}>
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
