import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Plus, Target, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function SalesTargets() {
  const [plans, setPlans] = React.useState([]);
  const [view, setView] = React.useState('list'); // 'list', 'create', 'allocate'
  const [currentPlan, setCurrentPlan] = React.useState(null);
  const [step, setStep] = React.useState(1); // 1=territories, 2=cities, 3=resources

  React.useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/target-plans`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPlans(res.data);
    } catch (err) {
      toast.error('Failed to load plans');
    }
  };

  const startAllocation = (plan) => {
    setCurrentPlan(plan);
    setView('allocate');
    setStep(1);
  };

  if (view === 'create') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="outline" onClick={() => setView('list')} className="rounded-full">← Back</Button>
        <Card className="p-8 border rounded-2xl">
          <h1 className="text-2xl font-semibold mb-6">Create Target Plan</h1>
          <CreatePlanForm onDone={() => { setView('list'); loadPlans(); }} />
        </Card>
      </div>
    );
  }

  if (view === 'allocate') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setView('list')} className="rounded-full">← Back to Plans</Button>
          <div className="flex gap-2">
            <Badge className={step === 1 ? 'bg-primary' : 'bg-muted'}>Step 1: Territories</Badge>
            <Badge className={step === 2 ? 'bg-primary' : 'bg-muted'}>Step 2: Cities</Badge>
            <Badge className={step === 3 ? 'bg-primary' : 'bg-muted'}>Step 3: Resources</Badge>
          </div>
        </div>

        <Card className="p-8 bg-primary/5 border-primary/20 rounded-2xl">
          <h1 className="text-2xl font-semibold mb-2">{currentPlan.plan_name}</h1>
          <p className="text-muted-foreground capitalize">{currentPlan.time_period} • {currentPlan.start_date} to {currentPlan.end_date}</p>
          <p className="text-4xl font-bold text-primary mt-4">Rs {(currentPlan.country_target / 100000).toFixed(1)}L</p>
          <p className="text-sm text-muted-foreground">Country Target (India)</p>
        </Card>

        {step === 1 && (
          <Card className="p-8 border rounded-2xl">
            <h2 className="text-xl font-semibold mb-6">Allocate to Territories</h2>
            <TerritoryAlloc planId={currentPlan.id} target={currentPlan.country_target} onNext={() => setStep(2)} />
          </Card>
        )}

        {step === 2 && (
          <Card className="p-8 border rounded-2xl">
            <h2 className="text-xl font-semibold mb-6">Allocate Cities</h2>
            <CityAlloc planId={currentPlan.id} onNext={() => setStep(3)} />
          </Card>
        )}

        {step === 3 && (
          <Card className="p-8 border rounded-2xl">
            <h2 className="text-xl font-semibold mb-6">Assign Sales Resources</h2>
            <ResourceAlloc planId={currentPlan.id} onDone={() => { setView('list'); loadPlans(); }} />
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-4xl font-light mb-2">Sales Target Planning</h1>
          <p className="text-muted-foreground">Manage revenue targets across India</p>
        </div>
        <Button onClick={() => setView('create')} className="h-12 rounded-full">
          <Plus className="h-5 w-5 mr-2" />New Plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <Card className="p-16 text-center border rounded-2xl">
          <Target className="h-20 w-20 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground mb-6">No target plans yet</p>
          <Button onClick={() => setView('create')} className="h-12 rounded-full">Create Your First Plan</Button>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map(plan => (
            <PlanCard key={plan.id} plan={plan} onSelect={startAllocation} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, onSelect }) {
  const [hierarchy, setHierarchy] = React.useState(null);

  React.useEffect(() => {
    loadHierarchy();
  }, []);

  const loadHierarchy = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/target-plans/${plan.id}/hierarchy`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHierarchy(res.data);
    } catch (err) {
      console.error('Failed to load hierarchy');
    }
  };

  const territoryCount = hierarchy?.territories?.length || 0;
  const allocatedTerritories = hierarchy?.territories?.filter(t => t.allocated_revenue > 0).length || 0;

  return (
    <Card className="p-6 border rounded-2xl hover:shadow-lg transition-shadow">
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold">{plan.plan_name}</h3>
          {territoryCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {allocatedTerritories}/{territoryCount} allocated
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground capitalize">{plan.time_period}</p>
        <p className="text-xs text-muted-foreground">{plan.start_date} to {plan.end_date}</p>
      </div>
      <div className="mb-4">
        <p className="text-3xl font-bold text-primary">Rs {(plan.country_target / 100000).toFixed(1)}L</p>
        <p className="text-xs text-muted-foreground">Country Target</p>
      </div>
      {territoryCount > 0 && (
        <div className="mb-4 h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary"
            style={{ width: `${(allocatedTerritories / territoryCount) * 100}%` }}
          />
        </div>
      )}
      <Button onClick={() => onSelect(plan)} className="w-full rounded-full" variant="outline">
        {territoryCount === 0 ? 'Start Allocation' : 'Continue Allocation'} <ChevronRight className="h-4 w-4 ml-2" />
      </Button>
    </Card>
  );
}

