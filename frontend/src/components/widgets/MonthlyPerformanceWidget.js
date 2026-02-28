import React from 'react';
import { Card } from '../ui/card';
import { Target, TrendingUp, Award } from 'lucide-react';

export function MonthlyPerformanceWidget({ monthlyPerformance }) {
  const percentage = monthlyPerformance?.percentage || 0;
  const target = (monthlyPerformance?.target || 0) / 100000;
  const actual = (monthlyPerformance?.actual || 0) / 100000;
  
  // Color based on percentage
  const getProgressColor = () => {
    if (percentage >= 100) return 'from-emerald-500 to-green-500';
    if (percentage >= 75) return 'from-blue-500 to-indigo-500';
    if (percentage >= 50) return 'from-amber-500 to-orange-500';
    return 'from-red-500 to-rose-500';
  };

  return (
    <Card className="overflow-hidden border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-200/50 dark:shadow-slate-900/50">
      {/* Header */}
      <div className="p-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/30">
              <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            Monthly Performance
          </h2>
          {percentage >= 100 && (
            <Award className="h-5 w-5 text-amber-500" />
          )}
        </div>
        
        {/* Progress Circle */}
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                className="stroke-slate-100 dark:stroke-slate-800"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                className={`stroke-current text-indigo-500`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${Math.min(percentage, 100) * 0.88} 100`}
                style={{
                  transition: 'stroke-dasharray 0.5s ease-in-out'
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-slate-800 dark:text-white">{percentage}%</span>
            </div>
          </div>
          
          <div className="flex-1 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Target</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">₹{target.toFixed(1)}L</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Achieved</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">₹{actual.toFixed(1)}L</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom accent */}
      <div className={`h-1 bg-gradient-to-r ${getProgressColor()}`} />
    </Card>
  );
}
