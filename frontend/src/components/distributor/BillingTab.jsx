import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Plus, RefreshCw, FileText, Receipt, Eye, Settings } from 'lucide-react';

export default function BillingTab({
  canManage,
  // Summary
  billingSummary,
  // Reconciliations
  reconciliations,
  reconciliationsLoading,
  showReconciliationDialog,
  setShowReconciliationDialog,
  setReconciliationPreview,
  viewReconciliationDetail,
  getReconciliationStatusBadge,
  // Debit/Credit Notes
  debitCreditNotes,
  notesLoading,
  viewNoteDetail,
  getNoteStatusBadge,
  // Navigate to margins tab
  setActiveTab
}) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {billingSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Base Prices Configured</p>
              <p className="text-2xl font-bold">{billingSummary.billing_configs || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100/50">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Unreconciled Deliveries</p>
              <p className="text-2xl font-bold">{billingSummary.unreconciled_deliveries || 0}</p>
            </CardContent>
          </Card>
          <Card className={`bg-gradient-to-br ${billingSummary.net_balance > 0 ? 'from-red-50 to-red-100/50' : 'from-green-50 to-green-100/50'}`}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Net Balance</p>
              <p className="text-2xl font-bold">
                ₹{Math.abs(billingSummary.net_balance || 0).toLocaleString()}
                <span className="text-sm font-normal ml-1">
                  {billingSummary.net_balance > 0 ? '(Receivable)' : billingSummary.net_balance < 0 ? '(Payable)' : ''}
                </span>
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Pending Credit Notes</p>
              <p className="text-2xl font-bold">₹{(billingSummary.pending_credit_amount || 0).toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pricing Configuration Note */}
      <Card className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800">Base Prices & Margins</p>
              <p className="text-sm text-blue-700 mt-1">
                Base prices and margin percentages are now configured in the <strong>Margins</strong> tab.
                Go to the Margins tab to set up pricing per SKU per city, with active date ranges for time-based validity.
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

      {/* Reconciliations Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Reconciliations
            </CardTitle>
            {canManage && (
              <Button onClick={() => {
                setShowReconciliationDialog(true);
                setReconciliationPreview(null);
              }} data-testid="new-reconciliation-btn">
                <Plus className="h-4 w-4 mr-2" />
                New Reconciliation
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Compare provisional billing vs actual customer sales</p>
        </CardHeader>
        <CardContent>
          {reconciliationsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : reconciliations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No reconciliations yet</p>
              <p className="text-sm">Create a reconciliation to compare provisional vs actual amounts</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Reconciliation #</th>
                    <th className="text-left p-3 font-medium">Period</th>
                    <th className="text-right p-3 font-medium">Deliveries</th>
                    <th className="text-right p-3 font-medium">Provisional</th>
                    <th className="text-right p-3 font-medium">Actual Net</th>
                    <th className="text-right p-3 font-medium">Difference</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliations.map((rec) => (
                    <tr key={rec.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => viewReconciliationDetail(rec.id)}>
                      <td className="p-3 font-medium">{rec.reconciliation_number}</td>
                      <td className="p-3">{rec.period_start} to {rec.period_end}</td>
                      <td className="p-3 text-right">{rec.total_deliveries}</td>
                      <td className="p-3 text-right">₹{rec.total_provisional_amount?.toLocaleString()}</td>
                      <td className="p-3 text-right">₹{rec.total_actual_net_amount?.toLocaleString()}</td>
                      <td className={`p-3 text-right font-medium ${rec.total_difference > 0 ? 'text-red-600' : rec.total_difference < 0 ? 'text-green-600' : ''}`}>
                        {rec.total_difference > 0 ? '+' : ''}₹{rec.total_difference?.toLocaleString()}
                      </td>
                      <td className="p-3 text-center">{getReconciliationStatusBadge(rec.status)}</td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <p className="text-sm text-muted-foreground">Settlement documents generated from reconciliations</p>
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
              <p className="text-sm">Notes are generated when reconciliations are confirmed</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Note #</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-right p-3 font-medium">Amount</th>
                    <th className="text-right p-3 font-medium">Paid</th>
                    <th className="text-right p-3 font-medium">Balance</th>
                    <th className="text-center p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Date</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {debitCreditNotes.map((note) => (
                    <tr key={note.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => viewNoteDetail(note.id)}>
                      <td className="p-3 font-medium">{note.note_number}</td>
                      <td className="p-3">
                        <Badge variant={note.note_type === 'debit' ? 'destructive' : 'default'}>
                          {note.note_type === 'debit' ? 'Debit Note' : 'Credit Note'}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-medium">₹{note.amount?.toLocaleString()}</td>
                      <td className="p-3 text-right text-green-600">₹{(note.paid_amount || 0).toLocaleString()}</td>
                      <td className="p-3 text-right text-orange-600">₹{(note.balance_amount || note.amount || 0).toLocaleString()}</td>
                      <td className="p-3 text-center">{getNoteStatusBadge(note.status)}</td>
                      <td className="p-3">{note.created_at?.split('T')[0]}</td>
                      <td className="p-3 text-right">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
