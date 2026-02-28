import React, { useEffect, useState } from 'react';
import { skusAPI } from '../utils/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  Package, Plus, Pencil, Trash2, Loader2, Save, X, 
  Search, Filter, ArrowUpDown, Check
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';

const categoryColors = {
  'Jar': 'bg-blue-100 text-blue-800',
  'Bottle': 'bg-green-100 text-green-800',
  'Can': 'bg-yellow-100 text-yellow-800',
  'Premium': 'bg-purple-100 text-purple-800',
  'Sparkling': 'bg-cyan-100 text-cyan-800',
  'White Label': 'bg-orange-100 text-orange-800',
};

export default function SKUManagement() {
  const [skus, setSkus] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingSku, setEditingSku] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    sku_name: '',
    category: '',
    unit: '',
    description: '',
    is_active: true,
    sort_order: 0
  });

  useEffect(() => {
    fetchSkus();
    fetchCategories();
  }, [showInactive]);

  const fetchSkus = async () => {
    setLoading(true);
    try {
      const response = await skusAPI.getMasterList(showInactive);
      setSkus(response.data.skus || []);
    } catch (error) {
      toast.error('Failed to load SKUs');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await skusAPI.getCategories();
      setCategories(response.data.categories || []);
    } catch (error) {
      console.log('Could not load categories');
    }
  };

  const handleOpenCreate = () => {
    setEditingSku(null);
    setFormData({
      sku_name: '',
      category: '',
      unit: '',
      description: '',
      is_active: true,
      sort_order: skus.length + 1
    });
    setShowModal(true);
  };

  const handleOpenEdit = (sku) => {
    setEditingSku(sku);
    setFormData({
      sku_name: sku.sku_name || sku.sku,
      category: sku.category || '',
      unit: sku.unit || '',
      description: sku.description || '',
      is_active: sku.is_active !== false,
      sort_order: sku.sort_order || 0
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.sku_name.trim()) {
      toast.error('SKU name is required');
      return;
    }
    if (!formData.category.trim()) {
      toast.error('Category is required');
      return;
    }
    if (!formData.unit.trim()) {
      toast.error('Unit is required');
      return;
    }

    setSaving(true);
    try {
      if (editingSku) {
        await skusAPI.update(editingSku.id, formData);
        toast.success('SKU updated successfully');
      } else {
        await skusAPI.create(formData);
        toast.success('SKU created successfully');
      }
      setShowModal(false);
      fetchSkus();
      fetchCategories();
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to save SKU';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sku) => {
    if (!window.confirm(`Are you sure you want to deactivate "${sku.sku_name || sku.sku}"?`)) {
      return;
    }

    try {
      await skusAPI.delete(sku.id);
      toast.success('SKU deactivated');
      fetchSkus();
    } catch (error) {
      toast.error('Failed to deactivate SKU');
    }
  };

  const handleReactivate = async (sku) => {
    try {
      await skusAPI.update(sku.id, { is_active: true });
      toast.success('SKU reactivated');
      fetchSkus();
    } catch (error) {
      toast.error('Failed to reactivate SKU');
    }
  };

  // Filter SKUs
  const filteredSkus = skus.filter(sku => {
    const name = (sku.sku_name || sku.sku || '').toLowerCase();
    const matchesSearch = name.includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || sku.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Group by category for display
  const groupedSkus = filteredSkus.reduce((acc, sku) => {
    const cat = sku.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(sku);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="sku-management-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/50 dark:to-amber-900/30">
            <Package className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">SKU Management</h1>
            <p className="text-muted-foreground">Manage your product catalog and SKU master list</p>
          </div>
        </div>
        <Button onClick={handleOpenCreate} data-testid="create-sku-btn" className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-200/50 dark:shadow-orange-900/30">
          <Plus className="h-4 w-4 mr-2" />
          Add New SKU
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search SKUs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-slate-200 dark:border-slate-700"
                data-testid="search-sku-input"
              />
            </div>
          </div>
          
          <div className="w-[180px]">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger data-testid="filter-category-select">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={showInactive}
              onCheckedChange={setShowInactive}
              data-testid="show-inactive-toggle"
            />
            <Label className="text-sm cursor-pointer" onClick={() => setShowInactive(!showInactive)}>
              Show Inactive
            </Label>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total SKUs</p>
          <p className="text-2xl font-semibold">{skus.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="text-2xl font-semibold text-green-600">
            {skus.filter(s => s.is_active !== false).length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Categories</p>
          <p className="text-2xl font-semibold">{categories.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Filtered</p>
          <p className="text-2xl font-semibold">{filteredSkus.length}</p>
        </Card>
      </div>

      {/* SKU List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredSkus.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium mb-2">No SKUs Found</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm || filterCategory !== 'all' 
              ? 'Try adjusting your search or filters'
              : 'Get started by adding your first SKU'}
          </p>
          {!searchTerm && filterCategory === 'all' && (
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add First SKU
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedSkus).sort(([a], [b]) => a.localeCompare(b)).map(([category, categorySkus]) => (
            <Card key={category} className="overflow-hidden">
              <div className="bg-muted/50 px-4 py-3 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={categoryColors[category] || 'bg-gray-100 text-gray-800'}>
                      {category}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {categorySkus.length} SKU{categorySkus.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
              <div className="divide-y">
                {categorySkus.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(sku => (
                  <div 
                    key={sku.id} 
                    className={`px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors ${
                      sku.is_active === false ? 'opacity-50 bg-red-50/30' : ''
                    }`}
                    data-testid={`sku-row-${sku.id}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{sku.sku_name || sku.sku}</span>
                        {sku.is_active === false && (
                          <Badge variant="outline" className="text-red-600 border-red-300">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span>Unit: {sku.unit}</span>
                        {sku.description && <span>• {sku.description}</span>}
                        <span className="text-xs">Order: {sku.sort_order}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {sku.is_active === false ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReactivate(sku)}
                          className="text-green-600"
                          data-testid={`reactivate-sku-${sku.id}`}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Reactivate
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleOpenEdit(sku)}
                            data-testid={`edit-sku-${sku.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(sku)}
                            className="text-red-500 hover:text-red-700"
                            data-testid={`delete-sku-${sku.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingSku ? 'Edit SKU' : 'Create New SKU'}
            </DialogTitle>
            <DialogDescription>
              {editingSku 
                ? 'Update the SKU details below'
                : 'Add a new SKU to your product catalog'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sku_name">SKU Name *</Label>
              <Input
                id="sku_name"
                value={formData.sku_name}
                onChange={(e) => setFormData({ ...formData, sku_name: e.target.value })}
                placeholder="e.g., 20L Premium"
                data-testid="sku-name-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger data-testid="sku-category-select">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Add New Category</SelectItem>
                  </SelectContent>
                </Select>
                {formData.category === '__new__' && (
                  <Input
                    placeholder="Enter new category"
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="mt-2"
                    data-testid="new-category-input"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit">Unit *</Label>
                <Input
                  id="unit"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  placeholder="e.g., 20L, 600ml"
                  data-testid="sku-unit-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                data-testid="sku-description-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  data-testid="sku-sort-order-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    data-testid="sku-active-toggle"
                  />
                  <span className="text-sm">{formData.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="save-sku-btn">
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" /> {editingSku ? 'Update' : 'Create'}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
