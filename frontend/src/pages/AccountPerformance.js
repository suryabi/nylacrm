import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  FilterContainer, 
  FilterItem, 
  FilterGrid 
} from '../components/ui/filter-bar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Building2, Filter, Loader2, TrendingUp, AlertTriangle, Calendar, ShoppingCart, DollarSign, CreditCard, Receipt, Wallet, AlertCircle, MapPin, Layers } from 'lucide-react';
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

const ACCOUNT_TYPES = ['Tier 1', 'Tier 2', 'Tier 3'];

const accountTypeColors = {
  'Tier 1': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  'Tier 2': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  'Tier 3': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function formatCurrency(value) {
  if (!value) return '₹0';
  const num = Math.round(value);
  if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  if (num >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
  return '₹' + num.toLocaleString('en-IN');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '-'; }
}

export default function AccountPerformance() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ accounts: [], summary: {} });
  
  const { territories: masterTerritories, getStateNamesByTerritoryName, getCityNamesByStateName } = useMasterLocations();
  
  const [timeFilter, setTimeFilter] = useState('this_week');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [accountTypeFilter, setAccountTypeFilter] = useState('all');

  useEffect(() => { fetchData(); }, [timeFilter, territoryFilter, stateFilter, cityFilter, accountTypeFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('time_filter', timeFilter);
      if (territoryFilter !== 'all') params.append('territory', territoryFilter);
      if (stateFilter !== 'all') params.append('state', stateFilter);
      if (cityFilter !== 'all') params.append('city', cityFilter);
      if (accountTypeFilter !== 'all') params.append('account_type', accountTypeFilter);
      
      const res = await axios.get(`${API_URL}/reports/account-performance?${params}`, { 
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true 
      });
      setData(res.data);
    } catch (error) {
      console.error('Failed to load account performance data');
      toast.error('Failed to load account performance data');
    } finally { setLoading(false); }
  };

  const handleResetFilters = () => {
    setTimeFilter('this_month');
    setTerritoryFilter('all');
    setStateFilter('all');
    setCityFilter('all');
    setAccountTypeFilter('all');
  };

  const allTerritoryNames = masterTerritories.map(t => t.name);
  const availableTerritories = user?.territory === 'All India' || ['ceo', 'director', 'vp', 'admin', 'CEO', 'Director', 'Vice President', 'National Sales Head'].includes(user?.role)
    ? ['All Territories', ...allTerritoryNames] : user?.territory ? ['All Territories', user.territory] : ['All Territories'];
  const availableStates = territoryFilter !== 'all' && territoryFilter !== 'All Territories' ? ['All States', ...getStateNamesByTerritoryName(territoryFilter)] : ['All States'];
  const availableCities = stateFilter !== 'all' && stateFilter !== 'All States' ? ['All Cities', ...getCityNamesByStateName(stateFilter)] : ['All Cities'];

  const stats = [
    { label: 'Gross Total', value: formatCurrency(data.summary.total_gross), icon: DollarSign, gradient: 'from-emerald-500 to-teal-600', bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', textColor: 'text-emerald-700 dark:text-emerald-300' },
    { label: 'Net Total', value: formatCurrency(data.summary.total_net), icon: Receipt, gradient: 'from-blue-500 to-indigo-600', bgGradient: 'from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20', iconBg: 'bg-blue-100 dark:bg-blue-900/50', textColor: 'text-blue-700 dark:text-blue-300' },
    { label: 'Avg Order', value: formatCurrency(data.summary.average_order_amount), icon: ShoppingCart, gradient: 'from-indigo-500 to-violet-600', bgGradient: 'from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/20', iconBg: 'bg-indigo-100 dark:bg-indigo-900/50', textColor: 'text-indigo-700 dark:text-indigo-300' },
    { label: 'Bottle Credit', value: formatCurrency(data.summary.total_bottle_credit), icon: CreditCard, gradient: 'from-purple-500 to-fuchsia-600', bgGradient: 'from-purple-50 to-fuchsia-50 dark:from-purple-950/30 dark:to-fuchsia-950/20', iconBg: 'bg-purple-100 dark:bg-purple-900/50', textColor: 'text-purple-700 dark:text-purple-300' },
    { label: 'Outstanding', value: formatCurrency(data.summary.total_outstanding), icon: Wallet, gradient: 'from-amber-500 to-orange-600', bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20', iconBg: 'bg-amber-100 dark:bg-amber-900/50', textColor: 'text-amber-700 dark:text-amber-300' },
    { label: 'Overdue', value: formatCurrency(data.summary.total_overdue), icon: AlertCircle, gradient: 'from-red-500 to-rose-600', bgGradient: 'from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/20', iconBg: 'bg-red-100 dark:bg-red-900/50', textColor: 'text-red-700 dark:text-red-300' },
    { label: 'Accounts', value: data.summary.account_count || 0, icon: Building2, gradient: 'from-slate-500 to-slate-600', bgGradient: 'from-slate-50 to-slate-100 dark:from-slate-900/30 dark:to-slate-800/20', iconBg: 'bg-slate-100 dark:bg-slate-800', textColor: 'text-slate-700 dark:text-slate-300' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="account-performance-dashboard">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/50 dark:to-orange-900/30">
              <Building2 className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Account Performance</h1>
              <p className="text-muted-foreground">Track revenue and financial metrics by account</p>
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
                <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" data-testid="time-filter">
                  {TIME_FILTERS.map(tf => <option key={tf.value} value={tf.value}>{tf.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Territory</label>
                <select value={territoryFilter} onChange={(e) => { setTerritoryFilter(e.target.value); setStateFilter('all'); setCityFilter('all'); }} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" data-testid="territory-filter">
                  {availableTerritories.map(t => <option key={t} value={t === 'All Territories' ? 'all' : t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">State</label>
                <select value={stateFilter} onChange={(e) => { setStateFilter(e.target.value); setCityFilter('all'); }} disabled={territoryFilter === 'all'} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm disabled:opacity-50 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" data-testid="state-filter">
                  {availableStates.map(s => <option key={s} value={s === 'All States' ? 'all' : s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">City</label>
                <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} disabled={stateFilter === 'all'} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm disabled:opacity-50 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" data-testid="city-filter">
                  {availableCities.map(c => <option key={c} value={c === 'All Cities' ? 'all' : c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Account Type</label>
                <select value={accountTypeFilter} onChange={(e) => setAccountTypeFilter(e.target.value)} className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" data-testid="account-type-filter">
                  <option value="all">All Types</option>
                  {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={handleResetFilters} className="w-full h-[38px] border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" data-testid="reset-filters-btn">Reset</Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className={`relative overflow-hidden border-0 bg-gradient-to-br ${stat.bgGradient} backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5`}>
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient}`} />
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                      <p className={`text-lg lg:text-xl font-bold ${stat.textColor} tabular-nums`}>{stat.value}</p>
                    </div>
                    <div className={`p-2 rounded-lg ${stat.iconBg}`}><Icon className={`h-4 w-4 ${stat.textColor}`} /></div>
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
          ) : !data.accounts || data.accounts.length === 0 ? (
            <div className="text-center py-16">
              <Building2 className="h-16 w-16 mx-auto mb-4 text-slate-200 dark:text-slate-700" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No account data found</p>
              <p className="text-muted-foreground text-sm">Convert won leads to create accounts</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="account-performance-table">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="text-left py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Account</th>
                    <th className="text-left py-4 px-4 font-semibold text-slate-600 dark:text-slate-400">Type</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Invoice Value</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Avg Order</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Bottle Credit</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Contribution</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Last Payment</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Outstanding</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.map((row, idx) => (
                    <tr 
                      key={row.account_id || idx} 
                      className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/accounts/${row.account_id}`)}
                      data-testid={`account-row-${row.account_id}`}
                    >
                      <td className="py-4 px-5">
                        <div>
                          <p className="font-medium text-primary hover:underline">{row.account_name}</p>
                          <p className="text-xs text-muted-foreground">{row.city}, {row.state}</p>
                          <p className="text-xs text-muted-foreground/70 font-mono">{row.account_id}</p>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {row.account_type ? (
                          <Badge className={accountTypeColors[row.account_type] || 'bg-slate-100 dark:bg-slate-800'}>{row.account_type}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div>
                          <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(row.gross_invoice_total)}</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400">Net: {formatCurrency(row.net_invoice_total)}</p>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <ShoppingCart className="h-3 w-3 text-indigo-400" />
                          <span className="font-medium text-indigo-600 dark:text-indigo-400">{formatCurrency(row.average_order_amount)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{row.invoice_count} orders</p>
                      </td>
                      <td className="py-4 px-5 text-right text-purple-600 dark:text-purple-400">{formatCurrency(row.bottle_credit)}</td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className={`font-semibold ${
                            row.contribution_pct >= 10 ? 'text-emerald-600 dark:text-emerald-400' :
                            row.contribution_pct >= 5 ? 'text-blue-600 dark:text-blue-400' :
                            row.contribution_pct > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                          }`}>{row.contribution_pct}%</span>
                          {row.contribution_pct >= 10 && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div>
                          <p className="font-medium text-slate-700 dark:text-slate-300">{formatCurrency(row.last_payment_amount)}</p>
                          <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                            <Calendar className="h-3 w-3" />{formatDate(row.last_payment_date)}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <span className={row.outstanding_balance > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-green-600 dark:text-green-400'}>
                          {formatCurrency(row.outstanding_balance)}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {row.overdue_amount > 0 && <AlertTriangle className="h-3 w-3 text-red-500" />}
                          <span className={row.overdue_amount > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-green-600 dark:text-green-400'}>
                            {formatCurrency(row.overdue_amount)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Info Note */}
        <p className="text-xs text-muted-foreground mt-6 text-center">
          Contribution % and Average Order are calculated based on the selected filters. Click on an account row to view details.
        </p>
      </div>
    </div>
  );
}
