import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { Calendar, CheckCircle, XCircle, Clock, Plus, Loader2, CalendarDays, Trash2, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { LeaveBalancePanel } from '../components/LeaveBalancePanel';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '../components/ui/alert-dialog';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const LEAVE_TYPES = [
  { value: 'casual', label: 'Casual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'variable_holiday', label: 'Variable Holiday (pick from your city pool)' },
  { value: 'unpaid', label: 'Unpaid Leave' }
];
const TYPE_LABEL = { casual: 'Casual Leave', sick: 'Sick Leave', variable_holiday: 'Variable Holiday', unpaid: 'Unpaid Leave', earned: 'Earned Leave' };
const ADMIN_ROLES = ['admin', 'ceo', 'system admin', 'system_admin'];
const fmtD = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Working days between two dates: Sundays and the user's fixed holidays skipped (mirrors backend).
const workingDays = (start, end, holidayDates = []) => {
  if (!start || !end) return 0;
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00');
  if (e < s) return 0;
  let n = 0;
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (d.getDay() !== 0 && !holidayDates.includes(iso)) n += 1;
  }
  return n;
};

export default function LeaveManagement() {
  const { user } = useAuth();
  const [myRequests, setMyRequests] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [balance, setBalance] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const isAdmin = ADMIN_ROLES.includes((user?.role || '').toLowerCase());

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id]);

  const fetchData = async () => {
    if (!user?.id) return; // Wait for user to be loaded
    
    try {
      const token = localStorage.getItem('token');
      
      // Fetch my requests (all statuses)
      const myRequestsRes = await axios.get(`${API_URL}/leave-requests?user_id=${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Fetch requests for approver (pending from reportees + previously acted upon)
      const approverRes = await axios.get(`${API_URL}/leave-requests/for-approver`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setMyRequests(myRequestsRes.data || []);
      setPendingApprovals(approverRes.data || []);
      axios.get(`${API_URL}/leave-policy/my-balance`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => setBalance(r.data)).catch(() => {});
    } catch (error) {
      console.error('Failed to load leave data:', error);
      toast.error('Failed to load leave data');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/leave-requests/${toDelete.id}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Leave request deleted');
      setToDelete(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete leave request');
    }
  };

  const handleApproval = async (requestId, status, reason = '') => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/leave-requests/${requestId}/approve`,
        { status, rejection_reason: reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Leave ${status}!`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update leave request');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="relative"><div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" /><Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" /></div>
          <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading leave data...</p>
        </div>
      </div>
    );
  }

  const isManager = ['ceo', 'director', 'vp', 'admin', 'sales_manager'].includes(user?.role?.toLowerCase());

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="leave-management-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative max-w-6xl mx-auto space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-sky-100 to-blue-100 dark:from-sky-900/50 dark:to-blue-900/30">
            <CalendarDays className="h-6 w-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Leave Management</h1>
            <p className="text-muted-foreground">Apply for leaves and manage approvals</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="h-12 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg shadow-sky-200/50 dark:shadow-sky-900/30">
              <Plus className="h-5 w-5 mr-2" />
              Apply for Leave
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Apply for Leave</DialogTitle>
            </DialogHeader>
            <LeaveApplicationForm balance={balance} onSuccess={() => { setDialogOpen(false); fetchData(); }} />
          </DialogContent>
        </Dialog>
      </div>

      <LeaveBalancePanel balance={balance} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent data-testid="leave-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this leave request?</AlertDialogTitle>
            <AlertDialogDescription>{toDelete && <>{toDelete.user_name}'s {TYPE_LABEL[toDelete.leave_type] || toDelete.leave_type} · {fmtD(toDelete.start_date)} – {fmtD(toDelete.end_date)} ({toDelete.total_days} day{toDelete.total_days === 1 ? '' : 's'}, {toDelete.status}). This permanently removes it, restores the balance and notifies the employee.</>}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="leave-delete-cancel">Keep</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700 text-white" data-testid="leave-delete-confirm">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pending Approvals for Managers */}
      {isManager && pendingApprovals.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Team Requests ({pendingApprovals.length})</h2>
          </div>
          {pendingApprovals.filter(req => req.status === 'pending').map(req => (
            <LeaveRequestCard key={req.id} request={req} onApprove={handleApproval} showActions onDelete={isAdmin ? setToDelete : null} />
          ))}
          {pendingApprovals.filter(req => req.status !== 'pending').length > 0 && (
            <>
              <h3 className="text-lg font-medium text-slate-600 dark:text-slate-400 mt-6">Previously Reviewed</h3>
              {pendingApprovals.filter(req => req.status !== 'pending').map(req => (
                <LeaveRequestCard key={req.id} request={req} onDelete={isAdmin ? setToDelete : null} />
              ))}
            </>
          )}
        </div>
      )}

      {/* My Leave Requests */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-white">My Leave Requests</h2>
        {myRequests.length === 0 ? (
          <Card className="p-12 text-center border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 rounded-2xl">
            <p className="text-muted-foreground">No leave requests yet</p>
          </Card>
        ) : (
          myRequests.map(req => (
            <LeaveRequestCard key={req.id} request={req} onDelete={isAdmin ? setToDelete : null} />
          ))
        )}
      </div>

      {/* Team Requests (for managers) */}
      </div>
    </div>
  );
}

function LeaveRequestCard({ request, onApprove, showActions, onDelete }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const statusColors = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
  };

  return (
    <Card className="p-6 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 rounded-2xl" data-testid={`leave-request-card-${request.id}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Calendar className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-lg">{request.user_name}</p>
            <p className="text-sm text-muted-foreground">{TYPE_LABEL[request.leave_type] || request.leave_type}{request.routed_to_admins && <span className="ml-1 text-[10px] text-amber-700">· routed to admins</span>}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusColors[request.status]}>
            {request.status.toUpperCase()}
          </Badge>
          {onDelete && (
            <button type="button" onClick={() => onDelete(request)} className="h-8 w-8 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Delete request (Admin / CEO)" data-testid={`leave-delete-${request.id}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-muted-foreground">Start Date</p>
          <p className="font-medium">{format(new Date(request.start_date), 'MMM d, yyyy')}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">End Date</p>
          <p className="font-medium">{format(new Date(request.end_date), 'MMM d, yyyy')}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Days</p>
          <p className="font-medium">{request.total_days} days</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Applied On</p>
          <p className="font-medium">{format(new Date(request.created_at), 'MMM d, yyyy')}</p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-1">Reason</p>
        <p className="text-sm">{request.reason}</p>
      </div>

      {request.rejection_reason && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-800 font-semibold mb-1">Rejection Reason</p>
          <p className="text-sm text-red-900">{request.rejection_reason}</p>
        </div>
      )}

      {showActions && !rejecting && (
        <div className="flex gap-3">
          <Button
            onClick={() => onApprove(request.id, 'approved')}
            className="flex-1 h-11 rounded-full bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Approve
          </Button>
          <Button
            onClick={() => setRejecting(true)}
            variant="outline"
            className="flex-1 h-11 rounded-full border-red-300 text-red-600 hover:bg-red-50"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Reject
          </Button>
        </div>
      )}

      {rejecting && (
        <div className="space-y-3">
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
            className="text-sm"
          />
          <div className="flex gap-3">
            <Button
              onClick={() => {
                onApprove(request.id, 'rejected', rejectionReason);
                setRejecting(false);
              }}
              className="flex-1 h-10 rounded-full bg-red-600 hover:bg-red-700"
              disabled={!rejectionReason.trim()}
            >
              Confirm Reject
            </Button>
            <Button
              onClick={() => setRejecting(false)}
              variant="outline"
              className="flex-1 h-10 rounded-full"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function LeaveApplicationForm({ onSuccess, balance }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    leave_type: 'casual',
    start_date: '',
    end_date: '',
    reason: ''
  });

  const isVar = formData.leave_type === 'variable_holiday';
  const isPaid = ['sick', 'casual'].includes(formData.leave_type);
  const calculateDays = () => (isVar ? (formData.start_date ? 1 : 0) : workingDays(formData.start_date, formData.end_date, balance?.fixed_holiday_dates || []));
  const available = balance?.sick_casual?.available ?? null;
  const remaining = available == null ? null : available - (isPaid ? calculateDays() : 0);
  const overBalance = isPaid && remaining != null && remaining < 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (calculateDays() <= 0) {
      toast.error(isVar ? 'Pick a variable holiday date' : 'Selected dates contain no working days');
      return;
    }
    if (overBalance) {
      toast.error(`Only ${available} Sick/Casual day(s) available — apply as Unpaid Leave for the rest`);
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/leave-requests`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(balance?.reporting_manager ? `Leave request sent to ${balance.reporting_manager.name} for approval` : 'Leave request sent to Admin/CEO for approval');
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit leave request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="leave-application-form">
      {balance && (
        <div className="grid grid-cols-3 gap-2 text-center" data-testid="form-balance-strip">
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-2"><p className="text-[10px] uppercase tracking-wide text-blue-700 font-semibold">Sick/Casual left</p><p className="text-xl font-black text-[#002FA7]">{balance.sick_casual.available}</p></div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2"><p className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">Carried fwd</p><p className="text-xl font-black text-emerald-700">{balance.sick_casual.carry_forward}</p></div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-2"><p className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold">Variable left</p><p className="text-xl font-black text-amber-700">{balance.variable.available}/{balance.variable.total}</p></div>
        </div>
      )}
      <div className="space-y-2">
        <Label>Leave Type *</Label>
        <Select value={formData.leave_type} onValueChange={(v) => setFormData(p => ({...p, leave_type: v, start_date: '', end_date: ''}))} required>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAVE_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isVar ? (
        <div className="space-y-2">
          <Label>Variable holiday *</Label>
          <select value={formData.start_date} onChange={(e) => setFormData(p => ({ ...p, start_date: e.target.value, end_date: e.target.value }))} required className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="variable-holiday-select">
            <option value="">{balance?.city ? `Pick from the ${balance.city} pool…` : 'Your city is not set — ask an admin'}</option>
            {(balance?.variable?.pool || []).map((x) => <option key={x.date} value={x.date} disabled={balance.variable.taken_dates.includes(x.date)}>{x.name} — {fmtD(x.date)}{balance.variable.taken_dates.includes(x.date) ? ' (already applied)' : ''}</option>)}
          </select>
          <p className="text-[11px] text-muted-foreground">{balance?.variable?.available ?? 0} of {balance?.variable?.total ?? 2} variable holidays left this year.</p>
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Date *</Label>
          <Input
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData(p => ({...p, start_date: e.target.value, end_date: p.end_date && p.end_date < e.target.value ? e.target.value : p.end_date}))}
            min={format(new Date(), 'yyyy-MM-dd')}
            required
            className="h-11"
            data-testid="leave-start-date"
          />
        </div>
        <div className="space-y-2">
          <Label>End Date *</Label>
          <Input
            type="date"
            value={formData.end_date}
            onChange={(e) => setFormData(p => ({...p, end_date: e.target.value}))}
            min={formData.start_date || format(new Date(), 'yyyy-MM-dd')}
            required
            className="h-11"
            data-testid="leave-end-date"
          />
        </div>
      </div>
      )}

      {formData.start_date && formData.end_date && (
        <div className={`rounded-xl p-3 border ${overBalance ? 'bg-rose-50 border-rose-200' : 'bg-primary/5 border-primary/20'}`} data-testid="leave-days-summary">
          <p className={`text-sm text-center font-semibold ${overBalance ? 'text-rose-700' : 'text-primary'}`}>
            {calculateDays()} working {calculateDays() === 1 ? 'day' : 'days'}{!isVar && ' (Sundays & fixed holidays skipped)'}
          </p>
          {isPaid && remaining != null && <p className={`text-xs text-center mt-0.5 ${overBalance ? 'text-rose-700 font-semibold' : 'text-muted-foreground'}`}>{overBalance ? `Exceeds your balance by ${-remaining} — use Unpaid Leave for the rest` : `Remaining after this request: ${remaining} Sick/Casual day${remaining === 1 ? '' : 's'}`}</p>}
        </div>
      )}

      <div className="space-y-2">
        <Label>Reason *</Label>
        <Textarea
          value={formData.reason}
          onChange={(e) => setFormData(p => ({...p, reason: e.target.value}))}
          placeholder="Reason for leave..."
          rows={4}
          required
        />
      </div>

      {balance && <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid="form-approver-hint"><UserCheck className="h-3.5 w-3.5" /> {balance.reporting_manager ? <>Will be sent to <b>{balance.reporting_manager.name}</b> for approval</> : 'No reporting manager set — will be sent to Admin/CEO'}</p>}
      <Button type="submit" className="w-full h-12 rounded-full" disabled={loading || overBalance} data-testid="leave-submit">
        {loading ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Submitting...</> : 'Submit Leave Request'}
      </Button>
    </form>
  );
}
