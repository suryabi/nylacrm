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
  const [selectedPlan, setSelectedPlan] = React.useState(null);

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

  if (page === 'create') {
    return <CreatePage onBack={() => setPage('list')} />;
  }

  if (page === 'allocate' && selectedPlan) {
    return <AllocatePage plan={selectedPlan} onBack={() => setPage('list')} />;
  }

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
        {plans.length > 0 && plans[0] && (
          <Card key={plans[0].id} className="p-6 border rounded-2xl">
            <h3 className="font-semibold mb-2">{plans[0].plan_name}</h3>
            <p className="text-sm text-muted-foreground mb-4">{plans[0].time_period}</p>
            <p className="text-3xl font-bold text-primary mb-4">Rs {(plans[0].country_target / 100000).toFixed(1)}L</p>
            <Button onClick={() => { setSelectedPlan(plans[0]); setPage('allocate'); }} className="w-full rounded-full">Allocate</Button>
          </Card>
        )}
        {plans.length > 1 && plans[1] && (
          <Card key={plans[1].id} className="p-6 border rounded-2xl">
            <h3 className="font-semibold mb-2">{plans[1].plan_name}</h3>
            <p className="text-sm text-muted-foreground mb-4">{plans[1].time_period}</p>
            <p className="text-3xl font-bold text-primary mb-4">Rs {(plans[1].country_target / 100000).toFixed(1)}L</p>
            <Button onClick={() => { setSelectedPlan(plans[1]); setPage('allocate'); }} className="w-full rounded-full">Allocate</Button>
          </Card>
        )}
        {plans.length > 2 && plans[2] && (
          <Card key={plans[2].id} className="p-6 border rounded-2xl">
            <h3 className="font-semibold mb-2">{plans[2].plan_name}</h3>
            <p className="text-sm text-muted-foreground mb-4">{plans[2].time_period}</p>
            <p className="text-3xl font-bold text-primary mb-4">Rs {(plans[2].country_target / 100000).toFixed(1)}L</p>
            <Button onClick={() => { setSelectedPlan(plans[2]); setPage('allocate'); }} className="w-full rounded-full">Allocate</Button>
          </Card>
        )}
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
      <Button variant="outline" onClick={onBack} className="rounded-full">
        <ArrowLeft className="h-4 w-4 mr-2" />Back
      </Button>
      <Card className="p-8 border rounded-2xl">
        <h1 className="text-2xl font-semibold mb-6">Create Plan</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Plan Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Q1 2026" required className="h-12" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Period</Label>
              <select value={period} onChange={e => setPeriod(e.target.value)} className="w-full h-12 px-4 rounded-xl border">
                <option value="quarterly">Quarterly</option>
                <option value="monthly">Monthly</option>
                <option value="half_yearly">Half-Yearly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <Label>Target (Lakhs)</Label>
              <Input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="500" required className="h-12" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={start} onChange={e => setStart(e.target.value)} required className="h-12" />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={end} onChange={e => setEnd(e.target.value)} required className="h-12" />
            </div>
          </div>
          <Button type="submit" className="w-full h-14 rounded-full">Create Plan</Button>
        </form>
      </Card>
    </div>
  );
}

function AllocatePage({ plan, onBack }) {
  const [north, setNorth] = React.useState('');
  const [south, setSouth] = React.useState('');
  const [west, setWest] = React.useState('');
  const [east, setEast] = React.useState('');

  const total = (parseFloat(north) || 0) + (parseFloat(south) || 0) + (parseFloat(west) || 0) + (parseFloat(east) || 0);
  const valid = Math.abs(total - 100) < 0.1;

  const save = async () => {
    const token = localStorage.getItem('token');
    const data = [];
    if (parseFloat(north) > 0) data.push({ territory: 'North India', allocation_percentage: parseFloat(north) });
    if (parseFloat(south) > 0) data.push({ territory: 'South India', allocation_percentage: parseFloat(south) });
    if (parseFloat(west) > 0) data.push({ territory: 'West India', allocation_percentage: parseFloat(west) });
    if (parseFloat(east) > 0) data.push({ territory: 'East India', allocation_percentage: parseFloat(east) });

    await axios.post(API + '/target-plans/' + plan.id + '/territories', data, {
      headers: { Authorization: 'Bearer ' + token }
    });
    toast.success('Territories allocated!');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full">
        <ArrowLeft className="h-4 w-4 mr-2" />Back
      </Button>

      <Card className="p-8 bg-primary/5 border-primary/20 rounded-2xl">
        <h1 className="text-2xl font-semibold mb-2">{plan.plan_name}</h1>
        <p className="text-4xl font-bold text-primary">Rs {(plan.country_target / 100000).toFixed(1)}L</p>
      </Card>

      <Card className="p-8 border rounded-2xl">
        <h2 className="text-xl font-semibold mb-6">Allocate to Territories</h2>
        <p className="text-sm text-muted-foreground mb-6">Enter percentages (must total 100%)</p>

        <div className="space-y-4">
          <div className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
            <div className="flex-1"><p className="font-medium">North India</p></div>
            <Input type="number" value={north} onChange={e => setNorth(e.target.value)} placeholder="%" className="w-32 h-11 text-right font-semibold text-lg" />
            <span className="w-8">%</span>
            <span className="w-24 text-right text-muted-foreground">Rs {((parseFloat(north) || 0) / 100 * plan.country_target / 100000).toFixed(1)}L</span>
          </div>

          <div className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
            <div className="flex-1"><p className="font-medium">South India</p></div>
            <Input type="number" value={south} onChange={e => setSouth(e.target.value)} placeholder="%" className="w-32 h-11 text-right font-semibold text-lg" />
            <span className="w-8">%</span>
            <span className="w-24 text-right text-muted-foreground">Rs {((parseFloat(south) || 0) / 100 * plan.country_target / 100000).toFixed(1)}L</span>
          </div>

          <div className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
            <div className="flex-1"><p className="font-medium">West India</p></div>
            <Input type="number" value={west} onChange={e => setWest(e.target.value)} placeholder="%" className="w-32 h-11 text-right font-semibold text-lg" />
            <span className="w-8">%</span>
            <span className="w-24 text-right text-muted-foreground">Rs {((parseFloat(west) || 0) / 100 * plan.country_target / 100000).toFixed(1)}L</span>
          </div>

          <div className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
            <div className="flex-1"><p className="font-medium">East India</p></div>
            <Input type="number" value={east} onChange={e => setEast(e.target.value)} placeholder="%" className="w-32 h-11 text-right font-semibold text-lg" />
            <span className="w-8">%</span>
            <span className="w-24 text-right text-muted-foreground">Rs {((parseFloat(east) || 0) / 100 * plan.country_target / 100000).toFixed(1)}L</span>
          </div>
        </div>

        <div className={`p-5 rounded-xl mt-6 ${valid && total > 0 ? 'bg-green-50 border-2 border-green-300' : 'bg-amber-50 border-2 border-amber-300'}`}>
          <div className="flex justify-between mb-2">
            <span className="font-semibold">Total:</span>
            <span className="text-3xl font-bold">{total.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Equals:</span>
            <span className="font-semibold">Rs {(total / 100 * plan.country_target / 100000).toFixed(1)}L</span>
          </div>
          {!valid && total > 0 && <p className="text-sm text-amber-800 mt-2">Must equal 100%</p>}
          {valid && <p className="text-sm text-green-800 mt-2">✓ Perfect!</p>}
        </div>

        <Button onClick={save} disabled={!valid} className="w-full h-14 rounded-full text-base mt-6">
          Save Territory Allocation
        </Button>
      </Card>
    </div>
  );
}
