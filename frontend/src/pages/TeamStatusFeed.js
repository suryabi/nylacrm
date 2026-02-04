import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Users, Calendar, Sparkles, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function TeamStatusFeed() {
  const [rollupData, setRollupData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeamRollup();
  }, [selectedDate]);

  const fetchTeamRollup = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/daily-status/team-rollup`, {
        params: { status_date: selectedDate },
        headers: { Authorization: `Bearer ${token}` }
      });
      setRollupData(response.data);
    } catch (error) {
      toast.error('Failed to load team statuses');
    } finally {
      setLoading(false);
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');

  if (loading) {
    return <div className="flex justify-center py-12">Loading team updates...</div>;
  }

  const completionRate = rollupData?.total_reports > 0
    ? Math.round((rollupData.statuses_received / rollupData.total_reports) * 100)
    : 0;

  return (
    <div className="space-y-6" data-testid="team-status-feed">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold">Team Status Feed</h1>
        <p className="text-muted-foreground mt-1">Daily updates from your team members</p>
      </div>

      {/* Date Selection & Stats */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
          <div className="flex gap-2">
            <Button
              variant={selectedDate === yesterday ? 'default' : 'outline'}
              onClick={() => setSelectedDate(yesterday)}
            >
              Yesterday
            </Button>
            <Button
              variant={selectedDate === today ? 'default' : 'outline'}
              onClick={() => setSelectedDate(today)}
            >
              Today
            </Button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={today}
              className="px-3 rounded-md border border-input bg-background"
            />
          </div>
          
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Status Submission Rate</p>
            <p className="text-2xl font-bold text-primary">
              {rollupData?.statuses_received}/{rollupData?.total_reports} ({completionRate}%)
            </p>
          </div>
        </div>

        <p className="text-sm font-medium text-center">
          {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
        </p>
      </Card>

      {/* Team Statuses */}
      {rollupData?.team_statuses.length === 0 ? (
        <Card className="p-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No status updates received for this date</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {rollupData?.team_statuses.map((status, index) => (
            <Card key={index} className="p-6" data-testid={`team-status-${index}`}>
              {/* Team Member Info */}
              <div className="flex items-start justify-between mb-4 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                    {status.user_name[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-lg">{status.user_name}</p>
                    <p className="text-sm text-muted-foreground">{status.user_designation}</p>
                    <p className="text-xs text-primary mt-1">{status.user_territory}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(status.created_at), 'h:mm a')}
                </p>
              </div>

              {/* Status Sections */}
              {status.yesterday_updates && (
                <div className="mb-4 pb-4 border-b border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Yesterday's Updates
                    </p>
                    {status.yesterday_ai_revised && (
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI
                      </Badge>
                    )}
                  </div>
                  <p className="text-base leading-relaxed whitespace-pre-wrap">{status.yesterday_updates}</p>
                </div>
              )}

              {status.today_actions && (
                <div className="mb-4 pb-4 border-b border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Today's Action Items
                    </p>
                    {status.today_ai_revised && (
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI
                      </Badge>
                    )}
                  </div>
                  <p className="text-base leading-relaxed whitespace-pre-wrap">{status.today_actions}</p>
                </div>
              )}

              {status.help_needed && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-semibold text-amber-800 uppercase tracking-wide">
                      Help Needed
                    </p>
                    {status.help_ai_revised && (
                      <Badge variant="outline" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI
                      </Badge>
                    )}
                  </div>
                  <p className="text-base leading-relaxed whitespace-pre-wrap text-amber-900">{status.help_needed}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
