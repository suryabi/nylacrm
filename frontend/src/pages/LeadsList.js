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
import { MultiSelect } from '../components/ui/multi-select';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Plus, Search, Trash2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid, List, Filter, Users, Loader2, Check } from 'lucide-react';
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
import { useMasterLocations } from '../hooks/useMasterLocations';

const statusColors = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  contacted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  qualified: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  not_qualified: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  in_progress: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  trial_in_progress: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  proposal_shared: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
  proposal_approved_by_customer: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
  won: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  lost: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  future_followup: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
};

const getStatusLabel = (status) => {
  const labels = {
    'new': 'New', 'contacted': 'Contacted', 'qualified': 'Qualified', 'not_qualified': 'Not Qualified',
    'in_progress': 'In Progress', 'trial_in_progress': 'Trial in Progress', 'proposal_shared': 'Proposal Shared',
    'proposal_approved_by_customer': 'Proposal Approved', 'won': 'Won', 'lost': 'Lost', 'future_followup': 'Future Follow up'
  };
  return labels[status] || status;
};

const TIME_FILTERS = [
  { value: 'this_week', label: 'This Week' }, { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' }, { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' }, { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_quarter', label: 'This Quarter' }, { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'lifetime', label: 'Lifetime' },
];

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'not_qualified', label: 'Not Qualified' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'trial_in_progress', label: 'Trial in Progress' },
  { value: 'proposal_shared', label: 'Proposal Shared' },
  { value: 'proposal_approved_by_customer', label: 'Proposal Approved' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'future_followup', label: 'Future Follow up' },
];

