import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ArrowDown, ArrowUp, Banknote, Boxes, Filter, Loader2, Package, RefreshCw, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { SearchCombobox } from '../components/SearchCombobox';
import { SkuAccountsDialog } from '../components/SkuAccountsDialog';

const API_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;
const currency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const quantity = (value) => Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 });

const MetricTile = ({ id, label, value, sub, Icon, tone = 'slate', delay = 0 }) => {
  const tones = {
    emerald: 'border-emerald-200/70 bg-emerald-50/70 text-emerald-700',
    blue: 'border-blue-200/70 bg-blue-50/70 text-blue-700',
    amber: 'border-amber-200/70 bg-amber-50/70 text-amber-700',
    violet: 'border-violet-200/70 bg-violet-50/70 text-violet-700',
    rose: 'border-rose-200/70 bg-rose-50/70 text-rose-700',
    slate: 'border-slate-200/80 bg-slate-50/80 text-slate-700',
  };
  return (
    <div className={`sku-rise rounded-xl border p-4 ${tones[tone]}`} style={{ animationDelay: `${delay}ms` }} data-testid={id}>
      <div className="flex items-center gap-2"><Icon className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span></div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900" data-testid={`${id}-value`}>{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-slate-500" title={sub}>{sub}</p>
    </div>
  );
};

const MonthValue = ({ month, sku, rowIndex }) => (
  <td className="min-w-[112px] px-3 py-3 text-right" data-testid={`sku-month-${rowIndex}-${month.key}`}>
    <p className="font-semibold tabular-nums text-slate-800">{Number(month.units || 0).toLocaleString('en-IN')}</p>
    <p className="mt-0.5 text-[11px] tabular-nums text-emerald-700">{currency(month.revenue)}</p>
    <span className="sr-only">{sku} {month.label}</span>
  </td>
);

