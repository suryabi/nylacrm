import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Trash2, DollarSign, RefreshCw, FileText, Calendar, Download, Building2, ChevronLeft, ChevronRight, Send, Check, X } from 'lucide-react';

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

// Generate years (current year and 2 years back)
const currentYear = new Date().getFullYear();
const YEARS = [currentYear, currentYear - 1, currentYear - 2];

export default function SettlementsTab({
  distributor,
  canManage,
  canDelete,
  canApprove,
  settlements,
  settlementsLoading,
  settlementsTotal,
  settlementsPage,
  settlementsPageSize,
  setSettlementsPage,
  setSettlementsPageSize,
  settlementsMonthFilter,
  setSettlementsMonthFilter,
  settlementsYearFilter,
  setSettlementsYearFilter,
  fetchSettlements,
  // Dialog state
  showSettlementDialog,
  setShowSettlementDialog,
  // Form
  settlementForm,
  setSettlementForm,
  resetSettlementForm,
  // Unsettled deliveries preview
  unsettledDeliveries,
  unsettledLoading,
  fetchUnsettledDeliveries,
  // Handlers
  handleCreateSettlement,
  handleSubmitSettlement,
  handleApproveSettlement,
  handleRejectSettlement,
  savingSettlement,
  viewSettlementDetail,
  setDeleteTarget,
  getSettlementStatusBadge,
  assignedAccounts
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [downloading, setDownloading] = useState(false);
  const [expandedSettlementAccounts, setExpandedSettlementAccounts] = useState({});
  
  const totalPages = Math.ceil((settlementsTotal || 0) / (settlementsPageSize || 20));

  // Toggle expanded state for settlement account groups
  const toggleSettlementAccount = (accountId) => {
    setExpandedSettlementAccounts(prev => ({
      ...prev,
      [accountId]: !prev[accountId]
    }));
  };

  // Group settlements by account
  const settlementsByAccount = React.useMemo(() => {
    return settlements.reduce((acc, settlement) => {
      const accountId = settlement.account_id || 'unknown';
      if (!acc[accountId]) {
        acc[accountId] = {
          account_id: accountId,
          account_name: settlement.account_name || 'Unknown Account',
          settlements: [],
          totals: {
            total_deliveries: 0,
            total_billing: 0,
            distributor_earnings: 0,
            margin_at_transfer: 0,
            adjustment: 0,
            price_premium: 0,
            factory_adjustment: 0
          }
        };
      }
      acc[accountId].settlements.push(settlement);
      acc[accountId].totals.total_deliveries += settlement.total_deliveries || 0;
      acc[accountId].totals.total_billing += settlement.total_billing_value || 0;
      acc[accountId].totals.distributor_earnings += settlement.distributor_earnings || 0;
      acc[accountId].totals.margin_at_transfer += settlement.margin_at_transfer_price || 0;
      acc[accountId].totals.adjustment += settlement.adjustment_payable || 0;
      acc[accountId].totals.price_premium += settlement.price_premium_payable || 0;
      acc[accountId].totals.factory_adjustment += settlement.factory_distributor_adjustment || 0;
      return acc;
    }, {});
  }, [settlements]);

  const settlementAccountGroups = Object.values(settlementsByAccount);

  // When dialog opens, set the month/year for settlement generation
  useEffect(() => {
    if (showSettlementDialog) {
      setSettlementForm(prev => ({
        ...prev,
        settlement_month: selectedMonth,
        settlement_year: selectedYear
      }));
      // Fetch unsettled deliveries for this month
      if (fetchUnsettledDeliveries) {
        fetchUnsettledDeliveries(selectedMonth, selectedYear);
      }
    }
  }, [showSettlementDialog, selectedMonth, selectedYear, setSettlementForm, fetchUnsettledDeliveries]);

  // Group unsettled deliveries by account
  const groupedByAccount = unsettledDeliveries.reduce((acc, del) => {
    const accountId = del.account_id || 'unknown';
    if (!acc[accountId]) {
      acc[accountId] = {
        account_id: accountId,
        account_name: del.account_name || 'Unknown Account',
        deliveries: [],
        total_billing: 0,
        billed_to_dist: 0,
        actual_billable: 0,
        adjustment: 0
      };
    }
    acc[accountId].deliveries.push(del);
    
    // Calculate totals from delivery items using NEW FORMULA
    const items = del.items || [];
    items.forEach(item => {
      const qty = item.quantity || 0;
      const customerPrice = item.customer_selling_price || item.unit_price || 0;
      const commissionPct = item.distributor_commission_percent || item.margin_percent || 2.5;
      const basePrice = item.base_price || item.transfer_price || 0;
      
      // Transfer Price = base_price × (1 - margin%)
      const transferPrice = basePrice > 0 ? basePrice * (1 - commissionPct / 100) : 0;
      // New Transfer Price = customer_price × (1 - margin%)
      const newTransferPrice = customerPrice > 0 ? customerPrice * (1 - commissionPct / 100) : 0;
      
      // Billed to Dist = qty × transfer_price
      const billedToDist = qty * transferPrice;
      // Actual Billable = qty × new_transfer_price
      const actualBillable = qty * newTransferPrice;
      // Adjustment = Actual Billable - Billed to Dist
      const adjustment = actualBillable - billedToDist;
      // Customer Invoice = qty × customer_price
      const billingValue = qty * customerPrice;
      
      acc[accountId].total_billing += billingValue;
      acc[accountId].billed_to_dist += billedToDist;
      acc[accountId].actual_billable += actualBillable;
      acc[accountId].adjustment += adjustment;
    });
    
    return acc;
  }, {});

  const accountGroups = Object.values(groupedByAccount);

  // Download as Excel
  const downloadExcel = async () => {
    setDownloading(true);
    try {
      const excelData = settlements.map(s => ({
        'Settlement #': s.settlement_number,
        'Month': s.settlement_month ? MONTHS.find(m => m.value === s.settlement_month)?.label : '-',
        'Year': s.settlement_year || '-',
        'Account Name': s.account_name || '-',
        'No of Deliveries': s.total_deliveries || 0,
        'Total Customer Billing Value': s.total_billing_value || 0,
        'Distributor Earnings (On Selling Price)': s.distributor_earnings || 0,
        'Distributor Margin at Transfer Price': s.margin_at_transfer_price || 0,
        'Adjustment Payable': s.adjustment_payable || 0,
        'Factory → Distributor Adjustment': s.factory_distributor_adjustment || 0,
        'Status': s.status
      }));
      
      if (excelData.length === 0) {
        alert('No data to download');
        return;
      }
      
      const headers = Object.keys(excelData[0]);
      const csvContent = [
        headers.join(','),
        ...excelData.map(row => 
          headers.map(header => {
            const value = row[header];
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',')
        )
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `settlements_${distributor?.name || 'distributor'}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Monthly Settlements</CardTitle>
            <CardDescription>Account-level settlements by month</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={downloadExcel} 
              disabled={downloading || settlements.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              {downloading ? 'Downloading...' : 'Download Excel'}
            </Button>
            
            {canManage && (
              <Dialog open={showSettlementDialog} onOpenChange={(open) => {
                setShowSettlementDialog(open);
                if (!open) resetSettlementForm();
              }}>
                <DialogTrigger asChild>
                  <Button data-testid="create-settlement-btn">
                    <Plus className="h-4 w-4 mr-2" />
                    Generate Settlement
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Generate Monthly Settlement</DialogTitle>
                    <DialogDescription>
                      Create settlements for each account for the selected month
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Month/Year Selection */}
                    <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg">
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
                        onClick={() => fetchUnsettledDeliveries && fetchUnsettledDeliveries(selectedMonth, selectedYear)}
                        disabled={unsettledLoading}
                      >
                        {unsettledLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Refresh'}
                      </Button>
                    </div>

                    {/* Preview by Account */}
                    <div className="border rounded-lg">
                      <div className="p-3 bg-muted/50 border-b">
                        <Label className="text-base font-semibold">
                          Deliveries for {MONTHS.find(m => m.value === selectedMonth)?.label} {selectedYear}
                        </Label>
                      </div>
                      
                      {unsettledLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin" />
                        </div>
                      ) : accountGroups.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <p className="text-sm">No unsettled deliveries found for this month</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/30">
                              <tr>
                                <th className="text-left p-3 font-medium">Account Name</th>
                                <th className="text-right p-3 font-medium">Deliveries</th>
                                <th className="text-right p-3 font-medium">Customer Invoice</th>
                                <th className="text-right p-3 font-medium bg-blue-50/50">Billed to Dist</th>
                                <th className="text-right p-3 font-medium bg-emerald-50/50">Actual Billable</th>
                                <th className="text-right p-3 font-medium bg-amber-50/50">Adjustment (Dist→Factory)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {accountGroups.map(group => (
                                <tr key={group.account_id} className="border-t hover:bg-muted/20">
                                  <td className="p-3 font-medium">{group.account_name}</td>
                                  <td className="p-3 text-right">{group.deliveries.length}</td>
                                  <td className="p-3 text-right">₹{group.total_billing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                  <td className="p-3 text-right bg-blue-50/30">₹{group.billed_to_dist.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                  <td className="p-3 text-right bg-emerald-50/30">₹{group.actual_billable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                  <td className={`p-3 text-right font-medium bg-amber-50/30 ${group.adjustment >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {group.adjustment >= 0 ? '+' : ''}₹{group.adjustment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-100 dark:bg-slate-800 font-semibold">
                              <tr>
                                <td className="p-3">Total ({accountGroups.length} accounts)</td>
                                <td className="p-3 text-right">{unsettledDeliveries.length}</td>
                                <td className="p-3 text-right">₹{accountGroups.reduce((s, g) => s + g.total_billing, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-right bg-blue-50/30">₹{accountGroups.reduce((s, g) => s + g.billed_to_dist, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-right bg-emerald-50/30">₹{accountGroups.reduce((s, g) => s + g.actual_billable, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className={`p-3 text-right bg-amber-50/30 ${accountGroups.reduce((s, g) => s + g.adjustment, 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {accountGroups.reduce((s, g) => s + g.adjustment, 0) >= 0 ? '+' : ''}₹{accountGroups.reduce((s, g) => s + g.adjustment, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Remarks */}
                    <div className="space-y-2">
                      <Label>Remarks</Label>
                      <Textarea
                        placeholder="Any notes for this settlement..."
                        value={settlementForm.remarks}
                        onChange={(e) => setSettlementForm(prev => ({ ...prev, remarks: e.target.value }))}
                        rows={2}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowSettlementDialog(false)}>Cancel</Button>
                    <Button
                      onClick={handleCreateSettlement}
                      disabled={savingSettlement || accountGroups.length === 0}
                      data-testid="save-settlement-btn"
                    >
                      {savingSettlement ? 'Creating...' : `Generate ${accountGroups.length} Settlement(s)`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
        
        {/* Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Month:</span>
            </div>
            <select
              value={settlementsMonthFilter || 'all'}
              onChange={(e) => {
                setSettlementsMonthFilter(e.target.value);
                setSettlementsPage(1);
              }}
              className="text-sm border rounded-md px-3 py-1.5 bg-background"
            >
              <option value="all">All Months</option>
              {MONTHS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Year:</span>
            </div>
            <select
              value={settlementsYearFilter || 'all'}
              onChange={(e) => {
                setSettlementsYearFilter(e.target.value);
                setSettlementsPage(1);
              }}
              className="text-sm border rounded-md px-3 py-1.5 bg-background"
            >
              <option value="all">All Years</option>
              {YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <select
                value={settlementsPageSize || 20}
                onChange={(e) => {
                  setSettlementsPageSize(Number(e.target.value));
                  setSettlementsPage(1);
                }}
                className="text-sm border rounded-md px-2 py-1.5 bg-background"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm text-muted-foreground">per page</span>
            </div>
            
            <div className="text-sm text-muted-foreground">
              Total: <span className="font-medium">{settlementsTotal || 0}</span> settlements
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {settlementsLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : settlements.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No settlements generated</p>
            <p className="text-sm">Generate a settlement for a month to calculate distributor payout per account</p>
          </div>
        ) : (
          <>
            {/* Settlements grouped by customer/account */}
            <div className="space-y-4">
              {settlementAccountGroups.map((group) => (
                <div key={group.account_id} className="border border-emerald-100 rounded-xl overflow-hidden shadow-[0_2px_8px_rgba(6,95,70,0.04)] hover:shadow-[0_8px_24px_rgba(6,95,70,0.08)] transition-[transform,box-shadow] duration-300">
                  {/* Account Header - Clickable */}
                  <div 
                    className="flex items-center justify-between p-5 bg-white cursor-pointer hover:bg-emerald-50/30 transition-colors duration-200"
                    onClick={() => toggleSettlementAccount(group.account_id)}
                    data-testid={`settlement-account-${group.account_id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-emerald-700" />
                      </div>
                      <div>
                        <p className="font-semibold text-base text-emerald-900" style={{ fontFamily: 'Manrope, sans-serif' }}>{group.account_name}</p>
                        <p className="text-sm text-emerald-600/60">{group.settlements.length} settlement(s)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-xs text-emerald-600/60 uppercase tracking-wider font-medium">Billing Value</p>
                        <p className="font-semibold text-slate-800">₹{group.totals.total_billing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-emerald-600/60 uppercase tracking-wider font-medium">Earnings</p>
                        <p className="font-semibold text-emerald-600">₹{group.totals.distributor_earnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-emerald-600/60 uppercase tracking-wider font-medium">Factory → Dist Adj</p>
                        <p className={`font-semibold ${group.totals.factory_adjustment > 0 ? 'text-emerald-600' : group.totals.factory_adjustment < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {group.totals.factory_adjustment > 0 ? '+' : ''}₹{Math.abs(group.totals.factory_adjustment).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                        {expandedSettlementAccounts[group.account_id] ? (
                          <ChevronLeft className="h-5 w-5 text-emerald-700 rotate-90" />
                        ) : (
                          <ChevronLeft className="h-5 w-5 text-emerald-700 -rotate-90" />
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Expanded Settlements Table */}
                  {expandedSettlementAccounts[group.account_id] && (
                    <div className="border-t border-emerald-100">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-emerald-50/30 border-b border-emerald-100/60">
                            <th className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Settlement #</th>
                            <th className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Month/Year</th>
                            <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Deliveries</th>
                            <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Billing Value</th>
                            <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Earnings</th>
                            <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Margin at Transfer</th>
                            <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Factory → Dist Adj</th>
                            <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Status</th>
                            <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.settlements.map((settlement, index) => (
                            <tr 
                              key={settlement.id} 
                              className={`border-b border-emerald-50 transition-colors duration-200 cursor-pointer
                                ${index % 2 === 1 ? 'bg-emerald-50/40' : 'bg-white'}
                                hover:bg-emerald-50/60`}
                              onClick={() => viewSettlementDetail(settlement.id)}
                            >
                              <td className="p-4">
                                <button 
                                  className="font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    viewSettlementDetail(settlement.id);
                                  }}
                                >
                                  {settlement.settlement_number}
                                </button>
                              </td>
                              <td className="p-4 text-slate-700">
                                {settlement.settlement_month ? MONTHS.find(m => m.value === settlement.settlement_month)?.label : '-'} {settlement.settlement_year}
                              </td>
                              <td className="p-4 text-right text-slate-800">{settlement.total_deliveries || 0}</td>
                              <td className="p-4 text-right font-medium text-slate-800">₹{(settlement.total_billing_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="p-4 text-right text-emerald-600 font-medium">₹{(settlement.distributor_earnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className="p-4 text-right text-slate-700">₹{(settlement.margin_at_transfer_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td className={`p-4 text-right font-medium ${(settlement.factory_distributor_adjustment || settlement.adjustment_payable || 0) > 0 ? 'text-emerald-600' : (settlement.factory_distributor_adjustment || settlement.adjustment_payable || 0) < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                {(() => { const v = settlement.factory_distributor_adjustment || settlement.adjustment_payable || 0; return `${v > 0 ? '+' : ''}₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`; })()}
                              </td>
                              <td className="p-4 text-center">
                                {getSettlementStatusBadge(settlement.status)}
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 hover:bg-emerald-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      viewSettlementDetail(settlement.id);
                                    }}
                                  >
                                    <FileText className="h-4 w-4 text-emerald-700" />
                                  </Button>
                                  {settlement.status === 'draft' && canManage && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSubmitSettlement && handleSubmitSettlement(settlement.id);
                                      }}
                                      title="Submit for Approval"
                                    >
                                      <Send className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {settlement.status === 'pending_approval' && canApprove && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleApproveSettlement && handleApproveSettlement(settlement.id);
                                        }}
                                        title="Approve"
                                      >
                                        <Check className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRejectSettlement && handleRejectSettlement(settlement.id);
                                        }}
                                        title="Reject"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                  {(canDelete || (canManage && settlement.status === 'draft')) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-destructive hover:bg-red-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteTarget({
                                          type: 'settlement',
                                          id: settlement.id,
                                          name: settlement.settlement_number
                                        });
                                      }}
                                      title="Delete"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                          {/* Account Total Row */}
                          <tr className="bg-emerald-100/50 font-semibold">
                            <td colSpan={2} className="p-4 text-right text-emerald-800">Account Total:</td>
                            <td className="p-4 text-right text-emerald-800">{group.totals.total_deliveries}</td>
                            <td className="p-4 text-right text-emerald-800">₹{group.totals.total_billing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-4 text-right text-emerald-600">₹{group.totals.distributor_earnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-4 text-right text-emerald-800">₹{group.totals.margin_at_transfer.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className={`p-4 text-right ${group.totals.adjustment >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {group.totals.adjustment >= 0 ? '+' : ''}₹{group.totals.adjustment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td colSpan={2}></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
              
              {/* Grand Total */}
              <div className="border border-emerald-200 rounded-xl p-6 bg-gradient-to-r from-emerald-50 to-emerald-100/50 shadow-[0_2px_8px_rgba(6,95,70,0.04)]">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-emerald-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                    Grand Total ({settlementAccountGroups.length} customer(s), {settlements.length} settlement(s))
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="text-xs text-emerald-600/60 uppercase tracking-wider font-medium">Total Billing</p>
                      <p className="font-bold text-lg text-emerald-800">₹{settlementAccountGroups.reduce((sum, g) => sum + g.totals.total_billing, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-emerald-600/60 uppercase tracking-wider font-medium">Total Earnings</p>
                      <p className="font-bold text-lg text-emerald-600">₹{settlementAccountGroups.reduce((sum, g) => sum + g.totals.distributor_earnings, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-emerald-600/60 uppercase tracking-wider font-medium">Net Adjustment</p>
                      <p className={`font-bold text-lg ${settlementAccountGroups.reduce((sum, g) => sum + g.totals.adjustment, 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {settlementAccountGroups.reduce((sum, g) => sum + g.totals.adjustment, 0) >= 0 ? '+' : ''}₹{settlementAccountGroups.reduce((sum, g) => sum + g.totals.adjustment, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {((settlementsPage - 1) * settlementsPageSize) + 1} to {Math.min(settlementsPage * settlementsPageSize, settlementsTotal)} of {settlementsTotal} settlements
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSettlementsPage(1)}
                    disabled={settlementsPage === 1}
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSettlementsPage(prev => Math.max(1, prev - 1))}
                    disabled={settlementsPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm px-2">Page {settlementsPage} of {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSettlementsPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={settlementsPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSettlementsPage(totalPages)}
                    disabled={settlementsPage === totalPages}
                  >
                    Last
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
