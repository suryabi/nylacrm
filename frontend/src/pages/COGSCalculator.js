import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Download, Save } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function COGSCalculator() {
  const [selectedCity, setSelectedCity] = React.useState('Bengaluru');
  const [cogsData, setCogsData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

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

  const updateField = async (skuId, field, value) => {
    const numValue = parseFloat(value) || 0;
    
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API}/cogs/${skuId}`,
        { [field]: numValue },
        {
          headers: { Authorization: `Bearer ${token}` },
          withCredentials: true
        }
      );
      
      // Reload to get updated calculations
      loadCOGSData();
      toast.success('Saved');
    } catch (error) {
      toast.error('Failed to save');
    }
  };

  const exportToExcel = () => {
    const headers = ['SKU', 'Primary Packaging', 'Secondary Packaging', 'Manufacturing Cost', 'Gross Margin', 'Outbound Logistics', 'Total COGS', 'Ex-Factory Price', 'Min Landing Price', 'Last Edited By'];
    const rows = cogsData.map(row => [
      row.sku_name,
      row.primary_packaging_cost,
      row.secondary_packaging_cost,
      row.manufacturing_variable_cost,
      row.gross_margin,
      row.outbound_logistics_cost,
      row.total_cogs,
      row.ex_factory_price,
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
        <Button onClick={exportToExcel} className="rounded-full">
          <Download className="h-4 w-4 mr-2" />Download Excel
        </Button>
      </div>

      <Card className="p-6 border rounded-2xl">
        <div className="mb-6">
          <Label>Select City</Label>
          <select
            value={selectedCity}
            onChange={e => setSelectedCity(e.target.value)}
            className="w-full max-w-xs h-12 px-4 rounded-xl border bg-background"
          >
            <option value="Bengaluru">Bengaluru</option>
            <option value="Chennai">Chennai</option>
            <option value="Hyderabad">Hyderabad</option>
            <option value="Mumbai">Mumbai</option>
            <option value="Pune">Pune</option>
            <option value="Delhi">Delhi</option>
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
                  <th className="text-right p-3 font-semibold bg-primary/5">Primary Pkg (₹)</th>
                  <th className="text-right p-3 font-semibold bg-primary/5">Secondary Pkg (₹)</th>
                  <th className="text-right p-3 font-semibold bg-primary/5">Mfg Cost (₹)</th>
                  <th className="text-right p-3 font-semibold bg-primary/5">Gross Margin (%)</th>
                  <th className="text-right p-3 font-semibold bg-primary/5">Logistics (₹)</th>
                  <th className="text-right p-3 font-semibold bg-green-50">Total COGS (₹)</th>
                  <th className="text-right p-3 font-semibold bg-green-50">Gross Margin (₹)</th>
                  <th className="text-right p-3 font-semibold bg-green-50">Ex-Factory (₹)</th>
                  <th className="text-right p-3 font-semibold bg-green-50">Min Landing (₹)</th>
                  <th className="text-left p-3 font-semibold">Last Edited</th>
                </tr>
              </thead>
              <tbody>
                {cogsData.map(row => (
                  <tr key={row.id} className="border-b hover:bg-secondary/20">
                    <td className="p-3 font-medium sticky left-0 bg-background">{row.sku_name}</td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={row.primary_packaging_cost || ''}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            updateField(row.id, 'primary_packaging_cost', val);
                          }
                        }}
                        className="w-24 h-9 text-right px-2 border rounded"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={row.secondary_packaging_cost || ''}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            updateField(row.id, 'secondary_packaging_cost', val);
                          }
                        }}
                        className="w-24 h-9 text-right px-2 border rounded"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={row.manufacturing_variable_cost || ''}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            updateField(row.id, 'manufacturing_variable_cost', val);
                          }
                        }}
                        className="w-24 h-9 text-right px-2 border rounded"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={row.gross_margin || ''}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            updateField(row.id, 'gross_margin', val);
                          }
                        }}
                        className="w-24 h-9 text-right px-2 border rounded"
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
                            updateField(row.id, 'outbound_logistics_cost', val);
                          }
                        }}
                        className="w-24 h-9 text-right px-2 border rounded"
                      />
                    </td>
                    <td className="p-3 text-right font-bold text-primary bg-green-50">{row.total_cogs?.toFixed(2)}</td>
                    <td className="p-3 text-right font-bold text-primary bg-green-50">
                      {((row.total_cogs || 0) * (row.gross_margin || 0) / 100).toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-bold text-primary bg-green-50">{row.ex_factory_price?.toFixed(2)}</td>
                    <td className="p-3 text-right font-bold text-green-600 bg-green-50">{row.minimum_landing_price?.toFixed(2)}</td>
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
          <li>• <strong>Minimum Landing Price</strong> = Ex-Factory Price + Outbound Logistics</li>
        </ul>
      </Card>
    </div>
  );
}
