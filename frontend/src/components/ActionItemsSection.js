import React from 'react';
import { format } from 'date-fns';
import { ListChecks, Calendar } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

/**
 * Renders all `action_item` activities for a lead as a dedicated section,
 * kept separate from the regular Activity Timeline so daily-status commitments
 * never get visually mixed up with calls/visits/emails/etc.
 *
 * Each item is sourced from the `activities` collection (activity_type = 'action_item'),
 * so the read model is identical to other activities — only the rendering differs.
 */
export default function ActionItemsSection({ actionItems }) {
  if (!actionItems || actionItems.length === 0) {
    return null;
  }

  const sorted = [...actionItems].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  return (
    <Card className="p-4 sm:p-6" data-testid="lead-action-items-section">
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <ListChecks className="h-5 w-5 text-indigo-600" />
        <h2 className="text-base sm:text-lg font-semibold">Action Items</h2>
        <Badge variant="outline" className="text-[11px] text-indigo-700 border-indigo-200 bg-indigo-50">
          {sorted.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {sorted.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-3"
            data-testid={`action-item-${item.id}`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm leading-snug text-slate-900 flex-1">
                {item.description}
              </p>
              <p className="text-[11px] text-slate-500 flex items-center gap-1 flex-shrink-0">
                <Calendar className="h-3 w-3" />
                {format(new Date(item.created_at), 'MMM d, yyyy')}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              {item.status_date && (
                <span>From daily status on {item.status_date}</span>
              )}
              {item.created_by_name && (
                <span>· {item.created_by_name}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
