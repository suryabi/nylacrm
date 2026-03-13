import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { 
  Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronUp, 
  Target, Star, Lightbulb, Tractor, HelpCircle, Settings,
  Loader2, RefreshCw
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Quadrant info for display
const QUADRANT_INFO = {
  'Stars': {
    icon: Star,
    color: 'bg-yellow-500',
    textColor: 'text-yellow-600',
    bgLight: 'bg-yellow-50 dark:bg-yellow-900/20',
    description: 'High Volume + High Margin - Luxury Hotels, Premium Restaurants'
  },
  'Showcase': {
    icon: Lightbulb,
    color: 'bg-purple-500',
    textColor: 'text-purple-600',
    bgLight: 'bg-purple-50 dark:bg-purple-900/20',
    description: 'Low Volume + High Brand Visibility - Chef Restaurants, Influential Dining'
  },
  'Plough Horses': {
    icon: Tractor,
    color: 'bg-blue-500',
    textColor: 'text-blue-600',
    bgLight: 'bg-blue-50 dark:bg-blue-900/20',
    description: 'High Volume + Low Margin - Beach Clubs, Chains, High Footfall'
  },
  'Puzzles': {
    icon: HelpCircle,
    color: 'bg-gray-500',
    textColor: 'text-gray-600',
    bgLight: 'bg-gray-50 dark:bg-gray-900/20',
    description: 'Low Volume + Low Margin - Small Cafés, Low-Impact Accounts'
  }
};

export default function LeadScoringModel() {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingTier, setEditingTier] = useState(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [portfolioData, setPortfolioData] = useState(null);
  const [activeTab, setActiveTab] = useState('config'); // 'config' | 'matrix'

  // New category form
  const [newCategory, setNewCategory] = useState({
    name: '',
    description: '',
    weight: 0,
    is_numeric: false
  });

  // New tier form
  const [newTier, setNewTier] = useState({
    label: '',
    description: '',
    score: 0,
    min_value: null,
    max_value: null
  });
  const [addingTierTo, setAddingTierTo] = useState(null);

  const fetchModel = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/api/scoring/model`);
      setModel(res.data);
      // Expand all categories by default
      const expanded = {};
      (res.data.categories || []).forEach(cat => {
        expanded[cat.id] = true;
      });
      setExpandedCategories(expanded);
    } catch (err) {
      console.error('Error fetching scoring model:', err);
      toast.error('Failed to load scoring model');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPortfolioData = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/scoring/portfolio-matrix`);
      setPortfolioData(res.data);
    } catch (err) {
      console.error('Error fetching portfolio data:', err);
    }
  }, []);

  useEffect(() => {
    fetchModel();
    fetchPortfolioData();
  }, [fetchModel, fetchPortfolioData]);

  // Category CRUD
  const handleAddCategory = async () => {
    if (!newCategory.name || newCategory.weight <= 0) {
      toast.error('Please fill in category name and weight');
      return;
    }

    try {
      setSaving(true);
      await axios.post(`${API}/api/scoring/categories`, newCategory);
      toast.success('Category added');
      setNewCategory({ name: '', description: '', weight: 0, is_numeric: false });
      setShowAddCategory(false);
      fetchModel();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add category');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCategory = async (categoryId, updates) => {
    try {
      setSaving(true);
      await axios.put(`${API}/api/scoring/categories/${categoryId}`, updates);
      toast.success('Category updated');
      setEditingCategory(null);
      fetchModel();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update category');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm('Are you sure you want to delete this category? All tiers will also be deleted.')) {
      return;
    }

    try {
      setSaving(true);
      await axios.delete(`${API}/api/scoring/categories/${categoryId}`);
      toast.success('Category deleted');
      fetchModel();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete category');
    } finally {
      setSaving(false);
    }
  };

  // Tier CRUD
  const handleAddTier = async (categoryId) => {
    if (!newTier.label || newTier.score < 0) {
      toast.error('Please fill in tier label and score');
      return;
    }

    try {
      setSaving(true);
      await axios.post(`${API}/api/scoring/categories/${categoryId}/tiers`, newTier);
      toast.success('Tier added');
      setNewTier({ label: '', description: '', score: 0, min_value: null, max_value: null });
      setAddingTierTo(null);
      fetchModel();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add tier');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTier = async (categoryId, tierId, updates) => {
    try {
      setSaving(true);
      await axios.put(`${API}/api/scoring/categories/${categoryId}/tiers/${tierId}`, updates);
      toast.success('Tier updated');
      setEditingTier(null);
      fetchModel();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update tier');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTier = async (categoryId, tierId) => {
    if (!window.confirm('Are you sure you want to delete this tier?')) {
      return;
    }

    try {
      setSaving(true);
      await axios.delete(`${API}/api/scoring/categories/${categoryId}/tiers/${tierId}`);
      toast.success('Tier deleted');
      fetchModel();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete tier');
    } finally {
      setSaving(false);
    }
  };

  // Seed default model
  const handleSeedDefault = async () => {
    if (!window.confirm('This will create default scoring categories. Continue?')) {
      return;
    }

    try {
      setSaving(true);
      await axios.post(`${API}/api/scoring/seed-default-model`);
      toast.success('Default scoring model created');
      fetchModel();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to seed default model');
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const remainingWeight = 100 - (model?.total_weight || 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="lead-scoring-model-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Lead Scoring Model
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure scoring categories and tiers for account evaluation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={fetchModel}
            disabled={saving}
            data-testid="refresh-model-btn"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          {(!model?.categories || model.categories.length === 0) && (
            <Button
              onClick={handleSeedDefault}
              disabled={saving}
              data-testid="seed-default-btn"
            >
              <Settings className="w-4 h-4 mr-2" />
              Load Default Model
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('config')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'config'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="config-tab"
        >
          Configuration
        </button>
        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'matrix'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          data-testid="matrix-tab"
        >
          Portfolio Matrix
        </button>
      </div>

      {activeTab === 'config' ? (
        <>
          {/* Weight Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Total Weight Used</span>
                    <span className="font-medium">{model?.total_weight || 0} / 100</span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        (model?.total_weight || 0) === 100 ? 'bg-green-500' : 'bg-primary'
                      }`}
                      style={{ width: `${model?.total_weight || 0}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Remaining: </span>
                  <span className={`font-semibold ${remainingWeight > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {remainingWeight} points
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Categories */}
          <div className="space-y-4">
            {(model?.categories || []).sort((a, b) => a.order - b.order).map((category) => (
              <Card key={category.id} data-testid={`category-card-${category.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div 
                      className="flex-1 cursor-pointer"
                      onClick={() => toggleCategory(category.id)}
                    >
                      <div className="flex items-center gap-2">
                        {expandedCategories[category.id] ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                        <CardTitle className="text-lg">{category.name}</CardTitle>
                        <span className="px-2 py-0.5 bg-primary/10 text-primary text-sm rounded-full font-semibold">
                          {category.weight} pts
                        </span>
                        {category.is_numeric && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full">
                            Numeric
                          </span>
                        )}
                      </div>
                      {category.description && (
                        <CardDescription className="mt-1 ml-6">
                          {category.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingCategory(category)}
                        data-testid={`edit-category-${category.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteCategory(category.id)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`delete-category-${category.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {expandedCategories[category.id] && (
                  <CardContent>
                    {/* Tiers */}
                    <div className="space-y-2">
                      {(category.tiers || []).sort((a, b) => b.score - a.score).map((tier) => (
                        <div 
                          key={tier.id}
                          className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                          data-testid={`tier-${tier.id}`}
                        >
                          {editingTier?.id === tier.id ? (
                            <EditTierForm
                              tier={editingTier}
                              maxScore={category.weight}
                              onSave={(updates) => handleUpdateTier(category.id, tier.id, updates)}
                              onCancel={() => setEditingTier(null)}
                              saving={saving}
                            />
                          ) : (
                            <>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{tier.label}</span>
                                  <span className="px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded-full">
                                    {tier.score} pts
                                  </span>
                                </div>
                                {tier.description && (
                                  <p className="text-sm text-muted-foreground mt-0.5">
                                    {tier.description}
                                  </p>
                                )}
                                {(tier.min_value !== null || tier.max_value !== null) && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Range: {tier.min_value ?? '∞'} - {tier.max_value ?? '∞'}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setEditingTier(tier)}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteTier(category.id, tier.id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}

                      {/* Add Tier Form */}
                      {addingTierTo === category.id ? (
                        <div className="p-3 border border-dashed border-border rounded-lg space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <Input
                              placeholder="Tier Label (e.g., >5000)"
                              value={newTier.label}
                              onChange={(e) => setNewTier({ ...newTier, label: e.target.value })}
                              data-testid="new-tier-label"
                            />
                            <Input
                              type="number"
                              placeholder={`Score (max ${category.weight})`}
                              value={newTier.score || ''}
                              onChange={(e) => setNewTier({ ...newTier, score: parseInt(e.target.value) || 0 })}
                              max={category.weight}
                              data-testid="new-tier-score"
                            />
                          </div>
                          <Input
                            placeholder="Description (optional)"
                            value={newTier.description || ''}
                            onChange={(e) => setNewTier({ ...newTier, description: e.target.value })}
                            data-testid="new-tier-description"
                          />
                          {category.is_numeric && (
                            <div className="grid grid-cols-2 gap-3">
                              <Input
                                type="number"
                                placeholder="Min Value"
                                value={newTier.min_value ?? ''}
                                onChange={(e) => setNewTier({ ...newTier, min_value: e.target.value ? parseFloat(e.target.value) : null })}
                              />
                              <Input
                                type="number"
                                placeholder="Max Value"
                                value={newTier.max_value ?? ''}
                                onChange={(e) => setNewTier({ ...newTier, max_value: e.target.value ? parseFloat(e.target.value) : null })}
                              />
                            </div>
                          )}
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAddingTierTo(null);
                                setNewTier({ label: '', description: '', score: 0, min_value: null, max_value: null });
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleAddTier(category.id)}
                              disabled={saving}
                              data-testid="save-new-tier-btn"
                            >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                              Add Tier
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-2"
                          onClick={() => setAddingTierTo(category.id)}
                          data-testid={`add-tier-to-${category.id}`}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Tier
                        </Button>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}

            {/* Add Category */}
            {showAddCategory ? (
              <Card data-testid="add-category-form">
                <CardHeader>
                  <CardTitle className="text-lg">Add New Category</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      placeholder="Category Name"
                      value={newCategory.name}
                      onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                      data-testid="new-category-name"
                    />
                    <Input
                      type="number"
                      placeholder={`Weight (max ${remainingWeight})`}
                      value={newCategory.weight || ''}
                      onChange={(e) => setNewCategory({ ...newCategory, weight: parseInt(e.target.value) || 0 })}
                      max={remainingWeight}
                      data-testid="new-category-weight"
                    />
                  </div>
                  <Input
                    placeholder="Description (optional)"
                    value={newCategory.description || ''}
                    onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                    data-testid="new-category-description"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newCategory.is_numeric}
                      onChange={(e) => setNewCategory({ ...newCategory, is_numeric: e.target.checked })}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-muted-foreground">
                      Numeric category (uses min/max values for tiers)
                    </span>
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowAddCategory(false);
                        setNewCategory({ name: '', description: '', weight: 0, is_numeric: false });
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddCategory}
                      disabled={saving}
                      data-testid="save-new-category-btn"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                      Add Category
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowAddCategory(true)}
                disabled={remainingWeight <= 0}
                data-testid="add-category-btn"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Category
                {remainingWeight <= 0 && <span className="ml-2 text-muted-foreground">(Weight limit reached)</span>}
              </Button>
            )}
          </div>
        </>
      ) : (
        /* Portfolio Matrix View */
        <div className="space-y-6">
          {/* Matrix Visualization */}
          <Card>
            <CardHeader>
              <CardTitle>Sales Portfolio Matrix</CardTitle>
              <CardDescription>
                Every account must contribute to either revenue, market scale, or brand influence
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 aspect-square max-w-2xl mx-auto">
                {/* Showcase - Top Left */}
                <QuadrantCard
                  quadrant="Showcase"
                  accounts={portfolioData?.matrix?.Showcase || []}
                  position="top-left"
                />
                {/* Stars - Top Right */}
                <QuadrantCard
                  quadrant="Stars"
                  accounts={portfolioData?.matrix?.Stars || []}
                  position="top-right"
                />
                {/* Puzzles - Bottom Left */}
                <QuadrantCard
                  quadrant="Puzzles"
                  accounts={portfolioData?.matrix?.Puzzles || []}
                  position="bottom-left"
                />
                {/* Plough Horses - Bottom Right */}
                <QuadrantCard
                  quadrant="Plough Horses"
                  accounts={portfolioData?.matrix?.['Plough Horses'] || []}
                  position="bottom-right"
                />
              </div>

              {/* Axis Labels */}
              <div className="flex justify-center mt-4">
                <span className="text-sm font-medium text-muted-foreground">
                  VOLUME POTENTIAL →
                </span>
              </div>
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 origin-center">
                <span className="text-sm font-medium text-muted-foreground">
                  COMMERCIAL VALUE →
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(QUADRANT_INFO).map(([name, info]) => {
              const Icon = info.icon;
              const count = portfolioData?.summary?.[name.toLowerCase().replace(' ', '_')] || 0;
              return (
                <Card key={name} className={info.bgLight}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${info.color}`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{count}</p>
                        <p className="text-sm text-muted-foreground">{name}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
        <EditCategoryModal
          category={editingCategory}
          maxWeight={remainingWeight + editingCategory.weight}
          onSave={(updates) => handleUpdateCategory(editingCategory.id, updates)}
          onCancel={() => setEditingCategory(null)}
          saving={saving}
        />
      )}
    </div>
  );
}

// Edit Category Modal
function EditCategoryModal({ category, maxWeight, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: category.name,
    description: category.description || '',
    weight: category.weight,
    is_numeric: category.is_numeric
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Edit Category</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Category Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            type="number"
            placeholder={`Weight (max ${maxWeight})`}
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: parseInt(e.target.value) || 0 })}
            max={maxWeight}
          />
          <Input
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_numeric}
              onChange={(e) => setForm({ ...form, is_numeric: e.target.checked })}
              className="rounded border-border"
            />
            <span className="text-sm text-muted-foreground">Numeric category</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={() => onSave(form)} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Edit Tier Inline Form
function EditTierForm({ tier, maxScore, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    label: tier.label,
    description: tier.description || '',
    score: tier.score,
    min_value: tier.min_value,
    max_value: tier.max_value
  });

  return (
    <div className="flex-1 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Label"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          className="h-8"
        />
        <Input
          type="number"
          placeholder={`Score (max ${maxScore})`}
          value={form.score}
          onChange={(e) => setForm({ ...form, score: parseInt(e.target.value) || 0 })}
          max={maxScore}
          className="h-8"
        />
      </div>
      <Input
        placeholder="Description"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className="h-8"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="w-4 h-4" />
        </Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}

// Quadrant Card for Matrix View
function QuadrantCard({ quadrant, accounts, position }) {
  const info = QUADRANT_INFO[quadrant];
  const Icon = info.icon;
  
  const positionClasses = {
    'top-left': 'rounded-tl-xl',
    'top-right': 'rounded-tr-xl',
    'bottom-left': 'rounded-bl-xl',
    'bottom-right': 'rounded-br-xl'
  };

  return (
    <div className={`${info.bgLight} p-4 ${positionClasses[position]} border border-border/50`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded ${info.color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className={`font-semibold ${info.textColor}`}>{quadrant}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {accounts.length} accounts
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{info.description}</p>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {accounts.slice(0, 5).map((account) => (
          <div key={account.id} className="text-sm flex justify-between">
            <span className="truncate">{account.account_name}</span>
            <span className="text-muted-foreground ml-2">{account.total_score}</span>
          </div>
        ))}
        {accounts.length > 5 && (
          <p className="text-xs text-muted-foreground">+{accounts.length - 5} more</p>
        )}
        {accounts.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No accounts yet</p>
        )}
      </div>
    </div>
  );
}
