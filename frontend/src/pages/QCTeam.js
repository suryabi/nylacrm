import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, Users, X, Check, ScanFace, KeyRound, CircleCheck, AlertTriangle, Factory } from 'lucide-react';
import { FaceEnrollModal, PinModal } from '../components/qc/FaceEnrollModal';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

export default function QCTeam() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', role: '', designation: '', department: '', phone: '', employee_id: '', production_operator: false });
  const [saving, setSaving] = useState(false);
  const [faceMember, setFaceMember] = useState(null);
  const [pinMember, setPinMember] = useState(null);

  const fetchMembers = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/production/qc-team`, { headers: getAuthHeaders() });
      setMembers(data);
    } catch {
      toast.error('Failed to load factory staff');
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
      setForm({ name: '', role: '', designation: '', department: '', phone: '', employee_id: '', production_operator: false });
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this staff member?')) return;
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
    setForm({ name: m.name, role: m.role || '', designation: m.designation || '', department: m.department || '', phone: m.phone || '', employee_id: m.employee_id || '', production_operator: !!m.production_operator });
    setShowForm(true);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  const missingKiosk = members.filter(m => !m.has_face && !m.has_pin);

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto space-y-6" data-testid="qc-team-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Factory Staff</h1>
          <p className="text-sm text-slate-500 mt-0.5">All factory staff with roles & designations — QC members keep working in the mobile app</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', role: '', designation: '', department: '', phone: '', employee_id: '', production_operator: false }); }}
          className="px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1.5"
          data-testid="add-member-btn">
          <Plus size={14} /> Add Staff
        </button>
      </div>

      {missingKiosk.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-2.5" data-testid="kiosk-gap-banner">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">{missingKiosk.length} staff member{missingKiosk.length === 1 ? '' : 's'} can't log in to the QC kiosk yet</p>
            <p className="text-xs text-amber-700 mt-0.5">
              No face or PIN enrolled: <span className="font-medium">{missingKiosk.map(m => m.name).join(', ')}</span>. Use the <ScanFace size={11} className="inline -mt-0.5" /> or <KeyRound size={11} className="inline -mt-0.5" /> buttons on their row to complete onboarding.
            </p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-800">{editing ? 'Edit' : 'New'} Staff Member</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Ravi Kumar" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="member-name-input" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Role</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" data-testid="member-role-input">
                <option value="">Select role…</option>
                {['QC Inspector', 'QC Lead', 'Production Operator', 'Machine Operator', 'Packing Staff', 'Warehouse Staff', 'Housekeeping', 'Security', 'Supervisor', 'Electrician', 'Maintenance Technician', 'Driver', 'Helper', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                {form.role && !['QC Inspector', 'QC Lead', 'Production Operator', 'Machine Operator', 'Packing Staff', 'Warehouse Staff', 'Housekeeping', 'Security', 'Supervisor', 'Electrician', 'Maintenance Technician', 'Driver', 'Helper', 'Other'].includes(form.role) && <option value={form.role}>{form.role}</option>}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Designation</label>
              <input value={form.designation} onChange={e => setForm(p => ({ ...p, designation: e.target.value }))}
                placeholder="e.g. Senior Technician, Shift In-charge" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="member-designation-input" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Department</label>
              <input value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))}
                placeholder="e.g. Production, Quality, Packing" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="member-department-input" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Phone</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="e.g. 98765 43210" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="member-phone-input" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Employee ID</label>
              <input value={form.employee_id} onChange={e => setForm(p => ({ ...p, employee_id: e.target.value }))}
                placeholder="e.g. NAW-042" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="member-empid-input" />
            </div>
            <label className="sm:col-span-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={!!form.production_operator} onChange={e => setForm(p => ({ ...p, production_operator: e.target.checked }))} className="mt-0.5 h-4 w-4" data-testid="member-production-operator-checkbox" />
              <span className="text-xs"><span className="font-semibold text-slate-800 flex items-center gap-1"><Factory size={12} /> Production operator</span>
                <span className="text-slate-500">Can scan the <b>Start Production QR</b>, sign in with Face ID / PIN and initiate &amp; run production batches.</span></span>
            </label>
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
          <p className="text-sm text-amber-700 font-medium">No factory staff configured</p>
          <p className="text-xs text-amber-600 mt-1">Add factory staff with their roles and designations — QC members also appear in the defect-tracking mobile app</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Name</th>
                <th className="text-left px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Role</th>
                <th className="text-left px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Designation</th>
                <th className="text-left px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Department</th>
                <th className="text-left px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Phone</th>
                <th className="text-left px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium">Kiosk Login</th>
                <th className="text-right px-5 py-3 text-[10px] text-slate-500 uppercase tracking-wider font-medium w-40">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map(m => {
                const gap = !m.has_face && !m.has_pin;
                return (
                <tr key={m.id} className={`${gap ? 'bg-amber-50/70 hover:bg-amber-50' : 'hover:bg-slate-50'} transition-colors`} data-testid={`member-row-${m.id}`}>
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {m.name}
                    {m.employee_id && <span className="block text-[10px] font-normal text-slate-400">{m.employee_id}</span>}
                    {m.production_operator && <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#002FA7]/10 text-[#002FA7]" data-testid={`operator-badge-${m.id}`}><Factory size={10} /> Production operator</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{m.role || '-'}</td>
                  <td className="px-5 py-3 text-slate-500">{m.designation || '-'}</td>
                  <td className="px-5 py-3 text-slate-500">{m.department || '-'}</td>
                  <td className="px-5 py-3 text-slate-500">{m.phone || '-'}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${m.has_face ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`} data-testid={`face-status-${m.id}`}>
                        {m.has_face ? <CircleCheck size={11} /> : <ScanFace size={11} />} Face{m.has_face ? ` (${m.face_samples})` : ''}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${m.has_pin ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                        <KeyRound size={11} /> PIN
                      </span>
                      {gap && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium" data-testid={`kiosk-gap-${m.id}`}>
                          <AlertTriangle size={11} /> Onboarding pending
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setFaceMember(m)} className="p-1.5 hover:bg-emerald-50 rounded-lg" data-testid={`enroll-face-${m.id}`} title="Enrol face">
                        <ScanFace size={14} className="text-emerald-500" />
                      </button>
                      <button onClick={() => setPinMember(m)} className="p-1.5 hover:bg-blue-50 rounded-lg" data-testid={`set-pin-${m.id}`} title="Set PIN">
                        <KeyRound size={14} className="text-blue-500" />
                      </button>
                      <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-slate-100 rounded-lg" data-testid={`edit-member-${m.id}`}>
                        <Pencil size={13} className="text-slate-400" />
                      </button>
                      <button onClick={() => handleDelete(m.id)} className="p-1.5 hover:bg-red-50 rounded-lg" data-testid={`delete-member-${m.id}`}>
                        <Trash2 size={13} className="text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {faceMember && <FaceEnrollModal member={faceMember} onClose={() => setFaceMember(null)} onDone={fetchMembers} />}
      {pinMember && <PinModal member={pinMember} onClose={() => setPinMember(null)} onDone={fetchMembers} />}
    </div>
  );
}
