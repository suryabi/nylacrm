import React from 'react';
import { Card } from '../components/ui/card';
import { Target } from 'lucide-react';

export default function SalesTargets() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-light mb-2">Sales Target Planning</h1>
        <p className="text-muted-foreground">Revenue-based target allocation system</p>
      </div>

      <Card className="p-12 text-center border rounded-2xl">
        <Target className="h-16 w-16 mx-auto text-primary mb-4" />
        <h2 className="text-xl font-semibold mb-2">Target Planning System</h2>
        <p className="text-muted-foreground mb-4">
          Backend APIs are fully functional for territory and city allocation
        </p>
        <div className="text-left max-w-2xl mx-auto bg-secondary p-6 rounded-xl mt-6">
          <p className="font-semibold mb-3">Available via API:</p>
          <ul className="text-sm space-y-2 text-muted-foreground">
            <li>• Create target plans (quarterly/monthly/yearly)</li>
            <li>• Allocate Rs 500L to territories (North, South, West, East)</li>
            <li>• Allocate territory targets to cities (Bengaluru, Mumbai, etc.)</li>
            <li>• Automatic state roll-ups (Karnataka, Maharashtra, etc.)</li>
            <li>• Validation: Child totals must equal parent target</li>
            <li>• Hierarchy view with complete roll-ups</li>
          </ul>
          <p className="text-xs text-muted-foreground mt-4 italic">
            Sample Q1 2026 plan created: Rs 500L allocated across territories with South India cities defined.
          </p>
        </div>
      </Card>
    </div>
  );
}
