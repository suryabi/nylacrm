import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenantConfig } from '../context/TenantConfigContext';
import useMasterLocations from '../hooks/useMasterLocations';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
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
  Settings, Eye, Receipt, Calculator
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
import SettlementsTab from '../components/distributor/SettlementsTab';
import BillingTab from '../components/distributor/BillingTab';
import DistributorSidebar from '../components/distributor/DistributorSidebar';
import DistributorHeader from '../components/distributor/DistributorHeader';
import { PAYMENT_TERMS, STATUS_OPTIONS, MARGIN_TYPES, formatMarginValue } from '../components/distributor/constants';

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
  const defaultGstPercent = tenantSettings.default_distributor_gst_percent || 18;
  
  const [loading, setLoading] = useState(true);
  const [distributor, setDistributor] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
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
    is_default: false
  });
  const [addingLocation, setAddingLocation] = useState(false);
  
  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  
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
    shipment_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    reference_number: '',
    vehicle_number: '',
    driver_name: '',
    driver_contact: '',
    remarks: ''
  });
  const [shipmentItems, setShipmentItems] = useState([]);
  const [savingShipment, setSavingShipment] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [showShipmentDetail, setShowShipmentDetail] = useState(false);
  
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
    if (activeTab === 'margins' && distributor?.operating_coverage?.length > 0 && !selectedMarginCity) {
      const firstActiveCity = distributor.operating_coverage.find(c => c.status === 'active');
      if (firstActiveCity) {
        setSelectedMarginCity(firstActiveCity.city);
      }
    }
  }, [activeTab, distributor, selectedMarginCity]);

  useEffect(() => {
    if (activeTab === 'margins' || activeTab === 'shipments') {
      fetchSkus();
    }
  }, [activeTab, fetchSkus]);

  useEffect(() => {
    if (activeTab === 'margins' && selectedMarginCity) {
      fetchMargins();
    }
  }, [activeTab, selectedMarginCity, fetchMargins]);

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
    if (activeTab === 'assignments') {
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
    if (activeTab === 'shipments') {
      fetchShipments();
    }
  }, [activeTab, fetchShipments]);

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
    if (activeTab === 'deliveries') {
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
      const response = await axios.get(`${API_URL}/api/distributors/accounts/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSearchResults(response.data.accounts || []);
    } catch (error) {
      console.error('Failed to search accounts:', error);
    } finally {
      setSearching(false);
    }
  }, [token]);

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
        is_default: false
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
        shipment_date: shipmentForm.shipment_date,
        expected_delivery_date: shipmentForm.expected_delivery_date || null,
        reference_number: shipmentForm.reference_number || null,
        vehicle_number: shipmentForm.vehicle_number || null,
        driver_name: shipmentForm.driver_name || null,
        driver_contact: shipmentForm.driver_contact || null,
        remarks: shipmentForm.remarks || null,
        items: shipmentItems.map(item => ({
          sku_id: item.sku_id,
          sku_name: item.sku_name,
          quantity: parseInt(item.quantity),
          base_price: item.base_price ? parseFloat(item.base_price) : null,
          distributor_margin: item.distributor_margin ? parseFloat(item.distributor_margin) : null,
          unit_price: parseFloat(item.unit_price),
          discount_percent: parseFloat(item.discount_percent) || 0,
          tax_percent: parseFloat(item.tax_percent) || 0
        }))
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
      shipment_date: new Date().toISOString().split('T')[0],
      expected_delivery_date: '',
      reference_number: '',
      vehicle_number: '',
      driver_name: '',
      driver_contact: '',
      remarks: ''
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
        return {
          transfer_price: activeMargin.transfer_price,
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
    // First update the SKU info immediately
    setShipmentItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, sku_id: skuId, sku_name: skuName } : item
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

  const handleCreateDelivery = async () => {
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
          discount_percent: parseFloat(item.discount_percent) || 0,
          tax_percent: parseFloat(item.tax_percent) || 0
        }))
      };
      
      const response = await axios.post(`${API_URL}/api/distributors/${id}/deliveries`, deliveryData, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      toast.success(`Delivery ${response.data.delivery_number} created successfully`);
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
    if (unsettledDeliveries.length === 0) {
      toast.error('No unsettled deliveries found for this period');
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
    <div className="min-h-screen bg-slate-50/30" data-testid="distributor-detail-page">
      {/* Header */}
      <DistributorHeader
        distributor={distributor}
        onEdit={() => setIsEditing(true)}
        canManage={canManage}
        isEditing={isEditing}
        onSave={handleSave}
        onCancel={() => { setIsEditing(false); setEditData(distributor); }}
        saving={saving}
      />

      {/* Main Layout with Sidebar */}
      <div className="flex">
        {/* Sidebar Navigation */}
        <DistributorSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          distributor={distributor}
          counts={{
            coverage: distributor.operating_coverage?.length || 0,
            locations: distributor.locations?.length || 0,
            margins: margins.length,
            assignments: assignments.length,
            shipments: shipments.length,
            deliveries: deliveries.length,
            settlements: settlements.length,
          }}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-h-[calc(100vh-73px)] overflow-auto">
          <div className="p-6 lg:p-8 max-w-6xl">
            {/* Content Title */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
                {activeTab === 'overview' && 'Overview'}
                {activeTab === 'coverage' && 'Operating Coverage'}
                {activeTab === 'locations' && 'Warehouse Locations'}
                {activeTab === 'margins' && 'Margin Matrix'}
                {activeTab === 'assignments' && 'Account Assignments'}
                {activeTab === 'shipments' && 'Stock In (Factory → Distributor)'}
                {activeTab === 'deliveries' && 'Stock Out (Distributor → Customer)'}
                {activeTab === 'settlements' && 'Monthly Settlements'}
                {activeTab === 'billing' && 'Billing & Reconciliation'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {activeTab === 'overview' && 'Basic information and commercial terms'}
                {activeTab === 'coverage' && 'States and cities where distributor operates'}
                {activeTab === 'locations' && 'Warehouse and stocking locations'}
                {activeTab === 'margins' && 'SKU-level margin configurations by city'}
                {activeTab === 'assignments' && 'Customer accounts linked to this distributor'}
                {activeTab === 'shipments' && 'Inventory received from factory'}
                {activeTab === 'deliveries' && 'Deliveries made to customers'}
                {activeTab === 'settlements' && 'Account-level settlement records grouped by customer'}
                {activeTab === 'billing' && 'Monthly reconciliation and debit/credit notes'}
              </p>
            </div>

            {/* Tab Contents */}
            <div className="space-y-6">
              {activeTab === 'overview' && (
                <OverviewTab
                  distributor={distributor}
                  isEditing={isEditing}
                  editData={editData}
                  setEditData={setEditData}
                />
              )}

              {activeTab === 'coverage' && (
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
              )}

              {activeTab === 'locations' && (
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
              )}

              {activeTab === 'margins' && (
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
              )}

              {activeTab === 'assignments' && (
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
              )}

              {activeTab === 'shipments' && (
                <ShipmentsTab
                  distributor={distributor}
                  canManage={canManage}
                  canDelete={canDelete}
                  shipments={shipments}
                  shipmentsLoading={shipmentsLoading}
                  skus={skus}
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
              )}

              {activeTab === 'deliveries' && (
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
              )}

              {activeTab === 'settlements' && (
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
              )}

              {activeTab === 'billing' && (
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
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Shipment Detail Dialog */}
      <Dialog open={showShipmentDetail} onOpenChange={setShowShipmentDetail}>
        <DialogContent className="max-w-2xl">
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
              <div className="border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">SKU</th>
                      <th className="text-right p-2 font-medium">Qty</th>
                      <th className="text-right p-2 font-medium">Price</th>
                      <th className="text-right p-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedShipment.items || []).map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2">{item.sku_name || item.sku_id}</td>
                        <td className="p-2 text-right">{item.quantity}</td>
                        <td className="p-2 text-right">₹{item.unit_price}</td>
                        <td className="p-2 text-right">₹{item.net_amount?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30">
                      <td colSpan="3" className="p-2 text-right font-medium">Total:</td>
                      <td className="p-2 text-right font-bold">₹{selectedShipment.total_net_amount?.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
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
        <DialogContent className="max-w-2xl">
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

              {/* Items */}
              <div className="border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">SKU</th>
                      <th className="text-right p-2 font-medium">Qty</th>
                      <th className="text-right p-2 font-medium">Price</th>
                      <th className="text-right p-2 font-medium">Amount</th>
                      <th className="text-right p-2 font-medium">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedDelivery.items || []).map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2">{item.sku_name || item.sku_id}</td>
                        <td className="p-2 text-right">{item.quantity}</td>
                        <td className="p-2 text-right">₹{item.unit_price}</td>
                        <td className="p-2 text-right">₹{item.net_amount?.toFixed(2)}</td>
                        <td className="p-2 text-right">
                          {item.distributor_earnings > 0 ? (
                            <span className="text-green-600">₹{item.distributor_earnings?.toFixed(2)}</span>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30">
                      <td colSpan="3" className="p-2 text-right font-medium">Total:</td>
                      <td className="p-2 text-right font-bold">₹{selectedDelivery.total_net_amount?.toLocaleString()}</td>
                      <td className="p-2 text-right font-bold text-green-600">
                        {(() => {
                          const totalEarnings = (selectedDelivery.items || []).reduce((sum, item) => sum + (item.distributor_earnings || 0), 0);
                          return totalEarnings > 0 ? `₹${totalEarnings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : '-';
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Actions */}
              {canManage && (
                <div className="flex justify-end gap-2 pt-4 border-t">
                  {selectedDelivery.status === 'draft' && (
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
                  {selectedDelivery.status === 'confirmed' && (
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
                  {selectedDelivery.status === 'in_transit' && (
                    <Button onClick={() => handleCompleteDelivery(selectedDelivery.id)} className="bg-green-600 hover:bg-green-700">
                      <Check className="h-4 w-4 mr-2" />
                      Complete Delivery
                    </Button>
                  )}
                </div>
              )}
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

              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-muted/30 rounded-lg p-4 text-center">
                  <div className="text-sm text-muted-foreground">Total Customer Billing</div>
                  <div className="text-xl font-bold">₹{(selectedSettlement.total_billing_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-sm text-muted-foreground">Distributor Earnings</div>
                  <div className="text-xl font-bold text-blue-600">₹{(selectedSettlement.distributor_earnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="bg-slate-100 rounded-lg p-4 text-center">
                  <div className="text-sm text-muted-foreground">Margin at Transfer Price</div>
                  <div className="text-xl font-bold">₹{(selectedSettlement.margin_at_transfer_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-sm text-muted-foreground">Adjustment Payable</div>
                  <div className={`text-xl font-bold ${(selectedSettlement.adjustment_payable || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(selectedSettlement.adjustment_payable || 0) >= 0 ? '+' : ''}₹{(selectedSettlement.adjustment_payable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

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
                        <th className="text-right p-2">Billing Value</th>
                        <th className="text-right p-2">Earnings</th>
                        <th className="text-right p-2">Margin at Transfer</th>
                        <th className="text-right p-2">Adjustment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedSettlement.items || []).map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{item.delivery_number}</td>
                          <td className="p-2">{item.delivery_date ? new Date(item.delivery_date).toLocaleDateString() : '-'}</td>
                          <td className="p-2 text-right">{item.total_quantity || 0}</td>
                          <td className="p-2 text-right">₹{(item.total_billing_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2 text-right text-blue-600">₹{(item.distributor_earnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2 text-right">₹{(item.margin_at_transfer_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td className={`p-2 text-right font-medium ${(item.adjustment_payable || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {(item.adjustment_payable || 0) >= 0 ? '+' : ''}₹{(item.adjustment_payable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
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
