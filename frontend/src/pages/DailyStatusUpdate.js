import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { Calendar, Send, Loader2, Download, Phone, MapPin, Mail, MessageSquare, Activity, Copy, Check, Share2, Users, ChevronDown, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Helper function to convert text to bullet format
const convertToBulletFormat = (text) => {
  if (!text || !text.trim()) return '';
  const lines = text.split(/\n/).filter(line => line.trim());
  return lines.map(line => {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('[SUMMARY]') || trimmedLine.startsWith('[HEADER]')) return trimmedLine;
    if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) return trimmedLine;
    if (trimmedLine.startsWith('📊') || trimmedLine.startsWith('📌')) return trimmedLine;
    return `• ${trimmedLine}`;
  }).join('\n');
};

// Compact status input section
const StatusInput = ({ title, value, onChange, placeholder, disabled, icon: Icon }) => (
  <div className={`space-y-2 ${disabled ? 'opacity-50' : ''}`}>
    <div className="flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      <label className="text-sm font-medium text-muted-foreground">{title}</label>
    </div>
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={4}
      disabled={disabled}
      className="text-sm resize-none bg-slate-50/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 focus:border-primary/50 transition-colors"
    />
  </div>
);

// Bulleted content display for past statuses
const BulletedContent = ({ text }) => {
  if (!text) return null;
  const lines = text.split('\n').filter(line => line.trim());
  return (
    <div className="space-y-1">
      {lines.map((line, index) => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('[SUMMARY]') || trimmedLine.startsWith('📊')) {
          const summaryText = trimmedLine.replace('[SUMMARY]', '').replace('📊 SUMMARY:', '').trim();
          return (
            <div key={index} className="bg-primary/10 rounded px-2 py-1 mb-2">
              <span className="font-medium text-primary text-xs">{summaryText}</span>
            </div>
          );
        }
        if (trimmedLine.startsWith('[HEADER]') || trimmedLine.startsWith('📌')) {
          const headerText = trimmedLine.replace('[HEADER]', '').replace('📌', '').trim();
          return (
            <div key={index} className="font-medium text-xs text-primary uppercase mt-2 mb-1">{headerText}</div>
          );
        }
        const cleanLine = trimmedLine.replace(/^[•\-\*]\s*/, '').trim();
        return (
          <div key={index} className="flex items-start gap-1.5 text-xs">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span className="leading-relaxed">{cleanLine}</span>
          </div>
        );
      })}
    </div>
  );
};

