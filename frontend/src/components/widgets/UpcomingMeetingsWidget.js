import React, { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Calendar, Clock, Plus, Video, ExternalLink, CalendarDays, ArrowRight, Loader2 } from 'lucide-react';

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

const SOURCE_STYLES = {
  crm_meeting:    { bg: 'bg-sky-50',     text: 'text-sky-800',    dot: 'bg-sky-500',    iconColor: 'text-sky-600' },
  meeting_minutes:{ bg: 'bg-violet-50',  text: 'text-violet-800', dot: 'bg-violet-500', iconColor: 'text-violet-600' },
  google:         { bg: 'bg-rose-50',    text: 'text-rose-800',   dot: 'bg-rose-500',   iconColor: 'text-rose-600' },
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

  const selectedEvents = eventsByDay[selectedDay] || [];
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

  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
      {/* Header */}
      <div className="p-4 sm:p-5 pb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/50 dark:to-indigo-900/30">
            <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <span>Week Ahead</span>
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">· {totalUpcoming} event{totalUpcoming !== 1 ? 's' : ''}</span>
        </h2>
        <Link
          to="/personal-calendar"
          className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 hover:underline"
          data-testid="open-personal-calendar"
        >
          View Calendar <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* 7-day strip */}
      <div className="px-3 sm:px-4 pb-2">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map(d => {
            const k = isoDay(d);
            const dayEvs = eventsByDay[k] || [];
            const isToday = k === todayKey;
            const isSelected = k === selectedDay;
            return (
              <button
                key={k}
                onClick={() => setSelectedDay(k)}
                className={`relative flex flex-col items-center justify-center py-2 rounded-xl transition-all border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                    : isToday
                      ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-100 hover:bg-sky-100'
                      : 'bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 hover:bg-slate-50'
                }`}
                data-testid={`week-strip-${k}`}
              >
                <span className={`text-[9px] font-bold uppercase tracking-[0.12em] ${isSelected ? 'text-white/80' : 'opacity-60'}`}>{DAYS_ABBR[d.getDay()]}</span>
                <span className="text-base font-black tabular-nums leading-tight mt-0.5">{d.getDate()}</span>
                {dayEvs.length > 0 ? (
                  <div className="flex items-center gap-0.5 mt-1 h-1.5">
                    {dayEvs.slice(0, 3).map((ev, i) => (
                      <span key={i} className={`w-1.5 h-1.5 rounded-full ${SOURCE_STYLES[ev.source]?.dot || 'bg-slate-400'} ${isSelected ? 'opacity-90' : ''}`}></span>
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

      {/* Events list for selected day */}
      <div className="px-4 sm:px-5 pb-3 min-h-[180px]">
        <div className="flex items-center justify-between mb-2 mt-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {selectedDay === todayKey ? 'Today' : new Date(selectedDay + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <span className="text-[10px] font-semibold text-slate-400 tabular-nums">{selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : selectedEvents.length === 0 ? (
          <div className="text-center py-8">
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
          <div className="space-y-1.5">
            {selectedEvents.map(ev => {
              const s = SOURCE_STYLES[ev.source] || SOURCE_STYLES.google;
              const time = fmtTime(ev.start);
              const platform = detectPlatform(ev);
              return (
                <button
                  key={ev.id}
                  onClick={() => handleEventClick(ev)}
                  className={`w-full text-left rounded-lg ${s.bg} hover:brightness-95 hover:shadow-sm transition-all px-2.5 py-2 flex items-center gap-2`}
                  data-testid={`week-event-${ev.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className={`flex items-center gap-1.5 text-[11px] font-bold tabular-nums ${s.text} leading-tight`}>
                      {time ? <span>{time}</span> : <span className="opacity-70 uppercase tracking-wide text-[10px]">All day</span>}
                      <span className={`w-1 h-1 rounded-full ${s.dot} opacity-50`}></span>
                      <span className="text-[9px] uppercase tracking-wide font-bold opacity-70">
                        {ev.source === 'crm_meeting' ? 'CRM' : ev.source === 'meeting_minutes' ? 'Minutes' : 'Google'}
                      </span>
                    </div>
                    <div className={`text-xs font-semibold ${s.text} truncate mt-0.5`}>{ev.title}</div>
                  </div>
                  {platform === 'zoom' && <ZoomDot />}
                  {platform === 'meet'  && <MeetDot />}
                  {platform === 'teams' && <Video className="w-3.5 h-3.5 text-[#5059C9] shrink-0" />}
                  {ev.meeting_link && platform && <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />}
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
