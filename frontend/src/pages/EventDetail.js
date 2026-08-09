import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { ArrowLeft, Plus, Pencil, Trash2, Users, ListChecks, Wallet, Paperclip, Download, Clock, Link2, RefreshCw, Check, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { EventForm, authHeaders } from './Events';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TASK_STATUS = {
  not_started: { label: 'Not Started', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  blocked: { label: 'Blocked', cls: 'bg-red-50 text-red-700 border-red-200' },
  done: { label: 'Done', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const BUDGET_STATE = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
  pending_approval: { label: 'Pending Approval', cls: 'bg-amber-50 text-amber-700 border-amber-300' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700 border-red-300' },
};

const ACTION_BTN = {
  positive: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  negative: 'bg-red-600 hover:bg-red-700 text-white',
  neutral: '',
};

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const today = () => new Date().toISOString().slice(0, 10);

const cellInput = 'h-8 text-sm';

function RowActions({ onSave, onCancel }) {
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <Button size="icon" className="h-7 w-7 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onSave} title="Save" data-testid="row-save-btn"><Check className="h-4 w-4" /></Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel} title="Cancel" data-testid="row-cancel-btn"><X className="h-4 w-4" /></Button>
    </div>
  );
}

export default function EventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [ev, setEv] = useState(null);
  const [users, setUsers] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  const [shEdit, setShEdit] = useState(null);     // stakeholder row being edited ({id:null}=new)
  const [taskEdit, setTaskEdit] = useState(null); // task row being edited
  const [budEdit, setBudEdit] = useState(null);   // budget row being edited
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
    try {
      await api('PUT', `/tasks/${t.id}`, { ...t, status });
      load();
    } catch (e) { toast.error(e.message); }
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

  if (!ev) return <div className="flex items-center justify-center py-24 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;

  const taskName = (id) => (ev.tasks.find((t) => t.id === id) || {}).name || '?';

  // ── Inline scope chips editor (stakeholders) ──
  const ScopeEditor = ({ form, setForm }) => (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {[...new Set([...(ev.scopes || []), ...(form.scopes || [])])].map((sc) => {
          const on = (form.scopes || []).includes(sc);
          return (
            <Badge key={sc} variant={on ? 'default' : 'outline'} className="cursor-pointer select-none text-xs"
              onClick={() => setForm((p) => ({ ...p, scopes: on ? p.scopes.filter((x) => x !== sc) : [...(p.scopes || []), sc] }))}
              data-testid={`stakeholder-scope-${sc.replace(/\s/g, '-')}`}>{sc}</Badge>
          );
        })}
      </div>
      <Input placeholder="Custom scope + Enter" className="h-7 text-xs w-40"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target.value.trim()) {
            const v = e.target.value.trim();
            setForm((p) => ({ ...p, scopes: [...new Set([...(p.scopes || []), v])] }));
            e.target.value = '';
          }
        }} data-testid="stakeholder-custom-scope-input" />
    </div>
  );

  const StakeholderEditRow = () => (
    <tr className="border-b bg-amber-50/40 align-top" data-testid="stakeholder-edit-row">
      <td className="px-3 py-2">
        <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm mb-1"
          value={shEdit.is_internal ? 'internal' : 'external'}
          onChange={(e) => setShEdit((p) => ({ ...p, is_internal: e.target.value === 'internal', company_name: e.target.value === 'internal' ? '' : p.company_name, user_id: e.target.value === 'internal' ? p.user_id : '' }))}
          data-testid="stakeholder-type-select">
          <option value="external">External</option>
          <option value="internal">Internal employee</option>
        </select>
        {shEdit.is_internal ? (
          <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" value={shEdit.user_id || ''}
            onChange={(e) => {
              const u = users.find((x) => x.id === e.target.value);
              setShEdit((p) => ({ ...p, user_id: e.target.value, contact_name: u?.name || '', email: u?.email || '', phone: u?.phone || p.phone }));
            }} data-testid="stakeholder-user-select">
            <option value="">Select employee…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
        ) : (
          <Input className={cellInput} placeholder="Company" value={shEdit.company_name || ''} onChange={(e) => setShEdit((p) => ({ ...p, company_name: e.target.value }))} data-testid="stakeholder-company-input" />
        )}
      </td>
      <td className="px-3 py-2"><Input className={cellInput} placeholder="Contact name *" value={shEdit.contact_name || ''} onChange={(e) => setShEdit((p) => ({ ...p, contact_name: e.target.value }))} data-testid="stakeholder-contact-input" /></td>
      <td className="px-3 py-2"><Input className={cellInput} placeholder="Phone" value={shEdit.phone || ''} onChange={(e) => setShEdit((p) => ({ ...p, phone: e.target.value }))} data-testid="stakeholder-phone-input" /></td>
      <td className="px-3 py-2"><Input className={cellInput} type="email" placeholder="Email" value={shEdit.email || ''} onChange={(e) => setShEdit((p) => ({ ...p, email: e.target.value }))} data-testid="stakeholder-email-input" /></td>
      <td className="px-3 py-2">{ScopeEditor({ form: shEdit, setForm: setShEdit })}</td>
      <td className="px-3 py-2"><RowActions onSave={saveStakeholder} onCancel={() => setShEdit(null)} /></td>
    </tr>
  );

  const TaskEditRow = () => (
    <tr className="border-b bg-amber-50/40 align-top" data-testid="task-edit-row">
      <td className="px-3 py-2 min-w-[220px]">
        <Input className={cellInput} placeholder="Task name *" value={taskEdit.name || ''} onChange={(e) => setTaskEdit((p) => ({ ...p, name: e.target.value }))} data-testid="task-name-input" />
        <Input className="h-7 text-xs mt-1" placeholder="Description (optional)" value={taskEdit.description || ''} onChange={(e) => setTaskEdit((p) => ({ ...p, description: e.target.value }))} data-testid="task-desc-input" />
      </td>
      <td className="px-3 py-2 min-w-[170px]">
        <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
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
      </td>
      <td className="px-3 py-2"><Input className={cellInput} type="date" value={taskEdit.start_date || ''} onChange={(e) => setTaskEdit((p) => ({ ...p, start_date: e.target.value }))} data-testid="task-start-input" /></td>
      <td className="px-3 py-2"><Input className={cellInput} type="date" value={taskEdit.end_date || ''} onChange={(e) => setTaskEdit((p) => ({ ...p, end_date: e.target.value }))} data-testid="task-end-input" /></td>
      <td className="px-3 py-2 min-w-[160px]">
        <div className="flex flex-wrap gap-1">
          {ev.tasks.filter((t) => t.id !== taskEdit.id).map((t) => {
            const on = (taskEdit.depends_on || []).includes(t.id);
            return (
              <Badge key={t.id} variant={on ? 'default' : 'outline'} className="cursor-pointer select-none text-xs"
                onClick={() => setTaskEdit((p) => ({ ...p, depends_on: on ? p.depends_on.filter((x) => x !== t.id) : [...(p.depends_on || []), t.id] }))}
                data-testid={`task-dep-${t.name.replace(/\s/g, '-')}`}>{t.name}</Badge>
            );
          })}
          {ev.tasks.filter((t) => t.id !== taskEdit.id).length === 0 && <span className="text-xs text-muted-foreground">No other tasks</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={taskEdit.status}
          onChange={(e) => setTaskEdit((p) => ({ ...p, status: e.target.value }))} data-testid="task-status-input">
          {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{taskEdit.id ? `${(taskEdit.files || []).length} file(s)` : 'Save first'}</td>
      <td className="px-3 py-2"><RowActions onSave={saveTask} onCancel={() => setTaskEdit(null)} /></td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="event-detail-page">
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/events')} data-testid="event-back-btn"><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{ev.name}</h1>
              <p className="text-muted-foreground text-sm">{ev.date_from}{ev.date_to !== ev.date_from ? ` → ${ev.date_to}` : ''}{ev.location ? ` · ${ev.location}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{(ev.status || '').replace('_', ' ')}</Badge>
            <Button variant="outline" onClick={downloadReport} data-testid="event-report-btn"><FileText className="h-4 w-4 mr-2" /> Report</Button>
            <Button variant="outline" onClick={() => setShowEdit(true)} data-testid="event-edit-btn"><Pencil className="h-4 w-4 mr-2" /> Edit Event</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Plan Progress', value: `${ev.progress}%` },
            { label: 'Tasks', value: ev.tasks.length },
            { label: 'Stakeholders', value: ev.stakeholders.length },
            { label: 'Budget Plan / Appr / Actual', value: `${inr(ev.budget_planned_total)} / ${inr(ev.budget_approved_total)} / ${inr(ev.budget_actual_total)}` },
          ].map((s) => (
            <Card key={s.label}><CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className="text-xl font-bold tabular-nums">{s.value}</p>
            </CardContent></Card>
          ))}
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" data-testid="event-tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="stakeholders" data-testid="event-tab-stakeholders"><Users className="h-4 w-4 mr-1" /> Stakeholders</TabsTrigger>
            <TabsTrigger value="plan" data-testid="event-tab-plan"><ListChecks className="h-4 w-4 mr-1" /> Plan</TabsTrigger>
            <TabsTrigger value="budget" data-testid="event-tab-budget"><Wallet className="h-4 w-4 mr-1" /> Budget</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <Card><CardContent className="p-5 space-y-3">
              {ev.description && <p className="text-sm">{ev.description}</p>}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {ev.event_type && <div><p className="text-xs text-muted-foreground">Type</p><p className="font-medium">{ev.event_type}</p></div>}
                {ev.budget != null && <div><p className="text-xs text-muted-foreground">Overall Budget</p><p className="font-medium">{inr(ev.budget)}</p></div>}
                {ev.expected_attendees != null && <div><p className="text-xs text-muted-foreground">Expected Attendees</p><p className="font-medium">{ev.expected_attendees}</p></div>}
                <div><p className="text-xs text-muted-foreground">Created By</p><p className="font-medium">{ev.created_by_name}</p></div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4" /> Day-by-day Schedule</p>
              {(ev.day_schedules || []).length === 0 ? <p className="text-sm text-muted-foreground">No day schedules set.</p> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {ev.day_schedules.map((s) => (
                    <div key={s.date} className="rounded-lg border p-3 text-sm" data-testid={`event-day-schedule-${s.date}`}>
                      <p className="font-medium">{new Date(s.date).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}</p>
                      <p className="text-muted-foreground">{s.start_time || '—'} to {s.end_time || '—'}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent></Card>
          </TabsContent>

          {/* ── STAKEHOLDERS — inline editable grid ── */}
          <TabsContent value="stakeholders" className="mt-4 space-y-3">
            <Button size="sm" disabled={!!shEdit} onClick={() => setShEdit({ id: null, is_internal: false, contact_name: '', company_name: '', phone: '', email: '', scopes: [], user_id: '' })} data-testid="stakeholder-new-btn">
              <Plus className="h-4 w-4 mr-2" /> Add Stakeholder
            </Button>
            <Card><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm" data-testid="stakeholders-table">
                <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 min-w-[180px]">Company / Type</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">Email</th><th className="px-3 py-3 min-w-[200px]">Scope</th><th className="px-3 py-3 w-24"></th>
                </tr></thead>
                <tbody>
                  {shEdit && !shEdit.id && StakeholderEditRow()}
                  {ev.stakeholders.length === 0 && !shEdit && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No stakeholders yet — click “Add Stakeholder” to add one inline.</td></tr>}
                  {ev.stakeholders.map((s) => (
                    shEdit?.id === s.id ? <React.Fragment key={s.id}>{StakeholderEditRow()}</React.Fragment> : (
                    <tr key={s.id} className="border-b align-top hover:bg-slate-50/60" data-testid={`stakeholder-row-${s.contact_name.replace(/\s/g, '-')}`}>
                      <td className="px-3 py-2.5">{s.is_internal ? <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Internal</Badge> : (s.company_name || '—')}</td>
                      <td className="px-3 py-2.5 font-medium">{s.contact_name}</td>
                      <td className="px-3 py-2.5">{s.phone || '—'}</td>
                      <td className="px-3 py-2.5">{s.email || '—'}</td>
                      <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{(s.scopes || []).map((sc) => <Badge key={sc} variant="outline" className="text-xs">{sc}</Badge>)}</div></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!!shEdit} onClick={() => setShEdit({ ...s })} data-testid={`stakeholder-edit-${s.contact_name.replace(/\s/g, '-')}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => del(`/stakeholders/${s.id}`, `Remove ${s.contact_name}?`)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                    )
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          </TabsContent>

          {/* ── PLAN — inline editable grid ── */}
          <TabsContent value="plan" className="mt-4 space-y-3">
            <Button size="sm" disabled={!!taskEdit} onClick={() => setTaskEdit({ id: null, name: '', description: '', owner_type: '', owner_id: '', owner_name: '', start_date: '', end_date: '', depends_on: [], status: 'not_started' })} data-testid="task-new-btn">
              <Plus className="h-4 w-4 mr-2" /> Add Task
            </Button>
            <Card><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm" data-testid="tasks-table">
                <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 min-w-[220px]">Task</th><th className="px-3 py-3">Owner</th><th className="px-3 py-3">Start</th>
                  <th className="px-3 py-3">End</th><th className="px-3 py-3 min-w-[140px]">Depends On</th><th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 min-w-[130px]">Files</th><th className="px-3 py-3 w-24"></th>
                </tr></thead>
                <tbody>
                  {taskEdit && !taskEdit.id && TaskEditRow()}
                  {ev.tasks.length === 0 && !taskEdit && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No plan tasks yet — click “Add Task” to add one inline.</td></tr>}
                  {ev.tasks.map((t) => {
                    if (taskEdit?.id === t.id) return <React.Fragment key={t.id}>{TaskEditRow()}</React.Fragment>;
                    const overdue = t.status !== 'done' && t.end_date && t.end_date < today();
                    return (
                      <tr key={t.id} className={`border-b align-top hover:bg-slate-50/60 ${overdue ? 'bg-red-50/40' : ''}`} data-testid={`task-row-${t.name.replace(/\s/g, '-')}`}>
                        <td className="px-3 py-2.5">
                          <p className="font-medium leading-tight">{t.name}</p>
                          {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                        </td>
                        <td className="px-3 py-2.5">{t.owner_name || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2.5 tabular-nums">{t.start_date || '—'}</td>
                        <td className={`px-3 py-2.5 tabular-nums ${overdue ? 'text-red-600 font-semibold' : ''}`}>{t.end_date || '—'}{overdue && <span className="block text-[10px] font-bold uppercase">Overdue</span>}</td>
                        <td className="px-3 py-2.5">
                          {(t.depends_on || []).length > 0
                            ? <div className="flex flex-wrap gap-1">{t.depends_on.map((d) => <Badge key={d} variant="outline" className="text-xs"><Link2 className="h-2.5 w-2.5 mr-0.5" />{taskName(d)}</Badge>)}</div>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <select className={`h-8 rounded-md border px-2 text-xs ${TASK_STATUS[t.status]?.cls || ''}`} value={t.status}
                            onChange={(e) => setTaskStatus(t, e.target.value)} data-testid={`task-status-${t.name.replace(/\s/g, '-')}`}>
                            {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap items-center gap-1">
                            {(t.files || []).map((f) => (
                              <button key={f.id} onClick={() => downloadFile(t.id, f)} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border bg-slate-50 hover:bg-slate-100 max-w-[110px] truncate" data-testid={`task-file-${f.filename}`}>
                                <Download className="h-3 w-3 shrink-0" /> <span className="truncate">{f.filename}</span>
                              </button>
                            ))}
                            <input type="file" hidden ref={(el) => { fileRefs.current[t.id] = el; }} onChange={(e) => uploadFile(t.id, e.target.files[0])} />
                            <Button size="icon" variant="ghost" className="h-6 w-6" title="Attach file" onClick={() => fileRefs.current[t.id]?.click()} data-testid={`task-upload-${t.name.replace(/\s/g, '-')}`}><Paperclip className="h-3.5 w-3.5" /></Button>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!!taskEdit} onClick={() => setTaskEdit({ ...t })} data-testid={`task-edit-${t.name.replace(/\s/g, '-')}`}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => del(`/tasks/${t.id}`, `Delete task "${t.name}"?`)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent></Card>
          </TabsContent>

          {/* ── BUDGET — inline editable grid + approval workflow ── */}
          <TabsContent value="budget" className="mt-4 space-y-3">
            {(() => {
              const bState = ev.budget_state || 'draft';
              const bs = BUDGET_STATE[bState] || BUDGET_STATE.draft;
              const isDraft = bState === 'draft';
              const isApproved = bState === 'approved';

              const BudgetEditRow = () => {
                const lockPlan = isApproved;
                return (
                  <tr className="border-b bg-amber-50/40 align-top" data-testid="budget-edit-row">
                    <td className="px-3 py-2"><Input className={cellInput} placeholder="Category *" disabled={lockPlan} value={budEdit.category || ''} onChange={(e) => setBudEdit((p) => ({ ...p, category: e.target.value }))} data-testid="budget-category-input" /></td>
                    <td className="px-3 py-2"><Input className={cellInput} placeholder="Description" disabled={lockPlan} value={budEdit.description || ''} onChange={(e) => setBudEdit((p) => ({ ...p, description: e.target.value }))} data-testid="budget-desc-input" /></td>
                    <td className="px-3 py-2"><Input className={cellInput} placeholder="Vendor" disabled={lockPlan} value={budEdit.vendor || ''} onChange={(e) => setBudEdit((p) => ({ ...p, vendor: e.target.value }))} data-testid="budget-vendor-input" /></td>
                    <td className="px-3 py-2"><Input className={`${cellInput} text-right`} type="number" min="0" disabled={lockPlan} value={budEdit.planned_amount} onChange={(e) => setBudEdit((p) => ({ ...p, planned_amount: e.target.value }))} data-testid="budget-planned-input" /></td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground pt-3.5">{budEdit.approved_amount != null ? inr(budEdit.approved_amount) : '—'}</td>
                    <td className="px-3 py-2"><Input className={`${cellInput} text-right`} type="number" min="0" value={budEdit.actual_amount ?? ''} onChange={(e) => setBudEdit((p) => ({ ...p, actual_amount: e.target.value }))} data-testid="budget-actual-input" /></td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground pt-3.5">{budEdit.id ? `${(budEdit.files || []).length} bill(s)` : 'Save first'}</td>
                    <td className="px-3 py-2"><RowActions onSave={saveBudget} onCancel={() => setBudEdit(null)} /></td>
                  </tr>
                );
              };

              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`${bs.cls} text-sm px-3 py-1`} data-testid="budget-state-chip">{ev.budget_state_label || bs.label}</Badge>
                      {(ev.budget_transitions || []).map((t) => (
                        <Button key={`${t.action_key}-${t.to_state}`} size="sm" variant={t.kind === 'neutral' ? 'outline' : 'default'}
                          className={ACTION_BTN[t.kind] || ''} onClick={() => openTransition(t)}
                          data-testid={`budget-action-${t.action_key}`}>
                          {t.label}
                        </Button>
                      ))}
                      {isDraft && (
                        <Button size="sm" variant="outline" disabled={!!budEdit} onClick={() => setBudEdit({ id: null, category: '', description: '', planned_amount: '', actual_amount: '', vendor: '' })} data-testid="budget-new-btn">
                          <Plus className="h-4 w-4 mr-1" /> Add Budget Line
                        </Button>
                      )}
                    </div>
                    <div className="text-sm">
                      Planned <b>{inr(ev.budget_planned_total)}</b> · Approved <b>{inr(ev.budget_approved_total)}</b> · Actual <b>{inr(ev.budget_actual_total)}</b>
                      {ev.budget != null && ev.budget_planned_total > ev.budget && <Badge className="ml-1 bg-red-100 text-red-700 border-red-200">Over event budget</Badge>}
                    </div>
                  </div>
                  {!isDraft && (
                    <p className="text-xs text-muted-foreground" data-testid="budget-lock-note">
                      {bState === 'pending_approval' && 'Budget lines are locked while approval is pending.'}
                      {isApproved && 'Budget approved — only actual spend can be recorded. Reopen the budget to change plans.'}
                      {bState === 'rejected' && 'Budget was rejected — reopen it as draft to make changes.'}
                    </p>
                  )}
                  <Card><CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm" data-testid="budget-table">
                      <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-3 min-w-[150px]">Category</th><th className="px-3 py-3">Description</th><th className="px-3 py-3">Vendor</th>
                        <th className="px-3 py-3 text-right">Planned</th><th className="px-3 py-3 text-right">Approved</th><th className="px-3 py-3 text-right">Actual</th><th className="px-3 py-3 text-right">Variance</th><th className="px-3 py-3 min-w-[120px]">Bills</th><th className="px-3 py-3 w-24"></th>
                      </tr></thead>
                      <tbody>
                        {budEdit && !budEdit.id && BudgetEditRow()}
                        {ev.budget_items.length === 0 && !budEdit && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No budget lines yet{isDraft ? ' — click “Add Budget Line” to add one inline.' : '.'}</td></tr>}
                        {ev.budget_items.map((b) => {
                          if (budEdit?.id === b.id) return <React.Fragment key={b.id}>{BudgetEditRow()}</React.Fragment>;
                          const baseline = b.approved_amount != null ? b.approved_amount : (b.planned_amount || 0);
                          const varc = (b.actual_amount != null) ? (b.actual_amount - baseline) : null;
                          return (
                            <tr key={b.id} className="border-b hover:bg-slate-50/60" data-testid={`budget-row-${b.category.replace(/\s/g, '-')}`}>
                              <td className="px-3 py-2.5 font-medium">{b.category}</td>
                              <td className="px-3 py-2.5">{b.description || '—'}</td>
                              <td className="px-3 py-2.5">{b.vendor || '—'}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{inr(b.planned_amount)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{b.approved_amount != null ? inr(b.approved_amount) : '—'}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{b.actual_amount != null ? inr(b.actual_amount) : '—'}</td>
                              <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${varc > 0 ? 'text-red-600' : varc < 0 ? 'text-emerald-600' : ''}`}>{varc != null ? inr(varc) : '—'}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex flex-wrap items-center gap-1">
                                  {(b.files || []).map((f) => (
                                    <button key={f.id} onClick={() => downloadBudgetFile(b.id, f)} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border bg-slate-50 hover:bg-slate-100 max-w-[110px] truncate" title={f.filename} data-testid={`budget-file-${f.filename}`}>
                                      <Download className="h-3 w-3 shrink-0" /> <span className="truncate">{f.filename}</span>
                                    </button>
                                  ))}
                                  <input type="file" hidden ref={(el) => { fileRefs.current[`bud_${b.id}`] = el; }} onChange={(e) => uploadBudgetFile(b.id, e.target.files[0])} />
                                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Attach vendor bill" onClick={() => fileRefs.current[`bud_${b.id}`]?.click()} data-testid={`budget-upload-${b.category.replace(/\s/g, '-')}`}><Paperclip className="h-3.5 w-3.5" /></Button>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {(isDraft || isApproved) && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!!budEdit} title={isApproved ? 'Record actual spend' : 'Edit'}
                                    onClick={() => setBudEdit({ ...b, actual_amount: b.actual_amount ?? '' })} data-testid={`budget-edit-${b.category.replace(/\s/g, '-')}`}><Pencil className="h-3.5 w-3.5" /></Button>
                                )}
                                {isDraft && (
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => del(`/budget-items/${b.id}`, `Delete budget line "${b.category}"?`)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </CardContent></Card>
                  {(ev.budget_history || []).length > 0 && (
                    <Card><CardContent className="p-4" data-testid="budget-history">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Approval History</p>
                      <div className="space-y-1.5">
                        {[...ev.budget_history].reverse().map((h) => (
                          <div key={h.id} className="text-xs flex flex-wrap items-baseline gap-x-2">
                            <span className="font-semibold">{h.action_label}</span>
                            <span className="text-muted-foreground">by {h.by_name} · {new Date(h.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            {h.comment && <span className="italic text-muted-foreground">“{h.comment}”</span>}
                          </div>
                        ))}
                      </div>
                    </CardContent></Card>
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
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Planned</th><th className="px-3 py-2 text-right">Approved (₹)</th>
                    </tr></thead>
                    <tbody>
                      {transDialog.lines.map((l, i) => (
                        <tr key={l.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium">{l.category}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{inr(l.planned_amount)}</td>
                          <td className="px-3 py-2 text-right">
                            <Input type="number" min="0" className="h-8 w-28 ml-auto text-right" value={l.approved_amount}
                              onChange={(e) => setTransDialog((p) => ({ ...p, lines: p.lines.map((x, j) => j === i ? { ...x, approved_amount: e.target.value } : x) }))}
                              data-testid={`budget-line-approved-${i}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-right">
                    Total approved: {inr(transDialog.lines.reduce((s, l) => s + (parseFloat(l.approved_amount) || 0), 0))}
                  </div>
                </div>
              )}
              <div>
                <Label>Comment{transDialog.comment_required ? ' *' : ' (optional)'}</Label>
                <Textarea rows={2} value={transDialog.comment} onChange={(e) => setTransDialog((p) => ({ ...p, comment: e.target.value }))} className="mt-1" data-testid="budget-transition-comment" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTransDialog(null)}>Cancel</Button>
                <Button className={ACTION_BTN[transDialog.kind] || ''} onClick={runBudgetTransition} data-testid="budget-transition-confirm">{transDialog.label}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
