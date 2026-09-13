import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Images, Download, Camera, Gauge, RefreshCw, X } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const H = () => ({ Authorization: `Bearer ${localStorage.getItem('session_token')}` });
const fmt = (s) => (s || '').slice(0, 16).replace('T', ' ');

const Thumb = ({ photo, onOpen }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let obj;
    fetch(`${API_URL}/api/maintenance/records/${photo.record_id}/photos/${photo.id}`, { headers: H() })
      .then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => { obj = URL.createObjectURL(b); setUrl(obj); }).catch(() => {});
    return () => { if (obj) URL.revokeObjectURL(obj); };
  }, [photo.record_id, photo.id]);
  return (
    <button type="button" onClick={() => url && onOpen({ ...photo, url })} className="text-left rounded-lg border bg-white overflow-hidden hover:shadow-md transition-shadow" data-testid={`gallery-photo-${photo.id}`}>
      {url ? <img src={url} alt={photo.filename} className="h-32 w-full object-cover" /> : <div className="h-32 w-full bg-slate-100 animate-pulse" />}
      <div className="p-2 space-y-0.5">
        <p className="text-[11px] font-semibold text-slate-800">{fmt(photo.captured_at)}</p>
        <p className="text-[10px] text-slate-500 truncate">{photo.captured_by}</p>
        <div className="flex flex-wrap gap-1">
          {photo.kind === 'parameter'
            ? <Badge variant="outline" className={`text-[9px] px-1 py-0 ${photo.alert ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}><Gauge className="h-2.5 w-2.5 mr-0.5" />{photo.parameter}{photo.option ? `: ${photo.option}` : ''}</Badge>
            : <Badge variant="outline" className="text-[9px] px-1 py-0 bg-sky-50 text-sky-700 border-sky-200"><Camera className="h-2.5 w-2.5 mr-0.5" />Inspection</Badge>}
          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${photo.record_status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{photo.record_status}</Badge>
        </div>
      </div>
    </button>
  );
};

// Per-equipment audit gallery: every inspection + parameter photo with capture date, who, record status; month/type filters; ZIP export.
export const MaintenancePhotoGallery = ({ equipmentId }) => {
  const [month, setMonth] = useState('');
  const [kind, setKind] = useState('');
  const [data, setData] = useState(null);
  const [zipping, setZipping] = useState(false);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    const q = new URLSearchParams(); if (month) q.set('month', month); if (kind) q.set('kind', kind);
    fetch(`${API_URL}/api/maintenance/equipment/${equipmentId}/photos?${q}`, { headers: H() }).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null));
  }, [equipmentId, month, kind]);
  useEffect(() => { load(); }, [load]);

  const downloadZip = async () => {
    setZipping(true);
    try {
      const q = new URLSearchParams(); if (month) q.set('month', month); if (kind) q.set('kind', kind);
      const r = await fetch(`${API_URL}/api/maintenance/equipment/${equipmentId}/photos.zip?${q}`, { headers: H() });
      if (!r.ok) throw new Error('Download failed');
      const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = (r.headers.get('content-disposition') || '').split('filename="')[1]?.replace('"', '') || 'photos.zip'; a.click();
      toast.success('Photo archive downloaded (with manifest.csv)');
    } catch (e) { toast.error(e.message); } finally { setZipping(false); }
  };

  if (!data) return <div className="text-xs text-muted-foreground flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Loading photos…</div>;
  return (
    <div className="rounded-lg border p-3 space-y-3" data-testid="mp-photo-gallery">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold flex items-center gap-1.5"><Images className="h-4 w-4" /> Photo gallery <span className="text-xs text-muted-foreground font-normal" data-testid="gallery-count">({data.photos.length} photo{data.photos.length === 1 ? '' : 's'})</span></p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" data-testid="gallery-month">
            <option value="">All months</option>{data.months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs" data-testid="gallery-kind">
            <option value="">All photos</option><option value="inspection">Inspection photos</option><option value="parameter">Parameter photos</option>
          </select>
          <Button size="sm" variant="outline" className="h-8" onClick={downloadZip} disabled={zipping || !data.photos.length} data-testid="gallery-zip"><Download className="h-3.5 w-3.5 mr-1" />{zipping ? 'Preparing…' : 'Download all (ZIP)'}</Button>
        </div>
      </div>
      {data.photos.length === 0 ? <p className="text-xs text-muted-foreground">No photos captured{month || kind ? ' for this filter' : ' yet'} — inspection and parameter-option photos appear here with their audit dates.</p> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {data.photos.map((p) => <Thumb key={p.id} photo={p} onOpen={setOpen} />)}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4" onClick={() => setOpen(null)} data-testid="gallery-lightbox">
          <button className="absolute top-4 right-4 text-white" aria-label="Close"><X className="h-6 w-6" /></button>
          <img src={open.url} alt={open.filename} className="max-h-[80vh] max-w-full object-contain rounded" />
          <p className="text-white/90 text-xs mt-3 text-center">{fmt(open.captured_at)} · {open.captured_by} · {open.kind === 'parameter' ? `${open.parameter}: ${open.option || ''}` : 'Inspection photo'} · record {open.record_status}{open.batch_code ? ` · batch ${open.batch_code}` : ''}</p>
        </div>
      )}
    </div>
  );
};

export default MaintenancePhotoGallery;
