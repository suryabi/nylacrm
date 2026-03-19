import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Trash2, DollarSign, RefreshCw, FileText } from 'lucide-react';

export default function SettlementsTab({
  canManage,
  canDelete,
  settlements,
  settlementsLoading,
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
  // Handlers
  handleCreateSettlement,
  savingSettlement,
  viewSettlementDetail,
  setDeleteTarget,
  getSettlementStatusBadge
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Settlement History</CardTitle>
          <CardDescription>Payout settlements for this distributor</CardDescription>
        </div>
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
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Generate Settlement</DialogTitle>
                <DialogDescription>
                  Create a settlement for completed deliveries in a period
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Period Selection */}
                <div className="space-y-2">
                  <Label>Settlement Period Type</Label>
                  <Select
                    value={settlementForm.period_type}
                    onValueChange={(v) => setSettlementForm(prev => ({ ...prev, period_type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select period type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Period Start *</Label>
                    <Input
                      type="date"
                      value={settlementForm.period_start}
                      onChange={(e) => setSettlementForm(prev => ({ ...prev, period_start: e.target.value }))}
                      data-testid="settlement-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Period End *</Label>
                    <Input
                      type="date"
                      value={settlementForm.period_end}
                      onChange={(e) => setSettlementForm(prev => ({ ...prev, period_end: e.target.value }))}
                      data-testid="settlement-end-date"
                    />
                  </div>
                </div>

                {/* Preview of unsettled deliveries */}
                {settlementForm.period_start && settlementForm.period_end && (
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-base font-semibold">Deliveries to Settle</Label>
                      {unsettledLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                    </div>
                    
                    {unsettledDeliveries.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        <p className="text-sm">No unsettled deliveries found for this period</p>
                      </div>
                    ) : (
                      <>
                        <div className="max-h-48 overflow-y-auto border rounded mb-3">
                          <table className="w-full text-sm">
                            <thead className="bg-muted sticky top-0">
                              <tr>
                                <th className="text-left p-2">Delivery #</th>
                                <th className="text-left p-2">Account</th>
                                <th className="text-right p-2">Amount</th>
                                <th className="text-right p-2">Margin</th>
                              </tr>
                            </thead>
                            <tbody>
                              {unsettledDeliveries.map(del => (
                                <tr key={del.id} className="border-t">
                                  <td className="p-2">{del.delivery_number}</td>
                                  <td className="p-2">{del.account_name}</td>
                                  <td className="p-2 text-right">₹{del.total_net_amount?.toLocaleString()}</td>
                                  <td className="p-2 text-right text-green-600">₹{del.total_margin_amount?.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div className="bg-background rounded p-2">
                            <div className="text-xs text-muted-foreground">Deliveries</div>
                            <div className="font-bold">{unsettledDeliveries.length}</div>
                          </div>
                          <div className="bg-background rounded p-2">
                            <div className="text-xs text-muted-foreground">Total Amount</div>
                            <div className="font-bold">₹{unsettledDeliveries.reduce((sum, d) => sum + (d.total_net_amount || 0), 0).toLocaleString()}</div>
                          </div>
                          <div className="bg-green-50 rounded p-2">
                            <div className="text-xs text-muted-foreground">Total Margin (Payout)</div>
                            <div className="font-bold text-green-600">₹{unsettledDeliveries.reduce((sum, d) => sum + (d.total_margin_amount || 0), 0).toLocaleString()}</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

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
                  disabled={savingSettlement || !settlementForm.period_start || !settlementForm.period_end || unsettledDeliveries.length === 0}
                  data-testid="save-settlement-btn"
                >
                  {savingSettlement ? 'Creating...' : 'Generate Settlement'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
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
            <p className="text-sm">Generate a settlement to calculate distributor payout</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="settlements-table">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Settlement #</th>
                  <th className="text-left p-3 font-medium">Period</th>
                  <th className="text-right p-3 font-medium">Deliveries</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-right p-3 font-medium">Payout</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((settlement) => (
                  <tr key={settlement.id} className="border-b hover:bg-muted/30" data-testid={`settlement-row-${settlement.id}`}>
                    <td className="p-3">
                      <button 
                        className="font-medium text-primary hover:underline"
                        onClick={() => viewSettlementDetail(settlement.id)}
                      >
                        {settlement.settlement_number}
                      </button>
                    </td>
                    <td className="p-3">
                      <div className="text-sm">
                        {new Date(settlement.period_start).toLocaleDateString()} - {new Date(settlement.period_end).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">{settlement.period_type}</div>
                    </td>
                    <td className="p-3 text-right">{settlement.total_deliveries}</td>
                    <td className="p-3 text-right">₹{settlement.total_delivery_amount?.toLocaleString()}</td>
                    <td className="p-3 text-right">
                      <span className="font-bold text-green-600">₹{settlement.final_payout?.toLocaleString()}</span>
                      {settlement.adjustments !== 0 && (
                        <div className="text-xs text-muted-foreground">
                          (adj: {settlement.adjustments > 0 ? '+' : ''}₹{settlement.adjustments})
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {getSettlementStatusBadge(settlement.status)}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewSettlementDetail(settlement.id)}
                          data-testid={`view-settlement-${settlement.id}`}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        {/* Show delete for draft (canManage) or any status (canDelete for CEO/Admin) */}
                        {(canDelete || (canManage && settlement.status === 'draft')) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({
                                type: 'settlement',
                                id: settlement.id,
                                name: settlement.settlement_number
                              });
                            }}
                            data-testid={`delete-settlement-${settlement.id}`}
                            title={canDelete ? "Delete (Admin)" : "Delete draft"}
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
  );
}
