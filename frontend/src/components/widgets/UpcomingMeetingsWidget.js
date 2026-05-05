import React, { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import {
  Calendar, Plus, Video, ExternalLink, CalendarDays, ArrowRight, Loader2,
  Clock, Radio, ChevronLeft, ChevronRight,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const DAYS_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function fmtTime(iso) {
  if (!iso || iso.length === 10) return null;
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }); }
  catch { return null; }
}

function eventEndMs(ev) {
  if (!ev?.start) return null;
  try {
    const startMs = new Date(ev.start).getTime();
    if (Number.isNaN(startMs)) return null;
    if (ev.end) {
      const e = new Date(ev.end).getTime();
      if (!Number.isNaN(e)) return e;
    }
    const dur = Number(ev.duration_minutes) > 0 ? Number(ev.duration_minutes) : 60;
    return startMs + dur * 60 * 1000;
  } catch { return null; }
}

function detectPlatform(ev) {
  const link = (ev.meeting_link || '').toLowerCase();
  const loc = (ev.location || '').toLowerCase();
  if (link.includes('zoom.us') || loc.includes('zoom')) return 'zoom';
  if (link.includes('meet.google') || loc.includes('meet.google')) return 'meet';
  if (link.includes('teams.microsoft') || loc.includes('teams')) return 'teams';
  return null;
}

