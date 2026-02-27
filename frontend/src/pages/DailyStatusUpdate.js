import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { Calendar, Send, Loader2, Download, Phone, MapPin, Mail, MessageSquare, Activity, Copy, Check, Share2 } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Styled activity display component with highlighted headers
const StyledActivityDisplay = ({ text, onChange }) => {
  if (!text) {
    return (
      <Textarea
        value=""
        onChange={(e) => onChange(e.target.value)}
        placeholder="What did you accomplish today? Enter each item on a new line..."
        rows={8}
        className="text-base resize-none"
      />
    );
  }

  const lines = text.split('\n').filter(line => line.trim());
  
  return (
    <div className="border rounded-lg p-4 bg-background min-h-[200px] space-y-2">
      {lines.map((line, index) => {
        const trimmedLine = line.trim();
        
        // Summary line - highlighted with gradient background
        if (trimmedLine.startsWith('[SUMMARY]')) {
          const summaryText = trimmedLine.replace('[SUMMARY]', '').trim();
          return (
            <div key={index} className="bg-gradient-to-r from-primary/20 to-primary/5 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <span className="font-bold text-primary text-base">{summaryText}</span>
              </div>
            </div>
          );
        }
        
        // Section headers - highlighted
        if (trimmedLine.startsWith('[HEADER]')) {
          const headerText = trimmedLine.replace('[HEADER]', '').trim();
          const iconMap = {
            'CUSTOMER VISITS': <MapPin className="h-4 w-4" />,
            'PHONE CALLS': <Phone className="h-4 w-4" />,
            'EMAILS': <Mail className="h-4 w-4" />,
            'WHATSAPP': <MessageSquare className="h-4 w-4" />,
            'SMS': <MessageSquare className="h-4 w-4" />,
            'OTHER ACTIVITIES': <Activity className="h-4 w-4" />
          };
          return (
            <div key={index} className="flex items-center gap-2 mt-4 mb-2 pb-1 border-b border-primary/30">
              <span className="text-primary">{iconMap[headerText] || <Activity className="h-4 w-4" />}</span>
              <span className="font-semibold text-sm text-primary uppercase tracking-wide">{headerText}</span>
            </div>
          );
        }
        
        // Regular bullet items
        if (trimmedLine.startsWith('•')) {
          const itemText = trimmedLine.replace('•', '').trim();
          return (
            <div key={index} className="flex items-start gap-2 pl-2">
              <span className="text-muted-foreground mt-1">•</span>
              <span className="text-sm leading-relaxed">{itemText}</span>
            </div>
          );
        }
        
        // Any other line
        return (
          <div key={index} className="text-sm pl-2">{trimmedLine}</div>
        );
      })}
    </div>
  );
};

