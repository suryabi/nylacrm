import React, { useEffect, useState } from 'react';
import { usersAPI } from '../utils/api';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Plus, Loader2, Edit, Trash2, Clock, Activity, Eye, MousePointer } from 'lucide-react';
import { formatDuration, formatRelativeTime, getPageName } from '../hooks/useActivityTracker';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const DESIGNATIONS = [
  'CEO',
  'Director',
  'Vice President',
  'National Sales Head',
  'Regional Sales Manager',
  'Partner - Sales',
  'Head of Business'
];

const ROLE_MAPPING = {
  'CEO': 'CEO',
  'Director': 'Director',
  'Vice President': 'Vice President',
  'National Sales Head': 'National Sales Head',
  'Regional Sales Manager': 'Regional Sales Manager',
  'Partner - Sales': 'Partner - Sales',
  'Head of Business': 'Head of Business'
};

const TERRITORIES = [
  'All India',
  'North India',
  'South India',
  'West India',
  'East India'
];

const TERRITORY_LOCATIONS = {
  'North India': {
    states: {
      'Delhi': ['New Delhi'],
      'Uttar Pradesh': ['Noida']
    }
  },
  'South India': {
    states: {
      'Karnataka': ['Bengaluru'],
      'Tamil Nadu': ['Chennai'],
      'Telangana': ['Hyderabad']
    }
  },
  'West India': {
    states: {
      'Maharashtra': ['Mumbai', 'Pune'],
      'Gujarat': ['Ahmedabad']
    }
  },
  'East India': {
    states: {
      'West Bengal': ['Kolkata']
    }
  },
  'All India': {
    states: {
      'Delhi': ['New Delhi'],
      'Uttar Pradesh': ['Noida'],
      'Karnataka': ['Bengaluru'],
      'Tamil Nadu': ['Chennai'],
      'Telangana': ['Hyderabad'],
      'Maharashtra': ['Mumbai', 'Pune'],
      'Gujarat': ['Ahmedabad'],
      'West Bengal': ['Kolkata']
    }
  }
};

const PRIORITY_STATES = [
  'Telangana',
  'Tamil Nadu',
  'Delhi',
  'Maharashtra',
  'Gujarat',
  'Karnataka',
  'Uttar Pradesh',
  'West Bengal'
];

const OTHER_STATES = [];

const INDIAN_STATES = [...PRIORITY_STATES, ...OTHER_STATES];