export default function LeadsList() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Initialize filters from sessionStorage or defaults
  const getInitialFilter = (key, defaultValue) => {
    const saved = sessionStorage.getItem(`leads_filter_${key}`);
    return saved !== null ? saved : defaultValue;
  };
  
  const getInitialArrayFilter = (key) => {
    const saved = sessionStorage.getItem(`leads_filter_${key}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch { return []; }
    }
    return [];
  };
  
  const [searchQuery, setSearchQuery] = useState(() => getInitialFilter('search', ''));
  const [statusFilter, setStatusFilter] = useState(() => getInitialArrayFilter('status'));
  const [territoryFilter, setTerritoryFilter] = useState(() => getInitialFilter('territory', 'all'));
  const [stateFilter, setStateFilter] = useState(() => getInitialFilter('state', 'all'));
  const [cityFilter, setCityFilter] = useState(() => getInitialFilter('city', 'all'));
  const [assignedToFilter, setAssignedToFilter] = useState(() => getInitialArrayFilter('assigned_to'));
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState(null);
  const [timeFilter, setTimeFilter] = useState(() => getInitialFilter('time', 'lifetime'));
  
  const { territories, getStateNamesByTerritoryName, getCityNamesByStateName } = useMasterLocations();
  
  const [currentPage, setCurrentPage] = useState(() => {
    const saved = sessionStorage.getItem('leads_filter_page');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [debouncedSearch, setDebouncedSearch] = useState(() => getInitialFilter('search', ''));
  
  // Save filters to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem('leads_filter_search', searchQuery);
    sessionStorage.setItem('leads_filter_status', JSON.stringify(statusFilter));
    sessionStorage.setItem('leads_filter_territory', territoryFilter);
    sessionStorage.setItem('leads_filter_state', stateFilter);
    sessionStorage.setItem('leads_filter_city', cityFilter);
    sessionStorage.setItem('leads_filter_assigned_to', JSON.stringify(assignedToFilter));
    sessionStorage.setItem('leads_filter_time', timeFilter);
    sessionStorage.setItem('leads_filter_page', currentPage.toString());
  }, [searchQuery, statusFilter, territoryFilter, stateFilter, cityFilter, assignedToFilter, timeFilter, currentPage]);
  
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchQuery); setCurrentPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metric = params.get('metric');
    const timeFilterParam = params.get('time_filter');
    if (timeFilterParam) setTimeFilter(timeFilterParam);
    if (metric) {
      if (metric === 'won') setStatusFilter('closed_won');
      else if (metric === 'lost') setStatusFilter('closed_lost');
      else if (metric === 'new_leads') setStatusFilter('new');
    }
    fetchUsers();
  }, []);
  
  useEffect(() => { fetchLeads(); }, [currentPage, itemsPerPage, debouncedSearch, statusFilter, cityFilter, stateFilter, territoryFilter, assignedToFilter, timeFilter]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(process.env.REACT_APP_BACKEND_URL + '/api/users', {
        headers: { Authorization: `Bearer ${token}` }, withCredentials: true
      });
      setUsers(response.data);
    } catch (error) { console.error('Failed to load users'); }
  };

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage, pageSize: itemsPerPage, search: debouncedSearch || undefined,
        status: statusFilter.length > 0 ? statusFilter.join(',') : undefined, 
        city: cityFilter !== 'all' ? cityFilter : undefined,
        state: stateFilter !== 'all' ? stateFilter : undefined, 
        territory: territoryFilter !== 'all' ? territoryFilter : undefined,
        assigned_to: assignedToFilter.length > 0 ? assignedToFilter.join(',') : undefined, 
        time_filter: timeFilter !== 'lifetime' ? timeFilter : undefined,
      };
      const response = await leadsAPI.getAll(params);
      const { data, total, total_pages } = response.data;
      setLeads(data); setTotalLeads(total); setTotalPages(total_pages);
    } catch (error) { toast.error('Failed to load leads'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    try {
      await leadsAPI.delete(leadToDelete.id);
      toast.success('Lead deleted successfully');
      fetchLeads();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to delete lead'); }
    finally { setDeleteDialogOpen(false); setLeadToDelete(null); }
  };

  const handleSort = (field) => {
    if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('desc'); }
    setCurrentPage(1);
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 text-muted-foreground" />;
    return sortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1 text-primary" /> : <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
  };

  const handleResetFilters = () => {
    setSearchQuery(''); setStatusFilter([]); setTerritoryFilter('all'); setStateFilter('all');
    setCityFilter('all'); setAssignedToFilter([]); setTimeFilter('lifetime'); setCurrentPage(1);
    // Clear sessionStorage
    sessionStorage.removeItem('leads_filter_search');
    sessionStorage.removeItem('leads_filter_status');
    sessionStorage.removeItem('leads_filter_territory');
    sessionStorage.removeItem('leads_filter_state');
    sessionStorage.removeItem('leads_filter_city');
    sessionStorage.removeItem('leads_filter_assigned_to');
    sessionStorage.removeItem('leads_filter_time');
    sessionStorage.removeItem('leads_filter_page');
    window.history.replaceState({}, '', '/leads');
  };

  const handleCompleteFollowup = async (e, lead) => {
    e.stopPropagation(); // Prevent row click navigation
    try {
      await leadsAPI.update(lead.id, { next_followup_date: null });
      toast.success(`Follow-up completed for ${lead.company || lead.name}`);
      // Update local state to reflect the change
      setLeads(prevLeads => prevLeads.map(l => 
        l.id === lead.id ? { ...l, next_followup_date: null } : l
      ));
    } catch (error) {
      toast.error('Failed to complete follow-up');
    }
  };

  let sortedLeads = [...leads].sort((a, b) => {
    let aVal = a[sortField], bVal = b[sortField];
    if (['created_at', 'updated_at', 'next_followup_date', 'last_contacted_date'].includes(sortField)) {
      aVal = aVal ? new Date(aVal).getTime() : 0; bVal = bVal ? new Date(bVal).getTime() : 0;
    } else if (typeof aVal === 'string') { aVal = (aVal || '').toLowerCase(); bVal = (bVal || '').toLowerCase(); }
    return sortDirection === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  const displayLeads = sortedLeads;
  const hasActiveFilters = searchQuery || statusFilter.length > 0 || territoryFilter !== 'all' || stateFilter !== 'all' || cityFilter !== 'all' || assignedToFilter.length > 0 || timeFilter !== 'lifetime';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="leads-list-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-6">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/50 dark:to-indigo-900/30">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Leads</h1>
                <p className="text-muted-foreground">
                  {totalLeads} {totalLeads === 1 ? 'lead' : 'leads'} found
                  {timeFilter !== 'this_week' && <span className="ml-2 text-primary font-medium">({TIME_FILTERS.find(f => f.value === timeFilter)?.label})</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/leads/kanban')} data-testid="kanban-view-button" className="gap-2 border-slate-200 dark:border-slate-700">
                <LayoutGrid className="h-4 w-4" /> Kanban View
              </Button>
              <Button onClick={() => navigate('/leads/new')} data-testid="add-lead-button" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg shadow-blue-200/50 dark:shadow-blue-900/30">
                <Plus className="h-4 w-4 mr-2" /> Add Lead
              </Button>
            </div>
          </div>
        </header>

        {/* Filters */}
        <Card className="mb-6 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">Filters</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Time Period</label>
                <Select value={timeFilter} onValueChange={setTimeFilter}>
                  <SelectTrigger className="h-9 border-slate-200 dark:border-slate-700" data-testid="leads-time-filter"><SelectValue placeholder="All Time" /></SelectTrigger>
                  <SelectContent>{TIME_FILTERS.map(filter => <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Territory</label>
                <Select value={territoryFilter} onValueChange={(v) => { setTerritoryFilter(v); setStateFilter('all'); setCityFilter('all'); }}>
                  <SelectTrigger className="h-9 border-slate-200 dark:border-slate-700" data-testid="leads-territory-filter"><SelectValue placeholder="All Territories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Territories</SelectItem>
                    {territories.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">State</label>
                <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setCityFilter('all'); }}>
                  <SelectTrigger className="h-9 border-slate-200 dark:border-slate-700" data-testid="leads-state-filter"><SelectValue placeholder="All States" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {territoryFilter !== 'all' && getStateNamesByTerritoryName(territoryFilter).map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">City</label>
                <Select value={cityFilter} onValueChange={setCityFilter}>
                  <SelectTrigger className="h-9 border-slate-200 dark:border-slate-700" data-testid="leads-city-filter"><SelectValue placeholder="All Cities" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cities</SelectItem>
                    {stateFilter !== 'all' && getCityNamesByStateName(stateFilter).map(city => <SelectItem key={city} value={city}>{city}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <MultiSelect
                  options={STATUS_OPTIONS}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  placeholder="All Statuses"
                  data-testid="leads-status-filter"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Sales Resource</label>
                <MultiSelect
                  options={users.map(u => ({ value: u.id, label: u.name }))}
                  selected={assignedToFilter}
                  onChange={setAssignedToFilter}
                  placeholder="All Resources"
                  data-testid="leads-assigned-filter"
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={handleResetFilters} className="w-full h-9 border-slate-200 dark:border-slate-700" disabled={!hasActiveFilters} data-testid="leads-reset-filters">Reset</Button>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by company name, contact, or lead ID..." className="pl-9 h-9 border-slate-200 dark:border-slate-700" data-testid="leads-search-input" />
              </div>
            </div>
          </div>
        </Card>

        {/* Leads Table */}
        <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative"><div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" /><Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" /></div>
              <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading leads...</p>
            </div>
          ) : displayLeads.length === 0 ? (
            <div className="text-center py-16">
              <Users className="h-16 w-16 mx-auto mb-4 text-slate-200 dark:text-slate-700" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400" data-testid="no-leads-message">
                {hasActiveFilters ? 'No leads found matching your filters.' : 'No leads yet. Add your first lead to get started!'}
              </p>
              {hasActiveFilters && <Button onClick={handleResetFilters} variant="outline" className="mt-4">Clear All Filters</Button>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                      <TableHead><button onClick={() => handleSort('company')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-company">Lead{getSortIcon('company')}</button></TableHead>
                      <TableHead><button onClick={() => handleSort('city')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-location">Location{getSortIcon('city')}</button></TableHead>
                      <TableHead><button onClick={() => handleSort('assigned_to')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-assigned">Assigned To{getSortIcon('assigned_to')}</button></TableHead>
                      <TableHead><button onClick={() => handleSort('last_contacted_date')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-last-contacted">Last Contacted{getSortIcon('last_contacted_date')}</button></TableHead>
                      <TableHead><button onClick={() => handleSort('next_followup_date')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-followup">Next Follow-up{getSortIcon('next_followup_date')}</button></TableHead>
                      <TableHead>Contact Method</TableHead>
                      <TableHead><button onClick={() => handleSort('status')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-status">Status{getSortIcon('status')}</button></TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayLeads.map((lead) => (
                      <TableRow key={lead.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 border-b border-slate-50 dark:border-slate-800/50 transition-colors" onClick={() => navigate(`/leads/${lead.id}`)} data-testid={`lead-row-${lead.id}`}>
                        <TableCell data-testid={`lead-cell-${lead.id}`}>
                          <div><p className="font-medium text-primary">{lead.company || lead.name}</p><p className="text-xs text-muted-foreground font-mono">{lead.lead_id || '-'}</p></div>
                        </TableCell>
                        <TableCell>{lead.city}</TableCell>
                        <TableCell>{lead.assigned_to ? users.find(u => u.id === lead.assigned_to)?.name || 'Unknown' : '-'}</TableCell>
                        <TableCell>{lead.last_contacted_date ? format(new Date(lead.last_contacted_date), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell>
                          {lead.next_followup_date ? (() => {
                            const followupDate = new Date(lead.next_followup_date);
                            const today = new Date();
                            const diffDays = Math.ceil((followupDate - today) / (1000 * 60 * 60 * 24));
                            const isUrgent = diffDays >= 0 && diffDays <= 3;
                            return <span className={`${isUrgent ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 px-2 py-1 rounded font-semibold' : ''}`}>{format(followupDate, 'MMM d, yyyy')}</span>;
                          })() : '-'}
                        </TableCell>
                        <TableCell>{lead.last_contact_method ? <span className="text-xs text-muted-foreground">{lead.last_contact_method.replace('_', ' ')}</span> : '-'}</TableCell>
                        <TableCell><Badge className={statusColors[lead.status]}>{getStatusLabel(lead.status)}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setLeadToDelete(lead); setDeleteDialogOpen(true); }} data-testid={`delete-lead-${lead.id}`}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Rows per page:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(parseInt(v)); setCurrentPage(1); }}>
                    <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
                  </Select>
                </div>
                <span className="text-sm text-muted-foreground">Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, totalLeads)} of {totalLeads}</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setCurrentPage(currentPage - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) pageNum = i + 1;
                      else if (currentPage <= 3) pageNum = i + 1;
                      else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                      else pageNum = currentPage - 2 + i;
                      return <Button key={pageNum} variant={currentPage === pageNum ? 'default' : 'outline'} size="sm" onClick={() => { setCurrentPage(pageNum); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-10">{pageNum}</Button>;
                    })}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setCurrentPage(currentPage + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={currentPage === totalPages || totalPages === 0}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete {leadToDelete?.company || leadToDelete?.name}? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
