import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, AlertTriangle, Clock, ExternalLink, RefreshCw } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

/**
 * Shows the user's PREVIOUS daily-status action items and whether each
 * lead has had any follow-up activity since.
 *
 * - Lead-linked + worked-upon → green check, neutral background.
 * - Lead-linked + NOT worked-upon → red ring + warning badge so the team
 *   can see at a glance which planned items were ignored.
 * - "No lead" items show a muted grey row (no traceability needed).
 */
export default function YesterdayActionItems({ refreshTick = 0 }) {
  const [data, setData] = useState({ previous_status_date: null, items: [] });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `${API_URL}/daily-status/yesterday-followup-status`,
        { headers: getAuthHeaders() }
      );
      setData(res.data || { previous_status_date: null, items: [] });
    } catch {
      setData({ previous_status_date: null, items: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [refreshTick]);

  if (loading) {
    return (
      <Card className="p-5 border-0 shadow-sm bg-white/90 dark:bg-slate-900/90">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" /> Checking yesterday's follow-ups…
        </div>
      </Card>
    );
  }

  const { previous_status_date: prevDate, items } = data;
  if (!prevDate || items.length === 0) return null;

  const pending = items.filter(it => it.lead_id && !it.worked_upon).length;
  const done = items.filter(it => it.lead_id && it.worked_upon).length;
  const noLead = items.filter(it => !it.lead_id).length;

  return (
    <Card className="p-5 border-0 shadow-sm bg-white/90 dark:bg-slate-900/90" data-testid="yesterday-action-items">
      <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">
            Yesterday's Action Items
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
            <Badge variant="outline" className="text-[11px] text-blue-700 border-blue-300 bg-blue-50">
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
          const stale = linked && !it.worked_upon;
          const acted = linked && it.worked_upon;
          return (
            <div
              key={idx}
              className={`rounded-lg p-3 border transition-colors ${
                stale
                  ? 'border-red-300 bg-red-50/60 ring-1 ring-red-200'
                  : acted
                    ? 'border-blue-300 bg-blue-50/60 ring-1 ring-blue-200'
                    : 'border-slate-200 bg-slate-50/50'
              }`}
              data-testid={`yesterday-item-${idx}`}
            >
              <div className="flex items-start gap-2">
                {linked
                  ? (it.worked_upon
                      ? <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      : <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />)
                  : <Clock className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${stale ? 'text-red-900' : acted ? 'text-blue-900' : 'text-slate-900'}`}>
                    {it.description}
                  </p>
                  <div className="flex items-center flex-wrap gap-2 mt-1 text-[11px]">
                    {linked ? (
                      <a
                        href={`/leads/${it.lead_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-1 font-medium hover:underline ${stale ? 'text-red-700' : 'text-blue-700'}`}
                        data-testid={`yesterday-item-${idx}-lead-link`}
                      >
                        {it.lead_name || 'View lead'} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-slate-500 italic">Not associated with any lead</span>
                    )}
                    {acted && it.last_activity && (
                      <span className="text-blue-700">
                        · last activity: {it.last_activity.activity_type}
                        {it.last_activity.created_by_name ? ` by ${it.last_activity.created_by_name}` : ''}
                      </span>
                    )}
                    {stale && (
                      <span className="font-medium text-red-700">
                        · No follow-up activity recorded yet
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
