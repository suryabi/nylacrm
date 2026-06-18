import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ChevronLeft, Search, Loader2, Factory, Truck, ArrowRight,
  PackageCheck, Building2, AlertCircle, ShieldAlert, CheckCircle2,
  Layers, Sparkles,
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

// ─────────────────────────────────────────────────────────────────────────────
// Batch Genealogy — full lineage of a production batch.
// URL:    /admin/batch-genealogy           (search picker)
//         /admin/batch-genealogy/:batchId  (full lineage view)
// ─────────────────────────────────────────────────────────────────────────────

const EVENT_META = {
  produced:         { label: 'Produced',            icon: Factory,       color: 'from-violet-500 to-fuchsia-500',  ring: 'ring-violet-200 dark:ring-violet-900' },
  factory_transfer: { label: 'Factory Warehouse',   icon: Building2,     color: 'from-sky-500 to-cyan-500',         ring: 'ring-sky-200 dark:ring-sky-900' },
  stock_in:         { label: 'Stock In',            icon: PackageCheck,  color: 'from-emerald-500 to-teal-500',     ring: 'ring-emerald-200 dark:ring-emerald-900' },
  stock_transfer:   { label: 'Stock Transfer',      icon: ArrowRight,    color: 'from-amber-500 to-orange-500',     ring: 'ring-amber-200 dark:ring-amber-900' },
  stock_out:        { label: 'Stock Out',           icon: Truck,         color: 'from-rose-500 to-pink-500',        ring: 'ring-rose-200 dark:ring-rose-900' },
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return iso; }
};

const fmtNum = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');

function LocChip({ loc }) {
  if (!loc) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs">
      {loc.is_factory ? <Factory className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
      <span className="font-medium">{loc.name}</span>
      {loc.city && <span className="text-muted-foreground">· {loc.city}</span>}
      {loc.distributor_name && !loc.is_factory && (
        <span className="text-muted-foreground italic">({loc.distributor_name})</span>
      )}
    </span>
  );
}

function MassBalanceCard({ balance }) {
  if (!balance) return null;
  const drift = balance.drift || 0;
  const ok = Math.abs(drift) < 1;
  return (
    <Card
      data-testid="mass-balance-card"
      className="p-5 border-0 bg-gradient-to-br from-white/95 to-slate-50/80 dark:from-slate-900/95 dark:to-slate-800/80 backdrop-blur-xl shadow-lg shadow-slate-200/40 dark:shadow-slate-900/40"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" /> Mass Balance
        </h3>
        <Badge
          variant={ok ? 'default' : 'destructive'}
          className={ok ? 'bg-emerald-500/90 hover:bg-emerald-500 text-white' : ''}
          data-testid="mass-balance-status"
        >
          {ok ? (
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Reconciled</span>
          ) : (
            <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Drift {drift > 0 ? '+' : ''}{fmtNum(drift)}</span>
          )}
        </Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
        {[
          ['Produced', balance.produced, 'text-violet-700 dark:text-violet-300'],
          ['Rejected (QC)', balance.rejected_at_qc, 'text-rose-700 dark:text-rose-300'],
          ['→ Warehouse', balance.transferred_to_warehouse, 'text-sky-700 dark:text-sky-300'],
          ['Delivered Out', balance.delivered_to_customers, 'text-pink-700 dark:text-pink-300'],
          ['Resting Now', balance.currently_resting, 'text-emerald-700 dark:text-emerald-300'],
          ['Expected Resting', balance.expected_resting, 'text-amber-700 dark:text-amber-300'],
        ].map(([label, val, cls]) => (
          <div key={label} className="rounded-lg border border-slate-200/70 dark:border-slate-700/70 px-3 py-2 bg-white/70 dark:bg-slate-900/50">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={`text-lg font-semibold tabular-nums ${cls}`}>{fmtNum(val || 0)}</div>
          </div>
        ))}
      </div>
      {(balance.in_qc_pipeline || 0) > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          {fmtNum(balance.in_qc_pipeline)} bottle{balance.in_qc_pipeline === 1 ? '' : 's'} still in the QC pipeline (not yet transferred to a warehouse).
        </p>
      )}
    </Card>
  );
}

