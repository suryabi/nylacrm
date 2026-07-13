import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { Tags, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const GENERIC = '__generic__';

export function BrandingEntryDialog({ open, onClose, onCreated }) {
  const [warehouses, setWarehouses] = useState([]);
  const [skus, setSkus] = useState([]); // master SKUs that allow child SKUs
  const [locationStock, setLocationStock] = useState([]); // aggregate per sku at chosen warehouse
  const [breakdown, setBreakdown] = useState([]); // per-classification for chosen (warehouse, sku)
  const [childSkus, setChildSkus] = useState([]); // all children of chosen parent
  const [form, setForm] = useState({ warehouse_location_id: '', sku_id: '', from: GENERIC, to: '', quantity: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ warehouse_location_id: '', sku_id: '', from: GENERIC, to: '', quantity: '', notes: '' });
    setBreakdown([]); setChildSkus([]); setLocationStock([]);
    (async () => {
      try {
        const [srcRes, skuRes] = await Promise.all([
          axios.get(`${API}/distributor/stock-transfers/eligible-sources`, { headers: HEAD() }),
          axios.get(`${API}/master-skus`, { headers: HEAD() }),
        ]);
        setWarehouses((srcRes.data?.sources || []).filter((s) => s.is_self_managed));
        const all = skuRes.data?.skus || skuRes.data || [];
        setSkus(all.filter((s) => s.allows_child_skus));
      } catch {
        toast.error('Failed to load warehouses');
      }
    })();
  }, [open]);

  // Warehouse chosen → load its per-SKU stock so the SKU picker shows availability.
  useEffect(() => {
    if (!form.warehouse_location_id) { setLocationStock([]); return; }
    axios.get(`${API}/distributor/stock-transfers/location-stock?location_id=${form.warehouse_location_id}`, { headers: HEAD() })
      .then((res) => setLocationStock(res.data?.stock || []))
      .catch(() => setLocationStock([]));
  }, [form.warehouse_location_id]);

  // (warehouse, sku) chosen → load classification breakdown + child list.
  const loadBreakdown = useCallback(async () => {
    if (!form.warehouse_location_id || !form.sku_id) { setBreakdown([]); setChildSkus([]); return; }
    setLoadingBreakdown(true);
    try {
      const [bRes, cRes] = await Promise.all([
        axios.get(`${API}/branding-entries/stock-breakdown?warehouse_location_id=${form.warehouse_location_id}&sku_id=${form.sku_id}`, { headers: HEAD() }),
        axios.get(`${API}/child-skus?parent_sku_id=${form.sku_id}`, { headers: HEAD() }),
      ]);
      setBreakdown(bRes.data?.breakdown || []);
      setChildSkus(cRes.data?.child_skus || []);
    } catch {
      setBreakdown([]); setChildSkus([]);
    } finally { setLoadingBreakdown(false); }
  }, [form.warehouse_location_id, form.sku_id]);

  useEffect(() => { loadBreakdown(); }, [loadBreakdown]);

  const qtyFor = (key) => breakdown.find((b) => (b.child_sku_id || GENERIC) === key)?.quantity || 0;
  const fromAvail = qtyFor(form.from);
  const skuStockMap = Object.fromEntries(locationStock.map((s) => [s.sku_id, s.quantity || 0]));
  const skusWithStock = skus.filter((s) => (skuStockMap[s.id] || 0) > 0);

  const fromOptions = [
    { key: GENERIC, label: 'Generic (unbranded)', qty: qtyFor(GENERIC) },
    ...childSkus.map((c) => ({ key: c.id, label: c.child_sku_name, qty: qtyFor(c.id) })),
  ].filter((o) => o.qty > 0 || o.key === form.from);

  const toOptions = [
    { key: GENERIC, label: 'Generic (unbranded)' },
    ...childSkus.map((c) => ({ key: c.id, label: `${c.child_sku_name} (${c.child_sku_code})${c.customer_account_name ? ` · ${c.customer_account_name}` : ''}` })),
  ].filter((o) => o.key !== form.from);

  const qty = parseInt(form.quantity) || 0;
  const canSubmit = form.warehouse_location_id && form.sku_id && form.to && qty > 0 && qty <= fromAvail;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const { data } = await axios.post(`${API}/branding-entries`, {
        warehouse_location_id: form.warehouse_location_id,
        sku_id: form.sku_id,
        from_child_sku_id: form.from === GENERIC ? null : form.from,
        to_child_sku_id: form.to === GENERIC ? null : form.to,
        quantity: qty,
        notes: form.notes || null,
      }, { headers: HEAD() });
      toast.success(`Branding entry ${data.entry_number} recorded — ${qty.toLocaleString()} bottles reclassified`);
      onCreated?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to record branding entry');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="branding-entry-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tags className="h-5 w-5 text-indigo-600" /> Branding Entry</DialogTitle>
          <DialogDescription>
            Reclassify on-hand stock between <b>Generic</b> and <b>customer-branded</b> child SKUs of the same parent
            (e.g. after applying labels). Total warehouse quantity is unchanged. No approval required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Warehouse *</Label>
            <Select value={form.warehouse_location_id} onValueChange={(v) => setForm((p) => ({ ...p, warehouse_location_id: v, sku_id: '', from: GENERIC, to: '', quantity: '' }))}>
              <SelectTrigger data-testid="branding-warehouse-select"><SelectValue placeholder="Pick a warehouse with stock" /></SelectTrigger>
              <SelectContent>
                {warehouses.length === 0 && <SelectItem value="__none__" disabled>No warehouses with stock</SelectItem>}
                {warehouses.map((w) => (
                  <SelectItem key={w.location_id} value={w.location_id}>
                    {w.distributor_name} — {w.location_name}{w.is_factory ? ' · Factory' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Parent SKU *</Label>
            <Select value={form.sku_id} onValueChange={(v) => setForm((p) => ({ ...p, sku_id: v, from: GENERIC, to: '', quantity: '' }))} disabled={!form.warehouse_location_id}>
              <SelectTrigger data-testid="branding-sku-select"><SelectValue placeholder={form.warehouse_location_id ? 'Pick a SKU (child-SKU-enabled)' : 'Pick a warehouse first'} /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {skusWithStock.length === 0 && <SelectItem value="__none__" disabled>No child-SKU-enabled products in stock here</SelectItem>}
                {skusWithStock.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.sku_name} — {(skuStockMap[s.id] || 0).toLocaleString()} bottles</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.sku_id && (
            loadingBreakdown ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading classifications…</div>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <div>
                    <Label>From *</Label>
                    <Select value={form.from} onValueChange={(v) => setForm((p) => ({ ...p, from: v, to: p.to === v ? '' : p.to, quantity: '' }))}>
                      <SelectTrigger data-testid="branding-from-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {fromOptions.length === 0 && <SelectItem value="__none__" disabled>No stock to reclassify</SelectItem>}
                        {fromOptions.map((o) => (
                          <SelectItem key={o.key} value={o.key}>{o.label} — {o.qty.toLocaleString()} bottles</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 mb-2.5" />
                  <div>
                    <Label>To *</Label>
                    <Select value={form.to} onValueChange={(v) => setForm((p) => ({ ...p, to: v }))}>
                      <SelectTrigger data-testid="branding-to-select"><SelectValue placeholder="Target classification" /></SelectTrigger>
                      <SelectContent>
                        {toOptions.map((o) => (
                          <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Quantity (bottles) * <span className="text-[10px] text-slate-400">max {fromAvail.toLocaleString()}</span></Label>
                  <Input
                    type="number" min="1" max={fromAvail} value={form.quantity}
                    onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                    placeholder={`1 – ${fromAvail.toLocaleString()}`}
                    className={qty > fromAvail ? 'border-red-300 text-red-700' : ''}
                    data-testid="branding-qty-input"
                  />
                  {qty > fromAvail && <p className="text-[10px] text-red-600 mt-1">Only {fromAvail.toLocaleString()} bottles available in the source classification</p>}
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="e.g. Labels applied for customer order #123" data-testid="branding-notes-input" />
                </div>
              </>
            )
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="branding-submit-btn">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recording…</> : <><Tags className="h-4 w-4 mr-2" />Record Branding Entry</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
