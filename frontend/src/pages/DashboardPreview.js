import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { analyticsAPI } from '../utils/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import {
  Users,
  TrendingUp,
  DollarSign,
  Calendar,
  Bell,
  Settings,
  LogOut,
  Menu
} from 'lucide-react';
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

const navigation = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Leads', href: '/leads' },
  { name: 'Daily Status', href: '/daily-status' },
  { name: 'Team Status', href: '/team-status' },
  { name: 'Reports', href: '/reports' },
  { name: 'Team', href: '/team' },
];

export default function DashboardPreview() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const statusData = Object.entries(analytics?.status_distribution || {}).map(([key, value]) => ({
    name: key.replace('_', ' ').toUpperCase(),
    value
  }));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-foreground-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation - Horizontal */}
      <nav className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-bold text-foreground">Nyla CRM</h1>
              
              {/* Desktop Navigation */}
              <div className="hidden md:flex items-center gap-2">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className="px-4 py-2 rounded-full text-sm font-medium text-foreground-muted hover:bg-secondary hover:text-foreground transition-colors"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* Right Side Actions */}
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="rounded-full">
                <Bell className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Settings className="h-5 w-5" />
              </Button>
              
              {/* User Menu */}
              <div className="flex items-center gap-3 pl-3 border-l border-border">
                <div className="hidden md:block text-right">
                  <p className="text-sm font-medium text-foreground">{user?.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace('_', ' ')}</p>
                </div>
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
              </div>
              
              <Button variant="ghost" size="icon" className="md:hidden rounded-full" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-light text-foreground mb-2">Dashboard</h1>
          <p className="text-foreground-muted">Overview of your sales pipeline and team performance</p>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Total Leads"
            value={analytics?.total_leads || 0}
            icon={Users}
            change="+12%"
          />
          <MetricCard
            title="Conversion Rate"
            value={`${analytics?.conversion_rate || 0}%`}
            icon={TrendingUp}
            change="+2.5%"
          />
          <MetricCard
            title="Pipeline Value"
            value={`₹${((analytics?.pipeline_value || 0) / 100000).toFixed(1)}L`}
            icon={DollarSign}
            change="+₹8L"
          />
          <MetricCard
            title="Follow-ups Today"
            value={analytics?.today_follow_ups || 0}
            icon={Calendar}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lead Status Distribution */}
          <Card className="p-8 bg-card border border-border rounded-2xl shadow-sm">
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
          <Card className="p-8 bg-card border border-border rounded-2xl shadow-sm">
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
      </main>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, change }) {
  return (
    <Card className="p-6 bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        {change && (
          <span className="text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
            {change}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground font-medium mb-2">{title}</p>
      <p className="text-3xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}
