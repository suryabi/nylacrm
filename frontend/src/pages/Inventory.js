import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { 
  Package, 
  Plus, 
  Search, 
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3
} from 'lucide-react';

export default function Inventory() {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sample inventory data
  const inventoryItems = [
    { id: 1, name: '500ml Bottles', sku: 'BTL-500', quantity: 15000, reorderLevel: 5000, status: 'ok' },
    { id: 2, name: '1L Bottles', sku: 'BTL-1000', quantity: 8500, reorderLevel: 3000, status: 'ok' },
    { id: 3, name: 'Caps (Blue)', sku: 'CAP-BLU', quantity: 2000, reorderLevel: 5000, status: 'low' },
    { id: 4, name: 'Labels - Premium', sku: 'LBL-PRM', quantity: 500, reorderLevel: 2000, status: 'critical' },
    { id: 5, name: 'Shrink Wrap', sku: 'SHR-WRP', quantity: 12000, reorderLevel: 3000, status: 'ok' },
    { id: 6, name: 'Cartons (12-pack)', sku: 'CRT-12P', quantity: 3200, reorderLevel: 1000, status: 'ok' },
  ];

  const statusColors = {
    ok: 'bg-green-100 text-green-800',
    low: 'bg-yellow-100 text-yellow-800',
    critical: 'bg-red-100 text-red-800'
  };

  const getStockPercentage = (quantity, reorderLevel) => {
    return Math.min((quantity / (reorderLevel * 2)) * 100, 100);
  };

  return (
    <div className="space-y-6" data-testid="inventory-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-7 h-7 text-primary" />
            Inventory
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track and manage production inventory
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Reports
          </Button>
          <Button className="gap-2" data-testid="add-inventory-btn">
            <Plus className="w-4 h-4" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Items</p>
                <p className="text-2xl font-bold text-gray-900">156</p>
              </div>
              <Package className="w-8 h-8 text-gray-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Low Stock</p>
                <p className="text-2xl font-bold text-yellow-600">8</p>
              </div>
              <TrendingDown className="w-8 h-8 text-yellow-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Critical</p>
                <p className="text-2xl font-bold text-red-600">2</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Value (INR)</p>
                <p className="text-2xl font-bold text-green-600">24.5L</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-200" />
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
              placeholder="Search by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="inventory-search"
            />
          </div>
        </div>
      </Card>

      {/* Inventory List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Inventory Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {inventoryItems.map((item) => (
              <div 
                key={item.id} 
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{item.name}</h4>
                    <p className="text-sm text-gray-500">SKU: {item.sku}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="w-32">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Stock Level</span>
                      <span className="font-medium">{item.quantity.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${item.status === 'ok' ? 'bg-green-500' : item.status === 'low' ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${getStockPercentage(item.quantity, item.reorderLevel)}%` }}
                      />
                    </div>
                  </div>
                  <Badge className={statusColors[item.status]}>
                    {item.status === 'ok' ? 'In Stock' : item.status === 'low' ? 'Low Stock' : 'Critical'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Placeholder Notice */}
      <div className="text-center py-8 text-gray-400 text-sm">
        <p>This is a placeholder page. Full inventory management functionality coming soon.</p>
      </div>
    </div>
  );
}
