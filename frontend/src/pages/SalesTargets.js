import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Plus, Target, Edit } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function SalesTargets() {
  const [plans, setPlans] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [selectedPlan, setSelectedPlan] = React.useState(null);
  const [showTerritoryForm, setShowTerritoryForm] = React.useState(false);

  React.useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/target-plans`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPlans(res.data);
      setLoading(false);
    } catch (error) {
      toast.error('Failed to load plans');
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-4xl font-light mb-2">Sales Target Planning</h1>
          <p className="text-muted-foreground">Create and manage revenue targets</p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)} className="h-12 rounded-full">
          <Plus className="h-5 w-5 mr-2" />
          {showCreateForm ? 'Cancel' : 'Create Plan'}
        </Button>
      </div>

      {showCreateForm && (
        <Card className="p-6 border rounded-2xl">
          <h2 className="text-lg font-semibold mb-4">Create New Target Plan</h2>
          <CreatePlanForm onSuccess={() => { setShowCreateForm(false); loadPlans(); }} />
        </Card>
      )}

      {plans.length === 0 ? (
        <Card className="p-12 text-center border rounded-2xl">
          <Target className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No target plans yet. Create your first plan above.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {plans.map(plan => (
            <Card key={plan.id} className="p-6 border rounded-2xl">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold">{plan.plan_name}</h2>
                  <p className="text-sm text-muted-foreground capitalize">{plan.time_period}</p>
                  <p className="text-sm text-muted-foreground">{plan.start_date} to {plan.end_date}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Country Target</p>
                  <p className="text-3xl font-bold text-primary">Rs {(plan.country_target / 100000).toFixed(1)}L</p>
                  <Badge className="mt-2">{plan.status}</Badge>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedPlan(plan);
                    setShowTerritoryForm(true);
                  }}
                  className="rounded-full"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Allocate Territories
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showTerritoryForm && selectedPlan && (
        <Card className="p-6 border-2 border-primary/20 rounded-2xl">
          <h2 className="text-lg font-semibold mb-4">Allocate {selectedPlan.plan_name} to Territories</h2>
          <TerritoryAllocationForm
            planId={selectedPlan.id}
            countryTarget={selectedPlan.country_target}
            onSuccess={() => { setShowTerritoryForm(false); loadPlans(); }}
            onCancel={() => setShowTerritoryForm(false)}
          />
        </Card>
      )}
    </div>
  );
}

function CreatePlanForm({ onSuccess }) {
  const [name, setName] = React.useState('');
  const [period, setPeriod] = React.useState('quarterly');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [target, setTarget] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/target-plans`, {
        plan_name: name,
        time_period: period,
        start_date: startDate,
        end_date: endDate,
        country_target: parseFloat(target) * 100000
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Plan created!');
      onSuccess();
    } catch (error) {
      toast.error('Failed to create plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Plan Name *</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Q1 2026 Target" required />
        </div>
        <div>
          <Label>Period *</Label>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="w-full h-10 px-3 rounded-md border">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half_yearly">Half-Yearly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Start Date *</Label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
        </div>
        <div>
          <Label>End Date *</Label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
        </div>
        <div>
          <Label>Target (Lakhs) *</Label>
          <Input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="500" required />
        </div>
      </div>
      <Button type="submit" disabled={loading} className="w-full h-12 rounded-full">
        {loading ? 'Creating...' : 'Create Plan'}
      </Button>
    </form>
  );
}

function TerritoryAllocationForm({ planId, countryTarget, onSuccess, onCancel }) {
  const [north, setNorth] = React.useState('');
  const [south, setSouth] = React.useState('');
  const [west, setWest] = React.useState('');
  const [east, setEast] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const total = (parseFloat(north) || 0) + (parseFloat(south) || 0) + (parseFloat(west) || 0) + (parseFloat(east) || 0);
  const targetLakhs = countryTarget / 100000;
  const isValid = Math.abs(total - targetLakhs) < 0.01;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = [];
      
      if (parseFloat(north) > 0) payload.push({ territory: 'North India', target_revenue: parseFloat(north) * 100000 });
      if (parseFloat(south) > 0) payload.push({ territory: 'South India', target_revenue: parseFloat(south) * 100000 });
      if (parseFloat(west) > 0) payload.push({ territory: 'West India', target_revenue: parseFloat(west) * 100000 });
      if (parseFloat(east) > 0) payload.push({ territory: 'East India', target_revenue: parseFloat(east) * 100000 });

      console.log('Submitting payload:', payload);
      
      const response = await axios.post(`${API_URL}/target-plans/${planId}/territories`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Response:', response.data);
      toast.success('Territories allocated successfully!');
      onSuccess();
    } catch (error) {
      console.error('Allocation error:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to allocate';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-primary/5 p-4 rounded-xl mb-4">
        <p className="font-semibold">Country Target: Rs {targetLakhs.toFixed(1)}L</p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <Label className="self-center">North India</Label>
          <Input type="number" value={north} onChange={e => setNorth(e.target.value)} placeholder="Lakhs" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Label className="self-center">South India</Label>
          <Input type="number" value={south} onChange={e => setSouth(e.target.value)} placeholder="Lakhs" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Label className="self-center">West India</Label>
          <Input type="number" value={west} onChange={e => setWest(e.target.value)} placeholder="Lakhs" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Label className="self-center">East India</Label>
          <Input type="number" value={east} onChange={e => setEast(e.target.value)} placeholder="Lakhs" />
        </div>
      </div>

      <div className={`p-4 rounded-xl ${isValid && total > 0 ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
        <div className="flex justify-between">
          <span className="font-semibold">Total Allocated:</span>
          <span className="font-bold">Rs {total.toFixed(1)}L</span>
        </div>
        {!isValid && total > 0 && (
          <p className="text-xs text-amber-800 mt-2">Must equal Rs {targetLakhs.toFixed(1)}L</p>
        )}
        {isValid && total > 0 && (
          <p className="text-xs text-green-800 mt-2">✓ Perfect! Matches country target</p>
        )}
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-12 rounded-full">
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid || loading} className="flex-1 h-12 rounded-full">
          {loading ? 'Allocating...' : 'Allocate Territories'}
        </Button>
      </div>
    </form>
  );
}
