import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsAPI } from '../utils/api';
import { Card } from '../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { Users, TrendingUp, Phone, MapPin, UserPlus, CheckCircle, XCircle } from 'lucide-react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

const COLORS = ['hsl(155, 35%, 42%)', 'hsl(42, 85%, 65%)', 'hsl(25, 50%, 55%)', 'hsl(155, 25%, 60%)', 'hsl(35, 50%, 60%)'];

const TIME_FILTERS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'lifetime', label: 'Lifetime' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('this_month');

  useEffect(() => {
    fetchAnalytics();
  }, [timeFilter]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await analyticsAPI.getDashboard();
      const params = new URLSearchParams({ time_filter: timeFilter });
      const analyticsResponse = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/analytics/dashboard?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await analyticsResponse.json();
      setAnalytics(data);
    } catch (error) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const handleMetricClick = (metric) => {
    const params = new URLSearchParams({ time_filter: timeFilter, metric });
    navigate(`/leads?${params}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-foreground-muted">Loading dashboard...</p>
      </div>
    );
  }

  const statusData = Object.entries(analytics?.status_distribution || {}).map(([key, value]) => ({
    name: key.replace('_', ' ').toUpperCase(),
    value
  }));

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      {/* Page Header with Time Filter */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-light text-foreground mb-2">Dashboard</h1>
          <p className="text-foreground-muted">Overview of your sales pipeline and team performance</p>
        </div>
        <div className="w-64">
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_FILTERS.map(filter => (
                <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Visits"
          value={analytics?.total_visits || 0}
          icon={MapPin}
          onClick={() => handleMetricClick('visits')}
          testId="total-visits-metric"
        />
        <MetricCard
          title="Unique Visits"
          value={analytics?.unique_visits || 0}
          icon={MapPin}
          onClick={() => handleMetricClick('unique_visits')}
          testId="unique-visits-metric"
        />
        <MetricCard
          title="Total Calls"
          value={analytics?.total_calls || 0}
          icon={Phone}
          onClick={() => handleMetricClick('calls')}
          testId="total-calls-metric"
        />
        <MetricCard
          title="Unique Calls"
          value={analytics?.unique_calls || 0}
          icon={Phone}
          onClick={() => handleMetricClick('unique_calls')}
          testId="unique-calls-metric"
        />
        <MetricCard
          title="New Leads"
          value={analytics?.new_leads_added || 0}
          icon={UserPlus}
          onClick={() => handleMetricClick('new_leads')}
          testId="new-leads-metric"
        />
        <MetricCard
          title="Leads Won"
          value={analytics?.leads_won || 0}
          icon={CheckCircle}
          onClick={() => handleMetricClick('won')}
          testId="leads-won-metric"
        />
        <MetricCard
          title="Leads Lost"
          value={analytics?.leads_lost || 0}
          icon={XCircle}
          onClick={() => handleMetricClick('lost')}
          testId="leads-lost-metric"
        />
        <MetricCard
          title="Pipeline Value"
          value={`₹${((analytics?.pipeline_value || 0) / 100000).toFixed(1)}L`}
          icon={TrendingUp}
          testId="pipeline-value-metric"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Status Distribution */}
        <Card className="p-8 bg-card border border-border rounded-2xl shadow-sm" data-testid="status-distribution-chart">
          <h3 className="text-lg font-semibold mb-6 text-foreground">Lead Status Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={90}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Status Bar Chart */}
        <Card className="p-8 bg-card border border-border rounded-2xl shadow-sm" data-testid="status-bar-chart">
          <h3 className="text-lg font-semibold mb-6 text-foreground">Lead Pipeline</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(35, 15%, 88%)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(25, 10%, 45%)' }} />
              <YAxis tick={{ fontSize: 12, fill: 'hsl(25, 10%, 45%)' }} />
              <Tooltip />
              <Bar dataKey="value" fill="hsl(155, 35%, 42%)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, onClick, testId }) {
  return (
    <Card 
      className={`p-5 bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all ${onClick ? 'cursor-pointer hover:border-primary/50' : ''}`}
      data-testid={testId}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}
