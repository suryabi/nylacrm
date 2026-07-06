import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { DatePicker } from './ui/date-picker';
import { Checkbox } from './ui/checkbox';
import { Printer, Loader2, FileCheck2 } from 'lucide-react';
import { PrintRequestOrderBanner } from './PrintRequestOrderBanner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export const SendForPrintingDialog = ({ open, onOpenChange, marketingRequest, onCreated }) => {
  const [departments, setDepartments] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [totalMonthlyVolume, setTotalMonthlyVolume] = useState('');
  const [startingMonthlyVolume, setStartingMonthlyVolume] = useState('');
  const [initialOrderQty, setInitialOrderQty] = useState('');
  const [dueDate, setDueDate] = useState(null);
  const [notes, setNotes] = useState('');
  const [deptId, setDeptId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const approvedFiles = useMemo(() => {
    const v = (marketingRequest?.versions || []).find((x) => x.is_approved);
    return (v?.files || []).length;
  }, [marketingRequest]);

  useEffect(() => {
    if (!open) return;
    // reset on open
    setTotalMonthlyVolume(''); setStartingMonthlyVolume(''); setInitialOrderQty('');
    setDueDate(null); setNotes(''); setDeptId(''); setVendorId(''); setConfirmed(false);
    (async () => {
      try {
        const [d, v] = await Promise.all([
          axios.get(`${API}/master-departments`, { headers: HEAD() }),
          axios.get(`${API}/print-vendors`, { headers: HEAD() }),
        ]);
        setDepartments(d.data?.departments || []);
        setVendors(v.data?.vendors || []);
      } catch (e) {
        toast.error('Failed to load teams/vendors');
      }
    })();
  }, [open]);

  const submit = async () => {
    if (!initialOrderQty || Number(initialOrderQty) <= 0) { toast.error('Enter a valid Initial Order Quantity'); return; }
    if (startingMonthlyVolume === '' || Number(startingMonthlyVolume) < 0) { toast.error('Enter the Initial Monthly Quantity'); return; }
    if (!dueDate) { toast.error('Pick a Requested Delivery Date'); return; }
    setSaving(true);
    try {
      const { data } = await axios.post(`${API}/print-requests`, {
        marketing_request_id: marketingRequest.id,
        initial_order_quantity: Number(initialOrderQty),
        quantity: Number(initialOrderQty),
        total_monthly_volume: totalMonthlyVolume === '' ? null : Number(totalMonthlyVolume),
        starting_monthly_volume: startingMonthlyVolume === '' ? null : Number(startingMonthlyVolume),
        requested_due_date: format(dueDate, 'yyyy-MM-dd'),
        notes: notes || null,
        assigned_department_id: deptId || null,
        vendor_id: vendorId || null,
      }, { headers: HEAD() });
      toast.success(`Print request ${data.print_number} created`);
      onOpenChange(false);
      onCreated?.(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create print request');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onOpenChange(false); }}>
      <DialogContent className="max-w-lg" data-testid="send-print-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Printer className="h-5 w-5 text-emerald-600" /> Send for Printing</DialogTitle>
          <DialogDescription>Create a print request from this approved design. Lead and the approved design are attached automatically.</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-emerald-50/60 border border-emerald-100 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2 mb-1">
          <FileCheck2 className="h-4 w-4 shrink-0" />
          <span>
            Auto-attaching: <b>{approvedFiles}</b> approved design file{approvedFiles === 1 ? '' : 's'}
            {marketingRequest?.lead_company || marketingRequest?.lead_name
              ? <> · Lead <b>{marketingRequest.lead_company || marketingRequest.lead_name}</b></>
              : ' · no lead attached'}
          </span>
        </div>

        <div className="space-y-4 py-1">
          <PrintRequestOrderBanner />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pr-init-qty">Initial Order Quantity <span className="text-red-500">*</span></Label>
              <Input id="pr-init-qty" type="number" min={1} value={initialOrderQty} onChange={(e) => setInitialOrderQty(e.target.value)} placeholder="e.g. 1000" data-testid="send-print-qty" />
            </div>
            <div className="space-y-1.5">
              <Label>Requested Delivery Date <span className="text-red-500">*</span></Label>
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="Pick a date" data-testid="send-print-due" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pr-start-vol">Initial Monthly Quantity <span className="text-red-500">*</span></Label>
              <Input id="pr-start-vol" type="number" min={0} value={startingMonthlyVolume} onChange={(e) => setStartingMonthlyVolume(e.target.value)} data-testid="send-print-starting-volume" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-total-vol">Total Monthly Volume (Future Potential)</Label>
              <Input id="pr-total-vol" type="number" min={0} value={totalMonthlyVolume} onChange={(e) => setTotalMonthlyVolume(e.target.value)} data-testid="send-print-total-volume" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assign to production team</Label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger data-testid="send-print-dept"><SelectValue placeholder="Select team (optional)" /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Print vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger data-testid="send-print-vendor"><SelectValue placeholder="Select vendor (optional)" /></SelectTrigger>
              <SelectContent>
                {vendors.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No vendors yet. Add them in Admin → Print Settings.</div>}
                {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pr-notes">Notes / print specs</Label>
            <Textarea id="pr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Material, size, color, finish…" rows={3} data-testid="send-print-notes" />
          </div>
          <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 cursor-pointer">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} className="mt-0.5" data-testid="send-print-confirm-checkbox" />
            <span className="text-xs text-slate-700 leading-snug">
              I confirm that this is not a sample request or a design request. This request is for the customer's initial order.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !confirmed} className="bg-emerald-600 hover:bg-emerald-700" data-testid="send-print-submit">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : <><Printer className="h-4 w-4 mr-2" /> Create Print Request</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendForPrintingDialog;
