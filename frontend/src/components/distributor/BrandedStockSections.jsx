import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tags, Package, Factory, Warehouse, UserRound, Pencil } from 'lucide-react';
import AdjustChildQtyDialog from './AdjustChildQtyDialog';

const fmt = (v) => (Number(v) || 0).toLocaleString('en-IN');

const METRIC_COLS = [
  { key: 'received', label: 'Received', cls: 'text-blue-600' },
  { key: 'delivered', label: 'Delivered', cls: 'text-emerald-600' },
  { key: 'reserved', label: 'Reserved', cls: 'text-amber-600', tip: 'Committed to open Stock Out orders — not available for other orders' },
  { key: 'empty_bottles', label: 'Empty Bottles', cls: 'text-emerald-600', tip: 'Empty / Reusable + FOC units returned for recycling' },
  { key: 'product_returns', label: 'Product Ret.', cls: 'text-amber-600', tip: 'Damaged + Expired — unsellable product' },
  { key: 'factory_returns', label: 'Factory Ret.', cls: 'text-purple-600' },
  { key: 'wh_stock', label: 'Wh. Stock', cls: 'text-teal-600', tip: 'Live classified warehouse stock' },
  { key: 'available', label: 'Available', cls: 'text-indigo-700 font-bold', tip: 'Available = Wh. Stock − Reserved' },
];

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

/**
 * Branded Stock by Customer — one section per parent SKU with customer
 * branding enabled. Child SKUs (Generic + customer-branded) are rendered in a
 * TABLE with the same flow columns as the parent Stock-by-SKU table.
 * Used by BOTH the per-distributor Stock Dashboard tab and the global page.
 */
export function BrandedStockSections({ sections = [], pkgBySku = {}, viewCrates = false, onChanged }) {
  const [adjust, setAdjust] = useState(null); // { sec, entry }
  if (!sections.length) return null;

  const qtyFor = (sec) => (q) => {
    const pkg = pkgBySku[sec.sku_id];
    const b = Number(q) || 0;
    if (viewCrates && pkg && Number(pkg.units) > 1) {
      const n = b / Number(pkg.units);
      return `${(Number.isInteger(n) ? n : Number(n.toFixed(1))).toLocaleString('en-IN')}`;
    }
    return fmt(b);
  };

  const unitLabel = (sec) => {
    const pkg = pkgBySku[sec.sku_id];
    if (viewCrates && pkg && Number(pkg.units) > 1) return pkg.name || 'crates';
    return (pkg?.baseUnit && pkg.baseUnit !== 'units') ? pkg.baseUnit : (sec.base_unit_name || pkg?.baseUnit || 'units');
  };

  return (
    <div className="space-y-4">
      {sections.map((sec) => {
        const qty = qtyFor(sec);
        // Flatten: generic rows first, then customer-branded rows.
        const rows = [
          ...(sec.generic || []).map((e) => ({ ...e, _branding: 'generic' })),
          ...(sec.customers || []).flatMap((cust) =>
            (cust.children || []).map((e) => ({
              ...e, _branding: 'customer',
              _customerName: cust.customer_name,
              _customerId: cust.customer_account_id,
            }))
          ),
        ];
        const hasMetrics = rows.some((r) => r.metrics);
        const totals = {};
        if (hasMetrics) {
          METRIC_COLS.forEach(({ key }) => {
            totals[key] = rows.reduce((s, r) => s + (Number(r.metrics?.[key]) || 0), 0);
          });
        }
        return (
          <Card key={sec.sku_id} data-testid={`branded-stock-section-${sec.sku_id}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <Tags className="h-4 w-4 text-indigo-600" />
                Branded Stock — {sec.sku_name}
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 ml-1" variant="outline">
                  {qty(sec.total_quantity)} {unitLabel(sec)} total
                </Badge>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  Generic {qty(sec.generic_total)}
                </Badge>
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                  Customer {qty(sec.customer_total)}
                </Badge>
              </CardTitle>
              <CardDescription>
                Generic vs customer-branded child SKUs · quantities in {unitLabel(sec)}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid={`branded-stock-table-${sec.sku_id}`}>
                  <thead>
                    <tr className="bg-slate-50 border-y text-xs text-slate-500 uppercase">
                      <th className="text-left p-3 pl-4">Child SKU</th>
                      <th className="text-left p-3">Branding</th>
                      {hasMetrics
                        ? METRIC_COLS.map(({ key, label, cls, tip }) => (
                          <th key={key} className="text-right p-3"><span className={cls} title={tip}>{label}</span></th>
                        ))
                        : <th className="text-right p-3"><span className="text-teal-600">Wh. Stock</span></th>}
                      {onChanged && <th className="p-3 w-10" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr><td colSpan={12} className="text-center py-6 text-xs text-slate-400 italic">No child SKU stock on hand</td></tr>
                    )}
                    {rows.map((e, i) => (
                      <tr
                        key={e.child_sku_id || `un-${i}`}
                        className={`border-b last:border-0 ${i % 2 === 1 ? 'bg-slate-50/30' : ''}`}
                        data-testid={`branded-child-row-${e.child_sku_id || 'unclassified'}`}
                      >
                        <td className="p-3 pl-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm text-slate-700 font-medium">{e.child_sku_name}</span>
                            {e.child_sku_code && <span className="font-mono text-[10px] text-slate-400">{e.child_sku_code}</span>}
                          </div>
                          <LocationChips locations={e.locations} />
                        </td>
                        <td className="p-3">
                          {e._branding === 'generic' ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                              <Package className="h-2.5 w-2.5 mr-1" /> Generic
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] max-w-[180px] truncate">
                              <UserRound className="h-2.5 w-2.5 mr-1 shrink-0" /> {e._customerName}
                            </Badge>
                          )}
                        </td>
                        {hasMetrics
                          ? METRIC_COLS.map(({ key, cls }) => {
                            const v = Number(e.metrics?.[key]) || 0;
                            return (
                              <td key={key} className={`p-3 text-right font-medium tabular-nums ${v !== 0 ? cls : 'text-slate-300'}`}
                                data-testid={`branded-cell-${key}-${e.child_sku_id || 'unclassified'}`}>
                                {v !== 0 ? qty(v) : '-'}
                              </td>
                            );
                          })
                          : (
                            <td className={`p-3 text-right font-medium tabular-nums ${e.quantity > 0 ? 'text-teal-600' : 'text-slate-300'}`}>
                              {e.quantity > 0 ? qty(e.quantity) : '-'}
                            </td>
                          )}
                        {onChanged && (
                          <td className="p-3 text-right">
                            {e._branding === 'customer' && (e.locations || []).length > 0 && (
                              <button
                                onClick={() => setAdjust({ sec, entry: e })}
                                title="Adjust quantity"
                                className="p-1 rounded hover:bg-indigo-50 text-slate-300 hover:text-indigo-600 transition-colors"
                                data-testid={`adjust-child-qty-btn-${e.child_sku_id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {rows.length > 0 && hasMetrics && (
                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 font-semibold text-sm">
                        <td className="p-3 pl-4" colSpan={2}>Total ({rows.length} child SKUs)</td>
                        {METRIC_COLS.map(({ key, cls }) => (
                          <td key={key} className={`p-3 text-right tabular-nums ${cls}`} data-testid={`branded-total-${key}-${sec.sku_id}`}>
                            {qty(totals[key])}
                          </td>
                        ))}
                        {onChanged && <td />}
                      </tr>
                    </tfoot>
                  )}
                </table>
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
