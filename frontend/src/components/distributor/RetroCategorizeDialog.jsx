/**
 * RetroCategorizeDialog — retrospectively categorize a Generic transaction line
 * into a customer-specific child SKU (Stock In / Stock Transfer / Stock Out).
 *
 * Props:
 *   open, onOpenChange
 *   txType    — 'shipment' | 'delivery' | 'transfer' (controls hint copy)
 *   txNumber  — display label of the transaction
 *   items     — Generic-only lines: [{key, sku_id, sku_name, quantity_units,
 *               packaging_units, packaging_type_name, batch_code}]
 *   accountId / accountName — set for deliveries (children scoped to this account)
 *   onSubmit  — async ({itemKey, child_sku_id, quantity}) => void (base units)
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tag, Info, Loader2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function RetroCategorizeDialog({
  open, onOpenChange, txType, txNumber,
  items = [], accountId, accountName, onSubmit,
}) {
  const token = localStorage.getItem('token');
  const [itemKey, setItemKey] = useState('');
  const [children, setChildren] = useState(null); // null = loading
  const [childId, setChildId] = useState('');
  const [qtyPkgs, setQtyPkgs] = useState('');
  const [saving, setSaving] = useState(false);

  const item = items.find(i => String(i.key) === String(itemKey));
  const upp = Math.max(1, Number(item?.packaging_units) || 1);
  const maxPkgs = item ? Math.floor((item.quantity_units || 0) / upp) : 0;

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
    axios.get(`${API_URL}/api/retro-categorize/eligible-children?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => setChildren(res.data.children || []))
      .catch(() => setChildren([]));
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
    ? 'This relabels the delivered line for branded sales reporting. No stock is moved — the units already left the network.'
    : 'The line is relabeled and whatever Generic stock is still on hand at the destination warehouse is reclassified into the selected customer SKU (up to the categorized quantity, recorded as a Branding Entry). Quantities and movement history are preserved.';

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
              <div className="text-xs text-slate-500">
                {item.sku_name} · {item.quantity_units} units{item.batch_code ? ` · batch ${item.batch_code}` : ''} · currently Generic
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Customer child SKU *</Label>
                {children === null ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : children.length === 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="retro-no-children">
                    No customer-specific child SKU exists for this parent SKU{accountName ? ` and account '${accountName}'` : ''}. Create one under SKU Management first.
                  </div>
                ) : (
                  <Select value={childId} onValueChange={setChildId}>
                    <SelectTrigger data-testid="retro-child-select">
                      <SelectValue placeholder="Select customer child SKU" />
                    </SelectTrigger>
                    <SelectContent>
                      {children.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.child_sku_name}{c.customer_account_name ? ` — ${c.customer_account_name}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Quantity to categorize {upp > 1 ? `(${item.packaging_type_name || 'packages'}, max ${maxPkgs})` : `(units, max ${item.quantity_units})`}
                </Label>
                <Input
                  type="number" min="1" max={maxPkgs}
                  value={qtyPkgs}
                  onChange={e => setQtyPkgs(e.target.value)}
                  data-testid="retro-qty-input"
                />
                {upp > 1 && (parseInt(qtyPkgs) || 0) > 0 && (
                  <p className="text-[11px] text-blue-600">{(parseInt(qtyPkgs) || 0) * upp} units</p>
                )}
                {(parseInt(qtyPkgs) || 0) > 0 && (parseInt(qtyPkgs) || 0) < maxPkgs && (
                  <p className="text-[11px] text-slate-500">The line will split — the remaining {(maxPkgs - (parseInt(qtyPkgs) || 0)) * upp} units stay Generic.</p>
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
