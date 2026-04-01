import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Plus, Trash2, DollarSign, RefreshCw, FileText, Calendar, Download, Building2, ChevronLeft, ChevronRight, Send, Check, X, Truck, CreditCard, Factory, ArrowRight, ArrowDown, Package, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
];
const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2];

const fmt = (v) => (v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export default function SettlementsTab({
  distributor, canManage, canDelete, canApprove,
  settlements, settlementsLoading, settlementsTotal,
  settlementsPage, settlementsPageSize, setSettlementsPage, setSettlementsPageSize,
  settlementsMonthFilter, setSettlementsMonthFilter,
  settlementsYearFilter, setSettlementsYearFilter,
  fetchSettlements,
  showSettlementDialog, setShowSettlementDialog,
  settlementForm, setSettlementForm, resetSettlementForm,
  unsettledDeliveries, unsettledLoading, fetchUnsettledDeliveries,
  settlementPreview, previewLoading, fetchSettlementPreview,
  handleCreateSettlement, handleSubmitSettlement, handleApproveSettlement, handleRejectSettlement,
  savingSettlement, viewSettlementDetail, setDeleteTarget, getSettlementStatusBadge,
  assignedAccounts
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [downloading, setDownloading] = useState(false);
  const [expandedIds, setExpandedIds] = useState({});
  const totalPages = Math.ceil((settlementsTotal || 0) / (settlementsPageSize || 20));

  const toggle = (id) => setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    if (showSettlementDialog) {
      setSettlementForm(prev => ({ ...prev, settlement_month: selectedMonth, settlement_year: selectedYear }));
      if (fetchUnsettledDeliveries) fetchUnsettledDeliveries(selectedMonth, selectedYear);
      if (fetchSettlementPreview) fetchSettlementPreview(selectedMonth, selectedYear);
    }
  }, [showSettlementDialog, selectedMonth, selectedYear, setSettlementForm, fetchUnsettledDeliveries, fetchSettlementPreview]);

  const refreshPreview = () => {
    if (fetchUnsettledDeliveries) fetchUnsettledDeliveries(selectedMonth, selectedYear);
    if (fetchSettlementPreview) fetchSettlementPreview(selectedMonth, selectedYear);
  };

  // --- Preview data ---
  const previewSummary = settlementPreview?.summary || {};
  const previewCreditNotes = settlementPreview?.credit_notes || [];
  const previewFactoryReturns = settlementPreview?.factory_returns || [];

  // Group unsettled deliveries by account
  const groupedByAccount = unsettledDeliveries.reduce((acc, del) => {
    const accountId = del.account_id || 'unknown';
    if (!acc[accountId]) {
      acc[accountId] = { account_id: accountId, account_name: del.account_name || 'Unknown', deliveries: [], total_billing: 0, total_earnings: 0, factory_adj: 0 };
    }
    acc[accountId].deliveries.push(del);
    const items = del.items || [];
    items.forEach(item => {
      const qty = item.quantity || 0;
      const cp = item.customer_selling_price || item.unit_price || 0;
      const comm = item.distributor_commission_percent || item.margin_percent || 2.5;
      const bp = item.base_price || item.transfer_price || 0;
      const transferPrice = bp > 0 ? bp * (1 - comm / 100) : 0;
      const newTP = cp > 0 ? cp * (1 - comm / 100) : 0;
      acc[accountId].total_billing += qty * cp;
      acc[accountId].total_earnings += qty * cp * (comm / 100);
      acc[accountId].factory_adj += (qty * newTP) - (qty * transferPrice);
    });
    return acc;
  }, {});
  const accountGroups = Object.values(groupedByAccount);
  const totalDeliveryBilling = accountGroups.reduce((s, g) => s + g.total_billing, 0);
  const totalEarnings = accountGroups.reduce((s, g) => s + g.total_earnings, 0);
  const totalFactoryAdj = accountGroups.reduce((s, g) => s + g.factory_adj, 0);

  // --- Settlement list grouping ---
  const settlementsByAccount = settlements.reduce((acc, s) => {
    const aid = s.account_id || 'unknown';
    if (!acc[aid]) {
      acc[aid] = {
        account_id: aid, account_name: s.account_name || 'Unknown',
        settlements: [],
        totals: { billing: 0, earnings: 0, factory_adj: 0, cn_issued: 0, fr_credit: 0, final_payout: 0 }
      };
    }
    acc[aid].settlements.push(s);
    acc[aid].totals.billing += s.total_billing_value || 0;
    acc[aid].totals.earnings += s.distributor_earnings || 0;
    acc[aid].totals.factory_adj += s.factory_distributor_adjustment || 0;
    acc[aid].totals.cn_issued += s.total_credit_notes_issued || s.credit_notes_applied || 0;
    acc[aid].totals.fr_credit += s.total_factory_return_credit || 0;
    acc[aid].totals.final_payout += s.final_payout || 0;
    return acc;
  }, {});
  const settlementGroups = Object.values(settlementsByAccount);
  const grandTotals = settlementGroups.reduce((a, g) => ({
    billing: a.billing + g.totals.billing,
    earnings: a.earnings + g.totals.earnings,
    factory_adj: a.factory_adj + g.totals.factory_adj,
    cn_issued: a.cn_issued + g.totals.cn_issued,
    fr_credit: a.fr_credit + g.totals.fr_credit,
    final_payout: a.final_payout + g.totals.final_payout
  }), { billing: 0, earnings: 0, factory_adj: 0, cn_issued: 0, fr_credit: 0, final_payout: 0 });

  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const rows = settlements.map(s => ({
        'Settlement #': s.settlement_number,
        'Month': s.settlement_month ? MONTHS.find(m => m.value === s.settlement_month)?.label : '-',
        'Year': s.settlement_year || '-',
        'Account': s.account_name || '-',
        'Deliveries': s.total_deliveries || 0,
        'Customer Billing': s.total_billing_value || 0,
        'Dist Earnings': s.distributor_earnings || 0,
        'Price Adj (Dist->Factory)': s.factory_distributor_adjustment || 0,
        'Credit Notes': s.total_credit_notes_issued || s.credit_notes_applied || 0,
        'Factory Returns': s.total_factory_return_credit || 0,
        'Net Payout': s.final_payout || 0,
        'Status': s.status
      }));
      if (!rows.length) return;
      const h = Object.keys(rows[0]);
      const csv = [h.join(','), ...rows.map(r => h.map(k => { const v = r[k]; return typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v; }).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `settlements_${distributor?.name || 'dist'}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } finally { setDownloading(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Monthly Settlements</CardTitle>
            <CardDescription>Deliveries + Credit Notes + Factory Returns = Net Payout</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={downloadExcel} disabled={downloading || !settlements.length} data-testid="download-settlements-btn">
              <Download className="h-4 w-4 mr-2" />{downloading ? 'Downloading...' : 'Export'}
            </Button>
            {canManage && (
              <Dialog open={showSettlementDialog} onOpenChange={(open) => { setShowSettlementDialog(open); if (!open) resetSettlementForm(); }}>
                <DialogTrigger asChild>
                  <Button data-testid="create-settlement-btn"><Plus className="h-4 w-4 mr-2" />Generate Settlement</Button>
                </DialogTrigger>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Generate Monthly Settlement</DialogTitle>
                    <DialogDescription>Review all settlement components before generating</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-5 py-4">
                    {/* Month/Year Selector */}
                    <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border">
                      <Calendar className="h-5 w-5 text-slate-500" />
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Period:</Label>
                        <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="border rounded-md px-3 py-1.5 bg-white text-sm">
                          {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="border rounded-md px-3 py-1.5 bg-white text-sm">
                          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                      <Button variant="outline" size="sm" onClick={refreshPreview} disabled={unsettledLoading || previewLoading}>
                        {(unsettledLoading || previewLoading) ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Refresh'}
                      </Button>
                    </div>

                    {/* === FLOW VISUALIZATION === */}
                    <div className="grid grid-cols-3 gap-3" data-testid="settlement-preview-summary">
                      {/* A: Deliveries */}
                      <div className="border rounded-lg p-4 bg-blue-50/60 border-blue-200">
                        <div className="flex items-center gap-2 mb-2">
                          <Truck className="h-4 w-4 text-blue-600" />
                          <span className="font-semibold text-sm text-blue-800">Deliveries (Dist to Customer)</span>
                        </div>
                        <p className="text-2xl font-bold text-blue-700">{accountGroups.reduce((s, g) => s + g.deliveries.length, 0)}</p>
                        <p className="text-xs text-blue-600 mt-1">Customer Billing: <span className="font-semibold">₹{fmt(totalDeliveryBilling)}</span></p>
                        <p className="text-xs text-blue-600">Earnings: <span className="font-semibold">₹{fmt(totalEarnings)}</span></p>
                      </div>
                      {/* B: Credit Notes */}
                      <div className="border rounded-lg p-4 bg-emerald-50/60 border-emerald-200">
                        <div className="flex items-center gap-2 mb-2">
                          <CreditCard className="h-4 w-4 text-emerald-600" />
                          <span className="font-semibold text-sm text-emerald-800">Credit Notes (Factory to Dist)</span>
                        </div>
                        <p className="text-2xl font-bold text-emerald-700">{previewSummary.total_credit_notes || 0}</p>
                        <p className="text-xs text-emerald-600 mt-1">Total Credit: <span className="font-semibold">+₹{fmt(previewSummary.total_credit_note_amount)}</span></p>
                        <p className="text-xs text-emerald-500">Customer return reimbursement</p>
                      </div>
                      {/* C: Factory Returns */}
                      <div className="border rounded-lg p-4 bg-purple-50/60 border-purple-200">
                        <div className="flex items-center gap-2 mb-2">
                          <Factory className="h-4 w-4 text-purple-600" />
                          <span className="font-semibold text-sm text-purple-800">Factory Returns (Factory to Dist)</span>
                        </div>
                        <p className="text-2xl font-bold text-purple-700">{previewSummary.total_factory_returns || 0}</p>
                        <p className="text-xs text-purple-600 mt-1">Total Credit: <span className="font-semibold">+₹{fmt(previewSummary.total_factory_return_amount)}</span></p>
                        <p className="text-xs text-purple-500">Warehouse stock return credit</p>
                      </div>
                    </div>

                    {/* === PAYOUT FORMULA === */}
                    <div className="border rounded-lg p-4 bg-slate-900 text-white" data-testid="settlement-payout-formula">
                      <p className="text-xs text-slate-400 uppercase tracking-wider font-medium mb-2">Net Payout Calculation</p>
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="bg-blue-600/20 text-blue-300 px-2 py-1 rounded font-mono">Earnings ₹{fmt(totalEarnings)}</span>
                        <Minus className="h-3 w-3 text-amber-400 flex-shrink-0" />
                        <span className="bg-amber-600/20 text-amber-300 px-2 py-1 rounded font-mono">Price Adj ₹{fmt(Math.abs(totalFactoryAdj))}</span>
                        <Plus className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                        <span className="bg-emerald-600/20 text-emerald-300 px-2 py-1 rounded font-mono">Credit Notes ₹{fmt(previewSummary.total_credit_note_amount)}</span>
                        <Plus className="h-3 w-3 text-purple-400 flex-shrink-0" />
                        <span className="bg-purple-600/20 text-purple-300 px-2 py-1 rounded font-mono">Factory Returns ₹{fmt(previewSummary.total_factory_return_amount)}</span>
                        <span className="text-slate-500 mx-1">=</span>
                        <span className="bg-white/10 text-white px-3 py-1 rounded font-bold font-mono">
                          ₹{fmt(totalEarnings - Math.abs(totalFactoryAdj) + (previewSummary.total_credit_note_amount || 0) + (previewSummary.total_factory_return_amount || 0))}
                        </span>
                      </div>
                    </div>

                    {/* === DELIVERY DETAILS === */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="p-3 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                        <Truck className="h-4 w-4 text-blue-600" />
                        <span className="font-semibold text-sm text-blue-800">Deliveries by Account</span>
                        <Badge variant="secondary" className="ml-auto">{unsettledDeliveries.length} deliveries</Badge>
                      </div>
                      {unsettledLoading ? (
                        <div className="flex items-center justify-center py-6"><RefreshCw className="h-5 w-5 animate-spin text-blue-400" /></div>
                      ) : accountGroups.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-sm">No unsettled deliveries for this period</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50"><tr>
                            <th className="text-left p-3 font-medium text-slate-600">Account</th>
                            <th className="text-right p-3 font-medium text-slate-600">Deliveries</th>
                            <th className="text-right p-3 font-medium text-slate-600">Customer Billing</th>
                            <th className="text-right p-3 font-medium text-blue-600">Dist Earnings</th>
                            <th className="text-right p-3 font-medium text-amber-600">Price Adj (D→F)</th>
                          </tr></thead>
                          <tbody>
                            {accountGroups.map(g => (
                              <tr key={g.account_id} className="border-t hover:bg-slate-50/50">
                                <td className="p-3 font-medium">{g.account_name}</td>
                                <td className="p-3 text-right">{g.deliveries.length}</td>
                                <td className="p-3 text-right">₹{fmt(g.total_billing)}</td>
                                <td className="p-3 text-right text-blue-600 font-medium">₹{fmt(g.total_earnings)}</td>
                                <td className={`p-3 text-right font-medium ${g.factory_adj > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                  {g.factory_adj > 0 ? '-' : ''}₹{fmt(Math.abs(g.factory_adj))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* === CREDIT NOTES === */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="p-3 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-emerald-600" />
                        <span className="font-semibold text-sm text-emerald-800">Credit Notes (Customer Returns Reimbursement)</span>
                        <Badge variant="secondary" className="ml-auto bg-emerald-100 text-emerald-700">{previewCreditNotes.length} notes</Badge>
                      </div>
                      {previewLoading ? (
                        <div className="flex items-center justify-center py-6"><RefreshCw className="h-5 w-5 animate-spin text-emerald-400" /></div>
                      ) : previewCreditNotes.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-sm">No unsettled credit notes for this period</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50"><tr>
                            <th className="text-left p-3 font-medium text-slate-600">CN Number</th>
                            <th className="text-left p-3 font-medium text-slate-600">Account</th>
                            <th className="text-left p-3 font-medium text-slate-600">Return #</th>
                            <th className="text-left p-3 font-medium text-slate-600">Status</th>
                            <th className="text-right p-3 font-medium text-emerald-600">Credit Amount</th>
                          </tr></thead>
                          <tbody>
                            {previewCreditNotes.map(cn => (
                              <tr key={cn.id} className="border-t hover:bg-slate-50/50">
                                <td className="p-3 font-medium text-emerald-700">{cn.credit_note_number}</td>
                                <td className="p-3">{cn.account_name || '-'}</td>
                                <td className="p-3 text-slate-500">{cn.return_number || '-'}</td>
                                <td className="p-3"><Badge variant="outline" className="text-xs">{cn.status}</Badge></td>
                                <td className="p-3 text-right font-medium text-emerald-600">+₹{fmt(cn.original_amount || cn.total_amount || cn.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* === FACTORY RETURNS === */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="p-3 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
                        <Factory className="h-4 w-4 text-purple-600" />
                        <span className="font-semibold text-sm text-purple-800">Factory Returns (Warehouse Stock Return Credit)</span>
                        <Badge variant="secondary" className="ml-auto bg-purple-100 text-purple-700">{previewFactoryReturns.length} returns</Badge>
                      </div>
                      {previewLoading ? (
                        <div className="flex items-center justify-center py-6"><RefreshCw className="h-5 w-5 animate-spin text-purple-400" /></div>
                      ) : previewFactoryReturns.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-sm">No unsettled factory returns for this period</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50"><tr>
                            <th className="text-left p-3 font-medium text-slate-600">Return #</th>
                            <th className="text-left p-3 font-medium text-slate-600">Source</th>
                            <th className="text-left p-3 font-medium text-slate-600">Reason</th>
                            <th className="text-left p-3 font-medium text-slate-600">Date</th>
                            <th className="text-right p-3 font-medium text-purple-600">Credit Amount</th>
                          </tr></thead>
                          <tbody>
                            {previewFactoryReturns.map(fr => (
                              <tr key={fr.id} className="border-t hover:bg-slate-50/50">
                                <td className="p-3 font-medium text-purple-700">{fr.return_number}</td>
                                <td className="p-3 capitalize">{fr.source || '-'}</td>
                                <td className="p-3 capitalize">{(fr.reason || '-').replace(/_/g, ' ')}</td>
                                <td className="p-3 text-slate-500">{fr.return_date || '-'}</td>
                                <td className="p-3 text-right font-medium text-purple-600">+₹{fmt(fr.total_credit_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Remarks */}
                    <div className="space-y-2">
                      <Label>Remarks</Label>
                      <Textarea placeholder="Notes for this settlement..." value={settlementForm.remarks} onChange={(e) => setSettlementForm(prev => ({ ...prev, remarks: e.target.value }))} rows={2} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowSettlementDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreateSettlement} disabled={savingSettlement || (accountGroups.length === 0 && previewCreditNotes.length === 0 && previewFactoryReturns.length === 0)} data-testid="save-settlement-btn">
                      {savingSettlement ? 'Creating...' : 'Generate Settlement'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t">
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-slate-400" />
            <select value={settlementsMonthFilter || 'all'} onChange={(e) => { setSettlementsMonthFilter(e.target.value); setSettlementsPage(1); }} className="text-sm border rounded-md px-3 py-1.5 bg-background">
              <option value="all">All Months</option>
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={settlementsYearFilter || 'all'} onChange={(e) => { setSettlementsYearFilter(e.target.value); setSettlementsPage(1); }} className="text-sm border rounded-md px-3 py-1.5 bg-background">
              <option value="all">All Years</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <select value={settlementsPageSize || 20} onChange={(e) => { setSettlementsPageSize(Number(e.target.value)); setSettlementsPage(1); }} className="border rounded-md px-2 py-1.5 bg-background text-sm">
              <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
            </select>
            <span>per page</span>
            <span className="font-medium text-slate-700">{settlementsTotal || 0} total</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {settlementsLoading ? (
          <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : settlements.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="font-medium">No settlements yet</p>
            <p className="text-sm mt-1">Generate a settlement to calculate distributor payout</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* === GRAND TOTAL PAYOUT FLOW === */}
            <div className="border rounded-xl p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white" data-testid="settlement-grand-totals">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-400 font-medium uppercase tracking-wider">Settlement Summary ({settlements.length} settlements)</p>
                <p className="text-xs text-slate-500">Net Payout = Earnings - Price Adj + Credit Notes + Factory Returns</p>
              </div>
              <div className="grid grid-cols-6 gap-3">
                <div className="text-center">
                  <p className="text-xs text-slate-400">Customer Billing</p>
                  <p className="text-lg font-bold text-slate-200">₹{fmt(grandTotals.billing)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-blue-400">Dist Earnings</p>
                  <p className="text-lg font-bold text-blue-300">₹{fmt(grandTotals.earnings)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-amber-400">Price Adj (D→F)</p>
                  <p className="text-lg font-bold text-amber-300">{grandTotals.factory_adj > 0 ? '-' : ''}₹{fmt(Math.abs(grandTotals.factory_adj))}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-emerald-400">Credit Notes</p>
                  <p className="text-lg font-bold text-emerald-300">+₹{fmt(grandTotals.cn_issued)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-purple-400">Factory Returns</p>
                  <p className="text-lg font-bold text-purple-300">+₹{fmt(grandTotals.fr_credit)}</p>
                </div>
                <div className="text-center border-l border-slate-700 pl-3">
                  <p className="text-xs text-white/60">Net Payout</p>
                  <p className="text-xl font-bold text-white">₹{fmt(grandTotals.final_payout)}</p>
                </div>
              </div>
            </div>

            {/* === SETTLEMENTS BY ACCOUNT === */}
            {settlementGroups.map(group => (
              <div key={group.account_id} className="border rounded-xl overflow-hidden hover:shadow-md transition-shadow" data-testid={`settlement-account-${group.account_id}`}>
                <div className="flex items-center justify-between p-4 bg-white cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggle(group.account_id)}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{group.account_name}</p>
                      <p className="text-xs text-slate-400">{group.settlements.length} settlement(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 text-right">
                    <div><p className="text-[10px] text-slate-400 uppercase">Earnings</p><p className="text-sm font-semibold text-blue-600">₹{fmt(group.totals.earnings)}</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Price Adj</p><p className="text-sm font-semibold text-amber-600">{group.totals.factory_adj > 0 ? '-' : ''}₹{fmt(Math.abs(group.totals.factory_adj))}</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Credit Notes</p><p className="text-sm font-semibold text-emerald-600">+₹{fmt(group.totals.cn_issued)}</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Factory Ret.</p><p className="text-sm font-semibold text-purple-600">+₹{fmt(group.totals.fr_credit)}</p></div>
                    <div className="border-l pl-4"><p className="text-[10px] text-slate-400 uppercase">Net Payout</p><p className="text-sm font-bold">₹{fmt(group.totals.final_payout)}</p></div>
                    <div className={`w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center transition-transform ${expandedIds[group.account_id] ? 'rotate-180' : ''}`}>
                      <ArrowDown className="h-4 w-4 text-slate-500" />
                    </div>
                  </div>
                </div>
                {expandedIds[group.account_id] && (
                  <div className="border-t">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-slate-50 text-xs text-slate-500 uppercase">
                        <th className="text-left p-3">Settlement #</th>
                        <th className="text-left p-3">Period</th>
                        <th className="text-right p-3">Billing</th>
                        <th className="text-right p-3 text-blue-600">Earnings</th>
                        <th className="text-right p-3 text-amber-600">Price Adj</th>
                        <th className="text-right p-3 text-emerald-600">Credit Notes</th>
                        <th className="text-right p-3 text-purple-600">Factory Ret.</th>
                        <th className="text-right p-3 font-bold">Net Payout</th>
                        <th className="text-center p-3">Status</th>
                        <th className="text-center p-3">Actions</th>
                      </tr></thead>
                      <tbody>
                        {group.settlements.map((s, i) => {
                          const cnVal = s.total_credit_notes_issued || s.credit_notes_applied || 0;
                          const frVal = s.total_factory_return_credit || 0;
                          const adjVal = s.factory_distributor_adjustment || 0;
                          return (
                            <tr key={s.id} className={`border-t hover:bg-slate-50 cursor-pointer ${i % 2 === 1 ? 'bg-slate-50/40' : ''}`} onClick={() => viewSettlementDetail(s.id)}>
                              <td className="p-3"><button className="font-medium text-blue-600 hover:underline" onClick={(e) => { e.stopPropagation(); viewSettlementDetail(s.id); }}>{s.settlement_number}</button></td>
                              <td className="p-3 text-slate-600">{MONTHS.find(m => m.value === s.settlement_month)?.label} {s.settlement_year}</td>
                              <td className="p-3 text-right">₹{fmt(s.total_billing_value)}</td>
                              <td className="p-3 text-right text-blue-600 font-medium">₹{fmt(s.distributor_earnings)}</td>
                              <td className={`p-3 text-right font-medium ${adjVal > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{adjVal > 0 ? '-' : ''}₹{fmt(Math.abs(adjVal))}</td>
                              <td className={`p-3 text-right font-medium ${cnVal > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{cnVal > 0 ? '+' : ''}₹{fmt(cnVal)}</td>
                              <td className={`p-3 text-right font-medium ${frVal > 0 ? 'text-purple-600' : 'text-slate-400'}`}>{frVal > 0 ? '+' : ''}₹{fmt(frVal)}</td>
                              <td className="p-3 text-right font-bold">₹{fmt(s.final_payout)}</td>
                              <td className="p-3 text-center">{getSettlementStatusBadge(s.status)}</td>
                              <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-center gap-1">
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => viewSettlementDetail(s.id)} title="View"><FileText className="h-3.5 w-3.5" /></Button>
                                  {s.status === 'draft' && canManage && (
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50" onClick={() => handleSubmitSettlement(s.id)} title="Submit"><Send className="h-3.5 w-3.5" /></Button>
                                  )}
                                  {s.status === 'pending_approval' && canApprove && (<>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50" onClick={() => handleApproveSettlement(s.id)} title="Approve"><Check className="h-3.5 w-3.5" /></Button>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-orange-600 hover:bg-orange-50" onClick={() => handleRejectSettlement(s.id)} title="Reject"><X className="h-3.5 w-3.5" /></Button>
                                  </>)}
                                  {(canDelete || (canManage && s.status === 'draft')) && (
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setDeleteTarget({ type: 'settlement', id: s.id, name: s.settlement_number })} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t">
                <span className="text-sm text-slate-500">Page {settlementsPage} of {totalPages}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setSettlementsPage(1)} disabled={settlementsPage === 1}>First</Button>
                  <Button variant="outline" size="sm" onClick={() => setSettlementsPage(p => Math.max(1, p - 1))} disabled={settlementsPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => setSettlementsPage(p => Math.min(totalPages, p + 1))} disabled={settlementsPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => setSettlementsPage(totalPages)} disabled={settlementsPage === totalPages}>Last</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
