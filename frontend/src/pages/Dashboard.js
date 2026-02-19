import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { 
  LayoutDashboard, Filter, Loader2, 
  MapPin, Phone, UserPlus, CheckCircle, XCircle, TrendingUp,
  Clock, MessageSquare, Target, ThumbsUp, ThumbsDown, Calendar
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const TIME_FILTERS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'lifetime', label: 'Lifetime' },
];

const TERRITORY_MAP = {
  'North India': { states: { 'Delhi': ['New Delhi'], 'Uttar Pradesh': ['Noida'] } },
  'South India': { states: { 'Karnataka': ['Bengaluru'], 'Tamil Nadu': ['Chennai'], 'Telangana': ['Hyderabad'] } },
  'West India': { states: { 'Maharashtra': ['Mumbai', 'Pune'], 'Gujarat': ['Ahmedabad'] } },
  'East India': { states: { 'West Bengal': ['Kolkata'] } }
};

const STATUS_CONFIG = {
  new: { label: 'New', color: 'blue', icon: UserPlus },
  contacted: { label: 'Contacted', color: 'yellow', icon: MessageSquare },
  qualified: { label: 'Qualified', color: 'green', icon: ThumbsUp },
  not_qualified: { label: 'Not Qualified', color: 'gray', icon: ThumbsDown },
  in_progress: { label: 'In Progress', color: 'purple', icon: Clock },
  trial_in_progress: { label: 'Trial', color: 'indigo', icon: Target },
  proposal_stage: { label: 'Proposal', color: 'orange', icon: TrendingUp },
  won: { label: 'Won', color: 'emerald', icon: CheckCircle },
  lost: { label: 'Lost', color: 'red', icon: XCircle },
  future_followup: { label: 'Follow Up', color: 'slate', icon: Calendar },
};

