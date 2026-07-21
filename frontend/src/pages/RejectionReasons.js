import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, X, Check, Upload, Image as ImageIcon } from 'lucide-react';
import * as Icons from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenant_id');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

const COLOR_SWATCHES = [
  '#0f172a', '#334155', '#dc2626', '#ea580c', '#d97706',
  '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777',
  '#0d9488', '#84cc16', '#f5f5f5', '#facc15', '#64748b',
];

// Curated lucide icons that read well as large QC tiles.
const ICON_CHOICES = [
  'circle', 'droplet', 'sparkles', 'bug', 'wine', 'flame',
  'zap', 'scissors', 'wrench', 'package', 'flask-conical', 'thermometer',
  'shield-alert', 'badge-alert', 'ban', 'x-circle',
];

// Map a kebab-case name (e.g. "x-circle") to its lucide PascalCase export.
function iconComponent(name) {
  if (!name) return Icons.Circle;
  const pascal = name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  return Icons[pascal] || Icons.Circle;
}

const EMPTY = { name: '', description: '', color: '#334155', icon: 'circle', image: '' };

export default function RejectionReasons() {
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

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

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Image too large (max 2MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm(p => ({ ...p, image: reader.result }));
    reader.readAsDataURL(file);
  };

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
      setForm(EMPTY);
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
    setForm({ name: r.name, description: r.description || '', color: r.color || '#334155', icon: r.icon || 'circle', image: r.image || '' });
    setShowForm(true);
  };

  const openNew = () => { setShowForm(true); setEditing(null); setForm(EMPTY); };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;

  const PreviewIcon = iconComponent(form.icon);

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto space-y-6" data-testid="rejection-reasons-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Rejection Reasons</h1>
          <p className="text-sm text-slate-500 mt-0.5">Give each reason a colour, icon or image — these appear as tap tiles in QC Station</p>
        </div>
        <button onClick={openNew}
          className="px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1.5"
          data-testid="add-reason-btn">
          <Plus size={14} /> Add Reason
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4" data-testid="reason-form">
          <p className="text-sm font-semibold text-slate-800">{editing ? 'Edit' : 'New'} Rejection Reason</p>

          <div className="flex flex-col md:flex-row gap-5">
            {/* Live tile preview */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Tile Preview</span>
              <div
                className="w-28 h-28 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-sm overflow-hidden"
                style={{ backgroundColor: form.color }}
                data-testid="reason-tile-preview"
              >
                {form.image ? (
                  <img src={form.image} alt="tile" className="w-full h-full object-cover" />
                ) : (
                  <PreviewIcon size={34} className="text-white drop-shadow" />
                )}
              </div>
              <span className="text-xs font-medium text-slate-600 max-w-[7rem] text-center truncate">{form.name || 'Reason'}</span>
            </div>

            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Name *</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Black Particle" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="reason-name-input" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Description</label>
                  <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Optional" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" data-testid="reason-desc-input" />
                </div>
              </div>

              {/* Colour */}
              <div>
                <label className="text-[10px] text-slate-500 mb-1.5 block uppercase tracking-wider">Tile Colour</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_SWATCHES.map(c => (
                    <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                      className={`w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110 ${form.color === c ? 'border-slate-800 scale-110' : 'border-slate-200'}`}
                      style={{ backgroundColor: c }} data-testid={`reason-color-${c}`} title={c} />
                  ))}
                  <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer p-0" title="Custom colour" data-testid="reason-color-custom" />
                </div>
              </div>

              {/* Icon */}
              <div>
                <label className="text-[10px] text-slate-500 mb-1.5 block uppercase tracking-wider">Icon {form.image && <span className="text-slate-300 normal-case">(hidden — image set)</span>}</label>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_CHOICES.map(name => {
                    const Ico = iconComponent(name);
                    return (
                      <button key={name} onClick={() => setForm(p => ({ ...p, icon: name }))}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-colors ${form.icon === name ? 'border-slate-800 bg-slate-100' : 'border-slate-200 hover:bg-slate-50'}`}
                        data-testid={`reason-icon-${name}`}>
                        <Ico size={17} className="text-slate-600" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Image */}
              <div>
                <label className="text-[10px] text-slate-500 mb-1.5 block uppercase tracking-wider">Custom Image (optional)</label>
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" data-testid="reason-image-input" />
                  <button onClick={() => fileRef.current?.click()}
                    className="px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5" data-testid="reason-image-upload">
                    <Upload size={13} /> {form.image ? 'Replace image' : 'Upload image'}
                  </button>
                  {form.image && (
                    <button onClick={() => setForm(p => ({ ...p, image: '' }))}
                      className="px-3 py-2 text-xs font-medium text-red-500 border border-red-100 rounded-lg hover:bg-red-50 flex items-center gap-1.5" data-testid="reason-image-remove">
                      <X size={13} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
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
          <p className="text-xs text-amber-600 mt-1">Add reasons so inspectors can tap them during QC checks</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="reason-grid">
          {reasons.map(r => {
            const Ico = iconComponent(r.icon);
            return (
              <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col items-center gap-2 group relative" data-testid={`reason-card-${r.id}`}>
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden shadow-sm" style={{ backgroundColor: r.color || '#334155' }}>
                  {r.image ? <img src={r.image} alt={r.name} className="w-full h-full object-cover" /> : <Ico size={30} className="text-white drop-shadow" />}
                </div>
                <p className="text-sm font-medium text-slate-800 text-center leading-tight">{r.name}</p>
                {r.description && <p className="text-[11px] text-slate-400 text-center leading-tight line-clamp-2">{r.description}</p>}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 bg-white/90 rounded-lg shadow-sm">
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-slate-100 rounded-lg" data-testid={`edit-reason-${r.id}`}>
                    <Pencil size={13} className="text-slate-400" />
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg" data-testid={`delete-reason-${r.id}`}>
                    <Trash2 size={13} className="text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