export default function DailyStatusUpdate() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [fetchingActivities, setFetchingActivities] = useState(false);
  const [pastStatuses, setPastStatuses] = useState([]);
  
  // Resource selection state
  const [subordinates, setSubordinates] = useState([]);
  const [selectedResource, setSelectedResource] = useState('');
  const [loadingSubordinates, setLoadingSubordinates] = useState(false);
  
  const isViewingOwnStatus = !selectedResource || selectedResource === user?.id;
  const viewingUserId = selectedResource || user?.id;
  const selectedSubordinate = subordinates.find(s => s.id === selectedResource);
  
  // Form state
  const [yesterdayUpdates, setYesterdayUpdates] = useState('');
  const [todayActions, setTodayActions] = useState('');
  const [helpNeeded, setHelpNeeded] = useState('');

  // Fetch subordinates
  const fetchSubordinates = useCallback(async () => {
    if (!user?.id) return;
    setLoadingSubordinates(true);
    try {
      const response = await axios.get(`${API_URL}/users/subordinates/all`, { withCredentials: true });
      setSubordinates(response.data || []);
    } catch (error) {
      console.error('Failed to fetch subordinates:', error);
      setSubordinates([]);
    } finally {
      setLoadingSubordinates(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) fetchSubordinates();
  }, [user?.id, fetchSubordinates]);

  useEffect(() => {
    fetchPastStatuses();
  }, [selectedResource]);

  useEffect(() => {
    loadExistingStatus();
  }, [selectedDate, pastStatuses, selectedResource]);

  const fetchPastStatuses = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedResource) params.append('user_id', selectedResource);
      const response = await axios.get(`${API_URL}/daily-status?${params.toString()}`, { withCredentials: true });
      setPastStatuses(response.data);
    } catch (error) {
      console.error('Failed to load past statuses');
    }
  };

  const loadExistingStatus = useCallback(() => {
    const existing = pastStatuses.find(s => s.status_date === selectedDate);
    if (existing) {
      setYesterdayUpdates(existing.yesterday_updates || '');
      setTodayActions(existing.today_actions || '');
      setHelpNeeded(existing.help_needed || '');
    } else {
      setYesterdayUpdates('');
      setTodayActions('');
      setHelpNeeded('');
    }
  }, [selectedDate, pastStatuses]);

  const handleFetchFromActivities = async () => {
    setFetchingActivities(true);
    try {
      const params = new URLSearchParams();
      if (!isViewingOwnStatus && selectedResource) {
        params.append('target_user_id', selectedResource);
      }
      const response = await axios.get(
        `${API_URL}/daily-status/auto-populate/${selectedDate}?${params.toString()}`,
        { withCredentials: true }
      );
      
      if (response.data.activity_count === 0) {
        toast.info(`No activities found for ${isViewingOwnStatus ? 'you' : selectedSubordinate?.name} on this date`);
        return;
      }
      
      if (response.data.formatted_text) {
        setYesterdayUpdates(convertToBulletFormat(response.data.formatted_text));
        toast.success(`Loaded ${response.data.activity_count} activities from ${response.data.leads_contacted} leads`);
      }
    } catch (error) {
      toast.error('Failed to fetch activities');
    } finally {
      setFetchingActivities(false);
    }
  };

  const handleSubmit = async () => {
    if (!yesterdayUpdates.trim() && !todayActions.trim() && !helpNeeded.trim()) {
      toast.error('Please fill at least one section');
      return;
    }

    setLoading(true);
    try {
      const existing = pastStatuses.find(s => s.status_date === selectedDate);
      const data = {
        status_date: selectedDate,
        yesterday_updates: convertToBulletFormat(yesterdayUpdates),
        today_actions: convertToBulletFormat(todayActions),
        help_needed: convertToBulletFormat(helpNeeded)
      };
      
      if (!isViewingOwnStatus && selectedResource) {
        data.target_user_id = selectedResource;
      }

      if (existing) {
        await axios.put(`${API_URL}/daily-status/${existing.id}`, data, { withCredentials: true });
        toast.success(isViewingOwnStatus ? 'Status updated!' : `Status updated for ${selectedSubordinate?.name}!`);
      } else {
        await axios.post(`${API_URL}/daily-status`, data, { withCredentials: true });
        toast.success(isViewingOwnStatus ? 'Status posted!' : `Status posted for ${selectedSubordinate?.name}!`);
      }
      
      fetchPastStatuses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save status');
    } finally {
      setLoading(false);
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
  const isToday = selectedDate === today;
  const isYesterday = selectedDate === yesterday;
  const isPastDate = selectedDate < yesterday;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="daily-status-page">
      <div className="max-w-5xl mx-auto px-4 py-6">
        
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Daily Status Update</h1>
          <p className="text-sm text-muted-foreground mt-1">Track and manage daily sales activities</p>
        </div>

        {/* Main Control Bar - Date, Resource, Actions */}
        <Card className="p-4 mb-6 border-0 shadow-sm bg-white/80 dark:bg-slate-900/80 backdrop-blur">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            
            {/* Date Selection */}
            <div className="flex items-center gap-2 flex-1">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={selectedDate === yesterday ? 'default' : 'outline'}
                  onClick={() => setSelectedDate(yesterday)}
                  className="h-8 text-xs"
                  data-testid="date-yesterday"
                >
                  Yesterday
                </Button>
                <Button
                  size="sm"
                  variant={selectedDate === today ? 'default' : 'outline'}
                  onClick={() => setSelectedDate(today)}
                  className="h-8 text-xs"
                  data-testid="date-today"
                >
                  Today
                </Button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  max={today}
                  className="h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-transparent"
                  data-testid="date-picker"
                />
              </div>
            </div>

            {/* Resource Selector */}
            {subordinates.length > 0 && (
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select 
                  value={selectedResource || 'self'} 
                  onValueChange={(val) => {
                    setSelectedResource(val === 'self' ? '' : val);
                    setYesterdayUpdates('');
                    setTodayActions('');
                    setHelpNeeded('');
                  }}
                >
                  <SelectTrigger className="h-8 text-xs flex-1" data-testid="resource-selector">
                    <SelectValue placeholder="Select resource" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">
                      <span className="font-medium">Myself</span>
                    </SelectItem>
                    {subordinates.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{sub.name}</span>
                          <span className="text-xs text-muted-foreground">({sub.role})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleFetchFromActivities}
                disabled={fetchingActivities}
                className="h-8 text-xs"
                data-testid="fetch-activities-button"
              >
                {fetchingActivities ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-3 w-3 mr-1.5" />
                )}
                Fetch Activities
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={loading}
                className="h-8 text-xs bg-primary hover:bg-primary/90"
                data-testid="submit-status-button"
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                ) : (
                  <Send className="h-3 w-3 mr-1.5" />
                )}
                {isViewingOwnStatus ? 'Post Status' : `Post for ${selectedSubordinate?.name?.split(' ')[0]}`}
              </Button>
            </div>
          </div>

          {/* Status Indicator */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="font-medium text-primary">
                {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
              </span>
              {!isViewingOwnStatus && selectedSubordinate && (
                <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Managing {selectedSubordinate.name}'s status
                </span>
              )}
            </div>
            {pastStatuses.find(s => s.status_date === selectedDate) && (
              <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check className="h-3 w-3" />
                Status exists for this date
              </span>
            )}
          </div>
        </Card>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Updates Section */}
          <Card className="p-4 border-0 shadow-sm bg-white/80 dark:bg-slate-900/80">
            <StatusInput
              title={isToday ? "Today's Updates" : isYesterday ? "Yesterday's Updates" : `${format(new Date(selectedDate), 'MMM d')} Updates`}
              value={yesterdayUpdates}
              onChange={setYesterdayUpdates}
              placeholder="What was accomplished? One item per line..."
              icon={Activity}
            />
          </Card>

          {/* Action Items Section */}
          <Card className={`p-4 border-0 shadow-sm bg-white/80 dark:bg-slate-900/80 ${isPastDate ? 'opacity-60' : ''}`}>
            <StatusInput
              title={isToday ? "Tomorrow's Action Items" : "Today's Action Items"}
              value={todayActions}
              onChange={setTodayActions}
              placeholder="Planned follow-ups and tasks..."
              disabled={isPastDate}
              icon={Clock}
            />
          </Card>

          {/* Help Needed Section */}
          <Card className="p-4 border-0 shadow-sm bg-white/80 dark:bg-slate-900/80">
            <StatusInput
              title="Help Needed"
              value={helpNeeded}
              onChange={setHelpNeeded}
              placeholder="Support needed from the team..."
              icon={Users}
            />
          </Card>
        </div>

        {/* Recent Updates - Compact Timeline */}
        {pastStatuses.length > 0 && (
          <Card className="p-4 border-0 shadow-sm bg-white/80 dark:bg-slate-900/80">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Updates
            </h3>
            <div className="space-y-3">
              {pastStatuses.slice(0, 5).map((status) => (
                <div 
                  key={status.id} 
                  className="p-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                  onClick={() => setSelectedDate(status.status_date)}
                  data-testid={`past-status-${status.id}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{format(new Date(status.status_date), 'EEEE, MMM d')}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(status.created_at), 'h:mm a')}
                        </span>
                        {status.posted_by_name && (
                          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            • Posted by {status.posted_by_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90" />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {status.yesterday_updates && (
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Updates</p>
                        <BulletedContent text={status.yesterday_updates} />
                      </div>
                    )}
                    {status.today_actions && (
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Action Items</p>
                        <BulletedContent text={status.today_actions} />
                      </div>
                    )}
                    {status.help_needed && (
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Help Needed</p>
                        <BulletedContent text={status.help_needed} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
