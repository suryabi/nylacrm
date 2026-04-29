import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin, Link as LinkIcon,
  Loader2, Plug, RefreshCw, ExternalLink, AlertCircle, Video, FileText, Plus,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { NewMeetingDialog, MeetingDetailDialog } from '../components/widgets';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function getAuthHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfWeek = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0,0,0,0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const SOURCE_STYLES = {
  crm_meeting:    { bg: 'bg-sky-50',     text: 'text-sky-800',    border: 'border-l-sky-500',    dot: 'bg-sky-500',    label: 'CRM Meeting',  iconColor: 'text-sky-600' },
  meeting_minutes:{ bg: 'bg-violet-50',  text: 'text-violet-800', border: 'border-l-violet-500', dot: 'bg-violet-500', label: 'Minutes',      iconColor: 'text-violet-600' },
  google:         { bg: 'bg-rose-50',    text: 'text-rose-800',   border: 'border-l-rose-500',   dot: 'bg-rose-500',   label: 'Google',       iconColor: 'text-rose-600' },
};

function fmtTime(iso) {
  if (!iso || iso.length === 10) return null;
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return null; }
}
function calcDuration(startIso, endIso) {
  if (!startIso || !endIso || startIso.length === 10) return null;
  try {
    const min = Math.round((new Date(endIso) - new Date(startIso)) / 60000);
    if (min <= 0) return null;
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  } catch { return null; }
}
function dayKeyFromEvent(ev) { const s = ev.start || ''; return s.length >= 10 ? s.slice(0, 10) : s; }

function ZoomIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="Zoom">
      <path d="M3 7a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm14 2.5l4-2.5v10l-4-2.5v-5z" />
    </svg>
  );
}
function MeetIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="Google Meet">
      <path d="M3 7a2 2 0 012-2h7v14H5a2 2 0 01-2-2V7z" />
      <path d="M14 7l4-2v14l-4-2V7z" opacity="0.7" />
    </svg>
  );
}
function detectPlatform(ev) {
  const link = (ev.meeting_link || '').toLowerCase();
  const loc = (ev.location || '').toLowerCase();
  if (link.includes('zoom.us') || loc.includes('zoom')) return 'zoom';
  if (link.includes('meet.google') || loc.includes('meet.google')) return 'meet';
  if (link.includes('teams.microsoft') || loc.includes('teams')) return 'teams';
  return null;
}
function PlatformBadge({ platform, size = 'sm' }) {
  if (!platform) return null;
  const cls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  if (platform === 'zoom')   return <span className="inline-flex items-center text-[#2D8CFF]" title="Zoom"><ZoomIcon className={cls} /></span>;
  if (platform === 'meet')   return <span className="inline-flex items-center text-[#00897B]" title="Google Meet"><MeetIcon className={cls} /></span>;
  if (platform === 'teams')  return <span className="inline-flex items-center text-[#5059C9]" title="Microsoft Teams"><Video className={cls} /></span>;
  return <span className="inline-flex items-center text-slate-500"><Video className={cls} /></span>;
}

function EventPill({ ev, onClick, compact = false }) {
  const s = SOURCE_STYLES[ev.source] || SOURCE_STYLES.google;
  const time = fmtTime(ev.start);
  const platform = detectPlatform(ev);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(ev); }}
      className={`group w-full text-left rounded-md border-l-[3px] ${s.border} ${s.bg} hover:brightness-95 transition-all px-1.5 py-1 mb-0.5`}
      data-testid={`event-pill-${ev.id}`}
      title={ev.title}
    >
      <div className="flex items-center gap-1 min-w-0">
        {time && <span className={`text-[11px] font-bold tabular-nums ${s.text} shrink-0`}>{time}</span>}
        {platform && <PlatformBadge platform={platform} />}
        <span className={`text-[11px] font-medium ${s.text} truncate flex-1`}>{ev.title}</span>
      </div>
    </button>
  );
}

