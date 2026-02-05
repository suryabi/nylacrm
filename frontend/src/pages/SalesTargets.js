import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Plus, Target, Edit, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function SalesTargets() {
  const [plans, setPlans] = React.useState([]);
  const [view, setView] = React.useState('list');
  const [currentPlan, setCurrentPlan] = React.useState(null);
  const [step, setStep] = React.useState(1);

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
        <Button variant="outline" onClick={() => setView('list')} className="rounded-full">Back</Button>
        <Card className="p-8 border rounded-2xl">
          <h1 className="text-2xl font-semibold mb-6">Create Target Plan</h1>
          <CreateForm onDone={() => { setView('list'); loadPlans(); }} />
        </Card>
      </div>
    );
  }

  if (view === 'allocate') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setView('list')} className="rounded-full">Back to Plans</Button>
          <div className="flex gap-2">
            <Badge className={step === 1 ? 'bg-primary text-white' : 'bg-muted'}>1: Territories</Badge>
            <Badge className={step === 2 ? 'bg-primary text-white' : 'bg-muted'}>2: Cities</Badge>
            <Badge className={step === 3 ? 'bg-primary text-white' : 'bg-muted'}>3: Resources</Badge>
            <Badge className={step === 4 ? 'bg-primary text-white' : 'bg-muted'}>4: Review</Badge>
          </div>
        </div>

        <Card className="p-8 bg-primary/5 border-primary/20 rounded-2xl">
          <h1 className="text-2xl font-semibold mb-2">{currentPlan.plan_name}</h1>
          <p className="text-3xl font-bold text-primary mt-4">Rs {(currentPlan.country_target / 100000).toFixed(1)}L</p>
        </Card>

        {step === 1 && <Card className="p-8 border rounded-2xl"><TerritoryAlloc planId={currentPlan.id} target={currentPlan.country_target} onNext={() => setStep(2)} /></Card>}
        {step === 2 && <Card className="p-8 border rounded-2xl"><CityAlloc planId={currentPlan.id} onNext={() => setStep(3)} /></Card>}
        {step === 3 && <Card className="p-8 border rounded-2xl"><ResourceAlloc planId={currentPlan.id} onNext={() => setStep(4)} /></Card>}
        {step === 4 && <Card className="p-8 border rounded-2xl"><ReviewScreen planId={currentPlan.id} onFinish={() => { setView('list'); loadPlans(); }} /></Card>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-4xl font-light mb-2">Sales Target Planning</h1>
          <p className="text-muted-foreground">Manage revenue targets</p>
        </div>
        <Button onClick={() => setView('create')} className="h-12 rounded-full">
          <Plus className="h-5 w-5 mr-2" />New Plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <Card className="p-16 text-center border rounded-2xl">
          <Target className="h-20 w-20 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground mb-6">No plans yet</p>
          <Button onClick={() => setView('create')} className="h-12 rounded-full">Create First Plan</Button>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map(p => <PlanCard key={p.id} plan={p} onSelect={startAllocation} />)}
        </div>
      )}
    </div>
  );
}

