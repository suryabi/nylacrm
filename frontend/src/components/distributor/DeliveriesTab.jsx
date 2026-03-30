import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Checkbox } from '../ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Plus, Trash2, Truck, RefreshCw, Package, Calendar, FileText, Building2, X, Download, ChevronLeft, ChevronRight, Filter, CreditCard, Receipt, CheckCircle2, ChevronDown, AlertTriangle, Factory } from 'lucide-react';

const TIME_FILTERS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'this_year', label: 'This Year' },
  { value: 'lifetime', label: 'Lifetime' }
];

export default function DeliveriesTab({
  distributor,
  canManage,
  canDelete,
  deliveries,
  deliveriesLoading,
  deliveriesTotal,
  deliveriesPage,
  deliveriesPageSize,
  setDeliveriesPage,
  setDeliveriesPageSize,
  deliveriesTimeFilter,
  setDeliveriesTimeFilter,
  deliveriesAccountFilter,
  setDeliveriesAccountFilter,
  fetchDeliveries,
  skus,
  assignedAccounts,
  // Dialog state
  showDeliveryDialog,
  setShowDeliveryDialog,
  // Account selection
  selectedDeliveryAccount,
  setSelectedDeliveryAccount,
  deliveryAccountSearch,
  setDeliveryAccountSearch,
  // Form
  deliveryForm,
  setDeliveryForm,
  deliveryItems,
  addDeliveryItem,
  updateDeliveryItem,
  removeDeliveryItem,
  resetDeliveryForm,
  // Handlers
  handleCreateDelivery,
  savingDelivery,
  viewDeliveryDetail,
  setDeleteTarget,
  getDeliveryStatusBadge,
  // Excel download
  API_URL,
  token
}) {
  const [downloading, setDownloading] = useState(false);
  
  // Collapsible section state
  const [custSectionOpen, setCustSectionOpen] = useState(true);
  const [factorySectionOpen, setFactorySectionOpen] = useState(false);
  
  // Factory returns state
  const [factoryReturns, setFactoryReturns] = useState([]);
  const [factoryReturnsLoading, setFactoryReturnsLoading] = useState(false);
  const [factoryReturnsTotal, setFactoryReturnsTotal] = useState(0);
  const [factoryReturnsPage, setFactoryReturnsPage] = useState(1);
  const [factoryTimeFilter, setFactoryTimeFilter] = useState('this_month');
  const [showFactoryDialog, setShowFactoryDialog] = useState(false);
  const [factoryForm, setFactoryForm] = useState({ distributor_location_id: '', reason: 'expired', source: 'warehouse', customer_return_id: '', return_date: new Date().toISOString().split('T')[0], remarks: '' });
  const [factoryItems, setFactoryItems] = useState([{ sku_id: '', quantity: 1 }]);
  const [savingFactory, setSavingFactory] = useState(false);
  
  // Fetch factory returns
  const fetchFactoryReturns = useCallback(async () => {
    if (!distributor?.id) return;
    setFactoryReturnsLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/distributors/${distributor.id}/factory-returns?page=${factoryReturnsPage}&page_size=20&time_filter=${factoryTimeFilter}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setFactoryReturns(data.factory_returns || []);
        setFactoryReturnsTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Error fetching factory returns:', err);
    } finally {
      setFactoryReturnsLoading(false);
    }
  }, [distributor?.id, factoryReturnsPage, factoryTimeFilter, API_URL, token]);
  
  useEffect(() => {
    if (factorySectionOpen) fetchFactoryReturns();
  }, [factorySectionOpen, fetchFactoryReturns]);
  
  // Get distributor locations from distributor object
  const distributorLocations = distributor?.locations || [];
  
  const handleCreateFactoryReturn = async () => {
    if (!factoryForm.distributor_location_id || factoryItems.some(i => !i.sku_id || !i.quantity)) return;
    setSavingFactory(true);
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/factory-returns`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...factoryForm,
          items: factoryItems.filter(i => i.sku_id && i.quantity > 0)
        })
      });
      if (res.ok) {
        setShowFactoryDialog(false);
        setFactoryForm({ distributor_location_id: '', reason: 'expired', source: 'warehouse', customer_return_id: '', return_date: new Date().toISOString().split('T')[0], remarks: '' });
        setFactoryItems([{ sku_id: '', quantity: 1 }]);
        fetchFactoryReturns();
      }
    } catch (err) {
      console.error('Error creating factory return:', err);
    } finally {
      setSavingFactory(false);
    }
  };
  
  const handleFactoryAction = async (returnId, action) => {
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/factory-returns/${returnId}/${action}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) fetchFactoryReturns();
    } catch (err) {
      console.error(`Error ${action} factory return:`, err);
    }
  };
  
  const handleDeleteFactoryReturn = async (returnId) => {
    if (!window.confirm('Delete this factory return?')) return;
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/factory-returns/${returnId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchFactoryReturns();
    } catch (err) {
      console.error('Error deleting factory return:', err);
    }
  };
  
  const getFactoryStatusBadge = (status) => {
    const map = {
      draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
      confirmed: { label: 'Confirmed', className: 'bg-blue-100 text-blue-700' },
      received: { label: 'Received', className: 'bg-emerald-100 text-emerald-700' },
      cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700' }
    };
    const s = map[status] || map.draft;
    return <Badge className={s.className}>{s.label}</Badge>;
  };
  
  // Credit notes state
  const [availableCreditNotes, setAvailableCreditNotes] = useState([]);
  const [loadingCreditNotes, setLoadingCreditNotes] = useState(false);
  const [selectedCreditNotes, setSelectedCreditNotes] = useState({}); // {credit_note_id: amount_to_apply}
  
  const totalPages = Math.ceil((deliveriesTotal || 0) / (deliveriesPageSize || 20));
  
  // Fetch available credit notes when account is selected
  useEffect(() => {
    const fetchCreditNotes = async () => {
      if (!selectedDeliveryAccount?.account_id && !selectedDeliveryAccount?.id) {
        setAvailableCreditNotes([]);
        setSelectedCreditNotes({});
        return;
      }
      
      setLoadingCreditNotes(true);
      try {
        const accountId = selectedDeliveryAccount.account_id || selectedDeliveryAccount.id;
        const response = await fetch(
          `${API_URL}/api/distributors/${distributor.id}/credit-notes/for-account/${accountId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          setAvailableCreditNotes(data.credit_notes || []);
        } else {
          setAvailableCreditNotes([]);
        }
      } catch (error) {
        console.error('Error fetching credit notes:', error);
        setAvailableCreditNotes([]);
      } finally {
        setLoadingCreditNotes(false);
      }
    };
    
    fetchCreditNotes();
  }, [selectedDeliveryAccount, distributor.id, API_URL, token]);
  
  // Reset credit notes when dialog closes
  useEffect(() => {
    if (!showDeliveryDialog) {
      setSelectedCreditNotes({});
    }
  }, [showDeliveryDialog]);
  
  // Calculate total credit to be applied
  const totalCreditToApply = Object.values(selectedCreditNotes).reduce((sum, amt) => sum + (parseFloat(amt) || 0), 0);
  
  // Calculate delivery total amount
  const deliveryTotalAmount = deliveryItems.reduce((sum, item) => {
    const gross = item.quantity * item.unit_price;
    const afterDiscount = gross * (1 - (item.discount_percent || 0) / 100);
    const withTax = afterDiscount * (1 + (item.tax_percent || 0) / 100);
    return sum + withTax;
  }, 0);
  
  // Calculate net billing amount
  const netBillingAmount = Math.max(0, deliveryTotalAmount - totalCreditToApply);
  
  // Handle credit note selection toggle
  const handleCreditNoteToggle = (creditNote, checked) => {
    if (checked) {
      // Add with full balance by default
      setSelectedCreditNotes(prev => ({
        ...prev,
        [creditNote.id]: creditNote.balance_amount
      }));
    } else {
      // Remove
      setSelectedCreditNotes(prev => {
        const updated = { ...prev };
        delete updated[creditNote.id];
        return updated;
      });
    }
  };
  
  // Handle credit note amount change
  const handleCreditNoteAmountChange = (creditNoteId, value, maxAmount) => {
    const numValue = parseFloat(value) || 0;
    const clampedValue = Math.min(Math.max(0, numValue), maxAmount);
    
    if (clampedValue > 0) {
      setSelectedCreditNotes(prev => ({
        ...prev,
        [creditNoteId]: clampedValue
      }));
    } else {
      setSelectedCreditNotes(prev => {
        const updated = { ...prev };
        delete updated[creditNoteId];
        return updated;
      });
    }
  };
  
  // Custom handler that wraps the original handleCreateDelivery
  const handleCreateDeliveryWithCredits = async () => {
    // Prepare credit notes for submission
    const creditNotesToApply = Object.entries(selectedCreditNotes)
      .filter(([_, amount]) => amount > 0)
      .map(([credit_note_id, amount_to_apply]) => ({
        credit_note_id,
        amount_to_apply
      }));
    
    // Pass credit notes to the parent handler
    await handleCreateDelivery(creditNotesToApply);
  };
  
  // Download as Excel
  const downloadExcel = async () => {
    setDownloading(true);
    try {
      // Prepare data for Excel
      const excelData = [];
      
      deliveries.forEach(delivery => {
        const items = delivery.items || [];
        if (items.length > 0) {
          items.forEach(item => {
            const qty = item.quantity || 0;
            const customerPrice = item.customer_selling_price || item.unit_price || 0;
            const commissionPct = item.distributor_commission_percent || item.margin_percent || 2.5;
            const basePrice = item.base_price || item.transfer_price || 0;
            
            // Calculations matching the table
            const transferPrice = basePrice > 0 ? basePrice * (1 - commissionPct / 100) : 0;
            const billedToDist = qty * transferPrice;
            const newTransferPrice = customerPrice > 0 ? customerPrice * (1 - commissionPct / 100) : 0;
            const actualBillable = qty * newTransferPrice;
            const adjustment = actualBillable - billedToDist;
            const customerInvoice = qty * customerPrice;
            
            excelData.push({
              'Delivery #': delivery.delivery_number,
              'Date': new Date(delivery.delivery_date).toLocaleDateString(),
              'Account': delivery.account_name,
              'City': delivery.account_city,
              'SKU': item.sku_name || item.sku_code || 'N/A',
              'Quantity': qty,
              'Margin %': commissionPct,
              'Base Price': basePrice,
              'Transfer Price': transferPrice,
              'Billed to Distributor': billedToDist,
              'Customer Price': customerPrice,
              'New Transfer Price': newTransferPrice,
              'Actual Billable to Distributor': actualBillable,
              'Adjustment (Dist to Factory)': adjustment,
              'Customer Invoice Amount': customerInvoice,
              'Status': delivery.status
            });
          });
        } else {
          excelData.push({
            'Delivery #': delivery.delivery_number,
            'Date': new Date(delivery.delivery_date).toLocaleDateString(),
            'Account': delivery.account_name,
            'City': delivery.account_city,
            'SKU': 'No items',
            'Quantity': 0,
            'Margin %': 0,
            'Base Price': 0,
            'Transfer Price': 0,
            'Billed to Distributor': 0,
            'Customer Price': 0,
            'New Transfer Price': 0,
            'Actual Billable to Distributor': 0,
            'Adjustment (Dist to Factory)': 0,
            'Customer Invoice Amount': 0,
            'Status': delivery.status
          });
        }
      });
      
      // Convert to CSV
      if (excelData.length === 0) {
        alert('No data to download');
        return;
      }
      
      const headers = Object.keys(excelData[0]);
      const csvContent = [
        headers.join(','),
        ...excelData.map(row => 
          headers.map(header => {
            const value = row[header];
            // Escape commas and quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',')
        )
      ].join('\n');
      
      // Download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `deliveries_${distributor?.name || 'distributor'}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download');
    } finally {
      setDownloading(false);
    }
  };
  
  return (
    <div className="space-y-6">
    {/* Section 1: Distributor → Customer */}
    <Collapsible open={custSectionOpen} onOpenChange={setCustSectionOpen}>
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left hover:text-emerald-700 transition-colors" data-testid="cust-section-trigger">
              <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${custSectionOpen ? '' : '-rotate-90'}`} />
              <div>
                <CardTitle className="text-lg">Stock Out (Distributor → Customer)</CardTitle>
                <CardDescription>Deliveries from this distributor to assigned accounts</CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            {/* Excel Download */}
            <Button 
              variant="outline" 
              onClick={downloadExcel} 
              disabled={downloading || deliveries.length === 0}
              data-testid="download-deliveries-btn"
            >
              <Download className="h-4 w-4 mr-2" />
              {downloading ? 'Downloading...' : 'Download Excel'}
            </Button>
            
            {canManage && (
              <Dialog open={showDeliveryDialog} onOpenChange={(open) => {
                setShowDeliveryDialog(open);
                if (!open) resetDeliveryForm();
              }}>
                <DialogTrigger asChild>
                  <Button data-testid="create-delivery-btn">
                    <Plus className="h-4 w-4 mr-2" />
                    Record Delivery
                  </Button>
                </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Record Account Delivery</DialogTitle>
                <DialogDescription>
                  Record a delivery from {distributor.distributor_name} to an account
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Account Selection - Searchable */}
                <div className="space-y-2">
                  <Label>Account *</Label>
                  {selectedDeliveryAccount ? (
                    <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{selectedDeliveryAccount.account_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedDeliveryAccount.city}{selectedDeliveryAccount.state ? `, ${selectedDeliveryAccount.state}` : ''}
                          {selectedDeliveryAccount.is_primary && ' ★ Primary'}
                        </p>
                        {selectedDeliveryAccount.contact_name && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Contact: {selectedDeliveryAccount.contact_name}
                            {selectedDeliveryAccount.contact_number && ` • ${selectedDeliveryAccount.contact_number}`}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedDeliveryAccount(null);
                          setDeliveryForm(prev => ({ ...prev, account_id: '', distributor_location_id: '' }));
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        placeholder="Search accounts by name or city..."
                        value={deliveryAccountSearch || ''}
                        onChange={(e) => setDeliveryAccountSearch(e.target.value)}
                        data-testid="delivery-account-search"
                        className="w-full"
                      />
                      <div className="border rounded-md max-h-[200px] overflow-y-auto">
                        {assignedAccounts.length === 0 ? (
                          <div className="p-4 text-sm text-muted-foreground text-center">
                            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No accounts assigned to this distributor</p>
                            <p className="text-xs mt-1">Assign accounts first from the Assignments tab</p>
                          </div>
                        ) : (
                          assignedAccounts
                            .filter(account => {
                              if (!deliveryAccountSearch) return true;
                              const search = deliveryAccountSearch.toLowerCase();
                              return (
                                account.account_name?.toLowerCase().includes(search) ||
                                account.city?.toLowerCase().includes(search) ||
                                account.contact_name?.toLowerCase().includes(search) ||
                                account.territory?.toLowerCase().includes(search)
                              );
                            })
                            .map(account => (
                              <div
                                key={account.id}
                                className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0 transition-colors"
                                onClick={() => {
                                  setSelectedDeliveryAccount(account);
                                  setDeliveryForm(prev => ({ 
                                    ...prev, 
                                    account_id: account.id,
                                    distributor_location_id: account.distributor_location_id || ''
                                  }));
                                  setDeliveryAccountSearch('');
                                }}
                                data-testid={`delivery-account-option-${account.id}`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">
                                      {account.account_name}
                                      {account.is_primary && <span className="ml-2 text-yellow-600">★ Primary</span>}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {account.city}{account.state ? `, ${account.state}` : ''}
                                      {account.territory && ` • ${account.territory}`}
                                    </p>
                                    {account.contact_name && (
                                      <p className="text-xs text-muted-foreground">
                                        Contact: {account.contact_name}
                                      </p>
                                    )}
                                  </div>
                                  {account.distributor_location_name && (
                                    <Badge variant="outline" className="ml-2 text-xs shrink-0">
                                      {account.distributor_location_name}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))
                        )}
                        {assignedAccounts.length > 0 && deliveryAccountSearch && 
                         assignedAccounts.filter(a => {
                           const search = deliveryAccountSearch.toLowerCase();
                           return a.account_name?.toLowerCase().includes(search) || 
                                  a.city?.toLowerCase().includes(search) ||
                                  a.contact_name?.toLowerCase().includes(search);
                         }).length === 0 && (
                          <div className="p-4 text-sm text-muted-foreground text-center">
                            No accounts found matching "{deliveryAccountSearch}"
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {assignedAccounts.length} account{assignedAccounts.length !== 1 ? 's' : ''} assigned to this distributor
                      </p>
                    </div>
                  )}
                </div>

                {/* Location & Date */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>From Location *</Label>
                    <Select
                      value={deliveryForm.distributor_location_id}
                      onValueChange={(v) => setDeliveryForm(prev => ({ ...prev, distributor_location_id: v }))}
                    >
                      <SelectTrigger data-testid="delivery-location-select">
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
                    <Label>Delivery Date *</Label>
                    <Input
                      type="date"
                      value={deliveryForm.delivery_date}
                      onChange={(e) => setDeliveryForm(prev => ({ ...prev, delivery_date: e.target.value }))}
                      data-testid="delivery-date-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reference Number</Label>
                    <Input
                      placeholder="e.g., INV-2026-001"
                      value={deliveryForm.reference_number}
                      onChange={(e) => setDeliveryForm(prev => ({ ...prev, reference_number: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vehicle Number</Label>
                    <Input
                      placeholder="KA-01-AB-1234"
                      value={deliveryForm.vehicle_number}
                      onChange={(e) => setDeliveryForm(prev => ({ ...prev, vehicle_number: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Delivery Items */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-semibold">Delivery Items</Label>
                      {selectedDeliveryAccount && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {selectedDeliveryAccount.sku_pricing?.length > 0 
                            ? `Showing ${selectedDeliveryAccount.sku_pricing.length} SKU(s) configured for ${selectedDeliveryAccount.account_name}`
                            : `No SKU pricing configured for ${selectedDeliveryAccount.account_name} - showing all SKUs`
                          }
                        </p>
                      )}
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={addDeliveryItem} 
                      disabled={!selectedDeliveryAccount}
                      data-testid="add-delivery-item-btn"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>
                  
                  {!selectedDeliveryAccount ? (
                    <div className="text-center py-6 text-muted-foreground border rounded-md bg-muted/20">
                      <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Select an account first to add delivery items</p>
                    </div>
                  ) : deliveryItems.length === 0 ? (
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
                      {deliveryItems.map((item, index) => (
                        <div key={item.id} className="flex items-center gap-3 p-3 border rounded-md bg-muted/30" data-testid={`delivery-item-${index}`}>
                          <div className="flex-[3] min-w-0">
                            <Select
                              value={item.sku_id}
                              onValueChange={(v) => {
                                const accountSkus = selectedDeliveryAccount?.sku_pricing || [];
                                const selectedSku = accountSkus.find(s => s.id === v) || skus.find(s => s.id === v);
                                updateDeliveryItem(item.id, 'sku_id', v);
                                if (selectedSku) {
                                  updateDeliveryItem(item.id, 'sku_name', selectedSku.name || selectedSku.sku_name);
                                  if (selectedSku.price_per_unit) {
                                    updateDeliveryItem(item.id, 'unit_price', selectedSku.price_per_unit);
                                  }
                                }
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select SKU" />
                              </SelectTrigger>
                              <SelectContent>
                                {(selectedDeliveryAccount?.sku_pricing?.length > 0 
                                  ? selectedDeliveryAccount.sku_pricing 
                                  : skus
                                ).map(sku => (
                                  <SelectItem key={sku.id} value={sku.id}>
                                    {sku.name || sku.sku_name}
                                    {sku.price_per_unit && ` - ₹${sku.price_per_unit}`}
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
                              onChange={(e) => updateDeliveryItem(item.id, 'quantity', e.target.value)}
                            />
                          </div>
                          <div className="w-24">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="h-9"
                              value={item.unit_price}
                              onChange={(e) => updateDeliveryItem(item.id, 'unit_price', e.target.value)}
                            />
                          </div>
                          <div className="w-16">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              className="h-9"
                              value={item.discount_percent}
                              onChange={(e) => updateDeliveryItem(item.id, 'discount_percent', e.target.value)}
                            />
                          </div>
                          <div className="w-16">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              className="h-9"
                              value={item.tax_percent}
                              onChange={(e) => updateDeliveryItem(item.id, 'tax_percent', e.target.value)}
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
                              onClick={() => removeDeliveryItem(item.id)}
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
                            ₹{deliveryTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Credit Notes Section */}
                {selectedDeliveryAccount && deliveryItems.length > 0 && (
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-emerald-600" />
                        <Label className="text-base font-semibold">Apply Credit Notes</Label>
                      </div>
                      {availableCreditNotes.length > 0 && (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
                          {availableCreditNotes.length} credit note{availableCreditNotes.length !== 1 ? 's' : ''} available
                        </Badge>
                      )}
                    </div>
                    
                    {loadingCreditNotes ? (
                      <div className="flex items-center justify-center py-4">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Loading credit notes...</span>
                      </div>
                    ) : availableCreditNotes.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground border rounded-md bg-muted/20">
                        <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No credit notes available for this account</p>
                        <p className="text-xs mt-1">Credit notes are generated when customer returns are confirmed</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Select credit notes to offset the customer billing amount
                        </p>
                        <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                          {availableCreditNotes.map(cn => {
                            const isSelected = selectedCreditNotes[cn.id] !== undefined;
                            const selectedAmount = selectedCreditNotes[cn.id] || 0;
                            
                            return (
                              <div 
                                key={cn.id} 
                                className={`p-3 transition-colors ${isSelected ? 'bg-emerald-50/50' : 'hover:bg-muted/30'}`}
                                data-testid={`credit-note-row-${cn.id}`}
                              >
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    id={`cn-${cn.id}`}
                                    checked={isSelected}
                                    onCheckedChange={(checked) => handleCreditNoteToggle(cn, checked)}
                                    className="mt-0.5"
                                    data-testid={`credit-note-checkbox-${cn.id}`}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <label 
                                        htmlFor={`cn-${cn.id}`} 
                                        className="font-medium text-sm cursor-pointer"
                                      >
                                        {cn.credit_note_number}
                                      </label>
                                      <span className="text-sm font-semibold text-emerald-600">
                                        ₹{cn.balance_amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })} available
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                      <span>Return: {cn.return_number || 'N/A'}</span>
                                      <span>•</span>
                                      <span>{cn.credit_note_date ? new Date(cn.credit_note_date).toLocaleDateString() : 'N/A'}</span>
                                      <span>•</span>
                                      <span>Original: ₹{cn.original_amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    
                                    {isSelected && (
                                      <div className="flex items-center gap-2 mt-2">
                                        <span className="text-xs text-muted-foreground">Apply:</span>
                                        <Input
                                          type="number"
                                          min="0"
                                          max={cn.balance_amount}
                                          step="0.01"
                                          value={selectedAmount}
                                          onChange={(e) => handleCreditNoteAmountChange(cn.id, e.target.value, cn.balance_amount)}
                                          className="h-7 w-28 text-sm"
                                          data-testid={`credit-note-amount-${cn.id}`}
                                        />
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => handleCreditNoteAmountChange(cn.id, cn.balance_amount, cn.balance_amount)}
                                        >
                                          Max
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Credit Notes Summary */}
                        {totalCreditToApply > 0 && (
                          <div className="border rounded-md p-3 bg-emerald-50/50 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Delivery Total:</span>
                              <span className="font-medium">₹{deliveryTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-sm text-emerald-600">
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Credit Notes Applied ({Object.keys(selectedCreditNotes).length}):
                              </span>
                              <span className="font-medium">- ₹{totalCreditToApply.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-base font-bold border-t pt-2">
                              <span>Net Customer Billing:</span>
                              <span className="text-emerald-700">₹{netBillingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Remarks */}
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea
                    placeholder="Any additional notes..."
                    value={deliveryForm.remarks}
                    onChange={(e) => setDeliveryForm(prev => ({ ...prev, remarks: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDeliveryDialog(false)}>Cancel</Button>
                <Button
                  onClick={handleCreateDeliveryWithCredits}
                  disabled={savingDelivery || !deliveryForm.account_id || !deliveryForm.distributor_location_id || deliveryItems.length === 0}
                  data-testid="save-delivery-btn"
                >
                  {savingDelivery ? 'Creating...' : 'Record Delivery'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
          </div>
        </div>
      </CardHeader>
      <CollapsibleContent>
      <CardContent>
        {/* Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Time Period:</span>
            </div>
            <select
              value={deliveriesTimeFilter || 'this_month'}
              onChange={(e) => {
                setDeliveriesTimeFilter(e.target.value);
                setDeliveriesPage(1);
              }}
              className="text-sm border rounded-md px-3 py-1.5 bg-background"
              data-testid="deliveries-time-filter"
            >
              {TIME_FILTERS.map(tf => (
                <option key={tf.value} value={tf.value}>{tf.label}</option>
              ))}
            </select>
            
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Account:</span>
            </div>
            <select
              value={deliveriesAccountFilter || 'all'}
              onChange={(e) => {
                setDeliveriesAccountFilter(e.target.value);
                setDeliveriesPage(1);
              }}
              className="text-sm border rounded-md px-3 py-1.5 bg-background min-w-[200px]"
              data-testid="deliveries-account-filter"
            >
              <option value="all">All Accounts</option>
              {assignedAccounts.map(account => (
                <option key={account.id} value={account.account_id}>
                  {account.account_name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <select
                value={deliveriesPageSize || 20}
                onChange={(e) => {
                  setDeliveriesPageSize(Number(e.target.value));
                  setDeliveriesPage(1);
                }}
                className="text-sm border rounded-md px-2 py-1.5 bg-background"
                data-testid="deliveries-page-size"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm text-muted-foreground">per page</span>
            </div>
            
            <div className="text-sm text-muted-foreground">
              Total: <span className="font-medium">{deliveriesTotal || 0}</span> deliveries
            </div>
          </div>
        </div>
        
        {deliveriesLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No deliveries recorded</p>
            <p className="text-sm">Record deliveries to track stock movement to accounts</p>
            {assignedAccounts.length === 0 && (
              <p className="text-sm text-amber-600 mt-2">Note: Assign accounts first before recording deliveries</p>
            )}
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="deliveries-table">
              <thead>
                <tr className="border-b-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-slate-50">
                  <th className="text-left p-4 font-semibold text-slate-700 uppercase tracking-wider text-xs">Delivery</th>
                  <th className="text-left p-4 font-semibold text-slate-700 uppercase tracking-wider text-xs">Account</th>
                  <th className="text-center p-4 font-semibold text-slate-700 uppercase tracking-wider text-xs">Items</th>
                  <th className="text-right p-4 font-semibold text-slate-700 uppercase tracking-wider text-xs">Customer Billing</th>
                  <th className="text-right p-4 font-semibold text-emerald-700 uppercase tracking-wider text-xs">Return Credit</th>
                  <th className="text-right p-4 font-semibold text-indigo-700 uppercase tracking-wider text-xs">Net Customer Billing</th>
                  <th className="text-right p-4 font-semibold text-purple-700 uppercase tracking-wider text-xs">Billable to Dist</th>
                  <th className="text-center p-4 font-semibold text-slate-700 uppercase tracking-wider text-xs">Status</th>
                  <th className="text-center p-4 font-semibold text-slate-700 uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => {
                  const items = delivery.items || [];
                  
                  // Credit notes info
                  const appliedCreditNotes = delivery.applied_credit_notes || [];
                  const totalCreditApplied = delivery.total_credit_applied || 0;
                  const hasCreditNotes = appliedCreditNotes.length > 0 || totalCreditApplied > 0;
                  
                  // Pre-tax Customer Billing (without GST)
                  const customerBilling = items.reduce((sum, item) => {
                    const qty = item.quantity || 0;
                    const price = item.customer_selling_price || item.unit_price || 0;
                    const disc = item.discount_percent || 0;
                    return sum + qty * price * (1 - disc / 100);
                  }, 0);
                  
                  // Net Customer Billing (pre-tax, after credit)
                  const netCustomerBilling = Math.max(0, customerBilling - totalCreditApplied);
                  
                  // Actual Billable to Dist (pre-tax, without GST)
                  const totalActualBillable = items.reduce((sum, item) => {
                    const qty = item.quantity || 0;
                    const customerPrice = item.customer_selling_price || item.unit_price || 0;
                    const commissionPct = item.distributor_commission_percent || item.margin_percent || 2.5;
                    const newTransferPrice = customerPrice > 0 ? customerPrice * (1 - commissionPct / 100) : 0;
                    return sum + (qty * newTransferPrice);
                  }, 0);
                  
                  // Final Billable to Dist (pre-tax, after credit)
                  const finalBillableToDist = totalActualBillable - totalCreditApplied;
                  
                  return (
                    <tr 
                      key={delivery.id} 
                      className="border-b border-slate-100 hover:bg-emerald-50/40 cursor-pointer transition-colors"
                      onClick={() => viewDeliveryDetail(delivery.id)}
                      data-testid={`delivery-row-${delivery.id}`}
                    >
                      {/* Delivery # and Date */}
                      <td className="p-4">
                        <button 
                          className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                          onClick={(e) => { e.stopPropagation(); viewDeliveryDetail(delivery.id); }}
                        >
                          {delivery.delivery_number}
                        </button>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {new Date(delivery.delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </td>
                      
                      {/* Account */}
                      <td className="p-4">
                        <p className="font-medium text-slate-700">{delivery.account_name}</p>
                        <p className="text-xs text-slate-500">{delivery.account_city || ''}</p>
                      </td>
                      
                      {/* Items Count */}
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center justify-center bg-slate-100 text-slate-700 text-sm font-medium px-2.5 py-1 rounded-full">
                          {items.length} {items.length === 1 ? 'item' : 'items'}
                        </span>
                      </td>
                      
                      {/* Customer Billing (pre-tax) */}
                      <td className="p-4 text-right">
                        <span className="font-medium text-slate-800">
                          ₹{customerBilling.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      
                      {/* Return Credit */}
                      <td className="p-4 text-right">
                        {hasCreditNotes ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="inline-flex items-center bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5 rounded-full">
                              {appliedCreditNotes.length} CN
                            </span>
                            <span className="text-emerald-600 font-medium">
                              -₹{totalCreditApplied.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </td>
                      
                      {/* Net Billing (pre-tax, after credit) */}
                      <td className="p-4 text-right">
                        <span className={`font-bold ${hasCreditNotes ? 'text-indigo-600' : 'text-slate-700'}`}>
                          ₹{netCustomerBilling.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      
                      {/* Billable to Dist (pre-tax, after credit) */}
                      <td className="p-4 text-right">
                        <span className="font-bold text-purple-700">
                          ₹{finalBillableToDist.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        {hasCreditNotes && (
                          <p className="text-xs text-purple-500 mt-0.5">
                            (after CN)
                          </p>
                        )}
                      </td>
                      
                      {/* Status */}
                      <td className="p-4 text-center">
                        {getDeliveryStatusBadge(delivery.status)}
                      </td>
                      
                      {/* Actions */}
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 hover:bg-emerald-100"
                            onClick={(e) => { e.stopPropagation(); viewDeliveryDetail(delivery.id); }}
                            data-testid={`view-delivery-${delivery.id}`}
                            title="View Details"
                          >
                            <FileText className="h-4 w-4 text-emerald-700" />
                          </Button>
                          {(canDelete || (canManage && delivery.status === 'draft')) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({
                                  type: 'delivery',
                                  id: delivery.id,
                                  name: delivery.delivery_number
                                });
                              }}
                              data-testid={`delete-delivery-${delivery.id}`}
                              title="Delete"
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

          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {((deliveriesPage - 1) * deliveriesPageSize) + 1} to {Math.min(deliveriesPage * deliveriesPageSize, deliveriesTotal)} of {deliveriesTotal} deliveries
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeliveriesPage(1)}
                  disabled={deliveriesPage === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeliveriesPage(prev => Math.max(1, prev - 1))}
                  disabled={deliveriesPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1 px-2">
                  <span className="text-sm">Page</span>
                  <Input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={deliveriesPage}
                    onChange={(e) => {
                      const page = parseInt(e.target.value);
                      if (page >= 1 && page <= totalPages) {
                        setDeliveriesPage(page);
                      }
                    }}
                    className="w-16 h-8 text-center"
                  />
                  <span className="text-sm">of {totalPages}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeliveriesPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={deliveriesPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeliveriesPage(totalPages)}
                  disabled={deliveriesPage === totalPages}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </>
        )}
      </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>

    {/* Section 2: Distributor → Factory */}
    <Collapsible open={factorySectionOpen} onOpenChange={setFactorySectionOpen}>
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left hover:text-amber-700 transition-colors" data-testid="factory-section-trigger">
              <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${factorySectionOpen ? '' : '-rotate-90'}`} />
              <div>
                <CardTitle className="text-lg">Stock Out (Distributor → Factory)</CardTitle>
                <CardDescription>Return expired or damaged stock to factory for base price credit</CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            {canManage && (
              <Dialog open={showFactoryDialog} onOpenChange={setShowFactoryDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="create-factory-return-btn">
                    <Plus className="h-4 w-4 mr-2" />
                    New Factory Return
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>New Factory Return</DialogTitle>
                    <DialogDescription>Return expired or damaged stock from warehouse to factory</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Warehouse Location *</Label>
                        <select
                          value={factoryForm.distributor_location_id}
                          onChange={(e) => setFactoryForm(f => ({ ...f, distributor_location_id: e.target.value }))}
                          className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                          data-testid="factory-location-select"
                        >
                          <option value="">Select Location</option>
                          {distributorLocations.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.location_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Reason *</Label>
                        <select
                          value={factoryForm.reason}
                          onChange={(e) => setFactoryForm(f => ({ ...f, reason: e.target.value }))}
                          className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                          data-testid="factory-reason-select"
                        >
                          <option value="expired">Expired Stock</option>
                          <option value="damaged">Damaged Stock</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Return Date</Label>
                        <Input
                          type="date"
                          value={factoryForm.return_date}
                          onChange={(e) => setFactoryForm(f => ({ ...f, return_date: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Source</Label>
                        <select
                          value={factoryForm.source}
                          onChange={(e) => setFactoryForm(f => ({ ...f, source: e.target.value }))}
                          className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                          data-testid="factory-source-select"
                        >
                          <option value="warehouse">Warehouse Stock</option>
                          <option value="customer_return">From Customer Return</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* Items */}
                    <div className="space-y-2">
                      <Label>Items *</Label>
                      <div className="space-y-2">
                        {factoryItems.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <select
                              value={item.sku_id}
                              onChange={(e) => {
                                const updated = [...factoryItems];
                                updated[idx].sku_id = e.target.value;
                                setFactoryItems(updated);
                              }}
                              className="flex-1 text-sm border rounded-md px-3 py-2 bg-background"
                              data-testid={`factory-sku-select-${idx}`}
                            >
                              <option value="">Select SKU</option>
                              {skus.map(sku => (
                                <option key={sku.id} value={sku.id}>{sku.name} ({sku.sku_code})</option>
                              ))}
                            </select>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const updated = [...factoryItems];
                                updated[idx].quantity = parseInt(e.target.value) || 1;
                                setFactoryItems(updated);
                              }}
                              className="w-24"
                              placeholder="Qty"
                              data-testid={`factory-qty-input-${idx}`}
                            />
                            {factoryItems.length > 1 && (
                              <Button variant="ghost" size="sm" onClick={() => setFactoryItems(factoryItems.filter((_, i) => i !== idx))}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => setFactoryItems([...factoryItems, { sku_id: '', quantity: 1 }])}>
                          <Plus className="h-4 w-4 mr-1" /> Add Item
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Remarks</Label>
                      <Textarea
                        value={factoryForm.remarks}
                        onChange={(e) => setFactoryForm(f => ({ ...f, remarks: e.target.value }))}
                        placeholder="Additional notes..."
                        rows={2}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowFactoryDialog(false)}>Cancel</Button>
                    <Button
                      onClick={handleCreateFactoryReturn}
                      disabled={savingFactory || !factoryForm.distributor_location_id || factoryItems.every(i => !i.sku_id)}
                      data-testid="save-factory-return-btn"
                    >
                      {savingFactory ? 'Saving...' : 'Create Factory Return'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </CardHeader>
      <CollapsibleContent>
      <CardContent>
        {/* Factory Returns Filters */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={factoryTimeFilter}
              onChange={(e) => { setFactoryTimeFilter(e.target.value); setFactoryReturnsPage(1); }}
              className="text-sm border rounded-md px-3 py-1.5 bg-background"
              data-testid="factory-time-filter"
            >
              {TIME_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Total: <span className="font-medium">{factoryReturnsTotal}</span> returns</span>
            <Button variant="ghost" size="sm" onClick={fetchFactoryReturns}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {factoryReturnsLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : factoryReturns.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Factory className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No factory returns recorded</p>
            <p className="text-sm">Return expired or damaged stock to factory for base price credit</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="factory-returns-table">
              <thead>
                <tr className="border-b-2 border-amber-200 bg-gradient-to-r from-amber-50 to-slate-50">
                  <th className="text-left p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Return #</th>
                  <th className="text-left p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Location</th>
                  <th className="text-center p-3 font-semibold text-amber-700 uppercase tracking-wider text-xs">Reason</th>
                  <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Items</th>
                  <th className="text-right p-3 font-semibold text-blue-700 uppercase tracking-wider text-xs">Base Price Credit</th>
                  <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Status</th>
                  <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {factoryReturns.map((fr) => (
                  <tr key={fr.id} className="border-b border-slate-100 hover:bg-amber-50/40 transition-colors" data-testid={`factory-return-row-${fr.id}`}>
                    <td className="p-3">
                      <span className="font-semibold text-amber-700">{fr.return_number}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(fr.return_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </td>
                    <td className="p-3 text-slate-700">{fr.distributor_location_name}</td>
                    <td className="p-3 text-center">
                      <Badge className={fr.reason === 'expired' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}>
                        {fr.reason === 'expired' ? 'Expired' : 'Damaged'}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center justify-center bg-slate-100 text-slate-700 text-sm font-medium px-2 py-0.5 rounded-full">
                        {fr.total_quantity || (fr.items || []).reduce((s, i) => s + i.quantity, 0)}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold text-blue-700">
                      ₹{(fr.total_credit_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-center">{getFactoryStatusBadge(fr.status)}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {fr.status === 'draft' && canManage && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleFactoryAction(fr.id, 'confirm')} data-testid={`confirm-factory-${fr.id}`}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteFactoryReturn(fr.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </>
                        )}
                        {fr.status === 'confirmed' && canManage && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleFactoryAction(fr.id, 'receive')} data-testid={`receive-factory-${fr.id}`}>
                              Received
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleFactoryAction(fr.id, 'cancel')}>
                              <X className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </>
                        )}
                        {(fr.status === 'received' || fr.status === 'cancelled') && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      </CollapsibleContent>
    </Card>
    </Collapsible>
    </div>
  );
}
