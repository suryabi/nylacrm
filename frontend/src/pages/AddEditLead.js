import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { leadsAPI, usersAPI } from '../utils/api';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Card } from '../components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useMasterLocations } from '../hooks/useMasterLocations';
import { useLeadStatuses } from '../hooks/useLeadStatuses';
import { useBusinessCategories } from '../hooks/useBusinessCategories';
import AppBreadcrumb from '../components/AppBreadcrumb';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const SKUS = ['660 ml / Silver / Nyla', '660 ml / Gold / Nyla', '330 ml / Silver / Nyla', '330 ml / Gold / Nyla', '660 ml / Sparkling', '300 ml / Sparkling', '24 Brand / 660 ml'];

const LEAD_SOURCES = [
  'Website',
  'LinkedIn',
  'Through Contacts',
  'Customer Referral',
  'Cold Call',
  'Internet',
  'Lead Discovery',
  'Other'
];

export default function AddEditLead() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { navigateTo, updateCurrentLabel } = useNavigation();
  const { user } = useAuth();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const { statuses } = useLeadStatuses();
  
  // Business categories from API
  const { categories: businessCategories } = useBusinessCategories();
  
  // Master locations from API
  const { 
    territories: masterTerritories, 
    getStateNamesByTerritoryName, 
    getCityNamesByStateName 
  } = useMasterLocations();
  
  // Map user territory to valid region values
  const getInitialRegion = () => {
    // Check if user territory matches any master territory
    if (user?.territory && masterTerritories.length > 0) {
      const matchingTerritory = masterTerritories.find(t => t.name === user.territory);
      if (matchingTerritory) return user.territory;
    }
    return ''; // User must select if territory doesn't match
  };

  const [formData, setFormData] = useState({
    company: '',
    contact_person: '',
    email: '',
    phone: '',
    category: '',
    city: '',
    state: '',
    country: 'India',
    region: '',
    status: 'new',
    source: '',
    assigned_to: '',
    priority: 'medium',
    current_water_brand: '',
    current_landing_price: '',
    current_volume: '',
    current_selling_price: '',
    interested_skus: [],
    notes: ''
  });
  
  // Set initial region when user or masterTerritories change
  useEffect(() => {
    if (!isEdit && masterTerritories.length > 0 && !formData.region) {
      const initialRegion = getInitialRegion();
      if (initialRegion) {
        setFormData(prev => ({ ...prev, region: initialRegion }));
      }
    }
  }, [user, masterTerritories]);

  useEffect(() => {
    fetchUsers();
  }, []);
  
  // Fetch lead after users are loaded (for edit mode)
  useEffect(() => {
    if (isEdit && users.length > 0) {
      fetchLead();
    }
  }, [isEdit, users.length]);

  const fetchUsers = async () => {
    try {
      const response = await usersAPI.getAll();
      setUsers(response.data);
    } catch (error) {
      toast.error('Failed to load users');
    }
  };

  const fetchLead = async () => {
    try {
      const response = await leadsAPI.getById(id);
      const lead = response.data;
      
      setFormData({
        company: lead.company || '',
        contact_person: lead.contact_person || '',
        email: lead.email || '',
        phone: lead.phone || '',
        category: lead.category || '',
        city: lead.city || '',
        state: lead.state || '',
        country: lead.country || 'India',
        region: lead.region || '',
        status: lead.status || 'new',
        source: lead.source || '',
        assigned_to: lead.assigned_to || '',
        priority: lead.priority || 'medium',
        current_water_brand: lead.current_water_brand || '',
        current_landing_price: lead.current_landing_price || '',
        current_volume: lead.current_volume || '',
        current_selling_price: lead.current_selling_price || '',
        interested_skus: lead.interested_skus || [],
        notes: lead.notes || ''
      });
    } catch (error) {
      toast.error('Failed to load lead');
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleSKU = (sku) => {
    const currentSkus = formData.interested_skus || [];
    if (currentSkus.includes(sku)) {
      updateField('interested_skus', currentSkus.filter(s => s !== sku));
    } else {
      updateField('interested_skus', [...currentSkus, sku]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate required fields before submission
    const requiredFields = [
      { field: 'company', label: 'Company Name' },
      { field: 'region', label: 'Region' },
      { field: 'state', label: 'State' },
      { field: 'city', label: 'City' }
    ];
    
    for (const { field, label } of requiredFields) {
      if (!formData[field] || formData[field].trim() === '') {
        toast.error(`${label} is required`);
        return;
      }
    }
    
    setLoading(true);
    try {
      const submitData = {
        ...formData,
        // Convert empty strings to null for optional fields
        contact_person: formData.contact_person || null,
        email: formData.email || null,
        phone: formData.phone || null,
        source: formData.source || null,
        category: formData.category || null,
        current_water_brand: formData.current_water_brand || null,
        current_volume: formData.current_volume || null,
        current_landing_price: formData.current_landing_price ? parseFloat(formData.current_landing_price) : null,
        current_selling_price: formData.current_selling_price ? parseFloat(formData.current_selling_price) : null,
        name: formData.contact_person || formData.company
      };
      
      if (isEdit) {
        await leadsAPI.update(id, submitData);
        toast.success('Lead updated successfully');
      } else {
        await leadsAPI.create(submitData);
        toast.success('Lead created successfully');
      }
      navigateTo('/leads', { fromSidebar: true });
    } catch (error) {
      console.error('Save error:', error);
      console.error('Error response:', error.response?.data);
      
      let errorMsg = 'Failed to save lead';
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMsg = error.response.data.detail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join(', ');
        } else {
          errorMsg = error.response.data.detail;
        }
      }
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Get states based on selected region from master locations
  const regionStates = formData.region 
    ? getStateNamesByTerritoryName(formData.region) 
    : [];
  
  // Add current state if not in list (for edit mode compatibility)
  // This ensures the dropdown shows the value even if master locations haven't loaded
  const availableStates = [...regionStates];
  if (formData.state && !availableStates.includes(formData.state)) {
    availableStates.push(formData.state);
  }

  // Get cities based on selected state from master locations
  const stateCities = formData.state 
    ? getCityNamesByStateName(formData.state) 
    : [];
  
  // Add current city if not in list (for edit mode compatibility)
  // This ensures the dropdown shows the value even if master locations haven't loaded
  const availableCities = [...stateCities];
  if (formData.city && !availableCities.includes(formData.city)) {
    availableCities.push(formData.city);
  }
  
  // Get territory options - include current region if not in master territories
  const territoryOptions = [...masterTerritories];
  if (formData.region && !territoryOptions.find(t => t.name === formData.region)) {
    territoryOptions.push({ id: formData.region, name: formData.region });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="add-edit-lead-page">
      {/* Breadcrumb */}
      <AppBreadcrumb currentLabel={isEdit ? 'Edit Lead' : 'New Lead'} />
      
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigateTo('/leads', { fromSidebar: true })} data-testid="back-button">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-semibold">{isEdit ? 'Edit Lead' : 'Add New Lead'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Company & Contact Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="company">Company Name *</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => updateField('company', e.target.value)}
                required
                data-testid="lead-company-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Business Category *</Label>
              <Select value={formData.category} onValueChange={(v) => updateField('category', v)} required>
                <SelectTrigger data-testid="lead-category-select">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {businessCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) => updateField('contact_person', e.target.value)}
                data-testid="lead-contact-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="+91"
                data-testid="lead-phone-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Contact Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                data-testid="lead-email-input"
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Location</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Country *</Label>
              <Input value="India" disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region *</Label>
              <Select 
                key={`region-${formData.region}`}
                value={formData.region || undefined}
                onValueChange={(v) => {
                  // Reset state and city when region changes
                  setFormData(prev => ({ ...prev, region: v, state: '', city: '' }));
                }} 
                required
              >
                <SelectTrigger data-testid="lead-region-select">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {territoryOptions.map(territory => (
                    <SelectItem key={territory.id} value={territory.name}>{territory.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Select 
                key={`state-${formData.state}-${formData.region}`}
                value={formData.state || undefined}
                onValueChange={(v) => {
                  // Reset city when state changes
                  setFormData(prev => ({ ...prev, state: v, city: '' }));
                }} 
                disabled={!formData.region}
                required
              >
                <SelectTrigger data-testid="lead-state-select">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {availableStates.map(state => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Select 
                key={`city-${formData.city}-${formData.state}`}
                value={formData.city || undefined}
                onValueChange={(v) => updateField('city', v)}
                disabled={!formData.state}
                required
              >
                <SelectTrigger data-testid="lead-city-select">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  {availableCities.map(city => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Lead Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(v) => updateField('status', v)}>
                <SelectTrigger data-testid="lead-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map(status => (
                    <SelectItem key={status.id} value={status.id}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Select value={formData.source} onValueChange={(v) => updateField('source', v)}>
                <SelectTrigger data-testid="lead-source-select">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map(source => (
                    <SelectItem key={source} value={source}>{source}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_to">Assign To</Label>
              <Select value={formData.assigned_to} onValueChange={(v) => updateField('assigned_to', v)}>
                <SelectTrigger data-testid="lead-assign-select">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter(u => u.is_active || u.id === formData.assigned_to)
                    .map(usr => (
                      <SelectItem key={usr.id} value={usr.id}>
                        {usr.name}{!usr.is_active ? ' (Inactive)' : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={formData.priority} onValueChange={(v) => updateField('priority', v)}>
                <SelectTrigger data-testid="lead-priority-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Current Brand Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="current_water_brand">Current Water Brand</Label>
              <Input
                id="current_water_brand"
                placeholder="e.g., Bisleri, Kinley"
                value={formData.current_water_brand}
                onChange={(e) => updateField('current_water_brand', e.target.value)}
                data-testid="current-brand-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="current_volume">Current Volume</Label>
              <Input
                id="current_volume"
                placeholder="e.g., 1000 bottles/month"
                value={formData.current_volume}
                onChange={(e) => updateField('current_volume', e.target.value)}
                data-testid="current-volume-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="current_landing_price">Current Landing Price (₹)</Label>
              <Input
                id="current_landing_price"
                type="number"
                placeholder="15"
                value={formData.current_landing_price}
                onChange={(e) => updateField('current_landing_price', e.target.value)}
                data-testid="current-landing-price-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="current_selling_price">Current Selling Price (₹)</Label>
              <Input
                id="current_selling_price"
                type="number"
                placeholder="20"
                value={formData.current_selling_price}
                onChange={(e) => updateField('current_selling_price', e.target.value)}
                data-testid="current-selling-price-input"
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Notes</h2>
          <Textarea
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            rows={4}
            placeholder="Add any additional notes about this lead..."
            data-testid="lead-notes-input"
          />
        </Card>

        <div className="flex gap-4">
          <Button type="submit" disabled={loading} data-testid="save-lead-button">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : (isEdit ? 'Update Lead' : 'Create Lead')}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigateTo('/leads', { fromSidebar: true })} data-testid="cancel-button">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
