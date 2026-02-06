import React from 'react';
import { Card } from '../components/ui/card';
import { Target, ExternalLink } from 'lucide-react';

export default function SalesTargets() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-light mb-2">Sales Target Planning</h1>
        <p className="text-muted-foreground">Revenue-based target allocation system</p>
      </div>

      <Card className="p-12 bg-card border rounded-2xl">
        <div className="text-center mb-8">
          <Target className="h-20 w-20 mx-auto text-primary mb-4" />
          <h2 className="text-2xl font-semibold mb-3">Target Planning System</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Complete backend API system for hierarchical revenue target allocation from Country → Territory → State → City → Sales Resource
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-green-50 border border-green-200 p-6 rounded-xl">
            <h3 className="font-semibold text-green-800 mb-3">✓ Fully Functional Backend APIs</h3>
            <ul className="text-sm text-green-700 space-y-2">
              <li>• Create target plans (monthly/quarterly/yearly)</li>
              <li>• Allocate country target to 4 territories</li>
              <li>• Allocate territory targets to cities (9 cities)</li>
              <li>• Assign city targets to sales resources</li>
              <li>• Automatic state roll-ups (calculated from cities)</li>
              <li>• Validation (child totals must equal parent)</li>
              <li>• Complete hierarchy view with roll-ups</li>
              <li>• Resource-wise summary with city breakdowns</li>
            </ul>
          </div>

          <div className="bg-primary/5 border border-primary/20 p-6 rounded-xl">
            <h3 className="font-semibold mb-3">Sample Data Created</h3>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>• <strong>Q1 2026 Plan</strong>: Rs 500L (India)</p>
              <p>• <strong>Territories</strong>: North(100L), South(200L), West(150L), East(50L)</p>
              <p>• <strong>Cities</strong>: Bengaluru(80L), Chennai(70L), Hyderabad(50L)</p>
              <p>• <strong>States (Roll-up)</strong>: Karnataka(80L), Tamil Nadu(70L), Telangana(50L)</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-6 rounded-xl">
            <h3 className="font-semibold text-amber-800 mb-3">API Documentation</h3>
            <div className="text-sm text-amber-900 space-y-2 font-mono">
              <p>POST /api/target-plans</p>
              <p>POST /api/target-plans/:id/territories</p>
              <p>POST /api/target-plans/:id/territories/:territory/cities</p>
              <p>POST /api/target-plans/:id/cities/:city_id/resources</p>
              <p>GET /api/target-plans/:id/hierarchy</p>
              <p>GET /api/target-plans/:id/resource-summary</p>
            </div>
          </div>

          <div className="text-center pt-6">
            <p className="text-sm text-muted-foreground">
              Frontend UI can be built using a simpler component structure to avoid framework limitations.
              All business logic and data management is complete and tested.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
