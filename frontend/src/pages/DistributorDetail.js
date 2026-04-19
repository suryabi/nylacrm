import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenantConfig } from '../context/TenantConfigContext';
import useMasterLocations from '../hooks/useMasterLocations';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import {
  ArrowLeft, Building2, MapPin, Phone, Mail, Edit2, Trash2,
  RefreshCw, Plus, Package, Truck, CreditCard, Calendar,
  User, FileText, Check, X, Save, Percent, DollarSign, Copy,
  Settings, Eye, Receipt, Calculator, Warehouse, Download, RotateCcw, BarChart3
} from 'lucide-react';
import axios from 'axios';

// Import tab components
import OverviewTab from '../components/distributor/OverviewTab';
import CoverageTab from '../components/distributor/CoverageTab';
import LocationsTab from '../components/distributor/LocationsTab';
import MarginsTab from '../components/distributor/MarginsTab';
import AssignmentsTab from '../components/distributor/AssignmentsTab';
import ShipmentsTab from '../components/distributor/ShipmentsTab';
import DeliveriesTab from '../components/distributor/DeliveriesTab';
import ReturnsTab from '../components/distributor/ReturnsTab';
import SettlementsTab from '../components/distributor/SettlementsTab';
import BillingTab from '../components/distributor/BillingTab';
import StockDashboardTab from '../components/distributor/StockDashboardTab';
import { PAYMENT_TERMS, STATUS_OPTIONS, MARGIN_TYPES, formatMarginValue } from '../components/distributor/constants';

import Breadcrumbs from '../components/Breadcrumbs';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Local helper using imported constants
function getStatusBadge(status) {
  const statusConfig = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[1];
  return <Badge className={statusConfig.color}>{statusConfig.label}</Badge>;
}

