import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { leadsAPI } from '../utils/api';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Plus, Search, Trash2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid, List, Filter } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

// Territory and location data
const TERRITORIES = ['All India', 'North India', 'South India', 'East India', 'West India'];
const TERRITORY_STATES = {
  'All India': [],
  'North India': ['Delhi NCR', 'Uttar Pradesh', 'Punjab', 'Haryana', 'Rajasthan', 'Himachal Pradesh', 'Uttarakhand', 'Jammu & Kashmir'],
  'South India': ['Karnataka', 'Tamil Nadu', 'Kerala', 'Andhra Pradesh', 'Telangana'],
  'East India': ['West Bengal', 'Bihar', 'Odisha', 'Jharkhand', 'Assam'],
  'West India': ['Maharashtra', 'Gujarat', 'Goa', 'Madhya Pradesh']
};

const STATE_CITIES = {
  'Karnataka': ['Bengaluru', 'Mysuru', 'Hubli', 'Mangaluru'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai'],
  'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad'],
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Nashik'],
  'Delhi NCR': ['New Delhi', 'Gurugram', 'Noida', 'Faridabad'],
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur'],
  'Uttar Pradesh': ['Lucknow', 'Noida', 'Kanpur', 'Agra'],
};

const statusColors = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-green-100 text-green-800',
  not_qualified: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-purple-100 text-purple-800',
  trial_in_progress: 'bg-indigo-100 text-indigo-800',
  proposal_shared: 'bg-orange-100 text-orange-800',
  proposal_approved_by_customer: 'bg-teal-100 text-teal-800',
  won: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-red-100 text-red-800',
  future_followup: 'bg-slate-100 text-slate-800',
};

const getStatusLabel = (status) => {
  const labels = {
    'new': 'New',
    'contacted': 'Contacted',
    'qualified': 'Qualified',
    'not_qualified': 'Not Qualified',
    'in_progress': 'In Progress',
    'trial_in_progress': 'Trial in Progress',
    'proposal_shared': 'Proposal Shared',
    'proposal_approved_by_customer': 'Proposal Approved by Customer',
    'won': 'Won',
    'lost': 'Lost',
    'future_followup': 'Future Follow up'
  };
  return labels[status] || status;
};

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

