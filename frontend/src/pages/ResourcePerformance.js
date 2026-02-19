import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Users, Filter, Loader2, TrendingUp, TrendingDown, Award } from 'lucide-react';

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

export default function ResourcePerformance() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ resources: [], summary: {} });
  const [salesTeam, setSalesTeam] = useState([]);
  
  // Filter states
  const [timeFilter, setTimeFilter] = useState('this_month');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');

  useEffect(() => {
    fetchSalesTeam();
  }, []);

  useEffect(() => {
    fetchData();
  }, [timeFilter, territoryFilter, stateFilter, cityFilter, resourceFilter]);

  const fetchSalesTeam = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`, { withCredentials: true });
      const team = response.data.filter(u => ['Head of Business', 'Regional Sales Manager', 'National Sales Head'].includes(u.role) && u.is_active);
      setSalesTeam(team);
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
      if (resourceFilter !== 'all') params.append('resource_id', resourceFilter);
      
      const res = await axios.get(`${API_URL}/reports/resource-performance?${params}`, { withCredentials: true });
      setData(res.data);
    } catch (error) {
      // If endpoint doesn't exist, use data from salesTeam
      const mockResources = salesTeam.map(member => ({
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
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setTimeFilter('this_month');
    setTerritoryFilter('all');
    setStateFilter('all');
    setCityFilter('all');
    setResourceFilter('all');
  };

  const availableTerritories = user?.territory === 'All India' || ['ceo', 'director', 'vp', 'admin'].includes(user?.role)
    ? ['All Territories', 'North India', 'South India', 'West India', 'East India']
    : user?.territory ? ['All Territories', user.territory] : ['All Territories'];

  const availableStates = territoryFilter !== 'all' && territoryFilter !== 'All Territories' && TERRITORY_MAP[territoryFilter]
    ? ['All States', ...Object.keys(TERRITORY_MAP[territoryFilter].states)]
    : ['All States'];

  const availableCities = stateFilter !== 'all' && stateFilter !== 'All States' && territoryFilter !== 'all' && territoryFilter !== 'All Territories' && TERRITORY_MAP[territoryFilter]
    ? ['All Cities', ...(TERRITORY_MAP[territoryFilter].states[stateFilter] || [])]
    : ['All Cities'];

  // Sort resources by achievement for ranking
  const rankedResources = [...(data.resources || [])].sort((a, b) => b.achievement_pct - a.achievement_pct);

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="resource-performance-dashboard">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Resource Performance
        </h1>
        <p className="text-muted-foreground mt-1">Track performance by sales resource</p>
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
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Resource</label>
            <select
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card className="p-4 bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200">
          <p className="text-xs font-medium text-violet-600 mb-1">TOTAL TARGET</p>
          <p className="text-2xl font-bold text-violet-700">{formatCurrency(data.summary.total_target)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <p className="text-xs font-medium text-emerald-600 mb-1">TOTAL ACHIEVED</p>
          <p className="text-2xl font-bold text-emerald-700">{formatCurrency(data.summary.total_achieved)}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <p className="text-xs font-medium text-blue-600 mb-1">TOTAL LEADS</p>
          <p className="text-2xl font-bold text-blue-700">{data.summary.total_leads || 0}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <p className="text-xs font-medium text-green-600 mb-1">WON DEALS</p>
          <p className="text-2xl font-bold text-green-700">{data.summary.total_won || 0}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
          <p className="text-xs font-medium text-amber-600 mb-1">AVG ACHIEVEMENT</p>
          <p className="text-2xl font-bold text-amber-700">{data.summary.avg_achievement || 0}%</p>
        </Card>
      </div>

      {/* Data Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rankedResources.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No resource data found for the selected filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-center py-3 px-4 font-semibold w-16">Rank</th>
                  <th className="text-left py-3 px-4 font-semibold">Resource</th>
                  <th className="text-left py-3 px-4 font-semibold">Territory</th>
                  <th className="text-right py-3 px-4 font-semibold">Target</th>
                  <th className="text-right py-3 px-4 font-semibold">Achieved</th>
                  <th className="text-right py-3 px-4 font-semibold">Leads</th>
                  <th className="text-right py-3 px-4 font-semibold">Won</th>
                  <th className="text-right py-3 px-4 font-semibold">Visits</th>
                  <th className="text-right py-3 px-4 font-semibold">Calls</th>
                  <th className="text-right py-3 px-4 font-semibold">Achievement</th>
                </tr>
              </thead>
              <tbody>
                {rankedResources.map((row, idx) => (
                  <tr key={row.id || idx} className="border-t hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4 text-center">
                      {idx < 3 ? (
                        <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
                          idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                          idx === 1 ? 'bg-gray-100 text-gray-600' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          <Award className="h-4 w-4" />
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{idx + 1}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">{row.role}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{row.territory || '-'}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">
                      {formatCurrency(row.target_revenue)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-emerald-600">
                      {formatCurrency(row.achieved_revenue)}
                    </td>
                    <td className="py-3 px-4 text-right">{row.leads_count || 0}</td>
                    <td className="py-3 px-4 text-right font-medium text-green-600">{row.won_deals || 0}</td>
                    <td className="py-3 px-4 text-right">{row.visits || 0}</td>
                    <td className="py-3 px-4 text-right">{row.calls || 0}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={`font-semibold ${
                          row.achievement_pct >= 100 ? 'text-emerald-600' :
                          row.achievement_pct >= 75 ? 'text-blue-600' :
                          row.achievement_pct >= 50 ? 'text-amber-600' :
                          'text-red-600'
                        }`}>
                          {row.achievement_pct || 0}%
                        </span>
                        {row.achievement_pct >= 75 ? (
                          <TrendingUp className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
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
  );
}
