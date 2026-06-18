import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, AlertTriangle, Clock, ExternalLink, RefreshCw, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

/**
 * Compact, table-style list of the user's PREVIOUS daily-status action items.
 * Colour logic:
 *   - Linked + worked-upon → GREEN.
 *   - Linked + NOT worked-upon → RED.
 *   - No-lead (no task either) → muted neutral.
 *
 * Each row is a single line. Click the chevron to expand for the full
 * comment / linked-activity / task metadata.
 */
export default function YesterdayActionItems({ statusDate, refreshTick = 0 }) {
  const [data, setData] = useState({ previous_status_date: null, items: [] });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

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
      <Card className="p-4 border-0 shadow-sm bg-white/90 dark:bg-slate-900/90">
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

  const toggle = (idx) => setExpanded(prev => ({ ...prev, [idx]: !prev[idx] }));

  return (
    <Card className="p-4 border-0 shadow-sm bg-white/90 dark:bg-slate-900/90" data-testid="yesterday-action-items">
      <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Previous Status Action Items</h3>
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
          <Button type="button" size="sm" variant="ghost" onClick={load} className="h-7 px-2" data-testid="yesterday-refresh-btn">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 overflow-hidden">
        {items.map((it, idx) => {
          const linked = !!it.lead_id;
          const taskLinked = !linked && !!it.task_id;
          const trackable = linked || taskLinked;
          const stale = trackable && !it.worked_upon;
          const acted = trackable && it.worked_upon;
          const rowCls = stale
            ? 'bg-red-50/60 hover:bg-red-50'
            : acted
              ? 'bg-emerald-50/60 hover:bg-emerald-50'
              : 'bg-slate-50/40 hover:bg-slate-50';
          const Icon = acted ? CheckCircle2 : stale ? AlertTriangle : Clock;
          const iconCls = acted ? 'text-emerald-600' : stale ? 'text-red-500' : 'text-slate-400';
          const labelCls = stale ? 'text-red-700' : acted ? 'text-emerald-700' : 'text-slate-700';
          const isOpen = !!expanded[idx];
          const hasExtra = (it.description || '').trim() || (acted && it.last_activity) || taskLinked;

          return (
            <div
              key={idx}
              className={`border-b border-slate-200 last:border-b-0 ${rowCls} transition-colors`}
              data-testid={`yesterday-item-${idx}`}
            >
              {/* Single-line summary row */}
              <div className="flex items-center gap-2 px-3 py-2 text-sm">
                <Icon className={`h-4 w-4 flex-shrink-0 ${iconCls}`} />
                <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                {linked ? (
                  <a
                    href={`/leads/${it.lead_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1 font-medium hover:underline truncate max-w-[200px] ${labelCls}`}
                    data-testid={`yesterday-item-${idx}-lead-link`}
                  >
                    {it.lead_name || 'View lead'} <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                ) : taskLinked ? (
                  <a
                    href={`/tasks?task=${it.task_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1 font-medium hover:underline truncate max-w-[200px] ${labelCls}`}
                    data-testid={`yesterday-item-${idx}-task-link`}
                  >
                    {it.task?.task_number || it.task_number || 'View task'} <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                ) : (
                  <span className="italic text-slate-500 truncate">Not associated</span>
                )}
                {taskLinked && it.task?.status && (
                  <Badge variant="outline" className="text-[10px] capitalize flex-shrink-0">
                    {it.task.status.replace('_', ' ')}
                  </Badge>
                )}
                <span className={`text-xs flex-1 truncate ${stale ? 'text-red-800' : acted ? 'text-emerald-800' : 'text-slate-600'}`}>
                  {(it.description || '').trim() || <span className="italic text-slate-400">(no comments)</span>}
                </span>
                <span className="text-[11px] flex-shrink-0">
                  {acted && (
                    <span className="text-emerald-700 font-medium">
                      {linked ? 'Followed up' : 'Worked on'}
                    </span>
                  )}
                  {stale && (
                    <span className="text-red-700 font-medium">
                      {linked ? 'No follow-up' : 'No updates'}
                    </span>
                  )}
                </span>
                {hasExtra && (
                  <button
                    type="button"
                    onClick={() => toggle(idx)}
                    className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                    data-testid={`yesterday-item-${idx}-toggle`}
                  >
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>

              {/* Expanded detail */}
              {isOpen && hasExtra && (
                <div className="px-3 pb-3 pl-12 text-xs space-y-1 border-t border-slate-100 bg-white/40">
                  {(it.description || '').trim() && (
                    <p className="text-slate-700 whitespace-pre-wrap leading-relaxed pt-2">{it.description}</p>
                  )}
                  {acted && linked && it.last_activity && (
                    <p className="text-emerald-700">
                      Last activity: {it.last_activity.activity_type}
                      {it.last_activity.created_by_name ? ` by ${it.last_activity.created_by_name}` : ''}
                    </p>
                  )}
                  {acted && taskLinked && (
                    <p className="text-emerald-700">Task has been worked on.</p>
                  )}
                  {stale && linked && (
                    <p className="text-red-700">No follow-up activity recorded yet.</p>
                  )}
                  {stale && taskLinked && (
                    <p className="text-red-700">Task has had no updates yet.</p>
                  )}
                  {taskLinked && it.task?.due_date && (
                    <p className="text-slate-500">Task due: {it.task.due_date}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
