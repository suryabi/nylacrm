import React from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { TrendingUp } from 'lucide-react';

export function PipelineSummaryWidget({ pipeline }) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-primary" />
        Pipeline Summary
      </h2>
      <div className="space-y-2">
        {pipeline?.map(item => (
          <div key={item.status} className="flex items-center justify-between">
            <span className="text-sm capitalize">{item.status.replace(/_/g, ' ')}</span>
            <Badge variant="secondary">{item.count}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
