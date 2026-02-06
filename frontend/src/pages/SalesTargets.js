import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function SalesTargets() {
  const [plans, setPlans] = React.useState([]);
  const [showCreate, setShowCreate] = React.useState(false);

  React.useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans', {
      headers: { Authorization: 'Bearer ' + token }
    });
    setPlans(res.data);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-4xl font-light mb-2">Sales Targets</h1>
          <p className="text-muted-foreground">Revenue target planning</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} className="h-12 rounded-full">
          <Plus className="h-5 w-5 mr-2" />
          {showCreate ? 'Cancel' : 'New Plan'}
        </Button>
      </div>

      {showCreate && (
        <Card className="p-8 border rounded-2xl">
          <h2 className="text-xl font-semibold mb-6">Create Target Plan</h2>
          <CreateForm onDone={() => { setShowCreate(false); loadPlans(); }} />
        </Card>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map(p => (
          <Card key={p.id} className="p-6 border rounded-2xl">
            <h3 className="text-lg font-semibold mb-2">{p.plan_name}</h3>
            <p className="text-sm text-muted-foreground mb-4 capitalize">{p.time_period}</p>
            <p className="text-3xl font-bold text-primary">Rs {(p.country_target / 100000).toFixed(1)}L</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CreateForm({ onDone }) {
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
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label>Plan Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Period</Label>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="w-full h-10 px-3 rounded-md border">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half_yearly">Half-Yearly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <Label>Target (Lakhs)</Label>
          <Input type="number" value={target} onChange={e => setTarget(e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Start</Label>
          <Input type="date" value={start} onChange={e => setStart(e.target.value)} required />
        </div>
        <div>
          <Label>End</Label>
          <Input type="date" value={end} onChange={e => setEnd(e.target.value)} required />
        </div>
      </div>
      <Button type="submit" className="w-full h-12 rounded-full">Create</Button>
    </form>
  );
}
