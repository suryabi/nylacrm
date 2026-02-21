import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { accountsAPI, usersAPI, skusAPI } from '../utils/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Phone, MapPin, Save, Loader2, Plus, Trash2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const accountTypeColors = {
  'Tier 1': 'bg-emerald-100 text-emerald-800',
  'Tier 2': 'bg-blue-100 text-blue-800',
  'Tier 3': 'bg-gray-100 text-gray-800',
};

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [users, setUsers] = useState([]);
  const [masterSkus, setMasterSkus] = useState([]);
  
  // Editable fields
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [skuPricing, setSkuPricing] = useState([]);

  useEffect(() => {
    fetchAccount();
    fetchUsers();
    fetchMasterSkus();
  }, [id]);

  const fetchMasterSkus = async () => {
    try {
      const res = await skusAPI.getMasterList();
      setMasterSkus(res.data.skus || []);
    } catch (error) {
      console.log('Could not load master SKUs');
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await usersAPI.getAll();
      setUsers(res.data || []);
    } catch (error) {
      console.log('Could not load users');
    }
  };

  const getAssignedUserName = () => {
    if (!account?.assigned_to) return 'Unassigned';
    const user = users.find(u => u.id === account.assigned_to);
    return user ? `${user.name} - ${user.territory || 'No Territory'}` : account.assigned_to;
  };

  const fetchAccount = async () => {
    setLoading(true);
    try {
      const response = await accountsAPI.getById(id);
      const data = response.data;
      setAccount(data);
      setAccountName(data.account_name || '');
      setAccountType(data.account_type || '');
      setContactName(data.contact_name || '');
      setContactNumber(data.contact_number || '');
      setSkuPricing(data.sku_pricing || []);
      
      // Fetch invoices
      fetchInvoices(id);
    } catch (error) {
      toast.error('Failed to load account details');
      navigate('/accounts');
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoices = async (accountId) => {
    setLoadingInvoices(true);
    try {
      const response = await accountsAPI.getInvoices(accountId);
      setInvoiceData(response.data);
    } catch (error) {
      console.log('No invoice data available');
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await accountsAPI.update(id, {
        account_name: accountName,
        account_type: accountType || null,
        contact_name: contactName || null,
        contact_number: contactNumber || null,
        sku_pricing: skuPricing,
      });
      toast.success('Account updated successfully');
      setIsEditing(false);
      fetchAccount();
    } catch (error) {
      toast.error('Failed to update account');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSKU = () => {
    setSkuPricing([...skuPricing, { sku: '', price_per_unit: 0, return_bottle_credit: 0 }]);
  };

  const handleRemoveSKU = (index) => {
    setSkuPricing(skuPricing.filter((_, i) => i !== index));
  };

  const handleSKUChange = (index, field, value) => {
    const updated = [...skuPricing];
    updated[index] = { ...updated[index], [field]: field === 'sku' ? value : parseFloat(value) || 0 };
    setSkuPricing(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="text-center py-12">
        <p className="text-lg">Account not found</p>
        <Button onClick={() => navigate('/accounts')} className="mt-4">
          Back to Accounts
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="account-detail-page">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/accounts')} data-testid="back-button">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold">{account.account_name}</h1>
            {account.account_type && (
              <Badge className={accountTypeColors[account.account_type] || 'bg-gray-100'}>
                {account.account_type}
              </Badge>
            )}
          </div>
          <p className="text-sm font-mono text-muted-foreground mt-1" data-testid="account-unique-id">
            ID: {account.account_id}
          </p>
          {account.lead_id && (
            <p className="text-xs text-muted-foreground">
              Converted from Lead: {account.lead_id}
            </p>
          )}
        </div>
        <Button
          onClick={() => isEditing ? handleSave() : setIsEditing(true)}
          disabled={saving}
          data-testid="edit-save-button"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
          ) : isEditing ? (
            <><Save className="h-4 w-4 mr-2" /> Save Changes</>
          ) : (
            'Edit Account'
          )}
        </Button>
        {isEditing && (
          <Button variant="outline" onClick={() => {
            setIsEditing(false);
            setAccountName(account.account_name || '');
            setAccountType(account.account_type || '');
            setContactName(account.contact_name || '');
            setContactNumber(account.contact_number || '');
            setSkuPricing(account.sku_pricing || []);
          }}>
            Cancel
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account Information */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Account Information
            </h2>
            {isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Account Name *</Label>
                  <Input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    data-testid="edit-account-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Select value={accountType} onValueChange={setAccountType}>
                    <SelectTrigger data-testid="edit-account-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Tier 1">Tier 1</SelectItem>
                      <SelectItem value="Tier 2">Tier 2</SelectItem>
                      <SelectItem value="Tier 3">Tier 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    data-testid="edit-contact-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Number</Label>
                  <Input
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    data-testid="edit-contact-number"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Account Name</p>
                  <p className="font-medium">{account.account_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Account Type</p>
                  <p className="font-medium">{account.account_type || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Contact Name</p>
                  <p className="font-medium">{account.contact_name || '-'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Contact Number</p>
                    <p className="font-medium">{account.contact_number || '-'}</p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Location */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">City</p>
                <p className="font-medium">{account.city}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">State</p>
                <p className="font-medium">{account.state}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Territory</p>
                <p className="font-medium">{account.territory}</p>
              </div>
            </div>
          </Card>

          {/* SKU Pricing Grid */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">SKU Pricing</h2>
              {isEditing && (
                <Button size="sm" variant="outline" onClick={handleAddSKU} data-testid="add-sku-btn">
                  <Plus className="h-4 w-4 mr-1" /> Add SKU
                </Button>
              )}
            </div>
            
            {skuPricing.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No SKU pricing configured</p>
                {isEditing && (
                  <Button size="sm" variant="outline" onClick={handleAddSKU} className="mt-2">
                    Add First SKU
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" data-testid="sku-pricing-table">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-sm font-medium">SKU</th>
                      <th className="text-left px-3 py-2 text-sm font-medium">Price/Unit (₹)</th>
                      <th className="text-left px-3 py-2 text-sm font-medium">Bottle Credit (₹)</th>
                      {isEditing && <th className="w-10"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {skuPricing.map((item, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <Select
                              value={item.sku}
                              onValueChange={(val) => handleSKUChange(index, 'sku', val)}
                            >
                              <SelectTrigger className="w-[200px]" data-testid={`sku-select-${index}`}>
                                <SelectValue placeholder="Select SKU" />
                              </SelectTrigger>
                              <SelectContent>
                                {masterSkus.map((skuItem) => (
                                  <SelectItem key={skuItem.sku} value={skuItem.sku}>
                                    {skuItem.sku}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="font-medium">{item.sku}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <Input
                              type="number"
                              value={item.price_per_unit}
                              onChange={(e) => handleSKUChange(index, 'price_per_unit', e.target.value)}
                              className="w-24"
                            />
                          ) : (
                            <span>₹{item.price_per_unit?.toLocaleString()}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <Input
                              type="number"
                              value={item.return_bottle_credit}
                              onChange={(e) => handleSKUChange(index, 'return_bottle_credit', e.target.value)}
                              className="w-24"
                            />
                          ) : (
                            <span>₹{item.return_bottle_credit?.toLocaleString()}</span>
                          )}
                        </td>
                        {isEditing && (
                          <td className="px-3 py-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRemoveSKU(index)}
                              className="h-8 w-8 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Invoices */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoices
            </h2>
            {loadingInvoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : invoiceData && invoiceData.invoices?.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-lg font-semibold">₹{invoiceData.total_amount?.toLocaleString()}</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <p className="text-sm text-green-600">Paid Amount</p>
                    <p className="text-lg font-semibold text-green-700">₹{invoiceData.paid_amount?.toLocaleString()}</p>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg">
                    <p className="text-sm text-red-600">Outstanding</p>
                    <p className="text-lg font-semibold text-red-700">₹{invoiceData.outstanding?.toLocaleString()}</p>
                  </div>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {invoiceData.invoices.map((inv, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div>
                        <p className="font-medium">{inv.invoice_number || `Invoice #${idx + 1}`}</p>
                        <p className="text-sm text-muted-foreground">
                          {inv.created_at && format(new Date(inv.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">₹{inv.total_amount?.toLocaleString()}</p>
                        <Badge variant={inv.status === 'paid' ? 'success' : 'warning'} className="text-xs">
                          {inv.status || 'pending'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center py-8 text-muted-foreground">No invoices found for this account</p>
            )}
          </Card>
        </div>

        {/* Right Column - Financial Summary */}
        <div className="space-y-6">
          {/* Financial Overview */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Financial Summary</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Outstanding Balance</span>
                <span className={`font-semibold ${account.outstanding_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ₹{account.outstanding_balance?.toLocaleString() || '0'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Overdue Amount</span>
                <span className={`font-semibold ${account.overdue_amount > 0 ? 'text-red-600' : ''}`}>
                  ₹{account.overdue_amount?.toLocaleString() || '0'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Last Payment</span>
                <span className="font-semibold">
                  ₹{account.last_payment_amount?.toLocaleString() || '0'}
                </span>
              </div>
              {account.last_payment_date && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Last Payment Date</span>
                  <span className="text-sm">
                    {format(new Date(account.last_payment_date), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {/* Account Details */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Account Details</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Assigned To</p>
                <p className="font-medium">{getAssignedUserName()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">
                  {account.created_at && format(new Date(account.created_at), 'MMM d, yyyy')}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Last Updated</p>
                <p className="font-medium">
                  {account.updated_at && format(new Date(account.updated_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