const getDefaultMeetingState = (date = null) => ({
  title: '',
  description: '',
  meeting_type: 'internal',
  meeting_date: date || format(new Date(), 'yyyy-MM-dd'),
  start_time: '10:00',
  duration_minutes: 30,
  location: '',
  internal_attendees: [],
  external_attendees: [],
  create_zoom_meeting: true,
});

export default function PersonalCalendar() {
  const today = new Date();
  const [view, setView] = useState(() => localStorage.getItem('personal_calendar_view') || 'month');
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [google, setGoogle] = useState({ connected: false, configured: false });
  const [users, setUsers] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [connecting, setConnecting] = useState(false);

  // Meeting dialogs (reused from HomeDashboard)
  const [showNewMeetingDialog, setShowNewMeetingDialog] = useState(false);
  const [showMeetingDetailDialog, setShowMeetingDetailDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newMeeting, setNewMeeting] = useState(getDefaultMeetingState());
  const [selectedMeeting, setSelectedMeeting] = useState(null); // raw CRM meeting doc

  // For non-CRM events (minutes / google), show a lightweight inline sheet
  const [genericEvent, setGenericEvent] = useState(null);

  useEffect(() => { localStorage.setItem('personal_calendar_view', view); }, [view]);

  // Compute date range based on view
  const range = useMemo(() => {
    if (view === 'month') {
      const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      return { start: isoDay(start), end: isoDay(end) };
    }
    if (view === 'week') {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return { start: isoDay(s), end: isoDay(e) };
    }
    // day
    return { start: isoDay(cursor), end: isoDay(cursor) };
  }, [view, cursor]);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/personal-calendar/events`, {
        headers: getAuthHeaders(),
        params: { start_date: range.start, end_date: range.end },
      });
      setEvents(res.data?.events || []);
      setGoogle(res.data?.google || { connected: false, configured: false });
    } catch {
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/users`, { headers: getAuthHeaders() });
      setUsers((res.data || []).filter(u => u.is_active));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // OAuth callback parsing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get('google');
    if (g === 'connected') {
      toast.success(`Google Calendar connected (${params.get('email') || ''})`);
      window.history.replaceState({}, '', '/personal-calendar');
      fetchEvents();
    } else if (g === 'error') {
      toast.error(`Google connect failed: ${params.get('reason') || 'unknown'}`);
      window.history.replaceState({}, '', '/personal-calendar');
    }
  }, [fetchEvents]);

  const handleConnectGoogle = async () => {
    try {
      setConnecting(true);
      const res = await axios.get(`${API_URL}/personal-calendar/google/connect`, { headers: getAuthHeaders() });
      window.location.href = res.data.authorization_url;
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to start Google sign-in');
      setConnecting(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!window.confirm('Disconnect Google Calendar? Your events will no longer appear here.')) return;
    try {
      await axios.post(`${API_URL}/personal-calendar/google/disconnect`, {}, { headers: getAuthHeaders() });
      toast.success('Google Calendar disconnected');
      fetchEvents();
    } catch { toast.error('Failed to disconnect'); }
  };

  // Group events by day key
  const eventsByDay = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const k = dayKeyFromEvent(ev);
      if (!k) continue;
      (map[k] = map[k] || []).push(ev);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    return map;
  }, [events]);

  // ── Meeting create / edit / view ──────────────────────────
  const openCreateForDate = (dateIso, startTime = '10:00') => {
    setNewMeeting({ ...getDefaultMeetingState(dateIso), start_time: startTime });
    setEditMode(false);
    setSelectedMeeting(null);
    setShowNewMeetingDialog(true);
  };

  const handleEventClick = async (ev) => {
    if (ev.source === 'crm_meeting') {
      // Fetch full meeting
      try {
        const res = await axios.get(`${API_URL}/meetings/${ev.ref_id}`, { headers: getAuthHeaders() });
        setSelectedMeeting(res.data);
        setShowMeetingDetailDialog(true);
      } catch {
        toast.error('Failed to load meeting details');
      }
    } else {
      // Minutes / Google → simple inline sheet
      setGenericEvent(ev);
    }
  };

  const handleCreateOrUpdateMeeting = async () => {
    if (!newMeeting.title.trim()) { toast.error('Please enter a meeting title'); return; }
    setSavingMeeting(true);
    try {
      const internalEmails = newMeeting.internal_attendees.map(id => users.find(u => u.id === id)?.email || '').filter(Boolean);
      const internalNames  = newMeeting.internal_attendees.map(id => users.find(u => u.id === id)?.name || '').filter(Boolean);
      const payload = {
        title: newMeeting.title,
        description: newMeeting.description,
        meeting_type: newMeeting.meeting_type,
        meeting_date: newMeeting.meeting_date,
        start_time: newMeeting.start_time,
        duration_minutes: newMeeting.duration_minutes,
        location: newMeeting.location,
        attendees: [...internalEmails, ...newMeeting.external_attendees],
        attendee_names: [...internalNames, ...newMeeting.external_attendees.map(e => e.split('@')[0])],
        create_zoom_meeting: newMeeting.create_zoom_meeting && !editMode,
      };
      if (editMode && selectedMeeting?.id) {
        await axios.put(`${API_URL}/meetings/${selectedMeeting.id}`, payload, { headers: getAuthHeaders() });
        toast.success('Meeting rescheduled');
      } else {
        const res = await axios.post(`${API_URL}/meetings`, payload, { headers: getAuthHeaders() });
        if (newMeeting.create_zoom_meeting && res.data?.meeting_link) toast.success('Meeting scheduled with Zoom link!');
        else toast.success('Meeting scheduled');
      }
      setShowNewMeetingDialog(false);
      setNewMeeting(getDefaultMeetingState());
      setEditMode(false);
      setSelectedMeeting(null);
      fetchEvents();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to schedule meeting');
    } finally {
      setSavingMeeting(false);
    }
  };

  const handleEditMeeting = (m) => {
    const internalIds = []; const externalEmails = [];
    (m.attendees || []).forEach(email => {
      const u = users.find(x => x.email === email);
      if (u) internalIds.push(u.id); else externalEmails.push(email);
    });
    setNewMeeting({
      title: m.title, description: m.description || '', meeting_type: m.meeting_type,
      meeting_date: m.meeting_date, start_time: m.start_time, duration_minutes: m.duration_minutes,
      location: m.location || '', internal_attendees: internalIds, external_attendees: externalEmails,
      create_zoom_meeting: !!m.meeting_link,
    });
    setSelectedMeeting(m);
    setEditMode(true);
    setShowMeetingDetailDialog(false);
    setShowNewMeetingDialog(true);
  };

  const handleCancelMeetingClick = (m) => { setSelectedMeeting(m); setShowCancelDialog(true); };

  const confirmCancelMeeting = async () => {
    if (!selectedMeeting) return;
    try {
      await axios.put(`${API_URL}/meetings/${selectedMeeting.id}`, { status: 'cancelled' }, { headers: getAuthHeaders() });
      toast.success('Meeting cancelled');
      setShowCancelDialog(false); setShowMeetingDetailDialog(false); setSelectedMeeting(null);
      fetchEvents();
    } catch { toast.error('Failed to cancel meeting'); }
  };

  // ── Navigation helpers ──
  const goPrev = () => {
    if (view === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    else if (view === 'week') setCursor(addDays(cursor, -7));
    else setCursor(addDays(cursor, -1));
  };
  const goNext = () => {
    if (view === 'month') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    else if (view === 'week') setCursor(addDays(cursor, 7));
    else setCursor(addDays(cursor, 1));
  };
  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  const todayKey = isoDay(today);
  const monthEventCount = events.length;
  const upcomingToday = (eventsByDay[todayKey] || []).length;

  const headerLabel = useMemo(() => {
    if (view === 'month') return <>{MONTHS[cursor.getMonth()]} <span className="text-slate-400 font-light">{cursor.getFullYear()}</span></>;
    if (view === 'week') {
      const s = startOfWeek(cursor); const e = addDays(s, 6);
      const sameMonth = s.getMonth() === e.getMonth();
      return sameMonth
        ? <>{MONTHS[s.getMonth()]} {s.getDate()}–{e.getDate()}, <span className="text-slate-400 font-light">{s.getFullYear()}</span></>
        : <>{MONTHS[s.getMonth()].slice(0,3)} {s.getDate()} – {MONTHS[e.getMonth()].slice(0,3)} {e.getDate()}, <span className="text-slate-400 font-light">{e.getFullYear()}</span></>;
    }
    return <>{DAYS_FULL[cursor.getDay()]}, {MONTHS[cursor.getMonth()]} {cursor.getDate()}, <span className="text-slate-400 font-light">{cursor.getFullYear()}</span></>;
  }, [view, cursor]);

  return (
    <div className="space-y-5 sm:space-y-6" data-testid="personal-calendar">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center shadow-lg shadow-slate-900/10">
              <CalendarIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">My Calendar</h1>
              <p className="text-sm text-slate-500 mt-0.5">CRM meetings, minutes & Google Calendar in one place</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="hidden sm:flex items-center gap-2 px-3 h-10 rounded-xl bg-white border border-slate-200">
            <span className="text-xs text-slate-500">Today</span>
            <span className="text-sm font-bold text-slate-900 tabular-nums">{upcomingToday}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">In view</span>
            <span className="text-sm font-bold text-slate-900 tabular-nums">{monthEventCount}</span>
          </div>
          <button onClick={() => openCreateForDate(isoDay(today))} className="h-10 px-3.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 flex items-center gap-1.5" data-testid="new-meeting-btn">
            <Plus className="w-4 h-4" /> New Meeting
          </button>
          <button onClick={fetchEvents} className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5" data-testid="refresh-btn">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          {!google.configured ? (
            <span className="h-10 px-3.5 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800 flex items-center gap-1.5 font-medium">
              <AlertCircle className="w-4 h-4" /> Google not configured
            </span>
          ) : google.connected ? (
            <div className="flex items-center gap-2">
              <span className="h-10 px-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-800 flex items-center gap-1.5 font-medium" data-testid="google-status-connected">
                <Plug className="w-4 h-4" /> {google.google_email || 'Connected'}
              </span>
              <button onClick={handleDisconnectGoogle} className="h-10 px-3.5 rounded-xl border border-rose-200 bg-rose-50 text-sm font-medium text-rose-700 hover:bg-rose-100" data-testid="google-disconnect-btn">Disconnect</button>
            </div>
          ) : (
            <button onClick={handleConnectGoogle} disabled={connecting} className="h-10 px-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white text-sm font-semibold hover:from-slate-800 flex items-center gap-2 disabled:opacity-50" data-testid="google-connect-btn">
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              Connect Google Calendar
            </button>
          )}
        </div>
      </div>

      {/* Calendar container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              <button onClick={goPrev} className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center" data-testid="prev-btn"><ChevronLeft className="w-4 h-4 text-slate-700" /></button>
              <button onClick={goToday} className="px-3 h-8 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:shadow-sm" data-testid="today-btn">Today</button>
              <button onClick={goNext} className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center" data-testid="next-btn"><ChevronRight className="w-4 h-4 text-slate-700" /></button>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{headerLabel}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-4">
              {Object.entries(SOURCE_STYLES).map(([k, s]) => (
                <span key={k} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`}></span>{s.label}
                </span>
              ))}
            </div>
            {/* View tabs */}
            <div className="flex items-center bg-slate-100 rounded-xl p-1" data-testid="view-tabs">
              {['day', 'week', 'month'].map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3.5 h-8 rounded-lg text-xs font-semibold capitalize transition-all ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  data-testid={`view-${v}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
        ) : view === 'month' ? (
          <MonthView cursor={cursor} eventsByDay={eventsByDay} todayKey={todayKey} onDayClick={(k) => setSelectedDay(k)} onEmptyDayCreate={(k) => openCreateForDate(k)} onEventClick={handleEventClick} />
        ) : view === 'week' ? (
          <WeekView cursor={cursor} eventsByDay={eventsByDay} todayKey={todayKey} onSlotClick={openCreateForDate} onEventClick={handleEventClick} />
        ) : (
          <DayView cursor={cursor} events={eventsByDay[isoDay(cursor)] || []} todayKey={todayKey} onSlotClick={openCreateForDate} onEventClick={handleEventClick} />
        )}
      </div>

      {/* Day-detail Sheet (clicked day in month view, shows full list) */}
      <Sheet open={!!selectedDay} onOpenChange={(v) => { if (!v) setSelectedDay(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-lg flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-slate-700" />
              {selectedDay && new Date(selectedDay + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 mb-3">
            <button
              onClick={() => { setSelectedDay(null); openCreateForDate(selectedDay); }}
              className="w-full rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-900 hover:bg-slate-50 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center justify-center gap-2"
              data-testid="day-sheet-create-meeting"
            >
              <Plus className="w-4 h-4" /> New meeting on this day
            </button>
          </div>
          <div className="space-y-2.5">
            {(eventsByDay[selectedDay] || []).length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-8">No events</div>
            ) : (
              (eventsByDay[selectedDay] || []).map(ev => <DaySheetCard key={ev.id} ev={ev} onClick={() => { setSelectedDay(null); handleEventClick(ev); }} />)
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Generic event Sheet (minutes / google) */}
      <Sheet open={!!genericEvent} onOpenChange={(v) => { if (!v) setGenericEvent(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {genericEvent && (() => {
            const s = SOURCE_STYLES[genericEvent.source] || SOURCE_STYLES.google;
            const platform = detectPlatform(genericEvent);
            const time = fmtTime(genericEvent.start);
            const endTime = fmtTime(genericEvent.end);
            return (
              <>
                <SheetHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-md ${s.bg} ${s.text}`}>{s.label}</span>
                    {platform && <PlatformBadge platform={platform} size="md" />}
                  </div>
                  <SheetTitle className="text-xl leading-tight">{genericEvent.title}</SheetTitle>
                </SheetHeader>
                <div className="mt-5 space-y-4 text-sm">
                  {time && (
                    <div className="flex items-start gap-3 text-slate-800">
                      <Clock className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <div className="font-semibold tabular-nums">{time}{endTime && time !== endTime ? ` – ${endTime}` : ''}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{genericEvent.start && new Date(genericEvent.start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                      </div>
                    </div>
                  )}
                  {genericEvent.all_day && !time && <div className="flex items-center gap-3 text-slate-800"><CalendarIcon className="w-5 h-5 text-slate-400" /><span className="font-semibold">All day</span></div>}
                  {genericEvent.location && <div className="flex items-start gap-3 text-slate-800"><MapPin className="w-5 h-5 text-slate-400 mt-0.5" /><span className="break-words">{genericEvent.location}</span></div>}
                  {genericEvent.meeting_link && (
                    <a href={genericEvent.meeting_link} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-sky-700 hover:text-sky-800 font-medium break-all rounded-xl bg-sky-50 border border-sky-200 px-3 py-2.5 hover:bg-sky-100">
                      {platform === 'zoom' ? <ZoomIcon className="w-5 h-5 text-[#2D8CFF]" /> : platform === 'meet' ? <MeetIcon className="w-5 h-5 text-[#00897B]" /> : <LinkIcon className="w-5 h-5" />}
                      <span className="flex-1 truncate">Join {platform === 'zoom' ? 'Zoom' : platform === 'meet' ? 'Google Meet' : 'meeting'}</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  {genericEvent.description && <div className="flex items-start gap-3 text-slate-800"><FileText className="w-5 h-5 text-slate-400 mt-0.5" /><span className="whitespace-pre-wrap leading-relaxed">{genericEvent.description}</span></div>}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Reused HomeDashboard meeting dialogs */}
      <NewMeetingDialog
        open={showNewMeetingDialog}
        onOpenChange={(open) => { setShowNewMeetingDialog(open); if (!open) { setEditMode(false); setNewMeeting(getDefaultMeetingState()); } }}
        newMeeting={newMeeting}
        setNewMeeting={setNewMeeting}
        onSave={handleCreateOrUpdateMeeting}
        saving={savingMeeting}
        users={users}
        editMode={editMode}
      />
      <MeetingDetailDialog
        open={showMeetingDetailDialog}
        onOpenChange={setShowMeetingDetailDialog}
        meeting={selectedMeeting}
        onEdit={handleEditMeeting}
        onCancel={handleCancelMeetingClick}
      />
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel "{selectedMeeting?.title}"?
              {selectedMeeting?.attendees?.length > 0 && <span className="block mt-2">All attendees will be notified via email.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Meeting</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancelMeeting} className="bg-rose-600 hover:bg-rose-700">Cancel Meeting</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ──────────────────────────────────────────────
// MONTH VIEW
// ──────────────────────────────────────────────
function MonthView({ cursor, eventsByDay, todayKey, onDayClick, onEmptyDayCreate, onEventClick }) {
  const grid = useMemo(() => {
    const y = cursor.getFullYear(); const m = cursor.getMonth();
    const startWeekDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startWeekDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  return (
    <>
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/50">
        {DAYS_ABBR.map((d, i) => (
          <div key={d} className={`text-center text-[11px] font-bold uppercase tracking-[0.14em] py-2.5 ${i === 0 || i === 6 ? 'text-slate-400' : 'text-slate-500'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((d, idx) => {
          if (!d) return <div key={`empty-${idx}`} className="min-h-[110px] sm:min-h-[140px] border-r border-b border-slate-100 bg-slate-50/40" />;
          const k = isoDay(d);
          const dayEvs = eventsByDay[k] || [];
          const isToday = k === todayKey;
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div
              key={k}
              onClick={() => dayEvs.length === 0 ? onEmptyDayCreate(k) : onDayClick(k)}
              className={`group relative min-h-[110px] sm:min-h-[140px] border-r border-b border-slate-100 p-2 sm:p-2.5 cursor-pointer transition-all hover:bg-slate-50/70 ${isToday ? 'bg-sky-50/40' : isWeekend ? 'bg-slate-50/30' : 'bg-white'}`}
              data-testid={`day-cell-${k}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full text-sm font-bold tabular-nums ${isToday ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 group-hover:bg-slate-100'}`}>{d.getDate()}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onEmptyDayCreate(k); }}
                  className="opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center hover:scale-110 transition-all"
                  title="New meeting"
                  data-testid={`day-create-${k}`}
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {dayEvs.slice(0, 3).map(ev => <EventPill key={ev.id} ev={ev} onClick={onEventClick} />)}
                {dayEvs.length > 3 && (
                  <button onClick={(e) => { e.stopPropagation(); onDayClick(k); }} className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 px-1.5 py-0.5">
                    +{dayEvs.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────
// WEEK VIEW
// ──────────────────────────────────────────────
function WeekView({ cursor, eventsByDay, todayKey, onSlotClick, onEventClick }) {
  const weekStart = startOfWeek(cursor);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid grid-cols-7 divide-x divide-slate-100">
      {days.map((d, i) => {
        const k = isoDay(d);
        const dayEvs = eventsByDay[k] || [];
        const isToday = k === todayKey;
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        return (
          <div key={k} className={`min-h-[460px] flex flex-col ${isToday ? 'bg-sky-50/30' : isWeekend ? 'bg-slate-50/30' : 'bg-white'}`} data-testid={`week-day-${k}`}>
            <div className={`px-3 py-3 border-b ${isToday ? 'border-sky-200' : 'border-slate-100'} sticky top-0 bg-inherit z-10`}>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{DAYS_ABBR[d.getDay()]}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-xl font-black tabular-nums ${isToday ? 'bg-slate-900 text-white' : 'text-slate-800'}`}>{d.getDate()}</span>
                {dayEvs.length > 0 && <span className="text-[11px] font-semibold text-slate-500">{dayEvs.length} event{dayEvs.length !== 1 ? 's' : ''}</span>}
              </div>
            </div>
            <div className="p-2 flex-1 space-y-1.5">
              {dayEvs.length === 0 ? (
                <button onClick={() => onSlotClick(k)} className="w-full h-full min-h-[80px] rounded-xl border-2 border-dashed border-transparent hover:border-slate-300 hover:bg-white flex items-center justify-center text-xs text-slate-400 hover:text-slate-700 group" data-testid={`week-empty-${k}`}>
                  <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100" />
                </button>
              ) : (
                <>
                  {dayEvs.map(ev => <WeekEventCard key={ev.id} ev={ev} onClick={() => onEventClick(ev)} />)}
                  <button onClick={() => onSlotClick(k)} className="w-full rounded-lg border border-dashed border-slate-200 hover:border-slate-400 py-1.5 text-[11px] text-slate-400 hover:text-slate-700 flex items-center justify-center gap-1" data-testid={`week-add-${k}`}>
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekEventCard({ ev, onClick }) {
  const s = SOURCE_STYLES[ev.source] || SOURCE_STYLES.google;
  const time = fmtTime(ev.start);
  const platform = detectPlatform(ev);
  return (
    <button onClick={onClick} className={`w-full text-left rounded-lg border-l-[3px] ${s.border} ${s.bg} hover:brightness-95 px-2 py-1.5`} data-testid={`week-event-${ev.id}`}>
      <div className="flex items-center gap-1 mb-0.5">
        {time && <span className={`text-[11px] font-bold tabular-nums ${s.text}`}>{time}</span>}
        {platform && <PlatformBadge platform={platform} />}
      </div>
      <div className={`text-xs font-semibold ${s.text} line-clamp-2 leading-tight`}>{ev.title}</div>
      {ev.location && <div className={`text-[10px] ${s.text} opacity-70 truncate mt-0.5`}>{ev.location}</div>}
    </button>
  );
}

// ──────────────────────────────────────────────
// DAY VIEW (hourly grid)
// ──────────────────────────────────────────────
const HOURS = Array.from({ length: 14 }, (_, i) => 7 + i); // 7 AM – 8 PM (last row is 8 PM)
function DayView({ cursor, events, todayKey, onSlotClick, onEventClick }) {
  const k = isoDay(cursor);
  const isToday = k === todayKey;
  const allDay = events.filter(e => e.all_day);
  const timed = events.filter(e => !e.all_day);

  // Bucket timed events by hour (use hour of start)
  const eventsByHour = useMemo(() => {
    const map = {};
    timed.forEach(ev => {
      try {
        const h = new Date(ev.start).getHours();
        (map[h] = map[h] || []).push(ev);
      } catch {}
    });
    return map;
  }, [timed]);

  // Untimed events outside the 7-20 window
  const outsideWindow = timed.filter(ev => {
    try { const h = new Date(ev.start).getHours(); return h < 7 || h > 20; } catch { return false; }
  });

  return (
    <div className="flex flex-col">
      {/* Day header */}
      <div className={`px-5 py-4 border-b border-slate-100 ${isToday ? 'bg-sky-50/30' : 'bg-white'}`}>
        <div className="flex items-baseline gap-3">
          <span className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl text-2xl font-black tabular-nums ${isToday ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}>{cursor.getDate()}</span>
          <div>
            <div className="text-sm font-bold text-slate-900">{DAYS_FULL[cursor.getDay()]}</div>
            <div className="text-xs text-slate-500">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()} · {events.length} event{events.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>

      {/* All-day strip */}
      {allDay.length > 0 && (
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/40">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1.5">All day</div>
          <div className="flex flex-wrap gap-1.5">
            {allDay.map(ev => {
              const s = SOURCE_STYLES[ev.source] || SOURCE_STYLES.google;
              return (
                <button key={ev.id} onClick={() => onEventClick(ev)} className={`rounded-md border-l-[3px] ${s.border} ${s.bg} px-2.5 py-1 hover:brightness-95`}>
                  <span className={`text-xs font-semibold ${s.text}`}>{ev.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Hourly grid */}
      <div className="divide-y divide-slate-100">
        {HOURS.map(h => {
          const hourEvs = eventsByHour[h] || [];
          const label = new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric', hour12: true });
          return (
            <div key={h} className="grid grid-cols-[80px_1fr] hover:bg-slate-50/40 transition-colors">
              <div className="px-3 py-3 text-right border-r border-slate-100">
                <span className="text-xs font-semibold text-slate-400 tabular-nums">{label}</span>
              </div>
              <div
                onClick={() => onSlotClick(k, `${pad(h)}:00`)}
                className="px-3 py-2 min-h-[80px] cursor-pointer relative group"
                data-testid={`day-hour-${h}`}
              >
                {hourEvs.length === 0 ? (
                  <span className="absolute inset-0 flex items-center justify-start px-3 opacity-0 group-hover:opacity-100 text-[11px] text-slate-400">
                    <Plus className="w-3 h-3 mr-1" /> Click to add
                  </span>
                ) : (
                  <div className="space-y-1.5">
                    {hourEvs.map(ev => <DayHourEventCard key={ev.id} ev={ev} onClick={() => onEventClick(ev)} />)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Outside-window events */}
      {outsideWindow.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1.5">Other times</div>
          <div className="space-y-1.5">
            {outsideWindow.map(ev => <DayHourEventCard key={ev.id} ev={ev} onClick={() => onEventClick(ev)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function DayHourEventCard({ ev, onClick }) {
  const s = SOURCE_STYLES[ev.source] || SOURCE_STYLES.google;
  const time = fmtTime(ev.start);
  const endTime = fmtTime(ev.end);
  const duration = calcDuration(ev.start, ev.end);
  const platform = detectPlatform(ev);
  const PlatformIconBig = platform === 'zoom'
    ? <ZoomIcon className="w-9 h-9 text-[#2D8CFF] shrink-0" />
    : platform === 'meet'
      ? <MeetIcon className="w-9 h-9 text-[#00897B] shrink-0" />
      : platform === 'teams'
        ? <Video className="w-9 h-9 text-[#5059C9] shrink-0" />
        : null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full text-left rounded-xl ${s.bg} hover:brightness-95 hover:shadow-sm transition-all px-4 py-4 min-h-[160px] flex items-center gap-4`}
      data-testid={`day-event-${ev.id}`}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className={`flex items-center gap-2 flex-wrap text-sm font-bold tabular-nums ${s.text}`}>
          {time && <span>{time}{endTime && time !== endTime ? ` – ${endTime}` : ''}</span>}
          {duration && <span className="text-xs font-semibold opacity-70">· {duration}</span>}
        </div>
        <div className={`text-lg font-bold ${s.text} truncate`} title={ev.title}>{ev.title}</div>
      </div>
      {PlatformIconBig && (
        <div className="self-center" title={platform === 'zoom' ? 'Zoom' : platform === 'meet' ? 'Google Meet' : 'Teams'}>
          {PlatformIconBig}
        </div>
      )}
    </button>
  );
}

// ──────────────────────────────────────────────
// Day-detail Sheet card (used in month-view click)
// ──────────────────────────────────────────────
function DaySheetCard({ ev, onClick }) {
  const s = SOURCE_STYLES[ev.source] || SOURCE_STYLES.google;
  const time = fmtTime(ev.start);
  const endTime = fmtTime(ev.end);
  const platform = detectPlatform(ev);
  return (
    <button onClick={onClick} className={`w-full text-left rounded-xl border-l-[3px] ${s.border} bg-white border-y border-r border-slate-200 p-3.5 hover:shadow-md hover:border-slate-300 transition-all`} data-testid={`event-card-${ev.id}`}>
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-md ${s.bg} ${s.text}`}>{s.label}</span>
        {platform && <PlatformBadge platform={platform} size="md" />}
        {time && <span className="text-xs font-bold text-slate-700 tabular-nums flex items-center gap-1"><Clock className="w-3 h-3 text-slate-400" />{time}{endTime && time !== endTime ? ` – ${endTime}` : ''}</span>}
        {!time && ev.all_day && <span className="text-xs font-bold text-slate-500">All day</span>}
      </div>
      <div className="text-sm font-semibold text-slate-900 line-clamp-2">{ev.title}</div>
      {ev.location && <div className="text-xs text-slate-500 mt-1 truncate flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</div>}
    </button>
  );
}