function CreateForm({ onDone }) {
  const [d, setD] = React.useState({ name: '', period: 'quarterly', start: '', end: '', target: '' });
  
  const submit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/target-plans`, {
        plan_name: d.name,
        time_period: d.period,
        start_date: d.start,
        end_date: d.end,
        country_target: parseFloat(d.target) * 100000
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Plan created!');
      onDone();
    } catch (err) {
      toast.error('Failed');
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div><Label>Plan Name *</Label><Input value={d.name} onChange={e => setD({...d, name: e.target.value})} required className="h-12" /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Period *</Label>
          <select value={d.period} onChange={e => setD({...d, period: e.target.value})} className="w-full h-12 px-4 rounded-xl border">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half_yearly">Half-Yearly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div><Label>Target (Lakhs) *</Label><Input type="number" value={d.target} onChange={e => setD({...d, target: e.target.value})} required className="h-12" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Start *</Label><Input type="date" value={d.start} onChange={e => setD({...d, start: e.target.value})} required className="h-12" /></div>
        <div><Label>End *</Label><Input type="date" value={d.end} onChange={e => setD({...d, end: e.target.value})} required className="h-12" /></div>
      </div>
      <Button type="submit" className="w-full h-14 rounded-full">Create Plan</Button>
    </form>
  );
}

function PlanCard({ plan, onSelect }) {
  return (
    <Card className="p-6 border rounded-2xl hover:shadow-lg transition-shadow">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-1">{plan.plan_name}</h3>
        <p className="text-sm text-muted-foreground capitalize">{plan.time_period}</p>
        <p className="text-xs text-muted-foreground">{plan.start_date} to {plan.end_date}</p>
      </div>
      <p className="text-3xl font-bold text-primary mb-4">Rs {(plan.country_target / 100000).toFixed(1)}L</p>
      <Button onClick={() => onSelect(plan)} className="w-full rounded-full" variant="outline">
        Manage Allocation <ChevronRight className="h-4 w-4 ml-2" />
      </Button>
    </Card>
  );
}

function TerritoryAlloc({ planId, target, onNext }) {
  const [vals, setVals] = React.useState({ n: '', s: '', w: '', e: '' });
  const [editMode, setEditMode] = React.useState(false);
  const [hasData, setHasData] = React.useState(false);

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/target-plans/${planId}/hierarchy`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      let found = false;
      if (res.data.territories) {
        const newVals = { n: '', s: '', w: '', e: '' };
        for (const t of res.data.territories) {
          const v = (t.target_revenue / 100000).toString();
          if (t.territory === 'North India') { newVals.n = v; found = true; }
          if (t.territory === 'South India') { newVals.s = v; found = true; }
          if (t.territory === 'West India') { newVals.w = v; found = true; }
          if (t.territory === 'East India') { newVals.e = v; found = true; }
        }
        setVals(newVals);
        setHasData(found);
      }
      if (!found) setEditMode(true);
    } catch (err) {
      setEditMode(true);
    }
  };

  const total = (parseFloat(vals.n) || 0) + (parseFloat(vals.s) || 0) + (parseFloat(vals.w) || 0) + (parseFloat(vals.e) || 0);
  const targetL = target / 100000;
  const valid = Math.abs(total - targetL) < 0.1;

  const submit = async () => {
    try {
      const token = localStorage.getItem('token');
      const data = [];
      if (parseFloat(vals.n) > 0) data.push({ territory: 'North India', target_revenue: parseFloat(vals.n) * 100000 });
      if (parseFloat(vals.s) > 0) data.push({ territory: 'South India', target_revenue: parseFloat(vals.s) * 100000 });
      if (parseFloat(vals.w) > 0) data.push({ territory: 'West India', target_revenue: parseFloat(vals.w) * 100000 });
      if (parseFloat(vals.e) > 0) data.push({ territory: 'East India', target_revenue: parseFloat(vals.e) * 100000 });

      await axios.post(`${API}/target-plans/${planId}/territories`, data, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`✓ Saved! ${data.length} territories with Rs ${total.toFixed(1)}L`, { duration: 4000 });
      setEditMode(false);
      setHasData(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    }
  };

  if (!editMode && hasData) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 p-4 rounded-xl">
          <p className="text-sm text-green-800 font-medium">✓ Territories allocated</p>
        </div>
        <div className="space-y-2">
          {parseFloat(vals.n) > 0 && <ViewRow label="North India" value={vals.n} />}
          {parseFloat(vals.s) > 0 && <ViewRow label="South India" value={vals.s} />}
          {parseFloat(vals.w) > 0 && <ViewRow label="West India" value={vals.w} />}
          {parseFloat(vals.e) > 0 && <ViewRow label="East India" value={vals.e} />}
        </div>
        <div className="bg-primary/5 p-4 rounded-xl">
          <div className="flex justify-between">
            <span className="font-semibold">Total:</span>
            <span className="text-2xl font-bold text-primary">Rs {total.toFixed(1)}L</span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setEditMode(true)} variant="outline" className="flex-1 h-12 rounded-full">
            <Edit className="h-4 w-4 mr-2" />Edit
          </Button>
          <Button onClick={onNext} className="flex-1 h-12 rounded-full">Continue to Cities</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 p-4 rounded-xl"><p className="font-semibold">Target: Rs {targetL.toFixed(1)}L</p></div>
      <EditRow label="North India" value={vals.n} onChange={v => setVals({...vals, n: v})} />
      <EditRow label="South India" value={vals.s} onChange={v => setVals({...vals, s: v})} />
      <EditRow label="West India" value={vals.w} onChange={v => setVals({...vals, w: v})} />
      <EditRow label="East India" value={vals.e} onChange={v => setVals({...vals, e: v})} />
      <div className={`p-4 rounded-xl ${valid && total > 0 ? 'bg-green-50 border-2 border-green-300' : 'bg-amber-50 border-2 border-amber-300'}`}>
        <div className="flex justify-between">
          <span className="font-semibold">Total:</span>
          <span className="text-2xl font-bold">Rs {total.toFixed(1)}L</span>
        </div>
        {!valid && total > 0 && <p className="text-xs text-amber-800 mt-2">Must equal {targetL.toFixed(1)}L</p>}
        {valid && <p className="text-xs text-green-800 mt-2"><CheckCircle2 className="h-3 w-3 inline" /> Perfect!</p>}
      </div>
      <Button onClick={submit} disabled={!valid} className="w-full h-12 rounded-full">Save & Continue</Button>
    </div>
  );
}

