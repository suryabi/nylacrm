import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenantConfig } from '../context/TenantConfigContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { 
  Palette, Settings, Puzzle, Save, Upload, Building2, 
  Globe, Clock, DollarSign, Calendar, RefreshCw, MapPin,
  Users, Kanban, Target, CalendarDays, Contact, Plane, Wallet, FolderOpen,
  Wrench, Boxes, ShieldCheck, Box, Landmark, Phone, Mail, FileText,
  Plus, Trash2, User, Shield
} from 'lucide-react';
import axios from 'axios';
import RoleManagement from '../components/RoleManagement';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Complete Module Configuration - All features that can be enabled/disabled
const MODULE_CONFIG = {
  core: {
    title: 'Core Modules',
    description: 'Essential CRM features',
    modules: [
      { key: 'home', label: 'Home', icon: Building2, description: 'Homepage & welcome screen' },
      { key: 'dashboard', label: 'Dashboard', icon: Kanban, description: 'Main dashboard view' },
      { key: 'leads', label: 'Leads', icon: Users, description: 'Lead management and tracking' },
      { key: 'pipeline', label: 'Pipeline', icon: Kanban, description: 'Visual sales pipeline (Kanban)' },
      { key: 'accounts', label: 'Accounts', icon: Building2, description: 'Customer account management' },
      { key: 'sales_portal', label: 'Sales Portal', icon: Building2, description: 'Sales portal & order management' },
      { key: 'contacts', label: 'Contacts', icon: Contact, description: 'Contact directory' },
    ]
  },
  reports: {
    title: 'Dashboard Reports',
    description: 'Analytics and reporting modules',
    modules: [
      { key: 'report_sales_overview', label: 'Sales Overview', icon: Kanban, description: 'Sales dashboard overview' },
      { key: 'report_revenue', label: 'Revenue Report', icon: DollarSign, description: 'Revenue analytics' },
      { key: 'report_sku_performance', label: 'SKU Performance', icon: Boxes, description: 'Product/SKU analysis' },
      { key: 'report_resource_performance', label: 'Resource Performance', icon: Users, description: 'Team performance metrics' },
      { key: 'report_account_performance', label: 'Account Performance', icon: Building2, description: 'Account-level analytics' },
    ]
  },
  sales_ops: {
    title: 'Lead & Sales Operations',
    description: 'Sales workflow and operations',
    modules: [
      { key: 'lead_discovery', label: 'Lead Discovery', icon: Users, description: 'Find & import new leads' },
      { key: 'target_planning', label: 'Target Planning', icon: Target, description: 'Sales target management' },
      { key: 'daily_status', label: 'Daily Status', icon: CalendarDays, description: 'Daily activity updates' },
      { key: 'status_summary', label: 'Status Summary', icon: Users, description: 'Team status aggregation' },
    ]
  },
  pricing: {
    title: 'Pricing & Logistics',
    description: 'Cost and logistics calculators',
    modules: [
      { key: 'cogs_calculator', label: 'COGS Calculator', icon: DollarSign, description: 'Cost of goods calculator' },
      { key: 'transport_calculator', label: 'Transport Calculator', icon: Plane, description: 'Logistics cost estimation' },
    ]
  },
  products: {
    title: 'Product & SKU',
    description: 'Product catalog management',
    modules: [
      { key: 'sku_management', label: 'SKU Management', icon: Boxes, description: 'Product catalog & SKUs' },
      { key: 'bottle_preview', label: 'Bottle Preview', icon: Boxes, description: 'Product visualization' },
    ]
  },
  documents: {
    title: 'Documents',
    description: 'Document & file management',
    modules: [
      { key: 'company_documents', label: 'Company Documents', icon: FileText, description: 'Policies & company docs' },
      { key: 'files_documents', label: 'Files & Documents', icon: FolderOpen, description: 'File storage & sharing' },
    ]
  },
  requests: {
    title: 'Request Management',
    description: 'Approval workflows',
    modules: [
      { key: 'leaves', label: 'Leave Requests', icon: CalendarDays, description: 'Leave application workflow' },
      { key: 'travel_requests', label: 'Travel Requests', icon: Plane, description: 'Travel approval workflow' },
      { key: 'budget_requests', label: 'Budget Requests', icon: Wallet, description: 'Budget approval workflow' },
      { key: 'expense_management', label: 'Expense Management', icon: DollarSign, description: 'Expense tracking & claims' },
    ]
  },
  collaboration: {
    title: 'Meetings & Tasks',
    description: 'Team collaboration tools',
    modules: [
      { key: 'meetings', label: 'Meetings', icon: Calendar, description: 'Meeting scheduling & Zoom' },
      { key: 'tasks', label: 'Tasks', icon: Calendar, description: 'Task assignment & tracking' },
    ]
  },
  organization: {
    title: 'Organization & Master Data',
    description: 'Company setup & configuration',
    modules: [
      { key: 'company_profile', label: 'Company Profile', icon: Building2, description: 'Company information display' },
      { key: 'team', label: 'Team Management', icon: Users, description: 'Team hierarchy & users' },
      { key: 'master_locations', label: 'Master Locations', icon: MapPin, description: 'Territory & location setup' },
      { key: 'lead_statuses', label: 'Lead Statuses', icon: Settings, description: 'Lead status configuration' },
      { key: 'business_categories', label: 'Business Categories', icon: Building2, description: 'Industry categorization' },
      { key: 'contact_categories', label: 'Contact Categories', icon: Contact, description: 'Contact type definitions' },
      { key: 'expense_categories', label: 'Expense Categories', icon: DollarSign, description: 'Expense type setup' },
    ]
  },
  production: {
    title: 'Production Modules (Beta)',
    description: 'Manufacturing & operations - Coming soon',
    modules: [
      { key: 'maintenance', label: 'Maintenance', icon: Wrench, description: 'Equipment maintenance tracking' },
      { key: 'inventory', label: 'Inventory', icon: Boxes, description: 'Inventory management' },
      { key: 'quality_control', label: 'Quality Control', icon: ShieldCheck, description: 'QC processes & checks' },
      { key: 'assets', label: 'Assets', icon: Box, description: 'Asset tracking & management' },
      { key: 'vendors', label: 'Vendors', icon: Building2, description: 'Vendor management' },
    ]
  }
};

