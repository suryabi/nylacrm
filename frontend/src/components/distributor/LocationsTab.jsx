import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import {
  MapPin, Plus, Trash2, Package, User, Phone, Factory, Pencil, ExternalLink,
  Navigation, Receipt, Loader2, RefreshCw,
} from 'lucide-react';
import GooglePlacesAddressSearch from '../GooglePlacesAddressSearch';

const mapsLinkFor = (location) => {
  if (location?.lat != null && location?.lng != null) {
    return `https://www.google.com/maps?q=${encodeURIComponent(`${location.lat},${location.lng}`)}`;
  }
  const parts = [
    location?.address_line_1, location?.address_line_2,
    location?.city, location?.state, location?.pincode,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
};

export default function LocationsTab({
  distributor,
  canManage,
  showLocationDialog,
  setShowLocationDialog,
  newLocation,
  setNewLocation,
  stateNames,
  getCoveredCities,
  handleAddLocation,
  addingLocation,
  setDeleteTarget,
  editingLocationId,
  setEditingLocationId,
  onEditLocation,
  zohoBranches = [],
  branchesLoading = false,
  branchesError = '',
  onSyncBranches,
}) {
  const isEditing = !!editingLocationId;

  const closeDialog = (open) => {
    setShowLocationDialog(open);
    if (!open) {
      setEditingLocationId?.(null);
    }
  };

  const handlePickPlace = (place) => {
    // Only overwrite address fields. If the user already picked a state/city
    // we leave them, the Places result may not match coverage rules.
    setNewLocation(prev => ({
      ...prev,
      address_line_1: place.address_line_1 || prev.address_line_1,
      address_line_2: place.address_line_2 || prev.address_line_2,
      // Try to set city/state from Places only if matching available options
      state: place.state || prev.state,
      city: place.city || prev.city,
      pincode: place.pincode || prev.pincode,
      lat: place.lat,
      lng: place.lng,
      formatted_address: place.formatted_address || prev.formatted_address,
    }));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Distributor Locations / Warehouses</CardTitle>
          <CardDescription>Stock dispatch points for this distributor</CardDescription>
        </div>
        {canManage && (
          <Button data-testid="add-location-btn" onClick={() => closeDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Location
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {distributor.locations?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No locations defined</p>
            <p className="text-sm">Add warehouse or stocking locations for this distributor</p>
            {(distributor.operating_coverage?.length || 0) === 0 && (
              <p className="text-sm text-amber-600 mt-2">Note: Add operating coverage first before adding locations</p>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {distributor.locations?.map((location) => {
              const mapsHref = mapsLinkFor(location);
              const hasGeo = location.lat != null && location.lng != null;
              return (
                <Card key={location.id} className={location.is_default ? 'border-primary' : ''} data-testid={`location-card-${location.id}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold truncate">{location.location_name}</h4>
                          <Badge variant="outline">{location.location_code}</Badge>
                          {location.is_default && <Badge className="bg-primary">Default</Badge>}
                          {location.is_factory && (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200" variant="outline" data-testid={`factory-badge-${location.id}`}>
                              <Factory className="h-3 w-3 mr-1" />
                              Factory
                            </Badge>
                          )}
                          {location.zoho_branch_id ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200" data-testid={`branch-badge-${location.id}`} title={location.gstin || ''}>
                              <Receipt className="h-3 w-3 mr-1" />
                              {location.zoho_branch_name || 'Zoho branch'}
                            </Badge>
                          ) : location.is_factory ? (
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200" data-testid={`branch-unmapped-${location.id}`}>
                              <Receipt className="h-3 w-3 mr-1" />
                              No Zoho branch
                            </Badge>
                          ) : null}
                          {hasGeo && (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              <Navigation className="h-3 w-3 mr-1" />
                              Geo-located
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                          {location.address_line_1 && <p>{location.address_line_1}</p>}
                          {location.address_line_2 && <p>{location.address_line_2}</p>}
                          <p className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {location.city}, {location.state} {location.pincode}
                          </p>
                          {location.contact_person && (
                            <p className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {location.contact_person}
                            </p>
                          )}
                          {location.contact_number && (
                            <p className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {location.contact_number}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEditLocation?.(location)}
                            title="Edit location"
                            data-testid={`location-edit-${location.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleteTarget({ type: 'location', id: location.id, name: location.location_name })}
                            title="Delete location"
                            data-testid={`location-delete-${location.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Mini-map / Open-in-Google-Maps action */}
                    {mapsHref && (
                      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 p-3 flex items-center justify-between gap-3" data-testid={`location-map-card-${location.id}`}>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0 ${hasGeo ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-white'}`}>
                            <MapPin className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              {hasGeo ? 'Pinned location' : 'Approximate location'}
                            </div>
                            <div className="text-xs text-slate-500 truncate" title={location.formatted_address}>
                              {hasGeo
                                ? <span className="font-mono">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
                                : (location.formatted_address || 'No coordinates yet — pin location via Edit → search')}
                            </div>
                          </div>
                        </div>
                        <a href={mapsHref} target="_blank" rel="noreferrer" data-testid={`location-open-maps-${location.id}`}>
                          <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                            Open in Maps
                          </Button>
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={showLocationDialog} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg" data-testid="location-dialog">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Location' : 'Add New Location'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update warehouse details. Use the address search to pin its exact location on the map.'
                : 'Add a warehouse or stocking location for this distributor. Search to auto-fill address & coordinates.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>Location Name *</Label>
              <Input
                placeholder="e.g., Bangalore Main Warehouse"
                value={newLocation.location_name}
                onChange={(e) => setNewLocation(prev => ({ ...prev, location_name: e.target.value }))}
                data-testid="location-name-input"
              />
            </div>

            {/* Google Places — search & auto-fill */}
            <div className="space-y-2">
              <Label className="flex items-center justify-between">
                <span>Address search (Google)</span>
                {(newLocation.lat != null && newLocation.lng != null) && (
                  <span className="text-[10px] text-emerald-700 font-mono">
                    📍 {newLocation.lat.toFixed(5)}, {newLocation.lng.toFixed(5)}
                  </span>
                )}
              </Label>
              <GooglePlacesAddressSearch
                cityHint={newLocation.city}
                placeholder="Search the warehouse address…"
                onPick={handlePickPlace}
                testId="location-places"
              />
              <p className="text-[11px] text-slate-500">
                Pick a result to auto-fill address, city, state, pincode, and coordinates. You can still edit fields below.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>State *</Label>
                <Select
                  value={newLocation.state}
                  onValueChange={(v) => setNewLocation(prev => ({ ...prev, state: v, city: '' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {stateNames.map(state => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>City * (must be in coverage)</Label>
                <Select
                  value={newLocation.city}
                  onValueChange={(v) => setNewLocation(prev => ({ ...prev, city: v }))}
                  disabled={!newLocation.state}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    {getCoveredCities()
                      .filter(city => {
                        const coverage = distributor.operating_coverage?.find(c => c.city === city);
                        return coverage && (!newLocation.state || coverage.state === newLocation.state);
                      })
                      .map(city => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address Line 1</Label>
              <Input
                placeholder="Street address"
                value={newLocation.address_line_1}
                onChange={(e) => setNewLocation(prev => ({ ...prev, address_line_1: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Address Line 2</Label>
              <Input
                placeholder="Area, Landmark"
                value={newLocation.address_line_2}
                onChange={(e) => setNewLocation(prev => ({ ...prev, address_line_2: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Pincode</Label>
              <Input
                placeholder="560001"
                value={newLocation.pincode}
                onChange={(e) => setNewLocation(prev => ({ ...prev, pincode: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact Person</Label>
                <Input
                  placeholder="Contact name"
                  value={newLocation.contact_person}
                  onChange={(e) => setNewLocation(prev => ({ ...prev, contact_person: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Number</Label>
                <Input
                  placeholder="+91 9876543210"
                  value={newLocation.contact_number}
                  onChange={(e) => setNewLocation(prev => ({ ...prev, contact_number: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="warehouse@example.com"
                value={newLocation.email}
                onChange={(e) => setNewLocation(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_default"
                checked={newLocation.is_default}
                onCheckedChange={(checked) => setNewLocation(prev => ({ ...prev, is_default: checked }))}
              />
              <label htmlFor="is_default" className="text-sm">Set as default location</label>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50/60 border border-amber-100">
              <Checkbox
                id="is_factory"
                checked={newLocation.is_factory}
                onCheckedChange={(checked) => setNewLocation(prev => ({ ...prev, is_factory: !!checked }))}
                data-testid="location-factory-checkbox"
              />
              <label htmlFor="is_factory" className="text-sm font-medium text-slate-700 cursor-pointer flex items-center gap-1.5">
                <Factory className="h-4 w-4 text-amber-600" />
                Mark as Factory Warehouse
              </label>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50/60 border border-indigo-100">
              <Checkbox
                id="track_batches"
                checked={!!newLocation.track_batches}
                onCheckedChange={(checked) => setNewLocation(prev => ({ ...prev, track_batches: !!checked }))}
                data-testid="location-track-batches-checkbox"
              />
              <label htmlFor="track_batches" className="text-sm font-medium text-slate-700 cursor-pointer">
                Track batches on stock movements
                <span className="block text-[10px] font-normal text-slate-500 mt-0.5">
                  When ON, every stock-in / stock-out / stock-transfer involving this warehouse requires a batch.
                </span>
              </label>
            </div>

            {/* GST identity + Zoho Branch mapping (multi-GSTIN) — CRM is the source
                of truth. The Branch ID + GSTIN are entered here and pushed onto the
                invoice (CRM → Zoho). Nothing is pulled from Zoho. */}
            <div className="space-y-3 p-3 rounded-lg bg-emerald-50/50 border border-emerald-100" data-testid="location-gst-section">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <Receipt className="h-4 w-4 text-emerald-600" />
                GST &amp; Zoho Branch
              </label>
              <p className="text-[11px] text-slate-500 -mt-1">
                Stock-out invoices from this warehouse are pushed to Zoho under this Branch ID,
                so the correct GSTIN is applied. Find the Branch ID in Zoho Books → Settings →
                Branches (open the branch — the ID is in the URL). Required for self-managed /
                factory warehouses.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Zoho Branch ID</Label>
                <Input
                  placeholder="e.g., 460000000038080"
                  value={newLocation.zoho_branch_id || ''}
                  onChange={(e) => setNewLocation(prev => ({ ...prev, zoho_branch_id: (e.target.value || '').trim() }))}
                  data-testid="location-zoho-branch-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Branch name <span className="text-slate-400">(optional, for reference)</span></Label>
                <Input
                  placeholder="e.g., Delhi Branch"
                  value={newLocation.zoho_branch_name || ''}
                  onChange={(e) => setNewLocation(prev => ({ ...prev, zoho_branch_name: e.target.value }))}
                  data-testid="location-zoho-branch-name-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">GSTIN</Label>
                <Input
                  placeholder="e.g., 07ABCDE1234F1Z5"
                  value={newLocation.gstin || ''}
                  onChange={(e) => setNewLocation(prev => ({ ...prev, gstin: (e.target.value || '').toUpperCase() }))}
                  data-testid="location-gstin-input"
                />
                <p className="text-[10px] text-slate-400">For reference on this warehouse. The GST actually applied comes from the mapped Zoho branch.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => closeDialog(false)}>Cancel</Button>
            <Button onClick={handleAddLocation} disabled={addingLocation} data-testid="location-save-btn">
              {addingLocation ? (isEditing ? 'Saving…' : 'Adding…') : (isEditing ? 'Save Changes' : 'Add Location')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