function CityAlloc({ planId, onNext }) {
  const [territories, setTerritories] = React.useState([]);
  const [selected, setSelected] = React.useState(null);

  React.useEffect(() => {
    loadTerr();
  }, []);

  const loadTerr = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/target-plans/${planId}/hierarchy`, { headers: { Authorization: `Bearer ${token}` } });
      setTerritories(res.data.territories || []);
      if (res.data.territories && res.data.territories[0]) setSelected(res.data.territories[0]);
    } catch (err) {
      console.error(err);
    }
  };

  if (!selected) return <div className="text-center py-8">Loading...</div>;

  const hasAnyCities = territories.some(t => t.allocated_revenue > 0);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {territories.map(t => {
          const pct = t.target_revenue > 0 ? Math.round((t.allocated_revenue / t.target_revenue) * 100) : 0;
          return (
            <Button key={t.id} variant={selected.id === t.id ? 'default' : 'outline'} onClick={() => setSelected(t)} className="rounded-full">
              {t.territory} {pct > 0 && <span className="ml-1 font-bold">({pct}%)</span>}
            </Button>
          );
        })}
      </div>
      <CityForm territory={selected} planId={planId} onSuccess={loadTerr} />
      <div className="flex justify-between pt-6 border-t">
        <span className="text-sm self-center">{hasAnyCities ? <span className="text-green-600 font-medium">✓ Ready for resources</span> : 'Allocate cities first'}</span>
        <Button onClick={onNext} disabled={!hasAnyCities} className="h-12 rounded-full">Assign Resources</Button>
      </div>
    </div>
  );
}

function CityForm({ territory, planId, onSuccess }) {
  const CITIES = {
    'North India': [{s: 'Delhi', c: 'New Delhi'}, {s: 'Uttar Pradesh', c: 'Noida'}],
    'South India': [{s: 'Karnataka', c: 'Bengaluru'}, {s: 'Tamil Nadu', c: 'Chennai'}, {s: 'Telangana', c: 'Hyderabad'}],
    'West India': [{s: 'Maharashtra', c: 'Mumbai'}, {s: 'Maharashtra', c: 'Pune'}, {s: 'Gujarat', c: 'Ahmedabad'}],
    'East India': [{s: 'West Bengal', c: 'Kolkata'}]
  };
  
  const cities = CITIES[territory.territory] || [];
  const [vals, setVals] = React.useState({});
  const [editMode, setEditMode] = React.useState(false);
  const [hasData, setHasData] = React.useState(false);

  React.useEffect(() => {
    loadCities();
  }, [territory.id]);

  const loadCities = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/target-plans/${planId}/hierarchy`, { headers: { Authorization: `Bearer ${token}` } });
      const t = res.data.territories?.find(x => x.id === territory.id);
      let found = false;
      const newVals = {};
      if (t && t.states) {
        for (const st of t.states) {
          if (st.cities) {
            for (const c of st.cities) {
              newVals[c.city] = (c.target_revenue / 100000).toString();
              found = true;
            }
          }
        }
      }
      setVals(newVals);
      setHasData(found);
      if (!found) setEditMode(true);
    } catch (err) {
      setEditMode(true);
    }
  };

  const total = cities.reduce((s, c) => s + (parseFloat(vals[c.c]) || 0), 0);
  const targetL = territory.target_revenue / 100000;
  const valid = Math.abs(total - targetL) < 0.1 && total > 0;

  const submit = async () => {
    try {
      const token = localStorage.getItem('token');
      const payload = cities.filter(c => parseFloat(vals[c.c]) > 0).map(c => ({
        state: c.s,
        city: c.c,
        target_revenue: parseFloat(vals[c.c]) * 100000
      }));

      await axios.post(`${API}/target-plans/${planId}/territories/${encodeURIComponent(territory.territory)}/cities`, payload, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`✓ ${territory.territory} saved! ${payload.length} cities, Rs ${total.toFixed(1)}L`, { duration: 4000 });
      setEditMode(false);
      setHasData(true);
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed');
    }
  };

  if (!editMode && hasData) {
    return (
      <div className="space-y-4">
        <div className="bg-primary/5 p-4 rounded-xl"><p className="font-semibold">{territory.territory}: Rs {targetL.toFixed(1)}L</p></div>
        {cities.map(c => {
          const v = parseFloat(vals[c.c]) || 0;
          if (v > 0) return <div key={c.c} className="flex justify-between bg-secondary p-3 rounded-lg"><span>{c.c} ({c.s})</span><span className="font-bold">Rs {v.toFixed(1)}L</span></div>;
          return null;
        })}
        <Button onClick={() => setEditMode(true)} variant="outline" className="w-full h-12 rounded-full"><Edit className="h-4 w-4 mr-2" />Edit</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 p-4 rounded-xl"><p className="font-semibold">{territory.territory}: Rs {targetL.toFixed(1)}L</p></div>
      {cities.map(c => (
        <div key={c.c} className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
          <div className="flex-1"><p className="font-medium">{c.c}</p><p className="text-xs text-muted-foreground">{c.s}</p></div>
          <Input type="number" value={vals[c.c] || ''} onChange={e => setVals({...vals, [c.c]: e.target.value})} placeholder="Lakhs" className="w-40 h-11 text-right font-semibold" />
        </div>
      ))}
      <div className={`p-4 rounded-xl ${valid ? 'bg-green-50 border-2 border-green-300' : 'bg-amber-50'}`}>
        <div className="flex justify-between"><span className="font-semibold">Total:</span><span className="text-2xl font-bold">Rs {total.toFixed(1)}L</span></div>
        {!valid && total > 0 && <p className="text-xs text-amber-800 mt-2">Must equal {targetL.toFixed(1)}L</p>}
      </div>
      <Button onClick={submit} disabled={!valid} className="w-full h-12 rounded-full">Save Cities</Button>
    </div>
  );
}

