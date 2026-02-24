import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { 
  Box, 
  Plus, 
  Search, 
  CheckCircle,
  AlertTriangle,
  Wrench,
  MapPin
} from 'lucide-react';

export default function Assets() {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sample assets data
  const assets = [
    { id: 1, name: 'AWG Unit - Model X500', assetId: 'AWG-001', location: 'Plant A', status: 'operational', lastService: '2026-01-15', value: 1500000 },
    { id: 2, name: 'AWG Unit - Model X500', assetId: 'AWG-002', location: 'Plant A', status: 'operational', lastService: '2026-01-20', value: 1500000 },
    { id: 3, name: 'Bottling Line - Auto', assetId: 'BTL-001', location: 'Plant A', status: 'maintenance', lastService: '2026-02-10', value: 2500000 },
    { id: 4, name: 'Filtration System', assetId: 'FLT-001', location: 'Plant A', status: 'operational', lastService: '2026-02-01', value: 800000 },
    { id: 5, name: 'UV Sterilizer', assetId: 'UVS-001', location: 'Plant A', status: 'operational', lastService: '2026-01-25', value: 350000 },
    { id: 6, name: 'Delivery Truck', assetId: 'VEH-001', location: 'Hyderabad', status: 'operational', lastService: '2026-02-05', value: 1200000 },
    { id: 7, name: 'Delivery Truck', assetId: 'VEH-002', location: 'Delhi', status: 'repair', lastService: '2026-01-10', value: 1200000 },
  ];

  const statusColors = {
    operational: 'bg-green-100 text-green-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
    repair: 'bg-red-100 text-red-800',
    retired: 'bg-gray-100 text-gray-800'
  };

  const totalValue = assets.reduce((sum, a) => sum + a.value, 0);

  return (
    <div className="space-y-6" data-testid="assets-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Box className="w-7 h-7 text-primary" />
            Assets
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track and manage company assets
          </p>
        </div>
        <Button className="gap-2" data-testid="add-asset-btn">
          <Plus className="w-4 h-4" />
          Add Asset
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Assets</p>
                <p className="text-2xl font-bold text-gray-900">{assets.length}</p>
              </div>
              <Box className="w-8 h-8 text-gray-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Operational</p>
                <p className="text-2xl font-bold text-green-600">
                  {assets.filter(a => a.status === 'operational').length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">In Maintenance</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {assets.filter(a => a.status === 'maintenance' || a.status === 'repair').length}
                </p>
              </div>
              <Wrench className="w-8 h-8 text-yellow-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Value</p>
                <p className="text-2xl font-bold text-primary">
                  ₹{(totalValue / 100000).toFixed(1)}L
                </p>
              </div>
              <Box className="w-8 h-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by name or asset ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="assets-search"
            />
          </div>
        </div>
      </Card>

      {/* Assets List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Assets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {assets.map((asset) => (
              <div 
                key={asset.id} 
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Box className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{asset.name}</h4>
                    <p className="text-sm text-gray-500">ID: {asset.assetId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="w-3 h-3" />
                    {asset.location}
                  </div>
                  <div className="text-sm text-gray-500">
                    ₹{(asset.value / 100000).toFixed(1)}L
                  </div>
                  <Badge className={statusColors[asset.status]}>
                    {asset.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Placeholder Notice */}
      <div className="text-center py-8 text-gray-400 text-sm">
        <p>This is a placeholder page. Full asset management functionality coming soon.</p>
      </div>
    </div>
  );
}
