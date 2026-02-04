import React, { useEffect, useState } from 'react';
import { analyticsAPI } from '../utils/api';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { Users, TrendingUp, DollarSign, Calendar } from 'lucide-react';
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

export default function Dashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const response = await analyticsAPI.getDashboard();
      setAnalytics(response.data);
    } catch (error) {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
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
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-light text-foreground mb-2">Dashboard</h1>
        <p className="text-foreground-muted">Overview of your sales pipeline and team performance</p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Leads"
          value={analytics?.total_leads || 0}
          icon={Users}
          testId="total-leads-metric"
        />
        <MetricCard
          title="Conversion Rate"
          value={`${analytics?.conversion_rate || 0}%`}
          icon={TrendingUp}
          testId="conversion-rate-metric"
        />
        <MetricCard
          title="Pipeline Value"
          value={`₹${((analytics?.pipeline_value || 0) / 100000).toFixed(1)}L`}
          icon={DollarSign}
          testId="pipeline-value-metric"
        />
        <MetricCard
          title="Follow-ups Today"
          value={analytics?.today_follow_ups || 0}
          icon={Calendar}
          testId="followups-today-metric"
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

function MetricCard({ title, value, icon: Icon, testId }) {
  return (
    <Card className="p-6 bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all" data-testid={testId}>
      <div className="flex items-start justify-between mb-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground font-medium mb-2">{title}</p>
      <p className="text-3xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}
