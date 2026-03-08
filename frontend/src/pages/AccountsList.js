import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  FilterContainer, 
  FilterItem, 
  FilterGrid 
} from '../components/ui/filter-bar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { 
  Search, Building2, ChevronLeft, ChevronRight, Loader2, 
  Filter, Users, Calendar, Phone, User, MapPin, LayoutGrid, List, Image as ImageIcon, Download, Layers, Trash2
} from 'lucide-react';
import { useMasterLocations } from '../hooks/useMasterLocations';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import AppBreadcrumb from '../components/AppBreadcrumb';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const ACCOUNT_TYPES = ['Tier 1', 'Tier 2', 'Tier 3'];

const accountTypeColors = {
  'Tier 1': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200',
  'Tier 2': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border-blue-200',
  'Tier 3': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200',
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try { return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '-'; }
}

function calculateAccountAge(createdAt) {
  if (!createdAt) return '-';
  try {
    const diffMs = new Date() - new Date(createdAt);
    const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
    if (diffMonths < 1) return 'New';
    return diffMonths === 1 ? '1 month' : `${diffMonths} months`;
  } catch { return '-'; }
}

export default function AccountsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [stats, setStats] = useState({ total_accounts: 0, by_type: {}, by_category: {} });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const { territories: masterTerritories, getStateNamesByTerritoryName, getCityNamesByStateName } = useMasterLocations();
  
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [accountTypeFilter, setAccountTypeFilter] = useState('all');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;
  
  const [viewMode, setViewMode] = useState('list');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const logoGridRef = useRef(null);
  const [deletingAccountId, setDeletingAccountId] = useState(null);

  // Check if user is admin (CEO or Director)
  const isAdmin = user?.role === 'CEO' || user?.role === 'Director';

  const handleDeleteAccount = async (accountId, accountName, e) => {
    e.stopPropagation(); // Prevent row click navigation
    
    if (!window.confirm(`Are you sure you want to delete account "${accountName}"? This action cannot be undone.`)) {
      return;
    }
    
    setDeletingAccountId(accountId);
    try {
      await axios.delete(`${API_URL}/accounts/${accountId}`, { withCredentials: true });
      toast.success('Account deleted successfully');
      fetchAccounts(); // Refresh the list
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to delete account';
      toast.error(errorMsg);
    } finally {
      setDeletingAccountId(null);
    }
  };

  const downloadLogoPdf = async () => {
    if (!logoGridRef.current) return;
    setDownloadingPdf(true);
    try {
      const canvas = await html2canvas(logoGridRef.current, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pdfWidth / canvas.width, pdfHeight / canvas.height);
      pdf.addImage(imgData, 'PNG', (pdfWidth - canvas.width * ratio) / 2, 10, canvas.width * ratio, canvas.height * ratio);
      pdf.save('account-logos.pdf');
      toast.success('PDF downloaded successfully!');
    } catch { toast.error('Failed to download PDF'); }
    finally { setDownloadingPdf(false); }
  };

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('page', currentPage); params.append('page_size', pageSize);
      if (searchTerm) params.append('search', searchTerm);
      if (territoryFilter !== 'all') params.append('territory', territoryFilter);
      if (stateFilter !== 'all') params.append('state', stateFilter);
      if (cityFilter !== 'all') params.append('city', cityFilter);
      if (accountTypeFilter !== 'all') params.append('account_type', accountTypeFilter);
      
      const response = await axios.get(`${API_URL}/accounts?${params}`, { headers: { Authorization: `Bearer ${token}` }, withCredentials: true });
      setAccounts(response.data.data || []); setTotalCount(response.data.total || 0); setTotalPages(response.data.total_pages || 1);
    } catch { toast.error('Failed to load accounts'); setAccounts([]); }
    finally { setLoading(false); }
  }, [currentPage, searchTerm, territoryFilter, stateFilter, cityFilter, accountTypeFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (territoryFilter !== 'all') params.append('territory', territoryFilter);
      if (stateFilter !== 'all') params.append('state', stateFilter);
      if (cityFilter !== 'all') params.append('city', cityFilter);
      const response = await axios.get(`${API_URL}/accounts/stats/summary?${params}`, { headers: { Authorization: `Bearer ${token}` }, withCredentials: true });
      setStats(response.data);
    } catch { console.error('Failed to load stats'); }
  }, [territoryFilter, stateFilter, cityFilter]);

  useEffect(() => { const t = setTimeout(() => fetchAccounts(), 300); return () => clearTimeout(t); }, [fetchAccounts]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleResetFilters = () => { setTerritoryFilter('all'); setStateFilter('all'); setCityFilter('all'); setAccountTypeFilter('all'); setSearchTerm(''); setCurrentPage(1); };

  const allTerritoryNames = masterTerritories.map(t => t.name);
  const availableTerritories = user?.territory === 'All India' || ['ceo', 'director', 'vp', 'admin', 'CEO', 'Director', 'Vice President', 'National Sales Head'].includes(user?.role) ? ['All Territories', ...allTerritoryNames] : user?.territory ? ['All Territories', user.territory] : ['All Territories'];
  const availableStates = territoryFilter !== 'all' ? ['All States', ...getStateNamesByTerritoryName(territoryFilter)] : ['All States'];
  const availableCities = stateFilter !== 'all' ? ['All Cities', ...getCityNamesByStateName(stateFilter)] : ['All Cities'];

  const statCards = [
    { label: 'Total', value: stats.total_accounts || 0, sub: 'accounts', gradient: 'from-slate-500 to-slate-600', bgGradient: 'from-slate-50 to-slate-100 dark:from-slate-900/30 dark:to-slate-800/20', textColor: 'text-slate-700 dark:text-slate-300' },
    { label: 'Tier 1', value: stats.by_type?.['Tier 1'] || 0, sub: 'premium', gradient: 'from-emerald-500 to-teal-600', bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20', textColor: 'text-emerald-700 dark:text-emerald-300' },
    { label: 'Tier 2', value: stats.by_type?.['Tier 2'] || 0, sub: 'standard', gradient: 'from-blue-500 to-indigo-600', bgGradient: 'from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20', textColor: 'text-blue-700 dark:text-blue-300' },
    { label: 'Tier 3', value: stats.by_type?.['Tier 3'] || 0, sub: 'basic', gradient: 'from-gray-500 to-gray-600', bgGradient: 'from-gray-50 to-gray-100 dark:from-gray-900/30 dark:to-gray-800/20', textColor: 'text-gray-700 dark:text-gray-300' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="accounts-list-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Breadcrumb */}
        <AppBreadcrumb />
        
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/50 dark:to-orange-900/30">
              <Building2 className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Accounts</h1>
              <p className="text-muted-foreground">Manage and track your customer accounts</p>
            </div>
          </div>
        </header>

        {/* Contemporary Filters */}
        <FilterContainer 
          title="Filters" 
          activeFiltersCount={[
            searchTerm, 
            territoryFilter !== 'all', 
            stateFilter !== 'all', 
            cityFilter !== 'all', 
            accountTypeFilter !== 'all'
          ].filter(Boolean).length}
          onReset={handleResetFilters}
          className="mb-6"
        >
          <FilterGrid columns={6}>
            <FilterItem label="Search" icon={Search} className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Search accounts..." 
                  value={searchTerm} 
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} 
                  className="pl-10 h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" 
                  data-testid="search-accounts-input" 
                />
              </div>
            </FilterItem>
            
            <FilterItem label="Territory" icon={MapPin}>
              <Select value={territoryFilter} onValueChange={(v) => { setTerritoryFilter(v); setStateFilter('all'); setCityFilter('all'); setCurrentPage(1); }}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" data-testid="territory-filter">
                  <SelectValue placeholder="All Territories" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableTerritories.map(t => (
                    <SelectItem key={t} value={t === 'All Territories' ? 'all' : t} className="rounded-lg">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
            
            <FilterItem label="State" icon={MapPin}>
              <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setCityFilter('all'); setCurrentPage(1); }} disabled={territoryFilter === 'all'}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all disabled:opacity-50" data-testid="state-filter">
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableStates.map(s => (
                    <SelectItem key={s} value={s === 'All States' ? 'all' : s} className="rounded-lg">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
            
            <FilterItem label="City" icon={MapPin}>
              <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setCurrentPage(1); }} disabled={stateFilter === 'all'}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all disabled:opacity-50" data-testid="city-filter">
                  <SelectValue placeholder="All Cities" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableCities.map(c => (
                    <SelectItem key={c} value={c === 'All Cities' ? 'all' : c} className="rounded-lg">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
            
            <FilterItem label="Account Type" icon={Layers}>
              <Select value={accountTypeFilter} onValueChange={(v) => { setAccountTypeFilter(v); setCurrentPage(1); }}>
                <SelectTrigger className="h-10 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all" data-testid="account-type-filter">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="rounded-lg">All Types</SelectItem>
                  {ACCOUNT_TYPES.map(t => (
                    <SelectItem key={t} value={t} className="rounded-lg">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterItem>
          </FilterGrid>
        </FilterContainer>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {statCards.map((stat) => (
            <Card key={stat.label} className={`relative overflow-hidden border-0 bg-gradient-to-br ${stat.bgGradient} backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5`}>
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient}`} />
              <div className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.textColor} tabular-nums`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.sub}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* View Toggle */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Showing <span className="font-semibold text-slate-800 dark:text-white">{accounts.length}</span> of <span className="font-semibold text-slate-800 dark:text-white">{totalCount}</span> accounts
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white dark:bg-slate-800 rounded-xl p-1 shadow-sm border border-slate-200 dark:border-slate-700">
              <Button 
                variant={viewMode === 'list' ? 'default' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('list')} 
                className={`h-9 px-4 rounded-lg ${viewMode === 'list' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              >
                <List className="h-4 w-4 mr-2" />List
              </Button>
              <Button 
                variant={viewMode === 'gallery' ? 'default' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('gallery')} 
                className={`h-9 px-4 rounded-lg ${viewMode === 'gallery' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              >
                <LayoutGrid className="h-4 w-4 mr-2" />Logo Gallery
              </Button>
            </div>
            {viewMode === 'gallery' && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={downloadLogoPdf} 
                disabled={downloadingPdf || loading || accounts.length === 0} 
                className="h-9 px-4 border-amber-200 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-700 dark:text-amber-400"
              >
                <Download className="h-4 w-4 mr-2" />{downloadingPdf ? 'Generating...' : 'Download PDF'}
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative"><div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" /><Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" /></div>
              <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading accounts...</p>
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-16">
              <Building2 className="h-16 w-16 mx-auto mb-4 text-slate-200 dark:text-slate-700" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No accounts found</p>
              <p className="text-muted-foreground text-sm">Convert won leads to create accounts</p>
            </div>
          ) : viewMode === 'gallery' ? (
            <div className="p-4">
              <div ref={logoGridRef} className="flex flex-wrap gap-3 p-3 bg-white dark:bg-slate-900">
                {accounts.map((account, idx) => (
                  <div key={account.id || idx} onClick={() => navigate(`/accounts/${account.account_id}`)} className="group cursor-pointer">
                    <div className="relative rounded-lg overflow-hidden bg-white border border-gray-200 hover:border-primary/50 transition-all duration-200 hover:shadow-lg" style={{ width: '132px', height: '132px' }}>
                      {account.logo_url ? <img src={`${process.env.REACT_APP_BACKEND_URL}${account.logo_url}`} alt={account.account_name} className="w-full h-full object-contain p-1" /> : <div className="w-full h-full flex items-center justify-center p-1 bg-gradient-to-br from-gray-50 to-gray-100"><p className="text-[8px] font-medium text-gray-500 text-center leading-tight line-clamp-3 px-1">{account.account_name}</p></div>}
                      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"><p className="text-[8px] font-medium text-white text-center px-1 leading-tight">{account.account_name}</p></div>
                    </div>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="accounts-table">
                  <thead>
                    <tr className="border-b-2 border-amber-100 dark:border-amber-900/30 bg-gradient-to-r from-amber-50/80 to-orange-50/50 dark:from-amber-900/20 dark:to-orange-900/10">
                      <th className="text-left py-4 px-5 font-semibold text-amber-800 dark:text-amber-300 uppercase text-xs tracking-wider">Account</th>
                      <th className="text-left py-4 px-5 font-semibold text-amber-800 dark:text-amber-300 uppercase text-xs tracking-wider">Type</th>
                      <th className="text-left py-4 px-5 font-semibold text-amber-800 dark:text-amber-300 uppercase text-xs tracking-wider">Contact</th>
                      <th className="text-left py-4 px-5 font-semibold text-amber-800 dark:text-amber-300 uppercase text-xs tracking-wider">Location</th>
                      <th className="text-left py-4 px-5 font-semibold text-amber-800 dark:text-amber-300 uppercase text-xs tracking-wider">Account Age</th>
                      <th className="text-left py-4 px-5 font-semibold text-amber-800 dark:text-amber-300 uppercase text-xs tracking-wider">Onboarded</th>
                      <th className="text-left py-4 px-5 font-semibold text-amber-800 dark:text-amber-300 uppercase text-xs tracking-wider">Sales Contact</th>
                      {isAdmin && (
                        <th className="text-center py-4 px-5 font-semibold text-amber-800 dark:text-amber-300 uppercase text-xs tracking-wider">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {accounts.map((account, idx) => (
                      <tr 
                        key={account.id || idx} 
                        className="group hover:bg-gradient-to-r hover:from-amber-50/50 hover:to-orange-50/30 dark:hover:from-amber-900/10 dark:hover:to-orange-900/5 transition-all duration-200 cursor-pointer" 
                        onClick={() => navigate(`/accounts/${account.account_id}`)} 
                        data-testid={`account-row-${account.account_id}`}
                      >
                        <td className="py-5 px-5">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/50 dark:to-orange-900/30 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform duration-200">
                              <Building2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-800 dark:text-white group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">{account.account_name}</p>
                              <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">{account.account_id}</p>
                              {account.category && <Badge variant="outline" className="mt-1.5 text-xs border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">{account.category}</Badge>}
                            </div>
                          </div>
                        </td>
                        <td className="py-5 px-5">
                          {account.account_type ? (
                            <Badge className={`${accountTypeColors[account.account_type]} font-medium px-3 py-1`}>
                              {account.account_type}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-5 px-5">
                          <div className="space-y-1">
                            {account.contact_name && (
                              <p className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-slate-400" />
                                {account.contact_name}
                              </p>
                            )}
                            {account.contact_number && (
                              <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                <Phone className="h-3.5 w-3.5 text-slate-400" />
                                {account.contact_number}
                              </p>
                            )}
                            {!account.contact_name && !account.contact_number && (
                              <span className="text-slate-400">-</span>
                            )}
                          </div>
                        </td>
                        <td className="py-5 px-5">
                          <div className="flex items-start gap-2">
                            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                              <MapPin className="h-3.5 w-3.5 text-slate-500" />
                            </div>
                            <div>
                              <p className="font-medium text-slate-700 dark:text-slate-300">{account.city}</p>
                              <p className="text-xs text-slate-500">{account.state}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-5 px-5">
                          <div className="flex items-center gap-2">
                            <div className={`px-3 py-1.5 rounded-lg ${calculateAccountAge(account.created_at) === 'New' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-800'}`}>
                              <span className={`text-sm font-semibold ${calculateAccountAge(account.created_at) === 'New' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                {calculateAccountAge(account.created_at)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-5 px-5">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-sm text-slate-600 dark:text-slate-400">{formatDate(account.created_at)}</span>
                          </div>
                        </td>
                        <td className="py-5 px-5">
                          {account.sales_person_name ? (
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/50 dark:to-indigo-900/30 flex items-center justify-center">
                                <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                              </div>
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{account.sales_person_name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="py-5 px-5 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={(e) => handleDeleteAccount(account.id, account.account_name, e)}
                              disabled={deletingAccountId === account.id}
                              data-testid={`delete-account-${account.account_id}`}
                            >
                              {deletingAccountId === account.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50/50 to-amber-50/30 dark:from-slate-900/50 dark:to-amber-900/10">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Showing <span className="font-semibold text-slate-800 dark:text-white">{((currentPage - 1) * pageSize) + 1}</span> - <span className="font-semibold text-slate-800 dark:text-white">{Math.min(currentPage * pageSize, totalCount)}</span> of <span className="font-semibold text-slate-800 dark:text-white">{totalCount}</span> accounts
                  </p>
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} 
                      disabled={currentPage === 1} 
                      className="h-9 px-4 border-slate-200 dark:border-slate-700 hover:bg-amber-50 hover:border-amber-200 dark:hover:bg-amber-900/20 disabled:opacity-50"
                      data-testid="prev-page-btn"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />Previous
                    </Button>
                    <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Page</span>
                      <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{currentPage}</span>
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">of {totalPages}</span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} 
                      disabled={currentPage === totalPages}
                      className="h-9 px-4 border-slate-200 dark:border-slate-700 hover:bg-amber-50 hover:border-amber-200 dark:hover:bg-amber-900/20 disabled:opacity-50"
                      data-testid="next-page-btn"
                    >
                      Next<ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
        <p className="text-xs text-muted-foreground mt-4 text-center">{viewMode === 'gallery' ? 'Click on a logo to view account details.' : 'Click on an account row to view details.'}</p>
      </div>
    </div>
  );
}
