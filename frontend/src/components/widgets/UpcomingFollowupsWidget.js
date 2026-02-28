import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CalendarDays, Building2, ChevronRight } from 'lucide-react';

const formatMeetingDate = (dateStr) => {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
};

export function UpcomingFollowupsWidget({ upcomingLeads }) {
  const navigate = useNavigate();

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          Upcoming Follow-ups
        </h2>
        <Button variant="ghost" size="sm" onClick={() => navigate('/leads')}>
          View all <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      
      {upcomingLeads?.length > 0 ? (
        <div className="space-y-2">
          {upcomingLeads.map(item => (
            <div
              key={item.id}
              onClick={() => navigate(item.type === 'account' ? `/accounts/${item.id}` : `/leads/${item.id}`)}
              className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <Building2 className={`h-5 w-5 flex-shrink-0 ${item.type === 'account' ? 'text-green-600' : 'text-muted-foreground'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{item.type === 'account' ? item.account_name : item.company}</p>
                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${item.type === 'account' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {item.type === 'account' ? 'Account' : 'Lead'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.type === 'account' ? item.contact_name : item.contact_person}</p>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="text-xs">
                  {formatMeetingDate(item.next_follow_up)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-4">No upcoming follow-ups this week</p>
      )}
    </Card>
  );
}
