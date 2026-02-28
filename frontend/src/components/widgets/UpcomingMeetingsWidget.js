import React from 'react';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Calendar, Clock, Plus, Video } from 'lucide-react';

const formatMeetingDate = (dateStr) => {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE, MMM d');
};

export function UpcomingMeetingsWidget({ upcomingMeetings, onNewMeeting }) {
  return (
    <Card className="p-0 overflow-hidden border-0 shadow-lg bg-gradient-to-br from-[#2D8CFF] to-[#0B5CFF]">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold flex items-center gap-2 text-white">
            <Video className="h-5 w-5" />
            Upcoming Meetings
          </h2>
          <div className="h-6 w-6 rounded bg-white/20 flex items-center justify-center">
            <span className="text-white text-xs font-bold">{upcomingMeetings?.length || 0}</span>
          </div>
        </div>
        
        {upcomingMeetings?.length > 0 ? (
          <div className="space-y-2">
            {upcomingMeetings.slice(0, 3).map(meeting => (
              <div key={meeting.id} className="p-3 bg-white/10 backdrop-blur rounded-lg border border-white/20 hover:bg-white/20 transition-colors cursor-pointer">
                <p className="font-medium text-sm text-white truncate">{meeting.title}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-white/80">
                  <Calendar className="h-3 w-3" />
                  <span>{formatMeetingDate(meeting.meeting_date)}</span>
                  <span>•</span>
                  <Clock className="h-3 w-3" />
                  <span>{meeting.start_time}</span>
                </div>
                {meeting.location && (
                  <p className="text-xs text-white/60 mt-1 truncate">{meeting.location}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4">
            <Video className="h-8 w-8 text-white/40 mx-auto mb-2" />
            <p className="text-white/70 text-sm">No meetings scheduled</p>
          </div>
        )}
      </div>
      <div className="px-4 py-2 bg-black/10 border-t border-white/10">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-white hover:text-white hover:bg-white/10 text-xs"
          onClick={onNewMeeting}
        >
          <Plus className="h-3 w-3 mr-1" /> Schedule New Meeting
        </Button>
      </div>
    </Card>
  );
}
