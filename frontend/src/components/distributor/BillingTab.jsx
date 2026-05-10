import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  RefreshCw, FileText, Receipt, Eye, Trash2, Calendar,
  CheckCircle, FileDown, Loader2, Settings, Download,
} from 'lucide-react';

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
];
const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2];

// Accounting-style number formatter: always 2 decimals, comma grouping, no currency symbol
const fmt = (v) => (Number(v) || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
// Numbers that may be negative — render with parentheses (accounting convention).
const fmtSigned = (v) => {
  const n = Number(v) || 0;
  if (n < 0) return `(${fmt(Math.abs(n))})`;
  return fmt(n);
};

export default function BillingTab({
  distributor, canManage, canDelete,
  debitCreditNotes, notesLoading, fetchNotes,
  viewNoteDetail, getNoteStatusBadge, getSettlementStatusBadge,
  setActiveTab, setDeleteTarget, API_URL, token,
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [monthlyData, setMonthlyData] = useState(null);
  const [loadingMonthlyData, setLoadingMonthlyData] = useState(false);
  const [showGenerateNoteDialog, setShowGenerateNoteDialog] = useState(false);
  const [generatingNote, setGeneratingNote] = useState(false);
  const [noteRemarks, setNoteRemarks] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(null);

  useEffect(() => {
    if (distributor?.id) fetchMonthlyReconciliationData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear, distributor?.id]);

  const fetchMonthlyReconciliationData = async () => {
    if (!distributor?.id) return;
    setLoadingMonthlyData(true);
    try {
      const authToken = token || localStorage.getItem('token');
      const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
      const response = await fetch(
        `${API_URL}/api/distributors/${distributor.id}/monthly-reconciliation?month=${selectedMonth}&year=${selectedYear}`,
        { headers: { 'Authorization': `Bearer ${authToken}`, 'X-Tenant-ID': tenantId } }
      );
      if (response.ok) setMonthlyData(await response.json());
    } catch (error) {
      console.error('Failed to fetch reconciliation:', error);
    } finally {
      setLoadingMonthlyData(false);
    }
  };

  const handleGenerateNote = async () => {
    if (!monthlyData || (monthlyData.net_adjustment_amount || 0) === 0) return;
    setGeneratingNote(true);
    try {
      const authToken = token || localStorage.getItem('token');
      const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
      const response = await fetch(
        `${API_URL}/api/distributors/${distributor.id}/generate-monthly-note`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json', 'X-Tenant-ID': tenantId },
          body: JSON.stringify({ month: selectedMonth, year: selectedYear, remarks: noteRemarks }),
        }
      );
      if (response.ok) {
        setShowGenerateNoteDialog(false);
        setNoteRemarks('');
        fetchMonthlyReconciliationData();
        if (fetchNotes) fetchNotes();
      } else {
        const error = await response.json();
        alert(`Failed: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      alert('Failed to generate note');
    } finally {
      setGeneratingNote(false);
    }
  };

  const handleDownloadPdf = async (note) => {
    setDownloadingPdf(note.id);
    try {
      const authToken = token || localStorage.getItem('token');
      const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
      const response = await fetch(`${API_URL}/api/distributors/${distributor.id}/notes/${note.id}/download`, {
        headers: { 'Authorization': `Bearer ${authToken}`, 'X-Tenant-ID': tenantId },
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `${note.note_number || 'note'}.pdf`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      alert('Failed to download PDF');
    } finally {
      setDownloadingPdf(null);
    }
  };

  // ──────── Derived data ────────
  const periodLabel = `${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear}`;
  const customerRows = monthlyData?.customer_reconciliation || [];
  const customerTotals = monthlyData?.customer_reconciliation_totals || {
    delivery_count: 0, customer_order_value: 0, credit_notes_paid: 0,
    customer_invoice_value: 0, transfer_price_value: 0,
  };
  const allSettlements = [
    ...(monthlyData?.unreconciled_settlements || []),
    ...(monthlyData?.reconciled_settlements || []),
  ].sort((a, b) => (a.settlement_number || '').localeCompare(b.settlement_number || ''));

  const settlementNet = (s) => {
    const t = s.stockout_totals || {};
    const nb = t.net_billable || 0;
    const bat = t.billed_at_transfer || 0;
    const dc = t.direct_credit_issued || 0;
    const fr = s.total_factory_return_credit || 0;
    return nb - bat - dc - fr;
  };

  const settlementTotals = allSettlements.reduce((acc, s) => {
    const t = s.stockout_totals || {};
    acc.customer_order_value += t.customer_order_value || 0;
    acc.distributor_margin += t.distributor_margin || 0;
    acc.actual_billable += t.actual_billable || 0;
    acc.credits += (t.credit_applied || 0) + (t.direct_credit_issued || 0);
    acc.billed_at_transfer += t.billed_at_transfer || 0;
    acc.factory_returns += s.total_factory_return_credit || 0;
    acc.net += settlementNet(s);
    return acc;
  }, { customer_order_value: 0, distributor_margin: 0, actual_billable: 0, credits: 0, billed_at_transfer: 0, factory_returns: 0, net: 0 });

  const netSettlement = monthlyData?.net_adjustment_amount || 0;
  const noteType = monthlyData?.settlement_note_type || 'none';

  const downloadCustomerCsv = () => {
    const header = ['Customer Name', 'Delivery Count', 'Customer Order Value', 'Credit Notes Paid', 'Customer Invoice Value', 'Transfer Price Value'];
    const rows = customerRows.map(r => [
      r.account_name, r.delivery_count, r.customer_order_value, r.credit_notes_paid, r.customer_invoice_value, r.transfer_price_value,
    ]);
    rows.push([
      'TOTAL', customerTotals.delivery_count, customerTotals.customer_order_value,
      customerTotals.credit_notes_paid, customerTotals.customer_invoice_value, customerTotals.transfer_price_value,
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `customer-reconciliation-${selectedYear}-${String(selectedMonth).padStart(2, '0')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const noData = customerRows.length === 0 && allSettlements.length === 0;

  return (
    <div className="space-y-6" data-testid="reconciliation-tab">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Reconciliation</h2>
          <p className="text-sm text-slate-500 mt-1">
            {periodLabel} · {distributor?.distributor_name || ''} {distributor?.distributor_code ? `· ${distributor.distributor_code}` : ''}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setActiveTab && setActiveTab('margins')} className="text-slate-500" data-testid="goto-margins-btn">
          <Settings className="h-4 w-4 mr-1.5" />
          Margins
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap" data-testid="reconciliation-filters">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
          <Calendar className="h-4 w-4 text-slate-400" />
          <Label className="text-xs uppercase tracking-wider text-slate-500 font-medium">Period</Label>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          className="border border-slate-300 rounded-md px-3 py-2 bg-white text-sm font-medium focus:ring-2 focus:ring-slate-400 focus:outline-none"
          data-testid="recon-month-select"
        >
          {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="border border-slate-300 rounded-md px-3 py-2 bg-white text-sm font-medium focus:ring-2 focus:ring-slate-400 focus:outline-none"
          data-testid="recon-year-select"
        >
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={fetchMonthlyReconciliationData} disabled={loadingMonthlyData} data-testid="recon-refresh-btn">
          {loadingMonthlyData ? <RefreshCw className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-1.5" />Refresh</>}
        </Button>
      </div>

      {/* Loading */}
      {loadingMonthlyData && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
          </CardContent>
        </Card>
      )}

      {/* No data */}
      {!loadingMonthlyData && noData && (
        <Card>
          <CardContent className="text-center py-16">
            <FileText className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500">No reconciliation data for {periodLabel}.</p>
            <p className="text-xs text-slate-400 mt-1">Generate and approve settlements from the Settlements tab to populate this view.</p>
          </CardContent>
        </Card>
      )}

      {/* ────── TABLE 1 — CUSTOMER RECONCILIATION ────── */}
      {!loadingMonthlyData && customerRows.length > 0 && (
        <Card data-testid="customer-reconciliation-card">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                  <span className="inline-block w-1 h-5 bg-slate-700 rounded-sm" />
                  Customer Reconciliation
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-1">
                  Distributor pays the supplier <strong>Transfer Price Value</strong> against the original Stock-In invoice for this period.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={downloadCustomerCsv} data-testid="download-customer-csv">
                <Download className="h-4 w-4 mr-1.5" />Export
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="customer-reconciliation-table">
                <thead>
                  <tr className="bg-slate-100 border-y border-slate-200 text-[11px] uppercase tracking-wider text-slate-600">
                    <th className="text-left px-4 py-2.5 font-semibold">Customer Name</th>
                    <th className="text-right px-4 py-2.5 font-semibold w-24">Deliveries</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Customer Order Value</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Credit Notes Paid</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Customer Invoice Value</th>
                    <th className="text-right px-4 py-2.5 font-semibold border-l-2 border-slate-300 bg-slate-200/60">Transfer Price Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerRows.map((r, idx) => (
                    <tr key={r.account_id} className={idx % 2 === 1 ? 'bg-slate-50/40' : ''} data-testid={`customer-row-${r.account_id}`}>
                      <td className="px-4 py-2.5 text-slate-900 font-medium">{r.account_name}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">{r.delivery_count}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">{fmt(r.customer_order_value)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700 tabular-nums">{r.credit_notes_paid > 0 ? `(${fmt(r.credit_notes_paid)})` : fmt(0)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-900 font-medium tabular-nums">{fmt(r.customer_invoice_value)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-900 font-semibold tabular-nums border-l-2 border-slate-200 bg-slate-50/60">{fmt(r.transfer_price_value)}</td>
                    </tr>
                  ))}
                  {/* Summary row */}
                  <tr className="bg-slate-800 text-white font-semibold border-t-2 border-slate-900" data-testid="customer-summary-row">
                    <td className="px-4 py-3 text-[11px] uppercase tracking-wider">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">{customerTotals.delivery_count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(customerTotals.customer_order_value)}</td>
                    <td className="px-4 py-3 text-right text-emerald-300 tabular-nums">{customerTotals.credit_notes_paid > 0 ? `(${fmt(customerTotals.credit_notes_paid)})` : fmt(0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(customerTotals.customer_invoice_value)}</td>
                    <td className="px-4 py-3 text-right tabular-nums border-l-2 border-slate-600 bg-slate-900">{fmt(customerTotals.transfer_price_value)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Pay-to-supplier callout */}
            <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 text-sm flex items-center justify-between" data-testid="pay-supplier-callout">
              <div>
                <span className="text-amber-900 font-semibold">Distributor pays Supplier</span>
                <span className="text-amber-700 text-xs ml-2">— against original Stock-In invoice for {periodLabel}</span>
              </div>
              <span className="text-amber-900 font-bold text-lg tabular-nums" data-testid="pay-supplier-amount">
                ₹ {fmt(customerTotals.transfer_price_value)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ────── TABLE 2 — SETTLEMENTS (independent adjustment via Debit/Credit Note) ────── */}
      {!loadingMonthlyData && allSettlements.length > 0 && (
        <Card data-testid="settlements-card">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                  <span className="inline-block w-1 h-5 bg-slate-700 rounded-sm" />
                  Settlements
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-1">
                  Adjusted independently via <strong>Debit / Credit Note</strong>. Kept separate from Transfer Price Value above.
                </CardDescription>
              </div>
              {canManage && netSettlement !== 0 && noteType !== 'none' && (monthlyData?.total_unreconciled || 0) > 0 && (
                <Button
                  size="sm"
                  onClick={() => setShowGenerateNoteDialog(true)}
                  className={noteType === 'debit' ? 'bg-amber-700 hover:bg-amber-800 text-white' : 'bg-emerald-700 hover:bg-emerald-800 text-white'}
                  data-testid="generate-note-btn"
                >
                  <Receipt className="h-4 w-4 mr-1.5" />
                  Generate {noteType === 'debit' ? 'Debit' : 'Credit'} Note · ₹{fmt(Math.abs(netSettlement))}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="settlements-table">
                <thead>
                  <tr className="bg-slate-100 border-y border-slate-200 text-[11px] uppercase tracking-wider text-slate-600">
                    <th className="text-left px-4 py-2.5 font-semibold">Settlement #</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Customer</th>
                    <th className="text-right px-4 py-2.5 font-semibold w-20">Deliveries</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Customer Order Value</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Distributor Margin</th>
                    <th className="text-right px-4 py-2.5 font-semibold border-l border-slate-300 bg-slate-200/40">Actual Billable</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Credits</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Billed at Transfer</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Factory Returns</th>
                    <th className="text-right px-4 py-2.5 font-semibold border-l-2 border-slate-300 bg-slate-200/60">Net Settlement</th>
                    <th className="text-center px-4 py-2.5 font-semibold w-28">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allSettlements.map((s, idx) => {
                    const t = s.stockout_totals || {};
                    const cov = t.customer_order_value || 0;
                    const margin = t.distributor_margin || 0;
                    const ab = t.actual_billable || 0;
                    const credits = (t.credit_applied || 0) + (t.direct_credit_issued || 0);
                    const bat = t.billed_at_transfer || 0;
                    const fr = s.total_factory_return_credit || 0;
                    const net = settlementNet(s);
                    return (
                      <tr key={s.id} className={idx % 2 === 1 ? 'bg-slate-50/40' : ''} data-testid={`settlement-row-${s.id}`}>
                        <td className="px-4 py-2.5 text-slate-900 font-medium tabular-nums">{s.settlement_number || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-700">{s.account_name || '—'}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">{s.total_deliveries || 0}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">{fmt(cov)}</td>
                        <td className="px-4 py-2.5 text-right text-blue-700 tabular-nums">{margin > 0 ? `(${fmt(margin)})` : fmt(0)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-900 font-medium tabular-nums border-l border-slate-200 bg-slate-50/60">{fmt(ab)}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-700 tabular-nums">{credits > 0 ? `(${fmt(credits)})` : fmt(0)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">{bat > 0 ? `(${fmt(bat)})` : fmt(0)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">{fr > 0 ? `(${fmt(fr)})` : fmt(0)}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold tabular-nums border-l-2 border-slate-200 bg-slate-50/60 ${net > 0 ? 'text-amber-700' : net < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {fmtSigned(net)}
                          {net !== 0 && <span className="ml-1 text-[10px] uppercase tracking-wider opacity-70">{net > 0 ? 'DR' : 'CR'}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {getSettlementStatusBadge ? getSettlementStatusBadge(s.status) : <Badge variant="outline">{s.status}</Badge>}
                          {s.reconciled && <Badge variant="outline" className="ml-1 bg-green-50 text-green-700 border-green-200 text-[10px]">Reconciled</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Summary row */}
                  <tr className="bg-slate-800 text-white font-semibold border-t-2 border-slate-900" data-testid="settlement-summary-row">
                    <td className="px-4 py-3 text-[11px] uppercase tracking-wider" colSpan={2}>Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">{allSettlements.reduce((a, s) => a + (s.total_deliveries || 0), 0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(settlementTotals.customer_order_value)}</td>
                    <td className="px-4 py-3 text-right text-blue-300 tabular-nums">{settlementTotals.distributor_margin > 0 ? `(${fmt(settlementTotals.distributor_margin)})` : fmt(0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums border-l border-slate-600 bg-slate-900/60">{fmt(settlementTotals.actual_billable)}</td>
                    <td className="px-4 py-3 text-right text-emerald-300 tabular-nums">{settlementTotals.credits > 0 ? `(${fmt(settlementTotals.credits)})` : fmt(0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{settlementTotals.billed_at_transfer > 0 ? `(${fmt(settlementTotals.billed_at_transfer)})` : fmt(0)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{settlementTotals.factory_returns > 0 ? `(${fmt(settlementTotals.factory_returns)})` : fmt(0)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums border-l-2 border-slate-600 bg-slate-900 ${settlementTotals.net > 0 ? 'text-amber-300' : settlementTotals.net < 0 ? 'text-emerald-300' : ''}`}>
                      {fmtSigned(settlementTotals.net)}
                      {settlementTotals.net !== 0 && <span className="ml-1 text-[10px] uppercase tracking-wider opacity-70">{settlementTotals.net > 0 ? 'DR' : 'CR'}</span>}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tbody>
              </table>
            </div>
            {/* Settlement note callout */}
            <div className={`px-4 py-3 border-t text-sm flex items-center justify-between ${noteType === 'debit' ? 'bg-amber-50 border-amber-200' : noteType === 'credit' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`} data-testid="settlement-note-callout">
              <div>
                <span className={`font-semibold ${noteType === 'debit' ? 'text-amber-900' : noteType === 'credit' ? 'text-emerald-900' : 'text-slate-700'}`}>
                  {noteType === 'debit' ? 'Net Debit Note · Distributor owes Supplier' : noteType === 'credit' ? 'Net Credit Note · Supplier owes Distributor' : 'No Settlement Adjustment'}
                </span>
                <span className={`text-xs ml-2 ${noteType === 'debit' ? 'text-amber-700' : noteType === 'credit' ? 'text-emerald-700' : 'text-slate-500'}`}>
                  — adjusted independently of the Transfer Price Value above
                </span>
              </div>
              <span className={`font-bold text-lg tabular-nums ${noteType === 'debit' ? 'text-amber-900' : noteType === 'credit' ? 'text-emerald-900' : 'text-slate-500'}`} data-testid="settlement-note-amount">
                ₹ {fmt(Math.abs(netSettlement))}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ────── DEBIT / CREDIT NOTES LEDGER ────── */}
      <Card data-testid="notes-ledger-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <span className="inline-block w-1 h-5 bg-slate-700 rounded-sm" />
            Debit / Credit Notes
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 mt-1">Settlement adjustment notes issued for this distributor</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {notesLoading ? (
            <div className="flex items-center justify-center py-12"><RefreshCw className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : !debitCreditNotes || debitCreditNotes.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <Receipt className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No debit/credit notes yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 border-y border-slate-200 text-[11px] uppercase tracking-wider text-slate-600">
                    <th className="text-left px-4 py-2.5 font-semibold">Note #</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Period</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Amount</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Paid</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Balance</th>
                    <th className="text-center px-4 py-2.5 font-semibold">Status</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Created</th>
                    <th className="text-center px-4 py-2.5 font-semibold w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {debitCreditNotes.map((note, i) => (
                    <tr key={note.id} className={`${i % 2 === 1 ? 'bg-slate-50/40' : ''} cursor-pointer hover:bg-slate-100/60`} onClick={() => viewNoteDetail && viewNoteDetail(note.id)}>
                      <td className="px-4 py-2.5 font-medium tabular-nums">{note.note_number}</td>
                      <td className="px-4 py-2.5 text-slate-600">{note.month ? `${MONTHS.find(m => m.value === note.month)?.label} ${note.year}` : '—'}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={note.note_type === 'debit' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}>
                          {note.note_type === 'debit' ? 'DEBIT' : 'CREDIT'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmt(note.amount)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700 tabular-nums">{fmt(note.paid_amount)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-700 tabular-nums">{fmt(note.balance_amount ?? note.amount)}</td>
                      <td className="px-4 py-2.5 text-center">{getNoteStatusBadge ? getNoteStatusBadge(note.status) : <Badge variant="outline">{note.status}</Badge>}</td>
                      <td className="px-4 py-2.5 text-slate-500">{note.created_at?.split('T')[0]}</td>
                      <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => viewNoteDetail && viewNoteDetail(note.id)} data-testid={`view-note-${note.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={downloadingPdf === note.id} onClick={() => handleDownloadPdf(note)} data-testid={`download-note-${note.id}`}>
                            {downloadingPdf === note.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                          </Button>
                          {canDelete && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50" onClick={() => setDeleteTarget({ type: 'note', id: note.id, name: note.note_number })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Note Dialog */}
      <Dialog open={showGenerateNoteDialog} onOpenChange={setShowGenerateNoteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate {noteType === 'debit' ? 'Debit' : 'Credit'} Note</DialogTitle>
            <DialogDescription>Settlement adjustment for {periodLabel}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className={`p-4 rounded-md border-2 ${noteType === 'debit' ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
              <p className={`text-xs uppercase tracking-wider font-semibold ${noteType === 'debit' ? 'text-amber-700' : 'text-emerald-700'}`}>
                {noteType === 'debit' ? 'Net Debit Note' : 'Net Credit Note'}
              </p>
              <p className={`text-3xl font-bold tabular-nums mt-1 ${noteType === 'debit' ? 'text-amber-900' : 'text-emerald-900'}`}>
                ₹ {fmt(Math.abs(netSettlement))}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {noteType === 'debit' ? 'Distributor pays this to Supplier (in addition to Transfer Price Value)' : 'Supplier pays this to Distributor'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-slate-500 font-medium">Remarks (Optional)</Label>
              <Textarea placeholder="Notes for this settlement..." value={noteRemarks} onChange={(e) => setNoteRemarks(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateNoteDialog(false)}>Cancel</Button>
            <Button
              onClick={handleGenerateNote}
              disabled={generatingNote}
              className={noteType === 'debit' ? 'bg-amber-700 hover:bg-amber-800 text-white' : 'bg-emerald-700 hover:bg-emerald-800 text-white'}
              data-testid="confirm-generate-note-btn"
            >
              {generatingNote ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating…</> : <><CheckCircle className="h-4 w-4 mr-1.5" />Confirm</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