function ResourceAlloc({ planId, onNext }) {
  const [cities, setCities] = React.useState([]);
  const [team, setTeam] = React.useState([]);
  const [selected, setSelected] = React.useState(null);

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [h, u] = await Promise.all([
        axios.get(`${API}/target-plans/${planId}/hierarchy`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const allCities = [];
      if (h.data.territories) {
        for (const t of h.data.territories) {
          if (t.states) {
            for (const s of t.states) {
              if (s.cities) {
                for (const c of s.cities) {
                  allCities.push(c);
                }
              }
            }
          }
        }
      }
      
      setCities(allCities);
      if (allCities[0]) setSelected(allCities[0]);
      setTeam(u.data.filter(x => ['sales_rep', 'sales_manager'].includes(x.role)));
    } catch (err) {
      console.error(err);
    }
  };

  if (!selected) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {cities.map(c => (
          <Button key={c.id} variant={selected.id === c.id ? 'default' : 'outline'} onClick={() => setSelected(c)} size="sm" className="rounded-full">
            {c.city}
          </Button>
        ))}
      </div>
      <ResourceForm city={selected} planId={planId} team={team} onSuccess={loadData} />
      <div className="flex justify-end pt-6 border-t">
        <Button onClick={onNext} className="h-12 rounded-full px-8">View Summary & Finish</Button>
      </div>
    </div>
  );
}

