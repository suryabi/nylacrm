import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { Users, Calendar, Sparkles, AlertCircle, UserX, CheckCircle2, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const TERRITORIES = ['All Territories', 'North India', 'South India', 'West India', 'East India', 'Central India', 'All India'];

export default function TeamStatusFeed() {
  const [rollupData, setRollupData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')); // Yesterday by default
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [aiSummary, setAiSummary] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  
  // Filters
  const [territoryFilter, setTerritoryFilter] = useState('All Territories');
  const [userFilter, setUserFilter] = useState('All Members');

  useEffect(() => {
    fetchAllUsers();
  }, []);

  useEffect(() => {
    fetchTeamRollup();
  }, [selectedDate]);

  const fetchAllUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAllUsers(response.data);
    } catch (error) {
      console.error('Failed to load users');
    }
  };

  const fetchTeamRollup = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/daily-status/team-rollup`, {
        params: { status_date: selectedDate },
        headers: { Authorization: `Bearer ${token}` }
      });
      setRollupData(response.data);
      setAiSummary(''); // Reset summary when date changes
    } catch (error) {
      toast.error('Failed to load team statuses');
    } finally {
      setLoading(false);
    }
  };

  const generateAISummary = async () => {
    if (!rollupData?.team_statuses || rollupData.team_statuses.length === 0) {
      toast.error('No statuses to summarize');
      return;
    }

    setGeneratingSummary(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/daily-status/team-summary`,
        {
          team_statuses: rollupData.team_statuses,
          status_date: selectedDate
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setAiSummary(response.data.summary);
      toast.success('AI summary generated!');
    } catch (error) {
      toast.error('Failed to generate summary');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');

  if (loading) {
    return <div className="flex justify-center py-12">Loading team updates...</div>;
  }

  // Filter statuses
  let filteredStatuses = rollupData?.team_statuses || [];
  
  if (territoryFilter !== 'All Territories') {
    filteredStatuses = filteredStatuses.filter(s => s.user_territory === territoryFilter);
  }
  
  if (userFilter !== 'All Members') {
    filteredStatuses = filteredStatuses.filter(s => s.user_name === userFilter);
  }

  // Get list of users for filter dropdown based on territory
  const usersInTerritory = territoryFilter === 'All Territories'
    ? rollupData?.team_statuses.map(s => s.user_name) || []
    : rollupData?.team_statuses.filter(s => s.user_territory === territoryFilter).map(s => s.user_name) || [];

  const uniqueUsers = ['All Members', ...new Set(usersInTerritory)];

  // Calculate who didn't submit
  const submittedUserIds = (rollupData?.team_statuses || []).map(s => {
    // Find user by name from allUsers
    const user = allUsers.find(u => u.name === s.user_name);
    return user?.id;
  }).filter(Boolean);
  
  const allDirectReports = allUsers.filter(u => {
    // For now, show all sales team members
    return ['sales_rep', 'sales_manager'].includes(u.role);
  });
  
  const notSubmitted = allDirectReports.filter(u => !submittedUserIds.includes(u.id));

  const completionRate = rollupData?.total_reports > 0
    ? Math.round((rollupData.statuses_received / rollupData.total_reports) * 100)
    : 0;

  // Consolidated summary
  const totalLeadsContacted = filteredStatuses.reduce((acc, s) => {
    const yesterdayText = s.yesterday_updates || '';
    const matches = yesterdayText.match(/\b\d+\s+(?:client|lead|customer|meeting|visit)/gi);
    return acc + (matches ? matches.length : 0);
  }, 0);

  return (
    <div className="space-y-6" data-testid="team-status-feed">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold">Team Status Feed</h1>
        <p className="text-muted-foreground mt-1">Daily updates from your team members</p>
      </div>

      {/* Date Selection & Filters */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-2 block">Select Date</label>
            <div className="flex gap-2">
              <Button
                variant={selectedDate === yesterday ? 'default' : 'outline'}
                onClick={() => setSelectedDate(yesterday)}
                className="flex-1"
              >
                Yesterday
              </Button>
              <Button
                variant={selectedDate === today ? 'default' : 'outline'}
                onClick={() => setSelectedDate(today)}
                className="flex-1"
              >
                Today
              </Button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={today}
                className="flex-1 px-3 rounded-md border border-input bg-background"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-2 block">Territory</label>
              <Select value={territoryFilter} onValueChange={(v) => {
                setTerritoryFilter(v);
                setUserFilter('All Members');
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERRITORIES.map(territory => (
                    <SelectItem key={territory} value={territory}>{territory}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-2 block">Team Member</label>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {uniqueUsers.map(user => (
                    <SelectItem key={user} value={user}>{user}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <p className="text-sm font-medium text-center text-primary">
          {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}
        </p>
      </Card>

      {/* Consolidated Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 hover:shadow-md transition-shadow">
          <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Submission Rate</p>
          <p className="text-4xl font-bold text-primary">{completionRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            {rollupData?.statuses_received}/{rollupData?.total_reports} submitted
          </p>
        </Card>

        <Card className="p-5 hover:shadow-md transition-shadow">
          <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Total Team Members</p>
          <p className="text-4xl font-bold text-primary">{rollupData?.total_reports || 0}</p>
        </Card>

        <Card className="p-5 hover:shadow-md transition-shadow">
          <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Statuses Received</p>
          <p className="text-4xl font-bold text-green-600">{rollupData?.statuses_received || 0}</p>
        </Card>

        <Card className="p-5 hover:shadow-md transition-shadow">
          <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Not Submitted</p>
          <p className="text-4xl font-bold text-red-600">{notSubmitted.length}</p>
        </Card>
      </div>

      {/* Who Didn't Submit */}
      {notSubmitted.length > 0 && (
        <Card className="p-5 bg-red-50 border-red-200">
          <div className="flex items-center gap-2 mb-3">
            <UserX className="h-5 w-5 text-red-600" />
            <h3 className="text-sm font-semibold text-red-800">Team Members Who Did Not Submit Status</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {notSubmitted.map((user, index) => (
              <Badge key={index} variant="outline" className="border-red-300 text-red-700">
                {user.name} ({user.territory})
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* All Submitted */}
      {notSubmitted.length === 0 && rollupData?.statuses_received > 0 && (
        <Card className="p-5 bg-green-50 border-green-200">
          <div className="flex items-center gap-2 justify-center">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-sm font-semibold text-green-800">100% Submission - All team members submitted their status!</p>
          </div>
        </Card>
      )}

      {/* AI Consolidated Summary */}
      {rollupData?.statuses_received > 0 && (
        <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-bold">AI Consolidated Summary</h3>
            </div>
            <Button
              onClick={generateAISummary}
              disabled={generatingSummary}
              size="sm"
              data-testid="generate-summary-button"
            >
              {generatingSummary ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Generate Summary</>
              )}
            </Button>
          </div>

          {aiSummary ? (
            <div className="bg-white rounded-lg p-5 border border-border">
              <div className="space-y-4 leading-relaxed">
                {aiSummary.split('\n\n').map((paragraph, index) => {
                  // Remove markdown ** and display as bold headers
                  const cleanParagraph = paragraph.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                  
                  return (
                    <div key={index} dangerouslySetInnerHTML={{ __html: cleanParagraph }} />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 border-2 border-dashed border-primary/30 rounded-lg">
              <Sparkles className="h-10 w-10 mx-auto text-primary/50 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                Click "Generate Summary" to get an AI-powered consolidated view
              </p>
              <p className="text-xs text-muted-foreground">
                AI will organize all team updates into key achievements, actions, and help requests
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Team Statuses */}
      {filteredStatuses.length === 0 ? (
        <Card className="p-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            {rollupData?.team_statuses.length === 0 
              ? 'No status updates received for this date'
              : 'No team members match the selected filters'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredStatuses.map((status, index) => {
            const userName = status.user_name || 'Unknown';
            const userInitial = userName[0] ? userName[0].toUpperCase() : '?';
            
            return (
              <Card key={`status-${index}`} className="p-6" data-testid={`team-status-${index}`}>
                {/* Team Member Info */}
                <div className="flex items-start justify-between mb-4 pb-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                      {userInitial}
                    </div>
                    <div>
                      <p className="font-bold text-lg">{userName}</p>
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
                        Updates
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
                        Action Items
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
            );
          })}
        </div>
      )}
    </div>
  );
}
