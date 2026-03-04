import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
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
  IndianRupee,
  ArrowRight,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Lock,
  Loader2,
  TrendingUp,
  Clock
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
const formatCurrency = (amount) => {
  if (!amount) return '₹0';
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${amount.toLocaleString('en-IN')}`;
};

const getStatusBadge = (status) => {
  const styles = {
    draft: 'bg-gray-100 text-gray-700',
    active: 'bg-green-100 text-green-700',
    completed: 'bg-blue-100 text-blue-700',
    locked: 'bg-amber-100 text-amber-700'
  };
  return styles[status] || styles.draft;
};

export default function TargetPlanningList() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
    target_type: 'revenue',
    total_amount: '',
    description: ''
  });

  useEffect(() => {
    fetchPlans();
  }, []);

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

  const handleCreatePlan = async () => {
    if (!formData.name || !formData.start_date || !formData.end_date || !formData.total_amount) {
      toast.error('Please fill all required fields');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`${API_URL}/target-planning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          ...formData,
          total_amount: parseFloat(formData.total_amount)
        })
      });

      if (response.ok) {
        const newPlan = await response.json();
        toast.success('Target plan created');
        setShowCreateDialog(false);
        setFormData({ name: '', start_date: '', end_date: '', target_type: 'revenue', total_amount: '', description: '' });
        navigate(`/target-planning/${newPlan.id}`);
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to create plan');
      }
    } catch (error) {
      toast.error('Failed to create plan');
    } finally {
      setCreating(false);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-7 w-7 text-primary" />
            Target Planning
          </h1>
          <p className="text-muted-foreground mt-1">Create and manage revenue targets across territories, cities, and resources</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="create-plan-btn">
          <Plus className="h-4 w-4 mr-2" /> New Target Plan
        </Button>
      </div>

      {/* Plans Grid */}
      {plans.length === 0 ? (
        <Card className="p-12 text-center">
          <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Target Plans Yet</h3>
          <p className="text-muted-foreground mb-4">Create your first target plan to start tracking revenue goals</p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create Target Plan
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const progress = calculateProgress(plan);
            const allocationPercent = plan.total_amount > 0 
              ? Math.round((plan.allocated_amount / plan.total_amount) * 100) 
              : 0;

            return (
              <Card 
                key={plan.id} 
                className="p-5 hover:shadow-lg transition-shadow cursor-pointer group"
                onClick={() => navigate(`/target-planning/${plan.id}`)}
                data-testid={`plan-card-${plan.id}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getStatusBadge(plan.status)}>{plan.status}</Badge>
                      {plan.status === 'locked' && <Lock className="h-3 w-3 text-amber-600" />}
                    </div>
                    <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">{plan.name}</h3>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/target-planning/${plan.id}/edit`); }}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit Plan
                      </DropdownMenuItem>
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

                {/* Duration & Target */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(plan.start_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} - {new Date(plan.end_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{calculateDuration(plan.start_date, plan.end_date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-4 w-4 text-primary" />
                    <span className="text-xl font-bold">{formatCurrency(plan.total_amount)}</span>
                  </div>
                </div>

                {/* Time Progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Time Elapsed</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Allocation Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Allocated</span>
                    <span>{formatCurrency(plan.allocated_amount)} ({allocationPercent}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${allocationPercent >= 100 ? 'bg-green-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, allocationPercent)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end text-sm text-primary font-medium group-hover:underline">
                  View Dashboard <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Plan Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Create Target Plan
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
                <Label>Target Type</Label>
                <Select value={formData.target_type} onValueChange={(v) => setFormData({ ...formData, target_type: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">Revenue (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Total Target Amount (₹) *</Label>
                <Input
                  type="number"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                  placeholder="e.g., 10000000"
                  className="mt-1"
                  data-testid="plan-amount-input"
                />
              </div>
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
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreatePlan} disabled={creating} data-testid="submit-plan-btn">
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
