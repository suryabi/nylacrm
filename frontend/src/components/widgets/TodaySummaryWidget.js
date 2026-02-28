import React from 'react';
import { Card } from '../ui/card';
import { Activity, Phone, Mail, Users, TrendingUp } from 'lucide-react';

export function TodaySummaryWidget({ todaySummary }) {
  const stats = [
    {
      label: "Today's Activities",
      value: todaySummary?.total_activities || 0,
      icon: Activity,
      gradient: 'from-violet-500 to-purple-600',
      bgGradient: 'from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20',
      iconBg: 'bg-violet-100 dark:bg-violet-900/50',
      textColor: 'text-violet-700 dark:text-violet-300'
    },
    {
      label: 'Calls Made',
      value: todaySummary?.calls || 0,
      icon: Phone,
      gradient: 'from-emerald-500 to-teal-600',
      bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
      textColor: 'text-emerald-700 dark:text-emerald-300'
    },
    {
      label: 'Emails Sent',
      value: todaySummary?.emails || 0,
      icon: Mail,
      gradient: 'from-blue-500 to-indigo-600',
      bgGradient: 'from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20',
      iconBg: 'bg-blue-100 dark:bg-blue-900/50',
      textColor: 'text-blue-700 dark:text-blue-300'
    },
    {
      label: 'Meetings',
      value: todaySummary?.meetings || 0,
      icon: Users,
      gradient: 'from-amber-500 to-orange-600',
      bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20',
      iconBg: 'bg-amber-100 dark:bg-amber-900/50',
      textColor: 'text-amber-700 dark:text-amber-300'
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <Card 
            key={stat.label}
            className={`relative overflow-hidden border-0 bg-gradient-to-br ${stat.bgGradient} backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group`}
          >
            {/* Decorative gradient line */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient}`} />
            
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {stat.label}
                  </p>
                  <p className={`text-3xl font-bold ${stat.textColor} tabular-nums`}>
                    {stat.value}
                  </p>
                </div>
                <div className={`p-2.5 rounded-xl ${stat.iconBg} group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`h-5 w-5 ${stat.textColor}`} />
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
