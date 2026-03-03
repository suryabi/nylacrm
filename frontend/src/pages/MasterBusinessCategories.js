import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  GripVertical, 
  Loader2, 
  Building2,
  Store,
  Hotel,
  UtensilsCrossed,
  Building,
  Hospital,
  GraduationCap,
  Factory,
  Briefcase,
  MoreHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const COLOR_OPTIONS = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'green', label: 'Green', class: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-100 text-purple-800 border-purple-200' },
  { value: 'cyan', label: 'Cyan', class: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  { value: 'orange', label: 'Orange', class: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 'indigo', label: 'Indigo', class: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { value: 'emerald', label: 'Emerald', class: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'red', label: 'Red', class: 'bg-red-100 text-red-800 border-red-200' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-100 text-gray-800 border-gray-200' },
  { value: 'pink', label: 'Pink', class: 'bg-pink-100 text-pink-800 border-pink-200' },
  { value: 'teal', label: 'Teal', class: 'bg-teal-100 text-teal-800 border-teal-200' },
];

const ICON_OPTIONS = [
  { value: 'store', label: 'Store', icon: Store },
  { value: 'hotel', label: 'Hotel', icon: Hotel },
  { value: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed },
  { value: 'building', label: 'Building', icon: Building },
  { value: 'hospital', label: 'Hospital', icon: Hospital },
  { value: 'education', label: 'Education', icon: GraduationCap },
  { value: 'factory', label: 'Factory', icon: Factory },
  { value: 'office', label: 'Office', icon: Briefcase },
  { value: 'other', label: 'Other', icon: MoreHorizontal },
];

const getColorClass = (color) => {
  const colorOption = COLOR_OPTIONS.find(c => c.value === color);
  return colorOption?.class || 'bg-gray-100 text-gray-800 border-gray-200';
};

const getIconComponent = (iconName) => {
  const iconOption = ICON_OPTIONS.find(i => i.value === iconName);
  return iconOption?.icon || Building2;
};

export default function MasterBusinessCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    description: '', 
    icon: 'store', 
    color: 'blue' 
  });
  const [saving, setSaving] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/master/business-categories`, {
        withCredentials: true
      });
      setCategories(response.data.categories || []);
    } catch (error) {
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleOpenDialog = (category = null) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        name: category.name,
        description: category.description || '',
        icon: category.icon || 'store',
        color: category.color || 'blue'
      });
    } else {
      setEditingCategory(null);
      setFormData({ name: '', description: '', icon: 'store', color: 'blue' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        await axios.put(
          `${API_URL}/master/business-categories/${editingCategory.id}`,
          formData,
          { withCredentials: true }
        );
        toast.success('Category updated');
      } else {
        await axios.post(
          `${API_URL}/master/business-categories`,
          formData,
          { withCredentials: true }
        );
        toast.success('Category created');
      }
      setDialogOpen(false);
      fetchCategories();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    
    try {
      const response = await axios.delete(
        `${API_URL}/master/business-categories/${categoryToDelete.id}`,
        { withCredentials: true }
      );
      toast.success(response.data.message || 'Category deleted');
      setDeleteDialogOpen(false);
      setCategoryToDelete(null);
      fetchCategories();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete category');
    }
  };

  const handleDragStart = (e, category, index) => {
    setDraggedItem({ category, index });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.index === index) return;
    
    const newCategories = [...categories];
    const [removed] = newCategories.splice(draggedItem.index, 1);
    newCategories.splice(index, 0, removed);
    
    setCategories(newCategories);
    setDraggedItem({ ...draggedItem, index });
  };

  const handleDragEnd = async () => {
    if (!draggedItem) return;
    
    try {
      const categoryIds = categories.map(c => c.id);
      await axios.put(
        `${API_URL}/master/business-categories/reorder`,
        categoryIds,
        { withCredentials: true }
      );
      toast.success('Order saved');
    } catch (error) {
      toast.error('Failed to save order');
      fetchCategories();
    }
    setDraggedItem(null);
  };

  const activeCategories = categories.filter(c => c.is_active !== false);
  const inactiveCategories = categories.filter(c => c.is_active === false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="master-business-categories">
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/50 dark:to-purple-900/30">
                <Building2 className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">
                  Business Categories
                </h1>
                <p className="text-muted-foreground">
                  Manage categories for leads and accounts
                </p>
              </div>
            </div>
            <Button 
              onClick={() => handleOpenDialog()}
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-lg"
              data-testid="add-category-btn"
            >
              <Plus className="h-4 w-4 mr-2" /> Add Category
            </Button>
          </div>
        </header>

        {/* Categories List */}
        <Card className="overflow-hidden border-0 shadow-xl">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center p-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No categories yet</h3>
              <p className="text-muted-foreground mb-4">Create your first business category</p>
              <Button onClick={() => handleOpenDialog()} variant="outline">
                <Plus className="h-4 w-4 mr-2" /> Add Category
              </Button>
            </div>
          ) : (
            <>
              {/* Active Categories */}
              <div className="p-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-3 px-2">
                  Active Categories ({activeCategories.length})
                </h3>
                <div className="space-y-2">
                  {activeCategories.map((category, index) => {
                    const IconComponent = getIconComponent(category.icon);
                    return (
                      <div
                        key={category.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, category, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all cursor-move group"
                        data-testid={`category-${category.id}`}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground" />
                        
                        <div className={`p-2 rounded-lg ${getColorClass(category.color).replace('text-', 'bg-').split(' ')[0]}/20`}>
                          <IconComponent className={`h-5 w-5 ${getColorClass(category.color).split(' ')[1]}`} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800 dark:text-white">
                              {category.name}
                            </span>
                            <Badge className={`${getColorClass(category.color)} border text-xs`}>
                              {category.color}
                            </Badge>
                          </div>
                          {category.description && (
                            <p className="text-sm text-muted-foreground truncate">
                              {category.description}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleOpenDialog(category)}
                            className="h-8 w-8"
                            data-testid={`edit-category-${category.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setCategoryToDelete(category);
                              setDeleteDialogOpen(true);
                            }}
                            className="h-8 w-8 text-red-500 hover:text-red-700"
                            data-testid={`delete-category-${category.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Inactive Categories */}
              {inactiveCategories.length > 0 && (
                <div className="p-4 border-t border-dashed">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 px-2">
                    Inactive Categories ({inactiveCategories.length})
                  </h3>
                  <div className="space-y-2 opacity-60">
                    {inactiveCategories.map((category) => {
                      const IconComponent = getIconComponent(category.icon);
                      return (
                        <div
                          key={category.id}
                          className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-700"
                        >
                          <div className={`p-2 rounded-lg bg-slate-100 dark:bg-slate-700`}>
                            <IconComponent className="h-5 w-5 text-slate-400" />
                          </div>
                          <div className="flex-1">
                            <span className="font-medium text-slate-500">
                              {category.name}
                            </span>
                            <Badge variant="outline" className="ml-2 text-xs">
                              Inactive
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenDialog(category)}
                          >
                            Reactivate
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Category Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Restaurant, Star Hotel"
                  data-testid="category-name-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this category"
                  rows={2}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Icon</Label>
                  <Select
                    value={formData.icon}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, icon: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ICON_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {option.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Color</Label>
                  <Select
                    value={formData.color}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, color: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${option.class.split(' ')[0]}`} />
                            {option.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Preview */}
              <div className="pt-4 border-t">
                <Label className="text-muted-foreground text-xs">Preview</Label>
                <div className="mt-2 flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  {(() => {
                    const IconComponent = getIconComponent(formData.icon);
                    return (
                      <>
                        <div className={`p-2 rounded-lg ${getColorClass(formData.color).replace('text-', 'bg-').split(' ')[0]}/20`}>
                          <IconComponent className={`h-5 w-5 ${getColorClass(formData.color).split(' ')[1]}`} />
                        </div>
                        <span className="font-medium">{formData.name || 'Category Name'}</span>
                        <Badge className={`${getColorClass(formData.color)} border text-xs ml-auto`}>
                          {formData.color}
                        </Badge>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} data-testid="save-category-btn">
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingCategory ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Category?</AlertDialogTitle>
              <AlertDialogDescription>
                {categoryToDelete?.name && (
                  <>
                    Are you sure you want to delete "{categoryToDelete.name}"? 
                    If this category is in use by leads, it will be deactivated instead.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
