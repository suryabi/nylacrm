import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import {
  Save, Trash2, Plus, X, CalendarDays, MapPin,
  Users, DollarSign, ListChecks, ClipboardList, Loader2,
} from 'lucide-react';

const EVENT_STATUSES = [
  { value: 'planned', label: 'Planned', color: 'bg-blue-100 text-blue-700' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  { value: 'completed', label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-700' },
];

const TASK_STATUSES = [
  { value: 'pending', label: 'Pending', color: 'text-slate-500' },
  { value: 'in_progress', label: 'In Progress', color: 'text-amber-600' },
  { value: 'done', label: 'Done', color: 'text-emerald-600' },
];

export default function EventPanel({ open, onClose, event, eventTypes, teamMembers, onSave, onDelete, clickedDate }) {
  const [form, setForm] = useState({
    name: '', event_date: '', start_time: '', end_time: '',
    description: '', location: '', budget: '', expected_attendees: '',
    event_type: '', event_type_color: '#8B5CF6', status: 'planned',
    requirements: [], tasks: [],
  });
  const [saving, setSaving] = useState(false);
  const [newReq, setNewReq] = useState('');

  useEffect(() => {
    if (event?.id) {
      setForm({
        name: event.name || '',
        event_date: event.event_date || '',
        start_time: event.start_time || '',
        end_time: event.end_time || '',
        description: event.description || '',
        location: event.location || '',
        budget: event.budget ?? '',
        expected_attendees: event.expected_attendees ?? '',
        event_type: event.event_type || '',
        event_type_color: event.event_type_color || '#8B5CF6',
        status: event.status || 'planned',
        requirements: event.requirements || [],
        tasks: (event.tasks || []).map(t => ({ ...t })),
      });
    } else {
      setForm({
        name: '', event_date: clickedDate || '', start_time: '09:00', end_time: '17:00',
        description: '', location: '', budget: '', expected_attendees: '',
        event_type: '', event_type_color: '#8B5CF6', status: 'planned',
        requirements: [], tasks: [],
      });
    }
    setNewReq('');
  }, [event, clickedDate, open]);

  const handleSave = async () => {
    if (!form.name || !form.event_date) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        budget: form.budget ? parseFloat(form.budget) : null,
        expected_attendees: form.expected_attendees ? parseInt(form.expected_attendees) : null,
      });
      onClose();
    } catch { } finally { setSaving(false); }
  };

  const addRequirement = () => {
    if (!newReq.trim()) return;
    setForm(p => ({ ...p, requirements: [...p.requirements, newReq.trim()] }));
    setNewReq('');
  };

  const removeRequirement = (idx) => {
    setForm(p => ({ ...p, requirements: p.requirements.filter((_, i) => i !== idx) }));
  };

  const addTask = () => {
    setForm(p => ({
      ...p, tasks: [...p.tasks, { id: '', description: '', assigned_to_id: '', assigned_to_name: '', due_date: form.event_date || '', status: 'pending' }]
    }));
  };

  const updateTask = (idx, field, value) => {
    setForm(p => {
      const tasks = [...p.tasks];
      tasks[idx] = { ...tasks[idx], [field]: value };
      if (field === 'assigned_to_id') {
        const member = teamMembers?.find(m => m.id === value);
        tasks[idx].assigned_to_name = member?.name || '';
      }
      return { ...p, tasks };
    });
  };

  const removeTask = (idx) => {
    setForm(p => ({ ...p, tasks: p.tasks.filter((_, i) => i !== idx) }));
  };

  const selectEventType = (name) => {
    const et = eventTypes?.find(t => t.name === name);
    setForm(p => ({ ...p, event_type: name, event_type_color: et?.color || '#8B5CF6' }));
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col overflow-hidden" data-testid="event-panel">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-indigo-50 flex-shrink-0">
          <SheetTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays size={18} className="text-violet-600" />
            {event?.id ? 'Edit Event' : 'New Event'}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5 block">Event Name *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Annual Product Launch" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" data-testid="event-name-input" />
          </div>

          {/* Date + Time Row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5 block">Date *</label>
              <input type="date" value={form.event_date} onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" data-testid="event-date-input" />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5 block">Start Time</label>
              <input type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" data-testid="event-start-input" />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5 block">End Time</label>
              <input type="time" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" data-testid="event-end-input" />
            </div>
          </div>

          {/* Event Type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5 block">Event Type</label>
              <Select value={form.event_type || ""} onValueChange={selectEventType}>
                <SelectTrigger className="h-10 text-sm border-slate-200" data-testid="event-type-select">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {(eventTypes || []).map(et => (
                    <SelectItem key={et.id} value={et.name}>
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: et.color }} />
                        {et.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5 block">Status</label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="h-10 text-sm border-slate-200" data-testid="event-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Location + Budget + Attendees */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5 block flex items-center gap-1"><MapPin size={10} /> Location</label>
              <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                placeholder="Venue" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" data-testid="event-location-input" />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5 block flex items-center gap-1"><DollarSign size={10} /> Budget</label>
              <input type="number" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))}
                placeholder="0" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" data-testid="event-budget-input" />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5 block flex items-center gap-1"><Users size={10} /> Attendees</label>
              <input type="number" value={form.expected_attendees} onChange={e => setForm(p => ({ ...p, expected_attendees: e.target.value }))}
                placeholder="0" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm" data-testid="event-attendees-input" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5 block">Description</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2} placeholder="Event details..." className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm resize-none" data-testid="event-desc-input" />
          </div>

          {/* Requirements */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-2 block flex items-center gap-1.5">
              <ListChecks size={12} /> Requirements
            </label>
            <div className="space-y-1.5 mb-3">
              {form.requirements.map((req, i) => (
                <div key={i} className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2" data-testid={`req-item-${i}`}>
                  <span className="text-sm text-slate-700 flex-1">{req}</span>
                  <button onClick={() => removeRequirement(i)} className="p-0.5 hover:bg-red-50 rounded"><X size={12} className="text-slate-400 hover:text-red-500" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newReq} onChange={e => setNewReq(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addRequirement()}
                placeholder="e.g. 500 brochures, 2 standees..." className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" data-testid="req-input" />
              <button onClick={addRequirement} className="px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 flex items-center gap-1" data-testid="add-req-btn">
                <Plus size={12} /> Add
              </button>
            </div>
          </div>

          {/* Marketing Team Tasks */}
          <div className="bg-indigo-50/50 rounded-xl border border-indigo-200/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] font-medium uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                <ClipboardList size={12} /> Marketing Team Tasks
              </label>
              <button onClick={addTask} className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-[10px] font-medium hover:bg-indigo-700 flex items-center gap-1" data-testid="add-task-btn">
                <Plus size={10} /> Add Task
              </button>
            </div>
            <div className="space-y-2">
              {form.tasks.map((task, i) => (
                <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 space-y-2" data-testid={`task-item-${i}`}>
                  <div className="flex gap-2">
                    <input value={task.description} onChange={e => updateTask(i, 'description', e.target.value)}
                      placeholder="Task description..." className="flex-1 border border-slate-200 rounded-md px-2.5 py-1.5 text-sm" data-testid={`task-desc-${i}`} />
                    <button onClick={() => removeTask(i)} className="p-1 hover:bg-red-50 rounded"><X size={12} className="text-slate-400 hover:text-red-500" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={task.assigned_to_id || ""} onValueChange={v => updateTask(i, 'assigned_to_id', v)}>
                      <SelectTrigger className="h-8 text-xs border-slate-200" data-testid={`task-assignee-${i}`}>
                        <SelectValue placeholder="Assign to..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(teamMembers || []).map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <input type="date" value={task.due_date || ''} onChange={e => updateTask(i, 'due_date', e.target.value)}
                      className="h-8 px-2 border border-slate-200 rounded-md text-xs" data-testid={`task-due-${i}`} />
                    <Select value={task.status} onValueChange={v => updateTask(i, 'status', v)}>
                      <SelectTrigger className="h-8 text-xs border-slate-200" data-testid={`task-status-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
              {form.tasks.length === 0 && (
                <p className="text-xs text-indigo-400 text-center py-2">No tasks yet. Add what's needed from the marketing team.</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 flex-shrink-0 flex items-center justify-between">
          {event?.id ? (
            <button onClick={() => { onDelete(event.id); onClose(); }} className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1" data-testid="delete-event-btn"><Trash2 size={14} /> Delete</button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors" data-testid="cancel-event-btn">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.name || !form.event_date}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              data-testid="save-event-btn"><Save size={14} /> {saving ? 'Saving...' : 'Save Event'}</button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
