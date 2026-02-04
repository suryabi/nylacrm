import React, { useEffect, useState } from 'react';
import { usersAPI } from '../utils/api';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Users, TrendingUp } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function TeamManagement() {
  const [users, setUsers] = useState([]);
  const [orgChart, setOrgChart] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, orgRes] = await Promise.all([
        usersAPI.getAll(),
        axios.get(`${API_URL}/users/org-chart`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);
      setUsers(usersRes.data);
      setOrgChart(orgRes.data.org_chart);
    } catch (error) {
      toast.error('Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12">Loading team...</div>;
  }

  const getRoleBadgeColor = (role) => {
    const colors = {
      ceo: 'bg-purple-100 text-purple-800',
      director: 'bg-blue-100 text-blue-800',
      vp: 'bg-cyan-100 text-cyan-800',
      sales_manager: 'bg-green-100 text-green-800',
      sales_rep: 'bg-gray-100 text-gray-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const renderOrgNode = (node, level = 0) => {
    if (!node) return null;
    
    const marginLeft = level * 40;
    const hasDottedLine = node.dotted_line_reports && node.dotted_line_reports.length > 0;
    
    return (
      <div key={node.id} className="mb-4">
        {/* Current Node */}
        <Card
          className="p-4 hover:shadow-md transition-shadow"
          style={{ marginLeft: `${marginLeft}px` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
                {node.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-lg">{node.name}</p>
                <p className="text-sm text-primary">{node.designation}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {node.city && node.state ? `${node.city}, ${node.state}` : ''}
                  {node.territory ? ` • ${node.territory}` : ''}
                </p>
              </div>
            </div>
            <Badge className={getRoleBadgeColor(node.role)}>
              {node.role.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </Card>

        {/* Dotted Line Reports (if any) */}
        {hasDottedLine && (
          <div className="mt-2" style={{ marginLeft: `${marginLeft + 20}px` }}>
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
              <span className="border-t-2 border-dashed border-primary w-6"></span>
              Dotted Line Reporting
            </p>
            {node.dotted_line_reports.map((dr) => (
              <Card key={dr.id} className="p-3 mb-2 bg-muted/30 border-dashed">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{dr.name}</p>
                    <p className="text-xs text-muted-foreground">{dr.designation}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {dr.role.replace('_', ' ')}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Direct Reports */}
        {node.direct_reports && node.direct_reports.length > 0 && (
          <div className="mt-2">
            {node.direct_reports.map((child) => renderOrgNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8" data-testid="team-management-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold">Team Management</h1>
        <p className="text-muted-foreground mt-1">Organizational hierarchy and team members</p>
      </div>

      {/* Organizational Chart */}
      {orgChart && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Users className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-semibold">Organizational Hierarchy</h2>
          </div>
          {renderOrgNode(orgChart)}
        </Card>
      )}

      {/* Full Team Table */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-semibold">All Team Members</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name & Designation</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Territory</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} data-testid={`team-member-${user.id}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      {user.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.designation || user.role.replace('_', ' ').charAt(0).toUpperCase() + user.role.slice(1)}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <p>{user.email}</p>
                    <p className="text-muted-foreground">{user.phone || '-'}</p>
                  </div>
                </TableCell>
                <TableCell>
                  {user.city && user.state && user.country 
                    ? `${user.city}, ${user.state}`
                    : user.city || user.state || user.country || '-'}
                </TableCell>
                <TableCell>{user.territory || '-'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {user.role.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
