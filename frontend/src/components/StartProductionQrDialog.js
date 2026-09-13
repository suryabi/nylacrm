import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Printer, QrCode, RefreshCw, Factory } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const H = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

export const printStartProductionQr = (d) => {
  const w = window.open('', '_blank');
  if (!w) { toast.error('Pop-up blocked — allow pop-ups to print'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>Start Production QR</title><style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
    body { margin: 0; display: flex; flex-direction: column; align-items: center; padding-top: 10mm; }
    .sticker { width: 120mm; border: 2.5px solid #002FA7; border-radius: 5mm; overflow: hidden; }
    .head { background: #002FA7; color: #fff; text-align: center; padding: 5mm; }
    .head .kicker { font-size: 8pt; letter-spacing: 1.5px; opacity: 0.85; }
    .head .nm { font-size: 24pt; font-weight: 800; text-transform: uppercase; margin-top: 1mm; }
    .qrwrap { text-align: center; padding: 6mm 0 2mm; }
    .qrwrap img { width: 70mm; height: 70mm; }
    .scanline { text-align: center; font-size: 9.5pt; font-weight: 700; color: #002FA7; padding: 0 6mm 3mm; }
    ol { margin: 0; padding: 3mm 6mm 4mm 12mm; font-size: 10.5pt; color: #0f172a; }
    ol li { margin: 1mm 0; }
    .foot { background: #eef2ff; text-align: center; font-size: 8.5pt; color: #475569; padding: 2.5mm; }
  </style></head><body>
  <div class="sticker">
    <div class="head"><div class="kicker">PRODUCTION</div><div class="nm">Start Production</div></div>
    <div class="qrwrap"><img src="${d.qr}" alt="QR" /></div>
    <div class="scanline">SCAN · SIGN IN WITH FACE ID / PIN · PICK THE SKU</div>
    <ol>
      <li>Pre-production equipment checklist &amp; readings</li>
      <li>Start production → Stop production (crates)</li>
      <li>Post-production checklist → batch created</li>
    </ol>
    <div class="foot">Nyla Air Water · Production operators only (${d.operator_count} enabled) · Fix near the filling line</div>
  </div>
  <script>window.onload = function(){ window.print(); };</script></body></html>`);
  w.document.close();
};

// Tenant-wide QR that opens the Start Production flow on any phone.
export const StartProductionQrDialog = ({ open, onOpenChange }) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!open) return;
    setData(null);
    fetch(`${API_URL}/api/maintenance/start-production/sticker?origin=${encodeURIComponent(window.location.origin)}`, { headers: H() })
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).detail || 'Could not load QR'); return r.json(); })
      .then(setData).catch((e) => { toast.error(e.message); setData({ error: true }); });
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="start-production-qr-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-[#002FA7]" /> Start Production QR</DialogTitle>
          <DialogDescription>Scan → Face ID / PIN (Factory Staff flagged as Production operator) or app login → pick the SKU → guided run.</DialogDescription>
        </DialogHeader>
        {!data && <div className="py-8 text-center text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></div>}
        {data?.qr && (
          <div className="space-y-3">
            <img src={data.qr} alt="Start Production QR" className="mx-auto h-48 w-48 rounded-lg border bg-white" data-testid="start-production-qr-image" />
            <p className="text-[11px] text-center text-muted-foreground break-all">{data.url}</p>
            <p className={`text-xs text-center flex items-center justify-center gap-1 ${data.operator_count ? 'text-slate-600' : 'text-amber-700 font-semibold'}`} data-testid="start-production-operator-count">
              <Factory className="h-3.5 w-3.5" /> {data.operator_count} production operator{data.operator_count === 1 ? '' : 's'} enabled{data.operator_count ? '' : ' — flag staff under Factory Staff'}
            </p>
            <Button className="w-full bg-[#002FA7] hover:bg-blue-800 text-white" onClick={() => printStartProductionQr(data)} data-testid="start-production-qr-print"><Printer className="h-4 w-4 mr-2" /> Print QR sticker</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StartProductionQrDialog;
