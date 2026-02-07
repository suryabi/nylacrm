import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Plus, ArrowLeft, CheckCircle2, AlertCircle, Edit, Trash2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// Configure axios to always send credentials
axios.defaults.withCredentials = true;

export default function SalesTargets() {
  const [page, setPage] = React.useState('list');
  const [plans, setPlans] = React.useState([]);
  const [currentPlan, setCurrentPlan] = React.useState(null);
  const [deleteDialog, setDeleteDialog] = React.useState(false);
  const [planToDelete, setPlanToDelete] = React.useState(null);

  React.useEffect(() => {
    if (page === 'list') loadPlans();
  }, [page]);

  const loadPlans = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans', {
      headers: { Authorization: 'Bearer ' + token },
      withCredentials: true
    });
    setPlans(res.data);
  };

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(API + '/target-plans/' + planToDelete.id, {
        headers: { Authorization: 'Bearer ' + token }
      });
      toast.success('Plan deleted!');
      setDeleteDialog(false);
      setPlanToDelete(null);
      loadPlans();
    } catch (error) {
      toast.error('Failed to delete plan');
    }
  };

  const startEdit = (plan) => {
    setCurrentPlan(plan);
    setPage('edit');
  };

  if (page === 'create') return <CreatePage onBack={() => setPage('list')} />;
  if (page === 'edit' && currentPlan) return <EditPage plan={currentPlan} onBack={() => setPage('list')} />;
  if (page === 'territories' && currentPlan) return <TerritoriesPage plan={currentPlan} onBack={() => setPage('list')} />;
  if (page === 'cities' && currentPlan) return <CitiesPage plan={currentPlan} onBack={() => setPage('list')} />;
  if (page === 'resources' && currentPlan) return <ResourcesPage plan={currentPlan} onBack={() => setPage('list')} />;
  if (page === 'skus' && currentPlan) return <SKUsPage plan={currentPlan} onBack={() => setPage('list')} />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-4xl font-light mb-2">Sales Targets</h1>
          <p className="text-muted-foreground">Revenue planning</p>
        </div>
        <Button onClick={() => setPage('create')} className="h-12 rounded-full">
          <Plus className="h-5 w-5 mr-2" />New Plan
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map(p => (
          <Card key={p.id} className="p-6 border rounded-2xl">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold mb-1">{p.plan_name}</h3>
                <p className="text-sm text-muted-foreground">{p.time_period}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => startEdit(p)}
                  className="rounded-full h-8 w-8"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setPlanToDelete(p); setDeleteDialog(true); }}
                  className="rounded-full h-8 w-8 text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-3xl font-bold text-primary mb-4">Rs {(p.country_target / 100000).toFixed(1)}L</p>
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => { setCurrentPlan(p); setPage('territories'); }} variant="outline" className="rounded-full text-xs">Territories</Button>
              <Button onClick={() => { setCurrentPlan(p); setPage('cities'); }} variant="outline" className="rounded-full text-xs">Cities</Button>
              <Button onClick={() => { setCurrentPlan(p); setPage('resources'); }} variant="outline" className="rounded-full text-xs">Resources</Button>
              <Button onClick={() => { setCurrentPlan(p); setPage('skus'); }} variant="outline" className="rounded-full text-xs">SKUs</Button>
            </div>
          </Card>
        ))}
      </div>

      {deleteDialog && planToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteDialog(false)}>
          <Card className="p-8 max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-semibold mb-4">Delete Target Plan?</h3>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to delete <strong>{planToDelete.plan_name}</strong>? 
              This will remove all territory, city, resource, and SKU allocations.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteDialog(false)} className="flex-1 rounded-full">
                Cancel
              </Button>
              <Button onClick={handleDelete} className="flex-1 rounded-full bg-red-600 hover:bg-red-700">
                Delete Plan
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function CreatePage({ onBack }) {
  const [name, setName] = React.useState('');
  const [period, setPeriod] = React.useState('quarterly');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [target, setTarget] = React.useState('');

  const submit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    await axios.post(API + '/target-plans', {
      plan_name: name,
      time_period: period,
      start_date: start,
      end_date: end,
      country_target: parseFloat(target) * 100000
    }, { headers: { Authorization: 'Bearer ' + token } });
    toast.success('Plan created!');
    onBack();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-8 border rounded-2xl">
        <h1 className="text-2xl font-semibold mb-6">Create Plan</h1>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Plan Name</Label><Input value={name} onChange={e => setName(e.target.value)} required className="h-12" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Period</Label>
              <select value={period} onChange={e => setPeriod(e.target.value)} className="w-full h-12 px-4 rounded-xl border">
                <option value="quarterly">Quarterly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div><Label>Target (Lakhs)</Label><Input type="number" value={target} onChange={e => setTarget(e.target.value)} required className="h-12" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Start</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} required className="h-12" /></div>
            <div><Label>End</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} required className="h-12" /></div>
          </div>
          <Button type="submit" className="w-full h-14 rounded-full">Create</Button>
        </form>
      </Card>
    </div>
  );
}

