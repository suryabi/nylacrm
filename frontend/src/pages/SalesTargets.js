import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Plus, Target, Edit, ChevronRight, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function SalesTargets() {
  const [plans, setPlans] = React.useState([]);
  const [view, setView] = React.useState('list'); // 'list', 'create', 'allocate', 'review'
  const [currentPlan, setCurrentPlan] = React.useState(null);
  const [step, setStep] = React.useState(1); // 1=territories, 2=cities, 3=resources, 4=review

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
            <Badge className={step === 1 ? 'bg-primary text-white' : 'bg-muted'}>1: Territories</Badge>
            <Badge className={step === 2 ? 'bg-primary text-white' : 'bg-muted'}>2: Cities</Badge>
            <Badge className={step === 3 ? 'bg-primary text-white' : 'bg-muted'}>3: Resources</Badge>
            <Badge className={step === 4 ? 'bg-primary text-white' : 'bg-muted'}>4: Review</Badge>
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
            <h2 className="text-xl font-semibold mb-6">Territory Allocation</h2>
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
            <ResourceAlloc planId={currentPlan.id} onDone={() => setStep(4)} />
          </Card>
        )}

        {step === 4 && (
          <Card className="p-8 border rounded-2xl">
            <h2 className="text-xl font-semibold mb-6">Review & Summary</h2>
            <ReviewScreen planId={currentPlan.id} onFinish={() => { setView('list'); loadPlans(); }} />
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

function ResourceAlloc({ planId, onDone }) {
  const [cities, setCities] = React.useState([]);
  const [salesTeam, setSalesTeam] = React.useState([]);
  const [selectedCity, setSelectedCity] = React.useState(null);

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const [hierarchyRes, usersRes] = await Promise.all([
        axios.get(`${API}/target-plans/${planId}/hierarchy`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const allCities = [];
      if (hierarchyRes.data.territories) {
        for (const terr of hierarchyRes.data.territories) {
          if (terr.states) {
            for (const state of terr.states) {
              if (state.cities) {
                for (const city of state.cities) {
                  allCities.push(city);
                }
              }
            }
          }
        }
      }
      
      setCities(allCities);
      if (allCities[0]) setSelectedCity(allCities[0]);
      
      const team = usersRes.data.filter(u => ['sales_rep', 'sales_manager'].includes(u.role));
      setSalesTeam(team);
    } catch (err) {
      console.error(err);
    }
  };

  if (!selectedCity || salesTeam.length === 0) {
    return <div className="text-center py-8">Loading cities and sales team...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {cities.map(c => (
          <Button
            key={c.id}
            variant={selectedCity.id === c.id ? 'default' : 'outline'}
            onClick={() => setSelectedCity(c)}
            size="sm"
            className="rounded-full"
          >
            {c.city}
          </Button>
        ))}
      </div>

      <ResourceAssignmentForm
        city={selectedCity}
        planId={planId}
        salesTeam={salesTeam}
        onSuccess={() => loadData()}
      />

      <div className="flex justify-end pt-6 border-t">
        <Button onClick={onDone} className="h-12 rounded-full px-8">
          Finish & View All Plans
        </Button>
      </div>
    </div>
  );
}

function ResourceAssignmentForm({ city, planId, salesTeam, onSuccess }) {
  const [assignments, setAssignments] = React.useState({});
  const [submitting, setSubmitting] = React.useState(false);

  // Filter sales team by city's territory
  const territoryTeam = salesTeam.filter(member => {
    // Get territory from city (need to pass it from parent)
    // For now, match based on member's territory containing the region
    return member.territory && (
      (city.city === 'New Delhi' || city.city === 'Noida') && member.territory.includes('North') ||
      (city.city === 'Bengaluru' || city.city === 'Chennai' || city.city === 'Hyderabad') && member.territory.includes('South') ||
      (city.city === 'Mumbai' || city.city === 'Pune' || city.city === 'Ahmedabad') && member.territory.includes('West') ||
      (city.city === 'Kolkata') && member.territory.includes('East') ||
      member.territory === 'All India'
    );
  });

  const updateAssignment = (resourceId, value) => {
    const newAssignments = {...assignments};
    newAssignments[resourceId] = value;
    setAssignments(newAssignments);
  };

  const total = Object.values(assignments).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const targetL = city.target_revenue / 100000;
  const valid = Math.abs(total - targetL) < 0.1 && total > 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      
      // Note: Resource target endpoint needs to be created
      const assignedCount = Object.keys(assignments).filter(k => parseFloat(assignments[k]) > 0).length;
      toast.success(`✓ ${assignedCount} resources assigned to ${city.city}! Total: Rs ${total.toFixed(1)}L`, {
        duration: 4000
      });
      
      onSuccess();
    } catch (err) {
      toast.error('Failed to assign resources');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 p-4 rounded-xl">
        <div className="flex justify-between">
          <div>
            <p className="font-semibold text-lg">{city.city}</p>
            <p className="text-sm text-muted-foreground">{city.state}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">Rs {targetL.toFixed(1)}L</p>
            <p className="text-xs text-muted-foreground">City Target</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground mb-3">
          Sales Resources in this territory ({territoryTeam.length} available):
        </p>
        {territoryTeam.length === 0 ? (
          <div className="text-center py-8 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-amber-800">No sales resources assigned to this territory yet.</p>
            <p className="text-xs text-muted-foreground mt-2">Add team members with this territory in Team Management.</p>
          </div>
        ) : (
          territoryTeam.map(resource => (
            <div key={resource.id} className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
              <div className="flex items-center gap-3 flex-1">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                  {resource.name[0]}
                </div>
                <div>
                  <p className="font-medium">{resource.name}</p>
                  <p className="text-xs text-muted-foreground">{resource.designation || resource.role} • {resource.territory}</p>
                </div>
              </div>
              <Input
                type="number"
                value={assignments[resource.id] || ''}
                onChange={e => updateAssignment(resource.id, e.target.value)}
                placeholder="Lakhs"
                className="w-40 h-11 text-right font-semibold"
              />
              <span className="text-sm text-muted-foreground w-12">Lakhs</span>
            </div>
          ))
        )}
      </div>

      {territoryTeam.length > 0 && (
        <>
          <div className={`p-5 rounded-xl border-2 ${valid ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-lg">Total Assigned:</span>
              <span className="text-3xl font-bold">Rs {total.toFixed(1)}L</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">City Target:</span>
              <span className="font-medium">Rs {targetL.toFixed(1)}L</span>
            </div>
            {!valid && total > 0 && (
              <p className="text-sm text-amber-800 mt-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Difference: Rs {Math.abs(total - targetL).toFixed(1)}L
              </p>
            )}
            {valid && (
              <p className="text-sm text-green-800 mt-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Perfect! Ready to assign
              </p>
            )}
          </div>

          <Button 
            onClick={submit} 
            disabled={!valid || submitting} 
            className="w-full h-14 rounded-full text-base font-semibold"
          >
            {submitting ? 'Assigning...' : `Assign Resources to ${city.city}`}
          </Button>
        </>
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
  const [loading, setLoading] = React.useState(true);
  const [editMode, setEditMode] = React.useState(false);
  const [hasExistingData, setHasExistingData] = React.useState(false);

  React.useEffect(() => {
    loadExistingAllocations();
  }, []);

  const loadExistingAllocations = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/target-plans/${planId}/hierarchy`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      let dataFound = false;
      if (res.data.territories && res.data.territories.length > 0) {
        for (const terr of res.data.territories) {
          const val = (terr.target_revenue / 100000).toString();
          if (terr.territory === 'North India') { setN(val); dataFound = true; }
          if (terr.territory === 'South India') { setS(val); dataFound = true; }
          if (terr.territory === 'West India') { setW(val); dataFound = true; }
          if (terr.territory === 'East India') { setE(val); dataFound = true; }
        }
        setHasExistingData(dataFound);
      } else {
        setEditMode(true); // Auto-enter edit mode if no data
      }
    } catch (err) {
      console.error('Failed to load existing allocations');
      setEditMode(true); // Auto-enter edit mode on error
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading allocations...</div>;
  }

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
      toast.success(`✓ Territory targets saved! ${data.length} territories with Rs ${total.toFixed(1)}L total.`, {
        duration: 4000
      });
      setEditMode(false);
      setHasExistingData(true);
      onNext();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to allocate territories.');
    }
  };

  // View Mode
  if (!editMode && hasExistingData) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 p-4 rounded-xl mb-4">
          <p className="text-sm text-green-800 font-medium">✓ Territories have been allocated</p>
        </div>

        <div className="space-y-3">
          {parseFloat(n) > 0 && <TerritoryViewRow label="North India" value={n} />}
          {parseFloat(s) > 0 && <TerritoryViewRow label="South India" value={s} />}
          {parseFloat(w) > 0 && <TerritoryViewRow label="West India" value={w} />}
          {parseFloat(e) > 0 && <TerritoryViewRow label="East India" value={e} />}
        </div>

        <div className="bg-primary/5 p-4 rounded-xl">
          <div className="flex justify-between">
            <span className="font-semibold">Total Allocated:</span>
            <span className="text-2xl font-bold text-primary">Rs {total.toFixed(1)}L</span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={() => setEditMode(true)} variant="outline" className="flex-1 h-12 rounded-full">
            <Edit className="h-4 w-4 mr-2" />
            Edit Allocation
          </Button>
          <Button onClick={onNext} className="flex-1 h-12 rounded-full">
            Continue to Cities
          </Button>
        </div>
      </div>
    );
  }

  // Edit Mode
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

function ResourceAssignmentForm({ city, planId, salesTeam, onSuccess }) {
  const [assignments, setAssignments] = React.useState({});
  const [submitting, setSubmitting] = React.useState(false);

  // Group sales team by territory
  const groupedTeam = {
    'North India': salesTeam.filter(m => m.territory?.includes('North')),
    'South India': salesTeam.filter(m => m.territory?.includes('South')),
    'West India': salesTeam.filter(m => m.territory?.includes('West')),
    'East India': salesTeam.filter(m => m.territory?.includes('East')),
    'All India': salesTeam.filter(m => m.territory === 'All India')
  };

  const updateAssignment = (resourceId, value) => {
    const newAssignments = {...assignments};
    newAssignments[resourceId] = value;
    setAssignments(newAssignments);
  };

  const total = Object.values(assignments).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const targetL = city.target_revenue / 100000;
  const valid = Math.abs(total - targetL) < 0.1 && total > 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      
      const payload = Object.keys(assignments)
        .filter(resourceId => parseFloat(assignments[resourceId]) > 0)
        .map(resourceId => ({
          resource_id: resourceId,
          target_revenue: parseFloat(assignments[resourceId]) * 100000
        }));

      await axios.post(
        `${API}/target-plans/${planId}/cities/${city.id}/resources`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`✓ ${payload.length} resources assigned to ${city.city}! Total: Rs ${total.toFixed(1)}L`, {
        duration: 4000
      });
      
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to assign resources');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 p-4 rounded-xl">
        <div className="flex justify-between">
          <div>
            <p className="font-semibold text-lg">{city.city}</p>
            <p className="text-sm text-muted-foreground">{city.state}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">Rs {targetL.toFixed(1)}L</p>
            <p className="text-xs text-muted-foreground">City Target</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">
          Assign target to sales resources (can assign to any resource, regardless of territory):
        </p>
        
        {Object.keys(groupedTeam).map(territory => {
          const members = groupedTeam[territory];
          if (members.length === 0) return null;
          
          return (
            <div key={territory} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{territory}</p>
              {members.map(resource => (
                <div key={resource.id} className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      {resource.name[0]}
                    </div>
                    <div>
                      <p className="font-medium">{resource.name}</p>
                      <p className="text-xs text-muted-foreground">{resource.designation || resource.role}</p>
                    </div>
                  </div>
                  <Input
                    type="number"
                    value={assignments[resource.id] || ''}
                    onChange={e => updateAssignment(resource.id, e.target.value)}
                    placeholder="Lakhs"
                    className="w-40 h-11 text-right font-semibold"
                  />
                  <span className="text-sm text-muted-foreground w-12">Lakhs</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className={`p-5 rounded-xl border-2 ${valid ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold text-lg">Total Assigned:</span>
          <span className="text-3xl font-bold">Rs {total.toFixed(1)}L</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">City Target:</span>
          <span className="font-medium">Rs {targetL.toFixed(1)}L</span>
        </div>
        {!valid && total > 0 && (
          <p className="text-sm text-amber-800 mt-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Difference: Rs {Math.abs(total - targetL).toFixed(1)}L
          </p>
        )}
        {valid && (
          <p className="text-sm text-green-800 mt-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Perfect! Ready to assign
          </p>
        )}
      </div>

      <Button 
        onClick={submit} 
        disabled={!valid || submitting} 
        className="w-full h-14 rounded-full text-base font-semibold"
      >
        {submitting ? 'Assigning...' : `Save ${city.city} Resource Assignments`}
      </Button>
    </div>
  );
}

function ReviewScreen({ planId, onFinish }) {
  const [summary, setSummary] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/target-plans/${planId}/resource-summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSummary(res.data);
    } catch (err) {
      console.error('Failed to load summary');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading summary...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 p-6 rounded-2xl">
        <div className="flex items-center gap-3 mb-2">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
          <h3 className="text-lg font-semibold text-green-800">Target Allocation Complete!</h3>
        </div>
        <p className="text-sm text-green-700">All targets have been assigned. Review the summary below.</p>
      </div>

      <div className="space-y-6">
        <h3 className="text-xl font-semibold">Resource-Wise Summary</h3>
        
        {summary?.resources && summary.resources.length > 0 ? (
          summary.resources.map((resource, idx) => (
            <Card key={idx} className="p-6 border rounded-2xl">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                    {resource.resource_name[0]}
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{resource.resource_name}</p>
                    <p className="text-sm text-muted-foreground">{resource.designation}</p>
                    <p className="text-xs text-primary">{resource.territory}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Target</p>
                  <p className="text-3xl font-bold text-primary">Rs {(resource.total_target / 100000).toFixed(1)}L</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-muted-foreground mb-3">City-wise Breakdown:</p>
                <div className="space-y-2">
                  {resource.city_breakdown.map((city, i) => (
                    <div key={i} className="flex justify-between items-center bg-secondary p-3 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{city.city}</p>
                        <p className="text-xs text-muted-foreground">{city.state}</p>
                      </div>
                      <p className="font-semibold">Rs {(city.target / 100000).toFixed(1)}L</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))
        ) : (
          <div className="text-center py-12 bg-muted rounded-xl">
            <p className="text-muted-foreground">No resource assignments yet</p>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-6 border-t">
        <Button onClick={onFinish} className="h-14 px-8 rounded-full text-base">
          Finish & Return to Plans
        </Button>
      </div>
    </div>
  );
}

function TerritoryViewRow({ label, value }) {
  return (
    <div className="flex items-center justify-between bg-secondary p-4 rounded-xl">
      <p className="font-medium">{label}</p>
      <p className="text-xl font-bold text-primary">Rs {parseFloat(value).toFixed(1)}L</p>
    </div>
  );
}

function CityAlloc({ planId, onNext }) {
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

  const allTerritoriesAllocated = territories.every(t => t.allocated_revenue > 0);
  const hasAnyCityAllocations = territories.some(t => t.allocated_revenue > 0);

  return (
    <div className="space-y-6">
      <div className="flex gap-3 flex-wrap">
        {territories.map(t => {
          const pct = t.target_revenue > 0 ? Math.round((t.allocated_revenue / t.target_revenue) * 100) : 0;
          return (
            <Button
              key={t.id}
              variant={selectedTerritory.id === t.id ? 'default' : 'outline'}
              onClick={() => setSelectedTerritory(t)}
              className="rounded-full relative"
            >
              {t.territory}
              {pct > 0 && <span className="ml-2 text-xs font-semibold">({pct}%)</span>}
            </Button>
          );
        })}
      </div>

      <CityAllocationForm
        territory={selectedTerritory}
        planId={planId}
        onSuccess={() => loadTerritories()}
      />

      <div className="flex justify-between pt-6 border-t">
        <div className="text-sm self-center">
          {hasAnyCityAllocations ? (
            <span className="text-green-600 font-medium">✓ You can now assign resources to allocated cities</span>
          ) : (
            <span className="text-muted-foreground">Allocate cities to enable resource assignment</span>
          )}
        </div>
        <Button 
          onClick={onNext} 
          disabled={!hasAnyCityAllocations}
          className="h-12 rounded-full px-6"
        >
          Assign Sales Resources →
        </Button>
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
  const [loading, setLoading] = React.useState(true);
  const [editMode, setEditMode] = React.useState(false);
  const [hasExistingData, setHasExistingData] = React.useState(false);

  React.useEffect(() => {
    loadExistingCityAllocations();
  }, [territory.id]);

  const loadExistingCityAllocations = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/target-plans/${planId}/hierarchy`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const thisTerr = res.data.territories?.find(t => t.id === territory.id);
      let dataFound = false;
      
      if (thisTerr && thisTerr.states) {
        const existingValues = {};
        for (const state of thisTerr.states) {
          if (state.cities) {
            for (const city of state.cities) {
              existingValues[city.city] = (city.target_revenue / 100000).toString();
              dataFound = true;
            }
          }
        }
        setValues(existingValues);
        setHasExistingData(dataFound);
      } else {
        setEditMode(true);
      }
    } catch (err) {
      console.error('Failed to load city allocations');
      setEditMode(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading city allocations...</div>;
  }

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
      
      toast.success(`✓ ${territory.territory} cities saved! ${payload.length} cities with Rs ${total.toFixed(1)}L total.`, {
        duration: 4000
      });
      
      setEditMode(false);
      setHasExistingData(true);
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to allocate cities. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // View Mode
  if (!editMode && hasExistingData) {
    return (
      <div className="space-y-4">
        <div className="bg-primary/5 p-4 rounded-xl">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-semibold text-lg">{territory.territory}</p>
              <p className="text-sm text-muted-foreground mt-1">Target: Rs {targetL.toFixed(1)}L</p>
            </div>
            <Badge className="bg-green-100 text-green-800">
              ✓ Cities Allocated
            </Badge>
          </div>
        </div>

        <div className="space-y-2">
          {cities.map(city => {
            const cityValue = parseFloat(values[city.c]) || 0;
            if (cityValue > 0) {
              return (
                <div key={city.c} className="flex justify-between items-center bg-secondary p-3 rounded-lg">
                  <div>
                    <p className="font-medium">{city.c}</p>
                    <p className="text-xs text-muted-foreground">{city.s}</p>
                  </div>
                  <p className="text-lg font-bold text-primary">Rs {cityValue.toFixed(1)}L</p>
                </div>
              );
            }
            return null;
          })}
        </div>

        <div className="bg-primary/5 p-4 rounded-xl">
          <div className="flex justify-between">
            <span className="font-semibold">Total Allocated:</span>
            <span className="text-2xl font-bold text-primary">Rs {total.toFixed(1)}L</span>
          </div>
        </div>

        <Button onClick={() => setEditMode(true)} variant="outline" className="w-full h-12 rounded-full">
          <Edit className="h-4 w-4 mr-2" />
          Edit City Allocation
        </Button>
      </div>
    );
  }

  // Edit Mode
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
