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
  User, FileText, Check, X, Save
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
