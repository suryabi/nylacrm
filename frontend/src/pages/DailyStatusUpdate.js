import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { Calendar, Send, Loader2, Download } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Simple status section without AI revision
const StatusSection = ({ title, value, onChange, placeholder, disabled }) => {
  return (
    <Card className={`p-5 ${disabled ? 'bg-muted/30' : ''}`}>
      <label className="block text-sm font-semibold mb-3">{title}</label>
      {disabled ? (
        <p className="text-sm text-muted-foreground italic">Action items not available for past dates</p>
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={6}
          className="text-base resize-none"
        />
      )}
    </Card>
  );
};

// Helper function to convert text to bullet format
const convertToBulletFormat = (text) => {
  if (!text || !text.trim()) return '';
  
  // Split by double newlines (paragraph breaks) or single newlines
  const lines = text.split(/\n\n|\n/).filter(line => line.trim());
  
  // Format each line as a bullet point if not already
  return lines.map(line => {
    const trimmedLine = line.trim();
    // Skip if already has bullet or is empty
    if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
      return trimmedLine;
    }
    return `• ${trimmedLine}`;
  }).join('\n');
};

// Helper function to render bulleted content
const BulletedContent = ({ text }) => {
  if (!text) return null;
  
  const lines = text.split('\n').filter(line => line.trim());
  
  return (
    <ul className="space-y-2 text-sm">
      {lines.map((line, index) => {
        // Remove bullet character if present for clean display
        const cleanLine = line.replace(/^[•\-\*]\s*/, '').trim();
        return (
          <li key={index} className="flex items-start gap-2">
            <span className="text-primary mt-1">•</span>
            <span className="leading-relaxed">{cleanLine}</span>
          </li>
        );
      })}
    </ul>
  );
};

