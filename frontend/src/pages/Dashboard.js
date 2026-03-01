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
import { useLeadStatuses } from '../hooks/useLeadStatuses';

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

// Icon mapping for status colors
const STATUS_ICONS = {
  blue: UserPlus,
  green: ThumbsUp,
  yellow: MessageSquare,
  purple: Clock,
  cyan: TrendingUp,
  orange: TrendingUp,
  indigo: Target,
  emerald: CheckCircle,
  red: XCircle,
  gray: ThumbsDown,
  pink: Target,
  teal: Target,
};

const COLOR_CLASSES = {
  blue: 'from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-700/50 text-blue-700 dark:text-blue-400',
  yellow: 'from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/20 border-yellow-200 dark:border-yellow-700/50 text-yellow-700 dark:text-yellow-400',
  green: 'from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-700/50 text-green-700 dark:text-green-400',
  gray: 'from-gray-50 to-gray-100 dark:from-gray-900/30 dark:to-gray-800/20 border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-400',
  purple: 'from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-700/50 text-purple-700 dark:text-purple-400',
  cyan: 'from-cyan-50 to-cyan-100 dark:from-cyan-900/30 dark:to-cyan-800/20 border-cyan-200 dark:border-cyan-700/50 text-cyan-700 dark:text-cyan-400',
  indigo: 'from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/20 border-indigo-200 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-400',
  orange: 'from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/20 border-orange-200 dark:border-orange-700/50 text-orange-700 dark:text-orange-400',
  emerald: 'from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/20 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-400',
  red: 'from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-400',
  pink: 'from-pink-50 to-pink-100 dark:from-pink-900/30 dark:to-pink-800/20 border-pink-200 dark:border-pink-700/50 text-pink-700 dark:text-pink-400',
  teal: 'from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-800/20 border-teal-200 dark:border-teal-700/50 text-teal-700 dark:text-teal-400',
};

