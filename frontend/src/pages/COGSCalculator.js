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
  
  // Active COGS components (from master) — drives column visibility & total formula
  // Stored as full list of { key, label, unit, sort_order } so we can render custom columns too.
  const [activeComponents, setActiveComponents] = React.useState(null); // null = not loaded

  React.useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem('token');
    axios.get(`${API}/master/cogs-components?is_active=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!mounted) return;
        setActiveComponents(res.data.components || []);
      })
      .catch(() => {
        // Fail-open: master legacy 3 columns (system calculator columns are added separately).
        if (!mounted) return;
        setActiveComponents([
          { key: 'primary_packaging_cost', label: 'Primary Packaging Cost', unit: 'rupee', sort_order: 1, is_system: true },
          { key: 'secondary_packaging_cost', label: 'Secondary Packaging Cost', unit: 'rupee', sort_order: 2, is_system: true },
          { key: 'manufacturing_variable_cost', label: 'Manufacturing Variable Cost', unit: 'rupee', sort_order: 3, is_system: true },
        ]);
      });
    return () => { mounted = false; };
  }, []);

  const LEGACY_KEYS = React.useMemo(
    () => new Set(['primary_packaging_cost','secondary_packaging_cost','manufacturing_variable_cost','outbound_logistics_cost','distribution_cost','gross_margin']),
    []
  );

  // System columns owned by the calculator itself (NOT part of master cogs_components).
  // Always rendered, in this fixed order, after the dynamic master columns.
  const SYSTEM_CALC_KEYS = React.useMemo(
    () => new Set(['outbound_logistics_cost', 'distribution_cost', 'gross_margin']),
    []
  );
  const SYSTEM_CALC_COLUMNS = React.useMemo(() => ([
    { key: 'outbound_logistics_cost', label: 'Outbound Logistics Cost', unit: 'rupee' },
    { key: 'distribution_cost',       label: 'Distribution Cost',       unit: 'percent' },
    { key: 'gross_margin',            label: 'Gross Margin',            unit: 'percent' },
  ]), []);

  const activeKeys = React.useMemo(() => {
    if (!activeComponents) return null;
    return new Set(activeComponents.map((c) => c.key));
  }, [activeComponents]);

  // ALL active master components ordered by sort_order — does NOT include system columns.
  const orderedComponents = React.useMemo(
    () => (activeComponents || [])
      .filter((c) => !SYSTEM_CALC_KEYS.has(c.key))
      .slice()
      .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99)),
    [activeComponents, SYSTEM_CALC_KEYS]
  );

  // Read/write helpers: legacy components live on row top-level fields;
  // custom components live in row.custom_components[key].
  const isLegacy = React.useCallback((key) => LEGACY_KEYS.has(key), [LEGACY_KEYS]);
  const readField = React.useCallback(
    (row, key) => (isLegacy(key) ? (row?.[key] ?? '') : (row?.custom_components?.[key] ?? '')),
    [isLegacy]
  );
  const writeField = React.useCallback(
    (index, key, val) => (isLegacy(key) ? updateField(index, key, val) : updateCustomField(index, key, val)),
    [isLegacy] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Custom (non-legacy) active components — kept for backwards-compat with totalCOGS calc.
  const customRupeeComponents = React.useMemo(
    () => (activeComponents || []).filter((c) => c.unit === 'rupee' && !LEGACY_KEYS.has(c.key)).sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99)),
    [activeComponents, LEGACY_KEYS]
  );
  const customPercentComponents = React.useMemo(
    () => (activeComponents || []).filter((c) => c.unit === 'percent' && !LEGACY_KEYS.has(c.key)).sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99)),
    [activeComponents, LEGACY_KEYS]
  );

  // Read/write helpers for custom_components map on a row
  const getCustomVal = (row, key) => {
    const v = row?.custom_components?.[key];
    return (v === undefined || v === null) ? '' : v;
  };

  const isShown = React.useCallback(
    (key) => SYSTEM_CALC_KEYS.has(key) || activeKeys === null || activeKeys.has(key),
    [activeKeys, SYSTEM_CALC_KEYS]
  );

  // Recompute derived values from raw row inputs, respecting active master config.
  const computeDerived = React.useCallback((row) => {
    if (!row) return { totalCOGS: 0, grossMarginRupees: 0, exFactory: 0, baseCost: 0, landingPrice: 0 };
    const primary       = parseFloat(row.primary_packaging_cost) || 0;
    const secondary     = parseFloat(row.secondary_packaging_cost) || 0;
    const manufacturing = parseFloat(row.manufacturing_variable_cost) || 0;
    const logistics     = parseFloat(row.outbound_logistics_cost) || 0;
    const marginPct     = parseFloat(row.gross_margin) || 0;
    const distPct       = parseFloat(row.distribution_cost) || 0;

    let totalCOGS =
      (isShown('primary_packaging_cost')     ? primary       : 0) +
      (isShown('secondary_packaging_cost')   ? secondary     : 0) +
      (isShown('manufacturing_variable_cost')? manufacturing : 0) +
      (isShown('outbound_logistics_cost')    ? logistics     : 0);

    // Add custom (non-legacy) ₹ components from row.custom_components
    customRupeeComponents.forEach((c) => {
      const v = parseFloat(row.custom_components?.[c.key]);
      if (!Number.isNaN(v)) totalCOGS += v;
    });

    const effMargin = isShown('gross_margin') ? marginPct : 0;
    const grossMarginRupees = totalCOGS * (effMargin / 100);
    const exFactory = totalCOGS + grossMarginRupees;
    const baseCost  = totalCOGS + grossMarginRupees;

    const effDist = isShown('distribution_cost') ? distPct : 0;
    let landingPrice;
    if (effDist >= 100) landingPrice = 0;
    else if (effDist > 0) landingPrice = baseCost / (1 - effDist / 100);
    else landingPrice = baseCost;

    return { totalCOGS, grossMarginRupees, exFactory, baseCost, landingPrice };
  }, [isShown, customRupeeComponents]);

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

    // Total COGS = sum of all active ₹ columns (master-driven)
    let totalCOGS =
      (isShown('primary_packaging_cost') ? primary : 0) +
      (isShown('secondary_packaging_cost') ? secondary : 0) +
      (isShown('manufacturing_variable_cost') ? manufacturing : 0) +
      (isShown('outbound_logistics_cost') ? logistics : 0);
    customRupeeComponents.forEach((c) => {
      const v = parseFloat(row.custom_components?.[c.key]);
      if (!Number.isNaN(v)) totalCOGS += v;
    });

    // Gross Margin in rupees (0 if % column disabled)
    const effMargin = isShown('gross_margin') ? marginPercent : 0;
    const grossMarginRupees = totalCOGS * (effMargin / 100);

    // Ex-Factory Price
    const exFactory = totalCOGS + grossMarginRupees;

    // Base Cost = Total COGS + Gross Margin (₹). Logistics is already inside COGS.
    const baseCost = totalCOGS + grossMarginRupees;

    // Minimum Landing Price: Min Landing = Base Cost / (1 − Distribution %)
    const effDistribution = isShown('distribution_cost') ? distributionPercent : 0;
    let landingPrice;
    if (effDistribution >= 100) {
      landingPrice = 0;
    } else if (effDistribution > 0) {
      landingPrice = baseCost / (1 - effDistribution / 100);
    } else {
      landingPrice = baseCost;
    }
    
    // Update computed fields
    newData[index].total_cogs = totalCOGS;
    newData[index].ex_factory_price = exFactory;
    newData[index].minimum_landing_price = landingPrice;
    newData[index].base_cost = baseCost;
    
    setCogsData(newData);
    setHasChanges(true);
  };

  // Update a custom (non-legacy) component value — stored in row.custom_components map
  const updateCustomField = (index, key, value) => {
    const newData = [...cogsData];
    const row = { ...newData[index] };
    row.custom_components = { ...(row.custom_components || {}), [key]: value };
    newData[index] = row;

    // Trigger total recompute
    const d = computeDerived(row);
    newData[index].total_cogs = d.totalCOGS;
    newData[index].ex_factory_price = d.exFactory;
    newData[index].base_cost = d.baseCost;
    newData[index].minimum_landing_price = d.landingPrice;

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

    // Total COGS = sum of all active ₹ columns (master-driven)
    let totalCOGS =
      (isShown('primary_packaging_cost') ? primary : 0) +
      (isShown('secondary_packaging_cost') ? secondary : 0) +
      (isShown('manufacturing_variable_cost') ? manufacturing : 0) +
      (isShown('outbound_logistics_cost') ? logistics : 0);
    customRupeeComponents.forEach((c) => {
      const v = parseFloat(row.custom_components?.[c.key]);
      if (!Number.isNaN(v)) totalCOGS += v;
    });

    // Reverse calculate: Given Actual Landing Price, find required Gross Margin %
    // Base Cost = Actual Landing × (1 - Distribution %)
    // Base Cost = Total COGS + Gross Margin (₹)
    // → Gross Margin (₹) = Base Cost - Total COGS
    const effDistribution = isShown('distribution_cost') ? distributionPercent : 0;
    let baseCost;
    if (effDistribution >= 100) {
      baseCost = 0;
    } else if (effDistribution > 0) {
      baseCost = actualLanding * (1 - effDistribution / 100);
    } else {
      baseCost = actualLanding;
    }

    const grossMarginRupees = baseCost - totalCOGS;

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
        if (!row.id) continue; // Skip rows without an id (shouldn't happen but be defensive)
        // Build custom_components payload (numeric values only)
        const customNumeric = {};
        Object.entries(row.custom_components || {}).forEach(([k, v]) => {
          const num = parseFloat(v);
          if (!Number.isNaN(num)) customNumeric[k] = num;
        });
        await axios.put(
          `${API}/cogs/${row.id}`,
          {
            primary_packaging_cost: parseFloat(row.primary_packaging_cost) || 0,
            secondary_packaging_cost: parseFloat(row.secondary_packaging_cost) || 0,
            manufacturing_variable_cost: parseFloat(row.manufacturing_variable_cost) || 0,
            gross_margin: parseFloat(row.gross_margin) || 0,
            outbound_logistics_cost: parseFloat(row.outbound_logistics_cost) || 0,
            distribution_cost: parseFloat(row.distribution_cost) || 0,
            custom_components: customNumeric,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
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
      const detail = error?.response?.data?.detail
        || error?.response?.data?.message
        || error?.message
        || 'Unknown error';
      toast.error(`Failed to save: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
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

                  {/* All component inputs in master sort_order */}
                  <div className="grid grid-cols-2 gap-2">
                    {orderedComponents.map((c) => {
                      const showCol = (c.unit === 'rupee' && !canSeeCostDetails) ? false : true;
                      if (!showCol) return null;
                      const isDist = c.key === 'distribution_cost';
                      return (
                        <div key={c.key}>
                          <Label className="text-xs text-muted-foreground">{c.label} ({c.unit === 'rupee' ? '₹' : '%'})</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={(() => { const v = readField(row, c.key); return v === '' || v === null || v === undefined ? '' : String(v); })()}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                writeField(index, c.key, val);
                              }
                            }}
                            className={`h-9 text-right text-sm ${isDist ? 'bg-amber-50' : ''}`}
                            placeholder={c.unit === 'percent' ? '%' : '0.00'}
                            data-testid={`mobile-col-${c.key}-${index}`}
                          />
                        </div>
                      );
                    })}
                    {SYSTEM_CALC_COLUMNS.map((c) => {
                      const showCol = (c.unit === 'rupee' && !canSeeCostDetails) ? false : true;
                      if (!showCol) return null;
                      const isDist = c.key === 'distribution_cost';
                      return (
                        <div key={`sys-${c.key}`}>
                          <Label className="text-xs text-muted-foreground">{c.label} ({c.unit === 'rupee' ? '₹' : '%'})</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={row[c.key] === '' || row[c.key] === null || row[c.key] === undefined ? '' : String(row[c.key])}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                updateField(index, c.key, val);
                              }
                            }}
                            className={`h-9 text-right text-sm ${isDist ? 'bg-amber-50' : ''}`}
                            placeholder={c.unit === 'percent' ? '%' : '0.00'}
                            data-testid={`mobile-sys-col-${c.key}-${index}`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Calculated Values */}
                  {(() => { const d = computeDerived(row); return (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                      <div className="bg-green-50 rounded-lg p-2">
                        <div className="text-xs text-muted-foreground">Total COGS</div>
                        <div className="font-bold text-primary">₹{d.totalCOGS.toFixed(2)}</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-2">
                        <div className="text-xs text-muted-foreground">Ex-Factory</div>
                        <div className="font-bold text-primary">₹{d.exFactory.toFixed(2)}</div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-2">
                        <div className="text-xs text-muted-foreground">Base Cost</div>
                        <div className="font-semibold text-blue-600">₹{d.baseCost.toFixed(2)}</div>
                      </div>
                      <div className="bg-emerald-100 rounded-lg p-2">
                        <div className="text-xs text-muted-foreground">Min Landing</div>
                        <div className="font-bold text-emerald-700">₹{d.landingPrice.toFixed(2)}</div>
                      </div>
                    </div>
                  ); })()}

                  {/* Actual Landing Price */}
                  <div className="pt-2 border-t">
                    <Label className="text-xs text-muted-foreground">Actual Landing Price (What-If)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={actualLandingPrices[row.id] === '' || actualLandingPrices[row.id] === null || actualLandingPrices[row.id] === undefined ? '' : String(actualLandingPrices[row.id])}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === '' || /^\d*\.?\d*$/.test(val)) {
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
                    {orderedComponents.map((c) => {
                      const showCol = (c.unit === 'rupee' && !canSeeCostDetails) ? false : true;
                      if (!showCol) return null;
                      const isDist = c.key === 'distribution_cost';
                      return (
                        <th key={c.key} className={`text-right p-3 font-semibold ${isDist ? 'bg-amber-50' : 'bg-primary/5'}`} title={c.label}>
                          {c.label} ({c.unit === 'rupee' ? '₹' : '%'})
                        </th>
                      );
                    })}
                    {/* Fixed system columns (not part of COGS components master) */}
                    {SYSTEM_CALC_COLUMNS.map((c) => {
                      const showCol = (c.unit === 'rupee' && !canSeeCostDetails) ? false : true;
                      if (!showCol) return null;
                      const isDist = c.key === 'distribution_cost';
                      return (
                        <th key={`sys-${c.key}`} className={`text-right p-3 font-semibold ${isDist ? 'bg-amber-50' : 'bg-primary/5'}`} title={c.label}>
                          {c.label} ({c.unit === 'rupee' ? '₹' : '%'})
                        </th>
                      );
                    })}
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
                      {orderedComponents.map((c) => {
                        const showCol = (c.unit === 'rupee' && !canSeeCostDetails) ? false : true;
                        if (!showCol) return null;
                        const isDist = c.key === 'distribution_cost';
                        return (
                          <td key={c.key} className={`p-2 ${isDist ? 'bg-amber-50/50' : ''}`}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={(() => { const v = readField(row, c.key); return v === '' || v === null || v === undefined ? '' : String(v); })()}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                  writeField(index, c.key, val);
                                }
                              }}
                              className="w-24 h-9 text-right px-2 border rounded bg-background"
                              placeholder={c.unit === 'percent' ? '%' : '0.00'}
                              data-testid={`col-${c.key}-${index}`}
                            />
                          </td>
                        );
                      })}
                      {/* Fixed system column inputs */}
                      {SYSTEM_CALC_COLUMNS.map((c) => {
                        const showCol = (c.unit === 'rupee' && !canSeeCostDetails) ? false : true;
                        if (!showCol) return null;
                        const isDist = c.key === 'distribution_cost';
                        return (
                          <td key={`sys-${c.key}`} className={`p-2 ${isDist ? 'bg-amber-50/50' : ''}`}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row[c.key] === '' || row[c.key] === null || row[c.key] === undefined ? '' : String(row[c.key])}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                  updateField(index, c.key, val);
                                }
                              }}
                              className="w-24 h-9 text-right px-2 border rounded bg-background"
                              placeholder={c.unit === 'percent' ? '%' : '0.00'}
                              data-testid={`sys-col-${c.key}-${index}`}
                            />
                          </td>
                        );
                      })}
                      {(() => { const d = computeDerived(row); return (
                        <>
                          <td className="p-3 text-right font-bold text-primary bg-green-50">{d.totalCOGS.toFixed(2)}</td>
                          <td className="p-3 text-right font-bold text-primary bg-green-50">{d.grossMarginRupees.toFixed(2)}</td>
                          <td className="p-3 text-right font-bold text-primary bg-green-50">{d.exFactory.toFixed(2)}</td>
                          <td className="p-3 text-right font-semibold text-blue-600 bg-blue-50">{d.baseCost.toFixed(2)}</td>
                          <td className="p-3 text-right font-bold text-emerald-700 bg-emerald-100">{d.landingPrice.toFixed(2)}</td>
                        </>
                      ); })()}
                      <td className="p-2 bg-purple-50/50">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={actualLandingPrices[row.id] === '' || actualLandingPrices[row.id] === null || actualLandingPrices[row.id] === undefined ? '' : String(actualLandingPrices[row.id])}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d*$/.test(val)) {
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
              <li>• <strong>Total COGS</strong> = sum of all <em>active</em> ₹ components (configurable in <span className="font-mono text-[11px]">Master → COGS Components</span>)</li>
              <li>• <strong>Gross Margin (₹)</strong> = Total COGS × Gross Margin %</li>
              <li>• <strong>Ex-Factory Price</strong> = Total COGS + Gross Margin (₹)</li>
              <li>• <strong>Base Cost</strong> = Total COGS + Gross Margin (₹)</li>
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
