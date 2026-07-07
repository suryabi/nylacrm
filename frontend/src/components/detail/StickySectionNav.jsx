import React, { useEffect, useState, useRef, useCallback } from 'react';

/**
 * Tracks which of the given section ids is currently in view using
 * IntersectionObserver, returning the active id for nav highlighting.
 */
export const useActiveSection = (ids = []) => {
  const [active, setActive] = useState(ids[0] || '');
  const visible = useRef(new Map());
  const key = ids.join('|');

  useEffect(() => {
    if (!ids.length) return undefined;
    visible.current = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visible.current.set(entry.target.id, entry.intersectionRatio);
          } else {
            visible.current.delete(entry.target.id);
          }
        });
        // Pick the top-most visible section (first in the ids order).
        const current = ids.find((id) => visible.current.has(id));
        if (current) setActive(current);
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: [0, 0.1, 0.5, 1] }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active;
};

/**
 * Sticky table-of-contents navigation for dense detail pages.
 * items: [{ id, label, icon }]
 */
export const StickySectionNav = ({ items = [], title = 'On this page', testid = 'section-nav' }) => {
  const ids = items.map((i) => i.id);
  const active = useActiveSection(ids);

  const handleClick = useCallback((e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${id}`);
    }
  }, []);

  if (!items.length) return null;

  return (
    <nav
      data-testid={testid}
      className="hidden xl:block w-64 shrink-0 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pb-8"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 px-3 mb-3">
        {title}
      </p>
      <div className="flex flex-col gap-0.5 border-l border-slate-200 pl-3">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => handleClick(e, id)}
              data-active={isActive}
              data-testid={`nav-link-${id}`}
              className={`group relative flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span
                className={`absolute -left-[13px] w-[2px] h-6 rounded-r bg-emerald-500 transition-transform origin-left ${
                  isActive ? 'scale-y-100' : 'scale-y-0'
                }`}
              />
              {Icon && <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}`} />}
              <span className="truncate">{label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
};

export default StickySectionNav;
