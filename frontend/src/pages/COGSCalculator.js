import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Download, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMasterLocations } from '../hooks/useMasterLocations';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function COGSCalculator() {
  const { user } = useAuth();
  const { cities } = useMasterLocations();
  
  // Check if user can see sensitive cost columns (CEO, Director only)
  const canSeeCostDetails = ['ceo', 'director', 'CEO', 'Director'].includes(user?.role);
  
  const [selectedCity, setSelectedCity] = React.useState('');
  const [cogsData, setCogsData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);
  
  // Set default city when cities load
  React.useEffect(() => {
    if (cities.length > 0 && !selectedCity) {
      setSelectedCity(cities[0].name);
    }
  }, [cities]);

  React.useEffect(() => {
    if (selectedCity) {
      loadCOGSData();
    }
  }, [selectedCity]);

  const loadCOGSData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/cogs/${selectedCity}`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setCogsData(res.data.cogs_data || []);
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
      
      toast.success('All changes saved!');
      setHasChanges(false);
      loadCOGSData(); // Reload to get updated calculations
    } catch (error) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const exportToExcel = () => {
    const headers = ['SKU', 'Primary Packaging', 'Secondary Packaging', 'Manufacturing Cost', 'Gross Margin %', 'Outbound Logistics', 'Distribution Cost %', 'Total COGS', 'Gross Margin ₹', 'Ex-Factory Price', 'Base Cost', 'Min Landing Price', 'Last Edited By'];
    const rows = cogsData.map(row => [
      row.sku_name,
      row.primary_packaging_cost,
      row.secondary_packaging_cost,
      row.manufacturing_variable_cost,
      row.gross_margin,
      row.outbound_logistics_cost,
      row.distribution_cost || 0,
      row.total_cogs,
      ((row.total_cogs || 0) * (row.gross_margin || 0) / 100).toFixed(2),
      row.ex_factory_price,
      row.base_cost,
      row.minimum_landing_price,
      row.editor_name || '-'
    ]);

    const csv = [headers, ...rows].map(r => r.join(',')).join('\\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `COGS-${selectedCity}.csv`;
    a.click();
    toast.success('Downloaded!');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h1 className="text-4xl font-light mb-2">COGS Calculator</h1>
          <p className="text-muted-foreground">Calculate cost and minimum landing price</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={saveAll}
            disabled={!hasChanges || saving}
            className="rounded-full"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : hasChanges ? 'Save All Changes' : 'All Saved'}
          </Button>
          <Button onClick={exportToExcel} variant="outline" className="rounded-full">
            <Download className="h-4 w-4 mr-2" />Download Excel
          </Button>
        </div>
      </div>

      <Card className="p-6 border rounded-2xl">
        <div className="mb-6">
          <Label>Select City</Label>
          <select
            value={selectedCity}
            onChange={e => setSelectedCity(e.target.value)}
            className="w-full max-w-xs h-12 px-4 rounded-xl border bg-background"
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary">
                <tr className="border-b">
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
                  <th className="text-left p-3 font-semibold">Last Edited</th>
                </tr>
              </thead>
              <tbody>
                {cogsData.map((row, index) => (
                  <tr key={row.id} className="border-b hover:bg-secondary/20">
                    <td className="p-3 font-medium sticky left-0 bg-background">{row.sku_name}</td>
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
        )}
      </Card>

      <Card className="p-6 bg-primary/5 border-primary/20 rounded-2xl">
        <h3 className="font-semibold mb-3">Formulas:</h3>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• <strong>Total COGS</strong> = Primary Packaging + Secondary Packaging + Manufacturing Cost</li>
          <li>• <strong>Gross Margin (₹)</strong> = Total COGS × Gross Margin %</li>
          <li>• <strong>Ex-Factory Price</strong> = Total COGS + Gross Margin (₹)</li>
          <li>• <strong>Base Cost</strong> = Primary Pkg + Secondary Pkg + Mfg Cost + Gross Margin (₹) + Logistics</li>
          <li>• <strong>Minimum Landing Price</strong> = Base Cost ÷ (1 - Distribution Cost %)</li>
          <li className="text-xs text-muted-foreground/80 mt-2 pl-4">
            → After paying Distribution Cost %, the remaining amount equals Base Cost
          </li>
        </ul>
      </Card>
    </div>
  );
}