const toTitleCase = (str) => {
  if (!str) return '';
  return str.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

export default function TeamManagement() {
  const [users, setUsers] = useState([]);
  const [teamActivity, setTeamActivity] = useState({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'chart'
  const [editUser, setEditUser] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [selectedUserActivity, setSelectedUserActivity] = useState(null);

  useEffect(() => {
    fetchUsers();
    fetchTeamActivity();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await usersAPI.getAll();
      setUsers(response.data);
    } catch (error) {
      toast.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamActivity = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/activity/team`,
        { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
      );
      // Convert array to object keyed by user_id
      const activityMap = {};
      response.data.forEach(item => {
        activityMap[item.user_id] = item;
      });
      setTeamActivity(activityMap);
    } catch (error) {
      console.error('Failed to load team activity:', error);
    }
  };

  const viewUserActivity = async (user) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/activity/user/${user.id}`,
        { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
      );
      setSelectedUserActivity({ ...response.data, userName: user.name });
      setActivityDialogOpen(true);
    } catch (error) {
      toast.error('Failed to load user activity');
    }
  };

  const handleToggleActive = async (user) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/${user.id}`,
        { is_active: !user.is_active },
        { 
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      toast.success(`User ${user.is_active ? 'deactivated' : 'activated'} successfully`);
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update user status');
    }
  };

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/${userToDelete.id}`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      toast.success('User and all associated data deleted successfully');
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete user');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12">Loading team...</div>;
  }

  // Sort users by hierarchy
  const sortedUsers = [...users].sort((a, b) => {
    const roleOrder = { ceo: 1, director: 2, vp: 3, sales_manager: 4, sales_rep: 5, admin: 6 };
    return (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99);
  });

  return (
    <div className="space-y-6" data-testid="team-management-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Team Management</h1>
          <p className="text-muted-foreground mt-1">Manage your sales team members</p>
        </div>
        <div className="flex gap-3">
          <div className="flex gap-2 bg-secondary p-1 rounded-full">
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              onClick={() => setViewMode('table')}
              size="sm"
              className="rounded-full"
            >
              Table
            </Button>
            <Button
              variant={viewMode === 'chart' ? 'default' : 'ghost'}
              onClick={() => setViewMode('chart')}
              size="sm"
              className="rounded-full"
            >
              Org Chart
            </Button>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-team-member-button">
                <Plus className="h-4 w-4 mr-2" />
                Add Team Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
              </DialogHeader>
              <AddTeamMemberForm
                onSuccess={() => {
                  setDialogOpen(false);
                  fetchUsers();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Edit Team Member Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
          </DialogHeader>
          <EditTeamMemberForm
            user={editUser}
            onSuccess={() => {
              setEditDialogOpen(false);
              setEditUser(null);
              fetchUsers();
            }}
            onCancel={() => {
              setEditDialogOpen(false);
              setEditUser(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong>{userToDelete?.name}</strong>? This will permanently remove the user and all associated data including:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>All customer interactions</li>
              <li>All leads and opportunities</li>
              <li>All activity history</li>
            </ul>
            <p className="text-sm font-semibold text-red-600">
              This action cannot be undone.
            </p>
            <div className="flex gap-3 pt-4">
              <Button
                variant="destructive"
                onClick={handleDelete}
              >
                Delete Permanently
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setUserToDelete(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {viewMode === 'table' ? (
        // Table View
        <Card className="p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name & Designation</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Territory</TableHead>
              <TableHead>Last Active</TableHead>
              <TableHead>Session Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedUsers.map((user) => {
              const activity = teamActivity[user.id];
              const lastActive = activity?.last_active;
              const sessionTime = activity?.session?.total_time_seconds || 0;
              const isOnlineNow = lastActive && (new Date() - new Date(lastActive)) < 120000; // Within 2 mins
              
              return (
              <TableRow key={user.id} data-testid={`team-member-${user.id}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                        {user.name && user.name[0] ? user.name[0].toUpperCase() : '?'}
                      </div>
                      {isOnlineNow && (
                        <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-green-500 rounded-full border-2 border-white" title="Online now" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.designation || user.role.replace('_', ' ')}
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
                  <span className="text-sm">{user.territory || '-'}</span>
                  {user.city && user.state && (
                    <p className="text-xs text-muted-foreground">{user.city}, {user.state}</p>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={`text-sm ${isOnlineNow ? 'text-green-600 font-medium' : ''}`}>
                      {isOnlineNow ? 'Online' : formatRelativeTime(lastActive)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{formatDuration(sessionTime)}</span>
                  </div>
                  {activity?.session?.pages_visited?.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activity.session.pages_visited.length} pages
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => viewUserActivity(user)}
                      title="View activity details"
                    >
                      <Eye className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditUser(user);
                        setEditDialogOpen(true);
                      }}
                      title="Edit user"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleActive(user)}
                      title={user.is_active ? "Deactivate user" : "Activate user"}
                    >
                      {user.is_active ? (
                        <svg className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setUserToDelete(user);
                        setDeleteDialogOpen(true);
                      }}
                      className="text-red-600 hover:text-red-700"
                      title="Delete user"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      ) : (
        // Org Chart View
        <OrgChartView users={sortedUsers} />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && userToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteDialogOpen(false)}>
          <Card className="p-8 max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-4 mb-6">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Delete Team Member?</h3>
                <p className="text-muted-foreground">
                  Are you sure you want to permanently delete <strong>{userToDelete.name}</strong>?
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-6">
              <p className="text-sm font-semibold text-red-800 mb-2">⚠️ This action will delete:</p>
              <ul className="text-sm text-red-700 space-y-1">
                <li>• User account and profile</li>
                <li>• All leads assigned to this user</li>
                <li>• All activities created by this user</li>
                <li>• All daily status updates</li>
                <li>• All target allocations</li>
                <li>• This action cannot be undone</li>
              </ul>
            </div>

            <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg mb-6">
              <p className="text-sm text-muted-foreground">
                <strong>Alternative:</strong> Consider deactivating the user instead to preserve all historical data while preventing future assignments.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="flex-1 rounded-full">
                Cancel
              </Button>
              <Button onClick={handleDelete} className="flex-1 rounded-full bg-red-600 hover:bg-red-700">
                Delete Permanently
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Activity Details Dialog */}
      <Dialog open={activityDialogOpen} onOpenChange={setActivityDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Session Activity - {selectedUserActivity?.userName}
            </DialogTitle>
          </DialogHeader>
          
          {selectedUserActivity && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium mb-1">Last Active</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {formatRelativeTime(selectedUserActivity.last_active)}
                  </p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-lg">
                  <p className="text-xs text-emerald-600 font-medium mb-1">Session Duration</p>
                  <p className="text-lg font-semibold text-emerald-900">
                    {formatDuration(selectedUserActivity.total_time_seconds)}
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-xs text-purple-600 font-medium mb-1">Session Start</p>
                  <p className="text-lg font-semibold text-purple-900">
                    {selectedUserActivity.session_start 
                      ? new Date(selectedUserActivity.session_start).toLocaleTimeString() 
                      : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Pages Visited */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Pages Visited
                </h4>
                {selectedUserActivity.pages_visited?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedUserActivity.pages_visited
                      .sort((a, b) => b.total_time_seconds - a.total_time_seconds)
                      .map((page, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="font-medium">{getPageName(page.page)}</p>
                          <p className="text-xs text-muted-foreground">{page.page}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatDuration(page.total_time_seconds)}</p>
                          <p className="text-xs text-muted-foreground">{page.visit_count} visits</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No page visits recorded</p>
                )}
              </div>

              {/* Actions Performed */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <MousePointer className="h-4 w-4" />
                  Actions Performed
                </h4>
                {selectedUserActivity.actions?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedUserActivity.actions
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 10)
                      .map((action, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="font-medium text-sm">
                            {action.action.replace(/_/g, ' ').replace('navigated to ', '')}
                          </p>
                        </div>
                        <Badge variant="secondary">{action.count}x</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No actions recorded</p>
                )}
              </div>

              {/* Recent Events Timeline */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Recent Activity Timeline
                </h4>
                {selectedUserActivity.events?.length > 0 ? (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {selectedUserActivity.events
                      .slice(-20)
                      .reverse()
                      .map((event, idx) => (
                      <div key={idx} className="flex items-center gap-3 py-2 border-b border-muted last:border-0">
                        <div className={`h-2 w-2 rounded-full ${event.type === 'action' ? 'bg-blue-500' : 'bg-green-500'}`} />
                        <p className="text-sm flex-1">
                          {event.action 
                            ? event.action.replace(/_/g, ' ')
                            : `Viewed ${getPageName(event.page)}`}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No recent events</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


function AddTeamMemberForm({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    designation: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    territory: '',
    role: 'sales_rep',
    department: 'sales',
    password: '',
    reports_to: '',
    is_active: true
  });

  React.useEffect(() => {
    const fetchManagers = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/users`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAllUsers(response.data);
      } catch (error) {
        console.error('Failed to load users');
      }
    };
    fetchManagers();
  }, []);

  const updateField = (field, value) => {
    // Apply title case to all fields except email
    if (field !== 'email' && field !== 'password' && typeof value === 'string') {
      value = toTitleCase(value);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDesignationChange = (designation) => {
    const role = ROLE_MAPPING[designation] || 'sales_rep';
    setFormData(prev => ({ 
      ...prev, 
      designation: designation,
      role: role 
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/users/create`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Team member added successfully');
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add team member');
    } finally {
      setLoading(false);
    }
  };

  const territoryStates = formData.territory && TERRITORY_LOCATIONS[formData.territory] 
    ? Object.keys(TERRITORY_LOCATIONS[formData.territory].states)
    : [];

  const stateCities = formData.state && formData.territory && TERRITORY_LOCATIONS[formData.territory]
    ? TERRITORY_LOCATIONS[formData.territory].states[formData.state] || []
    : [];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            required
            data-testid="team-name-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="designation">Designation *</Label>
          <Select value={formData.designation} onValueChange={handleDesignationChange} required>
            <SelectTrigger data-testid="team-designation-select">
              <SelectValue placeholder="Select designation" />
            </SelectTrigger>
            <SelectContent>
              {DESIGNATIONS.map(des => (
                <SelectItem key={des} value={des}>{des}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="department">Department *</Label>
          <Select value={formData.department} onValueChange={(v) => setFormData(prev => ({ ...prev, department: v }))}>
            <SelectTrigger data-testid="team-department-select">
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sales">Sales</SelectItem>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="both">Both (Admin)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            required
            data-testid="team-email-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number *</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="+91"
            required
            data-testid="team-phone-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password *</Label>
          <Input
            id="password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            required
            data-testid="team-password-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="territory">Territory *</Label>
          <Select value={formData.territory} onValueChange={(v) => {
            updateField('territory', v);
            // Reset state and city when territory changes
            setFormData(prev => ({...prev, territory: v, state: '', city: ''}));
          }} required>
            <SelectTrigger data-testid="team-territory-select">
              <SelectValue placeholder="Select territory" />
            </SelectTrigger>
            <SelectContent>
              {TERRITORIES.map(territory => (
                <SelectItem key={territory} value={territory}>{territory}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reports_to">Reports To</Label>
          <Select value={formData.reports_to || 'none'} onValueChange={(v) => setFormData(prev => ({...prev, reports_to: v === 'none' ? '' : v}))}>
            <SelectTrigger data-testid="team-reports-to-select">
              <SelectValue placeholder="Select manager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (Top Level)</SelectItem>
              {allUsers.filter(u => ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales'].includes(u.role) && u.is_active).map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name} - {user.designation || user.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Select 
            value={formData.state} 
            onValueChange={(v) => {
              updateField('state', v);
              setFormData(prev => ({...prev, state: v, city: ''}));
            }}
            disabled={!formData.territory}
          >
            <SelectTrigger data-testid="team-state-select">
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {territoryStates.map(state => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Select
            value={formData.city}
            onValueChange={(v) => updateField('city', v)}
            disabled={!formData.state}
          >
            <SelectTrigger data-testid="team-city-select">
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent>
              {stateCities.map(city => (
                <SelectItem key={city} value={city}>{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="role_display">Role (Auto-set based on Designation)</Label>
          <Input
            id="role_display"
            value={formData.role.replace('_', ' ').toUpperCase()}
            disabled
            className="bg-muted"
          />
        </div>
      </div>
      
      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={loading} data-testid="submit-team-member">
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...</> : 'Add Team Member'}
        </Button>
        <Button type="button" variant="outline" onClick={() => onSuccess()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EditTeamMemberForm({ user, onSuccess, onCancel }) {
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    designation: user?.designation || '',
    email: user?.email || '',
    phone: user?.phone || '',
    city: user?.city || '',
    state: user?.state || '',
    territory: user?.territory || '',
    role: user?.role || 'sales_rep',
    department: user?.department || 'sales',
    reports_to: user?.reports_to || '',
    is_active: user?.is_active ?? true
  });

  React.useEffect(() => {
    const fetchManagers = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/users`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAllUsers(response.data);
      } catch (error) {
        console.error('Failed to load users');
      }
    };
    fetchManagers();
  }, []);

  React.useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        designation: user.designation || '',
        email: user.email || '',
        phone: user.phone || '',
        city: user.city || '',
        state: user.state || '',
        territory: user.territory || '',
        role: user.role || 'sales_rep',
        reports_to: user.reports_to || '',
        is_active: user.is_active ?? true
      });
    }
  }, [user]);

  const updateField = (field, value) => {
    // Apply title case to all fields except email
    if (field !== 'email' && field !== 'password' && typeof value === 'string') {
      value = toTitleCase(value);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDesignationChange = (designation) => {
    const role = ROLE_MAPPING[designation] || 'sales_rep';
    setFormData(prev => ({ 
      ...prev, 
      designation: designation,
      role: role 
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/users/${user.id}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Team member updated successfully');
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update team member');
    } finally {
      setLoading(false);
    }
  };

  const territoryStates = formData.territory && TERRITORY_LOCATIONS[formData.territory] 
    ? Object.keys(TERRITORY_LOCATIONS[formData.territory].states)
    : [];

  const stateCities = formData.state && formData.territory && TERRITORY_LOCATIONS[formData.territory]
    ? TERRITORY_LOCATIONS[formData.territory].states[formData.state] || []
    : [];

  if (!user) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="edit-name">Name *</Label>
          <Input
            id="edit-name"
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-designation">Designation *</Label>
          <Select value={formData.designation} onValueChange={handleDesignationChange} required>
            <SelectTrigger>
              <SelectValue placeholder="Select designation" />
            </SelectTrigger>
            <SelectContent>
              {DESIGNATIONS.map(des => (
                <SelectItem key={des} value={des}>{des}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-email">Email *</Label>
          <Input
            id="edit-email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-phone">Phone Number *</Label>
          <Input
            id="edit-phone"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="+91"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-territory">Territory *</Label>
          <Select value={formData.territory} onValueChange={(v) => {
            updateField('territory', v);
            // Reset state and city when territory changes
            setFormData(prev => ({...prev, territory: v, state: '', city: ''}));
          }} required>
            <SelectTrigger>
              <SelectValue placeholder="Select territory" />
            </SelectTrigger>
            <SelectContent>
              {TERRITORIES.map(territory => (
                <SelectItem key={territory} value={territory}>{territory}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-reports_to">Reports To</Label>
          <Select value={formData.reports_to || 'none'} onValueChange={(v) => setFormData(prev => ({...prev, reports_to: v === 'none' ? '' : v}))}>
            <SelectTrigger>
              <SelectValue placeholder="Select manager" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (Top Level)</SelectItem>
              {allUsers.filter(u => ['CEO', 'Director', 'Vice President', 'National Sales Head', 'Regional Sales Manager', 'Partner - Sales'].includes(u.role) && u.is_active && u.id !== user.id).map(manager => (
                <SelectItem key={manager.id} value={manager.id}>
                  {manager.name} - {manager.designation || manager.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-state">State</Label>
          <Select 
            value={formData.state} 
            onValueChange={(v) => {
              updateField('state', v);
              setFormData(prev => ({...prev, state: v, city: ''}));
            }}
            disabled={!formData.territory}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {territoryStates.map(state => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-city">City</Label>
          <Select
            value={formData.city}
            onValueChange={(v) => updateField('city', v)}
            disabled={!formData.state}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent>
              {stateCities.map(city => (
                <SelectItem key={city} value={city}>{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-role_display">Role (Auto-set based on Designation)</Label>
          <Input
            id="edit-role_display"
            value={formData.role.replace('_', ' ').toUpperCase()}
            disabled
            className="bg-muted"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-is_active">Status</Label>
          <Select value={formData.is_active ? 'active' : 'inactive'} onValueChange={(v) => setFormData(prev => ({...prev, is_active: v === 'active'}))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={loading}>
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</> : 'Update Team Member'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function OrgChartView({ users }) {
  const topLevel = users.filter(u => !u.reports_to);
  
  const getDirectReports = (userId) => users.filter(u => u.reports_to === userId);

  const renderNode = (user, level = 0) => {
    const directReports = getDirectReports(user.id);

    return (
      <div key={user.id} className="flex flex-col items-center">
        <div className="mb-4">
          <Card className={`w-44 p-3 border-2 rounded-lg ${level === 0 ? 'bg-primary/10 border-primary' : level === 1 ? 'bg-secondary border-primary/30' : 'bg-card border-border'}`}>
            <div className="flex items-start gap-2 mb-2">
              <div className="text-xs text-muted-foreground w-16 flex-shrink-0">{user.phone?.substring(3, 13) || '-'}</div>
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">{user.name?.[0]}</div>
            </div>
            <h3 className="font-bold text-sm truncate">{user.name}</h3>
            <p className="text-xs text-muted-foreground truncate">{user.designation || user.role}</p>
            {user.territory && <p className="text-xs text-primary truncate mt-1">{user.territory}</p>}
          </Card>
        </div>

        {directReports.length > 0 && (
          <>
            <div className="w-0.5 h-6 bg-primary/50"></div>
            <div className="relative">
              {directReports.length > 1 && (
                <>
                  <div className="absolute left-1/2 top-0 w-0.5 h-2 bg-primary/50 -translate-x-1/2"></div>
                  <div className="h-0.5 bg-primary/50 mb-2" style={{width: `${(directReports.length - 1) * 176 + 44}px`, marginLeft: `-${((directReports.length - 1) * 176 + 44) / 2 - 88}px`}}></div>
                </>
              )}
            </div>
            <div className="flex gap-4 items-start">
              {directReports.map(report => (
                <div key={report.id} className="flex flex-col items-center">
                  {directReports.length > 1 && <div className="w-0.5 h-2 bg-primary/50 mb-2"></div>}
                  {renderNode(report, level + 1)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <Card className="p-8 border rounded-2xl overflow-x-auto">
      <h2 className="text-xl font-semibold mb-6 text-center">Reporting Structure</h2>
      <div className="min-w-max pb-8 flex justify-center">
        {topLevel.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No hierarchy found</p>
        ) : (
          topLevel.map(user => renderNode(user))
        )}
      </div>
      <div className="text-center text-xs text-muted-foreground mt-6 p-4 bg-primary/5 rounded-lg">
        <p className="font-semibold mb-2">How to Read:</p>
        <p>• Top person is the manager</p>
        <p>• Lines connect manager to direct reports (going down)</p>
        <p>• People at same level are peers</p>
        <p>• Phone number shown on left of each card</p>
      </div>
    </Card>
  );
}

