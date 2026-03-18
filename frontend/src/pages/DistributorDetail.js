import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useMasterLocations from '../hooks/useMasterLocations';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, MapPin, Phone, Mail, Edit2, Trash2,
  RefreshCw, Plus, Package, Truck, CreditCard, Calendar,
  User, FileText, Check, X, Save, Percent, DollarSign, Copy
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

const MARGIN_TYPES = [
  { value: 'percentage', label: 'Percentage (%)', icon: Percent, description: 'Percentage on account invoice value' },
  { value: 'fixed_per_bottle', label: 'Fixed per Bottle (₹)', icon: DollarSign, description: 'Fixed amount per bottle' },
  { value: 'fixed_per_case', label: 'Fixed per Case (₹)', icon: DollarSign, description: 'Fixed amount per case/crate' },
];

function getMarginTypeLabel(type) {
  const found = MARGIN_TYPES.find(m => m.value === type);
  return found ? found.label : type;
}

function formatMarginValue(type, value) {
  if (type === 'percentage') {
    return `${value}%`;
  }
  return `₹${value}`;
}

function getStatusBadge(status) {
  const statusConfig = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[1];
  return <Badge className={statusConfig.color}>{statusConfig.label}</Badge>;
}

export default function DistributorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { stateNames, cityNames, getCityNamesByStateName } = useMasterLocations();
  
  const [loading, setLoading] = useState(true);
  const [distributor, setDistributor] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  
  // Coverage dialog
  const [showCoverageDialog, setShowCoverageDialog] = useState(false);
  const [selectedState, setSelectedState] = useState('');
  const [selectedCities, setSelectedCities] = useState([]);
  const [addingCoverage, setAddingCoverage] = useState(false);
  
  // Location dialog
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [newLocation, setNewLocation] = useState({
    location_name: '',
    address_line_1: '',
    address_line_2: '',
    state: '',
    city: '',
    pincode: '',
    contact_person: '',
    contact_number: '',
    email: '',
    is_default: false
  });
  const [addingLocation, setAddingLocation] = useState(false);
  
  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  
  // Account Assignment state
  const [assignments, setAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({
    servicing_city: '',
    distributor_location_id: '',
    is_primary: true,
    is_backup: false,
    has_special_override: false,
    override_type: '',
    override_value: '',
    remarks: ''
  });
  const [savingAssignment, setSavingAssignment] = useState(false);
  
  // Margin Matrix state - Grid based
  const [margins, setMargins] = useState([]);
  const [marginsLoading, setMarginsLoading] = useState(false);
  const [selectedMarginCity, setSelectedMarginCity] = useState('');
  const [skus, setSkus] = useState([]);
  const [marginGrid, setMarginGrid] = useState({}); // { sku_id: { margin_type, margin_value, ... } }
  const [hasMarginChanges, setHasMarginChanges] = useState(false);
  const [savingMargins, setSavingMargins] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyTargetCity, setCopyTargetCity] = useState('');
  const [copying, setCopying] = useState(false);
  
  const canManage = user && ['CEO', 'Director', 'Admin', 'System Admin', 'Vice President', 'National Sales Head'].includes(user.role);

  const fetchDistributor = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/distributors/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setDistributor(response.data);
      setEditData(response.data);
    } catch (error) {
      console.error('Failed to fetch distributor:', error);
      toast.error('Failed to load distributor details');
      navigate('/distributors');
    } finally {
      setLoading(false);
    }
  }, [id, token, navigate]);

  useEffect(() => {
    fetchDistributor();
  }, [fetchDistributor]);

  // Fetch margins when tab changes to margins
  const fetchMargins = useCallback(async () => {
    try {
      setMarginsLoading(true);
      const params = new URLSearchParams();
      if (selectedMarginCity) params.append('city', selectedMarginCity);
      
      const response = await axios.get(`${API_URL}/api/distributors/${id}/margins?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setMargins(response.data.margins || []);
      
      // Build grid from margins
      const grid = {};
      (response.data.margins || []).forEach(m => {
        grid[m.sku_id] = {
          id: m.id,
          margin_type: m.margin_type,
          margin_value: m.margin_value,
          min_quantity: m.min_quantity,
          max_quantity: m.max_quantity,
          status: m.status
        };
      });
      setMarginGrid(grid);
      setHasMarginChanges(false);
    } catch (error) {
      console.error('Failed to fetch margins:', error);
    } finally {
      setMarginsLoading(false);
    }
  }, [id, token, selectedMarginCity]);

  // Fetch SKUs for margin creation
  const fetchSkus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/master-skus`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSkus(response.data.skus || response.data || []);
    } catch (error) {
      console.error('Failed to fetch SKUs:', error);
    }
  }, [token]);

  // Set default city when coverage loads
  useEffect(() => {
    if (activeTab === 'margins' && distributor?.operating_coverage?.length > 0 && !selectedMarginCity) {
      const firstActiveCity = distributor.operating_coverage.find(c => c.status === 'active');
      if (firstActiveCity) {
        setSelectedMarginCity(firstActiveCity.city);
      }
    }
  }, [activeTab, distributor, selectedMarginCity]);

  useEffect(() => {
    if (activeTab === 'margins') {
      fetchSkus();
    }
  }, [activeTab, fetchSkus]);

  useEffect(() => {
    if (activeTab === 'margins' && selectedMarginCity) {
      fetchMargins();
    }
  }, [activeTab, selectedMarginCity, fetchMargins]);

  // Fetch account assignments
  const fetchAssignments = useCallback(async () => {
    try {
      setAssignmentsLoading(true);
      const response = await axios.get(`${API_URL}/api/distributors/${id}/assignments`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setAssignments(response.data.assignments || []);
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (activeTab === 'assignments') {
      fetchAssignments();
    }
  }, [activeTab, fetchAssignments]);

  // Search accounts
  const searchAccounts = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    try {
      setSearching(true);
      const response = await axios.get(`${API_URL}/api/distributors/accounts/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSearchResults(response.data.accounts || []);
    } catch (error) {
      console.error('Failed to search accounts:', error);
    } finally {
      setSearching(false);
    }
  }, [token]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (accountSearch) {
        searchAccounts(accountSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [accountSearch, searchAccounts]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await axios.put(`${API_URL}/api/distributors/${id}`, editData, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Distributor updated successfully');
      setIsEditing(false);
      fetchDistributor();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update distributor');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCoverage = async () => {
    if (!selectedState || selectedCities.length === 0) {
      toast.error('Please select state and at least one city');
      return;
    }
    
    try {
      setAddingCoverage(true);
      const coverageData = selectedCities.map(city => ({
        distributor_id: id,
        state: selectedState,
        city: city,
        status: 'active'
      }));
      
      const response = await axios.post(
        `${API_URL}/api/distributors/${id}/coverage/bulk`,
        coverageData,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      
      if (response.data.added_count > 0) {
        toast.success(`Added ${response.data.added_count} coverage areas`);
      }
      if (response.data.skipped_count > 0) {
        toast.info(`${response.data.skipped_count} areas were already covered`);
      }
      
      setShowCoverageDialog(false);
      setSelectedState('');
      setSelectedCities([]);
      fetchDistributor();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add coverage');
    } finally {
      setAddingCoverage(false);
    }
  };

  const handleDeleteCoverage = async (coverageId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/coverage/${coverageId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Coverage removed');
      setDeleteTarget(null);
      fetchDistributor();
    } catch (error) {
      toast.error('Failed to remove coverage');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocation.location_name || !newLocation.state || !newLocation.city) {
      toast.error('Location name, state, and city are required');
      return;
    }
    
    try {
      setAddingLocation(true);
      await axios.post(
        `${API_URL}/api/distributors/${id}/locations`,
        { ...newLocation, distributor_id: id },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      
      toast.success('Location added successfully');
      setShowLocationDialog(false);
      setNewLocation({
        location_name: '',
        address_line_1: '',
        address_line_2: '',
        state: '',
        city: '',
        pincode: '',
        contact_person: '',
        contact_number: '',
        email: '',
        is_default: false
      });
      fetchDistributor();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add location');
    } finally {
      setAddingLocation(false);
    }
  };

  const handleDeleteLocation = async (locationId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/locations/${locationId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Location removed');
      setDeleteTarget(null);
      fetchDistributor();
    } catch (error) {
      toast.error('Failed to remove location');
    } finally {
      setDeleting(false);
    }
  };

  // ============ Margin Matrix Handlers ============
  
  // ============ Margin Matrix Grid Handlers ============
  
  const updateMarginGridValue = (skuId, field, value) => {
    setMarginGrid(prev => ({
      ...prev,
      [skuId]: {
        ...(prev[skuId] || { margin_type: 'percentage', margin_value: 0 }),
        [field]: value
      }
    }));
    setHasMarginChanges(true);
  };

  const saveAllMargins = async () => {
    if (!selectedMarginCity) {
      toast.error('Please select a city first');
      return;
    }
    
    try {
      setSavingMargins(true);
      const coverage = distributor.operating_coverage?.find(c => c.city === selectedMarginCity);
      
      // Process each SKU in the grid that has values
      let savedCount = 0;
      let errorCount = 0;
      
      for (const sku of skus) {
        const gridEntry = marginGrid[sku.id];
        if (!gridEntry || !gridEntry.margin_value || gridEntry.margin_value <= 0) continue;
        
        const marginData = {
          distributor_id: id,
          state: coverage?.state || '',
          city: selectedMarginCity,
          sku_id: sku.id,
          sku_name: sku.name || sku.sku_name,
          margin_type: gridEntry.margin_type || 'percentage',
          margin_value: parseFloat(gridEntry.margin_value),
          min_quantity: gridEntry.min_quantity ? parseInt(gridEntry.min_quantity) : null,
          max_quantity: gridEntry.max_quantity ? parseInt(gridEntry.max_quantity) : null,
          status: 'active'
        };
        
        try {
          if (gridEntry.id) {
            // Update existing
            await axios.put(`${API_URL}/api/distributors/${id}/margins/${gridEntry.id}`, marginData, {
              headers: { Authorization: `Bearer ${token}` },
              withCredentials: true
            });
          } else {
            // Create new
            await axios.post(`${API_URL}/api/distributors/${id}/margins`, marginData, {
              headers: { Authorization: `Bearer ${token}` },
              withCredentials: true
            });
          }
          savedCount++;
        } catch (error) {
          // If entry exists, try to update
          if (error.response?.status === 400 && error.response?.data?.detail?.includes('already exists')) {
            // Find existing and update
            const existing = margins.find(m => m.sku_id === sku.id);
            if (existing) {
              try {
                await axios.put(`${API_URL}/api/distributors/${id}/margins/${existing.id}`, marginData, {
                  headers: { Authorization: `Bearer ${token}` },
                  withCredentials: true
                });
                savedCount++;
              } catch (e) {
                errorCount++;
              }
            }
          } else {
            errorCount++;
          }
        }
      }
      
      if (savedCount > 0) {
        toast.success(`Saved ${savedCount} margin entries`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to save ${errorCount} entries`);
      }
      
      setHasMarginChanges(false);
      fetchMargins();
    } catch (error) {
      toast.error('Failed to save margins');
    } finally {
      setSavingMargins(false);
    }
  };

  const copyMarginsToCity = async () => {
    if (!selectedMarginCity || !copyTargetCity) {
      toast.error('Please select both source and target cities');
      return;
    }
    
    if (selectedMarginCity === copyTargetCity) {
      toast.error('Source and target cities cannot be the same');
      return;
    }
    
    try {
      setCopying(true);
      const coverage = distributor.operating_coverage?.find(c => c.city === copyTargetCity);
      
      // Get all margins from current city
      const marginsToCreate = margins.map(m => ({
        distributor_id: id,
        state: coverage?.state || '',
        city: copyTargetCity,
        sku_id: m.sku_id,
        sku_name: m.sku_name,
        margin_type: m.margin_type,
        margin_value: m.margin_value,
        min_quantity: m.min_quantity,
        max_quantity: m.max_quantity,
        status: 'active'
      }));
      
      const response = await axios.post(
        `${API_URL}/api/distributors/${id}/margins/bulk`,
        marginsToCreate,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      
      const added = response.data.added_count || 0;
      const skipped = response.data.skipped_count || 0;
      
      if (added > 0) {
        toast.success(`Copied ${added} margin entries to ${copyTargetCity}`);
      }
      if (skipped > 0) {
        toast.info(`${skipped} entries already existed in ${copyTargetCity}`);
      }
      
      setShowCopyDialog(false);
      setCopyTargetCity('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to copy margins');
    } finally {
      setCopying(false);
    }
  };

  const handleDeleteMargin = async (marginId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/margins/${marginId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Margin entry deleted');
      setDeleteTarget(null);
      fetchMargins();
    } catch (error) {
      toast.error('Failed to delete margin entry');
    } finally {
      setDeleting(false);
    }
  };

  // ============ Account Assignment Handlers ============
  
  const handleCreateAssignment = async () => {
    if (!selectedAccount) {
      toast.error('Please select an account');
      return;
    }
    if (!assignmentForm.servicing_city) {
      toast.error('Please select a servicing city');
      return;
    }
    
    try {
      setSavingAssignment(true);
      
      // Get state from coverage
      const coverage = distributor.operating_coverage?.find(c => c.city === assignmentForm.servicing_city);
      
      const assignmentData = {
        account_id: selectedAccount.id,
        account_name: selectedAccount.company || selectedAccount.name,
        distributor_id: id,
        distributor_name: distributor.distributor_name,
        servicing_state: coverage?.state || '',
        servicing_city: assignmentForm.servicing_city,
        distributor_location_id: assignmentForm.distributor_location_id || null,
        is_primary: assignmentForm.is_primary,
        is_backup: assignmentForm.is_backup,
        has_special_override: assignmentForm.has_special_override,
        override_type: assignmentForm.has_special_override ? assignmentForm.override_type : null,
        override_value: assignmentForm.has_special_override ? parseFloat(assignmentForm.override_value) : null,
        remarks: assignmentForm.remarks || null,
        status: 'active'
      };
      
      await axios.post(`${API_URL}/api/distributors/${id}/assignments`, assignmentData, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      toast.success(`Account '${selectedAccount.company || selectedAccount.name}' assigned successfully`);
      setShowAssignDialog(false);
      setSelectedAccount(null);
      setAccountSearch('');
      setSearchResults([]);
      setAssignmentForm({
        servicing_city: '',
        distributor_location_id: '',
        is_primary: true,
        is_backup: false,
        has_special_override: false,
        override_type: '',
        override_value: '',
        remarks: ''
      });
      fetchAssignments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create assignment');
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/assignments/${assignmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Assignment removed');
      setDeleteTarget(null);
      fetchAssignments();
    } catch (error) {
      toast.error('Failed to remove assignment');
    } finally {
      setDeleting(false);
    }
  };

  // Get available cities for the selected state that are not already covered
  const getAvailableCities = () => {
    if (!selectedState) return [];
    const stateCities = getCityNamesByStateName(selectedState);
    const coveredCities = (distributor?.operating_coverage || [])
      .filter(c => c.state === selectedState && c.status === 'active')
      .map(c => c.city);
    return stateCities.filter(city => !coveredCities.includes(city));
  };

  // Get covered cities for location selection
  const getCoveredCities = () => {
    return [...new Set((distributor?.operating_coverage || [])
      .filter(c => c.status === 'active')
      .map(c => c.city))];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!distributor) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Distributor not found</p>
        <Button className="mt-4" onClick={() => navigate('/distributors')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Distributors
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="distributor-detail-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/distributors')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{distributor.distributor_name}</h1>
              <Badge variant="outline">{distributor.distributor_code}</Badge>
              {getStatusBadge(distributor.status)}
            </div>
            {distributor.legal_entity_name && (
              <p className="text-muted-foreground">{distributor.legal_entity_name}</p>
            )}
          </div>
        </div>
        
        {canManage && !isEditing && (
          <Button onClick={() => setIsEditing(true)}>
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </Button>
        )}
        
        {isEditing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setIsEditing(false); setEditData(distributor); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="coverage">
            Operating Coverage ({distributor.operating_coverage?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="locations">
            Locations ({distributor.locations?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="margins">
            Margin Matrix ({margins.length})
          </TabsTrigger>
          <TabsTrigger value="assignments" data-testid="assignments-tab">
            Account Assignments ({assignments.length})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div className="space-y-2">
                      <Label>Distributor Name</Label>
                      <Input
                        value={editData.distributor_name || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, distributor_name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Legal Entity Name</Label>
                      <Input
                        value={editData.legal_entity_name || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, legal_entity_name: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>GSTIN</Label>
                        <Input
                          value={editData.gstin || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, gstin: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>PAN</Label>
                        <Input
                          value={editData.pan || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, pan: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={editData.status}
                        onValueChange={(v) => setEditData(prev => ({ ...prev, status: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">GSTIN</div>
                        <div className="font-medium">{distributor.gstin || '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">PAN</div>
                        <div className="font-medium">{distributor.pan || '-'}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Billing Address</div>
                      <div className="font-medium">{distributor.billing_address || '-'}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Registered Address</div>
                      <div className="font-medium">{distributor.registered_address || '-'}</div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div className="space-y-2">
                      <Label>Primary Contact Name</Label>
                      <Input
                        value={editData.primary_contact_name || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, primary_contact_name: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Mobile</Label>
                        <Input
                          value={editData.primary_contact_mobile || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, primary_contact_mobile: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={editData.primary_contact_email || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, primary_contact_email: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Secondary Contact</h4>
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={editData.secondary_contact_name || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, secondary_contact_name: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-2">
                        <div className="space-y-2">
                          <Label>Mobile</Label>
                          <Input
                            value={editData.secondary_contact_mobile || ''}
                            onChange={(e) => setEditData(prev => ({ ...prev, secondary_contact_mobile: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input
                            type="email"
                            value={editData.secondary_contact_email || ''}
                            onChange={(e) => setEditData(prev => ({ ...prev, secondary_contact_email: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="border-b pb-4">
                      <h4 className="font-medium mb-2">Primary Contact</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{distributor.primary_contact_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{distributor.primary_contact_mobile}</span>
                        </div>
                        {distributor.primary_contact_email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span>{distributor.primary_contact_email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {distributor.secondary_contact_name && (
                      <div>
                        <h4 className="font-medium mb-2">Secondary Contact</h4>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>{distributor.secondary_contact_name}</span>
                          </div>
                          {distributor.secondary_contact_mobile && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <span>{distributor.secondary_contact_mobile}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Commercial Terms */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Commercial Terms
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Payment Terms</Label>
                      <Select
                        value={editData.payment_terms}
                        onValueChange={(v) => setEditData(prev => ({ ...prev, payment_terms: v }))}
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
                    <div className="space-y-2">
                      <Label>Credit Days</Label>
                      <Input
                        type="number"
                        value={editData.credit_days || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, credit_days: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Credit Limit (₹)</Label>
                      <Input
                        type="number"
                        value={editData.credit_limit || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, credit_limit: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Security Deposit (₹)</Label>
                      <Input
                        type="number"
                        value={editData.security_deposit || ''}
                        onChange={(e) => setEditData(prev => ({ ...prev, security_deposit: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <div className="text-sm text-muted-foreground">Payment Terms</div>
                      <div className="font-medium">
                        {PAYMENT_TERMS.find(t => t.value === distributor.payment_terms)?.label || distributor.payment_terms}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Credit Days</div>
                      <div className="font-medium">{distributor.credit_days} days</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Credit Limit</div>
                      <div className="font-medium">₹{(distributor.credit_limit || 0).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Security Deposit</div>
                      <div className="font-medium">₹{(distributor.security_deposit || 0).toLocaleString()}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Operating Coverage Tab */}
        <TabsContent value="coverage">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Operating Coverage</CardTitle>
                <CardDescription>Cities where this distributor can operate</CardDescription>
              </div>
              {canManage && (
                <Dialog open={showCoverageDialog} onOpenChange={setShowCoverageDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="add-coverage-btn">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Coverage
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Operating Coverage</DialogTitle>
                      <DialogDescription>Select state and cities where this distributor will operate</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>State</Label>
                        <Select value={selectedState} onValueChange={(v) => { setSelectedState(v); setSelectedCities([]); }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent>
                            {stateNames.map(state => (
                              <SelectItem key={state} value={state}>{state}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedState && (
                        <div className="space-y-2">
                          <Label>Cities (select multiple)</Label>
                          <div className="max-h-60 overflow-y-auto border rounded-md p-3 space-y-2">
                            {getAvailableCities().length === 0 ? (
                              <p className="text-sm text-muted-foreground">All cities in this state are already covered</p>
                            ) : (
                              getAvailableCities().map(city => (
                                <div key={city} className="flex items-center gap-2">
                                  <Checkbox
                                    id={city}
                                    checked={selectedCities.includes(city)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setSelectedCities(prev => [...prev, city]);
                                      } else {
                                        setSelectedCities(prev => prev.filter(c => c !== city));
                                      }
                                    }}
                                  />
                                  <label htmlFor={city} className="text-sm cursor-pointer">{city}</label>
                                </div>
                              ))
                            )}
                          </div>
                          {selectedCities.length > 0 && (
                            <p className="text-sm text-muted-foreground">{selectedCities.length} cities selected</p>
                          )}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowCoverageDialog(false)}>Cancel</Button>
                      <Button onClick={handleAddCoverage} disabled={addingCoverage || selectedCities.length === 0}>
                        {addingCoverage ? 'Adding...' : 'Add Coverage'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {distributor.operating_coverage?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No operating coverage defined</p>
                  <p className="text-sm">Add cities where this distributor can operate</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">State</th>
                        <th className="text-left p-3 font-medium">City</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {distributor.operating_coverage?.map((coverage) => (
                        <tr key={coverage.id} className="border-b hover:bg-muted/30">
                          <td className="p-3">{coverage.state}</td>
                          <td className="p-3 font-medium">{coverage.city}</td>
                          <td className="p-3 text-center">{getStatusBadge(coverage.status)}</td>
                          <td className="p-3 text-right">
                            {canManage && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => setDeleteTarget({ type: 'coverage', id: coverage.id, name: coverage.city })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Locations Tab */}
        <TabsContent value="locations">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Distributor Locations / Warehouses</CardTitle>
                <CardDescription>Stock dispatch points for this distributor</CardDescription>
              </div>
              {canManage && (
                <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="add-location-btn">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Location
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Add New Location</DialogTitle>
                      <DialogDescription>Add a warehouse or stocking location for this distributor</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                      <div className="space-y-2">
                        <Label>Location Name *</Label>
                        <Input
                          placeholder="e.g., Bangalore Main Warehouse"
                          value={newLocation.location_name}
                          onChange={(e) => setNewLocation(prev => ({ ...prev, location_name: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>State *</Label>
                          <Select
                            value={newLocation.state}
                            onValueChange={(v) => setNewLocation(prev => ({ ...prev, state: v, city: '' }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select state" />
                            </SelectTrigger>
                            <SelectContent>
                              {stateNames.map(state => (
                                <SelectItem key={state} value={state}>{state}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>City * (must be in coverage)</Label>
                          <Select
                            value={newLocation.city}
                            onValueChange={(v) => setNewLocation(prev => ({ ...prev, city: v }))}
                            disabled={!newLocation.state}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select city" />
                            </SelectTrigger>
                            <SelectContent>
                              {getCoveredCities()
                                .filter(city => {
                                  const coverage = distributor.operating_coverage?.find(c => c.city === city);
                                  return coverage && (!newLocation.state || coverage.state === newLocation.state);
                                })
                                .map(city => (
                                  <SelectItem key={city} value={city}>{city}</SelectItem>
                                ))
                              }
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Address Line 1</Label>
                        <Input
                          placeholder="Street address"
                          value={newLocation.address_line_1}
                          onChange={(e) => setNewLocation(prev => ({ ...prev, address_line_1: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Address Line 2</Label>
                        <Input
                          placeholder="Area, Landmark"
                          value={newLocation.address_line_2}
                          onChange={(e) => setNewLocation(prev => ({ ...prev, address_line_2: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Pincode</Label>
                        <Input
                          placeholder="560001"
                          value={newLocation.pincode}
                          onChange={(e) => setNewLocation(prev => ({ ...prev, pincode: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Contact Person</Label>
                          <Input
                            placeholder="Contact name"
                            value={newLocation.contact_person}
                            onChange={(e) => setNewLocation(prev => ({ ...prev, contact_person: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Contact Number</Label>
                          <Input
                            placeholder="+91 9876543210"
                            value={newLocation.contact_number}
                            onChange={(e) => setNewLocation(prev => ({ ...prev, contact_number: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          placeholder="warehouse@example.com"
                          value={newLocation.email}
                          onChange={(e) => setNewLocation(prev => ({ ...prev, email: e.target.value }))}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="is_default"
                          checked={newLocation.is_default}
                          onCheckedChange={(checked) => setNewLocation(prev => ({ ...prev, is_default: checked }))}
                        />
                        <label htmlFor="is_default" className="text-sm">Set as default location</label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowLocationDialog(false)}>Cancel</Button>
                      <Button onClick={handleAddLocation} disabled={addingLocation}>
                        {addingLocation ? 'Adding...' : 'Add Location'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {distributor.locations?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No locations defined</p>
                  <p className="text-sm">Add warehouse or stocking locations for this distributor</p>
                  {(distributor.operating_coverage?.length || 0) === 0 && (
                    <p className="text-sm text-amber-600 mt-2">Note: Add operating coverage first before adding locations</p>
                  )}
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {distributor.locations?.map((location) => (
                    <Card key={location.id} className={location.is_default ? 'border-primary' : ''}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{location.location_name}</h4>
                              <Badge variant="outline">{location.location_code}</Badge>
                              {location.is_default && <Badge className="bg-primary">Default</Badge>}
                            </div>
                            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                              {location.address_line_1 && <p>{location.address_line_1}</p>}
                              {location.address_line_2 && <p>{location.address_line_2}</p>}
                              <p className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {location.city}, {location.state} {location.pincode}
                              </p>
                              {location.contact_person && (
                                <p className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {location.contact_person}
                                </p>
                              )}
                              {location.contact_number && (
                                <p className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {location.contact_number}
                                </p>
                              )}
                            </div>
                          </div>
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setDeleteTarget({ type: 'location', id: location.id, name: location.location_name })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Margin Matrix Tab - Grid Based */}
        <TabsContent value="margins">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Margin Matrix</CardTitle>
                  <CardDescription>Edit margins for each SKU by city. Changes are saved when you click "Save All".</CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* City Selector */}
                  <Select value={selectedMarginCity} onValueChange={setSelectedMarginCity}>
                    <SelectTrigger className="w-[180px]" data-testid="margin-city-select">
                      <SelectValue placeholder="Select City" />
                    </SelectTrigger>
                    <SelectContent>
                      {getCoveredCities().map(city => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {canManage && selectedMarginCity && margins.length > 0 && (
                    <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
                      <DialogTrigger asChild>
                        <Button variant="outline" data-testid="copy-margins-btn">
                          <FileText className="h-4 w-4 mr-2" />
                          Copy to City
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Copy Margins to Another City</DialogTitle>
                          <DialogDescription>
                            Copy all {margins.length} margin entries from <strong>{selectedMarginCity}</strong> to another city.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <Label>Target City</Label>
                          <Select value={copyTargetCity} onValueChange={setCopyTargetCity}>
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Select target city" />
                            </SelectTrigger>
                            <SelectContent>
                              {getCoveredCities()
                                .filter(city => city !== selectedMarginCity)
                                .map(city => (
                                  <SelectItem key={city} value={city}>{city}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <p className="text-sm text-muted-foreground mt-2">
                            Existing margins in the target city will not be overwritten.
                          </p>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShowCopyDialog(false)}>Cancel</Button>
                          <Button onClick={copyMarginsToCity} disabled={copying || !copyTargetCity}>
                            {copying ? 'Copying...' : `Copy to ${copyTargetCity || '...'}`}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                  
                  {canManage && hasMarginChanges && (
                    <Button onClick={saveAllMargins} disabled={savingMargins} data-testid="save-margins-btn">
                      <Save className="h-4 w-4 mr-2" />
                      {savingMargins ? 'Saving...' : 'Save All'}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!selectedMarginCity ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a city to view and edit margins</p>
                  {(distributor.operating_coverage?.length || 0) === 0 && (
                    <p className="text-sm text-amber-600 mt-2">Note: Add operating coverage first before adding margins</p>
                  )}
                </div>
              ) : marginsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : skus.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No SKUs found in the system</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium sticky left-0 bg-muted/50 min-w-[200px]">SKU</th>
                        <th className="text-center p-3 font-medium min-w-[150px]">Margin Type</th>
                        <th className="text-center p-3 font-medium min-w-[120px]">Value</th>
                        <th className="text-center p-3 font-medium min-w-[100px]">Min Qty</th>
                        <th className="text-center p-3 font-medium min-w-[100px]">Max Qty</th>
                        <th className="text-center p-3 font-medium min-w-[80px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skus.map((sku, index) => {
                        const gridEntry = marginGrid[sku.id] || {};
                        const hasValue = gridEntry.margin_value && gridEntry.margin_value > 0;
                        return (
                          <tr 
                            key={sku.id} 
                            className={`border-b hover:bg-muted/20 ${hasValue ? 'bg-green-50/50' : ''}`}
                            data-testid={`margin-row-${index}`}
                          >
                            <td className="p-2 font-medium sticky left-0 bg-background">
                              <div className="flex items-center gap-2">
                                {hasValue && <Check className="h-4 w-4 text-green-600" />}
                                <span className="text-sm">{sku.name || sku.sku_name}</span>
                              </div>
                            </td>
                            <td className="p-2">
                              <Select
                                value={gridEntry.margin_type || 'percentage'}
                                onValueChange={(v) => updateMarginGridValue(sku.id, 'margin_type', v)}
                                disabled={!canManage}
                              >
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {MARGIN_TYPES.map(mt => (
                                    <SelectItem key={mt.value} value={mt.value}>
                                      {mt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-2">
                              <div className="relative">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0"
                                  className="h-9 text-sm pr-8 text-right"
                                  value={gridEntry.margin_value || ''}
                                  onChange={(e) => updateMarginGridValue(sku.id, 'margin_value', e.target.value)}
                                  disabled={!canManage}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                  {(gridEntry.margin_type || 'percentage') === 'percentage' ? '%' : '₹'}
                                </span>
                              </div>
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                placeholder="-"
                                className="h-9 text-sm text-center"
                                value={gridEntry.min_quantity || ''}
                                onChange={(e) => updateMarginGridValue(sku.id, 'min_quantity', e.target.value)}
                                disabled={!canManage}
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                placeholder="-"
                                className="h-9 text-sm text-center"
                                value={gridEntry.max_quantity || ''}
                                onChange={(e) => updateMarginGridValue(sku.id, 'max_quantity', e.target.value)}
                                disabled={!canManage}
                              />
                            </td>
                            <td className="p-2 text-center">
                              {gridEntry.id && canManage && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive h-8 w-8 p-0"
                                  onClick={() => setDeleteTarget({ 
                                    type: 'margin', 
                                    id: gridEntry.id, 
                                    name: `${selectedMarginCity} - ${sku.name || sku.sku_name}` 
                                  })}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {/* Summary */}
                  <div className="mt-4 p-3 bg-muted/30 rounded-lg flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      <strong>{margins.length}</strong> SKUs with margins configured for <strong>{selectedMarginCity}</strong>
                    </div>
                    {hasMarginChanges && (
                      <Badge variant="outline" className="text-amber-600 border-amber-600">
                        Unsaved changes
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Assignments Tab */}
        <TabsContent value="assignments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Account Assignments</CardTitle>
                <CardDescription>Accounts assigned to this distributor for servicing</CardDescription>
              </div>
              {canManage && (
                <Dialog open={showAssignDialog} onOpenChange={(open) => {
                  setShowAssignDialog(open);
                  if (!open) {
                    setSelectedAccount(null);
                    setAccountSearch('');
                    setSearchResults([]);
                    setAssignmentForm({
                      servicing_city: '',
                      distributor_location_id: '',
                      is_primary: true,
                      is_backup: false,
                      has_special_override: false,
                      override_type: '',
                      override_value: '',
                      remarks: ''
                    });
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button data-testid="assign-account-btn">
                      <Plus className="h-4 w-4 mr-2" />
                      Assign Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Assign Account to Distributor</DialogTitle>
                      <DialogDescription>
                        Search and select an account to assign to {distributor.distributor_name}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                      {/* Account Search */}
                      <div className="space-y-2">
                        <Label>Search Account *</Label>
                        {selectedAccount ? (
                          <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                            <div>
                              <p className="font-medium">{selectedAccount.company || selectedAccount.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {selectedAccount.city}, {selectedAccount.state}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedAccount(null);
                                setAccountSearch('');
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Input
                              placeholder="Type account name to search..."
                              value={accountSearch}
                              onChange={(e) => setAccountSearch(e.target.value)}
                              data-testid="account-search-input"
                            />
                            {searching && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Searching...
                              </div>
                            )}
                            {searchResults.length > 0 && (
                              <div className="border rounded-md max-h-48 overflow-y-auto">
                                {searchResults.map((account) => (
                                  <div
                                    key={account.id}
                                    className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                                    onClick={() => {
                                      setSelectedAccount(account);
                                      setSearchResults([]);
                                      setAccountSearch('');
                                    }}
                                    data-testid={`account-result-${account.id}`}
                                  >
                                    <p className="font-medium">{account.company || account.name}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {account.city}, {account.state} {account.account_id && `• ${account.account_id}`}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {accountSearch.length >= 2 && searchResults.length === 0 && !searching && (
                              <p className="text-sm text-muted-foreground">No accounts found</p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Servicing City */}
                      <div className="space-y-2">
                        <Label>Servicing City *</Label>
                        <Select
                          value={assignmentForm.servicing_city}
                          onValueChange={(v) => setAssignmentForm(prev => ({ ...prev, servicing_city: v }))}
                        >
                          <SelectTrigger data-testid="servicing-city-select">
                            <SelectValue placeholder="Select servicing city" />
                          </SelectTrigger>
                          <SelectContent>
                            {getCoveredCities().map(city => (
                              <SelectItem key={city} value={city}>{city}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          City must be in distributor's operating coverage
                        </p>
                      </div>

                      {/* Distributor Location */}
                      <div className="space-y-2">
                        <Label>Distributor Location (Warehouse)</Label>
                        <Select
                          value={assignmentForm.distributor_location_id || 'none'}
                          onValueChange={(v) => setAssignmentForm(prev => ({ ...prev, distributor_location_id: v === 'none' ? '' : v }))}
                        >
                          <SelectTrigger data-testid="location-select">
                            <SelectValue placeholder="Select location (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">-- No specific location --</SelectItem>
                            {(distributor.locations || [])
                              .filter(loc => loc.status === 'active')
                              .map(loc => (
                                <SelectItem key={loc.id} value={loc.id}>
                                  {loc.location_name} ({loc.city})
                                  {loc.is_default && ' ★'}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Assignment Type */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="is_primary"
                            checked={assignmentForm.is_primary}
                            onCheckedChange={(checked) => setAssignmentForm(prev => ({
                              ...prev,
                              is_primary: checked,
                              is_backup: checked ? false : prev.is_backup
                            }))}
                          />
                          <label htmlFor="is_primary" className="text-sm font-medium cursor-pointer">
                            Primary Distributor
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="is_backup"
                            checked={assignmentForm.is_backup}
                            onCheckedChange={(checked) => setAssignmentForm(prev => ({
                              ...prev,
                              is_backup: checked,
                              is_primary: checked ? false : prev.is_primary
                            }))}
                          />
                          <label htmlFor="is_backup" className="text-sm font-medium cursor-pointer">
                            Backup Distributor
                          </label>
                        </div>
                      </div>

                      {/* Special Override */}
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="has_special_override"
                            checked={assignmentForm.has_special_override}
                            onCheckedChange={(checked) => setAssignmentForm(prev => ({
                              ...prev,
                              has_special_override: checked,
                              override_type: checked ? prev.override_type : '',
                              override_value: checked ? prev.override_value : ''
                            }))}
                          />
                          <label htmlFor="has_special_override" className="text-sm font-medium cursor-pointer">
                            Special Margin Override
                          </label>
                        </div>
                        
                        {assignmentForm.has_special_override && (
                          <div className="grid grid-cols-2 gap-4 pl-6">
                            <div className="space-y-2">
                              <Label>Override Type</Label>
                              <Select
                                value={assignmentForm.override_type}
                                onValueChange={(v) => setAssignmentForm(prev => ({ ...prev, override_type: v }))}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {MARGIN_TYPES.map(mt => (
                                    <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Override Value</Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0"
                                value={assignmentForm.override_value}
                                onChange={(e) => setAssignmentForm(prev => ({ ...prev, override_value: e.target.value }))}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Remarks */}
                      <div className="space-y-2">
                        <Label>Remarks</Label>
                        <Textarea
                          placeholder="Add any notes about this assignment..."
                          value={assignmentForm.remarks}
                          onChange={(e) => setAssignmentForm(prev => ({ ...prev, remarks: e.target.value }))}
                          rows={2}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
                      <Button
                        onClick={handleCreateAssignment}
                        disabled={savingAssignment || !selectedAccount || !assignmentForm.servicing_city}
                        data-testid="save-assignment-btn"
                      >
                        {savingAssignment ? 'Assigning...' : 'Assign Account'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {assignmentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : assignments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No accounts assigned</p>
                  <p className="text-sm">Assign accounts to this distributor for servicing</p>
                  {(distributor.operating_coverage?.length || 0) === 0 && (
                    <p className="text-sm text-amber-600 mt-2">Note: Add operating coverage first before assigning accounts</p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="assignments-table">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Account</th>
                        <th className="text-left p-3 font-medium">Servicing City</th>
                        <th className="text-left p-3 font-medium">Location</th>
                        <th className="text-center p-3 font-medium">Type</th>
                        <th className="text-center p-3 font-medium">Override</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((assignment) => (
                        <tr key={assignment.id} className="border-b hover:bg-muted/30" data-testid={`assignment-row-${assignment.id}`}>
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{assignment.account_name}</p>
                              <p className="text-sm text-muted-foreground">{assignment.servicing_state}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              {assignment.servicing_city}
                            </div>
                          </td>
                          <td className="p-3">
                            {assignment.distributor_location_name || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {assignment.is_primary && (
                              <Badge className="bg-blue-100 text-blue-800">Primary</Badge>
                            )}
                            {assignment.is_backup && (
                              <Badge className="bg-orange-100 text-orange-800">Backup</Badge>
                            )}
                            {!assignment.is_primary && !assignment.is_backup && (
                              <Badge variant="outline">Standard</Badge>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {assignment.has_special_override ? (
                              <Badge className="bg-purple-100 text-purple-800">
                                {formatMarginValue(assignment.override_type, assignment.override_value)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {getStatusBadge(assignment.status)}
                          </td>
                          <td className="p-3 text-right">
                            {canManage && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => setDeleteTarget({
                                  type: 'assignment',
                                  id: assignment.id,
                                  name: assignment.account_name
                                })}
                                data-testid={`delete-assignment-${assignment.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{deleteTarget?.name}" from this distributor.
              {deleteTarget?.type === 'location' && ' Any associated data may be affected.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              disabled={deleting}
              onClick={() => {
                if (deleteTarget?.type === 'coverage') {
                  handleDeleteCoverage(deleteTarget.id);
                } else if (deleteTarget?.type === 'location') {
                  handleDeleteLocation(deleteTarget.id);
                } else if (deleteTarget?.type === 'margin') {
                  handleDeleteMargin(deleteTarget.id);
                } else if (deleteTarget?.type === 'assignment') {
                  handleDeleteAssignment(deleteTarget.id);
                }
              }}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
