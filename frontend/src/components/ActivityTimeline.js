import React from 'react';
import { format, differenceInDays } from 'date-fns';
import { Calendar } from 'lucide-react';

export default function ActivityTimeline({ activities }) {
  if (!activities || activities.length === 0) {
    return <p className="text-muted-foreground text-sm">No activities yet</p>;
  }

  // Sort activities by date (NEWEST FIRST for timeline)
  const sortedActivities = [...activities].sort((a, b) => 
    new Date(b.created_at) - new Date(a.created_at)
  );

  // Calculate days between activities (going backwards in time)
  const activitiesWithGaps = sortedActivities.map((activity, index) => {
    const daysToNext = index < sortedActivities.length - 1
      ? differenceInDays(new Date(activity.created_at), new Date(sortedActivities[index + 1].created_at))
      : 0;
    return {
      ...activity,
      daysToNext
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
            
            {/* Days gap display on the left line */}
            {activity.daysToNext > 0 && index < activitiesWithGaps.length - 1 && (
              <div className="absolute left-2 top-12 bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow-sm">
                {activity.daysToNext} {activity.daysToNext === 1 ? 'day' : 'days'}
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
              <div className="flex items-start justify-between mb-2">
                <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                  activity.activity_type === 'call' ? 'bg-blue-100 text-blue-800' :
                  activity.activity_type === 'email' ? 'bg-purple-100 text-purple-800' :
                  activity.activity_type === 'meeting' ? 'bg-green-100 text-green-800' :
                  activity.activity_type === 'status_change' ? 'bg-orange-100 text-orange-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {activity.activity_type.replace('_', ' ').toUpperCase()}
                </span>
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
