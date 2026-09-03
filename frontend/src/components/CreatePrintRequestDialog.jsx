import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { DatePicker } from './ui/date-picker';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Loader2, Printer } from 'lucide-react';
import { PrintRequestOrderBanner } from './PrintRequestOrderBanner';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;
const numOrEmpty = (v) => String(v ?? '').replace(/[^0-9.]/g, '');

export const CreatePrintRequestDialog = ({ open, onOpenChange, designRequest, defaultMonthlyVolume, onCreated }) => {
  const [totalMonthlyVolume, setTotalMonthlyVolume] = useState('');
  const [startingMonthlyVolume, setStartingMonthlyVolume] = useState('');
  const [initialOrderQty, setInitialOrderQty] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(null);
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skus, setSkus] = useState([]);
  const [skuId, setSkuId] = useState('');

  useEffect(() => {
    if (open) {
      setTotalMonthlyVolume(numOrEmpty(defaultMonthlyVolume));
      setStartingMonthlyVolume('');
      setInitialOrderQty('');
      setDeliveryDate(null);
      setNotes('');
      setConfirmed(false);
      setSkuId('');
      axios.get(`${API_URL}/master-skus`, { withCredentials: true })
        .then((r) => setSkus((Array.isArray(r.data) ? r.data : r.data?.skus || []).filter((s) => s.is_active !== false)))
        .catch(() => {});
    }
  }, [open, defaultMonthlyVolume]);

  const submit = async () => {
    if (!initialOrderQty || Number(initialOrderQty) <= 0) { toast.error('Enter a valid Initial Order Quantity.'); return; }
    if (startingMonthlyVolume === '' || Number(startingMonthlyVolume) < 0) { toast.error('Enter the Initial Monthly Quantity (Starting Monthly Volume).'); return; }
    if (!deliveryDate) { toast.error('Select a Requested Delivery Date.'); return; }
    setSaving(true);
    try {
      const { data } = await axios.post(`${API_URL}/print-requests`, {
        marketing_request_id: designRequest.id,
        initial_order_quantity: Number(initialOrderQty),
        quantity: Number(initialOrderQty),
        total_monthly_volume: totalMonthlyVolume === '' ? null : Number(totalMonthlyVolume),
        starting_monthly_volume: startingMonthlyVolume === '' ? null : Number(startingMonthlyVolume),
        requested_due_date: format(deliveryDate, 'yyyy-MM-dd'),
        notes: notes || null,
        sku_id: skuId || null,
      }, { withCredentials: true });
      toast.success(`Print Request ${data.print_number || ''} created successfully`);
      onOpenChange(false);
      onCreated?.(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create print request');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="create-print-request-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Printer className="h-4 w-4" /> Create Print Request</DialogTitle>
          <DialogDescription>
            For {designRequest?.request_number} · {designRequest?.request_type_name || 'Design request'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <PrintRequestOrderBanner />
          <div className="space-y-1.5">
            <Label>SKU (bottle) <span className="text-slate-400 text-xs font-normal">— used to convert order quantities to crates</span></Label>
            <Select value={skuId || '__none'} onValueChange={(v) => setSkuId(v === '__none' ? '' : v)}>
              <SelectTrigger data-testid="pr-sku-select"><SelectValue placeholder="Select SKU" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Not specified (assumes 12 bottles/crate) —</SelectItem>
                {skus.map((s) => <SelectItem key={s.id} value={s.id}>{s.sku_name || s.sku}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-total-vol">Total Monthly Volume (Future Potential)</Label>
            <Input id="pr-total-vol" type="number" min={0} value={totalMonthlyVolume} onChange={(e) => setTotalMonthlyVolume(e.target.value)} placeholder="Pre-filled from opportunity" data-testid="pr-total-monthly-volume" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-start-vol">Initial Monthly Quantity <span className="text-red-500">*</span></Label>
            <Input id="pr-start-vol" type="number" min={0} value={startingMonthlyVolume} onChange={(e) => setStartingMonthlyVolume(e.target.value)} data-testid="pr-starting-monthly-volume" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-init-qty">Initial Order Quantity <span className="text-red-500">*</span></Label>
            <Input id="pr-init-qty" type="number" min={1} value={initialOrderQty} onChange={(e) => setInitialOrderQty(e.target.value)} data-testid="pr-initial-order-qty" />
          </div>
          <div className="space-y-1.5">
            <Label>Requested Delivery Date <span className="text-red-500">*</span></Label>
            <DatePicker value={deliveryDate} onChange={setDeliveryDate} minDate={new Date()} placeholder="Select delivery date" data-testid="pr-delivery-date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-notes">Notes</Label>
            <Textarea id="pr-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional print specs / notes" data-testid="pr-notes" />
          </div>
          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 cursor-pointer">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} className="mt-0.5" data-testid="pr-confirm-checkbox" />
            <span className="text-xs text-slate-700 leading-snug">
              I confirm that this is not a sample request or a design request. This request is for the customer's initial order.
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} data-testid="pr-cancel-btn">Cancel</Button>
          <Button onClick={submit} disabled={saving || !confirmed} data-testid="pr-submit-btn">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : 'Create Print Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePrintRequestDialog;
