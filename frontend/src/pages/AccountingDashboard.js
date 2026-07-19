import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ChevronLeft, ChevronRight, Loader2, Banknote } from 'lucide-react';
import { Input } from '../components/ui/input';
import { DashKpis } from '../components/accounting/DashKpis';
import { DashTrendChart } from '../components/accounting/DashTrendChart';
import { CategoryDrilldown } from '../components/accounting/CategoryDrilldown';
import { DashSidePanels } from '../components/accounting/DashSidePanels';

const API = process.env.REACT_APP_BACKEND_URL;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, withCredentials: true });

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const fyStartOf = (d) => new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);

const computeRange = (mode, anchor, custom) => {
  if (mode === 'custom') return { start: custom.start, end: custom.end, label: 'Custom range' };
  if (mode === 'fy') {
    const s = fyStartOf(anchor);
    const e = new Date(s.getFullYear() + 1, 2, 31);
    return { start: iso(s), end: iso(e), label: `FY ${s.getFullYear()}–${String(s.getFullYear() + 1).slice(2)}` };
  }
  if (mode === 'quarter') {
    const fy = fyStartOf(anchor);
    const qIdx = Math.floor((((anchor.getMonth() - 3) + 12) % 12) / 3); // 0..3 within FY
    const s = new Date(fy.getFullYear(), 3 + qIdx * 3, 1);
    const e = new Date(fy.getFullYear(), 3 + qIdx * 3 + 3, 0);
    return { start: iso(s), end: iso(e), label: `Q${qIdx + 1} FY ${fy.getFullYear()}–${String(fy.getFullYear() + 1).slice(2)}` };
  }
  const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const e = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: iso(s), end: iso(e), label: s.toLocaleString('en-IN', { month: 'long', year: 'numeric' }) };
};

const MODES = [['fy', 'FY'], ['quarter', 'Qtr'], ['month', 'Month'], ['custom', 'Custom']];

export default function AccountingDashboard() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('fy');
  const [anchor, setAnchor] = useState(() => new Date());
  const [custom, setCustom] = useState(() => {
    const s = fyStartOf(new Date());
    return { start: iso(s), end: iso(new Date()) };
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => computeRange(mode, anchor, custom), [mode, anchor, custom]);

  const shift = (dir) => {
    const d = new Date(anchor);
    if (mode === 'fy') d.setFullYear(d.getFullYear() + dir);
    else if (mode === 'quarter') d.setMonth(d.getMonth() + 3 * dir);
    else d.setMonth(d.getMonth() + dir);
    setAnchor(d);
  };

  const fetchDash = useCallback(async () => {
    if (!range.start || !range.end) return;
    setLoading(true);
    try {
      const { data: d } = await axios.get(`${API}/api/accounting/transactions/dashboard`, {
        ...auth(), params: { date_start: range.start, date_end: range.end },
      });
      setData(d);
    } catch { setData(null); }
    setLoading(false);
  }, [range.start, range.end]);

  useEffect(() => { fetchDash(); }, [fetchDash]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto" data-testid="accounting-dashboard-page">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-9 w-9 rounded-lg bg-emerald-700 text-white flex items-center justify-center"><Banknote className="h-5 w-5" /></span>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Accounting Dashboard</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Inward &amp; outward money at a glance — {range.label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode !== 'custom' && (
            <div className="flex items-center rounded-full border border-border bg-card">
              <button onClick={() => shift(-1)} className="p-2 hover:bg-muted rounded-l-full transition-colors" data-testid="period-prev-btn" aria-label="Previous period">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 text-sm font-medium tabular-nums whitespace-nowrap" data-testid="period-label">{range.label}</span>
              <button onClick={() => shift(1)} className="p-2 hover:bg-muted rounded-r-full transition-colors" data-testid="period-next-btn" aria-label="Next period">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="rounded-full bg-secondary p-1 flex text-sm">
            {MODES.map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)} data-testid={`period-mode-${k}`}
                className={`rounded-full px-3.5 py-1.5 font-medium transition-colors ${mode === k ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
          {mode === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
                className="h-9 w-[150px]" data-testid="custom-date-start" />
              <span className="text-muted-foreground text-sm">to</span>
              <Input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
                className="h-9 w-[150px]" data-testid="custom-date-end" />
            </div>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="py-24 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <div className="py-24 text-center text-sm text-muted-foreground">Could not load dashboard data</div>
      ) : (
        <>
          <DashKpis
            kpis={data.kpis}
            onUntaggedClick={() => navigate('/accounting/transactions')}
            onBillsClick={() => navigate('/accounting/transactions')}
          />
          <DashTrendChart monthly={data.monthly} />
          <CategoryDrilldown dateStart={range.start} dateEnd={range.end} />
          <DashSidePanels topVendors={data.top_vendors} topPayees={data.top_payees} bankAccounts={data.bank_accounts} />
        </>
      )}
    </div>
  );
}
