import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { MapPin, Plus, Trash2, Truck, RefreshCw, X, ChevronDown, ChevronRight, Receipt, Copy, ExternalLink, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { MARGIN_TYPES, formatMarginValue, STATUS_OPTIONS } from './constants';
import TaxBillingCard from '../TaxBillingCard';

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
  const [expandedId, setExpandedId] = useState(null);
  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id);

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
                  <th className="w-8 p-3"></th>
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
                {assignments.map((assignment) => {
                  const isExpanded = expandedId === assignment.id;
                  const hasTaxInfo = !!(assignment.gst_number || assignment.pan_number || (assignment.billing_address && (assignment.billing_address.address_line1 || assignment.billing_address.city)));
                  return (
                  <React.Fragment key={assignment.id}>
                  <tr className="border-b hover:bg-muted/30" data-testid={`assignment-row-${assignment.id}`}>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => toggleExpand(assignment.id)}
                        className="text-muted-foreground hover:text-foreground"
                        title={isExpanded ? 'Hide tax & billing' : 'Show tax & billing'}
                        data-testid={`expand-assignment-${assignment.id}`}
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="p-3">
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          {assignment.account_name}
                          {hasTaxInfo && (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 px-1.5 py-0">
                              <Receipt className="h-2.5 w-2.5" /> GST
                            </Badge>
                          )}
                        </p>
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
                  {isExpanded && (
                    <tr className="bg-emerald-50/20">
                      <td></td>
                      <td colSpan={7} className="p-3 pr-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                          <TaxBillingCard
                            data={{
                              gst_number: assignment.gst_number,
                              pan_number: assignment.pan_number,
                              billing_address: assignment.billing_address,
                              gst_legal_name: assignment.gst_legal_name,
                              gst_trade_name: assignment.gst_trade_name,
                            }}
                            editable={false}
                            compact={true}
                            titleSuffix="(read-only)"
                            testId={`assignment-tax-card-${assignment.id}`}
                          />
                          <DeliveryCard
                            assignment={assignment}
                            testId={`assignment-delivery-card-${assignment.id}`}
                          />
                          <Card className="border border-emerald-100/60">
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base flex items-center gap-2">
                                <Truck className="h-4 w-4 text-emerald-600" />
                                Account Contact
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                              <div className="grid grid-cols-1 gap-2">
                                <div>
                                  <Label className="text-xs uppercase tracking-wider text-slate-500">Contact Name</Label>
                                  <p className="text-slate-800">{assignment.account_contact_name || <span className="text-slate-400 italic">Not set</span>}</p>
                                </div>
                                <div>
                                  <Label className="text-xs uppercase tracking-wider text-slate-500">Contact Number</Label>
                                  <p className="text-slate-800 font-mono">{assignment.account_contact_number || <span className="text-slate-400 italic">Not set</span>}</p>
                                </div>
                              </div>
                              {assignment.remarks && (
                                <div>
                                  <Label className="text-xs uppercase tracking-wider text-slate-500">Assignment Remarks</Label>
                                  <p className="text-slate-700 text-xs whitespace-pre-wrap">{assignment.remarks}</p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
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

// ── Delivery address & contact card (read-only) for the expanded assignment row ──
function DeliveryCard({ assignment, testId }) {
  const addr = assignment.delivery_address || {};
  const formatted = [addr.address_line1, addr.address_line2, addr.city, addr.state, addr.pincode]
    .filter(Boolean)
    .join(', ');
  const hasGps = Number.isFinite(addr.lat) && Number.isFinite(addr.lng);
  const mapsUrl = hasGps
    ? `https://www.google.com/maps?q=${addr.lat},${addr.lng}`
    : (formatted ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatted)}` : null);

  const copy = (val, label) => {
    if (!val) return;
    navigator.clipboard.writeText(val).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Copy failed'),
    );
  };

  return (
    <Card className="border border-emerald-100/60" data-testid={testId}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4 text-emerald-600" />
          Delivery Details
          {hasGps && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> GPS
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <Label className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /> Delivery Address
          </Label>
          {formatted ? (
            <div className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md p-2.5 mt-1 flex items-start justify-between gap-2">
              <span className="whitespace-pre-wrap leading-relaxed">{formatted}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => copy(formatted, 'Delivery address')}
                  className="text-slate-400 hover:text-slate-700"
                  title="Copy address"
                  data-testid={`${testId}-copy`}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-slate-700"
                    title="Open in Google Maps"
                    data-testid={`${testId}-maps`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic mt-1">Not set</p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-500">Delivery Contact</Label>
            <p className="text-slate-800">{assignment.delivery_contact_name || <span className="text-slate-400 italic">Not set</span>}</p>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Phone className="h-3 w-3" /> Phone
            </Label>
            {assignment.delivery_contact_phone ? (
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${assignment.delivery_contact_phone}`}
                  className="text-slate-800 font-mono hover:text-emerald-700"
                >
                  {assignment.delivery_contact_phone}
                </a>
                <button
                  onClick={() => copy(assignment.delivery_contact_phone, 'Phone')}
                  className="text-slate-400 hover:text-slate-700"
                  title="Copy phone"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <span className="text-slate-400 italic text-sm">Not set</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
