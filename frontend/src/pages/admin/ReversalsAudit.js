import React from 'react';
import { ReversalsLog } from '../../components/reversals/ReversalsLog';

export default function ReversalsAudit() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-5 sm:p-7" data-testid="reversals-audit-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 md:text-3xl">Reversals Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every reversed Stock-Out delivery and Promotional Stock-Out across all distributors — for finance
          reconciliation and catching accidental entries.
        </p>
      </div>
      <ReversalsLog />
    </div>
  );
}
