import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, MapPin, Link as LinkIcon,
  Loader2, Plug, RefreshCw, ExternalLink, AlertCircle, Video, FileText,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getAuthHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function pad(n) { return String(n).padStart(2, '0'); }
function isoDay(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

const SOURCE_STYLES = {
  crm_meeting:    { bg: 'bg-sky-50',     text: 'text-sky-800',    border: 'border-l-sky-500',    dot: 'bg-sky-500',    label: 'CRM Meeting',  iconColor: 'text-sky-600' },
  meeting_minutes:{ bg: 'bg-violet-50',  text: 'text-violet-800', border: 'border-l-violet-500', dot: 'bg-violet-500', label: 'Minutes',      iconColor: 'text-violet-600' },
  google:         { bg: 'bg-rose-50',    text: 'text-rose-800',   border: 'border-l-rose-500',   dot: 'bg-rose-500',   label: 'Google',       iconColor: 'text-rose-600' },
};

function fmtTime(iso) {
  if (!iso || iso.length === 10) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return null; }
}

function dayKeyFromEvent(ev) {
  const s = ev.start || '';
  return s.length >= 10 ? s.slice(0, 10) : s;
}

// Inline Zoom-style icon — distinctive blue circle with camera silhouette
function ZoomIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Zoom" fill="currentColor">
      <path d="M3 7a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm14 2.5l4-2.5v10l-4-2.5v-5z" />
    </svg>
  );
}

