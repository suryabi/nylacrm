import React, { useEffect, useState } from 'react';
import { analyticsAPI, followUpsAPI } from '../utils/api';
import { Card } from '../components/ui/card';
import { Users, TrendingUp, DollarSign, Calendar } from 'lucide-react';
import { toast } from 'sonner';
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
  Legend,
  ResponsiveContainer
} from 'recharts';

const COLORS = ['#0891B2', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="p-6 animate-pulse">
            <div className="h-20 bg-muted rounded" />
          </Card>
        ))}
      </div>
    );
  }

  const statusData = Object.entries(analytics?.status_distribution || {}).map(([key, value]) => ({
    name: key.replace('_', ' ').toUpperCase(),
    value
  }));

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Leads"
          value={analytics?.total_leads || 0}
          icon={Users}
          color="text-primary"
          testId="total-leads-metric"
        />
        <MetricCard
          title="Conversion Rate"
          value={`${analytics?.conversion_rate || 0}%`}
          icon={TrendingUp}
          color="text-green-600"
          testId="conversion-rate-metric"
        />
        <MetricCard
          title="Pipeline Value"
          value={`$${(analytics?.pipeline_value || 0).toLocaleString()}`}
          icon={DollarSign}
          color="text-amber-600"
          testId="pipeline-value-metric"
        />
        <MetricCard
          title="Follow-ups Today"
          value={analytics?.today_follow_ups || 0}
          icon={Calendar}
          color="text-purple-600"
          testId="followups-today-metric"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Status Distribution */}
        <Card className="p-6" data-testid="status-distribution-chart">
          <h3 className="text-lg font-semibold mb-4">Lead Status Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
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
        <Card className="p-6" data-testid="status-bar-chart">
          <h3 className="text-lg font-semibold mb-4">Lead Pipeline</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#0891B2" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color, testId }) {
  return (
    <Card className="p-6 hover:shadow-lg transition-shadow" data-testid={testId}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium mb-2">{title}</p>
          <p className="text-3xl font-semibold">{value}</p>
        </div>
        <div className={cn("p-3 rounded-lg bg-muted", color)}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </Card>
  );
}

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
