import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import {
  Plus,
  Target,
  Calendar,
  ArrowRight,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Lock,
  Loader2,
  CheckCircle2,
  Send,
  Ban,
  Users
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Format currency in Indian style
const formatCurrency = (amount, short = false) => {
  if (!amount) return '₹0';
  if (short) {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)} L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  }
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

const getStatusBadge = (status) => {
  const styles = {
    draft: 'bg-slate-50 text-slate-700 border border-slate-200/60',
    active: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
    completed: 'bg-blue-50 text-blue-700 border border-blue-200/60',
    inactive: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
    locked: 'bg-amber-50 text-amber-700 border border-amber-200/60'
  };
  return styles[status] || styles.draft;
};

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

// Color-hashed initials avatar (matches the Leads list style)
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500',
  'bg-cyan-500', 'bg-amber-500', 'bg-emerald-500', 'bg-violet-500'
];
const getNameAvatar = (name) => {
  const n = (name || '').trim();
  const parts = n.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (n.slice(0, 2).toUpperCase() || '?');
  const seed = (n || '?').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return { initials, bgColor: AVATAR_COLORS[seed % AVATAR_COLORS.length] };
};

// Consistent computed plan title: "<Month / YY>" (single month) or
// "<Start Month / YY> - <End Month / YY>" (multi-month). Parsed from the
// YYYY-MM-DD strings directly to avoid any timezone drift.
const TP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtPlanMonth = (dateStr) => {
  if (!dateStr) return '';
  const [y, m] = dateStr.split('-').map(Number);
  return `${TP_MONTHS[(m || 1) - 1]} / ${String(y).slice(-2)}`;
};
const getPlanPeriodLabel = (plan) => {
  if (!plan?.start_date || !plan?.end_date) return plan?.name || 'Target Plan';
  const [sy, sm] = plan.start_date.split('-').map(Number);
  const [ey, em] = plan.end_date.split('-').map(Number);
  const single = sy === ey && sm === em;
  return single
    ? fmtPlanMonth(plan.start_date)
    : `${fmtPlanMonth(plan.start_date)} - ${fmtPlanMonth(plan.end_date)}`;
};
// Initials owner = assigned user, falling back to the creator when unassigned
const getPlanOwnerName = (plan) => plan?.assigned_to_name || plan?.created_by_name || '';

