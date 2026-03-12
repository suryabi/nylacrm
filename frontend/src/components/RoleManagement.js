import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { 
  Shield, Plus, Trash2, Edit2, Save, RefreshCw, 
  Check, X, Users, Star, ChevronDown, ChevronRight,
  Eye, PenSquare, FilePlus, Trash, Lock
} from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function RoleManagement() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState([]);
  const [moduleCategories, setModuleCategories] = useState({});
  const [moduleLabels, setModuleLabels] = useState({});
  const [selectedRole, setSelectedRole] = useState(null);
  const [editedPermissions, setEditedPermissions] = useState({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  
  const [newRole, setNewRole] = useState({
    name: '',
    description: '',
    is_default: false
  });

  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/roles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoles(response.data.roles);
      setModuleCategories(response.data.module_categories);
      setModuleLabels(response.data.module_labels);
      
      // Select first role by default
      if (response.data.roles.length > 0 && !selectedRole) {
        setSelectedRole(response.data.roles[0]);
        setEditedPermissions(response.data.roles[0].permissions || {});
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error);
      toast.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, [token, selectedRole]);

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleSelectRole = (role) => {
    setSelectedRole(role);
    setEditedPermissions(role.permissions || {});
  };

  const handlePermissionChange = (moduleKey, action, value) => {
    setEditedPermissions(prev => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        [action]: value
      }
    }));
  };

  const handleToggleAllInCategory = (category, action, value) => {
    const modules = moduleCategories[category] || [];
    setEditedPermissions(prev => {
      const newPerms = { ...prev };
      modules.forEach(mod => {
        newPerms[mod] = {
          ...newPerms[mod],
          [action]: value
        };
      });
      return newPerms;
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    
    try {
      setSaving(true);
      await axios.put(`${API_URL}/api/roles/${selectedRole.id}`, {
        permissions: editedPermissions
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Permissions saved');
      fetchRoles();
    } catch (error) {
      toast.error('Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async () => {
    if (!newRole.name.trim()) {
      toast.error('Role name is required');
      return;
    }
    
    try {
      setSaving(true);
      const response = await axios.post(`${API_URL}/api/roles`, newRole, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Role '${newRole.name}' created`);
      setShowCreateDialog(false);
      setNewRole({ name: '', description: '', is_default: false });
      await fetchRoles();
      // Select the new role
      setSelectedRole(response.data);
      setEditedPermissions(response.data.permissions || {});
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create role');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRole) return;
    
    try {
      await axios.delete(`${API_URL}/api/roles/${selectedRole.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Role '${selectedRole.name}' deleted`);
      setShowDeleteDialog(false);
      setSelectedRole(null);
      fetchRoles();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete role');
    }
  };

  const handleSetDefault = async (roleId) => {
    try {
      await axios.post(`${API_URL}/api/roles/${roleId}/set-default`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Default role updated');
      fetchRoles();
    } catch (error) {
      toast.error('Failed to set default role');
    }
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Role Management
          </h2>
          <p className="text-sm text-muted-foreground">Create and manage roles with custom permissions</p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button data-testid="create-role-btn">
              <Plus className="w-4 h-4 mr-2" />
              Create Role
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Role</DialogTitle>
              <DialogDescription>Define a new role with custom permissions</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Role Name</Label>
                <Input
                  placeholder="e.g., Sales Rep, Supervisor"
                  value={newRole.name}
                  onChange={(e) => setNewRole(prev => ({ ...prev, name: e.target.value }))}
                  data-testid="new-role-name-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="What can this role do?"
                  value={newRole.description}
                  onChange={(e) => setNewRole(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_default"
                  checked={newRole.is_default}
                  onCheckedChange={(checked) => setNewRole(prev => ({ ...prev, is_default: checked }))}
                />
                <Label htmlFor="is_default" className="text-sm">Set as default role for new users</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateRole} disabled={saving} data-testid="confirm-create-role-btn">
                {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Create Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Role List */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {roles.map((role) => (
              <div
                key={role.id}
                onClick={() => handleSelectRole(role)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedRole?.id === role.id 
                    ? 'bg-primary/10 border-primary' 
                    : 'hover:bg-muted/50'
                }`}
                data-testid={`role-item-${role.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{role.name}</span>
                  <div className="flex items-center gap-1">
                    {role.is_default && (
                      <Badge variant="secondary" className="text-xs">Default</Badge>
                    )}
                    {role.is_system_role && (
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    )}
                  </div>
                </div>
                {role.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{role.description}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Permission Editor */}
        <Card className="lg:col-span-3">
          {!selectedRole ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Select a role to edit permissions
            </div>
          ) : (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {selectedRole.name}
                      {selectedRole.is_system_role && (
                        <Badge variant="outline" className="text-xs">System</Badge>
                      )}
                    </CardTitle>
                    <CardDescription>{selectedRole.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {!selectedRole.is_default && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleSetDefault(selectedRole.id)}
                      >
                        <Star className="w-4 h-4 mr-1" />
                        Set Default
                      </Button>
                    )}
                    {!selectedRole.is_system_role && (
                      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Delete Role</DialogTitle>
                            <DialogDescription>
                              Are you sure you want to delete "{selectedRole.name}"? This cannot be undone.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleDeleteRole}>Delete</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Permission Matrix */}
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-3 font-medium">Module</th>
                          <th className="text-center p-3 font-medium w-20">
                            <div className="flex items-center justify-center gap-1">
                              <Eye className="w-4 h-4" />
                              View
                            </div>
                          </th>
                          <th className="text-center p-3 font-medium w-20">
                            <div className="flex items-center justify-center gap-1">
                              <FilePlus className="w-4 h-4" />
                              Create
                            </div>
                          </th>
                          <th className="text-center p-3 font-medium w-20">
                            <div className="flex items-center justify-center gap-1">
                              <PenSquare className="w-4 h-4" />
                              Edit
                            </div>
                          </th>
                          <th className="text-center p-3 font-medium w-20">
                            <div className="flex items-center justify-center gap-1">
                              <Trash className="w-4 h-4" />
                              Delete
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(moduleCategories).map(([category, modules]) => (
                          <React.Fragment key={category}>
                            {/* Category Header */}
                            <tr 
                              className="bg-muted/30 cursor-pointer hover:bg-muted/50"
                              onClick={() => toggleCategory(category)}
                            >
                              <td className="p-3 font-medium" colSpan={5}>
                                <div className="flex items-center gap-2">
                                  {expandedCategories[category] ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                  {category}
                                  <span className="text-xs text-muted-foreground">({modules.length})</span>
                                </div>
                              </td>
                            </tr>
                            {/* Module Rows */}
                            {expandedCategories[category] && modules.map((moduleKey) => (
                              <tr key={moduleKey} className="border-t">
                                <td className="p-3 pl-8">{moduleLabels[moduleKey] || moduleKey}</td>
                                {['view', 'create', 'edit', 'delete'].map((action) => (
                                  <td key={action} className="text-center p-3">
                                    <Checkbox
                                      checked={editedPermissions[moduleKey]?.[action] || false}
                                      onCheckedChange={(checked) => handlePermissionChange(moduleKey, action, checked)}
                                      data-testid={`perm-${moduleKey}-${action}`}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t">
                    <Button onClick={handleSavePermissions} disabled={saving} data-testid="save-permissions-btn">
                      {saving ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Save Permissions
                    </Button>
                  </div>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
