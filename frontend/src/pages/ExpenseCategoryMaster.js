import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';
import { toast } from 'sonner';
import { 
  Plus, Trash2, Pencil, Loader2, Settings, FileText, 
  Plane, Hotel, Utensils, Phone, Briefcase, GraduationCap, Gift, MoreHorizontal,
  IndianRupee, CheckCircle, XCircle, AlertTriangle, Users, ChevronRight,
  Shield, Receipt, MessageSquare, Save
} from 'lucide-react';
import { cn } from '../lib/utils';
import AppBreadcrumb from '../components/AppBreadcrumb';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Icon mapping for categories
const CATEGORY_ICONS = {
  'plane': Plane,
  'hotel': Hotel,
  'utensils': Utensils,
  'phone': Phone,
  'briefcase': Briefcase,
  'graduation-cap': GraduationCap,
  'gift': Gift,
  'more-horizontal': MoreHorizontal,
};

const ICON_OPTIONS = [
  { id: 'plane', label: 'Plane', icon: Plane },
  { id: 'hotel', label: 'Hotel', icon: Hotel },
  { id: 'utensils', label: 'Utensils', icon: Utensils },
  { id: 'phone', label: 'Phone', icon: Phone },
  { id: 'briefcase', label: 'Briefcase', icon: Briefcase },
  { id: 'graduation-cap', label: 'Graduation', icon: GraduationCap },
  { id: 'gift', label: 'Gift', icon: Gift },
  { id: 'more-horizontal', label: 'More', icon: MoreHorizontal },
];

const COLOR_OPTIONS = [
  '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#6366F1', '#EC4899', '#EF4444', '#64748B'
];

