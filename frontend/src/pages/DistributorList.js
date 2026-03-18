import React, { useState, useEffect, useCallback } from 'react';
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
import { toast } from 'sonner';
import {
  Plus, Search, Building2, MapPin, Phone, Mail,
  Eye, Edit2, Trash2, RefreshCw, Truck, Users,
  ChevronLeft, ChevronRight, Package
} from 'lucide-react';
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
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-800' },
  { value: 'inactive', label: 'Inactive', color: 'bg-gray-100 text-gray-800' },
  { value: 'suspended', label: 'Suspended', color: 'bg-red-100 text-red-800' },
  { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
];

function getStatusBadge(status) {
  const statusConfig = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[1];
  return <Badge className={statusConfig.color}>{statusConfig.label}</Badge>;
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
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
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
    notes: ''
  });
  
  const canManage = user && ['CEO', 'Director', 'Admin', 'System Admin', 'Vice President', 'National Sales Head'].includes(user.role);

  const fetchDistributors = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('page_size', 20);
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
  }, [token, page, statusFilter, searchTerm]);

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
        notes: ''
      });
      fetchDistributors();
      fetchSummary();
      
      // Navigate to detail page to complete setup
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

  return (
    <div className="p-6 space-y-6" data-testid="distributor-list-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            Distributors
          </h1>
          <p className="text-muted-foreground">Manage your distribution partners and their coverage</p>
        </div>
        
        {canManage && (
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button data-testid="create-distributor-btn">
                <Plus className="h-4 w-4 mr-2" />
                Add Distributor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Distributor</DialogTitle>
                <DialogDescription>Create a new distributor profile. You can add coverage and locations later.</DialogDescription>
              </DialogHeader>
              
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="col-span-2 space-y-2">
                  <Label>Distributor Name *</Label>
                  <Input
                    placeholder="Enter distributor name"
                    value={newDistributor.distributor_name}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, distributor_name: e.target.value }))}
                    data-testid="distributor-name-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Legal Entity Name</Label>
                  <Input
                    placeholder="Legal entity name"
                    value={newDistributor.legal_entity_name}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, legal_entity_name: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>GSTIN</Label>
                  <Input
                    placeholder="GST Number"
                    value={newDistributor.gstin}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, gstin: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>PAN</Label>
                  <Input
                    placeholder="PAN Number"
                    value={newDistributor.pan}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, pan: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Payment Terms</Label>
                  <Select 
                    value={newDistributor.payment_terms} 
                    onValueChange={(v) => setNewDistributor(prev => ({ ...prev, payment_terms: v }))}
                  >
                    <SelectTrigger>
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
                  <Label>Billing Address</Label>
                  <Textarea
                    placeholder="Enter billing address"
                    value={newDistributor.billing_address}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, billing_address: e.target.value }))}
                    rows={2}
                  />
                </div>
                
                <div className="col-span-2 border-t pt-4">
                  <h4 className="font-medium mb-3">Primary Contact</h4>
                </div>
                
                <div className="space-y-2">
                  <Label>Contact Name *</Label>
                  <Input
                    placeholder="Contact person name"
                    value={newDistributor.primary_contact_name}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, primary_contact_name: e.target.value }))}
                    data-testid="distributor-contact-name-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Mobile Number *</Label>
                  <Input
                    placeholder="+91 9876543210"
                    value={newDistributor.primary_contact_mobile}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, primary_contact_mobile: e.target.value }))}
                    data-testid="distributor-contact-mobile-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="contact@example.com"
                    value={newDistributor.primary_contact_email}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, primary_contact_email: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Credit Limit (₹)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={newDistributor.credit_limit}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, credit_limit: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                
                <div className="col-span-2 space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes about the distributor"
                    value={newDistributor.notes}
                    onChange={(e) => setNewDistributor(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating} data-testid="create-distributor-submit">
                  {creating ? 'Creating...' : 'Create Distributor'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{summary.total || 0}</div>
            <div className="text-sm text-muted-foreground">Total Distributors</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{summary.active || 0}</div>
            <div className="text-sm text-muted-foreground">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-600">{summary.inactive || 0}</div>
            <div className="text-sm text-muted-foreground">Inactive</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{summary.suspended || 0}</div>
            <div className="text-sm text-muted-foreground">Suspended</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{summary.total_locations || 0}</div>
            <div className="text-sm text-muted-foreground">Total Locations</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, or contact..."
                value={searchTerm}
                onChange={handleSearch}
                className="pl-9"
                data-testid="distributor-search-input"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]" data-testid="distributor-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map(status => (
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { fetchDistributors(); fetchSummary(); }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Distributors Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Distributors ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : distributors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No distributors found</p>
              {canManage && (
                <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Distributor
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Distributor</th>
                      <th className="text-left p-3 font-medium">Code</th>
                      <th className="text-left p-3 font-medium">Primary Contact</th>
                      <th className="text-center p-3 font-medium">Coverage</th>
                      <th className="text-center p-3 font-medium">Locations</th>
                      <th className="text-center p-3 font-medium">Status</th>
                      <th className="text-right p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributors.map((dist) => (
                      <tr key={dist.id} className="border-b hover:bg-muted/30" data-testid={`distributor-row-${dist.id}`}>
                        <td className="p-3">
                          <div className="font-medium">{dist.distributor_name}</div>
                          {dist.legal_entity_name && (
                            <div className="text-sm text-muted-foreground">{dist.legal_entity_name}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{dist.distributor_code}</Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {dist.primary_contact_name}
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {dist.primary_contact_mobile}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span>{dist.coverage_count || 0} cities</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span>{dist.locations_count || 0}</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {getStatusBadge(dist.status)}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              data-testid={`view-distributor-${dist.id}`}
                            >
                              <Link to={`/distributors/${dist.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            {canManage && (
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                data-testid={`edit-distributor-${dist.id}`}
                              >
                                <Link to={`/distributors/${dist.id}/edit`}>
                                  <Edit2 className="h-4 w-4" />
                                </Link>
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({total} total)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
