import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Plus, Target } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function SalesTargets() {
  const [mode, setMode] = React.useState('list');
  const [plans, setPlans] = React.useState([]);
  const [currentPlanId, setCurrentPlanId] = React.useState(null);

  React.useEffect(() => {
    if (mode === 'list') {
      fetchPlans();
    }
  }, [mode]);

  const fetchPlans = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/target-plans`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPlans(response.data);
    } catch (error) {
      toast.error('Failed to load plans');
    }
  };

  const openPlan = (planId) => {
    setCurrentPlanId(planId);
    setMode('manage');
  };

  if (mode === 'create') {
    return <CreatePlanView onBack={() => setMode('list')} />;
  }

  if (mode === 'manage' && currentPlanId) {
    return <ManagePlanView planId={currentPlanId} onBack={() => setMode('list')} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-4xl font-light mb-2">Sales Target Planning</h1>
          <p className="text-muted-foreground">Manage revenue targets</p>
        </div>
        <Button onClick={() => setMode('create')} className="h-12 rounded-full">
          <Plus className="h-5 w-5 mr-2" />Create Plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <Card className="p-16 text-center border rounded-2xl">
          <Target className="h-20 w-20 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No target plans yet</p>
          <Button onClick={() => setMode('create')} className="rounded-full">Create Your First Plan</Button>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map(plan => (
            <Card key={plan.id} className="p-6 border rounded-2xl hover:shadow-lg transition">
              <h3 className="text-lg font-semibold mb-2">{plan.plan_name}</h3>
              <p className="text-sm text-muted-foreground capitalize mb-4">{plan.time_period}</p>
              <p className="text-3xl font-bold text-primary mb-4">Rs {(plan.country_target / 100000).toFixed(1)}L</p>
              <Button onClick={() => openPlan(plan.id)} className="w-full rounded-full" variant="outline">
                Manage Allocation
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreatePlanView({ onBack }) {
  const [name, setName] = React.useState('');
  const [period, setPeriod] = React.useState('quarterly');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [target, setTarget] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/target-plans`, {
        plan_name: name,
        time_period: period,
        start_date: start,
        end_date: end,
        country_target: parseFloat(target) * 100000
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Plan created successfully!');
      onBack();
    } catch (error) {
      toast.error('Failed to create plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full">← Back</Button>
      <Card className="p-8 border rounded-2xl">
        <h1 className="text-2xl font-semibold mb-6">Create Target Plan</h1>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>Plan Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Q1 2026 Target" required className="h-12" />
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
              <Label>Target (Lakhs) *</Label>
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
          <Button type="submit" disabled={loading} className="w-full h-14 rounded-full text-base">
            {loading ? 'Creating...' : 'Create Plan'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function ManagePlanView({ planId, onBack }) {
  const [plan, setPlan] = React.useState(null);
  const [hierarchy, setHierarchy] = React.useState(null);
  const [activeSection, setActiveSection] = React.useState('territories');

  React.useEffect(() => {
    loadPlanData();
  }, []);

  const loadPlanData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const plansRes = await axios.get(`${API}/target-plans`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const foundPlan = plansRes.data.find(p => p.id === planId);
      setPlan(foundPlan);

      const hierarchyRes = await axios.get(`${API}/target-plans/${planId}/hierarchy`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHierarchy(hierarchyRes.data);
    } catch (error) {
      console.error('Failed to load plan');
    }
  };

  if (!plan) {
    return <div className="flex justify-center py-12">Loading plan...</div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full">← Back to Plans</Button>

      <Card className="p-8 bg-primary/5 border-primary/20 rounded-2xl">
        <h1 className="text-2xl font-semibold mb-2">{plan.plan_name}</h1>
        <p className="text-sm text-muted-foreground capitalize mb-4">{plan.time_period} • {plan.start_date} to {plan.end_date}</p>
        <p className="text-4xl font-bold text-primary">Rs {(plan.country_target / 100000).toFixed(1)}L</p>
        <p className="text-sm text-muted-foreground">Country Target (India)</p>
      </Card>

      <Card className="p-6 border rounded-2xl">
        <div className="flex gap-3 mb-6">
          <Button
            variant={activeSection === 'territories' ? 'default' : 'outline'}
            onClick={() => setActiveSection('territories')}
            className="rounded-full"
          >
            Territories
          </Button>
          <Button
            variant={activeSection === 'cities' ? 'default' : 'outline'}
            onClick={() => setActiveSection('cities')}
            className="rounded-full"
          >
            Cities
          </Button>
          <Button
            variant={activeSection === 'resources' ? 'default' : 'outline'}
            onClick={() => setActiveSection('resources')}
            className="rounded-full"
          >
            Resources
          </Button>
          <Button
            variant={activeSection === 'summary' ? 'default' : 'outline'}
            onClick={() => setActiveSection('summary')}
            className="rounded-full"
          >
            Summary
          </Button>
        </div>

        {activeSection === 'territories' && (
          <TerritorySection planId={planId} countryTarget={plan.country_target} hierarchy={hierarchy} onUpdate={loadPlanData} />
        )}

        {activeSection === 'cities' && hierarchy && (
          <CitySection planId={planId} territories={hierarchy.territories || []} onUpdate={loadPlanData} />
        )}

        {activeSection === 'resources' && hierarchy && (
          <ResourceSection planId={planId} hierarchy={hierarchy} onUpdate={loadPlanData} />
        )}

        {activeSection === 'summary' && (
          <SummarySection planId={planId} />
        )}
      </Card>
    </div>
  );
}

function TerritorySection({ planId, countryTarget, hierarchy, onUpdate }) {
  const [editing, setEditing] = React.useState(false);
  const [north, setNorth] = React.useState('');
  const [south, setSouth] = React.useState('');
  const [west, setWest] = React.useState('');
  const [east, setEast] = React.useState('');

  const territories = hierarchy?.territories || [];
  const hasData = territories.length > 0;

  React.useEffect(() => {
    if (hasData) {
      territories.forEach(t => {
        const pct = t.allocation_percentage?.toString() || '';
        if (t.territory === 'North India') setNorth(pct);
        if (t.territory === 'South India') setSouth(pct);
        if (t.territory === 'West India') setWest(pct);
        if (t.territory === 'East India') setEast(pct);
      });
    } else {
      setEditing(true);
    }
  }, [hasData]);

  const total = (parseFloat(north) || 0) + (parseFloat(south) || 0) + (parseFloat(west) || 0) + (parseFloat(east) || 0);
  const targetL = countryTarget / 100000;
  const valid = Math.abs(total - 100) < 0.1; // Must equal 100%

  const save = async () => {
    try {
      const token = localStorage.getItem('token');
      const payload = [];
      if (parseFloat(north) > 0) payload.push({ territory: 'North India', allocation_percentage: parseFloat(north) });
      if (parseFloat(south) > 0) payload.push({ territory: 'South India', allocation_percentage: parseFloat(south) });
      if (parseFloat(west) > 0) payload.push({ territory: 'West India', allocation_percentage: parseFloat(west) });
      if (parseFloat(east) > 0) payload.push({ territory: 'East India', allocation_percentage: parseFloat(east) });

      await axios.post(`${API}/target-plans/${planId}/territories`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Territories saved!');
      setEditing(false);
      onUpdate();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed');
    }
  };

  if (!editing && hasData) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 p-4 rounded-xl mb-4">
          <p className="text-sm text-green-800 font-medium">✓ Territories allocated</p>
        </div>
        {parseFloat(north) > 0 && <Row label="North India" value={`${north}% (Rs ${((parseFloat(north) / 100) * targetL).toFixed(1)}L)`} />}
        {parseFloat(south) > 0 && <Row label="South India" value={`${south}% (Rs ${((parseFloat(south) / 100) * targetL).toFixed(1)}L)`} />}
        {parseFloat(west) > 0 && <Row label="West India" value={`${west}% (Rs ${((parseFloat(west) / 100) * targetL).toFixed(1)}L)`} />}
        {parseFloat(east) > 0 && <Row label="East India" value={`${east}% (Rs ${((parseFloat(east) / 100) * targetL).toFixed(1)}L)`} />}
        <Button onClick={() => setEditing(true)} variant="outline" className="w-full rounded-full">Edit</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 p-4 rounded-xl">
        <p className="font-semibold">Country Target: Rs {targetL.toFixed(1)}L</p>
        <p className="text-sm text-muted-foreground">Allocate using percentages (must total 100%)</p>
      </div>
      
      <InputRow label="North India" value={north} onChange={setNorth} suffix="%" />
      <InputRow label="South India" value={south} onChange={setSouth} suffix="%" />
      <InputRow label="West India" value={west} onChange={setWest} suffix="%" />
      <InputRow label="East India" value={east} onChange={setEast} suffix="%" />

      <div className={`p-4 rounded-xl ${valid && total > 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
        <div className="flex justify-between mb-2">
          <span className="font-bold">Total:</span>
          <span className="text-2xl font-bold">{total.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Equals:</span>
          <span className="font-semibold">Rs {((total / 100) * targetL).toFixed(1)}L</span>
        </div>
        {!valid && total > 0 && <p className="text-xs text-amber-800 mt-2">Must equal 100%</p>}
        {valid && <p className="text-xs text-green-800 mt-2">✓ Perfect!</p>}
      </div>
      
      <Button onClick={save} disabled={!valid} className="w-full h-12 rounded-full">Save Territories</Button>
    </div>
  );
}

function CitySection({ planId, territories, onUpdate }) {
  const [selectedTerr, setSelectedTerr] = React.useState(null);

  React.useEffect(() => {
    if (territories.length > 0 && !selectedTerr) {
      setSelectedTerr(territories[0]);
    }
  }, [territories]);

  if (!selectedTerr) {
    return <div className="text-center py-8">Select a territory first</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {territories.map(t => (
          <Button
            key={t.id}
            variant={selectedTerr.id === t.id ? 'default' : 'outline'}
            onClick={() => setSelectedTerr(t)}
            size="sm"
            className="rounded-full"
          >
            {t.territory}
          </Button>
        ))}
      </div>
      
      <CityAllocation territory={selectedTerr} planId={planId} onUpdate={onUpdate} />
    </div>
  );
}

function CityAllocation({ territory, planId, onUpdate }) {
  const CITY_MAP = {
    'North India': [{s: 'Delhi', c: 'New Delhi'}, {s: 'Uttar Pradesh', c: 'Noida'}],
    'South India': [{s: 'Karnataka', c: 'Bengaluru'}, {s: 'Tamil Nadu', c: 'Chennai'}, {s: 'Telangana', c: 'Hyderabad'}],
    'West India': [{s: 'Maharashtra', c: 'Mumbai'}, {s: 'Maharashtra', c: 'Pune'}, {s: 'Gujarat', c: 'Ahmedabad'}],
    'East India': [{s: 'West Bengal', c: 'Kolkata'}]
  };

  const cities = CITY_MAP[territory.territory] || [];
  const [values, setValues] = React.useState({});
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    loadCityData();
  }, [territory.id]);

  const loadCityData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/target-plans/${planId}/hierarchy`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const thisTerr = res.data.territories?.find(t => t.id === territory.id);
      const newValues = {};
      let hasData = false;

      if (thisTerr && thisTerr.states) {
        thisTerr.states.forEach(state => {
          if (state.cities) {
            state.cities.forEach(city => {
              newValues[city.city] = city.allocation_percentage?.toString() || '';
              hasData = true;
            });
          }
        });
      }

      setValues(newValues);
      if (!hasData) setEditing(true);
    } catch (error) {
      setEditing(true);
    }
  };

  const total = cities.reduce((sum, city) => sum + (parseFloat(values[city.c]) || 0), 0);
  const targetL = territory.target_revenue / 100000;
  const valid = Math.abs(total - 100) < 0.1 && total > 0; // Must equal 100%

  const save = async () => {
    try {
      const token = localStorage.getItem('token');
      const payload = cities
        .filter(c => parseFloat(values[c.c]) > 0)
        .map(c => ({
          state: c.s,
          city: c.c,
          allocation_percentage: parseFloat(values[c.c])
        }));

      await axios.post(
        `${API}/target-plans/${planId}/territories/${encodeURIComponent(territory.territory)}/cities`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Cities saved!');
      setEditing(false);
      onUpdate();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed');
    }
  };

  const hasData = Object.keys(values).some(k => parseFloat(values[k]) > 0);

  if (!editing && hasData) {
    return (
      <div className="space-y-4">
        <div className="bg-primary/5 p-4 rounded-xl">
          <p className="font-semibold">{territory.territory}: Rs {targetL.toFixed(1)}L</p>
        </div>
        
        {cities.map(city => {
          const pct = parseFloat(values[city.c]) || 0;
          if (pct > 0) {
            const amount = (pct / 100) * targetL;
            return (
              <div key={city.c} className="flex justify-between bg-secondary p-3 rounded-lg">
                <span>{city.c} ({city.s})</span>
                <span className="font-bold">{pct}% (Rs {amount.toFixed(1)}L)</span>
              </div>
            );
          }
          return null;
        })}
        
        <Button onClick={() => setEditing(true)} variant="outline" className="w-full rounded-full">Edit Cities</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 p-4 rounded-xl">
        <p className="font-semibold">{territory.territory}: Rs {targetL.toFixed(1)}L</p>
        <p className="text-sm text-muted-foreground">Enter percentages (must total 100%)</p>
      </div>

      {cities.map(city => (
        <div key={city.c} className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
          <div className="flex-1">
            <p className="font-medium">{city.c}</p>
            <p className="text-xs text-muted-foreground">{city.s}</p>
          </div>
          <Input
            type="number"
            value={values[city.c] || ''}
            onChange={e => setValues({...values, [city.c]: e.target.value})}
            placeholder="Enter %"
            className="w-32 h-11 text-right font-semibold text-lg"
          />
          <span className="text-sm font-medium w-8">%</span>
          <span className="text-sm text-muted-foreground w-24 text-right">
            Rs {((parseFloat(values[city.c]) || 0) / 100 * targetL).toFixed(1)}L
          </span>
        </div>
      ))}

      <div className={`p-4 rounded-xl ${valid ? 'bg-green-50' : 'bg-amber-50'}`}>
        <div className="flex justify-between mb-2">
          <span className="font-bold">Total:</span>
          <span className="text-2xl font-bold">{total.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Equals:</span>
          <span className="font-semibold">Rs {((total / 100) * targetL).toFixed(1)}L</span>
        </div>
        {!valid && total > 0 && <p className="text-xs text-amber-800 mt-2">Must equal 100%</p>}
      </div>

      <Button onClick={save} disabled={!valid} className="w-full h-12 rounded-full">Save Cities</Button>
    </div>
  );
}

function ResourceSection({ planId, hierarchy, onUpdate }) {
  const [selectedCity, setSelectedCity] = React.useState(null);
  const [salesTeam, setSalesTeam] = React.useState([]);

  React.useEffect(() => {
    loadSalesTeam();
    
    // Get first city from hierarchy
    if (hierarchy.territories) {
      for (const terr of hierarchy.territories) {
        if (terr.states) {
          for (const state of terr.states) {
            if (state.cities && state.cities[0]) {
              setSelectedCity(state.cities[0]);
              return;
            }
          }
        }
      }
    }
  }, []);

  const loadSalesTeam = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSalesTeam(res.data.filter(u => ['sales_rep', 'sales_manager'].includes(u.role)));
    } catch (err) {
      console.error(err);
    }
  };

  if (!selectedCity) {
    return <div className="text-center py-8">No cities allocated yet. Allocate cities first.</div>;
  }

  // Get all allocated cities
  const allCities = [];
  if (hierarchy.territories) {
    hierarchy.territories.forEach(terr => {
      if (terr.states) {
        terr.states.forEach(state => {
          if (state.cities) {
            state.cities.forEach(city => allCities.push(city));
          }
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {allCities.map(c => (
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

      <ResourceAllocationForm city={selectedCity} planId={planId} salesTeam={salesTeam} onUpdate={onUpdate} />
    </div>
  );
}

function ResourceAllocationForm({ city, planId, salesTeam, onUpdate }) {
  const [values, setValues] = React.useState({});
  const [loading, setLoading] = React.useState(false);

  // Group resources by territory
  const grouped = {
    'North India': salesTeam.filter(m => m.territory?.includes('North')),
    'South India': salesTeam.filter(m => m.territory?.includes('South')),
    'West India': salesTeam.filter(m => m.territory?.includes('West')),
    'East India': salesTeam.filter(m => m.territory?.includes('East')),
    'All India': salesTeam.filter(m => m.territory === 'All India')
  };

  const total = Object.values(values).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const targetL = city.target_revenue / 100000;
  const valid = Math.abs(total - 100) < 0.1 && total > 0;

  const save = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = Object.keys(values)
        .filter(k => parseFloat(values[k]) > 0)
        .map(k => ({
          resource_id: k,
          allocation_percentage: parseFloat(values[k])
        }));

      await axios.post(
        `${API}/target-plans/${planId}/cities/${city.id}/resources`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success(`✓ ${payload.length} resources assigned to ${city.city}!`, { duration: 4000 });
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
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

      <p className="text-sm text-muted-foreground">
        Assign percentages to any sales resource (same resource can have allocations in multiple cities):
      </p>

      <p className="text-sm text-muted-foreground bg-primary/5 p-3 rounded-lg border border-primary/20">
        <strong>Note:</strong> Each city's allocation is independent. The same resource can have different percentages across cities.
        For example, Priya could be assigned 60% of Bengaluru and 80% of Chennai.
      </p>

      {Object.keys(grouped).map(terrName => {
        const members = grouped[terrName];
        if (members.length === 0) return null;

        return (
          <div key={terrName} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{terrName}</p>
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 bg-secondary p-3 rounded-xl">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {m.name[0]}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.designation}</p>
                </div>
                <Input
                  type="number"
                  value={values[m.id] || ''}
                  onChange={e => setValues({...values, [m.id]: e.target.value})}
                  placeholder="%"
                  className="w-24 h-10 text-right font-semibold text-lg"
                />
                <span className="text-sm font-medium w-6">%</span>
                <span className="text-sm text-muted-foreground w-20 text-right">
                  Rs {((parseFloat(values[m.id]) || 0) / 100 * targetL).toFixed(1)}L
                </span>
              </div>
            ))}
          </div>
        );
      })}

      <div className={`p-5 rounded-xl border-2 ${valid ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
        <div className="flex justify-between mb-2">
          <span className="font-semibold">Total Assigned:</span>
          <span className="text-3xl font-bold">{total.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Equals:</span>
          <span className="font-semibold">Rs {((total / 100) * targetL).toFixed(1)}L</span>
        </div>
        {!valid && total > 0 && (
          <p className="text-sm text-amber-800 mt-3">Must total 100%</p>
        )}
        {valid && (
          <p className="text-sm text-green-800 mt-3">✓ Perfect!</p>
        )}
      </div>

      <Button onClick={save} disabled={!valid || loading} className="w-full h-12 rounded-full">
        {loading ? 'Saving...' : `Save ${city.city} Assignments`}
      </Button>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between bg-secondary p-4 rounded-xl">
      <span className="font-medium">{label}</span>
      <span className="text-lg font-bold text-primary">{value}</span>
    </div>
  );
}

function InputRow({ label, value, onChange, suffix = 'Lakhs' }) {
  return (
    <div className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
      <div className="flex-1"><p className="font-medium">{label}</p></div>
      <Input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={suffix === '%' ? 'Enter %' : 'Enter value'}
        className="w-48 h-11 text-right font-semibold text-lg"
      />
      <span className="text-sm text-muted-foreground w-12">{suffix}</span>
    </div>
  );
}
