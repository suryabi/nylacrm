import React, { useState } from 'react';
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
  
  const maintenanceItems = [
    { id: 1, equipment: 'AWG Unit #1', type: 'Preventive', status: 'scheduled', date: '2026-02-28', priority: 'medium' },
    { id: 2, equipment: 'Filtration System', type: 'Corrective', status: 'in_progress', date: '2026-02-24', priority: 'high' },
    { id: 3, equipment: 'Bottling Line A', type: 'Preventive', status: 'completed', date: '2026-02-20', priority: 'low' },
    { id: 4, equipment: 'AWG Unit #2', type: 'Inspection', status: 'scheduled', date: '2026-03-05', priority: 'medium' },
  ];

  const statusColors = {
    scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    overdue: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
  };

  const priorityColors = {
    low: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    medium: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
    high: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
  };

  const stats = [
    { label: 'Scheduled', value: 8, icon: Calendar, gradient: 'from-blue-500 to-indigo-600', bgGradient: 'from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20', textColor: 'text-blue-700 dark:text-blue-300' },
    { label: 'In Progress', value: 3, icon: Clock, gradient: 'from-amber-500 to-orange-600', bgGradient: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20', textColor: 'text-amber-700 dark:text-amber-300' },
    { label: 'Overdue', value: 1, icon: AlertTriangle, gradient: 'from-red-500 to-rose-600', bgGradient: 'from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/20', textColor: 'text-red-700 dark:text-red-300' },
    { label: 'Completed', value: 12, icon: CheckCircle, gradient: 'from-emerald-500 to-teal-600', bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20', textColor: 'text-emerald-700 dark:text-emerald-300' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" data-testid="maintenance-page">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-30 dark:opacity-10 pointer-events-none" />
      
      <div className="relative p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-100 to-gray-100 dark:from-slate-800 dark:to-gray-800">
              <Wrench className="h-6 w-6 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-white">Maintenance</h1>
              <p className="text-muted-foreground">Schedule and track equipment maintenance</p>
            </div>
          </div>
          <Button className="bg-gradient-to-r from-slate-600 to-gray-700 hover:from-slate-700 hover:to-gray-800 text-white shadow-lg" data-testid="add-maintenance-btn">
            <Plus className="w-4 h-4 mr-2" />
            Schedule Maintenance
          </Button>
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
                placeholder="Search equipment or maintenance type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 border-slate-200 dark:border-slate-700"
                data-testid="maintenance-search"
              />
            </div>
          </div>
        </Card>

        {/* Maintenance List */}
        <Card className="border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg overflow-hidden">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-lg text-slate-800 dark:text-white">Maintenance Schedule</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {maintenanceItems.map((item) => (
                <div 
                  key={item.id} 
                  className="flex items-center justify-between p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-700/30 rounded-xl hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Settings className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800 dark:text-white">{item.equipment}</h4>
                      <p className="text-sm text-muted-foreground">{item.type} Maintenance</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={priorityColors[item.priority]}>{item.priority}</Badge>
                    <Badge className={statusColors[item.status]}>{item.status.replace('_', ' ')}</Badge>
                    <span className="text-sm text-muted-foreground">{item.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Placeholder Notice */}
        <div className="text-center py-8 text-muted-foreground text-sm">
          <p>This is a placeholder page. Full maintenance management functionality coming soon.</p>
        </div>
      </div>
    </div>
  );
}
