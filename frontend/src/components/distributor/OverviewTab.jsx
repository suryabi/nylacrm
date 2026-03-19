import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Building2, User, Phone, Mail, CreditCard } from 'lucide-react';
import { PAYMENT_TERMS, STATUS_OPTIONS } from './constants';

export default function OverviewTab({ 
  distributor, 
  isEditing, 
  editData, 
  setEditData 
}) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="space-y-2">
                <Label>Distributor Name</Label>
                <Input
                  value={editData.distributor_name || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, distributor_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Legal Entity Name</Label>
                <Input
                  value={editData.legal_entity_name || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, legal_entity_name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>GSTIN</Label>
                  <Input
                    value={editData.gstin || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, gstin: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>PAN</Label>
                  <Input
                    value={editData.pan || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, pan: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editData.status}
                  onValueChange={(v) => setEditData(prev => ({ ...prev, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">GSTIN</div>
                  <div className="font-medium">{distributor.gstin || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">PAN</div>
                  <div className="font-medium">{distributor.pan || '-'}</div>
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Billing Address</div>
                <div className="font-medium">{distributor.billing_address || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Registered Address</div>
                <div className="font-medium">{distributor.registered_address || '-'}</div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="space-y-2">
                <Label>Primary Contact Name</Label>
                <Input
                  value={editData.primary_contact_name || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, primary_contact_name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mobile</Label>
                  <Input
                    value={editData.primary_contact_mobile || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, primary_contact_mobile: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editData.primary_contact_email || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, primary_contact_email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Secondary Contact</h4>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={editData.secondary_contact_name || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, secondary_contact_name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="space-y-2">
                    <Label>Mobile</Label>
                    <Input
                      value={editData.secondary_contact_mobile || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, secondary_contact_mobile: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={editData.secondary_contact_email || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, secondary_contact_email: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="border-b pb-4">
                <h4 className="font-medium mb-2">Primary Contact</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{distributor.primary_contact_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{distributor.primary_contact_mobile}</span>
                  </div>
                  {distributor.primary_contact_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{distributor.primary_contact_email}</span>
                    </div>
                  )}
                </div>
              </div>
              {distributor.secondary_contact_name && (
                <div>
                  <h4 className="font-medium mb-2">Secondary Contact</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{distributor.secondary_contact_name}</span>
                    </div>
                    {distributor.secondary_contact_mobile && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{distributor.secondary_contact_mobile}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Commercial Terms */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Commercial Terms
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Payment Terms</Label>
                <Select
                  value={editData.payment_terms}
                  onValueChange={(v) => setEditData(prev => ({ ...prev, payment_terms: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map(term => (
                      <SelectItem key={term.value} value={term.value}>{term.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Credit Days</Label>
                <Input
                  type="number"
                  value={editData.credit_days || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, credit_days: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Credit Limit (₹)</Label>
                <Input
                  type="number"
                  value={editData.credit_limit || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, credit_limit: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Security Deposit (₹)</Label>
                <Input
                  type="number"
                  value={editData.security_deposit || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, security_deposit: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="text-sm text-muted-foreground">Payment Terms</div>
                <div className="font-medium">
                  {PAYMENT_TERMS.find(t => t.value === distributor.payment_terms)?.label || distributor.payment_terms}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Credit Days</div>
                <div className="font-medium">{distributor.credit_days} days</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Credit Limit</div>
                <div className="font-medium">₹{(distributor.credit_limit || 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Security Deposit</div>
                <div className="font-medium">₹{(distributor.security_deposit || 0).toLocaleString()}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
