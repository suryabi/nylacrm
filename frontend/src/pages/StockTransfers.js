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
  RefreshCw, FileText, Package, Building2, Download, Undo2, Pencil, ShieldCheck, Tag,
  MoreHorizontal, Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ShareDialog } from '../components/share/ShareButton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import RetroCategorizeDialog from '../components/distributor/RetroCategorizeDialog';
import { useAuth } from '../context/AuthContext';

const QTY_EDIT_ROLES = ['CEO', 'System Admin'];
const RETRO_ROLES = ['CEO', 'Admin', 'System Admin'];

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

function NewTransferDialog({ open, onClose, onCreated, prefill }) {
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
    child_sku_id: '', child_sku_name: '',
  }]);
  const [saving, setSaving] = useState(false);
  const [stockBySku, setStockBySku] = useState({}); // sku_id -> available units (at chosen source)
  const [stockByChild, setStockByChild] = useState({}); // sku_id -> [{child_sku_id, child_sku_name, quantity}]

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
      child_sku_id: '', child_sku_name: '',
    }]);
    setStockBySku({});
    setStockByChild({});
    (async () => {
      try {
        const [srcRes, skusRes] = await Promise.all([
          axios.get(`${API}/distributor/stock-transfers/eligible-sources`, { headers: HEAD() }),
          axios.get(`${API}/master-skus`, { headers: HEAD() }).catch(() => ({ data: { skus: [] } })),
        ]);
        setSources(srcRes.data?.sources || []);
        const skuList = skusRes.data?.skus || skusRes.data || [];
        setSkus(skuList);
        // Prefill from an approved stock transfer request (warehouse picks source + batches).
        if (prefill) {
          setForm((f) => ({ ...f, dest_location_id: prefill.dest_location_id || '' }));
          const rows = (prefill.items || []).map((ri) => {
            const sku = skuList.find((s) => s.id === ri.sku_id);
            const stockOutPkgs = sku?.packaging_config?.stock_out || [];
            // Prefer the exact packaging the requester picked; fall back to default.
            const reqPkg = ri.packaging_type_id
              ? stockOutPkgs.find((p) => p.packaging_type_id === ri.packaging_type_id)
              : null;
            const defaultPkg = reqPkg || stockOutPkgs.find((p) => p.is_default) || stockOutPkgs[0];
            const upp = defaultPkg?.units_per_package || 0;
            return {
              sku_id: ri.sku_id, packaging_type_id: defaultPkg?.packaging_type_id || '',
              packaging_type_name: defaultPkg?.packaging_type_name || '', units_per_package: upp,
              quantity: reqPkg && ri.packages ? String(ri.packages)
                : (upp ? String(Math.ceil(ri.quantity_units / upp)) : ''),
              rate: 0, rate_per_bottle: 0, rate_status: 'idle', rate_reason: '', rate_details: null,
              batch_id: '', batch_code: '', batches_available: [], batches_loading: false,
              child_sku_id: '', child_sku_name: '',
            };
          });
          if (rows.length) setItems(rows);
        }
      } catch (e) {
        toast.error('Failed to load eligible warehouses');
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!form.source_location_id) { setTargets([]); setStockBySku({}); setStockByChild({}); return; }
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
          const childMap = {};
          (stockRes?.data?.stock_by_child || []).forEach((s) => {
            (childMap[s.sku_id] = childMap[s.sku_id] || []).push(s);
          });
          setStockByChild(childMap);
          // Classification is per-warehouse — reset any stale selections.
          setItems((p) => p.map((it) => ({ ...it, child_sku_id: '', child_sku_name: '' })));
        }
      } catch { /* no-op */ }
    })();
  }, [form.source_location_id, sources]);

  const addItemRow = () => setItems((p) => [
    ...p,
    { sku_id: '', packaging_type_id: '', packaging_type_name: '', units_per_package: 0, quantity: '',
      rate: 0, rate_per_bottle: 0, rate_status: 'idle', rate_reason: '', rate_details: null,
      batch_id: '', batch_code: '', batches_available: [], batches_loading: false,
      child_sku_id: '', child_sku_name: '' },
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
      child_sku_id: '', child_sku_name: '',
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
      const currentValid = it => batches.some((b) => b.batch_id === it.batch_id && (b.child_sku_id || '') === (it.child_sku_id || ''));
      updateItem(idx, {
        batches_available: batches,
        batches_loading: false,
        // Only auto-pick if user hasn't already chosen something valid.
        ...(item.batch_id && currentValid(item) ? {} : {
          batch_id: first?.batch_id || '',
          batch_code: first?.batch_code || '',
          child_sku_id: first?.child_sku_id || '',
          child_sku_name: first?.child_sku_name || '',
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
        request_id: prefill?.request_id || null,
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
            // Classification (Model C): null/absent = Generic.
            ...(it.child_sku_id ? {
              child_sku_id: it.child_sku_id,
              child_sku_name: it.child_sku_name || null,
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
          {prefill && (
            <div className="text-xs px-3 py-2 rounded-md border bg-violet-50 border-violet-200 text-violet-800 flex items-center gap-2" data-testid="fulfilling-request-banner">
              <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
              Fulfilling request <b>{prefill.request_number}</b> → {prefill.dest_location_name}. Quantities are editable; pick the source warehouse and batches.
            </div>
          )}
          {/* Source + Destination */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Source warehouse *</Label>
              <Select value={form.source_location_id} onValueChange={(v) => setForm({ ...form, source_location_id: v, dest_location_id: prefill?.dest_location_id || '' })}>
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
                <SelectTrigger data-testid="dest-warehouse-select">
                  {prefill && form.dest_location_id === prefill.dest_location_id
                    ? <span>{prefill.dest_location_name}</span>
                    : <SelectValue placeholder={form.source_location_id ? 'Pick destination' : 'Pick source first'} />}
                </SelectTrigger>
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
                // Classification-aware availability (Model C). When the source
                // holds customer-branded child stock for this SKU, the user picks
                // a classification and availability is scoped to it.
                const childRows = stockByChild[it.sku_id] || [];
                const hasBrandedStock = childRows.some((c) => c.child_sku_id);
                let availUnits;
                if (sourceTracksBatches && it.batch_id !== undefined && it.batches_available.length > 0) {
                  const selRow = it.batches_available.find((b) => (b.batch_id || '') === (it.batch_id || '') && (b.child_sku_id || '') === (it.child_sku_id || ''));
                  availUnits = selRow ? selRow.quantity : 0;
                } else if (hasBrandedStock) {
                  const selCls = childRows.find((c) => (c.child_sku_id || '') === (it.child_sku_id || ''));
                  availUnits = selCls?.quantity ?? 0;
                } else {
                  availUnits = stockBySku[it.sku_id] ?? 0;
                }
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
                              value={`${it.batch_id || ''}||${it.child_sku_id || ''}`}
                              onChange={(e) => {
                                const [bid, cid] = e.target.value.split('||');
                                const b = it.batches_available.find((x) => (x.batch_id || '') === bid && (x.child_sku_id || '') === cid);
                                updateItem(i, {
                                  batch_id: bid, batch_code: b?.batch_code || '',
                                  child_sku_id: b?.child_sku_id || '', child_sku_name: b?.child_sku_name || '',
                                });
                              }}
                              data-testid={`item-batch-${i}`}
                            >
                              {it.batches_available.map((b) => (
                                <option key={`${b.batch_id || 'legacy'}-${b.child_sku_id || 'gen'}`} value={`${b.batch_id || ''}||${b.child_sku_id || ''}`}>
                                  {b.batch_code}{b.child_sku_id ? ` [${b.child_sku_name}]` : ' [Generic]'} — {b.quantity} bottles{b.received_at ? ` · ${(b.received_at || '').slice(0, 10)}` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Row 1.6: Classification picker — when the source holds customer-branded
                        child stock for this SKU and batches aren't tracked (batch rows already
                        carry the classification). Generic is the default. */}
                    {!sourceTracksBatches && it.sku_id && hasBrandedStock && (
                      <div className="flex items-start gap-3 mt-2">
                        <div className="flex-1">
                          <Label className="text-[10px] text-slate-500">Classification</Label>
                          <select
                            className="w-full h-9 px-2 border rounded-md text-xs bg-white"
                            value={it.child_sku_id || ''}
                            onChange={(e) => {
                              const c = childRows.find((x) => (x.child_sku_id || '') === e.target.value);
                              updateItem(i, { child_sku_id: e.target.value, child_sku_name: c?.child_sku_name || '' });
                            }}
                            data-testid={`item-classification-${i}`}
                          >
                            {childRows.map((c) => (
                              <option key={c.child_sku_id || 'gen'} value={c.child_sku_id || ''}>
                                {c.child_sku_id ? c.child_sku_name : 'Generic (unbranded)'} — {c.quantity} bottles
                              </option>
                            ))}
                          </select>
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

function TransferDetailDialog({ transfer, onClose }) {
  if (!transfer) return null;
  const t = transfer;
  const items = t.items || [];
  const branded = items.filter((it) => it.child_sku_id);
  const generic = items.filter((it) => !it.child_sku_id);
  const sumQty = (arr) => arr.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const sumUnits = (arr) => arr.reduce((s, it) => s + (Number(it.quantity_units) || 0), 0);
  const sumValue = (arr) => arr.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0);
  const totalUnits = sumUnits(items);
  const totalValue = Number(t.total_value) || sumValue(items);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="transfer-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ArrowLeftRight className="h-5 w-5 text-emerald-600" />
            <span className="font-mono">{t.transfer_number}</span>
            <DocBadge type={t.zoho_doc_type} />
            <StatusBadge status={t.zoho_status} error={t.zoho_error} />
            {t.status === 'reversed' && (
              <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200"><Undo2 className="h-3 w-3 mr-1" />Reversed</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {fmtDate(t.transfer_date)} · created by {t.created_by_name}
            {t.zoho_invoice_number && <> · Zoho #{t.zoho_invoice_number}</>}
            {t.zoho_invoice_url && (
              <a href={t.zoho_invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 ml-1 text-emerald-700 hover:underline">
                open <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Route */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Source</p>
            <p className="font-medium text-slate-800">{t.source_distributor_name}</p>
            <p className="text-xs text-slate-500">{t.source_location_name}</p>
            {t.source_gstin && <p className="text-[10px] font-mono text-emerald-700">{t.source_gstin}</p>}
          </div>
          <ArrowLeftRight className="h-4 w-4 text-emerald-500" />
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Destination</p>
            <p className="font-medium text-slate-800">{t.dest_distributor_name}</p>
            <p className="text-xs text-slate-500">{t.dest_location_name}</p>
            {t.dest_gstin && <p className="text-[10px] font-mono text-emerald-700">{t.dest_gstin}</p>}
          </div>
        </div>

        {/* Items */}
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm" data-testid="transfer-detail-items-table">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b">
                <th className="p-2.5 text-left font-medium">SKU</th>
                <th className="p-2.5 text-left font-medium">Branding / Child SKU</th>
                <th className="p-2.5 text-right font-medium">Qty</th>
                <th className="p-2.5 text-right font-medium">Rate</th>
                <th className="p-2.5 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-b last:border-0" data-testid={`transfer-detail-item-${idx}`}>
                  <td className="p-2.5">
                    <p className="font-medium text-slate-800">{it.sku_name}</p>
                    {it.batch_code && <p className="text-[10px] font-mono text-slate-400">{it.batch_code}</p>}
                  </td>
                  <td className="p-2.5">
                    {it.child_sku_id ? (
                      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[11px]">
                        <Tag className="h-3 w-3 mr-1" />{it.child_sku_name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400">Generic (unbranded)</span>
                    )}
                  </td>
                  <td className="p-2.5 text-right whitespace-nowrap">
                    <span className="font-semibold text-slate-800">{it.quantity}</span>
                    {it.packaging_type_name && (
                      <>
                        <span className="mx-1 text-slate-400">×</span>
                        <span className="text-xs text-emerald-700 font-medium">{it.packaging_type_name}</span>
                      </>
                    )}
                    {it.quantity_units ? <p className="text-[10px] text-slate-400">{Number(it.quantity_units).toLocaleString('en-IN')} bottles</p> : null}
                  </td>
                  <td className="p-2.5 text-right text-slate-600">{it.rate ? `₹${Number(it.rate).toLocaleString('en-IN')}` : '—'}</td>
                  <td className="p-2.5 text-right text-slate-800">{it.rate ? `₹${(Number(it.quantity) * Number(it.rate)).toLocaleString('en-IN')}` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t font-medium">
                <td className="p-2.5 text-slate-700" colSpan={2}>Total · {items.length} SKU line{items.length !== 1 ? 's' : ''}</td>
                <td className="p-2.5 text-right text-slate-800">
                  {t.total_packages ?? t.total_quantity ?? sumQty(items)}
                  {totalUnits ? <p className="text-[10px] font-normal text-slate-400">{totalUnits.toLocaleString('en-IN')} bottles</p> : null}
                </td>
                <td className="p-2.5" />
                <td className="p-2.5 text-right text-slate-800">{totalValue ? `₹${totalValue.toLocaleString('en-IN')}` : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Branding summary */}
        <div className="grid grid-cols-2 gap-3" data-testid="transfer-detail-branding-summary">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
            <p className="text-[10px] uppercase tracking-wider text-indigo-500">Customer-branded (child SKUs)</p>
            <p className="text-lg font-bold text-indigo-700">{sumQty(branded)} <span className="text-xs font-normal">across {branded.length} line{branded.length !== 1 ? 's' : ''}</span></p>
            {branded.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {branded.map((it, bi) => (
                  <p key={bi} className="text-[11px] text-indigo-700 truncate">{it.quantity} × {it.child_sku_name}</p>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Generic (unbranded)</p>
            <p className="text-lg font-bold text-slate-700">{sumQty(generic)} <span className="text-xs font-normal">across {generic.length} line{generic.length !== 1 ? 's' : ''}</span></p>
          </div>
        </div>

        {(t.vehicle_number || t.notes) && (
          <div className="text-xs text-slate-600 space-y-1">
            {t.vehicle_number && <p className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-slate-400" /> Vehicle: <b>{t.vehicle_number}</b></p>}
            {t.notes && <p className="text-slate-500">Notes: {t.notes}</p>}
          </div>
        )}
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

// ─────────────────────── Stock Transfer Requests ───────────────────────

const REQ_STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  fulfilled: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

function NewRequestDialog({ open, onClose, onCreated }) {
  const [dests, setDests] = useState([]);
  const [skus, setSkus] = useState([]);
  const [destId, setDestId] = useState('');
  const [reason, setReason] = useState('');
  const emptyRow = { sku_id: '', packaging_type_id: '', packaging_type_name: '', units_per_package: 0, quantity: '' };
  const [rows, setRows] = useState([{ ...emptyRow }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDestId(''); setReason(''); setRows([{ ...emptyRow }]);
    (async () => {
      try {
        const [tRes, sRes] = await Promise.all([
          axios.get(`${API}/distributor/stock-transfers/eligible-targets`, { headers: HEAD() }),
          axios.get(`${API}/master-skus`, { headers: HEAD() }).catch(() => ({ data: { skus: [] } })),
        ]);
        setDests((tRes.data?.targets || []).filter((t) => t.is_self_managed));
        setSkus(sRes.data?.skus || sRes.data || []);
      } catch { toast.error('Failed to load warehouses'); }
    })();
  }, [open]);

  const setRowSku = (i, skuId) => {
    const sku = skus.find((s) => s.id === skuId);
    const pkgs = sku?.packaging_config?.stock_out || [];
    const def = pkgs.find((p) => p.is_default) || pkgs[0];
    setRows((p) => p.map((x, xi) => xi === i ? {
      ...x, sku_id: skuId,
      packaging_type_id: def?.packaging_type_id || '',
      packaging_type_name: def?.packaging_type_name || '',
      units_per_package: def?.units_per_package || 0,
    } : x));
  };

  const setRowPkg = (i, pkgId) => {
    setRows((p) => p.map((x, xi) => {
      if (xi !== i) return x;
      const sku = skus.find((s) => s.id === x.sku_id);
      const pkg = (sku?.packaging_config?.stock_out || []).find((pp) => pp.packaging_type_id === pkgId);
      return { ...x, packaging_type_id: pkgId, packaging_type_name: pkg?.packaging_type_name || '', units_per_package: pkg?.units_per_package || 0 };
    }));
  };

  const rowUnits = (r) => (parseInt(r.quantity) || 0) * (r.units_per_package || 1);

  const canSubmit = destId && rows.some((r) => r.sku_id && Number(r.quantity) > 0)
    && rows.every((r) => !r.sku_id || Number(r.quantity) > 0);

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        dest_location_id: destId,
        reason: reason || null,
        items: rows.filter((r) => r.sku_id && Number(r.quantity) > 0)
          .map((r) => ({
            sku_id: r.sku_id,
            quantity_units: rowUnits(r),
            packaging_type_id: r.packaging_type_id || null,
            packaging_type_name: r.packaging_type_name || null,
            units_per_package: r.units_per_package || null,
            packages: r.units_per_package ? parseInt(r.quantity) : null,
          })),
      };
      const res = await axios.post(`${API}/stock-transfer-requests`, payload, { headers: HEAD() });
      toast.success(`Request ${res.data.request_number} submitted for approval`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit request');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="new-transfer-request-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-violet-600" /> Request Stock Transfer</DialogTitle>
          <DialogDescription>
            Pick the destination warehouse and the SKUs + quantities you need. The warehouse team decides the source and batches after approval.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Destination warehouse *</Label>
            <Select value={destId} onValueChange={setDestId}>
              <SelectTrigger data-testid="request-dest-select"><SelectValue placeholder="Where do you need the stock?" /></SelectTrigger>
              <SelectContent>
                {dests.map((t) => (
                  <SelectItem key={t.location_id} value={t.location_id}>
                    {t.distributor_name} — {t.location_name}{t.is_factory ? ' · Factory' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>SKUs & quantities *</Label>
              <Button size="sm" variant="outline" onClick={() => setRows((p) => [...p, { ...emptyRow }])} data-testid="request-add-row-btn">
                <Plus className="h-3.5 w-3.5 mr-1" />Add
              </Button>
            </div>
            <div className="space-y-2">
              {rows.map((r, i) => {
                const sku = skus.find((s) => s.id === r.sku_id);
                const pkgOptions = sku?.packaging_config?.stock_out || [];
                return (
                  <div key={i} className="rounded-lg border border-slate-200 p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Select value={r.sku_id} onValueChange={(v) => setRowSku(i, v)}>
                          <SelectTrigger className="h-9 text-xs" data-testid={`request-sku-${i}`}><SelectValue placeholder="Pick SKU" /></SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            {skus.map((s) => <SelectItem key={s.id} value={s.id}>{s.sku_name || s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {rows.length > 1 && (
                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-red-600" onClick={() => setRows((p) => p.filter((_, xi) => xi !== i))}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {r.sku_id && (
                      <div className="flex items-center gap-2">
                        {pkgOptions.length > 0 ? (
                          <div className="flex-1">
                            <Select value={r.packaging_type_id} onValueChange={(v) => setRowPkg(i, v)}>
                              <SelectTrigger className="h-9 text-xs" data-testid={`request-packaging-${i}`}><SelectValue placeholder="Packaging" /></SelectTrigger>
                              <SelectContent>
                                {pkgOptions.map((p) => (
                                  <SelectItem key={p.packaging_type_id} value={p.packaging_type_id}>
                                    {p.packaging_type_name} ({p.units_per_package}/pack){p.is_default ? ' · default' : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <span className="flex-1 text-[11px] text-slate-400 px-1">No packaging configured — quantity in bottles</span>
                        )}
                        <Input
                          type="number" min="1"
                          placeholder={r.units_per_package ? 'Qty (packs)' : 'Qty (bottles)'}
                          value={r.quantity}
                          onChange={(e) => setRows((p) => p.map((x, xi) => xi === i ? { ...x, quantity: e.target.value } : x))}
                          className="h-9 w-28 text-sm"
                          data-testid={`request-qty-${i}`}
                        />
                      </div>
                    )}
                    {r.sku_id && Number(r.quantity) > 0 && r.units_per_package > 0 && (
                      <p className="text-[11px] text-blue-600 px-1" data-testid={`request-units-hint-${i}`}>
                        = {rowUnits(r)} bottles
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Reason / notes</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this stock needed?" data-testid="request-reason" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || saving} className="bg-violet-600 hover:bg-violet-700" data-testid="submit-request-btn">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestActionDialog({ action, onClose, onDone }) {
  // action: { type: 'approve'|'reject', req } | null
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRemark(''); }, [action]);
  if (!action) return null;
  const { type, req } = action;
  const submit = async () => {
    setSaving(true);
    try {
      await axios.post(`${API}/stock-transfer-requests/${req.id}/${type}`, { remark: remark || null }, { headers: HEAD() });
      toast.success(`Request ${req.request_number} ${type === 'approve' ? 'approved' : 'rejected'}`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm" data-testid="request-action-dialog">
        <DialogHeader>
          <DialogTitle>{type === 'approve' ? 'Approve' : 'Reject'} {req.request_number}?</DialogTitle>
          <DialogDescription>
            {(req.items || []).map((it) => it.packages && it.packaging_type_name
              ? `${it.sku_name} × ${it.packages} ${it.packaging_type_name} (${it.quantity_units} bottles)`
              : `${it.sku_name} × ${it.quantity_units}`).join(', ')} → {req.dest_location_name}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs">Remark {type === 'reject' ? '(recommended)' : '(optional)'}</Label>
          <Textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} data-testid="request-action-remark" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit} disabled={saving}
            className={type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
            data-testid="request-action-confirm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (type === 'approve' ? 'Approve' : 'Reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StockTransfers() {
  const { user } = useAuth();
  const canEditQty = QTY_EDIT_ROLES.includes(user?.role);
  const canRetro = RETRO_ROLES.includes(user?.role);
  const [editTransfer, setEditTransfer] = useState(null);
  const [shareTransfer, setShareTransfer] = useState(null);
  const [detailTransfer, setDetailTransfer] = useState(null);
  const [retroTarget, setRetroTarget] = useState(null);
  // ── Stock transfer requests (request → approval → fulfillment) ──
  const [view, setView] = useState(() =>
    new URLSearchParams(window.location.search).get('tab') === 'requests' ? 'requests' : 'transfers');
  const [requests, setRequests] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqPerms, setReqPerms] = useState({ can_request: false, can_approve: false });
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [reqAction, setReqAction] = useState(null); // {type, req}
  const [prefillReq, setPrefillReq] = useState(null);
  // parent_sku_id set of SKUs that have at least one active customer child SKU
  const [customerParents, setCustomerParents] = useState(null);
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const loadRequests = useCallback(async () => {
    setReqLoading(true);
    try {
      const res = await axios.get(`${API}/stock-transfer-requests`, { headers: HEAD() });
      setRequests(res.data?.requests || []);
      setPendingCount(res.data?.pending_count || 0);
    } catch { /* module may be permission-gated */ }
    finally { setReqLoading(false); }
  }, []);

  useEffect(() => {
    axios.get(`${API}/stock-transfer-requests/my-permissions`, { headers: HEAD() })
      .then((res) => setReqPerms(res.data || {})).catch(() => {});
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (!canRetro || customerParents !== null) return;
    axios.get(`${API}/child-skus`, { headers: HEAD() }).then(res => {
      const set = new Set();
      (res.data?.child_skus || []).forEach(c => {
        if (c.child_type === 'customer' && c.is_active !== false) set.add(c.parent_sku_id);
      });
      setCustomerParents(set);
    }).catch(() => setCustomerParents(new Set()));
  }, [canRetro, customerParents]);

  const submitTransferRetro = (transferId) => async ({ itemKey, child_sku_id, quantity }) => {
    const res = await axios.post(`${API}/retro-categorize/transfer-item`, {
      transfer_id: transferId, item_index: Number(itemKey), child_sku_id, quantity,
    }, { headers: HEAD() });
    const d = res.data;
    toast.success(`Categorized as ${d.child_sku_name}${d.stock_moved_units ? ` — ${d.stock_moved_units} units reclassified at destination (${d.branding_entry_number})` : ''}`);
    load();
  };

  const openRetroDialog = (t) => {
    const items = (t.items || [])
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => !it.child_sku_id && customerParents?.has(it.sku_id))
      .map(({ it, idx }) => ({
        key: idx,
        sku_id: it.sku_id,
        sku_name: it.sku_name,
        quantity_units: it.quantity_units || (Number(it.quantity) || 0) * (Number(it.units_per_package) || 1),
        packaging_units: it.units_per_package,
        packaging_type_name: it.packaging_type_name,
        batch_code: it.batch_code,
      }));
    setRetroTarget({
      txType: 'transfer',
      txNumber: `Transfer ${t.transfer_number}`,
      distributorId: t.dest_distributor_id,
      items,
      onSubmit: submitTransferRetro(t.id),
    });
  };

  const exportTransfers = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const res = await axios.get(`${API}/distributor/stock-transfers/export?${params}`, {
        headers: HEAD(),
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock_transfers_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Stock Transfers exported');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to export transfers');
    } finally { setExporting(false); }
  };

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
        <div className="flex items-center gap-2">
          {reqPerms.can_request && (
            <Button variant="outline" onClick={() => setShowRequestDialog(true)} className="border-violet-300 text-violet-700 hover:bg-violet-50" data-testid="request-transfer-btn">
              <ShieldCheck className="h-4 w-4 mr-2" /> Request Transfer
            </Button>
          )}
          {view === 'transfers' && (
            <>
              <Button
                variant="outline"
                onClick={exportTransfers}
                disabled={exporting || (data.total || 0) === 0}
                data-testid="export-transfers-btn"
              >
                <Download className="h-4 w-4 mr-2" />
                {exporting ? 'Exporting…' : 'Download'}
              </Button>
              <Button onClick={() => setShowNew(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="new-stock-transfer-btn">
                <Plus className="h-4 w-4 mr-2" /> New Stock Transfer
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs: Transfers | Requests */}
      <div className="flex items-center gap-1 border-b border-emerald-100">
        {[['transfers', 'Transfers'], ['requests', 'Requests']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${view === k
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            data-testid={`transfers-tab-${k}`}
          >
            {label}
            {k === 'requests' && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 rounded-full px-1.5 py-px" data-testid="pending-requests-badge">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {view === 'requests' && (
        <Card className="border border-violet-100/60 rounded-xl">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-violet-50/40 border-b border-violet-100/60">
                    {['Request #', 'Date', 'Destination', 'Items (bottles)', 'Reason', 'Requested By', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="text-left p-3 text-[10px] uppercase tracking-wider font-semibold text-violet-800/70">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reqLoading ? (
                    <tr><td colSpan={8} className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin text-violet-600 mx-auto" /></td></tr>
                  ) : requests.length === 0 ? (
                    <tr><td colSpan={8} className="p-10 text-center text-slate-500">No transfer requests yet{reqPerms.can_request ? <> — click <b>Request Transfer</b> above to raise one.</> : '.'}</td></tr>
                  ) : requests.map((r, i) => (
                    <tr key={r.id} className={`border-b border-violet-50 ${i % 2 === 1 ? 'bg-violet-50/30' : 'bg-white'}`} data-testid={`request-row-${r.request_number}`}>
                      <td className="p-3 font-mono text-xs text-violet-700">{r.request_number}</td>
                      <td className="p-3 text-xs text-slate-600">{fmtDate(r.created_at)}</td>
                      <td className="p-3 text-xs">
                        <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" />{r.dest_location_name}</div>
                      </td>
                      <td className="p-3 text-xs text-slate-600">
                        {(r.items || []).map((it, ii) => (
                          <div key={ii}>
                            {it.sku_name} × <b>{it.packages && it.packaging_type_name ? `${it.packages} ${it.packaging_type_name}` : it.quantity_units}</b>
                            {it.packages && it.packaging_type_name ? <span className="text-slate-400"> ({it.quantity_units} bottles)</span> : null}
                          </div>
                        ))}
                      </td>
                      <td className="p-3 text-xs text-slate-500 max-w-[180px]">
                        <div className="truncate" title={r.reason || ''}>{r.reason || '—'}</div>
                        {r.rejection_remark && <div className="text-red-600 truncate" title={r.rejection_remark}>✗ {r.rejection_remark}</div>}
                      </td>
                      <td className="p-3 text-xs text-slate-600">{r.requested_by_name}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-[10px] capitalize ${REQ_STATUS_STYLES[r.status] || ''}`} data-testid={`request-status-${r.request_number}`}>
                          {r.status}
                        </Badge>
                        {r.status === 'fulfilled' && r.transfer_number && (
                          <div className="text-[10px] font-mono text-emerald-700 mt-0.5">{r.transfer_number}</div>
                        )}
                        {r.status === 'approved' && r.approved_by_name && (
                          <div className="text-[10px] text-slate-400 mt-0.5">by {r.approved_by_name}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {r.status === 'pending' && reqPerms.can_approve && (
                            <>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-emerald-700 hover:bg-emerald-50" onClick={() => setReqAction({ type: 'approve', req: r })} data-testid={`approve-request-btn-${r.request_number}`}>
                                Approve
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-red-600 hover:bg-red-50" onClick={() => setReqAction({ type: 'reject', req: r })} data-testid={`reject-request-btn-${r.request_number}`}>
                                Reject
                              </Button>
                            </>
                          )}
                          {r.status === 'pending' && r.requested_by === user?.id && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-slate-500 hover:bg-slate-50"
                              onClick={async () => {
                                try {
                                  await axios.post(`${API}/stock-transfer-requests/${r.id}/cancel`, {}, { headers: HEAD() });
                                  toast.success('Request cancelled'); loadRequests();
                                } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
                              }}
                              data-testid={`cancel-request-btn-${r.request_number}`}
                            >
                              Cancel
                            </Button>
                          )}
                          {r.status === 'approved' && reqPerms.can_approve && (
                            <Button size="sm" className="h-7 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => { setPrefillReq({ request_id: r.id, request_number: r.request_number, dest_location_id: r.dest_location_id, dest_location_name: r.dest_location_name, items: r.items }); setShowNew(true); }}
                              data-testid={`initiate-transfer-btn-${r.request_number}`}
                            >
                              <ArrowLeftRight className="h-3 w-3 mr-1" /> Initiate Transfer
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {view === 'transfers' && (<>
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
                  {['Transfer #', 'Date', 'Source → Destination', 'Items', 'Doc Type', 'Zoho', 'Created By', ''].map((h, hi) => (
                    <th key={hi} className="text-left p-3 text-[10px] uppercase tracking-wider font-semibold text-emerald-800/70">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600 mx-auto" /></td></tr>
                ) : (data.items || []).length === 0 ? (
                  <tr><td colSpan={8} className="p-10 text-center text-slate-500">No stock transfers yet. Click <b>+ New Stock Transfer</b> above to create one.</td></tr>
                ) : (data.items || []).map((t, i) => (
                  <tr
                    key={t.id}
                    className={`border-b border-emerald-50 ${i % 2 === 1 ? 'bg-emerald-50/40' : 'bg-white'} hover:bg-emerald-50/60 cursor-pointer`}
                    onClick={(e) => {
                      if (e.target.closest('button, a, [role="menu"], [role="menuitem"], [data-radix-popper-content-wrapper]')) return;
                      setDetailTransfer(t);
                    }}
                    title="Click to view transfer details"
                    data-testid={`transfer-row-${t.id}`}
                  >
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
                          <div key={idx}>{it.quantity} {it.packaging_type_name || 'units'} · {it.sku_name}{it.child_sku_name ? <span className="text-indigo-600 font-medium"> [{it.child_sku_name}]</span> : ''}</div>
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
                        {t.status === 'reversed' && (
                          <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200" data-testid={`reversed-badge-${t.id}`}>
                            <Undo2 className="h-3 w-3 mr-1" />Reversed
                          </Badge>
                        )}
                      </div>
                      {t.zoho_status === 'failed' && t.zoho_error && (
                        <div className="text-[10px] text-red-600 mt-1 max-w-[200px] truncate" title={t.zoho_error}>{t.zoho_error}</div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-slate-600">{t.created_by_name}</td>
                    <td className="p-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm" variant="ghost"
                            className="h-8 w-8 p-0 text-slate-500 hover:text-slate-800 hover:bg-emerald-50"
                            title="Actions"
                            data-testid={`transfer-actions-btn-${t.id}`}
                          >
                            {reversingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400">
                            {t.transfer_number}
                          </DropdownMenuLabel>
                          {t.zoho_status === 'synced' && t.zoho_invoice_id && (
                            <DropdownMenuItem onClick={() => downloadZohoPdf(t)} data-testid={`zoho-pdf-btn-${t.id}`}>
                              <Download className="h-3.5 w-3.5 mr-2 text-slate-500" />
                              Download {t.zoho_doc_type === 'delivery_challan' ? 'Challan' : 'Invoice'} PDF
                            </DropdownMenuItem>
                          )}
                          {Number(t.total_value || 0) > 50000 && (
                            <DropdownMenuItem onClick={() => downloadEwayBill(t)} data-testid={`eway-bill-btn-${t.id}`}>
                              <Download className="h-3.5 w-3.5 mr-2 text-indigo-600" />
                              Download E-way Bill
                            </DropdownMenuItem>
                          )}
                          {t.zoho_status === 'synced' && t.zoho_invoice_id && (
                            <DropdownMenuItem onClick={() => setShareTransfer(t)} data-testid={`share-btn-transfer-${t.id}`}>
                              <Share2 className="h-3.5 w-3.5 mr-2 text-teal-600" />
                              Share via email…
                            </DropdownMenuItem>
                          )}
                          {t.zoho_status === 'failed' && (
                            <DropdownMenuItem onClick={() => retryZoho(t.id)} data-testid={`retry-zoho-${t.id}`}>
                              <RefreshCw className="h-3.5 w-3.5 mr-2 text-slate-500" />
                              Retry Zoho push
                            </DropdownMenuItem>
                          )}
                          {t.status === 'reversed' ? (
                            t.zoho_cleanup_pending && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => retryReverseCleanup(t)}
                                  disabled={reversingId === t.id}
                                  data-testid={`reverse-cleanup-btn-${t.id}`}
                                >
                                  <RefreshCw className="h-3.5 w-3.5 mr-2 text-amber-600" />
                                  Retry Zoho cleanup
                                </DropdownMenuItem>
                              </>
                            )
                          ) : (
                            <>
                              {(canEditQty || (canRetro && t.status === 'completed' && (t.items || []).some(it => !it.child_sku_id && customerParents?.has(it.sku_id)))) && (
                                <DropdownMenuSeparator />
                              )}
                              {canEditQty && (
                                <DropdownMenuItem onClick={() => setEditTransfer(t)} data-testid={`edit-qty-btn-${t.id}`}>
                                  <Pencil className="h-3.5 w-3.5 mr-2 text-amber-600" />
                                  Edit quantities
                                </DropdownMenuItem>
                              )}
                              {canRetro && t.status === 'completed' && (t.items || []).some(it => !it.child_sku_id && customerParents?.has(it.sku_id)) && (
                                <DropdownMenuItem onClick={() => openRetroDialog(t)} data-testid={`retro-categorize-transfer-btn-${t.id}`}>
                                  <Tag className="h-3.5 w-3.5 mr-2 text-violet-600" />
                                  Categorize child SKU
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                                onClick={() => reverseTransfer(t)}
                                disabled={reversingId === t.id}
                                data-testid={`reverse-transfer-btn-${t.id}`}
                              >
                                <Undo2 className="h-3.5 w-3.5 mr-2" />
                                Reverse transfer
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </>)}

      <NewTransferDialog
        open={showNew}
        onClose={() => { setShowNew(false); setPrefillReq(null); }}
        onCreated={() => { setPage(1); load(); loadRequests(); }}
        prefill={prefillReq}
      />
      <NewRequestDialog open={showRequestDialog} onClose={() => setShowRequestDialog(false)} onCreated={loadRequests} />
      <RequestActionDialog action={reqAction} onClose={() => setReqAction(null)} onDone={loadRequests} />
      <EditQtyDialog transfer={editTransfer} onClose={() => setEditTransfer(null)} onSaved={load} />
      <TransferDetailDialog transfer={detailTransfer} onClose={() => setDetailTransfer(null)} />
      {shareTransfer && (
        <ShareDialog
          documentType="stock_transfer_doc"
          documentId={shareTransfer.id}
          testIdBase={`transfer-${shareTransfer.id}`}
          onClose={() => setShareTransfer(null)}
        />
      )}
      {retroTarget && (
        <RetroCategorizeDialog
          open={!!retroTarget}
          onOpenChange={(o) => { if (!o) setRetroTarget(null); }}
          {...retroTarget}
        />
      )}
    </div>
  );
}
