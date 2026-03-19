import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { STATUS_OPTIONS } from './constants';

function getStatusBadge(status) {
  const statusConfig = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[1];
  return <Badge className={statusConfig.color}>{statusConfig.label}</Badge>;
}

export default function CoverageTab({
  distributor,
  canManage,
  showCoverageDialog,
  setShowCoverageDialog,
  selectedState,
  setSelectedState,
  selectedCities,
  setSelectedCities,
  stateNames,
  getAvailableCities,
  handleAddCoverage,
  addingCoverage,
  setDeleteTarget
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Operating Coverage</CardTitle>
          <CardDescription>Cities where this distributor can operate</CardDescription>
        </div>
        {canManage && (
          <Dialog open={showCoverageDialog} onOpenChange={setShowCoverageDialog}>
            <DialogTrigger asChild>
              <Button data-testid="add-coverage-btn">
                <Plus className="h-4 w-4 mr-2" />
                Add Coverage
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Operating Coverage</DialogTitle>
                <DialogDescription>Select state and cities where this distributor will operate</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>State</Label>
                  <Select value={selectedState} onValueChange={(v) => { setSelectedState(v); setSelectedCities([]); }}>
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
                {selectedState && (
                  <div className="space-y-2">
                    <Label>Cities (select multiple)</Label>
                    <div className="max-h-60 overflow-y-auto border rounded-md p-3 space-y-2">
                      {getAvailableCities().length === 0 ? (
                        <p className="text-sm text-muted-foreground">All cities in this state are already covered</p>
                      ) : (
                        getAvailableCities().map(city => (
                          <div key={city} className="flex items-center gap-2">
                            <Checkbox
                              id={city}
                              checked={selectedCities.includes(city)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedCities(prev => [...prev, city]);
                                } else {
                                  setSelectedCities(prev => prev.filter(c => c !== city));
                                }
                              }}
                            />
                            <label htmlFor={city} className="text-sm cursor-pointer">{city}</label>
                          </div>
                        ))
                      )}
                    </div>
                    {selectedCities.length > 0 && (
                      <p className="text-sm text-muted-foreground">{selectedCities.length} cities selected</p>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCoverageDialog(false)}>Cancel</Button>
                <Button onClick={handleAddCoverage} disabled={addingCoverage || selectedCities.length === 0}>
                  {addingCoverage ? 'Adding...' : 'Add Coverage'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {distributor.operating_coverage?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No operating coverage defined</p>
            <p className="text-sm">Add cities where this distributor can operate</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">State</th>
                  <th className="text-left p-3 font-medium">City</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {distributor.operating_coverage?.map((coverage) => (
                  <tr key={coverage.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">{coverage.state}</td>
                    <td className="p-3 font-medium">{coverage.city}</td>
                    <td className="p-3 text-center">{getStatusBadge(coverage.status)}</td>
                    <td className="p-3 text-right">
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleteTarget({ type: 'coverage', id: coverage.id, name: coverage.city })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
