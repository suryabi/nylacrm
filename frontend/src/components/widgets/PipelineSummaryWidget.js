import React from 'react';
import { Card } from '../ui/card';
import { TrendingUp, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Dynamic color mapping based on status color field
const getStatusColor = (status, colorName) => {
  const colorMap = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    emerald: 'bg-emerald-500',
    yellow: 'bg-yellow-500',
    amber: 'bg-amber-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    indigo: 'bg-indigo-500',
    cyan: 'bg-cyan-500',
    teal: 'bg-teal-500',
    gray: 'bg-gray-500',
  };
  
  // If colorName is provided, use it
  if (colorName && colorMap[colorName]) {
    return colorMap[colorName];
  }
  
  // Fallback based on status name
  const statusColorMap = {
    new: 'bg-blue-500',
    contacted: 'bg-cyan-500',
    qualified: 'bg-emerald-500',
    proposal_internal_review: 'bg-purple-500',
    ready_to_share_proposal: 'bg-cyan-500',
    proposal_shared_with_customer: 'bg-orange-500',
    proposal: 'bg-amber-500',
    trial_in_progress: 'bg-indigo-500',
    negotiation: 'bg-orange-500',
    won: 'bg-green-500',
    lost: 'bg-red-500',
    not_qualified: 'bg-gray-500'
  };
  
  return statusColorMap[status] || 'bg-slate-400';
};

export function PipelineSummaryWidget({ pipeline }) {
  const navigate = useNavigate();
  const total = pipeline?.reduce((sum, item) => sum + item.count, 0) || 0;

  const handleStatusClick = (status) => {
    navigate(`/leads?status=${status}`);
  };

  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/50 dark:to-teal-900/30">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            My Pipeline
          </h2>
          <span className="text-xs text-muted-foreground">{total} leads</span>
        </div>
        
        {/* Visual Pipeline Bar */}
        {total > 0 && (
          <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden mb-4">
            {pipeline?.filter(item => item.count > 0).map((item, idx) => (
              <div
                key={item.status}
                className={`${getStatusColor(item.status, item.color)} transition-all duration-500 cursor-pointer hover:opacity-80`}
                style={{ width: `${(item.count / total) * 100}%` }}
                title={`${item.label || item.status}: ${item.count}`}
                onClick={() => handleStatusClick(item.status)}
              />
            ))}
          </div>
        )}
        
        {/* Status List - Show all statuses with counts */}
        <div className="space-y-2">
          {pipeline?.length > 0 ? (
            pipeline.map(item => (
              <div 
                key={item.status} 
                className="flex items-center justify-between text-sm group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
                onClick={() => handleStatusClick(item.status)}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(item.status, item.color)}`} />
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                    {item.label || item.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{item.count}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">No pipeline data</p>
          )}
        </div>
      </div>
    </Card>
  );
}