export default function SKUPerformance() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ months: [], skus: [], summary: {}, filters: { distributors: [], accounts: [] } });
  const [salesTeam, setSalesTeam] = useState([]);
  const [distributor, setDistributor] = useState('all');
  const [defaulted, setDefaulted] = useState(false);
  const [salesResource, setSalesResource] = useState('all');
  const [skuFilter, setSkuFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [accountsSku, setAccountsSku] = useState(null);

  useEffect(() => {
    axios.get(`${API_URL}/users`, { withCredentials: true }).then((response) => {
      setSalesTeam(response.data.filter((user) => ['Head of Business', 'Regional Sales Manager', 'National Sales Head', 'Partner - Sales'].includes(user.role) && user.is_active));
    }).catch(() => {});
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (distributor !== 'all') params.set('distributor_id', distributor);
      if (salesResource !== 'all') params.set('resource_id', salesResource);
      if (skuFilter !== 'all') params.set('sku', skuFilter);
      if (accountFilter !== 'all') params.set('account_id', accountFilter);
      const response = await axios.get(`${API_URL}/reports/sku-performance-six-month?${params}`, { withCredentials: true });
      setData(response.data);
      if (!defaulted) {
        setDefaulted(true);
        if (response.data.default_distributor_id) setDistributor(response.data.default_distributor_id);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load SKU performance');
      setData({ months: [], skus: [], summary: {}, filters: { distributors: [], accounts: [] } });
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, [distributor, salesResource, skuFilter, accountFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetFilters = () => {
    setDistributor('all'); setSalesResource('all'); setSkuFilter('all'); setAccountFilter('all');
  };
  const rows = useMemo(() => [...(data.skus || [])].sort((a, b) => (b.achieved_revenue || 0) - (a.achieved_revenue || 0)), [data.skus]);
  const summary = data.summary || {};
  const topRevenue = Math.max(1, ...rows.map((row) => row.achieved_revenue || 0));
  const momUnits = summary.mom_units_change || 0;
  const momRevenue = summary.mom_revenue_change || 0;
  const MoMIcon = momUnits >= 0 ? ArrowUp : ArrowDown;
  const defaultName = data.filters?.distributors?.find((item) => item.id === data.default_distributor_id)?.name;

  return (
    <div className="min-h-screen min-w-0 w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50/40" data-testid="sku-performance-dashboard">
      <style>{`@keyframes skuRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }.sku-rise { animation: skuRise .45s cubic-bezier(.16,1,.3,1) both; }`}</style>
      <div className="mx-auto min-w-0 w-full max-w-[1800px] space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#002FA7] text-white shadow-sm"><Package className="h-5 w-5" /></div>
            <div><h1 className="text-3xl font-bold text-slate-900">SKU Performance</h1><p className="mt-0.5 text-sm text-slate-500" data-testid="sku-period-label">Six-month bottles and revenue by SKU · {data.period_label || 'rolling six months'}</p></div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} data-testid="sku-refresh-button" aria-label="Refresh SKU performance"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="sku-filters">
          <div className="mb-3 flex items-center gap-2"><Filter className="h-4 w-4 text-[#002FA7]" /><h2 className="text-sm font-semibold text-slate-700">Filters</h2></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase text-slate-500">Distributor</label><SearchCombobox options={data.filters?.distributors || []} value={distributor} onChange={(value) => { setDistributor(value); setAccountFilter('all'); }} placeholder="All distributors" allLabel="All distributors" testId="distributor-filter" /></div>
            <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase text-slate-500">Account</label><SearchCombobox options={data.filters?.accounts || []} value={accountFilter} onChange={setAccountFilter} placeholder="All accounts" allLabel="All accounts" testId="account-filter" /></div>
            <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase text-slate-500">Sales resource</label><SearchCombobox options={salesTeam.map((member) => ({ id: member.id, name: member.name, sub: member.role }))} value={salesResource} onChange={(value) => { setSalesResource(value); setAccountFilter('all'); }} placeholder="All resources" allLabel="All resources" testId="resource-filter" /></div>
            <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase text-slate-500">SKU</label><SearchCombobox options={(data.sku_options || []).map((name) => ({ id: name, name }))} value={skuFilter} onChange={setSkuFilter} placeholder="All SKUs" allLabel="All SKUs" testId="sku-filter" /></div>
            <div className="flex items-end"><Button variant="outline" onClick={resetFilters} className="h-[42px] w-full rounded-xl" data-testid="reset-filters-btn">Reset filters</Button></div>
          </div>
          {defaultName && distributor === data.default_distributor_id && <p className="mt-2 text-[11px] text-[#002FA7]" data-testid="sku-default-distributor">Defaulted to {defaultName} for your city</p>}
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="sku-metric-tiles">
          <MetricTile id="stat-six-month-bottles" label="6M Bottles" value={quantity(summary.total_units)} sub="invoice line units" Icon={ShoppingBag} tone="blue" />
          <MetricTile id="stat-six-month-crates" label="6M Crates" value={quantity(summary.total_crates)} sub="from line packaging" Icon={Boxes} tone="amber" delay={40} />
          <MetricTile id="stat-six-month-revenue" label="6M Revenue" value={currency(summary.total_revenue)} sub="SKU line revenue" Icon={Banknote} tone="emerald" delay={80} />
          <MetricTile id="stat-active-skus" label="Active SKUs" value={summary.active_skus || 0} sub="sold in this period" Icon={Package} tone="violet" delay={120} />
          <MetricTile id="stat-six-month-accounts" label="Accounts" value={summary.total_accounts || 0} sub="distinct invoiced accounts" Icon={Users} tone="slate" delay={160} />
          <MetricTile id="stat-mom-change" label="MoM Bottles" value={`${momUnits > 0 ? '+' : momUnits < 0 ? '−' : ''}${quantity(Math.abs(momUnits))}`} sub={`${momRevenue > 0 ? '+' : momRevenue < 0 ? '−' : ''}${currency(Math.abs(momRevenue))} revenue`} Icon={MoMIcon} tone={momUnits >= 0 ? 'emerald' : 'rose'} delay={200} />
        </section>

        <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3"><h2 className="text-base font-semibold text-slate-800">SKU six-month performance</h2><span className="text-xs text-slate-500">Bottles · revenue below</span></div>
          {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#002FA7]" /></div> : rows.length === 0 ? <div className="py-20 text-center text-sm text-slate-500" data-testid="sku-empty-state">No SKU data matches the filters.</div> : (
            <div className="min-w-0 max-w-full w-full overflow-x-auto overscroll-x-contain" style={{ contain: 'layout paint' }} data-testid="sku-table-scroll">
              <table className="min-w-[1250px] w-full border-collapse text-sm" data-testid="sku-six-month-table">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr>
                  <th className="sticky left-0 z-20 min-w-[260px] border-r border-slate-200 bg-slate-50 px-4 py-3 text-left">SKU</th>
                  {data.months.map((month) => <th key={month.key} className={`min-w-[112px] px-3 py-3 text-right ${month.current ? 'text-[#002FA7]' : ''}`} data-testid={`sku-month-header-${month.key}`}>{month.label}{month.current && <span className="ml-1 normal-case">current</span>}</th>)}
                  <th className="min-w-[130px] bg-slate-100 px-3 py-3 text-right">6M total</th><th className="min-w-[88px] px-4 py-3 text-right">Accounts</th>
                </tr></thead>
                <tbody>{rows.map((row, index) => {
                  const share = summary.total_revenue > 0 ? row.achieved_revenue / summary.total_revenue * 100 : 0;
                  return <tr key={row.sku} className="border-t border-slate-100 hover:bg-blue-50/30" data-testid={`sku-row-${index}`}>
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-500">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-800" title={row.sku}>{row.sku}</p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#002FA7]" style={{ width: `${Math.max(0, Math.min(100, row.achieved_revenue / topRevenue * 100))}%` }} /></div><p className="mt-1 text-[10px] text-slate-400">{share.toFixed(1)}% of revenue</p></div></div></td>
                    {row.months.map((month) => <MonthValue key={month.key} month={month} sku={row.sku} rowIndex={index} />)}
                    <td className="bg-slate-50/70 px-3 py-3 text-right" data-testid={`sku-total-${index}`}><p className="font-bold tabular-nums text-slate-900">{quantity(row.units_sold)}</p><p className="mt-0.5 text-[11px] tabular-nums text-emerald-700">{currency(row.achieved_revenue)}</p><p className="mt-0.5 text-[10px] text-slate-400">{quantity(row.crates_sold)} crates</p></td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => setAccountsSku(row)} className="font-semibold text-[#002FA7] underline decoration-dotted underline-offset-4" title="Show six-month account totals" data-testid={`sku-accounts-btn-${index}`}>{row.accounts_count || 0}</button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <SkuAccountsDialog open={Boolean(accountsSku)} onClose={() => setAccountsSku(null)} sku={accountsSku?.sku} accounts={accountsSku?.accounts || []} periodLabel={data.period_label || 'Last 6 months'} />
    </div>
  );
}