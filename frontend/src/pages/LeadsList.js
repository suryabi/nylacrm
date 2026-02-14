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
import { Plus, Search, Trash2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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

const statusColors = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-green-100 text-green-800',
  not_qualified: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-purple-100 text-purple-800',
  proposal_stage: 'bg-orange-100 text-orange-800',
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
    'proposal_stage': 'Proposal Stage',
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
  const [cityFilter, setCityFilter] = useState('all');
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState(null);
  const [timeFilter, setTimeFilter] = useState(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // Sorting state - default to created_at desc
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');

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
    
    fetchLeads();
    fetchUsers();
  }, []);

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
      const response = await leadsAPI.getAll();
      setLeads(response.data);
    } catch (error) {
      toast.error('Failed to load leads');
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

  // Filter leads
  let filteredLeads = leads;

  // Apply time filter if set from dashboard
  if (timeFilter) {
    const now = new Date();
    let startDate;
    
    switch(timeFilter) {
      case 'this_week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        break;
      case 'last_week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay() - 7);
        const endOfLastWeek = new Date(startDate);
        endOfLastWeek.setDate(startDate.getDate() + 6);
        filteredLeads = filteredLeads.filter(lead => {
          const leadDate = new Date(lead.created_at);
          return leadDate >= startDate && leadDate <= endOfLastWeek;
        });
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        filteredLeads = filteredLeads.filter(lead => {
          const leadDate = new Date(lead.created_at);
          return leadDate >= startDate && leadDate <= endOfLastMonth;
        });
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
        const endOfLastQ = new Date(now.getFullYear(), (lastQ + 1) * 3, 0);
        filteredLeads = filteredLeads.filter(lead => {
          const leadDate = new Date(lead.created_at);
          return leadDate >= startDate && leadDate <= endOfLastQ;
        });
        break;
      default: // lifetime
        break;
    }
    
    // Apply date filter for non-specific cases
    if (startDate && !['last_week', 'last_month', 'last_quarter'].includes(timeFilter)) {
      filteredLeads = filteredLeads.filter(lead => new Date(lead.created_at) >= startDate);
    }
  }

  if (searchQuery) {
    filteredLeads = filteredLeads.filter(
      (lead) =>
        (lead.company && lead.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (lead.contact_person && lead.contact_person.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (lead.name && lead.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (lead.email && lead.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (lead.city && lead.city.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }

  if (statusFilter !== 'all') {
    filteredLeads = filteredLeads.filter((lead) => lead.status === statusFilter);
  }

  if (cityFilter !== 'all') {
    filteredLeads = filteredLeads.filter((lead) => lead.city === cityFilter);
  }

  if (assignedToFilter !== 'all') {
    filteredLeads = filteredLeads.filter((lead) => lead.assigned_to === assignedToFilter);
  }

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCityFilter('all');
    setAssignedToFilter('all');
    setTimeFilter(null);
    window.history.replaceState({}, '', '/leads');
  };

  // Sort leads
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

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLeads = filteredLeads.slice(startIndex, endIndex);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return <div className="flex justify-center py-12">Loading leads...</div>;
  }

  return (
    <div className="space-y-6" data-testid="leads-list-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Leads</h1>
          <p className="text-muted-foreground mt-1">
            {filteredLeads.length} {filteredLeads.length === 1 ? 'lead' : 'leads'} found
            {timeFilter && (
              <span className="ml-2 text-primary font-medium">
                ({TIME_FILTERS.find(f => f.value === timeFilter)?.label || timeFilter})
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => navigate('/leads/new')} data-testid="add-lead-button">
          <Plus className="h-4 w-4 mr-2" />
          Add Lead
        </Button>
      </div>

      {/* Leads Table */}
      {filteredLeads.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-border">
          <p className="text-muted-foreground" data-testid="no-leads-message">
            {searchQuery || statusFilter !== 'all'
              ? 'No leads found matching your filters.'
              : 'No leads yet. Add your first lead to get started!'}
          </p>
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
                      Company
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
                      placeholder="Search..."
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
                      <option value="proposal_stage">Proposal Stage</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                      <option value="future_followup">Future Follow up</option>
                    </select>
                  </TableHead>
                  <TableHead className="p-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLeads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    data-testid={`lead-row-${lead.id}`}
                  >
                    <TableCell className="font-medium">{lead.company || lead.name}</TableCell>
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
                Showing {startIndex + 1}-{Math.min(endIndex, filteredLeads.length)} of {filteredLeads.length}
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
                disabled={currentPage === totalPages}
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
