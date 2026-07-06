import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Shown on every Print Request create/edit surface to reinforce correct usage.
export const PrintRequestOrderBanner = () => (
  <div
    className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5"
    data-testid="print-order-banner"
  >
    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
    <p className="text-xs text-amber-800 leading-snug">
      <span className="font-semibold">Raise a Print Request only for confirmed customer orders.</span>{' '}
      Do not create one for design reviews or sample approvals.
    </p>
  </div>
);

export default PrintRequestOrderBanner;
