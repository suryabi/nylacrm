import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { 
  Truck, Users, MapPin, Package, TrendUp, TrendDown, 
  ArrowUpRight, ArrowDownRight, Minus
} from '@phosphor-icons/react';
import { Plus, Search, Phone, RefreshCw, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PAYMENT_TERMS = [
  { value: 'advance', label: 'Advance' },
  { value: 'cod', label: 'Cash on Delivery' },
  { value: 'net_7', label: 'Net 7 Days' },
  { value: 'net_15', label: 'Net 15 Days' },
  { value: 'net_30', label: 'Net 30 Days' },
  { value: 'net_45', label: 'Net 45 Days' },
  { value: 'net_60', label: 'Net 60 Days' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'inactive', label: 'Inactive', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  { value: 'suspended', label: 'Suspended', color: 'bg-red-50 text-red-700 border-red-200' },
  { value: 'pending', label: 'Pending', color: 'bg-amber-50 text-amber-700 border-amber-200' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Generate mock sparkline data
const generateSparklineData = (trend = 'up', points = 7) => {
  const base = Math.random() * 50 + 25;
  return Array.from({ length: points }, (_, i) => ({
    value: base + (trend === 'up' ? i * 3 : -i * 2) + (Math.random() * 10 - 5)
  }));
};

function getStatusBadge(status) {
  const statusConfig = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[1];
  return (
    <Badge 
      variant="outline" 
      className={`${statusConfig.color} font-medium text-xs px-2.5 py-0.5 rounded-full border`}
    >
      {statusConfig.label}
    </Badge>
  );
}

// KPI Tile Component
function KPITile({ title, value, subtitle, icon: Icon, trend, trendValue, sparklineData, color = 'emerald' }) {
  const colorClasses = {
    emerald: { bg: 'bg-emerald-50/50', icon: 'text-emerald-600', border: 'border-emerald-100/60' },
    blue: { bg: 'bg-blue-50/50', icon: 'text-blue-600', border: 'border-blue-100/60' },
    amber: { bg: 'bg-amber-50/50', icon: 'text-amber-600', border: 'border-amber-100/60' },
    slate: { bg: 'bg-slate-50/50', icon: 'text-slate-600', border: 'border-slate-100/60' },
    red: { bg: 'bg-red-50/50', icon: 'text-red-600', border: 'border-red-100/60' },
  };
  
  const colors = colorClasses[color] || colorClasses.emerald;
  
  return (
    <div 
      className={`relative overflow-hidden rounded-xl bg-white border ${colors.border} p-6
        shadow-[0_2px_8px_rgba(6,95,70,0.04)] 
        hover:shadow-[0_8px_24px_rgba(6,95,70,0.08)] hover:-translate-y-[2px]
        transition-[transform,box-shadow] duration-300 ease-out`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-lg ${colors.bg}`}>
          <Icon className={`h-5 w-5 ${colors.icon}`} weight="duotone" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-500'
          }`}>
            {trend === 'up' && <ArrowUpRight className="h-3.5 w-3.5" weight="bold" />}
            {trend === 'down' && <ArrowDownRight className="h-3.5 w-3.5" weight="bold" />}
            {trend === 'neutral' && <Minus className="h-3.5 w-3.5" weight="bold" />}
            <span>{trendValue}</span>
          </div>
        )}
      </div>
      
      {/* Value */}
      <div className="mb-1">
        <span className="text-4xl font-light tracking-tight text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
          {value}
        </span>
      </div>
      
      {/* Title & Subtitle */}
      <p className="text-sm font-medium text-slate-600 uppercase tracking-[0.1em]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
        {title}
      </p>
      {subtitle && (
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      )}
      
      {/* Sparkline */}
      {sparklineData && (
        <div className="mt-4 h-10 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData}>
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={color === 'emerald' ? '#059669' : color === 'blue' ? '#2563eb' : '#6b7280'}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// Sortable Table Header
function SortableHeader({ label, sortKey, currentSort, onSort }) {
  const isActive = currentSort.key === sortKey;
  const direction = isActive ? currentSort.direction : null;
  
  return (
    <th 
      className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs cursor-pointer select-none hover:bg-emerald-50/30 transition-colors"
      onClick={() => onSort(sortKey)}
      style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
    >
      <div className="flex items-center gap-1.5">
        <span>{label}</span>
        <span className="flex flex-col">
          {direction === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5 text-emerald-700" />
          ) : direction === 'desc' ? (
            <ChevronDown className="h-3.5 w-3.5 text-emerald-700" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
          )}
        </span>
      </div>
    </th>
  );
}

export default function DistributorList() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [distributors, setDistributors] = useState([]);
  const [summary, setSummary] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState({ key: 'distributor_name', direction: 'asc' });
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newDistributor, setNewDistributor] = useState({
    distributor_name: '',
    legal_entity_name: '',
    gstin: '',
    pan: '',
    billing_address: '',
    primary_contact_name: '',
    primary_contact_mobile: '',
    primary_contact_email: '',
    payment_terms: 'net_30',
    credit_days: 30,
    credit_limit: 0,
    is_self_managed: false,
    notes: ''
  });
  
  const canManage = user && ['CEO', 'Director', 'Admin', 'System Admin', 'Vice President', 'National Sales Head'].includes(user.role);

  // Sparkline data for KPIs (memoized)
  const sparklineData = useMemo(() => ({
    total: generateSparklineData('up'),
    active: generateSparklineData('up'),
    locations: generateSparklineData('up'),
  }), []);

  const fetchDistributors = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('page_size', pageSize);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (searchTerm) params.append('search', searchTerm);
      
      const response = await axios.get(`${API_URL}/api/distributors?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      setDistributors(response.data.distributors || []);
      setTotalPages(response.data.total_pages || 1);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Failed to fetch distributors:', error);
      toast.error('Failed to load distributors');
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, statusFilter, searchTerm]);

  const fetchSummary = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/distributors/summary`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchDistributors();
    fetchSummary();
  }, [fetchDistributors, fetchSummary]);

  // Sort distributors client-side
  const sortedDistributors = useMemo(() => {
    if (!sort.key) return distributors;
    
    return [...distributors].sort((a, b) => {
      let aVal = a[sort.key];
      let bVal = b[sort.key];
      
      // Handle nested values
      if (sort.key === 'coverage') {
        aVal = a.coverage_count || 0;
        bVal = b.coverage_count || 0;
      } else if (sort.key === 'locations') {
        aVal = a.locations_count || 0;
        bVal = b.locations_count || 0;
      }
      
      // Handle strings
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }
      
      if (aVal < bVal) return sort.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [distributors, sort]);

  const handleSort = (key) => {
    setSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleCreate = async () => {
    if (!newDistributor.distributor_name?.trim()) {
      toast.error('Distributor name is required');
      return;
    }
    if (!newDistributor.primary_contact_name?.trim()) {
      toast.error('Primary contact name is required');
      return;
    }
    if (!newDistributor.primary_contact_mobile?.trim()) {
      toast.error('Primary contact mobile is required');
      return;
    }
    
    try {
      setCreating(true);
      const response = await axios.post(`${API_URL}/api/distributors`, newDistributor, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      toast.success(`Distributor '${response.data.distributor_name}' created successfully`);
      setShowCreateDialog(false);
      setNewDistributor({
        distributor_name: '',
        legal_entity_name: '',
        gstin: '',
        pan: '',
        billing_address: '',
        primary_contact_name: '',
        primary_contact_mobile: '',
        primary_contact_email: '',
        payment_terms: 'net_30',
        credit_days: 30,
        credit_limit: 0,
        is_self_managed: false,
        notes: ''
      });
      fetchDistributors();
      fetchSummary();
      navigate(`/distributors/${response.data.id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create distributor');
    } finally {
      setCreating(false);
    }
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const handleRowClick = (distributorId) => {
    navigate(`/distributors/${distributorId}`);
  };

  const startIndex = (page - 1) * pageSize + 1;
  const endIndex = Math.min(page * pageSize, total);

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1600px] mx-auto" data-testid="distributor-list-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 flex items-center gap-3" style={{ fontFamily: 'Manrope, sans-serif' }}>
            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
              <Truck className="h-7 w-7 text-emerald-700" weight="duotone" />
            </div>
            Distributors
          </h1>
          <p className="text-slate-500 mt-1.5 ml-14" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
            Manage your distribution partners and their coverage
          </p>
        </div>
        
        {canManage && (
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button 
                className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-full px-6 shadow-lg shadow-emerald-200/50 transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5"
                data-testid="create-distributor-btn"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Distributor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: 'Manrope, sans-serif' }}>Add New Distributor</DialogTitle>
                <DialogDescription>Create a new distributor profile. You can add coverage and locations later.</DialogDescription>
              </DialogHeader>
              
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2 space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-600">Distributor Name *</Label>
                  <Input
                    placeholder="Enter distributor name"
                    value={newDistributor.distributor_name}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, distributor_name: e.target.value }))}
                    className="rounded-lg border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20"
                    data-testid="distributor-name-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-600">Legal Entity Name</Label>
                  <Input
                    placeholder="Legal entity name"
                    value={newDistributor.legal_entity_name}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, legal_entity_name: e.target.value }))}
                    className="rounded-lg"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-600">GSTIN</Label>
                  <Input
                    placeholder="GST Number"
                    value={newDistributor.gstin}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, gstin: e.target.value }))}
                    className="rounded-lg"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-600">PAN</Label>
                  <Input
                    placeholder="PAN Number"
                    value={newDistributor.pan}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, pan: e.target.value }))}
                    className="rounded-lg"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-600">Payment Terms</Label>
                  <Select 
                    value={newDistributor.payment_terms} 
                    onValueChange={(v) => setNewDistributor(prev => ({ ...prev, payment_terms: v }))}
                  >
                    <SelectTrigger className="rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map(term => (
                        <SelectItem key={term.value} value={term.value}>{term.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="col-span-2 space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-600">Billing Address</Label>
                  <Textarea
                    placeholder="Enter billing address"
                    value={newDistributor.billing_address}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, billing_address: e.target.value }))}
                    rows={2}
                    className="rounded-lg"
                  />
                </div>
                
                <div className="col-span-2 border-t pt-4 mt-2">
                  <h4 className="font-semibold text-slate-800 mb-3" style={{ fontFamily: 'Manrope, sans-serif' }}>Primary Contact</h4>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-600">Contact Name *</Label>
                  <Input
                    placeholder="Contact person name"
                    value={newDistributor.primary_contact_name}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, primary_contact_name: e.target.value }))}
                    className="rounded-lg"
                    data-testid="distributor-contact-name-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-600">Mobile Number *</Label>
                  <Input
                    placeholder="+91 9876543210"
                    value={newDistributor.primary_contact_mobile}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, primary_contact_mobile: e.target.value }))}
                    className="rounded-lg"
                    data-testid="distributor-contact-mobile-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-600">Email</Label>
                  <Input
                    type="email"
                    placeholder="contact@example.com"
                    value={newDistributor.primary_contact_email}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, primary_contact_email: e.target.value }))}
                    className="rounded-lg"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-600">Credit Limit (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newDistributor.credit_limit}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, credit_limit: parseFloat(e.target.value) || 0 }))}
                    className="rounded-lg"
                  />
                </div>
                
                <div className="col-span-2 space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-slate-600">Notes</Label>
                  <Textarea
                    placeholder="Additional notes about the distributor"
                    value={newDistributor.notes}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    className="rounded-lg"
                  />
                </div>

                <div className="col-span-2 flex items-center gap-3 p-3 rounded-lg bg-blue-50/60 border border-blue-100">
                  <Checkbox
                    id="is_self_managed"
                    checked={newDistributor.is_self_managed}
                    onCheckedChange={(checked) => setNewDistributor(prev => ({ ...prev, is_self_managed: !!checked }))}
                    data-testid="distributor-self-managed-checkbox"
                  />
                  <label htmlFor="is_self_managed" className="text-sm font-medium text-slate-700 cursor-pointer">
                    Self Managed (Not Third Party)
                  </label>
                </div>
              </div>
              
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="rounded-full px-6">
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreate} 
                  disabled={creating} 
                  className="bg-emerald-700 hover:bg-emerald-800 rounded-full px-6"
                  data-testid="create-distributor-submit"
                >
                  {creating ? 'Creating...' : 'Create Distributor'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPITile
          title="Total Distributors"
          value={summary.total || 0}
          subtitle="All partners"
          icon={Truck}
          trend="up"
          trendValue="+12%"
          sparklineData={sparklineData.total}
          color="emerald"
        />
        <KPITile
          title="Active"
          value={summary.active || 0}
          subtitle="Currently operating"
          icon={TrendUp}
          trend="up"
          trendValue="+8%"
          sparklineData={sparklineData.active}
          color="emerald"
        />
        <KPITile
          title="Inactive"
          value={(summary.inactive || 0) + (summary.suspended || 0)}
          subtitle={`${summary.suspended || 0} suspended`}
          icon={TrendDown}
          trend="neutral"
          trendValue="0%"
          color="slate"
        />
        <KPITile
          title="Total Locations"
          value={summary.total_locations || 0}
          subtitle="Warehouses & offices"
          icon={Package}
          trend="up"
          trendValue="+5%"
          sparklineData={sparklineData.locations}
          color="blue"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-emerald-100/60 p-4 shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, code, or contact..."
              value={searchTerm}
              onChange={handleSearch}
              className="pl-10 rounded-lg border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20 bg-slate-50/50"
              data-testid="distributor-search-input"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px] rounded-lg border-slate-200" data-testid="distributor-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUS_OPTIONS.map(status => (
                <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            onClick={() => { fetchDistributors(); fetchSummary(); }}
            className="rounded-lg border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Distributors Table */}
      <div className="bg-white rounded-xl border border-emerald-100/60 shadow-[0_2px_8px_rgba(6,95,70,0.04)] overflow-hidden">
        <div className="p-5 border-b border-emerald-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Distributors
            <span className="ml-2 text-sm font-normal text-slate-500">({total})</span>
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[80px] h-8 rounded-lg text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(size => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        ) : distributors.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <Truck className="h-16 w-16 mx-auto mb-4 text-slate-300" weight="duotone" />
            <p className="text-lg font-medium">No distributors found</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters</p>
            {canManage && (
              <Button 
                className="mt-6 bg-emerald-700 hover:bg-emerald-800 rounded-full px-6" 
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Distributor
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-emerald-50/30 border-b border-emerald-100/60">
                    <SortableHeader label="Distributor" sortKey="distributor_name" currentSort={sort} onSort={handleSort} />
                    <SortableHeader label="Code" sortKey="distributor_code" currentSort={sort} onSort={handleSort} />
                    <th className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                      Primary Contact
                    </th>
                    <SortableHeader label="Coverage" sortKey="coverage" currentSort={sort} onSort={handleSort} />
                    <SortableHeader label="Locations" sortKey="locations" currentSort={sort} onSort={handleSort} />
                    <SortableHeader label="Status" sortKey="status" currentSort={sort} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {sortedDistributors.map((dist, idx) => (
                    <tr 
                      key={dist.id} 
                      className={`border-b border-emerald-50 cursor-pointer transition-colors duration-200 active:scale-[0.995]
                        ${idx % 2 === 1 ? 'bg-emerald-50/40' : 'bg-white'}
                        hover:bg-emerald-50/60`}
                      onClick={() => handleRowClick(dist.id)}
                      data-testid={`distributor-row-${dist.id}`}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                            {dist.distributor_name}
                          </span>
                          {dist.is_self_managed && (
                            <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0" variant="outline" data-testid={`self-managed-badge-${dist.id}`}>
                              Self Managed
                            </Badge>
                          )}
                        </div>
                        {dist.legal_entity_name && (
                          <div className="text-xs text-slate-500 mt-0.5">{dist.legal_entity_name}</div>
                        )}
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className="font-mono text-xs bg-slate-50 border-slate-200 text-slate-600">
                          {dist.distributor_code}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Users className="h-3.5 w-3.5 text-slate-400" weight="fill" />
                          <span className="text-sm">{dist.primary_contact_name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                          <Phone className="h-3 w-3" />
                          {dist.primary_contact_mobile}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <MapPin className="h-4 w-4 text-emerald-600" weight="fill" />
                          <span className="text-sm font-medium">{dist.coverage_count || 0}</span>
                          <span className="text-xs text-slate-500">cities</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <Package className="h-4 w-4 text-blue-600" weight="fill" />
                          <span className="text-sm font-medium">{dist.locations_count || 0}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        {getStatusBadge(dist.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            <div className="flex items-center justify-between p-4 border-t border-emerald-50 bg-slate-50/50">
              <div className="text-sm text-slate-600">
                Showing <span className="font-medium">{startIndex}</span> to <span className="font-medium">{endIndex}</span> of <span className="font-medium">{total}</span> distributors
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg h-8 px-3 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 p-0 rounded-lg text-sm ${
                          page === pageNum 
                            ? 'bg-emerald-700 hover:bg-emerald-800 text-white' 
                            : 'hover:bg-emerald-50 text-slate-600'
                        }`}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg h-8 px-3 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
