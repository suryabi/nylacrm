import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CalendarDays, Building2, ChevronRight, User } from 'lucide-react';

const formatFollowupDate = (dateStr) => {
  const date = parseISO(dateStr);
  if (isToday(date)) return { text: 'Today', color: 'text-red-600 bg-red-50 dark:bg-red-900/20' };
  if (isTomorrow(date)) return { text: 'Tomorrow', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' };
  return { text: format(date, 'EEE, MMM d'), color: 'text-slate-600 bg-slate-100 dark:bg-slate-800' };
};

export function UpcomingFollowupsWidget({ upcomingLeads }) {
  const navigate = useNavigate();

  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
      {/* Header */}
      <div className="p-5 pb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/50 dark:to-amber-900/30">
            <CalendarDays className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
          Upcoming Follow-ups
        </h2>
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
          onClick={() => navigate('/leads')}
        >
          View all <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
      
      {/* Content */}
      <div className="px-5 pb-5">
        {upcomingLeads?.length > 0 ? (
          <div className="space-y-2">
            {upcomingLeads.slice(0, 4).map(item => {
              const dateInfo = formatFollowupDate(item.next_follow_up);
              return (
                <div
                  key={item.id}
                  onClick={() => navigate(item.type === 'account' ? `/accounts/${item.id}` : `/leads/${item.id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200 group"
                >
                  <div className={`p-2 rounded-lg ${item.type === 'account' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                    <Building2 className={`h-4 w-4 ${item.type === 'account' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800 dark:text-white truncate group-hover:text-primary transition-colors">
                      {item.type === 'account' ? item.account_name : item.company}
                    </p>
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {item.type === 'account' ? item.contact_name : item.contact_person}
                    </p>
                  </div>
                  <Badge variant="secondary" className={`text-xs shrink-0 ${dateInfo.color}`}>
                    {dateInfo.text}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <CalendarDays className="h-10 w-10 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No follow-ups this week</p>
          </div>
        )}
      </div>
    </Card>
  );
}
