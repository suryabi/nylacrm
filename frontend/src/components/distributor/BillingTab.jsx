import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Plus, RefreshCw, FileText, Receipt, Eye, Settings, Trash2, Calendar, Building2, ChevronDown, ChevronUp, Download } from 'lucide-react';

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
        alert('Note generated successfully!');
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

  // Group settlements by account
  const settlementsByAccount = (monthlyData?.settlements || []).reduce((acc, settlement) => {
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
          adjustment: 0
        }
      };
    }
    acc[accountId].settlements.push(settlement);
    acc[accountId].totals.total_billing += settlement.total_billing_value || 0;
    acc[accountId].totals.distributor_earnings += settlement.distributor_earnings || 0;
    acc[accountId].totals.margin_at_transfer += settlement.margin_at_transfer_price || 0;
    acc[accountId].totals.adjustment += settlement.adjustment_payable || 0;
    return acc;
  }, {});

  const accountGroups = Object.values(settlementsByAccount);

  // Calculate grand totals
  const grandTotals = accountGroups.reduce((acc, group) => ({
    total_billing: acc.total_billing + group.totals.total_billing,
    distributor_earnings: acc.distributor_earnings + group.totals.distributor_earnings,
    margin_at_transfer: acc.margin_at_transfer + group.totals.margin_at_transfer,
    adjustment: acc.adjustment + group.totals.adjustment
  }), { total_billing: 0, distributor_earnings: 0, margin_at_transfer: 0, adjustment: 0 });

  const noteType = grandTotals.adjustment >= 0 ? 'credit' : 'debit';
  const hasExistingNote = monthlyData?.existing_note != null;

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
          ) : accountGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No settlements found for {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}</p>
              <p className="text-sm">Generate settlements from the Settlements tab first</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="bg-muted/30">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">Total Accounts</p>
                    <p className="text-2xl font-bold">{accountGroups.length}</p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">Total Billing Value</p>
                    <p className="text-xl font-bold">₹{grandTotals.total_billing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  </CardContent>
                </Card>
                <Card className="bg-blue-50">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">Distributor Earnings</p>
                    <p className="text-xl font-bold text-blue-600">₹{grandTotals.distributor_earnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  </CardContent>
                </Card>
                <Card className="bg-slate-100">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">Margin at Transfer</p>
                    <p className="text-xl font-bold">₹{grandTotals.margin_at_transfer.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                  </CardContent>
                </Card>
                <Card className={grandTotals.adjustment >= 0 ? 'bg-green-50' : 'bg-red-50'}>
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">Net Adjustment</p>
                    <p className={`text-xl font-bold ${grandTotals.adjustment >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {grandTotals.adjustment >= 0 ? '+' : ''}₹{grandTotals.adjustment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {grandTotals.adjustment >= 0 ? 'Credit Note' : 'Debit Note'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Settlements by Account */}
              <div className="border rounded-lg">
                <div className="p-3 bg-muted/50 border-b font-medium">
                  Settlements by Account - {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}
                </div>
                <div className="divide-y">
                  {accountGroups.map(group => (
                    <div key={group.account_id}>
                      {/* Account Header */}
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
                            <p className="text-sm text-muted-foreground">Earnings</p>
                            <p className="font-medium text-blue-600">₹{group.totals.distributor_earnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Adjustment</p>
                            <p className={`font-medium ${group.totals.adjustment >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {group.totals.adjustment >= 0 ? '+' : ''}₹{group.totals.adjustment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          {expandedAccounts[group.account_id] ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      
                      {/* Expanded Settlement Details */}
                      {expandedAccounts[group.account_id] && (
                        <div className="bg-muted/20 p-4 border-t">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left p-2 font-medium">Settlement #</th>
                                <th className="text-right p-2 font-medium">Deliveries</th>
                                <th className="text-right p-2 font-medium">Billing Value</th>
                                <th className="text-right p-2 font-medium">Earnings</th>
                                <th className="text-right p-2 font-medium">Margin at Transfer</th>
                                <th className="text-right p-2 font-medium">Adjustment</th>
                                <th className="text-center p-2 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.settlements.map(settlement => (
                                <tr key={settlement.id} className="border-b hover:bg-muted/30">
                                  <td className="p-2 font-medium">{settlement.settlement_number}</td>
                                  <td className="p-2 text-right">{settlement.total_deliveries || 0}</td>
                                  <td className="p-2 text-right">₹{(settlement.total_billing_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                  <td className="p-2 text-right text-blue-600">₹{(settlement.distributor_earnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                  <td className="p-2 text-right">₹{(settlement.margin_at_transfer_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                  <td className={`p-2 text-right font-medium ${(settlement.adjustment_payable || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {(settlement.adjustment_payable || 0) >= 0 ? '+' : ''}₹{(settlement.adjustment_payable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="p-2 text-center">
                                    {getSettlementStatusBadge ? getSettlementStatusBadge(settlement.status) : (
                                      <Badge variant="outline">{settlement.status}</Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
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
                    <div className="font-semibold">Grand Total ({accountGroups.length} accounts, {monthlyData?.settlements?.length || 0} settlements)</div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Billing</p>
                        <p className="font-bold">₹{grandTotals.total_billing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Earnings</p>
                        <p className="font-bold text-blue-600">₹{grandTotals.distributor_earnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Net Adjustment</p>
                        <p className={`font-bold ${grandTotals.adjustment >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {grandTotals.adjustment >= 0 ? '+' : ''}₹{grandTotals.adjustment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="w-24"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Generate Note Button */}
              <div className="flex justify-end gap-4 pt-4">
                {hasExistingNote ? (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Receipt className="h-5 w-5" />
                    <span>
                      {noteType === 'credit' ? 'Credit' : 'Debit'} Note already generated for this month: 
                      <strong className="ml-1">{monthlyData.existing_note.note_number}</strong>
                    </span>
                  </div>
                ) : grandTotals.adjustment !== 0 ? (
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
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : debitCreditNotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No debit/credit notes yet</p>
              <p className="text-sm">Generate notes from monthly reconciliation above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Note #</th>
                    <th className="text-left p-3 font-medium">Month/Year</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    <th className="text-right p-3 font-medium">Paid</th>
                    <th className="text-right p-3 font-medium">Balance</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Created</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {debitCreditNotes.map((note) => (
                    <tr key={note.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => viewNoteDetail && viewNoteDetail(note.id)}>
                      <td className="p-3 font-medium">{note.note_number}</td>
                      <td className="p-3">
                        {note.month ? `${MONTHS.find(m => m.value === note.month)?.label || note.month} ${note.year}` : '-'}
                      </td>
                      <td className="p-3">
                        <Badge variant={note.note_type === 'debit' ? 'destructive' : 'default'}>
                          {note.note_type === 'debit' ? 'Debit Note' : 'Credit Note'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-medium">₹{(note.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-green-600">₹{(note.paid_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-orange-600">₹{(note.balance_amount || note.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-center">{getNoteStatusBadge ? getNoteStatusBadge(note.status) : <Badge variant="outline">{note.status}</Badge>}</td>
                      <td className="p-3">{note.created_at?.split('T')[0]}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); viewNoteDetail && viewNoteDetail(note.id); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
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
                <p className="text-xl font-bold">{accountGroups.length}</p>
              </div>
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Total Settlements</p>
                <p className="text-xl font-bold">{monthlyData?.settlements?.length || 0}</p>
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
