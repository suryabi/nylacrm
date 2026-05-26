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
  RefreshCw, FileText, Package, Building2,
} from 'lucide-react';
import { toast } from 'sonner';

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
  // Each item: { sku_id, packaging_type_id, packaging_type_name, units_per_package, quantity, rate }
  const [items, setItems] = useState([{
    sku_id: '', packaging_type_id: '', packaging_type_name: '', units_per_package: 0, quantity: '', rate: '',
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
    setItems([{ sku_id: '', packaging_type_id: '', packaging_type_name: '', units_per_package: 0, quantity: '', rate: '' }]);
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
          const stockRes = await axios.get(`${API}/distributors/${src.distributor_id}/stock?location_id=${form.source_location_id}`, { headers: HEAD() }).catch(() => null);
          const map = {};
          (stockRes?.data?.stock || stockRes?.data || []).forEach((s) => {
            map[s.sku_id] = s.quantity ?? s.qty ?? 0;
          });
          setStockBySku(map);
        }
      } catch { /* no-op */ }
    })();
  }, [form.source_location_id, sources]);

  const addItemRow = () => setItems((p) => [
    ...p,
    { sku_id: '', packaging_type_id: '', packaging_type_name: '', units_per_package: 0, quantity: '', rate: '' },
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
    });
  };

  const sourceObj = useMemo(() => sources.find((s) => s.location_id === form.source_location_id), [sources, form.source_location_id]);
  const targetObj = useMemo(() => targets.find((t) => t.location_id === form.dest_location_id), [targets, form.dest_location_id]);

  const docPreview = useMemo(() => {
    if (!sourceObj || !targetObj) return null;
    const srcSelf = sourceObj.is_self_managed;
    const dstSelf = targetObj.is_self_managed;
    const samePan = sourceObj.pan && targetObj.pan && sourceObj.pan === targetObj.pan;
    if (srcSelf && dstSelf && samePan) return 'delivery_challan';
    return 'invoice';
  }, [sourceObj, targetObj]);

  const canSubmit = form.source_location_id && form.dest_location_id && items.length > 0
    && items.every((it) => it.sku_id && it.packaging_type_name && it.units_per_package > 0 && Number(it.quantity) > 0);

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
            rate: parseFloat(it.rate || 0),
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
            Move stock from one warehouse to another. If both warehouses are self-managed and share the same <b>PAN</b> (same legal entity — even across states), Zoho will record a <b>Delivery Challan</b>. Otherwise an Invoice is generated at the rates you enter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source + Destination */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Source warehouse *</Label>
              <Select value={form.source_location_id} onValueChange={(v) => setForm({ ...form, source_location_id: v })}>
                <SelectTrigger data-testid="source-warehouse-select"><SelectValue placeholder="Pick a warehouse with stock" /></SelectTrigger>
                <SelectContent>
                  {sources.length === 0 && <SelectItem value="__none__" disabled>No warehouses with stock</SelectItem>}
                  {sources.map((s) => (
                    <SelectItem key={s.location_id} value={s.location_id}>
                      {s.distributor_name} — {s.location_name} ({s.total_qty} units)
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
                  {targets.map((t) => (
                    <SelectItem key={t.location_id} value={t.location_id}>
                      {t.distributor_name} — {t.location_name}
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
                ? <>Will create a <b>Delivery Challan</b> in Zoho — both warehouses are self-managed and share the same PAN ({sourceObj.pan}).</>
                : <>Will create a <b>Tax Invoice</b> in Zoho ({sourceObj.pan && targetObj.pan && sourceObj.pan !== targetObj.pan
                    ? `different PAN: ${sourceObj.pan} vs ${targetObj.pan}`
                    : (!sourceObj.is_self_managed || !targetObj.is_self_managed) ? 'one or both warehouses are not self-managed' : 'PAN missing — set GSTIN on both distributors'}).</>}
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
                        <Label className="text-[10px] text-slate-500">Rate per {it.packaging_type_name || 'package'}</Label>
                        <Input type="number" min="0" step="0.01" placeholder="0.00"
                          value={it.rate}
                          onChange={(e) => updateItem(i, { rate: e.target.value })}
                          className="h-9 text-sm"
                          data-testid={`item-rate-${i}`}
                        />
                      </div>
                      <div className="w-28 text-right">
                        <Label className="text-[10px] text-slate-500">Line Total</Label>
                        <p className="h-9 flex items-center justify-end text-sm font-semibold tabular-nums text-slate-700">
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

export default function StockTransfers() {
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

  return (
    <div className="p-6 space-y-6" data-testid="stock-transfers-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-emerald-600" /> Stock Transfers
          </h1>
          <p className="text-sm text-slate-500 mt-1">Move stock between distributor warehouses. Self-managed → self-managed transfers <b>(same PAN — same legal entity, even across states)</b> generate a Zoho Delivery Challan; everything else generates an Invoice.</p>
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
                        {t.zoho_status === 'failed' && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => retryZoho(t.id)} title="Retry Zoho push" data-testid={`retry-zoho-${t.id}`}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
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
    </div>
  );
}
