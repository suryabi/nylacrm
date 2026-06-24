import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { toast } from 'sonner';
import {
  Plus, Trash2, Gift, RefreshCw, Package, FileText, X, Download, ChevronDown,
  AlertCircle, Settings2, Users, Ban, ShieldCheck, CheckCircle2, Undo2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { groupByDateDesc } from '../../utils/dateGrouping';
import { Calendar } from 'lucide-react';
import BatchPickerCards from './BatchPickerCards';

const ADMIN_ROLES = ['CEO', 'Director', 'Admin', 'admin', 'Super Admin', 'super_admin', 'System Admin'];
const NON_EMPLOYEE_ROLES = ['Distributor', 'Driver'];  // not internal staff — excluded from Employee picker

let _rowSeq = 0;
const newItem = () => ({ id: `pi-${++_rowSeq}`, sku_id: '', sku_name: '', quantity: 1, unit_price: 0, batch_id: '', batch_code: '', packaging_type_id: '', packaging_type_name: '', units_per_package: null });
const fmtINR = (n) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PromoDispatchSection({
  distributor,
  canManage,
  API_URL,
  token,
  skus = [],
}) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes((user?.role || '').trim());

  const [open, setOpen] = useState(true);
  // Per-date-group open/close state — defaults to Today-only expanded.
  const [openDateGroups, setOpenDateGroups] = useState({});
  const toggleDateGroup = (key) => setOpenDateGroups(prev => ({ ...prev, [key]: !(prev[key] ?? false) }));
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [retryingId, setRetryingId] = useState(null);

  // Create dialog
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [recipientType, setRecipientType] = useState('contact');  // 'contact' | 'lead'
  const [leads, setLeads] = useState([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [reasons, setReasons] = useState([]);
  // Batches available per SKU at the promo dialog's *selected* From-Location.
  const [batchMap, setBatchMap] = useState({});
  const distributorLocations = useMemo(
    () => (distributor?.locations || []).filter(l => l.status === 'active'),
    [distributor],
  );
  const [form, setForm] = useState({
    distributor_location_id: '',
    reason: '',
    delivery_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    vehicle_number: '',
    driver_name: '',
    driver_contact: '',
    delivery_address: '',
    remarks: '',
  });
  const selectedLoc = useMemo(
    () => distributorLocations.find(l => l.id === form.distributor_location_id),
    [distributorLocations, form.distributor_location_id],
  );
  const locTracksBatches = !!selectedLoc?.track_batches;

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(u =>
      [u.name, u.role, u.email].filter(Boolean).some(v => v.toLowerCase().includes(q)));
  }, [employees, employeeSearch]);
  const [items, setItems] = useState([newItem()]);

  // Reasons manager dialog
  const [showReasonsMgr, setShowReasonsMgr] = useState(false);
  const [newReasonName, setNewReasonName] = useState('');

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchDispatches = useCallback(async () => {
    if (!distributor?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/promo-deliveries`, { headers: authHeaders, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDispatches(data.dispatches || []);
      }
    } catch (err) {
      console.error('Error fetching promo dispatches:', err);
    } finally {
      setLoading(false);
    }
  }, [distributor?.id, API_URL, authHeaders]);

  useEffect(() => { if (open) fetchDispatches(); }, [open, fetchDispatches]);

  const fetchReasons = useCallback(async (includeInactive = false) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/promo-reasons${includeInactive ? '?include_inactive=true' : ''}`, { headers: authHeaders, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setReasons(data.reasons || []);
      }
    } catch (err) {
      console.error('Error fetching promo reasons:', err);
    }
  }, [API_URL, authHeaders]);

  const fetchContacts = useCallback(async (search = '') => {
    try {
      const qs = `page=1&page_size=50${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(`${API_URL}/api/contacts?${qs}`, { headers: authHeaders, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch (err) {
      console.error('Error fetching contacts:', err);
    }
  }, [API_URL, authHeaders]);

  const fetchLeads = useCallback(async (search = '') => {
    try {
      const qs = `page=1&page_size=50${search ? `&search=${encodeURIComponent(search)}` : ''}`;
      const res = await fetch(`${API_URL}/api/leads?${qs}`, { headers: authHeaders, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLeads(data.data || data.leads || []);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    }
  }, [API_URL, authHeaders]);

  // Internal employees only (sales team / staff) — excludes Distributor & Driver
  // roles. /api/users has no search param, so we fetch once and filter locally.
  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/users?is_active=true`, { headers: authHeaders, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.users || []);
        setEmployees(list.filter(u => !NON_EMPLOYEE_ROLES.includes((u.role || '').trim())));
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
  }, [API_URL, authHeaders]);

  // Load reasons + recipients when the create dialog opens
  useEffect(() => {
    if (showDialog) {
      fetchReasons(false);
      fetchContacts('');
      fetchLeads('');
      fetchEmployees();
      // auto-select the only location
      if (distributorLocations.length === 1) {
        setForm(f => ({ ...f, distributor_location_id: distributorLocations[0].id }));
      }
    }
  }, [showDialog, fetchReasons, fetchContacts, fetchLeads, fetchEmployees, distributorLocations]);

  // Debounced contact search
  useEffect(() => {
    if (!showDialog || recipientType !== 'contact' || selectedContact) return;
    const t = setTimeout(() => fetchContacts(contactSearch), 300);
    return () => clearTimeout(t);
  }, [contactSearch, showDialog, recipientType, selectedContact, fetchContacts]);

  // Debounced lead search
  useEffect(() => {
    if (!showDialog || recipientType !== 'lead' || selectedLead) return;
    const t = setTimeout(() => fetchLeads(leadSearch), 300);
    return () => clearTimeout(t);
  }, [leadSearch, showDialog, recipientType, selectedLead, fetchLeads]);

  // 🐛 FIX: batches are scoped to the source `distributor_location_id`.
  // Reset the cache whenever the user changes location so the picker
  // refetches batches for the new warehouse instead of showing stale data.
  useEffect(() => {
    setBatchMap({});
  }, [form.distributor_location_id]);

  // Fetch available batches for the *selected From-Location* whenever it or the
  // chosen SKUs change. We always fetch (regardless of the location's
  // `track_batches` flag) so the picker shows up automatically whenever there
  // are real batches with stock for that SKU at that warehouse — even if the
  // admin never flipped the `track_batches` toggle on that location. This fixes
  // the case where one warehouse (e.g. Hyderabad) shows batches but another
  // (e.g. Gurgaon) silently hides them because of a stale config flag.
  useEffect(() => {
    if (!showDialog || !form.distributor_location_id) return;
    const skuIds = [...new Set(items.map(i => i.sku_id).filter(Boolean))];
    const missing = skuIds.filter(sid => !(sid in batchMap));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(async (sid) => {
      try {
        const res = await fetch(
          `${API_URL}/api/distributor/stock-transfers/batches-available?location_id=${form.distributor_location_id}&sku_id=${sid}`,
          { headers: authHeaders, credentials: 'include' },
        );
        if (res.ok) {
          const d = await res.json();
          return [sid, d.batches || []];
        }
      } catch (err) {
        console.error('Error fetching batches:', err);
      }
      return [sid, []];
    })).then((entries) => {
      if (cancelled) return;
      setBatchMap(prev => {
        const next = { ...prev };
        entries.forEach(([sid, b]) => { next[sid] = b; });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [showDialog, form.distributor_location_id, items, batchMap, API_URL, authHeaders]);

  const resetForm = () => {
    setRecipientType('contact');
    setSelectedContact(null);
    setContactSearch('');
    setSelectedLead(null);
    setLeadSearch('');
    setSelectedEmployee(null);
    setEmployeeSearch('');
    setBatchMap({});
    setItems([newItem()]);
    setForm({
      distributor_location_id: distributorLocations.length === 1 ? distributorLocations[0].id : '',
      reason: '',
      delivery_date: new Date().toISOString().split('T')[0],
      reference_number: '',
      vehicle_number: '',
      driver_name: '',
      driver_contact: '',
      delivery_address: '',
      remarks: '',
    });
  };

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
  };

  const onSelectSku = (id, skuId) => {
    const master = skus.find(s => s.id === skuId);
    // Use the SKU's `packaging_config.promo_stock_out` to pre-select the
    // default packaging (e.g. "Crate - 12"). Falls back to nothing — the
    // dropdown then guides the rep to pick one explicitly.
    const pkgs = master?.packaging_config?.promo_stock_out || [];
    const defPkg = pkgs.find(p => p.is_default) || pkgs[0] || null;
    const upp = defPkg?.units_per_package || 1;
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      // Per-bottle indicative price from the SKU master, scaled to the chosen
      // packaging size (e.g. ₹112/bottle × 24 bottles/crate = ₹2,688/crate).
      const perBottle = master ? (master.mrp ?? master.base_price ?? 0) : 0;
      return {
        ...it,
        sku_id: skuId,
        sku_name: master?.sku_name || master?.name || it.sku_name,
        unit_price: Math.round((perBottle || 0) * upp * 100) / 100,
        batch_id: '',
        batch_code: '',
        packaging_type_id: defPkg?.packaging_type_id || '',
        packaging_type_name: defPkg?.packaging_type_name || '',
        units_per_package: defPkg?.units_per_package || null,
      };
    }));
  };

  const totalQty = items.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0);
  const totalValue = items.reduce((s, i) => s + (parseInt(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);

  // Whether the batch picker should appear for a given row. We show it when
  // either (a) the source location has track_batches=true (admin enforced), or
  // (b) the source location actually has batches with stock for the chosen SKU
  // (data-driven — handles warehouses where the flag was never flipped).
  const skuHasBatches = (skuId) => (batchMap[skuId] || []).length > 0;
  const isBatchRequiredForRow = (row) => locTracksBatches || skuHasBatches(row.sku_id);
  const itemsValid = items.length > 0 && items.every(i =>
    i.sku_id && (parseInt(i.quantity) || 0) > 0 && (!isBatchRequiredForRow(i) || i.batch_id));
  const recipientChosen = recipientType === 'lead' ? !!selectedLead
    : recipientType === 'employee' ? !!selectedEmployee
    : !!selectedContact;
  const canSubmit = recipientChosen && !!form.distributor_location_id && !!form.reason && itemsValid;

  const handleCreate = async (asDraft = false) => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const payload = {
        distributor_location_id: form.distributor_location_id,
        recipient_type: recipientType,
        contact_id: recipientType === 'contact' ? selectedContact.id : null,
        lead_id: recipientType === 'lead' ? selectedLead.id : null,
        employee_id: recipientType === 'employee' ? selectedEmployee.id : null,
        delivery_date: form.delivery_date,
        reason: form.reason,
        reference_number: form.reference_number || null,
        vehicle_number: form.vehicle_number || null,
        driver_name: form.driver_name || null,
        driver_contact: form.driver_contact || null,
        delivery_address: form.delivery_address || null,
        remarks: form.remarks || null,
        as_draft: asDraft,
        items: items.filter(i => i.sku_id && (parseInt(i.quantity) || 0) > 0).map(i => ({
          sku_id: i.sku_id,
          sku_name: i.sku_name,
          quantity: parseInt(i.quantity),
          unit_price: parseFloat(i.unit_price) || 0,
          batch_id: (i.batch_id && i.batch_id !== '__legacy__') ? i.batch_id : null,
          batch_code: i.batch_code || null,
          packaging_type_id: i.packaging_type_id || null,
          packaging_type_name: i.packaging_type_name || null,
          units_per_package: i.units_per_package ?? null,
        })),
      };
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/promo-deliveries`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || (asDraft ? 'Draft saved' : 'Delivery Challan generated'));
        setShowDialog(false);
        resetForm();
        fetchDispatches();
      } else {
        toast.error(data.detail || 'Failed to create promo dispatch');
      }
    } catch (err) {
      console.error('Error creating promo dispatch:', err);
      toast.error('Network error while creating promo dispatch');
    } finally {
      setSaving(false);
    }
  };

  // Lifecycle actions ──────────────────────────────────────────────
  const [actingId, setActingId] = useState(null);

  const confirmDispatch = async (dispatch) => {
    if (!window.confirm(`Confirm ${dispatch.challan_number}? This reserves the stock (deducted on delivery) and generates the Zoho delivery challan.`)) return;
    setActingId(dispatch.id);
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/promo-deliveries/${dispatch.id}/confirm`,
        { method: 'POST', headers: authHeaders, credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.detail || 'Failed to confirm'); }
      else { toast.success(body.message || 'Confirmed'); fetchDispatches(); }
    } catch { toast.error('Network error while confirming'); }
    finally { setActingId(null); }
  };

  const completeDispatch = async (dispatch) => {
    if (!window.confirm(`Mark ${dispatch.challan_number} as delivered? This deducts the reserved stock from inventory and completes the stock-out.`)) return;
    setActingId(dispatch.id);
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/promo-deliveries/${dispatch.id}/complete`,
        { method: 'POST', headers: authHeaders, credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.detail || 'Failed to complete'); }
      else { toast.success(body.message || 'Completed'); fetchDispatches(); }
    } catch { toast.error('Network error while completing'); }
    finally { setActingId(null); }
  };

  const reverseDispatch = async (dispatch) => {
    const isLegacy = dispatch.is_legacy;
    const stockMsg = isLegacy ? 'Stock will be added back to inventory' : 'The reserved stock will be released back to inventory';
    if (!window.confirm(`Reverse ${dispatch.challan_number}? ${stockMsg} and the Zoho delivery challan will be deleted. This cannot be undone.`)) return;
    setActingId(dispatch.id);
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/promo-deliveries/${dispatch.id}/reverse`,
        { method: 'POST', headers: authHeaders, credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.detail || 'Failed to reverse'); }
      else { (body.zoho_cleanup_pending ? toast.warning : toast.success)(body.message || 'Reversed'); fetchDispatches(); }
    } catch { toast.error('Network error while reversing'); }
    finally { setActingId(null); }
  };

  const retryZohoCleanup = async (dispatch) => {
    setActingId(dispatch.id);
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/promo-deliveries/${dispatch.id}/reverse-zoho-cleanup`,
        { method: 'POST', headers: authHeaders, credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.detail || 'Zoho cleanup failed'); }
      else { toast.success(body.message || 'Zoho challan deleted'); fetchDispatches(); }
    } catch { toast.error('Network error during Zoho cleanup'); }
    finally { setActingId(null); }
  };

  const deleteDispatch = async (dispatch) => {
    const label = dispatch.status === 'draft' ? 'Delete this draft?' : `Permanently delete reversed stock-out ${dispatch.challan_number}? This removes it from the list.`;
    if (!window.confirm(label)) return;
    setActingId(dispatch.id);
    try {
      const res = await fetch(`${API_URL}/api/distributors/${distributor.id}/promo-deliveries/${dispatch.id}`,
        { method: 'DELETE', headers: authHeaders, credentials: 'include' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.detail || 'Failed to delete'); }
      else { toast.success('Deleted'); fetchDispatches(); }
    } catch { toast.error('Network error while deleting'); }
    finally { setActingId(null); }
  };

  const downloadChallan = async (dispatch) => {
    setDownloadingId(dispatch.id);
    try {
      const res = await fetch(
        `${API_URL}/api/distributors/${distributor.id}/promo-deliveries/${dispatch.id}/challan-pdf`,
        { headers: authHeaders, credentials: 'include' },
      );
      if (!res.ok) {
        toast.error('Failed to download challan');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('Error downloading challan:', err);
      toast.error('Failed to download challan');
    } finally {
      setDownloadingId(null);
    }
  };

  const retryZohoSync = async (dispatch) => {
    setRetryingId(dispatch.id);
    try {
      const res = await fetch(
        `${API_URL}/api/distributors/${distributor.id}/promo-deliveries/${dispatch.id}/retry-zoho`,
        { method: 'POST', headers: authHeaders, credentials: 'include' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.detail || 'Zoho retry failed');
      } else {
        toast.success(`Synced to Zoho as ${body.zoho_doc_number || 'delivery challan'}`);
        fetchDispatches();
      }
    } catch (err) {
      console.error('Error retrying Zoho sync:', err);
      toast.error('Zoho retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  // Reasons manager
  const addReason = async () => {
    const name = newReasonName.trim();
    if (!name) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/promo-reasons`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewReasonName('');
        fetchReasons(true);
        toast.success('Reason added');
      } else {
        toast.error(data.detail || 'Failed to add reason');
      }
    } catch (err) {
      toast.error('Network error');
    }
  };

  const toggleReason = async (reason) => {
    try {
      if (reason.is_active) {
        await fetch(`${API_URL}/api/admin/promo-reasons/${reason.id}`, { method: 'DELETE', headers: authHeaders, credentials: 'include' });
      } else {
        await fetch(`${API_URL}/api/admin/promo-reasons/${reason.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: true }),
        });
      }
      fetchReasons(true);
    } catch (err) {
      toast.error('Failed to update reason');
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-row items-center justify-between">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-left hover:text-emerald-700 transition-colors" data-testid="promo-section-trigger">
                <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Gift className="h-5 w-5 text-fuchsia-600" />
                    Promotional Stock-Out (Delivery Challan)
                  </CardTitle>
                  <CardDescription>Non-sale dispatches to Contacts, Leads or Employees — deducts stock, generates a challan. No invoice, no billing.</CardDescription>
                </div>
              </button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant="outline"
                  onClick={() => { setShowReasonsMgr(true); fetchReasons(true); }}
                  data-testid="manage-promo-reasons-btn"
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  Reasons
                </Button>
              )}
              {canManage && (
                <Button
                  className="bg-fuchsia-600 hover:bg-fuchsia-700"
                  onClick={() => { resetForm(); setShowDialog(true); }}
                  data-testid="create-promo-dispatch-btn"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Promo Stock-Out
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent>
            <div className="flex items-center justify-end mb-3">
              <span className="text-sm text-muted-foreground mr-2">Total: <span className="font-medium">{dispatches.length}</span> challans</span>
              <Button variant="ghost" size="sm" onClick={fetchDispatches}><RefreshCw className="h-4 w-4" /></Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : dispatches.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground" data-testid="promo-empty-state">
                <Gift className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No promotional dispatches recorded</p>
                <p className="text-sm">Hand out free / promo goods to Contacts without raising an invoice.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm" data-testid="promo-dispatches-table">
                  <thead>
                    <tr className="border-b-2 border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 to-slate-50">
                      <th className="text-left p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Challan #</th>
                      <th className="text-left p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Contact</th>
                      <th className="text-center p-3 font-semibold text-fuchsia-700 uppercase tracking-wider text-xs">Reason</th>
                      <th className="text-left p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">From</th>
                      <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Crates</th>
                      <th className="text-right p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Indicative Value</th>
                      <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Status</th>
                      <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Zoho</th>
                      <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Challan</th>
                      <th className="text-center p-3 font-semibold text-slate-700 uppercase tracking-wider text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupByDateDesc(dispatches, (d) => d.delivery_date).map((group) => {
                      const isOpen = openDateGroups[group.key] ?? group.isToday;
                      return (
                      <React.Fragment key={group.key}>
                        <tr
                          className={`border-y cursor-pointer ${group.isToday ? 'bg-emerald-100/80 border-emerald-300' : group.isTomorrow ? 'bg-amber-100/80 border-amber-300' : 'bg-slate-50 border-slate-200'}`}
                          data-testid={`promo-date-group-${group.key}`}
                          onClick={() => toggleDateGroup(group.key)}
                        >
                          <td colSpan="10" className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'} ${group.isToday ? 'text-emerald-700' : group.isTomorrow ? 'text-amber-700' : 'text-slate-400'}`} />
                              <Calendar className={`h-3.5 w-3.5 ${group.isToday ? 'text-emerald-700' : group.isTomorrow ? 'text-amber-700' : 'text-slate-400'}`} />
                              <span className={`text-xs font-bold uppercase tracking-wider ${group.isToday ? 'text-emerald-800' : group.isTomorrow ? 'text-amber-800' : 'text-slate-600'}`}>{group.label}</span>
                              {(group.isToday || group.isTomorrow) && (
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${group.isToday ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>Scheduling</span>
                              )}
                              {group.isFuture && (
                                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-sky-100 text-sky-700 border border-sky-200" data-testid={`promo-future-pill-${group.key}`}>Future</span>
                              )}
                              {group.isPast && (
                                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600 border border-slate-300" data-testid={`promo-past-pill-${group.key}`}>Past</span>
                              )}
                              <span className="text-[11px] font-normal text-slate-400">· {group.items.length} {group.items.length === 1 ? 'challan' : 'challans'}</span>
                            </div>
                          </td>
                        </tr>
                        {isOpen && group.items.map((d) => (
                      <tr key={d.id} className={`border-b border-slate-100 transition-colors ${d.status === 'reversed' ? 'opacity-60 bg-slate-50' : 'hover:bg-fuchsia-50/40'}`} data-testid={`promo-dispatch-row-${d.id}`}>
                        <td className="p-3">
                          <span className="font-semibold text-fuchsia-700">{d.challan_number}</span>
                          <p className="text-xs text-slate-500 mt-0.5">{d.delivery_date ? new Date(d.delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</p>
                        </td>
                        <td className="p-3">
                          <p className="font-medium text-slate-800">{d.contact_name}</p>
                          {d.contact_company && <p className="text-xs text-slate-500">{d.contact_company}</p>}
                        </td>
                        <td className="p-3 text-center">
                          <Badge className="bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200">{d.promo_reason}</Badge>
                        </td>
                        <td className="p-3 text-slate-700 text-sm">{d.location_name}</td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center justify-center bg-slate-100 text-slate-700 text-sm font-medium px-2 py-0.5 rounded-full">{d.total_quantity}</span>
                        </td>
                        <td className="p-3 text-right text-slate-700 tabular-nums">₹{fmtINR(d.total_indicative_value)}</td>
                        <td className="p-3 text-center" data-testid={`promo-status-${d.id}`}>
                          {d.status === 'draft' ? (
                            <Badge className="bg-amber-100 text-amber-700 border border-amber-200">Draft</Badge>
                          ) : d.status === 'reversed' ? (
                            <Badge className="bg-slate-200 text-slate-600 border border-slate-300">Reversed</Badge>
                          ) : (d.status === 'complete' || d.status === 'completed' || d.status === 'delivered') ? (
                            <Badge className="bg-green-100 text-green-700 border border-green-200">Delivered</Badge>
                          ) : ['delivery_assigned', 'delivery_scheduled', 'scheduled', 'on_the_way', 'in_transit'].includes(d.status) ? (
                            <Badge className="bg-blue-100 text-blue-700 border border-blue-200">Scheduled</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200">Confirmed</Badge>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {d.status === 'draft' ? (
                            <span className="text-[11px] text-slate-400">—</span>
                          ) : d.status === 'reversed' ? (
                            d.zoho_cleanup_pending ? (
                              <Button
                                variant="outline" size="sm"
                                className="h-6 text-[11px] text-amber-700 border-amber-200 hover:bg-amber-50"
                                onClick={() => retryZohoCleanup(d)}
                                disabled={actingId === d.id}
                                data-testid={`zoho-cleanup-${d.id}`}
                                title={d.zoho_cleanup_error || 'Zoho challan deletion pending — click to retry'}
                              >
                                {actingId === d.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><AlertCircle className="h-3 w-3 mr-1" /> Cleanup</>}
                              </Button>
                            ) : (
                              <span className="text-[11px] text-slate-400 line-through">{d.zoho_doc_number || 'deleted'}</span>
                            )
                          ) : d.zoho_sync_status === 'synced' && d.zoho_doc_url ? (
                            <a
                              href={d.zoho_doc_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-2 py-0.5 rounded transition-colors"
                              data-testid={`zoho-link-${d.id}`}
                              title={d.zoho_doc_number || 'Synced to Zoho Books'}
                            >
                              <ShieldCheck className="h-3 w-3" /> {d.zoho_doc_number || 'Synced'}
                            </a>
                          ) : d.zoho_sync_status === 'failed' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[11px] text-rose-700 border-rose-200 hover:bg-rose-50"
                              onClick={() => retryZohoSync(d)}
                              disabled={retryingId === d.id}
                              data-testid={`zoho-retry-${d.id}`}
                              title={d.zoho_sync_error || 'Push failed — click to retry'}
                            >
                              {retryingId === d.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><AlertCircle className="h-3 w-3 mr-1" /> Retry</>}
                            </Button>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {d.status === 'draft' ? (
                            <span className="text-[11px] text-slate-400">—</span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadChallan(d)}
                              disabled={downloadingId === d.id}
                              data-testid={`download-challan-${d.id}`}
                            >
                              {downloadingId === d.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                              {downloadingId === d.id ? '' : 'PDF'}
                            </Button>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5">
                            {d.status === 'draft' && (
                              <>
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                                  onClick={() => confirmDispatch(d)}
                                  disabled={actingId === d.id}
                                  data-testid={`confirm-dispatch-${d.id}`}
                                >
                                  {actingId === d.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3 mr-1" /> Confirm</>}
                                </Button>
                                <Button
                                  variant="outline" size="sm"
                                  className="h-7 text-[11px] text-rose-700 border-rose-200 hover:bg-rose-50"
                                  onClick={() => deleteDispatch(d)}
                                  disabled={actingId === d.id}
                                  data-testid={`delete-dispatch-${d.id}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                            {d.status === 'dispatched' && (
                              <Button
                                variant="outline" size="sm"
                                className="h-7 text-[11px] text-orange-700 border-orange-200 hover:bg-orange-50"
                                onClick={() => reverseDispatch(d)}
                                disabled={actingId === d.id}
                                data-testid={`reverse-dispatch-${d.id}`}
                              >
                                {actingId === d.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Undo2 className="h-3 w-3 mr-1" /> Reverse</>}
                              </Button>
                            )}
                            {['confirmed', 'delivery_assigned', 'delivery_scheduled', 'scheduled', 'on_the_way', 'in_transit'].includes(d.status) && (
                              <>
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px] bg-green-600 hover:bg-green-700"
                                  onClick={() => completeDispatch(d)}
                                  disabled={actingId === d.id}
                                  data-testid={`complete-dispatch-${d.id}`}
                                  title="Mark delivered — deducts the reserved stock"
                                >
                                  {actingId === d.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3 mr-1" /> Delivered</>}
                                </Button>
                                <Button
                                  variant="outline" size="sm"
                                  className="h-7 text-[11px] text-orange-700 border-orange-200 hover:bg-orange-50"
                                  onClick={() => reverseDispatch(d)}
                                  disabled={actingId === d.id}
                                  data-testid={`reverse-dispatch-${d.id}`}
                                >
                                  {actingId === d.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <><Undo2 className="h-3 w-3 mr-1" /> Reverse</>}
                                </Button>
                              </>
                            )}
                            {d.status === 'reversed' && (
                              <Button
                                variant="outline" size="sm"
                                className="h-7 text-[11px] text-rose-700 border-rose-200 hover:bg-rose-50"
                                onClick={() => deleteDispatch(d)}
                                disabled={actingId === d.id}
                                data-testid={`delete-dispatch-${d.id}`}
                              >
                                <Trash2 className="h-3 w-3 mr-1" /> Delete
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>

      {/* Create Promo Dispatch Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-fuchsia-600" /> Promotional Stock-Out</DialogTitle>
            <DialogDescription>
              Dispatch goods to a Contact, Lead or Employee for promotion / sampling. Stock is deducted and a Delivery Challan
              (marked <span className="font-medium">"Not for Sale"</span>) is generated. No invoice is created.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
            {/* Recipient selection — Contact or Lead */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Recipient *</Label>
                <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50 gap-1" data-testid="promo-recipient-type-toggle">
                  <button
                    type="button"
                    onClick={() => setRecipientType('contact')}
                    className={`px-5 py-2.5 text-sm font-semibold rounded-md transition-colors ${recipientType === 'contact' ? 'bg-fuchsia-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-white'}`}
                    data-testid="promo-recipient-contact-btn"
                  >
                    Contact
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientType('lead')}
                    className={`px-5 py-2.5 text-sm font-semibold rounded-md transition-colors ${recipientType === 'lead' ? 'bg-fuchsia-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-white'}`}
                    data-testid="promo-recipient-lead-btn"
                  >
                    Lead
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientType('employee')}
                    className={`px-5 py-2.5 text-sm font-semibold rounded-md transition-colors ${recipientType === 'employee' ? 'bg-fuchsia-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-white'}`}
                    data-testid="promo-recipient-employee-btn"
                  >
                    Employee
                  </button>
                </div>
              </div>

              {recipientType === 'contact' ? (
                selectedContact ? (
                  <div className="flex items-center justify-between p-3 rounded-md border border-fuchsia-200 bg-fuchsia-50/60" data-testid="promo-selected-contact">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{selectedContact.name}</p>
                      <p className="text-sm text-slate-600">
                        {[selectedContact.company, selectedContact.city, selectedContact.phone].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedContact(null); setContactSearch(''); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="Search contacts by name, company, phone..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      data-testid="promo-contact-search"
                    />
                    <div className="border rounded-md max-h-[180px] overflow-y-auto">
                      {contacts.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No contacts found</p>
                        </div>
                      ) : (
                        contacts.map((c) => (
                          <div
                            key={c.id}
                            className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0 transition-colors"
                            onClick={() => {
                              setSelectedContact(c);
                              setForm(prev => ({ ...prev, delivery_address: prev.delivery_address || [c.address, c.city, c.state].filter(Boolean).join(', ') }));
                            }}
                            data-testid={`promo-contact-option-${c.id}`}
                          >
                            <p className="font-medium text-sm">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{[c.company, c.city, c.phone].filter(Boolean).join(' • ')}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              ) : recipientType === 'lead' ? (
                selectedLead ? (
                  <div className="flex items-center justify-between p-3 rounded-md border border-fuchsia-200 bg-fuchsia-50/60" data-testid="promo-selected-lead">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">
                        {selectedLead.contact_person || selectedLead.name || selectedLead.company}
                      </p>
                      <p className="text-sm text-slate-600">
                        {[selectedLead.company, selectedLead.city, selectedLead.phone].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedLead(null); setLeadSearch(''); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="Search leads by company, contact, phone..."
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      data-testid="promo-lead-search"
                    />
                    <div className="border rounded-md max-h-[180px] overflow-y-auto">
                      {leads.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No leads found</p>
                        </div>
                      ) : (
                        leads.map((l) => (
                          <div
                            key={l.id}
                            className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0 transition-colors"
                            onClick={() => {
                              setSelectedLead(l);
                              setForm(prev => ({ ...prev, delivery_address: prev.delivery_address || [l.address, l.city, l.state].filter(Boolean).join(', ') }));
                            }}
                            data-testid={`promo-lead-option-${l.id}`}
                          >
                            <p className="font-medium text-sm">{l.company}</p>
                            <p className="text-xs text-muted-foreground">{[l.contact_person || l.name, l.city, l.phone].filter(Boolean).join(' • ')}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              ) : (
                selectedEmployee ? (
                  <div className="flex items-center justify-between p-3 rounded-md border border-fuchsia-200 bg-fuchsia-50/60" data-testid="promo-selected-employee">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{selectedEmployee.name}</p>
                      <p className="text-sm text-slate-600">
                        {[selectedEmployee.role, selectedEmployee.email, selectedEmployee.phone].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedEmployee(null); setEmployeeSearch(''); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="Search employees by name, role, email..."
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      data-testid="promo-employee-search"
                    />
                    <div className="border rounded-md max-h-[180px] overflow-y-auto">
                      {filteredEmployees.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No employees found</p>
                        </div>
                      ) : (
                        filteredEmployees.map((u) => (
                          <div
                            key={u.id}
                            className="p-3 hover:bg-accent cursor-pointer border-b last:border-b-0 transition-colors"
                            onClick={() => setSelectedEmployee(u)}
                            data-testid={`promo-employee-option-${u.id}`}
                          >
                            <p className="font-medium text-sm">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{[u.role, Array.isArray(u.department) ? u.department.join(', ') : u.department, u.email].filter(Boolean).join(' • ')}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Location & Reason */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Location *</Label>
                <Select value={form.distributor_location_id} onValueChange={(v) => {
                  setForm(f => ({ ...f, distributor_location_id: v }));
                  setBatchMap({});
                  setItems(prev => prev.map(it => ({ ...it, batch_id: '', batch_code: '' })));
                }}>
                  <SelectTrigger data-testid="promo-location-select"><SelectValue placeholder="Select warehouse/location" /></SelectTrigger>
                  <SelectContent>
                    {distributorLocations.map(loc => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.location_name} ({loc.city}){loc.is_default && ' ★'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason *</Label>
                <Select value={form.reason} onValueChange={(v) => setForm(f => ({ ...f, reason: v }))}>
                  <SelectTrigger data-testid="promo-reason-select"><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {reasons.map(r => (<SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date & Reference */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Dispatch Date *</Label>
                <Input type="date" value={form.delivery_date} onChange={(e) => setForm(f => ({ ...f, delivery_date: e.target.value }))} data-testid="promo-date-input" />
              </div>
              <div className="space-y-2">
                <Label>Reference Number</Label>
                <Input placeholder="Optional" value={form.reference_number} onChange={(e) => setForm(f => ({ ...f, reference_number: e.target.value }))} />
              </div>
            </div>

            {/* Vehicle & Driver */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vehicle Number</Label>
                <Input placeholder="KA-01-AB-1234" value={form.vehicle_number} onChange={(e) => setForm(f => ({ ...f, vehicle_number: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Driver Name</Label>
                <Input placeholder="Optional" value={form.driver_name} onChange={(e) => setForm(f => ({ ...f, driver_name: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Delivery Address</Label>
              <Textarea rows={2} value={form.delivery_address} onChange={(e) => setForm(f => ({ ...f, delivery_address: e.target.value }))} placeholder="Defaults to the contact's address" />
            </div>

            {/* Items */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">Items</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Indicative values only (MRP) — marked "Not for Sale".</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setItems(prev => [newItem(), ...prev])} data-testid="add-promo-item-btn">
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border rounded-md">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No items added. Click "Add Item".</p>
                </div>
              ) : (
                <div className="border rounded-lg divide-y divide-slate-200">
                  {items.map((item, index) => {
                    const lineValue = (parseInt(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
                    const batches = batchMap[item.sku_id] || [];
                    const masterSku = skus.find(s => s.id === item.sku_id);
                    const promoPkgs = masterSku?.packaging_config?.promo_stock_out || [];
                    // Friendly unit label derived from the packaging name's
                    // last word — "24 Bottle Crate" → "crate", "12 Bottle
                    // Carton" → "carton", "Bottle (1)" → "bottle". Falls back
                    // to a generic "package" when no packaging is picked yet.
                    const pkgWords = (item.packaging_type_name || '').trim().replace(/\(.*\)$/, '').trim().split(/\s+/).filter(Boolean);
                    const unitLabel = (pkgWords[pkgWords.length - 1] || 'package').toLowerCase();
                    return (
                      <div key={item.id} className={`px-4 py-3 ${index % 2 ? 'bg-slate-50' : 'bg-white'}`} data-testid={`promo-item-${index}`}>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <Select value={item.sku_id} onValueChange={(v) => onSelectSku(item.id, v)}>
                              <SelectTrigger className="h-10" data-testid={`promo-sku-select-${index}`}><SelectValue placeholder="Select SKU" /></SelectTrigger>
                              <SelectContent>
                                {skus.filter(s => s.is_active !== false).map(s => (
                                  <SelectItem key={s.id} value={s.id}>{s.sku_name || s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {/* Promotional packaging — driven by the SKU's
                              `packaging_config.promo_stock_out` configured in
                              SKU Management. Hidden until the user picks an
                              SKU; shows a faded "—" if the SKU has no promo
                              packaging set up yet. */}
                          <div className="w-44 flex-shrink-0">
                            {item.sku_id && promoPkgs.length > 0 ? (
                              <Select
                                value={item.packaging_type_id || ''}
                                onValueChange={(ptId) => {
                                  const pkg = promoPkgs.find(p => p.packaging_type_id === ptId);
                                  if (!pkg) return;
                                  // Re-scale the indicative-per-package value to the new
                                  // packaging size so the total stays consistent
                                  // (e.g. ₹112/bottle → ₹2,688 for crate-24, ₹1,344 for crate-12).
                                  const perBottle = (item.units_per_package && item.units_per_package > 0)
                                    ? (parseFloat(item.unit_price) || 0) / item.units_per_package
                                    : (parseFloat(item.unit_price) || 0);
                                  const newPerPackage = Math.round(perBottle * (pkg.units_per_package || 1) * 100) / 100;
                                  updateItem(item.id, 'packaging_type_id', pkg.packaging_type_id);
                                  updateItem(item.id, 'packaging_type_name', pkg.packaging_type_name);
                                  updateItem(item.id, 'units_per_package', pkg.units_per_package);
                                  updateItem(item.id, 'unit_price', newPerPackage);
                                }}
                              >
                                <SelectTrigger className="h-10" data-testid={`promo-pkg-select-${index}`}>
                                  <SelectValue placeholder="Select packaging" />
                                </SelectTrigger>
                                <SelectContent>
                                  {promoPkgs.map(pkg => (
                                    <SelectItem key={pkg.packaging_type_id} value={pkg.packaging_type_id}>
                                      {pkg.packaging_type_name} ({pkg.units_per_package})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : item.sku_id ? (
                              <span className="text-[11px] text-muted-foreground italic block py-2.5">No promo packaging configured for this SKU</span>
                            ) : null}
                          </div>
                          <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-destructive flex-shrink-0" onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {isBatchRequiredForRow(item) && item.sku_id && (
                          <BatchPickerCards
                            batches={batches}
                            selectedId={item.batch_id || ''}
                            onSelect={(bid, bcode) => {
                              updateItem(item.id, 'batch_id', bid || '__legacy__');
                              updateItem(item.id, 'batch_code', bcode || '');
                            }}
                            testIdPrefix={`promo-batch-${index}`}
                            emptyMessage="No batches available for this SKU at the source."
                            unitLabel={unitLabel + 's'}
                            unitsPerPackage={item.units_per_package || 1}
                          />
                        )}

                        <div className="flex items-start gap-3 mt-3">
                          <div className="w-24 flex-shrink-0">
                            <Label className="text-xs text-muted-foreground">Qty ({unitLabel}s)</Label>
                            <Input type="number" min="1" className="h-10 mt-1 text-base font-medium" value={item.quantity}
                              onChange={(e) => updateItem(item.id, 'quantity', e.target.value)} data-testid={`promo-qty-${index}`} />
                          </div>
                          <div className="flex-1 min-w-[100px]">
                            <Label className="text-xs text-muted-foreground">Indicative Value/{unitLabel} (₹)</Label>
                            <Input type="number" min="0" step="0.01" className="h-10 mt-1 text-base" value={item.unit_price}
                              onChange={(e) => updateItem(item.id, 'unit_price', e.target.value)} data-testid={`promo-price-${index}`} />
                          </div>
                          <div className="w-28 flex-shrink-0 text-right">
                            <Label className="text-xs text-muted-foreground">Value</Label>
                            <p className="text-base font-bold tabular-nums mt-2.5">₹{fmtINR(lineValue)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="px-4 py-3 flex items-center justify-between bg-fuchsia-50/40">
                    <span className="text-sm font-semibold">Total · {totalQty} {totalQty === 1 ? 'package' : 'packages'}</span>
                    <span className="text-lg font-bold tabular-nums" data-testid="promo-grand-total">₹{fmtINR(totalValue)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea rows={2} value={form.remarks} onChange={(e) => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Additional notes..." />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>Cancel</Button>
            <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => handleCreate(true)} disabled={saving || !canSubmit} data-testid="save-draft-promo-dispatch-btn">
              {saving ? 'Saving…' : 'Save as Draft'}
            </Button>
            <Button className="bg-fuchsia-600 hover:bg-fuchsia-700" onClick={() => handleCreate(false)} disabled={saving || !canSubmit} data-testid="save-promo-dispatch-btn">
              {saving ? 'Generating...' : 'Generate Challan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reasons Manager Dialog */}
      <Dialog open={showReasonsMgr} onOpenChange={setShowReasonsMgr}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Promo Reasons</DialogTitle>
            <DialogDescription>Manage the master list of reasons for promotional stock-outs.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input placeholder="New reason name" value={newReasonName} onChange={(e) => setNewReasonName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addReason(); }} data-testid="new-reason-input" />
              <Button onClick={addReason} data-testid="add-reason-btn"><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
              {reasons.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">No reasons yet</div>
              ) : reasons.map(r => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2" data-testid={`reason-row-${r.id}`}>
                  <span className={`text-sm ${r.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{r.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => toggleReason(r)} title={r.is_active ? 'Deactivate' : 'Reactivate'}>
                    {r.is_active ? <Ban className="h-4 w-4 text-red-500" /> : <RefreshCw className="h-4 w-4 text-emerald-600" />}
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReasonsMgr(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}
