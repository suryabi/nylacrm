import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { MultiSelect } from '../components/ui/multi-select';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import { useLeadStatuses } from '../hooks/useLeadStatuses';
import {
  Target, TrendingUp, TrendingDown, Users, Phone, MapPin, DollarSign,
  BarChart3, RefreshCw, Save, Send, Check, RotateCcw, AlertTriangle,
  ChevronDown, ChevronRight, Building2, Clock, ArrowUp, ArrowDown, Minus,
  Pencil, X, MessageSquare, Mail
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const fmt = (v) => (v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtPct = (v) => `${(v || 0).toFixed(1)}%`;
const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
];
const SUPPORT_CATEGORIES = ['Pricing', 'Logistics', 'Marketing', 'Collections', 'Management Intervention', 'Product / Supply Support'];

export default function PerformanceTracker() {
  const navigate = useNavigate();
  const { statuses: leadStatuses, getStatusLabel, getStatusById } = useLeadStatuses();
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [resources, setResources] = useState([]);
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [selectedResource, setSelectedResource] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [expandedSections, setExpandedSections] = useState({ accounts: false, pipeline: false, outstanding: false });
  const [expandedAccountList, setExpandedAccountList] = useState({ existing: false, new: false });
  // Editable fields
  const [supportNeeded, setSupportNeeded] = useState([]);
  const [remarks, setRemarks] = useState('');
  const [manualRevenue, setManualRevenue] = useState('');
  // Revenue overrides
  const [revenueOverrides, setRevenueOverrides] = useState({ lifetime: '', this_month: '', new_accounts: '' });
  const [revenueEditing, setRevenueEditing] = useState({ lifetime: false, this_month: false, new_accounts: false });

  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
  const headers = { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch(`${API_URL}/api/performance/target-plans`, { headers })
      .then(r => r.json()).then(setPlans).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedPlan) return;
    fetch(`${API_URL}/api/performance/resources-for-plan/${selectedPlan}`, { headers })
      .then(r => r.json()).then(setResources).catch(() => {});
    setTerritoryFilter('all');
    setCityFilter('all');
    setSelectedResource([]);
    setData(null);
  }, [selectedPlan]);

  // Derive unique territories and cities from the plan's resource allocations
  const planTerritories = [...new Map(resources.map(r => [r.territory_id, { id: r.territory_id, name: r.territory_name || r.territory_id }])).values()];
  const planCities = [...new Set(
    resources
      .filter(r => territoryFilter === 'all' || r.territory_id === territoryFilter)
      .map(r => r.city)
      .filter(Boolean)
  )];

  // Filter resources based on territory/city selection
  const filteredResources = resources.filter(r => {
    if (territoryFilter !== 'all' && r.territory_id !== territoryFilter) return false;
    if (cityFilter !== 'all' && r.city !== cityFilter) return false;
    return true;
  });

  const hasSelection = selectedResource.length > 0 || filteredResources.length > 0;

  // Resolve to resource_ids: use selectedResource if any, otherwise all filtered resources  
  const resolveResourceIds = () => {
    if (selectedResource.length > 0) return selectedResource;
    return filteredResources.map(r => r.resource_id).filter(Boolean);
  };

  const generate = useCallback(async () => {
    if (!selectedPlan) return;
    const resourceIds = selectedResource.length > 0
      ? selectedResource
      : resources.filter(r => {
          if (territoryFilter !== 'all' && r.territory_id !== territoryFilter) return false;
          if (cityFilter !== 'all' && r.city !== cityFilter) return false;
          return true;
        }).map(r => r.resource_id).filter(Boolean);
    if (resourceIds.length === 0) return;
    setLoading(true);
    try {
      const resourceParam = resourceIds.join(',');
      const res = await fetch(
        `${API_URL}/api/performance/generate?plan_id=${selectedPlan}&resource_id=${resourceParam}&month=${selectedMonth}&year=${selectedYear}`,
        { headers }
      );
      const d = await res.json();
      setData(d);
      // Populate editable fields from saved record
      if (d.saved_record) {
        setSupportNeeded(d.support_needed || []);
        setRemarks(d.remarks || '');
        setManualRevenue(d.manual_revenue ?? '');
        setRevenueOverrides({
          lifetime: d.saved_record.revenue_lifetime_override ?? '',
          this_month: d.saved_record.revenue_this_month_override ?? '',
          new_accounts: d.saved_record.revenue_new_accounts_override ?? '',
        });
      } else {
        setSupportNeeded([]); setRemarks(''); setManualRevenue('');
        setRevenueOverrides({ lifetime: '', this_month: '', new_accounts: '' });
      }
      setRevenueEditing({ lifetime: false, this_month: false, new_accounts: false });
      // Fetch comparison
      const compRes = await fetch(
        `${API_URL}/api/performance/comparison?resource_id=${resourceParam}&plan_id=${selectedPlan}&months=3&month=${selectedMonth}&year=${selectedYear}`,
        { headers }
      );
      setComparison(await compRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, selectedMonth, selectedYear, selectedResource, resources, territoryFilter, cityFilter]);

  useEffect(() => { generate(); }, [generate]);

  const saveRecord = async (submitAfter = false) => {
    if (!data) return;
    setSaving(true);
    try {
      const body = {
        plan_id: selectedPlan, resource_id: selectedResource[0], month: selectedMonth, year: selectedYear,
        resource_name: data.resource_name,
        status: submitAfter ? 'submitted' : 'draft',
        support_needed: supportNeeded, remarks,
        manual_revenue: manualRevenue ? parseFloat(manualRevenue) : null,
        revenue_lifetime_override: revenueOverrides.lifetime !== '' ? parseFloat(revenueOverrides.lifetime) : null,
        revenue_this_month_override: revenueOverrides.this_month !== '' ? parseFloat(revenueOverrides.this_month) : null,
        revenue_new_accounts_override: revenueOverrides.new_accounts !== '' ? parseFloat(revenueOverrides.new_accounts) : null,
        revenue_achieved: data.revenue?.this_month || 0,
        monthly_target: data.revenue?.target || 0,
        achievement_pct: data.revenue?.achievement_pct || 0,
        existing_accounts: data.accounts?.existing_count || 0,
        new_accounts: data.accounts?.new_onboarded || 0,
        pipeline_value: data.pipeline?.total_value || 0,
        total_outstanding: data.collections?.total_outstanding || 0,
        visits: data.activities?.visits || 0,
        calls: data.activities?.calls || 0,
      };
      const res = await fetch(`${API_URL}/api/performance/save`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (res.ok) {
        if (submitAfter) {
          const saved = await res.json();
          await fetch(`${API_URL}/api/performance/${saved.id}/submit`, { method: 'POST', headers });
        }
        generate();
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const approveRecord = async () => {
    if (!data?.record_id) return;
    await fetch(`${API_URL}/api/performance/${data.record_id}/approve`, { method: 'POST', headers, body: JSON.stringify({}) });
    generate();
  };

  const returnRecord = async () => {
    if (!data?.record_id) return;
    const comment = prompt('Return comments:');
    await fetch(`${API_URL}/api/performance/${data.record_id}/return`, { method: 'POST', headers, body: JSON.stringify({ comments: comment }) });
    generate();
  };

  const toggleSection = (s) => setExpandedSections(prev => ({ ...prev, [s]: !prev[s] }));
  const toggleSupport = (cat) => setSupportNeeded(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  const isLocked = data?.status === 'approved';

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 sm:space-y-6" data-testid="performance-tracker">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800 dark:text-white flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/50 dark:to-violet-900/30">
              <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            Monthly Performance Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track sales outcomes, activity, pipeline, and collections per resource</p>
        </div>
      </div>

      {/* Selectors */}
      <Card className="border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="performance-selectors">
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            <div>
              <label className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Target Plan</label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger data-testid="select-plan"><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Territory</label>
              <Select value={territoryFilter} onValueChange={(v) => { setTerritoryFilter(v); setCityFilter('all'); setSelectedResource([]); }}>
                <SelectTrigger data-testid="select-territory"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Territories</SelectItem>
                  {planTerritories.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">City</label>
              <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setSelectedResource([]); }}>
                <SelectTrigger data-testid="select-city"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {planCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Resource</label>
              <MultiSelect
                options={filteredResources.map(r => ({ value: r.resource_id, label: `${r.resource_name}` }))}
                selected={selectedResource}
                onChange={setSelectedResource}
                placeholder="All Resources"
                data-testid="select-resource"
              />
            </div>
            <div>
              <label className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Month</label>
              <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(parseInt(v))}>
                <SelectTrigger data-testid="select-month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Year</label>
              <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={generate} disabled={loading || !selectedPlan || !hasSelection} className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-sm border-0" data-testid="generate-btn">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Generate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      )}

      {data && !loading && (
        <>
          {/* Status bar */}
          <div className="flex items-center justify-between bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <span className="text-sm font-semibold text-slate-800 dark:text-white">{data.resource_name}</span>
              {data.resource_city && <Badge variant="outline" className="bg-slate-50 dark:bg-slate-800 text-xs">{data.resource_city}</Badge>}
              <Badge variant="outline" className="bg-slate-50 dark:bg-slate-800 text-xs">{data.plan_name}</Badge>
              {territoryFilter !== 'all' && <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs border-indigo-200">{planTerritories.find(t => t.id === territoryFilter)?.name}</Badge>}
              {cityFilter !== 'all' && <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs border-indigo-200">{cityFilter}</Badge>}
              {resolveResourceIds().length === 1 && <StatusBadge status={data.status} />}
              {resolveResourceIds().length > 1 && <Badge variant="outline" className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs border-indigo-200">{resolveResourceIds().length} resources</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {resolveResourceIds().length === 1 && !isLocked && data.status !== 'submitted' && (
                <>
                  <Button variant="outline" size="sm" onClick={() => saveRecord(false)} disabled={saving} data-testid="save-draft-btn">
                    <Save className="h-4 w-4 mr-1" />{saving ? 'Saving...' : 'Save Draft'}
                  </Button>
                  <Button size="sm" onClick={() => saveRecord(true)} disabled={saving} data-testid="submit-btn">
                    <Send className="h-4 w-4 mr-1" />Submit
                  </Button>
                </>
              )}
              {resolveResourceIds().length === 1 && data.status === 'submitted' && (
                <>
                  <Button variant="outline" size="sm" onClick={returnRecord} data-testid="return-btn">
                    <RotateCcw className="h-4 w-4 mr-1" />Return
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={approveRecord} data-testid="approve-btn">
                    <Check className="h-4 w-4 mr-1" />Approve
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Summary Cards Row - TaskMetricsWidget Style */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3" data-testid="summary-cards">
            <SummaryTile label="Target" value={`₹${fmt(data.revenue?.target)}`} icon={Target} gradient="from-slate-500 to-slate-700" bgGradient="from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/20" iconBg="bg-slate-100 dark:bg-slate-900/50" textColor="text-slate-700 dark:text-slate-300" testId="metric-target" />
            <SummaryTile label="Revenue" value={`₹${fmt(data.revenue?.this_month)}`} icon={DollarSign} gradient="from-blue-500 to-indigo-600" bgGradient="from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20" iconBg="bg-blue-100 dark:bg-blue-900/50" textColor="text-blue-700 dark:text-blue-300" sub={fmtPct(data.revenue?.achievement_pct)} testId="metric-achieved" />
            <SummaryTile label="Existing A/C" value={data.accounts?.existing_count} icon={Users} gradient="from-emerald-500 to-teal-600" bgGradient="from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20" iconBg="bg-emerald-100 dark:bg-emerald-900/50" textColor="text-emerald-700 dark:text-emerald-300" testId="metric-existing" />
            <SummaryTile label="New A/C" value={data.accounts?.new_onboarded} icon={Building2} gradient="from-teal-500 to-cyan-600" bgGradient="from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/20" iconBg="bg-teal-100 dark:bg-teal-900/50" textColor="text-teal-700 dark:text-teal-300" testId="metric-new" />
            <SummaryTile label="Pipeline" value={`₹${fmt(data.pipeline?.total_value)}`} icon={TrendingUp} gradient="from-amber-500 to-orange-600" bgGradient="from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20" iconBg="bg-amber-100 dark:bg-amber-900/50" textColor="text-amber-700 dark:text-amber-300" sub={`${data.pipeline?.total_count} leads`} testId="metric-pipeline" />
            <SummaryTile label="Outstanding" value={`₹${fmt(data.collections?.total_outstanding)}`} icon={AlertTriangle} gradient="from-red-500 to-rose-600" bgGradient="from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/20" iconBg="bg-red-100 dark:bg-red-900/50" textColor="text-red-700 dark:text-red-300" testId="metric-outstanding" />
            <SummaryTile label="Activities" value={data.activities?.total || 0} icon={Phone} gradient="from-violet-500 to-purple-600" bgGradient="from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20" iconBg="bg-violet-100 dark:bg-violet-900/50" textColor="text-violet-700 dark:text-violet-300" sub={`${data.activities?.unique_visits || 0} visits`} testId="metric-activity" />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            {/* Revenue Section */}
            <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="revenue-section">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500" style={{position:'relative'}} />
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/50 dark:to-indigo-900/30">
                    <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Revenue Metrics</h3>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="Monthly Target" value={`₹${fmt(data.revenue?.target)}`} />
                    <InfoRow label="Achievement %" value={fmtPct(data.revenue?.achievement_pct)} highlight={data.revenue?.achievement_pct < 50 ? 'red' : data.revenue?.achievement_pct >= 100 ? 'green' : 'amber'} />
                  </div>
                  <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                    <OverridableRow label="Revenue Lifetime (As-on-date)" autoValue={data.revenue?.lifetime} overrideValue={revenueOverrides.lifetime} editing={revenueEditing.lifetime} locked={isLocked} onEdit={() => setRevenueEditing(p => ({ ...p, lifetime: true }))} onChange={(v) => setRevenueOverrides(p => ({ ...p, lifetime: v }))} onSave={() => setRevenueEditing(p => ({ ...p, lifetime: false }))} onReset={() => { setRevenueOverrides(p => ({ ...p, lifetime: '' })); setRevenueEditing(p => ({ ...p, lifetime: false })); }} testId="revenue-lifetime" />
                    <OverridableRow label="Revenue This Month (All Accounts)" autoValue={data.revenue?.this_month} overrideValue={revenueOverrides.this_month} editing={revenueEditing.this_month} locked={isLocked} onEdit={() => setRevenueEditing(p => ({ ...p, this_month: true }))} onChange={(v) => setRevenueOverrides(p => ({ ...p, this_month: v }))} onSave={() => setRevenueEditing(p => ({ ...p, this_month: false }))} onReset={() => { setRevenueOverrides(p => ({ ...p, this_month: '' })); setRevenueEditing(p => ({ ...p, this_month: false })); }} testId="revenue-this-month" />
                    <OverridableRow label="Revenue from New Accounts" autoValue={data.revenue?.from_new_accounts} overrideValue={revenueOverrides.new_accounts} editing={revenueEditing.new_accounts} locked={isLocked} onEdit={() => setRevenueEditing(p => ({ ...p, new_accounts: true }))} onChange={(v) => setRevenueOverrides(p => ({ ...p, new_accounts: v }))} onSave={() => setRevenueEditing(p => ({ ...p, new_accounts: false }))} onReset={() => { setRevenueOverrides(p => ({ ...p, new_accounts: '' })); setRevenueEditing(p => ({ ...p, new_accounts: false })); }} testId="revenue-new-accounts" />
                  </div>
                </div>
              </div>
            </Card>

            {/* Accounts Section */}
            <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="accounts-section">
              <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/50 dark:to-teal-900/30">
                    <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Account Metrics</h3>
                </div>
              <div className="space-y-4">
                {/* Existing Accounts */}
                <div data-testid="existing-accounts-tile">
                  <div className="flex justify-between items-center py-2.5 px-3.5 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/10 border border-emerald-100 dark:border-emerald-900/30">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Existing Accounts (Lifetime)</span>
                    <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{data.accounts?.existing_count}</span>
                  </div>
                  {(data.accounts?.existing_accounts || []).length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {(expandedAccountList.existing
                        ? data.accounts.existing_accounts
                        : data.accounts.existing_accounts.slice(0, 3)
                      ).map((acc, idx) => (
                        <div key={acc.id || idx} className="flex items-center justify-between py-1.5 px-3 text-xs rounded-lg bg-white/70 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{acc.name || 'Unknown'}</span>
                          <div className="flex items-center gap-2">
                            {acc.city && <span className="text-slate-400 dark:text-slate-500">{acc.city}</span>}
                            {acc.status && <Badge variant="outline" className="text-[10px] capitalize py-0 h-4">{acc.status.replace(/_/g, ' ')}</Badge>}
                          </div>
                        </div>
                      ))}
                      {data.accounts.existing_accounts.length > 3 && (
                        <button
                          onClick={() => setExpandedAccountList(p => ({ ...p, existing: !p.existing }))}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 px-3 py-0.5 flex items-center gap-1 font-medium"
                          data-testid="expand-existing-accounts"
                        >
                          {expandedAccountList.existing ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {expandedAccountList.existing ? 'Show less' : `Show all ${data.accounts.existing_accounts.length} accounts`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* New Accounts This Month */}
                <div data-testid="new-accounts-tile">
                  <div className={`flex justify-between items-center py-2.5 px-3.5 rounded-xl border ${data.accounts?.new_onboarded > 0 ? 'bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/20 dark:to-cyan-950/10 border-teal-100 dark:border-teal-900/30' : 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/10 border-red-100 dark:border-red-900/30'}`}>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">New Accounts Onboarded This Month</span>
                    <span className={`text-lg font-bold ${data.accounts?.new_onboarded > 0 ? 'text-teal-700 dark:text-teal-400' : 'text-red-600 dark:text-red-400'}`}>{data.accounts?.new_onboarded}</span>
                  </div>
                  {(data.accounts?.new_accounts || []).length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {(expandedAccountList.new
                        ? data.accounts.new_accounts
                        : data.accounts.new_accounts.slice(0, 3)
                      ).map((acc, idx) => (
                        <div key={acc.id || idx} className="flex items-center justify-between py-1.5 px-3 text-xs rounded-lg bg-white/70 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{acc.name || 'Unknown'}</span>
                          {acc.city && <span className="text-slate-400 dark:text-slate-500">{acc.city}</span>}
                        </div>
                      ))}
                      {data.accounts.new_accounts.length > 3 && (
                        <button
                          onClick={() => setExpandedAccountList(p => ({ ...p, new: !p.new }))}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 px-3 py-0.5 flex items-center gap-1 font-medium"
                          data-testid="expand-new-accounts"
                        >
                          {expandedAccountList.new ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {expandedAccountList.new ? 'Show less' : `Show all ${data.accounts.new_accounts.length} accounts`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              </div>
            </Card>

            {/* Pipeline Section */}
            <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="pipeline-section">
              <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/50 dark:to-orange-900/30">
                    <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Pipeline Metrics</h3>
                </div>
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="pipeline-status-table">
                    <thead>
                      <tr className="bg-gradient-to-r from-amber-50/80 to-orange-50/80 dark:from-amber-950/20 dark:to-orange-950/10 border-b border-amber-100 dark:border-amber-900/30 text-xs text-slate-500 dark:text-slate-400 uppercase">
                        <th className="text-left p-2.5">Status</th>
                        <th className="text-right p-2.5">No of Leads</th>
                        <th className="text-right p-2.5">Pipeline Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.pipeline?.by_status || []).map((row) => {
                        const statusInfo = getStatusById(row.status);
                        const dotColor = statusInfo?.bg || 'bg-slate-400';
                        return (
                        <tr
                          key={row.status}
                          className="border-b border-slate-100 dark:border-slate-800 hover:bg-amber-50/50 dark:hover:bg-amber-950/10 cursor-pointer transition-all duration-200 group"
                          onClick={() => navigate(`/leads?status=${row.status}${selectedResource.length === 1 ? `&assigned_to=${selectedResource[0]}` : ''}`)}
                          data-testid={`pipeline-row-${row.status}`}
                        >
                          <td className="p-2.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 capitalize flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                            {getStatusLabel(row.status)}
                            <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
                          </td>
                          <td className="p-2.5 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">{row.count}</td>
                          <td className="p-2.5 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">₹{fmt(row.value)}</td>
                        </tr>
                        );
                      })}
                      {(data.pipeline?.by_status || []).length === 0 && (
                        <tr><td colSpan={3} className="text-center py-4 text-xs text-muted-foreground">No active pipeline leads</td></tr>
                      )}
                      <tr className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-800/50 dark:to-gray-800/30 font-semibold border-t-2 border-slate-200 dark:border-slate-700">
                        <td className="p-2.5 text-xs text-slate-700 dark:text-slate-300">Total</td>
                        <td className="p-2.5 text-right text-sm text-slate-800 dark:text-white">{data.pipeline?.total_count || 0}</td>
                        <td className="p-2.5 text-right text-sm text-slate-800 dark:text-white">₹{fmt(data.pipeline?.total_value)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3">
                  <InfoRow label="Leads Targeting Next Month" value={data.pipeline?.next_month_leads_count || 0} />
                  <InfoRow label="Next Month Pipeline Value" value={`₹${fmt(data.pipeline?.next_month_pipeline_value)}`} />
                  <InfoRow label="Coverage Ratio" value={fmtPct(data.pipeline?.coverage_ratio)} highlight={data.pipeline?.coverage_ratio < 50 ? 'red' : 'green'} />
                </div>
              </div>
              </div>
            </Card>

            {/* Outstanding Section */}
            <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="outstanding-section">
              <div className="h-1 bg-gradient-to-r from-red-500 to-rose-500" />
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4 cursor-pointer" onClick={() => toggleSection('outstanding')}>
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-100 to-rose-100 dark:from-red-900/50 dark:to-rose-900/30">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Collections / Outstanding</h3>
                  {expandedSections.outstanding ? <ChevronDown className="h-4 w-4 ml-auto text-slate-400" /> : <ChevronRight className="h-4 w-4 ml-auto text-slate-400" />}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow label="Total Outstanding" value={`₹${fmt(data.collections?.total_outstanding)}`} highlight={data.collections?.total_outstanding > 0 ? 'red' : 'green'} />
                  <InfoRow label="Outstanding Ratio" value={fmtPct(data.collections?.outstanding_ratio)} />
                </div>
                {data.collections?.aging && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <AgingBucket label="0-30d" value={data.collections.aging['0_30']} color="emerald" />
                    <AgingBucket label="31-60d" value={data.collections.aging['31_60']} color="amber" />
                    <AgingBucket label="61-90d" value={data.collections.aging['61_90']} color="orange" />
                    <AgingBucket label="90+d" value={data.collections.aging['90_plus']} color="red" />
                  </div>
                )}
                {expandedSections.outstanding && data.collections?.account_details?.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-2">
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase mb-1">Account-Level Outstanding</p>
                    {data.collections.account_details.slice(0, 10).map(a => (
                      <div key={a.account_id} className="text-xs flex justify-between py-0.5">
                        <span className="text-slate-600 dark:text-slate-400">{a.account_id?.slice(0, 12)}... ({a.invoices} inv)</span>
                        <span className="font-medium text-red-600 dark:text-red-400">₹{fmt(a.outstanding)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Activity Section */}
            <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="activity-section">
              <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/50 dark:to-purple-900/30">
                    <Phone className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Activity Metrics</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Total Activities</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gradient-to-br from-purple-50/60 to-violet-50/40 dark:from-purple-950/20 dark:to-violet-950/10 border border-purple-100/60 dark:border-purple-900/20">
                        <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><MessageSquare className="h-3 w-3 text-purple-500 dark:text-purple-400" />Messages</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{data.activities?.messages || 0}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gradient-to-br from-blue-50/60 to-indigo-50/40 dark:from-blue-950/20 dark:to-indigo-950/10 border border-blue-100/60 dark:border-blue-900/20">
                        <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><Phone className="h-3 w-3 text-blue-500 dark:text-blue-400" />Calls</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{data.activities?.calls || 0}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gradient-to-br from-emerald-50/60 to-teal-50/40 dark:from-emerald-950/20 dark:to-teal-950/10 border border-emerald-100/60 dark:border-emerald-900/20">
                        <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><MapPin className="h-3 w-3 text-emerald-500 dark:text-emerald-400" />Customer Visits</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{data.activities?.visits || 0}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gradient-to-br from-amber-50/60 to-orange-50/40 dark:from-amber-950/20 dark:to-orange-950/10 border border-amber-100/60 dark:border-amber-900/20">
                        <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><Mail className="h-3 w-3 text-amber-500 dark:text-amber-400" />Emails</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{data.activities?.emails || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Unique Customers Reached</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Unique Visits</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{data.activities?.unique_visits || 0}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Unique Messages</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{data.activities?.unique_messages || 0}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Unique Calls</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{data.activities?.unique_calls || 0}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                        <span className="text-xs text-slate-600 dark:text-slate-400">Unique Emails</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{data.activities?.unique_emails || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3 grid grid-cols-2 gap-3">
                    <InfoRow label="Visit Productivity" value={data.activities?.visit_productivity > 0 ? `₹${fmt(data.activities?.visit_productivity)}/visit` : '-'} />
                    <InfoRow label="Call Productivity" value={data.activities?.call_productivity > 0 ? `₹${fmt(data.activities?.call_productivity)}/call` : '-'} />
                  </div>
                </div>
              </div>
            </Card>

            {/* Support Section */}
            <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="support-section">
              <div className="h-1 bg-gradient-to-r from-indigo-500 to-blue-500" />
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-900/50 dark:to-blue-900/30">
                    <MapPin className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Support Needed</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3 ml-9">Select areas where team support is required</p>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {SUPPORT_CATEGORIES.map(cat => (
                      <Badge
                        key={cat}
                        variant={supportNeeded.includes(cat) ? 'default' : 'outline'}
                        className={`cursor-pointer transition-all duration-200 ${supportNeeded.includes(cat) ? 'bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 border-0 text-white shadow-sm' : 'hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-200'} ${isLocked ? 'pointer-events-none' : ''}`}
                        onClick={() => !isLocked && toggleSupport(cat)}
                        data-testid={`support-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {cat}
                      </Badge>
                    ))}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400">Remarks</label>
                    <Textarea
                      value={remarks} onChange={e => setRemarks(e.target.value)}
                      placeholder="Additional comments or observations..."
                      className="mt-1 bg-white/50 dark:bg-slate-800/30" rows={3} disabled={isLocked}
                      data-testid="remarks"
                    />
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Month-on-Month Comparison */}
          {comparison?.months?.length > 0 && (
            <ComparisonTable
              comparison={comparison}
              selectedResource={selectedResource}
              selectedPlan={selectedPlan}
              headers={headers}
              onRefresh={generate}
            />
          )}

          {/* Calculated KPIs */}
          <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="kpi-section">
            <div className="h-1 bg-gradient-to-r from-teal-500 to-cyan-500" />
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-900/50 dark:to-cyan-900/30">
                  <Target className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Performance KPIs</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPICard label="Achievement %" value={fmtPct(data.calculated?.achievement_pct)} good={data.calculated?.achievement_pct >= 80} bad={data.calculated?.achievement_pct < 50} />
                <KPICard label="Pipeline Coverage" value={fmtPct(data.calculated?.pipeline_coverage)} good={data.calculated?.pipeline_coverage >= 100} bad={data.calculated?.pipeline_coverage < 50} />
                <KPICard label="Outstanding Ratio" value={fmtPct(data.calculated?.outstanding_ratio)} good={data.calculated?.outstanding_ratio < 20} bad={data.calculated?.outstanding_ratio > 50} invert />
                <KPICard label="Visit Productivity" value={data.calculated?.visit_productivity > 0 ? `₹${fmt(data.calculated.visit_productivity)}` : '-'} />
                <KPICard label="Call Productivity" value={data.calculated?.call_productivity > 0 ? `₹${fmt(data.calculated.call_productivity)}` : '-'} />
                <KPICard label="Conversion Rate" value={fmtPct(data.calculated?.account_conversion_rate)} good={data.calculated?.account_conversion_rate >= 20} />
              </div>
            </div>
          </Card>
        </>
      )}

      {!data && !loading && selectedPlan && selectedResource && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>Click "Generate" to compute performance metrics</p>
        </div>
      )}
    </div>
  );
}

function OverridableRow({ label, autoValue, overrideValue, editing, locked, onEdit, onChange, onSave, onReset, testId }) {
  const displayValue = overrideValue !== '' ? parseFloat(overrideValue) : autoValue;
  const hasOverride = overrideValue !== '' && overrideValue !== null && overrideValue !== undefined;
  return (
    <div className={`flex items-center justify-between py-1.5 px-2 rounded ${hasOverride ? 'bg-amber-50/60' : ''}`} data-testid={testId}>
      <span className="text-xs text-slate-500 flex items-center gap-1">
        {label}
        {hasOverride && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" title="Manual override" />}
      </span>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <>
            <input
              type="number"
              className="w-28 text-right text-sm font-medium border rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              value={overrideValue}
              onChange={e => onChange(e.target.value)}
              autoFocus
              data-testid={`${testId}-input`}
            />
            <button onClick={onSave} className="p-0.5 rounded hover:bg-blue-100 text-blue-600" title="Done" data-testid={`${testId}-save`}>
              <Check className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className={`text-sm font-semibold ${hasOverride ? 'text-amber-700' : 'text-slate-700'}`}>₹{fmt(displayValue)}</span>
            {!locked && (
              <button onClick={() => { onChange(String(autoValue || 0)); onEdit(); }} className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600" title="Override" data-testid={`${testId}-edit`}>
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {hasOverride && !locked && (
              <button onClick={onReset} className="p-0.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Reset to auto" data-testid={`${testId}-reset`}>
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}


// --- Sub-components ---

function SummaryTile({ label, value, icon: Icon, gradient, bgGradient, iconBg, textColor, sub, testId }) {
  return (
    <Card className={`relative overflow-hidden border-0 bg-gradient-to-br ${bgGradient} backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group`} data-testid={testId}>
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`} />
      <div className="p-3 sm:p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider line-clamp-1">{label}</p>
            <p className={`text-lg sm:text-xl font-bold ${textColor} tabular-nums`}>{value}</p>
            {sub && <p className="text-[10px] sm:text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={`p-1.5 rounded-lg ${iconBg} group-hover:scale-110 transition-transform duration-300`}>
            <Icon className={`h-4 w-4 ${textColor}`} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }) {
  const map = {
    not_created: { label: 'Not Created', cls: 'bg-slate-100 text-slate-600' },
    draft: { label: 'Draft', cls: 'bg-amber-100 text-amber-700' },
    submitted: { label: 'Submitted', cls: 'bg-blue-100 text-blue-700' },
    approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
    returned: { label: 'Returned', cls: 'bg-red-100 text-red-700' },
  };
  const s = map[status] || map.not_created;
  return <Badge className={s.cls}>{s.label}</Badge>;
}

function MetricCard({ label, value, icon, color, sub, testId }) {
  const bg = { slate: 'bg-slate-50 border-slate-200', blue: 'bg-blue-50 border-blue-200', emerald: 'bg-emerald-50 border-emerald-200', teal: 'bg-teal-50 border-teal-200', amber: 'bg-amber-50 border-amber-200', red: 'bg-red-50 border-red-200', purple: 'bg-purple-50 border-purple-200' };
  const txt = { slate: 'text-slate-700', blue: 'text-blue-700', emerald: 'text-emerald-700', teal: 'text-teal-700', amber: 'text-amber-700', red: 'text-red-700', purple: 'text-purple-700' };
  return (
    <div className={`rounded-xl border p-3 ${bg[color]}`} data-testid={testId}>
      <div className={`flex items-center gap-1.5 mb-1 ${txt[color]}`}>{icon}<span className="text-[10px] uppercase tracking-wider font-semibold">{label}</span></div>
      <p className={`text-lg font-bold ${txt[color]}`}>{value}</p>
      {sub && <p className="text-xs opacity-60">{sub}</p>}
    </div>
  );
}

function InfoRow({ label, value, highlight }) {
  const hlMap = { red: 'text-red-600 dark:text-red-400', green: 'text-emerald-600 dark:text-emerald-400', amber: 'text-amber-600 dark:text-amber-400' };
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-100 dark:border-slate-800">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? hlMap[highlight] : 'text-slate-700 dark:text-slate-300'}`}>{value}</span>
    </div>
  );
}

function AgingBucket({ label, value, color }) {
  const styles = {
    emerald: 'bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30',
    amber: 'bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/10 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30',
    orange: 'bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/10 text-orange-700 dark:text-orange-400 border border-orange-100 dark:border-orange-900/30',
    red: 'bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/10 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/30'
  };
  return (
    <div className={`rounded-lg p-2 text-center ${styles[color]}`}>
      <p className="text-[10px] font-medium uppercase">{label}</p>
      <p className="text-sm font-bold">₹{fmt(value)}</p>
    </div>
  );
}

function KPICard({ label, value, good, bad, invert }) {
  const isGood = invert ? bad : good;
  const isBad = invert ? good : bad;
  const gradient = isGood ? 'from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/10' : isBad ? 'from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/10' : 'from-slate-50 to-gray-50 dark:from-slate-950/20 dark:to-gray-950/10';
  const border = isGood ? 'border-emerald-200 dark:border-emerald-900/30' : isBad ? 'border-red-200 dark:border-red-900/30' : 'border-slate-200 dark:border-slate-800';
  const text = isGood ? 'text-emerald-700 dark:text-emerald-400' : isBad ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300';
  const topGrad = isGood ? 'from-emerald-500 to-teal-500' : isBad ? 'from-red-500 to-rose-500' : 'from-slate-400 to-gray-500';
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${gradient} ${border} p-3 text-center`}>
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${topGrad}`} />
      <p className="text-[10px] uppercase tracking-wider font-medium mb-1 text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${text}`}>{value}</p>
    </div>
  );
}

function CompRow({ label, months, field, prefix = '', suffix = '', rowIndex = 0 }) {
  const values = months.map(m => m[field] || 0);
  const last = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : 0;
  const change = prev > 0 ? ((last - prev) / prev * 100) : 0;
  const isEven = rowIndex % 2 === 0;
  return (
    <tr className={`border-b border-slate-100 dark:border-slate-800 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/10 transition-colors ${isEven ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}>
      <td className="p-2.5 text-xs font-medium text-slate-600 dark:text-slate-400">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="p-2.5 text-right text-sm font-medium text-slate-700 dark:text-slate-300">{prefix}{fmt(v)}{suffix}</td>
      ))}
      <td className="p-2.5 text-right">
        {change !== 0 ? (
          <span className={`text-xs font-semibold flex items-center justify-end gap-0.5 ${change > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {change > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(change).toFixed(1)}%
          </span>
        ) : <Minus className="h-3 w-3 text-slate-300 dark:text-slate-600 ml-auto" />}
      </td>
      <td className="p-2.5"></td>
    </tr>
  );
}


function ComparisonTable({ comparison, selectedResource, selectedPlan, headers, onRefresh }) {
  const [editValues, setEditValues] = useState({});
  const [editingRow, setEditingRow] = useState(null);
  const [savingRow, setSavingRow] = useState(null);

  const startEdit = (field) => {
    const initial = {};
    comparison.months.forEach(m => {
      const key = `${m.month}_${m.year}`;
      initial[key] = m[field === 'revenue' ? 'revenue_achieved' : 'total_outstanding'];
    });
    setEditValues(initial);
    setEditingRow(field);
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditValues({});
  };

  const saveRow = async (field) => {
    setSavingRow(field);
    try {
      for (const m of comparison.months) {
        const key = `${m.month}_${m.year}`;
        const val = parseFloat(editValues[key]);
        if (isNaN(val)) continue;
        const autoVal = field === 'revenue' ? m.auto_revenue : m.auto_outstanding;
        if (val === autoVal) continue;
        await fetch(`${API_URL}/api/performance/comparison/override`, {
          method: 'POST', headers,
          body: JSON.stringify({ resource_id: selectedResource[0], plan_id: selectedPlan, month: m.month, year: m.year, field, value: val })
        });
      }
      setEditingRow(null);
      setEditValues({});
      onRefresh();
    } catch (e) { console.error(e); }
    finally { setSavingRow(null); }
  };

  const resetRow = async (field) => {
    setSavingRow(field);
    try {
      for (const m of comparison.months) {
        await fetch(
          `${API_URL}/api/performance/comparison/override?resource_id=${selectedResource[0]}&plan_id=${selectedPlan}&month=${m.month}&year=${m.year}&field=${field}`,
          { method: 'DELETE', headers }
        );
      }
      setEditingRow(null);
      setEditValues({});
      onRefresh();
    } catch (e) { console.error(e); }
    finally { setSavingRow(null); }
  };

  const hasOverride = (field) => {
    const flag = field === 'revenue' ? 'has_revenue_override' : 'has_outstanding_override';
    return comparison.months.some(m => m[flag]);
  };

  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50" data-testid="comparison-section">
      <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/50 dark:to-violet-900/30">
            <BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Month-on-Month Comparison (Last 3 Months)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-50/80 to-violet-50/80 dark:from-indigo-950/20 dark:to-violet-950/10 border-b border-indigo-100 dark:border-indigo-900/30 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <th className="text-left p-2.5">Metric</th>
                {comparison.months.map(m => (
                  <th key={`${m.month}-${m.year}`} className="text-right p-2.5">{m.label}</th>
                ))}
                <th className="text-right p-2.5">Trend</th>
                <th className="text-center p-2.5 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              <EditableCompRow
                label="Revenue" months={comparison.months} field="revenue_achieved" autoField="auto_revenue"
                overrideFlag="has_revenue_override" prefix="₹" editingRow={editingRow} editValues={editValues}
                setEditValues={setEditValues} savingRow={savingRow} rowKey="revenue"
                onEdit={() => startEdit('revenue')} onSave={() => saveRow('revenue')}
                onCancel={cancelEdit} onReset={() => resetRow('revenue')} hasOverride={hasOverride('revenue')}
                rowIndex={0}
              />
              <CompRow label="Target" months={comparison.months} field="monthly_target" prefix="₹" rowIndex={1} />
              <CompRow label="Achievement %" months={comparison.months} field="achievement_pct" suffix="%" rowIndex={2} />
              <CompRow label="New Accounts" months={comparison.months} field="new_accounts" rowIndex={3} />
              <CompRow label="Existing Accounts" months={comparison.months} field="existing_accounts" rowIndex={4} />
              <CompRow label="Pipeline Value" months={comparison.months} field="pipeline_value" prefix="₹" rowIndex={5} />
              <CompRow label="Pipeline Accounts" months={comparison.months} field="pipeline_count" rowIndex={6} />
              <EditableCompRow
                label="Outstanding" months={comparison.months} field="total_outstanding" autoField="auto_outstanding"
                overrideFlag="has_outstanding_override" prefix="₹" editingRow={editingRow} editValues={editValues}
                setEditValues={setEditValues} savingRow={savingRow} rowKey="outstanding"
                onEdit={() => startEdit('outstanding')} onSave={() => saveRow('outstanding')}
                onCancel={cancelEdit} onReset={() => resetRow('outstanding')} hasOverride={hasOverride('outstanding')}
                rowIndex={7}
              />
              <CompRow label="Visits" months={comparison.months} field="visits" rowIndex={8} />
              <CompRow label="Calls" months={comparison.months} field="calls" rowIndex={9} />
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function EditableCompRow({ label, months, field, autoField, overrideFlag, prefix = '', editingRow, editValues, setEditValues, savingRow, rowKey, onEdit, onSave, onCancel, onReset, hasOverride, rowIndex = 0 }) {
  const isEditing = editingRow === rowKey;
  const isSaving = savingRow === rowKey;
  const values = months.map(m => m[field] || 0);
  const last = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : 0;
  const change = prev > 0 ? ((last - prev) / prev * 100) : 0;
  const isEven = rowIndex % 2 === 0;

  return (
    <tr className={`border-b border-slate-100 dark:border-slate-800 ${isEditing ? 'bg-blue-50/50 dark:bg-blue-950/20' : hasOverride ? 'bg-amber-50/30 dark:bg-amber-950/10' : isEven ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''} hover:bg-indigo-50/40 dark:hover:bg-indigo-950/10 transition-colors`} data-testid={`comp-row-${rowKey}`}>
      <td className="p-2.5 text-xs font-medium text-slate-600 flex items-center gap-1.5">
        {label}
        {hasOverride && !isEditing && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" title="Manual override applied" />}
      </td>
      {months.map((m, i) => {
        const key = `${m.month}_${m.year}`;
        return (
          <td key={i} className="p-2.5 text-right">
            {isEditing ? (
              <input
                type="number"
                className="w-28 ml-auto text-right text-sm font-medium border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={editValues[key] ?? ''}
                onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                data-testid={`edit-${rowKey}-${m.month}-${m.year}`}
              />
            ) : (
              <span className={`text-sm font-medium ${m[overrideFlag] ? 'text-amber-700' : ''}`}>
                {prefix}{fmt(values[i])}
              </span>
            )}
          </td>
        );
      })}
      <td className="p-2.5 text-right">
        {change !== 0 ? (
          <span className={`text-xs font-semibold flex items-center justify-end gap-0.5 ${change > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {change > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(change).toFixed(1)}%
          </span>
        ) : <Minus className="h-3 w-3 text-slate-300 ml-auto" />}
      </td>
      <td className="p-2.5 text-center">
        {isEditing ? (
          <div className="flex items-center justify-center gap-1">
            <button onClick={onSave} disabled={isSaving} className="p-1 rounded hover:bg-blue-100 text-blue-600" title="Save" data-testid={`save-${rowKey}`}>
              {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            </button>
            <button onClick={onCancel} className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Cancel" data-testid={`cancel-${rowKey}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1">
            <button onClick={onEdit} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600" title="Edit" data-testid={`edit-btn-${rowKey}`}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {hasOverride && (
              <button onClick={onReset} disabled={isSaving} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Reset to auto-computed" data-testid={`reset-${rowKey}`}>
                {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
