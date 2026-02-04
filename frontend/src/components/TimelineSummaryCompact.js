import React from 'react';
import { differenceInDays } from 'date-fns';
import { format } from 'date-fns';

export default function TimelineSummaryCompact({ activities }) {
  if (!activities || activities.length === 0) {
    return null;
  }

  const sortedActivities = [...activities].sort((a, b) => 
    new Date(b.created_at) - new Date(a.created_at)
  );

  const daysSinceLastContact = differenceInDays(
    new Date(),
    new Date(sortedActivities[0].created_at)
  );

  const daysSinceFirstContact = sortedActivities.length > 0
    ? differenceInDays(
        new Date(),
        new Date(sortedActivities[sortedActivities.length - 1].created_at)
      )
    : 0;

  const lastContactedDate = new Date(sortedActivities[0].created_at);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Activity Summary</h3>
      <div className="grid grid-cols-4 gap-6">
        <div>
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Total Follow ups</p>
          <p className="text-xl font-bold text-primary">{sortedActivities.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Days Since Last</p>
          <p className="text-xl font-bold text-primary">{daysSinceLastContact}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Last Contacted</p>
          <p className="text-base font-bold text-foreground">{format(lastContactedDate, 'MMM d, yyyy')}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Days Since First</p>
          <p className="text-xl font-bold text-primary">{daysSinceFirstContact}</p>
        </div>
      </div>
    </div>
  );
}
