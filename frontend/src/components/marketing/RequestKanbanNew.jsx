import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { format, parseISO, isValid, isPast, isToday } from 'date-fns';
import {
  GripVertical, ChevronUp, ChevronDown, Calendar, AlertTriangle,
  Users, Tag, Clock, Flame, Image as ImageIcon, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Badge } from '../ui/badge';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const BACKEND = process.env.REACT_APP_BACKEND_URL;
const HEAD = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const fmtDate = (s, f = 'MMM d') => {
  if (!s) return null;
  try { const d = parseISO(s); return isValid(d) ? format(d, f) : null; } catch { return null; }
};
const isOverdue = (s) => { if (!s) return false; try { const d = parseISO(s); return isValid(d) && isPast(d) && !isToday(d); } catch { return false; } };
const initials = (name) => {
  if (!name) return '?';
  const p = name.trim().split(' ').filter(Boolean);
  return (p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase();
};
const stateTint = (hex) => (hex ? { background: `${hex}14`, borderColor: `${hex}40` } : { background: '#f8fafc', borderColor: '#e2e8f0' });

// Sort: explicit board_rank first (asc), then newest created first.
const sortCards = (a, b) => {
  const ra = a.board_rank ?? Number.POSITIVE_INFINITY;
  const rb = b.board_rank ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return (b.created_at || '').localeCompare(a.created_at || '');
};

function RequestCard({ req, index, total, color, onDragStart, onDragOver, onDragEnd, onMove, navigate, dragging }) {
  const overdue = isOverdue(req.requested_due_date) && req.current_state_key !== 'production_completed';
  const urgent = !!req.is_urgent;
  const assignedTo = req.assigned_user_name || req.assigned_department_name || (req.assigned_role ? `Role: ${req.assigned_role}` : null);
  const leadLabel = req.lead_company || req.lead_name;
  const ownLogo = req.logo?.id ? `${BACKEND}/api/design-requests-new/files/${req.logo.id}` : null;
  const typeIcon = req.request_type_icon_url ? `${BACKEND}${req.request_type_icon_url}` : null;
  const logoSrc = ownLogo || typeIcon;
  const isTypeIcon = !ownLogo && !!typeIcon;
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, req)}
      onDragOver={(e) => onDragOver(e, req)}
      onDragEnd={onDragEnd}
      className={`group relative overflow-hidden rounded-lg mb-2 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${urgent ? 'bg-amber-50/60 border-2 border-amber-500 ring-1 ring-amber-300' : 'bg-white border border-slate-200 hover:border-slate-300'} ${dragging ? 'opacity-50' : ''}`}
      data-testid={`kanban-card-${req.id}`}
    >
      {req.lead_city && (
        <div
          className="absolute top-0 left-0 w-[86px] h-[86px] overflow-hidden pointer-events-none z-20"
          title={`Lead city: ${req.lead_city}`}
          data-testid={`kanban-city-ribbon-${req.id}`}
        >
          <div
            className="absolute top-[15px] -left-[26px] w-[116px] -rotate-45 text-white text-[10px] font-bold uppercase tracking-wider text-center py-[3px] shadow-md"
            style={req.lead_city_color
              ? { backgroundColor: req.lead_city_color }
              : { backgroundImage: 'linear-gradient(to right, #0d9488, #059669)' }}
          >
            {req.lead_city.slice(0, 3).toUpperCase()}
          </div>
        </div>
      )}

      {/* Logo band — top portion so users can see the branding */}
      <div
        className="relative h-28 w-full bg-slate-50 border-b border-slate-100 flex items-center justify-center overflow-hidden"
        data-testid={`kanban-card-logo-${req.id}`}
      >
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={`${req.request_type_name || 'Request'} ${isTypeIcon ? 'type icon' : 'logo'}`}
            className={`max-h-full max-w-full object-contain p-3 ${isTypeIcon ? 'opacity-70' : ''}`}
            loading="lazy"
            data-testid={`kanban-card-image-${req.id}`}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-300">
            <ImageIcon className="h-7 w-7" />
            <span className="text-[10px] font-medium">No logo</span>
          </div>
        )}
      </div>

      <div className="p-2.5">
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500 shrink-0" title={`Priority #${index + 1}`}>
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/design-requests-new/${req.id}`)}>
          <p className="text-sm font-medium text-slate-900 truncate group-hover:text-primary transition-colors" title={req.request_type_name}>
            {req.request_type_name || 'Untyped Request'}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-mono">
              <Tag className="h-2.5 w-2.5" /> {req.request_number}
            </span>
            {urgent && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-white bg-red-600 px-1.5 py-0.5 rounded" data-testid={`kanban-urgent-${req.id}`}>
                <Flame className="h-2.5 w-2.5" /> Urgent
              </span>
            )}
          </div>
        </div>
        {/* Priority nudge + drag handle */}
        <div className="flex flex-col items-center -my-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMove(req, 'up'); }}
            disabled={index === 0}
            className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up" data-testid={`kanban-up-${req.id}`}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMove(req, 'down'); }}
            disabled={index === total - 1}
            className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down" data-testid={`kanban-down-${req.id}`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <GripVertical className="h-4 w-4 text-slate-300 group-hover:text-slate-400 shrink-0 mt-0.5" />
      </div>

      <div className="mt-2 pl-6.5 space-y-1.5" style={{ paddingLeft: 26 }}>
        {leadLabel && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Users className="h-3 w-3 text-emerald-500 shrink-0" />
            <span className="truncate">{leadLabel}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1 text-[11px] ${overdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
            <Calendar className="h-3 w-3" />
            {fmtDate(req.requested_due_date, 'MMM d, yyyy') || 'No due date'}
            {overdue && <AlertTriangle className="h-3 w-3" />}
          </div>
          {req.short_timeline_reason && (
            <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 px-1.5 py-0">
              <Clock className="h-2.5 w-2.5 mr-0.5" /> Tight
            </Badge>
          )}
        </div>
        {(assignedTo || req.created_by_name) && (
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-50">
            {assignedTo ? (
              <span className="text-[10px] text-slate-500 truncate">{assignedTo}</span>
            ) : <span />}
            {req.created_by_name && (
              <span className="flex items-center gap-1 shrink-0" title={`Raised by ${req.created_by_name}`}>
                <span
                  className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-semibold text-emerald-700"
                  data-testid={`kanban-requestor-initials-${req.id}`}
                >
                  {initials(req.created_by_name)}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default function RequestKanbanNew({ rows, states, navigate }) {
  // Local, reorderable copy of cards grouped by state.
  const [cols, setCols] = useState({});
  const dragRef = useRef(null);        // { id, fromState }
  const [draggingId, setDraggingId] = useState(null);
  const scrollRef = useRef(null);
  const blockedToastRef = useRef(0);

  const orderedStates = useMemo(() => states || [], [states]);

  // Horizontal scroll controls (arrow buttons) — auto-hide at the edges.
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanLeft(scrollLeft > 4);
    setCanRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);
  const scrollByAmount = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.8, 320);
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  // (Re)build columns whenever the source rows change.
  useEffect(() => {
    const grouped = {};
    (states || []).forEach((s) => { grouped[s.key] = []; });
    (rows || []).forEach((r) => {
      const k = r.current_state_key || '_unknown';
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(r);
    });
    Object.keys(grouped).forEach((k) => grouped[k].sort(sortCards));
    setCols(grouped);
  }, [rows, states]);

  const persist = async (stateKey, list) => {
    try {
      await axios.post(`${API}/design-requests-new/board-reorder`,
        { state_key: stateKey, ordered_ids: list.map((c) => c.id) },
        { headers: HEAD() });
    } catch {
      toast.error('Could not save the new order');
    }
  };

  const onDragStart = (e, req) => {
    dragRef.current = { id: req.id, fromState: req.current_state_key };
    setDraggingId(req.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOverCard = (e, overReq) => {
    e.preventDefault();
    const drag = dragRef.current;
    if (!drag || drag.id === overReq.id) return;
    if (drag.fromState !== overReq.current_state_key) return; // only reorder within same column
    setCols((prev) => {
      const list = [...(prev[overReq.current_state_key] || [])];
      const from = list.findIndex((c) => c.id === drag.id);
      const to = list.findIndex((c) => c.id === overReq.id);
      if (from === -1 || to === -1 || from === to) return prev;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return { ...prev, [overReq.current_state_key]: list };
    });
  };

  const onDragEnd = () => {
    const drag = dragRef.current;
    if (drag) persist(drag.fromState, cols[drag.fromState] || []);
    dragRef.current = null;
    setDraggingId(null);
  };

  // Dropping on a different column is not allowed (status changes happen in List view).
  const onColumnDrop = (e, stateKey) => {
    e.preventDefault();
    const drag = dragRef.current;
    if (drag && drag.fromState !== stateKey) {
      const now = Date.now();
      if (now - blockedToastRef.current > 1500) {
        blockedToastRef.current = now;
        toast.info('To change a request\u2019s status, use the List view. The board only sets priority within a column.');
      }
    }
  };

  const move = (req, dir) => {
    const stateKey = req.current_state_key;
    setCols((prev) => {
      const list = [...(prev[stateKey] || [])];
      const i = list.findIndex((c) => c.id === req.id);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i === -1 || j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j], list[i]];
      persist(stateKey, list);
      return { ...prev, [stateKey]: list };
    });
  };

  // Recompute arrow visibility on mount, when columns change, and on resize.
  useEffect(() => {
    const raf = requestAnimationFrame(updateScrollState);
    window.addEventListener('resize', updateScrollState);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', updateScrollState); };
  }, [updateScrollState, cols, orderedStates]);

  return (
    <div className="relative" data-testid="mr-kanban-wrap">
      {canLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount('left')}
          aria-label="Scroll left"
          data-testid="kanban-scroll-left"
          className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-30 h-10 w-10 -ml-3 items-center justify-center rounded-full bg-white/95 backdrop-blur border border-slate-200 shadow-lg text-slate-600 transition-all hover:text-emerald-700 hover:border-emerald-300 hover:scale-105 active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          onClick={() => scrollByAmount('right')}
          aria-label="Scroll right"
          data-testid="kanban-scroll-right"
          className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-30 h-10 w-10 -mr-3 items-center justify-center rounded-full bg-white/95 backdrop-blur border border-slate-200 shadow-lg text-slate-600 transition-all hover:text-emerald-700 hover:border-emerald-300 hover:scale-105 active:scale-95"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin scroll-smooth"
        data-testid="mr-kanban"
      >
      {orderedStates.map((s) => {
        const list = cols[s.key] || [];
        const color = s.color || '#64748b';
        return (
          <div
            key={s.key}
            className="flex-shrink-0 w-80"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onColumnDrop(e, s.key)}
            data-testid={`kanban-column-${s.key}`}
          >
            <div className="rounded-xl border h-full flex flex-col" style={stateTint(color)}>
              <div className="p-3 flex items-center justify-between border-b" style={{ borderColor: `${color}33` }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <h3 className="font-semibold text-sm truncate" style={{ color }}>{s.label}</h3>
                </div>
                <Badge variant="secondary" className="text-xs font-medium shrink-0" style={{ background: `${color}1f`, color }}>
                  {list.length}
                </Badge>
              </div>
              <div className="flex-1 p-2 overflow-y-auto max-h-[calc(100vh-300px)] min-h-[120px] scrollbar-thin">
                {list.map((req, idx) => (
                  <RequestCard
                    key={req.id}
                    req={req}
                    index={idx}
                    total={list.length}
                    color={color}
                    onDragStart={onDragStart}
                    onDragOver={onDragOverCard}
                    onDragEnd={onDragEnd}
                    onMove={move}
                    navigate={navigate}
                    dragging={draggingId === req.id}
                  />
                ))}
                {list.length === 0 && (
                  <div className="text-center py-10 text-xs text-slate-400">No requests</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
