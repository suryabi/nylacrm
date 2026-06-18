import React from 'react';
import { format, parseISO } from 'date-fns';
import { ListChecks, Calendar, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

/**
 * Renders all `action_item` activities for a lead as a dedicated, full-width
 * section. Kept separate from the regular Activity Timeline so daily-status
 * commitments never get visually mixed up with calls/visits/emails.
 *
 * Colour logic:
 *   - Planned date in the past + a non-action_item activity exists on the lead
 *     for that planned date         → GREEN (worked upon on the planned day).
 *   - Planned date in the past + no such activity → RED (missed).
 *   - Planned date today/future or unknown        → neutral (not yet due).
 */
export default function ActionItemsSection({ actionItems, activities }) {
  if (!actionItems || actionItems.length === 0) {
    return null;
  }

  // All non-action_item activities for the lead, indexed by YYYY-MM-DD.
  const otherActivities = (activities || []).filter(a => a.activity_type !== 'action_item');
  const activityDateMap = new Map();
  for (const a of otherActivities) {
    if (!a.created_at) continue;
    const key = String(a.created_at).slice(0, 10); // YYYY-MM-DD
    if (!activityDateMap.has(key)) activityDateMap.set(key, []);
    activityDateMap.get(key).push(a);
  }

  // Pull the planned date either from the explicit field (new rows) or from
  // the "(planned for YYYY-MM-DD)" suffix in the legacy description string.
  const PLANNED_RE = /\(planned for (\d{4}-\d{2}-\d{2})\)/;
  const today = new Date().toISOString().slice(0, 10);

  const enriched = actionItems.map((item) => {
    let planned = item.planned_date;
    if (!planned && item.description) {
      const m = item.description.match(PLANNED_RE);
      if (m) planned = m[1];
    }
    let state = 'neutral'; // not yet due
    let workedActivity = null;
    if (planned) {
      const matchingActs = activityDateMap.get(planned) || [];
      if (matchingActs.length > 0) {
        state = 'green';
        workedActivity = matchingActs[0];
      } else if (planned < today) {
        state = 'red';
      }
    }
    return { ...item, _planned: planned, _state: state, _workedActivity: workedActivity };
  });

  const sorted = [...enriched].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  const greenCount = sorted.filter(i => i._state === 'green').length;
  const redCount = sorted.filter(i => i._state === 'red').length;

  return (
    <Card className="p-4 sm:p-6" data-testid="lead-action-items-section">
      <div className="flex items-center gap-2 mb-3 sm:mb-4 flex-wrap">
        <ListChecks className="h-5 w-5 text-indigo-600" />
        <h2 className="text-base sm:text-lg font-semibold">Action Items</h2>
        <Badge variant="outline" className="text-[11px] text-indigo-700 border-indigo-200 bg-indigo-50">
          {sorted.length}
        </Badge>
        {greenCount > 0 && (
          <Badge variant="outline" className="text-[11px] text-emerald-700 border-emerald-300 bg-emerald-50">
            {greenCount} worked on planned day
          </Badge>
        )}
        {redCount > 0 && (
          <Badge variant="outline" className="text-[11px] text-red-700 border-red-300 bg-red-50">
            {redCount} missed
          </Badge>
        )}
      </div>
      <div className="space-y-2">
        {sorted.map((item) => {
          const isGreen = item._state === 'green';
          const isRed = item._state === 'red';
          const rowCls = isGreen
            ? 'border-emerald-300 bg-emerald-50/60 ring-1 ring-emerald-200'
            : isRed
              ? 'border-red-300 bg-red-50/60 ring-1 ring-red-200'
              : 'border-indigo-100 bg-indigo-50/30';
          const Icon = isGreen ? CheckCircle2 : isRed ? AlertTriangle : Clock;
          const iconCls = isGreen ? 'text-emerald-600' : isRed ? 'text-red-600' : 'text-indigo-500';
          return (
            <div
              key={item.id}
              className={`rounded-lg border p-3 transition-colors ${rowCls}`}
              data-testid={`action-item-${item.id}`}
            >
              <div className="flex items-start gap-2">
                <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconCls}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-snug flex-1 ${isRed ? 'text-red-900' : isGreen ? 'text-emerald-900' : 'text-slate-900'}`}>
                      {item.description}
                    </p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 flex-shrink-0">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(item.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center flex-wrap gap-2 mt-1 text-[11px] text-slate-500">
                    {item.status_date && (
                      <span>From daily status on {item.status_date}</span>
                    )}
                    {item._planned && (
                      <span className="font-medium">
                        · Planned for {item._planned}
                      </span>
                    )}
                    {item.created_by_name && (
                      <span>· {item.created_by_name}</span>
                    )}
                    {isGreen && item._workedActivity && (
                      <span className="text-emerald-700 font-medium">
                        · Worked on: {item._workedActivity.activity_type}
                        {item._workedActivity.interaction_method ? ` via ${String(item._workedActivity.interaction_method).replace('_', ' ')}` : ''}
                      </span>
                    )}
                    {isRed && (
                      <span className="text-red-700 font-medium">
                        · No activity recorded on planned day
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
