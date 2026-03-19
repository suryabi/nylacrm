import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Download, Save, Copy, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMasterLocations } from '../hooks/useMasterLocations';
import { Checkbox } from '../components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function COGSCalculator() {
  const { user } = useAuth();
  const { cities } = useMasterLocations();
  
  // Check if user can see sensitive cost columns (CEO, Director only)
  // Using case-insensitive check for role
  const userRole = user?.role || '';
  const canSeeCostDetails = ['ceo', 'director'].includes(userRole.toLowerCase());
  
  // Check if user can delete (CEO, System Admin only)
  const canDelete = ['ceo', 'system admin'].includes(userRole.toLowerCase());
  
  // Debug log
  console.log('COGS Calculator - User Role:', userRole, '| Can see cost details:', canSeeCostDetails, '| Can delete:', canDelete);
  
  const [selectedCity, setSelectedCity] = React.useState('');
  const [cogsData, setCogsData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [showCopyDialog, setShowCopyDialog] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  
  // Delete state
  const [selectedRows, setSelectedRows] = React.useState([]);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Toggle row selection for deletion
  const toggleRowSelection = (rowId) => {
    setSelectedRows(prev => 
      prev.includes(rowId) 
        ? prev.filter(id => id !== rowId)
        : [...prev, rowId]
    );
  };

  // Toggle all rows selection
  const toggleAllSelection = () => {
    if (selectedRows.length === cogsData.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(cogsData.map(row => row.id));
    }
  };

  // Delete selected COGS entries
  const deleteSelectedCOGS = async () => {
    if (selectedRows.length === 0) {
      toast.error('No rows selected for deletion');
      return;
    }
    
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      let deletedCount = 0;
      let failedCount = 0;
      
      for (const rowId of selectedRows) {
        try {
          await axios.delete(`${API}/cogs/${rowId}`, {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true
          });
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete COGS entry ${rowId}:`, error);
          failedCount++;
        }
      }
      
      if (deletedCount > 0) {
        toast.success(`Deleted ${deletedCount} COGS ${deletedCount === 1 ? 'entry' : 'entries'}`);
      }
      if (failedCount > 0) {
        toast.error(`Failed to delete ${failedCount} ${failedCount === 1 ? 'entry' : 'entries'}`);
      }
      
      setSelectedRows([]);
      setShowDeleteDialog(false);
      loadCOGSData(); // Reload data
    } catch (error) {
      toast.error('Failed to delete COGS entries');
    } finally {
      setDeleting(false);
    }
  };
  
  // Transient state for "Actual Landing Price" - NOT saved to database
  // Used for on-the-fly gross margin calculation
  const [actualLandingPrices, setActualLandingPrices] = React.useState({});
  
  // Store original gross margin values from database to reset when actual landing price is cleared
  const [originalGrossMargins, setOriginalGrossMargins] = React.useState({});
  
  // Set default city when cities load
  React.useEffect(() => {
    if (cities.length > 0 && !selectedCity) {
      setSelectedCity(cities[0].name);
    }
  }, [cities]);

  // Clear transient actual landing prices and original values when city changes
  React.useEffect(() => {
    setActualLandingPrices({});
    setOriginalGrossMargins({});
    setSelectedRows([]);  // Clear selection when city changes
  }, [selectedCity]);

  React.useEffect(() => {
    if (selectedCity) {
      loadCOGSData();
    }
  }, [selectedCity]);

  const loadCOGSData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/cogs/${selectedCity}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      const data = res.data.cogs_data || [];
      setCogsData(data);
      setSelectedRows([]);  // Clear selection after reload
      
      // Store original gross margin values for each row
      const originalMargins = {};
      data.forEach(row => {
        if (row.id) {
          originalMargins[row.id] = row.gross_margin;
        }
      });
      setOriginalGrossMargins(originalMargins);
    } catch (error) {
      toast.error('Failed to load COGS data');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (index, field, value) => {
    const newData = [...cogsData];
    newData[index] = { ...newData[index], [field]: value };
    
    // Calculate computed values locally in real-time
    const row = newData[index];
    const primary = parseFloat(row.primary_packaging_cost) || 0;
    const secondary = parseFloat(row.secondary_packaging_cost) || 0;
    const manufacturing = parseFloat(row.manufacturing_variable_cost) || 0;
    const marginPercent = parseFloat(row.gross_margin) || 0;
    const logistics = parseFloat(row.outbound_logistics_cost) || 0;
    const distributionPercent = parseFloat(row.distribution_cost) || 0;
    
    // Calculate COGS
    const totalCOGS = primary + secondary + manufacturing;
    
    // Calculate Gross Margin in rupees
    const grossMarginRupees = totalCOGS * (marginPercent / 100);
    
    // Calculate Ex-Factory Price
    const exFactory = totalCOGS + grossMarginRupees;
    
    // Calculate Base Cost (what should remain after distribution cost is paid)
    // Base Cost = Primary + Secondary + Mfg + Gross Margin (₹) + Logistics
    const baseCost = primary + secondary + manufacturing + grossMarginRupees + logistics;
    
    // Calculate Minimum Landing Price
    // Formula: Min Landing - (Min Landing × Distribution %) = Base Cost
    // So: Min Landing = Base Cost / (1 - Distribution %)
    let landingPrice;
    if (distributionPercent >= 100) {
      landingPrice = 0; // Invalid: distribution can't be 100% or more
    } else if (distributionPercent > 0) {
      landingPrice = baseCost / (1 - distributionPercent / 100);
    } else {
      landingPrice = baseCost; // No distribution cost
    }
    
    // Update computed fields
    newData[index].total_cogs = totalCOGS;
    newData[index].ex_factory_price = exFactory;
    newData[index].minimum_landing_price = landingPrice;
    newData[index].base_cost = baseCost;
    
    setCogsData(newData);
    setHasChanges(true);
  };

  // Handle Actual Landing Price change - recalculates Gross Margin % based on it
  // This is a transient value, not saved to database
  const updateActualLandingPrice = (index, value) => {
    const rowId = cogsData[index]?.id;
    if (!rowId) return;
    
    // Update transient state
    setActualLandingPrices(prev => ({
      ...prev,
      [rowId]: value
    }));
    
    // If value is empty or invalid, reset gross margin to original saved value
    if (!value || value === '' || isNaN(parseFloat(value))) {
      const originalMargin = originalGrossMargins[rowId];
      if (originalMargin !== undefined) {
        // Reset to original value using updateField to recalculate all dependent values
        updateField(index, 'gross_margin', originalMargin.toString());
      }
      return;
    }
    
    const actualLanding = parseFloat(value);
    const row = cogsData[index];
    
    // Get cost components
    const primary = parseFloat(row.primary_packaging_cost) || 0;
    const secondary = parseFloat(row.secondary_packaging_cost) || 0;
    const manufacturing = parseFloat(row.manufacturing_variable_cost) || 0;
    const logistics = parseFloat(row.outbound_logistics_cost) || 0;
    const distributionPercent = parseFloat(row.distribution_cost) || 0;
    
    // Total COGS (unchanged)
    const totalCOGS = primary + secondary + manufacturing;
    
    // Reverse calculate: Given Actual Landing Price, find required Gross Margin %
    // Base Cost = Actual Landing × (1 - Distribution %)
    // Base Cost = Primary + Secondary + Mfg + Gross Margin (₹) + Logistics
    // Therefore: Gross Margin (₹) = Base Cost - Primary - Secondary - Mfg - Logistics
    // Gross Margin % = (Gross Margin ₹ / Total COGS) × 100
    
    let baseCost;
    if (distributionPercent >= 100) {
      baseCost = 0;
    } else if (distributionPercent > 0) {
      baseCost = actualLanding * (1 - distributionPercent / 100);
    } else {
      baseCost = actualLanding;
    }
    
    const grossMarginRupees = baseCost - primary - secondary - manufacturing - logistics;
    
    // Calculate new gross margin percentage
    let newGrossMarginPercent = 0;
    if (totalCOGS > 0) {
      newGrossMarginPercent = (grossMarginRupees / totalCOGS) * 100;
    }
    
    // Round to 2 decimal places
    newGrossMarginPercent = Math.round(newGrossMarginPercent * 100) / 100;
    
    // Update the gross margin field using the existing updateField function
    // This will trigger all other recalculations
    updateField(index, 'gross_margin', newGrossMarginPercent.toString());
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      
      for (const row of cogsData) {
        await axios.put(
          `${API}/cogs/${row.id}`,
          {
            primary_packaging_cost: parseFloat(row.primary_packaging_cost) || 0,
            secondary_packaging_cost: parseFloat(row.secondary_packaging_cost) || 0,
            manufacturing_variable_cost: parseFloat(row.manufacturing_variable_cost) || 0,
            gross_margin: parseFloat(row.gross_margin) || 0,
            outbound_logistics_cost: parseFloat(row.outbound_logistics_cost) || 0,
            distribution_cost: parseFloat(row.distribution_cost) || 0
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            withCredentials: true
          }
        );
      }
      
      // Update original gross margins to current values after save
      const newOriginalMargins = {};
      cogsData.forEach(row => {
        if (row.id) {
          newOriginalMargins[row.id] = parseFloat(row.gross_margin) || 0;
        }
      });
      setOriginalGrossMargins(newOriginalMargins);
      
      // Clear actual landing prices since values are now saved
      setActualLandingPrices({});
      
      toast.success('All changes saved!');
      setHasChanges(false);
      loadCOGSData(); // Reload to get updated calculations
    } catch (error) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Copy all input field values to all other cities
  const copyToAllCities = async () => {
    setCopying(true);
    try {
      const token = localStorage.getItem('token');
      
      // Prepare all input field data from current city's COGS data
      const costData = cogsData.map(row => ({
        sku_name: row.sku_name,
        primary_packaging_cost: parseFloat(row.primary_packaging_cost) || 0,
        secondary_packaging_cost: parseFloat(row.secondary_packaging_cost) || 0,
        manufacturing_variable_cost: parseFloat(row.manufacturing_variable_cost) || 0,
        gross_margin: parseFloat(row.gross_margin) || 0,
        outbound_logistics_cost: parseFloat(row.outbound_logistics_cost) || 0,
        distribution_cost: parseFloat(row.distribution_cost) || 0
      }));
      
      const response = await axios.post(
        `${API}/cogs/copy-costs-to-all-cities`,
        {
          source_city: selectedCity,
          cost_data: costData
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      
      toast.success(`Values copied to ${response.data.cities_updated} cities!`);
      setShowCopyDialog(false);
    } catch (error) {
      toast.error('Failed to copy values: ' + (error.response?.data?.detail || error.message));
    } finally {
      setCopying(false);
    }
  };

  const exportToExcel = () => {
    // Headers depend on user role
    const headers = canSeeCostDetails
      ? ['SKU', 'Primary Packaging', 'Secondary Packaging', 'Manufacturing Cost', 'Gross Margin %', 'Outbound Logistics', 'Distribution Cost %', 'Total COGS', 'Gross Margin ₹', 'Ex-Factory Price', 'Base Cost', 'Min Landing Price', 'Actual Landing Price', 'Last Edited By']
      : ['SKU', 'Gross Margin %', 'Outbound Logistics', 'Distribution Cost %', 'Total COGS', 'Gross Margin ₹', 'Ex-Factory Price', 'Base Cost', 'Min Landing Price', 'Actual Landing Price', 'Last Edited By'];
    
    const rows = cogsData.map(row => {
      const baseRow = [
        row.sku_name,
        ...(canSeeCostDetails ? [
          row.primary_packaging_cost,
          row.secondary_packaging_cost,
          row.manufacturing_variable_cost,
        ] : []),
        row.gross_margin,
        row.outbound_logistics_cost,
        row.distribution_cost || 0,
        row.total_cogs,
        ((row.total_cogs || 0) * (row.gross_margin || 0) / 100).toFixed(2),
        row.ex_factory_price,
        row.base_cost,
        row.minimum_landing_price,
        actualLandingPrices[row.id] || '',
        row.editor_name || '-'
      ];
      return baseRow;
    });

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `COGS-${selectedCity}.csv`;
    a.click();
    toast.success('Downloaded!');
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - Responsive */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-light mb-1 sm:mb-2">COGS Calculator</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Calculate cost and minimum landing price</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {canDelete && selectedRows.length > 0 && (
            <Button 
              onClick={() => setShowDeleteDialog(true)} 
              variant="destructive" 
              className="rounded-full text-xs sm:text-sm"
              size="sm"
              data-testid="cogs-delete-selected-btn"
            >
              <Trash2 className="h-4 w-4 mr-1 sm:mr-2" />
              Delete ({selectedRows.length})
            </Button>
          )}
          <Button
            onClick={saveAll}
            disabled={!hasChanges || saving}
            className="rounded-full text-xs sm:text-sm"
            size="sm"
          >
            <Save className="h-4 w-4 mr-1 sm:mr-2" />
            {saving ? 'Saving...' : hasChanges ? 'Save All' : 'Saved'}
          </Button>
          {canSeeCostDetails && (
            <Button 
              onClick={() => setShowCopyDialog(true)} 
              variant="outline" 
              className="rounded-full text-xs sm:text-sm hidden sm:flex"
              size="sm"
              disabled={!selectedCity || cogsData.length === 0}
            >
              <Copy className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden md:inline">Copy Costs to All Cities</span>
              <span className="md:hidden">Copy All</span>
            </Button>
          )}
          <Button onClick={exportToExcel} variant="outline" className="rounded-full text-xs sm:text-sm" size="sm">
            <Download className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Download</span>
          </Button>
        </div>
      </div>

      <Card className="p-4 sm:p-6 border rounded-xl sm:rounded-2xl">
        <div className="mb-4 sm:mb-6">
          <Label className="text-sm sm:text-base">Select City</Label>
          <select
            value={selectedCity}
            onChange={e => setSelectedCity(e.target.value)}
            className="w-full sm:max-w-xs h-10 sm:h-12 px-3 sm:px-4 rounded-lg sm:rounded-xl border bg-background text-sm sm:text-base"
          >
            <option value="">Choose a city...</option>
            {cities.map(city => (
              <option key={city.id} value={city.name}>{city.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="block lg:hidden space-y-4">
              {cogsData.map((row, index) => (
                <div 
                  key={row.id} 
                  className={`border rounded-xl p-4 space-y-3 ${selectedRows.includes(row.id) ? 'bg-red-50 border-red-200' : 'bg-background'}`}
                >
                  {/* SKU Header */}
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-3">
                      {canDelete && (
                        <Checkbox
                          checked={selectedRows.includes(row.id)}
                          onCheckedChange={() => toggleRowSelection(row.id)}
                        />
                      )}
                      <span className="font-semibold text-sm">{row.sku_name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.editor_name && <span>{row.editor_name}</span>}
                    </div>
                  </div>

                  {/* Cost Inputs - Only for authorized users */}
                  {canSeeCostDetails && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Primary Pkg</Label>
                        <Input
                          type="text"
                          value={row.primary_packaging_cost || ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                              updateField(index, 'primary_packaging_cost', val);
                            }
                          }}
                          className="h-9 text-right text-sm"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Secondary Pkg</Label>
                        <Input
                          type="text"
                          value={row.secondary_packaging_cost || ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                              updateField(index, 'secondary_packaging_cost', val);
                            }
                          }}
                          className="h-9 text-right text-sm"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Mfg Cost</Label>
                        <Input
                          type="text"
                          value={row.manufacturing_variable_cost || ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                              updateField(index, 'manufacturing_variable_cost', val);
                            }
                          }}
                          className="h-9 text-right text-sm"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )}

                  {/* Margin & Logistics */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Gross Margin %</Label>
                      <Input
                        type="text"
                        value={row.gross_margin || ''}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            updateField(index, 'gross_margin', val);
                          }
                        }}
                        className="h-9 text-right text-sm"
                        placeholder="%"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Logistics ₹</Label>
                      <Input
                        type="text"
                        value={row.outbound_logistics_cost || ''}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            updateField(index, 'outbound_logistics_cost', val);
                          }
                        }}
                        className="h-9 text-right text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Dist. Cost %</Label>
                      <Input
                        type="text"
                        value={row.distribution_cost || ''}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            updateField(index, 'distribution_cost', val);
                          }
                        }}
                        className="h-9 text-right text-sm bg-amber-50"
                        placeholder="%"
                      />
                    </div>
                  </div>

                  {/* Calculated Values */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                    <div className="bg-green-50 rounded-lg p-2">
                      <div className="text-xs text-muted-foreground">Total COGS</div>
                      <div className="font-bold text-primary">₹{row.total_cogs?.toFixed(2)}</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2">
                      <div className="text-xs text-muted-foreground">Ex-Factory</div>
                      <div className="font-bold text-primary">₹{row.ex_factory_price?.toFixed(2)}</div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-2">
                      <div className="text-xs text-muted-foreground">Base Cost</div>
                      <div className="font-semibold text-blue-600">₹{row.base_cost?.toFixed(2) || '0.00'}</div>
                    </div>
                    <div className="bg-emerald-100 rounded-lg p-2">
                      <div className="text-xs text-muted-foreground">Min Landing</div>
                      <div className="font-bold text-emerald-700">₹{row.minimum_landing_price?.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Actual Landing Price */}
                  <div className="pt-2 border-t">
                    <Label className="text-xs text-muted-foreground">Actual Landing Price (What-If)</Label>
                    <Input
                      type="text"
                      value={actualLandingPrices[row.id] || ''}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                          updateActualLandingPrice(index, val);
                        }
                      }}
                      className="h-10 text-right bg-purple-50"
                      placeholder="Enter price to calculate margin"
                      data-testid={`actual-landing-price-mobile-${index}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr className="border-b">
                    {canDelete && (
                      <th className="p-3 font-semibold bg-secondary w-10">
                        <Checkbox
                          checked={selectedRows.length === cogsData.length && cogsData.length > 0}
                          onCheckedChange={toggleAllSelection}
                          data-testid="cogs-select-all-checkbox"
                        />
                      </th>
                    )}
                    <th className="text-left p-3 font-semibold sticky left-0 bg-secondary">SKU</th>
                    {canSeeCostDetails && (
                      <>
                        <th className="text-right p-3 font-semibold bg-primary/5">Primary Pkg (₹)</th>
                        <th className="text-right p-3 font-semibold bg-primary/5">Secondary Pkg (₹)</th>
                        <th className="text-right p-3 font-semibold bg-primary/5">Mfg Cost (₹)</th>
                      </>
                    )}
                    <th className="text-right p-3 font-semibold bg-primary/5">Gross Margin (%)</th>
                    <th className="text-right p-3 font-semibold bg-primary/5">Logistics (₹)</th>
                    <th className="text-right p-3 font-semibold bg-amber-50">Dist. Cost (%)</th>
                    <th className="text-right p-3 font-semibold bg-green-50">Total COGS (₹)</th>
                    <th className="text-right p-3 font-semibold bg-green-50">Gross Margin (₹)</th>
                    <th className="text-right p-3 font-semibold bg-green-50">Ex-Factory (₹)</th>
                    <th className="text-right p-3 font-semibold bg-blue-50">Base Cost (₹)</th>
                    <th className="text-right p-3 font-semibold bg-emerald-100">Min Landing (₹)</th>
                    <th className="text-right p-3 font-semibold bg-purple-100">Actual Landing (₹)</th>
                    <th className="text-left p-3 font-semibold">Last Edited</th>
                  </tr>
                </thead>
                <tbody>
                  {cogsData.map((row, index) => (
                    <tr key={row.id} className={`border-b hover:bg-secondary/20 ${selectedRows.includes(row.id) ? 'bg-red-50' : ''}`}>
                      {canDelete && (
                        <td className="p-3">
                          <Checkbox
                            checked={selectedRows.includes(row.id)}
                            onCheckedChange={() => toggleRowSelection(row.id)}
                            data-testid={`cogs-row-checkbox-${index}`}
                          />
                        </td>
                      )}
                      <td className="p-3 font-medium sticky left-0 bg-background">{row.sku_name}</td>
                      {canSeeCostDetails && (
                        <>
                          <td className="p-2">
                            <input
                              type="text"
                              value={row.primary_packaging_cost || ''}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                                  updateField(index, 'primary_packaging_cost', val);
                                }
                              }}
                              className="w-24 h-9 text-right px-2 border rounded bg-background"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={row.secondary_packaging_cost || ''}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                                  updateField(index, 'secondary_packaging_cost', val);
                                }
                              }}
                              className="w-24 h-9 text-right px-2 border rounded bg-background"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={row.manufacturing_variable_cost || ''}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                                  updateField(index, 'manufacturing_variable_cost', val);
                                }
                              }}
                              className="w-24 h-9 text-right px-2 border rounded bg-background"
                              placeholder="0.00"
                            />
                          </td>
                        </>
                      )}
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.gross_margin || ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                              updateField(index, 'gross_margin', val);
                            }
                          }}
                          className="w-24 h-9 text-right px-2 border rounded bg-background"
                          placeholder="%"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.outbound_logistics_cost || ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                              updateField(index, 'outbound_logistics_cost', val);
                            }
                          }}
                          className="w-24 h-9 text-right px-2 border rounded bg-background"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="p-2 bg-amber-50/50">
                        <input
                          type="text"
                          value={row.distribution_cost || ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                              updateField(index, 'distribution_cost', val);
                            }
                          }}
                          className="w-20 h-9 text-right px-2 border rounded bg-background"
                          placeholder="%"
                        />
                      </td>
                      <td className="p-3 text-right font-bold text-primary bg-green-50">{row.total_cogs?.toFixed(2)}</td>
                      <td className="p-3 text-right font-bold text-primary bg-green-50">
                        {((row.total_cogs || 0) * (row.gross_margin || 0) / 100).toFixed(2)}
                      </td>
                      <td className="p-3 text-right font-bold text-primary bg-green-50">{row.ex_factory_price?.toFixed(2)}</td>
                      <td className="p-3 text-right font-semibold text-blue-600 bg-blue-50">{row.base_cost?.toFixed(2) || '0.00'}</td>
                      <td className="p-3 text-right font-bold text-emerald-700 bg-emerald-100">{row.minimum_landing_price?.toFixed(2)}</td>
                      <td className="p-2 bg-purple-50/50">
                        <input
                          type="text"
                          value={actualLandingPrices[row.id] || ''}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                              updateActualLandingPrice(index, val);
                            }
                          }}
                          className="w-24 h-9 text-right px-2 border rounded bg-background"
                          placeholder="Enter price"
                          data-testid={`actual-landing-price-${index}`}
                        />
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {row.editor_name || '-'}
                        {row.last_edited_at && (
                          <div className="text-xs">{new Date(row.last_edited_at).toLocaleDateString()}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Formulas Card - Responsive */}
      <Card className="p-4 sm:p-6 bg-primary/5 border-primary/20 rounded-xl sm:rounded-2xl">
        <h3 className="font-semibold mb-2 sm:mb-3 text-sm sm:text-base">Formulas:</h3>
        <ul className="text-xs sm:text-sm text-muted-foreground space-y-1">
          {canSeeCostDetails && (
            <>
              <li>• <strong>Total COGS</strong> = Primary Pkg + Secondary Pkg + Mfg Cost</li>
              <li>• <strong>Gross Margin (₹)</strong> = Total COGS × Gross Margin %</li>
              <li>• <strong>Ex-Factory Price</strong> = Total COGS + Gross Margin (₹)</li>
              <li>• <strong>Base Cost</strong> = Total COGS + Gross Margin (₹) + Logistics</li>
            </>
          )}
          <li>• <strong>Min Landing Price</strong> = Base Cost ÷ (1 - Dist. Cost %)</li>
          <li className="pt-2 mt-2 border-t border-primary/20">
            • <strong>Actual Landing</strong>: Enter a price to reverse-calculate Gross Margin %
          </li>
        </ul>
      </Card>

      {/* Copy to All Cities Dialog */}
      <Dialog open={showCopyDialog} onOpenChange={setShowCopyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy Values to All Cities</DialogTitle>
            <DialogDescription>
              This will copy the following values from <strong>{selectedCity}</strong> to all other cities:
              <ul className="mt-3 space-y-1 text-sm">
                <li>• Primary Packaging Cost (₹)</li>
                <li>• Secondary Packaging Cost (₹)</li>
                <li>• Manufacturing Variable Cost (₹)</li>
                <li>• Gross Margin (%)</li>
                <li>• Outbound Logistics Cost (₹)</li>
                <li>• Distribution Cost (%)</li>
              </ul>
              <p className="mt-3 text-amber-600 dark:text-amber-400 font-medium">
                Note: This will overwrite existing values in other cities for all SKUs.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCopyDialog(false)}>
              Cancel
            </Button>
            <Button onClick={copyToAllCities} disabled={copying}>
              {copying ? 'Copying...' : 'Copy to All Cities'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete COGS Entries</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedRows.length} COGS {selectedRows.length === 1 ? 'entry' : 'entries'}?
              <br /><br />
              This action cannot be undone. The following SKUs will be deleted:
              <ul className="mt-2 max-h-40 overflow-y-auto text-sm">
                {cogsData.filter(row => selectedRows.includes(row.id)).map(row => (
                  <li key={row.id} className="text-red-600">• {row.sku_name}</li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteSelectedCOGS} 
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
              data-testid="cogs-confirm-delete-btn"
            >
              {deleting ? 'Deleting...' : `Delete ${selectedRows.length} ${selectedRows.length === 1 ? 'Entry' : 'Entries'}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
