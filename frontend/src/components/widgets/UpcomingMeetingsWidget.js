import React from 'react';
import { format, parseISO, isToday, isTomorrow, isValid } from 'date-fns';
import { Link } from 'react-router-dom';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Calendar, Clock, Plus, Video, ExternalLink, MoreVertical, Eye, Edit, Trash2, Users, CalendarDays, ArrowRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const formatMeetingDate = (dateStr) => {
  if (!dateStr) return { text: 'N/A', highlight: false };
  try {
    const date = parseISO(dateStr);
    if (!isValid(date)) return { text: 'N/A', highlight: false };
    if (isToday(date)) return { text: 'Today', highlight: true };
    if (isTomorrow(date)) return { text: 'Tomorrow', highlight: false };
    return { text: format(date, 'EEE, MMM d'), highlight: false };
  } catch (e) {
    return { text: 'N/A', highlight: false };
  }
};

export function UpcomingMeetingsWidget({ upcomingMeetings, onNewMeeting, onViewMeeting, onEditMeeting, onCancelMeeting }) {
  const handleJoinMeeting = (e, meetingLink) => {
    e.stopPropagation();
    if (meetingLink) {
      window.open(meetingLink, '_blank');
    }
  };

  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
      {/* Header */}
      <div className="p-4 sm:p-5 pb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/50 dark:to-indigo-900/30">
            <Video className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="hidden sm:inline">Upcoming</span> Meetings
        </h2>
        <div className="flex items-center gap-2">
          <Link
            to="/personal-calendar"
            className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 hover:underline"
            data-testid="open-personal-calendar"
          >
            <CalendarDays className="h-3.5 w-3.5" /> View Calendar <ArrowRight className="h-3 w-3" />
          </Link>
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 text-xs">
            {upcomingMeetings?.length || 0}
          </Badge>
        </div>
      </div>
      
      {/* Meetings List */}
      <div className="px-4 sm:px-5 pb-3">
        {upcomingMeetings?.length > 0 ? (
          <div className="space-y-2">
            {upcomingMeetings.slice(0, 4).map(meeting => {
              const dateInfo = formatMeetingDate(meeting.meeting_date);
              return (
                <div 
                  key={meeting.id} 
                  className="p-2.5 sm:p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200 cursor-pointer group"
                  onClick={() => onViewMeeting?.(meeting)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-xs sm:text-sm text-slate-800 dark:text-white truncate">{meeting.title}</p>
                        {meeting.meeting_link && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-200 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400 shrink-0 hidden sm:flex">
                            Zoom
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-1.5 text-[10px] sm:text-xs text-muted-foreground flex-wrap">
                        <span className={`flex items-center gap-1 ${dateInfo.highlight ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                          <Calendar className="h-3 w-3" />
                          {dateInfo.text}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {meeting.start_time}
                        </span>
                        {meeting.attendees?.length > 0 && (
                          <span className="flex items-center gap-1 hidden sm:flex">
                            <Users className="h-3 w-3" />
                            {meeting.attendees.length}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {meeting.meeting_link && (
                        <Button
                          size="sm"
                          className="h-6 sm:h-7 px-2 sm:px-2.5 text-[10px] sm:text-xs bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm border-0"
                          onClick={(e) => handleJoinMeeting(e, meeting.meeting_link)}
                        >
                          <ExternalLink className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline">Join</span>
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewMeeting?.(meeting); }}>
                            <Eye className="h-4 w-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEditMeeting?.(meeting); }}>
                            <Edit className="h-4 w-4 mr-2" /> Reschedule
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={(e) => { e.stopPropagation(); onCancelMeeting?.(meeting); }}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Cancel Meeting
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Video className="h-10 w-10 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No upcoming meetings</p>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="default"
          className="h-10 text-sm font-medium border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
          asChild
        >
          <Link to="/personal-calendar" data-testid="footer-open-calendar">
            <CalendarDays className="h-4 w-4 mr-2" /> Open Calendar
          </Link>
        </Button>
        <Button
          variant="outline"
          size="default"
          className="h-10 text-sm font-medium border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-800 dark:hover:text-blue-300 bg-white dark:bg-slate-900"
          onClick={onNewMeeting}
        >
          <Plus className="h-4 w-4 mr-2" /> Schedule
        </Button>
      </div>
    </Card>
  );
}
