import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { XCircle } from 'lucide-react';

export default function PaymentCancel() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="py-10 space-y-4" data-testid="payment-cancel-card">
          <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center"><XCircle className="w-8 h-8 text-slate-500" /></div>
          <h2 className="text-xl font-bold">Payment cancelled</h2>
          <p className="text-sm text-muted-foreground">No charge was made. You can upgrade anytime from the Billing page.</p>
          <Button asChild className="w-full" data-testid="payment-cancel-back"><Link to="/billing">Back to Billing</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
