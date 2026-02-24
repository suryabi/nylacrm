import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { 
  Truck, 
  Plus, 
  Search, 
  CheckCircle,
  Clock,
  Star,
  Phone,
  Mail,
  MapPin
} from 'lucide-react';

export default function Vendors() {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sample vendors data
  const vendors = [
    { id: 1, name: 'PlastiPack Industries', type: 'Bottles & Packaging', contact: 'Rajesh Kumar', phone: '+91 98765 43210', email: 'rajesh@plastipack.com', city: 'Mumbai', status: 'active', rating: 4.5 },
    { id: 2, name: 'LabelPrint Solutions', type: 'Labels & Printing', contact: 'Priya Sharma', phone: '+91 98765 43211', email: 'priya@labelprint.com', city: 'Delhi', status: 'active', rating: 4.8 },
    { id: 3, name: 'FilterTech Systems', type: 'Filtration Equipment', contact: 'Amit Patel', phone: '+91 98765 43212', email: 'amit@filtertech.com', city: 'Ahmedabad', status: 'active', rating: 4.2 },
    { id: 4, name: 'TransportCo Logistics', type: 'Transportation', contact: 'Vikram Singh', phone: '+91 98765 43213', email: 'vikram@transportco.com', city: 'Hyderabad', status: 'active', rating: 4.0 },
    { id: 5, name: 'ChemSupply Corp', type: 'Chemicals & Minerals', contact: 'Neha Gupta', phone: '+91 98765 43214', email: 'neha@chemsupply.com', city: 'Chennai', status: 'inactive', rating: 3.5 },
  ];

  const statusColors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    pending: 'bg-yellow-100 text-yellow-800'
  };

  const renderStars = (rating) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star 
            key={star} 
            className={`w-3 h-3 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} 
          />
        ))}
        <span className="ml-1 text-xs text-gray-500">{rating}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="vendors-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-7 h-7 text-primary" />
            Vendors
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage suppliers and vendor relationships
          </p>
        </div>
        <Button className="gap-2" data-testid="add-vendor-btn">
          <Plus className="w-4 h-4" />
          Add Vendor
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Vendors</p>
                <p className="text-2xl font-bold text-gray-900">{vendors.length}</p>
              </div>
              <Truck className="w-8 h-8 text-gray-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active</p>
                <p className="text-2xl font-bold text-green-600">
                  {vendors.filter(v => v.status === 'active').length}
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
                <p className="text-sm text-gray-500">Pending Approval</p>
                <p className="text-2xl font-bold text-yellow-600">2</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Avg Rating</p>
                <p className="text-2xl font-bold text-primary">4.2</p>
              </div>
              <Star className="w-8 h-8 text-yellow-200 fill-yellow-200" />
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
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="vendors-search"
            />
          </div>
        </div>
      </Card>

      {/* Vendors List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">All Vendors</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {vendors.map((vendor) => (
              <div 
                key={vendor.id} 
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">
                      {vendor.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{vendor.name}</h4>
                    <p className="text-sm text-gray-500">{vendor.type}</p>
                    {renderStars(vendor.rating)}
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-sm text-right">
                    <p className="text-gray-900">{vendor.contact}</p>
                    <div className="flex items-center gap-2 text-gray-500">
                      <Phone className="w-3 h-3" />
                      {vendor.phone}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="w-3 h-3" />
                    {vendor.city}
                  </div>
                  <Badge className={statusColors[vendor.status]}>
                    {vendor.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Placeholder Notice */}
      <div className="text-center py-8 text-gray-400 text-sm">
        <p>This is a placeholder page. Full vendor management functionality coming soon.</p>
      </div>
    </div>
  );
}
