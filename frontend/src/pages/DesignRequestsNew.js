import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO, isValid, isPast, isToday } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import AppBreadcrumb from '../components/AppBreadcrumb';
import {
  Plus, Search, Sparkles, Clock, AlertTriangle, ChevronLeft, ChevronRight,
  LayoutList, Tag, User, Users, Calendar, Loader2, Truck, GitBranch, Download, Hourglass,
  ChevronsUpDown, ArrowUp, ArrowDown, LayoutGrid, Flame, Filter, Check, Inbox, SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import RequestKanbanNew from '../components/marketing/RequestKanbanNew';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const getInitials = (name) => {
  if (!name) return 'NA';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};
const formatDate = (s, fmt = 'MMM d, yyyy') => {
  if (!s) return null;
  try { const d = parseISO(s); return isValid(d) ? format(d, fmt) : null; } catch { return null; }
};
const isOverdueDate = (s) => { if (!s) return false; try { const d = parseISO(s); return isValid(d) && isPast(d) && !isToday(d); } catch { return false; } };
const ageDays = (s) => { try { return Math.max(0, Math.floor((Date.now() - parseISO(s).getTime()) / 86400000)); } catch { return null; } };
const ageShort = (s) => { const n = ageDays(s); if (n === null) return null; return n === 0 ? 'today' : `${n}d old`; };

const stateBadgeStyle = (hex) => {
  if (!hex) return { background: '#f4f4f5', color: '#3f3f46', borderColor: '#e4e4e7' };
  return { background: `${hex}14`, color: hex, borderColor: `${hex}44` };
};

// ── Compact status badge (dot + label) ───────────────────────────────────────
function StatusBadge({ label, color }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
      style={stateBadgeStyle(color)}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color || '#71717a' }} />
      {label || 'unknown'}
    </span>
  );
}

