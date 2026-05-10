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
  CreditCard, Check, X, Plus, Paperclip, RefreshCw, AlertTriangle, Send, Trash2,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'store_credit', label: 'Store Credit' },
  { value: 'other', label: 'Other' },
];

const STATUS_BADGE = {
  pending_approval: { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  approved: { label: 'Approved · Awaiting Issue', cls: 'bg-blue-100 text-blue-700 border-blue-300' },
  issued: { label: 'Issued to Customer', cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-700 border-rose-300' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const fmtINR = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CreditIssuanceDialog({
  open, onOpenChange,
  distributorId, creditNote, // {id, credit_note_number, balance_amount, account_name, ...}
  canApprove = false,
  onChanged, // callback to refresh parent after any state change
}) {
  const { token, user } = useAuth();
  const [issuances, setIssuances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmReject, setConfirmReject] = useState(null); // {id, reason}
  const [confirmIssued, setConfirmIssued] = useState(null); // {id, issued_to, issuance_date}
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    amount: '',
    reason: '',
    issuance_method: 'cash',
    reference: '',
    attachment_path: '',
    attachment_filename: '',
    uploading: false,
  });

  const headers = { Authorization: `Bearer ${token}` };
  const baseUrl = creditNote
    ? `${API_URL}/api/distributors/${distributorId}/credit-notes/${creditNote.id}/issuances`
    : null;

  const fetchIssuances = useCallback(async () => {
    if (!baseUrl) return;
    setLoading(true);
    try {
      const r = await axios.get(baseUrl, { headers });
      setIssuances(r.data.issuances || []);
    } catch (e) {
      toast.error('Failed to load issuances');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, token]);

  useEffect(() => {
    if (open && creditNote) {
      fetchIssuances();
      setShowCreateForm(false);
      setForm({ amount: '', reason: '', issuance_method: 'cash', reference: '', attachment_path: '', attachment_filename: '', uploading: false });
    }
  }, [open, creditNote, fetchIssuances]);

  if (!creditNote) return null;

  const pendingTotal = issuances
    .filter((i) => i.status === 'pending_approval')
    .reduce((s, i) => s + (i.amount || 0), 0);
  const availableBalance = (creditNote.balance_amount || 0) - pendingTotal;

  const handleUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10 MB)');
      return;
    }
    const data = new FormData();
    data.append('file', file);
    setForm((f) => ({ ...f, uploading: true }));
    try {
      const r = await axios.post(`${baseUrl}/upload-attachment`, data, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      setForm((f) => ({
        ...f,
        attachment_path: r.data.attachment_path,
        attachment_filename: r.data.attachment_filename,
      }));
      toast.success('Attachment uploaded');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setForm((f) => ({ ...f, uploading: false }));
    }
  };

  const handleSubmit = async () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) return toast.error('Enter a valid amount');
    if (amount > availableBalance + 0.001) return toast.error(`Amount exceeds available balance ${fmtINR(availableBalance)}`);
    if (!form.reason.trim()) return toast.error('Reason is required');

    setSubmitting(true);
    try {
      await axios.post(baseUrl, {
        amount,
        reason: form.reason.trim(),
        issuance_method: form.issuance_method,
        reference: form.reference || null,
        attachment_path: form.attachment_path || null,
        attachment_filename: form.attachment_filename || null,
      }, { headers });
      toast.success('Credit issuance submitted for approval');
      setShowCreateForm(false);
      setForm({ amount: '', reason: '', issuance_method: 'cash', reference: '', attachment_path: '', attachment_filename: '', uploading: false });
      await fetchIssuances();
      onChanged && onChanged();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const callAction = async (path, body, successMsg) => {
    try {
      await axios.post(`${baseUrl}/${path}`, body || {}, { headers });
      toast.success(successMsg);
      await fetchIssuances();
      onChanged && onChanged();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    }
  };

  const downloadAttachment = (issuanceId, filename) => {
    axios.get(`${baseUrl}/${issuanceId}/attachment`, {
      headers,
      responseType: 'blob',
    }).then((r) => {
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'attachment';
      a.click();
      URL.revokeObjectURL(url);
    }).catch(() => toast.error('Failed to download attachment'));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="credit-issuance-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-600" />
            Issue Credit to Customer
          </DialogTitle>
          <DialogDescription>
            Issue credit against <span className="font-medium">{creditNote.credit_note_number}</span>{creditNote.account_name ? ` for ${creditNote.account_name}` : ''}, independent of any delivery. Requires CEO / System Admin approval.
          </DialogDescription>
        </DialogHeader>

        {/* Balance summary */}
        <div className="grid grid-cols-3 gap-3" data-testid="credit-issuance-balance">
          <div className="rounded-lg bg-slate-50 p-3 border">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Original Credit</div>
            <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">{fmtINR(creditNote.original_amount)}</div>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-200">
            <div className="text-[10px] uppercase tracking-wider text-emerald-600">Available Now</div>
            <div className="text-lg font-bold text-emerald-700 tabular-nums mt-1">{fmtINR(availableBalance)}</div>
            {pendingTotal > 0 && (
              <div className="text-[10px] text-amber-700 mt-0.5">{fmtINR(pendingTotal)} pending approval</div>
            )}
          </div>
          <div className="rounded-lg bg-slate-50 p-3 border">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Already Drawn</div>
            <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">{fmtINR(creditNote.applied_amount)}</div>
          </div>
        </div>

        {/* Issuance list */}
        <div className="space-y-2 mt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Issuance History</h3>
            {!showCreateForm && availableBalance > 0.001 && (
              <Button size="sm" onClick={() => setShowCreateForm(true)} data-testid="new-issuance-btn">
                <Plus className="h-4 w-4 mr-1" /> New Issuance
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : issuances.length === 0 ? (
            <div className="text-sm text-muted-foreground border rounded-md py-6 text-center bg-slate-50/50" data-testid="no-issuances">
              No standalone credit issuances yet for this credit note.
            </div>
          ) : (
            <div className="border rounded-md divide-y" data-testid="issuance-list">
              {issuances.map((iss) => {
                const sb = STATUS_BADGE[iss.status] || STATUS_BADGE.pending_approval;
                const isCreator = iss.created_by === user?.id;
                return (
                  <div key={iss.id} className="p-3 space-y-1.5" data-testid={`issuance-row-${iss.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-base tabular-nums" data-testid="issuance-amount">{fmtINR(iss.amount)}</span>
                          <Badge variant="outline" className={sb.cls} data-testid={`issuance-status-${iss.id}`}>{sb.label}</Badge>
                          <span className="text-[11px] text-muted-foreground capitalize">via {iss.issuance_method?.replace('_', ' ')}</span>
                          {iss.reference && <span className="text-[11px] text-muted-foreground">· Ref: {iss.reference}</span>}
                        </div>
                        <p className="text-sm text-slate-700 mt-1">{iss.reason}</p>
                        <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>Submitted by {iss.created_by_name} on {new Date(iss.created_at).toLocaleDateString()}</span>
                          {iss.approved_by_name && <span>· {iss.status === 'rejected' ? 'Rejected' : 'Approved'} by {iss.approved_by_name}</span>}
                          {iss.issued_at && <span>· Issued {iss.issued_at}{iss.issued_to ? ` to ${iss.issued_to}` : ''}</span>}
                        </div>
                        {iss.rejection_reason && (
                          <p className="text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded mt-1">Rejection reason: {iss.rejection_reason}</p>
                        )}
                        {iss.attachment_filename && (
                          <button onClick={() => downloadAttachment(iss.id, iss.attachment_filename)} className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1 mt-1" data-testid="download-attachment-btn">
                            <Paperclip className="h-3 w-3" /> {iss.attachment_filename}
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {iss.status === 'pending_approval' && canApprove && (
                          <>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7" onClick={() => callAction(`${iss.id}/approve`, null, 'Issuance approved')} data-testid="approve-issuance-btn">
                              <Check className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7" onClick={() => setConfirmReject({ id: iss.id, reason: '' })} data-testid="reject-issuance-btn">
                              <X className="h-3 w-3 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {iss.status === 'approved' && (canApprove || isCreator) && (
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7" onClick={() => setConfirmIssued({ id: iss.id, issued_to: '', issuance_date: new Date().toISOString().split('T')[0] })} data-testid="mark-issued-btn">
                            <Send className="h-3 w-3 mr-1" /> Mark Issued
                          </Button>
                        )}
                        {(iss.status === 'pending_approval' || iss.status === 'approved') && (canApprove || isCreator) && (
                          <Button size="sm" variant="ghost" className="h-7 text-rose-600 hover:bg-rose-50" onClick={() => callAction(`${iss.id}/cancel`, null, 'Issuance cancelled')} data-testid="cancel-issuance-btn">
                            <Trash2 className="h-3 w-3 mr-1" /> Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* New issuance form */}
        {showCreateForm && (
          <div className="border rounded-md p-4 bg-slate-50/60 space-y-3 mt-2" data-testid="issuance-form">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" /> New Credit Issuance Request
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Amount<span className="text-rose-500">*</span></Label>
                <Input type="number" step="0.01" min="0" max={availableBalance}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder={`Up to ${fmtINR(availableBalance)}`}
                  data-testid="issuance-amount-input" />
              </div>
              <div>
                <Label className="text-xs">Issuance Method<span className="text-rose-500">*</span></Label>
                <Select value={form.issuance_method} onValueChange={(v) => setForm({ ...form, issuance_method: v })}>
                  <SelectTrigger data-testid="issuance-method-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Reason<span className="text-rose-500">*</span></Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Why is this credit being issued directly to the customer?"
                rows={2}
                data-testid="issuance-reason-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Reference (optional)</Label>
                <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Cheque #, UTR, Slip ID…" data-testid="issuance-reference-input" />
              </div>
              <div>
                <Label className="text-xs">Attachment (optional)</Label>
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} accept="image/*,.pdf" />
                  <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={form.uploading} data-testid="issuance-upload-btn">
                    <Paperclip className="h-3 w-3 mr-1" />
                    {form.uploading ? 'Uploading…' : (form.attachment_filename ? 'Replace' : 'Upload File')}
                  </Button>
                  {form.attachment_filename && (
                    <span className="text-xs text-slate-600 truncate" title={form.attachment_filename}>{form.attachment_filename}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowCreateForm(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting} data-testid="submit-issuance-btn">
                {submitting ? 'Submitting…' : 'Submit for Approval'}
              </Button>
            </div>
          </div>
        )}

        {/* Reject prompt */}
        {confirmReject && (
          <div className="border rounded-md p-3 bg-rose-50 border-rose-200 space-y-2" data-testid="reject-form">
            <p className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-rose-600" /> Reject this issuance</p>
            <Textarea
              value={confirmReject.reason}
              onChange={(e) => setConfirmReject({ ...confirmReject, reason: e.target.value })}
              placeholder="Reason for rejection (required)"
              rows={2}
              data-testid="reject-reason-input"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmReject(null)}>Cancel</Button>
              <Button size="sm" variant="destructive"
                disabled={!confirmReject.reason.trim()}
                onClick={async () => {
                  await callAction(`${confirmReject.id}/reject`, { rejection_reason: confirmReject.reason.trim() }, 'Issuance rejected');
                  setConfirmReject(null);
                }}
                data-testid="confirm-reject-btn">
                Reject
              </Button>
            </div>
          </div>
        )}

        {/* Mark-issued prompt */}
        {confirmIssued && (
          <div className="border rounded-md p-3 bg-emerald-50 border-emerald-200 space-y-2" data-testid="mark-issued-form">
            <p className="text-sm font-semibold flex items-center gap-2"><Send className="h-4 w-4 text-emerald-700" /> Record handover to customer</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Issued To (optional)</Label>
                <Input value={confirmIssued.issued_to} onChange={(e) => setConfirmIssued({ ...confirmIssued, issued_to: e.target.value })} placeholder="Customer rep name" data-testid="issued-to-input" />
              </div>
              <div>
                <Label className="text-xs">Issuance Date</Label>
                <Input type="date" value={confirmIssued.issuance_date} onChange={(e) => setConfirmIssued({ ...confirmIssued, issuance_date: e.target.value })} data-testid="issuance-date-input" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmIssued(null)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                onClick={async () => {
                  await callAction(`${confirmIssued.id}/mark-issued`, {
                    issued_to: confirmIssued.issued_to || null,
                    issuance_date: confirmIssued.issuance_date || null,
                  }, 'Recorded as issued');
                  setConfirmIssued(null);
                }}
                data-testid="confirm-mark-issued-btn">
                Mark Issued
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
