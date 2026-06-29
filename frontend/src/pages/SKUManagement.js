import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { skusAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { DecimalInput } from '../components/ui/decimal-input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { 
  Package, Plus, Pencil, Trash2, Loader2, Save, X, 
  Search, Filter, ArrowUpDown, Check, RefreshCcw, Link2
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

// Packaging is now defined ONCE per SKU in a "Packaging Master". Each flow is
// just an allow-list (with one default) that references master packs — units
// always come from the master so they can never drift across flows.
const PKG_FLOWS = [
  { key: 'production', label: 'Production' },
  { key: 'stock_in', label: 'Stock In' },
  { key: 'stock_out', label: 'Stock Out' },
  { key: 'promo_stock_out', label: 'Promo' },
];

// Union of all packs referenced anywhere → the canonical SKU packaging master.
const derivePkgMaster = (pc) => {
  const seen = new Map();
  (pc?.master || []).forEach((m) => {
    if (m.packaging_type_id && !seen.has(m.packaging_type_id))
      seen.set(m.packaging_type_id, { packaging_type_id: m.packaging_type_id, packaging_type_name: m.packaging_type_name, units_per_package: m.units_per_package });
  });
  PKG_FLOWS.forEach(({ key }) => (pc?.[key] || []).forEach((it) => {
    if (it.packaging_type_id && !seen.has(it.packaging_type_id))
      seen.set(it.packaging_type_id, { packaging_type_id: it.packaging_type_id, packaging_type_name: it.packaging_type_name, units_per_package: it.units_per_package });
  }));
  return Array.from(seen.values());
};

const normalizePkgConfig = (raw) => {
  const pc = raw || {};
  const out = { master: derivePkgMaster(pc) };
  PKG_FLOWS.forEach(({ key }) => { out[key] = (pc[key] || []).map((it) => ({ ...it })); });
  return out;
};

export default function SKUManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canHardDelete = ['CEO', 'Admin', 'System Admin'].includes(user?.role);
  const [skus, setSkus] = useState([]);
  const [categories, setCategories] = useState([]);
  const [packagingTypes, setPackagingTypes] = useState([]);
  const [cogsComponents, setCogsComponents] = useState([]);
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
    external_sku_id: '',
    category: '',
    unit: '',
    base_uom: 'Bottle',
    description: '',
    hsn_code: '',
    base_price: '',
    mrp: '',
    standard_price: '',
    return_bottle_credit: '',
    allow_custom_mrp: false,
    is_active: true,
    sort_order: 0,
    packaging_config: { master: [], production: [], stock_in: [], stock_out: [], promo_stock_out: [] },
    cogs_components_values: {},
  });

  const API_URL = process.env.REACT_APP_BACKEND_URL;
  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

  // ── Rehydrate denormalised SKU names across all transactional collections.
  // Used as a one-shot tool after a bulk SKU rename to refresh stale labels in
  // stock rows, deliveries, returns, transfers, invoices, etc. New renames are
  // already handled by an auto-rehydration hook on PUT /master-skus/{id}.
  const [rehydrating, setRehydrating] = useState(false);
  const handleRehydrateSkuNames = async () => {
    if (!window.confirm("This will refresh every saved SKU name across stock, deliveries, returns, transfers, invoices and reports to match the current Master SKU list. Continue?")) return;
    setRehydrating(true);
    try {
      const res = await axios.post(`${API_URL}/api/admin/migrations/sku/rehydrate-sku-names?dry_run=false`, {}, { headers: getHeaders() });
      const t = res.data?.totals || {};
      toast.success(`Rehydrated ${t.updated || 0} stale SKU labels across ${t.collections_touched || 0} collections.`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Rehydration failed. Check console.');
    } finally {
      setRehydrating(false);
    }
  };

  useEffect(() => {
    fetchSkus();
    fetchCategories();
    fetchPackagingTypes();
    fetchCogsComponents();
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

  const fetchPackagingTypes = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/packaging-types`, { headers: getHeaders() });
      setPackagingTypes(res.data.packaging_types || []);
    } catch { /* ignore */ }
  };

  const fetchCogsComponents = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/master/cogs-components?is_active=true`, { headers: getHeaders() });
      const items = (res.data?.components || [])
        .filter((c) => c.unit === 'rupee')
        .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
      setCogsComponents(items);
    } catch { /* ignore */ }
  };

  const handleOpenCreate = () => {
    setEditingSku(null);
    setFormData({
      sku_name: '', external_sku_id: '', category: '', unit: '', base_uom: 'Bottle', description: '',
      hsn_code: '',
      base_price: '',
      mrp: '',
      standard_price: '',
      return_bottle_credit: '',
      allow_custom_mrp: false,
      is_active: true, sort_order: skus.length + 1,
      packaging_config: { master: [], production: [], stock_in: [], stock_out: [], promo_stock_out: [] },
      cogs_components_values: {},
    });
    setShowModal(true);
  };

  const handleOpenEdit = (sku) => {
    setEditingSku(sku);
    setFormData({
      sku_name: sku.sku_name || sku.sku,
      external_sku_id: sku.external_sku_id || '',
      category: sku.category || '',
      unit: sku.unit || '',
      base_uom: sku.base_uom || 'Bottle',
      description: sku.description || '',
      hsn_code: sku.hsn_code || '',
      base_price: sku.base_price != null ? String(sku.base_price) : '',
      mrp: sku.mrp != null ? String(sku.mrp) : '',
      standard_price: sku.standard_price != null ? String(sku.standard_price) : '',
      return_bottle_credit: sku.return_bottle_credit != null ? String(sku.return_bottle_credit) : '',
      allow_custom_mrp: !!sku.allow_custom_mrp,
      is_active: sku.is_active !== false,
      sort_order: sku.sort_order || 0,
      packaging_config: normalizePkgConfig(sku.packaging_config),
      cogs_components_values: sku.cogs_components_values || {},
    });
    setShowModal(true);
  };

  // ── Packaging Master helpers ──────────────────────────────────────────
  const addPackToMaster = (ptId) => {
    setFormData((prev) => {
      const pc = prev.packaging_config;
      if ((pc.master || []).find((m) => m.packaging_type_id === ptId)) return prev;
      const pt = packagingTypes.find((p) => p.id === ptId);
      if (!pt) return prev;
      const entry = { packaging_type_id: pt.id, packaging_type_name: pt.name, units_per_package: pt.units_per_package };
      return { ...prev, packaging_config: { ...pc, master: [...(pc.master || []), entry] } };
    });
  };

  const removePackFromMaster = (packId) => {
    setFormData((prev) => {
      const pc = prev.packaging_config;
      const next = { ...pc, master: (pc.master || []).filter((m) => m.packaging_type_id !== packId) };
      PKG_FLOWS.forEach(({ key }) => {
        let arr = (pc[key] || []).filter((i) => i.packaging_type_id !== packId);
        if (arr.length > 0 && !arr.find((i) => i.is_default)) arr = arr.map((i, idx) => ({ ...i, is_default: idx === 0 }));
        next[key] = arr;
      });
      return { ...prev, packaging_config: next };
    });
  };

  const togglePackInFlow = (packId, flowKey) => {
    setFormData((prev) => {
      const pc = prev.packaging_config;
      const masterEntry = (pc.master || []).find((m) => m.packaging_type_id === packId);
      if (!masterEntry) return prev;
      let arr = [...(pc[flowKey] || [])];
      const existing = arr.find((i) => i.packaging_type_id === packId);
      if (existing) {
        const wasDefault = existing.is_default;
        arr = arr.filter((i) => i.packaging_type_id !== packId);
        if (wasDefault && arr.length > 0) arr = arr.map((i, idx) => ({ ...i, is_default: idx === 0 }));
      } else {
        arr.push({ ...masterEntry, is_default: arr.length === 0 });
      }
      return { ...prev, packaging_config: { ...pc, [flowKey]: arr } };
    });
  };

  const setFlowDefault = (packId, flowKey) => {
    setFormData((prev) => {
      const pc = prev.packaging_config;
      const arr = (pc[flowKey] || []).map((i) => ({ ...i, is_default: i.packaging_type_id === packId }));
      return { ...prev, packaging_config: { ...pc, [flowKey]: arr } };
    });
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
      // Clean empty values from cogs_components_values; pass null to remove keys
      const cleanedCogs = {};
      Object.entries(formData.cogs_components_values || {}).forEach(([k, v]) => {
        if (v === '' || v === null || v === undefined) return;
        const num = typeof v === 'number' ? v : parseFloat(v);
        if (!isNaN(num)) cleanedCogs[k] = num;
      });
      const payload = { ...formData, cogs_components_values: cleanedCogs };
      // Base UOM defaults to "Bottle" when left blank.
      payload.base_uom = (payload.base_uom || '').trim() || 'Bottle';
      // Coerce hsn_code: trim, store empty string as null so backend doesn't keep stale value
      if (typeof payload.hsn_code === 'string') {
        const trimmed = payload.hsn_code.trim();
        payload.hsn_code = trimmed === '' ? null : trimmed;
      }
      // Coerce base_price → number (or null to clear it)
      if (payload.base_price === '' || payload.base_price === null || payload.base_price === undefined) {
        payload.base_price = null;
      } else {
        const bp = parseFloat(payload.base_price);
        payload.base_price = isNaN(bp) ? null : bp;
      }
      // Coerce mrp → number (or null to clear it)
      if (payload.mrp === '' || payload.mrp === null || payload.mrp === undefined) {
        payload.mrp = null;
      } else {
        const m = parseFloat(payload.mrp);
        payload.mrp = isNaN(m) ? null : m;
      }
      // Coerce standard_price & return_bottle_credit → number (or null)
      ['standard_price', 'return_bottle_credit'].forEach((k) => {
        if (payload[k] === '' || payload[k] === null || payload[k] === undefined) {
          payload[k] = null;
        } else {
          const n = parseFloat(payload[k]);
          payload[k] = isNaN(n) ? null : n;
        }
      });

      if (editingSku) {
        await skusAPI.update(editingSku.id, payload);
        toast.success('SKU updated successfully');
      } else {
        await skusAPI.create(payload);
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

  const handlePermanentDelete = async (sku) => {
    if (!window.confirm(
      `Permanently delete "${sku.sku_name || sku.sku}"?\n\nThis cannot be undone. Historical invoices are not changed, but this SKU will no longer appear in the master list or resolve old line items by its code.`
    )) {
      return;
    }
    try {
      await skusAPI.deletePermanent(sku.id);
      toast.success('SKU permanently deleted');
      fetchSkus();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete SKU');
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/sku-management/relink')}
            data-testid="open-relink-tool-btn"
            title="Bulk-relink Account & Lead pricing rows that point at a renamed-away SKU name."
            className="border-slate-200 dark:border-slate-700"
          >
            <Link2 className="h-4 w-4 mr-2" />
            Re-link orphans
          </Button>
          <Button
            variant="outline"
            onClick={handleRehydrateSkuNames}
            disabled={rehydrating}
            data-testid="rehydrate-sku-names-btn"
            title="Refresh saved SKU labels across stock, deliveries, returns, transfers and reports to match the current SKU master list."
            className="border-slate-200 dark:border-slate-700"
          >
            {rehydrating
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <RefreshCcw className="h-4 w-4 mr-2" />}
            Sync SKU names
          </Button>
          <Button onClick={handleOpenCreate} data-testid="create-sku-btn" className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-200/50 dark:shadow-orange-900/30">
            <Plus className="h-4 w-4 mr-2" />
            Add New SKU
          </Button>
        </div>
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
                        {sku.external_sku_id && (
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/70 dark:bg-indigo-900/20 dark:text-indigo-400"
                            title="External SKU ID — used by integrations"
                            data-testid={`sku-external-id-${sku.id}`}
                          >
                            ext: {sku.external_sku_id}
                          </span>
                        )}
                        {sku.is_active === false && (
                          <Badge variant="outline" className="text-red-600 border-red-300">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span>Unit: {sku.unit}</span>
                        <span>Base UOM: {sku.base_uom || 'Bottle'}</span>
                        {sku.packaging_config && (() => {
                          const prod = (sku.packaging_config.production || []).find(p => p.is_default);
                          return prod ? <span>Prod: {prod.packaging_type_name} ({prod.units_per_package})</span> : null;
                        })()}
                        {sku.description && <span>• {sku.description}</span>}
                        <span className="text-xs">Order: {sku.sort_order}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {sku.is_active === false ? (
                        <>
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
                          {canHardDelete && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePermanentDelete(sku)}
                              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                              data-testid={`permanent-delete-sku-${sku.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          )}
                        </>
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
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-2">
                <Label htmlFor="external_sku_id">External SKU ID</Label>
                <Input
                  id="external_sku_id"
                  value={formData.external_sku_id}
                  onChange={(e) => setFormData({ ...formData, external_sku_id: e.target.value })}
                  placeholder="e.g. ERP-2032 / vendor code"
                  className="font-mono text-sm"
                  data-testid="sku-external-id-input"
                />
                <p className="text-[10px] text-muted-foreground">Used by external systems / integrations to identify this SKU.</p>
              </div>
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
              <div className="space-y-2">
                <Label htmlFor="base_uom">Base Unit of Measure *</Label>
                <Input
                  id="base_uom"
                  value={formData.base_uom}
                  onChange={(e) => setFormData({ ...formData, base_uom: e.target.value })}
                  placeholder="e.g., Bottle"
                  data-testid="sku-base-uom-input"
                />
                <p className="text-[10px] text-muted-foreground">Inventory is counted in this unit. All packaging sizes below are expressed in {formData.base_uom || 'this unit'}.</p>
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

            <div className="space-y-2">
              <Label htmlFor="hsn_code" className="flex items-center gap-2">
                HSN Code
                <span className="text-[10px] text-slate-400 font-normal">4–8 digit GST classification; used in GST returns &amp; E-way Bill JSON</span>
              </Label>
              <Input
                id="hsn_code"
                value={formData.hsn_code}
                onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                placeholder="e.g. 22011010 (packaged drinking water)"
                maxLength={8}
                data-testid="sku-hsn-code-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="base_price" className="flex items-center gap-2">
                Base Price (₹ per bottle)
                <span className="text-[10px] text-slate-400 font-normal">Used for Stock Transfer invoicing (no margin) & E-way Bill valuation</span>
              </Label>
              <Input
                id="base_price"
                type="number"
                min="0"
                step="0.01"
                value={formData.base_price}
                onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                placeholder="e.g. 20.00"
                data-testid="sku-base-price-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mrp" className="flex items-center gap-2">
                MRP (₹)
                <span className="text-[10px] text-slate-400 font-normal">Maximum Retail Price. Pre-fills the account's MRP when "Allow custom MRP" is on for this SKU</span>
              </Label>
              <Input
                id="mrp"
                type="number"
                min="0"
                step="0.01"
                value={formData.mrp}
                onChange={(e) => setFormData({ ...formData, mrp: e.target.value })}
                placeholder="e.g. 40.00"
                data-testid="sku-mrp-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="standard_price" className="flex items-center gap-2">
                  Standard Price (₹)
                  <span className="text-[10px] text-slate-400 font-normal">List price shown (struck-through) in lead proposals</span>
                </Label>
                <Input
                  id="standard_price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.standard_price}
                  onChange={(e) => setFormData({ ...formData, standard_price: e.target.value })}
                  placeholder="e.g. 98.00"
                  data-testid="sku-standard-price-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="return_bottle_credit" className="flex items-center gap-2">
                  Return Bottle Credit (₹)
                  <span className="text-[10px] text-slate-400 font-normal">Default credit per returned bottle</span>
                </Label>
                <Input
                  id="return_bottle_credit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.return_bottle_credit}
                  onChange={(e) => setFormData({ ...formData, return_bottle_credit: e.target.value })}
                  placeholder="e.g. 30.00"
                  data-testid="sku-return-credit-input"
                />
              </div>
            </div>

            {/* Packaging Master + per-flow allow-list matrix */}
            <div className="space-y-3 pt-2 border-t" data-testid="packaging-master-section">
              <div>
                <Label className="text-sm font-semibold">Packaging</Label>
                <p className="text-[10px] text-slate-400">Define each pack once below (in {formData.base_uom || 'base units'}). Then tick which flows it applies to; ★ marks the default for that flow. Units are shared across all flows so counts stay consistent.</p>
              </div>

              {/* Master pack list */}
              <div className="border rounded-lg p-3 space-y-2 bg-slate-50/50" data-testid="pkg-master-list">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">Packaging Master</p>
                  <Select
                    value=""
                    onValueChange={addPackToMaster}
                  >
                    <SelectTrigger className="h-7 w-44 text-[10px]" data-testid="pkg-master-add">
                      <SelectValue placeholder="+ Add packaging type" />
                    </SelectTrigger>
                    <SelectContent>
                      {packagingTypes.filter((pt) => !(formData.packaging_config?.master || []).find((m) => m.packaging_type_id === pt.id)).map((pt) => (
                        <SelectItem key={pt.id} value={pt.id}>{pt.name} ({pt.units_per_package} {formData.base_uom || 'units'})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(formData.packaging_config?.master || []).length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">No packaging defined. Add at least one pack — otherwise stock-out / promo fall back to 1 {formData.base_uom || 'unit'}.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" data-testid="pkg-matrix-table">
                      <thead>
                        <tr className="text-[10px] text-slate-500 border-b">
                          <th className="text-left py-1.5 pr-2 font-medium">Pack</th>
                          <th className="text-center px-1 font-medium">Units</th>
                          {PKG_FLOWS.map((f) => (
                            <th key={f.key} className="text-center px-1 font-medium">{f.label}</th>
                          ))}
                          <th className="w-6"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(formData.packaging_config?.master || []).map((pack, idx) => (
                          <tr key={pack.packaging_type_id} className="border-b last:border-0" data-testid={`pkg-master-row-${idx}`}>
                            <td className="py-1.5 pr-2 font-medium text-slate-700">{pack.packaging_type_name}</td>
                            <td className="text-center px-1 text-blue-600 font-bold whitespace-nowrap">{pack.units_per_package}</td>
                            {PKG_FLOWS.map((f) => {
                              const inFlow = !!(formData.packaging_config?.[f.key] || []).find((i) => i.packaging_type_id === pack.packaging_type_id);
                              const isDefault = !!(formData.packaging_config?.[f.key] || []).find((i) => i.packaging_type_id === pack.packaging_type_id && i.is_default);
                              return (
                                <td key={f.key} className="text-center px-1">
                                  <div className="flex items-center justify-center gap-1">
                                    <input
                                      type="checkbox"
                                      checked={inFlow}
                                      onChange={() => togglePackInFlow(pack.packaging_type_id, f.key)}
                                      className="h-3.5 w-3.5 accent-emerald-600 cursor-pointer"
                                      data-testid={`pkg-flow-${f.key}-${idx}`}
                                    />
                                    {inFlow && (
                                      <button
                                        type="button"
                                        onClick={() => setFlowDefault(pack.packaging_type_id, f.key)}
                                        className={`text-xs leading-none ${isDefault ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                                        title={isDefault ? 'Default for this flow' : 'Set as default'}
                                        data-testid={`pkg-default-${f.key}-${idx}`}
                                      >
                                        {isDefault ? '★' : '☆'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="text-center">
                              <button type="button" onClick={() => removePackFromMaster(pack.packaging_type_id)} className="p-0.5 text-slate-400 hover:text-red-500" data-testid={`pkg-master-remove-${idx}`}>
                                <X size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* COGS Costs — values for each active master COGS component (₹) */}
            {cogsComponents.length > 0 && (
              <div className="space-y-3 pt-2 border-t" data-testid="sku-cogs-costs-section">
                <div>
                  <Label className="text-sm font-semibold">COGS Costs</Label>
                  <p className="text-[11px] text-muted-foreground">Set the unit price for each COGS component. These values are used by the COGS Calculator across all cities.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {cogsComponents.map((c) => {
                    const v = formData.cogs_components_values?.[c.key];
                    return (
                      <div key={c.key} className="space-y-1">
                        <Label className="text-xs text-slate-600">{c.label} (₹)</Label>
                        <DecimalInput
                          value={v}
                          placeholder="0.00"
                          className="h-9 text-right font-mono"
                          onChange={(val) =>
                            setFormData((prev) => ({
                              ...prev,
                              cogs_components_values: {
                                ...(prev.cogs_components_values || {}),
                                [c.key]: val,
                              },
                            }))
                          }
                          data-testid={`sku-cogs-${c.key}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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

            {/* Allow per-account MRP customisation */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 flex items-start gap-3">
              <Switch
                checked={formData.allow_custom_mrp}
                onCheckedChange={(checked) => setFormData({ ...formData, allow_custom_mrp: checked })}
                data-testid="sku-allow-custom-mrp-toggle"
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label className="text-sm font-medium cursor-pointer" onClick={() => setFormData({ ...formData, allow_custom_mrp: !formData.allow_custom_mrp })}>
                  Allow custom MRP per account
                </Label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  When on, each account using this SKU must enter an MRP under Account Detail → SKU Pricing before it can be activated. When off, the MRP column is hidden and activation is not blocked.
                </p>
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