function ResourceForm({ city, planId, team, onSuccess }) {
  const [vals, setVals] = React.useState({});
  const [loading, setLoading] = React.useState(false);

  const grouped = {
    'North India': team.filter(m => m.territory?.includes('North')),
    'South India': team.filter(m => m.territory?.includes('South')),
    'West India': team.filter(m => m.territory?.includes('West')),
    'East India': team.filter(m => m.territory?.includes('East')),
    'All India': team.filter(m => m.territory === 'All India')
  };

  const total = Object.values(vals).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const targetL = city.target_revenue / 100000;
  const valid = Math.abs(total - targetL) < 0.1 && total > 0;

  const submit = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = Object.keys(vals).filter(k => parseFloat(vals[k]) > 0).map(k => ({
        resource_id: k,
        target_revenue: parseFloat(vals[k]) * 100000
      }));

      await axios.post(`${API}/target-plans/${planId}/cities/${city.id}/resources`, payload, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`✓ ${payload.length} resources assigned! Rs ${total.toFixed(1)}L`, { duration: 4000 });
      onSuccess();
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
          <div><p className="font-semibold text-lg">{city.city}</p><p className="text-sm text-muted-foreground">{city.state}</p></div>
          <div className="text-right"><p className="text-2xl font-bold text-primary">Rs {targetL.toFixed(1)}L</p></div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">Resources can be from any territory:</p>
      
      {Object.keys(grouped).map(terrName => {
        const members = grouped[terrName];
        if (members.length === 0) return null;
        return (
          <div key={terrName} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase">{terrName}</p>
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-3 bg-secondary p-3 rounded-xl">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">{m.name[0]}</div>
                <div className="flex-1"><p className="font-medium text-sm">{m.name}</p><p className="text-xs text-muted-foreground">{m.designation}</p></div>
                <Input type="number" value={vals[m.id] || ''} onChange={e => setVals({...vals, [m.id]: e.target.value})} placeholder="Lakhs" className="w-32 h-10 text-right font-semibold" />
              </div>
            ))}
          </div>
        );
      })}

      <div className={`p-4 rounded-xl ${valid ? 'bg-green-50 border-2 border-green-300' : 'bg-amber-50'}`}>
        <div className="flex justify-between"><span className="font-semibold">Total:</span><span className="text-2xl font-bold">Rs {total.toFixed(1)}L</span></div>
        {!valid && total > 0 && <p className="text-xs text-amber-800 mt-2">Must equal {targetL.toFixed(1)}L</p>}
      </div>

      <Button onClick={submit} disabled={!valid || loading} className="w-full h-12 rounded-full">{loading ? 'Saving...' : 'Save Assignments'}</Button>
    </div>
  );
}

function ReviewScreen({ planId, onFinish }) {
  const [summary, setSummary] = React.useState(null);

  React.useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/target-plans/${planId}/resource-summary`, { headers: { Authorization: `Bearer ${token}` } });
      setSummary(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  if (!summary) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 p-6 rounded-2xl">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
          <div>
            <h3 className="text-lg font-semibold text-green-800">Allocation Complete!</h3>
            <p className="text-sm text-green-700">Review resource-wise targets below</p>
          </div>
        </div>
      </div>

      {summary.resources && summary.resources.length > 0 ? (
        summary.resources.map((r, i) => (
          <Card key={i} className="p-6 border rounded-2xl">
            <div className="flex justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">{r.resource_name[0]}</div>
                <div>
                  <p className="text-lg font-semibold">{r.resource_name}</p>
                  <p className="text-sm text-muted-foreground">{r.designation} • {r.territory}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Target</p>
                <p className="text-3xl font-bold text-primary">Rs {(r.total_target / 100000).toFixed(1)}L</p>
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3">City-wise Breakdown:</p>
              {r.city_breakdown.map((c, j) => (
                <div key={j} className="flex justify-between bg-secondary p-3 rounded-lg mb-2">
                  <span className="text-sm">{c.city} ({c.state})</span>
                  <span className="font-semibold">Rs {(c.target / 100000).toFixed(1)}L</span>
                </div>
              ))}
            </div>
          </Card>
        ))
      ) : (
        <div className="text-center py-12 bg-muted rounded-xl"><p className="text-muted-foreground">No assignments yet</p></div>
      )}

      <Button onClick={onFinish} className="w-full h-14 rounded-full">Finish & Return to Plans</Button>
    </div>
  );
}

function ViewRow({ label, value }) {
  return <div className="flex justify-between bg-secondary p-4 rounded-xl"><p className="font-medium">{label}</p><p className="text-xl font-bold text-primary">Rs {parseFloat(value).toFixed(1)}L</p></div>;
}

function EditRow({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
      <div className="flex-1"><p className="font-medium">{label}</p></div>
      <Input type="number" value={value} onChange={e => onChange(e.target.value)} placeholder="Lakhs" className="w-48 h-11 text-right font-semibold" />
      <span className="text-sm text-muted-foreground w-12">Lakhs</span>
    </div>
  );
}