// Helper to get icon for a color
const getIconForColor = (color) => STATUS_ICONS[color] || Target;

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salesTeam, setSalesTeam] = useState([]);
  const { statuses } = useLeadStatuses();
  
  const [timeFilter, setTimeFilter] = useState('this_week');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [salesResource, setSalesResource] = useState('all');

  const { territories: masterTerritories, getStateNamesByTerritoryName, getCityNamesByStateName } = useMasterLocations();

  useEffect(() => { fetchSalesTeam(); }, []);
  useEffect(() => { fetchAnalytics(); }, [timeFilter, territoryFilter, stateFilter, cityFilter, salesResource]);

  const fetchSalesTeam = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`, { withCredentials: true });
      setSalesTeam(response.data.filter(u => ['Head of Business', 'Regional Sales Manager', 'National Sales Head', 'Partner - Sales'].includes(u.role) && u.is_active));
    } catch (error) { console.error('Failed to load team'); }
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
    } catch (error) { toast.error('Failed to load analytics'); }
    finally { setLoading(false); }
  };

  const handleResetFilters = () => {
    setTimeFilter('this_month');
    setTerritoryFilter('all');
    setStateFilter('all');
    setCityFilter('all');
    setSalesResource('all');
  };

  const availableTerritories = user?.territory === 'All India' || ['CEO', 'Director', 'Vice President', 'System Admin'].includes(user?.role)
    ? ['All Territories', ...masterTerritories.map(t => t.name)] : user?.territory ? ['All Territories', user.territory] : ['All Territories'];
  const availableStates = territoryFilter !== 'all' && territoryFilter !== 'All Territories' ? ['All States', ...getStateNamesByTerritoryName(territoryFilter)] : ['All States'];
  const availableCities = stateFilter !== 'all' && stateFilter !== 'All States' ? ['All Cities', ...getCityNamesByStateName(stateFilter)] : ['All Cities'];

  const totalLeads = analytics?.status_distribution ? Object.values(analytics.status_distribution).reduce((sum, val) => sum + val, 0) : 0;

  const activityStats = [
    { label: 'Visits', value: analytics?.total_visits || 0, sub: `${analytics?.unique_visits || 0} unique`, icon: MapPin, gradient: 'from-teal-500 to-cyan-600', bgGradient: 'from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/20', iconBg: 'bg-teal-100 dark:bg-teal-900/50', textColor: 'text-teal-700 dark:text-teal-300' },
    { label: 'Calls', value: analytics?.total_calls || 0, sub: `${analytics?.unique_calls || 0} unique`, icon: Phone, gradient: 'from-cyan-500 to-blue-600', bgGradient: 'from-cyan-50 to-blue-50 dark:from-cyan-950/30 dark:to-blue-950/20', iconBg: 'bg-cyan-100 dark:bg-cyan-900/50', textColor: 'text-cyan-700 dark:text-cyan-300' },
    { label: 'New Leads', value: analytics?.new_leads_added || 0, sub: 'this period', icon: UserPlus, gradient: 'from-violet-500 to-purple-600', bgGradient: 'from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20', iconBg: 'bg-violet-100 dark:bg-violet-900/50', textColor: 'text-violet-700 dark:text-violet-300' },
    { label: 'Pipeline Value', value: `₹${((analytics?.pipeline_value || 0) / 100000).toFixed(1)}L`, sub: 'total value', icon: TrendingUp, gradient: 'from-amber-500 to-orange-600', bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20', iconBg: 'bg-amber-100 dark:bg-amber-900/50', textColor: 'text-amber-700 dark:text-amber-300' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="sales-overview-dashboard">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-900/50 dark:to-cyan-900/30">
              <LayoutDashboard className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Sales Overview</h1>
              <p className="text-muted-foreground">Overview of your sales pipeline</p>
            </div>
          </div>
        </header>

        {/* Filters */}
        <Card className="mb-6 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">Filters</span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Time Period</label>
                <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                  {TIME_FILTERS.map(tf => <option key={tf.value} value={tf.value}>{tf.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Territory</label>
                <select value={territoryFilter} onChange={(e) => { setTerritoryFilter(e.target.value); setStateFilter('all'); setCityFilter('all'); }} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                  {availableTerritories.map(t => <option key={t} value={t === 'All Territories' ? 'all' : t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">State</label>
                <select value={stateFilter} onChange={(e) => { setStateFilter(e.target.value); setCityFilter('all'); }} disabled={territoryFilter === 'all'} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm disabled:opacity-50 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                  {availableStates.map(s => <option key={s} value={s === 'All States' ? 'all' : s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">City</label>
                <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} disabled={stateFilter === 'all'} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm disabled:opacity-50 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                  {availableCities.map(c => <option key={c} value={c === 'All Cities' ? 'all' : c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Sales Resource</label>
                <select value={salesResource} onChange={(e) => setSalesResource(e.target.value)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                  <option value="all">All Resources</option>
                  {salesTeam.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={handleResetFilters} className="w-full h-[38px] border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Reset</Button>
              </div>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative"><div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" /><Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" /></div>
            <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading data...</p>
          </div>
        ) : (
          <>
            {/* Activity Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {activityStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <Card key={stat.label} className={`relative overflow-hidden border-0 bg-gradient-to-br ${stat.bgGradient} backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5`}>
                    <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient}`} />
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                          <p className={`text-2xl lg:text-3xl font-bold ${stat.textColor} tabular-nums`}>{stat.value}</p>
                          <p className="text-xs text-muted-foreground">{stat.sub}</p>
                        </div>
                        <div className={`p-2.5 rounded-xl ${stat.iconBg}`}><Icon className={`h-5 w-5 ${stat.textColor}`} /></div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Lead Status Distribution */}
            <Card className="mb-6 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
              <div className="p-5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Lead Status Distribution</h3>
                    <p className="text-sm text-muted-foreground">{totalLeads} total leads</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
                  {statuses.map((status) => {
                    const count = analytics?.status_distribution?.[status.id] || 0;
                    const percentage = totalLeads > 0 ? ((count / totalLeads) * 100).toFixed(0) : 0;
                    const Icon = getIconForColor(status.color);
                    const colorClass = COLOR_CLASSES[status.color] || COLOR_CLASSES.gray;
                    
                    return (
                      <div
                        key={status.id}
                        onClick={() => navigate(`/leads?status=${status.id}`)}
                        className={`p-3 rounded-xl bg-gradient-to-br border cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 ${colorClass}`}
                        data-testid={`status-card-${status.id}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className="h-4 w-4 opacity-70" />
                          <span className="text-xs font-medium truncate">{status.label}</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-bold">{count}</span>
                          <span className="text-xs opacity-70">/ {totalLeads}</span>
                        </div>
                        <div className="mt-2">
                          <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
                            <div className="h-full bg-current opacity-50 rounded-full transition-all" style={{ width: `${percentage}%` }} />
                          </div>
                          <p className="text-xs font-medium mt-1">{percentage}%</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Quick Summary - Won/Lost */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/20 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-green-600" />
                <div className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-green-200 dark:from-emerald-900/50 dark:to-green-900/30 flex items-center justify-center shadow-sm">
                      <CheckCircle className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Won Deals</p>
                      <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{analytics?.status_distribution?.won || 0}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                        {totalLeads > 0 ? ((analytics?.status_distribution?.won || 0) / totalLeads * 100).toFixed(0) : 0}%
                      </p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">win rate</p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/20 backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 to-rose-600" />
                <div className="p-5">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-red-100 to-rose-200 dark:from-red-900/50 dark:to-rose-900/30 flex items-center justify-center shadow-sm">
                      <XCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">Lost Deals</p>
                      <p className="text-3xl font-bold text-red-700 dark:text-red-300">{analytics?.status_distribution?.lost || 0}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                        {totalLeads > 0 ? ((analytics?.status_distribution?.lost || 0) / totalLeads * 100).toFixed(0) : 0}%
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400">loss rate</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
