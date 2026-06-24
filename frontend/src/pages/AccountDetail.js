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
  DollarSign, CreditCard, Calendar, AlertTriangle, TrendingUp, TrendingDown, Minus, Truck, Search, Copy, ExternalLink,
  Upload, Download, CheckCircle, XCircle, Clock, MessageSquare, FileCheck, ChevronDown, ChevronRight, ChevronLeft, Package, Zap, ShieldCheck, Pencil, Receipt
} from 'lucide-react';
import { format } from 'date-fns';
import TaxBillingCard from '../components/TaxBillingCard';
import { isValidMapsLink } from '../utils/mapsLink';
import GammaGenerateButton from '../components/gamma/GammaGenerateButton';
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
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import LogoUploader from '../components/LogoUploader';
import ExpenseRequestSection from '../components/ExpenseRequestSection';
import EntityDeliveryOrders from '../components/EntityDeliveryOrders';
import EntityCommentThread from '../components/EntityCommentThread';
import AppBreadcrumb from '../components/AppBreadcrumb';
import AccountScoringCard from '../components/AccountScoringCard';
import EntityContactsSection from '../components/EntityContactsSection';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Invoice Card Component with expandable line items
function InvoiceCard({ invoice }) {
  const [expanded, setExpanded] = React.useState(false);
  const hasLineItems = invoice.items && invoice.items.length > 0;
  const totalBottles = hasLineItems
    ? invoice.items.reduce((sum, item) => sum + (item.bottles || item.quantity || 0), 0)
    : (invoice.total_bottles || 0);

  // Resolve invoice-level financial fields (handle multiple field names from external + internal payloads)
  const grossValue = invoice.gross_invoice_value ?? invoice.gross_amount ?? invoice.grand_total ?? 0;
  const creditValue = invoice.credit_note_value ?? invoice.credit_note ?? 0;
  const netValue = invoice.net_invoice_value ?? invoice.net_amount ?? (grossValue - creditValue);
  const outstandingValue = invoice.outstanding ?? 0;
  const invoiceNo = invoice.invoice_no || invoice.invoice_number || invoice.id || '-';
  const invoiceDate = invoice.invoice_date || invoice.invoiceDate || '';

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`account-invoice-${invoiceNo}`}>
      {/* Invoice Header - Clickable */}
      <div
        className={`flex flex-wrap items-center gap-3 p-3 bg-muted/30 ${hasLineItems ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default'} transition-colors`}
        onClick={() => hasLineItems && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-[180px]">
          {hasLineItems && (
            <span className="text-muted-foreground">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
          )}
          <div>
            <p className="font-semibold text-primary">{invoiceNo}</p>
            <p className="text-xs text-muted-foreground">{invoiceDate}</p>
            {invoice.zoho_invoice_url && (
              <a
                href={invoice.zoho_invoice_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-violet-600 hover:text-violet-800 hover:underline"
                data-testid={`view-zoho-invoice-${invoiceNo}`}
                title="Open this invoice in Zoho Books"
              >
                <ExternalLink className="h-3 w-3" />
                View in Zoho Books
              </a>
            )}
          </div>
        </div>

        {totalBottles > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            <span>{totalBottles.toLocaleString()} bottles</span>
          </div>
        )}

        {/* Financials grid — Gross / Credit Note / Net / Outstanding */}
        <div className="ml-auto grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-1 text-right text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Gross</p>
            <p className="font-semibold text-slate-700 tabular-nums">₹{Math.round(grossValue).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Credit Note</p>
            <p className="font-semibold text-amber-600 tabular-nums">₹{Math.round(creditValue).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Net</p>
            <p className="font-bold text-purple-700 tabular-nums">₹{Math.round(netValue).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Outstanding</p>
            <p className={`font-bold tabular-nums ${outstandingValue > 0 ? 'text-rose-600' : 'text-slate-400'}`}>₹{Math.round(outstandingValue).toLocaleString()}</p>
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
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground">Crates</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground">Bottles</th>
                <th className="text-right py-2 px-3 font-medium text-xs text-muted-foreground">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => {
                const crates = item.crates ?? item.crateCount ?? null;
                const cap = item.crate_capacity ?? item.crateCapacity ?? null;
                return (
                <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="py-2 px-3">
                    <p className="font-medium">{item.sku_name || item.sku || 'N/A'}</p>
                    {item.sku_code && <p className="text-xs text-muted-foreground">{item.sku_code}</p>}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {crates != null ? (
                      <div>
                        <p>{Number(crates).toLocaleString()}</p>
                        {cap != null && <p className="text-[10px] text-muted-foreground">× {Number(cap)}/crate</p>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{(item.bottles || item.quantity || 0).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right font-medium tabular-nums">₹{Math.round(item.lineTotal ?? item.line_total ?? item.net_amount ?? item.total ?? 0).toLocaleString()}</td>
                </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t">
              <tr>
                <td className="py-2 px-3 font-semibold">Total</td>
                <td className="py-2 px-3 text-right font-semibold tabular-nums">
                  {(() => {
                    const totalCrates = invoice.items.reduce((s, it) => s + Number(it.crates ?? it.crateCount ?? 0), 0);
                    return totalCrates > 0 ? totalCrates.toLocaleString() : '-';
                  })()}
                </td>
                <td className="py-2 px-3 text-right font-semibold tabular-nums">{totalBottles.toLocaleString()}</td>
                <td className="py-2 px-3 text-right font-semibold text-green-600 tabular-nums">₹{Math.round(grossValue).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
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

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { updateCurrentLabel, navigateTo } = useNavigation();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [pricingEditing, setPricingEditing] = useState(false); // inline edit of just the SKU Pricing section
  const [savingPricing, setSavingPricing] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [lastMonthSummary, setLastMonthSummary] = useState(null); // for Month-over-Month delta
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [users, setUsers] = useState([]);
  const [masterSkus, setMasterSkus] = useState([]);
  
  // Mobile: toggle visibility of secondary right-column cards (Account Details, Signed Contract, Account Score)
  const [showSecondaryMobile, setShowSecondaryMobile] = useState(false);

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
  const [leadType, setLeadType] = useState('B2B');
  const [contactName, setContactName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState('');
  const [skuPricing, setSkuPricing] = useState([]);
  const [onboardedMonth, setOnboardedMonth] = useState('');
  const [onboardedYear, setOnboardedYear] = useState('');
  const [includeInGopMetrics, setIncludeInGopMetrics] = useState(true);
  const [businessCategory, setBusinessCategory] = useState('');
  const [businessCategories, setBusinessCategories] = useState([]);
  const [assignedTo, setAssignedTo] = useState('');

  // Load business categories once for the edit dropdown (master list, tenant-scoped).
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/master/business-categories`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setBusinessCategories(res.data?.categories || []);
      } catch (e) {
        console.warn('Failed to load business categories', e);
      }
    })();
  }, []);

  // Account activation state
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [activationChecks, setActivationChecks] = useState({
    gst_updated: false,
    delivery_address_updated: false,
    sku_prices_correct: false,
    delivery_contact_updated: false,
    logo_uploaded: false,
    payment_terms_set: false,
  });
  // Who bills this customer: 'company' (Nyla bills → register in Zoho)
  // or 'distributor' (third-party distributor bills → skip Zoho).
  const [billedBy, setBilledBy] = useState('company');
  const [savingBilledBy, setSavingBilledBy] = useState(false);
  // Live activation-status from backend (auto-validated against data)
  const [activationStatus, setActivationStatus] = useState({
    gst_updated: false,
    delivery_address_updated: false,
    sku_prices_correct: false,
    delivery_contact_updated: false,
    logo_uploaded: false,
    payment_terms_set: false,
  });

  // Customer's Delivery & Accounting section
  const [deliveryContactName, setDeliveryContactName] = useState('');
  const [deliveryContactPhone, setDeliveryContactPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [gstUploading, setGstUploading] = useState(false);
  const [gstDeleting, setGstDeleting] = useState(false);
  const gstFileInputRef = useRef(null);
  // True when delivery address card is in edit/form mode; false when displayed as visiting card
  const [editingDeliveryAddress, setEditingDeliveryAddress] = useState(false);

  // Payment Terms — Net days agreed with the customer. 0 = Due on Receipt.
  // Stored on account.payment_terms_days (int) and pushed to Zoho on every invoice.
  const [paymentTermsDays, setPaymentTermsDays] = useState('');
  const [savingPaymentTerms, setSavingPaymentTerms] = useState(false);

  // Fullscreen preview for the read-only logo thumbnail.
  const [logoPreviewOpen, setLogoPreviewOpen] = useState(false);
  
  // Delivery Address state
  const [deliveryAddress, setDeliveryAddress] = useState({
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    pincode: '',
    landmark: '',
    maps_link: ''
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
  
  // Invoice list state — fixed at 5 latest items; locked to "This Month" on Account page.
  // For wider time windows, users navigate to the dedicated Invoices page.
  // Account metrics inside the section are computed across the full filtered set on the backend.
  const [invoicePage, setInvoicePage] = useState(1);
  const invoiceLimit = 5;
  const invoiceTimeFilter = 'this_month'; // locked on Account page; full filter lives on /invoices
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
    setAddressSuggestions([]);
    setAddressSearchQuery(description);

    // Try fetching structured place details (incl. lat/lng) from the backend
    let placeDetails = null;
    try {
      const resp = await axios.get(`${API_URL}/accounts/places/details`, {
        params: { place_id: placeId },
        withCredentials: true,
      });
      placeDetails = resp.data;
    } catch (err) {
      // fall through to description-based parsing
    }

    if (placeDetails && placeDetails.address) {
      const a = placeDetails.address;
      const newAddress = {
        address_line1: a.address_line1 || description.split(',')[0]?.trim() || '',
        address_line2: a.address_line2 || '',
        city: a.city || account?.city || '',
        state: a.state || account?.state || '',
        pincode: a.pincode || '',
        landmark: '',
        lat: placeDetails.lat ?? null,
        lng: placeDetails.lng ?? null,
        formatted_address: placeDetails.formatted_address || description,
      };
      setDeliveryAddress(newAddress);
      toast.success('Address selected — lat/lng captured');
      return;
    }

    // Fallback: description-only parse (no lat/lng)
    const parts = description.split(',').map(p => p.trim());
    let newAddress = {
      address_line1: description,
      address_line2: '',
      city: account?.city || '',
      state: account?.state || '',
      pincode: '',
      landmark: '',
      lat: null,
      lng: null,
      formatted_address: description,
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
    if (!isValidMapsLink(deliveryAddress.maps_link)) {
      toast.error('Enter a valid Google Maps link (e.g. https://maps.app.goo.gl/...)');
      return;
    }

    setSavingAddress(true);
    try {
      await accountsAPI.update(id, {
        delivery_address: deliveryAddress
      });
      toast.success('Delivery address saved successfully');
      setEditingDeliveryAddress(false);
      fetchAccount(); // Refresh account data
    } catch (error) {
      toast.error('Failed to save delivery address');
    } finally {
      setSavingAddress(false);
    }
  };

  // Build Google Maps URL (prefers lat/lng, falls back to text address)
  const buildMapsUrl = (addr) => {
    if (!addr || !addr.address_line1) return null;
    if (addr.lat && addr.lng) {
      return `https://www.google.com/maps/?q=${addr.lat},${addr.lng}`;
    }
    return `https://www.google.com/maps/place/${encodeURIComponent(
      [addr.address_line1, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') + ', India'
    )}`;
  };

  // Copy ONLY the Google Maps link (used by the icon button on the saved-address card)
  const handleCopyMapsLink = async () => {
    const url = buildMapsUrl(deliveryAddress);
    if (!url) {
      toast.error('No delivery address set');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Google Maps link copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  // ── Customer's Delivery & Accounting handlers ──
  const handleGstFilePick = () => {
    if (gstFileInputRef.current) gstFileInputRef.current.click();
  };

  const handleGstUpload = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error('File too large (max 8MB)');
      return;
    }
    setGstUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await axios.post(
        `${API_URL}/accounts/${id}/gst-certificate`,
        formData,
        { withCredentials: true, headers: { 'Content-Type': 'multipart/form-data' } }
      );
      toast.success(data.message || 'GST certificate parsed and saved.');
      fetchAccount();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'GST parsing failed.');
    } finally {
      setGstUploading(false);
      if (gstFileInputRef.current) gstFileInputRef.current.value = '';
    }
  };

  const handleGstDelete = async () => {
    if (!window.confirm(
      'Delete the uploaded GST certificate? This will also clear the parsed GSTIN, PAN, legal name, trade name and billing address from this account.'
    )) return;
    setGstDeleting(true);
    try {
      await axios.delete(
        `${API_URL}/accounts/${id}/gst-certificate`,
        { withCredentials: true }
      );
      toast.success('GST certificate removed.');
      fetchAccount();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to remove GST certificate.');
    } finally {
      setGstDeleting(false);
    }
  };

  const handleSaveDeliveryContact = async () => {
    if (!deliveryContactName.trim() || !deliveryContactPhone.trim()) {
      toast.error('Both delivery contact name and phone are required.');
      return;
    }
    if (!/^\d{10}$/.test(deliveryContactPhone)) {
      toast.error('Delivery contact phone must be exactly 10 digits.');
      return;
    }
    setSavingContact(true);
    try {
      await axios.patch(
        `${API_URL}/accounts/${id}/delivery-info`,
        {
          delivery_contact_name: deliveryContactName.trim(),
          delivery_contact_phone: deliveryContactPhone.trim(),
        },
        { withCredentials: true }
      );
      toast.success('Delivery contact saved.');
      fetchAccount();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save delivery contact.');
    } finally {
      setSavingContact(false);
    }
  };

  const PAYMENT_TERMS_OPTIONS = [
    { value: '0', label: 'Net 0 — Due on Receipt' },
    { value: '7', label: 'Net 7' },
    { value: '30', label: 'Net 30' },
    { value: '45', label: 'Net 45' },
  ];

  const handleSavePaymentTerms = async (value) => {
    const days = parseInt(value, 10);
    if (Number.isNaN(days)) {
      toast.error('Please pick a payment term first.');
      return;
    }
    const opt = PAYMENT_TERMS_OPTIONS.find(o => o.value === String(days));
    setSavingPaymentTerms(true);
    try {
      await accountsAPI.update(id, {
        payment_terms_days: days,
        payment_terms_label: opt ? opt.label.replace(/\s+—.*/, '') : `Net ${days}`,
      });
      toast.success('Payment terms saved.');
      setPaymentTermsDays(String(days));
      fetchAccount();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save payment terms.');
    } finally {
      setSavingPaymentTerms(false);
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
      setLeadType(data.lead_type || 'B2B');
      setContactName(data.contact_name || '');
      setContactNumber(data.contact_number || '');
      setGstNumber(data.gst_number || '');
      setNextFollowUp(data.next_follow_up || '');
      setSkuPricing(data.sku_pricing || []);
      setOnboardedMonth(data.onboarded_month || '');
      setOnboardedYear(data.onboarded_year || '');
      setBusinessCategory(data.category || data.business_category || data.lead_business_category || '');
      setAssignedTo(data.assigned_to || '');
      // Seed the activation modal's `billedBy` radio from whatever's already
      // persisted on the account so the user sees their previous choice.
      setBilledBy(data.billed_by || 'company');
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

      // Load Customer's Delivery & Accounting fields
      setDeliveryContactName(data.delivery_contact_name || '');
      setDeliveryContactPhone(data.delivery_contact_phone || '');
      setPaymentTermsDays(
        data.payment_terms_days === undefined || data.payment_terms_days === null
          ? ''
          : String(data.payment_terms_days)
      );

      // Fetch activation status (auto-validated)
      try {
        const statusResp = await axios.get(
          `${API_URL}/accounts/${id}/activation-status`,
          { withCredentials: true }
        );
        setActivationStatus(statusResp.data.checks || {});
      } catch {
        // non-fatal
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
      // Fetch current period and last month (for MoM delta) in parallel.
      // last_month payload is only used for summary totals, so request a tiny page.
      const [response, lastMonthResp] = await Promise.all([
        accountsAPI.getInvoices(accountId, { page, limit, time_filter: timeFilter }),
        timeFilter === 'this_month'
          ? accountsAPI.getInvoices(accountId, { page: 1, limit: 1, time_filter: 'last_month' }).catch(() => null)
          : Promise.resolve(null),
      ]);
      console.log('[INVOICE_FETCH] Response:', response.data);
      setInvoiceData(response.data);
      setInvoiceTotalPages(response.data.pages || 0);
      setInvoiceTotalCount(response.data.total || 0);
      setLastMonthSummary(lastMonthResp?.data || null);
    } catch (error) {
      console.error('[INVOICE_FETCH] Error fetching invoices:', error);
      console.log('No invoice data available');
    } finally {
      setLoadingInvoices(false);
    }
  };
  
  // Refetch invoices when pagination changes (time filter locked to "this_month" on Account page)
  useEffect(() => {
    if (id) {
      fetchInvoices(id, invoicePage, invoiceLimit, invoiceTimeFilter);
    }
  }, [invoicePage, invoiceLimit]);

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
        lead_type: leadType,
        category: businessCategory || null,
        contact_name: contactName || null,
        contact_number: contactNumber || null,
        gst_number: gstNumber || null,
        next_follow_up: nextFollowUp || null,
        assigned_to: assignedTo,
        sku_pricing: skuPricing.map((r) => ({ ...r, mrp: (r.mrp === '' || r.mrp == null) ? null : r.mrp })),
        onboarded_month: onboardedMonth ? parseInt(onboardedMonth) : null,
        onboarded_year: onboardedYear ? parseInt(onboardedYear) : null,
        include_in_gop_metrics: includeInGopMetrics,
      });
      toast.success('Account updated successfully');
      setIsEditing(false);
      setPricingEditing(false);
      fetchAccount();
    } catch (error) {
      toast.error('Failed to update account');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSKU = () => {
    // Adding a SKU implicitly opens the inline pricing editor (so the row is
    // editable even when the user hasn't entered full account-edit mode).
    if (!isEditing) setPricingEditing(true);
    setSkuPricing([...skuPricing, {
      sku_id: '',
      sku: '',
      price_per_unit: 0,
      mrp: '',
      return_bottle_credit: 0,
      active_from: new Date().toISOString().slice(0, 10),
      active_to: '',
    }]);
  };

  // Save ONLY the SKU Pricing section (partial account update) — lets users
  // add/edit pricing directly from the section without the global Edit Account
  // flow. The backend only persists non-null fields, so other account data is
  // untouched.
  const handleSavePricing = async () => {
    setSavingPricing(true);
    try {
      await accountsAPI.update(id, {
        sku_pricing: skuPricing.map((r) => ({ ...r, mrp: (r.mrp === '' || r.mrp == null) ? null : r.mrp })),
      });
      toast.success('SKU pricing updated');
      setPricingEditing(false);
      fetchAccount();
    } catch (error) {
      toast.error('Failed to update SKU pricing');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleCancelPricing = () => {
    setSkuPricing(account?.sku_pricing || []);
    setPricingEditing(false);
  };

  // Resolve a pricing row's current display name from master_skus (via sku_id
  // when present), with a fallback to the row's legacy `sku` string. Stable
  // across SKU renames because we join on the immutable id.
  const resolveSkuName = (row) => {
    if (row?.sku_id) {
      const m = masterSkus.find(s => s.id === row.sku_id);
      if (m) return m.sku_name || m.sku;
    }
    return row?.sku || '';
  };

  // True when the row has a legacy name that no longer matches any current
  // master SKU — i.e. the SKU was renamed and we can't auto-link this row.
  const isOrphanRow = (row) =>
    !row?.sku_id &&
    !!row?.sku &&
    !masterSkus.some(m => (m.sku_name || m.sku || '').toLowerCase() === String(row.sku).toLowerCase());

  // Helper: does the master SKU for a given pricing row allow custom MRP?
  // Used to conditionally show/enforce the MRP input cell.
  const skuAllowsCustomMrp = (row) => {
    if (!row) return false;
    const ms = row.sku_id
      ? masterSkus.find(m => m.id === row.sku_id)
      : masterSkus.find(m => (m.sku_name || m.sku || '').toLowerCase() === String(row.sku || '').toLowerCase());
    return !!(ms && ms.allow_custom_mrp);
  };
  const anyRowAllowsCustomMrp = skuPricing.some(r => skuAllowsCustomMrp(r));
  // Rows are editable when the whole account is in edit mode OR the user has
  // opened the section-level inline pricing editor.
  const skuEditing = isEditing || pricingEditing;

  const handleRemoveSKU = (index) => {
    setSkuPricing(skuPricing.filter((_, i) => i !== index));
  };

  const handleSKUChange = (index, field, value) => {
    const updated = [...skuPricing];
    // String-valued fields (id, name, date strings) must pass through
    // unchanged; parseFloat on "2026-05-18" wipes out the date.
    const stringFields = ['sku', 'sku_id', 'active_from', 'active_to'];
    updated[index] = {
      ...updated[index],
      [field]: stringFields.includes(field) ? value : (parseFloat(value) || 0),
    };
    // When the user picks an SKU from the dropdown we receive `sku_id`. Keep
    // the legacy `sku` (display name) in sync so downstream code that still
    // reads `sku` (server-side reports, invoices, etc.) shows the current
    // master name.
    if (field === 'sku_id') {
      const m = masterSkus.find(s => s.id === value);
      if (m) {
        updated[index].sku = m.sku_name || m.sku || '';
        // Pre-fill the account's MRP from the SKU's master MRP as a sensible
        // default — the user can still override it per customer. Only when the
        // SKU allows custom MRP and a master MRP value is set.
        if (m.allow_custom_mrp && m.mrp != null && m.mrp !== '') {
          updated[index].mrp = m.mrp;
        }
      }
    }
    setSkuPricing(updated);
  };

  // Check if user is admin (CEO or Director)
  const isAdmin = user?.role === 'CEO' || user?.role === 'Director';
  const [deleting, setDeleting] = useState(false);
  const [showDeleteAllInvoicesDialog, setShowDeleteAllInvoicesDialog] = useState(false);
  const [deletingAllInvoices, setDeletingAllInvoices] = useState(false);

  const handleDeleteAllInvoices = async () => {
    setDeletingAllInvoices(true);
    try {
      const res = await axios.delete(`${API_URL}/accounts/${id}/invoices`, { withCredentials: true });
      toast.success(`Deleted ${res.data?.count ?? 0} invoice${(res.data?.count || 0) === 1 ? '' : 's'} for this account`);
      setShowDeleteAllInvoicesDialog(false);
      // Reload invoices and account so financial rollups refresh
      fetchInvoices(id);
      fetchAccount();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete invoices');
    } finally {
      setDeletingAllInvoices(false);
    }
  };

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

  // ── Account activation: sales-checklist + Zoho customer sync ──
  const handleOpenActivateDialog = async () => {
    // Reset checks every time it opens
    setActivationChecks({
      gst_updated: false,
      delivery_address_updated: false,
      sku_prices_correct: false,
      delivery_contact_updated: false,
    });
    setActivateDialogOpen(true);
    // Re-fetch fresh activation status for the auto-validation badges
    try {
      const resp = await axios.get(
        `${API_URL}/accounts/${id}/activation-status`,
        { withCredentials: true }
      );
      setActivationStatus(resp.data.checks || {});
    } catch {
      // silent
    }
  };

  // Manual override: paste in an existing Zoho contact_id for accounts that are
  // already in Zoho. Useful when auto-match (by email/name) doesn't find the
  // right contact. Pass empty string to unlink.
  const handleEditZohoContactId = async () => {
    const current = account?.zoho_contact_id || '';
    const next = window.prompt(
      `Enter Zoho contact ID for "${account?.account_name}".\n\n` +
      `Find this in Zoho Books → Contacts → open the contact → copy the long\n` +
      `number from the URL (e.g. .../#/contacts/2876000000123456).\n\n` +
      `Leave blank to unlink.`,
      current
    );
    if (next === null) return;  // user cancelled
    const trimmed = next.trim();
    if (trimmed === current) return;
    try {
      const resp = await axios.patch(
        `${API_URL}/accounts/${id}/zoho-contact`,
        { zoho_contact_id: trimmed || null },
        { withCredentials: true }
      );
      toast.success(
        trimmed
          ? `Linked to Zoho contact ${resp.data.zoho_contact_id}`
          : 'Zoho contact unlinked'
      );
      // Refresh account data so the badge / ID display updates inline
      const fresh = await accountsAPI.get(id);
      setAccount(fresh.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not update Zoho contact ID');
    }
  };

  const allChecksDone = Object.values(activationChecks).every(Boolean);

  // One-click re-sync of the account's contact details to Zoho Books. Records
  // sync health (status / last-synced / error) on the account so the indicator
  // updates inline.
  const handleResyncZoho = async () => {
    setResyncing(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/accounts/${id}/zoho-resync`,
        {},
        { withCredentials: true }
      );
      toast.success(data.message || 'Synced to Zoho Books.');
      fetchAccount();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Zoho sync failed.');
      fetchAccount();  // refresh so the error status surfaces on the indicator
    } finally {
      setResyncing(false);
    }
  };

  const handleActivateAccount = async () => {
    if (!allChecksDone) return;
    setActivating(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/accounts/${id}/activate`,
        { ...activationChecks, billed_by: billedBy },
        { withCredentials: true }
      );
      toast.success(data.message || 'Account activated.');
      setActivateDialogOpen(false);
      fetchAccount();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Activation failed.');
    } finally {
      setActivating(false);
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
    <div className="space-y-4 sm:space-y-6 pb-24 sm:pb-6" data-testid="account-detail-page">
      {/* Breadcrumb */}
      <AppBreadcrumb currentLabel={account?.account_name} />
      
      {/* Header — mobile optimized: title block wraps, action buttons drop below on small screens */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateTo('/accounts', { fromSidebar: true })}
            data-testid="back-button"
            className="h-8 w-8 sm:h-10 sm:w-10 shrink-0"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold leading-tight break-words">{account.account_name}</h1>
              {(() => {
                const lt = account.lead_type || 'B2B';
                const cls = {
                  'B2B': 'bg-sky-50 text-sky-700 border-sky-300',
                  'Retail': 'bg-violet-50 text-violet-700 border-violet-300',
                  'Individual': 'bg-emerald-50 text-emerald-700 border-emerald-300',
                }[lt] || 'bg-sky-50 text-sky-700 border-sky-300';
                return (
                  <Badge variant="outline" className={`${cls} shrink-0 text-[10px] sm:text-xs`} data-testid="account-lead-type-badge">
                    {lt}
                  </Badge>
                );
              })()}
            </div>
            <p className="text-xs sm:text-sm font-mono text-muted-foreground mt-0.5 sm:mt-1 break-all" data-testid="account-unique-id">
              ID: {account.account_id}
            </p>
            {account.lead_id && (
              <p className="text-[10px] sm:text-xs text-muted-foreground break-all">
                Converted from Lead: {account.lead_id}
              </p>
            )}
          </div>
        </div>
        {/* Actions: wrap to a second row on mobile */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:shrink-0">
          <GammaGenerateButton sourceType="account" sourceId={id} label="QBR Deck" className="h-9 sm:h-10 text-xs sm:text-sm border-indigo-300 text-indigo-700 hover:bg-indigo-50" />
          <Button
            onClick={() => isEditing ? handleSave() : setIsEditing(true)}
            disabled={saving}
            size="sm"
            className="flex-1 sm:flex-none h-9 sm:h-10 text-xs sm:text-sm"
            data-testid="edit-save-button"
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            ) : isEditing ? (
              <><Save className="h-4 w-4 mr-2" /> Save Changes</>
            ) : (
              <>
                <Pencil className="h-3.5 w-3.5 mr-1.5 sm:hidden" />
                <span className="sm:hidden">Edit</span>
                <span className="hidden sm:inline">Edit Account</span>
              </>
            )}
          </Button>
          {isEditing && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none h-9 sm:h-10 text-xs sm:text-sm"
              onClick={() => {
                setIsEditing(false);
                setPricingEditing(false);
                setAccountName(account.account_name || '');
                setLeadType(account.lead_type || 'B2B');
                setBusinessCategory(account.category || account.business_category || account.lead_business_category || '');
                setContactName(account.contact_name || '');
                setContactNumber(account.contact_number || '');
                setSkuPricing(account.sku_pricing || []);
                setOnboardedMonth(account.onboarded_month || '');
                setOnboardedYear(account.onboarded_year || '');
              }}
            >
              Cancel
            </Button>
          )}
          {isAdmin && !isEditing && (
            <Button 
              variant="outline" 
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-9 sm:h-10 text-xs sm:text-sm shrink-0"
              onClick={handleDeleteAccount}
              disabled={deleting}
              data-testid="delete-account-button"
            >
              {deleting ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> <span className="hidden sm:inline">Deleting...</span></>
              ) : (
                <><Trash2 className="h-4 w-4 sm:mr-2" /> <span className="hidden sm:inline">Delete Account</span></>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* ── Account Activation Card ─────────────────────────────────────────────
          Prominent CTA shown immediately after lead-conversion. Once the
          salesperson activates (4-checkbox confirmation + Zoho contact sync)
          this card flips to a green "Activated" chip. */}
      {account.status === 'active' ? (
        <div
          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          data-testid="account-activated-chip"
        >
          {/* Left accent rail — emerald signals "all set" */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-500 via-emerald-400 to-emerald-500" />
          <div className="absolute inset-0 opacity-[0.035] pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, #064e3b 1px, transparent 0)',
              backgroundSize: '18px 18px',
            }}
          />
          <div className="relative flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-emerald-400 shadow-sm ring-1 ring-slate-800">
                <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                  {account.billed_by === 'distributor' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-200">
                      Billed by Distributor
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700 ring-1 ring-inset ring-violet-200">
                      Billed by Company
                    </span>
                  )}
                  {account.billed_by !== 'distributor' && (() => {
                    const syncStatus = account.zoho_sync_status || (account.zoho_contact_id ? 'synced' : 'never');
                    if (syncStatus === 'error') {
                      return (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700 ring-1 ring-inset ring-rose-200" data-testid="zoho-sync-badge">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                          Zoho Sync Error
                        </span>
                      );
                    }
                    if (syncStatus === 'synced') {
                      return (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-200" data-testid="zoho-sync-badge">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Zoho Synced
                        </span>
                      );
                    }
                    return (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 ring-1 ring-inset ring-slate-200" data-testid="zoho-sync-badge">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        Not Synced to Zoho
                      </span>
                    );
                  })()}
                </div>
                <p className="text-base font-semibold text-slate-900 leading-tight">
                  Account active{account.activated_by_name ? ` — activated by ${account.activated_by_name}` : ''}
                </p>
                <p className="text-sm text-slate-600 leading-snug">
                  {account.activated_at ? `On ${format(new Date(account.activated_at), 'dd MMM yyyy, hh:mm a')}` : ''}
                  {account.billed_by === 'distributor' && (
                    <>
                      <span className="mx-1.5 text-slate-300">•</span>
                      <span className="text-amber-700">No Zoho registration (third-party distributor handles billing).</span>
                    </>
                  )}
                  {account.zoho_contact_id && (
                    <>
                      <span className="mx-1.5 text-slate-300">•</span>
                      <span className="font-mono text-slate-500">Zoho ID: {account.zoho_contact_id}</span>
                    </>
                  )}
                  {account.billed_by !== 'distributor' && account.zoho_last_synced_at && (
                    <>
                      <span className="mx-1.5 text-slate-300">•</span>
                      <span className="text-slate-500" data-testid="zoho-last-synced">
                        Last synced {format(new Date(account.zoho_last_synced_at), 'dd MMM, hh:mm a')}
                      </span>
                    </>
                  )}
                  {(user?.role === 'CEO' || user?.role === 'System Admin') && (
                    <button
                      type="button"
                      onClick={handleEditZohoContactId}
                      className="ml-2 inline-flex items-center text-[11px] text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline transition-colors"
                      data-testid="edit-zoho-contact-id-btn"
                      title="Manually set or change the Zoho contact ID"
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </button>
                  )}
                </p>
                {account.billed_by !== 'distributor' && account.zoho_sync_status === 'error' && account.zoho_last_sync_error && (
                  <p className="text-xs text-rose-600 mt-1 flex items-start gap-1.5" data-testid="zoho-sync-error">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={2.25} />
                    <span>Last Zoho sync failed: {account.zoho_last_sync_error}</span>
                  </p>
                )}
              </div>
            </div>
            {account.billed_by !== 'distributor' && (
              <Button
                variant="outline"
                size="sm"
                className="border-slate-300 text-slate-800 hover:bg-slate-50 hover:border-slate-400 h-9 px-4 font-medium whitespace-nowrap"
                onClick={handleResyncZoho}
                disabled={resyncing}
                data-testid="resync-account-btn"
              >
                {resyncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-2 text-emerald-600" />
                )}
                {resyncing ? 'Syncing…' : 'Re-sync to Zoho'}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div
          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          data-testid="account-activation-banner"
        >
          {/* Left accent rail */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 via-amber-400 to-amber-500" />
          {/* Subtle background pattern */}
          <div
            className="absolute inset-0 opacity-[0.035] pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, #0f172a 1px, transparent 0)',
              backgroundSize: '18px 18px',
            }}
          />
          <div className="relative flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-amber-400 shadow-sm ring-1 ring-slate-800">
                <AlertTriangle className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Action Required
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    Pending Onboarding
                  </span>
                </div>
                <p className="text-base font-semibold text-slate-900 leading-tight">
                  This account is not yet active
                </p>
                <p className="text-sm text-slate-600 max-w-xl leading-snug">
                  Complete the onboarding checklist to verify GST, delivery address, SKU pricing,
                  and delivery contact — then sync this customer to Zoho Books.
                </p>
                {(user?.role === 'CEO' || user?.role === 'System Admin') && (
                  <p className="text-[11px] text-slate-500 mt-2">
                    Already in Zoho?{' '}
                    <button
                      type="button"
                      onClick={handleEditZohoContactId}
                      className="font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2"
                      data-testid="link-zoho-contact-id-btn"
                    >
                      Paste the Zoho contact ID
                    </button>{' '}
                    to skip auto-creation.
                    {account.zoho_contact_id && (
                      <span className="ml-2 font-mono text-emerald-700">(linked: {account.zoho_contact_id})</span>
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="flex md:flex-col md:items-end gap-2 md:gap-1.5">
              <Button
                onClick={handleOpenActivateDialog}
                className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm whitespace-nowrap h-10 px-5 font-medium transition-colors"
                data-testid="activate-account-btn"
              >
                <Zap className="h-4 w-4 mr-2 text-amber-400" />
                Activate Account
                <ChevronRight className="h-4 w-4 ml-1.5 opacity-70" />
              </Button>
              <p className="text-[10px] text-slate-400 hidden md:block">
                Takes less than a minute
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Account Information */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
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
                  <Label>Lead Type *</Label>
                  <Select value={leadType} onValueChange={setLeadType}>
                    <SelectTrigger data-testid="edit-lead-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="B2B">B2B</SelectItem>
                      <SelectItem value="Retail">Retail</SelectItem>
                      <SelectItem value="Individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Business Category</Label>
                  <Select value={businessCategory || undefined} onValueChange={setBusinessCategory}>
                    <SelectTrigger data-testid="edit-business-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {businessCategory && !businessCategories.some((bc) => bc.name === businessCategory) && (
                        <SelectItem value={businessCategory}>{businessCategory}</SelectItem>
                      )}
                      {businessCategories.map((bc) => (
                        <SelectItem key={bc.id || bc.name} value={bc.name} data-testid={`edit-business-category-option-${bc.name}`}>
                          {bc.name}
                        </SelectItem>
                      ))}
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
                  <p className="text-sm text-muted-foreground">Lead Type</p>
                  <p className="font-medium" data-testid="account-lead-type-display">{account.lead_type || 'B2B'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Business Category</p>
                  <p className="font-medium" data-testid="account-business-category-display">{account.category || account.business_category || account.lead_business_category || '-'}</p>
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
                {/* Per-contact details now live in the multi-contact Contacts table below */}
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
                    <button
                      type="button"
                      onClick={() => setLogoPreviewOpen(true)}
                      className="w-24 h-24 border rounded-lg overflow-hidden bg-gray-50 cursor-zoom-in hover:border-blue-400 hover:shadow-md transition-all"
                      data-testid="account-logo-thumbnail"
                      title="Click to preview"
                    >
                      <img
                        src={`${process.env.REACT_APP_BACKEND_URL}${account.logo_url}`}
                        alt="Account logo"
                        className="w-full h-full object-contain"
                      />
                    </button>
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

          {/* Multi-contact table (synced to the Contacts module) */}
          <EntityContactsSection parentType="account" parentId={account.account_id || account.id} />

          {/* Invoice Summary — second section, right after Account Information */}
          <Card className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-5">
              <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2 flex-wrap">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Invoice Summary
                <Badge variant="secondary" className="text-[10px] sm:text-xs font-medium">This Month</Badge>
                {invoiceTotalCount > 0 && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs">{invoiceTotalCount} Total</Badge>
                )}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={() => setShowCreateInvoice(true)}
                  data-testid="create-invoice-btn"
                >
                  <Plus className="h-4 w-4 mr-1" /> Create Invoice
                </Button>

                {(user?.role === 'CEO' || user?.role === 'System Admin') && (invoiceData?.invoices?.length || 0) > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDeleteAllInvoicesDialog(true)}
                    data-testid="delete-all-invoices-btn"
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Delete All Invoices
                  </Button>
                )}
              </div>
            </div>
            {loadingInvoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : invoiceData && invoiceData.invoices?.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-3">
                  {(() => {
                    // Compute Month-over-Month deltas for Gross and Net.
                    // Returns null when last month had no invoices (to avoid 0→∞ noise).
                    const lm = lastMonthSummary || {};
                    const computeDelta = (currentVal, prevVal) => {
                      const cur = Number(currentVal || 0);
                      const prev = Number(prevVal || 0);
                      if (prev <= 0) return null;
                      const pct = ((cur - prev) / prev) * 100;
                      return { pct, prev };
                    };
                    const grossMoM = computeDelta(invoiceData.total_amount, lm.total_amount);
                    const netMoM = computeDelta(invoiceData.net_amount, lm.net_amount);
                    const MoMBadge = ({ delta, testId }) => {
                      if (!delta) {
                        return (
                          <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 tabular-nums" data-testid={testId}>
                            <Minus className="h-2.5 w-2.5" />
                            No data last month
                          </p>
                        );
                      }
                      const up = delta.pct > 0.05;
                      const down = delta.pct < -0.05;
                      const cls = up ? 'text-emerald-600' : down ? 'text-rose-600' : 'text-slate-500';
                      const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
                      const sign = delta.pct > 0 ? '+' : '';
                      return (
                        <p className={`text-[10px] mt-1 flex items-center gap-1 font-medium tabular-nums ${cls}`} data-testid={testId}>
                          <Icon className="h-2.5 w-2.5" />
                          {sign}{delta.pct.toFixed(1)}% vs last month
                        </p>
                      );
                    };
                    return (
                      <>
                        <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                          <p className="text-xs text-green-600 font-medium mb-1">GROSS VALUE</p>
                          <p className="text-lg font-bold text-green-700 tabular-nums">₹{((invoiceData.total_amount || 0) / 100000).toFixed(2)}L</p>
                          <MoMBadge delta={grossMoM} testId="mom-delta-gross" />
                        </div>
                        <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                          <p className="text-xs text-amber-600 font-medium mb-1">CREDIT NOTES</p>
                          <p className="text-lg font-bold text-amber-700 tabular-nums">₹{((invoiceData.credit_amount || 0) / 100000).toFixed(2)}L</p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                          <p className="text-xs text-blue-600 font-medium mb-1">NET VALUE</p>
                          <p className="text-lg font-bold text-blue-700 tabular-nums">₹{((invoiceData.net_amount || 0) / 100000).toFixed(2)}L</p>
                          <MoMBadge delta={netMoM} testId="mom-delta-net" />
                        </div>
                        <div className="bg-rose-50 rounded-lg p-4 border border-rose-100">
                          <p className="text-xs text-rose-600 font-medium mb-1">OUTSTANDING</p>
                          <p className={`text-lg font-bold tabular-nums ${(invoiceData.outstanding || 0) > 0 ? 'text-rose-700' : 'text-slate-500'}`}>₹{((invoiceData.outstanding || 0) / 100000).toFixed(2)}L</p>
                        </div>
                        {(() => {
                          const s = invoiceData.summary || {};
                          const pct = Number(s.return_pct || 0);
                          const delivered = s.bottles_delivered ?? 0;
                          const returned = s.bottles_returned ?? 0;
                          // Higher = better (more empty bottles recycled). Invert tone vs damage metrics.
                          const tone = pct >= 50
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                            : pct >= 25
                              ? 'bg-amber-50 border-amber-100 text-amber-700'
                              : 'bg-rose-50 border-rose-100 text-rose-700';
                          return (
                            <div className={`rounded-lg p-4 border ${tone}`} data-testid="account-return-pct-tile">
                              <p className="text-xs font-medium mb-1 opacity-80">RETURN BOTTLES %</p>
                              <p className="text-lg font-bold tabular-nums">{pct.toFixed(2)}%</p>
                              <p className="text-[10px] opacity-70 mt-0.5 tabular-nums">
                                {returned.toLocaleString()} / {delivered.toLocaleString()} empty bottles returned for reuse
                              </p>
                            </div>
                          );
                        })()}
                      </>
                    );
                  })()}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 italic" data-testid="invoice-summary-note">
                  Showing the latest 5 invoices for this month. Metrics above include all invoices in the current month.
                </p>
                <div className="space-y-3">
                  {invoiceData.invoices.slice(0, 5).map((inv, idx) => (
                    <InvoiceCard key={idx} invoice={inv} />
                  ))}
                </div>

                {/* "View all" deep-link to the Invoices List filtered by this account */}
                <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t">
                  <p className="text-xs text-slate-500" data-testid="invoice-summary-count-note">
                    {invoiceTotalCount > 5
                      ? `Showing 5 of ${invoiceTotalCount} invoices this month`
                      : `Showing ${invoiceTotalCount} of ${invoiceTotalCount} invoices this month`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (account?.account_name) params.append('account_name', account.account_name);
                      navigateTo(`/invoices?${params.toString()}`, { label: 'Invoices' });
                    }}
                    data-testid="view-all-invoices-btn"
                  >
                    View all invoices
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-muted-foreground mb-2">No invoices found for this month</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (account?.account_name) params.append('account_name', account.account_name);
                    navigateTo(`/invoices?${params.toString()}`, { label: 'Invoices' });
                  }}
                  className="mt-2"
                  data-testid="view-all-invoices-empty-btn"
                >
                  View all invoices
                </Button>
              </div>
            )}
          </Card>

          {/* Location */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
              Location
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <div>
                <p className="text-[11px] sm:text-sm text-muted-foreground">City</p>
                <p className="font-medium text-sm sm:text-base break-words">{account.city}</p>
              </div>
              <div>
                <p className="text-[11px] sm:text-sm text-muted-foreground">State</p>
                <p className="font-medium text-sm sm:text-base break-words">{account.state}</p>
              </div>
              <div>
                <p className="text-[11px] sm:text-sm text-muted-foreground">Territory</p>
                <p className="font-medium text-sm sm:text-base break-words">{account.territory}</p>
              </div>
            </div>
          </Card>

          {/* SKU Pricing Grid */}
          <Card className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-semibold">SKU Pricing</h2>
              <div className="flex items-center gap-2">
                {skuEditing && (
                  <Button size="sm" variant="outline" onClick={handleAddSKU} data-testid="add-sku-btn">
                    <Plus className="h-4 w-4 mr-1" /> Add SKU
                  </Button>
                )}
                {/* Section-level inline edit — only when NOT in the global
                    account edit flow (that flow has its own Save button). */}
                {!isEditing && (
                  pricingEditing ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={handleCancelPricing} data-testid="cancel-pricing-btn">
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSavePricing} disabled={savingPricing} data-testid="save-pricing-btn">
                        {savingPricing ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</>
                        ) : (
                          <><Save className="h-4 w-4 mr-1" /> Save</>
                        )}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setPricingEditing(true)} data-testid="edit-pricing-btn">
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Pricing
                    </Button>
                  )
                )}
              </div>
            </div>
            
            {skuPricing.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No SKU pricing configured</p>
                {skuEditing ? (
                  <Button size="sm" variant="outline" onClick={handleAddSKU} className="mt-2">
                    Add First SKU
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={handleAddSKU} className="mt-2" data-testid="add-first-sku-btn">
                    <Plus className="h-4 w-4 mr-1" /> Add SKU
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[680px]" data-testid="sku-pricing-table">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs sm:text-sm font-medium">SKU</th>
                      <th className="text-left px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap">Price/Unit (₹)</th>
                      {anyRowAllowsCustomMrp && (
                        <th className="text-left px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap" title="Maximum Retail Price printed on the invoice for this customer. Required only for SKUs that allow custom MRP.">MRP (₹) *</th>
                      )}
                      <th className="text-left px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap">Bottle Credit (₹)</th>
                      <th className="text-left px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap">Active From</th>
                      <th className="text-left px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap">Active To</th>
                      <th className="text-left px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap">Status</th>
                      {skuEditing && <th className="w-10"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {skuPricing.map((item, index) => {
                      const today = new Date().toISOString().slice(0, 10);
                      const isFuture = item.active_from && today < item.active_from;
                      const isExpired = item.active_to && today > item.active_to;
                      const pill = isExpired
                        ? { label: 'Expired', cls: 'bg-rose-100 text-rose-700 border-rose-200' }
                        : isFuture
                          ? { label: 'Future', cls: 'bg-amber-100 text-amber-800 border-amber-200' }
                          : { label: 'Active', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
                      return (
                      <tr key={index} className={isExpired || isFuture ? 'opacity-70' : ''} data-testid={`sku-pricing-row-${index}`}>
                        <td className="px-3 py-2">
                          {skuEditing ? (
                            <Select
                              value={item.sku_id || ''}
                              onValueChange={(val) => handleSKUChange(index, 'sku_id', val)}
                            >
                              <SelectTrigger className="w-[220px]" data-testid={`sku-select-${index}`}>
                                <SelectValue placeholder={isOrphanRow(item) ? `⚠ ${item.sku || 'Select SKU'} (re-link)` : 'Select SKU'}>
                                  {item.sku_id ? resolveSkuName(item) : (isOrphanRow(item) ? `⚠ ${item.sku} (re-link)` : (item.sku || 'Select SKU'))}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {masterSkus.map((skuItem) => (
                                  <SelectItem key={skuItem.id} value={skuItem.id}>
                                    {skuItem.sku_name || skuItem.sku}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="font-medium" title={item.sku_id ? `sku_id: ${item.sku_id}` : 'No sku_id linked'}>
                              {resolveSkuName(item)}
                              {isOrphanRow(item) && (
                                <span className="ml-2 text-xs text-amber-700" title="This row no longer matches any current SKU. Edit the row and pick the correct one.">⚠ re-link</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {skuEditing ? (
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
                        {anyRowAllowsCustomMrp && (
                          <td className="px-3 py-2">
                            {skuAllowsCustomMrp(item) ? (
                              skuEditing ? (
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.mrp ?? ''}
                                  onChange={(e) => handleSKUChange(index, 'mrp', e.target.value)}
                                  placeholder="Required"
                                  className={`w-24 ${(item.mrp == null || item.mrp === '') ? 'border-amber-400 ring-1 ring-amber-200' : ''}`}
                                  data-testid={`sku-mrp-${index}`}
                                />
                              ) : (
                                item.mrp != null && item.mrp !== '' ? (
                                  <span>₹{Number(item.mrp).toLocaleString()}</span>
                                ) : (
                                  <span className="text-xs text-amber-700" title="Required for activation">⚠ Not set</span>
                                )
                              )
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2">
                          {skuEditing ? (
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
                        <td className="px-3 py-2">
                          {skuEditing ? (
                            <Input
                              type="date"
                              value={item.active_from || ''}
                              onChange={(e) => handleSKUChange(index, 'active_from', e.target.value)}
                              className="w-36"
                              data-testid={`sku-active-from-${index}`}
                            />
                          ) : (
                            <span className="text-sm font-mono text-slate-700">{item.active_from || '—'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {skuEditing ? (
                            <Input
                              type="date"
                              value={item.active_to || ''}
                              onChange={(e) => handleSKUChange(index, 'active_to', e.target.value)}
                              className="w-36"
                              data-testid={`sku-active-to-${index}`}
                              min={item.active_from || undefined}
                            />
                          ) : (
                            <span className="text-sm font-mono text-slate-500">{item.active_to || <span className="text-slate-400 italic">no end</span>}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${pill.cls}`} data-testid={`sku-pricing-status-${index}`}>
                            {pill.label}
                          </span>
                        </td>
                        {skuEditing && (
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
                    );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Delivery Orders (account-specific) */}
          {account && (
            <EntityDeliveryOrders
              entityType="account"
              entityId={account.id || account.account_id}
              entityName={account.account_name}
              entity={account}
            />
          )}

          {/* Expense Requests Section */}
          {account && (
            <ExpenseRequestSection
              entityType="account"
              entityId={account.id || account.account_id}
              entityName={account.account_name}
              entityCity={account.city}
            />
          )}

          {/* Discussion thread with @-mentions */}
          {account && (
            <EntityCommentThread
              basePath={`/accounts/${account.account_id || account.id}/comments`}
              title="Discussion"
              testid="account-comments"
            />
          )}
        </div>

        {/* Right Column - Financial Summary & Delivery */}
        <div className="space-y-6">
          {/* ═══════════════════════════════════════════════════════════
              Financial Summary — corporate, executive-finance aesthetic.
              Single navy-slate accent for the hero metric; status-aware
              colours (slate / amber / rose) on the secondary KPIs; subdued
              "since last payment" recency band at the foot of the card.
              ═══════════════════════════════════════════════════════════ */}
          {(() => {
            const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
            const totalOrder = invoiceData?.total_amount || account?.total_order_value || 0;
            const outstanding = account?.outstanding_balance || 0;
            const overdue = account?.overdue_amount || 0;
            const lastPmt = account?.last_payment_amount || 0;
            const lastDate = account?.last_payment_date ? new Date(account.last_payment_date) : null;
            let daysSince = null;
            if (lastDate && !isNaN(lastDate)) {
              daysSince = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
            }
            const recencyTone =
              daysSince === null
                ? { bar: 'bg-slate-300', text: 'text-slate-500', label: 'No payment yet' }
                : daysSince <= 30
                ? { bar: 'bg-emerald-500', text: 'text-emerald-700', label: `${daysSince}d since last payment` }
                : daysSince <= 45
                ? { bar: 'bg-amber-500', text: 'text-amber-700', label: `${daysSince}d since last payment` }
                : { bar: 'bg-rose-500', text: 'text-rose-700', label: `${daysSince}d since last payment` };

            return (
              <Card
                className="relative overflow-hidden border-slate-200 bg-white shadow-sm"
                data-testid="financial-summary-card"
              >
                {/* subtle top accent bar — corporate header treatment */}
                <div className="h-1 w-full bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500" />

                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-md bg-slate-900 text-white flex items-center justify-center">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900 leading-tight">
                          Financial Summary
                        </h2>
                        <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                          Account ledger
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Hero metric — Total Order Value */}
                  <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 mb-5">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-slate-500 mb-1">
                          Total Order Value
                        </p>
                        <p className="text-[28px] font-bold tracking-tight text-slate-900 leading-none tabular-nums">
                          {fmtINR(totalOrder)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1.5">
                          Cumulative invoiced amount
                        </p>
                      </div>
                      <div className="shrink-0 h-10 w-10 rounded-full bg-slate-900/5 border border-slate-200 flex items-center justify-center">
                        <DollarSign className="h-5 w-5 text-slate-700" />
                      </div>
                    </div>
                  </div>

                  {/* Secondary KPIs — Outstanding & Overdue */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div
                      className={`rounded-lg border p-3 transition-colors ${
                        outstanding > 0
                          ? 'border-amber-200 bg-amber-50/60'
                          : 'border-slate-200 bg-white'
                      }`}
                      data-testid="kpi-outstanding"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                          Outstanding
                        </p>
                        <CreditCard
                          className={`h-3.5 w-3.5 ${
                            outstanding > 0 ? 'text-amber-600' : 'text-slate-400'
                          }`}
                        />
                      </div>
                      <p
                        className={`text-[18px] font-bold tracking-tight tabular-nums ${
                          outstanding > 0 ? 'text-amber-800' : 'text-slate-700'
                        }`}
                      >
                        {fmtINR(outstanding)}
                      </p>
                    </div>

                    <div
                      className={`rounded-lg border p-3 transition-colors ${
                        overdue > 0
                          ? 'border-rose-200 bg-rose-50/60'
                          : 'border-slate-200 bg-white'
                      }`}
                      data-testid="kpi-overdue"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                          Overdue
                        </p>
                        <AlertTriangle
                          className={`h-3.5 w-3.5 ${
                            overdue > 0 ? 'text-rose-600' : 'text-slate-400'
                          }`}
                        />
                      </div>
                      <p
                        className={`text-[18px] font-bold tracking-tight tabular-nums ${
                          overdue > 0 ? 'text-rose-800' : 'text-slate-700'
                        }`}
                      >
                        {fmtINR(overdue)}
                      </p>
                    </div>
                  </div>

                  {/* Last Payment band — subdued, professional */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 overflow-hidden">
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-slate-500" />
                          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                            Last Payment
                          </span>
                        </div>
                        <span className={`text-[10px] font-semibold ${recencyTone.text}`}>
                          {recencyTone.label}
                        </span>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                            Amount
                          </p>
                          <p className="text-[20px] font-bold tracking-tight text-slate-900 tabular-nums leading-tight">
                            {fmtINR(lastPmt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
                            Date
                          </p>
                          <p className="text-sm font-semibold text-slate-700">
                            {lastDate && !isNaN(lastDate)
                              ? format(lastDate, 'dd MMM yyyy')
                              : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Recency indicator strip */}
                    <div className={`h-[3px] w-full ${recencyTone.bar}`} />
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* ═══════════════════════════════════════════════════════════
              Customer's Delivery & Accounting
              -----------------------------------------------------------
              Three subsections grouped under one header:
              1. GST certificate (upload + AI-parsed visiting card)
              2. Delivery address (Google Places + lat/lng capture)
              3. Delivery contact (name + phone)
              ═══════════════════════════════════════════════════════════ */}
          <Card className="p-4 sm:p-6" data-testid="delivery-accounting-section">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
              <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <FileCheck className="h-4 w-4 sm:h-5 sm:w-5 text-violet-600" />
                Customer's Delivery & Accounting
              </h2>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                Used during account activation & invoicing
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mb-4 sm:mb-5">
              Upload the GST certificate to auto-populate billing details, set the
              delivery address (with location coordinates), and capture the on-ground
              delivery contact.
            </p>

            {/* ── 1) GST Certificate ── */}
            <div className="rounded-xl border border-border bg-secondary/20 p-4 mb-5" data-testid="gst-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-violet-600" />
                  <span className="font-semibold text-sm">GST Certificate</span>
                  {account?.gst_number && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                      Parsed
                    </Badge>
                  )}
                </div>
                <input
                  ref={gstFileInputRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleGstUpload}
                  data-testid="gst-file-input"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGstFilePick}
                    disabled={gstUploading || gstDeleting}
                    data-testid="gst-upload-btn"
                  >
                    {gstUploading ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Parsing…</>
                    ) : account?.gst_number ? (
                      <><Upload className="h-3.5 w-3.5 mr-1.5" /> Re-upload</>
                    ) : (
                      <><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload GST Certificate</>
                    )}
                  </Button>
                  {account?.gst_number && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleGstDelete}
                      disabled={gstUploading || gstDeleting}
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                      data-testid="gst-delete-btn"
                      title="Remove the uploaded GST certificate and clear parsed GST details"
                    >
                      {gstDeleting ? (
                        <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Removing…</>
                      ) : (
                        <><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete</>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {account?.gst_number ? (
                <div className="rounded-lg bg-white border border-violet-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-foreground leading-snug">
                        {account.gst_legal_name || account.account_name}
                      </p>
                      {account.gst_trade_name && account.gst_trade_name !== account.gst_legal_name && (
                        <p className="text-xs text-muted-foreground">
                          Trade name: {account.gst_trade_name}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Badge className="bg-violet-50 text-violet-800 border border-violet-200 font-mono text-[11px]">
                          GSTIN&nbsp;{account.gst_number}
                        </Badge>
                        {account.pan_number && (
                          <Badge className="bg-amber-50 text-amber-800 border border-amber-200 font-mono text-[11px]">
                            PAN&nbsp;{account.pan_number}
                          </Badge>
                        )}
                        {account.gst_registration_date && (
                          <span className="text-[11px] text-muted-foreground">
                            Registered: {account.gst_registration_date}
                          </span>
                        )}
                      </div>
                      {account.billing_address && (
                        <div className="mt-2 pt-2 border-t border-dashed border-violet-100">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
                            Billing Address
                          </p>
                          <p className="text-sm text-foreground leading-relaxed">
                            {[
                              account.billing_address.address_line1,
                              account.billing_address.address_line2,
                              account.billing_address.city,
                              account.billing_address.state,
                              account.billing_address.pincode,
                            ].filter(Boolean).join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                    {account.gst_certificate_url && (
                      <a
                        href={`${API_URL}${account.gst_certificate_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-violet-600 hover:text-violet-800"
                        title="View uploaded certificate"
                        data-testid="view-gst-cert-link"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No GST certificate uploaded yet. PDF/PNG/JPG, max 8MB. AI will read the
                  GSTIN, PAN, legal & trade name, and billing address automatically.
                </p>
              )}
            </div>

            {/* ── 1b) Tax & Billing Information (manual / auto-filled) ── */}
            <div className="mb-5" data-testid="tax-billing-section">
              <TaxBillingCard
                data={{
                  gst_number: account?.gst_number,
                  pan_number: account?.pan_number,
                  billing_address: account?.billing_address,
                  gst_legal_name: account?.gst_legal_name,
                  gst_trade_name: account?.gst_trade_name,
                }}
                editable={true}
                onSave={async (payload) => {
                  await axios.put(
                    `${API_URL}/accounts/${id}`,
                    payload,
                    { withCredentials: true }
                  );
                  await fetchAccount();
                }}
              />
            </div>

            {/* ── 2) Delivery Address ── */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 mb-5 shadow-sm" data-testid="delivery-address-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-blue-300 ring-1 ring-slate-800">
                    <Truck className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </div>
                  <span className="font-semibold text-sm text-slate-900">Delivery Address</span>
                  {(deliveryAddress.lat && deliveryAddress.lng) && (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1" />
                      GPS Locked
                    </Badge>
                  )}
                </div>
                {/* Edit / Copy actions visible only when card view is active */}
                {!editingDeliveryAddress && account?.delivery_address?.address_line1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleCopyMapsLink}
                      className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                      title="Copy Google Maps location link"
                      data-testid="copy-maps-link-btn"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <a
                      href={buildMapsUrl(deliveryAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                      title="Open in Google Maps"
                      data-testid="open-maps-btn"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setEditingDeliveryAddress(true)}
                      className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                      title="Edit delivery address"
                      data-testid="edit-delivery-address-btn"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* ── VISITING-CARD VIEW (when address saved & not editing) ── */}
              {!editingDeliveryAddress && account?.delivery_address?.address_line1 ? (
                <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-inner">
                  {/* Left accent rail */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-600 via-blue-500 to-blue-600" />
                  <div className="absolute top-3 right-3 opacity-[0.06] pointer-events-none">
                    <MapPin className="h-16 w-16 text-slate-900" strokeWidth={1.5} />
                  </div>
                  <div className="relative pl-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">
                      Ship-To Address
                    </p>
                    <p className="text-[15px] font-semibold text-slate-900 leading-snug">
                      {account.delivery_address.address_line1}
                    </p>
                    {account.delivery_address.address_line2 && (
                      <p className="text-sm text-slate-700 leading-snug">
                        {account.delivery_address.address_line2}
                      </p>
                    )}
                    <p className="text-sm text-slate-700 leading-snug">
                      {[
                        account.delivery_address.city,
                        account.delivery_address.state,
                        account.delivery_address.pincode,
                      ].filter(Boolean).join(', ')}
                    </p>
                    {account.delivery_address.landmark && (
                      <p className="text-xs text-slate-500 mt-1.5 italic">
                        Landmark: {account.delivery_address.landmark}
                      </p>
                    )}
                    {(account.delivery_address.lat && account.delivery_address.lng) && (
                      <div className="mt-3 pt-3 border-t border-slate-200/70 flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-blue-300">
                          <MapPin className="h-4 w-4" strokeWidth={2.25} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                            GPS Coordinates
                          </p>
                          <p className="text-xs font-mono text-slate-700 tabular-nums">
                            {Number(account.delivery_address.lat).toFixed(6)}, {Number(account.delivery_address.lng).toFixed(6)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* ── FORM VIEW (initial setup or Edit clicked) ── */}
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
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>

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
                      </div>
                    )}
                  </div>

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
                    <div>
                      <Label className="text-xs text-muted-foreground">Google Maps Link</Label>
                      <Input
                        value={deliveryAddress.maps_link || ''}
                        onChange={(e) => setDeliveryAddress({...deliveryAddress, maps_link: e.target.value})}
                        placeholder="Paste a Google Maps link e.g. https://maps.app.goo.gl/..."
                        data-testid="address-maps-link-input"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">Used for the delivery QR code when GPS isn't available.</p>
                    </div>
                  </div>

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
                    {account?.delivery_address?.address_line1 && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          // Cancel edit — restore from saved address
                          setDeliveryAddress(account.delivery_address);
                          setEditingDeliveryAddress(false);
                        }}
                        disabled={savingAddress}
                        data-testid="cancel-delivery-address-edit-btn"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ── 3) Delivery Contact ── */}
            <div className="rounded-xl border border-border bg-secondary/20 p-4" data-testid="delivery-contact-card">
              <div className="flex items-center gap-2 mb-3">
                <Phone className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-sm">Delivery Contact</span>
                {account?.delivery_contact_name && account?.delivery_contact_phone && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                    Set
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Contact Name *</Label>
                  <Input
                    value={deliveryContactName}
                    onChange={(e) => setDeliveryContactName(e.target.value)}
                    placeholder="e.g. Mr. Raj Kumar"
                    data-testid="delivery-contact-name-input"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Contact Phone *</Label>
                  <Input
                    value={deliveryContactPhone}
                    onChange={(e) => setDeliveryContactPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile e.g. 9876543210"
                    inputMode="numeric"
                    maxLength={10}
                    data-testid="delivery-contact-phone-input"
                  />
                  {deliveryContactPhone && deliveryContactPhone.length !== 10 && (
                    <p className="text-xs text-red-500 mt-1">Enter exactly 10 digits</p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={handleSaveDeliveryContact}
                  disabled={savingContact || !deliveryContactName.trim() || deliveryContactPhone.length !== 10}
                  data-testid="save-delivery-contact-btn"
                >
                  {savingContact ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
                  ) : (
                    <><Save className="h-3.5 w-3.5 mr-1.5" /> Save Contact</>
                  )}
                </Button>
              </div>
            </div>

            {/* ── 4) Payment Terms ── */}
            <div className="rounded-xl border border-border bg-secondary/20 p-4 mt-5" data-testid="payment-terms-card">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-sm">Payment Terms</span>
                {paymentTermsDays !== '' && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                    Net {paymentTermsDays}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Credit period agreed with the customer. Pushed to Zoho on every invoice so the
                due-date computes correctly.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PAYMENT_TERMS_OPTIONS.map((opt) => {
                  const active = paymentTermsDays === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={savingPaymentTerms}
                      onClick={() => handleSavePaymentTerms(opt.value)}
                      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                        active
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      } ${savingPaymentTerms ? 'opacity-60 cursor-wait' : ''}`}
                      data-testid={`payment-term-net-${opt.value}`}
                    >
                      <div className={`text-sm font-semibold ${active ? 'text-blue-700' : 'text-slate-900'}`}>
                        Net {opt.value}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {opt.value === '0' ? 'Due on Receipt' : `${opt.value}-day credit`}
                      </div>
                    </button>
                  );
                })}
              </div>
              {savingPaymentTerms && (
                <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving payment terms…
                </p>
              )}
            </div>
          </Card>

          {/* ── Mobile: Show More toggle for low-priority sections ─────────── */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSecondaryMobile(s => !s)}
            className="w-full lg:hidden justify-center gap-2 border-dashed"
            data-testid="toggle-secondary-mobile-btn"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showSecondaryMobile ? 'rotate-180' : ''}`} />
            {showSecondaryMobile ? 'Hide additional details' : 'Show more details (Account info, Contract, Scoring)'}
          </Button>

          <div className={`space-y-6 ${showSecondaryMobile ? '' : 'hidden lg:block lg:space-y-6'}`}>
          {/* Account Details */}
          <Card className="p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Account Details</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Assigned To</p>
                {isEditing ? (
                  <Select
                    value={assignedTo || '__unassigned__'}
                    onValueChange={(v) => setAssignedTo(v === '__unassigned__' ? '' : v)}
                  >
                    <SelectTrigger className="mt-1" data-testid="assigned-to-select">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__" data-testid="assigned-to-option-unassigned">
                        Unassigned
                      </SelectItem>
                      {users
                        .filter((u) => u.is_active !== false)
                        .map((u) => (
                          <SelectItem key={u.id} value={u.id} data-testid={`assigned-to-option-${u.id}`}>
                            {u.name}{u.territory ? ` - ${u.territory}` : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-medium" data-testid="assigned-to-display">{getAssignedUserName()}</p>
                )}
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
          </div>{/* /Mobile-collapsible secondary section */}
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

      {/* Delete All Invoices — restricted to CEO / System Admin */}
      <Dialog open={showDeleteAllInvoicesDialog} onOpenChange={setShowDeleteAllInvoicesDialog}>
        <DialogContent className="sm:max-w-md" data-testid="delete-all-invoices-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-5 w-5" /> Delete all invoices?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete <span className="font-semibold">{invoiceData?.invoices?.length || 0}</span> invoice{(invoiceData?.invoices?.length || 0) === 1 ? '' : 's'} for <span className="font-semibold">{account?.account_name}</span>. The account's outstanding balance, invoice totals and last-payment fields will be reset. <span className="font-medium text-red-700">This action cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setShowDeleteAllInvoicesDialog(false)} disabled={deletingAllInvoices}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAllInvoices}
              disabled={deletingAllInvoices}
              data-testid="confirm-delete-all-invoices"
              className="bg-red-600 hover:bg-red-700"
            >
              {deletingAllInvoices ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</> : <><Trash2 className="h-4 w-4 mr-2" /> Delete All</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Account Activation Checklist Dialog ── */}
      <Dialog open={activateDialogOpen} onOpenChange={setActivateDialogOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="activate-account-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-violet-600" />
              Activate Account
            </DialogTitle>
            <DialogDescription>
              Confirm the onboarding checklist and choose how this customer will be billed.
              Activation finalises onboarding so deliveries, returns and credit notes can be
              recorded against this account.
            </DialogDescription>
          </DialogHeader>

          {/* Billed-by selector */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2.5" data-testid="activation-billed-by-section">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-slate-700" />
              <span className="text-sm font-semibold text-slate-900">Who bills this customer?</span>
            </div>

            <label
              className={`flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                billedBy === 'company'
                  ? 'border-violet-300 bg-violet-50 ring-1 ring-violet-300'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
              data-testid="activation-billed-by-company"
            >
              <input
                type="radio"
                name="billed_by"
                value="company"
                checked={billedBy === 'company'}
                onChange={() => setBilledBy('company')}
                className="mt-1 accent-violet-600"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-900">Billed by the company</span>
                  <Badge variant="outline" className="text-[10px] bg-violet-100 text-violet-800 border-violet-300">
                    Zoho sync ON
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  We invoice the customer directly. A Zoho Books contact will be created and all deliveries,
                  credit notes and refunds will be synced to Zoho automatically.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                billedBy === 'distributor'
                  ? 'border-amber-300 bg-amber-50 ring-1 ring-amber-300'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
              data-testid="activation-billed-by-distributor"
            >
              <input
                type="radio"
                name="billed_by"
                value="distributor"
                checked={billedBy === 'distributor'}
                onChange={() => setBilledBy('distributor')}
                className="mt-1 accent-amber-600"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-900">Billed by a third-party distributor</span>
                  <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                    Zoho sync OFF
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  The distributor handles invoicing on their own books. We will not register this customer
                  in Zoho. Local CRM records (deliveries, returns) remain unaffected.
                </p>
              </div>
            </label>

            {billedBy === 'distributor' && (
              <p className="text-[11px] text-amber-800 bg-amber-100 border border-amber-200 rounded-md px-2.5 py-1.5">
                Please confirm with your manager before choosing this option. It cannot be reversed without re-activation.
              </p>
            )}

            {/* Persist the billing choice independently of activation so that
                downstream gates (Zoho invoice hide, stock-out screens) can rely
                on it BEFORE the account is fully activated. The save button
                only appears when the user has changed the radio from the
                currently-persisted value. */}
            {(account?.billed_by || 'company') !== billedBy && (
              <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-md px-3 py-2" data-testid="billed-by-pending-row">
                <span className="text-[11px] text-violet-800">
                  Unsaved change — currently saved as <b>{(account?.billed_by || 'company') === 'distributor' ? 'Distributor' : 'Company'}</b>.
                </span>
                <Button
                  size="sm"
                  className="h-7 px-3 text-xs bg-violet-600 hover:bg-violet-700"
                  disabled={savingBilledBy}
                  onClick={async () => {
                    setSavingBilledBy(true);
                    try {
                      await accountsAPI.update(id, { billed_by: billedBy });
                      const fresh = await accountsAPI.getById(id);
                      setAccount(fresh.data);
                      toast.success(`Billing choice saved — ${billedBy === 'distributor' ? 'Distributor' : 'Company'}.`);
                    } catch (e) {
                      toast.error(e.response?.data?.detail || 'Failed to save billing choice');
                    } finally {
                      setSavingBilledBy(false);
                    }
                  }}
                  data-testid="save-billed-by-btn"
                >
                  {savingBilledBy ? 'Saving…' : 'Save billing choice'}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-3 py-2">
            {[
              { key: 'gst_updated', label: 'GST is updated', helper: 'GSTIN must be present on the account (auto-validated).' },
              { key: 'delivery_address_updated', label: 'Delivery address is updated', helper: 'Line 1, city, state, PIN AND map coordinates required. Select the address from the Google suggestions so lat/lng is captured for the delivery team (auto-validated).' },
              { key: 'sku_prices_correct', label: 'SKU Pricing and MRP pricing is correct', helper: 'At least one row in SKU Pricing AND MRP is set on rows whose SKU has "Allow custom MRP" turned on in SKU Management (auto-validated).' },
              { key: 'delivery_contact_updated', label: 'Delivery contact details are updated', helper: 'Contact name AND phone required (auto-validated).' },
              { key: 'payment_terms_set', label: 'Payment terms are set', helper: 'Pick Net 0 / 7 / 30 / 45 under Customer\u2019s Delivery & Accounting (auto-validated).' },
              { key: 'logo_uploaded', label: 'Account logo is uploaded', helper: 'Upload the customer\u2019s logo under Account Logo (auto-validated).' },
            ].map((item) => {
              const ok = !!activationStatus[item.key];
              return (
                <label
                  key={item.key}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    ok
                      ? 'border-emerald-200 bg-emerald-50 cursor-pointer hover:bg-emerald-100/60'
                      : 'border-amber-200 bg-amber-50/60 cursor-not-allowed opacity-90'
                  }`}
                  data-testid={`activation-check-${item.key}`}
                >
                  <Checkbox
                    checked={activationChecks[item.key]}
                    disabled={!ok}
                    onCheckedChange={(checked) =>
                      setActivationChecks((prev) => ({ ...prev, [item.key]: !!checked }))
                    }
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      {ok ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">
                          <CheckCircle className="h-2.5 w-2.5 mr-1" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">
                          <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Missing
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{item.helper}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {!Object.values(activationStatus).every(Boolean) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              One or more onboarding items aren't filled in yet. Complete them on the account page — these checks
              cannot be ticked manually until the data exists.
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActivateDialogOpen(false)}
              disabled={activating}
              data-testid="activation-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              onClick={handleActivateAccount}
              disabled={!allChecksDone || activating}
              className={billedBy === 'distributor'
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-violet-600 hover:bg-violet-700 text-white'}
              data-testid="activation-confirm-btn"
            >
              {activating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Activating…</>
              ) : billedBy === 'distributor' ? (
                <><Zap className="h-4 w-4 mr-2" /> Activate (no Zoho)</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" /> Activate & Sync to Zoho</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account logo fullscreen preview — opened from the read-only logo
          thumbnail. View only (no download), mirroring Files & Documents. */}
      <Dialog open={logoPreviewOpen} onOpenChange={setLogoPreviewOpen}>
        <DialogContent className="max-w-3xl" data-testid="account-logo-preview-dialog">
          <DialogHeader>
            <DialogTitle>Account Logo</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center items-center bg-slate-50 rounded-lg p-4 min-h-[260px]">
            {account?.logo_url && (
              <img
                src={`${process.env.REACT_APP_BACKEND_URL}${account.logo_url}`}
                alt="Account logo"
                className="max-h-[60vh] max-w-full object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
