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
import { ArrowLeft, Plus, Pencil, Trash2, Users, ListChecks, Wallet, Paperclip, Download, Clock, Link2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { EventForm, authHeaders } from './Events';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TASK_STATUS = {
  not_started: { label: 'Not Started', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  in_progress: { label: 'In Progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  blocked: { label: 'Blocked', cls: 'bg-red-50 text-red-700 border-red-200' },
  done: { label: 'Done', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const inr = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function EventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [ev, setEv] = useState(null);
  const [users, setUsers] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  const [shForm, setShForm] = useState(null);
  const [taskForm, setTaskForm] = useState(null);
  const [budForm, setBudForm] = useState(null);
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
    if (!shForm.contact_name?.trim()) return toast.error('Contact name is required');
    try {
      await api(shForm.id ? 'PUT' : 'POST', shForm.id ? `/stakeholders/${shForm.id}` : '/stakeholders', shForm);
      toast.success('Stakeholder saved');
      setShForm(null); load();
    } catch (e) { toast.error(e.message); }
  };

  const saveTask = async () => {
    if (!taskForm.name?.trim()) return toast.error('Task name is required');
    try {
      await api(taskForm.id ? 'PUT' : 'POST', taskForm.id ? `/tasks/${taskForm.id}` : '/tasks', taskForm);
      toast.success('Task saved');
      setTaskForm(null); load();
    } catch (e) { toast.error(e.message); }
  };

  const setTaskStatus = async (t, status) => {
    try {
      await api('PUT', `/tasks/${t.id}`, { ...t, status });
      load();
    } catch (e) { toast.error(e.message); }
  };

  const saveBudget = async () => {
    if (!budForm.category?.trim()) return toast.error('Category is required');
    try {
      await api(budForm.id ? 'PUT' : 'POST', budForm.id ? `/budget-items/${budForm.id}` : '/budget-items', {
        ...budForm,
        planned_amount: parseFloat(budForm.planned_amount) || 0,
        actual_amount: budForm.actual_amount === '' || budForm.actual_amount == null ? null : parseFloat(budForm.actual_amount),
      });
      toast.success('Budget line saved');
      setBudForm(null); load();
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
      method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` }, body: fd,
    });
    if (!res.ok) return toast.error((await res.json()).detail || 'Upload failed');
    toast.success('File uploaded');
    load();
  };

  const downloadFile = async (taskId, f) => {
    const res = await fetch(`${API_URL}/api/events/${eventId}/tasks/${taskId}/files/${f.id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` },
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = f.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!ev) return <div className="flex items-center justify-center py-24 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;

  const taskName = (id) => (ev.tasks.find((t) => t.id === id) || {}).name || '?';

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
            <Button variant="outline" onClick={() => setShowEdit(true)} data-testid="event-edit-btn"><Pencil className="h-4 w-4 mr-2" /> Edit Event</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Plan Progress', value: `${ev.progress}%` },
            { label: 'Tasks', value: ev.tasks.length },
            { label: 'Stakeholders', value: ev.stakeholders.length },
            { label: 'Budget Planned / Actual', value: `${inr(ev.budget_planned_total)} / ${inr(ev.budget_actual_total)}` },
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

          <TabsContent value="stakeholders" className="mt-4 space-y-3">
            <Button onClick={() => setShForm({ is_internal: false, contact_name: '', company_name: '', phone: '', email: '', scopes: [], user_id: '' })} data-testid="stakeholder-new-btn">
              <Plus className="h-4 w-4 mr-2" /> Add Stakeholder
            </Button>
            <Card><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm" data-testid="stakeholders-table">
                <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Company</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3"></th>
                </tr></thead>
                <tbody>
                  {ev.stakeholders.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No stakeholders yet.</td></tr>}
                  {ev.stakeholders.map((s) => (
                    <tr key={s.id} className="border-b align-top">
                      <td className="px-4 py-3">{s.is_internal ? <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">Internal</Badge> : (s.company_name || '—')}</td>
                      <td className="px-4 py-3 font-medium">{s.contact_name}</td>
                      <td className="px-4 py-3">{s.phone || '—'}</td>
                      <td className="px-4 py-3">{s.email || '—'}</td>
                      <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{(s.scopes || []).map((sc) => <Badge key={sc} variant="outline" className="text-xs">{sc}</Badge>)}</div></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShForm({ ...s })}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => del(`/stakeholders/${s.id}`, `Remove ${s.contact_name}?`)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="plan" className="mt-4 space-y-3">
            <Button onClick={() => setTaskForm({ name: '', description: '', owner_type: '', owner_id: '', owner_name: '', start_date: '', end_date: '', depends_on: [], status: 'not_started' })} data-testid="task-new-btn">
              <Plus className="h-4 w-4 mr-2" /> Add Task
            </Button>
            <div className="space-y-2">
              {ev.tasks.length === 0 && <Card><CardContent className="py-10 text-center text-muted-foreground">No plan tasks yet.</CardContent></Card>}
              {ev.tasks.map((t) => {
                const overdue = t.status !== 'done' && t.end_date && t.end_date < today();
                return (
                  <Card key={t.id} className={overdue ? 'border-red-300' : ''} data-testid={`task-card-${t.name.replace(/\s/g, '-')}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{t.name}</p>
                          {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                            {t.owner_name && <span>Owner: <b className="text-foreground">{t.owner_name}</b></span>}
                            <span className={overdue ? 'text-red-600 font-semibold' : ''}>{t.start_date || '…'} → {t.end_date || '…'}{overdue ? ' · OVERDUE' : ''}</span>
                            {(t.depends_on || []).length > 0 && (
                              <span className="flex items-center gap-1"><Link2 className="h-3 w-3" /> after: {t.depends_on.map(taskName).join(', ')}</span>
                            )}
                          </div>
                          {(t.files || []).length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {t.files.map((f) => (
                                <button key={f.id} onClick={() => downloadFile(t.id, f)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border bg-slate-50 hover:bg-slate-100" data-testid={`task-file-${f.filename}`}>
                                  <Download className="h-3 w-3" /> {f.filename}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={t.status}
                            onChange={(e) => setTaskStatus(t, e.target.value)} data-testid={`task-status-${t.name.replace(/\s/g, '-')}`}>
                            {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                          <Badge variant="outline" className={TASK_STATUS[t.status]?.cls}>{TASK_STATUS[t.status]?.label}</Badge>
                          <input type="file" hidden ref={(el) => { fileRefs.current[t.id] = el; }} onChange={(e) => uploadFile(t.id, e.target.files[0])} />
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Attach file" onClick={() => fileRefs.current[t.id]?.click()} data-testid={`task-upload-${t.name.replace(/\s/g, '-')}`}><Paperclip className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setTaskForm({ ...t })}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => del(`/tasks/${t.id}`, `Delete task "${t.name}"?`)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="budget" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Button onClick={() => setBudForm({ category: '', description: '', planned_amount: '', actual_amount: '', vendor: '' })} data-testid="budget-new-btn">
                <Plus className="h-4 w-4 mr-2" /> Add Budget Line
              </Button>
              <div className="text-sm">
                Planned <b>{inr(ev.budget_planned_total)}</b> · Actual <b>{inr(ev.budget_actual_total)}</b>
                {ev.budget != null && <> · Event budget <b>{inr(ev.budget)}</b> {ev.budget_planned_total > ev.budget && <Badge className="ml-1 bg-red-100 text-red-700 border-red-200">Over budget</Badge>}</>}
              </div>
            </div>
            <Card><CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm" data-testid="budget-table">
                <thead><tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Category</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3 text-right">Planned</th><th className="px-4 py-3 text-right">Actual</th><th className="px-4 py-3 text-right">Variance</th><th className="px-4 py-3"></th>
                </tr></thead>
                <tbody>
                  {ev.budget_items.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No budget lines yet.</td></tr>}
                  {ev.budget_items.map((b) => {
                    const varc = (b.actual_amount != null) ? (b.actual_amount - (b.planned_amount || 0)) : null;
                    return (
                      <tr key={b.id} className="border-b">
                        <td className="px-4 py-3 font-medium">{b.category}</td>
                        <td className="px-4 py-3">{b.description || '—'}</td>
                        <td className="px-4 py-3">{b.vendor || '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{inr(b.planned_amount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{b.actual_amount != null ? inr(b.actual_amount) : '—'}</td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${varc > 0 ? 'text-red-600' : varc < 0 ? 'text-emerald-600' : ''}`}>{varc != null ? inr(varc) : '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setBudForm({ ...b, actual_amount: b.actual_amount ?? '' })}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => del(`/budget-items/${b.id}`, `Delete budget line "${b.category}"?`)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent></Card>
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

      {/* Stakeholder dialog */}
      <Dialog open={!!shForm} onOpenChange={(o) => !o && setShForm(null)}>
        <DialogContent className="sm:max-w-lg" data-testid="stakeholder-dialog">
          <DialogHeader><DialogTitle>{shForm?.id ? 'Edit Stakeholder' : 'Add Stakeholder'}</DialogTitle><DialogDescription>External vendors or internal employees involved in this event.</DialogDescription></DialogHeader>
          {shForm && (
            <div className="space-y-3">
              <div className="flex gap-2">
                {[{ v: false, l: 'External' }, { v: true, l: 'Internal employee' }].map((o) => (
                  <Button key={o.l} size="sm" variant={shForm.is_internal === o.v ? 'default' : 'outline'}
                    onClick={() => setShForm((p) => ({ ...p, is_internal: o.v }))} data-testid={`stakeholder-type-${o.l.split(' ')[0].toLowerCase()}`}>{o.l}</Button>
                ))}
              </div>
              {shForm.is_internal ? (
                <div>
                  <Label>Employee *</Label>
                  <select className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={shForm.user_id || ''}
                    onChange={(e) => {
                      const u = users.find((x) => x.id === e.target.value);
                      setShForm((p) => ({ ...p, user_id: e.target.value, contact_name: u?.name || '', email: u?.email || '', phone: u?.phone || p.phone, company_name: '' }));
                    }} data-testid="stakeholder-user-select">
                    <option value="">Select employee…</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                  </select>
                </div>
              ) : (
                <div><Label>Company Name</Label><Input value={shForm.company_name || ''} onChange={(e) => setShForm((p) => ({ ...p, company_name: e.target.value }))} className="mt-1" data-testid="stakeholder-company-input" /></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Contact Name *</Label><Input value={shForm.contact_name || ''} onChange={(e) => setShForm((p) => ({ ...p, contact_name: e.target.value }))} className="mt-1" data-testid="stakeholder-contact-input" /></div>
                <div><Label>Phone</Label><Input value={shForm.phone || ''} onChange={(e) => setShForm((p) => ({ ...p, phone: e.target.value }))} className="mt-1" /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={shForm.email || ''} onChange={(e) => setShForm((p) => ({ ...p, email: e.target.value }))} className="mt-1" /></div>
              <div>
                <Label>Scope</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(ev.scopes || []).map((sc) => {
                    const on = (shForm.scopes || []).includes(sc);
                    return (
                      <Badge key={sc} variant={on ? 'default' : 'outline'} className="cursor-pointer select-none"
                        onClick={() => setShForm((p) => ({ ...p, scopes: on ? p.scopes.filter((x) => x !== sc) : [...(p.scopes || []), sc] }))}
                        data-testid={`stakeholder-scope-${sc.replace(/\s/g, '-')}`}>{sc}</Badge>
                    );
                  })}
                </div>
                <Input placeholder="Add custom scope and press Enter" className="mt-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      const v = e.target.value.trim();
                      setShForm((p) => ({ ...p, scopes: [...new Set([...(p.scopes || []), v])] }));
                      e.target.value = '';
                    }
                  }} data-testid="stakeholder-custom-scope-input" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShForm(null)}>Cancel</Button>
                <Button onClick={saveStakeholder} data-testid="stakeholder-save-btn">Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Task dialog */}
      <Dialog open={!!taskForm} onOpenChange={(o) => !o && setTaskForm(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="task-dialog">
          <DialogHeader><DialogTitle>{taskForm?.id ? 'Edit Task' : 'Add Plan Task'}</DialogTitle><DialogDescription>Tasks with dependencies drive the event plan and progress.</DialogDescription></DialogHeader>
          {taskForm && (
            <div className="space-y-3">
              <div><Label>Task Name *</Label><Input value={taskForm.name} onChange={(e) => setTaskForm((p) => ({ ...p, name: e.target.value }))} className="mt-1" data-testid="task-name-input" /></div>
              <div><Label>Description</Label><Textarea rows={2} value={taskForm.description || ''} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} className="mt-1" /></div>
              <div>
                <Label>Owner</Label>
                <select className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={taskForm.owner_type && taskForm.owner_id ? `${taskForm.owner_type}:${taskForm.owner_id}` : ''}
                  onChange={(e) => {
                    if (!e.target.value) return setTaskForm((p) => ({ ...p, owner_type: '', owner_id: '', owner_name: '' }));
                    const [type, oid] = e.target.value.split(':');
                    const name = type === 'user' ? (users.find((u) => u.id === oid)?.name || '') : (ev.stakeholders.find((s) => s.id === oid)?.contact_name || '');
                    setTaskForm((p) => ({ ...p, owner_type: type, owner_id: oid, owner_name: name }));
                  }} data-testid="task-owner-select">
                  <option value="">Unassigned</option>
                  <optgroup label="Stakeholders">
                    {ev.stakeholders.map((s) => <option key={s.id} value={`stakeholder:${s.id}`}>{s.contact_name}{s.company_name ? ` (${s.company_name})` : ''}</option>)}
                  </optgroup>
                  <optgroup label="Employees">
                    {users.map((u) => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}
                  </optgroup>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date</Label><Input type="date" value={taskForm.start_date || ''} onChange={(e) => setTaskForm((p) => ({ ...p, start_date: e.target.value }))} className="mt-1" data-testid="task-start-input" /></div>
                <div><Label>End Date</Label><Input type="date" value={taskForm.end_date || ''} onChange={(e) => setTaskForm((p) => ({ ...p, end_date: e.target.value }))} className="mt-1" data-testid="task-end-input" /></div>
              </div>
              <div>
                <Label>Depends On (must finish first)</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ev.tasks.filter((t) => t.id !== taskForm.id).map((t) => {
                    const on = (taskForm.depends_on || []).includes(t.id);
                    return (
                      <Badge key={t.id} variant={on ? 'default' : 'outline'} className="cursor-pointer select-none"
                        onClick={() => setTaskForm((p) => ({ ...p, depends_on: on ? p.depends_on.filter((x) => x !== t.id) : [...(p.depends_on || []), t.id] }))}
                        data-testid={`task-dep-${t.name.replace(/\s/g, '-')}`}>{t.name}</Badge>
                    );
                  })}
                  {ev.tasks.filter((t) => t.id !== taskForm.id).length === 0 && <span className="text-xs text-muted-foreground">No other tasks yet.</span>}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTaskForm(null)}>Cancel</Button>
                <Button onClick={saveTask} data-testid="task-save-btn">Save Task</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Budget dialog */}
      <Dialog open={!!budForm} onOpenChange={(o) => !o && setBudForm(null)}>
        <DialogContent className="sm:max-w-md" data-testid="budget-dialog">
          <DialogHeader><DialogTitle>{budForm?.id ? 'Edit Budget Line' : 'Add Budget Line'}</DialogTitle><DialogDescription>Plan spend per category and track actuals.</DialogDescription></DialogHeader>
          {budForm && (
            <div className="space-y-3">
              <div><Label>Category *</Label><Input placeholder="e.g. Standee & Branding" value={budForm.category} onChange={(e) => setBudForm((p) => ({ ...p, category: e.target.value }))} className="mt-1" data-testid="budget-category-input" /></div>
              <div><Label>Description</Label><Input value={budForm.description || ''} onChange={(e) => setBudForm((p) => ({ ...p, description: e.target.value }))} className="mt-1" /></div>
              <div><Label>Vendor</Label><Input value={budForm.vendor || ''} onChange={(e) => setBudForm((p) => ({ ...p, vendor: e.target.value }))} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Planned (₹) *</Label><Input type="number" min="0" value={budForm.planned_amount} onChange={(e) => setBudForm((p) => ({ ...p, planned_amount: e.target.value }))} className="mt-1" data-testid="budget-planned-input" /></div>
                <div><Label>Actual (₹)</Label><Input type="number" min="0" value={budForm.actual_amount ?? ''} onChange={(e) => setBudForm((p) => ({ ...p, actual_amount: e.target.value }))} className="mt-1" data-testid="budget-actual-input" /></div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBudForm(null)}>Cancel</Button>
                <Button onClick={saveBudget} data-testid="budget-save-btn">Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