export default function TargetPlanningList() {
  const navigate = useNavigate();
  const { planId: editParamId } = useParams();
  const [plans, setPlans] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
    goal_type: 'run_rate',  // "run_rate" or "cumulative"
    total_amount: '',
    milestones: '4',
    description: '',
    assigned_to: ''
  });

  useEffect(() => {
    fetchPlans();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (editParamId && plans.length > 0) {
      const plan = plans.find((p) => p.id === editParamId);
      if (plan) {
        handleOpenEditDialog(plan);
      } else {
        toast.error('Target plan not found');
        navigate('/target-planning', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParamId, plans]);

  const fetchPlans = async () => {
    try {
      const response = await fetch(`${API_URL}/target-planning`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setPlans(data);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_URL}/users?is_active=true`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : (data.data || []);
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setUsers(list);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleCreatePlan = async () => {
    if (!formData.name || !formData.start_date || !formData.end_date || !formData.total_amount) {
      toast.error('Please fill all required fields');
      return;
    }

    setCreating(true);
    try {
      const isEdit = !!editingPlanId;
      const url = isEdit
        ? `${API_URL}/target-planning/${editingPlanId}`
        : `${API_URL}/target-planning`;
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          ...formData,
          total_amount: parseFloat(formData.total_amount),
          milestones: parseInt(formData.milestones) || 4
        })
      });

      if (response.ok) {
        const savedPlan = await response.json();
        toast.success(isEdit ? 'Target plan updated' : 'Target plan created');
        setShowCreateDialog(false);
        setEditingPlanId(null);
        setFormData({ name: '', start_date: '', end_date: '', goal_type: 'run_rate', total_amount: '', milestones: '4', description: '', assigned_to: '' });
        if (isEdit) {
          if (editParamId) {
            navigate('/target-planning', { replace: true });
          } else {
            fetchPlans();
          }
        } else {
          navigate(`/target-planning/${savedPlan.id}`);
        }
      } else {
        const error = await response.json();
        toast.error(error.detail || `Failed to ${isEdit ? 'update' : 'create'} plan`);
      }
    } catch (error) {
      toast.error(`Failed to ${editingPlanId ? 'update' : 'create'} plan`);
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEditDialog = (plan) => {
    setEditingPlanId(plan.id);
    setFormData({
      name: plan.name || '',
      start_date: plan.start_date || '',
      end_date: plan.end_date || '',
      goal_type: plan.goal_type || 'run_rate',
      total_amount: plan.total_amount != null ? String(plan.total_amount) : '',
      milestones: plan.milestones != null ? String(plan.milestones) : '4',
      description: plan.description || '',
      assigned_to: plan.assigned_to || ''
    });
    setShowCreateDialog(true);
  };

  const handleOpenCreateDialog = () => {
    setEditingPlanId(null);
    setFormData({ name: '', start_date: '', end_date: '', goal_type: 'run_rate', total_amount: '', milestones: '4', description: '', assigned_to: '' });
    setShowCreateDialog(true);
  };

  const handleUpdateStatus = async (planId, newStatus) => {
    try {
      const response = await fetch(`${API_URL}/target-planning/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        const labels = { active: 'activated', inactive: 'inactivated', completed: 'marked completed', draft: 'reverted to draft' };
        toast.success(`Target plan ${labels[newStatus] || 'updated'}`);
        fetchPlans();
      } else {
        const error = await response.json().catch(() => ({}));
        toast.error(error.detail || 'Failed to update status');
      }
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleDeletePlan = async (planId) => {
    if (!window.confirm('Are you sure you want to delete this target plan?')) return;

    try {
      const response = await fetch(`${API_URL}/target-planning/${planId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        toast.success('Target plan deleted');
        fetchPlans();
      }
    } catch (error) {
      toast.error('Failed to delete plan');
    }
  };

  const handleDuplicatePlan = async (plan) => {
    try {
      const response = await fetch(`${API_URL}/target-planning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          name: `${plan.name} (Copy)`,
          start_date: plan.start_date,
          end_date: plan.end_date,
          target_type: plan.target_type,
          total_amount: plan.total_amount,
          description: plan.description
        })
      });

      if (response.ok) {
        toast.success('Plan duplicated');
        fetchPlans();
      }
    } catch (error) {
      toast.error('Failed to duplicate plan');
    }
  };

  const calculateDuration = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const months = Math.round((end - start) / (1000 * 60 * 60 * 24 * 30));
    return months === 1 ? '1 month' : `${months} months`;
  };

  const calculateProgress = (plan) => {
    const start = new Date(plan.start_date);
    const end = new Date(plan.end_date);
    const now = new Date();
    const total = end - start;
    const elapsed = now - start;
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  };

  // Group plans by the user they are assigned to (alphabetical; Unassigned last)
  const UNASSIGNED = 'Unassigned';
  const groupedPlans = Object.entries(
    plans.reduce((acc, p) => {
      const key = p.assigned_to_name || UNASSIGNED;
      (acc[key] = acc[key] || []).push(p);
      return acc;
    }, {})
  ).sort((a, b) => {
    if (a[0] === UNASSIGNED) return 1;
    if (b[0] === UNASSIGNED) return -1;
    return a[0].localeCompare(b[0]);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 md:px-8 md:py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900">Target Planning</h1>
          <p className="text-sm text-zinc-500 mt-2 max-w-xl">Create and manage revenue targets across territories, cities, and resources.</p>
        </div>
        <Button
          onClick={handleOpenCreateDialog}
          className="bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm active:scale-95 transition-transform shrink-0"
          data-testid="create-plan-btn"
        >
          <Plus className="h-4 w-4 mr-2" /> New Target Plan
        </Button>
      </div>

      {/* Plans Grid */}
      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50">
          <Target className="size-12 text-zinc-300 mb-4" />
          <h3 className="text-lg font-medium text-zinc-900 mb-2">No Target Plans Yet</h3>
          <p className="text-sm text-zinc-500 max-w-sm mb-6">Create your first target plan to start tracking revenue goals across territories, cities, and resources.</p>
          <Button onClick={handleOpenCreateDialog} className="bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm">
            <Plus className="h-4 w-4 mr-2" /> Create Target Plan
          </Button>
        </div>
      ) : (
        <div>
          {groupedPlans.map(([creator, creatorPlans]) => (
            <div key={creator} className="mt-10 first:mt-0" data-testid={`plan-group-${creator}`}>
              {/* Assigned-user group header */}
              <div className="flex items-center gap-3 py-4 mb-5 border-b border-zinc-100">
                <div className="size-8 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-semibold">
                  {getInitials(creator)}
                </div>
                <h2 className="text-lg font-medium tracking-tight text-zinc-900">{creator}</h2>
                <span className="text-sm text-zinc-400">{creatorPlans.length} {creatorPlans.length === 1 ? 'plan' : 'plans'}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {creatorPlans.map((plan) => {
            const progress = calculateProgress(plan);
            const allocationPercent = plan.total_amount > 0 
              ? Math.round(((plan.allocated_amount || 0) / plan.total_amount) * 100) 
              : 0;
            const currentMonth = plan.current_month;
            const currentMonthPercent = currentMonth && plan.total_amount > 0
              ? Math.round(((currentMonth.invoice_value || 0) / plan.total_amount) * 100)
              : 0;

            return (
              <div
                key={plan.id}
                className="group relative flex flex-col bg-white rounded-xl border border-zinc-200 p-6 cursor-pointer transition-all duration-200 hover:border-zinc-300 hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] hover:-translate-y-0.5"
                onClick={() => navigate(`/target-planning/${plan.id}`)}
                data-testid={`plan-card-${plan.id}`}
              >
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3 min-w-0">
                    {(() => {
                      const owner = getPlanOwnerName(plan);
                      const av = getNameAvatar(owner);
                      return (
                        <span
                          className={`size-9 rounded-full ${av.bgColor} flex items-center justify-center text-white text-xs font-semibold shadow-sm shrink-0`}
                          title={owner || 'Unassigned'}
                        >
                          {av.initials}
                        </span>
                      );
                    })()}
                    <div className="min-w-0 flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold tracking-tight text-zinc-900" data-testid={`plan-title-${plan.id}`}>
                        {getPlanPeriodLabel(plan)}
                      </h3>
                      <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-md font-medium" data-testid={`plan-owner-pill-${plan.id}`}>
                        {getPlanOwnerName(plan) || 'Unassigned'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getStatusBadge(plan.status)}`} data-testid={`plan-status-pill-${plan.id}`}>
                      {plan.status}
                    </span>
                    {plan.status === 'locked' && <Lock className="h-3 w-3 text-amber-600" />}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="size-8 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenEditDialog(plan); }}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit Plan
                      </DropdownMenuItem>
                      {plan.status === 'draft' && (
                        <DropdownMenuItem
                          className="text-green-700"
                          onClick={(e) => { e.stopPropagation(); handleUpdateStatus(plan.id, 'active'); }}
                          data-testid={`publish-plan-${plan.id}`}
                        >
                          <Send className="h-4 w-4 mr-2" /> Publish Plan
                        </DropdownMenuItem>
                      )}
                      {plan.status === 'active' && (
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); handleUpdateStatus(plan.id, 'completed'); }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Completed
                        </DropdownMenuItem>
                      )}
                      {plan.status === 'active' && (
                        <DropdownMenuItem
                          className="text-zinc-700"
                          onClick={(e) => { e.stopPropagation(); handleUpdateStatus(plan.id, 'inactive'); }}
                          data-testid={`inactivate-plan-${plan.id}`}
                        >
                          <Ban className="h-4 w-4 mr-2" /> Inactivate
                        </DropdownMenuItem>
                      )}
                      {plan.status === 'inactive' && (
                        <DropdownMenuItem
                          className="text-green-700"
                          onClick={(e) => { e.stopPropagation(); handleUpdateStatus(plan.id, 'active'); }}
                          data-testid={`reactivate-plan-${plan.id}`}
                        >
                          <Send className="h-4 w-4 mr-2" /> Reactivate
                        </DropdownMenuItem>
                      )}
                      {(plan.status === 'active' || plan.status === 'completed' || plan.status === 'inactive') && (
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); handleUpdateStatus(plan.id, 'draft'); }}
                        >
                          <Pencil className="h-4 w-4 mr-2" /> Revert to Draft
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicatePlan(plan); }}>
                        <Copy className="h-4 w-4 mr-2" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={(e) => { e.stopPropagation(); handleDeletePlan(plan.id); }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Meta: date range */}
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-5">
                  <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                  <span>{new Date(plan.start_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} - {new Date(plan.end_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="text-zinc-300">·</span>
                  <span>{calculateDuration(plan.start_date, plan.end_date)}</span>
                </div>

                {/* Metric */}
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tighter text-zinc-900">{formatCurrency(plan.total_amount)}</span>
                  <span className="text-xs text-zinc-500">{plan.goal_type === 'cumulative' ? 'total target' : '/ month goal'}</span>
                </div>
                <div className="mt-2">
                  <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-wider text-zinc-500 border border-zinc-200 rounded px-2 py-0.5">
                    {plan.goal_type === 'cumulative' ? 'Cumulative' : 'Monthly Run Rate'}
                  </span>
                </div>

                {/* Progress section */}
                <div className="flex flex-col gap-3 mt-auto pt-6 border-t border-zinc-100">
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                      <span>Time Elapsed</span>
                      <span className="text-zinc-700">{progress}%</span>
                    </div>
                    <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                      <span>Allocated</span>
                      <span className="text-zinc-700">{formatCurrency(plan.allocated_amount, true)} · {allocationPercent}%</span>
                    </div>
                    <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ease-out ${allocationPercent >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, allocationPercent)}%` }} />
                    </div>
                  </div>

                  {currentMonth && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">
                        <span>{currentMonth.month}</span>
                        <span className="text-zinc-700">{formatCurrency(currentMonth.invoice_value, true)} · {currentMonthPercent}%</span>
                      </div>
                      <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${Math.min(100, currentMonthPercent)}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="mt-1 flex items-center text-sm font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    View Details <ArrowRight className="h-4 w-4 ml-1" />
                  </div>
                </div>
              </div>
            );
          })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Plan Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setEditingPlanId(null);
          if (editParamId) navigate('/target-planning', { replace: true });
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              {editingPlanId ? 'Edit Target Plan' : 'Create Target Plan'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Plan Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Q1 2026 Revenue Target"
                className="mt-1"
                data-testid="plan-name-input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="mt-1"
                  data-testid="plan-start-date"
                />
              </div>
              <div>
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="mt-1"
                  data-testid="plan-end-date"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Goal Type *</Label>
                <Select value={formData.goal_type} onValueChange={(v) => setFormData({ ...formData, goal_type: v })}>
                  <SelectTrigger className="mt-1" data-testid="goal-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="run_rate">
                      <div className="flex flex-col">
                        <span className="font-medium">Monthly Run Rate Goal</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="cumulative">
                      <div className="flex flex-col">
                        <span className="font-medium">Cumulative Target</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.goal_type === 'run_rate' 
                    ? 'Build monthly revenue up to target by end date' 
                    : 'Total revenue to achieve over the period'}
                </p>
              </div>
              <div>
                <Label>{formData.goal_type === 'run_rate' ? 'Monthly Target (₹)' : 'Total Target (₹)'} *</Label>
                <Input
                  type="number"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                  placeholder="e.g., 10000000"
                  className="mt-1"
                  data-testid="plan-amount-input"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.goal_type === 'run_rate' 
                    ? 'Target monthly revenue by the end date' 
                    : 'Total revenue target for the period'}
                </p>
              </div>
            </div>

            <div>
              <Label>Number of Milestones</Label>
              <Select value={formData.milestones} onValueChange={(v) => setFormData({ ...formData, milestones: v })}>
                <SelectTrigger className="mt-1" data-testid="plan-milestones-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 Milestones</SelectItem>
                  <SelectItem value="3">3 Milestones</SelectItem>
                  <SelectItem value="4">4 Milestones</SelectItem>
                  <SelectItem value="6">6 Milestones</SelectItem>
                  <SelectItem value="8">8 Milestones</SelectItem>
                  <SelectItem value="12">12 Milestones</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Target will be split into equal milestone periods</p>
            </div>

            <div>
              <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Assign To</Label>
              <Select
                value={formData.assigned_to || '__unassigned__'}
                onValueChange={(v) => setFormData({ ...formData, assigned_to: v === '__unassigned__' ? '' : v })}
              >
                <SelectTrigger className="mt-1" data-testid="plan-assignee-select">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id} data-testid={`assignee-option-${u.id}`}>
                      {u.name}{u.role ? <span className="text-muted-foreground"> · {u.role}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Plans are grouped by their assigned user on the dashboard</p>
            </div>

            <div>
              <Label>Description (Optional)</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Add any notes about this target plan..."
                className="mt-1"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setEditingPlanId(null); if (editParamId) navigate('/target-planning', { replace: true }); }}>Cancel</Button>
            <Button onClick={handleCreatePlan} disabled={creating} data-testid="submit-plan-btn">
              {creating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {editingPlanId ? 'Saving...' : 'Creating...'}</>
              ) : (editingPlanId ? 'Save Changes' : 'Create Plan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
