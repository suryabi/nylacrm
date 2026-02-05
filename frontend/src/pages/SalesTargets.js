import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Target, Edit, ChevronRight, ChevronDown, AlertCircle, CheckCircle2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

export default function SalesTargets() {
  const [plans, setPlans] = React.useState([]);
  const [selectedPlan, setSelectedPlan] = React.useState(null);
  const [hierarchy, setHierarchy] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [createDialog, setCreateDialog] = React.useState(false);
  const [allocDialog, setAllocDialog] = React.useState(false);
  const [cityDialog, setCityDialog] = React.useState(false);
  const [selectedTerritory, setSelectedTerritory] = React.useState(null);

  React.useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/target-plans`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPlans(res.data);
      if (res.data[0]) {
        selectPlan(res.data[0]);
      }
    } catch (error) {
      toast.error('Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  const selectPlan = async (plan) => {
    setSelectedPlan(plan);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/target-plans/${plan.id}/hierarchy`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setHierarchy(res.data);
    } catch (error) {
      console.error('Failed to load hierarchy');
    }
  };

  const openCityAlloc = (terr) => {
    setSelectedTerritory(terr);
    setCityDialog(true);
  };

  if (loading) return <div className="flex justify-center py-12">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-4xl font-light mb-2">Sales Target Planning</h1>
          <p className="text-muted-foreground">Revenue allocation & tracking</p>
        </div>
        <Dialog open={createDialog} onOpenChange={setCreateDialog}>
          <DialogTrigger asChild>
            <Button className="h-12 rounded-full">
              <Plus className="h-5 w-5 mr-2" />Create Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Create Target Plan</DialogTitle></DialogHeader>
            <CreateForm onDone={() => { setCreateDialog(false); loadPlans(); }} />
          </DialogContent>
        </Dialog>
      </div>

      {plans.length === 0 ? (
        <Card className="p-12 text-center border rounded-2xl">
          <Target className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No plans yet</p>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-4 gap-6">
          <Card className="p-6 border rounded-2xl">
            <h2 className="font-semibold mb-4">Plans</h2>
            {plans.map(p => (
              <div
                key={p.id}
                onClick={() => selectPlan(p)}
                className={`p-3 mb-2 rounded-lg cursor-pointer ${selectedPlan?.id === p.id ? 'bg-primary text-white' : 'bg-secondary'}`}
              >
                <p className="font-medium text-sm">{p.plan_name}</p>
                <p className="text-xs opacity-80">{p.time_period}</p>
              </div>
            ))}
          </Card>

          <div className="lg:col-span-3 space-y-6">
            {selectedPlan && (
              <>
                <Card className="p-8 bg-primary/5 border-primary/20 border rounded-2xl">
                  <h2 className="text-2xl font-semibold mb-4">{selectedPlan.plan_name}</h2>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Country Target</p>
                      <p className="text-3xl font-bold text-primary">Rs {(selectedPlan.country_target / 100000).toFixed(1)}L</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Period</p>
                      <p className="text-lg font-medium capitalize">{selectedPlan.time_period}</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-6 border rounded-2xl">
                  <div className="flex justify-between mb-6">
                    <h2 className="text-xl font-semibold">Territory Allocation</h2>
                    <Dialog open={allocDialog} onOpenChange={setAllocDialog}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="rounded-full">
                          <Edit className="h-4 w-4 mr-2" />Allocate
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl">
                        <DialogHeader><DialogTitle>Allocate Territories</DialogTitle></DialogHeader>
                        <TerritoryForm planId={selectedPlan.id} target={selectedPlan.country_target} onDone={() => { setAllocDialog(false); selectPlan(selectedPlan); }} />
                      </DialogContent>
                    </Dialog>
                  </div>

                  {hierarchy?.territories?.length > 0 ? (
                    <div className="space-y-4">
                      {hierarchy.territories.map(t => (
                        <TerritoryItem key={t.id} terr={t} planId={selectedPlan.id} onAllocCity={openCityAlloc} onRefresh={() => selectPlan(selectedPlan)} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-xl">
                      <p className="text-muted-foreground">No territories allocated</p>
                    </div>
                  )}
                </Card>

                <Dialog open={cityDialog} onOpenChange={setCityDialog}>
                  <DialogContent className="max-w-4xl">
                    <DialogHeader><DialogTitle>Allocate Cities - {selectedTerritory?.territory}</DialogTitle></DialogHeader>
                    {selectedTerritory && (
                      <CityForm terr={selectedTerritory} planId={selectedPlan.id} onDone={() => { setCityDialog(false); selectPlan(selectedPlan); }} />
                    )}
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateForm({ onDone }) {
  const [data, setData] = React.useState({ plan_name: '', time_period: 'quarterly', start_date: '', end_date: '', country_target: '' });
  const [loading, setLoading] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/target-plans`, 
        { ...data, country_target: parseFloat(data.country_target) * 100000 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Plan created!');
      onDone();
    } catch (error) {
      toast.error('Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div><Label>Plan Name *</Label><Input value={data.plan_name} onChange={e => setData(p => ({...p, plan_name: e.target.value}))} required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Period *</Label>
          <Select value={data.time_period} onValueChange={v => setData(p => ({...p, time_period: v}))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="half_yearly">Half-Yearly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Target (Lakhs) *</Label><Input type="number" value={data.country_target} onChange={e => setData(p => ({...p, country_target: e.target.value}))} required /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Start *</Label><Input type="date" value={data.start_date} onChange={e => setData(p => ({...p, start_date: e.target.value}))} required /></div>
        <div><Label>End *</Label><Input type="date" value={data.end_date} onChange={e => setData(p => ({...p, end_date: e.target.value}))} required /></div>
      </div>
      <Button type="submit" className="w-full h-12 rounded-full" disabled={loading}>{loading ? 'Creating...' : 'Create'}</Button>
    </form>
  );
}

function TerritoryForm({ planId, target, onDone }) {
  const [data, setData] = React.useState([
    { territory: 'North India', target_revenue: '' },
    { territory: 'South India', target_revenue: '' },
    { territory: 'West India', target_revenue: '' },
    { territory: 'East India', target_revenue: '' }
  ]);
  const [loading, setLoading] = React.useState(false);

  const total = data.reduce((s, t) => s + (parseFloat(t.target_revenue) || 0), 0);
  const valid = Math.abs(total - target) < 0.01;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = data.filter(t => parseFloat(t.target_revenue) > 0).map(t => ({
        territory: t.territory,
        target_revenue: parseFloat(t.target_revenue) * 100000
      }));
      await axios.post(`${API_URL}/target-plans/${planId}/territories`, payload, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Allocated!');
      onDone();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="bg-primary/5 p-4 rounded-xl"><p className="font-semibold">Target: Rs {(target / 100000).toFixed(1)}L</p></div>
      {data.map((t, i) => (
        <div key={t.territory} className="grid grid-cols-2 gap-4">
          <Label className="self-center">{t.territory}</Label>
          <Input type="number" placeholder="Lakhs" value={t.target_revenue} onChange={e => {
            const n = [...data];
            n[i].target_revenue = e.target.value;
            setData(n);
          }} />
        </div>
      ))}
      <div className={`p-4 rounded-xl ${valid && total > 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
        <p className="font-bold">Total: Rs {(total / 100000).toFixed(1)}L</p>
        {!valid && <p className="text-xs text-amber-800 mt-1"><AlertCircle className="h-3 w-3 inline" /> Must equal target</p>}
      </div>
      <Button type="submit" disabled={!valid || loading} className="w-full h-12 rounded-full">Allocate</Button>
    </form>
  );
}

function CityForm({ terr, planId, onDone }) {
  const cities = {
    'North India': [{state: 'Delhi', city: 'New Delhi'}, {state: 'Uttar Pradesh', city: 'Noida'}],
    'South India': [{state: 'Karnataka', city: 'Bengaluru'}, {state: 'Tamil Nadu', city: 'Chennai'}, {state: 'Telangana', city: 'Hyderabad'}],
    'West India': [{state: 'Maharashtra', city: 'Mumbai'}, {state: 'Maharashtra', city: 'Pune'}, {state: 'Gujarat', city: 'Ahmedabad'}],
    'East India': [{state: 'West Bengal', city: 'Kolkata'}]
  }[terr.territory] || [];

  const [data, setData] = React.useState(cities.map(c => ({...c, target_revenue: ''})));
  const [loading, setLoading] = React.useState(false);

  const total = data.reduce((s, c) => s + (parseFloat(c.target_revenue) || 0), 0);
  const valid = Math.abs(total - terr.target_revenue / 100000) < 0.01;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = data.filter(c => parseFloat(c.target_revenue) > 0).map(c => ({
        state: c.state,
        city: c.city,
        target_revenue: parseFloat(c.target_revenue) * 100000
      }));
      await axios.post(`${API_URL}/target-plans/${planId}/territories/${encodeURIComponent(terr.territory)}/cities`, payload, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Cities allocated!');
      onDone();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="bg-primary/5 p-4 rounded-xl"><p className="font-semibold">{terr.territory}: Rs {(terr.target_revenue / 100000).toFixed(1)}L</p></div>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {data.map((c, i) => (
          <div key={`${c.state}-${c.city}`} className="grid grid-cols-3 gap-3 bg-secondary p-3 rounded-lg">
            <div className="col-span-2">
              <p className="font-medium text-sm">{c.city}</p>
              <p className="text-xs text-muted-foreground">{c.state}</p>
            </div>
            <Input type="number" placeholder="Lakhs" value={c.target_revenue} onChange={e => {
              const n = [...data];
              n[i].target_revenue = e.target.value;
              setData(n);
            }} />
          </div>
        ))}
      </div>
      <div className={`p-4 rounded-xl ${valid && total > 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
        <p className="font-bold">Total: Rs {total.toFixed(1)}L</p>
        {!valid && <p className="text-xs text-amber-800 mt-1"><AlertCircle className="h-3 w-3 inline" /> Must equal territory target</p>}
      </div>
      <Button type="submit" disabled={!valid || loading} className="w-full h-12 rounded-full">Allocate Cities</Button>
    </form>
  );
}

function TerritoryItem({ terr, planId, onAllocCity, onRefresh }) {
  const [open, setOpen] = React.useState(false);
  const pct = (terr.allocated_revenue / terr.target_revenue) * 100;

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="p-4 bg-secondary flex justify-between">
        <div className="flex items-center gap-3 flex-1" onClick={() => setOpen(!open)}>
          <button className="p-1 hover:bg-background rounded">{open ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}</button>
          <div>
            <p className="font-semibold">{terr.territory}</p>
            <p className="text-xs text-muted-foreground">Target: Rs {(terr.target_revenue / 100000).toFixed(1)}L</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Allocated</p>
            <p className="font-semibold">Rs {(terr.allocated_revenue / 100000).toFixed(1)}L</p>
            <div className="w-24 h-1 bg-muted rounded mt-1">
              <div className={`h-full ${pct >= 100 ? 'bg-green-500' : 'bg-amber-500'}`} style={{width: `${Math.min(pct, 100)}%`}} />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => onAllocCity(terr)} className="rounded-full">
            <Edit className="h-3 w-3 mr-1" />Cities
          </Button>
        </div>
      </div>
      {open && terr.states && terr.states.length > 0 && (
        <div className="p-4 space-y-3">
          {terr.states.map(st => (
            <div key={st.state_name} className="border rounded-lg p-3">
              <div className="flex justify-between mb-2">
                <p className="font-medium">{st.state_name}</p>
                <p className="font-semibold text-primary">Rs {(st.state_target / 100000).toFixed(1)}L</p>
              </div>
              {st.cities && st.cities.length > 0 && (
                <div className="space-y-1">
                  {st.cities.map(city => (
                    <div key={city.id} className="flex justify-between text-sm bg-muted p-2 rounded">
                      <span>{city.city}</span>
                      <span className="font-medium">Rs {(city.target_revenue / 100000).toFixed(1)}L</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
