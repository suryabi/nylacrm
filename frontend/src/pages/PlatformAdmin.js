import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  Building2, Users, Search, RefreshCw, Settings, Trash2, 
  Power, Calendar, Crown, TrendingUp, Shield, Globe,
  ChevronRight, CheckCircle, XCircle, Clock, Palette,
  Puzzle, Save, AlertTriangle
} from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Platform Admin emails
const PLATFORM_ADMIN_EMAILS = ['surya.yadavalli@gmail.com', 'surya.yadavalli@nylaairwater.earth'];

export default function PlatformAdmin() {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [totalTenants, setTotalTenants] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantDetails, setTenantDetails] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Check if current user is platform admin
  const isPlatformAdmin = user && PLATFORM_ADMIN_EMAILS.includes(user.email?.toLowerCase());

  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/platform-admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [token]);

  const fetchTenants = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      
      const response = await axios.get(`${API_URL}/api/platform-admin/tenants?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTenants(response.data.tenants);
      setTotalTenants(response.data.total);
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
      if (error.response?.status === 403) {
        toast.error('Access denied. Platform Admin access required.');
      }
    } finally {
      setLoading(false);
    }
  }, [token, searchQuery, statusFilter]);

  const fetchTenantDetails = useCallback(async (tenantId) => {
    try {
      const response = await axios.get(`${API_URL}/api/platform-admin/tenants/${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTenantDetails(response.data);
    } catch (error) {
      console.error('Failed to fetch tenant details:', error);
      toast.error('Failed to load tenant details');
    }
  }, [token]);

  useEffect(() => {
    if (isPlatformAdmin) {
      fetchStats();
      fetchTenants();
    }
  }, [isPlatformAdmin, fetchStats, fetchTenants]);

  useEffect(() => {
    if (selectedTenant) {
      fetchTenantDetails(selectedTenant);
    }
  }, [selectedTenant, fetchTenantDetails]);

  const handleToggleStatus = async (tenantId) => {
    try {
      const response = await axios.post(`${API_URL}/api/platform-admin/tenants/${tenantId}/toggle-status`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(response.data.message);
      fetchTenants();
      if (selectedTenant === tenantId) {
        fetchTenantDetails(tenantId);
      }
    } catch (error) {
      toast.error('Failed to toggle tenant status');
    }
  };

  const handleExtendTrial = async (tenantId, days = 14) => {
    try {
      const response = await axios.post(`${API_URL}/api/platform-admin/tenants/${tenantId}/extend-trial`, 
        { days },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(response.data.message);
      fetchTenants();
      if (selectedTenant === tenantId) {
        fetchTenantDetails(tenantId);
      }
    } catch (error) {
      toast.error('Failed to extend trial');
    }
  };

  const handleUpgrade = async (tenantId, plan) => {
    try {
      const response = await axios.post(`${API_URL}/api/platform-admin/tenants/${tenantId}/upgrade`, 
        { plan },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(response.data.message);
      fetchTenants();
      if (selectedTenant === tenantId) {
        fetchTenantDetails(tenantId);
      }
    } catch (error) {
      toast.error('Failed to upgrade tenant');
    }
  };

  const handleSaveTenantConfig = async () => {
    if (!tenantDetails) return;
    
    try {
      setSaving(true);
      await axios.put(`${API_URL}/api/platform-admin/tenants/${tenantDetails.tenant_id}`, tenantDetails, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Tenant configuration saved');
      fetchTenants();
    } catch (error) {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTenant = async () => {
    if (!tenantDetails || deleteConfirmText !== tenantDetails.tenant_id) {
      toast.error('Please type the tenant ID to confirm deletion');
      return;
    }
    
    try {
      await axios.delete(`${API_URL}/api/platform-admin/tenants/${tenantDetails.tenant_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Tenant deleted successfully');
      setShowDeleteDialog(false);
      setSelectedTenant(null);
      setTenantDetails(null);
      fetchTenants();
      fetchStats();
    } catch (error) {
      toast.error('Failed to delete tenant');
    }
  };

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            Platform Admin access is required to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Crown className="w-6 h-6 text-amber-500" />
            Platform Administration
          </h1>
          <p className="text-muted-foreground">Manage all workspaces and tenants</p>
        </div>
        <Button onClick={() => { fetchStats(); fetchTenants(); }} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Tenants</p>
                  <p className="text-3xl font-bold">{stats.total_tenants}</p>
                </div>
                <Building2 className="w-10 h-10 text-primary/20" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-3xl font-bold text-green-600">{stats.active_tenants}</p>
                </div>
                <CheckCircle className="w-10 h-10 text-green-200" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">On Trial</p>
                  <p className="text-3xl font-bold text-amber-600">{stats.trial_tenants}</p>
                </div>
                <Clock className="w-10 h-10 text-amber-200" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                  <p className="text-3xl font-bold">{stats.total_users}</p>
                </div>
                <Users className="w-10 h-10 text-primary/20" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tenant List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Workspaces</CardTitle>
            <div className="flex gap-2 mt-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-24 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : tenants.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No tenants found</p>
            ) : (
              tenants.map((tenant) => (
                <div
                  key={tenant.tenant_id}
                  onClick={() => setSelectedTenant(tenant.tenant_id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTenant === tenant.tenant_id 
                      ? 'bg-primary/10 border-primary' 
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{tenant.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{tenant.tenant_id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {tenant.is_trial && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">Trial</Badge>
                      )}
                      {!tenant.is_active && (
                        <Badge variant="destructive">Disabled</Badge>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {tenant.user_count}
                    </span>
                    {tenant.auth_config?.google_workspace?.enabled && (
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        SSO
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Tenant Details */}
        <Card className="lg:col-span-2">
          {!selectedTenant ? (
            <div className="flex items-center justify-center h-full min-h-[400px] text-muted-foreground">
              <div className="text-center">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Select a workspace to view details</p>
              </div>
            </div>
          ) : !tenantDetails ? (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {tenantDetails.branding?.app_name || tenantDetails.name}
                      {!tenantDetails.is_active && (
                        <Badge variant="destructive">Disabled</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>{tenantDetails.tenant_id}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={tenantDetails.is_active ? "outline" : "default"}
                      size="sm"
                      onClick={() => handleToggleStatus(tenantDetails.tenant_id)}
                    >
                      <Power className="w-4 h-4 mr-1" />
                      {tenantDetails.is_active ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="overview" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="industry">Industry</TabsTrigger>
                    <TabsTrigger value="branding">Branding</TabsTrigger>
                    <TabsTrigger value="modules">Modules</TabsTrigger>
                    <TabsTrigger value="sso">SSO</TabsTrigger>
                    <TabsTrigger value="danger">Danger Zone</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-2xl font-bold">{tenantDetails.stats?.user_count || 0}</p>
                        <p className="text-xs text-muted-foreground">Users</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-2xl font-bold">{tenantDetails.stats?.lead_count || 0}</p>
                        <p className="text-xs text-muted-foreground">Leads</p>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-2xl font-bold">{tenantDetails.stats?.account_count || 0}</p>
                        <p className="text-xs text-muted-foreground">Accounts</p>
                      </div>
                    </div>

                    {/* Subscription */}
                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Subscription Plan</p>
                          <p className="text-sm text-muted-foreground capitalize">{tenantDetails.subscription_plan || 'trial'}</p>
                        </div>
                        <Select 
                          value={tenantDetails.subscription_plan || 'trial'} 
                          onValueChange={(plan) => handleUpgrade(tenantDetails.tenant_id, plan)}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="trial">Trial</SelectItem>
                            <SelectItem value="starter">Starter</SelectItem>
                            <SelectItem value="professional">Professional</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {tenantDetails.is_trial && tenantDetails.trial_ends_at && (
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div>
                            <p className="text-sm">Trial ends</p>
                            <p className="text-sm font-medium">{new Date(tenantDetails.trial_ends_at).toLocaleDateString()}</p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => handleExtendTrial(tenantDetails.tenant_id, 14)}>
                            <Calendar className="w-4 h-4 mr-1" />
                            +14 Days
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Admin Users */}
                    <div className="p-4 border rounded-lg">
                      <p className="font-medium mb-2">Admin Users</p>
                      <div className="space-y-2">
                        {tenantDetails.admins?.map((admin) => (
                          <div key={admin.id} className="flex items-center justify-between text-sm">
                            <span>{admin.name}</span>
                            <span className="text-muted-foreground">{admin.email}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Industry Tab */}
                  <TabsContent value="industry" className="space-y-4">
                    <div className="p-4 border rounded-lg space-y-4">
                      <div>
                        <Label className="text-base font-medium">Industry Profile</Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Determines which industry-specific features are available to this tenant
                        </p>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Industry Type</Label>
                        <Select 
                          value={tenantDetails.industry?.industry_type || 'generic'} 
                          onValueChange={async (industryType) => {
                            try {
                              setSaving(true);
                              await axios.put(
                                `${API_URL}/api/tenants/${tenantDetails.tenant_id}/industry`,
                                null,
                                { 
                                  headers: { Authorization: `Bearer ${token}` },
                                  params: { industry_type: industryType }
                                }
                              );
                              toast.success(`Industry updated to ${industryType}`);
                              fetchTenantDetails(tenantDetails.tenant_id);
                            } catch (error) {
                              toast.error('Failed to update industry');
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="generic">
                              <div className="flex flex-col">
                                <span>Generic CRM</span>
                                <span className="text-xs text-muted-foreground">Standard CRM features</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="water_brand">
                              <div className="flex flex-col">
                                <span>Water/Beverage Brand</span>
                                <span className="text-xs text-muted-foreground">Bottle tracking, SKU volumes</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Industry Features List */}
                      <div className="pt-4 border-t">
                        <Label className="text-sm">Enabled Industry Features</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {tenantDetails.industry?.industry_type === 'water_brand' ? (
                            <>
                              <Badge variant="secondary">lead_bottle_tracking</Badge>
                              <Badge variant="secondary">bottle_preview</Badge>
                              <Badge variant="secondary">cogs_calculator</Badge>
                              <Badge variant="secondary">sku_management</Badge>
                              <Badge variant="secondary">account_bottle_volume</Badge>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">No industry-specific features</p>
                          )}
                        </div>
                      </div>

                      {/* Industry Config (for water_brand) */}
                      {tenantDetails.industry?.industry_type === 'water_brand' && (
                        <div className="pt-4 border-t space-y-3">
                          <Label className="text-sm">Water Brand Configuration</Label>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Bottle Sizes</Label>
                              <Input
                                value={tenantDetails.industry?.industry_config?.bottle_sizes?.join(', ') || '330ml, 660ml, 1L'}
                                onChange={(e) => setTenantDetails(prev => ({
                                  ...prev,
                                  industry: {
                                    ...prev.industry,
                                    industry_config: {
                                      ...prev.industry?.industry_config,
                                      bottle_sizes: e.target.value.split(',').map(s => s.trim())
                                    }
                                  }
                                }))}
                                placeholder="330ml, 660ml, 1L"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Default Bottles Per Cover</Label>
                              <Input
                                type="number"
                                value={tenantDetails.industry?.industry_config?.default_bottles_per_cover || 2}
                                onChange={(e) => setTenantDetails(prev => ({
                                  ...prev,
                                  industry: {
                                    ...prev.industry,
                                    industry_config: {
                                      ...prev.industry?.industry_config,
                                      default_bottles_per_cover: parseInt(e.target.value) || 2
                                    }
                                  }
                                }))}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="branding" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>App Name</Label>
                        <Input
                          value={tenantDetails.branding?.app_name || ''}
                          onChange={(e) => setTenantDetails(prev => ({
                            ...prev,
                            branding: { ...prev.branding, app_name: e.target.value }
                          }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tagline</Label>
                        <Input
                          value={tenantDetails.branding?.tagline || ''}
                          onChange={(e) => setTenantDetails(prev => ({
                            ...prev,
                            branding: { ...prev.branding, tagline: e.target.value }
                          }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Primary Color</Label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={tenantDetails.branding?.primary_color || '#000000'}
                            onChange={(e) => setTenantDetails(prev => ({
                              ...prev,
                              branding: { ...prev.branding, primary_color: e.target.value }
                            }))}
                            className="w-12 h-10 rounded cursor-pointer"
                          />
                          <Input
                            value={tenantDetails.branding?.primary_color || '#000000'}
                            onChange={(e) => setTenantDetails(prev => ({
                              ...prev,
                              branding: { ...prev.branding, primary_color: e.target.value }
                            }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Logo URL</Label>
                        <Input
                          value={tenantDetails.branding?.logo_url || ''}
                          onChange={(e) => setTenantDetails(prev => ({
                            ...prev,
                            branding: { ...prev.branding, logo_url: e.target.value }
                          }))}
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                    <Button onClick={handleSaveTenantConfig} disabled={saving}>
                      {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Save Branding
                    </Button>
                  </TabsContent>

                  <TabsContent value="modules" className="space-y-4">
                    <p className="text-sm text-muted-foreground">Toggle modules on/off for this tenant</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {[
                        { key: 'dashboard', label: 'Dashboard' },
                        { key: 'leads', label: 'Leads' },
                        { key: 'pipeline', label: 'Pipeline' },
                        { key: 'accounts', label: 'Accounts' },
                        { key: 'sales_portal', label: 'Sales Portal' },
                        { key: 'lead_discovery', label: 'Lead Discovery' },
                        { key: 'target_planning', label: 'Target Planning' },
                        { key: 'performance_tracker', label: 'Performance Tracker' },
                        { key: 'investor_dashboard', label: 'Investor Dashboard' },
                        { key: 'cogs_calculator', label: 'COGS Calculator' },
                        { key: 'team', label: 'Team Management' },
                        { key: 'contacts', label: 'Contacts' },
                        { key: 'marketing_calendar', label: 'Marketing Calendar' },
                        { key: 'marketing_masters', label: 'Marketing Masters' },
                        { key: 'meeting_minutes', label: 'Meeting Minutes' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                          <span className="text-sm">{label}</span>
                          <Switch
                            checked={tenantDetails.modules?.[key] !== false}
                            onCheckedChange={(checked) => setTenantDetails(prev => ({
                              ...prev,
                              modules: { ...prev.modules, [key]: checked }
                            }))}
                          />
                        </div>
                      ))}
                    </div>
                    <Button onClick={handleSaveTenantConfig} disabled={saving}>
                      {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Save Modules
                    </Button>
                  </TabsContent>

                  <TabsContent value="sso" className="space-y-4">
                    <div className="p-4 border rounded-lg space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">Google Workspace SSO</p>
                          <p className="text-sm text-muted-foreground">Allow Google login for this tenant</p>
                        </div>
                        <Switch
                          checked={tenantDetails.auth_config?.google_workspace?.enabled || false}
                          onCheckedChange={(checked) => setTenantDetails(prev => ({
                            ...prev,
                            auth_config: {
                              ...prev.auth_config,
                              google_workspace: {
                                ...prev.auth_config?.google_workspace,
                                enabled: checked
                              }
                            }
                          }))}
                        />
                      </div>
                      
                      {tenantDetails.auth_config?.google_workspace?.enabled && (
                        <div className="pt-3 border-t space-y-3">
                          <div className="space-y-2">
                            <Label>Allowed Domain</Label>
                            <Input
                              value={tenantDetails.auth_config?.google_workspace?.allowed_domain || ''}
                              onChange={(e) => setTenantDetails(prev => ({
                                ...prev,
                                auth_config: {
                                  ...prev.auth_config,
                                  google_workspace: {
                                    ...prev.auth_config?.google_workspace,
                                    allowed_domain: e.target.value.toLowerCase().replace('@', '')
                                  }
                                }
                              }))}
                              placeholder="company.com"
                            />
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between pt-3 border-t">
                        <div>
                          <p className="font-medium">Password Login</p>
                          <p className="text-sm text-muted-foreground">Allow email/password login</p>
                        </div>
                        <Switch
                          checked={tenantDetails.auth_config?.allow_password_login !== false}
                          onCheckedChange={(checked) => setTenantDetails(prev => ({
                            ...prev,
                            auth_config: {
                              ...prev.auth_config,
                              allow_password_login: checked
                            }
                          }))}
                        />
                      </div>
                    </div>
                    <Button onClick={handleSaveTenantConfig} disabled={saving}>
                      {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Save SSO Settings
                    </Button>
                  </TabsContent>

                  <TabsContent value="danger" className="space-y-4">
                    <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 rounded-lg">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-red-800 dark:text-red-400">Delete Workspace</p>
                          <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                            This will permanently delete the workspace and ALL its data including users, leads, accounts, and settings.
                            This action cannot be undone.
                          </p>
                          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                            <DialogTrigger asChild>
                              <Button variant="destructive" className="mt-3">
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Workspace
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Delete Workspace</DialogTitle>
                                <DialogDescription>
                                  This action cannot be undone. All data will be permanently deleted.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="py-4">
                                <Label>Type <strong>{tenantDetails.tenant_id}</strong> to confirm:</Label>
                                <Input
                                  className="mt-2"
                                  value={deleteConfirmText}
                                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                                  placeholder={tenantDetails.tenant_id}
                                />
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
                                <Button 
                                  variant="destructive" 
                                  onClick={handleDeleteTenant}
                                  disabled={deleteConfirmText !== tenantDetails.tenant_id}
                                >
                                  Delete Forever
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
