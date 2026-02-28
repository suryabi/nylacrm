import React from 'react';
import { Card } from '../ui/card';
import { Activity, Phone, Mail, Users, FileText, Clock } from 'lucide-react';

const ACTIVITY_ICONS = {
  call: Phone,
  email: Mail,
  meeting: Users,
  note: FileText,
  default: Activity
};

const ACTIVITY_COLORS = {
  call: 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30',
  email: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30',
  meeting: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30',
  note: 'text-amber-500 bg-amber-100 dark:bg-amber-900/30',
  default: 'text-slate-500 bg-slate-100 dark:bg-slate-800'
};

export function RecentActivityWidget({ recentActivities }) {
  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
      {/* Header */}
      <div className="p-5 pb-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/50 dark:to-purple-900/30">
            <Activity className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          Recent Activity
        </h2>
      </div>
      
      {/* Activity List */}
      <div className="px-5 pb-5">
        {recentActivities?.length > 0 ? (
          <div className="space-y-3">
            {recentActivities.slice(0, 4).map((activity, idx) => {
              const activityType = activity.activity_type?.toLowerCase() || 'default';
              const Icon = ACTIVITY_ICONS[activityType] || ACTIVITY_ICONS.default;
              const colorClass = ACTIVITY_COLORS[activityType] || ACTIVITY_COLORS.default;
              
              return (
                <div key={activity.id || idx} className="flex items-start gap-3 group">
                  <div className={`p-1.5 rounded-lg ${colorClass} shrink-0`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">
                      <span className="font-medium capitalize">{activity.activity_type}</span>
                      {activity.company && (
                        <span className="text-muted-foreground"> with {activity.company}</span>
                      )}
                    </p>
                    {activity.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {activity.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Activity className="h-10 w-10 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No recent activity</p>
          </div>
        )}
      </div>
    </Card>
  );
}
