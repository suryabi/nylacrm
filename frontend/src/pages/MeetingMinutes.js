import React, { useState, useEffect, useCallback } from 'react';
import { meetingMinutesAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import axios from 'axios';
import {
  Plus, Calendar as CalendarIcon, Clock, Users, X, Save, Trash2,
  ChevronDown, Filter, FileText, CheckCircle2, Circle, Loader2,
  AlertCircle, Search, ListChecks, MessageSquare, PenLine, History,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '../components/ui/sheet';

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
  { value: 'open', label: 'Open', dot: 'bg-slate-400' },
  { value: 'in_progress', label: 'In Progress', dot: 'bg-amber-500' },
  { value: 'done', label: 'Done', dot: 'bg-emerald-500' },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenantId');
  return { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
}

// Multi-select dropdown component
function MultiSelect({ options, selected, onChange, placeholder, testId }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" data-testid={testId}>
      <div className="flex flex-wrap gap-1.5 min-h-[38px] p-2 border border-slate-200 rounded-lg bg-white cursor-pointer hover:border-slate-300 transition-colors"
        onClick={() => setOpen(!open)}>
        {selected.length > 0 ? selected.map(v => {
          const opt = options.find(o => o.value === v);
          return (
            <span key={v} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${opt?.color || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {opt?.label || v}
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange(selected.filter(x => x !== v)); }}
                className="hover:opacity-70"><X size={11} /></button>
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

// Participant multi-select with search
function ParticipantSelect({ users, selected, onChange, testId }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = users.filter(u => u.name?.toLowerCase().includes(search.toLowerCase()));
  const selectedIds = selected.map(p => p.id);

  return (
    <div className="relative" data-testid={testId}>
      <div className="flex flex-wrap gap-1.5 min-h-[38px] p-2 border border-slate-200 rounded-lg bg-white cursor-pointer hover:border-slate-300 transition-colors"
        onClick={() => setOpen(!open)}>
        {selected.length > 0 ? selected.map(p => (
          <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200">
            {p.name}
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(selected.filter(x => x.id !== p.id)); }}
              className="hover:text-blue-900"><X size={11} /></button>
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
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team members..."
                  className="bg-transparent text-sm outline-none flex-1" data-testid="participant-search" />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {filtered.map(u => (
                <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                  <input type="checkbox" checked={selectedIds.includes(u.id)}
                    onChange={() => {
                      if (selectedIds.includes(u.id)) onChange(selected.filter(x => x.id !== u.id));
                      else onChange([...selected, { id: u.id, name: u.name }]);
                    }}
                    className="rounded border-slate-300" />
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-medium text-blue-700">
                    {u.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <span className="text-slate-700">{u.name}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">{Array.isArray(u.department) ? u.department.join(', ') : u.department}</span>
                </label>
              ))}
              {filtered.length === 0 && <p className="px-3 py-4 text-sm text-slate-400 text-center">No members found</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Meeting Form Panel (Sheet)
function MeetingFormPanel({ open, onClose, meeting, users, onSave }) {
  const [form, setForm] = useState({
    date: '', title: '', periodicity: 'adhoc', purpose: [],
    participants: [], minutes: [''], action_items: [],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meeting) {
      setForm({
        date: meeting.date || '',
        title: meeting.title || '',
        periodicity: meeting.periodicity || 'adhoc',
        purpose: meeting.purpose || [],
        participants: meeting.participants || [],
        minutes: meeting.minutes?.length ? meeting.minutes : [''],
        action_items: meeting.action_items?.length ? meeting.action_items : [],
      });
    } else {
      const today = new Date().toISOString().split('T')[0];
      setForm({ date: today, title: '', periodicity: 'adhoc', purpose: [], participants: [], minutes: [''], action_items: [] });
    }
  }, [meeting, open]);

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
        const user = users.find(u => u.id === val);
        return { ...a, assignee_id: val, assignee_name: user?.name || '' };
      }
      return { ...a, [field]: val };
    })
  }));
  const removeActionItem = (i) => setForm(p => ({ ...p, action_items: p.action_items.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    if (!form.date) { toast.error('Date is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        minutes: form.minutes.filter(m => m.trim()),
      };
      await onSave(payload);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-2xl border-l border-slate-200 p-0 bg-white overflow-y-auto [&>button]:hidden">
        <div className="px-6 pt-5 pb-4 border-b border-slate-200 sticky top-0 z-10 bg-white">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold text-slate-900">
              {meeting ? 'Edit Meeting' : 'New Meeting Minutes'}
            </SheetTitle>
            <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 transition-colors"><X size={18} className="text-slate-400" /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Date & Title row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">Date *</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                data-testid="meeting-date-input" />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">Title</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Meeting title (optional)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                data-testid="meeting-title-input" />
            </div>
          </div>

          {/* Periodicity */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">Periodicity</label>
            <div className="flex gap-2" data-testid="periodicity-select">
              {PERIODICITIES.map(p => (
                <button key={p.value} onClick={() => setForm(prev => ({ ...prev, periodicity: p.value }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${form.periodicity === p.value ? 'bg-slate-900 text-white' : p.color + ' hover:opacity-80'}`}
                  data-testid={`periodicity-${p.value}`}>{p.label}</button>
              ))}
            </div>
          </div>

          {/* Purpose */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">Purpose</label>
            <MultiSelect options={PURPOSES} selected={form.purpose}
              onChange={v => setForm(p => ({ ...p, purpose: v }))} placeholder="Select purpose(s)" testId="purpose-select" />
          </div>

          {/* Participants */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 block">Participants</label>
            <ParticipantSelect users={users} selected={form.participants}
              onChange={v => setForm(p => ({ ...p, participants: v }))} testId="participants-select" />
          </div>

          {/* Meeting Minutes - Bullet points */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <MessageSquare size={11} /> Meeting Minutes
              </label>
              <button onClick={addMinute} className="text-xs text-blue-600 hover:text-blue-700 font-medium" data-testid="add-minute-btn">+ Add Point</button>
            </div>
            <div className="space-y-2">
              {form.minutes.map((m, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  <input value={m} onChange={e => updateMinute(i, e.target.value)} placeholder={`Discussion point ${i + 1}`}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    data-testid={`minute-input-${i}`} />
                  {form.minutes.length > 1 && (
                    <button onClick={() => removeMinute(i)} className="mt-1.5 text-slate-300 hover:text-red-500 transition-colors" data-testid={`remove-minute-${i}`}><X size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action Items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <ListChecks size={11} /> Action Items
              </label>
              <button onClick={addActionItem} className="text-xs text-blue-600 hover:text-blue-700 font-medium" data-testid="add-action-btn">+ Add Action</button>
            </div>
            <div className="space-y-3">
              {form.action_items.map((ai, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50/50" data-testid={`action-item-${i}`}>
                  <div className="flex gap-2">
                    <input value={ai.description} onChange={e => updateActionItem(i, 'description', e.target.value)} placeholder="Action item description"
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid={`action-desc-${i}`} />
                    <button onClick={() => removeActionItem(i)} className="text-slate-300 hover:text-red-500 transition-colors"><X size={14} /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <select value={ai.assignee_id} onChange={e => updateActionItem(i, 'assignee_id', e.target.value)}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid={`action-assignee-${i}`}>
                      <option value="">Assignee</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <input type="date" value={ai.due_date} onChange={e => updateActionItem(i, 'due_date', e.target.value)}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid={`action-due-${i}`} />
                    <select value={ai.status} onChange={e => updateActionItem(i, 'status', e.target.value)}
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      data-testid={`action-status-${i}`}>
                      {ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
              ))}
              {form.action_items.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4 border border-dashed border-slate-200 rounded-lg">No action items yet</p>
              )}
            </div>
          </div>

          {/* Save */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              data-testid="meeting-cancel-btn">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="meeting-save-btn">
              {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> {meeting ? 'Update' : 'Save'}</>}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}


// Meeting Detail Panel
function MeetingDetailPanel({ open, onClose, meeting, onEdit, onDelete }) {
  if (!meeting) return null;
  const pConfig = PERIODICITIES.find(p => p.value === meeting.periodicity);
  const actionOpen = (meeting.action_items || []).filter(a => a.status === 'open').length;
  const actionDone = (meeting.action_items || []).filter(a => a.status === 'done').length;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-2xl border-l border-slate-200 p-0 bg-white overflow-y-auto [&>button]:hidden">
        <div className="px-6 pt-5 pb-4 border-b border-slate-200 sticky top-0 z-10 bg-white">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold text-slate-900">{meeting.title || 'Meeting Minutes'}</SheetTitle>
            <div className="flex items-center gap-2">
              <button onClick={() => onEdit(meeting)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" data-testid="detail-edit-btn"><PenLine size={16} className="text-slate-500" /></button>
              <button onClick={() => { if (window.confirm('Delete this meeting?')) onDelete(meeting.id); }}
                className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" data-testid="detail-delete-btn"><Trash2 size={16} className="text-slate-400 hover:text-red-500" /></button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X size={18} className="text-slate-400" /></button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Meta row */}
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-medium text-slate-600">
              <CalendarIcon size={12} /> {meeting.date}
            </span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${pConfig?.color || 'bg-slate-100 text-slate-600'}`}>
              {pConfig?.label || meeting.periodicity}
            </span>
            {(meeting.purpose || []).map(p => {
              const pDef = PURPOSES.find(x => x.value === p);
              return <span key={p} className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${pDef?.color || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{pDef?.label || p}</span>;
            })}
          </div>

          {/* Participants */}
          {(meeting.participants || []).length > 0 && (
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2 block">Participants ({meeting.participants.length})</label>
              <div className="flex flex-wrap gap-2">
                {meeting.participants.map(p => (
                  <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-medium text-blue-700">
                      {p.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <span className="text-xs font-medium text-slate-700">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Minutes */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><MessageSquare size={11} /> Meeting Minutes</label>
            {(meeting.minutes || []).length > 0 ? (
              <div className="space-y-1.5 pl-1">
                {meeting.minutes.map((m, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <p className="text-sm text-slate-700 leading-relaxed">{m}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No minutes recorded</p>
            )}
          </div>

          {/* Action Items */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1">
              <ListChecks size={11} /> Action Items
              {(meeting.action_items || []).length > 0 && (
                <span className="ml-2 text-[10px] text-slate-500">({actionDone}/{meeting.action_items.length} done)</span>
              )}
            </label>
            {(meeting.action_items || []).length > 0 ? (
              <div className="space-y-2">
                {meeting.action_items.map((ai, i) => {
                  const sDef = ACTION_STATUSES.find(s => s.value === ai.status);
                  return (
                    <div key={ai.id || i} className="flex items-start gap-3 py-2.5 px-3 rounded-lg border border-slate-100 bg-white" data-testid={`detail-action-${i}`}>
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${sDef?.dot || 'bg-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${ai.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{ai.description}</p>
                        <div className="flex items-center gap-3 mt-1">
                          {ai.assignee_name && <span className="text-[10px] text-slate-500">{ai.assignee_name}</span>}
                          {ai.due_date && <span className="text-[10px] text-slate-400">{ai.due_date}</span>}
                          <span className="text-[10px] font-medium text-slate-400 uppercase">{sDef?.label}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No action items</p>
            )}
          </div>

          {/* Edit History */}
          {(meeting.edit_history || []).length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><History size={11} /> Edit History</label>
              <div className="space-y-1">
                {meeting.edit_history.slice(-5).reverse().map((h, i) => (
                  <p key={i} className="text-[11px] text-slate-400">
                    Edited by <span className="text-slate-600 font-medium">{h.edited_by_name}</span> on {new Date(h.edited_at).toLocaleString()}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Created info */}
          <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
            Created by {meeting.created_by_name} on {new Date(meeting.created_at).toLocaleString()}
            {meeting.updated_by_name && meeting.updated_at !== meeting.created_at && (
              <> &middot; Last updated by {meeting.updated_by_name} on {new Date(meeting.updated_at).toLocaleString()}</>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}


export default function MeetingMinutesPage() {
  const { user } = useAuth();
  const now = new Date();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  // Filters
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterPeriodicity, setFilterPeriodicity] = useState('');
  const [filterPurpose, setFilterPurpose] = useState([]);
  const [filterParticipant, setFilterParticipant] = useState('');

  // Panels
  const [formOpen, setFormOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const tenantId = localStorage.getItem('tenantId');
      const res = await axios.get(`${API_URL}/users`, { headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId } });
      setUsers(res.data || []);
    } catch { /* ignore */ }
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const params = { month: filterMonth, year: filterYear };
      if (filterPeriodicity) params.periodicity = filterPeriodicity;
      if (filterPurpose.length) params.purpose = filterPurpose.join(',');
      if (filterParticipant) params.participant = filterParticipant;
      const res = await meetingMinutesAPI.list(params);
      setMeetings(res.data || []);
    } catch { toast.error('Failed to load meetings'); }
    finally { setLoading(false); }
  }, [filterMonth, filterYear, filterPeriodicity, filterPurpose, filterParticipant]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadMeetings(); }, [loadMeetings]);

  const handleSave = async (data) => {
    if (editingMeeting) {
      await meetingMinutesAPI.update(editingMeeting.id, data);
      toast.success('Meeting updated');
    } else {
      await meetingMinutesAPI.create(data);
      toast.success('Meeting created');
    }
    setEditingMeeting(null);
    loadMeetings();
  };

  const handleDelete = async (id) => {
    try {
      await meetingMinutesAPI.delete(id);
      toast.success('Meeting deleted');
      setDetailOpen(false);
      setSelectedMeeting(null);
      loadMeetings();
    } catch { toast.error('Failed to delete'); }
  };

  const openCreate = () => { setEditingMeeting(null); setFormOpen(true); };
  const openEdit = (m) => { setEditingMeeting(m); setDetailOpen(false); setFormOpen(true); };
  const openDetail = (m) => { setSelectedMeeting(m); setDetailOpen(true); };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="p-6 max-w-[1400px] mx-auto" data-testid="meeting-minutes-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Meeting Minutes</h1>
          <p className="text-sm text-slate-500 mt-0.5">Record and track meeting discussions and action items</p>
        </div>
        <button onClick={openCreate}
          className="bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm"
          data-testid="new-meeting-btn"><Plus size={16} /> New Meeting</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-5 p-4 bg-white border border-slate-200 rounded-xl" data-testid="meeting-filters">
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1 block">Month</label>
          <select value={filterMonth} onChange={e => setFilterMonth(+e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[130px]" data-testid="filter-month">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1 block">Year</label>
          <select value={filterYear} onChange={e => setFilterYear(+e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" data-testid="filter-year">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1 block">Periodicity</label>
          <select value={filterPeriodicity} onChange={e => setFilterPeriodicity(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[120px]" data-testid="filter-periodicity">
            <option value="">All</option>
            {PERIODICITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="min-w-[200px]">
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1 block">Purpose</label>
          <MultiSelect options={PURPOSES} selected={filterPurpose} onChange={setFilterPurpose}
            placeholder="All purposes" testId="filter-purpose" />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1 block">Participant</label>
          <select value={filterParticipant} onChange={e => setFilterParticipant(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[160px]" data-testid="filter-participant">
            <option value="">All</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 mb-5">
        <div className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg">
          <span className="text-lg font-semibold text-slate-900">{meetings.length}</span>
          <span className="text-xs text-slate-500 ml-1.5">Meetings</span>
        </div>
        <div className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg">
          <span className="text-lg font-semibold text-slate-900">{meetings.reduce((s, m) => s + (m.action_items?.length || 0), 0)}</span>
          <span className="text-xs text-slate-500 ml-1.5">Action Items</span>
        </div>
        <div className="px-4 py-2.5 bg-white border border-amber-200 rounded-lg bg-amber-50/50">
          <span className="text-lg font-semibold text-amber-700">{meetings.reduce((s, m) => s + (m.action_items?.filter(a => a.status !== 'done').length || 0), 0)}</span>
          <span className="text-xs text-amber-600 ml-1.5">Open Items</span>
        </div>
      </div>

      {/* Meeting list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 size={24} className="animate-spin" /></div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl">
          <FileText size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 mb-1">No meetings found</p>
          <p className="text-xs text-slate-400">Create a new meeting to get started</p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="meeting-list">
          {meetings.map(m => {
            const pConf = PERIODICITIES.find(p => p.value === m.periodicity);
            const totalActions = m.action_items?.length || 0;
            const doneActions = m.action_items?.filter(a => a.status === 'done').length || 0;
            return (
              <div key={m.id} onClick={() => openDetail(m)}
                className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer"
                data-testid={`meeting-card-${m.id}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-semibold text-slate-900">{m.title || 'Meeting Minutes'}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${pConf?.color || 'bg-slate-100 text-slate-600'}`}>{pConf?.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(m.purpose || []).map(p => {
                        const pDef = PURPOSES.find(x => x.value === p);
                        return <span key={p} className={`px-2 py-0.5 rounded text-[9px] font-medium border ${pDef?.color || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{pDef?.label || p}</span>;
                      })}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><CalendarIcon size={12} /> {m.date}</span>
                      <span className="flex items-center gap-1"><Users size={12} /> {m.participants?.length || 0} participants</span>
                      <span className="flex items-center gap-1"><MessageSquare size={12} /> {m.minutes?.length || 0} points</span>
                      {totalActions > 0 && (
                        <span className="flex items-center gap-1"><ListChecks size={12} /> {doneActions}/{totalActions} done</span>
                      )}
                    </div>
                  </div>
                  <div className="flex -space-x-2 ml-4">
                    {(m.participants || []).slice(0, 5).map(p => (
                      <div key={p.id} className="w-7 h-7 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-[9px] font-medium text-blue-700" title={p.name}>
                        {p.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                      </div>
                    ))}
                    {(m.participants || []).length > 5 && (
                      <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[9px] font-medium text-slate-500">
                        +{m.participants.length - 5}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Panels */}
      <MeetingFormPanel open={formOpen} onClose={() => { setFormOpen(false); setEditingMeeting(null); }}
        meeting={editingMeeting} users={users} onSave={handleSave} />
      <MeetingDetailPanel open={detailOpen} onClose={() => { setDetailOpen(false); setSelectedMeeting(null); }}
        meeting={selectedMeeting} onEdit={openEdit} onDelete={handleDelete} />
    </div>
  );
}
