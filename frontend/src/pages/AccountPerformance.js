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
import { Building2, Filter, Loader2, TrendingUp, AlertTriangle, Calendar, ShoppingCart, DollarSign, CreditCard, Receipt, Wallet, AlertCircle, MapPin, Layers, ChevronLeft, ChevronRight } from 'lucide-react';
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

const LEAD_TYPES = ['B2B', 'Retail', 'Individual'];

const leadTypeColors = {
  'B2B': 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300',
  'Retail': 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300',
  'Individual': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
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
  const [leadTypeFilter, setLeadTypeFilter] = useState('all');

  // Pagination (client-side — backend returns the full filtered set; usually 50-500 rows max)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Reset to page 1 whenever any filter changes
  useEffect(() => { setPage(1); }, [timeFilter, territoryFilter, stateFilter, cityFilter, leadTypeFilter]);

  useEffect(() => { fetchData(); }, [timeFilter, territoryFilter, stateFilter, cityFilter, leadTypeFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('time_filter', timeFilter);
      if (territoryFilter !== 'all') params.append('territory', territoryFilter);
      if (stateFilter !== 'all') params.append('state', stateFilter);
      if (cityFilter !== 'all') params.append('city', cityFilter);
      if (leadTypeFilter !== 'all') params.append('lead_type', leadTypeFilter);
      
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
    setLeadTypeFilter('all');
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

        {/* Contemporary Filters */}
        <FilterContainer 
          title="Filters" 
          activeFiltersCount={[
            timeFilter !== 'this_month', 
            territoryFilter !== 'all', 
            stateFilter !== 'all', 
            cityFilter !== 'all', 
            leadTypeFilter !== 'all'
          ].filter(Boolean).length}
          onReset={handleResetFilters}
          className="mb-6"
        >
          <FilterGrid columns={6}>
            <FilterItem label="Time Period" icon={Calendar}>
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" data-testid="time-filter">
                  <SelectValue placeholder="This Month" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-60">
                  {TIME_FILTERS.map(tf => (
                    <SelectItem key={tf.value} value={tf.value} className="rounded-lg">{tf.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
            
            <FilterItem label="Territory" icon={MapPin}>
              <Select value={territoryFilter} onValueChange={(v) => { setTerritoryFilter(v); setStateFilter('all'); setCityFilter('all'); }}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" data-testid="territory-filter">
                  <SelectValue placeholder="All Territories" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableTerritories.map(t => (
                    <SelectItem key={t} value={t === 'All Territories' ? 'all' : t} className="rounded-lg">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
            
            <FilterItem label="State" icon={MapPin}>
              <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setCityFilter('all'); }} disabled={territoryFilter === 'all'}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all disabled:opacity-50" data-testid="state-filter">
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableStates.map(s => (
                    <SelectItem key={s} value={s === 'All States' ? 'all' : s} className="rounded-lg">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
            
            <FilterItem label="City" icon={MapPin}>
              <Select value={cityFilter} onValueChange={setCityFilter} disabled={stateFilter === 'all'}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all disabled:opacity-50" data-testid="city-filter">
                  <SelectValue placeholder="All Cities" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableCities.map(c => (
                    <SelectItem key={c} value={c === 'All Cities' ? 'all' : c} className="rounded-lg">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
            
            <FilterItem label="Lead Type" icon={Layers}>
              <Select value={leadTypeFilter} onValueChange={setLeadTypeFilter}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" data-testid="lead-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="rounded-lg">All Types</SelectItem>
                  {LEAD_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="rounded-lg">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
          </FilterGrid>
        </FilterContainer>

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
              <table className="w-full text-sm table-fixed" data-testid="account-performance-table">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="text-left py-4 px-5 font-semibold text-slate-600 dark:text-slate-400 w-[24%]">Account</th>
                    <th className="text-right py-4 px-3 font-semibold text-slate-600 dark:text-slate-400 w-[14%]">Invoice Value</th>
                    <th className="text-right py-4 px-3 font-semibold text-slate-600 dark:text-slate-400 w-[12%]">Avg Order</th>
                    <th className="text-right py-4 px-3 font-semibold text-slate-600 dark:text-slate-400 w-[10%]">Bottle Credit</th>
                    <th className="text-right py-4 px-3 font-semibold text-slate-600 dark:text-slate-400 w-[10%]">Contribution</th>
                    <th className="text-right py-4 px-3 font-semibold text-slate-600 dark:text-slate-400 w-[12%]">Last Payment</th>
                    <th className="text-right py-4 px-3 font-semibold text-slate-600 dark:text-slate-400 w-[10%]">Outstanding</th>
                    <th className="text-right py-4 px-5 font-semibold text-slate-600 dark:text-slate-400 w-[8%]">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accounts.slice((page - 1) * pageSize, page * pageSize).map((row, idx) => (
                    <tr 
                      key={row.account_id || idx} 
                      className="group border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/accounts/${row.account_id}`)}
                      data-testid={`account-row-${row.account_id}`}
                    >
                      <td className="py-4 px-5 max-w-0">
                        <p
                          className="font-semibold text-slate-800 dark:text-white group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors truncate"
                          title={row.account_name}
                        >
                          {row.account_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate" title={[row.city, row.state].filter(Boolean).join(', ')}>
                          {[row.city, row.state].filter(Boolean).join(', ') || '—'}
                        </p>
                      </td>
                      <td className="py-4 px-3 text-right">
                        <div>
                          <p className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(row.gross_invoice_total)}</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 tabular-nums">Net: {formatCurrency(row.net_invoice_total)}</p>
                        </div>
                      </td>
                      <td className="py-4 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <ShoppingCart className="h-3 w-3 text-indigo-400" />
                          <span className="font-medium text-indigo-600 dark:text-indigo-400 tabular-nums">{formatCurrency(row.average_order_amount)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{row.invoice_count} orders</p>
                      </td>
                      <td className="py-4 px-3 text-right text-purple-600 dark:text-purple-400 tabular-nums">{formatCurrency(row.bottle_credit)}</td>
                      <td className="py-4 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className={`font-semibold tabular-nums ${
                            row.contribution_pct >= 10 ? 'text-emerald-600 dark:text-emerald-400' :
                            row.contribution_pct >= 5 ? 'text-blue-600 dark:text-blue-400' :
                            row.contribution_pct > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                          }`}>{row.contribution_pct}%</span>
                          {row.contribution_pct >= 10 && <TrendingUp className="h-3 w-3 text-emerald-500" />}
                        </div>
                      </td>
                      <td className="py-4 px-3 text-right">
                        <div>
                          <p className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">{formatCurrency(row.last_payment_amount)}</p>
                          <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                            <Calendar className="h-3 w-3" />{formatDate(row.last_payment_date)}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-3 text-right">
                        <span className={`tabular-nums ${row.outstanding_balance > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-green-600 dark:text-green-400'}`}>
                          {formatCurrency(row.outstanding_balance)}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {row.overdue_amount > 0 && <AlertTriangle className="h-3 w-3 text-red-500" />}
                          <span className={`tabular-nums ${row.overdue_amount > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-green-600 dark:text-green-400'}`}>
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

          {/* Pagination footer */}
          {!loading && (data.accounts?.length || 0) > 0 && (() => {
            const total = data.accounts.length;
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const startIdx = (page - 1) * pageSize;
            const endIdx = Math.min(page * pageSize, total);
            return (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Show</span>
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                    <SelectTrigger className="w-[80px] h-8" data-testid="account-perf-page-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>per page · showing {startIdx + 1}–{endIdx} of {total}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    data-testid="account-perf-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    data-testid="account-perf-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })()}
        </Card>

        {/* Info Note */}
        <p className="text-xs text-muted-foreground mt-6 text-center">
          Contribution % and Average Order are calculated based on the selected filters. Click on an account row to view details.
        </p>
      </div>
    </div>
  );
}