function EditPage({ plan, onBack }) {
  const [name, setName] = React.useState(plan.plan_name);
  const [period, setPeriod] = React.useState(plan.time_period);
  const [start, setStart] = React.useState(plan.start_date);
  const [end, setEnd] = React.useState(plan.end_date);
  const [target, setTarget] = React.useState((plan.country_target / 100000).toString());

  const submit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    await axios.put(API + '/target-plans/' + plan.id, {
      plan_name: name,
      time_period: period,
      start_date: start,
      end_date: end,
      country_target: parseFloat(target) * 100000
    }, { headers: { Authorization: 'Bearer ' + token } });
    toast.success('Plan updated!');
    onBack();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-8 border rounded-2xl">
        <h1 className="text-2xl font-semibold mb-6">Edit Plan</h1>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Plan Name</Label><Input value={name} onChange={e => setName(e.target.value)} required className="h-12" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Period</Label>
              <select value={period} onChange={e => setPeriod(e.target.value)} className="w-full h-12 px-4 rounded-xl border">
                <option value="quarterly">Quarterly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div><Label>Target (Lakhs)</Label><Input type="number" value={target} onChange={e => setTarget(e.target.value)} required className="h-12" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Start</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} required className="h-12" /></div>
            <div><Label>End</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} required className="h-12" /></div>
          </div>
          <Button type="submit" className="w-full h-14 rounded-full">Update Plan</Button>
        </form>
      </Card>
    </div>
  );
}


