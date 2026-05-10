import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  CreditCard, Check, X, Paperclip, Send, RefreshCw, Trash2, Clock, CheckCircle2,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const APPROVER_ROLES = ['ceo', 'system admin', 'admin'];

/**
 * Single-screen, state-aware dialog for paying a customer / issuing credit
 * directly to them — independent of any delivery. Replaces the previous
 * 3-step nested flow. The dialog auto-detects the current issuance state and
 * renders ONE clear next action.
 *
 * States rendered:
 *   no-issuance       → submit form (reason / method / reference / attachment)
 *   pending_approval  → approve / reject (CEO/SystemAdmin only) or "awaiting"
 *   approved          → mark-issued form (issued_to / issuance_date)
 *   issued            → final summary, dialog can be closed
 */
export default function PayCustomerDialog({
  open, onOpenChange, distributorId, returnRecord, onChanged,
}) {
  const { token, user } = useAuth();
  const [creditNote, setCreditNote] = useState(null);
  const [issuance, setIssuance] = useState(null); // active (non-rejected, non-cancelled) record
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    issuance_method: 'cash',
    reference: '',
    reason: '',
    attachment_path: '',
    attachment_filename: '',
    uploading: false,
  });
  const [issueForm, setIssueForm] = useState({
    issued_to: '',
    issuance_date: new Date().toISOString().split('T')[0],
  });
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const isApprover = APPROVER_ROLES.includes((user?.role || '').toLowerCase());

  const cnId = returnRecord?.credit_note_id;
  const baseUrl = cnId
    ? `${API_URL}/api/distributors/${distributorId}/credit-notes/${cnId}/issuances`
    : null;
  const headers = { Authorization: `Bearer ${token}` };

  const loadState = useCallback(async () => {
    if (!cnId) return;
    setLoading(true);
    try {
      const [cnRes, issRes] = await Promise.all([
        axios.get(`${API_URL}/api/distributors/${distributorId}/credit-notes`, { headers }),
        axios.get(baseUrl, { headers }),
      ]);
      const list = cnRes.data.credit_notes || cnRes.data.items || [];
      setCreditNote(list.find((c) => c.id === cnId) || null);
      const issuances = issRes.data.issuances || [];
      const active = issuances.find((i) => !['rejected', 'cancelled'].includes(i.status));
      setIssuance(active || null);
    } catch (e) {
      toast.error('Failed to load credit note details');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnId, distributorId, token, baseUrl]);

  useEffect(() => {
    if (open && cnId) {
      // Reset all sub-forms each time the dialog opens
      setForm({ issuance_method: 'cash', reference: '', reason: '', attachment_path: '', attachment_filename: '', uploading: false });
      setIssueForm({ issued_to: '', issuance_date: new Date().toISOString().split('T')[0] });
      setRejectReason('');
      setShowReject(false);
      loadState();
    }
  }, [open, cnId, loadState]);

  if (!returnRecord) return null;

  const handleUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('File too large (max 10 MB)');
    const data = new FormData();
    data.append('file', file);
    setForm((f) => ({ ...f, uploading: true }));
    try {
      const r = await axios.post(`${baseUrl}/upload-attachment`, data, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      setForm((f) => ({ ...f, uploading: false, attachment_path: r.data.attachment_path, attachment_filename: r.data.attachment_filename }));
      toast.success('Attachment uploaded');
    } catch (err) {
      setForm((f) => ({ ...f, uploading: false }));
      toast.error(err.response?.data?.detail || 'Upload failed');
    }
  };

  const submitForApproval = async () => {
    if (!form.reason.trim()) return toast.error('Reason is required');
    setBusy(true);
    try {
      await axios.post(baseUrl, {
        reason: form.reason.trim(),
        issuance_method: form.issuance_method,
        reference: form.reference || null,
        attachment_path: form.attachment_path || null,
        attachment_filename: form.attachment_filename || null,
      }, { headers });
      toast.success('Submitted for approval');
      onChanged && onChanged();
      await loadState();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Submission failed');
    } finally { setBusy(false); }
  };

  const callAction = async (action, body, msg) => {
    if (!issuance) return;
    setBusy(true);
    try {
      await axios.post(`${baseUrl}/${issuance.id}/${action}`, body || {}, { headers });
      toast.success(msg);
      onChanged && onChanged();
      await loadState();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    } finally { setBusy(false); }
  };

  const balance = creditNote?.balance_amount || 0;
  const status = issuance?.status; // undefined when no issuance
  const totalCredit = returnRecord.total_credit || 0;

  // Step indicator
  const Step = ({ n, label, active, done }) => (
    <div className="flex items-center gap-2 flex-1">
      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-emerald-600 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </div>
      <span className={`text-xs ${done ? 'text-emerald-700 font-medium' : active ? 'text-blue-700 font-medium' : 'text-slate-500'}`}>{label}</span>
    </div>
  );
  const stepSubmitDone = !!status;
  const stepApprovalDone = status === 'approved' || status === 'issued';
  const stepIssuedDone = status === 'issued';
  const stepActive = !stepSubmitDone ? 1 : !stepApprovalDone ? 2 : !stepIssuedDone ? 3 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="pay-customer-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-600" />
            Pay Customer / Issue Credit
          </DialogTitle>
          <DialogDescription>
            Pay the customer the credit owed for return <span className="font-medium">{returnRecord.return_number}</span>.
            {returnRecord.account_name ? ` Account: ${returnRecord.account_name}.` : ''} Bypass-delivery handover with approval.
          </DialogDescription>
        </DialogHeader>

        {/* Top summary */}
        <div className="rounded-lg border bg-slate-50/50 p-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Credit Note</p>
            <p className="font-medium text-emerald-700">{returnRecord.credit_note_number || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Amount to Pay</p>
            <p className="font-bold tabular-nums text-emerald-700" data-testid="pay-amount">{fmt(issuance?.amount || balance || totalCredit)}</p>
          </div>
        </div>

        {/* Step strip */}
        <div className="flex items-center gap-1 px-1 py-2">
          <Step n={1} label="Submit" active={stepActive === 1} done={stepSubmitDone} />
          <div className="h-px flex-1 bg-slate-200" />
          <Step n={2} label="Approve" active={stepActive === 2} done={stepApprovalDone} />
          <div className="h-px flex-1 bg-slate-200" />
          <Step n={3} label="Issue" active={stepActive === 3} done={stepIssuedDone} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : !cnId ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No credit note linked to this return.</div>
        ) : (
          <div className="space-y-3" data-testid="pay-customer-body">
            {/* === STATE: no issuance yet → SUBMIT FORM === */}
            {!issuance && balance > 0.001 && (
              <div className="space-y-3" data-testid="submit-state">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Method<span className="text-rose-500">*</span></Label>
                    <Select value={form.issuance_method} onValueChange={(v) => setForm({ ...form, issuance_method: v })}>
                      <SelectTrigger className="h-9 text-sm" data-testid="method-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="store_credit">Store Credit</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Reference (optional)</Label>
                    <Input className="h-9 text-sm" placeholder="UTR / Cheque #" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} data-testid="reference-input" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Reason<span className="text-rose-500">*</span></Label>
                  <Textarea rows={2} className="text-sm" placeholder="Why are you paying this credit outside a delivery?" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} data-testid="reason-input" />
                </div>
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} accept="image/*,.pdf" />
                  <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={form.uploading} data-testid="upload-btn">
                    <Paperclip className="h-3 w-3 mr-1" />
                    {form.uploading ? 'Uploading…' : (form.attachment_filename ? 'Replace attachment' : 'Attach file (optional)')}
                  </Button>
                  {form.attachment_filename && <span className="text-xs text-slate-600 truncate" title={form.attachment_filename}>{form.attachment_filename}</span>}
                </div>
              </div>
            )}

            {/* === STATE: pending approval === */}
            {issuance && status === 'pending_approval' && (
              <div className="space-y-2" data-testid="pending-state">
                <div className="rounded-md border bg-amber-50 border-amber-200 p-3 space-y-1">
                  <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-amber-700" /><span className="font-semibold text-amber-800">Awaiting CEO / System Admin approval</span></div>
                  <p className="text-sm text-slate-700"><span className="font-medium capitalize">via {issuance.issuance_method?.replace('_', ' ')}</span>{issuance.reference ? ` · Ref: ${issuance.reference}` : ''}</p>
                  <p className="text-sm text-slate-700">{issuance.reason}</p>
                  <p className="text-[11px] text-muted-foreground">Submitted by {issuance.created_by_name} on {new Date(issuance.created_at).toLocaleDateString()}</p>
                </div>

                {showReject && isApprover && (
                  <div className="rounded-md border bg-rose-50 border-rose-200 p-3 space-y-2" data-testid="reject-form">
                    <Label className="text-xs font-semibold text-rose-700">Rejection Reason<span className="text-rose-500">*</span></Label>
                    <Textarea rows={2} className="text-sm" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} data-testid="reject-reason-input" />
                  </div>
                )}
              </div>
            )}

            {/* === STATE: approved === */}
            {issuance && status === 'approved' && (
              <div className="space-y-3" data-testid="approved-state">
                <div className="rounded-md border bg-blue-50 border-blue-200 p-3 space-y-1">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-blue-700" /><span className="font-semibold text-blue-800">Approved — ready to mark as issued to customer</span></div>
                  <p className="text-sm text-slate-700"><span className="font-medium capitalize">via {issuance.issuance_method?.replace('_', ' ')}</span>{issuance.reference ? ` · Ref: ${issuance.reference}` : ''}</p>
                  <p className="text-sm text-slate-700">{issuance.reason}</p>
                  <p className="text-[11px] text-muted-foreground">Approved by {issuance.approved_by_name} on {issuance.approved_at ? new Date(issuance.approved_at).toLocaleDateString() : '-'}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Issued to (optional)</Label>
                    <Input className="h-9 text-sm" placeholder="Customer rep name" value={issueForm.issued_to} onChange={(e) => setIssueForm({ ...issueForm, issued_to: e.target.value })} data-testid="issued-to-input" />
                  </div>
                  <div>
                    <Label className="text-xs">Date</Label>
                    <Input type="date" className="h-9 text-sm" value={issueForm.issuance_date} onChange={(e) => setIssueForm({ ...issueForm, issuance_date: e.target.value })} data-testid="issuance-date-input" />
                  </div>
                </div>
              </div>
            )}

            {/* === STATE: issued === */}
            {issuance && status === 'issued' && (
              <div className="rounded-md border bg-emerald-50 border-emerald-200 p-3 space-y-1" data-testid="issued-state">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-700" /><span className="font-semibold text-emerald-800">Credit issued to customer</span></div>
                <p className="text-sm text-slate-700"><span className="font-medium capitalize">via {issuance.issuance_method?.replace('_', ' ')}</span>{issuance.reference ? ` · Ref: ${issuance.reference}` : ''}</p>
                <p className="text-sm text-slate-700">{issuance.reason}</p>
                <p className="text-[11px] text-muted-foreground">
                  Issued on {issuance.issued_at}{issuance.issued_to ? ` to ${issuance.issued_to}` : ''} · Approved by {issuance.approved_by_name}
                </p>
              </div>
            )}

            {!issuance && balance <= 0.001 && (
              <div className="py-6 text-center text-sm text-muted-foreground" data-testid="no-balance-state">
                This credit note has no balance remaining.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>

          {/* Single primary CTA per state */}
          {!loading && !issuance && balance > 0.001 && (
            <Button onClick={submitForApproval} disabled={busy} data-testid="submit-approval-btn">
              {busy ? 'Submitting…' : 'Submit for Approval'}
            </Button>
          )}

          {!loading && status === 'pending_approval' && isApprover && !showReject && (
            <>
              <Button variant="outline" onClick={() => setShowReject(true)} data-testid="open-reject-btn">
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
              <Button onClick={() => callAction('approve', null, 'Approved')} disabled={busy} className="bg-green-600 hover:bg-green-700" data-testid="approve-btn">
                <Check className="h-4 w-4 mr-1" /> Approve
              </Button>
            </>
          )}

          {!loading && status === 'pending_approval' && isApprover && showReject && (
            <>
              <Button variant="outline" onClick={() => { setShowReject(false); setRejectReason(''); }}>Back</Button>
              <Button variant="destructive" disabled={!rejectReason.trim() || busy}
                onClick={() => callAction('reject', { rejection_reason: rejectReason.trim() }, 'Rejected').then(() => { setShowReject(false); setRejectReason(''); })}
                data-testid="confirm-reject-btn">
                Confirm Reject
              </Button>
            </>
          )}

          {!loading && status === 'pending_approval' && !isApprover && issuance?.created_by === user?.id && (
            <Button variant="outline" disabled={busy} onClick={() => callAction('cancel', null, 'Cancelled')} data-testid="cancel-pending-btn">
              <Trash2 className="h-4 w-4 mr-1" /> Cancel Request
            </Button>
          )}

          {!loading && status === 'approved' && (
            <Button onClick={() => callAction('mark-issued', { issued_to: issueForm.issued_to || null, issuance_date: issueForm.issuance_date || null }, 'Marked as issued')}
              disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" data-testid="mark-issued-btn">
              <Send className="h-4 w-4 mr-1" /> Mark Issued to Customer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
