import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import {
  ArrowLeft, Plus, Pencil, Trash2, Users, ListChecks, Wallet, Paperclip, Download,
  Clock, Link2, RefreshCw, Check, X, FileText, Phone, Mail, AlertCircle, Building2,
  UserRound, LayoutGrid, History, Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { EventForm, authHeaders } from './Events';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const ACCENT = '#002FA7';

const TASK_STATUS = {
  not_started: { label: 'Not Started', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
  in_progress: { label: 'In Progress', chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  blocked: { label: 'Blocked', chip: 'bg-[#FF3B30]/10 text-red-700 border-red-200' },
  done: { label: 'Done', chip: 'bg-[#34C759]/10 text-green-800 border-green-200' },
};

const BUDGET_STATE = {
  draft: { label: 'Draft', chip: 'bg-slate-100 text-slate-700 border-slate-300' },
  pending_approval: { label: 'Pending Approval', chip: 'bg-[#FFD600]/20 text-yellow-900 border-yellow-300' },
  approved: { label: 'Approved', chip: 'bg-[#34C759]/10 text-green-800 border-green-300' },
  rejected: { label: 'Rejected', chip: 'bg-[#FF3B30]/10 text-red-700 border-red-300' },
};

const ACTION_BTN = {
  positive: 'bg-[#34C759] hover:bg-[#2eb350] text-white rounded-sm',
  negative: 'bg-[#FF3B30] hover:bg-[#e6352b] text-white rounded-sm',
  neutral: 'rounded-sm border-slate-300',
};

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const today = () => new Date().toISOString().slice(0, 10);
const initials = (name) => (name || '?').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

const TH = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.05em] text-slate-500';
const cellInput = 'h-10 px-3 text-[15px] rounded-sm border-slate-300 bg-white focus-visible:ring-2 focus-visible:ring-[#002FA7]/30 focus-visible:border-[#002FA7]';
const cellSelect = 'h-10 w-full rounded-sm border border-slate-300 bg-white px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#002FA7]/30 focus:border-[#002FA7]';
const editRowCls = 'relative bg-blue-50/30 ring-1 ring-[#002FA7] shadow-md align-top';
const viewRowCls = 'border-b border-slate-100 hover:bg-slate-50 transition-colors group align-top';

function Field({ label, children }) {
  return (
    <div>
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#002FA7] mb-1">{label}</span>
      {children}
    </div>
  );
}

function RowActions({ onSave, onCancel }) {
  return (
    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
      <Button size="icon" className="h-7 w-7 rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" onClick={onSave} title="Save" data-testid="row-save-btn"><Check className="h-4 w-4" /></Button>
      <Button size="icon" variant="outline" className="h-7 w-7 rounded-sm" onClick={onCancel} title="Cancel" data-testid="row-cancel-btn"><X className="h-4 w-4" /></Button>
    </div>
  );
}

function HoverActions({ onEdit, onDelete, disabled, editTitle = 'Edit', editTestId, extra }) {
  return (
    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {extra}
      {onEdit && (
        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-sm hover:bg-slate-200/60" disabled={disabled} title={editTitle} onClick={onEdit} data-testid={editTestId}>
          <Pencil className="h-3.5 w-3.5 text-slate-600" />
        </Button>
      )}
      {onDelete && (
        <Button size="icon" variant="ghost" className="h-7 w-7 rounded-sm text-[#FF3B30] hover:bg-red-50" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="border border-dashed border-slate-300 rounded-sm py-14 flex flex-col items-center gap-2 text-center bg-white">
      <div className="h-10 w-10 rounded-sm bg-slate-100 flex items-center justify-center"><Icon className="h-5 w-5 text-slate-400" /></div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}

export default function EventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [ev, setEv] = useState(null);
  const [users, setUsers] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  const [shEdit, setShEdit] = useState(null);
  const [taskEdit, setTaskEdit] = useState(null);
  const [budEdit, setBudEdit] = useState(null);
  const [transDialog, setTransDialog] = useState(null);
  const fileRefs = useRef({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/events/${eventId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Event not found');
      setEv(await res.json());
    } catch (e) { toast.error(e.message); }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/users`, { headers: authHeaders() });
        const d = await res.json();
        setUsers(Array.isArray(d) ? d : d.users || []);
      } catch { /* optional */ }
    })();
  }, []);

  const api = async (method, path, body) => {
    const res = await fetch(`${API_URL}/api/events/${eventId}${path}`, {
      method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Request failed');
    return res.json();
  };

  const saveStakeholder = async () => {
    if (!shEdit.contact_name?.trim()) return toast.error('Contact name is required');
    try {
      await api(shEdit.id ? 'PUT' : 'POST', shEdit.id ? `/stakeholders/${shEdit.id}` : '/stakeholders', shEdit);
      toast.success('Stakeholder saved');
      setShEdit(null); load();
    } catch (e) { toast.error(e.message); }
  };

  const saveTask = async () => {
    if (!taskEdit.name?.trim()) return toast.error('Task name is required');
    try {
      await api(taskEdit.id ? 'PUT' : 'POST', taskEdit.id ? `/tasks/${taskEdit.id}` : '/tasks', taskEdit);
      toast.success('Task saved');
      setTaskEdit(null); load();
    } catch (e) { toast.error(e.message); }
  };

  const setTaskStatus = async (t, status) => {
    try { await api('PUT', `/tasks/${t.id}`, { ...t, status }); load(); }
    catch (e) { toast.error(e.message); }
  };

  const saveBudget = async () => {
    if (!budEdit.category?.trim()) return toast.error('Category is required');
    try {
      await api(budEdit.id ? 'PUT' : 'POST', budEdit.id ? `/budget-items/${budEdit.id}` : '/budget-items', {
        ...budEdit,
        planned_amount: parseFloat(budEdit.planned_amount) || 0,
        actual_amount: budEdit.actual_amount === '' || budEdit.actual_amount == null ? null : parseFloat(budEdit.actual_amount),
      });
      toast.success('Budget line saved');
      setBudEdit(null); load();
    } catch (e) { toast.error(e.message); }
  };

  const del = async (path, msg) => {
    if (!window.confirm(msg)) return;
    try { await api('DELETE', path); load(); } catch (e) { toast.error(e.message); }
  };

  const uploadFile = async (taskId, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_URL}/api/events/${eventId}/tasks/${taskId}/files`, {
      method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: fd,
    });
    if (!res.ok) return toast.error((await res.json()).detail || 'Upload failed');
    toast.success('File uploaded');
    load();
  };

  const downloadFile = async (taskId, f) => {
    const res = await fetch(`${API_URL}/api/events/${eventId}/tasks/${taskId}/files/${f.id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = f.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const uploadBudgetFile = async (bid, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_URL}/api/events/${eventId}/budget-items/${bid}/files`, {
      method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: fd,
    });
    if (!res.ok) return toast.error((await res.json()).detail || 'Upload failed');
    toast.success('Bill attached');
    load();
  };

  const downloadBudgetFile = async (bid, f) => {
    const res = await fetch(`${API_URL}/api/events/${eventId}/budget-items/${bid}/files/${f.id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = f.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadReport = async () => {
    try {
      const res = await fetch(`${API_URL}/api/events/${eventId}/report`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('Report generation failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${ev.name} - Event Report.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Report downloaded');
    } catch (e) { toast.error(e.message); }
  };

  const openTransition = (t) => {
    setTransDialog({
      ...t,
      comment: '',
      lines: t.action_key === 'approve'
        ? (ev.budget_items || []).map((b) => ({ id: b.id, category: b.category, planned_amount: b.planned_amount, approved_amount: b.approved_amount ?? b.planned_amount ?? 0 }))
        : [],
    });
  };

  const runBudgetTransition = async () => {
    if (transDialog.comment_required && !transDialog.comment?.trim()) return toast.error('A comment is required for this action');
    try {
      await api('POST', '/budget/transition', {
        action_key: transDialog.action_key,
        comment: transDialog.comment?.trim() || null,
        line_approvals: (transDialog.lines || []).map((l) => ({ id: l.id, approved_amount: parseFloat(l.approved_amount) || 0 })),
      });
      toast.success(`Budget: ${transDialog.label} done`);
      setTransDialog(null); load();
    } catch (e) { toast.error(e.message); }
  };

  if (!ev) return <div className="flex items-center justify-center py-24 text-slate-500"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;

  const taskName = (id) => (ev.tasks.find((t) => t.id === id) || {}).name || '?';
  const doneCount = ev.tasks.filter((t) => t.status === 'done').length;

  // ── Scope chips editor (inline) ──
  const ScopeEditor = ({ form, setForm }) => (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {[...new Set([...(ev.scopes || []), ...(form.scopes || [])])].map((sc) => {
          const on = (form.scopes || []).includes(sc);
          return (
            <button key={sc} type="button"
              className={`inline-flex items-center px-2.5 py-1 rounded-sm text-sm border whitespace-nowrap transition-colors ${on ? 'bg-[#002FA7] text-white border-[#002FA7]' : 'bg-white text-slate-700 border-slate-300 hover:border-[#002FA7]/50'}`}
              onClick={() => setForm((p) => ({ ...p, scopes: on ? p.scopes.filter((x) => x !== sc) : [...(p.scopes || []), sc] }))}
              data-testid={`stakeholder-scope-${sc.replace(/\s/g, '-')}`}>{sc}</button>
          );
        })}
      </div>
      <Input placeholder="Type a custom scope and press Enter" className={`${cellInput} w-full max-w-[260px]`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target.value.trim()) {
            const v = e.target.value.trim();
            setForm((p) => ({ ...p, scopes: [...new Set([...(p.scopes || []), v])] }));
            e.target.value = '';
          }
        }} data-testid="stakeholder-custom-scope-input" />
    </div>
  );

  const StakeholderEditRow = (sno) => (
    <tr className={editRowCls} data-testid="stakeholder-edit-row">
      <td className="w-12 px-4 py-4 text-center text-xs font-mono text-slate-400 select-none">{sno || '+'}</td>
      <td className="px-4 py-4 min-w-[300px]">
        <div className="space-y-3">
          <Field label="Type">
            <select className={cellSelect}
              value={shEdit.is_internal ? 'internal' : 'external'}
              onChange={(e) => setShEdit((p) => ({ ...p, is_internal: e.target.value === 'internal', company_name: e.target.value === 'internal' ? '' : p.company_name, user_id: e.target.value === 'internal' ? p.user_id : '' }))}
              data-testid="stakeholder-type-select">
              <option value="external">External vendor</option>
              <option value="internal">Internal employee</option>
            </select>
          </Field>
          {shEdit.is_internal ? (
            <Field label="Employee">
              <select className={cellSelect} value={shEdit.user_id || ''}
                onChange={(e) => {
                  const u = users.find((x) => x.id === e.target.value);
                  setShEdit((p) => ({ ...p, user_id: e.target.value, contact_name: u?.name || '', email: u?.email || '', phone: u?.phone || p.phone }));
                }} data-testid="stakeholder-user-select">
                <option value="">Select employee…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Company">
              <Input className={cellInput} placeholder="e.g. PixelWorks Photography" value={shEdit.company_name || ''} onChange={(e) => setShEdit((p) => ({ ...p, company_name: e.target.value }))} data-testid="stakeholder-company-input" />
            </Field>
          )}
          <Field label="Contact Name *">
            <Input className={cellInput} placeholder="Full name of the contact person" value={shEdit.contact_name || ''} onChange={(e) => setShEdit((p) => ({ ...p, contact_name: e.target.value }))} data-testid="stakeholder-contact-input" />
          </Field>
        </div>
      </td>
      <td className="px-4 py-4 min-w-[280px]">
        <div className="space-y-3">
          <Field label="Phone">
            <Input className={cellInput} placeholder="e.g. 98765 43210" value={shEdit.phone || ''} onChange={(e) => setShEdit((p) => ({ ...p, phone: e.target.value }))} data-testid="stakeholder-phone-input" />
          </Field>
          <Field label="Email">
            <Input className={cellInput} type="email" placeholder="name@company.com" value={shEdit.email || ''} onChange={(e) => setShEdit((p) => ({ ...p, email: e.target.value }))} data-testid="stakeholder-email-input" />
          </Field>
        </div>
      </td>
      <td className="px-4 py-4 min-w-[220px]"><Field label="Scope of Work">{ScopeEditor({ form: shEdit, setForm: setShEdit })}</Field></td>
      <td className="px-4 py-4 w-24 align-middle"><RowActions onSave={saveStakeholder} onCancel={() => setShEdit(null)} /></td>
    </tr>
  );

  const TaskEditRow = (sno) => (
    <tr className={editRowCls} data-testid="task-edit-row">
      <td className="w-12 px-4 py-4 text-center text-xs font-mono text-slate-400 select-none">{sno || '+'}</td>
      <td className="px-4 py-4 min-w-[280px]">
        <div className="space-y-3">
          <Field label="Task Name *">
            <Input className={cellInput} placeholder="What needs to be done?" value={taskEdit.name || ''} onChange={(e) => setTaskEdit((p) => ({ ...p, name: e.target.value }))} data-testid="task-name-input" />
          </Field>
          <Field label="Description">
            <Input className={cellInput} placeholder="Optional details" value={taskEdit.description || ''} onChange={(e) => setTaskEdit((p) => ({ ...p, description: e.target.value }))} data-testid="task-desc-input" />
          </Field>
        </div>
      </td>
      <td className="px-4 py-4 min-w-[210px]">
        <Field label="Owner">
        <select className={cellSelect}
          value={taskEdit.owner_type && taskEdit.owner_id ? `${taskEdit.owner_type}:${taskEdit.owner_id}` : ''}
          onChange={(e) => {
            if (!e.target.value) return setTaskEdit((p) => ({ ...p, owner_type: '', owner_id: '', owner_name: '' }));
            const [type, oid] = e.target.value.split(':');
            const name = type === 'user' ? (users.find((u) => u.id === oid)?.name || '') : (ev.stakeholders.find((s) => s.id === oid)?.contact_name || '');
            setTaskEdit((p) => ({ ...p, owner_type: type, owner_id: oid, owner_name: name }));
          }} data-testid="task-owner-select">
          <option value="">Unassigned</option>
          <optgroup label="Stakeholders">
            {ev.stakeholders.map((s) => <option key={s.id} value={`stakeholder:${s.id}`}>{s.contact_name}{s.company_name ? ` (${s.company_name})` : ''}</option>)}
          </optgroup>
          <optgroup label="Employees">
            {users.map((u) => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}
          </optgroup>
        </select>
        </Field>
      </td>
      <td className="px-4 py-4 min-w-[290px]">
        <div className="flex items-end gap-2">
          <Field label="Start">
            <Input className={`${cellInput} w-[130px]`} type="date" value={taskEdit.start_date || ''} onChange={(e) => setTaskEdit((p) => ({ ...p, start_date: e.target.value }))} data-testid="task-start-input" />
          </Field>
          <span className="text-slate-400 text-sm pb-2.5">→</span>
          <Field label="End">
            <Input className={`${cellInput} w-[130px]`} type="date" value={taskEdit.end_date || ''} onChange={(e) => setTaskEdit((p) => ({ ...p, end_date: e.target.value }))} data-testid="task-end-input" />
          </Field>
        </div>
      </td>
      <td className="px-4 py-4 min-w-[180px]">
        <Field label="Depends On">
        <div className="flex flex-wrap gap-1.5">
          {ev.tasks.filter((t) => t.id !== taskEdit.id).map((t) => {
            const on = (taskEdit.depends_on || []).includes(t.id);
            return (
              <button key={t.id} type="button"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-sm border whitespace-nowrap transition-colors ${on ? 'bg-orange-500 text-white border-orange-500' : 'bg-orange-50 text-orange-700 border-orange-200 hover:border-orange-400'}`}
                onClick={() => setTaskEdit((p) => ({ ...p, depends_on: on ? p.depends_on.filter((x) => x !== t.id) : [...(p.depends_on || []), t.id] }))}
                data-testid={`task-dep-${t.name.replace(/\s/g, '-')}`}><Link2 className="h-3 w-3" />{t.name}</button>
            );
          })}
          {ev.tasks.filter((t) => t.id !== taskEdit.id).length === 0 && <span className="text-sm text-slate-400">No other tasks</span>}
        </div>
        </Field>
      </td>
      <td className="px-4 py-4 w-40 min-w-[150px]">
        <Field label="Status">
        <select className={cellSelect} value={taskEdit.status}
          onChange={(e) => setTaskEdit((p) => ({ ...p, status: e.target.value }))} data-testid="task-status-input">
          {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        </Field>
      </td>
      <td className="px-4 py-4 text-sm text-slate-400">{taskEdit.id ? `${(taskEdit.files || []).length} file(s)` : 'Save first'}</td>
      <td className="px-4 py-4 w-24 align-middle"><RowActions onSave={saveTask} onCancel={() => setTaskEdit(null)} /></td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-slate-50" data-testid="event-detail-page">
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-sm" onClick={() => navigate('/events')} data-testid="event-back-btn"><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{ev.name}</h1>
              <p className="text-slate-500 text-sm">{ev.date_from}{ev.date_to !== ev.date_from ? ` → ${ev.date_to}` : ''}{ev.location ? ` · ${ev.location}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-sm border border-slate-300 bg-white text-xs font-semibold uppercase tracking-wider text-slate-600">{(ev.status || '').replace('_', ' ')}</span>
            <Button variant="outline" className="rounded-sm" onClick={downloadReport} data-testid="event-report-btn"><FileText className="h-4 w-4 mr-2" /> Report</Button>
            <Button variant="outline" className="rounded-sm" onClick={() => setShowEdit(true)} data-testid="event-edit-btn"><Pencil className="h-4 w-4 mr-2" /> Edit Event</Button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 border border-slate-200 rounded-sm bg-white divide-x divide-slate-200 overflow-hidden">
          <div className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1.5">Plan Progress</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-semibold tabular-nums text-slate-900">{ev.progress}%</span>
              <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${ev.progress}%`, backgroundColor: ACCENT }} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{doneCount}/{ev.tasks.length} tasks done</p>
          </div>
          <div className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1.5">Stakeholders</p>
            <p className="font-mono text-xl font-semibold tabular-nums text-slate-900">{ev.stakeholders.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">{ev.stakeholders.filter((s) => s.is_internal).length} internal · {ev.stakeholders.filter((s) => !s.is_internal).length} external</p>
          </div>
          <div className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1.5">Budget</p>
            <p className="font-mono text-xl font-semibold tabular-nums text-slate-900">{inr(ev.budget_planned_total)}</p>
            <p className="text-[11px] text-slate-400 mt-1">Appr {inr(ev.budget_approved_total)} · Act {inr(ev.budget_actual_total)}</p>
          </div>
          <div className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 mb-1.5">Budget Status</p>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-sm border text-xs font-bold uppercase tracking-widest ${(BUDGET_STATE[ev.budget_state] || BUDGET_STATE.draft).chip}`}>{ev.budget_state_label || 'Draft'}</span>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="w-full justify-start gap-8 bg-transparent p-0 h-auto rounded-none border-b border-slate-200">
            {[
              { v: 'overview', icon: LayoutGrid, label: 'Overview' },
              { v: 'stakeholders', icon: Users, label: 'Stakeholders' },
              { v: 'plan', icon: ListChecks, label: 'Plan' },
              { v: 'budget', icon: Wallet, label: 'Budget' },
            ].map((t) => (
              <TabsTrigger key={t.v} value={t.v} data-testid={`event-tab-${t.v}`}
                className="rounded-none bg-transparent px-0 pb-3 pt-1 text-sm font-medium text-slate-500 border-b-2 border-transparent shadow-none data-[state=active]:shadow-none data-[state=active]:bg-transparent data-[state=active]:text-[#002FA7] data-[state=active]:border-[#002FA7] transition-colors hover:text-slate-900">
                <t.icon className="h-4 w-4 mr-1.5" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── OVERVIEW ── */}
          <TabsContent value="overview" className="mt-6 space-y-4">
            <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-3">
              {ev.description && <p className="text-sm text-slate-700 leading-relaxed">{ev.description}</p>}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {ev.event_type && <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Type</p><p className="font-medium text-slate-900">{ev.event_type}</p></div>}
                {ev.budget != null && <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Overall Budget</p><p className="font-mono font-medium tabular-nums text-slate-900">{inr(ev.budget)}</p></div>}
                {ev.expected_attendees != null && <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Expected Attendees</p><p className="font-medium text-slate-900">{ev.expected_attendees}</p></div>}
                <div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Created By</p><p className="font-medium text-slate-900">{ev.created_by_name}</p></div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-sm p-5">
              <p className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-[#002FA7]" /> Day-by-day Schedule</p>
              {(ev.day_schedules || []).length === 0 ? <p className="text-sm text-slate-500">No day schedules set.</p> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ev.day_schedules.map((s) => (
                    <div key={s.date} className="rounded-sm border border-slate-200 p-3 text-sm hover:border-[#002FA7]/40 transition-colors" data-testid={`event-day-schedule-${s.date}`}>
                      <p className="font-semibold text-slate-900">{new Date(s.date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}</p>
                      <p className="text-slate-500 font-mono text-xs mt-0.5">{s.start_time || '—'} to {s.end_time || '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── STAKEHOLDERS ── */}
          <TabsContent value="stakeholders" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500">{ev.stakeholders.length} stakeholder{ev.stakeholders.length === 1 ? '' : 's'}</p>
              <Button size="sm" className="rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" disabled={!!shEdit}
                onClick={() => setShEdit({ id: null, is_internal: false, contact_name: '', company_name: '', phone: '', email: '', scopes: [], user_id: '' })} data-testid="stakeholder-new-btn">
                <Plus className="h-4 w-4 mr-1.5" /> Add Stakeholder
              </Button>
            </div>
            {ev.stakeholders.length === 0 && !shEdit ? (
              <EmptyState icon={Users} title="No stakeholders yet" hint="Add vendors (photography, printing, standees…) and internal team members inline." />
            ) : (
              <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
                <table className="w-full text-sm" data-testid="stakeholders-table">
                  <thead><tr className="border-b border-slate-200 bg-slate-50">
                    <th className={`${TH} w-12 text-center`}>S.No</th>
                    <th className={TH}>Company / Name</th>
                    <th className={TH}>Contact</th>
                    <th className={TH}>Scope</th>
                    <th className={`${TH} w-24`}></th>
                  </tr></thead>
                  <tbody>
                    {shEdit && !shEdit.id && StakeholderEditRow()}
                    {ev.stakeholders.map((s, i) => (
                      shEdit?.id === s.id ? <React.Fragment key={s.id}>{StakeholderEditRow(i + 1)}</React.Fragment> : (
                      <tr key={s.id} className={viewRowCls} data-testid={`stakeholder-row-${s.contact_name.replace(/\s/g, '-')}`}>
                        <td className="w-12 px-4 py-3 text-center text-xs font-mono text-slate-400 select-none">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 shrink-0 rounded-sm flex items-center justify-center text-xs font-bold ${s.is_internal ? 'bg-[#002FA7]/10 text-[#002FA7]' : 'bg-slate-100 text-slate-600'}`}>
                              {s.is_internal ? <UserRound className="h-4 w-4" /> : (s.company_name ? initials(s.company_name) : <Building2 className="h-4 w-4" />)}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 leading-tight">{s.contact_name}</p>
                              <p className="text-xs text-slate-500">{s.is_internal ? 'Internal employee' : (s.company_name || 'External')}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1 text-sm text-slate-700">
                            {s.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" /><span className="font-mono">{s.phone}</span></p>}
                            {s.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-400" />{s.email}</p>}
                            {!s.phone && !s.email && <span className="text-slate-400">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {(s.scopes || []).map((sc) => <span key={sc} className="inline-flex items-center px-2.5 py-1 rounded-sm text-sm border bg-slate-50 text-slate-700 border-slate-200">{sc}</span>)}
                            {(s.scopes || []).length === 0 && <span className="text-slate-400 text-sm">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 w-24">
                          <HoverActions disabled={!!shEdit} onEdit={() => setShEdit({ ...s })} editTestId={`stakeholder-edit-${s.contact_name.replace(/\s/g, '-')}`}
                            onDelete={() => del(`/stakeholders/${s.id}`, `Remove ${s.contact_name}?`)} />
                        </td>
                      </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {shEdit && !shEdit.id && ev.stakeholders.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
                <table className="w-full text-sm"><tbody>{StakeholderEditRow()}</tbody></table>
              </div>
            )}
          </TabsContent>

          {/* ── PLAN ── */}
          <TabsContent value="plan" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500">{doneCount}/{ev.tasks.length} done</p>
                <div className="w-32 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${ev.progress}%`, backgroundColor: ACCENT }} />
                </div>
              </div>
              <Button size="sm" className="rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" disabled={!!taskEdit}
                onClick={() => setTaskEdit({ id: null, name: '', description: '', owner_type: '', owner_id: '', owner_name: '', start_date: '', end_date: '', depends_on: [], status: 'not_started' })} data-testid="task-new-btn">
                <Plus className="h-4 w-4 mr-1.5" /> Add Task
              </Button>
            </div>
            {ev.tasks.length === 0 && !taskEdit ? (
              <EmptyState icon={ListChecks} title="No plan tasks yet" hint="Build the event project plan — tasks, owners, dates and dependencies, all inline." />
            ) : (
              <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
                <table className="w-full text-sm" data-testid="tasks-table">
                  <thead><tr className="border-b border-slate-200 bg-slate-50">
                    <th className={`${TH} w-12 text-center`}>S.No</th>
                    <th className={TH}>Task</th>
                    <th className={TH}>Owner</th>
                    <th className={TH}>Timeline</th>
                    <th className={TH}>Depends On</th>
                    <th className={`${TH} w-32`}>Status</th>
                    <th className={TH}>Files</th>
                    <th className={`${TH} w-24`}></th>
                  </tr></thead>
                  <tbody>
                    {taskEdit && !taskEdit.id && TaskEditRow()}
                    {ev.tasks.map((t, i) => {
                      if (taskEdit?.id === t.id) return <React.Fragment key={t.id}>{TaskEditRow(i + 1)}</React.Fragment>;
                      const overdue = t.status !== 'done' && t.end_date && t.end_date < today();
                      const st = TASK_STATUS[t.status] || TASK_STATUS.not_started;
                      return (
                        <tr key={t.id} className={viewRowCls} data-testid={`task-row-${t.name.replace(/\s/g, '-')}`}>
                          <td className="w-12 px-4 py-3 text-center text-xs font-mono text-slate-400 select-none">{i + 1}</td>
                          <td className="px-4 py-3">
                            <p className={`font-semibold leading-tight ${t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{t.name}</p>
                            {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                          </td>
                          <td className="px-4 py-3">
                            {t.owner_name ? (
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 shrink-0 rounded-sm bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold">{initials(t.owner_name)}</div>
                                <span className="text-slate-700">{t.owner_name}</span>
                              </div>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap font-mono text-xs ${overdue ? 'text-[#FF3B30] font-semibold' : 'text-slate-600'}`}>
                            <span className="flex items-center gap-1.5">
                              {overdue && <AlertCircle className="h-3.5 w-3.5" />}
                              {t.start_date || '…'} → {t.end_date || '…'}
                            </span>
                            {overdue && <span className="block text-[10px] font-bold uppercase tracking-wider mt-0.5">Overdue</span>}
                          </td>
                          <td className="px-4 py-3">
                            {(t.depends_on || []).length > 0
                              ? <div className="flex flex-wrap gap-1">{t.depends_on.map((d) => <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs border bg-orange-50 text-orange-700 border-orange-200"><Link2 className="h-2.5 w-2.5" />{taskName(d)}</span>)}</div>
                              : <span className="text-slate-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 w-32">
                            <select className={`h-8 rounded-sm border px-2 pr-6 text-sm font-semibold cursor-pointer transition-colors ${st.chip}`} value={t.status}
                              onChange={(e) => setTaskStatus(t, e.target.value)} data-testid={`task-status-${t.name.replace(/\s/g, '-')}`}>
                              {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1">
                              {(t.files || []).map((f) => (
                                <button key={f.id} onClick={() => downloadFile(t.id, f)} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-sm border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-[#002FA7]/40 transition-colors max-w-[110px] truncate" title={f.filename} data-testid={`task-file-${f.filename}`}>
                                  <Download className="h-3 w-3 shrink-0 text-slate-500" /> <span className="truncate">{f.filename}</span>
                                </button>
                              ))}
                              <input type="file" hidden ref={(el) => { fileRefs.current[t.id] = el; }} onChange={(e) => uploadFile(t.id, e.target.files[0])} />
                              <Button size="icon" variant="ghost" className="h-6 w-6 rounded-sm hover:bg-slate-200/60" title="Attach file" onClick={() => fileRefs.current[t.id]?.click()} data-testid={`task-upload-${t.name.replace(/\s/g, '-')}`}><Paperclip className="h-3.5 w-3.5 text-slate-500" /></Button>
                            </div>
                          </td>
                          <td className="px-4 py-3 w-24">
                            <HoverActions disabled={!!taskEdit} onEdit={() => setTaskEdit({ ...t })} editTestId={`task-edit-${t.name.replace(/\s/g, '-')}`}
                              onDelete={() => del(`/tasks/${t.id}`, `Delete task "${t.name}"?`)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {taskEdit && !taskEdit.id && ev.tasks.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
                <table className="w-full text-sm"><tbody>{TaskEditRow()}</tbody></table>
              </div>
            )}
          </TabsContent>

          {/* ── BUDGET ── */}
          <TabsContent value="budget" className="mt-6 space-y-4">
            {(() => {
              const bState = ev.budget_state || 'draft';
              const bs = BUDGET_STATE[bState] || BUDGET_STATE.draft;
              const isDraft = bState === 'draft';
              const isApproved = bState === 'approved';

              const BudgetEditRow = () => {
                const lockPlan = isApproved;
                return (
                  <tr className={editRowCls} data-testid="budget-edit-row">
                    <td className="px-4 py-4 min-w-[190px]"><Field label="Category *"><Input className={cellInput} placeholder="e.g. Printing" disabled={lockPlan} value={budEdit.category || ''} onChange={(e) => setBudEdit((p) => ({ ...p, category: e.target.value }))} data-testid="budget-category-input" /></Field></td>
                    <td className="px-4 py-4 min-w-[220px]"><Field label="Description"><Input className={cellInput} placeholder="What is this spend for?" disabled={lockPlan} value={budEdit.description || ''} onChange={(e) => setBudEdit((p) => ({ ...p, description: e.target.value }))} data-testid="budget-desc-input" /></Field></td>
                    <td className="px-4 py-4 min-w-[170px]"><Field label="Vendor"><Input className={cellInput} placeholder="Vendor name" disabled={lockPlan} value={budEdit.vendor || ''} onChange={(e) => setBudEdit((p) => ({ ...p, vendor: e.target.value }))} data-testid="budget-vendor-input" /></Field></td>
                    <td className="px-4 py-4 min-w-[140px]"><Field label="Planned ₹"><Input className={`${cellInput} text-right font-mono`} type="number" min="0" placeholder="0" disabled={lockPlan} value={budEdit.planned_amount} onChange={(e) => setBudEdit((p) => ({ ...p, planned_amount: e.target.value }))} data-testid="budget-planned-input" /></Field></td>
                    <td className="px-4 py-4 text-right font-mono text-sm text-slate-400 align-bottom pb-6 tabular-nums">{budEdit.approved_amount != null ? inr(budEdit.approved_amount) : '—'}</td>
                    <td className="px-4 py-4 min-w-[140px]"><Field label="Actual ₹"><Input className={`${cellInput} text-right font-mono`} type="number" min="0" placeholder="0" value={budEdit.actual_amount ?? ''} onChange={(e) => setBudEdit((p) => ({ ...p, actual_amount: e.target.value }))} data-testid="budget-actual-input" /></Field></td>
                    <td className="px-4 py-4"></td>
                    <td className="px-4 py-4 text-sm text-slate-400 align-bottom pb-6">{budEdit.id ? `${(budEdit.files || []).length} bill(s)` : 'Save first'}</td>
                    <td className="px-4 py-4 w-24 align-middle"><RowActions onSave={saveBudget} onCancel={() => setBudEdit(null)} /></td>
                  </tr>
                );
              };

              return (
                <>
                  {/* Workflow header card */}
                  <div className="bg-white border border-slate-200 rounded-sm p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`px-3 py-1 border rounded-sm text-xs font-bold uppercase tracking-widest ${bs.chip}`} data-testid="budget-state-chip">{ev.budget_state_label || bs.label}</span>
                      {(ev.budget_transitions || []).map((t) => (
                        <Button key={`${t.action_key}-${t.to_state}`} size="sm" variant={t.kind === 'neutral' ? 'outline' : 'default'}
                          className={ACTION_BTN[t.kind] || 'rounded-sm'} onClick={() => openTransition(t)}
                          data-testid={`budget-action-${t.action_key}`}>
                          {t.label}
                        </Button>
                      ))}
                      {isDraft && (
                        <Button size="sm" variant="outline" className="rounded-sm border-[#002FA7]/40 text-[#002FA7] hover:bg-[#002FA7]/5" disabled={!!budEdit}
                          onClick={() => setBudEdit({ id: null, category: '', description: '', planned_amount: '', actual_amount: '', vendor: '' })} data-testid="budget-new-btn">
                          <Plus className="h-4 w-4 mr-1" /> Add Budget Line
                        </Button>
                      )}
                    </div>
                    <div className="flex divide-x divide-slate-200">
                      {[
                        { label: 'Planned', value: ev.budget_planned_total },
                        { label: 'Approved', value: ev.budget_approved_total },
                        { label: 'Actual', value: ev.budget_actual_total },
                      ].map((x, idx) => (
                        <div key={x.label} className={`flex flex-col ${idx === 0 ? 'pr-6' : 'px-6'}`}>
                          <span className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{x.label}</span>
                          <span className="font-mono text-lg font-medium tabular-nums text-slate-900">{inr(x.value)}</span>
                        </div>
                      ))}
                      {ev.budget != null && ev.budget_planned_total > ev.budget && (
                        <div className="flex items-center pl-6">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs border bg-[#FF3B30]/10 text-red-700 border-red-200 font-semibold"><AlertCircle className="h-3 w-3" /> Over event budget</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {!isDraft && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-sm border text-xs font-medium ${bState === 'pending_approval' ? 'bg-[#FFD600]/10 border-yellow-300 text-yellow-900' : isApproved ? 'bg-[#34C759]/5 border-green-200 text-green-800' : 'bg-[#FF3B30]/5 border-red-200 text-red-700'}`} data-testid="budget-lock-note">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {bState === 'pending_approval' && 'Budget lines are locked while approval is pending.'}
                      {isApproved && 'Budget approved — only actual spend can be recorded. Reopen the budget to change plans.'}
                      {bState === 'rejected' && 'Budget was rejected — reopen it as draft to make changes.'}
                    </div>
                  )}

                  {ev.budget_items.length === 0 && !budEdit ? (
                    <EmptyState icon={Wallet} title="No budget lines yet" hint={isDraft ? 'Plan spend per category — then submit the whole budget for approval.' : 'Nothing was budgeted for this event.'} />
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
                      <table className="w-full text-sm" data-testid="budget-table">
                        <thead><tr className="border-b border-slate-200 bg-slate-50">
                          <th className={TH}>Category</th>
                          <th className={TH}>Description</th>
                          <th className={TH}>Vendor</th>
                          <th className={`${TH} text-right`}>Planned</th>
                          <th className={`${TH} text-right`}>Approved</th>
                          <th className={`${TH} text-right`}>Actual</th>
                          <th className={`${TH} text-right`}>Variance</th>
                          <th className={TH}>Bills</th>
                          <th className={`${TH} w-24`}></th>
                        </tr></thead>
                        <tbody>
                          {budEdit && !budEdit.id && BudgetEditRow()}
                          {ev.budget_items.map((b) => {
                            if (budEdit?.id === b.id) return <React.Fragment key={b.id}>{BudgetEditRow()}</React.Fragment>;
                            const baseline = b.approved_amount != null ? b.approved_amount : (b.planned_amount || 0);
                            const varc = (b.actual_amount != null) ? (b.actual_amount - baseline) : null;
                            return (
                              <tr key={b.id} className={viewRowCls} data-testid={`budget-row-${b.category.replace(/\s/g, '-')}`}>
                                <td className="px-4 py-3 font-semibold text-slate-900">{b.category}</td>
                                <td className="px-4 py-3 text-slate-600">{b.description || '—'}</td>
                                <td className="px-4 py-3 text-slate-600">{b.vendor || '—'}</td>
                                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">{inr(b.planned_amount)}</td>
                                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">{b.approved_amount != null ? inr(b.approved_amount) : '—'}</td>
                                <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">{b.actual_amount != null ? inr(b.actual_amount) : '—'}</td>
                                <td className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${varc > 0 ? 'text-[#FF3B30]' : varc < 0 ? 'text-[#34C759]' : 'text-slate-400'}`}>{varc != null ? (varc > 0 ? '+' : '') + inr(varc).replace('₹-', '−₹') : '—'}</td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {(b.files || []).map((f) => (
                                      <button key={f.id} onClick={() => downloadBudgetFile(b.id, f)} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-sm border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-[#002FA7]/40 transition-colors max-w-[110px] truncate" title={f.filename} data-testid={`budget-file-${f.filename}`}>
                                        <Receipt className="h-3 w-3 shrink-0 text-slate-500" /> <span className="truncate">{f.filename}</span>
                                      </button>
                                    ))}
                                    <input type="file" hidden ref={(el) => { fileRefs.current[`bud_${b.id}`] = el; }} onChange={(e) => uploadBudgetFile(b.id, e.target.files[0])} />
                                    <Button size="icon" variant="ghost" className="h-6 w-6 rounded-sm hover:bg-slate-200/60" title="Attach vendor bill" onClick={() => fileRefs.current[`bud_${b.id}`]?.click()} data-testid={`budget-upload-${b.category.replace(/\s/g, '-')}`}><Paperclip className="h-3.5 w-3.5 text-slate-500" /></Button>
                                  </div>
                                </td>
                                <td className="px-4 py-3 w-24">
                                  <HoverActions disabled={!!budEdit}
                                    onEdit={(isDraft || isApproved) ? () => setBudEdit({ ...b, actual_amount: b.actual_amount ?? '' }) : null}
                                    editTitle={isApproved ? 'Record actual spend' : 'Edit'}
                                    editTestId={`budget-edit-${b.category.replace(/\s/g, '-')}`}
                                    onDelete={isDraft ? () => del(`/budget-items/${b.id}`, `Delete budget line "${b.category}"?`) : null} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {ev.budget_items.length > 0 && (
                          <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50">
                            <td className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-600" colSpan={3}>Total</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">{inr(ev.budget_planned_total)}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-700">{inr(ev.budget_approved_total)}</td>
                            <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">{inr(ev.budget_actual_total)}</td>
                            <td className="px-4 py-3" colSpan={3}></td>
                          </tr></tfoot>
                        )}
                      </table>
                    </div>
                  )}
                  {budEdit && !budEdit.id && ev.budget_items.length === 0 && (
                    <div className="bg-white border border-slate-200 rounded-sm overflow-x-auto">
                      <table className="w-full text-sm"><tbody>{BudgetEditRow()}</tbody></table>
                    </div>
                  )}

                  {/* Approval trail */}
                  {(ev.budget_history || []).length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-sm p-5" data-testid="budget-history">
                      <p className="text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 mb-4 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Approval Trail</p>
                      <div className="relative pl-5">
                        <div className="absolute left-[5px] top-1 bottom-1 w-px bg-slate-200" />
                        <div className="space-y-4">
                          {[...ev.budget_history].reverse().map((h, idx) => (
                            <div key={h.id} className="relative">
                              <span className={`absolute -left-5 top-1 h-[11px] w-[11px] rounded-full border-2 border-white ${idx === 0 ? 'bg-[#002FA7]' : 'bg-slate-300'}`} />
                              <p className="text-sm font-semibold text-slate-900 leading-tight">{h.action_label}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{h.by_name} · {new Date(h.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                              {h.comment && <p className="text-xs text-slate-600 italic mt-1 border-l-2 border-slate-200 pl-2">“{h.comment}”</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit event */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Event</DialogTitle><DialogDescription>Update event details and day schedules.</DialogDescription></DialogHeader>
          <EventForm initial={ev} onCancel={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); load(); }} />
        </DialogContent>
      </Dialog>

      {/* Budget workflow transition dialog */}
      <Dialog open={!!transDialog} onOpenChange={(o) => !o && setTransDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="budget-transition-dialog">
          <DialogHeader>
            <DialogTitle>{transDialog?.label}</DialogTitle>
            <DialogDescription>
              {transDialog?.action_key === 'approve'
                ? 'Review each line and set the approved amount (defaults to planned).'
                : transDialog?.action_key === 'submit'
                ? 'Send the full budget for approval. Lines will be locked until a decision is made.'
                : transDialog?.action_key === 'reject'
                ? 'Reject the budget — a reason is required.'
                : 'Reopen the budget as draft for editing. It will need re-approval.'}
            </DialogDescription>
          </DialogHeader>
          {transDialog && (
            <div className="space-y-3">
              {transDialog.action_key === 'approve' && (
                <div className="border border-slate-200 rounded-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200 bg-slate-50">
                      <th className={TH}>Category</th><th className={`${TH} text-right`}>Planned</th><th className={`${TH} text-right`}>Approved (₹)</th>
                    </tr></thead>
                    <tbody>
                      {transDialog.lines.map((l, i) => (
                        <tr key={l.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 font-medium">{l.category}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{inr(l.planned_amount)}</td>
                          <td className="px-3 py-2 text-right">
                            <Input type="number" min="0" className={`${cellInput} w-28 ml-auto text-right font-mono`} value={l.approved_amount}
                              onChange={(e) => setTransDialog((p) => ({ ...p, lines: p.lines.map((x, j) => j === i ? { ...x, approved_amount: e.target.value } : x) }))}
                              data-testid={`budget-line-approved-${i}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-right font-mono tabular-nums">
                    Total approved: {inr(transDialog.lines.reduce((s, l) => s + (parseFloat(l.approved_amount) || 0), 0))}
                  </div>
                </div>
              )}
              <div>
                <Label>Comment{transDialog.comment_required ? ' *' : ' (optional)'}</Label>
                <Textarea rows={2} value={transDialog.comment} onChange={(e) => setTransDialog((p) => ({ ...p, comment: e.target.value }))} className="mt-1 rounded-sm" data-testid="budget-transition-comment" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-sm" onClick={() => setTransDialog(null)}>Cancel</Button>
                <Button className={ACTION_BTN[transDialog.kind] || 'rounded-sm'} onClick={runBudgetTransition} data-testid="budget-transition-confirm">{transDialog.label}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
