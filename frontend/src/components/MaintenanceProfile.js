import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { CalendarDays, Printer, RefreshCw, CheckCircle2, XCircle, History, Camera, Plus } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('session_token')}`, 'Content-Type': 'application/json' });

const AuthPhoto = ({ src, alt }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let obj;
    fetch(src, { headers: { Authorization: `Bearer ${localStorage.getItem('session_token')}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => { obj = URL.createObjectURL(b); setUrl(obj); })
      .catch(() => {});
    return () => { if (obj) URL.revokeObjectURL(obj); };
  }, [src]);
  if (!url) return <div className="h-20 w-28 bg-slate-100 animate-pulse rounded" />;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={alt} className="h-20 w-28 object-cover rounded border" /></a>;
};

const buildSheetHtml = (sheet) => {
  const WD = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const cells = [];
  let schedIdx = 0;
  for (let i = 0; i < sheet.lead_blanks; i++) cells.push('<div class="cell blank"></div>');
  sheet.days.forEach((d) => {
    if (d.scheduled) {
      const alt = schedIdx % 2 === 0 ? 'due-a' : 'due-b';
      schedIdx += 1;
      cells.push(`<div class="cell due ${alt}">
        <div class="top"><span class="dn">${d.day}</span><img class="qr" src="${d.qr}" alt="QR" /></div>
        <div class="lbl">MAINT. DUE</div>
        <div class="sub">Scan today only</div>
        <div class="sig"><div class="sigline"></div><div class="siglbl">Initial after completion</div></div>
      </div>`);
    } else {
      cells.push(`<div class="cell"><div class="top"><span class="dn">${d.day}</span></div><div class="nom">No scheduled maintenance</div></div>`);
    }
  });
  const rows = Math.ceil((sheet.lead_blanks + sheet.days.length) / 7);
  return `<!DOCTYPE html><html><head><title>${sheet.equipment.name} — Maintenance Calendar ${sheet.month_label}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4 landscape;margin:7mm}
html,body{width:283mm}
body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#fff}
.banner{background:#2e5a8f;color:#fff;display:flex;justify-content:space-between;align-items:center;padding:5.5mm 7mm}
.banner h1{font-size:20px;letter-spacing:.5px;font-weight:800}
.banner .range{font-size:11px;font-weight:bold;letter-spacing:.5px;white-space:nowrap}
.meta{display:flex;gap:9mm;flex-wrap:wrap;font-size:11px;padding:4mm 7mm 3mm}
.meta b{color:#111}
.meta .loc-line{display:inline-block;min-width:36mm;border-bottom:1px solid #64748b;height:3.4mm;vertical-align:bottom}
.wrap{padding:0 7mm}
.grid{display:grid;grid-template-columns:repeat(7,1fr);border:1px solid #cbd5e1}
.dow{background:#1e2b3c;color:#fff;font-size:9.5px;font-weight:bold;text-align:center;padding:2.6mm 0;letter-spacing:.8px}
.cell{border:1px solid #d8dee7;min-height:${rows >= 6 ? 24 : 29}mm;padding:1.8mm;display:flex;flex-direction:column;background:#fff}
.cell.blank{background:#fff}
.cell.due-a{background:#e9eff6}
.cell.due-b{background:#f7fafc}
.top{display:flex;justify-content:space-between;align-items:flex-start;min-height:${rows >= 6 ? 12 : 15}mm}
.dn{font-size:13px;font-weight:800}
.qr{width:${rows >= 6 ? 13 : 15}mm;height:${rows >= 6 ? 13 : 15}mm}
.lbl{font-size:8.5px;font-weight:800;color:#1a7f4e;letter-spacing:.3px;margin-top:-${rows >= 6 ? 8 : 10}mm}
.sub{font-size:7px;color:#555;margin-top:.5mm}
.nom{font-size:7.5px;color:#94a3b8;margin-top:2mm}
.sig{margin-top:auto;padding-top:1.5mm}
.sigline{border-bottom:1px solid #475569;height:${rows >= 6 ? 3 : 4.5}mm;width:85%}
.siglbl{font-size:6.5px;color:#475569;margin-top:.6mm}
.ftr{display:flex;justify-content:space-between;gap:10mm;padding:2.5mm 7mm;font-size:9px;color:#475569}
@media print{.cell,.dow,.banner,.cell.due-a,.cell.due-b{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="banner">
  <h1>EQUIPMENT MAINTENANCE CALENDAR</h1>
  <div class="range">${sheet.month_label} &nbsp;|&nbsp; ${sheet.frequency_label.toUpperCase()} SCHEDULE</div>
</div>
<div class="meta">
  <div><b>Equipment ID:</b> ${sheet.equipment.id.slice(0, 8).toUpperCase()}</div>
  <div><b>Equipment Name:</b> ${sheet.equipment.name}</div>
  <div><b>Frequency:</b> ${sheet.frequency_label}</div>
  <div><b>Department/Location:</b> ${sheet.equipment.location ? sheet.equipment.location : '<span class="loc-line"></span>'}</div>
</div>
<div class="wrap">
<div class="grid">
  ${WD.map((w) => `<div class="dow">${w}</div>`).join('')}
  ${cells.join('')}
</div>
</div>
<div class="ftr">
  <div><b>Instructions:</b> Scan the QR code only on the printed maintenance date. Mark maintenance complete or incomplete and capture live, date-stamped photos. Sign on the line after completion — inspectors initial the same line during audits.</div>
  <div style="white-space:nowrap">${sheet.equipment.name} | ${sheet.month_label}</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
</body></html>`;
};

