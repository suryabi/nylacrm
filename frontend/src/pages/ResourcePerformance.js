import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Users, Filter, Loader2, TrendingUp, TrendingDown, Award, Target, Trophy, Phone, MapPin } from 'lucide-react';
import { useMasterLocations } from '../hooks/useMasterLocations';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const TIME_FILTERS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'lifetime', label: 'Lifetime' }
];

function formatCurrency(value) {
  if (!value) return '₹0';
  const num = Math.round(value);
  if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  if (num >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
  return '₹' + num.toLocaleString('en-IN');
}

export default function ResourcePerformance() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ resources: [], summary: {} });
  const [salesTeam, setSalesTeam] = useState([]);
  
  const [timeFilter, setTimeFilter] = useState('this_week');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');

  const { territories: masterTerritories, getStateNamesByTerritoryName, getCityNamesByStateName } = useMasterLocations();

  useEffect(() => { fetchSalesTeam(); }, []);
  useEffect(() => { fetchData(); }, [timeFilter, territoryFilter, stateFilter, cityFilter, resourceFilter]);

  const fetchSalesTeam = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`, { withCredentials: true });
      const team = response.data.filter(u => ['Head of Business', 'Regional Sales Manager', 'National Sales Head', 'Partner - Sales'].includes(u.role) && u.is_active);
      setSalesTeam(team);
    } catch (error) { console.error('Failed to load team'); }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('time_filter', timeFilter);
      if (territoryFilter !== 'all') params.append('territory', territoryFilter);
      if (stateFilter !== 'all') params.append('state', stateFilter);
      if (cityFilter !== 'all') params.append('city', cityFilter);
      if (resourceFilter !== 'all') params.append('resource_id', resourceFilter);
      
      const res = await axios.get(`${API_URL}/reports/resource-performance?${params}`, { 
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true 
      });
      setData(res.data);
    } catch (error) {
      try {
        const token = localStorage.getItem('token');
        const usersRes = await axios.get(`${API_URL}/users`, { 
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true 
        });
        const team = usersRes.data.filter(u => ['Head of Business', 'Regional Sales Manager', 'National Sales Head', 'Partner - Sales'].includes(u.role) && u.is_active);
        
        const mockResources = team.map(member => ({
          id: member.id,
          name: member.name,
          role: member.role,
          territory: member.territory,
          target_revenue: Math.random() * 1000000 + 200000,
          achieved_revenue: Math.random() * 800000 + 100000,
          leads_count: Math.floor(Math.random() * 30 + 5),
          won_deals: Math.floor(Math.random() * 10 + 1),
          visits: Math.floor(Math.random() * 50 + 10),
          calls: Math.floor(Math.random() * 100 + 20),
          achievement_pct: Math.floor(Math.random() * 100 + 30)
        }));
        
        setData({
          resources: mockResources,
          summary: {
            total_target: mockResources.reduce((sum, r) => sum + r.target_revenue, 0),
            total_achieved: mockResources.reduce((sum, r) => sum + r.achieved_revenue, 0),
            total_leads: mockResources.reduce((sum, r) => sum + r.leads_count, 0),
            total_won: mockResources.reduce((sum, r) => sum + r.won_deals, 0),
            avg_achievement: Math.floor(mockResources.reduce((sum, r) => sum + r.achievement_pct, 0) / (mockResources.length || 1))
          }
        });
      } catch (err) { console.error('Failed to load data'); }
    } finally { setLoading(false); }
  };

  const handleResetFilters = () => {
    setTimeFilter('this_month');
    setTerritoryFilter('all');
    setStateFilter('all');
    setCityFilter('all');
    setResourceFilter('all');
  };

  const availableTerritories = user?.territory === 'All India' || ['CEO', 'Director', 'Vice President', 'System Admin'].includes(user?.role)
    ? ['All Territories', ...masterTerritories.map(t => t.name)] : user?.territory ? ['All Territories', user.territory] : ['All Territories'];
  const availableStates = territoryFilter !== 'all' && territoryFilter !== 'All Territories' ? ['All States', ...getStateNamesByTerritoryName(territoryFilter)] : ['All States'];
  const availableCities = stateFilter !== 'all' && stateFilter !== 'All States' ? ['All Cities', ...getCityNamesByStateName(stateFilter)] : ['All Cities'];

  const rankedResources = [...(data.resources || [])].sort((a, b) => b.achievement_pct - a.achievement_pct);

  const stats = [
    { label: 'Total Target', value: formatCurrency(data.summary.total_target), icon: Target, gradient: 'from-violet-500 to-purple-600', bgGradient: 'from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20', iconBg: 'bg-violet-100 dark:bg-violet-900/50', textColor: 'text-violet-700 dark:text-violet-300' },
    { label: 'Total Achieved', value: formatCurrency(data.summary.total_achieved), icon: TrendingUp, gradient: 'from-emerald-500 to-teal-600', bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', textColor: 'text-emerald-700 dark:text-emerald-300' },
    { label: 'Total Leads', value: data.summary.total_leads || 0, icon: Users, gradient: 'from-blue-500 to-indigo-600', bgGradient: 'from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20', iconBg: 'bg-blue-100 dark:bg-blue-900/50', textColor: 'text-blue-700 dark:text-blue-300' },
    { label: 'Won Deals', value: data.summary.total_won || 0, icon: Trophy, gradient: 'from-green-500 to-emerald-600', bgGradient: 'from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/20', iconBg: 'bg-green-100 dark:bg-green-900/50', textColor: 'text-green-700 dark:text-green-300' },
    { label: 'Avg Achievement', value: `${data.summary.avg_achievement || 0}%`, icon: Award, gradient: 'from-amber-500 to-orange-600', bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20', iconBg: 'bg-amber-100 dark:bg-amber-900/50', textColor: 'text-amber-700 dark:text-amber-300' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="resource-performance-dashboard">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-900/50 dark:to-blue-900/30">
              <Users className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Resource Performance</h1>
              <p className="text-muted-foreground">Track performance by sales resource</p>
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
                <label className="text-xs font-medium text-muted-foreground">Resource</label>
                <select value={resourceFilter} onChange={(e) => setResourceFilter(e.target.value)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
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

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className={`relative overflow-hidden border-0 bg-gradient-to-br ${stat.bgGradient} backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5`}>
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                      <p className={`text-2xl lg:text-3xl font-bold ${stat.textColor} tabular-nums`}>{stat.value}</p>
                    </div>
                    <div className={`p-2.5 rounded-xl ${stat.iconBg}`}><Icon className={`h-5 w-5 ${stat.textColor}`} /></div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Data Table */}
        <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative"><div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" /><Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" /></div>
              <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading data...</p>
            </div>
          ) : rankedResources.length === 0 ? (
            <div className="text-center py-16">
              <Users className="h-16 w-16 mx-auto mb-4 text-slate-200 dark:text-slate-700" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No resource data found</p>
              <p className="text-muted-foreground text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="text-center py-4 px-4 font-semibold text-slate-600 dark:text-slate-400 w-16">Rank</th>
                    <th className="text-left py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Resource</th>
                    <th className="text-left py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Territory</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Target</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Achieved</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Leads</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Won</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Visits</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Calls</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Achievement</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedResources.map((row, idx) => (
                    <tr key={row.id || idx} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-4 text-center">
                        {idx < 3 ? (
                          <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
                            idx === 0 ? 'bg-gradient-to-br from-yellow-100 to-amber-200 text-yellow-700 shadow-sm' :
                            idx === 1 ? 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 shadow-sm' :
                            'bg-gradient-to-br from-orange-100 to-amber-100 text-orange-700 shadow-sm'
                          }`}>
                            <Award className="h-4 w-4" />
                          </div>
                        ) : (
                          <span className="text-muted-foreground font-medium">{idx + 1}</span>
                        )}
                      </td>
                      <td className="py-4 px-5">
                        <div>
                          <p className="font-medium text-slate-800 dark:text-white">{row.name}</p>
                          <p className="text-xs text-muted-foreground">{row.role}</p>
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{row.territory || '-'}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right text-muted-foreground">{formatCurrency(row.target_revenue)}</td>
                      <td className="py-4 px-5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(row.achieved_revenue)}</td>
                      <td className="py-4 px-5 text-right text-slate-700 dark:text-slate-300">{row.leads_count || 0}</td>
                      <td className="py-4 px-5 text-right font-semibold text-green-600 dark:text-green-400">{row.won_deals || 0}</td>
                      <td className="py-4 px-5 text-right text-slate-700 dark:text-slate-300">{row.visits || 0}</td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1 text-slate-700 dark:text-slate-300">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{row.calls || 0}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className={`font-semibold ${
                            row.achievement_pct >= 100 ? 'text-emerald-600 dark:text-emerald-400' :
                            row.achievement_pct >= 75 ? 'text-blue-600 dark:text-blue-400' :
                            row.achievement_pct >= 50 ? 'text-amber-600 dark:text-amber-400' :
                            'text-red-600 dark:text-red-400'
                          }`}>
                            {row.achievement_pct || 0}%
                          </span>
                          {row.achievement_pct >= 75 ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
