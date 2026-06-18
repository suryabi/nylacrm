import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Loader2, Link2, Search, AlertTriangle, ChevronLeft } from 'lucide-react';
import { Input } from '../components/ui/input';
import { useNavigate } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────────
// SkuRelinkTool — bulk fix for orphaned SKU pricing rows.
//
// What is an "orphan"?  An entry inside `accounts.sku_pricing[]`,
// `leads.proposed_sku_pricing[]`, or `sampling_trials.sku_plans[]` that has
// NO `sku_id` linked AND whose stored `sku` (name) no longer matches any
// current `master_skus.sku_name` — i.e. the SKU was renamed after the row
// was created.
//
// This page shows every distinct orphan name once, with the count of how many
// Account / Lead / Sampling-Trial rows reference it. The admin picks the
// correct current SKU from a dropdown next to each row, then clicks "Apply"
// to relink all affected rows in one POST.
// ─────────────────────────────────────────────────────────────────────────────

export default function SkuRelinkTool() {
  const API_URL = process.env.REACT_APP_BACKEND_URL;
  const navigate = useNavigate();
  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  });

  const [loading, setLoading] = useState(true);
  const [orphans, setOrphans] = useState([]); // [{stored_name, account_rows, lead_rows, sampling_rows, sample_account_names, sample_lead_names}]
  const [masterSkus, setMasterSkus] = useState([]); // [{id, sku_name, category, unit}]
  const [picks, setPicks] = useState({}); // {stored_name_lower: target_sku_id}
  const [filter, setFilter] = useState('');
  const [applying, setApplying] = useState(false);
  const [totals, setTotals] = useState({ distinct_orphan_names: 0, total_rows: 0 });

  const fetchOrphans = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(
        `${API_URL}/api/admin/migrations/sku/orphan-pricing`,
        { headers: headers() }
      );
      setOrphans(data.orphans || []);
      setMasterSkus(data.master_skus || []);
      setTotals(data.totals || { distinct_orphan_names: 0, total_rows: 0 });
      // reset picks
      setPicks({});
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to load orphan pricing rows.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrphans(); /* eslint-disable-next-line */ }, []);

  const handlePick = (storedNameKey, sku_id) => {
    setPicks(p => ({ ...p, [storedNameKey]: sku_id }));
  };

  const handleApply = async () => {
    const mappings = orphans
      .map(o => ({
        stored_name: o.stored_name,
        target_sku_id: picks[o.stored_name.toLowerCase()],
      }))
      .filter(m => !!m.target_sku_id);
    if (mappings.length === 0) {
      toast.error('Pick a target SKU for at least one orphan name first.');
      return;
    }
    if (!window.confirm(`Re-link ${mappings.length} orphan SKU name${mappings.length>1?'s':''} across all Accounts, Leads, and Sampling Trials? This is safe and idempotent.`)) return;
    setApplying(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/admin/migrations/sku/bulk-relink`,
        { mappings },
        { headers: headers() }
      );
      const n = data?.totals?.rows_relinked ?? 0;
      toast.success(`Re-linked ${n} pricing row${n===1?'':'s'} across ${data?.mappings_applied} mapping${data?.mappings_applied===1?'':'s'}.`);
      await fetchOrphans();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Bulk re-link failed.');
    } finally {
      setApplying(false);
    }
  };

  const filteredOrphans = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return orphans;
    return orphans.filter(o =>
      o.stored_name.toLowerCase().includes(q)
      || (o.sample_account_names || []).some(n => n.toLowerCase().includes(q))
      || (o.sample_lead_names || []).some(n => n.toLowerCase().includes(q))
    );
  }, [orphans, filter]);

  const pickedCount = useMemo(
    () => Object.values(picks).filter(Boolean).length,
    [picks]
  );

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="sku-relink-page">
      <div className="flex items-center gap-3 mb-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/sku-management')}
          data-testid="back-to-sku-mgmt-btn"
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to SKU Management
        </Button>
      </div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
            <Link2 className="h-6 w-6 text-orange-600" />
            Re-link Orphan SKU Pricing
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            These pricing rows refer to a SKU <strong>name</strong> that no longer matches any current master SKU
            (typically because the SKU was renamed since the row was created). Pick the correct
            current SKU next to each row, then click <strong>Apply re-links</strong>. We&rsquo;ll link every
            Account, Lead and Sampling Trial row that uses that old name to the chosen SKU in one shot.
          </p>
        </div>
        <Button
          onClick={handleApply}
          disabled={applying || pickedCount === 0}
          data-testid="apply-relinks-btn"
          className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-200/50 disabled:opacity-50"
        >
          {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
          Apply re-links {pickedCount > 0 ? `(${pickedCount})` : ''}
        </Button>
      </div>

      <Card className="p-4 mb-4 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="orphan-filter-input"
              placeholder="Filter by stored name or account / lead name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10 border-slate-200 dark:border-slate-700"
            />
          </div>
          <Badge variant="outline" className="text-xs">
            {totals.distinct_orphan_names} distinct orphan name{totals.distinct_orphan_names === 1 ? '' : 's'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {totals.total_rows} total row{totals.total_rows === 1 ? '' : 's'} affected
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOrphans}
            disabled={loading || applying}
            data-testid="refresh-orphans-btn"
          >
            Refresh
          </Button>
        </div>
      </Card>

      <Card className="p-0 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Scanning Accounts &amp; Leads…
          </div>
        ) : orphans.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <div className="text-emerald-600 mb-2">✓ No orphans found.</div>
            Every pricing row on every Account and Lead is linked to a valid current SKU.
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="orphan-table">
            <thead className="bg-slate-50/80 dark:bg-slate-800/80">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Stored name (orphan)</th>
                <th className="px-4 py-3 font-medium">Used in</th>
                <th className="px-4 py-3 font-medium">Sample references</th>
                <th className="px-4 py-3 font-medium">Relink to current SKU</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredOrphans.map((o) => {
                const key = o.stored_name.toLowerCase();
                const total = o.account_rows + o.lead_rows + o.sampling_rows;
                return (
                  <tr key={key} data-testid={`orphan-row-${key}`} className="hover:bg-slate-50/40 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        <code className="text-xs bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-2 py-1 rounded text-amber-900 dark:text-amber-100">
                          {o.stored_name}
                        </code>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        {o.account_rows > 0 && <Badge variant="outline" className="text-xs w-fit">{o.account_rows} account row{o.account_rows===1?'':'s'}</Badge>}
                        {o.lead_rows > 0 && <Badge variant="outline" className="text-xs w-fit">{o.lead_rows} lead row{o.lead_rows===1?'':'s'}</Badge>}
                        {o.sampling_rows > 0 && <Badge variant="outline" className="text-xs w-fit">{o.sampling_rows} sampling row{o.sampling_rows===1?'':'s'}</Badge>}
                        <span className="text-xs text-muted-foreground">{total} total</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                        {(o.sample_account_names || []).map((n, i) => (
                          <div key={`a-${i}`}>· {n}</div>
                        ))}
                        {(o.sample_lead_names || []).map((n, i) => (
                          <div key={`l-${i}`} className="italic">· {n} <span className="text-muted-foreground">(lead)</span></div>
                        ))}
                        {(o.sample_account_names || []).length === 0 && (o.sample_lead_names || []).length === 0 && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top w-[280px]">
                      <Select
                        value={picks[key] || ''}
                        onValueChange={(v) => handlePick(key, v)}
                      >
                        <SelectTrigger data-testid={`relink-target-${key}`} className="w-full">
                          <SelectValue placeholder="Pick target SKU…" />
                        </SelectTrigger>
                        <SelectContent>
                          {masterSkus.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.sku_name}
                              {s.category ? <span className="text-muted-foreground ml-2 text-xs">· {s.category}</span> : null}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
              {filteredOrphans.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No orphans match &ldquo;{filter}&rdquo;.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