// Format currency
const formatCurrency = (value) => {
  if (!value && value !== 0) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

export default function ExpenseCategoryMaster() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  const [showRoleLimitsSheet, setShowRoleLimitsSheet] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Category form state
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    icon: 'briefcase',
    color: '#3B82F6',
    display_order: 0,
    policy_guidelines: '',
    is_active: true
  });

  // Expense type form state
  const [typeForm, setTypeForm] = useState({
    category_id: '',
    name: '',
    description: '',
    is_active: true,
    requires_receipt: true,
    requires_justification: false,
    default_limit: 0,
    policy_guidelines: ''
  });

  // Role limits state
  const [roleLimits, setRoleLimits] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [categoriesRes, rolesRes] = await Promise.all([
        fetch(`${API_URL}/api/expense-master/categories?include_inactive=true`, { credentials: 'include' }),
        fetch(`${API_URL}/api/expense-master/roles`, { credentials: 'include' })
      ]);

      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data);
      }

      if (rolesRes.ok) {
        const data = await rolesRes.json();
        setRoles(data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load expense categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialize default data
  const handleInitialize = async () => {
    try {
      const response = await fetch(`${API_URL}/api/expense-master/initialize`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        toast.success('Default expense categories initialized');
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to initialize');
      }
    } catch (error) {
      toast.error('Failed to initialize');
    }
  };

  // Category handlers
  const openCategoryDialog = (category = null) => {
    if (category) {
      setEditMode(true);
      setCategoryForm({
        name: category.name || '',
        description: category.description || '',
        icon: category.icon || 'briefcase',
        color: category.color || '#3B82F6',
        display_order: category.display_order || 0,
        policy_guidelines: category.policy_guidelines || '',
        is_active: category.is_active !== false
      });
      setSelectedCategory(category);
    } else {
      setEditMode(false);
      setCategoryForm({
        name: '',
        description: '',
        icon: 'briefcase',
        color: '#3B82F6',
        display_order: categories.length,
        policy_guidelines: '',
        is_active: true
      });
      setSelectedCategory(null);
    }
    setShowCategoryDialog(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    setSaving(true);
    try {
      const url = editMode 
        ? `${API_URL}/api/expense-master/categories/${selectedCategory.id}`
        : `${API_URL}/api/expense-master/categories`;
      
      const response = await fetch(url, {
        method: editMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(categoryForm)
      });

      if (response.ok) {
        toast.success(`Category ${editMode ? 'updated' : 'created'} successfully`);
        setShowCategoryDialog(false);
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to save category');
      }
    } catch (error) {
      toast.error('Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (category) => {
    if (!window.confirm(`Are you sure you want to delete "${category.name}"? This will also deactivate all expense types in this category.`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/expense-master/categories/${category.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Category deleted');
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to delete category');
    }
  };

  // Expense Type handlers
  const openTypeDialog = (type = null, category = null) => {
    if (type) {
      setEditMode(true);
      setTypeForm({
        category_id: type.category_id,
        name: type.name || '',
        description: type.description || '',
        is_active: type.is_active !== false,
        requires_receipt: type.requires_receipt !== false,
        requires_justification: type.requires_justification === true,
        default_limit: type.default_limit || 0,
        policy_guidelines: type.policy_guidelines || ''
      });
      setRoleLimits(type.role_limits || []);
      setSelectedType(type);
    } else {
      setEditMode(false);
      setTypeForm({
        category_id: category?.id || '',
        name: '',
        description: '',
        is_active: true,
        requires_receipt: true,
        requires_justification: false,
        default_limit: 0,
        policy_guidelines: ''
      });
      // Initialize role limits with defaults
      setRoleLimits(roles.map(r => ({
        role: r.id,
        max_limit: 0,
        is_allowed: true,
        requires_approval: true,
        approval_threshold: 0
      })));
      setSelectedType(null);
    }
    setShowTypeDialog(true);
  };

  const handleSaveType = async () => {
    if (!typeForm.name.trim()) {
      toast.error('Expense type name is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...typeForm,
        role_limits: roleLimits
      };

      const url = editMode 
        ? `${API_URL}/api/expense-master/types/${selectedType.id}`
        : `${API_URL}/api/expense-master/types`;
      
      const response = await fetch(url, {
        method: editMode ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast.success(`Expense type ${editMode ? 'updated' : 'created'} successfully`);
        setShowTypeDialog(false);
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to save expense type');
      }
    } catch (error) {
      toast.error('Failed to save expense type');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteType = async (type) => {
    if (!window.confirm(`Are you sure you want to delete "${type.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/expense-master/types/${type.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Expense type deleted');
        fetchData();
      }
    } catch (error) {
      toast.error('Failed to delete expense type');
    }
  };

  // Open role limits sheet
  const openRoleLimitsSheet = (type) => {
    setSelectedType(type);
    setRoleLimits(type.role_limits || []);
    setShowRoleLimitsSheet(true);
  };

  const handleSaveRoleLimits = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/expense-master/types/${selectedType.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role_limits: roleLimits })
      });

      if (response.ok) {
        toast.success('Role limits updated');
        setShowRoleLimitsSheet(false);
        fetchData();
      } else {
        toast.error('Failed to update role limits');
      }
    } catch (error) {
      toast.error('Failed to update role limits');
    } finally {
      setSaving(false);
    }
  };

  const updateRoleLimit = (roleId, field, value) => {
    setRoleLimits(prev => prev.map(rl => 
      rl.role === roleId ? { ...rl, [field]: value } : rl
    ));
  };

  // Check if user is admin
  const isAdmin = ['CEO', 'Director', 'System Admin'].includes(user?.role);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="expense-category-master">
      <AppBreadcrumb />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Expense Category Master</h1>
          <p className="text-muted-foreground mt-1">
            Manage expense categories, types, and role-based policies
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {categories.length === 0 && (
              <Button variant="outline" onClick={handleInitialize}>
                <Settings className="h-4 w-4 mr-2" /> Initialize Defaults
              </Button>
            )}
            <Button onClick={() => openCategoryDialog()}>
              <Plus className="h-4 w-4 mr-2" /> Add Category
            </Button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <Briefcase className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-700">{categories.length}</p>
                <p className="text-sm text-blue-600">Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 rounded-lg">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-700">
                  {categories.reduce((sum, c) => sum + (c.expense_types?.length || 0), 0)}
                </p>
                <p className="text-sm text-purple-600">Expense Types</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-green-100/50 border-green-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 rounded-lg">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-700">{roles.length}</p>
                <p className="text-sm text-green-600">Roles Configured</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500 rounded-lg">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">
                  {categories.filter(c => c.is_active).length}
                </p>
                <p className="text-sm text-amber-600">Active Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Categories Accordion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Expense Categories & Types
          </CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg">No expense categories configured</p>
              <p className="text-sm mt-2">Click "Initialize Defaults" to set up standard categories</p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {categories.map((category) => {
                const IconComponent = CATEGORY_ICONS[category.icon] || Briefcase;
                return (
                  <AccordionItem key={category.id} value={category.id}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3 flex-1">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${category.color}20` }}
                        >
                          <IconComponent className="h-5 w-5" style={{ color: category.color }} />
                        </div>
                        <div className="text-left flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{category.name}</span>
                            {!category.is_active && (
                              <Badge variant="secondary" className="text-xs">Inactive</Badge>
                            )}
                            <Badge variant="outline" className="text-xs ml-2">
                              {category.expense_types?.length || 0} types
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {category.description}
                          </p>
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-1 mr-4" onClick={(e) => e.stopPropagation()}>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8"
                              onClick={() => openCategoryDialog(category)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 text-red-500 hover:text-red-700"
                              onClick={() => handleDeleteCategory(category)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pl-12 pr-4 pb-4 space-y-4">
                        {/* Policy Guidelines */}
                        {category.policy_guidelines && (
                          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                            <div className="flex items-center gap-2 text-blue-700 mb-1">
                              <FileText className="h-4 w-4" />
                              <span className="text-xs font-semibold uppercase">Policy Guidelines</span>
                            </div>
                            <p className="text-sm text-blue-800">{category.policy_guidelines}</p>
                          </div>
                        )}

                        {/* Expense Types Table */}
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead>Expense Type</TableHead>
                                <TableHead className="text-center">Default Limit</TableHead>
                                <TableHead className="text-center">Receipt Required</TableHead>
                                <TableHead className="text-center">Justification</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-center">Role Limits</TableHead>
                                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {category.expense_types?.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                    No expense types in this category
                                  </TableCell>
                                </TableRow>
                              ) : (
                                category.expense_types?.map((type) => (
                                  <TableRow key={type.id} className="group">
                                    <TableCell>
                                      <div>
                                        <p className="font-medium">{type.name}</p>
                                        {type.description && (
                                          <p className="text-xs text-muted-foreground">{type.description}</p>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Badge variant="outline" className="font-mono">
                                        {formatCurrency(type.default_limit)}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {type.requires_receipt ? (
                                        <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {type.requires_justification ? (
                                        <CheckCircle className="h-4 w-4 text-amber-500 mx-auto" />
                                      ) : (
                                        <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                                      )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Badge variant={type.is_active ? "default" : "secondary"}>
                                        {type.is_active ? 'Active' : 'Inactive'}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Button 
                                        size="sm" 
                                        variant="outline"
                                        className="h-7 text-xs"
                                        onClick={() => openRoleLimitsSheet(type)}
                                      >
                                        <Users className="h-3 w-3 mr-1" />
                                        {type.role_limits?.length || 0} roles
                                      </Button>
                                    </TableCell>
                                    {isAdmin && (
                                      <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="h-7 w-7"
                                            onClick={() => openTypeDialog(type)}
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="h-7 w-7 text-red-500 hover:text-red-700"
                                            onClick={() => handleDeleteType(type)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Add Type Button */}
                        {isAdmin && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openTypeDialog(null, category)}
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add Expense Type
                          </Button>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editMode ? 'Edit Category' : 'Add Category'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Category Name *</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="e.g., Travel, Accommodation"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Description</Label>
              <Textarea
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Brief description of this category"
                className="mt-1"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Icon</Label>
                <Select 
                  value={categoryForm.icon} 
                  onValueChange={(v) => setCategoryForm({ ...categoryForm, icon: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <SelectItem key={opt.id} value={opt.id}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4" /> {opt.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Color</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={cn(
                        "w-8 h-8 rounded-lg border-2 transition-all",
                        categoryForm.color === color ? "border-gray-800 scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: color }}
                      onClick={() => setCategoryForm({ ...categoryForm, color })}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label>Display Order</Label>
              <Input
                type="number"
                value={categoryForm.display_order}
                onChange={(e) => setCategoryForm({ ...categoryForm, display_order: parseInt(e.target.value) || 0 })}
                className="mt-1 w-24"
              />
            </div>

            <div>
              <Label>Policy Guidelines</Label>
              <Textarea
                value={categoryForm.policy_guidelines}
                onChange={(e) => setCategoryForm({ ...categoryForm, policy_guidelines: e.target.value })}
                placeholder="Enter policy guidelines for this category..."
                className="mt-1"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={categoryForm.is_active}
                onCheckedChange={(v) => setCategoryForm({ ...categoryForm, is_active: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveCategory} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {editMode ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense Type Dialog */}
      <Dialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editMode ? 'Edit Expense Type' : 'Add Expense Type'}</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="role-limits">Role Limits</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4 mt-4">
              <div>
                <Label>Expense Type Name *</Label>
                <Input
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  placeholder="e.g., Domestic Flight, Hotel Stay"
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label>Description</Label>
                <Textarea
                  value={typeForm.description}
                  onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                  placeholder="Brief description"
                  className="mt-1"
                  rows={2}
                />
              </div>

              <div>
                <Label>Default Limit (₹)</Label>
                <Input
                  type="number"
                  value={typeForm.default_limit}
                  onChange={(e) => setTypeForm({ ...typeForm, default_limit: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-40"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This is the base limit. Role-specific limits can override this.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label className="text-sm">Receipt Required</Label>
                      <p className="text-xs text-muted-foreground">Must attach receipt</p>
                    </div>
                  </div>
                  <Switch
                    checked={typeForm.requires_receipt}
                    onCheckedChange={(v) => setTypeForm({ ...typeForm, requires_receipt: v })}
                  />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label className="text-sm">Justification Required</Label>
                      <p className="text-xs text-muted-foreground">Must provide reason</p>
                    </div>
                  </div>
                  <Switch
                    checked={typeForm.requires_justification}
                    onCheckedChange={(v) => setTypeForm({ ...typeForm, requires_justification: v })}
                  />
                </div>
              </div>

              <div>
                <Label>Policy Guidelines</Label>
                <Textarea
                  value={typeForm.policy_guidelines}
                  onChange={(e) => setTypeForm({ ...typeForm, policy_guidelines: e.target.value })}
                  placeholder="Specific guidelines for this expense type..."
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <Label>Active</Label>
                <Switch
                  checked={typeForm.is_active}
                  onCheckedChange={(v) => setTypeForm({ ...typeForm, is_active: v })}
                />
              </div>
            </TabsContent>

            <TabsContent value="role-limits" className="mt-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-4">
                  Configure limits and permissions for each role. Leave limit at 0 to use default.
                </p>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Role</TableHead>
                        <TableHead className="text-center">Allowed</TableHead>
                        <TableHead className="text-center">Max Limit (₹)</TableHead>
                        <TableHead className="text-center">Needs Approval</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roleLimits.map((rl) => {
                        const role = roles.find(r => r.id === rl.role);
                        return (
                          <TableRow key={rl.role}>
                            <TableCell className="font-medium">{role?.name || rl.role}</TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={rl.is_allowed}
                                onCheckedChange={(v) => updateRoleLimit(rl.role, 'is_allowed', v)}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                value={rl.max_limit}
                                onChange={(e) => updateRoleLimit(rl.role, 'max_limit', parseFloat(e.target.value) || 0)}
                                className="w-28 mx-auto text-center"
                                disabled={!rl.is_allowed}
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={rl.requires_approval}
                                onCheckedChange={(v) => updateRoleLimit(rl.role, 'requires_approval', v)}
                                disabled={!rl.is_allowed}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowTypeDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveType} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {editMode ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Limits Sheet */}
      <Sheet open={showRoleLimitsSheet} onOpenChange={setShowRoleLimitsSheet}>
        <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Role-Based Limits: {selectedType?.name}
            </SheetTitle>
          </SheetHeader>

          <div className="py-6 space-y-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm">
                <span className="font-medium">Default Limit:</span>{' '}
                {formatCurrency(selectedType?.default_limit)}
              </p>
            </div>

            <div className="space-y-3">
              {roleLimits.map((rl) => {
                const role = roles.find(r => r.id === rl.role);
                return (
                  <div 
                    key={rl.role} 
                    className={cn(
                      "p-4 border rounded-lg transition-all",
                      rl.is_allowed ? "bg-white" : "bg-gray-50 opacity-60"
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center",
                          rl.is_allowed ? "bg-green-100" : "bg-gray-100"
                        )}>
                          <Users className={cn("h-4 w-4", rl.is_allowed ? "text-green-600" : "text-gray-400")} />
                        </div>
                        <span className="font-medium">{role?.name || rl.role}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Allowed</span>
                        <Switch
                          checked={rl.is_allowed}
                          onCheckedChange={(v) => updateRoleLimit(rl.role, 'is_allowed', v)}
                        />
                      </div>
                    </div>
                    
                    {rl.is_allowed && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Max Limit (₹)</Label>
                          <Input
                            type="number"
                            value={rl.max_limit}
                            onChange={(e) => updateRoleLimit(rl.role, 'max_limit', parseFloat(e.target.value) || 0)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Approval Threshold (₹)</Label>
                          <Input
                            type="number"
                            value={rl.approval_threshold || 0}
                            onChange={(e) => updateRoleLimit(rl.role, 'approval_threshold', parseFloat(e.target.value) || 0)}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowRoleLimitsSheet(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleSaveRoleLimits} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Limits
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
