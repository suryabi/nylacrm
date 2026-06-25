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
  Check, X, Package, Truck, ShieldCheck, Eye, FileText, DollarSign, CreditCard,
  Send, Clock, ExternalLink, Building2, PackageCheck, PackageX, ArrowDownCircle, ArrowUpCircle
} from 'lucide-react';
import axios from 'axios';
import PayCustomerDialog from './PayCustomerDialog';

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
  approved: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Credit Note Created' },
  direct_payment_approved: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', label: 'Direct Payment Approved' },
  credit_issued: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Credit Issued' },
  processed: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Processed' },
  settled: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Settled' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' }
};

export default function ReturnsTab({ distributorId, accounts = [], skus = [], canManage = false, canDelete = false }) {
  const { token, user } = useAuth();
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
  // Tracks which return is mid-retry for the Zoho-push action
  const [retryingZohoPush, setRetryingZohoPush] = useState(null);

  // Pay Customer / Issue Credit dialog — primary action from the Returns grid.
  // Single state-aware dialog handles submit / approve / mark-issued in one screen.
  const [payCustomerOpen, setPayCustomerOpen] = useState(false);
  const [payCustomerReturn, setPayCustomerReturn] = useState(null);

  const openPayCustomer = (ret) => {
    setPayCustomerReturn(ret);
    setPayCustomerOpen(true);
  };
  
  // Create form
  const [createForm, setCreateForm] = useState({
    account_id: '',
    return_type: 'returned',
    return_date: new Date().toISOString().split('T')[0],
    items: [],
    notes: ''
  });

  // Searchable account picker state — mirrors the Stock Out Record Delivery
  // experience so users get the same typeahead + selected-card UI everywhere.
  const [returnAccountSearch, setReturnAccountSearch] = useState('');
  const selectedReturnAccount = accounts.find(a => a.id === createForm.account_id) || null;
  
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

  // Fetch return reasons for the active flow (credit = returned, debit = missing)
  const fetchReturnReasons = useCallback(async (noteType = 'credit') => {
    try {
      const response = await axios.get(`${API_URL}/api/return-reasons?is_active=true&applies_to=customer&note_type=${noteType}`, {
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
    fetchReturnReasons('credit');
  }, [fetchReturns, fetchReturnReasons]);

  // Re-fetch reasons for the selected flow whenever the choice changes.
  useEffect(() => {
    if (showCreateDialog) {
      fetchReturnReasons(createForm.return_type === 'missing' ? 'debit' : 'credit');
    }
  }, [createForm.return_type, showCreateDialog, fetchReturnReasons]);

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
          return_type: createForm.return_type,
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
      return_type: 'returned',
      return_date: new Date().toISOString().split('T')[0],
      items: [],
      notes: ''
    });
    setItemForm({ sku_id: '', quantity: 1, reason_id: '', unit_price: '' });
  };

  // Approve return — close the Detail dialog and refresh the grid; user
  // doesn't need to see the approved state in the same dialog they just acted in.
  const approveReturn = async (returnId) => {
    try {
      await axios.post(
        `${API_URL}/api/distributors/${distributorId}/returns/${returnId}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Return approved');
      setShowDetailDialog(false);
      fetchReturns();
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
    if (!window.confirm('Are you sure you want to delete this return? This action cannot be undone.')) return;
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

  // Retry pushing a previously-failed credit note to Zoho. Useful after the
  // admin re-connects Zoho with the correct OAuth scopes / fixes SKU mappings.
  const handleRetryZohoPush = async (ret) => {
    if (!ret) return;
    // Look up the local credit_note id for this return
    setRetryingZohoPush(ret.id);
    try {
      const cnRes = await axios.get(
        `${API_URL}/api/distributors/${distributorId}/credit-notes`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { account_id: ret.account_id }
        }
      );
      const cn = (cnRes.data?.credit_notes || []).find(c => c.return_id === ret.id);
      if (!cn) {
        toast.error('No local credit note found for this return');
        return;
      }
      const resp = await axios.post(
        `${API_URL}/api/distributors/${distributorId}/credit-notes/${cn.id}/retry-zoho-push`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resp.data?.zoho_creditnote_url) {
        toast.success(`Pushed to Zoho as ${resp.data.zoho_creditnote_number || 'credit note'}`);
        // Re-fetch the return so the dialog shows the new link
        await viewReturnDetail(ret.id);
        fetchReturns();
      } else if (resp.data?.already_synced) {
        toast.info('Already synced to Zoho — refreshing view');
        await viewReturnDetail(ret.id);
      } else {
        toast.error('Push completed but no Zoho URL returned');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Zoho push failed');
    } finally {
      setRetryingZohoPush(null);
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
            <div
              className="mt-2 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-2.5 py-1 text-[11px] text-slate-600"
              data-testid="units-banner"
            >
              <Package className="h-3 w-3 text-slate-400" />
              <span>
                Quantities in <span className="font-semibold text-slate-700">crates</span>
                <span className="text-slate-400"> — except </span>
                <span className="font-semibold text-emerald-700">Empty Bottles</span>
                <span className="text-slate-400"> (raw bottles)</span>
              </span>
            </div>
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
              <SelectItem value="approved">Credit Note Created</SelectItem>
              <SelectItem value="direct_payment_approved">Direct Payment Approved</SelectItem>
              <SelectItem value="credit_issued">Credit Issued</SelectItem>
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
                  <th className="text-center p-4 font-medium">Credit / Debit Note</th>
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
                        {(() => {
                          const isMissing = ret.return_type === 'missing';
                          const noteNum = isMissing ? ret.debit_note_number : ret.credit_note_number;
                          if (noteNum) {
                            return (
                              <div className="flex items-center justify-center gap-1.5" data-testid={`note-badge-${ret.id}`}>
                                <Badge variant="outline" className={isMissing ? 'text-amber-700 border-amber-300 bg-amber-50' : 'text-emerald-600 border-emerald-300 bg-emerald-50'}>
                                  {noteNum}
                                </Badge>
                                {!isMissing && ret.zoho_creditnote_url && (
                                  <a
                                    href={ret.zoho_creditnote_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center text-emerald-700 hover:text-emerald-900 transition-colors"
                                    title={`View / download in Zoho Books (${ret.zoho_creditnote_number || ret.credit_note_number})`}
                                    data-testid={`view-zoho-creditnote-${ret.id}`}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                )}
                              </div>
                            );
                          }
                          return ret.status === 'approved'
                            ? <span className="text-xs text-amber-600">Pending</span>
                            : <span className="text-muted-foreground">-</span>;
                        })()}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-emerald-600">{ret.factory_return_completed || 0}</span>
                          <span>/</span>
                          <span>{(ret.factory_return_pending || 0) + (ret.factory_return_completed || 0)}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <Badge className={`${statusInfo.bg} ${statusInfo.text} font-semibold whitespace-nowrap border ${statusInfo.border || 'border-transparent'}`}>{statusInfo.label}</Badge>
                      </td>
                      <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {(() => {
                            // Primary action: pay customer / issue credit. Visible
                            // for any return that has a credit note with balance OR
                            // an issuance currently in flight. Single button label
                            // is state-aware so the user always knows the next step.
                            if (!ret.credit_note_id) return null;
                            const ai = ret.active_issuance;
                            const userRole = (user?.role || '').toLowerCase();
                            const isApprover = ['ceo', 'system admin', 'admin'].includes(userRole);
                            let label, Icon, cls;
                            if (!ai) {
                              if (ret.status !== 'approved') return null;
                              label = 'Pay Customer';
                              Icon = CreditCard;
                              cls = 'bg-emerald-600 hover:bg-emerald-700 text-white';
                            } else if (ai.status === 'pending_approval') {
                              label = isApprover ? 'Approve' : 'Pending';
                              Icon = Clock;
                              cls = isApprover ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200';
                            } else if (ai.status === 'approved') {
                              label = 'Mark Issued';
                              Icon = Send;
                              cls = 'bg-blue-600 hover:bg-blue-700 text-white';
                            } else { return null; }
                            return (
                              <Button size="sm" className={`h-8 text-xs ${cls}`}
                                onClick={() => openPayCustomer(ret)}
                                data-testid={`pay-customer-${ret.id}`}>
                                <Icon className="h-3.5 w-3.5 mr-1" />
                                {label}
                              </Button>
                            );
                          })()}
                          <Button variant="ghost" size="sm" onClick={() => viewReturnDetail(ret.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(canDelete || (canManage && ret.status === 'draft')) && (
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteReturn(ret.id)} data-testid={`delete-return-${ret.id}`} title="Delete">
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
            <DialogTitle>Track Customer Return</DialogTitle>
            <DialogDescription>
              Track bottles returned or missing from a customer
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* What are you tracking? — drives credit vs debit note */}
            <div>
              <Label className="mb-2 block">What are you tracking? <span className="text-red-500">*</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCreateForm(prev => ({ ...prev, return_type: 'returned', items: (prev.items || []).map(it => ({ ...it, reason_id: '', reason_name: '' })) }))}
                  data-testid="return-type-returned"
                  className={`text-left rounded-xl border-2 p-3.5 transition-all ${createForm.return_type === 'returned' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : 'border-slate-200 bg-white hover:border-emerald-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${createForm.return_type === 'returned' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                      <PackageCheck className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 leading-tight">Returned bottles from customer</p>
                      <p className="text-[11px] text-slate-500 leading-tight">Bottles physically returned</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5 rounded-md bg-emerald-100/70 px-2 py-1 text-[11px] font-medium text-emerald-800">
                    <ArrowDownCircle className="h-3.5 w-3.5" /> System will create a <b>Credit Note</b>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCreateForm(prev => ({ ...prev, return_type: 'missing', items: (prev.items || []).map(it => ({ ...it, reason_id: '', reason_name: '' })) }))}
                  data-testid="return-type-missing"
                  className={`text-left rounded-xl border-2 p-3.5 transition-all ${createForm.return_type === 'missing' ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200' : 'border-slate-200 bg-white hover:border-amber-300'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${createForm.return_type === 'missing' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
                      <PackageX className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 leading-tight">Missing bottles from customer</p>
                      <p className="text-[11px] text-slate-500 leading-tight">Bottles not returned / lost</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-1.5 rounded-md bg-amber-100/70 px-2 py-1 text-[11px] font-medium text-amber-800">
                    <ArrowUpCircle className="h-3.5 w-3.5" /> System will generate a <b>Debit Note</b>
                  </div>
                </button>
              </div>
            </div>

            {/* Account Selection — searchable picker (same UX as Stock Out) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account *</Label>
                {selectedReturnAccount ? (
                  <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3" data-testid="return-account-selected">
                    <Building2 className="h-4 w-4 text-blue-700 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 truncate">{selectedReturnAccount.account_name || selectedReturnAccount.name}</p>
                        <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-wider text-blue-700 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded">
                          Selected
                        </span>
                      </div>
                      {(selectedReturnAccount.city || selectedReturnAccount.state) && (
                        <p className="text-xs text-slate-600 mt-0.5">
                          {selectedReturnAccount.city}{selectedReturnAccount.state ? `, ${selectedReturnAccount.state}` : ''}
                          {selectedReturnAccount.is_primary && <span className="text-amber-600 ml-1">★ Primary</span>}
                        </p>
                      )}
                      {selectedReturnAccount.contact_name && (
                        <p className="text-[11px] text-slate-500 mt-0.5">Contact: {selectedReturnAccount.contact_name}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-slate-500 hover:text-slate-700 h-7 w-7 p-0"
                      onClick={() => {
                        setCreateForm(prev => ({ ...prev, account_id: '' }));
                        setReturnAccountSearch('');
                      }}
                      data-testid="return-account-clear"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="Search accounts by name or city…"
                      value={returnAccountSearch}
                      onChange={(e) => setReturnAccountSearch(e.target.value)}
                      data-testid="return-account-search"
                      className="w-full"
                    />
                    <div className="border rounded-md max-h-[200px] overflow-y-auto">
                      {accounts.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No accounts available</p>
                        </div>
                      ) : (
                        accounts
                          .filter(account => {
                            if (!returnAccountSearch) return true;
                            const s = returnAccountSearch.toLowerCase();
                            return (
                              (account.account_name || account.name || '').toLowerCase().includes(s) ||
                              (account.city || '').toLowerCase().includes(s) ||
                              (account.contact_name || '').toLowerCase().includes(s) ||
                              (account.territory || '').toLowerCase().includes(s)
                            );
                          })
                          .map(account => (
                            <div
                              key={account.id}
                              className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0 transition-colors"
                              onClick={() => {
                                setCreateForm(prev => ({ ...prev, account_id: account.id }));
                                setReturnAccountSearch('');
                              }}
                              data-testid={`return-account-option-${account.id}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">
                                    {account.account_name || account.name}
                                    {account.is_primary && <span className="ml-2 text-amber-600">★ Primary</span>}
                                  </p>
                                  {(account.city || account.state) && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {account.city}{account.state ? `, ${account.state}` : ''}
                                      {account.territory && ` • ${account.territory}`}
                                    </p>
                                  )}
                                  {account.contact_name && (
                                    <p className="text-xs text-muted-foreground">Contact: {account.contact_name}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                      )}
                      {accounts.length > 0 && returnAccountSearch && accounts.filter(a => {
                        const s = returnAccountSearch.toLowerCase();
                        return (
                          (a.account_name || a.name || '').toLowerCase().includes(s) ||
                          (a.city || '').toLowerCase().includes(s) ||
                          (a.contact_name || '').toLowerCase().includes(s) ||
                          (a.territory || '').toLowerCase().includes(s)
                        );
                      }).length === 0 && (
                        <div className="p-3 text-xs text-muted-foreground text-center">No accounts match &quot;{returnAccountSearch}&quot;</div>
                      )}
                    </div>
                  </div>
                )}
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
                <p className="font-medium text-sm">{createForm.return_type === 'missing' ? 'Add Missing Items' : 'Add Returned Items'}</p>
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
                    onChange={(e) => {
                      const raw = e.target.value;
                      // Allow the field to be cleared while typing — backspace must
                      // work. We only coerce on blur (or when Add is clicked).
                      if (raw === '') {
                        setItemForm(prev => ({ ...prev, quantity: '' }));
                        return;
                      }
                      const n = parseInt(raw, 10);
                      setItemForm(prev => ({ ...prev, quantity: Number.isNaN(n) ? '' : n }));
                    }}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isFinite(n) || n < 1) {
                        setItemForm(prev => ({ ...prev, quantity: 1 }));
                      }
                    }}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{createForm.return_type === 'missing' ? 'Debit Reason' : 'Credit Reason'}</Label>
                  <Select value={itemForm.reason_id} onValueChange={(v) => setItemForm(prev => ({ ...prev, reason_id: v }))}>
                    <SelectTrigger className="h-9" data-testid="return-reason-select">
                      <SelectValue placeholder={createForm.return_type === 'missing' ? 'Select debit reason' : 'Select credit reason'} />
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
                <Label>{createForm.return_type === 'missing' ? 'Missing Items' : 'Returned Items'} ({createForm.items.length})</Label>
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
                placeholder={createForm.return_type === 'missing' ? 'Additional notes about these missing bottles...' : 'Additional notes about this return...'}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetCreateForm(); }}>
              Cancel
            </Button>
            <Button onClick={createReturn} disabled={saving || !createForm.account_id || createForm.items.length === 0} data-testid="submit-track-return-btn">
              {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              {createForm.return_type === 'missing' ? 'Track Missing (Debit Note)' : 'Track Return (Credit Note)'}
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

                {/* Credit Note Information */}
                {selectedReturn.credit_note_number && (
                  <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-emerald-600" />
                        <div>
                          <p className="text-sm font-medium text-emerald-700">Credit Note Issued</p>
                          <p className="text-xs text-emerald-600">{selectedReturn.credit_note_number}</p>
                          {selectedReturn.zoho_creditnote_number &&
                            selectedReturn.zoho_creditnote_number !== selectedReturn.credit_note_number && (
                              <p className="text-[11px] text-emerald-600 font-mono mt-0.5">
                                Zoho: {selectedReturn.zoho_creditnote_number}
                              </p>
                            )}
                        </div>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-700">
                        ₹{(selectedReturn.total_credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </Badge>
                    </div>
                    {selectedReturn.zoho_creditnote_url ? (
                      <div className="mt-3 pt-3 border-t border-emerald-200 flex items-center justify-between">
                        <span className="text-xs text-emerald-600">Synced to Zoho Books</span>
                        <a
                          href={selectedReturn.zoho_creditnote_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900 transition-colors"
                          data-testid="view-zoho-creditnote-detail-btn"
                        >
                          <ExternalLink className="h-4 w-4" />
                          View / download in Zoho
                        </a>
                      </div>
                    ) : (
                      // New flow: bottle-return CNs are no longer pushed to Zoho as
                      // separate documents. Instead, when the CN is applied to a
                      // delivery, the deduction is added as a post-tax
                      // "Sustainability Incentive" adjustment on the Zoho invoice.
                      // The local CN doc remains for settlement math & audit.
                      <div className="mt-3 pt-3 border-t border-emerald-200">
                        <p className="text-xs text-emerald-700 font-medium">
                          Tracked locally — appears as a “Sustainability Incentive”
                          deduction on the Zoho invoice when this CN is applied to a delivery.
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          No separate credit note is pushed to Zoho.
                        </p>
                      </div>
                    )}
                    {selectedReturn.credit_issued_to_delivery_number && (
                      <div className="mt-3 pt-3 border-t border-emerald-200 flex items-center justify-between">
                        <span className="text-xs text-emerald-600">Applied to Delivery:</span>
                        <span className="text-sm font-medium text-emerald-700">
                          {selectedReturn.credit_issued_to_delivery_number}
                        </span>
                      </div>
                    )}
                  </div>
                )}

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
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedReturn.items || []).map((item, idx) => {
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
                    <Button onClick={() => approveReturn(selectedReturn.id)} data-testid="create-credit-note-btn">
                      <Check className="h-4 w-4 mr-2" />
                      Create Credit Note
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <PayCustomerDialog
        open={payCustomerOpen}
        onOpenChange={setPayCustomerOpen}
        distributorId={distributorId}
        returnRecord={payCustomerReturn}
        onChanged={() => fetchReturns()}
      />
    </Card>
  );
}
