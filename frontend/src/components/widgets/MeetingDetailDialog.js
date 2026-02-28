import React from 'react';
import { format, parseISO } from 'date-fns';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Calendar, Clock, MapPin, Users, Video, ExternalLink, Copy, 
  Mail, User, FileText, Building2
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { toast } from 'sonner';

export function MeetingDetailDialog({ open, onOpenChange, meeting, onEdit, onCancel }) {
  if (!meeting) return null;

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleJoin = () => {
    if (meeting.meeting_link) {
      window.open(meeting.meeting_link, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl">{meeting.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={meeting.status === 'cancelled' ? 'destructive' : 'secondary'}>
                  {meeting.status}
                </Badge>
                {meeting.meeting_link && (
                  <Badge variant="outline" className="border-blue-300 text-blue-600 bg-blue-50">
                    <Video className="h-3 w-3 mr-1" />
                    Zoom Meeting
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date & Time */}
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 flex-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{format(parseISO(meeting.meeting_date), 'EEEE, MMMM d, yyyy')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{meeting.start_time}</span>
              <span className="text-muted-foreground">({meeting.duration_minutes} min)</span>
            </div>
          </div>

          {/* Zoom Details */}
          {meeting.meeting_link && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium">
                  <Video className="h-4 w-4" />
                  Zoom Meeting
                </div>
                <Button size="sm" onClick={handleJoin} className="bg-blue-600 hover:bg-blue-700">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Join Meeting
                </Button>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Meeting ID:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{meeting.zoom_meeting_id}</span>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(meeting.zoom_meeting_id, 'Meeting ID')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {meeting.zoom_password && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Password:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{meeting.zoom_password}</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(meeting.zoom_password, 'Password')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Link:</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs"
                    onClick={() => copyToClipboard(meeting.meeting_link, 'Meeting link')}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Link
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Location (if no Zoom) */}
          {meeting.location && !meeting.meeting_link && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{meeting.location}</span>
            </div>
          )}

          {/* Description */}
          {meeting.description && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Description
              </div>
              <p className="text-sm text-muted-foreground pl-6">{meeting.description}</p>
            </div>
          )}

          {/* Organizer */}
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Organized by:</span>
            <span className="font-medium">{meeting.organizer_name}</span>
          </div>

          {/* Attendees */}
          {(meeting.attendees?.length > 0 || meeting.attendee_names?.length > 0) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-muted-foreground" />
                Attendees ({meeting.attendees?.length || meeting.attendee_names?.length || 0})
              </div>
              <div className="pl-6 flex flex-wrap gap-2">
                {meeting.attendee_names?.map((name, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {name}
                    {meeting.attendees?.[idx] && (
                      <span className="ml-1 text-muted-foreground">({meeting.attendees[idx]})</span>
                    )}
                  </Badge>
                ))}
                {!meeting.attendee_names?.length && meeting.attendees?.map((email, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    <Mail className="h-3 w-3 mr-1" />
                    {email}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Related Lead/Account */}
          {(meeting.lead_id || meeting.account_id) && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Related to:</span>
              <Badge variant="outline">{meeting.lead_id ? 'Lead' : 'Account'}</Badge>
            </div>
          )}
        </div>

        {/* Actions */}
        {meeting.status !== 'cancelled' && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => { onOpenChange(false); onCancel?.(meeting); }}>
              Cancel Meeting
            </Button>
            <Button onClick={() => { onOpenChange(false); onEdit?.(meeting); }}>
              Reschedule
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
