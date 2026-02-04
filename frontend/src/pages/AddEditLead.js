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

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function AddEditLead() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [locationConfig, setLocationConfig] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [availableCities, setAvailableCities] = useState([]);
  
  const [formData, setFormData] = useState({
    company: '',
    contact_person: '',
    email: '',
    phone: '',
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
    notes: '',
    estimated_value: ''
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (isEdit && id) {
      fetchLead();
    }
  }, [id, isEdit]);

  useEffect(() => {
    // Update cities when region changes
    if (locationConfig && selectedRegion) {
      const region = locationConfig.regions.find(r => r.name === selectedRegion);
      setAvailableCities(region?.cities || []);
      
      // Auto-set state to first state in region
      if (region?.states?.length > 0 && !formData.state) {
        setFormData(prev => ({ ...prev, state: region.states[0] }));
      }
    }
  }, [selectedRegion, locationConfig]);

  const fetchInitialData = async () => {
    try {
      const [usersRes, configRes] = await Promise.all([
        usersAPI.getAll(),
        axios.get(`${API_URL}/config/locations`)
      ]);
      setUsers(usersRes.data);
      setLocationConfig(configRes.data);
      
      // Default region to user's territory if available
      if (user?.territory && !formData.region) {
        setSelectedRegion(user.territory);
        setFormData(prev => ({ ...prev, region: user.territory }));
      }
    } catch (error) {
      toast.error('Failed to load configuration');
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
        notes: lead.notes || '',
        estimated_value: lead.estimated_value || ''
      });
      setSelectedRegion(lead.region || '');
    } catch (error) {
      toast.error('Failed to load lead');
    }
  };

  const handleRegionChange = (value) => {
    setSelectedRegion(value);
    setFormData({ ...formData, region: value, city: '', state: '' });
  };

  const handleCityChange = (value) => {
    setFormData({ ...formData, city: value });
    // Auto-set state based on city
    if (locationConfig) {
      const region = locationConfig.regions.find(r => r.name === selectedRegion);
      if (region?.states?.length > 0) {
        setFormData(prev => ({ ...prev, city: value, state: region.states[0] }));
      }
    }
  };

  const toggleSKU = (sku) => {
    const skus = formData.interested_skus || [];
    if (skus.includes(sku)) {
      setFormData({ ...formData, interested_skus: skus.filter(s => s !== sku) });
    } else {
      setFormData({ ...formData, interested_skus: [...skus, sku] });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        ...formData,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : null,
        current_landing_price: formData.current_landing_price ? parseFloat(formData.current_landing_price) : null,
        current_selling_price: formData.current_selling_price ? parseFloat(formData.current_selling_price) : null,
        name: formData.contact_person || formData.company  // For backward compatibility
      };
      
      if (isEdit) {
        await leadsAPI.update(id, data);
        toast.success('Lead updated successfully');
      } else {
        await leadsAPI.create(data);
        toast.success('Lead created successfully');
      }
      navigate('/leads');
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to ${isEdit ? 'update' : 'create'} lead`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="add-edit-lead-page">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/leads')} data-testid="back-button">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-semibold">{isEdit ? 'Edit Lead' : 'Add New Lead'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company & Contact Details */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Company & Contact Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="company">Company Name *</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => setFormData({...formData, company: e.target.value})}
                required
                data-testid="lead-company-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) => setFormData({...formData, contact_person: e.target.value})}
                data-testid="lead-contact-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                placeholder="+91"
                data-testid="lead-phone-input"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="email">Contact Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                data-testid="lead-email-input"
              />
            </div>
          </div>
        </Card>

        {/* Location */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Location</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Country *</Label>
              <Input value="India" disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region *</Label>
              <Select value={selectedRegion} onValueChange={handleRegionChange} required>
                <SelectTrigger data-testid="lead-region-select">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {locationConfig?.regions.map(region => (
                    <SelectItem key={region.name} value={region.name}>{region.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Select 
                value={formData.city} 
                onValueChange={handleCityChange}
                disabled={!selectedRegion}
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
            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Select value={formData.state} onValueChange={(value) => setFormData({...formData, state: value})}>
                <SelectTrigger data-testid="lead-state-select">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {locationConfig?.regions.find(r => r.name === selectedRegion)?.states.map(state => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Lead Information */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Lead Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
                <SelectTrigger data-testid="lead-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="proposal">Proposal</SelectItem>
                  <SelectItem value="closed_won">Closed Won</SelectItem>
                  <SelectItem value="closed_lost">Closed Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
                placeholder="e.g., Website, Referral, Cold Call"
                value={formData.source}
                onChange={(e) => setFormData({...formData, source: e.target.value})}
                data-testid="lead-source-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_to">Assign To</Label>
              <Select value={formData.assigned_to} onValueChange={(value) => setFormData({...formData, assigned_to: value})}>
                <SelectTrigger data-testid="lead-assign-select">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => ['sales_manager', 'sales_rep'].includes(u.role)).map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.territory})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={formData.priority} onValueChange={(value) => setFormData({...formData, priority: value})}>
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

        {/* Current Brand Details */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Current Brand Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="current_water_brand">Current Water Brand</Label>
              <Input
                id="current_water_brand"
                placeholder="e.g., Bisleri, Kinley"
                value={formData.current_water_brand}
                onChange={(e) => setFormData({...formData, current_water_brand: e.target.value})}
                data-testid="current-brand-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="current_volume">Current Volume</Label>
              <Input
                id="current_volume"
                placeholder="e.g., 1000 bottles/month"
                value={formData.current_volume}
                onChange={(e) => setFormData({...formData, current_volume: e.target.value})}
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
                onChange={(e) => setFormData({...formData, current_landing_price: e.target.value})}
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
                onChange={(e) => setFormData({...formData, current_selling_price: e.target.value})}
                data-testid="current-selling-price-input"
              />
            </div>
          </div>
        </Card>

        {/* Nyla Details */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Nyla Details</h2>
          <div className="space-y-4">
            <div className="space-y-3">
              <Label>Which SKUs is the customer interested in?</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {locationConfig?.skus.map((sku) => (
                  <div key={sku} className="flex items-center space-x-2">
                    <Checkbox
                      id={`sku-${sku}`}
                      checked={formData.interested_skus.includes(sku)}
                      onCheckedChange={() => toggleSKU(sku)}
                      data-testid={`sku-checkbox-${sku}`}
                    />
                    <label
                      htmlFor={`sku-${sku}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {sku}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimated_value">Estimated Deal Value (₹)</Label>
              <Input
                id="estimated_value"
                type="number"
                placeholder="500000"
                value={formData.estimated_value}
                onChange={(e) => setFormData({...formData, estimated_value: e.target.value})}
                data-testid="lead-value-input"
              />
            </div>
          </div>
        </Card>

        {/* Notes */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Notes</h2>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({...formData, notes: e.target.value})}
            rows={4}
            placeholder="Add any additional notes about this lead..."
            data-testid="lead-notes-input"
          />
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button type="submit" disabled={loading} data-testid="save-lead-button">
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
            ) : (
              isEdit ? 'Update Lead' : 'Create Lead'
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/leads')} data-testid="cancel-button">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
