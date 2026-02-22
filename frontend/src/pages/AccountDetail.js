import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { accountsAPI, usersAPI, skusAPI } from '../utils/api';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { 
  ArrowLeft, Building2, Phone, MapPin, Save, Loader2, Plus, Trash2, FileText,
  DollarSign, CreditCard, Calendar, AlertTriangle, TrendingUp, Truck, Search
} from 'lucide-react';
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
  
  // Delivery Address state
  const [deliveryAddress, setDeliveryAddress] = useState({
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    pincode: '',
    landmark: ''
  });
  const [addressSearchQuery, setAddressSearchQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const addressSearchRef = useRef(null);

  useEffect(() => {
    fetchAccount();
    fetchUsers();
    fetchMasterSkus();
  }, [id]);

  // Search for address suggestions via backend API - restricted to account's city
  const handleAddressSearch = useCallback(async (query) => {
    setAddressSearchQuery(query);
    
    if (!query || query.length < 3) {
      setAddressSuggestions([]);
      setIsSearchingAddress(false);
      return;
    }

    setIsSearchingAddress(true);
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/api/lead-discovery/autocomplete`,
        {
          input: query,
          city: account?.city || ''
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      
      const predictions = response.data.predictions || [];
      
      // Sort to prioritize results in the account's city
      const cityLower = (account?.city || '').toLowerCase();
      const sortedPredictions = predictions.sort((a, b) => {
        const aInCity = a.description.toLowerCase().includes(cityLower);
        const bInCity = b.description.toLowerCase().includes(cityLower);
        if (aInCity && !bInCity) return -1;
        if (!aInCity && bInCity) return 1;
        return 0;
      });
      
      setAddressSuggestions(sortedPredictions);
    } catch (error) {
      console.error('Address search error:', error);
      setAddressSuggestions([]);
    } finally {
      setIsSearchingAddress(false);
    }
  }, [account?.city]);

  // Handle address selection from suggestions - use Geocoder for details
  const handleSelectAddress = (placeId, description) => {
    if (!placesServiceRef.current) {
      // Fallback: just use the description directly
      setDeliveryAddress({
        ...deliveryAddress,
        address_line1: description,
        city: account?.city || '',
        state: account?.state || ''
      });
      setAddressSearchQuery(description);
      setAddressSuggestions([]);
      toast.success('Address selected');
      return;
    }

    // Use Geocoder to get address components from place_id
    placesServiceRef.current.geocode(
      { placeId: placeId },
      (results, status) => {
        if (status === window.google.maps.GeocoderStatus.OK && results && results[0]) {
          const place = results[0];
          const components = place.address_components || [];
          let newAddress = {
            address_line1: description,
            address_line2: '',
            city: '',
            state: '',
            pincode: '',
            landmark: ''
          };

          components.forEach(comp => {
            const types = comp.types;
            if (types.includes('locality')) {
              newAddress.city = comp.long_name;
            } else if (types.includes('administrative_area_level_1')) {
              newAddress.state = comp.long_name;
            } else if (types.includes('postal_code')) {
              newAddress.pincode = comp.long_name;
            } else if (types.includes('sublocality_level_1') || types.includes('sublocality')) {
              newAddress.address_line2 = comp.long_name;
            } else if (types.includes('route') || types.includes('street_address')) {
              // If we have a more specific street, use it
              if (!newAddress.address_line1.includes(comp.long_name)) {
                newAddress.address_line1 = comp.long_name + ', ' + newAddress.address_line1;
              }
            }
          });

          // Fallback to account's city/state if not found in geocode result
          if (!newAddress.city) newAddress.city = account?.city || '';
          if (!newAddress.state) newAddress.state = account?.state || '';

          setDeliveryAddress(newAddress);
          setAddressSearchQuery(description);
          setAddressSuggestions([]);
          toast.success('Address details populated');
        } else {
          // Fallback on geocode failure
          setDeliveryAddress({
            ...deliveryAddress,
            address_line1: description,
            city: account?.city || '',
            state: account?.state || ''
          });
          setAddressSearchQuery(description);
          setAddressSuggestions([]);
          toast.success('Address selected');
        }
      }
    );
  };

  // Save delivery address
  const handleSaveDeliveryAddress = async () => {
    if (!deliveryAddress.address_line1) {
      toast.error('Please enter an address');
      return;
    }

    setSavingAddress(true);
    try {
      await accountsAPI.update(id, {
        delivery_address: deliveryAddress
      });
      toast.success('Delivery address saved successfully');
      fetchAccount(); // Refresh account data
    } catch (error) {
      toast.error('Failed to save delivery address');
    } finally {
      setSavingAddress(false);
    }
  };

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
      
      // Load delivery address if exists
      if (data.delivery_address) {
        setDeliveryAddress(data.delivery_address);
        setAddressSearchQuery(data.delivery_address.address_line1 || '');
      }
      
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

        {/* Right Column - Financial Summary & Delivery */}
        <div className="space-y-6">
          {/* Enhanced Financial Summary */}
          <Card className="p-6 bg-gradient-to-br from-slate-50 to-white border-slate-200" data-testid="financial-summary-card">
            <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Financial Summary
            </h2>
            
            {/* Total Order Value - Highlighted */}
            <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl p-4 mb-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium">Total Order Value</p>
                  <p className="text-2xl font-bold mt-1">
                    ₹{(invoiceData?.total_amount || account?.total_order_value || 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-white/20 rounded-full p-3">
                  <TrendingUp className="h-6 w-6" />
                </div>
              </div>
            </div>

            {/* Financial Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {/* Outstanding Balance */}
              <div className={`p-3 rounded-xl ${account?.outstanding_balance > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className={`h-4 w-4 ${account?.outstanding_balance > 0 ? 'text-amber-600' : 'text-green-600'}`} />
                  <span className="text-xs font-medium text-muted-foreground">Outstanding</span>
                </div>
                <p className={`text-lg font-bold ${account?.outstanding_balance > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                  ₹{(account?.outstanding_balance || 0).toLocaleString()}
                </p>
              </div>

              {/* Overdue Amount */}
              <div className={`p-3 rounded-xl ${account?.overdue_amount > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className={`h-4 w-4 ${account?.overdue_amount > 0 ? 'text-red-600' : 'text-green-600'}`} />
                  <span className="text-xs font-medium text-muted-foreground">Overdue</span>
                </div>
                <p className={`text-lg font-bold ${account?.overdue_amount > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  ₹{(account?.overdue_amount || 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Last Payment Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-800">Last Payment</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-blue-600">Amount</p>
                  <p className="text-xl font-bold text-blue-800">
                    ₹{(account?.last_payment_amount || 0).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-blue-600">Date</p>
                  <p className="text-sm font-semibold text-blue-800">
                    {account?.last_payment_date 
                      ? format(new Date(account.last_payment_date), 'MMM d, yyyy')
                      : 'No payment yet'
                    }
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Delivery Address Section */}
          <Card className="p-6" data-testid="delivery-address-card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Delivery Address
            </h2>
            
            {/* Google Powered Address Search */}
            <div className="relative mb-4" ref={addressSearchRef}>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Search Address</Label>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Powered by</span>
                  <span className="font-semibold text-[#4285F4]">G</span>
                  <span className="font-semibold text-[#EA4335]">o</span>
                  <span className="font-semibold text-[#FBBC05]">o</span>
                  <span className="font-semibold text-[#4285F4]">g</span>
                  <span className="font-semibold text-[#34A853]">l</span>
                  <span className="font-semibold text-[#EA4335]">e</span>
                </div>
              </div>
              
              {/* City context badge */}
              {account?.city && (
                <div className="mb-2">
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                    <MapPin className="h-3 w-3 mr-1" />
                    Searching in {account.city}, {account.state}
                  </Badge>
                </div>
              )}
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                <Input
                  type="text"
                  placeholder={`Search address in ${account?.city || 'your city'}...`}
                  value={addressSearchQuery}
                  onChange={(e) => handleAddressSearch(e.target.value)}
                  className="pl-10 pr-10 border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                  data-testid="address-search-input"
                />
                {isSearchingAddress ? (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />
                ) : (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <svg width="16" height="16" viewBox="0 0 24 24" className="text-muted-foreground">
                      <path fill="#4285F4" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                      <circle fill="white" cx="12" cy="9" r="2.5"/>
                    </svg>
                  </div>
                )}
              </div>
              
              {/* Suggestions Dropdown */}
              {addressSuggestions.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-blue-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {addressSuggestions.map((suggestion, idx) => (
                    <button
                      key={suggestion.place_id}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-start gap-3 ${idx !== addressSuggestions.length - 1 ? 'border-b border-gray-100' : ''}`}
                      onClick={() => handleSelectAddress(suggestion.place_id, suggestion.description)}
                      data-testid={`address-suggestion-${suggestion.place_id}`}
                    >
                      <MapPin className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{suggestion.structured_formatting?.main_text}</p>
                        <p className="text-xs text-muted-foreground">{suggestion.structured_formatting?.secondary_text}</p>
                      </div>
                    </button>
                  ))}
                  <div className="px-4 py-2 bg-gray-50 text-xs text-muted-foreground flex items-center justify-end gap-1">
                    <span>Powered by</span>
                    <svg width="50" height="16" viewBox="0 0 50 16">
                      <text x="0" y="12" fontSize="10" fontWeight="500">
                        <tspan fill="#4285F4">G</tspan>
                        <tspan fill="#EA4335">o</tspan>
                        <tspan fill="#FBBC05">o</tspan>
                        <tspan fill="#4285F4">g</tspan>
                        <tspan fill="#34A853">l</tspan>
                        <tspan fill="#EA4335">e</tspan>
                      </text>
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Address Fields */}
            <div className="space-y-4 pt-2 border-t">
              <p className="text-xs text-muted-foreground">Address fields will auto-populate when you select from search</p>
              <div>
                <Label className="text-xs text-muted-foreground">Address Line 1</Label>
                <Input
                  value={deliveryAddress.address_line1}
                  onChange={(e) => setDeliveryAddress({...deliveryAddress, address_line1: e.target.value})}
                  placeholder="Street address"
                  data-testid="address-line1-input"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Address Line 2</Label>
                <Input
                  value={deliveryAddress.address_line2}
                  onChange={(e) => setDeliveryAddress({...deliveryAddress, address_line2: e.target.value})}
                  placeholder="Area, Locality"
                  data-testid="address-line2-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">City</Label>
                  <Input
                    value={deliveryAddress.city}
                    onChange={(e) => setDeliveryAddress({...deliveryAddress, city: e.target.value})}
                    placeholder="City"
                    data-testid="address-city-input"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">State</Label>
                  <Input
                    value={deliveryAddress.state}
                    onChange={(e) => setDeliveryAddress({...deliveryAddress, state: e.target.value})}
                    placeholder="State"
                    data-testid="address-state-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Pincode</Label>
                  <Input
                    value={deliveryAddress.pincode}
                    onChange={(e) => setDeliveryAddress({...deliveryAddress, pincode: e.target.value})}
                    placeholder="Pincode"
                    data-testid="address-pincode-input"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Landmark</Label>
                  <Input
                    value={deliveryAddress.landmark}
                    onChange={(e) => setDeliveryAddress({...deliveryAddress, landmark: e.target.value})}
                    placeholder="Landmark"
                    data-testid="address-landmark-input"
                  />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <Button
              onClick={handleSaveDeliveryAddress}
              className="w-full mt-4"
              disabled={savingAddress || !deliveryAddress.address_line1}
              data-testid="save-delivery-address-btn"
            >
              {savingAddress ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" /> Save Delivery Address</>
              )}
            </Button>
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
