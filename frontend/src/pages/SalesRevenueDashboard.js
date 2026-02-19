import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { TrendingUp, Filter, Loader2 } from 'lucide-react';

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

export default function SalesRevenueDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ leads: [], summary: {} });
  const [salesTeam, setSalesTeam] = useState([]);
  
  // Filter states - matching Sales Overview
  const [timeFilter, setTimeFilter] = useState('this_month');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [salesResource, setSalesResource] = useState('all');

  useEffect(() => {
    fetchSalesTeam();
  }, []);

  useEffect(() => {
    fetchData();
  }, [timeFilter, territoryFilter, stateFilter, cityFilter, salesResource]);

  const fetchSalesTeam = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`, { withCredentials: true });
      setSalesTeam(response.data.filter(u => ['Head of Business', 'Regional Sales Manager', 'National Sales Head', 'Partner - Sales'].includes(u.role) && u.is_active));
    } catch (error) {
      console.error('Failed to load team');
    }
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
      
      const res = await axios.get(`${API_URL}/sales-revenue/won-leads?${params}`, { withCredentials: true });
      setData(res.data);
    } catch (error) {
      toast.error('Failed to load revenue data');
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

  // Territory/State/City cascade - matching Sales Overview
  const availableTerritories = user?.territory === 'All India' || ['ceo', 'director', 'vp', 'admin'].includes(user?.role)
    ? ['All Territories', 'North India', 'South India', 'West India', 'East India']
    : user?.territory ? ['All Territories', user.territory] : ['All Territories'];

  const availableStates = territoryFilter !== 'all' && territoryFilter !== 'All Territories' && TERRITORY_MAP[territoryFilter]
    ? ['All States', ...Object.keys(TERRITORY_MAP[territoryFilter].states)]
    : ['All States'];

  const availableCities = stateFilter !== 'all' && stateFilter !== 'All States' && territoryFilter !== 'all' && territoryFilter !== 'All Territories' && TERRITORY_MAP[territoryFilter]
    ? ['All Cities', ...(TERRITORY_MAP[territoryFilter].states[stateFilter] || [])]
    : ['All Cities'];

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="sales-revenue-dashboard">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          Revenue Report
        </h1>
        <p className="text-muted-foreground mt-1">Track revenue from won deals</p>
      </div>

      {/* Filters - matching Sales Overview */}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <p className="text-xs font-medium text-emerald-600 mb-1">WON DEALS</p>
          <p className="text-2xl font-bold text-emerald-700">{data.summary.total_leads || 0}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <p className="text-xs font-medium text-green-600 mb-1">GROSS REVENUE</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(data.summary.total_gross)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <p className="text-xs font-medium text-blue-600 mb-1">NET REVENUE</p>
          <p className="text-2xl font-bold text-blue-700">{formatCurrency(data.summary.total_net)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <p className="text-xs font-medium text-amber-600 mb-1">CREDIT NOTES</p>
          <p className="text-2xl font-bold text-amber-700">{formatCurrency(data.summary.total_credit)}</p>
        </Card>
      </div>

      {/* Data Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : data.leads.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No won deals found for the selected filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold">Lead ID</th>
                  <th className="text-left py-3 px-4 font-semibold">Company</th>
                  <th className="text-left py-3 px-4 font-semibold">City</th>
                  <th className="text-left py-3 px-4 font-semibold">Territory</th>
                  <th className="text-left py-3 px-4 font-semibold">Assigned To</th>
                  <th className="text-center py-3 px-4 font-semibold">Invoices</th>
                  <th className="text-right py-3 px-4 font-semibold">Gross</th>
                  <th className="text-right py-3 px-4 font-semibold">Net</th>
                  <th className="text-right py-3 px-4 font-semibold">Credit</th>
                </tr>
              </thead>
              <tbody>
                {data.leads.map((lead, idx) => (
                  <tr 
                    key={lead.id} 
                    className="border-t hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    data-testid={`won-lead-row-${idx}`}
                  >
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs text-primary">{lead.lead_id || '-'}</span>
                    </td>
                    <td className="py-3 px-4 font-medium">{lead.company}</td>
                    <td className="py-3 px-4 text-muted-foreground">{lead.city || '-'}</td>
                    <td className="py-3 px-4 text-muted-foreground">{lead.territory || '-'}</td>
                    <td className="py-3 px-4">{lead.assigned_to_name}</td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant="outline">{lead.invoice_count}</Badge>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-green-600">
                      {formatCurrency(lead.gross_invoice_value)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-blue-600">
                      {formatCurrency(lead.net_invoice_value)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-amber-600">
                      {formatCurrency(lead.credit_note_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/50 border-t-2">
                <tr className="font-semibold">
                  <td className="py-3 px-4" colSpan="5">Total ({data.leads.length} deals)</td>
                  <td className="py-3 px-4 text-center">
                    {data.leads.reduce((sum, l) => sum + (l.invoice_count || 0), 0)}
                  </td>
                  <td className="py-3 px-4 text-right text-green-700">
                    {formatCurrency(data.summary.total_gross)}
                  </td>
                  <td className="py-3 px-4 text-right text-blue-700">
                    {formatCurrency(data.summary.total_net)}
                  </td>
                  <td className="py-3 px-4 text-right text-amber-700">
                    {formatCurrency(data.summary.total_credit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