function TimelineRow({ ev, isLast }) {
  const meta = EVENT_META[ev.type] || { label: ev.type, icon: Sparkles, color: 'from-slate-500 to-slate-700', ring: 'ring-slate-200' };
  const Icon = meta.icon;
  return (
    <div className="relative flex gap-4" data-testid={`timeline-event-${ev.type}`}>
      <div className="flex flex-col items-center">
        <div className={`relative z-10 h-9 w-9 rounded-full bg-gradient-to-br ${meta.color} ring-4 ${meta.ring} flex items-center justify-center text-white shadow-md`}>
          <Icon className="h-4 w-4" />
        </div>
        {!isLast && <div className="flex-1 w-px bg-gradient-to-b from-slate-300 to-transparent dark:from-slate-700 mt-1 mb-1" />}
      </div>
      <div className="flex-1 pb-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1.5">
          <span className="font-semibold text-sm">{meta.label}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(ev.at)}</span>
          {ev.status && <Badge variant="outline" className="text-[10px] uppercase">{ev.status}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {ev.from && (
            <>
              <LocChip loc={ev.from} />
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </>
          )}
          {ev.to && <LocChip loc={ev.to} />}
          <span className="ml-auto font-semibold text-base tabular-nums">{fmtNum(ev.qty)} <span className="text-xs text-muted-foreground font-normal">bottles</span></span>
        </div>
        {(ev.ref?.code || ev.ref?.distributor || ev.note || ev.by) && (
          <div className="mt-1.5 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
            {ev.ref?.code && <span>Ref: <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{ev.ref.code}</code></span>}
            {ev.ref?.distributor && <span>· {ev.ref.distributor}</span>}
            {ev.by && <span>· by {ev.by}</span>}
            {ev.note && <span className="italic">· {ev.note}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function GenealogyDetail({ batchId, onBack }) {
  const API_URL = process.env.REACT_APP_BACKEND_URL;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    axios.get(`${API_URL}/api/admin/batches/${batchId}/genealogy`, { headers: headers() })
      .then(({ data }) => { if (alive) setData(data); })
      .catch((e) => toast.error(e?.response?.data?.detail || 'Failed to load batch genealogy.'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [batchId]);

  if (loading) {
    return (
      <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2" data-testid="genealogy-loading">
        <Loader2 className="h-4 w-4 animate-spin" /> Tracing batch lineage…
      </div>
    );
  }
  if (!data) return null;

  const { batch, timeline, resting_stock, mass_balance } = data;

  return (
    <div className="space-y-5" data-testid="genealogy-detail">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="back-to-search-btn">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to search
        </Button>
      </div>

      {/* Batch header */}
      <Card className="p-5 border-0 bg-gradient-to-br from-violet-50/80 via-white/90 to-fuchsia-50/80 dark:from-violet-950/30 dark:via-slate-900/95 dark:to-fuchsia-950/30 backdrop-blur-xl shadow-lg" data-testid="batch-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-violet-700 dark:text-violet-300 font-semibold">
              <Layers className="h-4 w-4" /> Batch
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold mt-1 tracking-tight">{batch.batch_code}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {batch.sku_name} · Produced {fmtDate(batch.produced_at)}
              {batch.production_date && <span> · Production date {batch.production_date}</span>}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">{batch.status}</Badge>
            {batch.total_crates ? (
              <Badge variant="outline" className="text-xs">{batch.total_crates} crates × {batch.bottles_per_crate}</Badge>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Mass balance */}
      <MassBalanceCard balance={mass_balance} />

      {/* Two columns: Timeline + Resting */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Timeline */}
        <Card className="p-5 lg:col-span-2 border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-lg" data-testid="timeline-card">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Lineage Timeline
          </h3>
          {timeline.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6">No movements recorded yet.</div>
          ) : (
            <div className="pl-1">
              {timeline.map((ev, i) => (
                <TimelineRow key={i} ev={ev} isLast={i === timeline.length - 1} />
              ))}
            </div>
          )}
        </Card>

        {/* Resting stock */}
        <Card className="p-5 border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-lg" data-testid="resting-stock-card">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
            <PackageCheck className="h-4 w-4" /> Resting Stock
          </h3>
          {resting_stock.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6">No bottles from this batch are currently in stock.</div>
          ) : (
            <ul className="space-y-2.5">
              {resting_stock.map((r, i) => (
                <li
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-200/70 dark:border-slate-700/70 px-3 py-2.5 bg-slate-50/50 dark:bg-slate-800/50"
                  data-testid={`resting-row-${i}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.location?.name || '—'}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.owner}{r.location?.city ? ` · ${r.location.city}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">{fmtNum(r.qty)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.kind}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function GenealogySearch({ onPick }) {
  const API_URL = process.env.REACT_APP_BACKEND_URL;
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  });

  const fetchRows = (query) => {
    setLoading(true);
    axios.get(`${API_URL}/api/admin/batches/search`, {
      headers: headers(),
      params: { q: query, limit: 50 },
    })
      .then(({ data }) => setRows(data.batches || []))
      .catch((e) => toast.error(e?.response?.data?.detail || 'Failed to search batches.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRows(''); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchRows(q), 250);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line
  }, [q]);

  return (
    <div className="space-y-4" data-testid="genealogy-search">
      <Card className="p-4 border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            data-testid="batch-search-input"
            placeholder="Search by batch code or SKU name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10 border-slate-200 dark:border-slate-700"
          />
        </div>
      </Card>

      <Card className="p-0 border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-lg overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading batches…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No batches match &ldquo;{q}&rdquo;.</div>
        ) : (
          <table className="w-full text-sm" data-testid="batch-search-table">
            <thead className="bg-slate-50/80 dark:bg-slate-800/80">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Batch Code</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Produced</th>
                <th className="px-4 py-3 font-medium text-right">Bottles</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((b) => (
                <tr
                  key={b.id}
                  className="hover:bg-violet-50/40 dark:hover:bg-violet-950/30 cursor-pointer transition-colors"
                  onClick={() => onPick(b.id)}
                  data-testid={`batch-row-${b.batch_code}`}
                >
                  <td className="px-4 py-3">
                    <code className="text-xs bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 px-2 py-0.5 rounded text-violet-900 dark:text-violet-100 font-medium">
                      {b.batch_code}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{b.sku_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(b.production_date || b.created_at)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtNum(b.total_bottles || 0)}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="text-[10px] uppercase">{b.status || '—'}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40"
                      data-testid={`view-genealogy-btn-${b.batch_code}`}
                    >
                      View lineage <ChevronLeft className="h-4 w-4 ml-1 rotate-180" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export default function BatchGenealogy() {
  const { batchId } = useParams();
  const navigate = useNavigate();

  const handlePick = (id) => navigate(`/admin/batch-genealogy/${id}`);
  const handleBack = () => navigate('/admin/batch-genealogy');

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="batch-genealogy-page">
      <div className="mb-5">
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
          <Layers className="h-6 w-6 text-violet-600" />
          Batch Genealogy
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          End-to-end traceability for any production batch — origin, factory transfers, distributor shipments,
          inter-warehouse moves, customer deliveries, current resting stock, and a mass-balance reconciliation.
          Essential for FSSAI traceability and product recall scenarios.
        </p>
      </div>

      {batchId ? (
        <GenealogyDetail batchId={batchId} onBack={handleBack} />
      ) : (
        <GenealogySearch onPick={handlePick} />
      )}
    </div>
  );
}
