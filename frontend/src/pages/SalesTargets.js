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
import { Plus, ChevronRight, ChevronDown, Target, Edit, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const TIME_PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-Yearly' },
  { value: 'yearly', label: 'Yearly' }
];

const TERRITORIES = ['North India', 'South India', 'West India', 'East India'];

const TERRITORY_CITIES = {
  'North India': [
    { state: 'Delhi', city: 'New Delhi' },
    { state: 'Uttar Pradesh', city: 'Noida' }
  ],
  'South India': [
    { state: 'Karnataka', city: 'Bengaluru' },
    { state: 'Tamil Nadu', city: 'Chennai' },
    { state: 'Telangana', city: 'Hyderabad' }
  ],
  'West India': [
    { state: 'Maharashtra', city: 'Mumbai' },
    { state: 'Maharashtra', city: 'Pune' },
    { state: 'Gujarat', city: 'Ahmedabad' }
  ],
  'East India': [
    { state: 'West Bengal', city: 'Kolkata' }
  ]
};

export default function SalesTargets() {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [hierarchy, setHierarchy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  React.useEffect(() => {
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
      toast.error('Failed to load plans');
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
      console.error('Failed to load hierarchy');
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

      {plans.length === 0 ? (
        <Card className="p-12 text-center bg-card border rounded-2xl">
          <Target className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No target plans created yet</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card className="p-6 bg-card border rounded-2xl">
            <h2 className="text-lg font-semibold mb-4">Plans</h2>
            <div className="space-y-2">
              {plans.map(plan => (
                <div
                  key={plan.id}
                  onClick={() => selectPlan(plan)}
                  className={`p-4 rounded-xl cursor-pointer transition-all ${
                    selectedPlan?.id === plan.id ? 'bg-primary text-white' : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  <p className="font-semibold text-sm">{plan.plan_name}</p>
                  <p className="text-xs opacity-80 mt-1 capitalize">{plan.time_period}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="lg:col-span-3 space-y-6">
            {selectedPlan && (
              <>
                <Card className="p-8 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-2xl">
                  <div className="flex justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-semibold">{selectedPlan.plan_name}</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(new Date(selectedPlan.start_date), 'MMM d, yyyy')} - {format(new Date(selectedPlan.end_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground mb-1">Country Target</p>
                      <p className="text-3xl font-bold text-primary">Rs{(selectedPlan.country_target / 100000).toFixed(1)}L</p>
                    </div>
                  </div>
                </Card>

                <TerritorySection planId={selectedPlan.id} countryTarget={selectedPlan.country_target} hierarchy={hierarchy} onUpdate={() => fetchHierarchy(selectedPlan.id)} />
              </>
            )}
          </div>
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
          <Label>Country Target (Rs Lakhs) *</Label>
          <Input
            type="number"
            value={formData.country_target}
            onChange={(e) => setFormData(p => ({...p, country_target: e.target.value}))}
            placeholder="500"
            required
          />
          <p className="text-xs text-muted-foreground">Enter in Lakhs (e.g., 500 for Rs 500L)</p>
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

function TerritorySection({ planId, countryTarget, hierarchy, onUpdate }) {
  const [allocDialogOpen, setAllocDialogOpen] = useState(false);
  const [cityDialogOpen, setCityDialogOpen] = useState(false);
  const [selectedTerritory, setSelectedTerritory] = useState(null);

  const territories = hierarchy?.territories || [];
  const totalAllocated = territories.reduce((sum, t) => sum + t.target_revenue, 0);
  const allocationPercent = (totalAllocated / countryTarget) * 100;

  return (
    <Card className="p-6 bg-card border rounded-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Territory Allocation</h2>
        <Dialog open={allocDialogOpen} onOpenChange={setAllocDialogOpen}>
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
            <TerritoryAllocationForm 
              planId={planId} 
              countryTarget={countryTarget}
              onSuccess={() => { setAllocDialogOpen(false); onUpdate(); }} 
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6 bg-primary/5 border border-primary/20 rounded-xl p-4">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Total Allocated:</span>
          <span className="text-lg font-bold">Rs{(totalAllocated / 100000).toFixed(1)}L / Rs{(countryTarget / 100000).toFixed(1)}L</span>
        </div>
        <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all ${allocationPercent > 100 ? 'bg-red-500' : allocationPercent === 100 ? 'bg-green-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(allocationPercent, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {allocationPercent > 100 ? 'Over-allocated' : allocationPercent === 100 ? 'Fully allocated' : 'Under-allocated'}
        </p>
      </div>

      {territories.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
          <Target className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No territory targets allocated yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {territories.map(territory => (
            <TerritoryCard
              key={territory.id}
              territory={territory}
              planId={planId}
              onAllocateCities={(terr) => { setSelectedTerritory(terr); setCityDialogOpen(true); }}
            />
          ))}
        </div>
      )}

      <Dialog open={cityDialogOpen} onOpenChange={setCityDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Allocate Cities - {selectedTerritory?.territory}</DialogTitle>
          </DialogHeader>
          {selectedTerritory && (
            <CityAllocationForm
              planId={planId}
              territory={selectedTerritory}
              onSuccess={() => { setCityDialogOpen(false); onUpdate(); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TerritoryAllocationForm({ planId, countryTarget, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [targets, setTargets] = useState(
    TERRITORIES.map(t => ({ territory: t, target_revenue: '' }))
  );

  const total = targets.reduce((sum, t) => sum + (parseFloat(t.target_revenue) || 0), 0);
  const isValid = Math.abs(total - countryTarget) < 0.01;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = targets
        .map(t => ({ territory: t.territory, target_revenue: parseFloat(t.target_revenue) || 0 }))
        .filter(t => t.target_revenue > 0);

      await axios.post(
        `${API_URL}/target-plans/${planId}/territories`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Territory targets allocated!');
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Allocation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4">
        <p className="text-sm font-semibold">Country Target: Rs{(countryTarget / 100000).toFixed(1)}L</p>
      </div>

      {targets.map((target, index) => (
        <div key={target.territory} className="grid grid-cols-3 gap-4 items-center">
          <div className="col-span-1">
            <Label className="text-sm font-medium">{target.territory}</Label>
          </div>
          <div className="col-span-2">
            <Input
              type="number"
              value={target.target_revenue}
              onChange={(e) => {
                const newTargets = [...targets];
                newTargets[index].target_revenue = e.target.value;
                setTargets(newTargets);
              }}
              placeholder="Enter in Lakhs (e.g., 125)"
            />
          </div>
        </div>
      ))}

      <div className={`border rounded-xl p-4 ${isValid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex justify-between items-center">
          <span className="font-semibold text-sm">Total Allocated:</span>
          <span className="font-bold text-lg">Rs{(total / 100000).toFixed(1)}L</span>
        </div>
        {!isValid && (
          <p className="text-xs text-amber-800 mt-2 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Must equal country target (Rs{(countryTarget / 100000).toFixed(1)}L)
          </p>
        )}
        {isValid && total > 0 && (
          <p className="text-xs text-green-800 mt-2 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Perfect! Total matches country target
          </p>
        )}
      </div>

      <Button type="submit" className="w-full h-12 rounded-full" disabled={loading || !isValid}>
        {loading ? 'Allocating...' : 'Allocate Territory Targets'}
      </Button>
    </form>
  );
}

function TerritoryCard({ territory, planId, onAllocateCities }) {
  const [expanded, setExpanded] = useState(false);
  const allocationPercent = (territory.allocated_revenue / territory.target_revenue) * 100;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="p-4 bg-secondary flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1" onClick={() => setExpanded(!expanded)}>
          <button className="hover:bg-background/50 rounded p-1">
            {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
          <div className="flex-1">
            <p className="font-semibold">{territory.territory}</p>
            <p className="text-xs text-muted-foreground">Target: Rs{(territory.target_revenue / 100000).toFixed(1)}L</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Allocated</p>
            <p className="font-semibold text-sm">Rs{(territory.allocated_revenue / 100000).toFixed(1)}L</p>
            <div className="w-24 h-1 bg-muted rounded-full mt-1 overflow-hidden">
              <div 
                className={`h-full ${allocationPercent >= 100 ? 'bg-green-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(allocationPercent, 100)}%` }}
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAllocateCities(territory)}
            className="rounded-full"
          >
            <Edit className="h-3 w-3 mr-1" />
            Allocate Cities
          </Button>
        </div>
      </div>

      {expanded && territory.states && territory.states.length > 0 && (
        <div className="p-4 bg-background space-y-3">
          {territory.states.map(state => (
            <div key={state.state_name} className="border border-border rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <p className="font-medium">{state.state_name}</p>
                <p className="text-sm font-semibold text-primary">Rs{(state.state_target / 100000).toFixed(1)}L</p>
              </div>
              {state.cities && state.cities.length > 0 && (
                <div className="space-y-2">
                  {state.cities.map(city => (
                    <div key={city.id} className="flex justify-between items-center text-sm bg-muted p-2 rounded">
                      <span>{city.city}</span>
                      <span className="font-medium">Rs{(city.target_revenue / 100000).toFixed(1)}L</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CityAllocationForm({ planId, territory, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const cities = TERRITORY_CITIES[territory.territory] || [];
  const [targets, setTargets] = useState(
    cities.map(c => ({ state: c.state, city: c.city, target_revenue: '' }))
  );

  const total = targets.reduce((sum, t) => sum + (parseFloat(t.target_revenue) || 0), 0);
  const isValid = Math.abs(total - territory.target_revenue) < 0.01;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = targets
        .map(t => ({ state: t.state, city: t.city, target_revenue: parseFloat(t.target_revenue) || 0 }))
        .filter(t => t.target_revenue > 0);

      await axios.post(
        `${API_URL}/target-plans/${planId}/territories/${territory.territory}/cities`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('City targets allocated!');
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Allocation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <p className="text-sm font-semibold">{territory.territory} Target: Rs{(territory.target_revenue / 100000).toFixed(1)}L</p>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {targets.map((target, index) => (
          <div key={`${target.state}-${target.city}`} className="grid grid-cols-4 gap-3 items-center bg-secondary p-3 rounded-lg">
            <div className="col-span-2">
              <p className="font-medium text-sm">{target.city}</p>
              <p className="text-xs text-muted-foreground">{target.state}</p>
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                value={target.target_revenue}
                onChange={(e) => {
                  const newTargets = [...targets];
                  newTargets[index].target_revenue = e.target.value;
                  setTargets(newTargets);
                }}
                placeholder="Lakhs"
                className="h-10"
              />
            </div>
          </div>
        ))}
      </div>

      <div className={`border rounded-xl p-4 ${isValid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex justify-between">
          <span className="font-semibold text-sm">Total:</span>
          <span className="font-bold">Rs{(total / 100000).toFixed(1)}L</span>
        </div>
        {!isValid && (
          <p className="text-xs text-amber-800 mt-2">
            <AlertCircle className="h-3 w-3 inline mr-1" />
            Must equal territory target
          </p>
        )}
      </div>

      <Button type="submit" className="w-full h-12 rounded-full" disabled={loading || !isValid}>
        {loading ? 'Allocating...' : 'Allocate City Targets'}
      </Button>
    </form>
  );
}