// Simple status section with styled display option
const StatusSection = ({ title, value, onChange, placeholder, disabled, showStyledView, showCopyButton, onCopy, copied, onShare, canShare }) => {
  const hasSpecialFormatting = value && (value.includes('[SUMMARY]') || value.includes('[HEADER]'));
  
  return (
    <Card className={`p-5 ${disabled ? 'bg-muted/30' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-semibold">{title}</label>
        {showCopyButton && value && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={copied ? "default" : "ghost"}
              size="sm"
              className={`h-8 px-3 text-xs ${copied ? 'bg-green-600 hover:bg-green-600 text-white' : ''}`}
              onClick={onCopy}
              data-testid="copy-activities-button"
            >
              {copied ? (
                <><Check className="h-3.5 w-3.5 mr-1.5" /> Copied!</>
              ) : (
                <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy</>
              )}
            </Button>
            {canShare && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={onShare}
                data-testid="share-activities-button"
              >
                <Share2 className="h-3.5 w-3.5 mr-1.5" /> Share
              </Button>
            )}
          </div>
        )}
      </div>
      {disabled ? (
        <p className="text-sm text-muted-foreground italic">Action items not available for past dates</p>
      ) : hasSpecialFormatting ? (
        <StyledActivityDisplay text={value} onChange={onChange} />
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

// Helper function to convert text to bullet format (preserve special markers)
const convertToBulletFormat = (text) => {
  if (!text || !text.trim()) return '';
  
  const lines = text.split(/\n/).filter(line => line.trim());
  
  return lines.map(line => {
    const trimmedLine = line.trim();
    // Preserve special markers
    if (trimmedLine.startsWith('[SUMMARY]') || trimmedLine.startsWith('[HEADER]')) {
      return trimmedLine;
    }
    // Skip if already has bullet or is empty
    if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
      return trimmedLine;
    }
    // Skip emoji prefixed lines (manual edits)
    if (trimmedLine.startsWith('📊') || trimmedLine.startsWith('📌')) {
      return trimmedLine;
    }
    return `• ${trimmedLine}`;
  }).join('\n');
};

// Helper function to render bulleted content with styling
const BulletedContent = ({ text }) => {
  if (!text) return null;
  
  const lines = text.split('\n').filter(line => line.trim());
  
  return (
    <div className="space-y-1.5">
      {lines.map((line, index) => {
        const trimmedLine = line.trim();
        
        // Summary line
        if (trimmedLine.startsWith('[SUMMARY]') || trimmedLine.startsWith('📊')) {
          const summaryText = trimmedLine.replace('[SUMMARY]', '').replace('📊 SUMMARY:', '').trim();
          return (
            <div key={index} className="bg-primary/10 rounded px-2 py-1 mb-2">
              <span className="font-semibold text-primary text-sm">{summaryText}</span>
            </div>
          );
        }
        
        // Header line
        if (trimmedLine.startsWith('[HEADER]') || trimmedLine.startsWith('📌')) {
          const headerText = trimmedLine.replace('[HEADER]', '').replace('📌', '').trim();
          return (
            <div key={index} className="font-semibold text-xs text-primary uppercase mt-2 mb-1">
              {headerText}
            </div>
          );
        }
        
        // Regular bullet
        const cleanLine = trimmedLine.replace(/^[•\-\*]\s*/, '').trim();
        return (
          <div key={index} className="flex items-start gap-2 text-sm">
            <span className="text-primary mt-0.5">•</span>
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
  const [pastStatuses, setPastStatuses] = useState([]);
  
  // Three sections state (simplified - removed AI revision state)
  const [yesterdayUpdates, setYesterdayUpdates] = useState('');
  const [todayActions, setTodayActions] = useState('');
  const [helpNeeded, setHelpNeeded] = useState('');
  const [hasFetchedActivities, setHasFetchedActivities] = useState(false);
  const [copied, setCopied] = useState(false);

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
    // Reset fetched activities state when date changes
    setHasFetchedActivities(false);
    setCopied(false);
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
        setHasFetchedActivities(false);
        return;
      }
      
      if (response.data.formatted_text) {
        // Convert to bullet format before setting
        setYesterdayUpdates(convertToBulletFormat(response.data.formatted_text));
        setHasFetchedActivities(true);
        setCopied(false);
        toast.success(`Loaded ${response.data.activity_count} activities from ${response.data.leads_contacted} leads`);
      }
    } catch (error) {
      toast.error('Failed to fetch activities');
      setHasFetchedActivities(false);
    } finally {
      setLoading(false);
    }
  };

  // Copy fetched activities to clipboard (clean format without special markers)
  const handleCopyActivities = async () => {
    if (!yesterdayUpdates) {
      toast.error('No activities to copy');
      return;
    }
    
    // Convert the formatted text to a clean, readable format for clipboard
    const lines = yesterdayUpdates.split('\n').filter(line => line.trim());
    const cleanedLines = lines.map(line => {
      const trimmedLine = line.trim();
      // Convert [SUMMARY] to plain text
      if (trimmedLine.startsWith('[SUMMARY]')) {
        return trimmedLine.replace('[SUMMARY]', 'SUMMARY:');
      }
      // Convert [HEADER] to plain text with separator
      if (trimmedLine.startsWith('[HEADER]')) {
        return '\n' + trimmedLine.replace('[HEADER]', '').trim() + ':';
      }
      return trimmedLine;
    });
    
    const textToCopy = cleanedLines.join('\n').trim();
    
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success('Activities copied to clipboard!');
      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      toast.success('Activities copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
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
        showCopyButton={hasFetchedActivities}
        onCopy={handleCopyActivities}
        copied={copied}
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
