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
const ANY_BATCH = '__any__';
const LEGACY = '__legacy__';

function BrandingHistory({ warehouseId, skuId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams({ limit: '50' });
    if (warehouseId) params.set('warehouse_location_id', warehouseId);
    if (skuId) params.set('sku_id', skuId);
    axios.get(`${API}/branding-entries?${params}`, { headers: HEAD() })
      .then((res) => setRows(res.data?.items || []))
      .catch(() => setRows([]));
  }, [warehouseId, skuId]);
  if (rows === null) return <div className="flex items-center gap-2 text-xs text-slate-500 py-4"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading audit trail…</div>;
  if (rows.length === 0) return <p className="text-xs text-slate-500 py-4 text-center">No branding entries yet.</p>;
  return (
    <div className="max-h-[340px] overflow-y-auto space-y-1.5" data-testid="branding-history-list">
      {rows.map((e) => (
        <div key={e.id} className="rounded-lg border px-3 py-2 text-xs" data-testid={`branding-entry-${e.entry_number}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-bold text-indigo-700">{e.entry_number}</span>
            <span className="text-slate-400">{(e.created_at || '').slice(0, 16).replace('T', ' ')}</span>
          </div>
          <p className="text-slate-700 mt-0.5">
            <b>{e.quantity?.toLocaleString()}</b> bottles · {e.sku_name} · {e.from_child_sku_name || 'Generic'} → {e.to_child_sku_name || 'Generic'}
          </p>
          <p className="text-slate-400">
            {e.warehouse_name}{e.batch_scope && e.batch_scope !== 'fifo' ? ` · batch: ${e.batch_scope === 'legacy' ? 'legacy only' : (e.moves?.[0]?.batch_code || e.batch_scope)}` : ''}
            {e.source === 'retro_categorization' ? ' · via retro categorization' : ''} · by {e.created_by_name}
          </p>
        </div>
      ))}
    </div>
  );
}

export function BrandingEntryDialog({ open, onClose, onCreated }) {
  const [mode, setMode] = useState('reclassify'); // reclassify | fixbatch
  const [warehouses, setWarehouses] = useState([]);
  const [skus, setSkus] = useState([]); // master SKUs that allow child SKUs
  const [locationStock, setLocationStock] = useState([]); // aggregate per sku at chosen warehouse
  const [breakdown, setBreakdown] = useState([]); // per-classification for chosen (warehouse, sku)
  const [byBatch, setByBatch] = useState([]); // per (classification, batch)
  const [prodBatches, setProdBatches] = useState([]); // canonical batches for the SKU (fix mode)
  const [childSkus, setChildSkus] = useState([]); // all children of chosen parent
  const [form, setForm] = useState({ warehouse_location_id: '', sku_id: '', from: GENERIC, batch: ANY_BATCH, to: '', quantity: '', notes: '' });
  const [fix, setFix] = useState({ bucket: GENERIC, batch_id: '', quantity: '' });
  const [saving, setSaving] = useState(false);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode('reclassify');
    setForm({ warehouse_location_id: '', sku_id: '', from: GENERIC, batch: ANY_BATCH, to: '', quantity: '', notes: '' });
    setFix({ bucket: GENERIC, batch_id: '', quantity: '' });
    setBreakdown([]); setByBatch([]); setChildSkus([]); setLocationStock([]); setProdBatches([]);
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
      const [bRes, cRes, pRes] = await Promise.all([
        axios.get(`${API}/branding-entries/stock-breakdown?warehouse_location_id=${form.warehouse_location_id}&sku_id=${form.sku_id}`, { headers: HEAD() }),
        axios.get(`${API}/child-skus?parent_sku_id=${form.sku_id}`, { headers: HEAD() }),
        axios.get(`${API}/distributor/stock-transfers/production-batches?sku_id=${form.sku_id}`, { headers: HEAD() }).catch(() => ({ data: { batches: [] } })),
      ]);
      setBreakdown(bRes.data?.breakdown || []);
      setByBatch(bRes.data?.by_batch || []);
      setProdBatches(pRes.data?.batches || []);
      setChildSkus(cRes.data?.child_skus || []);
    } catch {
      setBreakdown([]); setByBatch([]); setChildSkus([]);
    } finally { setLoadingBreakdown(false); }
  }, [form.warehouse_location_id, form.sku_id]);

  useEffect(() => { loadBreakdown(); }, [loadBreakdown]);

  const qtyFor = (key) => breakdown.find((b) => (b.child_sku_id || GENERIC) === key)?.quantity || 0;
  const batchRowsFor = (key) => byBatch.filter((b) => (b.child_sku_id || GENERIC) === key);
  const batchOptions = [
    { key: ANY_BATCH, label: 'Any batch (FIFO — oldest first)', qty: qtyFor(form.from) },
    ...batchRowsFor(form.from).map((b) => ({
      key: b.batch_id || LEGACY,
      label: b.batch_id ? (b.batch_code || b.batch_id) : '(legacy / no batch)',
      qty: b.quantity,
    })),
  ];
  const batchAvail = form.batch === ANY_BATCH
    ? qtyFor(form.from)
    : (batchOptions.find((o) => o.key === form.batch)?.qty || 0);
  const fromAvail = batchAvail;
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
        batch_id: (form.batch === ANY_BATCH || form.batch === LEGACY) ? null : form.batch,
        legacy_only: form.batch === LEGACY,
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

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          <button type="button" onClick={() => setMode('reclassify')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold ${mode === 'reclassify' ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}
            data-testid="branding-mode-reclassify">Reclassify</button>
          <button type="button" onClick={() => setMode('fixbatch')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold ${mode === 'fixbatch' ? 'bg-white shadow text-amber-700' : 'text-slate-500'}`}
            data-testid="branding-mode-fixbatch">Fix Legacy Batch</button>
          <button type="button" onClick={() => setMode('history')}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold ${mode === 'history' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
            data-testid="branding-mode-history">History</button>
        </div>

        {mode === 'history' && (
          <BrandingHistory warehouseId={form.warehouse_location_id} skuId={form.sku_id} />
        )}

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

          {form.sku_id && mode === 'fixbatch' && (
            loadingBreakdown ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
            ) : (() => {
              const legacyBuckets = byBatch.filter((b) => !b.batch_id && b.quantity > 0);
              const bucketAvail = legacyBuckets.find((b) => (b.child_sku_id || GENERIC) === fix.bucket)?.quantity || 0;
              const fq = parseInt(fix.quantity) || 0;
              const canFix = fix.batch_id && bucketAvail > 0 && fq > 0 && fq <= bucketAvail;
              const submitFix = async () => {
                setSaving(true);
                try {
                  const { data } = await axios.post(`${API}/branding-entries/assign-batch`, {
                    warehouse_location_id: form.warehouse_location_id,
                    sku_id: form.sku_id,
                    child_sku_id: fix.bucket === GENERIC ? null : fix.bucket,
                    batch_id: fix.batch_id,
                    quantity: fq,
                  }, { headers: HEAD() });
                  toast.success(`${data.assigned_units.toLocaleString()} bottles now carry batch ${data.batch_code}${data.remaining_legacy ? ` — ${data.remaining_legacy} legacy bottles left` : ''}`);
                  onCreated?.();
                  onClose();
                } catch (e) {
                  toast.error(e.response?.data?.detail || 'Failed to assign batch');
                } finally { setSaving(false); }
              };
              return (
                <div className="space-y-3" data-testid="fixbatch-panel">
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                    Assign a real production batch to <b>(legacy / no batch)</b> stock so stock-outs show the batch number. Quantities are unchanged.
                  </p>
                  {legacyBuckets.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">No legacy (no batch) stock for this SKU at this warehouse — nothing to fix.</p>
                  ) : (
                    <>
                      <div>
                        <Label>Legacy stock bucket *</Label>
                        <Select value={fix.bucket} onValueChange={(v) => setFix((p) => ({ ...p, bucket: v, quantity: String(legacyBuckets.find((b) => (b.child_sku_id || GENERIC) === v)?.quantity || '') }))}>
                          <SelectTrigger data-testid="fixbatch-bucket-select"><SelectValue placeholder="Pick bucket" /></SelectTrigger>
                          <SelectContent>
                            {legacyBuckets.map((b) => (
                              <SelectItem key={b.child_sku_id || GENERIC} value={b.child_sku_id || GENERIC}>
                                {(b.child_sku_name || 'Generic (unbranded)')} — {b.quantity.toLocaleString()} bottles without batch
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Assign to production batch *</Label>
                        <Select value={fix.batch_id} onValueChange={(v) => setFix((p) => ({ ...p, batch_id: v }))}>
                          <SelectTrigger data-testid="fixbatch-batch-select"><SelectValue placeholder="Pick the real batch" /></SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            {prodBatches.length === 0 && <SelectItem value="__none__" disabled>No production batches for this SKU</SelectItem>}
                            {prodBatches.map((b) => (
                              <SelectItem key={b.batch_id} value={b.batch_id}>{b.batch_code}{b.production_date ? ` · ${b.production_date}` : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Quantity (bottles) * <span className="text-[10px] text-slate-400">max {bucketAvail.toLocaleString()}</span></Label>
                        <Input type="number" min="1" max={bucketAvail} value={fix.quantity}
                          onChange={(e) => setFix((p) => ({ ...p, quantity: e.target.value }))}
                          data-testid="fixbatch-qty-input" />
                      </div>
                      <Button onClick={submitFix} disabled={!canFix || saving} className="w-full bg-amber-600 hover:bg-amber-700" data-testid="fixbatch-submit-btn">
                        {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Assigning…</> : 'Assign Batch to Legacy Stock'}
                      </Button>
                    </>
                  )}
                </div>
              );
            })()
          )}

          {form.sku_id && mode === 'reclassify' && (
            loadingBreakdown ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading classifications…</div>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <div>
                    <Label>From *</Label>
                    <Select value={form.from} onValueChange={(v) => setForm((p) => ({ ...p, from: v, batch: ANY_BATCH, to: p.to === v ? '' : p.to, quantity: '' }))}>
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
                  <Label>From batch <span className="text-[10px] text-slate-400">optional — pick to keep the batch number on the branded stock</span></Label>
                  <Select value={form.batch} onValueChange={(v) => setForm((p) => ({ ...p, batch: v, quantity: '' }))}>
                    <SelectTrigger data-testid="branding-batch-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {batchOptions.map((o) => (
                        <SelectItem key={o.key} value={o.key}>{o.label} — {o.qty.toLocaleString()} bottles</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
          {mode === 'reclassify' && (
            <Button onClick={submit} disabled={!canSubmit || saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="branding-submit-btn">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recording…</> : <><Tags className="h-4 w-4 mr-2" />Record Branding Entry</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