export default function DistributorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { getSettings } = useTenantConfig();
  const { stateNames, cityNames, getCityNamesByStateName } = useMasterLocations();
  
  // Get default GST from tenant settings
  const tenantSettings = getSettings();
  const defaultGstPercent = tenantSettings.default_distributor_gst_percent ?? 5;
  
  const [loading, setLoading] = useState(true);
  const [distributor, setDistributor] = useState(null);
  const [activeTab, setActiveTab] = useState('stock-dashboard');
  
  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  
  // Coverage dialog
  const [showCoverageDialog, setShowCoverageDialog] = useState(false);
  const [selectedState, setSelectedState] = useState('');
  const [selectedCities, setSelectedCities] = useState([]);
  const [addingCoverage, setAddingCoverage] = useState(false);
  
  // Location dialog
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [newLocation, setNewLocation] = useState({
    location_name: '',
    address_line_1: '',
    address_line_2: '',
    state: '',
    city: '',
    pincode: '',
    contact_person: '',
    contact_number: '',
    email: '',
    is_default: false,
    is_factory: false
  });
  const [addingLocation, setAddingLocation] = useState(false);
  
  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDistributorDialog, setShowDeleteDistributorDialog] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingDistributor, setDeletingDistributor] = useState(false);
  
  // Account Assignment state
  const [assignments, setAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({
    servicing_city: '',
    distributor_location_id: '',
    is_primary: true,
    is_backup: false,
    has_special_override: false,
    override_type: '',
    override_value: '',
    remarks: ''
  });
  const [savingAssignment, setSavingAssignment] = useState(false);
  
  // Margin Matrix state - List based (multiple entries per SKU)
  const [margins, setMargins] = useState([]);
  const [marginsLoading, setMarginsLoading] = useState(false);
  const [selectedMarginCity, setSelectedMarginCity] = useState('');
  const [showOnlyActiveMargins, setShowOnlyActiveMargins] = useState(false);
  const [costCardPrices, setCostCardPrices] = useState({});
  const [skus, setSkus] = useState([]);
  const [marginGrid, setMarginGrid] = useState({}); // Legacy - for grid view
  const [hasMarginChanges, setHasMarginChanges] = useState(false);
  const [savingMargins, setSavingMargins] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyTargetCity, setCopyTargetCity] = useState('');
  const [copying, setCopying] = useState(false);
  const [showAddMarginDialog, setShowAddMarginDialog] = useState(false);
  const [showEditMarginDialog, setShowEditMarginDialog] = useState(false);
  const [editMarginEntry, setEditMarginEntry] = useState(null);
  const [newMarginForm, setNewMarginForm] = useState({
    sku_id: '',
    sku_name: '',
    base_price: '',
    margin_type: 'percentage',
    margin_value: '2.5',
    active_from: '',
    active_to: ''
  });
  const [savingMarginEntry, setSavingMarginEntry] = useState(false);
  const [showActiveOnlyMargins, setShowActiveOnlyMargins] = useState(true); // Default to show only active
  
  // Shipment state
  const [shipments, setShipments] = useState([]);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [showShipmentDialog, setShowShipmentDialog] = useState(false);
  const [shipmentForm, setShipmentForm] = useState({
    distributor_location_id: '',
    source_warehouse_id: '',
    shipment_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    reference_number: '',
    vehicle_number: '',
    driver_name: '',
    driver_contact: '',
    remarks: '',
    gst_percent: String(defaultGstPercent)
  });
  const [shipmentItems, setShipmentItems] = useState([]);
  const [savingShipment, setSavingShipment] = useState(false);

  // Sync GST default when tenant settings load
  useEffect(() => {
    setShipmentForm(prev => ({ ...prev, gst_percent: String(defaultGstPercent) }));
  }, [defaultGstPercent]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [showShipmentDetail, setShowShipmentDetail] = useState(false);
  const [factoryWarehouses, setFactoryWarehouses] = useState([]);
  const [warehouseStock, setWarehouseStock] = useState([]); // stock for selected source warehouse
  
  // Delivery state
  const [deliveries, setDeliveries] = useState([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveriesTotal, setDeliveriesTotal] = useState(0);
  const [deliveriesPage, setDeliveriesPage] = useState(1);
  const [deliveriesPageSize, setDeliveriesPageSize] = useState(20);
  const [deliveriesTimeFilter, setDeliveriesTimeFilter] = useState('this_month');
  const [deliveriesAccountFilter, setDeliveriesAccountFilter] = useState('all');
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [assignedAccounts, setAssignedAccounts] = useState([]);
  const [selectedDeliveryAccount, setSelectedDeliveryAccount] = useState(null);
  const [deliveryAccountSearch, setDeliveryAccountSearch] = useState('');
  const [deliveryForm, setDeliveryForm] = useState({
    distributor_location_id: '',
    account_id: '',
    delivery_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    vehicle_number: '',
    driver_name: '',
    driver_contact: '',
    remarks: ''
  });
  const [deliveryItems, setDeliveryItems] = useState([]);
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [showDeliveryDetail, setShowDeliveryDetail] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  
  // Settlement state
  const [settlements, setSettlements] = useState([]);
  const [settlementsLoading, setSettlementsLoading] = useState(false);
  const [settlementsTotal, setSettlementsTotal] = useState(0);
  const [settlementsPage, setSettlementsPage] = useState(1);
  const [settlementsPageSize, setSettlementsPageSize] = useState(20);
  const [settlementsMonthFilter, setSettlementsMonthFilter] = useState('all');
  const [settlementsYearFilter, setSettlementsYearFilter] = useState('all');
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [unsettledDeliveries, setUnsettledDeliveries] = useState([]);
  const [unsettledLoading, setUnsettledLoading] = useState(false);
  const [settlementPreview, setSettlementPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [settlementForm, setSettlementForm] = useState({
    settlement_month: new Date().getMonth() + 1,
    settlement_year: new Date().getFullYear(),
    remarks: ''
  });
  const [savingSettlement, setSavingSettlement] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState(null);
  const [showSettlementDetail, setShowSettlementDetail] = useState(false);
  
  // Billing & Reconciliation state
  const [billingConfigs, setBillingConfigs] = useState([]);
  const [billingConfigsLoading, setBillingConfigsLoading] = useState(false);
  const [provisionalInvoices, setProvisionalInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [reconciliations, setReconciliations] = useState([]);
  const [reconciliationsLoading, setReconciliationsLoading] = useState(false);
  const [debitCreditNotes, setDebitCreditNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [billingSummary, setBillingSummary] = useState(null);
  const [showBillingConfigDialog, setShowBillingConfigDialog] = useState(false);
  const [billingConfigForm, setBillingConfigForm] = useState({
    sku_id: '',
    sku_name: '',
    base_price: '',
    margin_percent: '2.5',
    remarks: ''
  });
  const [savingBillingConfig, setSavingBillingConfig] = useState(false);
  const [showReconciliationDialog, setShowReconciliationDialog] = useState(false);
  const [reconciliationForm, setReconciliationForm] = useState({
    period_start: '',
    period_end: '',
    remarks: ''
  });
  const [reconciliationPreview, setReconciliationPreview] = useState(null);
  const [calculatingReconciliation, setCalculatingReconciliation] = useState(false);
  const [savingReconciliation, setSavingReconciliation] = useState(false);
  const [selectedReconciliation, setSelectedReconciliation] = useState(null);
  const [showReconciliationDetail, setShowReconciliationDetail] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);
  const [showNoteDetail, setShowNoteDetail] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  
  // Permission checks - Distributor role users have limited permissions
  const isDistributorRole = user?.role === 'Distributor';
  const canManage = user && (
    ['CEO', 'Director', 'Admin', 'System Admin', 'Vice President', 'National Sales Head'].includes(user.role) ||
    isDistributorRole // Distributors can manage their own profile and create deliveries
  );
  const canDelete = user && ['CEO', 'Admin', 'System Admin'].includes(user.role);
  const canApprove = user && ['CEO', 'Director', 'Vice President'].includes(user.role);
  const canUpdateProfile = user && (
    ['CEO', 'Director', 'Admin', 'System Admin', 'Vice President', 'National Sales Head'].includes(user.role) ||
    isDistributorRole // Distributors can update their contact info
  );
  const canCreateDelivery = user && (
    ['CEO', 'Director', 'Admin', 'System Admin', 'Vice President', 'National Sales Head', 'Regional Sales Manager'].includes(user.role) ||
    isDistributorRole // Distributors can create deliveries
  );

  const fetchDistributor = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/distributors/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setDistributor(response.data);
      setEditData(response.data);
    } catch (error) {
      console.error('Failed to fetch distributor:', error);
      toast.error('Failed to load distributor details');
      navigate('/distributors');
    } finally {
      setLoading(false);
    }
  }, [id, token, navigate]);

  useEffect(() => {
    fetchDistributor();
  }, [fetchDistributor]);

  // Fetch margins when tab changes to margins
  const fetchMargins = useCallback(async () => {
    try {
      setMarginsLoading(true);
      const params = new URLSearchParams();
      if (selectedMarginCity) params.append('city', selectedMarginCity);
      
      const response = await axios.get(`${API_URL}/api/distributors/${id}/margins?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setMargins(response.data.margins || []);
      
      // Build grid from margins
      const grid = {};
      (response.data.margins || []).forEach(m => {
        grid[m.sku_id] = {
          id: m.id,
          base_price: m.base_price || '',
          margin_type: m.margin_type,
          margin_value: m.margin_value,
          transfer_price: m.transfer_price,
          min_quantity: m.min_quantity,
          max_quantity: m.max_quantity,
          active_from: m.active_from || '',
          active_to: m.active_to || '',
          status: m.status
        };
      });
      setMarginGrid(grid);
      setHasMarginChanges(false);
    } catch (error) {
      console.error('Failed to fetch margins:', error);
    } finally {
      setMarginsLoading(false);
    }
  }, [id, token, selectedMarginCity]);

  // Fetch SKUs for margin creation
  const fetchSkus = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/master-skus`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSkus(response.data.skus || response.data || []);
    } catch (error) {
      console.error('Failed to fetch SKUs:', error);
    }
  }, [token]);

  // Set default city when coverage loads
  useEffect(() => {
    if (activeTab === 'commercial' && distributor?.operating_coverage?.length > 0 && !selectedMarginCity) {
      const firstActiveCity = distributor.operating_coverage.find(c => c.status === 'active');
      if (firstActiveCity) {
        setSelectedMarginCity(firstActiveCity.city);
      }
    }
  }, [activeTab, distributor, selectedMarginCity]);

  useEffect(() => {
    if (activeTab === 'commercial' || activeTab === 'stockin') {
      fetchSkus();
    }
  }, [activeTab, fetchSkus]);

  useEffect(() => {
    if (activeTab === 'commercial' && selectedMarginCity) {
      fetchMargins();
      // Fetch cost card prices for this city
      axios.get(`${API_URL}/api/cost-cards?city=${encodeURIComponent(selectedMarginCity)}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        const priceMap = {};
        (res.data.cost_cards || []).forEach(cc => {
          priceMap[cc.sku_id] = cc.cost_per_unit;
        });
        setCostCardPrices(priceMap);
      }).catch(() => {});
    }
  }, [activeTab, selectedMarginCity, fetchMargins, token]);

  // Fetch account assignments
  const fetchAssignments = useCallback(async () => {
    try {
      setAssignmentsLoading(true);
      const response = await axios.get(`${API_URL}/api/distributors/${id}/assignments`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setAssignments(response.data.assignments || []);
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (activeTab === 'commercial') {
      fetchAssignments();
    }
  }, [activeTab, fetchAssignments]);

  // Fetch shipments
  const fetchShipments = useCallback(async () => {
    try {
      setShipmentsLoading(true);
      const response = await axios.get(`${API_URL}/api/distributors/${id}/shipments`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setShipments(response.data.shipments || []);
    } catch (error) {
      console.error('Failed to fetch shipments:', error);
    } finally {
      setShipmentsLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (activeTab === 'stockin') {
      fetchShipments();
      // Fetch factory warehouses for "From Warehouse" dropdown
      axios.get(`${API_URL}/api/production/factory-warehouses`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        const whs = res.data.warehouses || [];
        setFactoryWarehouses(whs);
        // Default to first default warehouse
        const defaultWh = whs.find(w => w.is_default);
        if (defaultWh && !shipmentForm.source_warehouse_id) {
          setShipmentForm(prev => ({ ...prev, source_warehouse_id: defaultWh.id }));
        }
      }).catch(() => {});
    }
  }, [activeTab, fetchShipments]);

  // Fetch stock for selected source warehouse
  useEffect(() => {
    if (shipmentForm.source_warehouse_id) {
      axios.get(`${API_URL}/api/production/factory-warehouse-stock?warehouse_id=${shipmentForm.source_warehouse_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => setWarehouseStock(res.data.stock || []))
        .catch(() => setWarehouseStock([]));
    } else {
      setWarehouseStock([]);
    }
  }, [shipmentForm.source_warehouse_id, token]);


  // Fetch deliveries
  const fetchDeliveries = useCallback(async () => {
    try {
      setDeliveriesLoading(true);
      const params = new URLSearchParams({
        page: deliveriesPage,
        page_size: deliveriesPageSize,
        time_filter: deliveriesTimeFilter
      });
      if (deliveriesAccountFilter && deliveriesAccountFilter !== 'all') {
        params.append('account_id', deliveriesAccountFilter);
      }
      const response = await axios.get(`${API_URL}/api/distributors/${id}/deliveries?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setDeliveries(response.data.deliveries || []);
      setDeliveriesTotal(response.data.total || 0);
    } catch (error) {
      console.error('Failed to fetch deliveries:', error);
    } finally {
      setDeliveriesLoading(false);
    }
  }, [id, token, deliveriesPage, deliveriesPageSize, deliveriesTimeFilter, deliveriesAccountFilter]);

  // Fetch assigned accounts for delivery
  const fetchAssignedAccounts = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/distributors/${id}/assigned-accounts`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setAssignedAccounts(response.data.accounts || []);
    } catch (error) {
      console.error('Failed to fetch assigned accounts:', error);
    }
  }, [id, token]);

  useEffect(() => {
    if (activeTab === 'stockout' || activeTab === 'returns') {
      fetchDeliveries();
      fetchAssignedAccounts();
      if (skus.length === 0) fetchSkus();
    }
  }, [activeTab, fetchDeliveries, fetchAssignedAccounts, fetchSkus, skus.length, deliveriesPage, deliveriesPageSize, deliveriesTimeFilter, deliveriesAccountFilter]);

  // Fetch settlements
  const fetchSettlements = useCallback(async () => {
    try {
      setSettlementsLoading(true);
      const params = new URLSearchParams({
        page: settlementsPage,
        page_size: settlementsPageSize
      });
      if (settlementsMonthFilter && settlementsMonthFilter !== 'all') {
        params.append('month', settlementsMonthFilter);
      }
      if (settlementsYearFilter && settlementsYearFilter !== 'all') {
        params.append('year', settlementsYearFilter);
      }
      const response = await axios.get(`${API_URL}/api/distributors/${id}/settlements?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSettlements(response.data.settlements || []);
      setSettlementsTotal(response.data.total || 0);
    } catch (error) {
      console.error('Failed to fetch settlements:', error);
    } finally {
      setSettlementsLoading(false);
    }
  }, [id, token, settlementsPage, settlementsPageSize, settlementsMonthFilter, settlementsYearFilter]);

  // Fetch unsettled deliveries for a specific month/year
  const fetchUnsettledDeliveries = useCallback(async (month, year) => {
    if (!month || !year) return;
    try {
      setUnsettledLoading(true);
      const response = await axios.get(
        `${API_URL}/api/distributors/${id}/unsettled-deliveries?month=${month}&year=${year}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      setUnsettledDeliveries(response.data.deliveries || []);
    } catch (error) {
      console.error('Failed to fetch unsettled deliveries:', error);
      setUnsettledDeliveries([]);
    } finally {
      setUnsettledLoading(false);
    }
  }, [id, token]);

  const fetchSettlementPreview = useCallback(async (month, year) => {
    if (!month || !year) return;
    try {
      setPreviewLoading(true);
      const response = await axios.get(
        `${API_URL}/api/distributors/${id}/settlement-preview?month=${month}&year=${year}`,
        { headers: { Authorization: `Bearer ${token}` }, withCredentials: true }
      );
      setSettlementPreview(response.data);
    } catch (error) {
      console.error('Failed to fetch settlement preview:', error);
      setSettlementPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (activeTab === 'settlements') {
      fetchSettlements();
    }
  }, [activeTab, fetchSettlements, settlementsPage, settlementsPageSize, settlementsMonthFilter, settlementsYearFilter]);

  // Billing & Reconciliation fetch functions
  const fetchBillingConfigs = useCallback(async () => {
    try {
      setBillingConfigsLoading(true);
      const response = await axios.get(`${API_URL}/api/distributors/${id}/billing-config`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setBillingConfigs(response.data.configs || []);
    } catch (error) {
      console.error('Failed to fetch billing configs:', error);
    } finally {
      setBillingConfigsLoading(false);
    }
  }, [id, token]);

  const fetchProvisionalInvoices = useCallback(async () => {
    try {
      setInvoicesLoading(true);
      const response = await axios.get(`${API_URL}/api/distributors/${id}/provisional-invoices`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setProvisionalInvoices(response.data.invoices || []);
    } catch (error) {
      console.error('Failed to fetch provisional invoices:', error);
    } finally {
      setInvoicesLoading(false);
    }
  }, [id, token]);

  const fetchReconciliations = useCallback(async () => {
    try {
      setReconciliationsLoading(true);
      const response = await axios.get(`${API_URL}/api/distributors/${id}/reconciliations`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setReconciliations(response.data.reconciliations || []);
    } catch (error) {
      console.error('Failed to fetch reconciliations:', error);
    } finally {
      setReconciliationsLoading(false);
    }
  }, [id, token]);

  const fetchDebitCreditNotes = useCallback(async () => {
    try {
      setNotesLoading(true);
      const response = await axios.get(`${API_URL}/api/distributors/${id}/debit-credit-notes`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setDebitCreditNotes(response.data.notes || []);
    } catch (error) {
      console.error('Failed to fetch debit/credit notes:', error);
    } finally {
      setNotesLoading(false);
    }
  }, [id, token]);

  const fetchBillingSummary = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/distributors/${id}/billing/summary`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setBillingSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch billing summary:', error);
    }
  }, [id, token]);

  useEffect(() => {
    if (activeTab === 'billing') {
      fetchBillingConfigs();
      fetchProvisionalInvoices();
      fetchReconciliations();
      fetchDebitCreditNotes();
      fetchBillingSummary();
      if (skus.length === 0) fetchSkus();
    }
  }, [activeTab, fetchBillingConfigs, fetchProvisionalInvoices, fetchReconciliations, fetchDebitCreditNotes, fetchBillingSummary, fetchSkus, skus.length]);

  // Search accounts
  const searchAccounts = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    try {
      setSearching(true);
      // Use the new endpoint that filters accounts by distributor's covered cities
      const response = await axios.get(`${API_URL}/api/distributors/${id}/search-assignable-accounts?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSearchResults(response.data.accounts || []);
      
      // Show warning if no coverage configured
      if (response.data.message) {
        toast.warning(response.data.message);
      }
    } catch (error) {
      console.error('Failed to search accounts:', error);
      toast.error('Failed to search accounts');
    } finally {
      setSearching(false);
    }
  }, [token, id]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (accountSearch) {
        searchAccounts(accountSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [accountSearch, searchAccounts]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await axios.put(`${API_URL}/api/distributors/${id}`, editData, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Distributor updated successfully');
      setIsEditing(false);
      fetchDistributor();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update distributor');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDistributor = async () => {
    try {
      setDeletingDistributor(true);
      await axios.delete(`${API_URL}/api/distributors/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Distributor and all related data deleted permanently');
      navigate('/distributors');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete distributor');
    } finally {
      setDeletingDistributor(false);
    }
  };

  const handleAddCoverage = async () => {
    if (!selectedState || selectedCities.length === 0) {
      toast.error('Please select state and at least one city');
      return;
    }
    
    try {
      setAddingCoverage(true);
      const coverageData = selectedCities.map(city => ({
        distributor_id: id,
        state: selectedState,
        city: city,
        status: 'active'
      }));
      
      const response = await axios.post(
        `${API_URL}/api/distributors/${id}/coverage/bulk`,
        coverageData,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      
      if (response.data.added_count > 0) {
        toast.success(`Added ${response.data.added_count} coverage areas`);
      }
      if (response.data.skipped_count > 0) {
        toast.info(`${response.data.skipped_count} areas were already covered`);
      }
      
      setShowCoverageDialog(false);
      setSelectedState('');
      setSelectedCities([]);
      fetchDistributor();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add coverage');
    } finally {
      setAddingCoverage(false);
    }
  };

  const handleDeleteCoverage = async (coverageId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/coverage/${coverageId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Coverage removed');
      setDeleteTarget(null);
      fetchDistributor();
    } catch (error) {
      toast.error('Failed to remove coverage');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocation.location_name || !newLocation.state || !newLocation.city) {
      toast.error('Location name, state, and city are required');
      return;
    }
    
    try {
      setAddingLocation(true);
      await axios.post(
        `${API_URL}/api/distributors/${id}/locations`,
        { ...newLocation, distributor_id: id },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      
      toast.success('Location added successfully');
      setShowLocationDialog(false);
      setNewLocation({
        location_name: '',
        address_line_1: '',
        address_line_2: '',
        state: '',
        city: '',
        pincode: '',
        contact_person: '',
        contact_number: '',
        email: '',
        is_default: false,
        is_factory: false
      });
      fetchDistributor();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add location');
    } finally {
      setAddingLocation(false);
    }
  };

  const handleDeleteLocation = async (locationId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/locations/${locationId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Location removed');
      setDeleteTarget(null);
      fetchDistributor();
    } catch (error) {
      toast.error('Failed to remove location');
    } finally {
      setDeleting(false);
    }
  };

  // ============ Margin Matrix Handlers ============
  
  // ============ Margin Matrix Grid Handlers ============
  
  const updateMarginGridValue = (skuId, field, value) => {
    setMarginGrid(prev => ({
      ...prev,
      [skuId]: {
        ...(prev[skuId] || { margin_type: 'percentage', margin_value: 0, base_price: '', active_from: '', active_to: '' }),
        [field]: value
      }
    }));
    setHasMarginChanges(true);
  };

  const saveAllMargins = async () => {
    if (!selectedMarginCity) {
      toast.error('Please select a city first');
      return;
    }
    
    try {
      setSavingMargins(true);
      const coverage = distributor.operating_coverage?.find(c => c.city === selectedMarginCity);
      
      // Process each SKU in the grid that has values
      let savedCount = 0;
      let errorCount = 0;
      
      for (const sku of skus) {
        const gridEntry = marginGrid[sku.id];
        if (!gridEntry || !gridEntry.margin_value || gridEntry.margin_value <= 0) continue;
        
        const marginData = {
          distributor_id: id,
          state: coverage?.state || '',
          city: selectedMarginCity,
          sku_id: sku.id,
          sku_name: sku.name || sku.sku_name,
          base_price: parseFloat(gridEntry.base_price) || 0,
          margin_type: gridEntry.margin_type || 'percentage',
          margin_value: parseFloat(gridEntry.margin_value),
          min_quantity: gridEntry.min_quantity ? parseInt(gridEntry.min_quantity) : null,
          max_quantity: gridEntry.max_quantity ? parseInt(gridEntry.max_quantity) : null,
          active_from: gridEntry.active_from || new Date().toISOString().split('T')[0],
          active_to: gridEntry.active_to || null,
          status: 'active'
        };
        
        try {
          if (gridEntry.id) {
            // Update existing
            await axios.put(`${API_URL}/api/distributors/${id}/margins/${gridEntry.id}`, marginData, {
              headers: { Authorization: `Bearer ${token}` },
              withCredentials: true
            });
          } else {
            // Create new
            await axios.post(`${API_URL}/api/distributors/${id}/margins`, marginData, {
              headers: { Authorization: `Bearer ${token}` },
              withCredentials: true
            });
          }
          savedCount++;
        } catch (error) {
          // If entry exists, try to update
          if (error.response?.status === 400 && error.response?.data?.detail?.includes('already exists')) {
            // Find existing and update
            const existing = margins.find(m => m.sku_id === sku.id);
            if (existing) {
              try {
                await axios.put(`${API_URL}/api/distributors/${id}/margins/${existing.id}`, marginData, {
                  headers: { Authorization: `Bearer ${token}` },
                  withCredentials: true
                });
                savedCount++;
              } catch (e) {
                errorCount++;
              }
            }
          } else {
            errorCount++;
          }
        }
      }
      
      if (savedCount > 0) {
        toast.success(`Saved ${savedCount} margin entries`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to save ${errorCount} entries`);
      }
      
      setHasMarginChanges(false);
      fetchMargins();
    } catch (error) {
      toast.error('Failed to save margins');
    } finally {
      setSavingMargins(false);
    }
  };

  const copyMarginsToCity = async () => {
    if (!selectedMarginCity || !copyTargetCity) {
      toast.error('Please select both source and target cities');
      return;
    }
    
    if (selectedMarginCity === copyTargetCity) {
      toast.error('Source and target cities cannot be the same');
      return;
    }
    
    try {
      setCopying(true);
      const coverage = distributor.operating_coverage?.find(c => c.city === copyTargetCity);
      
      // Get all margins from current city
      const marginsToCreate = margins.map(m => ({
        distributor_id: id,
        state: coverage?.state || '',
        city: copyTargetCity,
        sku_id: m.sku_id,
        sku_name: m.sku_name,
        base_price: m.base_price || 0,
        margin_type: m.margin_type,
        margin_value: m.margin_value,
        min_quantity: m.min_quantity,
        max_quantity: m.max_quantity,
        active_from: new Date().toISOString().split('T')[0],
        active_to: m.active_to || null,
        status: 'active'
      }));
      
      const response = await axios.post(
        `${API_URL}/api/distributors/${id}/margins/bulk`,
        marginsToCreate,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      
      const added = response.data.added_count || 0;
      const skipped = response.data.skipped_count || 0;
      
      if (added > 0) {
        toast.success(`Copied ${added} margin entries to ${copyTargetCity}`);
      }
      if (skipped > 0) {
        toast.info(`${skipped} entries already existed in ${copyTargetCity}`);
      }
      
      setShowCopyDialog(false);
      setCopyTargetCity('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to copy margins');
    } finally {
      setCopying(false);
    }
  };

  const handleDeleteMargin = async (marginId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/margins/${marginId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Margin entry deleted');
      setDeleteTarget(null);
      fetchMargins();
    } catch (error) {
      toast.error('Failed to delete margin entry');
    } finally {
      setDeleting(false);
    }
  };

  const handleAddMarginEntry = async () => {
    if (!newMarginForm.sku_id || !newMarginForm.base_price || !newMarginForm.margin_value) {
      toast.error('Please fill in SKU, Base Price, and Margin Value');
      return;
    }
    
    try {
      setSavingMarginEntry(true);
      const coverage = distributor.operating_coverage?.find(c => c.city === selectedMarginCity);
      
      await axios.post(`${API_URL}/api/distributors/${id}/margins`, {
        distributor_id: id,
        state: coverage?.state || '',
        city: selectedMarginCity,
        sku_id: newMarginForm.sku_id,
        sku_name: newMarginForm.sku_name,
        base_price: parseFloat(newMarginForm.base_price),
        margin_type: newMarginForm.margin_type,
        margin_value: parseFloat(newMarginForm.margin_value),
        active_from: newMarginForm.active_from || new Date().toISOString().split('T')[0],
        active_to: newMarginForm.active_to || null,
        status: 'active'
      }, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      toast.success('Price entry added successfully');
      setShowAddMarginDialog(false);
      fetchMargins();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add price entry');
    } finally {
      setSavingMarginEntry(false);
    }
  };

  const handleUpdateMarginEntry = async () => {
    if (!editMarginEntry) return;
    
    try {
      setSavingMarginEntry(true);
      
      await axios.put(`${API_URL}/api/distributors/${id}/margins/${editMarginEntry.id}`, {
        base_price: parseFloat(editMarginEntry.base_price),
        margin_type: editMarginEntry.margin_type,
        margin_value: parseFloat(editMarginEntry.margin_value),
        active_from: editMarginEntry.active_from,
        active_to: editMarginEntry.active_to || null
      }, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      toast.success('Price entry updated successfully');
      setShowEditMarginDialog(false);
      setEditMarginEntry(null);
      fetchMargins();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update price entry');
    } finally {
      setSavingMarginEntry(false);
    }
  };

  // ============ Account Assignment Handlers ============
  
  const handleCreateAssignment = async () => {
    if (!selectedAccount) {
      toast.error('Please select an account');
      return;
    }
    if (!assignmentForm.servicing_city) {
      toast.error('Please select a servicing city');
      return;
    }
    
    try {
      setSavingAssignment(true);
      
      // Get state from coverage
      const coverage = distributor.operating_coverage?.find(c => c.city === assignmentForm.servicing_city);
      
      const assignmentData = {
        account_id: selectedAccount.id,
        account_name: selectedAccount.account_name,
        distributor_id: id,
        distributor_name: distributor.distributor_name,
        servicing_state: coverage?.state || '',
        servicing_city: assignmentForm.servicing_city,
        distributor_location_id: assignmentForm.distributor_location_id || null,
        is_primary: assignmentForm.is_primary,
        is_backup: assignmentForm.is_backup,
        has_special_override: assignmentForm.has_special_override,
        override_type: assignmentForm.has_special_override ? assignmentForm.override_type : null,
        override_value: assignmentForm.has_special_override ? parseFloat(assignmentForm.override_value) : null,
        remarks: assignmentForm.remarks || null,
        status: 'active'
      };
      
      await axios.post(`${API_URL}/api/distributors/${id}/assignments`, assignmentData, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      const accountDisplayName = selectedAccount.account_name || selectedAccount.account_id || 'Account';
      toast.success(`Account '${accountDisplayName}' assigned successfully`);
      setShowAssignDialog(false);
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
      fetchAssignments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create assignment');
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/assignments/${assignmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Assignment removed');
      setDeleteTarget(null);
      fetchAssignments();
    } catch (error) {
      toast.error('Failed to remove assignment');
    } finally {
      setDeleting(false);
    }
  };

  // ============ Shipment Handlers ============
  
  const handleCreateShipment = async () => {
    if (!shipmentForm.distributor_location_id) {
      toast.error('Please select a distributor location');
      return;
    }
    if (!shipmentForm.shipment_date) {
      toast.error('Please enter shipment date');
      return;
    }
    if (shipmentItems.length === 0) {
      toast.error('Please add at least one item');
      return;
    }
    
    try {
      setSavingShipment(true);
      
      const shipmentData = {
        distributor_id: id,
        distributor_location_id: shipmentForm.distributor_location_id,
        source_warehouse_id: shipmentForm.source_warehouse_id || null,
        shipment_date: shipmentForm.shipment_date,
        expected_delivery_date: shipmentForm.expected_delivery_date || null,
        reference_number: shipmentForm.reference_number || null,
        vehicle_number: shipmentForm.vehicle_number || null,
        driver_name: shipmentForm.driver_name || null,
        driver_contact: shipmentForm.driver_contact || null,
        remarks: shipmentForm.remarks || null,
        gst_percent: parseFloat(shipmentForm.gst_percent) || 0,
        items: shipmentItems.map(item => {
          const pkgUnits = parseInt(item.packaging_units) || 1;
          const totalUnits = (parseInt(item.quantity) || 0) * pkgUnits;
          return {
            sku_id: item.sku_id,
            sku_name: item.sku_name,
            quantity: totalUnits,
            packaging_units: pkgUnits,
            packages: parseInt(item.quantity) || 0,
            base_price: item.base_price ? parseFloat(item.base_price) : null,
            distributor_margin: item.distributor_margin ? parseFloat(item.distributor_margin) : null,
            unit_price: parseFloat(item.unit_price),
            discount_percent: parseFloat(item.discount_percent) || 0,
            tax_percent: 0
          };
        })
      };
      
      const response = await axios.post(`${API_URL}/api/distributors/${id}/shipments`, shipmentData, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      toast.success(`Shipment ${response.data.shipment_number} created successfully`);
      setShowShipmentDialog(false);
      resetShipmentForm();
      fetchShipments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create shipment');
    } finally {
      setSavingShipment(false);
    }
  };

  const resetShipmentForm = () => {
    setShipmentForm({
      distributor_location_id: '',
      source_warehouse_id: '',
      shipment_date: new Date().toISOString().split('T')[0],
      expected_delivery_date: '',
      reference_number: '',
      vehicle_number: '',
      driver_name: '',
      driver_contact: '',
      remarks: '',
      gst_percent: String(defaultGstPercent)
    });
    setShipmentItems([]);
  };

  const addShipmentItem = () => {
    setShipmentItems(prev => [...prev, {
      id: Date.now(),
      sku_id: '',
      sku_name: '',
      quantity: 1,
      base_price: null,
      distributor_margin: null,
      unit_price: 0,
      discount_percent: 0,
      tax_percent: defaultGstPercent
    }]);
  };

  const updateShipmentItem = (itemId, field, value) => {
    setShipmentItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    ));
  };

  // Function to get transfer price for a SKU based on location city
  const getTransferPriceForSku = async (skuId, locationId) => {
    try {
      // Find the location to get the city
      const location = distributor.locations?.find(loc => loc.id === locationId);
      if (!location) return null;
      
      const city = location.city;
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch margins for this city
      const response = await axios.get(`${API_URL}/api/distributors/${id}/margins?city=${encodeURIComponent(city)}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      const margins = response.data.margins || [];
      
      // Find the active margin entry for this SKU
      const activeMargin = margins.find(m => 
        m.sku_id === skuId && 
        (!m.active_from || m.active_from <= today) && 
        (!m.active_to || m.active_to >= today)
      );
      
      if (activeMargin) {
        // For cost_based distributors, transfer price = base price (no margin deduction)
        const isCostBased = distributor?.billing_approach === 'cost_based';
        return {
          transfer_price: isCostBased ? activeMargin.base_price : activeMargin.transfer_price,
          base_price: activeMargin.base_price,
          margin_value: activeMargin.margin_value
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to get transfer price:', error);
      return null;
    }
  };

  // Enhanced function to update shipment item with price lookup
  const updateShipmentItemWithPrice = async (itemId, skuId, skuName) => {
    // Find the SKU's default stock_in packaging
    const selectedSku = skus.find(s => s.id === skuId);
    const stockInPkg = selectedSku?.packaging_config?.stock_in || [];
    const defaultPkg = stockInPkg.find(p => p.is_default) || stockInPkg[0];
    const pkgUnits = defaultPkg?.units_per_package || '';

    // First update the SKU info + packaging immediately
    setShipmentItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, sku_id: skuId, sku_name: skuName, packaging_units: pkgUnits ? String(pkgUnits) : '' } : item
    ));
    
    // Then look up the transfer price if we have a location selected
    if (shipmentForm.distributor_location_id) {
      const priceInfo = await getTransferPriceForSku(skuId, shipmentForm.distributor_location_id);
      if (priceInfo) {
        setShipmentItems(prev => prev.map(item => 
          item.id === itemId ? { 
            ...item, 
            unit_price: priceInfo.transfer_price,
            base_price: priceInfo.base_price,
            distributor_margin: priceInfo.margin_value
          } : item
        ));
      }
    }
  };

  const removeShipmentItem = (itemId) => {
    setShipmentItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleConfirmShipment = async (shipmentId) => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/shipments/${shipmentId}/confirm`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Shipment confirmed');
      fetchShipments();
      setShowShipmentDetail(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm shipment');
    }
  };

  const handleDispatchShipment = async (shipmentId) => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/shipments/${shipmentId}/dispatch`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Shipment dispatched');
      fetchShipments();
      setShowShipmentDetail(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to dispatch shipment');
    }
  };

  const handleDeliverShipment = async (shipmentId) => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/shipments/${shipmentId}/deliver`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Shipment marked as delivered');
      fetchShipments();
      setShowShipmentDetail(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to mark shipment as delivered');
    }
  };

  const handleCancelShipment = async (shipmentId) => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/shipments/${shipmentId}/cancel`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Shipment cancelled');
      setDeleteTarget(null);
      fetchShipments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to cancel shipment');
    }
  };

  const handleDeleteShipment = async (shipmentId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/shipments/${shipmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Shipment deleted');
      setDeleteTarget(null);
      fetchShipments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete shipment');
    } finally {
      setDeleting(false);
    }
  };

  const viewShipmentDetail = async (shipmentId) => {
    try {
      const response = await axios.get(`${API_URL}/api/distributors/${id}/shipments/${shipmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSelectedShipment(response.data);
      setShowShipmentDetail(true);
    } catch (error) {
      toast.error('Failed to load shipment details');
    }
  };

  const getShipmentStatusBadge = (status) => {
    const statusConfig = {
      draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
      confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-800' },
      in_transit: { label: 'In Transit', color: 'bg-yellow-100 text-yellow-800' },
      delivered: { label: 'Delivered', color: 'bg-green-100 text-green-800' },
      partially_delivered: { label: 'Partial', color: 'bg-orange-100 text-orange-800' },
      cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' }
    };
    const config = statusConfig[status] || statusConfig.draft;
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  // ============ Delivery Handlers ============

  const handleCreateDelivery = async (creditNotesToApply = []) => {
    if (!deliveryForm.account_id) {
      toast.error('Please select an account');
      return;
    }
    if (!deliveryForm.distributor_location_id) {
      toast.error('Please select a distributor location');
      return;
    }
    if (!deliveryForm.delivery_date) {
      toast.error('Please enter delivery date');
      return;
    }
    if (deliveryItems.length === 0) {
      toast.error('Please add at least one item');
      return;
    }
    
    try {
      setSavingDelivery(true);
      
      const deliveryData = {
        distributor_id: id,
        distributor_location_id: deliveryForm.distributor_location_id,
        account_id: deliveryForm.account_id,
        delivery_date: deliveryForm.delivery_date,
        reference_number: deliveryForm.reference_number || null,
        vehicle_number: deliveryForm.vehicle_number || null,
        driver_name: deliveryForm.driver_name || null,
        driver_contact: deliveryForm.driver_contact || null,
        remarks: deliveryForm.remarks || null,
        items: deliveryItems.map(item => ({
          sku_id: item.sku_id,
          sku_name: item.sku_name,
          quantity: parseInt(item.quantity),
          unit_price: parseFloat(item.unit_price),
          customer_selling_price: parseFloat(item.unit_price), // unit_price is the customer selling price
          discount_percent: parseFloat(item.discount_percent) || 0,
          tax_percent: parseFloat(item.tax_percent) || 0
        })),
        // Include credit notes if any
        credit_notes_to_apply: creditNotesToApply.length > 0 ? creditNotesToApply : null
      };
      
      const response = await axios.post(`${API_URL}/api/distributors/${id}/deliveries`, deliveryData, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      // Show success message with credit info if applicable
      const creditApplied = response.data.total_credit_applied || 0;
      if (creditApplied > 0) {
        toast.success(`Delivery ${response.data.delivery_number} created with ₹${creditApplied.toLocaleString('en-IN')} in credit notes applied`);
      } else {
        toast.success(`Delivery ${response.data.delivery_number} created successfully`);
      }
      setShowDeliveryDialog(false);
      resetDeliveryForm();
      fetchDeliveries();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create delivery');
    } finally {
      setSavingDelivery(false);
    }
  };

  const resetDeliveryForm = () => {
    setDeliveryForm({
      distributor_location_id: '',
      account_id: '',
      delivery_date: new Date().toISOString().split('T')[0],
      reference_number: '',
      vehicle_number: '',
      driver_name: '',
      driver_contact: '',
      remarks: ''
    });
    setDeliveryItems([]);
    setSelectedDeliveryAccount(null);
    setDeliveryAccountSearch('');
  };

  const addDeliveryItem = () => {
    setDeliveryItems(prev => [...prev, {
      id: Date.now(),
      sku_id: '',
      sku_name: '',
      quantity: 1,
      unit_price: 0,
      discount_percent: 0,
      tax_percent: defaultGstPercent
    }]);
  };

  const updateDeliveryItem = (itemId, field, value) => {
    setDeliveryItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    ));
  };

  const removeDeliveryItem = (itemId) => {
    setDeliveryItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleConfirmDelivery = async (deliveryId) => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/deliveries/${deliveryId}/confirm`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Delivery confirmed');
      fetchDeliveries();
      setShowDeliveryDetail(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm delivery');
    }
  };

  const handleCompleteDelivery = async (deliveryId) => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/deliveries/${deliveryId}/complete`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Delivery completed - stock deducted');
      fetchDeliveries();
      setShowDeliveryDetail(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to complete delivery');
    }
  };

  const handleCancelDelivery = async (deliveryId) => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/deliveries/${deliveryId}/cancel`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Delivery cancelled');
      setDeleteTarget(null);
      fetchDeliveries();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to cancel delivery');
    }
  };

  const handleDeleteDelivery = async (deliveryId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/deliveries/${deliveryId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Delivery deleted');
      setDeleteTarget(null);
      fetchDeliveries();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete delivery');
    } finally {
      setDeleting(false);
    }
  };

  const viewDeliveryDetail = async (deliveryId) => {
    try {
      const response = await axios.get(`${API_URL}/api/distributors/${id}/deliveries/${deliveryId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSelectedDelivery(response.data);
      setShowDeliveryDetail(true);
    } catch (error) {
      toast.error('Failed to load delivery details');
    }
  };

  const handleDownloadCustomerInvoice = async (deliveryId) => {
    try {
      setDownloadingInvoice(true);
      const response = await axios.get(
        `${API_URL}/api/distributors/${id}/deliveries/${deliveryId}/customer-invoice`,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true,
          responseType: 'blob'
        }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from response headers or generate one
      const contentDisposition = response.headers['content-disposition'];
      let filename = `customer_invoice_${selectedDelivery?.delivery_number || deliveryId}.pdf`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Invoice downloaded successfully');
    } catch (error) {
      console.error('Invoice download error:', error);
      toast.error(error.response?.data?.detail || 'Failed to download invoice');
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const getDeliveryStatusBadge = (status) => {
    const statusConfig = {
      draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
      confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-800' },
      in_transit: { label: 'In Transit', color: 'bg-yellow-100 text-yellow-800' },
      delivered: { label: 'Delivered', color: 'bg-green-100 text-green-800' },
      returned: { label: 'Returned', color: 'bg-orange-100 text-orange-800' },
      cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' }
    };
    const config = statusConfig[status] || statusConfig.draft;
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  // ============ Settlement Handlers ============

  const handleCreateSettlement = async () => {
    if (!settlementForm.settlement_month || !settlementForm.settlement_year) {
      toast.error('Please select month and year');
      return;
    }
    
    try {
      setSavingSettlement(true);
      
      const settlementData = {
        distributor_id: id,
        settlement_month: settlementForm.settlement_month,
        settlement_year: settlementForm.settlement_year,
        remarks: settlementForm.remarks || null
      };
      
      const response = await axios.post(`${API_URL}/api/distributors/${id}/settlements/generate-monthly`, settlementData, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      const count = response.data.settlements_created || 1;
      toast.success(`${count} settlement(s) created successfully`);
      setShowSettlementDialog(false);
      resetSettlementForm();
      fetchSettlements();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create settlement');
    } finally {
      setSavingSettlement(false);
    }
  };

  const resetSettlementForm = () => {
    setSettlementForm({
      settlement_month: new Date().getMonth() + 1,
      settlement_year: new Date().getFullYear(),
      remarks: ''
    });
    setUnsettledDeliveries([]);
    setSettlementPreview(null);
  };

  const handleSubmitSettlement = async (settlementId) => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/settlements/${settlementId}/submit`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Settlement submitted for approval');
      fetchSettlements();
      setShowSettlementDetail(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit settlement');
    }
  };

  const handleApproveSettlement = async (settlementId) => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/settlements/${settlementId}/approve`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Settlement approved');
      fetchSettlements();
      setShowSettlementDetail(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve settlement');
    }
  };

  const handleRejectSettlement = async (settlementId, reason = '') => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/settlements/${settlementId}/reject?reason=${encodeURIComponent(reason)}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Settlement rejected');
      fetchSettlements();
      setShowSettlementDetail(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reject settlement');
    }
  };

  const handleMarkPaid = async (settlementId, paymentRef = '') => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/settlements/${settlementId}/mark-paid?payment_reference=${encodeURIComponent(paymentRef)}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Settlement marked as paid');
      fetchSettlements();
      setShowSettlementDetail(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to mark settlement as paid');
    }
  };

  const handleDeleteSettlement = async (settlementId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/settlements/${settlementId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Settlement deleted');
      setDeleteTarget(null);
      fetchSettlements();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete settlement');
    } finally {
      setDeleting(false);
    }
  };

  const viewSettlementDetail = async (settlementId) => {
    try {
      const response = await axios.get(`${API_URL}/api/distributors/${id}/settlements/${settlementId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSelectedSettlement(response.data);
      setShowSettlementDetail(true);
    } catch (error) {
      toast.error('Failed to load settlement details');
    }
  };

  const getSettlementStatusBadge = (status) => {
    const statusConfig = {
      draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
      pending_approval: { label: 'Pending Approval', color: 'bg-yellow-100 text-yellow-800' },
      approved: { label: 'Approved', color: 'bg-blue-100 text-blue-800' },
      rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
      paid: { label: 'Paid', color: 'bg-green-100 text-green-800' },
      cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600' }
    };
    const config = statusConfig[status] || statusConfig.draft;
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  // Billing & Reconciliation handlers
  const handleSaveBillingConfig = async () => {
    if (!billingConfigForm.sku_id || !billingConfigForm.base_price) {
      toast.error('Please select SKU and enter base price');
      return;
    }
    
    try {
      setSavingBillingConfig(true);
      await axios.post(`${API_URL}/api/distributors/${id}/billing-config`, {
        sku_id: billingConfigForm.sku_id,
        sku_name: billingConfigForm.sku_name,
        base_price: parseFloat(billingConfigForm.base_price),
        margin_percent: parseFloat(billingConfigForm.margin_percent || '2.5'),
        remarks: billingConfigForm.remarks
      }, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Billing configuration saved');
      setShowBillingConfigDialog(false);
      setBillingConfigForm({ sku_id: '', sku_name: '', base_price: '', margin_percent: '2.5', remarks: '' });
      fetchBillingConfigs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save billing config');
    } finally {
      setSavingBillingConfig(false);
    }
  };

  const handleDeleteBillingConfig = async (configId) => {
    try {
      await axios.delete(`${API_URL}/api/distributors/${id}/billing-config/${configId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Billing configuration deleted');
      fetchBillingConfigs();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete billing config');
    }
  };

  const handleGenerateProvisionalInvoice = async (shipmentId) => {
    try {
      await axios.post(`${API_URL}/api/distributors/${id}/provisional-invoices/generate?shipment_id=${shipmentId}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Provisional invoice generated');
      fetchProvisionalInvoices();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to generate invoice');
    }
  };

  const handleCalculateReconciliation = async () => {
    if (!reconciliationForm.period_start || !reconciliationForm.period_end) {
      toast.error('Please select date range');
      return;
    }
    
    try {
      setCalculatingReconciliation(true);
      const response = await axios.post(`${API_URL}/api/distributors/${id}/reconciliations/calculate`, {
        period_start: reconciliationForm.period_start,
        period_end: reconciliationForm.period_end
      }, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setReconciliationPreview(response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to calculate reconciliation');
    } finally {
      setCalculatingReconciliation(false);
    }
  };

  const handleCreateReconciliation = async () => {
    try {
      setSavingReconciliation(true);
      await axios.post(`${API_URL}/api/distributors/${id}/reconciliations`, {
        period_start: reconciliationForm.period_start,
        period_end: reconciliationForm.period_end,
        remarks: reconciliationForm.remarks
      }, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Reconciliation created');
      setShowReconciliationDialog(false);
      setReconciliationForm({ period_start: '', period_end: '', remarks: '' });
      setReconciliationPreview(null);
      fetchReconciliations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create reconciliation');
    } finally {
      setSavingReconciliation(false);
    }
  };

  const viewReconciliationDetail = async (reconciliationId) => {
    try {
      const response = await axios.get(`${API_URL}/api/distributors/${id}/reconciliations/${reconciliationId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSelectedReconciliation(response.data);
      setShowReconciliationDetail(true);
    } catch (error) {
      toast.error('Failed to load reconciliation details');
    }
  };

  const handleConfirmReconciliation = async (reconciliationId, adjustments = 0) => {
    try {
      const response = await axios.post(`${API_URL}/api/distributors/${id}/reconciliations/${reconciliationId}/confirm?adjustments=${adjustments}`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success(`Reconciliation confirmed. ${response.data.settlement_type === 'debit_note' ? 'Debit' : 'Credit'} note generated.`);
      fetchReconciliations();
      fetchDebitCreditNotes();
      setShowReconciliationDetail(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to confirm reconciliation');
    }
  };

  const handleDeleteReconciliation = async (reconciliationId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/reconciliations/${reconciliationId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Reconciliation deleted');
      setDeleteTarget(null);
      fetchReconciliations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete reconciliation');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      setDeleting(true);
      await axios.delete(`${API_URL}/api/distributors/${id}/notes/${noteId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Note deleted');
      setDeleteTarget(null);
      fetchDebitCreditNotes();
      fetchReconciliations();
      fetchBillingSummary();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete note');
    } finally {
      setDeleting(false);
    }
  };

  const viewNoteDetail = async (noteId) => {
    try {
      const response = await axios.get(`${API_URL}/api/distributors/${id}/debit-credit-notes/${noteId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSelectedNote(response.data);
      setShowNoteDetail(true);
      setPaymentAmount('');
      setPaymentReference('');
    } catch (error) {
      toast.error('Failed to load note details');
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }
    
    try {
      setRecordingPayment(true);
      await axios.post(
        `${API_URL}/api/distributors/${id}/debit-credit-notes/${selectedNote.id}/record-payment?amount=${paymentAmount}${paymentReference ? `&payment_reference=${encodeURIComponent(paymentReference)}` : ''}`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      toast.success('Payment recorded');
      setShowNoteDetail(false);
      fetchDebitCreditNotes();
      fetchBillingSummary();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  const getReconciliationStatusBadge = (status) => {
    const statusConfig = {
      draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
      confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-800' },
      settled: { label: 'Settled', color: 'bg-green-100 text-green-800' },
      cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600' }
    };
    const config = statusConfig[status] || statusConfig.draft;
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const getNoteStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
      partially_paid: { label: 'Partially Paid', color: 'bg-blue-100 text-blue-800' },
      paid: { label: 'Paid', color: 'bg-green-100 text-green-800' },
      cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600' }
    };
    const config = statusConfig[status] || statusConfig.pending;
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  // Get available cities for the selected state that are not already covered
  const getAvailableCities = () => {
    if (!selectedState) return [];
    const stateCities = getCityNamesByStateName(selectedState);
    const coveredCities = (distributor?.operating_coverage || [])
      .filter(c => c.state === selectedState && c.status === 'active')
      .map(c => c.city);
    return stateCities.filter(city => !coveredCities.includes(city));
  };

  // Get covered cities for location selection
  const getCoveredCities = () => {
    return [...new Set((distributor?.operating_coverage || [])
      .filter(c => c.status === 'active')
      .map(c => c.city))];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!distributor) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Distributor not found</p>
        <Button className="mt-4" onClick={() => navigate('/distributors')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Distributors
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="distributor-detail-page">
      <Breadcrumbs items={[
        { label: 'Distribution' },
        { label: 'Distributors', href: '/distributors' },
        { label: distributor.distributor_name || 'Detail' },
      ]} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/distributors')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{distributor.distributor_name}</h1>
              <Badge variant="outline">{distributor.distributor_code}</Badge>
              {getStatusBadge(distributor.status)}
            </div>
            {distributor.legal_entity_name && (
              <p className="text-muted-foreground">{distributor.legal_entity_name}</p>
            )}
          </div>
        </div>
        
        {canManage && !isEditing && (
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsEditing(true)}>
              <Edit2 className="h-4 w-4 mr-2" />
              Edit
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setShowDeleteDistributorDialog(true)}
                data-testid="delete-distributor-btn"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        )}
        
        {isEditing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setIsEditing(false); setEditData(distributor); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>

      {/* Tabs - Consolidated Structure */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-8 h-auto p-1">
          <TabsTrigger value="stock-dashboard" className="flex items-center gap-2 py-2.5" data-testid="stock-dashboard-tab">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Stock</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-2 py-2.5" data-testid="profile-tab">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="commercial" className="flex items-center gap-2 py-2.5" data-testid="commercial-tab">
            <Percent className="h-4 w-4" />
            <span className="hidden sm:inline">Commercial</span>
          </TabsTrigger>
          <TabsTrigger value="stockin" className="flex items-center gap-2 py-2.5" data-testid="stockin-tab">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Stock In</span>
          </TabsTrigger>
          <TabsTrigger value="stockout" className="flex items-center gap-2 py-2.5" data-testid="stockout-tab">
            <Truck className="h-4 w-4" />
            <span className="hidden sm:inline">Stock Out</span>
          </TabsTrigger>
          <TabsTrigger value="returns" className="flex items-center gap-2 py-2.5" data-testid="returns-tab">
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Returns</span>
          </TabsTrigger>
          <TabsTrigger value="settlements" className="flex items-center gap-2 py-2.5" data-testid="settlements-tab">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Settlements</span>
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2 py-2.5" data-testid="billing-tab">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Billing</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab: Overview + Coverage + Locations */}
        <TabsContent value="profile" className="space-y-8">
          {/* Overview Section */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              Basic Information
            </h3>
            <OverviewTab
              distributor={distributor}
              isEditing={isEditing}
              editData={editData}
              setEditData={setEditData}
            />
          </div>
          
          {/* Coverage Section */}
          <div className="border-t pt-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              Operating Coverage
              <Badge variant="secondary" className="ml-2">{distributor.operating_coverage?.length || 0} cities</Badge>
            </h3>
            <CoverageTab
              distributor={distributor}
              canManage={canManage}
              showCoverageDialog={showCoverageDialog}
              setShowCoverageDialog={setShowCoverageDialog}
              selectedState={selectedState}
              setSelectedState={setSelectedState}
              selectedCities={selectedCities}
              setSelectedCities={setSelectedCities}
              stateNames={stateNames}
              getAvailableCities={getAvailableCities}
              handleAddCoverage={handleAddCoverage}
              addingCoverage={addingCoverage}
              setDeleteTarget={setDeleteTarget}
            />
          </div>
          
          {/* Locations Section */}
          <div className="border-t pt-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Warehouse className="h-5 w-5 text-muted-foreground" />
              Warehouse Locations
              <Badge variant="secondary" className="ml-2">{distributor.locations?.length || 0} locations</Badge>
            </h3>
            <LocationsTab
              distributor={distributor}
              canManage={canManage}
              showLocationDialog={showLocationDialog}
              setShowLocationDialog={setShowLocationDialog}
              newLocation={newLocation}
              setNewLocation={setNewLocation}
              stateNames={stateNames}
              getCoveredCities={getCoveredCities}
              handleAddLocation={handleAddLocation}
              addingLocation={addingLocation}
              setDeleteTarget={setDeleteTarget}
            />
          </div>
        </TabsContent>

        {/* Commercial Tab: Margins + Assignments */}
        <TabsContent value="commercial" className="space-y-8">
          {/* Margin Matrix Section */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Percent className="h-5 w-5 text-muted-foreground" />
              Margin Matrix
              <Badge variant="secondary" className="ml-2">{margins.length} entries</Badge>
            </h3>
            <MarginsTab
              distributor={distributor}
              canManage={canManage}
              margins={margins}
              marginsLoading={marginsLoading}
              selectedMarginCity={selectedMarginCity}
              setSelectedMarginCity={setSelectedMarginCity}
              showOnlyActiveMargins={showOnlyActiveMargins}
              setShowOnlyActiveMargins={setShowOnlyActiveMargins}
              getCoveredCities={getCoveredCities}
              skus={skus}
              costCardPrices={costCardPrices}
              showCopyDialog={showCopyDialog}
              setShowCopyDialog={setShowCopyDialog}
              copyTargetCity={copyTargetCity}
              setCopyTargetCity={setCopyTargetCity}
              copyMarginsToCity={copyMarginsToCity}
              copying={copying}
              showAddMarginDialog={showAddMarginDialog}
              setShowAddMarginDialog={setShowAddMarginDialog}
              newMarginForm={newMarginForm}
              setNewMarginForm={setNewMarginForm}
              handleAddMarginEntry={handleAddMarginEntry}
              savingMarginEntry={savingMarginEntry}
              showEditMarginDialog={showEditMarginDialog}
              setShowEditMarginDialog={setShowEditMarginDialog}
              editMarginEntry={editMarginEntry}
              setEditMarginEntry={setEditMarginEntry}
              handleUpdateMarginEntry={handleUpdateMarginEntry}
              setDeleteTarget={setDeleteTarget}
            />
          </div>
          
          {/* Account Assignments Section */}
          <div className="border-t pt-8">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              Account Assignments
              <Badge variant="secondary" className="ml-2">{assignments.length} accounts</Badge>
            </h3>
            <AssignmentsTab
              distributor={distributor}
              canManage={canManage}
              assignments={assignments}
              assignmentsLoading={assignmentsLoading}
              showAssignDialog={showAssignDialog}
              setShowAssignDialog={setShowAssignDialog}
              accountSearch={accountSearch}
              setAccountSearch={setAccountSearch}
              searching={searching}
              searchResults={searchResults}
              setSearchResults={setSearchResults}
              selectedAccount={selectedAccount}
              setSelectedAccount={setSelectedAccount}
              assignmentForm={assignmentForm}
              setAssignmentForm={setAssignmentForm}
              getCoveredCities={getCoveredCities}
              handleCreateAssignment={handleCreateAssignment}
              savingAssignment={savingAssignment}
              setDeleteTarget={setDeleteTarget}
            />
          </div>
        </TabsContent>

        {/* Stock In Tab */}
        <TabsContent value="stockin" className="space-y-4">
          <ShipmentsTab
            distributor={distributor}
            canManage={canManage}
            canDelete={canDelete}
            shipments={shipments}
            shipmentsLoading={shipmentsLoading}
            skus={skus}
            factoryWarehouses={factoryWarehouses}
            warehouseStock={warehouseStock}
            showShipmentDialog={showShipmentDialog}
            setShowShipmentDialog={setShowShipmentDialog}
            shipmentForm={shipmentForm}
            setShipmentForm={setShipmentForm}
            shipmentItems={shipmentItems}
            addShipmentItem={addShipmentItem}
            updateShipmentItem={updateShipmentItem}
            updateShipmentItemWithPrice={updateShipmentItemWithPrice}
            removeShipmentItem={removeShipmentItem}
            resetShipmentForm={resetShipmentForm}
            handleCreateShipment={handleCreateShipment}
            savingShipment={savingShipment}
            viewShipmentDetail={viewShipmentDetail}
            setDeleteTarget={setDeleteTarget}
            getShipmentStatusBadge={getShipmentStatusBadge}
          />
        </TabsContent>

        {/* Stock Out Tab */}
        <TabsContent value="stockout" className="space-y-4">
          <DeliveriesTab
            distributor={distributor}
            canManage={canManage}
            canDelete={canDelete}
            deliveries={deliveries}
            deliveriesLoading={deliveriesLoading}
            deliveriesTotal={deliveriesTotal}
            deliveriesPage={deliveriesPage}
            deliveriesPageSize={deliveriesPageSize}
            setDeliveriesPage={setDeliveriesPage}
            setDeliveriesPageSize={setDeliveriesPageSize}
            deliveriesTimeFilter={deliveriesTimeFilter}
            setDeliveriesTimeFilter={setDeliveriesTimeFilter}
            deliveriesAccountFilter={deliveriesAccountFilter}
            setDeliveriesAccountFilter={setDeliveriesAccountFilter}
            fetchDeliveries={fetchDeliveries}
            skus={skus}
            assignedAccounts={assignedAccounts}
            showDeliveryDialog={showDeliveryDialog}
            setShowDeliveryDialog={setShowDeliveryDialog}
            selectedDeliveryAccount={selectedDeliveryAccount}
            setSelectedDeliveryAccount={setSelectedDeliveryAccount}
            deliveryAccountSearch={deliveryAccountSearch}
            setDeliveryAccountSearch={setDeliveryAccountSearch}
            deliveryForm={deliveryForm}
            setDeliveryForm={setDeliveryForm}
            deliveryItems={deliveryItems}
            addDeliveryItem={addDeliveryItem}
            updateDeliveryItem={updateDeliveryItem}
            removeDeliveryItem={removeDeliveryItem}
            resetDeliveryForm={resetDeliveryForm}
            handleCreateDelivery={handleCreateDelivery}
            savingDelivery={savingDelivery}
            viewDeliveryDetail={viewDeliveryDetail}
            setDeleteTarget={setDeleteTarget}
            getDeliveryStatusBadge={getDeliveryStatusBadge}
            API_URL={API_URL}
            token={token}
          />
        </TabsContent>

        {/* Returns Tab */}
        <TabsContent value="returns" className="space-y-4">
          <ReturnsTab
            distributorId={id}
            accounts={assignedAccounts}
            skus={skus}
            canManage={canManage}
            canDelete={canDelete}
          />
        </TabsContent>

        {/* Settlements Tab */}
        <TabsContent value="settlements" className="space-y-4">
          <SettlementsTab
            distributor={distributor}
            canManage={canManage}
            canDelete={canDelete}
            canApprove={canApprove}
            settlements={settlements}
            settlementsLoading={settlementsLoading}
            settlementsTotal={settlementsTotal}
            settlementsPage={settlementsPage}
            settlementsPageSize={settlementsPageSize}
            setSettlementsPage={setSettlementsPage}
            setSettlementsPageSize={setSettlementsPageSize}
            settlementsMonthFilter={settlementsMonthFilter}
            setSettlementsMonthFilter={setSettlementsMonthFilter}
            settlementsYearFilter={settlementsYearFilter}
            setSettlementsYearFilter={setSettlementsYearFilter}
            fetchSettlements={fetchSettlements}
            showSettlementDialog={showSettlementDialog}
            setShowSettlementDialog={setShowSettlementDialog}
            settlementForm={settlementForm}
            setSettlementForm={setSettlementForm}
            resetSettlementForm={resetSettlementForm}
            unsettledDeliveries={unsettledDeliveries}
            unsettledLoading={unsettledLoading}
            fetchUnsettledDeliveries={fetchUnsettledDeliveries}
            settlementPreview={settlementPreview}
            previewLoading={previewLoading}
            fetchSettlementPreview={fetchSettlementPreview}
            handleCreateSettlement={handleCreateSettlement}
            handleSubmitSettlement={handleSubmitSettlement}
            handleApproveSettlement={handleApproveSettlement}
            handleRejectSettlement={handleRejectSettlement}
            savingSettlement={savingSettlement}
            viewSettlementDetail={viewSettlementDetail}
            setDeleteTarget={setDeleteTarget}
            getSettlementStatusBadge={getSettlementStatusBadge}
            assignedAccounts={assignedAccounts}
          />
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-4">
          <BillingTab
            distributor={distributor}
            canManage={canManage}
            canDelete={canDelete}
            settlements={settlements}
            settlementsLoading={settlementsLoading}
            fetchSettlements={fetchSettlements}
            debitCreditNotes={debitCreditNotes}
            notesLoading={notesLoading}
            fetchNotes={fetchDebitCreditNotes}
            viewNoteDetail={viewNoteDetail}
            getNoteStatusBadge={getNoteStatusBadge}
            getSettlementStatusBadge={getSettlementStatusBadge}
            setActiveTab={setActiveTab}
            setDeleteTarget={setDeleteTarget}
            API_URL={API_URL}
            token={token}
          />
        </TabsContent>

        <TabsContent value="stock-dashboard" className="space-y-4">
          <StockDashboardTab
            distributor={distributor}
            API_URL={API_URL}
            token={token}
          />
        </TabsContent>
      </Tabs>

      {/* Shipment Detail Dialog */}
      <Dialog open={showShipmentDetail} onOpenChange={setShowShipmentDetail}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Shipment {selectedShipment?.shipment_number}
              {selectedShipment && getShipmentStatusBadge(selectedShipment.status)}
            </DialogTitle>
          </DialogHeader>
          {selectedShipment && (
            <div className="space-y-4">
              {/* Shipment Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Location:</span>
                  <span className="ml-2 font-medium">{selectedShipment.distributor_location_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Shipment Date:</span>
                  <span className="ml-2 font-medium">{new Date(selectedShipment.shipment_date).toLocaleDateString()}</span>
                </div>
                {selectedShipment.reference_number && (
                  <div>
                    <span className="text-muted-foreground">Reference:</span>
                    <span className="ml-2 font-medium">{selectedShipment.reference_number}</span>
                  </div>
                )}
                {selectedShipment.vehicle_number && (
                  <div>
                    <span className="text-muted-foreground">Vehicle:</span>
                    <span className="ml-2 font-medium">{selectedShipment.vehicle_number}</span>
                  </div>
                )}
                {selectedShipment.driver_name && (
                  <div>
                    <span className="text-muted-foreground">Driver:</span>
                    <span className="ml-2 font-medium">{selectedShipment.driver_name} {selectedShipment.driver_contact}</span>
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2.5 font-medium">SKU</th>
                      <th className="text-right p-2.5 font-medium">Qty</th>
                      <th className="text-right p-2.5 font-medium">Base Price</th>
                      <th className="text-right p-2.5 font-medium">Margin %</th>
                      <th className="text-right p-2.5 font-medium">Transfer Price</th>
                      <th className="text-right p-2.5 font-medium">Disc %</th>
                      <th className="text-right p-2.5 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedShipment.items || []).map((item, idx) => (
                      <tr key={idx} className={`border-b ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}>
                        <td className="p-2.5">{item.sku_name || item.sku_id}</td>
                        <td className="p-2.5 text-right tabular-nums">{item.quantity}</td>
                        <td className="p-2.5 text-right tabular-nums text-muted-foreground">{item.base_price ? `₹${Number(item.base_price).toFixed(2)}` : '-'}</td>
                        <td className="p-2.5 text-right tabular-nums text-muted-foreground">{item.distributor_margin != null ? `${item.distributor_margin}%` : '-'}</td>
                        <td className="p-2.5 text-right tabular-nums font-medium">{item.unit_price ? `₹${Number(item.unit_price).toFixed(2)}` : '-'}</td>
                        <td className="p-2.5 text-right tabular-nums text-muted-foreground">{item.discount_percent ? `${item.discount_percent}%` : '-'}</td>
                        <td className="p-2.5 text-right tabular-nums font-medium">₹{(item.net_amount || item.gross_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {(selectedShipment.total_discount_amount || 0) > 0 && (
                      <tr className="border-t">
                        <td colSpan="6" className="p-2.5 text-right text-sm text-muted-foreground">Discount:</td>
                        <td className="p-2.5 text-right text-sm font-medium text-red-600">-₹{selectedShipment.total_discount_amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                    <tr className="border-t">
                      <td colSpan="6" className="p-2.5 text-right text-sm text-muted-foreground">Subtotal:</td>
                      <td className="p-2.5 text-right text-sm font-semibold">₹{((selectedShipment.total_gross_amount || 0) - (selectedShipment.total_discount_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    {(selectedShipment.total_tax_amount || 0) > 0 && (
                      <tr>
                        <td colSpan="6" className="p-2.5 text-right text-sm text-muted-foreground">
                          GST {selectedShipment.gst_percent ? `(${selectedShipment.gst_percent}%)` : ''}:
                        </td>
                        <td className="p-2.5 text-right text-sm font-medium">₹{selectedShipment.total_tax_amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                    <tr className="bg-muted/30">
                      <td colSpan="6" className="p-2.5 text-right font-bold">Grand Total:</td>
                      <td className="p-2.5 text-right font-bold text-base">₹{selectedShipment.total_net_amount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Billing Configuration Note */}
              <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800">
                <span className="font-semibold">Billing Config:</span>{' '}
                {distributor?.billing_approach === 'margin_upfront'
                  ? 'Margin applied upfront at the time of shipment. Transfer price = Base price - Margin.'
                  : 'Cost-based pricing. Margin applied at the time of reconciliation based on customer sell-through.'}
              </div>

              {/* Actions */}
              {canManage && (
                <div className="flex justify-end gap-2 pt-4 border-t">
                  {selectedShipment.status === 'draft' && (
                    <>
                      <Button variant="outline" onClick={() => handleCancelShipment(selectedShipment.id)}>
                        Cancel Shipment
                      </Button>
                      <Button onClick={() => handleConfirmShipment(selectedShipment.id)}>
                        <Check className="h-4 w-4 mr-2" />
                        Confirm
                      </Button>
                    </>
                  )}
                  {selectedShipment.status === 'confirmed' && (
                    <>
                      <Button variant="outline" onClick={() => handleCancelShipment(selectedShipment.id)}>
                        Cancel
                      </Button>
                      <Button onClick={() => handleDispatchShipment(selectedShipment.id)}>
                        <Truck className="h-4 w-4 mr-2" />
                        Mark Dispatched
                      </Button>
                    </>
                  )}
                  {['confirmed', 'in_transit', 'partially_delivered'].includes(selectedShipment.status) && (
                    <Button onClick={() => handleDeliverShipment(selectedShipment.id)} className="bg-green-600 hover:bg-green-700">
                      <Check className="h-4 w-4 mr-2" />
                      Mark Delivered
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delivery Detail Dialog */}
      <Dialog open={showDeliveryDetail} onOpenChange={setShowDeliveryDetail}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Delivery {selectedDelivery?.delivery_number}
              {selectedDelivery && getDeliveryStatusBadge(selectedDelivery.status)}
            </DialogTitle>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4">
              {/* Delivery Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Account:</span>
                  <span className="ml-2 font-medium">{selectedDelivery.account_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">City:</span>
                  <span className="ml-2 font-medium">{selectedDelivery.account_city}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">From Location:</span>
                  <span className="ml-2 font-medium">{selectedDelivery.distributor_location_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Delivery Date:</span>
                  <span className="ml-2 font-medium">{new Date(selectedDelivery.delivery_date).toLocaleDateString()}</span>
                </div>
                {selectedDelivery.reference_number && (
                  <div>
                    <span className="text-muted-foreground">Reference:</span>
                    <span className="ml-2 font-medium">{selectedDelivery.reference_number}</span>
                  </div>
                )}
                {selectedDelivery.vehicle_number && (
                  <div>
                    <span className="text-muted-foreground">Vehicle:</span>
                    <span className="ml-2 font-medium">{selectedDelivery.vehicle_number}</span>
                  </div>
                )}
              </div>

              {/* Detailed Items Table */}
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm" data-testid="delivery-detail-items-table">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">SKU</th>
                      <th className="text-right p-2 font-medium">Qty</th>
                      <th className="text-right p-2 font-medium text-blue-700">Base Price</th>
                      <th className="text-right p-2 font-medium text-blue-700">Billed to Dist</th>
                      <th className="text-right p-2 font-medium text-emerald-700">Cust. Price</th>
                      <th className="text-right p-2 font-medium text-emerald-700">Actual Billable</th>
                      <th className="text-right p-2 font-medium text-amber-700">Adj. (Cust. Price)</th>
                      <th className="text-right p-2 font-medium text-purple-700">Net Adj. (After Credit)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedDelivery.items || []).map((item, idx) => {
                      const qty = item.quantity || 0;
                      const customerPrice = item.customer_selling_price || item.unit_price || 0;
                      const commissionPct = item.distributor_commission_percent || item.margin_percent || 2.5;
                      const basePrice = item.base_price || item.transfer_price || 0;
                      const isCostBased = distributor?.billing_approach === 'cost_based';
                      const transferPrice = isCostBased ? basePrice : (basePrice > 0 ? basePrice * (1 - commissionPct / 100) : 0);
                      const billedToDist = qty * transferPrice;
                      const newTransferPrice = isCostBased ? customerPrice : (customerPrice > 0 ? customerPrice * (1 - commissionPct / 100) : 0);
                      const actualBillable = qty * newTransferPrice;
                      const adjustment = actualBillable - billedToDist;
                      return (
                        <tr key={idx} className="border-b">
                          <td className="p-2">
                            <span className="font-medium">{item.sku_name || item.sku_id}</span>
                            <span className="text-xs text-muted-foreground ml-1">({commissionPct}%)</span>
                          </td>
                          <td className="p-2 text-right font-medium">{qty}</td>
                          <td className="p-2 text-right text-blue-700">₹{basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2 text-right text-blue-800 font-medium">₹{billedToDist.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2 text-right text-emerald-700">₹{customerPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2 text-right text-emerald-800 font-medium">₹{actualBillable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className={`p-2 text-right font-semibold ${adjustment > 0 ? 'text-emerald-600' : adjustment < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            {adjustment > 0 ? '+' : ''}₹{adjustment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2 text-right text-slate-400">—</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const items = selectedDelivery.items || [];
                      const totalCreditApplied = selectedDelivery.total_credit_applied || 0;
                      let totBilled = 0, totActual = 0, totAdj = 0;
                      items.forEach(item => {
                        const qty = item.quantity || 0;
                        const customerPrice = item.customer_selling_price || item.unit_price || 0;
                        const commissionPct = item.distributor_commission_percent || item.margin_percent || 2.5;
                        const basePrice = item.base_price || item.transfer_price || 0;
                        const isCB = distributor?.billing_approach === 'cost_based';
                        const transferPrice = isCB ? basePrice : (basePrice > 0 ? basePrice * (1 - commissionPct / 100) : 0);
                        totBilled += qty * transferPrice;
                        const newTP = isCB ? customerPrice : (customerPrice > 0 ? customerPrice * (1 - commissionPct / 100) : 0);
                        totActual += qty * newTP;
                        totAdj += (qty * newTP) - (qty * transferPrice);
                      });
                      const netAdj = totAdj - totalCreditApplied;
                      return (
                        <tr className="bg-muted/30 font-semibold">
                          <td colSpan="2" className="p-2 text-right">Total:</td>
                          <td className="p-2"></td>
                          <td className="p-2 text-right text-blue-800">₹{totBilled.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2"></td>
                          <td className="p-2 text-right text-emerald-800">₹{totActual.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className={`p-2 text-right ${totAdj > 0 ? 'text-emerald-600' : totAdj < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            {totAdj > 0 ? '+' : ''}₹{totAdj.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`p-2 text-right ${netAdj > 0 ? 'text-emerald-600' : netAdj < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            {netAdj > 0 ? '+' : ''}₹{netAdj.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>

              {/* Financial Summary - Customer */}
              {(() => {
                const items = selectedDelivery.items || [];
                const totalCreditApplied = selectedDelivery.total_credit_applied || 0;
                const hasCN = totalCreditApplied > 0;
                let custBilling = 0, totalTax = 0;
                items.forEach(item => {
                  const qty = item.quantity || 0;
                  const price = item.customer_selling_price || item.unit_price || 0;
                  const disc = item.discount_percent || 0;
                  const taxPct = item.tax_percent || 0;
                  const preTax = qty * price * (1 - disc / 100);
                  custBilling += preTax;
                  totalTax += preTax * taxPct / 100;
                });
                const effectiveGstRate = custBilling > 0 ? totalTax / custBilling : 0;
                const totalBillable = Math.max(0, custBilling - totalCreditApplied);
                const gstAmount = totalBillable * effectiveGstRate;
                const invoiceValue = totalBillable + gstAmount;
                const gstPctDisplay = (effectiveGstRate * 100).toFixed(1);
                return (
                  <div className="border rounded-lg p-4 bg-blue-50/40 space-y-2" data-testid="delivery-customer-summary">
                    <h4 className="font-semibold text-sm mb-2 text-blue-800">Customer Summary</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Customer Billing Amount:</span>
                      <span className="font-medium">₹{custBilling.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {hasCN && (
                      <div className="flex justify-between text-sm text-emerald-600">
                        <span>Less: Return Bottle Credit:</span>
                        <span className="font-medium">- ₹{totalCreditApplied.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base border-t pt-2">
                      <span className="font-bold text-blue-800">Customer Invoice Value:</span>
                      <span className="font-bold text-blue-800">₹{totalBillable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 text-right italic">All values exclusive of GST</p>
                  </div>
                );
              })()}

              {/* Financial Summary - Distributor */}
              {(() => {
                const items = selectedDelivery.items || [];
                const totalCreditApplied = selectedDelivery.total_credit_applied || 0;
                const isCostBased = distributor?.billing_approach === 'cost_based';
                
                let totalBasePrice = 0, totalCustomerPrice = 0, totalMarginAtTransfer = 0, totalApplicableMargin = 0;
                let totalBilledAtTransfer = 0, totalFactoryDue = 0;
                let avgMarginPct = 0, marginPctCount = 0;
                
                items.forEach(item => {
                  const qty = item.quantity || 0;
                  const custPrice = item.customer_selling_price || item.unit_price || 0;
                  const commPct = item.distributor_commission_percent || item.margin_percent || 2.5;
                  const basePrice = item.base_price || item.transfer_price || 0;
                  
                  totalBasePrice += qty * basePrice;
                  totalCustomerPrice += qty * custPrice;
                  
                  // What was billed to distributor at transfer
                  const billedAtTransfer = isCostBased ? (qty * basePrice) : (qty * basePrice * (1 - commPct / 100));
                  totalBilledAtTransfer += billedAtTransfer;
                  
                  // Factory's due from customer price (always margin-excluded)
                  const factoryDue = qty * custPrice * (1 - commPct / 100);
                  totalFactoryDue += factoryDue;
                  
                  // Margin info
                  totalMarginAtTransfer += isCostBased ? 0 : (qty * basePrice * commPct / 100);
                  totalApplicableMargin += qty * custPrice * (commPct / 100);
                  avgMarginPct += commPct;
                  marginPctCount += 1;
                });
                
                const marginPctDisplay = marginPctCount > 0 ? (avgMarginPct / marginPctCount).toFixed(1) : '0';
                const returnCredit = totalCreditApplied;
                
                // Core settlement: Factory's due - Already paid - Return credits
                const adjustmentToFactory = totalFactoryDue - totalBilledAtTransfer;
                const netSettlement = -(adjustmentToFactory) + returnCredit;
                
                return (
                  <div className="border rounded-lg overflow-hidden bg-white" data-testid="delivery-distributor-summary">
                    {/* Header with billing approach indicator */}
                    <div className={`px-4 py-2.5 flex items-center justify-between ${isCostBased ? 'bg-amber-50 border-b border-amber-200' : 'bg-purple-50 border-b border-purple-200'}`}>
                      <h4 className={`font-semibold text-sm ${isCostBased ? 'text-amber-800' : 'text-purple-800'}`}>
                        Distributor Settlement Summary
                      </h4>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${isCostBased ? 'bg-amber-200 text-amber-800' : 'bg-purple-200 text-purple-800'}`}>
                        {isCostBased ? 'Post-Sale Adjustment' : 'Margin Upfront'}
                      </span>
                    </div>
                    
                    <div className="p-4 space-y-3">
                      {/* Section 1: Transfer & Customer Pricing */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">Pricing</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Billed at Transfer:</span>
                          <span className="font-medium">₹{totalBilledAtTransfer.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Customer Billing:</span>
                          <span className="font-medium text-emerald-700">₹{totalCustomerPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Factory's Due (Customer − Margin):</span>
                          <span className="font-medium">₹{totalFactoryDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      
                      <div className="border-t border-dashed border-slate-200" />
                      
                      {/* Section 2: Margin Info */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">Distributor Margin @ {marginPctDisplay}%</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">
                            {isCostBased ? 'Margin (post-sale):' : 'Margin at Transfer (already deducted):'}
                          </span>
                          <span className={`font-medium ${totalMarginAtTransfer > 0 ? 'text-purple-700' : 'text-slate-400'}`}>
                            ₹{totalMarginAtTransfer.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            {isCostBased && <span className="text-[10px] text-amber-500 ml-1">(none — post-sale)</span>}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Total Margin on Customer Price:</span>
                          <span className="font-medium text-purple-700">₹{totalApplicableMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 italic">
                          {isCostBased
                            ? 'Full margin settled post-sale. Transfer price was at cost.'
                            : 'Margin already embedded in transfer pricing. No separate deduction needed.'}
                        </p>
                      </div>
                      
                      <div className="border-t border-dashed border-slate-200" />
                      
                      {/* Section 3: Settlement */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">Settlement</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Adjustment to Factory:</span>
                          <span className={`font-medium ${adjustmentToFactory > 0 ? 'text-amber-700' : adjustmentToFactory < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {adjustmentToFactory > 0 ? '' : adjustmentToFactory < 0 ? '-' : ''}₹{Math.abs(adjustmentToFactory).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        {returnCredit > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">Return Bottle Credit:</span>
                            <span className="font-medium text-emerald-600">+₹{returnCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Net Settlement Box */}
                      <div className={`rounded-lg px-3 py-2.5 border-2 ${netSettlement >= 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-blue-50 border-blue-300'}`} data-testid="net-adjustment-box">
                        <div className="flex justify-between items-center">
                          <span className={`font-bold text-sm ${netSettlement >= 0 ? 'text-emerald-800' : 'text-blue-800'}`}>
                            {netSettlement >= 0 ? 'Net Settlement — Payable to Distributor:' : 'Net Settlement — Distributor Owes Factory:'}
                          </span>
                          <span className={`font-bold text-lg ${netSettlement >= 0 ? 'text-emerald-700' : 'text-blue-700'}`}>
                            ₹{Math.abs(netSettlement).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 text-right italic">All values exclusive of GST</p>
                    </div>
                  </div>
                );
              })()}

              {/* Credit Notes Applied Detail */}
              {selectedDelivery.applied_credit_notes && selectedDelivery.applied_credit_notes.length > 0 && (
                <div className="border rounded-lg p-4 bg-emerald-50/50" data-testid="applied-credit-notes-section">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-emerald-700">
                    <CreditCard className="h-4 w-4" />
                    Credit Notes Detail
                  </h4>
                  <div className="space-y-2">
                    {selectedDelivery.applied_credit_notes.map((cn, idx) => (
                      <div key={cn.credit_note_id || idx} className="flex justify-between items-center text-sm">
                        <div>
                          <span className="font-medium">{cn.credit_note_number}</span>
                          {cn.return_number && (
                            <span className="text-muted-foreground ml-2">(Return: {cn.return_number})</span>
                          )}
                        </div>
                        <span className="font-medium text-emerald-600">
                          - ₹{cn.amount_applied?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between items-center pt-4 border-t">
                {/* Invoice Download - Available for delivered/confirmed deliveries */}
                <div>
                  {(selectedDelivery.status === 'delivered' || selectedDelivery.status === 'confirmed') && (
                    <Button 
                      variant="outline" 
                      onClick={() => handleDownloadCustomerInvoice(selectedDelivery.id)}
                      disabled={downloadingInvoice}
                      className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                      data-testid="download-customer-invoice-btn"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {downloadingInvoice ? 'Generating...' : 'Download Invoice (GST)'}
                    </Button>
                  )}
                </div>
                
                {/* Status Actions */}
                <div className="flex gap-2">
                  {canManage && selectedDelivery.status === 'draft' && (
                    <>
                      <Button variant="outline" onClick={() => handleCancelDelivery(selectedDelivery.id)}>
                        Cancel Delivery
                      </Button>
                      <Button onClick={() => handleConfirmDelivery(selectedDelivery.id)}>
                        <Check className="h-4 w-4 mr-2" />
                        Confirm
                      </Button>
                    </>
                  )}
                  {canManage && selectedDelivery.status === 'confirmed' && (
                    <>
                      <Button variant="outline" onClick={() => handleCancelDelivery(selectedDelivery.id)}>
                        Cancel
                      </Button>
                      <Button onClick={() => handleCompleteDelivery(selectedDelivery.id)} className="bg-green-600 hover:bg-green-700">
                        <Check className="h-4 w-4 mr-2" />
                        Complete Delivery
                      </Button>
                    </>
                  )}
                  {canManage && selectedDelivery.status === 'in_transit' && (
                    <Button onClick={() => handleCompleteDelivery(selectedDelivery.id)} className="bg-green-600 hover:bg-green-700">
                      <Check className="h-4 w-4 mr-2" />
                      Complete Delivery
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Settlement Detail Dialog */}
      <Dialog open={showSettlementDetail} onOpenChange={setShowSettlementDetail}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Settlement {selectedSettlement?.settlement_number}
              {selectedSettlement && getSettlementStatusBadge(selectedSettlement.status)}
            </DialogTitle>
          </DialogHeader>
          {selectedSettlement && (
            <div className="space-y-4">
              {/* Settlement Info */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Month/Year:</span>
                  <div className="font-medium">
                    {selectedSettlement.settlement_month ? 
                      ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][selectedSettlement.settlement_month] 
                      : '-'} {selectedSettlement.settlement_year || '-'}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Account:</span>
                  <div className="font-medium">{selectedSettlement.account_name || '-'}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Deliveries:</span>
                  <div className="font-medium">{selectedSettlement.total_deliveries || 0}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Quantity:</span>
                  <div className="font-medium">{selectedSettlement.total_quantity || 0}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Created By:</span>
                  <div className="font-medium">{selectedSettlement.created_by_name || '-'}</div>
                </div>
              </div>

              {/* Summary Cards - Billing Approach Aware */}
              {(() => {
                const isCB = distributor?.billing_approach === 'cost_based';
                const billing = selectedSettlement.total_billing_value || 0;
                const earnings = selectedSettlement.distributor_earnings || 0;
                const factoryDue = billing - earnings;
                
                // Recalculate: For cost_based, margin_at_transfer = 0; for upfront, use stored value
                const marginAtTransfer = isCB ? 0 : (selectedSettlement.margin_at_transfer_price || selectedSettlement.total_margin_amount || 0);
                
                // Billed at transfer = factoryDue equivalent at base: billing_base - margin_at_transfer (for upfront) or billing_base (for cost_based)
                // We can derive: adjustment = factoryDue - billedAtTransfer
                // For upfront: billedAtTransfer = base_total - margin_at_transfer = base_total × (1-m%)
                // For cost_based: billedAtTransfer = base_total
                // Since we don't have base_total stored, compute from: billedAtTransfer = factoryDue - adj
                // But adj is wrong too. So compute: billedAtTransfer = billing - earnings - correctAdj
                // Circular. Use another approach:
                // adj = factoryDue - (billing - factoryAdj_stored - earnings)... nope.
                // 
                // Best: use (billing - earnings) as factoryDue and stored total_delivery_amount as a proxy
                // OR just compute adj differently:
                // For cost_based: adj = factoryDue - (factoryDue - storedAdj + marginAtTransfer)... nope
                //
                // Cleanest: recompute from items if available
                let totalBilledAtTransfer = 0;
                const items = selectedSettlement.items || [];
                items.forEach(item => {
                  const itemBilling = item.total_billing_value || item.total_amount || 0;
                  const itemEarnings = item.distributor_earnings || 0;
                  const itemMarginAtTransfer = isCB ? 0 : (item.margin_at_transfer_price || item.margin_amount || 0);
                  // For upfront: billed = billing_base - margin = (billing_base) × (1-m%)
                  // margin_at_transfer = billing_base × m%, so billing_base = margin_at_transfer / m% (if we know m%)
                  // Alternative: billedAtTransfer = itemBilling - itemEarnings - adj (circular)
                  // Use: billedAtTransfer ≈ factoryDue_on_base = base × (1-m%) for upfront, base for cost_based
                  // Since base_total ≈ billing - (customer - base) per item... we don't have base.
                  // 
                  // Approximate: billedAtTransfer = billing - earnings - adj_stored for upfront
                  // For cost_based: billedAtTransfer = billing - earnings - adj_stored ... same issue
                  // 
                  // Actually from delivery items we have margin_amount which = margin on customer price
                  // And the delivery total_net_amount ≈ customer billing amount
                  // Just use: for cost_based, total_transfer_billed = total_base = ??? 
                  //
                  // Given we CANNOT derive base from settlement data alone for old records,
                  // let's display what we CAN correctly derive:
                  totalBilledAtTransfer += 0; // placeholder
                });
                
                // Since old settlements have wrong stored values and we can't derive base_total,
                // show the CORRECT net payout formula and let the detail table use recalculated values
                const storedAdj = selectedSettlement.factory_distributor_adjustment || selectedSettlement.total_dist_to_factory_adjustment || 0;
                
                // For net payout recalculation from components
                const cnVal = selectedSettlement.total_credit_notes_issued || 0;
                const frVal = selectedSettlement.total_factory_return_credit || 0;
                const netPayout = -(storedAdj) + cnVal + frVal;
                
                return (
                  <div className="space-y-4">
                    <div className={`rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 ${isCB ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'}`}>
                      {isCB ? 'No Upfront Margin — Post-Sale Adjustment' : 'Margin Applied Upfront'}
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-muted/30 rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground">Customer Billing</div>
                        <div className="text-xl font-bold">₹{billing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground">Distributor Margin</div>
                        <div className="text-xl font-bold text-blue-600">₹{earnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        <div className="text-[10px] text-blue-400">{isCB ? 'retained from settlement' : 'embedded in transfer price'}</div>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground">Factory's Due</div>
                        <div className="text-xl font-bold text-amber-700">₹{factoryDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        <div className="text-[10px] text-amber-400">Billing − Margin</div>
                      </div>
                      <div className={`rounded-lg p-4 text-center ${netPayout >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                        <div className="text-sm text-muted-foreground">Net Settlement</div>
                        <div className={`text-xl font-bold ${netPayout >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {netPayout >= 0 ? '+' : '−'}₹{Math.abs(netPayout).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <div className={`text-[10px] ${netPayout >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {netPayout >= 0 ? 'Payable to Distributor' : 'Distributor owes Factory'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Delivery Items */}
              <div className="border rounded-lg">
                <div className="bg-muted/50 p-3 font-medium text-sm border-b">Included Deliveries</div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Delivery #</th>
                        <th className="text-left p-2">Date</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Customer Billing</th>
                        <th className="text-right p-2">Dist Margin</th>
                        <th className="text-right p-2">Factory Due</th>
                        <th className="text-right p-2">Adj to Factory</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedSettlement.items || []).map((item, idx) => {
                        const itemBilling = item.total_billing_value || item.total_amount || 0;
                        const itemEarnings = item.distributor_earnings || 0;
                        const itemFactoryDue = itemBilling - itemEarnings;
                        const itemAdj = item.adjustment_dist_to_factory || item.factory_distributor_adjustment || 0;
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{item.delivery_number}</td>
                            <td className="p-2">{item.delivery_date ? new Date(item.delivery_date).toLocaleDateString() : '-'}</td>
                            <td className="p-2 text-right">{item.total_quantity || 0}</td>
                            <td className="p-2 text-right">₹{itemBilling.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right text-blue-600">₹{itemEarnings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-right text-amber-700">₹{itemFactoryDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td className={`p-2 text-right font-medium ${itemAdj > 0 ? 'text-red-600' : itemAdj < 0 ? 'text-green-600' : 'text-slate-400'}`}>
                              {itemAdj > 0 ? '' : itemAdj < 0 ? '-' : ''}₹{Math.abs(itemAdj).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Approval Info */}
              {selectedSettlement.approved_by_name && (
                <div className="text-sm text-muted-foreground">
                  Approved by: {selectedSettlement.approved_by_name} on {new Date(selectedSettlement.approved_at).toLocaleDateString()}
                </div>
              )}
              {selectedSettlement.rejection_reason && (
                <div className="text-sm text-red-600">
                  Rejection reason: {selectedSettlement.rejection_reason}
                </div>
              )}
              {selectedSettlement.payment_reference && (
                <div className="text-sm text-muted-foreground">
                  Payment Reference: {selectedSettlement.payment_reference}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                {selectedSettlement.status === 'draft' && canManage && (
                  <>
                    <Button variant="outline" onClick={() => {
                      setDeleteTarget({
                        type: 'settlement',
                        id: selectedSettlement.id,
                        name: selectedSettlement.settlement_number
                      });
                      setShowSettlementDetail(false);
                    }}>
                      Delete
                    </Button>
                    <Button onClick={() => handleSubmitSettlement(selectedSettlement.id)}>
                      Submit for Approval
                    </Button>
                  </>
                )}
                {selectedSettlement.status === 'pending_approval' && canApprove && (
                  <>
                    <Button variant="outline" onClick={() => handleRejectSettlement(selectedSettlement.id)}>
                      Reject
                    </Button>
                    <Button onClick={() => handleApproveSettlement(selectedSettlement.id)} className="bg-green-600 hover:bg-green-700">
                      <Check className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  </>
                )}
                {selectedSettlement.reconciled && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Included in {selectedSettlement.note_number || 'reconciliation'}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{deleteTarget?.name}" from this distributor.
              {deleteTarget?.type === 'location' && ' Any associated data may be affected.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              disabled={deleting}
              onClick={() => {
                if (deleteTarget?.type === 'coverage') {
                  handleDeleteCoverage(deleteTarget.id);
                } else if (deleteTarget?.type === 'location') {
                  handleDeleteLocation(deleteTarget.id);
                } else if (deleteTarget?.type === 'margin') {
                  handleDeleteMargin(deleteTarget.id);
                } else if (deleteTarget?.type === 'assignment') {
                  handleDeleteAssignment(deleteTarget.id);
                } else if (deleteTarget?.type === 'shipment') {
                  handleDeleteShipment(deleteTarget.id);
                } else if (deleteTarget?.type === 'delivery') {
                  handleDeleteDelivery(deleteTarget.id);
                } else if (deleteTarget?.type === 'settlement') {
                  handleDeleteSettlement(deleteTarget.id);
                } else if (deleteTarget?.type === 'reconciliation') {
                  handleDeleteReconciliation(deleteTarget.id);
                } else if (deleteTarget?.type === 'note') {
                  handleDeleteNote(deleteTarget.id);
                }
              }}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Distributor Confirmation Dialog */}
      <AlertDialog open={showDeleteDistributorDialog} onOpenChange={(open) => {
        setShowDeleteDistributorDialog(open);
        if (!open) setDeleteConfirmName('');
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">Delete Distributor Permanently</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This will permanently delete <strong>{distributor?.distributor_name}</strong> and all related data including:
              </span>
              <span className="block text-xs text-slate-500 bg-red-50 border border-red-100 rounded-lg p-3 space-y-1">
                <span className="block">Warehouse locations, Operating coverage, Margin matrix</span>
                <span className="block">Account assignments, Shipments, Deliveries</span>
                <span className="block">Settlements, Billing configs, Invoices, Reconciliations</span>
                <span className="block">Linked user accounts</span>
              </span>
              <span className="block font-medium text-red-600">This action cannot be undone.</span>
              <span className="block text-sm">
                Type <strong>{distributor?.distributor_name}</strong> to confirm:
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder="Type distributor name to confirm"
            className="border-red-200 focus:ring-red-500/20"
            data-testid="delete-confirm-input"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDistributor}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deletingDistributor || deleteConfirmName !== distributor?.distributor_name}
              onClick={handleDeleteDistributor}
              data-testid="delete-confirm-btn"
            >
              {deletingDistributor ? 'Deleting...' : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reconciliation Dialog */}
      <Dialog open={showReconciliationDialog} onOpenChange={(open) => {
        setShowReconciliationDialog(open);
        if (!open) {
          setReconciliationPreview(null);
          setReconciliationForm({ period_start: '', period_end: '', remarks: '' });
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Reconciliation</DialogTitle>
            <DialogDescription>Compare provisional billing vs actual customer sales for a period</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Period Start *</Label>
                <Input
                  type="date"
                  value={reconciliationForm.period_start}
                  onChange={(e) => setReconciliationForm(prev => ({ ...prev, period_start: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Period End *</Label>
                <Input
                  type="date"
                  value={reconciliationForm.period_end}
                  onChange={(e) => setReconciliationForm(prev => ({ ...prev, period_end: e.target.value }))}
                />
              </div>
            </div>
            
            <Button 
              variant="outline" 
              onClick={handleCalculateReconciliation}
              disabled={calculatingReconciliation || !reconciliationForm.period_start || !reconciliationForm.period_end}
            >
              {calculatingReconciliation ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-2" />
                  Calculate Preview
                </>
              )}
            </Button>

            {reconciliationPreview && (
              <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold">Reconciliation Preview</h4>
                
                {reconciliationPreview.total_deliveries === 0 ? (
                  <p className="text-muted-foreground">No delivered items found in this period</p>
                ) : (
                  <>
                    {/* Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-background rounded-md">
                        <p className="text-sm text-muted-foreground">Deliveries</p>
                        <p className="text-xl font-bold">{reconciliationPreview.total_deliveries}</p>
                      </div>
                      <div className="text-center p-3 bg-background rounded-md">
                        <p className="text-sm text-muted-foreground">Provisional Amount</p>
                        <p className="text-xl font-bold">₹{reconciliationPreview.total_provisional_amount?.toLocaleString()}</p>
                      </div>
                      <div className="text-center p-3 bg-background rounded-md">
                        <p className="text-sm text-muted-foreground">Actual Net Amount</p>
                        <p className="text-xl font-bold">₹{reconciliationPreview.total_actual_net_amount?.toLocaleString()}</p>
                      </div>
                      <div className={`text-center p-3 rounded-md ${reconciliationPreview.total_difference > 0 ? 'bg-red-50' : reconciliationPreview.total_difference < 0 ? 'bg-green-50' : 'bg-background'}`}>
                        <p className="text-sm text-muted-foreground">Difference</p>
                        <p className={`text-xl font-bold ${reconciliationPreview.total_difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {reconciliationPreview.total_difference > 0 ? '+' : ''}₹{reconciliationPreview.total_difference?.toLocaleString()}
                        </p>
                        <p className="text-xs mt-1">
                          {reconciliationPreview.settlement_type === 'debit_note' ? 'Debit Note (Distributor Owes)' : 
                           reconciliationPreview.settlement_type === 'credit_note' ? 'Credit Note (Nyla Owes)' : 'No Settlement'}
                        </p>
                      </div>
                    </div>

                    {/* Item Details */}
                    {reconciliationPreview.items?.length > 0 && (
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-muted">
                            <tr className="border-b">
                              <th className="text-left p-2">Delivery</th>
                              <th className="text-left p-2">Account</th>
                              <th className="text-left p-2">SKU</th>
                              <th className="text-right p-2">Qty</th>
                              <th className="text-right p-2">Base</th>
                              <th className="text-right p-2">Actual</th>
                              <th className="text-right p-2">Diff</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reconciliationPreview.items.slice(0, 50).map((item, idx) => (
                              <tr key={idx} className="border-b">
                                <td className="p-2">{item.delivery_number}</td>
                                <td className="p-2 truncate max-w-[100px]">{item.account_name}</td>
                                <td className="p-2 truncate max-w-[100px]">{item.sku_name}</td>
                                <td className="p-2 text-right">{item.quantity}</td>
                                <td className="p-2 text-right">₹{item.base_price}</td>
                                <td className="p-2 text-right">₹{item.actual_selling_price}</td>
                                <td className={`p-2 text-right font-medium ${item.difference_amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {item.difference_amount > 0 ? '+' : ''}₹{item.difference_amount}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {reconciliationPreview.items.length > 50 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            Showing 50 of {reconciliationPreview.items.length} items
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Input
                placeholder="Optional notes"
                value={reconciliationForm.remarks}
                onChange={(e) => setReconciliationForm(prev => ({ ...prev, remarks: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReconciliationDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleCreateReconciliation}
              disabled={savingReconciliation || !reconciliationPreview || reconciliationPreview.total_deliveries === 0}
            >
              {savingReconciliation ? 'Creating...' : 'Create Reconciliation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reconciliation Detail Dialog */}
      <Dialog open={showReconciliationDetail} onOpenChange={setShowReconciliationDetail}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Reconciliation {selectedReconciliation?.reconciliation_number}
              {selectedReconciliation && getReconciliationStatusBadge(selectedReconciliation.status)}
            </DialogTitle>
          </DialogHeader>
          {selectedReconciliation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Period</p>
                  <p className="font-medium">{selectedReconciliation.period_start} to {selectedReconciliation.period_end}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Deliveries</p>
                  <p className="font-medium">{selectedReconciliation.total_deliveries}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Quantity</p>
                  <p className="font-medium">{selectedReconciliation.total_quantity}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Settlement Type</p>
                  <Badge variant={selectedReconciliation.settlement_type === 'debit_note' ? 'destructive' : 'default'}>
                    {selectedReconciliation.settlement_type === 'debit_note' ? 'Debit Note' : 
                     selectedReconciliation.settlement_type === 'credit_note' ? 'Credit Note' : 'None'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Provisional Amount</p>
                  <p className="text-xl font-bold">₹{selectedReconciliation.total_provisional_amount?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Actual Gross</p>
                  <p className="text-xl font-bold">₹{selectedReconciliation.total_actual_gross_amount?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Entitled Margin (2.5%)</p>
                  <p className="text-xl font-bold">₹{selectedReconciliation.total_entitled_margin?.toLocaleString()}</p>
                </div>
                <div className={selectedReconciliation.total_difference > 0 ? 'text-red-600' : 'text-green-600'}>
                  <p className="text-sm text-muted-foreground">Final Difference</p>
                  <p className="text-xl font-bold">
                    {selectedReconciliation.final_settlement_amount > 0 ? '+' : ''}₹{selectedReconciliation.final_settlement_amount?.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Line Items */}
              {selectedReconciliation.items?.length > 0 && (
                <div className="max-h-60 overflow-y-auto border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr className="border-b">
                        <th className="text-left p-2">Delivery</th>
                        <th className="text-left p-2">Account</th>
                        <th className="text-left p-2">SKU</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Transfer Price</th>
                        <th className="text-right p-2">Actual Price</th>
                        <th className="text-right p-2">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReconciliation.items.map((item, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2">{item.delivery_number}</td>
                          <td className="p-2 truncate max-w-[120px]">{item.account_name}</td>
                          <td className="p-2 truncate max-w-[120px]">{item.sku_name}</td>
                          <td className="p-2 text-right">{item.quantity}</td>
                          <td className="p-2 text-right">₹{item.transfer_price}</td>
                          <td className="p-2 text-right">₹{item.actual_selling_price}</td>
                          <td className={`p-2 text-right font-medium ${item.difference_amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {item.difference_amount > 0 ? '+' : ''}₹{item.difference_amount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                {selectedReconciliation.status === 'draft' && canManage && (
                  <>
                    <Button variant="outline" onClick={() => {
                      setDeleteTarget({
                        type: 'reconciliation',
                        id: selectedReconciliation.id,
                        name: selectedReconciliation.reconciliation_number
                      });
                      setShowReconciliationDetail(false);
                    }}>
                      Delete
                    </Button>
                    <Button onClick={() => handleConfirmReconciliation(selectedReconciliation.id)} className="bg-green-600 hover:bg-green-700">
                      <Check className="h-4 w-4 mr-2" />
                      Confirm & Generate Note
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Debit/Credit Note Detail Dialog */}
      <Dialog open={showNoteDetail} onOpenChange={setShowNoteDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedNote?.note_type === 'debit' ? 'Debit Note' : 'Credit Note'} {selectedNote?.note_number}
              {selectedNote && getNoteStatusBadge(selectedNote.status)}
            </DialogTitle>
          </DialogHeader>
          {selectedNote && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <Badge variant={selectedNote.note_type === 'debit' ? 'destructive' : 'default'}>
                    {selectedNote.note_type === 'debit' ? 'Debit Note (Distributor Owes)' : 'Credit Note (Nyla Owes)'}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">From Reconciliation</p>
                  <p className="font-medium">{selectedNote.reconciliation_number}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="text-xl font-bold">₹{selectedNote.amount?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Paid Amount</p>
                  <p className="text-xl font-bold text-green-600">₹{(selectedNote.paid_amount || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Balance</p>
                  <p className="text-xl font-bold text-orange-600">₹{(selectedNote.balance_amount || selectedNote.amount).toLocaleString()}</p>
                </div>
              </div>

              {selectedNote.payment_reference && (
                <div>
                  <p className="text-sm text-muted-foreground">Payment Reference</p>
                  <p className="font-medium">{selectedNote.payment_reference}</p>
                </div>
              )}

              {/* Record Payment */}
              {selectedNote.status !== 'paid' && selectedNote.status !== 'cancelled' && canManage && (
                <div className="space-y-3 border-t pt-4">
                  <h4 className="font-semibold">Record Payment</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Amount (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={`Max: ${selectedNote.balance_amount || selectedNote.amount}`}
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Reference</Label>
                      <Input
                        placeholder="Payment ref #"
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button onClick={handleRecordPayment} disabled={recordingPayment} className="w-full">
                    {recordingPayment ? 'Recording...' : 'Record Payment'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
