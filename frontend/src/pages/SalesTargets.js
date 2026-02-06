import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Plus, ArrowLeft, Table2, ChevronRight, ChevronDown } from 'lucide-react';

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

  if (page === 'create') return <CreatePage onBack={() => setPage('list')} />;
  if (page === 'gridview' && currentPlan) return <GridViewPage plan={currentPlan} onBack={() => setPage('list')} />;
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
            <div className="space-y-2">
              <Button onClick={() => { setCurrentPlan(p); setPage('gridview'); }} className="w-full rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white">
                <Table2 className="h-4 w-4 mr-2" />Grid View
              </Button>
              <div className="flex gap-2">
                <Button onClick={() => { setCurrentPlan(p); setPage('territories'); }} variant="outline" className="flex-1 rounded-full text-xs">Territories</Button>
                <Button onClick={() => { setCurrentPlan(p); setPage('cities'); }} variant="outline" className="flex-1 rounded-full text-xs">Cities</Button>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => { setCurrentPlan(p); setPage('resources'); }} variant="outline" className="flex-1 rounded-full text-xs">Resources</Button>
                <Button onClick={() => { setCurrentPlan(p); setPage('skus'); }} variant="outline" className="flex-1 rounded-full text-xs">SKUs</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function GridViewPage({ plan, onBack }) {
  const [hierarchy, setHierarchy] = React.useState(null);
  const [expanded, setExpanded] = React.useState({});

  React.useEffect(() => {
    loadHierarchy();
  }, []);

  const loadHierarchy = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans/' + plan.id + '/hierarchy', {
      headers: { Authorization: 'Bearer ' + token }
    });
    setHierarchy(res.data);
  };

  const toggleExpand = (key) => {
    setExpanded({...expanded, [key]: !expanded[key]});
  };

  if (!hierarchy) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full">
        <ArrowLeft className="h-4 w-4 mr-2" />Back to Plans
      </Button>

      <Card className="p-8 bg-primary/5 rounded-2xl">
        <div className="flex items-center gap-3 mb-2">
          <Table2 className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-semibold">{plan.plan_name} - Hierarchy Grid</h1>
        </div>
        <p className="text-muted-foreground">Complete allocation breakdown with drill-down</p>
      </Card>

      <Card className="p-6 border rounded-2xl overflow-x-auto">
        <table className="w-full">
          <thead className="bg-secondary">
            <tr className="border-b-2 border-border">
              <th className="text-left p-4 font-semibold">Level</th>
              <th className="text-left p-4 font-semibold">Name</th>
              <th className="text-right p-4 font-semibold">Allocation %</th>
              <th className="text-right p-4 font-semibold">Target (Rs)</th>
              <th className="text-right p-4 font-semibold">Allocated (Rs)</th>
              <th className="text-right p-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {/* Country Level */}
            <tr className="border-b bg-primary/5 font-bold">
              <td className="p-4">Country</td>
              <td className="p-4">India</td>
              <td className="text-right p-4">100%</td>
              <td className="text-right p-4 text-primary text-lg">Rs {(plan.country_target / 100000).toFixed(1)}L</td>
              <td className="text-right p-4">-</td>
              <td className="text-right p-4">
                <Badge className="bg-primary">Active</Badge>
              </td>
            </tr>

            {/* Territory Level */}
            {hierarchy.territories && hierarchy.territories.map(terr => (
              <React.Fragment key={terr.id}>
                <tr 
                  className="border-b hover:bg-secondary/50 cursor-pointer"
                  onClick={() => toggleExpand('terr-' + terr.id)}
                >
                  <td className="p-4 pl-8">
                    {expanded['terr-' + terr.id] ? <ChevronDown className="h-4 w-4 inline" /> : <ChevronRight className="h-4 w-4 inline" />}
                    {' '}Territory
                  </td>
                  <td className="p-4 font-medium">{terr.territory}</td>
                  <td className="text-right p-4">{terr.allocation_percentage?.toFixed(1)}%</td>
                  <td className="text-right p-4 font-semibold">Rs {(terr.target_revenue / 100000).toFixed(1)}L</td>
                  <td className="text-right p-4 text-muted-foreground">Rs {(terr.allocated_revenue / 100000).toFixed(1)}L</td>
                  <td className="text-right p-4">
                    {terr.allocated_revenue > 0 ? (
                      <Badge className="bg-green-100 text-green-800">
                        {((terr.allocated_revenue / terr.target_revenue) * 100).toFixed(0)}%
                      </Badge>
                    ) : (
                      <Badge variant="outline">0%</Badge>
                    )}
                  </td>
                </tr>

                {/* State Level (Roll-up) */}
                {expanded['terr-' + terr.id] && terr.states && terr.states.map(state => (
                  <React.Fragment key={state.state_name}>
                    <tr 
                      className="border-b bg-secondary/30"
                      onClick={() => toggleExpand('state-' + terr.id + '-' + state.state_name)}
                    >
                      <td className="p-4 pl-12 text-sm">
                        {expanded['state-' + terr.id + '-' + state.state_name] ? <ChevronDown className="h-4 w-4 inline" /> : <ChevronRight className="h-4 w-4 inline" />}
                        {' '}State
                      </td>
                      <td className="p-4 font-medium text-sm">{state.state_name}</td>
                      <td className="text-right p-4 text-sm text-muted-foreground">Roll-up</td>
                      <td className="text-right p-4 font-semibold text-sm">Rs {(state.state_target / 100000).toFixed(1)}L</td>
                      <td className="text-right p-4 text-sm">-</td>
                      <td className="text-right p-4">-</td>
                    </tr>

                    {/* City Level */}
                    {expanded['state-' + terr.id + '-' + state.state_name] && state.cities && state.cities.map(city => (
                      <tr key={city.id} className="border-b hover:bg-secondary/20">
                        <td className="p-4 pl-16 text-sm">City</td>
                        <td className="p-4 text-sm">{city.city}</td>
                        <td className="text-right p-4 text-sm">{city.allocation_percentage?.toFixed(1)}%</td>
                        <td className="text-right p-4 font-semibold text-sm text-primary">Rs {(city.target_revenue / 100000).toFixed(1)}L</td>
                        <td className="text-right p-4 text-sm">-</td>
                        <td className="text-right p-4">
                          <Badge variant="outline" className="text-xs">City</Badge>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="bg-primary/5 border border-primary/20 p-6 rounded-xl">
        <h4 className="font-semibold mb-3">Grid View Features:</h4>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>• Click rows to expand/collapse drill-down</li>
          <li>• Country → Territory → State (roll-up) → City</li>
          <li>• Shows allocation %, target amounts, and allocation status</li>
          <li>• States are auto-calculated roll-ups from cities</li>
        </ul>
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
    toast.success('Territories saved! Click Cities to continue.');
    onNext();
  };

  if (!loaded) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      <Card className="p-8 bg-primary/5 rounded-2xl">
        <h1 className="text-2xl font-semibold mb-2">{plan.plan_name}</h1>
        <p className="text-sm text-muted-foreground mb-3">Country Target (India)</p>
        <p className="text-4xl font-bold text-primary">Rs {(plan.country_target / 100000).toFixed(1)}L</p>
      </Card>
      <Card className="p-8 border rounded-2xl">
        <h2 className="text-xl font-semibold mb-6">Allocate Territories (%)</h2>
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
        <Button onClick={save} disabled={!valid} className="w-full h-14 rounded-full mt-6">Save Territories</Button>
      </Card>
    </div>
  );
}

function CitiesPage({ plan, onBack }) {
  const [tab, setTab] = React.useState('south');
  const [territories, setTerritories] = React.useState([]);
  
  React.useEffect(() => {
    loadTerritories();
  }, []);

  const loadTerritories = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans/' + plan.id + '/hierarchy', {
      headers: { Authorization: 'Bearer ' + token }
    });
    setTerritories(res.data.territories || []);
  };

  const getCurrentTerritory = () => {
    if (tab === 'south') return territories.find(t => t.territory === 'South India');
    if (tab === 'west') return territories.find(t => t.territory === 'West India');
    if (tab === 'north') return territories.find(t => t.territory === 'North India');
    if (tab === 'east') return territories.find(t => t.territory === 'East India');
    return null;
  };

  const currentTerritory = getCurrentTerritory();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="outline" onClick={onBack} className="rounded-full"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
      
      <Card className="p-8 bg-primary/5 rounded-2xl">
        <h1 className="text-2xl font-semibold mb-2">{plan.plan_name}</h1>
        <p className="text-4xl font-bold text-primary">Allocate Cities</p>
      </Card>

      <Card className="p-6 border rounded-2xl">
        <div className="flex gap-2 mb-6">
          <Button variant={tab === 'south' ? 'default' : 'outline'} onClick={() => setTab('south')} className="rounded-full">South India</Button>
          <Button variant={tab === 'west' ? 'default' : 'outline'} onClick={() => setTab('west')} className="rounded-full">West India</Button>
          <Button variant={tab === 'north' ? 'default' : 'outline'} onClick={() => setTab('north')} className="rounded-full">North India</Button>
          <Button variant={tab === 'east' ? 'default' : 'outline'} onClick={() => setTab('east')} className="rounded-full">East India</Button>
        </div>

        {currentTerritory && <CityForm planId={plan.id} territory={currentTerritory} onUpdate={loadTerritories} />}
      </Card>
    </div>
  );
}

function CityForm({ planId, territory, onUpdate }) {
  const [bengaluru, setBengaluru] = React.useState('');
  const [chennai, setChennai] = React.useState('');
  const [hyderabad, setHyderabad] = React.useState('');
  const [mumbai, setMumbai] = React.useState('');
  const [pune, setPune] = React.useState('');
  const [ahmedabad, setAhmedabad] = React.useState('');
  const [delhi, setDelhi] = React.useState('');
  const [noida, setNoida] = React.useState('');
  const [kolkata, setKolkata] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    loadExisting();
  }, [territory.id]);

  const loadExisting = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(API + '/target-plans/' + planId + '/hierarchy', {
      headers: { Authorization: 'Bearer ' + token }
    });

    const thisTerr = res.data.territories?.find(t => t.id === territory.id);
    if (thisTerr && thisTerr.states) {
      thisTerr.states.forEach(state => {
        if (state.cities) {
          state.cities.forEach(city => {
            const pct = city.allocation_percentage?.toString() || '';
            if (city.city === 'Bengaluru') setBengaluru(pct);
            if (city.city === 'Chennai') setChennai(pct);
            if (city.city === 'Hyderabad') setHyderabad(pct);
            if (city.city === 'Mumbai') setMumbai(pct);
            if (city.city === 'Pune') setPune(pct);
            if (city.city === 'Ahmedabad') setAhmedabad(pct);
            if (city.city === 'New Delhi') setDelhi(pct);
            if (city.city === 'Noida') setNoida(pct);
            if (city.city === 'Kolkata') setKolkata(pct);
          });
        }
      });
    }
    setLoaded(true);
  };

  let total = 0;
  let cities = [];
  const territoryTarget = territory.target_revenue / 100000;

  if (territory.territory === 'South India') {
    total = (parseFloat(bengaluru) || 0) + (parseFloat(chennai) || 0) + (parseFloat(hyderabad) || 0);
    cities = [
      {s: 'Karnataka', c: 'Bengaluru', val: bengaluru, set: setBengaluru},
      {s: 'Tamil Nadu', c: 'Chennai', val: chennai, set: setChennai},
      {s: 'Telangana', c: 'Hyderabad', val: hyderabad, set: setHyderabad}
    ];
  } else if (territory.territory === 'West India') {
    total = (parseFloat(mumbai) || 0) + (parseFloat(pune) || 0) + (parseFloat(ahmedabad) || 0);
    cities = [
      {s: 'Maharashtra', c: 'Mumbai', val: mumbai, set: setMumbai},
      {s: 'Maharashtra', c: 'Pune', val: pune, set: setPune},
      {s: 'Gujarat', c: 'Ahmedabad', val: ahmedabad, set: setAhmedabad}
    ];
  } else if (territory.territory === 'North India') {
    total = (parseFloat(delhi) || 0) + (parseFloat(noida) || 0);
    cities = [
      {s: 'Delhi', c: 'New Delhi', val: delhi, set: setDelhi},
      {s: 'Uttar Pradesh', c: 'Noida', val: noida, set: setNoida}
    ];
  } else if (territory.territory === 'East India') {
    total = parseFloat(kolkata) || 0;
    cities = [{s: 'West Bengal', c: 'Kolkata', val: kolkata, set: setKolkata}];
  }

  const valid = Math.abs(total - 100) < 0.1;

  const save = async () => {
    const token = localStorage.getItem('token');
    const payload = cities
      .filter(c => parseFloat(c.val) > 0)
      .map(c => ({ state: c.s, city: c.c, allocation_percentage: parseFloat(c.val) }));

    await axios.post(API + '/target-plans/' + planId + '/territories/' + encodeURIComponent(territory.territory) + '/cities', payload, {
      headers: { Authorization: 'Bearer ' + token }
    });
    toast.success(territory.territory + ' cities saved!');
    onUpdate();
  };

  if (!loaded) return <div className="text-center py-8">Loading existing allocations...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/20 p-6 rounded-2xl">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Territory Target</p>
            <h3 className="text-3xl font-bold text-primary">{territory.territory}</h3>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">Total Revenue Target</p>
            <p className="text-4xl font-bold text-foreground">Rs {territoryTarget.toFixed(1)}L</p>
          </div>
        </div>
        <div className="bg-white/50 p-3 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>Instructions:</strong> Allocate {territory.territory}'s Rs {territoryTarget.toFixed(1)}L target across cities using percentages. Each city's % will be calculated as a portion of this Rs {territoryTarget.toFixed(1)}L.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {cities.map(city => {
          const cityAmount = (parseFloat(city.val) || 0) / 100 * territoryTarget;
          return (
            <div key={city.c} className="bg-card border-2 border-border p-5 rounded-xl">
              <div className="flex items-center gap-4 mb-3">
                <div className="flex-1">
                  <p className="font-semibold text-lg">{city.c}</p>
                  <p className="text-xs text-muted-foreground">{city.s}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    value={city.val}
                    onChange={e => city.set(e.target.value)}
                    placeholder="Enter %"
                    className="w-28 h-12 text-right font-bold text-xl"
                  />
                  <span className="font-bold text-lg w-8">%</span>
                </div>
              </div>
              <div className="bg-primary/5 p-3 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">City Target Amount:</span>
                  <span className="text-2xl font-bold text-primary">Rs {cityAmount.toFixed(1)}L</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {city.val}% of {territory.territory}'s Rs {territoryTarget.toFixed(1)}L
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`p-6 rounded-xl border-2 ${valid && total > 0 ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
        <div className="flex justify-between items-center mb-3">
          <span className="font-semibold text-lg">Total Percentage:</span>
          <span className="text-4xl font-bold">{total.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total Revenue:</span>
          <span className="text-2xl font-semibold text-primary">Rs {(total / 100 * territoryTarget).toFixed(1)}L</span>
        </div>
        {!valid && total > 0 && <p className="text-sm text-amber-800 mt-3">⚠ Must equal 100% to match territory target of Rs {territoryTarget.toFixed(1)}L</p>}
        {valid && <p className="text-sm text-green-800 mt-3">✓ Perfect! Total matches territory target</p>}
      </div>

      <Button onClick={save} disabled={!valid} className="w-full h-14 rounded-full text-base font-semibold">
        Save {territory.territory} City Allocation
      </Button>
    </div>
  );
}

function ResourcesPage({ plan, onBack }) {
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
        <p className="text-xl font-bold text-primary">Resource Allocation by City</p>
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

        {currentCity && <ResourceForm planId={plan.id} city={currentCity} onUpdate={loadCities} />}
      </Card>
    </div>
  );
}

function ResourceForm({ planId, city, onUpdate }) {
  const [salesTeam, setSalesTeam] = React.useState([]);
  const [allocations, setAllocations] = React.useState({});
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    // Reset allocations when city changes
    setAllocations({});
    setLoaded(false);
    
    // Load data for new city
    loadData();
  }, [city.id]);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Load sales team
      const teamRes = await axios.get(API + '/users', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const team = teamRes.data.filter(u => ['sales_rep', 'sales_manager'].includes(u.role));
      setSalesTeam(team);

      // Load existing resource allocations for this city
      const resRes = await axios.get(API + '/target-plans/' + planId + '/hierarchy', {
        headers: { Authorization: 'Bearer ' + token }
      });

      // Find resource targets in hierarchy (if they exist)
      // For now, they're not in hierarchy, so we'd need a separate endpoint or accept empty state
      
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load data');
      setLoaded(true);
    }
  };

  // Group resources by territory
  const grouped = {
    'North India': salesTeam.filter(m => m.territory?.includes('North')),
    'South India': salesTeam.filter(m => m.territory?.includes('South')),
    'West India': salesTeam.filter(m => m.territory?.includes('West')),
    'East India': salesTeam.filter(m => m.territory?.includes('East')),
    'All India': salesTeam.filter(m => m.territory === 'All India')
  };

  const updateAllocation = (resourceId, value) => {
    const newAllocations = {...allocations};
    newAllocations[resourceId] = value;
    setAllocations(newAllocations);
  };

  const total = Object.values(allocations).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const cityTarget = city.target_revenue / 100000;
  const valid = Math.abs(total - 100) < 0.1 && total > 0;

  const save = async () => {
    const token = localStorage.getItem('token');
    const payload = Object.keys(allocations)
      .filter(id => parseFloat(allocations[id]) > 0)
      .map(id => ({
        resource_id: id,
        allocation_percentage: parseFloat(allocations[id])
      }));

    await axios.post(
      API + '/target-plans/' + planId + '/cities/' + city.id + '/resources',
      payload,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    toast.success(city.city + ' resources saved!');
    onUpdate();
  };

  if (!loaded) return <div className="text-center py-8">Loading resources...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/20 p-6 rounded-2xl">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Assigning Resources to</p>
            <h3 className="text-2xl font-bold">{city.city}</h3>
            <p className="text-xs text-muted-foreground">{city.state}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">City Revenue Target</p>
            <p className="text-4xl font-bold text-primary">Rs {cityTarget.toFixed(1)}L</p>
          </div>
        </div>
        <div className="bg-white/50 p-3 rounded-lg mt-4">
          <p className="text-xs text-muted-foreground">
            <strong>Assign WHO sells:</strong> Each resource can be assigned a % of this city's target. Same resource can have different % across multiple cities.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {Object.keys(grouped).map(terrName => {
          const members = grouped[terrName];
          if (members.length === 0) return null;

          return (
            <div key={terrName} className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-secondary px-3 py-1 rounded-full inline-block">
                {terrName}
              </p>
              {members.map(resource => {
                const resAmount = (parseFloat(allocations[resource.id]) || 0) / 100 * cityTarget;
                return (
                  <div key={resource.id} className="bg-card border-2 border-border p-4 rounded-xl">
                    <div className="flex items-center gap-4 mb-2">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {resource.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{resource.name}</p>
                        <p className="text-xs text-muted-foreground">{resource.designation}</p>
                      </div>
                      <Input
                        type="number"
                        value={allocations[resource.id] || ''}
                        onChange={e => updateAllocation(resource.id, e.target.value)}
                        placeholder="%"
                        className="w-28 h-11 text-right font-bold text-xl"
                      />
                      <span className="font-bold text-lg w-8">%</span>
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
      </div>

      <div className={`p-6 rounded-xl border-2 ${valid ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
        <div className="flex justify-between items-center mb-3">
          <span className="font-semibold text-lg">Total Resource Allocation:</span>
          <span className="text-4xl font-bold">{total.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total Revenue Covered:</span>
          <span className="text-2xl font-semibold text-primary">Rs {(total / 100 * cityTarget).toFixed(1)}L</span>
        </div>
        {!valid && total > 0 && (
          <p className="text-sm text-amber-800 mt-3">⚠ Must equal 100% to fully allocate Rs {cityTarget.toFixed(1)}L</p>
        )}
        {valid && (
          <p className="text-sm text-green-800 mt-3">✓ Perfect! Full city target allocated</p>
        )}
      </div>

      <Button onClick={save} disabled={!valid} className="w-full h-14 rounded-full text-base font-semibold">
        Save {city.city} Resource Allocation
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
        <p className="text-xl font-bold text-primary">SKU Allocation by City</p>
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

        {currentCity && <SKUForm planId={plan.id} city={currentCity} onUpdate={loadCities} />}
      </Card>
    </div>
  );
}

function SKUForm({ planId, city, onUpdate }) {
  const [s660silver, setS660silver] = React.useState('');
  const [s660gold, setS660gold] = React.useState('');
  const [s330silver, setS330silver] = React.useState('');
  const [s330gold, setS330gold] = React.useState('');
  const [s660spark, setS660spark] = React.useState('');
  const [s330spark, setS330spark] = React.useState('');
  const [s24brand, setS24brand] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    // Reset all values when city changes
    setS660silver('');
    setS660gold('');
    setS330silver('');
    setS330gold('');
    setS660spark('');
    setS330spark('');
    setS24brand('');
    setLoaded(false);
    
    // Load data for new city
    loadExistingSKUs();
  }, [city.id]);

  const loadExistingSKUs = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(API + '/target-plans/' + planId + '/cities/' + city.id + '/skus', {
        headers: { Authorization: 'Bearer ' + token }
      });

      if (res.data.skus) {
        res.data.skus.forEach(sku => {
          const pct = sku.allocation_percentage?.toString() || '';
          if (sku.sku_name === '660 ml Silver') setS660silver(pct);
          if (sku.sku_name === '660 ml Gold') setS660gold(pct);
          if (sku.sku_name === '330 ml Silver') setS330silver(pct);
          if (sku.sku_name === '330 ml Gold') setS330gold(pct);
          if (sku.sku_name === '660 Sparkling') setS660spark(pct);
          if (sku.sku_name === '330 Sparkling') setS330spark(pct);
          if (sku.sku_name === '24 Brand') setS24brand(pct);
        });
      }
      
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load SKUs');
      setLoaded(true);
    }
  };

  const skus = [
    {name: '660 ml Silver', val: s660silver, set: setS660silver},
    {name: '660 ml Gold', val: s660gold, set: setS660gold},
    {name: '330 ml Silver', val: s330silver, set: setS330silver},
    {name: '330 ml Gold', val: s330gold, set: setS330gold},
    {name: '660 Sparkling', val: s660spark, set: setS660spark},
    {name: '330 Sparkling', val: s330spark, set: setS330spark},
    {name: '24 Brand', val: s24brand, set: setS24brand}
  ];

  const total = skus.reduce((sum, sku) => sum + (parseFloat(sku.val) || 0), 0);
  const cityTarget = city.target_revenue / 100000;
  const valid = Math.abs(total - 100) < 0.1 && total > 0;

  const save = async () => {
    const token = localStorage.getItem('token');
    const payload = skus
      .filter(sku => parseFloat(sku.val) > 0)
      .map(sku => ({
        sku_name: sku.name,
        allocation_percentage: parseFloat(sku.val)
      }));

    await axios.post(
      API + '/target-plans/' + planId + '/cities/' + city.id + '/skus',
      payload,
      { headers: { Authorization: 'Bearer ' + token } }
    );
    toast.success(city.city + ' SKUs saved!');
    onUpdate();
  };

  if (!loaded) return <div className="text-center py-8">Loading SKU allocations...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/20 p-6 rounded-2xl">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Allocating SKUs for</p>
            <h3 className="text-2xl font-bold">{city.city}</h3>
            <p className="text-xs text-muted-foreground">{city.state}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">City Revenue Target</p>
            <p className="text-4xl font-bold text-primary">Rs {cityTarget.toFixed(1)}L</p>
          </div>
        </div>
        <div className="bg-white/50 p-3 rounded-lg mt-4">
          <p className="text-xs text-muted-foreground">
            <strong>Assign percentages to SKUs</strong> - What product mix will achieve this city's target? Each SKU's % represents its contribution to the Rs {cityTarget.toFixed(1)}L goal.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {skus.map(sku => {
          const skuAmount = (parseFloat(sku.val) || 0) / 100 * cityTarget;
          return (
            <div key={sku.name} className="bg-card border-2 border-border p-4 rounded-xl">
              <div className="flex items-center gap-4 mb-2">
                <div className="flex-1">
                  <p className="font-semibold">{sku.name}</p>
                </div>
                <Input
                  type="number"
                  value={sku.val}
                  onChange={e => sku.set(e.target.value)}
                  placeholder="%"
                  className="w-28 h-11 text-right font-bold text-xl"
                />
                <span className="font-bold text-lg w-8">%</span>
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
      </div>

      <div className={`p-6 rounded-xl border-2 ${valid ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
        <div className="flex justify-between items-center mb-3">
          <span className="font-semibold text-lg">Total SKU Allocation:</span>
          <span className="text-4xl font-bold">{total.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total Revenue Covered:</span>
          <span className="text-2xl font-semibold text-primary">Rs {(total / 100 * cityTarget).toFixed(1)}L</span>
        </div>
        {!valid && total > 0 && (
          <p className="text-sm text-amber-800 mt-3">⚠ Must equal 100% to fully allocate Rs {cityTarget.toFixed(1)}L</p>
        )}
        {valid && (
          <p className="text-sm text-green-800 mt-3">✓ Perfect! Full city target allocated</p>
        )}
      </div>

      <Button onClick={save} disabled={!valid} className="w-full h-14 rounded-full text-base font-semibold">
        Save {city.city} SKU Allocation
      </Button>
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
