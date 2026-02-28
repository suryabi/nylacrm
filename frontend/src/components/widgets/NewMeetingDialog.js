import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Loader2, Video, X, Plus, Users, Mail } from 'lucide-react';
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
  saving,
  users = [],
  editMode = false
}) {
  const [externalEmail, setExternalEmail] = useState('');
  
  // Parse internal and external attendees
  const internalAttendees = newMeeting.internal_attendees || [];
  const externalAttendees = newMeeting.external_attendees || [];

  const addInternalAttendee = (userId) => {
    if (!userId || internalAttendees.includes(userId)) return;
    setNewMeeting({
      ...newMeeting,
      internal_attendees: [...internalAttendees, userId]
    });
  };

  const removeInternalAttendee = (userId) => {
    setNewMeeting({
      ...newMeeting,
      internal_attendees: internalAttendees.filter(id => id !== userId)
    });
  };

  const addExternalAttendee = () => {
    const email = externalEmail.trim().toLowerCase();
    if (!email || !email.includes('@') || externalAttendees.includes(email)) return;
    setNewMeeting({
      ...newMeeting,
      external_attendees: [...externalAttendees, email]
    });
    setExternalEmail('');
  };

  const handleExternalKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addExternalAttendee();
    }
  };

  const removeExternalAttendee = (email) => {
    setNewMeeting({
      ...newMeeting,
      external_attendees: externalAttendees.filter(e => e !== email)
    });
  };

  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user?.name || userId;
  };

  const getUserEmail = (userId) => {
    const user = users.find(u => u.id === userId);
    return user?.email || '';
  };

  const availableUsers = users.filter(u => !internalAttendees.includes(u.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editMode ? 'Reschedule Meeting' : 'Schedule Meeting'}</DialogTitle>
          <DialogDescription>
            {editMode ? 'Update meeting details' : 'Create a new meeting entry'}
          </DialogDescription>
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
              <p className="text-xs text-muted-foreground">Automatically generate a Zoom link</p>
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
                placeholder="Office, meeting room, or video link"
              />
            </div>
          )}
          
          {/* Internal Attendees */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Internal Attendees
            </Label>
            <Select onValueChange={addInternalAttendee} value="">
              <SelectTrigger>
                <SelectValue placeholder="Add team member..." />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {internalAttendees.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {internalAttendees.map(userId => (
                  <Badge key={userId} variant="secondary" className="pl-2 pr-1 py-1">
                    {getUserName(userId)}
                    <button
                      onClick={() => removeInternalAttendee(userId)}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          
          {/* External Attendees */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              External Attendees
            </Label>
            <div className="flex gap-2">
              <Input
                value={externalEmail}
                onChange={(e) => setExternalEmail(e.target.value)}
                onKeyDown={handleExternalKeyDown}
                placeholder="Enter email and press Enter"
                type="email"
              />
              <Button type="button" variant="outline" size="icon" onClick={addExternalAttendee}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {externalAttendees.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {externalAttendees.map(email => (
                  <Badge key={email} variant="outline" className="pl-2 pr-1 py-1">
                    {email}
                    <button
                      onClick={() => removeExternalAttendee(email)}
                      className="ml-1 hover:bg-muted rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Press Enter or comma to add email</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {editMode ? 'Update Meeting' : (newMeeting.create_zoom_meeting ? 'Create with Zoom' : 'Schedule Meeting')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