export default function LeadsList() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);  // For assigned to names
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState(null);
  const [timeFilter, setTimeFilter] = useState('all');
  
  // Server-side pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Sorting state - default to created_at desc
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  
  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Get available states and cities based on selection
  const availableStates = territoryFilter === 'all' 
    ? ['All States']
    : ['All States', ...(TERRITORY_STATES[territoryFilter] || [])];
  
  const availableCities = stateFilter === 'all'
    ? ['All Cities']
    : ['All Cities', ...(STATE_CITIES[stateFilter] || [])];
  
  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    // Check for URL parameters from dashboard
    const params = new URLSearchParams(window.location.search);
    const metric = params.get('metric');
    const timeFilterParam = params.get('time_filter');
    
    if (timeFilterParam) {
      setTimeFilter(timeFilterParam);
    }
    
    if (metric) {
      // Apply filter based on metric clicked
      if (metric === 'won') {
        setStatusFilter('closed_won');
      } else if (metric === 'lost') {
        setStatusFilter('closed_lost');
      } else if (metric === 'new_leads') {
        setStatusFilter('new');
      }
    }
    
    fetchUsers();
  }, []);
  
  // Fetch leads when pagination or filters change
  useEffect(() => {
    fetchLeads();
  }, [currentPage, itemsPerPage, debouncedSearch, statusFilter, cityFilter]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(process.env.REACT_APP_BACKEND_URL + '/api/users', {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to load users');
    }
  };

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        pageSize: itemsPerPage,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        city: cityFilter !== 'all' ? cityFilter : undefined,
      };
      
      const response = await leadsAPI.getAll(params);
      const { data, total, page, page_size, total_pages } = response.data;
      
      setLeads(data);
      setTotalLeads(total);
      setTotalPages(total_pages);
    } catch (error) {
      toast.error('Failed to load leads');
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await leadsAPI.delete(leadToDelete.id);
      toast.success('Lead deleted successfully');
      fetchLeads();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete lead');
    } finally {
      setDeleteDialogOpen(false);
      setLeadToDelete(null);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-muted-foreground" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-primary" />
      : <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTerritoryFilter('all');
    setStateFilter('all');
    setCityFilter('all');
    setAssignedToFilter('all');
    setTimeFilter('all');
    setCurrentPage(1);
    window.history.replaceState({}, '', '/leads');
  };

  // Client-side filtering for assigned_to and time (server doesn't support these yet)
  let filteredLeads = leads;
  
  // Apply time filter
  if (timeFilter && timeFilter !== 'all') {
    const now = new Date();
    let startDate;
    let endDate;
    
    switch(timeFilter) {
      case 'this_week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        break;
      case 'last_week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay() - 7);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'last_3_months':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'last_6_months':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 6);
        break;
      case 'this_quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'last_quarter':
        const lastQ = Math.floor(now.getMonth() / 3) - 1;
        startDate = new Date(now.getFullYear(), lastQ * 3, 1);
        endDate = new Date(now.getFullYear(), (lastQ + 1) * 3, 0);
        break;
      default: // lifetime
        break;
    }
    
    if (startDate) {
      filteredLeads = filteredLeads.filter(lead => {
        const leadDate = new Date(lead.created_at);
        if (endDate) {
          return leadDate >= startDate && leadDate <= endDate;
        }
        return leadDate >= startDate;
      });
    }
  }

  // Apply assigned_to filter (client-side)
  if (assignedToFilter !== 'all') {
    filteredLeads = filteredLeads.filter((lead) => lead.assigned_to === assignedToFilter);
  }

  // Sort leads (client-side for current page)
  filteredLeads = [...filteredLeads].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    
    if (sortField === 'created_at' || sortField === 'updated_at' || sortField === 'next_followup_date' || sortField === 'last_contacted_date') {
      aVal = aVal ? new Date(aVal).getTime() : 0;
      bVal = bVal ? new Date(bVal).getTime() : 0;
    } else if (typeof aVal === 'string') {
      aVal = (aVal || '').toLowerCase();
      bVal = (bVal || '').toLowerCase();
    }
    
    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  // For display - use filtered leads (after client-side filters applied)
  const displayLeads = filteredLeads;
  const displayTotal = totalLeads; // Use server total for pagination info

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const handleItemsPerPageChange = (newSize) => {
    setItemsPerPage(parseInt(newSize));
    setCurrentPage(1); // Reset to first page
  };

  if (loading) {
    return <div className="flex justify-center py-12">Loading leads...</div>;
  }

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || territoryFilter !== 'all' || 
    stateFilter !== 'all' || cityFilter !== 'all' || assignedToFilter !== 'all' || timeFilter !== 'all';

  return (
    <div className="space-y-6" data-testid="leads-list-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <Filter className="w-8 h-8 text-primary" />
            Leads
          </h1>
          <p className="text-muted-foreground mt-1">
            {totalLeads} {totalLeads === 1 ? 'lead' : 'leads'} found
            {timeFilter !== 'all' && (
              <span className="ml-2 text-primary font-medium">
                ({TIME_FILTERS.find(f => f.value === timeFilter)?.label || timeFilter})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/leads/kanban')} 
            data-testid="kanban-view-button"
            className="gap-2"
          >
            <LayoutGrid className="h-4 w-4" />
            Kanban View
          </Button>
          <Button onClick={() => navigate('/leads/new')} data-testid="add-lead-button">
            <Plus className="h-4 w-4 mr-2" />
            Add Lead
          </Button>
        </div>
      </div>

      {/* Filters Section - Outside Grid */}
      <Card className="p-4 bg-white">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filters</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Time Period */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Time Period</label>
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger className="h-9" data-testid="leads-time-filter">
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent>
                {TIME_FILTERS.map(filter => (
                  <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Territory */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Territory</label>
            <Select value={territoryFilter} onValueChange={(v) => {
              setTerritoryFilter(v);
              setStateFilter('all');
              setCityFilter('all');
            }}>
              <SelectTrigger className="h-9" data-testid="leads-territory-filter">
                <SelectValue placeholder="All Territories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Territories</SelectItem>
                {TERRITORIES.map(territory => (
                  <SelectItem key={territory} value={territory}>{territory}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* State */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">State</label>
            <Select value={stateFilter} onValueChange={(v) => {
              setStateFilter(v);
              setCityFilter('all');
            }}>
              <SelectTrigger className="h-9" data-testid="leads-state-filter">
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {territoryFilter !== 'all' && TERRITORY_STATES[territoryFilter]?.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* City */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">City</label>
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="h-9" data-testid="leads-city-filter">
                <SelectValue placeholder="All Cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {stateFilter !== 'all' && STATE_CITIES[stateFilter]?.map(city => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9" data-testid="leads-status-filter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="not_qualified">Not Qualified</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="trial_in_progress">Trial in Progress</SelectItem>
                <SelectItem value="proposal_shared">Proposal Shared</SelectItem>
                <SelectItem value="proposal_approved_by_customer">Proposal Approved</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="future_followup">Future Follow up</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Assigned To */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Sales Resource</label>
            <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
              <SelectTrigger className="h-9" data-testid="leads-assigned-filter">
                <SelectValue placeholder="All Resources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reset Button */}
          <div className="space-y-1 flex flex-col justify-end">
            <Button 
              variant="outline" 
              onClick={handleResetFilters}
              className="h-9 w-full"
              disabled={!hasActiveFilters}
              data-testid="leads-reset-filters"
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-3 pt-3 border-t">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by company name, contact, or lead ID..."
              className="pl-9 h-9"
              data-testid="leads-search-input"
            />
          </div>
        </div>
      </Card>

      {/* Leads Table */}
      {displayLeads.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-border">
          <p className="text-muted-foreground mb-6" data-testid="no-leads-message">
            {hasActiveFilters
              ? 'No leads found matching your filters.'
              : 'No leads yet. Add your first lead to get started!'}
          </p>
          {hasActiveFilters && (
            <Button onClick={handleResetFilters} variant="outline" className="rounded-full">
              Clear All Filters
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button
                      onClick={() => handleSort('company')}
                      className="flex items-center hover:text-foreground font-semibold"
                      data-testid="sort-company"
                    >
                      Lead
                      {getSortIcon('company')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('city')}
                      className="flex items-center hover:text-foreground font-semibold"
                      data-testid="sort-location"
                    >
                      Location
                      {getSortIcon('city')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('assigned_to')}
                      className="flex items-center hover:text-foreground font-semibold"
                      data-testid="sort-assigned"
                    >
                      Assigned To
                      {getSortIcon('assigned_to')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('last_contacted_date')}
                      className="flex items-center hover:text-foreground font-semibold"
                      data-testid="sort-last-contacted"
                    >
                      Last Contacted
                      {getSortIcon('last_contacted_date')}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('next_followup_date')}
                      className="flex items-center hover:text-foreground font-semibold"
                      data-testid="sort-followup"
                    >
                      Next Follow-up
                      {getSortIcon('next_followup_date')}
                    </button>
                  </TableHead>
                  <TableHead>Contact Method</TableHead>
                  <TableHead>
                    <button
                      onClick={() => handleSort('status')}
                      className="flex items-center hover:text-foreground font-semibold"
                      data-testid="sort-status"
                    >
                      Status
                      {getSortIcon('status')}
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
                
                {/* Filter Row */}
                <TableRow className="bg-background">
                  <TableHead className="p-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search lead..."
                      className="w-full px-2 py-1 text-xs border rounded"
                    />
                  </TableHead>
                  <TableHead className="p-2">
                    <select
                      value={cityFilter}
                      onChange={e => setCityFilter(e.target.value)}
                      className="w-full px-2 py-1 text-xs border rounded bg-background"
                    >
                      <option value="all">All</option>
                      <option value="Bengaluru">Bengaluru</option>
                      <option value="Chennai">Chennai</option>
                      <option value="Hyderabad">Hyderabad</option>
                      <option value="Mumbai">Mumbai</option>
                      <option value="Pune">Pune</option>
                      <option value="New Delhi">New Delhi</option>
                    </select>
                  </TableHead>
                  <TableHead className="p-2">
                    <select
                      value={assignedToFilter}
                      onChange={e => setAssignedToFilter(e.target.value)}
                      className="w-full px-2 py-1 text-xs border rounded bg-background"
                    >
                      <option value="all">All</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </TableHead>
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2"></TableHead>
                  <TableHead className="p-2">
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                      className="w-full px-2 py-1 text-xs border rounded bg-background"
                    >
                      <option value="all">All</option>
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="not_qualified">Not Qualified</option>
                      <option value="in_progress">In Progress</option>
                      <option value="trial_in_progress">Trial in Progress</option>
                      <option value="proposal_shared">Proposal Shared</option>
                      <option value="proposal_approved_by_customer">Proposal Approved</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                      <option value="future_followup">Future Follow up</option>
                    </select>
                  </TableHead>
                  <TableHead className="p-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayLeads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    data-testid={`lead-row-${lead.id}`}
                  >
                    <TableCell data-testid={`lead-cell-${lead.id}`}>
                      <div>
                        <p className="font-medium text-primary">{lead.company || lead.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{lead.lead_id || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell>{lead.city}</TableCell>
                    <TableCell>
                      {lead.assigned_to 
                        ? users.find(u => u.id === lead.assigned_to)?.name || 'Unknown'
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      {lead.last_contacted_date 
                        ? format(new Date(lead.last_contacted_date), 'MMM d, yyyy')
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      {lead.next_followup_date ? (() => {
                        const followupDate = new Date(lead.next_followup_date);
                        const today = new Date();
                        const diffDays = Math.ceil((followupDate - today) / (1000 * 60 * 60 * 24));
                        const isUrgent = diffDays >= 0 && diffDays <= 3;
                        
                        return (
                          <span className={`${isUrgent ? 'bg-amber-100 text-amber-800 px-2 py-1 rounded font-semibold' : ''}`}>
                            {format(followupDate, 'MMM d, yyyy')}
                          </span>
                        );
                      })() : '-'}
                    </TableCell>
                    <TableCell>
                      {lead.last_contact_method ? (
                        <span className="text-xs text-muted-foreground">
                          {lead.last_contact_method.replace('_', ' ')}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[lead.status]}>
                        {getStatusLabel(lead.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLeadToDelete(lead);
                          setDeleteDialogOpen(true);
                        }}
                        data-testid={`delete-lead-${lead.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-lg border border-border p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <Select value={itemsPerPage.toString()} onValueChange={(v) => {
                setItemsPerPage(parseInt(v));
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, totalLeads)} of {totalLeads}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                      className="w-10"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || totalPages === 0}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {leadToDelete?.company || leadToDelete?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
