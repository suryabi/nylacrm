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
  ChevronDown, ChevronUp, Paperclip, Send, AlertTriangle
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

  // Credit issuance — inline expand/collapse panel inside Return Detail
  // (no nested dialogs). Issues the ENTIRE remaining credit balance in one go.
  const [issuancePanelOpen, setIssuancePanelOpen] = useState(false);
  const [issuanceCreditNote, setIssuanceCreditNote] = useState(null);
  const [issuances, setIssuances] = useState([]);
  const [loadingIssuances, setLoadingIssuances] = useState(false);
  const [issuanceForm, setIssuanceForm] = useState({
    showForm: false,
    reason: '',
    issuance_method: 'cash',
    reference: '',
    attachment_path: '',
    attachment_filename: '',
    uploading: false,
    submitting: false,
  });
  const [rejectingId, setRejectingId] = useState(null); // { id, reason }
  const [issuingId, setIssuingId] = useState(null);     // { id, issued_to, issuance_date }

  // Approve role (CEO / System Admin) — matches backend ISSUANCE_APPROVER_ROLES
  const userRole = (user?.role || '').toLowerCase();
  const canApproveIssuance = ['ceo', 'system admin', 'admin'].includes(userRole);

  const fetchIssuanceData = useCallback(async (creditNoteId) => {
    if (!creditNoteId) return;
    setLoadingIssuances(true);
    try {
      const [cnRes, issRes] = await Promise.all([
        axios.get(`${API_URL}/api/distributors/${distributorId}/credit-notes`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/api/distributors/${distributorId}/credit-notes/${creditNoteId}/issuances`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const list = cnRes.data.credit_notes || cnRes.data.items || [];
      setIssuanceCreditNote(list.find((c) => c.id === creditNoteId) || null);
      setIssuances(issRes.data.issuances || []);
    } catch (e) {
      toast.error('Failed to load issuance details');
    } finally {
      setLoadingIssuances(false);
    }
  }, [distributorId, token]);

  // Tracks if any issuance state-change happened in this dialog session, so
  // we know to refresh the parent Returns table when the dialog closes.
  const [issuanceDirty, setIssuanceDirty] = useState(false);

  const toggleIssuancePanel = useCallback(async () => {
    if (!selectedReturn?.credit_note_id) return;
    const next = !issuancePanelOpen;
    setIssuancePanelOpen(next);
    if (next) {
      await fetchIssuanceData(selectedReturn.credit_note_id);
    } else {
      setIssuanceForm((f) => ({ ...f, showForm: false }));
      setRejectingId(null);
      setIssuingId(null);
    }
  }, [issuancePanelOpen, selectedReturn, fetchIssuanceData]);

  // Reset issuance panel state whenever the active return changes / dialog closes
  useEffect(() => {
    setIssuancePanelOpen(false);
    setIssuanceCreditNote(null);
    setIssuances([]);
    setIssuanceForm({
      showForm: false, reason: '', issuance_method: 'cash', reference: '',
      attachment_path: '', attachment_filename: '', uploading: false, submitting: false,
    });
    setRejectingId(null);
    setIssuingId(null);
  }, [selectedReturn?.id, showDetailDialog]);

  const issuanceBaseUrl = useCallback(() => {
    if (!selectedReturn?.credit_note_id) return null;
    return `${API_URL}/api/distributors/${distributorId}/credit-notes/${selectedReturn.credit_note_id}/issuances`;
  }, [selectedReturn, distributorId]);

  const handleIssuanceUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('File too large (max 10 MB)');
    const url = issuanceBaseUrl();
    if (!url) return;
    const data = new FormData();
    data.append('file', file);
    setIssuanceForm((f) => ({ ...f, uploading: true }));
    try {
      const r = await axios.post(`${url}/upload-attachment`, data, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      setIssuanceForm((f) => ({
        ...f, uploading: false,
        attachment_path: r.data.attachment_path,
        attachment_filename: r.data.attachment_filename,
      }));
      toast.success('Attachment uploaded');
    } catch (err) {
      setIssuanceForm((f) => ({ ...f, uploading: false }));
      toast.error(err.response?.data?.detail || 'Upload failed');
    }
  };

  const submitIssuance = async () => {
    const url = issuanceBaseUrl();
    if (!url) return;
    if (!issuanceForm.reason.trim()) return toast.error('Reason is required');
    setIssuanceForm((f) => ({ ...f, submitting: true }));
    try {
      await axios.post(url, {
        reason: issuanceForm.reason.trim(),
        issuance_method: issuanceForm.issuance_method,
        reference: issuanceForm.reference || null,
        attachment_path: issuanceForm.attachment_path || null,
        attachment_filename: issuanceForm.attachment_filename || null,
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Credit issuance submitted for approval');
      setIssuanceForm({
        showForm: false, reason: '', issuance_method: 'cash', reference: '',
        attachment_path: '', attachment_filename: '', uploading: false, submitting: false,
      });
      setIssuanceDirty(true);
      await fetchIssuanceData(selectedReturn.credit_note_id);
    } catch (err) {
      setIssuanceForm((f) => ({ ...f, submitting: false }));
      toast.error(err.response?.data?.detail || 'Submission failed');
    }
  };

  const issuanceAction = async (issuanceId, action, body, successMsg) => {
    const url = issuanceBaseUrl();
    if (!url) return;
    try {
      await axios.post(`${url}/${issuanceId}/${action}`, body || {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(successMsg);
      setIssuanceDirty(true);
      await fetchIssuanceData(selectedReturn.credit_note_id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    }
  };

  const downloadIssuanceAttachment = (issuanceId, filename) => {
    const url = issuanceBaseUrl();
    if (!url) return;
    axios.get(`${url}/${issuanceId}/attachment`, {
      headers: { Authorization: `Bearer ${token}` }, responseType: 'blob',
    }).then((r) => {
      const objUrl = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = objUrl; a.download = filename || 'attachment'; a.click();
      URL.revokeObjectURL(objUrl);
    }).catch(() => toast.error('Failed to download attachment'));
  };
  
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
      const response = await axios.get(`${API_URL}/api/return-reasons?is_active=true&applies_to=customer`, {
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
                  <th className="text-center p-4 font-medium">Credit Note</th>
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
                        {ret.credit_note_number ? (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
                            {ret.credit_note_number}
                          </Badge>
                        ) : ret.status === 'approved' ? (
                          <span className="text-xs text-amber-600">Pending</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
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
      <Dialog open={showDetailDialog} onOpenChange={(open) => {
        setShowDetailDialog(open);
        // When closing after any issuance state change, refresh the parent
        // Returns list so the row's status badge (e.g. "Approved" → "Credit Issued")
        // reflects the new state without manual refresh.
        if (!open && issuanceDirty) {
          fetchReturns();
          setIssuanceDirty(false);
        }
      }}>
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
                        </div>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-700">
                        ₹{(selectedReturn.total_credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </Badge>
                    </div>
                    {selectedReturn.credit_issued_to_delivery_number && (
                      <div className="mt-3 pt-3 border-t border-emerald-200 flex items-center justify-between">
                        <span className="text-xs text-emerald-600">Applied to Delivery:</span>
                        <span className="text-sm font-medium text-emerald-700">
                          {selectedReturn.credit_issued_to_delivery_number}
                        </span>
                      </div>
                    )}
                    {/* Standalone credit issuance — expand inline (no nested dialog).
                       Issues the entire remaining balance in one go (no partials).
                       Hidden once the return is `credit_issued` (nothing left to issue). */}
                    {selectedReturn.credit_note_id && selectedReturn.status !== 'credit_issued' && selectedReturn.status !== 'settled' && (
                      <div className="mt-3 pt-3 border-t border-emerald-200">
                        <button
                          type="button"
                          onClick={toggleIssuancePanel}
                          className="w-full flex items-center justify-between gap-3 text-left hover:bg-emerald-100/60 -mx-1 px-2 py-1 rounded transition-colors"
                          data-testid="toggle-credit-issuance-panel"
                        >
                          <div>
                            <p className="text-sm font-medium text-emerald-800">Issue Credit to Customer</p>
                            <p className="text-[11px] text-emerald-700/80">
                              Hand over the full remaining balance to the customer outside a delivery — requires CEO / System Admin approval.
                            </p>
                          </div>
                          {issuancePanelOpen
                            ? <ChevronUp className="h-4 w-4 text-emerald-700 shrink-0" />
                            : <ChevronDown className="h-4 w-4 text-emerald-700 shrink-0" />}
                        </button>

                        {issuancePanelOpen && (
                          <div className="mt-3 space-y-3" data-testid="credit-issuance-panel">
                            {/* Balance line */}
                            <div className="flex items-center justify-between text-xs px-3 py-2 rounded bg-white border border-emerald-200">
                              <span className="text-emerald-700">Available balance to issue</span>
                              <span className="font-bold tabular-nums text-emerald-800" data-testid="issuance-balance">
                                ₹{(issuanceCreditNote?.balance_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>

                            {loadingIssuances ? (
                              <div className="flex items-center text-xs text-muted-foreground py-2">
                                <RefreshCw className="h-3 w-3 animate-spin mr-2" /> Loading…
                              </div>
                            ) : (
                              <>
                                {/* Issuance history */}
                                {issuances.length > 0 && (
                                  <div className="space-y-2" data-testid="issuance-history">
                                    {issuances.map((iss) => {
                                      const STATUS = {
                                        pending_approval: { label: 'Pending Approval', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
                                        approved: { label: 'Approved · Awaiting Issue', cls: 'bg-blue-100 text-blue-700 border-blue-300' },
                                        issued: { label: 'Issued to Customer', cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
                                        rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-700 border-rose-300' },
                                        cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
                                      };
                                      const sb = STATUS[iss.status] || STATUS.pending_approval;
                                      const isCreator = iss.created_by === user?.id;
                                      const isRejecting = rejectingId?.id === iss.id;
                                      const isMarking = issuingId?.id === iss.id;
                                      return (
                                        <div key={iss.id} className="rounded-md border bg-white p-3 space-y-2" data-testid={`issuance-row-${iss.id}`}>
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-sm tabular-nums">₹{(iss.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                <Badge variant="outline" className={`${sb.cls} text-[10px]`}>{sb.label}</Badge>
                                                <span className="text-[10px] text-muted-foreground capitalize">via {iss.issuance_method?.replace('_', ' ')}</span>
                                                {iss.reference && <span className="text-[10px] text-muted-foreground">· Ref: {iss.reference}</span>}
                                              </div>
                                              <p className="text-xs text-slate-700 mt-1">{iss.reason}</p>
                                              <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                                                <span>By {iss.created_by_name} on {new Date(iss.created_at).toLocaleDateString()}</span>
                                                {iss.approved_by_name && <span>· {iss.status === 'rejected' ? 'Rejected' : 'Approved'} by {iss.approved_by_name}</span>}
                                                {iss.issued_at && <span>· Issued {iss.issued_at}{iss.issued_to ? ` to ${iss.issued_to}` : ''}</span>}
                                              </div>
                                              {iss.rejection_reason && (
                                                <p className="text-[10px] text-rose-700 bg-rose-50 px-2 py-1 rounded mt-1">Rejection: {iss.rejection_reason}</p>
                                              )}
                                              {iss.attachment_filename && (
                                                <button onClick={() => downloadIssuanceAttachment(iss.id, iss.attachment_filename)} className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-1 mt-1" data-testid="download-attachment-btn">
                                                  <Paperclip className="h-3 w-3" /> {iss.attachment_filename}
                                                </button>
                                              )}
                                            </div>
                                            <div className="flex flex-row gap-1.5 shrink-0 self-start">
                                              {iss.status === 'pending_approval' && canApproveIssuance && !isRejecting && (
                                                <>
                                                  <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-[11px] px-2.5" onClick={() => issuanceAction(iss.id, 'approve', null, 'Issuance approved')} data-testid="approve-issuance-btn">
                                                    <Check className="h-3 w-3 mr-1" /> Approve
                                                  </Button>
                                                  <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5" onClick={() => setRejectingId({ id: iss.id, reason: '' })} data-testid="reject-issuance-btn">
                                                    <X className="h-3 w-3 mr-1" /> Reject
                                                  </Button>
                                                </>
                                              )}
                                              {iss.status === 'approved' && (canApproveIssuance || isCreator) && !isMarking && (
                                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-7 text-[11px] px-2.5" onClick={() => setIssuingId({ id: iss.id, issued_to: '', issuance_date: new Date().toISOString().split('T')[0] })} data-testid="mark-issued-btn">
                                                  <Send className="h-3 w-3 mr-1" /> Mark Issued
                                                </Button>
                                              )}
                                              {(iss.status === 'pending_approval' || iss.status === 'approved') && (canApproveIssuance || isCreator) && !isRejecting && !isMarking && (
                                                <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700" onClick={() => issuanceAction(iss.id, 'cancel', null, 'Issuance cancelled')} data-testid="cancel-issuance-btn">
                                                  <Trash2 className="h-3 w-3 mr-1" /> Cancel
                                                </Button>
                                              )}
                                            </div>
                                          </div>

                                          {/* Inline reject reason */}
                                          {isRejecting && (
                                            <div className="border rounded-md p-2 bg-rose-50 border-rose-200 space-y-2" data-testid="reject-form">
                                              <p className="text-[11px] font-semibold flex items-center gap-1.5 text-rose-700"><AlertTriangle className="h-3 w-3" /> Reason for rejection</p>
                                              <Textarea
                                                value={rejectingId.reason}
                                                onChange={(e) => setRejectingId({ ...rejectingId, reason: e.target.value })}
                                                rows={2} placeholder="Required" className="text-xs"
                                                data-testid="reject-reason-input"
                                              />
                                              <div className="flex justify-end gap-1.5">
                                                <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => setRejectingId(null)}>Cancel</Button>
                                                <Button size="sm" variant="destructive" className="h-6 text-[11px] px-2"
                                                  disabled={!rejectingId.reason.trim()}
                                                  onClick={async () => {
                                                    await issuanceAction(iss.id, 'reject', { rejection_reason: rejectingId.reason.trim() }, 'Issuance rejected');
                                                    setRejectingId(null);
                                                  }}
                                                  data-testid="confirm-reject-btn">Reject</Button>
                                              </div>
                                            </div>
                                          )}

                                          {/* Inline mark-issued */}
                                          {isMarking && (
                                            <div className="border rounded-md p-2 bg-emerald-50 border-emerald-200 space-y-2" data-testid="mark-issued-form">
                                              <p className="text-[11px] font-semibold flex items-center gap-1.5 text-emerald-700"><Send className="h-3 w-3" /> Record handover</p>
                                              <div className="grid grid-cols-2 gap-2">
                                                <Input className="h-7 text-xs" placeholder="Issued to (optional)" value={issuingId.issued_to} onChange={(e) => setIssuingId({ ...issuingId, issued_to: e.target.value })} data-testid="issued-to-input" />
                                                <Input type="date" className="h-7 text-xs" value={issuingId.issuance_date} onChange={(e) => setIssuingId({ ...issuingId, issuance_date: e.target.value })} data-testid="issuance-date-input" />
                                              </div>
                                              <div className="flex justify-end gap-1.5">
                                                <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => setIssuingId(null)}>Cancel</Button>
                                                <Button size="sm" className="h-6 text-[11px] px-2 bg-emerald-600 hover:bg-emerald-700"
                                                  onClick={async () => {
                                                    await issuanceAction(iss.id, 'mark-issued', {
                                                      issued_to: issuingId.issued_to || null,
                                                      issuance_date: issuingId.issuance_date || null,
                                                    }, 'Recorded as issued');
                                                    setIssuingId(null);
                                                  }}
                                                  data-testid="confirm-mark-issued-btn">Mark Issued</Button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* New issuance — only shown if no open request and balance available */}
                                {(() => {
                                  const hasOpen = issuances.some((i) => ['pending_approval', 'approved'].includes(i.status));
                                  const balance = issuanceCreditNote?.balance_amount || 0;
                                  if (hasOpen) {
                                    return (
                                      <p className="text-[11px] text-muted-foreground italic px-1" data-testid="issuance-blocked-note">
                                        A request is already in progress for this credit note. Resolve it before submitting another.
                                      </p>
                                    );
                                  }
                                  if (balance <= 0.001) {
                                    return (
                                      <p className="text-[11px] text-muted-foreground italic px-1" data-testid="no-balance-note">
                                        No balance remaining on this credit note.
                                      </p>
                                    );
                                  }
                                  if (!issuanceForm.showForm) {
                                    return (
                                      <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300 hover:bg-emerald-100 h-7 text-[11px]"
                                        onClick={() => setIssuanceForm((f) => ({ ...f, showForm: true }))}
                                        data-testid="new-issuance-btn">
                                        <Plus className="h-3 w-3 mr-1" /> New Issuance Request
                                      </Button>
                                    );
                                  }
                                  return (
                                    <div className="border rounded-md p-3 bg-white space-y-2" data-testid="issuance-form">
                                      <p className="text-xs font-semibold flex items-center gap-1.5">
                                        <Plus className="h-3 w-3" /> New Issuance Request — full balance ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </p>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <Label className="text-[11px]">Issuance Method<span className="text-rose-500">*</span></Label>
                                          <Select value={issuanceForm.issuance_method} onValueChange={(v) => setIssuanceForm({ ...issuanceForm, issuance_method: v })}>
                                            <SelectTrigger className="h-8 text-xs" data-testid="issuance-method-select"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="cash">Cash</SelectItem>
                                              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                              <SelectItem value="cheque">Cheque</SelectItem>
                                              <SelectItem value="store_credit">Store Credit</SelectItem>
                                              <SelectItem value="other">Other</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div>
                                          <Label className="text-[11px]">Reference (optional)</Label>
                                          <Input className="h-8 text-xs" placeholder="Cheque #, UTR, Slip ID…"
                                            value={issuanceForm.reference}
                                            onChange={(e) => setIssuanceForm({ ...issuanceForm, reference: e.target.value })}
                                            data-testid="issuance-reference-input" />
                                        </div>
                                      </div>
                                      <div>
                                        <Label className="text-[11px]">Reason<span className="text-rose-500">*</span></Label>
                                        <Textarea rows={2} className="text-xs"
                                          placeholder="Why is this credit being given to the customer outside a delivery?"
                                          value={issuanceForm.reason}
                                          onChange={(e) => setIssuanceForm({ ...issuanceForm, reason: e.target.value })}
                                          data-testid="issuance-reason-input" />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Label className="text-[11px]">Attachment (optional)</Label>
                                        <input id="issuance-file-input" type="file" className="hidden" onChange={handleIssuanceUpload} accept="image/*,.pdf" />
                                        <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                                          onClick={() => document.getElementById('issuance-file-input')?.click()}
                                          disabled={issuanceForm.uploading}
                                          data-testid="issuance-upload-btn">
                                          <Paperclip className="h-3 w-3 mr-1" />
                                          {issuanceForm.uploading ? 'Uploading…' : (issuanceForm.attachment_filename ? 'Replace' : 'Upload')}
                                        </Button>
                                        {issuanceForm.attachment_filename && (
                                          <span className="text-[11px] text-slate-600 truncate" title={issuanceForm.attachment_filename}>{issuanceForm.attachment_filename}</span>
                                        )}
                                      </div>
                                      <div className="flex justify-end gap-1.5">
                                        <Button size="sm" variant="outline" className="h-7 text-[11px]"
                                          onClick={() => setIssuanceForm({ ...issuanceForm, showForm: false, reason: '', reference: '', attachment_path: '', attachment_filename: '' })}
                                          disabled={issuanceForm.submitting}>Cancel</Button>
                                        <Button size="sm" className="h-7 text-[11px]"
                                          onClick={submitIssuance}
                                          disabled={issuanceForm.submitting}
                                          data-testid="submit-issuance-btn">
                                          {issuanceForm.submitting ? 'Submitting…' : 'Submit for Approval'}
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                        )}
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
                {canDelete && selectedReturn.status !== 'draft' && (
                  <Button variant="destructive" onClick={() => deleteReturn(selectedReturn.id)} data-testid="delete-return-detail-btn">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Return
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
