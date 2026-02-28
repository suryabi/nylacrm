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
  
  const inventoryItems = [
    { id: 1, name: '500ml Bottles', sku: 'BTL-500', quantity: 15000, reorderLevel: 5000, status: 'ok' },
    { id: 2, name: '1L Bottles', sku: 'BTL-1000', quantity: 8500, reorderLevel: 3000, status: 'ok' },
    { id: 3, name: 'Caps (Blue)', sku: 'CAP-BLU', quantity: 2000, reorderLevel: 5000, status: 'low' },
    { id: 4, name: 'Labels - Premium', sku: 'LBL-PRM', quantity: 500, reorderLevel: 2000, status: 'critical' },
    { id: 5, name: 'Shrink Wrap', sku: 'SHR-WRP', quantity: 12000, reorderLevel: 3000, status: 'ok' },
    { id: 6, name: 'Cartons (12-pack)', sku: 'CRT-12P', quantity: 3200, reorderLevel: 1000, status: 'ok' },
  ];

  const statusColors = {
    ok: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    low: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
    critical: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
  };

  const getStockPercentage = (quantity, reorderLevel) => {
    return Math.min((quantity / (reorderLevel * 2)) * 100, 100);
  };

  const stats = [
    { label: 'Total Items', value: 156, icon: Package, gradient: 'from-slate-500 to-gray-600', bgGradient: 'from-slate-50 to-gray-50 dark:from-slate-900/30 dark:to-gray-900/20', textColor: 'text-slate-700 dark:text-slate-300' },
    { label: 'Low Stock', value: 8, icon: TrendingDown, gradient: 'from-amber-500 to-orange-600', bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20', textColor: 'text-amber-700 dark:text-amber-300' },
    { label: 'Critical', value: 2, icon: AlertTriangle, gradient: 'from-red-500 to-rose-600', bgGradient: 'from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/20', textColor: 'text-red-700 dark:text-red-300' },
    { label: 'Value (INR)', value: '24.5L', icon: TrendingUp, gradient: 'from-emerald-500 to-teal-600', bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20', textColor: 'text-emerald-700 dark:text-emerald-300' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="inventory-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/50 dark:to-indigo-900/30">
              <Package className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Inventory</h1>
              <p className="text-muted-foreground">Track and manage production inventory</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2 border-slate-200 dark:border-slate-700">
              <BarChart3 className="w-4 h-4" />
              Reports
            </Button>
            <Button className="gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg" data-testid="add-inventory-btn">
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className={`relative overflow-hidden border-0 bg-gradient-to-br ${stat.bgGradient} backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5`}>
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient}`} />
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                      <p className={`text-2xl font-bold ${stat.textColor} tabular-nums`}>{stat.value}</p>
                    </div>
                    <Icon className={`w-8 h-8 ${stat.textColor} opacity-50`} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Search */}
        <Card className="p-4 border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 border-slate-200 dark:border-slate-700"
                data-testid="inventory-search"
              />
            </div>
          </div>
        </Card>

        {/* Inventory List */}
        <Card className="border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg overflow-hidden">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-lg text-slate-800 dark:text-white">Inventory Items</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {inventoryItems.map((item) => (
                <div 
                  key={item.id} 
                  className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-700/30 rounded-xl hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Package className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800 dark:text-white">{item.name}</h4>
                      <p className="text-sm text-muted-foreground">SKU: {item.sku}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="w-32">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Stock Level</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{item.quantity.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
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
        <div className="text-center py-8 text-muted-foreground text-sm">
          <p>This is a placeholder page. Full inventory management functionality coming soon.</p>
        </div>
      </div>
    </div>
  );
}
