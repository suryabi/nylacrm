import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { format, parseISO, isValid } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  ArrowLeftRight, Plus, Search, X, Loader2, Truck, AlertTriangle, ExternalLink,
  RefreshCw, FileText, Package, Building2, Download, Undo2, Pencil, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { ShareButton } from '../components/share/ShareButton';
import { useAuth } from '../context/AuthContext';

const QTY_EDIT_ROLES = ['CEO', 'System Admin'];

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmtDate = (s, f = 'dd MMM yyyy') => {
  if (!s) return '—';
  try { const d = parseISO(s); return isValid(d) ? format(d, f) : s; } catch { return s; }
};

const DocBadge = ({ type }) => {
  if (type === 'delivery_challan') {
    return <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"><FileText className="h-3 w-3 mr-1" />Delivery Challan</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"><FileText className="h-3 w-3 mr-1" />Invoice</Badge>;
};

const StatusBadge = ({ status, error }) => {
  if (status === 'synced') return <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Synced</Badge>;
  if (status === 'pending') return <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600 border-slate-200">Pending</Badge>;
  return (
    <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200" title={error || ''}>
      <AlertTriangle className="h-3 w-3 mr-1" />Failed
    </Badge>
  );
};

function NewTransferDialog({ open, onClose, onCreated }) {
  const [sources, setSources] = useState([]);
  const [targets, setTargets] = useState([]);
  const [skus, setSkus] = useState([]);
  const [form, setForm] = useState({
    source_location_id: '',
    dest_location_id: '',
    transfer_date: new Date().toISOString().slice(0, 10),
    notes: '',
    vehicle_number: '',
  });
  // Each item: { sku_id, packaging_type_id, packaging_type_name, units_per_package, quantity,
  //              rate (per-package, auto), rate_per_bottle, rate_status: 'idle'|'loading'|'ok'|'missing',
  //              rate_reason, rate_details }
  const [items, setItems] = useState([{
    sku_id: '', packaging_type_id: '', packaging_type_name: '', units_per_package: 0, quantity: '',
    rate: 0, rate_per_bottle: 0, rate_status: 'idle', rate_reason: '', rate_details: null,
    batch_id: '', batch_code: '', batches_available: [], batches_loading: false,
  }]);
  const [saving, setSaving] = useState(false);
  const [stockBySku, setStockBySku] = useState({}); // sku_id -> available units (at chosen source)

  useEffect(() => {
    if (!open) return;
    setForm({
      source_location_id: '',
      dest_location_id: '',
      transfer_date: new Date().toISOString().slice(0, 10),
      notes: '',
      vehicle_number: '',
    });
    setItems([{
      sku_id: '', packaging_type_id: '', packaging_type_name: '', units_per_package: 0, quantity: '',
      rate: 0, rate_per_bottle: 0, rate_status: 'idle', rate_reason: '', rate_details: null,
      batch_id: '', batch_code: '', batches_available: [], batches_loading: false,
    }]);
    setStockBySku({});
    (async () => {
      try {
        const [srcRes, skusRes] = await Promise.all([
          axios.get(`${API}/distributor/stock-transfers/eligible-sources`, { headers: HEAD() }),
          axios.get(`${API}/master-skus`, { headers: HEAD() }).catch(() => ({ data: { skus: [] } })),
        ]);
        setSources(srcRes.data?.sources || []);
        setSkus(skusRes.data?.skus || skusRes.data || []);
      } catch (e) {
        toast.error('Failed to load eligible warehouses');
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!form.source_location_id) { setTargets([]); setStockBySku({}); return; }
    (async () => {
      try {
        const t = await axios.get(`${API}/distributor/stock-transfers/eligible-targets?exclude_location_id=${form.source_location_id}`, { headers: HEAD() });
        setTargets(t.data?.targets || []);
        const src = sources.find((s) => s.location_id === form.source_location_id);
        if (src) {
          // Unified endpoint reads from either distributor_stock or factory_warehouse_stock.
          const stockRes = await axios.get(`${API}/distributor/stock-transfers/location-stock?location_id=${form.source_location_id}`, { headers: HEAD() }).catch(() => null);
          const map = {};
          (stockRes?.data?.stock || []).forEach((s) => {
            map[s.sku_id] = s.quantity ?? s.qty ?? 0;
          });
          setStockBySku(map);
        }
      } catch { /* no-op */ }
    })();
  }, [form.source_location_id, sources]);

  const addItemRow = () => setItems((p) => [
    ...p,
    { sku_id: '', packaging_type_id: '', packaging_type_name: '', units_per_package: 0, quantity: '',
      rate: 0, rate_per_bottle: 0, rate_status: 'idle', rate_reason: '', rate_details: null,
      batch_id: '', batch_code: '', batches_available: [], batches_loading: false },
  ]);
  const updateItem = (i, patch) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const removeItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));

  // When SKU changes, default to that SKU's default stock_out packaging.
  const setItemSku = (i, skuId) => {
    const sku = skus.find((s) => s.id === skuId);
    const stockOutPkgs = sku?.packaging_config?.stock_out || [];
    const defaultPkg = stockOutPkgs.find((p) => p.is_default) || stockOutPkgs[0];
    updateItem(i, {
      sku_id: skuId,
      packaging_type_id: defaultPkg?.packaging_type_id || '',
      packaging_type_name: defaultPkg?.packaging_type_name || '',
      units_per_package: defaultPkg?.units_per_package || 0,
      // Reset rate so the resolver re-runs.
      rate: 0, rate_per_bottle: 0, rate_status: 'idle', rate_reason: '', rate_details: null,
    });
  };

  const sourceObj = useMemo(() => sources.find((s) => s.location_id === form.source_location_id), [sources, form.source_location_id]);
  const targetObj = useMemo(() => targets.find((t) => t.location_id === form.dest_location_id), [targets, form.dest_location_id]);

  // Stock Transfer is internal logistics only — source is restricted to
  // self-managed warehouses (which includes factory warehouses since their
  // parent distributor is_self_managed=true). This stops users from picking
  // a third-party distributor as the source.
  const filteredSources = useMemo(
    () => sources.filter((s) => s.is_self_managed),
    [sources]
  );

  // Destination must share the source's PAN — anything else would be a
  // cross-PAN transfer (already blocked server-side) so we hide it here too
  // for a cleaner picker. If no source is chosen yet we only show
  // self-managed warehouses (matching the source picker's scope).
  const filteredTargets = useMemo(() => {
    const base = targets.filter((t) => t.is_self_managed);
    if (!sourceObj) return base;
    const srcPan = sourceObj.pan;
    return base.filter((t) => {
      if (t.location_id === sourceObj.location_id) return false;  // can't be same warehouse
      if (!srcPan) return true;  // source has no PAN — fall back to showing all self-managed
      return t.pan === srcPan;
    });
  }, [targets, sourceObj]);

  // Source warehouse opt-in: if true, the user must pick a batch on every line.
  const sourceTracksBatches = !!sourceObj?.track_batches;

  // Fetch available batches for an item from the new /batches-available endpoint
  // whenever the source warehouse + SKU is set AND the source tracks batches.
  const loadBatchesForItem = useCallback(async (idx, item) => {
    if (!sourceObj || !item.sku_id || !sourceTracksBatches) return;
    updateItem(idx, { batches_loading: true });
    try {
      const params = new URLSearchParams({
        location_id: sourceObj.location_id,
        sku_id: item.sku_id,
      });
      const { data } = await axios.get(`${API}/distributor/stock-transfers/batches-available?${params}`, { headers: HEAD() });
      const batches = data?.batches || [];
      // FIFO default: pre-select the oldest batch (first in the list)
      const first = batches[0];
      updateItem(idx, {
        batches_available: batches,
        batches_loading: false,
        // Only auto-pick if user hasn't already chosen something valid.
        ...(item.batch_id && batches.some((b) => b.batch_id === item.batch_id) ? {} : {
          batch_id: first?.batch_id || '',
          batch_code: first?.batch_code || '',
        }),
      });
    } catch (e) {
      updateItem(idx, { batches_loading: false, batches_available: [] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceObj, sourceTracksBatches]);

  // Refresh batches whenever source warehouse or item SKU changes.
  useEffect(() => {
    if (!sourceTracksBatches) {
      // Clear any stale picker state when the user switches to a non-tracked source.
      setItems((p) => p.map((it) => ({ ...it, batch_id: '', batch_code: '', batches_available: [] })));
      return;
    }
    items.forEach((it, idx) => {
      if (it.sku_id) loadBatchesForItem(idx, it);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sourceObj?.location_id, sourceTracksBatches,
    items.map((it) => it.sku_id).join(','),
  ]);

  // Resolve per-package rate from the SKU's company-wide Base Price (master_skus.base_price).
  // Stock transfers have NO margin — the rate is independent of source/destination
  // distributor. If a SKU has no Base Price set, the user must add it under
  // Settings → SKU Management before transferring.
  const resolveRateForItem = useCallback(async (idx, item) => {
    if (!item.sku_id || !item.units_per_package) return;
    updateItem(idx, { rate_status: 'loading', rate_reason: '' });
    try {
      const params = new URLSearchParams({
        sku_id: item.sku_id,
        units_per_package: String(item.units_per_package),
      });
      const { data } = await axios.get(`${API}/distributor/stock-transfers/resolve-rate?${params}`, { headers: HEAD() });
      if (data?.ok) {
        updateItem(idx, {
          rate: data.rate_per_package,
          rate_per_bottle: data.rate_per_bottle,
          rate_status: 'ok',
          rate_reason: '',
          rate_details: data.details || null,
        });
      } else {
        updateItem(idx, {
          rate: 0, rate_per_bottle: 0,
          rate_status: 'missing',
          rate_reason: data?.reason || 'No Base Price set for this SKU.',
          rate_details: null,
        });
      }
    } catch (e) {
      updateItem(idx, {
        rate: 0, rate_per_bottle: 0,
        rate_status: 'missing',
        rate_reason: e.response?.data?.detail || 'Failed to look up rate.',
        rate_details: null,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-resolve whenever SKU or packaging changes (rate is destination-independent now).
  useEffect(() => {
    items.forEach((it, idx) => {
      if (it.sku_id && it.units_per_package > 0) {
        resolveRateForItem(idx, it);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    items.map((it) => `${it.sku_id}|${it.packaging_type_id}|${it.units_per_package}`).join(','),
  ]);

  const docPreview = useMemo(() => {
    if (!sourceObj || !targetObj) return null;
    const srcSelf = sourceObj.is_self_managed;
    const dstSelf = targetObj.is_self_managed;
    const sameGstin = sourceObj.gstin && targetObj.gstin && sourceObj.gstin === targetObj.gstin;
    if (srcSelf && dstSelf && sameGstin) return 'delivery_challan';
    return 'invoice';
  }, [sourceObj, targetObj]);

  const canSubmit = form.source_location_id && form.dest_location_id && items.length > 0
    && items.every((it) => it.sku_id && it.packaging_type_name && it.units_per_package > 0
      && Number(it.quantity) > 0 && it.rate_status === 'ok'
      && (!sourceTracksBatches || it.batch_id));

  const onSubmit = async () => {
    if (!canSubmit) { toast.error('Fill source, destination, SKU, packaging and quantity'); return; }
    if (!sourceObj || !targetObj) { toast.error('Pick valid source and destination'); return; }
    setSaving(true);
    try {
      const payload = {
        source_distributor_id: sourceObj.distributor_id,
        source_location_id: sourceObj.location_id,
        dest_distributor_id: targetObj.distributor_id,
        dest_location_id: targetObj.location_id,
        transfer_date: form.transfer_date,
        notes: form.notes || null,
        vehicle_number: form.vehicle_number || null,
        items: items.filter((it) => it.sku_id && Number(it.quantity) > 0).map((it) => {
          const sku = skus.find((s) => s.id === it.sku_id);
          return {
            sku_id: it.sku_id,
            sku_name: sku?.sku_name || sku?.name || null,
            packaging_type_id: it.packaging_type_id || null,
            packaging_type_name: it.packaging_type_name,
            units_per_package: parseInt(it.units_per_package),
            quantity: parseInt(it.quantity),
            // Batch (when source tracks). batch_code is denormalised so the
            // persisted line item carries the human-readable code, but the
            // backend also re-hydrates it from the stock row.
            ...(sourceTracksBatches && it.batch_id ? {
              batch_id: it.batch_id,
              batch_code: it.batch_code || null,
            } : {}),
            // Rate is intentionally NOT sent — backend looks it up from the
            // destination distributor's commercials (distributor_margin_matrix).
          };
        }),
      };
      const res = await axios.post(`${API}/distributor/stock-transfers/`, payload, { headers: HEAD() });
      const out = res.data;
      if (out.zoho_status === 'synced') {
        toast.success(`Transfer ${out.transfer_number} created · ${out.zoho_doc_type === 'delivery_challan' ? 'Delivery Challan' : 'Invoice'} synced to Zoho`);
      } else if (out.zoho_status === 'failed') {
        toast.warning(`Transfer ${out.transfer_number} saved · Zoho push failed (you can retry)`);
      } else {
        toast.success(`Transfer ${out.transfer_number} created`);
      }
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Transfer failed');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="new-stock-transfer-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-emerald-600" /> New Stock Transfer</DialogTitle>
          <DialogDescription>
            Move stock between warehouses — <b>internal logistics only, no margin</b>. A Zoho <b>Delivery Challan</b> is created only when both warehouses are self-managed and share the <b>exact same GSTIN</b>. Different GSTIN of the same legal entity (same PAN) generates a Tax Invoice. Transfers to a <b>different PAN</b> (third-party distributor) are blocked — raise those via <b>Stock In</b> so margin and commission are tracked. Rates are <b>auto-fetched from the SKU's Base Price</b> (Settings → SKU Management) — they cannot be edited here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source + Destination */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Source warehouse *</Label>
              <Select value={form.source_location_id} onValueChange={(v) => setForm({ ...form, source_location_id: v, dest_location_id: '' })}>
                <SelectTrigger data-testid="source-warehouse-select"><SelectValue placeholder="Pick a warehouse with stock" /></SelectTrigger>
                <SelectContent>
                  {filteredSources.length === 0 && <SelectItem value="__none__" disabled>No self-managed warehouses with stock</SelectItem>}
                  {filteredSources.map((s) => (
                    <SelectItem key={s.location_id} value={s.location_id}>
                      {s.distributor_name} — {s.location_name} ({s.total_qty.toLocaleString('en-IN')} crates{s.is_factory ? ' · Factory' : ''})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Destination warehouse *</Label>
              <Select value={form.dest_location_id} onValueChange={(v) => setForm({ ...form, dest_location_id: v })} disabled={!form.source_location_id}>
                <SelectTrigger data-testid="dest-warehouse-select"><SelectValue placeholder={form.source_location_id ? 'Pick destination' : 'Pick source first'} /></SelectTrigger>
                <SelectContent>
                  {filteredTargets.length === 0 && (
                    <SelectItem value="__none__" disabled>
                      {sourceObj ? `No other warehouses share PAN ${sourceObj.pan || '—'}` : 'Pick a source first'}
                    </SelectItem>
                  )}
                  {filteredTargets.map((t) => (
                    <SelectItem key={t.location_id} value={t.location_id}>
                      {t.distributor_name} — {t.location_name}
                      {t.is_factory && ' · Factory'}
                      {t.is_self_managed && ' · self-managed'}
                      {t.gstin && ` · GSTIN ${t.gstin}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Document type preview */}
          {sourceObj && targetObj && (
            <div className={`text-xs px-3 py-2 rounded-md border flex items-center gap-2 ${docPreview === 'delivery_challan' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              <FileText className="h-3.5 w-3.5" />
              {docPreview === 'delivery_challan'
                ? <>Will create a <b>Delivery Challan</b> in Zoho — both warehouses are self-managed and share the exact same GSTIN ({sourceObj.gstin}).</>
                : <>Will create a <b>Tax Invoice</b> in Zoho ({sourceObj.gstin && targetObj.gstin && sourceObj.gstin !== targetObj.gstin
                    ? `different GSTIN: ${sourceObj.gstin} vs ${targetObj.gstin}`
                    : (!sourceObj.is_self_managed || !targetObj.is_self_managed) ? 'one or both warehouses are not self-managed' : 'GSTIN missing — set GSTIN on both distributors'}).</>}
            </div>
          )}

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Items *</Label>
              <Button size="sm" variant="outline" onClick={addItemRow} data-testid="add-item-row-btn"><Plus className="h-3.5 w-3.5 mr-1" />Add Item</Button>
            </div>
            <div className="space-y-3">
              {items.map((it, i) => {
                const sku = skus.find((s) => s.id === it.sku_id);
                const stockOutPkgs = sku?.packaging_config?.stock_out || [];
                const availUnits = stockBySku[it.sku_id] ?? 0;
                const availPackages = it.units_per_package > 0 ? Math.floor(availUnits / it.units_per_package) : 0;
                const over = it.units_per_package > 0 && Number(it.quantity) > availPackages;
                const totalUnits = (parseInt(it.quantity) || 0) * (parseInt(it.units_per_package) || 0);
                return (
                  <div key={i} className="border rounded-lg p-3 bg-white" data-testid={`item-row-${i}`}>
                    {/* Row 1: SKU + Packaging + Remove */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Select value={it.sku_id} onValueChange={(v) => setItemSku(i, v)}>
                          <SelectTrigger className="h-9 text-xs" data-testid={`item-sku-${i}`}><SelectValue placeholder="Pick SKU" /></SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            {skus.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.sku_name || s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-44">
                        {stockOutPkgs.length > 0 ? (
                          <select
                            className="w-full h-9 px-2 border rounded-md text-xs bg-white"
                            value={it.packaging_type_id || ''}
                            onChange={(e) => {
                              const pkg = stockOutPkgs.find((p) => p.packaging_type_id === e.target.value);
                              if (pkg) updateItem(i, {
                                packaging_type_id: pkg.packaging_type_id,
                                packaging_type_name: pkg.packaging_type_name,
                                units_per_package: pkg.units_per_package,
                              });
                            }}
                            data-testid={`item-pkg-${i}`}
                          >
                            {stockOutPkgs.map((pkg) => (
                              <option key={pkg.packaging_type_id} value={pkg.packaging_type_id}>{pkg.packaging_type_name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-slate-400">— pick SKU first —</span>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-red-600" onClick={() => removeItem(i)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {/* Row 1.5: Batch picker — only when source warehouse has track_batches=true */}
                    {sourceTracksBatches && it.sku_id && (
                      <div className="flex items-start gap-3 mt-2">
                        <div className="flex-1">
                          <Label className="text-[10px] text-slate-500 flex items-center gap-1">
                            Batch *
                            <span className="text-[9px] uppercase tracking-wider text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded px-1 py-px">FIFO</span>
                          </Label>
                          {it.batches_loading ? (
                            <div className="h-9 px-2 flex items-center text-xs text-slate-500">
                              <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Loading batches…
                            </div>
                          ) : it.batches_available.length === 0 ? (
                            <div className="h-9 px-2 flex items-center text-xs text-red-600 bg-red-50 border border-red-200 rounded-md">
                              No batches with stock at the source warehouse for this SKU.
                            </div>
                          ) : (
                            <select
                              className="w-full h-9 px-2 border rounded-md text-xs bg-white"
                              value={it.batch_id || ''}
                              onChange={(e) => {
                                const b = it.batches_available.find((x) => x.batch_id === e.target.value);
                                updateItem(i, { batch_id: e.target.value, batch_code: b?.batch_code || '' });
                              }}
                              data-testid={`item-batch-${i}`}
                            >
                              {it.batches_available.map((b) => (
                                <option key={b.batch_id || 'legacy'} value={b.batch_id || ''}>
                                  {b.batch_code} — {b.quantity} bottles{b.received_at ? ` · ${(b.received_at || '').slice(0, 10)}` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Row 2: Avail | Qty | Rate | Subtotal */}
                    <div className="flex items-start gap-3 mt-3">
                      <div className="w-20 text-center">
                        <Label className="text-[10px] text-slate-500">Avail</Label>
                        {it.sku_id ? (
                          <>
                            <p className={`text-base font-bold tabular-nums leading-tight ${availPackages > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{availPackages}</p>
                            <p className="text-[10px] text-slate-500 leading-tight">{it.packaging_type_name || 'pkg'}</p>
                          </>
                        ) : (
                          <p className="text-base text-slate-300 mt-1">—</p>
                        )}
                      </div>
                      <div className="flex-1">
                        <Label className="text-[10px] text-slate-500">Quantity (in {it.packaging_type_name || 'packages'}) *</Label>
                        <Input type="number" min="1" placeholder="0" value={it.quantity}
                          onChange={(e) => updateItem(i, { quantity: e.target.value })}
                          className={`h-9 text-sm ${over ? 'border-red-300 text-red-700' : ''}`}
                          data-testid={`item-qty-${i}`}
                        />
                        {over && <div className="text-[10px] text-red-600 mt-1">Only {availPackages} {it.packaging_type_name} available</div>}
                        {totalUnits > 0 && !over && (
                          <div className="text-[10px] text-slate-400 mt-1">= {totalUnits} bottles</div>
                        )}
                      </div>
                      <div className="flex-1">
                        <Label className="text-[10px] text-slate-500 flex items-center gap-1">
                          Rate per {it.packaging_type_name || 'package'}
                          <span className="text-[9px] uppercase tracking-wider text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded px-1 py-px">auto</span>
                        </Label>
                        <div className={`h-9 px-2 flex items-center text-sm rounded-md border bg-slate-50 ${
                          it.rate_status === 'ok' ? 'border-emerald-200 text-slate-800'
                          : it.rate_status === 'missing' ? 'border-red-300 text-red-700 bg-red-50'
                          : 'border-slate-200 text-slate-400'
                        }`} data-testid={`item-rate-auto-${i}`}>
                          {it.rate_status === 'loading' ? (
                            <span className="flex items-center gap-1.5 text-slate-500"><Loader2 className="h-3 w-3 animate-spin" /> Resolving…</span>
                          ) : it.rate_status === 'ok' ? (
                            <span className="tabular-nums">₹ {Number(it.rate).toFixed(2)}<span className="ml-1 text-[10px] text-slate-500">(₹ {Number(it.rate_per_bottle).toFixed(2)}/bottle)</span></span>
                          ) : it.rate_status === 'missing' ? (
                            <span className="text-[10px]">No commercial — set up first</span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Pick a SKU</span>
                          )}
                        </div>
                        {it.rate_status === 'missing' && it.rate_reason && (
                          <div className="text-[10px] text-red-600 mt-1" data-testid={`item-rate-reason-${i}`}>{it.rate_reason}</div>
                        )}
                      </div>
                      <div className="w-28 text-right">
                        <Label className="text-[10px] text-slate-500">Line Total</Label>
                        <p className="h-9 flex items-center justify-end text-sm font-semibold tabular-nums text-slate-700" data-testid={`item-line-total-${i}`}>
                          ₹ {((parseInt(it.quantity) || 0) * (parseFloat(it.rate) || 0)).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transfer metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Transfer Date</Label>
              <Input type="date" value={form.transfer_date} onChange={(e) => setForm({ ...form, transfer_date: e.target.value })} />
            </div>
            <div>
              <Label>Vehicle Number (for E-way bill)</Label>
              <Input value={form.vehicle_number} placeholder="e.g. KA01AB1234" onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Reason for transfer, internal reference, etc." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSubmit} disabled={!canSubmit || saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="submit-transfer-btn">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : <><ArrowLeftRight className="h-4 w-4 mr-2" />Create Transfer</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditQtyDialog({ transfer, onClose, onSaved }) {
  const [qtys, setQtys] = useState([]);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (transfer) {
      setQtys((transfer.items || []).map((it) => String(it.quantity ?? 0)));
      setReason('');
      setConfirming(false);
    }
  }, [transfer]);

  if (!transfer) return null;
  const items = transfer.items || [];

  const changed = items.some((it, i) => parseInt(qtys[i] || '0', 10) !== Number(it.quantity || 0));
  const allValid = qtys.every((q) => q !== '' && parseInt(q, 10) > 0);

  const deltas = items.map((it, i) => {
    const oldQ = Number(it.quantity || 0);
    const newQ = parseInt(qtys[i] || '0', 10) || 0;
    const upp = Number(it.units_per_package || 1);
    return { it, oldQ, newQ, deltaUnits: (newQ - oldQ) * upp, upp };
  });

  const submit = async () => {
    if (!allValid) { toast.error('Quantities must be whole numbers greater than 0'); return; }
    if (!changed) { toast.error('No quantity changes to save'); return; }
    setSaving(true);
    try {
      const body = { items: qtys.map((q) => ({ quantity: parseInt(q, 10) })), reason: reason || null };
      const { data } = await axios.patch(
        `${API}/distributor/stock-transfers/${transfer.id}/quantities`, body, { headers: HEAD() },
      );
      toast.success(data?.message || 'Quantities updated');
      if (data?.zoho_sync === 'failed') {
        toast.warning('Zoho document could not be updated automatically — update it manually in Zoho Books.');
      }
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update quantities');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!transfer} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-2xl" data-testid="edit-transfer-qty-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-amber-600" /> Edit Quantities — {transfer.transfer_number}
          </DialogTitle>
          <DialogDescription>
            Adjust line quantities for this <b>completed</b> transfer. The change is applied as a delta to both
            warehouses and reflects in the Stock Dashboard. {transfer.zoho_status === 'synced' && 'The linked Zoho document will be updated in place. '}
            This is logged for audit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left p-2.5 font-medium">SKU</th>
                  <th className="text-center p-2.5 font-medium">Current</th>
                  <th className="text-center p-2.5 font-medium">New Qty</th>
                  <th className="text-right p-2.5 font-medium">Δ Units</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const d = deltas[i];
                  return (
                    <tr key={i} className="border-t border-slate-100" data-testid={`edit-qty-row-${i}`}>
                      <td className="p-2.5">
                        <div className="font-medium text-slate-800">{it.sku_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {it.packaging_type_name || 'package'} · {it.units_per_package}/pkg
                          {it.batch_code ? ` · Batch ${it.batch_code}` : ''}
                        </div>
                      </td>
                      <td className="p-2.5 text-center text-slate-600">{it.quantity}</td>
                      <td className="p-2.5">
                        <Input
                          type="number" min="1" disabled={confirming || saving}
                          className="h-8 w-24 mx-auto text-center"
                          value={qtys[i] ?? ''}
                          onChange={(e) => setQtys((p) => p.map((q, j) => (j === i ? e.target.value : q)))}
                          data-testid={`edit-qty-input-${i}`}
                        />
                      </td>
                      <td className={`p-2.5 text-right font-mono ${d.deltaUnits === 0 ? 'text-slate-400' : d.deltaUnits > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {d.deltaUnits > 0 ? '+' : ''}{d.deltaUnits}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <Label className="text-xs text-slate-500">Reason (optional)</Label>
            <Textarea
              rows={2} placeholder="e.g. Miscount at dispatch — corrected after physical verification"
              value={reason} onChange={(e) => setReason(e.target.value)} disabled={confirming || saving}
              data-testid="edit-qty-reason"
            />
          </div>

          {confirming && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm" data-testid="edit-qty-confirm-panel">
              <div className="flex items-center gap-2 font-medium text-amber-800">
                <AlertTriangle className="h-4 w-4" /> Confirm stock adjustment
              </div>
              <ul className="mt-2 space-y-1 text-amber-900">
                {deltas.filter((d) => d.newQ !== d.oldQ).map((d, i) => (
                  <li key={i}>
                    <b>{d.it.sku_name}</b>: {d.oldQ} → {d.newQ} {d.it.packaging_type_name || 'pkg'}
                    {' '}({d.deltaUnits > 0 ? '+' : ''}{d.deltaUnits} units {d.deltaUnits > 0 ? 'deducted from source, added to destination' : 'returned to source, removed from destination'})
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-amber-700">Source warehouse stock may go negative if it doesn't have enough on-hand.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving} data-testid="edit-qty-cancel">Cancel</Button>
          {!confirming ? (
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!changed || !allValid}
              onClick={() => setConfirming(true)}
              data-testid="edit-qty-review-btn"
            >
              Review changes
            </Button>
          ) : (
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={saving}
              onClick={submit}
              data-testid="edit-qty-confirm-btn"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              Confirm &amp; Apply
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StockTransfers() {
  const { user } = useAuth();
  const canEditQty = QTY_EDIT_ROLES.includes(user?.role);
  const [editTransfer, setEditTransfer] = useState(null);
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const { data } = await axios.get(`${API}/distributor/stock-transfers/?${params}`, { headers: HEAD() });
      setData(data || { items: [], total: 0, pages: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load transfers');
    } finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const retryZoho = async (id) => {
    try {
      const { data } = await axios.post(`${API}/distributor/stock-transfers/${id}/retry-zoho`, {}, { headers: HEAD() });
      if (data?.transfer?.zoho_status === 'synced') toast.success('Zoho push succeeded');
      else toast.warning(`Zoho push still failing: ${data?.transfer?.zoho_error || 'unknown error'}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Retry failed'); }
  };

  const downloadZohoPdf = async (transfer) => {
    try {
      const res = await axios.get(`${API}/distributor/stock-transfers/${transfer.id}/zoho-pdf`, {
        headers: HEAD(),
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      // Prefer the filename Zoho gave us via Content-Disposition; fall back
      // to the transfer number so it stays meaningful even if the header is stripped.
      let filename = `${transfer.zoho_doc_type === 'delivery_challan' ? 'DC' : 'INV'}-${transfer.transfer_number}.pdf`;
      const cd = res.headers['content-disposition'];
      if (cd) {
        const match = cd.match(/filename="?([^"]+)"?/i);
        if (match) filename = match[1];
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (e) {
      let msg = 'Failed to download PDF';
      // axios returns the error body as a Blob when responseType is blob —
      // we need to read it back to a string to surface Zoho's actual error.
      if (e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const parsed = JSON.parse(text);
          msg = parsed.detail || msg;
        } catch { msg = e.response?.statusText || msg; }
      } else {
        msg = e.response?.data?.detail || msg;
      }
      toast.error(msg);
    }
  };

  const downloadEwayBill = async (transfer) => {
    try {
      const { data } = await axios.get(`${API}/distributor/stock-transfers/${transfer.id}/eway-bill`, { headers: HEAD() });
      if (data?.warnings?.length) {
        toast.warning(`E-way Bill JSON generated with ${data.warnings.length} warning(s) — review the payload before uploading.`, {
          description: data.warnings.slice(0, 3).join(' · '),
          duration: 6000,
        });
      } else {
        toast.success(`E-way Bill JSON ready (₹ ${data?.totals?.grand_total?.toLocaleString('en-IN') || 0} ${data?.is_inter_state ? '· inter-state IGST' : '· intra-state CGST+SGST'})`);
      }
      const blob = new Blob([JSON.stringify(data.bulk_payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eway-bill-${transfer.transfer_number}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to generate E-way Bill JSON');
    }
  };

  const [reversingId, setReversingId] = useState(null);
  const reverseTransfer = async (t) => {
    if (!window.confirm(
      `Reverse transfer ${t.transfer_number}?\n\n` +
      `• Stock will be restored: added back to ${t.source_location_name} and deducted from ${t.dest_location_name}.\n` +
      `• The Zoho ${t.zoho_doc_type === 'delivery_challan' ? 'delivery challan will be DELETED' : 'invoice will be VOIDED'}.\n\n` +
      `This cannot be undone.`
    )) return;
    setReversingId(t.id);
    try {
      const { data } = await axios.post(`${API}/distributor/stock-transfers/${t.id}/reverse`, {}, { headers: HEAD() });
      toast.success(data?.message || `Transfer ${t.transfer_number} reversed`);
      if (data?.zoho_cleanup_pending) {
        toast.warning(`Zoho cleanup pending: ${data?.zoho_cleanup_error || 'unknown error'} — use Cleanup to retry.`);
      }
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to reverse transfer');
    } finally {
      setReversingId(null);
    }
  };

  const retryReverseCleanup = async (t) => {
    setReversingId(t.id);
    try {
      await axios.post(`${API}/distributor/stock-transfers/${t.id}/reverse-zoho-cleanup`, {}, { headers: HEAD() });
      toast.success('Zoho cleanup completed');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Zoho cleanup still failing');
    } finally {
      setReversingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="stock-transfers-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-emerald-600" /> Stock Transfers
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Move stock between warehouses (internal logistics — <b>no margin</b>). Same GSTIN → Delivery Challan; different GSTIN of the same legal entity (same PAN) → Tax Invoice at the SKU's Base Price. Cross-PAN sales are blocked — use <b>Stock In</b> instead.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-stock-transfer-btn">
          <Plus className="h-4 w-4 mr-2" /> New Stock Transfer
        </Button>
      </div>

      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by transfer #, distributor, warehouse…" className="pl-9 w-72" />
            </div>
            {search && (
              <Button variant="ghost" size="sm" onClick={() => setSearch('')}><X className="h-4 w-4" /></Button>
            )}
            <div className="ml-auto text-xs text-slate-500">{data.total || 0} transfers</div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-emerald-100/60 rounded-xl shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
        <CardContent className="p-0">
          <div
            className="flex items-center gap-2 border-b border-emerald-100/60 bg-emerald-50/30 px-4 py-1.5 text-[11px] text-slate-600"
            data-testid="units-banner"
          >
            <Package className="h-3.5 w-3.5 text-slate-400" />
            <span>
              Quantities in <span className="font-semibold text-slate-700">crates</span>
              <span className="text-slate-400"> — except </span>
              <span className="font-semibold text-emerald-700">Empty Bottles</span>
              <span className="text-slate-400"> (raw bottles)</span>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-emerald-50/30 border-b border-emerald-100/60">
                  {['Transfer #', 'Date', 'Source → Destination', 'Items', 'Doc Type', 'Zoho', 'Created By'].map((h) => (
                    <th key={h} className="text-left p-3 text-[10px] uppercase tracking-wider font-semibold text-emerald-800/70">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600 mx-auto" /></td></tr>
                ) : (data.items || []).length === 0 ? (
                  <tr><td colSpan={7} className="p-10 text-center text-slate-500">No stock transfers yet. Click <b>+ New Stock Transfer</b> above to create one.</td></tr>
                ) : (data.items || []).map((t, i) => (
                  <tr key={t.id} className={`border-b border-emerald-50 ${i % 2 === 1 ? 'bg-emerald-50/40' : 'bg-white'} hover:bg-emerald-50/60`} data-testid={`transfer-row-${t.id}`}>
                    <td className="p-3 font-mono text-xs text-emerald-700">{t.transfer_number}</td>
                    <td className="p-3 text-xs text-slate-600">{fmtDate(t.transfer_date)}</td>
                    <td className="p-3 text-xs">
                      <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" />{t.source_distributor_name}</div>
                      <div className="ml-5 text-slate-500">{t.source_location_name}{t.source_gstin && <span className="ml-2 text-[10px] font-mono text-emerald-700">{t.source_gstin}</span>}</div>
                      <div className="my-1 ml-5 text-slate-400">↓</div>
                      <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" />{t.dest_distributor_name}</div>
                      <div className="ml-5 text-slate-500">{t.dest_location_name}{t.dest_gstin && <span className="ml-2 text-[10px] font-mono text-emerald-700">{t.dest_gstin}</span>}</div>
                    </td>
                    <td className="p-3 text-xs">
                      <div className="flex items-center gap-1"><Package className="h-3.5 w-3.5 text-slate-400" /><b>{t.total_packages ?? t.total_quantity ?? 0}</b> packages · {t.items?.length || 0} SKU{(t.items?.length || 0) !== 1 ? 's' : ''}</div>
                      <div className="text-[10px] text-slate-500 ml-5">
                        {(t.items || []).slice(0, 2).map((it, idx) => (
                          <div key={idx}>{it.quantity} {it.packaging_type_name || 'units'} · {it.sku_name}</div>
                        ))}
                        {(t.items || []).length > 2 && <div>+{t.items.length - 2} more…</div>}
                      </div>
                      {t.vehicle_number && <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-1 ml-5"><Truck className="h-3 w-3" /> {t.vehicle_number}</div>}
                    </td>
                    <td className="p-3"><DocBadge type={t.zoho_doc_type} /></td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={t.zoho_status} error={t.zoho_error} />
                        {t.zoho_invoice_url && (
                          <a href={t.zoho_invoice_url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:text-emerald-800" title="Open in Zoho">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {t.zoho_status === 'synced' && t.zoho_invoice_id && (
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-[10px] text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                            onClick={() => downloadZohoPdf(t)}
                            title={`Download ${t.zoho_doc_type === 'delivery_challan' ? 'Delivery Challan' : 'Invoice'} PDF from Zoho`}
                            data-testid={`zoho-pdf-btn-${t.id}`}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            {t.zoho_doc_type === 'delivery_challan' ? 'Challan' : 'Invoice'} PDF
                          </Button>
                        )}
                        {t.zoho_status === 'failed' && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => retryZoho(t.id)} title="Retry Zoho push" data-testid={`retry-zoho-${t.id}`}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {Number(t.total_value || 0) > 50000 && (
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 text-[10px] text-indigo-700 hover:text-indigo-800 hover:bg-indigo-50"
                            onClick={() => downloadEwayBill(t)}
                            title={`Total ₹${Number(t.total_value).toLocaleString('en-IN')} — exceeds ₹50,000 threshold. Download E-way Bill JSON.`}
                            data-testid={`eway-bill-btn-${t.id}`}
                          >
                            <Download className="h-3 w-3 mr-1" /> E-way Bill
                          </Button>
                        )}
                        {t.zoho_status === 'synced' && t.zoho_invoice_id && (
                          <ShareButton
                            documentType="stock_transfer_doc"
                            documentId={t.id}
                            label="Share"
                            className="h-7 px-2 text-[10px] text-teal-700 hover:text-teal-800 hover:bg-teal-50"
                            testId={`transfer-${t.id}`}
                          />
                        )}
                        {t.status === 'reversed' ? (
                          <>
                            <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200" data-testid={`reversed-badge-${t.id}`}>
                              <Undo2 className="h-3 w-3 mr-1" />Reversed
                            </Badge>
                            {t.zoho_cleanup_pending && (
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 px-2 text-[10px] text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                                onClick={() => retryReverseCleanup(t)}
                                disabled={reversingId === t.id}
                                title={`Zoho cleanup pending: ${t.zoho_cleanup_error || ''} — retry`}
                                data-testid={`reverse-cleanup-btn-${t.id}`}
                              >
                                {reversingId === t.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />} Cleanup
                              </Button>
                            )}
                          </>
                        ) : (
                          <>
                            {canEditQty && (
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 px-2 text-[10px] text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                                onClick={() => setEditTransfer(t)}
                                title="Edit line quantities (CEO / System Admin) — adjusts stock in both warehouses"
                                data-testid={`edit-qty-btn-${t.id}`}
                              >
                                <Pencil className="h-3 w-3 mr-1" /> Edit Qty
                              </Button>
                            )}
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 px-2 text-[10px] text-rose-700 hover:text-rose-800 hover:bg-rose-50"
                              onClick={() => reverseTransfer(t)}
                              disabled={reversingId === t.id}
                              title="Reverse this transfer — restore stock in both warehouses and void/delete the Zoho document"
                              data-testid={`reverse-transfer-btn-${t.id}`}
                            >
                              {reversingId === t.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Undo2 className="h-3 w-3 mr-1" />} Reverse
                            </Button>
                          </>
                        )}
                      </div>
                      {t.zoho_status === 'failed' && t.zoho_error && (
                        <div className="text-[10px] text-red-600 mt-1 max-w-[200px] truncate" title={t.zoho_error}>{t.zoho_error}</div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-600">{t.created_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <NewTransferDialog open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setPage(1); load(); }} />
      <EditQtyDialog transfer={editTransfer} onClose={() => setEditTransfer(null)} onSaved={load} />
    </div>
  );
}
