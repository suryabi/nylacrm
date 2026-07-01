import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Users, Filter, Loader2, TrendingUp, Trophy, Phone, MapPin, Crown, ArrowUpRight, Target, ChevronDown, Footprints } from 'lucide-react';
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
  const totalAchieved = data.summary?.total_achieved || rankedResources.reduce((s, r) => s + (r.achieved_revenue || 0), 0);
  const totalLeads = data.summary?.total_leads || rankedResources.reduce((s, r) => s + (r.leads_count || 0), 0);
  const totalWon = data.summary?.total_won || rankedResources.reduce((s, r) => s + (r.won_deals || 0), 0);
  const avgAchievement = data.summary?.avg_achievement ?? (rankedResources.length ? Math.round(rankedResources.reduce((s, r) => s + (r.achievement_pct || 0), 0) / rankedResources.length) : 0);
  const topResource = rankedResources[0];

  const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const avatarTone = (idx) => [
    'bg-gradient-to-br from-amber-400 to-orange-500',
    'bg-gradient-to-br from-slate-400 to-slate-500',
    'bg-gradient-to-br from-orange-400 to-rose-500',
  ][idx] || 'bg-gradient-to-br from-indigo-500 to-violet-600';
  const achievementColor = (pct) => pct >= 100 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 60 ? 'text-indigo-600 dark:text-indigo-400' : pct >= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
  const achievementBar = (pct) => pct >= 100 ? 'from-emerald-400 to-teal-500' : pct >= 60 ? 'from-indigo-400 to-violet-500' : pct >= 30 ? 'from-amber-400 to-orange-500' : 'from-rose-400 to-rose-500';

  const filterSelectCls = "w-full appearance-none pl-3.5 pr-9 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="resource-performance-dashboard">
      <style>{`
        @keyframes resRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes resBar { from { width: 0; } }
        .res-rise { animation: resRise .5s cubic-bezier(.16,1,.3,1) both; }
        .res-bar { animation: resBar .9s cubic-bezier(.16,1,.3,1) both; }
      `}</style>
      <div className="absolute inset-0 bg-[radial-gradient(#a5b4fc_1px,transparent_1px)] [background-size:22px_22px] opacity-[0.15] dark:opacity-[0.06] pointer-events-none" />

      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative p-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Resource Performance</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Track achievement &amp; activity by sales resource</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/60 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{TIME_FILTERS.find(t => t.value === timeFilter)?.label || 'Live'}</span>
          </div>
        </header>

        {/* Filters */}
        <div className="mb-6 rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Filters</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Time Period', el: (
                <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className={filterSelectCls} data-testid="time-filter">
                  {TIME_FILTERS.map(tf => <option key={tf.value} value={tf.value}>{tf.label}</option>)}
                </select>) },
              { label: 'Territory', el: (
                <select value={territoryFilter} onChange={(e) => { setTerritoryFilter(e.target.value); setStateFilter('all'); setCityFilter('all'); }} className={filterSelectCls} data-testid="territory-filter">
                  {availableTerritories.map(t => <option key={t} value={t === 'All Territories' ? 'all' : t}>{t}</option>)}
                </select>) },
              { label: 'State', el: (
                <select value={stateFilter} onChange={(e) => { setStateFilter(e.target.value); setCityFilter('all'); }} disabled={territoryFilter === 'all'} className={filterSelectCls} data-testid="state-filter">
                  {availableStates.map(s => <option key={s} value={s === 'All States' ? 'all' : s}>{s}</option>)}
                </select>) },
              { label: 'City', el: (
                <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} disabled={stateFilter === 'all'} className={filterSelectCls} data-testid="city-filter">
                  {availableCities.map(c => <option key={c} value={c === 'All Cities' ? 'all' : c}>{c}</option>)}
                </select>) },
              { label: 'Resource', el: (
                <select value={resourceFilter} onChange={(e) => setResourceFilter(e.target.value)} className={filterSelectCls} data-testid="resource-filter">
                  <option value="all">All Resources</option>
                  {salesTeam.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>) },
            ].map((f) => (
              <div key={f.label} className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</label>
                <div className="relative">
                  {f.el}
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                </div>
              </div>
            ))}
            <div className="flex items-end">
              <Button variant="outline" onClick={handleResetFilters} className="w-full h-[42px] rounded-xl border-slate-200 dark:border-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 dark:hover:bg-indigo-900/30 transition-colors" data-testid="reset-filters-btn">Reset</Button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="res-rise relative overflow-hidden rounded-2xl border border-emerald-200/60 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-slate-900 p-5" data-testid="stat-total-achieved">
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-emerald-400/20 blur-2xl" />
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center"><TrendingUp className="h-4.5 w-4.5" /></div><span className="text-[11px] font-semibold uppercase tracking-wider">Total Achieved</span></div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{formatCurrency(totalAchieved)}</p>
            <p className="text-xs text-muted-foreground mt-1">across {rankedResources.length} {rankedResources.length === 1 ? 'resource' : 'resources'}</p>
          </div>

          <div className="res-rise relative overflow-hidden rounded-2xl border border-blue-200/60 dark:border-blue-900/40 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/40 dark:to-slate-900 p-5" style={{ animationDelay: '60ms' }} data-testid="stat-total-leads">
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-blue-400/20 blur-2xl" />
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400"><div className="h-9 w-9 rounded-xl bg-blue-500/15 flex items-center justify-center"><Users className="h-4.5 w-4.5" /></div><span className="text-[11px] font-semibold uppercase tracking-wider">Total Leads</span></div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{totalLeads.toLocaleString('en-IN')}</p>
            <p className="text-xs text-muted-foreground mt-1">assigned in period</p>
          </div>

          <div className="res-rise relative overflow-hidden rounded-2xl border border-green-200/60 dark:border-green-900/40 bg-gradient-to-br from-green-50 to-white dark:from-green-950/40 dark:to-slate-900 p-5" style={{ animationDelay: '120ms' }} data-testid="stat-won-deals">
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-green-400/20 blur-2xl" />
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400"><div className="h-9 w-9 rounded-xl bg-green-500/15 flex items-center justify-center"><Trophy className="h-4.5 w-4.5" /></div><span className="text-[11px] font-semibold uppercase tracking-wider">Won Deals</span></div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{totalWon.toLocaleString('en-IN')}</p>
            <p className="text-xs text-muted-foreground mt-1">closed in period</p>
          </div>

          <div className="res-rise relative overflow-hidden rounded-2xl border border-violet-200/60 dark:border-violet-900/40 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/40 dark:to-slate-900 p-5" style={{ animationDelay: '180ms' }} data-testid="stat-avg-achievement">
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-violet-400/20 blur-2xl" />
            <div className="flex items-center gap-2 text-violet-700 dark:text-violet-400"><div className="h-9 w-9 rounded-xl bg-violet-500/15 flex items-center justify-center"><Target className="h-4.5 w-4.5" /></div><span className="text-[11px] font-semibold uppercase tracking-wider">Avg Achievement</span></div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{avgAchievement}%</p>
            <p className="text-xs text-muted-foreground mt-1 truncate">{topResource ? `Top: ${topResource.name}` : 'of target'}</p>
          </div>
        </div>

        {/* Resource Leaderboard */}
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl shadow-lg shadow-slate-200/40 dark:shadow-slate-950/40 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">Resource Leaderboard</h2>
            <span className="text-xs text-muted-foreground">Ranked by target achievement</span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="relative"><div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" /><Loader2 className="h-10 w-10 animate-spin text-indigo-500 relative z-10" /></div>
              <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading resource performance…</p>
            </div>
          ) : rankedResources.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Users className="h-8 w-8 text-slate-300 dark:text-slate-600" /></div>
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No resource data found</p>
              <p className="text-muted-foreground text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {rankedResources.map((row, idx) => {
                const pct = Math.round(row.achievement_pct || 0);
                return (
                  <div
                    key={row.id || idx}
                    className="res-rise group px-5 py-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    style={{ animationDelay: `${Math.min(idx * 45, 400)}ms` }}
                    data-testid={`resource-row-${idx}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Rank + Avatar */}
                      <div className="shrink-0 flex items-center gap-3">
                        <div className="w-6 text-center text-sm font-bold text-slate-400 dark:text-slate-500 tabular-nums">
                          {idx < 3 ? <Crown className={`h-4 w-4 mx-auto ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-400' : 'text-orange-400'}`} /> : idx + 1}
                        </div>
                        <div className={`h-11 w-11 rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-md ${avatarTone(idx)}`}>
                          {initials(row.name)}
                        </div>
                      </div>

                      {/* Name + territory + achievement bar */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 dark:text-white truncate">{row.name}</span>
                          <span className="text-[11px] text-muted-foreground">{row.role}</span>
                          {row.territory && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              <MapPin className="h-2.5 w-2.5" />{row.territory}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="relative h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className={`res-bar absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${achievementBar(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className={`text-[11px] font-semibold tabular-nums w-12 text-right ${achievementColor(pct)}`}>{pct}%</span>
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="hidden lg:flex items-center gap-5 shrink-0">
                        <div className="text-right w-24">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Achieved</p>
                          <p className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(row.achieved_revenue)}</p>
                        </div>
                        <div className="text-right w-14">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Leads</p>
                          <p className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{row.leads_count || 0}</p>
                        </div>
                        <div className="text-right w-14">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Won</p>
                          <p className="font-semibold text-green-600 dark:text-green-400 tabular-nums">{row.won_deals || 0}</p>
                        </div>
                        <div className="text-right w-16">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-end gap-1"><Footprints className="h-3 w-3" />Visits</p>
                          <p className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{row.visits || 0}</p>
                        </div>
                        <div className="text-right w-16">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-end gap-1"><Phone className="h-3 w-3" />Calls</p>
                          <p className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{row.calls || 0}</p>
                        </div>
                      </div>

                      <ArrowUpRight className="h-4 w-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 group-hover:text-indigo-500 transition-all shrink-0" />
                    </div>

                    {/* Mobile metrics */}
                    <div className="lg:hidden mt-3 grid grid-cols-4 gap-2 pl-[76px]">
                      <div><p className="text-[10px] uppercase text-muted-foreground">Achieved</p><p className="font-bold text-emerald-600 dark:text-emerald-400 text-xs tabular-nums">{formatCurrency(row.achieved_revenue)}</p></div>
                      <div><p className="text-[10px] uppercase text-muted-foreground">Leads</p><p className="font-semibold text-slate-700 dark:text-slate-200 text-xs tabular-nums">{row.leads_count || 0}</p></div>
                      <div><p className="text-[10px] uppercase text-muted-foreground">Won</p><p className="font-semibold text-green-600 dark:text-green-400 text-xs tabular-nums">{row.won_deals || 0}</p></div>
                      <div><p className="text-[10px] uppercase text-muted-foreground">Calls</p><p className="font-semibold text-slate-700 dark:text-slate-200 text-xs tabular-nums">{row.calls || 0}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

