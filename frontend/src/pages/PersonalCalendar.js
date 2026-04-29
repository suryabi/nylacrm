import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin, Link as LinkIcon,
  Loader2, Users, FileText, Plug, X, RefreshCw, ExternalLink, AlertCircle,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { Switch } from '../components/ui/switch';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getAuthHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function pad(n) { return String(n).padStart(2, '0'); }
function isoDay(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

const SOURCE_STYLES = {
  crm_meeting:    { bg: 'bg-sky-100',    text: 'text-sky-700',    dot: 'bg-sky-500',    label: 'CRM Meeting' },
  meeting_minutes:{ bg: 'bg-violet-100', text: 'text-violet-700', dot: 'bg-violet-500', label: 'Minutes' },
  google:         { bg: 'bg-rose-100',   text: 'text-rose-700',   dot: 'bg-rose-500',   label: 'Google' },
};

function fmtTime(iso) {
  if (!iso || iso.length === 10) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

function dayKeyFromEvent(ev) {
  const s = ev.start || '';
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export default function PersonalCalendar() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [google, setGoogle] = useState({ connected: false, configured: false });
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const monthStart = useMemo(() => isoDay(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), [cursor]);
  const monthEnd = useMemo(() => isoDay(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)), [cursor]);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/personal-calendar/events`, {
        headers: getAuthHeaders(),
        params: { start_date: monthStart, end_date: monthEnd },
      });
      setEvents(res.data?.events || []);
      setGoogle(res.data?.google || { connected: false, configured: false });
    } catch (err) {
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

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
      const msg = err?.response?.data?.detail || 'Failed to start Google sign-in';
      toast.error(msg);
      setConnecting(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!window.confirm('Disconnect Google Calendar? Your events will no longer appear here.')) return;
    try {
      await axios.post(`${API_URL}/personal-calendar/google/disconnect`, {}, { headers: getAuthHeaders() });
      toast.success('Google Calendar disconnected');
      fetchEvents();
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const k = dayKeyFromEvent(ev);
      if (!k) continue;
      (map[k] = map[k] || []).push(ev);
    }
    return map;
  }, [events]);

  // Build calendar grid for the month
  const grid = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const startWeekDay = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells = [];
    // leading blanks
    for (let i = 0; i < startWeekDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(y, m, d));
    }
    // pad to multiple of 7
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const todayKey = isoDay(today);

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="personal-calendar">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <CalendarIcon className="w-6 h-6 sm:w-7 sm:h-7 text-slate-700" />
            <h1 className="text-xl sm:text-2xl font-black text-slate-800">My Calendar</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 ml-8 sm:ml-10">CRM meetings, minutes, and your Google Calendar in one place</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-end flex-wrap">
          <button
            onClick={fetchEvents}
            className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
            data-testid="refresh-btn"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {!google.configured ? (
            <span className="h-9 px-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-700 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> Google not configured
            </span>
          ) : google.connected ? (
            <div className="flex items-center gap-2">
              <span className="h-9 px-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-700 flex items-center gap-1.5" data-testid="google-status-connected">
                <Plug className="w-3.5 h-3.5" /> {google.google_email || 'Connected'}
              </span>
              <button
                onClick={handleDisconnectGoogle}
                className="h-9 px-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 hover:bg-rose-100"
                data-testid="google-disconnect-btn"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectGoogle}
              disabled={connecting}
              className="h-9 px-3 rounded-xl bg-slate-900 text-white text-sm hover:bg-slate-800 flex items-center gap-1.5 disabled:opacity-50"
              data-testid="google-connect-btn"
            >
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
              Connect Google Calendar
            </button>
          )}
        </div>
      </div>

      {/* Month nav */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="p-2 rounded-lg hover:bg-slate-100" data-testid="prev-month-btn"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-bold text-slate-800">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </span>
            <button
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="text-xs text-primary hover:underline"
              data-testid="today-btn"
            >
              Today
            </button>
          </div>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="p-2 rounded-lg hover:bg-slate-100" data-testid="next-month-btn"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap mb-3 text-[11px] text-slate-500">
          {Object.entries(SOURCE_STYLES).map(([k, s]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${s.dot}`}></span>{s.label}
            </span>
          ))}
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS_ABBR.map(d => (
            <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d, idx) => {
              if (!d) return <div key={`empty-${idx}`} className="min-h-[80px] sm:min-h-[100px] rounded-lg" />;
              const k = isoDay(d);
              const dayEvs = eventsByDay[k] || [];
              const isToday = k === todayKey;
              return (
                <button
                  key={k}
                  onClick={() => setSelectedDay(k)}
                  className={`text-left min-h-[80px] sm:min-h-[100px] rounded-lg border p-1.5 transition-all hover:border-slate-300 hover:shadow-sm ${isToday ? 'border-primary bg-primary/5' : 'border-slate-100 bg-slate-50/40'}`}
                  data-testid={`day-cell-${k}`}
                >
                  <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-primary' : 'text-slate-600'}`}>
                    {d.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvs.slice(0, 3).map(ev => {
                      const s = SOURCE_STYLES[ev.source] || SOURCE_STYLES.google;
                      return (
                        <div
                          key={ev.id}
                          className={`text-[10px] truncate px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}
                          title={ev.title}
                        >
                          {fmtTime(ev.start) ? `${fmtTime(ev.start)} · ` : ''}{ev.title}
                        </div>
                      );
                    })}
                    {dayEvs.length > 3 && (
                      <div className="text-[10px] text-slate-500 px-1.5">+{dayEvs.length - 3} more</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Day-detail Sheet */}
      <Sheet open={!!selectedDay} onOpenChange={(v) => { if (!v) setSelectedDay(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4" />
              {selectedDay && new Date(selectedDay + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {(eventsByDay[selectedDay] || []).length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-8">No events on this day</div>
            ) : (
              (eventsByDay[selectedDay] || []).map(ev => {
                const s = SOURCE_STYLES[ev.source] || SOURCE_STYLES.google;
                return (
                  <button
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className="w-full text-left rounded-xl border border-slate-200 p-3 hover:border-slate-300 hover:shadow-sm transition-all"
                    data-testid={`event-card-${ev.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`w-2 h-2 rounded-full ${s.dot} mt-1.5 shrink-0`}></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>
                          {fmtTime(ev.start) && (
                            <span className="text-[11px] text-slate-500 flex items-center gap-0.5"><Clock className="w-3 h-3" />{fmtTime(ev.start)}{fmtTime(ev.end) && ` – ${fmtTime(ev.end)}`}</span>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-slate-800 truncate">{ev.title}</div>
                        {ev.location && <div className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</div>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Event-detail Sheet */}
      <Sheet open={!!selectedEvent} onOpenChange={(v) => { if (!v) setSelectedEvent(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selectedEvent && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-start gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${(SOURCE_STYLES[selectedEvent.source] || SOURCE_STYLES.google).dot} mt-2 shrink-0`}></span>
                  <span>{selectedEvent.title}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <span className={`text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded ${(SOURCE_STYLES[selectedEvent.source] || SOURCE_STYLES.google).bg} ${(SOURCE_STYLES[selectedEvent.source] || SOURCE_STYLES.google).text}`}>
                    {(SOURCE_STYLES[selectedEvent.source] || SOURCE_STYLES.google).label}
                  </span>
                </div>
                {fmtTime(selectedEvent.start) && (
                  <div className="flex items-center gap-2 text-slate-700">
                    <Clock className="w-4 h-4 text-slate-400" />
                    {fmtTime(selectedEvent.start)}{fmtTime(selectedEvent.end) ? ` – ${fmtTime(selectedEvent.end)}` : ''}
                  </div>
                )}
                {selectedEvent.location && (
                  <div className="flex items-start gap-2 text-slate-700">
                    <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                    <span className="break-words">{selectedEvent.location}</span>
                  </div>
                )}
                {selectedEvent.meeting_link && (
                  <a
                    href={selectedEvent.meeting_link}
                    target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-primary hover:underline break-all"
                    data-testid="event-link"
                  >
                    <LinkIcon className="w-4 h-4" /> Join link <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {selectedEvent.description && (
                  <div className="flex items-start gap-2 text-slate-700">
                    <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                    <span className="whitespace-pre-wrap">{selectedEvent.description}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
