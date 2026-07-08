import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { SectionHeader } from '../detail/SectionHeader';
import { BookOpen, Download, Share2, RefreshCw, Loader2, AlertCircle, PlugZap } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const InfoState = ({ icon: Icon, title, message, testid }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6" data-testid={testid}>
    <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
      <Icon className="h-6 w-6 text-slate-400" />
    </div>
    <p className="text-sm font-semibold text-slate-700">{title}</p>
    <p className="text-sm text-muted-foreground mt-1 max-w-md">{message}</p>
  </div>
);

export const AccountZohoLedger = ({ accountId }) => {
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [sharing, setSharing] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const { data } = await axios.get(`${API_URL}/accounts/${accountId}/statement/status`, { headers: authHeader() });
      setStatus(data);
    } catch (e) {
      setStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }, [accountId]);

  const fetchPdf = useCallback(async () => {
    setPdfLoading(true);
    setPdfError(null);
    try {
      const res = await axios.get(`${API_URL}/accounts/${accountId}/statement/pdf`, {
        headers: authHeader(), responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      setPdfUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    } catch (e) {
      const status = e.response?.status;
      let msg = 'Could not load the statement from Zoho Books right now.';
      // Error responses arrive as a Blob (responseType='blob'); parse the JSON detail.
      try {
        if (e.response?.data instanceof Blob) {
          const text = await e.response.data.text();
          const parsed = JSON.parse(text);
          if (parsed?.detail) msg = parsed.detail;
        } else if (e.response?.data?.detail) {
          msg = e.response.data.detail;
        }
      } catch { /* fall back to generic msg */ }
      if (status === 502 && msg === 'Could not load the statement from Zoho Books right now.') {
        msg = 'Zoho Books did not return this statement. Please try again in a moment.';
      }
      setPdfError(msg);
    } finally {
      setPdfLoading(false);
    }
  }, [accountId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (status?.zoho_connected && status?.linked) fetchPdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.zoho_connected, status?.linked]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const handleDownload = async () => {
    try {
      const res = await axios.get(`${API_URL}/accounts/${accountId}/statement/pdf`, {
        headers: authHeader(), responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement_${(status?.account_name || 'customer').replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download statement');
    }
  };

  const handleWhatsApp = async () => {
    setSharing(true);
    try {
      const { data } = await axios.post(
        `${API_URL}/accounts/${accountId}/statement/share-link`,
        { base_url: process.env.REACT_APP_BACKEND_URL },
        { headers: { ...authHeader(), 'Content-Type': 'application/json' } },
      );
      if (data.whatsapp_url) {
        window.open(data.whatsapp_url, '_blank', 'noopener,noreferrer');
        toast.success('Statement link ready — WhatsApp opened');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create share link');
    } finally {
      setSharing(false);
    }
  };

  const ready = status?.zoho_connected && status?.linked;

  return (
    <Card id="acc-ledger" className="p-4 sm:p-6 scroll-mt-24" data-testid="account-ledger-section">
      <SectionHeader
        eyebrow="Zoho Books"
        title="Ledger / Statement"
        icon={BookOpen}
        testid="header-acc-ledger"
        actions={ready ? (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button size="sm" variant="outline" onClick={fetchPdf} disabled={pdfLoading} data-testid="ledger-refresh-btn">
              <RefreshCw className={`h-4 w-4 mr-1 ${pdfLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownload} data-testid="ledger-download-btn">
              <Download className="h-4 w-4 mr-1" /> Download PDF
            </Button>
            <Button size="sm" onClick={handleWhatsApp} disabled={sharing} className="bg-emerald-600 hover:bg-emerald-700" data-testid="ledger-whatsapp-btn">
              {sharing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Share2 className="h-4 w-4 mr-1" />} Share via WhatsApp
            </Button>
          </div>
        ) : null}
      />

      {loadingStatus ? (
        <div className="flex items-center justify-center py-12" data-testid="ledger-loading">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : !status?.zoho_connected ? (
        <InfoState
          icon={PlugZap}
          title="Zoho Books isn't connected"
          message="Connect Zoho Books in Settings → Integrations to pull this customer's statement of accounts."
          testid="ledger-not-connected"
        />
      ) : !status?.linked ? (
        <InfoState
          icon={AlertCircle}
          title="Account not linked to Zoho"
          message="This account isn't linked to a Zoho customer yet. Link it via the account's “Link Zoho Customer” action, then reload."
          testid="ledger-not-linked"
        />
      ) : pdfError ? (
        <div className="py-12 text-center" data-testid="ledger-pdf-error">
          <AlertCircle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{pdfError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={fetchPdf}>
            <RefreshCw className="h-4 w-4 mr-1" /> Retry
          </Button>
        </div>
      ) : pdfLoading && !pdfUrl ? (
        <div className="flex flex-col items-center justify-center py-12" data-testid="ledger-pdf-loading">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400 mb-2" />
          <p className="text-sm text-muted-foreground">Pulling live statement from Zoho…</p>
        </div>
      ) : pdfUrl ? (
        <iframe
          title="Zoho customer statement"
          src={pdfUrl}
          className="w-full h-[600px] rounded-lg border border-slate-200 bg-white"
          data-testid="ledger-pdf-frame"
        />
      ) : null}
    </Card>
  );
};

export default AccountZohoLedger;