function TerritoriesPage({ plan, onBack }) {
  const [n, setN] = React.useState('');
  const [s, setS] = React.useState('');
  const [w, setW] = React.useState('');
  const [e, setE] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    loadExisting();
  }, []);

  const loadExisting = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans/' + plan.id + '/hierarchy', {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    if (res.data.territories) {
      res.data.territories.forEach(t => {
        const pct = t.allocation_percentage?.toString() || '';
        if (t.territory === 'North India') setN(pct);
        if (t.territory === 'South India') setS(pct);
        if (t.territory === 'West India') setW(pct);
        if (t.territory === 'East India') setE(pct);
      });
    }
    setLoaded(true);
  };

  const total = (parseFloat(n) || 0) + (parseFloat(s) || 0) + (parseFloat(w) || 0) + (parseFloat(e) || 0);
  const valid = Math.abs(total - 100) < 0.1;

  const save = async () => {
    const token = localStorage.getItem('token');
    const data = [];
    if (parseFloat(n) > 0) data.push({ territory: 'North India', allocation_percentage: parseFloat(n) });
    if (parseFloat(s) > 0) data.push({ territory: 'South India', allocation_percentage: parseFloat(s) });
    if (parseFloat(w) > 0) data.push({ territory: 'West India', allocation_percentage: parseFloat(w) });
    if (parseFloat(e) > 0) data.push({ territory: 'East India', allocation_percentage: parseFloat(e) });

    await axios.post(API + '/target-plans/' + plan.id + '/territories', data, {
      headers: { Authorization: 'Bearer ' + token }
    });
    toast.success('Territories saved!');
  };

  if (!loaded) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-8 bg-primary/5 rounded-2xl">
        <h1 className="text-2xl font-semibold mb-2">{plan.plan_name}</h1>
        <p className="text-4xl font-bold text-primary">Rs {(plan.country_target / 100000).toFixed(1)}L</p>
      </Card>
      <Card className="p-8 border rounded-2xl">
        <h2 className="text-xl font-semibold mb-6">Allocate Territories</h2>
        <div className="space-y-4">
          <TRow label="North India" value={n} onChange={setN} target={plan.country_target} />
          <TRow label="South India" value={s} onChange={setS} target={plan.country_target} />
          <TRow label="West India" value={w} onChange={setW} target={plan.country_target} />
          <TRow label="East India" value={e} onChange={setE} target={plan.country_target} />
        </div>
        <div className={`p-5 rounded-xl mt-6 ${valid && total > 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
          <div className="flex justify-between mb-2">
            <span className="font-semibold">Total:</span>
            <span className="text-3xl font-bold">{total.toFixed(1)}%</span>
          </div>
          {!valid && total > 0 && <p className="text-sm text-amber-800">Must = 100%</p>}
          {valid && <p className="text-sm text-green-800">✓ Perfect!</p>}
        </div>
        <Button onClick={save} disabled={!valid} className="w-full h-14 rounded-full mt-6">Save</Button>
      </Card>
    </div>
  );
}

function CitiesPage({ plan, onBack }) {
  const [tab, setTab] = React.useState('south');
  const [territories, setTerritories] = React.useState([]);

  React.useEffect(() => {
    loadTerr();
  }, []);

  const loadTerr = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans/' + plan.id + '/hierarchy', {
      headers: { Authorization: 'Bearer ' + token }
    });
    setTerritories(res.data.territories || []);
  };

  const currentTerr = territories.find(t => 
    (tab === 'south' && t.territory === 'South India') ||
    (tab === 'west' && t.territory === 'West India') ||
    (tab === 'north' && t.territory === 'North India') ||
    (tab === 'east' && t.territory === 'East India')
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-8 bg-primary/5 rounded-2xl">
        <h1 className="text-2xl font-semibold mb-2">{plan.plan_name}</h1>
        <p className="text-xl font-bold text-primary">Allocate Cities</p>
      </Card>
      <Card className="p-6 border rounded-2xl">
        <div className="flex gap-2 mb-6">
          <Button variant={tab === 'south' ? 'default' : 'outline'} onClick={() => setTab('south')} className="rounded-full">South</Button>
          <Button variant={tab === 'west' ? 'default' : 'outline'} onClick={() => setTab('west')} className="rounded-full">West</Button>
          <Button variant={tab === 'north' ? 'default' : 'outline'} onClick={() => setTab('north')} className="rounded-full">North</Button>
          <Button variant={tab === 'east' ? 'default' : 'outline'} onClick={() => setTab('east')} className="rounded-full">East</Button>
        </div>
        {currentTerr && <CityForm planId={plan.id} territory={currentTerr} onUpdate={loadTerr} />}
      </Card>
    </div>
  );
}

function CityForm({ planId, territory, onUpdate }) {
  const CITY_MAP = {
    'South India': [{s: 'Karnataka', c: 'Bengaluru'}, {s: 'Tamil Nadu', c: 'Chennai'}, {s: 'Telangana', c: 'Hyderabad'}],
    'West India': [{s: 'Maharashtra', c: 'Mumbai'}, {s: 'Maharashtra', c: 'Pune'}, {s: 'Gujarat', c: 'Ahmedabad'}],
    'North India': [{s: 'Delhi', c: 'New Delhi'}, {s: 'Uttar Pradesh', c: 'Noida'}],
    'East India': [{s: 'West Bengal', c: 'Kolkata'}]
  };

  const cities = CITY_MAP[territory.territory] || [];
  const [vals, setVals] = React.useState({});
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setVals({});
    setLoaded(false);
    loadExisting();
  }, [territory.id]);

  const loadExisting = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans/' + planId + '/hierarchy', {
      headers: { Authorization: 'Bearer ' + token }
    });

    const thisTerr = res.data.territories?.find(t => t.id === territory.id);
    const newVals = {};

    if (thisTerr && thisTerr.states) {
      thisTerr.states.forEach(state => {
        if (state.cities) {
          state.cities.forEach(city => {
            newVals[city.city] = city.allocation_percentage?.toString() || '';
          });
        }
      });
    }
    setVals(newVals);
    setLoaded(true);
  };

  const total = cities.reduce((s, c) => s + (parseFloat(vals[c.c]) || 0), 0);
  const territoryTarget = territory.target_revenue / 100000;
  const valid = Math.abs(total - 100) < 0.1 && total > 0;

  const save = async () => {
    const token = localStorage.getItem('token');
    const payload = cities
      .filter(c => parseFloat(vals[c.c]) > 0)
      .map(c => ({ state: c.s, city: c.c, allocation_percentage: parseFloat(vals[c.c]) }));

    await axios.post(API + '/target-plans/' + planId + '/territories/' + encodeURIComponent(territory.territory) + '/cities', payload, {
      headers: { Authorization: 'Bearer ' + token }
    });
    toast.success(territory.territory + ' cities saved!');
    onUpdate();
  };

  if (!loaded) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 p-6 rounded-2xl border-2 border-primary/20">
        <div className="flex justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Territory</p>
            <h3 className="text-2xl font-bold">{territory.territory}</h3>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Territory Target</p>
            <p className="text-4xl font-bold text-primary">Rs {territoryTarget.toFixed(1)}L</p>
          </div>
        </div>
      </div>

      {cities.map(city => {
        const cityAmount = (parseFloat(vals[city.c]) || 0) / 100 * territoryTarget;
        return (
          <div key={city.c} className="bg-card border-2 p-4 rounded-xl">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex-1">
                <p className="font-semibold">{city.c}</p>
                <p className="text-xs text-muted-foreground">{city.s}</p>
              </div>
              <Input type="number" value={vals[city.c] || ''} onChange={e => setVals({...vals, [city.c]: e.target.value})} placeholder="%" className="w-28 h-11 text-right font-bold text-xl" />
              <span className="font-bold w-8">%</span>
            </div>
            <div className="bg-primary/5 p-2 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">City Target:</span>
                <span className="font-bold text-primary">Rs {cityAmount.toFixed(1)}L</span>
              </div>
            </div>
          </div>
        );
      })}

      <div className={`p-5 rounded-xl ${valid ? 'bg-green-50' : 'bg-amber-50'}`}>
        <div className="flex justify-between mb-2">
          <span className="font-semibold">Total:</span>
          <span className="text-3xl font-bold">{total.toFixed(1)}%</span>
        </div>
        {!valid && total > 0 && <p className="text-xs text-amber-800">Must = 100%</p>}
        {valid && <p className="text-xs text-green-800">✓ Perfect!</p>}
      </div>

      <Button onClick={save} disabled={!valid} className="w-full h-12 rounded-full">Save Cities</Button>
    </div>
  );
}

function ResourcesPage({ plan, onBack }) {
  const [tab, setTab] = React.useState('bengaluru');
  const [cities, setCities] = React.useState([]);
  const [salesTeam, setSalesTeam] = React.useState([]);

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const token = localStorage.getItem('token');
    
    const hRes = await axios.get(API + '/target-plans/' + plan.id + '/hierarchy', {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    const uRes = await axios.get(API + '/users', {
      headers: { Authorization: 'Bearer ' + token }
    });

    const allCities = [];
    if (hRes.data.territories) {
      hRes.data.territories.forEach(terr => {
        if (terr.states) {
          terr.states.forEach(state => {
            if (state.cities) {
              state.cities.forEach(city => allCities.push(city));
            }
          });
        }
      });
    }
    
    setCities(allCities);
    setSalesTeam(uRes.data.filter(u => ['Business Development Executive', 'Regional Sales Manager', 'National Sales Head'].includes(u.role)));
  };

  const currentCity = cities.find(c => c.city.toLowerCase().replace(' ', '') === tab);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-8 bg-primary/5 rounded-2xl">
        <h1 className="text-2xl font-semibold mb-2">{plan.plan_name}</h1>
        <p className="text-xl font-bold text-primary">Resource Allocation</p>
      </Card>
      <Card className="p-6 border rounded-2xl">
        <div className="flex gap-2 mb-6 flex-wrap">
          {cities.map(c => (
            <Button
              key={c.id}
              variant={c.city.toLowerCase().replace(' ', '') === tab ? 'default' : 'outline'}
              onClick={() => setTab(c.city.toLowerCase().replace(' ', ''))}
              size="sm"
              className="rounded-full"
            >
              {c.city}
            </Button>
          ))}
        </div>
        {currentCity && <ResourceForm planId={plan.id} city={currentCity} team={salesTeam} />}
      </Card>
    </div>
  );
}

function ResourceForm({ planId, city, team }) {
  const [vals, setVals] = React.useState({});
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setVals({});
    setLoaded(false);
    loadExisting();
  }, [city.id]);

  const loadExisting = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans/' + planId + '/cities/' + city.id + '/resources', {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (res.data.resources) {
      const newVals = {};
      res.data.resources.forEach(resource => {
        newVals[resource.resource_id] = resource.allocation_percentage?.toString() || '';
      });
      setVals(newVals);
    }
    setLoaded(true);
  };

  const grouped = {
    'North India': team.filter(m => m.territory?.includes('North')),
    'South India': team.filter(m => m.territory?.includes('South')),
    'West India': team.filter(m => m.territory?.includes('West')),
    'East India': team.filter(m => m.territory?.includes('East')),
    'All India': team.filter(m => m.territory === 'All India')
  };

  const total = Object.values(vals).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const cityTarget = city.target_revenue / 100000;
  const valid = Math.abs(total - 100) < 0.1 && total > 0;

  const save = async () => {
    const token = localStorage.getItem('token');
    const payload = Object.keys(vals)
      .filter(k => parseFloat(vals[k]) > 0)
      .map(k => ({ resource_id: k, allocation_percentage: parseFloat(vals[k]) }));

    await axios.post(API + '/target-plans/' + planId + '/cities/' + city.id + '/resources', payload, {
      headers: { Authorization: 'Bearer ' + token }
    });
    toast.success(city.city + ' resources saved!');
  };

  if (!loaded) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 p-6 rounded-2xl border-2 border-primary/20">
        <div className="flex justify-between">
          <div>
            <p className="text-sm text-muted-foreground">City</p>
            <h3 className="text-2xl font-bold">{city.city}</h3>
            <p className="text-xs text-muted-foreground">{city.state}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">City Target</p>
            <p className="text-4xl font-bold text-primary">Rs {cityTarget.toFixed(1)}L</p>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground bg-primary/5 p-3 rounded-lg">
        Assign WHO sells - Resources can be from any territory and same resource can have different % across cities.
      </p>

      {Object.keys(grouped).map(terrName => {
        const members = grouped[terrName];
        if (members.length === 0) return null;

        return (
          <div key={terrName} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">{terrName}</p>
            {members.map(m => {
              const resAmount = (parseFloat(vals[m.id]) || 0) / 100 * cityTarget;
              return (
                <div key={m.id} className="bg-card border-2 p-4 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">{m.name[0]}</div>
                    <div className="flex-1">
                      <p className="font-semibold">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.designation}</p>
                    </div>
                    <Input type="number" value={vals[m.id] || ''} onChange={e => setVals({...vals, [m.id]: e.target.value})} placeholder="%" className="w-28 h-11 text-right font-bold text-xl" />
                    <span className="font-bold w-8">%</span>
                  </div>
                  <div className="bg-primary/5 p-2 rounded-lg">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Resource Target:</span>
                      <span className="font-bold text-primary">Rs {resAmount.toFixed(1)}L</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className={`p-5 rounded-xl ${valid ? 'bg-green-50' : 'bg-amber-50'}`}>
        <div className="flex justify-between mb-2">
          <span className="font-semibold">Total:</span>
          <span className="text-3xl font-bold">{total.toFixed(1)}%</span>
        </div>
        {!valid && total > 0 && <p className="text-xs text-amber-800">Must = 100%</p>}
        {valid && <p className="text-xs text-green-800">✓ Perfect!</p>}
      </div>

      <Button onClick={save} disabled={!valid} className="w-full h-12 rounded-full">
        Save {city.city} Resources
      </Button>
    </div>
  );
}

function SKUsPage({ plan, onBack }) {
  const [tab, setTab] = React.useState('bengaluru');
  const [cities, setCities] = React.useState([]);

  React.useEffect(() => {
    loadCities();
  }, []);

  const loadCities = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans/' + plan.id + '/hierarchy', {
      headers: { Authorization: 'Bearer ' + token }
    });

    const allCities = [];
    if (res.data.territories) {
      res.data.territories.forEach(terr => {
        if (terr.states) {
          terr.states.forEach(state => {
            if (state.cities) {
              state.cities.forEach(city => allCities.push(city));
            }
          });
        }
      });
    }
    setCities(allCities);
  };

  const currentCity = cities.find(c => c.city.toLowerCase().replace(' ', '') === tab);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-8 bg-primary/5 rounded-2xl">
        <h1 className="text-2xl font-semibold mb-2">{plan.plan_name}</h1>
        <p className="text-xl font-bold text-primary">SKU Allocation</p>
      </Card>
      <Card className="p-6 border rounded-2xl">
        <div className="flex gap-2 mb-6 flex-wrap">
          {cities.map(c => (
            <Button
              key={c.id}
              variant={c.city.toLowerCase().replace(' ', '') === tab ? 'default' : 'outline'}
              onClick={() => setTab(c.city.toLowerCase().replace(' ', ''))}
              size="sm"
              className="rounded-full"
            >
              {c.city}
            </Button>
          ))}
        </div>
        {currentCity && <SKUForm planId={plan.id} city={currentCity} />}
      </Card>
    </div>
  );
}

function SKUForm({ planId, city }) {
  const [v1, setV1] = React.useState('');
  const [v2, setV2] = React.useState('');
  const [v3, setV3] = React.useState('');
  const [v4, setV4] = React.useState('');
  const [v5, setV5] = React.useState('');
  const [v6, setV6] = React.useState('');
  const [v7, setV7] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    setV1('');
    setV2('');
    setV3('');
    setV4('');
    setV5('');
    setV6('');
    setV7('');
    setLoaded(false);
    loadExisting();
  }, [city.id]);

  const loadExisting = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans/' + planId + '/cities/' + city.id + '/skus', {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (res.data.skus) {
      res.data.skus.forEach(sku => {
        const pct = sku.allocation_percentage?.toString() || '';
        if (sku.sku_name === '660 ml Silver') setV1(pct);
        if (sku.sku_name === '660 ml Gold') setV2(pct);
        if (sku.sku_name === '330 ml Silver') setV3(pct);
        if (sku.sku_name === '330 ml Gold') setV4(pct);
        if (sku.sku_name === '660 Sparkling') setV5(pct);
        if (sku.sku_name === '330 Sparkling') setV6(pct);
        if (sku.sku_name === '24 Brand') setV7(pct);
      });
    }
    setLoaded(true);
  };

  const skus = [
    {name: '660 ml Silver', val: v1, set: setV1},
    {name: '660 ml Gold', val: v2, set: setV2},
    {name: '330 ml Silver', val: v3, set: setV3},
    {name: '330 ml Gold', val: v4, set: setV4},
    {name: '660 Sparkling', val: v5, set: setV5},
    {name: '330 Sparkling', val: v6, set: setV6},
    {name: '24 Brand', val: v7, set: setV7}
  ];

  const total = skus.reduce((s, sku) => s + (parseFloat(sku.val) || 0), 0);
  const cityTarget = city.target_revenue / 100000;
  const valid = Math.abs(total - 100) < 0.1 && total > 0;

  const save = async () => {
    const token = localStorage.getItem('token');
    const payload = skus
      .filter(sku => parseFloat(sku.val) > 0)
      .map(sku => ({ sku_name: sku.name, allocation_percentage: parseFloat(sku.val) }));

    await axios.post(API + '/target-plans/' + planId + '/cities/' + city.id + '/skus', payload, {
      headers: { Authorization: 'Bearer ' + token }
    });
    toast.success(city.city + ' SKUs saved!');
  };

  if (!loaded) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 p-6 rounded-2xl border-2 border-primary/20">
        <div className="flex justify-between">
          <div>
            <p className="text-sm text-muted-foreground">City</p>
            <h3 className="text-2xl font-bold">{city.city}</h3>
            <p className="text-xs text-muted-foreground">{city.state}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">City Target</p>
            <p className="text-4xl font-bold text-primary">Rs {cityTarget.toFixed(1)}L</p>
          </div>
        </div>
      </div>

      {skus.map(sku => {
        const skuAmount = (parseFloat(sku.val) || 0) / 100 * cityTarget;
        return (
          <div key={sku.name} className="bg-card border-2 p-4 rounded-xl">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex-1"><p className="font-semibold">{sku.name}</p></div>
              <Input type="number" value={sku.val} onChange={e => sku.set(e.target.value)} placeholder="%" className="w-28 h-11 text-right font-bold text-xl" />
              <span className="font-bold w-8">%</span>
            </div>
            <div className="bg-primary/5 p-2 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SKU Target:</span>
                <span className="font-bold text-primary">Rs {skuAmount.toFixed(1)}L</span>
              </div>
            </div>
          </div>
        );
      })}

      <div className={`p-5 rounded-xl ${valid ? 'bg-green-50' : 'bg-amber-50'}`}>
        <div className="flex justify-between mb-2">
          <span className="font-semibold">Total:</span>
          <span className="text-3xl font-bold">{total.toFixed(1)}%</span>
        </div>
        {!valid && total > 0 && <p className="text-xs text-amber-800">Must = 100%</p>}
        {valid && <p className="text-xs text-green-800">✓ Perfect!</p>}
      </div>

      <Button onClick={save} disabled={!valid} className="w-full h-12 rounded-full">Save SKUs</Button>
    </div>
  );
}

function TRow({ label, value, onChange, target }) {
  return (
    <div className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
      <div className="flex-1"><p className="font-medium">{label}</p></div>
      <Input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="%" className="w-32 h-11 text-right font-semibold text-lg" />
      <span className="w-8 font-bold">%</span>
      <span className="w-28 text-right text-muted-foreground font-medium">
        Rs {((parseFloat(value) || 0) / 100 * target / 100000).toFixed(1)}L
      </span>
    </div>
  );
}
