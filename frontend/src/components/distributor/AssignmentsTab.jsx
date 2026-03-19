import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { MapPin, Plus, Trash2, Truck, RefreshCw, X } from 'lucide-react';
import { MARGIN_TYPES, formatMarginValue, STATUS_OPTIONS } from './constants';

function getStatusBadge(status) {
  const statusConfig = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[1];
  return <Badge className={statusConfig.color}>{statusConfig.label}</Badge>;
}

export default function AssignmentsTab({
  distributor,
  canManage,
  assignments,
  assignmentsLoading,
  // Dialog state
  showAssignDialog,
  setShowAssignDialog,
  // Account search
  accountSearch,
  setAccountSearch,
  searching,
  searchResults,
  setSearchResults,
  selectedAccount,
  setSelectedAccount,
  // Assignment form
  assignmentForm,
  setAssignmentForm,
  // Helpers
  getCoveredCities,
  handleCreateAssignment,
  savingAssignment,
  setDeleteTarget
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Account Assignments</CardTitle>
          <CardDescription>Accounts assigned to this distributor for servicing</CardDescription>
        </div>
        {canManage && (
          <Dialog open={showAssignDialog} onOpenChange={(open) => {
            setShowAssignDialog(open);
            if (!open) {
              setSelectedAccount(null);
              setAccountSearch('');
              setSearchResults([]);
              setAssignmentForm({
                servicing_city: '',
                distributor_location_id: '',
                is_primary: true,
                is_backup: false,
                has_special_override: false,
                override_type: '',
                override_value: '',
                remarks: ''
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button data-testid="assign-account-btn">
                <Plus className="h-4 w-4 mr-2" />
                Assign Account
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Assign Account to Distributor</DialogTitle>
                <DialogDescription>
                  Search and select an account to assign to {distributor.distributor_name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                {/* Account Search */}
                <div className="space-y-2">
                  <Label>Search Account *</Label>
                  {selectedAccount ? (
                    <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{selectedAccount.account_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedAccount.city}{selectedAccount.state ? `, ${selectedAccount.state}` : ''}
                        </p>
                        {selectedAccount.contact_name && (
                          <p className="text-xs text-muted-foreground">
                            Contact: {selectedAccount.contact_name}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedAccount(null);
                          setAccountSearch('');
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        placeholder="Type account name to search..."
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        data-testid="account-search-input"
                      />
                      {searching && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Searching...
                        </div>
                      )}
                      {searchResults.length > 0 && (
                        <div className="border rounded-md max-h-48 overflow-y-auto">
                          {searchResults.map((account) => (
                            <div
                              key={account.id}
                              className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                              onClick={() => {
                                setSelectedAccount(account);
                                setSearchResults([]);
                                setAccountSearch('');
                              }}
                              data-testid={`account-result-${account.id}`}
                            >
                              <p className="font-medium">{account.account_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {account.city}{account.state ? `, ${account.state}` : ''} {account.account_id && `• ${account.account_id}`}
                              </p>
                              {account.contact_name && (
                                <p className="text-xs text-muted-foreground">Contact: {account.contact_name}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {accountSearch.length >= 2 && searchResults.length === 0 && !searching && (
                        <p className="text-sm text-muted-foreground">No accounts found</p>
                      )}
                    </>
                  )}
                </div>

                {/* Servicing City */}
                <div className="space-y-2">
                  <Label>Servicing City *</Label>
                  <Select
                    value={assignmentForm.servicing_city}
                    onValueChange={(v) => setAssignmentForm(prev => ({ ...prev, servicing_city: v }))}
                  >
                    <SelectTrigger data-testid="servicing-city-select">
                      <SelectValue placeholder="Select servicing city" />
                    </SelectTrigger>
                    <SelectContent>
                      {getCoveredCities().map(city => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    City must be in distributor's operating coverage
                  </p>
                </div>

                {/* Distributor Location */}
                <div className="space-y-2">
                  <Label>Distributor Location (Warehouse)</Label>
                  <Select
                    value={assignmentForm.distributor_location_id || 'none'}
                    onValueChange={(v) => setAssignmentForm(prev => ({ ...prev, distributor_location_id: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger data-testid="location-select">
                      <SelectValue placeholder="Select location (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- No specific location --</SelectItem>
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

                {/* Assignment Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="is_primary"
                      checked={assignmentForm.is_primary}
                      onCheckedChange={(checked) => setAssignmentForm(prev => ({
                        ...prev,
                        is_primary: checked,
                        is_backup: checked ? false : prev.is_backup
                      }))}
                    />
                    <label htmlFor="is_primary" className="text-sm font-medium cursor-pointer">
                      Primary Distributor
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="is_backup"
                      checked={assignmentForm.is_backup}
                      onCheckedChange={(checked) => setAssignmentForm(prev => ({
                        ...prev,
                        is_backup: checked,
                        is_primary: checked ? false : prev.is_primary
                      }))}
                    />
                    <label htmlFor="is_backup" className="text-sm font-medium cursor-pointer">
                      Backup Distributor
                    </label>
                  </div>
                </div>

                {/* Special Override */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="has_special_override"
                      checked={assignmentForm.has_special_override}
                      onCheckedChange={(checked) => setAssignmentForm(prev => ({
                        ...prev,
                        has_special_override: checked,
                        override_type: checked ? prev.override_type : '',
                        override_value: checked ? prev.override_value : ''
                      }))}
                    />
                    <label htmlFor="has_special_override" className="text-sm font-medium cursor-pointer">
                      Special Margin Override
                    </label>
                  </div>
                  
                  {assignmentForm.has_special_override && (
                    <div className="grid grid-cols-2 gap-4 pl-6">
                      <div className="space-y-2">
                        <Label>Override Type</Label>
                        <Select
                          value={assignmentForm.override_type}
                          onValueChange={(v) => setAssignmentForm(prev => ({ ...prev, override_type: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {MARGIN_TYPES.map(mt => (
                              <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Override Value</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={assignmentForm.override_value}
                          onChange={(e) => setAssignmentForm(prev => ({ ...prev, override_value: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Remarks */}
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea
                    placeholder="Add any notes about this assignment..."
                    value={assignmentForm.remarks}
                    onChange={(e) => setAssignmentForm(prev => ({ ...prev, remarks: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
                <Button
                  onClick={handleCreateAssignment}
                  disabled={savingAssignment || !selectedAccount || !assignmentForm.servicing_city}
                  data-testid="save-assignment-btn"
                >
                  {savingAssignment ? 'Assigning...' : 'Assign Account'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {assignmentsLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No accounts assigned</p>
            <p className="text-sm">Assign accounts to this distributor for servicing</p>
            {(distributor.operating_coverage?.length || 0) === 0 && (
              <p className="text-sm text-amber-600 mt-2">Note: Add operating coverage first before assigning accounts</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="assignments-table">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Account</th>
                  <th className="text-left p-3 font-medium">Servicing City</th>
                  <th className="text-left p-3 font-medium">Location</th>
                  <th className="text-center p-3 font-medium">Type</th>
                  <th className="text-center p-3 font-medium">Override</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id} className="border-b hover:bg-muted/30" data-testid={`assignment-row-${assignment.id}`}>
                    <td className="p-3">
                      <div>
                        <p className="font-medium">{assignment.account_name}</p>
                        <p className="text-sm text-muted-foreground">{assignment.servicing_state}</p>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {assignment.servicing_city}
                      </div>
                    </td>
                    <td className="p-3">
                      {assignment.distributor_location_name || (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {assignment.is_primary && (
                        <Badge className="bg-blue-100 text-blue-800">Primary</Badge>
                      )}
                      {assignment.is_backup && (
                        <Badge className="bg-orange-100 text-orange-800">Backup</Badge>
                      )}
                      {!assignment.is_primary && !assignment.is_backup && (
                        <Badge variant="outline">Standard</Badge>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {assignment.has_special_override ? (
                        <Badge className="bg-purple-100 text-purple-800">
                          {formatMarginValue(assignment.override_type, assignment.override_value)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {getStatusBadge(assignment.status)}
                    </td>
                    <td className="p-3 text-right">
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleteTarget({
                            type: 'assignment',
                            id: assignment.id,
                            name: assignment.account_name || `Account in ${assignment.servicing_city}`
                          })}
                          data-testid={`delete-assignment-${assignment.id}`}
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
