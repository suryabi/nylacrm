import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { 
  Search, 
  Filter, 
  RotateCcw, 
  GripVertical,
  Phone,
  Mail,
  MapPin,
  Calendar,
  User,
  Building2,
  ArrowRight,
  LayoutGrid,
  List,
  ChevronDown,
  Clock
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Lead status configuration with colors and order
const LEAD_STATUSES = [
  { id: 'new', label: 'New', color: 'bg-blue-500', bgLight: 'bg-blue-50', textColor: 'text-blue-700', borderColor: 'border-blue-200' },
  { id: 'contacted', label: 'Contacted', color: 'bg-yellow-500', bgLight: 'bg-yellow-50', textColor: 'text-yellow-700', borderColor: 'border-yellow-200' },
  { id: 'qualified', label: 'Qualified', color: 'bg-green-500', bgLight: 'bg-green-50', textColor: 'text-green-700', borderColor: 'border-green-200' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-purple-500', bgLight: 'bg-purple-50', textColor: 'text-purple-700', borderColor: 'border-purple-200' },
  { id: 'trial_in_progress', label: 'Trial', color: 'bg-indigo-500', bgLight: 'bg-indigo-50', textColor: 'text-indigo-700', borderColor: 'border-indigo-200' },
  { id: 'proposal_shared', label: 'Proposal Shared', color: 'bg-orange-500', bgLight: 'bg-orange-50', textColor: 'text-orange-700', borderColor: 'border-orange-200' },
  { id: 'proposal_approved_by_customer', label: 'Approved', color: 'bg-teal-500', bgLight: 'bg-teal-50', textColor: 'text-teal-700', borderColor: 'border-teal-200' },
  { id: 'won', label: 'Won', color: 'bg-emerald-500', bgLight: 'bg-emerald-50', textColor: 'text-emerald-700', borderColor: 'border-emerald-200' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500', bgLight: 'bg-red-50', textColor: 'text-red-700', borderColor: 'border-red-200' },
  { id: 'not_qualified', label: 'Not Qualified', color: 'bg-gray-500', bgLight: 'bg-gray-50', textColor: 'text-gray-700', borderColor: 'border-gray-200' },
  { id: 'future_followup', label: 'Future Follow-up', color: 'bg-slate-500', bgLight: 'bg-slate-50', textColor: 'text-slate-700', borderColor: 'border-slate-200' },
];

const INTERACTION_METHODS = [
  { value: 'phone_call', icon: '📞', label: 'Call' },
  { value: 'customer_visit', icon: '🚗', label: 'Visit' },
  { value: 'email', icon: '✉️', label: 'Email' },
  { value: 'whatsapp', icon: '💬', label: 'WhatsApp' },
  { value: 'sms', icon: '📱', label: 'SMS' },
  { value: 'other', icon: '📝', label: 'Other' },
];

// Lead Card Component
const LeadCard = ({ lead, onDragStart, onDragEnd, onClick, users }) => {
  const assignedUser = users.find(u => u.id === lead.assigned_to);
  
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(lead)}
      className="bg-white rounded-lg border border-gray-200 p-3 mb-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-all duration-200 group"
      data-testid={`kanban-lead-card-${lead.id}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-gray-900 truncate group-hover:text-primary transition-colors">
            {lead.company_name || 'Unnamed Lead'}
          </h4>
          <p className="text-xs text-gray-500 truncate">{lead.lead_id}</p>
        </div>
        <GripVertical className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      </div>
      
      {lead.contact_name && (
        <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
          <User className="w-3 h-3" />
          <span className="truncate">{lead.contact_name}</span>
        </div>
      )}
      
      {lead.city && (
        <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-1">
          <MapPin className="w-3 h-3" />
          <span className="truncate">{lead.city}{lead.state ? `, ${lead.state}` : ''}</span>
        </div>
      )}
      
      {lead.category && (
        <Badge variant="outline" className="text-xs mt-2 bg-gray-50">
          {lead.category}
        </Badge>
      )}
      
      {assignedUser && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-[10px] font-medium text-primary">
              {assignedUser.name?.charAt(0)?.toUpperCase() || '?'}
            </span>
          </div>
          <span className="truncate">{assignedUser.name}</span>
        </div>
      )}
    </div>
  );
};

// Kanban Column Component
const KanbanColumn = ({ status, leads, onDragStart, onDragEnd, onDragOver, onDrop, onCardClick, users, isDropTarget }) => {
  const count = leads.length;
  
  return (
    <div 
      className="flex-shrink-0 w-72"
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, status.id)}
      data-testid={`kanban-column-${status.id}`}
    >
      <div className={`rounded-xl ${status.bgLight} border ${status.borderColor} h-full flex flex-col transition-all duration-200 ${isDropTarget ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
        {/* Column Header */}
        <div className={`p-3 border-b ${status.borderColor}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${status.color}`}></div>
              <h3 className={`font-semibold text-sm ${status.textColor}`}>{status.label}</h3>
            </div>
            <Badge variant="secondary" className={`${status.bgLight} ${status.textColor} text-xs font-medium`}>
              {count}
            </Badge>
          </div>
        </div>
        
        {/* Cards Container */}
        <div className="flex-1 p-2 overflow-y-auto max-h-[calc(100vh-280px)] scrollbar-thin">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onClick={onCardClick}
              users={users}
            />
          ))}
          {leads.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No leads
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Activity Log Dialog Component
const ActivityLogDialog = ({ open, onClose, lead, fromStatus, toStatus, onSubmit, loading }) => {
  const [interactionMethod, setInteractionMethod] = useState('phone_call');
  const [description, setDescription] = useState('');
  
  const fromStatusObj = LEAD_STATUSES.find(s => s.id === fromStatus);
  const toStatusObj = LEAD_STATUSES.find(s => s.id === toStatus);
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('Please enter an activity description');
      return;
    }
    onSubmit({ interactionMethod, description });
  };
  
  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setDescription('');
      setInteractionMethod('phone_call');
    }
  }, [open]);
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Log Activity for Status Change
          </DialogTitle>
        </DialogHeader>
        
        {/* Status Change Visual */}
        <div className="flex items-center justify-center gap-3 py-4 bg-gray-50 rounded-lg mb-4">
          {fromStatusObj && (
            <Badge className={`${fromStatusObj.bgLight} ${fromStatusObj.textColor} border ${fromStatusObj.borderColor}`}>
              {fromStatusObj.label}
            </Badge>
          )}
          <ArrowRight className="w-5 h-5 text-gray-400" />
          {toStatusObj && (
            <Badge className={`${toStatusObj.bgLight} ${toStatusObj.textColor} border ${toStatusObj.borderColor}`}>
              {toStatusObj.label}
            </Badge>
          )}
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Interaction Method */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">How did you interact?</Label>
            <div className="grid grid-cols-3 gap-2">
              {INTERACTION_METHODS.map((method) => (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => setInteractionMethod(method.value)}
                  className={`p-2.5 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                    interactionMethod === method.value
                      ? 'bg-primary/10 border-primary'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                  data-testid={`activity-method-${method.value}`}
                >
                  <span className="text-lg">{method.icon}</span>
                  <span className={`text-xs font-medium ${interactionMethod === method.value ? 'text-primary' : 'text-gray-600'}`}>
                    {method.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">What happened? *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what led to this status change..."
              rows={4}
              className="resize-none"
              data-testid="activity-description"
              autoFocus
            />
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onClose(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !description.trim()} data-testid="submit-activity-log">
              {loading ? 'Saving...' : 'Save & Update Status'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function LeadsKanban() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  
  // Drag state
  const [draggedLead, setDraggedLead] = useState(null);
  const [dropTargetStatus, setDropTargetStatus] = useState(null);
  
  // Activity dialog state
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState(null);
  
  // Get unique values for filters
  const cities = [...new Set(leads.map(l => l.city).filter(Boolean))].sort();
  const categories = [...new Set(leads.map(l => l.category).filter(Boolean))].sort();
  
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [leadsRes, usersRes] = await Promise.all([
        axios.get(`${API_URL}/api/leads?pageSize=500`, { headers, withCredentials: true }),
        axios.get(`${API_URL}/api/users`, { headers, withCredentials: true })
      ]);
      
      setLeads(leadsRes.data.data || []);
      setUsers(usersRes.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Filter leads
  const filteredLeads = leads.filter(lead => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        (lead.company_name?.toLowerCase().includes(query)) ||
        (lead.contact_name?.toLowerCase().includes(query)) ||
        (lead.lead_id?.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }
    if (cityFilter !== 'all' && lead.city !== cityFilter) return false;
    if (assignedToFilter !== 'all' && lead.assigned_to !== assignedToFilter) return false;
    if (categoryFilter !== 'all' && lead.category !== categoryFilter) return false;
    return true;
  });
  
  // Group leads by status
  const leadsByStatus = LEAD_STATUSES.reduce((acc, status) => {
    acc[status.id] = filteredLeads.filter(lead => lead.status === status.id);
    return acc;
  }, {});
  
  // Drag handlers
  const handleDragStart = (e, lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragEnd = () => {
    setDraggedLead(null);
    setDropTargetStatus(null);
  };
  
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  
  const handleDrop = (e, newStatus) => {
    e.preventDefault();
    setDropTargetStatus(null);
    
    if (!draggedLead || draggedLead.status === newStatus) {
      setDraggedLead(null);
      return;
    }
    
    // Open activity dialog
    setPendingStatusChange({
      lead: draggedLead,
      fromStatus: draggedLead.status,
      toStatus: newStatus
    });
    setActivityDialogOpen(true);
  };
  
  // Handle activity submission and status update
  const handleActivitySubmit = async ({ interactionMethod, description }) => {
    if (!pendingStatusChange) return;
    
    const { lead, toStatus } = pendingStatusChange;
    
    try {
      setUpdating(true);
      const token = localStorage.getItem('token');
      const headers = { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      // Map interaction method to activity type
      const activityTypeMap = {
        'phone_call': 'call',
        'customer_visit': 'visit',
        'email': 'email',
        'whatsapp': 'call',
        'sms': 'call',
        'other': 'note'
      };
      
      // Log activity
      await axios.post(
        `${API_URL}/api/activities`,
        {
          lead_id: lead.id,
          activity_type: activityTypeMap[interactionMethod] || 'note',
          description: description
        },
        { headers, withCredentials: true }
      );
      
      // Update status
      await axios.put(
        `${API_URL}/api/leads/${lead.id}`,
        { status: toStatus },
        { headers, withCredentials: true }
      );
      
      // Update local state
      setLeads(prev => prev.map(l => 
        l.id === lead.id ? { ...l, status: toStatus } : l
      ));
      
      toast.success(`Lead moved to "${LEAD_STATUSES.find(s => s.id === toStatus)?.label}"`);
      setActivityDialogOpen(false);
      setPendingStatusChange(null);
    } catch (error) {
      console.error('Failed to update lead:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to update lead status';
      toast.error(errorMsg);
    } finally {
      setUpdating(false);
      setDraggedLead(null);
    }
  };
  
  const handleCardClick = (lead) => {
    navigate(`/leads/${lead.id}`);
  };
  
  const resetFilters = () => {
    setSearchQuery('');
    setCityFilter('all');
    setAssignedToFilter('all');
    setCategoryFilter('all');
  };
  
  const hasActiveFilters = searchQuery || cityFilter !== 'all' || assignedToFilter !== 'all' || categoryFilter !== 'all';
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col" data-testid="leads-kanban">
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leads Pipeline</h1>
            <p className="text-sm text-gray-500 mt-1">
              Drag and drop leads to update their status • {filteredLeads.length} leads
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/leads')}
              className="gap-2"
              data-testid="switch-to-list-view"
            >
              <List className="w-4 h-4" />
              List View
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => navigate('/leads/new')}
              className="gap-2"
              data-testid="add-new-lead"
            >
              + New Lead
            </Button>
          </div>
        </div>
        
        {/* Filters Bar */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="kanban-search"
              />
            </div>
            
            {/* City Filter */}
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger className="w-[150px]" data-testid="kanban-city-filter">
                <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                <SelectValue placeholder="City" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {cities.map(city => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Assigned To Filter */}
            <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
              <SelectTrigger className="w-[180px]" data-testid="kanban-assigned-filter">
                <User className="w-4 h-4 mr-2 text-gray-400" />
                <SelectValue placeholder="Assigned To" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Team Members</SelectItem>
                {users.filter(u => u.is_active).map(user => (
                  <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[150px]" data-testid="kanban-category-filter">
                <Building2 className="w-4 h-4 mr-2 text-gray-400" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Reset Filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-gray-500 hover:text-gray-700"
                data-testid="kanban-reset-filters"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </Card>
      </div>
      
      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {LEAD_STATUSES.map((status) => (
            <KanbanColumn
              key={status.id}
              status={status}
              leads={leadsByStatus[status.id] || []}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onCardClick={handleCardClick}
              users={users}
              isDropTarget={dropTargetStatus === status.id}
            />
          ))}
        </div>
      </div>
      
      {/* Activity Log Dialog */}
      <ActivityLogDialog
        open={activityDialogOpen}
        onClose={(open) => {
          if (!open) {
            setActivityDialogOpen(false);
            setPendingStatusChange(null);
            setDraggedLead(null);
          }
        }}
        lead={pendingStatusChange?.lead}
        fromStatus={pendingStatusChange?.fromStatus}
        toStatus={pendingStatusChange?.toStatus}
        onSubmit={handleActivitySubmit}
        loading={updating}
      />
    </div>
  );
}
