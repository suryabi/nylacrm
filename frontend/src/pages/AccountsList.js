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
  Search, Building2, ChevronLeft, ChevronRight, Loader2, 
  Filter, Users, Calendar, Phone, User, MapPin, LayoutGrid, List, Image as ImageIcon, Download
} from 'lucide-react';
import { useMasterLocations } from '../hooks/useMasterLocations';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const ACCOUNT_TYPES = ['Tier 1', 'Tier 2', 'Tier 3'];

const CATEGORIES = [
  'Restaurant',
  'Bar & Kitchen',
  'Star Hotel',
  'Fine Dining',
  'QSR',
  'Cloud Kitchen',
  'Cafe',
  'Catering',
  'Corporate',
  'Retail',
  'Institution',
  'Other'
];

const accountTypeColors = {
  'Tier 1': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Tier 2': 'bg-blue-100 text-blue-800 border-blue-200',
  'Tier 3': 'bg-gray-100 text-gray-800 border-gray-200',
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  } catch {
    return '-';
  }
}

function calculateAccountAge(createdAt) {
  if (!createdAt) return '-';
  try {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
    if (diffMonths < 1) return 'New';
    if (diffMonths === 1) return '1 month';
    return `${diffMonths} months`;
  } catch {
    return '-';
  }
}

