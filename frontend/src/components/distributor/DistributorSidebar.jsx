import React from 'react';
import { 
  Building2, 
  MapPin, 
  Warehouse, 
  Percent, 
  Users, 
  PackageCheck, 
  Truck, 
  Receipt, 
  Calculator,
  ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';

const navGroups = [
  {
    label: 'General',
    items: [
      { id: 'overview', label: 'Overview', icon: Building2, description: 'Basic info & terms' },
    ]
  },
  {
    label: 'Operations',
    items: [
      { id: 'coverage', label: 'Coverage', icon: MapPin, description: 'Operating areas' },
      { id: 'locations', label: 'Locations', icon: Warehouse, description: 'Warehouses' },
    ]
  },
  {
    label: 'Commercial',
    items: [
      { id: 'margins', label: 'Margin Matrix', icon: Percent, description: 'SKU margins' },
      { id: 'assignments', label: 'Accounts', icon: Users, description: 'Assigned customers' },
    ]
  },
  {
    label: 'Transactions',
    items: [
      { id: 'shipments', label: 'Stock In', icon: PackageCheck, description: 'Factory shipments' },
      { id: 'deliveries', label: 'Stock Out', icon: Truck, description: 'Customer deliveries' },
    ]
  },
  {
    label: 'Financial',
    items: [
      { id: 'settlements', label: 'Settlements', icon: Receipt, description: 'Account payouts' },
      { id: 'billing', label: 'Reconciliation', icon: Calculator, description: 'Billing & notes' },
    ]
  }
];

export const DistributorSidebar = ({ 
  activeTab, 
  onTabChange, 
  distributor,
  counts = {}
}) => {
  return (
    <aside className="w-64 min-h-[calc(100vh-120px)] bg-slate-50/50 border-r border-slate-200/80 flex flex-col" data-testid="distributor-sidebar">
      {/* Distributor Quick Info */}
      <div className="p-5 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
            {distributor?.distributor_name?.charAt(0) || 'D'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 text-sm truncate">
              {distributor?.distributor_name || 'Distributor'}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              {distributor?.distributor_code || '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-2">
            <div className="px-5 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {group.label}
              </span>
            </div>
            <div className="space-y-0.5 px-3">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const count = counts[item.id];
                
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    data-testid={`sidebar-nav-${item.id}`}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 group",
                      isActive 
                        ? "bg-emerald-50 text-emerald-700 border-l-[3px] border-emerald-600 -ml-[3px] pl-[calc(0.75rem+3px)]" 
                        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                    )}
                  >
                    <Icon 
                      className={cn(
                        "w-4 h-4 flex-shrink-0 transition-colors",
                        isActive ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-600"
                      )} 
                      strokeWidth={1.75}
                    />
                    <div className="flex-1 min-w-0">
                      <span className={cn(
                        "text-sm font-medium block",
                        isActive ? "text-emerald-800" : ""
                      )}>
                        {item.label}
                      </span>
                    </div>
                    {count !== undefined && count > 0 && (
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        isActive 
                          ? "bg-emerald-100 text-emerald-700" 
                          : "bg-slate-200/70 text-slate-500"
                      )}>
                        {count}
                      </span>
                    )}
                    {isActive && (
                      <ChevronRight className="w-4 h-4 text-emerald-500 flex-shrink-0" strokeWidth={2} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default DistributorSidebar;
