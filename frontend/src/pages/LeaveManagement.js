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
import { Calendar, CheckCircle, XCircle, Clock, Plus, Loader2, CalendarDays } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const LEAVE_TYPES = [
  { value: 'casual', label: 'Casual Leave' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'earned', label: 'Earned Leave' },
  { value: 'unpaid', label: 'Unpaid Leave' }
];

export default function LeaveManagement() {
  const { user } = useAuth();
  const [myRequests, setMyRequests] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const [requestsRes, approvalsRes] = await Promise.all([
        axios.get(`${API_URL}/leave-requests`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/leave-requests/pending-approvals`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      setMyRequests(requestsRes.data);
      setPendingApprovals(approvalsRes.data.pending_requests || []);
    } catch (error) {
      toast.error('Failed to load leave data');
    } finally {
      setLoading(false);
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
      toast.error('Failed to update leave request');
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

  const isManager = ['ceo', 'director', 'vp', 'admin', 'sales_manager'].includes(user?.role);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="leave-management-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative max-w-6xl mx-auto space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between">
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
            <LeaveApplicationForm onSuccess={() => { setDialogOpen(false); fetchData(); }} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Pending Approvals for Managers */}
      {isManager && pendingApprovals.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Pending Approvals ({pendingApprovals.length})</h2>
          </div>
          {pendingApprovals.map(req => (
            <LeaveRequestCard key={req.id} request={req} onApprove={handleApproval} showActions />
          ))}
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
          myRequests.filter(r => r.user_id === user.id).map(req => (
            <LeaveRequestCard key={req.id} request={req} />
          ))
        )}
      </div>

      {/* Team Requests (for managers) */}
      {isManager && myRequests.filter(r => r.user_id !== user.id).length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Team Leave Requests</h2>
          {myRequests.filter(r => r.user_id !== user.id).map(req => (
            <LeaveRequestCard key={req.id} request={req} onApprove={handleApproval} showActions={req.status === 'pending'} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

function LeaveRequestCard({ request, onApprove, showActions }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const statusColors = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
  };

  return (
    <Card className="p-6 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 rounded-2xl">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Calendar className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-lg">{request.user_name}</p>
            <p className="text-sm text-muted-foreground capitalize">{request.leave_type} Leave</p>
          </div>
        </div>
        <Badge className={statusColors[request.status]}>
          {request.status.toUpperCase()}
        </Badge>
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

function LeaveApplicationForm({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    leave_type: 'casual',
    start_date: '',
    end_date: '',
    reason: ''
  });

  const calculateDays = () => {
    if (formData.start_date && formData.end_date) {
      const days = differenceInDays(new Date(formData.end_date), new Date(formData.start_date)) + 1;
      return days > 0 ? days : 0;
    }
    return 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (calculateDays() <= 0) {
      toast.error('End date must be after start date');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/leave-requests`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Leave request submitted!');
      onSuccess();
    } catch (error) {
      toast.error('Failed to submit leave request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Leave Type *</Label>
        <Select value={formData.leave_type} onValueChange={(v) => setFormData(p => ({...p, leave_type: v}))} required>
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Date *</Label>
          <Input
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData(p => ({...p, start_date: e.target.value}))}
            min={format(new Date(), 'yyyy-MM-dd')}
            required
            className="h-11"
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
          />
        </div>
      </div>

      {formData.start_date && formData.end_date && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
          <p className="text-sm text-center font-semibold text-primary">
            Total: {calculateDays()} {calculateDays() === 1 ? 'day' : 'days'}
          </p>
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

      <Button type="submit" className="w-full h-12 rounded-full" disabled={loading}>
        {loading ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Submitting...</> : 'Submit Leave Request'}
      </Button>
    </form>
  );
}
