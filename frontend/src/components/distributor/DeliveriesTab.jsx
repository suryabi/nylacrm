import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Plus, Trash2, Truck, RefreshCw, Package, Calendar, FileText, Building2, X } from 'lucide-react';

export default function DeliveriesTab({
  distributor,
  canManage,
  canDelete,
  deliveries,
  deliveriesLoading,
  skus,
  assignedAccounts,
  // Dialog state
  showDeliveryDialog,
  setShowDeliveryDialog,
  // Account selection
  selectedDeliveryAccount,
  setSelectedDeliveryAccount,
  deliveryAccountSearch,
  setDeliveryAccountSearch,
  // Form
  deliveryForm,
  setDeliveryForm,
  deliveryItems,
  addDeliveryItem,
  updateDeliveryItem,
  removeDeliveryItem,
  resetDeliveryForm,
  // Handlers
  handleCreateDelivery,
  savingDelivery,
  viewDeliveryDetail,
  setDeleteTarget,
  getDeliveryStatusBadge
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Account Deliveries</CardTitle>
          <CardDescription>Deliveries from this distributor to assigned accounts</CardDescription>
        </div>
        {canManage && (
          <Dialog open={showDeliveryDialog} onOpenChange={(open) => {
            setShowDeliveryDialog(open);
            if (!open) resetDeliveryForm();
          }}>
            <DialogTrigger asChild>
              <Button data-testid="create-delivery-btn">
                <Plus className="h-4 w-4 mr-2" />
                Record Delivery
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Record Account Delivery</DialogTitle>
                <DialogDescription>
                  Record a delivery from {distributor.distributor_name} to an account
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Account Selection - Searchable */}
                <div className="space-y-2">
                  <Label>Account *</Label>
                  {selectedDeliveryAccount ? (
                    <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{selectedDeliveryAccount.account_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedDeliveryAccount.city}{selectedDeliveryAccount.state ? `, ${selectedDeliveryAccount.state}` : ''}
                          {selectedDeliveryAccount.is_primary && ' ★ Primary'}
                        </p>
                        {selectedDeliveryAccount.contact_name && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Contact: {selectedDeliveryAccount.contact_name}
                            {selectedDeliveryAccount.contact_number && ` • ${selectedDeliveryAccount.contact_number}`}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedDeliveryAccount(null);
                          setDeliveryForm(prev => ({ ...prev, account_id: '', distributor_location_id: '' }));
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        placeholder="Search accounts by name or city..."
                        value={deliveryAccountSearch || ''}
                        onChange={(e) => setDeliveryAccountSearch(e.target.value)}
                        data-testid="delivery-account-search"
                        className="w-full"
                      />
                      <div className="border rounded-md max-h-[200px] overflow-y-auto">
                        {assignedAccounts.length === 0 ? (
                          <div className="p-4 text-sm text-muted-foreground text-center">
                            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No accounts assigned to this distributor</p>
                            <p className="text-xs mt-1">Assign accounts first from the Assignments tab</p>
                          </div>
                        ) : (
                          assignedAccounts
                            .filter(account => {
                              if (!deliveryAccountSearch) return true;
                              const search = deliveryAccountSearch.toLowerCase();
                              return (
                                account.account_name?.toLowerCase().includes(search) ||
                                account.city?.toLowerCase().includes(search) ||
                                account.contact_name?.toLowerCase().includes(search) ||
                                account.territory?.toLowerCase().includes(search)
                              );
                            })
                            .map(account => (
                              <div
                                key={account.id}
                                className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0 transition-colors"
                                onClick={() => {
                                  setSelectedDeliveryAccount(account);
                                  setDeliveryForm(prev => ({ 
                                    ...prev, 
                                    account_id: account.id,
                                    distributor_location_id: account.distributor_location_id || ''
                                  }));
                                  setDeliveryAccountSearch('');
                                }}
                                data-testid={`delivery-account-option-${account.id}`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">
                                      {account.account_name}
                                      {account.is_primary && <span className="ml-2 text-yellow-600">★ Primary</span>}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {account.city}{account.state ? `, ${account.state}` : ''}
                                      {account.territory && ` • ${account.territory}`}
                                    </p>
                                    {account.contact_name && (
                                      <p className="text-xs text-muted-foreground">
                                        Contact: {account.contact_name}
                                      </p>
                                    )}
                                  </div>
                                  {account.distributor_location_name && (
                                    <Badge variant="outline" className="ml-2 text-xs shrink-0">
                                      {account.distributor_location_name}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))
                        )}
                        {assignedAccounts.length > 0 && deliveryAccountSearch && 
                         assignedAccounts.filter(a => {
                           const search = deliveryAccountSearch.toLowerCase();
                           return a.account_name?.toLowerCase().includes(search) || 
                                  a.city?.toLowerCase().includes(search) ||
                                  a.contact_name?.toLowerCase().includes(search);
                         }).length === 0 && (
                          <div className="p-4 text-sm text-muted-foreground text-center">
                            No accounts found matching "{deliveryAccountSearch}"
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {assignedAccounts.length} account{assignedAccounts.length !== 1 ? 's' : ''} assigned to this distributor
                      </p>
                    </div>
                  )}
                </div>

                {/* Location & Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>From Location *</Label>
                    <Select
                      value={deliveryForm.distributor_location_id}
                      onValueChange={(v) => setDeliveryForm(prev => ({ ...prev, distributor_location_id: v }))}
                    >
                      <SelectTrigger data-testid="delivery-location-select">
                        <SelectValue placeholder="Select warehouse/location" />
                      </SelectTrigger>
                      <SelectContent>
                        {(distributor.locations || [])
                          .filter(loc => loc.status === 'active')
                          .map(loc => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.location_name} ({loc.city})
                              {loc.is_default && ' ★'}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Delivery Date *</Label>
                    <Input
                      type="date"
                      value={deliveryForm.delivery_date}
                      onChange={(e) => setDeliveryForm(prev => ({ ...prev, delivery_date: e.target.value }))}
                      data-testid="delivery-date-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reference Number</Label>
                    <Input
                      placeholder="e.g., INV-2026-001"
                      value={deliveryForm.reference_number}
                      onChange={(e) => setDeliveryForm(prev => ({ ...prev, reference_number: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vehicle Number</Label>
                    <Input
                      placeholder="KA-01-AB-1234"
                      value={deliveryForm.vehicle_number}
                      onChange={(e) => setDeliveryForm(prev => ({ ...prev, vehicle_number: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Delivery Items */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-semibold">Delivery Items</Label>
                      {selectedDeliveryAccount && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {selectedDeliveryAccount.sku_pricing?.length > 0 
                            ? `Showing ${selectedDeliveryAccount.sku_pricing.length} SKU(s) configured for ${selectedDeliveryAccount.account_name}`
                            : `No SKU pricing configured for ${selectedDeliveryAccount.account_name} - showing all SKUs`
                          }
                        </p>
                      )}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={addDeliveryItem} 
                      disabled={!selectedDeliveryAccount}
                      data-testid="add-delivery-item-btn"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>
                  
                  {!selectedDeliveryAccount ? (
                    <div className="text-center py-6 text-muted-foreground border rounded-md bg-muted/20">
                      <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Select an account first to add delivery items</p>
                    </div>
                  ) : deliveryItems.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground border rounded-md">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No items added. Click "Add Item" to start.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Header Row */}
                      <div className="flex items-center gap-3 px-3 text-xs font-medium text-muted-foreground">
                        <div className="flex-[3] min-w-0">SKU</div>
                        <div className="w-20">Qty</div>
                        <div className="w-24">Price (₹)</div>
                        <div className="w-16">Disc %</div>
                        <div className="w-16">Tax %</div>
                        <div className="w-28 text-right">Amount</div>
                        <div className="w-10"></div>
                      </div>
                      {deliveryItems.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-3 p-3 border rounded-md bg-muted/30" data-testid={`delivery-item-${index}`}>
                          <div className="flex-[3] min-w-0">
                            <Select
                              value={item.sku_id}
                              onValueChange={(v) => {
                                const accountSkus = selectedDeliveryAccount?.sku_pricing || [];
                                const selectedSku = accountSkus.find(s => s.id === v) || skus.find(s => s.id === v);
                                updateDeliveryItem(item.id, 'sku_id', v);
                                if (selectedSku) {
                                  updateDeliveryItem(item.id, 'sku_name', selectedSku.name || selectedSku.sku_name);
                                  if (selectedSku.price_per_unit) {
                                    updateDeliveryItem(item.id, 'unit_price', selectedSku.price_per_unit);
                                  }
                                }
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select SKU" />
                              </SelectTrigger>
                              <SelectContent>
                                {(selectedDeliveryAccount?.sku_pricing?.length > 0 
                                  ? selectedDeliveryAccount.sku_pricing 
                                  : skus
                                ).map(sku => (
                                  <SelectItem key={sku.id} value={sku.id}>
                                    {sku.name || sku.sku_name}
                                    {sku.price_per_unit && ` - ₹${sku.price_per_unit}`}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-20">
                            <Input
                              type="number"
                              min="1"
                              className="h-9"
                              value={item.quantity}
                              onChange={(e) => updateDeliveryItem(item.id, 'quantity', e.target.value)}
                            />
                          </div>
                          <div className="w-24">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-9"
                              value={item.unit_price}
                              onChange={(e) => updateDeliveryItem(item.id, 'unit_price', e.target.value)}
                            />
                          </div>
                          <div className="w-16">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              className="h-9"
                              value={item.discount_percent}
                              onChange={(e) => updateDeliveryItem(item.id, 'discount_percent', e.target.value)}
                            />
                          </div>
                          <div className="w-16">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              className="h-9"
                              value={item.tax_percent}
                              onChange={(e) => updateDeliveryItem(item.id, 'tax_percent', e.target.value)}
                            />
                          </div>
                          <div className="w-28 text-right">
                            <div className="h-9 flex items-center justify-end text-sm font-semibold whitespace-nowrap">
                              ₹{((item.quantity * item.unit_price * (1 - (item.discount_percent || 0) / 100)) * (1 + (item.tax_percent || 0) / 100)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div className="w-10 flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 p-0 text-destructive"
                              onClick={() => removeDeliveryItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      
                      {/* Total */}
                      <div className="flex justify-end pt-2 border-t">
                        <div className="text-right">
                          <span className="text-muted-foreground mr-4">Total Amount:</span>
                          <span className="text-lg font-bold">
                            ₹{deliveryItems.reduce((sum, item) => {
                              const gross = item.quantity * item.unit_price;
                              const afterDiscount = gross * (1 - (item.discount_percent || 0) / 100);
                              const withTax = afterDiscount * (1 + (item.tax_percent || 0) / 100);
                              return sum + withTax;
                            }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Remarks */}
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea
                    placeholder="Any additional notes..."
                    value={deliveryForm.remarks}
                    onChange={(e) => setDeliveryForm(prev => ({ ...prev, remarks: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeliveryDialog(false)}>Cancel</Button>
                <Button
                  onClick={handleCreateDelivery}
                  disabled={savingDelivery || !deliveryForm.account_id || !deliveryForm.distributor_location_id || deliveryItems.length === 0}
                  data-testid="save-delivery-btn"
                >
                  {savingDelivery ? 'Creating...' : 'Record Delivery'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {deliveriesLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No deliveries recorded</p>
            <p className="text-sm">Record deliveries to track stock movement to accounts</p>
            {assignedAccounts.length === 0 && (
              <p className="text-sm text-amber-600 mt-2">Note: Assign accounts first before recording deliveries</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="deliveries-table">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Delivery #</th>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Account</th>
                  <th className="text-right p-3 font-medium">Qty</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="text-right p-3 font-medium">Margin</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id} className="border-b hover:bg-muted/30" data-testid={`delivery-row-${delivery.id}`}>
                    <td className="p-3">
                      <button 
                        className="font-medium text-primary hover:underline"
                        onClick={() => viewDeliveryDetail(delivery.id)}
                      >
                        {delivery.delivery_number}
                      </button>
                      {delivery.reference_number && (
                        <p className="text-xs text-muted-foreground">{delivery.reference_number}</p>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {new Date(delivery.delivery_date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="p-3">
                      <div>
                        <p className="font-medium">{delivery.account_name}</p>
                        <p className="text-xs text-muted-foreground">{delivery.account_city}</p>
                      </div>
                    </td>
                    <td className="p-3 text-right font-medium">{delivery.total_quantity}</td>
                    <td className="p-3 text-right font-medium">₹{delivery.total_net_amount?.toLocaleString()}</td>
                    <td className="p-3 text-right">
                      {delivery.total_margin_amount > 0 ? (
                        <span className="font-medium text-green-600">₹{delivery.total_margin_amount?.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {getDeliveryStatusBadge(delivery.status)}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewDeliveryDetail(delivery.id)}
                          data-testid={`view-delivery-${delivery.id}`}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        {/* Show delete for draft (canManage) or any status (canDelete for CEO/Admin) */}
                        {(canDelete || (canManage && delivery.status === 'draft')) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({
                                type: 'delivery',
                                id: delivery.id,
                                name: delivery.delivery_number
                              });
                            }}
                            data-testid={`delete-delivery-${delivery.id}`}
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
