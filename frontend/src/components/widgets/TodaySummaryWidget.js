import React from 'react';
import { Card } from '../ui/card';
import { Activity, Phone, Mail, Users } from 'lucide-react';

export function TodaySummaryWidget({ todaySummary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-700/50">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-medium text-blue-600">TODAY'S ACTIVITIES</span>
        </div>
        <p className="text-2xl font-bold text-blue-700">{todaySummary?.total_activities || 0}</p>
      </Card>
      <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-700/50">
        <div className="flex items-center gap-2 mb-2">
          <Phone className="h-4 w-4 text-green-600" />
          <span className="text-xs font-medium text-green-600">CALLS</span>
        </div>
        <p className="text-2xl font-bold text-green-700">{todaySummary?.calls || 0}</p>
      </Card>
      <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-700/50">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="h-4 w-4 text-purple-600" />
          <span className="text-xs font-medium text-purple-600">EMAILS</span>
        </div>
        <p className="text-2xl font-bold text-purple-700">{todaySummary?.emails || 0}</p>
      </Card>
      <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/20 border-orange-200 dark:border-orange-700/50">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-orange-600" />
          <span className="text-xs font-medium text-orange-600">MEETINGS</span>
        </div>
        <p className="text-2xl font-bold text-orange-700">{todaySummary?.meetings || 0}</p>
      </Card>
    </div>
  );
}
