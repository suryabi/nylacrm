import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Calendar, Sparkles, RotateCcw, Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const StatusSection = ({ title, value, onChange, onRevise, onUndo, isRevised, isRevising, placeholder }) => {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-semibold">{title}</label>
        {isRevised && (
          <Badge className="bg-purple-100 text-purple-800 text-xs">
            <Sparkles className="h-3 w-3 mr-1" />
            AI Revised
          </Badge>
        )}
      </div>
      
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={6}
        className="text-base resize-none mb-3"
      />

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-11"
          onClick={onRevise}
          disabled={isRevising || !value.trim()}
        >
          {isRevising ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Revising...</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" /> Revise with AI</>
          )}
        </Button>
        
        {isRevised && (
          <Button
            type="button"
            variant="outline"
            className="h-11 px-4"
            onClick={onUndo}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  );
};

export default function DailyStatusUpdate() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [pastStatuses, setPastStatuses] = useState([]);
  
  // Three sections state
  const [yesterdayUpdates, setYesterdayUpdates] = useState('');
  const [yesterdayOriginal, setYesterdayOriginal] = useState('');
  const [yesterdayRevised, setYesterdayRevised] = useState(false);
  const [revisingYesterday, setRevisingYesterday] = useState(false);
  
  const [todayActions, setTodayActions] = useState('');
  const [todayOriginal, setTodayOriginal] = useState('');
  const [todayRevised, setTodayRevised] = useState(false);
  const [revisingToday, setRevisingToday] = useState(false);
  
  const [helpNeeded, setHelpNeeded] = useState('');
  const [helpOriginal, setHelpOriginal] = useState('');
  const [helpRevised, setHelpRevised] = useState(false);
  const [revisingHelp, setRevisingHelp] = useState(false);

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

  const loadExistingStatus = () => {
    const existing = pastStatuses.find(s => s.status_date === selectedDate);
    if (existing) {
      setYesterdayUpdates(existing.yesterday_updates || '');
      setYesterdayOriginal(existing.yesterday_original || '');
      setYesterdayRevised(existing.yesterday_ai_revised || false);
      
      setTodayActions(existing.today_actions || '');
      setTodayOriginal(existing.today_original || '');
      setTodayRevised(existing.today_ai_revised || false);
      
      setHelpNeeded(existing.help_needed || '');
      setHelpOriginal(existing.help_original || '');
      setHelpRevised(existing.help_ai_revised || false);
    } else {
      setYesterdayUpdates('');
      setYesterdayOriginal('');
      setYesterdayRevised(false);
      setTodayActions('');
      setTodayOriginal('');
      setTodayRevised(false);
      setHelpNeeded('');
      setHelpOriginal('');
      setHelpRevised(false);
    }
  };

  const reviseSection = async (text, setRevising, setText, setOriginal, setRevised) => {
    if (!text.trim()) {
      toast.error('Please write something first');
      return;
    }

    setRevising(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/daily-status/revise`,
        { text },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setOriginal(text);
      setText(response.data.revised);
      setRevised(true);
      toast.success('Revised by AI!');
    } catch (error) {
      toast.error('AI revision failed');
    } finally {
      setRevising(false);
    }
  };

  const undoSection = (original, setText, setRevised) => {
    if (original) {
      setText(original);
      setRevised(false);
      toast.success('Restored original');
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
      
      const data = {
        status_date: selectedDate,
        yesterday_updates: yesterdayUpdates,
        yesterday_original: yesterdayRevised ? yesterdayOriginal : null,
        yesterday_ai_revised: yesterdayRevised,
        today_actions: todayActions,
        today_original: todayRevised ? todayOriginal : null,
        today_ai_revised: todayRevised,
        help_needed: helpNeeded,
        help_original: helpRevised ? helpOriginal : null,
        help_ai_revised: helpRevised
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
      toast.error(error.response?.data?.detail || 'Failed to save status');
    } finally {
      setLoading(false);
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');

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

      {/* Section 1: Yesterday's Updates */}
      <StatusSection
        title="Yesterday's Updates"
        value={yesterdayUpdates}
        onChange={setYesterdayUpdates}
        onRevise={() => reviseSection(yesterdayUpdates, setRevisingYesterday, setYesterdayUpdates, setYesterdayOriginal, setYesterdayRevised)}
        onUndo={() => undoSection(yesterdayOriginal, setYesterdayUpdates, setYesterdayRevised)}
        isRevised={yesterdayRevised}
        isRevising={revisingYesterday}
        placeholder="What did you accomplish yesterday? Meetings, client visits, deals closed..."
      />

      {/* Section 2: Today's Action Items & Follow-ups */}
      <StatusSection
        title="Today's Action Items & Follow-ups"
        value={todayActions}
        onChange={setTodayActions}
        onRevise={() => reviseSection(todayActions, setRevisingToday, setTodayActions, setTodayOriginal, setTodayRevised)}
        onUndo={() => undoSection(todayOriginal, setTodayActions, setTodayRevised)}
        isRevised={todayRevised}
        isRevising={revisingToday}
        placeholder="What are your plans for today? Follow-ups scheduled, client meetings, proposals to send..."
      />

      {/* Section 3: Help Needed from Team */}
      <StatusSection
        title="Help Needed from the Team"
        value={helpNeeded}
        onChange={setHelpNeeded}
        onRevise={() => reviseSection(helpNeeded, setRevisingHelp, setHelpNeeded, setHelpOriginal, setHelpRevised)}
        onUndo={() => undoSection(helpOriginal, setHelpNeeded, setHelpRevised)}
        isRevised={helpRevised}
        isRevising={revisingHelp}
        placeholder="Do you need support from colleagues? Resources, approvals, technical assistance..."
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

      {/* Past Statuses */}
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
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-muted-foreground">Yesterday's Updates</p>
                    {status.yesterday_ai_revised && (
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{status.yesterday_updates}</p>
                </div>
              )}

              {status.today_actions && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-muted-foreground">Today's Action Items</p>
                    {status.today_ai_revised && (
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{status.today_actions}</p>
                </div>
              )}

              {status.help_needed && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-muted-foreground">Help Needed</p>
                    {status.help_ai_revised && (
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{status.help_needed}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
