import React from 'react';

/**
 * Contemporary stat tile with pastel gradient, blurred blob, pill icon,
 * tabular numbers and hover lift. Used for headline metrics across the app.
 *
 * Props:
 *   label       – small uppercase label at the top (e.g. "REVENUE")
 *   value       – the big number (string or number). Formatted by `format`
 *   format      – 'currency' | 'number' | 'percent' | 'raw' (default 'number')
 *   currency    – currency symbol (default '₹')
 *   subtitle    – small line under the value (e.g. "vs last month")
 *   delta       – numeric change (positive/negative). Shows colored pill
 *   deltaLabel  – override text for the delta pill
 *   deltaIsCurrency – format delta with currency prefix
 *   icon        – a lucide icon component (e.g. Users, DollarSign)
 *   colorIndex  – 0-5 to pick one of the 6 accent palettes; if omitted uses
 *                 a deterministic hash of `label`
 *   onClick     – makes the tile interactive
 *   footer      – optional ReactNode rendered at the bottom (e.g. min/max row)
 *   className   – extra classes
 *   testId      – data-testid
 */
const GRADIENTS = [
  'from-indigo-50 via-indigo-50/50 to-white dark:from-indigo-950/40 dark:via-indigo-950/20 dark:to-slate-900',
  'from-emerald-50 via-emerald-50/50 to-white dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-slate-900',
  'from-amber-50 via-amber-50/50 to-white dark:from-amber-950/40 dark:via-amber-950/20 dark:to-slate-900',
  'from-sky-50 via-sky-50/50 to-white dark:from-sky-950/40 dark:via-sky-950/20 dark:to-slate-900',
  'from-rose-50 via-rose-50/50 to-white dark:from-rose-950/40 dark:via-rose-950/20 dark:to-slate-900',
  'from-violet-50 via-violet-50/50 to-white dark:from-violet-950/40 dark:via-violet-950/20 dark:to-slate-900',
];

const ACCENTS = [
  { text: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/10', blob: 'bg-indigo-500/10' },
  { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', blob: 'bg-emerald-500/10' },
  { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', blob: 'bg-amber-500/10' },
  { text: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/10', blob: 'bg-sky-500/10' },
  { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', blob: 'bg-rose-500/10' },
  { text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10', blob: 'bg-violet-500/10' },
];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function formatValue(value, format, currency) {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'raw') return value;

  const num = Number(value);
  if (Number.isNaN(num)) return String(value);

  if (format === 'currency') {
    const abs = Math.abs(num);
    if (abs >= 10_000_000) return `${currency}${(num / 10_000_000).toFixed(2)}Cr`;
    if (abs >= 100_000) return `${currency}${(num / 100_000).toFixed(2)}L`;
    if (abs >= 1000) return `${currency}${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    return `${currency}${num.toFixed(2)}`;
  }
  if (format === 'percent') return `${num.toFixed(1)}%`;
  // number
  return num.toLocaleString('en-IN');
}

const StatTile = ({
  label,
  value,
  format = 'number',
  currency = '₹',
  subtitle,
  delta,
  deltaLabel,
  deltaIsCurrency = false,
  icon: Icon,
  colorIndex,
  onClick,
  footer,
  className = '',
  testId,
}) => {
  const idx = typeof colorIndex === 'number'
    ? ((colorIndex % GRADIENTS.length) + GRADIENTS.length) % GRADIENTS.length
    : hashString(String(label || '')) % GRADIENTS.length;
  const grad = GRADIENTS[idx];
  const accent = ACCENTS[idx];

  const hasDelta = delta !== undefined && delta !== null && !Number.isNaN(Number(delta));
  const deltaNum = hasDelta ? Number(delta) : 0;
  const deltaColor = deltaNum > 0
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
    : deltaNum < 0
      ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10'
      : 'text-slate-600 dark:text-slate-400 bg-slate-500/10';
  const deltaSign = deltaNum > 0 ? '+' : '';
  const deltaDisplay = deltaLabel || (
    deltaIsCurrency
      ? `${deltaSign}${currency}${Math.abs(deltaNum).toLocaleString('en-IN')}`
      : `${deltaSign}${deltaNum}${format === 'percent' ? 'pp' : ''}`
  );

  return (
    <div
      className={`relative group rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-gradient-to-br ${grad} p-4 overflow-hidden transition-all ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]' : 'hover:-translate-y-0.5 hover:shadow-md'
      } ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      data-testid={testId}
    >
      {/* Decorative blob */}
      <div className={`absolute -top-4 -right-4 h-20 w-20 rounded-full ${accent.blob} blur-2xl opacity-40 transition-opacity group-hover:opacity-60`} />

      <div className="flex items-start justify-between gap-2 relative">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate" title={label}>
            {label}
          </p>
        </div>
        {Icon && (
          <div className={`shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ${accent.text} ${accent.bg}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="mt-3 relative">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums leading-none">
            {formatValue(value, format, currency)}
          </span>
          {hasDelta && (
            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums ${deltaColor}`}>
              {deltaDisplay}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground mt-1.5">{subtitle}</p>
        )}
      </div>

      {footer && (
        <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700/50 relative">
          {footer}
        </div>
      )}
    </div>
  );
};

export default StatTile;
export { GRADIENTS, ACCENTS };
