import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { CalendarRange, Plus, MapPin, Users, AlertTriangle, RefreshCw, Copy } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('session_token')}`, 'Content-Type': 'application/json' });

const STATUS_STYLE = {
  planned: 'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const datesBetween = (from, to) => {
  const out = [];
  if (!from || !to) return out;
  let d = new Date(from);
  const end = new Date(to);
  while (d <= end && out.length < 60) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
};

export function EventForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState(initial || {
    name: '', event_type: '', status: 'planned', location: '', budget: '', expected_attendees: '',
    description: '', requirements: [], date_from: '', date_to: '', day_schedules: [],
  });
  const [saving, setSaving] = useState(false);
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const days = datesBetween(form.date_from, form.date_to);
    setForm((p) => ({
      ...p,
      day_schedules: days.map((d) => p.day_schedules.find((s) => s.date === d) || { date: d, start_time: '', end_time: '' }),
    }));
  }, [form.date_from, form.date_to]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyTimes = () => {
    const first = form.day_schedules[0];
    if (!first) return;
    setF('day_schedules', form.day_schedules.map((s) => ({ ...s, start_time: first.start_time, end_time: first.end_time })));
    toast.success('Times copied to all days');
  };

  const save = async () => {
    if (!form.name.trim() || !form.date_from || !form.date_to) return toast.error('Name and dates are required');
    setSaving(true);
    try {
      const payload = {
        ...form,
        budget: form.budget === '' ? null : parseFloat(form.budget),
        expected_attendees: form.expected_attendees === '' ? null : parseInt(form.expected_attendees),
      };
      const url = initial?.id ? `${API_URL}/api/events/${initial.id}` : `${API_URL}/api/events`;
      const res = await fetch(url, { method: initial?.id ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).detail || 'Save failed');
      const d = await res.json();
      toast.success(initial?.id ? 'Event updated' : 'Event created — journey started');
      onSaved(d);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2"><Label>Event Name *</Label><Input value={form.name} onChange={(e) => setF('name', e.target.value)} className="mt-1" data-testid="event-input-name" /></div>
        <div><Label>Event Type</Label><Input placeholder="Exhibition, Launch, Sampling…" value={form.event_type || ''} onChange={(e) => setF('event_type', e.target.value)} className="mt-1" /></div>
        <div>
          <Label>Status</Label>
          <select className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setF('status', e.target.value)} data-testid="event-input-status">
            {['planned', 'in_progress', 'completed', 'cancelled'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div><Label>Start Date *</Label><Input type="date" value={form.date_from} onChange={(e) => setF('date_from', e.target.value)} className="mt-1" data-testid="event-input-datefrom" /></div>
        <div><Label>End Date *</Label><Input type="date" value={form.date_to} onChange={(e) => setF('date_to', e.target.value)} className="mt-1" data-testid="event-input-dateto" /></div>
        <div><Label>Location</Label><Input value={form.location || ''} onChange={(e) => setF('location', e.target.value)} className="mt-1" /></div>
        <div><Label>Budget (₹)</Label><Input type="number" min="0" value={form.budget ?? ''} onChange={(e) => setF('budget', e.target.value)} className="mt-1" data-testid="event-input-budget" /></div>
        <div><Label>Expected Attendees</Label><Input type="number" min="0" value={form.expected_attendees ?? ''} onChange={(e) => setF('expected_attendees', e.target.value)} className="mt-1" /></div>
        <div className="sm:col-span-2"><Label>Description</Label><Textarea rows={2} value={form.description || ''} onChange={(e) => setF('description', e.target.value)} className="mt-1" /></div>
      </div>

      {form.day_schedules.length > 0 && (
        <div className="border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="font-semibold">Event Times — per day</Label>
            {form.day_schedules.length > 1 && (
              <Button size="sm" variant="outline" onClick={copyTimes} data-testid="event-copy-times-btn">
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy day 1 times to all days
              </Button>
            )}
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {form.day_schedules.map((s, i) => (
              <div key={s.date} className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm font-medium">{new Date(s.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                <Input type="time" value={s.start_time || ''} onChange={(e) => setF('day_schedules', form.day_schedules.map((x, j) => j === i ? { ...x, start_time: e.target.value } : x))} className="h-9" data-testid={`event-day-${i}-start`} />
                <Input type="time" value={s.end_time || ''} onChange={(e) => setF('day_schedules', form.day_schedules.map((x, j) => j === i ? { ...x, end_time: e.target.value } : x))} className="h-9" data-testid={`event-day-${i}-end`} />
              </div>
            ))}
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={saving} data-testid="event-save-btn">{saving ? 'Saving…' : initial?.id ? 'Update Event' : 'Create Event & Start Journey'}</Button>
      </DialogFooter>
    </div>
  );
}

export default function Events() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/events`, { headers: authHeaders() });
      setEvents((await res.json()).events || []);
    } catch { toast.error('Failed to load events'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="events-page">
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-rose-50 to-orange-100 dark:from-rose-950/40 dark:to-orange-900/30">
              <CalendarRange className="h-6 w-6 text-rose-700 dark:text-rose-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Events</h1>
              <p className="text-muted-foreground">Plan, staff and track every marketing event end-to-end</p>
            </div>
          </div>
          <Button onClick={() => setShowNew(true)} data-testid="event-new-btn"><Plus className="w-4 h-4 mr-2" /> New Event</Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading events…</div>
        ) : events.length === 0 ? (
          <Card><CardContent className="text-center py-16 text-muted-foreground" data-testid="events-empty">
            <CalendarRange className="h-10 w-10 mx-auto mb-3 opacity-40" />
            No events yet — create your first event to start its journey.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((ev) => (
              <Card key={ev.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/events/${ev.id}`)} data-testid={`event-card-${ev.name.replace(/\s/g, '-')}`}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-lg leading-tight">{ev.name}</p>
                      {ev.event_type && <p className="text-xs text-muted-foreground">{ev.event_type}</p>}
                    </div>
                    <Badge variant="outline" className={STATUS_STYLE[ev.status] || ''}>{(ev.status || '').replace('_', ' ')}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p className="flex items-center gap-1.5"><CalendarRange className="h-3.5 w-3.5" /> {ev.date_from}{ev.date_to !== ev.date_from ? ` → ${ev.date_to}` : ''}</p>
                    {ev.location && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {ev.location}</p>}
                    <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {ev.stakeholder_count} stakeholder{ev.stakeholder_count === 1 ? '' : 's'} · {ev.task_count} task{ev.task_count === 1 ? '' : 's'}</p>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Plan progress</span>
                      <span className="font-semibold">{ev.progress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${ev.progress}%` }} />
                    </div>
                  </div>
                  {ev.overdue_tasks > 0 && (
                    <Badge className="bg-red-100 text-red-700 border-red-200" data-testid={`event-overdue-${ev.name.replace(/\s/g, '-')}`}>
                      <AlertTriangle className="h-3 w-3 mr-1" /> {ev.overdue_tasks} overdue task{ev.overdue_tasks === 1 ? '' : 's'}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="event-form-dialog">
          <DialogHeader>
            <DialogTitle>New Event</DialogTitle>
            <DialogDescription>Creating an event starts its journey — you'll add stakeholders, plan and budget next.</DialogDescription>
          </DialogHeader>
          <EventForm onCancel={() => setShowNew(false)} onSaved={(d) => { setShowNew(false); navigate(`/events/${d.id}`); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