export default function AccountsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [stats, setStats] = useState({ total_accounts: 0, by_type: {}, by_category: {} });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Master locations from API
  const { 
    territories: masterTerritories, 
    getStateNamesByTerritoryName, 
    getCityNamesByStateName 
  } = useMasterLocations();
  
  // Filter states - matching AccountPerformance
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [accountTypeFilter, setAccountTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 25;
  
  // View mode state
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'gallery'
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const logoGridRef = useRef(null);

  // Download logo gallery as PDF
  const downloadLogoPdf = async () => {
    if (!logoGridRef.current) return;
    
    setDownloadingPdf(true);
    try {
      const element = logoGridRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10;
      
      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save('account-logos.pdf');
      toast.success('PDF downloaded successfully!');
    } catch (error) {
      console.error('PDF download error:', error);
      toast.error('Failed to download PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('page', currentPage);
      params.append('page_size', pageSize);
      if (searchTerm) params.append('search', searchTerm);
      if (territoryFilter !== 'all') params.append('territory', territoryFilter);
      if (stateFilter !== 'all') params.append('state', stateFilter);
      if (cityFilter !== 'all') params.append('city', cityFilter);
      if (accountTypeFilter !== 'all') params.append('account_type', accountTypeFilter);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      
      const response = await axios.get(`${API_URL}/accounts?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      setAccounts(response.data.data || []);
      setTotalCount(response.data.total || 0);
      setTotalPages(response.data.total_pages || 1);
    } catch (error) {
      toast.error('Failed to load accounts');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, territoryFilter, stateFilter, cityFilter, accountTypeFilter, categoryFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (territoryFilter !== 'all') params.append('territory', territoryFilter);
      if (stateFilter !== 'all') params.append('state', stateFilter);
      if (cityFilter !== 'all') params.append('city', cityFilter);
      
      const response = await axios.get(`${API_URL}/accounts/stats/summary?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats');
    }
  }, [territoryFilter, stateFilter, cityFilter]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchAccounts();
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [fetchAccounts]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSearchChange = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setTerritoryFilter('all');
    setStateFilter('all');
    setCityFilter('all');
    setAccountTypeFilter('all');
    setCategoryFilter('all');
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Build territory options from master locations
  const allTerritoryNames = masterTerritories.map(t => t.name);
  const availableTerritories = user?.territory === 'All India' || ['ceo', 'director', 'vp', 'admin', 'CEO', 'Director', 'Vice President', 'National Sales Head'].includes(user?.role)
    ? ['All Territories', ...allTerritoryNames]
    : user?.territory ? ['All Territories', user.territory] : ['All Territories'];

  // Get states based on selected territory from master locations
  const availableStates = territoryFilter !== 'all' && territoryFilter !== 'All Territories'
    ? ['All States', ...getStateNamesByTerritoryName(territoryFilter)]
    : ['All States'];

  // Get cities based on selected state from master locations
  const availableCities = stateFilter !== 'all' && stateFilter !== 'All States'
    ? ['All Cities', ...getCityNamesByStateName(stateFilter)]
    : ['All Cities'];

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="accounts-list-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Accounts
        </h1>
        <p className="text-muted-foreground mt-1">Manage and track your customer accounts</p>
      </div>

      {/* Filters Card */}
      <Card className="p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Filters</span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10 h-10"
                data-testid="search-accounts-input"
              />
            </div>
          </div>
          
          {/* Territory */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Territory</label>
            <select
              value={territoryFilter}
              onChange={(e) => { setTerritoryFilter(e.target.value); setStateFilter('all'); setCityFilter('all'); setCurrentPage(1); }}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm h-10"
              data-testid="territory-filter"
            >
              {availableTerritories.map(t => (
                <option key={t} value={t === 'All Territories' ? 'all' : t}>{t}</option>
              ))}
            </select>
          </div>
          
          {/* State */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">State</label>
            <select
              value={stateFilter}
              onChange={(e) => { setStateFilter(e.target.value); setCityFilter('all'); setCurrentPage(1); }}
              disabled={territoryFilter === 'all'}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm h-10 disabled:opacity-50"
              data-testid="state-filter"
            >
              {availableStates.map(s => (
                <option key={s} value={s === 'All States' ? 'all' : s}>{s}</option>
              ))}
            </select>
          </div>
          
          {/* City */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">City</label>
            <select
              value={cityFilter}
              onChange={(e) => { setCityFilter(e.target.value); setCurrentPage(1); }}
              disabled={stateFilter === 'all'}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm h-10 disabled:opacity-50"
              data-testid="city-filter"
            >
              {availableCities.map(c => (
                <option key={c} value={c === 'All Cities' ? 'all' : c}>{c}</option>
              ))}
            </select>
          </div>
          
          {/* Account Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Account Type</label>
            <select
              value={accountTypeFilter}
              onChange={(e) => { setAccountTypeFilter(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 border rounded-lg bg-background text-sm h-10"
              data-testid="account-type-filter"
            >
              <option value="all">All Types</option>
              {ACCOUNT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          
          {/* Reset Button */}
          <div className="flex items-end">
            <Button variant="outline" onClick={handleResetFilters} className="w-full h-10" data-testid="reset-filters-btn">
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
        {/* Total Accounts */}
        <Card className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200">
          <p className="text-xs font-medium text-slate-600 mb-1">TOTAL</p>
          <p className="text-2xl font-bold text-slate-700">{stats.total_accounts || 0}</p>
          <p className="text-xs text-slate-500 mt-1">accounts</p>
        </Card>
        
        {/* By Type */}
        <Card className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <p className="text-xs font-medium text-emerald-600 mb-1">TIER 1</p>
          <p className="text-2xl font-bold text-emerald-700">{stats.by_type?.['Tier 1'] || 0}</p>
          <p className="text-xs text-emerald-500 mt-1">premium</p>
        </Card>
        
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <p className="text-xs font-medium text-blue-600 mb-1">TIER 2</p>
          <p className="text-2xl font-bold text-blue-700">{stats.by_type?.['Tier 2'] || 0}</p>
          <p className="text-xs text-blue-500 mt-1">standard</p>
        </Card>
        
        <Card className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
          <p className="text-xs font-medium text-gray-600 mb-1">TIER 3</p>
          <p className="text-2xl font-bold text-gray-700">{stats.by_type?.['Tier 3'] || 0}</p>
          <p className="text-xs text-gray-500 mt-1">basic</p>
        </Card>
        
        {/* Top Categories */}
        {Object.entries(stats.by_category || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([category, count], idx) => {
            const colors = [
              'from-purple-50 to-purple-100 border-purple-200 text-purple-600',
              'from-amber-50 to-amber-100 border-amber-200 text-amber-600',
              'from-rose-50 to-rose-100 border-rose-200 text-rose-600',
              'from-cyan-50 to-cyan-100 border-cyan-200 text-cyan-600'
            ];
            const colorClass = colors[idx] || colors[0];
            return (
              <Card key={category} className={`p-4 bg-gradient-to-br ${colorClass.split(' ').slice(0, 3).join(' ')}`}>
                <p className={`text-xs font-medium mb-1 ${colorClass.split(' ').slice(-1)[0]}`}>
                  {category?.toUpperCase() || 'OTHER'}
                </p>
                <p className={`text-2xl font-bold ${colorClass.split(' ').slice(-1)[0].replace('text-', 'text-').replace('-600', '-700')}`}>
                  {count}
                </p>
              </Card>
            );
          })}
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Showing {accounts.length} of {totalCount} accounts
        </p>
        <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="h-8"
          >
            <List className="h-4 w-4 mr-1" />
            List
          </Button>
          <Button
            variant={viewMode === 'gallery' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('gallery')}
            className="h-8"
          >
            <LayoutGrid className="h-4 w-4 mr-1" />
            Logo Gallery
          </Button>
          {viewMode === 'gallery' && (
            <Button
              variant="outline"
              size="sm"
              onClick={downloadLogoPdf}
              disabled={downloadingPdf || loading || accounts.length === 0}
              className="h-8 ml-2"
            >
              <Download className="h-4 w-4 mr-1" />
              {downloadingPdf ? 'Generating...' : 'Download PDF'}
            </Button>
          )}
        </div>
      </div>

      {/* Accounts Display */}
      {viewMode === 'gallery' ? (
        /* Logo Gallery View */
        <Card className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No accounts found</p>
              <p className="text-sm mt-2">Convert won leads to create accounts</p>
            </div>
          ) : (
            <>
              {/* Logo Grid - 35mm x 35mm logos (approx 132px) */}
              <div ref={logoGridRef} className="flex flex-wrap gap-3 p-3 bg-white">
                {accounts.map((account, idx) => (
                  <div
                    key={account.id || idx}
                    onClick={() => navigate(`/accounts/${account.account_id}`)}
                    className="group cursor-pointer"
                  >
                    {/* 35mm = ~132px at 96dpi */}
                    <div 
                      className="relative rounded-lg overflow-hidden bg-white border border-gray-200 hover:border-primary/50 transition-all duration-200 hover:shadow-lg"
                      style={{ width: '132px', height: '132px' }}
                    >
                      {account.logo_url ? (
                        <img
                          src={`${process.env.REACT_APP_BACKEND_URL}${account.logo_url}`}
                          alt={account.account_name}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-1 bg-gradient-to-br from-gray-50 to-gray-100">
                          <p className="text-[8px] font-medium text-gray-500 text-center leading-tight line-clamp-3 px-1">
                            {account.account_name}
                          </p>
                        </div>
                      )}
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                        <p className="text-[8px] font-medium text-white text-center px-1 leading-tight">
                          {account.account_name}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Pagination for Gallery */}
              <div className="flex items-center justify-between mt-6 pt-6 border-t">
                <p className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      ) : (
        /* List View */
        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No accounts found</p>
              <p className="text-sm mt-2">Convert won leads to create accounts</p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="accounts-table">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold">Account</th>
                    <th className="text-left py-3 px-4 font-semibold">Type</th>
                    <th className="text-left py-3 px-4 font-semibold">Contact</th>
                    <th className="text-left py-3 px-4 font-semibold">Location</th>
                    <th className="text-left py-3 px-4 font-semibold">Account Age</th>
                    <th className="text-left py-3 px-4 font-semibold">Onboarded</th>
                    <th className="text-left py-3 px-4 font-semibold">Sales Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account, idx) => (
                    <tr 
                      key={account.id || idx} 
                      className="border-t hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/accounts/${account.account_id}`)}
                      data-testid={`account-row-${account.account_id}`}
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-primary">{account.account_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{account.account_id}</p>
                          {account.category && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              {account.category}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {account.account_type ? (
                          <Badge className={accountTypeColors[account.account_type] || 'bg-gray-100'}>
                            {account.account_type}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          {account.contact_name && (
                            <p className="font-medium flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {account.contact_name}
                            </p>
                          )}
                          {account.contact_number && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {account.contact_number}
                            </p>
                          )}
                          {!account.contact_name && !account.contact_number && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm">{account.city}</p>
                            <p className="text-xs text-muted-foreground">{account.state}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className={`font-medium ${
                            calculateAccountAge(account.created_at) === 'New' 
                              ? 'text-emerald-600' 
                              : ''
                          }`}>
                            {calculateAccountAge(account.created_at)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm">{formatDate(account.created_at)}</p>
                      </td>
                      <td className="py-3 px-4">
                        {account.sales_person_name ? (
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{account.sales_person_name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount} accounts
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    data-testid="prev-page-btn"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    data-testid="next-page-btn"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
      )}

      {/* Info Note */}
      <p className="text-xs text-muted-foreground mt-4 text-center">
        {viewMode === 'gallery' 
          ? 'Click on a logo to view account details. Hover to see category and type.'
          : 'Click on an account row to view details. Account Age is calculated from the onboarding date.'}
      </p>
    </div>
  );
}