function ZoomDot() { return <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[#2D8CFF] shrink-0" fill="currentColor"><path d="M3 7a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm14 2.5l4-2.5v10l-4-2.5v-5z" /></svg>; }
function MeetDot()  { return <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[#00897B] shrink-0" fill="currentColor"><path d="M3 7a2 2 0 012-2h7v14H5a2 2 0 01-2-2V7z" /><path d="M14 7l4-2v14l-4-2V7z" opacity="0.7" /></svg>; }

const SOURCE_BADGE = {
  crm_meeting:    { label: 'CRM',     dot: 'bg-sky-500',    chipBg: 'bg-sky-50 text-sky-700' },
  meeting_minutes:{ label: 'Minutes', dot: 'bg-violet-500', chipBg: 'bg-violet-50 text-violet-700' },
  google:         { label: 'Google',  dot: 'bg-rose-500',   chipBg: 'bg-rose-50 text-rose-700' },
};

function getAuthHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

export function UpcomingMeetingsWidget({ onNewMeeting, onViewMeeting }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(isoDay(today));
  const [now, setNow] = useState(Date.now());

  // Tick every 30s to refresh "live / up-next" state without a hard reload
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const start = isoDay(days[0]);
      const end = isoDay(days[6]);
      const res = await axios.get(`${API_URL}/personal-calendar/events`, {
        headers: getAuthHeaders(),
        params: { start_date: start, end_date: end },
      });
      setEvents(res.data?.events || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const eventsByDay = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const k = (ev.start || '').slice(0, 10);
      if (!k) continue;
      (map[k] = map[k] || []).push(ev);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    return map;
  }, [events]);

  // Auto-select first day with events on initial load if today is empty
  useEffect(() => {
    if (loading) return;
    if ((eventsByDay[isoDay(today)] || []).length === 0) {
      const firstWithEvents = days.find(d => (eventsByDay[isoDay(d)] || []).length > 0);
      if (firstWithEvents) setSelectedDay(isoDay(firstWithEvents));
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute status for each event in the selected day:
  //   live: ongoing now
  //   up_next: the very next future event across the visible window (only one)
  //   upcoming: future, not the next
  //   past: ended before now
  const { selectedEvents, statusByEvent } = useMemo(() => {
    const evs = eventsByDay[selectedDay] || [];
    // up_next must be picked from the FULL visible window, not just selected day,
    // so "next meeting" stays accurate even when the user is browsing future days.
    const allUpcoming = events
      .map(ev => ({ ev, startMs: ev.start ? new Date(ev.start).getTime() : null }))
      .filter(({ startMs }) => Number.isFinite(startMs) && startMs > now)
      .sort((a, b) => a.startMs - b.startMs);

    // Current live event (if any) anywhere in the window
    const liveEvent = events.find(ev => {
      if (!ev.start) return false;
      const s = new Date(ev.start).getTime();
      const e = eventEndMs(ev);
      return Number.isFinite(s) && Number.isFinite(e) && s <= now && now <= e;
    });

    const upNextId = !liveEvent ? allUpcoming[0]?.ev?.id : null;
    const liveId = liveEvent?.id;

    const map = {};
    for (const ev of evs) {
      const s = ev.start ? new Date(ev.start).getTime() : null;
      const e = eventEndMs(ev);
      if (Number.isFinite(s) && Number.isFinite(e) && s <= now && now <= e) {
        map[ev.id] = 'live';
      } else if (Number.isFinite(e) && e < now) {
        map[ev.id] = 'past';
      } else if (ev.id === upNextId) {
        map[ev.id] = 'up_next';
      } else {
        map[ev.id] = 'upcoming';
      }
    }
    // Ensure live wins over everything for the live event
    if (liveId && map[liveId] !== undefined) map[liveId] = 'live';

    return { selectedEvents: evs, statusByEvent: map };
  }, [eventsByDay, selectedDay, events, now]);

  const todayKey = isoDay(today);
  const totalUpcoming = events.length;

  const handleEventClick = async (ev) => {
    if (ev.source === 'crm_meeting') {
      try {
        const res = await axios.get(`${API_URL}/meetings/${ev.ref_id}`, { headers: getAuthHeaders() });
        onViewMeeting?.(res.data);
      } catch {
        // fall through silently
      }
    } else if (ev.meeting_link) {
      window.open(ev.meeting_link, '_blank');
    }
  };

  // Horizontal scroll helpers
  const scrollerRef = React.useRef(null);
  const scrollBy = (delta) => {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="upcoming-meetings-widget">
      {/* Header */}
      <div className="p-4 sm:p-5 pb-3 flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/50 dark:to-indigo-900/30 shrink-0">
            <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="shrink-0">Week Ahead</span>
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400 truncate">· {totalUpcoming} event{totalUpcoming !== 1 ? 's' : ''}</span>
        </h2>
        <Link
          to="/personal-calendar"
          className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 hover:underline shrink-0"
          data-testid="open-personal-calendar"
        >
          View Calendar <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* 7-day strip — full width, generous tiles */}
      <div className="px-3 sm:px-5 pb-3">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {days.map(d => {
            const k = isoDay(d);
            const dayEvs = eventsByDay[k] || [];
            const isToday = k === todayKey;
            const isSelected = k === selectedDay;
            return (
              <button
                key={k}
                onClick={() => setSelectedDay(k)}
                className={`relative flex flex-col items-center justify-center py-2 sm:py-3 rounded-xl transition-all border min-w-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : isToday
                      ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-100 hover:bg-sky-100'
                      : 'bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 hover:bg-slate-50'
                }`}
                data-testid={`week-strip-${k}`}
              >
                <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${isSelected ? 'text-white/80' : 'opacity-60'}`}>{DAYS_ABBR[d.getDay()]}</span>
                <span className="text-base sm:text-xl font-black tabular-nums leading-tight">{d.getDate()}</span>
                {dayEvs.length > 0 ? (
                  <div className="flex items-center gap-0.5 mt-1 h-1.5">
                    {dayEvs.slice(0, 3).map((ev, i) => (
                      <span key={i} className={`w-1.5 h-1.5 rounded-full ${(SOURCE_BADGE[ev.source] || SOURCE_BADGE.google).dot} ${isSelected ? 'opacity-90' : ''}`}></span>
                    ))}
                    {dayEvs.length > 3 && <span className={`text-[8px] font-bold ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>+{dayEvs.length - 3}</span>}
                  </div>
                ) : (
                  <div className="h-1.5 mt-1"></div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day header row */}
      <div className="px-4 sm:px-5 flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          {selectedDay === todayKey ? 'Today' : new Date(selectedDay + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          <span className="ml-2 text-[10px] font-semibold text-slate-400 normal-case tracking-normal">{selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}</span>
        </p>
        {selectedEvents.length > 2 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => scrollBy(-280)}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Scroll left"
              data-testid="meetings-scroll-left"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => scrollBy(280)}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Scroll right"
              data-testid="meetings-scroll-right"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Horizontal meeting cards */}
      <div className="px-4 sm:px-5 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-12" data-testid="meetings-loading">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : selectedEvents.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl" data-testid="meetings-empty">
            <Calendar className="h-8 w-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-400">Nothing scheduled</p>
            <button
              onClick={onNewMeeting}
              className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              data-testid="empty-state-schedule"
            >
              Schedule a meeting
            </button>
          </div>
        ) : (
          <div
            ref={scrollerRef}
            className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1 scroll-smooth scrollbar-thin"
            style={{ scrollbarWidth: 'thin' }}
            data-testid="meetings-horizontal-scroll"
          >
            {selectedEvents.map(ev => {
              const status = statusByEvent[ev.id] || 'upcoming';
              const time = fmtTime(ev.start);
              const platform = detectPlatform(ev);
              const sourceBadge = SOURCE_BADGE[ev.source] || SOURCE_BADGE.google;

              const cardCls = {
                live:     'bg-gradient-to-br from-emerald-50 to-emerald-100/70 border-emerald-300 ring-2 ring-emerald-400/60 shadow-emerald-200/50 shadow-lg',
                up_next:  'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-300 ring-2 ring-blue-300/60 shadow-blue-200/40 shadow-md',
                upcoming: 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:border-slate-300',
                past:     'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 opacity-60',
              }[status];

              const textPrimary = {
                live:     'text-emerald-900',
                up_next:  'text-blue-900',
                upcoming: 'text-slate-900 dark:text-slate-100',
                past:     'text-slate-500 line-through decoration-slate-300/60',
              }[status];

              const textTime = {
                live:     'text-emerald-700',
                up_next:  'text-blue-700',
                upcoming: 'text-slate-600 dark:text-slate-400',
                past:     'text-slate-400',
              }[status];

              return (
                <button
                  key={ev.id}
                  onClick={() => handleEventClick(ev)}
                  className={`group snap-start flex-shrink-0 w-[260px] sm:w-[280px] text-left rounded-xl border ${cardCls} transition-all p-3.5 flex flex-col gap-2 relative overflow-hidden`}
                  data-testid={`meeting-card-${ev.id}`}
                  data-status={status}
                >
                  {/* Status pill */}
                  {status === 'live' && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full shadow-md">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                      </span>
                      Live Now
                    </div>
                  )}
                  {status === 'up_next' && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-blue-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full shadow-sm">
                      <Radio className="h-2.5 w-2.5" />
                      Up Next
                    </div>
                  )}
                  {status === 'past' && (
                    <div className="absolute top-2 right-2 bg-slate-300 text-slate-600 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                      Done
                    </div>
                  )}

                  {/* Time */}
                  <div className="flex items-center gap-1.5">
                    <Clock className={`h-3.5 w-3.5 ${textTime}`} />
                    <span className={`text-[12px] font-bold tabular-nums ${textTime}`}>
                      {time || 'All day'}
                    </span>
                    {ev.duration_minutes && (
                      <span className={`text-[10px] font-semibold ${textTime} opacity-70`}>
                        · {ev.duration_minutes}m
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <p className={`text-sm font-bold ${textPrimary} leading-snug line-clamp-2 mt-0.5 pr-14`}>
                    {ev.title}
                  </p>

                  {/* Footer row: source chip + platform icon */}
                  <div className="flex items-center justify-between mt-auto pt-2">
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${sourceBadge.chipBg}`}>
                      <span className={`w-1 h-1 rounded-full ${sourceBadge.dot}`} />
                      {sourceBadge.label}
                    </span>
                    <div className="flex items-center gap-1 text-slate-400 group-hover:text-slate-700 transition-colors">
                      {platform === 'zoom' && <ZoomDot />}
                      {platform === 'meet'  && <MeetDot />}
                      {platform === 'teams' && <Video className="w-3.5 h-3.5 text-[#5059C9]" />}
                      {ev.meeting_link && platform && <ExternalLink className="w-3 h-3" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="default"
          className="h-10 text-sm font-medium border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
          asChild
        >
          <Link to="/personal-calendar" data-testid="footer-open-calendar">
            <CalendarDays className="h-4 w-4 mr-2" /> Open Calendar
          </Link>
        </Button>
        <Button
          variant="outline"
          size="default"
          className="h-10 text-sm font-medium border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-800 dark:hover:text-blue-300 bg-white dark:bg-slate-900"
          onClick={onNewMeeting}
          data-testid="footer-schedule"
        >
          <Plus className="h-4 w-4 mr-2" /> Schedule
        </Button>
      </div>
    </Card>
  );
}
