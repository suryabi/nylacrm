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
  Pencil, X, MessageSquare, Mail, Star, Award, Loader2, Package, FlaskConical, Plus, Trash2, Calendar, Wallet
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
        // Migrate legacy `string[]` to new `[{category, details}]` shape
        const raw = d.support_needed || [];
        const normalized = raw.map(item => typeof item === 'string' ? { category: item, details: '' } : { category: item.category, details: item.details || '' }).filter(x => x.category);
        setSupportNeeded(normalized);
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
  const addSupport = (cat) => setSupportNeeded(prev => prev.some(s => s.category === cat) ? prev : [...prev, { category: cat, details: '' }]);
  const updateSupportDetails = (cat, text) => setSupportNeeded(prev => prev.map(s => s.category === cat ? { ...s, details: text } : s));
  const removeSupport = (cat) => setSupportNeeded(prev => prev.filter(s => s.category !== cat));

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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-slate-200 border border-slate-200 overflow-hidden rounded-sm" data-testid="summary-cards">
            <SummaryTile label="Target" value={`₹${fmt(data.revenue?.target)}`} icon={Target} testId="metric-target" />
            <SummaryTile label="Revenue" value={`₹${fmt(data.revenue?.this_month)}`} icon={DollarSign} sub={fmtPct(data.revenue?.achievement_pct)} testId="metric-achieved" />
            <SummaryTile label="Existing A/C" value={data.accounts?.existing_count} icon={Users} testId="metric-existing" />
            <SummaryTile label="New A/C" value={data.accounts?.new_onboarded} icon={Building2} testId="metric-new" />
            <SummaryTile label={`${MONTH_NAMES[data.pipeline?.next_month] || 'Next'} Pipeline`} value={`₹${fmt(data.pipeline?.next_month_pipeline_value)}`} icon={TrendingUp} sub={`${data.pipeline?.next_month_leads_count || 0} leads`} testId="metric-pipeline" />
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
          </div>

          {/* ─── Top 10 Priorities ─── */}
          <Top10PrioritiesSection
            year={selectedYear}
            month={selectedMonth}
            resourceIds={resolveResourceIds()}
            token={token}
            tenantId={tenantId}
            isLocked={isLocked}
          />

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

          {/* Support Section — Last */}
          <div className="bg-white border border-slate-200 rounded-sm" data-testid="support-section">
            <div className="flex items-center gap-2.5 p-4 sm:p-5 pb-3 sm:pb-4 border-b border-slate-100">
              <div className="p-1.5 bg-slate-100 rounded-sm">
                <MapPin className="h-4 w-4 text-slate-700" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">Support Needed</h3>
                <p className="text-xs text-slate-500 mt-0.5">Add a support area and describe what you need (one entry per area). Drag the bottom-right corner of the text area to expand.</p>
              </div>
            </div>
            <div className="p-4 sm:p-5 pt-3 sm:pt-4 space-y-3">
              {/* Existing support rows */}
              {supportNeeded.length > 0 && (
                <div className="border border-slate-200 rounded-sm overflow-hidden divide-y divide-slate-100" data-testid="support-rows">
                  {supportNeeded.map(row => (
                    <div key={row.category} className="grid grid-cols-1 sm:grid-cols-[200px_1fr_auto] gap-2 sm:gap-3 p-3 bg-white items-start" data-testid={`support-row-${row.category.toLowerCase().replace(/\s+/g, '-')}`}>
                      <Badge variant="outline" className="bg-slate-900 text-white border-slate-900 text-[10px] uppercase tracking-wider w-fit shrink-0 self-start">
                        {row.category}
                      </Badge>
                      <Textarea
                        value={row.details}
                        onChange={(e) => updateSupportDetails(row.category, e.target.value)}
                        placeholder={`What support is needed for ${row.category}?`}
                        className="bg-slate-50 border-slate-200 rounded-sm text-sm resize-y min-h-[64px]"
                        rows={2}
                        disabled={isLocked}
                        data-testid={`support-details-${row.category.toLowerCase().replace(/\s+/g, '-')}`}
                      />
                      <div className="flex items-start gap-1 self-start">
                        {!isLocked && (
                          <Button
                            size="sm"
                            className="h-9 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                            onClick={() => saveRecord(false)}
                            disabled={saving}
                            title={`Save ${row.category}`}
                            data-testid={`support-save-${row.category.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1" />Save</>}
                          </Button>
                        )}
                        {!isLocked && (
                          <button
                            onClick={() => removeSupport(row.category)}
                            className="p-2 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                            title={`Remove ${row.category}`}
                            data-testid={`support-remove-${row.category.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new support area */}
              {(() => {
                const usedSet = new Set(supportNeeded.map(s => s.category));
                const available = SUPPORT_CATEGORIES.filter(c => !usedSet.has(c));
                if (isLocked || available.length === 0) {
                  return available.length === 0 && !isLocked ? (
                    <p className="text-xs text-slate-400 italic">All support areas have been added.</p>
                  ) : null;
                }
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value="" onValueChange={(v) => v && addSupport(v)}>
                      <SelectTrigger className="h-9 w-full sm:w-64 bg-white" data-testid="support-add-select">
                        <SelectValue placeholder="+ Add a support area..." />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-400">{supportNeeded.length} of {SUPPORT_CATEGORIES.length} areas added</p>
                  </div>
                );
              })()}

              <div className="pt-2 border-t border-slate-100">
                <label className="text-xs font-medium text-slate-500">General Remarks</label>
                <Textarea
                  value={remarks} onChange={e => setRemarks(e.target.value)}
                  placeholder="Additional comments or observations..."
                  className="mt-1.5 bg-slate-50 border-slate-200 rounded-sm resize-y min-h-[80px]" rows={3} disabled={isLocked}
                  data-testid="remarks"
                />
              </div>
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



// ════════════════════════════════════════════════════════════════════
// Top 10 Priorities — Execution Driven
// ════════════════════════════════════════════════════════════════════

function Top10PrioritiesSection({ year, month, resourceIds, token, tenantId, isLocked }) {
  const [open, setOpen] = useState(true);
  const [activeSub, setActiveSub] = useState('case_targets');

  // Stable primitive key so child effects don't re-run on every parent render
  const resourceIdsKey = React.useMemo(() => (resourceIds || []).join(','), [resourceIds]);

  return (
    <div className="bg-white border border-slate-200 rounded-sm" data-testid="top10-priorities-section">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 p-4 sm:p-5 pb-3 sm:pb-4 border-b border-slate-100 hover:bg-slate-50 transition-colors"
        data-testid="top10-priorities-toggle"
      >
        <div className="p-1.5 bg-amber-100 rounded-sm">
          <Star className="h-4 w-4 text-amber-700" />
        </div>
        <div className="flex-1 text-left">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
            Top 10 Priorities
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Account-level targets, gaps, and priority drivers for the month</p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>

      {open && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Sub-section tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-2">
            <SubTab id="case_targets" active={activeSub} onClick={setActiveSub} icon={Package}>
              Case Targets — {MONTH_NAMES[month]} {year}
            </SubTab>
            <SubTab id="sampling_trials" active={activeSub} onClick={setActiveSub} icon={FlaskConical}>
              Sampling / Trials
            </SubTab>
            <SubTab id="focus_leads" active={activeSub} onClick={setActiveSub} icon={Target}>
              Top 5 Leads to Focus
            </SubTab>
            <SubTab id="collections" active={activeSub} onClick={setActiveSub} icon={Wallet}>
              Collections / Outstanding
            </SubTab>
          </div>

          {activeSub === 'case_targets' && (
            <CaseTargetsSubsection
              year={year}
              month={month}
              resourceIdsKey={resourceIdsKey}
              token={token}
              tenantId={tenantId}
              isLocked={isLocked}
            />
          )}

          {activeSub === 'sampling_trials' && (
            <SamplingTrialsSubsection
              resourceIdsKey={resourceIdsKey}
              token={token}
              tenantId={tenantId}
              isLocked={isLocked}
            />
          )}

          {activeSub === 'focus_leads' && (
            <FocusLeadsSubsection
              year={year}
              month={month}
              resourceIdsKey={resourceIdsKey}
              token={token}
              tenantId={tenantId}
              isLocked={isLocked}
            />
          )}

          {activeSub === 'collections' && (
            <CollectionsSubsection
              resourceIdsKey={resourceIdsKey}
              token={token}
              tenantId={tenantId}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SubTab({ id, active, onClick, icon: Icon, children }) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-3 py-1.5 rounded-sm text-xs font-semibold flex items-center gap-1.5 transition-all ${
        isActive
          ? 'bg-amber-600 text-white shadow-sm'
          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
      }`}
      data-testid={`sub-tab-${id}`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </button>
  );
}

function CaseTargetsSubsection({ year, month, resourceIdsKey, token, tenantId, isLocked }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({}); // {accountId: bool}
  const [drafts, setDrafts] = useState({}); // {accountId-sku: stringValue}
  const [savingKey, setSavingKey] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ridParam = resourceIdsKey ? `&resource_ids=${resourceIdsKey}` : '';
      const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' };
      const res = await fetch(`${API_URL}/api/performance/account-case-targets?year=${year}&month=${month}${ridParam}`, { headers });
      const d = await res.json();
      setData(d);
      setDrafts({});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [year, month, resourceIdsKey, token, tenantId]);

  useEffect(() => { load(); }, [load]);

  const cellKey = (accId, sku) => `${accId}__${sku}`;

  const draftValue = (accId, sku, fallback) => {
    const k = cellKey(accId, sku);
    return drafts[k] !== undefined ? drafts[k] : String(fallback ?? 0);
  };

  const setDraft = (accId, sku, val) => {
    const sanitized = val.replace(/[^0-9]/g, '');
    setDrafts(p => ({ ...p, [cellKey(accId, sku)]: sanitized }));
  };

  const isDraftDirty = (accId, sku, currentTarget) => {
    const k = cellKey(accId, sku);
    if (drafts[k] === undefined) return false;
    const num = parseInt(drafts[k] || '0', 10);
    return num !== Number(currentTarget);
  };

  const authHeaders = () => ({ Authorization: `Bearer ${token}`, 'X-Tenant-ID': tenantId, 'Content-Type': 'application/json' });

  const saveRow = async (account, row) => {
    const k = cellKey(account.account_id, row.sku);
    setSavingKey(k);
    try {
      const target = parseInt(drafts[k] ?? row.target_cases, 10) || 0;
      const res = await fetch(`${API_URL}/api/performance/account-case-targets`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ account_id: account.account_id, sku_name: row.sku, year, month, target_cases: target }),
      });
      if (res.ok) {
        await load();
      }
    } catch (e) { console.error(e); }
    finally { setSavingKey(null); }
  };

  const resetRow = async (account, row) => {
    const k = cellKey(account.account_id, row.sku);
    setSavingKey(k);
    try {
      const url = `${API_URL}/api/performance/account-case-targets?account_id=${encodeURIComponent(account.account_id)}&sku_name=${encodeURIComponent(row.sku)}&year=${year}&month=${month}`;
      const res = await fetch(url, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) await load();
    } catch (e) { console.error(e); }
    finally { setSavingKey(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data || !data.accounts || data.accounts.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-500" data-testid="case-targets-empty">
        No accounts with SKU pricing found for the selected resource(s) in {data?.month_label || `${MONTH_NAMES[month]} ${year}`}.
      </div>
    );
  }

  const t = data.totals || {};
  const prevLabel = data.previous_month_label || 'Last Month';
  const curLabel = data.month_label || `${MONTH_NAMES[month - 1]} ${year}`;

  // Aggregate footer totals
  const footerLastMonth = data.accounts.reduce((s, a) => s + (a.totals?.last_month_cases || 0), 0);
  const footerCurrentCases = data.accounts.reduce((s, a) => s + (a.totals?.current_cases || 0), 0);
  const footerTargetCases = data.accounts.reduce((s, a) => s + (a.totals?.target_cases || 0), 0);

  return (
    <div className="space-y-4" data-testid="case-targets-subsection">
      {/* Roll-up summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <SummaryStat label="Accounts" value={data.accounts.length} sub="with pricing" />
        <SummaryStat label={`Last Month (${prevLabel})`} value={fmt(t.last_month_cases || 0)} sub="cases sold" />
        <SummaryStat label={`Target — ${curLabel}`} value={fmt(t.target_cases || 0)} sub={`Pipeline ₹${fmt(t.target_value || 0)}`} />
        <SummaryStat label="Achieved So Far" value={fmt(t.current_cases || 0)} sub={`${fmtPct(t.achievement_pct || 0)} achieved`} highlight={t.achievement_pct >= 100 ? 'green' : t.achievement_pct >= 70 ? 'amber' : 'red'} />
      </div>

      {/* Accounts table — same style as Collections grid */}
      <div className="border border-slate-200 rounded-sm overflow-x-auto bg-white" data-testid="case-targets-table">
        <table className="w-full text-sm" style={{ minWidth: '780px' }}>
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-2 py-3 text-left font-semibold sticky left-0 bg-slate-50 z-10 w-8"></th>
              <th className="px-3 py-3 text-left font-semibold sticky left-8 bg-slate-50 z-10 min-w-[220px] max-w-[280px]">Account</th>
              <th className="px-3 py-3 text-right font-semibold whitespace-nowrap" title={prevLabel}>Last Month</th>
              <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">This Month Target</th>
              <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Achieved So Far</th>
              <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">%</th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((acc, idx) => {
              const isOpen = expanded[acc.account_id] !== false; // default open
              const ach = acc.achievement_pct;
              const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
              return (
                <React.Fragment key={acc.account_id}>
                  <tr
                    className={`border-t border-slate-100 ${rowBg} hover:bg-amber-50/30 cursor-pointer group`}
                    onClick={() => setExpanded(p => ({ ...p, [acc.account_id]: !isOpen }))}
                    data-testid={`case-account-${acc.account_id}`}
                  >
                    <td className={`px-2 py-3 text-center sticky left-0 ${rowBg} group-hover:bg-amber-50/30 transition-colors`}>
                      {isOpen ? <ChevronDown className="h-4 w-4 text-slate-500 inline" /> : <ChevronRight className="h-4 w-4 text-slate-400 inline" />}
                    </td>
                    <td className={`px-3 py-3 sticky left-8 ${rowBg} group-hover:bg-amber-50/30 transition-colors min-w-[220px] max-w-[280px]`}>
                      <p className="text-sm font-semibold text-slate-900 truncate" title={acc.account_name}>{acc.account_name}</p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-600">{fmt(acc.totals?.last_month_cases || 0)}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap font-semibold text-blue-600">{fmt(acc.totals.target_cases)}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap font-semibold text-emerald-700">{fmt(acc.totals.current_cases)}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {ach != null ? (
                        <Badge variant="outline" className={`tabular-nums text-[10px] font-bold ${
                          ach >= 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          ach >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>{fmtPct(ach)}</Badge>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr data-testid={`case-account-detail-${acc.account_id}`}>
                      <td colSpan={6} className="p-0 bg-slate-50/40 border-t border-slate-200">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm" data-testid={`case-table-${acc.account_id}`}>
                            <thead className="bg-slate-100/70 text-[10px] uppercase tracking-wider text-slate-500">
                              <tr>
                                <th className="pl-12 pr-3 py-2 text-left font-semibold">SKU</th>
                                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Price (₹)</th>
                                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Last Month</th>
                                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">This Month Target</th>
                                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Achieved</th>
                                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Tgt Pipeline</th>
                                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">%</th>
                                <th className="px-3 py-2 text-right font-semibold w-[110px]"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {acc.rows.map((r, sIdx) => {
                                const k = cellKey(acc.account_id, r.sku);
                                const dirty = isDraftDirty(acc.account_id, r.sku, r.target_cases);
                                const saving = savingKey === k;
                                const skuBg = sIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
                                return (
                                  <tr key={r.sku} className={`border-t border-slate-200 hover:bg-amber-50/30 ${skuBg}`} onClick={(e) => e.stopPropagation()}>
                                    <td className="pl-12 pr-3 py-2 font-medium text-slate-800 whitespace-nowrap">{r.sku}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-600 whitespace-nowrap">{r.price_per_unit ? r.price_per_unit.toLocaleString('en-IN') : '—'}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-600 whitespace-nowrap">{fmt(r.last_month_cases ?? r.default_target_cases ?? 0)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                      <Input
                                        type="text"
                                        inputMode="numeric"
                                        value={draftValue(acc.account_id, r.sku, r.target_cases)}
                                        onChange={(e) => setDraft(acc.account_id, r.sku, e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && dirty) saveRow(acc, r); }}
                                        onClick={(e) => e.stopPropagation()}
                                        disabled={isLocked || saving}
                                        className={`h-7 w-20 text-right tabular-nums text-xs px-2 ml-auto ${dirty ? 'ring-2 ring-amber-300 border-amber-400' : ''} ${r.is_overridden ? 'bg-amber-50' : ''}`}
                                        data-testid={`case-target-input-${acc.account_id}-${r.sku.replace(/\s+/g, '-')}`}
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-semibold whitespace-nowrap">{fmt(r.current_cases)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums text-slate-700 whitespace-nowrap">₹{fmt(r.target_pipeline_value)}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                      {r.achievement_pct != null ? (
                                        <Badge variant="outline" className={`tabular-nums ${
                                          r.achievement_pct >= 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                          r.achievement_pct >= 70 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                          'bg-rose-50 text-rose-700 border-rose-200'
                                        }`}>{fmtPct(r.achievement_pct)}</Badge>
                                      ) : <span className="text-slate-300 text-xs">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                      <div className="flex items-center justify-end gap-1">
                                        {dirty && !isLocked && (
                                          <Button
                                            size="sm"
                                            variant="default"
                                            className="h-6 px-2 text-[10px] bg-amber-600 hover:bg-amber-700"
                                            disabled={saving}
                                            onClick={(e) => { e.stopPropagation(); saveRow(acc, r); }}
                                            data-testid={`case-target-save-${acc.account_id}-${r.sku.replace(/\s+/g, '-')}`}
                                          >
                                            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Save className="h-3 w-3 mr-1" />Save</>}
                                          </Button>
                                        )}
                                        {r.is_overridden && !dirty && !isLocked && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); resetRow(acc, r); }}
                                            disabled={saving}
                                            title="Reset to default (last month sales)"
                                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                                            data-testid={`case-target-reset-${acc.account_id}-${r.sku.replace(/\s+/g, '-')}`}
                                          >
                                            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-slate-100/50 text-xs">
                              <tr className="font-semibold text-slate-900">
                                <td className="pl-12 pr-3 py-2 whitespace-nowrap">Account Subtotal</td>
                                <td></td>
                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(acc.totals?.last_month_cases || 0)}</td>
                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(acc.totals.target_cases)}</td>
                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(acc.totals.current_cases)}</td>
                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">₹{fmt(acc.totals.target_value)}</td>
                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{acc.achievement_pct != null ? fmtPct(acc.achievement_pct) : '—'}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 text-xs">
            <tr className="font-bold text-slate-900">
              <td className="px-2 py-3 sticky left-0 bg-slate-50"></td>
              <td className="px-3 py-3 sticky left-8 bg-slate-50 whitespace-nowrap">Total — {data.accounts.length} account{data.accounts.length !== 1 ? 's' : ''}</td>
              <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-600" data-testid="case-targets-total-last-month">{fmt(footerLastMonth)}</td>
              <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-blue-600" data-testid="case-targets-total-target-cases">{fmt(footerTargetCases)}</td>
              <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-emerald-700" data-testid="case-targets-total-current-cases">{fmt(footerCurrentCases)}</td>
              <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{fmtPct(t.achievement_pct || 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, sub, highlight }) {
  const hl = {
    green: 'bg-emerald-50 border-emerald-200',
    amber: 'bg-amber-50 border-amber-200',
    red:   'bg-rose-50 border-rose-200',
  }[highlight] || 'bg-white border-slate-200';
  return (
    <div className={`rounded-sm border p-3 ${hl}`}>
      <p className="text-[9px] uppercase tracking-[0.15em] text-slate-500 font-semibold leading-tight">{label}</p>
      <p className="text-base sm:text-lg font-bold text-slate-900 tabular-nums truncate mt-1" title={String(value)}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════
// Sampling / Trials Subsection
// ════════════════════════════════════════════════════════════════════

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  { value: 'in_progress', label: 'Trial In Progress', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'completed', label: 'Completed', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
];

const statusMeta = (s) => STATUS_OPTIONS.find(o => o.value === s) || STATUS_OPTIONS[0];

const todayIso = () => new Date().toISOString().slice(0, 10);

const computeEndDate = (startIso, days) => {
  if (!startIso) return '';
  const d = parseInt(days || 0, 10);
  if (!d || d < 1) return startIso;
  try {
    const dt = new Date(`${startIso}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + d - 1);
    return dt.toISOString().slice(0, 10);
  } catch {
    return startIso;
  }
};

function SamplingTrialsSubsection({ resourceIdsKey, token, tenantId, isLocked }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expandedTrials, setExpandedTrials] = useState({}); // {trialId: bool}

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    'X-Tenant-ID': tenantId,
    'Content-Type': 'application/json',
  }), [token, tenantId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ridParam = resourceIdsKey ? `?resource_ids=${resourceIdsKey}` : '';
      const res = await fetch(`${API_URL}/api/performance/sampling-trials${ridParam}`, { headers: authHeaders() });
      const d = await res.json();
      setData(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [resourceIdsKey, authHeaders]);

  useEffect(() => { load(); }, [load]);

  const leads = data?.leads || [];
  const trials = data?.trials || [];
  const totals = data?.totals || { total_trials: 0, total_amount: 0, by_status: {} };

  const openNewForm = () => {
    setEditingId(null);
    setForm({
      lead_id: '',
      trial_date: todayIso(),
      duration_days: 3,
      status: 'not_started',
      sku_plans: [],
      notes: '',
    });
    setShowForm(true);
  };

  const openEditForm = (trial) => {
    setEditingId(trial.id);
    setForm({
      lead_id: trial.lead_id || '',
      trial_date: (trial.trial_date || '').slice(0, 10),
      duration_days: trial.duration_days || 1,
      status: trial.status || 'not_started',
      sku_plans: (trial.sku_plans || []).map(p => ({
        sku: p.sku || '',
        crates: p.crates ?? 0,
        units_per_package: p.units_per_package ?? null,
        price_per_unit: p.price_per_unit ?? 0,
      })),
      notes: trial.notes || '',
    });
    setShowForm(true);
  };

  const onLeadChange = (leadId) => {
    const lead = leads.find(l => l.id === leadId);
    const skuPlans = (lead?.sku_options || []).map(o => ({
      sku: o.sku,
      crates: 0,
      units_per_package: o.units_per_package || null,
      price_per_unit: o.price_per_unit || 0,
    }));
    setForm(f => ({ ...f, lead_id: leadId, sku_plans: skuPlans }));
  };

  const updateSkuPlan = (idx, field, value) => {
    setForm(f => {
      const next = [...(f.sku_plans || [])];
      next[idx] = { ...next[idx], [field]: value };
      return { ...f, sku_plans: next };
    });
  };

  const addSkuPlan = () => {
    setForm(f => ({ ...f, sku_plans: [...(f.sku_plans || []), { sku: '', crates: 0, units_per_package: null, price_per_unit: 0 }] }));
  };

  const removeSkuPlan = (idx) => {
    setForm(f => ({ ...f, sku_plans: (f.sku_plans || []).filter((_, i) => i !== idx) }));
  };

  const rowAmount = (p) => (Number(p.crates || 0) * Number(p.units_per_package || 0) * Number(p.price_per_unit || 0));
  const formTotal = (form?.sku_plans || []).reduce((s, p) => s + rowAmount(p), 0);
  const formEndDate = computeEndDate(form?.trial_date, form?.duration_days);

  const saveForm = async () => {
    if (!form?.lead_id) return;
    setSaving(true);
    try {
      const body = {
        lead_id: form.lead_id,
        trial_date: form.trial_date,
        duration_days: parseInt(form.duration_days, 10) || 1,
        status: form.status,
        sku_plans: (form.sku_plans || []).map(p => ({
          sku: p.sku,
          crates: Number(p.crates) || 0,
          units_per_package: p.units_per_package ? parseInt(p.units_per_package, 10) : null,
          price_per_unit: Number(p.price_per_unit) || 0,
        })),
        notes: form.notes || null,
      };
      const url = editingId
        ? `${API_URL}/api/performance/sampling-trials/${editingId}`
        : `${API_URL}/api/performance/sampling-trials`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.text();
        alert('Failed to save: ' + err);
      } else {
        setShowForm(false);
        setEditingId(null);
        setForm(null);
        await load();
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const deleteTrial = async (trial) => {
    if (!window.confirm(`Delete trial for "${trial.lead_name}"?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/performance/sampling-trials/${trial.id}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) await load();
    } catch (e) { console.error(e); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="sampling-trials-loading">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="sampling-trials-subsection">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <SummaryStat label="Total Trials" value={fmt(totals.total_trials)} />
        <SummaryStat label="In Progress" value={fmt(totals.by_status?.in_progress || 0)} highlight="amber" />
        <SummaryStat label="Completed" value={fmt(totals.by_status?.completed || 0)} highlight="green" />
        <SummaryStat label="Pipeline Amount" value={`₹${fmt(totals.total_amount)}`} sub="crates × units × price" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-slate-500">
          {leads.length} lead{leads.length !== 1 ? 's' : ''} assigned to selected resource(s)
        </div>
        {!isLocked && !showForm && (
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white h-8"
            onClick={openNewForm}
            data-testid="sampling-add-trial-btn"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> New Trial
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && form && (
        <div className="border border-amber-300 rounded-sm bg-amber-50/40 p-3 sm:p-4 space-y-3" data-testid="sampling-form">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-100 rounded-sm">
                <FlaskConical className="h-4 w-4 text-amber-700" />
              </div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                {editingId ? 'Edit Trial' : 'New Sampling / Trial'}
              </h4>
            </div>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); setForm(null); }}
              className="text-slate-400 hover:text-slate-700"
              data-testid="sampling-form-close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="lg:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Lead</label>
              <Select value={form.lead_id} onValueChange={onLeadChange}>
                <SelectTrigger className="h-9 mt-1 bg-white" data-testid="sampling-lead-select">
                  <SelectValue placeholder="Select a lead" />
                </SelectTrigger>
                <SelectContent>
                  {leads.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500">No leads found for selected resource(s)</div>
                  ) : leads.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}{l.city ? ` — ${l.city}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Tentative Date</label>
              <Input
                type="date"
                value={form.trial_date}
                onChange={(e) => setForm(f => ({ ...f, trial_date: e.target.value }))}
                className="h-9 mt-1 bg-white"
                data-testid="sampling-trial-date"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Duration (days)</label>
              <Input
                type="number"
                min="1"
                value={form.duration_days}
                onChange={(e) => setForm(f => ({ ...f, duration_days: e.target.value }))}
                className="h-9 mt-1 bg-white"
                data-testid="sampling-duration-days"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">End Date</label>
              <div className="h-9 mt-1 px-3 rounded-sm bg-slate-100 border border-slate-200 flex items-center gap-1.5 text-sm text-slate-700 tabular-nums" data-testid="sampling-end-date">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                {formEndDate || '—'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-9 mt-1 bg-white" data-testid="sampling-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Notes</label>
              <Input
                value={form.notes || ''}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes..."
                className="h-9 mt-1 bg-white"
                data-testid="sampling-notes"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-sm overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">SKU</th>
                  <th className="px-3 py-2 text-right font-semibold">Crates</th>
                  <th className="px-3 py-2 text-right font-semibold">Bottles / Crate</th>
                  <th className="px-3 py-2 text-right font-semibold">Price / Bottle</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount (₹)</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {(form.sku_plans || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-xs text-slate-500">
                      {form.lead_id ? 'No SKUs configured for this lead. Use "Add SKU" below.' : 'Select a lead to populate SKUs from its proposed pricing.'}
                    </td>
                  </tr>
                ) : form.sku_plans.map((p, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <Input
                        value={p.sku || ''}
                        onChange={(e) => updateSkuPlan(idx, 'sku', e.target.value)}
                        className="h-8 text-xs"
                        placeholder="SKU name"
                        data-testid={`sampling-sku-name-${idx}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={p.crates ?? 0}
                        onChange={(e) => updateSkuPlan(idx, 'crates', e.target.value)}
                        className="h-8 w-24 text-right text-xs ml-auto tabular-nums"
                        data-testid={`sampling-sku-crates-${idx}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        value={p.units_per_package ?? ''}
                        onChange={(e) => updateSkuPlan(idx, 'units_per_package', e.target.value)}
                        className="h-8 w-20 text-right text-xs ml-auto tabular-nums"
                        placeholder="—"
                        data-testid={`sampling-sku-units-${idx}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min="0"
                        value={p.price_per_unit ?? 0}
                        onChange={(e) => updateSkuPlan(idx, 'price_per_unit', e.target.value)}
                        className="h-8 w-24 text-right text-xs ml-auto tabular-nums"
                        data-testid={`sampling-sku-price-${idx}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sm text-emerald-700 font-semibold" data-testid={`sampling-sku-amount-${idx}`}>
                      ₹{fmt(rowAmount(p))}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => removeSkuPlan(idx)}
                        className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                        data-testid={`sampling-sku-remove-${idx}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 text-xs">
                <tr>
                  <td className="px-3 py-2 font-semibold text-slate-900">Total</td>
                  <td></td><td></td><td></td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-slate-900" data-testid="sampling-form-total">₹{fmt(formTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
            <div className="p-2 border-t border-slate-100">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addSkuPlan} data-testid="sampling-add-sku-row">
                <Plus className="h-3 w-3 mr-1" /> Add SKU
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditingId(null); setForm(null); }} data-testid="sampling-cancel-btn">
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!form.lead_id || saving}
              onClick={saveForm}
              data-testid="sampling-save-btn"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              {editingId ? 'Save Changes' : 'Create Trial'}
            </Button>
          </div>
        </div>
      )}

      {/* Trials list — table style consistent with Collections / Case Targets / Focus Leads */}
      {trials.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-500 border border-dashed border-slate-200 rounded-sm" data-testid="sampling-trials-empty">
          No trials recorded yet. Click <span className="font-semibold">New Trial</span> to add one.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-sm overflow-x-auto bg-white" data-testid="sampling-trials-list">
          <table className="w-full text-sm" style={{ minWidth: '900px' }}>
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-2 py-3 text-left font-semibold sticky left-0 bg-slate-50 z-10 w-8"></th>
                <th className="px-3 py-3 text-left font-semibold sticky left-8 bg-slate-50 z-10 min-w-[220px] max-w-[280px]">Lead</th>
                <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Status</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Trial Date</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Duration</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Amount</th>
                {!isLocked && <th className="w-20 sticky right-0 bg-slate-50 z-10"></th>}
              </tr>
            </thead>
            <tbody>
              {trials.map((t, idx) => {
                const meta = statusMeta(t.status);
                const isExpanded = !!expandedTrials[t.id];
                const toggleExpand = () => setExpandedTrials(prev => ({ ...prev, [t.id]: !prev[t.id] }));
                const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
                return (
                  <React.Fragment key={t.id}>
                    <tr
                      className={`border-t border-slate-100 ${rowBg} hover:bg-amber-50/30 cursor-pointer group`}
                      onClick={toggleExpand}
                      data-testid={`sampling-trial-${t.id}`}
                    >
                      <td className={`px-2 py-3 text-center sticky left-0 ${rowBg} group-hover:bg-amber-50/30 transition-colors`} data-testid={`sampling-trial-toggle-${t.id}`}>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500 inline" /> : <ChevronRight className="h-4 w-4 text-slate-400 inline" />}
                      </td>
                      <td className={`px-3 py-3 sticky left-8 ${rowBg} group-hover:bg-amber-50/30 transition-colors min-w-[220px] max-w-[280px]`}>
                        <p className="text-sm font-semibold text-slate-900 truncate" title={t.lead_name || ''}>{t.lead_name || '—'}</p>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <Badge variant="outline" className={`${meta.color} text-[10px] font-semibold uppercase tracking-wider`}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-900 font-semibold">{t.trial_date || '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-600">{t.duration_days || 0} day{t.duration_days === 1 ? '' : 's'}</td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap font-bold text-emerald-700">₹{fmt(t.total_amount || 0)}</td>
                      {!isLocked && (
                        <td className={`px-2 py-3 text-right sticky right-0 ${rowBg} group-hover:bg-amber-50/30 transition-colors`}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={(e) => { e.stopPropagation(); openEditForm(t); }} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900" data-testid={`sampling-edit-${t.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); deleteTrial(t); }} className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" data-testid={`sampling-delete-${t.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>

                    {isExpanded && (
                      <tr data-testid={`sampling-trial-details-${t.id}`}>
                        <td colSpan={isLocked ? 6 : 7} className="p-0 bg-slate-50/40 border-t border-slate-200">
                          <div className="px-5 py-2.5 border-b border-slate-200 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                            <div>
                              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mr-1.5">End Date</span>
                              <span className="tabular-nums font-semibold text-slate-900">{t.end_date || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mr-1.5">Period</span>
                              <span className="tabular-nums text-slate-700">{t.trial_date || '—'} → {t.end_date || '—'}</span>
                            </div>
                            {t.lead_city && (
                              <div>
                                <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mr-1.5">City</span>
                                <span className="text-slate-700">{t.lead_city}</span>
                              </div>
                            )}
                          </div>

                          {(t.sku_plans || []).length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-100/70 text-[10px] uppercase tracking-wider text-slate-500">
                                  <tr>
                                    <th className="pl-12 pr-3 py-2 text-left font-semibold">SKU</th>
                                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Crates</th>
                                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Bottles/Crate</th>
                                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Price/Bottle</th>
                                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {t.sku_plans.map((p, idx) => {
                                    const amt = Number(p.crates || 0) * Number(p.units_per_package || 0) * Number(p.price_per_unit || 0);
                                    return (
                                      <tr key={idx} className="border-t border-slate-200 bg-white">
                                        <td className="pl-12 pr-3 py-2 text-slate-800 font-medium whitespace-nowrap">{p.sku}</td>
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmt(p.crates)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{p.units_per_package || '—'}</td>
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">₹{fmt(p.price_per_unit)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap font-semibold text-emerald-700">₹{fmt(amt)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {t.notes && (
                            <div className="px-5 py-2.5 text-xs text-slate-600 border-t border-slate-200">
                              <span className="font-semibold text-slate-500 uppercase tracking-wider text-[9px]">Notes:</span> {t.notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 text-xs">
              <tr className="font-bold text-slate-900">
                <td className="px-2 py-3 sticky left-0 bg-slate-50"></td>
                <td className="px-3 py-3 sticky left-8 bg-slate-50 whitespace-nowrap" colSpan={4}>Total — {trials.length} trial{trials.length !== 1 ? 's' : ''}</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-emerald-700" data-testid="sampling-trials-total-amount">₹{fmt(trials.reduce((s, t) => s + (t.total_amount || 0), 0))}</td>
                {!isLocked && <td className="sticky right-0 bg-slate-50"></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════
// Top 5 Leads to Focus Subsection
// ════════════════════════════════════════════════════════════════════

const statusBadgeClasses = (status) => {
  // Generic color mapping for lead statuses; keeps semantics without depending on tenant configs
  const map = {
    new: 'bg-slate-100 text-slate-700 border-slate-300',
    contacted: 'bg-sky-100 text-sky-800 border-sky-300',
    qualified: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    proposal_shared: 'bg-violet-100 text-violet-800 border-violet-300',
    proposal_internal_review: 'bg-violet-100 text-violet-800 border-violet-300',
    negotiation: 'bg-amber-100 text-amber-800 border-amber-300',
    won: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    lost: 'bg-rose-100 text-rose-800 border-rose-300',
    on_hold: 'bg-slate-100 text-slate-600 border-slate-300',
  };
  return map[status] || 'bg-slate-100 text-slate-700 border-slate-300';
};

const priorityBadgeClasses = (priority) => {
  const map = {
    high: 'bg-rose-100 text-rose-700 border-rose-300',
    medium: 'bg-amber-100 text-amber-700 border-amber-300',
    low: 'bg-slate-100 text-slate-600 border-slate-300',
  };
  return map[priority] || 'bg-slate-100 text-slate-600 border-slate-300';
};

const formatStatusLabel = (s) => (s || '—').toString().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function FocusLeadsSubsection({ year, month, resourceIdsKey, token, tenantId, isLocked }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  // draftIds: the in-memory selection (dirty) prior to Save
  const [draftIds, setDraftIds] = useState([]);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    'X-Tenant-ID': tenantId,
    'Content-Type': 'application/json',
  }), [token, tenantId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ridParam = resourceIdsKey ? `&resource_ids=${resourceIdsKey}` : '';
      const res = await fetch(`${API_URL}/api/performance/focus-leads?year=${year}&month=${month}${ridParam}`, { headers: authHeaders() });
      const d = await res.json();
      setData(d);
      setDraftIds(d.selected_lead_ids || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [year, month, resourceIdsKey, authHeaders]);

  useEffect(() => { load(); }, [load]);

  const leads = data?.leads || [];
  const isEditable = !!data?.is_editable && !isLocked;
  const singleResourceId = (data?.resource_ids || [])[0];

  const leadMap = React.useMemo(() => Object.fromEntries(leads.map(l => [l.id, l])), [leads]);
  const selectedLeads = draftIds.map(id => leadMap[id]).filter(Boolean);
  const dirty = React.useMemo(() => {
    const saved = data?.selected_lead_ids || [];
    if (saved.length !== draftIds.length) return true;
    return saved.some((id, idx) => id !== draftIds[idx]);
  }, [data, draftIds]);

  const totalRevenue = selectedLeads.reduce((s, l) => s + Number(l.estimated_monthly_revenue || 0), 0);

  const toggleLead = (leadId) => {
    setDraftIds(prev => prev.includes(leadId) ? prev.filter(x => x !== leadId) : [...prev, leadId]);
  };

  const removeLead = (leadId) => {
    setDraftIds(prev => prev.filter(x => x !== leadId));
  };

  const save = async () => {
    if (!isEditable || !singleResourceId) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/performance/focus-leads`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ year, month, resource_id: singleResourceId, lead_ids: draftIds }),
      });
      if (res.ok) {
        await load();
      } else {
        const err = await res.text();
        alert('Failed to save: ' + err);
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const resetDraft = () => setDraftIds(data?.selected_lead_ids || []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="focus-leads-loading">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const available = leads.filter(l => !draftIds.includes(l.id));
  const searchLower = search.trim().toLowerCase();
  const filtered = searchLower
    ? available.filter(l => (l.name || '').toLowerCase().includes(searchLower) || (l.city || '').toLowerCase().includes(searchLower))
    : available;

  return (
    <div className="space-y-4" data-testid="focus-leads-subsection">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <SummaryStat label="Leads Selected" value={fmt(draftIds.length)} sub={data?.totals?.selected_count != null && dirty ? `${data.totals.selected_count} saved` : 'saved & in sync'} />
        <SummaryStat label="Total Est. Monthly Revenue" value={`₹${fmt(totalRevenue)}`} sub="based on proposed pricing" highlight={totalRevenue > 0 ? 'green' : undefined} />
        <SummaryStat label="Period" value={`${MONTH_NAMES[month]} ${year}`} sub={isEditable ? 'Editable' : (data?.resource_ids?.length > 1 ? 'Multi-resource view' : 'Read-only')} />
      </div>

      {/* Not editable banner */}
      {!isEditable && (data?.resource_ids || []).length > 1 && (
        <div className="flex items-start gap-2 p-3 rounded-sm border border-amber-200 bg-amber-50 text-xs text-amber-800" data-testid="focus-leads-readonly-banner">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            Focus leads is saved per resource. You've selected multiple resources, so this shows the <span className="font-semibold">union</span> of their focus lists (read-only). Pick a single resource to edit.
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-500">{leads.length} lead{leads.length !== 1 ? 's' : ''} assigned</div>
        <div className="flex items-center gap-2">
          {dirty && isEditable && (
            <>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetDraft} data-testid="focus-leads-reset-btn">
                <RotateCcw className="h-3 w-3 mr-1" /> Reset
              </Button>
              <Button size="sm" className="h-8 bg-amber-600 hover:bg-amber-700 text-white text-xs" onClick={save} disabled={saving} data-testid="focus-leads-save-btn">
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Save Selection
              </Button>
            </>
          )}
          {isEditable && !showPicker && (
            <Button
              size="sm"
              className="h-8 bg-amber-600 hover:bg-amber-700 text-white text-xs"
              onClick={() => { setShowPicker(true); setSearch(''); }}
              data-testid="focus-leads-add-btn"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Lead
            </Button>
          )}
        </div>
      </div>

      {/* Lead picker */}
      {showPicker && isEditable && (
        <div className="border border-amber-300 rounded-sm bg-amber-50/40 p-3 sm:p-4 space-y-2" data-testid="focus-leads-picker">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-100 rounded-sm">
                <Target className="h-4 w-4 text-amber-700" />
              </div>
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-900">Pick leads to focus</h4>
            </div>
            <button
              onClick={() => { setShowPicker(false); setSearch(''); }}
              className="text-slate-400 hover:text-slate-700"
              data-testid="focus-leads-picker-close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by lead name..."
            className="h-9 bg-white"
            data-testid="focus-leads-search"
          />

          <div className="border border-slate-200 rounded-sm bg-white max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {available.length === 0 ? 'All assigned leads are already in focus.' : 'No matching leads found.'}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map(lead => (
                  <li key={lead.id} data-testid={`focus-leads-option-${lead.id}`}>
                    <button
                      onClick={() => toggleLead(lead.id)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-amber-50 text-left transition-colors"
                    >
                      <div className="p-1.5 bg-slate-100 rounded-sm shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-slate-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{lead.name}</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <Badge variant="outline" className={`text-[9px] uppercase tracking-wider ${statusBadgeClasses(lead.status)}`}>
                            {formatStatusLabel(lead.status)}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Est. Monthly</p>
                        <p className="text-xs font-bold tabular-nums text-emerald-700">₹{fmt(lead.estimated_monthly_revenue)}</p>
                      </div>
                      <Plus className="h-4 w-4 text-amber-600 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Selection grid */}
      {selectedLeads.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-500 border border-dashed border-slate-200 rounded-sm" data-testid="focus-leads-empty">
          No leads selected yet.{isEditable ? <> Click <span className="font-semibold">Add Lead</span> to start building your focus list.</> : ''}
        </div>
      ) : (
        <div className="border border-slate-200 rounded-sm overflow-x-auto bg-white" data-testid="focus-leads-grid">
          <table className="w-full text-sm" style={{ minWidth: '720px' }}>
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-3 text-left font-semibold sticky left-0 bg-slate-50 z-10 w-10">#</th>
                <th className="px-3 py-3 text-left font-semibold sticky left-10 bg-slate-50 z-10 min-w-[260px] max-w-[320px]">Lead</th>
                <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Status</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Est. Monthly Revenue (₹)</th>
                {isEditable && <th className="w-10 sticky right-0 bg-slate-50 z-10"></th>}
              </tr>
            </thead>
            <tbody>
              {selectedLeads.map((lead, idx) => {
                const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
                return (
                <tr key={lead.id} className={`border-t border-slate-100 ${rowBg} hover:bg-amber-50/30 group`} data-testid={`focus-lead-row-${lead.id}`}>
                  <td className={`px-3 py-3 tabular-nums text-slate-400 text-xs sticky left-0 ${rowBg} group-hover:bg-amber-50/30 transition-colors`}>{idx + 1}</td>
                  <td className={`px-3 py-3 sticky left-10 ${rowBg} group-hover:bg-amber-50/30 transition-colors min-w-[260px] max-w-[320px]`}>
                    <p className="text-sm font-semibold text-slate-900 truncate" title={lead.name}>{lead.name}</p>
                    {lead.lead_id && <p className="text-[10px] text-slate-400 uppercase tracking-wider truncate">{lead.lead_id}</p>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Badge variant="outline" className={`text-[9px] uppercase tracking-wider ${statusBadgeClasses(lead.status)}`}>
                      {formatStatusLabel(lead.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap font-semibold text-emerald-700">₹{fmt(lead.estimated_monthly_revenue)}</td>
                  {isEditable && (
                    <td className={`px-2 py-3 text-right sticky right-0 ${rowBg} group-hover:bg-amber-50/30 transition-colors`}>
                      <button
                        onClick={() => removeLead(lead.id)}
                        className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                        data-testid={`focus-lead-remove-${lead.id}`}
                        title="Remove from focus"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 text-xs">
              <tr className="font-semibold text-slate-900">
                <td className="px-3 py-3 sticky left-0 bg-slate-50 whitespace-nowrap" colSpan={3}>
                  Total — {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''}
                </td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap" data-testid="focus-leads-total-revenue">₹{fmt(totalRevenue)}</td>
                {isEditable && <td className="sticky right-0 bg-slate-50"></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════
// Collections / Outstanding Subsection
// (Same fields as the Account Performance report, scoped to selected resources)
// ════════════════════════════════════════════════════════════════════

const formatDateShort = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
};

function CollectionsSubsection({ resourceIdsKey, token, tenantId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    'X-Tenant-ID': tenantId,
    'Content-Type': 'application/json',
  }), [token, tenantId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ridParam = resourceIdsKey ? `&resource_ids=${resourceIdsKey}` : '';
      const res = await fetch(`${API_URL}/api/performance/account-collections?time_filter=lifetime${ridParam}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setData(d);
    } catch (e) {
      console.error('Failed to load collections:', e);
      setData({ accounts: [], summary: {} });
    } finally {
      setLoading(false);
    }
  }, [resourceIdsKey, authHeaders]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="collections-loading">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const accounts = data?.accounts || [];
  const summary = data?.summary || {};

  const searchLower = search.trim().toLowerCase();
  const filtered = searchLower
    ? accounts.filter(r =>
        (r.account_name || '').toLowerCase().includes(searchLower)
        || (r.account_id || '').toLowerCase().includes(searchLower)
        || (r.city || '').toLowerCase().includes(searchLower)
        || (r.state || '').toLowerCase().includes(searchLower))
    : accounts;

  return (
    <div className="space-y-4" data-testid="collections-subsection">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <SummaryStat label="Accounts" value={fmt(summary.account_count || 0)} />
        <SummaryStat label="Invoice Value" value={`₹${fmt(summary.total_gross || 0)}`} sub={`Net: ₹${fmt(summary.total_net || 0)}`} highlight={(summary.total_gross || 0) > 0 ? 'green' : undefined} />
        <SummaryStat label="Bottle Credit" value={`₹${fmt(summary.total_bottle_credit || 0)}`} />
        <SummaryStat label="Avg Order" value={`₹${fmt(summary.average_order_amount || 0)}`} sub={`${fmt(summary.total_invoice_count || 0)} orders`} />
        <SummaryStat label="Outstanding" value={`₹${fmt(summary.total_outstanding || 0)}`} highlight={(summary.total_outstanding || 0) > 0 ? 'amber' : 'green'} />
        <SummaryStat label="Overdue" value={`₹${fmt(summary.total_overdue || 0)}`} highlight={(summary.total_overdue || 0) > 0 ? 'red' : 'green'} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search account, city, state..."
          className="h-9 w-64 bg-white"
          data-testid="collections-search"
        />
        <div className="text-xs text-slate-500">{filtered.length} of {accounts.length} accounts</div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-500 border border-dashed border-slate-200 rounded-sm" data-testid="collections-empty">
          {accounts.length === 0
            ? 'No accounts found for the selected resource(s).'
            : 'No accounts match your search.'}
        </div>
      ) : (
        <div className="border border-slate-200 rounded-sm overflow-x-auto bg-white" data-testid="collections-table">
          <table className="w-full text-sm" style={{ minWidth: '1100px' }}>
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold sticky left-0 bg-slate-50 z-10 min-w-[220px]">Account</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Invoice Value</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Net Value</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Avg Order</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Bottle Credit</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Contribution</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Last Payment</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Outstanding</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
                return (
                <tr
                  key={row.account_id || idx}
                  className={`border-t border-slate-100 ${rowBg} hover:bg-amber-50/30 cursor-pointer group`}
                  onClick={() => navigate(`/accounts/${row.account_id}`)}
                  data-testid={`collections-row-${row.account_id}`}
                >
                  <td className={`px-4 py-3 sticky left-0 ${rowBg} group-hover:bg-amber-50/30 transition-colors`}>
                    <p className="text-sm font-semibold text-slate-900 truncate" title={row.account_name}>{row.account_name}</p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap font-semibold text-emerald-700">₹{fmt(row.gross_invoice_total)}</td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-blue-600">₹{fmt(row.net_invoice_total)}</td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                    <span className="font-medium text-indigo-600">₹{fmt(row.average_order_amount)}</span>
                    <span className="text-[10px] text-slate-400 ml-1">· {fmt(row.invoice_count)}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-purple-600">₹{fmt(row.bottle_credit)}</td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                    <span className={`font-semibold ${
                      row.contribution_pct >= 10 ? 'text-emerald-700'
                      : row.contribution_pct >= 5 ? 'text-blue-600'
                      : row.contribution_pct > 0 ? 'text-amber-600' : 'text-slate-400'
                    }`}>{fmt(row.contribution_pct)}%</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                    <span className="font-medium text-slate-700">₹{fmt(row.last_payment_amount)}</span>
                    {row.last_payment_date && <span className="text-[10px] text-slate-400 ml-1">· {formatDateShort(row.last_payment_date)}</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                    <span className={(row.outstanding_balance || 0) > 0 ? 'text-amber-600 font-semibold' : 'text-emerald-600'}>
                      ₹{fmt(row.outstanding_balance)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                    <span className={(row.overdue_amount || 0) > 0 ? 'text-rose-700 font-semibold' : 'text-emerald-600'}>
                      ₹{fmt(row.overdue_amount)}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 text-xs">
              <tr className="font-bold text-slate-900">
                <td className="px-4 py-3 sticky left-0 bg-slate-50 whitespace-nowrap">Total — {filtered.length} account{filtered.length !== 1 ? 's' : ''}</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-emerald-700">₹{fmt(filtered.reduce((s, r) => s + (r.gross_invoice_total || 0), 0))}</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-blue-600">₹{fmt(filtered.reduce((s, r) => s + (r.net_invoice_total || 0), 0))}</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-400">—</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-purple-600">₹{fmt(filtered.reduce((s, r) => s + (r.bottle_credit || 0), 0))}</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-400">—</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-400">—</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-amber-600" data-testid="collections-total-outstanding">₹{fmt(filtered.reduce((s, r) => s + (r.outstanding_balance || 0), 0))}</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-rose-700">₹{fmt(filtered.reduce((s, r) => s + (r.overdue_amount || 0), 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

