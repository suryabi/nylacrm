import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { accountsAPI, usersAPI, skusAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { 
  ArrowLeft, Building2, Phone, MapPin, Save, Loader2, Plus, Trash2, FileText,
  DollarSign, CreditCard, Calendar, AlertTriangle, TrendingUp, Truck, Search, Copy, ExternalLink,
  Upload, Download, CheckCircle, XCircle, Clock, MessageSquare, FileCheck, ChevronDown, ChevronRight, ChevronLeft, Package
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import LogoUploader from '../components/LogoUploader';
import ExpenseRequestSection from '../components/ExpenseRequestSection';
import AppBreadcrumb from '../components/AppBreadcrumb';
import AccountScoringCard from '../components/AccountScoringCard';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Invoice Card Component with expandable line items
function InvoiceCard({ invoice }) {
  const [expanded, setExpanded] = React.useState(false);
  const hasLineItems = invoice.items && invoice.items.length > 0;
  const totalBottles = hasLineItems 
    ? invoice.items.reduce((sum, item) => sum + (item.bottles || item.quantity || 0), 0)
    : (invoice.total_bottles || 0);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Invoice Header - Clickable */}
      <div 
        className={`flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors ${hasLineItems ? '' : 'cursor-default'}`}
        onClick={() => hasLineItems && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {hasLineItems && (
            <span className="text-muted-foreground">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
          )}
          <div>
            <p className="font-semibold text-primary">{invoice.invoice_number}</p>
            <p className="text-xs text-muted-foreground">{invoice.invoice_date}</p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          {totalBottles > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Package className="h-4 w-4" />
              <span>{totalBottles.toLocaleString()} bottles</span>
            </div>
          )}
          <div className="text-right">
            <p className="font-semibold text-green-600">₹{Math.round(invoice.gross_amount || 0).toLocaleString()}</p>
            {invoice.gross_margin_percent > 0 && (
              <p className="text-xs text-muted-foreground">Margin: {invoice.gross_margin_percent}%</p>
            )}
          </div>
        </div>
      </div>

      {/* Line Items - Expandable */}
      {expanded && hasLineItems && (
        <div className="border-t">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground">SKU</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground">Bottles</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground">Price/Bottle</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground">COGS</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground">Logistics</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => (
                <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="py-2 px-3">
                    <p className="font-medium">{item.sku_name || item.sku || 'N/A'}</p>
                    {item.sku_code && <p className="text-xs text-muted-foreground">{item.sku_code}</p>}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{(item.bottles || item.quantity || 0).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums">₹{(item.price_per_bottle || item.unit_price || 0).toFixed(2)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-red-600">₹{(item.cogs_total || 0).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-orange-600">₹{(item.logistics_total || 0).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right font-medium tabular-nums">₹{Math.round(item.line_total || item.total || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t">
              <tr>
                <td className="py-2 px-3 font-semibold">Total</td>
                <td className="py-2 px-3 text-right font-semibold tabular-nums">{totalBottles.toLocaleString()}</td>
                <td className="py-2 px-3"></td>
                <td className="py-2 px-3 text-right font-semibold text-red-600 tabular-nums">₹{Math.round(invoice.total_cogs || 0).toLocaleString()}</td>
                <td className="py-2 px-3 text-right font-semibold text-orange-600 tabular-nums">₹{Math.round(invoice.total_logistics || 0).toLocaleString()}</td>
                <td className="py-2 px-3 text-right font-semibold text-green-600 tabular-nums">₹{Math.round(invoice.gross_amount || 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
          
          {/* Margin Summary */}
          <div className="p-3 bg-slate-100 border-t">
            <p className="text-xs font-semibold text-slate-600 mb-2">MARGIN SUMMARY</p>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Revenue</p>
                <p className="font-semibold">₹{Math.round(invoice.gross_amount || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">COGS</p>
                <p className="font-semibold text-red-600">-₹{Math.round(invoice.total_cogs || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Logistics</p>
                <p className="font-semibold text-orange-600">-₹{Math.round(invoice.total_logistics || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Gross Margin</p>
                <p className={`font-semibold ${(invoice.gross_margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₹{Math.round(invoice.gross_margin || 0).toLocaleString()} ({invoice.gross_margin_percent || 0}%)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Roles that can approve/reject contracts
const CONTRACT_APPROVER_ROLES = ['ceo', 'CEO', 'director', 'Director', 'vp', 'Vice President', 'national_sales_head', 'National Sales Head', 'admin'];

const contractStatusConfig = {
  'pending_review': { label: 'Pending Review', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock },
  'changes_requested': { label: 'Changes Requested', color: 'bg-orange-100 text-orange-800 border-orange-200', icon: MessageSquare },
  'revised': { label: 'Revised', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: FileText },
  'approved': { label: 'Approved', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle },
  'rejected': { label: 'Rejected', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
};

const accountTypeColors = {
  'Tier 1': 'bg-emerald-100 text-emerald-800',
  'Tier 2': 'bg-blue-100 text-blue-800',
  'Tier 3': 'bg-gray-100 text-gray-800',
};

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { updateCurrentLabel, navigateTo } = useNavigation();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [users, setUsers] = useState([]);
  const [masterSkus, setMasterSkus] = useState([]);
  
  // Contract state
  const [contract, setContract] = useState(null);
  const [loadingContract, setLoadingContract] = useState(false);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [reviewingContract, setReviewingContract] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const contractInputRef = useRef(null);
  
  // Editable fields
  const [accountName, setAccountName] = useState('');
  const [accountType, setAccountType] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState('');
  const [skuPricing, setSkuPricing] = useState([]);
  const [onboardedMonth, setOnboardedMonth] = useState('');
  const [onboardedYear, setOnboardedYear] = useState('');
  const [includeInGopMetrics, setIncludeInGopMetrics] = useState(true);
  
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
  
  // Invoice creation state
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceLineItems, setInvoiceLineItems] = useState([{ sku_name: '', bottles: 0, price_per_bottle: 0 }]);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  
  // Invoice pagination and filter state
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceLimit, setInvoiceLimit] = useState(5);
  const [invoiceTimeFilter, setInvoiceTimeFilter] = useState('lifetime');
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(0);
  const [invoiceTotalCount, setInvoiceTotalCount] = useState(0);

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

  // Handle address selection from suggestions
  const handleSelectAddress = async (placeId, description) => {
    // Parse the address from the description
    // The description typically contains the full formatted address
    const parts = description.split(',').map(p => p.trim());
    
    let newAddress = {
      address_line1: description,
      address_line2: '',
      city: account?.city || '',
      state: account?.state || '',
      pincode: '',
      landmark: ''
    };

    // Try to extract city, state, pincode from description
    if (parts.length >= 2) {
      // Last part is usually country
      // Second to last is usually state + pincode
      // Third to last is usually city
      const lastPart = parts[parts.length - 1];
      const secondLast = parts[parts.length - 2];
      
      // Check for pincode (6 digit number in India)
      const pincodeMatch = description.match(/\b(\d{6})\b/);
      if (pincodeMatch) {
        newAddress.pincode = pincodeMatch[1];
      }
      
      // If we have enough parts, try to identify city
      if (parts.length >= 3) {
        const thirdLast = parts[parts.length - 3];
        if (thirdLast && !thirdLast.match(/^\d+$/)) {
          newAddress.city = thirdLast.replace(/\d{6}/, '').trim();
        }
      }
      
      // Try to get address line 1 (everything before city/state)
      if (parts.length >= 4) {
        newAddress.address_line1 = parts.slice(0, parts.length - 3).join(', ');
        newAddress.address_line2 = parts[parts.length - 3];
      }
    }

    // Use account's city/state if extraction failed
    if (!newAddress.city || newAddress.city.length < 2) {
      newAddress.city = account?.city || '';
    }
    if (!newAddress.state || newAddress.state.length < 2) {
      newAddress.state = account?.state || '';
    }

    setDeliveryAddress(newAddress);
    setAddressSearchQuery(description);
    setAddressSuggestions([]);
    toast.success('Address selected - please verify the details');
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

  // Copy delivery address with outlet name and Google Maps link
  // Copy delivery address with outlet name and Google Maps link
  const handleCopyDeliveryAddress = () => {
    const outletName = account?.account_name || 'Unknown Outlet';
    
    // Build full address string
    const addressParts = [
      deliveryAddress.address_line1,
      deliveryAddress.address_line2,
      deliveryAddress.landmark,
      deliveryAddress.city,
      deliveryAddress.state,
      deliveryAddress.pincode
    ].filter(part => part && part.trim());
    
    const fullAddress = addressParts.join(', ');
    
    // Create Google Maps place link
    const mapsQuery = encodeURIComponent(`${fullAddress}, India`);
    const googleMapsLink = `https://www.google.com/maps/place/${mapsQuery}`;
    
    // Format the text to copy
    const textToCopy = `${outletName}
${fullAddress}

${googleMapsLink}`;

    // Copy to clipboard
    navigator.clipboard.writeText(textToCopy).then(() => {
      toast.success('Address copied to clipboard!');
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('Address copied to clipboard!');
    });
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
      setGstNumber(data.gst_number || '');
      setNextFollowUp(data.next_follow_up || '');
      setSkuPricing(data.sku_pricing || []);
      setOnboardedMonth(data.onboarded_month || '');
      setOnboardedYear(data.onboarded_year || '');
      // Default B2B → include, Retail → exclude when unset
      if (typeof data.include_in_gop_metrics === 'boolean') {
        setIncludeInGopMetrics(data.include_in_gop_metrics);
      } else {
        setIncludeInGopMetrics((data.lead_type || 'B2B').toLowerCase() !== 'retail');
      }
      
      // Update breadcrumb with account name
      if (data.account_name) {
        updateCurrentLabel(data.account_name);
      }
      
      // Load delivery address if exists
      if (data.delivery_address) {
        setDeliveryAddress(data.delivery_address);
        setAddressSearchQuery(data.delivery_address.address_line1 || '');
      }
      
      // Fetch invoices and contract
      console.log('[ACCOUNT_DETAIL] Fetching invoices for id:', id);
      fetchInvoices(id);
      fetchContract(data.account_id || id);
    } catch (error) {
      toast.error('Failed to load account details');
      navigateTo('/accounts', { fromSidebar: true });
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoices = async (accountId, page = invoicePage, limit = invoiceLimit, timeFilter = invoiceTimeFilter) => {
    console.log('[INVOICE_FETCH] Starting fetch for account:', accountId, 'page:', page, 'limit:', limit, 'timeFilter:', timeFilter);
    setLoadingInvoices(true);
    try {
      const response = await accountsAPI.getInvoices(accountId, { page, limit, time_filter: timeFilter });
      console.log('[INVOICE_FETCH] Response:', response.data);
      setInvoiceData(response.data);
      setInvoiceTotalPages(response.data.pages || 0);
      setInvoiceTotalCount(response.data.total || 0);
    } catch (error) {
      console.error('[INVOICE_FETCH] Error fetching invoices:', error);
      console.log('No invoice data available');
    } finally {
      setLoadingInvoices(false);
    }
  };
  
  // Refetch invoices when pagination or filter changes
  useEffect(() => {
    if (id) {
      fetchInvoices(id, invoicePage, invoiceLimit, invoiceTimeFilter);
    }
  }, [invoicePage, invoiceLimit, invoiceTimeFilter]);

  // Invoice creation functions
  const handleAddInvoiceLineItem = () => {
    setInvoiceLineItems([...invoiceLineItems, { sku_name: '', bottles: 0, price_per_bottle: 0 }]);
  };

  const handleRemoveInvoiceLineItem = (index) => {
    if (invoiceLineItems.length > 1) {
      setInvoiceLineItems(invoiceLineItems.filter((_, i) => i !== index));
    }
  };

  const handleInvoiceLineItemChange = (index, field, value) => {
    const updated = [...invoiceLineItems];
    updated[index] = { 
      ...updated[index], 
      [field]: field === 'sku_name' ? value : (parseFloat(value) || 0)
    };
    setInvoiceLineItems(updated);
  };

  const calculateInvoiceTotal = () => {
    return invoiceLineItems.reduce((sum, item) => sum + (item.bottles * item.price_per_bottle), 0);
  };

  const handleCreateInvoice = async () => {
    // Validate line items
    const validItems = invoiceLineItems.filter(item => item.sku_name && item.bottles > 0 && item.price_per_bottle > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one valid line item');
      return;
    }

    setCreatingInvoice(true);
    try {
      const response = await accountsAPI.createInvoice(account.id || account.account_id, {
        invoice_date: invoiceDate,
        line_items: validItems,
        notes: invoiceNotes || null
      });

      toast.success(`Invoice ${response.data.invoice.invoice_number} created successfully!`, {
        description: `Gross Margin: ₹${response.data.margin_summary.gross_margin.toLocaleString()} (${response.data.margin_summary.gross_margin_percent}%)`
      });

      // Reset form and close modal
      setShowCreateInvoice(false);
      setInvoiceDate(new Date().toISOString().split('T')[0]);
      setInvoiceLineItems([{ sku_name: '', bottles: 0, price_per_bottle: 0 }]);
      setInvoiceNotes('');

      // Refresh invoice data
      fetchInvoices(account.id || account.account_id);
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to create invoice';
      toast.error(errorMessage);
    } finally {
      setCreatingInvoice(false);
    }
  };

  const fetchContract = async (accountId) => {
    setLoadingContract(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/accounts/${accountId}/contract`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setContract(response.data.contract);
    } catch (error) {
      console.log('No contract available');
    } finally {
      setLoadingContract(false);
    }
  };

  const handleContractUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only PDF and DOC/DOCX files are allowed');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5 MB');
      return;
    }

    setUploadingContract(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(
        `${API_URL}/accounts/${account.account_id}/contract`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          },
          withCredentials: true
        }
      );

      setContract(response.data.contract);
      toast.success(response.data.message || 'Contract uploaded successfully');
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to upload contract';
      toast.error(errorMessage, { description: 'Please try again', duration: 6000 });
    } finally {
      setUploadingContract(false);
      if (contractInputRef.current) {
        contractInputRef.current.value = '';
      }
    }
  };

  const handleContractDownload = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/accounts/${account.account_id}/contract/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );

      const contractData = response.data.contract;
      if (!contractData?.file_data) {
        toast.error('Contract file not found');
        return;
      }

      // Decode base64 and create download
      const byteCharacters = atob(contractData.file_data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: contractData.content_type });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = contractData.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download contract');
    }
  };

  const handleContractDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this contract?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_URL}/accounts/${account.account_id}/contract`,
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      setContract(null);
      toast.success('Contract deleted successfully');
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to delete contract';
      toast.error(errorMessage, { duration: 6000 });
    }
  };

  const handleContractReview = async (action) => {
    setReviewingContract(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `${API_URL}/accounts/${account.account_id}/contract/review`,
        { action, comment: reviewComment },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      setContract(response.data.contract);
      setReviewComment('');
      setShowReviewForm(false);
      toast.success(response.data.message || `Contract ${action.replace('_', ' ')}`);
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Failed to review contract';
      toast.error(errorMessage, { duration: 6000 });
    } finally {
      setReviewingContract(false);
    }
  };

  const canApproveContract = user && CONTRACT_APPROVER_ROLES.includes(user.role);

  const handleSave = async () => {
    setSaving(true);
    try {
      await accountsAPI.update(id, {
        account_name: accountName,
        account_type: accountType || null,
        contact_name: contactName || null,
        contact_number: contactNumber || null,
        gst_number: gstNumber || null,
        next_follow_up: nextFollowUp || null,
        sku_pricing: skuPricing,
        onboarded_month: onboardedMonth ? parseInt(onboardedMonth) : null,
        onboarded_year: onboardedYear ? parseInt(onboardedYear) : null,
        include_in_gop_metrics: includeInGopMetrics,
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

  // Check if user is admin (CEO or Director)
  const isAdmin = user?.role === 'CEO' || user?.role === 'Director';
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!window.confirm(`Are you sure you want to delete account "${account.account_name}"? This action cannot be undone.`)) {
      return;
    }
    
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/accounts/${id}`, { withCredentials: true });
      toast.success('Account deleted successfully');
      navigateTo('/accounts', { fromSidebar: true });
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Failed to delete account';
      toast.error(errorMsg);
    } finally {
      setDeleting(false);
    }
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
        <Button onClick={() => navigateTo('/accounts', { fromSidebar: true })} className="mt-4">
          Back to Accounts
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="account-detail-page">
      {/* Breadcrumb */}
      <AppBreadcrumb currentLabel={account?.account_name} />
      
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigateTo('/accounts', { fromSidebar: true })} data-testid="back-button">
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
            {account.lead_type && (
              <Badge
                variant="outline"
                className={
                  account.lead_type === 'Retail'
                    ? 'bg-violet-50 text-violet-700 border-violet-300'
                    : 'bg-sky-50 text-sky-700 border-sky-300'
                }
                data-testid="account-lead-type-badge"
              >
                {account.lead_type}
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
            setOnboardedMonth(account.onboarded_month || '');
            setOnboardedYear(account.onboarded_year || '');
          }}>
            Cancel
          </Button>
        )}
        {isAdmin && !isEditing && (
          <Button 
            variant="outline" 
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={handleDeleteAccount}
            disabled={deleting}
            data-testid="delete-account-button"
          >
            {deleting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting...</>
            ) : (
              <><Trash2 className="h-4 w-4 mr-2" /> Delete Account</>
            )}
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
                <div className="space-y-2">
                  <Label>GST Number</Label>
                  <Input
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                    placeholder="e.g., 29ABCDE1234F1Z5"
                    maxLength={15}
                    data-testid="edit-gst-number"
                  />
                  <p className="text-xs text-muted-foreground">15-character GST Identification Number</p>
                </div>
                <div className="space-y-2">
                  <Label>Next Follow-up Date</Label>
                  <Input
                    type="date"
                    value={nextFollowUp}
                    onChange={(e) => setNextFollowUp(e.target.value)}
                    data-testid="edit-follow-up-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Actual Onboarded Month</Label>
                  <Select value={onboardedMonth ? String(onboardedMonth) : ''} onValueChange={setOnboardedMonth}>
                    <SelectTrigger data-testid="edit-onboarded-month">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {[{v:'1',l:'January'},{v:'2',l:'February'},{v:'3',l:'March'},{v:'4',l:'April'},{v:'5',l:'May'},{v:'6',l:'June'},{v:'7',l:'July'},{v:'8',l:'August'},{v:'9',l:'September'},{v:'10',l:'October'},{v:'11',l:'November'},{v:'12',l:'December'}].map(m => (
                        <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Actual Onboarded Year</Label>
                  <Select value={onboardedYear ? String(onboardedYear) : ''} onValueChange={setOnboardedYear}>
                    <SelectTrigger data-testid="edit-onboarded-year">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {[2024, 2025, 2026, 2027].map(y => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2 flex items-start justify-between gap-4 p-4 rounded-lg border bg-muted/30">
                  <div className="space-y-1">
                    <Label htmlFor="include-gop-toggle" className="text-sm font-medium">
                      Include in Account GOP Metrics
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      When ON, this account is considered in the top-tile averages on Account GOP Metrics.
                      Default: B2B = On, Retail = Off.
                    </p>
                  </div>
                  <Switch
                    id="include-gop-toggle"
                    checked={includeInGopMetrics}
                    onCheckedChange={setIncludeInGopMetrics}
                    data-testid="toggle-include-in-gop"
                  />
                </div>
                <div className="md:col-span-2 pt-4 border-t">
                  <LogoUploader
                    entityType="accounts"
                    entityId={account.id || account.account_id}
                    currentLogo={account.logo_url ? `${process.env.REACT_APP_BACKEND_URL}${account.logo_url}` : null}
                    onLogoUpdate={(newLogoUrl) => {
                      fetchAccount();
                    }}
                    label="Account Logo"
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
                  <p className="text-sm text-muted-foreground">Lead Type</p>
                  <p className="font-medium" data-testid="account-lead-type-display">{account.lead_type || 'B2B'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Include in GOP Metrics</p>
                  <p className="font-medium" data-testid="account-include-gop-display">
                    {(() => {
                      const val = typeof account.include_in_gop_metrics === 'boolean'
                        ? account.include_in_gop_metrics
                        : (account.lead_type || 'B2B').toLowerCase() !== 'retail';
                      return val ? 'Yes' : 'No';
                    })()}
                  </p>
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
                {account.gst_number && (
                  <div>
                    <p className="text-sm text-muted-foreground">GST Number</p>
                    <p className="font-medium font-mono tracking-wider">{account.gst_number}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Next Follow-up</p>
                  <p className="font-medium">{account.next_follow_up || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Actual Onboarded</p>
                  <p className="font-medium" data-testid="account-onboarded-display">
                    {account.onboarded_month && account.onboarded_year
                      ? `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][account.onboarded_month - 1]} ${account.onboarded_year}`
                      : '-'}
                  </p>
                </div>
                {account.logo_url && (
                  <div className="md:col-span-2 pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-2">Account Logo</p>
                    <div className="w-24 h-24 border rounded-lg overflow-hidden bg-gray-50">
                      <img 
                        src={`${process.env.REACT_APP_BACKEND_URL}${account.logo_url}`}
                        alt="Account logo"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    {account.logo_width_mm && account.logo_height_mm && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Dimensions: {account.logo_width_mm}mm x {account.logo_height_mm}mm
                      </p>
                    )}
                  </div>
                )}
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Invoice Summary
                {invoiceTotalCount > 0 && (
                  <Badge variant="outline" className="ml-2">{invoiceTotalCount} Total</Badge>
                )}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Time Filter */}
                <Select value={invoiceTimeFilter} onValueChange={(val) => { setInvoiceTimeFilter(val); setInvoicePage(1); }}>
                  <SelectTrigger className="w-[140px] h-8 text-sm" data-testid="invoice-time-filter">
                    <SelectValue placeholder="Time Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="last_week">Last Week</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="last_month">Last Month</SelectItem>
                    <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                    <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                    <SelectItem value="this_quarter">This Quarter</SelectItem>
                    <SelectItem value="lifetime">Lifetime</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button 
                  size="sm" 
                  onClick={() => setShowCreateInvoice(true)}
                  data-testid="create-invoice-btn"
                >
                  <Plus className="h-4 w-4 mr-1" /> Create Invoice
                </Button>
              </div>
            </div>
            {loadingInvoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : invoiceData && invoiceData.invoices?.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                    <p className="text-xs text-green-600 font-medium mb-1">GROSS VALUE</p>
                    <p className="text-lg font-bold text-green-700">₹{(invoiceData.total_amount / 100000).toFixed(2)}L</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                    <p className="text-xs text-blue-600 font-medium mb-1">NET VALUE</p>
                    <p className="text-lg font-bold text-blue-700">₹{(invoiceData.net_amount / 100000).toFixed(2)}L</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                    <p className="text-xs text-amber-600 font-medium mb-1">CREDIT NOTES</p>
                    <p className="text-lg font-bold text-amber-700">₹{((invoiceData.credit_amount || 0) / 100000).toFixed(2)}L</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {invoiceData.invoices.map((inv, idx) => (
                    <InvoiceCard key={idx} invoice={inv} />
                  ))}
                </div>
                
                {/* Pagination Controls */}
                {invoiceTotalPages > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5 pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Show</span>
                      <Select value={invoiceLimit.toString()} onValueChange={(val) => { setInvoiceLimit(parseInt(val)); setInvoicePage(1); }}>
                        <SelectTrigger className="w-[70px] h-8" data-testid="invoice-page-size">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="15">15</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                        </SelectContent>
                      </Select>
                      <span>per page</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Page {invoicePage} of {invoiceTotalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInvoicePage(prev => Math.max(1, prev - 1))}
                        disabled={invoicePage <= 1}
                        data-testid="invoice-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInvoicePage(prev => Math.min(invoiceTotalPages, prev + 1))}
                        disabled={invoicePage >= invoiceTotalPages}
                        data-testid="invoice-next-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-muted-foreground mb-2">No invoices found for {invoiceTimeFilter === 'lifetime' ? 'this account' : invoiceTimeFilter.replace('_', ' ')}</p>
                {invoiceTimeFilter !== 'lifetime' && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setInvoiceTimeFilter('lifetime')}
                    className="mt-2"
                  >
                    View All Time
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* Expense Requests Section */}
          {account && (
            <ExpenseRequestSection
              entityType="account"
              entityId={account.id || account.account_id}
              entityName={account.account_name}
              entityCity={account.city}
            />
          )}
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

            {/* Action Buttons */}
            <div className="flex gap-2 mt-4">
              <Button
                onClick={handleSaveDeliveryAddress}
                className="flex-1"
                disabled={savingAddress || !deliveryAddress.address_line1}
                data-testid="save-delivery-address-btn"
              >
                {savingAddress ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> Save</>
                )}
              </Button>
              <Button
                onClick={handleCopyDeliveryAddress}
                variant="outline"
                disabled={!deliveryAddress.address_line1}
                data-testid="copy-delivery-address-btn"
                title="Copy outlet name, address & Google Maps link"
              >
                <Copy className="h-4 w-4 mr-2" /> Copy
              </Button>
            </div>
            
            {/* Google Maps Link Preview */}
            {deliveryAddress.address_line1 && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <a
                  href={`https://www.google.com/maps/place/${encodeURIComponent([deliveryAddress.address_line1, deliveryAddress.city, deliveryAddress.state, deliveryAddress.pincode].filter(Boolean).join(', ') + ', India')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-800"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Open in Google Maps</span>
                </a>
              </div>
            )}
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

          {/* Signed Contract Section */}
          <Card className="overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-500">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Signed Contract
              </h2>
              <p className="text-sm text-white/80 mt-1">Customer signed agreement document</p>
            </div>
            
            <div className="p-6">
              {loadingContract ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : contract ? (
                <div className="space-y-4">
                  {/* Contract Status Badge */}
                  <div className="flex items-center justify-between">
                    <Badge className={`${contractStatusConfig[contract.status]?.color || 'bg-gray-100'} border px-3 py-1`}>
                      {React.createElement(contractStatusConfig[contract.status]?.icon || Clock, { className: 'h-3.5 w-3.5 mr-1.5 inline' })}
                      {contractStatusConfig[contract.status]?.label || contract.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">v{contract.version}</span>
                  </div>

                  {/* Contract Info */}
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{contract.file_name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Uploaded by {contract.uploaded_by_name} on {format(new Date(contract.uploaded_at), 'MMM d, yyyy h:mm a')}</p>
                      <p>Size: {(contract.file_size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button onClick={handleContractDownload} variant="outline" size="sm" className="flex-1">
                      <Download className="h-4 w-4 mr-1.5" /> Download
                    </Button>
                    {contract.status === 'pending_review' && contract.uploaded_by === user?.id && (
                      <Button onClick={handleContractDelete} variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Replace Contract Button - visible when changes requested */}
                  {contract.status === 'changes_requested' && (
                    <div className="border-t pt-4">
                      <p className="text-sm text-orange-600 mb-2">Changes were requested. Upload a revised contract:</p>
                      <label className="w-full">
                        <input
                          ref={contractInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={handleContractUpload}
                          className="hidden"
                          data-testid="replace-contract-input"
                        />
                        <Button asChild variant="outline" className="w-full" disabled={uploadingContract}>
                          <span>
                            {uploadingContract ? (
                              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
                            ) : (
                              <><Upload className="h-4 w-4 mr-2" /> Upload Revised Contract</>
                            )}
                          </span>
                        </Button>
                      </label>
                    </div>
                  )}

                  {/* Review Section for Approvers */}
                  {canApproveContract && ['pending_review', 'revised'].includes(contract.status) && (
                    <div className="border-t pt-4">
                      {!showReviewForm ? (
                        <Button onClick={() => setShowReviewForm(true)} className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
                          <MessageSquare className="h-4 w-4 mr-2" /> Review Contract
                        </Button>
                      ) : (
                        <div className="space-y-3 bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                          <Label className="text-sm font-medium">Review Comments (optional)</Label>
                          <Textarea
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            placeholder="Add comments about the contract..."
                            rows={3}
                            className="bg-white"
                            data-testid="contract-review-comment"
                          />
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleContractReview('approved')}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                              disabled={reviewingContract}
                              data-testid="approve-contract-btn"
                            >
                              {reviewingContract ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                              Approve
                            </Button>
                            <Button
                              onClick={() => handleContractReview('changes_requested')}
                              variant="outline"
                              className="flex-1 border-orange-300 text-orange-600 hover:bg-orange-50"
                              disabled={reviewingContract}
                              data-testid="request-changes-contract-btn"
                            >
                              <MessageSquare className="h-4 w-4 mr-1" /> Request Changes
                            </Button>
                            <Button
                              onClick={() => handleContractReview('rejected')}
                              variant="outline"
                              className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                              disabled={reviewingContract}
                              data-testid="reject-contract-btn"
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Reject
                            </Button>
                          </div>
                          <Button variant="ghost" onClick={() => setShowReviewForm(false)} className="w-full text-muted-foreground">
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Review History */}
                  {contract.review_comments?.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" /> Review History
                      </h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {contract.review_comments.map((comment, idx) => (
                          <div key={comment.id || idx} className="bg-muted/30 rounded-lg p-3 text-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">{comment.reviewer_name}</span>
                              <Badge variant="outline" className={`text-xs ${
                                comment.action === 'approved' ? 'border-emerald-300 text-emerald-700' :
                                comment.action === 'rejected' ? 'border-red-300 text-red-700' :
                                'border-orange-300 text-orange-700'
                              }`}>
                                {comment.action.replace('_', ' ')}
                              </Badge>
                            </div>
                            {comment.comment && <p className="text-muted-foreground">{comment.comment}</p>}
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(comment.created_at), 'MMM d, yyyy h:mm a')}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* No Contract - Upload Button */
                <div className="text-center py-8">
                  <FileCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground mb-4">No contract uploaded yet</p>
                  <label className="inline-block">
                    <input
                      ref={contractInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleContractUpload}
                      className="hidden"
                      data-testid="upload-contract-input"
                    />
                    <Button asChild className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600" disabled={uploadingContract}>
                      <span>
                        {uploadingContract ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
                        ) : (
                          <><Upload className="h-4 w-4 mr-2" /> Upload Signed Contract</>
                        )}
                      </span>
                    </Button>
                  </label>
                  <p className="text-xs text-muted-foreground mt-2">PDF or DOC/DOCX (Max 5 MB)</p>
                </div>
              )}
            </div>
          </Card>

          {/* Account Scoring Card */}
          <AccountScoringCard 
            accountId={account?.id || id} 
            accountName={account?.account_name} 
          />
        </div>
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Create Invoice for {account?.account_name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Invoice Info */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label className="text-sm font-medium">Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="mt-1"
                  data-testid="invoice-date-input"
                />
              </div>
              <div className="flex-1">
                <Label className="text-sm font-medium">Account City</Label>
                <Input value={account?.city || ''} disabled className="mt-1 bg-muted" />
                <p className="text-xs text-muted-foreground mt-1">COGS & logistics calculated for this city</p>
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium">Line Items</Label>
                <Button size="sm" variant="outline" onClick={handleAddInvoiceLineItem} data-testid="add-invoice-line-item-btn">
                  <Plus className="h-4 w-4 mr-1" /> Add Line
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">SKU</th>
                      <th className="text-right p-3 font-medium w-32">Bottles</th>
                      <th className="text-right p-3 font-medium w-40">Price/Bottle (₹)</th>
                      <th className="text-right p-3 font-medium w-32">Line Total</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {invoiceLineItems.map((item, index) => (
                      <tr key={index} className="bg-white">
                        <td className="p-2">
                          <Select
                            value={item.sku_name}
                            onValueChange={(val) => handleInvoiceLineItemChange(index, 'sku_name', val)}
                          >
                            <SelectTrigger data-testid={`invoice-sku-select-${index}`}>
                              <SelectValue placeholder="Select SKU" />
                            </SelectTrigger>
                            <SelectContent>
                              {masterSkus.map((sku) => (
                                <SelectItem key={sku.sku || sku.sku_name} value={sku.sku || sku.sku_name}>
                                  {sku.sku || sku.sku_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            value={item.bottles || ''}
                            onChange={(e) => handleInvoiceLineItemChange(index, 'bottles', e.target.value)}
                            min="0"
                            className="text-right"
                            placeholder="0"
                            data-testid={`invoice-bottles-input-${index}`}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            value={item.price_per_bottle || ''}
                            onChange={(e) => handleInvoiceLineItemChange(index, 'price_per_bottle', e.target.value)}
                            min="0"
                            step="0.01"
                            className="text-right"
                            placeholder="0.00"
                            data-testid={`invoice-price-input-${index}`}
                          />
                        </td>
                        <td className="p-2 text-right font-medium tabular-nums">
                          ₹{(item.bottles * item.price_per_bottle).toLocaleString()}
                        </td>
                        <td className="p-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleRemoveInvoiceLineItem(index)}
                            className="h-8 w-8 text-red-500 hover:text-red-700"
                            disabled={invoiceLineItems.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30">
                    <tr>
                      <td colSpan={3} className="p-3 text-right font-semibold">Invoice Total</td>
                      <td className="p-3 text-right font-bold text-lg tabular-nums text-primary">
                        ₹{calculateInvoiceTotal().toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                COGS, logistics, and gross margin will be auto-calculated based on the account's city ({account?.city})
              </p>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-sm font-medium">Notes (Optional)</Label>
              <Textarea
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                placeholder="Add any notes for this invoice..."
                className="mt-1"
                rows={2}
                data-testid="invoice-notes-input"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreateInvoice(false)} disabled={creatingInvoice}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateInvoice} 
              disabled={creatingInvoice || calculateInvoiceTotal() <= 0}
              data-testid="submit-invoice-btn"
            >
              {creatingInvoice ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
              ) : (
                <><CheckCircle className="h-4 w-4 mr-2" /> Create Invoice</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
