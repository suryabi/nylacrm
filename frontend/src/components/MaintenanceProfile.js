import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { CalendarDays, Printer, RefreshCw, CheckCircle2, XCircle, History, Camera, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ParamSummary } from './MaintenanceParams';
import { MaintenancePhotoGallery } from './MaintenancePhotoGallery';

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

const weekPage = (sheet) => {
  const rows = sheet.days.map((d) => {
    if (d.scheduled) {
      return `<tr class="due">
        <td class="datecell">
          <div class="dwrap">
            <img class="qr" src="${d.qr}" alt="QR" />
            <div class="dt">
              <div class="dn">${String(d.day).padStart(2, '0')}</div>
              <div class="wd">${d.weekday_label.toUpperCase()}</div>
              <div class="dl">${d.day_label}</div>
              <div class="due-lbl">MAINTENANCE DUE — scan QR on this date only</div>
            </div>
          </div>
        </td>
        <td class="sigcell"><div class="sigbox"></div><div class="siglbl">Operator name &amp; signature</div></td>
        <td class="sigcell"><div class="sigbox"></div><div class="siglbl">Inspector name &amp; signature</div></td>
      </tr>`;
    }
    return `<tr class="off">
      <td class="datecell">
        <div class="dwrap">
          <div class="noqr"></div>
          <div class="dt">
            <div class="dn dim">${String(d.day).padStart(2, '0')}</div>
            <div class="wd dim">${d.weekday_label.toUpperCase()}</div>
            <div class="dl dim">${d.day_label}</div>
            <div class="nom">No scheduled maintenance</div>
          </div>
        </div>
      </td>
      <td class="sigcell off"><div class="nom">—</div></td>
      <td class="sigcell off"><div class="nom">—</div></td>
    </tr>`;
  }).join('');
  return `<div class="page">
<div class="banner">
  <h1>WEEKLY MAINTENANCE SHEET</h1>
  <div class="range">${sheet.month_label} &nbsp;|&nbsp; ${sheet.frequency_label.toUpperCase()} SCHEDULE</div>
</div>
<div class="eqname">${sheet.equipment.name}</div>
<div class="meta">
  <div><b>Equipment ID:</b> ${sheet.equipment.id.slice(0, 8).toUpperCase()}</div>
  <div><b>Frequency:</b> ${sheet.frequency_label}</div>
  <div><b>Department/Location:</b> ${sheet.equipment.location ? sheet.equipment.location : '<span class="loc-line"></span>'}</div>
</div>
<table>
  <tr><th class="c1">DATE &amp; QR CODE</th><th class="c2">OPERATOR SIGNATURE</th><th class="c3">INSPECTOR SIGNATURE</th></tr>
  ${rows}
</table>
<div class="ftr">
  <div><b>Instructions:</b> Scan the QR code only on the printed maintenance date. Mark maintenance complete or incomplete and capture live, date-stamped photos. The operator signs after completion; the inspector signs during audits.</div>
  <div style="white-space:nowrap">${sheet.equipment.name} | ${sheet.month_label}</div>
</div>
</div>`;
};

const buildSheetDoc = (sheets, title) => `<!DOCTYPE html><html><head><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4 portrait;margin:5mm}
html,body{width:200mm}
body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;background:#fff}
.page{height:286mm;display:flex;flex-direction:column;page-break-after:always;overflow:hidden}
.page:last-child{page-break-after:auto}
.banner{background:#2e5a8f;color:#fff;display:flex;justify-content:space-between;align-items:center;padding:3.5mm 5mm}
.banner h1{font-size:18px;letter-spacing:.5px;font-weight:800}
.banner .range{font-size:13px;font-weight:bold;letter-spacing:.5px;white-space:nowrap}
.eqname{font-size:30px;font-weight:900;line-height:1.1;letter-spacing:.5px;color:#1e2b3c;text-transform:uppercase;padding:2.5mm 1mm 0;border-bottom:1.2mm solid #2e5a8f;padding-bottom:1.5mm}
.meta{display:flex;gap:8mm;flex-wrap:wrap;font-size:11px;padding:2.5mm 1mm}
.meta b{color:#111}
.meta .loc-line{display:inline-block;min-width:36mm;border-bottom:1px solid #64748b;height:3.4mm;vertical-align:bottom}
table{width:100%;border-collapse:collapse;flex:1}
th{background:#1e2b3c;color:#fff;font-size:11px;font-weight:bold;letter-spacing:.8px;padding:2.5mm 2mm;border:1px solid #1e2b3c}
th.c1{width:46%}th.c2{width:27%}th.c3{width:27%}
td{border:1.5px solid #94a3b8;vertical-align:middle;padding:2.5mm 3mm;height:31mm}
tr.due:nth-of-type(odd) td{background:#e9eff6}
tr.due:nth-of-type(even) td{background:#f7fafc}
tr.off td{background:#fafafa}
.dwrap{display:flex;align-items:center;gap:5mm}
.qr{width:27mm;height:27mm;flex-shrink:0}
.noqr{width:27mm;height:27mm;flex-shrink:0;border:1px dashed #cbd5e1;border-radius:2mm}
.dt{display:flex;flex-direction:column;gap:.6mm}
.dn{font-size:34px;font-weight:800;line-height:1}
.wd{font-size:15px;font-weight:800;letter-spacing:1px;color:#2e5a8f}
.dl{font-size:11px;color:#475569;font-weight:bold}
.due-lbl{font-size:9px;font-weight:800;color:#1a7f4e;letter-spacing:.3px;margin-top:1mm}
.dim{color:#b6bfca}
.wd.dim{color:#b6bfca}
.nom{font-size:10px;color:#94a3b8}
.sigcell{text-align:left}
.sigcell.off{text-align:center}
.sigbox{border-bottom:2px solid #475569;height:16mm}
.siglbl{font-size:9px;color:#475569;margin-top:1.5mm;font-weight:bold;letter-spacing:.3px}
.ftr{display:flex;justify-content:space-between;gap:8mm;padding:2mm 1mm 0;font-size:9px;color:#475569}
@media print{td,th,.banner,tr.due td,tr.off td{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
${sheets.map(weekPage).join('')}
<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>
</body></html>`;

