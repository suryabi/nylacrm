import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Building2, Filter, Loader2, TrendingUp, DollarSign, AlertTriangle, CreditCard } from 'lucide-react';

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

const TERRITORY_MAP = {
  'North India': { states: { 'Delhi': ['New Delhi'], 'Uttar Pradesh': ['Noida'] } },
  'South India': { states: { 'Karnataka': ['Bengaluru'], 'Tamil Nadu': ['Chennai'], 'Telangana': ['Hyderabad'] } },
  'West India': { states: { 'Maharashtra': ['Mumbai', 'Pune'], 'Gujarat': ['Ahmedabad'] } },
  'East India': { states: { 'West Bengal': ['Kolkata'] } }
};

const ACCOUNT_TYPES = ['Tier 1', 'Tier 2', 'Tier 3'];

const accountTypeColors = {
  'Tier 1': 'bg-emerald-100 text-emerald-800',
  'Tier 2': 'bg-blue-100 text-blue-800',
  'Tier 3': 'bg-gray-100 text-gray-800',
};

function formatCurrency(value) {
  if (!value) return '₹0';
  const num = Math.round(value);
  if (num >= 10000000) {
    return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  }
  if (num >= 100000) {
    return '₹' + (num / 100000).toFixed(2) + ' L';
  }
  return '₹' + num.toLocaleString('en-IN');
}

export default function AccountPerformance() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ accounts: [], summary: {} });
  
  // Filter states
  const [timeFilter, setTimeFilter] = useState('this_month');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [accountTypeFilter, setAccountTypeFilter] = useState('all');

  useEffect(() => {
    fetchData();
  }, [timeFilter, territoryFilter, stateFilter, cityFilter, accountTypeFilter]);

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
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setTimeFilter('this_month');
    setTerritoryFilter('all');
    setStateFilter('all');
    setCityFilter('all');
    setAccountTypeFilter('all');
  };

  const availableTerritories = user?.territory === 'All India' || ['ceo', 'director', 'vp', 'admin', 'National Sales Head'].includes(user?.role)
    ? ['All Territories', 'North India', 'South India', 'West India', 'East India']
    : user?.territory ? ['All Territories', user.territory] : ['All Territories'];

  const availableStates = territoryFilter !== 'all' && territoryFilter !== 'All Territories' && TERRITORY_MAP[territoryFilter]
    ? ['All States', ...Object.keys(TERRITORY_MAP[territoryFilter].states)]
    : ['All States'];

  const availableCities = stateFilter !== 'all' && stateFilter !== 'All States' && territoryFilter !== 'all' && territoryFilter !== 'All Territories' && TERRITORY_MAP[territoryFilter]
    ? ['All Cities', ...(TERRITORY_MAP[territoryFilter].states[stateFilter] || [])]
    : ['All Cities'];

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="account-performance-dashboard">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Account Performance
        </h1>
        <p className="text-muted-foreground mt-1">Track revenue and financial metrics by account</p>
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
              data-testid="time-filter"
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
              data-testid="territory-filter"
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
              data-testid="state-filter"
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
              data-testid="city-filter"
            >
              {availableCities.map(c => (
                <option key={c} value={c === 'All Cities' ? 'all' : c}>{c}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Account Type</label>
            <select
              value={accountTypeFilter}
              onChange={(e) => setAccountTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
              data-testid="account-type-filter"
            >
              <option value="all">All Types</option>
              {ACCOUNT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <Button variant="outline" onClick={handleResetFilters} className="w-full" data-testid="reset-filters-btn">
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <p className="text-xs font-medium text-emerald-600 mb-1">GROSS TOTAL</p>
          <p className="text-xl font-bold text-emerald-700">{formatCurrency(data.summary.total_gross)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <p className="text-xs font-medium text-blue-600 mb-1">NET TOTAL</p>
          <p className="text-xl font-bold text-blue-700">{formatCurrency(data.summary.total_net)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <p className="text-xs font-medium text-purple-600 mb-1">BOTTLE CREDIT</p>
          <p className="text-xl font-bold text-purple-700">{formatCurrency(data.summary.total_bottle_credit)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <p className="text-xs font-medium text-amber-600 mb-1">OUTSTANDING</p>
          <p className="text-xl font-bold text-amber-700">{formatCurrency(data.summary.total_outstanding)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <p className="text-xs font-medium text-red-600 mb-1">OVERDUE</p>
          <p className="text-xl font-bold text-red-700">{formatCurrency(data.summary.total_overdue)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
          <p className="text-xs font-medium text-slate-600 mb-1">ACCOUNTS</p>
          <p className="text-xl font-bold text-slate-700">{data.summary.account_count || 0}</p>
        </Card>
      </div>

      {/* Data Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !data.accounts || data.accounts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No account data found for the selected filters</p>
            <p className="text-sm mt-2">Convert won leads to create accounts</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="account-performance-table">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold">Account</th>
                  <th className="text-left py-3 px-4 font-semibold">Type</th>
                  <th className="text-left py-3 px-4 font-semibold">Location</th>
                  <th className="text-right py-3 px-4 font-semibold">Gross Invoice</th>
                  <th className="text-right py-3 px-4 font-semibold">Net Invoice</th>
                  <th className="text-right py-3 px-4 font-semibold">Bottle Credit</th>
                  <th className="text-right py-3 px-4 font-semibold">Contribution %</th>
                  <th className="text-right py-3 px-4 font-semibold">Last Payment</th>
                  <th className="text-right py-3 px-4 font-semibold">Outstanding</th>
                  <th className="text-right py-3 px-4 font-semibold">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((row, idx) => (
                  <tr 
                    key={row.account_id || idx} 
                    className="border-t hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/accounts/${row.account_id}`)}
                    data-testid={`account-row-${row.account_id}`}
                  >
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-primary">{row.account_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{row.account_id}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {row.account_type ? (
                        <Badge className={accountTypeColors[row.account_type] || 'bg-gray-100'}>
                          {row.account_type}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="text-sm">{row.city}</p>
                        <p className="text-xs text-muted-foreground">{row.state}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-emerald-600">
                      {formatCurrency(row.gross_invoice_total)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-blue-600">
                      {formatCurrency(row.net_invoice_total)}
                    </td>
                    <td className="py-3 px-4 text-right text-purple-600">
                      {formatCurrency(row.bottle_credit)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className={`font-semibold ${
                          row.contribution_pct >= 10 ? 'text-emerald-600' :
                          row.contribution_pct >= 5 ? 'text-blue-600' :
                          row.contribution_pct > 0 ? 'text-amber-600' :
                          'text-gray-400'
                        }`}>
                          {row.contribution_pct}%
                        </span>
                        {row.contribution_pct >= 10 && (
                          <TrendingUp className="h-3 w-3 text-emerald-500" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <CreditCard className="h-3 w-3 text-muted-foreground" />
                        <span>{formatCurrency(row.last_payment_amount)}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={row.outstanding_balance > 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>
                        {formatCurrency(row.outstanding_balance)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {row.overdue_amount > 0 && (
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                        )}
                        <span className={row.overdue_amount > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
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
      <p className="text-xs text-muted-foreground mt-4 text-center">
        Contribution % is calculated based on the total gross revenue across all accounts for the selected filters.
        Click on an account row to view details.
      </p>
    </div>
  );
}
