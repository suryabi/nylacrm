import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Plus, RefreshCw, FileText, Receipt, Eye, Settings, Trash2, Calendar, Building2, ChevronDown, ChevronUp, Download, Clock, CheckCircle, FileDown, Loader2 } from 'lucide-react';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
];

const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2];

export default function BillingTab({
  distributor,
  canManage,
  canDelete,
  // Settlements for reconciliation
  settlements,
  settlementsLoading,
  fetchSettlements,
  // Debit/Credit Notes
  debitCreditNotes,
  notesLoading,
  fetchNotes,
  viewNoteDetail,
  getNoteStatusBadge,
  getSettlementStatusBadge,
  // Navigate to margins tab
  setActiveTab,
  setDeleteTarget,
  // API
  API_URL,
  token
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [expandedAccounts, setExpandedAccounts] = useState({});
  const [showGenerateNoteDialog, setShowGenerateNoteDialog] = useState(false);
  const [generatingNote, setGeneratingNote] = useState(false);
  const [noteRemarks, setNoteRemarks] = useState('');
  const [monthlyData, setMonthlyData] = useState(null);
  const [loadingMonthlyData, setLoadingMonthlyData] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(null); // Track which note is downloading

  // Fetch settlements for selected month when month/year changes
  useEffect(() => {
    if (distributor?.id) {
      fetchMonthlyReconciliationData();
    }
  }, [selectedMonth, selectedYear, distributor?.id]);

  const fetchMonthlyReconciliationData = async () => {
    if (!distributor?.id) return;
    
    setLoadingMonthlyData(true);
    try {
      // Get token and tenant from localStorage (standard pattern used across the app)
      const authToken = token || localStorage.getItem('token');
      const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
      
      console.log('Fetching monthly reconciliation:', { month: selectedMonth, year: selectedYear, distributor: distributor.id, tenant: tenantId });
      
      const response = await fetch(
        `${API_URL}/api/distributors/${distributor.id}/monthly-reconciliation?month=${selectedMonth}&year=${selectedYear}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Tenant-ID': tenantId
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        console.log('Monthly reconciliation data:', data);
        setMonthlyData(data);
      } else {
        console.error('Failed to fetch monthly reconciliation:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Failed to fetch monthly reconciliation data:', error);
    } finally {
      setLoadingMonthlyData(false);
    }
  };

  const toggleAccountExpand = (accountId) => {
    setExpandedAccounts(prev => ({
      ...prev,
      [accountId]: !prev[accountId]
    }));
  };

  const handleGenerateNote = async () => {
    if (!monthlyData || monthlyData.net_adjustment === 0) return;
    
    setGeneratingNote(true);
    try {
      const authToken = token || localStorage.getItem('token');
      const tenantId = localStorage.getItem('selectedTenant') || localStorage.getItem('tenant_id') || 'nyla-air-water';
      
      const response = await fetch(
        `${API_URL}/api/distributors/${distributor.id}/generate-monthly-note`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'X-Tenant-ID': tenantId
          },
          body: JSON.stringify({
            month: selectedMonth,
            year: selectedYear,
            remarks: noteRemarks
          })
        }
      );
      
      if (response.ok) {
        setShowGenerateNoteDialog(false);
        setNoteRemarks('');
        fetchMonthlyReconciliationData();
        if (fetchNotes) fetchNotes();
        alert('Note generated successfully with PDF!');
      } else {
        const error = await response.json();
        alert(`Failed to generate note: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to generate note:', error);
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
      
      const response = await fetch(
        `${API_URL}/api/distributors/${distributor.id}/notes/${note.id}/download`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'X-Tenant-ID': tenantId
          }
        }
      );
      
      if (response.ok) {
        // Get the blob from response
        const blob = await response.blob();
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${note.note_number || 'note'}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        const error = await response.json();
        alert(`Failed to download PDF: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to download PDF:', error);
      alert('Failed to download PDF');
    } finally {
      setDownloadingPdf(null);
    }
  };

  // Group UNRECONCILED settlements by account (these can be reconciled)
  const unreconciledByAccount = (monthlyData?.unreconciled_settlements || []).reduce((acc, settlement) => {
    const accountId = settlement.account_id || 'unknown';
    if (!acc[accountId]) {
      acc[accountId] = {
        account_id: accountId,
        account_name: settlement.account_name || 'Unknown Account',
        settlements: [],
        totals: {
          total_billing: 0,
          distributor_earnings: 0,
          margin_at_transfer: 0,
          adjustment: 0,
          price_premium: 0,
          factory_adjustment: 0,
          credit_notes_applied: 0,
          factory_return_credit: 0
        }
      };
    }
    acc[accountId].settlements.push(settlement);
    acc[accountId].totals.total_billing += settlement.total_billing_value || 0;
    acc[accountId].totals.distributor_earnings += settlement.distributor_earnings || 0;
    acc[accountId].totals.margin_at_transfer += settlement.margin_at_transfer_price || 0;
    acc[accountId].totals.adjustment += settlement.adjustment_payable || 0;
    acc[accountId].totals.price_premium += settlement.price_premium_payable || 0;
    acc[accountId].totals.factory_adjustment += settlement.factory_distributor_adjustment || 0;
    acc[accountId].totals.credit_notes_applied += settlement.total_credit_notes_issued || settlement.credit_notes_applied || 0;
    acc[accountId].totals.factory_return_credit += settlement.total_factory_return_credit || 0;
    return acc;
  }, {});

  const unreconciledGroups = Object.values(unreconciledByAccount);

  // Group RECONCILED settlements by account (already processed)
  const reconciledByAccount = (monthlyData?.reconciled_settlements || []).reduce((acc, settlement) => {
    const accountId = settlement.account_id || 'unknown';
    if (!acc[accountId]) {
      acc[accountId] = {
        account_id: accountId,
        account_name: settlement.account_name || 'Unknown Account',
        settlements: [],
        totals: {
          total_billing: 0,
          adjustment: 0
        }
      };
    }
    acc[accountId].settlements.push(settlement);
    acc[accountId].totals.total_billing += settlement.total_billing_value || 0;
    acc[accountId].totals.adjustment += settlement.adjustment_payable || 0;
    return acc;
  }, {});

  const reconciledGroups = Object.values(reconciledByAccount);

  // Calculate grand totals for unreconciled only
  const grandTotals = unreconciledGroups.reduce((acc, group) => ({
    total_billing: acc.total_billing + group.totals.total_billing,
    distributor_earnings: acc.distributor_earnings + group.totals.distributor_earnings,
    margin_at_transfer: acc.margin_at_transfer + group.totals.margin_at_transfer,
    adjustment: acc.adjustment + group.totals.adjustment,
    price_premium: acc.price_premium + group.totals.price_premium,
    factory_adjustment: acc.factory_adjustment + group.totals.factory_adjustment,
    credit_notes_applied: acc.credit_notes_applied + group.totals.credit_notes_applied,
    factory_return_credit: acc.factory_return_credit + group.totals.factory_return_credit
  }), { total_billing: 0, distributor_earnings: 0, margin_at_transfer: 0, adjustment: 0, price_premium: 0, factory_adjustment: 0, credit_notes_applied: 0, factory_return_credit: 0 });

  const noteType = grandTotals.adjustment >= 0 ? 'credit' : 'debit';
  const existingNotes = monthlyData?.existing_notes || [];
  const hasUnreconciledSettlements = unreconciledGroups.length > 0;

  return (
    <div className="space-y-6">
      {/* Pricing Configuration Note */}
      <Card className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800">Base Prices & Margins</p>
              <p className="text-sm text-blue-700 mt-1">
                Base prices and margin percentages are configured in the <strong>Margins</strong> tab.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2 border-blue-300 text-blue-700 hover:bg-blue-100"
                onClick={() => setActiveTab('margins')}
              >
                Go to Margins Tab
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Reconciliation Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Monthly Reconciliation
              </CardTitle>
              <CardDescription>
                View all settlements for a month and generate Debit/Credit Note
              </CardDescription>
            </div>
          </div>
          
          {/* Month/Year Selection */}
          <div className="flex items-center gap-4 mt-4 p-4 bg-muted/30 rounded-lg">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <Label>Month:</Label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="border rounded-md px-3 py-1.5 bg-background"
              >
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label>Year:</Label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="border rounded-md px-3 py-1.5 bg-background"
              >
                {YEARS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={fetchMonthlyReconciliationData}
              disabled={loadingMonthlyData}
            >
              {loadingMonthlyData ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Refresh'}
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          {loadingMonthlyData ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !hasUnreconciledSettlements && reconciledGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No approved settlements found for {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}</p>
              <p className="text-sm">Generate and approve settlements from the Settlements tab first</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Pending Reconciliation Section */}
              {hasUnreconciledSettlements && (
                <>
                  <div className="border-l-4 border-orange-500 pl-4">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-orange-500" />
                      Pending Reconciliation
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {unreconciledGroups.length} account(s) with {monthlyData?.total_unreconciled || 0} approved settlement(s) ready to reconcile
                    </p>
                  </div>

                  {/* Summary Cards for Unreconciled */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    <Card className="bg-muted/30">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">Accounts</p>
                        <p className="text-2xl font-bold">{unreconciledGroups.length}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/30">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">Billing Value</p>
                        <p className="text-xl font-bold">₹{grandTotals.total_billing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-blue-50">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">Distributor Earnings</p>
                        <p className="text-xl font-bold text-blue-600">₹{grandTotals.distributor_earnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </CardContent>
                    </Card>
                    <Card className={grandTotals.factory_adjustment > 0 ? 'bg-amber-50 border-amber-200' : 'bg-muted/30'}>
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">① Price Adj (Dist → Factory)</p>
                        <p className={`text-xl font-bold ${grandTotals.factory_adjustment > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          {grandTotals.factory_adjustment > 0 ? '-' : ''}₹{Math.abs(grandTotals.factory_adjustment).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {grandTotals.factory_adjustment > 0 ? 'Deducted from Distributor' : 'No Price Adjustment'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-emerald-50 border-emerald-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">② Return Credits (Factory → Dist)</p>
                        <p className="text-xl font-bold text-emerald-600">
                          +₹{(grandTotals.credit_notes_applied || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Customer credit reimbursement
                        </p>
                      </CardContent>
                    </Card>
                    <Card className={grandTotals.factory_return_credit > 0 ? 'bg-purple-50 border-purple-200' : 'bg-muted/30'}>
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">③ Factory Returns (Factory → Dist)</p>
                        <p className={`text-xl font-bold ${grandTotals.factory_return_credit > 0 ? 'text-purple-600' : 'text-slate-400'}`}>
                          +₹{(grandTotals.factory_return_credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {grandTotals.factory_return_credit > 0 ? 'Expired/damaged stock credit' : 'No factory returns'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-indigo-50 border-indigo-200">
                      <CardContent className="p-4 text-center">
                        <p className="text-sm text-muted-foreground">Net Payout</p>
                        <p className="text-xl font-bold text-indigo-600">
                          ₹{(grandTotals.distributor_earnings - grandTotals.factory_adjustment + (grandTotals.credit_notes_applied || 0) + (grandTotals.factory_return_credit || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Earnings - ① + ② + ③
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Unreconciled Settlements by Account */}
                  <div className="border rounded-lg">
                    <div className="p-3 bg-orange-50 border-b font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4 text-orange-500" />
                      Settlements Pending Reconciliation
                    </div>
                    <div className="divide-y">
                      {unreconciledGroups.map(group => (
                        <div key={group.account_id}>
                          <div 
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => toggleAccountExpand(group.account_id)}
                          >
                            <div className="flex items-center gap-3">
                              <Building2 className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{group.account_name}</p>
                                <p className="text-sm text-muted-foreground">{group.settlements.length} settlement(s)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <p className="text-sm text-muted-foreground">Billing</p>
                                <p className="font-medium">₹{group.totals.total_billing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-muted-foreground">① Price Adj</p>
                                <p className={`font-medium ${group.totals.factory_adjustment > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                  {group.totals.factory_adjustment > 0 ? '-' : ''}₹{Math.abs(group.totals.factory_adjustment).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-muted-foreground">② Return Credits</p>
                                <p className="font-medium text-emerald-600">
                                  {group.totals.credit_notes_applied > 0 
                                    ? `+₹${group.totals.credit_notes_applied.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                    : '-'
                                  }
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-muted-foreground">③ Factory Returns</p>
                                <p className="font-medium text-purple-600">
                                  {group.totals.factory_return_credit > 0 
                                    ? `+₹${group.totals.factory_return_credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                                    : '-'
                                  }
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-muted-foreground">Net Payout</p>
                                <p className="font-medium text-indigo-600">
                                  ₹{(group.totals.distributor_earnings - group.totals.factory_adjustment + group.totals.credit_notes_applied + group.totals.factory_return_credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </p>
                              </div>
                              {expandedAccounts[group.account_id] ? (
                                <ChevronUp className="h-5 w-5 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                          
                          {expandedAccounts[group.account_id] && (
                            <div className="bg-muted/20 p-4 border-t">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left p-2 font-medium">Settlement #</th>
                                    <th className="text-right p-2 font-medium">Deliveries</th>
                                    <th className="text-right p-2 font-medium">Billing</th>
                                    <th className="text-right p-2 font-medium">Earnings</th>
                                    <th className="text-right p-2 font-medium">① Price Adj</th>
                                    <th className="text-right p-2 font-medium">② Return Credits</th>
                                    <th className="text-right p-2 font-medium">③ Factory Returns</th>
                                    <th className="text-right p-2 font-medium">Net Payout</th>
                                    <th className="text-center p-2 font-medium">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.settlements.map(settlement => {
                                    const priceAdj = settlement.factory_distributor_adjustment || settlement.adjustment_payable || 0;
                                    const creditNotes = settlement.total_credit_notes_issued || settlement.credit_notes_applied || 0;
                                    const factoryReturnCredit = settlement.total_factory_return_credit || 0;
                                    const earnings = settlement.distributor_earnings || 0;
                                    const netPayout = earnings - priceAdj + creditNotes + factoryReturnCredit;
                                    
                                    return (
                                      <tr key={settlement.id} className="border-b hover:bg-muted/30">
                                        <td className="p-2 font-medium">{settlement.settlement_number}</td>
                                        <td className="p-2 text-right">{settlement.total_deliveries || 0}</td>
                                        <td className="p-2 text-right">₹{(settlement.total_billing_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td className="p-2 text-right text-blue-600">₹{earnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        <td className={`p-2 text-right ${priceAdj > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                          {priceAdj > 0 ? `-₹${priceAdj.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                                        </td>
                                        <td className="p-2 text-right text-emerald-600">
                                          {creditNotes > 0 ? `+₹${creditNotes.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                                        </td>
                                        <td className="p-2 text-right text-purple-600">
                                          {factoryReturnCredit > 0 ? `+₹${factoryReturnCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                                        </td>
                                        <td className="p-2 text-right font-medium text-indigo-600">
                                          ₹{netPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 text-center">
                                          {getSettlementStatusBadge ? getSettlementStatusBadge(settlement.status) : (
                                            <Badge variant="outline">{settlement.status}</Badge>
                                          )}
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
                    </div>
                    
                    {/* Grand Total Row */}
                    <div className="p-4 bg-slate-100 dark:bg-slate-800 border-t-2">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">Total Pending ({unreconciledGroups.length} accounts, {monthlyData?.total_unreconciled || 0} settlements)</div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Billing</p>
                            <p className="font-bold">₹{grandTotals.total_billing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Net Adjustment</p>
                            <p className={`font-bold ${grandTotals.adjustment >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {grandTotals.adjustment >= 0 ? '+' : ''}₹{grandTotals.adjustment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="w-20"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Generate Note Button */}
                  <div className="flex justify-end">
                    {grandTotals.adjustment !== 0 ? (
                      <Button
                        onClick={() => setShowGenerateNoteDialog(true)}
                        className={noteType === 'credit' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                        data-testid="generate-note-btn"
                      >
                        <Receipt className="h-4 w-4 mr-2" />
                        Generate {noteType === 'credit' ? 'Credit' : 'Debit'} Note (₹{Math.abs(grandTotals.adjustment).toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                      </Button>
                    ) : (
                      <div className="text-muted-foreground">
                        Net adjustment is ₹0 - no note required
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Already Reconciled Section */}
              {reconciledGroups.length > 0 && (
                <>
                  <div className="border-l-4 border-green-500 pl-4 mt-6">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      Already Reconciled
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {reconciledGroups.length} account(s) with {monthlyData?.total_reconciled || 0} settlement(s) already processed
                    </p>
                  </div>

                  <div className="border rounded-lg">
                    <div className="p-3 bg-green-50 border-b font-medium flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Reconciled Settlements
                    </div>
                    <div className="divide-y">
                      {reconciledGroups.map(group => (
                        <div key={group.account_id} className="flex items-center justify-between p-4">
                          <div className="flex items-center gap-3">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{group.account_name}</p>
                              <p className="text-sm text-muted-foreground">{group.settlements.length} settlement(s)</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Billing</p>
                              <p className="font-medium">₹{group.totals.total_billing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Adjustment</p>
                              <p className={`font-medium ${group.totals.adjustment >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {group.totals.adjustment >= 0 ? '+' : ''}₹{group.totals.adjustment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Reconciled
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-4 bg-green-50 border-t">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-green-700">Total Reconciled</div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="font-bold">₹{(monthlyData?.reconciled_billing_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold ${(monthlyData?.reconciled_adjustment || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {(monthlyData?.reconciled_adjustment || 0) >= 0 ? '+' : ''}₹{(monthlyData?.reconciled_adjustment || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="w-24"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* No pending settlements message */}
              {!hasUnreconciledSettlements && reconciledGroups.length > 0 && (
                <div className="text-center py-6 text-muted-foreground bg-muted/30 rounded-lg">
                  <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                  <p>All approved settlements for {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear} have been reconciled</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debit/Credit Notes Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Debit / Credit Notes
          </CardTitle>
          <CardDescription>Monthly reconciliation notes for this distributor</CardDescription>
        </CardHeader>
        <CardContent>
          {notesLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          ) : debitCreditNotes.length === 0 ? (
            <div className="text-center py-8 text-emerald-600/60">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No debit/credit notes yet</p>
              <p className="text-sm">Generate notes from monthly reconciliation above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-emerald-50/30 border-b border-emerald-100/60">
                    <th className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Note #</th>
                    <th className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Month/Year</th>
                    <th className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Type</th>
                    <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Amount</th>
                    <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Paid</th>
                    <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Balance</th>
                    <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Status</th>
                    <th className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Created</th>
                    <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>PDF</th>
                    <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {debitCreditNotes.map((note, index) => (
                    <tr 
                      key={note.id} 
                      className={`border-b border-emerald-50 transition-colors duration-200 cursor-pointer
                        ${index % 2 === 1 ? 'bg-emerald-50/40' : 'bg-white'}
                        hover:bg-emerald-50/60`}
                      onClick={() => viewNoteDetail && viewNoteDetail(note.id)}
                    >
                      <td className="p-4 font-medium text-emerald-700">{note.note_number}</td>
                      <td className="p-4 text-slate-700">
                        {note.month ? `${MONTHS.find(m => m.value === note.month)?.label || note.month} ${note.year}` : '-'}
                      </td>
                      <td className="p-4">
                        <Badge variant={note.note_type === 'debit' ? 'destructive' : 'default'} className={note.note_type === 'credit' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : ''}>
                          {note.note_type === 'debit' ? 'Debit Note' : 'Credit Note'}
                        </Badge>
                      </td>
                      <td className="p-4 text-right font-medium text-slate-800">₹{(note.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-right text-emerald-600 font-medium">₹{(note.paid_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-right text-orange-600 font-medium">₹{(note.balance_amount || note.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-center">{getNoteStatusBadge ? getNoteStatusBadge(note.status) : <Badge variant="outline">{note.status}</Badge>}</td>
                      <td className="p-4 text-slate-700">{note.created_at?.split('T')[0]}</td>
                      <td className="p-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadPdf(note);
                          }}
                          disabled={downloadingPdf === note.id}
                          data-testid={`download-pdf-${note.id}`}
                          title="Download PDF"
                        >
                          {downloadingPdf === note.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileDown className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 hover:bg-emerald-100"
                            onClick={(e) => { e.stopPropagation(); viewNoteDetail && viewNoteDetail(note.id); }}
                          >
                            <Eye className="h-4 w-4 text-emerald-700" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({
                                  type: 'note',
                                  id: note.id,
                                  name: note.note_number
                                });
                              }}
                              data-testid={`delete-note-${note.id}`}
                              title="Delete (Admin)"
                            >
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Generate {noteType === 'credit' ? 'Credit' : 'Debit'} Note
            </DialogTitle>
            <DialogDescription>
              Create a {noteType} note for {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Total Accounts</p>
                <p className="text-xl font-bold">{unreconciledGroups.length}</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Total Settlements</p>
                <p className="text-xl font-bold">{monthlyData?.total_unreconciled || 0}</p>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg ${noteType === 'credit' ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-sm text-muted-foreground">Net Adjustment Amount</p>
              <p className={`text-2xl font-bold ${noteType === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                ₹{Math.abs(grandTotals.adjustment).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-sm mt-1">
                {noteType === 'credit' 
                  ? 'This amount will be credited to the distributor' 
                  : 'This amount is owed by the distributor'}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Remarks (Optional)</Label>
              <Textarea
                placeholder="Any notes for this reconciliation..."
                value={noteRemarks}
                onChange={(e) => setNoteRemarks(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateNoteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerateNote}
              disabled={generatingNote}
              className={noteType === 'credit' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {generatingNote ? 'Generating...' : `Generate ${noteType === 'credit' ? 'Credit' : 'Debit'} Note`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
