import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table2, RefreshCw, Columns3, Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Sigma, Download, Truck, Info, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useMasterLocations } from '../hooks/useMasterLocations';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });
const LS_KEY = 'volume_grid_hidden_columns_v3';
const LS_WIDTHS = 'volume_grid_col_widths';
const LS_ORDER = 'volume_grid_col_order';
const DEFAULT_HIDDEN = ['order_count', 'onboarded_date', 'last_order_sku', 'account_age_days', 'biweekly_volume_crates'];

const BASE_COLUMNS = [
  { key: 'account_name', label: 'Account Name', type: 'text' },
  { key: 'onboarded_date', label: 'On-boarded Date', type: 'date' },
  { key: 'account_age_days', label: 'Account Age (Days)', type: 'number' },
  { key: 'avg_order_frequency_days', label: 'Average Order Frequency (Days)', type: 'number' },
  { key: 'order_count', label: 'No. of Orders', type: 'number' },
  { key: 'first_delivery_date', label: 'First Delivery Date', type: 'date' },
  { key: 'latest_delivery_date', label: 'Latest Delivery Date', type: 'date' },
  { key: 'recent_delivery_dates', label: 'Last 4 Delivery Dates', type: 'list' },
  { key: 'recent_delivery_crates', label: 'Last 4 Delivery Qty (Crates)', type: 'list' },
  { key: 'last_order_quantity', label: 'Last Order Quantity (Crates)', type: 'number' },
  { key: 'last_order_sku', label: 'Last Ordered SKU', type: 'text' },
  { key: 'biweekly_volume_crates', label: 'Bi-weekly Volume (Crates)', type: 'number' },
  { key: 'expected_monthly_volume_crates', label: 'Expected Monthly Volume (Crates)', type: 'number', editable: true },
  { key: 'actual_monthly_consumption_crates', label: 'Actual Monthly Consumption (Crates)', type: 'number' },
  { key: 'warehouse_stock_crates', label: 'Stock at Warehouse (Crates)', type: 'number' },
];

// Names usable inside formulas → row value resolver
const formulaContext = (row, customCols) => {
  const ctx = {
    'Expected Monthly Volume': row.expected_monthly_volume_crates,
    'Bi-weekly Volume': row.biweekly_volume_crates,
    'Last Order Quantity': row.last_order_quantity,
    'Average Order Frequency': row.avg_order_frequency_days,
    'Number of Orders': row.order_count,
    'Actual Monthly Consumption': row.actual_monthly_consumption_crates,
    'Stock at Warehouse': row.warehouse_stock_crates,
    'Account Age': row.account_age_days,
  };
  (customCols || []).forEach((c) => {
    if (c.type === 'number') ctx[c.name] = row.custom_values?.[c.id];
  });
  return ctx;
};

const FN = {
  SUM: (...a) => a.reduce((x, y) => x + (Number(y) || 0), 0),
  AVERAGE: (...a) => (a.length ? a.reduce((x, y) => x + (Number(y) || 0), 0) / a.length : 0),
  AVG: (...a) => FN.AVERAGE(...a),
  MIN: (...a) => Math.min(...a.map((v) => Number(v) || 0)),
  MAX: (...a) => Math.max(...a.map((v) => Number(v) || 0)),
  ROUND: (x, n = 0) => Math.round(Number(x) * 10 ** n) / 10 ** n,
  ABS: (x) => Math.abs(Number(x)),
  IF: (c, t, f = 0) => (c ? t : f),
};
const FN_NAMES = 'SUM|AVERAGE|AVG|MIN|MAX|ROUND|ABS|IF';

const evalFormula = (formula, ctx) => {
  if (!formula) return null;
  let expr = String(formula).trim();
  if (expr.startsWith('=')) expr = expr.slice(1); // Google-Sheets style "=" prefix
  Object.keys(ctx).sort((a, b) => b.length - a.length).forEach((name) => {
    const v = ctx[name];
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // case-insensitive column reference; blank cells count as 0 (like Sheets)
    expr = expr.replace(new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'gi'), v == null || v === '' ? '0' : `(${Number(v)})`);
  });
  expr = expr
    .replace(new RegExp(`\\b(${FN_NAMES})\\s*\\(`, 'gi'), (m, f) => `${f.toUpperCase()}(`)
    .replace(/\^/g, '**')
    .replace(/<>/g, '!=')
    .replace(/(?<![<>=!*])=(?!=)/g, '==')
    .replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
  const stripped = expr.replace(new RegExp(`\\b(${FN_NAMES})\\b`, 'g'), '');
  if (!/^[0-9+\-*/()., <>=!\s]*$/.test(stripped)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(...Object.keys(FN), `"use strict"; return (${expr});`)(...Object.values(FN));
    const num = Number(result);
    return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
  } catch { return null; }
};

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
// order-recency tiers: ≤1wk dark green · ≤2wk light green · ≤3wk amber · older red
const orderRecency = (row) => {
  if (!row.latest_delivery_date) return null;
  const days = (Date.now() - new Date(row.latest_delivery_date).getTime()) / 86400000;
  if (days <= 7) return { pill: 'bg-emerald-50 text-emerald-800 border border-emerald-200/60', dot: 'bg-emerald-600' };
  if (days <= 14) return { pill: 'bg-emerald-50/70 text-emerald-700 border border-emerald-200/40', dot: 'bg-emerald-400' };
  if (days <= 21) return { pill: 'bg-amber-50 text-amber-800 border border-amber-200/60', dot: 'bg-amber-500' };
  return { pill: 'bg-red-50 text-red-700 border border-red-200/60', dot: 'bg-red-500' };
};
const RecencyPill = ({ recency, colKey, children }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${recency.pill}`}
    data-testid={`vg-recency-${colKey}`}
  >
    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${recency.dot}`} />
    {children}
  </span>
);
const RECENCY_COLS = ['latest_delivery_date', 'last_order_quantity'];
const TH = 'px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-200 whitespace-nowrap select-none';
const numericCol = (c) => c.type === 'number' || c.key === 'recent_delivery_crates' || (c.custom && (c.custom.type === 'number' || c.custom.type === 'formula'));

