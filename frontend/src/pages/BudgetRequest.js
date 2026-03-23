import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
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
  DialogTrigger,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import { 
  Wallet, Plus, Loader2, CheckCircle, XCircle, Clock, 
  ChevronRight, X, Search, Building2, Package, Trash2, 
  DollarSign, Send, Save, Calendar, MapPin, Edit2
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

// Budget categories (non-lead/account specific - general company expenses)
// Customer-related expenses are now handled via Expense Requests at Lead/Account level
const BUDGET_CATEGORIES = [
  { id: 'event_sponsorship_amount', label: 'Event Sponsorship - Amount', requires_lead: false, requires_sku: false },
  { id: 'event_sponsorship_stock', label: 'Event Sponsorship - Stock', requires_lead: false, requires_sku: true },
  { id: 'event_participation', label: 'Event Participation', requires_lead: false, requires_sku: false },
  { id: 'setup_exhibit', label: 'Set up Exhibit', requires_lead: false, requires_sku: false },
  { id: 'digital_promotion', label: 'Digital Promotion', requires_lead: false, requires_sku: false },
  { id: 'marketing_collateral', label: 'Marketing Collateral', requires_lead: false, requires_sku: false },
  { id: 'office_supplies', label: 'Office Supplies', requires_lead: false, requires_sku: false },
  { id: 'travel_general', label: 'General Travel', requires_lead: false, requires_sku: false },
  { id: 'other', label: 'Other', requires_lead: false, requires_sku: false },
];

const statusColors = {
  draft: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
  pending_approval: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
};

const statusLabels = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function BudgetRequest() {
  const { user } = useAuth();
  const [myRequests, setMyRequests] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const isApprover = ['ceo', 'director', 'vp', 'admin'].includes(user?.role?.toLowerCase());

  const fetchData = useCallback(async () => {
    if (!user?.id) return; // Wait for user to be loaded
    
    try {
      const token = localStorage.getItem('token');
      
      // Fetch my own requests
      const myResponse = await axios.get(`${API_URL}/budget-requests?user_id=${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMyRequests(myResponse.data || []);
      
      // Fetch requests for approver (from reportees + previously acted upon)
      if (isApprover) {
        const approverResponse = await axios.get(`${API_URL}/budget-requests/for-approver`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPendingApprovals(approverResponse.data || []);
      } else {
        setPendingApprovals([]);
      }
    } catch (error) {
      console.error('Failed to load budget requests:', error);
      toast.error('Failed to load budget requests');
    } finally {
      setLoading(false);
    }
  }, [user?.id, isApprover]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApproval = async (requestId, status, reason = '') => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/budget-requests/${requestId}/approve`,
        { status, rejection_reason: reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Budget request ${status}!`);
      fetchData();
      setDetailDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update budget request');
    }
  };

  const viewRequestDetail = (request) => {
    setSelectedRequest(request);
    setDetailDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600 relative z-10" />
          </div>
          <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading budget requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="budget-request-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative max-w-6xl mx-auto space-y-6 p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/50 dark:to-teal-900/30">
              <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Budget Requests</h1>
              <p className="text-muted-foreground">Request budget approvals for various activities</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="h-12 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-200/50 dark:shadow-emerald-900/30"
                data-testid="new-budget-request-btn"
              >
                <Plus className="h-5 w-5 mr-2" />
                New Budget Request
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-emerald-600" />
                  New Budget Request
                </DialogTitle>
              </DialogHeader>
              <BudgetRequestForm onSuccess={() => { setDialogOpen(false); fetchData(); }} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Pending Approvals for Director */}
        {isApprover && pendingApprovals.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Team Requests ({pendingApprovals.length})</h2>
            </div>
            
            {/* Pending Requests */}
            {pendingApprovals.filter(req => req.status === 'pending_approval').length > 0 && (
              <>
                <h3 className="text-lg font-medium text-amber-700 dark:text-amber-400">Pending Approval ({pendingApprovals.filter(req => req.status === 'pending_approval').length})</h3>
                {pendingApprovals.filter(req => req.status === 'pending_approval').map(req => (
                  <BudgetRequestCard 
                    key={req.id} 
                    request={req} 
                    onApprove={handleApproval} 
                    showActions 
                    onViewDetail={() => viewRequestDetail(req)}
                  />
                ))}
              </>
            )}
            
            {/* Previously Reviewed */}
            {pendingApprovals.filter(req => req.status !== 'pending_approval').length > 0 && (
              <>
                <h3 className="text-lg font-medium text-slate-600 dark:text-slate-400 mt-6">Previously Reviewed</h3>
                {pendingApprovals.filter(req => req.status !== 'pending_approval').map(req => (
                  <BudgetRequestCard 
                    key={req.id} 
                    request={req}
                    onViewDetail={() => viewRequestDetail(req)}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* My Budget Requests */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white">My Budget Requests</h2>
          {myRequests.length === 0 ? (
            <Card className="p-12 text-center border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 rounded-2xl">
              <Wallet className="h-16 w-16 mx-auto mb-4 text-slate-200 dark:text-slate-700" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No budget requests yet</p>
              <p className="text-muted-foreground text-sm mt-1">Click "New Budget Request" to create one</p>
            </Card>
          ) : (
            myRequests.map(req => (
              <BudgetRequestCard 
                key={req.id} 
                request={req}
                onViewDetail={() => viewRequestDetail(req)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail Dialog */}
      <BudgetRequestDetailDialog
        request={selectedRequest}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onApprove={handleApproval}
        isApprover={isApprover}
      />
    </div>
  );
}

// Budget Request Card
function BudgetRequestCard({ request, onApprove, showActions, onViewDetail }) {
  const categoryCount = request.line_items?.length || 0;
  
  return (
    <Card 
      className="p-6 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 rounded-2xl cursor-pointer hover:shadow-xl transition-all duration-200"
      onClick={onViewDetail}
      data-testid={`budget-request-card-${request.id}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
            <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-lg text-slate-800 dark:text-white">{request.title}</p>
            <p className="text-sm text-muted-foreground">by {request.user_name}</p>
          </div>
        </div>
        <Badge className={statusColors[request.status]}>
          {statusLabels[request.status]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <p className="text-xs text-muted-foreground">Total Amount</p>
          <p className="font-bold text-xl text-emerald-600 dark:text-emerald-400">₹{request.total_amount?.toLocaleString() || 0}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Categories</p>
          <p className="font-medium text-slate-700 dark:text-slate-300">{categoryCount} items</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="font-medium text-slate-700 dark:text-slate-300">
            {format(parseISO(request.created_at), 'MMM d, yyyy')}
          </p>
        </div>
        {request.event_name && (
          <div>
            <p className="text-xs text-muted-foreground">Event</p>
            <p className="font-medium text-slate-700 dark:text-slate-300">{request.event_name}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {request.line_items?.slice(0, 3).map((item, idx) => (
            <Badge key={idx} variant="outline" className="text-xs">
              {item.category_label}
            </Badge>
          ))}
          {request.line_items?.length > 3 && (
            <Badge variant="outline" className="text-xs">+{request.line_items.length - 3} more</Badge>
          )}
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </div>
    </Card>
  );
}

// Budget Request Form - Editable Grid
function BudgetRequestForm({ onSuccess, initialData = null }) {
  const [loading, setLoading] = useState(false);
  const [skus, setSkus] = useState([]);
  const [cities, setCities] = useState([]);
  
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    event_name: initialData?.event_name || '',
    event_date: initialData?.event_date || '',
    event_city: initialData?.event_city || '',
    line_items: initialData?.line_items || [],
  });

  // Fetch SKUs and cities
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const [skuRes, locationRes] = await Promise.all([
          axios.get(`${API_URL}/master-skus`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/master-locations/flat`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setSkus(skuRes.data?.skus || skuRes.data || []);
        setCities(locationRes.data.cities || []);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    };
    fetchData();
  }, []);

  const addLineItem = () => {
    setFormData(prev => ({
      ...prev,
      line_items: [
        ...prev.line_items,
        {
          id: Date.now().toString(),
          category_id: '',
          category_label: '',
          lead_id: null,
          lead_name: '',
          lead_city: '',
          sku_id: null,
          sku_name: '',
          bottle_count: 0,
          price_per_unit: 0,
          amount: 0,
          notes: '',
        }
      ]
    }));
  };

  const removeLineItem = (index) => {
    setFormData(prev => ({
      ...prev,
      line_items: prev.line_items.filter((_, i) => i !== index)
    }));
  };

  const updateLineItem = (index, field, value) => {
    setFormData(prev => {
      const newItems = [...prev.line_items];
      newItems[index] = { ...newItems[index], [field]: value };
      
      // If category changed, update label and reset conditional fields
      if (field === 'category_id') {
        const category = BUDGET_CATEGORIES.find(c => c.id === value);
        newItems[index].category_label = category?.label || '';
        if (!category?.requires_lead) {
          newItems[index].lead_id = null;
          newItems[index].lead_name = '';
          newItems[index].lead_city = '';
        }
        if (!category?.requires_sku) {
          newItems[index].sku_id = null;
          newItems[index].sku_name = '';
          newItems[index].bottle_count = 0;
          newItems[index].price_per_unit = 0;
        }
      }
      
      // Auto-calculate amount for SKU-based items
      if (field === 'bottle_count' || field === 'price_per_unit') {
        const bottles = field === 'bottle_count' ? value : newItems[index].bottle_count;
        const price = field === 'price_per_unit' ? value : newItems[index].price_per_unit;
        if (bottles && price) {
          newItems[index].amount = bottles * price;
        }
      }
      
      return { ...prev, line_items: newItems };
    });
  };

  // Batch update multiple fields at once (for lead and SKU selection)
  const updateLineItemBatch = (index, updates) => {
    setFormData(prev => {
      const newItems = [...prev.line_items];
      newItems[index] = { ...newItems[index], ...updates };
      
      // Auto-calculate amount if bottle_count and price_per_unit are in updates
      if (updates.bottle_count !== undefined || updates.price_per_unit !== undefined) {
        const bottles = updates.bottle_count ?? newItems[index].bottle_count;
        const price = updates.price_per_unit ?? newItems[index].price_per_unit;
        if (bottles && price) {
          newItems[index].amount = bottles * price;
        }
      }
      
      return { ...prev, line_items: newItems };
    });
  };

  const totalAmount = formData.line_items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const handleSubmit = async (submitForApproval = false) => {
    if (!formData.title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (formData.line_items.length === 0) {
      toast.error('Please add at least one budget item');
      return;
    }

    // Validate line items
    for (const item of formData.line_items) {
      if (!item.category_id) {
        toast.error('Please select a category for all items');
        return;
      }
      const category = BUDGET_CATEGORIES.find(c => c.id === item.category_id);
      if (category?.requires_lead && !item.lead_name) {
        toast.error(`Please select a lead for "${category.label}"`);
        return;
      }
      if (category?.requires_sku && (!item.sku_name || !item.bottle_count)) {
        toast.error(`Please select SKU and bottle count for "${category.label}"`);
        return;
      }
      if (!item.amount || item.amount <= 0) {
        toast.error('Please enter amount for all items');
        return;
      }
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      await axios.post(`${API_URL}/budget-requests`, {
        ...formData,
        submit_for_approval: submitForApproval,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success(submitForApproval ? 'Budget request submitted for approval!' : 'Budget request saved as draft');
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create budget request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label>Title *</Label>
          <Input
            placeholder="e.g., Q1 Marketing Budget for Mumbai Region"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            data-testid="budget-title-input"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Description</Label>
          <Textarea
            placeholder="Brief description of this budget request..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />
        </div>
      </div>

      {/* Event Details (Optional) */}
      <Card className="p-4 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Event Details (Optional)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            placeholder="Event Name"
            value={formData.event_name}
            onChange={(e) => setFormData({ ...formData, event_name: e.target.value })}
          />
          <Input
            type="date"
            value={formData.event_date}
            onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
          />
          <Select value={formData.event_city} onValueChange={(v) => setFormData({ ...formData, event_city: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Event City" />
            </SelectTrigger>
            <SelectContent>
              {cities.map(city => (
                <SelectItem key={city.id} value={city.name}>{city.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Budget Line Items - Editable Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            <span className="font-semibold text-slate-800 dark:text-white">Budget Items</span>
          </div>
          <Button variant="outline" size="sm" onClick={addLineItem} className="h-9">
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </div>

        {formData.line_items.length === 0 ? (
          <Card className="p-8 text-center border-dashed border-2 border-slate-200 dark:border-slate-700">
            <p className="text-muted-foreground">No items added yet. Click "Add Item" to start.</p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                  <TableHead className="w-[200px]">Category</TableHead>
                  <TableHead className="w-[180px]">Lead/Customer</TableHead>
                  <TableHead className="w-[150px]">SKU</TableHead>
                  <TableHead className="w-[100px]">Bottles</TableHead>
                  <TableHead className="w-[100px]">Price/Unit</TableHead>
                  <TableHead className="w-[120px]">Amount (₹)</TableHead>
                  <TableHead className="w-[150px]">Notes</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formData.line_items.map((item, index) => (
                  <BudgetLineItemRow
                    key={item.id}
                    item={item}
                    index={index}
                    skus={skus}
                    cities={cities}
                    eventCity={formData.event_city}
                    onUpdate={updateLineItem}
                    onUpdateBatch={updateLineItemBatch}
                    onRemove={removeLineItem}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Total */}
        {formData.line_items.length > 0 && (
          <div className="flex justify-end">
            <Card className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-4">
                <span className="font-medium text-emerald-800 dark:text-emerald-300">Total Budget</span>
                <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  ₹{totalAmount.toLocaleString()}
                </span>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Actions */}
      <DialogFooter className="flex gap-3 pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => handleSubmit(false)}
          disabled={loading}
          className="flex-1"
        >
          <Save className="h-4 w-4 mr-2" />
          Save as Draft
        </Button>
        <Button
          onClick={() => handleSubmit(true)}
          disabled={loading}
          className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Submit for Approval
        </Button>
      </DialogFooter>
    </div>
  );
}

// Budget Line Item Row
function BudgetLineItemRow({ item, index, skus, cities, eventCity, onUpdate, onUpdateBatch, onRemove }) {
  const [searchingLead, setSearchingLead] = useState(false);
  const [leadSearchTerm, setLeadSearchTerm] = useState('');
  const [leadResults, setLeadResults] = useState([]);
  const [showLeadDialog, setShowLeadDialog] = useState(false);

  const category = BUDGET_CATEGORIES.find(c => c.id === item.category_id);
  const requiresLead = category?.requires_lead;
  const requiresSku = category?.requires_sku;

  // Search leads
  const searchLeads = useCallback(async (term) => {
    if (!term || term.length < 2) {
      setLeadResults([]);
      return;
    }
    setSearchingLead(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/leads?search=${encodeURIComponent(term)}&page_size=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.data;
      setLeadResults(data.data || data || []);
    } catch (error) {
      console.error('Failed to search leads:', error);
      setLeadResults([]);
    } finally {
      setSearchingLead(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (leadSearchTerm) {
        searchLeads(leadSearchTerm);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [leadSearchTerm, searchLeads]);

  // Fetch SKU price when SKU or city changes
  const fetchSkuPrice = async (skuName, city) => {
    if (!skuName || !city) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/cogs/sku-price/${encodeURIComponent(city)}/${encodeURIComponent(skuName)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.found && response.data.minimum_landing_price) {
        onUpdate(index, 'price_per_unit', response.data.minimum_landing_price);
      }
    } catch (error) {
      console.error('Failed to fetch SKU price:', error);
    }
  };

  const handleSkuChange = (skuName) => {
    // Update SKU name using batch update
    const skuData = skus.find(s => s.sku_name === skuName);
    onUpdateBatch(index, {
      sku_id: skuData?.id || null,
      sku_name: skuName
    });
    
    const city = item.lead_city || eventCity;
    if (city) {
      fetchSkuPrice(skuName, city);
    }
  };

  const selectLead = (lead) => {
    // Batch update all lead fields at once
    onUpdateBatch(index, {
      lead_id: lead.id,
      lead_name: lead.company_name,
      lead_city: lead.city
    });
    
    setLeadSearchTerm('');
    setShowLeadDialog(false);
    setLeadResults([]);
    
    // Fetch SKU price if SKU is already selected
    if (item.sku_name) {
      setTimeout(() => {
        fetchSkuPrice(item.sku_name, lead.city);
      }, 100);
    }
  };

  const clearLead = () => {
    onUpdateBatch(index, {
      lead_id: null,
      lead_name: '',
      lead_city: ''
    });
  };

  const clearSku = () => {
    onUpdateBatch(index, {
      sku_id: null,
      sku_name: '',
      bottle_count: 0,
      price_per_unit: 0
    });
  };

  // Check if we have a lead or SKU selected to show summary
  const hasSelectedLead = item.lead_name && item.lead_city;
  const hasSelectedSku = item.sku_name;
  const showSummary = hasSelectedLead || hasSelectedSku;

  return (
    <>
      <TableRow className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 border-b-0">
        <TableCell className="align-top pt-4">
          <Select value={item.category_id} onValueChange={(v) => onUpdate(index, 'category_id', v)}>
            <SelectTrigger className="h-10 text-sm rounded-lg">
              <SelectValue placeholder="Select category..." />
            </SelectTrigger>
            <SelectContent>
              {BUDGET_CATEGORIES.map(cat => (
                <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        
        <TableCell className="align-top pt-4">
          {requiresLead ? (
            <div>
              {item.lead_name ? (
                <div className="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                  <Building2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-emerald-800 dark:text-emerald-300 truncate">{item.lead_name}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">{item.lead_city}</p>
                  </div>
                  <button 
                    onClick={clearLead} 
                    className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Dialog open={showLeadDialog} onOpenChange={setShowLeadDialog}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full h-10 justify-start text-sm font-normal rounded-lg border-dashed border-2 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10"
                    >
                      <Search className="h-4 w-4 mr-2 text-slate-400" />
                      <span className="text-slate-500">Select Lead...</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-emerald-600" />
                        Select Lead / Customer
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {/* Search Input */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <Input
                          placeholder="Search by company name, contact, or city..."
                          value={leadSearchTerm}
                          onChange={(e) => setLeadSearchTerm(e.target.value)}
                          className="pl-11 h-12 text-base rounded-xl border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          autoFocus
                        />
                        {searchingLead && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-slate-400" />
                        )}
                      </div>
                      
                      {/* Search Results */}
                      <div className="max-h-[300px] overflow-y-auto space-y-2">
                        {!leadSearchTerm && (
                          <div className="text-center py-8 text-slate-400">
                            <Search className="h-10 w-10 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Start typing to search leads</p>
                            <p className="text-xs mt-1">Minimum 2 characters</p>
                          </div>
                        )}
                        
                        {leadSearchTerm && leadSearchTerm.length < 2 && (
                          <div className="text-center py-6 text-slate-400">
                            <p className="text-sm">Type at least 2 characters to search</p>
                          </div>
                        )}
                        
                        {leadSearchTerm && leadSearchTerm.length >= 2 && !searchingLead && leadResults.length === 0 && (
                          <div className="text-center py-8 text-slate-400">
                            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No leads found for "{leadSearchTerm}"</p>
                            <p className="text-xs mt-1">Try a different search term</p>
                          </div>
                        )}
                        
                        {leadResults.map(lead => (
                          <div
                            key={lead.id}
                            onClick={() => selectLead(lead)}
                            className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 cursor-pointer transition-all group"
                          >
                            <div className="flex items-start gap-3">
                              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/50 dark:to-teal-900/30 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                                <Building2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-800 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                                  {lead.company_name}
                                </p>
                                <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {lead.city}
                                  </span>
                                  {lead.contact_name && (
                                    <span className="truncate">{lead.contact_name}</span>
                                  )}
                                </div>
                                {lead.lead_id && (
                                  <p className="text-xs text-slate-400 mt-1 font-mono">{lead.lead_id}</p>
                                )}
                              </div>
                              <div className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <CheckCircle className="h-5 w-5" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          ) : (
            <span className="text-sm text-slate-400 italic">Not required</span>
          )}
        </TableCell>

        <TableCell className="align-top pt-4">
          {requiresSku ? (
            item.sku_name ? (
              <div className="flex items-center gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <Package className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span className="font-medium text-sm text-blue-800 dark:text-blue-300 truncate flex-1">{item.sku_name}</span>
                <button 
                  onClick={clearSku} 
                  className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Select value={item.sku_name || ''} onValueChange={handleSkuChange}>
                <SelectTrigger className="h-10 text-sm rounded-lg">
                  <SelectValue placeholder="Select SKU" />
                </SelectTrigger>
                <SelectContent>
                  {skus.map(sku => (
                    <SelectItem key={sku.id} value={sku.sku_name}>{sku.sku_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          ) : (
            <span className="text-sm text-slate-400 italic">Not required</span>
          )}
        </TableCell>

        <TableCell className="align-top pt-4">
          {requiresSku ? (
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={item.bottle_count || ''}
              onChange={(e) => onUpdate(index, 'bottle_count', parseInt(e.target.value) || 0)}
              className="h-10 text-sm w-24 rounded-lg"
            />
          ) : (
            <span className="text-sm text-slate-400 italic">-</span>
          )}
        </TableCell>

        <TableCell className="align-top pt-4">
          {requiresSku ? (
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={item.price_per_unit || ''}
              onChange={(e) => onUpdate(index, 'price_per_unit', parseFloat(e.target.value) || 0)}
              className="h-10 text-sm w-24 rounded-lg"
            />
          ) : (
            <span className="text-sm text-slate-400 italic">-</span>
          )}
        </TableCell>

        <TableCell className="align-top pt-4">
          <Input
            type="number"
            min="0"
            placeholder="0"
            value={item.amount || ''}
            onChange={(e) => onUpdate(index, 'amount', parseFloat(e.target.value) || 0)}
            className="h-10 text-sm font-medium rounded-lg"
            disabled={requiresSku && item.bottle_count > 0 && item.price_per_unit > 0}
          />
        </TableCell>

        <TableCell className="align-top pt-4">
          <Input
            placeholder="Notes..."
            value={item.notes || ''}
            onChange={(e) => onUpdate(index, 'notes', e.target.value)}
            className="h-10 text-sm rounded-lg"
          />
        </TableCell>

        <TableCell className="align-top pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(index)}
            className="h-9 w-9 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
      
      {/* Summary Row - Shows selected lead and SKU details */}
      {showSummary && (
        <TableRow className="bg-slate-50/50 dark:bg-slate-800/20 border-b">
          <TableCell colSpan={8} className="py-2 px-4">
            <div className="flex items-center gap-4 text-sm">
              {hasSelectedLead && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
                  <Building2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-medium text-emerald-800 dark:text-emerald-300">{item.lead_name}</span>
                  <span className="text-emerald-600 dark:text-emerald-400">•</span>
                  <MapPin className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-700 dark:text-emerald-400">{item.lead_city}</span>
                </div>
              )}
              {hasSelectedSku && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <Package className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="font-medium text-blue-800 dark:text-blue-300">{item.sku_name}</span>
                  {item.bottle_count > 0 && (
                    <>
                      <span className="text-blue-600 dark:text-blue-400">×</span>
                      <span className="text-blue-700 dark:text-blue-400">{item.bottle_count} bottles</span>
                    </>
                  )}
                  {item.price_per_unit > 0 && (
                    <>
                      <span className="text-blue-600 dark:text-blue-400">@</span>
                      <span className="text-blue-700 dark:text-blue-400">₹{item.price_per_unit}/unit</span>
                    </>
                  )}
                </div>
              )}
              {item.amount > 0 && (
                <div className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                  <DollarSign className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="font-bold text-amber-800 dark:text-amber-300">₹{item.amount.toLocaleString()}</span>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// Budget Request Detail Dialog
function BudgetRequestDetailDialog({ request, open, onOpenChange, onApprove, isApprover }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  if (!request) return null;

  const canApprove = isApprover && request.status === 'pending_approval';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-emerald-600" />
              Budget Request Details
            </span>
            <Badge className={statusColors[request.status]}>
              {statusLabels[request.status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <h3 className="font-semibold text-lg">{request.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Submitted by {request.user_name} on {format(parseISO(request.created_at), 'MMM d, yyyy')}
            </p>
            {request.description && (
              <p className="text-sm mt-2">{request.description}</p>
            )}
          </div>

          {/* Total */}
          <Card className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center justify-between">
              <span className="font-medium text-emerald-800 dark:text-emerald-300">Total Budget Requested</span>
              <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                ₹{request.total_amount?.toLocaleString() || 0}
              </span>
            </div>
          </Card>

          {/* Line Items */}
          <div>
            <h4 className="font-semibold mb-3">Budget Items ({request.line_items?.length || 0})</h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead>Category</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {request.line_items?.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{item.category_label}</TableCell>
                      <TableCell>
                        {item.lead_name ? (
                          <span className="text-sm">{item.lead_name} ({item.lead_city})</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {item.sku_name ? (
                          <span className="text-sm">{item.sku_name} × {item.bottle_count}</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">₹{item.amount?.toLocaleString() || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Rejection Reason */}
          {request.rejection_reason && (
            <Card className="p-3 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
              <p className="text-xs text-red-800 dark:text-red-300 font-semibold mb-1">Rejection Reason</p>
              <p className="text-sm text-red-900 dark:text-red-200">{request.rejection_reason}</p>
            </Card>
          )}

          {/* Approval Actions */}
          {canApprove && !rejecting && (
            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={() => onApprove(request.id, 'approved')}
                className="flex-1 h-11 rounded-full bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button
                onClick={() => setRejecting(true)}
                variant="outline"
                className="flex-1 h-11 rounded-full border-red-300 text-red-600 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </div>
          )}

          {rejecting && (
            <div className="space-y-3 pt-4 border-t">
              <Textarea
                placeholder="Please provide a reason for rejection..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    if (!rejectionReason.trim()) {
                      toast.error('Please provide a rejection reason');
                      return;
                    }
                    onApprove(request.id, 'rejected', rejectionReason);
                  }}
                  className="flex-1 h-11 rounded-full bg-red-600 hover:bg-red-700"
                >
                  Confirm Rejection
                </Button>
                <Button
                  onClick={() => { setRejecting(false); setRejectionReason(''); }}
                  variant="outline"
                  className="flex-1 h-11 rounded-full"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
