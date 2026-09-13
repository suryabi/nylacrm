import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { AlertTriangle, Mail, Camera } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const H = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Daily alert digest (alert options + out-of-range readings) for one day — preview + manual send.
export const AlertDigestCard = ({ day }) => {
  const [data, setData] = useState(null);
  const [sending, setSending] = useState(false);
  const load = () => fetch(`${API_URL}/api/maintenance/alert-digest?date=${day}`, { headers: H() }).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, [day]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/maintenance/alert-digest/send?date=${day}`, { method: 'POST', headers: H() });
      const j = await res.json();
      if (!res.ok) throw new Error(j.detail || 'Failed to send');
      toast.success(j.sent ? `Alert digest sent to ${j.recipients} recipient(s) (${j.emails} email)` : `Not sent — ${j.reason}`);
      load();
    } catch (e) { toast.error(e.message); } finally { setSending(false); }
  };
  if (!data) return null;
  const n = data.items.reduce((a, i) => a + i.flags.length, 0);
  return (
    <div className={`rounded-xl border p-4 ${data.items.length ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-white'}`} data-testid="alert-digest-card">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${data.items.length ? 'text-rose-600' : 'text-slate-400'}`} /> Alert digest — {day}</p>
          <p className="text-xs text-muted-foreground" data-testid="alert-digest-summary">
            {data.items.length ? `${n} flag(s) on ${data.items.length} record(s): alert options + out-of-range readings.` : 'No alert options or out-of-range readings recorded this day.'}
            {data.sent && <span className="ml-1 text-emerald-700">Digest sent {(data.sent.sent_at || '').slice(0, 16).replace('T', ' ')} UTC to {data.sent.recipients} recipient(s).</span>}
            {!data.sent && ' Auto-sent daily at 9 PM IST to admins and the equipment supervisors.'}
          </p>
        </div>
        <Button variant="outline" className="h-9" onClick={send} disabled={sending || !data.items.length} data-testid="alert-digest-send"><Mail className="h-4 w-4 mr-2" />{sending ? 'Sending…' : 'Send Alert Digest'}</Button>
      </div>
      {data.items.length > 0 && (
        <ul className="mt-3 divide-y rounded-lg border bg-white" data-testid="alert-digest-items">
          {data.items.map((it) => (
            <li key={it.record_id} className="px-3 py-2 text-xs flex flex-wrap gap-x-3 gap-y-1">
              <span className="font-semibold text-slate-800">{it.equipment_name}</span>
              {it.loc && <span className="text-slate-500">{it.loc}</span>}
              <span className="text-slate-500">{it.performed_by} · {it.time}{it.batch_code ? ` · batch ${it.batch_code}` : ''}</span>
              <span className="w-full flex flex-wrap gap-1.5">
                {it.flags.map((f, i) => (
                  <span key={i} className={`px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${f.kind === 'alert' ? 'bg-rose-100 text-rose-800 border-rose-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                    {f.parameter ? `${f.parameter}: ` : ''}{f.value} {f.unit}{f.allowed ? ` (allowed ${f.allowed})` : ''}{f.photos ? <><Camera className="h-3 w-3" />{f.photos}</> : null}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AlertDigestCard;
