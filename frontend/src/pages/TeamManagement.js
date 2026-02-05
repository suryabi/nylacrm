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
import { Plus, Loader2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const DESIGNATIONS = [
  'CEO',
  'Vice President',
  'Director, Sales',
  'Sales Manager',
  'National Head - Sales',
  'BD Executive'
];

const ROLE_MAPPING = {
  'CEO': 'ceo',
  'Vice President': 'vp',
  'Director, Sales': 'director',
  'Sales Manager': 'sales_manager',
  'National Head - Sales': 'sales_manager',
  'BD Executive': 'sales_rep'
};

const TERRITORIES = [
  'All India',
  'North India',
  'South India',
  'West India',
  'East India',
  'Central India'
];

// Priority states first, then alphabetical
const PRIORITY_STATES = [
  'Telangana',
  'Tamil Nadu',
  'Delhi',
  'Maharashtra',
  'Punjab',
  'Jammu & Kashmir',
  'Karnataka'
];

const OTHER_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Kerala',
  'Madhya Pradesh',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Rajasthan',
  'Sikkim',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman & Nicobar Islands',
  'Chandigarh',
  'Dadra & Nagar Haveli',
  'Daman & Diu',
  'Lakshadweep',
  'Puducherry'
];

const INDIAN_STATES = [...PRIORITY_STATES, ...OTHER_STATES];

const toTitleCase = (str) => {
  if (!str) return '';
  return str.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

export default function TeamManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchUsers();
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

      {/* Team Members Table */}
      <Card className="p-6">
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
            {sortedUsers.map((user) => (
              <TableRow key={user.id} data-testid={`team-member-${user.id}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      {user.name && user.name[0] ? user.name[0].toUpperCase() : '?'}
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
                  {user.city && user.state ? `${user.city}, ${user.state}` : '-'}
                </TableCell>
                <TableCell>{user.territory || '-'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {user.role ? user.role.replace('_', ' ') : 'N/A'}
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
    password: '',
    reports_to: '',
    is_active: true
  });

  useEffect(() => {
    fetchManagers();
  }, []);

  const fetchManagers = async () => {
    try {
      const response = await usersAPI.getAll();
      setAllUsers(response.data);
    } catch (error) {
      console.error('Failed to load users');
    }
  };

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
          <Select value={formData.territory} onValueChange={(v) => updateField('territory', v)} required>
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
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => updateField('city', e.target.value)}
            placeholder="e.g., Mumbai"
            data-testid="team-city-input"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Select value={formData.state} onValueChange={(v) => updateField('state', v)}>
            <SelectTrigger data-testid="team-state-select">
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Priority States</div>
              {PRIORITY_STATES.map(state => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
              <div className="border-t my-1"></div>
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Other States</div>
              {OTHER_STATES.map(state => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
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
