import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const [state, setState] = useState('checking'); // checking | paid | timeout | error
  const attempts = useRef(0);

  useEffect(() => {
    if (!sessionId) { setState('error'); return; }
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      attempts.current += 1;
      try {
        const r = await axios.get(`${API}/billing/status/${sessionId}`);
        if (r.data.payment_status === 'paid') { setState('paid'); return; }
        if (['failed', 'expired'].includes(r.data.payment_status)) { setState('error'); return; }
      } catch (e) { /* keep polling */ }
      if (attempts.current >= 8) { setState('timeout'); return; }
      setTimeout(poll, 2000);
    };
    poll();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
      <Card className="w-full max-w-md text-center">
        <CardContent className="py-10 space-y-4" data-testid="payment-success-card">
          {state === 'checking' && (<>
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <h2 className="text-xl font-bold">Confirming your payment…</h2>
            <p className="text-sm text-muted-foreground">This usually takes a few seconds.</p>
          </>)}
          {state === 'paid' && (<>
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle className="w-8 h-8 text-emerald-600" /></div>
            <h2 className="text-xl font-bold">Payment successful!</h2>
            <p className="text-sm text-muted-foreground">Your workspace subscription is now active.</p>
            <Button asChild className="w-full" data-testid="payment-success-continue"><Link to="/home">Continue to Dashboard</Link></Button>
          </>)}
          {(state === 'timeout' || state === 'error') && (<>
            <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center"><AlertTriangle className="w-8 h-8 text-amber-600" /></div>
            <h2 className="text-xl font-bold">{state === 'timeout' ? 'Still processing' : 'Something went wrong'}</h2>
            <p className="text-sm text-muted-foreground">
              {state === 'timeout'
                ? 'Your payment is taking longer than expected. Check the Billing page in a minute — it will activate automatically.'
                : 'We could not confirm this payment. If you were charged, it will reflect shortly.'}
            </p>
            <Button asChild variant="outline" className="w-full"><Link to="/billing">Go to Billing</Link></Button>
          </>)}
        </CardContent>
      </Card>
    </div>
  );
}
