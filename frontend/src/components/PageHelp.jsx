import React, { useState } from 'react';
import { Info, BookOpen } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from './ui/sheet';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useAuth } from '../context/AuthContext';
import { getDistributorHelp } from '../data/distributorPageHelp';

/**
 * Renders an (i) icon that opens a right-side help drawer.
 * Currently scoped to Distributor users only (returns null for everyone else).
 *
 * Usage:
 *   <PageHelp pageKey="stockin" />
 *
 * pageKey must match one of the keys in `distributorPageHelp.js`.
 */
export default function PageHelp({ pageKey, className = '' }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Distributor-only for now (as agreed)
  if (!user || user.role !== 'Distributor') return null;

  const help = getDistributorHelp(pageKey);
  if (!help) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-full text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 ${className}`}
          aria-label={`How to use the ${help.title} page`}
          title="How to use this page"
          data-testid={`page-help-${pageKey}`}
        >
          <Info className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto"
        data-testid={`page-help-drawer-${pageKey}`}
      >
        <SheetHeader className="space-y-1.5 pb-4 border-b">
          <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium uppercase tracking-wide">
            <BookOpen className="h-3.5 w-3.5" />
            How to use
          </div>
          <SheetTitle className="text-xl">{help.title}</SheetTitle>
          {help.subtitle && (
            <SheetDescription className="text-sm">{help.subtitle}</SheetDescription>
          )}
        </SheetHeader>

        <div className="py-5 space-y-6">
          {/* Purpose */}
          {help.purpose && (
            <section>
              <Badge variant="outline" className="mb-2 bg-emerald-50 text-emerald-700 border-emerald-200">
                Purpose
              </Badge>
              <p className="text-sm leading-relaxed text-slate-700">{help.purpose}</p>
            </section>
          )}

          {/* Sections */}
          {(help.sections || []).map((section, idx) => (
            <section key={idx}>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">{section.heading}</h4>
              <ul className="space-y-2 text-sm text-slate-700 leading-relaxed list-disc ml-5">
                {(section.bullets || []).map((b, bIdx) => (
                  <li key={bIdx}>{renderInlineMarkdown(b)}</li>
                ))}
              </ul>
            </section>
          ))}

          {/* Footer hint */}
          <div className="mt-6 p-3 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-600">
            Need more help? Reach out to your <span className="font-medium">Distribution Manager</span> or refer to the
            training material shared during onboarding.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Render very simple inline markdown: `**bold**` -> <strong>, `*italic*` -> <em>.
 * Kept intentionally minimal so we never have to ship a markdown library for this.
 */
function renderInlineMarkdown(text) {
  if (!text) return text;
  const parts = [];
  let remaining = text;
  let key = 0;
  const boldRegex = /\*\*([^*]+?)\*\*/;

  while (remaining.length > 0) {
    const match = boldRegex.exec(remaining);
    if (!match) {
      parts.push(<React.Fragment key={key++}>{remaining}</React.Fragment>);
      break;
    }
    if (match.index > 0) {
      parts.push(<React.Fragment key={key++}>{remaining.slice(0, match.index)}</React.Fragment>);
    }
    parts.push(<strong key={key++} className="font-semibold text-slate-900">{match[1]}</strong>);
    remaining = remaining.slice(match.index + match[0].length);
  }
  return parts;
}
