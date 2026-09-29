import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Calendar, Download, Eye, FileArchive, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HEAD = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const LogoThumbnail = ({ request }) => {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!request.logo?.id) { setFailed(true); return undefined; }
    let active = true;
    let objectUrl;
    axios.get(`${API}/design-requests-new/physical-sample-logos/${request.id}/thumbnail`, {
      headers: HEAD(), responseType: 'blob',
    }).then((response) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(response.data);
      setUrl(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [request.id, request.logo?.id]);

  return (
    <div className="flex aspect-[3/2] w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-white sm:w-40" data-testid={`physical-logo-thumbnail-${request.id}`}>
      {url ? (
        <img src={url} alt={`${request.lead_company || 'Customer'} logo`} className="h-full w-full object-contain p-2" />
      ) : failed ? (
        <div className="flex flex-col items-center gap-1 text-zinc-400">
          <FileArchive className="h-6 w-6" />
          <span className="text-[10px]">No preview</span>
        </div>
      ) : <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />}
    </div>
  );
};

const PhysicalSampleLogoView = ({ rows, navigate }) => {
  const downloadOriginal = async (request) => {
    if (!request.logo?.id) return;
    try {
      const response = await axios.get(`${API}/design-requests-new/files/${request.logo.id}`, { headers: HEAD(), responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = request.logo.filename || 'logo';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(url);
    } catch { toast.error('Logo download failed'); }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm" data-testid="physical-logo-view">
      <div className="flex flex-col gap-2 border-b border-zinc-200 bg-zinc-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
            <ImageIcon className="h-4 w-4 text-emerald-700" /> Physical Sample Logos
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500" data-testid="physical-logo-count">
            {rows.length} physical sample request{rows.length === 1 ? '' : 's'} in the current filters
          </p>
        </div>
        <p className="text-xs text-zinc-500">PDF and ZIP logo packs are previewed from their first usable page or image.</p>
      </div>

      {rows.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center gap-2 px-5 text-center" data-testid="physical-logo-empty">
          <ImageIcon className="h-10 w-10 text-zinc-300" />
          <p className="text-sm font-semibold text-zinc-700">No physical sample logos found</p>
          <p className="text-xs text-zinc-500">Adjust the queue, status, search, or team filters.</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100" data-testid="physical-logo-list">
          {rows.map((request) => (
            <article key={request.id} className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-emerald-50/30 sm:flex-row sm:items-center sm:px-5" data-testid={`physical-logo-row-${request.id}`}>
              <LogoThumbnail request={request} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900" data-testid={`physical-logo-name-${request.id}`}>
                    {request.lead_company || request.lead_name || request.title || 'Unassigned customer'}
                  </h3>
                  <Badge variant="outline" className="border-zinc-200 bg-white text-[10px] text-zinc-600" data-testid={`physical-logo-status-${request.id}`}>
                    {request.current_state_label || request.current_state_key || 'Unknown'}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-xs text-zinc-500" title={request.logo?.filename || 'No original logo attached'} data-testid={`physical-logo-file-${request.id}`}>
                  {request.logo?.filename || 'No original logo attached'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                  <span className="font-mono text-zinc-700" data-testid={`physical-logo-request-${request.id}`}>{request.request_number}</span>
                  <span className="inline-flex items-center gap-1" data-testid={`physical-logo-due-${request.id}`}><Calendar className="h-3 w-3" /> Due {request.requested_due_date || '—'}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate(`/design-requests-new/${request.id}`)} data-testid={`physical-logo-open-${request.id}`}>
                  <Eye className="mr-2 h-4 w-4" /> View
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadOriginal(request)} disabled={!request.logo?.id} data-testid={`physical-logo-download-${request.id}`}>
                  <Download className="mr-2 h-4 w-4" /> Original
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default PhysicalSampleLogoView;