const COLOR_CLASSES = {
  blue: 'from-blue-50 to-blue-100 border-blue-200 text-blue-700',
  yellow: 'from-yellow-50 to-yellow-100 border-yellow-200 text-yellow-700',
  green: 'from-green-50 to-green-100 border-green-200 text-green-700',
  gray: 'from-gray-50 to-gray-100 border-gray-200 text-gray-600',
  purple: 'from-purple-50 to-purple-100 border-purple-200 text-purple-700',
  indigo: 'from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-700',
  orange: 'from-orange-50 to-orange-100 border-orange-200 text-orange-700',
  emerald: 'from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-700',
  red: 'from-red-50 to-red-100 border-red-200 text-red-700',
  slate: 'from-slate-50 to-slate-100 border-slate-200 text-slate-700',
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salesTeam, setSalesTeam] = useState([]);
  
  const [timeFilter, setTimeFilter] = useState('this_month');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [salesResource, setSalesResource] = useState('all');

  useEffect(() => {
    fetchSalesTeam();
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [timeFilter, territoryFilter, stateFilter, cityFilter, salesResource]);

  const fetchSalesTeam = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`, { withCredentials: true });
      setSalesTeam(response.data.filter(u => ['Head of Business', 'Regional Sales Manager', 'National Sales Head'].includes(u.role) && u.is_active));
    } catch (error) {
      console.error('Failed to load team');
    }
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        time_filter: timeFilter,
        ...(territoryFilter !== 'all' && { territory: territoryFilter }),
        ...(stateFilter !== 'all' && { state: stateFilter }),
        ...(cityFilter !== 'all' && { city: cityFilter }),
        ...(salesResource !== 'all' && { sales_resource: salesResource })
      });
      
      const response = await axios.get(`${API_URL}/analytics/dashboard?${params}`, { withCredentials: true });
      setAnalytics(response.data);
    } catch (error) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setTimeFilter('this_month');
    setTerritoryFilter('all');
    setStateFilter('all');
    setCityFilter('all');
    setSalesResource('all');
  };

  const availableTerritories = user?.territory === 'All India' || ['ceo', 'director', 'vp', 'admin'].includes(user?.role)
    ? ['All Territories', 'North India', 'South India', 'West India', 'East India']
    : user?.territory ? ['All Territories', user.territory] : ['All Territories'];

  const availableStates = territoryFilter !== 'all' && territoryFilter !== 'All Territories' && TERRITORY_MAP[territoryFilter]
    ? ['All States', ...Object.keys(TERRITORY_MAP[territoryFilter].states)]
    : ['All States'];

  const availableCities = stateFilter !== 'all' && stateFilter !== 'All States' && territoryFilter !== 'all' && territoryFilter !== 'All Territories' && TERRITORY_MAP[territoryFilter]
    ? ['All Cities', ...(TERRITORY_MAP[territoryFilter].states[stateFilter] || [])]
    : ['All Cities'];

  // Calculate total leads from status distribution
  const totalLeads = analytics?.status_distribution 
    ? Object.values(analytics.status_distribution).reduce((sum, val) => sum + val, 0)
    : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="sales-overview-dashboard">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          Sales Overview
        </h1>
        <p className="text-muted-foreground mt-1">Overview of your sales pipeline</p>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Filters</span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Time Period</label>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
            >
              {TIME_FILTERS.map(tf => (
                <option key={tf.value} value={tf.value}>{tf.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Territory</label>
            <select
              value={territoryFilter}
              onChange={(e) => { setTerritoryFilter(e.target.value); setStateFilter('all'); setCityFilter('all'); }}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
            >
              {availableTerritories.map(t => (
                <option key={t} value={t === 'All Territories' ? 'all' : t}>{t}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">State</label>
            <select
              value={stateFilter}
              onChange={(e) => { setStateFilter(e.target.value); setCityFilter('all'); }}
              disabled={territoryFilter === 'all'}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm disabled:opacity-50"
            >
              {availableStates.map(s => (
                <option key={s} value={s === 'All States' ? 'all' : s}>{s}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">City</label>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              disabled={stateFilter === 'all'}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm disabled:opacity-50"
            >
              {availableCities.map(c => (
                <option key={c} value={c === 'All Cities' ? 'all' : c}>{c}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Sales Resource</label>
            <select
              value={salesResource}
              onChange={(e) => setSalesResource(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
            >
              <option value="all">All Resources</option>
              {salesTeam.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <Button variant="outline" onClick={handleResetFilters} className="w-full">
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Activity Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-4 bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-teal-600" />
                <p className="text-xs font-medium text-teal-600">VISITS</p>
              </div>
              <p className="text-2xl font-bold text-teal-700">{analytics?.total_visits || 0}</p>
              <p className="text-xs text-teal-600 mt-1">{analytics?.unique_visits || 0} unique</p>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="h-4 w-4 text-cyan-600" />
                <p className="text-xs font-medium text-cyan-600">CALLS</p>
              </div>
              <p className="text-2xl font-bold text-cyan-700">{analytics?.total_calls || 0}</p>
              <p className="text-xs text-cyan-600 mt-1">{analytics?.unique_calls || 0} unique</p>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200">
              <div className="flex items-center gap-2 mb-2">
                <UserPlus className="h-4 w-4 text-violet-600" />
                <p className="text-xs font-medium text-violet-600">NEW LEADS</p>
              </div>
              <p className="text-2xl font-bold text-violet-700">{analytics?.new_leads_added || 0}</p>
              <p className="text-xs text-violet-600 mt-1">this period</p>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-amber-600" />
                <p className="text-xs font-medium text-amber-600">PIPELINE VALUE</p>
              </div>
              <p className="text-2xl font-bold text-amber-700">
                ₹{((analytics?.pipeline_value || 0) / 100000).toFixed(1)}L
              </p>
              <p className="text-xs text-amber-600 mt-1">total value</p>
            </Card>
          </div>

          {/* Lead Status Distribution */}
          <Card className="p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Lead Status Distribution</h3>
                <p className="text-sm text-muted-foreground">{totalLeads} total leads</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                const count = analytics?.status_distribution?.[key] || 0;
                const percentage = totalLeads > 0 ? ((count / totalLeads) * 100).toFixed(0) : 0;
                const Icon = config.icon;
                const colorClass = COLOR_CLASSES[config.color];
                
                return (
                  <div
                    key={key}
                    onClick={() => navigate(`/leads?status=${key}`)}
                    className={`p-3 rounded-xl bg-gradient-to-br border cursor-pointer hover:shadow-md transition-all ${colorClass}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="h-4 w-4 opacity-70" />
                      <span className="text-xs font-medium truncate">{config.label}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold">{count}</span>
                      <span className="text-xs opacity-70">/ {totalLeads}</span>
                    </div>
                    <div className="mt-1">
                      <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-current opacity-50 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <p className="text-xs font-medium mt-1">{percentage}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Quick Summary */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-emerald-200 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-emerald-700" />
                </div>
                <div>
                  <p className="text-xs font-medium text-emerald-600">WON</p>
                  <p className="text-3xl font-bold text-emerald-700">{analytics?.leads_won || 0}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-2xl font-bold text-emerald-700">
                    {totalLeads > 0 ? ((analytics?.leads_won || 0) / totalLeads * 100).toFixed(0) : 0}%
                  </p>
                  <p className="text-xs text-emerald-600">win rate</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-red-200 flex items-center justify-center">
                  <XCircle className="h-6 w-6 text-red-700" />
                </div>
                <div>
                  <p className="text-xs font-medium text-red-600">LOST</p>
                  <p className="text-3xl font-bold text-red-700">{analytics?.leads_lost || 0}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-2xl font-bold text-red-700">
                    {totalLeads > 0 ? ((analytics?.leads_lost || 0) / totalLeads * 100).toFixed(0) : 0}%
                  </p>
                  <p className="text-xs text-red-600">loss rate</p>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
