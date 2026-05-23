import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, AlertTriangle, Clock, ExternalLink, RefreshCw, MapPin } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

/**
 * Shows the user's PREVIOUS daily-status action items (the most recent
 * daily_status strictly BEFORE `statusDate`) and whether each linked lead
 * has had any follow-up activity since.
 *
 * Colour logic:
 *   - Linked + worked-upon → GREEN (border, ring, icon, text)
 *   - Linked + NOT worked-upon → RED (border, ring, icon, text)
 *   - No-lead items → muted grey row.
 *
 * Layout: lead name appears FIRST, comments appear below.
 */
export default function YesterdayActionItems({ statusDate, refreshTick = 0 }) {
  const [data, setData] = useState({ previous_status_date: null, items: [] });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = statusDate ? { status_date: statusDate } : {};
      const res = await axios.get(
        `${API_URL}/daily-status/yesterday-followup-status`,
        { headers: getAuthHeaders(), params }
      );
      setData(res.data || { previous_status_date: null, items: [] });
    } catch {
      setData({ previous_status_date: null, items: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [refreshTick, statusDate]);

  if (loading) {
    return (
      <Card className="p-5 border-0 shadow-sm bg-white/90 dark:bg-slate-900/90">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" /> Checking previous status follow-ups…
        </div>
      </Card>
    );
  }

  const { previous_status_date: prevDate, items } = data;
  if (!prevDate || items.length === 0) return null;

  const pending = items.filter(it => (it.lead_id || it.task_id) && !it.worked_upon).length;
  const done = items.filter(it => (it.lead_id || it.task_id) && it.worked_upon).length;
  const noLead = items.filter(it => !it.lead_id && !it.task_id).length;

  return (
    <Card className="p-5 border-0 shadow-sm bg-white/90 dark:bg-slate-900/90" data-testid="yesterday-action-items">
      <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">
            Previous Status Action Items
          </h3>
          <span className="text-xs text-slate-500">({prevDate})</span>
        </div>
        <div className="flex items-center gap-1.5">
          {pending > 0 && (
            <Badge variant="outline" className="text-[11px] text-red-700 border-red-300 bg-red-50">
              {pending} not followed up
            </Badge>
          )}
          {done > 0 && (
            <Badge variant="outline" className="text-[11px] text-emerald-700 border-emerald-300 bg-emerald-50">
              {done} done
            </Badge>
          )}
          {noLead > 0 && (
            <Badge variant="outline" className="text-[11px] text-slate-600 border-slate-300 bg-slate-50">
              {noLead} non-lead
            </Badge>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={load}
            className="h-7 px-2"
            data-testid="yesterday-refresh-btn"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((it, idx) => {
          const linked = !!it.lead_id;
          const taskLinked = !linked && !!it.task_id;
          const trackable = linked || taskLinked;
          const stale = trackable && !it.worked_upon;
          const acted = trackable && it.worked_upon;
          const rowCls = stale
            ? 'border-red-300 bg-red-50/60 ring-1 ring-red-200'
            : acted
              ? 'border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200'
              : 'border-slate-200 bg-slate-50/50';
          const Icon = acted ? CheckCircle2 : stale ? AlertTriangle : Clock;
          const iconCls = acted ? 'text-emerald-600' : stale ? 'text-red-600' : 'text-slate-400';
          return (
            <div
              key={idx}
              className={`rounded-lg p-3 border transition-colors ${rowCls}`}
              data-testid={`yesterday-item-${idx}`}
            >
              <div className="flex items-start gap-2">
                <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconCls}`} />
                <div className="flex-1 min-w-0">
                  {/* Lead OR task link first */}
                  <div className="flex items-center gap-1.5 text-sm flex-wrap">
                    <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    {linked ? (
                      <a
                        href={`/leads/${it.lead_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-1 font-medium hover:underline ${stale ? 'text-red-700' : acted ? 'text-emerald-700' : 'text-slate-700'}`}
                        data-testid={`yesterday-item-${idx}-lead-link`}
                      >
                        {it.lead_name || 'View lead'} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : taskLinked ? (
                      <a
                        href={`/tasks?task=${it.task_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-1 font-medium hover:underline ${stale ? 'text-red-700' : acted ? 'text-emerald-700' : 'text-slate-700'}`}
                        data-testid={`yesterday-item-${idx}-task-link`}
                      >
                        {it.task?.task_number || it.task_number || 'View task'} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="italic text-slate-500">Not associated with any lead</span>
                    )}
                    {taskLinked && it.task?.status && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {it.task.status.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                  {/* Comments next */}
                  {(it.description || '').trim() ? (
                    <p className={`text-xs leading-snug mt-1 pl-5 ${stale ? 'text-red-800' : acted ? 'text-emerald-800' : 'text-slate-700'}`}>
                      {it.description}
                    </p>
                  ) : (
                    <p className="text-xs italic text-slate-400 leading-snug mt-1 pl-5">
                      (no comments)
                    </p>
                  )}
                  <div className="flex items-center flex-wrap gap-2 mt-1 pl-5 text-[11px]">
                    {acted && linked && it.last_activity && (
                      <span className="text-emerald-700">
                        last activity: {it.last_activity.activity_type}
                        {it.last_activity.created_by_name ? ` by ${it.last_activity.created_by_name}` : ''}
                      </span>
                    )}
                    {acted && taskLinked && (
                      <span className="text-emerald-700">
                        Task has been worked on
                      </span>
                    )}
                    {stale && linked && (
                      <span className="font-medium text-red-700">
                        No follow-up activity recorded yet
                      </span>
                    )}
                    {stale && taskLinked && (
                      <span className="font-medium text-red-700">
                        Task has had no updates yet
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
