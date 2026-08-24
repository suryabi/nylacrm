import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { MousePointerClick, Table2, Sigma, Download, Truck, AlertTriangle, Columns3 } from 'lucide-react';

const COLUMNS = [
  { name: 'Account Name', how: 'From the Accounts module. A blue "NEW" pill appears when the account was on-boarded within the last 7 days — a reminder to plan stock for it.' },
  { name: 'Territory / State / City', how: 'Taken from the account profile.' },
  { name: 'On-boarded Date', how: 'The date the account was activated. Hidden by default — enable via the Columns menu.' },
  { name: 'Account Age (Days)', how: 'Days elapsed since the account was activated. Hidden by default.' },
  { name: 'Avg Order Frequency (Days)', how: 'Days between the first and latest delivery ÷ (number of orders − 1). Needs at least 2 completed deliveries.' },
  { name: 'No. of Orders', how: 'Total completed deliveries to date. Hidden by default.' },
  { name: 'First / Latest Delivery Date', how: 'From completed stock-out deliveries. The latest date carries a recency pill: dark green ≤1 week, light green ≤2 weeks, amber ≤3 weeks, red 4+ weeks since the last order.' },
  { name: 'Last 4 Delivery Dates / Quantities (Crates)', how: 'The four most recent completed deliveries, newest first. Bottle quantities are converted to crates using each SKU\'s bottles-per-crate.' },
  { name: 'Last Order Quantity (Crates)', how: 'Crates delivered in the most recent order.' },
  { name: 'Last Ordered SKU', how: 'Parent SKU(s) in the most recent delivery. Hidden by default.' },
  { name: 'Bi-weekly Volume (Crates)', how: 'Expected Monthly Volume ÷ 2. Hidden by default.' },
  { name: 'Expected Monthly Volume (Crates)', how: 'Editable — click the cell and type your estimate for the account\'s monthly volume.' },
  { name: 'Actual Monthly Consumption (Crates)', how: 'Crates delivered in the most recent 4 weeks. Until 30 days have passed since the account\'s first delivery it shows "Available in X days" instead.' },
  { name: 'Stock at Hand (Crates)', how: 'Live warehouse stock of the account\'s branded child SKU (from its last order, at the warehouse that last served it) — the same figure as the WH Stock row on the Global Stock Dashboard, in crates. Editable: type your own figure to override; clear the cell to return to the live value. The cell turns RED when stock is below 15 days of the account\'s order volume (½ of monthly consumption).' },
  { name: 'Your custom columns', how: 'Added via "Add Column" — free text, numbers, or spreadsheet-style formulas referencing other columns (marked with a Σ).' },
];

const ACTIONS = [
  { icon: MousePointerClick, title: 'Edit cells', text: 'Click any highlighted cell (Expected Monthly Volume, Stock at Hand, custom columns) to type a value. Enter saves, Esc cancels.' },
  { icon: Columns3, title: 'Arrange the grid', text: 'Sort by clicking a header, drag headers to reorder, drag the header edge to resize, and show/hide columns from the Columns menu. The Account Name column and totals row stay frozen while you scroll.' },
  { icon: Sigma, title: 'Formulas', text: 'Add Column → Formula for spreadsheet-style calculations (e.g. =Expected Monthly Volume - Actual Monthly Consumption). A live preview shows the result while you type.' },
  { icon: AlertTriangle, title: 'Needs attention', text: 'One click filters to accounts that are red-flagged for low stock at hand or on-boarded within the last week.' },
  { icon: Download, title: 'Excel export', text: 'Downloads the grid with totals, custom columns and the red low-stock flags as a branded spreadsheet.' },
  { icon: Truck, title: 'Consignment Planner', text: 'Below the grid — enter truck capacity and it plans the next 3 consignments with suggested dates from ordering patterns, current warehouse stock and your filters.' },
];

export const VolumeGridHelp = ({ open, onOpenChange }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="vg-help-dialog">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Table2 className="h-5 w-5 text-[#002FA7]" /> Volume Tracking — how it works
        </DialogTitle>
        <DialogDescription>
          A live, spreadsheet-style view of every account's ordering volume. Delivery data updates automatically; estimates and custom columns are yours to edit.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">What you can do</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {ACTIONS.map((a) => (
              <div key={a.title} className="flex gap-2.5 rounded-md border border-slate-200 bg-slate-50/60 p-2.5">
                <a.icon className="h-4 w-4 text-[#002FA7] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{a.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">How each column is derived</p>
          <div className="border rounded-md divide-y divide-slate-100">
            {COLUMNS.map((c) => (
              <div key={c.name} className="grid grid-cols-[190px_1fr] gap-3 p-2.5">
                <p className="text-xs font-semibold text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{c.how}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Colour signals</p>
          <ul className="text-xs text-slate-500 space-y-1 leading-relaxed">
            <li><span className="font-semibold text-[#002FA7]">Blue account name + NEW pill</span> — on-boarded within the last 7 days; plan initial stock.</li>
            <li><span className="font-semibold text-red-700">Red Stock at Hand cell</span> — stock below 15 days of the account's order volume; restock soon.</li>
            <li><span className="font-semibold text-emerald-700">Green / amber / red recency pills</span> — how recently the account last ordered (1, 2, 3, 4+ weeks).</li>
            <li><span className="font-semibold text-slate-600">"Available in X days"</span> — Actual Monthly Consumption unlocks 30 days after the first delivery.</li>
          </ul>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
