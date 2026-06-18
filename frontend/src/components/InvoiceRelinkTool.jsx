import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { Link2, Loader2, Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import { accountsAPI } from '../utils/api';

const KEY_LABELS = {
  account_uuid: 'Account UUID',
  account_id_uuid: 'Account ID (UUID)',
  account_code: 'Account Code',
  zoho_customer_id: 'Zoho Customer ID',
  lead_uuid: 'Lead link',
  ca_lead_id: 'Lead ID',
  name_normalized: 'Name match (one-time bootstrap)',
};

export const InvoiceRelinkTool = () => {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(null); // 'preview' | 'applied'
  const [result, setResult] = useState(null);

  const run = async (dryRun) => {
    setLoading(true);
    try {
      const res = await accountsAPI.relinkInvoices(dryRun);
      setResult(res.data);
      setMode(dryRun ? 'preview' : 'applied');
      toast.success(
        dryRun
          ? `Preview ready — ${res.data.updated} invoice(s) would be relinked`
          : `Done — ${res.data.updated} invoice(s) relinked to accounts`
      );
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Relink failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card data-testid="invoice-relink-tool">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Relink Invoices to Accounts
        </CardTitle>
        <CardDescription>
          Stamps the stable Account ID onto invoices so every invoice shows on the
          correct account page. Matching is by ID (account id, Zoho customer, lead);
          company name is used only as a one-time fallback to bootstrap missing IDs.
          Run a preview first, then apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => run(true)}
            disabled={loading}
            data-testid="relink-preview-btn"
          >
            {loading && mode !== 'applied' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Preview changes
          </Button>
          <Button
            onClick={() => run(false)}
            disabled={loading || !result}
            data-testid="relink-apply-btn"
          >
            {loading && mode === 'applied' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Apply relink
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border p-4 space-y-3" data-testid="relink-result">
            <div className="flex items-center gap-2">
              <Badge variant={mode === 'applied' ? 'default' : 'secondary'}>
                {mode === 'applied' ? 'Applied' : 'Preview'}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Scanned {result.scanned} invoice(s)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label={mode === 'applied' ? 'Relinked' : 'Will relink'} value={result.updated} accent="text-emerald-600" />
              <Stat label="Already correct" value={result.already_linked} />
              <Stat label="Unresolved" value={result.unresolved_count} accent={result.unresolved_count ? 'text-amber-600' : ''} />
              <Stat label="Ambiguous name" value={result.ambiguous_name_count || 0} accent={result.ambiguous_name_count ? 'text-amber-600' : ''} />
            </div>

            {result.by_key && Object.keys(result.by_key).length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Matched by:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(result.by_key).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-xs">
                      {KEY_LABELS[k] || k}: {v}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {result.unresolved_count > 0 && (
              <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-md p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {result.unresolved_count} invoice(s) couldn't be matched by ID or name.
                  These usually need their Zoho customer / account mapping fixed.
                  {result.unresolved_sample?.length > 0 && (
                    <span className="block mt-1 font-mono text-xs">
                      e.g. {result.unresolved_sample.slice(0, 10).join(', ')}
                    </span>
                  )}
                </span>
              </div>
            )}

            {mode === 'preview' && result.updated > 0 && (
              <p className="text-sm text-muted-foreground">
                Looks good? Click <strong>Apply relink</strong> to save these changes.
              </p>
            )}
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

export default InvoiceRelinkTool;
