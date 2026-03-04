import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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
  Target,
  ArrowLeft,
  Calendar,
  IndianRupee,
  Clock,
  TrendingUp,
  Receipt,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  Building2,
  User,
  MapPin
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

// Timeline Progress Bar with 15-day markers
function TimelineProgressBar({ timeline, plan }) {
  const { total_days, days_elapsed, days_remaining, progress_percent, intervals } = timeline;
  
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
      
      {/* Progress Bar */}
      <div className="relative">
        <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
            style={{ width: `${Math.min(100, progress_percent)}%` }}
          >
            {progress_percent >= 10 && (
              <span className="text-white text-sm font-semibold">{progress_percent}%</span>
            )}
          </div>
        </div>
        
        {/* 15-day interval markers */}
        <div className="flex justify-between mt-2">
          {intervals.slice(0, 12).map((interval, idx) => (
            <div 
              key={idx} 
              className="text-center group relative"
              style={{ flex: 1 }}
            >
              <div className="h-2 w-px bg-gray-300 mx-auto" />
              <p className="text-[10px] text-muted-foreground mt-1 truncate px-1">{interval.label}</p>
              
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                  {interval.start} to {interval.end}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Date Range */}
      <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
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

// Revenue Progress Bar Component
function RevenueProgressBar({ title, icon, color, achieved, remaining, percent, count, label, onClick, breakdown }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = icon;
  
  const colorClasses = {
    green: { bg: 'bg-green-500', light: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    blue: { bg: 'bg-blue-500', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    amber: { bg: 'bg-amber-500', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' }
  };
  const c = colorClasses[color] || colorClasses.blue;
  
  return (
    <Card className={cn("p-5 border-2", c.border, c.light)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={cn("font-semibold flex items-center gap-2", c.text)}>
          <Icon className="h-5 w-5" />
          {title}
        </h3>
        <Badge variant="outline" className={c.text}>{count} {label}</Badge>
      </div>
      
      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-6 bg-white rounded-lg overflow-hidden border">
          <div 
            className={cn("h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2", c.bg)}
            style={{ width: `${Math.min(100, percent)}%` }}
          >
            {percent >= 15 && (
              <span className="text-white text-sm font-semibold">{percent}%</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Values */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className={cn("text-xl font-bold", c.text)}>{formatCurrency(achieved, true)}</p>
          <p className="text-xs text-muted-foreground">Achieved</p>
        </div>
        <div>
          <p className="text-xl font-bold text-gray-600">{formatCurrency(remaining, true)}</p>
          <p className="text-xs text-muted-foreground">Remaining</p>
        </div>
        <div>
          <p className={cn("text-xl font-bold", percent >= 100 ? 'text-green-600' : c.text)}>{percent}%</p>
          <p className="text-xs text-muted-foreground">Achievement</p>
        </div>
      </div>
      
      {/* Drilldown */}
      {breakdown && Object.keys(breakdown).length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <button 
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-full"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            View Breakdown
          </button>
          
          {expanded && (
            <div className="mt-3 space-y-2">
              {Object.entries(breakdown).map(([key, data]) => (
                <div key={key} className="flex items-center justify-between text-sm p-2 bg-white rounded">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    {key}
                  </span>
                  <span className="font-medium">{formatCurrency(data.value)} ({data.count})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Allocation Management Section
function AllocationSection({ planId, allocations, onUpdate, plan }) {
  const [territories, setTerritories] = useState([]);
  const [cities, setCities] = useState([]);
  const [resources, setResources] = useState([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newAllocation, setNewAllocation] = useState({
    territory_id: '',
    territory_name: '',
    city: '',
    resource_id: '',
    resource_name: '',
    amount: ''
  });

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    try {
      // Fetch territories
      const terrResponse = await fetch(`${API_URL}/master-locations`, { headers: getAuthHeaders() });
      if (terrResponse.ok) {
        const data = await terrResponse.json();
        setTerritories(data.territories || []);
        setCities(data.cities || []);
      }
      
      // Fetch sales resources
      const resResponse = await fetch(`${API_URL}/target-planning/resources/sales`, { headers: getAuthHeaders() });
      if (resResponse.ok) {
        const data = await resResponse.json();
        setResources(data);
      }
    } catch (error) {
      console.error('Error fetching master data:', error);
    }
  };

  const handleAddAllocation = async () => {
    if (!newAllocation.territory_id || !newAllocation.amount) {
      toast.error('Territory and amount are required');
      return;
    }

    setAdding(true);
    try {
      const response = await fetch(`${API_URL}/target-planning/${planId}/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          ...newAllocation,
          amount: parseFloat(newAllocation.amount)
        })
      });

      if (response.ok) {
        setShowAddDialog(false);
        setNewAllocation({ territory_id: '', territory_name: '', city: '', resource_id: '', resource_name: '', amount: '' });
        onUpdate();
      }
    } catch (error) {
      toast.error('Failed to add allocation');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteAllocation = async (allocationId) => {
    try {
      const response = await fetch(`${API_URL}/target-planning/${planId}/allocations/${allocationId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        onUpdate();
      }
    } catch (error) {
      toast.error('Failed to delete allocation');
    }
  };

  // Group allocations by territory
  const groupedAllocations = allocations.reduce((acc, alloc) => {
    const territory = alloc.territory_name || 'Unassigned';
    if (!acc[territory]) acc[territory] = [];
    acc[territory].push(alloc);
    return acc;
  }, {});

  const totalAllocated = allocations.reduce((sum, a) => sum + (a.amount || 0), 0);
  const remaining = (plan?.total_amount || 0) - totalAllocated;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Target Allocations
        </h3>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Allocated: </span>
            <span className="font-semibold">{formatCurrency(totalAllocated)}</span>
            <span className="text-muted-foreground"> / {formatCurrency(plan?.total_amount)}</span>
            {remaining > 0 && (
              <span className="text-amber-600 ml-2">({formatCurrency(remaining)} remaining)</span>
            )}
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)} data-testid="add-allocation-btn">
            <Plus className="h-4 w-4 mr-1" /> Add Allocation
          </Button>
        </div>
      </div>

      {allocations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No allocations yet. Add allocations to distribute the target.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedAllocations).map(([territory, items]) => {
            const territoryTotal = items.reduce((sum, a) => sum + (a.amount || 0), 0);
            
            return (
              <div key={territory} className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                  <span className="font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {territory}
                  </span>
                  <span className="font-semibold text-primary">{formatCurrency(territoryTotal)}</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>City</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((alloc) => (
                      <TableRow key={alloc.id}>
                        <TableCell>{alloc.city || '-'}</TableCell>
                        <TableCell>
                          {alloc.resource_name ? (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" /> {alloc.resource_name}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(alloc.amount)}</TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-500 hover:text-red-700"
                            onClick={() => handleDeleteAllocation(alloc.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Allocation Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Target Allocation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Territory *</Label>
              <Select 
                value={newAllocation.territory_id} 
                onValueChange={(v) => {
                  const terr = territories.find(t => t.id === v);
                  setNewAllocation({ 
                    ...newAllocation, 
                    territory_id: v, 
                    territory_name: terr?.name || '' 
                  });
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select territory" />
                </SelectTrigger>
                <SelectContent>
                  {territories.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>City (Optional)</Label>
              <Select 
                value={newAllocation.city} 
                onValueChange={(v) => setNewAllocation({ ...newAllocation, city: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">-- All Cities --</SelectItem>
                  {cities.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Resource (Optional)</Label>
              <Select 
                value={newAllocation.resource_id} 
                onValueChange={(v) => {
                  const res = resources.find(r => r.id === v);
                  setNewAllocation({ 
                    ...newAllocation, 
                    resource_id: v, 
                    resource_name: res?.name || '' 
                  });
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select resource" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">-- Unassigned --</SelectItem>
                  {resources.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name} ({r.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                value={newAllocation.amount}
                onChange={(e) => setNewAllocation({ ...newAllocation, amount: e.target.value })}
                placeholder="Enter target amount"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
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
            </p>
          </div>
        </div>
      </div>

      {/* Timeline Progress */}
      <TimelineProgressBar timeline={timeline} plan={plan} />

      {/* Revenue Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <RevenueProgressBar
          title="Estimated Revenue (Won Leads)"
          icon={TrendingUp}
          color="green"
          achieved={estimated_revenue.achieved}
          remaining={estimated_revenue.remaining}
          percent={estimated_revenue.percent}
          count={estimated_revenue.won_leads_count}
          label="Won Leads"
          breakdown={estimated_revenue.territory_breakdown}
        />
        
        <RevenueProgressBar
          title="Actual Revenue (Invoices)"
          icon={Receipt}
          color="blue"
          achieved={actual_revenue.achieved}
          remaining={actual_revenue.remaining}
          percent={actual_revenue.percent}
          count={actual_revenue.invoices_count}
          label="Invoices"
          breakdown={actual_revenue.city_breakdown}
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Target</p>
          <p className="text-xl font-bold">{formatCurrency(plan.total_amount, true)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Estimated</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(estimated_revenue.achieved, true)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Actual</p>
          <p className="text-xl font-bold text-blue-600">{formatCurrency(actual_revenue.achieved, true)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-sm text-muted-foreground">Gap</p>
          <p className={cn(
            "text-xl font-bold",
            actual_revenue.remaining > 0 ? 'text-amber-600' : 'text-green-600'
          )}>
            {actual_revenue.remaining > 0 ? formatCurrency(actual_revenue.remaining, true) : (
              <span className="flex items-center justify-center gap-1">
                <CheckCircle className="h-5 w-5" /> Met!
              </span>
            )}
          </p>
        </Card>
      </div>

      {/* Allocations Section */}
      <AllocationSection 
        planId={planId} 
        allocations={allocations} 
        onUpdate={fetchDashboard}
        plan={plan}
      />
    </div>
  );
}
