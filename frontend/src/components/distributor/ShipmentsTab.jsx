import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { MapPin, Plus, Trash2, Truck, RefreshCw, Package, Calendar, FileText } from 'lucide-react';

export default function ShipmentsTab({
  distributor,
  canManage,
  canDelete,
  shipments,
  shipmentsLoading,
  skus,
  // Dialog state
  showShipmentDialog,
  setShowShipmentDialog,
  // Form
  shipmentForm,
  setShipmentForm,
  shipmentItems,
  addShipmentItem,
  updateShipmentItem,
  updateShipmentItemWithPrice,
  removeShipmentItem,
  resetShipmentForm,
  // Handlers
  handleCreateShipment,
  savingShipment,
  viewShipmentDetail,
  setDeleteTarget,
  getShipmentStatusBadge
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Stock In (Factory → Distributor)</CardTitle>
          <CardDescription>Stock shipments to this distributor's locations</CardDescription>
        </div>
        {canManage && (
          <Dialog open={showShipmentDialog} onOpenChange={(open) => {
            setShowShipmentDialog(open);
            if (!open) resetShipmentForm();
          }}>
            <DialogTrigger asChild>
              <Button data-testid="create-shipment-btn">
                <Plus className="h-4 w-4 mr-2" />
                Create Shipment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Primary Shipment</DialogTitle>
                <DialogDescription>
                  Record stock being sent to {distributor.distributor_name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Location & Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Destination Location *</Label>
                    <Select
                      value={shipmentForm.distributor_location_id}
                      onValueChange={(v) => setShipmentForm(prev => ({ ...prev, distributor_location_id: v }))}
                    >
                      <SelectTrigger data-testid="shipment-location-select">
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
                    <Label>Shipment Date *</Label>
                    <Input
                      type="date"
                      value={shipmentForm.shipment_date}
                      onChange={(e) => setShipmentForm(prev => ({ ...prev, shipment_date: e.target.value }))}
                      data-testid="shipment-date-input"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Expected Delivery Date</Label>
                    <Input
                      type="date"
                      value={shipmentForm.expected_delivery_date}
                      onChange={(e) => setShipmentForm(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reference/PO Number</Label>
                    <Input
                      placeholder="e.g., PO-2026-001"
                      value={shipmentForm.reference_number}
                      onChange={(e) => setShipmentForm(prev => ({ ...prev, reference_number: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Transport Details */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Vehicle Number</Label>
                    <Input
                      placeholder="KA-01-AB-1234"
                      value={shipmentForm.vehicle_number}
                      onChange={(e) => setShipmentForm(prev => ({ ...prev, vehicle_number: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Driver Name</Label>
                    <Input
                      placeholder="Driver name"
                      value={shipmentForm.driver_name}
                      onChange={(e) => setShipmentForm(prev => ({ ...prev, driver_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Driver Contact</Label>
                    <Input
                      placeholder="+91 9876543210"
                      value={shipmentForm.driver_contact}
                      onChange={(e) => setShipmentForm(prev => ({ ...prev, driver_contact: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Shipment Items */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Shipment Items</Label>
                    <Button variant="outline" size="sm" onClick={addShipmentItem} data-testid="add-item-btn">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>
                  
                  {shipmentItems.length === 0 ? (
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
                      {shipmentItems.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-3 p-3 border rounded-md bg-muted/30" data-testid={`shipment-item-${index}`}>
                          <div className="flex-[3] min-w-0">
                            <Select
                              value={item.sku_id}
                              onValueChange={(v) => {
                                const selectedSku = skus.find(s => s.id === v);
                                if (selectedSku) {
                                  // Use the enhanced function that looks up the transfer price
                                  updateShipmentItemWithPrice(item.id, v, selectedSku.name || selectedSku.sku_name);
                                }
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select SKU" />
                              </SelectTrigger>
                              <SelectContent>
                                {skus.map(sku => (
                                  <SelectItem key={sku.id} value={sku.id}>
                                    {sku.name || sku.sku_name}
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
                              onChange={(e) => updateShipmentItem(item.id, 'quantity', e.target.value)}
                            />
                          </div>
                          <div className="w-24">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-9"
                              value={item.unit_price}
                              onChange={(e) => updateShipmentItem(item.id, 'unit_price', e.target.value)}
                            />
                          </div>
                          <div className="w-16">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              className="h-9"
                              value={item.discount_percent}
                              onChange={(e) => updateShipmentItem(item.id, 'discount_percent', e.target.value)}
                            />
                          </div>
                          <div className="w-16">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              className="h-9"
                              value={item.tax_percent}
                              onChange={(e) => updateShipmentItem(item.id, 'tax_percent', e.target.value)}
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
                              onClick={() => removeShipmentItem(item.id)}
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
                            ₹{shipmentItems.reduce((sum, item) => {
                              const gross = item.quantity * item.unit_price;
                              const afterDiscount = gross * (1 - (item.discount_percent || 0) / 100);
                              const withTax = afterDiscount * (1 + (item.tax_percent || 0) / 100);
                              return sum + withTax;
                            }, 0).toFixed(2)}
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
                    value={shipmentForm.remarks}
                    onChange={(e) => setShipmentForm(prev => ({ ...prev, remarks: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowShipmentDialog(false)}>Cancel</Button>
                <Button
                  onClick={handleCreateShipment}
                  disabled={savingShipment || !shipmentForm.distributor_location_id || shipmentItems.length === 0}
                  data-testid="save-shipment-btn"
                >
                  {savingShipment ? 'Creating...' : 'Create Shipment'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {shipmentsLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : shipments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No shipments recorded</p>
            <p className="text-sm">Create a shipment to record stock sent to this distributor</p>
            {(distributor.locations?.length || 0) === 0 && (
              <p className="text-sm text-amber-600 mt-2">Note: Add a location first before creating shipments</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="shipments-table">
              <thead>
                <tr className="bg-emerald-50/30 border-b border-emerald-100/60">
                  <th className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Shipment #</th>
                  <th className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Date</th>
                  <th className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Location</th>
                  <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Qty</th>
                  <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Base Price</th>
                  <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Margin %</th>
                  <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Transfer Price</th>
                  <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Total Transfer</th>
                  <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>GST %</th>
                  <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>GST Amt</th>
                  <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Total (incl GST)</th>
                  <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Status</th>
                  <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((shipment, index) => {
                  // Calculate average/first item values for display
                  const avgBasePrice = shipment.avg_base_price || shipment.base_price || '-';
                  const avgMargin = shipment.avg_distributor_margin || shipment.distributor_margin;
                  const avgTransferPrice = shipment.avg_transfer_price || shipment.transfer_price;
                  const avgGstPercent = shipment.avg_gst_percent || shipment.gst_percent;
                  
                  return (
                    <tr 
                      key={shipment.id} 
                      className={`border-b border-emerald-50 transition-colors duration-200 cursor-pointer
                        ${index % 2 === 1 ? 'bg-emerald-50/40' : 'bg-white'}
                        hover:bg-emerald-50/60`}
                      onClick={() => viewShipmentDetail(shipment.id)}
                      data-testid={`shipment-row-${shipment.id}`}
                    >
                      <td className="p-4">
                        <button 
                          className="font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                          onClick={(e) => { e.stopPropagation(); viewShipmentDetail(shipment.id); }}
                        >
                          {shipment.shipment_number}
                        </button>
                        {shipment.reference_number && (
                          <p className="text-xs text-emerald-600/60 mt-0.5">{shipment.reference_number}</p>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-emerald-600/50" />
                          <span className="text-slate-700">{new Date(shipment.shipment_date).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-emerald-600/50" />
                          <span className="truncate max-w-[120px] text-slate-700">{shipment.distributor_location_name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right font-medium text-slate-800">{shipment.total_quantity}</td>
                      <td className="p-4 text-right text-slate-700">
                        {avgBasePrice !== '-' ? `₹${Number(avgBasePrice).toFixed(2)}` : '-'}
                      </td>
                      <td className="p-4 text-right text-slate-700">
                        {avgMargin != null ? `${avgMargin}%` : '-'}
                      </td>
                      <td className="p-4 text-right text-slate-700">
                        {avgTransferPrice != null ? `₹${Number(avgTransferPrice).toFixed(2)}` : '-'}
                      </td>
                      <td className="p-4 text-right font-medium text-slate-800">₹{shipment.total_gross_amount?.toLocaleString()}</td>
                      <td className="p-4 text-right text-slate-700">
                        {avgGstPercent != null ? `${avgGstPercent}%` : (shipment.total_tax_amount > 0 ? '18%' : '-')}
                      </td>
                      <td className="p-4 text-right text-slate-700">₹{shipment.total_tax_amount?.toLocaleString()}</td>
                      <td className="p-4 text-right font-medium text-emerald-600">₹{shipment.total_net_amount?.toLocaleString()}</td>
                      <td className="p-4 text-center">
                        {getShipmentStatusBadge(shipment.status)}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-emerald-100"
                            onClick={(e) => { e.stopPropagation(); viewShipmentDetail(shipment.id); }}
                            data-testid={`view-shipment-${shipment.id}`}
                          >
                            <FileText className="h-4 w-4 text-emerald-700" />
                          </Button>
                          {(canDelete || (canManage && shipment.status === 'draft')) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({
                                  type: 'shipment',
                                  id: shipment.id,
                                  name: shipment.shipment_number
                                });
                              }}
                              data-testid={`delete-shipment-${shipment.id}`}
                              title={canDelete ? "Delete (Admin)" : "Delete draft"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
      </CardContent>
    </Card>
  );
}
