/**
 * RetroCategorizeDialog — retrospectively categorize a Generic transaction line
 * into a customer-specific child SKU (Stock In / Stock Transfer / Stock Out).
 *
 * Props:
 *   open, onOpenChange
 *   txType     — 'shipment' | 'delivery' | 'transfer' (controls hint copy)
 *   txNumber   — display label of the transaction
 *   items      — Generic-only lines: [{key, sku_id, sku_name, quantity_units,
 *                packaging_units, packaging_type_name, batch_code}]
 *   accountId / accountName — set for deliveries (children scoped to this account)
 *   distributorId — destination distributor (stock in / transfers): children are
 *                scoped to customer accounts ASSIGNED to this distributor
 *   onSubmit   — async ({itemKey, child_sku_id, quantity}) => void (base units)
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '../ui/command';
import { Tag, Info, Loader2, MapPin, Building2, Check, X, Package, Minus, Plus } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function RetroCategorizeDialog({
  open, onOpenChange, txType, txNumber,
  items = [], accountId, accountName, distributorId, onSubmit,
}) {
  const token = localStorage.getItem('token');
  const [itemKey, setItemKey] = useState('');
  const [children, setChildren] = useState(null); // null = loading
  const [scopeName, setScopeName] = useState(null);
  const [scoped, setScoped] = useState(false);
  const [childId, setChildId] = useState('');
  const [qtyPkgs, setQtyPkgs] = useState('');
  const [saving, setSaving] = useState(false);

  const item = items.find(i => String(i.key) === String(itemKey));
  const upp = Math.max(1, Number(item?.packaging_units) || 1);
  const maxPkgs = item ? Math.floor((item.quantity_units || 0) / upp) : 0;
  const selectedChild = (children || []).find(c => c.id === childId);

  useEffect(() => {
    if (!open) return;
    setItemKey(items.length === 1 ? String(items[0].key) : '');
    setChildId('');
    setQtyPkgs('');
    setChildren(null);
  }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !item) return;
    setChildren(null);
    setChildId('');
    setQtyPkgs(String(Math.floor((item.quantity_units || 0) / Math.max(1, Number(item.packaging_units) || 1))));
    const params = new URLSearchParams({ sku_id: item.sku_id });
    if (accountId) params.append('account_id', accountId);
    else if (distributorId) params.append('distributor_id', distributorId);
    axios.get(`${API_URL}/api/retro-categorize/eligible-children?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      const list = res.data.children || [];
      setChildren(list);
      setScopeName(res.data.distributor_name || null);
      setScoped(!!res.data.filtered_by_distributor);
      if (list.length === 1) setChildId(list[0].id);
    }).catch(() => setChildren([]));
  }, [open, itemKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const units = (parseInt(qtyPkgs) || 0) * upp;
    if (!item || !childId || units <= 0) return;
    setSaving(true);
    try {
      await onSubmit({ itemKey: item.key, child_sku_id: childId, quantity: units });
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to categorize');
    } finally {
      setSaving(false);
    }
  };

  const hint = txType === 'delivery'
    ? 'Relabels the line and re-attributes the warehouse deduction — Generic is restored and the selected customer SKU\'s bucket is reduced (recorded as a Branding Entry). You\'ll be warned if the branded bucket has less on-hand than the categorized quantity.'
    : 'Relabels the line and reclassifies the Generic stock still on hand at the destination into the selected customer SKU (recorded as a Branding Entry). Quantities and history are preserved.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="retro-categorize-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-violet-600" />
            Categorize into Customer SKU
          </DialogTitle>
          <DialogDescription>
            {txNumber}{accountName ? ` · ${accountName}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {items.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Line to categorize</Label>
              <Select value={itemKey} onValueChange={setItemKey}>
                <SelectTrigger data-testid="retro-item-select">
                  <SelectValue placeholder="Select line" />
                </SelectTrigger>
                <SelectContent>
                  {items.map(i => (
                    <SelectItem key={i.key} value={String(i.key)}>
                      {i.sku_name} — {i.quantity_units} units{i.batch_code ? ` · ${i.batch_code}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {item && (
            <>
              {/* Line summary */}
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <Package className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <div className="text-xs text-slate-600 leading-snug">
                  <span className="font-semibold text-slate-800">{item.sku_name}</span>
                  <span className="mx-1 text-slate-300">·</span>
                  {upp > 1
                    ? <>{maxPkgs} <span className="text-slate-400">×</span> {item.packaging_type_name || `${upp}-pack`} <span className="text-slate-400">=</span> {item.quantity_units} bottles</>
                    : <>{item.quantity_units} units</>}
                  {item.batch_code && <><span className="mx-1 text-slate-300">·</span><span className="font-mono">{item.batch_code}</span></>}
                  <span className="mx-1 text-slate-300">·</span><span className="text-slate-500">currently Generic</span>
                </div>
              </div>

              {/* Child SKU picker — searchable */}
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label className="text-xs">Customer child SKU <span className="text-red-500">*</span></Label>
                  {scoped && scopeName && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700" data-testid="retro-scope-badge">
                      <MapPin className="h-2.5 w-2.5" /> Accounts of {scopeName}
                    </span>
                  )}
                </div>
                {children === null ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : children.length === 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="retro-no-children">
                    No customer-specific child SKU found for this parent SKU
                    {accountName ? ` and account '${accountName}'` : scoped && scopeName ? ` among accounts assigned to ${scopeName}` : ''}.
                    Create one under SKU Management first.
                  </div>
                ) : selectedChild ? (
                  <div
                    className="flex items-center justify-between gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2"
                    data-testid="retro-selected-child"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-violet-800 truncate">
                        <Check className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{selectedChild.child_sku_name}</span>
                      </div>
                      <div className="ml-5 flex items-center gap-1 text-[11px] text-violet-600/90 truncate">
                        <Building2 className="h-2.5 w-2.5 flex-shrink-0" />
                        <span className="truncate">{selectedChild.customer_account_name || 'Unknown account'}</span>
                        {selectedChild.account_city && <span className="text-violet-400">· {selectedChild.account_city}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-violet-500 hover:text-violet-800 flex-shrink-0"
                      onClick={() => setChildId('')}
                      title="Change selection"
                      data-testid="retro-clear-child"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <Command className="rounded-lg border border-slate-200 shadow-sm" data-testid="retro-child-picker">
                    <CommandInput placeholder="Search customer or SKU name…" data-testid="retro-child-search" />
                    <CommandList className="max-h-48">
                      <CommandEmpty>No match — try a different name.</CommandEmpty>
                      {children.map((c, ci) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.child_sku_name} ${c.customer_account_name || ''} ${c.account_city || ''}`}
                          onSelect={() => setChildId(c.id)}
                          className="flex items-start gap-2 cursor-pointer py-2 data-[selected=true]:bg-violet-100 data-[selected=true]:text-slate-900 aria-selected:bg-violet-100"
                          data-testid={`retro-child-option-${ci}`}
                        >
                          <Tag className="h-3.5 w-3.5 text-violet-600 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-800 truncate">{c.child_sku_name}</div>
                            <div className="flex items-center gap-1 text-[11px] text-slate-600 truncate">
                              <Building2 className="h-2.5 w-2.5 flex-shrink-0" />
                              <span className="truncate">{c.customer_account_name || 'Unknown account'}</span>
                              {c.account_city && <span className="text-slate-500">· {c.account_city}</span>}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                )}
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Quantity to categorize
                  <span className="ml-1 text-slate-400 font-normal">
                    {upp > 1 ? `· in ${item.packaging_type_name || 'packages'} · max ${maxPkgs}` : `· in units · max ${item.quantity_units}`}
                  </span>
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
                    onClick={() => setQtyPkgs(String(Math.max(1, (parseInt(qtyPkgs) || 1) - 1)))}
                    disabled={(parseInt(qtyPkgs) || 0) <= 1}
                    data-testid="retro-qty-minus"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Input
                    type="number" min="1" max={maxPkgs}
                    value={qtyPkgs}
                    onChange={e => setQtyPkgs(e.target.value)}
                    className="h-9 w-24 text-center font-semibold text-slate-800"
                    data-testid="retro-qty-input"
                  />
                  <Button
                    type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
                    onClick={() => setQtyPkgs(String(Math.min(maxPkgs, (parseInt(qtyPkgs) || 0) + 1)))}
                    disabled={(parseInt(qtyPkgs) || 0) >= maxPkgs}
                    data-testid="retro-qty-plus"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  {upp > 1 && (parseInt(qtyPkgs) || 0) > 0 && (
                    <div className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-700" data-testid="retro-units-calc">
                      {parseInt(qtyPkgs) || 0} <span className="text-blue-400">×</span> {upp} = <b>{(parseInt(qtyPkgs) || 0) * upp} bottles</b>
                    </div>
                  )}
                </div>
                {(parseInt(qtyPkgs) || 0) > 0 && (parseInt(qtyPkgs) || 0) < maxPkgs && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5" data-testid="retro-split-note">
                    Line splits: {maxPkgs - (parseInt(qtyPkgs) || 0)} {upp > 1 ? (item.packaging_type_name || 'packages') : 'units'}
                    {upp > 1 ? ` (${(maxPkgs - (parseInt(qtyPkgs) || 0)) * upp} bottles)` : ''} stay Generic.
                  </p>
                )}
                {((parseInt(qtyPkgs) || 0) < 1 || (parseInt(qtyPkgs) || 0) > maxPkgs) && (
                  <p className="text-[11px] text-rose-600" data-testid="retro-qty-error">Enter a quantity between 1 and {maxPkgs}.</p>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 text-[11px] text-violet-800">
                <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{hint}</span>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={saving || !item || !childId || (parseInt(qtyPkgs) || 0) < 1 || (parseInt(qtyPkgs) || 0) > maxPkgs}
            className="bg-violet-600 hover:bg-violet-700"
            data-testid="retro-submit-btn"
          >
            {saving ? 'Categorizing…' : 'Categorize'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