// ── Segmented queue switcher ─────────────────────────────────────────────────
function QueueSwitcher({ metrics, queue, onSwitch }) {
  return (
    <div className="flex w-full gap-0.5 rounded-lg bg-zinc-100 p-1 lg:w-auto" data-testid="queue-segment-control">
      {metrics.map((m) => {
        const active = queue === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onSwitch(m.key)}
            data-testid={`tab-${m.key}`}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-200 lg:flex-none ${
              active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <m.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">{m.label}</span>
            <span className="sm:hidden">{m.short}</span>
            <span className={`ml-0.5 rounded px-1.5 text-[10px] font-bold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200/70 text-zinc-500'}`}>{m.value}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Status filter (popover replaces 8 pills) ─────────────────────────────────
function StatusFilter({ states, stateCount, stateKey, onPick }) {
  const [open, setOpen] = useState(false);
  const active = states.find((s) => s.key === stateKey);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="status-filter-trigger"
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            active ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          {active
            ? <span className="h-2 w-2 rounded-full" style={{ background: active.color || '#10b981' }} />
            : <LayoutList className="h-4 w-4 text-zinc-400" strokeWidth={1.75} />}
          <span className="max-w-[140px] truncate">{active ? active.label : 'All statuses'}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-zinc-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5">
        <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Filter by status</p>
        <button
          type="button"
          onClick={() => { onPick(''); setOpen(false); }}
          className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${!stateKey ? 'bg-zinc-100 font-semibold text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50'}`}
          data-testid="status-option-all"
        >
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-zinc-300" /> All statuses</span>
          {!stateKey && <Check className="h-4 w-4 text-emerald-600" />}
        </button>
        <div className="my-1 h-px bg-zinc-100" />
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {states.map((s) => {
            const isActive = stateKey === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => { onPick(isActive ? '' : s.key); setOpen(false); }}
                data-testid={`state-chip-${s.key}`}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${isActive ? 'bg-emerald-50 font-semibold text-emerald-900' : 'text-zinc-700 hover:bg-zinc-50'}`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color || '#71717a' }} />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded bg-zinc-100 px-1.5 text-[10px] font-bold text-zinc-500">{stateCount(s.key)}</span>
                  {isActive && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Advanced filters (popover with the 3 dropdowns) ──────────────────────────
function AdvancedFilters({ types, depts, users, requestTypeId, deptId, requestedBy, onType, onDept, onBy, activeCount, onClear }) {
  const selectCls = 'h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/20';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="advanced-filters-trigger"
          className={`relative inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            activeCount > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white">{activeCount}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900"><Filter className="h-3.5 w-3.5 text-zinc-400" /> Refine results</p>
          {activeCount > 0 && (
            <button type="button" onClick={onClear} className="text-xs font-medium text-rose-600 hover:text-rose-700" data-testid="mr-clear-filters">Clear all</button>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Request Type</label>
            <select className={selectCls} value={requestTypeId} onChange={(e) => onType(e.target.value)} data-testid="mr-filter-type">
              <option value="">All types</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Assigned Team</label>
            <select className={selectCls} value={deptId} onChange={(e) => onDept(e.target.value)} data-testid="mr-filter-dept">
              <option value="">All teams</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Requested By</label>
            <select className={selectCls} value={requestedBy} onChange={(e) => onBy(e.target.value)} data-testid="mr-filter-requestedby">
              <option value="">Anyone</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
            </select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── View toggle (list / kanban) ──────────────────────────────────────────────
function ViewToggle({ view, setView }) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5" data-testid="view-toggle-list-kanban">
      <button
        type="button"
        onClick={() => setView('kanban')}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${view === 'kanban' ? 'bg-emerald-600 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
        data-testid="mr-view-kanban"
      >
        <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} /> Kanban
      </button>
      <button
        type="button"
        onClick={() => setView('list')}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${view === 'list' ? 'bg-emerald-600 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
        data-testid="mr-view-list"
      >
        <LayoutList className="h-3.5 w-3.5" strokeWidth={1.75} /> List
      </button>
    </div>
  );
}

// ── List loading skeleton ────────────────────────────────────────────────────
function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-3"><Skeleton className="h-4 w-40" /></div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-zinc-50 px-5 py-4">
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-7 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function RequestTable({ rows, navigate, sort, onSort, onSortChange, states }) {
  const initialKeys = new Set((states || []).filter((s) => s.is_initial).map((s) => s.key));
  if (initialKeys.size === 0) initialKeys.add('submitted');
  const isNewReq = (req) => initialKeys.has(req.current_state_key);
  const COLUMNS = [
    { label: 'Request', field: 'request_number' },
    { label: 'Lead', field: 'lead_company' },
    { label: 'Status', field: 'current_state_label' },
    { label: 'Assigned to', field: 'assigned_user_name' },
    { label: 'Due date', field: 'requested_due_date' },
    { label: 'Raised by', field: 'created_by_name' },
  ];
  const MOBILE_SORTS = [
    { value: '-created_at', label: 'Newest first' },
    { value: 'created_at', label: 'Oldest first' },
    { value: 'requested_due_date', label: 'Due date ↑' },
    { value: '-requested_due_date', label: 'Due date ↓' },
    { value: 'current_state_label', label: 'Status A–Z' },
    { value: 'created_by_name', label: 'Raised by A–Z' },
    { value: 'request_number', label: 'Request # ↑' },
  ];
  const activeField = sort?.replace(/^-/, '');
  const activeDesc = sort?.startsWith('-');

  const EmptyState = ({ colSpan }) => (
    <TableRow>
      <TableCell colSpan={colSpan} className="p-0">
        <div className="flex h-[360px] flex-col items-center justify-center gap-2 text-center">
          <Inbox className="h-12 w-12 text-zinc-300" strokeWidth={1} />
          <p className="text-base font-semibold text-zinc-700">No requests found</p>
          <p className="text-sm text-zinc-400">Adjust your filters or create a new request.</p>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <>
      {/* Mobile / tablet: stacked cards */}
      <div className="space-y-3 lg:hidden" data-testid="mr-mobile-list">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-zinc-500">{rows.length} shown</span>
          <select
            value={sort || '-created_at'}
            onChange={(e) => onSortChange(e.target.value)}
            className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            data-testid="mr-mobile-sort"
            aria-label="Sort requests"
          >
            {MOBILE_SORTS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
          </select>
        </div>
        {rows.length === 0 ? (
          <Card className="rounded-xl border border-zinc-100"><CardContent className="flex flex-col items-center gap-2 p-10 text-center"><Inbox className="h-10 w-10 text-zinc-300" strokeWidth={1} /><p className="text-sm font-medium text-zinc-600">No requests found</p></CardContent></Card>
        ) : rows.map((req) => {
          const overdue = req.requested_due_date && req.current_state_key !== 'production_completed' && isOverdueDate(req.requested_due_date);
          const assignedTo = req.assigned_user_name || req.assigned_department_name || (req.assigned_role ? `Role: ${req.assigned_role}` : '—');
          const leadLabel = req.lead_company || req.lead_name;
          const isNew = isNewReq(req);
          const accent = req.is_urgent ? 'border-l-rose-500' : isNew ? 'border-l-blue-400' : 'border-l-transparent';
          return (
            <Card
              key={req.id}
              className={`cursor-pointer rounded-xl border border-zinc-100 border-l-2 shadow-sm transition-transform active:scale-[0.99] ${accent}`}
              onClick={() => navigate(`/design-requests-new/${req.id}`)}
              data-testid={`mr-card-${req.id}`}
            >
              <CardContent className="space-y-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold leading-snug text-zinc-900">
                    {req.is_urgent && <Flame className="h-3.5 w-3.5 shrink-0 text-rose-500" data-testid={`mr-urgent-badge-${req.id}`} />}
                    {req.request_type_name || 'Untyped Request'}
                  </span>
                  <StatusBadge label={req.current_state_label || req.current_state_key} color={req.current_state_color} />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span className="inline-flex items-center gap-1 font-mono"><Tag className="h-3 w-3" /> {req.request_number}</span>
                  {ageShort(req.created_at) && <span className="inline-flex items-center gap-1"><Hourglass className="h-3 w-3" /> {ageShort(req.created_at)}</span>}
                  {req.short_timeline_reason && <span className="inline-flex items-center gap-1 text-amber-600"><Clock className="h-3 w-3" /> Tight</span>}
                </div>
                {req.requirement_details && <p className="line-clamp-2 text-xs text-zinc-500">{req.requirement_details}</p>}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-zinc-50 pt-2 text-xs">
                  {leadLabel && <div className="col-span-2 flex items-center gap-1.5 text-zinc-600"><Users className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> <span className="truncate">{leadLabel}</span></div>}
                  <div className="flex items-center gap-1.5 text-zinc-600"><Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> <span className="truncate">{assignedTo}</span></div>
                  <div className={`flex items-center gap-1.5 ${overdue ? 'font-semibold text-rose-600' : 'text-zinc-600'}`}>
                    <Calendar className="h-3.5 w-3.5 shrink-0" /> {req.requested_due_date ? formatDate(req.requested_due_date, 'MMM d') : '—'}{overdue && <AlertTriangle className="h-3 w-3" />}
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5 text-zinc-600">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-medium text-emerald-700">{getInitials(req.created_by_name)}</div>
                    <span className="truncate">{req.created_by_name}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Desktop: refined table */}
      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-zinc-200 bg-zinc-50/60 hover:bg-zinc-50/60">
                {COLUMNS.map(({ label, field }) => {
                  const isActive = activeField === field;
                  return (
                    <TableHead key={field} className="py-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">
                      <button
                        type="button"
                        onClick={() => onSort(field)}
                        className={`inline-flex select-none items-center gap-1 transition-colors hover:text-zinc-900 ${isActive ? 'text-zinc-900' : ''}`}
                        data-testid={`mr-sort-${field}`}
                      >
                        {label}
                        {!isActive && <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                        {isActive && (activeDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <EmptyState colSpan={6} />
              ) : rows.map((req) => {
                const overdue = req.requested_due_date && req.current_state_key !== 'production_completed' && isOverdueDate(req.requested_due_date);
                const assignedTo = req.assigned_user_name || req.assigned_department_name || (req.assigned_role ? `Role: ${req.assigned_role}` : '—');
                const leadLabel = req.lead_company || req.lead_name;
                const isNew = isNewReq(req);
                const accent = req.is_urgent ? 'border-l-rose-500' : isNew ? 'border-l-blue-400' : 'border-l-transparent';
                return (
                  <TableRow
                    key={req.id}
                    className={`group cursor-pointer border-b border-l-2 border-zinc-100 ${accent} transition-colors hover:bg-zinc-50/80`}
                    onClick={() => navigate(`/design-requests-new/${req.id}`)}
                    data-testid={`request-list-row-${req.id}`}
                  >
                    <TableCell className="py-3.5 align-top" style={{ maxWidth: 460 }}>
                      <div className="flex items-center gap-1.5">
                        {req.is_urgent && (
                          <span className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-700" data-testid={`mr-urgent-badge-${req.id}`}>
                            <Flame className="h-2.5 w-2.5" /> Urgent
                          </span>
                        )}
                        {isNew && !req.is_urgent && <span className="h-2 w-2 rounded-full bg-blue-500" title="New — not acted on yet" data-testid={`mr-new-dot-${req.id}`} />}
                        <span className="truncate text-sm font-semibold text-zinc-900" style={{ maxWidth: 320 }} title={req.request_type_name}>
                          {req.request_type_name || 'Untyped Request'}
                        </span>
                        {req.short_timeline_reason && <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" title="Tight timeline" />}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                        <span className="inline-flex items-center gap-1 font-mono text-zinc-500"><Tag className="h-3 w-3" /> {req.request_number}</span>
                        {ageShort(req.created_at) && <span>· {ageShort(req.created_at)}</span>}
                        {req.requirement_details && <span className="truncate" style={{ maxWidth: 240 }}>· {req.requirement_details.slice(0, 90)}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 align-top" data-testid={`mr-row-lead-${req.id}`}>
                      {leadLabel ? (
                        <div className="flex max-w-[180px] items-center gap-1.5" title={leadLabel}>
                          <Users className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          <span className="truncate text-sm text-zinc-700">{leadLabel}</span>
                        </div>
                      ) : <span className="text-sm text-zinc-300">—</span>}
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      <StatusBadge label={req.current_state_label || req.current_state_key} color={req.current_state_color} />
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      <span className="text-sm text-zinc-700">{assignedTo}</span>
                      {req?.production?.assigned_delivery_department_name && (
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-orange-700"><Truck className="h-3 w-3" /> {req.production.assigned_delivery_department_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      {req.requested_due_date ? (
                        <div className={`flex items-center gap-1.5 text-sm ${overdue ? 'font-semibold text-rose-600' : 'text-zinc-600'}`}>
                          <Calendar className="h-3.5 w-3.5" /> {formatDate(req.requested_due_date, 'MMM d, yyyy')}
                          {overdue && <AlertTriangle className="h-3 w-3" />}
                        </div>
                      ) : <span className="text-sm text-zinc-300">—</span>}
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-100 text-[10px] font-medium text-emerald-700" title={req.created_by_name}>{getInitials(req.created_by_name)}</div>
                        <span className="text-sm text-zinc-700">{req.created_by_name}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}

export default function DesignRequestsNew() {
  const navigate = useNavigate();
  const { user } = useAuth(); // eslint-disable-line no-unused-vars
  const [sp, setSp] = useSearchParams();

  const [queue, setQueue] = useState(sp.get('queue') || 'all');
  const [stateKey, setStateKey] = useState(sp.get('state') || '');
  const [search, setSearch] = useState(sp.get('q') || '');
  const [requestTypeId, setRequestTypeId] = useState(sp.get('type') || '');
  const [deptId, setDeptId] = useState(sp.get('dept') || '');
  const [requestedBy, setRequestedBy] = useState(sp.get('by') || '');
  const [sort, setSort] = useState(sp.get('sort') || '-created_at');
  const [view, setView] = useState(sp.get('view') === 'list' ? 'list' : 'kanban');
  const [page, setPage] = useState(parseInt(sp.get('p') || '1'));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ items: [], total: 0, pages: 0 });
  const [counts, setCounts] = useState({ by_state: {}, queues: { my_raised: 0, my_assigned: 0, all: 0 }, states: [], state_machine_name: '' });
  const [types, setTypes] = useState([]);
  const [depts, setDepts] = useState([]);
  const [users, setUsers] = useState([]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ queue, page: String(page) });
      if (view === 'kanban') params.set('no_limit', 'true');
      else params.set('limit', '20');
      if (search) params.set('search', search);
      if (stateKey) params.set('state_key', stateKey);
      if (requestTypeId) params.set('request_type_id', requestTypeId);
      if (deptId) params.set('assigned_department_id', deptId);
      if (requestedBy) params.set('created_by', requestedBy);
      if (sort) params.set('sort', sort);
      const { data } = await axios.get(`${API}/design-requests-new?${params}`, { headers: HEAD() });
      setData(data || { items: [], total: 0, pages: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to load requests');
    } finally { setLoading(false); }
  }, [queue, page, search, stateKey, requestTypeId, deptId, requestedBy, sort, view]);

  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/design-requests-new/counts`, { headers: HEAD() });
      setCounts(data || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [t, d, u] = await Promise.all([
          axios.get(`${API}/marketing-request-types`, { headers: HEAD() }),
          axios.get(`${API}/master-departments`, { headers: HEAD() }),
          axios.get(`${API}/users`, { headers: HEAD() }),
        ]);
        setTypes(t.data?.types || (Array.isArray(t.data) ? t.data : []));
        setDepts(d.data?.departments || []);
        const ALLOWED_DEPTS = ['sales', 'marketing', 'design'];
        const inAllowedDept = (usr) => {
          const dep = usr.department;
          const arr = Array.isArray(dep) ? dep : (dep ? [dep] : []);
          return arr.some((x) => ALLOWED_DEPTS.includes(String(x).trim().toLowerCase()));
        };
        setUsers((Array.isArray(u.data) ? u.data : []).filter((x) => x.is_active !== false && inAllowedDept(x)));
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    const tm = setTimeout(() => fetchList(), 250);
    return () => clearTimeout(tm);
  }, [fetchList]);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set('queue', queue);
    if (stateKey) next.set('state', stateKey);
    if (search) next.set('q', search);
    if (requestTypeId) next.set('type', requestTypeId);
    if (deptId) next.set('dept', deptId);
    if (requestedBy) next.set('by', requestedBy);
    if (sort && sort !== '-created_at') next.set('sort', sort);
    if (view === 'list') next.set('view', 'list');
    if (page > 1) next.set('p', String(page));
    setSp(next, { replace: true });
  }, [queue, stateKey, search, requestTypeId, deptId, requestedBy, page, sort, view]); // eslint-disable-line

  const switchQueue = (next) => { setQueue(next); setPage(1); };
  const switchState = (key) => { setStateKey(key); setPage(1); };
  const onSearch = (v) => { setSearch(v); setPage(1); };
  const setTypeFilter = (v) => { setRequestTypeId(v); setPage(1); };
  const setDeptFilter = (v) => { setDeptId(v); setPage(1); };
  const setByFilter = (v) => { setRequestedBy(v); setPage(1); };
  const clearFilters = () => { setRequestTypeId(''); setDeptId(''); setRequestedBy(''); setSearch(''); setPage(1); };
  const onSort = (field) => { setSort((prev) => (prev === field ? `-${field}` : field)); setPage(1); };
  const onSortChange = (value) => { setSort(value); setPage(1); };
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ queue });
      if (search) params.set('search', search);
      if (stateKey) params.set('state_key', stateKey);
      if (requestTypeId) params.set('request_type_id', requestTypeId);
      if (deptId) params.set('assigned_department_id', deptId);
      if (requestedBy) params.set('created_by', requestedBy);
      if (sort) params.set('sort', sort);
      const res = await axios.get(`${API}/design-requests-new/export?${params}`, { headers: HEAD(), responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `design-requests-new-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export ready');
    } catch (e) { toast.error(e.response?.data?.detail || 'Export failed'); }
    finally { setExporting(false); }
  };

  const items = data.items || [];
  const queueCount = (k) => counts?.queues?.[k] ?? 0;
  const stateCount = (k) => counts?.by_state?.[k] ?? 0;
  const states = counts.states || [];
  const advActiveCount = [requestTypeId, deptId, requestedBy].filter(Boolean).length;

  const metrics = [
    { key: 'all', label: 'All Requests', short: 'All', icon: LayoutList, value: queueCount('all') },
    { key: 'my_raised', label: 'Raised By Me', short: 'Mine', icon: User, value: queueCount('my_raised') },
    { key: 'my_assigned', label: 'Assigned To Me', short: 'To Me', icon: Users, value: queueCount('my_assigned') },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8" data-testid="design-requests-new-page">
      <AppBreadcrumb />

      {/* Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md shadow-emerald-600/20">
            <Sparkles className="h-6 w-6 text-white" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">Design Requests - New</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500 sm:text-sm">
              <GitBranch className="h-3.5 w-3.5" />
              {counts.state_machine_name || 'No state machine attached'}
              <span className="text-zinc-300">&middot;</span>
              {data.total} {data.total === 1 ? 'request' : 'requests'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} setView={setView} />
          <Button variant="outline" onClick={exportCsv} disabled={exporting || data.total === 0} data-testid="mr-export-btn">
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" strokeWidth={1.75} />}
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
          <Button onClick={() => navigate('/design-requests-new/new')} className="bg-emerald-700 hover:bg-emerald-800" data-testid="new-marketing-request-btn">
            <Plus className="mr-2 h-4 w-4" strokeWidth={2} /> New Request
          </Button>
        </div>
      </header>

      {/* Command strip — consolidates queue, search, status & filters */}
      <div className="flex flex-col items-stretch gap-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm lg:flex-row lg:items-center">
        <QueueSwitcher metrics={metrics} queue={queue} onSwitch={switchQueue} />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" strokeWidth={1.75} />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search type, number or details…"
            className="h-10 w-full rounded-lg border border-transparent bg-zinc-50 pl-9 pr-3 text-sm text-zinc-800 placeholder:text-zinc-400 transition-colors focus:border-zinc-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/15"
            data-testid="mr-search-input"
          />
        </div>
        <div className="hidden h-6 w-px bg-zinc-200 lg:block" />
        <div className="flex items-center gap-2">
          <StatusFilter states={states} stateCount={stateCount} stateKey={stateKey} onPick={switchState} />
          <AdvancedFilters
            types={types}
            depts={depts}
            users={users}
            requestTypeId={requestTypeId}
            deptId={deptId}
            requestedBy={requestedBy}
            onType={setTypeFilter}
            onDept={setDeptFilter}
            onBy={setByFilter}
            activeCount={advActiveCount}
            onClear={clearFilters}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        view === 'kanban'
          ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
          : <ListSkeleton />
      ) : view === 'kanban' ? (
        <RequestKanbanNew rows={items} states={states} navigate={navigate} />
      ) : (
        <>
          <RequestTable rows={items} navigate={navigate} sort={sort} onSort={onSort} onSortChange={onSortChange} states={states} />
          {data.pages > 1 && (
            <div className="flex items-center justify-between px-1 text-xs text-zinc-500 sm:text-sm">
              <span>Page {data.page || page} of {data.pages} &middot; {data.total} total</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="mr-prev-page"><ChevronLeft className="h-4 w-4" /></Button>
                <Button size="sm" variant="outline" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} data-testid="mr-next-page"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
