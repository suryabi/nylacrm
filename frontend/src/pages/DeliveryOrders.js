import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import GooglePlacesAddressSearch from '../components/GooglePlacesAddressSearch';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';
import {
  Package, Plus, Trash2, Loader2, MapPin, Search, X, ClipboardList,
  CheckCircle2, XCircle, RotateCcw, Truck, Clock, ChevronRight, Phone, Calendar as CalendarIcon,
} from 'lucide-react';
import { isValidMapsLink } from '../utils/mapsLink';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, withCredentials: true });
const fmtINR = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Match a Google-returned address to a city in the Location Master so the city
// always lines up with the master (e.g. "Rai Durg, Hyderabad" -> "Hyderabad").
function matchMasterCity(masterCities, googleCity, formattedAddress) {
  if (!masterCities?.length) return googleCity || '';
  const fa = (formattedAddress || '').toLowerCase();
  const gc = (googleCity || '').toLowerCase().trim();
  const names = [];
  masterCities.forEach((c) => {
    names.push(c.name);
    (c.aliases || []).forEach((a) => names.push(a));
  });
  let hit = names.find((n) => n && n.toLowerCase() === gc);
  if (!hit) {
    hit = names.find((n) => n && new RegExp(`(^|[,\\s])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([,\\s]|$)`).test(fa));
  }
  if (hit) {
    const canonical = masterCities.find((c) => c.name.toLowerCase() === hit.toLowerCase()
      || (c.aliases || []).some((a) => a.toLowerCase() === hit.toLowerCase()));
    return canonical ? canonical.name : hit;
  }
  return googleCity || '';
}

