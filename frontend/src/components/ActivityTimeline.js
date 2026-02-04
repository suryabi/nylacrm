import React from 'react';
import { format, differenceInDays } from 'date-fns';
import { Calendar, ArrowRight } from 'lucide-react';

export default function ActivityTimeline({ activities }) {
  if (!activities || activities.length === 0) {
    return <p className="text-muted-foreground text-sm">No activities yet</p>;
  }

  // Sort activities by date (oldest first for timeline)
  const sortedActivities = [...activities].sort((a, b) => 
    new Date(a.created_at) - new Date(b.created_at)
  );

  // Calculate days between activities
  const activitiesWithGaps = sortedActivities.map((activity, index) => {
    const daysSincePrevious = index > 0 
      ? differenceInDays(new Date(activity.created_at), new Date(sortedActivities[index - 1].created_at))
      : 0;
    return {
      ...activity,
      daysSincePrevious
    };
  });

  return (
    <div className="space-y-6">
      {/* Timeline Visualization */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
        
        {activitiesWithGaps.map((activity, index) => (
          <div key={activity.id} className="relative pl-12 pb-8 last:pb-0">
            {/* Timeline dot */}
            <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm" />
            
            {/* Days gap indicator */}
            {activity.daysSincePrevious > 0 && (
              <div className="absolute -left-2 -top-6 bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1">
                <ArrowRight className="h-3 w-3" />
                {activity.daysSincePrevious} {activity.daysSincePrevious === 1 ? 'day' : 'days'}
              </div>
            )}
            
            {/* Activity content */}
            <div className="bg-white border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                    activity.activity_type === 'call' ? 'bg-blue-100 text-blue-800' :
                    activity.activity_type === 'email' ? 'bg-purple-100 text-purple-800' :
                    activity.activity_type === 'meeting' ? 'bg-green-100 text-green-800' :
                    activity.activity_type === 'status_change' ? 'bg-orange-100 text-orange-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {activity.activity_type.replace('_', ' ').toUpperCase()}
                  </span>
                  {index === 0 && (
                    <span className="text-xs text-muted-foreground">(First Contact)</span>
                  )}
                  {index === activitiesWithGaps.length - 1 && (
                    <span className="text-xs text-primary font-medium">(Latest)</span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(activity.created_at), 'MMM d, yyyy')}
                </div>
              </div>
              
              <p className="text-sm font-medium mb-1">{activity.description}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(activity.created_at), 'h:mm a')}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      {activitiesWithGaps.length > 1 && (
        <div className="bg-muted/50 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-semibold mb-3">Timeline Summary</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">{activitiesWithGaps.length}</p>
              <p className="text-xs text-muted-foreground">Total Activities</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">
                {differenceInDays(
                  new Date(activitiesWithGaps[activitiesWithGaps.length - 1].created_at),
                  new Date(activitiesWithGaps[0].created_at)
                )}
              </p>
              <p className="text-xs text-muted-foreground">Days Since First Contact</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">
                {Math.round(
                  differenceInDays(
                    new Date(activitiesWithGaps[activitiesWithGaps.length - 1].created_at),
                    new Date(activitiesWithGaps[0].created_at)
                  ) / (activitiesWithGaps.length - 1)
                ) || 0}
              </p>
              <p className="text-xs text-muted-foreground">Avg Days Between Contacts</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
