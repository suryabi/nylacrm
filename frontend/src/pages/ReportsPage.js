import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { FileText, Download } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const REPORTS = [
  { value: 'target-sku', label: 'Target SKU Allocation Report' },
  { value: 'target-resource', label: 'Target Resource Allocation Report' },
  { value: 'city-performance', label: 'City Performance Report (Coming Soon)' }
];

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = React.useState('target-sku');
  const [reportData, setReportData] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [sortField, setSortField] = React.useState('target_name');
  const [sortDirection, setSortDirection] = React.useState('asc');
  
  // Filters
  const [filterTargetName, setFilterTargetName] = React.useState('All');
  const [filterTerritory, setFilterTerritory] = React.useState('All');
  const [filterCity, setFilterCity] = React.useState('All');
  const [filterSKU, setFilterSKU] = React.useState('All');

  React.useEffect(() => {
    if (selectedReport === 'target-sku') {
      loadSKUReport();
    } else if (selectedReport === 'target-resource') {
      loadResourceReport();
    }
  }, [selectedReport]);

  const loadSKUReport = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(API + '/reports/target-sku-allocation', {
        headers: { Authorization: 'Bearer ' + token }
      });
      setReportData(res.data.report_data || []);
    } catch (err) {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const loadResourceReport = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(API + '/reports/target-resource-allocation', {
        headers: { Authorization: 'Bearer ' + token }
      });
      setReportData(res.data.report_data || []);
    } catch (err) {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (reportData.length === 0) {
      toast.error('No data to download');
      return;
    }

    const headers = ['Target Name', 'Territory', 'Start Date', 'End Date', 'City', 'SKU', 'Target Revenue (Rs Lakhs)', 'Achieved (Rs Lakhs)', 'TBD (Rs Lakhs)'];
    const csvData = reportData.map(row => [
      row.target_name,
      row.territory,
      row.start_date,
      row.end_date,
      row.city,
      row.sku,
      (row.target_revenue / 100000).toFixed(2),
      (row.achieved_revenue / 100000).toFixed(2),
      (row.tbd_revenue / 100000).toFixed(2)
    ]);

    const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'target-sku-allocation-report.csv';
    a.click();
    toast.success('Report downloaded!');
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get unique values for filters
  const uniqueTargets = ['All', ...new Set(reportData.map(r => r.target_name))];
  const uniqueTerritories = ['All', ...new Set(reportData.map(r => r.territory))];
  const uniqueCities = ['All', ...new Set(reportData.map(r => r.city))];
  const uniqueSKUs = ['All', ...new Set(reportData.map(r => r.sku))];

  // Apply filters
  let filteredData = reportData;
  
  if (filterTargetName && filterTargetName !== 'All') {
    filteredData = filteredData.filter(row => row.target_name === filterTargetName);
  }
  if (filterTerritory && filterTerritory !== 'All') {
    filteredData = filteredData.filter(row => row.territory === filterTerritory);
  }
  if (filterCity && filterCity !== 'All') {
    filteredData = filteredData.filter(row => row.city === filterCity);
  }
  if (filterSKU && filterSKU !== 'All') {
    filteredData = filteredData.filter(row => row.sku === filterSKU);
  }

  // Sort filtered data
  const sortedData = [...filteredData].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    
    if (sortField === 'target_revenue') {
      aVal = parseFloat(aVal);
      bVal = parseFloat(bVal);
    }
    
    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const getSortIcon = (field) => {
    if (sortField !== field) return '⇅';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-light mb-2">Reports</h1>
        <p className="text-muted-foreground">Analytics and data exports</p>
      </div>

      <Card className="p-6 border rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4 flex-1 max-w-md">
            <FileText className="h-6 w-6 text-primary" />
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Select Report</label>
              <Select value={selectedReport} onValueChange={setSelectedReport}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORTS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {reportData.length > 0 && (
            <Button onClick={downloadCSV} className="rounded-full">
              <Download className="h-4 w-4 mr-2" />
              Download CSV
            </Button>
          )}
        </div>
      </Card>

      {selectedReport === 'target-sku' && (
        <Card className="p-6 border rounded-2xl">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Loading report...</p>
            </div>
          ) : reportData.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No data available. Create target plans and allocate SKUs first.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex justify-between items-center">
                <h2 className="text-lg font-semibold">Target SKU Allocation Report</h2>
                <p className="text-sm text-muted-foreground">{reportData.length} records</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary">
                    <tr className="border-b">
                      <th onClick={() => handleSort('target_name')} className="text-left p-3 font-semibold cursor-pointer hover:bg-secondary/80">
                        Target Name {getSortIcon('target_name')}
                      </th>
                      <th onClick={() => handleSort('territory')} className="text-left p-3 font-semibold cursor-pointer hover:bg-secondary/80">
                        Territory {getSortIcon('territory')}
                      </th>
                      <th onClick={() => handleSort('start_date')} className="text-left p-3 font-semibold cursor-pointer hover:bg-secondary/80">
                        Start Date {getSortIcon('start_date')}
                      </th>
                      <th onClick={() => handleSort('end_date')} className="text-left p-3 font-semibold cursor-pointer hover:bg-secondary/80">
                        End Date {getSortIcon('end_date')}
                      </th>
                      <th onClick={() => handleSort('city')} className="text-left p-3 font-semibold cursor-pointer hover:bg-secondary/80">
                        City {getSortIcon('city')}
                      </th>
                      <th onClick={() => handleSort('sku')} className="text-left p-3 font-semibold cursor-pointer hover:bg-secondary/80">
                        SKU {getSortIcon('sku')}
                      </th>
                      <th onClick={() => handleSort('target_revenue')} className="text-right p-3 font-semibold cursor-pointer hover:bg-secondary/80">
                        Target Revenue {getSortIcon('target_revenue')}
                      </th>
                      <th onClick={() => handleSort('achieved_revenue')} className="text-right p-3 font-semibold cursor-pointer hover:bg-secondary/80">
                        Achieved {getSortIcon('achieved_revenue')}
                      </th>
                      <th onClick={() => handleSort('tbd_revenue')} className="text-right p-3 font-semibold cursor-pointer hover:bg-secondary/80">
                        TBD {getSortIcon('tbd_revenue')}
                      </th>
                    </tr>
                    <tr className="bg-background">
                      <th className="p-2">
                        <select
                          value={filterTargetName}
                          onChange={e => setFilterTargetName(e.target.value)}
                          className="w-full px-2 py-1 text-xs border rounded"
                        >
                          {uniqueTargets.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </th>
                      <th className="p-2">
                        <select
                          value={filterTerritory}
                          onChange={e => setFilterTerritory(e.target.value)}
                          className="w-full px-2 py-1 text-xs border rounded"
                        >
                          {uniqueTerritories.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                      <th className="p-2">
                        <select
                          value={filterCity}
                          onChange={e => setFilterCity(e.target.value)}
                          className="w-full px-2 py-1 text-xs border rounded"
                        >
                          {uniqueCities.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </th>
                      <th className="p-2">
                        <select
                          value={filterSKU}
                          onChange={e => setFilterSKU(e.target.value)}
                          className="w-full px-2 py-1 text-xs border rounded"
                        >
                          {uniqueSKUs.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedData.map((row, idx) => (
                      <tr key={idx} className="border-b hover:bg-secondary/50">
                        <td className="p-3">{row.target_name}</td>
                        <td className="p-3">{row.territory}</td>
                        <td className="p-3">{row.start_date}</td>
                        <td className="p-3">{row.end_date}</td>
                        <td className="p-3">
                          <div>
                            <p className="font-medium">{row.city}</p>
                            <p className="text-xs text-muted-foreground">{row.state}</p>
                          </div>
                        </td>
                        <td className="p-3">{row.sku}</td>
                        <td className="text-right p-3 font-semibold text-primary">
                          Rs {(row.target_revenue / 100000).toFixed(2)}L
                        </td>
                        <td className="text-right p-3 font-semibold text-green-600">
                          Rs {(row.achieved_revenue / 100000).toFixed(2)}L
                        </td>
                        <td className="text-right p-3 font-semibold text-amber-600">
                          Rs {(row.tbd_revenue / 100000).toFixed(2)}L
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {selectedReport !== 'target-sku' && (
        <Card className="p-12 text-center border rounded-2xl">
          <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-semibold mb-2">{REPORTS.find(r => r.value === selectedReport)?.label}</p>
          <p className="text-muted-foreground">This report is coming soon</p>
        </Card>
      )}
    </div>
  );
}
