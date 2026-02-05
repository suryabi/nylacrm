import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, ChevronRight, ChevronDown, Lock, Edit, Target } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const TIME_PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-Yearly' },
  { value: 'yearly', label: 'Yearly' }
];

export default function SalesTargets() {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [hierarchy, setHierarchy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/target-plans`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPlans(response.data);
      if (response.data.length > 0 && !selectedPlan) {
        setSelectedPlan(response.data[0]);
        fetchHierarchy(response.data[0].id);
      }
    } catch (error) {
      toast.error('Failed to load target plans');
    } finally {
      setLoading(false);
    }
  };

  const fetchHierarchy = async (planId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/target-plans/${planId}/hierarchy`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHierarchy(response.data);
    } catch (error) {
      toast.error('Failed to load hierarchy');
    }
  };

  const selectPlan = (plan) => {
    setSelectedPlan(plan);
    fetchHierarchy(plan.id);
  };

  if (loading) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-light text-foreground mb-2">Sales Target Planning</h1>
          <p className="text-foreground-muted">Revenue-based target allocation and tracking</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="h-12 rounded-full">
              <Plus className="h-5 w-5 mr-2" />
              Create Target Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Target Plan</DialogTitle>
            </DialogHeader>
            <CreatePlanForm onSuccess={() => { setDialogOpen(false); fetchPlans(); }} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Plan List */}
        <Card className="p-6 bg-card border rounded-2xl lg:col-span-1">
          <h2 className="text-lg font-semibold mb-4">Target Plans</h2>
          <div className="space-y-2">
            {plans.map(plan => (
              <div
                key={plan.id}
                onClick={() => selectPlan(plan)}
                className={`p-4 rounded-xl cursor-pointer transition-all ${
                  selectedPlan?.id === plan.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary hover:bg-secondary/80'
                }`}
              >
                <p className="font-semibold text-sm">{plan.plan_name}</p>
                <p className="text-xs opacity-80 mt-1 capitalize">{plan.time_period}</p>
                <p className="text-xs opacity-80">{plan.start_date} to {plan.end_date}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Hierarchy View */}
        <div className="lg:col-span-3 space-y-6">
          {selectedPlan && hierarchy && (
            <>
              <Card className="p-8 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-semibold text-foreground">{selectedPlan.plan_name}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(new Date(selectedPlan.start_date), 'MMM d, yyyy')} - {format(new Date(selectedPlan.end_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <Badge className={selectedPlan.status === 'locked' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>
                    {selectedPlan.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Country Target</p>
                    <p className="text-3xl font-bold text-primary">₹{(selectedPlan.country_target / 100000).toFixed(1)}L</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Period</p>
                    <p className="text-xl font-semibold capitalize">{selectedPlan.time_period}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Status</p>
                    <p className="text-xl font-semibold capitalize">{selectedPlan.status}</p>
                  </div>
                </div>
              </Card>

              <TerritoryAllocationSection planId={selectedPlan.id} territories={hierarchy.territories} onUpdate={() => fetchHierarchy(selectedPlan.id)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CreatePlanForm({ onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    plan_name: '',
    time_period: 'quarterly',
    start_date: '',
    end_date: '',
    country_target: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/target-plans`,
        { ...formData, country_target: parseFloat(formData.country_target) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Target plan created!');
      onSuccess();
    } catch (error) {
      toast.error('Failed to create plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Plan Name *</Label>
        <Input
          value={formData.plan_name}
          onChange={(e) => setFormData(p => ({...p, plan_name: e.target.value}))}
          placeholder="e.g., Q1 2026 Sales Target"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Time Period *</Label>
          <Select value={formData.time_period} onValueChange={(v) => setFormData(p => ({...p, time_period: v}))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIME_PERIODS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Country Target (₹) *</Label>
          <Input
            type="number"
            value={formData.country_target}
            onChange={(e) => setFormData(p => ({...p, country_target: e.target.value}))}
            placeholder="10000000"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Date *</Label>
          <Input
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData(p => ({...p, start_date: e.target.value}))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>End Date *</Label>
          <Input
            type="date"
            value={formData.end_date}
            onChange={(e) => setFormData(p => ({...p, end_date: e.target.value}))}
            min={formData.start_date}
            required
          />
        </div>
      </div>
      <Button type="submit" className="w-full h-12 rounded-full" disabled={loading}>
        {loading ? 'Creating...' : 'Create Target Plan'}
      </Button>
    </form>
  );
}

function TerritoryAllocationSection({ planId, territories, onUpdate }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Card className="p-6 bg-card border rounded-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Territory Allocation</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="rounded-full">
              <Edit className="h-4 w-4 mr-2" />
              Allocate Territories
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Allocate to Territories</DialogTitle>
            </DialogHeader>
            <TerritoryAllocationForm planId={planId} onSuccess={() => { setDialogOpen(false); onUpdate(); }} />
          </DialogContent>
        </Dialog>
      </div>
      
      {territories.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
          <Target className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No territory targets allocated yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {territories.map(territory => (
            <TerritoryCard key={territory.id} territory={territory} planId={planId} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </Card>
  );
}

function TerritoryAllocationForm({ planId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState([
    { territory: 'North India', target_revenue: '' },
    { territory: 'South India', target_revenue: '' },
    { territory: 'West India', target_revenue: '' },
    { territory: 'East India', target_revenue: '' }
  ]);

  const total = targets.reduce((sum, t) => sum + (parseFloat(t.target_revenue) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = targets.map(t => ({
        territory: t.territory,
        target_revenue: parseFloat(t.target_revenue)
      })).filter(t => t.target_revenue > 0);

      await axios.post(
        `${API_URL}/target-plans/${planId}/territories`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Territory targets allocated!');
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to allocate targets');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {targets.map((target, index) => (
        <div key={target.territory} className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{target.territory}</Label>
            <Input value={target.territory} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label>Target (₹)</Label>
            <Input
              type="number"
              value={target.target_revenue}
              onChange={(e) => {
                const newTargets = [...targets];
                newTargets[index].target_revenue = e.target.value;
                setTargets(newTargets);
              }}
              placeholder="5000000"
            />
          </div>
        </div>
      ))}
      
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-sm font-semibold">Total Allocated: ₹{(total / 100000).toFixed(2)}L</p>
      </div>

      <Button type="submit" className="w-full h-12 rounded-full" disabled={loading}>
        {loading ? 'Allocating...' : 'Allocate Territory Targets'}
      </Button>
    </form>
  );
}

function TerritoryCard({ territory, planId, onUpdate }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div
        onClick={() => setExpanded(!expanded)}
        className="p-4 bg-secondary hover:bg-secondary/80 cursor-pointer flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          <div>
            <p className="font-semibold">{territory.territory}</p>
            <p className="text-xs text-muted-foreground">Target: ₹{(territory.target_revenue / 100000).toFixed(1)}L</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Allocated</p>
          <p className="font-semibold">₹{(territory.allocated_revenue / 100000).toFixed(1)}L</p>
        </div>
      </div>
      
      {expanded && (
        <div className="p-4 bg-background">
          {territory.states && territory.states.length > 0 ? (
            <div className="space-y-3">
              {territory.states.map(state => (
                <div key={state.state_name} className="border border-border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <p className="font-medium">{state.state_name}</p>
                    <p className="text-sm font-semibold text-primary">₹{(state.state_target / 100000).toFixed(1)}L</p>
                  </div>
                  <div className="space-y-2">
                    {state.cities.map(city => (
                      <div key={city.id} className="flex justify-between items-center text-sm bg-muted p-2 rounded">
                        <span>{city.city}</span>
                        <span className="font-medium">₹{(city.target_revenue / 100000).toFixed(1)}L</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-center text-muted-foreground py-6">No city targets allocated</p>
          )}
        </div>
      )}
    </div>
  );
}
