import React from 'react';
import { Card } from '../components/ui/card';
import { ExternalLink } from 'lucide-react';

export default function SalesPortal() {
  return (
    <div className="space-y-6 h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-light mb-2">Sales Portal</h1>
          <p className="text-muted-foreground">Nyla Air Water Sales Platform</p>
        </div>
        <a 
          href="https://sales.nylaairwater.earth/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline flex items-center gap-2"
        >
          Open in New Tab
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <Card className="p-0 border rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
        <iframe
          src="https://sales.nylaairwater.earth/"
          title="Nyla Sales Portal"
          className="w-full h-full border-0"
          style={{ minHeight: '600px' }}
          allow="fullscreen"
        />
      </Card>
    </div>
  );
}