// Google Meet icon — green camera mark
function MeetIcon({ className = 'w-3.5 h-3.5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Google Meet" fill="currentColor">
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
  if (link.includes('webex')) return 'webex';
  return null;
}

function PlatformBadge({ platform, size = 'sm' }) {
  if (!platform) return null;
  const cls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  if (platform === 'zoom') {
    return <span className="inline-flex items-center text-[#2D8CFF]" title="Zoom"><ZoomIcon className={cls} /></span>;
  }
  if (platform === 'meet') {
    return <span className="inline-flex items-center text-[#00897B]" title="Google Meet"><MeetIcon className={cls} /></span>;
  }
  if (platform === 'teams') {
    return <span className="inline-flex items-center text-[#5059C9]" title="Microsoft Teams"><Video className={cls} /></span>;
  }
  return <span className="inline-flex items-center text-slate-500" title="Online meeting"><Video className={cls} /></span>;
}

function EventPill({ ev, onClick }) {
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
        {time && (
          <span className={`text-[11px] font-bold tabular-nums ${s.text} shrink-0`}>{time}</span>
        )}
        {platform && <PlatformBadge platform={platform} />}
        <span className={`text-[11px] font-medium ${s.text} truncate flex-1`}>{ev.title}</span>
      </div>
    </button>
  );
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
    // sort each day by start
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
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
    for (let i = 0; i < startWeekDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const todayKey = isoDay(today);
  const monthEventCount = events.length;
  const upcomingToday = (eventsByDay[todayKey] || []).length;

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
            <span className="text-xs text-slate-500">This month</span>
            <span className="text-sm font-bold text-slate-900 tabular-nums">{monthEventCount}</span>
          </div>
          <button
            onClick={fetchEvents}
            className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-1.5"
            data-testid="refresh-btn"
          >
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
              <button
                onClick={handleDisconnectGoogle}
                className="h-10 px-3.5 rounded-xl border border-rose-200 bg-rose-50 text-sm font-medium text-rose-700 hover:bg-rose-100 transition-all"
                data-testid="google-disconnect-btn"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectGoogle}
              disabled={connecting}
              className="h-10 px-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white text-sm font-semibold hover:from-slate-800 hover:to-slate-600 transition-all shadow-md shadow-slate-900/20 flex items-center gap-2 disabled:opacity-50"
              data-testid="google-connect-btn"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
              Connect Google Calendar
            </button>
          )}
        </div>
      </div>

      {/* Month container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Top toolbar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center transition-all"
                data-testid="prev-month-btn"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4 text-slate-700" />
              </button>
              <button
                onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
                className="px-3 h-8 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:shadow-sm transition-all"
                data-testid="today-btn"
              >
                Today
              </button>
              <button
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                className="w-8 h-8 rounded-lg hover:bg-white hover:shadow-sm flex items-center justify-center transition-all"
                data-testid="next-month-btn"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4 text-slate-700" />
              </button>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {MONTHS[cursor.getMonth()]} <span className="text-slate-400 font-light">{cursor.getFullYear()}</span>
            </h2>
          </div>

          {/* Legend */}
          <div className="hidden md:flex items-center gap-4">
            {Object.entries(SOURCE_STYLES).map(([k, s]) => (
              <span key={k} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`}></span>{s.label}
              </span>
            ))}
          </div>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/50">
          {DAYS_ABBR.map((d, i) => (
            <div
              key={d}
              className={`text-center text-[11px] font-bold uppercase tracking-[0.14em] py-2.5 ${i === 0 || i === 6 ? 'text-slate-400' : 'text-slate-500'}`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : (
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
                  onClick={() => setSelectedDay(k)}
                  className={`group relative min-h-[110px] sm:min-h-[140px] border-r border-b border-slate-100 p-2 sm:p-2.5 cursor-pointer transition-all hover:bg-slate-50/70 ${isToday ? 'bg-sky-50/40' : isWeekend ? 'bg-slate-50/30' : 'bg-white'}`}
                  data-testid={`day-cell-${k}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded-full text-sm font-bold tabular-nums ${
                        isToday
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-700 group-hover:bg-slate-100'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {dayEvs.length > 0 && !isToday && (
                      <span className="text-[10px] font-semibold text-slate-400 tabular-nums">{dayEvs.length}</span>
                    )}
                  </div>
                  <div className="space-y-0.5 overflow-hidden">
                    {dayEvs.slice(0, 3).map(ev => (
                      <EventPill key={ev.id} ev={ev} onClick={setSelectedEvent} />
                    ))}
                    {dayEvs.length > 3 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedDay(k); }}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 px-1.5 py-0.5"
                      >
                        +{dayEvs.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Day-detail Sheet */}
      <Sheet open={!!selectedDay} onOpenChange={(v) => { if (!v) setSelectedDay(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-lg flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-slate-700" />
              {selectedDay && new Date(selectedDay + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-5 space-y-2.5">
            {(eventsByDay[selectedDay] || []).length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-12">No events on this day</div>
            ) : (
              (eventsByDay[selectedDay] || []).map(ev => {
                const s = SOURCE_STYLES[ev.source] || SOURCE_STYLES.google;
                const time = fmtTime(ev.start);
                const endTime = fmtTime(ev.end);
                const platform = detectPlatform(ev);
                return (
                  <button
                    key={ev.id}
                    onClick={() => { setSelectedEvent(ev); }}
                    className={`w-full text-left rounded-xl border-l-[3px] ${s.border} bg-white border-y border-r border-slate-200 p-3.5 hover:shadow-md hover:border-slate-300 transition-all`}
                    data-testid={`event-card-${ev.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-md ${s.bg} ${s.text}`}>{s.label}</span>
                          {platform && <PlatformBadge platform={platform} size="md" />}
                          {time && (
                            <span className="text-xs font-bold text-slate-700 tabular-nums flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {time}{endTime && time !== endTime ? ` – ${endTime}` : ''}
                            </span>
                          )}
                          {!time && ev.all_day && (
                            <span className="text-xs font-bold text-slate-500">All day</span>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 line-clamp-2">{ev.title}</div>
                        {ev.location && (
                          <div className="text-xs text-slate-500 mt-1 truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3" />{ev.location}
                          </div>
                        )}
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
          {selectedEvent && (() => {
            const s = SOURCE_STYLES[selectedEvent.source] || SOURCE_STYLES.google;
            const platform = detectPlatform(selectedEvent);
            const time = fmtTime(selectedEvent.start);
            const endTime = fmtTime(selectedEvent.end);
            return (
              <>
                <SheetHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-md ${s.bg} ${s.text}`}>{s.label}</span>
                    {platform && <PlatformBadge platform={platform} size="md" />}
                  </div>
                  <SheetTitle className="text-xl leading-tight">{selectedEvent.title}</SheetTitle>
                </SheetHeader>
                <div className="mt-5 space-y-4 text-sm">
                  {time && (
                    <div className="flex items-start gap-3 text-slate-800">
                      <Clock className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <div className="font-semibold tabular-nums">{time}{endTime && time !== endTime ? ` – ${endTime}` : ''}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {selectedEvent.start && new Date(selectedEvent.start).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedEvent.all_day && !time && (
                    <div className="flex items-center gap-3 text-slate-800">
                      <CalendarIcon className="w-5 h-5 text-slate-400" />
                      <span className="font-semibold">All day</span>
                    </div>
                  )}
                  {selectedEvent.location && (
                    <div className="flex items-start gap-3 text-slate-800">
                      <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                      <span className="break-words">{selectedEvent.location}</span>
                    </div>
                  )}
                  {selectedEvent.meeting_link && (
                    <a
                      href={selectedEvent.meeting_link}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-3 text-sky-700 hover:text-sky-800 font-medium break-all rounded-xl bg-sky-50 border border-sky-200 px-3 py-2.5 hover:bg-sky-100 transition-all"
                      data-testid="event-link"
                    >
                      {platform === 'zoom' ? <ZoomIcon className="w-5 h-5 text-[#2D8CFF]" /> :
                       platform === 'meet' ? <MeetIcon className="w-5 h-5 text-[#00897B]" /> :
                       <LinkIcon className="w-5 h-5" />}
                      <span className="flex-1 truncate">Join {platform === 'zoom' ? 'Zoom' : platform === 'meet' ? 'Google Meet' : platform === 'teams' ? 'Teams' : 'meeting'}</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  {selectedEvent.description && (
                    <div className="flex items-start gap-3 text-slate-800">
                      <FileText className="w-5 h-5 text-slate-400 mt-0.5" />
                      <span className="whitespace-pre-wrap leading-relaxed">{selectedEvent.description}</span>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