export default function AccountVolumeGrid() {
  const [rows, setRows] = useState([]);
  const [customCols, setCustomCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sort, setSort] = useState({ key: 'account_name', dir: 'asc' });
  const [hidden, setHidden] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || DEFAULT_HIDDEN; } catch { return DEFAULT_HIDDEN; }
  });
  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_WIDTHS)) || {}; } catch { return {}; }
  });
  const [colOrder, setColOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_ORDER)) || []; } catch { return []; }
  });
  const dragColRef = useRef(null);
  const [editCell, setEditCell] = useState(null); // {rowId, colKey|colId, value}
  const [showAddCol, setShowAddCol] = useState(false);
  const [newCol, setNewCol] = useState({ name: '', type: 'text', formula: '', includeInTotal: false });
  const [truckCapacity, setTruckCapacity] = useState('');
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const { territories, getStateNamesByTerritoryName, getCityNamesByStateName } = useMasterLocations();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (territoryFilter !== 'all') params.set('territory', territoryFilter);
      if (stateFilter !== 'all') params.set('state', stateFilter);
      if (cityFilter !== 'all') params.set('city', cityFilter);
      const r = await fetch(`${API_URL}/api/account-volume-grid?${params}`, { headers: authHeaders() });
      const d = await r.json();
      setRows(d.rows || []);
      setCustomCols(d.custom_columns || []);
    } catch { toast.error('Failed to load volume grid'); }
    setLoading(false);
  }, [search, territoryFilter, stateFilter, cityFilter]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(hidden)); }, [hidden]);
  useEffect(() => { localStorage.setItem(LS_WIDTHS, JSON.stringify(colWidths)); }, [colWidths]);
  useEffect(() => { localStorage.setItem(LS_ORDER, JSON.stringify(colOrder)); }, [colOrder]);

  // Freeze panes: measure header row height so the summary row can stick just below it
  const headerRowRef = useRef(null);
  const [headerH, setHeaderH] = useState(41);
  useEffect(() => {
    if (!headerRowRef.current) return;
    const ro = new ResizeObserver(() => {
      if (headerRowRef.current) setHeaderH(headerRowRef.current.getBoundingClientRect().height);
    });
    ro.observe(headerRowRef.current);
    return () => ro.disconnect();
  });

  // Column resize (drag the handle at the right edge of a header)
  const startResize = (e, colKey) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const th = e.target.closest('th');
    const startW = th ? th.offsetWidth : 150;
    const onMove = (ev) => {
      const w = Math.max(70, startW + (ev.clientX - startX));
      setColWidths((p) => ({ ...p, [colKey]: w }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const addRow = async () => {
    try {
      const r = await fetch(`${API_URL}/api/account-volume-grid/manual-rows`, { method: 'POST', headers: authHeaders() });
      if (!r.ok) throw new Error((await r.json()).detail || 'Failed to add row');
      const d = await r.json();
      await load();
      setEditCell({ rowId: d.id, col: { key: 'account_name', type: 'text' }, value: '' });
      toast.success('Row added — type a name and press Enter');
    } catch (e) { toast.error(e.message); }
  };

  const deleteManualRow = async (row) => {
    if (!window.confirm(`Delete row "${row.account_name || 'Untitled'}"?`)) return;
    try {
      await fetch(`${API_URL}/api/account-volume-grid/manual-rows/${row.account_id}`, { method: 'DELETE', headers: authHeaders() });
      load();
    } catch { toast.error('Delete failed'); }
  };

  const allColumns = useMemo(() => {
    const base = [
      ...BASE_COLUMNS,
      ...customCols.map((c) => ({ key: `custom_${c.id}`, label: c.name, type: c.type, custom: c })),
    ];
    if (!colOrder.length) return base;
    const known = colOrder.filter((k) => base.some((c) => c.key === k));
    const ordered = [...known, ...base.map((c) => c.key).filter((k) => !known.includes(k))];
    const byKey = Object.fromEntries(base.map((c) => [c.key, c]));
    const cols = ordered.map((k) => byKey[k]);
    // Account Name stays frozen first
    return [cols.find((c) => c.key === 'account_name'), ...cols.filter((c) => c.key !== 'account_name')];
  }, [customCols, colOrder]);
  const visibleColumns = allColumns.filter((c) => !hidden.includes(c.key));

  const moveColumn = (fromKey, toKey) => {
    if (fromKey === toKey || fromKey === 'account_name' || toKey === 'account_name') return;
    const keys = allColumns.map((c) => c.key);
    const from = keys.indexOf(fromKey);
    keys.splice(from, 1);
    keys.splice(keys.indexOf(toKey) + (from <= keys.indexOf(toKey) ? 1 : 0), 0, fromKey);
    setColOrder(keys);
  };

  const cellValue = useCallback((row, col) => {
    if (col.custom) {
      if (col.custom.type === 'formula') return evalFormula(col.custom.formula, formulaContext(row, customCols));
      return row.custom_values?.[col.custom.id];
    }
    return row[col.key];
  }, [customCols]);

  const sortedRows = useMemo(() => {
    const col = allColumns.find((c) => c.key === sort.key) || BASE_COLUMNS[0];
    const base = attentionOnly
      ? rows.filter((r) => r.low_warehouse_stock || (r.account_age_days != null && r.account_age_days <= 7))
      : rows;
    const arr = [...base].sort((a, b) => {
      const va = cellValue(a, col); const vb = cellValue(b, col);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort, allColumns, cellValue, attentionOnly]);

  const toggleSort = (key) => setSort((p) => ({ key, dir: p.key === key && p.dir === 'asc' ? 'desc' : 'asc' }));

  // Summary totals: only Bi-weekly, Expected Monthly and custom columns opted into totals
  const summaryFor = useCallback((col) => {
    if (col.key === 'account_name') return `TOTAL — ${sortedRows.length} rows`;
    const inTotal = col.key === 'biweekly_volume_crates' || col.key === 'expected_monthly_volume_crates' || col.custom?.include_in_total;
    if (!inTotal) return '';
    const vals = sortedRows.map((r) => cellValue(r, col)).filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (vals.length === 0) return '';
    const sum = vals.reduce((a, b) => a + b, 0);
    return Math.round(sum * 100) / 100;
  }, [sortedRows, cellValue]);

  const toggleColumnTotal = async (col, value) => {
    try {
      const r = await fetch(`${API_URL}/api/account-volume-grid/columns/${col.custom.id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ include_in_total: value }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Update failed');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const saveCell = async () => {
    if (!editCell) return;
    const { rowId, col, value } = editCell;
    const row = rows.find((r) => r.account_id === rowId);
    const isManual = row?.is_manual || col.key === 'account_name';
    const body = {};
    if (col.key === 'account_name') {
      body.account_name = value;
    } else if (col.key === 'expected_monthly_volume_crates') {
      if (value === '') body.clear_expected = true;
      else body.expected_monthly_volume_crates = parseFloat(value);
    } else if (col.custom) {
      body.custom_values = { [col.custom.id]: col.custom.type === 'number' ? (value === '' ? null : parseFloat(value)) : value };
    }
    const url = isManual
      ? `${API_URL}/api/account-volume-grid/manual-rows/${rowId}`
      : `${API_URL}/api/account-volume-grid/rows/${rowId}`;
    try {
      const r = await fetch(url, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json()).detail || 'Save failed');
      setEditCell(null);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const addColumn = async () => {
    try {
      const r = await fetch(`${API_URL}/api/account-volume-grid/columns`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ name: newCol.name, type: newCol.type, formula: newCol.type === 'formula' ? newCol.formula : null, include_in_total: !!newCol.includeInTotal }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Failed to add column');
      toast.success(`Column "${newCol.name}" added`);
      setShowAddCol(false);
      setNewCol({ name: '', type: 'text', formula: '', includeInTotal: false });
      load();
    } catch (e) { toast.error(e.message); }
  };

  const deleteColumn = async (col) => {
    if (!window.confirm(`Delete column "${col.custom.name}"?`)) return;
    try {
      await fetch(`${API_URL}/api/account-volume-grid/columns/${col.custom.id}`, { method: 'DELETE', headers: authHeaders() });
      setHidden((p) => p.filter((k) => k !== col.key));
      load();
    } catch { toast.error('Delete failed'); }
  };

  const generatePlan = async () => {
    const cap = parseFloat(truckCapacity);
    if (!cap || cap <= 0) { toast.error('Enter truck capacity in crates'); return; }
    setPlanLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/account-volume-grid/consignment-plan`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          truck_capacity_crates: cap,
          territory: territoryFilter !== 'all' ? territoryFilter : null,
          state: stateFilter !== 'all' ? stateFilter : null,
          city: cityFilter !== 'all' ? cityFilter : null,
          search: search.trim() || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Planning failed');
      setPlan(await r.json());
    } catch (e) { toast.error(e.message); }
    setPlanLoading(false);
  };

  const exportPlan = async () => {
    if (!plan) return;
    try {
      const r = await fetch(`${API_URL}/api/account-volume-grid/consignment-plan/export`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ plan }),
      });
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Consignment Plan - ${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Consignment plan downloaded');
    } catch (e) { toast.error(e.message); }
  };

  const availableStates = getStateNamesByTerritoryName ? getStateNamesByTerritoryName(territoryFilter === 'all' ? null : territoryFilter) : [];
  const availableCities = getCityNamesByStateName ? getCityNamesByStateName(stateFilter === 'all' ? null : stateFilter) : [];

  const renderCell = (row, col) => {
    const isEditing = editCell && editCell.rowId === row.account_id && editCell.col.key === col.key;
    const editable = col.editable || (col.custom && col.custom.type !== 'formula');
    const raw = cellValue(row, col);

    if (isEditing) {
      return (
        <Input
          autoFocus
          type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
          className="h-8 w-32 rounded-sm text-sm px-2"
          value={editCell.value}
          onChange={(e) => setEditCell((p) => ({ ...p, value: e.target.value }))}
          onBlur={saveCell}
          onKeyDown={(e) => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditCell(null); }}
          data-testid="vg-cell-input"
        />
      );
    }

    let display;
    if (col.key === 'actual_monthly_consumption_crates' && raw == null && row.consumption_available_in_days != null) {
      return (
        <span className="inline-flex items-center gap-1 text-slate-500 italic whitespace-nowrap" data-testid={`vg-amc-pending-${row.account_code || row.account_id}`}>
          Available in {row.consumption_available_in_days} day{row.consumption_available_in_days === 1 ? '' : 's'}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-0.5 rounded-full text-slate-400 hover:text-[#002FA7] hover:bg-[#002FA7]/10"
                title="Actual Monthly Consumption is calculated using the customer's last 4 weeks of delivery history. This data will be available once 30 days have elapsed from the customer's first delivery."
                data-testid={`vg-amc-info-${row.account_code || row.account_id}`}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 text-xs leading-relaxed" onClick={(e) => e.stopPropagation()}>
              Actual Monthly Consumption is calculated using the customer's last 4 weeks of delivery
              history. This data will be available once 30 days have elapsed from the customer's
              first delivery.
            </PopoverContent>
          </Popover>
        </span>
      );
    }
    if (col.type === 'list') {
      const arr = Array.isArray(raw) ? raw : [];
      const listRecency = (col.key === 'recent_delivery_dates' || col.key === 'recent_delivery_crates') ? orderRecency(row) : null;
      // pill has px-2 (8px) + dot (6px) + gap (6px): pad plain lines so values align
      const alignPad = listRecency ? (numericCol(col) ? 'pr-2' : 'pl-5') : '';
      return arr.length === 0 ? <span className={`tabular-nums ${numericCol(col) ? 'pr-2' : 'pl-5'} block`}>—</span> : (
        <span className="tabular-nums leading-tight">
          {arr.map((v, i) => {
            const text = typeof v === 'number' ? v.toLocaleString('en-IN') : v;
            return (
              <span key={i} className={`block whitespace-nowrap ${i > 0 ? `text-slate-500 mt-1 ${alignPad}` : ''}`}>
                {i === 0 && listRecency ? <RecencyPill recency={listRecency} colKey={col.key}>{text}</RecencyPill> : text}
              </span>
            );
          })}
        </span>
      );
    }
    if (col.type === 'date') display = fmt(raw);
    else if (col.key === 'avg_order_frequency_days') display = raw != null ? `${raw} days` : '—';
    else if (raw == null || raw === '') display = '—';
    else display = typeof raw === 'number' ? raw.toLocaleString('en-IN') : String(raw);

    if (!editable) {
      const recency = RECENCY_COLS.includes(col.key) ? orderRecency(row) : null;
      if (recency) {
        return <RecencyPill recency={recency} colKey={col.key}><span className="tabular-nums">{display}</span></RecencyPill>;
      }
      if (RECENCY_COLS.includes(col.key)) {
        return <span className={`tabular-nums block ${numericCol(col) ? 'pr-2' : 'pl-5'}`}>{display}</span>;
      }
      return <span className={col.custom?.type === 'formula' ? 'text-indigo-700 font-medium tabular-nums' : 'tabular-nums'}>{display}</span>;
    }
    return (
      <button
        className={`w-full px-1.5 py-0.5 -mx-1.5 rounded-sm hover:bg-[#002FA7]/5 hover:ring-1 hover:ring-[#002FA7]/30 tabular-nums cursor-text min-h-[24px] ${numericCol(col) ? 'text-right' : 'text-left'}`}
        onClick={() => setEditCell({ rowId: row.account_id, col, value: raw ?? '' })}
        data-testid={`vg-edit-${col.key}-${row.account_code || row.account_id}`}
        title="Click to edit"
      >
        {display === '—' ? <span className="text-slate-300">Click to set</span> : display}
      </button>
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1500px] mx-auto space-y-5" data-testid="volume-grid-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Table2 className="h-6 w-6 text-[#002FA7]" /> Account Volume Tracking
          </h1>
          <p className="text-slate-500 text-sm mt-1">Spreadsheet-style view of account volumes — click a highlighted cell to edit. Delivery data updates automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-sm" onClick={async () => {
            try {
              const params = new URLSearchParams();
              if (search.trim()) params.set('search', search.trim());
              if (territoryFilter !== 'all') params.set('territory', territoryFilter);
              if (stateFilter !== 'all') params.set('state', stateFilter);
              if (cityFilter !== 'all') params.set('city', cityFilter);
              const r = await fetch(`${API_URL}/api/account-volume-grid/export/excel?${params}`, { headers: authHeaders() });
              if (!r.ok) throw new Error('Export failed');
              const blob = await r.blob();
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `Account Volume Tracking - ${new Date().toISOString().slice(0, 10)}.xlsx`;
              a.click();
              URL.revokeObjectURL(a.href);
              toast.success('Excel downloaded');
            } catch (e) { toast.error(e.message); }
          }} data-testid="vg-download-excel-btn">
            <Download className="h-4 w-4 mr-1.5" /> Excel
          </Button>
          <Button variant="outline" className="rounded-sm" onClick={addRow} data-testid="vg-add-row-btn">
            <Plus className="h-4 w-4 mr-1.5" /> Add Row
          </Button>
          {/* Columns visibility */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-sm" data-testid="vg-columns-btn"><Columns3 className="h-4 w-4 mr-1.5" /> Columns</Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-96 overflow-y-auto" align="end">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Show / hide columns</p>
              <div className="space-y-2">
                {allColumns.map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={!hidden.includes(c.key)}
                        onCheckedChange={(v) => setHidden((p) => (v ? p.filter((k) => k !== c.key) : [...p, c.key]))}
                        data-testid={`vg-col-toggle-${c.key}`}
                      />
                      {c.label}
                      {c.custom?.type === 'formula' && <Sigma className="h-3 w-3 text-indigo-500" />}
                    </label>
                    {c.custom && (
                      <span className="flex items-center gap-2 shrink-0">
                        {(c.custom.type === 'number' || c.custom.type === 'formula') && (
                          <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer" title="Include in totals row">
                            <Checkbox
                              checked={!!c.custom.include_in_total}
                              onCheckedChange={(v) => toggleColumnTotal(c, !!v)}
                              data-testid={`vg-col-total-toggle-${c.key}`}
                            />
                            Σ
                          </label>
                        )}
                        <button className="text-red-400 hover:text-red-600" onClick={() => deleteColumn(c)} data-testid={`vg-col-delete-${c.key}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button className="rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" onClick={() => setShowAddCol(true)} data-testid="vg-add-column-btn">
            <Plus className="h-4 w-4 mr-1.5" /> Add Column
          </Button>
        </div>
      </div>

      {/* Filters — same State/Territory/Location model as Leads */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
          <Input className="h-9 pl-8 w-60 rounded-sm" placeholder="Search accounts…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="vg-search-input" />
        </div>
        <Select value={territoryFilter} onValueChange={(v) => { setTerritoryFilter(v); setStateFilter('all'); setCityFilter('all'); }}>
          <SelectTrigger className="h-9 w-44 rounded-sm" data-testid="vg-territory-filter"><SelectValue placeholder="Territory" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Territories</SelectItem>
            {territories.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setCityFilter('all'); }}>
          <SelectTrigger className="h-9 w-40 rounded-sm" data-testid="vg-state-filter"><SelectValue placeholder="State" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {availableStates.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="h-9 w-40 rounded-sm" data-testid="vg-city-filter"><SelectValue placeholder="Location" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Locations</SelectItem>
            {availableCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => setAttentionOnly((v) => !v)}
          className={`h-9 inline-flex items-center gap-1.5 rounded-sm border px-3 text-sm font-medium transition-colors ${attentionOnly
            ? 'bg-rose-600 border-rose-600 text-white hover:bg-rose-700'
            : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300 hover:text-rose-700'}`}
          title="Show only accounts needing action: low warehouse stock or on-boarded within the last week"
          data-testid="vg-attention-filter"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Needs attention
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${attentionOnly ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {rows.filter((r) => r.low_warehouse_stock || (r.account_age_days != null && r.account_age_days <= 7)).length}
          </span>
        </button>
        <Badge variant="outline" className="ml-auto text-xs text-slate-500">{sortedRows.length} accounts</Badge>
      </div>

      {/* Recency legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500" data-testid="vg-recency-legend">
        <span className="font-medium text-slate-600">Last order:</span>
        {[
          { dot: 'bg-emerald-600', pill: 'bg-emerald-50 text-emerald-800 border border-emerald-200/60', label: 'within 1 week' },
          { dot: 'bg-emerald-400', pill: 'bg-emerald-50/70 text-emerald-700 border border-emerald-200/40', label: 'within 2 weeks' },
          { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-800 border border-amber-200/60', label: 'within 3 weeks' },
          { dot: 'bg-red-500', pill: 'bg-red-50 text-red-700 border border-red-200/60', label: '4+ weeks ago' },
        ].map((t) => (
          <span key={t.label} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${t.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
            {t.label}
          </span>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-auto max-h-[calc(100vh-260px)]" data-testid="vg-scroll-container">
          <table className="w-full text-xs" style={{ tableLayout: 'fixed' }} data-testid="vg-table">
            <colgroup>
              {visibleColumns.map((c) => (
                <col key={c.key} style={{ width: colWidths[c.key] ? `${colWidths[c.key]}px` : (c.key === 'account_name' ? '220px' : '150px') }} />
              ))}
            </colgroup>
            <thead>
              <tr ref={headerRowRef} className="bg-[#0b192c]">
                {visibleColumns.map((c) => (
                  <th key={c.key}
                    className={`${TH} ${numericCol(c) ? 'text-right' : 'text-left'} cursor-pointer transition-colors hover:text-white sticky top-0 bg-[#0b192c] shadow-[inset_0_-1px_0_#1e293b] ${c.key === 'account_name' ? 'left-0 z-30 shadow-[inset_-1px_0_0_#334155,inset_0_-1px_0_#1e293b]' : 'z-20'}`}
                    onClick={() => toggleSort(c.key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (dragColRef.current) moveColumn(dragColRef.current, c.key); dragColRef.current = null; }}
                    data-testid={`vg-th-${c.key}`}>
                    <span
                      draggable={c.key !== 'account_name'}
                      onDragStart={(e) => { dragColRef.current = c.key; e.dataTransfer.effectAllowed = 'move'; }}
                      className={`inline-flex items-center gap-1 whitespace-normal break-words leading-tight ${c.key !== 'account_name' ? 'cursor-move' : ''}`}>
                      {c.label}
                      {c.custom?.type === 'formula' && <Sigma className="h-3 w-3 text-indigo-300 shrink-0" />}
                      {sort.key === c.key
                        ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0 text-white" /> : <ArrowDown className="h-3 w-3 shrink-0 text-white" />)
                        : <ArrowUpDown className="h-3 w-3 opacity-40 shrink-0" />}
                    </span>
                    <span
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-white/30 active:bg-[#002FA7]"
                      onMouseDown={(e) => startResize(e, c.key)}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`vg-resize-${c.key}`}
                    />
                  </th>
                ))}
              </tr>
              {/* Summary row — frozen below the header */}
              <tr className="border-b-2 border-[#002FA7]/30" data-testid="vg-summary-row">
                {visibleColumns.map((c) => (
                  <td key={c.key} style={{ top: headerH }}
                    className={`px-3 py-2 text-xs font-bold text-[#002FA7] tabular-nums tracking-tight whitespace-normal break-words sticky shadow-[inset_0_-2px_0_rgba(0,47,167,0.3)] ${numericCol(c) ? 'text-right' : 'text-left'} ${c.key === 'account_name' ? 'left-0 z-30 bg-[#DFE7F7] shadow-[inset_-1px_0_0_#CBD5E1,inset_0_-2px_0_rgba(0,47,167,0.3)]' : 'z-20 bg-[#EAF0FC]'}`}
                    data-testid={`vg-summary-${c.key}`}>
                    {typeof summaryFor(c) === 'number' ? summaryFor(c).toLocaleString('en-IN') : summaryFor(c)}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 && (
                <tr><td colSpan={visibleColumns.length} className="px-4 py-12 text-center text-slate-500" data-testid="vg-empty">No accounts match the current filters.</td></tr>
              )}
              {sortedRows.map((row, ri) => (
                <tr key={row.account_id} className={`border-b border-slate-100 transition-colors group ${row.is_manual ? 'bg-[#FFFDF5]' : ri % 2 ? 'bg-[#F8FAFC]' : 'bg-white'} hover:bg-[#EDF2FA]`} data-testid={`vg-row-${row.account_code || row.account_id}`}>
                  {visibleColumns.map((c) => (
                    <td key={c.key} className={`px-3 py-2.5 align-middle whitespace-normal break-words tabular-nums ${numericCol(c) ? 'text-right' : 'text-left'} ${c.key === 'warehouse_stock_crates' && row.low_warehouse_stock ? 'bg-rose-50 text-rose-700 font-semibold shadow-[inset_2px_0_0_#f43f5e]' : ''} ${c.key === 'account_name' ? `font-semibold text-slate-900 sticky left-0 z-10 ${row.account_age_days != null && row.account_age_days <= 7 ? 'bg-[#EAF1FF] shadow-[inset_2px_0_0_#002FA7,inset_-1px_0_0_#E2E8F0]' : `${row.is_manual ? 'bg-[#FFFCF0]' : ri % 2 ? 'bg-[#F6F8FB]' : 'bg-white'} shadow-[inset_-1px_0_0_#E2E8F0]`} group-hover:bg-[#EDF2FA]` : 'text-slate-700'}`}
                      data-testid={c.key === 'warehouse_stock_crates' ? `vg-whstock-${row.account_code || row.account_id}${row.low_warehouse_stock ? '-low' : ''}` : undefined}>
                      {c.key === 'account_name' ? (
                        row.is_manual ? (
                          <div className="flex items-start justify-between gap-1">
                            {editCell && editCell.rowId === row.account_id && editCell.col.key === 'account_name' ? (
                              <Input autoFocus className="h-8 rounded-sm text-sm px-2" value={editCell.value}
                                onChange={(e) => setEditCell((p) => ({ ...p, value: e.target.value }))}
                                onBlur={saveCell}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveCell(); if (e.key === 'Escape') setEditCell(null); }}
                                data-testid="vg-cell-input" />
                            ) : (
                              <button className="text-left px-1.5 py-0.5 -mx-1.5 rounded-sm hover:bg-[#002FA7]/5 hover:ring-1 hover:ring-[#002FA7]/30 cursor-text break-words min-h-[24px] flex-1"
                                onClick={() => setEditCell({ rowId: row.account_id, col: { key: 'account_name', type: 'text' }, value: row.account_name || '' })}
                                data-testid={`vg-edit-account_name-${row.account_id}`}>
                                {row.account_name || <span className="text-slate-300">Type a name…</span>}
                              </button>
                            )}
                            <button className="text-red-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0"
                              onClick={() => deleteManualRow(row)} data-testid={`vg-delete-row-${row.account_id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1.5 flex-wrap">
                              {row.account_name}
                              {row.account_age_days != null && row.account_age_days <= 7 && (
                                <span
                                  className="inline-flex items-center rounded-full bg-[#002FA7] text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 leading-none"
                                  title="On-boarded within the last week — plan stock for this new account"
                                  data-testid={`vg-new-account-${row.account_code || row.account_id}`}
                                >
                                  New
                                </span>
                              )}
                            </span>
                            <p className="text-[11px] text-slate-400 font-normal">{[row.city, row.state].filter(Boolean).join(', ')}</p>
                          </div>
                        )
                      ) : renderCell(row, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Consignment Planner */}
      <div className="bg-white border border-slate-200 rounded-md shadow-sm" data-testid="vg-planner-section">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2 mr-auto">
            <Truck className="h-4 w-4 text-[#002FA7]" />
            <h2 className="text-base font-bold text-slate-900">Consignment Planner</h2>
            <span className="text-xs text-slate-500 hidden md:inline">Plans the next 3 truckloads from ordering patterns — follows the filters above</span>
          </div>
          <div className="relative">
            <Truck className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
            <Input type="number" min="1" className="h-9 pl-8 w-52 rounded-sm" placeholder="Truck capacity (crates)"
              value={truckCapacity} onChange={(e) => setTruckCapacity(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') generatePlan(); }}
              data-testid="vg-planner-capacity" />
          </div>
          <Button className="rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" onClick={generatePlan} disabled={planLoading} data-testid="vg-planner-generate">
            {planLoading && <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />}
            {planLoading ? 'Planning…' : 'Generate Plan'}
          </Button>
          {plan && (
            <Button variant="outline" className="rounded-sm" onClick={exportPlan} data-testid="vg-planner-export">
              <Download className="h-4 w-4 mr-1.5" /> Excel
            </Button>
          )}
        </div>

        {plan && (
          <div className="p-4 space-y-4" data-testid="vg-planner-result">
            {plan.warehouse_stock_crates != null && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600" data-testid="vg-planner-stock">
                <span>Warehouse stock: <span className="font-bold text-slate-900 tabular-nums">{plan.warehouse_stock_crates.toLocaleString('en-IN')}</span> crates</span>
                <span>After this plan: <span className="font-bold text-slate-900 tabular-nums">{plan.stock_remaining_after_plan.toLocaleString('en-IN')}</span> crates</span>
                {plan.consignments.some((c) => c.stock_limited) && (
                  <Badge className="bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-100" data-testid="vg-planner-stock-warning">Plan limited by available stock</Badge>
                )}
              </div>
            )}
            {plan.ai_summary && (
              <div className="bg-[#002FA7]/5 border border-[#002FA7]/20 rounded-sm px-4 py-3 text-sm text-slate-700 leading-relaxed" data-testid="vg-planner-summary">
                <span className="font-semibold text-[#002FA7]">Planner Insight: </span>{plan.ai_summary}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              {plan.consignments.map((c) => (
                <div key={c.consignment} className="border border-slate-200 rounded-sm px-3 py-2" data-testid={`vg-planner-consignment-${c.consignment}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Consignment {c.consignment}</p>
                    <p className="text-xs font-semibold text-[#002FA7]" data-testid={`vg-planner-date-${c.consignment}`}>{fmt(c.suggested_date)}</p>
                  </div>
                  <p className="text-lg font-bold text-slate-900 tabular-nums">{c.total_crates.toLocaleString('en-IN')} <span className="text-xs font-normal text-slate-500">/ {c.capacity_crates.toLocaleString('en-IN')} crates</span></p>
                  <p className={`text-xs font-medium ${c.utilization_percent >= 90 ? 'text-emerald-700' : 'text-amber-700'}`}>{c.utilization_percent}% utilized · {c.accounts_served} accounts</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="vg-planner-table">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {[['Account', 'text-left'], ['Monthly (Crates)', 'text-right'], ['Frequency (Days)', 'text-right'], ['Last Order', 'text-left'], ['Expected Next Order', 'text-left'], ['Typical Order (Crates)', 'text-right']].map(([h, al]) => (
                      <th key={h} className={`${TH} ${al}`}>{h}</th>
                    ))}
                    {plan.consignments.map((c) => (
                      <th key={c.consignment} className={`${TH} text-right`}>
                        Consignment {c.consignment}
                        <span className="block text-[10px] font-medium normal-case text-[#002FA7]">{fmt(c.suggested_date)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r, ri) => (
                    <tr key={r.account_name} className={`border-b border-slate-100 hover:bg-[#EFF3FB] transition-colors ${ri % 2 ? 'bg-slate-50/60' : 'bg-white'}`} data-testid={`vg-planner-row-${r.account_name}`}>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {r.account_name}
                        {plan.ai_notes?.[r.account_name] && (
                          <p className="text-[11px] text-slate-400 font-normal max-w-[260px]">{plan.ai_notes[r.account_name]}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-700 text-right">{r.monthly_consumption_crates?.toLocaleString('en-IN') ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700 text-right">{r.order_frequency_days ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700">{r.last_order_date ? fmt(r.last_order_date) : '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700">{fmt(r.expected_next_order_date)}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700 text-right">{r.typical_order_crates?.toLocaleString('en-IN')}</td>
                      {[r.consignment_1, r.consignment_2, r.consignment_3].map((v, i) => (
                        <td key={i} className={`px-3 py-2 tabular-nums font-semibold text-right ${v > 0 ? 'text-[#002FA7]' : 'text-slate-300'}`}>{v > 0 ? v.toLocaleString('en-IN') : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add Column dialog */}
      <Dialog open={showAddCol} onOpenChange={setShowAddCol}>
        <DialogContent className="sm:max-w-md" data-testid="vg-add-column-dialog">
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
            <DialogDescription>Text, number and date columns are editable per account. Formula columns compute from other columns.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Column Name</Label>
              <Input className="mt-1 h-10 rounded-sm" placeholder="e.g. Annual Volume" value={newCol.name}
                onChange={(e) => setNewCol((p) => ({ ...p, name: e.target.value }))} data-testid="vg-new-col-name" />
            </div>
            <div>
              <Label>Column Type</Label>
              <select className="mt-1 h-10 w-full rounded-sm border border-slate-300 bg-white px-3 text-sm" value={newCol.type}
                onChange={(e) => setNewCol((p) => ({ ...p, type: e.target.value }))} data-testid="vg-new-col-type">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="formula">Formula</option>
              </select>
            </div>
            {newCol.type === 'formula' && (
              <div>
                <Label>Formula</Label>
                <Input className="mt-1 h-10 rounded-sm font-mono text-sm" placeholder="e.g. =Expected Monthly Volume * 12" value={newCol.formula}
                  onChange={(e) => setNewCol((p) => ({ ...p, formula: e.target.value }))} data-testid="vg-new-col-formula" />
                {newCol.formula.trim() && (() => {
                  const sample = sortedRows.find((r) => r.expected_monthly_volume_crates != null) || sortedRows[0];
                  if (!sample) return null;
                  const res = evalFormula(newCol.formula, formulaContext(sample, customCols));
                  return res != null ? (
                    <p className="text-xs mt-1.5 font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-sm px-2 py-1.5" data-testid="vg-formula-preview">
                      Preview — {sample.account_name}: <span className="font-mono font-bold">{res.toLocaleString('en-IN')}</span>
                    </p>
                  ) : (
                    <p className="text-xs mt-1.5 font-medium text-red-600 bg-red-50 border border-red-200 rounded-sm px-2 py-1.5" data-testid="vg-formula-preview">
                      Can't compute yet — check column names and syntax
                    </p>
                  );
                })()}
                <p className="text-xs text-slate-500 mt-1.5">
                  Google-Sheets style: optional leading =, + − * / ^ %, comparisons, and functions SUM, AVERAGE, MIN, MAX, ROUND, ABS, IF.
                  Blank cells count as 0. e.g. <span className="font-mono">=IF(Expected Monthly Volume &gt; 100, Expected Monthly Volume * 12, 0)</span>.
                  Columns: Expected Monthly Volume, Bi-weekly Volume,
                  Last Order Quantity, Average Order Frequency, Number of Orders{customCols.filter((c) => c.type === 'number').map((c) => `, ${c.name}`).join('')}
                </p>
              </div>
            )}
            {(newCol.type === 'number' || newCol.type === 'formula') && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={!!newCol.includeInTotal}
                  onCheckedChange={(v) => setNewCol((p) => ({ ...p, includeInTotal: !!v }))}
                  data-testid="vg-new-col-include-total"
                />
                Include in totals row
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="rounded-sm" onClick={() => setShowAddCol(false)}>Cancel</Button>
              <Button className="rounded-sm bg-[#002FA7] hover:bg-[#00227A] text-white" onClick={addColumn} disabled={!newCol.name.trim()} data-testid="vg-new-col-save">Add Column</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
