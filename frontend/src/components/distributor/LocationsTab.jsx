import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { MapPin, Plus, Trash2, Package, User, Phone, Factory } from 'lucide-react';

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
  setDeleteTarget
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Distributor Locations / Warehouses</CardTitle>
          <CardDescription>Stock dispatch points for this distributor</CardDescription>
        </div>
        {canManage && (
          <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
            <DialogTrigger asChild>
              <Button data-testid="add-location-btn">
                <Plus className="h-4 w-4 mr-2" />
                Add Location
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Location</DialogTitle>
                <DialogDescription>Add a warehouse or stocking location for this distributor</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label>Location Name *</Label>
                  <Input
                    placeholder="e.g., Bangalore Main Warehouse"
                    value={newLocation.location_name}
                    onChange={(e) => setNewLocation(prev => ({ ...prev, location_name: e.target.value }))}
                  />
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
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowLocationDialog(false)}>Cancel</Button>
                <Button onClick={handleAddLocation} disabled={addingLocation}>
                  {addingLocation ? 'Adding...' : 'Add Location'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
            {distributor.locations?.map((location) => (
              <Card key={location.id} className={location.is_default ? 'border-primary' : ''}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{location.location_name}</h4>
                        <Badge variant="outline">{location.location_code}</Badge>
                        {location.is_default && <Badge className="bg-primary">Default</Badge>}
                        {location.is_factory && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200" variant="outline" data-testid={`factory-badge-${location.id}`}>
                            <Factory className="h-3 w-3 mr-1" />
                            Factory
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
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDeleteTarget({ type: 'location', id: location.id, name: location.location_name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
