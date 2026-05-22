import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, MapPin, AlertCircle, Search, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { leadsAPI } from '../utils/api';

/**
 * Structured action-item builder for the Daily Status module.
 *
 * Every action item must EITHER be associated with a lead OR be explicitly
 * marked as "not associated with any lead" via the checkbox. When a lead is
 * picked and a follow-up date is set, the backend will copy that date onto
 * the lead's `next_follow_up` so the item is traceable.
 *
 * Props:
 *   value:    Array of action item objects to render.
 *   onChange: (newItems) => void — parent owns the state.
 *   disabled: bool — read-only mode (e.g. viewing a past status).
 */
export default function ActionItemsBuilder({ value, onChange, disabled = false }) {
  const items = Array.isArray(value) ? value : [];

  const updateItem = (idx, patch) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };
  const addItem = () => {
    onChange([
      ...items,
      { description: '', lead_id: null, lead_name: null, no_lead: false, follow_up_date: '' },
    ]);
  };
  const removeItem = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3" data-testid="action-items-builder">
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4 text-center text-sm text-slate-500">
          No action items yet. Click "Add Action Item" to plan a follow-up.
        </div>
      )}

      {items.map((item, idx) => (
        <ActionItemRow
          key={idx}
          index={idx}
          item={item}
          onChange={(patch) => updateItem(idx, patch)}
          onRemove={() => removeItem(idx)}
          disabled={disabled}
        />
      ))}

      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          className="w-full border-dashed"
          data-testid="add-action-item"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Add Action Item
        </Button>
      )}
    </div>
  );
}

function ActionItemRow({ index, item, onChange, onRemove, disabled }) {
  const isAssociated = !!item.lead_id;
  const isExplicitlyUnassociated = !!item.no_lead;
  const needsLeadDecision = !isAssociated && !isExplicitlyUnassociated;

  return (
    <div
      className={`rounded-xl border p-3 ${needsLeadDecision ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'} transition-colors`}
      data-testid={`action-item-row-${index}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center mt-0.5">
          {index + 1}
        </div>
        <div className="flex-1 space-y-2">
          <Textarea
            value={item.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="What needs to be done? e.g. Call back regarding pricing proposal"
            rows={2}
            disabled={disabled}
            className="text-sm resize-none"
            data-testid={`action-item-desc-${index}`}
          />

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Associated Lead
              {!isExplicitlyUnassociated && <span className="text-red-500">*</span>}
            </label>
            <LeadPicker
              value={item.lead_id ? { id: item.lead_id, label: item.lead_name || item.lead_id } : null}
              onChange={(lead) => onChange({
                lead_id: lead ? lead.id : null,
                lead_name: lead ? lead.label : null,
                no_lead: lead ? false : item.no_lead,
              })}
              disabled={disabled || isExplicitlyUnassociated}
              testId={`action-item-lead-${index}`}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <Checkbox
                checked={isExplicitlyUnassociated}
                onCheckedChange={(checked) => onChange({
                  no_lead: !!checked,
                  // Clear lead when marking "no lead"
                  lead_id: checked ? null : item.lead_id,
                  lead_name: checked ? null : item.lead_name,
                })}
                disabled={disabled}
                data-testid={`action-item-nolead-${index}`}
              />
              Not associated with any lead
            </label>

            {needsLeadDecision && (
              <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">
                <AlertCircle className="h-3 w-3 mr-1" />
                Pick a lead or tick "no lead"
              </Badge>
            )}

            {!disabled && (
              <button
                type="button"
                onClick={onRemove}
                className="ml-auto text-slate-400 hover:text-red-600 transition-colors"
                title="Remove action item"
                data-testid={`action-item-remove-${index}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Lead picker — lightweight searchable combobox backed by /api/leads search.
// ────────────────────────────────────────────────────────────────────────────
function LeadPicker({ value, onChange, disabled, testId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Search leads (debounced)
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await leadsAPI.getAll({ search: query, pageSize: 15 });
        // Backend returns { data: [...], total, page, ... } – not { leads: [...] }.
        const body = res?.data;
        const list = Array.isArray(body?.data)
          ? body.data
          : Array.isArray(body?.leads)
            ? body.leads
            : Array.isArray(body)
              ? body
              : [];
        setResults(list.map((l) => ({
          id: l.id,
          label: l.company || l.contact_person || l.name || l.id,
          sub: [l.city, l.state].filter(Boolean).join(', '),
          status: l.status,
        })));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  const buttonLabel = useMemo(() => {
    if (value?.label) return value.label;
    return 'Select a lead…';
  }, [value]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`w-full flex items-center justify-between rounded-md border px-3 h-9 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-400 ${value ? 'border-slate-300 text-slate-900' : 'border-slate-200 text-slate-500'}`}
        data-testid={testId}
      >
        <span className="truncate">{buttonLabel}</span>
        <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0 ml-1" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-md border border-slate-200 shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by company or contact…"
              className="w-full pl-7 pr-2 h-8 text-sm border border-slate-200 rounded outline-none focus:border-blue-400"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {value && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 text-left border-b border-slate-100"
              >
                Clear selection
              </button>
            )}
            {loading && (
              <div className="p-3 text-center text-xs text-slate-400">Searching…</div>
            )}
            {!loading && results.length === 0 && (
              <div className="p-3 text-center text-xs text-slate-400">No leads found.</div>
            )}
            {!loading && results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { onChange(r); setOpen(false); setQuery(''); }}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 flex flex-col gap-0.5 border-b border-slate-50 last:border-b-0"
              >
                <span className="text-sm text-slate-900 truncate">{r.label}</span>
                {(r.sub || r.status) && (
                  <span className="text-[10px] text-slate-500">
                    {r.sub}{r.sub && r.status ? ' · ' : ''}{r.status}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
