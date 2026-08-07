import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Cog, Plus, Pencil, Trash2, Search, Wrench, RefreshCw, Star, ShoppingCart, CalendarCheck, Repeat } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('session_token')}`, 'Content-Type': 'application/json' });

const EMPTY_EQ = {
  name: '', equipment_type_id: '', make_brand: '', model_spec: '',
  maintenance_frequency_days: '', replacement_frequency_days: '', procurement_lead_time_days: '',
  last_maintenance_date: '', next_maintenance_due: '', last_replacement_date: '', next_replacement_due: '',
  expected_life: '', min_stock_level: '', remarks: '', vendors: [],
};

const EMPTY_VENDOR = { vendor_id: '', vendor_name: '', preferred: false, lead_time_days: '', last_purchase_price: '', vendor_part_code: '', contact_details: '', amc_details: '' };

const daysUntil = (d) => {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date(new Date().toDateString())) / 86400000);
};

const DueChip = ({ date, testid }) => {
  const n = daysUntil(date);
  if (n == null) return <span className="text-muted-foreground text-xs">—</span>;
  let cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let label = date;
  if (n < 0) { cls = 'bg-red-100 text-red-700 border-red-300'; label = `${date} · ${-n}d overdue`; }
  else if (n <= 30) { cls = 'bg-amber-50 text-amber-700 border-amber-300'; label = `${date} · in ${n}d`; }
  return <Badge variant="outline" className={`${cls} whitespace-nowrap`} data-testid={testid}>{label}</Badge>;
};

export default function EquipmentMaster() {
  const [types, setTypes] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showEqForm, setShowEqForm] = useState(false);
  const [editingEq, setEditingEq] = useState(null);
  const [eqForm, setEqForm] = useState(EMPTY_EQ);
  const [saving, setSaving] = useState(false);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [typeForm, setTypeForm] = useState({ name: '', description: '' });
  const [logTarget, setLogTarget] = useState(null); // {equipment, kind: 'maintenance'|'replacement'}
  const [logDate, setLogDate] = useState('');
  const [logRemarks, setLogRemarks] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, eRes, vRes] = await Promise.all([
        fetch(`${API_URL}/api/production/equipment/types`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/production/equipment`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/inventory/vendors`, { headers: authHeaders() }),
      ]);
      setTypes((await tRes.json()).types || []);
      setEquipment((await eRes.json()).equipment || []);
      const vData = await vRes.json();
      setVendors(vData.vendors || vData.items || (Array.isArray(vData) ? vData : []));
    } catch { toast.error('Failed to load equipment master'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const seedDefaults = async () => {
    const res = await fetch(`${API_URL}/api/production/equipment/types/seed-defaults`, { method: 'POST', headers: authHeaders() });
    const d = await res.json();
    toast.success(`${d.created} default types added`);
    loadAll();
  };

  const saveType = async () => {
    if (!typeForm.name.trim()) return toast.error('Type name is required');
    const url = editingType ? `${API_URL}/api/production/equipment/types/${editingType.id}` : `${API_URL}/api/production/equipment/types`;
    const res = await fetch(url, { method: editingType ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(typeForm) });
    if (!res.ok) return toast.error((await res.json()).detail || 'Save failed');
    toast.success(editingType ? 'Type updated' : 'Type created');
    setShowTypeForm(false);
    loadAll();
  };

  const deleteType = async (t) => {
    if (!window.confirm(`Delete equipment type "${t.name}"?`)) return;
    const res = await fetch(`${API_URL}/api/production/equipment/types/${t.id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return toast.error((await res.json()).detail || 'Delete failed');
    toast.success('Type deleted');
    loadAll();
  };

  const openNewEq = () => { setEditingEq(null); setEqForm({ ...EMPTY_EQ, equipment_type_id: typeFilter || '' }); setShowEqForm(true); };
  const openEditEq = (e) => {
    setEditingEq(e);
    setEqForm({
      ...EMPTY_EQ, ...e,
      maintenance_frequency_days: e.maintenance_frequency_days ?? '', replacement_frequency_days: e.replacement_frequency_days ?? '',
      procurement_lead_time_days: e.procurement_lead_time_days ?? '', min_stock_level: e.min_stock_level ?? '',
      last_maintenance_date: e.last_maintenance_date || '', next_maintenance_due: e.next_maintenance_due || '',
      last_replacement_date: e.last_replacement_date || '', next_replacement_due: e.next_replacement_due || '',
      vendors: (e.vendors || []).map((v) => ({ ...EMPTY_VENDOR, ...v, lead_time_days: v.lead_time_days ?? '', last_purchase_price: v.last_purchase_price ?? '' })),
    });
    setShowEqForm(true);
  };

  const setF = (k, v) => setEqForm((p) => ({ ...p, [k]: v }));
  const setVendorField = (i, k, v) => setEqForm((p) => {
    const vs = [...p.vendors];
    vs[i] = { ...vs[i], [k]: v };
    if (k === 'vendor_id') vs[i].vendor_name = (vendors.find((x) => x.id === v) || {}).vendor_name || '';
    return { ...p, vendors: vs };
  });

  const saveEq = async () => {
    if (!eqForm.name.trim() || !eqForm.equipment_type_id) return toast.error('Name and equipment type are required');
    setSaving(true);
    try {
      const payload = {
        ...eqForm,
        maintenance_frequency_days: eqForm.maintenance_frequency_days === '' ? null : parseInt(eqForm.maintenance_frequency_days),
        replacement_frequency_days: eqForm.replacement_frequency_days === '' ? null : parseInt(eqForm.replacement_frequency_days),
        procurement_lead_time_days: eqForm.procurement_lead_time_days === '' ? null : parseInt(eqForm.procurement_lead_time_days),
        min_stock_level: eqForm.min_stock_level === '' ? null : parseInt(eqForm.min_stock_level),
        last_maintenance_date: eqForm.last_maintenance_date || null, next_maintenance_due: eqForm.next_maintenance_due || null,
        last_replacement_date: eqForm.last_replacement_date || null, next_replacement_due: eqForm.next_replacement_due || null,
        vendors: eqForm.vendors.filter((v) => v.vendor_id).map((v) => ({
          ...v,
          lead_time_days: v.lead_time_days === '' ? null : parseInt(v.lead_time_days),
          last_purchase_price: v.last_purchase_price === '' ? null : parseFloat(v.last_purchase_price),
        })),
      };
      const url = editingEq ? `${API_URL}/api/production/equipment/${editingEq.id}` : `${API_URL}/api/production/equipment`;
      const res = await fetch(url, { method: editingEq ? 'PUT' : 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json()).detail || 'Save failed');
      toast.success(editingEq ? 'Equipment updated' : 'Equipment created');
      setShowEqForm(false);
      loadAll();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const deleteEq = async (e) => {
    if (!window.confirm(`Delete "${e.name}"?`)) return;
    const res = await fetch(`${API_URL}/api/production/equipment/${e.id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) return toast.error((await res.json()).detail || 'Delete failed');
    toast.success('Equipment deleted');
    loadAll();
  };

  const submitLog = async () => {
    const res = await fetch(`${API_URL}/api/production/equipment/${logTarget.equipment.id}/log-${logTarget.kind}`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ date: logDate || null, remarks: logRemarks || null }),
    });
    if (!res.ok) return toast.error((await res.json()).detail || 'Failed');
    toast.success(`${logTarget.kind === 'maintenance' ? 'Maintenance' : 'Replacement'} logged — next due date updated`);
    setLogTarget(null); setLogDate(''); setLogRemarks('');
    loadAll();
  };

  const filtered = equipment.filter((e) =>
    (!typeFilter || e.equipment_type_id === typeFilter) &&
    (!search || `${e.name} ${e.make_brand} ${e.model_spec}`.toLowerCase().includes(search.toLowerCase())));

  const overdueM = equipment.filter((e) => daysUntil(e.next_maintenance_due) < 0 && e.next_maintenance_due).length;
  const dueSoonM = equipment.filter((e) => { const n = daysUntil(e.next_maintenance_due); return n != null && n >= 0 && n <= 30; }).length;
  const orderNow = equipment.filter((e) => {
    const n = daysUntil(e.next_replacement_due);
    return n != null && e.procurement_lead_time_days && n <= e.procurement_lead_time_days;
  }).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="equipment-master-page">
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-100 dark:from-indigo-950/40 dark:to-blue-900/30">
              <Cog className="h-6 w-6 text-indigo-700 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Equipment Master</h1>
              <p className="text-muted-foreground">Equipment, consumables, maintenance & replacement schedules, vendor associations</p>
            </div>
          </div>
          <Button onClick={openNewEq} data-testid="eq-new-btn"><Plus className="w-4 h-4 mr-2" /> Add Equipment</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Equipment Items', value: equipment.length, testid: 'eq-stat-total' },
            { label: 'Maintenance Overdue', value: overdueM, testid: 'eq-stat-overdue', red: overdueM > 0 },
            { label: 'Due in 30 Days', value: dueSoonM, testid: 'eq-stat-duesoon' },
            { label: 'Order Now (lead time)', value: orderNow, testid: 'eq-stat-ordernow', red: orderNow > 0 },
          ].map((s) => (
            <Card key={s.label}><CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${s.red ? 'text-red-600' : ''}`} data-testid={s.testid}>{s.value}</p>
            </CardContent></Card>
          ))}
        </div>

        <Tabs defaultValue="equipment">
          <TabsList>
            <TabsTrigger value="equipment" data-testid="eq-tab-equipment">Equipment / Components</TabsTrigger>
            <TabsTrigger value="types" data-testid="eq-tab-types">Equipment Types</TabsTrigger>
          </TabsList>

          <TabsContent value="equipment" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search name, make, model…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-64" data-testid="eq-search" />
              </div>
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} data-testid="eq-type-filter">
                <option value="">All Types</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <Card><CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="eq-empty">
                  <Cog className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  No equipment yet. {types.length === 0 && 'Create equipment types first (Types tab).'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="eq-table">
                    <thead>
                      <tr className="border-b bg-slate-50 dark:bg-slate-900/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3">Equipment</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Make / Model</th>
                        <th className="px-4 py-3">Vendors</th>
                        <th className="px-4 py-3">Next Maintenance</th>
                        <th className="px-4 py-3">Next Replacement</th>
                        <th className="px-4 py-3 text-right">Lead Time</th>
                        <th className="px-4 py-3 text-right">Min Stock</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((e) => {
                        const nRep = daysUntil(e.next_replacement_due);
                        const orderFlag = nRep != null && e.procurement_lead_time_days && nRep <= e.procurement_lead_time_days;
                        return (
                          <tr key={e.id} className="border-b hover:bg-slate-50/60 dark:hover:bg-slate-900/40 align-top" data-testid={`eq-row-${e.name.replace(/\s/g, '-')}`}>
                            <td className="px-4 py-3">
                              <p className="font-semibold">{e.name}</p>
                              {e.expected_life && <p className="text-[11px] text-muted-foreground">Life: {e.expected_life}</p>}
                            </td>
                            <td className="px-4 py-3"><Badge variant="outline">{e.equipment_type_name}</Badge></td>
                            <td className="px-4 py-3 text-xs">{[e.make_brand, e.model_spec].filter(Boolean).join(' · ') || '—'}</td>
                            <td className="px-4 py-3">
                              {(e.vendors || []).length === 0 ? <span className="text-xs text-muted-foreground">—</span> : (
                                <div className="space-y-0.5">
                                  {e.vendors.map((v, i) => (
                                    <p key={i} className="text-xs flex items-center gap-1">
                                      {v.preferred && <Star className="h-3 w-3 text-amber-500 fill-amber-400" />}
                                      {v.vendor_name}{v.lead_time_days ? ` · ${v.lead_time_days}d` : ''}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <DueChip date={e.next_maintenance_due} testid={`eq-maint-due-${e.name.replace(/\s/g, '-')}`} />
                              {e.last_maintenance_date && <p className="text-[11px] text-muted-foreground mt-0.5">Last: {e.last_maintenance_date}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <DueChip date={e.next_replacement_due} testid={`eq-repl-due-${e.name.replace(/\s/g, '-')}`} />
                              {orderFlag && (
                                <Badge className="mt-1 bg-red-600 text-white block w-fit" data-testid={`eq-order-now-${e.name.replace(/\s/g, '-')}`}>
                                  <ShoppingCart className="h-3 w-3 mr-1" /> Order now
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">{e.procurement_lead_time_days ? `${e.procurement_lead_time_days}d` : '—'}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{e.min_stock_level ?? '—'}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Log maintenance done"
                                onClick={() => { setLogTarget({ equipment: e, kind: 'maintenance' }); setLogDate(new Date().toISOString().slice(0, 10)); }}
                                data-testid={`eq-log-maint-${e.name.replace(/\s/g, '-')}`}>
                                <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Log replacement done"
                                onClick={() => { setLogTarget({ equipment: e, kind: 'replacement' }); setLogDate(new Date().toISOString().slice(0, 10)); }}
                                data-testid={`eq-log-repl-${e.name.replace(/\s/g, '-')}`}>
                                <Repeat className="h-3.5 w-3.5 text-indigo-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditEq(e)} data-testid={`eq-edit-${e.name.replace(/\s/g, '-')}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteEq(e)} data-testid={`eq-delete-${e.name.replace(/\s/g, '-')}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="types" className="space-y-4 mt-4">
            <div className="flex gap-2">
              <Button onClick={() => { setEditingType(null); setTypeForm({ name: '', description: '' }); setShowTypeForm(true); }} data-testid="type-new-btn">
                <Plus className="w-4 h-4 mr-2" /> Add Type
              </Button>
              <Button variant="outline" onClick={seedDefaults} data-testid="type-seed-btn">Add Suggested Types</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {types.map((t) => (
                <Card key={t.id} data-testid={`type-card-${t.name.replace(/\s|\//g, '-')}`}>
                  <CardContent className="p-4 flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.equipment_count} equipment item{t.equipment_count === 1 ? '' : 's'}</p>
                      {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingType(t); setTypeForm({ name: t.name, description: t.description || '' }); setShowTypeForm(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteType(t)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {types.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground col-span-full" data-testid="types-empty">No equipment types yet — add your own or use "Add Suggested Types".</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Equipment form */}
      <Dialog open={showEqForm} onOpenChange={setShowEqForm}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="eq-form-dialog">
          <DialogHeader>
            <DialogTitle>{editingEq ? `Edit ${editingEq.name}` : 'Add Equipment / Component'}</DialogTitle>
            <DialogDescription>Maintenance & replacement schedules auto-compute next due dates from last date + frequency.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Name *</Label>
              <Input value={eqForm.name} onChange={(e) => setF('name', e.target.value)} placeholder="e.g. 5 Micron Filter" className="mt-1" data-testid="eq-input-name" />
            </div>
            <div>
              <Label>Equipment Type *</Label>
              <select className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={eqForm.equipment_type_id} onChange={(e) => setF('equipment_type_id', e.target.value)} data-testid="eq-input-type">
                <option value="">Select type…</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div><Label>Make / Brand</Label><Input value={eqForm.make_brand} onChange={(e) => setF('make_brand', e.target.value)} className="mt-1" data-testid="eq-input-make" /></div>
            <div><Label>Model / Specification</Label><Input value={eqForm.model_spec} onChange={(e) => setF('model_spec', e.target.value)} className="mt-1" data-testid="eq-input-model" /></div>
            <div><Label>Maintenance Frequency (days)</Label><Input type="number" min="0" value={eqForm.maintenance_frequency_days} onChange={(e) => setF('maintenance_frequency_days', e.target.value)} className="mt-1" data-testid="eq-input-maintfreq" /></div>
            <div><Label>Replacement Frequency (days)</Label><Input type="number" min="0" value={eqForm.replacement_frequency_days} onChange={(e) => setF('replacement_frequency_days', e.target.value)} className="mt-1" data-testid="eq-input-replfreq" /></div>
            <div><Label>Last Maintenance Date</Label><Input type="date" value={eqForm.last_maintenance_date} onChange={(e) => setF('last_maintenance_date', e.target.value)} className="mt-1" data-testid="eq-input-lastmaint" /></div>
            <div><Label>Next Maintenance Due <span className="text-xs text-muted-foreground">(blank = auto)</span></Label><Input type="date" value={eqForm.next_maintenance_due} onChange={(e) => setF('next_maintenance_due', e.target.value)} className="mt-1" /></div>
            <div><Label>Last Replacement Date</Label><Input type="date" value={eqForm.last_replacement_date} onChange={(e) => setF('last_replacement_date', e.target.value)} className="mt-1" data-testid="eq-input-lastrepl" /></div>
            <div><Label>Next Replacement Due <span className="text-xs text-muted-foreground">(blank = auto)</span></Label><Input type="date" value={eqForm.next_replacement_due} onChange={(e) => setF('next_replacement_due', e.target.value)} className="mt-1" /></div>
            <div><Label>Procurement Lead Time (days)</Label><Input type="number" min="0" value={eqForm.procurement_lead_time_days} onChange={(e) => setF('procurement_lead_time_days', e.target.value)} className="mt-1" data-testid="eq-input-leadtime" /></div>
            <div><Label>Expected Life / Usage Limit</Label><Input placeholder="e.g. 6 months / 50,000 L" value={eqForm.expected_life} onChange={(e) => setF('expected_life', e.target.value)} className="mt-1" /></div>
            <div><Label>Minimum Stock / Reorder Level</Label><Input type="number" min="0" value={eqForm.min_stock_level} onChange={(e) => setF('min_stock_level', e.target.value)} className="mt-1" data-testid="eq-input-minstock" /></div>
            <div className="sm:col-span-2"><Label>Remarks / Maintenance Instructions</Label><Textarea rows={2} value={eqForm.remarks} onChange={(e) => setF('remarks', e.target.value)} className="mt-1" /></div>
          </div>

          {/* Vendor associations */}
          <div className="border-t pt-4 mt-2">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-base font-semibold">Vendor Associations</Label>
              <Button size="sm" variant="outline" onClick={() => setEqForm((p) => ({ ...p, vendors: [...p.vendors, { ...EMPTY_VENDOR }] }))} data-testid="eq-add-vendor-btn">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Vendor
              </Button>
            </div>
            {eqForm.vendors.length === 0 && <p className="text-xs text-muted-foreground">No vendors associated yet.</p>}
            <div className="space-y-3">
              {eqForm.vendors.map((v, i) => (
                <div key={i} className="rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 relative" data-testid={`eq-vendor-row-${i}`}>
                  <div>
                    <Label className="text-xs">Vendor *</Label>
                    <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={v.vendor_id} onChange={(e) => setVendorField(i, 'vendor_id', e.target.value)} data-testid={`eq-vendor-select-${i}`}>
                      <option value="">Select vendor…</option>
                      {vendors.map((x) => <option key={x.id} value={x.id}>{x.vendor_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Lead Time (days)</Label>
                    <Input type="number" min="0" className="mt-1 h-9" value={v.lead_time_days} onChange={(e) => setVendorField(i, 'lead_time_days', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Last Purchase Price (₹)</Label>
                    <Input type="number" min="0" step="0.01" className="mt-1 h-9" value={v.last_purchase_price} onChange={(e) => setVendorField(i, 'last_purchase_price', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Vendor Part / Item Code</Label>
                    <Input className="mt-1 h-9" value={v.vendor_part_code} onChange={(e) => setVendorField(i, 'vendor_part_code', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Contact / Support</Label>
                    <Input className="mt-1 h-9" value={v.contact_details} onChange={(e) => setVendorField(i, 'contact_details', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">AMC / Service Contract</Label>
                    <Input className="mt-1 h-9" value={v.amc_details} onChange={(e) => setVendorField(i, 'amc_details', e.target.value)} />
                  </div>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" checked={v.preferred} onChange={(e) => setVendorField(i, 'preferred', e.target.checked)} data-testid={`eq-vendor-preferred-${i}`} />
                    <Star className="h-3.5 w-3.5 text-amber-500" /> Preferred vendor
                  </label>
                  <Button size="sm" variant="ghost" className="text-red-500 justify-self-end sm:col-span-1" data-testid={`eq-vendor-remove-${i}`}
                    onClick={() => setEqForm((p) => ({ ...p, vendors: p.vendors.filter((_, j) => j !== i) }))}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEqForm(false)}>Cancel</Button>
            <Button onClick={saveEq} disabled={saving} data-testid="eq-save-btn">{saving ? 'Saving…' : editingEq ? 'Update Equipment' : 'Create Equipment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Type form */}
      <Dialog open={showTypeForm} onOpenChange={setShowTypeForm}>
        <DialogContent className="sm:max-w-md" data-testid="type-form-dialog">
          <DialogHeader><DialogTitle>{editingType ? 'Edit Equipment Type' : 'New Equipment Type'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={typeForm.name} onChange={(e) => setTypeForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Filters" className="mt-1" data-testid="type-input-name" /></div>
            <div><Label>Description</Label><Textarea rows={2} value={typeForm.description} onChange={(e) => setTypeForm((p) => ({ ...p, description: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTypeForm(false)}>Cancel</Button>
            <Button onClick={saveType} data-testid="type-save-btn">{editingType ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log maintenance/replacement */}
      <Dialog open={!!logTarget} onOpenChange={(o) => !o && setLogTarget(null)}>
        <DialogContent className="sm:max-w-md" data-testid="eq-log-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-emerald-600" />
              Log {logTarget?.kind === 'maintenance' ? 'Maintenance' : 'Replacement'} — {logTarget?.equipment?.name}
            </DialogTitle>
            <DialogDescription>The next due date will be recalculated automatically from the frequency.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Date</Label><Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="mt-1" data-testid="eq-log-date" /></div>
            <div><Label>Remarks</Label><Textarea rows={2} value={logRemarks} onChange={(e) => setLogRemarks(e.target.value)} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogTarget(null)}>Cancel</Button>
            <Button onClick={submitLog} data-testid="eq-log-confirm-btn">Save Log</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
