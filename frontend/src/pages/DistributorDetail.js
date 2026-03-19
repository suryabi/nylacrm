import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
  Settings, Eye, Receipt, Calculator
} from 'lucide-react';
import axios from 'axios';

// Import tab components
import OverviewTab from '../components/distributor/OverviewTab';
import CoverageTab from '../components/distributor/CoverageTab';
import LocationsTab from '../components/distributor/LocationsTab';
import MarginsTab from '../components/distributor/MarginsTab';
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
  const { stateNames, cityNames, getCityNamesByStateName } = useMasterLocations();
  
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
  const [showSettlementDialog, setShowSettlementDialog] = useState(false);
  const [unsettledDeliveries, setUnsettledDeliveries] = useState([]);
  const [unsettledLoading, setUnsettledLoading] = useState(false);
  const [settlementForm, setSettlementForm] = useState({
    period_type: 'monthly',
    period_start: '',
    period_end: '',
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
  
  const canManage = user && ['CEO', 'Director', 'Admin', 'System Admin', 'Vice President', 'National Sales Head'].includes(user.role);
  const canApprove = user && ['CEO', 'Director', 'Vice President'].includes(user.role);

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
      const response = await axios.get(`${API_URL}/api/distributors/${id}/deliveries`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setDeliveries(response.data.deliveries || []);
    } catch (error) {
      console.error('Failed to fetch deliveries:', error);
    } finally {
      setDeliveriesLoading(false);
    }
  }, [id, token]);

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
  }, [activeTab, fetchDeliveries, fetchAssignedAccounts, fetchSkus, skus.length]);

  // Fetch settlements
  const fetchSettlements = useCallback(async () => {
    try {
      setSettlementsLoading(true);
      const response = await axios.get(`${API_URL}/api/distributors/${id}/settlements`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setSettlements(response.data.settlements || []);
    } catch (error) {
      console.error('Failed to fetch settlements:', error);
    } finally {
      setSettlementsLoading(false);
    }
  }, [id, token]);

  // Fetch unsettled deliveries
  const fetchUnsettledDeliveries = useCallback(async () => {
    if (!settlementForm.period_start || !settlementForm.period_end) return;
    
    try {
      setUnsettledLoading(true);
      const response = await axios.get(
        `${API_URL}/api/distributors/${id}/unsettled-deliveries?from_date=${settlementForm.period_start}&to_date=${settlementForm.period_end}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      setUnsettledDeliveries(response.data.deliveries || []);
    } catch (error) {
      console.error('Failed to fetch unsettled deliveries:', error);
    } finally {
      setUnsettledLoading(false);
    }
  }, [id, token, settlementForm.period_start, settlementForm.period_end]);

  useEffect(() => {
    if (activeTab === 'settlements') {
      fetchSettlements();
    }
  }, [activeTab, fetchSettlements]);

  useEffect(() => {
    if (showSettlementDialog && settlementForm.period_start && settlementForm.period_end) {
      fetchUnsettledDeliveries();
    }
  }, [showSettlementDialog, settlementForm.period_start, settlementForm.period_end, fetchUnsettledDeliveries]);

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
      unit_price: 0,
      discount_percent: 0,
      tax_percent: 18
    }]);
  };

  const updateShipmentItem = (itemId, field, value) => {
    setShipmentItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    ));
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
      tax_percent: 18
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
    if (!settlementForm.period_start || !settlementForm.period_end) {
      toast.error('Please select settlement period');
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
        period_type: settlementForm.period_type,
        period_start: settlementForm.period_start,
        period_end: settlementForm.period_end,
        remarks: settlementForm.remarks || null
      };
      
      const response = await axios.post(`${API_URL}/api/distributors/${id}/settlements`, settlementData, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      
      toast.success(`Settlement ${response.data.settlement_number} created successfully`);
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
      period_type: 'monthly',
      period_start: '',
      period_end: '',
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
      await axios.delete(`${API_URL}/api/distributors/${id}/reconciliations/${reconciliationId}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      toast.success('Reconciliation deleted');
      fetchReconciliations();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete reconciliation');
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
          <Button onClick={() => setIsEditing(true)}>
            <Edit2 className="h-4 w-4 mr-2" />
            Edit
          </Button>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="coverage">
            Operating Coverage ({distributor.operating_coverage?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="locations">
            Locations ({distributor.locations?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="margins">
            Margin Matrix ({margins.length})
          </TabsTrigger>
          <TabsTrigger value="assignments" data-testid="assignments-tab">
            Account Assignments ({assignments.length})
          </TabsTrigger>
          <TabsTrigger value="shipments" data-testid="shipments-tab">
            Shipments ({shipments.length})
          </TabsTrigger>
          <TabsTrigger value="deliveries" data-testid="deliveries-tab">
            Deliveries ({deliveries.length})
          </TabsTrigger>
          <TabsTrigger value="settlements" data-testid="settlements-tab">
            Settlements ({settlements.length})
          </TabsTrigger>
          <TabsTrigger value="billing" data-testid="billing-tab">
            Billing & Reconciliation
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <OverviewTab
            distributor={distributor}
            isEditing={isEditing}
            editData={editData}
            setEditData={setEditData}
          />
        </TabsContent>

        {/* Operating Coverage Tab */}
        <TabsContent value="coverage">
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
        </TabsContent>

        {/* Locations Tab */}
        <TabsContent value="locations">
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
        </TabsContent>

        {/* Margin Matrix Tab */}
        <TabsContent value="margins">
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
        </TabsContent>

        {/* Account Assignments Tab */}
        <TabsContent value="assignments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Account Assignments</CardTitle>
                <CardDescription>Accounts assigned to this distributor for servicing</CardDescription>
              </div>
              {canManage && (
                <Dialog open={showAssignDialog} onOpenChange={(open) => {
                  setShowAssignDialog(open);
                  if (!open) {
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
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button data-testid="assign-account-btn">
                      <Plus className="h-4 w-4 mr-2" />
                      Assign Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Assign Account to Distributor</DialogTitle>
                      <DialogDescription>
                        Search and select an account to assign to {distributor.distributor_name}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                      {/* Account Search */}
                      <div className="space-y-2">
                        <Label>Search Account *</Label>
                        {selectedAccount ? (
                          <div className="flex items-center justify-between p-3 border rounded-md bg-muted/50">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{selectedAccount.account_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {selectedAccount.city}{selectedAccount.state ? `, ${selectedAccount.state}` : ''}
                              </p>
                              {selectedAccount.contact_name && (
                                <p className="text-xs text-muted-foreground">
                                  Contact: {selectedAccount.contact_name}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedAccount(null);
                                setAccountSearch('');
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Input
                              placeholder="Type account name to search..."
                              value={accountSearch}
                              onChange={(e) => setAccountSearch(e.target.value)}
                              data-testid="account-search-input"
                            />
                            {searching && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Searching...
                              </div>
                            )}
                            {searchResults.length > 0 && (
                              <div className="border rounded-md max-h-48 overflow-y-auto">
                                {searchResults.map((account) => (
                                  <div
                                    key={account.id}
                                    className="p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                                    onClick={() => {
                                      setSelectedAccount(account);
                                      setSearchResults([]);
                                      setAccountSearch('');
                                    }}
                                    data-testid={`account-result-${account.id}`}
                                  >
                                    <p className="font-medium">{account.account_name}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {account.city}{account.state ? `, ${account.state}` : ''} {account.account_id && `• ${account.account_id}`}
                                    </p>
                                    {account.contact_name && (
                                      <p className="text-xs text-muted-foreground">Contact: {account.contact_name}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {accountSearch.length >= 2 && searchResults.length === 0 && !searching && (
                              <p className="text-sm text-muted-foreground">No accounts found</p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Servicing City */}
                      <div className="space-y-2">
                        <Label>Servicing City *</Label>
                        <Select
                          value={assignmentForm.servicing_city}
                          onValueChange={(v) => setAssignmentForm(prev => ({ ...prev, servicing_city: v }))}
                        >
                          <SelectTrigger data-testid="servicing-city-select">
                            <SelectValue placeholder="Select servicing city" />
                          </SelectTrigger>
                          <SelectContent>
                            {getCoveredCities().map(city => (
                              <SelectItem key={city} value={city}>{city}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          City must be in distributor's operating coverage
                        </p>
                      </div>

                      {/* Distributor Location */}
                      <div className="space-y-2">
                        <Label>Distributor Location (Warehouse)</Label>
                        <Select
                          value={assignmentForm.distributor_location_id || 'none'}
                          onValueChange={(v) => setAssignmentForm(prev => ({ ...prev, distributor_location_id: v === 'none' ? '' : v }))}
                        >
                          <SelectTrigger data-testid="location-select">
                            <SelectValue placeholder="Select location (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">-- No specific location --</SelectItem>
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

                      {/* Assignment Type */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="is_primary"
                            checked={assignmentForm.is_primary}
                            onCheckedChange={(checked) => setAssignmentForm(prev => ({
                              ...prev,
                              is_primary: checked,
                              is_backup: checked ? false : prev.is_backup
                            }))}
                          />
                          <label htmlFor="is_primary" className="text-sm font-medium cursor-pointer">
                            Primary Distributor
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="is_backup"
                            checked={assignmentForm.is_backup}
                            onCheckedChange={(checked) => setAssignmentForm(prev => ({
                              ...prev,
                              is_backup: checked,
                              is_primary: checked ? false : prev.is_primary
                            }))}
                          />
                          <label htmlFor="is_backup" className="text-sm font-medium cursor-pointer">
                            Backup Distributor
                          </label>
                        </div>
                      </div>

                      {/* Special Override */}
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="has_special_override"
                            checked={assignmentForm.has_special_override}
                            onCheckedChange={(checked) => setAssignmentForm(prev => ({
                              ...prev,
                              has_special_override: checked,
                              override_type: checked ? prev.override_type : '',
                              override_value: checked ? prev.override_value : ''
                            }))}
                          />
                          <label htmlFor="has_special_override" className="text-sm font-medium cursor-pointer">
                            Special Margin Override
                          </label>
                        </div>
                        
                        {assignmentForm.has_special_override && (
                          <div className="grid grid-cols-2 gap-4 pl-6">
                            <div className="space-y-2">
                              <Label>Override Type</Label>
                              <Select
                                value={assignmentForm.override_type}
                                onValueChange={(v) => setAssignmentForm(prev => ({ ...prev, override_type: v }))}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {MARGIN_TYPES.map(mt => (
                                    <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Override Value</Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0"
                                value={assignmentForm.override_value}
                                onChange={(e) => setAssignmentForm(prev => ({ ...prev, override_value: e.target.value }))}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Remarks */}
                      <div className="space-y-2">
                        <Label>Remarks</Label>
                        <Textarea
                          placeholder="Add any notes about this assignment..."
                          value={assignmentForm.remarks}
                          onChange={(e) => setAssignmentForm(prev => ({ ...prev, remarks: e.target.value }))}
                          rows={2}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAssignDialog(false)}>Cancel</Button>
                      <Button
                        onClick={handleCreateAssignment}
                        disabled={savingAssignment || !selectedAccount || !assignmentForm.servicing_city}
                        data-testid="save-assignment-btn"
                      >
                        {savingAssignment ? 'Assigning...' : 'Assign Account'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {assignmentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : assignments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No accounts assigned</p>
                  <p className="text-sm">Assign accounts to this distributor for servicing</p>
                  {(distributor.operating_coverage?.length || 0) === 0 && (
                    <p className="text-sm text-amber-600 mt-2">Note: Add operating coverage first before assigning accounts</p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="assignments-table">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Account</th>
                        <th className="text-left p-3 font-medium">Servicing City</th>
                        <th className="text-left p-3 font-medium">Location</th>
                        <th className="text-center p-3 font-medium">Type</th>
                        <th className="text-center p-3 font-medium">Override</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((assignment) => (
                        <tr key={assignment.id} className="border-b hover:bg-muted/30" data-testid={`assignment-row-${assignment.id}`}>
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{assignment.account_name}</p>
                              <p className="text-sm text-muted-foreground">{assignment.servicing_state}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              {assignment.servicing_city}
                            </div>
                          </td>
                          <td className="p-3">
                            {assignment.distributor_location_name || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {assignment.is_primary && (
                              <Badge className="bg-blue-100 text-blue-800">Primary</Badge>
                            )}
                            {assignment.is_backup && (
                              <Badge className="bg-orange-100 text-orange-800">Backup</Badge>
                            )}
                            {!assignment.is_primary && !assignment.is_backup && (
                              <Badge variant="outline">Standard</Badge>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {assignment.has_special_override ? (
                              <Badge className="bg-purple-100 text-purple-800">
                                {formatMarginValue(assignment.override_type, assignment.override_value)}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {getStatusBadge(assignment.status)}
                          </td>
                          <td className="p-3 text-right">
                            {canManage && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => setDeleteTarget({
                                  type: 'assignment',
                                  id: assignment.id,
                                  name: assignment.account_name || `Account in ${assignment.servicing_city}`
                                })}
                                data-testid={`delete-assignment-${assignment.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shipments Tab */}
        <TabsContent value="shipments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Primary Shipments</CardTitle>
                <CardDescription>Stock shipments to this distributor's locations</CardDescription>
              </div>
              {canManage && (
                <Dialog open={showShipmentDialog} onOpenChange={(open) => {
                  setShowShipmentDialog(open);
                  if (!open) resetShipmentForm();
                }}>
                  <DialogTrigger asChild>
                    <Button data-testid="create-shipment-btn">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Shipment
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create Primary Shipment</DialogTitle>
                      <DialogDescription>
                        Record stock being sent to {distributor.distributor_name}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {/* Location & Date */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Destination Location *</Label>
                          <Select
                            value={shipmentForm.distributor_location_id}
                            onValueChange={(v) => setShipmentForm(prev => ({ ...prev, distributor_location_id: v }))}
                          >
                            <SelectTrigger data-testid="shipment-location-select">
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
                          <Label>Shipment Date *</Label>
                          <Input
                            type="date"
                            value={shipmentForm.shipment_date}
                            onChange={(e) => setShipmentForm(prev => ({ ...prev, shipment_date: e.target.value }))}
                            data-testid="shipment-date-input"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Expected Delivery Date</Label>
                          <Input
                            type="date"
                            value={shipmentForm.expected_delivery_date}
                            onChange={(e) => setShipmentForm(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Reference/PO Number</Label>
                          <Input
                            placeholder="e.g., PO-2026-001"
                            value={shipmentForm.reference_number}
                            onChange={(e) => setShipmentForm(prev => ({ ...prev, reference_number: e.target.value }))}
                          />
                        </div>
                      </div>

                      {/* Transport Details */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Vehicle Number</Label>
                          <Input
                            placeholder="KA-01-AB-1234"
                            value={shipmentForm.vehicle_number}
                            onChange={(e) => setShipmentForm(prev => ({ ...prev, vehicle_number: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Driver Name</Label>
                          <Input
                            placeholder="Driver name"
                            value={shipmentForm.driver_name}
                            onChange={(e) => setShipmentForm(prev => ({ ...prev, driver_name: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Driver Contact</Label>
                          <Input
                            placeholder="+91 9876543210"
                            value={shipmentForm.driver_contact}
                            onChange={(e) => setShipmentForm(prev => ({ ...prev, driver_contact: e.target.value }))}
                          />
                        </div>
                      </div>

                      {/* Shipment Items */}
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">Shipment Items</Label>
                          <Button variant="outline" size="sm" onClick={addShipmentItem} data-testid="add-item-btn">
                            <Plus className="h-4 w-4 mr-1" />
                            Add Item
                          </Button>
                        </div>
                        
                        {shipmentItems.length === 0 ? (
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
                            {shipmentItems.map((item, index) => (
                              <div key={item.id} className="flex items-center gap-3 p-3 border rounded-md bg-muted/30" data-testid={`shipment-item-${index}`}>
                                <div className="flex-[3] min-w-0">
                                  <Select
                                    value={item.sku_id}
                                    onValueChange={(v) => {
                                      const selectedSku = skus.find(s => s.id === v);
                                      updateShipmentItem(item.id, 'sku_id', v);
                                      if (selectedSku) {
                                        updateShipmentItem(item.id, 'sku_name', selectedSku.name || selectedSku.sku_name);
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue placeholder="Select SKU" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {skus.map(sku => (
                                        <SelectItem key={sku.id} value={sku.id}>
                                          {sku.name || sku.sku_name}
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
                                    onChange={(e) => updateShipmentItem(item.id, 'quantity', e.target.value)}
                                  />
                                </div>
                                <div className="w-24">
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="h-9"
                                    value={item.unit_price}
                                    onChange={(e) => updateShipmentItem(item.id, 'unit_price', e.target.value)}
                                  />
                                </div>
                                <div className="w-16">
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    className="h-9"
                                    value={item.discount_percent}
                                    onChange={(e) => updateShipmentItem(item.id, 'discount_percent', e.target.value)}
                                  />
                                </div>
                                <div className="w-16">
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    className="h-9"
                                    value={item.tax_percent}
                                    onChange={(e) => updateShipmentItem(item.id, 'tax_percent', e.target.value)}
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
                                    onClick={() => removeShipmentItem(item.id)}
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
                                  ₹{shipmentItems.reduce((sum, item) => {
                                    const gross = item.quantity * item.unit_price;
                                    const afterDiscount = gross * (1 - (item.discount_percent || 0) / 100);
                                    const withTax = afterDiscount * (1 + (item.tax_percent || 0) / 100);
                                    return sum + withTax;
                                  }, 0).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Remarks */}
                      <div className="space-y-2">
                        <Label>Remarks</Label>
                        <Textarea
                          placeholder="Any additional notes..."
                          value={shipmentForm.remarks}
                          onChange={(e) => setShipmentForm(prev => ({ ...prev, remarks: e.target.value }))}
                          rows={2}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowShipmentDialog(false)}>Cancel</Button>
                      <Button
                        onClick={handleCreateShipment}
                        disabled={savingShipment || !shipmentForm.distributor_location_id || shipmentItems.length === 0}
                        data-testid="save-shipment-btn"
                      >
                        {savingShipment ? 'Creating...' : 'Create Shipment'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {shipmentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : shipments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No shipments recorded</p>
                  <p className="text-sm">Create a shipment to record stock sent to this distributor</p>
                  {(distributor.locations?.length || 0) === 0 && (
                    <p className="text-sm text-amber-600 mt-2">Note: Add a location first before creating shipments</p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="shipments-table">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Shipment #</th>
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Location</th>
                        <th className="text-right p-3 font-medium">Qty</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipments.map((shipment) => (
                        <tr key={shipment.id} className="border-b hover:bg-muted/30" data-testid={`shipment-row-${shipment.id}`}>
                          <td className="p-3">
                            <button 
                              className="font-medium text-primary hover:underline"
                              onClick={() => viewShipmentDetail(shipment.id)}
                            >
                              {shipment.shipment_number}
                            </button>
                            {shipment.reference_number && (
                              <p className="text-xs text-muted-foreground">{shipment.reference_number}</p>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {new Date(shipment.shipment_date).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              {shipment.distributor_location_name}
                            </div>
                          </td>
                          <td className="p-3 text-right font-medium">{shipment.total_quantity}</td>
                          <td className="p-3 text-right font-medium">₹{shipment.total_net_amount?.toLocaleString()}</td>
                          <td className="p-3 text-center">
                            {getShipmentStatusBadge(shipment.status)}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => viewShipmentDetail(shipment.id)}
                                data-testid={`view-shipment-${shipment.id}`}
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                              {canManage && shipment.status === 'draft' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget({
                                    type: 'shipment',
                                    id: shipment.id,
                                    name: shipment.shipment_number
                                  })}
                                  data-testid={`delete-shipment-${shipment.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
          </Card>
        </TabsContent>

        {/* Deliveries Tab */}
        <TabsContent value="deliveries">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Account Deliveries</CardTitle>
                <CardDescription>Deliveries from this distributor to assigned accounts</CardDescription>
              </div>
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
                                      // Use account's SKU pricing if available, otherwise fall back to master SKUs
                                      const accountSkus = selectedDeliveryAccount?.sku_pricing || [];
                                      const selectedSku = accountSkus.find(s => s.id === v) || skus.find(s => s.id === v);
                                      updateDeliveryItem(item.id, 'sku_id', v);
                                      if (selectedSku) {
                                        updateDeliveryItem(item.id, 'sku_name', selectedSku.name || selectedSku.sku_name);
                                        // Auto-populate price from account's SKU pricing
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
                                      {/* Show only SKUs from account's SKU pricing if available */}
                                      {(selectedDeliveryAccount?.sku_pricing?.length > 0 
                                        ? selectedDeliveryAccount.sku_pricing 
                                        : skus
                                      ).map(sku => (
                                        <SelectItem key={sku.id} value={sku.id}>
                                          {sku.name || sku.sku_name}
                                          {sku.price_per_unit && ` - ₹${sku.price_per_unit}`}
                                        </SelectItem>
                                      ))}
                                      {selectedDeliveryAccount && (!selectedDeliveryAccount.sku_pricing || selectedDeliveryAccount.sku_pricing.length === 0) && (
                                        <div className="p-2 text-xs text-muted-foreground border-t">
                                          No SKU pricing configured for this account. Showing all SKUs.
                                        </div>
                                      )}
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
                                  ₹{deliveryItems.reduce((sum, item) => {
                                    const gross = item.quantity * item.unit_price;
                                    const afterDiscount = gross * (1 - (item.discount_percent || 0) / 100);
                                    const withTax = afterDiscount * (1 + (item.tax_percent || 0) / 100);
                                    return sum + withTax;
                                  }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

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
                        onClick={handleCreateDelivery}
                        disabled={savingDelivery || !deliveryForm.account_id || !deliveryForm.distributor_location_id || deliveryItems.length === 0}
                        data-testid="save-delivery-btn"
                      >
                        {savingDelivery ? 'Creating...' : 'Record Delivery'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
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
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="deliveries-table">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Delivery #</th>
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-left p-3 font-medium">Account</th>
                        <th className="text-right p-3 font-medium">Qty</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                        <th className="text-right p-3 font-medium">Margin</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map((delivery) => (
                        <tr key={delivery.id} className="border-b hover:bg-muted/30" data-testid={`delivery-row-${delivery.id}`}>
                          <td className="p-3">
                            <button 
                              className="font-medium text-primary hover:underline"
                              onClick={() => viewDeliveryDetail(delivery.id)}
                            >
                              {delivery.delivery_number}
                            </button>
                            {delivery.reference_number && (
                              <p className="text-xs text-muted-foreground">{delivery.reference_number}</p>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {new Date(delivery.delivery_date).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{delivery.account_name}</p>
                              <p className="text-xs text-muted-foreground">{delivery.account_city}</p>
                            </div>
                          </td>
                          <td className="p-3 text-right font-medium">{delivery.total_quantity}</td>
                          <td className="p-3 text-right font-medium">₹{delivery.total_net_amount?.toLocaleString()}</td>
                          <td className="p-3 text-right">
                            {delivery.total_margin_amount > 0 ? (
                              <span className="font-medium text-green-600">₹{delivery.total_margin_amount?.toLocaleString()}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {getDeliveryStatusBadge(delivery.status)}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => viewDeliveryDetail(delivery.id)}
                                data-testid={`view-delivery-${delivery.id}`}
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                              {canManage && delivery.status === 'draft' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget({
                                    type: 'delivery',
                                    id: delivery.id,
                                    name: delivery.delivery_number
                                  })}
                                  data-testid={`delete-delivery-${delivery.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
          </Card>
        </TabsContent>

        {/* Settlements Tab */}
        <TabsContent value="settlements">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Settlement History</CardTitle>
                <CardDescription>Payout settlements for this distributor</CardDescription>
              </div>
              {canManage && (
                <Dialog open={showSettlementDialog} onOpenChange={(open) => {
                  setShowSettlementDialog(open);
                  if (!open) resetSettlementForm();
                }}>
                  <DialogTrigger asChild>
                    <Button data-testid="create-settlement-btn">
                      <Plus className="h-4 w-4 mr-2" />
                      Generate Settlement
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Generate Settlement</DialogTitle>
                      <DialogDescription>
                        Create a settlement for completed deliveries in a period
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {/* Period Selection */}
                      <div className="space-y-2">
                        <Label>Settlement Period Type</Label>
                        <Select
                          value={settlementForm.period_type}
                          onValueChange={(v) => setSettlementForm(prev => ({ ...prev, period_type: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select period type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Period Start *</Label>
                          <Input
                            type="date"
                            value={settlementForm.period_start}
                            onChange={(e) => setSettlementForm(prev => ({ ...prev, period_start: e.target.value }))}
                            data-testid="settlement-start-date"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Period End *</Label>
                          <Input
                            type="date"
                            value={settlementForm.period_end}
                            onChange={(e) => setSettlementForm(prev => ({ ...prev, period_end: e.target.value }))}
                            data-testid="settlement-end-date"
                          />
                        </div>
                      </div>

                      {/* Preview of unsettled deliveries */}
                      {settlementForm.period_start && settlementForm.period_end && (
                        <div className="border rounded-lg p-4 bg-muted/30">
                          <div className="flex items-center justify-between mb-3">
                            <Label className="text-base font-semibold">Deliveries to Settle</Label>
                            {unsettledLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                          </div>
                          
                          {unsettledDeliveries.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground">
                              <p className="text-sm">No unsettled deliveries found for this period</p>
                            </div>
                          ) : (
                            <>
                              <div className="max-h-48 overflow-y-auto border rounded mb-3">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted sticky top-0">
                                    <tr>
                                      <th className="text-left p-2">Delivery #</th>
                                      <th className="text-left p-2">Account</th>
                                      <th className="text-right p-2">Amount</th>
                                      <th className="text-right p-2">Margin</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {unsettledDeliveries.map(del => (
                                      <tr key={del.id} className="border-t">
                                        <td className="p-2">{del.delivery_number}</td>
                                        <td className="p-2">{del.account_name}</td>
                                        <td className="p-2 text-right">₹{del.total_net_amount?.toLocaleString()}</td>
                                        <td className="p-2 text-right text-green-600">₹{del.total_margin_amount?.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div className="grid grid-cols-3 gap-4 text-center">
                                <div className="bg-background rounded p-2">
                                  <div className="text-xs text-muted-foreground">Deliveries</div>
                                  <div className="font-bold">{unsettledDeliveries.length}</div>
                                </div>
                                <div className="bg-background rounded p-2">
                                  <div className="text-xs text-muted-foreground">Total Amount</div>
                                  <div className="font-bold">₹{unsettledDeliveries.reduce((sum, d) => sum + (d.total_net_amount || 0), 0).toLocaleString()}</div>
                                </div>
                                <div className="bg-green-50 rounded p-2">
                                  <div className="text-xs text-muted-foreground">Total Margin (Payout)</div>
                                  <div className="font-bold text-green-600">₹{unsettledDeliveries.reduce((sum, d) => sum + (d.total_margin_amount || 0), 0).toLocaleString()}</div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Remarks */}
                      <div className="space-y-2">
                        <Label>Remarks</Label>
                        <Textarea
                          placeholder="Any notes for this settlement..."
                          value={settlementForm.remarks}
                          onChange={(e) => setSettlementForm(prev => ({ ...prev, remarks: e.target.value }))}
                          rows={2}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowSettlementDialog(false)}>Cancel</Button>
                      <Button
                        onClick={handleCreateSettlement}
                        disabled={savingSettlement || !settlementForm.period_start || !settlementForm.period_end || unsettledDeliveries.length === 0}
                        data-testid="save-settlement-btn"
                      >
                        {savingSettlement ? 'Creating...' : 'Generate Settlement'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {settlementsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : settlements.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No settlements generated</p>
                  <p className="text-sm">Generate a settlement to calculate distributor payout</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="settlements-table">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Settlement #</th>
                        <th className="text-left p-3 font-medium">Period</th>
                        <th className="text-right p-3 font-medium">Deliveries</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                        <th className="text-right p-3 font-medium">Payout</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map((settlement) => (
                        <tr key={settlement.id} className="border-b hover:bg-muted/30" data-testid={`settlement-row-${settlement.id}`}>
                          <td className="p-3">
                            <button 
                              className="font-medium text-primary hover:underline"
                              onClick={() => viewSettlementDetail(settlement.id)}
                            >
                              {settlement.settlement_number}
                            </button>
                          </td>
                          <td className="p-3">
                            <div className="text-sm">
                              {new Date(settlement.period_start).toLocaleDateString()} - {new Date(settlement.period_end).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-muted-foreground capitalize">{settlement.period_type}</div>
                          </td>
                          <td className="p-3 text-right">{settlement.total_deliveries}</td>
                          <td className="p-3 text-right">₹{settlement.total_delivery_amount?.toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <span className="font-bold text-green-600">₹{settlement.final_payout?.toLocaleString()}</span>
                            {settlement.adjustments !== 0 && (
                              <div className="text-xs text-muted-foreground">
                                (adj: {settlement.adjustments > 0 ? '+' : ''}₹{settlement.adjustments})
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {getSettlementStatusBadge(settlement.status)}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => viewSettlementDetail(settlement.id)}
                                data-testid={`view-settlement-${settlement.id}`}
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                              {canManage && settlement.status === 'draft' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget({
                                    type: 'settlement',
                                    id: settlement.id,
                                    name: settlement.settlement_number
                                  })}
                                  data-testid={`delete-settlement-${settlement.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
          </Card>
        </TabsContent>

        {/* Billing & Reconciliation Tab */}
        <TabsContent value="billing" className="space-y-6">
          {/* Summary Cards */}
          {billingSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Base Prices Configured</p>
                  <p className="text-2xl font-bold">{billingSummary.billing_configs || 0}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100/50">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Unreconciled Deliveries</p>
                  <p className="text-2xl font-bold">{billingSummary.unreconciled_deliveries || 0}</p>
                </CardContent>
              </Card>
              <Card className={`bg-gradient-to-br ${billingSummary.net_balance > 0 ? 'from-red-50 to-red-100/50' : 'from-green-50 to-green-100/50'}`}>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Net Balance</p>
                  <p className="text-2xl font-bold">
                    ₹{Math.abs(billingSummary.net_balance || 0).toLocaleString()}
                    <span className="text-sm font-normal ml-1">
                      {billingSummary.net_balance > 0 ? '(Receivable)' : billingSummary.net_balance < 0 ? '(Payable)' : ''}
                    </span>
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Pending Credit Notes</p>
                  <p className="text-2xl font-bold">₹{(billingSummary.pending_credit_amount || 0).toLocaleString()}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Pricing Configuration Note */}
          <Card className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Settings className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800">Base Prices & Margins</p>
                  <p className="text-sm text-blue-700 mt-1">
                    Base prices and margin percentages are now configured in the <strong>Margins</strong> tab.
                    Go to the Margins tab to set up pricing per SKU per city, with active date ranges for time-based validity.
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2 border-blue-300 text-blue-700 hover:bg-blue-100"
                    onClick={() => setActiveTab('margins')}
                  >
                    Go to Margins Tab
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reconciliations Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Reconciliations
                </CardTitle>
                {canManage && (
                  <Button onClick={() => {
                    setShowReconciliationDialog(true);
                    setReconciliationPreview(null);
                  }} data-testid="new-reconciliation-btn">
                    <Plus className="h-4 w-4 mr-2" />
                    New Reconciliation
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Compare provisional billing vs actual customer sales</p>
            </CardHeader>
            <CardContent>
              {reconciliationsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
              ) : reconciliations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No reconciliations yet</p>
                  <p className="text-sm">Create a reconciliation to compare provisional vs actual amounts</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Reconciliation #</th>
                        <th className="text-left p-3 font-medium">Period</th>
                        <th className="text-right p-3 font-medium">Deliveries</th>
                        <th className="text-right p-3 font-medium">Provisional</th>
                        <th className="text-right p-3 font-medium">Actual Net</th>
                        <th className="text-right p-3 font-medium">Difference</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliations.map((rec) => (
                        <tr key={rec.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => viewReconciliationDetail(rec.id)}>
                          <td className="p-3 font-medium">{rec.reconciliation_number}</td>
                          <td className="p-3">{rec.period_start} to {rec.period_end}</td>
                          <td className="p-3 text-right">{rec.total_deliveries}</td>
                          <td className="p-3 text-right">₹{rec.total_provisional_amount?.toLocaleString()}</td>
                          <td className="p-3 text-right">₹{rec.total_actual_net_amount?.toLocaleString()}</td>
                          <td className={`p-3 text-right font-medium ${rec.total_difference > 0 ? 'text-red-600' : rec.total_difference < 0 ? 'text-green-600' : ''}`}>
                            {rec.total_difference > 0 ? '+' : ''}₹{rec.total_difference?.toLocaleString()}
                          </td>
                          <td className="p-3 text-center">{getReconciliationStatusBadge(rec.status)}</td>
                          <td className="p-3 text-right">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Debit/Credit Notes Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Debit / Credit Notes
              </CardTitle>
              <p className="text-sm text-muted-foreground">Settlement documents generated from reconciliations</p>
            </CardHeader>
            <CardContent>
              {notesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin" />
                </div>
              ) : debitCreditNotes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No debit/credit notes yet</p>
                  <p className="text-sm">Notes are generated when reconciliations are confirmed</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Note #</th>
                        <th className="text-left p-3 font-medium">Type</th>
                        <th className="text-right p-3 font-medium">Amount</th>
                        <th className="text-right p-3 font-medium">Paid</th>
                        <th className="text-right p-3 font-medium">Balance</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium">Date</th>
                        <th className="text-right p-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debitCreditNotes.map((note) => (
                        <tr key={note.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => viewNoteDetail(note.id)}>
                          <td className="p-3 font-medium">{note.note_number}</td>
                          <td className="p-3">
                            <Badge variant={note.note_type === 'debit' ? 'destructive' : 'default'}>
                              {note.note_type === 'debit' ? 'Debit Note' : 'Credit Note'}
                            </Badge>
                          </td>
                          <td className="p-3 text-right font-medium">₹{note.amount?.toLocaleString()}</td>
                          <td className="p-3 text-right text-green-600">₹{(note.paid_amount || 0).toLocaleString()}</td>
                          <td className="p-3 text-right text-orange-600">₹{(note.balance_amount || note.amount || 0).toLocaleString()}</td>
                          <td className="p-3 text-center">{getNoteStatusBadge(note.status)}</td>
                          <td className="p-3">{note.created_at?.split('T')[0]}</td>
                          <td className="p-3 text-right">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
                          {item.margin_amount > 0 ? (
                            <span className="text-green-600">₹{item.margin_amount?.toFixed(2)}</span>
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
                        {selectedDelivery.total_margin_amount > 0 ? `₹${selectedDelivery.total_margin_amount?.toLocaleString()}` : '-'}
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              Settlement {selectedSettlement?.settlement_number}
              {selectedSettlement && getSettlementStatusBadge(selectedSettlement.status)}
            </DialogTitle>
          </DialogHeader>
          {selectedSettlement && (
            <div className="space-y-4">
              {/* Settlement Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Period:</span>
                  <div className="font-medium">
                    {new Date(selectedSettlement.period_start).toLocaleDateString()} - {new Date(selectedSettlement.period_end).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <div className="font-medium capitalize">{selectedSettlement.period_type}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Deliveries:</span>
                  <div className="font-medium">{selectedSettlement.total_deliveries}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Quantity:</span>
                  <div className="font-medium">{selectedSettlement.total_quantity}</div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/30 rounded-lg p-4 text-center">
                  <div className="text-sm text-muted-foreground">Delivery Amount</div>
                  <div className="text-xl font-bold">₹{selectedSettlement.total_delivery_amount?.toLocaleString()}</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-sm text-muted-foreground">Margin Earned</div>
                  <div className="text-xl font-bold text-blue-600">₹{selectedSettlement.total_margin_amount?.toLocaleString()}</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-sm text-muted-foreground">Final Payout</div>
                  <div className="text-xl font-bold text-green-600">₹{selectedSettlement.final_payout?.toLocaleString()}</div>
                  {selectedSettlement.adjustments !== 0 && (
                    <div className="text-xs text-muted-foreground">
                      (Adjustment: {selectedSettlement.adjustments > 0 ? '+' : ''}₹{selectedSettlement.adjustments})
                    </div>
                  )}
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
                        <th className="text-left p-2">Account</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Amount</th>
                        <th className="text-right p-2">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedSettlement.items || []).map((item, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{item.delivery_number}</td>
                          <td className="p-2">{new Date(item.delivery_date).toLocaleDateString()}</td>
                          <td className="p-2">{item.account_name}</td>
                          <td className="p-2 text-right">{item.total_quantity}</td>
                          <td className="p-2 text-right">₹{item.total_amount?.toLocaleString()}</td>
                          <td className="p-2 text-right text-green-600">₹{item.margin_amount?.toLocaleString()}</td>
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
                {selectedSettlement.status === 'approved' && canManage && (
                  <Button onClick={() => handleMarkPaid(selectedSettlement.id)} className="bg-green-600 hover:bg-green-700">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Mark as Paid
                  </Button>
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
