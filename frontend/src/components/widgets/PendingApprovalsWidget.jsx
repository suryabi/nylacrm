import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { ClipboardCheck, Check, X, ExternalLink, Loader2 } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Maps an approval type to its approve endpoint + the page to review it.
const APPROVAL_META = {
  expense: {
    label: 'Expense',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    endpoint: (id) => `${API_URL}/expense-requests/${id}/approve`,
    canActInline: true,
  },
  travel: {
    label: 'Travel',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    endpoint: (id) => `${API_URL}/travel-requests/${id}/approve`,
    reviewPath: '/travel-requests',
    canActInline: true,
  },
  travel_request: {
    label: 'Travel',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    endpoint: (id) => `${API_URL}/travel-requests/${id}/approve`,
    reviewPath: '/travel-requests',
    canActInline: true,
  },
  budget: {
    label: 'Budget',
    color: 'bg-violet-100 text-violet-700 border-violet-200',
    endpoint: (id) => `${API_URL}/budget-requests/${id}/approve`,
    reviewPath: '/budget-requests',
    canActInline: true,
  },
  budget_request: {
    label: 'Budget',
    color: 'bg-violet-100 text-violet-700 border-violet-200',
    endpoint: (id) => `${API_URL}/budget-requests/${id}/approve`,
    reviewPath: '/budget-requests',
    canActInline: true,
  },
  leave_request: {
    label: 'Leave',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    reviewPath: '/leaves',
    canActInline: false,
  },
};

const fmtDate = (d) => {
  if (!d) return null;
  try {
    const date = parseISO(d);
    return isValid(date) ? format(date, 'MMM d') : null;
  } catch {
    return null;
  }
};

export default function PendingApprovalsWidget() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/approvals/my-pending`, { withCredentials: true });
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      // Silent — widget simply hides if it can't load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reviewItem = (item) => {
    const meta = APPROVAL_META[item.approval_type] || {};
    if (item.lead_id) return navigate(`/leads/${item.lead_id}`);
    if (item.account_id) return navigate(`/accounts/${item.account_id}`);
    if (meta.reviewPath) return navigate(meta.reviewPath);
    navigate('/tasks');
  };

  const act = async (item, status) => {
    const meta = APPROVAL_META[item.approval_type];
    if (!meta || !meta.canActInline || !meta.endpoint) {
      return reviewItem(item);
    }
    if (status === 'rejected' && !rejectReason.trim()) {
      toast.error('Please enter a reason for rejection');
      return;
    }
    setActingId(item.task_id);
    try {
      await axios.put(
        meta.endpoint(item.reference_id),
        { status, rejection_reason: status === 'rejected' ? rejectReason.trim() : null },
        { withCredentials: true }
      );
      toast.success(`${meta.label} request ${status}`);
      setRejectingId(null);
      setRejectReason('');
      setItems((prev) => prev.filter((x) => x.task_id !== item.task_id));
    } catch (e) {
      toast.error(e.response?.data?.detail || `Could not ${status === 'approved' ? 'approve' : 'reject'} the request`);
    } finally {
      setActingId(null);
    }
  };

  // Hide entirely when nothing needs action (keeps the home page clean).
  if (loading || items.length === 0) return null;

  return (
    <Card className="border-amber-200/80 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-slate-900 shadow-sm overflow-hidden" data-testid="pending-approvals-widget">
      <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3 border-b border-amber-200/60">
        <div className="p-1.5 rounded-lg bg-amber-500/15">
          <ClipboardCheck className="h-4 w-4 text-amber-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pending Approvals</h3>
        <Badge className="bg-amber-500 text-white text-[11px] tabular-nums" data-testid="pending-approvals-count">{items.length}</Badge>
        <span className="ml-auto text-xs text-muted-foreground hidden sm:inline">Action needed from you</span>
      </div>

      <ul className="divide-y divide-amber-100/70 dark:divide-slate-800">
        {items.map((item) => {
          const meta = APPROVAL_META[item.approval_type] || { label: 'Request', color: 'bg-slate-100 text-slate-700 border-slate-200', canActInline: false };
          const due = fmtDate(item.due_date);
          const isActing = actingId === item.task_id;
          const isRejecting = rejectingId === item.task_id;
          return (
            <li key={item.task_id} className="px-4 sm:px-5 py-3" data-testid={`approval-item-${item.task_id}`}>
              <div className="flex items-start gap-3 flex-wrap">
                <Badge variant="outline" className={`text-[10px] uppercase tracking-wide shrink-0 ${meta.color}`}>{meta.label}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {item.entity_name || item.title || 'Approval request'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.requester_name ? `From ${item.requester_name}` : ''}
                    {item.amount != null ? ` · ₹${Number(item.amount).toLocaleString('en-IN')}` : ''}
                    {due ? ` · Due ${due}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {meta.canActInline ? (
                    <>
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        disabled={isActing}
                        onClick={() => act(item, 'approved')}
                        data-testid={`approval-approve-${item.task_id}`}
                      >
                        {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-rose-200 text-rose-600 hover:bg-rose-50 text-xs"
                        disabled={isActing}
                        onClick={() => { setRejectingId(isRejecting ? null : item.task_id); setRejectReason(''); }}
                        data-testid={`approval-reject-${item.task_id}`}
                      >
                        <X className="h-3.5 w-3.5 mr-1" /> Reject
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => reviewItem(item)}
                      data-testid={`approval-review-${item.task_id}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Review
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground hover:text-slate-900"
                    onClick={() => reviewItem(item)}
                    data-testid={`approval-open-${item.task_id}`}
                    title="Open details"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {isRejecting && (
                <div className="flex items-center gap-2 mt-2.5" data-testid={`approval-reject-row-${item.task_id}`}>
                  <Input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection..."
                    className="h-8 text-xs bg-white"
                    data-testid={`approval-reject-reason-${item.task_id}`}
                  />
                  <Button
                    size="sm"
                    className="h-8 bg-rose-600 hover:bg-rose-700 text-white text-xs shrink-0"
                    disabled={isActing}
                    onClick={() => act(item, 'rejected')}
                    data-testid={`approval-reject-confirm-${item.task_id}`}
                  >
                    {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Reject'}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
