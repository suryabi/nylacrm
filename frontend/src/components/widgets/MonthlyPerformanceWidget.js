import React from 'react';
import { Card } from '../ui/card';
import { Target } from 'lucide-react';

export function MonthlyPerformanceWidget({ monthlyPerformance }) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Target className="h-5 w-5 text-primary" />
        Monthly Performance
      </h2>
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Target</span>
          <span className="font-medium">₹{((monthlyPerformance?.target || 0) / 100000).toFixed(1)}L</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Achieved</span>
          <span className="font-medium text-green-600">₹{((monthlyPerformance?.actual || 0) / 100000).toFixed(1)}L</span>
        </div>
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${Math.min(monthlyPerformance?.percentage || 0, 100)}%` }}
          />
        </div>
        <p className="text-center text-sm font-medium">
          {monthlyPerformance?.percentage || 0}% of target achieved
        </p>
      </div>
    </Card>
  );
}