export const MaintenanceProfile = ({ equipment, onClose }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [printing, setPrinting] = useState(false);
  const [corrFor, setCorrFor] = useState(null);
  const [corrNote, setCorrNote] = useState('');
  const [corrStatus, setCorrStatus] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/maintenance/equipment/${equipment.id}/profile`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      setProfile(await res.json());
    } catch { toast.error('Failed to load maintenance profile'); }
    finally { setLoading(false); }
  }, [equipment.id]);

  useEffect(() => { load(); }, [load]);

  const printSheet = async () => {
    setPrinting(true);
    try {
      const res = await fetch(`${API_URL}/api/maintenance/equipment/${equipment.id}/sheet?month=${month}&origin=${encodeURIComponent(window.location.origin)}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to generate sheet');
      const w = window.open('', '_blank');
      if (!w) throw new Error('Popup blocked — allow popups to print');
      w.document.write(buildSheetHtml(data));
      w.document.close();
    } catch (e) { toast.error(e.message); } finally { setPrinting(false); }
  };

  const submitCorrection = async () => {
    if (!corrNote.trim()) { toast.error('Correction note is required'); return; }
    const res = await fetch(`${API_URL}/api/maintenance/records/${corrFor}/correction`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ note: corrNote, corrected_status: corrStatus || null }),
    });
    if (!res.ok) { toast.error((await res.json()).detail || 'Failed'); return; }
    toast.success('Correction recorded in audit trail');
    setCorrFor(null); setCorrNote(''); setCorrStatus('');
    load();
  };

  const effectiveStatus = (r) => {
    const last = [...(r.corrections || [])].reverse().find((c) => c.corrected_status);
    return last ? last.corrected_status : r.status;
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="maintenance-profile-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Maintenance — {equipment.name}</DialogTitle>
          <DialogDescription>Schedule, printable QR sheet, records and audit trail</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : profile && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Schedule</p><p className="font-semibold" data-testid="mp-frequency">{profile.frequency_label}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Start Date</p><p className="font-semibold">{profile.maintenance_start_date || '—'}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Last Done</p><p className="font-semibold">{profile.last_maintenance_date || '—'}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Records</p><p className="font-semibold">{profile.stats.completed} done · {profile.stats.incomplete} incomplete</p></div>
            </div>

            <div className="rounded-lg border p-3">
              <p className="text-sm font-semibold mb-2">Upcoming maintenance dates</p>
              {profile.upcoming_dates.length === 0 ? <p className="text-xs text-muted-foreground">No schedule set — pick a maintenance frequency on the equipment first.</p> : (
                <div className="flex flex-wrap gap-1.5" data-testid="mp-upcoming">
                  {profile.upcoming_dates.map((d) => <Badge key={d} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{d}</Badge>)}
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3 flex flex-wrap items-end gap-2">
              <div>
                <p className="text-sm font-semibold mb-1">Printable QR maintenance sheet</p>
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-44" data-testid="mp-month-input" />
              </div>
              <Button onClick={printSheet} disabled={printing || !profile.frequency_days} data-testid="mp-print-btn">
                <Printer className="h-4 w-4 mr-2" />{printing ? 'Generating…' : 'Print Sheet'}
              </Button>
              <p className="text-[11px] text-muted-foreground w-full">Each scheduled date carries a unique QR code valid only on that day. Scanning opens the mobile check-in with camera-only, timestamped photos.</p>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><History className="h-4 w-4" /> Maintenance records & audit trail</p>
              {profile.records.length === 0 ? <p className="text-xs text-muted-foreground">No records yet — they appear here after a QR check-in is submitted.</p> : (
                <div className="space-y-2">
                  {profile.records.map((r) => (
                    <div key={r.id} className="rounded-lg border p-3 space-y-2" data-testid={`mp-record-${r.scheduled_date}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{r.scheduled_date}</span>
                        {effectiveStatus(r) === 'completed'
                          ? <Badge className="bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Complete</Badge>
                          : <Badge className="bg-amber-500"><XCircle className="h-3 w-3 mr-1" />Incomplete</Badge>}
                        {(r.corrections || []).some((c) => c.corrected_status) && <Badge variant="outline" className="text-[10px]">corrected — original: {r.status}</Badge>}
                        <span className="text-xs text-muted-foreground ml-auto">{r.performed_by} · {(r.completed_at || '').slice(0, 16).replace('T', ' ')}</span>
                      </div>
                      {r.remarks && <p className="text-xs text-muted-foreground">“{r.remarks}”</p>}
                      {(r.photos || []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {r.photos.map((p) => <AuthPhoto key={p.id} src={`${API_URL}/api/maintenance/records/${r.id}/photos/${p.id}`} alt={p.filename} />)}
                          <span className="text-[10px] text-muted-foreground self-end flex items-center gap-1"><Camera className="h-3 w-3" /> date/time stamped</span>
                        </div>
                      )}
                      {(r.corrections || []).length > 0 && (
                        <div className="border-l-2 border-slate-200 pl-2 space-y-1">
                          {r.corrections.map((c) => (
                            <p key={c.id} className="text-[11px] text-muted-foreground">
                              <b>Correction</b>{c.corrected_status ? ` (status → ${c.corrected_status})` : ''}: {c.note} — {c.corrected_by}, {(c.corrected_at || '').slice(0, 16).replace('T', ' ')}
                            </p>
                          ))}
                        </div>
                      )}
                      {corrFor === r.id ? (
                        <div className="space-y-2 bg-slate-50 rounded p-2">
                          <Textarea rows={2} placeholder="What is being corrected and why?" value={corrNote} onChange={(e) => setCorrNote(e.target.value)} data-testid="mp-corr-note" />
                          <div className="flex gap-2 items-center">
                            <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={corrStatus} onChange={(e) => setCorrStatus(e.target.value)} data-testid="mp-corr-status">
                              <option value="">Keep status</option>
                              <option value="completed">Correct to: Complete</option>
                              <option value="incomplete">Correct to: Incomplete</option>
                            </select>
                            <Button size="sm" onClick={submitCorrection} data-testid="mp-corr-save">Save Correction</Button>
                            <Button size="sm" variant="ghost" onClick={() => setCorrFor(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setCorrFor(r.id); setCorrNote(''); setCorrStatus(''); }} data-testid={`mp-add-corr-${r.scheduled_date}`}>
                          <Plus className="h-3 w-3 mr-1" /> Add correction
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">Original records and photos are immutable — corrections are appended with who/when for a complete audit trail.</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
