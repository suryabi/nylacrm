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
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  Trophy,
  Medal,
  MapPin,
  Building2,
  Percent,
  User,
  Pencil,
  BarChart3
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
      
      <div className="relative pt-8 pb-16 px-4">
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, progress_percent)}%` }}
          />
        </div>
        
        <div className="absolute top-0 left-4 right-4 flex justify-between">
          {milestones?.map((milestone, idx) => {
            const position = ((milestone.days / total_days) * 100);
            const isActive = selectedMilestone === milestone.milestone;
            const isLast = idx === milestones.length - 1;
            
            return (
              <div 
                key={milestone.milestone}
                className={cn(
                  "absolute flex flex-col items-center cursor-pointer group",
                  isLast ? "-translate-x-full" : "-translate-x-1/2"
                )}
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
                
                <div className={cn("mt-1 text-center", isLast && "text-right")}>
                  <p className={cn(
                    "text-sm font-semibold whitespace-nowrap",
                    milestone.is_completed ? "text-green-600" : milestone.is_current ? "text-blue-600" : "text-gray-600"
                  )}>
                    Day {milestone.days}
                  </p>
                  <p className="text-[10px] text-muted-foreground whitespace-nowrap">{milestone.date_label}</p>
                </div>

                {isActive && (
                  <div className={cn(
                    "absolute bottom-full mb-2 z-10 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap",
                    isLast ? "right-0" : "left-1/2 -translate-x-1/2"
                  )}>
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
      
      <div className="flex items-center justify-between text-sm text-muted-foreground">
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

// Revenue Summary Cards - Only for Cumulative Target plans
function RevenueSummaryCards({ estimated, plan }) {
  const goalType = plan.goal_type || 'run_rate';
  
  // Only show for cumulative target plans
  if (goalType !== 'cumulative') {
    return null;
  }
  
  return (
    <div className="mb-6">
      {/* Revenue from Won Leads Card - Only for Cumulative */}
      <Card className="p-5 border-2 border-green-200 bg-green-50/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2 text-green-700">
            <TrendingUp className="h-5 w-5" />
            Revenue from Won leads this month
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
    </div>
  );
}

// Monthly Performance Table - Only for Run Rate plans
function MonthlyPerformanceTable({ monthlyData, plan }) {
  const target = plan.total_amount || 0;
  const goalType = plan.goal_type || 'run_rate';
  
  // Only show for run_rate plans (hide for cumulative)
  if (goalType === 'cumulative') {
    return null;
  }
  
  // Filter to show only current month and past months (hide future months)
  const filteredMonthlyData = monthlyData.filter(m => m.is_current || m.is_past);
  
  // Calculate cumulative revenue for % of Target Run Rate Achieved
  let cumulativeRevenue = 0;

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Monthly Performance
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Track monthly revenue growth towards target run rate
          </p>
        </div>
        <div className="text-right">
          <span className="text-muted-foreground text-sm">Target Run Rate:</span>
          <p className="font-bold text-primary text-xl">{formatCurrency(target, true)}/month</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-3 font-semibold text-sm text-muted-foreground">Month</th>
              <th className="pb-3 font-semibold text-sm text-muted-foreground text-right">
                <span className="flex items-center justify-end gap-1">
                  <Receipt className="h-3 w-3" /> Revenue Added
                </span>
              </th>
              <th className="pb-3 font-semibold text-sm text-muted-foreground text-center">% of Target Run Rate Achieved</th>
            </tr>
          </thead>
          <tbody>
            {filteredMonthlyData.map((month, idx) => {
              // Track cumulative revenue added
              cumulativeRevenue += (month.invoice_value || 0);
              
              // Calculate % of target run rate achieved (based on cumulative revenue vs target)
              const runRateAchievedPercent = target > 0 ? Math.round((cumulativeRevenue / target) * 100) : 0;
              
              return (
                <tr 
                  key={idx} 
                  className={cn(
                    "border-b last:border-0",
                    month.is_current && "bg-blue-50"
                  )}
                >
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-medium",
                        month.is_current && "text-blue-700"
                      )}>
                        {month.month}
                      </span>
                      {month.is_current && (
                        <Badge className="bg-blue-100 text-blue-700 text-[10px]">Current</Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-right">
                    <span className="font-semibold">{formatCurrency(month.invoice_value, true)}</span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full",
                            runRateAchievedPercent >= 100 ? "bg-green-500" : 
                            runRateAchievedPercent >= 75 ? "bg-teal-500" :
                            runRateAchievedPercent >= 50 ? "bg-amber-500" : "bg-red-400"
                          )}
                          style={{ width: `${Math.min(100, runRateAchievedPercent)}%` }}
                        />
                      </div>
                      <span className={cn(
                        "text-sm font-semibold w-14",
                        runRateAchievedPercent >= 100 ? "text-green-600" : 
                        runRateAchievedPercent >= 75 ? "text-teal-600" :
                        runRateAchievedPercent >= 50 ? "text-amber-600" : "text-red-500"
                      )}>
                        {runRateAchievedPercent}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-gray-50 font-semibold">
              <td className="py-3">Total Revenue (Run Rate)</td>
              <td className="py-3 text-right">
                {formatCurrency(cumulativeRevenue || filteredMonthlyData.reduce((sum, m) => sum + (m.invoice_value || 0), 0), true)}
              </td>
              <td className="py-3 text-center">
                <span className={cn(
                  "font-bold",
                  (target > 0 && (filteredMonthlyData.reduce((sum, m) => sum + (m.invoice_value || 0), 0) / target) * 100 >= 100) 
                    ? "text-green-600" 
                    : "text-primary"
                )}>
                  {target > 0 ? Math.round((filteredMonthlyData.reduce((sum, m) => sum + (m.invoice_value || 0), 0) / target) * 100) : 0}% of Target
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-700">
          <strong>Run Rate Goal:</strong> Build up monthly recurring revenue to reach {formatCurrency(target, true)}/month by the end of the period.
        </p>
      </div>
    </Card>
  );
}

// Compact Territory Card (like subscription plan cards)
function TerritoryCard({ allocation, rank, onAddCity, onEditCity, onDeleteCity, onDelete, planStartDate, planEndDate }) {
  const style = getRankStyle(rank);
  const Icon = style.icon;
  const children = allocation.children || [];
  const totalAllocatedToChildren = children.reduce((sum, c) => sum + (c.amount || 0), 0);
  const remaining = allocation.amount - totalAllocatedToChildren;
  const percentDistributed = allocation.amount > 0 ? ((totalAllocatedToChildren / allocation.amount) * 100).toFixed(0) : 0;

  return (
    <div className={cn(
      "flex flex-col rounded-xl border-2 transition-all hover:shadow-lg overflow-hidden",
      style.border
    )}>
      {/* Header */}
      <div className={cn("p-4", style.bg)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0",
              style.text, "bg-white/60"
            )}>
              {Icon ? <Icon className="h-4 w-4" /> : rank}
            </div>
            <div>
              <h3 className="font-bold text-lg flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {allocation.territory_name}
              </h3>
            </div>
          </div>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-100"
            onClick={() => onDelete && onDelete(allocation)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        
        <div className="text-center py-2">
          <p className={cn("text-3xl font-bold", style.text)}>{formatCurrency(allocation.amount, true)}</p>
          <p className="text-xs text-muted-foreground">Territory Target</p>
        </div>

        {/* Distribution Progress */}
        <div className="mt-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium">{percentDistributed}% distributed</span>
            <span className={remaining > 0 ? 'text-amber-700' : 'text-green-700'}>
              {formatCurrency(remaining, true)} left
            </span>
          </div>
          <Progress value={parseFloat(percentDistributed)} className="h-1.5" />
        </div>
      </div>

      {/* City List */}
      <div className="flex-1 bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cities</p>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-6 text-xs"
            onClick={() => onAddCity && onAddCity(allocation)}
            disabled={remaining <= 0}
          >
            <Plus className="h-3 w-3 mr-1" /> Add
          </Button>
        </div>

        {children.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm border border-dashed rounded-lg">
            No cities allocated
          </div>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {children.map((city) => (
              <CityAllocationRow 
                key={city.id} 
                city={city} 
                parentAmount={allocation.amount}
                onEdit={() => onEditCity && onEditCity(city, allocation)}
                onDelete={() => onDeleteCity && onDeleteCity(city)}
                planStartDate={planStartDate}
                planEndDate={planEndDate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// City Row with Allocated vs Achieved
function CityAllocationRow({ city, parentAmount, onEdit, onDelete, planStartDate, planEndDate }) {
  const [achieved, setAchieved] = useState(0);
  const [loading, setLoading] = useState(true);
  const percentOfParent = parentAmount > 0 ? ((city.amount / parentAmount) * 100).toFixed(0) : 0;
  const achievedPercent = city.amount > 0 ? ((achieved / city.amount) * 100).toFixed(0) : 0;

  useEffect(() => {
    fetchCityAchievement();
  }, [city.city, planStartDate, planEndDate]);

  const fetchCityAchievement = async () => {
    try {
      const response = await fetch(`${API_URL}/target-planning/city-achievement?city=${encodeURIComponent(city.city)}&start_date=${planStartDate}&end_date=${planEndDate}`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setAchieved(data.achieved || 0);
      }
    } catch (error) {
      console.error('Error fetching city achievement:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-2 rounded-lg border bg-gray-50/50 hover:bg-gray-100/50 group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{city.city}</span>
          <span className="text-xs text-muted-foreground shrink-0">({percentOfParent}%)</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-700" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white rounded px-2 py-1 border">
          <p className="text-muted-foreground">Allocated</p>
          <p className="font-semibold text-blue-600">{formatCurrency(city.amount, true)}</p>
        </div>
        <div className="bg-white rounded px-2 py-1 border">
          <p className="text-muted-foreground">Achieved</p>
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <p className={cn("font-semibold", parseFloat(achievedPercent) >= 100 ? "text-green-600" : parseFloat(achievedPercent) >= 50 ? "text-amber-600" : "text-red-500")}>
              {formatCurrency(achieved, true)} <span className="text-[10px] text-muted-foreground">({achievedPercent}%)</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Main Allocation Section with Side-by-Side Territory Cards
function HierarchicalAllocationSection({ planId, allocations, onUpdate, plan }) {
  const [masterLocations, setMasterLocations] = useState([]);
  const [salesResources, setSalesResources] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [adding, setAdding] = useState(false);
  const [allocationType, setAllocationType] = useState('percentage');
  const [parentAllocation, setParentAllocation] = useState(null);
  const [addLevel, setAddLevel] = useState('territory');
  const [editingCity, setEditingCity] = useState(null);
  const [editAmount, setEditAmount] = useState('');
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

  const getCitiesForTerritory = (territoryId, territoryName = '') => {
    // First try to find by ID
    let territory = masterLocations.find(t => t.id === territoryId);
    // If not found, try to find by name
    if (!territory && territoryName) {
      territory = masterLocations.find(t => t.name === territoryName);
    }
    if (!territory) return [];
    const cities = [];
    territory.states?.forEach(state => {
      state.cities?.forEach(city => {
        cities.push({ id: city.id, name: city.name, state: state.name });
      });
    });
    return cities;
  };

  // Get territories that haven't been allocated yet
  const getAvailableTerritories = () => {
    const allocatedTerritoryNames = allocations
      .filter(a => a.level === 'territory' || !a.level)
      .map(a => a.territory_name);
    
    return masterLocations.filter(t => !allocatedTerritoryNames.includes(t.name));
  };

  const getParentAmount = () => {
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
        onUpdate();
      }
    } catch (error) {
      toast.error('Failed to delete allocation');
    }
  };

  const handleEditCity = (city, parentTerritory) => {
    setEditingCity({ ...city, parentTerritory });
    setEditAmount(city.amount.toString());
    setShowEditDialog(true);
  };

  const handleUpdateCityAllocation = async () => {
    if (!editingCity) return;
    
    const newAmount = parseFloat(editAmount);
    if (!newAmount || newAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    // Check if it exceeds parent budget
    const parentTerritory = editingCity.parentTerritory;
    const otherCitiesTotal = (parentTerritory.children || [])
      .filter(c => c.id !== editingCity.id)
      .reduce((sum, c) => sum + (c.amount || 0), 0);
    
    if (newAmount + otherCitiesTotal > parentTerritory.amount) {
      toast.error(`Amount exceeds territory budget. Max available: ${formatCurrency(parentTerritory.amount - otherCitiesTotal)}`);
      return;
    }

    setAdding(true);
    try {
      const response = await fetch(`${API_URL}/target-planning/${planId}/allocations/${editingCity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ amount: newAmount })
      });

      if (response.ok) {
        toast.success('Allocation updated');
        setShowEditDialog(false);
        setEditingCity(null);
        onUpdate();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to update allocation');
      }
    } catch (error) {
      toast.error('Failed to update allocation');
    } finally {
      setAdding(false);
    }
  };

  const totalAllocated = allocations.filter(a => a.level === 'territory' || !a.level).reduce((sum, a) => sum + (a.amount || 0), 0);
  const remaining = plan.total_amount - totalAllocated;
  const allocatedPercent = plan.total_amount > 0 ? ((totalAllocated / plan.total_amount) * 100).toFixed(1) : 0;
  const territoryAllocations = allocations.filter(a => a.level === 'territory' || !a.level).sort((a, b) => (b.amount || 0) - (a.amount || 0));

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Territory Allocations
          </h3>
          <p className="text-sm text-muted-foreground">Distribute targets across territories and cities</p>
        </div>
        <Button 
          size="sm" 
          onClick={() => openAddDialog(null)} 
          data-testid="add-allocation-btn"
          disabled={getAvailableTerritories().length === 0 || remaining <= 0}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Territory
        </Button>
      </div>

      {/* Allocation Summary */}
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

      {/* Progress Bar */}
      <div className="mb-6">
        <Progress value={Math.min(100, parseFloat(allocatedPercent))} className="h-3" />
        <p className="text-xs text-muted-foreground mt-1 text-center">
          {formatCurrency(totalAllocated)} of {formatCurrency(plan.total_amount)} allocated
        </p>
      </div>

      {/* Territory Cards - Side by Side Grid */}
      {territoryAllocations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
          <Target className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No territories allocated yet</p>
          <p className="text-sm">Add territories to distribute the target</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {territoryAllocations.map((territory, idx) => (
            <TerritoryCard
              key={territory.id}
              allocation={territory}
              rank={idx + 1}
              onAddCity={openAddDialog}
              onEditCity={handleEditCity}
              onDeleteCity={handleDeleteAllocation}
              onDelete={handleDeleteAllocation}
              planStartDate={plan.start_date}
              planEndDate={plan.end_date}
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
                    {getAvailableTerritories().length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        All territories have been allocated
                      </div>
                    ) : (
                      getAvailableTerritories().map((territory) => (
                        <SelectItem key={territory.id} value={territory.id}>
                          <span className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {territory.name}
                          </span>
                        </SelectItem>
                      ))
                    )}
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
                    const cities = getCitiesForTerritory(newAllocation.territory_id, newAllocation.territory_name);
                    const city = cities.find(c => c.name === v);
                    setNewAllocation({ ...newAllocation, city: v, state: city?.state || '' });
                  }}
                >
                  <SelectTrigger className="mt-1" data-testid="city-select">
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    {getCitiesForTerritory(newAllocation.territory_id, newAllocation.territory_name).map((city) => (
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

      {/* Edit City Allocation Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit City Allocation
            </DialogTitle>
          </DialogHeader>

          {editingCity && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{editingCity.city}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Territory Budget</p>
                    <p className="font-semibold">{formatCurrency(editingCity.parentTerritory?.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Current Allocation</p>
                    <p className="font-semibold text-blue-600">{formatCurrency(editingCity.amount)}</p>
                  </div>
                </div>
              </div>

              <div>
                <Label>New Amount (₹)</Label>
                <Input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateCityAllocation} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Update
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

  const { plan, timeline, estimated_revenue, actual_revenue, allocations, monthly_breakdown } = dashboardData;
  const goalType = plan.goal_type || 'run_rate';

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
              <Badge variant="outline" className="ml-1">
                {goalType === 'cumulative' ? 'Cumulative Target' : 'Monthly Run Rate'}
              </Badge>
            </div>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <Target className="h-4 w-4" />
              {goalType === 'run_rate' ? 'Target Run Rate:' : 'Total Target:'} <span className="font-semibold text-foreground">{formatCurrency(plan.total_amount)}</span>
              {goalType === 'run_rate' && <span className="text-xs">/month</span>}
              <span className="text-xs">• {plan.milestones || 4} Milestones</span>
            </p>
          </div>
        </div>
      </div>

      {/* Timeline Progress */}
      <TimelineProgressBar timeline={timeline} plan={plan} />

      {/* Monthly Performance Table - Only for Run Rate */}
      {goalType === 'run_rate' && monthly_breakdown && monthly_breakdown.length > 0 && (
        <MonthlyPerformanceTable monthlyData={monthly_breakdown} plan={plan} />
      )}

      {/* Revenue Summary - Only for Cumulative */}
      {goalType === 'cumulative' && (
        <RevenueSummaryCards estimated={estimated_revenue} plan={plan} />
      )}

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
