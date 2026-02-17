import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { TrendingUp, IndianRupee, Filter, Loader2 } from 'lucide-react';

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
  if (num >= 10000000) {
    return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  }
  if (num >= 100000) {
    return '₹' + (num / 100000).toFixed(2) + ' L';
  }
  return '₹' + num.toLocaleString('en-IN');
}

export default function SalesRevenueDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [data, setData] = useState({ leads: [], summary: {} });
  const [filterOptions, setFilterOptions] = useState({ cities: [], territories: [], resources: [] });
  
  // Filter states
  const [timeFilter, setTimeFilter] = useState('this_month');
  const [resourceFilter, setResourceFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [territoryFilter, setTerritoryFilter] = useState('');

  useEffect(() => {
    fetchFilterOptions();
    fetchData();
  }, []);

  const fetchFilterOptions = async () => {
    try {
      const res = await axios.get(`${API_URL}/sales-revenue/filters`, { withCredentials: true });
      setFilterOptions(res.data);
    } catch (error) {
      console.error('Failed to load filter options');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('time_filter', timeFilter);
      if (resourceFilter) params.append('resource_id', resourceFilter);
      if (cityFilter) params.append('city', cityFilter);
      if (territoryFilter) params.append('territory', territoryFilter);
      
      const res = await axios.get(`${API_URL}/sales-revenue/won-leads?${params}`, { withCredentials: true });
      setData(res.data);
    } catch (error) {
      toast.error('Failed to load revenue data');
    } finally {
      setLoading(false);
      setApplying(false);
    }
  };

  const handleApplyFilters = () => {
    setApplying(true);
    fetchData();
  };

  const handleResetFilters = () => {
    setTimeFilter('this_month');
    setResourceFilter('');
    setCityFilter('');
    setTerritoryFilter('');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="sales-revenue-dashboard">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          Sales Revenue Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">Track revenue from won deals</p>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Filters</span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Resource</label>
            <select
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
            >
              <option value="">All Resources</option>
              {filterOptions.resources.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">City</label>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
            >
              <option value="">All Cities</option>
              {filterOptions.cities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Territory</label>
            <select
              value={territoryFilter}
              onChange={(e) => setTerritoryFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm"
            >
              <option value="">All Territories</option>
              {filterOptions.territories.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={handleApplyFilters} disabled={applying}>
            {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply Filters
          </Button>
          <Button variant="outline" onClick={handleResetFilters}>
            Reset
          </Button>
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
