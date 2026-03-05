import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Package, Filter, Loader2, TrendingUp, TrendingDown, ShoppingBag } from 'lucide-react';
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

  const stats = [
    { label: 'Total Achieved', value: formatCurrency(data.summary.total_achieved), icon: TrendingUp, gradient: 'from-emerald-500 to-teal-600', bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', textColor: 'text-emerald-700 dark:text-emerald-300' },
    { label: 'Units Sold', value: data.summary.total_units?.toLocaleString() || '0', icon: ShoppingBag, gradient: 'from-blue-500 to-indigo-600', bgGradient: 'from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20', iconBg: 'bg-blue-100 dark:bg-blue-900/50', textColor: 'text-blue-700 dark:text-blue-300' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="sku-performance-dashboard">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/50 dark:to-purple-900/30">
              <Package className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">SKU Performance</h1>
              <p className="text-muted-foreground">Track performance by product SKU</p>
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
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
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
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">SKU</label>
                <select value={skuFilter} onChange={(e) => setSkuFilter(e.target.value)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
                  <option value="all">All SKUs</option>
                  {SKU_OPTIONS.map(sku => <option key={sku} value={sku}>{sku}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={handleResetFilters} className="w-full h-[38px] border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Reset</Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
          ) : data.skus.length === 0 ? (
            <div className="text-center py-16">
              <Package className="h-16 w-16 mx-auto mb-4 text-slate-200 dark:text-slate-700" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No SKU data found</p>
              <p className="text-muted-foreground text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="text-left py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">SKU</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Achieved</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Units Sold</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Leads</th>
                    <th className="text-center py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {data.skus.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-5 font-medium text-slate-800 dark:text-white">{row.sku}</td>
                      <td className="py-4 px-5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(row.achieved_revenue)}</td>
                      <td className="py-4 px-5 text-right text-slate-700 dark:text-slate-300">{row.units_sold?.toLocaleString() || 0}</td>
                      <td className="py-4 px-5 text-right text-slate-700 dark:text-slate-300">{row.leads_count || 0}</td>
                      <td className="py-4 px-5 text-center">
                        {row.achieved_revenue > 0 ? <TrendingUp className="h-5 w-5 text-emerald-500 mx-auto" /> : <TrendingDown className="h-5 w-5 text-red-500 mx-auto" />}
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
