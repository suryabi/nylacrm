import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import {
  Target,
  ArrowLeft,
  Calendar,
  IndianRupee,
  Clock,
  TrendingUp,
  Receipt,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  Trophy,
  Medal,
  MapPin,
  Building2,
  Users,
  Percent,
  Award,
  User,
  ArrowUpRight
} from 'lucide-react';
import { cn } from '../lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Format currency in Indian style
const formatCurrency = (amount, short = false) => {
  if (!amount) return '₹0';
  if (short) {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
};

// Rank colors for leaderboard
const getRankStyle = (rank) => {
  if (rank === 1) return { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', icon: Trophy };
  if (rank === 2) return { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-600', icon: Medal };
  if (rank === 3) return { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-700', icon: Medal };
  return { bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-600', icon: null };
};

// Timeline Progress Bar with clickable milestones
function TimelineProgressBar({ timeline, plan }) {
  const { total_days, days_elapsed, days_remaining, progress_percent, milestones } = timeline;
  const [selectedMilestone, setSelectedMilestone] = useState(null);

  const formatAmount = (amount) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };
  
  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-blue-500" />
          Timeline Progress
        </h3>
        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{days_elapsed}</p>
            <p className="text-muted-foreground text-xs">Days Completed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-600">{days_remaining}</p>
            <p className="text-muted-foreground text-xs">Days Remaining</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{total_days}</p>
            <p className="text-muted-foreground text-xs">Total Days</p>
          </div>
        </div>
      </div>
      
      <div className="relative pt-8 pb-4">
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, progress_percent)}%` }}
          />
        </div>
        
        <div className="absolute top-0 left-0 right-0 flex justify-between">
          {milestones?.map((milestone) => {
            const position = ((milestone.days / total_days) * 100);
            const isActive = selectedMilestone === milestone.milestone;
            
            return (
              <div 
                key={milestone.milestone}
                className="absolute transform -translate-x-1/2 flex flex-col items-center cursor-pointer group"
                style={{ left: `${position}%` }}
                onClick={() => setSelectedMilestone(isActive ? null : milestone.milestone)}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all",
                  milestone.is_completed 
                    ? "bg-green-500 border-green-500 text-white" 
                    : milestone.is_current 
                      ? "bg-blue-500 border-blue-500 text-white animate-pulse" 
                      : "bg-white border-gray-300 text-gray-600",
                  isActive && "ring-2 ring-offset-2 ring-blue-400 scale-110"
                )}>
                  {milestone.is_completed ? <CheckCircle className="h-4 w-4" /> : milestone.milestone}
                </div>
                
                <div className="mt-1 text-center">
                  <p className={cn(
                    "text-sm font-semibold",
                    milestone.is_completed ? "text-green-600" : milestone.is_current ? "text-blue-600" : "text-gray-600"
                  )}>
                    Day {milestone.days}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{milestone.date_label}</p>
                </div>

                {isActive && (
                  <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap">
                    <p className="font-semibold">Milestone {milestone.milestone}</p>
                    <p>Target: {formatAmount(milestone.target_amount)}</p>
                    <p>Due: {new Date(milestone.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-6 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          Start: {new Date(plan.start_date).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}
        </span>
        <span className="flex items-center gap-1">
          End: {new Date(plan.end_date).toLocaleDateString('en-IN', { month: 'long', day: 'numeric', year: 'numeric' })}
          <Calendar className="h-4 w-4" />
        </span>
      </div>
    </Card>
  );
}

// Revenue Summary Cards
function RevenueSummaryCards({ estimated, actual, plan }) {
  return (
    <div className="grid grid-cols-2 gap-6 mb-6">
      {/* Estimated Revenue Card */}
      <Card className="p-5 border-2 border-green-200 bg-green-50/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2 text-green-700">
            <TrendingUp className="h-5 w-5" />
            Estimated Revenue
          </h3>
          <Badge variant="outline" className="text-green-700">{estimated.won_leads_count} Won Leads</Badge>
        </div>
        
        <div className="mb-4">
          <Progress value={estimated.percent} className="h-3 bg-green-100" />
        </div>
        
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(estimated.achieved, true)}</p>
            <p className="text-xs text-muted-foreground">Achieved</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-600">{formatCurrency(estimated.remaining, true)}</p>
            <p className="text-xs text-muted-foreground">Remaining</p>
          </div>
          <div>
            <p className={cn("text-2xl font-bold", estimated.percent >= 100 ? "text-green-600" : "text-green-700")}>
              {estimated.percent}%
            </p>
            <p className="text-xs text-muted-foreground">Achievement</p>
          </div>
        </div>
      </Card>

      {/* Actual Revenue Card */}
      <Card className="p-5 border-2 border-blue-200 bg-blue-50/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2 text-blue-700">
            <Receipt className="h-5 w-5" />
            Actual Revenue
          </h3>
          <Badge variant="outline" className="text-blue-700">{actual.invoices_count} Invoices</Badge>
        </div>
        
        <div className="mb-4">
          <Progress value={actual.percent} className="h-3 bg-blue-100" />
        </div>
        
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-blue-700">{formatCurrency(actual.achieved, true)}</p>
            <p className="text-xs text-muted-foreground">Achieved</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-600">{formatCurrency(actual.remaining, true)}</p>
            <p className="text-xs text-muted-foreground">Remaining</p>
          </div>
          <div>
            <p className={cn("text-2xl font-bold", actual.percent >= 100 ? "text-green-600" : "text-blue-700")}>
              {actual.percent}%
            </p>
            <p className="text-xs text-muted-foreground">Achievement</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Hierarchical Allocation Card Component
function AllocationCard({ allocation, rank, onDrillDown, onAddChild, onDelete, level = 'territory' }) {
  const style = getRankStyle(rank);
  const Icon = style.icon;
  const allocatedToChildren = allocation.allocated_to_children || 0;
  const remaining = allocation.amount - allocatedToChildren;
  const percentAllocated = allocation.amount > 0 ? ((allocatedToChildren / allocation.amount) * 100).toFixed(0) : 0;
  
  const getLevelIcon = () => {
    if (level === 'territory') return <MapPin className="h-4 w-4" />;
    if (level === 'city') return <Building2 className="h-4 w-4" />;
    return <User className="h-4 w-4" />;
  };

  const getLevelLabel = () => {
    if (level === 'territory') return allocation.territory_name;
    if (level === 'city') return allocation.city;
    return allocation.resource_name;
  };

  return (
    <div className={cn(
      "p-4 rounded-xl border-2 transition-all hover:shadow-lg cursor-pointer group",
      style.bg, style.border
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3" onClick={() => level !== 'resource' && onDrillDown && onDrillDown(allocation)}>
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0",
            rank <= 3 ? style.bg : "bg-gray-100",
            style.text
          )}>
            {Icon ? <Icon className="h-5 w-5" /> : rank}
          </div>
          <div>
            <h4 className="font-semibold flex items-center gap-2">
              {getLevelIcon()}
              {getLevelLabel()}
              {level !== 'resource' && (
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </h4>
            <p className="text-xs text-muted-foreground">
              {level === 'territory' && allocation.children?.length > 0 && `${allocation.children.length} cities`}
              {level === 'city' && allocation.children?.length > 0 && `${allocation.children.length} resources`}
              {level === 'resource' && allocation.role}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={cn("text-xl font-bold", style.text)}>{formatCurrency(allocation.amount, true)}</p>
          {level !== 'resource' && allocatedToChildren > 0 && (
            <p className="text-xs text-muted-foreground">{percentAllocated}% distributed</p>
          )}
        </div>
      </div>

      {/* Progress bar for allocated children */}
      {level !== 'resource' && (
        <div className="mt-3">
          <Progress value={parseFloat(percentAllocated)} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{formatCurrency(allocatedToChildren, true)} allocated</span>
            <span className={remaining > 0 ? 'text-amber-600' : 'text-green-600'}>
              {formatCurrency(remaining, true)} remaining
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-dashed opacity-0 group-hover:opacity-100 transition-opacity">
        {level !== 'resource' && remaining > 0 && (
          <Button 
            size="sm" 
            variant="outline" 
            className="flex-1" 
            onClick={(e) => { e.stopPropagation(); onAddChild && onAddChild(allocation); }}
          >
            <Plus className="h-3 w-3 mr-1" />
            {level === 'territory' ? 'Add City' : 'Add Resource'}
          </Button>
        )}
        <Button 
          size="sm" 
          variant="ghost" 
          className="text-red-500 hover:text-red-700 hover:bg-red-50"
          onClick={(e) => { e.stopPropagation(); onDelete && onDelete(allocation); }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// Main Allocation Section with Hierarchical Navigation
function HierarchicalAllocationSection({ planId, allocations, onUpdate, plan }) {
  const [masterLocations, setMasterLocations] = useState([]);
  const [salesResources, setSalesResources] = useState([]);
  const [breadcrumb, setBreadcrumb] = useState([{ level: 'plan', label: 'All Territories', data: null }]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [adding, setAdding] = useState(false);
  const [allocationType, setAllocationType] = useState('percentage');
  const [parentAllocation, setParentAllocation] = useState(null);
  const [addLevel, setAddLevel] = useState('territory');
  const [newAllocation, setNewAllocation] = useState({
    territory_id: '',
    territory_name: '',
    city: '',
    state: '',
    resource_id: '',
    resource_name: '',
    amount: '',
    percentage: ''
  });

  useEffect(() => {
    fetchMasterLocations();
  }, []);

  const fetchMasterLocations = async () => {
    try {
      const response = await fetch(`${API_URL}/master-locations`, { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setMasterLocations(data);
      }
    } catch (error) {
      console.error('Error fetching master locations:', error);
    }
  };

  const fetchResourcesForCity = async (city) => {
    try {
      const response = await fetch(`${API_URL}/target-planning/resources/by-location?city=${encodeURIComponent(city)}`, { 
        headers: getAuthHeaders() 
      });
      if (response.ok) {
        const data = await response.json();
        setSalesResources(data);
      }
    } catch (error) {
      console.error('Error fetching resources:', error);
    }
  };

  const getCurrentItems = () => {
    const current = breadcrumb[breadcrumb.length - 1];
    
    if (current.level === 'plan') {
      return allocations.filter(a => a.level === 'territory' || !a.level);
    }
    
    if (current.level === 'territory') {
      return current.data.children || [];
    }
    
    if (current.level === 'city') {
      return current.data.children || [];
    }
    
    return [];
  };

  const handleDrillDown = (allocation) => {
    if (allocation.level === 'territory' || !allocation.level) {
      setBreadcrumb([...breadcrumb, { level: 'territory', label: allocation.territory_name, data: allocation }]);
    } else if (allocation.level === 'city') {
      fetchResourcesForCity(allocation.city);
      setBreadcrumb([...breadcrumb, { level: 'city', label: allocation.city, data: allocation }]);
    }
  };

  const handleBreadcrumbClick = (index) => {
    setBreadcrumb(breadcrumb.slice(0, index + 1));
  };

  const openAddDialog = (parent = null) => {
    setParentAllocation(parent);
    
    if (!parent) {
      setAddLevel('territory');
      setNewAllocation({ territory_id: '', territory_name: '', city: '', state: '', resource_id: '', resource_name: '', amount: '', percentage: '' });
    } else if (parent.level === 'territory' || !parent.level) {
      setAddLevel('city');
      setNewAllocation({ 
        territory_id: parent.territory_id, 
        territory_name: parent.territory_name, 
        city: '', 
        state: '',
        resource_id: '', 
        resource_name: '', 
        amount: '', 
        percentage: '' 
      });
    } else if (parent.level === 'city') {
      setAddLevel('resource');
      fetchResourcesForCity(parent.city);
      setNewAllocation({ 
        territory_id: parent.territory_id, 
        territory_name: parent.territory_name, 
        city: parent.city,
        state: parent.state,
        resource_id: '', 
        resource_name: '', 
        amount: '', 
        percentage: '' 
      });
    }
    
    setShowAddDialog(true);
  };

  const handleTerritoryChange = (territoryId) => {
    const territory = masterLocations.find(t => t.id === territoryId);
    setNewAllocation({
      ...newAllocation,
      territory_id: territoryId,
      territory_name: territory?.name || '',
      city: '',
      state: ''
    });
  };

  const getCitiesForTerritory = (territoryId) => {
    const territory = masterLocations.find(t => t.id === territoryId);
    if (!territory) return [];
    const cities = [];
    territory.states?.forEach(state => {
      state.cities?.forEach(city => {
        cities.push({ id: city.id, name: city.name, state: state.name });
      });
    });
    return cities;
  };

  const getParentAmount = (forBreadcrumb = false) => {
    // For the banner display when drilling down
    if (forBreadcrumb) {
      const currentData = breadcrumb[breadcrumb.length - 1].data;
      if (currentData) {
        return currentData.amount - (currentData.allocated_to_children || 0);
      }
      return plan.total_amount - totalAllocated;
    }
    
    // For the add dialog
    if (!parentAllocation) return plan.total_amount - totalAllocated;
    return parentAllocation.amount - (parentAllocation.allocated_to_children || 0);
  };

  const calculateAmount = () => {
    const parentAmount = getParentAmount();
    if (allocationType === 'percentage' && newAllocation.percentage) {
      return (parentAmount * parseFloat(newAllocation.percentage)) / 100;
    }
    return parseFloat(newAllocation.amount) || 0;
  };

  const handleAddAllocation = async () => {
    if (addLevel === 'territory' && !newAllocation.territory_id) {
      toast.error('Please select a territory');
      return;
    }
    if (addLevel === 'city' && !newAllocation.city) {
      toast.error('Please select a city');
      return;
    }
    if (addLevel === 'resource' && !newAllocation.resource_id) {
      toast.error('Please select a resource');
      return;
    }

    const amount = calculateAmount();
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid amount or percentage');
      return;
    }

    const parentAmount = getParentAmount();
    if (amount > parentAmount) {
      toast.error(`Amount exceeds available budget of ${formatCurrency(parentAmount)}`);
      return;
    }

    setAdding(true);
    try {
      const payload = {
        territory_id: newAllocation.territory_id,
        territory_name: newAllocation.territory_name,
        city: newAllocation.city || null,
        state: newAllocation.state || null,
        resource_id: newAllocation.resource_id || null,
        resource_name: newAllocation.resource_name || null,
        parent_allocation_id: parentAllocation?.id || null,
        level: addLevel,
        amount: amount
      };

      const response = await fetch(`${API_URL}/target-planning/${planId}/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast.success('Allocation added');
        setShowAddDialog(false);
        setNewAllocation({ territory_id: '', territory_name: '', city: '', state: '', resource_id: '', resource_name: '', amount: '', percentage: '' });
        setParentAllocation(null);
        setBreadcrumb([{ level: 'plan', label: 'All Territories', data: null }]);
        onUpdate();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to add allocation');
      }
    } catch (error) {
      toast.error('Failed to add allocation');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteAllocation = async (allocation) => {
    if (!window.confirm(`Delete this allocation? ${allocation.children?.length > 0 ? 'This will also delete all child allocations.' : ''}`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/target-planning/${planId}/allocations/${allocation.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        toast.success('Allocation deleted');
        setBreadcrumb([{ level: 'plan', label: 'All Territories', data: null }]);
        onUpdate();
      }
    } catch (error) {
      toast.error('Failed to delete allocation');
    }
  };

  const totalAllocated = allocations.filter(a => a.level === 'territory' || !a.level).reduce((sum, a) => sum + (a.amount || 0), 0);
  const remaining = plan.total_amount - totalAllocated;
  const allocatedPercent = plan.total_amount > 0 ? ((totalAllocated / plan.total_amount) * 100).toFixed(1) : 0;
  const currentItems = getCurrentItems();
  const currentLevel = breadcrumb[breadcrumb.length - 1].level;

  return (
    <Card className="p-6">
      {/* Header with Breadcrumb */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            {breadcrumb.map((crumb, idx) => (
              <React.Fragment key={idx}>
                <button
                  onClick={() => handleBreadcrumbClick(idx)}
                  className={cn(
                    "hover:text-primary transition-colors",
                    idx === breadcrumb.length - 1 ? "text-foreground font-semibold" : ""
                  )}
                >
                  {crumb.label}
                </button>
                {idx < breadcrumb.length - 1 && <ChevronRight className="h-3 w-3" />}
              </React.Fragment>
            ))}
          </div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Target Allocations
          </h3>
        </div>
        <Button size="sm" onClick={() => openAddDialog(breadcrumb[breadcrumb.length - 1].data)} data-testid="add-allocation-btn">
          <Plus className="h-4 w-4 mr-1" /> 
          {currentLevel === 'plan' ? 'Add Territory' : currentLevel === 'territory' ? 'Add City' : 'Add Resource'}
        </Button>
      </div>

      {/* Allocation Summary */}
      {currentLevel === 'plan' && (
        <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Target</p>
            <p className="text-xl font-bold">{formatCurrency(plan.total_amount, true)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Allocated</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalAllocated, true)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Remaining</p>
            <p className={cn("text-xl font-bold", remaining > 0 ? "text-amber-600" : "text-green-600")}>
              {formatCurrency(remaining, true)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Progress</p>
            <p className={cn("text-xl font-bold", parseFloat(allocatedPercent) >= 100 ? "text-green-600" : "text-blue-600")}>
              {allocatedPercent}%
            </p>
          </div>
        </div>
      )}

      {/* Parent Info when drilling down */}
      {currentLevel !== 'plan' && breadcrumb[breadcrumb.length - 1].data && (
        <div className="mb-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-muted-foreground">
                {currentLevel === 'territory' ? 'Territory' : 'City'} Budget
              </p>
              <p className="text-2xl font-bold">{formatCurrency(breadcrumb[breadcrumb.length - 1].data.amount)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Available to Allocate</p>
              <p className={cn(
                "text-2xl font-bold",
                getParentAmount(true) > 0 ? "text-amber-600" : "text-green-600"
              )}>
                {formatCurrency(getParentAmount(true))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Allocation Progress Bar (plan level only) */}
      {currentLevel === 'plan' && (
        <div className="mb-6">
          <Progress value={Math.min(100, parseFloat(allocatedPercent))} className="h-3" />
          <p className="text-xs text-muted-foreground mt-1 text-center">
            {formatCurrency(totalAllocated)} of {formatCurrency(plan.total_amount)} allocated
          </p>
        </div>
      )}

      {/* Allocation Cards */}
      {currentItems.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
          <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No allocations yet</p>
          <p className="text-sm">
            {currentLevel === 'plan' && 'Add territories to distribute the target'}
            {currentLevel === 'territory' && 'Add cities to distribute this territory\'s target'}
            {currentLevel === 'city' && 'Add sales resources to distribute this city\'s target'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentItems.sort((a, b) => (b.amount || 0) - (a.amount || 0)).map((item, idx) => (
            <AllocationCard
              key={item.id}
              allocation={item}
              rank={idx + 1}
              level={item.level || 'territory'}
              onDrillDown={handleDrillDown}
              onAddChild={openAddDialog}
              onDelete={handleDeleteAllocation}
            />
          ))}
        </div>
      )}

      {/* Add Allocation Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Add {addLevel === 'territory' ? 'Territory' : addLevel === 'city' ? 'City' : 'Resource'} Allocation
            </DialogTitle>
          </DialogHeader>

          {/* Budget Banner */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">
                  {parentAllocation ? `${parentAllocation.level === 'territory' || !parentAllocation.level ? 'Territory' : 'City'} Budget` : 'Total Target'}
                </p>
                <p className="text-2xl font-bold">
                  {formatCurrency(parentAllocation ? parentAllocation.amount : plan.total_amount)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Available to Allocate</p>
                <p className={cn("text-2xl font-bold", getParentAmount() > 0 ? "text-amber-600" : "text-green-600")}>
                  {formatCurrency(getParentAmount())}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Territory Selection */}
            {addLevel === 'territory' && (
              <div>
                <Label>Territory *</Label>
                <Select 
                  value={newAllocation.territory_id} 
                  onValueChange={handleTerritoryChange}
                >
                  <SelectTrigger className="mt-1" data-testid="territory-select">
                    <SelectValue placeholder="Select territory" />
                  </SelectTrigger>
                  <SelectContent>
                    {masterLocations.map((territory) => (
                      <SelectItem key={territory.id} value={territory.id}>
                        <span className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {territory.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* City Selection */}
            {addLevel === 'city' && (
              <div>
                <Label>City *</Label>
                <Select 
                  value={newAllocation.city || ""} 
                  onValueChange={(v) => {
                    const cities = getCitiesForTerritory(newAllocation.territory_id);
                    const city = cities.find(c => c.name === v);
                    setNewAllocation({ ...newAllocation, city: v, state: city?.state || '' });
                  }}
                >
                  <SelectTrigger className="mt-1" data-testid="city-select">
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    {getCitiesForTerritory(newAllocation.territory_id).map((city) => (
                      <SelectItem key={city.id} value={city.name}>
                        <span className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          {city.name} <span className="text-muted-foreground">({city.state})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Resource Selection */}
            {addLevel === 'resource' && (
              <div>
                <Label>Sales Resource *</Label>
                <Select 
                  value={newAllocation.resource_id || ""} 
                  onValueChange={(v) => {
                    const resource = salesResources.find(r => r.id === v);
                    setNewAllocation({ ...newAllocation, resource_id: v, resource_name: resource?.name || '' });
                  }}
                >
                  <SelectTrigger className="mt-1" data-testid="resource-select">
                    <SelectValue placeholder="Select resource" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesResources.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No sales resources found for this city
                      </div>
                    ) : (
                      salesResources.map((resource) => (
                        <SelectItem key={resource.id} value={resource.id}>
                          <span className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {resource.name} <span className="text-muted-foreground">({resource.role})</span>
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Allocation Method Toggle */}
            <div>
              <Label>Allocation Method</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant={allocationType === 'percentage' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setAllocationType('percentage')}
                >
                  <Percent className="h-4 w-4 mr-1" /> Percentage
                </Button>
                <Button
                  type="button"
                  variant={allocationType === 'amount' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setAllocationType('amount')}
                >
                  <IndianRupee className="h-4 w-4 mr-1" /> Amount
                </Button>
              </div>
            </div>

            {/* Amount Input */}
            {allocationType === 'percentage' ? (
              <div>
                <Label>Percentage of Available Budget (%)</Label>
                <div className="flex gap-2 items-center mt-1">
                  <Input
                    type="number"
                    value={newAllocation.percentage}
                    onChange={(e) => setNewAllocation({ ...newAllocation, percentage: e.target.value })}
                    placeholder="e.g., 25"
                    min="0"
                    max="100"
                    className="flex-1"
                  />
                  <span className="text-muted-foreground">%</span>
                </div>
                {newAllocation.percentage && (
                  <p className="text-sm text-muted-foreground mt-1">
                    = {formatCurrency((getParentAmount() * parseFloat(newAllocation.percentage || 0)) / 100)}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  value={newAllocation.amount}
                  onChange={(e) => setNewAllocation({ ...newAllocation, amount: e.target.value })}
                  placeholder="Enter amount"
                  className="mt-1"
                />
                {newAllocation.amount && getParentAmount() > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    = {((parseFloat(newAllocation.amount || 0) / getParentAmount()) * 100).toFixed(1)}% of available budget
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddAllocation} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add Allocation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function TargetPlanDashboard() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);

  useEffect(() => {
    if (planId) {
      fetchDashboard();
    }
  }, [planId]);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/target-planning/${planId}/dashboard`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      } else {
        toast.error('Failed to load dashboard');
        navigate('/target-planning');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="p-6 text-center">
        <p>Target plan not found</p>
        <Button onClick={() => navigate('/target-planning')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Plans
        </Button>
      </div>
    );
  }

  const { plan, timeline, estimated_revenue, actual_revenue, allocations } = dashboardData;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/target-planning')} className="p-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{plan.name}</h1>
              <Badge className={plan.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                {plan.status}
              </Badge>
            </div>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <Target className="h-4 w-4" />
              Total Target: <span className="font-semibold text-foreground">{formatCurrency(plan.total_amount)}</span>
              <span className="text-xs">• {plan.milestones || 4} Milestones</span>
            </p>
          </div>
        </div>
      </div>

      {/* Timeline Progress */}
      <TimelineProgressBar timeline={timeline} plan={plan} />

      {/* Revenue Summary */}
      <RevenueSummaryCards estimated={estimated_revenue} actual={actual_revenue} plan={plan} />

      {/* Hierarchical Allocations Section - Full Width */}
      <HierarchicalAllocationSection 
        planId={planId} 
        allocations={allocations} 
        onUpdate={fetchDashboard}
        plan={plan}
      />
    </div>
  );
}
