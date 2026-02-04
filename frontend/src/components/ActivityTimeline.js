import React from 'react';
import { format, differenceInDays, differenceInHours, differenceInMinutes } from 'date-fns';
import { Calendar } from 'lucide-react';

export default function ActivityTimeline({ activities }) {
  if (!activities || activities.length === 0) {
    return <p className="text-muted-foreground text-sm">No activities yet</p>;
  }

  // Sort activities by date (NEWEST FIRST for timeline)
  const sortedActivities = [...activities].sort((a, b) => 
    new Date(b.created_at) - new Date(a.created_at)
  );

  // Calculate time gaps between activities
  const activitiesWithGaps = sortedActivities.map((activity, index) => {
    if (index >= sortedActivities.length - 1) {
      return { ...activity, gapText: null };
    }
    
    const currentDate = new Date(activity.created_at);
    const nextDate = new Date(sortedActivities[index + 1].created_at);
    const days = differenceInDays(currentDate, nextDate);
    const hours = differenceInHours(currentDate, nextDate);
    const minutes = differenceInMinutes(currentDate, nextDate);
    
    let gapText = '';
    if (days > 0) {
      gapText = `${days} ${days === 1 ? 'day' : 'days'}`;
    } else if (hours > 0) {
      gapText = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    } else if (minutes > 0) {
      gapText = `${minutes} ${minutes === 1 ? 'min' : 'mins'}`;
    } else {
      gapText = '< 1 min';
    }
    
    return {
      ...activity,
      gapText,
      gapDays: days
    };
  });

  const daysSinceLastContact = activitiesWithGaps.length > 0
    ? differenceInDays(
        new Date(),
        new Date(activitiesWithGaps[0].created_at)
      )
    : 0;

  const daysSinceFirstContact = activitiesWithGaps.length > 0
    ? differenceInDays(
        new Date(),
        new Date(activitiesWithGaps[activitiesWithGaps.length - 1].created_at)
      )
    : 0;

  const lastContactedDate = activitiesWithGaps.length > 0
    ? new Date(activitiesWithGaps[0].created_at)
    : null;

  return (
    <div className="space-y-6">
      {/* Summary Stats - 4 Individual Cards */}
      {activitiesWithGaps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-4 text-foreground">Timeline Summary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Follow ups */}
            <div className="bg-white border border-border rounded-lg p-5 hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground font-medium mb-3 uppercase tracking-wide">Total Follow ups</p>
              <p className="text-4xl font-bold text-primary">{activitiesWithGaps.length}</p>
            </div>
            
            {/* Days Since Last Contact */}
            <div className="bg-white border border-border rounded-lg p-5 hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground font-medium mb-3 uppercase tracking-wide">Days Since Last Contact</p>
              <p className="text-4xl font-bold text-primary">{daysSinceLastContact}</p>
            </div>
            
            {/* Last Contacted Date */}
            <div className="bg-white border border-border rounded-lg p-5 hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground font-medium mb-3 uppercase tracking-wide">Last Contacted Date</p>
              <p className="text-2xl font-bold text-foreground leading-tight">
                {format(lastContactedDate, 'MMM d, yyyy')}
              </p>
            </div>
            
            {/* Days Since First Contact */}
            <div className="bg-white border border-border rounded-lg p-5 hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground font-medium mb-3 uppercase tracking-wide">Days Since First Contact</p>
              <p className="text-4xl font-bold text-primary">{daysSinceFirstContact}</p>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Visualization */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-12 top-0 bottom-0 w-0.5 bg-border" />
        
        {activitiesWithGaps.map((activity, index) => (
          <div key={activity.id} className="relative pl-24 pb-6 last:pb-0">
            {/* Timeline dot */}
            <div className="absolute left-10.5 top-1 w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm z-10" />
            
            {/* Gap display on the left line - Subtle gray badge */}
            {activity.gapText && index < activitiesWithGaps.length - 1 && (
              <div className="absolute left-0 top-10 bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-1 rounded border border-gray-200">
                ↑ {activity.gapText}
              </div>
            )}
            
            {/* Latest/First marker */}
            {index === 0 && (
              <div className="absolute left-0 -top-1 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                LATEST
              </div>
            )}
            {index === activitiesWithGaps.length - 1 && (
              <div className="absolute left-0 -top-1 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                FIRST
              </div>
            )}
            
            {/* Activity content - Compact */}
            <div className="bg-white border border-border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Only show activity type for status changes */}
                  {activity.activity_type === 'status_change' && (
                    <span className="px-2 py-0.5 text-xs rounded font-medium bg-orange-100 text-orange-800">
                      STATUS CHANGE
                    </span>
                  )}
                  {/* Show interaction method subtly - small gray text */}
                  {activity.interaction_method && activity.activity_type !== 'status_change' && (
                    <span className="text-xs text-muted-foreground">
                      via {activity.interaction_method.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1 justify-end">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(activity.created_at), 'MMM d, yyyy')}
                  </p>
                  <p className="text-xs font-medium text-primary mt-0.5">
                    {format(new Date(activity.created_at), 'h:mm a')}
                  </p>
                </div>
              </div>
              
              <p className="text-sm leading-relaxed">{activity.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
