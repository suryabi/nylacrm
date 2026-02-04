import React, { useEffect, useState } from 'react';
import { analyticsAPI } from '../utils/api';
import { Card } from '../components/ui/card';
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

export default function Reports() {
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const response = await analyticsAPI.getReports();
      setReports(response.data);
    } catch (error) {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12">Loading reports...</div>;
  }

  const sourceData = Object.entries(reports?.source_analysis || {}).map(([key, value]) => ({
    name: key || 'Unknown',
    value
  }));

  const teamPerformance = reports?.team_performance || [];

  return (
    <div className="space-y-8" data-testid="reports-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold">Reports & Analytics</h1>
        <p className="text-muted-foreground mt-1">Insights into your sales performance</p>
      </div>

      {/* Lead Source Analysis */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-6">Lead Source Analysis</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {sourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sourceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#0891B2" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* Team Performance */}
      {teamPerformance.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-6">Team Performance</h2>
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={teamPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="total_leads" fill="#0891B2" name="Total Leads" />
                <Bar dataKey="closed_won" fill="#10B981" name="Closed Won" />
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              {teamPerformance.map((member, index) => (
                <Card key={index} className="p-4 bg-muted/30">
                  <p className="font-semibold text-lg mb-2">{member.name}</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Leads:</span>
                      <span className="font-medium">{member.total_leads}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Closed Won:</span>
                      <span className="font-medium text-green-600">{member.closed_won}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Conversion:</span>
                      <span className="font-medium">{member.conversion_rate}%</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
