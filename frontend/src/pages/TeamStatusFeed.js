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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Sparkles, AlertCircle, UserX, CheckCircle2, Loader2, Calendar } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const TERRITORIES = ['All Territories', 'North India', 'South India', 'West India', 'East India', 'Central India', 'All India'];

export default function TeamStatusFeed() {
  const [viewMode, setViewMode] = useState('daily'); // daily, weekly, monthly
  const [selectedDate, setSelectedDate] = useState(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [rollupData, setRollupData] = useState(null);
  const [aiSummary, setAiSummary] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  
  // Filters
  const [territoryFilter, setTerritoryFilter] = useState('All Territories');
  const [memberFilter, setMemberFilter] = useState('All Members');
  const [viewType, setViewType] = useState('team'); // team or individual

  useEffect(() => {
    fetchAllUsers();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedDate, viewMode]);

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

  const fetchData = async () => {
    setLoading(true);
    setAiSummary('');
    
    try {
      const token = localStorage.getItem('token');
      
      if (viewMode === 'daily') {
        const response = await axios.get(`${API_URL}/daily-status/team-rollup`, {
          params: { status_date: selectedDate },
          headers: { Authorization: `Bearer ${token}` }
        });
        setRollupData(response.data);
        
        // Fetch team metrics for the day
        const metricsRes = await axios.get(`${API_URL}/analytics/activity-metrics`, {
          params: { start_date: selectedDate, end_date: selectedDate },
          headers: { Authorization: `Bearer ${token}` }
        });
        setRollupData(prev => ({ ...prev, team_metrics: metricsRes.data }));
      } else {
        // Weekly or Monthly
        let startDate, endDate;
        
        if (viewMode === 'weekly') {
          startDate = format(startOfWeek(new Date(selectedDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
          endDate = format(endOfWeek(new Date(selectedDate), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        } else {
          startDate = format(startOfMonth(new Date(selectedDate)), 'yyyy-MM-dd');
          endDate = format(endOfMonth(new Date(selectedDate)), 'yyyy-MM-dd');
        }
        
        const [statusRes, metricsRes] = await Promise.all([
          axios.get(`${API_URL}/daily-status/weekly-summary`, {
            params: { start_date: startDate, end_date: endDate },
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_URL}/analytics/activity-metrics`, {
            params: { start_date: startDate, end_date: endDate },
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        
        setRollupData({ 
          ...statusRes.data, 
          start_date: startDate, 
          end_date: endDate,
          team_metrics: metricsRes.data
        });
      }
    } catch (error) {
      toast.error('Failed to load statuses');
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const token = localStorage.getItem('token');
      
      if (viewMode === 'daily') {
        const response = await axios.post(
          `${API_URL}/daily-status/team-summary`,
          { team_statuses: rollupData.team_statuses, status_date: selectedDate },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setAiSummary(response.data.summary);
      } else {
        const response = await axios.post(
          `${API_URL}/daily-status/generate-period-summary`,
          {
            statuses: rollupData.statuses,
            period_type: viewMode,
            start_date: rollupData.start_date,
            end_date: rollupData.end_date
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setAiSummary(response.data.summary);
      }
      
      toast.success('AI summary generated!');
    } catch (error) {
      toast.error('Failed to generate summary');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

  // Filter data
  let filteredData = viewMode === 'daily' ? (rollupData?.team_statuses || []) : (rollupData?.statuses || []);
  
  if (territoryFilter !== 'All Territories') {
    filteredData = filteredData.filter(s => s.user_territory === territoryFilter);
  }
  
  if (memberFilter !== 'All Members') {
    filteredData = filteredData.filter(s => s.user_name === memberFilter);
  }

  // Get unique members for filter
  const allMembers = viewMode === 'daily'
    ? (rollupData?.team_statuses || []).map(s => s.user_name)
    : (rollupData?.statuses || []).map(s => s.user_name || 'Unknown');
  
  const uniqueMembers = ['All Members', ...new Set(allMembers)];

  // Calculate completion stats
  const submittedCount = viewMode === 'daily' ? rollupData?.statuses_received || 0 : filteredData.length;
  const totalCount = viewMode === 'daily' ? rollupData?.total_reports || 0 : allUsers.filter(u => ['sales_rep', 'sales_manager'].includes(u.role)).length;
  const completionRate = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6" data-testid="team-status-feed">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold">Team Status Feed</h1>
        <p className="text-muted-foreground mt-1">Daily, weekly, and monthly team performance updates</p>
      </div>

      {/* View Mode Selector */}
      <Card className="p-6">
        <Tabs value={viewMode} onValueChange={setViewMode} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-12">
            <TabsTrigger value="daily" className="text-base">Daily</TabsTrigger>
            <TabsTrigger value="weekly" className="text-base">Weekly</TabsTrigger>
            <TabsTrigger value="monthly" className="text-base">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Date Selection & Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-2 block">Select {viewMode === 'daily' ? 'Date' : viewMode === 'weekly' ? 'Week' : 'Month'}</label>
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
                className="flex-1 px-3 rounded-md border border-input bg-background text-sm"
              />
            </div>
            {viewMode !== 'daily' && rollupData?.start_date && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {format(new Date(rollupData.start_date), 'MMM d')} - {format(new Date(rollupData.end_date), 'MMM d, yyyy')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-2 block">Territory</label>
              <Select value={territoryFilter} onValueChange={(v) => {
                setTerritoryFilter(v);
                setMemberFilter('All Members');
              }}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERRITORIES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-2 block">Team Member</label>
              <Select value={memberFilter} onValueChange={setMemberFilter}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {uniqueMembers.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {/* Activity Metrics - All Views */}
      {rollupData?.team_metrics && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Activity Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="p-4 bg-white border hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">New Leads</p>
              <p className="text-3xl font-bold text-primary">{rollupData.team_metrics.new_leads || 0}</p>
            </Card>
            <Card className="p-4 bg-white border hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Phone Calls</p>
              <p className="text-3xl font-bold text-blue-600">{rollupData.team_metrics.phone_calls || 0}</p>
            </Card>
            <Card className="p-4 bg-white border hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Customer Visits</p>
              <p className="text-3xl font-bold text-green-600">{rollupData.team_metrics.customer_visits || 0}</p>
            </Card>
            <Card className="p-4 bg-white border hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Emails</p>
              <p className="text-3xl font-bold text-purple-600">{rollupData.team_metrics.emails || 0}</p>
            </Card>
            <Card className="p-4 bg-white border hover:shadow-md transition-shadow">
              <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Messages</p>
              <p className="text-3xl font-bold text-teal-600">{rollupData.team_metrics.messages || 0}</p>
            </Card>
          </div>
        </div>
      )}

      {/* Summary Stats - Only for Daily View */}
      {viewMode === 'daily' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-white border hover:shadow-md transition-shadow">
            <p className="text-xs text-muted-foreground font-medium mb-2">Completion Rate</p>
            <p className="text-3xl font-bold text-primary">{completionRate}%</p>
          </Card>
          <Card className="p-4 bg-white border hover:shadow-md transition-shadow">
            <p className="text-xs text-muted-foreground font-medium mb-2">Total Team</p>
            <p className="text-3xl font-bold text-primary">{totalCount}</p>
          </Card>
          <Card className="p-4 bg-white border hover:shadow-md transition-shadow">
            <p className="text-xs text-muted-foreground font-medium mb-2">Submitted</p>
            <p className="text-3xl font-bold text-green-600">{submittedCount}</p>
          </Card>
          <Card className="p-4 bg-white border hover:shadow-md transition-shadow">
            <p className="text-xs text-muted-foreground font-medium mb-2">Missing</p>
            <p className="text-3xl font-bold text-red-600">{totalCount - submittedCount}</p>
          </Card>
        </div>
      )}

      {/* AI Summary Section */}
      {filteredData.length > 0 && (
        <Card className="p-6 border-2 border-primary/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-bold">AI Consolidated Summary</h3>
            </div>
            <Button
              onClick={generateSummary}
              disabled={generatingSummary}
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
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-6 border border-primary/20">
              <div className="space-y-4 text-sm leading-relaxed">
                {aiSummary.split('\n\n').map((paragraph, index) => {
                  const cleanParagraph = paragraph.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-base block mb-2">$1</strong>');
                  return (
                    <div key={index} dangerouslySetInnerHTML={{ __html: cleanParagraph }} className="text-foreground" />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 border-2 border-dashed border-muted rounded-lg">
              <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Click "Generate Summary" to get AI-powered {viewMode} consolidated view
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Individual Status Cards */}
      {filteredData.length === 0 ? (
        <Card className="p-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No status updates available for selected filters</p>
        </Card>
      ) : viewMode === 'daily' ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Individual Team Updates</h2>
          {filteredData.map((status, index) => {
            const userName = status.user_name || 'Unknown';
            const userInitial = userName[0] ? userName[0].toUpperCase() : '?';
            
            return (
              <Card key={`status-${index}`} className="p-5">
                <div className="flex items-start justify-between mb-4 pb-3 border-b">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {userInitial}
                    </div>
                    <div>
                      <p className="font-bold">{userName}</p>
                      <p className="text-xs text-muted-foreground">{status.user_designation}</p>
                      <p className="text-xs text-primary">{status.user_territory}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(status.created_at), 'h:mm a')}
                  </p>
                </div>

                {status.yesterday_updates && (
                  <div className="mb-3 pb-3 border-b">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">UPDATES</p>
                    <p className="text-sm leading-relaxed">{status.yesterday_updates}</p>
                  </div>
                )}

                {status.today_actions && (
                  <div className="mb-3 pb-3 border-b">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">ACTION ITEMS</p>
                    <p className="text-sm leading-relaxed">{status.today_actions}</p>
                  </div>
                )}

                {status.help_needed && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <AlertCircle className="h-3 w-3 text-amber-600" />
                      <p className="text-xs font-semibold text-amber-800">HELP NEEDED</p>
                    </div>
                    <p className="text-sm text-amber-900">{status.help_needed}</p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground text-center">
            {viewMode === 'weekly' ? 'Weekly' : 'Monthly'} detailed view - Use AI Summary above for consolidated insights
          </p>
        </Card>
      )}
    </div>
  );
}
