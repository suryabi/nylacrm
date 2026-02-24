import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { 
  Wrench, 
  Plus, 
  Search, 
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Settings
} from 'lucide-react';

export default function Maintenance() {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sample maintenance data
  const maintenanceItems = [
    { id: 1, equipment: 'AWG Unit #1', type: 'Preventive', status: 'scheduled', date: '2026-02-28', priority: 'medium' },
    { id: 2, equipment: 'Filtration System', type: 'Corrective', status: 'in_progress', date: '2026-02-24', priority: 'high' },
    { id: 3, equipment: 'Bottling Line A', type: 'Preventive', status: 'completed', date: '2026-02-20', priority: 'low' },
    { id: 4, equipment: 'AWG Unit #2', type: 'Inspection', status: 'scheduled', date: '2026-03-05', priority: 'medium' },
  ];

  const statusColors = {
    scheduled: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800'
  };

  const priorityColors = {
    low: 'bg-gray-100 text-gray-800',
    medium: 'bg-orange-100 text-orange-800',
    high: 'bg-red-100 text-red-800'
  };

  return (
    <div className="space-y-6" data-testid="maintenance-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wrench className="w-7 h-7 text-primary" />
            Maintenance
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Schedule and track equipment maintenance
          </p>
        </div>
        <Button className="gap-2" data-testid="add-maintenance-btn">
          <Plus className="w-4 h-4" />
          Schedule Maintenance
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Scheduled</p>
                <p className="text-2xl font-bold text-blue-600">8</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">In Progress</p>
                <p className="text-2xl font-bold text-yellow-600">3</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Overdue</p>
                <p className="text-2xl font-bold text-red-600">1</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Completed (MTD)</p>
                <p className="text-2xl font-bold text-green-600">12</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-200" />
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
              placeholder="Search equipment or maintenance type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="maintenance-search"
            />
          </div>
        </div>
      </Card>

      {/* Maintenance List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Maintenance Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {maintenanceItems.map((item) => (
              <div 
                key={item.id} 
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Settings className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{item.equipment}</h4>
                    <p className="text-sm text-gray-500">{item.type} Maintenance</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={priorityColors[item.priority]}>
                    {item.priority}
                  </Badge>
                  <Badge className={statusColors[item.status]}>
                    {item.status.replace('_', ' ')}
                  </Badge>
                  <span className="text-sm text-gray-500">{item.date}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Placeholder Notice */}
      <div className="text-center py-8 text-gray-400 text-sm">
        <p>This is a placeholder page. Full maintenance management functionality coming soon.</p>
      </div>
    </div>
  );
}
