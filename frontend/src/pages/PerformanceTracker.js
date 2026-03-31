import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import {
  Target, TrendingUp, TrendingDown, Users, Phone, MapPin, DollarSign,
  BarChart3, RefreshCw, Save, Send, Check, RotateCcw, AlertTriangle,
  ChevronDown, ChevronRight, Building2, Clock, ArrowUp, ArrowDown, Minus,
  Pencil, X
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
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [resources, setResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState('');
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
  }, [selectedPlan]);

  const generate = useCallback(async () => {
    if (!selectedPlan || !selectedResource) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/performance/generate?plan_id=${selectedPlan}&resource_id=${selectedResource}&month=${selectedMonth}&year=${selectedYear}`,
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
        `${API_URL}/api/performance/comparison?resource_id=${selectedResource}&plan_id=${selectedPlan}&months=3`,
        { headers }
      );
      setComparison(await compRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, selectedResource, selectedMonth, selectedYear]);

  useEffect(() => { generate(); }, [generate]);

  const saveRecord = async (submitAfter = false) => {
    if (!data) return;
    setSaving(true);
    try {
      const body = {
        plan_id: selectedPlan, resource_id: selectedResource, month: selectedMonth, year: selectedYear,
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
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="performance-tracker">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-indigo-600" />
            Monthly Performance Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Track sales outcomes, activity, pipeline, and collections per resource</p>
        </div>
      </div>

      {/* Selectors */}
      <Card data-testid="performance-selectors">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Target Plan</label>
              <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                <SelectTrigger data-testid="select-plan"><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Sales Resource</label>
              <Select value={selectedResource} onValueChange={setSelectedResource}>
                <SelectTrigger data-testid="select-resource"><SelectValue placeholder="Select resource" /></SelectTrigger>
                <SelectContent>
                  {resources.map(r => <SelectItem key={r.resource_id} value={r.resource_id}>{r.resource_name} ({r.city})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Month</label>
              <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(parseInt(v))}>
                <SelectTrigger data-testid="select-month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Year</label>
              <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={generate} disabled={loading || !selectedPlan || !selectedResource} className="w-full" data-testid="generate-btn">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Generate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && !loading && (
        <>
          {/* Status bar */}
          <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3 border">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{data.resource_name}</span>
              <Badge variant="outline">{data.resource_city}</Badge>
              <Badge variant="outline">{data.plan_name}</Badge>
              <StatusBadge status={data.status} />
            </div>
            <div className="flex items-center gap-2">
              {!isLocked && data.status !== 'submitted' && (
                <>
                  <Button variant="outline" size="sm" onClick={() => saveRecord(false)} disabled={saving} data-testid="save-draft-btn">
                    <Save className="h-4 w-4 mr-1" />{saving ? 'Saving...' : 'Save Draft'}
                  </Button>
                  <Button size="sm" onClick={() => saveRecord(true)} disabled={saving} data-testid="submit-btn">
                    <Send className="h-4 w-4 mr-1" />Submit
                  </Button>
                </>
              )}
              {data.status === 'submitted' && (
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3" data-testid="summary-cards">
            <MetricCard label="Target" value={`₹${fmt(data.revenue?.target)}`} icon={<Target className="h-4 w-4" />} color="slate" testId="metric-target" />
            <MetricCard label="Revenue (Month)" value={`₹${fmt(data.revenue?.this_month)}`} icon={<DollarSign className="h-4 w-4" />} color="blue" sub={fmtPct(data.revenue?.achievement_pct)} testId="metric-achieved" />
            <MetricCard label="Existing Accounts" value={data.accounts?.existing_count} icon={<Users className="h-4 w-4" />} color="emerald" testId="metric-existing" />
            <MetricCard label="New Accounts" value={data.accounts?.new_onboarded} icon={<Building2 className="h-4 w-4" />} color="teal" testId="metric-new" />
            <MetricCard label="Pipeline" value={`₹${fmt(data.pipeline?.total_value)}`} icon={<TrendingUp className="h-4 w-4" />} color="amber" sub={`${data.pipeline?.total_count} leads`} testId="metric-pipeline" />
            <MetricCard label="Outstanding" value={`₹${fmt(data.collections?.total_outstanding)}`} icon={<AlertTriangle className="h-4 w-4" />} color="red" testId="metric-outstanding" />
            <MetricCard label="Visits / Calls" value={`${data.activities?.visits} / ${data.activities?.calls}`} icon={<Phone className="h-4 w-4" />} color="purple" testId="metric-activity" />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue Section */}
            <Card data-testid="revenue-section">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4 text-blue-600" />Revenue Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow label="Monthly Target" value={`₹${fmt(data.revenue?.target)}`} />
                  <InfoRow label="Achievement %" value={fmtPct(data.revenue?.achievement_pct)} highlight={data.revenue?.achievement_pct < 50 ? 'red' : data.revenue?.achievement_pct >= 100 ? 'green' : 'amber'} />
                </div>
                <div className="space-y-2 border-t pt-2">
                  <OverridableRow
                    label="Revenue Lifetime (As-on-date)"
                    autoValue={data.revenue?.lifetime}
                    overrideValue={revenueOverrides.lifetime}
                    editing={revenueEditing.lifetime}
                    locked={isLocked}
                    onEdit={() => setRevenueEditing(p => ({ ...p, lifetime: true }))}
                    onChange={(v) => setRevenueOverrides(p => ({ ...p, lifetime: v }))}
                    onSave={() => setRevenueEditing(p => ({ ...p, lifetime: false }))}
                    onReset={() => { setRevenueOverrides(p => ({ ...p, lifetime: '' })); setRevenueEditing(p => ({ ...p, lifetime: false })); }}
                    testId="revenue-lifetime"
                  />
                  <OverridableRow
                    label="Revenue This Month (All Accounts)"
                    autoValue={data.revenue?.this_month}
                    overrideValue={revenueOverrides.this_month}
                    editing={revenueEditing.this_month}
                    locked={isLocked}
                    onEdit={() => setRevenueEditing(p => ({ ...p, this_month: true }))}
                    onChange={(v) => setRevenueOverrides(p => ({ ...p, this_month: v }))}
                    onSave={() => setRevenueEditing(p => ({ ...p, this_month: false }))}
                    onReset={() => { setRevenueOverrides(p => ({ ...p, this_month: '' })); setRevenueEditing(p => ({ ...p, this_month: false })); }}
                    testId="revenue-this-month"
                  />
                  <OverridableRow
                    label="Revenue from New Accounts This Month"
                    autoValue={data.revenue?.from_new_accounts}
                    overrideValue={revenueOverrides.new_accounts}
                    editing={revenueEditing.new_accounts}
                    locked={isLocked}
                    onEdit={() => setRevenueEditing(p => ({ ...p, new_accounts: true }))}
                    onChange={(v) => setRevenueOverrides(p => ({ ...p, new_accounts: v }))}
                    onSave={() => setRevenueEditing(p => ({ ...p, new_accounts: false }))}
                    onReset={() => { setRevenueOverrides(p => ({ ...p, new_accounts: '' })); setRevenueEditing(p => ({ ...p, new_accounts: false })); }}
                    testId="revenue-new-accounts"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Accounts Section (from Accounts collection) */}
            <Card data-testid="accounts-section">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-600" />Account Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Existing Accounts */}
                <div data-testid="existing-accounts-tile">
                  <div className="flex justify-between items-center py-2 px-3 border border-dashed border-emerald-200 rounded-lg bg-emerald-50/30">
                    <span className="text-xs text-slate-500">Existing Accounts (Lifetime)</span>
                    <span className="text-sm font-bold text-emerald-700">{data.accounts?.existing_count}</span>
                  </div>
                  {(data.accounts?.existing_accounts || []).length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {(expandedAccountList.existing
                        ? data.accounts.existing_accounts
                        : data.accounts.existing_accounts.slice(0, 3)
                      ).map((acc, idx) => (
                        <div key={acc.id || idx} className="flex items-center justify-between py-1 px-3 text-xs rounded bg-slate-50 border border-slate-100">
                          <span className="font-medium text-slate-700">{acc.name || 'Unknown'}</span>
                          <div className="flex items-center gap-2">
                            {acc.city && <span className="text-slate-400">{acc.city}</span>}
                            {acc.status && <Badge variant="outline" className="text-[10px] capitalize py-0 h-4">{acc.status.replace(/_/g, ' ')}</Badge>}
                          </div>
                        </div>
                      ))}
                      {data.accounts.existing_accounts.length > 3 && (
                        <button
                          onClick={() => setExpandedAccountList(p => ({ ...p, existing: !p.existing }))}
                          className="text-xs text-blue-600 hover:text-blue-800 px-3 py-0.5 flex items-center gap-1"
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
                  <div className={`flex justify-between items-center py-2 px-3 border border-dashed rounded-lg ${data.accounts?.new_onboarded > 0 ? 'border-teal-200 bg-teal-50/30' : 'border-red-200 bg-red-50/30'}`}>
                    <span className="text-xs text-slate-500">New Accounts Onboarded This Month</span>
                    <span className={`text-sm font-bold ${data.accounts?.new_onboarded > 0 ? 'text-teal-700' : 'text-red-600'}`}>{data.accounts?.new_onboarded}</span>
                  </div>
                  {(data.accounts?.new_accounts || []).length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {(expandedAccountList.new
                        ? data.accounts.new_accounts
                        : data.accounts.new_accounts.slice(0, 3)
                      ).map((acc, idx) => (
                        <div key={acc.id || idx} className="flex items-center justify-between py-1 px-3 text-xs rounded bg-slate-50 border border-slate-100">
                          <span className="font-medium text-slate-700">{acc.name || 'Unknown'}</span>
                          {acc.city && <span className="text-slate-400">{acc.city}</span>}
                        </div>
                      ))}
                      {data.accounts.new_accounts.length > 3 && (
                        <button
                          onClick={() => setExpandedAccountList(p => ({ ...p, new: !p.new }))}
                          className="text-xs text-blue-600 hover:text-blue-800 px-3 py-0.5 flex items-center gap-1"
                          data-testid="expand-new-accounts"
                        >
                          {expandedAccountList.new ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {expandedAccountList.new ? 'Show less' : `Show all ${data.accounts.new_accounts.length} accounts`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Pipeline Section (from leads, status-wise breakdown) */}
            <Card data-testid="pipeline-section">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-600" />Pipeline Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="pipeline-status-table">
                    <thead>
                      <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase">
                        <th className="text-left p-2">Status</th>
                        <th className="text-right p-2">No of Leads</th>
                        <th className="text-right p-2">Pipeline Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.pipeline?.by_status || []).map((row) => (
                        <tr key={row.status} className="border-b hover:bg-slate-50/50">
                          <td className="p-2 text-xs font-medium text-slate-600 capitalize">{row.status.replace(/_/g, ' ')}</td>
                          <td className="p-2 text-right text-sm font-medium">{row.count}</td>
                          <td className="p-2 text-right text-sm font-medium">₹{fmt(row.value)}</td>
                        </tr>
                      ))}
                      {(data.pipeline?.by_status || []).length === 0 && (
                        <tr><td colSpan={3} className="text-center py-3 text-xs text-muted-foreground">No active pipeline leads</td></tr>
                      )}
                      <tr className="bg-slate-50 font-semibold border-t">
                        <td className="p-2 text-xs text-slate-700">Total</td>
                        <td className="p-2 text-right text-sm">{data.pipeline?.total_count || 0}</td>
                        <td className="p-2 text-right text-sm">₹{fmt(data.pipeline?.total_value)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 pt-2 border-t grid grid-cols-2 gap-3">
                  <InfoRow label="Leads Targeting Next Month" value={data.pipeline?.next_month_leads_count || 0} />
                  <InfoRow label="Next Month Pipeline Value" value={`₹${fmt(data.pipeline?.next_month_pipeline_value)}`} />
                  <InfoRow label="Coverage Ratio" value={fmtPct(data.pipeline?.coverage_ratio)} highlight={data.pipeline?.coverage_ratio < 50 ? 'red' : 'green'} />
                </div>
              </CardContent>
            </Card>

            {/* Outstanding Section */}
            <Card data-testid="outstanding-section">
              <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleSection('outstanding')}>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />Collections / Outstanding
                  {expandedSections.outstanding ? <ChevronDown className="h-4 w-4 ml-auto" /> : <ChevronRight className="h-4 w-4 ml-auto" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
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
                  <div className="mt-3 border-t pt-2">
                    <p className="text-xs font-semibold text-red-600 uppercase mb-1">Account-Level Outstanding</p>
                    {data.collections.account_details.slice(0, 10).map(a => (
                      <div key={a.account_id} className="text-xs flex justify-between py-0.5">
                        <span>{a.account_id?.slice(0, 12)}... ({a.invoices} inv)</span>
                        <span className="font-medium text-red-600">₹{fmt(a.outstanding)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Section */}
            <Card data-testid="activity-section">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Phone className="h-4 w-4 text-purple-600" />Activity Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <InfoRow label="Visits" value={data.activities?.visits} />
                  <InfoRow label="Calls" value={data.activities?.calls} />
                  <InfoRow label="Follow-ups" value={data.activities?.follow_ups} />
                  <InfoRow label="Visit Productivity" value={data.activities?.visit_productivity > 0 ? `₹${fmt(data.activities?.visit_productivity)}/visit` : '-'} />
                  <InfoRow label="Call Productivity" value={data.activities?.call_productivity > 0 ? `₹${fmt(data.activities?.call_productivity)}/call` : '-'} />
                </div>
              </CardContent>
            </Card>

            {/* Support Section */}
            <Card data-testid="support-section">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-indigo-600" />Support Needed</CardTitle>
                <CardDescription>Select areas where team support is required</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {SUPPORT_CATEGORIES.map(cat => (
                    <Badge
                      key={cat}
                      variant={supportNeeded.includes(cat) ? 'default' : 'outline'}
                      className={`cursor-pointer transition-all ${supportNeeded.includes(cat) ? 'bg-indigo-600' : 'hover:bg-indigo-50'} ${isLocked ? 'pointer-events-none' : ''}`}
                      onClick={() => !isLocked && toggleSupport(cat)}
                      data-testid={`support-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
                <div>
                  <label className="text-xs text-slate-500">Remarks</label>
                  <Textarea
                    value={remarks} onChange={e => setRemarks(e.target.value)}
                    placeholder="Additional comments or observations..."
                    className="mt-1" rows={3} disabled={isLocked}
                    data-testid="remarks"
                  />
                </div>
              </CardContent>
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
          <Card data-testid="kpi-section">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-teal-600" />Performance KPIs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPICard label="Achievement %" value={fmtPct(data.calculated?.achievement_pct)} good={data.calculated?.achievement_pct >= 80} bad={data.calculated?.achievement_pct < 50} />
                <KPICard label="Pipeline Coverage" value={fmtPct(data.calculated?.pipeline_coverage)} good={data.calculated?.pipeline_coverage >= 100} bad={data.calculated?.pipeline_coverage < 50} />
                <KPICard label="Outstanding Ratio" value={fmtPct(data.calculated?.outstanding_ratio)} good={data.calculated?.outstanding_ratio < 20} bad={data.calculated?.outstanding_ratio > 50} invert />
                <KPICard label="Visit Productivity" value={data.calculated?.visit_productivity > 0 ? `₹${fmt(data.calculated.visit_productivity)}` : '-'} />
                <KPICard label="Call Productivity" value={data.calculated?.call_productivity > 0 ? `₹${fmt(data.calculated.call_productivity)}` : '-'} />
                <KPICard label="Conversion Rate" value={fmtPct(data.calculated?.account_conversion_rate)} good={data.calculated?.account_conversion_rate >= 20} />
              </div>
            </CardContent>
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
  const hlMap = { red: 'text-red-600', green: 'text-emerald-600', amber: 'text-amber-600' };
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-dashed border-slate-100">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? hlMap[highlight] : 'text-slate-700'}`}>{value}</span>
    </div>
  );
}

