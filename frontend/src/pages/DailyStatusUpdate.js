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

export default function DailyStatusUpdate() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statusText, setStatusText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [isAiRevised, setIsAiRevised] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revising, setRevising] = useState(false);
  const [pastStatuses, setPastStatuses] = useState([]);

  useEffect(() => {
    fetchPastStatuses();
  }, []);

  useEffect(() => {
    checkExistingStatus();
  }, [selectedDate]);

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

  const checkExistingStatus = async () => {
    const existing = pastStatuses.find(s => s.status_date === selectedDate);
    if (existing) {
      setStatusText(existing.status_text);
      setOriginalText(existing.original_text || '');
      setIsAiRevised(existing.is_ai_revised || false);
    } else {
      setStatusText('');
      setOriginalText('');
      setIsAiRevised(false);
    }
  };

  const handleReviseWithAI = async () => {
    if (!statusText.trim()) {
      toast.error('Please write something first');
      return;
    }

    setRevising(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/daily-status/revise`,
        { text: statusText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (!originalText) {
        setOriginalText(statusText);
      }
      setStatusText(response.data.revised);
      setIsAiRevised(true);
      toast.success('Status revised by AI!');
    } catch (error) {
      toast.error('AI revision failed. Please try again.');
    } finally {
      setRevising(false);
    }
  };

  const handleUndo = () => {
    if (originalText) {
      setStatusText(originalText);
      setIsAiRevised(false);
      toast.success('Restored original text');
    }
  };

  const handleSubmit = async () => {
    if (!statusText.trim()) {
      toast.error('Please write your status update');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const existing = pastStatuses.find(s => s.status_date === selectedDate);
      
      const data = {
        status_date: selectedDate,
        status_text: statusText,
        original_text: isAiRevised ? originalText : null,
        is_ai_revised: isAiRevised
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
  const tomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd');

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8" data-testid="daily-status-page">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Daily Status Update</h1>
        <p className="text-muted-foreground">Share your daily sales activities and progress</p>
      </div>

      {/* Date Selection - Mobile Optimized */}
      <Card className="p-6">
        <label className="block text-sm font-semibold mb-3">Select Date</label>
        <div className="flex gap-3">
          <Button
            type="button"
            variant={selectedDate === today ? 'default' : 'outline'}
            className="flex-1 h-14 text-base"
            onClick={() => setSelectedDate(today)}
            data-testid="date-today"
          >
            <Calendar className="h-5 w-5 mr-2" />
            Today
          </Button>
          <Button
            type="button"
            variant={selectedDate === tomorrow ? 'default' : 'outline'}
            className="flex-1 h-14 text-base"
            onClick={() => setSelectedDate(tomorrow)}
            data-testid="date-tomorrow"
          >
            <Calendar className="h-5 w-5 mr-2" />
            Tomorrow
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          Selected: {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
        </p>
      </Card>

      {/* Status Input - Mobile Optimized */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold">Your Status Update</label>
          {isAiRevised && (
            <Badge className="bg-purple-100 text-purple-800">
              <Sparkles className="h-3 w-3 mr-1" />
              AI Revised
            </Badge>
          )}
        </div>
        
        <Textarea
          value={statusText}
          onChange={(e) => setStatusText(e.target.value)}
          placeholder="What did you accomplish today? Meetings attended, leads contacted, deals closed..."
          rows={8}
          className="text-base resize-none"
          data-testid="status-input"
        />

        {/* AI Actions - Large Touch Targets */}
        <div className="flex gap-3 mt-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-12"
            onClick={handleReviseWithAI}
            disabled={revising || !statusText.trim()}
            data-testid="revise-ai-button"
          >
            {revising ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Revising...</>
            ) : (
              <><Sparkles className="h-5 w-5 mr-2" /> Revise with AI</>
            )}
          </Button>
          
          {isAiRevised && originalText && (
            <Button
              type="button"
              variant="outline"
              className="h-12 px-4"
              onClick={handleUndo}
              data-testid="undo-button"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Submit Button - Prominent */}
        <Button
          type="button"
          className="w-full h-14 text-base mt-4"
          onClick={handleSubmit}
          disabled={loading || !statusText.trim()}
          data-testid="submit-status-button"
        >
          {loading ? (
            <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Saving...</>
          ) : (
            <><Send className="h-5 w-5 mr-2" /> Post Status Update</>
          )}
        </Button>
      </Card>

      {/* Past Statuses - Read-only */}
      {pastStatuses.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Recent Updates</h2>
          {pastStatuses.slice(0, 5).map((status) => (
            <Card key={status.id} className="p-5" data-testid={`past-status-${status.id}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold">{format(new Date(status.status_date), 'EEEE, MMM d')}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Posted {format(new Date(status.created_at), 'h:mm a')}
                  </p>
                </div>
                {status.is_ai_revised && (
                  <Badge variant="outline" className="text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI Revised
                  </Badge>
                )}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{status.status_text}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
