import React, { useEffect, useState } from 'react';
import axios from 'axios';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { MapPin } from 'lucide-react';

const COLORS = ['#0891B2', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function LocationAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/analytics/locations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAnalytics(response.data);
    } catch (error) {
      toast.error('Failed to load location analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12">Loading analytics...</div>;
  }

  const countryData = analytics?.by_country || [];
  const stateData = analytics?.by_state || [];
  const cityData = analytics?.by_city || [];
  const regionData = analytics?.by_region || [];
  const teamLocations = analytics?.team_locations || [];

  return (
    <div className="space-y-8" data-testid="location-analytics-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MapPin className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-semibold">Location Analytics</h1>
          <p className="text-muted-foreground mt-1">Geographic distribution of leads and team</p>
        </div>
      </div>

      {/* Country Distribution */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-6">Leads by Country</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={countryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ country, total_leads }) => `${country}: ${total_leads}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="total_leads"
                  nameKey="country"
                >
                  {countryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {countryData.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded" style={{backgroundColor: COLORS[index % COLORS.length]}} />
                  <span className="font-medium">{item.country}</span>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{item.total_leads} leads</p>
                  <p className="text-muted-foreground">${(item.pipeline_value || 0).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* State/Province Distribution */}
      {stateData.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-6">Leads by State/Province</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stateData.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="state" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total_leads" fill="#0891B2" name="Total Leads" />
              <Bar dataKey="closed_won" fill="#10B981" name="Closed Won" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Top Cities */}
      {cityData.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-6">Top 20 Cities</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>City</TableHead>
                <TableHead>Total Leads</TableHead>
                <TableHead>Closed Won</TableHead>
                <TableHead>Conversion Rate</TableHead>
                <TableHead>Pipeline Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cityData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{item.city}</TableCell>
                  <TableCell>{item.total_leads}</TableCell>
                  <TableCell className="text-green-600">{item.closed_won}</TableCell>
                  <TableCell>{item.conversion_rate}%</TableCell>
                  <TableCell>${(item.pipeline_value || 0).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Region/Territory Distribution */}
      {regionData.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-6">Leads by Region/Territory</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {regionData.map((item, index) => (
              <Card key={index} className="p-4 bg-muted/30">
                <p className="font-semibold text-lg mb-2">{item.region}</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Leads:</span>
                    <span className="font-medium">{item.total_leads}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Closed Won:</span>
                    <span className="font-medium text-green-600">{item.closed_won}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Conversion:</span>
                    <span className="font-medium">{item.conversion_rate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pipeline Value:</span>
                    <span className="font-medium">${(item.pipeline_value || 0).toLocaleString()}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}

      {/* Team Locations */}
      {teamLocations.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-6">Sales Team Locations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamLocations.map((member, index) => (
              <Card key={index} className="p-4 bg-muted/30">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                    {member.name[0].toUpperCase()}
                  </div>
                  <p className="font-semibold">{member.name}</p>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p>{member.city !== 'Unknown' ? member.city : '-'}</p>
                      <p className="text-muted-foreground">
                        {member.state !== 'Unknown' ? member.state : '-'}, {member.country !== 'Unknown' ? member.country : '-'}
                      </p>
                      {member.territory !== 'Unknown' && (
                        <p className="text-primary mt-1">Territory: {member.territory}</p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
