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

  const totalDays = activitiesWithGaps.length > 0
    ? differenceInDays(
        new Date(activitiesWithGaps[0].created_at),
        new Date(activitiesWithGaps[activitiesWithGaps.length - 1].created_at)
      )
    : 0;

  const avgDays = activitiesWithGaps.length > 1
    ? Math.round(totalDays / (activitiesWithGaps.length - 1))
    : 0;

  return (
    <div className="space-y-6">
      {/* Timeline Visualization */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-12 top-0 bottom-0 w-0.5 bg-border" />
        
        {activitiesWithGaps.map((activity, index) => (
          <div key={activity.id} className="relative pl-24 pb-10 last:pb-0">
            {/* Timeline dot */}
            <div className="absolute left-10.5 top-1.5 w-4 h-4 rounded-full bg-primary border-4 border-white shadow-md z-10" />
            
            {/* Gap display on the left line - ALWAYS SHOW IF NOT LAST */}
            {activity.gapText && index < activitiesWithGaps.length - 1 && (
              <div className="absolute left-1 top-14 bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow-md whitespace-nowrap">
                ↑ {activity.gapText}
              </div>
            )}
            
            {/* Latest/First marker */}
            {index === 0 && (
              <div className="absolute left-0 top-0 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">
                LATEST
              </div>
            )}
            {index === activitiesWithGaps.length - 1 && (
              <div className="absolute left-0 top-0 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
                FIRST
              </div>
            )}
            
            {/* Activity content */}
            <div className="bg-white border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                  activity.activity_type === 'call' ? 'bg-blue-100 text-blue-800' :
                  activity.activity_type === 'email' ? 'bg-purple-100 text-purple-800' :
                  activity.activity_type === 'meeting' ? 'bg-green-100 text-green-800' :
                  activity.activity_type === 'status_change' ? 'bg-orange-100 text-orange-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {activity.activity_type.replace('_', ' ').toUpperCase()}
                </span>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(activity.created_at), 'MMM d, yyyy')}
                  </div>
                  <p className="text-sm font-medium text-primary mt-1">
                    {format(new Date(activity.created_at), 'h:mm a')}
                  </p>
                </div>
              </div>
              
              <p className="text-sm font-medium">{activity.description}</p>
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
              <p className="text-2xl font-bold text-primary">{totalDays}</p>
              <p className="text-xs text-muted-foreground">Days Since First Contact</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">{avgDays}</p>
              <p className="text-xs text-muted-foreground">Avg Days Between Contacts</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
