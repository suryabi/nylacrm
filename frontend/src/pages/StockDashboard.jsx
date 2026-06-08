import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Package, Warehouse, Building2, MapPin, RefreshCw, 
  TrendingUp, TrendingDown, Search, Filter, BarChart3,
  Boxes, ChevronDown, ChevronUp, ShieldAlert, Factory,
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function StockDashboard() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stockData, setStockData] = useState(null);
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDistributor, setSelectedDistributor] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLocations, setExpandedLocations] = useState({});
  const [distributors, setDistributors] = useState([]);
  const [safetyData, setSafetyData] = useState(null);
  const [safetyLoading, setSafetyLoading] = useState(false);

  // Fetch distributors list
  const fetchDistributors = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/distributors?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setDistributors(response.data.distributors || []);
    } catch (error) {
      console.error('Failed to fetch distributors:', error);
    }
  }, [token]);

  // Fetch stock dashboard data
  const fetchStockData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/api/distributors/dashboard/stock-summary`;
      const params = new URLSearchParams();
      if (selectedCity) params.append('city', selectedCity);
      if (selectedDistributor) params.append('distributor_id', selectedDistributor);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true
      });
      setStockData(response.data);
    } catch (error) {
      console.error('Failed to fetch stock data:', error);
      toast.error('Failed to load stock dashboard');
    } finally {
      setLoading(false);
    }
  }, [token, selectedCity, selectedDistributor]);

  useEffect(() => {
    fetchDistributors();
  }, [fetchDistributors]);

  useEffect(() => {
    fetchStockData();
  }, [fetchStockData]);

  // Safety / cross-collection warehouse overview (factory_warehouse_stock +
  // distributor_stock unified into a single table so admins can spot mismatches).
  const fetchSafetyData = useCallback(async () => {
    setSafetyLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/distributor/stock-transfers/warehouse-stock-overview`, {
        headers: { Authorization: `Bearer ${token}` },
        withCredentials: true,
      });
      setSafetyData(data);
    } catch (e) {
      toast.error('Failed to load safety overview');
    } finally {
      setSafetyLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSafetyData();
  }, [fetchSafetyData]);

  const toggleLocationExpand = (locationId) => {
    setExpandedLocations(prev => ({
      ...prev,
      [locationId]: !prev[locationId]
    }));
  };

  // Filter locations by search
  const filteredLocations = stockData?.by_location?.filter(loc => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return loc.location_name?.toLowerCase().includes(query) ||
           loc.distributor_name?.toLowerCase().includes(query) ||
           loc.items?.some(item => item.sku_name?.toLowerCase().includes(query));
  }) || [];

  if (loading && !stockData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="stock-dashboard">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-7 w-7" />
            Stock Dashboard
          </h1>
          <p className="text-muted-foreground">Real-time inventory levels across distributor locations</p>
        </div>
        <Button onClick={fetchStockData} variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by location, distributor, or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="stock-search-input"
                />
              </div>
            </div>
            <Select value={selectedCity || 'all'} onValueChange={(v) => setSelectedCity(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[180px]" data-testid="city-filter">
                <MapPin className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Cities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {stockData?.cities?.map(city => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedDistributor || 'all'} onValueChange={(v) => setSelectedDistributor(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[200px]" data-testid="distributor-filter">
                <Building2 className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Distributors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Distributors</SelectItem>
                {distributors.map(dist => (
                  <SelectItem key={dist.id} value={dist.id}>{dist.distributor_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 font-medium">Total Stock</p>
                <p className="text-3xl font-bold text-blue-700" data-testid="total-stock">
                  {stockData?.summary?.total_quantity?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-blue-600">crates</p>
              </div>
              <Boxes className="h-10 w-10 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100/50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 font-medium">SKU Types</p>
                <p className="text-3xl font-bold text-green-700" data-testid="total-skus">
                  {stockData?.summary?.total_skus || 0}
                </p>
                <p className="text-xs text-green-600">products</p>
              </div>
              <Package className="h-10 w-10 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 font-medium">Locations</p>
                <p className="text-3xl font-bold text-purple-700" data-testid="total-locations">
                  {stockData?.summary?.total_locations || 0}
                </p>
                <p className="text-xs text-purple-600">warehouses</p>
              </div>
              <Warehouse className="h-10 w-10 text-purple-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-600 font-medium">Distributors</p>
                <p className="text-3xl font-bold text-orange-700" data-testid="total-distributors">
                  {stockData?.summary?.total_distributors || 0}
                </p>
                <p className="text-xs text-orange-600">partners</p>
              </div>
              <Building2 className="h-10 w-10 text-orange-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="by-location" className="space-y-4">
        <TabsList>
          <TabsTrigger value="by-location" data-testid="tab-by-location">
            <Warehouse className="h-4 w-4 mr-2" />
            By Location
          </TabsTrigger>
          <TabsTrigger value="by-sku" data-testid="tab-by-sku">
            <Package className="h-4 w-4 mr-2" />
            By SKU
          </TabsTrigger>
          <TabsTrigger value="by-distributor" data-testid="tab-by-distributor">
            <Building2 className="h-4 w-4 mr-2" />
            By Distributor
          </TabsTrigger>
          <TabsTrigger value="safety-overview" data-testid="tab-safety-overview">
            <ShieldAlert className="h-4 w-4 mr-2" />
            Safety Overview
            {(safetyData?.orphans?.length || 0) + (safetyData?.warehouses?.reduce((n, w) => n + (w.warnings?.length || 0), 0) || 0) > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-[10px]" data-testid="safety-issues-badge">
                {(safetyData?.orphans?.length || 0) + (safetyData?.warehouses?.reduce((n, w) => n + (w.warnings?.length || 0), 0) || 0)}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* By Location Tab */}
        <TabsContent value="by-location">
          <div className="space-y-4">
            {filteredLocations.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Warehouse className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No stock data available</p>
                  <p className="text-sm">Stock will appear here after shipments are delivered</p>
                </CardContent>
              </Card>
            ) : (
              filteredLocations.map((location) => (
                <Card key={location.location_id} className="overflow-hidden" data-testid={`location-card-${location.location_id}`}>
                  <CardHeader 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleLocationExpand(location.location_id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Warehouse className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{location.location_name}</CardTitle>
                          <CardDescription className="flex items-center gap-2">
                            <Building2 className="h-3 w-3" />
                            {location.distributor_name}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-2xl font-bold">{location.total_quantity?.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">{location.sku_count} SKUs</p>
                        </div>
                        {expandedLocations[location.location_id] ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  {expandedLocations[location.location_id] && (
                    <CardContent className="border-t bg-muted/20">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-3 font-medium">SKU</th>
                              <th className="text-right p-3 font-medium">Quantity</th>
                              <th className="text-right p-3 font-medium">% of Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {location.items?.sort((a, b) => b.quantity - a.quantity).map((item, idx) => (
                              <tr key={item.sku_id || idx} className="border-b last:border-b-0 hover:bg-muted/30">
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                    {item.sku_name}
                                  </div>
                                </td>
                                <td className="p-3 text-right font-medium">{item.quantity?.toLocaleString()}</td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-primary rounded-full"
                                        style={{ width: `${(item.quantity / location.total_quantity * 100).toFixed(0)}%` }}
                                      />
                                    </div>
                                    <span className="text-muted-foreground">
                                      {(item.quantity / location.total_quantity * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* By SKU Tab */}
        <TabsContent value="by-sku">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Stock by Product</CardTitle>
              <CardDescription>Total inventory across all locations for each SKU</CardDescription>
            </CardHeader>
            <CardContent>
              {stockData?.by_sku?.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No stock data available</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="sku-table">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">SKU</th>
                        <th className="text-right p-3 font-medium">Total Quantity</th>
                        <th className="text-right p-3 font-medium">Locations</th>
                        <th className="text-right p-3 font-medium">Distribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockData?.by_sku?.map((sku, idx) => (
                        <tr key={sku.sku_id || idx} className="border-b hover:bg-muted/30" data-testid={`sku-row-${idx}`}>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-green-100 rounded">
                                <Package className="h-4 w-4 text-green-600" />
                              </div>
                              <span className="font-medium">{sku.sku_name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <span className="text-lg font-bold">{sku.total_quantity?.toLocaleString()}</span>
                          </td>
                          <td className="p-3 text-right">
                            <Badge variant="outline">{sku.location_count} locations</Badge>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-24 h-3 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-green-500 rounded-full"
                                  style={{ width: `${(sku.total_quantity / stockData.summary.total_quantity * 100).toFixed(0)}%` }}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground w-12 text-right">
                                {(sku.total_quantity / stockData.summary.total_quantity * 100).toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Distributor Tab */}
        <TabsContent value="by-distributor">
          <div className="grid md:grid-cols-2 gap-4">
            {stockData?.by_distributor?.length === 0 ? (
              <Card className="md:col-span-2">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No distributor stock data available</p>
                </CardContent>
              </Card>
            ) : (
              stockData?.by_distributor?.map((dist, idx) => (
                <Card key={dist.distributor_id || idx} className="overflow-hidden" data-testid={`distributor-card-${idx}`}>
                  <CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-100 rounded-lg">
                        <Building2 className="h-6 w-6 text-orange-600" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{dist.distributor_name}</CardTitle>
                        <CardDescription>
                          {dist.location_count} location{dist.location_count !== 1 ? 's' : ''} • {dist.sku_count} SKU{dist.sku_count !== 1 ? 's' : ''}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-3xl font-bold">{dist.total_quantity?.toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">total units</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <BarChart3 className="h-4 w-4" />
                          <span className="text-sm">
                            {(dist.total_quantity / stockData.summary.total_quantity * 100).toFixed(1)}% of total
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Safety Overview — cross-collection (factory_warehouse_stock + distributor_stock) */}
        <TabsContent value="safety-overview" data-testid="safety-overview-panel">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-amber-600" />
                      Cross-Collection Warehouse Stock
                    </CardTitle>
                    <CardDescription>
                      Unified view of on-hand stock across BOTH <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">factory_warehouse_stock</code> and <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">distributor_stock</code>. Mismatches (stock in wrong collection) and orphan rows are flagged below.
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Total bottles</p>
                    <p className="text-2xl font-bold tabular-nums" data-testid="safety-grand-total">
                      {(safetyData?.totals?.grand_bottles || 0).toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      <span className="text-purple-700 font-semibold">{(safetyData?.totals?.factory_bottles || 0).toLocaleString('en-IN')}</span> factory ·{' '}
                      <span className="text-blue-700 font-semibold">{(safetyData?.totals?.distributor_bottles || 0).toLocaleString('en-IN')}</span> distributor
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {safetyLoading ? (
                  <div className="py-8 text-center"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
                ) : (safetyData?.warehouses?.length || 0) === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">No warehouses found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="text-left p-2">Warehouse</th>
                          <th className="text-left p-2">Distributor</th>
                          <th className="text-left p-2">Kind</th>
                          <th className="text-right p-2">Bottles</th>
                          <th className="text-left p-2">SKUs</th>
                          <th className="text-left p-2">Issues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {safetyData.warehouses.map((w) => {
                          const skuCount = (w.items_distributor?.length || 0) + (w.items_factory?.length || 0);
                          return (
                            <tr key={w.location_id} className="border-b hover:bg-slate-50" data-testid={`safety-row-${w.location_id}`}>
                              <td className="p-2">
                                <div className="font-medium">{w.location_name}</div>
                                <div className="text-[11px] text-muted-foreground">{w.city || '—'}{w.state ? `, ${w.state}` : ''}{w.gstin ? ` · ${w.gstin}` : ''}</div>
                              </td>
                              <td className="p-2 text-xs">{w.distributor_name || '—'}</td>
                              <td className="p-2">
                                {w.is_factory ? (
                                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]"><Factory className="h-3 w-3 mr-1" />Factory</Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]"><Warehouse className="h-3 w-3 mr-1" />Distributor</Badge>
                                )}
                              </td>
                              <td className="p-2 text-right font-mono font-semibold tabular-nums">{(w.total_bottles || 0).toLocaleString('en-IN')}</td>
                              <td className="p-2 text-xs">{skuCount}</td>
                              <td className="p-2">
                                {(w.warnings || []).length === 0 ? (
                                  <span className="text-emerald-600 text-xs">✓ OK</span>
                                ) : (
                                  <div className="space-y-1">
                                    {w.warnings.map((msg, idx) => (
                                      <div key={idx} className="text-[11px] text-amber-700 flex items-start gap-1">
                                        <ShieldAlert className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                        <span>{msg}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {(safetyData?.orphans?.length || 0) > 0 && (
              <Card className="border-red-200 bg-red-50/30">
                <CardHeader>
                  <CardTitle className="text-red-700 text-base flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" /> Orphan stock rows ({safetyData.orphans.length})
                  </CardTitle>
                  <CardDescription>Stock rows whose <code>location_id</code> no longer exists. Investigate and either reassign or delete.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 text-xs">
                    {safetyData.orphans.map((o, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-red-700">
                        <code className="bg-red-100 px-1 rounded text-[10px]">{o.collection}</code>
                        <span className="font-medium">{o.sku_name}</span>
                        <span className="tabular-nums">— {o.bottles} bottles</span>
                        <span className="text-red-500">· {o.hint}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
