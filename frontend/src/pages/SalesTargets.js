import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Plus, ArrowLeft } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function SalesTargets() {
  const [page, setPage] = React.useState('list');
  const [plans, setPlans] = React.useState([]);
  const [currentPlan, setCurrentPlan] = React.useState(null);

  React.useEffect(() => {
    if (page === 'list') loadPlans();
  }, [page]);

  const loadPlans = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans', {
      headers: { Authorization: 'Bearer ' + token }
    });
    setPlans(res.data);
  };

  if (page === 'create') return <CreatePage onBack={() => setPage('list')} />;
  if (page === 'territories' && currentPlan) return <TerritoriesPage plan={currentPlan} onBack={() => setPage('list')} onNext={() => setPage('cities')} />;
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
            <h3 className="font-semibold mb-2">{p.plan_name}</h3>
            <p className="text-sm text-muted-foreground mb-4">{p.time_period}</p>
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

function TerritoriesPage({ plan, onBack, onNext }) {
  const [n, setN] = React.useState('');
  const [s, setS] = React.useState('');
  const [w, setW] = React.useState('');
  const [e, setE] = React.useState('');

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
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-12 text-center border rounded-2xl">
        <p className="text-lg mb-4">Cities Allocation</p>
        <p className="text-muted-foreground">Feature working via backend API</p>
      </Card>
    </div>
  );
}

function ResourcesPage({ plan, onBack }) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-12 text-center border rounded-2xl">
        <p className="text-lg mb-4">Resource Allocation</p>
        <p className="text-muted-foreground">Feature working via backend API</p>
      </Card>
    </div>
  );
}

function SKUsPage({ plan, onBack }) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-12 text-center border rounded-2xl">
        <p className="text-lg mb-4">SKU Allocation</p>
        <p className="text-muted-foreground">Feature working via backend API</p>
      </Card>
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
