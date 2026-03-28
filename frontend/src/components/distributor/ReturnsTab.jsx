import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import {
  RotateCcw, Plus, Download, RefreshCw, Search, Calendar, Trash2,
  Check, X, Package, Truck, ShieldCheck, Eye, FileText, DollarSign
} from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Category colors
const CATEGORY_COLORS = {
  empty_reusable: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Empty/Reusable' },
  expired: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Expired' },
  damaged: { bg: 'bg-red-100', text: 'text-red-700', label: 'Damaged' },
  promotional: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Promotional' }
};

// Status badges
const STATUS_BADGES = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Draft' },
  approved: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Approved' },
  processed: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Processed' },
  settled: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Settled' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' }
};

export default function ReturnsTab({ distributorId, accounts = [], skus = [], canManage = false }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [returns, setReturns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [returnReasons, setReturnReasons] = useState([]);
  const [accountSkus, setAccountSkus] = useState([]); // SKUs with pricing for selected account
  const [loadingAccountSkus, setLoadingAccountSkus] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Create form
  const [createForm, setCreateForm] = useState({
    account_id: '',
    return_date: new Date().toISOString().split('T')[0],
    items: [],
    notes: ''
  });
  
  // Item form for adding items
  const [itemForm, setItemForm] = useState({
    sku_id: '',
    quantity: 1,
    reason_id: '',
    unit_price: ''
  });

  // Fetch returns
  const fetchReturns = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (accountFilter) params.append('account_id', accountFilter);
      
      const response = await axios.get(
        `${API_URL}/api/distributors/${distributorId}/returns?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReturns(response.data.returns || []);
      setSummary(response.data.summary || null);
    } catch (error) {
      console.error('Failed to fetch returns:', error);
      toast.error('Failed to load returns');
    } finally {
      setLoading(false);
    }
  }, [distributorId, token, statusFilter, accountFilter]);

  // Fetch return reasons
  const fetchReturnReasons = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/return-reasons?is_active=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReturnReasons(response.data.reasons || []);
    } catch (error) {
      console.error('Failed to fetch return reasons:', error);
    }
  }, [token]);

  // Fetch account SKU pricing when account is selected
  const fetchAccountSkus = useCallback(async (accountId) => {
    if (!accountId) {
      setAccountSkus([]);
      return;
    }
    
    // First check if the account has sku_pricing in the passed accounts array
    const selectedAccount = accounts.find(a => a.id === accountId);
    if (selectedAccount?.sku_pricing?.length > 0) {
      // Use the sku_pricing already in the account (from assigned-accounts endpoint)
      const enrichedSkus = selectedAccount.sku_pricing.map(sku => ({
        sku_id: sku.id,
        sku_name: sku.name,
        selling_price: sku.price_per_unit || 0,
        return_credit_per_unit: sku.return_bottle_credit || 0
      }));
      setAccountSkus(enrichedSkus);
      return;
    }
    
    // Fallback: try API endpoint
    try {
      setLoadingAccountSkus(true);
      const response = await axios.get(
        `${API_URL}/api/accounts/${accountId}/sku-pricing`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const skuPricing = response.data.sku_pricing || response.data || [];
      setAccountSkus(skuPricing);
    } catch (error) {
      console.error('Failed to fetch account SKU pricing:', error);
      // Final fallback: show all master SKUs
      setAccountSkus(skus.map(s => ({ 
        sku_id: s.id, 
        sku_name: s.name || s.sku_code,
        selling_price: s.mrp || 0
      })));
    } finally {
      setLoadingAccountSkus(false);
    }
  }, [token, skus, accounts]);

  useEffect(() => {
    fetchReturns();
    fetchReturnReasons();
  }, [fetchReturns, fetchReturnReasons]);

  // Fetch account SKUs when account changes in create form
  useEffect(() => {
    if (createForm.account_id) {
      fetchAccountSkus(createForm.account_id);
    } else {
      setAccountSkus([]);
    }
  }, [createForm.account_id, fetchAccountSkus]);

  // Add item to form
  const addItemToForm = () => {
    if (!itemForm.sku_id || !itemForm.reason_id || itemForm.quantity < 1) {
      toast.error('Please fill in SKU, quantity, and reason');
      return;
    }
    
    // Find SKU from account SKUs or fallback to master SKUs
    const accountSku = accountSkus.find(s => s.sku_id === itemForm.sku_id || s.id === itemForm.sku_id);
    const masterSku = skus.find(s => s.id === itemForm.sku_id);
    const sku = accountSku || masterSku;
    const reason = returnReasons.find(r => r.id === itemForm.reason_id);
    
    const newItem = {
      ...itemForm,
      sku_name: sku?.sku_name || sku?.name || sku?.sku_code || 'Unknown SKU',
      unit_price: itemForm.unit_price || accountSku?.selling_price || masterSku?.mrp || 0,
      return_credit_per_unit: accountSku?.return_credit_per_unit || 0,
      reason_name: reason?.reason_name || 'Unknown Reason',
      reason_category: reason?.category || 'other',
      credit_type: reason?.credit_type || 'no_credit'
    };
    
    // Calculate estimated credit for preview
    const qty = itemForm.quantity || 1;
    const creditType = reason?.credit_type || 'no_credit';
    let estimatedCredit = 0;
    if (creditType === 'sku_return_credit') {
      estimatedCredit = qty * (accountSku?.return_credit_per_unit || 0);
    } else if (creditType === 'full_price') {
      estimatedCredit = qty * (itemForm.unit_price || accountSku?.selling_price || 0);
    } else if (creditType === 'percentage' && reason?.credit_percentage) {
      estimatedCredit = qty * (itemForm.unit_price || accountSku?.selling_price || 0) * (reason.credit_percentage / 100);
    }
    newItem.estimated_credit = estimatedCredit;
    
    setCreateForm(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
    
    // Reset item form
    setItemForm({ sku_id: '', quantity: 1, reason_id: '', unit_price: '' });
  };

  // Remove item from form
  const removeItemFromForm = (index) => {
    setCreateForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Create return
  const createReturn = async () => {
    if (!createForm.account_id) {
      toast.error('Please select an account');
      return;
    }
    if (createForm.items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }
    
    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/api/distributors/${distributorId}/returns`,
        {
          account_id: createForm.account_id,
          return_date: createForm.return_date,
          items: createForm.items.map(item => ({
            sku_id: item.sku_id,
            quantity: item.quantity,
            reason_id: item.reason_id,
            unit_price: item.unit_price ? parseFloat(item.unit_price) : null
          })),
          notes: createForm.notes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Return created successfully');
      setShowCreateDialog(false);
      resetCreateForm();
      fetchReturns();
    } catch (error) {
      console.error('Failed to create return:', error);
      toast.error(error.response?.data?.detail || 'Failed to create return');
    } finally {
      setSaving(false);
    }
  };

  // Reset create form
  const resetCreateForm = () => {
    setCreateForm({
      account_id: '',
      return_date: new Date().toISOString().split('T')[0],
      items: [],
      notes: ''
    });
    setItemForm({ sku_id: '', quantity: 1, reason_id: '', unit_price: '' });
  };

  // Approve return
  const approveReturn = async (returnId) => {
    try {
      await axios.post(
        `${API_URL}/api/distributors/${distributorId}/returns/${returnId}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Return approved');
      fetchReturns();
      if (selectedReturn?.id === returnId) {
        viewReturnDetail(returnId);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve return');
    }
  };

  // Cancel return
  const cancelReturn = async (returnId) => {
    if (!window.confirm('Are you sure you want to cancel this return?')) return;
    try {
      await axios.post(
        `${API_URL}/api/distributors/${distributorId}/returns/${returnId}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Return cancelled');
      fetchReturns();
      setShowDetailDialog(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to cancel return');
    }
  };

  // Delete return
  const deleteReturn = async (returnId) => {
    if (!window.confirm('Are you sure you want to delete this draft return?')) return;
    try {
      await axios.delete(
        `${API_URL}/api/distributors/${distributorId}/returns/${returnId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Return deleted');
      fetchReturns();
      setShowDetailDialog(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete return');
    }
  };

  // View return detail
  const viewReturnDetail = async (returnId) => {
    try {
      const response = await axios.get(
        `${API_URL}/api/distributors/${distributorId}/returns/${returnId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSelectedReturn(response.data);
      setShowDetailDialog(true);
    } catch (error) {
      toast.error('Failed to load return details');
    }
  };

  // Filter returns
  const filteredReturns = returns.filter(ret => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!ret.return_number?.toLowerCase().includes(q) && 
          !ret.account_name?.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  // Download Excel
  const downloadExcel = () => {
    const excelData = filteredReturns.flatMap(ret => 
      (ret.items || []).map(item => ({
        'Return #': ret.return_number,
        'Date': ret.return_date,
        'Account': ret.account_name,
        'Status': ret.status,
        'SKU': item.sku_name || item.sku_code,
        'Quantity': item.quantity,
        'Reason': item.reason_name,
        'Category': CATEGORY_COLORS[item.reason_category]?.label || item.reason_category,
        'Credit Type': item.credit_type,
        'Credit/Unit': item.credit_per_unit,
        'Total Credit': item.total_credit,
        'Return to Factory': item.return_to_factory ? 'Yes' : 'No',
        'Returned to Factory': item.returned_to_factory ? 'Yes' : 'No'
      }))
    );
    
    if (excelData.length === 0) {
      toast.error('No data to download');
      return;
    }
    
    const headers = Object.keys(excelData[0]);
    const csvContent = [
      headers.join(','),
      ...excelData.map(row => 
        headers.map(h => {
          const v = row[h];
          return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer_returns_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded successfully');
  };

  return (
    <Card data-testid="returns-tab">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Customer Returns
            </CardTitle>
            <CardDescription>
              Track returns from customers and calculate credits
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadExcel} disabled={filteredReturns.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="create-return-btn">
                <Plus className="h-4 w-4 mr-2" />
                New Return
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
              <p className="text-sm text-emerald-600 font-medium">Total Returns</p>
              <p className="text-2xl font-bold text-emerald-700">{returns.length}</p>
            </div>
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
              <p className="text-sm text-blue-600 font-medium">Total Quantity</p>
              <p className="text-2xl font-bold text-blue-700">{summary.total_quantity || 0}</p>
            </div>
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-sm text-amber-600 font-medium">Total Credit</p>
              <p className="text-2xl font-bold text-amber-700">₹{(summary.total_credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
              <p className="text-sm text-purple-600 font-medium">Pending Factory Return</p>
              <p className="text-2xl font-bold text-purple-700">
                {summary.by_category?.reduce((sum, c) => sum + (c.pending_factory_return || 0), 0) || 0}
              </p>
            </div>
          </div>
        )}

        {/* Category Summary */}
        {summary?.by_category?.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {summary.by_category.map(cat => {
              const catInfo = CATEGORY_COLORS[cat.category] || { bg: 'bg-slate-100', text: 'text-slate-700', label: cat.category };
              return (
                <div key={cat.category} className={`p-3 rounded-lg ${catInfo.bg} border`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${catInfo.text}`}>{catInfo.label}</span>
                    <Badge variant="outline" className="text-xs">{cat.total_quantity}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Factory: {cat.completed_factory_return || 0}/{cat.total_quantity}</span>
                    <span>Pending: {cat.pending_factory_return || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by return # or account..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="settled">Settled</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={accountFilter || "all"} onValueChange={(v) => setAccountFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {accounts.map(acc => (
                <SelectItem key={acc.id} value={acc.id}>{acc.account_name || acc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={fetchReturns}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Returns Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredReturns.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No Returns Found</p>
            <p className="text-sm">Create a new return to track customer returns.</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium">Return #</th>
                  <th className="text-left p-4 font-medium">Account</th>
                  <th className="text-left p-4 font-medium">Date</th>
                  <th className="text-center p-4 font-medium">Items</th>
                  <th className="text-right p-4 font-medium">Credit</th>
                  <th className="text-center p-4 font-medium">Factory Return</th>
                  <th className="text-center p-4 font-medium">Status</th>
                  <th className="text-center p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReturns.map((ret) => {
                  const statusInfo = STATUS_BADGES[ret.status] || STATUS_BADGES.draft;
                  return (
                    <tr key={ret.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => viewReturnDetail(ret.id)}>
                      <td className="p-4">
                        <span className="font-medium text-primary">{ret.return_number}</span>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium">{ret.account_name}</p>
                          <p className="text-xs text-muted-foreground">{ret.account_city}</p>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(ret.return_date).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-center">
                        <Badge variant="outline">{ret.total_quantity}</Badge>
                      </td>
                      <td className="p-4 text-right font-medium text-emerald-600">
                        ₹{(ret.total_credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-emerald-600">{ret.factory_return_completed || 0}</span>
                          <span>/</span>
                          <span>{(ret.factory_return_pending || 0) + (ret.factory_return_completed || 0)}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <Badge className={`${statusInfo.bg} ${statusInfo.text}`}>{statusInfo.label}</Badge>
                      </td>
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => viewReturnDetail(ret.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {canManage && ret.status === 'draft' && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteReturn(ret.id)}>
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
        )}
      </CardContent>

      {/* Create Return Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Customer Return</DialogTitle>
            <DialogDescription>
              Record items returned by a customer
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Account Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account *</Label>
                <Select value={createForm.account_id} onValueChange={(v) => setCreateForm(prev => ({ ...prev, account_id: v }))}>
                  <SelectTrigger data-testid="return-account-select">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.account_name || acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Return Date</Label>
                <Input
                  type="date"
                  value={createForm.return_date}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, return_date: e.target.value }))}
                />
              </div>
            </div>

            {/* Add Item Form */}
            <div className="p-4 rounded-lg bg-muted/30 border space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">Add Return Items</p>
                {!createForm.account_id && (
                  <p className="text-xs text-amber-600">Select an account first to see available SKUs</p>
                )}
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">SKU</Label>
                  <Select 
                    value={itemForm.sku_id} 
                    onValueChange={(v) => setItemForm(prev => ({ ...prev, sku_id: v }))}
                    disabled={!createForm.account_id || loadingAccountSkus}
                  >
                    <SelectTrigger className="h-9" data-testid="return-sku-select">
                      <SelectValue placeholder={loadingAccountSkus ? "Loading SKUs..." : (createForm.account_id ? "Select SKU" : "Select account first")} />
                    </SelectTrigger>
                    <SelectContent>
                      {accountSkus.length > 0 ? (
                        accountSkus.map(sku => (
                          <SelectItem key={sku.sku_id || sku.id} value={sku.sku_id || sku.id}>
                            <div className="flex items-center justify-between w-full">
                              <span>{sku.sku_name || sku.name || sku.sku_code}</span>
                              {sku.selling_price && (
                                <span className="text-xs text-muted-foreground ml-2">₹{sku.selling_price}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        skus.map(sku => (
                          <SelectItem key={sku.id} value={sku.id}>{sku.name || sku.sku_code}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={itemForm.quantity}
                    onChange={(e) => setItemForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Return Reason</Label>
                  <Select value={itemForm.reason_id} onValueChange={(v) => setItemForm(prev => ({ ...prev, reason_id: v }))}>
                    <SelectTrigger className="h-9" data-testid="return-reason-select">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {returnReasons.map(reason => (
                        <SelectItem key={reason.id} value={reason.id}>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: reason.color || '#6B7280' }} />
                            {reason.reason_name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="button" size="sm" onClick={addItemToForm} className="h-9 w-full" data-testid="add-return-item-btn">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {/* Items List */}
            {createForm.items.length > 0 && (
              <div className="space-y-2">
                <Label>Return Items ({createForm.items.length})</Label>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">SKU</th>
                        <th className="text-center p-3 font-medium">Qty</th>
                        <th className="text-left p-3 font-medium">Reason</th>
                        <th className="text-center p-3 font-medium">Category</th>
                        <th className="text-right p-3 font-medium">Est. Credit</th>
                        <th className="text-center p-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {createForm.items.map((item, idx) => {
                        const catInfo = CATEGORY_COLORS[item.reason_category] || CATEGORY_COLORS.promotional;
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-3 font-medium">
                              <div>
                                {item.sku_name}
                                {item.credit_type === 'sku_return_credit' && item.return_credit_per_unit > 0 && (
                                  <p className="text-xs text-emerald-600">Bottle credit: ₹{item.return_credit_per_unit}/unit</p>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-center">{item.quantity}</td>
                            <td className="p-3">{item.reason_name}</td>
                            <td className="p-3 text-center">
                              <Badge className={`${catInfo.bg} ${catInfo.text}`}>{catInfo.label}</Badge>
                            </td>
                            <td className="p-3 text-right font-medium text-emerald-600">
                              ₹{(item.estimated_credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 text-center">
                              <Button variant="ghost" size="sm" className="text-destructive h-7 w-7 p-0" onClick={() => removeItemFromForm(idx)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/30">
                      <tr>
                        <td className="p-3 font-bold" colSpan={4}>Total Estimated Credit</td>
                        <td className="p-3 text-right font-bold text-emerald-600">
                          ₹{createForm.items.reduce((sum, item) => sum + (item.estimated_credit || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={createForm.notes}
                onChange={(e) => setCreateForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes about this return..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetCreateForm(); }}>
              Cancel
            </Button>
            <Button onClick={createReturn} disabled={saving || !createForm.account_id || createForm.items.length === 0}>
              {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Create Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedReturn && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="flex items-center gap-2">
                      {selectedReturn.return_number}
                      <Badge className={`${STATUS_BADGES[selectedReturn.status]?.bg} ${STATUS_BADGES[selectedReturn.status]?.text}`}>
                        {STATUS_BADGES[selectedReturn.status]?.label}
                      </Badge>
                    </DialogTitle>
                    <DialogDescription>
                      {selectedReturn.account_name} • {new Date(selectedReturn.return_date).toLocaleDateString()}
                    </DialogDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-emerald-600">
                      ₹{(selectedReturn.total_credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Credit</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted/30">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Items</p>
                    <p className="text-lg font-bold">{selectedReturn.total_quantity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Factory Return</p>
                    <p className="text-lg font-bold">
                      {selectedReturn.factory_return_completed || 0}/{(selectedReturn.factory_return_pending || 0) + (selectedReturn.factory_return_completed || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Received By</p>
                    <p className="text-lg font-bold">{selectedReturn.received_by || '-'}</p>
                  </div>
                </div>

                {/* Items Table */}
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">SKU</th>
                        <th className="text-center p-3 font-medium">Qty</th>
                        <th className="text-left p-3 font-medium">Reason</th>
                        <th className="text-right p-3 font-medium">Credit/Unit</th>
                        <th className="text-right p-3 font-medium">Total Credit</th>
                        <th className="text-center p-3 font-medium">Factory</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedReturn.items || []).map((item, idx) => {
                        const catInfo = CATEGORY_COLORS[item.reason_category] || CATEGORY_COLORS.promotional;
                        return (
                          <tr key={item.id || idx} className="border-t">
                            <td className="p-3">
                              <p className="font-medium">{item.sku_name || item.sku_code}</p>
                              <p className="text-xs text-muted-foreground">HSN: {item.hsn_code || '-'}</p>
                            </td>
                            <td className="p-3 text-center font-medium">{item.quantity}</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[item.reason_category]?.text.replace('text-', '') || '#6B7280' }} />
                                <div>
                                  <p className="font-medium">{item.reason_name}</p>
                                  <p className="text-xs text-muted-foreground">{item.credit_type}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-right">₹{(item.credit_per_unit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-3 text-right font-medium text-emerald-600">₹{(item.total_credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-3 text-center">
                              {item.return_to_factory ? (
                                item.returned_to_factory ? (
                                  <Badge className="bg-emerald-100 text-emerald-700">
                                    <Check className="h-3 w-3 mr-1" />
                                    Returned
                                  </Badge>
                                ) : (
                                  <Badge className="bg-amber-100 text-amber-700">
                                    <Truck className="h-3 w-3 mr-1" />
                                    Pending
                                  </Badge>
                                )
                              ) : (
                                <Badge variant="outline">N/A</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/30">
                      <tr>
                        <td className="p-3 font-bold" colSpan={2}>Total</td>
                        <td className="p-3"></td>
                        <td className="p-3"></td>
                        <td className="p-3 text-right font-bold text-emerald-600">
                          ₹{(selectedReturn.total_credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Notes */}
                {selectedReturn.notes && (
                  <div className="p-4 rounded-lg bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{selectedReturn.notes}</p>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" onClick={() => setShowDetailDialog(false)}>
                  Close
                </Button>
                {canManage && selectedReturn.status === 'draft' && (
                  <>
                    <Button variant="outline" className="text-destructive" onClick={() => cancelReturn(selectedReturn.id)}>
                      <X className="h-4 w-4 mr-2" />
                      Cancel Return
                    </Button>
                    <Button onClick={() => approveReturn(selectedReturn.id)}>
                      <Check className="h-4 w-4 mr-2" />
                      Approve Return
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
