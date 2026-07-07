import React from 'react';

/**
 * Distinct, scan-optimized section header for dense detail pages
 * (per /app/design_guidelines.json). Presentational only — drop it in place of
 * the old <h2> inside an existing Card. Does not change any data logic.
 *
 * Props:
 *  - eyebrow: small uppercase label (e.g. "FINANCIALS")
 *  - title:   main section title
 *  - icon:    a lucide icon component
 *  - actions: optional right-aligned node (buttons)
 *  - className: extra classes for the wrapper
 *  - testid:  data-testid for the header
 */
export const SectionHeader = ({ eyebrow, title, icon: Icon, actions, className = '', testid }) => (
  <div
    data-testid={testid}
    className={`flex items-center justify-between gap-3 -mx-6 -mt-6 mb-5 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 bg-slate-50/70 ${className}`}
  >
    <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
      {Icon && (
        <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-slate-200 shadow-sm text-emerald-600 shrink-0">
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      )}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-1.5 h-7 bg-emerald-500 rounded-full hidden sm:block shrink-0" />
        <div className="flex flex-col gap-0.5 min-w-0">
          {eyebrow && (
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 leading-none">
              {eyebrow}
            </span>
          )}
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate leading-tight">
            {title}
          </h2>
        </div>
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export default SectionHeader;
