import React, { useState } from 'react';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Calendar, Clock, Plus, Video, ExternalLink, MoreVertical, Eye, Edit, Trash2, Users } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const formatMeetingDate = (dateStr) => {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
};

export function UpcomingMeetingsWidget({ upcomingMeetings, onNewMeeting, onViewMeeting, onEditMeeting, onCancelMeeting }) {
  const handleJoinMeeting = (e, meetingLink) => {
    e.stopPropagation();
    if (meetingLink) {
      window.open(meetingLink, '_blank');
    }
  };

  return (
    <Card className="p-0 overflow-hidden shadow-md">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2 text-foreground">
            <Video className="h-5 w-5 text-blue-600" />
            Upcoming Meetings
          </h2>
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            {upcomingMeetings?.length || 0}
          </Badge>
        </div>
      </div>
      
      {/* Meetings List */}
      <div className="p-3">
        {upcomingMeetings?.length > 0 ? (
          <div className="space-y-2">
            {upcomingMeetings.slice(0, 4).map(meeting => (
              <div 
                key={meeting.id} 
                className="p-3 bg-card border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                onClick={() => onViewMeeting?.(meeting)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{meeting.title}</p>
                      {meeting.meeting_link && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-600 bg-blue-50">
                          <Video className="h-2.5 w-2.5 mr-1" />
                          Zoom
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatMeetingDate(meeting.meeting_date)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {meeting.start_time}
                      </span>
                      {meeting.attendees?.length > 0 && (
                        <span className="flex items-center gap-1">
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
                        variant="default"
                        className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700"
                        onClick={(e) => handleJoinMeeting(e, meeting.meeting_link)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Join
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
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <Video className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No upcoming meetings</p>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="px-3 py-2 border-t bg-muted/30">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground hover:text-foreground"
          onClick={onNewMeeting}
        >
          <Plus className="h-3 w-3 mr-1" /> Schedule New Meeting
        </Button>
      </div>
    </Card>
  );
}
