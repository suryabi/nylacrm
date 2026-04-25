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
import { useAuth } from '../context/AuthContext';
import AppBreadcrumb from '../components/AppBreadcrumb';
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

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Default to last month
const getLastMonth = () => {
  const now = new Date();
  const m = now.getMonth(); // 0-indexed, so getMonth() gives last month number in 1-indexed
  return m === 0 ? 12 : m;
};
const getLastMonthYear = () => {
  const now = new Date();
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
};

// Session storage helpers for filter persistence
const ssGet = (key, fallback) => { try { const v = sessionStorage.getItem(`perf_${key}`); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; } };
const ssSet = (key, val) => { sessionStorage.setItem(`perf_${key}`, JSON.stringify(val)); };

export default function PerformanceTracker() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { statuses: leadStatuses, getStatusLabel, getStatusById } = useLeadStatuses();
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(() => ssGet('plan', ''));
  const [resources, setResources] = useState([]);
  const [territoryFilter, setTerritoryFilter] = useState(() => ssGet('territory', 'all'));
  const [cityFilter, setCityFilter] = useState(() => ssGet('city', 'all'));
  const [selectedResource, setSelectedResource] = useState(() => ssGet('resource', []));
  const [selectedMonth, setSelectedMonth] = useState(() => ssGet('month', getLastMonth()));
  const [selectedYear, setSelectedYear] = useState(() => ssGet('year', getLastMonthYear()));
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
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
  const headers = { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };

  // Persist filters to sessionStorage on change
  useEffect(() => { ssSet('plan', selectedPlan); }, [selectedPlan]);
  useEffect(() => { ssSet('territory', territoryFilter); }, [territoryFilter]);
  useEffect(() => { ssSet('city', cityFilter); }, [cityFilter]);
  useEffect(() => { ssSet('resource', selectedResource); }, [selectedResource]);
  useEffect(() => { ssSet('month', selectedMonth); }, [selectedMonth]);
  useEffect(() => { ssSet('year', selectedYear); }, [selectedYear]);

  // Load all sales resources on mount (independent of plan)
  useEffect(() => {
    fetch(`${API_URL}/api/performance/all-sales-resources`, { headers })
      .then(r => r.json()).then(setResources).catch(() => {});
    fetch(`${API_URL}/api/performance/target-plans`, { headers })
      .then(r => r.json()).then(setPlans).catch(() => {});
  }, []);

  // Auto-select the logged-in user as default resource (only once, when resources load and no session state exists)
  useEffect(() => {
    if (defaultsApplied || !user?.id || resources.length === 0) return;
    // Only apply defaults if no resource was restored from session
    const savedResource = ssGet('resource', []);
    if (savedResource.length === 0) {
      const match = resources.find(r => r.resource_id === user.id);
      if (match) {
        setSelectedResource([match.resource_id]);
      }
    }
    setDefaultsApplied(true);
  }, [resources, user, defaultsApplied]);

  // When plan changes, reload plan-specific resources if plan is selected (for target amounts)
  useEffect(() => {
    if (!selectedPlan) return;
    fetch(`${API_URL}/api/performance/resources-for-plan/${selectedPlan}`, { headers })
      .then(r => r.json()).then(planRes => {
        // Merge plan resources with all resources — plan resources have target amounts
        setResources(prev => {
          const planMap = new Map(planRes.map(r => [r.resource_id, r]));
          // If plan has specific resource allocations, use those (they contain territory_id, city, amount)
          if (planRes.length > 0) return planRes;
          return prev;
        });
      }).catch(() => {});
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
      const planParam = selectedPlan ? `&plan_id=${selectedPlan}` : '';
      const res = await fetch(
        `${API_URL}/api/performance/generate?resource_id=${resourceParam}${planParam}&month=${selectedMonth}&year=${selectedYear}`,
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
      // Fetch comparison (only if plan selected)
      if (selectedPlan) {
        const compRes = await fetch(
          `${API_URL}/api/performance/comparison?resource_id=${resourceParam}&plan_id=${selectedPlan}&months=3&month=${selectedMonth}&year=${selectedYear}`,
          { headers }
        );
        setComparison(await compRes.json());
      } else {
        setComparison(null);
      }
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
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-6 bg-slate-50 min-h-screen" data-testid="performance-tracker">
      <AppBreadcrumb />
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-slate-100 rounded-sm">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-slate-700" />
          </div>
          Monthly Performance Tracker
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 ml-9 sm:ml-12">Track sales outcomes, activity, pipeline, and collections per resource</p>
      </div>

      {/* Selectors */}
      <div className="bg-white border border-slate-200 rounded-sm p-3 sm:p-4 lg:p-5 space-y-3" data-testid="performance-selectors">
          {/* Row 1: Location & Resource filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-1.5 block">Territory</label>
              <Select value={territoryFilter} onValueChange={(v) => { setTerritoryFilter(v); setCityFilter('all'); setSelectedResource([]); }}>
                <SelectTrigger data-testid="select-territory"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Territories</SelectItem>
                  {planTerritories.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-1.5 block">City</label>
              <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setSelectedResource([]); }}>
                <SelectTrigger data-testid="select-city"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {planCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-1.5 block">Resource</label>
              <MultiSelect
                options={filteredResources.map(r => ({ value: r.resource_id, label: `${r.resource_name}` }))}
                selected={selectedResource}
                onChange={setSelectedResource}
                placeholder="All Resources"
                data-testid="select-resource"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-1.5 block">Target Plan <span className="text-slate-400 normal-case">(optional)</span></label>
              <Select value={selectedPlan || '__none__'} onValueChange={v => setSelectedPlan(v === '__none__' ? '' : v)}>
                <SelectTrigger data-testid="select-plan"><SelectValue placeholder="No plan selected" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No Plan</SelectItem>
                  {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Row 2: Time period & Generate */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 items-end">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-1.5 block">Month</label>
              <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(parseInt(v))}>
                <SelectTrigger data-testid="select-month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-1.5 block">Year</label>
              <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button onClick={generate} disabled={loading || !hasSelection} className="w-full bg-slate-900 hover:bg-slate-800 text-white border-0 rounded-sm" data-testid="generate-btn">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Generate
              </Button>
            </div>
          </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {data && !loading && (
        <>
          {/* Status bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white rounded-sm p-3 sm:p-4 border border-slate-200 gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Show resource initials for multi-resource, full name for single */}
              {(() => {
                const names = (data.resource_name || '').split(', ').filter(Boolean);
                if (names.length === 1) {
                  return <span className="text-sm font-bold text-slate-900">{names[0]}</span>;
                }
                return (
                  <div className="flex items-center gap-1">
                    {names.slice(0, 5).map((name, i) => {
                      const parts = name.trim().split(' ').filter(Boolean);
                      const initials = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.[0] || '?';
                      return (
                        <span key={i} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 text-white text-[10px] font-bold cursor-default" title={name}>
                          {initials.toUpperCase()}
                        </span>
                      );
                    })}
                    {names.length > 5 && (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-300 text-slate-700 text-[10px] font-bold" title={names.slice(5).join(', ')}>
                        +{names.length - 5}
                      </span>
                    )}
                  </div>
                );
              })()}
              {data.resource_city && <Badge variant="outline" className="bg-slate-50 text-xs rounded-sm border-slate-200">{data.resource_city}</Badge>}
              {data.plan_name && <Badge variant="outline" className="bg-slate-50 text-xs rounded-sm border-slate-200">{data.plan_name}</Badge>}
              {territoryFilter !== 'all' && <Badge className="bg-slate-900 text-white text-xs rounded-sm">{planTerritories.find(t => t.id === territoryFilter)?.name}</Badge>}
              {cityFilter !== 'all' && <Badge className="bg-slate-900 text-white text-xs rounded-sm">{cityFilter}</Badge>}
              {resolveResourceIds().length === 1 && <StatusBadge status={data.status} />}
              {resolveResourceIds().length > 1 && <Badge className="bg-slate-100 text-slate-700 text-xs rounded-sm">{resolveResourceIds().length} resources</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {resolveResourceIds().length === 1 && !isLocked && data.status !== 'submitted' && (
                <>
                  <Button variant="outline" size="sm" className="rounded-sm" onClick={() => saveRecord(false)} disabled={saving} data-testid="save-draft-btn">
                    <Save className="h-4 w-4 mr-1" />{saving ? 'Saving...' : 'Save Draft'}
                  </Button>
                  <Button size="sm" className="rounded-sm bg-slate-900 hover:bg-slate-800" onClick={() => saveRecord(true)} disabled={saving} data-testid="submit-btn">
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

          {/* Summary Cards Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-px bg-slate-200 border border-slate-200 overflow-hidden rounded-sm" data-testid="summary-cards">
            <SummaryTile label="Target" value={`₹${fmt(data.revenue?.target)}`} icon={Target} testId="metric-target" />
            <SummaryTile label="Revenue" value={`₹${fmt(data.revenue?.this_month)}`} icon={DollarSign} sub={fmtPct(data.revenue?.achievement_pct)} testId="metric-achieved" />
            <SummaryTile label="Existing A/C" value={data.accounts?.existing_count} icon={Users} testId="metric-existing" />
            <SummaryTile label="New A/C" value={data.accounts?.new_onboarded} icon={Building2} testId="metric-new" />
            <SummaryTile label={`${MONTH_NAMES[data.pipeline?.next_month] || 'Next'} Pipeline`} value={`₹${fmt(data.pipeline?.next_month_pipeline_value)}`} icon={TrendingUp} sub={`${data.pipeline?.next_month_leads_count || 0} leads`} testId="metric-pipeline" />
            <SummaryTile label="Outstanding" value={`₹${fmt(data.collections?.total_outstanding)}`} icon={AlertTriangle} testId="metric-outstanding" />
            <SummaryTile label="Activities" value={data.activities?.total || 0} icon={Phone} sub={`${data.activities?.unique_visits || 0} visits`} testId="metric-activity" />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
            {/* Revenue Section */}
            <div className="bg-white border border-slate-200 rounded-sm" data-testid="revenue-section">
              <div className="flex items-center gap-2.5 p-4 sm:p-5 pb-3 sm:pb-4 border-b border-slate-100">
                <div className="p-1.5 bg-slate-100 rounded-sm">
                  <DollarSign className="h-4 w-4 text-slate-700" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Revenue Metrics</h3>
              </div>
              <div className="p-4 sm:p-5 pt-3 sm:pt-4">
                <div className="space-y-1">
                  <div className="grid grid-cols-2 gap-3">
                    <InfoRow label="Monthly Target" value={`₹${fmt(data.revenue?.target)}`} />
                    <InfoRow label="Achievement %" value={fmtPct(data.revenue?.achievement_pct)} highlight={data.revenue?.achievement_pct < 50 ? 'red' : data.revenue?.achievement_pct >= 100 ? 'green' : 'amber'} />
                  </div>
                  <div className="space-y-1 border-t border-slate-100 pt-3 mt-3">
                    <OverridableRow label="Revenue Lifetime (As-on-date)" autoValue={data.revenue?.lifetime} overrideValue={revenueOverrides.lifetime} editing={revenueEditing.lifetime} locked={isLocked} onEdit={() => setRevenueEditing(p => ({ ...p, lifetime: true }))} onChange={(v) => setRevenueOverrides(p => ({ ...p, lifetime: v }))} onSave={() => setRevenueEditing(p => ({ ...p, lifetime: false }))} onReset={() => { setRevenueOverrides(p => ({ ...p, lifetime: '' })); setRevenueEditing(p => ({ ...p, lifetime: false })); }} testId="revenue-lifetime" />
                    <OverridableRow label="Revenue This Month (All Accounts)" autoValue={data.revenue?.this_month} overrideValue={revenueOverrides.this_month} editing={revenueEditing.this_month} locked={isLocked} onEdit={() => setRevenueEditing(p => ({ ...p, this_month: true }))} onChange={(v) => setRevenueOverrides(p => ({ ...p, this_month: v }))} onSave={() => setRevenueEditing(p => ({ ...p, this_month: false }))} onReset={() => { setRevenueOverrides(p => ({ ...p, this_month: '' })); setRevenueEditing(p => ({ ...p, this_month: false })); }} testId="revenue-this-month" />
                    <OverridableRow label="Revenue from New Accounts" autoValue={data.revenue?.from_new_accounts} overrideValue={revenueOverrides.new_accounts} editing={revenueEditing.new_accounts} locked={isLocked} onEdit={() => setRevenueEditing(p => ({ ...p, new_accounts: true }))} onChange={(v) => setRevenueOverrides(p => ({ ...p, new_accounts: v }))} onSave={() => setRevenueEditing(p => ({ ...p, new_accounts: false }))} onReset={() => { setRevenueOverrides(p => ({ ...p, new_accounts: '' })); setRevenueEditing(p => ({ ...p, new_accounts: false })); }} testId="revenue-new-accounts" />
                  </div>
                </div>
              </div>
            </div>

            {/* Accounts Section */}
            <div className="bg-white border border-slate-200 rounded-sm" data-testid="accounts-section">
              <div className="flex items-center gap-2.5 p-4 sm:p-5 pb-3 sm:pb-4 border-b border-slate-100">
                <div className="p-1.5 bg-slate-100 rounded-sm">
                  <Users className="h-4 w-4 text-slate-700" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Account Metrics</h3>
              </div>
              <div className="p-4 sm:p-5 pt-3 sm:pt-4 space-y-4">
                {/* Existing Accounts */}
                <div data-testid="existing-accounts-tile">
                  <div className="flex justify-between items-center py-2 sm:py-2.5 px-3 sm:px-3.5 bg-slate-50 border border-slate-200 rounded-sm">
                    <span className="text-[10px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wide">Existing Accounts (Lifetime)</span>
                    <span className="text-lg sm:text-xl font-light text-slate-900 tabular-nums">{data.accounts?.existing_count}</span>
                  </div>
                  {(data.accounts?.existing_accounts || []).length > 0 && (
                    <div className="mt-2 space-y-px">
                      {(expandedAccountList.existing
                        ? data.accounts.existing_accounts
                        : data.accounts.existing_accounts.slice(0, 3)
                      ).map((acc, idx) => (
                        <div key={acc.id || idx} className="flex items-center justify-between py-2 px-3 text-sm bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                          <span className="font-medium text-slate-700">{acc.name || 'Unknown'}</span>
                          <AccountValueCell account={acc} planId={selectedPlan} onRefresh={generate} />
                        </div>
                      ))}
                      {data.accounts.existing_accounts.length > 3 && (
                        <button
                          onClick={() => setExpandedAccountList(p => ({ ...p, existing: !p.existing }))}
                          className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 flex items-center gap-1 font-semibold uppercase tracking-wide"
                          data-testid="expand-existing-accounts"
                        >
                          {expandedAccountList.existing ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {expandedAccountList.existing ? 'Show less' : `Show all ${data.accounts.existing_accounts.length}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* New Accounts This Month */}
                <div data-testid="new-accounts-tile">
                  <div className={`flex justify-between items-center py-2 sm:py-2.5 px-3 sm:px-3.5 border rounded-sm ${data.accounts?.new_onboarded > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <span className="text-[10px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wide">New Accounts This Month</span>
                    <span className={`text-lg sm:text-xl font-light tabular-nums ${data.accounts?.new_onboarded > 0 ? 'text-emerald-800' : 'text-red-700'}`}>{data.accounts?.new_onboarded}</span>
                  </div>
                  {(data.accounts?.new_accounts || []).length > 0 && (
                    <div className="mt-2 space-y-px">
                      {(expandedAccountList.new
                        ? data.accounts.new_accounts
                        : data.accounts.new_accounts.slice(0, 3)
                      ).map((acc, idx) => (
                        <div key={acc.id || idx} className="flex items-center justify-between py-2 px-3 text-sm bg-white border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                          <span className="font-medium text-slate-700">{acc.name || 'Unknown'}</span>
                          <AccountValueCell account={acc} planId={selectedPlan} onRefresh={generate} />
                        </div>
                      ))}
                      {data.accounts.new_accounts.length > 3 && (
                        <button
                          onClick={() => setExpandedAccountList(p => ({ ...p, new: !p.new }))}
                          className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 flex items-center gap-1 font-semibold uppercase tracking-wide"
                          data-testid="expand-new-accounts"
                        >
                          {expandedAccountList.new ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {expandedAccountList.new ? 'Show less' : `Show all ${data.accounts.new_accounts.length}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pipeline Section */}
            <div className="bg-white border border-slate-200 rounded-sm" data-testid="pipeline-section">
              <div className="flex items-center gap-2.5 p-4 sm:p-5 pb-3 sm:pb-4 border-b border-slate-100">
                <div className="p-1.5 bg-slate-100 rounded-sm">
                  <TrendingUp className="h-4 w-4 text-slate-700" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Pipeline Metrics</h3>
              </div>
              <div className="p-4 sm:p-5 pt-3 sm:pt-4">
                <table className="w-full text-left border-collapse" data-testid="pipeline-status-table">
                  <thead>
                    <tr>
                      <th className="pb-3 border-b border-slate-200 text-[10px] uppercase tracking-wider font-semibold text-slate-500">Status</th>
                      <th className="pb-3 border-b border-slate-200 text-[10px] uppercase tracking-wider font-semibold text-slate-500 text-right">Leads</th>
                      <th className="pb-3 border-b border-slate-200 text-[10px] uppercase tracking-wider font-semibold text-slate-500 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.pipeline?.by_status || []).map((row) => {
                      const statusInfo = getStatusById(row.status);
                      const dotColor = statusInfo?.bg || 'bg-slate-400';
                      return (
                      <tr
                        key={row.status}
                        className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => {
                          const params = new URLSearchParams();
                          params.set('status', row.status);
                          const rids = resolveResourceIds();
                          if (rids.length > 0) params.set('assigned_to', rids.join(','));
                          navigate(`/leads?${params.toString()}`);
                        }}
                        data-testid={`pipeline-row-${row.status}`}
                      >
                        <td className="py-3 text-sm font-medium text-slate-900 capitalize flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                          {getStatusLabel(row.status)}
                          <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-slate-300 ml-auto" />
                        </td>
                        <td className="py-3 text-right text-sm font-medium text-slate-700 tabular-nums">{row.count}</td>
                        <td className="py-3 text-right text-sm font-medium text-slate-700 tabular-nums">₹{fmt(row.value)}</td>
                      </tr>
                      );
                    })}
                    {(data.pipeline?.by_status || []).length === 0 && (
                      <tr><td colSpan={3} className="text-center py-6 text-xs text-slate-400">No active pipeline leads</td></tr>
                    )}
                    <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                      <td className="py-3 text-xs text-slate-700 uppercase tracking-wide">Total</td>
                      <td className="py-3 text-right text-sm text-slate-900 tabular-nums">{data.pipeline?.total_count || 0}</td>
                      <td className="py-3 text-right text-sm text-slate-900 tabular-nums">₹{fmt(data.pipeline?.total_value)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Leads Targeting Next Month - Block CTA */}
                <div
                  className="flex justify-between items-center p-3 sm:p-4 bg-slate-50 border border-slate-200 rounded-sm mt-4 sm:mt-5 hover:border-slate-400 hover:bg-slate-100 transition-colors cursor-pointer group"
                  onClick={() => {
                    const nm = data.pipeline?.next_month;
                    const ny = data.pipeline?.next_year;
                    const params = new URLSearchParams();
                    params.set('target_closure_month', nm);
                    params.set('target_closure_year', ny);
                    const rids = resolveResourceIds();
                    if (rids.length > 0) params.set('assigned_to', rids.join(','));
                    navigate(`/leads?${params.toString()}`);
                  }}
                  data-testid="leads-targeting-next-month-link"
                >
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-900 uppercase tracking-wide">Leads Targeting {MONTH_NAMES[data.pipeline?.next_month] || 'Next Month'}</span>
                  <span className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2 tabular-nums">
                    {data.pipeline?.next_month_leads_count || 0}
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <InfoRow label={`${MONTH_NAMES[data.pipeline?.next_month] || 'Next'} Pipeline Value`} value={`₹${fmt(data.pipeline?.next_month_pipeline_value)}`} />
                  <InfoRow label="Coverage Ratio" value={fmtPct(data.pipeline?.coverage_ratio)} highlight={data.pipeline?.coverage_ratio < 50 ? 'red' : 'green'} />
                </div>
              </div>
            </div>

            {/* Outstanding Section */}
            <div className="bg-white border border-slate-200 rounded-sm" data-testid="outstanding-section">
              <div className="flex items-center gap-2.5 p-4 sm:p-5 pb-3 sm:pb-4 border-b border-slate-100 cursor-pointer" onClick={() => toggleSection('outstanding')}>
                <div className="p-1.5 bg-slate-100 rounded-sm">
                  <AlertTriangle className="h-4 w-4 text-slate-700" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Collections / Outstanding</h3>
                {expandedSections.outstanding ? <ChevronDown className="h-4 w-4 ml-auto text-slate-400" /> : <ChevronRight className="h-4 w-4 ml-auto text-slate-400" />}
              </div>
              <div className="p-4 sm:p-5 pt-3 sm:pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow label="Total Outstanding" value={`₹${fmt(data.collections?.total_outstanding)}`} highlight={data.collections?.total_outstanding > 0 ? 'red' : 'green'} />
                  <InfoRow label="Outstanding Ratio" value={fmtPct(data.collections?.outstanding_ratio)} />
                </div>
                {data.collections?.aging && (
                  <div className="mt-3 sm:mt-4 grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                    <AgingBucket label="0-30d" value={data.collections.aging['0_30']} color="emerald" />
                    <AgingBucket label="31-60d" value={data.collections.aging['31_60']} color="amber" />
                    <AgingBucket label="61-90d" value={data.collections.aging['61_90']} color="orange" />
                    <AgingBucket label="90+d" value={data.collections.aging['90_plus']} color="red" />
                  </div>
                )}
                {expandedSections.outstanding && data.collections?.account_details?.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wider mb-2">Account-Level Outstanding</p>
                    {data.collections.account_details.slice(0, 10).map(a => (
                      <div key={a.account_id} className="text-sm flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-600">{a.account_id?.slice(0, 12)}... ({a.invoices} inv)</span>
                        <span className="font-semibold text-red-700 tabular-nums">₹{fmt(a.outstanding)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Activity Section */}
            <div className="bg-white border border-slate-200 rounded-sm" data-testid="activity-section">
              <div className="flex items-center gap-2.5 p-4 sm:p-5 pb-3 sm:pb-4 border-b border-slate-100">
                <div className="p-1.5 bg-slate-100 rounded-sm">
                  <Phone className="h-4 w-4 text-slate-700" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Activity Metrics</h3>
              </div>
              <div className="p-3 sm:p-4 lg:p-5 pt-3 sm:pt-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-2 sm:mb-3">Total Activities</p>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    <div className="flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 bg-slate-50 border border-slate-200 rounded-sm">
                      <span className="text-xs sm:text-sm text-slate-600 flex items-center gap-1.5"><MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400" />Messages</span>
                      <span className="text-sm sm:text-base font-semibold text-slate-900 tabular-nums">{data.activities?.messages || 0}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 bg-slate-50 border border-slate-200 rounded-sm">
                      <span className="text-xs sm:text-sm text-slate-600 flex items-center gap-1.5"><Phone className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400" />Calls</span>
                      <span className="text-sm sm:text-base font-semibold text-slate-900 tabular-nums">{data.activities?.calls || 0}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 bg-slate-50 border border-slate-200 rounded-sm">
                      <span className="text-xs sm:text-sm text-slate-600 flex items-center gap-1.5"><MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400" />Visits</span>
                      <span className="text-sm sm:text-base font-semibold text-slate-900 tabular-nums">{data.activities?.visits || 0}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 bg-slate-50 border border-slate-200 rounded-sm">
                      <span className="text-xs sm:text-sm text-slate-600 flex items-center gap-1.5"><Mail className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400" />Emails</span>
                      <span className="text-sm sm:text-base font-semibold text-slate-900 tabular-nums">{data.activities?.emails || 0}</span>
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-3 sm:pt-4">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.15em] mb-2 sm:mb-3">Unique Customers Reached</p>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    <div className="flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 border border-slate-200 rounded-sm">
                      <span className="text-xs sm:text-sm text-slate-600">Visits</span>
                      <span className="text-sm sm:text-base font-semibold text-slate-900 tabular-nums">{data.activities?.unique_visits || 0}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 border border-slate-200 rounded-sm">
                      <span className="text-xs sm:text-sm text-slate-600">Messages</span>
                      <span className="text-sm sm:text-base font-semibold text-slate-900 tabular-nums">{data.activities?.unique_messages || 0}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 border border-slate-200 rounded-sm">
                      <span className="text-xs sm:text-sm text-slate-600">Calls</span>
                      <span className="text-sm sm:text-base font-semibold text-slate-900 tabular-nums">{data.activities?.unique_calls || 0}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 sm:py-2.5 px-2.5 sm:px-3 border border-slate-200 rounded-sm">
                      <span className="text-xs sm:text-sm text-slate-600">Emails</span>
                      <span className="text-sm sm:text-base font-semibold text-slate-900 tabular-nums">{data.activities?.unique_emails || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Support Section */}
            <div className="bg-white border border-slate-200 rounded-sm" data-testid="support-section">
              <div className="flex items-center gap-2.5 p-4 sm:p-5 pb-3 sm:pb-4 border-b border-slate-100">
                <div className="p-1.5 bg-slate-100 rounded-sm">
                  <MapPin className="h-4 w-4 text-slate-700" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Support Needed</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Select areas where team support is required</p>
                </div>
              </div>
              <div className="p-4 sm:p-5 pt-3 sm:pt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {SUPPORT_CATEGORIES.map(cat => (
                    <Badge
                      key={cat}
                      variant={supportNeeded.includes(cat) ? 'default' : 'outline'}
                      className={`cursor-pointer transition-all rounded-sm ${supportNeeded.includes(cat) ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900' : 'hover:bg-slate-50 border-slate-300 text-slate-600'} ${isLocked ? 'pointer-events-none' : ''}`}
                      onClick={() => !isLocked && toggleSupport(cat)}
                      data-testid={`support-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Remarks</label>
                  <Textarea
                    value={remarks} onChange={e => setRemarks(e.target.value)}
                    placeholder="Additional comments or observations..."
                    className="mt-1.5 bg-slate-50 border-slate-200 rounded-sm" rows={3} disabled={isLocked}
                    data-testid="remarks"
                  />
                </div>
              </div>
            </div>
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
          <div className="bg-white border border-slate-200 rounded-sm p-3 sm:p-4 lg:p-5" data-testid="kpi-section">
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900 mb-3 sm:mb-4">Performance KPIs</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard label="Achievement %" value={fmtPct(data.calculated?.achievement_pct)} good={data.calculated?.achievement_pct >= 80} bad={data.calculated?.achievement_pct < 50} />
                <KPICard label="Pipeline Coverage" value={fmtPct(data.calculated?.pipeline_coverage)} good={data.calculated?.pipeline_coverage >= 100} bad={data.calculated?.pipeline_coverage < 50} />
                <KPICard label="Outstanding Ratio" value={fmtPct(data.calculated?.outstanding_ratio)} good={data.calculated?.outstanding_ratio < 20} bad={data.calculated?.outstanding_ratio > 50} invert />
                <KPICard label="Conversion Rate" value={fmtPct(data.calculated?.account_conversion_rate)} good={data.calculated?.account_conversion_rate >= 20} />
              </div>
          </div>
        </>
      )}

      {!data && !loading && (
        <div className="text-center py-20 text-slate-400">
          <BarChart3 className="h-10 w-10 mx-auto mb-4 opacity-30" />
          <p className="text-sm">Select filters and click "Generate" to compute performance metrics</p>
        </div>
      )}
    </div>
  );
}

function OverridableRow({ label, autoValue, overrideValue, editing, locked, onEdit, onChange, onSave, onReset, testId }) {
  const displayValue = overrideValue !== '' ? parseFloat(overrideValue) : autoValue;
  const hasOverride = overrideValue !== '' && overrideValue !== null && overrideValue !== undefined;
  return (
    <div className={`flex items-center justify-between py-2.5 px-2 rounded ${hasOverride ? 'bg-amber-50/60' : ''}`} data-testid={testId}>
      <span className="text-sm text-slate-500 flex items-center gap-1">
        {label}
        {hasOverride && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" title="Manual override" />}
      </span>
      <div className="flex items-center gap-1.5">
        {editing ? (
          <>
            <input
              type="number"
              className="w-28 text-right text-base font-bold border rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
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
            <span className={`text-base font-bold tabular-nums ${hasOverride ? 'text-amber-700' : 'text-slate-900'}`}>₹{fmt(displayValue)}</span>
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

function SummaryTile({ label, value, icon: Icon, sub, testId }) {
  return (
    <div className="bg-white p-3 sm:p-4 relative group flex flex-col justify-between min-h-[80px] sm:min-h-[90px] hover:bg-slate-50 transition-colors overflow-hidden" data-testid={testId}>
      <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 uppercase tracking-[0.15em] leading-tight pr-5">{label}</p>
      <Icon className="h-3.5 w-3.5 text-slate-300 absolute top-3 right-3 sm:top-4 sm:right-4" />
      <div className="min-w-0 mt-auto">
        <p className="text-base sm:text-lg font-bold tracking-tight text-slate-900 tabular-nums truncate" title={String(value)}>{value}</p>
        <p className="text-[9px] sm:text-[10px] text-slate-400 font-medium h-4 truncate">{sub || '\u00A0'}</p>
      </div>
    </div>
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
  const hlMap = { red: 'text-red-700', green: 'text-emerald-700', amber: 'text-amber-700' };
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className={`text-base font-bold tabular-nums ${highlight ? hlMap[highlight] : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function AgingBucket({ label, value, color }) {
  const styles = {
    emerald: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border border-amber-200',
    orange: 'bg-orange-50 text-orange-800 border border-orange-200',
    red: 'bg-red-50 text-red-800 border border-red-200'
  };
  return (
    <div className={`rounded-sm p-2 sm:p-2.5 text-center ${styles[color]}`}>
      <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider">{label}</p>
      <p className="text-xs sm:text-sm font-bold tabular-nums mt-0.5 sm:mt-1 truncate">₹{fmt(value)}</p>
    </div>
  );
}

function KPICard({ label, value, good, bad, invert }) {
  const isGood = invert ? bad : good;
  const isBad = invert ? good : bad;
  const bg = isGood ? 'bg-emerald-50 border-emerald-200' : isBad ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200';
  const text = isGood ? 'text-emerald-800' : isBad ? 'text-red-700' : 'text-slate-900';
  return (
    <div className={`border rounded-sm p-3 sm:p-4 text-center ${bg}`}>
      <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-500 mb-1.5">{label}</p>
      <p className={`text-lg sm:text-xl lg:text-2xl font-semibold tracking-tight tabular-nums ${text}`}>{value}</p>
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
    <tr className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isEven ? 'bg-slate-50/60' : ''}`}>
      <td className="p-2.5 text-xs font-semibold text-slate-700">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="p-2.5 text-right text-sm font-medium text-slate-700 tabular-nums">{prefix}{fmt(v)}{suffix}</td>
      ))}
      <td className="p-2.5 text-right">
        {change !== 0 ? (
          <span className={`text-xs font-semibold flex items-center justify-end gap-0.5 ${change > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {change > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(change).toFixed(1)}%
          </span>
        ) : <Minus className="h-3 w-3 text-slate-300 ml-auto" />}
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
    <div className="bg-white border border-slate-200 rounded-sm" data-testid="comparison-section">
      <div className="p-4 sm:p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 mb-4 flex items-center gap-2.5">
          <div className="p-1.5 bg-slate-100 rounded-sm"><BarChart3 className="h-4 w-4 text-slate-700" /></div>
          Month-on-Month Comparison
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider">
                <th className="text-left p-2.5 font-semibold">Metric</th>
                {comparison.months.map(m => (
                  <th key={`${m.month}-${m.year}`} className="text-right p-2.5">{m.label}</th>
                ))}
                <th className="text-right p-2.5 font-semibold">Trend</th>
                <th className="text-center p-2.5 w-24 font-semibold">Actions</th>
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
    </div>
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
    <tr className={`border-b border-slate-100 ${isEditing ? 'bg-blue-50' : hasOverride ? 'bg-amber-50/40' : isEven ? 'bg-slate-50/60' : ''} hover:bg-slate-50 transition-colors`} data-testid={`comp-row-${rowKey}`}>
      <td className="p-2.5 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
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

function AccountValueCell({ account, planId, onRefresh }) {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState('');
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
  const headers = { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };

  const hasManual = account.manual_value != null;
  const displayVal = account.display_value || 0;

  const save = async () => {
    const num = parseFloat(val);
    if (isNaN(num)) { setEditing(false); return; }
    await fetch(`${API_URL}/api/performance/account-value-override`, {
      method: 'POST', headers,
      body: JSON.stringify({ account_id: account.id, value: num, plan_id: planId })
    });
    setEditing(false);
    onRefresh();
  };

  const reset = async () => {
    await fetch(`${API_URL}/api/performance/account-value-override?account_id=${account.id}&plan_id=${planId}`, {
      method: 'DELETE', headers
    });
    onRefresh();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          className="w-20 text-right text-xs border rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={val}
          onChange={e => setVal(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          data-testid={`account-override-input-${account.id}`}
        />
        <button onClick={save} className="p-0.5 rounded hover:bg-blue-100 text-blue-600" data-testid={`account-override-save-${account.id}`}>
          <Check className="h-3 w-3" />
        </button>
        <button onClick={() => setEditing(false)} className="p-0.5 rounded hover:bg-slate-100 text-slate-400" data-testid={`account-override-cancel-${account.id}`}>
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className={`text-xs font-semibold tabular-nums ${hasManual ? 'text-amber-700' : 'text-slate-600'}`} data-testid={`account-value-${account.id}`}>
        {displayVal > 0 ? `₹${fmt(displayVal)}` : '-'}
      </span>
      {hasManual && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" title="Manual override" />}
      <button
        onClick={() => { setVal(String(displayVal || 0)); setEditing(true); }}
        className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Override value"
        data-testid={`account-override-edit-${account.id}`}
      >
        <Pencil className="h-2.5 w-2.5" />
      </button>
      {hasManual && (
        <button
          onClick={reset}
          className="p-0.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Reset to auto"
          data-testid={`account-override-reset-${account.id}`}
        >
          <RotateCcw className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

