import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
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
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '../components/ui/command';
import { 
  Search, Trash2, ChevronLeft, ChevronRight, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Package,
  LayoutGrid, List, Filter, Loader2, RotateCcw, FileText, DollarSign, 
  Building2, Calendar, CheckCircle, XCircle, Check, X, Download
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

// Credit Notes panel — customer/account-level credit notes (separate from invoices)
function CreditNotesPanel({ loading, creditNotes, summary, formatCurrency, navigateTo }) {
  const statusStyle = (s) => {
    if (s === 'fully_applied') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (s === 'partially_applied') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (s === 'cancelled') return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  };
  return (
    <div data-testid="credit-notes-panel">
      {/* Summary */}
      <Card className="mb-4 sm:mb-6 p-3 sm:p-4 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
          <span className="font-semibold text-sm sm:text-base text-slate-700 dark:text-slate-200">Credit Notes Summary</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800">
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Notes</span>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{summary.count}</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800">
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Issued</span>
            <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{formatCurrency(summary.total_issued)}</p>
          </div>
          <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-800">
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">Applied</span>
            <p className="text-xl font-bold text-green-700 dark:text-green-300">{formatCurrency(summary.total_applied)}</p>
          </div>
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800">
            <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">Balance</span>
            <p className="text-xl font-bold text-rose-700 dark:text-rose-300">{formatCurrency(summary.total_balance)}</p>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-amber-600" /></div>
      ) : creditNotes.length === 0 ? (
        <Card className="border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg">
          <div className="text-center py-20">
            <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-600">No credit notes found</h3>
            <p className="text-slate-500">Credit notes are generated from approved customer returns</p>
          </div>
        </Card>
      ) : (
        <Card className="border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead className="font-semibold">Credit Note #</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold min-w-[200px]">Customer</TableHead>
                  <TableHead className="font-semibold">Return #</TableHead>
                  <TableHead className="text-right font-semibold">Issued</TableHead>
                  <TableHead className="text-right font-semibold">Applied</TableHead>
                  <TableHead className="text-right font-semibold">Balance</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditNotes.map((cn) => (
                  <TableRow
                    key={cn.credit_note_number}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    onClick={() => { if (cn.account_id) navigateTo(`/accounts/${cn.account_id}`, { label: cn.account_name || 'Account' }); }}
                    data-testid={`credit-note-row-${cn.credit_note_number}`}
                  >
                    <TableCell className="font-medium text-amber-600 dark:text-amber-400">{cn.credit_note_number}</TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-400">{cn.credit_note_date ? format(new Date(cn.credit_note_date), 'dd MMM yyyy') : '-'}</TableCell>
                    <TableCell className="font-medium text-slate-800 dark:text-slate-200">{cn.account_name || '-'}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">{cn.return_number || '-'}</TableCell>
                    <TableCell className="text-right font-semibold text-amber-700 dark:text-amber-300">{formatCurrency(cn.original_amount)}</TableCell>
                    <TableCell className="text-right text-green-700 dark:text-green-300">{formatCurrency(cn.applied_amount)}</TableCell>
                    <TableCell className="text-right font-semibold text-rose-700 dark:text-rose-300">{formatCurrency(cn.balance_amount)}</TableCell>
                    <TableCell>
                      <Badge className={statusStyle(cn.status)}>{(cn.status || '').replace(/_/g, ' ')}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

// Stable standalone account autocomplete multiselect (defined outside the page
// component so it doesn't remount on every parent re-render).
function AccountMultiSelect({ testid, accountOptions, selectedAccounts, onToggle, onClear }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-9 w-full justify-between font-normal"
          data-testid={testid}
        >
          <span className="truncate text-left">
            {selectedAccounts.length === 0
              ? 'All Accounts'
              : selectedAccounts.length === 1
                ? selectedAccounts[0]
                : `${selectedAccounts.length} accounts`}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search accounts by name or city..." data-testid="invoices-account-search" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No accounts found.</CommandEmpty>
            <CommandGroup>
              {selectedAccounts.length > 0 && (
                <CommandItem
                  value="__clear__"
                  onSelect={onClear}
                  className="text-muted-foreground"
                  data-testid="invoices-account-clear"
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear selection (All Accounts)
                </CommandItem>
              )}
              {accountOptions.map(acc => {
                const checked = selectedAccounts.includes(acc.name);
                const subtitle = [acc.city, acc.state].filter(Boolean).join(', ');
                return (
                  <CommandItem
                    key={acc.name}
                    value={`${acc.name} ${acc.city || ''} ${acc.contact_name || ''} ${acc.territory || ''}`}
                    onSelect={() => onToggle(acc.name)}
                    data-testid={`invoices-account-option-${acc.name}`}
                    className="flex items-start gap-2"
                  >
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${checked ? 'opacity-100 text-emerald-600' : 'opacity-0'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{acc.name}</p>
                      {(subtitle || acc.contact_name || acc.territory) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {subtitle}
                          {subtitle && acc.territory ? ' • ' : ''}
                          {acc.territory || ''}
                          {acc.contact_name ? `${(subtitle || acc.territory) ? ' • ' : ''}${acc.contact_name}` : ''}
                        </p>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
  const { navigateTo } = useNavigation();
  const { user } = useAuth();
  const location = useLocation();
  const initialQS = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ total_gross: 0, total_net: 0, total_credit: 0, total_outstanding: 0 });
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  
  // Selection for bulk delete
  const [selectedInvoices, setSelectedInvoices] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Expandable line-items state — keyed by invoice id/no
  const [expandedRows, setExpandedRows] = useState(new Set());
  const toggleExpanded = (key) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  
  // View modes
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  
  // Filters — prefill from URL query string when coming from Account detail "View all" deep-link
  const [searchQuery, setSearchQuery] = useState('');
  const [territory, setTerritory] = useState('all');
  const [state, setState] = useState('all');
  const [city, setCity] = useState('all');
  const [accountName, setAccountName] = useState(initialQS.get('account_name') || '');
  // Multi-select account filter (autocomplete) — preselect deep-linked account
  const [selectedAccounts, setSelectedAccounts] = useState(
    initialQS.get('account_name') ? [initialQS.get('account_name')] : []
  );
  const [accountOptions, setAccountOptions] = useState([]);
  const [exporting, setExporting] = useState(false);
  // Main tab: invoices | credit_notes
  const [mainTab, setMainTab] = useState('invoices');
  const [creditNotes, setCreditNotes] = useState([]);
  const [cnSummary, setCnSummary] = useState({ total_issued: 0, total_applied: 0, total_balance: 0, count: 0 });
  const [cnLoading, setCnLoading] = useState(false);
  const [status, setStatus] = useState('all');
  const [timeFilter, setTimeFilter] = useState(initialQS.get('time_filter') || 'lifetime');
  const [sortBy, setSortBy] = useState('invoice_date');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Open the filters panel automatically if a deep-linked filter was applied
  useEffect(() => {
    if (initialQS.get('account_name') || initialQS.get('time_filter')) {
      setShowFilters(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Master locations for filters
  const { 
    territories, 
    states, 
    cities, 
    getStateNamesByTerritoryName, 
    getCityNamesByStateName,
  } = useMasterLocations();
  
  // Compute filtered states and cities
  const filteredStates = territory && territory !== 'all' 
    ? getStateNamesByTerritoryName(territory) 
    : states.map(s => s.name);
    
  const filteredCities = state && state !== 'all' 
    ? getCityNamesByStateName(state) 
    : cities.map(c => c.name);
  
  // Check if user can delete invoices — restricted to CEO and Admin only
  const canDelete = user && ['ceo', 'system admin', 'admin'].some(
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
      if (selectedAccounts.length > 0) selectedAccounts.forEach(n => params.append('account_names', n));
      if (status && status !== 'all') params.append('status', status);
      if (timeFilter && timeFilter !== 'lifetime') params.append('time_filter', timeFilter);
      params.append('sort_by', sortBy);
      params.append('sort_order', sortOrder);
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());
      
      const response = await axios.get(`${API_URL}/api/invoices?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      setInvoices(response.data.invoices || []);
      setTotalPages(response.data.pages || 1);
      setTotalCount(response.data.total || 0);
      setSummary(response.data.summary || { total_gross: 0, total_net: 0, total_credit: 0, total_outstanding: 0 });
      setSelectedInvoices([]);
      setSelectAll(false);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, territory, state, city, selectedAccounts, status, timeFilter, sortBy, sortOrder, currentPage, pageSize]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Fetch distinct account names for the autocomplete filter (once)
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/api/invoices/account-options`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setAccountOptions(res.data.accounts || []);
      } catch (e) {
        console.error('Error fetching account options:', e);
      }
    })();
  }, []);

  // Fetch credit notes when switching to the Credit Notes tab
  useEffect(() => {
    if (mainTab !== 'credit_notes') return;
    (async () => {
      setCnLoading(true);
      try {
        const res = await axios.get(`${API_URL}/api/invoices/credit-notes`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setCreditNotes(res.data.credit_notes || []);
        setCnSummary(res.data.summary || { total_issued: 0, total_applied: 0, total_balance: 0, count: 0 });
      } catch (e) {
        console.error('Error fetching credit notes:', e);
        toast.error('Failed to load credit notes');
      } finally {
        setCnLoading(false);
      }
    })();
  }, [mainTab]);

  const toggleAccount = (name) => {
    setSelectedAccounts(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
    setCurrentPage(1);
  };

  // Export filtered invoices to Excel
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (territory && territory !== 'all') params.append('territory', territory);
      if (state && state !== 'all') params.append('state', state);
      if (city && city !== 'all') params.append('city', city);
      if (selectedAccounts.length > 0) selectedAccounts.forEach(n => params.append('account_names', n));
      if (status && status !== 'all') params.append('status', status);
      if (timeFilter && timeFilter !== 'lifetime') params.append('time_filter', timeFilter);
      params.append('sort_by', sortBy);
      params.append('sort_order', sortOrder);

      const response = await axios.get(`${API_URL}/api/invoices/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoices_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Invoices exported');
    } catch (error) {
      console.error('Error exporting invoices:', error);
      toast.error('Failed to export invoices');
    } finally {
      setExporting(false);
    }
  };
  
  // Filter handlers
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
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
      } else {
        await axios.delete(`${API_URL}/api/invoices`, {
          data: selectedInvoices,
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }
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
    setSelectedAccounts([]);
    setStatus('all');
    setTimeFilter('lifetime');
    setCurrentPage(1);
  };

  // Format currency
  const formatCurrency = (value) => {
    if (!value && value !== 0) return '₹0';
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  // Render sort icon
  const getSortIcon = (field) => {
    if (sortBy !== field) return <ArrowUpDown className="h-4 w-4 ml-1 text-muted-foreground" />;
    return sortOrder === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-primary" />
      : <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
  };

  const hasActiveFilters = searchQuery || territory !== 'all' || state !== 'all' || city !== 'all' || selectedAccounts.length > 0 || status !== 'all' || timeFilter !== 'lifetime';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="invoices-list-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-3 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Breadcrumb */}
        <AppBreadcrumb />
        
        {/* Header */}
        <header className="mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 sm:p-2.5 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/50 dark:to-emerald-900/30">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Invoices</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {totalCount} {totalCount === 1 ? 'invoice' : 'invoices'}
                  {timeFilter !== 'lifetime' && <span className="ml-1 sm:ml-2 text-primary font-medium">({TIME_FILTERS.find(f => f.value === timeFilter)?.label})</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Export button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting}
                data-testid="export-invoices-btn"
                className="text-xs sm:text-sm h-8 sm:h-9"
              >
                {exporting
                  ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 animate-spin" />
                  : <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />}
                Download
              </Button>
              {/* Delete button */}
              {canDelete && selectedInvoices.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  data-testid="bulk-delete-btn"
                  className="text-xs sm:text-sm h-8 sm:h-9"
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                  Delete ({selectedInvoices.length})
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Main Tabs: Invoices | Credit Notes */}
        <div className="mb-4 sm:mb-6 inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60" data-testid="invoices-main-tabs">
          <button
            onClick={() => setMainTab('invoices')}
            data-testid="tab-invoices"
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mainTab === 'invoices' ? 'bg-white dark:bg-slate-900 text-green-700 dark:text-green-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}
          >
            <FileText className="h-4 w-4 mr-1.5 inline-block" /> Invoices
          </button>
          <button
            onClick={() => setMainTab('credit_notes')}
            data-testid="tab-credit-notes"
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mainTab === 'credit_notes' ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}
          >
            <RotateCcw className="h-4 w-4 mr-1.5 inline-block" /> Credit Notes
          </button>
        </div>

        {mainTab === 'invoices' && (
        <>
        {/* Summary Cards */}
        <Card className="mb-4 sm:mb-6 p-3 sm:p-4 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
            <span className="font-semibold text-sm sm:text-base text-slate-700 dark:text-slate-200">Invoice Summary</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 sm:p-4 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Invoices</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-blue-300">{totalCount}</p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-800">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-green-500" />
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Gross Value</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-700 dark:text-green-300">{formatCurrency(summary.total_gross)}</p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-amber-500" />
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Credit Notes</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-amber-700 dark:text-amber-300">{formatCurrency(summary.total_credit || 0)}</p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-purple-50 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">Net Value</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-purple-700 dark:text-purple-300">{formatCurrency(summary.total_net)}</p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-rose-500" />
                <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">Outstanding</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-rose-700 dark:text-rose-300">{formatCurrency(summary.total_outstanding || 0)}</p>
            </div>
            <div className="p-3 sm:p-4 rounded-xl bg-orange-50 dark:bg-orange-900/30 border border-orange-100 dark:border-orange-800" data-testid="customer-credits-card">
              <div className="flex items-center gap-2 mb-1">
                <RotateCcw className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">Customer Credits</span>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-orange-700 dark:text-orange-300">{formatCurrency(summary.cn_total_balance || 0)}</p>
              <p className="text-[10px] text-orange-600/80 dark:text-orange-400/80 mt-0.5">
                Issued {formatCurrency(summary.cn_total_issued || 0)} • Applied {formatCurrency(summary.cn_total_applied || 0)}
              </p>
            </div>
          </div>
        </Card>

        {/* Filters Section */}
        <div className="mb-4 sm:mb-6">
          {/* Mobile Filter Toggle */}
          <div className="flex items-center justify-between mb-3 sm:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  !
                </Badge>
              )}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'cards' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('cards')}
                className="h-8 w-8 p-0"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="h-8 w-8 p-0"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mobile Search - Always visible */}
          <div className="sm:hidden mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                type="text" 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                placeholder="Search invoices..." 
                className="pl-10 h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700" 
                data-testid="invoices-search-input-mobile" 
              />
            </div>
          </div>

          {/* Mobile Filters - Collapsible */}
          {showFilters && (
            <div className="sm:hidden bg-white dark:bg-slate-900 rounded-xl p-4 mb-4 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Time Period</label>
                  <Select value={timeFilter} onValueChange={setTimeFilter}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Time" /></SelectTrigger>
                    <SelectContent>
                      {TIME_FILTERS.map(filter => (
                        <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Territory</label>
                  <Select value={territory} onValueChange={handleTerritoryChange}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {territories.map(t => <SelectItem key={t.id || t.name} value={t.name}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">State</label>
                  <Select value={state} onValueChange={handleStateChange} disabled={territory === 'all'}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {filteredStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">City</label>
                  <Select value={city} onValueChange={setCity} disabled={state === 'all'}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {filteredCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All Status" /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Account Name</label>
                <AccountMultiSelect
                  testid="account-name-filter-mobile"
                  accountOptions={accountOptions}
                  selectedAccounts={selectedAccounts}
                  onToggle={toggleAccount}
                  onClear={() => { setSelectedAccounts([]); setCurrentPage(1); }}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={resetFilters} className="flex-1">
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset
                </Button>
                <Button size="sm" onClick={() => setShowFilters(false)} className="flex-1">
                  Apply
                </Button>
              </div>
            </div>
          )}

          {/* Desktop Filters */}
          <Card className="hidden sm:block p-4 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-slate-500" />
              <span className="font-medium text-sm text-slate-700 dark:text-slate-200">Filters</span>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="ml-auto h-7 text-xs">
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="lg:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="text" 
                    value={searchQuery} 
                    onChange={e => setSearchQuery(e.target.value)} 
                    placeholder="Search invoices..." 
                    className="pl-10 h-9 rounded-lg" 
                    data-testid="invoices-search-input" 
                  />
                </div>
              </div>
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger className="h-9" data-testid="time-filter"><SelectValue placeholder="Time Period" /></SelectTrigger>
                <SelectContent>
                  {TIME_FILTERS.map(filter => (
                    <SelectItem key={filter.value} value={filter.value}>{filter.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={territory} onValueChange={handleTerritoryChange}>
                <SelectTrigger className="h-9" data-testid="territory-filter"><SelectValue placeholder="Territory" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Territories</SelectItem>
                  {territories.map(t => <SelectItem key={t.id || t.name} value={t.name}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={state} onValueChange={handleStateChange} disabled={territory === 'all'}>
                <SelectTrigger className="h-9" data-testid="state-filter"><SelectValue placeholder="State" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {filteredStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={city} onValueChange={setCity} disabled={state === 'all'}>
                <SelectTrigger className="h-9" data-testid="city-filter"><SelectValue placeholder="City" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {filteredCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9" data-testid="status-filter"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 max-w-xs">
              <AccountMultiSelect
                testid="account-name-filter"
                accountOptions={accountOptions}
                selectedAccounts={selectedAccounts}
                onToggle={toggleAccount}
                onClear={() => { setSelectedAccounts([]); setCurrentPage(1); }}
              />
            </div>
          </Card>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          </div>
        ) : invoices.length === 0 ? (
          <Card className="border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg">
            <div className="text-center py-20">
              <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-600">No invoices found</h3>
              <p className="text-slate-500">Try adjusting your filters</p>
            </div>
          </Card>
        ) : viewMode === 'table' ? (
          /* Table View */
          <Card className="border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead className="w-10" />
                    {canDelete && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectAll}
                          onCheckedChange={handleSelectAll}
                          data-testid="select-all-checkbox"
                        />
                      </TableHead>
                    )}
                    <TableHead className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => handleSort('invoice_no')}>
                      <div className="flex items-center font-semibold">
                        Invoice # {getSortIcon('invoice_no')}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => handleSort('invoice_date')}>
                      <div className="flex items-center font-semibold">
                        <Calendar className="h-4 w-4 mr-1 text-slate-400" />
                        Date {getSortIcon('invoice_date')}
                      </div>
                    </TableHead>
                    <TableHead className="min-w-[200px]">
                      <div className="flex items-center font-semibold">
                        <Building2 className="h-4 w-4 mr-1 text-slate-400" />
                        Account
                      </div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => handleSort('gross_invoice_value')}>
                      <div className="flex items-center justify-end font-semibold">
                        Gross {getSortIcon('gross_invoice_value')}
                      </div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => handleSort('credit_note_value')}>
                      <div className="flex items-center justify-end font-semibold">
                        Credit Note {getSortIcon('credit_note_value')}
                      </div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => handleSort('net_invoice_value')}>
                      <div className="flex items-center justify-end font-semibold">
                        Net {getSortIcon('net_invoice_value')}
                      </div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => handleSort('outstanding')}>
                      <div className="flex items-center justify-end font-semibold">
                        Outstanding {getSortIcon('outstanding')}
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end font-semibold">Customer Credits</div>
                    </TableHead>
                    <TableHead>
                      <div className="font-semibold">Status</div>
                    </TableHead>
                    <TableHead>
                      <div className="font-semibold">Location</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => {
                    const rowKey = invoice.id || invoice.invoice_no;
                    const items = Array.isArray(invoice.items) ? invoice.items : [];
                    const hasLineItems = items.length > 0;
                    const isExpanded = expandedRows.has(rowKey);
                    const totalBottlesExp = hasLineItems
                      ? items.reduce((s, it) => s + Number(it.bottles ?? it.quantity ?? 0), 0)
                      : 0;
                    const totalCratesExp = hasLineItems
                      ? items.reduce((s, it) => s + Number(it.crates ?? it.crateCount ?? 0), 0)
                      : 0;
                    const colSpan = canDelete ? 11 : 10;
                    return (
                      <React.Fragment key={rowKey}>
                    <TableRow 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      onClick={() => {
                        if (invoice.account_id) {
                          navigateTo(`/accounts/${invoice.account_id}`, { label: invoice.account_name || 'Account' });
                        }
                      }}
                    >
                      <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                        {hasLineItems ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => toggleExpanded(rowKey)}
                            data-testid={`expand-invoice-${rowKey}`}
                            aria-label={isExpanded ? 'Collapse line items' : 'Expand line items'}
                          >
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        ) : null}
                      </TableCell>
                      {canDelete && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedInvoices.includes(invoice.id || invoice.invoice_no)}
                            onCheckedChange={(checked) => handleSelectInvoice(invoice.id || invoice.invoice_no, checked)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium text-green-600 dark:text-green-400">
                        {invoice.invoice_no || invoice.invoice_number || '-'}
                      </TableCell>
                      <TableCell className="text-slate-600 dark:text-slate-400">
                        {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'dd MMM yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate block max-w-[200px]">
                          {invoice.account_name || invoice.account_id || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-700 dark:text-green-300">
                        {formatCurrency(invoice.gross_invoice_value)}
                      </TableCell>
                      <TableCell className="text-right text-amber-600 dark:text-amber-400">
                        {formatCurrency(invoice.credit_note_value || 0)}
                        {Array.isArray(invoice.applied_credit_notes) && invoice.applied_credit_notes.length > 0 && (
                          <p className="text-[10px] text-muted-foreground truncate" title={invoice.applied_credit_notes.map(a => `${a.credit_note_number || ''} ₹${a.amount_applied || 0}`).join(', ')}>
                            {invoice.applied_credit_notes.map(a => a.credit_note_number).filter(Boolean).join(', ')}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-purple-700 dark:text-purple-300">
                        {formatCurrency(invoice.net_invoice_value)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${(invoice.outstanding || 0) > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>
                        {formatCurrency(invoice.outstanding || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(invoice.cn_issued || 0) > 0 ? (
                          <div>
                            <p className="font-semibold text-orange-700 dark:text-orange-300">{formatCurrency(invoice.cn_balance || 0)}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Iss {formatCurrency(invoice.cn_issued || 0)} • App {formatCurrency(invoice.cn_applied || 0)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={invoice.status === 'matched' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }
                        >
                          {invoice.status === 'matched' ? (
                            <><CheckCircle className="h-3 w-3 mr-1" /> Matched</>
                          ) : (
                            <><XCircle className="h-3 w-3 mr-1" /> Unmatched</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                        {[invoice.account_city, invoice.account_state].filter(Boolean).join(', ') || '-'}
                      </TableCell>
                    </TableRow>
                    {isExpanded && hasLineItems && (
                      <TableRow className="bg-slate-50/40 dark:bg-slate-800/20 hover:bg-slate-50/40 dark:hover:bg-slate-800/20">
                        <TableCell colSpan={colSpan} className="p-0">
                          <div className="p-4" data-testid={`line-items-${rowKey}`}>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-muted-foreground">
                                  <th className="text-left py-2 px-3 font-medium">SKU</th>
                                  <th className="text-right py-2 px-3 font-medium">Crates</th>
                                  <th className="text-right py-2 px-3 font-medium">Bottles</th>
                                  <th className="text-right py-2 px-3 font-medium">Line Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item, idx) => {
                                  const crates = item.crates ?? item.crateCount ?? null;
                                  const cap = item.crate_capacity ?? item.crateCapacity ?? null;
                                  return (
                                    <tr key={idx} className="border-t border-slate-100 dark:border-slate-800">
                                      <td className="py-2 px-3">
                                        <p className="font-medium">{item.sku_name || item.sku || 'N/A'}</p>
                                        {item.sku_code && <p className="text-xs text-muted-foreground">{item.sku_code}</p>}
                                      </td>
                                      <td className="py-2 px-3 text-right tabular-nums">
                                        {crates != null ? (
                                          <div>
                                            <p>{Number(crates).toLocaleString()}</p>
                                            {cap != null && <p className="text-[10px] text-muted-foreground">× {Number(cap)}/crate</p>}
                                          </div>
                                        ) : (
                                          <span className="text-muted-foreground">-</span>
                                        )}
                                      </td>
                                      <td className="py-2 px-3 text-right tabular-nums">{(item.bottles || item.quantity || 0).toLocaleString()}</td>
                                      <td className="py-2 px-3 text-right font-medium tabular-nums">
                                        ₹{Math.round(item.lineTotal ?? item.line_total ?? item.net_amount ?? item.total ?? 0).toLocaleString()}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="border-t border-slate-200 dark:border-slate-700">
                                <tr>
                                  <td className="py-2 px-3 font-semibold">Total</td>
                                  <td className="py-2 px-3 text-right font-semibold tabular-nums">
                                    {totalCratesExp > 0 ? totalCratesExp.toLocaleString() : '-'}
                                  </td>
                                  <td className="py-2 px-3 text-right font-semibold tabular-nums">
                                    {totalBottlesExp.toLocaleString()}
                                  </td>
                                  <td className="py-2 px-3 text-right font-semibold text-green-600 tabular-nums">
                                    ₹{Math.round(invoice.gross_invoice_value || 0).toLocaleString()}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span>Showing</span>
                <Select value={pageSize.toString()} onValueChange={(val) => { setPageSize(parseInt(val)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[70px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span>of {totalCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          /* Card View */
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {invoices.map((invoice) => (
                <Card 
                  key={invoice.id || invoice.invoice_no}
                  className="p-4 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all cursor-pointer"
                  onClick={() => {
                    if (invoice.account_id) {
                      navigateTo(`/accounts/${invoice.account_id}`, { label: invoice.account_name || 'Account' });
                    }
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-green-600 dark:text-green-400">{invoice.invoice_no || invoice.invoice_number || '-'}</p>
                      <p className="text-sm text-slate-500">
                        {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'dd MMM yyyy') : '-'}
                      </p>
                    </div>
                    {canDelete && (
                      <Checkbox
                        checked={selectedInvoices.includes(invoice.id || invoice.invoice_no || invoice.invoice_number)}
                        onCheckedChange={(checked) => handleSelectInvoice(invoice.id || invoice.invoice_no || invoice.invoice_number, checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 mb-3 text-slate-700 dark:text-slate-300">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium truncate">{invoice.account_name || invoice.account_id || '-'}</span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-2">
                      <p className="text-xs text-green-600 dark:text-green-400">Gross</p>
                      <p className="text-sm font-bold text-green-700 dark:text-green-300">{formatCurrency(invoice.gross_invoice_value)}</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-2">
                      <p className="text-xs text-amber-600 dark:text-amber-400">Credit Note</p>
                      <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{formatCurrency(invoice.credit_note_value || 0)}</p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-2">
                      <p className="text-xs text-purple-600 dark:text-purple-400">Net</p>
                      <p className="text-sm font-bold text-purple-700 dark:text-purple-300">{formatCurrency(invoice.net_invoice_value)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Badge 
                      className={invoice.status === 'matched' 
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }
                    >
                      {invoice.status === 'matched' ? 'Matched' : 'Unmatched'}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {[invoice.account_city, invoice.account_state].filter(Boolean).join(', ') || '-'}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
            
            {/* Card View Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span>Showing</span>
                <Select value={pageSize.toString()} onValueChange={(val) => { setPageSize(parseInt(val)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[70px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span>of {totalCount}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
        </>
        )}

        {mainTab === 'credit_notes' && (
          <CreditNotesPanel
            loading={cnLoading}
            creditNotes={creditNotes}
            summary={cnSummary}
            formatCurrency={formatCurrency}
            navigateTo={navigateTo}
          />
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
