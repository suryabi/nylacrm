import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { RefreshCw, FileText, Receipt, Eye, Settings, Trash2, Calendar, Building2, ChevronDown, ChevronUp, Clock, CheckCircle, FileDown, Loader2, ArrowDown, Minus, Plus, CreditCard, Factory, Truck, TrendingUp, TrendingDown } from 'lucide-react';

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
];
const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2];
const fmt = (v) => (v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

export default function BillingTab({
  distributor, canManage, canDelete,
  settlements, settlementsLoading, fetchSettlements,
  debitCreditNotes, notesLoading, fetchNotes, viewNoteDetail, getNoteStatusBadge, getSettlementStatusBadge,
  setActiveTab, setDeleteTarget, API_URL, token
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [expandedAccounts, setExpandedAccounts] = useState({});
  const [showGenerateNoteDialog, setShowGenerateNoteDialog] = useState(false);
  const [generatingNote, setGeneratingNote] = useState(false);
  const [noteRemarks, setNoteRemarks] = useState('');
  const [monthlyData, setMonthlyData] = useState(null);
  const [loadingMonthlyData, setLoadingMonthlyData] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(null);

  useEffect(() => {
    if (distributor?.id) fetchMonthlyReconciliationData();
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

  const toggleAccountExpand = (id) => setExpandedAccounts(prev => ({ ...prev, [id]: !prev[id] }));

  const handleGenerateNote = async () => {
    if (!monthlyData || (monthlyData.net_adjustment_amount || 0) === 0) return;
    setGeneratingNote(true);
    try {
      const authToken = token || localStorage.getItem('token');
      const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
      const response = await fetch(
        `${API_URL}/api/distributors/${distributor.id}/generate-monthly-note`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json', 'X-Tenant-ID': tenantId }, body: JSON.stringify({ month: selectedMonth, year: selectedYear, remarks: noteRemarks }) }
      );
      if (response.ok) {
        setShowGenerateNoteDialog(false);
        setNoteRemarks('');
        fetchMonthlyReconciliationData();
        if (fetchNotes) fetchNotes();
        alert('Note generated successfully!');
      } else {
        const error = await response.json();
        alert(`Failed: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) { alert('Failed to generate note'); } finally { setGeneratingNote(false); }
  };

  const handleDownloadPdf = async (note) => {
    setDownloadingPdf(note.id);
    try {
      const authToken = token || localStorage.getItem('token');
      const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
      const response = await fetch(`${API_URL}/api/distributors/${distributor.id}/notes/${note.id}/download`, { headers: { 'Authorization': `Bearer ${authToken}`, 'X-Tenant-ID': tenantId } });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `${note.note_number || 'note'}.pdf`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) { alert('Failed to download PDF'); } finally { setDownloadingPdf(null); }
  };

  // Compute per-settlement transfer-price payable
  const computePayable = (s) => (s.total_billing_value || 0) - (s.distributor_earnings || 0) - (s.factory_distributor_adjustment || 0);

  // Group unreconciled settlements by account
  const unreconciledByAccount = (monthlyData?.unreconciled_settlements || []).reduce((acc, s) => {
    const aid = s.account_id || 'unknown';
    if (!acc[aid]) acc[aid] = { account_id: aid, account_name: s.account_name || 'Unknown', settlements: [], totals: { payable: 0, billing: 0, earnings: 0, factory_adj: 0, credit_notes: 0, factory_returns: 0 } };
    acc[aid].settlements.push(s);
    acc[aid].totals.payable += computePayable(s);
    acc[aid].totals.billing += s.total_billing_value || 0;
    acc[aid].totals.earnings += s.distributor_earnings || 0;
    acc[aid].totals.factory_adj += s.factory_distributor_adjustment || 0;
    acc[aid].totals.credit_notes += s.total_credit_notes_issued || s.credit_notes_applied || 0;
    acc[aid].totals.factory_returns += s.total_factory_return_credit || 0;
    return acc;
  }, {});
  const unreconciledGroups = Object.values(unreconciledByAccount);

  const reconciledGroups = Object.values((monthlyData?.reconciled_settlements || []).reduce((acc, s) => {
    const aid = s.account_id || 'unknown';
    if (!acc[aid]) acc[aid] = { account_id: aid, account_name: s.account_name || 'Unknown', settlements: [], totals: { payable: 0 } };
    acc[aid].settlements.push(s);
    acc[aid].totals.payable += computePayable(s);
    return acc;
  }, {}));

  // From backend
  const payableToNyla = monthlyData?.total_payable_to_nyla || 0;
  const settlementDebits = monthlyData?.settlement_debits || 0;
  const settlementCredits = monthlyData?.settlement_credits || 0;
  const totalCN = monthlyData?.total_credit_notes_applied || 0;
  const totalFR = monthlyData?.total_factory_return_credit || 0;
  const netAdj = monthlyData?.net_adjustment_amount || 0;
  const noteType = monthlyData?.settlement_note_type || 'none';
  const hasUnreconciled = unreconciledGroups.length > 0;
  const periodLabel = `${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear}`;

  return (
    <div className="space-y-6">
      {/* Pricing Config */}
      <Card className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800">Base Prices & Margins</p>
              <p className="text-sm text-blue-700 mt-1">Configured in the <strong>Margins</strong> tab.</p>
              <Button variant="outline" size="sm" className="mt-2 border-blue-300 text-blue-700 hover:bg-blue-100" onClick={() => setActiveTab('margins')}>Go to Margins Tab</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Month/Year Selection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5" />Monthly Billing & Reconciliation</CardTitle>
              <CardDescription>Two entries: Billing (at transfer price) and Settlement (adjustments)</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4 p-4 bg-muted/30 rounded-lg">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <Label>Month:</Label>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="border rounded-md px-3 py-1.5 bg-background text-sm" data-testid="billing-month-select">
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label>Year:</Label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="border rounded-md px-3 py-1.5 bg-background text-sm" data-testid="billing-year-select">
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <Button variant="outline" size="sm" onClick={fetchMonthlyReconciliationData} disabled={loadingMonthlyData}>
              {loadingMonthlyData ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Refresh'}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loadingMonthlyData ? (
            <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !hasUnreconciled && reconciledGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No approved settlements for {periodLabel}</p>
              <p className="text-sm">Generate and approve settlements from the Settlements tab first</p>
            </div>
          ) : (
            <div className="space-y-6">
              {hasUnreconciled && (<>
                {/* ============ TWO ENTRIES SIDE BY SIDE ============ */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="billing-two-entries">

                  {/* ── ENTRY 1: BILLING (Invoice at Transfer Price) ── */}
                  <div className="border-2 border-blue-200 rounded-xl overflow-hidden" data-testid="entry-billing">
                    <div className="p-4 bg-blue-600 text-white">
                      <div className="flex items-center gap-2 mb-1">
                        <Truck className="h-4 w-4" />
                        <span className="font-semibold text-sm uppercase tracking-wider">Entry 1: Monthly Billing</span>
                      </div>
                      <p className="text-xs text-blue-200">Distributor pays factory for stock sold to customers</p>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="text-center">
                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Amount at Transfer Price</p>
                        <p className="text-3xl font-bold text-blue-700" data-testid="billing-amount">₹{fmt(payableToNyla)}</p>
                        <p className="text-xs text-slate-500 mt-2">Sum of (qty x transfer price) for all deliveries</p>
                      </div>
                      <div className="border-t pt-3 space-y-2 text-sm">
                        <div className="flex justify-between text-slate-500">
                          <span>Customer Billing (MRP)</span>
                          <span>₹{fmt(monthlyData?.total_billing_value)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Distributor Margin</span>
                          <span>-₹{fmt(monthlyData?.total_distributor_earnings)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Price Adjustment</span>
                          <span>-₹{fmt(monthlyData?.total_factory_adjustment)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-blue-700 border-t pt-2">
                          <span>Payable to Factory</span>
                          <span>₹{fmt(payableToNyla)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── ENTRY 2: SETTLEMENT (Adjustments → Debit/Credit Note) ── */}
                  <div className={`border-2 rounded-xl overflow-hidden ${noteType === 'debit' ? 'border-amber-200' : noteType === 'credit' ? 'border-emerald-200' : 'border-slate-200'}`} data-testid="entry-settlement">
                    <div className={`p-4 text-white ${noteType === 'debit' ? 'bg-amber-600' : noteType === 'credit' ? 'bg-emerald-600' : 'bg-slate-600'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Receipt className="h-4 w-4" />
                        <span className="font-semibold text-sm uppercase tracking-wider">Entry 2: Monthly Settlement</span>
                      </div>
                      <p className={`text-xs ${noteType === 'debit' ? 'text-amber-200' : noteType === 'credit' ? 'text-emerald-200' : 'text-slate-300'}`}>
                        Adjustments for the month → {noteType === 'debit' ? 'Debit Note' : noteType === 'credit' ? 'Credit Note' : 'No Adjustment'}
                      </p>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="text-center">
                        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                          {noteType === 'debit' ? 'Debit Note (Distributor Owes)' : noteType === 'credit' ? 'Credit Note (Factory Owes)' : 'No Adjustment Required'}
                        </p>
                        <p className={`text-3xl font-bold ${noteType === 'debit' ? 'text-amber-600' : noteType === 'credit' ? 'text-emerald-600' : 'text-slate-400'}`} data-testid="settlement-amount">
                          ₹{fmt(Math.abs(netAdj))}
                        </p>
                      </div>
                      <div className="border-t pt-3 space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2 text-slate-600">
                            <TrendingUp className="h-3.5 w-3.5 text-amber-500" />
                            <span>Price Adjustments (Dist → Factory)</span>
                          </div>
                          <span className={`font-medium ${settlementDebits > 0 ? 'text-amber-600' : 'text-slate-400'}`}>+₹{fmt(settlementDebits)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2 text-slate-600">
                            <CreditCard className="h-3.5 w-3.5 text-emerald-500" />
                            <span>Credit Notes (Factory → Dist)</span>
                          </div>
                          <span className={`font-medium ${totalCN > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{totalCN > 0 ? '-' : ''}₹{fmt(totalCN)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Factory className="h-3.5 w-3.5 text-purple-500" />
                            <span>Factory Returns (Factory → Dist)</span>
                          </div>
                          <span className={`font-medium ${totalFR > 0 ? 'text-purple-600' : 'text-slate-400'}`}>{totalFR > 0 ? '-' : ''}₹{fmt(totalFR)}</span>
                        </div>
                        <div className={`flex justify-between font-semibold border-t pt-2 ${noteType === 'debit' ? 'text-amber-700' : noteType === 'credit' ? 'text-emerald-700' : 'text-slate-500'}`}>
                          <span>Net {noteType === 'debit' ? '(Debit)' : noteType === 'credit' ? '(Credit)' : ''}</span>
                          <span>₹{fmt(Math.abs(netAdj))}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* === SETTLEMENT BREAKDOWN BY ACCOUNT === */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="p-3 bg-slate-100 border-b font-medium flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span>Settlement Breakdown by Account</span>
                    <Badge variant="secondary" className="ml-auto">{monthlyData?.total_unreconciled || 0} settlement(s)</Badge>
                  </div>
                  <div className="divide-y">
                    {unreconciledGroups.map(group => {
                      const adjNet = group.totals.factory_adj - group.totals.credit_notes - group.totals.factory_returns;
                      return (
                        <div key={group.account_id}>
                          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleAccountExpand(group.account_id)}>
                            <div className="flex items-center gap-3">
                              <Building2 className="h-5 w-5 text-slate-400" />
                              <div>
                                <p className="font-medium text-sm">{group.account_name}</p>
                                <p className="text-xs text-slate-400">{group.settlements.length} settlement(s)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-right">
                              <div><p className="text-[10px] text-slate-400 uppercase">Billing</p><p className="text-sm font-semibold text-blue-600">₹{fmt(group.totals.payable)}</p></div>
                              <div><p className="text-[10px] text-slate-400 uppercase">Price Adj</p><p className={`text-sm font-semibold ${group.totals.factory_adj > 0 ? 'text-amber-600' : 'text-slate-300'}`}>+₹{fmt(group.totals.factory_adj)}</p></div>
                              <div><p className="text-[10px] text-slate-400 uppercase">Credits</p><p className={`text-sm font-semibold ${(group.totals.credit_notes + group.totals.factory_returns) > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>-₹{fmt(group.totals.credit_notes + group.totals.factory_returns)}</p></div>
                              <div className="border-l pl-3"><p className="text-[10px] text-slate-400 uppercase">Adj Net</p><p className={`text-sm font-bold ${adjNet > 0 ? 'text-amber-600' : adjNet < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>₹{fmt(Math.abs(adjNet))}</p></div>
                              <div className={`w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center transition-transform ${expandedAccounts[group.account_id] ? 'rotate-180' : ''}`}>
                                <ArrowDown className="h-3 w-3 text-slate-500" />
                              </div>
                            </div>
                          </div>
                          {expandedAccounts[group.account_id] && (
                            <div className="bg-slate-50/50 p-4 border-t">
                              <table className="w-full text-sm">
                                <thead><tr className="border-b text-xs text-slate-500 uppercase">
                                  <th className="text-left p-2">Settlement #</th>
                                  <th className="text-right p-2">Deliveries</th>
                                  <th className="text-right p-2 text-blue-600">Billing (TP)</th>
                                  <th className="text-right p-2 text-amber-600">Price Adj</th>
                                  <th className="text-right p-2 text-emerald-600">Credit Notes</th>
                                  <th className="text-right p-2 text-purple-600">Factory Ret.</th>
                                  <th className="text-right p-2 font-bold">Adj Net</th>
                                  <th className="text-center p-2">Status</th>
                                </tr></thead>
                                <tbody>
                                  {group.settlements.map(s => {
                                    const p = computePayable(s);
                                    const fa = s.factory_distributor_adjustment || 0;
                                    const cn = s.total_credit_notes_issued || s.credit_notes_applied || 0;
                                    const fr = s.total_factory_return_credit || 0;
                                    const net = fa - cn - fr;
                                    return (
                                      <tr key={s.id} className="border-b hover:bg-white/60">
                                        <td className="p-2 font-medium">{s.settlement_number}</td>
                                        <td className="p-2 text-right">{s.total_deliveries || 0}</td>
                                        <td className="p-2 text-right text-blue-600 font-medium">₹{fmt(p)}</td>
                                        <td className={`p-2 text-right ${fa > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{fa > 0 ? `+₹${fmt(fa)}` : '-'}</td>
                                        <td className={`p-2 text-right ${cn > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{cn > 0 ? `-₹${fmt(cn)}` : '-'}</td>
                                        <td className={`p-2 text-right ${fr > 0 ? 'text-purple-600' : 'text-slate-300'}`}>{fr > 0 ? `-₹${fmt(fr)}` : '-'}</td>
                                        <td className={`p-2 text-right font-bold ${net > 0 ? 'text-amber-600' : net < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>₹{fmt(Math.abs(net))}</td>
                                        <td className="p-2 text-center">{getSettlementStatusBadge ? getSettlementStatusBadge(s.status) : <Badge variant="outline">{s.status}</Badge>}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Generate Note Button */}
                <div className="flex justify-end">
                  {noteType !== 'none' && netAdj !== 0 ? (
                    <Button onClick={() => setShowGenerateNoteDialog(true)} className={noteType === 'debit' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} data-testid="generate-note-btn">
                      <Receipt className="h-4 w-4 mr-2" />
                      Generate {noteType === 'debit' ? 'Debit' : 'Credit'} Note (₹{fmt(Math.abs(netAdj))})
                    </Button>
                  ) : (
                    <div className="text-muted-foreground text-sm">Net adjustment is ₹0 — no note required</div>
                  )}
                </div>
              </>)}

              {/* Already Reconciled */}
              {reconciledGroups.length > 0 && (
                <>
                  <div className="border-l-4 border-green-500 pl-4 mt-6">
                    <h3 className="font-semibold text-base flex items-center gap-2"><CheckCircle className="h-5 w-5 text-green-500" />Already Reconciled</h3>
                    <p className="text-sm text-muted-foreground">{reconciledGroups.length} account(s) with {monthlyData?.total_reconciled || 0} settlement(s)</p>
                  </div>
                  <div className="border rounded-lg divide-y">
                    {reconciledGroups.map(group => (
                      <div key={group.account_id} className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <div><p className="font-medium text-sm">{group.account_name}</p><p className="text-xs text-muted-foreground">{group.settlements.length} settlement(s)</p></div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right"><p className="text-xs text-slate-400">Billing</p><p className="font-medium text-sm">₹{fmt(group.totals.payable)}</p></div>
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Reconciled</Badge>
                        </div>
                      </div>
                    ))}
                    <div className="p-4 bg-green-50 border-t">
                      <div className="flex justify-between"><span className="font-semibold text-green-700 text-sm">Total Reconciled</span><span className="font-bold text-sm">₹{fmt(monthlyData?.reconciled_payable_to_nyla)}</span></div>
                    </div>
                  </div>
                </>
              )}

              {!hasUnreconciled && reconciledGroups.length > 0 && (
                <div className="text-center py-6 text-muted-foreground bg-muted/30 rounded-lg">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p>All settlements for {periodLabel} have been reconciled</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debit/Credit Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Receipt className="h-5 w-5" />Debit / Credit Notes</CardTitle>
          <CardDescription>Monthly settlement notes for this distributor</CardDescription>
        </CardHeader>
        <CardContent>
          {notesLoading ? (
            <div className="flex items-center justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin" /></div>
          ) : debitCreditNotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No debit/credit notes yet</p>
              <p className="text-sm">Generate notes from reconciliation above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase">
                  <th className="text-left p-3">Note #</th>
                  <th className="text-left p-3">Period</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-right p-3">Paid</th>
                  <th className="text-right p-3">Balance</th>
                  <th className="text-center p-3">Status</th>
                  <th className="text-left p-3">Created</th>
                  <th className="text-center p-3">PDF</th>
                  <th className="text-center p-3">Actions</th>
                </tr></thead>
                <tbody>
                  {debitCreditNotes.map((note, i) => (
                    <tr key={note.id} className={`border-b transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-slate-50/40' : ''} hover:bg-slate-50/80`} onClick={() => viewNoteDetail && viewNoteDetail(note.id)}>
                      <td className="p-3 font-medium">{note.note_number}</td>
                      <td className="p-3 text-slate-600">{note.month ? `${MONTHS.find(m => m.value === note.month)?.label} ${note.year}` : '-'}</td>
                      <td className="p-3">
                        <Badge className={note.note_type === 'debit' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}>
                          {note.note_type === 'debit' ? 'Debit Note' : 'Credit Note'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-medium">₹{fmt(note.amount)}</td>
                      <td className="p-3 text-right text-emerald-600">₹{fmt(note.paid_amount)}</td>
                      <td className="p-3 text-right text-amber-600">₹{fmt(note.balance_amount || note.amount)}</td>
                      <td className="p-3 text-center">{getNoteStatusBadge ? getNoteStatusBadge(note.status) : <Badge variant="outline">{note.status}</Badge>}</td>
                      <td className="p-3 text-slate-500">{note.created_at?.split('T')[0]}</td>
                      <td className="p-3 text-center">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); handleDownloadPdf(note); }} disabled={downloadingPdf === note.id}>
                          {downloadingPdf === note.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                        </Button>
                      </td>
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => viewNoteDetail && viewNoteDetail(note.id)}><Eye className="h-4 w-4" /></Button>
                          {canDelete && (<Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setDeleteTarget({ type: 'note', id: note.id, name: note.note_number })}><Trash2 className="h-4 w-4" /></Button>)}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate {noteType === 'debit' ? 'Debit' : 'Credit'} Note</DialogTitle>
            <DialogDescription>Settlement adjustment for {periodLabel}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3 text-sm">
              {/* Debits */}
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-100">
                <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-amber-600" /><span className="text-amber-800">Price Adjustments (Dist → Factory)</span></div>
                <span className="font-bold text-amber-700">+₹{fmt(settlementDebits)}</span>
              </div>
              {/* Credits */}
              <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-emerald-600" /><span className="text-emerald-800">Credit Notes (Factory → Dist)</span></div>
                <span className="font-bold text-emerald-700">-₹{fmt(totalCN)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100">
                <div className="flex items-center gap-2"><Factory className="h-4 w-4 text-purple-600" /><span className="text-purple-800">Factory Returns (Factory → Dist)</span></div>
                <span className="font-bold text-purple-700">-₹{fmt(totalFR)}</span>
              </div>
              {/* Net */}
              <div className="border-t-2 border-dashed my-1"></div>
              <div className={`flex items-center justify-between p-4 rounded-lg border-2 ${noteType === 'debit' ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
                <div>
                  <p className={`font-semibold ${noteType === 'debit' ? 'text-amber-800' : 'text-emerald-800'}`}>{noteType === 'debit' ? 'Debit Note' : 'Credit Note'}</p>
                  <p className="text-xs text-slate-500">{noteType === 'debit' ? 'Distributor pays this to factory' : 'Factory pays this to distributor'}</p>
                </div>
                <span className={`text-2xl font-bold ${noteType === 'debit' ? 'text-amber-700' : 'text-emerald-700'}`}>₹{fmt(Math.abs(netAdj))}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Remarks (Optional)</Label>
              <Textarea placeholder="Notes for this settlement..." value={noteRemarks} onChange={(e) => setNoteRemarks(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateNoteDialog(false)}>Cancel</Button>
            <Button onClick={handleGenerateNote} disabled={generatingNote} className={noteType === 'debit' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} data-testid="confirm-generate-note-btn">
              {generatingNote ? 'Generating...' : `Generate ${noteType === 'debit' ? 'Debit' : 'Credit'} Note`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
