import React from 'react';
import { Card } from '../ui/card';
import { Activity, Circle } from 'lucide-react';

export function RecentActivityWidget({ recentActivities }) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-primary" />
        Recent Activity
      </h2>
      {recentActivities?.length > 0 ? (
        <div className="space-y-3">
          {recentActivities.slice(0, 5).map(activity => (
            <div key={activity.id} className="flex items-start gap-2 text-sm">
              <Circle className="h-2 w-2 mt-1.5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="truncate">
                  <span className="font-medium">{activity.activity_type}</span>
                  {activity.company && <span className="text-muted-foreground"> - {activity.company}</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-4 text-sm">No recent activity</p>
      )}
    </Card>
  );
}
