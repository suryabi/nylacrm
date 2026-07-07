import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Reusable collapsible detail-page Section.
 * Wraps content in a distinct card with an eyebrow + icon tile + bold title
 * header (per /app/design_guidelines.json). Does NOT alter inner content logic.
 *
 * Props:
 *  - id: anchor id (must match the sticky-nav href)
 *  - eyebrow: small uppercase label (e.g. "FINANCIALS")
 *  - title: main section title
 *  - icon: a lucide icon component
 *  - actions: optional right-aligned node (buttons rendered before the chevron)
 *  - collapsible: whether the header toggles content (default true)
 *  - defaultOpen: initial open state (default true)
 *  - contentClassName: override padding on the content region
 *  - testid: base data-testid (header gets `section-header-{testid}`)
 */
export const Section = ({
  id,
  eyebrow,
  title,
  icon: Icon,
  actions,
  collapsible = true,
  defaultOpen = true,
  children,
  className = '',
  contentClassName = 'p-4 sm:p-6',
  testid,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = id ? `${id}-content` : undefined;
  const tid = testid || id;

  const toggle = () => {
    if (collapsible) setOpen((v) => !v);
  };

  return (
    <section
      id={id}
      data-testid={tid ? `section-${tid}` : undefined}
      className={`scroll-mt-24 group flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md overflow-hidden ${className}`}
    >
      <div
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        aria-expanded={collapsible ? open : undefined}
        aria-controls={contentId}
        onClick={toggle}
        onKeyDown={(e) => {
          if (collapsible && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            toggle();
          }
        }}
        data-testid={tid ? `section-header-${tid}` : undefined}
        className={`flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/60 select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset ${
          collapsible ? 'cursor-pointer hover:bg-slate-100/70' : ''
        }`}
      >
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {Icon && (
            <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white border border-slate-200 shadow-sm text-slate-500 group-hover:text-emerald-600 group-hover:border-emerald-200 group-hover:bg-emerald-50/60 transition-colors shrink-0">
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          )}
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-1.5 h-7 bg-emerald-500 rounded-full hidden sm:block shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
              {eyebrow && (
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] text-slate-400 leading-none">
                  {eyebrow}
                </span>
              )}
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 truncate">
                {title}
              </h2>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
          {actions}
          {collapsible && (
            <ChevronDown
              onClick={toggle}
              className={`w-5 h-5 text-slate-400 transition-transform duration-300 cursor-pointer ${open ? '' : '-rotate-90'}`}
            />
          )}
        </div>
      </div>
      {open && (
        <div id={contentId} className={contentClassName}>
          {children}
        </div>
      )}
    </section>
  );
};

export default Section;