function AgingBucket({ label, value, color }) {
  const bg = { emerald: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', orange: 'bg-orange-50 text-orange-700', red: 'bg-red-50 text-red-700' };
  return (
    <div className={`rounded-lg p-2 text-center ${bg[color]}`}>
      <p className="text-[10px] font-medium uppercase">{label}</p>
      <p className="text-sm font-bold">₹{fmt(value)}</p>
    </div>
  );
}

function KPICard({ label, value, good, bad, invert }) {
  const color = invert ? (bad ? 'bg-red-50 border-red-200 text-red-700' : good ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-700') : (good ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : bad ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-700');
  return (
    <div className={`rounded-xl border p-3 text-center ${color}`}>
      <p className="text-[10px] uppercase tracking-wider font-medium mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function CompRow({ label, months, field, prefix = '', suffix = '' }) {
  const values = months.map(m => m[field] || 0);
  const last = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : 0;
  const change = prev > 0 ? ((last - prev) / prev * 100) : 0;
  return (
    <tr className="border-b hover:bg-slate-50/50">
      <td className="p-2.5 text-xs font-medium text-slate-600">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="p-2.5 text-right text-sm font-medium">{prefix}{fmt(v)}{suffix}</td>
      ))}
      <td className="p-2.5 text-right">
        {change !== 0 ? (
          <span className={`text-xs font-semibold flex items-center justify-end gap-0.5 ${change > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
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
          body: JSON.stringify({ resource_id: selectedResource, plan_id: selectedPlan, month: m.month, year: m.year, field, value: val })
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
          `${API_URL}/api/performance/comparison/override?resource_id=${selectedResource}&plan_id=${selectedPlan}&month=${m.month}&year=${m.year}&field=${field}`,
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
    <Card data-testid="comparison-section">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-600" />Month-on-Month Comparison (Last 3 Months)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase">
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
              />
              <CompRow label="Target" months={comparison.months} field="monthly_target" prefix="₹" />
              <CompRow label="Achievement %" months={comparison.months} field="achievement_pct" suffix="%" />
              <CompRow label="New Accounts" months={comparison.months} field="new_accounts" />
              <CompRow label="Existing Accounts" months={comparison.months} field="existing_accounts" />
              <CompRow label="Pipeline Value" months={comparison.months} field="pipeline_value" prefix="₹" />
              <CompRow label="Pipeline Accounts" months={comparison.months} field="pipeline_count" />
              <EditableCompRow
                label="Outstanding" months={comparison.months} field="total_outstanding" autoField="auto_outstanding"
                overrideFlag="has_outstanding_override" prefix="₹" editingRow={editingRow} editValues={editValues}
                setEditValues={setEditValues} savingRow={savingRow} rowKey="outstanding"
                onEdit={() => startEdit('outstanding')} onSave={() => saveRow('outstanding')}
                onCancel={cancelEdit} onReset={() => resetRow('outstanding')} hasOverride={hasOverride('outstanding')}
              />
              <CompRow label="Visits" months={comparison.months} field="visits" />
              <CompRow label="Calls" months={comparison.months} field="calls" />
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function EditableCompRow({ label, months, field, autoField, overrideFlag, prefix = '', editingRow, editValues, setEditValues, savingRow, rowKey, onEdit, onSave, onCancel, onReset, hasOverride }) {
  const isEditing = editingRow === rowKey;
  const isSaving = savingRow === rowKey;
  const values = months.map(m => m[field] || 0);
  const last = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : 0;
  const change = prev > 0 ? ((last - prev) / prev * 100) : 0;

  return (
    <tr className={`border-b ${isEditing ? 'bg-blue-50/50' : hasOverride ? 'bg-amber-50/30' : 'hover:bg-slate-50/50'}`} data-testid={`comp-row-${rowKey}`}>
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