// Timezone options
const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'America/New_York', label: 'US Eastern (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PST/PDT)' },
  { value: 'Europe/London', label: 'UK (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Australia (AEST/AEDT)' },
];

// Currency options
const CURRENCIES = [
  { value: 'INR', symbol: '₹', label: 'Indian Rupee (₹)' },
  { value: 'USD', symbol: '$', label: 'US Dollar ($)' },
  { value: 'EUR', symbol: '€', label: 'Euro (€)' },
  { value: 'GBP', symbol: '£', label: 'British Pound (£)' },
  { value: 'AED', symbol: 'د.إ', label: 'UAE Dirham (د.إ)' },
  { value: 'SGD', symbol: 'S$', label: 'Singapore Dollar (S$)' },
  { value: 'AUD', symbol: 'A$', label: 'Australian Dollar (A$)' },
];

// Date format options
const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (31/12/2024)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/31/2024)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2024-12-31)' },
  { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY (31-Dec-2024)' },
];

// Indian states for dropdown
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
];

export default function TenantSettings() {
  const { user, token } = useAuth();
  const { refreshConfig } = useTenantConfig();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenantConfig, setTenantConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('company');
  
  // Form states
  const [branding, setBranding] = useState({
    app_name: '',
    tagline: '',
    primary_color: '#000000',
    accent_color: '#ffffff',
    secondary_color: '#374151',
    logo_url: '',
    favicon_url: ''
  });
  
  const [modules, setModules] = useState({});
  
  const [settings, setSettings] = useState({
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    currency_symbol: '₹',
    date_format: 'DD/MM/YYYY',
    fiscal_year_start: '04-01'
  });
  
  // Auth config for Google Workspace SSO
  const [authConfig, setAuthConfig] = useState({
    allow_password_login: true,
    allow_user_registration: false,
    google_workspace: {
      enabled: false,
      allowed_domain: '',
      client_id: '',
      client_secret: ''
    }
  });
  
  // Company Profile state
  const [companyProfile, setCompanyProfile] = useState({
    legal_name: '',
    trade_name: '',
    brand_name: '',
    constitution: 'Private Limited Company',
    gstin: '',
    registration_type: 'Regular',
    gst_act: 'Goods and Services Tax Act, 2017',
    registration_approval_date: '',
    validity_from: '',
    certificate_issue_date: '',
    msme_registration_number: '',
    company_email: '',
    company_phone: '',
    company_website: '',
    principal_address: {
      building_name: '',
      floor: '',
      unit_flat_no: '',
      building_plot_no: '',
      landmark: '',
      road_street: '',
      locality: '',
      city: '',
      district: '',
      state: '',
      pin_code: '',
      google_maps_url: ''
    },
    bank_details: {
      account_name: '',
      account_number: '',
      ifsc_code: '',
      bank_name: '',
      branch: '',
      terminal_id: '',
      payment_qr_url: ''
    },
    office_contact: {
      name: '',
      phone: '',
      email: '',
      purpose: 'For Couriers / Parcels or directions'
    },
    directors: []
  });

  const isAdmin = ['CEO', 'Director', 'System Admin', 'Admin'].includes(user?.role);

  // Fetch current tenant config
  const fetchTenantConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/tenants/current/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const config = response.data;
      setTenantConfig(config);
      
      if (config.branding) {
        setBranding({
          app_name: config.branding.app_name || '',
          tagline: config.branding.tagline || '',
          primary_color: config.branding.primary_color || '#000000',
          accent_color: config.branding.accent_color || '#ffffff',
          secondary_color: config.branding.secondary_color || '#374151',
          logo_url: config.branding.logo_url || '',
          favicon_url: config.branding.favicon_url || ''
        });
      }
      
      if (config.modules) {
        setModules(config.modules);
      }
      
      if (config.settings) {
        setSettings(config.settings);
      }
      
      if (config.auth_config) {
        setAuthConfig(prev => ({
          ...prev,
          ...config.auth_config,
          google_workspace: { ...prev.google_workspace, ...config.auth_config.google_workspace }
        }));
      }
      
      if (config.company_profile) {
        setCompanyProfile(prev => ({
          ...prev,
          ...config.company_profile,
          principal_address: { ...prev.principal_address, ...config.company_profile.principal_address },
          bank_details: { ...prev.bank_details, ...config.company_profile.bank_details },
          office_contact: { ...prev.office_contact, ...config.company_profile.office_contact },
          directors: config.company_profile.directors || []
        }));
      }
    } catch (error) {
      console.error('Failed to fetch tenant config:', error);
      toast.error('Failed to load tenant settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTenantConfig();
  }, [fetchTenantConfig]);
  
  // Save auth config (Google Workspace)
  const saveAuthConfig = async () => {
    try {
      setSaving(true);
      await axios.put(`${API_URL}/api/tenants/current/config`, { auth_config: authConfig }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Authentication settings saved');
      refreshConfig();
    } catch (error) {
      console.error('Failed to save auth config:', error);
      toast.error('Failed to save authentication settings');
    } finally {
      setSaving(false);
    }
  };

  // Save company profile
  const saveCompanyProfile = async () => {
    try {
      setSaving(true);
      await axios.put(`${API_URL}/api/tenants/current/company-profile`, companyProfile, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Company profile saved successfully');
    } catch (error) {
      console.error('Failed to save company profile:', error);
      toast.error('Failed to save company profile');
    } finally {
      setSaving(false);
    }
  };

  // Save branding
  const saveBranding = async () => {
    try {
      setSaving(true);
      await axios.put(`${API_URL}/api/tenants/current/branding`, branding, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Branding saved - theme updated');
      // Refresh the tenant config context to apply branding globally
      refreshConfig();
    } catch (error) {
      console.error('Failed to save branding:', error);
      toast.error('Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  // Save settings
  const saveSettings = async () => {
    try {
      setSaving(true);
      await axios.put(`${API_URL}/api/tenants/current/settings`, settings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Toggle module
  const toggleModule = (moduleKey, enabled) => {
    setModules(prev => ({ ...prev, [moduleKey]: enabled }));
  };

  // Save modules
  const saveModules = async () => {
    try {
      setSaving(true);
      await axios.put(`${API_URL}/api/tenants/current/config`, { modules }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Module settings saved - sidebar updated');
      // Refresh the tenant config context to update sidebar immediately
      refreshConfig();
    } catch (error) {
      console.error('Failed to save modules:', error);
      if (error.response?.status === 403) {
        toast.error('Module changes require super admin access');
      } else {
        toast.error('Failed to save module settings');
      }
    } finally {
      setSaving(false);
    }
  };

  // Handle logo upload
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be less than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setBranding(prev => ({ ...prev, logo_url: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  // Handle QR upload
  const handleQRUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('QR image must be less than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setCompanyProfile(prev => ({
        ...prev,
        bank_details: { ...prev.bank_details, payment_qr_url: reader.result }
      }));
    };
    reader.readAsDataURL(file);
  };

  // Add director
  const addDirector = () => {
    setCompanyProfile(prev => ({
      ...prev,
      directors: [...prev.directors, { name: '', designation: 'Director', resident_state: '', email: '', phone: '' }]
    }));
  };

  // Remove director
  const removeDirector = (index) => {
    setCompanyProfile(prev => ({
      ...prev,
      directors: prev.directors.filter((_, i) => i !== index)
    }));
  };

  // Update director
  const updateDirector = (index, field, value) => {
    setCompanyProfile(prev => ({
      ...prev,
      directors: prev.directors.map((d, i) => i === index ? { ...d, [field]: value } : d)
    }));
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              Tenant settings are only available to Admin roles.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <RefreshCw className="h-8 w-8 mx-auto animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading tenant settings...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="tenant-settings-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenant Settings</h1>
          <p className="text-muted-foreground mt-1">
            Customize company profile, branding, modules, and settings
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span>{tenantConfig?.name || 'Current Tenant'}</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-[600px]">
          <TabsTrigger value="company" className="flex items-center gap-2" data-testid="tab-company">
            <Building2 className="h-4 w-4" />
            Company
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2" data-testid="tab-branding">
            <Palette className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="modules" className="flex items-center gap-2" data-testid="tab-modules">
            <Puzzle className="h-4 w-4" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-2" data-testid="tab-roles">
            <Shield className="h-4 w-4" />
            Roles
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2" data-testid="tab-settings">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Company Profile Tab */}
        <TabsContent value="company" className="space-y-6">
          {/* Business Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Business Identity
              </CardTitle>
              <CardDescription>Legal and trade names of your company</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Legal Name</Label>
                <Input
                  value={companyProfile.legal_name}
                  onChange={(e) => setCompanyProfile(prev => ({ ...prev, legal_name: e.target.value }))}
                  placeholder="COMPANY PRIVATE LIMITED"
                  data-testid="input-legal-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Trade Name</Label>
                <Input
                  value={companyProfile.trade_name}
                  onChange={(e) => setCompanyProfile(prev => ({ ...prev, trade_name: e.target.value }))}
                  placeholder="Company Trade Name"
                />
              </div>
              <div className="space-y-2">
                <Label>Brand Name</Label>
                <Input
                  value={companyProfile.brand_name}
                  onChange={(e) => setCompanyProfile(prev => ({ ...prev, brand_name: e.target.value }))}
                  placeholder="Brand Name"
                />
              </div>
              <div className="space-y-2">
                <Label>Constitution</Label>
                <Select
                  value={companyProfile.constitution}
                  onValueChange={(value) => setCompanyProfile(prev => ({ ...prev, constitution: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Private Limited Company">Private Limited Company</SelectItem>
                    <SelectItem value="Public Limited Company">Public Limited Company</SelectItem>
                    <SelectItem value="LLP">LLP</SelectItem>
                    <SelectItem value="Partnership">Partnership</SelectItem>
                    <SelectItem value="Proprietorship">Proprietorship</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* GST & MSME Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                GST & Registration Details
              </CardTitle>
              <CardDescription>Tax registration information</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>GSTIN</Label>
                <Input
                  value={companyProfile.gstin}
                  onChange={(e) => setCompanyProfile(prev => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  data-testid="input-gstin"
                />
              </div>
              <div className="space-y-2">
                <Label>Registration Type</Label>
                <Select
                  value={companyProfile.registration_type}
                  onValueChange={(value) => setCompanyProfile(prev => ({ ...prev, registration_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Regular">Regular</SelectItem>
                    <SelectItem value="Composition">Composition</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>MSME Registration Number</Label>
                <Input
                  value={companyProfile.msme_registration_number}
                  onChange={(e) => setCompanyProfile(prev => ({ ...prev, msme_registration_number: e.target.value.toUpperCase() }))}
                  placeholder="UDYAM-XX-00-0000000"
                />
              </div>
              <div className="space-y-2">
                <Label>GST Registration Date</Label>
                <Input
                  type="date"
                  value={companyProfile.validity_from}
                  onChange={(e) => setCompanyProfile(prev => ({ ...prev, validity_from: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Contact Information
              </CardTitle>
              <CardDescription>Company contact details</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Company Email</Label>
                <Input
                  type="email"
                  value={companyProfile.company_email}
                  onChange={(e) => setCompanyProfile(prev => ({ ...prev, company_email: e.target.value }))}
                  placeholder="info@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Company Phone</Label>
                <Input
                  value={companyProfile.company_phone}
                  onChange={(e) => setCompanyProfile(prev => ({ ...prev, company_phone: e.target.value }))}
                  placeholder="+91 XXXXX XXXXX"
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={companyProfile.company_website}
                  onChange={(e) => setCompanyProfile(prev => ({ ...prev, company_website: e.target.value }))}
                  placeholder="https://www.company.com"
                />
              </div>
            </CardContent>
          </Card>

          {/* Principal Address */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Principal Place of Business
              </CardTitle>
              <CardDescription>Registered office address</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Building Name</Label>
                <Input
                  value={companyProfile.principal_address.building_name}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    principal_address: { ...prev.principal_address, building_name: e.target.value }
                  }))}
                  placeholder="Building / Tower Name"
                />
              </div>
              <div className="space-y-2">
                <Label>Floor / Unit</Label>
                <Input
                  value={companyProfile.principal_address.floor}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    principal_address: { ...prev.principal_address, floor: e.target.value }
                  }))}
                  placeholder="Floor, Unit No."
                />
              </div>
              <div className="space-y-2">
                <Label>Plot / Building No.</Label>
                <Input
                  value={companyProfile.principal_address.building_plot_no}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    principal_address: { ...prev.principal_address, building_plot_no: e.target.value }
                  }))}
                  placeholder="Plot No. / Door No."
                />
              </div>
              <div className="space-y-2">
                <Label>Road / Street</Label>
                <Input
                  value={companyProfile.principal_address.road_street}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    principal_address: { ...prev.principal_address, road_street: e.target.value }
                  }))}
                  placeholder="Road / Street Name"
                />
              </div>
              <div className="space-y-2">
                <Label>Locality</Label>
                <Input
                  value={companyProfile.principal_address.locality}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    principal_address: { ...prev.principal_address, locality: e.target.value }
                  }))}
                  placeholder="Area / Locality"
                />
              </div>
              <div className="space-y-2">
                <Label>Landmark</Label>
                <Input
                  value={companyProfile.principal_address.landmark}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    principal_address: { ...prev.principal_address, landmark: e.target.value }
                  }))}
                  placeholder="Near / Opposite to"
                />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={companyProfile.principal_address.city}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    principal_address: { ...prev.principal_address, city: e.target.value }
                  }))}
                  placeholder="City"
                />
              </div>
              <div className="space-y-2">
                <Label>District</Label>
                <Input
                  value={companyProfile.principal_address.district}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    principal_address: { ...prev.principal_address, district: e.target.value }
                  }))}
                  placeholder="District"
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Select
                  value={companyProfile.principal_address.state}
                  onValueChange={(value) => setCompanyProfile(prev => ({
                    ...prev,
                    principal_address: { ...prev.principal_address, state: value }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>PIN Code</Label>
                <Input
                  value={companyProfile.principal_address.pin_code}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    principal_address: { ...prev.principal_address, pin_code: e.target.value }
                  }))}
                  placeholder="500001"
                  maxLength={6}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Google Maps URL</Label>
                <Input
                  value={companyProfile.principal_address.google_maps_url}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    principal_address: { ...prev.principal_address, google_maps_url: e.target.value }
                  }))}
                  placeholder="https://maps.app.goo.gl/..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Bank Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Landmark className="h-5 w-5" />
                Bank Account Details
              </CardTitle>
              <CardDescription>Company bank account for payments</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Account Name</Label>
                <Input
                  value={companyProfile.bank_details.account_name}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    bank_details: { ...prev.bank_details, account_name: e.target.value }
                  }))}
                  placeholder="Company Name"
                />
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  value={companyProfile.bank_details.account_number}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    bank_details: { ...prev.bank_details, account_number: e.target.value }
                  }))}
                  placeholder="XXXXXXXXXXXX"
                />
              </div>
              <div className="space-y-2">
                <Label>IFSC Code</Label>
                <Input
                  value={companyProfile.bank_details.ifsc_code}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    bank_details: { ...prev.bank_details, ifsc_code: e.target.value.toUpperCase() }
                  }))}
                  placeholder="XXXX0000000"
                  maxLength={11}
                />
              </div>
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input
                  value={companyProfile.bank_details.bank_name}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    bank_details: { ...prev.bank_details, bank_name: e.target.value }
                  }))}
                  placeholder="Bank Name"
                />
              </div>
              <div className="space-y-2">
                <Label>Branch</Label>
                <Input
                  value={companyProfile.bank_details.branch}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    bank_details: { ...prev.bank_details, branch: e.target.value }
                  }))}
                  placeholder="Branch Name"
                />
              </div>
              <div className="space-y-2">
                <Label>Terminal ID (for UPI)</Label>
                <Input
                  value={companyProfile.bank_details.terminal_id}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    bank_details: { ...prev.bank_details, terminal_id: e.target.value }
                  }))}
                  placeholder="Terminal ID"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Payment QR Code</Label>
                <div className="flex items-center gap-4">
                  <div className="h-24 w-24 rounded-xl bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed border-border">
                    {companyProfile.bank_details.payment_qr_url ? (
                      <img src={companyProfile.bank_details.payment_qr_url} alt="QR" className="h-full w-full object-cover" />
                    ) : (
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleQRUpload}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Upload payment QR code image</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Office Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Office Contact Person
              </CardTitle>
              <CardDescription>Contact for couriers and visitors</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={companyProfile.office_contact.name}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    office_contact: { ...prev.office_contact, name: e.target.value }
                  }))}
                  placeholder="Contact Person Name"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={companyProfile.office_contact.phone}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    office_contact: { ...prev.office_contact, phone: e.target.value }
                  }))}
                  placeholder="+91 XXXXX XXXXX"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={companyProfile.office_contact.email}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    office_contact: { ...prev.office_contact, email: e.target.value }
                  }))}
                  placeholder="contact@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Purpose</Label>
                <Input
                  value={companyProfile.office_contact.purpose}
                  onChange={(e) => setCompanyProfile(prev => ({
                    ...prev,
                    office_contact: { ...prev.office_contact, purpose: e.target.value }
                  }))}
                  placeholder="For Couriers / Parcels"
                />
              </div>
            </CardContent>
          </Card>

          {/* Directors */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Directors / Key Personnel
                  </CardTitle>
                  <CardDescription>Company directors and key management</CardDescription>
                </div>
                <Button onClick={addDirector} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Director
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {companyProfile.directors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No directors added yet. Click "Add Director" to add one.</p>
                </div>
              ) : (
                companyProfile.directors.map((director, index) => (
                  <div key={index} className="p-4 border rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Director {index + 1}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDirector(index)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={director.name}
                          onChange={(e) => updateDirector(index, 'name', e.target.value)}
                          placeholder="Full Name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Designation</Label>
                        <Select
                          value={director.designation}
                          onValueChange={(value) => updateDirector(index, 'designation', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Director">Director</SelectItem>
                            <SelectItem value="Managing Director">Managing Director</SelectItem>
                            <SelectItem value="CEO">CEO</SelectItem>
                            <SelectItem value="CFO">CFO</SelectItem>
                            <SelectItem value="COO">COO</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Resident State</Label>
                        <Select
                          value={director.resident_state}
                          onValueChange={(value) => updateDirector(index, 'resident_state', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent>
                            {INDIAN_STATES.map(state => (
                              <SelectItem key={state} value={state}>{state}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input
                          value={director.phone || ''}
                          onChange={(e) => updateDirector(index, 'phone', e.target.value)}
                          placeholder="+91 XXXXX XXXXX"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Save Button - Sticky */}
          <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t border-border mt-6">
            <div className="flex justify-end">
              <Button onClick={saveCompanyProfile} disabled={saving} data-testid="save-company-btn">
                {saving ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Company Profile
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Branding Tab */}
        <TabsContent value="branding" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Logo & Identity</CardTitle>
                <CardDescription>Upload your company logo and set app name</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Company Logo</Label>
                  <div className="flex items-center gap-4">
                    <div className="h-20 w-20 rounded-xl bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed border-border">
                      {branding.logo_url ? (
                        <img src={branding.logo_url} alt="Logo" className="h-full w-full object-cover" />
                      ) : (
                        <Upload className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <Input type="file" accept="image/*" onChange={handleLogoUpload} className="cursor-pointer" data-testid="logo-upload" />
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 2MB</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Application Name</Label>
                  <Input
                    value={branding.app_name}
                    onChange={(e) => setBranding(prev => ({ ...prev, app_name: e.target.value }))}
                    placeholder="My Sales CRM"
                    data-testid="input-app-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tagline</Label>
                  <Input
                    value={branding.tagline}
                    onChange={(e) => setBranding(prev => ({ ...prev, tagline: e.target.value }))}
                    placeholder="Your sales companion"
                    data-testid="input-tagline"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Brand Colors</CardTitle>
                <CardDescription>Set your brand colors for the interface</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Primary Color</Label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={branding.primary_color} onChange={(e) => setBranding(prev => ({ ...prev, primary_color: e.target.value }))} className="h-10 w-16 rounded-lg cursor-pointer border border-border" data-testid="input-primary-color" />
                    <Input value={branding.primary_color} onChange={(e) => setBranding(prev => ({ ...prev, primary_color: e.target.value }))} className="flex-1 font-mono" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Accent Color</Label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={branding.accent_color} onChange={(e) => setBranding(prev => ({ ...prev, accent_color: e.target.value }))} className="h-10 w-16 rounded-lg cursor-pointer border border-border" data-testid="input-accent-color" />
                    <Input value={branding.accent_color} onChange={(e) => setBranding(prev => ({ ...prev, accent_color: e.target.value }))} className="flex-1 font-mono" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="p-4 rounded-xl border" style={{ backgroundColor: branding.primary_color }}>
                    <div className="flex items-center gap-3">
                      {branding.logo_url && <img src={branding.logo_url} alt="Preview" className="h-10 w-10 rounded-lg object-cover" />}
                      <div>
                        <h3 className="font-semibold" style={{ color: branding.accent_color }}>{branding.app_name || 'Your App Name'}</h3>
                        <p className="text-sm opacity-80" style={{ color: branding.accent_color }}>{branding.tagline || 'Your tagline here'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t border-border mt-6">
            <div className="flex justify-end">
              <Button onClick={saveBranding} disabled={saving} data-testid="save-branding-btn">
                {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Branding
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Modules Tab */}
        <TabsContent value="modules" className="space-y-6">
          {Object.entries(MODULE_CONFIG).map(([groupKey, group]) => (
            <Card key={groupKey}>
              <CardHeader>
                <CardTitle className="text-lg">{group.title}</CardTitle>
                <CardDescription>Enable or disable features</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {group.modules.map((module) => {
                    const Icon = module.icon;
                    const isEnabled = modules[module.key] !== false;
                    return (
                      <div key={module.key} className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">{module.label}</p>
                            <p className="text-sm text-muted-foreground">{module.description}</p>
                          </div>
                        </div>
                        <Switch checked={isEnabled} onCheckedChange={(checked) => toggleModule(module.key, checked)} data-testid={`toggle-${module.key}`} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t border-border mt-6">
            <div className="flex justify-end">
              <Button onClick={saveModules} disabled={saving} data-testid="save-modules-btn">
                {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Modules
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Roles Tab */}
        <TabsContent value="roles" className="space-y-6">
          <RoleManagement />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          {/* Google Workspace SSO */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google Workspace SSO
              </CardTitle>
              <CardDescription>
                Allow users with your company's Google Workspace accounts to sign in
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Enable Google Workspace Login</p>
                  <p className="text-sm text-muted-foreground">Users with @{authConfig.google_workspace?.allowed_domain || 'yourdomain.com'} emails can sign in</p>
                </div>
                <Switch 
                  checked={authConfig.google_workspace?.enabled || false} 
                  onCheckedChange={(checked) => setAuthConfig(prev => ({
                    ...prev,
                    google_workspace: { ...prev.google_workspace, enabled: checked }
                  }))}
                  data-testid="toggle-google-workspace"
                />
              </div>
              
              {authConfig.google_workspace?.enabled && (
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Label>Allowed Email Domain</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">@</span>
                      <Input
                        placeholder="yourdomain.com"
                        value={authConfig.google_workspace?.allowed_domain || ''}
                        onChange={(e) => setAuthConfig(prev => ({
                          ...prev,
                          google_workspace: { ...prev.google_workspace, allowed_domain: e.target.value.toLowerCase().replace('@', '') }
                        }))}
                        data-testid="input-google-domain"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Only users with emails ending in this domain can sign in via Google
                    </p>
                  </div>
                  
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-2">How it works:</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Users click "Sign in with Google Workspace" on the login page</li>
                      <li>• They authenticate with their company Google account</li>
                      <li>• New users are automatically provisioned with "User" role</li>
                      <li>• You can change their role in Team Management after</li>
                    </ul>
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Allow Password Login</p>
                  <p className="text-sm text-muted-foreground">Users can also sign in with email and password</p>
                </div>
                <Switch 
                  checked={authConfig.allow_password_login !== false} 
                  onCheckedChange={(checked) => setAuthConfig(prev => ({
                    ...prev,
                    allow_password_login: checked
                  }))}
                  data-testid="toggle-password-login"
                />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Regional Settings</CardTitle>
              <CardDescription>Configure timezone, currency, and date formats</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Clock className="h-4 w-4" />Timezone</Label>
                <Select value={settings.timezone} onValueChange={(value) => setSettings(prev => ({ ...prev, timezone: value }))}>
                  <SelectTrigger data-testid="select-timezone"><SelectValue placeholder="Select timezone" /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (<SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><DollarSign className="h-4 w-4" />Currency</Label>
                <Select value={settings.currency} onValueChange={(value) => { const currency = CURRENCIES.find(c => c.value === value); setSettings(prev => ({ ...prev, currency: value, currency_symbol: currency?.symbol || '$' })); }}>
                  <SelectTrigger data-testid="select-currency"><SelectValue placeholder="Select currency" /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((cur) => (<SelectItem key={cur.value} value={cur.value}>{cur.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" />Date Format</Label>
                <Select value={settings.date_format} onValueChange={(value) => setSettings(prev => ({ ...prev, date_format: value }))}>
                  <SelectTrigger data-testid="select-date-format"><SelectValue placeholder="Select format" /></SelectTrigger>
                  <SelectContent>
                    {DATE_FORMATS.map((fmt) => (<SelectItem key={fmt.value} value={fmt.value}>{fmt.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Globe className="h-4 w-4" />Fiscal Year Start</Label>
                <Select value={settings.fiscal_year_start} onValueChange={(value) => setSettings(prev => ({ ...prev, fiscal_year_start: value }))}>
                  <SelectTrigger data-testid="select-fiscal-year"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01-01">January 1st</SelectItem>
                    <SelectItem value="04-01">April 1st (India)</SelectItem>
                    <SelectItem value="07-01">July 1st</SelectItem>
                    <SelectItem value="10-01">October 1st</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t border-border mt-6">
            <div className="flex justify-end gap-3">
              <Button onClick={saveAuthConfig} disabled={saving} variant="outline" data-testid="save-auth-config-btn">
                {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Auth Settings
              </Button>
              <Button onClick={saveSettings} disabled={saving} data-testid="save-settings-btn">
                {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Save Regional Settings
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
