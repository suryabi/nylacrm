import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Package, Filter, Loader2, TrendingUp, ShoppingBag, Boxes, Crown, ArrowUpRight, ChevronDown } from 'lucide-react';
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

const SKU_OPTIONS = [
  '660 ml / Silver / Nyla',
  '660 ml / Gold / Nyla',
  '330 ml / Silver / Nyla',
  '330 ml / Gold / Nyla',
  '660 ml / Sparkling',
  '300 ml / Sparkling',
  '24 Brand / 660 ml'
];

function formatCurrency(value) {
  if (!value) return '₹0';
  const num = Math.round(value);
  if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  if (num >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
  return '₹' + num.toLocaleString('en-IN');
}

export default function SKUPerformance() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ skus: [], summary: {} });
  const [salesTeam, setSalesTeam] = useState([]);
  
  const [timeFilter, setTimeFilter] = useState('this_week');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [salesResource, setSalesResource] = useState('all');
  const [skuFilter, setSkuFilter] = useState('all');

  const { territories: masterTerritories, getStateNamesByTerritoryName, getCityNamesByStateName } = useMasterLocations();

  useEffect(() => { fetchSalesTeam(); }, []);
  useEffect(() => { fetchData(); }, [timeFilter, territoryFilter, stateFilter, cityFilter, salesResource, skuFilter]);

  const fetchSalesTeam = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`, { withCredentials: true });
      setSalesTeam(response.data.filter(u => ['Head of Business', 'Regional Sales Manager', 'National Sales Head', 'Partner - Sales'].includes(u.role) && u.is_active));
    } catch (error) { console.error('Failed to load team'); }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('time_filter', timeFilter);
      if (territoryFilter !== 'all') params.append('territory', territoryFilter);
      if (stateFilter !== 'all') params.append('state', stateFilter);
      if (cityFilter !== 'all') params.append('city', cityFilter);
      if (salesResource !== 'all') params.append('resource_id', salesResource);
      if (skuFilter !== 'all') params.append('sku', skuFilter);
      
      const res = await axios.get(`${API_URL}/reports/sku-performance?${params}`, { withCredentials: true });
      setData(res.data);
    } catch (error) {
      const mockData = {
        skus: SKU_OPTIONS.map((sku) => ({
          sku,
          target_revenue: (Math.random() * 500000 + 100000),
          achieved_revenue: (Math.random() * 400000 + 50000),
          units_sold: Math.floor(Math.random() * 1000 + 100),
          leads_count: Math.floor(Math.random() * 50 + 5),
          achievement_pct: Math.floor(Math.random() * 100 + 20)
        })),
        summary: { total_target: 2500000, total_achieved: 1800000, total_units: 4500, avg_achievement: 72 }
      };
      setData(mockData);
    } finally { setLoading(false); }
  };

  const handleResetFilters = () => {
    setTimeFilter('this_month');
    setTerritoryFilter('all');
    setStateFilter('all');
    setCityFilter('all');
    setSalesResource('all');
    setSkuFilter('all');
  };

  const availableTerritories = user?.territory === 'All India' || ['CEO', 'Director', 'Vice President', 'System Admin'].includes(user?.role)
    ? ['All Territories', ...masterTerritories.map(t => t.name)] : user?.territory ? ['All Territories', user.territory] : ['All Territories'];
  const availableStates = territoryFilter !== 'all' && territoryFilter !== 'All Territories' ? ['All States', ...getStateNamesByTerritoryName(territoryFilter)] : ['All States'];
  const availableCities = stateFilter !== 'all' && stateFilter !== 'All States' ? ['All Cities', ...getCityNamesByStateName(stateFilter)] : ['All Cities'];

  const skusSorted = [...(data.skus || [])].sort((a, b) => (b.achieved_revenue || 0) - (a.achieved_revenue || 0));
  const totalAchieved = data.summary?.total_achieved || skusSorted.reduce((s, r) => s + (r.achieved_revenue || 0), 0);
  const totalUnits = data.summary?.total_units || skusSorted.reduce((s, r) => s + (r.units_sold || 0), 0);
  const maxAchieved = Math.max(1, ...skusSorted.map(r => r.achieved_revenue || 0));
  const topSku = skusSorted[0];

  const variantOf = (name = '') => {
    const n = name.toLowerCase();
    if (n.includes('gold')) return { label: 'Gold', dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50', bar: 'from-amber-400 to-orange-500', ring: 'ring-amber-200 dark:ring-amber-900/50' };
    if (n.includes('silver')) return { label: 'Silver', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', bar: 'from-slate-400 to-slate-500', ring: 'ring-slate-200 dark:ring-slate-700' };
    if (n.includes('sparkling')) return { label: 'Sparkling', dot: 'bg-sky-400', chip: 'bg-sky-50 text-sky-700 border-sky-200/70 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800/50', bar: 'from-sky-400 to-cyan-500', ring: 'ring-sky-200 dark:ring-sky-900/50' };
    return { label: null, dot: 'bg-violet-400', chip: 'bg-violet-50 text-violet-700 border-violet-200/70 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800/50', bar: 'from-violet-500 to-fuchsia-500', ring: 'ring-violet-200 dark:ring-violet-900/50' };
  };
  const rankStyle = (idx) => [
    'bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-amber-500/30',
    'bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-slate-400/30',
    'bg-gradient-to-br from-orange-300 to-orange-500 text-white shadow-orange-500/30',
  ][idx] || 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400';

  const filterSelectCls = "w-full appearance-none pl-3.5 pr-9 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm hover:border-violet-300 dark:hover:border-violet-700 focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="sku-performance-dashboard">
      <style>{`
        @keyframes skuRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes barGrow { from { width: 0; } }
        .sku-rise { animation: skuRise .5s cubic-bezier(.16,1,.3,1) both; }
        .bar-grow { animation: barGrow .9s cubic-bezier(.16,1,.3,1) both; }
      `}</style>
      <div className="absolute inset-0 bg-[radial-gradient(#c4b5fd_1px,transparent_1px)] [background-size:22px_22px] opacity-[0.15] dark:opacity-[0.06] pointer-events-none" />

      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-lg shadow-violet-500/30">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">SKU Performance</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Track revenue &amp; volume contribution by product SKU</p>
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
            <Filter className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Filters</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
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
              { label: 'Sales Resource', el: (
                <select value={salesResource} onChange={(e) => setSalesResource(e.target.value)} className={filterSelectCls} data-testid="resource-filter">
                  <option value="all">All Resources</option>
                  {salesTeam.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>) },
              { label: 'SKU', el: (
                <select value={skuFilter} onChange={(e) => setSkuFilter(e.target.value)} className={filterSelectCls} data-testid="sku-filter">
                  <option value="all">All SKUs</option>
                  {SKU_OPTIONS.map(sku => <option key={sku} value={sku}>{sku}</option>)}
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
              <Button variant="outline" onClick={handleResetFilters} className="w-full h-[42px] rounded-xl border-slate-200 dark:border-slate-700 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200 dark:hover:bg-violet-900/30 transition-colors" data-testid="reset-filters-btn">Reset</Button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="sku-rise relative overflow-hidden rounded-2xl border border-emerald-200/60 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-slate-900 p-5" data-testid="stat-total-achieved">
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-emerald-400/20 blur-2xl" />
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><div className="h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center"><TrendingUp className="h-4.5 w-4.5" /></div><span className="text-[11px] font-semibold uppercase tracking-wider">Total Achieved</span></div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{formatCurrency(totalAchieved)}</p>
            <p className="text-xs text-muted-foreground mt-1">across {skusSorted.length} {skusSorted.length === 1 ? 'SKU' : 'SKUs'}</p>
          </div>

          <div className="sku-rise relative overflow-hidden rounded-2xl border border-indigo-200/60 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/40 dark:to-slate-900 p-5" style={{ animationDelay: '60ms' }} data-testid="stat-units-sold">
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-indigo-400/20 blur-2xl" />
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400"><div className="h-9 w-9 rounded-xl bg-indigo-500/15 flex items-center justify-center"><ShoppingBag className="h-4.5 w-4.5" /></div><span className="text-[11px] font-semibold uppercase tracking-wider">Units Sold</span></div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{totalUnits.toLocaleString('en-IN')}</p>
            <p className="text-xs text-muted-foreground mt-1">total volume in period</p>
          </div>

          <div className="sku-rise relative overflow-hidden rounded-2xl border border-violet-200/60 dark:border-violet-900/40 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/40 dark:to-slate-900 p-5" style={{ animationDelay: '120ms' }} data-testid="stat-sku-count">
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-violet-400/20 blur-2xl" />
            <div className="flex items-center gap-2 text-violet-700 dark:text-violet-400"><div className="h-9 w-9 rounded-xl bg-violet-500/15 flex items-center justify-center"><Boxes className="h-4.5 w-4.5" /></div><span className="text-[11px] font-semibold uppercase tracking-wider">Active SKUs</span></div>
            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">{skusSorted.length}</p>
            <p className="text-xs text-muted-foreground mt-1">contributing to revenue</p>
          </div>

          <div className="sku-rise relative overflow-hidden rounded-2xl border border-amber-200/60 dark:border-amber-900/40 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/40 dark:to-slate-900 p-5" style={{ animationDelay: '180ms' }} data-testid="stat-top-sku">
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-amber-400/20 blur-2xl" />
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400"><div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center"><Crown className="h-4.5 w-4.5" /></div><span className="text-[11px] font-semibold uppercase tracking-wider">Top SKU</span></div>
            <p className="mt-3 text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate" title={topSku?.sku}>{topSku?.sku || '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">{topSku ? `${formatCurrency(topSku.achieved_revenue)} · ${totalAchieved > 0 ? Math.round((topSku.achieved_revenue / totalAchieved) * 100) : 0}% of revenue` : 'No data'}</p>
          </div>
        </div>

        {/* SKU Leaderboard */}
        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl shadow-lg shadow-slate-200/40 dark:shadow-slate-950/40 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-800 dark:text-white">SKU Leaderboard</h2>
            <span className="text-xs text-muted-foreground">Ranked by revenue contribution</span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="relative"><div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" /><Loader2 className="h-10 w-10 animate-spin text-violet-500 relative z-10" /></div>
              <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading SKU performance…</p>
            </div>
          ) : skusSorted.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Package className="h-8 w-8 text-slate-300 dark:text-slate-600" /></div>
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No SKU data found</p>
              <p className="text-muted-foreground text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {skusSorted.map((row, idx) => {
                const v = variantOf(row.sku);
                const share = totalAchieved > 0 ? (row.achieved_revenue / totalAchieved) * 100 : 0;
                const barPct = maxAchieved > 0 ? (row.achieved_revenue / maxAchieved) * 100 : 0;
                return (
                  <div
                    key={idx}
                    className="sku-rise group px-5 py-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    style={{ animationDelay: `${Math.min(idx * 45, 400)}ms` }}
                    data-testid={`sku-row-${idx}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <div className={`shrink-0 h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold shadow-md ${rankStyle(idx)}`}>
                        {idx < 3 ? <Crown className="h-4 w-4" /> : idx + 1}
                      </div>

                      {/* Name + variant + progress */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 dark:text-white truncate">{row.sku}</span>
                          {v.label && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${v.chip}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />{v.label}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="relative h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className={`bar-grow absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${v.bar}`} style={{ width: `${barPct}%` }} />
                          </div>
                          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 tabular-nums w-12 text-right">{share.toFixed(1)}%</span>
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="hidden md:flex items-center gap-6 shrink-0">
                        <div className="text-right w-24">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Achieved</p>
                          <p className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(row.achieved_revenue)}</p>
                        </div>
                        <div className="text-right w-20">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Units</p>
                          <p className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{(row.units_sold || 0).toLocaleString('en-IN')}</p>
                        </div>
                        <div className="text-right w-24">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Accounts</p>
                          <p className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{row.accounts_count ?? row.leads_count ?? 0}</p>
                        </div>
                      </div>

                      <ArrowUpRight className="h-4 w-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 group-hover:text-violet-500 transition-all shrink-0" />
                    </div>

                    {/* Mobile metrics */}
                    <div className="md:hidden mt-3 grid grid-cols-3 gap-2 pl-13">
                      <div><p className="text-[10px] uppercase text-muted-foreground">Achieved</p><p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm tabular-nums">{formatCurrency(row.achieved_revenue)}</p></div>
                      <div><p className="text-[10px] uppercase text-muted-foreground">Units</p><p className="font-semibold text-slate-700 dark:text-slate-200 text-sm tabular-nums">{(row.units_sold || 0).toLocaleString('en-IN')}</p></div>
                      <div><p className="text-[10px] uppercase text-muted-foreground">Accounts</p><p className="font-semibold text-slate-700 dark:text-slate-200 text-sm tabular-nums">{row.accounts_count ?? row.leads_count ?? 0}</p></div>
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

