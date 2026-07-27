import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Compass, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6" data-testid="not-found-page">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Compass className="h-8 w-8 text-slate-400" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-800 dark:text-white">404</h1>
        <p className="mt-2 text-base text-slate-600 dark:text-slate-300 font-medium">Page not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or may have been moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => window.history.back()} data-testid="not-found-back-btn">
            <ArrowLeft className="h-4 w-4 mr-2" /> Go Back
          </Button>
          <Button asChild data-testid="not-found-home-btn">
            <Link to="/"><Home className="h-4 w-4 mr-2" /> Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
