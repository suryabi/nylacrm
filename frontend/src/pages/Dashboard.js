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
import { useMasterLocations } from '../hooks/useMasterLocations';

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

const STATUS_CONFIG = {
  new: { label: 'New', color: 'blue', icon: UserPlus },
  contacted: { label: 'Contacted', color: 'yellow', icon: MessageSquare },
  qualified: { label: 'Qualified', color: 'green', icon: ThumbsUp },
  not_qualified: { label: 'Not Qualified', color: 'gray', icon: ThumbsDown },
  in_progress: { label: 'In Progress', color: 'purple', icon: Clock },
  trial_in_progress: { label: 'Trial', color: 'indigo', icon: Target },
  proposal_shared: { label: 'Proposal Shared', color: 'orange', icon: TrendingUp },
  proposal_approved_by_customer: { label: 'Proposal Approved', color: 'teal', icon: CheckCircle },
  won: { label: 'Won', color: 'emerald', icon: CheckCircle },
  lost: { label: 'Lost', color: 'red', icon: XCircle },
  future_followup: { label: 'Follow Up', color: 'slate', icon: Calendar },
};

const COLOR_CLASSES = {
  blue: 'from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-700/50 text-blue-700 dark:text-blue-400',
  yellow: 'from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/20 border-yellow-200 dark:border-yellow-700/50 text-yellow-700 dark:text-yellow-400',
  green: 'from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-700/50 text-green-700 dark:text-green-400',
  gray: 'from-gray-50 to-gray-100 dark:from-gray-900/30 dark:to-gray-800/20 border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-400',
  purple: 'from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-700/50 text-purple-700 dark:text-purple-400',
  indigo: 'from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/20 border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-400',
  orange: 'from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/20 border-orange-200 dark:border-orange-700/50 text-orange-700 dark:text-orange-400',
  teal: 'from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-800/20 border-teal-200 dark:border-teal-700/50 text-teal-700 dark:text-teal-400',
  emerald: 'from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400',
  red: 'from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400',
  slate: 'from-slate-50 to-slate-100 dark:from-slate-900/30 dark:to-slate-800/20 border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-400',
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salesTeam, setSalesTeam] = useState([]);
  
  const [timeFilter, setTimeFilter] = useState('this_week');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [salesResource, setSalesResource] = useState('all');

  // Master locations from API
  const { 
    territories: masterTerritories, 
    getStateNamesByTerritoryName, 
    getCityNamesByStateName 
  } = useMasterLocations();

  useEffect(() => {
    fetchSalesTeam();
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [timeFilter, territoryFilter, stateFilter, cityFilter, salesResource]);

  const fetchSalesTeam = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`, { withCredentials: true });
      setSalesTeam(response.data.filter(u => ['Head of Business', 'Regional Sales Manager', 'National Sales Head', 'Partner - Sales'].includes(u.role) && u.is_active));
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

  const availableTerritories = user?.territory === 'All India' || ['CEO', 'Director', 'Vice President', 'System Admin'].includes(user?.role)
    ? ['All Territories', ...masterTerritories.map(t => t.name)]
    : user?.territory ? ['All Territories', user.territory] : ['All Territories'];

  const availableStates = territoryFilter !== 'all' && territoryFilter !== 'All Territories'
    ? ['All States', ...getStateNamesByTerritoryName(territoryFilter)]
    : ['All States'];

  const availableCities = stateFilter !== 'all' && stateFilter !== 'All States'
    ? ['All Cities', ...getCityNamesByStateName(stateFilter)]
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
            <Card className="p-4 bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-800/20 border-teal-200 dark:border-teal-700/50">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <p className="text-xs font-medium text-teal-600 dark:text-teal-400">VISITS</p>
              </div>
              <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{analytics?.total_visits || 0}</p>
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">{analytics?.unique_visits || 0} unique</p>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/30 dark:to-cyan-800/20 border-cyan-200 dark:border-cyan-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400">CALLS</p>
              </div>
              <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-300">{analytics?.total_calls || 0}</p>
              <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">{analytics?.unique_calls || 0} unique</p>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-900/30 dark:to-violet-800/20 border-violet-200 dark:border-violet-700/50">
              <div className="flex items-center gap-2 mb-2">
                <UserPlus className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <p className="text-xs font-medium text-violet-600 dark:text-violet-400">NEW LEADS</p>
              </div>
              <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">{analytics?.new_leads_added || 0}</p>
              <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">this period</p>
            </Card>
            <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border-amber-200 dark:border-amber-700/50">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">PIPELINE VALUE</p>
              </div>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                ₹{((analytics?.pipeline_value || 0) / 100000).toFixed(1)}L
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">total value</p>
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
                  <p className="text-3xl font-bold text-emerald-700">{analytics?.status_distribution?.won || 0}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-2xl font-bold text-emerald-700">
                    {totalLeads > 0 ? ((analytics?.status_distribution?.won || 0) / totalLeads * 100).toFixed(0) : 0}%
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
                  <p className="text-3xl font-bold text-red-700">{analytics?.status_distribution?.lost || 0}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-2xl font-bold text-red-700">
                    {totalLeads > 0 ? ((analytics?.status_distribution?.lost || 0) / totalLeads * 100).toFixed(0) : 0}%
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
