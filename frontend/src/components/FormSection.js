import React from 'react';
import { ChevronDown } from 'lucide-react';

const SECTION_THEMES = {
  indigo: { head: 'bg-indigo-50/80 hover:bg-indigo-100/70 dark:bg-indigo-950/30', icon: 'text-indigo-600', title: 'text-indigo-900 dark:text-indigo-200', border: 'border-indigo-200 dark:border-indigo-900', chev: 'text-indigo-400' },
  emerald: { head: 'bg-emerald-50/80 hover:bg-emerald-100/70 dark:bg-emerald-950/30', icon: 'text-emerald-600', title: 'text-emerald-900 dark:text-emerald-200', border: 'border-emerald-200 dark:border-emerald-900', chev: 'text-emerald-400' },
  blue: { head: 'bg-blue-50/80 hover:bg-blue-100/70 dark:bg-blue-950/30', icon: 'text-blue-600', title: 'text-blue-900 dark:text-blue-200', border: 'border-blue-200 dark:border-blue-900', chev: 'text-blue-400' },
  violet: { head: 'bg-violet-50/80 hover:bg-violet-100/70 dark:bg-violet-950/30', icon: 'text-violet-600', title: 'text-violet-900 dark:text-violet-200', border: 'border-violet-200 dark:border-violet-900', chev: 'text-violet-400' },
  amber: { head: 'bg-amber-50/80 hover:bg-amber-100/70 dark:bg-amber-950/30', icon: 'text-amber-600', title: 'text-amber-900 dark:text-amber-200', border: 'border-amber-200 dark:border-amber-900', chev: 'text-amber-500' },
  rose: { head: 'bg-rose-50/80 hover:bg-rose-100/70 dark:bg-rose-950/30', icon: 'text-rose-600', title: 'text-rose-900 dark:text-rose-200', border: 'border-rose-200 dark:border-rose-900', chev: 'text-rose-400' },
};

export const FormSection = ({ icon: Icon, title, hint, open, onToggle, children, testid, color = 'indigo', columns = 2 }) => {
  const t = SECTION_THEMES[color];
  return (
    <div className={`rounded-xl border overflow-hidden ${t.border}`}>
      <button type="button" onClick={onToggle}
        className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ${t.head}`}
        data-testid={testid}>
        <Icon className={`h-4 w-4 shrink-0 ${t.icon}`} />
        <span className={`font-semibold text-sm ${t.title}`}>{title}</span>
        {!open && hint && <span className="text-xs text-muted-foreground truncate hidden sm:inline">— {hint}</span>}
        <ChevronDown className={`h-4 w-4 ml-auto shrink-0 transition-transform duration-200 ${t.chev} ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className={`p-4 grid grid-cols-1 ${columns === 2 ? 'sm:grid-cols-2' : ''} gap-4 border-t ${t.border}`}>{children}</div>}
    </div>
  );
};
