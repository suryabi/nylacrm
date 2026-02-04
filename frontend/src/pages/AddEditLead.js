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

const LOCATIONS = {
  'North India': {
    cities: ['Delhi NCR', 'Chandigarh', 'Jaipur', 'Lucknow', 'Agra', 'Amritsar', 'Dehradun'],
    states: ['Delhi', 'Punjab', 'Haryana', 'Rajasthan', 'Uttar Pradesh', 'Uttarakhand', 'Himachal Pradesh', 'Jammu & Kashmir']
  },
  'South India': {
    cities: ['Bangalore', 'Hyderabad', 'Chennai', 'Kochi', 'Coimbatore', 'Visakhapatnam', 'Mysore'],
    states: ['Karnataka', 'Telangana', 'Andhra Pradesh', 'Tamil Nadu', 'Kerala', 'Puducherry']
  },
  'West India': {
    cities: ['Mumbai', 'Pune', 'Goa', 'Ahmedabad', 'Surat', 'Nagpur', 'Indore', 'Nashik'],
    states: ['Maharashtra', 'Gujarat', 'Goa', 'Madhya Pradesh', 'Daman & Diu', 'Dadra & Nagar Haveli']
  },
  'East India': {
    cities: ['Kolkata', 'Bhubaneswar', 'Patna', 'Ranchi', 'Siliguri'],
    states: ['West Bengal', 'Odisha', 'Bihar', 'Jharkhand', 'Assam', 'Sikkim', 'Arunachal Pradesh', 'Nagaland', 'Manipur', 'Mizoram', 'Tripura', 'Meghalaya']
  },
  'Central India': {
    cities: ['Bhopal', 'Raipur', 'Indore'],
    states: ['Madhya Pradesh', 'Chhattisgarh']
  }
};

const PRIORITY_STATES = [
  'Telangana',
  'Tamil Nadu',
  'Delhi',
  'Maharashtra',
  'Punjab',
  'Jammu & Kashmir',
  'Karnataka'
];

const ALL_INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Kerala',
  'Madhya Pradesh',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Rajasthan',
  'Sikkim',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman & Nicobar Islands',
  'Chandigarh',
  'Dadra & Nagar Haveli',
  'Daman & Diu',
  'Lakshadweep',
  'Puducherry'
];

const OTHER_STATES = ALL_INDIAN_STATES.filter(state => !PRIORITY_STATES.includes(state));

const SKUS = ['24 Brand', '660 ml Silver', '660 ml Gold', '330 ml Silver', '330 ml Gold', '660 Sparkling', '330 Sparkling'];

export default function AddEditLead() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({
    company: '',
    contact_person: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    country: 'India',
    region: user?.territory || '',
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
    fetchUsers();
    if (isEdit) {
      fetchLead();
    }
  }, []);

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
    setLoading(true);
    try {
      const submitData = {
        ...formData,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : null,
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
      navigate('/leads');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save lead');
    } finally {
      setLoading(false);
    }
  };

  const regionCities = LOCATIONS[formData.region]?.cities || [];
  const regionStates = LOCATIONS[formData.region]?.states || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6" data-testid="add-edit-lead-page">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/leads')} data-testid="back-button">
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
            <div className="space-y-2 md:col-span-2">
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
              <Select value={formData.region} onValueChange={(v) => updateField('region', v)} required>
                <SelectTrigger data-testid="lead-region-select">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="North India">North India</SelectItem>
                  <SelectItem value="South India">South India</SelectItem>
                  <SelectItem value="West India">West India</SelectItem>
                  <SelectItem value="East India">East India</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Select value={formData.city} onValueChange={(v) => updateField('city', v)} disabled={!formData.region} required>
                <SelectTrigger data-testid="lead-city-select">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  {regionCities.map(city => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Select value={formData.state} onValueChange={(v) => updateField('state', v)} required>
                <SelectTrigger data-testid="lead-state-select">
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {regionStates.map(state => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
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
                placeholder="Website, Referral, Cold Call"
                value={formData.source}
                onChange={(e) => updateField('source', e.target.value)}
                data-testid="lead-source-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned_to">Assign To</Label>
              <Select value={formData.assigned_to} onValueChange={(v) => updateField('assigned_to', v)}>
                <SelectTrigger data-testid="lead-assign-select">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => ['sales_manager', 'sales_rep'].includes(u.role)).map(usr => (
                    <SelectItem key={usr.id} value={usr.id}>{usr.name}</SelectItem>
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
          <h2 className="text-lg font-semibold mb-4">Nyla Details</h2>
          <div className="space-y-4">
            <div className="space-y-3">
              <Label>Which SKUs is the customer interested in?</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SKUS.map((sku) => {
                  const isChecked = (formData.interested_skus || []).includes(sku);
                  return (
                    <div key={sku} className="flex items-center space-x-2">
                      <Checkbox
                        id={`sku-${sku}`}
                        checked={isChecked}
                        onCheckedChange={() => toggleSKU(sku)}
                        data-testid={`sku-checkbox-${sku}`}
                      />
                      <label htmlFor={`sku-${sku}`} className="text-sm font-medium cursor-pointer">
                        {sku}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimated_value">Estimated Deal Value (₹)</Label>
              <Input
                id="estimated_value"
                type="number"
                placeholder="500000"
                value={formData.estimated_value}
                onChange={(e) => updateField('estimated_value', e.target.value)}
                data-testid="lead-value-input"
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
          <Button type="button" variant="outline" onClick={() => navigate('/leads')} data-testid="cancel-button">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