function CreatePlanForm({ onDone }) {
  const [name, setName] = React.useState('');
  const [period, setPeriod] = React.useState('quarterly');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [target, setTarget] = React.useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/target-plans`, {
        plan_name: name,
        time_period: period,
        start_date: start,
        end_date: end,
        country_target: parseFloat(target) * 100000
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Plan created!');
      onDone();
    } catch (err) {
      toast.error('Failed');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <Label>Plan Name *</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Q1 2026 Revenue Target" required className="h-12" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Period *</Label>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="w-full h-12 px-4 rounded-xl border bg-background" required>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half_yearly">Half-Yearly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <Label>Country Target (Lakhs) *</Label>
          <Input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="500" required className="h-12" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Start Date *</Label>
          <Input type="date" value={start} onChange={e => setStart(e.target.value)} required className="h-12" />
        </div>
        <div>
          <Label>End Date *</Label>
          <Input type="date" value={end} onChange={e => setEnd(e.target.value)} required className="h-12" />
        </div>
      </div>
      <Button type="submit" className="w-full h-14 rounded-full text-base">Create Target Plan</Button>
    </form>
  );
}

function TerritoryAlloc({ planId, target, onNext }) {
  const [n, setN] = React.useState('');
  const [s, setS] = React.useState('');
  const [w, setW] = React.useState('');
  const [e, setE] = React.useState('');

  const total = (parseFloat(n) || 0) + (parseFloat(s) || 0) + (parseFloat(w) || 0) + (parseFloat(e) || 0);
  const targetL = target / 100000;
  const valid = Math.abs(total - targetL) < 0.1;

  const submit = async () => {
    try {
      const token = localStorage.getItem('token');
      const data = [];
      if (parseFloat(n) > 0) data.push({ territory: 'North India', target_revenue: parseFloat(n) * 100000 });
      if (parseFloat(s) > 0) data.push({ territory: 'South India', target_revenue: parseFloat(s) * 100000 });
      if (parseFloat(w) > 0) data.push({ territory: 'West India', target_revenue: parseFloat(w) * 100000 });
      if (parseFloat(e) > 0) data.push({ territory: 'East India', target_revenue: parseFloat(e) * 100000 });

      await axios.post(`${API}/target-plans/${planId}/territories`, data, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`✓ Territory targets allocated successfully! ${data.length} territories with Rs ${total.toFixed(1)}L total.`, {
        duration: 4000
      });
      onNext();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to allocate territories. Please check totals match country target.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-primary/5 p-5 rounded-xl">
        <p className="text-lg font-semibold">Total to Allocate: Rs {targetL.toFixed(1)}L</p>
      </div>

      <div className="space-y-4">
        <TerritoryRow label="North India" value={n} onChange={setN} />
        <TerritoryRow label="South India" value={s} onChange={setS} />
        <TerritoryRow label="West India" value={w} onChange={setW} />
        <TerritoryRow label="East India" value={e} onChange={setE} />
      </div>

      <div className={`p-5 rounded-xl border-2 ${valid && total > 0 ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
        <div className="flex justify-between items-center">
          <span className="font-semibold">Total Allocated:</span>
          <span className="text-2xl font-bold">Rs {total.toFixed(1)}L</span>
        </div>
        {!valid && total > 0 && (
          <p className="text-sm text-amber-800 mt-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Must equal Rs {targetL.toFixed(1)}L (Difference: Rs {Math.abs(total - targetL).toFixed(1)}L)
          </p>
        )}
        {valid && total > 0 && (
          <p className="text-sm text-green-800 mt-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Perfect! Totals match
          </p>
        )}
      </div>

      <Button onClick={submit} disabled={!valid || total === 0} className="w-full h-14 rounded-full text-base">
        Allocate Territories & Continue to Cities
      </Button>
    </div>
  );
}

function TerritoryRow({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
      <div className="flex-1">
        <p className="font-medium">{label}</p>
      </div>
      <div className="w-48">
        <Input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Enter in Lakhs"
          className="h-11 text-right font-semibold"
        />
      </div>
      <div className="w-16 text-right">
        <p className="text-sm text-muted-foreground">Lakhs</p>
      </div>
    </div>
  );
}

