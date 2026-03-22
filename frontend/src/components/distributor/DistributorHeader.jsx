import React from 'react';
import { ArrowLeft, Edit2, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export const DistributorHeader = ({ 
  distributor, 
  onEdit, 
  canManage,
  isEditing,
  onSave,
  onCancel,
  saving
}) => {
  const navigate = useNavigate();
  
  const statusConfig = {
    active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    inactive: { label: 'Inactive', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    suspended: { label: 'Suspended', className: 'bg-amber-50 text-amber-700 border-amber-200' }
  };
  
  const status = statusConfig[distributor?.status] || statusConfig.inactive;

  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/60" data-testid="distributor-header">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/distributors')}
              className="p-2 -ml-2 rounded-lg hover:bg-slate-100 transition-colors"
              data-testid="back-to-distributors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" strokeWidth={1.75} />
            </button>
            
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-emerald-500/20">
                {distributor?.distributor_name?.charAt(0) || 'D'}
              </div>
              
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
                    {distributor?.distributor_name || 'Loading...'}
                  </h1>
                  <Badge variant="outline" className={status.className}>
                    {status.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm text-slate-500 font-medium">
                    {distributor?.distributor_code}
                  </span>
                  {distributor?.operating_coverage?.length > 0 && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="text-sm text-slate-500">
                        {distributor.operating_coverage.filter(c => c.status === 'active').length} cities
                      </span>
                    </>
                  )}
                  {distributor?.locations?.length > 0 && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="text-sm text-slate-500">
                        {distributor.locations.length} warehouse{distributor.locations.length > 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={onCancel}
                  disabled={saving}
                  className="text-slate-600"
                >
                  Cancel
                </Button>
                <Button
                  onClick={onSave}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            ) : (
              <>
                {canManage && (
                  <Button
                    variant="outline"
                    onClick={onEdit}
                    className="border-slate-200 hover:bg-slate-50"
                    data-testid="edit-distributor-btn"
                  >
                    <Edit2 className="w-4 h-4 mr-2" strokeWidth={1.75} />
                    Edit
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-slate-500">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem>Download Report</DropdownMenuItem>
                    <DropdownMenuItem>View History</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default DistributorHeader;
