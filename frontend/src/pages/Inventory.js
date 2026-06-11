import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Package, Plus, Search, TrendingDown, AlertTriangle, Boxes,
  Pencil, Trash2, Tag, IndianRupee, X, UserCircle, Building2, Loader2,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const STATUS_BADGE = {
  ok: { label: 'In Stock', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  low: { label: 'Low', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  critical: { label: 'Critical', cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  out_of_stock: { label: 'Out of Stock', cls: 'bg-red-100 text-red-800 border-red-200' },
};

const emptyForm = {
  item_name: '', item_code: '', category: '', description: '', unit_of_measure: '',
  min_stock_level: 0, reorder_level: 0, opening_stock: 0, is_active: true,
  is_customer_specific: false, customer_type: null, customer_id: null, customer_name: null,
};

// ───────────── Customer (Lead / Account) linker ─────────────
function CustomerLinker({ value, name, type, onPick, onClear }) {
  const [kind, setKind] = useState(type || 'lead');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (value) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        if (kind === 'lead') {
          const { data } = await axios.get(`${API}/leads?page=1&page_size=15${q ? `&search=${encodeURIComponent(q)}` : ''}`, { headers: HEAD() });
          setResults((data.data || data.leads || []).map(l => ({ id: l.id, name: l.company || l.contact_person || l.name || 'Lead', sub: l.contact_person || l.city || '' })));
        } else {
          const { data } = await axios.get(`${API}/accounts?page=1&page_size=15${q ? `&search=${encodeURIComponent(q)}` : ''}`, { headers: HEAD() });
          setResults((data.accounts || data.data || data.items || []).map(a => ({ id: a.id, name: a.account_name || a.name || a.company || 'Account', sub: a.city || a.account_type || '' })));
        }
      } catch { setResults([]); } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, kind, value]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="item-customer-selected">
        <div className="flex items-center gap-2 min-w-0">
          {type === 'account' ? <Building2 className="h-4 w-4 text-emerald-600" /> : <UserCircle className="h-4 w-4 text-emerald-600" />}
          <span className="text-sm font-medium text-emerald-900 truncate">{name}</span>
          <Badge variant="outline" className="text-[10px] capitalize">{type}</Badge>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClear} data-testid="item-customer-clear"><X className="h-4 w-4" /></Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={kind === 'lead' ? 'default' : 'outline'} className={kind === 'lead' ? 'bg-emerald-600' : ''} onClick={() => setKind('lead')}>Lead</Button>
        <Button type="button" size="sm" variant={kind === 'account' ? 'default' : 'outline'} className={kind === 'account' ? 'bg-emerald-600' : ''} onClick={() => setKind('account')}>Account</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${kind}s…`} className="pl-9" data-testid="item-customer-search" />
      </div>
      <div className="max-h-44 overflow-y-auto rounded-lg border divide-y">
        {loading && <div className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</div>}
        {!loading && results.length === 0 && <div className="p-3 text-sm text-muted-foreground">No {kind}s found</div>}
        {!loading && results.map(r => (
          <button key={r.id} type="button" onClick={() => onPick(kind, r.id, r.name)} className="w-full text-left px-3 py-2 hover:bg-emerald-50 transition-colors" data-testid={`item-customer-option-${r.id}`}>
            <div className="text-sm font-medium text-slate-800">{r.name}</div>
            {r.sub && <div className="text-xs text-muted-foreground">{r.sub}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────── Vendor-Item Price manager dialog ─────────────
function PriceDialog({ item, vendors, onClose }) {
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const blankP = { vendor_id: '', price: 0, min_order_qty: 0, standard_lead_time_days: '', tax_percentage: 0, price_active_from: '', price_active_to: '', remarks: '' };
  const [p, setP] = useState(blankP);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/inventory/item-prices?item_id=${item.id}`, { headers: HEAD() });
      setPrices(data.prices || []);
    } catch { toast.error('Failed to load prices'); } finally { setLoading(false); }
  }, [item.id]);
  useEffect(() => { load(); }, [load]);

  const addPrice = async () => {
    if (!p.vendor_id) return toast.error('Select a vendor');
    if (!p.price_active_from) return toast.error('Set "active from" date');
    setSaving(true);
    try {
      await axios.post(`${API}/inventory/item-prices`, {
        item_id: item.id, vendor_id: p.vendor_id, price: Number(p.price) || 0,
        min_order_qty: Number(p.min_order_qty) || 0,
        standard_lead_time_days: p.standard_lead_time_days === '' ? null : Number(p.standard_lead_time_days),
        tax_percentage: Number(p.tax_percentage) || 0,
        price_active_from: p.price_active_from, price_active_to: p.price_active_to || null,
        remarks: p.remarks || null,
      }, { headers: HEAD() });
      toast.success('Price added');
      setP(blankP); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to add price'); } finally { setSaving(false); }
  };

  const delPrice = async (id) => {
    try { await axios.delete(`${API}/inventory/item-prices/${id}`, { headers: HEAD() }); toast.success('Price removed'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="price-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><IndianRupee className="h-5 w-5 text-emerald-600" /> Vendor Prices · {item.item_name}</DialogTitle>
          <DialogDescription>Maintain time-bounded prices per vendor. Only one active price can apply at a time.</DialogDescription>
        </DialogHeader>

        {/* Existing prices */}
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-2.5 font-semibold">Vendor</th>
                <th className="text-right p-2.5 font-semibold">Price</th>
                <th className="text-right p-2.5 font-semibold">Tax %</th>
                <th className="text-left p-2.5 font-semibold">Period</th>
                <th className="text-center p-2.5 font-semibold">Status</th>
                <th className="p-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
              {!loading && prices.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No prices yet</td></tr>}
              {!loading && prices.map(pr => (
                <tr key={pr.id} data-testid={`price-row-${pr.id}`}>
                  <td className="p-2.5 font-medium text-slate-800">{pr.vendor_name}</td>
                  <td className="p-2.5 text-right tabular-nums">₹{Number(pr.price).toFixed(2)}</td>
                  <td className="p-2.5 text-right tabular-nums">{pr.tax_percentage || 0}%</td>
                  <td className="p-2.5 text-xs text-slate-600">{pr.price_active_from} → {pr.price_active_to || 'open'}</td>
                  <td className="p-2.5 text-center">{pr.is_current ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge> : <Badge variant="outline" className="text-slate-500">Inactive</Badge>}</td>
                  <td className="p-2.5 text-right"><Button variant="ghost" size="sm" onClick={() => delPrice(pr.id)} className="text-red-600" data-testid={`price-delete-${pr.id}`}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add price */}
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Plus className="h-4 w-4" /> Add Price</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label className="text-xs">Vendor</Label>
              <Select value={p.vendor_id} onValueChange={(v) => setP({ ...p, vendor_id: v })}>
                <SelectTrigger data-testid="price-vendor-select"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>{vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Price (₹)</Label><Input type="number" step="0.01" value={p.price} onChange={(e) => setP({ ...p, price: e.target.value })} data-testid="price-amount" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Tax %</Label><Input type="number" step="0.01" value={p.tax_percentage} onChange={(e) => setP({ ...p, tax_percentage: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Min Order Qty</Label><Input type="number" value={p.min_order_qty} onChange={(e) => setP({ ...p, min_order_qty: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Lead Time (days)</Label><Input type="number" value={p.standard_lead_time_days} onChange={(e) => setP({ ...p, standard_lead_time_days: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Active From</Label><Input type="date" value={p.price_active_from} onChange={(e) => setP({ ...p, price_active_from: e.target.value })} data-testid="price-from" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Active To (optional)</Label><Input type="date" value={p.price_active_to} onChange={(e) => setP({ ...p, price_active_to: e.target.value })} data-testid="price-to" /></div>
            <div className="space-y-1.5 col-span-2 sm:col-span-3"><Label className="text-xs">Remarks</Label><Input value={p.remarks} onChange={(e) => setP({ ...p, remarks: e.target.value })} /></div>
          </div>
          <div className="flex justify-end">
            <Button onClick={addPrice} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="price-add-btn">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Add Price
            </Button>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [meta, setMeta] = useState({ categories: [], units_of_measure: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [priceItem, setPriceItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (catFilter !== 'all') params.set('category', catFilter);
      const { data } = await axios.get(`${API}/inventory/items?${params}`, { headers: HEAD() });
      setItems(data.items || []);
    } catch { toast.error('Failed to load items'); } finally { setLoading(false); }
  }, [search, catFilter]);

  useEffect(() => {
    axios.get(`${API}/inventory/meta`, { headers: HEAD() }).then(r => setMeta(r.data)).catch(() => {});
    axios.get(`${API}/inventory/vendors?is_active=true`, { headers: HEAD() }).then(r => setVendors(r.data.vendors || [])).catch(() => {});
  }, []);
  useEffect(() => { const t = setTimeout(loadItems, 250); return () => clearTimeout(t); }, [loadItems]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (it) => { setEditing(it); setForm({ ...emptyForm, ...it }); setShowForm(true); };

  const save = async () => {
    if (!form.item_name.trim()) return toast.error('Item name is required');
    if (!form.item_code.trim()) return toast.error('Item code is required');
    if (!form.category) return toast.error('Select a category');
    if (!form.unit_of_measure) return toast.error('Select a unit of measure');
    if (form.is_customer_specific && !form.customer_id) return toast.error('Link a Lead or Account for customer-specific items');
    setSaving(true);
    try {
      const payload = {
        item_name: form.item_name, item_code: form.item_code, category: form.category,
        description: form.description, unit_of_measure: form.unit_of_measure,
        min_stock_level: Number(form.min_stock_level) || 0, reorder_level: Number(form.reorder_level) || 0,
        is_active: form.is_active, is_customer_specific: form.is_customer_specific,
        customer_type: form.customer_type, customer_id: form.customer_id, customer_name: form.customer_name,
      };
      if (editing) {
        await axios.put(`${API}/inventory/items/${editing.id}`, payload, { headers: HEAD() });
        toast.success('Item updated');
      } else {
        payload.opening_stock = Number(form.opening_stock) || 0;
        await axios.post(`${API}/inventory/items`, payload, { headers: HEAD() });
        toast.success('Item created');
      }
      setShowForm(false); loadItems();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save'); } finally { setSaving(false); }
  };

  const doDelete = async () => {
    try { await axios.delete(`${API}/inventory/items/${deleteItem.id}`, { headers: HEAD() }); toast.success('Item deleted'); setDeleteItem(null); loadItems(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed to delete'); }
  };

  const stats = {
    total: items.length,
    low: items.filter(i => i.stock_status === 'low' || i.stock_status === 'critical').length,
    out: items.filter(i => i.stock_status === 'out_of_stock').length,
    cust: items.filter(i => i.is_customer_specific).length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30" data-testid="inventory-page">
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100"><Package className="h-6 w-6 text-emerald-600" /></div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800">Item Master</h1>
              <p className="text-muted-foreground text-sm">Raw materials, packaging, labels, caps & customer branding stock</p>
            </div>
          </div>
          <Button onClick={openAdd} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg" data-testid="add-inventory-btn"><Plus className="w-4 h-4" /> Add Item</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Items', value: stats.total, icon: Boxes, cls: 'text-slate-700' },
            { label: 'Low / Critical', value: stats.low, icon: TrendingDown, cls: 'text-amber-700' },
            { label: 'Out of Stock', value: stats.out, icon: AlertTriangle, cls: 'text-red-700' },
            { label: 'Customer-Specific', value: stats.cust, icon: Tag, cls: 'text-emerald-700' },
          ].map(s => {
            const Icon = s.icon;
            return (
              <Card key={s.label} className="border-0 shadow-sm bg-white/80 backdrop-blur">
                <CardContent className="p-4 flex items-center justify-between">
                  <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p><p className={`text-2xl font-bold ${s.cls} tabular-nums`} data-testid={`stat-${s.label}`}>{s.value}</p></div>
                  <Icon className={`w-8 h-8 ${s.cls} opacity-40`} />
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filters */}
        <Card className="p-4 border-0 bg-white/80 backdrop-blur shadow">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name or code…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="inventory-search" />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-56" data-testid="category-filter"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {meta.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Items table */}
        <Card className="border-0 bg-white/90 backdrop-blur shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 border-b">
                <tr>
                  <th className="text-left p-3 font-semibold">Item</th>
                  <th className="text-left p-3 font-semibold">Code</th>
                  <th className="text-left p-3 font-semibold">Category</th>
                  <th className="text-left p-3 font-semibold">UoM</th>
                  <th className="text-right p-3 font-semibold">Current Stock</th>
                  <th className="text-right p-3 font-semibold">Reorder</th>
                  <th className="text-center p-3 font-semibold">Status</th>
                  <th className="text-left p-3 font-semibold">Customer</th>
                  <th className="text-right p-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</td></tr>}
                {!loading && items.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No items found. Use the Add Item button to create one.</td></tr>}
                {!loading && items.map(it => {
                  const sb = STATUS_BADGE[it.stock_status] || STATUS_BADGE.ok;
                  return (
                    <tr key={it.id} className="hover:bg-slate-50/70 transition-colors" data-testid={`item-row-${it.id}`}>
                      <td className="p-3"><div className="font-medium text-slate-800">{it.item_name}</div>{it.description && <div className="text-xs text-muted-foreground truncate max-w-[240px]">{it.description}</div>}</td>
                      <td className="p-3 font-mono text-xs text-slate-600">{it.item_code}</td>
                      <td className="p-3"><Badge variant="outline" className="text-xs">{it.category}</Badge></td>
                      <td className="p-3 text-slate-600">{it.unit_of_measure}</td>
                      <td className="p-3 text-right tabular-nums font-semibold">{Number(it.current_stock).toLocaleString()}</td>
                      <td className="p-3 text-right tabular-nums text-slate-500">{Number(it.reorder_level).toLocaleString()}</td>
                      <td className="p-3 text-center"><Badge className={`${sb.cls} border`}>{sb.label}</Badge></td>
                      <td className="p-3">{it.is_customer_specific ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Tag className="h-3 w-3" /> {it.customer_name}</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setPriceItem(it)} title="Vendor Prices" data-testid={`item-prices-${it.id}`}><IndianRupee className="h-4 w-4 text-emerald-600" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(it)} title="Edit" data-testid={`item-edit-${it.id}`}><Pencil className="h-4 w-4 text-slate-600" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteItem(it)} title="Delete" data-testid={`item-delete-${it.id}`}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="item-form-dialog">
          <DialogHeader><DialogTitle>{editing ? 'Edit Item' : 'New Item'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Item Name *</Label><Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} data-testid="item-name-input" /></div>
              <div className="space-y-1.5"><Label>Item Code / SKU *</Label><Input value={form.item_code} onChange={(e) => setForm({ ...form, item_code: e.target.value })} data-testid="item-code-input" /></div>
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="item-category-select"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{meta.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unit of Measure *</Label>
                <Select value={form.unit_of_measure} onValueChange={(v) => setForm({ ...form, unit_of_measure: v })}>
                  <SelectTrigger data-testid="item-uom-select"><SelectValue placeholder="Select UoM" /></SelectTrigger>
                  <SelectContent>{meta.units_of_measure.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Min Stock Level</Label><Input type="number" value={form.min_stock_level} onChange={(e) => setForm({ ...form, min_stock_level: e.target.value })} data-testid="item-min-stock" /></div>
              <div className="space-y-1.5"><Label>Reorder Level</Label><Input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} data-testid="item-reorder" /></div>
              <div className="space-y-1.5"><Label>{editing ? 'Current Stock' : 'Opening Stock'}</Label><Input type="number" disabled={!!editing} value={editing ? form.current_stock : form.opening_stock} onChange={(e) => setForm({ ...form, opening_stock: e.target.value })} data-testid="item-opening-stock" />{editing && <p className="text-[10px] text-muted-foreground">Adjust via Stock Entry</p>}</div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2"><span className="text-sm font-medium">Active</span></div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} data-testid="item-active-switch" />
            </div>
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div><span className="text-sm font-medium">Customer-Specific Item</span><p className="text-xs text-muted-foreground">Branding/material reserved for one customer</p></div>
                <Switch checked={form.is_customer_specific} onCheckedChange={(v) => setForm({ ...form, is_customer_specific: v, ...(v ? {} : { customer_type: null, customer_id: null, customer_name: null }) })} data-testid="item-customer-switch" />
              </div>
              {form.is_customer_specific && (
                <CustomerLinker
                  value={form.customer_id} name={form.customer_name} type={form.customer_type}
                  onPick={(kind, id, name) => setForm({ ...form, customer_type: kind, customer_id: id, customer_name: name })}
                  onClear={() => setForm({ ...form, customer_type: null, customer_id: null, customer_name: null })}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="item-save-btn">{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} {editing ? 'Save Changes' : 'Create Item'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price manager */}
      {priceItem && <PriceDialog item={priceItem} vendors={vendors} onClose={() => setPriceItem(null)} />}

      {/* Delete confirm */}
      <Dialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <DialogContent className="max-w-md" data-testid="item-delete-dialog">
          <DialogHeader><DialogTitle>Delete Item</DialogTitle><DialogDescription>Delete <span className="font-semibold">{deleteItem?.item_name}</span>? This also removes its vendor prices. This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700" onClick={doDelete} data-testid="item-delete-confirm">Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