function CityAlloc({ planId, onDone }) {
  const [territories, setTerritories] = React.useState([]);
  const [selectedTerritory, setSelectedTerritory] = React.useState(null);

  React.useEffect(() => {
    loadTerritories();
  }, []);

  const loadTerritories = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/target-plans/${planId}/hierarchy`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTerritories(res.data.territories || []);
      if (res.data.territories && res.data.territories[0]) {
        setSelectedTerritory(res.data.territories[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!selectedTerritory) {
    return <div className="text-center py-8">Loading territories...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        {territories.map(t => (
          <Button
            key={t.id}
            variant={selectedTerritory.id === t.id ? 'default' : 'outline'}
            onClick={() => setSelectedTerritory(t)}
            className="rounded-full"
          >
            {t.territory}
          </Button>
        ))}
      </div>

      <CityAllocationForm
        territory={selectedTerritory}
        planId={planId}
        onSuccess={() => loadTerritories()}
      />

      <div className="flex justify-between pt-6 border-t">
        <Button variant="outline" onClick={onDone} className="h-12 rounded-full">Finish & View Plans</Button>
        <p className="text-sm text-muted-foreground self-center">Allocate all territories, then finish</p>
      </div>
    </div>
  );
}

function CityAllocationForm({ territory, planId, onSuccess }) {
  const cities = {
    'North India': [{s: 'Delhi', c: 'New Delhi'}, {s: 'Uttar Pradesh', c: 'Noida'}],
    'South India': [{s: 'Karnataka', c: 'Bengaluru'}, {s: 'Tamil Nadu', c: 'Chennai'}, {s: 'Telangana', c: 'Hyderabad'}],
    'West India': [{s: 'Maharashtra', c: 'Mumbai'}, {s: 'Maharashtra', c: 'Pune'}, {s: 'Gujarat', c: 'Ahmedabad'}],
    'East India': [{s: 'West Bengal', c: 'Kolkata'}]
  }[territory.territory] || [];

  const [values, setValues] = React.useState({});
  const [submitting, setSubmitting] = React.useState(false);

  const updateValue = (cityName, value) => {
    const newValues = {...values};
    newValues[cityName] = value;
    setValues(newValues);
  };

  const total = cities.reduce((sum, city) => {
    const val = parseFloat(values[city.c]) || 0;
    return sum + val;
  }, 0);
  
  const targetL = territory.target_revenue / 100000;
  const valid = Math.abs(total - targetL) < 0.1 && total > 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const payload = [];
      
      for (const city of cities) {
        const val = parseFloat(values[city.c]);
        if (val > 0) {
          payload.push({
            state: city.s,
            city: city.c,
            target_revenue: val * 100000
          });
        }
      }

      await axios.post(
        `${API}/target-plans/${planId}/territories/${encodeURIComponent(territory.territory)}/cities`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`✓ ${territory.territory} cities allocated successfully! ${payload.length} cities with Rs ${total.toFixed(1)}L total.`, {
        duration: 4000
      });
      
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to allocate cities. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 p-4 rounded-xl">
        <div className="flex justify-between items-center">
          <div>
            <p className="font-semibold">{territory.territory} Target: Rs {targetL.toFixed(1)}L</p>
            <p className="text-sm text-muted-foreground mt-1">Already Allocated: Rs {(territory.allocated_revenue / 100000).toFixed(1)}L</p>
          </div>
          {territory.allocated_revenue > 0 && (
            <Badge className="bg-green-100 text-green-800">
              {((territory.allocated_revenue / territory.target_revenue) * 100).toFixed(0)}% Done
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {cities.map(city => (
          <div key={city.c} className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
            <div className="flex-1">
              <p className="font-medium">{city.c}</p>
              <p className="text-xs text-muted-foreground">{city.s}</p>
            </div>
            <div className="w-48">
              <Input
                type="number"
                value={values[city.c] || ''}
                onChange={e => updateValue(city.c, e.target.value)}
                placeholder="Enter in Lakhs"
                className="h-11 text-right font-semibold text-lg"
              />
            </div>
            <div className="w-16 text-right">
              <p className="text-sm text-muted-foreground">Lakhs</p>
            </div>
          </div>
        ))}
      </div>

      <div className={`p-5 rounded-xl border-2 ${valid ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold text-lg">Total Allocated:</span>
          <span className="text-3xl font-bold">Rs {total.toFixed(1)}L</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Territory Target:</span>
          <span className="font-medium">Rs {targetL.toFixed(1)}L</span>
        </div>
        {!valid && total > 0 && (
          <p className="text-sm text-amber-800 mt-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Difference: Rs {Math.abs(total - targetL).toFixed(1)}L - Must equal territory target
          </p>
        )}
        {valid && (
          <p className="text-sm text-green-800 mt-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Perfect! Ready to allocate
          </p>
        )}
      </div>

      <Button 
        onClick={submit} 
        disabled={!valid || submitting} 
        className="w-full h-14 rounded-full text-base font-semibold"
      >
        {submitting ? 'Allocating...' : `Allocate ${territory.territory} Cities (${cities.length} cities)`}
      </Button>
    </div>
  );
}
