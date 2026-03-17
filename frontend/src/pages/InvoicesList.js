import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Checkbox } from '../components/ui/checkbox';
import { 
  FilterContainer, 
  FilterItem, 
  FilterGrid, 
  FilterSearch 
} from '../components/ui/filter-bar';
import { 
  Search, Trash2, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, 
  LayoutGrid, List, Filter, Loader2, RotateCcw, FileText, DollarSign, 
  Building2, Calendar, CheckCircle, XCircle, Download
} from 'lucide-react';
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
import AppBreadcrumb from '../components/AppBreadcrumb';
import { useNavigation } from '../context/NavigationContext';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TIME_FILTERS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'lifetime', label: 'Lifetime' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'matched', label: 'Matched' },
  { value: 'unmatched', label: 'Unmatched' },
];

export default function InvoicesList() {
  const navigate = useNavigate();
  const { navigateTo } = useNavigation();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ total_gross: 0, total_net: 0, total_outstanding: 0 });
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  
  // Selection for bulk delete
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // View modes
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [territory, setTerritory] = useState('all');
  const [state, setState] = useState('all');
  const [city, setCity] = useState('all');
  const [accountName, setAccountName] = useState('');
  const [status, setStatus] = useState('all');
  const [timeFilter, setTimeFilter] = useState('lifetime');
  const [sortBy, setSortBy] = useState('invoice_date');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Master locations for filters
  const { 
    territories, 
    states, 
    cities, 
    getStateNamesByTerritoryName, 
    getCityNamesByStateName,
  } = useMasterLocations();
  
  // Compute filtered states and cities (no useEffect needed)
  const filteredStates = territory && territory !== 'all' 
    ? getStateNamesByTerritoryName(territory) 
    : states.map(s => s.name);
    
  const filteredCities = state && state !== 'all' 
    ? getCityNamesByStateName(state) 
    : cities.map(c => c.name);
  
  // Check if user can delete invoices
  const canDelete = user && ['ceo', 'system admin', 'admin', 'director'].some(
    role => user.role?.toLowerCase().includes(role)
  );

  // Fetch invoices
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      if (searchQuery) params.append('search', searchQuery);
      if (territory && territory !== 'all') params.append('territory', territory);
      if (state && state !== 'all') params.append('state', state);
      if (city && city !== 'all') params.append('city', city);
      if (accountName) params.append('account_name', accountName);
      if (status && status !== 'all') params.append('status', status);
      if (timeFilter && timeFilter !== 'lifetime') params.append('time_filter', timeFilter);
      params.append('sort_by', sortBy);
      params.append('sort_order', sortOrder);
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());
      
      const response = await axios.get(`${API_URL}/api/invoices?${params.toString()}`, {
        withCredentials: true
      });
      
      setInvoices(response.data.invoices || []);
      setTotalPages(response.data.pages || 1);
      setTotalCount(response.data.total || 0);
      setSummary(response.data.summary || { total_gross: 0, total_net: 0, total_outstanding: 0 });
      setSelectedInvoices([]);
      setSelectAll(false);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, territory, state, city, accountName, status, timeFilter, sortBy, sortOrder, currentPage, pageSize]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);
  
  // Reset child filters when parent changes
  const handleTerritoryChange = (val) => {
    setTerritory(val);
    setState('all');
    setCity('all');
  };
  
  const handleStateChange = (val) => {
    setState(val);
    setCity('all');
  };

  // Handle select all
  const handleSelectAll = (checked) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedInvoices(invoices.map(inv => inv.id || inv.invoice_no));
    } else {
      setSelectedInvoices([]);
    }
  };

  // Handle individual selection
  const handleSelectInvoice = (invoiceId, checked) => {
    if (checked) {
      setSelectedInvoices(prev => [...prev, invoiceId]);
    } else {
      setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
      setSelectAll(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (selectedInvoices.length === 0) return;
    
    try {
      if (selectedInvoices.length === 1) {
        await axios.delete(`${API_URL}/api/invoices/${selectedInvoices[0]}`, {
          withCredentials: true
        });
      } else {
        await axios.delete(`${API_URL}/api/invoices`, {
          data: selectedInvoices,
          withCredentials: true,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      toast.success(`Deleted ${selectedInvoices.length} invoice(s)`);
      setDeleteDialogOpen(false);
      fetchInvoices();
    } catch (error) {
      console.error('Error deleting invoices:', error);
      toast.error(error.response?.data?.detail || 'Failed to delete invoices');
    }
  };

  // Handle sort
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Reset filters
  const resetFilters = () => {
    setSearchQuery('');
    setTerritory('all');
    setState('all');
    setCity('all');
    setAccountName('');
    setStatus('all');
    setTimeFilter('lifetime');
    setCurrentPage(1);
  };

  // Format currency
  const formatCurrency = (value) => {
    if (!value && value !== 0) return '₹0';
    return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  // Render sort icon
  const SortIcon = ({ field }) => {
    if (sortBy !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    return sortOrder === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-blue-500" />
      : <ArrowDown className="h-4 w-4 ml-1 text-blue-500" />;
  };

  return (
    <div className="min-h-screen bg-slate-50" data-testid="invoices-list-page">
      <AppBreadcrumb items={[{ label: 'Invoices' }]} />
      
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10 px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-600" />
              Invoices
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {totalCount} invoices • {formatCurrency(summary.total_gross)} Total
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded ${viewMode === 'table' ? 'bg-white shadow' : ''}`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-2 rounded ${viewMode === 'cards' ? 'bg-white shadow' : ''}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            
            {/* Filter toggle (mobile) */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="sm:hidden"
            >
              <Filter className="h-4 w-4 mr-1" />
              Filters
            </Button>
            
            {/* Delete button */}
            {canDelete && selectedInvoices.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                data-testid="bulk-delete-btn"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete ({selectedInvoices.length})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 bg-blue-50 border-blue-200">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-xs text-blue-600 font-medium">Total Invoices</p>
              <p className="text-lg font-bold text-blue-800">{totalCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3 bg-green-50 border-green-200">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-xs text-green-600 font-medium">Gross Value</p>
              <p className="text-lg font-bold text-green-800">{formatCurrency(summary.total_gross)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3 bg-purple-50 border-purple-200">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-purple-600" />
            <div>
              <p className="text-xs text-purple-600 font-medium">Net Value</p>
              <p className="text-lg font-bold text-purple-800">{formatCurrency(summary.total_net)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-3 bg-orange-50 border-orange-200">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-orange-600" />
            <div>
              <p className="text-xs text-orange-600 font-medium">Outstanding</p>
              <p className="text-lg font-bold text-orange-800">{formatCurrency(summary.total_outstanding)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <FilterContainer className={`${showFilters ? 'block' : 'hidden'} sm:block px-4 py-3`}>
        <FilterGrid>
          <FilterSearch>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="search-input"
            />
          </FilterSearch>
          
          <FilterItem>
            <Select value={territory} onValueChange={handleTerritoryChange}>
              <SelectTrigger data-testid="territory-filter">
                <SelectValue placeholder="Territory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Territories</SelectItem>
                {territories.map(t => (
                  <SelectItem key={t.id || t.name} value={t.name}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterItem>
          
          <FilterItem>
            <Select value={state} onValueChange={handleStateChange} disabled={territory === 'all'}>
              <SelectTrigger data-testid="state-filter">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {filteredStates.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterItem>
          
          <FilterItem>
            <Select value={city} onValueChange={setCity} disabled={state === 'all'}>
              <SelectTrigger data-testid="city-filter">
                <SelectValue placeholder="City" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {filteredCities.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterItem>
          
          <FilterItem>
            <Input
              placeholder="Account Name..."
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              data-testid="account-name-filter"
            />
          </FilterItem>
          
          <FilterItem>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger data-testid="status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterItem>
          
          <FilterItem>
            <Select value={timeFilter} onValueChange={setTimeFilter}>
              <SelectTrigger data-testid="time-filter">
                <SelectValue placeholder="Time Period" />
              </SelectTrigger>
              <SelectContent>
                {TIME_FILTERS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterItem>
          
          <FilterItem>
            <Button variant="ghost" size="sm" onClick={resetFilters} className="w-full">
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </FilterItem>
        </FilterGrid>
      </FilterContainer>

      {/* Content */}
      <div className="px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600">No invoices found</h3>
            <p className="text-slate-500">Try adjusting your filters</p>
          </div>
        ) : viewMode === 'table' ? (
          /* Table View */
          <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {canDelete && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectAll}
                        onCheckedChange={handleSelectAll}
                        data-testid="select-all-checkbox"
                      />
                    </TableHead>
                  )}
                  <TableHead className="cursor-pointer" onClick={() => handleSort('invoice_no')}>
                    <div className="flex items-center">
                      Invoice # <SortIcon field="invoice_no" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('invoice_date')}>
                    <div className="flex items-center">
                      Date <SortIcon field="invoice_date" />
                    </div>
                  </TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort('gross_invoice_value')}>
                    <div className="flex items-center justify-end">
                      Gross <SortIcon field="gross_invoice_value" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => handleSort('outstanding')}>
                    <div className="flex items-center justify-end">
                      Outstanding <SortIcon field="outstanding" />
                    </div>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow 
                    key={invoice.id || invoice.invoice_no}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => {
                      if (invoice.account_id) {
                        navigateTo(`/accounts/${invoice.account_id}`, { label: invoice.account_name || 'Account' });
                      }
                    }}
                  >
                    {canDelete && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedInvoices.includes(invoice.id || invoice.invoice_no)}
                          onCheckedChange={(checked) => handleSelectInvoice(invoice.id || invoice.invoice_no, checked)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium text-blue-600">
                      {invoice.invoice_no}
                    </TableCell>
                    <TableCell>
                      {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'dd MMM yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-slate-400" />
                        <span className="truncate max-w-[150px]">{invoice.account_name || invoice.account_id || '-'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(invoice.gross_invoice_value)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(invoice.net_invoice_value)}
                    </TableCell>
                    <TableCell className="text-right text-orange-600 font-medium">
                      {formatCurrency(invoice.outstanding)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === 'matched' ? 'success' : 'warning'}>
                        {invoice.status === 'matched' ? (
                          <><CheckCircle className="h-3 w-3 mr-1" /> Matched</>
                        ) : (
                          <><XCircle className="h-3 w-3 mr-1" /> Unmatched</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {[invoice.account_city, invoice.account_state].filter(Boolean).join(', ') || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          /* Card View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {invoices.map((invoice) => (
              <Card 
                key={invoice.id || invoice.invoice_no}
                className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => {
                  if (invoice.account_id) {
                    navigateTo(`/accounts/${invoice.account_id}`, { label: invoice.account_name || 'Account' });
                  }
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-bold text-blue-600">{invoice.invoice_no}</p>
                    <p className="text-sm text-slate-500">
                      {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'dd MMM yyyy') : '-'}
                    </p>
                  </div>
                  {canDelete && (
                    <Checkbox
                      checked={selectedInvoices.includes(invoice.id || invoice.invoice_no)}
                      onCheckedChange={(checked) => handleSelectInvoice(invoice.id || invoice.invoice_no, checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
                
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium truncate">{invoice.account_name || invoice.account_id || '-'}</span>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="bg-green-50 rounded p-2">
                    <p className="text-xs text-green-600">Gross</p>
                    <p className="text-sm font-bold text-green-700">{formatCurrency(invoice.gross_invoice_value)}</p>
                  </div>
                  <div className="bg-purple-50 rounded p-2">
                    <p className="text-xs text-purple-600">Net</p>
                    <p className="text-sm font-bold text-purple-700">{formatCurrency(invoice.net_invoice_value)}</p>
                  </div>
                  <div className="bg-orange-50 rounded p-2">
                    <p className="text-xs text-orange-600">Due</p>
                    <p className="text-sm font-bold text-orange-700">{formatCurrency(invoice.outstanding)}</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <Badge variant={invoice.status === 'matched' ? 'success' : 'warning'}>
                    {invoice.status === 'matched' ? 'Matched' : 'Unmatched'}
                  </Badge>
                  <span className="text-xs text-slate-500">
                    {[invoice.account_city, invoice.account_state].filter(Boolean).join(', ') || '-'}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-2">
            <p className="text-sm text-slate-500">
              Page {currentPage} of {totalPages} ({totalCount} invoices)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoices</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedInvoices.length} invoice(s)? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
