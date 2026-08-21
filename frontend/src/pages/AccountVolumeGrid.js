import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table2, RefreshCw, Columns3, Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Sigma, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useMasterLocations } from '../hooks/useMasterLocations';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });
const LS_KEY = 'volume_grid_hidden_columns';
const LS_WIDTHS = 'volume_grid_col_widths';

const BASE_COLUMNS = [
  { key: 'account_name', label: 'Account Name', type: 'text' },
  { key: 'contract_signed_date', label: 'Contract Signed Date', type: 'date' },
  { key: 'avg_order_frequency_days', label: 'Average Order Frequency', type: 'number' },
  { key: 'first_delivery_date', label: 'First Delivery Date', type: 'date' },
  { key: 'latest_delivery_date', label: 'Latest Delivery Date', type: 'date' },
  { key: 'last_order_quantity', label: 'Last Order Quantity', type: 'number' },
  { key: 'biweekly_volume_crates', label: 'Bi-weekly Volume (Crates)', type: 'number' },
  { key: 'expected_monthly_volume_crates', label: 'Expected Monthly Volume (Crates)', type: 'number', editable: true },
];

// Names usable inside formulas → row value resolver
const formulaContext = (row, customCols) => {
  const ctx = {
    'Expected Monthly Volume': row.expected_monthly_volume_crates,
    'Bi-weekly Volume': row.biweekly_volume_crates,
    'Last Order Quantity': row.last_order_quantity,
    'Average Order Frequency': row.avg_order_frequency_days,
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
const TH = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap select-none';

export default function AccountVolumeGrid() {
  const [rows, setRows] = useState([]);
  const [customCols, setCustomCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [territoryFilter, setTerritoryFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'account_name', dir: 'asc' });
  const [hidden, setHidden] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; }
  });
  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_WIDTHS)) || {}; } catch { return {}; }
  });
  const [editCell, setEditCell] = useState(null); // {rowId, colKey|colId, value}
  const [showAddCol, setShowAddCol] = useState(false);
  const [newCol, setNewCol] = useState({ name: '', type: 'text', formula: '', includeInTotal: false });
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

  const allColumns = useMemo(() => ([
    ...BASE_COLUMNS,
    ...customCols.map((c) => ({ key: `custom_${c.id}`, label: c.name, type: c.type, custom: c })),
  ]), [customCols]);
  const visibleColumns = allColumns.filter((c) => !hidden.includes(c.key));

  const cellValue = useCallback((row, col) => {
    if (col.custom) {
      if (col.custom.type === 'formula') return evalFormula(col.custom.formula, formulaContext(row, customCols));
      return row.custom_values?.[col.custom.id];
    }
    return row[col.key];
  }, [customCols]);

  const sortedRows = useMemo(() => {
    const col = allColumns.find((c) => c.key === sort.key) || BASE_COLUMNS[0];
    const arr = [...rows].sort((a, b) => {
      const va = cellValue(a, col); const vb = cellValue(b, col);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort, allColumns, cellValue]);

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
    if (col.type === 'date') display = fmt(raw);
    else if (col.key === 'avg_order_frequency_days') display = raw != null ? `${raw} days` : '—';
    else if (raw == null || raw === '') display = '—';
    else display = typeof raw === 'number' ? raw.toLocaleString('en-IN') : String(raw);

    if (!editable) {
      return <span className={col.custom?.type === 'formula' ? 'text-indigo-700 font-medium tabular-nums' : 'tabular-nums'}>{display}</span>;
    }
    return (
      <button
        className="w-full text-left px-1.5 py-0.5 -mx-1.5 rounded-sm hover:bg-[#002FA7]/5 hover:ring-1 hover:ring-[#002FA7]/30 tabular-nums cursor-text min-h-[24px]"
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
        <Badge variant="outline" className="ml-auto text-xs text-slate-500">{sortedRows.length} accounts</Badge>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm overflow-auto max-h-[calc(100vh-260px)]" data-testid="vg-scroll-container">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }} data-testid="vg-table">
            <colgroup>
              {visibleColumns.map((c) => (
                <col key={c.key} style={{ width: colWidths[c.key] ? `${colWidths[c.key]}px` : (c.key === 'account_name' ? '220px' : '150px') }} />
              ))}
            </colgroup>
            <thead>
              <tr ref={headerRowRef} className="border-b border-slate-200 bg-slate-50">
                {visibleColumns.map((c) => (
                  <th key={c.key} className={`${TH} cursor-pointer hover:text-[#002FA7] sticky top-0 bg-slate-50 shadow-[inset_0_-1px_0_#e2e8f0] ${c.key === 'account_name' ? 'left-0 z-30' : 'z-20'}`} onClick={() => toggleSort(c.key)} data-testid={`vg-th-${c.key}`}>
                    <span className="inline-flex items-center gap-1 whitespace-normal break-words leading-tight">
                      {c.label}
                      {c.custom?.type === 'formula' && <Sigma className="h-3 w-3 text-indigo-500 shrink-0" />}
                      {sort.key === c.key
                        ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)
                        : <ArrowUpDown className="h-3 w-3 opacity-30 shrink-0" />}
                    </span>
                    <span
                      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[#002FA7]/40 active:bg-[#002FA7]"
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
                    className={`px-3 py-2 text-sm font-bold text-[#002FA7] tabular-nums whitespace-normal break-words sticky bg-[#E9EEF9] shadow-[inset_0_-2px_0_rgba(0,47,167,0.3)] ${c.key === 'account_name' ? 'left-0 z-30' : 'z-20'}`}
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
              {sortedRows.map((row) => (
                <tr key={row.account_id} className={`border-b border-slate-100 hover:bg-slate-50/70 transition-colors group ${row.is_manual ? 'bg-amber-50/30' : ''}`} data-testid={`vg-row-${row.account_code || row.account_id}`}>
                  {visibleColumns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 align-top whitespace-normal break-words ${c.key === 'account_name' ? `font-semibold text-slate-900 sticky left-0 z-10 ${row.is_manual ? 'bg-[#FDF6E7]' : 'bg-white'} group-hover:bg-slate-50 shadow-[inset_-1px_0_0_#e2e8f0]` : 'text-slate-700'}`}>
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
                            {row.account_name}
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
                <p className="text-xs text-slate-500 mt-1.5">
                  Google-Sheets style: optional leading =, + − * / ^ %, comparisons, and functions SUM, AVERAGE, MIN, MAX, ROUND, ABS, IF.
                  Blank cells count as 0. e.g. <span className="font-mono">=IF(Expected Monthly Volume &gt; 100, Expected Monthly Volume * 12, 0)</span>.
                  Columns: Expected Monthly Volume, Bi-weekly Volume,
                  Last Order Quantity, Average Order Frequency{customCols.filter((c) => c.type === 'number').map((c) => `, ${c.name}`).join('')}
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
