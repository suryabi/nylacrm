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
import { 
  FilterContainer, 
  FilterItem, 
  FilterGrid, 
  FilterSearch 
} from '../components/ui/filter-bar';
import { Plus, Search, Trash2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid, List, Filter, Users, Loader2, Check, MapPin, Calendar, Target, UserCircle, RotateCcw, Star, TrendingUp, DollarSign, BarChart3, Flame, Snowflake, ThermometerSun, Sparkles, Award, Layers, HelpCircle } from 'lucide-react';
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
import { useLeadStatuses } from '../hooks/useLeadStatuses';
import AppBreadcrumb from '../components/AppBreadcrumb';
import { useNavigation } from '../context/NavigationContext';

const TIME_FILTERS = [
  { value: 'this_week', label: 'This Week' }, { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' }, { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' }, { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_quarter', label: 'This Quarter' }, { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'lifetime', label: 'Lifetime' },
];

export default function LeadsList() {
  const navigate = useNavigate();
  const { navigateTo, saveFilters } = useNavigation();
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { statuses, getStatusLabel, getStatusColor } = useLeadStatuses();
  
  // Lead Scoring Quadrant Metrics
  const [quadrantMetrics, setQuadrantMetrics] = useState({ quadrants: [], unscored: { count: 0 }, total_leads: 0 });
  const [selectedQuadrants, setSelectedQuadrants] = useState([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  
  // Check if we have URL params from dashboard navigation
  const urlParams = new URLSearchParams(window.location.search);
  const hasUrlFilters = urlParams.toString().length > 0;
  
  // Initialize filters - prioritize URL params over localStorage
  const getInitialFilter = (key, defaultValue, urlKey = null) => {
    const urlValue = urlKey ? urlParams.get(urlKey) : null;
    if (urlValue) return urlValue;
    if (hasUrlFilters) return defaultValue; // If coming from dashboard, don't use localStorage
    const saved = localStorage.getItem(`leads_filter_${key}`);
    return saved !== null ? saved : defaultValue;
  };
  
  const getInitialArrayFilter = (key, urlKey = null) => {
    const urlValue = urlKey ? urlParams.get(urlKey) : null;
    if (urlValue) return [urlValue];
    if (hasUrlFilters) return []; // If coming from dashboard, don't use localStorage
    const saved = localStorage.getItem(`leads_filter_${key}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch { return []; }
    }
    return [];
  };
  
  const [searchQuery, setSearchQuery] = useState(() => getInitialFilter('search', ''));
  const [statusFilter, setStatusFilter] = useState(() => getInitialArrayFilter('status', 'status'));
  const [territoryFilter, setTerritoryFilter] = useState(() => getInitialFilter('territory', 'all', 'territory'));
  const [stateFilter, setStateFilter] = useState(() => getInitialFilter('state', 'all', 'state'));
  const [cityFilter, setCityFilter] = useState(() => getInitialFilter('city', 'all', 'city'));
  const [assignedToFilter, setAssignedToFilter] = useState(() => getInitialArrayFilter('assigned_to', 'assigned_to'));
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState(null);
  const [timeFilter, setTimeFilter] = useState(() => getInitialFilter('time', 'lifetime', 'time_filter'));
  
  const { territories, getStateNamesByTerritoryName, getCityNamesByStateName } = useMasterLocations();
  
  const [currentPage, setCurrentPage] = useState(() => {
    const saved = localStorage.getItem('leads_filter_page');
    return saved ? parseInt(saved, 10) : 1;
  });
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const saved = localStorage.getItem('leads_filter_pageSize');
    return saved ? parseInt(saved, 10) : 25;
  });
  const [totalLeads, setTotalLeads] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [debouncedSearch, setDebouncedSearch] = useState(() => getInitialFilter('search', ''));
  
  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('leads_filter_search', searchQuery);
    localStorage.setItem('leads_filter_status', JSON.stringify(statusFilter));
    localStorage.setItem('leads_filter_territory', territoryFilter);
    localStorage.setItem('leads_filter_state', stateFilter);
    localStorage.setItem('leads_filter_city', cityFilter);
    localStorage.setItem('leads_filter_assigned_to', JSON.stringify(assignedToFilter));
    localStorage.setItem('leads_filter_time', timeFilter);
    localStorage.setItem('leads_filter_page', currentPage.toString());
    localStorage.setItem('leads_filter_pageSize', itemsPerPage.toString());
  }, [searchQuery, statusFilter, territoryFilter, stateFilter, cityFilter, assignedToFilter, timeFilter, currentPage, itemsPerPage]);
  
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchQuery); setCurrentPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch quadrant metrics when filters change
  useEffect(() => {
    fetchQuadrantMetrics();
  }, [debouncedSearch, statusFilter, cityFilter, stateFilter, territoryFilter, assignedToFilter, timeFilter]);

  // Fetch users on mount
  useEffect(() => {
    fetchUsers();
  }, []);
  
  useEffect(() => { fetchLeads(); }, [currentPage, itemsPerPage, debouncedSearch, statusFilter, cityFilter, stateFilter, territoryFilter, assignedToFilter, timeFilter, selectedQuadrants, sortField, sortDirection]);

  const fetchQuadrantMetrics = async () => {
    try {
      setMetricsLoading(true);
      const token = localStorage.getItem('token');
      
      // Build query params based on active filters
      const params = new URLSearchParams();
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (statusFilter.length > 0) params.append('status', statusFilter.join(','));
      if (cityFilter !== 'all') params.append('city', cityFilter);
      if (stateFilter !== 'all') params.append('state', stateFilter);
      if (territoryFilter !== 'all') params.append('territory', territoryFilter);
      if (assignedToFilter.length > 0) params.append('assigned_to', assignedToFilter.join(','));
      if (timeFilter !== 'lifetime') params.append('time_filter', timeFilter);
      
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/scoring/quadrant-metrics${params.toString() ? '?' + params.toString() : ''}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }, withCredentials: true
      });
      setQuadrantMetrics(response.data);
    } catch (error) {
      console.error('Failed to load quadrant metrics:', error);
    } finally {
      setMetricsLoading(false);
    }
  };

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
        quadrant: selectedQuadrants.length > 0 ? selectedQuadrants.join(',') : undefined,
        sort_by: sortField,
        sort_order: sortDirection,
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
    setSelectedQuadrants([]); // Clear quadrant selection
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

  // Toggle quadrant selection
  const toggleQuadrant = (quadrant) => {
    setSelectedQuadrants(prev => {
      if (prev.includes(quadrant)) {
        return prev.filter(q => q !== quadrant);
      } else {
        return [...prev, quadrant];
      }
    });
    setCurrentPage(1);
  };

  // Format currency for display
  const formatCurrency = (value) => {
    if (value >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };

  // Format volume for display
  const formatVolume = (value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  // Get quadrant styling
  const getQuadrantStyle = (quadrant, isSelected) => {
    const styles = {
      'Stars': { 
        bg: isSelected ? 'bg-amber-100 ring-2 ring-amber-400' : 'bg-amber-50 hover:bg-amber-100',
        text: 'text-amber-700',
        icon: 'text-amber-500',
        border: 'border-amber-200',
        grade: 'A'
      },
      'Showcase': { 
        bg: isSelected ? 'bg-purple-100 ring-2 ring-purple-400' : 'bg-purple-50 hover:bg-purple-100',
        text: 'text-purple-700',
        icon: 'text-purple-500',
        border: 'border-purple-200',
        grade: 'B'
      },
      'Plough Horses': { 
        bg: isSelected ? 'bg-blue-100 ring-2 ring-blue-400' : 'bg-blue-50 hover:bg-blue-100',
        text: 'text-blue-700',
        icon: 'text-blue-500',
        border: 'border-blue-200',
        grade: 'C'
      },
      'Puzzles': { 
        bg: isSelected ? 'bg-slate-200 ring-2 ring-slate-400' : 'bg-slate-100 hover:bg-slate-200',
        text: 'text-slate-700',
        icon: 'text-slate-500',
        border: 'border-slate-300',
        grade: 'D'
      },
      'unscored': { 
        bg: isSelected ? 'bg-gray-200 ring-2 ring-gray-400' : 'bg-gray-50 hover:bg-gray-100',
        text: 'text-gray-600',
        icon: 'text-gray-400',
        border: 'border-gray-200',
        grade: '-'
      }
    };
    return styles[quadrant] || styles['unscored'];
  };

  // Get quadrant grade (A, B, C, D) for lead list
  const getQuadrantGrade = (lead) => {
    const quadrant = lead?.scoring?.quadrant;
    if (!quadrant) return null;
    
    const gradeMap = {
      'Stars': { grade: 'A', bg: 'bg-amber-500', text: 'text-white', title: 'A - Stars (High Volume, High Value)' },
      'Showcase': { grade: 'B', bg: 'bg-purple-500', text: 'text-white', title: 'B - Showcase (Low Volume, High Value)' },
      'Plough Horses': { grade: 'C', bg: 'bg-blue-500', text: 'text-white', title: 'C - Plough Horses (High Volume, Low Value)' },
      'Puzzles': { grade: 'D', bg: 'bg-slate-500', text: 'text-white', title: 'D - Puzzles (Low Volume, Low Value)' }
    };
    
    const config = gradeMap[quadrant];
    if (!config) return null;
    
    return (
      <span 
        className={`inline-flex items-center justify-center w-6 h-6 rounded-md font-bold text-sm ${config.bg} ${config.text}`}
        title={config.title}
      >
        {config.grade}
      </span>
    );
  };

  // Get user initials with color-coded avatar
  const getUserInitials = (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return null;
    
    const name = user.name || '';
    const nameParts = name.trim().split(' ').filter(Boolean);
    const initials = nameParts.length >= 2 
      ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
    
    // Generate consistent color based on user id/name
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 
      'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500',
      'bg-cyan-500', 'bg-amber-500', 'bg-emerald-500', 'bg-violet-500'
    ];
    const colorIndex = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    const bgColor = colors[colorIndex];
    
    return (
      <div 
        className={`w-8 h-8 rounded-full ${bgColor} flex items-center justify-center text-white text-xs font-semibold cursor-pointer`}
        title={user.name}
      >
        {initials}
      </div>
    );
  };

  // Get temperature icon and styling
  const getTemperatureIcon = (temperature) => {
    if (!temperature) return null;
    
    switch (temperature) {
      case 'hot':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600" title="Hot Lead">
            <Flame className="h-3.5 w-3.5 fill-red-500" />
          </span>
        );
      case 'warm':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600" title="Warm Lead">
            <ThermometerSun className="h-3.5 w-3.5" />
          </span>
        );
      case 'cold':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600" title="Cold Lead">
            <Snowflake className="h-3.5 w-3.5" />
          </span>
        );
      default:
        return null;
    }
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

  // Use leads directly since sorting is now server-side
  const displayLeads = leads;
  const hasActiveFilters = searchQuery || statusFilter.length > 0 || territoryFilter !== 'all' || stateFilter !== 'all' || cityFilter !== 'all' || assignedToFilter.length > 0 || timeFilter !== 'lifetime' || selectedQuadrants.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="leads-list-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Breadcrumb */}
        <AppBreadcrumb />
        
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

        {/* Lead Scoring Quadrant Metrics Bar */}
        <Card className="mb-6 p-4 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="quadrant-metrics-bar">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">Lead Scoring Categories</span>
              {selectedQuadrants.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedQuadrants.length} selected
                </Badge>
              )}
            </div>
            {selectedQuadrants.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { setSelectedQuadrants([]); setCurrentPage(1); }}
                className="text-xs h-7"
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Clear Selection
              </Button>
            )}
          </div>
          
          {metricsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Quadrant Tiles */}
              {quadrantMetrics.quadrants.map((q) => {
                const isSelected = selectedQuadrants.includes(q.quadrant);
                const style = getQuadrantStyle(q.quadrant, isSelected);
                return (
                  <div
                    key={q.quadrant}
                    onClick={() => toggleQuadrant(q.quadrant)}
                    className={`p-4 rounded-xl cursor-pointer transition-all ${style.bg} ${style.border} border ${isSelected ? 'shadow-md' : 'hover:shadow-sm'}`}
                    data-testid={`quadrant-tile-${q.quadrant.toLowerCase().replace(' ', '-')}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-lg ${
                          q.quadrant === 'Stars' ? 'bg-amber-500 text-white' :
                          q.quadrant === 'Showcase' ? 'bg-purple-500 text-white' :
                          q.quadrant === 'Plough Horses' ? 'bg-blue-500 text-white' :
                          'bg-slate-500 text-white'
                        }`}>
                          {style.grade}
                        </span>
                        <span className={`font-semibold text-sm ${style.text}`}>{q.quadrant}</span>
                      </div>
                      <div className={`text-2xl font-bold ${style.text}`}>{q.count}</div>
                    </div>
                    
                    {/* Prominent Value and Volume */}
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-current/10">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Volume</p>
                        <p className={`text-lg font-bold ${style.text}`}>
                          {q.total_opportunity_volume > 0 ? formatVolume(q.total_opportunity_volume) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Value</p>
                        <p className={`text-lg font-bold ${style.text}`}>
                          {q.total_estimated_value > 0 ? `₹${formatCurrency(q.total_estimated_value)}` : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Unscored Tile */}
              {quadrantMetrics.unscored && quadrantMetrics.unscored.count > 0 && (
                <div
                  onClick={() => toggleQuadrant('unscored')}
                  className={`p-4 rounded-xl cursor-pointer transition-all ${getQuadrantStyle('unscored', selectedQuadrants.includes('unscored')).bg} ${getQuadrantStyle('unscored', selectedQuadrants.includes('unscored')).border} border ${selectedQuadrants.includes('unscored') ? 'shadow-md' : 'hover:shadow-sm'}`}
                  data-testid="quadrant-tile-unscored"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-lg bg-gray-400 text-white">
                        -
                      </span>
                      <span className="font-semibold text-sm text-gray-600">Unscored</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-600">{quadrantMetrics.unscored.count}</div>
                  </div>
                  
                  {/* Prominent Value and Volume */}
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-200">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Volume</p>
                      <p className="text-lg font-bold text-gray-600">
                        {quadrantMetrics.unscored.total_opportunity_volume > 0 ? formatVolume(quadrantMetrics.unscored.total_opportunity_volume) : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Value</p>
                      <p className="text-lg font-bold text-gray-600">
                        {quadrantMetrics.unscored.total_estimated_value > 0 ? `₹${formatCurrency(quadrantMetrics.unscored.total_estimated_value)}` : '-'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Contemporary Filters */}
        <FilterContainer 
          title="Filters" 
          activeFiltersCount={[
            searchQuery, 
            statusFilter.length > 0, 
            territoryFilter !== 'all', 
            stateFilter !== 'all', 
            cityFilter !== 'all', 
            assignedToFilter.length > 0, 
            timeFilter !== 'lifetime'
          ].filter(Boolean).length}
          onReset={handleResetFilters}
          className="mb-6"
        >
          <FilterGrid columns={7}>
            <FilterItem label="Time Period" icon={Calendar}>
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" data-testid="leads-time-filter">
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {TIME_FILTERS.map(filter => (
                    <SelectItem key={filter.value} value={filter.value} className="rounded-lg">{filter.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
            
            <FilterItem label="Territory" icon={MapPin}>
              <Select value={territoryFilter} onValueChange={(v) => { setTerritoryFilter(v); setStateFilter('all'); setCityFilter('all'); }}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" data-testid="leads-territory-filter">
                  <SelectValue placeholder="All Territories" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="rounded-lg">All Territories</SelectItem>
                  {territories.map(t => <SelectItem key={t.id} value={t.name} className="rounded-lg">{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FilterItem>
            
            <FilterItem label="State" icon={MapPin}>
              <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setCityFilter('all'); }}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" data-testid="leads-state-filter">
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="rounded-lg">All States</SelectItem>
                  {territoryFilter !== 'all' && getStateNamesByTerritoryName(territoryFilter).map(state => (
                    <SelectItem key={state} value={state} className="rounded-lg">{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
            
            <FilterItem label="City" icon={MapPin}>
              <Select value={cityFilter} onValueChange={setCityFilter}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" data-testid="leads-city-filter">
                  <SelectValue placeholder="All Cities" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="rounded-lg">All Cities</SelectItem>
                  {stateFilter !== 'all' && getCityNamesByStateName(stateFilter).map(city => (
                    <SelectItem key={city} value={city} className="rounded-lg">{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
            
            <FilterItem label="Status" icon={Target}>
              <MultiSelect
                options={statuses.map(s => ({ value: s.id, label: s.label }))}
                selected={statusFilter}
                onChange={setStatusFilter}
                placeholder="All Statuses"
                className="h-10 rounded-xl"
                data-testid="leads-status-filter"
              />
            </FilterItem>
            
            <FilterItem label="Sales Resource" icon={UserCircle}>
              <MultiSelect
                options={users.map(u => ({ value: u.id, label: u.name }))}
                selected={assignedToFilter}
                onChange={setAssignedToFilter}
                placeholder="All Resources"
                className="h-10 rounded-xl"
                data-testid="leads-assigned-filter"
              />
            </FilterItem>
            
            <FilterItem label="Search" icon={Search}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  type="text" 
                  value={searchQuery} 
                  onChange={e => setSearchQuery(e.target.value)} 
                  placeholder="Company, contact..." 
                  className="pl-10 h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" 
                  data-testid="leads-search-input" 
                />
              </div>
            </FilterItem>
          </FilterGrid>
        </FilterContainer>

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
                      <TableHead className="w-[200px] min-w-[200px] max-w-[200px]"><button onClick={() => handleSort('company')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-company">Lead{getSortIcon('company')}</button></TableHead>
                      <TableHead><button onClick={() => handleSort('city')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-location">Location{getSortIcon('city')}</button></TableHead>
                      <TableHead className="w-[80px]"><button onClick={() => handleSort('assigned_to')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-assigned">Owner{getSortIcon('assigned_to')}</button></TableHead>
                      <TableHead><button onClick={() => handleSort('last_contacted_date')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-last-contacted">Last Contacted{getSortIcon('last_contacted_date')}</button></TableHead>
                      <TableHead><button onClick={() => handleSort('next_followup_date')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-followup">Next Follow-up{getSortIcon('next_followup_date')}</button></TableHead>
                      <TableHead><button onClick={() => handleSort('estimated_revenue')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-revenue">Est. Revenue{getSortIcon('estimated_revenue')}</button></TableHead>
                      <TableHead><button onClick={() => handleSort('status')} className="flex items-center hover:text-foreground font-semibold" data-testid="sort-status">Status{getSortIcon('status')}</button></TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayLeads.map((lead) => (
                      <TableRow key={lead.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 border-b border-slate-50 dark:border-slate-800/50 transition-colors" onClick={() => {
                        // Save current filters before navigating
                        saveFilters({ searchQuery, statusFilter, territoryFilter, stateFilter, cityFilter, assignedToFilter, timeFilter });
                        navigateTo(`/leads/${lead.id}`, { label: lead.company || lead.name || 'Lead Details' });
                      }} data-testid={`lead-row-${lead.id}`}>
                        <TableCell className="w-[200px] min-w-[200px] max-w-[200px]" data-testid={`lead-cell-${lead.id}`}>
                          <div className="flex items-center gap-2">
                            {getQuadrantGrade(lead)}
                            <div className="flex-1 min-w-0 max-w-[140px]">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-primary truncate max-w-[120px]" title={lead.company || lead.name}>{lead.company || lead.name}</p>
                                {getTemperatureIcon(lead.temperature)}
                              </div>
                              <p className="text-xs text-muted-foreground font-mono truncate">{lead.lead_id || '-'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{lead.city}</TableCell>
                        <TableCell className="w-[80px]">
                          {lead.assigned_to ? getUserInitials(lead.assigned_to) : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>{lead.last_contacted_date ? format(new Date(lead.last_contacted_date), 'MMM d, yyyy') : '-'}</TableCell>
                        <TableCell>
                          {lead.next_followup_date ? (() => {
                            const followupDate = new Date(lead.next_followup_date);
                            const today = new Date();
                            const diffDays = Math.ceil((followupDate - today) / (1000 * 60 * 60 * 24));
                            const isUrgent = diffDays >= 0 && diffDays <= 3;
                            return (
                              <div className="flex items-center gap-2">
                                <Checkbox 
                                  className="h-4 w-4 border-slate-300 data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                                  onClick={(e) => handleCompleteFollowup(e, lead)}
                                  title="Mark follow-up as complete"
                                  data-testid={`complete-followup-${lead.id}`}
                                />
                                <span className={`${isUrgent ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 px-2 py-1 rounded font-semibold' : ''}`}>
                                  {format(followupDate, 'MMM d, yyyy')}
                                </span>
                              </div>
                            );
                          })() : '-'}
                        </TableCell>
                        <TableCell>
                          {lead.opportunity_estimation?.estimated_monthly_revenue ? (
                            <span className="font-semibold text-primary">
                              ₹{lead.opportunity_estimation.estimated_monthly_revenue.toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell><Badge className={getStatusColor(lead.status)}>{getStatusLabel(lead.status)}</Badge></TableCell>
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
