import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Loader2, ArrowRight, Package } from 'lucide-react';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmt = (v) => (Number(v) || 0).toLocaleString('en-IN');

// Edit the branded quantity of a child SKU at a warehouse. The delta moves
// to/from Generic stock of the same parent SKU (recorded as a branding entry).
export default function AdjustChildQtyDialog({ skuId, skuName, entry, onClose, onChanged }) {
  const locations = entry.locations || [];
  const [locId, setLocId] = useState(locations.length === 1 ? locations[0].location_id : '');
  const [breakdown, setBreakdown] = useState(null);
  const [newQty, setNewQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentQty = breakdown ? (breakdown.find(b => b.child_sku_id === entry.child_sku_id)?.quantity || 0) : null;
  const genericQty = breakdown ? (breakdown.find(b => !b.child_sku_id)?.quantity || 0) : null;

  useEffect(() => {
    if (!locId) return;
    setLoading(true);
    setBreakdown(null);
    axios.get(`${API}/branding-entries/stock-breakdown`, {
      params: { warehouse_location_id: locId, sku_id: skuId }, headers: HEAD(),
    })
      .then(r => {
        const rows = r.data.breakdown || [];
        setBreakdown(rows);
        setNewQty(String(rows.find(b => b.child_sku_id === entry.child_sku_id)?.quantity || 0));
      })
      .catch(() => toast.error('Failed to load stock at this location'))
      .finally(() => setLoading(false));
  }, [locId, skuId, entry.child_sku_id]);

  const target = newQty === '' ? null : Math.max(0, parseInt(newQty, 10) || 0);
  const delta = (target !== null && currentQty !== null) ? target - currentQty : 0;
  const overGeneric = delta > 0 && genericQty !== null && delta > genericQty;

  const save = async () => {
    if (!delta) { onClose(); return; }
    setSaving(true);
    try {
      await axios.post(`${API}/branding-entries`, {
        warehouse_location_id: locId,
        sku_id: skuId,
        from_child_sku_id: delta < 0 ? entry.child_sku_id : null,
        to_child_sku_id: delta > 0 ? entry.child_sku_id : null,
        quantity: Math.abs(delta),
        notes: `Quantity adjusted ${currentQty} → ${target}`,
      }, { headers: HEAD() });
      toast.success(delta < 0
        ? `${fmt(-delta)} bottles returned to Generic`
        : `${fmt(delta)} bottles branded from Generic`);
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Adjustment failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="adjust-child-qty-dialog">
        <DialogHeader>
          <DialogTitle className="text-base">Adjust branded quantity</DialogTitle>
          <DialogDescription>
            {entry.child_sku_name} · {skuName} — the difference moves to/from Generic stock automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Warehouse</Label>
            <Select value={locId} onValueChange={setLocId}>
              <SelectTrigger data-testid="adjust-qty-location"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
              <SelectContent>
                {locations.map(l => (
                  <SelectItem key={l.location_id} value={l.location_id}>
                    {l.location_name} — {fmt(l.quantity)} bottles
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading && <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading stock…</p>}

          {breakdown && (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                  <p className="text-indigo-600">Current branded</p>
                  <p className="font-bold text-indigo-900 tabular-nums" data-testid="adjust-qty-current">{fmt(currentQty)} bottles</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-emerald-600">Generic available</p>
                  <p className="font-bold text-emerald-900 tabular-nums" data-testid="adjust-qty-generic">{fmt(genericQty)} bottles</p>
                </div>
              </div>

              <div>
                <Label className="text-xs">New branded quantity (bottles)</Label>
                <Input type="number" min="0" value={newQty}
                  onChange={e => setNewQty(e.target.value)}
                  data-testid="adjust-qty-input" />
              </div>

              {delta !== 0 && !overGeneric && (
                <div className="flex items-center gap-2 text-xs rounded-lg bg-slate-50 border border-slate-200 px-3 py-2" data-testid="adjust-qty-preview">
                  <Package className="h-3.5 w-3.5 text-slate-500" />
                  {delta < 0 ? (
                    <span><b>{fmt(-delta)}</b> bottles will return to <b>Generic</b></span>
                  ) : (
                    <span><b>{fmt(delta)}</b> bottles will be branded from <b>Generic</b></span>
                  )}
                  <ArrowRight className="h-3 w-3 text-slate-400 ml-auto" />
                  <span className="tabular-nums">Generic: {fmt(genericQty)} → {fmt(genericQty - delta)}</span>
                </div>
              )}
              {overGeneric && (
                <p className="text-xs text-red-600" data-testid="adjust-qty-error">
                  Only {fmt(genericQty)} Generic bottles available — cannot increase by {fmt(delta)}.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="adjust-qty-cancel">Cancel</Button>
          <Button onClick={save} disabled={saving || loading || !locId || target === null || overGeneric || delta === 0}
            data-testid="adjust-qty-save">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {delta === 0 ? 'No change' : 'Save adjustment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
