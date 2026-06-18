import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { Wallet, Loader2, CheckCircle2 } from 'lucide-react';
import { accountsAPI } from '../utils/api';

const fmtINR = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

export const OutstandingBackfillTool = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const run = async () => {
    setLoading(true);
    try {
      const res = await accountsAPI.backfillSystemOutstanding();
      setResult(res.data);
      const added = res.data.total_added || 0;
      toast.success(
        added > 0
          ? `Added ${fmtINR(added)} across ${res.data.accounts_updated} account(s)`
          : 'Nothing to back-fill — all system invoices are already counted'
      );
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Back-fill failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card data-testid="outstanding-backfill-tool">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Back-fill System Invoice Outstanding
        </CardTitle>
        <CardDescription>
          Adds the net of every system-generated (company-billed) invoice that was
          previously not counted to its account&apos;s outstanding balance, and stamps
          each invoice&apos;s running balance. External-system invoices are left
          untouched. Safe to run more than once — already-counted invoices are skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={run} disabled={loading} data-testid="backfill-outstanding-btn">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Run back-fill
        </Button>

        {result && (
          <div className="rounded-lg border p-4 space-y-3" data-testid="backfill-result">
            <Badge variant="default">Done</Badge>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Accounts updated" value={result.accounts_updated} />
              <Stat label="Invoices counted" value={result.invoices_counted} />
              <Stat label="Total added" value={fmtINR(result.total_added)} accent="text-emerald-600" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, value, accent = '' }) => (
  <div className="rounded-md border p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`text-xl font-bold ${accent}`}>{value}</p>
  </div>
);

export default OutstandingBackfillTool;
