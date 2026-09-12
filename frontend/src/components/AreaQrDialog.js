import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Printer, QrCode, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const stickerHtml = (a) => `
  <div class="sticker">
    <div class="head"><div class="kicker">AREA MAINTENANCE QR</div><div class="nm">${a.area_name}</div>
      <div class="tp">${[a.facility_name, a.floor_name].filter(Boolean).join(' › ')}</div></div>
    <div class="qrwrap"><img src="${a.qr}" alt="QR" /></div>
    <div class="scanline">SCAN TO SEE ALL EQUIPMENT IN THIS AREA &amp; COMPLETE TODAY'S MAINTENANCE</div>
    <table>
      <tr><td class="lbl">Facility</td><td class="val">${a.facility_name || ''}</td></tr>
      <tr><td class="lbl">Floor</td><td class="val">${a.floor_name || ''}</td></tr>
      <tr><td class="lbl">Area</td><td class="val">${a.area_name || ''}</td></tr>
      <tr><td class="lbl">Equipment</td><td class="val">${a.equipment_count} item${a.equipment_count === 1 ? '' : 's'} · ${a.scheduled_count} on a maintenance schedule</td></tr>
    </table>
    <div class="foot">Nyla Air Water · Area Maintenance QR · Fix this sticker at the area entrance</div>
  </div>`;

export const printAreaStickers = (areas) => {
  const w = window.open('', '_blank');
  if (!w) { toast.error('Pop-up blocked — allow pop-ups to print'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>Area QR Stickers</title><style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
    body { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 10mm; padding-top: 6mm; }
    .sticker { width: 110mm; border: 2.5px solid #0f766e; border-radius: 5mm; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
    .head { background: #0f766e; color: #fff; text-align: center; padding: 4mm 5mm; }
    .head .kicker { font-size: 8pt; letter-spacing: 1.5px; opacity: 0.85; }
    .head .nm { font-size: 20pt; font-weight: 800; letter-spacing: 0.3px; text-transform: uppercase; margin-top: 1mm; }
    .head .tp { font-size: 10pt; opacity: 0.9; margin-top: 1mm; }
    .qrwrap { text-align: center; padding: 5mm 0 2mm; }
    .qrwrap img { width: 62mm; height: 62mm; }
    .scanline { text-align: center; font-size: 9pt; font-weight: 700; color: #0f766e; padding: 0 6mm 3mm; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2.2mm 5mm; font-size: 10.5pt; border-top: 1px solid #d5e5e2; }
    .lbl { color: #64748b; font-weight: 700; width: 34%; text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.5px; }
    .val { font-weight: 700; color: #0f172a; }
    .foot { background: #ecfdf5; text-align: center; font-size: 8.5pt; color: #475569; padding: 2.5mm; }
  </style></head><body>${areas.map(stickerHtml).join('')}
  <script>window.onload = function(){ window.print(); };</script></body></html>`);
  w.document.close();
};

export const AreaQrDialog = ({ open, onOpenChange, authHeaders }) => {
  const [areas, setAreas] = useState(null);
  const [pre, setPre] = useState(null);

  useEffect(() => {
    if (!open) return;
    setAreas(null);
    fetch(`${API_URL}/api/maintenance/areas/stickers?origin=${encodeURIComponent(window.location.origin)}`, { headers: authHeaders() })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).detail || 'Could not load areas'); return r.json(); })
      .then((d) => setAreas(d.areas || []))
      .catch((e) => { toast.error(e.message); setAreas([]); });
    fetch(`${API_URL}/api/maintenance/pre-production/sticker?origin=${encodeURIComponent(window.location.origin)}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null)).then(setPre).catch(() => setPre(null));
  }, [open, authHeaders]);

  const printPre = () => pre && printAreaStickers([{ area_id: 'pre', area_name: 'Pre-Production Checklist', floor_name: 'Before every production run', facility_name: 'All facilities',
    equipment_count: pre.equipment_count, scheduled_count: pre.equipment_count, qr: pre.qr }]);

  const groups = (areas || []).reduce((acc, a) => {
    const k = `${a.facility_name} › ${a.floor_name}`;
    (acc[k] = acc[k] || []).push(a);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="area-qr-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-teal-700" /> Area & Checklist QR Stickers</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">Scanning an area QR lists every equipment in that area so staff can tick and complete today's maintenance in one go.</p>
        {pre && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2" data-testid="pre-production-qr-row">
            <img src={pre.qr} alt="" className="h-10 w-10 rounded border bg-white" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Pre-Production Checklist</p>
              <p className="text-xs text-muted-foreground">{pre.equipment_count} equipment marked "before every production run"</p>
            </div>
            <Button size="sm" variant="outline" onClick={printPre} disabled={!pre.equipment_count} data-testid="pre-production-qr-print"><Printer className="h-3.5 w-3.5 mr-1" /> Print</Button>
          </div>
        )}
        {areas === null && <div className="py-8 text-center text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>}
        {areas && areas.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground" data-testid="area-qr-empty">No areas defined yet — add floors and areas under Facilities.</p>}
        {areas && areas.length > 0 && (
          <>
            <Button className="w-full bg-teal-700 hover:bg-teal-800 text-white" onClick={() => printAreaStickers(areas)} data-testid="area-qr-print-all">
              <Printer className="h-4 w-4 mr-2" /> Print all {areas.length} area stickers
            </Button>
            <div className="space-y-3">
              {Object.entries(groups).map(([k, list]) => (
                <div key={k}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{k}</p>
                  <div className="rounded-lg border divide-y">
                    {list.map((a) => (
                      <div key={a.area_id} className="flex items-center gap-3 px-3 py-2" data-testid={`area-qr-row-${a.area_id}`}>
                        <img src={a.qr} alt="" className="h-10 w-10 rounded border" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{a.area_name}</p>
                          <p className="text-xs text-muted-foreground">{a.equipment_count} equipment · {a.scheduled_count} scheduled</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => printAreaStickers([a])} data-testid={`area-qr-print-${a.area_id}`}>
                          <Printer className="h-3.5 w-3.5 mr-1" /> Print
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AreaQrDialog;
