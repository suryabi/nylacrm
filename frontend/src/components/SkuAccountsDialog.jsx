import React, { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';

const inr = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// Which accounts bought this SKU in the selected period, ranked by volume.
export const SkuAccountsDialog = ({ sku, accounts = [], periodLabel, open, onClose }) => {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return accounts.filter((a) => !s || [a.name, a.city, a.key].some((x) => (x || '').toLowerCase().includes(s)));
  }, [accounts, q]);
  const totalUnits = accounts.reduce((a, r) => a + (r.units || 0), 0);
  const totalRevenue = accounts.reduce((a, r) => a + (r.revenue || 0), 0);
  const maxUnits = Math.max(1, ...accounts.map((a) => a.units || 0));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden" data-testid="sku-accounts-dialog">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700"><Users className="h-4 w-4" /></span>
            <span className="truncate" data-testid="sku-accounts-title">{sku}</span>
          </DialogTitle>
          <DialogDescription data-testid="sku-accounts-subtitle">
            {accounts.length} account{accounts.length === 1 ? '' : 's'} · {totalUnits.toLocaleString('en-IN')} units · {inr(totalRevenue)}{periodLabel ? ` · ${periodLabel}` : ''}
          </DialogDescription>
        </DialogHeader>
        {accounts.length > 6 && (
          <div className="relative px-6 pb-3">
            <Search className="pointer-events-none absolute left-[2.1rem] top-2.5 h-4 w-4 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account or city" className="h-9 pl-8" data-testid="sku-accounts-search" />
          </div>
        )}
        <div className="max-h-[60vh] overflow-y-auto border-t border-slate-100">
          <table className="w-full text-sm" data-testid="sku-accounts-table">
            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-2 text-left font-semibold">#</th>
                <th className="py-2 text-left font-semibold">Account</th>
                <th className="px-3 py-2 text-right font-semibold">Units</th>
                <th className="px-3 py-2 text-right font-semibold">Share</th>
                <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                <th className="px-6 py-2 text-right font-semibold">Invoices</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a, i) => (
                <tr key={a.key} className={`border-t border-slate-100 ${i % 2 ? 'bg-slate-50/60' : 'bg-white'}`} data-testid={`sku-account-row-${a.account_uuid || a.key}`}>
                  <td className="px-6 py-2.5 text-xs text-slate-400 tabular-nums">{i + 1}</td>
                  <td className="py-2.5">
                    <p className="font-medium text-slate-800 truncate max-w-[18rem]" title={a.name}>{a.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="h-1 w-24 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-violet-500" style={{ width: `${Math.round((a.units || 0) / maxUnits * 100)}%` }} /></span>
                      {a.city && <span className="text-[11px] text-slate-400">{a.city}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800 tabular-nums" data-testid={`sku-account-units-${a.account_uuid || a.key}`}>{(a.units || 0).toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums">{a.units_pct}%</td>
                  <td className="px-3 py-2.5 text-right text-emerald-700 tabular-nums">{inr(a.revenue)}</td>
                  <td className="px-6 py-2.5 text-right text-slate-500 tabular-nums">{a.invoices}</td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-500" data-testid="sku-accounts-empty">{accounts.length ? 'No account matches.' : 'No invoiced accounts for this SKU in the selected period.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
};
