import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { meetingMinutesAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';
import {
  ArrowLeft, Save, Loader2, X, Plus, Search, ChevronDown,
  MessageSquare, ListChecks, Users,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PERIODICITIES = [
  { value: 'weekly', label: 'Weekly', color: 'bg-blue-100 text-blue-700' },
  { value: 'monthly', label: 'Monthly', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'quarterly', label: 'Quarterly', color: 'bg-amber-100 text-amber-700' },
  { value: 'adhoc', label: 'Ad-hoc', color: 'bg-slate-100 text-slate-600' },
];

const PURPOSES = [
  { value: 'sales', label: 'Sales', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'production', label: 'Production', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'general', label: 'General', color: 'bg-slate-50 text-slate-700 border-slate-200' },
  { value: 'finance', label: 'Finance', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'administration', label: 'Administration', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'investors', label: 'Investors', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  { value: 'marketing', label: 'Marketing', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
];

const ACTION_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenantId');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId };
}

function MultiSelect({ options, selected, onChange, placeholder, testId }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" data-testid={testId}>
      <div className="flex flex-wrap gap-1.5 min-h-[42px] p-2.5 border border-slate-200 rounded-lg bg-white cursor-pointer hover:border-slate-300 transition-colors"
        onClick={() => setOpen(!open)}>
        {selected.length > 0 ? selected.map(v => {
          const opt = options.find(o => o.value === v);
          return (
            <span key={v} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${opt?.color || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {opt?.label || v}
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange(selected.filter(x => x !== v)); }} className="hover:opacity-70"><X size={11} /></button>
            </span>
          );
        }) : <span className="text-sm text-slate-400">{placeholder}</span>}
        <ChevronDown size={14} className="ml-auto self-center text-slate-400" />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
            {options.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                <input type="checkbox" checked={selected.includes(opt.value)}
                  onChange={() => onChange(selected.includes(opt.value) ? selected.filter(x => x !== opt.value) : [...selected, opt.value])}
                  className="rounded border-slate-300" />
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${opt.color || ''}`}>{opt.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ParticipantSelect({ users, selected, onChange, testId }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = users.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()));
  const selectedIds = selected.map(p => p.id);
  return (
    <div className="relative" data-testid={testId}>
      <div className="flex flex-wrap gap-1.5 min-h-[42px] p-2.5 border border-slate-200 rounded-lg bg-white cursor-pointer hover:border-slate-300 transition-colors"
        onClick={() => setOpen(!open)}>
        {selected.length > 0 ? selected.map(p => (
          <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200">
            {p.name}
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(selected.filter(x => x.id !== p.id)); }} className="hover:text-blue-900"><X size={11} /></button>
          </span>
        )) : <span className="text-sm text-slate-400">Select participants</span>}
        <ChevronDown size={14} className="ml-auto self-center text-slate-400" />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-md">
                <Search size={13} className="text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
                  className="bg-transparent text-sm outline-none flex-1" />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {filtered.map(u => (
                <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                  <input type="checkbox" checked={selectedIds.includes(u.id)}
                    onChange={() => {
                      if (selectedIds.includes(u.id)) onChange(selected.filter(x => x.id !== u.id));
                      else onChange([...selected, { id: u.id, name: u.name }]);
                    }} className="rounded border-slate-300" />
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-medium text-blue-700">
                    {u.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <span>{u.name}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function MeetingEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    title: '', periodicity: 'adhoc', purpose: [],
    participants: [], minutes: [''], action_items: [],
  });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await axios.get(`${API_URL}/users`, { headers: getAuthHeaders() });
        setUsers(res.data || []);
      } catch { /* ignore */ }
    };
    loadUsers();
  }, []);

  useEffect(() => {
    if (!id) return;
    const loadMeeting = async () => {
      try {
        const res = await meetingMinutesAPI.get(id);
        const m = res.data;
        setForm({
          date: m.date || '',
          title: m.title || '',
          periodicity: m.periodicity || 'adhoc',
          purpose: m.purpose || [],
          participants: m.participants || [],
          minutes: m.minutes?.length ? m.minutes : [''],
          action_items: m.action_items || [],
        });
      } catch {
        toast.error('Failed to load meeting');
        navigate('/meeting-minutes');
      } finally { setLoading(false); }
    };
    loadMeeting();
  }, [id, navigate]);

  const addMinute = () => setForm(p => ({ ...p, minutes: [...p.minutes, ''] }));
  const updateMinute = (i, val) => setForm(p => ({ ...p, minutes: p.minutes.map((m, idx) => idx === i ? val : m) }));
  const removeMinute = (i) => setForm(p => ({ ...p, minutes: p.minutes.filter((_, idx) => idx !== i) }));

  const addActionItem = () => setForm(p => ({
    ...p, action_items: [...p.action_items, { id: '', description: '', assignee_id: '', assignee_name: '', due_date: '', status: 'open' }]
  }));
  const updateActionItem = (i, field, val) => setForm(p => ({
    ...p, action_items: p.action_items.map((a, idx) => {
      if (idx !== i) return a;
      if (field === 'assignee_id') {
        const u = users.find(u => u.id === val);
        return { ...a, assignee_id: val, assignee_name: u?.name || '' };
      }
      return { ...a, [field]: val };
    })
  }));
  const removeActionItem = (i) => setForm(p => ({ ...p, action_items: p.action_items.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    if (!form.date) { toast.error('Date is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, minutes: form.minutes.filter(m => m.trim()) };
      if (id) {
        await meetingMinutesAPI.update(id, payload);
        toast.success('Meeting updated');
        navigate(`/meeting-minutes/${id}`);
      } else {
        const res = await meetingMinutesAPI.create(payload);
        toast.success('Meeting created');
        navigate(`/meeting-minutes/${res.data.id}`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 size={24} className="animate-spin text-slate-400" /></div>;

  return (
    <div className="p-6 max-w-[900px] mx-auto" data-testid="meeting-edit-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => id ? navigate(`/meeting-minutes/${id}`) : navigate('/meeting-minutes')}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors" data-testid="back-btn">
            <ArrowLeft size={18} className="text-slate-500" />
          </button>
          <h1 className="text-xl font-bold text-slate-900">{isNew ? 'New Meeting Minutes' : 'Edit Meeting'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => id ? navigate(`/meeting-minutes/${id}`) : navigate('/meeting-minutes')}
            className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            data-testid="cancel-btn">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            data-testid="save-btn">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> {isNew ? 'Create Meeting' : 'Save Changes'}</>}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Date, Title, Periodicity */}
        <div className="border border-slate-200 rounded-xl p-5 space-y-5 bg-white">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                data-testid="meeting-date-input" />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">Title</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Meeting title"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                data-testid="meeting-title-input" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">Periodicity</label>
            <div className="flex gap-2" data-testid="periodicity-select">
              {PERIODICITIES.map(p => (
                <button key={p.value} onClick={() => setForm(prev => ({ ...prev, periodicity: p.value }))}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${form.periodicity === p.value ? 'bg-slate-900 text-white' : p.color + ' hover:opacity-80'}`}
                  data-testid={`periodicity-${p.value}`}>{p.label}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">Purpose</label>
            <MultiSelect options={PURPOSES} selected={form.purpose}
              onChange={v => setForm(p => ({ ...p, purpose: v }))} placeholder="Select purpose(s)" testId="purpose-select" />
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">Participants</label>
            <ParticipantSelect users={users} selected={form.participants}
              onChange={v => setForm(p => ({ ...p, participants: v }))} testId="participants-select" />
          </div>
        </div>

        {/* Meeting Minutes - Bullet points with textareas */}
        <div className="border border-slate-200 rounded-xl p-5 bg-white" data-testid="section-minutes-form">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare size={16} className="text-blue-500" /> Meeting Minutes
            </h2>
            <button onClick={addMinute} className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1"
              data-testid="add-minute-btn"><Plus size={13} /> Add Point</button>
          </div>
          <div className="space-y-3">
            {form.minutes.map((m, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="mt-3 w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <textarea value={m} onChange={e => updateMinute(i, e.target.value)}
                  placeholder={`Discussion point ${i + 1}...`}
                  rows={3}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm leading-relaxed resize-y focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  data-testid={`minute-input-${i}`} />
                {form.minutes.length > 1 && (
                  <button onClick={() => removeMinute(i)} className="mt-2 text-slate-300 hover:text-red-500 transition-colors" data-testid={`remove-minute-${i}`}><X size={16} /></button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action Items with textareas */}
        <div className="border border-slate-200 rounded-xl p-5 bg-white" data-testid="section-actions-form">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ListChecks size={16} className="text-emerald-500" /> Action Items
              <span className="text-[10px] text-slate-400 font-normal">(auto-creates tasks)</span>
            </h2>
            <button onClick={addActionItem} className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1"
              data-testid="add-action-btn"><Plus size={13} /> Add Action</button>
          </div>
          <div className="space-y-4">
            {form.action_items.map((ai, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-4 bg-slate-50/30" data-testid={`action-item-${i}`}>
                <div className="flex items-start gap-2 mb-3">
                  <textarea value={ai.description} onChange={e => updateActionItem(i, 'description', e.target.value)}
                    placeholder="Describe the action item..."
                    rows={3}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-sm leading-relaxed resize-y bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    data-testid={`action-desc-${i}`} />
                  <button onClick={() => removeActionItem(i)} className="mt-1 text-slate-300 hover:text-red-500 transition-colors"><X size={16} /></button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block">Assignee</label>
                    <select value={ai.assignee_id} onChange={e => updateActionItem(i, 'assignee_id', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid={`action-assignee-${i}`}>
                      <option value="">Select assignee</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block">Due Date</label>
                    <input type="date" value={ai.due_date} onChange={e => updateActionItem(i, 'due_date', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid={`action-due-${i}`} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block">Status</label>
                    <select value={ai.status} onChange={e => updateActionItem(i, 'status', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid={`action-status-${i}`}>
                      {ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                {ai.task_number && (
                  <p className="mt-2 text-[10px] text-blue-600 font-medium">Linked to {ai.task_number}</p>
                )}
              </div>
            ))}
            {form.action_items.length === 0 && (
              <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
                <ListChecks size={24} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs text-slate-400">No action items yet. Click "Add Action" to create one.</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom save bar */}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={() => id ? navigate(`/meeting-minutes/${id}`) : navigate('/meeting-minutes')}
            className="px-5 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            data-testid="save-bottom-btn">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> {isNew ? 'Create Meeting' : 'Save Changes'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
