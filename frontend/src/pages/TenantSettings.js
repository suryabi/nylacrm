import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { 
  Palette, Settings, Puzzle, Save, Upload, Building2, 
  Globe, Clock, DollarSign, Calendar, RefreshCw,
  Users, Kanban, Target, CalendarDays, Contact, Plane, Wallet, FolderOpen,
  Wrench, Boxes, ShieldCheck, Box, Truck
} from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Module definitions for toggle display
const MODULE_CONFIG = {
  core: {
    title: 'Core Modules',
    modules: [
      { key: 'leads', label: 'Leads', icon: Users, description: 'Lead management and tracking' },
      { key: 'accounts', label: 'Accounts', icon: Building2, description: 'Customer account management' },
      { key: 'pipeline', label: 'Pipeline', icon: Kanban, description: 'Visual sales pipeline' },
      { key: 'contacts', label: 'Contacts', icon: Contact, description: 'Contact directory' },
    ]
  },
  sales: {
    title: 'Sales Operations',
    modules: [
      { key: 'target_planning', label: 'Target Planning', icon: Target, description: 'Sales target management' },
      { key: 'daily_status', label: 'Daily Status', icon: CalendarDays, description: 'Daily activity updates' },
      { key: 'meetings', label: 'Meetings', icon: Calendar, description: 'Meeting scheduling' },
      { key: 'tasks', label: 'Tasks', icon: Calendar, description: 'Task management' },
    ]
  },
  requests: {
    title: 'Request Management',
    modules: [
      { key: 'expense_management', label: 'Expenses', icon: DollarSign, description: 'Expense tracking' },
      { key: 'travel_requests', label: 'Travel Requests', icon: Plane, description: 'Travel request workflow' },
      { key: 'budget_requests', label: 'Budget Requests', icon: Wallet, description: 'Budget approval workflow' },
      { key: 'files_documents', label: 'Documents', icon: FolderOpen, description: 'Document management' },
    ]
  },
  production: {
    title: 'Production (Beta)',
    modules: [
      { key: 'maintenance', label: 'Maintenance', icon: Wrench, description: 'Equipment maintenance' },
      { key: 'inventory', label: 'Inventory', icon: Boxes, description: 'Inventory tracking' },
      { key: 'quality_control', label: 'Quality Control', icon: ShieldCheck, description: 'QC processes' },
      { key: 'assets', label: 'Assets', icon: Box, description: 'Asset management' },
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

export default function TenantSettings() {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenantConfig, setTenantConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('branding');
  
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

  // Check if user has admin access
  const isAdmin = ['CEO', 'Director', 'System Admin'].includes(user?.role);

  // Fetch current tenant config
  const fetchTenantConfig = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/tenants/current/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const config = response.data;
      setTenantConfig(config);
      
      // Populate form states
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

  // Save branding
  const saveBranding = async () => {
    try {
      setSaving(true);
      await axios.put(`${API_URL}/api/tenants/current/branding`, branding, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Branding saved successfully');
      
      // Apply colors to CSS variables
      document.documentElement.style.setProperty('--primary', branding.primary_color);
      document.documentElement.style.setProperty('--accent', branding.accent_color);
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

  // Save modules (requires super admin for some)
  const saveModules = async () => {
    try {
      setSaving(true);
      // Note: Module changes may require super admin - the API will validate
      await axios.put(`${API_URL}/api/tenants/current/config`, { modules }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Module settings saved');
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

  // Handle logo upload (base64 for simplicity)
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

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              Tenant settings are only available to CEO, Director, and System Admin roles.
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
            Customize branding, modules, and settings for your organization
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span>{tenantConfig?.name || 'Current Tenant'}</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="branding" className="flex items-center gap-2" data-testid="tab-branding">
            <Palette className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="modules" className="flex items-center gap-2" data-testid="tab-modules">
            <Puzzle className="h-4 w-4" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2" data-testid="tab-settings">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Branding Tab */}
        <TabsContent value="branding" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Logo & Identity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Logo & Identity</CardTitle>
                <CardDescription>Upload your company logo and set app name</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Logo Upload */}
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
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="cursor-pointer"
                        data-testid="logo-upload"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        PNG, JPG up to 2MB. Recommended: 200x200px
                      </p>
                    </div>
                  </div>
                </div>

                {/* App Name */}
                <div className="space-y-2">
                  <Label htmlFor="app_name">Application Name</Label>
                  <Input
                    id="app_name"
                    value={branding.app_name}
                    onChange={(e) => setBranding(prev => ({ ...prev, app_name: e.target.value }))}
                    placeholder="My Sales CRM"
                    data-testid="input-app-name"
                  />
                </div>

                {/* Tagline */}
                <div className="space-y-2">
                  <Label htmlFor="tagline">Tagline (Optional)</Label>
                  <Input
                    id="tagline"
                    value={branding.tagline}
                    onChange={(e) => setBranding(prev => ({ ...prev, tagline: e.target.value }))}
                    placeholder="Your sales companion"
                    data-testid="input-tagline"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Colors */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Brand Colors</CardTitle>
                <CardDescription>Set your brand colors for the interface</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Primary Color */}
                <div className="space-y-2">
                  <Label htmlFor="primary_color">Primary Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      id="primary_color"
                      value={branding.primary_color}
                      onChange={(e) => setBranding(prev => ({ ...prev, primary_color: e.target.value }))}
                      className="h-10 w-16 rounded-lg cursor-pointer border border-border"
                      data-testid="input-primary-color"
                    />
                    <Input
                      value={branding.primary_color}
                      onChange={(e) => setBranding(prev => ({ ...prev, primary_color: e.target.value }))}
                      className="flex-1 font-mono"
                      placeholder="#000000"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Used for buttons, links, and highlights</p>
                </div>

                {/* Accent Color */}
                <div className="space-y-2">
                  <Label htmlFor="accent_color">Accent Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      id="accent_color"
                      value={branding.accent_color}
                      onChange={(e) => setBranding(prev => ({ ...prev, accent_color: e.target.value }))}
                      className="h-10 w-16 rounded-lg cursor-pointer border border-border"
                      data-testid="input-accent-color"
                    />
                    <Input
                      value={branding.accent_color}
                      onChange={(e) => setBranding(prev => ({ ...prev, accent_color: e.target.value }))}
                      className="flex-1 font-mono"
                      placeholder="#ffffff"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Used for secondary elements</p>
                </div>

                {/* Preview */}
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="p-4 rounded-xl border border-border" style={{ backgroundColor: branding.primary_color }}>
                    <div className="flex items-center gap-3">
                      {branding.logo_url && (
                        <img src={branding.logo_url} alt="Preview" className="h-10 w-10 rounded-lg object-cover" />
                      )}
                      <div>
                        <h3 className="font-semibold" style={{ color: branding.accent_color }}>
                          {branding.app_name || 'Your App Name'}
                        </h3>
                        <p className="text-sm opacity-80" style={{ color: branding.accent_color }}>
                          {branding.tagline || 'Your tagline here'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={saveBranding} disabled={saving} data-testid="save-branding-btn">
              {saving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Branding
            </Button>
          </div>
        </TabsContent>

        {/* Modules Tab */}
        <TabsContent value="modules" className="space-y-6">
          {Object.entries(MODULE_CONFIG).map(([groupKey, group]) => (
            <Card key={groupKey}>
              <CardHeader>
                <CardTitle className="text-lg">{group.title}</CardTitle>
                <CardDescription>Enable or disable features for your organization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {group.modules.map((module) => {
                    const Icon = module.icon;
                    const isEnabled = modules[module.key] !== false;
                    return (
                      <div
                        key={module.key}
                        className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{module.label}</p>
                            <p className="text-sm text-muted-foreground">{module.description}</p>
                          </div>
                        </div>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => toggleModule(module.key, checked)}
                          data-testid={`toggle-${module.key}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={saveModules} disabled={saving} data-testid="save-modules-btn">
              {saving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Module Settings
            </Button>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Regional Settings</CardTitle>
              <CardDescription>Configure timezone, currency, and date formats</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Timezone */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Timezone
                  </Label>
                  <Select
                    value={settings.timezone}
                    onValueChange={(value) => setSettings(prev => ({ ...prev, timezone: value }))}
                  >
                    <SelectTrigger data-testid="select-timezone">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Currency */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Currency
                  </Label>
                  <Select
                    value={settings.currency}
                    onValueChange={(value) => {
                      const currency = CURRENCIES.find(c => c.value === value);
                      setSettings(prev => ({
                        ...prev,
                        currency: value,
                        currency_symbol: currency?.symbol || '$'
                      }));
                    }}
                  >
                    <SelectTrigger data-testid="select-currency">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((cur) => (
                        <SelectItem key={cur.value} value={cur.value}>
                          {cur.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Format */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Date Format
                  </Label>
                  <Select
                    value={settings.date_format}
                    onValueChange={(value) => setSettings(prev => ({ ...prev, date_format: value }))}
                  >
                    <SelectTrigger data-testid="select-date-format">
                      <SelectValue placeholder="Select date format" />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_FORMATS.map((fmt) => (
                        <SelectItem key={fmt.value} value={fmt.value}>
                          {fmt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Fiscal Year Start */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Fiscal Year Start
                  </Label>
                  <Select
                    value={settings.fiscal_year_start}
                    onValueChange={(value) => setSettings(prev => ({ ...prev, fiscal_year_start: value }))}
                  >
                    <SelectTrigger data-testid="select-fiscal-year">
                      <SelectValue placeholder="Select fiscal year start" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="01-01">January 1st</SelectItem>
                      <SelectItem value="04-01">April 1st (India)</SelectItem>
                      <SelectItem value="07-01">July 1st</SelectItem>
                      <SelectItem value="10-01">October 1st</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={saving} data-testid="save-settings-btn">
              {saving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Settings
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