export const MaintenanceProfile = ({ equipment, onClose }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weekDate, setWeekDate] = useState(new Date().toISOString().slice(0, 10));
  const [printing, setPrinting] = useState(false);
  const [printingMonth, setPrintingMonth] = useState(false);
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

  const fetchWeekSheet = async (dateStr) => {
    const res = await fetch(`${API_URL}/api/maintenance/equipment/${equipment.id}/sheet?week=${dateStr}&origin=${encodeURIComponent(window.location.origin)}`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to generate sheet');
    return data;
  };

  const openPrintWindow = (html) => {
    const w = window.open('', '_blank');
    if (!w) throw new Error('Popup blocked — allow popups to print');
    w.document.write(html);
    w.document.close();
  };

  const printSheet = async () => {
    setPrinting(true);
    try {
      const data = await fetchWeekSheet(weekDate);
      openPrintWindow(buildSheetDoc([data], `${equipment.name} — Maintenance Week ${data.month_label}`));
    } catch (e) { toast.error(e.message); } finally { setPrinting(false); }
  };

  const printMonth = async () => {
    setPrintingMonth(true);
    try {
      const ref = new Date(weekDate + 'T00:00:00');
      const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const monday = new Date(first);
      monday.setDate(first.getDate() - ((first.getDay() + 6) % 7));
      const mondays = [];
      for (let m = new Date(monday); m <= last; m.setDate(m.getDate() + 7)) {
        mondays.push(fmt(m));
      }
      const sheets = [];
      for (const d of mondays) sheets.push(await fetchWeekSheet(d));
      const label = first.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
      openPrintWindow(buildSheetDoc(sheets, `${equipment.name} — Maintenance ${label} (all ${sheets.length} weeks)`));
    } catch (e) { toast.error(e.message); } finally { setPrintingMonth(false); }
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
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Schedule</p><p className="font-semibold" data-testid="mp-frequency">{profile.frequency_label}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Start Date</p><p className="font-semibold">{profile.maintenance_start_date || '—'}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Last Done</p><p className="font-semibold">{profile.last_maintenance_date || '—'}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Records</p><p className="font-semibold">{profile.stats.completed} done · {profile.stats.incomplete} incomplete</p></div>
              <div className="rounded-lg border p-3" data-testid="mp-photo-insp">
                <p className="text-xs text-muted-foreground">Photo Inspections</p>
                <p className="font-semibold">{profile.photo_inspection?.per_month
                  ? `${profile.photo_inspection.done_this_month}/${profile.photo_inspection.per_month} this month`
                  : '—'}</p>
              </div>
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
                <p className="text-sm font-semibold mb-1">Printable weekly QR sheet <span className="font-normal text-xs text-muted-foreground">(Mon – Sun)</span></p>
                <Input type="date" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} className="h-9 w-44" data-testid="mp-week-input" title="Pick any date — the sheet covers that date's Monday-to-Sunday week" />
              </div>
              <Button onClick={printSheet} disabled={printing || printingMonth || !profile.frequency_days} data-testid="mp-print-btn">
                <Printer className="h-4 w-4 mr-2" />{printing ? 'Generating…' : 'Print Week Sheet'}
              </Button>
              <Button variant="outline" onClick={printMonth} disabled={printing || printingMonth || !profile.frequency_days} data-testid="mp-print-month-btn">
                <Printer className="h-4 w-4 mr-2" />{printingMonth ? 'Generating all weeks…' : 'Print Whole Month'}
              </Button>
              <p className="text-[11px] text-muted-foreground w-full">Pick any date — <b>Print Week Sheet</b> prints that date's Monday-to-Sunday week; <b>Print Whole Month</b> prints every week of that month in one go (one A4 page per week), each row with its QR code plus operator and inspector signature columns.</p>
            </div>

            <MaintenancePhotoGallery equipmentId={equipment.id} />

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
                      <ParamSummary record={r} testid={`mp-record-params-${r.id}`} />
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
