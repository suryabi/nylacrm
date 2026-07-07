import React from 'react';

/**
 * Prominent, scan-optimized section header for dense detail pages.
 * Clean treatment (no boxed band): a colored accent bar + icon + eyebrow +
 * bold title, separated from the content below by a divider. Drop it in place
 * of the old <h2> at the top of a Card. Presentational only — no data logic.
 *
 * Props: eyebrow, title, icon (lucide component), actions (right node),
 *        className, testid.
 */
export const SectionHeader = ({ eyebrow, title, icon: Icon, actions, className = '', testid }) => (
  <div
    data-testid={testid}
    className={`flex items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-200 ${className}`}
  >
    <div className="flex items-center gap-3 min-w-0">
      <span className="w-1 h-8 rounded-full bg-emerald-500 shrink-0" />
      {Icon && <Icon className="w-5 h-5 text-emerald-600 shrink-0" />}
      <div className="flex flex-col min-w-0">
        {eyebrow && (
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 leading-none mb-1">
            {eyebrow}
          </span>
        )}
        <h2 className="text-lg font-bold tracking-tight text-slate-900 truncate leading-tight">
          {title}
        </h2>
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export default SectionHeader;
