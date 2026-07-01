import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '../ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Checkbox } from '../ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Plus, Trash2, Truck, RefreshCw, Package, Calendar, FileText, Building2, X, Download, ChevronLeft, ChevronRight, Filter, CreditCard, Receipt, CheckCircle2, ChevronDown, AlertTriangle, AlertCircle, Factory, ExternalLink, Check, Pencil, RotateCcw, History } from 'lucide-react';
import PromoDispatchSection from './PromoDispatchSection';
import { groupByDateDesc } from '../../utils/dateGrouping';
import { Calendar as DatePicker } from '../ui/calendar';
import { toast } from 'sonner';

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

// Statuses whose figures are voided — excluded from totals & shown struck-through.
const VOIDED_DELIVERY_STATUSES = ['reversed', 'cancelled'];

// Sum the billing/margin columns across a list of deliveries. Mirrors the
// per-row math in the table so the grand total and per-date subtotals stay
// consistent. Reversed/cancelled deliveries are skipped — their numbers are
// voided and must not contribute to any total.
function sumDeliveries(list) {
  const t = { items: 0, billing: 0, credit: 0, netBilling: 0, margin: 0, billable: 0, netBillable: 0 };
  (list || []).forEach((delivery) => {
    if (VOIDED_DELIVERY_STATUSES.includes(delivery.status)) return;
    const items = delivery.items || [];
    const totalCreditApplied = delivery.total_credit_applied || 0;
    const customerBilling = items.reduce((sum, item) => {
      const qty = item.quantity || 0;
      const price = item.customer_selling_price || item.unit_price || 0;
      const disc = item.discount_percent || 0;
      return sum + qty * price * (1 - disc / 100);
    }, 0);
    const netCustomerBilling = Math.max(0, customerBilling - totalCreditApplied);
    const totalMarginAmount = items.reduce((sum, item) => {
      const qty = item.quantity || 0;
      const customerPrice = item.customer_selling_price || item.unit_price || 0;
      const commissionPct = item.distributor_commission_percent || item.margin_percent || 2.5;
      return sum + qty * customerPrice * (commissionPct / 100);
    }, 0);
    const totalActualBillable = items.reduce((sum, item) => {
      const qty = item.quantity || 0;
      const customerPrice = item.customer_selling_price || item.unit_price || 0;
      const commissionPct = item.distributor_commission_percent || item.margin_percent || 2.5;
      const newTransferPrice = customerPrice > 0 ? customerPrice * (1 - commissionPct / 100) : 0;
      return sum + qty * newTransferPrice;
    }, 0);
    t.items += items.length;
    t.billing += customerBilling;
    t.credit += totalCreditApplied;
    t.netBilling += netCustomerBilling;
    t.margin += totalMarginAmount;
    t.billable += totalActualBillable;
    t.netBillable += totalActualBillable - totalCreditApplied;
  });
  return t;
}

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
  deliveriesLocationFilter,
  setDeliveriesLocationFilter,
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
  onReverseDelivery,
  getDeliveryStatusBadge,
  // Excel download
  API_URL,
  token,
  // Phase 2 batch tracking — parent passes these. Empty / false when source
  // distributor warehouse doesn't track batches.
  sourceTracksBatches = false,
  batchesBySku = {},
}) {
  const [downloading, setDownloading] = useState(false);

  // Deletion history (audit) viewer
  const [showDeletionHistory, setShowDeletionHistory] = useState(false);
  const [deletionAudit, setDeletionAudit] = useState([]);
  const [deletionAuditLoading, setDeletionAuditLoading] = useState(false);
  const openDeletionHistory = async () => {
    setShowDeletionHistory(true);
    setDeletionAuditLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/deletion-audit?entity_type=delivery`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setDeletionAudit(data?.records || []);
    } catch (e) {
      setDeletionAudit([]);
    } finally {
      setDeletionAuditLoading(false);
    }
  };

  // Per-date-group open/close state. Default (when a key is absent) is driven
  // by `isToday` so only Today's group is expanded on first render.
  const [openDateGroups, setOpenDateGroups] = useState({});
  const toggleDateGroup = (key) => setOpenDateGroups(prev => ({ ...prev, [key]: !(prev[key] ?? false) }));

  // Collapsible section state
  const [custSectionOpen, setCustSectionOpen] = useState(true);
  const [factorySectionOpen, setFactorySectionOpen] = useState(true);
  
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
  const [marginSkus, setMarginSkus] = useState([]);
  const [returnReasons, setReturnReasons] = useState([]);
  const [availableStock, setAvailableStock] = useState({});  // sku_id -> {warehouse_available, customer_pending_factory, total_available, sku_name}

  // Fetch available stock at distributor (caps factory return quantities)
  const fetchAvailableStock = useCallback(async () => {
    if (!distributor?.id) return;
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/available-stock`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const map = {};
        (data.available_stock || []).forEach(s => { map[s.sku_id] = s; });
        setAvailableStock(map);
      }
    } catch (err) {
      console.error('Error fetching available stock:', err);
    }
  }, [distributor?.id, API_URL, token]);

  useEffect(() => {
    if (showFactoryDialog) fetchAvailableStock();
  }, [showFactoryDialog, fetchAvailableStock]);

  // Helper: compute the cap for a given SKU based on selected source
  const skuCap = useCallback((skuId) => {
    const s = availableStock[skuId];
    if (!s) return 0;
    return factoryForm.source === 'customer_return' ? s.customer_pending_factory : s.warehouse_available;
  }, [availableStock, factoryForm.source]);

  // Fetch master return reasons (active only) — applies_to is driven by source:
  //   warehouse stock      → reasons configured for "Distributor"
  //   customer return      → reasons configured for "Customer"
  const fetchReturnReasons = useCallback(async () => {
    try {
      const appliesTo = factoryForm.source === 'customer_return' ? 'customer' : 'distributor';
      const res = await fetch(
        `${API_URL}/api/return-reasons?is_active=true&applies_to=${appliesTo}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setReturnReasons(data.reasons || []);
      }
    } catch (err) {
      console.error('Error fetching return reasons:', err);
    }
  }, [API_URL, token, factoryForm.source]);

  useEffect(() => {
    if (factorySectionOpen || showFactoryDialog) fetchReturnReasons();
  }, [factorySectionOpen, showFactoryDialog, fetchReturnReasons]);

  // Show every active reason returned by the API for this side. The backend
  // server-side filter (applies_to) already scopes the list correctly, so the
  // frontend should not over-filter by category.
  const filteredReasons = useMemo(() => returnReasons, [returnReasons]);

  // Fetch margin matrix SKUs for this distributor (only assigned SKUs)
  const fetchMarginSkus = useCallback(async () => {
    if (!distributor?.id) return;
    try {
      const res = await fetch(
        `${API_URL}/api/distributors/${distributor.id}/margins`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const margins = data.margins || data || [];
        const uniqueSkus = [];
        const seen = new Set();
        margins.forEach(m => {
          if (m.sku_id && !seen.has(m.sku_id)) {
            seen.add(m.sku_id);
            uniqueSkus.push({ id: m.sku_id, sku_name: m.sku_name, base_price: m.base_price, transfer_price: m.transfer_price });
          }
        });
        setMarginSkus(uniqueSkus);
      }
    } catch (err) {
      console.error('Error fetching margin SKUs:', err);
    }
  }, [distributor?.id, API_URL, token]);
  
  useEffect(() => {
    if (factorySectionOpen || showFactoryDialog) fetchMarginSkus();
  }, [factorySectionOpen, showFactoryDialog, fetchMarginSkus]);
  
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

  // Accounts sorted alphabetically by name (used by both the Record Delivery
  // search and the Stock-Out account filter).
  const sortedAccounts = useMemo(
    () => [...(assignedAccounts || [])].sort((a, b) =>
      (a.account_name || '').localeCompare(b.account_name || '', undefined, { sensitivity: 'base' })
    ),
    [assignedAccounts]
  );
  const selectedAccountIds = Array.isArray(deliveriesAccountFilter) ? deliveriesAccountFilter : [];
  const toggleAccountFilter = (accountId) => {
    setDeliveriesAccountFilter?.(prev => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.includes(accountId) ? arr.filter(x => x !== accountId) : [...arr, accountId];
    });
    setDeliveriesPage(1);
  };

  // Auto-select the warehouse location when there's only one — applies to both the
  // delivery form and the factory-return form so the user doesn't have to pick.
  // Watches the form's distributor_location_id so it re-fires after the form is
  // reset (e.g. when the dialog is re-opened for a new delivery).
  useEffect(() => {
    if (distributorLocations.length !== 1) return;
    const onlyLocId = distributorLocations[0].id;
    if (!factoryForm.distributor_location_id) {
      setFactoryForm(f => ({ ...f, distributor_location_id: onlyLocId }));
    }
    if (!deliveryForm.distributor_location_id) {
      setDeliveryForm(f => ({ ...f, distributor_location_id: onlyLocId }));
    }
  }, [distributorLocations, deliveryForm.distributor_location_id, factoryForm.distributor_location_id, setDeliveryForm, setFactoryForm]);

  // Auto-select the only SKU in the account's pricing list when an item row is
  // added. If the account has exactly one SKU on file, every blank-sku row gets
  // its sku_id + price + default stock-out packaging filled in immediately so
  // the user doesn't have to pick. Without setting packaging_units, the
  // line-amount calc falls back to 1 unit/package and silently undercharges by
  // a factor of `units_per_package` — see crates-of-12 bug.
  useEffect(() => {
    const accountSkus = selectedDeliveryAccount?.sku_pricing || [];
    if (accountSkus.length !== 1) return;
    const only = accountSkus[0];
    // Prefer `sku_id` (stable across master renames). Fall back to id, then
    // to name match for legacy rows that haven't been re-linked yet.
    const matched =
      skus.find(s => s.id === only.sku_id) ||
      skus.find(s => s.id === only.id) ||
      skus.find(s => (s.sku_name || s.sku) === (only.sku || only.sku_name));
    if (!matched) return;
    const blankItems = deliveryItems.filter(i => !i.sku_id);
    if (blankItems.length === 0) return;
    const soPkg = matched.packaging_config?.stock_out || [];
    const defPkg = soPkg.find(p => p.is_default) || soPkg[0];
    blankItems.forEach(i => {
      updateDeliveryItem(i.id, 'sku_id', matched.id);
      updateDeliveryItem(i.id, 'sku_name', matched.sku_name || matched.sku || '');
      updateDeliveryItem(i.id, 'unit_price', parseFloat(only.price_per_unit) || 0);
      if (defPkg) {
        updateDeliveryItem(i.id, 'packaging_units', String(defPkg.units_per_package));
        updateDeliveryItem(i.id, 'packaging_type_name', defPkg.packaging_type_name || '');
      }
    });
  }, [deliveryItems.length, selectedDeliveryAccount, skus]);  // eslint-disable-line react-hooks/exhaustive-deps
  
  // Auto-select first matching reason when source changes or master loads
  useEffect(() => {
    if (filteredReasons.length === 0) return;
    const current = filteredReasons.find(r => r.id === factoryForm.reason_id);
    if (!current) {
      const first = filteredReasons[0];
      setFactoryForm(f => ({
        ...f,
        reason_id: first.id,
        reason_name: first.reason_name,
        reason: first.category
      }));
    }
  }, [filteredReasons, factoryForm.reason_id]);

  const handleCreateFactoryReturn = async () => {
    if (!factoryForm.distributor_location_id || !factoryForm.reason_id || factoryItems.some(i => !i.sku_id || !i.quantity)) return;
    setSavingFactory(true);
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/factory-returns`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distributor_location_id: factoryForm.distributor_location_id,
          reason: factoryForm.reason,
          reason_id: factoryForm.reason_id,
          reason_name: factoryForm.reason_name,
          source: factoryForm.source,
          customer_return_id: factoryForm.customer_return_id,
          return_date: factoryForm.return_date,
          remarks: factoryForm.remarks,
          items: factoryItems.filter(i => i.sku_id && i.quantity > 0)
        })
      });
      if (res.ok) {
        setShowFactoryDialog(false);
        const onlyLoc = distributorLocations.length === 1 ? distributorLocations[0].id : '';
        setFactoryForm({ distributor_location_id: onlyLoc, reason: 'expired', reason_id: '', reason_name: '', source: 'warehouse', customer_return_id: '', return_date: new Date().toISOString().split('T')[0], remarks: '' });
        setFactoryItems([{ sku_id: '', quantity: 1 }]);
        fetchFactoryReturns();
        fetchAvailableStock();
      } else {
        let detail = 'Failed to create factory return';
        try {
          const err = await res.json();
          detail = err.detail || detail;
        } catch (_) { /* ignore */ }
        alert(detail);
      }
    } catch (err) {
      console.error('Error creating factory return:', err);
      alert('Network error while creating factory return');
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
  // Debit notes state (customer owes us — adds to billing)
  const [availableDebitNotes, setAvailableDebitNotes] = useState([]);
  const [loadingDebitNotes, setLoadingDebitNotes] = useState(false);
  const [selectedDebitNotes, setSelectedDebitNotes] = useState({}); // {debit_note_id: amount_to_apply}
  
  const totalPages = Math.ceil((deliveriesTotal || 0) / (deliveriesPageSize || 20));

  // Column totals for the visible deliveries (mirrors the per-row math below).
  const deliveryTotals = useMemo(() => sumDeliveries(deliveries), [deliveries]);
  const fmtINR = (n) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Inline correction of a delivery's planned date (grouping is by delivery_date).
  const [savingDateId, setSavingDateId] = useState(null);
  const [openDatePickerId, setOpenDatePickerId] = useState(null);
  const updateDeliveryDate = useCallback(async (deliveryId, dateObj) => {
    if (!dateObj) return;
    const ymd = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    setSavingDateId(deliveryId);
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/deliveries/${deliveryId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivery_date: ymd }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to update delivery date');
      }
      toast.success('Delivery date updated');
      setOpenDatePickerId(null);
      fetchDeliveries?.();
    } catch (e) {
      toast.error(e.message || 'Failed to update delivery date');
    } finally {
      setSavingDateId(null);
    }
  }, [API_URL, distributor?.id, token, fetchDeliveries]);
  
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
  
  // Fetch available debit notes when account is selected
  useEffect(() => {
    const fetchDebitNotes = async () => {
      if (!selectedDeliveryAccount?.account_id && !selectedDeliveryAccount?.id) {
        setAvailableDebitNotes([]);
        setSelectedDebitNotes({});
        return;
      }
      setLoadingDebitNotes(true);
      try {
        const accountId = selectedDeliveryAccount.account_id || selectedDeliveryAccount.id;
        const response = await fetch(
          `${API_URL}/api/distributors/${distributor.id}/debit-notes/for-account/${accountId}`,
          { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        if (response.ok) {
          const data = await response.json();
          setAvailableDebitNotes(data.debit_notes || []);
        } else {
          setAvailableDebitNotes([]);
        }
      } catch (error) {
        console.error('Error fetching debit notes:', error);
        setAvailableDebitNotes([]);
      } finally {
        setLoadingDebitNotes(false);
      }
    };
    fetchDebitNotes();
  }, [selectedDeliveryAccount, distributor.id, API_URL, token]);
  
  // Reset credit notes when dialog closes
  useEffect(() => {
    if (!showDeliveryDialog) {
      setSelectedCreditNotes({});
      setSelectedDebitNotes({});
    }
  }, [showDeliveryDialog]);
  
  // Calculate total credit to be applied
  const totalCreditToApply = Object.values(selectedCreditNotes).reduce((sum, amt) => sum + (parseFloat(amt) || 0), 0);
  // Calculate total debit to be applied (adds to billing)
  const totalDebitToApply = Object.values(selectedDebitNotes).reduce((sum, amt) => sum + (parseFloat(amt) || 0), 0);
  
  // Calculate delivery total amount (subtotal without GST — GST shown separately)
  const deliverySubtotal = deliveryItems.reduce((sum, item) => {
    const pu = parseInt(item.packaging_units) || 1;
    const tu = (parseInt(item.quantity) || 0) * pu;
    const afterDiscount = tu * (parseFloat(item.unit_price) || 0) * (1 - (parseFloat(item.discount_percent) || 0) / 100);
    return sum + afterDiscount;
  }, 0);
  // GST is not applied at this stage — totals are exclusive of GST.
  const deliveryTotalAmount = deliverySubtotal;
  
  // Calculate net billing amount
  const netBillingAmount = Math.max(0, deliveryTotalAmount - totalCreditToApply + totalDebitToApply);
  
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
    // Prepare debit notes for submission
    const debitNotesToApply = Object.entries(selectedDebitNotes)
      .filter(([_, amount]) => amount > 0)
      .map(([debit_note_id, amount_to_apply]) => ({
        debit_note_id,
        amount_to_apply
      }));
    
    // Pass credit + debit notes to the parent handler
    await handleCreateDelivery(creditNotesToApply, debitNotesToApply);
  };

  // Handle debit note selection toggle
  const handleDebitNoteToggle = (debitNote, checked) => {
    if (checked) {
      setSelectedDebitNotes(prev => ({ ...prev, [debitNote.id]: debitNote.balance_amount }));
    } else {
      setSelectedDebitNotes(prev => {
        const updated = { ...prev };
        delete updated[debitNote.id];
        return updated;
      });
    }
  };

  // Handle debit note amount change
  const handleDebitNoteAmountChange = (debitNoteId, value, maxAmount) => {
    const numValue = parseFloat(value) || 0;
    const clampedValue = Math.min(Math.max(0, numValue), maxAmount);
    if (clampedValue > 0) {
      setSelectedDebitNotes(prev => ({ ...prev, [debitNoteId]: clampedValue }));
    } else {
      setSelectedDebitNotes(prev => {
        const updated = { ...prev };
        delete updated[debitNoteId];
        return updated;
      });
    }
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
            {/* Backfill External Billing Entries for historical completed
                deliveries (distributor-billed accounts whose EBE was never
                generated). Admin-only; idempotent. */}
            {canManage && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const res = await fetch(
                      `${API_URL}/api/distributors/${distributor.id}/external-billing/backfill`,
                      {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                      },
                    );
                    const data = await res.json();
                    if (!res.ok) {
                      alert(data?.detail || 'Backfill failed');
                      return;
                    }
                    if ((data.created || 0) > 0) {
                      alert(`Generated ${data.created} External Billing Entr${data.created === 1 ? 'y' : 'ies'}.`);
                      fetchDeliveries?.();
                    } else {
                      alert(`All ${data.examined} completed deliveries already have an EBE.`);
                    }
                  } catch (e) {
                    alert(`Backfill failed: ${e?.message || e}`);
                  }
                }}
                className="text-violet-700 border-violet-200 hover:bg-violet-50"
                data-testid="backfill-ebe-btn"
              >
                <Receipt className="h-4 w-4 mr-2" />
                Generate Missing EBEs
              </Button>
            )}
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
              <Button
                variant="outline"
                onClick={openDeletionHistory}
                data-testid="deletion-history-btn"
                className="text-rose-700 border-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-900/50"
              >
                <History className="h-4 w-4 mr-2" />
                Deletion history
              </Button>
            )}

            {/* Deletion history dialog */}
            <Dialog open={showDeletionHistory} onOpenChange={setShowDeletionHistory}>
              <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] flex flex-col" data-testid="deletion-history-dialog">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <History className="h-5 w-5 text-rose-600" /> Deleted deliveries — audit trail
                  </DialogTitle>
                  <DialogDescription>
                    Who deleted a delivery, when, and its details at the time. Recorded for deletions going forward.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto -mx-1 px-1">
                  {deletionAuditLoading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
                  ) : deletionAudit.length === 0 ? (
                    <div className="py-12 text-center">
                      <History className="h-10 w-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No deletions recorded</p>
                      <p className="text-xs text-muted-foreground mt-1">Deletions made from now on will appear here with who &amp; when.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {deletionAudit.map((r) => (
                        <div key={r.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3" data-testid={`deletion-audit-${r.id}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800 dark:text-white">{r.entity_number || r.entity_id}</span>
                              {r.status_at_deletion && (
                                <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{r.status_at_deletion}</span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{r.deleted_at ? new Date(r.deleted_at).toLocaleString() : '—'}</span>
                          </div>
                          <div className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                            Deleted by <span className="font-medium text-slate-800 dark:text-white">{r.deleted_by_name || r.deleted_by_email || 'Unknown'}</span>
                            {r.deleted_by_role && <span className="text-muted-foreground"> ({r.deleted_by_role})</span>}
                            {typeof r.item_count === 'number' && <span className="text-muted-foreground"> · {r.item_count} line item{r.item_count === 1 ? '' : 's'}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            
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
            <DialogContent className="max-w-5xl w-[95vw] h-[92vh] max-h-[92vh] flex flex-col overflow-hidden">
              <DialogHeader className="shrink-0">
                <DialogTitle>Record Account Delivery</DialogTitle>
                <DialogDescription>
                  Record a delivery from {distributor.distributor_name} to an account
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4 flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
                {/* Account Selection - Searchable */}
                <div className="space-y-2">
                  <Label>Account *</Label>
                  {selectedDeliveryAccount ? (
                    <div
                      className="relative overflow-hidden flex items-center justify-between p-3 rounded-md border border-blue-200 bg-gradient-to-br from-blue-50 via-sky-50 to-white shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                      data-testid="delivery-selected-account-tile"
                    >
                      {/* Subtle accent rail on the left edge */}
                      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500 to-sky-400" aria-hidden />
                      <div className="flex-1 min-w-0 pl-2">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900 truncate">{selectedDeliveryAccount.account_name}</p>
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-blue-700 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded">
                            Selected
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">
                          {selectedDeliveryAccount.city}{selectedDeliveryAccount.state ? `, ${selectedDeliveryAccount.state}` : ''}
                          {selectedDeliveryAccount.is_primary && (
                            <span className="text-amber-600 ml-1">★ Primary</span>
                          )}
                        </p>
                        {selectedDeliveryAccount.contact_name && (
                          <p className="text-xs text-slate-500 mt-1">
                            Contact: {selectedDeliveryAccount.contact_name}
                            {selectedDeliveryAccount.contact_number && ` • ${selectedDeliveryAccount.contact_number}`}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-500 hover:text-slate-700"
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
                      <div className="border rounded-md max-h-[320px] overflow-y-auto">
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
                    <div className="border rounded-lg overflow-hidden">
                      <div className="divide-y divide-slate-200">
                      {deliveryItems.map((item, index) => {
                        const pkgUnits = parseInt(item.packaging_units) || 1;
                        const totalUnits = (parseInt(item.quantity) || 0) * pkgUnits;
                        const lineSubtotal = totalUnits * (parseFloat(item.unit_price) || 0) * (1 - ((parseFloat(item.discount_percent) || 0) / 100));
                        const accountSkus = selectedDeliveryAccount?.sku_pricing || [];
                        const allSkuOptions = accountSkus.length > 0 ? accountSkus : skus;
                        const selectedSku = skus.find(s => s.id === item.sku_id);
                        const stockOutPkg = selectedSku?.packaging_config?.stock_out || [];
                        const isOdd = index % 2 === 1;
                        return (
                        <div key={item.id} className={`px-4 py-3 ${isOdd ? 'bg-slate-50' : 'bg-white'}`} data-testid={`delivery-item-${index}`}>
                          {/* Row 1: SKU + Packaging + Remove */}
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <Select
                                value={item.sku_id}
                                onValueChange={(v) => {
                                  const matchedSku = accountSkus.find(s => (s.id || s.sku_id) === v) || skus.find(s => s.id === v);
                                  updateDeliveryItem(item.id, 'sku_id', v);
                                  if (matchedSku) {
                                    // Always resolve display name from the master SKU (joined by id) so a rename
                                    // shows the current name; fall back to the row's stored name only when we
                                    // don't have a master row in hand.
                                    const master = skus.find(s => s.id === v);
                                    updateDeliveryItem(item.id, 'sku_name', master?.sku_name || master?.name || matchedSku.sku_name || matchedSku.sku || matchedSku.name);
                                    if (matchedSku.price_per_unit) updateDeliveryItem(item.id, 'unit_price', matchedSku.price_per_unit);
                                    // Auto-select default stock_out packaging
                                    const fullSku = skus.find(s => s.id === v);
                                    const soPkg = fullSku?.packaging_config?.stock_out || [];
                                    const defPkg = soPkg.find(p => p.is_default) || soPkg[0];
                                    if (defPkg) {
                                      updateDeliveryItem(item.id, 'packaging_units', String(defPkg.units_per_package));
                                      updateDeliveryItem(item.id, 'packaging_type_name', defPkg.packaging_type_name || '');
                                    }
                                  }
                                }}
                              >
                                <SelectTrigger className="h-10"><SelectValue placeholder="Select SKU" /></SelectTrigger>
                                <SelectContent>
                                  {allSkuOptions.map(sku => {
                                    // `account.sku_pricing[]` carries `sku_id` (no top-level `id`); the master
                                    // SKU list carries `id`. Accept either as the stable identifier so a future
                                    // master rename can't break the dropdown — the join is always by id.
                                    const id = sku.id || sku.sku_id;
                                    if (!id) return null;
                                    // Show the current master name (joined by id) when available so a rename is
                                    // reflected even if `account.sku_pricing[]` still carries the legacy name.
                                    const master = skus.find(s => s.id === id);
                                    const label = master?.sku_name || master?.name || sku.sku_name || sku.sku || sku.name;
                                    return (
                                      <SelectItem key={id} value={id}>
                                        {label}{sku.price_per_unit && ` - ₹${sku.price_per_unit}`}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="w-40 flex-shrink-0">
                              {stockOutPkg.length > 0 ? (
                                <select className="w-full h-10 px-3 border rounded-md text-sm bg-background"
                                  value={item.packaging_units || ''}
                                  onChange={e => {
                                    const sel = stockOutPkg.find(p => String(p.units_per_package) === e.target.value);
                                    updateDeliveryItem(item.id, 'packaging_units', e.target.value);
                                    updateDeliveryItem(item.id, 'packaging_type_name', sel?.packaging_type_name || '');
                                  }}
                                  data-testid={`delivery-pkg-${index}`}>
                                  {stockOutPkg.map((pkg, pi) => (
                                    <option key={pi} value={pkg.units_per_package}>{pkg.packaging_type_name} ({pkg.units_per_package})</option>
                                  ))}
                                </select>
                              ) : <span className="text-sm text-muted-foreground">—</span>}
                            </div>
                            <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-destructive flex-shrink-0" onClick={() => removeDeliveryItem(item.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {/* Batch picker — moved BEFORE the quantity row so the user
                              sees how many units are available in the batch *before* deciding
                              the delivery quantity. Only renders when the source warehouse
                              has track_batches=true. */}
                          {sourceTracksBatches && item.sku_id && (() => {
                            // FIFO: oldest batch first. Prefer production_date,
                            // fall back to received_at, finally batch_code.
                            const rawBatches = batchesBySku[item.sku_id] || [];
                            const ageKey = (b) => b.production_date || b.received_at || '';
                            const sorted = [...rawBatches].sort((a, b) => {
                              const ka = ageKey(a);
                              const kb = ageKey(b);
                              if (ka && kb) return ka.localeCompare(kb);
                              if (ka) return -1;
                              if (kb) return 1;
                              return (a.batch_code || '').localeCompare(b.batch_code || '');
                            });

                            const ageDays = (iso) => {
                              if (!iso) return null;
                              // Accept date-only ('2026-05-27') or full ISO.
                              const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
                              if (Number.isNaN(t)) return null;
                              return Math.max(0, Math.floor((Date.now() - t) / 86400000));
                            };

                            // Age tier → tinted chip. Fresh = green, warming up =
                            // amber, near-expiry = rose. Thresholds match the
                            // existing FIFO + recall conversations.
                            const ageChip = (days) => {
                              if (days == null) return { label: 'Age unknown', cls: 'text-slate-600 bg-slate-100 border-slate-200' };
                              const label = days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} old`;
                              if (days < 30)  return { label, cls: 'text-emerald-700 bg-emerald-100 border-emerald-200' };
                              if (days < 60)  return { label, cls: 'text-amber-700 bg-amber-100 border-amber-200' };
                              return                  { label, cls: 'text-rose-700 bg-rose-100 border-rose-200' };
                            };

                            return (
                              <div className="mt-3">
                                <div className="flex items-baseline justify-between mb-1.5">
                                  <Label className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                                    <Package className="h-3 w-3" />
                                    Batch <span className="text-red-500">*</span>
                                    <span className="text-[10px] text-amber-600/70 font-normal normal-case">FIFO — oldest first</span>
                                  </Label>
                                  {sorted.length > 0 && (
                                    <span className="text-[10px] text-slate-500">
                                      {sorted.length} batch{sorted.length === 1 ? '' : 'es'} available · pick any (FIFO suggested)
                                    </span>
                                  )}
                                </div>

                                {sorted.length === 0 ? (
                                  <div className="rounded-lg border border-red-200 bg-red-50/70 px-3 py-2.5 text-xs text-red-700 flex items-center gap-2" data-testid={`delivery-no-batch-${item.id}`}>
                                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                    <span>No batches available for this SKU at the source warehouse.</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap gap-2" data-testid={`delivery-batch-cards-${item.id}`}>
                                    {sorted.map((b, bi) => {
                                      const selected = item.batch_id === b.batch_id;
                                      const days = ageDays(ageKey(b));
                                      const chip = ageChip(days);
                                      const ageSource = b.production_date ? 'Produced' : 'Received';
                                      const ageDate = b.production_date || (b.received_at ? b.received_at.slice(0, 10) : null);
                                      return (
                                        <button
                                          type="button"
                                          key={b.batch_id}
                                          onClick={() => {
                                            updateDeliveryItem(item.id, 'batch_id', b.batch_id);
                                            updateDeliveryItem(item.id, 'batch_code', b.batch_code);
                                          }}
                                          data-testid={`delivery-batch-card-${item.id}-${bi}`}
                                          className={[
                                            "group relative flex flex-col items-start text-left rounded-xl border px-3 py-2 transition-all",
                                            "min-w-[170px] max-w-[220px]",
                                            selected
                                              ? "border-amber-500 bg-gradient-to-br from-amber-50 to-orange-50 ring-2 ring-amber-400/40 shadow-sm"
                                              : "border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40 hover:-translate-y-px hover:shadow-sm",
                                          ].join(" ")}
                                        >
                                          {selected && (
                                            <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow">
                                              <CheckCircle2 className="h-3 w-3" />
                                            </span>
                                          )}
                                          <span
                                            className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border mb-1 ${chip.cls}`}
                                            data-testid={`delivery-batch-age-${item.id}-${bi}`}
                                          >
                                            {chip.label}
                                          </span>
                                          <div className="font-mono text-[13px] font-bold text-slate-900 leading-tight tracking-tight break-all">
                                            {b.batch_code}
                                          </div>
                                          <div className="text-[10px] text-slate-500 mt-0.5">
                                            {ageDate
                                              ? `${ageSource} ${ageDate}`
                                              : 'Date unavailable'}
                                          </div>
                                          <div className="mt-1.5 flex items-baseline gap-1">
                                            {(() => {
                                              const upp = Math.max(1, Number(item.units_per_package) || 1);
                                              const qty = Number(b.quantity || 0);
                                              const packs = Math.floor(qty / upp);
                                              const remainder = qty - packs * upp;
                                              // Friendly unit derived from the packaging name's last word
                                              // ("24 Bottle Crate" → "crate", "Bottle (1)" → "bottle").
                                              const pkgWords = (item.packaging_type_name || '').trim().replace(/\(.*\)$/, '').trim().split(/\s+/).filter(Boolean);
                                              const unitWord = upp === 1
                                                ? 'units'
                                                : ((pkgWords[pkgWords.length - 1] || 'package').toLowerCase() + 's');
                                              return (
                                                <>
                                                  <span className={`text-lg font-bold tabular-nums ${selected ? 'text-amber-700' : 'text-slate-800'}`}>
                                                    {packs.toLocaleString()}
                                                  </span>
                                                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">{unitWord}</span>
                                                  {upp > 1 && remainder > 0 && (
                                                    <span className="ml-1 text-[10px] text-slate-400 normal-case tracking-normal" title="Bottles left over that don't make a full package">
                                                      +{remainder} loose
                                                    </span>
                                                  )}
                                                </>
                                              );
                                            })()}
                                          </div>
                                          {Number(b.reserved || 0) > 0 && (
                                            <div className="mt-0.5 text-[10px] text-amber-600" title="On-hand stock already committed to other open stock-out / promo orders is excluded from available.">
                                              {Number(b.on_hand || 0).toLocaleString()} on-hand · {Number(b.reserved).toLocaleString()} reserved
                                            </div>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          {/* Row 2: Qty | Price | Disc | Amount — top-aligned with fixed spacers */}
                          <div className="flex items-start gap-3 mt-3">
                            <div className="w-24 flex-shrink-0">
                              <Label className="text-xs text-muted-foreground">Qty (pkgs)</Label>
                              <Input type="number" min="1" className="h-10 mt-1 text-base font-medium"
                                value={item.quantity}
                                onChange={(e) => {
                                  updateDeliveryItem(item.id, 'quantity', e.target.value);
                                  // FIFO auto-select: when the user types a quantity and no
                                  // batch is picked yet, default to the oldest batch in stock.
                                  // Mirrors the same sort the picker uses (production_date →
                                  // received_at → batch_code). Saves a click on every line.
                                  if (sourceTracksBatches && !item.batch_id && item.sku_id) {
                                    const rb = batchesBySku[item.sku_id] || [];
                                    const ak = (b) => b.production_date || b.received_at || '';
                                    const oldest = [...rb].sort((a, b) => {
                                      const ka = ak(a), kb = ak(b);
                                      if (ka && kb) return ka.localeCompare(kb);
                                      if (ka) return -1;
                                      if (kb) return 1;
                                      return (a.batch_code || '').localeCompare(b.batch_code || '');
                                    })[0];
                                    if (oldest) {
                                      updateDeliveryItem(item.id, 'batch_id', oldest.batch_id);
                                      updateDeliveryItem(item.id, 'batch_code', oldest.batch_code);
                                    }
                                  }
                                }}
                                data-testid={`delivery-qty-${item.id}`} />
                              {(() => {
                                // Availability follows the SELECTED batch — the user is free to
                                // pick ANY batch (FIFO is only a default suggestion). Shows
                                // qty-used / selected-batch-available so over-stock is obvious.
                                const selectedBatch = sourceTracksBatches && item.batch_id
                                  ? (batchesBySku[item.sku_id] || []).find(b => b.batch_id === item.batch_id)
                                  : null;
                                const availableUnits = selectedBatch ? (selectedBatch.quantity || 0) : null;
                                const over = availableUnits != null && totalUnits > availableUnits;
                                if (availableUnits != null) {
                                  return (
                                    <p className={`text-xs font-medium text-center mt-0.5 h-4 ${over ? 'text-red-600' : 'text-blue-600'}`}>
                                      {totalUnits}/{availableUnits} units
                                    </p>
                                  );
                                }
                                return (
                                  <p className="text-xs text-blue-600 font-medium text-center mt-0.5 h-4">
                                    {totalUnits > 0 && pkgUnits > 1 ? `${totalUnits} units` : '\u00A0'}
                                  </p>
                                );
                              })()}
                            </div>
                            <div className="flex-1 min-w-[100px]">
                              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                                Price/unit (₹)
                                <span className="text-[10px] text-slate-400 font-normal">· locked</span>
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                className="h-10 mt-1 text-base bg-slate-50 cursor-not-allowed"
                                value={item.unit_price}
                                readOnly
                                title="Price is set on the account's SKU Pricing. Edit there to change it."
                                data-testid={`delivery-item-price-${item.id}`}
                              />
                              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                                Set on account
                              </p>
                            </div>
                            <div className="w-20 flex-shrink-0">
                              <Label className="text-xs text-muted-foreground">Disc %</Label>
                              <Input type="number" min="0" max="100" className="h-10 mt-1 text-base" value={item.discount_percent}
                                onChange={(e) => updateDeliveryItem(item.id, 'discount_percent', e.target.value)} />
                              <p className="h-4"></p>
                            </div>
                            <div className="w-28 flex-shrink-0 text-right">
                              <Label className="text-xs text-muted-foreground">Amount</Label>
                              <p className="text-base font-bold tabular-nums mt-2.5">₹{lineSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              <p className="h-4"></p>
                            </div>
                          </div>
                          {/* Over-stock warning row — only when the user has set a qty that
                              exceeds what the selected batch can fulfil. Prevents form
                              submission to avoid the backend 400 round-trip. */}
                          {(() => {
                            // Over-stock guard is per SELECTED batch — the user picks the batch
                            // for each line. To draw from more stock, pick a batch with enough
                            // or add another line for a different batch.
                            const selectedBatch = sourceTracksBatches && item.batch_id
                              ? (batchesBySku[item.sku_id] || []).find(b => b.batch_id === item.batch_id)
                              : null;
                            if (selectedBatch && totalUnits > (selectedBatch.quantity || 0)) {
                              return (
                                <p className="mt-1 text-xs text-red-600 flex items-center gap-1" data-testid={`delivery-over-stock-${item.id}`}>
                                  <AlertCircle className="h-3 w-3" />
                                  Quantity exceeds batch availability ({selectedBatch.quantity} units in {selectedBatch.batch_code}).
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        );
                      })}
                      </div>
                      
                      {/* Total — exclusive of GST (no GST calc here; settlement happens separately) */}
                      {(() => {
                        const subtotal = deliveryItems.reduce((sum, item) => {
                          const pu = parseInt(item.packaging_units) || 1;
                          const tu = (parseInt(item.quantity) || 0) * pu;
                          return sum + tu * (parseFloat(item.unit_price) || 0) * (1 - ((parseFloat(item.discount_percent) || 0) / 100));
                        }, 0);
                        return (
                          <div className="border-t px-4 py-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-base font-bold">Total</span>
                              <span className="text-lg font-bold tabular-nums" data-testid="delivery-grand-total">
                                ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground italic text-right">All values exclusive of GST</p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Credit Notes Section — shown as soon as an account is selected so
                   the user always sees, before adding any line item, whether credit
                   notes are available for offset. */}
                {selectedDeliveryAccount && (
                  <div className="space-y-3 border-t pt-4" data-testid="credit-notes-section">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-emerald-600" />
                        <Label className="text-base font-semibold">Apply Credit Notes</Label>
                      </div>
                      {!loadingCreditNotes && (
                        availableCreditNotes.length > 0 ? (
                          <Badge variant="outline" className="text-emerald-700 border-emerald-300 bg-emerald-50" data-testid="credit-notes-available-badge">
                            {availableCreditNotes.length} available · ₹{availableCreditNotes.reduce((s, cn) => s + (cn.balance_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500 border-slate-300 bg-slate-50" data-testid="credit-notes-none-badge">
                            None available
                          </Badge>
                        )
                      )}
                    </div>
                    
                    {loadingCreditNotes ? (
                      <div className="flex items-center justify-center py-4">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Loading credit notes for {selectedDeliveryAccount.account_name}…</span>
                      </div>
                    ) : availableCreditNotes.length === 0 ? (
                      <div className="border rounded-md bg-slate-50 px-4 py-3 flex items-start gap-3" data-testid="credit-notes-empty-banner">
                        <Receipt className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-slate-700">
                            No credit notes available for {selectedDeliveryAccount.account_name}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Nothing to offset against this delivery. Credit notes are generated when a customer return is confirmed for this account.
                          </p>
                        </div>
                      </div>
                    ) : deliveryItems.length === 0 ? (
                      <div className="border rounded-md bg-emerald-50/50 border-emerald-200 px-4 py-3 flex items-start gap-3" data-testid="credit-notes-pending-items-banner">
                        <Receipt className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-emerald-800">
                            {availableCreditNotes.length} credit note{availableCreditNotes.length !== 1 ? 's' : ''} can be applied to this delivery — total ₹{availableCreditNotes.reduce((s, cn) => s + (cn.balance_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} available.
                          </p>
                          <p className="text-xs text-emerald-700/80 mt-0.5">
                            Add at least one line item above to start applying them against the customer billing.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Select credit notes to offset the customer billing amount
                        </p>
                        <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
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
                                      <div className="flex items-center gap-2 min-w-0">
                                        <label
                                          htmlFor={`cn-${cn.id}`}
                                          className="font-medium text-sm cursor-pointer truncate"
                                        >
                                          {cn.credit_note_number}
                                        </label>
                                        {cn.zoho_creditnote_url && (
                                          <a
                                            href={cn.zoho_creditnote_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                                            title={`Open in Zoho Books${cn.zoho_creditnote_number ? ` — ${cn.zoho_creditnote_number}` : ''}`}
                                            data-testid={`credit-note-zoho-link-${cn.id}`}
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                            <span className="hidden sm:inline">Zoho</span>
                                          </a>
                                        )}
                                      </div>
                                      <span className="text-sm font-semibold text-emerald-600 shrink-0 ml-2">
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
                        
                      </div>
                    )}
                  </div>
                )}

                {/* Debit Notes Section — customer owes us for missing bottles;
                   applying these ADDS to the customer billing. Shown separately
                   below the credit notes section. */}
                {selectedDeliveryAccount && (availableDebitNotes.length > 0 || loadingDebitNotes) && (
                  <div className="space-y-3 border-t pt-4" data-testid="debit-notes-section">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-5 w-5 text-amber-600" />
                        <Label className="text-base font-semibold">Apply Debit Notes</Label>
                      </div>
                      {!loadingDebitNotes && availableDebitNotes.length > 0 && (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50" data-testid="debit-notes-available-badge">
                          {availableDebitNotes.length} outstanding · ₹{availableDebitNotes.reduce((s, dn) => s + (dn.balance_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </Badge>
                      )}
                    </div>

                    {loadingDebitNotes ? (
                      <div className="flex items-center justify-center py-4">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Loading debit notes…</span>
                      </div>
                    ) : deliveryItems.length === 0 ? (
                      <div className="border rounded-md bg-amber-50/50 border-amber-200 px-4 py-3 flex items-start gap-3" data-testid="debit-notes-pending-items-banner">
                        <Receipt className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-800">
                            {availableDebitNotes.length} debit note{availableDebitNotes.length !== 1 ? 's' : ''} outstanding — total ₹{availableDebitNotes.reduce((s, dn) => s + (dn.balance_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} owed by this customer.
                          </p>
                          <p className="text-xs text-amber-700/80 mt-0.5">
                            Add at least one line item above to charge them onto this delivery.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Select debit notes to charge (add) onto the customer billing for missing/unreturned bottles
                        </p>
                        <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
                          {availableDebitNotes.map(dn => {
                            const isSelected = selectedDebitNotes[dn.id] !== undefined;
                            const selectedAmount = selectedDebitNotes[dn.id] || 0;
                            return (
                              <div
                                key={dn.id}
                                className={`p-3 transition-colors ${isSelected ? 'bg-amber-50/50' : 'hover:bg-muted/30'}`}
                                data-testid={`debit-note-row-${dn.id}`}
                              >
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    id={`dn-${dn.id}`}
                                    checked={isSelected}
                                    onCheckedChange={(checked) => handleDebitNoteToggle(dn, checked)}
                                    className="mt-0.5"
                                    data-testid={`debit-note-checkbox-${dn.id}`}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <label htmlFor={`dn-${dn.id}`} className="font-medium text-sm cursor-pointer truncate">
                                        {dn.debit_note_number}
                                      </label>
                                      <span className="text-sm font-semibold text-amber-600 shrink-0 ml-2">
                                        ₹{dn.balance_amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })} owed
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                      <span>Return: {dn.return_number || 'N/A'}</span>
                                      <span>•</span>
                                      <span>{dn.debit_note_date ? new Date(dn.debit_note_date).toLocaleDateString() : 'N/A'}</span>
                                      <span>•</span>
                                      <span>Original: ₹{dn.original_amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    {isSelected && (
                                      <div className="flex items-center gap-2 mt-2">
                                        <span className="text-xs text-muted-foreground">Charge:</span>
                                        <Input
                                          type="number"
                                          min="0"
                                          max={dn.balance_amount}
                                          step="0.01"
                                          value={selectedAmount}
                                          onChange={(e) => handleDebitNoteAmountChange(dn.id, e.target.value, dn.balance_amount)}
                                          className="h-7 w-28 text-sm"
                                          data-testid={`debit-note-amount-${dn.id}`}
                                        />
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => handleDebitNoteAmountChange(dn.id, dn.balance_amount, dn.balance_amount)}
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
                      </div>
                    )}
                  </div>
                )}

                {/* Combined Net Billing Summary (credits subtract, debits add) */}
                {selectedDeliveryAccount && deliveryItems.length > 0 && (totalCreditToApply > 0 || totalDebitToApply > 0) && (
                  <div className="border rounded-md p-3 bg-slate-50 space-y-2" data-testid="net-billing-summary">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Delivery Total:</span>
                      <span className="font-medium">₹{deliveryTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {totalCreditToApply > 0 && (
                      <div className="flex justify-between text-sm text-emerald-600">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Credit Notes Applied ({Object.keys(selectedCreditNotes).length}):
                        </span>
                        <span className="font-medium">- ₹{totalCreditToApply.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {totalDebitToApply > 0 && (
                      <div className="flex justify-between text-sm text-amber-600">
                        <span className="flex items-center gap-1">
                          <Receipt className="h-3.5 w-3.5" />
                          Debit Notes Charged ({Object.keys(selectedDebitNotes).length}):
                        </span>
                        <span className="font-medium">+ ₹{totalDebitToApply.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold border-t pt-2">
                      <span>Net Customer Billing:</span>
                      <span className="text-slate-900">₹{netBillingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
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
              <DialogFooter className="shrink-0 border-t pt-4">
                {/* Aggregate over-stock guard — refuse to submit when any line
                    requests more units than its selected batch holds. Mirrors
                    the backend stock-availability validator so users never hit
                    a 400 round-trip. */}
                {(() => {
                  const overLines = (deliveryItems || []).filter((it) => {
                    if (!sourceTracksBatches || !it.batch_id) return false;
                    const sel = (batchesBySku[it.sku_id] || []).find((b) => b.batch_id === it.batch_id);
                    if (!sel) return false;
                    const pu = parseInt(it.packaging_units) || 1;
                    const tu = (parseInt(it.quantity) || 0) * pu;
                    return tu > (sel.quantity || 0);
                  });
                  const hasOverStock = overLines.length > 0;
                  return (
                    <>
                      {hasOverStock && (
                        <div className="mr-auto flex items-center gap-1.5 text-xs text-red-600 font-medium" data-testid="over-stock-banner">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {overLines.length} line{overLines.length === 1 ? '' : 's'} over batch availability — adjust qty before submitting.
                        </div>
                      )}
                      <Button variant="outline" onClick={() => setShowDeliveryDialog(false)}>Cancel</Button>
                      <Button
                        onClick={handleCreateDeliveryWithCredits}
                        disabled={savingDelivery || !deliveryForm.account_id || !deliveryForm.distributor_location_id || deliveryItems.length === 0 || hasOverStock}
                        data-testid="save-delivery-btn"
                      >
                        {savingDelivery ? 'Creating...' : 'Record Delivery'}
                      </Button>
                    </>
                  );
                })()}
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
            <Select
              value={deliveriesTimeFilter || 'this_month'}
              onValueChange={(v) => { setDeliveriesTimeFilter(v); setDeliveriesPage(1); }}
            >
              <SelectTrigger className="h-9 w-[160px]" data-testid="deliveries-time-filter">
                <SelectValue placeholder="Time period" />
              </SelectTrigger>
              <SelectContent>
                {TIME_FILTERS.map(tf => (
                  <SelectItem key={tf.value} value={tf.value}>{tf.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Account:</span>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="h-9 w-[240px] justify-between font-normal"
                  data-testid="deliveries-account-filter"
                >
                  <span className="truncate text-left">
                    {selectedAccountIds.length === 0
                      ? 'All Accounts'
                      : selectedAccountIds.length === 1
                        ? (sortedAccounts.find(a => a.id === selectedAccountIds[0])?.account_name || '1 account')
                        : `${selectedAccountIds.length} accounts`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command
                  filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
                >
                  <CommandInput placeholder="Search accounts by name or city..." data-testid="deliveries-account-search" />
                  <CommandList className="max-h-[320px]">
                    <CommandEmpty>No accounts found.</CommandEmpty>
                    <CommandGroup>
                      {selectedAccountIds.length > 0 && (
                        <CommandItem
                          value="__clear__"
                          onSelect={() => { setDeliveriesAccountFilter?.([]); setDeliveriesPage(1); }}
                          className="text-muted-foreground"
                          data-testid="deliveries-account-clear"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Clear selection (All Accounts)
                        </CommandItem>
                      )}
                      {sortedAccounts.map(account => {
                        const checked = selectedAccountIds.includes(account.id);
                        return (
                          <CommandItem
                            key={account.id}
                            value={`${account.account_name} ${account.city || ''} ${account.contact_name || ''}`}
                            onSelect={() => toggleAccountFilter(account.id)}
                            data-testid={`deliveries-account-option-${account.id}`}
                            className="flex items-start gap-2"
                          >
                            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${checked ? 'opacity-100 text-emerald-600' : 'opacity-0'}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{account.account_name}</p>
                              {(account.city || account.contact_name) && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {account.city || ''}{account.city && account.contact_name ? ' • ' : ''}{account.contact_name || ''}
                                </p>
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <div className="flex items-center gap-2">
              <Factory className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Warehouse:</span>
            </div>
            <Select
              value={deliveriesLocationFilter || 'all'}
              onValueChange={(v) => { setDeliveriesLocationFilter?.(v); setDeliveriesPage(1); }}
            >
              <SelectTrigger className="h-9 w-[200px]" data-testid="deliveries-warehouse-filter">
                <SelectValue placeholder="All Warehouses" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <SelectItem value="all">All Warehouses</SelectItem>
                {(distributor?.locations || []).map(loc => (
                  <SelectItem key={loc.id} value={loc.id} data-testid={`deliveries-warehouse-option-${loc.id}`}>
                    {loc.location_name}{loc.city ? ` (${loc.city})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select
                value={String(deliveriesPageSize || 20)}
                onValueChange={(v) => { setDeliveriesPageSize(Number(v)); setDeliveriesPage(1); }}
              >
                <SelectTrigger className="h-9 w-[80px]" data-testid="deliveries-page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
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
                {/* Group headers */}
                <tr className="border-b border-slate-200">
                  <th colSpan="3" className="p-0"></th>
                  <th colSpan="3" className="text-center px-2 pt-2 pb-0">
                    <span className="text-[9px] uppercase tracking-widest font-bold text-blue-500 bg-blue-50 px-3 py-0.5 rounded-full">Customer</span>
                  </th>
                  <th colSpan="3" className="text-center px-2 pt-2 pb-0">
                    <span className="text-[9px] uppercase tracking-widest font-bold text-purple-500 bg-purple-50 px-3 py-0.5 rounded-full">Distributor</span>
                  </th>
                  <th colSpan="2" className="p-0"></th>
                </tr>
                <tr className="border-b-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-slate-50">
                  <th className="text-left p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Delivery</th>
                  <th className="text-left p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Account</th>
                  <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Items</th>
                  {/* Customer columns */}
                  <th className="text-right p-3 font-semibold text-blue-700 uppercase tracking-wider text-xs bg-blue-50/40">Billing</th>
                  <th className="text-right p-3 font-semibold text-blue-700 uppercase tracking-wider text-xs bg-blue-50/40">Return Credit</th>
                  <th className="text-right p-3 font-semibold text-blue-700 uppercase tracking-wider text-xs bg-blue-50/40">Net Billing</th>
                  {/* Distributor columns */}
                  <th className="text-right p-3 font-semibold text-purple-700 uppercase tracking-wider text-xs bg-purple-50/40">Margin Amt</th>
                  <th className="text-right p-3 font-semibold text-purple-700 uppercase tracking-wider text-xs bg-purple-50/40">Billable</th>
                  <th className="text-right p-3 font-semibold text-purple-700 uppercase tracking-wider text-xs bg-purple-50/40">Net Billable</th>
                  <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Status</th>
                  <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupByDateDesc(deliveries, (d) => d.delivery_date).map((group) => {
                  const isOpen = openDateGroups[group.key] ?? group.isToday;
                  return (
                  <React.Fragment key={group.key}>
                    <tr
                      className={`border-y cursor-pointer ${group.isToday ? 'bg-emerald-100/80 border-emerald-300' : group.isTomorrow ? 'bg-amber-100/80 border-amber-300' : 'bg-slate-50 border-slate-200'}`}
                      data-testid={`delivery-date-group-${group.key}`}
                      onClick={() => toggleDateGroup(group.key)}
                    >
                      <td colSpan="11" className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'} ${group.isToday ? 'text-emerald-700' : group.isTomorrow ? 'text-amber-700' : 'text-slate-400'}`} />
                          <Calendar className={`h-3.5 w-3.5 ${group.isToday ? 'text-emerald-700' : group.isTomorrow ? 'text-amber-700' : 'text-slate-400'}`} />
                          <span className={`text-xs font-bold uppercase tracking-wider ${group.isToday ? 'text-emerald-800' : group.isTomorrow ? 'text-amber-800' : 'text-slate-600'}`}>{group.label}</span>
                          {(group.isToday || group.isTomorrow) && (
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${group.isToday ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>Scheduling</span>
                          )}
                          {group.isFuture && (
                            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-sky-100 text-sky-700 border border-sky-200" data-testid={`delivery-future-pill-${group.key}`}>Future</span>
                          )}
                          {group.isPast && (
                            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600 border border-slate-300" data-testid={`delivery-past-pill-${group.key}`}>{group.daysAgo === 1 ? '1 day ago' : `${group.daysAgo} days ago`}</span>
                          )}
                          <span className="text-[11px] font-normal text-slate-400">· {group.items.length} {group.items.length === 1 ? 'delivery' : 'deliveries'}</span>
                        </div>
                      </td>
                    </tr>
                    {isOpen && group.items.map((delivery) => {
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
                  
                  // Total margin amount (customer price - transfer price per item)
                  const totalMarginAmount = items.reduce((sum, item) => {
                    const qty = item.quantity || 0;
                    const customerPrice = item.customer_selling_price || item.unit_price || 0;
                    const commissionPct = item.distributor_commission_percent || item.margin_percent || 2.5;
                    const marginPerUnit = customerPrice * (commissionPct / 100);
                    return sum + (qty * marginPerUnit);
                  }, 0);
                  
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

                  // Reversed / cancelled deliveries are voided: strike the figures
                  // out and exclude them from totals (handled in sumDeliveries).
                  const isVoided = VOIDED_DELIVERY_STATUSES.includes(delivery.status);
                  const voidCls = isVoided ? 'line-through decoration-rose-400 decoration-2' : '';

                  return (
                    <tr 
                      key={delivery.id} 
                      className={`border-b border-slate-100 hover:bg-emerald-50/40 cursor-pointer transition-colors ${isVoided ? 'opacity-60 bg-rose-50/30' : ''}`}
                      onClick={() => viewDeliveryDetail(delivery.id)}
                      data-testid={`delivery-row-${delivery.id}`}
                    >
                      {/* Delivery # and Date */}
                      <td className="p-3">
                        <button 
                          className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                          onClick={(e) => { e.stopPropagation(); viewDeliveryDetail(delivery.id); }}
                        >
                          {delivery.delivery_number}
                        </button>
                        <div className="mt-0.5 flex items-center gap-1">
                          <p className="text-xs text-slate-500">
                            {new Date(delivery.delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                          <Popover open={openDatePickerId === delivery.id} onOpenChange={(o) => setOpenDatePickerId(o ? delivery.id : null)}>
                            <PopoverTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                disabled={savingDateId === delivery.id}
                                className="rounded p-0.5 text-slate-400 hover:bg-emerald-100 hover:text-emerald-700 transition-colors disabled:opacity-50"
                                title="Edit delivery date"
                                data-testid={`edit-delivery-date-${delivery.id}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start" onClick={(e) => e.stopPropagation()}>
                              <div className="border-b px-3 py-2 text-xs text-slate-500">
                                Set the planned <span className="font-medium text-slate-700">delivery date</span> (used for date grouping).
                              </div>
                              <DatePicker
                                mode="single"
                                selected={delivery.delivery_date ? new Date(String(delivery.delivery_date).slice(0, 10) + 'T00:00:00') : undefined}
                                defaultMonth={delivery.delivery_date ? new Date(String(delivery.delivery_date).slice(0, 10) + 'T00:00:00') : undefined}
                                onSelect={(d) => updateDeliveryDate(delivery.id, d)}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </td>
                      
                      {/* Account */}
                      <td className="p-3">
                        <p className="font-medium text-slate-700">{delivery.account_name}</p>
                        <p className="text-xs text-slate-500">{delivery.account_city || ''}</p>
                        {delivery.distributor_location_name && (
                          <span
                            className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                            data-testid={`delivery-warehouse-${delivery.id}`}
                          >
                            <Factory className="h-3 w-3" />
                            {delivery.distributor_location_name}
                          </span>
                        )}
                      </td>
                      
                      {/* Items Count */}
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center justify-center bg-slate-100 text-slate-700 text-sm font-medium px-2.5 py-1 rounded-full">
                          {items.length} {items.length === 1 ? 'item' : 'items'}
                        </span>
                      </td>
                      
                      {/* Customer: Billing */}
                      <td className="p-3 text-right bg-blue-50/20">
                        <span className={`font-medium text-slate-800 ${voidCls}`}>
                          ₹{customerBilling.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      
                      {/* Customer: Return Credit */}
                      <td className="p-3 text-right bg-blue-50/20">
                        {hasCreditNotes ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="inline-flex items-center bg-emerald-100 text-emerald-700 text-xs font-medium px-2 py-0.5 rounded-full">
                              {appliedCreditNotes.length} CN
                            </span>
                            <span className={`text-emerald-600 font-medium ${voidCls}`}>
                              -₹{totalCreditApplied.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">—</span>
                        )}
                      </td>
                      
                      {/* Customer: Net Billing */}
                      <td className="p-3 text-right bg-blue-50/20">
                        <span className={`font-bold ${hasCreditNotes ? 'text-blue-600' : 'text-slate-700'} ${voidCls}`}>
                          ₹{netCustomerBilling.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      
                      {/* Distributor: Margin Amount */}
                      <td className="p-3 text-right bg-purple-50/20">
                        <span className={`font-medium text-purple-600 ${voidCls}`}>
                          ₹{totalMarginAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      
                      {/* Distributor: Billable (before credit) */}
                      <td className="p-3 text-right bg-purple-50/20">
                        <span className={`text-slate-700 ${voidCls}`}>
                          ₹{totalActualBillable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      
                      {/* Distributor: Net Billable (after credit) */}
                      <td className="p-3 text-right bg-purple-50/20">
                        <span className={`font-bold text-purple-700 ${voidCls}`}>
                          ₹{finalBillableToDist.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        {hasCreditNotes && (
                          <p className="text-xs text-purple-500 mt-0.5">(after CN)</p>
                        )}
                      </td>
                      
                      {/* Status */}
                      <td className="p-3 text-center">
                        {getDeliveryStatusBadge(delivery.status)}
                      </td>
                      
                      {/* Actions */}
                      <td className="p-3 text-center">
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
                          {canManage && onReverseDelivery && !['cancelled', 'reversed'].includes(delivery.status) && !delivery.settlement_id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:bg-rose-50"
                              onClick={(e) => { e.stopPropagation(); onReverseDelivery(delivery); }}
                              data-testid={`reverse-delivery-row-${delivery.id}`}
                              title="Reverse delivery (re-adds stock)"
                            >
                              <RotateCcw className="h-4 w-4 text-rose-600" />
                            </Button>
                          )}
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
                    {isOpen && (() => {
                      const gt = sumDeliveries(group.items);
                      const liveCount = group.items.filter((d) => !VOIDED_DELIVERY_STATUSES.includes(d.status)).length;
                      const voidedCount = group.items.length - liveCount;
                      return (
                        <tr className="border-b-2 border-emerald-200 bg-emerald-50/50 text-sm" data-testid={`delivery-date-subtotal-${group.key}`}>
                          <td className="px-3 py-2 font-semibold text-emerald-800" colSpan="2">
                            Subtotal · {group.label}
                          </td>
                          <td className="px-3 py-2 text-center font-medium text-slate-600">{liveCount} {liveCount === 1 ? 'delivery' : 'deliveries'}{voidedCount > 0 ? ` · ${voidedCount} reversed` : ''}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800 bg-blue-50/30">₹{fmtINR(gt.billing)}</td>
                          <td className="px-3 py-2 text-right font-medium text-emerald-600 bg-blue-50/30">{gt.credit > 0 ? `-₹${fmtINR(gt.credit)}` : '—'}</td>
                          <td className="px-3 py-2 text-right font-bold text-blue-700 bg-blue-50/30">₹{fmtINR(gt.netBilling)}</td>
                          <td className="px-3 py-2 text-right font-medium text-purple-600 bg-purple-50/30">₹{fmtINR(gt.margin)}</td>
                          <td className="px-3 py-2 text-right text-slate-700 bg-purple-50/30">₹{fmtINR(gt.billable)}</td>
                          <td className="px-3 py-2 text-right font-bold text-purple-700 bg-purple-50/30">₹{fmtINR(gt.netBillable)}</td>
                          <td className="px-3 py-2"></td>
                          <td className="px-3 py-2"></td>
                        </tr>
                      );
                    })()}
                  </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-emerald-300 bg-emerald-50/70 font-semibold" data-testid="deliveries-totals-row">
                  <td className="p-3 text-slate-700" colSpan="2">
                    Totals{totalPages > 1 ? ' (this page)' : ''} · {deliveries.filter((d) => !VOIDED_DELIVERY_STATUSES.includes(d.status)).length} {deliveries.filter((d) => !VOIDED_DELIVERY_STATUSES.includes(d.status)).length === 1 ? 'delivery' : 'deliveries'}
                  </td>
                  <td className="p-3 text-center text-slate-700" data-testid="totals-items">{deliveryTotals.items}</td>
                  <td className="p-3 text-right bg-blue-50/40 text-slate-800" data-testid="totals-billing">₹{fmtINR(deliveryTotals.billing)}</td>
                  <td className="p-3 text-right bg-blue-50/40 text-emerald-700" data-testid="totals-return-credit">
                    {deliveryTotals.credit > 0 ? `-₹${fmtINR(deliveryTotals.credit)}` : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="p-3 text-right bg-blue-50/40 text-blue-700 font-bold" data-testid="totals-net-billing">₹{fmtINR(deliveryTotals.netBilling)}</td>
                  <td className="p-3 text-right bg-purple-50/40 text-purple-600" data-testid="totals-margin">₹{fmtINR(deliveryTotals.margin)}</td>
                  <td className="p-3 text-right bg-purple-50/40 text-slate-700" data-testid="totals-billable">₹{fmtINR(deliveryTotals.billable)}</td>
                  <td className="p-3 text-right bg-purple-50/40 text-purple-700 font-bold" data-testid="totals-net-billable">₹{fmtINR(deliveryTotals.netBillable)}</td>
                  <td className="p-3" colSpan="2"></td>
                </tr>
              </tfoot>
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

    {/* Section 1b: Promotional / Non-sale Stock-Out (Delivery Challan) */}
    <PromoDispatchSection
      distributor={distributor}
      canManage={canManage}
      API_URL={API_URL}
      token={token}
      skus={skus}
    />

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
                    <DialogDescription>Return stock from distributor back to factory</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Source — Primary Selection */}
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">Stock Source *</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setFactoryForm(f => ({ ...f, source: 'warehouse', reason: 'expired', reason_id: '', reason_name: '', customer_return_id: '' }))}
                          className={`p-4 border-2 rounded-lg text-left transition-all ${factoryForm.source === 'warehouse' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}
                          data-testid="factory-source-warehouse"
                        >
                          <Package className="h-5 w-5 mb-1 text-amber-600" />
                          <p className="font-semibold text-sm">Warehouse Stock</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Expired or damaged stock from warehouse. Adjusted in settlement.</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFactoryForm(f => ({ ...f, source: 'customer_return', reason: 'empty_reusable', reason_id: '', reason_name: '', customer_return_id: '' }))}
                          className={`p-4 border-2 rounded-lg text-left transition-all ${factoryForm.source === 'customer_return' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                          data-testid="factory-source-customer"
                        >
                          <Truck className="h-5 w-5 mb-1 text-blue-600" />
                          <p className="font-semibold text-sm">Customer Return</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Forward customer returns to factory. Already settled via credit notes.</p>
                        </button>
                      </div>
                    </div>

                    {/* Reason — Pulled from Master Return Reasons */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Reason *</Label>
                        <select
                          value={factoryForm.reason_id || ''}
                          onChange={(e) => {
                            const reasonId = e.target.value;
                            const reason = filteredReasons.find(r => r.id === reasonId);
                            setFactoryForm(f => ({
                              ...f,
                              reason_id: reasonId,
                              reason_name: reason?.reason_name || '',
                              reason: reason?.category || f.reason
                            }));
                          }}
                          className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                          data-testid="factory-reason-select"
                        >
                          <option value="">Select Reason</option>
                          {filteredReasons.map(reason => (
                            <option key={reason.id} value={reason.id}>
                              {reason.reason_name}
                            </option>
                          ))}
                        </select>
                        {filteredReasons.length === 0 && (
                          <p className="text-xs text-amber-600">
                            No active return reasons configured. Add them in Settings → Returns.
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Return Date</Label>
                        <Input
                          type="date"
                          value={factoryForm.return_date}
                          onChange={(e) => setFactoryForm(f => ({ ...f, return_date: e.target.value }))}
                        />
                      </div>
                    </div>

                    {/* Location */}
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

                    {/* Settlement Info Banner */}
                    {factoryForm.source === 'warehouse' ? (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-amber-800">This return will be <strong>adjusted in settlement</strong> — factory reimburses distributor at transfer price (billed price).</p>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm">
                        <Receipt className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                        <p className="text-blue-800"><strong>No additional settlement</strong> — customer returns are already accounted for via credit notes. This tracks the physical return to factory.</p>
                      </div>
                    )}
                    
                    {/* Items */}
                    <div className="space-y-2">
                      <Label>Items *</Label>
                      <div className="space-y-2">
                        {factoryItems.map((item, idx) => {
                          const cap = item.sku_id ? skuCap(item.sku_id) : null;
                          const overLimit = cap !== null && item.quantity > cap;
                          return (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <select
                                value={item.sku_id}
                                onChange={(e) => {
                                  const updated = [...factoryItems];
                                  updated[idx].sku_id = e.target.value;
                                  // Snap quantity down to cap if needed
                                  const newCap = skuCap(e.target.value);
                                  if (newCap > 0 && updated[idx].quantity > newCap) {
                                    updated[idx].quantity = newCap;
                                  }
                                  setFactoryItems(updated);
                                }}
                                className="flex-1 text-sm border rounded-md px-3 py-2 bg-background"
                                data-testid={`factory-sku-select-${idx}`}
                              >
                                <option value="">Select SKU</option>
                                {marginSkus.map(sku => {
                                  const skuStock = availableStock[sku.id];
                                  const availLabel = skuStock
                                    ? ` — Available: ${factoryForm.source === 'customer_return' ? skuStock.customer_pending_factory : skuStock.warehouse_available}`
                                    : ' — Available: 0';
                                  return (
                                    <option key={sku.id} value={sku.id}>
                                      {sku.sku_name}{sku.transfer_price ? ` (TP: ₹${sku.transfer_price})` : ''}{availLabel}
                                    </option>
                                  );
                                })}
                              </select>
                              <Input
                                type="number"
                                min="1"
                                max={cap || undefined}
                                value={item.quantity}
                                onChange={(e) => {
                                  const updated = [...factoryItems];
                                  updated[idx].quantity = parseInt(e.target.value) || 1;
                                  setFactoryItems(updated);
                                }}
                                className={`w-24 ${overLimit ? 'border-red-500 focus-visible:ring-red-400' : ''}`}
                                placeholder="Qty"
                                data-testid={`factory-qty-input-${idx}`}
                              />
                              {factoryItems.length > 1 && (
                                <Button variant="ghost" size="sm" onClick={() => setFactoryItems(factoryItems.filter((_, i) => i !== idx))}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              )}
                            </div>
                            {item.sku_id && (
                              <p className={`text-xs pl-1 ${overLimit ? 'text-red-600 font-medium' : 'text-muted-foreground'}`} data-testid={`factory-qty-hint-${idx}`}>
                                {overLimit
                                  ? `Exceeds available ${factoryForm.source === 'customer_return' ? 'customer-return' : 'warehouse'} stock (${cap}). Reduce quantity.`
                                  : `Max ${cap} available at this distributor (${factoryForm.source === 'customer_return' ? 'pending customer returns' : 'warehouse stock'}).`}
                              </p>
                            )}
                          </div>
                          );
                        })}
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
                      disabled={savingFactory || !factoryForm.distributor_location_id || !factoryForm.reason_id || factoryItems.every(i => !i.sku_id) || factoryItems.some(i => i.sku_id && i.quantity > skuCap(i.sku_id))}
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
                  <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Source</th>
                  <th className="text-left p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Location</th>
                  <th className="text-center p-3 font-semibold text-amber-700 uppercase tracking-wider text-xs">Reason</th>
                  <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Items</th>
                  <th className="text-right p-3 font-semibold text-blue-700 uppercase tracking-wider text-xs">Transfer Price Credit</th>
                  <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Settlement</th>
                  <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Status</th>
                  <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {factoryReturns.map((fr) => {
                  const isSettlement = fr.requires_settlement || fr.source === 'warehouse';
                  const reasonLabels = { expired: 'Expired', damaged: 'Damaged', empty_reusable: 'Empty / Reusable' };
                  const reasonColors = { expired: 'bg-orange-100 text-orange-700', damaged: 'bg-red-100 text-red-700', empty_reusable: 'bg-sky-100 text-sky-700' };
                  return (
                  <tr key={fr.id} className="border-b border-slate-100 hover:bg-amber-50/40 transition-colors" data-testid={`factory-return-row-${fr.id}`}>
                    <td className="p-3">
                      <span className="font-semibold text-amber-700">{fr.return_number}</span>
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(fr.return_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </td>
                    <td className="p-3 text-center">
                      <Badge className={fr.source === 'warehouse' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}>
                        {fr.source === 'warehouse' ? 'Warehouse' : 'Customer'}
                      </Badge>
                    </td>
                    <td className="p-3 text-slate-700 text-sm">{fr.distributor_location_name}</td>
                    <td className="p-3 text-center">
                      <Badge className={reasonColors[fr.reason] || 'bg-slate-100 text-slate-700'}>
                        {fr.reason_name || reasonLabels[fr.reason] || fr.reason}
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
                    <td className="p-3 text-center">
                      {isSettlement ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
                          <AlertTriangle className="h-3 w-3" /> Adjustable
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Tracking only</span>
                      )}
                    </td>
                    <td className="p-3 text-center">{getFactoryStatusBadge(fr.status)}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {fr.status === 'draft' && canManage && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleFactoryAction(fr.id, 'confirm')} data-testid={`confirm-factory-${fr.id}`}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteFactoryReturn(fr.id)} data-testid={`delete-factory-${fr.id}`}>
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
                        {(fr.status === 'received' || fr.status === 'cancelled') && !canDelete && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {canDelete && fr.status !== 'draft' && (
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteFactoryReturn(fr.id)} data-testid={`delete-factory-${fr.id}`} title="Delete">
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
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
      </CollapsibleContent>
    </Card>
    </Collapsible>
    </div>
  );
}
