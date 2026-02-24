import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { 
  ShieldCheck, 
  Plus, 
  Search, 
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Beaker
} from 'lucide-react';

export default function QualityControl() {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sample QC data
  const qcReports = [
    { id: 1, batch: 'BATCH-2026-0224-A', product: '500ml Premium', testDate: '2026-02-24', status: 'passed', tds: 45, ph: 7.2 },
    { id: 2, batch: 'BATCH-2026-0224-B', product: '1L Premium', testDate: '2026-02-24', status: 'pending', tds: null, ph: null },
    { id: 3, batch: 'BATCH-2026-0223-A', product: '500ml Premium', testDate: '2026-02-23', status: 'passed', tds: 42, ph: 7.1 },
    { id: 4, batch: 'BATCH-2026-0223-B', product: '20L Can', testDate: '2026-02-23', status: 'failed', tds: 180, ph: 6.2 },
    { id: 5, batch: 'BATCH-2026-0222-A', product: '500ml Premium', testDate: '2026-02-22', status: 'passed', tds: 38, ph: 7.0 },
  ];

  const statusColors = {
    passed: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800'
  };

  const statusIcons = {
    passed: <CheckCircle className="w-4 h-4" />,
    pending: <Clock className="w-4 h-4" />,
    failed: <XCircle className="w-4 h-4" />
  };

  return (
    <div className="space-y-6" data-testid="quality-control-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary" />
            Quality Control
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor and manage product quality testing
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <FileText className="w-4 h-4" />
            Export Reports
          </Button>
          <Button className="gap-2" data-testid="add-qc-btn">
            <Plus className="w-4 h-4" />
            New Test
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Tests Today</p>
                <p className="text-2xl font-bold text-gray-900">12</p>
              </div>
              <Beaker className="w-8 h-8 text-gray-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Passed</p>
                <p className="text-2xl font-bold text-green-600">10</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">1</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Failed</p>
                <p className="text-2xl font-bold text-red-600">1</p>
              </div>
              <XCircle className="w-8 h-8 text-red-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quality Thresholds */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-blue-800">Quality Thresholds:</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-blue-700">TDS: <strong>&lt; 50 ppm</strong></span>
            <span className="text-blue-700">pH: <strong>6.5 - 7.5</strong></span>
            <span className="text-blue-700">Turbidity: <strong>&lt; 1 NTU</strong></span>
          </div>
        </div>
      </Card>

      {/* Search */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by batch number or product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="qc-search"
            />
          </div>
        </div>
      </Card>

      {/* QC Reports List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Quality Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {qcReports.map((report) => (
              <div 
                key={report.id} 
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    report.status === 'passed' ? 'bg-green-100' : 
                    report.status === 'pending' ? 'bg-yellow-100' : 'bg-red-100'
                  }`}>
                    {statusIcons[report.status]}
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{report.batch}</h4>
                    <p className="text-sm text-gray-500">{report.product}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  {report.tds !== null && (
                    <div className="text-sm">
                      <span className="text-gray-500">TDS: </span>
                      <span className={`font-medium ${report.tds <= 50 ? 'text-green-600' : 'text-red-600'}`}>
                        {report.tds} ppm
                      </span>
                    </div>
                  )}
                  {report.ph !== null && (
                    <div className="text-sm">
                      <span className="text-gray-500">pH: </span>
                      <span className={`font-medium ${report.ph >= 6.5 && report.ph <= 7.5 ? 'text-green-600' : 'text-red-600'}`}>
                        {report.ph}
                      </span>
                    </div>
                  )}
                  <Badge className={statusColors[report.status]}>
                    {report.status}
                  </Badge>
                  <span className="text-sm text-gray-500">{report.testDate}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Placeholder Notice */}
      <div className="text-center py-8 text-gray-400 text-sm">
        <p>This is a placeholder page. Full quality control functionality coming soon.</p>
      </div>
    </div>
  );
}