export default function DailyStatusUpdate() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [pastStatuses, setPastStatuses] = useState([]);
  
  // Three sections state (simplified - removed AI revision state)
  const [yesterdayUpdates, setYesterdayUpdates] = useState('');
  const [todayActions, setTodayActions] = useState('');
  const [helpNeeded, setHelpNeeded] = useState('');

  useEffect(() => {
    fetchPastStatuses();
  }, []);

  useEffect(() => {
    loadExistingStatus();
  }, [selectedDate, pastStatuses]);

  const fetchPastStatuses = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/daily-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/daily-status/auto-populate/${selectedDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.activity_count === 0) {
        toast.info('No activities found for this date');
        return;
      }
      
      if (response.data.formatted_text) {
        // Convert to bullet format before setting
        setYesterdayUpdates(convertToBulletFormat(response.data.formatted_text));
        toast.success(`Loaded ${response.data.activity_count} activities from ${response.data.leads_contacted} leads`);
      }
    } catch (error) {
      toast.error('Failed to fetch activities');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!yesterdayUpdates.trim() && !todayActions.trim() && !helpNeeded.trim()) {
      toast.error('Please fill at least one section');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const existing = pastStatuses.find(s => s.status_date === selectedDate);
      
      // Convert all sections to bullet format before saving
      const data = {
        status_date: selectedDate,
        yesterday_updates: convertToBulletFormat(yesterdayUpdates),
        yesterday_original: null,
        yesterday_ai_revised: false,
        today_actions: convertToBulletFormat(todayActions),
        today_original: null,
        today_ai_revised: false,
        help_needed: convertToBulletFormat(helpNeeded),
        help_original: null,
        help_ai_revised: false
      };

      if (existing) {
        await axios.put(`${API_URL}/daily-status/${existing.id}`, data, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Status updated!');
      } else {
        await axios.post(`${API_URL}/daily-status`, data, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('Status posted!');
      }
      
      fetchPastStatuses();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to save status';
      toast.error(errorMessage, {
        description: 'Your status update was not saved',
        duration: 6000
      });
    } finally {
      setLoading(false);
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');

  // Dynamic section titles based on selected date
  const isToday = selectedDate === today;
  const isYesterday = selectedDate === yesterday;
  const isPastDate = selectedDate < yesterday;
  
  const firstSectionTitle = isToday 
    ? "Today's Updates" 
    : isYesterday 
      ? "Yesterday's Updates"
      : format(new Date(selectedDate), "EEEE, MMM d") + " - Updates";
  
  const secondSectionTitle = isToday
    ? "Tomorrow's Action Items & Follow-ups"
    : "Today's Action Items & Follow-ups";

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8 px-4" data-testid="daily-status-page">
      {/* Header */}
      <div className="text-center pt-4">
        <h1 className="text-3xl font-bold mb-2">Daily Status Update</h1>
        <p className="text-muted-foreground">Share your daily sales activities and progress</p>
      </div>

      {/* Date Selection - Mobile Optimized */}
      <Card className="p-5">
        <label className="block text-sm font-semibold mb-3">Select Date</label>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Button
            type="button"
            variant={selectedDate === yesterday ? 'default' : 'outline'}
            className="h-16 text-base font-medium"
            onClick={() => setSelectedDate(yesterday)}
            data-testid="date-yesterday"
          >
            <Calendar className="h-5 w-5 mr-2" />
            Yesterday
          </Button>
          <Button
            type="button"
            variant={selectedDate === today ? 'default' : 'outline'}
            className="h-16 text-base font-medium"
            onClick={() => setSelectedDate(today)}
            data-testid="date-today"
          >
            <Calendar className="h-5 w-5 mr-2" />
            Today
          </Button>
        </div>
        
        {/* Custom Date Picker for Past Dates */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Or select any past date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={today}
            className="w-full h-12 px-4 rounded-md border border-input bg-background text-base"
            data-testid="date-picker"
          />
        </div>
        
        <p className="text-sm text-center mt-4 font-medium text-primary">
          {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
        </p>
      </Card>

      {/* Fetch from Lead Activities Button - Dynamic text */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-14 text-base font-medium border-dashed"
        onClick={handleFetchFromActivities}
        disabled={loading}
        data-testid="fetch-activities-button"
      >
        {loading ? (
          <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading activities...</>
        ) : (
          <><Download className="h-5 w-5 mr-2" /> 
            {isToday ? "Fetch Today's Lead Activities" : 
             isYesterday ? "Fetch Yesterday's Lead Activities" :
             `Fetch Lead Activities from ${format(new Date(selectedDate), 'MMM d')}`}
          </>
        )}
      </Button>

      {/* Section 1: Yesterday's Updates / Today's Updates / Date-specific */}
      <StatusSection
        title={firstSectionTitle}
        value={yesterdayUpdates}
        onChange={setYesterdayUpdates}
        placeholder={isToday ? "What did you accomplish today? Enter each item on a new line..." : "What did you accomplish on this day? Enter each item on a new line..."}
      />

      {/* Section 2: Today's / Tomorrow's Action Items (Disabled for past dates) */}
      <StatusSection
        title={secondSectionTitle}
        value={todayActions}
        onChange={setTodayActions}
        disabled={isPastDate}
        placeholder={isToday ? "What are your plans for tomorrow? Enter each item on a new line..." : "What are your plans for today? Enter each item on a new line..."}
      />

      {/* Section 3: Help Needed from Team */}
      <StatusSection
        title="Help Needed from the Team"
        value={helpNeeded}
        onChange={setHelpNeeded}
        placeholder="Do you need support from colleagues? Enter each item on a new line..."
      />

      {/* Submit Button - Prominent & Mobile-Friendly */}
      <Button
        type="button"
        className="w-full h-16 text-lg font-semibold"
        onClick={handleSubmit}
        disabled={loading}
        data-testid="submit-status-button"
      >
        {loading ? (
          <><Loader2 className="h-6 w-6 mr-2 animate-spin" /> Saving...</>
        ) : (
          <><Send className="h-6 w-6 mr-2" /> Post Status Update</>
        )}
      </Button>

      {/* Past Statuses - with bulleted display */}
      {pastStatuses.length > 0 && (
        <div className="space-y-4 mt-8">
          <h2 className="text-xl font-bold">Recent Updates</h2>
          {pastStatuses.slice(0, 5).map((status) => (
            <Card key={status.id} className="p-5" data-testid={`past-status-${status.id}`}>
              <div className="mb-4">
                <p className="font-bold text-lg">{format(new Date(status.status_date), 'EEEE, MMM d')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Posted {format(new Date(status.created_at), 'h:mm a')}
                </p>
              </div>

              {status.yesterday_updates && (
                <div className="mb-4">
                  <p className="text-sm font-semibold text-muted-foreground mb-2">Updates</p>
                  <BulletedContent text={status.yesterday_updates} />
                </div>
              )}

              {status.today_actions && (
                <div className="mb-4">
                  <p className="text-sm font-semibold text-muted-foreground mb-2">Action Items</p>
                  <BulletedContent text={status.today_actions} />
                </div>
              )}

              {status.help_needed && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2">Help Needed</p>
                  <BulletedContent text={status.help_needed} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
