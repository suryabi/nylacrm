import React from 'react';
import { MapPin, ExternalLink, Navigation } from 'lucide-react';
import { Input } from './ui/input';
import { isValidMapsLink } from '../utils/mapsLink';

/**
 * MapsLinkInput — a visually distinct field for pasting a Google Maps location
 * link (e.g. https://maps.app.goo.gl/...). Shows a location pin, a helper line,
 * and an "Open" button once a valid link is entered. Drives the delivery QR.
 *
 * Props:
 *   value: string
 *   onChange(value: string): fires with the raw string
 *   testId: data-testid for the underlying input (kept stable per form)
 */
export const MapsLinkInput = ({ value, onChange, testId = 'maps-link-input' }) => {
  const v = (value || '').trim();
  const hasValue = v.length > 0;
  const valid = hasValue && /^https?:\/\//i.test(v) && isValidMapsLink(v);
  const invalid = hasValue && !valid;

  return (
    <div
      className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-3 shadow-[0_1px_0_rgba(2,132,199,0.06)]"
      data-testid={`${testId}-card`}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-white shrink-0 shadow-sm">
          <Navigation className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sky-900 leading-tight">Google Maps Location Link</p>
          <p className="text-[11px] text-sky-700/80 leading-tight">Paste a Maps share link — powers the delivery QR when GPS isn't set.</p>
        </div>
        {valid && (
          <a
            href={v}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-white border border-sky-200 hover:bg-sky-100 hover:border-sky-300 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
            data-testid={`${testId}-open`}
          >
            <ExternalLink className="h-3 w-3" /> Open
          </a>
        )}
      </div>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500 pointer-events-none" />
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://maps.app.goo.gl/..."
          className={`pl-9 bg-white ${invalid ? 'border-rose-300 focus:border-rose-400' : 'border-sky-200 focus:border-sky-400'}`}
          data-testid={testId}
        />
      </div>
      {invalid && (
        <p className="mt-1.5 text-[11px] font-medium text-rose-600" data-testid={`${testId}-error`}>
          Enter a valid Google Maps URL (e.g. https://maps.app.goo.gl/...).
        </p>
      )}
    </div>
  );
};

export default MapsLinkInput;
