import React from 'react';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { Users, Download, Loader2, Target, TrendingUp, Award, BarChart3 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

function formatCurrency(value) {
  if (!value) return '₹0';
  const num = Math.round(value);
  if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  if (num >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
  return '₹' + num.toLocaleString('en-IN');
}

export default function TargetResourceReport() {
  const [reportData, setReportData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [sortField, setSortField] = React.useState('target_name');
  const [sortDirection, setSortDirection] = React.useState('asc');
  
  const [filterTargetName, setFilterTargetName] = React.useState('All');
  const [filterTerritory, setFilterTerritory] = React.useState('All');
  const [filterCity, setFilterCity] = React.useState('All');
  const [filterResource, setFilterResource] = React.useState('All');

  React.useEffect(() => { loadReport(); }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await axios.get(API + '/reports/target-resource-allocation', { withCredentials: true });
      setReportData(res.data.report_data || []);
    } catch (err) { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  };

  const downloadCSV = () => {
    if (reportData.length === 0) { toast.error('No data to download'); return; }
    const headers = ['Target Name', 'Territory', 'Start Date', 'End Date', 'City', 'Resource', 'Designation', 'Target Revenue (Rs Lakhs)', 'Achieved (Rs Lakhs)', 'TBD (Rs Lakhs)', 'Achievement %'];
    const csvData = reportData.map(row => [row.target_name, row.territory, row.start_date, row.end_date, row.city, row.resource_name, row.designation, (row.target_revenue / 100000).toFixed(2), (row.achieved_revenue / 100000).toFixed(2), (row.tbd_revenue / 100000).toFixed(2), row.achievement_percentage || 0]);
    const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'target-resource-allocation-report.csv';
    a.click();
    toast.success('Report downloaded!');
  };

  const handleSort = (field) => {
    if (sortField === field) { setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc'); }
    else { setSortField(field); setSortDirection('asc'); }
  };

  const uniqueTargets = ['All', ...new Set(reportData.map(r => r.target_name))];
  const uniqueTerritories = ['All', ...new Set(reportData.map(r => r.territory))];
  const uniqueCities = ['All', ...new Set(reportData.map(r => r.city))];
  const uniqueResources = ['All', ...new Set(reportData.map(r => r.resource_name))];

  let filteredData = reportData;
  if (filterTargetName !== 'All') filteredData = filteredData.filter(row => row.target_name === filterTargetName);
  if (filterTerritory !== 'All') filteredData = filteredData.filter(row => row.territory === filterTerritory);
  if (filterCity !== 'All') filteredData = filteredData.filter(row => row.city === filterCity);
  if (filterResource !== 'All') filteredData = filteredData.filter(row => row.resource_name === filterResource);

  const sortedData = [...filteredData].sort((a, b) => {
    let aVal = a[sortField], bVal = b[sortField];
    if (['target_revenue', 'achieved_revenue', 'tbd_revenue', 'achievement_percentage'].includes(sortField)) { aVal = parseFloat(aVal) || 0; bVal = parseFloat(bVal) || 0; }
    return sortDirection === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  const getSortIcon = (field) => sortField !== field ? '⇅' : sortDirection === 'asc' ? '↑' : '↓';

  // Calculate summary stats
  const totalTarget = filteredData.reduce((sum, r) => sum + (r.target_revenue || 0), 0);
  const totalAchieved = filteredData.reduce((sum, r) => sum + (r.achieved_revenue || 0), 0);
  const totalTBD = filteredData.reduce((sum, r) => sum + (r.tbd_revenue || 0), 0);
  const avgAchievement = filteredData.length > 0 ? Math.round(filteredData.reduce((sum, r) => sum + (r.achievement_percentage || 0), 0) / filteredData.length) : 0;

  const stats = [
    { label: 'Total Target', value: formatCurrency(totalTarget), icon: Target, gradient: 'from-indigo-500 to-blue-600', bgGradient: 'from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/20', iconBg: 'bg-indigo-100 dark:bg-indigo-900/50', textColor: 'text-indigo-700 dark:text-indigo-300' },
    { label: 'Total Achieved', value: formatCurrency(totalAchieved), icon: TrendingUp, gradient: 'from-emerald-500 to-teal-600', bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20', iconBg: 'bg-emerald-100 dark:bg-emerald-900/50', textColor: 'text-emerald-700 dark:text-emerald-300' },
    { label: 'TBD Revenue', value: formatCurrency(totalTBD), icon: BarChart3, gradient: 'from-amber-500 to-orange-600', bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20', iconBg: 'bg-amber-100 dark:bg-amber-900/50', textColor: 'text-amber-700 dark:text-amber-300' },
    { label: 'Avg Achievement', value: `${avgAchievement}%`, icon: Award, gradient: 'from-violet-500 to-purple-600', bgGradient: 'from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20', iconBg: 'bg-violet-100 dark:bg-violet-900/50', textColor: 'text-violet-700 dark:text-violet-300' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="target-resource-report">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-900/50 dark:to-blue-900/30">
                <Users className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Target x Resource</h1>
                <p className="text-muted-foreground">Resource allocation across sales targets</p>
              </div>
            </div>
            {reportData.length > 0 && (
              <Button onClick={downloadCSV} className="bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/30">
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
            )}
          </div>
        </header>

        {/* Summary Stats */}
        {!loading && reportData.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label} className={`relative overflow-hidden border-0 bg-gradient-to-br ${stat.bgGradient} backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5`}>
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient}`} />
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                        <p className={`text-2xl lg:text-3xl font-bold ${stat.textColor} tabular-nums`}>{stat.value}</p>
                      </div>
                      <div className={`p-2.5 rounded-xl ${stat.iconBg}`}><Icon className={`h-5 w-5 ${stat.textColor}`} /></div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Data Table */}
        <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative"><div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" /><Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" /></div>
              <p className="text-muted-foreground text-sm mt-4 animate-pulse">Loading report...</p>
            </div>
          ) : reportData.length === 0 ? (
            <div className="text-center py-16">
              <Users className="h-16 w-16 mx-auto mb-4 text-slate-200 dark:text-slate-700" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">No data available</p>
              <p className="text-muted-foreground text-sm">Create target plans and assign resources first</p>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                <p className="text-sm text-muted-foreground">{filteredData.length} of {reportData.length} records</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                      <th onClick={() => handleSort('target_name')} className="text-left py-4 px-4 font-semibold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">Target {getSortIcon('target_name')}</th>
                      <th onClick={() => handleSort('territory')} className="text-left py-4 px-4 font-semibold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">Territory {getSortIcon('territory')}</th>
                      <th onClick={() => handleSort('start_date')} className="text-left py-4 px-4 font-semibold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">Start {getSortIcon('start_date')}</th>
                      <th onClick={() => handleSort('end_date')} className="text-left py-4 px-4 font-semibold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">End {getSortIcon('end_date')}</th>
                      <th onClick={() => handleSort('city')} className="text-left py-4 px-4 font-semibold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">City {getSortIcon('city')}</th>
                      <th onClick={() => handleSort('resource_name')} className="text-left py-4 px-4 font-semibold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">Resource {getSortIcon('resource_name')}</th>
                      <th onClick={() => handleSort('target_revenue')} className="text-right py-4 px-4 font-semibold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">Target {getSortIcon('target_revenue')}</th>
                      <th onClick={() => handleSort('achieved_revenue')} className="text-right py-4 px-4 font-semibold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">Achieved {getSortIcon('achieved_revenue')}</th>
                      <th onClick={() => handleSort('tbd_revenue')} className="text-right py-4 px-4 font-semibold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">TBD {getSortIcon('tbd_revenue')}</th>
                      <th onClick={() => handleSort('achievement_percentage')} className="text-right py-4 px-4 font-semibold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">% {getSortIcon('achievement_percentage')}</th>
                    </tr>
                    <tr className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                      <th className="p-2"><select value={filterTargetName} onChange={e => setFilterTargetName(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">{uniqueTargets.map(t => <option key={t} value={t}>{t}</option>)}</select></th>
                      <th className="p-2"><select value={filterTerritory} onChange={e => setFilterTerritory(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">{uniqueTerritories.map(t => <option key={t} value={t}>{t}</option>)}</select></th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                      <th className="p-2"><select value={filterCity} onChange={e => setFilterCity(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">{uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}</select></th>
                      <th className="p-2"><select value={filterResource} onChange={e => setFilterResource(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800">{uniqueResources.map(r => <option key={r} value={r}>{r}</option>)}</select></th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedData.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-4 px-4 font-medium text-slate-800 dark:text-white">{row.target_name}</td>
                        <td className="py-4 px-4 text-muted-foreground">{row.territory}</td>
                        <td className="py-4 px-4 text-muted-foreground text-sm">{row.start_date}</td>
                        <td className="py-4 px-4 text-muted-foreground text-sm">{row.end_date}</td>
                        <td className="py-4 px-4"><div><p className="font-medium text-slate-700 dark:text-slate-300">{row.city}</p><p className="text-xs text-muted-foreground">{row.state}</p></div></td>
                        <td className="py-4 px-4"><div><p className="font-medium text-slate-700 dark:text-slate-300">{row.resource_name}</p><p className="text-xs text-muted-foreground">{row.designation}</p></div></td>
                        <td className="py-4 px-4 text-right font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(row.target_revenue)}</td>
                        <td className="py-4 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(row.achieved_revenue)}</td>
                        <td className={`py-4 px-4 text-right font-semibold ${row.tbd_revenue <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{formatCurrency(row.tbd_revenue)}</td>
                        <td className={`py-4 px-4 text-right font-semibold ${
                          row.achievement_percentage >= 100 ? 'text-emerald-600 dark:text-emerald-400' :
                          row.achievement_percentage >= 75 ? 'text-blue-600 dark:text-blue-400' :
                          row.achievement_percentage >= 50 ? 'text-amber-600 dark:text-amber-400' :
                          'text-red-600 dark:text-red-400'
                        }`}>{row.achievement_percentage || 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
