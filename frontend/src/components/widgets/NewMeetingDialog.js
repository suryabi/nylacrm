import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Loader2, Video } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export function NewMeetingDialog({
  open,
  onOpenChange,
  newMeeting,
  setNewMeeting,
  onSave,
  saving
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Schedule Meeting</DialogTitle>
          <DialogDescription>Create a new meeting entry</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              value={newMeeting.title}
              onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
              placeholder="Meeting title"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={newMeeting.description}
              onChange={(e) => setNewMeeting({ ...newMeeting, description: e.target.value })}
              placeholder="Meeting agenda..."
              rows={2}
            />
          </div>
          
          {/* Zoom Integration Toggle */}
          <div 
            className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
              newMeeting.create_zoom_meeting 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-muted hover:border-blue-300'
            }`}
            onClick={() => setNewMeeting({ ...newMeeting, create_zoom_meeting: !newMeeting.create_zoom_meeting })}
          >
            <div className={`p-2 rounded-lg ${newMeeting.create_zoom_meeting ? 'bg-blue-500' : 'bg-muted'}`}>
              <Video className={`h-5 w-5 ${newMeeting.create_zoom_meeting ? 'text-white' : 'text-muted-foreground'}`} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Create Zoom Meeting</p>
              <p className="text-xs text-muted-foreground">Automatically generate a Zoom link for this meeting</p>
            </div>
            <div className={`w-10 h-6 rounded-full p-1 transition-colors ${
              newMeeting.create_zoom_meeting ? 'bg-blue-500' : 'bg-muted'
            }`}>
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                newMeeting.create_zoom_meeting ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newMeeting.meeting_type} onValueChange={(v) => setNewMeeting({ ...newMeeting, meeting_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client Meeting</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={newMeeting.duration_minutes.toString()} onValueChange={(v) => setNewMeeting({ ...newMeeting, duration_minutes: parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={newMeeting.meeting_date}
                onChange={(e) => setNewMeeting({ ...newMeeting, meeting_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Start Time *</Label>
              <Input
                type="time"
                value={newMeeting.start_time}
                onChange={(e) => setNewMeeting({ ...newMeeting, start_time: e.target.value })}
              />
            </div>
          </div>
          
          {/* Location field - hidden when Zoom is enabled */}
          {!newMeeting.create_zoom_meeting && (
            <div className="space-y-2">
              <Label>Location / Link</Label>
              <Input
                value={newMeeting.location}
                onChange={(e) => setNewMeeting({ ...newMeeting, location: e.target.value })}
                placeholder="Office, Zoom link, or address"
              />
            </div>
          )}
          
          <div className="space-y-2">
            <Label>Attendee Emails</Label>
            <Input
              value={newMeeting.attendees}
              onChange={(e) => setNewMeeting({ ...newMeeting, attendees: e.target.value })}
              placeholder="email1@example.com, email2@example.com"
            />
            <p className="text-xs text-muted-foreground">Separate multiple emails with commas</p>
          </div>
          <div className="space-y-2">
            <Label>Attendee Names</Label>
            <Input
              value={newMeeting.attendee_names}
              onChange={(e) => setNewMeeting({ ...newMeeting, attendee_names: e.target.value })}
              placeholder="John Doe, Jane Smith"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {newMeeting.create_zoom_meeting ? 'Create with Zoom' : 'Schedule Meeting'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
