import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
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
  BarChart3,
  Package,
  Users,
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import AppBreadcrumb from '../components/AppBreadcrumb';

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
  if (rank === 1) return { 
    bg: 'bg-gradient-to-br from-violet-500 to-purple-600', 
    border: 'border-violet-400', 
    text: 'text-white', 
    icon: Trophy,
    headerBg: 'bg-gradient-to-r from-violet-600 to-purple-700'
  };
  if (rank === 2) return { 
    bg: 'bg-gradient-to-br from-cyan-500 to-teal-600', 
    border: 'border-cyan-400', 
    text: 'text-white', 
    icon: Medal,
    headerBg: 'bg-gradient-to-r from-cyan-600 to-teal-700'
  };
  if (rank === 3) return { 
    bg: 'bg-gradient-to-br from-rose-500 to-pink-600', 
    border: 'border-rose-400', 
    text: 'text-white', 
    icon: Medal,
    headerBg: 'bg-gradient-to-r from-rose-600 to-pink-700'
  };
  return { 
    bg: 'bg-gradient-to-br from-slate-500 to-slate-600', 
    border: 'border-slate-300', 
    text: 'text-white', 
    icon: null,
    headerBg: 'bg-gradient-to-r from-slate-600 to-slate-700'
  };
};

// Combined Progress & Revenue Widget - Modern Contemporary Design
function CombinedProgressWidget({ timeline, plan, estimated }) {
  const { total_days, days_elapsed, days_remaining, progress_percent, milestones } = timeline;
  const [selectedMilestone, setSelectedMilestone] = useState(null);
  const goalType = plan.goal_type || 'run_rate';

  const formatAmount = (amount) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  // Calculate achievement status
  const achievementPercent = estimated?.percent || 0;
  const getAchievementColor = () => {
    if (achievementPercent >= 100) return 'from-emerald-500 to-green-600';
    if (achievementPercent >= 75) return 'from-teal-500 to-cyan-600';
    if (achievementPercent >= 50) return 'from-amber-500 to-orange-500';
    return 'from-rose-500 to-red-500';
  };

  return (
    <Card className="mb-6 overflow-hidden border-0 shadow-lg">
      {/* Gradient Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-6 text-white">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold opacity-80 mb-1">Target Progress</h3>
            <p className="text-3xl font-bold">{formatAmount(plan.total_amount)}</p>
            <p className="text-sm opacity-60 mt-1">
              {goalType === 'cumulative' ? 'Total Target' : 'Monthly Run Rate Target'}
            </p>
          </div>
          
          {/* Time Stats */}
          <div className="flex gap-6">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mb-1">
                <span className="text-xl font-bold text-emerald-400">{days_elapsed}</span>
              </div>
              <p className="text-[10px] opacity-60 uppercase tracking-wider">Completed</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mb-1">
                <span className="text-xl font-bold text-amber-400">{days_remaining}</span>
              </div>
              <p className="text-[10px] opacity-60 uppercase tracking-wider">Remaining</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mb-1">
                <span className="text-xl font-bold">{total_days}</span>
              </div>
              <p className="text-[10px] opacity-60 uppercase tracking-wider">Total Days</p>
            </div>
          </div>
        </div>

        {/* Timeline Progress Bar */}
        <div className="relative pb-12">
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, progress_percent)}%` }}
            />
          </div>
          
          {/* Milestones */}
          <div className="relative h-12 mt-2">
            {milestones?.map((milestone, idx) => {
              const position = ((milestone.days / total_days) * 100);
              const isActive = selectedMilestone === milestone.milestone;
              const isFirst = idx === 0;
              const isLast = idx === milestones.length - 1;
              
              // Adjust position for first and last to prevent overflow
              const adjustedPosition = isLast ? Math.min(position, 95) : isFirst ? Math.max(position, 5) : position;
              
              return (
                <div 
                  key={milestone.milestone}
                  className={cn(
                    "absolute flex flex-col items-center cursor-pointer group transition-transform",
                    isActive && "scale-110"
                  )}
                  style={{ 
                    left: `${adjustedPosition}%`, 
                    top: '0',
                    transform: 'translateX(-50%)'
                  }}
                  onClick={() => setSelectedMilestone(isActive ? null : milestone.milestone)}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-lg",
                    milestone.is_completed 
                      ? "bg-emerald-500 text-white" 
                      : milestone.is_current 
                        ? "bg-blue-500 text-white ring-2 ring-blue-300 ring-offset-2 ring-offset-slate-800" 
                        : "bg-slate-600 text-white/70"
                  )}>
                    {milestone.is_completed ? '✓' : milestone.milestone}
                  </div>
                  
                  <p className={cn(
                    "text-[10px] mt-1 whitespace-nowrap",
                    milestone.is_completed ? "text-emerald-400" : milestone.is_current ? "text-blue-300" : "text-white/50"
                  )}>
                    {milestone.date_label}
                  </p>

                  {isActive && (
                    <div className="absolute bottom-full mb-2 bg-white text-slate-800 text-xs rounded-lg px-3 py-2 shadow-xl z-20">
                      <p className="font-semibold">Milestone {milestone.milestone}</p>
                      <p>Target: {formatAmount(milestone.target_amount)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Date Range - Positioned below milestones */}
        <div className="flex justify-between text-xs opacity-60 -mt-2">
          <span>{new Date(plan.start_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span>{new Date(plan.end_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Revenue Section - Only for Cumulative */}
      {goalType === 'cumulative' && estimated && (
        <div className="p-6 bg-gradient-to-br from-slate-50 to-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-semibold text-slate-700 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Customers On-boarded Revenue
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Estimated revenue from won leads & active customers
              </p>
            </div>
            <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
              {estimated.won_leads_count} Customers
            </Badge>
          </div>

          {/* Revenue Progress */}
          <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden mb-4">
            <div 
              className={cn("h-full rounded-full transition-all duration-700 bg-gradient-to-r", getAchievementColor())}
              style={{ width: `${Math.min(100, achievementPercent)}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={cn(
                "text-xs font-bold",
                achievementPercent > 50 ? "text-white" : "text-slate-600"
              )}>
                {achievementPercent}% achieved
              </span>
            </div>
          </div>

          {/* Revenue Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
              <p className="text-2xl font-bold text-emerald-600">{formatAmount(estimated.achieved)}</p>
              <p className="text-xs text-emerald-700/70 font-medium mt-1">Achieved</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-100">
              <p className="text-2xl font-bold text-slate-600">{formatAmount(estimated.remaining)}</p>
              <p className="text-xs text-slate-500 font-medium mt-1">Remaining</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
              <p className={cn(
                "text-2xl font-bold",
                achievementPercent >= 100 ? "text-emerald-600" : achievementPercent >= 50 ? "text-blue-600" : "text-amber-600"
              )}>
                {achievementPercent}%
              </p>
              <p className="text-xs text-blue-700/70 font-medium mt-1">Achievement</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// Revenue Summary component is now integrated into CombinedProgressWidget

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

// Compact Territory Card (like subscription plan cards) - Modern gradient design
function TerritoryCard({ allocation, rank, planId, onAddCity, onEditCity, onDeleteCity, onDelete, onOpenCityDetail, planStartDate, planEndDate }) {
  const style = getRankStyle(rank);
  const Icon = style.icon;
  const children = allocation.children || [];
  const totalAllocatedToChildren = children.reduce((sum, c) => sum + (c.amount || 0), 0);
  const remaining = allocation.amount - totalAllocatedToChildren;
  const percentDistributed = allocation.amount > 0 ? ((totalAllocatedToChildren / allocation.amount) * 100).toFixed(0) : 0;

  return (
    <div className={cn(
      "flex flex-col rounded-2xl transition-all hover:shadow-2xl hover:-translate-y-1 overflow-hidden shadow-lg",
      "border-0"
    )}>
      {/* Header with gradient */}
      <div className={cn("p-5", style.bg)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center font-bold shrink-0">
              {Icon ? <Icon className="h-5 w-5 text-white" /> : <span className="text-white text-lg">{rank}</span>}
            </div>
            <div>
              <h3 className="font-bold text-lg text-white flex items-center gap-1.5">
                <MapPin className="h-4 w-4 opacity-80" />
                {allocation.territory_name}
              </h3>
              <p className="text-xs text-white/60">Territory #{rank}</p>
            </div>
          </div>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/20 rounded-lg"
            onClick={() => onDelete && onDelete(allocation)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="text-center py-3">
          <p className="text-4xl font-bold text-white">{formatCurrency(allocation.amount, true)}</p>
          <p className="text-xs text-white/60 mt-1">Territory Target</p>
        </div>

        {/* Distribution Progress */}
        <div className="mt-3 bg-white/10 rounded-xl p-3">
          <div className="flex justify-between text-xs mb-2">
            <span className="font-medium text-white/80">{percentDistributed}% distributed to cities</span>
            <span className={remaining > 0 ? 'text-amber-300' : 'text-emerald-300'}>
              {formatCurrency(remaining, true)} available
            </span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/80 rounded-full transition-all duration-500"
              style={{ width: `${percentDistributed}%` }}
            />
          </div>
        </div>
      </div>

      {/* City List */}
      <div className="flex-1 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">City Allocations</p>
          <Button 
            size="sm" 
            variant="outline"
            className="h-7 text-xs rounded-lg"
            onClick={() => onAddCity && onAddCity(allocation)}
            disabled={remaining <= 0}
          >
            <Plus className="h-3 w-3 mr-1" /> Add City
          </Button>
        </div>

        {children.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm border-2 border-dashed rounded-xl bg-slate-50">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No cities allocated yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {children.map((city) => (
              <CityAllocationRow 
                key={city.id} 
                city={city} 
                parentAmount={allocation.amount}
                parentTerritory={allocation}
                planId={planId}
                onEdit={() => onEditCity && onEditCity(city, allocation)}
                onDelete={() => onDeleteCity && onDeleteCity(city)}
                onOpenDetail={onOpenCityDetail}
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
function CityAllocationRow({ city, parentAmount, parentTerritory, planId, onEdit, onDelete, onOpenDetail, planStartDate, planEndDate }) {
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
    <div 
      className="p-2 rounded-lg border bg-gray-50/50 hover:bg-gray-100/50 group cursor-pointer transition-all hover:shadow-sm"
      onClick={() => onOpenDetail && onOpenDetail(city, parentTerritory)}
      data-testid={`city-allocation-${city.city?.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{city.city}</span>
          <span className="text-xs text-muted-foreground shrink-0">({percentOfParent}%)</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
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

// City Allocation Detail Dialog - Drill down to Resources and SKUs
function CityAllocationDetailDialog({ open, onOpenChange, city, parentTerritory, planId, planStartDate, planEndDate, onUpdate }) {
  const [activeTab, setActiveTab] = useState('resources');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [resourceAllocations, setResourceAllocations] = useState([]);
  const [skuAllocations, setSkuAllocations] = useState([]);
  const [availableResources, setAvailableResources] = useState([]);
  const [availableSKUs, setAvailableSKUs] = useState([]);
  const [newAllocation, setNewAllocation] = useState({ id: '', name: '', amount: '', percentage: '' });
  const [allocationType, setAllocationType] = useState('percentage');

  // Reset form when city changes
  useEffect(() => {
    if (open && city) {
      setNewAllocation({ id: '', name: '', amount: '', percentage: '' });
      fetchData();
    }
  }, [open, city]);

  // Guard against null city
  if (!city) {
    return null;
  }

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch existing allocations for this city
      const [resourcesRes, skusRes, childrenRes] = await Promise.all([
        fetch(`${API_URL}/target-planning/resources/by-location?city=${encodeURIComponent(city.city)}`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/master-skus`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/target-planning/${planId}/allocations/${city.id}/children`, { headers: getAuthHeaders() })
      ]);

      if (resourcesRes.ok) {
        const resources = await resourcesRes.json();
        setAvailableResources(resources);
      }

      if (skusRes.ok) {
        const skus = await skusRes.json();
        setAvailableSKUs(skus);
      }

      if (childrenRes.ok) {
        const children = await childrenRes.json();
        setResourceAllocations(children.filter(c => c.level === 'resource'));
        setSkuAllocations(children.filter(c => c.level === 'sku'));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load allocation data');
    } finally {
      setLoading(false);
    }
  };

  const cityAmount = city?.amount || 0;

  const getAvailableBudget = () => {
    const totalAllocated = [...resourceAllocations, ...skuAllocations].reduce((sum, a) => sum + (a.amount || 0), 0);
    return cityAmount - totalAllocated;
  };

  const calculateAmount = () => {
    const availableBudget = getAvailableBudget();
    if (allocationType === 'percentage' && newAllocation.percentage) {
      return (availableBudget * parseFloat(newAllocation.percentage)) / 100;
    }
    return parseFloat(newAllocation.amount) || 0;
  };

  const handleAddAllocation = async () => {
    if (!newAllocation.id) {
      toast.error(`Please select a ${activeTab === 'resources' ? 'resource' : 'SKU'}`);
      return;
    }

    const amount = calculateAmount();
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid amount or percentage');
      return;
    }

    const availableBudget = getAvailableBudget();
    if (amount > availableBudget) {
      toast.error(`Amount exceeds available budget of ${formatCurrency(availableBudget)}`);
      return;
    }

    setAdding(true);
    try {
      const payload = {
        territory_id: city.territory_id,
        territory_name: city.territory_name,
        city: city.city,
        state: city.state,
        parent_allocation_id: city.id,
        level: activeTab === 'resources' ? 'resource' : 'sku',
        amount: amount,
        ...(activeTab === 'resources' 
          ? { resource_id: newAllocation.id, resource_name: newAllocation.name }
          : { sku_id: newAllocation.id, sku_name: newAllocation.name }
        )
      };

      const response = await fetch(`${API_URL}/target-planning/${planId}/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        toast.success(`${activeTab === 'resources' ? 'Resource' : 'SKU'} allocation added`);
        setNewAllocation({ id: '', name: '', amount: '', percentage: '' });
        fetchData();
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
    if (!window.confirm('Delete this allocation?')) return;

    try {
      const response = await fetch(`${API_URL}/target-planning/${planId}/allocations/${allocation.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        toast.success('Allocation deleted');
        fetchData();
        onUpdate();
      }
    } catch (error) {
      toast.error('Failed to delete allocation');
    }
  };

  const totalResourceAllocated = resourceAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);
  const totalSKUAllocated = skuAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);
  const resourcePercent = cityAmount > 0 ? ((totalResourceAllocated / cityAmount) * 100).toFixed(0) : 0;
  const skuPercent = cityAmount > 0 ? ((totalSKUAllocated / cityAmount) * 100).toFixed(0) : 0;

  // Get available items (not already allocated)
  const getAvailableItems = () => {
    if (activeTab === 'resources') {
      const allocatedIds = resourceAllocations.map(a => a.resource_id);
      return availableResources.filter(r => !allocatedIds.includes(r.id));
    } else {
      const allocatedIds = skuAllocations.map(a => a.sku_id);
      return availableSKUs.filter(s => !allocatedIds.includes(s.id));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {city?.city} - Allocation Breakdown
          </DialogTitle>
        </DialogHeader>

        {/* City Budget Summary */}
        <div className="bg-gradient-to-r from-slate-100 to-slate-50 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">City Target</p>
              <p className="text-xl font-bold text-slate-700">{formatCurrency(city?.amount, true)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Allocated</p>
              <p className="text-xl font-bold text-blue-600">
                {formatCurrency(totalResourceAllocated + totalSKUAllocated, true)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Available</p>
              <p className={cn("text-xl font-bold", getAvailableBudget() > 0 ? "text-amber-600" : "text-green-600")}>
                {formatCurrency(getAvailableBudget(), true)}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="resources" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Resources
              <Badge variant="secondary" className="ml-1 text-xs">{resourcePercent}%</Badge>
            </TabsTrigger>
            <TabsTrigger value="skus" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              SKUs
              <Badge variant="secondary" className="ml-1 text-xs">{skuPercent}%</Badge>
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Resources Tab */}
              <TabsContent value="resources" className="flex-1 overflow-hidden mt-4">
                <div className="flex flex-col h-full">
                  {/* Add Resource Form */}
                  <div className="bg-blue-50/50 rounded-lg p-3 mb-3 border border-blue-100">
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <Label className="text-xs">Select Resource</Label>
                        <Select 
                          value={newAllocation.id} 
                          onValueChange={(v) => {
                            const resource = availableResources.find(r => r.id === v);
                            setNewAllocation({ ...newAllocation, id: v, name: resource?.name || '' });
                          }}
                        >
                          <SelectTrigger className="mt-1 bg-white">
                            <SelectValue placeholder="Choose resource" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableItems().length === 0 ? (
                              <div className="p-2 text-sm text-muted-foreground text-center">
                                All resources allocated
                              </div>
                            ) : (
                              getAvailableItems().map((resource) => (
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
                      <div className="w-28">
                        <Label className="text-xs">
                          {allocationType === 'percentage' ? '% of Budget' : 'Amount (₹)'}
                        </Label>
                        <Input
                          type="number"
                          value={allocationType === 'percentage' ? newAllocation.percentage : newAllocation.amount}
                          onChange={(e) => setNewAllocation({ 
                            ...newAllocation, 
                            [allocationType === 'percentage' ? 'percentage' : 'amount']: e.target.value 
                          })}
                          placeholder={allocationType === 'percentage' ? '%' : '₹'}
                          className="mt-1 bg-white"
                        />
                      </div>
                      <Button size="sm" onClick={handleAddAllocation} disabled={adding}>
                        {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button
                        type="button"
                        variant={allocationType === 'percentage' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setAllocationType('percentage')}
                      >
                        <Percent className="h-3 w-3 mr-1" /> %
                      </Button>
                      <Button
                        type="button"
                        variant={allocationType === 'amount' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setAllocationType('amount')}
                      >
                        <IndianRupee className="h-3 w-3 mr-1" /> ₹
                      </Button>
                    </div>
                  </div>

                  {/* Resource Allocations List */}
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {resourceAllocations.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No resources allocated yet</p>
                      </div>
                    ) : (
                      resourceAllocations.map((alloc) => (
                        <div key={alloc.id} className="flex items-center justify-between p-3 rounded-lg border bg-white group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <User className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{alloc.resource_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {cityAmount > 0 ? ((alloc.amount / cityAmount) * 100).toFixed(0) : 0}% of city target
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="font-semibold text-blue-600">{formatCurrency(alloc.amount, true)}</p>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700"
                              onClick={() => handleDeleteAllocation(alloc)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* SKUs Tab */}
              <TabsContent value="skus" className="flex-1 overflow-hidden mt-4">
                <div className="flex flex-col h-full">
                  {/* Add SKU Form */}
                  <div className="bg-emerald-50/50 rounded-lg p-3 mb-3 border border-emerald-100">
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <Label className="text-xs">Select SKU</Label>
                        <Select 
                          value={newAllocation.id} 
                          onValueChange={(v) => {
                            const sku = availableSKUs.find(s => s.id === v);
                            setNewAllocation({ ...newAllocation, id: v, name: sku?.name || '' });
                          }}
                        >
                          <SelectTrigger className="mt-1 bg-white">
                            <SelectValue placeholder="Choose SKU" />
                          </SelectTrigger>
                          <SelectContent>
                            {getAvailableItems().length === 0 ? (
                              <div className="p-2 text-sm text-muted-foreground text-center">
                                All SKUs allocated
                              </div>
                            ) : (
                              getAvailableItems().map((sku) => (
                                <SelectItem key={sku.id} value={sku.id}>
                                  <span className="flex items-center gap-2">
                                    <Package className="h-4 w-4" />
                                    {sku.name} <span className="text-muted-foreground">({sku.category})</span>
                                  </span>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-28">
                        <Label className="text-xs">
                          {allocationType === 'percentage' ? '% of Budget' : 'Amount (₹)'}
                        </Label>
                        <Input
                          type="number"
                          value={allocationType === 'percentage' ? newAllocation.percentage : newAllocation.amount}
                          onChange={(e) => setNewAllocation({ 
                            ...newAllocation, 
                            [allocationType === 'percentage' ? 'percentage' : 'amount']: e.target.value 
                          })}
                          placeholder={allocationType === 'percentage' ? '%' : '₹'}
                          className="mt-1 bg-white"
                        />
                      </div>
                      <Button size="sm" onClick={handleAddAllocation} disabled={adding}>
                        {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button
                        type="button"
                        variant={allocationType === 'percentage' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setAllocationType('percentage')}
                      >
                        <Percent className="h-3 w-3 mr-1" /> %
                      </Button>
                      <Button
                        type="button"
                        variant={allocationType === 'amount' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setAllocationType('amount')}
                      >
                        <IndianRupee className="h-3 w-3 mr-1" /> ₹
                      </Button>
                    </div>
                  </div>

                  {/* SKU Allocations List */}
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {skuAllocations.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No SKUs allocated yet</p>
                      </div>
                    ) : (
                      skuAllocations.map((alloc) => (
                        <div key={alloc.id} className="flex items-center justify-between p-3 rounded-lg border bg-white group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                              <Package className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{alloc.sku_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {cityAmount > 0 ? ((alloc.amount / cityAmount) * 100).toFixed(0) : 0}% of city target
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="font-semibold text-emerald-600">{formatCurrency(alloc.amount, true)}</p>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700"
                              onClick={() => handleDeleteAllocation(alloc)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>
            </>
          )}
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Main Allocation Section with Side-by-Side Territory Cards
function HierarchicalAllocationSection({ planId, allocations, onUpdate, plan }) {
  const [masterLocations, setMasterLocations] = useState([]);
  const [salesResources, setSalesResources] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCityDetailDialog, setShowCityDetailDialog] = useState(false);
  const [selectedCityForDetail, setSelectedCityForDetail] = useState(null);
  const [selectedParentTerritory, setSelectedParentTerritory] = useState(null);
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
              planId={planId}
              onAddCity={openAddDialog}
              onEditCity={handleEditCity}
              onDeleteCity={handleDeleteAllocation}
              onDelete={handleDeleteAllocation}
              onOpenCityDetail={(city, parentTerritory) => {
                setSelectedCityForDetail(city);
                setSelectedParentTerritory(parentTerritory);
                setShowCityDetailDialog(true);
              }}
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

      {/* City Detail Dialog - Resources & SKUs */}
      <CityAllocationDetailDialog
        open={showCityDetailDialog}
        onOpenChange={setShowCityDetailDialog}
        city={selectedCityForDetail}
        parentTerritory={selectedParentTerritory}
        planId={planId}
        planStartDate={plan.start_date}
        planEndDate={plan.end_date}
        onUpdate={onUpdate}
      />
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
      {/* Breadcrumb */}
      <AppBreadcrumb context={{ planName: plan?.name || 'Plan Dashboard' }} />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/target-planning')} className="p-2 rounded-xl hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{plan.name}</h1>
              <Badge className={plan.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                {plan.status}
              </Badge>
              <Badge variant="outline" className="ml-1 bg-slate-50">
                {goalType === 'cumulative' ? 'Cumulative Target' : 'Monthly Run Rate'}
              </Badge>
            </div>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <Target className="h-4 w-4" />
              {plan.milestones || 4} Milestones
            </p>
          </div>
        </div>
      </div>

      {/* Combined Progress & Revenue Widget */}
      <CombinedProgressWidget timeline={timeline} plan={plan} estimated={estimated_revenue} />

      {/* Monthly Performance Table - Only for Run Rate */}
      {goalType === 'run_rate' && monthly_breakdown && monthly_breakdown.length > 0 && (
        <MonthlyPerformanceTable monthlyData={monthly_breakdown} plan={plan} />
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
