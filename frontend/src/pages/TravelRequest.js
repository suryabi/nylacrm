import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
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
import { toast } from 'sonner';
import { 
  Plane, MapPin, Calendar, Users, DollarSign, FileText, 
  Plus, Loader2, CheckCircle, XCircle, Clock, AlertTriangle,
  ChevronRight, X, Search, Building2, TrendingUp, Send, Save
} from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const TRAVEL_PURPOSES = [
  { value: 'lead_customer_visits', label: 'Lead / Customer visits' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'team_visit', label: 'Team visit' },
  { value: 'vendor_visits', label: 'Vendor visits' },
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

export default function TravelRequest() {
  const { user } = useAuth();
  const [myRequests, setMyRequests] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const isApprover = ['ceo', 'director'].includes(user?.role?.toLowerCase());

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/travel-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const allRequests = response.data || [];
      
      // Separate my requests and pending approvals
      const mine = allRequests.filter(r => r.user_id === user?.id);
      const pending = isApprover 
        ? allRequests.filter(r => r.status === 'pending_approval' && r.user_id !== user?.id)
        : [];
      
      setMyRequests(mine);
      setPendingApprovals(pending);
    } catch (error) {
      toast.error('Failed to load travel requests');
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
        `${API_URL}/travel-requests/${requestId}/approve`,
        { status, rejection_reason: reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Travel request ${status}!`);
      fetchData();
      setDetailDialogOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update travel request');
    }
  };

  const viewRequestDetail = (request) => {
    setSelectedRequest(request);
    setDetailDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" />
          </div>
          <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading travel requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="travel-request-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative max-w-6xl mx-auto space-y-6 p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/30">
              <Plane className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Travel Requests</h1>
              <p className="text-muted-foreground">Plan and request travel approvals</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="h-12 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/30"
                data-testid="new-travel-request-btn"
              >
                <Plus className="h-5 w-5 mr-2" />
                New Travel Request
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plane className="h-5 w-5 text-indigo-600" />
                  New Travel Request
                </DialogTitle>
              </DialogHeader>
              <TravelRequestForm onSuccess={() => { setDialogOpen(false); fetchData(); }} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Pending Approvals for CEO/Director */}
        {isApprover && pendingApprovals.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Pending Approvals ({pendingApprovals.length})</h2>
            </div>
            {pendingApprovals.map(req => (
              <TravelRequestCard 
                key={req.id} 
                request={req} 
                onApprove={handleApproval} 
                showActions 
                onViewDetail={() => viewRequestDetail(req)}
              />
            ))}
          </div>
        )}

        {/* My Travel Requests */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-white">My Travel Requests</h2>
          {myRequests.length === 0 ? (
            <Card className="p-12 text-center border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 rounded-2xl">
              <Plane className="h-16 w-16 mx-auto mb-4 text-slate-200 dark:text-slate-700" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No travel requests yet</p>
              <p className="text-muted-foreground text-sm mt-1">Click "New Travel Request" to create one</p>
            </Card>
          ) : (
            myRequests.map(req => (
              <TravelRequestCard 
                key={req.id} 
                request={req}
                onViewDetail={() => viewRequestDetail(req)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail Dialog */}
      <TravelRequestDetailDialog
        request={selectedRequest}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onApprove={handleApproval}
        isApprover={isApprover}
      />
    </div>
  );
}

// Travel Request Card Component
function TravelRequestCard({ request, onApprove, showActions, onViewDetail }) {
  const purposeLabel = TRAVEL_PURPOSES.find(p => p.value === request.purpose)?.label || request.purpose;

  return (
    <Card 
      className="p-6 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50 rounded-2xl cursor-pointer hover:shadow-xl transition-all duration-200"
      onClick={onViewDetail}
      data-testid={`travel-request-card-${request.id}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
            <Plane className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="font-semibold text-lg text-slate-800 dark:text-white">{request.user_name}</p>
            <p className="text-sm text-muted-foreground">{purposeLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {request.is_short_notice && (
            <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Short Notice
            </Badge>
          )}
          <Badge className={statusColors[request.status]}>
            {statusLabels[request.status]}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> From
          </p>
          <p className="font-medium text-slate-700 dark:text-slate-300">{request.from_location}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> To
          </p>
          <p className="font-medium text-slate-700 dark:text-slate-300">{request.to_location}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Departure
          </p>
          <p className="font-medium text-slate-700 dark:text-slate-300">
            {format(parseISO(request.departure_date), 'MMM d, yyyy')}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Return
          </p>
          <p className="font-medium text-slate-700 dark:text-slate-300">
            {format(parseISO(request.return_date), 'MMM d, yyyy')}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span className="font-medium text-slate-700 dark:text-slate-300">₹{request.tentative_budget?.toLocaleString() || 0}</span>
          </div>
          {request.opportunity_size > 0 && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-700 dark:text-green-400">₹{(request.opportunity_size / 100000).toFixed(1)}L opportunity</span>
            </div>
          )}
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </div>
    </Card>
  );
}

// Travel Request Form Component
function TravelRequestForm({ onSuccess, initialData = null }) {
  const [loading, setLoading] = useState(false);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const [leadSearchTerm, setLeadSearchTerm] = useState('');
  const [leadSearchResults, setLeadSearchResults] = useState([]);
  const [cities, setCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [fromSearchTerm, setFromSearchTerm] = useState('');
  const [toSearchTerm, setToSearchTerm] = useState('');
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  
  // Fetch cities from master locations
  useEffect(() => {
    const fetchCities = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/master-locations/flat`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCities(response.data.cities || []);
      } catch (error) {
        console.error('Failed to fetch cities:', error);
      } finally {
        setLoadingCities(false);
      }
    };
    fetchCities();
  }, []);
  
  const [formData, setFormData] = useState({
    from_location: initialData?.from_location || '',
    to_location: initialData?.to_location || '',
    departure_date: initialData?.departure_date || '',
    return_date: initialData?.return_date || '',
    is_flexible: initialData?.is_flexible || false,
    flexible_window: initialData?.flexible_window || 2,
    flexibility_notes: initialData?.flexibility_notes || '',
    purpose: initialData?.purpose || '',
    selected_leads: initialData?.selected_leads || [],
    tentative_budget: initialData?.tentative_budget || '',
    budget_breakdown: initialData?.budget_breakdown || {
      travel: '',
      accommodation: '',
      local_transport: '',
      meals: '',
      others: '',
    },
    additional_notes: initialData?.additional_notes || '',
    short_notice_explanation: initialData?.short_notice_explanation || '',
  });

  const today = new Date().toISOString().split('T')[0];
  const daysBeforeTravel = formData.departure_date 
    ? differenceInDays(parseISO(formData.departure_date), new Date())
    : null;
  const isShortNotice = daysBeforeTravel !== null && daysBeforeTravel < 15;
  const showLeadsSection = formData.purpose === 'lead_customer_visits';
  
  const opportunitySize = formData.selected_leads.reduce(
    (sum, lead) => sum + (parseFloat(lead.estimated_deal_value) || 0), 
    0
  );

  // Search leads
  const searchLeads = useCallback(async (term) => {
    if (!term || term.length < 2) {
      setLeadSearchResults([]);
      return;
    }
    
    setSearchingLeads(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/leads?search=${encodeURIComponent(term)}&page_size=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const leads = response.data.data || response.data || [];
      // Filter out already selected leads
      const selectedIds = formData.selected_leads.map(l => l.lead_id);
      setLeadSearchResults(leads.filter(l => !selectedIds.includes(l.id)));
    } catch (error) {
      console.error('Failed to search leads:', error);
    } finally {
      setSearchingLeads(false);
    }
  }, [formData.selected_leads]);

  useEffect(() => {
    const timer = setTimeout(() => searchLeads(leadSearchTerm), 300);
    return () => clearTimeout(timer);
  }, [leadSearchTerm, searchLeads]);

  const addLead = (lead) => {
    setFormData(prev => ({
      ...prev,
      selected_leads: [
        ...prev.selected_leads,
        {
          lead_id: lead.id,
          lead_name: lead.company_name,
          city: lead.city,
          estimated_deal_value: lead.estimated_value || 0,
        }
      ]
    }));
    setLeadSearchTerm('');
    setLeadSearchResults([]);
  };

  const removeLead = (leadId) => {
    setFormData(prev => ({
      ...prev,
      selected_leads: prev.selected_leads.filter(l => l.lead_id !== leadId)
    }));
  };

  const updateLeadValue = (leadId, value) => {
    setFormData(prev => ({
      ...prev,
      selected_leads: prev.selected_leads.map(l => 
        l.lead_id === leadId ? { ...l, estimated_deal_value: parseFloat(value) || 0 } : l
      )
    }));
  };

  const handleSubmit = async (submitForApproval = false) => {
    // Validation
    if (!formData.from_location || !formData.to_location || !formData.departure_date || !formData.return_date || !formData.purpose) {
      toast.error('Please fill all required fields');
      return;
    }
    
    if (isShortNotice && submitForApproval && (!formData.short_notice_explanation || formData.short_notice_explanation.length < 20)) {
      toast.error('Short notice travel requires an explanation of at least 20 characters');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      const payload = {
        ...formData,
        tentative_budget: parseFloat(formData.tentative_budget) || 0,
        budget_breakdown: {
          travel: parseFloat(formData.budget_breakdown.travel) || 0,
          accommodation: parseFloat(formData.budget_breakdown.accommodation) || 0,
          local_transport: parseFloat(formData.budget_breakdown.local_transport) || 0,
          meals: parseFloat(formData.budget_breakdown.meals) || 0,
          others: parseFloat(formData.budget_breakdown.others) || 0,
        },
        submit_for_approval: submitForApproval,
      };

      await axios.post(`${API_URL}/travel-requests`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success(submitForApproval ? 'Travel request submitted for approval!' : 'Travel request saved as draft');
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create travel request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Trip Details */}
      <div className="space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <MapPin className="h-4 w-4 text-indigo-600" />
          Trip Details
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          {/* From Location - Searchable Dropdown */}
          <div className="space-y-2">
            <Label>From Location *</Label>
            <div className="relative">
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={loadingCities ? "Loading cities..." : "Search city..."}
                  value={fromSearchTerm || formData.from_location}
                  onChange={(e) => {
                    setFromSearchTerm(e.target.value);
                    setShowFromDropdown(true);
                  }}
                  onFocus={() => setShowFromDropdown(true)}
                  className="pl-10"
                  data-testid="from-location-input"
                />
              </div>
              {showFromDropdown && fromSearchTerm && (
                <Card className="absolute z-50 w-full mt-1 p-1 max-h-48 overflow-y-auto shadow-lg border bg-white dark:bg-slate-900">
                  {cities
                    .filter(c => c.name.toLowerCase().includes(fromSearchTerm.toLowerCase()))
                    .slice(0, 10)
                    .map(city => (
                      <div
                        key={city.id}
                        className="p-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg cursor-pointer flex items-center justify-between"
                        onClick={() => {
                          setFormData({ ...formData, from_location: city.name });
                          setFromSearchTerm('');
                          setShowFromDropdown(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                          <span className="font-medium text-sm">{city.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{city.state_name}</span>
                      </div>
                    ))}
                  {cities.filter(c => c.name.toLowerCase().includes(fromSearchTerm.toLowerCase())).length === 0 && (
                    <p className="p-2 text-sm text-muted-foreground text-center">No cities found</p>
                  )}
                </Card>
              )}
              {formData.from_location && !fromSearchTerm && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                    <MapPin className="h-3 w-3 mr-1" />
                    {formData.from_location}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, from_location: '' })}
                      className="ml-1.5 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                </div>
              )}
            </div>
          </div>
          
          {/* To Location - Searchable Dropdown */}
          <div className="space-y-2">
            <Label>To Location *</Label>
            <div className="relative">
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={loadingCities ? "Loading cities..." : "Search city..."}
                  value={toSearchTerm || formData.to_location}
                  onChange={(e) => {
                    setToSearchTerm(e.target.value);
                    setShowToDropdown(true);
                  }}
                  onFocus={() => setShowToDropdown(true)}
                  className="pl-10"
                  data-testid="to-location-input"
                />
              </div>
              {showToDropdown && toSearchTerm && (
                <Card className="absolute z-20 w-full mt-1 p-1 max-h-48 overflow-y-auto shadow-lg">
                  {cities
                    .filter(c => c.name.toLowerCase().includes(toSearchTerm.toLowerCase()))
                    .slice(0, 10)
                    .map(city => (
                      <div
                        key={city.id}
                        className="p-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg cursor-pointer flex items-center justify-between"
                        onClick={() => {
                          setFormData({ ...formData, to_location: city.name });
                          setToSearchTerm('');
                          setShowToDropdown(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                          <span className="font-medium text-sm">{city.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{city.state_name}</span>
                      </div>
                    ))}
                  {cities.filter(c => c.name.toLowerCase().includes(toSearchTerm.toLowerCase())).length === 0 && (
                    <p className="p-2 text-sm text-muted-foreground text-center">No cities found</p>
                  )}
                </Card>
              )}
              {formData.to_location && !toSearchTerm && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                    <MapPin className="h-3 w-3 mr-1" />
                    {formData.to_location}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, to_location: '' })}
                      className="ml-1.5 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Departure Date *</Label>
            <Input
              type="date"
              min={today}
              value={formData.departure_date}
              onChange={(e) => setFormData({ ...formData, departure_date: e.target.value })}
              data-testid="departure-date-input"
            />
          </div>
          <div className="space-y-2">
            <Label>Return Date *</Label>
            <Input
              type="date"
              min={formData.departure_date || today}
              value={formData.return_date}
              onChange={(e) => setFormData({ ...formData, return_date: e.target.value })}
              data-testid="return-date-input"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.is_flexible}
              onCheckedChange={(checked) => setFormData({ ...formData, is_flexible: checked })}
              data-testid="is-flexible-switch"
            />
            <Label>Dates are flexible</Label>
          </div>
          {formData.is_flexible && (
            <div className="flex items-center gap-2">
              <Label className="text-sm">±</Label>
              <Input
                type="number"
                min={1}
                max={7}
                className="w-16"
                value={formData.flexible_window}
                onChange={(e) => setFormData({ ...formData, flexible_window: parseInt(e.target.value) || 2 })}
              />
              <Label className="text-sm">days</Label>
            </div>
          )}
        </div>

        {formData.is_flexible && (
          <div className="space-y-2">
            <Label>Flexibility Notes (optional)</Label>
            <Input
              placeholder="Any preferences for date changes..."
              value={formData.flexibility_notes}
              onChange={(e) => setFormData({ ...formData, flexibility_notes: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* 15-Day Policy Check */}
      {isShortNotice && (
        <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                Short Notice Travel ({daysBeforeTravel} days before departure)
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Travel planned less than 15 days in advance requires an explanation.
              </p>
              <Textarea
                placeholder="Please explain why this travel is being planned on short notice (min 20 characters)..."
                value={formData.short_notice_explanation}
                onChange={(e) => setFormData({ ...formData, short_notice_explanation: e.target.value })}
                className="bg-white dark:bg-slate-800"
                data-testid="short-notice-explanation"
              />
              <p className="text-xs text-amber-600">
                {formData.short_notice_explanation.length}/20 characters minimum
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Purpose */}
      <div className="space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-600" />
          Purpose of Visit *
        </h3>
        <Select
          value={formData.purpose}
          onValueChange={(value) => setFormData({ ...formData, purpose: value })}
        >
          <SelectTrigger data-testid="purpose-select">
            <SelectValue placeholder="Select purpose..." />
          </SelectTrigger>
          <SelectContent>
            {TRAVEL_PURPOSES.map(p => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lead/Customer Visits Section */}
      {showLeadsSection && (
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <Building2 className="h-4 w-4 text-indigo-600" />
            Leads / Customers to Visit
          </h3>
          
          {/* Lead Search */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leads by company name..."
                value={leadSearchTerm}
                onChange={(e) => setLeadSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="lead-search-input"
              />
              {searchingLeads && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            
            {/* Search Results Dropdown */}
            {leadSearchResults.length > 0 && (
              <Card className="absolute z-10 w-full mt-1 p-2 max-h-48 overflow-y-auto">
                {leadSearchResults.map(lead => (
                  <div
                    key={lead.id}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer flex items-center justify-between"
                    onClick={() => addLead(lead)}
                  >
                    <div>
                      <p className="font-medium text-sm">{lead.company_name}</p>
                      <p className="text-xs text-muted-foreground">{lead.city} • {lead.lead_id}</p>
                    </div>
                    <Plus className="h-4 w-4 text-primary" />
                  </div>
                ))}
              </Card>
            )}
          </div>

          {/* Selected Leads */}
          {formData.selected_leads.length > 0 && (
            <div className="space-y-2">
              {formData.selected_leads.map(lead => (
                <Card key={lead.lead_id} className="p-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{lead.lead_name}</p>
                    <p className="text-xs text-muted-foreground">{lead.city}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Deal Value ₹</Label>
                    <Input
                      type="number"
                      className="w-28 h-8"
                      value={lead.estimated_deal_value}
                      onChange={(e) => updateLeadValue(lead.lead_id, e.target.value)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLead(lead.lead_id)}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </Card>
              ))}
              
              {/* Opportunity Size */}
              <Card className="p-3 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-800 dark:text-green-300">Total Opportunity Size</span>
                  </div>
                  <span className="text-xl font-bold text-green-700 dark:text-green-400">
                    ₹{(opportunitySize / 100000).toFixed(2)}L
                  </span>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Budget */}
      <div className="space-y-4">
        <h3 className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-indigo-600" />
          Budget
        </h3>
        
        <div className="space-y-2">
          <Label>Tentative Total Budget (₹) *</Label>
          <Input
            type="number"
            placeholder="e.g., 25000"
            value={formData.tentative_budget}
            onChange={(e) => setFormData({ ...formData, tentative_budget: e.target.value })}
            data-testid="budget-input"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { key: 'travel', label: 'Travel' },
            { key: 'accommodation', label: 'Accommodation' },
            { key: 'local_transport', label: 'Local Transport' },
            { key: 'meals', label: 'Meals' },
            { key: 'others', label: 'Others' },
          ].map(item => (
            <div key={item.key} className="space-y-1">
              <Label className="text-xs">{item.label}</Label>
              <Input
                type="number"
                placeholder="0"
                value={formData.budget_breakdown[item.key]}
                onChange={(e) => setFormData({
                  ...formData,
                  budget_breakdown: { ...formData.budget_breakdown, [item.key]: e.target.value }
                })}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Additional Notes */}
      <div className="space-y-2">
        <Label>Additional Notes (optional)</Label>
        <Textarea
          placeholder="Any additional information..."
          value={formData.additional_notes}
          onChange={(e) => setFormData({ ...formData, additional_notes: e.target.value })}
        />
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
          className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
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

// Travel Request Detail Dialog
function TravelRequestDetailDialog({ request, open, onOpenChange, onApprove, isApprover }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  if (!request) return null;

  const purposeLabel = TRAVEL_PURPOSES.find(p => p.value === request.purpose)?.label || request.purpose;
  const canApprove = isApprover && request.status === 'pending_approval';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Plane className="h-5 w-5 text-indigo-600" />
              Travel Request Details
            </span>
            <Badge className={statusColors[request.status]}>
              {statusLabels[request.status]}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Requester Info */}
          <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <div className="h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
              <Users className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold text-lg">{request.user_name}</p>
              <p className="text-sm text-muted-foreground">
                Submitted on {format(parseISO(request.created_at), 'MMM d, yyyy')}
              </p>
            </div>
          </div>

          {/* Short Notice Warning */}
          {request.is_short_notice && (
            <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-300">Short Notice Travel</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    {request.short_notice_explanation}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Trip Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">From</p>
              <p className="font-medium">{request.from_location}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">To</p>
              <p className="font-medium">{request.to_location}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Departure</p>
              <p className="font-medium">{format(parseISO(request.departure_date), 'MMM d, yyyy')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Return</p>
              <p className="font-medium">{format(parseISO(request.return_date), 'MMM d, yyyy')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Purpose</p>
              <p className="font-medium">{purposeLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Budget</p>
              <p className="font-medium">₹{request.tentative_budget?.toLocaleString() || 0}</p>
            </div>
          </div>

          {/* Selected Leads */}
          {request.selected_leads?.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Leads to Visit ({request.selected_leads.length})</p>
              <div className="space-y-2">
                {request.selected_leads.map((lead, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{lead.lead_name}</span>
                      <span className="text-xs text-muted-foreground">• {lead.city}</span>
                    </div>
                    <span className="text-sm font-medium text-green-600">
                      ₹{(lead.estimated_deal_value / 100000).toFixed(2)}L
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <span className="font-medium text-green-800 dark:text-green-300">Total Opportunity</span>
                  <span className="text-lg font-bold text-green-700 dark:text-green-400">
                    ₹{(request.opportunity_size / 100000).toFixed(2)}L
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Additional Notes */}
          {request.additional_notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Additional Notes</p>
              <p className="text-sm">{request.additional_notes}</p>
            </div>
          )}

          {/* Rejection Reason */}
          {request.rejection_reason && (
            <Card className="p-3 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
              <p className="text-xs text-red-800 dark:text-red-300 font-semibold mb-1">Rejection Reason</p>
              <p className="text-sm text-red-900 dark:text-red-200">{request.rejection_reason}</p>
            </Card>
          )}

          {/* Approval Info */}
          {request.approved_by_name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>
                {request.status === 'approved' ? 'Approved' : 'Reviewed'} by {request.approved_by_name} on{' '}
                {format(parseISO(request.approval_date), 'MMM d, yyyy')}
              </span>
            </div>
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
