/**
 * BatchPickerCards — selectable batch cards UI, the same one used in Stock Out (DeliveriesTab).
 *
 * Replaces the cramped <select> dropdown that previously appeared in Stock In
 * (ShipmentsTab) and Promotional Stock Out (PromoDispatchSection) with a row
 * of clickable cards showing batch code, age-tier chip, production/received
 * date, and unit count — selected card gets an amber gradient + checkmark.
 *
 * Props:
 *   batches        — list from /batches-available or /production-batches
 *                    (objects with batch_id, batch_code, quantity, production_date?, received_at?)
 *   selectedId     — current item.batch_id
 *   onSelect       — (batch_id, batch_code) => void
 *   testIdPrefix   — base id used for data-testid attributes on each card
 *   emptyMessage   — copy shown when no batches exist
 */
import React from 'react';
import { Label } from '../ui/label';
import { Package, AlertCircle, CheckCircle2 } from 'lucide-react';

const ageKey = (b) => b.production_date || b.received_at || '';

const ageDays = (iso) => {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
};

const ageChip = (days) => {
  if (days == null) return { label: 'Age unknown', cls: 'text-slate-600 bg-slate-100 border-slate-200' };
  const label = days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} old`;
  if (days < 30) return { label, cls: 'text-emerald-700 bg-emerald-100 border-emerald-200' };
  if (days < 60) return { label, cls: 'text-amber-700 bg-amber-100 border-amber-200' };
  return { label, cls: 'text-rose-700 bg-rose-100 border-rose-200' };
};

export default function BatchPickerCards({
  batches = [],
  selectedId = '',
  onSelect,
  testIdPrefix = 'batch',
  emptyMessage = 'No batches available for this SKU.',
}) {
  // FIFO sort — oldest first
  const sorted = [...batches].sort((a, b) => {
    const ka = ageKey(a);
    const kb = ageKey(b);
    if (ka && kb) return ka.localeCompare(kb);
    if (ka) return -1;
    if (kb) return 1;
    return (a.batch_code || '').localeCompare(b.batch_code || '');
  });

  return (
    <div className="mt-3" data-testid={`${testIdPrefix}-picker`}>
      <div className="flex items-baseline justify-between mb-1.5">
        <Label className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
          <Package className="h-3 w-3" />
          Batch <span className="text-red-500">*</span>
          <span className="text-[10px] text-amber-600/70 font-normal normal-case">FIFO — oldest first</span>
        </Label>
        {sorted.length > 0 && (
          <span className="text-[10px] text-slate-500">
            {sorted.length} batch{sorted.length === 1 ? '' : 'es'} available
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50/70 px-3 py-2.5 text-xs text-red-700 flex items-center gap-2"
          data-testid={`${testIdPrefix}-empty`}
        >
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{emptyMessage}</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2" data-testid={`${testIdPrefix}-cards`}>
          {sorted.map((b, bi) => {
            const selected = selectedId === b.batch_id;
            const days = ageDays(ageKey(b));
            const chip = ageChip(days);
            const ageSource = b.production_date ? 'Produced' : 'Received';
            const ageDate = b.production_date || (b.received_at ? b.received_at.slice(0, 10) : null);
            return (
              <button
                type="button"
                key={b.batch_id || `legacy-${bi}`}
                onClick={() => onSelect?.(b.batch_id, b.batch_code)}
                data-testid={`${testIdPrefix}-card-${bi}`}
                className={[
                  'group relative flex flex-col items-start text-left rounded-xl border px-3 py-2 transition-all',
                  'min-w-[170px] max-w-[220px]',
                  selected
                    ? 'border-amber-500 bg-gradient-to-br from-amber-50 to-orange-50 ring-2 ring-amber-400/40 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40 hover:-translate-y-px hover:shadow-sm',
                ].join(' ')}
              >
                {selected && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow">
                    <CheckCircle2 className="h-3 w-3" />
                  </span>
                )}
                <span
                  className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border mb-1 ${chip.cls}`}
                  data-testid={`${testIdPrefix}-age-${bi}`}
                >
                  {chip.label}
                </span>
                <div className="font-mono text-[13px] font-bold text-slate-900 leading-tight tracking-tight break-all">
                  {b.batch_code}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {ageDate ? `${ageSource} ${ageDate}` : 'Date unavailable'}
                </div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className={`text-lg font-bold tabular-nums ${selected ? 'text-amber-700' : 'text-slate-800'}`}>
                    {(b.quantity || 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">units</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