// Embedded Google map (no API key needed) with an expand-to-large option.
function MapPreview({ lat, lng, label, height = 180 }) {
  const [expanded, setExpanded] = useState(false);
  if (lat == null || lng == null) return null;
  const src = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
  const openUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200" data-testid="do-map-preview">
      <iframe title="delivery-location" src={src} width="100%" height={height} style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 text-xs">
        <span className="truncate text-slate-500">📍 {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}{label ? ` · ${label}` : ''}</span>
        <div className="flex items-center gap-3">
          <button type="button" className="font-medium text-emerald-600 hover:underline" onClick={() => setExpanded(true)} data-testid="do-map-expand">Expand</button>
          <a href={openUrl} target="_blank" rel="noreferrer" className="font-medium text-slate-500 hover:underline">Open ↗</a>
        </div>
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-4xl" data-testid="do-map-expanded">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-rose-500" /> Delivery Location</DialogTitle></DialogHeader>
          <iframe title="delivery-location-large" src={src} width="100%" height={520} style={{ border: 0 }} loading="lazy" />
          <a href={openUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-600 hover:underline">Open in Google Maps ↗</a>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const RECIPIENTS = [
  { key: 'lead', label: 'Lead', endpoint: 'leads' },
  { key: 'account', label: 'Account', endpoint: 'accounts' },
  { key: 'contact', label: 'Contact', endpoint: 'contacts' },
  { key: 'employee', label: 'Employee', endpoint: 'users' },
];
const STATE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const StateBadge = ({ order }) => (
  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    style={{ color: order.current_state_color || '#475569', background: `${order.current_state_color || '#475569'}1a` }}
    data-testid={`do-state-${order.id}`}>
    {order.current_state_label || order.current_state_key}
  </span>
);

// ───────────────────── Recipient picker ─────────────────────
function RecipientPicker({ recipientType, setRecipientType, selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const ep = RECIPIENTS.find((r) => r.key === recipientType);

  const search = useCallback(async (q) => {
    setLoading(true);
    try {
      let url = `${API_URL}/${ep.endpoint}`;
      if (ep.endpoint === 'users') url += '?is_active=true';
      else url += `?page=1&page_size=20${q ? `&search=${encodeURIComponent(q)}` : ''}`;
      const { data } = await axios.get(url, auth());
      let arr = Array.isArray(data) ? data : (data.data || data.contacts || data.leads || data.accounts || data.users || []);
      if (ep.endpoint === 'users' && q) {
        const ql = q.toLowerCase();
        arr = arr.filter((u) => (u.name || '').toLowerCase().includes(ql));
      }
      setResults(arr.slice(0, 20));
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, [ep]);

  useEffect(() => { setResults([]); setQuery(''); }, [recipientType]);

  const nameOf = (r) => r.name || r.contact_person || r.account_name || r.company || r.email || 'Unnamed';

  return (
    <div className="space-y-2">
      <Label>Recipient</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RECIPIENTS.map((r) => {
          const active = recipientType === r.key;
          return (
            <button key={r.key} type="button" onClick={() => { setRecipientType(r.key); onSelect(null); }}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${active ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'}`}
              data-testid={`do-recipient-type-${r.key}`}>
              {r.label}
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2" data-testid="do-recipient-selected">
          <div>
            <p className="text-sm font-medium text-slate-800">{nameOf(selected)}</p>
            <p className="text-xs text-slate-500">{selected.company || selected.email || selected.city || ''}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onSelect(null)}><X className="h-4 w-4" /></Button>
        </div>
      ) : (
        <div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder={`Search ${ep.label.toLowerCase()}…`} value={query}
              onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
              onFocus={() => !results.length && search('')} data-testid="do-recipient-search" />
          </div>
          {loading && <p className="mt-1 text-xs text-slate-400">Searching…</p>}
          {results.length > 0 && (
            <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
              {results.map((r) => (
                <button key={r.id} type="button" onClick={() => { onSelect(r); setResults([]); }}
                  className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50"
                  data-testid={`do-recipient-option-${r.id}`}>
                  <span className="font-medium text-slate-700">{nameOf(r)}</span>
                  <span className="text-xs text-slate-400">{r.company || r.city || ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────── Create dialog ─────────────────────
export function CreateOrderDialog({ open, onClose, skus, reasons, cities, onCreated, presetRecipient = null }) {
  const [recipientType, setRecipientType] = useState('account');
  const [selected, setSelected] = useState(null);
  const [requestedDate, setRequestedDate] = useState('');
  const [reason, setReason] = useState('');
  const [addr, setAddr] = useState({ line1: '', city: '', state: '', pincode: '', lat: null, lng: null, maps_link: '', formatted_address: '' });
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRecipientType(presetRecipient?.type || 'account');
      setSelected(presetRecipient?.entity || null);
      setRequestedDate(''); setReason('');
      setAddr({ line1: '', city: '', state: '', pincode: '', lat: null, lng: null, maps_link: '', formatted_address: '' });
      setContactName(''); setContactPhone(''); setNotes(''); setDeliveryInstructions(''); setItems([]);
    }
  }, [open]);

  // Prefill from selected recipient (best-effort)
  useEffect(() => {
    if (!selected) return;
    setContactName(selected.name || selected.contact_person || '');
    setContactPhone(selected.phone || selected.mobile || '');
    setAddr((a) => ({
      ...a,
      line1: selected.address || selected.billing_address || a.line1,
      city: selected.city || a.city,
      state: selected.state || a.state,
      pincode: selected.pincode || selected.zip || a.pincode,
      lat: selected.latitude ?? selected.lat ?? a.lat,
      lng: selected.longitude ?? selected.lng ?? a.lng,
    }));
  }, [selected]);

  const pkgsFor = (sku) => (sku?.packaging_config?.promo_stock_out?.length
    ? sku.packaging_config.promo_stock_out : (sku?.packaging_config?.stock_out || []));

  const addItem = () => setItems((p) => [...p, { sku_id: '', sku_name: '', packaging_type_id: '', packaging_type_name: '', units_per_package: null, quantity: 1, unit_price: 0 }]);
  const removeItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updateItem = (i, patch) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const onSkuChange = (i, skuId) => {
    const sku = skus.find((s) => s.id === skuId);
    const pkgs = pkgsFor(sku);
    const def = pkgs.find((p) => p.is_default) || pkgs[0];
    updateItem(i, {
      sku_id: skuId, sku_name: sku?.sku_name || '',
      unit_price: sku?.standard_price || sku?.base_price || 0,
      packaging_type_id: def?.packaging_type_id || '', packaging_type_name: def?.packaging_type_name || '',
      units_per_package: def?.units_per_package || null,
    });
  };
  const onPkgChange = (i, pkgId) => {
    const sku = skus.find((s) => s.id === items[i].sku_id);
    const pkg = pkgsFor(sku).find((p) => p.packaging_type_id === pkgId);
    updateItem(i, { packaging_type_id: pkgId, packaging_type_name: pkg?.packaging_type_name || '', units_per_package: pkg?.units_per_package || null });
  };

  const total = useMemo(() => items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0), [items]);
  const minDeliveryDate = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 2); return d; }, []);

  const recipientId = () => {
    const m = { lead: 'lead_id', account: 'account_id', contact: 'contact_id', employee: 'employee_id' };
    return { [m[recipientType]]: selected?.id };
  };

  const submit = async (alsoSubmit) => {
    if (!selected) return toast.error('Select a recipient.');
    if (!requestedDate) return toast.error('Delivery date is required.');
    if (!addr.city) return toast.error('Delivery city is required (use the address search).');
    if (!isValidMapsLink(addr.maps_link)) return toast.error('Enter a valid Google Maps link (e.g. https://maps.app.goo.gl/...)');
    if (!items.length || items.some((i) => !i.sku_id || !i.quantity)) return toast.error('Add at least one line with SKU and quantity.');
    setSaving(true);
    try {
      const payload = {
        recipient_type: recipientType, ...recipientId(),
        requested_date: requestedDate || null, reason: reason || null,
        delivery_address: addr, contact_name: contactName || null, contact_phone: contactPhone || null,
        delivery_instructions: deliveryInstructions || null,
        notes: notes || null,
        items: items.map((i) => ({
          sku_id: i.sku_id, sku_name: i.sku_name, quantity: Number(i.quantity), unit_price: Number(i.unit_price || 0),
          packaging_type_id: i.packaging_type_id || null, packaging_type_name: i.packaging_type_name || null,
          units_per_package: i.units_per_package || null,
        })),
      };
      const { data } = await axios.post(`${API_URL}/delivery-orders`, payload, auth());
      if (alsoSubmit) {
        await axios.post(`${API_URL}/delivery-orders/${data.id}/transition`, { action_key: 'submit' }, auth());
      }
      toast.success(`Delivery order ${data.order_number} created${alsoSubmit ? ' & submitted' : ''}`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create delivery order');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="do-create-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5 text-emerald-600" /> New Delivery Order</DialogTitle>
          <DialogDescription>Raise a promotional stock-out request for approval.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {presetRecipient ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3" data-testid="do-preset-recipient">
              <p className="text-[11px] uppercase tracking-wide text-emerald-600">{presetRecipient.type}</p>
              <p className="text-sm font-semibold text-slate-800">{presetRecipient.name || selected?.name || selected?.account_name || selected?.company || '—'}</p>
            </div>
          ) : (
            <RecipientPicker recipientType={recipientType} setRecipientType={setRecipientType} selected={selected} onSelect={setSelected} />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Promotional reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger data-testid="do-reason"><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => <SelectItem key={r.id || r.name} value={r.name}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Delivery date <span className="text-rose-500">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline"
                    className={`w-full justify-start text-left font-normal ${requestedDate ? 'text-slate-800' : 'text-slate-400'}`}
                    data-testid="do-requested-date">
                    <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                    {requestedDate
                      ? new Date(requestedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Pick a delivery date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single"
                    selected={requestedDate ? new Date(requestedDate + 'T00:00:00') : undefined}
                    onSelect={(d) => d && setRequestedDate(toYMD(d))}
                    disabled={{ before: minDeliveryDate }}
                    defaultMonth={requestedDate ? new Date(requestedDate + 'T00:00:00') : minDeliveryDate}
                    initialFocus />
                </PopoverContent>
              </Popover>
              <p className="mt-1 text-xs text-slate-400">Earliest delivery is 2 days from today.</p>
            </div>
          </div>

          {/* ── Delivery Address ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50"><MapPin className="h-4 w-4 text-rose-500" /></span>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Where should we deliver?</h3>
                <p className="text-xs text-slate-400">Search on Google to auto-fill & capture the location pin.</p>
              </div>
            </div>
            <GooglePlacesAddressSearch cityHint={addr.city} placeholder="Search address on Google…"
              testId="do-address-search"
              onPick={(p) => setAddr({
                line1: p.address_line_1 || p.formatted_address || '',
                city: matchMasterCity(cities, p.city, p.formatted_address),
                state: p.state || '',
                pincode: p.pincode || '', lat: p.lat ?? null, lng: p.lng ?? null, formatted_address: p.formatted_address || '',
              })} />
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input placeholder="Address" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} className="col-span-2 sm:col-span-4" data-testid="do-addr-line1" />
              <Input placeholder="City" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} data-testid="do-addr-city" />
              <Input placeholder="State" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} />
              <Input placeholder="Pincode" value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value })} />
            </div>
            <div className="mt-2">
              <Input placeholder="Google Maps link e.g. https://maps.app.goo.gl/..." value={addr.maps_link} onChange={(e) => setAddr({ ...addr, maps_link: e.target.value })} data-testid="do-addr-maps-link" />
              <p className="text-[11px] text-slate-400 mt-1">Used for the delivery QR code when GPS isn't available.</p>
            </div>
            {addr.lat != null && addr.lng != null && (
              <div className="mt-2"><MapPreview lat={addr.lat} lng={addr.lng} label={addr.city} /></div>
            )}
            <div className="mt-3">
              <Label className="text-xs font-medium text-slate-600">Delivery instructions</Label>
              <Textarea value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)}
                placeholder="How should the stock be handed over? e.g. Call on arrival, deliver to security gate, unload at rear dock between 9–11 AM…"
                className="mt-1" rows={2} data-testid="do-delivery-instructions" />
            </div>
          </div>

          {/* ── Delivery Contact (separate) ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50"><Phone className="h-4 w-4 text-sky-500" /></span>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Who receives the delivery?</h3>
                <p className="text-xs text-slate-400">Point of contact at the delivery location.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-medium text-slate-600">Contact name</Label>
                <Input placeholder="Contact name" value={contactName} onChange={(e) => setContactName(e.target.value)} className="mt-1" data-testid="do-contact-name" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-600">Contact phone</Label>
                <Input placeholder="Phone number" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1" data-testid="do-contact-phone" />
              </div>
            </div>
          </div>

          {/* ── Line Items (distinctive) ── */}
          <div className="rounded-xl border-2 border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100"><Package className="h-4 w-4 text-emerald-600" /></span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Stock to deliver</h3>
                  <p className="text-xs text-slate-400">SKU · packaging · quantity · unit value</p>
                </div>
              </div>
              <Button type="button" size="sm" onClick={addItem} className="bg-emerald-600 hover:bg-emerald-700" data-testid="do-add-item"><Plus className="mr-1 h-3.5 w-3.5" /> Add item</Button>
            </div>
            {items.length === 0 && <p className="rounded-lg border border-dashed border-emerald-200 bg-white py-5 text-center text-sm text-slate-400">No items yet — click "Add item" to begin.</p>}
            <div className="space-y-2">
              {items.map((it, i) => {
                const sku = skus.find((s) => s.id === it.sku_id);
                const pkgs = pkgsFor(sku);
                const lineTotal = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
                return (
                  <div key={i} className="rounded-lg border border-emerald-100 bg-white p-2.5 shadow-sm" data-testid={`do-item-row-${i}`}>
                    <div className="grid grid-cols-12 items-center gap-2">
                      <div className="col-span-12 sm:col-span-4">
                        <Select value={it.sku_id} onValueChange={(v) => onSkuChange(i, v)}>
                          <SelectTrigger data-testid={`do-item-sku-${i}`}><SelectValue placeholder="Select SKU" /></SelectTrigger>
                          <SelectContent>
                            {skus.map((s) => <SelectItem key={s.id} value={s.id}>{s.sku_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-5 sm:col-span-3">
                        <Select value={it.packaging_type_id} onValueChange={(v) => onPkgChange(i, v)} disabled={!it.sku_id}>
                          <SelectTrigger data-testid={`do-item-pkg-${i}`}><SelectValue placeholder={pkgs.length ? 'Packaging' : 'No packaging'} /></SelectTrigger>
                          <SelectContent>
                            {pkgs.map((p) => <SelectItem key={p.packaging_type_id} value={p.packaging_type_id}>{p.packaging_type_name}{p.units_per_package ? ` (${p.units_per_package})` : ''}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3 sm:col-span-2">
                        <Input type="number" min="1" value={it.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} placeholder="Qty" data-testid={`do-item-qty-${i}`} />
                      </div>
                      <div className="col-span-3 sm:col-span-2">
                        <Input type="number" min="0" value={it.unit_price} onChange={(e) => updateItem(i, { unit_price: e.target.value })} placeholder="Unit ₹" data-testid={`do-item-price-${i}`} />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                      </div>
                    </div>
                    {it.sku_id && <div className="mt-1 text-right text-xs text-slate-500">Line total: <span className="font-semibold text-slate-700">{fmtINR(lineTotal)}</span></div>}
                  </div>
                );
              })}
            </div>
            {items.length > 0 && (
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-emerald-200 pt-2 text-sm" data-testid="do-total">
                <span className="text-slate-500">Total indicative value</span>
                <span className="text-base font-bold text-emerald-700">{fmtINR(total)}</span>
              </div>
            )}
          </div>

          <div>
            <Label>Notes (internal)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any internal notes for approvers…" data-testid="do-notes" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="secondary" onClick={() => submit(false)} disabled={saving} data-testid="do-save-draft">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save as Draft'}
          </Button>
          <Button onClick={() => submit(true)} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="do-save-submit">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create & Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────── Detail dialog ─────────────────────
function DetailDialog({ orderId, open, onClose, onChanged }) {
  const [order, setOrder] = useState(null);
  const [transitions, setTransitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [commentFor, setCommentFor] = useState(null);
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const [o, t] = await Promise.all([
        axios.get(`${API_URL}/delivery-orders/${orderId}`, auth()),
        axios.get(`${API_URL}/delivery-orders/${orderId}/available-transitions`, auth()),
      ]);
      setOrder(o.data); setTransitions(t.data.transitions || []);
    } catch { toast.error('Failed to load order'); }
    finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const doTransition = async (t) => {
    if (t.comment_required && commentFor !== t.action_key) { setCommentFor(t.action_key); return; }
    setActing(true);
    try {
      const { data } = await axios.post(`${API_URL}/delivery-orders/${orderId}/transition`,
        { action_key: t.action_key, comment: comment || null }, auth());
      if (t.action_key === 'place_order') {
        const p = data.promo;
        if (p?.status === 'created') {
          toast.success(`Order placed · draft stock-out ${p.challan_number || ''} created at ${p.distributor_name || 'distributor'}`);
        } else {
          toast.warning(`Order placed, but stock-out was not created: ${p?.error || 'unknown reason'}`);
        }
      } else {
        toast.success(`Order ${data.order?.current_state_label || 'updated'}`);
      }
      setCommentFor(null); setComment('');
      await load(); onChanged();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally { setActing(false); }
  };

  const actionIcon = (k) => ({ approve: CheckCircle2, reject: XCircle, cancel: XCircle, submit: ChevronRight, place_order: Truck, mark_fulfilled: Truck, reopen: RotateCcw }[k] || ChevronRight);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto" data-testid="do-detail-dialog">
        {loading || !order ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-emerald-600" /> {order.order_number}
                <StateBadge order={order} />
              </DialogTitle>
              <DialogDescription>{order.recipient_type?.toUpperCase()} · {order.recipient_name || '—'}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Info label="Recipient" value={order.recipient_name} />
                <Info label="Type" value={order.recipient_type} />
                <Info label="Promo reason" value={order.reason || '—'} />
                <Info label="Delivery city" value={order.delivery_city || '—'} />
                <Info label="Total value" value={fmtINR(order.total_value)} />
                <Info label="Contact" value={`${order.contact_name || '—'}${order.contact_phone ? ' · ' + order.contact_phone : ''}`} />
                <Info label="Created by" value={order.created_by_name} />
              </div>

              {/* Delivery date (set at order creation) */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="do-delivery-date-block">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Date of delivery</p>
                <p className="mt-1 text-sm font-medium text-slate-700" data-testid="do-delivery-date-value">
                  {order.requested_date ? new Date(order.requested_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </p>
              </div>

              {/* Linked promotional stock-out + live fulfillment status */}
              {order.promo_dispatch_id && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3" data-testid="do-fulfillment-block">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-sky-500">Promotional stock-out</p>
                      <p className="mt-0.5 text-sm font-medium text-slate-700">
                        {order.promo_challan_number || '—'}
                        {order.promo_distributor_name ? <span className="text-slate-400"> · {order.promo_distributor_name}</span> : null}
                      </p>
                    </div>
                    <FulfillmentBadge status={order.fulfillment_status} />
                  </div>
                </div>
              )}

              {order.delivery_address?.formatted_address && (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <MapPin className="mr-1 inline h-3.5 w-3.5 text-rose-500" />{order.delivery_address.formatted_address}
                </div>
              )}
              {order.delivery_address?.lat != null && order.delivery_address?.lng != null && (
                <MapPreview lat={order.delivery_address.lat} lng={order.delivery_address.lng} label={order.delivery_city} />
              )}

              <div className="rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="px-3 py-2 text-left">SKU</th><th className="px-3 py-2 text-left">Packaging</th>
                    <th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit ₹</th><th className="px-3 py-2 text-right">Total</th>
                  </tr></thead>
                  <tbody>
                    {(order.items || []).map((it, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-700">{it.sku_name}</td>
                        <td className="px-3 py-2 text-slate-500">{it.packaging_type_name || '—'}</td>
                        <td className="px-3 py-2 text-right">{it.quantity}</td>
                        <td className="px-3 py-2 text-right">{fmtINR(it.unit_price)}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmtINR((it.quantity || 0) * (it.unit_price || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {order.notes && <p className="text-xs text-slate-500"><b>Notes:</b> {order.notes}</p>}

              {/* History */}
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">History</p>
                <div className="space-y-1.5">
                  {(order.status_history || []).slice().reverse().map((h, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <Clock className="mt-0.5 h-3 w-3 text-slate-400" />
                      <div>
                        <span className="font-medium text-slate-700">{h.state_label}</span>
                        <span className="text-slate-400"> · {h.by_user_name || 'system'} · {h.entered_at ? new Date(h.entered_at).toLocaleString('en-IN') : ''}</span>
                        {h.comment && <p className="text-slate-500">“{h.comment}”</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {commentFor && (
                <div>
                  <Label>Comment (required)</Label>
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} data-testid="do-transition-comment" />
                </div>
              )}
            </div>

            <DialogFooter className="flex-wrap gap-2">
              {transitions.length === 0 && <span className="text-xs text-slate-400">No actions available for your role at this state.</span>}
              {transitions.map((t) => {
                const Icon = actionIcon(t.action_key);
                const variant = t.kind === 'negative' ? 'destructive' : t.kind === 'positive' ? 'default' : 'secondary';
                return (
                  <Button key={t.action_key} variant={variant} disabled={acting}
                    className={t.kind === 'positive' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                    onClick={() => doTransition(t)} data-testid={`do-action-${t.action_key}`}>
                    {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Icon className="mr-1.5 h-4 w-4" />{t.action_label}</>}
                  </Button>
                );
              })}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const Info = ({ label, value }) => (
  <div><p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p><p className="font-medium text-slate-700">{value || '—'}</p></div>
);

const FULFILLMENT_LABELS = {
  draft: 'Draft', confirmed: 'Confirmed', delivery_assigned: 'Delivery Assigned',
  delivery_scheduled: 'Scheduled', scheduled: 'Scheduled', on_the_way: 'On the Way',
  in_transit: 'In Transit', complete: 'Complete', delivered: 'Delivered',
  partially_delivered: 'Partially Delivered', returned: 'Returned', cancelled: 'Cancelled',
};
const FULFILLMENT_COLORS = {
  draft: 'bg-slate-100 text-slate-600', confirmed: 'bg-amber-100 text-amber-700',
  delivery_assigned: 'bg-indigo-100 text-indigo-700', delivery_scheduled: 'bg-indigo-100 text-indigo-700',
  scheduled: 'bg-indigo-100 text-indigo-700', on_the_way: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-blue-100 text-blue-700', complete: 'bg-emerald-100 text-emerald-700',
  delivered: 'bg-emerald-100 text-emerald-700', partially_delivered: 'bg-emerald-100 text-emerald-700',
  returned: 'bg-rose-100 text-rose-700', cancelled: 'bg-slate-200 text-slate-500',
};
export const FulfillmentBadge = ({ status }) => {
  if (!status) return null;
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${FULFILLMENT_COLORS[status] || 'bg-slate-100 text-slate-600'}`} data-testid="do-fulfillment-badge">
      {FULFILLMENT_LABELS[status] || status}
    </span>
  );
};

// ───────────────────── Main page ─────────────────────
export default function DeliveryOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [skus, setSkus] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [cities, setCities] = useState([]);
  const [stateFilter, setStateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [role, setRole] = useState(null);
  const [migrating, setMigrating] = useState(false);

  const runMigration = async () => {
    try {
      const { data: prev } = await axios.get(`${API_URL}/admin/migrate-free-trial-expenses/preview`, auth());
      if (!prev.eligible) {
        toast.info(`Nothing to migrate. ${prev.already_migrated} already migrated, ${prev.skipped_no_items} have no SKUs.`);
        return;
      }
      if (!window.confirm(`Migrate ${prev.eligible} Free Trial expense request(s) into Delivery Orders? This is safe to re-run.`)) return;
      setMigrating(true);
      const { data } = await axios.post(`${API_URL}/admin/migrate-free-trial-expenses`, {}, auth());
      toast.success(`Migrated ${data.created} Free Trial expense(s) into Delivery Orders.`);
      fetchOrders();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Migration failed');
    } finally { setMigrating(false); }
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (stateFilter !== 'all') params.state_key = stateFilter;
      if (search) params.search = search;
      const { data } = await axios.get(`${API_URL}/delivery-orders`, { ...auth(), params });
      setOrders(data.orders || []);
    } catch { toast.error('Failed to load delivery orders'); }
    finally { setLoading(false); }
  }, [stateFilter, search]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => {
    (async () => {
      try {
        const [s, r] = await Promise.all([
          axios.get(`${API_URL}/master-skus`, auth()),
          axios.get(`${API_URL}/admin/promo-reasons`, auth()),
        ]);
        setSkus((s.data.skus || []).filter((x) => x.is_active !== false));
        setReasons(r.data.reasons || r.data.promo_reasons || (Array.isArray(r.data) ? r.data : []));
        try {
          const c = await axios.get(`${API_URL}/master-locations/flat`, auth());
          setCities(c.data.cities || []);
        } catch { /* cities optional */ }
        try {
          const me = await axios.get(`${API_URL}/auth/me`, auth());
          setRole(me.data?.role || null);
        } catch { /* ignore */ }
      } catch { /* non-blocking */ }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-7" data-testid="delivery-orders-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100">
            <Package className="h-6 w-6 text-emerald-600" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800 md:text-3xl">Delivery Orders</h1>
            <p className="text-sm text-slate-500">Promotional stock-out requests with approval workflow.</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="do-new-btn">
          <Plus className="mr-1.5 h-4 w-4" /> New Delivery Order
        </Button>
      </div>

      {['CEO', 'Director', 'Vice President', 'Admin', 'System Admin'].includes(role) && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5" data-testid="do-migration-banner">
          <p className="text-xs text-amber-700">One-time data migration: convert legacy <b>Free Trial</b> expense requests into Delivery Orders. Safe to re-run.</p>
          <Button size="sm" variant="outline" disabled={migrating} onClick={runMigration} className="border-amber-300 text-amber-700 hover:bg-amber-100" data-testid="do-migrate-free-trials-btn">
            {migrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Migrate Free Trials</>}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-48" data-testid="do-state-filter"><SelectValue /></SelectTrigger>
          <SelectContent>{STATE_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search order #, recipient, city…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="do-search" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 text-left">Order #</th>
                <th className="px-4 py-3 text-left">Recipient</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">City</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-left">Requested</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Fulfillment</th>
                <th className="px-4 py-3 text-left">Created by</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-600" /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center text-sm text-slate-500" data-testid="do-empty">No delivery orders yet. Create your first one.</td></tr>
              ) : orders.map((o) => (
                <tr key={o.id} onClick={() => setDetailId(o.id)} className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50" data-testid={`do-row-${o.order_number}`}>
                  <td className="px-4 py-3 font-mono font-medium text-emerald-700">{o.order_number}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{o.recipient_name || '—'}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{o.recipient_type}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{o.delivery_city || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{fmtINR(o.total_value)}</td>
                  <td className="px-4 py-3 text-slate-600">{o.requested_date || '—'}</td>
                  <td className="px-4 py-3"><StateBadge order={o} /></td>
                  <td className="px-4 py-3">{o.fulfillment_status ? <FulfillmentBadge status={o.fulfillment_status} /> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-slate-500">{o.created_by_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CreateOrderDialog open={showCreate} onClose={() => setShowCreate(false)} skus={skus} reasons={reasons} cities={cities} onCreated={fetchOrders} />
      <DetailDialog orderId={detailId} open={!!detailId} onClose={() => setDetailId(null)} onChanged={fetchOrders} />
    </div>
  );
}
