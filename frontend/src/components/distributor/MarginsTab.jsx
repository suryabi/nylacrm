import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { MapPin, Plus, Trash2, Package, RefreshCw, Percent, Edit2, FileText } from 'lucide-react';

export default function MarginsTab({
  distributor,
  canManage,
  margins,
  marginsLoading,
  selectedMarginCity,
  setSelectedMarginCity,
  showOnlyActiveMargins,
  setShowOnlyActiveMargins,
  getCoveredCities,
  skus,
  // Copy dialog
  showCopyDialog,
  setShowCopyDialog,
  copyTargetCity,
  setCopyTargetCity,
  copyMarginsToCity,
  copying,
  // Add dialog
  showAddMarginDialog,
  setShowAddMarginDialog,
  newMarginForm,
  setNewMarginForm,
  handleAddMarginEntry,
  savingMarginEntry,
  // Edit dialog
  showEditMarginDialog,
  setShowEditMarginDialog,
  editMarginEntry,
  setEditMarginEntry,
  handleUpdateMarginEntry,
  // Delete
  setDeleteTarget
}) {
  const today = new Date().toISOString().split('T')[0];

  const filteredMargins = showOnlyActiveMargins 
    ? margins.filter(margin => {
        const isPast = margin.active_to && margin.active_to < today;
        return !isPast;
      })
    : margins;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Margin Matrix</CardTitle>
              <CardDescription>Edit margins for each SKU by city. Changes are saved when you click "Save All".</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* City Selector */}
              <Select value={selectedMarginCity} onValueChange={setSelectedMarginCity}>
                <SelectTrigger className="w-[180px]" data-testid="margin-city-select">
                  <SelectValue placeholder="Select City" />
                </SelectTrigger>
                <SelectContent>
                  {getCoveredCities().map(city => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Show Only Active Toggle */}
              {selectedMarginCity && margins.length > 0 && (
                <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-muted/30">
                  <Switch
                    id="show-active-only"
                    checked={showOnlyActiveMargins}
                    onCheckedChange={setShowOnlyActiveMargins}
                    data-testid="show-active-margins-toggle"
                  />
                  <Label htmlFor="show-active-only" className="text-sm cursor-pointer whitespace-nowrap">
                    Active & Ongoing only
                  </Label>
                </div>
              )}
              
              {canManage && selectedMarginCity && margins.length > 0 && (
                <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" data-testid="copy-margins-btn">
                      <FileText className="h-4 w-4 mr-2" />
                      Copy to City
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Copy Margins to Another City</DialogTitle>
                      <DialogDescription>
                        Copy all {margins.length} margin entries from <strong>{selectedMarginCity}</strong> to another city.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <Label>Target City</Label>
                      <Select value={copyTargetCity} onValueChange={setCopyTargetCity}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Select target city" />
                        </SelectTrigger>
                        <SelectContent>
                          {getCoveredCities()
                            .filter(city => city !== selectedMarginCity)
                            .map(city => (
                              <SelectItem key={city} value={city}>{city}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-muted-foreground mt-2">
                        Existing margins in the target city will not be overwritten.
                      </p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowCopyDialog(false)}>Cancel</Button>
                      <Button onClick={copyMarginsToCity} disabled={copying || !copyTargetCity}>
                        {copying ? 'Copying...' : `Copy to ${copyTargetCity || '...'}`}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedMarginCity ? (
            <div className="text-center py-12 text-muted-foreground">
              <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a city to view and edit margins</p>
              {(distributor.operating_coverage?.length || 0) === 0 && (
                <p className="text-sm text-amber-600 mt-2">Note: Add operating coverage first before adding margins</p>
              )}
            </div>
          ) : marginsLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : skus.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No SKUs found in the system</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Add new entry button */}
              {canManage && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddMarginDialog(true);
                      setNewMarginForm({
                        sku_id: '',
                        sku_name: '',
                        base_price: '',
                        margin_type: 'percentage',
                        margin_value: '2.5',
                        active_from: new Date().toISOString().split('T')[0],
                        active_to: ''
                      });
                    }}
                    data-testid="add-margin-entry-btn"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Price Entry
                  </Button>
                </div>
              )}
              
              {/* Margins list */}
              {margins.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Percent className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No margin entries for {selectedMarginCity}</p>
                  <p className="text-sm mt-1">Click "Add Price Entry" to create one</p>
                </div>
              ) : filteredMargins.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Percent className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No active or ongoing margin entries</p>
                  <p className="text-sm mt-1">Turn off the filter to see expired entries</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-emerald-50/30 border-b border-emerald-100/60">
                        <th className="text-left p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs min-w-[180px]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>SKU</th>
                        <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs min-w-[100px]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Base Price</th>
                        <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs min-w-[110px]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Margin</th>
                        <th className="text-right p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs min-w-[110px]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Transfer Price</th>
                        <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs min-w-[100px]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Active From</th>
                        <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs min-w-[100px]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Active To</th>
                        <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs min-w-[80px]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Status</th>
                        <th className="text-center p-4 font-semibold text-emerald-800/70 uppercase tracking-wider text-xs min-w-[100px]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMargins.map((margin, index) => {
                        const isActive = (!margin.active_from || margin.active_from <= today) && 
                                       (!margin.active_to || margin.active_to >= today);
                        const isFuture = margin.active_from && margin.active_from > today;
                        const isPast = margin.active_to && margin.active_to < today;
                        
                        return (
                          <tr 
                            key={margin.id} 
                            className={`border-b border-emerald-50 transition-colors duration-200
                              ${index % 2 === 1 ? 'bg-emerald-50/40' : 'bg-white'}
                              ${isActive ? 'hover:bg-green-50/60' : isPast ? 'opacity-60 hover:bg-slate-50' : 'hover:bg-emerald-50/60'}`}
                            data-testid={`margin-row-${index}`}
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {isActive && <span className="w-2 h-2 bg-green-500 rounded-full" title="Currently Active" />}
                                {isFuture && <span className="w-2 h-2 bg-blue-500 rounded-full" title="Future" />}
                                {isPast && <span className="w-2 h-2 bg-gray-400 rounded-full" title="Expired" />}
                                <span className="font-medium">{margin.sku_name}</span>
                              </div>
                            </td>
                            <td className="p-3 text-right font-medium">
                              {margin.base_price ? `₹${margin.base_price.toLocaleString()}` : '-'}
                            </td>
                            <td className="p-3 text-center">
                              <span className="text-sm">
                                {margin.margin_value}
                                {margin.margin_type === 'percentage' ? '%' : ' ₹'}
                              </span>
                            </td>
                            <td className="p-3 text-right font-medium text-green-600">
                              {margin.transfer_price ? `₹${margin.transfer_price.toLocaleString()}` : '-'}
                            </td>
                            <td className="p-3 text-center text-sm">
                              {margin.active_from || '-'}
                            </td>
                            <td className="p-3 text-center text-sm">
                              {margin.active_to || <span className="text-muted-foreground">Ongoing</span>}
                            </td>
                            <td className="p-3 text-center">
                              {isActive ? (
                                <Badge className="bg-green-100 text-green-800">Active</Badge>
                              ) : isFuture ? (
                                <Badge className="bg-blue-100 text-blue-800">Future</Badge>
                              ) : (
                                <Badge variant="secondary">Expired</Badge>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {canManage && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={() => {
                                        setEditMarginEntry(margin);
                                        setShowEditMarginDialog(true);
                                      }}
                                      title="Edit"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-destructive"
                                      onClick={() => setDeleteTarget({ 
                                        type: 'margin', 
                                        id: margin.id, 
                                        name: `${margin.sku_name} (${margin.active_from || 'Start'} - ${margin.active_to || 'Ongoing'})` 
                                      })}
                                      title="Delete"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
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
              
              {/* Summary */}
              {margins.length > 0 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-3">
                  <span>
                    {showOnlyActiveMargins ? (
                      <>
                        Showing: {filteredMargins.length} of {margins.length} entries | 
                        SKUs: {new Set(margins.map(m => m.sku_id)).size}
                      </>
                    ) : (
                      <>
                        Total: {margins.length} entries | 
                        Active: {margins.filter(m => {
                          return (!m.active_from || m.active_from <= today) && (!m.active_to || m.active_to >= today);
                        }).length} | 
                        SKUs: {new Set(margins.map(m => m.sku_id)).size}
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Add Margin Entry Dialog */}
      <Dialog open={showAddMarginDialog} onOpenChange={setShowAddMarginDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Price Entry</DialogTitle>
            <DialogDescription>
              Add a new base price configuration for {selectedMarginCity}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>SKU *</Label>
              <Select
                value={newMarginForm.sku_id}
                onValueChange={(v) => {
                  const sku = skus.find(s => s.id === v);
                  setNewMarginForm(prev => ({
                    ...prev,
                    sku_id: v,
                    sku_name: sku?.name || sku?.sku_name || ''
                  }));
                }}
              >
                <SelectTrigger>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Base Price (₹) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="100"
                  value={newMarginForm.base_price}
                  onChange={(e) => setNewMarginForm(prev => ({ ...prev, base_price: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Margin % *</Label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="2.5"
                  value={newMarginForm.margin_value}
                  onChange={(e) => setNewMarginForm(prev => ({ ...prev, margin_value: e.target.value }))}
                />
              </div>
            </div>
            {newMarginForm.base_price && newMarginForm.margin_value && (
              <div className="p-3 bg-green-50 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Transfer Price</p>
                <p className="text-xl font-bold text-green-600">
                  ₹{(parseFloat(newMarginForm.base_price) * (1 - parseFloat(newMarginForm.margin_value) / 100)).toFixed(2)}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Active From *</Label>
                <Input
                  type="date"
                  value={newMarginForm.active_from}
                  onChange={(e) => setNewMarginForm(prev => ({ ...prev, active_from: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Active To</Label>
                <Input
                  type="date"
                  value={newMarginForm.active_to}
                  onChange={(e) => setNewMarginForm(prev => ({ ...prev, active_to: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Leave empty for ongoing</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMarginDialog(false)}>Cancel</Button>
            <Button onClick={handleAddMarginEntry} disabled={savingMarginEntry}>
              {savingMarginEntry ? 'Adding...' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Margin Entry Dialog */}
      <Dialog open={showEditMarginDialog} onOpenChange={(open) => {
        setShowEditMarginDialog(open);
        if (!open) setEditMarginEntry(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Price Entry</DialogTitle>
            <DialogDescription>
              Update pricing for {editMarginEntry?.sku_name}
            </DialogDescription>
          </DialogHeader>
          {editMarginEntry && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium">{editMarginEntry.sku_name}</p>
                <p className="text-sm text-muted-foreground">{selectedMarginCity}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Base Price (₹)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editMarginEntry.base_price || ''}
                    onChange={(e) => setEditMarginEntry(prev => ({ ...prev, base_price: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Margin %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editMarginEntry.margin_value || ''}
                    onChange={(e) => setEditMarginEntry(prev => ({ ...prev, margin_value: e.target.value }))}
                  />
                </div>
              </div>
              {editMarginEntry.base_price && editMarginEntry.margin_value && (
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">Transfer Price</p>
                  <p className="text-xl font-bold text-green-600">
                    ₹{(parseFloat(editMarginEntry.base_price) * (1 - parseFloat(editMarginEntry.margin_value) / 100)).toFixed(2)}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Active From</Label>
                  <Input
                    type="date"
                    value={editMarginEntry.active_from || ''}
                    onChange={(e) => setEditMarginEntry(prev => ({ ...prev, active_from: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Active To</Label>
                  <Input
                    type="date"
                    value={editMarginEntry.active_to || ''}
                    onChange={(e) => setEditMarginEntry(prev => ({ ...prev, active_to: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Empty = ongoing</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditMarginDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateMarginEntry} disabled={savingMarginEntry}>
              {savingMarginEntry ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
