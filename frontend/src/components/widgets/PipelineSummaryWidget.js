import React from 'react';
import { Card } from '../ui/card';
import { TrendingUp, ChevronRight } from 'lucide-react';

const STATUS_COLORS = {
  new: 'bg-blue-500',
  contacted: 'bg-cyan-500',
  qualified: 'bg-emerald-500',
  proposal: 'bg-amber-500',
  negotiation: 'bg-orange-500',
  won: 'bg-green-500',
  lost: 'bg-red-500'
};

export function PipelineSummaryWidget({ pipeline }) {
  const total = pipeline?.reduce((sum, item) => sum + item.count, 0) || 0;

  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/50 dark:to-teal-900/30">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            Pipeline
          </h2>
          <span className="text-xs text-muted-foreground">{total} leads</span>
        </div>
        
        {/* Visual Pipeline Bar */}
        <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 flex overflow-hidden mb-4">
          {pipeline?.map((item, idx) => (
            <div
              key={item.status}
              className={`${STATUS_COLORS[item.status] || 'bg-slate-400'} transition-all duration-500`}
              style={{ width: `${total > 0 ? (item.count / total) * 100 : 0}%` }}
              title={`${item.status}: ${item.count}`}
            />
          ))}
        </div>
        
        {/* Status List */}
        <div className="space-y-2">
          {pipeline?.slice(0, 5).map(item => (
            <div key={item.status} className="flex items-center justify-between text-sm group cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 py-1 rounded-lg transition-colors">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[item.status] || 'bg-slate-400'}`} />
                <span className="capitalize text-muted-foreground group-hover:text-foreground transition-colors">
                  {item.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">{item.count}</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
