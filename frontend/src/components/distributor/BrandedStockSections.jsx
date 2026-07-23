import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tags, Package, Factory, Warehouse, UserRound, Pencil } from 'lucide-react';
import AdjustChildQtyDialog from './AdjustChildQtyDialog';

const fmt = (v) => (Number(v) || 0).toLocaleString('en-IN');

function LocationChips({ locations = [] }) {
  if (!locations.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {locations.map((l, i) => (
        <span
          key={l.location_id || i}
          className="inline-flex items-center gap-1 text-[10px] text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5"
          data-testid={`branded-loc-chip-${l.location_id || i}`}
        >
          {l.is_factory ? <Factory className="h-2.5 w-2.5 text-purple-500" /> : <Warehouse className="h-2.5 w-2.5 text-blue-500" />}
          <span className="truncate max-w-[140px]">{l.location_name}</span>
          <span className="font-semibold tabular-nums">{fmt(l.quantity)}</span>
        </span>
      ))}
    </div>
  );
}

function ChildRow({ entry, qty, onAdjust }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2" data-testid={`branded-child-row-${entry.child_sku_id || 'unclassified'}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm text-slate-700 font-medium truncate">{entry.child_sku_name}</span>
          {entry.child_sku_code && (
            <span className="font-mono text-[10px] text-slate-400">{entry.child_sku_code}</span>
          )}
        </div>
        <LocationChips locations={entry.locations} />
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`text-sm font-bold tabular-nums ${entry.quantity > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
          {qty(entry.quantity)}
        </span>
        {onAdjust && (entry.locations || []).length > 0 && (
          <button
            onClick={onAdjust}
            title="Adjust quantity"
            className="p-1 rounded hover:bg-indigo-50 text-slate-300 hover:text-indigo-600 transition-colors"
            data-testid={`adjust-child-qty-btn-${entry.child_sku_id}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Branded Stock by Customer — one section per parent SKU with customer
 * branding enabled. Splits live warehouse stock into a Generic bucket and
 * per-customer branded buckets. Used by BOTH the per-distributor Stock
 * Dashboard tab and the global Stock Dashboard page.
 */
export function BrandedStockSections({ sections = [], pkgBySku = {}, viewCrates = false, onChanged }) {
  const [adjust, setAdjust] = useState(null); // { sec, entry }
  if (!sections.length) return null;

  const qtyFor = (sec) => (q) => {
    const pkg = pkgBySku[sec.sku_id];
    const b = Number(q) || 0;
    if (viewCrates && pkg && Number(pkg.units) > 1) {
      const n = b / Number(pkg.units);
      return `${(Number.isInteger(n) ? n : Number(n.toFixed(1))).toLocaleString('en-IN')} ${pkg.name || 'crates'}`;
    }
    const baseUnit = (pkg?.baseUnit && pkg.baseUnit !== 'units') ? pkg.baseUnit : (sec.base_unit_name || pkg?.baseUnit || 'units');
    return `${fmt(b)} ${baseUnit}`;
  };

  return (
    <div className="space-y-4">
      {sections.map((sec) => {
        const qty = qtyFor(sec);
        return (
          <Card key={sec.sku_id} data-testid={`branded-stock-section-${sec.sku_id}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <Tags className="h-4 w-4 text-indigo-600" />
                Branded Stock — {sec.sku_name}
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 ml-1" variant="outline">
                  {qty(sec.total_quantity)} total
                </Badge>
              </CardTitle>
              <CardDescription>
                Generic vs customer-branded classification · live warehouse stock
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Generic bucket */}
                <div className="rounded-lg border border-emerald-200 overflow-hidden self-start" data-testid={`branded-generic-${sec.sku_id}`}>
                  <div className="bg-emerald-50 px-3 py-2 flex items-center justify-between border-b border-emerald-200">
                    <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" /> Generic Branding
                    </span>
                    <span className="text-xs font-bold text-emerald-800 tabular-nums">{qty(sec.generic_total)}</span>
                  </div>
                  {sec.generic.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {sec.generic.map((e, i) => (
                        <ChildRow key={e.child_sku_id || `un-${i}`} entry={e} qty={qty} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic text-center py-4">No generic stock on hand</p>
                  )}
                </div>

                {/* Customer-branded buckets */}
                <div className="space-y-3" data-testid={`branded-customers-${sec.sku_id}`}>
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
                      <UserRound className="h-3.5 w-3.5" /> Customer Branded
                    </span>
                    <span className="text-xs font-bold text-indigo-800 tabular-nums">{qty(sec.customer_total)}</span>
                  </div>
                  {sec.customers.length > 0 ? (
                    sec.customers.map((cust) => (
                      <div
                        key={cust.customer_account_id || cust.customer_name}
                        className="rounded-lg border border-indigo-200 overflow-hidden"
                        data-testid={`branded-customer-${sec.sku_id}-${cust.customer_account_id || 'unknown'}`}
                      >
                        <div className="bg-indigo-50 px-3 py-2 flex items-center justify-between border-b border-indigo-200">
                          <span className="text-xs font-semibold text-indigo-800 truncate">{cust.customer_name}</span>
                          <span className={`text-xs font-bold tabular-nums ${cust.total_quantity > 0 ? 'text-indigo-800' : 'text-indigo-300'}`}>
                            {qty(cust.total_quantity)}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {cust.children.map((e) => (
                            <ChildRow key={e.child_sku_id} entry={e} qty={qty}
                              onAdjust={onChanged ? () => setAdjust({ sec, entry: e }) : undefined} />
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic text-center py-4">No customer-branded child SKUs</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {adjust && (
        <AdjustChildQtyDialog
          skuId={adjust.sec.sku_id}
          skuName={adjust.sec.sku_name}
          entry={adjust.entry}
          onClose={() => setAdjust(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
