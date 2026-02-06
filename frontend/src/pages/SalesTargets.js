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
  const [currentTerritory, setCurrentTerritory] = React.useState(null);

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

  const openAllocate = (plan) => {
    setCurrentPlan(plan);
    setPage('territories');
  };

  const openCities = (plan) => {
    setCurrentPlan(plan);
    setPage('cities');
  };

  if (page === 'create') return <CreatePage onBack={() => setPage('list')} />;
  if (page === 'territories' && currentPlan) return <TerritoriesPage plan={currentPlan} onBack={() => setPage('list')} onNext={openCities} />;
  if (page === 'cities' && currentPlan) return <CitiesPage plan={currentPlan} onBack={() => setPage('list')} />;

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
            <div className="flex gap-2">
              <Button onClick={() => openAllocate(p)} variant="outline" className="flex-1 rounded-full">Territories</Button>
              <Button onClick={() => openCities(p)} variant="outline" className="flex-1 rounded-full">Cities</Button>
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
      <Button variant="outline" onClick={onBack} className="rounded-full">
        <ArrowLeft className="h-4 w-4 mr-2" />Back
      </Button>
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
    onNext(plan);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-8 bg-primary/5 rounded-2xl">
        <h1 className="text-2xl font-semibold mb-2">{plan.plan_name}</h1>
        <p className="text-4xl font-bold text-primary">Rs {(plan.country_target / 100000).toFixed(1)}L</p>
      </Card>
      <Card className="p-8 border rounded-2xl">
        <h2 className="text-xl font-semibold mb-6">Allocate Territories (%)</h2>
        <div className="space-y-4">
          <TerritoryRow label="North India" value={n} onChange={setN} target={plan.country_target} />
          <TerritoryRow label="South India" value={s} onChange={setS} target={plan.country_target} />
          <TerritoryRow label="West India" value={w} onChange={setW} target={plan.country_target} />
          <TerritoryRow label="East India" value={e} onChange={setE} target={plan.country_target} />
        </div>
        <div className={`p-5 rounded-xl mt-6 ${valid && total > 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
          <div className="flex justify-between mb-2">
            <span className="font-semibold">Total:</span>
            <span className="text-3xl font-bold">{total.toFixed(1)}%</span>
          </div>
          {!valid && total > 0 && <p className="text-sm text-amber-800">Must = 100%</p>}
          {valid && <p className="text-sm text-green-800">✓ Perfect!</p>}
        </div>
        <Button onClick={save} disabled={!valid} className="w-full h-14 rounded-full mt-6">Save & Continue to Cities</Button>
      </Card>
    </div>
  );
}

function CitiesPage({ plan, onBack }) {
  const [currentTab, setCurrentTab] = React.useState('south');
  
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-8 bg-primary/5 rounded-2xl">
        <h1 className="text-2xl font-semibold mb-2">{plan.plan_name}</h1>
        <p className="text-xl font-bold text-primary">Allocate Cities</p>
      </Card>

      <Card className="p-6 border rounded-2xl">
        <div className="flex gap-2 mb-6">
          <Button variant={currentTab === 'south' ? 'default' : 'outline'} onClick={() => setCurrentTab('south')} className="rounded-full">South India</Button>
          <Button variant={currentTab === 'west' ? 'default' : 'outline'} onClick={() => setCurrentTab('west')} className="rounded-full">West India</Button>
          <Button variant={currentTab === 'north' ? 'default' : 'outline'} onClick={() => setCurrentTab('north')} className="rounded-full">North India</Button>
          <Button variant={currentTab === 'east' ? 'default' : 'outline'} onClick={() => setCurrentTab('east')} className="rounded-full">East India</Button>
        </div>

        {currentTab === 'south' && <CityForm planId={plan.id} territory="South India" />}
        {currentTab === 'west' && <CityForm planId={plan.id} territory="West India" />}
        {currentTab === 'north' && <CityForm planId={plan.id} territory="North India" />}
        {currentTab === 'east' && <CityForm planId={plan.id} territory="East India" />}
      </Card>
    </div>
  );
}

function CityForm({ planId, territory }) {
  const [bengaluru, setBengaluru] = React.useState('');
  const [chennai, setChennai] = React.useState('');
  const [hyderabad, setHyderabad] = React.useState('');
  const [mumbai, setMumbai] = React.useState('');
  const [pune, setPune] = React.useState('');
  const [ahmedabad, setAhmedabad] = React.useState('');
  const [delhi, setDelhi] = React.useState('');
  const [noida, setNoida] = React.useState('');
  const [kolkata, setKolkata] = React.useState('');

  let total = 0;
  let cities = [];

  if (territory === 'South India') {
    total = (parseFloat(bengaluru) || 0) + (parseFloat(chennai) || 0) + (parseFloat(hyderabad) || 0);
    cities = [
      {s: 'Karnataka', c: 'Bengaluru', val: bengaluru, set: setBengaluru},
      {s: 'Tamil Nadu', c: 'Chennai', val: chennai, set: setChennai},
      {s: 'Telangana', c: 'Hyderabad', val: hyderabad, set: setHyderabad}
    ];
  } else if (territory === 'West India') {
    total = (parseFloat(mumbai) || 0) + (parseFloat(pune) || 0) + (parseFloat(ahmedabad) || 0);
    cities = [
      {s: 'Maharashtra', c: 'Mumbai', val: mumbai, set: setMumbai},
      {s: 'Maharashtra', c: 'Pune', val: pune, set: setPune},
      {s: 'Gujarat', c: 'Ahmedabad', val: ahmedabad, set: setAhmedabad}
    ];
  } else if (territory === 'North India') {
    total = (parseFloat(delhi) || 0) + (parseFloat(noida) || 0);
    cities = [
      {s: 'Delhi', c: 'New Delhi', val: delhi, set: setDelhi},
      {s: 'Uttar Pradesh', c: 'Noida', val: noida, set: setNoida}
    ];
  } else if (territory === 'East India') {
    total = parseFloat(kolkata) || 0;
    cities = [{s: 'West Bengal', c: 'Kolkata', val: kolkata, set: setKolkata}];
  }

  const valid = Math.abs(total - 100) < 0.1;

  const save = async () => {
    const token = localStorage.getItem('token');
    const payload = cities
      .filter(c => parseFloat(c.val) > 0)
      .map(c => ({ state: c.s, city: c.c, allocation_percentage: parseFloat(c.val) }));

    await axios.post(API + '/target-plans/' + planId + '/territories/' + encodeURIComponent(territory) + '/cities', payload, {
      headers: { Authorization: 'Bearer ' + token }
    });
    toast.success(territory + ' cities saved!');
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">{territory}</h3>
      <p className="text-sm text-muted-foreground">Enter % for each city (must total 100%)</p>

      {cities.map(city => (
        <div key={city.c} className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
          <div className="flex-1">
            <p className="font-medium">{city.c}</p>
            <p className="text-xs text-muted-foreground">{city.s}</p>
          </div>
          <Input
            type="number"
            value={city.val}
            onChange={e => city.set(e.target.value)}
            placeholder="%"
            className="w-32 h-11 text-right font-semibold text-lg"
          />
          <span className="w-8">%</span>
        </div>
      ))}

      <div className={`p-4 rounded-xl ${valid && total > 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
        <div className="flex justify-between">
          <span className="font-semibold">Total:</span>
          <span className="text-2xl font-bold">{total.toFixed(1)}%</span>
        </div>
        {!valid && total > 0 && <p className="text-xs text-amber-800 mt-2">Must = 100%</p>}
        {valid && <p className="text-xs text-green-800 mt-2">✓ Perfect!</p>}
      </div>

      <Button onClick={save} disabled={!valid} className="w-full h-12 rounded-full">
        Save {territory} Cities
      </Button>
    </div>
  );
}

function TerritoryRow({ label, value, onChange, target }) {
  return (
    <div className="flex items-center gap-4 bg-secondary p-4 rounded-xl">
      <div className="flex-1"><p className="font-medium">{label}</p></div>
      <Input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="%"
        className="w-32 h-11 text-right font-semibold text-lg"
      />
      <span className="w-8">%</span>
      <span className="w-24 text-right text-muted-foreground text-sm">
        Rs {((parseFloat(value) || 0) / 100 * target / 100000).toFixed(1)}L
      </span>
    </div>
  );
}
