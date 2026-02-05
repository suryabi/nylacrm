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
import { Plus, Target } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  React.useEffect(() => {
    const fetchPlans = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/target-plans`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPlans(response.data);
        if (response.data.length > 0) {
          setSelectedPlan(response.data[0]);
        }
      } catch (error) {
        toast.error('Failed to load plans');
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-light text-foreground mb-2">Sales Target Planning</h1>
          <p className="text-foreground-muted">Revenue-based target allocation</p>
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
            <CreatePlanForm onSuccess={() => { setDialogOpen(false); window.location.reload(); }} />
          </DialogContent>
        </Dialog>
      </div>

      {plans.length === 0 ? (
        <Card className="p-12 text-center bg-card border rounded-2xl">
          <Target className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No target plans created yet</p>
          <p className="text-sm text-muted-foreground">Create your first revenue target plan to get started</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {plans.map(plan => (
            <Card key={plan.id} className="p-6 bg-card border rounded-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{plan.plan_name}</h2>
                  <p className="text-sm text-muted-foreground mt-1 capitalize">{plan.time_period}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(plan.start_date), 'MMM d, yyyy')} - {format(new Date(plan.end_date), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground mb-1">Country Target</p>
                  <p className="text-3xl font-bold text-primary">Rs {(plan.country_target / 100000).toFixed(1)}L</p>
                  <Badge className="mt-2">{plan.status}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
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
          <Label>Country Target (Rs) *</Label>
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
